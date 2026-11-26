// Când recitim fișa unui proiect de la Camera Deputaților, deși lista nu-i arată alt stadiu. cdep.ro n-are flux de
// noutăți, iar lista anului se schimbă doar la un stadiu nou: un aviz primit, un raport depus sau un termen mutat se văd
// doar pe fișă. Trei semne spun când merită o cerere:
//   1. ședința unei comisii cu proiectul pe ordinea de zi (data/agenda/camera, scris de straja-cdep-agenda.mjs): cu o zi
//      înainte, apoi la o zi, la trei și la șapte după ultima zi a ședinței, până apare pe fișă documentul comisiei;
//      pentru plenul Camerei (plen.json), o singură dată, a doua zi după ședință;
//   2. termenele din fișă: a doua zi după termenul de amendamente și după cel de raport;
//   3. vârsta: proiectele înregistrate în ultimele 45 de zile la 4–5 zile, cele din ultimul an la vreo trei săptămâni,
//      cele mai vechi la 6–8 săptămâni.
// Termenele și vârsta contează doar cât proiectul e la Cameră. O fișă e de recitit când o astfel de zi a venit și fișa a
// fost citită înaintea ei; zilele sunt ale României. O rulare sărită (weekend, Mac închis) nu pierde nimic: ziua rămâne
// scadentă până la prima citire.
import fs from 'node:fs';
import path from 'node:path';
import { slugOfNumber } from './cdep-agenda.mjs';
import { AT_CHAMBER } from './cdep-index.mjs';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NEW_DAYS = 45;
// O ședință mai veche de atât nu mai cere nimic: ultima ei zi scadentă a trecut de două săptămâni.
const MEETING_WINDOW = 21;
/** Motivele, în ordinea în care se citesc fișele. */
export const REREAD_REASONS = ['ședință', 'termen', 'vârstă'];

