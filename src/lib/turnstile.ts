'use client';

import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITEKEY } from '@/lib/site';
import { resolvedTheme } from '@/lib/theme';

// Aceeași valoare verifică și Worker-ul (worker/http.ts).
const TURNSTILE_ACTION = 'turnstile-spin-v2';

// Cu cheia de test formularele apar doar local, ca un build publicat înainte de cheia reală să nu le arate.
export const TURNSTILE_TEST_KEY = TURNSTILE_SITEKEY.startsWith('1x0000');

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

// Scriptul Cloudflare se încarcă doar când cineva chiar folosește un formular.
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

export const TURNSTILE_LOAD_ERROR =
  'Verificarea anti-roboți nu s-a putut încărca. Verifică dacă un blocant de reclame oprește challenges.cloudflare.com.';

/**
 * Widgetul Turnstile într-un element, cât timp `active` e adevărat. Întoarce tokenul curent și
 * reset(), de chemat după o trimitere eșuată (un token se poate folosi o singură dată).
 */
export function useTurnstile(active: boolean, onLoadError: () => void) {
  const el = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const onError = useRef(onLoadError);
  onError.current = onLoadError;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !el.current || widgetId.current) return;
        widgetId.current = ts.render(el.current, {
          sitekey: TURNSTILE_SITEKEY,
          action: TURNSTILE_ACTION,
          theme: resolvedTheme(),
          language: 'ro',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      })
      .catch(() => onError.current());
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [active]);

  const reset = () => {
    setToken(null);
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  };
  return { el, token, reset };
}

/** Formularele cu Turnstile apar pe site doar cu cheia reală, sau local cu cheia de test. */
export function useTurnstileEnabled() {
  const [enabled, setEnabled] = useState(!TURNSTILE_TEST_KEY);
  useEffect(() => {
    if (TURNSTILE_TEST_KEY && ['localhost', '127.0.0.1'].includes(location.hostname)) setEnabled(true);
  }, []);
  return enabled;
}
