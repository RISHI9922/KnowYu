# rag-bot Premium Minimal UI/UX Rules

## Design philosophy

The interface is calm, minimal, and professional. Linear, Vercel, Stripe Docs, Notion, and Raycast are references for restraint, hierarchy, and speed—not templates to imitate. The content and citations are the product; decoration must not compete with them.

## Locked color palette

| Role | Value |
|---|---|
| White | `#FFFFFF` |
| Subtle surface | `#FAFAFA` |
| Border | `#E5E5E5` |
| Strong border | `#D4D4D4` |
| Primary text / accent | `#171717` |
| Secondary text | `#737373` |
| Tertiary text | `#A3A3A3` |
| Accent hover | `#404040` |
| Success | `#16A34A` |
| Warning | `#CA8A04` |
| Error | `#DC2626` |

Use one accent: `#171717`. There are no gradients, purple or blue “AI” colors, neon, or glassmorphism.

## Typography

Use Inter for interface and prose and JetBrains Mono for code, IDs, and diagnostic values.

| Token | Size / line height | Weight | Use |
|---|---|---:|---|
| `caption` | 12 / 16 px | 400–500 | Citations and metadata |
| `small` | 14 / 20 px | 400–500 | Secondary controls |
| `body` | 16 / 24 px | 400 | Messages and forms |
| `lead` | 18 / 28 px | 400–500 | Introductory copy |
| `heading-sm` | 20 / 28 px | 600 | Section headings |
| `heading-md` | 24 / 32 px | 600 | Page subhead |
| `heading-lg` | 32 / 40 px | 600 | Primary page title |

Keep prose to 70 characters per line (`70ch`) and never center body text. Use sentence case. Avoid weights above 700.

## Spacing and layout

Use the 4 px grid only: `4, 8, 12, 16, 24, 32, 48, 64, 96`. Reading content is at most 720 px wide; the full app shell is at most 1200 px. Design mobile-first and test at 320 px. There must be no horizontal page scroll. Maintain clear alignment and prefer whitespace over dividers.

Borders are 1 px. Allowed radii are 6, 8, and 12 px. Shadows appear only on floating elements such as a command menu; flat cards have none.

## Components

### Buttons

- Primary: `#171717` background, white text, 8 px vertical and 16 px horizontal padding, 6 px radius; hover `#404040`.
- Secondary: transparent background, `#D4D4D4` 1 px border, primary text.
- Ghost: transparent, no border, primary text; hover uses `#FAFAFA`.
- Disabled controls remain legible, use reduced opacity, and expose disabled semantics.

### Input

White background, 1 px `#D4D4D4` border, 8 px radius, and no glow. Focus uses a visible high-contrast ring only. Preserve a visible label, helpful description, and error association.

### Card

White background, 1 px `#E5E5E5` border, 8 or 12 px radius, and no shadow. Cards group related information; they are not decorative containers for every section.

### Chat

User messages use `#FAFAFA` and align right. Assistant messages use white and align left. Both maintain readable widths and clear speaker labels for assistive technology. Avoid oversized speech-bubble tails.

Citations are always visible in 12 px muted text using `📄 filename.pdf · p. 12`. They underline on hover and receive a visible focus style. The document emoji is the only permitted UI emoji.

## Motion

Micro-interactions last 150 ms; layout transitions last 250 ms. Use `cubic-bezier(0.4, 0, 0.2, 1)`. Animate only opacity, transform, and background-color. Respect `prefers-reduced-motion` by removing nonessential motion. Never bounce, pulse continuously, or animate streaming text character by character.

## Icons

Use Lucide only, at 16, 20, or 24 px with a 1.5 px stroke. Icons support text and never replace an unfamiliar label. Do not mix icon libraries or use filled and outline styles inconsistently.

## Dark mode

Respect `prefers-color-scheme` by default and allow an accessible explicit override if added later.

| Role | Dark value |
|---|---|
| Page background | `#0A0A0A` |
| Raised surface | `#171717` |
| Primary text | `#FAFAFA` |
| Muted text | `#A3A3A3` |
| Border | `#404040` |

Semantic colors must be contrast-tested on dark surfaces. Do not simply invert shadows or images.

## UX states

- **First load:** one-sentence purpose and three example-question chips derived from the corpus.
- **Empty:** one sentence explaining what can be asked, followed by three examples.
- **Loading:** a stable three-line skeleton until the first streamed text arrives.
- **Error:** plain-language cause when known, a retry action, and preserved input.
- **I don't know:** “I don't know based on the provided documents.” Then show two related questions the corpus can answer.
- **Answered:** citations remain visible directly beneath the answer, including during later conversation turns.

## Copy rules

Use plain English, short sentences, and concrete verbs. No exclamation marks, no marketing claims, no “AI-powered,” “magic,” or “Oops!”, and no emojis except the citation marker. Explain recovery, not blame.

| Bad | Good |
|---|---|
| “Ask our magical AI anything!” | “Ask a question about these documents.” |
| “Oops! Something went wrong!” | “The answer could not be loaded. Try again.” |
| “No results.” | “I don't know based on the provided documents.” |
| “Invalid input.” | “Enter a question between 1 and 2,000 characters.” |
| “Generating…” | “Reviewing the documents…” |

## Accessibility

- Meet WCAG 2.2 AA contrast, focus visibility, semantics, names, and keyboard behavior.
- Keep focus order aligned with visual order and restore focus after recoverable actions.
- Provide a skip link, one primary heading, explicit form labels, and a polite answer-status live region.
- Ensure targets are at least 44 by 44 CSS pixels where practical.
- Do not communicate success, warning, or error through color alone.
- At 200% zoom, content reflows without loss or horizontal scrolling.

## Anti-patterns

- Gradients, purple AI branding, neon, glassmorphism, or multiple accents.
- Bouncy animations, decorative spinners, or animated backgrounds.
- Emojis in UI copy other than `📄` for citations.
- Shadows on flat cards, borders thicker than 1 px, or radii above 12 px.
- Modals for noncritical information, a toast for every result, or red error banners.
- Centered paragraphs, low-contrast gray text, hidden citations, or icon-only mystery controls.
- Dense dashboards, ornamental metrics, or controls not required by the core question flow.

## The five-second test

Within five seconds, a first-time user must be able to answer:

1. What does this product do? It answers questions from the provided documents.
2. Where do I type? The labeled question composer is visually primary.
3. What happened? Loading, answer, refusal, and error states are unmistakable.

## Final rule

“Does this help the user answer their question faster?” If no, delete.
