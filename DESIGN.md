---
name: destrajă.ro
description: A calm civic monitor where the bill, its risk colour and its deadline read in one glance.
colors:
  paper: "#f6f4ee"
  surface: "#fffefb"
  sunken: "#eeebe3"
  line: "#e0dbcf"
  line-strong: "#c9c2b2"
  ink: "#121a2b"
  body: "#2c3546"
  muted: "#5b6475"
  faint: "#8b93a1"
  brand: "#172c54"
  brand-hover: "#213d70"
  on-brand: "#ffffff"
  brand-soft: "#e3e8f1"
  link: "#1f3b70"
  focus: "#2b4c8c"
  risk-red: "#d0372b"
  risk-red-text: "#a8261b"
  risk-red-soft: "#fbe8e5"
  risk-amber: "#dd9c12"
  risk-amber-text: "#855700"
  risk-amber-soft: "#f9efd6"
  risk-green: "#3b8a52"
  risk-green-text: "#2b6a3c"
  risk-green-soft: "#e4f1e7"
  camp: "#2f5bd3"
  cross: "#9b35d6"
  band: "#172c54"
  on-band: "#f3f5fa"
  on-band-muted: "#c3cde0"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "clamp(2.6rem, 5vw, 4.1rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "-0.03em"
    fontVariation: "opsz auto"
  headline:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "3rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title-serif:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "1.3rem"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.55
  lead:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: "2rem"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "1.75rem"
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    fontFeature: "tnum"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "32px"
  gutter-lg: "40px"
  card: "20px"
  card-lg: "24px"
  section: "64px"
  section-lg: "80px"
  container: "1240px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.sunken}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "48px"
  risk-chip-red:
    backgroundColor: "{colors.risk-red-soft}"
    textColor: "{colors.risk-red-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  risk-chip-amber:
    backgroundColor: "{colors.risk-amber-soft}"
    textColor: "{colors.risk-amber-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  risk-chip-green:
    backgroundColor: "{colors.risk-green-soft}"
    textColor: "{colors.risk-green-text}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  party-tag:
    textColor: "{colors.body}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  filter-chip-all-on:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
  segment-on:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  segment-track:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.lg}"
    padding: "4px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.card-lg}"
  bill-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.card-lg}"
  disclosure-inset:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.xl}"
    padding: "16px"
  status-band:
    backgroundColor: "{colors.band}"
    textColor: "{colors.on-band}"
    padding: "20px 0"
---

# Design System: destrajă.ro

## Overview

**Creative North Star: "The Civic Watchtower"**

A calm watch post over the Senate's open bills. The page is warm paper with navy ink, quiet enough that the only loud things on it are the three risk levels and the deadlines. It reads like a well-set public notice rather than an alert feed: a serif voice for what a bill means, a plain civic sans for everything you operate, tabular figures wherever a score or a count appears.

Density is moderate and editorial. Wide gutters, a 1240px column, generous section breathing room, and inside each section structure comes from hairline rules rather than stacked boxes. Panels exist (white sheets on paper), but inside a panel the second layer is either a hairline or a borderless sunken inset, never another bordered box.

Two themes share one token set. The light theme is paper and navy; the dark theme is soft slate, never black. The site follows the visitor's system preference and a manual toggle overrides it through a `data-theme` attribute on the root. Components never carry their own dark styles; every colour goes through a custom property. Anti-references confirmed by the brief: the black "alert" newsroom page and the forest-green institutional portal.

**Key Characteristics:**
- Warm paper ground, white sheets, ink-navy type and actions.
- Red / amber / green reserved for risk, always with a text label.
- Coalition blue and violet only for who-signs-with-whom.
- Serif display at regular weight; Public Sans for UI; tabular figures for scores.
- Hairline rules over nested boxes; two soft warm shadows, no more.
- Soft slate dark theme driven by tokens alone.

## Colors

A restrained paper-and-navy palette whose only saturated colours are semantic: three risk levels and the two coalition hues.

