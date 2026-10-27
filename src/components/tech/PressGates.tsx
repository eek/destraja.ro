import type { ReactNode } from 'react';
import { Check, CornerDownRight, Search } from 'lucide-react';
import { countWord } from '@/lib/format';
import { LABEL_MIN_CONFIDENCE, LOCAL_MODELS, PRESS_QUESTIONS, type TechFacts } from '@/lib/tech';

// Porțile prin care trece un link de presă (scripts/straja-news.mjs, scripts/lib/web.mjs), în ordinea din cod.
// Fiecare poartă spune ce lasă să treacă și ce oprește.

type Gate = { title: string; text: ReactNode; stop: string };

/** Pătratul cu bifă: aici verifică codul, nu un model. Același semn ca pe harta lanțului. */
export function GateGlyph({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-lg border-4 border-brand bg-surface ${className}`}>
      <Check className="h-4 w-4 text-ink" strokeWidth={3} />
    </span>
  );
}

function gates(f: TechFacts): Gate[] {
  return [
    {
      title: 'Pagina se deschide?',
      text: 'O descărcăm noi, în cel mult 15 secunde, și trebuie să fie o pagină web.',
      stop: 'linkuri inventate, pagini blocate',
    },
    {
      title: 'E o redacție?',
      text: 'Nu site-uri oficiale ca senat.ro, nu rețele sociale, nu motoare de căutare.',
      stop: 'surse care nu sunt presă',
    },
    {
      title: 'Citatul e în pagină?',
      text: 'Propoziția copiată de model trebuie să apară în articol: întreagă sau o bucată de 60 de caractere la rând. Altfel, măcar numărul proiectului.',
      stop: 'citate parafrazate sau inventate',
    },
    {
      title: 'E din perioada proiectului?',
      text: 'Nu mai vechi cu un an decât înregistrarea proiectului la Senat.',
      stop: 'articole mai vechi cu peste un an',
    },
    {
      title: 'E o publicație urmărită?',
      text: `${f.allowlisted ? `Publicațiile din lista noastră, de ${countWord(f.allowlisted, 'redacție', 'redacții')}, apar direct.` : 'Publicațiile din lista noastră apar direct.'} Celelalte apar doar dacă modelele locale spun că articolul e chiar despre proiect.`,
      stop: 'preluări și articole care doar pomenesc proiectul',
    },
  ];
}

export function PressGates({ facts }: { facts: TechFacts }) {
  const list = gates(facts);
  return (
    <figure aria-labelledby="porti-caption">
      <figcaption id="porti-caption" className="sr-only">
        Cele cinci verificări din cod prin care trece fiecare link de presă, de la căutare până pe site.
      </figcaption>
      <div className="relative flex items-start gap-6 pb-6 lg:items-center lg:gap-4 lg:pb-0">
        <span aria-hidden className="absolute left-[14px] top-4 h-full w-1 bg-brand lg:hidden" />
        <span aria-hidden className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
          <Search className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <p className="text-[15px] leading-7 text-body">
          <strong className="font-semibold text-ink">Modelele caută.</strong> Gemini, Claude și ChatGPT dau, fiecare, adrese de articole și câte o
          propoziție copiată din ele. De aici înainte decide codul.
        </p>
      </div>

      <ol className="lg:mt-8 lg:grid lg:grid-cols-5">
        {list.map((g, i) => (
          <li key={g.title} className="relative pb-8 pl-14 lg:pb-0 lg:pl-0 lg:pr-6">
            <span aria-hidden className="absolute left-[14px] top-0 h-full w-1 bg-brand lg:left-0 lg:top-[14px] lg:h-1 lg:w-full" />
            <GateGlyph className="absolute left-0 top-0 lg:relative" />
            <h3 className="pt-1 text-base font-semibold text-ink lg:mt-4 lg:pt-0">
              <span className="sr-only">Verificarea {i + 1}: </span>
              {g.title}
            </h3>
            <p className="mt-1.5 text-[15px] leading-7 text-body lg:text-sm lg:leading-6">{g.text}</p>
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted">
              <CornerDownRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="sr-only">Oprește: </span>
                {g.stop}
              </span>
            </p>
          </li>
        ))}
      </ol>

      <div className="flex items-start gap-6 lg:mt-8 lg:items-center lg:gap-4">
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-4 border-brand bg-brand" />
        <p className="text-[15px] leading-7 text-body">
          <strong className="font-semibold text-ink">Pe site.</strong> Titlul, publicația și data le luăm din pagina articolului, nu de la model.
          {facts.articles > 0 && (
            <>
              {' '}
              Până azi au trecut{' '}
              <strong className="font-semibold tabular-nums text-ink">
                {countWord(facts.articles, 'articol', 'articole')} din {countWord(facts.outlets, 'publicație', 'publicații')}
              </strong>
              .
            </>
          )}
        </p>
      </div>
    </figure>
  );
}

/** Modelele locale și ce întreabă: patru întrebări fixe, o probabilitate pe variantă, eticheta doar unde sunt de acord. */
export function LocalModels() {
  const threshold = Math.round(LABEL_MIN_CONFIDENCE * 100);
  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div>
        <h3 className="font-display text-2xl leading-tight text-ink sm:text-3xl">Ce fel de articol e?</h3>
        <p className="mt-3 text-[15px] leading-7 text-body">
          Fiecare articol verificat e citit apoi de două modele de decizie care rulează local, pe Mac. Nu scriu text: răspund la patru întrebări
          fixe, cu o probabilitate pentru fiecare variantă. Textul articolului îl curățăm întâi de meniuri și reclame, cu trafilatura.
        </p>
        <ul className="mt-5 divide-y divide-line border-y border-line">
          {LOCAL_MODELS.map((m) => (
            <li key={m.name} className="py-4">
              <p className="font-semibold text-ink">
                {m.name} <span className="font-normal text-muted">· {m.maker}</span>
              </p>
              <p className="mt-1 text-sm leading-6 text-body">
                Model de decizie open source ({m.license}), cu {m.params} de parametri. Rulează cu {m.runtime} ({m.weights}).
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-6 text-muted">
          Pe 46 de articole etichetate de mână, cele două au nimerit poziția în 84% din cazurile în care au fost de acord.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-7">
        <dl className="divide-y divide-line">
          {PRESS_QUESTIONS.map((q) => (
            <div key={q.q} className="flex flex-col gap-2 py-3.5 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <dt className="text-[15px] font-semibold text-ink">{q.q}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {q.options.length ? (
                  q.options.map((o) => (
                    <span key={o} className="rounded-md bg-sunken px-2 py-1 text-xs font-semibold text-body">
                      {o}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted">o listă fixă de tipuri</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 border-t border-line pt-6">
          <p className="text-[15px] font-semibold text-ink">Cât de sigur e?</p>
          <div className="relative mt-4" aria-hidden>
            <div className="relative mb-2 h-5 text-xs text-muted">
              <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${threshold / 2}%` }}>
                nicio etichetă
              </span>
              <span className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-ink" style={{ left: `${50 + threshold / 2}%` }}>
                eticheta apare
              </span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              <span className="tech-hatch h-full" style={{ width: `${threshold}%` }} />
              <span className="h-full flex-1 bg-brand" />
            </div>
            <span className="absolute top-6 h-5 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${threshold}%` }} />
            <div className="relative mt-2 h-5 text-xs tabular-nums text-muted">
              <span className="absolute left-0">0%</span>
              <span className="absolute -translate-x-1/2 font-semibold text-ink" style={{ left: `${threshold}%` }}>
                {threshold}%
              </span>
              <span className="absolute right-0">100%</span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-body">
            Eticheta apare doar dacă ambele modele aleg aceeași variantă, fiecare cu cel puțin {threshold}% încredere. Altfel, articolul rămâne
            fără etichetă.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Pozițiile organizațiilor: aceleași porți, plus trei. */
