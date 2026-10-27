// Rulează cele trei modele pentru scripturile straja: Gemini prin agy, Claude prin `claude -p`, GPT prin codex.
//
// Siguranță. Paginile web și rapoartele vizitatorilor pot conține instrucțiuni injectate, așa că niciun model
// nu primește terminal sau scriere de fișiere, iar toate rulează într-un dosar gol din .cache/, cu un mediu
// minim, fără tokenuri (CLOUDFLARE_API_TOKEN și altele nu ajung la ele).
//
// - claude: `--tools` restrânge setul la WebSearch,WebFetch (web) sau la nimic (offline); `--strict-mcp-config`
//   fără `--mcp-config` înseamnă fără servere MCP. Verificat: fără shell, fără citire de fișiere.
// - codex: sandbox read-only, iar shell_tool, browserul, computer use, apps, plugins, hooks și serverele MCP sunt
//   dezactivate; `--search` (flag de nivel superior, înainte de `exec`) doar în modul web.
// - agy: în modul print, agentul implicit rulează comenzi și scrie fișiere fără să ceară voie, iar `--sandbox`
//   oprește doar terminalul, nu și write_file; `--mode plan` nu schimbă nimic. De aceea folosim agenții din
//   .agents/agents/: lastraja-web (doar search_web) și lastraja-offline (fără unelte), cu
//   excludeDefaultComponents și inheritMcp: false. Verificat: le rămân doar search_web (la web), list_resources,
//   read_resource și manage_task; fără terminal, fără fișiere. search_web dă adrese de redirecționare
//   vertexaisearch.cloud.google.com, pe care verificarea le urmează până la articol.
// Nu folosim niciodată --dangerously-skip-permissions sau flagurile „dangerously” ale codex.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// În interiorul repo-ului, ca agy să găsească agenții din .agents/agents/, dar gol și ignorat de git.
export const SANDBOX_DIR = path.join(ROOT_DIR, '.cache', 'ai-sandbox');

export const MODEL_KEYS = ['agy', 'claude', 'codex'];

// CLI-urile stau implicit în ~/.local/bin; AGY_BIN, CLAUDE_BIN și CODEX_BIN le pot muta.
const LOCAL_BIN = path.join(os.homedir(), '.local', 'bin');
export const BINS = {
  agy: process.env.AGY_BIN || path.join(LOCAL_BIN, 'agy'),
  claude: process.env.CLAUDE_BIN || path.join(LOCAL_BIN, 'claude'),
  codex: process.env.CODEX_BIN || path.join(LOCAL_BIN, 'codex'),
};

const CODEX_OFF = ['shell_tool', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'plugins', 'hooks', 'skill_mcp_dependency_install'];

function args(model, mode, codexModel) {
  const web = mode === 'web';
  if (model === 'claude') {
    return ['-p', '--model', 'claude-opus-5-5', '--tools', web ? 'WebSearch,WebFetch' : '', ...(web ? ['--allowedTools', 'WebSearch,WebFetch'] : []), '--strict-mcp-config'];
  }
  if (model === 'codex') {
    return [
      ...(web ? ['--search'] : []),
      'exec',
      ...(codexModel ? ['-m', codexModel] : []),
      '--skip-git-repo-check',
      '-s',
      'read-only',
      ...CODEX_OFF.flatMap((f) => ['--disable', f]),
      '-c',
      'mcp_servers={}',
      '--color',
      'never',
      '-',
    ];
  }
  return ['--disable-slash-commands', '--agent', web ? 'lastraja-web' : 'lastraja-offline', '--model', 'gemini-4-argon-high'];
}

// Doar ce le trebuie CLI-urilor ca să găsească autentificarea din HOME; nimic din .env.
function minimalEnv() {
  const keep = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR', 'CODEX_HOME'];
  const env = { PATH: `${LOCAL_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  env.LANG ??= 'en_US.UTF-8';
  return env;
}

function run(cmd, argv, stdin, timeoutMs) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { cwd: SANDBOX_DIR, env: minimalEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`timeout după ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.trim()) reject(new Error(`cod ${code}: ${(stderr || stdout).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`));
      else resolve({ stdout, stderr, code });
    });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

export function extractJsonFromText(raw = '') {
  const candidates = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const c of candidates) {
    const a = c.indexOf('{');
    const b = c.lastIndexOf('}');
    if (a === -1 || b <= a) continue;
    try {
      return JSON.parse(c.slice(a, b + 1));
    } catch {
      // încearcă următorul bloc
    }
  }
  throw new Error('răspunsul nu conține JSON valid');
}

/**
 * Rulează un model și întoarce JSON-ul din răspuns.
 * @returns {Promise<{ model: string, status: 'ok', data: any, durationMs: number } | { model: string, status: 'error', error: string, durationMs: number }>}
 */
export async function runModel(model, prompt, { mode = 'offline', timeoutMs = 300000, codexModel } = {}) {
  const start = Date.now();
  try {
    const argv = args(model, mode, codexModel);
    // agy primește promptul ca argument; ceilalți îl citesc din stdin.
    const res = model === 'agy' ? await run(BINS.agy, [...argv, '--print-timeout', `${Math.round(timeoutMs / 1000)}s`, '-p', prompt], null, timeoutMs + 15000) : await run(BINS[model], argv, prompt, timeoutMs);
    const quota = /usage limit|rate limit|quota/i.test(res.stdout + res.stderr) && !/\{[\s\S]*\}/.test(res.stdout.split('\n').slice(-40).join('\n'));
    if (quota) throw new Error((res.stdout + res.stderr).match(/[^\n]*(usage limit|rate limit|quota)[^\n]*/i)?.[0]?.trim().slice(0, 200) ?? 'limită de utilizare');
    if (!res.stdout.trim()) throw new Error(`răspuns gol după ${Math.round((Date.now() - start) / 1000)}s (probabil timp depășit)`);
    let data;
    try {
      data = extractJsonFromText(res.stdout);
    } catch (err) {
      const snippet = res.stdout.replace(/\s+/g, ' ').trim();
      throw new Error(`${err.message}: „${snippet.slice(0, 120)}${snippet.length > 240 ? ` … ${snippet.slice(-120)}` : snippet.slice(120)}”`);
    }
    return { model, status: 'ok', data, durationMs: Date.now() - start };
  } catch (err) {
    return { model, status: 'error', error: String(err.message || err), durationMs: Date.now() - start };
  }
}
