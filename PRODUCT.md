# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Citizens** (primary): Romanians who will never read a bill. They arrive from a share or a news link, often on a phone, want to know in one sentence what a bill changes for them and, if they object, send an official opinion to the Senate before the deadline.
- **Journalists and researchers**: want who proposed what, which parties co-sign, which bills got a negative CES opinion, and data they can cite or export (summary text, CSV).

## Product Purpose

lastraja.ro ("La Straja Legii") is an independent civic watch over every bill in public consultation at the Romanian Senate (senat.ro/LegiProiect.aspx). Each bill is translated into one plain sentence, scored for risk by three AI models (Gemini, Claude, ChatGPT) with a consensus, and paired with a 60-second action kit (pre-sized Senate form texts, a .docx memo, institutional emails). Success: a citizen understands a risky bill and files an opinion before the consultation closes.

## Positioning

Three independent AI readings per bill, shown side by side with their disagreement, plus the exact texts sized to the Senate's own form limits (50/400 characters). Not affiliated with the Senate or any party.

## Operating Context

- Data comes from `scripts/straja-sync.mjs` (senat.ro scrape into `data/senat-bills.json`) and `scripts/straja-council.mjs` (AI analyses into `data/analyses/*.json`). The site is rebuilt from these files.
- PDF texts (`data/texts/`) come from the PDF text layer; when a scan's layer is garbled ("destina!iei", "Si"), `scripts/lib/pdf-text.mjs` re-reads it with Romanian OCR (ocrmypdf + Tesseract `ron`) and the bill page marks it as automatically recognised, next to the official PDF.
- Consultation deadlines move daily; a bill whose deadline passed stays visible as closed.
- Party "arc" (government vs opposition) is a dated editorial classification used for the coalition map; it must be revisited when the governing coalition changes.

## Capabilities and Constraints

- Static site (Next.js, static export), deployed on Cloudflare; no accounts. The .docx personalisation runs in the browser. One small Worker (`worker/index.ts`) handles `POST /api/report`: reader reports of AI mistakes, Turnstile-checked and stored in D1 without IP or email, deleted 90 days after review.
- Reader reports are untrusted input. They are triaged by the three models with no tools; an analysis changes automatically only when all three confirm the error with quotes verified in code, and the correction is written without ever seeing the report text. Everything else goes to the operator's digest. A corrected analysis shows a dated note on the bill page.
- Press coverage ("În presă") lists only links verified to exist and to quote the bill, from allowlisted Romanian outlets. It shows in the bill header (count and how many from the last week), as a section between the action kit and the AI audit, as a line on bill cards, as an explorer filter, and as a feed with an articles CSV on /presa. A high-risk bill with no verified article says so on its card. "Recent" means published in the last 7 days, Bucharest time, recomputed in the browser between builds; never the day we found it (`firstSeenAt` is kept for diagnostics only). Press volume never changes risk, colour or ordering.
- Bill flags (urgency, negative CES opinion, signed by both government and opposition) are buttons that open a short explanation. The CES one shows the opinion's number, date and PDF, and up to three reasons summarised from the opinion text by `scripts/straja-ces.mjs`; a reason is kept only if its supporting quote is found verbatim in the opinion.
- Email alerts (`/abonare`): double opt-in, three levels (all with a daily summary, medium and high risk, high risk only). One email per working day, only when something new matches the level (new bill, 3 days left, verified press, a correction). Stored in D1: address, level and dates only; unsubscribing deletes the row. No tracking pixels. Sent by Cloudflare Email Service from alerte@lastraja.ro; shown on the site only when `ALERTS_LIVE` is true.
- MP pages carry a "Scrie-i direct" panel with only the official contact details the chamber publishes on the MP's profile (cdep.ro for deputies, senat.ro for senators): institutional e-mail only (@cdep.ro, @senat.ro; a personal Gmail listed on a profile is left out), phone, parliamentary offices and constituency, each with the source link and the date we checked it, plus a neutral starter message about the MP's highest-risk bill. Names are matched only against the official lists of sitting members; an uncertain match shows no contact data. `scripts/straja-mps.mjs` writes `data/mp-contacts.json` (one request per second, cached in `.cache/mps`); the daily run re-checks every profile on Mondays and only new initiators on other days.
- Daily update Monday–Friday 08:00 on the operator's Mac (launchd): Senate sync, new analyses, press, reports, deploy, then the email edition.
- Google Analytics 4 (`G-237KQ8L2FE`) loads only after the visitor accepts in the consent banner; refusing is one click, same as accepting, and withdrawing on /cookies deletes the `_ga` cookies. Events carry public identifiers only (bill id, party, field name), never typed text. Event list in `src/lib/analytics.ts`.
- Romanian only. Diacritics use comma-below ș/ț.
- Risk levels (red/yellow/green) come from the AI consensus, not a fixed score threshold.
- Operator: Radu-Sebastian Amarie (natural person), contact@lastraja.ro (`OPERATOR_NAME` / `CONTACT_EMAIL` in `src/lib/site.ts`).

## Brand Commitments

- Name and wordmark: lastraja.ro serif wordmark with a guard in a watchtower forming the "j" (`output/logo-strajer-concepts-2026-10-23/lastraja-logo-j.svg`, shipped as `public/lastraja-logo.svg` and `src/components/LastrajaLogo.tsx`; the tower alone is the favicon). Chosen by the user on 2026-10-25, replacing the earlier watchtower "L".
- Confirmed by the user (2026-10-25): ink-navy brand colour; red/yellow/green reserved for risk levels only; light theme plus a soft slate dark theme (never pure black), following the visitor's system with a manual toggle.

## Evidence on Hand

- 49 bills (B523–B588/2026), 391 named initiators, three model verdicts per bill, official PDFs and extracted texts, generated .docx memos in `public/docs/`.
- No testimonials, usage numbers or press coverage exist; none may be invented.

## Product Principles

1. One sentence first: every bill is understandable before any legal detail.
2. Show the disagreement: the three model scores are always reachable, never hidden behind the consensus.
3. The deadline is the product: open/closed status and days left are always accurate.
4. Cite the source: every claim links back to the official Senate file.
5. Neutral on parties: data about parties is counted, never characterised. Parties are compared by the average risk score of their bills, not by how many risky bills they co-signed, so volume alone never ranks a party first.
6. Calls to object only on high-risk bills: lower-risk bills ask for an opinion, and prepared texts may support a bill.

## Accessibility & Inclusion

Mobile-first; WCAG 2.2 AA contrast in both themes; risk is never conveyed by colour alone (always labelled).