export function PositionChecks({ facts }: { facts: TechFacts }) {
  const extra = [
    { title: 'Emitentul e în document', text: 'Numele organizației trebuie să apară în textul paginii sau al PDF-ului.' },
    { title: 'Citatul spune poziția', text: 'Cuvintele citatului trebuie să se potrivească cu ce cere: retragere, respingere, modificare sau susținere.' },
    {
      title: 'Semnatarii se numără din document',
      text: 'Numărăm lista numerotată, verificăm că numerotarea nu are goluri și o comparăm cu totalul anunțat în text. Persoanele fizice apar doar ca număr.',
    },
  ];
  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
      <div>
        <h3 className="font-display text-2xl leading-tight text-ink sm:text-3xl">Pozițiile organizațiilor trec prin aceleași porți. Și prin încă trei.</h3>
        <p className="mt-3 text-[15px] leading-7 text-body">
          Scrisorile, petițiile și punctele de vedere le căutăm și pe site-urile emitenților, nu doar în presă. Proiectele cu risc ridicat sau aproape de
          termen le verificăm zilnic, cele cu risc moderat la trei zile, restul o dată pe săptămână.
        </p>
        {facts.positions > 0 && (
          <p className="mt-4 text-[15px] leading-7 text-body">
            Până azi:{' '}
            <strong className="font-semibold tabular-nums text-ink">
              {countWord(facts.positions, 'poziție verificată', 'poziții verificate')}
              {facts.organisations > 0 && `, de la ${countWord(facts.organisations, 'organizație', 'organizații')}`}
            </strong>
            .
          </p>
        )}
      </div>
      <ol className="divide-y divide-line border-y border-line">
        {extra.map((e) => (
          <li key={e.title} className="flex gap-4 py-5">
            <GateGlyph className="shrink-0" />
            <div>
              <h4 className="text-base font-semibold text-ink">{e.title}</h4>
              <p className="mt-1 text-[15px] leading-7 text-body">{e.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
