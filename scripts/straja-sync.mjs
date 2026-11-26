#!/usr/bin/env node
// Sincronizarea cu Senatul (pasul „Senat” al rulării zilnice): lista proiectelor în consultare, fișa, opiniile și PDF-urile
// fiecăruia, cu textul lor; apoi fișele proiectelor ieșite din consultare (mersul în lib/senat-sync.mjs).
//
//   node scripts/straja-sync.mjs [b660]       lista întreagă (sau doar proiectul cerut)
//   node scripts/straja-sync.mjs --texte      textele documentelor noi ale proiectelor recitite (pasul următor)
//   node scripts/straja-sync.mjs --restore B517/2026=27956 …
//   node scripts/straja-sync.mjs --vm         pe VM-ul destraja: lista, fișele, recitirile și PDF-urile, fără texte
//                                             (scripts/vm/install-senat-vm.sh; ~/senat-vm/data și status.json)
//   --fara-vm            pe Mac: citește Senatul singur, fără să întrebe VM-ul
//
// Pe Mac, pasul întreabă întâi VM-ul (lib/senat-vm.mjs): dacă lista lui e de azi, aduce de acolo fișierul și PDF-urile
// care lipsesc, citește doar textele (proiectele din consultare acum, celelalte prin coada lui --texte) și nu mai cere
// nimic de la senat.ro; altfel citește singur, ca înainte.
//
//   --recitiri-minute=N  după N minute de lucru nu mai începe alte recitiri (implicit 90)
//   --minute=N           la --texte: după N minute de lucru nu mai începe alt proiect (implicit 45)
//
// Recitirile aduc fișa și PDF-urile noi, dar textul lor (MinerU, ~7 s pe pagină) îl citește --texte, cu bugetul lui:
// pasul Senatului rămâne scurt, iar un document lung nu mai amână fișele celorlalte proiecte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropSuperseded, textName, writeBillTexts } from './lib/pdf-text.mjs';
import { todayBucharest } from './lib/web.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';
import { queueTexts, readQueuedTexts, syncBills } from './lib/senat-sync.mjs';
import { awakeClock } from './lib/awake-clock.mjs';
import { bucharestTime, mergeBills, neededPdfs, senatStep, shortError, sourceLine } from './lib/senat-vm.mjs';
import os from 'node:os';
import { execFile } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');
// Ziua ultimei sincronizări reușite a întregii liste: fără ea de azi, straja-digest.mjs nu trimite alertele.
const SYNC_DAY_FILE = path.join(ROOT_DIR, '.cache', 'senat-sync-day');
// Recitirea fișelor proiectelor ieșite din consultare e întreținere: după atâtea minute de lucru nu mai începe alta (ce
// rămâne vine mâine, cele mai vechi întâi). Minutele se numără pe timpul treaz (lib/awake-clock.mjs): pe 25 noiembrie
// 2026 Mac-ul a dormit trei ore cu capacul închis în timpul recitirilor. --recitiri-minute=N.
const REREAD_MINUTES = 90;
// Textele documentelor noi ale proiectelor recitite (--texte): după atâtea minute de lucru nu mai începe alt proiect.
const TEXTS_MINUTES = 45;
const TEXTS_QUEUE = path.join(ROOT_DIR, '.cache', 'senat-texte.json');
const ARGS = process.argv.slice(2);
// Pe VM (--vm): doar ce vine de pe senat.ro, fără texte și fără coada lor; starea rulării în data/status.json, iar ce i-a
// trimis Mac-ul (put-bills) în inbox/mac-bills.json.
const IS_VM = ARGS.includes('--vm');
const VM_STATUS_FILE = path.join(DATA_DIR, 'status.json');
const VM_INBOX = path.join(ROOT_DIR, 'inbox', 'mac-bills.json');
// Pe Mac: gazda prin care ajungem la VM (ca agendele) și cheia restrânsă a Senatului (doar rsync din ~/senat-vm/data și
// put-bills, scripts/vm/senat-vm-ssh.sh). Fără una din ele, sau cu --fara-vm, Mac-ul citește singur.
const JUMP_FILE = path.join(ROOT_DIR, '.cache', 'agenda-vm');
const VM_KEY = path.join(os.homedir(), '.ssh', 'destraja_senat_vm');
const VM_HOST = 'destraja@192.168.153.10';
const VM_STAGE = path.join(ROOT_DIR, '.cache', 'senat-vm');
// De unde au venit datele azi, pentru /admin/rapoarte (src/components/admin/AdminSenatSource.tsx).
const SOURCE_FILE = path.join(DATA_DIR, 'senat-sursa.json');
let pdfsAdded = 0;
const clock = awakeClock();
// Ceasul treaz trebuie citit des: un interval care nu ține procesul în viață.
setInterval(() => clock.sample(), 5000).unref();

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PDF_DIR, { recursive: true });
fs.mkdirSync(TEXT_DIR, { recursive: true });

const SENAT_BASE = 'https://www.senat.ro';

