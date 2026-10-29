#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { textName, writeBillTexts } from './lib/pdf-text.mjs';
import { runModel } from './lib/ai-cli.mjs';
import { CdepBlocked, fetchCdepFile } from './lib/cdep.mjs';
import { unitDiff } from './lib/text-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');

fs.mkdirSync(TEXT_DIR, { recursive: true });
fs.mkdirSync(ANALYSES_DIR, { recursive: true });

// La Cameră (--camera, --versions) citim în modul rapid: sute de proiecte, din care modelele citesc doar începutul
// documentelor. Textele întregi le face apoi scripts/straja-texts.mjs.
const FAST_TEXTS = process.argv.includes('--camera') || process.argv.includes('--versions');
// Analiza unui proiect de la Cameră folosește doar forma cea mai nouă (latestVersion): formele mai vechi le citesc
// --versions și straja-texts, ca GPU-ul să nu le citească de două ori în timp ce analizele așteaptă.
const ANALYSIS_ONLY = process.argv.includes('--camera') && !process.argv.includes('--versions');
const olderForms = (pdfDir) => {
  const have = new Set(fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir).map((f) => textName(f)) : []);
  const newer = Object.values(FORMS).map((f) => f.text).find((t) => have.has(t));
  return (name) => name.startsWith('forma_') && name !== 'forma_ordonanta' && name !== newer;
};

async function extractPdfTextsForBill(bill) {
  let pdfParse = null;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = mod.default || mod;
  } catch {
    return {};
  }

  return writeBillTexts(path.join(PDF_DIR, bill.slug), path.join(TEXT_DIR, bill.slug), {
    pdfParse,
    cacheDir: path.join(ROOT_DIR, '.cache', 'ocr'),
    fast: FAST_TEXTS,
    ...(ANALYSIS_ONLY && { skip: olderForms(path.join(PDF_DIR, bill.slug)) }),
  });
}

// Formele textului unui proiect de la Cameră, de la cea mai nouă: modelele analizează forma aflată acum în dezbatere,
// iar la comparații (--versions) câte una anume.
const FORMS = {
  camera: { text: 'forma_camera', label: 'FORMA ADOPTATĂ DE CAMERA DEPUTAȚILOR' },
  senat: { text: 'forma_senat', label: 'FORMA ADOPTATĂ DE SENAT' },
  initiator: { text: 'forma_initiatorului', label: 'FORMA INIȚIATORULUI' },
};
const VERSION_LABEL = { initiator: 'Forma inițiatorului', senat: 'Forma adoptată de Senat', camera: 'Forma adoptată de Cameră' };
const latestVersion = (texts) => Object.keys(FORMS).find((k) => texts[FORMS[k].text]) ?? 'initiator';

