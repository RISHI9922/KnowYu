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
  const realIp = request.headers.get("x-real-ip");

  if (realIp) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }

  return "unknown";
}
