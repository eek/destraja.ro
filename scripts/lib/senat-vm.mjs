// Senatul citit de VM-ul destraja (mereu pornit, la birou), ca proiectele noi să ajungă pe site și când Mac-ul doarme.
//
// VM-ul rulează `straja-sync.mjs --vm` la 07:30 și la 12:30 (scripts/vm/install-senat-vm.sh): lista în consultare,
// fișele, opiniile, recitirile și PDF-urile, fără textul lor (MinerU și Tesseract sunt pe Mac). Scrie în
// ~/senat-vm/data senat-bills.json, pdfs/<slug>/ și status.json (ziua și ora listei, câte proiecte, erorile).
// La începutul pasului Senatului, Mac-ul aduce senat-bills.json și status.json (rsync, cheia restrânsă
// ~/.ssh/destraja_senat_vm), le unește cu data/senat-bills.json și cere doar PDF-urile care îi lipsesc. Dacă lista
// VM-ului e de azi, Mac-ul nu mai citește Senatul; altfel îl citește singur, ca înainte. La sfârșit îi trimite VM-ului
// fișierul unit (put-bills), ca VM-ul să știe și de proiectele citite doar de Mac (--restore, o zi fără VM).
//
// Aici e doar logica, fără rețea și fără fișiere, ca să poată fi încercată.
import path from 'node:path';

/** Câmpurile scrise de citirea Senatului (lista, fișa, opiniile, ieșirea din consultare). Restul sunt ale Mac-ului. */
export const SYNC_FIELDS = [
  // rândul din lista în consultare
  'id',
  'slug',
  'cod',
  'officialTitle',
  'consultationDeadline',
  'opinionsCount',
  'sheetUrl',
  'opinionsUrl',
  // fișa
  'initiators',
  'parties',
  'isCrossParty',
  'emergencyRequested',
  'emergencyApproved',
  'stage',
  'senatNr',
  'cdepNr',
  'firstChamber',
  'lawType',
  'pdfs',
  'timeline',
  // opiniile și ora citirii
  'publicOpinions',
  'syncedAt',
  // ieșirea din consultare (syncBills din lib/senat-sync.mjs)
  'leftListAt',
  'announcedDeadline',
];
const SYNC = new Set(SYNC_FIELDS);

const at = (b) => (b?.syncedAt ? Date.parse(b.syncedAt) || 0 : 0);

/**
 * Unește proiectele VM-ului cu ale Mac-ului. Pentru fiecare proiect, câmpurile citirii (SYNC_FIELDS) vin de la cine l-a
 * citit mai recent (`syncedAt`; la egalitate rămâne al Mac-ului), iar celelalte câmpuri sunt ale Mac-ului, oricine ar fi
 * mai nou. Un câmp al citirii lipsă în varianta mai nouă lipsește și din rezultat (un proiect revenit în listă își
 * pierde `leftListAt`). Ordinea: a VM-ului (lista de azi întâi), apoi proiectele știute doar de Mac.
 * Întoarce { bills, fromVm: id-urile luate de la VM (noi sau mai noi), macOnly: id-urile pe care VM-ul nu le are }.
 */
export function mergeBills(vmBills, macBills) {
  const mac = new Map(macBills.map((b) => [b.id, b]));
  const seen = new Set();
  const bills = [];
  const fromVm = [];
  for (const v of vmBills) {
    if (!v?.id || seen.has(v.id)) continue;
    seen.add(v.id);
    const m = mac.get(v.id);
    if (!m) {
      bills.push(v);
      fromVm.push(v.id);
      continue;
    }
    if (at(v) <= at(m)) {
      bills.push(m);
      continue;
    }
    const merged = {};
    for (const [k, val] of Object.entries(v)) if (SYNC.has(k)) merged[k] = val;
    for (const [k, val] of Object.entries(m)) if (!SYNC.has(k)) merged[k] = val;
    bills.push(merged);
    fromVm.push(v.id);
  }
  const macOnly = [];
  for (const m of macBills) {
    if (!m?.id || seen.has(m.id)) continue;
    seen.add(m.id);
    bills.push(m);
    macOnly.push(m.id);
  }
  return { bills, fromVm, macOnly };
}

/**
 * E bună lista VM-ului pentru azi? `status` e status.json de pe VM (sau null când n-a venit), `today` ziua la București
 * („2026-11-27”). Întoarce { fresh, why } cu motivul în cuvinte, pentru jurnal și rezumat.
 */
