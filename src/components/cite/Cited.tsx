import type { ReactNode } from 'react';
import { type CiteWhere, citeSpans } from '@/lib/citari-data';
import CiteRef from './CiteRef';

/**
 * Un text de pe pagina unui proiect (o analiză, o problemă, o observație dintr-un aviz, un citat din proiect) în care
 * trimiterile la articole devin butoane cu textul exact al unității. Trimiterile pe care nu le putem lega sigur de un
 * act rămân text simplu. Fără fișierul data/citari/<slug>.json, textul iese neschimbat.
 */
export default async function Cited({ slug, text, ...where }: { slug: string; text: string | null | undefined } & CiteWhere): Promise<ReactNode> {
  if (!text) return text ?? null;
  const spans = await citeSpans(slug, text, where);
  if (!spans.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) out.push(text.slice(at, s.start));
    const shown = text.slice(s.start, s.end);
    out.push(
      <CiteRef key={s.start} src={`/citari/${slug}.json`} target={s.target} label={shown.replace(/\s+/g, ' ')}>
        {shown}
      </CiteRef>,
    );
    at = s.end;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}
