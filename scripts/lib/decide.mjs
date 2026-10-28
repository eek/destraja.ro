// Modelele de decizie rulate local (scripts/local-models): Clef și d1-3B. Primesc un lot de cereri System One și
// întorc răspunsurile după id. Rulează în mediul lor Python, cu `python -I`, fără variabilele din .env și fără rețea.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'local-models');
const WORK = path.resolve(DIR, '..', '..', '.cache', 'decide');

export const DECISION_MODELS = [
  { key: 'clef', name: 'Clef', maker: 'Cloudflare', venv: '.venv-mlx' },
  { key: 'd1', name: 'd1-3B', maker: 'Liquid AI', venv: '.venv-torch' },
];

const python = (venv) => path.join(DIR, venv, 'bin', 'python');
export const available = (model) => fs.existsSync(python(model.venv));

function env() {
  const e = { PATH: '/usr/bin:/bin', HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' };
  for (const k of ['HOME', 'USER', 'LANG', 'TMPDIR', 'HF_HOME']) if (process.env[k]) e[k] = process.env[k];
  return e;
}

function run(venv, args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(python(venv), ['-I', ...args], { cwd: DIR, env: env(), stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${args[0]} a ieșit cu codul ${code}`))));
    if (stdin) {
      child.stdin.end(stdin);
    }
  });
}

/**
 * @param {{ key: string, venv: string }} model
 * @param {{ id: string, state: unknown, questions: object }[]} requests
 * @param {string} label numele lotului, pentru fișierele din .cache/decide
 * @returns {Promise<Map<string, any>>} răspunsurile după id; cererile cu eroare lipsesc
 */
export async function decide(model, requests, label, { onProgress } = {}) {
  fs.mkdirSync(WORK, { recursive: true });
  const input = path.join(WORK, `${label}-${model.key}-in.jsonl`);
  const output = path.join(WORK, `${label}-${model.key}-out.jsonl`);
  fs.writeFileSync(input, requests.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.rmSync(output, { force: true });
  // decide.py scrie câte o linie pe răspuns; le citim și pe parcurs, ca apelantul să poată salva ce e gata.
  const read = () => {
    const answers = new Map();
    let text = '';
    try {
      text = fs.readFileSync(output, 'utf8');
    } catch {
      return answers;
    }
    for (const line of text.split('\n')) {
      try {
        const row = JSON.parse(line);
        if (row.answers) answers.set(String(row.id), row.answers);
      } catch {
        // ultima linie poate fi pe jumătate scrisă; o luăm data viitoare
      }
    }
    return answers;
  };
  let seen = 0;
  const tick = onProgress
    ? setInterval(() => {
        const answers = read();
        if (answers.size > seen) {
          seen = answers.size;
          onProgress(answers);
        }
      }, 10_000)
    : null;
  try {
    await run(model.venv, ['decide.py', model.key, input, output]);
  } finally {
    clearInterval(tick);
  }
  return read();
}

/** Textul articolelor cu trafilatura (extract.py); pagini HTML după id → text după id. Fără mediu, o hartă goală. */
export async function extractArticles(pages) {
  const venv = DECISION_MODELS[0].venv;
  if (!fs.existsSync(python(venv)) || !pages.length) return new Map();
  const out = await run(venv, ['extract.py'], pages.map(([id, html]) => JSON.stringify({ id, html })).join('\n') + '\n');
  return new Map(
    out
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .map((r) => [r.id, r.text]),
  );
}
