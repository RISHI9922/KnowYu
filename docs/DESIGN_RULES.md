# KnowYu Design Rules

## Design philosophy

The interface is calm, minimal, and professional. Linear, Vercel, Stripe Docs, Notion, and Raycast are references for restraint, hierarchy, and speed — not templates to imitate. The content and citations are the product; decoration must not compete with them.

Three principles override everything:

1. **Clarity** — the user must know what to do within 5 seconds.
2. **Trust** — every answer is verifiable, every refusal is honest.
3. **Universal access** — the same experience on phone, foldable, tablet, laptop, desktop, and split-screen.

If a visual choice does not help the user answer their question faster, delete it.

---

## Locked color palette

| Role | Value | Use |
|---|---|---|
| White | `#FFFFFF` | Page background, cards |
| Subtle surface | `#FAFAFA` | User bubbles, hover states |
| Border | `#E5E5E5` | Card borders, dividers |
| Strong border | `#D4D4D4` | Input borders, secondary button borders |
| Primary text | `#171717` | Headings, body, primary button bg |
| Secondary text | `#737373` | Metadata, labels |
| Tertiary text | `#A3A3A3` | Placeholders, disabled text |
| Accent hover | `#404040` | Primary button hover |
| Success | `#16A34A` | Confirmation states |
| Warning | `#CA8A04` | Caution states |
| Error | `#DC2626` | Failure states |

Use one accent: `#171717`. There are **no gradients**, no purple or blue "AI" colors, no neon, no glassmorphism, and no decorative backgrounds.

### Semantic color rules
- Success, warning, and error are never used decoratively.
- Never communicate state through color alone. Always pair with text, icon, or shape.

---

## Typography

Use Inter for interface and prose. Use JetBrains Mono for code, IDs, and diagnostic values.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `caption` | 12 / 16 px | 400–500 | Citations, metadata |
| `small` | 14 / 20 px | 400–500 | Secondary controls |
| `body` | 16 / 24 px | 400 | Messages, forms |
| `lead` | 18 / 28 px | 400–500 | Introductory copy |
| `heading-sm` | 20 / 28 px | 600 | Section headings |
| `heading-md` | 24 / 32 px | 600 | Page subhead |
| `heading-lg` | 32 / 40 px | 600 | Primary page title |

### Rules
- Prose max line length: **70 characters** (`70ch`).
- On Compact windows (< 600px), prose max line length is **45 characters**.
- Never center body text. Left-align always.
- Sentence case everywhere. Reserve ALL CAPS for acronyms only.
- Font weights above 700 are forbidden.
- Minimum input font-size is **16px** — prevents iOS Safari zoom-on-focus.
- Headings scale down on Compact: `heading-lg` becomes 24px, `heading-md` becomes 20px.

---

## Spacing

Use the 4px grid only: `4, 8, 12, 16, 24, 32, 48, 64, 96`.

No arbitrary values. No 13px, 15px, 27px. If it doesn't land on the grid, it doesn't ship.

---

## Window Size Classes (Universal Device Support)

Breakpoints are based on **available window width**, not device type. This supports phones, tablets, foldables, laptops, desktops, and split-screen multitasking with one set of rules.

| Class | Width | Layout | Chrome |
|---|---|---|---|
| **Compact** | < 600px | Single column, full-width bubbles | Bottom-anchored composer |
| **Medium** | 600–839px | Single column, max-width 600px, centered | Composer bottom, centered |
| **Expanded** | 840–1199px | Two-pane: messages + context/citations | Optional side panel |
| **Large** | 1200px+ | Max-width 720px content, centered | No side panel |

### Layout width
- Reading content is at most **720px** wide.
- The app shell is at most **1200px** wide.
- No horizontal page scroll at any width.

### Foldable-specific rules
- **Posture awareness:** critical UI must not sit on the hinge or fold line.
- **Dual-pane detection:** use `window.matchMedia("(horizontal-viewport-segments: 2)")` to detect a folded posture.
- **Hinge padding:** use `viewport-segment` env vars to avoid the fold:
  ```css
  padding-left: env(viewport-segment-left 0 0, 0px);
  padding-right: env(viewport-segment-right 0 0, 0px);
  ```
