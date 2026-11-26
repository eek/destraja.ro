import { freshnessCounts } from '@/lib/fresh';

// Câte rezultate derivate erau învechite la build (aceeași verificare ca rândul „Prospețime” din rularea zilnică,
// scripts/check-fresh.mjs). Se refac în bugetul zilnic al fiecărui pas, cele mai riscante întâi.
export default function AdminFreshness() {
  const rows = freshnessCounts();
  return (
    <section aria-labelledby="prospetime" className="mt-10">
      <h2 id="prospetime" className="text-base font-semibold text-ink">
        Rezultate învechite la build
      </h2>
      <p className="mt-1 text-sm text-muted">Făcute din altă analiză, alt text, altă lege în vigoare sau altă versiune a instrucțiunilor; pe site apar cu nota „din analiza anterioară”.</p>
      <table className="mt-3 w-full max-w-xl text-sm">
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.type}>
              <td className="py-2 pr-4 text-body">{r.label}</td>
              <td className={`py-2 text-right tabular-nums ${r.stale ? 'font-semibold text-risk-red-text' : 'text-muted'}`}>
                {r.stale} din {r.total}
                {r.missing ? ` · ${r.missing} lipsă` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