/** Ziua aflată la `n` zile după `zi` (înainte, cu `n` negativ). */
export const shiftDay = (zi, n) => {
  const d = new Date(`${zi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const bucharest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });
/** Ziua României în care cade un moment ISO („2026-11-09T22:30:00Z” → „2026-11-10”); null când nu e o dată. */
export const dayOf = (iso) => {
  const t = Date.parse(iso ?? '');
  return Number.isNaN(t) ? null : bucharest.format(new Date(t));
};
// „08.10.2026”, cum scrie fișa datele din derulare.
const isoOfRo = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
// Același proiect primește mereu același interval, iar proiectele citite în aceeași zi nu revin toate deodată.
const spread = (slug, n) => {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % n;
};

/**
 * Ședințele de comisie pe proiect, din data/agenda/camera/<zi>/<idc>.json: Map<slug, [{ idc, comisie, zile }]>, cu zilele
 * fiecărei comisii în ordine. `from` lasă deoparte zilele mai vechi.
 */
export function readMeetings(dataDir, { from = '' } = {}) {
  const base = path.join(dataDir, 'agenda', 'camera');
  const out = new Map();
  const days = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => DAY.test(d) && d >= from).sort() : [];
  for (const zi of days) {
    for (const f of fs.readdirSync(path.join(base, zi)).filter((f) => f.endsWith('.json'))) {
      let day;
      try {
        day = JSON.parse(fs.readFileSync(path.join(base, zi, f), 'utf8'));
      } catch {
        continue;
      }
      const idc = String(day?.comisieId ?? f.slice(0, -5));
      for (const p of Array.isArray(day?.puncte) ? day.puncte : []) {
        const slug = slugOfNumber(p?.numar);
        if (!slug) continue;
        if (!out.has(slug)) out.set(slug, []);
        let c = out.get(slug).find((x) => x.idc === idc);
        if (!c) out.get(slug).push((c = { idc, comisie: String(day.comisie ?? ''), zile: [] }));
        if (!c.zile.includes(zi)) c.zile.push(zi);
      }
    }
  }
  return out;
}

/** Zilele unei comisii, grupate pe ședințe: marți–joi e o singură ședință ținută în mai multe zile, săptămâna următoare e alta. */
function runs(zile) {
  const out = [];
  for (const zi of zile) {
    const run = out.at(-1);
    if (run && daysBetween(run.at(-1), zi) <= 2) run.push(zi);
    else out.push([zi]);
  }
  return out;
}

// Rândurile din derularea fișei: „primire raport favorabil (5 amend. admise) de la: Comisia …”, „primire raport de
// respingere de la: …”, „primire raport suplimentar…”, iar pentru avizul unei comisii „primire aviz de la: Comisia …”.
// Avizele Consiliului Legislativ, CES sau CSM („primire aviz de la Consiliul…”, fără două puncte) nu sunt ale comisiilor.
// Pe fișele citite înainte de 23 noiembrie 2026 rândul avizului se termina în „de la:”, fără numele comisiei.
const REPORT = /^primire raport/i;
const OPINION = /^primire aviz de la\s*:/i;
const rowsSince = (fisa, re, day) => (fisa?.timeline ?? []).filter((t) => re.test(t?.actiune ?? '') && (isoOfRo(t.data) ?? '') >= day).length;
const nameKey = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Comisiile de după „de la:” („…de la: Comisia A; Comisia B — notă”), ca chei fără diacritice. */
const committeesOf = (actiune) => (actiune.match(/\bde la:\s*(.+)$/i)?.[1] ?? '').split(' — ')[0].split(/;\s*/).map(nameKey).filter(Boolean);
const opinionsSince = (fisa, day) => (fisa?.timeline ?? []).filter((t) => OPINION.test(t?.actiune ?? '') && (isoOfRo(t.data) ?? '') >= day);
const seized = (list, idc) => (list ?? []).some((c) => String(c.idc) === idc);
// Plenul (plen.json, din ordinea de zi a ședinței): ordinea de zi poartă săptămâni la rând zeci de proiecte la care nu
// se ajunge, iar un vot dat schimbă stadiul din lista anului, deci fișa se recitește oricum. De aici vine o singură
// recitire, a doua zi după ședință, pentru ce nu se vede în listă: dezbaterea cu votul amânat, votul final fără
// majoritate, retrimiterea la comisie. O fișă care are deja un astfel de rând din ziua ședinței încolo nu se mai cere.
const PLENARY_ID = 'plen';
const PLENARY =
  /^dezbatere [iî]n plenul|\b(adoptat[aă]?|respins[aă]?) de (c[aă]tre )?camera deputa[tț]ilor\b|^plenul camerei deputa[tț]ilor\b|^vot final\b|^trimis pentru raport suplimentar/i;

/** Zilele în care ședințele cer fișa: cu o zi înainte, apoi la 1, 3 și 7 zile după, cât documentul comisiei nu e pe fișă; la plen, doar a doua zi. */
function meetingDays(fisa, meetings, today) {
  const recent = [];
  for (const c of meetings) {
    const rol = seized(fisa?.comisii?.raport, c.idc) ? 'raport' : seized(fisa?.comisii?.aviz, c.idc) ? 'aviz' : null;
    for (const run of runs(c.zile)) {
      if (run.at(-1) >= shiftDay(today, -MEETING_WINDOW)) recent.push({ idc: c.idc, comisie: c.comisie ?? '', rol, first: run[0], last: run.at(-1) });
    }
  }
  // Numele unei comisii: din ordinea de zi și, ca rezervă, cel de pe fișă pentru același idc.
  const fisaName = (idc) => [...(fisa?.comisii?.raport ?? []), ...(fisa?.comisii?.aviz ?? [])].find((c) => String(c.idc) === idc)?.nume ?? '';
  const keys = (r) => new Set([nameKey(r.comisie), nameKey(fisaName(r.idc))].filter(Boolean));
  const namedFor = (r) => opinionsSince(fisa, r.first).some((t) => committeesOf(t.actiune).some((k) => keys(r).has(k)));
  // Avizul unei comisii a venit când un rând de aviz de după ședință îi poartă numele. Rândurile fără nume (fișe citite
  // înainte de 23 noiembrie 2026) le socotim pentru comisiile de aviz rămase fără rând cu nume: venite când sunt cel puțin
  // câte comisii au rămas.
  const opinions = recent.filter((r) => r.rol === 'aviz');
  const left = new Set(opinions.filter((r) => !namedFor(r)).map((r) => r.idc));
  const unnamedIn =
    left.size > 0 && opinionsSince(fisa, opinions.map((r) => r.first).sort()[0]).filter((t) => !committeesOf(t.actiune).length).length >= left.size;
  const opinionIn = (r) => namedFor(r) || unnamedIn;
  const out = [];
  for (const r of recent) {
    if (r.idc === PLENARY_ID) {
      if (!rowsSince(fisa, PLENARY, r.first)) out.push(shiftDay(r.last, 1));
      continue;
    }
    out.push(shiftDay(r.first, -1));
    // O comisie care nu e pe fișă printre cele sesizate: orice raport, avizul ei sau un aviz fără nume.
    const anyOpinion = () => namedFor(r) || opinionsSince(fisa, r.first).some((t) => !committeesOf(t.actiune).length);
    const done = r.rol === 'raport' ? rowsSince(fisa, REPORT, r.first) > 0 : r.rol === 'aviz' ? opinionIn(r) : rowsSince(fisa, REPORT, r.first) > 0 || anyOpinion();
    if (!done) out.push(shiftDay(r.last, 1), shiftDay(r.last, 3), shiftDay(r.last, 7));
  }
  return out;
}

/** La câte zile se recitește fișa unui proiect aflat la Cameră, după cât de nou e. */
function everyDays(sheet, today) {
  const age = DAY.test(sheet.inregistrat ?? '') ? daysBetween(sheet.inregistrat, today) : Infinity;
  if (age < NEW_DAYS) return 4 + spread(sheet.slug, 2);
  if (age < 365) return 18 + spread(sheet.slug, 7);
  return 26 + spread(sheet.slug, 8); // proiectele de peste un an: o dată la 26–33 de zile, ca „verificată pe…” de pe pagină să rămână recentă
}

/**
 * De ce se recitește acum fișa `sheet` (data/cdep/proiecte/<slug>.json), sau null când nu e cazul. `meetings` sunt
 * ședințele proiectului (readMeetings().get(slug)). Întoarce { motiv, zi, din }: motivul cel mai grabnic dintre
 * REREAD_REASONS, cea mai nouă zi scadentă (`zi`: o copie citită înaintea ei nu ține loc de recitire) și cea mai veche
 * (`din`: de când așteaptă fișa).
 */
export function rereadDue(sheet, { today, meetings = [] }) {
  const readDay = dayOf(sheet?.cititLa);
  if (!sheet?.fisa || !readDay) return null;
  const due = [];
  const add = (zi, motiv) => {
    if (readDay < zi && zi <= today) due.push({ zi, motiv });
  };
  for (const zi of meetingDays(sheet.fisa, meetings, today)) add(zi, 'ședință');
  if (AT_CHAMBER.test(sheet.stadiu ?? '')) {
    for (const t of [sheet.fisa.comisii?.termenAmendamente, sheet.fisa.comisii?.termenRaport]) {
      if (DAY.test(t ?? '')) add(shiftDay(t, 1), 'termen');
    }
    add(shiftDay(readDay, everyDays(sheet, today)), 'vârstă');
  }
  if (!due.length) return null;
  const days = due.map((d) => d.zi).sort();
  return { motiv: REREAD_REASONS.find((m) => due.some((d) => d.motiv === m)), zi: days.at(-1), din: days[0] };
}

/** Ordinea de citire a recitirilor: ședințele, termenele, apoi vârsta; în fiecare grup, cele care așteaptă de mai demult întâi. */
export const byUrgency = (a, b) => REREAD_REASONS.indexOf(a.motiv) - REREAD_REASONS.indexOf(b.motiv) || a.din.localeCompare(b.din);

// Ziua aflată cu `n` zile lucrătoare înaintea zilei `zi`. Sâmbăta și duminica nu se numără: atunci nu rulează nimic pe
// Mac, deci nici VM-ul nu primește coada.
const workdaysBack = (zi, n) => {
  let d = zi;
  while (n > 0) {
    d = shiftDay(d, -1);
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) n--;
  }
  return d;
};

/**
 * Cine citește o recitire. Întâi VM-ul destraja, care are tot bugetul zilei la cdep.ro: fișa vine din copia lui, de
 * obicei în aceeași zi. Mac-ul o citește el doar când a rămas necitită: de o zi lucrătoare pentru o ședință, de două
 * pentru rest. Luni, ce a devenit scadent în weekend e tot al VM-ului.
 */
export const readHere = (due, today) => due.din <= workdaysBack(today, due.motiv === 'ședință' ? 1 : 2);

/** „12 recitiri scadente (5 pentru ședințe, 2 la termene, 5 după vârstă)”, pentru rândul de la sfârșitul unei rulări. */
export function rereadSummary(list) {
  if (!list.length) return 'nicio recitire scadentă';
  const n = (motiv) => list.filter((r) => r.motiv === motiv).length;
  return `${list.length} recitiri scadente (${n('ședință')} pentru ședințe, ${n('termen')} la termene, ${n('vârstă')} după vârstă)`;
}
