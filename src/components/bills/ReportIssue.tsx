'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Flag } from 'lucide-react';
import { MODELS, TURNSTILE_SITEKEY } from '@/lib/site';
import { resolvedTheme } from '@/lib/theme';
import { track, trackAttrs } from '@/lib/analytics';
import { btnPrimary, inputCls } from '@/components/ui';

export type ReportTarget = 'consensus' | 'agy' | 'claude' | 'codex';

const TARGETS: { value: ReportTarget; label: string }[] = [
  { value: 'consensus', label: 'Concluzia comună (scorul și rezumatul)' },
  ...MODELS.map((m) => ({ value: m.key as ReportTarget, label: `Analiza ${m.name}` })),
];
const MIN = 15;
const MAX = 1000;
// Aceeași valoare verifică și Worker-ul (worker/index.ts).
const TURNSTILE_ACTION = 'turnstile-spin-v2';

const ERRORS: Record<string, string> = {
  rate_limited: 'Ai trimis mai multe rapoarte într-un minut. Încearcă din nou puțin mai târziu.',
  captcha: 'Verificarea anti-roboți nu a mers. Bifeaz-o din nou și retrimite.',
  comment_length: `Scrie între ${MIN} și ${MAX} de caractere.`,
  busy: 'Avem acum prea multe rapoarte de verificat. Revino mâine, te rugăm.',
};

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let turnstileScript: Promise<Turnstile> | null = null;

// Scriptul Cloudflare se încarcă doar când cineva deschide formularul.
function loadTurnstile() {
  turnstileScript ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

// Cu cheia de test formularul apare doar local, ca un build publicat înainte de cheia reală să nu-l arate.
const TEST_KEY = TURNSTILE_SITEKEY.startsWith('1x0000');

export default function ReportIssue({ billId, target: initialTarget }: { billId: string; target: ReportTarget }) {
  const [enabled, setEnabled] = useState(!TEST_KEY);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ReportTarget>(initialTarget);
  const [comment, setComment] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const widgetEl = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const ids = useId();

  useEffect(() => {
    if (TEST_KEY && ['localhost', '127.0.0.1'].includes(location.hostname)) setEnabled(true);
  }, []);

  // Formularul urmează modelul pe care îl citești, până îl deschizi.
  useEffect(() => {
    if (!open) setTarget(initialTarget);
  }, [initialTarget, open]);

  const showWidget = open && status !== 'sent';
  useEffect(() => {
    if (!showWidget) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !widgetEl.current || widgetId.current) return;
        widgetId.current = ts.render(widgetEl.current, {
          sitekey: TURNSTILE_SITEKEY,
          action: TURNSTILE_ACTION,
          theme: resolvedTheme(),
          language: 'ro',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      })
      .catch(() => {
        setStatus('error');
        setError('Verificarea anti-roboți nu s-a putut încărca. Verifică dacă un blocant de reclame oprește challenges.cloudflare.com.');
      });
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [showWidget]);

  const length = comment.trim().length;
  const canSend = length >= MIN && length <= MAX && !!token && status !== 'sending';

  const send = async () => {
    if (!canSend) return;
    setStatus('sending');
    setError('');
    try {
      const r = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ billId, target, comment, token }),
      });
      if (r.ok) {
        setStatus('sent');
        track('report_sent', { bill_id: billId, target });
        return;
      }
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setError(ERRORS[body.error ?? ''] ?? 'Raportul nu a putut fi trimis. Încearcă din nou.');
    } catch {
      setError('Nu am putut trimite raportul. Verifică legătura la internet și încearcă din nou.');
    }
    setStatus('error');
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  };

  if (!enabled) return null;

  if (!open) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-body">
          <strong className="font-semibold text-ink">Ai găsit o greșeală în analiză?</strong> Modelele AI pot greși. Spune-ne ce nu se potrivește cu
          textul oficial și verificăm.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          {...trackAttrs('report_open', { bill_id: billId, target: initialTarget })}
          className="touch-target inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-sunken"
        >
          <Flag className="h-4 w-4" aria-hidden />
          Semnalează o greșeală
        </button>
      </div>
    );
  }

  if (status === 'sent') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-brand-soft p-5 text-[15px] leading-7 text-ink">
        <Check className="mt-1 h-5 w-5 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">Mulțumim, am primit raportul.</strong> Îl verificăm în zilele lucrătoare, dimineața. Dacă greșeala se
          confirmă în textul oficial, corectăm analiza și o notăm pe această pagină.
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-2xl border border-line bg-surface p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <h3 className="text-lg font-semibold text-ink">Semnalează o greșeală în analiza {billId}</h3>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-ink" htmlFor={`${ids}-target`}>
          Ce analiză e greșită?
          <select id={`${ids}-target`} value={target} onChange={(e) => setTarget(e.target.value as ReportTarget)} className={`${inputCls} px-3 font-normal`}>
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-comment`} className="text-sm font-semibold text-ink">
            Ce nu se potrivește?
          </label>
          <p id={`${ids}-hint`} className="text-sm leading-6 text-muted">
            Spune ce afirmație e greșită și, dacă poți, ce articol din textul oficial spune altceva. Nu scrie date personale.
          </p>
          <textarea
            id={`${ids}-comment`}
            aria-describedby={`${ids}-hint ${ids}-count`}
            rows={5}
            maxLength={MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface p-3 text-base leading-relaxed text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 sm:text-[15px]"
          />
          <p id={`${ids}-count`} className="text-right text-xs tabular-nums text-muted">
            {length < MIN ? `Încă cel puțin ${MIN - length} caractere` : `${comment.length}/${MAX}`}
          </p>
        </div>
        <div ref={widgetEl} className="min-h-[65px]" />
        {error && (
          <p role="alert" className="text-sm font-semibold text-ink">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted">
            Păstrăm doar textul raportului, proiectul și data. Îl citim noi și modelele AI care reverifică analiza.{' '}
            <Link href="/cookies#rapoarte" className="font-semibold text-link underline underline-offset-4">
              Detalii
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-muted hover:text-ink"
            >
              Renunță
            </button>
            <button type="submit" disabled={!canSend} className={`${btnPrimary} min-h-11 px-5 text-sm`}>
              {status === 'sending' ? 'Se trimite…' : 'Trimite raportul'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
