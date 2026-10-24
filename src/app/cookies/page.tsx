import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { CONTACT_EMAIL, POLICY_UPDATED } from '@/lib/site';
import { Container, linkCls, panel } from '@/components/ui';
import ClearPreferences from '@/components/site/ClearPreferences';

export const metadata: Metadata = {
  title: 'Politica de cookies',
  description: 'lastraja.ro nu folosește cookie-uri de urmărire, publicitate sau statistici. Ce păstrăm în browserul tău și cum ștergi.',
};

const STORED = [
  { name: 'lastraja-theme', where: 'Stocare locală (localStorage)', what: 'Tema aleasă de tine: luminoasă sau întunecată. Lipsește dacă tema urmează sistemul.', how: 'Până o ștergi' },
  { name: 'lastraja-cookie-notice', where: 'Stocare locală (localStorage)', what: 'Faptul că ai închis mesajul despre cookie-uri, ca să nu-l mai vezi la fiecare pagină.', how: 'Până o ștergi' },
];

const NOT_USED = [
  'Cookie-uri de publicitate sau de urmărire între site-uri',
  'Statistici de trafic (Google Analytics, Meta Pixel sau altele)',
  'Butoane sau conținut încorporat de pe rețele sociale',
  'Fonturi, scripturi sau imagini încărcate de pe servere terțe',
];

const h2 = 'font-display text-2xl font-normal sm:text-3xl';
const p = 'mt-3 text-[15px] leading-7 text-body';

export default function CookiesPage() {
  return (
    <Container className="max-w-[880px] py-12 sm:py-16">
      <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Politica de cookies</h1>
      <p className="mt-3 text-sm text-muted">Actualizată la {POLICY_UPDATED}</p>

      <div className={`${panel} mt-8 p-6 sm:p-8`}>
        <h2 className="text-lg font-semibold text-ink">Pe scurt</h2>
        <p className={p}>
          lastraja.ro nu te urmărește. Nu setăm cookie-uri proprii, nu afișăm reclame și nu măsurăm traficul. În browserul tău păstrăm doar două
          preferințe, ca site-ul să-și amintească tema aleasă și că ai citit mesajul despre cookie-uri. Ele nu ne sunt trimise niciodată.
        </p>
      </div>

      <section aria-labelledby="stocam" className="mt-12">
        <h2 id="stocam" className={h2}>
          Ce păstrăm în browserul tău
        </h2>
        <p className={p}>
          Sunt informații strict necesare pentru funcțiile pe care le ceri, deci nu au nevoie de consimțământ (art. 4 alin. 5 din Legea 506/2004).
          Le găsești doar pe dispozitivul tău.
        </p>
        <div className="relative mt-5 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-sunken/70 text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Nume</th>
                <th scope="col" className="px-4 py-3 font-semibold">Ce reține</th>
                <th scope="col" className="px-4 py-3 font-semibold">Unde</th>
                <th scope="col" className="px-4 py-3 font-semibold">Cât timp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {STORED.map((s) => (
                <tr key={s.name} className="align-top">
                  <td className="px-4 py-3 font-mono text-xs text-ink">{s.name}</td>
                  <td className="px-4 py-3 text-body">{s.what}</td>
                  <td className="px-4 py-3 text-body">{s.where}</td>
                  <td className="px-4 py-3 text-body">{s.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="nu-folosim" className="mt-12">
        <h2 id="nu-folosim" className={h2}>
          Ce nu folosim
        </h2>
        <ul className="mt-4 space-y-2">
          {NOT_USED.map((t) => (
            <li key={t} className="flex items-start gap-3 text-[15px] leading-7 text-body">
              <X className="mt-1.5 h-4 w-4 shrink-0 text-risk-red-text" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
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
        <ul className="mt-4 space-y-3">
          {[
            'Numele pe care îl treci în documentul .docx personalizat este folosit doar în browserul tău, ca să genereze fișierul. Nu ajunge la noi.',
            'Textele pentru formularul Senatului și e-mailurile către instituții se copiază sau se deschid în aplicația ta de e-mail. Le trimiți tu, direct.',
            'Când deschizi senat.ro sau alt site extern, se aplică politica acelui site.',
          ].map((t) => (
            <li key={t} className="flex items-start gap-3 text-[15px] leading-7 text-body">
              <Check className="mt-1.5 h-4 w-4 shrink-0 text-risk-green-text" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sterge" className="mt-12">
        <h2 id="sterge" className={h2}>
          Cum ștergi preferințele
        </h2>
        <p className={p}>Cu butonul de mai jos, sau din setările browserului (ștergerea datelor site-ului lastraja.ro).</p>
        <div className="mt-4">
          <ClearPreferences />
        </div>
      </section>

      <section aria-labelledby="drepturi" className="mt-12">
        <h2 id="drepturi" className={h2}>
          Drepturile tale
        </h2>
        <p className={p}>
          Conform Regulamentului (UE) 2016/679 (GDPR), ai dreptul să afli ce date despre tine sunt prelucrate, să ceri ștergerea lor și să depui
          plângere la{' '}
          <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
            Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal
          </a>
          .
          {CONTACT_EMAIL && (
            <>
              {' '}
              Pentru orice întrebare ne scrii la{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
                {CONTACT_EMAIL}
              </a>
              .
            </>
          )}
        </p>
        <p className={p}>
          Dacă vom adăuga vreodată statistici sau alte servicii care au nevoie de acordul tău, le vom porni doar după ce ți-l cerem, și vom actualiza
          această pagină.
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
