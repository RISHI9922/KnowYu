import "server-only";

import { createHash } from "node:crypto";
import { getEncoding } from "js-tiktoken";

import { DAILY_BUDGET_USD, estimateChatCost } from "./costs";
import { AppError } from "./errors";
import { logger } from "./logger";
import { createEmbeddings, generateAnswer } from "./openai";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompts";
import { matchDocuments, supabaseService } from "./supabase";
import type { Citation, DocumentMatch } from "./types";

const MAX_TOTAL_TOKENS = 2_400;
const MAX_OUTPUT_TOKENS = 500;
const MAX_INPUT_TOKENS = MAX_TOTAL_TOKENS - MAX_OUTPUT_TOKENS - 10;
const REFUSAL_MESSAGE = "I don't know based on the provided documents.";
const encoding = getEncoding("cl100k_base");

export interface AnswerQuestionOptions {
  requestId: string;
  signal?: AbortSignal;
}

export interface AnswerQuestionResult {
  answer: string;
  citations: ReadonlyArray<Citation>;
}

function promptTokenCount(userPrompt: string): number {
  return encoding.encode(`${SYSTEM_PROMPT}\n${userPrompt}`).length;
}

function fitDocumentsToBudget(
  question: string,
  documents: ReadonlyArray<DocumentMatch>,
): ReadonlyArray<DocumentMatch> {
  const selected: Array<DocumentMatch> = [];

  for (const document of documents) {
    const candidate = [...selected, document];
    const userPrompt = buildUserPrompt(question, candidate);

    if (promptTokenCount(userPrompt) > MAX_INPUT_TOKENS) {
      continue;
    }

    selected.push(document);
  }

  if (selected.length === 0) {
    throw new AppError("NO_RELEVANT_DOCS");
  }

  return selected;
}

function verifyCitations(
  citations: ReadonlyArray<Citation>,
  documents: ReadonlyArray<DocumentMatch>,
  requestId: string,
): ReadonlyArray<Citation> {
  const allowed = new Set(
    documents.map((document) => `${document.source}\u0000${document.page ?? ""}`),
  );
  const verified = new Map<string, Citation>();

  for (const citation of citations) {
    const key = `${citation.source}\u0000${citation.page ?? ""}`;

    if (!allowed.has(key)) {
      logger.warn({
        requestId,
        operation: "verify_citations",
        status: "citation_removed",
        cause: "UnverifiedCitation",
      });
      continue;
    }

    verified.set(key, citation);
  }

  return [...verified.values()];
}

export async function retrieveDocuments(
  question: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<DocumentMatch>> {
  const [queryEmbedding] = await createEmbeddings([question], signal);

  if (queryEmbedding === undefined) {
    throw new AppError("EMBEDDING_FAILED");
  }

  const documents = await matchDocuments(queryEmbedding, signal);

  if (documents.length === 0) {
    throw new AppError("NO_RELEVANT_DOCS");
  }

  return documents;
}

async function checkDailyBudget(): Promise<void> {
  try {
    const { data, error } = await supabaseService.rpc("check_daily_budget", {
      p_limit_usd: DAILY_BUDGET_USD,
    });

    if (error !== null) {
      // Fail open. If the budget check fails, allow the request.
      return;
    }

    const row = data?.[0];
    if (row !== undefined && !row.allowed) {
      throw new AppError("RATE_LIMITED", {
        message: "Daily budget reached. Try again tomorrow.",
      });
    }
  } catch (cause) {
    if (cause instanceof AppError) {
      throw cause;
    }

    // Fail open. If the budget check fails, allow the request.
  }
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function answerQuestion(
  question: string,
  options: AnswerQuestionOptions,
): Promise<AnswerQuestionResult> {
  await checkDailyBudget();

  const retrievedDocuments = await retrieveDocuments(question, options.signal);
  const documents = fitDocumentsToBudget(question, retrievedDocuments);
  const userPrompt = buildUserPrompt(question, documents);
  const generated = await generateAnswer(
    SYSTEM_PROMPT,
    userPrompt,
    options.signal,
  );

  try {
    const inputTokens = encoding.encode(
      `${SYSTEM_PROMPT}\n${userPrompt}`,
    ).length;
    const outputTokens = encoding.encode(generated.answer).length;
    const costUsd = estimateChatCost(inputTokens, outputTokens);

    await supabaseService.from("usage_events").insert({
      event_type: "chat",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      question_hash: hashIdentifier(question),
      client_ip_hash: null,
    });
  } catch {
    // Do not fail the request if cost recording fails.
  }

  const citations = verifyCitations(
    generated.citations,
    documents,
    options.requestId,
  );

  if (citations.length === 0) {
    return { answer: REFUSAL_MESSAGE, citations: [] };
  }

  return {
    answer: generated.answer,
    citations,
  };
}
