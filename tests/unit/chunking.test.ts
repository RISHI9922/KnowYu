import { describe, expect, it } from "vitest";

import { chunkText } from "../../lib/chunking";

describe("chunkText", () => {
  it("returns no chunks when the normalized input is empty", () => {
    expect(chunkText(" \n\t ", { targetTokens: 300, overlapTokens: 50 }))
      .toEqual([]);
  });

  it("preserves complete sentences when paragraphs cross the target", () => {
    const text = Array.from(
      { length: 80 },
      (_, index) => `Policy sentence ${index + 1} has complete punctuation.`,
    ).join(" ");

    const chunks = chunkText(text, { targetTokens: 300, overlapTokens: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.endsWith("."))).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkIndex))
      .toEqual(chunks.map((_, index) => index));
  });

  it("keeps a single overlong sentence without losing text", () => {
    const sentence = `${"word ".repeat(700).trim()}.`;
    expect(chunkText(sentence, { targetTokens: 300, overlapTokens: 50 })
      .map((chunk) => chunk.content).join(" "))
      .toContain("word");
  });

  it("accepts the known abbreviation limitation without losing text", () => {
    const text = "Dr. Smith works here. See Fig. 3. The diagram shows the flow.";
    const content = chunkText(text).map((chunk) => chunk.content).join(" ");

    expect(content).toBe(text);
  });

  it("splits a 700-token sentence only at word boundaries", () => {
    const sentence = `${"word ".repeat(700).trim()}.`;
    const chunks = chunkText(sentence);
    const words = chunks.flatMap((chunk) => chunk.content.split(/\s+/));

    expect(chunks.length).toBeGreaterThan(1);
    expect(words).toHaveLength(700);
    expect(words.every((word, index) => (
      index === words.length - 1 ? word === "word." : word === "word"
    ))).toBe(true);
  });

  it("preserves NFC Unicode without compatibility normalization", () => {
    const text = "café, naïve, ½ cup, x² + y²";

    expect(chunkText(text)[0]?.content).toBe(text);
  });

  it.each(["", "   \n\t  "])(
    "returns no chunks for empty or whitespace-only input",
    (text) => {
      expect(chunkText(text)).toEqual([]);
    },
  );

  it("returns one chunk when content is shorter than the overlap", () => {
    expect(chunkText("Short policy.", {
      targetTokens: 300,
      overlapTokens: 50,
    })).toEqual([{ content: "Short policy.", chunkIndex: 0 }]);
  });
});