function buildCouncilPrompt(bill, texts, version) {
  // La legile de aprobare a unei ordonanțe, legea are un articol, iar conținutul e în ordonanță: le dăm pe amândouă.
  const form = bill.chamber ? FORMS[version ?? latestVersion(texts)] : FORMS.initiator;
  const main = texts[form.text] || '';
  const oug = texts.forma_ordonanta || '';
  const fgSnippet = (oug ? `${main.slice(0, 5000)}\n\n[TEXTUL ORDONANȚEI]\n${oug}` : main).slice(0, 14000);
  const emSnippet = (texts.expunere_motive || '').slice(0, 10000);
  const initiatorsStr = (bill.initiators || [])
    .map((i) => `${i.name} (${i.role} ${i.party})`)
    .join(', ');

  const cam = bill.chamber;
  const intro = cam
    ? AT_CHAMBER.test(cam.stadiu)
      ? `Analizează următorul proiect de lege aflat în dezbatere la Camera Deputaților`
      : `Analizează următorul proiect de lege înregistrat la Camera Deputaților (stadiul de acum: ${cam.stadiu})`
    : `Analizează următoarea propunere legislativă aflată în consultare publică la Senatul României`;
  const facts = cam
    ? `DATE OFICIALE CAMERA DEPUTAȚILOR:
- Indicativ: ${bill.id}${cam.numarSenat ? ` (la Senat: ${cam.numarSenat})` : ''}
- Titlu oficial: ${bill.officialTitle}
- Stadiu: ${cam.stadiu}
- Camera decizională: ${cam.cameraDecizionala || 'necunoscută'}
- Comisiile care fac raportul: ${cam.raport.join('; ') || 'nestabilite încă'}
- Termen pentru amendamente: ${cam.termenAmendamente || 'nestabilit'}
- Procedură de urgență: ${bill.emergencyRequested ? 'DA' : 'NU'}
- Inițiatori: ${initiatorsStr || cam.initiator || 'Vezi documentele PDF'}
- Obiectul de reglementare, după fișa Camerei: ${cam.obiect || '-'}`
    : `DATE OFICIALE SENAT:
- Indicativ: ${bill.id}
- Titlu oficial: ${bill.officialTitle}
- Termen consultare publică: ${bill.consultationDeadline}
- Procedură de urgență solicitată: ${bill.emergencyRequested ? 'DA' : 'NU'}
- Inițiatori: ${initiatorsStr || 'Vezi documentele PDF'}`;
  const textLabel =
    form === FORMS.initiator
      ? 'TEXT EXTRAS DIN FORMA INIȚIATORULUI (dacă e disponibil, altfel bazează-te pe titlu și context)'
      : `TEXT EXTRAS DIN ${form.label} (evaluează această formă a textului)`;
  const formRule = cam
    ? `4. Câmpul "senatForm" conține aici propunerea de modificare pe care un cetățean o trimite prin e-mail comisiei Camerei care face raportul (un deputat o poate prelua ca amendament): articleRef = articolul vizat, proposalContent = textul propus pentru articol (sau eliminarea lui), argumentation = motivarea, otherComments = alte observații. Respectă STRICT limitele de caractere:`
    : `4. Pentru formularul Senatului, respectă STRICT limitele de caractere:`;

  return `Ești un auditor legislativ și constituționalist român de elită. ${intro} și returnează EXCLUSIV un obiect JSON valid (fără alte comentarii în afara JSON-ului).

${facts}

${textLabel}:
${fgSnippet || '[PDF scanat ca imagine sau indisponibil text]'}

TEXT EXTRAS DIN EXPUNEREA DE MOTIVE:
${emSnippet || '[PDF scanat ca imagine sau indisponibil text]'}

REGULI DE RIGOARE:
1. Nu exagera și nu inventa articole care nu există. Separă clar pretextul din Expunerea de Motive de efectul mecanic real al articolelor.
2. Verifică: (a) Claritatea/previzibilitatea legii (Art. 1 alin. 5 / Art. 23 alin. 12 Constituție), (b) Impactul asupra concurenței și Directiva (UE) 2018/958 privind testul de proporționalitate, (c) Directiva (UE) 2015/1535 (TRIS) dacă reglementează servicii digitale/AI, (d) Impactul bugetar sau birocratic asupra cetățenilor/IMM-urilor.
3. Dacă legea este benignă, tehnică sau pozitivă, dă-i scor mic de risc (1-3, "green") și explică onest de ce e utilă sau neutră. Dacă are capcane, monopoluri, taxe sau sancțiuni disproporționate, dă-i scor 4-6 ("yellow") sau 7-10 ("red").
${formRule}
   - articleRef: MAXIMUM 50 caractere
   - proposalContent: MAXIMUM 380 caractere
   - argumentation: MAXIMUM 380 caractere
   - otherComments: MAXIMUM 380 caractere

STRUCTURA JSON CERUTĂ:
{
  "riskScore": 1-10,
  "riskLevel": "red" | "yellow" | "green",
  "plainTitle": "Titlu scurt, pe înțelesul oricărui om, fără limbaj de lemn",
  "verdictShort": "1-2 fraze percutante cu verdictul tău ca model AI",
  "initiatorClaim": "Ce spun inițiatorii că vor să rezolve (1-2 fraze)",
  "realityCheck": "Ce face legea în realitate și ce chichițe/efecte secundare are (2-3 fraze)",
  "affectedGroups": ["IMM & Antreprenori", "IT & AI", "Contabili & Fiscalitate", "Angajați & HR", "Șoferi & Auto", "Proprietari & Imobiliare", "Justiție & Drepturi Civile", "Sănătate & Educație", "Agricultură & Mediu", "Toți cetățenii"],
  "keyFindings": [
    "Descoperire concretă 1 (cu articol dacă există)",
    "Descoperire concretă 2",
    "Descoperire concretă 3"
  ],
  "blindSpotsCaught": "Ce detaliu subtil, chichiță procedurală sau directivă UE ai observat în text",
  "constitutionalityNote": "Evaluare pe Constituția României",
  "euLawNote": "Evaluare pe Dreptul UE (Directiva 2018/958, TRIS 2015/1535, piața unică etc.)",
  "senatForm": {
    "articleRef": "Max 50 caractere",
    "proposalContent": "Max 380 caractere",
    "argumentation": "Max 380 caractere",
    "otherComments": "Max 380 caractere"
  }
}`;
}