export function vmFreshness(status, today, { minList = 5 } = {}) {
  if (!status) return { fresh: false, why: 'VM-ul n-a răspuns' };
  if (!status.listDay) return { fresh: false, why: status.error ? `VM-ul n-a citit lista: ${status.error}` : 'VM-ul n-a citit încă lista' };
  if (status.listDay !== today) return { fresh: false, why: `lista VM-ului e din ${status.listDay}${status.error ? ` (azi: ${status.error})` : ''}` };
  if (!(status.listCount >= minList)) return { fresh: false, why: `lista VM-ului are doar ${status.listCount ?? 0} proiecte` };
  return { fresh: true, why: null };
}

/** Numele fișierului unui PDF de pe fișă, ca în straja-sync.mjs: „forma_initiatorului_26b563FG.pdf”. */
export const pdfFileName = (pdf) => `${pdf.type}_${path.basename(pdf.url)}`;

/**
 * PDF-urile de adus de pe VM: ale proiectelor `ids`, cele de pe fișa lor care nu sunt încă pe Mac (`exists(slug, nume)`).
 * Întoarce căile relative la folderul de date al VM-ului: „pdfs/<slug>/<nume>”.
 */
export function neededPdfs(bills, ids, exists) {
  const want = new Set(ids);
  const out = [];
  for (const b of bills) {
    if (!want.has(b.id) || !b.slug) continue;
    // Slug-urile vin de pe senat.ro: doar litere, cifre și liniuță, ca o cale să nu poată ieși din folder.
    if (!/^[a-z0-9-]+$/.test(b.slug)) continue;
    for (const pdf of b.pdfs ?? []) {
      if (!pdf?.url || !pdf.type) continue;
      const name = pdfFileName(pdf);
      if (!/^[\w.-]+$/.test(name)) continue;
      if (!exists(b.slug, name)) out.push(`pdfs/${b.slug}/${name}`);
    }
  }
  return [...new Set(out)];
}

/** Rândul din rezumatul rulării zilnice: „Senat: de pe VM, lista din 07:31” sau „Senat: citit de Mac (motivul)”. */
export function sourceLine(source) {
  if (source?.from === 'vm') return `Senat: de pe VM, lista din ${source.listTime}`;
  return `Senat: citit de Mac${source?.why ? ` (${source.why})` : ''}`;
}

/** Motivul unei erori ssh/rsync, scurt: rândurile lui ssh („Could not resolve hostname …”) înaintea celor ale lui rsync. */
export function shortError(stderr, fallback) {
  const lines = String(stderr ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const own = lines.filter((l) => !/^rsync( error)?:/.test(l));
  return (own.length ? own : lines).slice(0, 2).join(' ') || fallback;
}

/** Ora „07:31” la București dintr-un ISO. */
export const bucharestTime = (iso) =>
  new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Alegerea din pasul Senatului de pe Mac. Fără VM (`vmConfigured` fals) citește Mac-ul. Altfel: `pullStatus()` aduce
 * status.json de pe VM (aruncă dacă VM-ul nu răspunde); dacă lista e de azi, `fromVm(status)` unește datele și întoarce
 * { used: true, … } sau { used: false, why } când a renunțat înainte să schimbe ceva; în orice alt caz `fromMac(why)`
 * citește Senatul ca înainte. Întoarce sursa, pentru rezumat și data/senat-sursa.json.
 */
export async function senatStep({ vmConfigured, today, pullStatus, fromVm, fromMac }) {
  if (!vmConfigured) {
    await fromMac();
    return { from: 'mac', why: null, vmConfigured: false };
  }
  let status = null;
  let why = null;
  try {
    status = await pullStatus();
  } catch (err) {
    why = `VM-ul n-a răspuns: ${String(err?.message ?? err).slice(0, 160)}`;
  }
  if (!why) ({ why } = vmFreshness(status, today));
  if (!why) {
    const { used, why: gaveUp, ...done } = await fromVm(status);
    if (used) return { from: 'vm', listTime: bucharestTime(status.listAt), vmConfigured: true, ...done, vm: status };
    why = gaveUp;
  }
  await fromMac(why);
  return { from: 'mac', why, vmConfigured: true, vm: status };
}
