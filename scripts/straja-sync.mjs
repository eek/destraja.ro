#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBillTexts } from './lib/pdf-text.mjs';
import { todayBucharest } from './lib/web.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');

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
          party: m[3].trim().toUpperCase(),
        };
      }
      return { name: entry, role: 'parlamentar', party: 'NEAFILIAT' };
    });
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DeStraja/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
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

  // Extract PDFs
  const pdfMatches = [...html.matchAll(/<a[^>]+href=["']([^"']*\/legis\/PDF\/[^"']+\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const pdfs = [];
  const seenUrls = new Set();

  for (const pm of pdfMatches) {
    let rawHref = pm[1].replace(/\\/g, '/').split('?')[0];
    if (!rawHref.startsWith('http')) {
      rawHref = `${SENAT_BASE}/${rawHref.replace(/^\//, '')}`;
    }
    if (seenUrls.has(rawHref.toLowerCase())) continue;
    seenUrls.add(rawHref.toLowerCase());

    const label = stripTags(pm[2]).replace(/^-\s*/, '').trim();
    let type = 'other';
    if (/forma\s+ini[țţ]iatorului|FG\.PDF/i.test(label + ' ' + rawHref)) type = 'forma_initiatorului';
    else if (/expunerea\s+de\s+motive|EM\.PDF/i.test(label + ' ' + rawHref)) type = 'expunere_motive';
    else if (/adresa\s+de\s+[îi]naintare|AD\.PDF/i.test(label + ' ' + rawHref)) type = 'adresa_inaintare';
    else if (/aviz|CES|consiliul/i.test(label + ' ' + rawHref)) type = 'aviz';

    pdfs.push({
      type,
      label: label || path.basename(rawHref),
      url: rawHref,
    });
  }

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

  return {
    initiators,
    parties,
    isCrossParty: parties.length >= 3,
    emergencyRequested,
    emergencyApproved,
    stage,
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
    return [];
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
      const res = await fetch(pdf.url);
      if (res.ok) fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
    } catch (err) {
      console.warn(`⚠️ Eroare PDF ${pdf.url}:`, err.message);
    }
  }

  let pdfParse = null;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = mod.default || mod;
  } catch {
    return {};
  }
  return writeBillTexts(billPdfDir, path.join(TEXT_DIR, bill.slug), { pdfParse, cacheDir: path.join(ROOT_DIR, '.cache', 'ocr') });
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const downloadAllPdfs = args.includes('--download-pdfs');
  const targetFilter = args.find((a) => !a.startsWith('--'));

  const list = await parseConsultationList();
  // O listă aproape goală înseamnă o pagină stricată, nu proiecte închise: nu marcăm nimic pe baza ei.
  if (list.length < 5) throw new Error(`Lista Senatului are doar ${list.length} proiecte; formatul s-a schimbat?`);
  const enriched = [];
  // Rulează nesupravegheat în fiecare dimineață: nu pierdem niciodată ce aveam deja.
  // Proiectele scoase din lista Senatului rămân (consultare încheiată), iar o fișă care nu se
  // încarcă azi își păstrează datele de ieri.
  const previous = new Map(
    (fs.existsSync(BILLS_FILE) ? JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8')) : []).map((b) => [b.id, b]),
  );

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (targetFilter && !item.id.toLowerCase().includes(targetFilter.toLowerCase()) && !item.slug.includes(targetFilter.toLowerCase())) {
      continue;
    }
    process.stdout.write(`🔍 [${i + 1}/${list.length}] Se extrage fișa pentru ${item.id}... `);
    try {
      const details = await parseBillSheet(item);
      const opinions = await parsePublicOpinions(item);
      const fullBill = {
        ...item,
        ...details,
        publicOpinions: opinions,
        syncedAt: new Date().toISOString(),
      };
      await downloadPdfsAndExtractText(fullBill, true);
      enriched.push(fullBill);
      console.log(`OK (${details.initiators.length} inițiatori, ${details.pdfs.length} PDF-uri, ${opinions.length} opinii)`);
    } catch (err) {
      console.log(`EROARE: ${err.message}${previous.has(item.id) ? ' (păstrez datele anterioare)' : ''}`);
      enriched.push(previous.get(item.id) ?? item);
    }
  }

  if (!targetFilter) {
    const seen = new Set(enriched.map((b) => b.id));
    const kept = [...previous.values()].filter((b) => !seen.has(b.id));
    if (kept.length) console.log(`📁 Păstrez ${kept.length} proiecte care nu mai sunt în lista Senatului.`);
    // Senatul scoate un proiect din consultare când îi dă număr L (sau îl trece „pt. informare”), uneori cu săptămâni
    // înainte de termenul afișat. Lista e o interogare pe starea proiectului, deci o singură citire validă ajunge.
    // Păstrăm termenul anunțat și mutăm termenul efectiv în ziua dinainte, ca site-ul să-l arate închis.
    const today = todayBucharest();
    for (const b of kept) {
      if (b.leftListAt || b.consultationDeadline < today) continue;
      Object.assign(b, { leftListAt: today, announcedDeadline: b.consultationDeadline, consultationDeadline: addDays(today, -1) });
      console.log(`🔒 ${b.id} a ieșit din consultare pe ${today}, înainte de termenul anunțat (${b.announcedDeadline}).`);
    }
    enriched.push(...kept);
  } else {
    // Cu filtru actualizăm doar proiectele cerute, restul rămân neatinse.
    for (const b of enriched) previous.set(b.id, b);
    enriched.splice(0, enriched.length, ...previous.values());
  }

  fs.writeFileSync(BILLS_FILE, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`\n🎉 Salvat ${enriched.length} proiecte în ${BILLS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