// Același apel izolat ca în restul scripturilor (scripts/lib/ai-cli.mjs): fără unelte, într-un director gol,
// fără variabilele din .env. Proiectele lungi pot cere câteva minute.
async function runSingleAi(modelKey, prompt, label) {
  const res = await runModel(modelKey, prompt, { mode: 'offline', timeoutMs: 420000, label });
  return res.status === 'ok'
    ? { model: modelKey, status: 'ok', durationMs: res.durationMs, ...res.data }
    : { model: modelKey, status: 'error', durationMs: res.durationMs, error: res.error };
}

// texts, version și outFile servesc comparațiilor (--versions): o formă anume a textului, scrisă în alt fișier.
async function analyzeBillWithCouncil(bill, force = false, { texts: given, version: wanted, outFile = path.join(ANALYSES_DIR, `${bill.slug}.json`) } = {}) {
  console.log(`\n🤖 Consiliul AI (AGY + Claude + Codex) analizează ${bill.id}${wanted ? ` (${VERSION_LABEL[wanted]})` : ''}: ${bill.officialTitle.slice(0, 80)}...`);
  let existing = null;
  if (!force && fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    } catch {
      existing = null;
    }
  }

  const texts = given ?? (await extractPdfTextsForBill(bill));
  const version = bill.chamber ? (wanted ?? latestVersion(texts)) : undefined;
  const prompt = buildCouncilPrompt(bill, texts, version);

  const [agyRes, claudeRes, codexRes] = await Promise.all([
    existing?.council?.agy?.status === 'ok' ? Promise.resolve(existing.council.agy) : runSingleAi('agy', prompt, bill.id),
    existing?.council?.claude?.status === 'ok' ? Promise.resolve(existing.council.claude) : runSingleAi('claude', prompt, bill.id),
    existing?.council?.codex?.status === 'ok' ? Promise.resolve(existing.council.codex) : runSingleAi('codex', prompt, bill.id),
  ]);

  console.log(
    `   ├─ AGY: ${agyRes.status === 'ok' ? `Scor ${agyRes.riskScore}/10 (${agyRes.riskLevel})` : agyRes.error}`
  );
  console.log(
    `   ├─ Claude: ${claudeRes.status === 'ok' ? `Scor ${claudeRes.riskScore}/10 (${claudeRes.riskLevel})` : claudeRes.error}`
  );
  console.log(
    `   └─ Codex: ${codexRes.status === 'ok' ? `Scor ${codexRes.riskScore}/10 (${codexRes.riskLevel})` : codexRes.error}`
  );

  const valid = [agyRes, claudeRes, codexRes].filter((r) => r.status === 'ok');
  if (valid.length === 0) {
    throw new Error(`Toate cele 3 modele au dat eroare pentru ${bill.id}`);
  }

  const avgScore = Math.round((valid.reduce((acc, r) => acc + (Number(r.riskScore) || 5), 0) / valid.length) * 10) / 10;
  const riskLevel = avgScore >= 6.8 ? 'red' : avgScore >= 3.8 ? 'yellow' : 'green';
  const primary = valid.find((r) => r.model === 'claude') || valid[0];

  const mergedGroups = [...new Set(valid.flatMap((r) => r.affectedGroups || []))].slice(0, 4);

  const analysis = {
    billId: bill.id,
    slug: bill.slug,
    ...(version && { version }),
    updatedAt: new Date().toISOString(),
    consensus: {
      riskScore: avgScore,
      riskLevel,
      plainTitle: primary.plainTitle,
      summaryTlDr: primary.verdictShort,
      initiatorClaim: primary.initiatorClaim,
      realityCheck: primary.realityCheck,
      affectedGroups: mergedGroups,
      senatForm: {
        articleRef: (primary.senatForm?.articleRef || 'În ansamblu').slice(0, 50),
        proposalContent: (primary.senatForm?.proposalContent || '').slice(0, 395),
        argumentation: (primary.senatForm?.argumentation || '').slice(0, 395),
        otherComments: (primary.senatForm?.otherComments || '').slice(0, 395),
      },
    },
    council: {
      agy: agyRes,
      claude: claudeRes,
      codex: codexRes,
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(analysis, null, 2), 'utf8');
  return analysis;
}

