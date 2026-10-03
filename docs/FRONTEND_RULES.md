# KnowYu Frontend Standards

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

## Universal Device Support

- Use window size classes (Compact < 600px, Medium 600–839px, Expanded 840–1199px, Large 1200px+), not device-specific breakpoints.
- Listen for resize and orientation changes. Never assume the window is static.
- Use `window.matchMedia("(horizontal-viewport-segments: 2)")` to detect foldable dual-pane postures.
- Use `viewport-segment` env vars for hinge-aware layout:
  ```css
  padding-left: env(viewport-segment-left 0 0, 0px);
  padding-right: env(viewport-segment-right 0 0, 0px);
  ```
- Persist chat state, composer input, and scroll position across fold/unfold/resize events.
- Test at: 320px, 375px, 393px, 600px, 840px, 1200px, 1440px.
- Test on: iPhone SE, iPhone 15 Pro, Galaxy Z Fold (folded + unfolded), iPad Mini, iPad Pro, MacBook.
- Test split-screen multitasking — never assume full-screen.
- Prefer CSS container queries (`@container`) over viewport media queries.

## Mobile performance

- Viewport meta in `app/layout.tsx`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  ```
- Use `100dvh`, not `100vh`, for full-height containers.
- Avoid heavy layouts on mobile: no `backdrop-filter`, no large shadows, no fixed backgrounds.
- Use `will-change` sparingly — it forces GPU layers that hurt battery.
- Test on real devices, not just Chrome DevTools. DevTools does not reproduce iOS Safari quirks.
- Lazy-load the message list if it exceeds 50 messages.
- Use `content-visibility: auto` for off-screen message bubbles.

## Mobile composer rules

- The composer is anchored to the bottom of the viewport, above the safe area.
- `padding-bottom: max(16px, env(safe-area-inset-bottom))`.
- Input font-size is 16px minimum to prevent iOS zoom on focus.
- Do not use `position: fixed` for the composer on mobile. Use a flex column with `flex: 1` on the messages area and sticky bottom on the composer.
- When the keyboard opens, the composer remains visible.
- Every interactive element is ≥ 44×44px.
