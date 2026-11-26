import { formatDateRo } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { analyzedVersion, type DocCopy } from '@/lib/documente';

const linkCls = 'font-medium text-link underline underline-offset-4 hover:text-ink';

/** „copie destrajă.ro” lângă linkul oficial al unui document: copia versiunii de acum, din R2 (worker/documente.ts). */
export function CopyLink({ copy, billId, doc }: { copy: DocCopy; billId: string; doc: string }) {
  return (
    <a
      href={copy.url}
      target="_blank"
      rel="noopener"
      title="Copia păstrată de noi; amprenta ei e în /documente/amprente.json"
      {...trackAttrs('document_copy_open', { bill_id: billId, doc })}
      className="inline-flex min-h-10 items-center text-xs font-medium text-muted underline underline-offset-4 hover:text-ink"
    >
      copie destrajă.ro
    </a>
  );
}

/**
 * Documentele schimbate la sursă după ce le-am copiat: ziua schimbării și ambele versiuni, cu cea citită de analiză
 * (analyzedVersion) numită așa. Nimic dacă niciun document nu s-a schimbat.
 */
export function ChangedDocs({ items, site, analyzedAt, billId }: { items: { label: string; copy: DocCopy }[]; site: 'senat.ro' | 'cdep.ro'; analyzedAt?: string | null; billId: string }) {
  const changed = items.filter((i) => i.copy.versions.length > 1);
  if (!changed.length) return null;
  const track = (version: string) => trackAttrs('document_copy_open', { bill_id: billId, version });
  return (
    <ul className="mt-3 w-full space-y-1 text-xs leading-5 text-muted">
      {changed.map(({ label, copy }) => {
        const last = copy.versions[copy.versions.length - 1];
        const before = copy.versions[copy.versions.length - 2];
        const read = analyzedAt ? analyzedVersion(copy, analyzedAt) : null;
        return (
          <li key={copy.file}>
            Documentul „{label}” de pe {site} s-a schimbat pe {formatDateRo(last.day)}
            {read && read !== last ? (
              <>
                ; vezi{' '}
                <a href={read.url} target="_blank" rel="noopener" className={linkCls} {...track('analizata')}>
                  versiunea pe care am analizat-o
                </a>{' '}
                și{' '}
                <a href={last.url} target="_blank" rel="noopener" className={linkCls} {...track('noua')}>
                  versiunea nouă
                </a>
                .
              </>
            ) : (
              <>
                {read ? '; analiza e făcută pe versiunea nouă' : ''}; vezi{' '}
                <a href={before.url} target="_blank" rel="noopener" className={linkCls} {...track('dinainte')}>
                  versiunea de dinainte
                </a>
                {read ? '' : (
                  <>
                    {' '}
                    și{' '}
                    <a href={last.url} target="_blank" rel="noopener" className={linkCls} {...track('noua')}>
                      pe cea nouă
                    </a>
                  </>
                )}
                .
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