- **State continuity:** when the device folds/unfolds or resizes, chat state, composer input, and scroll position must persist.
- **Cover screen:** treated as Compact. No side panel. Composer always visible.
- **Split-screen:** treated by its **window width**, not the device's default size. Never assume full screen.

### Container queries preferred
Prefer CSS container queries (`@container`) over viewport media queries. A citation card inside a sidebar should behave differently than one in the main chat, even at the same viewport width.

### Landscape
- Do not lock orientation.
- In landscape at Compact widths, the composer stays bottom-anchored.
- In landscape at Expanded widths, side-by-side panes are preferred.

### Input device adaptation
- **Touch:** tap targets ≥ 44×44px (see below).
- **Keyboard/mouse:** hover states, focus rings, keyboard shortcuts, scroll-wheel support.
- **Stylus/trackpad:** supported on all interactive elements.
- **Never assume a single input method.**

---

## Mobile and touch rules

### Viewport
- Use `100dvh`, not `100vh`. iOS Safari's URL bar makes `100vh` taller than the visible area.
- Declare `height: 100vh;` then override with `height: 100dvh;` for older browser support.
- Add viewport meta in `app/layout.tsx`:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  ```

### Safe areas
- Bottom-anchored elements use `padding-bottom: max(16px, env(safe-area-inset-bottom))`.
- Top elements use `padding-top: env(safe-area-inset-top)` where applicable.
- Nothing sits under the home indicator or notch.

### Touch targets
- Every interactive element is **at least 44×44 CSS pixels**.
- Use padding to expand small icons — never shrink the visible icon below 16px.
- Buttons use `touch-action: manipulation` to prevent double-tap zoom.
- Citations are ≥ 44px tall tap targets even though the text is 12px.

### Keyboard behavior
- Input font-size is 16px minimum — prevents iOS zoom.
- When the mobile keyboard opens, the composer remains visible.
- Use a flex column with `flex: 1` on the messages area and sticky bottom on the composer. **Do not use `position: fixed`** for the composer on mobile.

### Scroll behavior
- `overscroll-behavior: contain` on the messages area to prevent pull-to-refresh interrupting scroll.
- `-webkit-overflow-scrolling: touch` on scrollable areas for momentum.

---

## Borders, radius, and shadows

- Borders are **1px**. Never 2px, never 3px.
- Allowed radii: **6px**, **8px**, **12px**. Nothing else.
- Shadows appear **only on floating elements** (dropdowns, command menu, modals).
- Flat cards have no shadow. Ever.

---

## Components

### Buttons

- **Primary:** `#171717` background, white text, 8px vertical / 16px horizontal padding, 6px radius; hover `#404040`; disabled at 50% opacity with `cursor: not-allowed`.
- **Secondary:** transparent background, `#D4D4D4` 1px border, primary text; hover background `#FAFAFA`.
- **Ghost:** transparent, no border, primary text; hover background `#FAFAFA`.
- All buttons have visible focus rings (2px offset, high contrast) and respect `prefers-reduced-motion`.
- Minimum size: 44×44px on touch devices.

### Input

- White background, 1px `#D4D4D4` border, 8px radius, no glow.
- Focus ring visible, high contrast, 2px offset.
- Minimum height 44px. Font-size 16px minimum.
- Always has a visible `<label>`. Placeholder text is **not** a label.
- Error state: 1px `#DC2626` border, error message below, `aria-describedby` linked.

### Card

- White background, 1px `#E5E5E5` border, 8–12px radius, no shadow.
- Cards group related information. They are not decorative containers for every section.

### Chat

- **User messages:** `#FAFAFA` background, right-aligned, 8–12px radius, max-width 75%.
- **Assistant messages:** white background, left-aligned, 1px `#E5E5E5` border, max-width 90%.
- **Speaker labels** for assistive technology (visually hidden if needed).
- On Compact windows, bubbles use full width minus 16px page padding.
- No oversized speech-bubble tails. No rounded-full bubbles.

### Citations

- Always visible in 12px muted text: `📄 filename.pdf · p. 12`.
- The document emoji `📄` is the **only permitted UI emoji**.
- Underline on hover. Visible focus style when tabbed to.
- Tap target ≥ 44px tall, even on mobile.
- On Compact windows, source and page stack vertically if the line would wrap mid-word.

