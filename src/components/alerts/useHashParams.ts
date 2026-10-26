'use client';

import { useLayoutEffect, useState } from 'react';

/**
 * Citește parametrii de după # din linkurile primite pe e-mail (#t=…) și îi scoate imediat din bara
 * de adrese. Efectul de layout rulează înaintea oricărui useEffect, deci și înainte să pornească
 * Google Analytics, așa că tokenul nu ajunge în statistici, în istoric sau într-un link copiat.
 * `null` până la prima randare în browser.
 */
export function useHashParams() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useLayoutEffect(() => {
    const hash = new URLSearchParams(location.hash.slice(1));
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    setParams(hash);
  }, []);
  return params;
}
