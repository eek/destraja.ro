import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { ANALYTICS_RETENTION, CONTACT_EMAIL, OPERATOR_NAME, POLICY_UPDATED } from '@/lib/site';
import { GA_COOKIES } from '@/lib/analytics';
import { Container, linkCls, panel } from '@/components/ui';
import ClearPreferences from '@/components/site/ClearPreferences';
import ConsentControls from '@/components/site/ConsentControls';

export const metadata: Metadata = {
  title: 'Politica de cookies',
  description:
    'lastraja.ro folosește Google Analytics doar dacă accepți, fără reclame și fără ce scrii pe site. Ce păstrăm în browserul tău și cum îți schimbi alegerea.',
};

const STORED = [
  { name: 'lastraja-theme', where: 'Stocare locală (localStorage)', what: 'Tema aleasă de tine: luminoasă sau întunecată. Lipsește dacă tema urmează sistemul.', how: 'Până o ștergi' },
  {
    name: 'lastraja-consent',
    where: 'Stocare locală (localStorage)',
    what: 'Dacă ai acceptat sau ai refuzat statisticile, ca să nu te întrebăm la fiecare pagină.',
    how: '13 luni, apoi te întrebăm din nou',
  },
];

const ANALYTICS_COOKIES = [
  { name: GA_COOKIES[0], what: 'Un număr aleatoriu care deosebește un browser de altul, fără să spună cine ești.' },
  { name: GA_COOKIES[1], what: 'Ține evidența vizitei în curs, ca paginile citite una după alta să fie numărate ca o singură vizită.' },
];

const MEASURED = [
  'Paginile deschise și site-ul de pe care ai ajuns aici.',
  'Tipul dispozitivului, sistemul de operare, browserul, limba și, aproximativ, țara și orașul.',
  'Ce funcții folosești, fără conținutul lor: deschiderea formularului Senatului, copierea unui text, descărcarea documentului .docx, alegerea unui filtru, a unui partid sau a temei.',
];

const NOT_SENT = [
  'Numele trecut în documentul .docx, textele pe care le editezi și ce cauți pe site.',
  'Adresa IP: Google o folosește doar ca să estimeze localitatea și nu o păstrează.',
  'Nimic pentru reclame: Google Signals, personalizarea reclamelor și legătura cu contul tău Google sunt oprite.',
];

const NOT_USED = [
  'Cookie-uri de publicitate sau de urmărire între site-uri',
  'Meta Pixel, TikTok Pixel sau alte instrumente de marketing',
  'Butoane sau conținut încorporat de pe rețele sociale',
  'Fonturi sau imagini de pe servere terțe: le găzduim pe lastraja.ro',
];

const h2 = 'font-display text-2xl font-normal sm:text-3xl';
const h3 = 'mt-8 text-lg font-semibold text-ink';
const p = 'mt-3 text-[15px] leading-7 text-body';

