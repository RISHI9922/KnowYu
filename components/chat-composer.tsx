"use client";

import {
  useDeferredValue,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { ArrowUp, Paperclip } from "lucide-react";

interface ChatComposerProps {
  inputRef: RefObject<HTMLTextAreaElement>;
  value: string;
  pending: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void> | void;
}

export function ChatComposer({
  inputRef,
  value,
  pending,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const deferredValue = useDeferredValue(value);
  const isEmpty = deferredValue.trim().length === 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending || isEmpty) return;
    void onSubmit(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (
      event.key === "Enter"
      && !event.shiftKey
      && !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form className="chat-composer" onSubmit={handleSubmit}>
      <div className="composer-pill">
        <textarea
          id="question"
          ref={inputRef}
          className="composer-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Type a new message here"
          rows={1}
          disabled={pending}
          maxLength={2_000}
          onKeyDown={handleKeyDown}
          aria-label="Ask a question"
        />
        <div className="composer-actions">
          <button
            type="button"
            className="composer-icon-button"
            aria-label="Attach a file"
            disabled
          >
            <Paperclip size={20} strokeWidth={1.5} />
          </button>
          <button
            type="submit"
            className="composer-send"
            disabled={pending || isEmpty}
            aria-label="Send"
          >
            <ArrowUp size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </form>
  );
}
