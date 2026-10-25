import "server-only";

import { createRequire } from "node:module";
import type { PDFParse as PDFParseType } from "pdf-parse";

type PDFParseConstructor = typeof PDFParseType;

const nodeRequire = createRequire(import.meta.url);

export function createPdfParser(data: Uint8Array): PDFParseType {
  const { PDFParse } = nodeRequire("pdf-parse") as {
    PDFParse: PDFParseConstructor;
  };

  return new PDFParse({ data });
}

