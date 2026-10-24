#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PDF_DIR = path.join(DATA_DIR, 'pdfs');
const TEXT_DIR = path.join(DATA_DIR, 'texts');
const ANALYSES_DIR = path.join(DATA_DIR, 'analyses');
const BILLS_FILE = path.join(DATA_DIR, 'senat-bills.json');

fs.mkdirSync(TEXT_DIR, { recursive: true });
fs.mkdirSync(ANALYSES_DIR, { recursive: true });

const AI_BINS = {
  agy: process.env.AGY_BIN || '/Users/eek/.local/bin/agy',
  claude: process.env.CLAUDE_BIN || '/Users/eek/.local/bin/claude',
  codex: process.env.CODEX_BIN || '/Users/eek/.local/bin/codex',
};

async function extractPdfTextsForBill(bill) {
  let pdfParse = null;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = mod.default || mod;
  } catch {
    return {};
  }

  const billPdfDir = path.join(PDF_DIR, bill.slug);
  const billTextDir = path.join(TEXT_DIR, bill.slug);
  fs.mkdirSync(billTextDir, { recursive: true });

  const texts = {};
  if (!fs.existsSync(billPdfDir)) return texts;

  for (const file of fs.readdirSync(billPdfDir)) {
    if (!file.toLowerCase().endsWith('.pdf')) continue;
    let type = file.split('_')[0];
    if (file.startsWith('forma_initiatorului')) type = 'forma_initiatorului';
    else if (file.startsWith('expunere_motive')) type = 'expunere_motive';
    else if (file.startsWith('adresa_inaintare')) type = 'adresa_inaintare';
    const pdfPath = path.join(billPdfDir, file);
    const txtPath = path.join(billTextDir, `${type}.txt`);

    if (fs.existsSync(txtPath)) {
      texts[type] = fs.readFileSync(txtPath, 'utf8');
      continue;
    }

    try {
      const buf = fs.readFileSync(pdfPath);
      const parsed = await pdfParse(buf);
      if (parsed?.text && parsed.text.trim().length > 20) {
        const cleaned = parsed.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        fs.writeFileSync(txtPath, cleaned, 'utf8');
        texts[type] = cleaned;
      }
    } catch (err) {
      // ignore corrupted/scanned PDFs
    }
  }
  return texts;
}

function runCommand(cmd, args, inputStdin = null, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timeout after ${timeoutMs}ms running ${cmd}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 400)}`));
      } else {
        resolve({ stdout, stderr, code });
      }
    });

    if (inputStdin) {
      child.stdin.write(inputStdin);
    }
    child.stdin.end();
  });
}

function extractJsonFromText(raw = '') {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  throw new Error('Nu am putut extrage JSON valid din răspunsul AI');
}

function buildCouncilPrompt(bill, texts) {
  const fgSnippet = (texts.forma_initiatorului || '').slice(0, 14000);
  const emSnippet = (texts.expunere_motive || '').slice(0, 10000);
  const initiatorsStr = (bill.initiators || [])
    .map((i) => `${i.name} (${i.role} ${i.party})`)
    .join(', ');

  return `Ești un auditor legislativ și constituționalist român de elită. Analizează următoarea propunere legislativă aflată în consultare publică la Senatul României și returnează EXCLUSIV un obiect JSON valid (fără alte comentarii în afara JSON-ului).

DATE OFICIALE SENAT:
- Indicativ: ${bill.id}
- Titlu oficial: ${bill.officialTitle}
- Termen consultare publică: ${bill.consultationDeadline}
- Procedură de urgență solicitată: ${bill.emergencyRequested ? 'DA' : 'NU'}
- Inițiatori: ${initiatorsStr || 'Vezi documentele PDF'}

TEXT EXTRAS DIN FORMA INIȚIATORULUI (dacă e disponibil, altfel bazează-te pe titlu și context):
${fgSnippet || '[PDF scanat ca imagine sau indisponibil text]'}

TEXT EXTRAS DIN EXPUNEREA DE MOTIVE:
${emSnippet || '[PDF scanat ca imagine sau indisponibil text]'}

REGULI DE RIGOARE:
1. Nu exagera și nu inventa articole care nu există. Separă clar pretextul din Expunerea de Motive de efectul mecanic real al articolelor.
2. Verifică: (a) Claritatea/previzibilitatea legii (Art. 1 alin. 5 / Art. 23 alin. 12 Constituție), (b) Impactul asupra concurenței și Directiva (UE) 2018/958 privind testul de proporționalitate, (c) Directiva (UE) 2015/1535 (TRIS) dacă reglementează servicii digitale/AI, (d) Impactul bugetar sau birocratic asupra cetățenilor/IMM-urilor.
3. Dacă legea este benignă, tehnică sau pozitivă, dă-i scor mic de risc (1-3, "green") și explică onest de ce e utilă sau neutră. Dacă are capcane, monopoluri, taxe sau sancțiuni disproporționate, dă-i scor 4-6 ("yellow") sau 7-10 ("red").
4. Pentru formularul Senatului, respectă STRICT limitele de caractere:
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

async function runSingleAi(modelKey, prompt) {
  const start = Date.now();
  try {
    let res;
    if (modelKey === 'agy') {
      res = await runCommand(AI_BINS.agy, ['--disable-slash-commands', '--model', 'gemini-4-argon-high', '-p', prompt], null, 150000);
    } else if (modelKey === 'claude') {
      res = await runCommand(AI_BINS.claude, ['-p', '--tools', ''], prompt, 150000);
    } else if (modelKey === 'codex') {
      res = await runCommand(
        AI_BINS.codex,
        ['exec', '--skip-git-repo-check', '-s', 'read-only', '-'],
        prompt,
        150000
      );
    }
    const parsed = extractJsonFromText(res.stdout);
    return {
      model: modelKey,
      status: 'ok',
      durationMs: Date.now() - start,
      ...parsed,
    };
  } catch (err) {
    return {
      model: modelKey,
      status: 'error',
      durationMs: Date.now() - start,
      error: err.message,
    };
  }
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
    existing?.council?.agy?.status === 'ok' ? Promise.resolve(existing.council.agy) : runSingleAi('agy', prompt),
    existing?.council?.claude?.status === 'ok' ? Promise.resolve(existing.council.claude) : runSingleAi('claude', prompt),
    existing?.council?.codex?.status === 'ok' ? Promise.resolve(existing.council.codex) : runSingleAi('codex', prompt),
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

async function main() {
  const args = process.argv.slice(2);
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

  for (const bill of targets) {
    await analyzeBillWithCouncil(bill);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