function Ticks({ items, icon: Icon, tone }: { items: string[]; icon: typeof Check; tone: string }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-3 text-[15px] leading-7 text-body">
          <Icon className={`mt-1.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

function StorageList({ items }: { items: { name: string; what: string; meta: string }[] }) {
  return (
    <dl className="mt-5 divide-y divide-line border-y border-line">
      {items.map((s) => (
        <div key={s.name} className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr] sm:gap-6">
          <dt className="font-mono text-sm text-ink">{s.name}</dt>
          <dd className="text-[15px] leading-7 text-body">
            {s.what}
            <span className="block text-sm text-muted">{s.meta}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function CookiesPage() {
  return (
    <Container className="max-w-[880px] py-12 sm:py-16">
      <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Politica de cookies</h1>
      <p className="mt-3 text-sm text-muted">Actualizată la {POLICY_UPDATED}</p>

      <div className={`${panel} mt-8 p-6 sm:p-8`}>
        <h2 className="text-lg font-semibold text-ink">Pe scurt</h2>
        <p className={p}>
          Statisticile de vizitare (Google Analytics) pornesc doar dacă accepți. Până atunci nu se încarcă nimic de la Google și nu se setează
          niciun cookie. Le folosim ca să vedem ce pagini sunt citite și ce funcții ajută cu adevărat, de exemplu câți oameni deschid formularul
          Senatului. Nu afișăm reclame, nu aflăm cine ești și nu trimitem nimic din ce scrii pe site.
        </p>
      </div>

      <section aria-labelledby="alegerea-ta" className="mt-12 scroll-mt-24">
        <h2 id="alegerea-ta" className={h2}>
          Alegerea ta
        </h2>
        <p className={p}>
          O poți schimba oricând, la fel de ușor cum ai făcut-o prima dată. Dacă oprești statisticile, ștergem imediat cookie-urile Google
          Analytics din browserul tău.
        </p>
        <div className="mt-5">
          <ConsentControls />
        </div>
      </section>

      <section aria-labelledby="statistici" className="mt-12">
        <h2 id="statistici" className={h2}>
          Statistici, doar cu acordul tău
        </h2>
        <p className={p}>
          Folosim Google Analytics 4, un serviciu al Google Ireland Limited. Temeiul este consimțământul tău (art. 6 alin. 1 lit. a din
          Regulamentul (UE) 2016/679 și art. 4 alin. 5 din Legea 506/2004). Nu vindem și nu dăm nimănui aceste date; le vedem doar ca totaluri.
        </p>

        <h3 className={h3}>Ce aflăm</h3>
        <Ticks items={MEASURED} icon={Check} tone="text-link" />

        <h3 className={h3}>Ce nu trimitem</h3>
        <Ticks items={NOT_SENT} icon={X} tone="text-muted" />

        <h3 className={h3}>Cookie-urile Google Analytics</h3>
        <p className={p}>Apar doar după ce accepți și dispar când refuzi.</p>
        <StorageList items={ANALYTICS_COOKIES.map((c) => ({ ...c, meta: 'Cookie pe lastraja.ro, setat de Google Analytics · 13 luni' }))} />

        <h3 className={h3}>Cât timp și unde</h3>
        <p className={p}>
          Google păstrează datele la nivel de vizitator {ANALYTICS_RETENTION}, apoi le șterge automat; rămân doar totaluri, fără identificatori.
          Datele pot fi prelucrate și în afara Uniunii Europene, inclusiv în SUA, în baza cadrului UE–SUA privind protecția datelor (Data Privacy
          Framework). Detalii în{' '}
          <a href="https://policies.google.com/technologies/partner-sites?hl=ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
            cum folosește Google datele de pe site-urile partenere
          </a>{' '}
          și în{' '}
          <a href="https://policies.google.com/privacy?hl=ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
            politica de confidențialitate Google
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="stocam" className="mt-12">
        <h2 id="stocam" className={h2}>
          Ce păstrăm în browserul tău
        </h2>
        <p className={p}>
          Sunt informații strict necesare pentru funcțiile pe care le ceri, deci nu au nevoie de consimțământ (art. 4 alin. 5 din Legea 506/2004).
          Rămân pe dispozitivul tău și nu ne sunt trimise.
        </p>
        <StorageList items={STORED.map((s) => ({ ...s, meta: `${s.where} · ${s.how.toLowerCase()}` }))} />
      </section>

      <section aria-labelledby="nu-folosim" className="mt-12">
        <h2 id="nu-folosim" className={h2}>
          Ce nu folosim
        </h2>
        <Ticks items={NOT_USED} icon={X} tone="text-muted" />
      </section>

      <section aria-labelledby="gazduire" className="mt-12">
        <h2 id="gazduire" className={h2}>
          Găzduirea și securitatea
        </h2>
        <p className={p}>
          Site-ul este găzduit de Cloudflare. Ca orice server, Cloudflare primește adresa IP și tipul browserului tău ca să livreze paginile și să
          oprească atacurile. Dacă protecția anti-boți e activă, Cloudflare poate seta un cookie tehnic de scurtă durată (de exemplu{' '}
          <code className="rounded bg-sunken px-1 font-mono text-xs">__cf_bm</code>, cel mult 30 de minute), strict necesar pentru securitate.
          Detalii în{' '}
          <a href="https://www.cloudflare.com/ro-ro/privacypolicy/" target="_blank" rel="noopener noreferrer" className={linkCls}>
            politica de confidențialitate Cloudflare
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="datele-tale" className="mt-12">
        <h2 id="datele-tale" className={h2}>
          Datele pe care le scrii tu
        </h2>
        <Ticks
          icon={Check}
          tone="text-link"
          items={[
            'Numele pe care îl treci în documentul .docx personalizat este folosit doar în browserul tău, ca să genereze fișierul. Nu ajunge la noi și nici în statistici.',
            'Textele pentru formularul Senatului și e-mailurile către instituții sau parlamentari se copiază sau se deschid în aplicația ta de e-mail. Le trimiți tu, direct. Statisticile numără doar că ai copiat sau ai deschis un text, nu și ce scrie în el.',
            'Ne trimiți ceva doar dacă alegi: raportul despre o greșeală sau adresa de e-mail pentru alerte (mai jos).',
            'Când deschizi senat.ro sau alt site extern, se aplică politica acelui site.',
          ]}
        />
      </section>

      <section aria-labelledby="rapoarte" className="mt-12 scroll-mt-24">
        <h2 id="rapoarte" className={h2}>
          Când semnalezi o greșeală
        </h2>
        <p className={p}>
          Formularul „Semnalează o greșeală” de pe pagina unui proiect ne trimite textul tău, proiectul și analiza la care te referi. Nu cerem nume
          sau e-mail și nu păstrăm adresa IP.
        </p>
        <Ticks
          icon={Check}
          tone="text-link"
          items={[
            'Verificarea anti-roboți e făcută de Cloudflare Turnstile și pornește doar când deschizi formularul. Cloudflare primește pentru asta adresa IP și semnale despre browser și le folosește ca să deosebească oamenii de roboți.',
            'Raportul e citit de noi și trimis spre reverificare modelelor Gemini (Google), Claude (Anthropic) și ChatGPT (OpenAI), împreună cu textul oficial al proiectului. De aceea te rugăm să nu scrii date personale.',
            'Păstrăm rapoartele cel mult 90 de zile după ce le-am verificat, apoi le ștergem.',
            'Temeiul este interesul nostru legitim de a corecta analizele publicate (art. 6 alin. 1 lit. f din Regulamentul (UE) 2016/679).',
          ]}
        />
        <p className={p}>
          Detalii despre Turnstile în{' '}
          <a href="https://www.cloudflare.com/turnstile-privacy-policy/" target="_blank" rel="noopener noreferrer" className={linkCls}>
            politica de confidențialitate Turnstile
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="alerte" className="mt-12 scroll-mt-24">
        <h2 id="alerte" className={h2}>
          Când te abonezi la alerte
        </h2>
        <p className={p}>
          Pentru{' '}
          <Link href="/abonare" className={linkCls}>
            alertele pe e-mail
          </Link>{' '}
          păstrăm adresa ta, nivelul ales (tot, risc moderat și ridicat sau doar risc ridicat), data abonării, data confirmării și ziua ultimei ediții
          primite. Nimic altceva: nici nume, nici adresa IP.
        </p>
        <Ticks
          icon={Check}
          tone="text-link"
          items={[
            'Te abonezi în doi pași: după formular primești un e-mail cu un link de confirmare. Fără confirmare nu îți trimitem nimic, iar cererea se șterge după 48 de ore.',
            'Formularul folosește aceeași verificare anti-roboți Cloudflare Turnstile ca raportarea greșelilor (mai sus), ca nimeni să nu poată abona adresele altora în masă.',
            'Te dezabonezi dintr-un click, din orice e-mail. Dezabonarea șterge adresa din baza noastră.',
            'E-mailurile pleacă prin Cloudflare Email Service, iar adresele stau în baza de date Cloudflare D1, în Uniunea Europeană. Nu le dăm nimănui altcuiva și nu le folosim pentru altceva.',
            'În e-mailuri nu sunt pixeli de urmărire. Linkurile spre lastraja.ro au eticheta „alerte” (utm_source), ca statisticile, dacă le-ai acceptat, să numere vizitele venite din e-mail; eticheta nu spune cine ești.',
            'Temeiul este acordul tău (art. 6 alin. 1 lit. a din Regulamentul (UE) 2016/679), pe care îl retragi oricând prin dezabonare.',
          ]}
        />
      </section>

      <section aria-labelledby="sterge" className="mt-12">
        <h2 id="sterge" className={h2}>
          Cum ștergi tot
        </h2>
        <p className={p}>
          Butonul de mai jos readuce tema la cea a sistemului, oprește statisticile și șterge alegerea ta, ca să te întrebăm din nou. Poți șterge și
          din setările browserului (datele site-ului lastraja.ro).
        </p>
        <div className="mt-4">
          <ClearPreferences />
        </div>
      </section>

      <section aria-labelledby="parlamentari" className="mt-12 scroll-mt-24">
        <h2 id="parlamentari" className={h2}>
          Datele de contact ale parlamentarilor
        </h2>
        <p className={p}>
          Paginile parlamentarilor arată datele de contact oficiale pe care Camera Deputaților și Senatul le publică pentru rolul lor public:
          adresa de e-mail, telefonul și birourile parlamentare, dacă apar, și circumscripția electorală.
        </p>
        <p className={p}>
          Copiem doar ce publică fișele oficiale de pe cdep.ro și senat.ro, cu sursa și data verificării alături. Nu adăugăm date din alte
          surse. Dacă ceva e greșit sau nu mai e actual, scrie-ne
          {CONTACT_EMAIL ? (
            <>
              {' '}
              la{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
                {CONTACT_EMAIL}
              </a>
            </>
          ) : (
            ' la adresa de mai jos'
          )}
          .
        </p>
      </section>

      <section aria-labelledby="operator" className="mt-12">
        <h2 id="operator" className={h2}>
          Cine administrează site-ul
        </h2>
        <dl className="mt-4 divide-y divide-line border-y border-line text-[15px]">
          <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-6">
            <dt className="text-muted">Operator</dt>
            <dd className={OPERATOR_NAME ? 'text-ink' : 'font-semibold text-ink'}>{OPERATOR_NAME ?? '[de completat]'}</dd>
          </div>
          <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-6">
            <dt className="text-muted">Contact pentru date personale</dt>
            <dd>
              {CONTACT_EMAIL ? (
                <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
                  {CONTACT_EMAIL}
                </a>
              ) : (
                <span className="font-semibold text-ink">[de completat]</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="drepturi" className="mt-12">
        <h2 id="drepturi" className={h2}>
          Drepturile tale
        </h2>
        <p className={p}>
          Conform Regulamentului (UE) 2016/679 (GDPR), ai dreptul să afli ce date despre tine sunt prelucrate, să ceri ștergerea lor, să îți retragi
          acordul și să depui plângere la{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
            Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
          </a>
          .
        </p>
        <p className={p}>
          Statisticile folosesc doar numărul aleatoriu din cookie-ul <code className="rounded bg-sunken px-1 font-mono text-xs">_ga</code>, așa că
          nu le putem lega de numele tău. Ca să le oprești, refuză statisticile din{' '}
          <a href="#alegerea-ta" className={linkCls}>
            Alegerea ta
          </a>{' '}
          sau șterge cookie-urile site-ului din browser. Retragerea acordului nu afectează ce s-a măsurat până atunci.
        </p>
      </section>

      <p className="mt-14 border-t border-line pt-6 text-sm text-muted">
        <Link href="/" className={linkCls}>
          Înapoi la lastraja.ro
        </Link>
      </p>
    </Container>
  );
}
