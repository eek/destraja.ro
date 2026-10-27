import type { ReactNode } from 'react';
import { ExternalLink, Mail, MapPin } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import type { MpStat } from '@/lib/stats';
import { CHAMBERS, telHref, type Chamber, type MpConstituency, type MpContact } from '@/lib/mp-contacts';
import { formatDateRo, formatDeadline } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { btnPrimary, btnSecondary, linkCls, panel } from '@/components/ui';
import ContactMessage from './ContactMessage';

// Toate formulările evită genul: nu știm din date dacă parlamentarul e femeie sau bărbat.

const NBSP = String.fromCharCode(160);
// Un caracter invizibil (word joiner) ține cratima lângă cifre, fără să depindă de un glif special din font.
const JOIN = String.fromCharCode(0x2060);
// „nr. 11”, „sector 5” sau „1-3” nu se rup la capăt de rând.
const keep = (s: string) =>
  s.replace(/\b(nr|ap|et|bl|sc|sector|jud)(\.?) (?=\S)/gi, `$1$2${NBSP}`).replace(/(\d)-(\d)/g, `$1${JOIN}-${JOIN}$2`);

function where(c: MpConstituency) {
  if (c.national) return { line: `Reprezintă la nivel național ${c.national}.`, hint: null };
  if (c.number === null || !c.name) return null;
  if (c.number === 43)
    return { line: `Circumscripția electorală nr.${NBSP}43, a românilor din afara țării.`, hint: 'Dacă votezi din străinătate, te reprezintă în Parlament.' };
  const line = `Circumscripția electorală nr.${NBSP}${c.number}, ${c.name}.`;
  if (c.number === 42) return { line, hint: 'Dacă votezi în București, te reprezintă în Parlament.' };
  return { line, hint: `Dacă votezi în județul ${c.name}, te reprezintă în Parlament.` };
}

export function contactMessage(mp: MpStat, bill: BillLite) {
  const subject =
    mp.billsCount === 1 ? `Despre proiectul de lege ${bill.id}, pe care l-ați inițiat` : 'Despre proiectele de lege pe care le-ați inițiat';
  const open = bill.daysRemaining >= 0;
  const body = [
    'Bună ziua,',
    `Vă scriu în legătură cu propunerea legislativă ${bill.id}, pe care ați inițiat-o: „${bill.analysis.consensus.plainTitle}”.${
      open ? ` Proiectul este în consultare publică la Senat până la ${formatDeadline(bill.consultationDeadline)}.` : ''
    }`,
    'Aș dori să aflu ce problemă rezolvă acest proiect, pe cine afectează și cum țineți cont de observațiile primite în consultarea publică.',
    '[Aici puteți adăuga, în două-trei rânduri, de ce vă interesează proiectul.]',
    `Fișa oficială a proiectului: ${bill.sheetUrl}`,
    'Vă mulțumesc pentru timpul acordat și aștept răspunsul dumneavoastră.',
    'Cu stimă,\n[Numele dumneavoastră]\n[Localitatea]',
  ].join('\n\n');
  return { subject, body };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-[15px] leading-6 text-ink">{children}</dd>
    </div>
  );
}

function SourceLine({ chamber, contact, slug }: { chamber: Chamber; contact: MpContact; slug: string }) {
  return (
    <p className="border-t border-line px-5 py-4 text-sm leading-6 text-muted sm:px-7">
      Date de contact oficiale de pe{' '}
      <a href={contact.source} target="_blank" rel="noopener noreferrer" {...trackAttrs('mp_contact', { mp: slug, channel: 'profile' })} className={linkCls}>
        {CHAMBERS[chamber].site}
      </a>
      , verificate la {formatDateRo(contact.checkedAt)}. Copiem doar ce publică fișa oficială.
    </p>
  );
}

