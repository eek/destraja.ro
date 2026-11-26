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
//
// Pe VM. Cu .cache/ai-vm (gazda prin care ajungem la VM-ul destraja, ca .cache/agenda-vm), apelurile rulează pe VM, prin
// ssh, cu scripts/vm/ai-run.mjs: aceleași argumente, același dosar gol și același mediu minim, cu autentificările
// făcute acolo. Mac-ul doar trimite promptul și citește fluxul de evenimente. Dacă VM-ul nu răspunde (ssh eșuat) sau nu
// poate rula cererea, apelul se face aici, ca înainte. AI_LOCAL=1 rulează totul aici.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// În interiorul repo-ului, ca agy să găsească agenții din .agents/agents/, dar gol și ignorat de git.
export const SANDBOX_DIR = path.join(ROOT_DIR, '.cache', 'ai-sandbox');
const CODEX_HOME = path.join(ROOT_DIR, '.cache', 'codex-home');
// Modelul GPT al analizelor, implicit pentru codex; codexModel îl schimbă pe un apel (de exemplu gpt-6-luna).
export const CODEX_MODEL = 'gpt-6.1-sol';
const CODEX_CONFIG = `# Codex pentru analizele destrajă (scripts/lib/ai-cli.mjs): fără servere MCP, plugin-uri sau memorii.
model = "${CODEX_MODEL}"
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
// Modelul Gemini al analizelor: Neon High din 19 noiembrie 2026 (înainte Hydrogen High, din 13 noiembrie; înainte Argon High).
// Pe 10 proiecte, cu tot textul, judecat orb de Claude și GPT 6.2 Sol: găsește mai mult decât Hydrogen (13 din 20 de
// judecăți) și Argon (14 din 20), cu scoruri apropiate de ale celorlalte modele. Carbon găsește și mai mult, dar umflă
// scorurile, greșește cel mai des și e de 4,5 ori mai lent (~/work/destraja-eval/models-2026-11/REPORT.md).
// AGY_MODEL alege altul (`agy models`), pentru comparații între modele.
export const AGY_MODEL = process.env.AGY_MODEL || 'gemini-4-neon-high';

const AI_VM_FILE = path.join(ROOT_DIR, '.cache', 'ai-vm');
const VM_HOST = 'destraja@192.168.153.10';
/** Gazda de salt spre VM, dacă apelurile merg pe VM; altfel null. */
function vmJump() {
  if (process.env.AI_LOCAL === '1') return null;
  try {
    return fs.readFileSync(AI_VM_FILE, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

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
    // Alt proces care curăță în același timp poate să-l fi șters deja.
    const stat = fs.statSync(full, { throwIfNoEntry: false });
    if (stat && Date.now() - stat.mtimeMs > LIVE_KEEP_MS) fs.rmSync(full, { force: true });
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const safe = (label || path.basename(process.argv[1] ?? 'model', '.mjs')).replace(/[^\w.-]+/g, '-').slice(0, 40);
  return path.join(LIVE_DIR, `${stamp}-${model}-${safe}-${process.pid}.log`);
}

const CODEX_OFF = ['shell_tool', 'unified_exec', 'code_mode_host', 'multi_agent', 'goals', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'in_app_browser', 'plugins', 'hooks', 'skill_mcp_dependency_install'];

function args(model, mode, codexModel, agyModel) {
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
  // review: recenzia de cod a pipeline-urilor (review-pipelines.mjs, în afara repo-ului), cu agentul care știe că primește
  // cod de analizat; tot fără unelte.
  // vision: agentul care poate deschide doar fișiere (imaginile puse de apelant în SANDBOX_DIR), pentru scrisul de mână.
  const agent = web ? 'lastraja-web' : mode === 'review' ? 'lastraja-review' : mode === 'vision' ? 'lastraja-vision' : 'lastraja-offline';
  return ['--disable-slash-commands', '--agent', agent, '--model', agyModel || AGY_MODEL, '--output-format', 'stream-json'];
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
  // AI_ENV_KEEP=PATH,NUME: variabile în plus pentru CLI-uri, de exemplu autentificarea lui claude într-o sesiune din cloud.
  for (const k of (process.env.AI_ENV_KEEP ?? '').split(',').map((s) => s.trim())) if (k && process.env[k]) env[k] = process.env[k];
  env.LANG ??= 'en_US.UTF-8';
  env.GIT_CEILING_DIRECTORIES = path.join(ROOT_DIR, '.cache');
  env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o IdentityAgent=none';
  if (cmd === BINS.codex) env.CODEX_HOME = codexHome();
  return env;
}

const IDLE_MS = 60_000;

/** Un răspuns care s-a terminat: un JSON întreg sau o pagină HTML închisă. */
function looksComplete(answer) {
  if (!answer?.trim()) return false;
  if (/<\/html>\s*(?:```)?\s*$/i.test(answer)) return true;
  try {
    extractJsonFromText(answer);
    return /\}\s*(?:```)?\s*$/.test(answer);
  } catch {
    return false;
  }
}

function run(cmd, argv, stdin, timeoutMs, { parse, live, model, vm } = {}) {
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
    // Grup de procese propriu: la expirare oprim și procesele pornite de CLI, nu doar CLI-ul. Pe VM, procesul local e
    // ssh-ul; ai-run.mjs oprește CLI-ul de acolo la limita lui de timp sau când ssh-ul se închide.
    const child = vm
      ? spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30', '-J', vm, VM_HOST, 'node destraja-ai/ai-run.mjs'], {
          cwd: SANDBOX_DIR,
          env: { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', HOME: os.homedir(), USER: process.env.USER ?? '', LANG: 'en_US.UTF-8' },
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true,
        })
      : spawn(cmd, argv, { cwd: SANDBOX_DIR, env: minimalEnv(cmd), stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const killGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // grupul s-a oprit deja
      }
    };
    let stdout = '';
    let stderr = '';
    let done = false;
    // agy scrie uneori tot răspunsul și apoi nu se mai închide (nici evenimentul final nu vine). Dacă răspunsul e întreg și
    // nu mai vine nimic un minut, îl luăm și oprim procesul; altfel limita de timp ar arunca un răspuns bun.
    let idle = null;
    const settleIfComplete = () => {
      clearTimeout(idle);
      if (!parse) return;
      idle = setTimeout(() => {
        const answer = final ?? text;
        if (done || !looksComplete(answer)) return;
        done = true;
        clearTimeout(timer);
        out?.write('\n[răspuns întreg, procesul nu s-a închis singur: îl opresc]\n');
        out?.end();
        killGroup('SIGTERM');
        setTimeout(() => killGroup('SIGKILL'), 5000).unref();
        resolve({ stdout: answer, raw: stdout, stderr, code: 0 });
      }, IDLE_MS);
      idle.unref();
    };
    // agy ignoră SIGTERM și rămânea viu ore întregi după expirare, ocupând modelul: după 5 secunde îl oprim forțat.
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
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
      settleIfComplete();
    });
    child.stderr.on('data', (c) => {
      // Rândurile goale de pe VM sunt semnele de viață ale lui ai-run.mjs.
      if (vm && !String(c).trim()) return;
      stderr += c;
      out?.write(c);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      clearTimeout(idle);
      if (done) return;
      done = true;
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(idle);
      if (done) return;
      done = true;
      if (parse && pending) onLine(pending);
      out?.end();
      // Cu evenimente în flux, `text` e răspunsul final al modelului (sau bucățile lui, dacă lipsește evenimentul final).
      const answer = parse ? (final ?? text) : stdout;
      if (code !== 0 && !answer.trim()) {
        const err = new Error(`cod ${code}: ${(stderr || stdout).trim().split('\n').slice(-2).join(' ').slice(0, 300)}`);
        // 255: ssh n-a ajuns la VM; 3: ai-run.mjs n-a putut rula cererea acolo. În ambele cazuri o rulăm local.
        err.local = Boolean(vm) && (code === 255 || code === 3);
        reject(err);
      } else resolve({ stdout: answer, raw: stdout, stderr, code });
    });
    child.stdin.on('error', () => {});
    if (vm) child.stdin.write(`${JSON.stringify({ model, argv, timeoutMs, codexConfig: model === 'codex' ? CODEX_CONFIG : undefined })}\n`);
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

// agy taie orice mesaj mai mare de vreo 170 KB („<truncated N bytes>”), fie ca argument, fie pe stdin. Un prompt mai
// mare pleacă în bucăți de cel mult AGY_PART_BYTES, ca mesaje succesive în aceeași conversație (--input-format
// stream-json): la fiecare parte modelul răspunde doar „ok”, iar cerința e în ultima. Testat pe 18 noiembrie 2026: un
// text de 400.000 de caractere în 4 părți a ajuns întreg (modelul a găsit un cuvânt de la final). Limitele sunt în
// octeți UTF-8 ai mesajului serializat, nu în caractere: diacriticele ocupă câte doi.
// Un singur mesaj pleacă ca argument (-p): pe Linux un argument are cel mult 128 KiB (MAX_ARG_STRLEN), altfel spawn E2BIG.
const AGY_SINGLE_BYTES = 120_000;
const AGY_PART_BYTES = 100_000;
const agyMessage = (content) => JSON.stringify({ event: 'user', message: { role: 'user', content } });

/** Promptul în mesajele pentru agy: unul singur dacă încape, altfel părți tăiate la capăt de rând. */
export function agyParts(prompt) {
  if (Buffer.byteLength(agyMessage(prompt)) <= AGY_SINGLE_BYTES) return null;
  const head = (k, n) => `[PARTEA ${k} DIN ${n} a aceluiași mesaj. Nu răspunde încă: scrie doar „ok” până primești ultima parte.]\n\n`;
  const budget = AGY_PART_BYTES - Buffer.byteLength(agyMessage(head(99, 99))) - 200;
  const fits = (s) => Buffer.byteLength(JSON.stringify(s)) <= budget;
  const chunks = [];
  let cur = '';
  for (const line of prompt.split(/(?<=\n)/)) {
    if (fits(cur + line)) {
      cur += line;
      continue;
    }
    if (cur) chunks.push(cur);
    // Un rând mai lung decât o parte întreagă (text extras fără rânduri) se taie și el.
    let rest = line;
    while (!fits(rest)) {
      let n = rest.length;
      while (n > 1 && !fits(rest.slice(0, n))) n = Math.floor(n * 0.8);
      chunks.push(rest.slice(0, n));
      rest = rest.slice(n);
    }
    cur = rest;
  }
  if (cur) chunks.push(cur);
  const n = chunks.length;
  return chunks.map((c, i) =>
    agyMessage(i < n - 1 ? head(i + 1, n) + c : `[PARTEA ${n} DIN ${n}, ultima. Acum ai tot mesajul: răspunde la cerința din el.]\n\n${c}`),
  );
}

/**
 * Rulează un model și întoarce JSON-ul din răspuns.
 * @returns {Promise<{ model: string, status: 'ok', data: any, durationMs: number } | { model: string, status: 'error', error: string, durationMs: number }>}
 */
// text: true întoarce răspunsul ca text (de exemplu o pagină HTML), fără să caute JSON în el.
// mode: 'vision' (doar agy) lasă modelul să deschidă imaginile din SANDBOX_DIR și rulează mereu aici, unde sunt imaginile.
// agyModel: alt model Gemini pentru apelul acesta (de exemplu gemini-4-hydrogen-low), ca codexModel pentru GPT.
export async function runModel(model, prompt, { mode = 'offline', timeoutMs = 300000, codexModel, agyModel, label, text = false } = {}) {
  const start = Date.now();
  const live = liveFile(model, label);
  fs.writeFileSync(live, `# ${model} · ${label ?? path.basename(process.argv[1] ?? '', '.mjs')} · ${new Date(start).toLocaleTimeString('ro-RO')} · limită ${Math.round(timeoutMs / 1000)}s · prompt ${prompt.length} caractere\n`);
  const finish = (status) => fs.appendFileSync(live, `\n# gata: ${status} în ${Math.round((Date.now() - start) / 1000)}s\n`);
  try {
    const argv = args(model, mode, codexModel, agyModel);
    // agy primește promptul ca argument; ceilalți îl citesc din stdin. Jurnalul intern al lui agy (cererile HTTP) arată,
    // când un apel durează, dacă modelul încă lucrează sau dacă agy reîncearcă (doar local: pe VM ar rămâne acolo).
    const parts = model === 'agy' ? agyParts(prompt) : null;
    if (parts) fs.appendFileSync(live, `# agy: promptul pleacă în ${parts.length} părți\n`);
    const call = (vm) => {
      const stream = { parse: STREAM[model], live, model, vm };
      const agyArgs = [...argv, ...(vm ? [] : ['--log-file', live.replace(/\.log$/, '.agy.txt')]), '--print-timeout', `${Math.round(timeoutMs / 1000)}s`];
      return model === 'agy'
        ? parts
          ? run(BINS.agy, [...agyArgs, '--input-format', 'stream-json', '-p', ''], `${parts.join('\n')}\n`, timeoutMs + 15000, stream)
          : run(BINS.agy, [...agyArgs, '-p', prompt], null, timeoutMs + 15000, stream)
        : run(BINS[model], argv, prompt, timeoutMs, stream);
    };
    const vm = mode === 'vision' ? null : vmJump();
    let res;
    try {
      res = await call(vm);
    } catch (err) {
      if (!err.local) throw err;
      fs.appendFileSync(live, `\n# VM-ul n-a rulat cererea (${err.message}); o rulez aici\n`);
      res = await call(null);
    }
    // Cu text: true, un răspuns lung care pomenește „rate limit” (de exemplu un document despre un API) nu e o limită atinsă.
    const quota = /usage limit|weekly limit|session limit|hour limit|rate limit|quota/i.test(res.stdout + res.stderr) && (text ? res.stdout.trim().length < 500 : !/\{[\s\S]*\}/.test(res.stdout.split('\n').slice(-40).join('\n')));
    if (quota) throw new Error((res.stdout + res.stderr).match(/[^\n]*(usage limit|weekly limit|session limit|hour limit|rate limit|quota)[^\n]*/i)?.[0]?.trim().slice(0, 200) ?? 'limită de utilizare');
    if (parts) {
      // Fiecare parte trebuie să aibă un rezultat reușit, iar nimic din ce a primit agy nu trebuie să fi fost tăiat.
      const results = (res.raw ?? '').split('\n').filter((l) => l.includes('"event":"result"')).map((l) => { try { return JSON.parse(l).result ?? {}; } catch { return {}; } });
      if (/<truncated \d+ bytes>/.test(res.raw ?? '')) throw new Error('agy a tăiat o parte din prompt');
      // Ultimul rezultat poate lipsi când agy nu se închide singur după un răspuns întreg (vezi settleIfComplete).
      if (results.length && (results.length < parts.length - 1 || results.some((r) => r.status && r.status !== 'SUCCESS')))
        throw new Error(`agy: ${results.filter((r) => r.status === 'SUCCESS').length} din ${parts.length} părți primite (${results.find((r) => r.status !== 'SUCCESS')?.error ?? 'conversație întreruptă'})`);
    }
    if (!res.stdout.trim()) throw new Error(`răspuns gol după ${Math.round((Date.now() - start) / 1000)}s (probabil timp depășit)`);
    let data;
    try {
      data = text ? res.stdout : extractJsonFromText(res.stdout);
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
