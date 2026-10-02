# rag-bot Frontend Standards

## Structure

```text
app/
  layout.tsx
  page.tsx
  globals.css
components/
  chat-composer.tsx
  chat-message.tsx
  citation-list.tsx
  empty-state.tsx
  error-state.tsx
  message-skeleton.tsx
  question-examples.tsx
```

Use Server Components by default. Add `"use client"` only to the smallest component that needs state, browser APIs, event handlers, or streaming updates. API keys and privileged configuration never enter props, serialized state, client bundles, or `NEXT_PUBLIC_` variables.

## Component rules

- One component per file, with a named TypeScript interface for public props.
- Prefer composition over large conditional components. Extract a component when it has an independent responsibility, not merely to reduce line count.
- Use semantic HTML before ARIA. Buttons perform actions; links navigate.
- Do not use `any`. Use `unknown` at untrusted boundaries and narrow it.
- Keep presentation separate from fetch/stream orchestration where it improves testability.
- Stable server identifiers are React keys; array indexes are not keys for changing lists.

```ts
interface CitationListProps {
  citations: ReadonlyArray<{
    source: string;
    page: number | null;
  }>;
}
```

## State management

Use component-local `useState` for composer state, pending state, and transient errors. Lift state only to the nearest shared owner. Do not add Redux or another global store unless measured complexity proves it necessary. Store optional display history in `localStorage`, version its schema, validate it on read, and never treat it as authoritative or secure. Do not persist secrets or hidden system context.

## Async states

Every async action has explicit loading, error, empty, and success states:

- Disable duplicate submission while a question is starting; keep the question visible.
- During streaming, render a three-line skeleton until the first token, then append accessible text without stealing focus.
- On failure, state what happened in plain language and offer a retry that preserves input.
- On no retrieval result, show the standard “I don't know based on these documents” message and two related example questions.
- Handle stream disconnects and ignore late events after cancellation.

## Accessibility

- All icon-only controls have specific `aria-label` text.
- The entire experience supports keyboard navigation with visible focus indicators.
- Associate inputs with visible labels; placeholder text is not a label.
- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful UI boundaries.
- Announce completed answers and errors through a polite live region; do not announce every streamed token.
- Respect reduced motion, browser zoom, and a 44-by-44 CSS-pixel touch target where practical.
- Use headings in logical order and never rely on color alone to communicate state.

## Performance

- Stream chat responses and render progressively.
- Debounce eligible search-like input by 300 ms; do not delay the explicit submit action.
- Lazy-load noncritical heavy components, not essential composer controls or primary content.
- Avoid unnecessary client boundaries and memoization without evidence.
- Cancel stale requests, deduplicate citations, and virtualize history only after measured need.
- Set explicit image dimensions and use optimized assets if images are introduced.

## Styling

Use shared design tokens from `DESIGN_RULES.md`. Prefer class-based styles and semantic variants. No inline style objects except dynamic values that cannot be expressed safely through classes or custom properties. Components must work at 320 CSS pixels without horizontal scrolling.

## No-No list

- No `any`, suppressed TypeScript errors, or unchecked JSON casting.
- No inline styles for routine design values.
- No `console.log` in production code; use the approved telemetry path.
- No fetching inside loops or per-citation network waterfalls.
- No client-side provider calls or exposed secret keys.
- No missing loading, error, empty, or disabled states.
- No inaccessible clickable `div` elements, focus traps, or placeholder-only labels.
- No new state library, icon library, or animation library without a documented need.

## Frontend review checklist

- Server component is used unless interactivity requires a client boundary.
- Props and external data are typed and validated.
- Keyboard, screen reader, narrow viewport, slow network, empty retrieval, and failure paths work.
- Citations remain visible and match the answer.
- Production build contains no secret, debug log, or unnecessary dependency.