// ─── Camera Deputaților ─────────────────────────────────────────────────────────────────────────────────────────
// node scripts/straja-council.mjs --camera [slug] [--due] [--max=10]
// Fără slug, --due alege proiectele fără analiză și neurmărite de la Senat: întâi cele aflate acum la Cameră (ordinea
// de zi, apoi cele cu raport, apoi celelalte), apoi restul anului (trimise la Senat, la promulgare, legi, respinse), de la
// cele mai noi. Fiecare rulare face cel mult --max, ca analizele să se strângă treptat.
const CDEP_DIR = path.join(DATA_DIR, 'cdep');
const AT_CHAMBER = /^(la comisii|raport|pe ordinea de zi|în reexaminare|aviz|sesizare)/i;
const PRIORITY = [/^pe ordinea de zi/i, /^raport/i];

// Documentele care ne trebuie din fișa Camerei și numele sub care le păstrăm (scripts/lib/pdf-text.mjs: textName).
const CDEP_DOCS = [
  { type: 'forma_camera', match: /^Forma adoptată de Cameră/i },
  { type: 'forma_senat', match: /^Forma adoptată de Senat/i },
  { type: 'forma_initiatorului', match: /^Forma inițiatorului/i },
  { type: 'forma_ordonanta', match: /^Ordonanța( de urgență)? a Guvernului/i },
  { type: 'expunere_motive', match: /^Expunerea de motive/i },
];
// Aceleași documente pe senat.ro, după codul din numele fișierului (vezi senatPdf).
const SENAT_CODE = { forma_senat: 'FS', forma_initiatorului: 'FG', expunere_motive: 'EM' };

function chamberBill(sheet) {
  const f = sheet.fisa;
  const comisii = f.comisii ?? {};
  return {
    id: sheet.numar,
    slug: sheet.slug,
    officialTitle: sheet.titlu,
    emergencyRequested: /^da/i.test(f.urgenta ?? ''),
    initiators: f.initiatori.map((i) => ({ name: i.nume, role: 'parlamentar', party: i.partid ?? '' })),
    chamber: {
      numarSenat: f.numarSenat,
      stadiu: sheet.stadiu,
      cameraDecizionala: f.cameraDecizionala,
      raport: (comisii.raport ?? []).map((c) => c.nume),
      termenAmendamente: comisii.termenAmendamente ?? null,
      initiator: f.initiatori.length ? null : 'Guvernul',
      obiect: f.obiect,
    },
  };
}

/** Descarcă textul proiectului și expunerea de motive; întoarce false dacă fișa n-are niciun text al legii. */
async function downloadChamberPdfs(sheet) {
  const dir = path.join(PDF_DIR, sheet.slug);
  let wanted = CDEP_DOCS.map((d) => ({ ...d, doc: (sheet.fisa.documente ?? []).find((x) => d.match.test(x.eticheta)) })).filter((d) => d.doc);
  if (!wanted.some((d) => d.type.startsWith('forma'))) return false;
  // Pentru analiză ajunge forma cea mai nouă (CDEP_DOCS le are în ordinea asta); pe celelalte le descarcă --versions.
  if (ANALYSIS_ONLY) {
    const newest = wanted.find((d) => d.type.startsWith('forma_') && d.type !== 'forma_ordonanta')?.type;
    wanted = wanted.filter((d) => !d.type.startsWith('forma_') || d.type === 'forma_ordonanta' || d.type === newest);
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const { type, doc } of wanted) {
    // Formele votate au adresa „…/proiecte/docs?2026/pl001_cd001_26.pdf”: numele fișierului e în query.
    const u = new URL(doc.url);
    const file = path.join(dir, `${type}_${path.basename(u.pathname.endsWith('.pdf') ? u.pathname : u.search.slice(1)).replace(/_/g, '')}`);
    if (fs.existsSync(file)) continue;
    // Proiectele trecute pe la Senat au aceleași texte pe senat.ro: le luăm de acolo, ca să cerem puțin de la cdep.ro.
    const alt = SENAT_CODE[type] && senatPdf(sheet.fisa.numarSenat, SENAT_CODE[type]);
    const fromSenat = alt && (await fetchSenatPdf(alt).catch(() => null));
    fs.writeFileSync(file, fromSenat ?? (await fetchCdepFile(doc.url)));
  }
  return true;
}

