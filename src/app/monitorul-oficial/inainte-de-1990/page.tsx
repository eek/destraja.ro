import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getMoPre1990, portalUrl, type MoOldAct, type MoPre1990 } from '@/lib/mo';
import { countWord, formatDateRo } from '@/lib/format';
import { Container, linkCls } from '@/components/ui';
import { ro, Swatch } from '@/components/mo/charts';
import { DecadeLedger, yearBinLabels, YEAR_BINS } from '@/components/mo/pre1990';

export const metadata: Metadata = {
  title: 'Înainte de 1990: actele din Buletinul Oficial și din vechiul Monitor',
  description:
    'Ce mai păstrează Portalul Legislativ din anii de dinainte de 1990: actele pe decenii, cine le semna, de la Parlament și rege la Consiliul de Stat, cele mai vechi și cele încă citate de actele de azi.',
  openGraph: { title: 'Înainte de 1990: actele din Buletinul Oficial și din vechiul Monitor · destrajă.ro', description: 'Actele de dinainte de 1990 păstrate în Portalul Legislativ, pe decenii, cu cele mai vechi și cele încă citate azi.' },
};

/** „393 de acte”, „1 act”, cu cifra scrisă românește (1.203). */
const de = (n: number, many: string, one = many) => countWord(n, one, many).replace(/^-?[\d.]+/, ro(n));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const year = (iso: string | null) => (iso ? iso.slice(0, 4) : '');
/** „anii ’70” */
const decadeWord = (d: number) => (d >= 1900 ? `anii ’${String(d).slice(2)}` : `anii ${d}`);

