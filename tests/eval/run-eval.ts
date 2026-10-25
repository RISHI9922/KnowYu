import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { answerQuestion } from "../../lib/retrieval";

interface EvalQuestion {
  id: string;
  question: string;
  expectedFacts: string[];
  expectedSources: string[];
  answerable: boolean;
}

const questions: EvalQuestion[] = JSON.parse(
  readFileSync(join(__dirname, "questions.json"), "utf-8"),
);

const results = { correct: 0, refused: 0, hallucinated: 0, wrong: 0 };

describe("golden eval set", () => {
  for (const q of questions) {
    it(q.id, async () => {
      let result;

      try {
        result = await answerQuestion(q.question, { requestId: `eval-${q.id}` });
      } catch (cause) {
        const isRefusal = cause instanceof Error
          && ("code" in cause ? cause.code === "NO_RELEVANT_DOCS" : cause.message.includes("NO_RELEVANT"));

        if (!q.answerable && isRefusal) {
          results.refused++;
        } else {
          results.wrong++;
        }

        return;
      }

      if (!q.answerable) {
        if (result.citations.length === 0) {
          results.refused++;
        } else {
          results.hallucinated++;
        }
        return;
      }

      const answerLower = result.answer.toLowerCase();
      const hasFacts = q.expectedFacts.every((fact) => (
        answerLower.includes(fact.toLowerCase())
      ));
      const hasSources = q.expectedSources.every((source) => (
        result.citations.some((citation) => citation.source === source)
      ));

      if (hasFacts && hasSources) {
        results.correct++;
      } else {
        results.wrong++;
      }
    });
  }

  it("reports summary", () => {
    const total = questions.length;
    const answerable = questions.filter((question) => question.answerable).length;
    const unanswerable = total - answerable;

    console.log("\n========================================");
    console.log("EVAL SUMMARY");
    console.log("========================================");
    console.log(`Total questions: ${total}`);
    console.log(`Answerable: ${answerable}`);
    console.log(`Correct (with citation): ${results.correct}`);
    console.log(`Correctly refused: ${results.refused}`);
    console.log(`Hallucinated: ${results.hallucinated}`);
    console.log(`Wrong: ${results.wrong}`);
    console.log(`Grounded accuracy: ${((results.correct / answerable) * 100).toFixed(1)}%`);
    console.log(`Refusal precision: ${((results.refused / unanswerable) * 100).toFixed(1)}%`);
    console.log("========================================\n");

    expect(results.hallucinated).toBe(0);
    expect(results.correct / answerable).toBeGreaterThanOrEqual(0.85);
  });
});

