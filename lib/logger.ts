import "server-only";

import type { ApiErrorCode } from "./types";

type LogLevel = "info" | "warn" | "error";

export interface LogContext {
  requestId: string;
  operation: string;
  status?: string | number;
  durationMs?: number;
  errorCode?: ApiErrorCode;
  cause?: string;
  providerRequestId?: string;
  documentCount?: number;
  chunkCount?: number;
  rejectedFileCount?: number;
}

interface LogEntry extends LogContext {
  level: LogLevel;
  timestamp: string;
}

function write(level: LogLevel, context: LogContext): void {
  const entry: LogEntry = {
    ...context,
    level,
    timestamp: new Date().toISOString(),
  };
  const line = `${JSON.stringify(entry)}\n`;

  if (level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

export const logger = {
  info(context: LogContext): void {
    write("info", context);
  },
  warn(context: LogContext): void {
    write("warn", context);
  },
  error(context: LogContext): void {
    write("error", context);
  },
};