### Primary
- **Ink Navy** (brand): Primary buttons, the active "all" filter, the status band, bar fills for neutral metrics, the native `accent-color`. The build ships a slightly lighter navy than the brief's #13233F; the build is canonical.
- **Navy Hover** (brand-hover): Hover state of every navy-filled control.
- **Pale Navy Wash** (brand-soft): Text selection background; the dark theme uses it as a deep navy tint.
- **Link Navy** (link): Underlined text links and step icons. Links are underlined at rest (1px, 4px offset), thickening to 2px on hover.
- **Focus Navy** (focus): The 2px focus outline, 3px offset, on every focusable element.

### Secondary (coalition pair)
- **Camp Blue** (camp): Coalition-map cells for party pairs in the same camp (both government or both opposition), and its legend swatch.
- **Bridge Violet** (cross): Cells and stats for government + opposition co-signing, the "Putere și opoziție împreună" flag on bill cards, the matching press-room figure.

### Tertiary (risk scale)
Each level has three tokens: a full-strength **fill** (stripes, dots, bar segments, radar points), a **text** shade that passes AA on paper and surface (scores, severity labels, counts), and a **soft** wash (chip and callout backgrounds).
- **Signal Red** (risk-red / risk-red-text / risk-red-soft): Risc ridicat.
- **Harvest Amber** (risk-amber / risk-amber-text / risk-amber-soft): Risc moderat.
- **Field Green** (risk-green / risk-green-text / risk-green-soft): Risc redus.

### Neutral
- **Warm Paper** (paper): Page ground, sticky header at 90% with blur, browser `theme-color`.
- **Sheet White** (surface): Cards, panels, inputs, secondary buttons, footer, the selected segment.
- **Sunken Paper** (sunken): Disclosure insets, segment tracks, meter tracks, hover fill for quiet controls, the alternate section ground (at 60%).
- **Hairline** (line): Default 1px rules, card and panel borders, dividers.
- **Strong Hairline** (line-strong): Input and secondary-button borders, radar rings, dashed empty states.
- **Ink** (ink): Headings and emphasised figures.
- **Body Slate** (body): Running text.
- **Muted Slate** (muted): Leads, metadata, inactive nav, the first (muted) line of two-line headlines.
- **Faint Slate** (faint): Lowest-priority text only.
- **Status Band** (band / on-band / on-band-muted): The full-width navy strip under the hero carrying live counts.

### Dark theme (soft slate)
Same token names, re-valued under `prefers-color-scheme: dark` (unless `data-theme="light"`) and under `data-theme="dark"`: paper #1b2230, surface #222a39, sunken #283143, line #333d51, line-strong #46516a, ink #eef0f5, body #cdd3de, muted #9ca5b5. The brand inverts to a pale periwinkle (#bccaee) with navy text on it (#13203d), so primary buttons read light-on-slate. Risk and coalition hues lift in lightness (red #f06a5d, amber #e8b23e, green #5fbd79, camp #6f95f6, cross #c486f5) and their soft washes become dark tints. The band becomes #2a3754.

### Named Rules
**The Risk-Only Colour Rule.** Red, amber and green mean a bill's risk level and nothing else: no success toasts, no error states, no decorative accents. Every use is paired with a text label (chip label, legend, "Risc ridicat" count), never colour alone.

**The Coalition Pair Rule.** Blue and violet appear only where the data is about who signs with whom. They never decorate, and never stand in for the brand navy.

