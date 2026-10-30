"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import type { CdepListItem } from "@/lib/cdep";
import type { RiskLevel } from "@/lib/types";
import { STAGES, shortDate, stageLabel, type StageKey } from "@/lib/cdep-text";
import { RISK } from "@/lib/risk";
import { RiskChip, segCls } from "@/components/ui";

// Bucățile de deasupra listei de la /camera. Fiecare cifră e un buton care filtrează lista (starea stă în CameraExplorer).

export const LEVELS: RiskLevel[] = ["red", "yellow", "green"];
const THRESHOLD: Record<RiskLevel, string> = {
  red: "scor de la 6,8",
  yellow: "scor de la 3,8",
  green: "scor sub 3,8",
};
const MONTHS = [
  "ian",
  "feb",
  "mar",
  "apr",
  "mai",
  "iun",
  "iul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const MONTHS_LONG = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];
export const monthLabel = (ym: string) =>
  MONTHS_LONG[Number(ym.slice(5, 7)) - 1];

export const byLevel = (list: CdepListItem[]) =>
  Object.fromEntries(
    LEVELS.map((l) => [l, list.filter((p) => p.risk?.level === l).length]),
  ) as Record<RiskLevel, number>;

const sectionTitle = "text-sm font-semibold text-ink";

/** O bară împărțită după risc; nu se apasă (butoanele sunt separate), ca nimeni să nu țintească o bucată de 2 px. */
function StackedBar({
  counts,
  className = "h-3",
}: {
  counts: Record<RiskLevel, number>;
  className?: string;
}) {
  const total = LEVELS.reduce((s, l) => s + counts[l], 0) || 1;
  return (
    <div
      aria-hidden
      className={`flex w-full gap-[2px] overflow-hidden rounded-full bg-sunken ${className}`}
    >
      {LEVELS.map(
        (l) =>
          counts[l] > 0 && (
            <span
              key={l}
              className={RISK[l].fill}
              style={{ width: `${(counts[l] / total) * 100}%` }}
            />
          ),
      )}
    </div>
  );
}

/** Barometrul: câte proiecte roșii, galbene și verzi sunt în universul ales; un click pe un nivel filtrează lista. */
export function Barometer({
  counts,
  unrated,
  risk,
  onRisk,
}: {
  counts: Record<RiskLevel, number>;
  unrated: number;
  risk: RiskLevel | null;
  onRisk: (l: RiskLevel | null) => void;
}) {
  const total = LEVELS.reduce((s, l) => s + counts[l], 0);
  return (
    <section aria-labelledby="barometru">
      <h2 id="barometru" className={sectionTitle}>
        Cât de riscante sunt
      </h2>
      <StackedBar counts={counts} className="mt-3 h-4" />
      <div
        role="group"
        aria-label="Filtrează după risc"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {LEVELS.map((l) => {
          const on = risk === l;
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => onRisk(on ? null : l)}
              className={`group flex flex-col items-start rounded-xl border px-3 py-3 text-left transition-colors sm:px-4 ${
                on
                  ? "border-ink bg-surface shadow-[0_1px_3px_rgb(var(--shadow-color)/0.12)]"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted sm:text-sm">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 rounded-full ${RISK[l].fill}`}
                />
                <span className="sm:hidden">
                  {RISK[l].short[0].toUpperCase() + RISK[l].short.slice(1)}
                </span>
                <span className="hidden sm:inline">{RISK[l].label}</span>
              </span>
              <span
                className={`mt-1 font-display text-3xl tabular-nums leading-none sm:text-4xl ${RISK[l].text}`}
              >
                {counts[l]}
              </span>
              <span className="mt-1.5 text-xs leading-4 text-muted">
                {total ? `${Math.round((counts[l] / total) * 100)}% · ` : ""}
                {THRESHOLD[l]}
              </span>
            </button>
          );
        })}
      </div>
      {unrated > 0 && (
        <p className="mt-2 text-xs text-muted">Încă fără analiză: {unrated}.</p>
      )}
    </section>
  );
}

export type ShowcaseTab = "risc" | "agravate" | "imblanzite" | "termen";

