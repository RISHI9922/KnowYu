import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildUserPrompt } from "../../lib/prompts";
import type { DocumentMatch } from "../../lib/types";

function document(overrides: Partial<DocumentMatch> = {}): DocumentMatch {
  return {
    id: "e3b28b27-252d-4c2c-a389-18a49163c876",
    content: "Policy content.",
    source: "handbook.pdf",
    page: 12,
    chunkIndex: 0,
    similarity: 0.9,
    ...overrides,
  };
}

describe("buildUserPrompt", () => {
  it("escapes XML special characters in the question", () => {
    const prompt = buildUserPrompt(`Is <leave> & "pay" 'covered'?`, []);

    expect(prompt).toContain(
      "Is &lt;leave&gt; &amp; &quot;pay&quot; &apos;covered&apos;?",
    );
  });

  it("escapes XML special characters in document content", () => {
    const prompt = buildUserPrompt("Question", [document({
      content: `<rule>Use A & B's "policy".</rule>`,
    })]);

    expect(prompt).toContain(
      "&lt;rule&gt;Use A &amp; B&apos;s &quot;policy&quot;.&lt;/rule&gt;",
    );
  });

  it("omits the page attribute when page is null", () => {
    const prompt = buildUserPrompt("Question", [document({ page: null })]);

    expect(prompt).toContain('<context source="handbook.pdf">');
    expect(prompt).not.toContain("page=");
  });

  it("includes the page attribute when page is set", () => {
    const prompt = buildUserPrompt("Question", [document({ page: 12 })]);

    expect(prompt).toContain('<context source="handbook.pdf" page="12">');
  });

  it("numbers contexts starting at one", () => {
    const prompt = buildUserPrompt("Question", [
      document(),
      document({ id: "63cc1699-f36a-46cd-884e-412446352b66" }),
    ]);

    expect(prompt).toContain('1. <context source="handbook.pdf"');
    expect(prompt).toContain('2. <context source="handbook.pdf"');
  });

  it("handles an empty document list", () => {
    const prompt = buildUserPrompt("Question", []);

    expect(prompt).toContain("<provided_context>\n\n</provided_context>");
  });
});