// Mai multe loturi pot rula în paralel: fiecare proiect e „rezervat” de primul lot care îl ia (un fișier creat cu
// 'wx', atomic). O rezervare mai veche de trei ore e a unui lot oprit. Întoarce funcția care eliberează rezervarea.
function claimer(kind) {
  const claimDir = path.join(ROOT_DIR, '.cache', 'claims', kind);
  fs.mkdirSync(claimDir, { recursive: true });
  return (s) => {
    const file = path.join(claimDir, s);
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > 3 * 3600_000) fs.rmSync(file, { force: true });
    } catch {}
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      return () => fs.rmSync(file, { force: true });
    } catch {
      return null;
    }
  };
}

async function mainChamber(args) {
  const slug = args.find((a) => !a.startsWith('--'));
  const max = Number(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 10);
  const index = JSON.parse(fs.readFileSync(path.join(CDEP_DIR, 'index.json'), 'utf8')).proiecte;
  const read = (s) => {
    const file = path.join(CDEP_DIR, 'proiecte', `${s}.json`);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  };
  const rank = (p) => {
    const i = PRIORITY.findIndex((re) => re.test(p.stadiu));
    return i !== -1 ? i : AT_CHAMBER.test(p.stadiu) ? PRIORITY.length : PRIORITY.length + 1;
  };
  const targets = slug
    ? [read(slug)].filter(Boolean)
    : index
        .filter((p) => !p.senat && !fs.existsSync(path.join(ANALYSES_DIR, `${p.slug}.json`)))
        .sort((a, b) => rank(a) - rank(b) || b.inregistrat.localeCompare(a.inregistrat))
        .map((p) => read(p.slug))
        .filter((s) => s && !s.senat);

  const claim = claimer('camera');

  let done = 0;
  let failed = 0;
  let blockedSeen = 0;
  for (const sheet of targets) {
    if (done >= max) break;
    const release = slug ? () => {} : claim(sheet.slug);
    if (!release || (!slug && fs.existsSync(path.join(ANALYSES_DIR, `${sheet.slug}.json`)))) {
      release?.();
      continue;
    }
    try {
      if (!(await downloadChamberPdfs(sheet))) {
        console.log(`⏭️  ${sheet.numar}: fișa n-are încă textul proiectului`);
        release();
        continue;
      }
    } catch (err) {
      release();
      // Fără cdep.ro mergem mai departe: proiectele cu textele pe senat.ro nu au nevoie de el.
      if (err instanceof CdepBlocked) {
        if (!blockedSeen++) console.log(`⏸️  ${err.message}; trecem doar la proiectele cu textele pe senat.ro`);
        continue;
      }
      console.log(`⚠️  ${sheet.numar}: ${err.message}`);
      failed++;
      continue;
    }
    try {
      await analyzeBillWithCouncil(chamberBill(sheet), args.includes('--force'));
      done++;
    } catch (err) {
      console.log(`⚠️  ${sheet.numar}: ${err.message}`);
      failed++;
    } finally {
      release();
    }
  }
  console.log(`🏛️ Camera: ${done} proiecte analizate${failed ? `, ${failed} cu erori` : ''}`);
}

// ─── Cum se schimbă textul ──────────────────────────────────────────────────────────────────────────────────────
// node scripts/straja-council.mjs --versions [slug] [--max=10] [--recompare]
// Formele unui proiect de la Cameră, în ordinea prin care a trecut: a inițiatorului, apoi cea adoptată de prima cameră,
// apoi cea adoptată de a doua. Fiecare formă primește analiza consiliului (data/analyses/versions/<slug>/<formă>.json),
// iar două forme la rând o comparație făcută de Claude: ce s-a schimbat și dacă proiectul a devenit mai riscant.
// Rezumatul ajunge în data/analyses/versions/<slug>.json. Analiza principală a proiectului e a formei celei mai noi.
const VERSIONS_DIR = path.join(ANALYSES_DIR, 'versions');
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';

/**
 * „L619/22.12.2025” sau „L12/2026” → PDF-ul de pe senat.ro, cu numărul pe cel puțin trei cifre (26L012FG.PDF).
 * FG = forma inițiatorului, FS = forma adoptată de Senat.
 */
function senatPdf(numarSenat, code) {
  const m = numarSenat?.match(/\bL(\d+)\/(?:\d{1,2}\.\d{1,2}\.)?(\d{4})/);
  return m ? `https://www.senat.ro/legis/PDF/${m[2]}/${m[2].slice(2)}L${m[1].padStart(3, '0')}${code}.PDF` : null;
}

