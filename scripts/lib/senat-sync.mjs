// Mersul sincronizării cu Senatul (scripts/straja-sync.mjs), fără cererile și fără PDF-uri, ca să poată fi încercat.
//
// Pe 25 noiembrie 2026 B660/2026, înregistrat cu o zi înainte, a fost citit dimineața, dar a ajuns pe site abia pe 26:
// fișierul se scria o singură dată, la sfârșit, după recitirea fișelor vechi. Mac-ul a adormit cu capacul închis în
// timp ce MinerU citea un aviz al lui B586 (09:44–13:02), iar pasul a fost oprit la limita de 180 de minute imediat
// după trezire, fără să fi salvat nimic. De atunci:
//   - fișierul se scrie după fiecare proiect din listă și din nou după fiecare fișă recitită, deci o oprire pierde cel
//     mult proiectul în lucru;
//   - lista în consultare (proiectele noi) se salvează întreagă înainte de recitiri, iar pașii de după (analize,
//     publicare) o găsesc chiar dacă pasul Senatului e oprit;
//   - recitirea fișelor vechi e întreținere: are un termen (`rereadStop`, pe timpul treaz), după care nu mai începe altele.
//     Ce rămâne vine a doua zi, cele mai vechi întâi, ca aceleași proiecte să nu rămână mereu la coadă;
//   - recitirea aduce fișa și PDF-urile noi, dar nu le mai citește textul: documentele noi ale proiectelor ieșite din
//     consultare intră într-o coadă (`queueTexts`), citită de pasul următor, cu bugetul lui (`readQueuedTexts`). Pe 26
//     noiembrie MinerU a ținut 31 din cele 45 de minute ale pasului, iar un aviz de 39 de pagini (B576, 10 minute) amâna
//     fișele tuturor proiectelor de după el.
import { senatRereadDays } from './senat-votes.mjs';

const DAY_MS = 24 * 3_600_000;

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Proiectele ieșite din consultare ──
// Senatul le scoate din listă când primesc număr L, dar drumul lor abia începe: comisii, avize, raport, vot. Fișa se
// recitește mai departe (senat.ro n-are limită de cereri): zilnic cât s-a mișcat ceva în ultima lună, apoi tot mai rar.
// După un stadiu final, săptămânal încă două luni (reexaminări, corecturi), apoi deloc.
export function rereadDue(b, now = Date.now()) {
  if (!b.sheetUrl) return false;
  const every = senatRereadDays(b, now);
  // Rularea zilnică nu ajunge la fiecare proiect la aceeași oră: șase ore de joc, ca „zilnic” să nu devină „la două zile”.
  return now - (b.syncedAt ? Date.parse(b.syncedAt) : 0) >= every * DAY_MS - 6 * 3_600_000;
}

/** Fișele de recitit azi, cele citite de cel mai mult timp întâi: cele rămase ieri la coadă intră primele. */
export function rereadQueue(kept, now = Date.now()) {
  const at = (b) => (b.syncedAt ? Date.parse(b.syncedAt) : 0);
  return kept.filter((b) => rereadDue(b, now)).sort((a, b) => at(a) - at(b));
}

/**
 * Recitește fișele proiectelor păstrate, câte una, și salvează după fiecare. Când `stop()` spune că timpul s-a terminat
 * (straja-sync.mjs îl numără pe timpul treaz, lib/awake-clock.mjs) nu mai începe alta; fără `stop`, termenul e `until`
 * (ms, pe ceasul `now`). `reread(b)` întoarce { next, news } sau aruncă o eroare (atunci rămân datele de ieri).
 */
