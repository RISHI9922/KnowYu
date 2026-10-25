import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { chunkText } from "../../../../lib/chunking";
import { env } from "../../../../lib/env";
import { AppError, toHttpStatus, toPublicError } from "../../../../lib/errors";
import { logger } from "../../../../lib/logger";
import { createEmbeddingsBatched } from "../../../../lib/openai";
import { createPdfParser } from "../../../../lib/pdf";
import { getRequestId } from "../../../../lib/request";
import { uploadCorpusFile } from "../../../../lib/storage";
import { replaceDocumentChunks, supabaseService } from "../../../../lib/supabase";
import type { ApiFailure } from "../../../../lib/types";

export const runtime = "nodejs";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 20 * 1_024 * 1_024;
const MAX_REQUEST_BYTES = 25 * 1_024 * 1_024;
const PDF_PREFIX = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const DOUBLE_EXTENSION = /\.[a-z0-9]+\.[a-z0-9]+$/i;

interface AcceptedFile {
  id: string;
  filename: string;
  size: number;
  hash: string;
}

interface RejectedFile {
  filename: string;
  reason: string;
}

function tokenHash(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function authenticate(request: NextRequest): string {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const provided = tokenHash(token);
  const expected = tokenHash(env.ingestAdminToken);

  if (!timingSafeEqual(provided, expected)) {
    throw new AppError("UNAUTHORIZED");
  }

  return provided.toString("hex");
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function validateMetadata(file: File): string | null {
  const filename = file.name.normalize("NFC");

  if (
    !SAFE_FILENAME.test(filename)
    || filename.includes("..")
    || WINDOWS_RESERVED.test(filename)
    || DOUBLE_EXTENSION.test(filename)
  ) {
    return "invalid_filename";
  }

  const extension = extensionOf(filename);

  if (![".pdf", ".md", ".markdown"].includes(extension)) {
    return "unsupported_extension";
  }

  const allowedMime = extension === ".pdf"
    ? file.type === "application/pdf"
    : file.type === "text/markdown" || file.type === "text/plain";

  if (!allowedMime) {
    return "unsupported_mime_type";
  }

  if (file.size === 0) {
    return "empty_file";
  }

  if (file.size > MAX_FILE_BYTES) {
    return "file_too_large";
  }

  return null;
}

async function validateContents(file: File): Promise<string | null> {
  const prefix = new Uint8Array(await file.slice(0, 4_096).arrayBuffer());
  const extension = extensionOf(file.name);

  if (extension === ".pdf") {
    const matches = PDF_PREFIX.every((byte, index) => prefix[index] === byte);
    return matches ? null : "magic_mismatch";
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(prefix);
    return text.trim().length > 0 ? null : "empty_file";
  } catch {
    return "invalid_utf8";
  }
}

async function ingestUploadedFile(
  file: File,
  userId: string,
  signal: AbortSignal,
): Promise<number> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pages: Array<{ content: string; page: number | null }> = [];

  if (extensionOf(file.name) === ".pdf") {
    const parser = createPdfParser(data);

    try {
      const result = await parser.getText();
      pages.push(...result.pages.map((page) => ({
        content: page.text,
        page: page.num,
      })));
    } finally {
      await parser.destroy();
    }
  } else {
    pages.push({ content: new TextDecoder().decode(data), page: null });
  }

  const chunks = pages.flatMap((page) => chunkText(page.content).map((chunk) => ({
    content: chunk.content,
    page: page.page,
  })));

  if (chunks.length === 0) {
    throw new AppError("INVALID_INPUT", { message: "The file has no readable text." });
  }

  const embeddings = await createEmbeddingsBatched(
    chunks.map((chunk) => chunk.content),
    signal,
  );

  if (embeddings.length !== chunks.length) {
    throw new AppError("EMBEDDING_FAILED");
  }

  await replaceDocumentChunks(file.name, chunks.map((chunk, chunkIndex) => ({
    content: chunk.content,
    embedding: embeddings[chunkIndex] ?? [],
    page: chunk.page,
    chunkIndex,
  })), userId, signal);

  return chunks.length;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const meta = { requestId, timestamp: new Date().toISOString() };

  try {
    const uploadedBy = authenticate(request);
    const userIdHeader = request.headers.get("X-User-Id");
    const userId = z.string().uuid().safeParse(userIdHeader);

    if (!userId.success) {
      throw new AppError("MISSING_FIELD", {
        message: "X-User-Id header (valid UUID) is required.",
      });
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new AppError("INVALID_INPUT", {
        message: "Content-Type must be multipart/form-data.",
      });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new AppError("DOCUMENT_TOO_LARGE");
    }

    const form = await request.formData();
    const files = form.getAll("files").filter(
      (value): value is File => value instanceof File,
    );

    if (files.length === 0) {
      throw new AppError("MISSING_FIELD", { message: "At least one file is required." });
    }

    if (files.length > MAX_FILES) {
      throw new AppError("INVALID_INPUT", { message: "At most 20 files are allowed." });
    }

    const accepted: Array<AcceptedFile> = [];
    const rejected: Array<RejectedFile> = [];
    let ingestedDocuments = 0;
    let ingestedChunks = 0;

    for (const file of files) {
      const metadataReason = validateMetadata(file);
      const reason = metadataReason ?? await validateContents(file);

      if (reason !== null) {
        rejected.push({ filename: file.name, reason });
        continue;
      }

      try {
        const uploaded = await uploadCorpusFile(file, request.signal);
        const { data, error } = await supabaseService
          .from("corpus_files")
          .insert({
            storage_path: uploaded.storagePath,
            original_filename: file.name,
            mime_type: file.type,
            size_bytes: uploaded.sizeBytes,
            content_hash: uploaded.contentHash,
            uploaded_by: uploadedBy,
          })
          .select("id")
          .single();

        if (error !== null) {
          await supabaseService.storage
            .from("corpus-files")
            .remove([uploaded.storagePath]);
          throw new AppError("INTERNAL_ERROR", { cause: error });
        }

        accepted.push({
          id: data.id,
          filename: file.name,
          size: uploaded.sizeBytes,
          hash: uploaded.contentHash,
        });

        try {
          const chunkCount = await ingestUploadedFile(
            file,
            userId.data,
            request.signal,
          );
          ingestedDocuments += 1;
          ingestedChunks += chunkCount;
        } catch (cause) {
          logger.warn({
            requestId,
            operation: "ingest_uploaded_file",
            status: "failed",
            cause: cause instanceof Error ? cause.name : "UnknownError",
          });
        }
      } catch (cause) {
        rejected.push({
          filename: file.name,
          reason: cause instanceof AppError && cause.code === "INVALID_INPUT"
            ? "duplicate"
            : "upload_failed",
        });
      }
    }

    return NextResponse.json({
      data: {
        accepted,
        rejected,
        ingested: { documents: ingestedDocuments, chunks: ingestedChunks },
      },
      error: null,
      meta,
    }, { status: accepted.length > 0 ? 201 : 200 });
  } catch (cause) {
    logger.error({
      requestId,
      operation: "upload_corpus",
      status: toHttpStatus(cause),
      errorCode: cause instanceof AppError ? cause.code : "INTERNAL_ERROR",
      cause: cause instanceof Error ? cause.name : "UnknownError",
    });
    const body: ApiFailure = { data: null, error: toPublicError(cause), meta };
    return NextResponse.json(body, { status: toHttpStatus(cause) });
  }
}