**The Soft Slate Rule.** The dark ground is slate (#1b2230), never black. Theme changes happen only by re-valuing tokens; components carry no `dark:` variants and no hard-coded hex.

## Typography

**Display Font:** Source Serif 4 with optical sizing (opsz axis, `font-optical-sizing: auto`), falling back to Georgia
**Body Font:** Public Sans, falling back to the system UI sans

**Character:** A bookish serif at regular weight carries meaning (headlines, bill titles, press headlines); a sober civic sans runs every control, label and paragraph. Weight contrast is mostly 400 vs 600; bold is rare.

### Hierarchy
- **Display** (400, clamp(2.6rem, 5vw, 4.1rem), 1.02, -0.03em): The home hero only. Two lines: the first in muted, the second in ink at weight 500.
- **Headline** (400, 2rem on mobile, 3rem from 640px, 1.1): Section heads and page titles; bill page title uses clamp(1.9rem, 4.2vw, 3rem). Serif h2 within long pages drops to 1.875rem.
- **Title, serif** (400, 1.3rem, 1.25): Bill titles on cards, radar card title (1.125rem), press headlines.
- **Title, sans** (600, 1.125rem): Panel headings ("Harta coalițiilor"), step titles at 1rem.
- **Lead** (400, 1.125rem / 2rem): Hero and page leads, max ~44ch.
- **Body** (400, 1rem / 1.6): Default running text; long text is capped at 68ch. Card and section copy commonly sits at 15px / 1.75rem.
- **Label** (600, 0.75rem): Chips, deadlines, flags, meter labels, metadata. Party tags drop to 11px with slight tracking. Sentence case throughout.
- **Figures**: Stats and scores in Public Sans 600 with tabular numerals, from 1rem (directory) to 1.875–2.25rem (profile and press stats).

### Named Rules
**The Serif Speaks, Sans Works Rule.** Serif for what a bill says and section voice; sans for anything you click, filter or count. Serif stays at 400 (500 only for the hero's ink line).

**The Tabular Figures Rule.** Every score, count, bill id and deadline uses tabular numerals so columns of numbers align.

## Layout

A single centred column, max 1240px, with gutters of 16px (mobile), 32px (from 640px) and 40px (from 1024px). Reading pages (bill detail) narrow to 920px; prose caps at 68ch. The sticky header is 64px (72px from 640px).

Sections stack with 56–96px vertical padding (`py-16`/`py-20`/`py-24`), separated by full-bleed hairlines or a sunken-paper band bordered top and bottom. The home hero is a two-column grid from 1024px (about 54/46, gap 56px), stacking with the radar below on mobile. Bill grids are one column on mobile, three on desktop with 24px gaps; data panels pair two-up from 1024px.

Mobile-first: all tap targets are at least 44px tall (`min-h-11`), filters wrap, segmented controls scroll horizontally without a scrollbar, and inputs are forced to 16px below 640px to stop iOS zoom. Heavy below-the-fold sections use `content-visibility: auto`.

## Elevation & Depth

Mostly flat, with tonal layering doing the depth work: paper ground, white sheets on it, sunken paper inside sheets. Shadows are soft, long, and warm-tinted in light mode (shadow colour rgb 32 28 18), switching to black-based in dark mode where they barely register.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 1px 2px rgb(var(--shadow-color) / 0.05), 0 12px 32px -18px rgb(var(--shadow-color) / 0.28)`): Bill cards and the radar figure at rest.
- **Lift** (`box-shadow: 0 2px 4px rgb(var(--shadow-color) / 0.06), 0 22px 44px -22px rgb(var(--shadow-color) / 0.4)`): Bill card on hover (with a 2px rise) and the floating cookie notice.
- **Segment** (`box-shadow: 0 1px 2px rgb(0 0 0 / 0.08)`): The selected pill in a segmented control.

### Named Rules
**The Two Shadows Rule.** Only "card" and "lift" exist as elevations. Panels and data sheets sit flat with a hairline border; a shadow means "this is a bill you can open" or "this floats".

**The Hairline Rule.** Inside a sheet, separate with 1px hairlines (top rules, divided lists), or one borderless sunken inset. Never a bordered box inside a bordered box.

## Shapes

Soft, consistent rounding that scales with the object: 6px for small controls (segments, party tags, coalition cells), 8px for buttons, inputs and filter chips, 12px for insets inside cards, 16px for cards, panels and the cookie notice, fully round for risk chips, dots and meters. The radar figure alone uses a larger 28px corner. Borders are 1px hairlines; the only thick line is the risk stripe, a full-width bar on top of each bill card (4px) and bill page (6px). Charts use 3–4px corners on bars and legend swatches.

## Components

### Buttons
Quiet, solid, unadorned.
- **Shape:** Gently rounded (8px).
- **Primary:** Navy fill, white text, semibold 15px (hero, 48px tall) or 14px (cards, 44px tall); trailing arrow icon at 16px.
- **Hover / Focus:** Fill shifts to navy hover; focus is the global 2px navy outline at 3px offset. Disabled at 50% opacity.
- **Secondary:** Sheet white with a strong-hairline border and ink text; hover darkens the border to muted and fills sunken paper.
- **Text link:** Semibold link navy, underlined at rest, used for the hero's secondary action ("Explorează datele").

### Chips
- **Risk chip:** Fully round, soft risk wash with the risk text shade, a 6px dot, the level label and the score in tabular figures (12px, or 14px at `md`).
- **Filter chips:** 40px tall, 8px corners, hairline border on white. Active "Toate" is navy-filled; an active risk filter takes that level's soft chip colours with a current-colour border. Counts follow at regular weight.
- **Party tag:** 11px semibold party initials in a 6px-cornered hairline outline, full name in the title.

### Cards / Containers
- **Bill card:** White sheet, 16px corners, hairline border, card shadow, 4px risk stripe on top (40% opacity once the consultation has closed). Inside: risk chip and bill id, serif title, one plain sentence, flags, then a hairline rule over deadline and party tags, a full-width action button, and the "De ce acest nivel de risc?" disclosure opening onto a sunken inset with the three model verdicts divided by hairlines. Hover lifts 2px to the lift shadow over 300ms.
- **The One Navy Button Rule.** On a bill card the action is navy only when the bill is red-risk and still open ("Obiectează în 60 de secunde"); every other card uses the secondary button.
- **Panel:** White sheet, 16px corners, hairline border, no shadow, 20px padding (24px from 640px). Holds charts and press tools.
- **Empty state:** Dashed strong-hairline box, 16px corners, serif title, muted text.

### Inputs / Fields
- **Style:** 48px tall, white, strong-hairline border, 8px corners, 15px ink text, muted placeholder, leading icon.
- **Focus:** Border turns navy with a 4px navy ring at 15% opacity.

### Segmented control
A sunken track (8px corners, 4px padding) holding pills of 12px semibold muted text; the selected pill is white with ink text and the segment shadow. Used for chart metrics, chamber and sort choices, and the theme picker.

### Navigation
Sticky header on paper at 90% with background blur and a bottom hairline. Logo left; 14px medium nav links right, muted at rest with a sunken hover fill; the current page is ink with a 2px underline set 10px below the text. A moon/sun toggle sits at the end. Below 768px the links collapse into a menu button revealing a full-width list of 48px rows divided by hairlines.

### Status band
A full-bleed navy strip under the hero: one bold sentence of live counts in on-band, a muted follow-up, and underlined action links with icons that pre-filter the bill list.

### Risk radar (signature)
A white figure with 28px corners and the card shadow. Concentric rings tinted with faint risk washes (red centre, amber middle, green outer), strong-hairline ring strokes and tick marks, a slow sweep, and every bill plotted as a risk-coloured dot (closer to centre is riskier; closed bills faded). Hovering or tapping a dot swaps the bill summary below a hairline. Uppercase tracked ring labels live only here as chart annotations. Sweep and ping animations are hidden under reduced motion.

### Model meters and coalition map
Three side-by-side 4px round meters per bill (Gemini, Claude, ChatGPT), each filled with its own verdict's risk colour over a sunken track. The coalition map is a party-by-party grid of small rounded cells tinted camp blue, bridge violet or muted by pair type, with a four-swatch legend; clicking a cell filters the bill list.

## Do's and Don'ts

### Do:
- **Do** route every colour through the custom properties in `globals.css` so both themes follow automatically.
- **Do** pair every risk colour with its text label and keep risk text in the `-text` shade, never the fill.
- **Do** put a 4px risk stripe on top of every bill card and a 6px stripe on the bill page header.
- **Do** separate content inside a sheet with 1px hairlines or one sunken inset.
- **Do** set scores, counts and bill ids in tabular figures.
- **Do** keep tap targets at least 44px tall and the focus outline at 2px navy, 3px offset.
- **Do** use the two-line serif headline (muted first line, ink second line) for persuasive section openers, as in the hero.

### Don't:
- **Don't** use red, amber or green for success, errors, warnings or decoration; they mean risk only.
- **Don't** use a black or near-black ground in dark mode; the floor is slate #1b2230.
- **Don't** write `dark:` variants or hard-coded hex in components.
- **Don't** nest a bordered box inside a bordered box.
- **Don't** add elevations beyond card and lift, or hard offset shadows.
- **Don't** put small uppercase tracked labels above headings; uppercase tracking belongs only to the radar's ring annotations.
- **Don't** drift toward the black "alert" newsroom look or a forest-green institutional portal.