/** Vitrina: câteva proiecte de văzut întâi, pe teme, cu trimitere la lista întreagă. */
export function Showcase({
  tabs,
  active,
  onTab,
  onSeeAll,
}: {
  tabs: {
    key: ShowcaseTab;
    label: string;
    items: CdepListItem[];
    total: number;
    note: (p: CdepListItem) => string | null;
  }[];
  active: ShowcaseTab;
  onTab: (t: ShowcaseTab) => void;
  onSeeAll: (t: ShowcaseTab) => void;
}) {
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <section aria-labelledby="vitrina">
      <h2 id="vitrina" className={sectionTitle}>
        De văzut întâi
      </h2>
      <div
        role="tablist"
        aria-label="Ce proiecte"
        className="-mx-4 mt-3 flex gap-1 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={t.key === tab.key}
            aria-controls="vitrina-panou"
            onClick={() => onTab(t.key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
              t.key === tab.key
                ? "bg-ink text-paper"
                : "text-body hover:bg-sunken hover:text-ink"
            }`}
          >
            {t.label}
            <span className="font-normal tabular-nums opacity-75">
              {t.total}
            </span>
          </button>
        ))}
      </div>
      <div
        id="vitrina-panou"
        role="tabpanel"
        aria-labelledby={`tab-${tab.key}`}
        className="mt-3"
      >
        <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {tab.items.map((p) => {
            const note = tab.note(p);
            return (
              <li
                key={p.slug}
                className="w-[82%] shrink-0 snap-start sm:w-auto"
              >
                <Link
                  href={p.senat ? `/legi/${p.senat}` : `/camera/${p.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-sunken/40"
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {p.risk && (
                      <RiskChip level={p.risk.level} score={p.risk.score} />
                    )}
                    <span className="text-muted">
                      {p.numar} · {stageLabel(p.stage).toLowerCase()}
                    </span>
                  </span>
                  <span className="mt-2 line-clamp-3 font-display text-[17px] leading-snug text-ink group-hover:underline group-hover:underline-offset-4">
                    {p.risk?.plainTitle ?? p.titlu}
                  </span>
                  {note && (
                    <span className="mt-auto pt-2 text-xs font-semibold text-body">
                      {note}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {tab.total > tab.items.length && (
          <button
            type="button"
            onClick={() => onSeeAll(tab.key)}
            className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            Vezi toate cele {tab.total} în listă
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}

/** Etapele, fiecare cu riscul ei: un click pe etapă o alege, un click pe o cifră colorată alege etapa și riscul. */
export function Stages({
  list,
  keys,
  stage,
  risk,
  onPick,
}: {
  list: CdepListItem[];
  keys: StageKey[];
  stage: StageKey | null;
  risk: RiskLevel | null;
  onPick: (s: StageKey | null, r: RiskLevel | null) => void;
}) {
  const rows = keys
    .map((k) => ({ key: k, items: list.filter((p) => p.stage === k) }))
    .filter((r) => r.items.length);
  return (
    <section aria-labelledby="etape">
      <h2 id="etape" className={sectionTitle}>
        Unde sunt
      </h2>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((r) => {
          const counts = byLevel(r.items);
          const on = stage === r.key;
          return (
            <li
              key={r.key}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] ${on ? "bg-brand-soft/60" : ""}`}
            >
              <button
                type="button"
                aria-pressed={on && !risk}
                onClick={() => onPick(on && !risk ? null : r.key, null)}
                className="flex min-h-8 items-baseline gap-2 text-left"
              >
                <span className="text-sm font-semibold text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-ink">
                  {STAGES.find((s) => s.key === r.key)!.label}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {r.items.length}
                </span>
              </button>
              <span className="order-last col-span-2 sm:order-none sm:col-span-1">
                <StackedBar counts={counts} className="h-2.5" />
              </span>
              <span className="flex justify-end gap-1">
                {LEVELS.map((l) =>
                  counts[l] ? (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on && risk === l}
                      aria-label={`${STAGES.find((s) => s.key === r.key)!.label}: ${counts[l]} cu ${RISK[l].label.toLowerCase()}`}
                      onClick={() =>
                        onPick(
                          on && risk === l ? null : r.key,
                          on && risk === l ? null : l,
                        )
                      }
                      className={`inline-flex min-h-8 min-w-10 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-semibold tabular-nums transition-colors ${
                        on && risk === l
                          ? "bg-ink text-paper"
                          : `${RISK[l].chip} hover:brightness-95`
                      }`}
                    >
                      {counts[l]}
                    </button>
                  ) : (
                    <span
                      key={l}
                      aria-hidden
                      className="inline-flex min-h-8 min-w-10 items-center justify-center text-xs text-faint"
                    >
                      ·
                    </span>
                  ),
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Timeline: înregistrările pe luni (roșul la bază, ca lunile să se compare pe aceeași linie) sau termenele de amendamente. */
export function Timeline({
  list,
  today,
  month,
  day,
  onMonth,
  onDay,
}: {
  list: CdepListItem[];
  today: string;
  month: string | null;
  day: string | null;
  onMonth: (m: string | null) => void;
  onDay: (d: string | null) => void;
}) {
  const [mode, setMode] = useState<"luni" | "termene">(
    day ? "termene" : "luni",
  );
  const months = Object.entries(
    list.reduce<Record<string, CdepListItem[]>>(
      (acc, p) => ((acc[p.inregistrat.slice(0, 7)] ??= []).push(p), acc),
      {},
    ),
  ).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...months.map(([, ps]) => ps.length), 1);
  const peak = months.reduce(
    (a, b) => (b[1].length > a[1].length ? b : a),
    months[0],
  );
  const days = Object.entries(
    list
      .filter((p) => p.termenAmendamente && p.termenAmendamente >= today)
      .reduce<Record<string, CdepListItem[]>>(
        (acc, p) => ((acc[p.termenAmendamente!] ??= []).push(p), acc),
        {},
      ),
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section aria-labelledby="timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="timeline" className={sectionTitle}>
          {mode === "luni"
            ? "Când au fost înregistrate"
            : "Până când se pot propune amendamente"}
        </h2>
        <div
          role="group"
          aria-label="Ce arată timeline-ul"
          className="flex rounded-lg bg-sunken p-1"
        >
          <button
            type="button"
            aria-pressed={mode === "luni"}
            onClick={() => setMode("luni")}
            className={segCls(mode === "luni")}
          >
            Pe luni
          </button>
          <button
            type="button"
            aria-pressed={mode === "termene"}
            onClick={() => setMode("termene")}
            className={segCls(mode === "termene")}
          >
            Termene
          </button>
        </div>
      </div>

      {mode === "luni" ? (
        <>
          <div
            role="group"
            aria-label="Filtrează după luna înregistrării"
            className="mt-4 flex h-44 items-end gap-1.5 sm:gap-3"
          >
            {months.map(([ym, ps]) => {
              const c = byLevel(ps);
              const on = month === ym;
              return (
                <button
                  key={ym}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${monthLabel(ym)}: ${ps.length} proiecte, ${c.red} cu risc ridicat, ${c.yellow} moderat, ${c.green} redus`}
                  onClick={() => onMonth(on ? null : ym)}
                  className={`group flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-md px-0.5 pt-1 transition-colors ${on ? "bg-brand-soft" : "hover:bg-sunken"}`}
                >
                  <span className="text-[11px] font-semibold tabular-nums text-body">
                    {ps.length}
                  </span>
                  <span
                    className="mt-1 flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-t-[3px]"
                    style={{ height: `${(ps.length / max) * 100}%` }}
                  >
                    {LEVELS.map(
                      (l) =>
                        c[l] > 0 && (
                          <span
                            key={l}
                            className={RISK[l].fill}
                            style={{ height: `${(c[l] / ps.length) * 100}%` }}
                          />
                        ),
                    )}
                  </span>
                  <span
                    className={`mt-1.5 text-xs ${on ? "font-semibold text-ink" : "text-muted"}`}
                  >
                    {MONTHS[Number(ym.slice(5, 7)) - 1]}
                  </span>
                </button>
              );
            })}
          </div>
          {peak && (
            <p className="mt-3 text-xs leading-5 text-muted">
              Cele mai multe au fost înregistrate în {monthLabel(peak[0])} (
              {peak[1].length}). Culoarea arată riscul textului de acum, nu pe
              cel de la înregistrare.
            </p>
          )}
        </>
      ) : days.length ? (
        <ul
          role="group"
          aria-label="Filtrează după termenul de amendamente"
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {days.map(([d, ps]) => {
            const on = day === d;
            const sorted = [...ps].sort(
              (a, b) => (b.risk?.score ?? -1) - (a.risk?.score ?? -1),
            );
            return (
              <li key={d} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDay(on ? null : d)}
                  className={`flex min-w-24 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors ${on ? "border-ink bg-surface" : "border-line bg-surface hover:border-line-strong"}`}
                >
                  <span className="text-sm font-semibold text-ink">
                    {shortDate(d)}
                  </span>
                  <span className="text-xs text-muted">
                    {ps.length === 1 ? "1 proiect" : `${ps.length} proiecte`}
                  </span>
                  <span aria-hidden className="mt-1.5 flex flex-wrap gap-[3px]">
                    {sorted.map((p) => (
                      <span
                        key={p.slug}
                        className={`h-2.5 w-2.5 rounded-[2px] ${p.risk ? RISK[p.risk.level].fill : "bg-faint"}`}
                      />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Niciun termen de amendamente deschis acum.
        </p>
      )}
    </section>
  );
}

/** Rândul cu o notă scurtă pentru vitrină: schimbarea textului sau termenul. */
export function showcaseNote(
  kind: ShowcaseTab,
  p: CdepListItem,
  today: string,
): string | null {
  if (kind === "agravate" || kind === "imblanzite")
    return p.textChange
      ? `${p.textChange.direction === "mai_riscant" ? "Mai riscant" : "Mai puțin riscant"} după ${p.textChange.after === "senat" ? "Senat" : "Cameră"}`
      : null;
  if (kind === "termen" && p.termenAmendamente)
    return p.termenAmendamente >= today
      ? `Amendamente până pe ${shortDate(p.termenAmendamente)}`
      : null;
  return null;
}