function decodeHtmlEntities(str = '') {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html = '') {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

// Senatul scrie grupurile neuniform: „NEAFILIAT”, „Neafiliați”, „UUR (minoritãti)” (cu ã în loc de ă). Pe site
// le vrem ca în restul paginilor: „Neafiliați”, „Minorități”, iar partidele cu sigla lor.
function normalizeParty(raw = '') {
  const p = raw.trim();
  if (!p || /^neafilia/i.test(p)) return 'Neafiliați';
  if (/minorit/i.test(p)) return 'Minorități';
  return p.toUpperCase();
}

function parseInitiators(raw = '') {
  if (!raw) return [];
  // Format: "Cazanciuc Robert-Marius - senator PSD; Cerva Nadia-Cosmina - senator PACE; ..."
  return raw
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^(.+?)\s*-\s*(senator|deputat)\s+(.+)$/i);
      if (m) {
        return {
          name: m[1].trim(),
          role: m[2].toLowerCase(),
          party: normalizeParty(m[3]),
        };
      }
      return { name: entry, role: 'parlamentar', party: 'Neafiliați' };
    });
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DeStraja/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}

async function parseConsultationList() {
  console.log('📡 Se descarcă lista de proiecte în consultare publică de pe senat.ro/LegiProiect.aspx...');
  const html = await fetchHtml(`${SENAT_BASE}/LegiProiect.aspx`);

  const tableMatch = html.match(/<table[^>]*id="ctl00_B_Center_GridViewProiecte"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    throw new Error('Nu am găsit tabelul GridViewProiecte pe LegiProiect.aspx');
  }

  const rows = [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const items = [];

  for (const rowMatch of rows) {
    const rowHtml = rowMatch[1];
    if (rowHtml.includes('<th')) continue;

    const linkMatch = rowHtml.match(/href=['"](Legis\/Lista\.aspx\?cod=(\d+)[^'"]*)['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;

    const sheetRelativeUrl = linkMatch[1];
    const cod = linkMatch[2];
    const rawIndicativ = stripTags(linkMatch[3]).replace(/\s+/g, ''); // e.g., "B563/2026"
    const slug = rawIndicativ.toLowerCase().replace(/[^a-z0-9]+/g, '-'); // e.g., "b563-2026"

    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const consultationDeadline = tds[2] ? stripTags(tds[2]) : '';

    // Extract title from hPCT hidden input or TD[3]
    const hPctMatch = rowHtml.match(/id="[^"]*_hPCT"\s+value="([^"]+)"/i);
    let officialTitle = '';
    if (hPctMatch) {
      officialTitle = decodeHtmlEntities(hPctMatch[1]).replace(/^B\d+\s*\/\s*\d+\s*:\s*/i, '').trim();
    } else if (tds[3]) {
      officialTitle = stripTags(tds[3].split('<br')[0]);
    }

    // Extract opinion count
    let opinionsCount = 0;
    const opMatch = rowHtml.match(/Opinii trimise\s*\((\d+)\)/i);
    if (opMatch) {
      opinionsCount = Number(opMatch[1]);
    }

    items.push({
      id: rawIndicativ,
      slug,
      cod,
      officialTitle,
      consultationDeadline,
      opinionsCount,
      sheetUrl: `${SENAT_BASE}/${sheetRelativeUrl.replace(/^\//, '')}`,
      opinionsUrl: `${SENAT_BASE}/LegiProiectAdmin.aspx?Cod=${cod}`,
    });
  }

  console.log(`✅ Am găsit ${items.length} proiecte de lege active în consultare publică.`);
  return items;
}

async function parseBillSheet(bill) {
  const html = await fetchHtml(bill.sheetUrl);
  // O pagină tăiată sau una de eroare servită cu 200 nu e o fișă.
  if (!/<\/html>/i.test(html) || !/Stadiu\s*:/i.test(html)) throw new Error('pagina primită nu e o fișă întreagă');

  // Extract Initiators (look for the detail row "Inițiatori: </td><td>...")
  let initiatorsRaw = '';
  const initMatches = [...html.matchAll(/Ini[țţ]iatori\s*:\s*<\/(?:td|th|b|span)>\s*(?:<\/(?:td|th)>\s*)?<td[^>]*>([\s\S]*?)<\/td>/gi)];
  for (const m of initMatches) {
    const candidate = stripTags(m[1]);
    if (candidate && !candidate.toLowerCase().includes('înregistrat la senat')) {
      initiatorsRaw = candidate;
      break;
    }
  }
  if (!initiatorsRaw) {
    // Fallback: search for pattern "Name - senator/deputat PARTY" anywhere in the HTML
    const fallbackMatch = html.match(/([A-ZĂÂÎȘȚŞŢ][^<>]{3,80}\s*-\s*(?:senator|deputat)\s+[A-ZĂÂÎȘȚŞŢa-z0-9.\- ]+(?:;\s*[^<>]+)*)/i);
    if (fallbackMatch) {
      initiatorsRaw = stripTags(fallbackMatch[1]);
    } else if (/Guvernul Rom[âa]niei/i.test(html)) {
      initiatorsRaw = 'Guvernul României - inițiator GUVERN';
    }
  }
  const initiators = parseInitiators(initiatorsRaw);
  const parties = [...new Set(initiators.map((i) => i.party).filter(Boolean))];

  // Check emergency procedure requested or approved
  const emergencyRequested = /procedur[ăa]\s+de\s+urgen[țţ][ăa]\s+solicitat[ăa]/i.test(html);
  const emergencyApprovedMatch = html.match(/Procedura de urgen[țţ][ăa]\s*:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  const emergencyApproved = emergencyApprovedMatch ? /^da$/i.test(stripTags(emergencyApprovedMatch[1])) : false;

  // Stage
  const stageMatch = html.match(/Stadiu\s*:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i);
  const stage = stageMatch ? stripTags(stageMatch[1]) : 'înregistrat la Senat pt. dezbatere';

  // Extract PDFs. Fișa are două liste: cea de sus, cu adrese „/legis/PDF/…”, și cea de la pașii din Biroul permanent, cu
  // adrese relative la /Legis („PDF\2026\26b563FGA.pdf”). Doar în a doua apar documentele noi, de exemplu forma
  // actualizată a inițiatorului (B563/2026, 16 noiembrie 2026), pe care până acum n-o citeam.
  const pdfMatches = [...html.matchAll(/<a[^>]+href=["']((?:[^"']*\/legis\/|PDF[\\/])PDF[^"']*?\.pdf[^"']*|[^"']*\/legis\/PDF\/[^"']+\.pdf[^"']*|PDF[\\/][^"']+\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const pdfs = [];
  const seenUrls = new Set();

  for (const pm of pdfMatches) {
    let rawHref = pm[1].replace(/\\/g, '/').split('?')[0];
    if (!rawHref.startsWith('http')) {
      rawHref = /^PDF\//i.test(rawHref) ? `${SENAT_BASE}/Legis/${rawHref}` : `${SENAT_BASE}/${rawHref.replace(/^\//, '')}`;
    }
    if (seenUrls.has(rawHref.toLowerCase())) continue;
    seenUrls.add(rawHref.toLowerCase());

    const label = stripTags(pm[2]).replace(/^-\s*/, '').trim();
    let type = 'other';
    if (/forma\s+(?:actualizat[ăa]\s+a\s+)?ini[țţ]iatorului|FGA?\.PDF/i.test(label + ' ' + rawHref)) type = 'forma_initiatorului';
    else if (/expunerea\s+de\s+motive|EM\.PDF/i.test(label + ' ' + rawHref)) type = 'expunere_motive';
    else if (/adresa\s+de\s+[îi]naintare|AD\.PDF/i.test(label + ' ' + rawHref)) type = 'adresa_inaintare';
    // „adresa pentru aviz la Consiliul legislativ…” e cererea de avize, nu un aviz.
    else if (/^adresa\s+pentru\s+aviz/i.test(label)) type = 'other';
    else if (/aviz|opinia|CES|consiliul/i.test(label + ' ' + rawHref)) type = 'aviz';

    pdfs.push({
      type,
      label: label || path.basename(rawHref),
      url: rawHref,
    });
  }

  // Forma actualizată a inițiatorului înlocuiește forma inițială ca text analizat; cea inițială rămâne, cu alt nume.
  if (pdfs.some((p) => p.type === 'forma_initiatorului' && /actualizat/i.test(p.label))) {
    for (const p of pdfs) if (p.type === 'forma_initiatorului' && !/actualizat/i.test(p.label)) p.type = 'forma_initiatorului_initiala';
  }
  // Adresa care înaintează forma actualizată nu ia locul adresei de înaintare a proiectului.
  for (const p of pdfs) if (p.type === 'adresa_inaintare' && /actualizat/i.test(p.label)) p.type = 'adresa_inaintare_forma_actualizata';

  // Extract Timeline events
  const timeline = [];
  const rowMatches = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>\s*(\d{2}-\d{2}-\d{4})\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)];
  for (const rm of rowMatches) {
    const date = rm[1].trim();
    const action = stripTags(rm[2])
      .replace(/adresa de înaintare.*$/i, '')
      .trim();
    if (date && action) {
      timeline.push({ date, action });
    }
  }

  // Numerele și camerele din antetul fișei; numărul de la Cameră apare uneori cu zile de întârziere.
  const field = (label) => {
    const m = html.match(new RegExp(`${label}\\s*:\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'));
    return m ? stripTags(m[1]).replace(/\s+/g, ' ').trim() || null : null;
  };
  const senatNr = field('Număr de înregistrare Senat')?.match(/[BL]\d+\/\d{4}/)?.[0] ?? null;

  return {
    initiators,
    parties,
    isCrossParty: parties.length >= 3,
    emergencyRequested,
    emergencyApproved,
    stage,
    senatNr,
    cdepNr: field('Număr de înregistrare Camera Deputaților'),
    firstChamber: field('Prima cameră'),
    lawType: field('Caracterul legii'),
    pdfs,
    timeline,
  };
}

// Pagina de opinii arată câte 10; restul vin prin „postback”-ul ASP.NET al listei (Page$2, Page$3…), cu cookie-ul de
// sesiune primit la prima cerere. Doar citim paginile următoare, nu trimitem nimic altceva.
async function fetchOpinionPages(url) {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DeStraja/1.0', Accept: 'text/html,application/xhtml+xml' };
  const first = await fetch(url, { headers });
  if (!first.ok) throw new Error(`HTTP ${first.status} for ${url}`);
  const cookie = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const pages = [await first.text()];
  const hidden = (page) =>
    Object.fromEntries(
      [...page.matchAll(/<input[^>]+type="hidden"[^>]*>/gi)].flatMap(([tag]) => {
        const name = tag.match(/name="([^"]+)"/)?.[1];
        return name ? [[decodeHtmlEntities(name), decodeHtmlEntities(tag.match(/value="([^"]*)"/)?.[1] ?? '')]] : [];
      }),
    );
  for (let n = 2; n <= 50; n++) {
    const last = pages.at(-1);
    if (!last.includes(`Page$${n}`)) break;
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', Referer: url, ...(cookie && { Cookie: cookie }) },
      body: new URLSearchParams({ ...hidden(last), __EVENTTARGET: 'ctl00$B_Center$lstOPinii', __EVENTARGUMENT: `Page$${n}` }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} la pagina ${n} de opinii`);
    pages.push(await res.text());
  }
  return pages;
}

async function parsePublicOpinions(bill) {
  if (!bill.opinionsCount || bill.opinionsCount === 0) return [];
  try {
    const opinions = [];
    const seen = new Set();
    for (const html of await fetchOpinionPages(bill.opinionsUrl)) {
      const blocks = html.split(/Număr de înregistrare:/i).slice(1);
      for (const block of blocks) {
        const regMatch = block.match(/^\s*(?:<[^>]+>\s*)*(\d+)/i);
        const dateMatch = block.match(/Data de postare a opiniei:\s*(?:<[^>]+>\s*)*([\d.: ]+)/i);
        const fromMatch = block.match(/De la:\s*(?:<[^>]+>\s*)*([^<]+)/i);
        const textMatch = block.match(/Textul opiniei:\s*([\s\S]*?)(?:<\/table>|$)/i);

        const regNo = regMatch ? regMatch[1].trim() : '';
        const date = dateMatch ? dateMatch[1].trim() : '';
        const author = fromMatch ? decodeHtmlEntities(fromMatch[1]) : 'Anonim';
        let text = textMatch ? stripTags(textMatch[1]) : '';
        text = text.replace(/Atașament:.*$/i, '').trim();

        if (text && !seen.has(regNo)) {
          seen.add(regNo);
          opinions.push({ regNo, date, author, text });
        }
      }
    }
    return opinions;
  } catch (err) {
    console.warn(`⚠️ Nu am putut extrage opiniile pentru ${bill.id}:`, err.message);
    return null;
  }
}

function readTextsQueue() {
  try {
    return JSON.parse(fs.readFileSync(TEXTS_QUEUE, 'utf8'));
  } catch {
    return {};
  }
}
const saveTextsQueue = (queue) => writeFileAtomic(TEXTS_QUEUE, JSON.stringify(queue, null, 2) + '\n');

async function loadPdfParse() {
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    return mod.default || mod;
  } catch {
    return null;
  }
}

/** Textele PDF-urilor unui proiect (writeBillTexts), cu `reread` textele de citit din nou. */
async function readTexts(slug, reread = []) {
  const pdfParse = await loadPdfParse();
  if (!pdfParse) return {};
  return writeBillTexts(path.join(PDF_DIR, slug), path.join(TEXT_DIR, slug), { pdfParse, cacheDir: path.join(ROOT_DIR, '.cache', 'ocr'), reread });
}

/**
 * Descarcă PDF-urile noi ale proiectului. Cu `texts` le citește și textul acum (proiectele din lista în consultare, pe
 * care le analizăm azi); fără, proiectul intră în coada lui --texte, dacă a venit ceva nou. `pulled`: câte PDF-uri au
 * venit chiar acum de pe VM (sunt noi, deși fișierul există deja).
 */
async function downloadPdfsAndExtractText(bill, shouldDownload = false, { texts = true, pulled = 0 } = {}) {
  if (!shouldDownload) return {};
  const billPdfDir = path.join(PDF_DIR, bill.slug);
  fs.mkdirSync(billPdfDir, { recursive: true });

  let added = 0;
  for (const pdf of bill.pdfs || []) {
    const filePath = path.join(billPdfDir, `${pdf.type}_${path.basename(pdf.url)}`);
    if (fs.existsSync(filePath)) continue;
    try {
      const res = await fetch(pdf.url, { signal: AbortSignal.timeout(180_000) });
      if (res.ok) {
        writeFileAtomic(filePath, Buffer.from(await res.arrayBuffer()));
        added++;
        pdfsAdded++;
      }
    } catch (err) {
      console.warn(`⚠️ Eroare PDF ${pdf.url}:`, err.message);
    }
  }
  // După numărul L fișa trimite la alte fișiere (26L622ES.PDF în loc de 26b523ES.PDF): rămân doar cele din fișa de azi.
  const reread = dropSuperseded(billPdfDir, (bill.pdfs || []).map((pdf) => `${pdf.type}_${path.basename(pdf.url)}`));
  // Pe VM nu se citesc texte: Mac-ul le citește după ce aduce PDF-urile (syncFromVm).
  if (IS_VM) return {};
  if (texts) return readTexts(bill.slug, reread);
  added += pulled;
  // Coada se scrie pe loc: o oprire a pasului după descărcare nu pierde ce e de citit (fișierul PDF există deja, deci
  // rularea următoare nu l-ar mai vedea ca nou). Intră și proiectele cu un PDF încă fără text (o citire căzută ieri),
  // cum le găsea până acum recitirea, care le citea pe loc.
  if (added || reread.length || withoutText(bill.slug)) saveTextsQueue(queueTexts(readTextsQueue(), bill.slug, reread));
  return {};
}

/** Are proiectul un PDF fără text notat în _meta.json? */
function withoutText(slug) {
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(path.join(TEXT_DIR, slug, '_meta.json'), 'utf8'));
  } catch {
    // fără meta: niciun text
  }
  return fs.readdirSync(path.join(PDF_DIR, slug)).some((f) => /\.pdf$/i.test(f) && !meta[textName(f)]);
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// O fișă fără parcurs sau fără documente e o pagină stricată: orice proiect are măcar înregistrarea și forma inițiatorului.
// Una cu mult mai puține rânduri decât ieri la fel; una cu câteva mai puține o credem (Senatul mai corectează), cu un semn.
function sheetProblem(details, prev) {
  if (!details.timeline.length) return 'fișa nu are parcurs';
  if (!details.pdfs.length) return 'fișa nu are documente';
  if (!prev?.timeline || !prev.pdfs) return null;
  if (details.timeline.length * 2 < prev.timeline.length) return `fișa are ${details.timeline.length} rânduri, față de ${prev.timeline.length}`;
  if (details.pdfs.length * 2 < prev.pdfs.length) return `fișa are ${details.pdfs.length} documente, față de ${prev.pdfs.length}`;
  if (details.timeline.length < prev.timeline.length || details.pdfs.length < prev.pdfs.length) {
    console.log(`\n⚠️ ${prev.id}: fișa are mai puțin ca ieri (${prev.timeline.length} → ${details.timeline.length} rânduri, ${prev.pdfs.length} → ${details.pdfs.length} documente)`);
  }
  return null;
}

/** Recitește fișa unui proiect păstrat; ce vine din listă (termen, opinii) și datele noastre rămân cum erau. */
async function rereadBill(b) {
  const details = await parseBillSheet(b);
  const problem = sheetProblem(details, b);
  if (problem) throw new Error(problem);
  const news = [
    details.stage !== b.stage && `stadiu: ${details.stage}`,
    details.senatNr && details.senatNr !== b.senatNr && `număr: ${details.senatNr}`,
    details.timeline.length !== (b.timeline?.length ?? 0) && `${details.timeline.length - (b.timeline?.length ?? 0)} rânduri noi`,
    details.pdfs.length !== (b.pdfs?.length ?? 0) && `${details.pdfs.length - (b.pdfs?.length ?? 0)} documente noi`,
  ].filter(Boolean);
  const next = { ...b, ...details, syncedAt: new Date().toISOString() };
  await downloadPdfsAndExtractText(next, true, { texts: false });
  return { next, news };
}

/** Un proiect din lista în consultare: fișa, opiniile (cele necitite azi rămân cele de ieri) și PDF-urile. */
async function fetchBill(item, prev) {
  const details = await parseBillSheet(item);
  const problem = sheetProblem(details, prev);
  if (problem) throw new Error(problem);
  const opinions = (await parsePublicOpinions(item)) ?? prev?.publicOpinions ?? [];
  const fullBill = { ...item, ...details, publicOpinions: opinions, syncedAt: new Date().toISOString() };
  await downloadPdfsAndExtractText(fullBill, true);
  return fullBill;
}

// ── Proiecte recuperate după cod ──
// node scripts/straja-sync.mjs --restore B517/2026=27956 [B518/2026=27957 …]
// Până pe 25 octombrie 2026 sincronizarea rescria fișierul doar cu lista Senatului, deci un proiect ieșit din consultare
// dispărea. B517–B522/2026 au ieșit așa (au primit numerele L617–L621) cu câteva zile înainte de păstrarea lor, iar
// analizele lor au rămas fără proiect: straja-council.mjs nu le mai găsea. Lista Senatului nu le mai are, așa că le citim
// fișa după cod; titlul vine din rândul fișei, iar termenul consultării e înregistrarea plus 30 de zile, ca la toate
// proiectele din listă. După asta rămân în fișier și se recitesc ca orice proiect ieșit din consultare.
async function restoreBills(pairs) {
  const previous = new Map(
    (fs.existsSync(BILLS_FILE) ? JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8')) : []).map((b) => [b.id, b]),
  );
  const ddmmyyyy = (iso) => iso.split('-').reverse().join('-');
  for (const pair of pairs) {
    const [id, cod] = pair.split('=');
    if (!/^B\d+\/\d{4}$/.test(id ?? '') || !/^\d+$/.test(cod ?? '')) throw new Error(`--restore așteaptă B123/2026=27956, nu „${pair}”`);
    const [nr, an] = id.split('/');
    const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const item = {
      id,
      slug,
      cod,
      officialTitle: '',
      consultationDeadline: '',
      opinionsCount: 0,
      sheetUrl: `${SENAT_BASE}/Legis/Lista.aspx?cod=${cod}&pos=0&NR=${nr.toLowerCase()}&AN=${an}`,
      opinionsUrl: `${SENAT_BASE}/LegiProiectAdmin.aspx?Cod=${cod}`,
    };
    const details = await parseBillSheet(item);
    const problem = sheetProblem(details, previous.get(id));
    if (problem) throw new Error(`${id}: ${problem}`);
    // Codul greșit ar aduce alt proiect: fișa trebuie să pomenească numărul B la înregistrare (sau să-l aibă încă).
    const registered = details.timeline.find((t) => new RegExp(`Înregistrat la Senat pentru dezbatere cu nr\\.${nr}\\b`, 'i').test(t.action));
    if (!registered && details.senatNr !== id) throw new Error(`${id}: fișa cu codul ${cod} nu e a acestui proiect (${details.senatNr ?? 'fără număr'})`);
    const html = await fetchHtml(item.sheetUrl);
    const title = html.match(/lista-legis-table-title-container">\s*<p[^>]*>\s*<b>([\s\S]*?)<\/b>/i);
    item.officialTitle = title ? stripTags(title[1]).replace(/\s+/g, ' ').trim() : '';
    if (!item.officialTitle) throw new Error(`${id}: fișa nu are titlu`);
    if (registered) item.consultationDeadline = ddmmyyyy(addDays(ddmmyyyy(registered.date), 30));
    // Fără rândul din listă nu știm câte opinii are: pagina lor se citește oricum (opinionsCount 0 ar sări peste ea).
    const opinions = (await parsePublicOpinions({ ...item, opinionsCount: 1 })) ?? previous.get(id)?.publicOpinions ?? [];
    const bill = { ...item, opinionsCount: opinions.length, ...details, publicOpinions: opinions, syncedAt: new Date().toISOString() };
    await downloadPdfsAndExtractText(bill, true);
    previous.set(id, bill);
    console.log(`♻️ ${id} (${details.senatNr ?? '-'}, ${details.stage}): ${item.officialTitle.slice(0, 90)}`);
  }
  writeFileAtomic(BILLS_FILE, JSON.stringify([...previous.values()], null, 2));
  console.log(`\n🎉 Salvat ${previous.size} proiecte în ${BILLS_FILE}`);
}

/** --texte: textele documentelor noi ale proiectelor recitite, din coada lăsată de recitiri. */
async function readQueue(minutes) {
  const queue = readTextsQueue();
  const stats = await readQueuedTexts(queue, {
    read: async (slug, reread) => {
      if (!fs.existsSync(path.join(PDF_DIR, slug))) return;
      await readTexts(slug, reread);
    },
    save: saveTextsQueue,
    stop: () => clock.awakeMs() >= minutes * 60_000,
  });
  console.log(`✅ texte: ${JSON.stringify(stats)}`);
}

// ── VM-ul destraja ──

const readJsonFile = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, value) => writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
const saveBills = (all) => writeFileAtomic(BILLS_FILE, JSON.stringify(all, null, 2));
const vmConfigured = () => !IS_VM && fs.existsSync(JUMP_FILE) && fs.existsSync(VM_KEY);

/** ssh spre VM cu cheia restrânsă, prin gazda de salt; fără agent (1Password poate fi blocat). */
function vmSsh() {
  const jump = fs.readFileSync(JUMP_FILE, 'utf8').trim();
  if (!/^[\w@.-]+$/.test(jump)) throw new Error(`.cache/agenda-vm nu e o gazdă: „${jump}”`);
  return ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-i', VM_KEY, '-J', jump];
}

function run(cmd, argv, { input = null, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, argv, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd}: ${shortError(stderr, err.message)}`));
      else resolve(stdout);
    });
    // ssh închis înainte să citească tot (VM-ul nu răspunde): eroarea vine din codul de ieșire, nu din scriere.
    child.stdin.on('error', () => {});
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Aduce `files` (relative la ~/senat-vm/data pe VM) în .cache/senat-vm; cu `list`, căile vin printr-un fișier. */
async function vmPull(files, { list = false } = {}) {
  fs.mkdirSync(VM_STAGE, { recursive: true });
  const e = vmSsh().map((a) => (/\s/.test(a) ? `'${a}'` : a)).join(' ');
  const base = ['-a', '--timeout=120', '--exclude=*.tmp', '-e', e];
  if (!list) return run('rsync', [...base, ...files.map((f, i) => (i ? `:${f}` : `${VM_HOST}:${f}`)), `${VM_STAGE}/`]);
  const listFile = path.join(VM_STAGE, '.de-adus');
  fs.writeFileSync(listFile, files.join('\n') + '\n');
  try {
    // --ignore-missing-args: un PDF pe care nici VM-ul nu l-a putut descărca îl cere Mac-ul de la senat.ro.
    return await run('rsync', [...base, '--ignore-missing-args', `--files-from=${listFile}`, `${VM_HOST}:.`, `${VM_STAGE}/`], { timeoutMs: 1_800_000 });
  } finally {
    fs.rmSync(listFile, { force: true });
  }
}

/** Îi trimite VM-ului fișierul nostru: proiectele știute doar de Mac și citirile mai noi ale Mac-ului ajung și acolo. */
async function vmPush() {
  if (!vmConfigured() || !fs.existsSync(BILLS_FILE)) return;
  try {
    await run(vmSsh()[0], [...vmSsh().slice(1), VM_HOST, 'put-bills'], { input: fs.readFileSync(BILLS_FILE), timeoutMs: 120_000 });
  } catch (err) {
    console.log(`⚠️ Fișierul n-a ajuns pe VM (${err.message}); îl trimit la rularea următoare.`);
  }
}

/** Rândul pentru rularea zilnică (scripts/straja-daily.mjs îl pune în rezumat) și data/senat-sursa.json pentru /admin. */
function reportSource(source) {
  writeJson(SOURCE_FILE, { day: todayBucharest(), at: new Date().toISOString(), ...source });
  console.log(`📡 ${sourceLine(source)}`);
  console.log(`✅ sursa: ${JSON.stringify({ from: source.from, listTime: source.listTime ?? null, why: source.why ?? null, vmConfigured: source.vmConfigured })}`);
}

/** status.json de pe VM, adus acum; aruncă dacă VM-ul nu răspunde. */
async function pullVmStatus() {
  fs.rmSync(path.join(VM_STAGE, 'status.json'), { force: true });
  await vmPull(['status.json']);
  return readJsonFile(path.join(VM_STAGE, 'status.json'));
}

/**
 * Pasul Senatului din datele VM-ului, a cărui listă e de azi (`status`, adus de pullVmStatus). Întoarce { used: true, … }
 * după ce a scris fișierul, sau { used: false, why } fără să fi schimbat nimic (Mac-ul citește atunci singur).
 */
async function syncFromVm(status) {
  // Fișierul după stare: VM-ul scrie starea după fișier, deci fișierul adus acum e cel puțin la fel de nou.
  try {
    await vmPull(['senat-bills.json']);
  } catch (err) {
    return { used: false, why: `fișierul VM-ului n-a venit: ${err.message.slice(0, 160)}` };
  }
  const vmBills = readJsonFile(path.join(VM_STAGE, 'senat-bills.json'));
  if (!Array.isArray(vmBills) || vmBills.length < 5) return { used: false, why: 'fișierul VM-ului e gol sau stricat' };

  const macBills = readJsonFile(BILLS_FILE, []);
  const macHad = new Set(macBills.map((b) => b.id));
  const { bills, fromVm, macOnly } = mergeBills(vmBills, macBills);
  const byId = new Map(bills.map((b) => [b.id, b]));
  const listIds = (status.listIds ?? []).filter((id) => byId.has(id));
  const inList = new Set(listIds);
  console.log(
    `📥 De pe VM (lista din ${bucharestTime(status.listAt)}, ${status.listCount} proiecte în consultare): ` +
      `${fromVm.length} proiecte noi sau mai noi${macOnly.length ? `, ${macOnly.length} știute doar de Mac` : ''}.`,
  );

  // Un proiect nou pentru Mac intră în fișier abia după ce are PDF-urile (și, în consultare, textul), ca la citirea de pe
  // Mac: oprit la jumătate, pasul nu lasă proiecte fără documente pentru analizele de după.
  const pending = new Set(fromVm.filter((id) => !macHad.has(id)));
  const save = () => saveBills(bills.filter((b) => !pending.has(b.id)));
  save();

  // PDF-urile care lipsesc pe Mac, într-o singură cerere; ce nu are nici VM-ul se cere de la senat.ro mai jos.
  const exists = (slug, name) => fs.existsSync(path.join(PDF_DIR, slug, name));
  const want = neededPdfs(bills, [...fromVm, ...listIds], exists);
  const pulled = new Map();
  if (want.length) {
    try {
      await vmPull(want, { list: true });
    } catch (err) {
      console.log(`⚠️ PDF-urile de pe VM n-au venit toate (${err.message}); le cer de la senat.ro.`);
    }
    for (const rel of want) {
      const from = path.join(VM_STAGE, rel);
      if (!fs.existsSync(from)) continue;
      const [, slug, name] = rel.split('/');
      fs.mkdirSync(path.join(PDF_DIR, slug), { recursive: true });
      fs.renameSync(from, path.join(PDF_DIR, slug, name));
      pulled.set(slug, (pulled.get(slug) ?? 0) + 1);
    }
    console.log(`📥 ${[...pulled.values()].reduce((a, n) => a + n, 0)} din ${want.length} PDF-uri noi aduse de pe VM.`);
  }

  // Proiectele din consultare acum: textul se citește azi, pentru analize (doar ce lipsește; restul e deja citit).
  for (const id of listIds) {
    const b = byId.get(id);
    process.stdout.write(`📄 ${id}: `);
    try {
      await downloadPdfsAndExtractText(b, true, { texts: true, pulled: pulled.get(b.slug) ?? 0 });
      console.log(`OK (${b.pdfs?.length ?? 0} PDF-uri)`);
    } catch (err) {
      console.log(`EROARE la texte: ${err.message}`);
    }
    pending.delete(id);
    save();
  }
  // Celelalte, aduse de VM din recitiri: PDF-urile noi intră în coada lui --texte (pasul următor).
  for (const id of fromVm.filter((x) => !inList.has(x))) {
    const b = byId.get(id);
    try {
      await downloadPdfsAndExtractText(b, true, { texts: false, pulled: pulled.get(b.slug) ?? 0 });
    } catch (err) {
      console.log(`⚠️ ${id}: ${err.message}`);
    }
    pending.delete(id);
  }
  save();

  // Proiectele noi din lista de azi pe care VM-ul nu le-a putut citi: Mac-ul încearcă singur, o dată.
  for (const item of status.failedNew ?? []) {
    if (byId.has(item.id) || !item.sheetUrl?.startsWith(SENAT_BASE)) continue;
    process.stdout.write(`🔍 ${item.id} (necitit de VM): `);
    try {
      const bill = await fetchBill(item, undefined);
      bills.push(bill);
      byId.set(bill.id, bill);
      save();
      console.log('OK');
    } catch (err) {
      console.log(`EROARE: ${err.message} (îl reiau la rularea următoare)`);
    }
  }

  // Lista în consultare e întreagă, din ziua VM-ului: alertele de azi o pot folosi (straja-digest.mjs).
  fs.mkdirSync(path.dirname(SYNC_DAY_FILE), { recursive: true });
  writeFileAtomic(SYNC_DAY_FILE, status.listDay + '\n');
  return { used: true, fromVm: fromVm.length, pdfs: [...pulled.values()].reduce((a, n) => a + n, 0) };
}

/** Pe VM: ce i-a trimis Mac-ul (put-bills) se unește cu fișierul VM-ului înainte de citire, o singură dată. */
function adoptMacBills(previous) {
  const mac = readJsonFile(VM_INBOX);
  if (!Array.isArray(mac)) return previous;
  const { bills, macOnly } = mergeBills(previous, mac.filter((b) => b?.id && b.slug && b.consultationDeadline));
  fs.renameSync(VM_INBOX, `${VM_INBOX}.folosit`);
  console.log(`📨 Fișierul Mac-ului: ${mac.length} proiecte${macOnly.length ? `, ${macOnly.length} noi pentru VM` : ''}.`);
  return bills;
}

/** Pe VM: rularea întreagă, cu status.json scris după listă și la sfârșit (și la o eroare). */
async function syncOnVm() {
  const startedAt = new Date().toISOString();
  const today = todayBucharest();
  // Ce știm din rulările de azi rămâne (o rulare de la 12:30 căzută nu șterge lista de la 07:30).
  const before = readJsonFile(VM_STATUS_FILE, {});
  let status = { ...(before.listDay === today ? before : {}), startedAt, finishedAt: null, ok: null, error: null };
  const writeStatus = (patch) => {
    status = { ...status, ...patch };
    writeJson(VM_STATUS_FILE, status);
  };
  writeStatus({});
  try {
    const list = await parseConsultationList();
    if (list.length < 5) throw new Error(`Lista Senatului are doar ${list.length} proiecte; formatul s-a schimbat?`);
    const previous = adoptMacBills(readJsonFile(BILLS_FILE, []));
    const failed = [];
    const { bills, reread } = await syncBills({
      list,
      previous,
      fetchBill: async (item, prev) => {
        try {
          return await fetchBill(item, prev);
        } catch (err) {
          failed.push({ item, isNew: !prev, error: err.message });
          throw err;
        }
      },
      reread: rereadBill,
      save: saveBills,
      onListSaved: () =>
        writeStatus({
          listDay: today,
          listAt: new Date().toISOString(),
          listCount: list.length,
          listIds: list.map((i) => i.id),
          failedNew: failed.filter((f) => f.isNew).map((f) => f.item),
          failedCount: failed.length,
        }),
      today,
      rereadStop: () => clock.awakeMs() >= opt('recitiri-minute', REREAD_MINUTES) * 60_000,
    });
    writeStatus({
      finishedAt: new Date().toISOString(),
      ok: true,
      bills: bills.length,
      pdfsDownloaded: pdfsAdded,
      reread,
      durationSec: Math.round((Date.now() - Date.parse(startedAt)) / 1000),
    });
    console.log(`\n🎉 Salvat ${bills.length} proiecte, ${pdfsAdded} PDF-uri noi.`);
  } catch (err) {
    writeStatus({ finishedAt: new Date().toISOString(), ok: false, error: String(err.message ?? err).slice(0, 300), pdfsDownloaded: pdfsAdded });
    throw err;
  }
}

const opt = (name, def) => Number(ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def);

/** Citirea de pe Mac, ca înainte de VM: lista, fișele, recitirile, PDF-urile și textul lor. */
async function syncOnMac(targetFilter) {
  const list = await parseConsultationList();
  // O listă aproape goală înseamnă o pagină stricată, nu proiecte închise: nu marcăm nimic pe baza ei.
  if (list.length < 5) throw new Error(`Lista Senatului are doar ${list.length} proiecte; formatul s-a schimbat?`);
  // Rulează nesupravegheat în fiecare dimineață: nu pierdem niciodată ce aveam deja.
  // Proiectele scoase din lista Senatului rămân (consultare încheiată), iar o fișă care nu se
  // încarcă azi își păstrează datele de ieri. Fișierul se scrie după fiecare proiect (lib/senat-sync.mjs).
  const previous = readJsonFile(BILLS_FILE, []);
  const { bills } = await syncBills({
    list,
    previous,
    targetFilter,
    fetchBill,
    reread: rereadBill,
    save: saveBills,
    onListSaved: () => {
      // Lista întreagă e citită și salvată: alertele de azi o pot folosi, oricât ar ține recitirile.
      fs.mkdirSync(path.dirname(SYNC_DAY_FILE), { recursive: true });
      writeFileAtomic(SYNC_DAY_FILE, todayBucharest() + '\n');
      console.log(`💾 Lista în consultare e salvată în ${BILLS_FILE}`);
    },
    today: todayBucharest(),
    rereadStop: () => clock.awakeMs() >= opt('recitiri-minute', REREAD_MINUTES) * 60_000,
  });
  console.log(`\n🎉 Salvat ${bills.length} proiecte în ${BILLS_FILE}`);
}

async function main() {
  if (ARGS.includes('--restore')) {
    await restoreBills(ARGS.filter((a) => !a.startsWith('--')));
    return vmPush();
  }
  if (ARGS.includes('--texte')) return readQueue(opt('minute', TEXTS_MINUTES));
  if (IS_VM) return syncOnVm();
  const targetFilter = ARGS.find((a) => !a.startsWith('--'));
  if (targetFilter) return syncOnMac(targetFilter);

  const source = await senatStep({
    vmConfigured: vmConfigured() && !ARGS.includes('--fara-vm'),
    today: todayBucharest(),
    pullStatus: pullVmStatus,
    fromVm: syncFromVm,
    fromMac: async (why) => {
      if (why) console.log(`📡 ${why}: citesc Senatul de pe Mac.`);
      await syncOnMac(null);
    },
  });
  if (!source.vmConfigured && ARGS.includes('--fara-vm')) source.why = 'cu --fara-vm';
  reportSource(source);
  await vmPush();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
