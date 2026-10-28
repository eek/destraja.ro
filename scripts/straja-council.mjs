#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeBillTexts } from './lib/pdf-text.mjs';
import { runModel } from './lib/ai-cli.mjs';
import { CdepBlocked, fetchCdepFile } from './lib/cdep.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');

fs.mkdirSync(TEXT_DIR, { recursive: true });
fs.mkdirSync(ANALYSES_DIR, { recursive: true });

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
  });
}

function buildCouncilPrompt(bill, texts) {
  // La Cameră, textul dezbătut e forma adoptată de Senat, dacă Senatul a votat deja; altfel forma inițiatorului. La legile de
  // aprobare a unei ordonanțe, legea are un articol, iar conținutul e în ordonanță: le dăm pe amândouă.
  const main = texts.forma_senat || texts.forma_initiatorului || '';
  const oug = texts.forma_ordonanta || '';
  const fgSnippet = (oug ? `${main.slice(0, 5000)}\n\n[TEXTUL ORDONANȚEI]\n${oug}` : main).slice(0, 14000);
  const emSnippet = (texts.expunere_motive || '').slice(0, 10000);
  const initiatorsStr = (bill.initiators || [])
    .map((i) => `${i.name} (${i.role} ${i.party})`)
    .join(', ');

  const cam = bill.chamber;
  const intro = cam
    ? `Analizează următorul proiect de lege aflat în dezbatere la Camera Deputaților`
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
  const textLabel = cam
    ? texts.forma_senat
      ? 'TEXT EXTRAS DIN FORMA ADOPTATĂ DE SENAT (textul pe care îl dezbate Camera)'
      : 'TEXT EXTRAS DIN FORMA INIȚIATORULUI (dacă e disponibil, altfel bazează-te pe titlu și context)'
    : 'TEXT EXTRAS DIN FORMA INIȚIATORULUI (dacă e disponibil, altfel bazează-te pe titlu și context)';
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

async function analyzeBillWithCouncil(bill, force = false) {
  console.log(`\n🤖 Consiliul AI (AGY + Claude + Codex) analizează ${bill.id}: ${bill.officialTitle.slice(0, 80)}...`);
  const outFile = path.join(ANALYSES_DIR, `${bill.slug}.json`);
  let existing = null;
  if (!force && fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    } catch {
      existing = null;
    }
  }

  const texts = await extractPdfTextsForBill(bill);
  const prompt = buildCouncilPrompt(bill, texts);

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
// Fără slug, --due alege proiectele aflate acum la Cameră, fără analiză și neurmărite de la Senat: întâi cele pe ordinea
// de zi, apoi cele cu raport, apoi cele mai noi. Fiecare rulare face cel mult --max, ca analizele să se strângă treptat.
const CDEP_DIR = path.join(DATA_DIR, 'cdep');
const AT_CHAMBER = /^(la comisii|raport|pe ordinea de zi|în reexaminare|aviz|sesizare)/i;
const PRIORITY = [/^pe ordinea de zi/i, /^raport/i];

// Documentele care ne trebuie din fișa Camerei și numele sub care le păstrăm (scripts/lib/pdf-text.mjs: textName).
const CDEP_DOCS = [
  { type: 'forma_senat', match: /^Forma adoptată de Senat/i },
  { type: 'forma_initiatorului', match: /^Forma inițiatorului/i },
  { type: 'forma_ordonanta', match: /^Ordonanța( de urgență)? a Guvernului/i },
  { type: 'expunere_motive', match: /^Expunerea de motive/i },
];

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
  const wanted = CDEP_DOCS.map((d) => ({ ...d, doc: (sheet.fisa.documente ?? []).find((x) => d.match.test(x.eticheta)) })).filter((d) => d.doc);
  if (!wanted.some((d) => d.type.startsWith('forma'))) return false;
  fs.mkdirSync(dir, { recursive: true });
  for (const { type, doc } of wanted) {
    const file = path.join(dir, `${type}_${path.basename(new URL(doc.url).pathname).replace(/_/g, '')}`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, await fetchCdepFile(doc.url));
  }
  return true;
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
    return i === -1 ? PRIORITY.length : i;
  };
  const targets = slug
    ? [read(slug)].filter(Boolean)
    : index
        .filter((p) => !p.senat && AT_CHAMBER.test(p.stadiu) && !fs.existsSync(path.join(ANALYSES_DIR, `${p.slug}.json`)))
        .sort((a, b) => rank(a) - rank(b) || b.inregistrat.localeCompare(a.inregistrat))
        .map((p) => read(p.slug))
        .filter((s) => s && !s.senat);

  let done = 0;
  let failed = 0;
  for (const sheet of targets) {
    if (done >= max) break;
    try {
      if (!(await downloadChamberPdfs(sheet))) {
        console.log(`⏭️  ${sheet.numar}: fișa n-are încă textul proiectului`);
        continue;
      }
    } catch (err) {
      if (err instanceof CdepBlocked) {
        console.log(`⏸️  ${err.message}`);
        break;
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
    }
  }
  console.log(`🏛️ Camera: ${done} proiecte analizate${failed ? `, ${failed} cu erori` : ''}`);
}

async function main() {
  const args = process.argv.slice(2);
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
