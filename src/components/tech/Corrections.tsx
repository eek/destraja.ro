import type { ReactNode } from 'react';
import { GateGlyph } from './PressGates';

// Drumul unui raport de greșeală (worker/report.ts, scripts/straja-reports.mjs), pe aceeași linie ca lanțul:
// cerc = un pas făcut de un om sau de un model, pătrat cu bifă = o verificare din cod, capsula = cele trei modele.

type Kind = 'stop' | 'gate' | 'three' | 'end';
type Step = { kind: Kind; title: string; text: ReactNode };

const STEPS: Step[] = [
  {
    kind: 'stop',
    title: 'Raportul tău',
    text: 'Îl trimiți de pe pagina proiectului. Turnstile oprește roboții, iar în baza de date nu păstrăm IP-ul tău sau alt identificator.',
  },
  {
    kind: 'gate',
    title: 'Filtrul din cod',
    text: 'Un raport care pare să dea ordine modelelor nu ajunge la ele: merge direct la un om.',
  },
  {
    kind: 'three',
    title: 'Trei verificări separate',
    text: 'Gemini, Claude și ChatGPT, fără unelte, compară raportul cu textul oficial. Raportul le ajunge marcat ca text nesigur.',
  },
  {
    kind: 'gate',
    title: 'Citatele, verificate',
    text: 'Afirmația contestată trebuie să existe, cuvânt cu cuvânt, în analiza noastră, iar citatul dat de model, în textul oficial.',
  },
  {
    kind: 'stop',
    title: 'Corectura',
    text: 'Doar dacă toate trei confirmă. Claude o scrie fără să vadă textul raportului; Gemini și ChatGPT trebuie s-o aprobe amândoi.',
  },
  {
    kind: 'end',
    title: 'Pe pagină, cu data',
    text: 'Corectura apare pe pagina proiectului, cu ziua în care am făcut-o. Orice alt raport ajunge la un om. Rapoartele verificate se șterg după 90 de zile.',
  },
];

function Marker({ kind }: { kind: Kind }) {
  if (kind === 'gate') return <GateGlyph className="absolute left-0 top-0" />;
  if (kind === 'three')
    return (
      <span aria-hidden className="absolute left-0 top-0 flex h-[4.5rem] w-8 flex-col items-center justify-center gap-1.5 rounded-full border-4 border-brand bg-surface">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 rounded-full bg-brand" />
        ))}
      </span>
    );
  return <span aria-hidden className={`absolute left-0 top-0 h-8 w-8 rounded-full border-4 border-brand ${kind === 'end' ? 'bg-brand' : 'bg-surface'}`} />;
}

export default function Corrections() {
  return (
    <ol aria-label="Drumul unui raport de greșeală">
      {STEPS.map((s, i) => (
        <li key={s.title} className={`relative pl-14 ${i === STEPS.length - 1 ? '' : 'pb-7'} ${s.kind === 'three' ? 'min-h-[6.25rem]' : ''}`}>
          {i < STEPS.length - 1 && <span aria-hidden className="absolute left-[14px] top-4 h-full w-1 bg-brand" />}
          <Marker kind={s.kind} />
          <h3 className="pt-1 text-base font-semibold text-ink">{s.title}</h3>
          <p className="mt-1 text-[15px] leading-7 text-body">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
