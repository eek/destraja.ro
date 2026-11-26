'use client';

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { CiteTarget } from '@/lib/citari';
import { type CiteAct, type CiteFile, type OwnUnit, FORM_LABEL, anchorFor, dayRo, extract, idLabel, splitId } from '@/lib/citari-text';
import { useAnchoredPopover } from '@/components/useAnchoredPopover';

// Fișierul trimiterilor unui proiect se încarcă o dată pe pagină, la primul popover deschis (sau la primul hover).
const loaded = new Map<string, Promise<CiteFile | null>>();
function load(src: string) {
  let p = loaded.get(src);
  if (!p) {
    p = fetch(src).then(
      (r) => (r.ok ? (r.json() as Promise<CiteFile>) : null),
      () => null,
    );
    p.then((f) => f ?? loaded.delete(src));
    loaded.set(src, p);
  }
  return p;
}

const OPEN_DELAY = 280;
const CLOSE_DELAY = 220;

/**
 * O trimitere din text („art. 54 alin. (3)”): un buton care arată ca textul din jur, cu o subliniere punctată discretă.
 * Pe desktop, hover-ul deschide textul exact al unității; click-ul (sau Enter, sau atingerea pe telefon) îl fixează.
 * Popover-ul e nativ (popover="auto"): Esc și click-ul în afară îl închid; pe telefon e o foaie jos.
 */
