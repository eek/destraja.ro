# Brief: "Cum s-a votat" (how Parliament voted on a bill)

You are redesigning one section of a bill page on destrajă.ro, a calm, independent Romanian civic site that tracks bills in Parliament. Your job is a **refinement inside an existing design system** (DESIGN.md below), not a new visual world. Mode: **Read/Operate**. The visitor wants to understand, in a few seconds, how each chamber voted and how each party split. Then, if they care, they want to find one MP's vote. Most visitors are on a phone.

## What the section must show (all from the data, nothing invented)
- One block per plenary vote. Order them chronologically: usually the Senate first, then the Chamber of Deputies.
- **The result in plain words** (`resultHeadline(v)`), the date and time, the subject (`subjectLabel(v)`) and the chamber's bill number.
- **Totals:** for, against, abstained, present but not voting. For the Senate there is also "listed with no vote recorded".
- **When the question is a rejection** (`v.question === 'respingere'`), "pentru" means "for rejecting the bill". This must be impossible to misread. Use `voteLabel(choice, question)` for every label.
- **The split per party group**, so a reader sees which groups voted which way, AND how big each group is (a 5-member group must not look like a 31-member group).
- **The nominal list**, collapsed by default and grouped so it can be scanned. Each name links to the MP page when `pages.has(m.mp)`.
- **The link to the official vote page** (`v.url`, "Votul pe senat.ro" / "Votul pe cdep.ro").
- **Committee statements** (`data.committee`), when present. Committees do not vote by name; the report only says unanimity or majority, quoted.
- **Footnotes, kept:**
  - the Chamber lists only the deputies present, so absences can't be shown;
  - Senate "no vote recorded" means listed with no mark next to the name.

## A worthwhile addition, derivable from the data
Members who voted differently from the majority of their own group ("au votat altfel decât grupul"). Compute it in the component from `v.members`, ignoring the "Neafiliați" pseudo-group. Show it compactly when it exists, and don't show it when it doesn't.

## Problems with the current version (source below)
1. **Wrong colour.** "contra" uses `bg-cross` (violet). DESIGN.md's Coalition Pair Rule reserves violet for who-signs-with-whom. Red, amber and green are reserved for risk. Vote choices need their own neutral, accessible encoding: navy tints, slate, patterns or position, always labelled. Colour must never be the only cue.
2. **Party bars all have the same length**, so group size is invisible.
3. **The nominal list is a wall of names** that is hard to scan, especially on a phone.
4. **It is long and flat.** The two chambers don't read as a sequence, and the outcome doesn't stand out enough.

## Hard constraints
- **One file**, TypeScript + React, **a server component** (no `'use client'`, no hooks, no state). Interactivity only through native `<details>/<summary>` or CSS. The `pages` prop is a `Set` and can't cross to a client component.
- Signature: `export default function BillVotes({ data, pages, billId }: { data: Data | null; pages: Set<string>; billId: string })`. Return `null` when there is nothing to show.
- **Allowed imports only:**
  - `next/link`, `lucide-react` (icons);
  - `@/lib/types` (types below), `@/lib/vote-text` (helpers below), `@/lib/site` (`PARTY_ORDER`), `@/lib/format` (`formatDateRo(iso)`, `countWord(n, one, many)`), `@/lib/analytics` (`trackAttrs(event, props)`), `@/components/ui` (`PartyTag`, `panel`).
  - No new dependencies, no charts library.
- **Styling:**
  - Tailwind v4 utility classes only, using the token colours listed under "Tokens". No hex, no `dark:` variants (themes swap the tokens), no inline colour styles. Inline `style` is allowed only for computed widths and positions.
  - Keep `id="voturi"` and `aria-labelledby` on the section, and the `panel` container class.
  - Tabular figures for every number.
  - Hairlines inside the panel, never a bordered box inside a bordered box.
  - Tap targets at least 44px tall.
  - It must work at 360px wide with no horizontal page scroll (a table may scroll inside its own container only if unavoidable).
- **Copy** in Romanian with ș/ț comma-below, sentence case, no uppercase tracked eyebrows above headings, no emoji.
- **Accessibility:** a real `<table>` or properly labelled lists for the per-party numbers; hide decorative bars from screen readers but give the numbers; keep visible focus.

## Tokens (Tailwind colour names)
paper, surface, sunken, line, line-strong, ink, body, muted, faint, brand, brand-hover, on-brand, brand-soft, link, focus, band, on-band, on-band-muted; risk-* (FORBIDDEN here); camp, cross (FORBIDDEN here: coalition only).
Usage: `bg-brand`, `text-muted`, `border-line`, `bg-brand/40` (opacity modifiers are fine), etc.
Fonts: `font-display` (Source Serif 4, for meaning and voice), default sans (Public Sans) for UI and numbers.

## Output
Return ONLY the complete file, in one ```tsx fenced block. Before the block, write at most 4 lines naming your design idea. No other prose.
