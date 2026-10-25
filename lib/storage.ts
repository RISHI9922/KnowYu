import "server-only";

import { createHash } from "node:crypto";

import { AppError } from "./errors";
import { supabaseService } from "./supabase";

const BUCKET = "corpus-files";

export async function uploadCorpusFile(
  file: File,
  signal?: AbortSignal,
): Promise<{ storagePath: string; contentHash: string; sizeBytes: number }> {
  signal?.throwIfAborted();
  const buffer = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const hash = createHash("sha256").update(buffer).digest("hex");

  const { data: existing, error: lookupError } = await supabaseService
    .from("corpus_files")
    .select("id, original_filename")
    .eq("content_hash", hash)
    .maybeSingle();

  if (lookupError !== null) {
    throw new AppError("INTERNAL_ERROR", { cause: lookupError });
  }

  if (existing !== null) {
    throw new AppError("INVALID_INPUT", {
      message: `Already uploaded as "${existing.original_filename}"`,
    });
  }

  const uuid = crypto.randomUUID();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${uuid}.${ext}`;
  const { error } = await supabaseService.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error !== null) {
    throw new AppError("INTERNAL_ERROR", { cause: error });
  }

  return { storagePath, contentHash: hash, sizeBytes: buffer.byteLength };
}
