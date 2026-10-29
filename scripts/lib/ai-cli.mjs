// Rulează cele trei modele pentru scripturile straja: Gemini prin agy, Claude prin `claude -p`, GPT prin codex.
//
// Siguranță. Paginile web și rapoartele vizitatorilor pot conține instrucțiuni injectate, așa că niciun model
// nu primește terminal sau scriere de fișiere, iar toate rulează într-un dosar gol din .cache/, cu un mediu
// minim, fără tokenuri (CLOUDFLARE_API_TOKEN și altele nu ajung la ele).
//
// - claude: `--tools` restrânge setul la WebSearch,WebFetch (web) sau la nimic (offline); `--strict-mcp-config`
//   fără `--mcp-config` înseamnă fără servere MCP. Verificat: fără shell, fără citire de fișiere.
// - codex: sandbox read-only, iar shell_tool, browserul, computer use, apps, plugins și hooks sunt dezactivate;
//   `--search` (flag de nivel superior, înainte de `exec`) doar în modul web. `-c mcp_servers={}` NU oprește serverele
//   din ~/.codex/config.toml (pe 29 octombrie 2026 fiecare apel pornea MCP-ul nugbit și node_repl), așa că codex
//   rulează cu un CODEX_HOME al nostru (.cache/codex-home): un config.toml fără servere MCP, plugin-uri, memorii sau
//   AGENTS.md, plus autentificarea, legată simbolic de cea din ~/.codex.
// - agy: în modul print, agentul implicit rulează comenzi și scrie fișiere fără să ceară voie, iar `--sandbox`
//   oprește doar terminalul, nu și write_file; `--mode plan` nu schimbă nimic. De aceea folosim agenții din
//   .agents/agents/: lastraja-web (doar search_web) și lastraja-offline (fără unelte), cu
//   excludeDefaultComponents și inheritMcp: false. Verificat: le rămân doar search_web (la web), list_resources,
//   read_resource și manage_task; fără terminal, fără fișiere. search_web dă adrese de redirecționare
//   vertexaisearch.cloud.google.com, pe care verificarea le urmează până la articol.
// Git: dosarul gol e în repo, iar un CLI care rula git de acolo cerea cheia SSH din 1Password. GIT_CEILING_DIRECTORIES
// oprește căutarea repo-ului la .cache/, iar GIT_SSH_COMMAND nu lasă ssh să folosească agentul de chei.
// Nu folosim niciodată --dangerously-skip-permissions sau flagurile „dangerously” ale codex.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// În interiorul repo-ului, ca agy să găsească agenții din .agents/agents/, dar gol și ignorat de git.
export const SANDBOX_DIR = path.join(ROOT_DIR, '.cache', 'ai-sandbox');
const CODEX_HOME = path.join(ROOT_DIR, '.cache', 'codex-home');
const CODEX_CONFIG = `# Codex pentru analizele destrajă (scripts/lib/ai-cli.mjs): fără servere MCP, plugin-uri sau memorii.
model = "gpt-6.1-sol"
model_reasoning_effort = "high"

# Doar text: fără terminal, execuție de cod, sub-agenți, obiective, imagini, aplicații sau browser.
[features]
shell_tool = false
unified_exec = false
code_mode_host = false
multi_agent = false
goals = false
sleep_tool = false
image_generation = false
view_image = false
apps = false
plugins = false
hooks = false
browser_use = false
browser_use_external = false
computer_use = false
in_app_browser = false
skill_search = false
tool_suggest = false
skill_mcp_dependency_install = false
`;

export const MODEL_KEYS = ['agy', 'claude', 'codex'];

// CLI-urile stau implicit în ~/.local/bin; AGY_BIN, CLAUDE_BIN și CODEX_BIN le pot muta.
const LOCAL_BIN = path.join(os.homedir(), '.local', 'bin');
export const BINS = {
  agy: process.env.AGY_BIN || path.join(LOCAL_BIN, 'agy'),
  claude: process.env.CLAUDE_BIN || path.join(LOCAL_BIN, 'claude'),
  codex: process.env.CODEX_BIN || path.join(LOCAL_BIN, 'codex'),
};