export async function rereadKept(kept, { reread, save = () => {}, until = Infinity, stop = null, now = Date.now, log = console.log, pause = 1000 }) {
  const due = rereadQueue(kept, now());
  if (!due.length) return { due: 0, done: 0, changed: 0, failed: 0, left: 0 };
  log(`🔁 Recitesc ${due.length} din ${kept.length} fișe ale proiectelor ieșite din consultare.`);
  let changed = 0;
  let failed = 0;
  let done = 0;
  for (const b of due) {
    if (stop ? stop() : now() >= until) break;
    try {
      const { next, news } = await reread(b);
      Object.assign(b, next);
      if (news.length) {
        changed++;
        log(`   ${b.id}: ${news.join(', ')}`);
      }
    } catch (err) {
      failed++;
      log(`   ${b.id}: EROARE: ${err.message} (păstrez datele anterioare)`);
    }
    done++;
    save();
    if (pause && done < due.length) await new Promise((r) => setTimeout(r, pause));
  }
  const left = due.length - done;
  log(
    `🔁 ${changed} fișe schimbate, ${done - changed - failed} la fel${failed ? `, ${failed} necitite` : ''}` +
      (left ? `; ${left} rămase pentru mâine (timpul recitirilor s-a terminat)` : '') +
      '.',
  );
  return { due: due.length, done, changed, failed, left };
}

/**
 * Sincronizarea întreagă. `list`: rândurile listei în consultare; `previous`: proiectele din fișier.
 * `fetchBill(item, prev)` întoarce proiectul complet (fișă, opinii, PDF-uri) sau aruncă o eroare; `reread(b)` ca la
 * rereadKept; `save(bills)` scrie fișierul (atomic); `onListSaved()` e chemat după ce lista în consultare e salvată
 * întreagă, înainte de recitiri. Cu `targetFilter` se actualizează doar proiectele cerute, fără recitiri și fără
 * onListSaved (lista n-a fost citită toată).
 */
export async function syncBills({
  list,
  previous,
  targetFilter = null,
  fetchBill,
  reread,
  save,
  onListSaved = () => {},
  today,
  rereadUntil = Infinity,
  rereadStop = null,
  now = Date.now,
  log = console.log,
  write = (s) => process.stdout.write(s),
  pause = 1000,
}) {
  const prev = new Map(previous.map((b) => [b.id, b]));
  const enriched = [];
  const matches = (item) => !targetFilter || item.id.toLowerCase().includes(targetFilter.toLowerCase()) || item.slug.includes(targetFilter.toLowerCase());

  // Fișierul de acum: proiectele din listă citite deja, apoi tot ce aveam și n-a fost încă înlocuit (proiectele din
  // listă necitite încă și cele ieșite din consultare), cu datele de ieri.
  let kept = null;
  const snapshot = () => {
    if (targetFilter) {
      const merged = new Map(prev);
      for (const b of enriched) merged.set(b.id, b);
      return [...merged.values()];
    }
    if (kept) return [...enriched, ...kept];
    const seen = new Set(enriched.map((b) => b.id));
    return [...enriched, ...[...prev.values()].filter((b) => !seen.has(b.id))];
  };
  const saveNow = () => save(snapshot());

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!matches(item)) continue;
    write(`🔍 [${i + 1}/${list.length}] Se extrage fișa pentru ${item.id}... `);
    try {
      const bill = await fetchBill(item, prev.get(item.id));
      enriched.push(bill);
      log(`OK (${bill.initiators?.length ?? 0} inițiatori, ${bill.pdfs?.length ?? 0} PDF-uri, ${bill.publicOpinions?.length ?? 0} opinii)`);
    } catch (err) {
      // Un proiect nou fără fișă n-are inițiatori, documente sau parcurs: nu-l publicăm pe jumătate, îl luăm la rularea următoare.
      log(`EROARE: ${err.message}${prev.has(item.id) ? ' (păstrez datele anterioare)' : ' (proiect nou; îl reiau la rularea următoare)'}`);
      if (prev.has(item.id)) enriched.push(prev.get(item.id));
    }
    saveNow();
  }

  if (targetFilter) {
    const bills = snapshot();
    save(bills);
    return { bills, reread: null };
  }

  const seen = new Set(enriched.map((b) => b.id));
  kept = [...prev.values()].filter((b) => !seen.has(b.id));
  if (kept.length) log(`📁 Păstrez ${kept.length} proiecte care nu mai sunt în lista Senatului.`);
  // Senatul scoate un proiect din consultare când îi dă număr L (sau îl trece „pt. informare”), uneori cu săptămâni
  // înainte de termenul afișat. Lista e o interogare pe starea proiectului, deci o singură citire validă ajunge.
  // Păstrăm termenul anunțat și mutăm termenul efectiv în ziua dinainte, ca site-ul să-l arate închis.
  // Termenele Senatului sunt „ZZ-LL-AAAA”; leftListAt e ISO.
  const iso = (ddmmyyyy) => ddmmyyyy.split('-').reverse().join('-');
  for (const b of kept) {
    if (b.leftListAt || iso(b.consultationDeadline) <= today) continue;
    const closed = addDays(today, -1).split('-').reverse().join('-');
    Object.assign(b, { leftListAt: today, announcedDeadline: b.consultationDeadline, consultationDeadline: closed });
    log(`🔒 ${b.id} a ieșit din consultare pe ${today}, înainte de termenul anunțat (${b.announcedDeadline}).`);
  }
  // Lista în consultare e întreagă: o salvăm înainte de recitiri, care pot ține mult.
  saveNow();
  onListSaved();

  const stats = await rereadKept(kept, { reread, save: saveNow, until: rereadUntil, stop: rereadStop, now, log, pause });
  const bills = snapshot();
  save(bills);
  return { bills, reread: stats };
}

