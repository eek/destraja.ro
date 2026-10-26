'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { trackAttrs } from '@/lib/analytics';
import { CopyButton } from '@/components/ui';

/** Mesajul de pornire, de copiat într-un e-mail sau o scrisoare. */
export default function ContactMessage({ slug, billId, subject, body }: { slug: string; billId: string; subject: string; body: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fără acces la clipboard textul rămâne selectabil în pagină.
    }
  };

  return (
    <details className="lg:border-t lg:border-line lg:pt-2">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg text-sm font-semibold text-body hover:text-ink">
        Un mesaj de pornire, despre {billId}
        <ChevronDown className="chevron h-4 w-4 shrink-0" aria-hidden />
      </summary>
      <div className="mt-1 rounded-xl bg-sunken p-4">
        <p className="text-sm font-semibold text-ink">Subiect: {subject}</p>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-body">{body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-muted">Completează ce e între paranteze. Un mesaj scurt și politicos primește mai ușor răspuns.</p>
          <CopyButton active={copied} onClick={copy} label="Copiază mesajul" track={trackAttrs('mp_contact', { mp: slug, channel: 'copy' })} />
        </div>
      </div>
    </details>
  );
}
