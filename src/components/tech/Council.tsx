import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { EnrichedBill } from '@/lib/types';
import { MODELS } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';
import { agreement } from '@/lib/stats';
import { toLite } from '@/lib/bills';
import { RiskChip } from '@/components/ui';

// Un proiect real, cele trei lecturi separate și media lor: aceleași cifre ca pe pagina proiectului.
// Furca e desenată din linii drepte, așa că se poate întinde pe orice lățime fără să se strâmbe.

// Centrul primei și al ultimei coloane din grila de dedesubt (--g e spațiul dintre coloane, aici zero).
const EDGE = 'calc((100% - 2 * var(--g)) / 6)';

function Fork({ down }: { down: boolean }) {
  return (
    <div aria-hidden className="relative h-10 [--g:0px]">
      <span className={`absolute left-1/2 w-0.5 -translate-x-1/2 bg-brand ${down ? 'top-0 h-5' : 'bottom-0 h-5'}`} />
      <span className="absolute top-5 h-0.5 -translate-y-1/2 bg-brand" style={{ left: EDGE, right: EDGE }} />
      {[EDGE, '50%', `calc(100% - ${EDGE})`].map((x) => (
        <span key={x} className={`absolute w-0.5 -translate-x-1/2 bg-brand ${down ? 'bottom-0 top-5' : 'top-0 bottom-5'}`} style={{ left: x }} />
      ))}
    </div>
  );
}

export default function Council({ bill }: { bill: EnrichedBill }) {
  const c = bill.analysis.consensus;
  const agree = agreement(toLite(bill));
  return (
    <figure>
      <figcaption className="sr-only">
        Exemplu: proiectul {bill.id}. Același text ajunge la Gemini, Claude și ChatGPT, care dau fiecare un scor; scorul comun e media lor,{' '}
        {fmt(c.riskScore)} din 10, {RISK[c.riskLevel].label.toLowerCase()}.
      </figcaption>

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-link" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold tabular-nums text-muted">{bill.id} · textul oficial</p>
          <p className="font-display mt-1 text-lg leading-snug text-ink">
            <Link href={`/legi/${bill.slug}`} className="hover:underline hover:underline-offset-4">
              {c.plainTitle}
            </Link>
          </p>
          <p className="mt-1 text-sm text-muted">Forma inițiatorului și expunerea de motive, ca text, plus fișa de pe senat.ro.</p>
        </div>
      </div>

      <Fork down />

      <ul className="grid grid-cols-3 divide-x divide-line">
        {MODELS.map((m) => {
          const v = bill.analysis.council[m.key];
          return (
            <li key={m.key} className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-5">
              <span className="text-sm font-semibold text-ink sm:text-base">{m.name}</span>
              <span className="hidden text-xs text-muted sm:block">{m.vendor}</span>
              <span className={`mt-3 text-2xl font-semibold tabular-nums sm:text-4xl ${RISK[v.riskLevel].text}`}>
                {fmt(v.riskScore)}
                <span className="text-sm font-medium text-muted sm:text-base">/10</span>
              </span>
              <span className="mt-2 h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span className={`block h-full rounded-full ${RISK[v.riskLevel].fill}`} style={{ width: `${Math.min(100, v.riskScore * 10)}%` }} />
              </span>
              <span className="mt-3 text-xs leading-4 text-muted">fără unelte, răspuns în JSON</span>
            </li>
          );
        })}
      </ul>

      <Fork down={false} />

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-semibold text-ink">Scorul comun: media celor trei</p>
        <RiskChip level={c.riskLevel} score={c.riskScore} size="md" />
        <p className="text-sm text-muted">{agree.label}</p>
      </div>
    </figure>
  );
}
