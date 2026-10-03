import "server-only";

import type { NextRequest } from "next/server";

import { requestIdSchema } from "./schemas";

export function getRequestId(request: NextRequest): string {
  const candidate = request.headers.get("x-request-id");
  const parsed = requestIdSchema.safeParse(candidate);

  return parsed.success
    ? parsed.data
    : `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function getClientIp(request: NextRequest): string {
  // Vercel sets this from the edge. Trustworthy on Vercel.
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  if (vercelIp !== null && vercelIp.length > 0) {
    return vercelIp.split(",")[0]?.trim() ?? "unknown";
  }

  // Common header set by trusted reverse proxies.
  const realIp = request.headers.get("x-real-ip");
  if (realIp !== null && realIp.length > 0) {
    return realIp;
  }

  // Fallback. Trustworthy only if the platform sets it (Vercel, Cloudflare).
  // On a bare server, this can be spoofed by the client.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded !== null && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}
