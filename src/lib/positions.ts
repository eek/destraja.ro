import type { CivicPosition, PositionsSummary } from './types';
import { countWord, normalize } from './format';

/** Eticheta poziției, ca substantiv: se potrivește și unei organizații, și unei coaliții. */
export function stanceLabel(p: Pick<CivicPosition, 'stance' | 'removesProvisions'>) {
  if (p.stance === 'retragere') return 'Retragerea proiectului';
  if (p.stance === 'respingere') return 'Respingerea proiectului';
  if (p.stance === 'modificare') return p.removesProvisions ? 'Eliminarea unor prevederi' : 'Modificarea proiectului';
  return 'Susținerea proiectului';
}

const orgKey = (name: string) => normalize(name).replace(/[^a-z0-9]+/g, ' ').trim();

/** Organizațiile unei poziții, fără dubluri: semnatarii din listă și emitentul. */
function orgsOf(p: CivicPosition) {
  return new Set([...(p.signatories?.names ?? []), p.issuer].map(orgKey));
}

function union(list: CivicPosition[]) {
  const all = new Set<string>();
  for (const p of list) for (const k of orgsOf(p)) all.add(k);
  return all.size;
}

/** Câte organizații distincte au emis sau semnat aceste poziții, fiecare numărată o singură dată. */
export const countOrganisations = union;

/** Ce cer, la acuzativ: „retragerea proiectului”, „eliminarea unor prevederi”, „retragerea, respingerea sau modificarea proiectului”. */
function ask(list: CivicPosition[]) {
  const amend = list.filter((p) => p.stance === 'modificare');
  if (amend.length === list.length) return amend.every((p) => p.removesProvisions) ? 'eliminarea unor prevederi' : 'modificarea proiectului';
  const nouns = [
    list.some((p) => p.stance === 'retragere') && 'retragerea',
    list.some((p) => p.stance === 'respingere') && 'respingerea',
    amend.length > 0 && 'modificarea',
  ].filter((n): n is string => !!n);
  const last = nouns.pop();
  return `${nouns.length ? `${nouns.join(', ')} sau ${last}` : last} proiectului`;
}

/**
 * „376 de organizații cer eliminarea unor prevederi”, „Confederația X cere retragerea proiectului”. Organizațiile
 * se numără o singură dată, chiar dacă au semnat mai multe documente.
 */
export function positionsSummary(positions: CivicPosition[]): PositionsSummary {
  const against = positions.filter((p) => p.stance !== 'sustinere');
  const pro = positions.filter((p) => p.stance === 'sustinere');
  const oppose = union(against.filter((p) => p.stance !== 'modificare'));
  const amend = union(against.filter((p) => p.stance === 'modificare'));
  const support = union(pro);
  const parts: string[] = [];
  if (against.length) {
    const n = union(against);
    parts.push(n === 1 ? `${against[0].issuer} cere ${ask(against)}` : `${countWord(n, 'organizație', 'organizații')} cer ${ask(against)}`);
  }
  if (pro.length) {
    if (!against.length) parts.push(support === 1 ? `${pro[0].issuer} susține proiectul` : `${countWord(support, 'organizație', 'organizații')} susțin proiectul`);
    else parts.push(`${countWord(support, 'organizație', 'organizații')} îl ${support === 1 ? 'susține' : 'susțin'}`);
  }
  return { count: positions.length, against: union(against), oppose, amend, support, line: parts.length ? parts.join('; ') : null };
}