// Jurnalul live: fiecare apel își scrie aici, pe parcurs, ce gândește și ce răspunde modelul, ca să se poată urmări cu
// `npm run ai:watch`. Fișierele mai vechi de trei zile se șterg singure.
export const LIVE_DIR = path.join(ROOT_DIR, '.cache', 'ai-live');
const LIVE_KEEP_MS = 3 * 86_400_000;

// Toate trei CLI-urile pot transmite evenimente pe parcurs (un JSON pe rând). Din fiecare eveniment păstrăm textul
// pentru jurnal (`live`), bucățile de răspuns (`delta`) și răspunsul final (`final`), din care scoatem JSON-ul.
const STREAM = {
  agy(ev) {
    const u = ev.step_update;
    if (u) {
      if (u.text_delta) return { live: u.text_delta, delta: u.text_delta };
      if (u.state === 'ACTIVE' && u.step_type && u.step_type !== 'agent_response') return { live: `\n[${u.step_type}]\n` };
      return {};
    }
    if (ev.event === 'result') {
      const r = ev.result ?? {};
      return { final: r.response ?? '', live: r.status && r.status !== 'SUCCESS' ? `\n[${r.status}] ${r.error ?? ''}\n` : '' };
    }
    return {};
  },
  claude(ev) {
    if (ev.type === 'stream_event') {
      const e = ev.event ?? {};
      if (e.type === 'content_block_start') return { live: e.content_block?.type === 'thinking' ? '\n[gândește]\n' : e.content_block?.type === 'text' ? '\n[răspunde]\n' : '' };
      if (e.type === 'content_block_delta') {
        if (e.delta?.type === 'text_delta') return { live: e.delta.text, delta: e.delta.text };
        if (e.delta?.type === 'thinking_delta') return { live: e.delta.thinking };
      }
      return {};
    }
    if (ev.type === 'result') return { final: ev.result ?? '', live: ev.is_error ? `\n[eroare] ${ev.result ?? ''}\n` : '' };
    return {};
  },
  codex(ev) {
    const item = ev.item;
    if (ev.type === 'item.completed' && item?.type === 'agent_message') return { final: item.text, live: `\n[răspunde]\n${item.text}\n` };
    if (ev.type === 'item.completed' && item?.type === 'reasoning') return { live: `\n[gândește]\n${item.text ?? ''}\n` };
    if (ev.type === 'turn.failed' || ev.type === 'error') return { live: `\n[eroare] ${ev.error?.message ?? ev.message ?? ''}\n` };
    return {};
  },
};

