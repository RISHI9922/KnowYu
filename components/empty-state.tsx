interface EmptyStateProps {
  onQuestionSelect: (question: string) => void;
  sources?: ReadonlyArray<string>;
}

const EXAMPLE_QUESTIONS = [
  "How many leave days do I get?",
  "When does health coverage start?",
  "How do I request time off?",
] as const;

export function EmptyState({
  onQuestionSelect,
  sources = [],
}: EmptyStateProps) {
  const hasSources = sources.length > 0;

  return (
    <section className="empty-state" aria-labelledby="empty-state-heading">
      <div className="empty-state-copy">
        <h2 id="empty-state-heading">Ask about your documents</h2>
        <p>
          Get concise answers supported by citations from the provided
          documents. If the answer isn&apos;t in the provided documents,
          KnowYu refuses instead of guessing.
        </p>
      </div>

      {hasSources ? (
        <div className="empty-state-section">
          <p className="empty-state-label">Currently knows</p>
          <ul className="source-list">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="empty-state-section">
        <p className="empty-state-label">Try asking</p>
        <ul className="example-list">
          {EXAMPLE_QUESTIONS.map((question) => (
            <li key={question}>
              <button
                className="example-chip"
                type="button"
                onClick={() => onQuestionSelect(question)}
              >
                <span>{question}</span>
                <span aria-hidden="true" className="example-chip-arrow">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
