'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import type { AlertLevel } from '@/lib/alerts';
import { track } from '@/lib/analytics';
import { ALERTS_LIVE } from '@/lib/site';
import { TURNSTILE_LOAD_ERROR, useTurnstile, useTurnstileEnabled } from '@/lib/turnstile';
import { btnPrimary, inputCls, linkCls } from '@/components/ui';
import LevelPicker from './LevelPicker';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ERRORS: Record<string, string> = {
  email: 'Adresa de e-mail nu pare corectă. Verifică dacă lipsește o literă sau punctul din domeniu.',
  captcha: 'Verificarea anti-roboți nu a mers. Bifeaz-o din nou și retrimite.',
  rate_limited: 'Prea multe încercări într-un minut. Încearcă din nou puțin mai târziu.',
  busy: 'Avem acum prea multe abonări neconfirmate. Încearcă din nou mâine, te rugăm.',
  mail: 'Nu am putut trimite e-mailul de confirmare. Încearcă din nou peste câteva minute.',
};

export default function SubscribeForm({ initialLevel = 'yellow' }: { initialLevel?: AlertLevel }) {
  const turnstileReady = useTurnstileEnabled();
  // Local, cu wrangler dev, formularul merge și înainte de lansare, ca să-l putem testa.
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(['localhost', '127.0.0.1'].includes(location.hostname)), []);
  const enabled = turnstileReady && (ALERTS_LIVE || local);
  const ids = useId();
  const [level, setLevel] = useState<AlertLevel>(initialLevel);
  const [email, setEmail] = useState('');
  // Turnstile se încarcă abia când cineva începe să completeze formularul.
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const { el, token, reset } = useTurnstile(touched && status !== 'sent', () => {
    setStatus('error');
    setError(TURNSTILE_LOAD_ERROR);
  });

  const valid = EMAIL.test(email.trim());
  const canSend = valid && !!token && status !== 'sending';

  const send = async () => {
    if (!canSend) return;
    setStatus('sending');
    setError('');
    try {
      const r = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), level, token }),
      });
      if (r.ok) {
        setStatus('sent');
        track('subscribe_sent', { level });
        return;
      }
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      setError(ERRORS[body.error ?? ''] ?? 'Abonarea nu a mers. Încearcă din nou.');
    } catch {
      setError('Nu am putut trimite cererea. Verifică legătura la internet și încearcă din nou.');
    }
    setStatus('error');
    reset();
  };

  if (status === 'sent') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-brand-soft p-5 text-[15px] leading-7 text-ink sm:p-6">
        <MailCheck className="mt-1 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Verifică-ți căsuța de e-mail.</p>
          <p className="mt-1 text-body">
            Ți-am trimis la <strong className="font-semibold text-ink">{email.trim()}</strong> un link de confirmare, valabil 48 de ore. Până nu
            dai click pe el, nu primești nimic. Dacă nu apare în câteva minute, uită-te în Spam sau în Promoții.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      onFocus={() => setTouched(true)}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <LevelPicker value={level} onChange={setLevel} legend="Ce vrei să primești?" />
      <div className="grid gap-1.5">
        <label htmlFor={`${ids}-email`} className="text-sm font-semibold text-ink">
          Adresa ta de e-mail
        </label>
        <input
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nume@exemplu.ro"
          className={`${inputCls} px-4`}
        />
      </div>
      {enabled ? (
        <>
          {touched && <div ref={el} className="min-h-[65px]" />}
          {error && (
            <p role="alert" className="text-sm font-semibold text-ink">
              {error}
            </p>
          )}
          <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
            <button type="submit" disabled={!canSend} className={`${btnPrimary} min-h-12 shrink-0 whitespace-nowrap px-6 text-[15px]`}>
              {status === 'sending' ? 'Se trimite…' : 'Abonează-mă'}
            </button>
            <p className="text-xs leading-5 text-muted sm:max-w-[22rem] sm:text-right">
              Păstrăm doar adresa și nivelul ales. Te dezabonezi dintr-un click, din orice e-mail.{' '}
              <Link href="/cookies#alerte" className={linkCls}>
                Detalii
              </Link>
            </p>
          </div>
        </>
      ) : (
        <p className="text-sm font-semibold text-ink">Alertele pornesc în câteva zile. Revino curând.</p>
      )}
    </form>
  );
}
