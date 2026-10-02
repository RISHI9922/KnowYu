import { getEncoding } from "js-tiktoken";

import type { TextChunk } from "./types";

const DEFAULT_TARGET_TOKENS = 300;
const DEFAULT_OVERLAP_TOKENS = 50;
const HARD_MAX_TOKENS = 500;
const encoding = getEncoding("cl100k_base");

export interface ChunkTextOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

interface TextUnit {
  text: string;
  paragraphIndex: number;
}

function tokenCount(text: string): number {
  return encoding.encode(text).length;
}

function joinUnits(units: ReadonlyArray<TextUnit>): string {
  return units.reduce((content, unit, index) => {
    if (index === 0) {
      return unit.text;
    }

    const previous = units[index - 1];
    const separator = previous?.paragraphIndex === unit.paragraphIndex
      ? " "
      : "\n\n";
    return `${content}${separator}${unit.text}`;
  }, "");
}

function splitLongUnit(unit: TextUnit, hardMaxTokens: number): Array<TextUnit> {
  let remaining = unit.text;
  let tokens = encoding.encode(remaining);

  if (tokens.length <= hardMaxTokens) {
    return [unit];
  }

  const parts: Array<TextUnit> = [];

  while (tokens.length > hardMaxTokens) {
    const decoded = encoding.decode(tokens.slice(0, hardMaxTokens));
    const lastSpace = decoded.lastIndexOf(" ");
    const splitAt = lastSpace > 0 ? lastSpace : decoded.length;
    const text = decoded.slice(0, splitAt).trim();

    if (text.length > 0) {
      parts.push({
        text,
        paragraphIndex: unit.paragraphIndex,
      });
    }

    remaining = `${decoded.slice(splitAt)}${
      encoding.decode(tokens.slice(hardMaxTokens))
    }`.trimStart();
    tokens = encoding.encode(remaining);
  }

  if (remaining.trim().length > 0) {
    parts.push({
      text: remaining.trim(),
      paragraphIndex: unit.paragraphIndex,
    });
  }

  return parts.filter((part) => part.text.length > 0);
}

function toUnits(text: string, targetTokens: number): Array<TextUnit> {
  const paragraphs = text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);

  return paragraphs.flatMap((paragraph, paragraphIndex) => {
    // NOTE: naive sentence splitter. Fails on abbreviations (Dr., Fig. 3., etc.).
    // Accepted for v1. Affected sentences become slightly smaller chunks.
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/u)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    return sentences.flatMap((sentence) => splitLongUnit({
      text: sentence,
      paragraphIndex,
    }, HARD_MAX_TOKENS));
  });
}

function overlapUnits(
  units: ReadonlyArray<TextUnit>,
  _overlapTokens: number,
): Array<TextUnit> {
  if (units.length === 0) {
    return [];
  }

  const last = units[units.length - 1];
  return last ? [last] : [];
}

export function chunkText(
  text: string,
  options: ChunkTextOptions = {},
): Array<TextChunk> {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;

  if (
    !Number.isInteger(targetTokens)
    || !Number.isInteger(overlapTokens)
    || targetTokens <= 0
    || overlapTokens < 0
    || overlapTokens >= targetTokens
  ) {
    throw new RangeError(
      "targetTokens must be positive and overlapTokens must be smaller.",
    );
  }

  const units = toUnits(text, targetTokens);

  if (units.length === 0) {
    return [];
  }

  const chunks: Array<string> = [];
  let current: Array<TextUnit> = [];

  for (const unit of units) {
    const candidate = [...current, unit];

    if (current.length > 0 && tokenCount(joinUnits(candidate)) > targetTokens) {
      chunks.push(joinUnits(current));
      current = overlapUnits(current, overlapTokens);

      while (
        current.length > 0
        && tokenCount(joinUnits([...current, unit])) > targetTokens
      ) {
        current.shift();
      }
    }

    current.push(unit);
  }

  if (current.length > 0) {
    chunks.push(joinUnits(current));
  }

  return chunks
    .filter((content) => content.trim().length > 0)
    .map((content, chunkIndex) => ({
      content,
      chunkIndex,
    }));
}
