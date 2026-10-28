'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { trackAttrs } from '@/lib/analytics';
import { CopyButton, btnPrimary } from '@/components/ui';

/** Mesajul către comisia care face raportul: îl vezi întreg, îl copiezi sau îl deschizi în programul tău de e-mail. */
export default function WriteCommittee({ billId, to, subject, body }: { billId: string; to: string[]; subject: string; body: string }) {
  const [copied, setCopied] = useState(false);
  const mailto = `mailto:${to.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fără acces la clipboard: textul rămâne vizibil și se poate selecta.
    }
  };
  return (
    <div>
      <div className="rounded-xl border border-line bg-paper p-4">
        <p className="text-xs text-muted">
          Către: <span className="font-semibold text-ink">{to.join(', ')}</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          Subiect: <span className="font-semibold text-ink">{subject}</span>
        </p>
        <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-sm leading-6 text-body">{body}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href={mailto} {...trackAttrs('committee_email', { bill_id: billId })} className={`${btnPrimary} min-h-12 px-5 text-[15px]`}>
          <Mail className="h-4 w-4" aria-hidden />
          Scrie comisiei
        </a>
        <CopyButton active={copied} onClick={copy} label="Copiază textul" track={trackAttrs('committee_email_copy', { bill_id: billId })} />
      </div>
    </div>
  );
}