/** Formele pe care le putem citi, în ordinea legislativă. */
function versionPlan(sheet) {
  const docs = sheet.fisa.documente ?? [];
  const doc = (re) => docs.find((d) => re.test(d.eticheta));
  const init = doc(/^Forma inițiatorului/i);
  const senat = doc(/^Forma adoptată de Senat/i);
  const camera = doc(/^Forma adoptată de Cameră/i);
  const plan = [];
  if (senat) {
    // Venit de la Senat: forma inițiatorului e doar pe senat.ro.
    const fg = senatPdf(sheet.fisa.numarSenat, 'FG');
    if (fg) plan.push({ key: 'initiator', url: fg, source: 'senat.ro' });
    plan.push({ key: 'senat', url: senat.url, source: 'cdep.ro' });
    if (camera) plan.push({ key: 'camera', url: camera.url, source: 'cdep.ro' });
  } else {
    if (init) plan.push({ key: 'initiator', url: init.url, source: 'cdep.ro' });
    if (camera) plan.push({ key: 'camera', url: camera.url, source: 'cdep.ro' });
    // După Cameră a votat și Senatul (cameră decizională): forma lui apare pe senat.ro.
    const fs_ = camera && !/^la Senat/i.test(sheet.stadiu ?? '') ? senatPdf(sheet.fisa.numarSenat, 'FS') : null;
    if (fs_) plan.push({ key: 'senat', url: fs_, source: 'senat.ro', optional: true });
  }
  return plan;
}

async function fetchSenatPdf(url) {
  await new Promise((r) => setTimeout(r, 1500));
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, 5).toString() === '%PDF-' ? buf : null;
}

