import { z } from "zod";

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid().optional(),
}).strict();

// Ingest reads the entire /corpus directory. No body needed.
// Empty schema prevents clients from sending arbitrary fields.
export const ingestRequestSchema = z.object({}).strict();

export const requestIdSchema = z.string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const authorizationHeaderSchema = z.string()
  .regex(/^Bearer [^\s]+$/);

export const idempotencyKeySchema = z.string()
  .trim()
  .min(1)
  .max(200);

export const documentMatchRowSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  source: z.string().min(1),
  page: z.number().int().positive().nullable(),
  chunk_index: z.number().int().nonnegative(),
  similarity: z.number().min(0).max(1),
}).strict();

export const llmAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(4_000),
  citations: z.array(z.object({
    source: z.string().min(1),
    page: z.number().int().positive().nullable(),
  }).strict()).max(5),
}).strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type DocumentMatchRow = z.infer<typeof documentMatchRowSchema>;
export type LlmAnswer = z.infer<typeof llmAnswerSchema>;