function liveFile(model, label) {
  fs.mkdirSync(LIVE_DIR, { recursive: true });
  for (const f of fs.readdirSync(LIVE_DIR)) {
    const full = path.join(LIVE_DIR, f);
    if (Date.now() - fs.statSync(full).mtimeMs > LIVE_KEEP_MS) fs.rmSync(full, { force: true });
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const safe = (label || path.basename(process.argv[1] ?? 'model', '.mjs')).replace(/[^\w.-]+/g, '-').slice(0, 40);
  return path.join(LIVE_DIR, `${stamp}-${model}-${safe}-${process.pid}.log`);
}

const CODEX_OFF = ['shell_tool', 'unified_exec', 'code_mode_host', 'multi_agent', 'goals', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'plugins', 'hooks', 'skill_mcp_dependency_install'];

function args(model, mode, codexModel) {
  const web = mode === 'web';
  if (model === 'claude') {
    return [
      '-p',
      '--model',
      'claude-opus-5-5',
      '--tools',
      web ? 'WebSearch,WebFetch' : '',
      ...(web ? ['--allowedTools', 'WebSearch,WebFetch'] : []),
      '--strict-mcp-config',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];
  }
  if (model === 'codex') {
    return [
      ...(web ? ['--search'] : []),
      'exec',
      '--json',
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
  return ['--disable-slash-commands', '--agent', web ? 'lastraja-web' : 'lastraja-offline', '--model', 'gemini-4-argon-high', '--output-format', 'stream-json'];
}

// Doar ce le trebuie CLI-urilor ca să găsească autentificarea din HOME; nimic din .env.
/** CODEX_HOME-ul nostru: config.toml minim și autentificarea utilizatorului (legătură simbolică, nu copie). */
function codexHome() {
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  const config = path.join(CODEX_HOME, 'config.toml');
  if (!fs.existsSync(config) || fs.readFileSync(config, 'utf8') !== CODEX_CONFIG) fs.writeFileSync(config, CODEX_CONFIG);
  const auth = path.join(CODEX_HOME, 'auth.json');
  const source = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'auth.json');
  if (!fs.existsSync(auth) && fs.existsSync(source)) fs.symlinkSync(source, auth);
  return CODEX_HOME;
}

function minimalEnv(cmd) {
  const keep = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR'];
  const env = { PATH: `${LOCAL_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin` };
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  env.LANG ??= 'en_US.UTF-8';
  env.GIT_CEILING_DIRECTORIES = path.join(ROOT_DIR, '.cache');
  env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o IdentityAgent=none';
  if (cmd === BINS.codex) env.CODEX_HOME = codexHome();
  return env;
}

function run(cmd, argv, stdin, timeoutMs, { parse, live } = {}) {
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
  const out = live ? fs.createWriteStream(live, { flags: 'a' }) : null;
  let pending = '';
  let text = '';
  let final = null;
  const onLine = (line) => {
    if (!line.trim()) return;
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      out?.write(`${line}\n`);
      return;
    }
    const r = parse(ev);
    if (r.live) out?.write(r.live);
    if (r.delta) text += r.delta;
    if (r.final != null) final = r.final;
  };
  return new Promise((resolve, reject) => {
    // Grup de procese propriu: la expirare oprim și procesele pornite de CLI, nu doar CLI-ul.
    const child = spawn(cmd, argv, { cwd: SANDBOX_DIR, env: minimalEnv(cmd), stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // grupul s-a oprit deja
      }
    };
    let stdout = '';
    let stderr = '';
    // agy ignoră SIGTERM și rămânea viu ore întregi după expirare, ocupând Argon: după 5 secunde îl oprim forțat.
    const timer = setTimeout(() => {
      killGroup('SIGTERM');
      setTimeout(() => killGroup('SIGKILL'), 5000).unref();
      reject(new Error(`timeout după ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (c) => {
      stdout += c;
      if (!parse) return;
      pending += c;
      const lines = pending.split('\n');
      pending = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (c) => {
      stderr += c;
      out?.write(c);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (parse && pending) onLine(pending);
      out?.end();
      // Cu evenimente în flux, `text` e răspunsul final al modelului (sau bucățile lui, dacă lipsește evenimentul final).
      const answer = parse ? (final ?? text) : stdout;
      if (code !== 0 && !answer.trim()) reject(new Error(`cod ${code}: ${(stderr || stdout).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`));
      else resolve({ stdout: answer, raw: stdout, stderr, code });
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
export async function runModel(model, prompt, { mode = 'offline', timeoutMs = 300000, codexModel, label } = {}) {
  const start = Date.now();
  const live = liveFile(model, label);
  fs.writeFileSync(live, `# ${model} · ${label ?? path.basename(process.argv[1] ?? '', '.mjs')} · ${new Date(start).toLocaleTimeString('ro-RO')} · limită ${Math.round(timeoutMs / 1000)}s · prompt ${prompt.length} caractere\n`);
  const finish = (status) => fs.appendFileSync(live, `\n# gata: ${status} în ${Math.round((Date.now() - start) / 1000)}s\n`);
  try {
    const argv = args(model, mode, codexModel);
    const stream = { parse: STREAM[model], live };
    // agy primește promptul ca argument; ceilalți îl citesc din stdin. Jurnalul intern al lui agy (cererile HTTP) arată,
    // când un apel durează, dacă modelul încă lucrează sau dacă agy reîncearcă.
    const res =
      model === 'agy'
        ? await run(BINS.agy, [...argv, '--log-file', live.replace(/\.log$/, '.agy.txt'), '--print-timeout', `${Math.round(timeoutMs / 1000)}s`, '-p', prompt], null, timeoutMs + 15000, stream)
        : await run(BINS[model], argv, prompt, timeoutMs, stream);
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
    finish('ok');
    return { model, status: 'ok', data, durationMs: Date.now() - start };
  } catch (err) {
    finish(`eroare: ${String(err.message || err).slice(0, 200)}`);
    return { model, status: 'error', error: String(err.message || err), durationMs: Date.now() - start };
  }
}
