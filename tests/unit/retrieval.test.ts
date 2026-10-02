import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../lib/openai", () => ({
  createEmbeddings: vi.fn(),
  generateAnswer: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  matchDocuments: vi.fn(),
}));

import { createEmbeddings, generateAnswer } from "../../lib/openai";
import { SYSTEM_PROMPT } from "../../lib/prompts";
import { answerQuestion } from "../../lib/retrieval";
import { matchDocuments } from "../../lib/supabase";
import type { DocumentMatch } from "../../lib/types";

const createEmbeddingsMock = vi.mocked(createEmbeddings);
const generateAnswerMock = vi.mocked(generateAnswer);
const matchDocumentsMock = vi.mocked(matchDocuments);

function document(overrides: Partial<DocumentMatch> = {}): DocumentMatch {
  return {
    id: "e3b28b27-252d-4c2c-a389-18a49163c876",
    content: "Employees receive 20 days of annual leave.",
    source: "handbook.pdf",
    page: 12,
    chunkIndex: 0,
    similarity: 0.9,
    ...overrides,
  };
}

describe("answerQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmbeddingsMock.mockResolvedValue([Array(1_536).fill(0.01)]);
  });

  it("refuses when no chunks pass the database threshold", async () => {
    matchDocumentsMock.mockResolvedValue([]);

    await expect(answerQuestion("Question", { requestId: "req-1" }))
      .rejects.toMatchObject({ code: "NO_RELEVANT_DOCS" });
    expect(generateAnswerMock).not.toHaveBeenCalled();
  });

  it("refuses when every generated citation fails verification", async () => {
    matchDocumentsMock.mockResolvedValue([document()]);
    generateAnswerMock.mockResolvedValue({
      answer: "Unsupported answer.",
      citations: [{ source: "invented.pdf", page: 99 }],
    });

    await expect(answerQuestion("Question", { requestId: "req-2" }))
      .resolves.toEqual({
        answer: "I don't know based on the provided documents.",
        citations: [],
      });
  });

  it("returns the refusal when the model produces the exact refusal", async () => {
    matchDocumentsMock.mockResolvedValue([document()]);
    generateAnswerMock.mockResolvedValue({
      answer: "I don't know based on the provided documents.",
      citations: [],
    });

    await expect(answerQuestion("Question", { requestId: "req-3" }))
      .resolves.toEqual({
        answer: "I don't know based on the provided documents.",
        citations: [],
      });
  });

  it("returns an answer when retrieved citations verify", async () => {
    matchDocumentsMock.mockResolvedValue([document()]);
    generateAnswerMock.mockResolvedValue({
      answer: "Employees receive 20 days of annual leave.",
      citations: [{ source: "handbook.pdf", page: 12 }],
    });

    await expect(answerQuestion("How much leave is provided?", {
      requestId: "req-4",
    })).resolves.toEqual({
      answer: "Employees receive 20 days of annual leave.",
      citations: [{ source: "handbook.pdf", page: 12 }],
    });
  });

  it("skips an oversized chunk and uses the next smaller chunk", async () => {
    matchDocumentsMock.mockResolvedValue([
      document({
        content: "oversized ".repeat(2_500),
        source: "oversized.pdf",
        page: 1,
      }),
      document({
        id: "63cc1699-f36a-46cd-884e-412446352b66",
        content: "Small relevant policy.",
        source: "small.pdf",
        page: 2,
        chunkIndex: 1,
      }),
    ]);
    generateAnswerMock.mockResolvedValue({
      answer: "Small relevant policy.",
      citations: [{ source: "small.pdf", page: 2 }],
    });

    await expect(answerQuestion("Question", { requestId: "req-5" }))
      .resolves.toMatchObject({ answer: "Small relevant policy." });
    expect(generateAnswerMock).toHaveBeenCalledWith(
      SYSTEM_PROMPT,
      expect.not.stringContaining("oversized.pdf"),
      undefined,
    );
    expect(generateAnswerMock).toHaveBeenCalledWith(
      SYSTEM_PROMPT,
      expect.stringContaining("small.pdf"),
      undefined,
    );
  });
});