/** Descarcă formele care lipsesc; întoarce planul fără formele care nu există (încă). */
async function downloadVersions(sheet, plan) {
  const dir = path.join(PDF_DIR, sheet.slug);
  fs.mkdirSync(dir, { recursive: true });
  const kept = [];
  for (const v of plan) {
    const type = FORMS[v.key].text;
    const u = new URL(v.url);
    const name = `${type}_${path.basename(u.pathname.toLowerCase().endsWith('.pdf') ? u.pathname : u.search.slice(1)).replace(/_/g, '')}`;
    const file = path.join(dir, name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`);
    const existing = fs.readdirSync(dir).find((f) => f.startsWith(`${type}_`));
    if (!existing) {
      const buf = v.source === 'senat.ro' ? await fetchSenatPdf(v.url) : await fetchCdepFile(v.url);
      if (!buf) {
        if (!v.optional) console.log(`   ⚠️ ${VERSION_LABEL[v.key]} lipsește: ${v.url}`);
        continue;
      }
      fs.writeFileSync(file, buf);
    }
    kept.push(v);
  }
  return kept;
}

const readJsonFile = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

async function compareVersions(bill, a, b, texts, analyses) {
  const ta = texts[FORMS[a.key].text];
  const tb = texts[FORMS[b.key].text];
  const diff = unitDiff(ta, tb);
  const findings = (an) =>
    (an.council?.claude?.keyFindings ?? Object.values(an.council ?? {}).find((r) => r?.status === 'ok')?.keyFindings ?? [])
      .slice(0, 4)
      .map((f) => `- ${f}`)
      .join('\n');
  const [A, B] = [analyses[a.key], analyses[b.key]];
  // Dacă textul a fost rescris aproape în întregime, diferențele nu mai spun mare lucru: dăm ambele texte.
  const body =
    diff.same >= 0.25
      ? `DIFERENȚELE DE TEXT DE LA FORMA A LA FORMA B (bucăți scoase cu „-”, adăugate cu „+”, „…” = text neschimbat):\n${diff.text}`
      : `TEXTUL A FOST RESCRIS. FORMA A (început):\n${ta.slice(0, 9000)}\n\nFORMA B (început):\n${tb.slice(0, 9000)}`;
  const prompt = `Ești un auditor legislativ român. Compari două forme ale aceluiași proiect de lege, ${bill.id}: „${bill.officialTitle}”.

FORMA A: ${VERSION_LABEL[a.key]}. Trei modele AI i-au dat scorul de risc ${A.consensus.riskScore}/10 (${A.consensus.riskLevel}). Ce au găsit:
${findings(A)}

FORMA B: ${VERSION_LABEL[b.key]}. Scor ${B.consensus.riskScore}/10 (${B.consensus.riskLevel}). Ce au găsit:
${findings(B)}

${body}

Spune ce s-a schimbat de la forma A la forma B și dacă proiectul a devenit mai riscant sau mai puțin riscant pentru
cetățeni și firme. Nu inventa: folosește doar diferențele de mai sus. În răspuns nu scrie „A” sau „B”: numește formele
(„${VERSION_LABEL[a.key].toLowerCase()}”, „${VERSION_LABEL[b.key].toLowerCase()}”) sau spune „inițial” și „acum”. Schimbările doar de formă (tehnică legislativă,
renumerotări, diacritice, titlul legii de aprobare) nu contează; dacă sunt doar de felul ăsta, direcția e "la_fel".

Returnează EXCLUSIV un obiect JSON valid:
{
  "direction": "mai_riscant" | "mai_putin_riscant" | "la_fel",
  "summary": "1-2 fraze pe înțelesul oricui: ce s-a schimbat de la A la B și ce înseamnă (max 300 caractere)",
  "changes": [
    { "text": "o schimbare concretă, cu articolul dacă reiese din text (max 220 caractere)", "effect": "mai_bine" | "mai_rau" | "neutru" }
  ]
}
În "changes" pune 2-6 schimbări, cele mai importante întâi; o listă goală doar dacă nu s-a schimbat nimic de fond.`;
  const res = await runModel('claude', prompt, { mode: 'offline', timeoutMs: 420000, label: `${bill.id} ${a.key}→${b.key}` });
  if (res.status !== 'ok') throw new Error(`comparația ${a.key}→${b.key}: ${res.error}`);
  const d = res.data;
  const direction = ['mai_riscant', 'mai_putin_riscant', 'la_fel'].includes(d.direction) ? d.direction : 'la_fel';
  return {
    from: a.key,
    to: b.key,
    direction,
    summary: String(d.summary ?? '').slice(0, 400),
    changes: (Array.isArray(d.changes) ? d.changes : [])
      .slice(0, 6)
      .map((c) => ({ text: String(c.text ?? '').slice(0, 260), effect: ['mai_bine', 'mai_rau', 'neutru'].includes(c.effect) ? c.effect : 'neutru' }))
      .filter((c) => c.text),
    diff: { added: diff.added, removed: diff.removed, same: diff.same },
    model: 'claude',
    updatedAt: new Date().toISOString(),
  };
}

async function versionsForBill(sheet, force, recompare = false) {
  const bill = chamberBill(sheet);
  const plan = await downloadVersions(sheet, versionPlan(sheet));
  if (plan.length < 2) return false;
  const texts = await extractPdfTextsForBill(bill);
  const withText = plan.filter((v) => (texts[FORMS[v.key].text] ?? '').trim().length > 200);
  if (withText.length < 2) {
    console.log(`⏭️  ${bill.id}: mai puțin de două forme cu text`);
    return false;
  }

  const dir = path.join(VERSIONS_DIR, sheet.slug);
  fs.mkdirSync(dir, { recursive: true });
  const mainFile = path.join(ANALYSES_DIR, `${sheet.slug}.json`);
  const main = readJsonFile(mainFile);
  // Analizele vechi n-au „version”: atunci era forma adoptată de Senat, dacă exista, altfel a inițiatorului.
  const mainVersion = main?.version ?? (texts.forma_senat ? 'senat' : 'initiator');
  const analyses = {};
  for (const v of withText) {
    const file = path.join(dir, `${v.key}.json`);
    if (!force && fs.existsSync(file)) analyses[v.key] = readJsonFile(file);
    else if (!force && main && mainVersion === v.key) {
      analyses[v.key] = { ...main, version: v.key };
      fs.writeFileSync(file, JSON.stringify(analyses[v.key], null, 2));
    } else {
      analyses[v.key] = await analyzeBillWithCouncil(bill, force, { texts, version: v.key, outFile: file });
    }
  }
  // Analiza principală e a formei celei mai noi.
  const latest = withText.at(-1).key;
  if (!main || mainVersion !== latest) fs.writeFileSync(mainFile, JSON.stringify(analyses[latest], null, 2));

  const summaryFile = path.join(VERSIONS_DIR, `${sheet.slug}.json`);
  const previous = readJsonFile(summaryFile);
  const changes = [];
  for (let i = 1; i < withText.length; i++) {
    const [a, b] = [withText[i - 1], withText[i]];
    const old = previous?.changes?.find((c) => c.from === a.key && c.to === b.key);
    const stale = !old || [analyses[a.key], analyses[b.key]].some((an) => an.updatedAt > old.updatedAt);
    changes.push(force || recompare || stale ? await compareVersions(bill, a, b, texts, analyses) : old);
  }
  const scores = (an) => Object.fromEntries(['agy', 'claude', 'codex'].map((k) => [k, an.council?.[k]?.status === 'ok' ? an.council[k].riskScore : null]));
  const summary = {
    slug: sheet.slug,
    billId: bill.id,
    updatedAt: new Date().toISOString(),
    versions: withText.map((v) => ({
      key: v.key,
      label: VERSION_LABEL[v.key],
      url: v.url,
      source: v.source,
      riskScore: analyses[v.key].consensus.riskScore,
      riskLevel: analyses[v.key].consensus.riskLevel,
      plainTitle: analyses[v.key].consensus.plainTitle,
      summaryTlDr: analyses[v.key].consensus.summaryTlDr,
      scores: scores(analyses[v.key]),
    })),
    changes,
  };
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  const arrow = summary.versions.map((v) => `${v.riskScore}`).join(' → ');
  console.log(`📜 ${bill.id}: ${summary.versions.map((v) => v.key).join(' → ')} = ${arrow}; ${changes.map((c) => c.direction).join(', ')}`);
  return true;
}

async function mainVersions(args) {
  const slug = args.find((a) => !a.startsWith('--'));
  const max = Number(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 10);
  const force = args.includes('--force');
  // --recompare: doar comparațiile din nou (de exemplu după o schimbare a instrucțiunilor), fără analize noi.
  const recompare = args.includes('--recompare');
  const index = JSON.parse(fs.readFileSync(path.join(CDEP_DIR, 'index.json'), 'utf8')).proiecte;
  const read = (s) => readJsonFile(path.join(CDEP_DIR, 'proiecte', `${s}.json`));
  // Proiectele cu analiză principală și cel puțin două forme posibile; întâi cele aflate acum la Cameră.
  const targets = (slug ? [{ slug }] : index.filter((p) => !p.senat && fs.existsSync(path.join(ANALYSES_DIR, `${p.slug}.json`))))
    .map((p) => read(p.slug))
    .filter((s) => s && versionPlan(s).length >= 2)
    .filter((s) => slug || force || recompare === fs.existsSync(path.join(VERSIONS_DIR, `${s.slug}.json`)))
    .sort((a, b) => Number(!AT_CHAMBER.test(a.stadiu ?? '')) - Number(!AT_CHAMBER.test(b.stadiu ?? '')));
  const claim = claimer('versions');
  let done = 0;
  let failed = 0;
  for (const sheet of targets) {
    if (done >= max) break;
    const release = slug ? () => {} : claim(sheet.slug);
    if (!release) continue;
    try {
      if (await versionsForBill(sheet, force, recompare)) done++;
    } catch (err) {
      if (err instanceof CdepBlocked) {
        console.log(`⏸️  ${err.message}`);
        release();
        break;
      }
      console.log(`⚠️  ${sheet.numar}: ${err.message}`);
      failed++;
    } finally {
      release();
    }
  }
  console.log(`📜 Versiuni: ${done} proiecte comparate${failed ? `, ${failed} cu erori` : ''} (din ${targets.length} posibile)`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--versions')) return mainVersions(args);
  if (args.includes('--camera')) return mainChamber(args);
  const extractOnly = args.includes('--extract-texts');
  const targetSlug = args.find((a) => !a.startsWith('--'));

  if (!fs.existsSync(BILLS_FILE)) {
    throw new Error(`Nu există ${BILLS_FILE}. Rulează mai întâi npm run straja:sync`);
  }

  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));

  if (extractOnly) {
    console.log(`📄 Se extrage textul din PDF-uri pentru ${bills.length} proiecte...`);
    let count = 0;
    for (const bill of bills) {
      const t = await extractPdfTextsForBill(bill);
      if (Object.keys(t).length > 0) count++;
    }
    console.log(`✅ Text extras din PDF-uri pentru ${count}/${bills.length} proiecte.`);
    return;
  }

  const targets = targetSlug
    ? bills.filter((b) => b.slug.includes(targetSlug.toLowerCase()) || b.id.toLowerCase().includes(targetSlug.toLowerCase()))
    : bills;

  // --force reface analiza chiar dacă există, de exemplu când două modele au depășit timpul.
  for (const bill of targets) {
    await analyzeBillWithCouncil(bill, args.includes('--force'));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
