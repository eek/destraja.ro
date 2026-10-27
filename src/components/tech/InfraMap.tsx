import type { ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { LOCAL_MODELS, OCR_ENGINE } from '@/lib/tech';

// Unde rulează fiecare bucată și ce circulă între ele (wrangler.jsonc, worker/, scripts/straja-daily.mjs), desenat
// cu aceeași linie ca lanțul de dimineață: senat.ro → Mac → Cloudflare → tu, cu o ramură din Mac spre GitHub.
// Pe ecran lat linia stă culcată și ce circulă e scris deasupra ei; pe telefon linia coboară pe stânga.

type Flow = { back?: boolean; text: string };

const STATION = 'absolute left-0 top-0 h-10 w-10 rounded-full border-[5px] border-brand';

function Flows({ flows, axis, className = '' }: { flows: Flow[]; axis: 'x' | 'y'; className?: string }) {
  return (
    <ul aria-label="Ce circulă" className={`flex flex-col ${className}`}>
      {flows.map((f) => {
        const Icon = axis === 'x' ? (f.back ? ArrowLeft : ArrowRight) : f.back ? ArrowUp : ArrowDown;
        return (
          <li key={f.text} className="flex items-center gap-2 text-sm leading-5 text-muted">
            <Icon className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} aria-hidden />
            <span>
              <span className="sr-only">{f.back ? 'Înapoi: ' : 'Mai departe: '}</span>
              {f.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Items({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 divide-y divide-line border-y border-line">
      {items.map((it) => (
        <li key={it} className="py-2 text-sm leading-6 text-body">
          {it}
        </li>
      ))}
    </ul>
  );
}

function Name({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h3 className="font-display text-2xl leading-tight text-ink">{title}</h3>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </>
  );
}

type Stop = { id: string; title: string; sub: string; items: string[]; flows?: Flow[]; end?: boolean; extra?: ReactNode };

export default function InfraMap() {
  const stops: Stop[] = [
    {
      id: 'senat',
      title: 'senat.ro',
      sub: 'și cdep.ro, sursa',
      items: ['Proiectele în consultare, cu PDF-urile și cronologia', 'Fișele parlamentarilor, o cerere pe secundă'],
      flows: [{ text: 'proiecte, documente, fișe' }],
    },
    {
      id: 'mac',
      title: 'Mac-ul întreținătorului',
      sub: 'Apple Silicon · luni–vineri, 08:00, prin launchd',
      items: [
        'Scripturile lanțului, în Node.js',
        'Gemini, Claude și ChatGPT, prin CLI-urile lor, închise',
        `OCR: ${OCR_ENGINE.name}, prin ${OCR_ENGINE.via}`,
        `${LOCAL_MODELS.map((m) => m.name).join(' și ')}, local, cu MLX`,
        'Build-ul site-ului static',
      ],
      flows: [{ text: 'site-ul, la fiecare publicare' }, { text: 'ediția alertelor, fără adrese' }, { back: true, text: 'rapoartele cititorilor' }],
    },
    {
      id: 'cf',
      title: 'Cloudflare',
      sub: 'lastraja.ro',
      items: [
        'Site-ul static, din exportul Next.js',
        'Un Worker pentru /api: rapoarte, abonări, alerte',
        'D1: rapoartele și abonații',
        'Turnstile, împotriva roboților',
        'Email Service, de la alerte@lastraja.ro',
        'Cel mult 5 rapoarte sau abonări pe minut de la o adresă',
      ],
      flows: [{ text: 'pagini și e-mailuri' }, { back: true, text: 'rapoarte și abonări' }],
      extra: (
        <p className="mt-4 text-sm leading-6 text-body">
          <strong className="font-semibold text-ink">Adresele de e-mail stau doar aici, în D1.</strong> Pe Mac nu ajunge niciuna: scriptul trimite ediția
          zilei, iar Worker-ul o expediază abonaților.
        </p>
      ),
    },
    { id: 'tu', title: 'Tu', sub: 'în browser', items: ['Pagini gata făcute, fără cont', 'Memoriul .docx, completat la tine în browser', 'Statistici doar dacă accepți'], end: true },
  ];

  return (
    <figure aria-labelledby="harta-caption">
      <figcaption id="harta-caption" className="sr-only">
        Harta infrastructurii, pe o singură linie: datele vin de pe senat.ro pe Mac-ul întreținătorului; Mac-ul publică site-ul pe Cloudflare, trimite
        ediția alertelor și pune datele pe GitHub, pe o ramură separată; tu citești paginile de pe Cloudflare și trimiți acolo rapoarte și abonări.
      </figcaption>
      <ol className="lg:grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {stops.map((s) => (
          <li key={s.id} className={`relative pl-14 lg:pl-0 lg:pr-8 ${s.end ? '' : 'pb-10 lg:pb-0'}`}>
            {/* Linia: în jos pe telefon, spre dreapta pe ecran lat. */}
            {!s.end && <span aria-hidden className="absolute left-4 top-5 h-full w-2 bg-brand lg:left-5 lg:top-[87px] lg:h-2.5 lg:w-full" />}
            <span aria-hidden className={`${STATION} lg:top-[72px] ${s.end ? 'bg-brand' : 'bg-surface'}`} />
            {s.flows && <Flows flows={s.flows} axis="x" className="absolute left-14 top-0 hidden h-16 justify-end gap-0.5 lg:flex" />}

            {s.id === 'mac' ? (
              <div className="lg:mt-[112px]">
                {/* Ramura spre GitHub: pe ecran lat, linia care coboară din Mac e marginea acestui bloc. */}
                <div className="lg:ml-[15px] lg:border-l-[10px] lg:border-brand lg:pb-8 lg:pl-[31px] lg:pt-3">
                  <Name title={s.title} sub={s.sub} />
                  <Items items={s.items} />
                  <Flows flows={[{ text: 'datele zilei, cu tot istoricul' }, { back: true, text: 'schimbări aprobate de întreținător' }]} axis="y" className="mt-6 gap-1" />
                </div>
                <div className="relative mt-6 pl-14 lg:mt-0">
                  {/* Pe telefon, ramura iese din linia principală spre dreapta. */}
                  <span aria-hidden className="absolute -left-10 top-4 h-2 w-10 bg-brand lg:hidden" />
                  <span aria-hidden className={`${STATION} bg-surface`} />
                  <Name title="GitHub" sub="github.com/eek/lastraja.ro, public" />
                  <Items items={['Codul (AGPL-3.0), prompturile și datele (CC BY 4.0)', 'Datele fiecărei zile, într-un commit', 'Orice schimbare din afară trece pe la întreținător']} />
                </div>
                {s.flows && <Flows flows={s.flows} axis="y" className="mt-6 gap-1 lg:hidden" />}
              </div>
            ) : (
              <div className="lg:mt-[124px] lg:pl-14">
                <Name title={s.title} sub={s.sub} />
                <Items items={s.items} />
                {s.extra}
                {s.flows && <Flows flows={s.flows} axis="y" className="mt-6 gap-1 lg:hidden" />}
              </div>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
