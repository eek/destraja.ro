#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const BILLS_FILE = path.join(ROOT_DIR, 'data', 'senat-bills.json');
const ANALYSES_DIR = path.join(ROOT_DIR, 'data', 'analyses');
const TEXT_DIR = path.join(ROOT_DIR, 'data', 'texts');

const AGY_BIN = '/Users/eek/.local/bin/agy';
const MODEL_ID = 'gemini-4-argon-high';

function runAgyArgon4(prompt, timeoutMs = 150000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      AGY_BIN,
      ['--disable-slash-commands', '--model', MODEL_ID, '--effort', 'high', '-p', prompt],
      {
        cwd: '/tmp',
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timeout after ${timeoutMs}ms (stdout len=${stdout.length})`));
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
        reject(new Error(`agy exited with ${code}: ${stderr.slice(0, 400)}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function extractJson(raw = '') {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
  throw new Error(`Could not parse JSON from output (len=${raw.length}): ${raw.slice(0, 250)}`);
}

function getBillTextSnippet(slug) {
  const dir = path.join(TEXT_DIR, slug);
  let fg = '';
  let em = '';
  try {
    if (fs.existsSync(path.join(dir, 'forma_initiatorului.txt'))) {
      fg = fs.readFileSync(path.join(dir, 'forma_initiatorului.txt'), 'utf8').slice(0, 700);
    }
    if (fs.existsSync(path.join(dir, 'expunere_motive.txt'))) {
      em = fs.readFileSync(path.join(dir, 'expunere_motive.txt'), 'utf8').slice(0, 500);
    }
  } catch {
    // ignore
  }
  return { fg, em };
}

function buildBatchPrompt(batchBills) {
  const itemsText = batchBills
    .map((b) => {
      const { fg, em } = getBillTextSnippet(b.slug);
      return `[${b.slug}] ${b.id}: ${b.officialTitle} | Partide: ${b.parties.join(', ')} (${b.initiators.length} init) | Urgenta: ${b.emergencyRequested ? 'DA' : 'NU'} | Text: ${(fg + ' ' + em).replace(/\s+/g, ' ').slice(0, 800)}`;
    })
    .join('\n');

  return `REGULĂ CRITICĂ: NU apela niciun tool (fără read_file, fără run_command, fără list_dir). Răspunde DIRECT, într-un singur pas, EXCLUSIV cu obiectul JSON valid.

Ești Gemini 4 Argon (High), auditor juridic și constituționalist pentru lastraja.ro.
Pentru fiecare dintre cele ${batchBills.length} proiecte de mai jos, returnează în JSON cheia "<slug>" cu:
{
  "<slug>": {
    "riskScore": număr 1.0-10.0,
    "riskLevel": "red" | "yellow" | "green",
    "citizenOneLiner": "1 propoziție în română simplă, fără jargon, despre ce schimbă legea pentru cetățean",
    "verdictShort": "1-2 fraze incisive cu verdictul Gemini 4 Argon",
    "keyFindings": ["Constatare tehnică 1", "Constatare tehnică 2"],
    "blindSpotsCaught": "Capcană procedurală, bugetară sau tehnică sesizată",
    "constitutionalityNote": "Evaluare pe Constituția României",
    "euLawNote": "Evaluare pe Dreptul UE"
  }
}

LISTA PROIECTE:
${itemsText}`;
}

async function main() {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));
  console.log(`🚀 Pornire audit complet cu Gemini 4 Argon (${MODEL_ID}) pentru toate cele ${bills.length} proiecte...`);

  const batchSize = 10;
  const batches = [];
  for (let i = 0; i < bills.length; i += batchSize) {
    batches.push(bills.slice(i, i + batchSize));
  }

  const resultsBySlug = {};

  // Run sequentially or 2 at a time for clean language-server execution
  for (let i = 0; i < batches.length; i += 2) {
    const pair = batches.slice(i, i + 2);
    await Promise.all(
      pair.map(async (batch, offset) => {
        const idx = i + offset;
        const ids = batch.map((b) => b.id).join(', ');
        console.log(`   ⚡ Lotul ${idx + 1}/${batches.length} trimis către ${MODEL_ID}: [${ids}]...`);
        try {
          const raw = await runAgyArgon4(buildBatchPrompt(batch), 150000);
          const parsed = extractJson(raw);
          Object.assign(resultsBySlug, parsed);
          console.log(`   ✅ Lotul ${idx + 1}/${batches.length} finalizat de Gemini 4 Argon (${Object.keys(parsed).length} proiecte).`);
        } catch (err) {
          console.warn(`   ⚠️ Eroare la lotul ${idx + 1}: ${err.message}`);
        }
      })
    );
  }

  let updatedCount = 0;
  for (const bill of bills) {
    const file = path.join(ANALYSES_DIR, `${bill.slug}.json`);
    if (!fs.existsSync(file)) continue;
    const analysis = JSON.parse(fs.readFileSync(file, 'utf8'));
    const argon = resultsBySlug[bill.slug];

    analysis.council.agy.modelName = 'Gemini 4 Argon (High)';
    analysis.council.agy.cliCommand = 'agy --model gemini-4-argon-high -p';
    analysis.council.claude.modelName = 'Claude Opus 5.5';
    analysis.council.claude.cliCommand = 'claude -p --model opus';
    analysis.council.codex.modelName = 'ChatGPT · GPT-6.1';
    analysis.council.codex.cliCommand = 'codex exec';

    if (argon) {
      if (typeof argon.riskScore === 'number') {
        analysis.council.agy.riskScore = Math.round(argon.riskScore * 10) / 10;
      }
      if (argon.riskLevel) {
        analysis.council.agy.riskLevel = argon.riskLevel;
      }
      if (argon.verdictShort) {
        analysis.council.agy.verdictShort = argon.verdictShort;
      }
      if (Array.isArray(argon.keyFindings) && argon.keyFindings.length > 0) {
        analysis.council.agy.keyFindings = argon.keyFindings;
      }
      if (argon.blindSpotsCaught) {
        analysis.council.agy.blindSpotsCaught = argon.blindSpotsCaught;
      }
      if (argon.constitutionalityNote) {
        analysis.council.agy.constitutionalityNote = argon.constitutionalityNote;
      }
      if (argon.euLawNote) {
        analysis.council.agy.euLawNote = argon.euLawNote;
      }
      if (argon.citizenOneLiner && bill.slug !== 'b563-2026') {
        analysis.consensus.citizenOneLiner = argon.citizenOneLiner;
      }
      updatedCount++;
    }

    analysis.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(analysis, null, 2), 'utf8');
  }

  console.log(`\n🎉 Auditul cu Gemini 4 Argon (${MODEL_ID}) a actualizat ${updatedCount}/${bills.length} fișiere în ${ANALYSES_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
