'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Check, Flag } from 'lucide-react';
import { MODELS } from '@/lib/site';
import { TURNSTILE_LOAD_ERROR, useTurnstile, useTurnstileEnabled } from '@/lib/turnstile';
import { track, trackAttrs } from '@/lib/analytics';
import { btnPrimary, inputCls } from '@/components/ui';

export type ReportTarget = 'consensus' | 'agy' | 'claude' | 'codex';

const TARGETS: { value: ReportTarget; label: string }[] = [
  { value: 'consensus', label: 'Concluzia comună (scorul și rezumatul)' },
  ...MODELS.map((m) => ({ value: m.key as ReportTarget, label: `Analiza ${m.name}` })),
];
const MIN = 15;
const MAX = 1000;

const ERRORS: Record<string, string> = {
  rate_limited: 'Ai trimis mai multe rapoarte într-un minut. Încearcă din nou puțin mai târziu.',
  captcha: 'Verificarea anti-roboți nu a mers. Bifeaz-o din nou și retrimite.',
  comment_length: `Scrie între ${MIN} și ${MAX} de caractere.`,
  busy: 'Avem acum prea multe rapoarte de verificat. Revino mâine, te rugăm.',
};

export default function ReportIssue({ billId, target: initialTarget }: { billId: string; target: ReportTarget }) {
  const enabled = useTurnstileEnabled();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ReportTarget>(initialTarget);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const ids = useId();

  // Formularul urmează modelul pe care îl citești, până îl deschizi.
  useEffect(() => {
    if (!open) setTarget(initialTarget);
  }, [initialTarget, open]);

  const { el: widgetEl, token, reset } = useTurnstile(open && status !== 'sent', () => {
    setStatus('error');
    setError(TURNSTILE_LOAD_ERROR);
  });

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
    reset();
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