export default function MpContactPanel({ mp, contact, topBill }: { mp: MpStat; contact: MpContact | null; topBill?: BillLite }) {
  const chamber: Chamber = contact?.chamber ?? (mp.role === 'senator' ? 'senat' : 'cdep');
  const ch = CHAMBERS[chamber];

  // Fără o fișă potrivită sigur: doar trimiterea spre lista oficială, fără date ghicite.
  if (!contact?.matched) {
    return (
      <section aria-labelledby="contact-title" className="mt-10 rounded-2xl border border-dashed border-line-strong px-5 py-5 sm:px-7">
        <h2 id="contact-title" className="text-base font-semibold text-ink">
          Date de contact
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">
          {contact?.reason === undefined
            ? `Nu am verificat încă fișa oficială de pe ${ch.site}.`
            : /^mandat încetat/.test(contact.reason)
              ? `Potrivit ${ch.site}, mandatul în ${chamber === 'senat' ? 'Senat' : 'Camera Deputaților'} a încetat${contact.endedOn ? ` la ${formatDateRo(contact.endedOn)}` : ''}.`
              : `Nu am găsit sigur fișa oficială pe ${ch.site}, așa că nu afișăm date de contact.`}{' '}
          <a
            href={contact?.source ?? ch.list}
            target="_blank"
            rel="noopener noreferrer"
            {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'profile' })}
            className={linkCls}
          >
            {contact?.source && contact.source !== ch.list ? `Vezi fișa de pe ${ch.site}` : `Lista oficială de pe ${ch.site}`}
          </a>
          .
        </p>
      </section>
    );
  }

  const email = contact.emails[0];
  const place = contact.constituency ? where(contact.constituency) : null;
  const message = topBill ? contactMessage(mp, topBill) : null;
  const mailto = email && `mailto:${email}${message ? `?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}` : ''}`;
  const hasDetails = contact.emails.length + contact.phones.length + contact.offices.length > 0;

  return (
    <section aria-labelledby="contact-title" className={`${panel} mt-10`}>
      {/* Pe telefon: întâi butoanele, apoi datele de contact, apoi mesajul; pe desktop datele stau în dreapta. */}
      <div className="grid gap-y-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
        <div className="lg:col-start-1 lg:row-start-1">
          <h2 id="contact-title" className="text-lg font-semibold text-ink">
            {email ? 'Scrie-i direct' : 'Scrie-i'}
          </h2>
          {place && (
            <p className="mt-3 flex items-start gap-2.5 text-[15px] leading-6 text-body">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-link" aria-hidden />
              <span>
                <span className="text-ink">{place.line}</span>
                {place.hint && <span className="block text-sm text-muted">{place.hint}</span>}
              </span>
            </p>
          )}
          <p className="mt-3 text-[15px] leading-7 text-body">
            {email
              ? 'Ai o întrebare sau o părere despre ce a propus? Scrie pe adresa oficială. Un mesaj scurt, politicos și concret are cele mai mari șanse să primească răspuns.'
              : `Fișa oficială de pe ${ch.site} nu include ${hasDetails ? `o adresă de e-mail @${ch.site}` : `e-mail @${ch.site}, telefon sau birou parlamentar`}. ${
                  contact.offices.length ? 'Poți merge la biroul parlamentar sau poți' : 'Poți'
                } trimite o scrisoare pe adresa ${chamber === 'senat' ? 'Senatului' : 'Camerei Deputaților'}.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {mailto && (
              <a href={mailto} {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'email' })} className={`${btnPrimary} min-h-12 w-full px-5 text-[15px] sm:w-auto`}>
                <Mail className="h-4 w-4" aria-hidden />
                Scrie un e-mail
              </a>
            )}
            <a
              href={contact.source}
              target="_blank"
              rel="noopener noreferrer"
              {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'profile' })}
              className={`${btnSecondary} min-h-12 w-full px-4 text-sm sm:w-auto`}
            >
              Fișa oficială pe {ch.site}
              <ExternalLink className="h-4 w-4" aria-hidden />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          </div>
        </div>

        <dl className="divide-y divide-line border-y border-line lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
          {contact.emails.length > 0 && (
            <Row label={contact.emails.length > 1 ? 'E-mailuri' : 'E-mail'}>
              <ul className="space-y-1">
                {contact.emails.map((e) => (
                  <li key={e}>
                    <a href={`mailto:${e}`} {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'email_link' })} className={`${linkCls} break-all`}>
                      {e}
                    </a>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {contact.phones.length > 0 && (
            <Row label="Telefon">
              <ul className="space-y-1">
                {contact.phones.map((p) => (
                  <li key={p}>
                    <a href={telHref(p)} {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'phone' })} className={`${linkCls} tabular-nums`}>
                      {p}
                    </a>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {contact.offices.length > 0 && (
            <Row label={contact.offices.length > 1 ? 'Birouri parlamentare' : 'Birou parlamentar'}>
              <ul className="space-y-2.5">
                {contact.offices.map((o) => (
                  <li key={o.address}>
                    {keep(o.address)}
                    {(o.phone || o.email) && (
                      <span className="mt-0.5 flex flex-wrap gap-x-4 text-sm">
                        {o.phone && (
                          <a href={telHref(o.phone)} {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'office_phone' })} className={`${linkCls} tabular-nums`}>
                            {o.phone}
                          </a>
                        )}
                        {o.email && (
                          <a href={`mailto:${o.email}`} {...trackAttrs('mp_contact', { mp: mp.slug, channel: 'office_email' })} className={`${linkCls} break-all`}>
                            {o.email}
                          </a>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {!email && (
            <Row label="Prin poștă">
              {ch.name}, {keep(ch.postal)}
              <span className="mt-0.5 block text-sm text-muted">Scrie pe plic și numele: {mp.name}.</span>
            </Row>
          )}
        </dl>

        {message && topBill && (
          <div className="-mt-3 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:self-start">
            <ContactMessage slug={mp.slug} billId={topBill.id} subject={message.subject} body={message.body} />
          </div>
        )}
      </div>
      <SourceLine chamber={chamber} contact={contact} slug={mp.slug} />
    </section>
  );
}
