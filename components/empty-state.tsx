interface EmptyStateProps {
  sources?: ReadonlyArray<string>;
}

export function EmptyState({
  sources = [],
}: EmptyStateProps = {}) {
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

    </section>
  );
}
