#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dropSuperseded, writeBillTexts } from './lib/pdf-text.mjs';
import { todayBucharest } from './lib/web.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';
import { syncBills } from './lib/senat-sync.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');
// Ziua ultimei sincronizări reușite a întregii liste: fără ea de azi, straja-digest.mjs nu trimite alertele.
const SYNC_DAY_FILE = path.join(ROOT_DIR, '.cache', 'senat-sync-day');
// Recitirea fișelor proiectelor ieșite din consultare e întreținere: după atâtea minute de la pornirea pasului nu mai
// începe alta (ce rămâne vine mâine, cele mai vechi întâi). Rularea zilnică dă pasului 180 de minute, pe ceasul de
// perete: pe 25 noiembrie 2026 Mac-ul a adormit în timpul recitirilor, pasul a fost oprit la limită imediat după trezire
// și proiectele noi citite dimineața n-au fost salvate. --recitiri-minute=N.
const REREAD_MINUTES = 90;
const STARTED = Date.now();

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

async function downloadPdfsAndExtractText(bill, shouldDownload = false) {
  if (!shouldDownload) return {};
  const billPdfDir = path.join(PDF_DIR, bill.slug);
  fs.mkdirSync(billPdfDir, { recursive: true });

  for (const pdf of bill.pdfs || []) {
    const filePath = path.join(billPdfDir, `${pdf.type}_${path.basename(pdf.url)}`);
    if (fs.existsSync(filePath)) continue;
    try {
      const res = await fetch(pdf.url, { signal: AbortSignal.timeout(180_000) });
      if (res.ok) writeFileAtomic(filePath, Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.warn(`⚠️ Eroare PDF ${pdf.url}:`, err.message);
    }
  }
  // După numărul L fișa trimite la alte fișiere (26L622ES.PDF în loc de 26b523ES.PDF): rămân doar cele din fișa de azi.
  const reread = dropSuperseded(billPdfDir, (bill.pdfs || []).map((pdf) => `${pdf.type}_${path.basename(pdf.url)}`));

  let pdfParse = null;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = mod.default || mod;
  } catch {
    return {};
  }
  return writeBillTexts(billPdfDir, path.join(TEXT_DIR, bill.slug), { pdfParse, cacheDir: path.join(ROOT_DIR, '.cache', 'ocr'), reread });
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
  await downloadPdfsAndExtractText(next, true);
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

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--restore')) return restoreBills(args.filter((a) => !a.startsWith('--')));
  const targetFilter = args.find((a) => !a.startsWith('--'));
  const rereadMinutes = Number(args.find((a) => a.startsWith('--recitiri-minute='))?.split('=')[1] ?? REREAD_MINUTES);

  const list = await parseConsultationList();
  // O listă aproape goală înseamnă o pagină stricată, nu proiecte închise: nu marcăm nimic pe baza ei.
  if (list.length < 5) throw new Error(`Lista Senatului are doar ${list.length} proiecte; formatul s-a schimbat?`);
  // Rulează nesupravegheat în fiecare dimineață: nu pierdem niciodată ce aveam deja.
  // Proiectele scoase din lista Senatului rămân (consultare încheiată), iar o fișă care nu se
  // încarcă azi își păstrează datele de ieri. Fișierul se scrie după fiecare proiect (lib/senat-sync.mjs).
  const previous = fs.existsSync(BILLS_FILE) ? JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8')) : [];
  const { bills } = await syncBills({
    list,
    previous,
    targetFilter,
    fetchBill,
    reread: rereadBill,
    save: (all) => writeFileAtomic(BILLS_FILE, JSON.stringify(all, null, 2)),
    onListSaved: () => {
      // Lista întreagă e citită și salvată: alertele de azi o pot folosi, oricât ar ține recitirile.
      fs.mkdirSync(path.dirname(SYNC_DAY_FILE), { recursive: true });
      writeFileAtomic(SYNC_DAY_FILE, todayBucharest() + '\n');
      console.log(`💾 Lista în consultare e salvată în ${BILLS_FILE}`);
    },
    today: todayBucharest(),
    rereadUntil: STARTED + rereadMinutes * 60_000,
  });
  console.log(`\n🎉 Salvat ${bills.length} proiecte în ${BILLS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