export default function CiteRef({ src, target, label, children }: { src: string; target: CiteTarget; label: string; children: ReactNode }) {
  const { id, btn, pop } = useAnchoredPopover<HTMLSpanElement>();
  const [file, setFile] = useState<CiteFile | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFile = useCallback(() => {
    load(src).then(setFile);
  }, [src]);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = useCallback(() => {
    fetchFile();
    const p = pop.current;
    if (p && !p.matches(':popover-open')) p.showPopover();
  }, [fetchFile, pop]);
  const hide = () => {
    const p = pop.current;
    if (p?.matches(':popover-open')) p.hidePopover();
  };

  useEffect(() => {
    const p = pop.current;
    if (!p) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open';
      setOpen(isOpen);
      if (!isOpen) pinned.current = false;
    };
    p.addEventListener('toggle', onToggle);
    return () => p.removeEventListener('toggle', onToggle);
  }, [pop]);
  useEffect(() => clear, []);

  // Hover doar cu mouse-ul; pe ecranele tactile, atingerea e click.
  const enter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    fetchFile();
    clear();
    if (!open) timer.current = setTimeout(show, OPEN_DELAY);
  };
  const leave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clear();
    if (!pinned.current) timer.current = setTimeout(hide, CLOSE_DELAY);
  };

  const onClick = () => {
    clear();
    if (open && pinned.current) {
      hide();
      return;
    }
    pinned.current = true;
    show();
  };

  const title = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={onClick}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={fetchFile}
        className={`cite-ref cursor-pointer rounded-[3px] text-left underline decoration-dotted decoration-[1.5px] underline-offset-[3px] transition-[text-decoration-color,background-color] duration-150 ${
          open ? 'bg-brand-soft decoration-link shadow-[0_0_0_2px_var(--brand-soft)]' : 'decoration-faint hover:decoration-link'
        }`}
      >
        {children}
      </button>
      <span
        ref={pop}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-t`}
        onPointerEnter={(e) => e.pointerType === 'mouse' && clear()}
        onPointerLeave={leave}
        // Pe telefon, aceeași foaie ca PopoverSheet (mobil): lipită jos, fundal întunecat, titlul fix sus.
        className="cite-pop fixed inset-auto m-0 max-h-[min(34rem,calc(100dvh-2rem))] w-[27rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left text-sm font-normal leading-6 text-body shadow-[var(--shadow-lift)] [&:popover-open]:flex max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[85dvh] max-sm:w-auto max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)] max-sm:backdrop:bg-black/50"
      >
        <span className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4 max-sm:mb-2 max-sm:min-h-14 max-sm:items-center max-sm:border-b max-sm:border-line max-sm:py-1.5 max-sm:pr-2">
          <span id={`${id}-t`} className="block text-[15px] font-semibold leading-6 text-ink max-sm:text-base">
            {title}
          </span>
          <button
            type="button"
            onClick={() => hide()}
            aria-label="Închide"
            className="-mr-2 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink max-sm:m-0 max-sm:h-11 max-sm:w-11"
          >
            <X className="h-4 w-4 max-sm:h-5 max-sm:w-5" aria-hidden />
          </button>
        </span>
        {open && <Body file={file} target={target} />}
      </span>
    </>
  );
}

function Body({ file, target }: { file: CiteFile | null | undefined; target: CiteTarget }) {
  if (file === undefined) return <span className="block px-5 pb-5 text-muted">Se încarcă textul…</span>;
  if (file === null)
    return <span className="block px-5 pb-5 text-muted">Nu am putut încărca textul acum. Încearcă din nou peste câteva clipe.</span>;
  if (target.t === 'own') return <OwnBody file={file} target={target} />;
  const act = file.acts[target.act];
  if (!act) return null;
  return <ActBody file={file} act={act} ids={target.ids} />;
}

/** „5^1” → 5<sup>1</sup>, ca pe portal. */
function Sup({ text }: { text: string }) {
  const parts = text.split(/\^(\d+)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <sup key={i} className="text-[0.7em]">
            {p}
          </sup>
        ) : (
          p
        ),
      )}
    </>
  );
}

function LawText({ text }: { text: string }) {
  return (
    <span className="block space-y-1.5 rounded-xl bg-sunken px-4 py-3 text-sm leading-[1.6] text-ink">
      {text.split('\n').map((l, i) => (
        <span key={i} className="block">
          <Sup text={l} />
        </span>
      ))}
    </span>
  );
}

const linkCls = 'inline-flex items-center gap-1 font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2';

/** Textul unităților cerute; dacă vreuna nu se găsește sau e ambiguă, tot articolul, cu motivul. */
function unitTexts(act: CiteAct, ids: string[]) {
  const [top] = splitId(ids[0]);
  const unit = act.units[top];
  if (!unit) return null;
  const parts = ids.map((id) => extract(unit, splitId(id)[1]));
  const whole = parts.find((p) => p.whole && p.why);
  if (whole && whole.whole) return { unit, top, text: unit.text, why: whole.why, wanted: ids };
  return { unit, top, text: parts.map((p) => p.text).join('\n'), why: null, wanted: ids };
}

function ActBody({ file, act, ids, nested = false }: { file: CiteFile; act: CiteAct; ids: string[]; nested?: boolean }) {
  const r = unitTexts(act, ids);
  if (!r) return null;
  const { unit, top, text, why } = r;
  const deep = file.deepAnchors && !why && ids.length === 1;
  const form = act.acte && act.asOf ? `/acte/${act.acte}/forma/${act.asOf}${anchorFor(deep ? ids[0] : top, deep)}` : null;
  const newer = act.acte && act.newerFrom ? `/acte/${act.acte}/forma/${act.newerFrom}${anchorFor(top, false)}` : null;
  const what = idLabel(ids[0].split('/').slice(0, 2).join('/'));
  return (
    <>
      <span className={nested ? 'block' : 'block overflow-y-auto overscroll-contain px-5 pb-3'}>
        <span className="block text-[13px] leading-5 text-muted">
          {act.name ? `${act.name} (${act.cite})` : act.cite}
          {unit.title && <> · {unit.label}, „{unit.title}”</>}
        </span>
        <span className="block text-[13px] leading-5 text-muted">Textul în vigoare, înainte de proiect.</span>
        {why && (
          <span className="mt-2 block text-[13px] leading-5 text-body">
            {why === 'ambiguous'
              ? `${what.replace(/^art\. \S+ /, '')} apare în mai multe alineate ale articolului, iar trimiterea nu spune care. Mai jos e tot articolul.`
              : `Nu am găsit ${idLabel(ids[0]).replace(/^art\. \S+ /, '')} în această formă (poate e una nouă, introdusă de proiect). Mai jos e tot articolul.`}
          </span>
        )}
        <span className="mt-2 block">
          <LawText text={text} />
          {unit.cut && <span className="mt-1 block text-[13px] text-muted">Textul continuă în lege.</span>}
        </span>
      </span>
      <span className={`block text-[13px] leading-5 text-muted ${nested ? 'pt-2' : 'border-t border-line px-5 pb-4 pt-3'}`}>
        {act.cite}, forma consolidată la {act.asOf ? dayRo(act.asOf) : 'data analizei'}
        {act.formFrom && act.formFrom !== act.asOf && ` (în vigoare din ${dayRo(act.formFrom)})`}, după legislatie.just.ro.
        {act.newerFrom && (
          <>
            {' '}
            Între timp a apărut o formă din {dayRo(act.newerFrom)}
            {unit.changed === true ? ', în care articolul arată altfel.' : unit.changed === false ? ', cu articolul neschimbat.' : '.'}
          </>
        )}
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {form && (
            <a href={form} target="_blank" rel="noopener noreferrer" className={linkCls}>
              Legea pe destrajă.ro
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          )}
          {newer && (
            <a href={newer} target="_blank" rel="noopener noreferrer" className={linkCls}>
              Forma nouă
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          )}
          {act.portalUrl && (
            <a href={act.portalUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
              Pe legislatie.just.ro
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          )}
        </span>
        {!nested && (
          <span className="mt-2 block text-xs leading-5 text-muted">
            Formele consolidate ale portalului sunt informative; textul oficial e cel publicat în Monitorul Oficial.{' '}
            <a href="/metodologie#citari" className="underline underline-offset-2 hover:text-ink">
              De unde vine textul
            </a>
          </span>
        )}
      </span>
    </>
  );
}

function ownUnit(units: Record<string, OwnUnit>, id: string) {
  const direct = units[id];
  const [top, sub] = splitId(id);
  const unit = direct ?? units[[top, ...sub].slice(0, 2).join('/')] ?? units[top];
  if (!unit) return null;
  return { unit, text: direct ? unit.text : extract(unit, sub.filter((s) => !s.startsWith('pct-'))).text };
}

function OwnBody({ file, target }: { file: CiteFile; target: Extract<CiteTarget, { t: 'own' }> }) {
  const units = file.own[target.form] ?? {};
  // „art. I pct. 1 și 2”: fiecare punct, la rând; un punct poate apărea o singură dată.
  const parts = [...new Set(target.ids)].map((id) => ownUnit(units, id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const shown = parts.filter((p, i) => parts.findIndex((q) => q.unit === p.unit) === i);
  if (!shown.length) return null;
  const refs = shown.flatMap((p) => p.unit.refs ?? []).filter((r) => file.acts[r.act]?.units[splitId(r.ids[0])[0]]);
  return (
    <>
      <span className="block overflow-y-auto overscroll-contain px-5 pb-3">
        <span className="block text-[13px] leading-5 text-muted">
          Proiectul {file.billId}, {FORM_LABEL[target.form]}
        </span>
        {shown.map((p, i) => (
          <span key={i} className="mt-2 block">
            <LawText text={p.text} />
            {p.unit.cut && <span className="mt-1 block text-[13px] text-muted">Textul continuă în documentul proiectului.</span>}
          </span>
        ))}
        {refs.map((r) => (
          <span key={r.ids.join()} className="mt-4 block border-t border-line pt-3">
            <span className="block text-[13px] font-semibold leading-5 text-ink">Ce scrie acum la {r.label}</span>
            <ActBody file={file} act={file.acts[r.act]} ids={r.ids} nested />
          </span>
        ))}
      </span>
      {!refs.length && (
        <span className="block border-t border-line px-5 pb-4 pt-3 text-[13px] leading-5 text-muted">
          Textul proiectului, cum l-am citit din documentul oficial de pe site-ul Parlamentului.
        </span>
      )}
    </>
  );
}