### Skeleton

- Three-line skeleton for loading states.
- Uses `#E5E5E5` blocks. No shimmer, no animation beyond a subtle opacity pulse.
- Never a spinner. Skeletons show the shape of what's coming.

---

## Motion

- Micro-interactions: **150ms**.
- Layout transitions: **250ms**.
- Easing: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Animate only `opacity`, `transform`, and `background-color`.
- Respect `prefers-reduced-motion` — remove nonessential motion entirely.
- Never bounce. Never pulse continuously. Never animate streaming text character by character.

---

## Icons

- Use **Lucide** only. Never mix icon libraries.
- Stroke width: **1.5px**.
- Sizes: **16px**, **20px**, **24px**.
- Icons support text and never replace an unfamiliar label.
- Do not mix filled and outline styles inconsistently.

---

## Dark mode

Respect `prefers-color-scheme` by default. Allow an accessible explicit override if added later.

| Role | Dark value |
|---|---|
| Page background | `#0A0A0A` |
| Raised surface | `#171717` |
| Primary text | `#FAFAFA` |
| Muted text | `#A3A3A3` |
| Border | `#404040` |

Semantic colors must be contrast-tested on dark surfaces. Do not simply invert shadows or images.

---

## UX states

- **First load:** a concise purpose statement with the composer visually primary.
- **Empty:** one sentence explaining what can be asked.
- **Loading:** a stable three-line skeleton until the first streamed text arrives.
- **Error:** plain-language cause when known, a retry action, and preserved input.
- **I don't know:** "I don't know based on the provided documents." Then show two related questions the corpus can answer.
- **Answered:** citations remain visible directly beneath the answer, including during later conversation turns.

Every async action has all four states: loading, empty, error, success.

---

## Copy rules

Use plain English, short sentences, and concrete verbs.

- No exclamation marks.
- No marketing claims.
- No "AI-powered," "magic," or "Oops!"
- No emojis except the citation marker `📄`.
- Sentence case.
- Explain recovery, not blame.

| Bad | Good |
|---|---|
| "Ask our magical AI anything!" | "Ask a question about these documents." |
| "Oops! Something went wrong!" | "The answer could not be loaded. Try again." |
| "No results." | "I don't know based on the available documents." |
| "Invalid input." | "Enter a question between 1 and 2,000 characters." |
| "Generating…" | "Reviewing the documents…" |
| "Sorry, I couldn't find that!" | "I don't know based on the provided documents." |

---

## Accessibility

- Meet WCAG 2.2 AA contrast, focus visibility, semantics, names, and keyboard behavior.
- Focus order aligned with visual order. Restore focus after recoverable actions.
- Skip link, one primary heading, explicit form labels, and a polite live region for answer status.
- Target size ≥ 44×44 CSS pixels.
- Do not communicate success, warning, or error through color alone.
- At 200% zoom, content reflows without loss or horizontal scrolling.
- Every icon-only control has a specific `aria-label`.
- Screen readers announce completed answers and errors, not every streamed token.

---

## Anti-patterns

- Gradients, purple AI branding, neon, glassmorphism, or multiple accents.
- Bouncy animations, decorative spinners, or animated backgrounds.
- Emojis in UI copy other than `📄` for citations.
- Shadows on flat cards, borders thicker than 1px, or radii above 12px.
- Modals for noncritical information, a toast for every result, or red error banners.
- Centered paragraphs, low-contrast gray text, hidden citations, or icon-only mystery controls.
- Dense dashboards, ornamental metrics, or controls not required by the core question flow.
- `position: fixed` for the mobile composer.
- `100vh` for full-height containers on mobile.
- Tap targets smaller than 44×44px.
- Inputs with font-size below 16px.
- Assuming the window size is static during a session.
- Placing critical UI on a foldable hinge.
- WebGL, backdrop-filter, or heavy visuals on Compact devices.

---

## The five-second test

Within five seconds, a first-time user must be able to answer:

1. **What does this product do?** It answers questions from the provided documents.
2. **Where do I type?** The labeled question composer is visually primary.
3. **What happened?** Loading, answer, refusal, and error states are unmistakable.

---

## Mobile and universal-device release checklist

