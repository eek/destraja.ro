---
version: 1
slug: "src-app-cum-functioneaza-page-tsx"
primary_target: "src/app/cum-functioneaza/page.tsx"
related_targets: []
---

# Surface brief: /cum-functioneaza (the public "under the hood" page)

Scope: one new route inside the established lastraja.ro world. Mode: Read, with a Persuade edge (readers should come away saying "nice, who built this" and share it). Ordinary readers first, developers second. Code-led build; no comp.

Audience and job: a citizen who wonders where the scores come from and whether to trust them; a journalist or developer checking the machine. They should understand the daily run, the three separate readings, the verification in code, where it runs, and that everything is public.

Constraints: inherit DESIGN.md (paper and navy, serif speaks / sans works, hairlines, two shadows). Red/amber/green only for real risk values. Every number computed at build from the data loaders or omitted. Every diagram is hand-built SVG or HTML/CSS on theme tokens, with a text equivalent. No horizontal scroll at 390. Motion only when prefers-reduced-motion allows.

## Direction contract

THESIS: The machine explained as a sequence of plain questions, each answered by one drawn mechanism. Refuses the docs-dump and the hero-metric stat band: numbers live inside the diagrams, where the mechanism produces them.

OWN-WORLD: The site's own paper, navy ink and hairlines, drawn as a transit diagram: one thick navy line with white interchange stations, bends only at 45 and 90 degrees (discipline raised from the declined rail-map challenger), a three-track split for the models, a gate glyph where code checks. Two-line serif headlines: the question muted, the answer in ink.

STORY: The reader sees the morning line, follows one real bill through three separate readings into a mean score, watches a press link pass or fail each check, learns what the models cannot touch, sees where it all runs, and leaves with the repo link.

FIRST VIEWPORT: Two-line serif H1 (muted question, ink answer), a one-paragraph lead, then the full-width morning line from "08:00" to three end terminals (site, e-mail, GitHub), stations numbered as in the daily script; on phones the line turns vertical. Primary action: the repo link and the in-page step list.

FORM: Questions-led sequence with one diagram per answer; dealt lead (position 4 of 7 on my ordered list), seed key 505c5663.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Signature interaction: on load the line draws once and three small dots run the model tracks and merge at the consensus station; hidden under reduced motion.

Unresolved: which second local model ships next to Clef; the OCR engine may change (MinerU on another branch).