// ── Textele documentelor noi ale proiectelor recitite ──
// Coada: { slug: { since, reread } }. `reread` sunt textele de citit din nou chiar dacă există (PDF-ul a fost înlocuit de
// altul, dropSuperseded din lib/pdf-text.mjs); documentele fără text le găsește oricum writeBillTexts.

/** Pune proiectul în coadă (sau îi adaugă textele de recitit), păstrând locul pe care îl avea. */
export function queueTexts(queue, slug, reread = [], at = new Date().toISOString()) {
  const cur = queue[slug];
  queue[slug] = { since: cur?.since ?? at, reread: [...new Set([...(cur?.reread ?? []), ...reread])] };
  return queue;
}

/**
 * Citește textele proiectelor din coadă, cele intrate de cel mai mult timp întâi, și salvează coada după fiecare. Când
 * `stop()` spune că timpul s-a terminat nu mai începe altul; ce rămâne vine a doua zi, tot primele. `read(slug, reread)`
 * citește textele (writeBillTexts); dacă aruncă, proiectul trece la coada cozii, ca să nu le blocheze pe celelalte.
 */
export async function readQueuedTexts(queue, { read, save = () => {}, stop = () => false, log = console.log, at = () => new Date().toISOString() }) {
  const slugs = Object.keys(queue).sort((a, b) => queue[a].since.localeCompare(queue[b].since) || a.localeCompare(b));
  if (!slugs.length) {
    log('📄 Niciun document nou de citit la proiectele recitite.');
    return { due: 0, done: 0, failed: 0, left: 0 };
  }
  log(`📄 Citesc documentele noi pentru ${slugs.length} proiecte recitite.`);
  let done = 0;
  let failed = 0;
  for (const slug of slugs) {
    if (stop()) break;
    try {
      await read(slug, queue[slug].reread);
      delete queue[slug];
    } catch (err) {
      failed++;
      queue[slug].since = at();
      log(`   ${slug}: EROARE: ${err.message} (rămâne pentru mâine)`);
    }
    done++;
    save(queue);
  }
  const left = slugs.length - done;
  log(`📄 ${done - failed} proiecte cu documentele citite${failed ? `, ${failed} cu erori` : ''}${left ? `; ${left} rămase pentru mâine (timpul pasului s-a terminat)` : ''}.`);
  return { due: slugs.length, done, failed, left };
}
