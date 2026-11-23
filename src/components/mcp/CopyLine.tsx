'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { trackAttrs } from '@/lib/analytics';

/**
 * Un rând de copiat (adresa MCP-ului, o comandă), cu butonul lângă el. Pe telefon textul se rupe întâi la spații, iar butonul
 * trece dedesubt când nu mai încape; fără ligaturi, ca „--transport” să rămână două liniuțe. Butonul spune pentru cititorul
 * de ecran ce copiază („Copiază comanda pentru Codex”), iar „Copiat” se anunță.
 */
export default function CopyLine({ text, item, what }: { text: string; item: string; what: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fără acces la clipboard, textul rămâne de selectat de mână.
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-xl bg-sunken py-2 pl-4 pr-2">
      <code className="min-w-0 flex-1 basis-56 font-mono text-[13px] leading-6 text-ink [font-variant-ligatures:none] [overflow-wrap:anywhere]">{text}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiază ${what}`}
        {...trackAttrs('mcp_copy', { item })}
        className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
          copied ? 'border-brand bg-brand-soft text-ink' : 'border-line-strong text-body hover:border-muted hover:text-ink'
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        {copied ? 'Copiat' : 'Copiază'}
      </button>
      <span role="status" className="sr-only">
        {copied ? `Am copiat ${what}.` : ''}
      </span>
    </div>
  );
}
