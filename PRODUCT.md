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
- Consultation deadlines move daily; a bill whose deadline passed stays visible as closed.
- Party "arc" (government vs opposition) is a dated editorial classification used for the coalition map; it must be revisited when the governing coalition changes.

## Capabilities and Constraints

- Static site (Next.js, static export), deployed on Cloudflare; no accounts, no server-side personal data. The .docx personalisation runs in the browser.
- Romanian only. Diacritics use comma-below ș/ț.
- Risk levels (red/yellow/green) come from the AI consensus, not a fixed score threshold.
- Open decision: operator identity and contact address for the privacy/cookie policy (not yet provided; `OPERATOR_NAME` / `CONTACT_EMAIL` in `src/lib/site.ts`, shown as „[de completat]” until set).

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
5. Neutral on parties: data about parties is counted, never characterised.

## Accessibility & Inclusion

Mobile-first; WCAG 2.2 AA contrast in both themes; risk is never conveyed by colour alone (always labelled).
