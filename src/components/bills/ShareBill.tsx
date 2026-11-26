'use client';

import { useEffect, useState } from 'react';
import { Check, Link2, MessageCircle, Share2 } from 'lucide-react';
import { type ShareInput, shareMessage, whatsappHref } from '@/lib/share';
import { copyText } from '@/lib/export';
import { todayISO } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { useAnchoredPopover } from '@/components/useAnchoredPopover';
import { PopoverSheet } from '@/components/PopoverSheet';

// Trimite pagina unui proiect (/legi/[slug], /camera/[slug]): sus, lângă „Toate proiectele”, și la finalul analizei.
// Pe telefon un singur buton, „Trimite”, care deschide foaia de partajare a telefonului (navigator.share); fără ea, o foaie
// cu WhatsApp și „Copiază linkul”. Pe ecran lat, direct WhatsApp și „Copiază linkul”. Mesajul vine din src/lib/share.ts.
// Nimic nu se încarcă de la alții: WhatsApp e un link obișnuit, deschis doar la apăsare.

type Place = 'header' | 'end';

// Padding-ul, distanța și culorile stau separat de `base`: din două clase px-* (sau border-*) pe același buton câștigă
// ordinea din CSS, nu cea din cod.
const base = 'inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border text-sm font-semibold text-ink transition-colors';
const rest = 'border-line-strong bg-surface hover:border-muted hover:bg-sunken';
const btn = `${base} ${rest} gap-2 px-3.5`;

function useShare(share: ShareInput, builtOn: string) {
  // Ziua de azi după hidratare: consultarea poate să se fi încheiat între timp; până atunci, linkul e cel de pe server, fără nepotrivire la hidratare.
  const [today, setToday] = useState(builtOn);
  const [native, setNative] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setToday(todayISO());
    setNative(typeof navigator.share === 'function');
  }, []);
  const msg = shareMessage(share, today);
  const copy = async () => {
    if (await copyText(msg.url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };
  return { msg, native, copied, copy };
}

/** WhatsApp și „Copiază linkul”; „Copiat” ia locul etichetei fără să schimbe lățimea butonului. */
function Channels({ msg, copied, copy, billId, place, full = false }: ReturnType<typeof useShare> & { billId: string; place: Place; full?: boolean }) {
  const wide = full ? 'w-full justify-center' : '';
  return (
    <>
      <a
        href={whatsappHref(msg.full)}
        target="_blank"
        rel="noopener noreferrer"
        {...trackAttrs('bill_share', { bill_id: billId, channel: 'whatsapp', place })}
        className={`${btn} ${wide}`}
      >
        <MessageCircle className="h-4 w-4 text-muted" aria-hidden />
        WhatsApp
        <span className="sr-only">(se deschide într-o filă nouă)</span>
      </a>
      <button type="button" onClick={copy} {...trackAttrs('bill_share', { bill_id: billId, channel: 'copy', place })} className={`${base} gap-2 px-3.5 ${wide} ${copied ? 'border-brand bg-brand-soft' : rest}`}>
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4 text-muted" aria-hidden />}
        <span className="grid text-left">
          <span className={`col-start-1 row-start-1 ${copied ? 'invisible' : ''}`}>Copiază linkul</span>
          <span className={`col-start-1 row-start-1 ${copied ? '' : 'invisible'}`} aria-hidden>
            Copiat
          </span>
        </span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Linkul a fost copiat.' : ''}
      </span>
    </>
  );
}

function Controls({ share, billId, builtOn, place }: { share: ShareInput; billId: string; builtOn: string; place: Place }) {
  const s = useShare(share, builtOn);
  const { id, btn: anchor, pop } = useAnchoredPopover();
  const open = async () => {
    if (s.native) {
      try {
        // Linkul separat: aplicațiile îl pun singure sub text, iar unele (WhatsApp, Telegram) îi arată și imaginea.
        await navigator.share({ title: share.title, text: s.msg.text, url: s.msg.url });
        return;
      } catch (e) {
        // Închisă de vizitator: nimic de făcut. Altă eroare (de pildă fără permisiune în iframe): foaia noastră.
        if ((e as DOMException)?.name === 'AbortError') return;
      }
    }
    pop.current?.showPopover();
  };
  return (
    <>
      {/* Telefon: un singur buton. */}
      <span className="contents sm:hidden">
        <button
          ref={anchor}
          type="button"
          onClick={open}
          aria-haspopup={s.native ? undefined : 'dialog'}
          {...trackAttrs('bill_share', { bill_id: billId, channel: s.native ? 'native' : 'menu', place })}
          className={`${base} ${rest} gap-1.5 px-2.5`}
        >
          <Share2 className="h-4 w-4 text-muted" aria-hidden />
          Trimite
        </button>
        <PopoverSheet id={id} pop={pop} title="Trimite proiectul" icon={<Share2 className="h-4 w-4 text-muted" aria-hidden />}>
          <p className="rounded-xl bg-sunken px-4 py-3 text-[15px] leading-6 text-body">
            {s.msg.text} <span className="text-link [overflow-wrap:anywhere]">{s.msg.url.replace(/^https:\/\//, '')}</span>
          </p>
          <div className="mt-4 grid gap-2">
            <Channels {...s} billId={billId} place={place} full />
          </div>
        </PopoverSheet>
      </span>
      {/* Ecran lat: direct canalele. */}
      <span className="hidden items-center gap-2 sm:inline-flex">
        <Channels {...s} billId={billId} place={place} />
      </span>
    </>
  );
}

/**
 * Sus, doar butoanele. Pe telefon stă pe rândul cu „Toate proiectele” (antetul proiectului e deja plin până la titlu), pe
 * ecran lat în colțul antetului, pe rândul insignei de risc: pagina pune două, fiecare ascunsă pe lățimea celeilalte.
 */
export function ShareBillButtons({ share, billId, builtOn, className = '' }: { share: ShareInput; billId: string; builtOn: string; className?: string }) {
  return (
    <div role="group" aria-label="Trimite proiectul" className={`ml-auto items-center gap-2 ${className}`}>
      <Controls share={share} billId={billId} builtOn={builtOn} place="header" />
    </div>
  );
}

/** La finalul analizei: o invitație scurtă, sub o linie subțire. */
export default function ShareBill({ share, billId, builtOn, className = 'mt-12' }: { share: ShareInput; billId: string; builtOn: string; className?: string }) {
  return (
    <aside aria-labelledby="trimite" className={`${className} flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between`}>
      <div>
        <h2 id="trimite" className="font-semibold text-ink">
          Îl știi pe cineva pe care îl privește?
        </h2>
        <p className="mt-1 text-sm leading-6 text-body">Trimite-i proiectul: mesajul e gata scris, cu linkul la pagina asta.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Controls share={share} billId={billId} builtOn={builtOn} place="end" />
      </div>
    </aside>
  );
}
