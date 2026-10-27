'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyThemePref, readThemePref, resolvedTheme, type ThemePref } from '@/lib/theme';
import { trackAttrs } from '@/lib/analytics';

function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system');
  const [resolved, setResolved] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const sync = () => {
      setPref(readThemePref());
      setResolved(resolvedTheme());
    };
    sync();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', sync);
    window.addEventListener('lastraja-theme', sync);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('lastraja-theme', sync);
    };
  }, []);

  return { pref, resolved };
}

export function ThemeToggle() {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={() => applyThemePref(dark ? 'light' : 'dark')}
      {...trackAttrs('theme_change', { theme: dark ? 'light' : 'dark', control: 'header' })}
      aria-label={dark ? 'Treci la tema luminoasă' : 'Treci la tema întunecată'}
      title={dark ? 'Tema luminoasă' : 'Tema întunecată'}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink"
    >
      {resolved === null ? <span className="h-[18px] w-[18px]" /> : dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Automată' },
  { value: 'light', label: 'Luminoasă' },
  { value: 'dark', label: 'Întunecată' },
];

export function ThemeSelect() {
  const { pref } = useTheme();
  return (
    // Coloana din subsol e îngustă pe la 1100 px: butoanele trec pe rândul următor în loc să lărgească pagina.
    <div role="radiogroup" aria-label="Tema site-ului" className="inline-flex max-w-full flex-wrap rounded-lg bg-sunken p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pref === o.value}
          onClick={() => applyThemePref(o.value)}
          {...trackAttrs('theme_change', { theme: o.value, control: 'footer' })}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            pref === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
