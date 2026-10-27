import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { LOCAL_MODELS, OCR_ENGINE } from '@/lib/tech';

// Unde rulează fiecare bucată și ce circulă între ele (wrangler.jsonc, worker/, scripts/straja-daily.mjs).
// Pe ecran lat: senat.ro → Mac → Cloudflare pe primul rând, GitHub sub Mac, cititorul sub Cloudflare.
// Pe telefon totul stă într-o coloană, în ordinea drumului (zonele din .tech-infra, globals.css).

type Flow = { back?: boolean; text: string };

function Flows({ id, flows, axis, lead }: { id: string; flows: Flow[]; axis: 'x' | 'y'; lead?: string }) {
  return (
    <ul aria-label="Ce circulă" className={`flex flex-col justify-center gap-1.5 py-3 ${axis === 'x' ? 'lg:px-1 lg:py-0' : 'lg:items-start lg:px-5'}`} style={{ gridArea: id }}>
      {lead && <li className="text-sm font-semibold text-ink lg:hidden">{lead}</li>}
      {flows.map((f) => {
        const Y = f.back ? ArrowUp : ArrowDown;
        const X = f.back ? ArrowLeft : ArrowRight;
        return (
          <li key={f.text} className="flex items-center gap-2 text-sm leading-5 text-muted">
            <span className="text-brand" aria-hidden>
              <Y className={`h-4 w-4 ${axis === 'x' ? 'lg:hidden' : ''}`} strokeWidth={2.5} />
              {axis === 'x' && <X className="hidden h-4 w-4 lg:block" strokeWidth={2.5} />}
            </span>
            <span>
              <span className="sr-only">{f.back ? 'Înapoi: ' : 'Spre: '}</span>
              {f.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Place({ id, title, sub, items }: { id: string; title: string; sub: string; items: string[] }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface p-5" style={{ gridArea: id }}>
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="text-sm text-muted">{sub}</p>
      <ul className="mt-3 divide-y divide-line border-t border-line">
        {items.map((it) => (
          <li key={it} className="py-2 text-sm leading-6 text-body">
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function InfraMap() {
  return (
    <figure aria-labelledby="harta-caption">
      <figcaption id="harta-caption" className="sr-only">
        Harta infrastructurii: datele vin de pe senat.ro pe Mac-ul întreținătorului; Mac-ul publică site-ul pe Cloudflare, trimite ediția alertelor și
        pune datele pe GitHub; tu citești paginile de pe Cloudflare și trimiți acolo rapoarte și abonări.
      </figcaption>
      <div className="tech-infra grid gap-0 lg:gap-x-2">
        <Place id="senat" title="senat.ro și cdep.ro" sub="sursa" items={['Proiectele în consultare, cu PDF-urile și cronologia', 'Fișele parlamentarilor, o cerere pe secundă']} />
        <Flows id="f1" axis="x" flows={[{ text: 'proiecte, documente, fișe' }]} />
        <Place
          id="mac"
          title="Mac-ul întreținătorului"
          sub="Apple Silicon · luni–vineri, 08:00, prin launchd"
          items={[
            'Scripturile lanțului, în Node.js',
            'Gemini, Claude și ChatGPT, prin CLI-urile lor, închise',
            `OCR: ${OCR_ENGINE.name}, prin ${OCR_ENGINE.via}`,
            `${LOCAL_MODELS.map((m) => m.name).join(' și ')}, local, cu MLX`,
            'Build-ul site-ului static',
          ]}
        />
        <Flows
          id="f2"
          axis="x"
          flows={[{ text: 'site-ul, la fiecare publicare' }, { text: 'ediția alertelor, fără adrese' }, { back: true, text: 'rapoartele cititorilor' }]}
        />
        <Place
          id="cf"
          title="Cloudflare"
          sub="lastraja.ro"
          items={[
            'Site-ul static, din exportul Next.js',
            'Un Worker pentru /api: rapoarte, abonări, alerte',
            'D1: rapoartele și abonații',
            'Turnstile, împotriva roboților',
            'Email Service, de la alerte@lastraja.ro',
            'Cel mult 5 rapoarte sau abonări pe minut de la o adresă',
          ]}
        />
        <Flows id="f3" axis="y" flows={[{ text: 'pagini și e-mailuri' }, { back: true, text: 'rapoarte și abonări' }]} />
        <Place id="tu" title="Tu" sub="în browser" items={['Pagini gata făcute, fără cont', 'Memoriul .docx, completat la tine în browser', 'Statistici doar dacă accepți']} />
        <Flows id="f4" axis="y" lead="Tot de pe Mac:" flows={[{ text: 'datele zilei, cu tot istoricul' }, { back: true, text: 'schimbări aprobate de întreținător' }]} />
        <Place
          id="gh"
          title="GitHub"
          sub="github.com/eek/lastraja.ro, public"
          items={['Codul (AGPL-3.0), prompturile și datele (CC BY 4.0)', 'Datele fiecărei zile, într-un commit', 'Orice schimbare din afară trece pe la întreținător']}
        />
        <p className="mt-6 text-[15px] leading-7 text-body lg:mt-0 lg:self-end lg:pr-6" style={{ gridArea: 'note' }}>
          <strong className="font-semibold text-ink">Adresele de e-mail stau doar în D1, pe Cloudflare.</strong> Pe Mac nu ajunge niciuna: scriptul trimite
          ediția zilei, iar Worker-ul o expediază abonaților.
        </p>
      </div>
    </figure>
  );
}
