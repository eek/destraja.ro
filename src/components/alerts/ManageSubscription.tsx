'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { levelLabel, type AlertLevel } from '@/lib/alerts';
import { track } from '@/lib/analytics';
import { btnPrimary, btnSecondary } from '@/components/ui';
import LevelPicker from './LevelPicker';
import { useHashParams } from './useHashParams';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; email: string; level: AlertLevel }
  | { kind: 'gone' }
  | { kind: 'unsubscribed' }
  | { kind: 'error' };

async function call(token: string, body: Record<string, string>) {
  const r = await fetch('/api/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, ...body }) });
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as { email?: string; level?: AlertLevel } };
}

export default function ManageSubscription() {
  const params = useHashParams();
  const token = useRef<string | null>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [level, setLevel] = useState<AlertLevel>('yellow');
  const [saved, setSaved] = useState<AlertLevel | null>(null);
  const [busy, setBusy] = useState(false);
  // Venit din linkul „Dezabonează-te”: butonul de dezabonare e primul lucru pe care îl vezi.
  const leaving = params?.get('a') === 'dezabonare';

  useEffect(() => {
    if (!params || token.current) return;
    token.current = params.get('t');
    if (!token.current) {
      setState({ kind: 'gone' });
      return;
    }
    call(token.current, { action: 'get' })
      .then((r) => {
        if (r.ok && r.body.level && r.body.email) {
          setState({ kind: 'ready', email: r.body.email, level: r.body.level });
          setLevel(r.body.level);
        } else setState({ kind: r.status === 404 ? 'gone' : 'error' });
      })
      .catch(() => setState({ kind: 'error' }));
  }, [params]);

  const save = async () => {
    if (!token.current || state.kind !== 'ready') return;
    setBusy(true);
    const r = await call(token.current, { action: 'level', level }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setState({ ...state, level });
      setSaved(level);
      track('alert_level_change', { level });
    } else setState({ kind: 'error' });
  };

  const unsubscribe = async () => {
    if (!token.current) return;
    setBusy(true);
    const r = await call(token.current, { action: 'unsubscribe' }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setState({ kind: 'unsubscribed' });
      track('unsubscribe');
    } else setState({ kind: 'error' });
  };

  if (state.kind === 'loading') {
    return (
      <p role="status" className="mt-6 text-lg text-muted">
        Căutăm abonarea…
      </p>
    );
  }

  if (state.kind === 'unsubscribed' || state.kind === 'gone') {
    return (
      <div role="status" className="mt-6">
        <p className="flex items-start gap-3 text-lg leading-8 text-ink">
          <Check className="mt-1.5 h-5 w-5 shrink-0" aria-hidden />
          {state.kind === 'unsubscribed'
            ? 'Gata, te-am scos din listă și am șters adresa. Nu mai primești e-mailuri de la noi.'
            : 'Această adresă nu mai e abonată. Dacă te-ai dezabonat deja, nu trebuie să faci nimic.'}
        </p>
        <Link href="/abonare" className={`${btnSecondary} mt-8 min-h-12 px-5`}>
          Abonează-te din nou
        </Link>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <p role="alert" className="mt-6 text-lg leading-8 text-ink">
        Nu am putut încărca preferințele. Verifică legătura la internet și deschide din nou linkul din e-mail.
      </p>
    );
  }

  const unsubscribeBlock = (
    <div className={leaving ? 'mt-8' : 'mt-12 border-t border-line pt-8'}>
      <h2 className="text-lg font-semibold text-ink">Nu mai vrei alertele?</h2>
      <p className="mt-2 text-[15px] leading-7 text-body">Te scoatem din listă și ștergem adresa. Te poți abona din nou oricând.</p>
      <button type="button" disabled={busy} onClick={() => void unsubscribe()} className={`${leaving ? btnPrimary : btnSecondary} mt-4 min-h-12 px-5`}>
        Dezabonează-mă
      </button>
    </div>
  );

  return (
    <div className="mt-6">
      <p className="text-lg leading-8 text-muted">
        Alertele pentru <strong className="font-semibold text-ink">{state.email}</strong>: acum primești „{levelLabel(state.level)}”.
      </p>
      {leaving && unsubscribeBlock}
      <form
        className={leaving ? 'mt-12 border-t border-line pt-8' : 'mt-8'}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <LevelPicker value={level} onChange={setLevel} legend="Schimbă nivelul" />
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={busy || level === state.level} className={`${leaving ? btnSecondary : btnPrimary} min-h-12 px-6`}>
            Salvează
          </button>
          <p role="status" className="text-sm text-muted">
            {saved && saved === state.level && `Salvat. De mâine primești „${levelLabel(saved)}”.`}
          </p>
        </div>
      </form>
      {!leaving && unsubscribeBlock}
    </div>
  );
}
