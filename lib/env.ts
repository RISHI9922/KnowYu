import "server-only";

// Server-only. Do not import from client components.
// The "server-only" import enforces this at build time.

import { z } from "zod";

const urlSchema = z.string().url();

const envSchema = z.object({
  supabaseUrl: urlSchema,
  supabasePublicKey: z.string().min(1),
  supabaseServiceRoleKey: z.string().min(1),
  openAiApiKey: z.string().min(1),
  ingestAdminToken: z.string().min(43),
  upstashRedisUrl: urlSchema,
  upstashRedisToken: z.string().min(1),
  allowedOrigins: z.array(urlSchema).min(1),
}).strict();

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export const env = envSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  openAiApiKey: process.env.OPENAI_API_KEY,
  ingestAdminToken: process.env.INGEST_ADMIN_TOKEN,
  upstashRedisUrl: process.env.UPSTASH_REDIS_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_TOKEN,
  allowedOrigins,
});

export type Environment = z.infer<typeof envSchema>;