- [ ] Works at 320px width (iPhone SE, older Android)
- [ ] Works at 375px (iPhone 12/13 mini)
- [ ] Works at 393px (iPhone 15 Pro, with notch)
- [ ] Works at 600px (small tablet, Medium class)
- [ ] Works at 840px (Expanded class, side panel visible)
- [ ] Works at 1200px+ (Large class, centered, no side panel)
- [ ] Foldable folded (Compact)
- [ ] Foldable unfolded (Medium)
- [ ] Split-screen multitasking
- [ ] Landscape orientation on Compact widths
- [ ] Keyboard open on iOS does not hide composer
- [ ] All tap targets ≥ 44×44px
- [ ] Input font-size ≥ 16px on all inputs
- [ ] Safe areas respected on notch devices
- [ ] No horizontal scroll from 320px to 1440px
- [ ] Pull-to-refresh does not interrupt chat scroll
- [ ] Double-tap does not zoom on buttons
- [ ] State persists across fold/unfold/resize
- [ ] `100dvh` used, not `100vh`

---

## Final rule

"Does this help the user answer their question faster?"

If no, delete it.

---

## Chat Layout

This section defines the current chat shell and takes precedence over earlier
rules wherever they conflict.

### Layout

- The shell is a flex row that fills the viewport using `100dvh`.
- The sidebar is 280px wide on Expanded and Large windows.
- The sidebar is hidden on Compact and Medium windows. A drawer may be added
  later, but the v1 redesign does not include a drawer or hamburger control.
- The main chat column uses the remaining width and contains the message scroll
  area and bottom composer.

### Colors

- Sidebar background: `linear-gradient(180deg, #0A0A0A 0%, #171717 100%)`.
- Sidebar text: `#FAFAFA`.
- Sidebar muted text: `#A3A3A3`.
- Sidebar cards: `#171717` with a 1px `#404040` border.
- Main background: `#FAFAFA`.
- User bubbles: `#FFFFFF` with a 1px `#E5E5E5` border and 12px radius.
- Assistant bubbles: `#FFFFFF` with a 3px `#2563EB` left accent border and
  12px radius.
- User avatars use `#F5C9B8`; assistant avatars use `#A8D5E5`.
- The sidebar gradient, avatar colors, blue assistant accent, and subtle message
  and composer shadows are intentional exceptions to the earlier palette,
  gradient, and flat-card restrictions.

### Avatars

- Avatars are 32px circles containing an emoji, initial, or KnowYu mark.
- The user avatar may use `🙂`; the assistant avatar may use `📚`.
- These avatar glyphs are intentional exceptions to the citation-only emoji
  rule.

### Composer

- The composer is a pill-shaped white container with a 1px `#E5E5E5` border.
- The textarea sits on the left. Paperclip, smile, and send controls sit on the
  right.
- The send control is circular with a `#171717` background and white icon.
- Attach and emoji controls are muted ghost buttons and remain disabled in v1.

### Typography

- Continue using Inter for interface text and JetBrains Mono for code and IDs.
- Use Manrope at 700 weight for the centered `KnowYu` application wordmark. It is
  loaded through `next/font` for self-hosted, layout-stable delivery.
- Message text uses 15px type with a 22px line height.
- Message metadata uses 12px type with a 16px line height.

### Icons

- Use Lucide for paperclip, smile, and arrow-up icons.
- Icons are 20px with a 1.5px stroke, except the send arrow may use a 2px
  stroke for legibility.

## Simplified static design

This section supersedes earlier visual rules where they conflict.

- Page background: `#F9F8F8`; surface: `#FFFFFF`.
- Primary text and the static sidebar: `#152443`.
- Interactive accent: `#4176E6`; borders: `#E5E7EB`.
- Use DM Sans for interface and message text. Use Montserrat at 500 weight for
  the centered KnowYu wordmark and primary headings.
- Keep the layout static. Decorative background animation, WebGL, animated
  gradients, and grain overlays are not part of this design.
- Use 12px, 18px, or 24px radii for containers. The composer may retain a
  pill-like shape where needed for its single-line control.
- Prefer one subtle `0 1px 3px rgba(0, 0, 0, 0.08)` shadow only where it helps
  distinguish an interactive surface.
