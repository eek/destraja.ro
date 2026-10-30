'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Clock } from 'lucide-react';
import { levelLabel, type AlertLevel } from '@/lib/alerts';
import { track } from '@/lib/analytics';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { useHashParams } from './useHashParams';

type State = { kind: 'loading' } | { kind: 'ok'; level: AlertLevel; token: string } | { kind: 'expired' } | { kind: 'error' };

export default function ConfirmSubscription() {
  const params = useHashParams();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (!params || started.current) return;
    started.current = true;
    const token = params.get('t');
    if (!token) {
      setState({ kind: 'expired' });
      return;
    }
    fetch('/api/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { level?: AlertLevel; token?: string };
        if (r.ok && body.level && body.token) {
          setState({ kind: 'ok', level: body.level, token: body.token });
          track('subscribe_confirmed', { level: body.level });
        } else setState({ kind: r.status === 410 ? 'expired' : 'error' });
      })
      .catch(() => setState({ kind: 'error' }));
  }, [params]);

  if (state.kind === 'loading') {
    return (
      <p role="status" className="mt-6 text-lg text-muted">
        Confirmăm adresa…
      </p>
    );
  }

  if (state.kind === 'ok') {
    return (
      <div role="status" className="mt-6">
        <p className="flex items-start gap-3 text-lg leading-8 text-ink">
          <Check className="mt-1.5 h-5 w-5 shrink-0" aria-hidden />
          <span>
            Gata, abonarea e confirmată. Primești <strong className="font-semibold">„{levelLabel(state.level)}”</strong>, dimineața, în zilele
            lucrătoare în care apare ceva nou.
          </span>
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/senat#legi" className={`${btnPrimary} min-h-12 px-6`}>
            Vezi proiectele de acum
          </Link>
          <Link href={`/abonare/preferinte#t=${state.token}`} className={`${btnSecondary} min-h-12 px-5`}>
            Schimbă nivelul
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="mt-6">
      <p className="flex items-start gap-3 text-lg leading-8 text-ink">
        <Clock className="mt-1.5 h-5 w-5 shrink-0" aria-hidden />
        <span>
          {state.kind === 'expired'
            ? 'Linkul a expirat sau a fost deja folosit. Dacă ai confirmat deja, primești alertele; altfel, cere un link nou.'
            : 'Nu am putut confirma acum. Verifică legătura la internet și deschide din nou linkul din e-mail.'}
        </span>
      </p>
      <Link href="/abonare" className={`${btnSecondary} mt-8 min-h-12 px-5`}>
        Cere un link nou
      </Link>
    </div>
  );
}
