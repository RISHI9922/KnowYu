import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";

import { chunkText } from "./chunking";
import { AppError } from "./errors";
import { createEmbeddingsBatched } from "./openai";
import {
  replaceDocumentChunks,
  type DocumentChunkInput,
} from "./supabase";

const CORPUS_ROOT = path.resolve(process.cwd(), "corpus");
const MAX_FILE_BYTES = 20 * 1_024 * 1_024;
const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".pdf"]);

interface CorpusPage {
  content: string;
  page: number | null;
}

export interface IngestionResult {
  documents: number;
  chunks: number;
  rejected: number;
}

async function listCorpusFiles(directory: string): Promise<Array<string>> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    throw new AppError("NOT_FOUND", {
      message: "The corpus directory was not found.",
      cause,
    });
  }

  const files: Array<string> = [];

  for (const entry of entries.sort((left, right) => (
    left.name.localeCompare(right.name)
  ))) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listCorpusFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function extractPdfPages(data: Uint8Array): Promise<Array<CorpusPage>> {
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({
      content: page.text,
      page: page.num,
    }));
  } finally {
    await parser.destroy();
  }
}

async function extractPages(filePath: string): Promise<Array<CorpusPage>> {
  const extension = path.extname(filePath).toLowerCase();
  const data = await readFile(filePath);

  if (extension === ".pdf") {
    return extractPdfPages(data);
  }

  return [{ content: data.toString("utf8"), page: null }];
}

export async function ingestCorpus(
  signal?: AbortSignal,
): Promise<IngestionResult> {
  const files = await listCorpusFiles(CORPUS_ROOT);
  let documents = 0;
  let chunks = 0;
  let rejected = 0;

  for (const filePath of files) {
    const extension = path.extname(filePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      rejected += 1;
      continue;
    }

    const fileStat = await stat(filePath);

    if (fileStat.size > MAX_FILE_BYTES) {
      rejected += 1;
      continue;
    }

    const source = path.relative(CORPUS_ROOT, filePath).split(path.sep).join("/");
    const pages = await extractPages(filePath);
    const sourceChunks: Array<{ content: string; page: number | null }> = [];

    for (const page of pages) {
      for (const chunk of chunkText(page.content)) {
        sourceChunks.push({ content: chunk.content, page: page.page });
      }
    }

    if (sourceChunks.length === 0) {
      rejected += 1;
      continue;
    }

    const embeddings = await createEmbeddingsBatched(
      sourceChunks.map((chunk) => chunk.content),
      signal,
    );

    if (embeddings.length !== sourceChunks.length) {
      throw new AppError("EMBEDDING_FAILED");
    }

    const documentChunks: Array<DocumentChunkInput> = sourceChunks.map(
      (chunk, chunkIndex) => {
        const embedding = embeddings[chunkIndex];

        if (embedding === undefined) {
          throw new AppError("EMBEDDING_FAILED");
        }

        return {
          content: chunk.content,
          embedding,
          page: chunk.page,
          chunkIndex,
        };
      },
    );

    await replaceDocumentChunks(source, documentChunks, signal);
    documents += 1;
    chunks += documentChunks.length;
  }

  return { documents, chunks, rejected };
}
