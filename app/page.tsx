"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import { ChatComposer } from "../components/chat-composer";
import { ChatMessage } from "../components/chat-message";
import { EmptyState } from "../components/empty-state";
import { ErrorState } from "../components/error-state";
import { MessageSkeleton } from "../components/message-skeleton";
import { createClientId } from "../lib/client-id";
import type { Citation } from "../lib/types";

type MessageRole = "user" | "assistant";

interface ChatMessageState {
  id: string;
  role: MessageRole;
  content: string;
  citations: ReadonlyArray<Citation>;
  complete: boolean;
}

interface SseEvent {
  event: string;
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSseEvent(block: string): SseEvent | null {
  let event = "";
  const dataLines: Array<string> = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (event.length === 0 || dataLines.length === 0) {
    return null;
  }

  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

function readDelta(data: unknown): string | null {
  return isRecord(data) && typeof data.text === "string"
    ? data.text
    : null;
}

function readCitations(data: unknown): ReadonlyArray<Citation> | null {
  if (!isRecord(data) || !Array.isArray(data.items)) {
    return null;
  }

  const citations: Array<Citation> = [];

  for (const item of data.items) {
    const page = isRecord(item) ? item.page : undefined;

    if (
      !isRecord(item)
      || typeof item.source !== "string"
      || !(page === null
        || (typeof page === "number"
          && Number.isInteger(page)
          && page > 0))
    ) {
      return null;
    }

    citations.push({ source: item.source, page });
  }

  return citations;
}

function readRequestId(data: unknown): string | null {
  return isRecord(data) && typeof data.requestId === "string"
    ? data.requestId
    : null;
}

function readErrorMessage(data: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return isRecord(data.error) && typeof data.error.message === "string"
    ? data.error.message
    : null;
}

async function getHttpErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    return readErrorMessage(body) ?? "The answer could not be loaded. Try again.";
  } catch {
    return "The answer could not be loaded. Try again.";
  }
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

function focusComposer(inputRef: RefObject<HTMLTextAreaElement>): void {
  requestAnimationFrame(() => inputRef.current?.focus());
}

export default function HomePage() {
  const [messages, setMessages] = useState<Array<ChatMessageState>>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }

    const scrollArea = scrollAreaRef.current;

    if (scrollArea === null) {
      return;
    }

    scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [messages, pending, error, autoScroll]);

  // Only auto-scroll when the user is already near the bottom.
  // If they scroll up to read earlier answers, respect that position.
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;

    if (scrollArea === null) {
      return;
    }

    const handleScroll = (): void => {
      const distanceFromBottom = scrollArea.scrollHeight
        - scrollArea.scrollTop
        - scrollArea.clientHeight;
      setAutoScroll(distanceFromBottom < 80);
    };

    scrollArea.addEventListener("scroll", handleScroll, { passive: true });

    return () => scrollArea.removeEventListener("scroll", handleScroll);
  }, []);

  const submitQuestion = useCallback(async (value: string): Promise<void> => {
    const normalizedQuestion = value.trim();

    if (normalizedQuestion.length === 0) {
      return;
    }

    abortControllerRef.current?.abort();

    const controller = new AbortController();
    const userMessageId = createClientId();
    const assistantMessageId = createClientId();
    let completed = false;

    abortControllerRef.current = controller;
    setPending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        content: normalizedQuestion,
        citations: [],
        complete: true,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        citations: [],
        complete: false,
      },
    ]);

    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      // The server generates and echoes the request ID. Do not echo a previous one.

      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({ question: normalizedQuestion }),
        signal: controller.signal,
      });

      const echoedRequestId = response.headers.get("X-Request-ID");

      if (echoedRequestId !== null) {
        setRequestId(echoedRequestId);
      }

      if (!response.ok) {
        throw new Error(await getHttpErrorMessage(response));
      }

      if (response.body === null) {
        throw new Error("The answer stream was unavailable. Try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        buffer = buffer.replaceAll("\r\n", "\n");

        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsedEvent = parseSseEvent(block);

          if (parsedEvent === null) {
            continue;
          }

          if (parsedEvent.event === "delta") {
            const text = readDelta(parsedEvent.data);

            if (text !== null) {
              setMessages((current) => current.map((message) => (
                message.id === assistantMessageId
                  ? { ...message, content: `${message.content}${text}` }
                  : message
              )));
            }
          } else if (parsedEvent.event === "citations") {
            const citations = readCitations(parsedEvent.data);

            if (citations !== null) {
              setMessages((current) => current.map((message) => (
                message.id === assistantMessageId
                  ? { ...message, citations }
                  : message
              )));
            }
          } else if (parsedEvent.event === "done") {
            const completedRequestId = readRequestId(parsedEvent.data);

            if (completedRequestId !== null) {
              setRequestId(completedRequestId);
            }

            setMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, complete: true }
                : message
            )));
            completed = true;
          } else if (parsedEvent.event === "error") {
            throw new Error(
              readErrorMessage(parsedEvent.data)
                ?? "The answer could not be loaded. Try again.",
            );
          }
        }

        if (done) {
          break;
        }
      }

      if (!completed) {
        throw new Error("The answer stream ended before completion. Try again.");
      }
    } catch (cause) {
      if (isAbortError(cause) || controller.signal.aborted) {
        return;
      }

      setMessages((current) => current.filter((message) => (
        message.id !== userMessageId && message.id !== assistantMessageId
      )));
      setError(
        cause instanceof Error
          ? cause.message
          : "The answer could not be loaded. Try again.",
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setPending(false);

        if (completed) {
          setQuestion("");
          focusComposer(composerRef);
        }
      }
    }
  }, []);

  const completedAnnouncement = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.complete)
    ?.content ?? "";

  return (
    <>
      <div ref={scrollAreaRef} className="message-scroll-area">
        <div className="message-list">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            // Future optimization: virtualize this list when message count > 50.
            // For v1, memoized ChatMessage components keep this fast enough.
            messages.map((message) => (
              message.role === "assistant"
                && !message.complete
                && message.content.length === 0
                ? <MessageSkeleton key={message.id} />
                : (
                    <ChatMessage
                      key={message.id}
                      role={message.role}
                      content={message.content}
                      citations={message.citations}
                    />
                  )
            ))
          )}

          {error !== null ? (
            <ErrorState
              message={error}
              requestId={requestId}
              onRetry={() => void submitQuestion(question)}
            />
          ) : null}
        </div>
      </div>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {completedAnnouncement}
      </div>

      <div className="chat-composer-shell">
        <ChatComposer
          inputRef={composerRef}
          value={question}
          pending={pending}
          onChange={setQuestion}
          onSubmit={submitQuestion}
        />
      </div>
    </>
  );
}
