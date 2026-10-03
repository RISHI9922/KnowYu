export function MessageSkeleton() {
  return (
    <div
      className="message-skeleton"
      role="status"
      aria-label="Thinking about your question"
    >
      <div className="skeleton-line" aria-hidden="true" />
      <div className="skeleton-line" aria-hidden="true" />
      <div
        className="skeleton-line skeleton-line-short"
        aria-hidden="true"
      />
    </div>
  );
}
