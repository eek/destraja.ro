'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CONTENT_LICENSE } from '@/lib/site';
import { copyText } from '@/lib/export';
import { trackAttrs } from '@/lib/analytics';
import { CopyButton, linkCls, panel } from '@/components/ui';

/** La finalul paginii unui proiect: citatul gata de lipit, cu linkul înapoi la pagină. */
export default function CiteBill({ billId, text }: { billId: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <aside aria-labelledby="citeaza" className={`${panel} mt-14 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
      <div className="max-w-[54ch]">
        <h2 id="citeaza" className="font-semibold text-ink">
          Scrii despre acest proiect?
        </h2>
        <p className="mt-1 text-sm leading-6 text-body">
          Preia ce ai nevoie din analiză, cu sursa ({CONTENT_LICENSE.name}), și pune linkul la pagina asta: cititorii tăi găsesc aici textul oficial și cum
          trimit o opinie.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
        <CopyButton label="Copiază citatul cu link" active={copied} onClick={copy} track={trackAttrs('press_copy', { item: 'citation', bill_id: billId, source: 'bill' })} />
        <Link href="/presa#citare" className={`${linkCls} inline-flex items-center gap-1 text-sm`}>
          Cum ne citezi
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}