export default async function InainteDe1990Page() {
  const data = await getMoPre1990();
  if (!data || !data.totals.acts) notFound();
  const { totals, decades, eras, types, oldest, cited, longLived, unpublishedBy } = data;
  const top = decades.reduce((a, b) => (b.acts > a.acts ? b : a));
  const sparse = decades.filter((d) => d.decade < 1920).reduce((s, d) => s + d.acts, 0);
  const fromSixties = decades.filter((d) => d.decade >= 1960).reduce((s, d) => s + d.acts, 0);
  const first = oldest[0];
  const rsr = eras.find((e) => e.key === 'rsr');
  const rsrTop = rsr?.issuers[0];
  const dec89 = eras.find((e) => e.key === 'revolutie');

  return (
    <>
      <section aria-labelledby="p90-title" className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <nav aria-label="Înapoi">
            <Link href="/monitorul-oficial" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-muted hover:text-ink">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Monitorul Oficial, în cifre
            </Link>
          </nav>
          <h1 id="p90-title" className="font-display mt-4 max-w-4xl text-[clamp(2.4rem,5vw,4.1rem)] font-normal leading-[1.04] tracking-[-0.025em]">
            <span className="block text-muted">Înainte de 1990.</span>
            <span className="block font-medium text-ink">
              {de(totals.acts, 'acte', 'act')} păstrate, din {year(totals.first)} până în decembrie 1989.
            </span>
          </h1>
          <p className="mt-5 max-w-[62ch] text-lg leading-8 text-body">
            Ce mai are Portalul Legislativ din vechiul Monitor Oficial și din Buletinul Oficial al anilor comuniști: legi, decrete, hotărâri, tratate. Nu e
            tot ce s-a publicat atunci, ci ce a ajuns în portal, mai ales actele care au contat și după.
          </p>
          <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted">
            {ro(totals.withText)} dintre ele au și textul în portal. Fiecare act de pe pagină duce la pagina lui de pe legislatie.just.ro.{' '}
            <a href="#acoperire" className="underline underline-offset-4 hover:text-ink">
              Ce acoperă datele
            </a>
            .
          </p>
        </Container>
      </section>

      <section aria-label="Pe scurt" className="border-b border-line bg-sunken/60">
        <Container className="grid gap-px py-8 sm:grid-cols-3 sm:py-10">
          {first && <Fact value={year(first.date)} text="cel mai vechi act din portal" note={`${first.designation}${first.subject ? `, ${first.subject}` : ''}.`} />}
          <Fact
            value={ro(top.acts)}
            text={`de acte din ${decadeWord(top.decade)}, cel mai plin deceniu`}
            note={`${pct(top.acts, totals.acts)}% din tot ce are portalul de dinainte de 1990.`}
          />
          {totals.unpublished > 0 && (
            <Fact
              value={ro(totals.unpublished)}
              text="de acte marcate „nepublicat”"
              note={`Portalul le are, dar ele n-au apărut în Buletinul Oficial.${unpublishedBy[0] ? ` ${ro(unpublishedBy[0][1])} sunt ale ${genitive(unpublishedBy[0][0])}.` : ''}`}
            />
          )}
        </Container>
      </section>

      <section aria-labelledby="decenii" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="decenii" title={`Cele mai multe sunt din ${decadeWord(top.decade)}`}>
            Până în 1920, portalul are doar {de(sparse, 'acte', 'act')}; din anii ’60 încolo, {ro(fromSixties)}. Nu înseamnă că înainte se legifera mai puțin:
            dintr-o epocă rămân în portal mai ales actele de care s-a mai avut nevoie mai târziu.
          </SectionHead>
          <div className="mt-8 max-w-[920px]">
            <DecadeLedger decades={decades} />
            <div className="mt-4 hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs text-body sm:flex">
              <span className="font-semibold text-ink">Acte într-un an:</span>
              <Swatch fill="var(--mo-0)">niciunul</Swatch>
              {YEAR_BINS.map((_, i) => (
                <Swatch key={i} fill={`var(--mo-${i + 1})`}>
                  {yearBinLabels[i]}
                </Swatch>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              Un rând e un deceniu; <span className="hidden sm:inline">pătrățelele sunt cei zece ani ai lui, iar </span>bara e totalul deceniului. Anul e al
              Monitorului sau al Buletinului în care a apărut actul, altfel al actului.
            </p>
          </div>
        </Container>
      </section>

      <section aria-labelledby="cine" className="border-b border-line bg-sunken/60">
        <Container className="py-14 sm:py-20">
          <SectionHead id="cine" title="Cine semna: de la Parlament și rege la Consiliul de Stat">
            Emitenții care apar cel mai des în portal, perioadă cu perioadă.
            {rsr && rsrTop && (
              <>
                {' '}
                Între 1965 și 1989, {ro(rsrTop[1])} din cele {ro(rsr.acts)} de acte sunt ale {genitive(rsrTop[0])}.
              </>
            )}
            {dec89 && dec89.acts > 0 && dec89.issuers[0] && (
              <>
                {' '}
                În ultimele zece zile din 1989 apar alte {ro(dec89.acts)}, {dec89.issuers[0][1] >= dec89.acts * 0.9 ? 'aproape toate' : `${ro(dec89.issuers[0][1])} dintre ele`} ale{' '}
                {genitive(dec89.issuers[0][0])}.
              </>
            )}
          </SectionHead>
          <ol className="mt-10 divide-y divide-line border-y border-line">
            {eras.map((e) => (
              <Era key={e.key} era={e} />
            ))}
          </ol>
          <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
            <div className="max-w-[60ch]">
              <h3 className="text-lg font-semibold text-ink">Ce fel de acte</h3>
              <p className="mt-2 text-[15px] leading-7 text-body">
                Decretele sunt {pct(types.find(([k]) => k === 'decrete')?.[1] ?? 0, totals.acts)}% din tot ce are portalul de dinainte de 1990. Acordurile,
                convențiile și protocoalele sunt înțelegeri cu alte state sau cu organizații internaționale.
              </p>
            </div>
            <TypeBars types={types} total={totals.acts} />
          </div>
        </Container>
      </section>

      <section aria-labelledby="vechi" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="vechi" title="Cele mai vechi acte din portal">
            Primele {oldest.length}, după dată. Datele și titlurile sunt cele din portal, cu ortografia vremii; un act fără titlu în portal apare doar cu numele lui.
          </SectionHead>
          <ol className="mt-8 max-w-[920px] divide-y divide-line border-y border-line">
            {oldest.map((a) => (
              <ActRow key={a.id} act={a} lead={<span className="text-sm font-semibold tabular-nums text-ink">{formatDateRo(a.date)}</span>} />
            ))}
          </ol>
        </Container>
      </section>

      {cited && cited.top.length > 0 && (
        <section aria-labelledby="citate" className="border-b border-line bg-sunken/60">
          <Container className="py-14 sm:py-20">
            <SectionHead id="citate" title="Încă citate de actele de azi">
              Actele vechi pe care le numesc cel mai des actele din portal, cele mai multe de după 1990: câte acte diferite citează fiecare lege sau decret,
              după număr și an.
              {cited.citedAtLeastOnce != null && (
                <>
                  {' '}
                  Din cele {ro(totals.acts)} de acte vechi, {ro(cited.citedAtLeastOnce)} sunt citate măcar o dată.
                </>
              )}
            </SectionHead>
            <CitedList acts={cited.top} />
            <p className="mt-4 max-w-[72ch] text-xs leading-5 text-muted">
              Cifra: câte acte distincte numesc actul vechi („Legea nr. 32/1968”, „Decretul nr. 167 din 10 aprilie 1958”), fără formele consolidate. Codurile
              citate doar după nume („Codul civil”) nu intră aici. Obiectele scrise <em className="font-display">cursiv</em> nu sunt în titlul din portal: le-am luat
              din textele care citează actul, cea mai des întâlnită formulare.
            </p>
          </Container>
        </section>
      )}

      {longLived.length > 0 && (
        <section aria-labelledby="coduri" className="border-b border-line">
          <Container className="py-14 sm:py-20">
            <SectionHead id="coduri" title="Coduri de atunci, aplicate și după 1989">
              Codul civil a fost adoptat în {year(longLived[0].date)} și s-a aplicat până în {year(longLived[0].until)}: a trecut prin monarhie, prin comunism și
              prin primele două decenii de după 1989. Câteva coduri vechi, cu data la care le-au luat locul cele noi.
            </SectionHead>
            <CodeTimeline codes={longLived} />
          </Container>
        </section>
      )}

      <section aria-labelledby="acoperire" className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <SectionHead id="acoperire" title="Ce acoperă datele">
            Indexul{' '}
            <a href="https://legislatie.just.ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
              Portalului Legislativ
            </a>{' '}
            al Ministerului Justiției, nu colecția Monitorului sau a Buletinului Oficial. E o selecție, nu o arhivă: cifrele spun ce are portalul, nu cât s-a
            legiferat.
          </SectionHead>
          <ul className="mt-6 grid max-w-[72ch] gap-3 text-[15px] leading-7 text-body">
            <li>
              <strong className="font-semibold text-ink">Publicația.</strong> Monitorul Oficial apare din decembrie 1832, când primul număr s-a numit „Buletin.
              Gazetă administrativă”. Între 1949 și 1989 actele statului au apărut în Buletinul Oficial (al Republicii Populare Române, din 1965 al Republicii
              Socialiste România); din 22 decembrie 1989, din nou în Monitorul Oficial.
            </li>
            <li>
              <strong className="font-semibold text-ink">Ce numărăm.</strong> Actele din portal cu data Monitorului sau a Buletinului dinainte de 1 ianuarie 1990
              (altfel, data actului). Formele consolidate și republicările listate ca acte separate nu se numără.
              {totals.publishedLater > 0 && (
                <> Alte {ro(totals.publishedLater)} de acte, semnate înainte de 1990 dar publicate abia după (mai ales tratate ratificate mai târziu), nu intră.</>
              )}
            </li>
            <li>
              <strong className="font-semibold text-ink">Emitenții și perioadele.</strong> Emitentul e cel din portal, cu variantele de scriere strânse sub același
              nume; „Regele Carol” e Carol I sau Carol al II-lea după dată. Perioadele se despart la 1 decembrie 1918, 30 decembrie 1947 (proclamarea Republicii
              Populare), 21 august 1965 (Constituția Republicii Socialiste) și 22 decembrie 1989.
            </li>
            {cited && (
              <li>
                <strong className="font-semibold text-ink">Citările.</strong> Numărate în textele actelor din setul public romanian-law-data (o copie a
                portalului{cited.docsScanned ? `, ${ro(cited.docsScanned)} de texte` : ''}), cu expresii regulate, fără niciun model: un act vechi e citat de un
                text care îl numește după tip, număr și an. Numerele purtate de două acte vechi de același tip, din același an, se sar.
              </li>
            )}
            {longLived.length > 0 && (
              <li>
                <strong className="font-semibold text-ink">Codurile.</strong> O listă scurtă, verificată de mână: data până la care s-a aplicat fiecare cod vine
                din legea care l-a înlocuit, citită în textul ei din portal.
              </li>
            )}
          </ul>
          <p className="mt-6 text-sm text-muted">
            Tabelul portalului la {formatDateRo(data.tableGeneratedAt ?? data.generatedAt)}
            {data.citationsGeneratedAt && <>, citările numărate pe {formatDateRo(data.citationsGeneratedAt)}</>}. Restul cifrelor, din 1990 încoace:{' '}
            <Link href="/monitorul-oficial" className={linkCls}>
              Monitorul Oficial, în cifre
            </Link>
            .
          </p>
        </Container>
      </section>
    </>
  );
}

/** „Consiliul de Stat” → „Consiliului de Stat”, pentru „ale …”. Doar emitenții care pot ajunge în frază. */
function genitive(name: string) {
  const map: Record<string, string> = {
    'Consiliul de Stat': 'Consiliului de Stat',
    'Consiliul de Miniștri': 'Consiliului de Miniștri',
    'Marea Adunare Națională': 'Marii Adunări Naționale',
    Parlamentul: 'Parlamentului',
    'Consiliul Frontului Salvării Naționale': 'Consiliului Frontului Salvării Naționale',
    Guvernul: 'Guvernului',
  };
  return map[name] ?? name;
}

function SectionHead({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[68ch]">
      <h2 id={id} className="font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-normal leading-[1.12] tracking-[-0.015em] text-ink">
        {title}
      </h2>
      <p className="mt-4 text-[15px] leading-7 text-body sm:text-base sm:leading-7">{children}</p>
    </div>
  );
}

function Fact({ value, text, note }: { value: string; text: string; note: string }) {
  return (
    <div className="border-t border-line-strong py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-1 sm:first:border-l-0 sm:first:pl-0">
      <p className="text-[clamp(2.2rem,4vw,3rem)] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">{value}</p>
      <p className="mt-2 text-[15px] font-semibold leading-6 text-ink">{text}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{note}</p>
    </div>
  );
}

function Era({ era }: { era: MoPre1990['eras'][number] }) {
  const max = Math.max(...era.issuers.map(([, n]) => n), 1);
  return (
    <li className="grid gap-4 py-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-14">
      <div>
        <p className="text-sm tabular-nums text-muted">{era.span}</p>
        <h3 className="font-display mt-1 text-[1.3rem] leading-tight tracking-[-0.015em] text-ink">{era.label}</h3>
        <p className="mt-2 text-[clamp(1.6rem,3vw,2rem)] font-semibold leading-none tracking-[-0.02em] text-ink tabular-nums">
          {ro(era.acts)} <span className="text-[15px] font-normal tracking-normal text-muted">{era.acts === 1 ? 'act' : 'de acte'}</span>
        </p>
      </div>
      <div>
        <ul className="grid gap-2" aria-label={`Emitenții cei mai frecvenți, ${era.span}`}>
          {era.issuers.map(([name, n]) => (
            <li key={name} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_3.5rem]">
              <span className="text-[15px] leading-6 text-body">{name}</span>
              <span className="relative col-span-2 row-start-2 block h-2.5 sm:col-span-1 sm:row-start-auto" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--mo-4)]" style={{ width: `max(3px, ${(n / max) * 100}%)` }} />
              </span>
              <span className="text-right text-sm font-semibold tabular-nums text-ink sm:row-start-auto">{ro(n)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm leading-6 text-muted">
          {era.types.map(([k, n]) => `${k} ${ro(n)}`).join(' · ')}
        </p>
      </div>
    </li>
  );
}

function TypeBars({ types, total }: { types: [string, number][]; total: number }) {
  const max = Math.max(...types.map(([, n]) => n), 1);
  return (
    <ol className="divide-y divide-line border-y border-line" aria-label="Actele dinainte de 1990 după tip">
      {types.map(([k, n]) => (
        <li key={k} className="grid grid-cols-[7.5rem_minmax(0,1fr)_3.75rem] items-center gap-x-3 py-2 text-sm">
          <span className="text-body first-letter:uppercase">{k}</span>
          <span className="relative block h-3" aria-hidden>
            <span className={`absolute inset-y-0 left-0 rounded-[3px] ${k === 'alte acte' ? 'bg-[var(--mo-other)]' : 'bg-[var(--mo-5)]'}`} style={{ width: `max(3px, ${(n / max) * 100}%)` }} />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-semibold text-ink">{ro(n)}</span>
            <span className="sr-only"> ({pct(n, total)}%)</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Subject({ act }: { act: MoOldAct }) {
  if (!act.subject) return null;
  return (
    <span className={`font-display mt-0.5 block text-[1.125rem] leading-snug text-body ${act.subjectFrom === 'citari' ? 'italic' : ''}`}>
      {act.subject.charAt(0).toUpperCase() + act.subject.slice(1)}
    </span>
  );
}

function ActLink({ act }: { act: MoOldAct }) {
  // TODO: pagina actului pe destraja.ro/acte (/acte/p/<id>), la lansare; până atunci, pagina din Portalul Legislativ.
  return (
    <a
      href={portalUrl(act.id)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1.5 text-[15px] font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2"
    >
      {act.designation}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 self-center" aria-hidden />
      <span className="sr-only">(pe legislatie.just.ro, se deschide într-o filă nouă)</span>
    </a>
  );
}

function ActRow({ act, lead }: { act: MoOldAct; lead: React.ReactNode }) {
  return (
    <li className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
      <div>{lead}</div>
      <div className="min-w-0">
        <ActLink act={act} />
        <Subject act={act} />
        {act.issuer && <span className="mt-1 block text-sm text-muted">{act.issuer}</span>}
      </div>
    </li>
  );
}

function CitedList({ acts }: { acts: MoOldAct[] }) {
  const max = Math.max(...acts.map((a) => a.citedBy ?? 0), 1);
  return (
    <ol className="mt-8 max-w-[1000px] divide-y divide-line border-y border-line">
      {acts.map((a) => (
        <li key={a.id} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="flex items-center gap-3 sm:block">
            <p className="shrink-0 text-sm tabular-nums text-body">
              <span className="text-lg font-semibold text-ink">{ro(a.citedBy ?? 0)}</span> {(a.citedBy ?? 0) === 1 ? 'act' : 'de acte'}
            </p>
            <span className="relative block h-2.5 flex-1 sm:mt-2" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-[3px] bg-[var(--mo-4)]" style={{ width: `max(3px, ${((a.citedBy ?? 0) / max) * 100}%)` }} />
            </span>
          </div>
          <div className="min-w-0">
            <ActLink act={a} />
            <Subject act={a} />
            <span className="mt-1 block text-sm text-muted">
              {[a.issuer, formatDateRo(a.date)].filter(Boolean).join(' · ')}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const MARKS = ['1947-12-30', '1989-12-22'];
const AXIS_FROM = 1850;
const AXIS_TO = 2025;
const at = (iso: string) => {
  const y = Number(iso.slice(0, 4)) + (Number(iso.slice(5, 7)) - 1) / 12;
  return ((y - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100;
};

/** Codurile pe o axă 1850–2025: bara merge de la adoptare la ziua în care l-a înlocuit codul nou. */
function CodeTimeline({ codes }: { codes: MoPre1990['longLived'] }) {
  const ticks = [1850, 1875, 1900, 1925, 1950, 1975, 2000, 2025];
  return (
    <figure className="mt-10 max-w-[1000px]">
      <figcaption className="sr-only">Perioada în care s-a aplicat fiecare cod, de la adoptare până la înlocuire.</figcaption>
      <div>
        <ol className="divide-y divide-line border-y border-line">
          {codes.map((c) => (
            <li key={c.id} className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center">
              <div>
                <a href={portalUrl(c.id)} target="_blank" rel="noopener noreferrer" className="font-display text-[1.3rem] leading-tight text-ink underline decoration-line-strong decoration-1 underline-offset-4 hover:decoration-ink">
                  {c.name}
                </a>
                <p className="mt-0.5 text-sm tabular-nums text-muted">
                  {year(c.date)}–{year(c.until)}
                </p>
              </div>
              <div>
                <span className="relative block h-4" aria-hidden>
                  <span className="absolute inset-y-0 rounded-[3px] bg-[var(--mo-5)]" style={{ left: `${at(c.date)}%`, width: `${at(c.until) - at(c.date)}%` }} />
                  {/* Liniile de regim trec peste bară, ca să se vadă unde o taie. */}
                  {MARKS.map((m) => (
                    <span key={m} className="absolute -inset-y-1.5 border-l border-dashed border-line-strong mix-blend-normal" style={{ left: `${at(m)}%` }} />
                  ))}
                </span>
                <p className="mt-1.5 text-sm leading-6 text-body">
                  Adoptat pe {formatDateRo(c.date)}, aplicat până pe {formatDateRo(c.until)}: {c.by}.
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-2 grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-x-6" aria-hidden>
        <span className="hidden sm:block" />
        <div className="relative h-5 text-[11px] tabular-nums text-muted">
          {ticks.map((t) => (
            <span
              key={t}
              className={`absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full ${t % 50 === 0 || t === AXIS_TO ? '' : 'hidden sm:inline'}`}
              style={{ left: `${((t - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className="inline-block h-3.5 border-l border-dashed border-line-strong" />
        Liniile punctate: proclamarea republicii (30 decembrie 1947) și 22 decembrie 1989.
      </p>
    </figure>
  );
}
