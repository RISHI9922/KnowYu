import { memo } from "react";
import type { Citation } from "../lib/types";
import { CitationList } from "./citation-list";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  citations: ReadonlyArray<Citation>;
}

function ChatMessageInner({ role, content, citations }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`message-row message-row-${role}`}>
      <div
        className={`message-avatar message-avatar-${role}`}
        aria-hidden="true"
      >
        {isUser ? "🙂" : "📚"}
      </div>
      <div className={`message-bubble message-${role}`}>
        <p>{content}</p>
        {!isUser && <CitationList citations={citations} />}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner);
