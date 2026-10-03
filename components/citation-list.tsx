import { memo } from "react";
import type { Citation } from "../lib/types";

interface CitationListProps {
  citations: ReadonlyArray<Citation>;
}

function CitationListInner({ citations }: CitationListProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <ul className="citation-list" aria-label="Sources">
      {citations.map((citation, index) => {
        const pageLabel = citation.page === null
          ? ""
          : `, page ${citation.page}`;
        const pageText = citation.page === null
          ? ""
          : ` · p. ${citation.page}`;

        return (
          <li key={`${citation.source}:${citation.page ?? "none"}:${index}`}>
            <button
              className="citation-link"
              type="button"
              aria-label={`Open source: ${citation.source}${pageLabel}`}
            >
              📄 {citation.source}{pageText}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export const CitationList = memo(CitationListInner);
