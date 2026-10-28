import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { LastrajaLogo } from '@/components/LastrajaLogo';
import { ALERTS_LIVE, CONTENT_LICENSE, MODELS, SENAT_URL, SOURCE_URL } from '@/lib/site';
import { formatDateRo } from '@/lib/format';
import { ThemeSelect } from './ThemeControls';

const linkCls = 'text-body transition-colors hover:text-ink hover:underline';

export default function SiteFooter({ syncedAt }: { syncedAt: string | null }) {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1240px] gap-10 px-4 py-12 sm:px-8 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-5">
          <Link href="/" aria-label="destrajă.ro, pagina principală" className="inline-flex text-ink">
            <LastrajaLogo className="h-11 w-auto" />
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">
            destrajă.ro: radarul cetățenesc al proiectelor de lege aflate în consultare publică la Senatul României. Proiect civic
            independent; nu reprezentăm Senatul și nu lucrăm pentru niciun partid.
          </p>
          {syncedAt && <p className="mt-3 text-xs text-muted">Date preluate de pe senat.ro la {formatDateRo(syncedAt)}.</p>}
          {/* Alt proiect open source al autorului. Fără noreferrer, ca acolo să se vadă că vizitatorii vin de aici. */}
          <p className="mt-6 max-w-sm text-sm leading-6 text-muted">
            Alt proiect open source al autorului:{' '}
            <a href="https://droneincidents.eu/" target="_blank" rel="noopener" className="font-semibold text-body underline underline-offset-4 hover:text-ink">
              droneincidents.eu
            </a>
            , registrul dronelor venite din afara Uniunii care au ajuns în țările UE în 2026: incursiuni, doborâri și epave, cu hartă și cronologie.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 lg:col-span-7">
          <div>
            <h2 className="text-sm font-semibold text-ink">Site</h2>
            <ul className="mt-3 space-y-2">
              <li><Link href="/#legi" className={linkCls}>Legi în consultare</Link></li>
              <li><Link href="/parlamentari" className={linkCls}>Parlamentari</Link></li>
              <li><Link href="/presa" className={linkCls}>Presă și date</Link></li>
              <li><Link href="/metodologie" className={linkCls}>Metodologie</Link></li>
              <li><Link href="/cum-functioneaza" className={linkCls}>Cum funcționează</Link></li>
              {ALERTS_LIVE && <li><Link href="/abonare" className={linkCls}>Alerte pe e-mail</Link></li>}
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Surse oficiale</h2>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={SENAT_URL} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
                  Proiecte pe senat.ro <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
              <li>
                <a href="https://www.ces.ro" target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
                  Consiliul Economic și Social <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            </ul>
            <h2 className="mt-6 text-sm font-semibold text-ink">Analiză</h2>
            <p className="mt-2 text-muted">{MODELS.map((m) => m.name).join(' · ')}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <h2 className="text-sm font-semibold text-ink">Confidențialitate</h2>
            <ul className="mt-3 space-y-2">
              <li><Link href="/cookies" className={linkCls}>Politica de cookies</Link></li>
              <li><Link href="/cookies#alegerea-ta" className={linkCls}>Setări statistici</Link></li>
            </ul>
            <h2 className="mt-6 text-sm font-semibold text-ink">Tema</h2>
            <div className="mt-2">
              <ThemeSelect />
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto w-full max-w-[1240px] space-y-1 px-4 py-5 text-xs leading-5 text-muted sm:px-8 lg:px-10">
          <p>Analizele sunt generate cu AI și pot conține erori. Nu sunt consultanță juridică; verifică întotdeauna textul oficial pe senat.ro.</p>
          <p>
            Analizele și datele sunt sub licența{' '}
            <a href={CONTENT_LICENSE.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
              {CONTENT_LICENSE.name}
            </a>
            : preia-le liber, cu sursa și linkul la destrajă.ro.{' '}
            <Link href="/presa#citare" className="underline underline-offset-2 hover:text-ink">
              Cum ne citezi
            </Link>
            {SOURCE_URL && (
              <>
                {' · '}
                <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
                  Codul sursă
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
