import "server-only";

import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
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
const INGEST_TIMEOUT_MS = 5 * 60_000;
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

async function listCorpusFiles(
  directory: string,
  signal: AbortSignal,
): Promise<Array<string>> {
  signal.throwIfAborted();
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
    signal.throwIfAborted();

    if (entry.isDirectory()) {
      files.push(...await listCorpusFiles(entryPath, signal));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function isMissingPath(cause: unknown): boolean {
  return cause instanceof Error
    && "code" in cause
    && cause.code === "ENOENT";
}

function isInsideCorpus(corpusRoot: string, candidate: string): boolean {
  const relative = path.relative(corpusRoot, candidate);

  return relative !== ""
    && relative !== ".."
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

async function resolveCorpusRoot(signal: AbortSignal): Promise<string | null> {
  signal.throwIfAborted();

  try {
    const rootStat = await lstat(CORPUS_ROOT);

    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return null;
    }

    signal.throwIfAborted();
    return await realpath(CORPUS_ROOT);
  } catch (cause) {
    if (isMissingPath(cause)) {
      return null;
    }

    throw cause;
  }
}

async function extractPdfPages(
  data: Uint8Array,
  signal: AbortSignal,
): Promise<Array<CorpusPage>> {
  signal.throwIfAborted();
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();
    signal.throwIfAborted();
    return result.pages.map((page) => ({
      content: page.text,
      page: page.num,
    }));
  } finally {
    await parser.destroy();
  }
}

async function extractPages(
  filePath: string,
  signal: AbortSignal,
): Promise<Array<CorpusPage>> {
  const extension = path.extname(filePath).toLowerCase();
  const data = await readFile(filePath, { signal });

  if (extension === ".pdf") {
    return extractPdfPages(data, signal);
  }

  return [{ content: data.toString("utf8"), page: null }];
}

export async function ingestCorpus(
  signal?: AbortSignal,
): Promise<IngestionResult> {
  const controller = new AbortController();
  let didTimeout = false;
  const abortFromCaller = (): void => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, INGEST_TIMEOUT_MS);
  const combinedSignal = controller.signal;

  try {
    const corpusRoot = await resolveCorpusRoot(combinedSignal);

    if (corpusRoot === null) {
      return { documents: 0, chunks: 0, rejected: 0 };
    }

    const files = await listCorpusFiles(corpusRoot, combinedSignal);
    let documents = 0;
    let chunks = 0;
    let rejected = 0;

    for (const filePath of files) {
      combinedSignal.throwIfAborted();
      const extension = path.extname(filePath).toLowerCase();

      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        rejected += 1;
        continue;
      }

      let source: string;
      let sourceChunks: Array<{ content: string; page: number | null }>;

      try {
        const resolvedFilePath = await realpath(filePath);
        combinedSignal.throwIfAborted();

        if (!isInsideCorpus(corpusRoot, resolvedFilePath)) {
          rejected += 1;
          continue;
        }

        const fileStat = await stat(resolvedFilePath);
        combinedSignal.throwIfAborted();

        if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) {
          rejected += 1;
          continue;
        }

        source = path.relative(corpusRoot, resolvedFilePath)
          .split(path.sep)
          .join("/");
        const pages = await extractPages(resolvedFilePath, combinedSignal);
        sourceChunks = [];

        for (const page of pages) {
          combinedSignal.throwIfAborted();

          for (const chunk of chunkText(page.content)) {
            sourceChunks.push({ content: chunk.content, page: page.page });
          }
        }
      } catch (cause) {
        if (combinedSignal.aborted) {
          throw cause;
        }

        rejected += 1;
        continue;
      }

      if (sourceChunks.length === 0) {
        rejected += 1;
        continue;
      }

      const embeddings = await createEmbeddingsBatched(
        sourceChunks.map((chunk) => chunk.content),
        combinedSignal,
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

      await replaceDocumentChunks(source, documentChunks, combinedSignal);
      documents += 1;
      chunks += documentChunks.length;
    }

    return { documents, chunks, rejected };
  } catch (cause) {
    if (signal?.aborted && !didTimeout) {
      throw cause;
    }

    if (didTimeout) {
      // Ingestion exceeded the 5-minute budget. The client sent a valid
      // request; the server couldn't complete it. Treat as an internal error.
      throw new AppError("INTERNAL_ERROR", { cause, status: 503 });
    }

    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
