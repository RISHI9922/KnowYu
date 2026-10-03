export function MessageSkeleton() {
  return (
    <div
      className="message-skeleton"
      role="status"
      aria-label="Thinking about your question"
    >
      <div className="thinking-indicator" aria-hidden="true">
        <span className="thinking-sphere" />
        <span className="thinking-label">Thinking</span>
      </div>
      <div className="skeleton-line" aria-hidden="true" />
      <div className="skeleton-line" aria-hidden="true" />
      <div
        className="skeleton-line skeleton-line-short"
        aria-hidden="true"
      />
    </div>
  );
}
