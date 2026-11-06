#!/usr/bin/env node
// Pe VM-ul destraja: rulează un apel de model pentru scripts/lib/ai-cli.mjs de pe Mac, venit prin ssh. Pe stdin vine
// întâi un rând JSON { model, argv, timeoutMs, codexConfig }, apoi promptul (pentru claude și codex); stdout și stderr
// ale CLI-ului merg înapoi neschimbate, deci Mac-ul le citește ca pe un proces local.
//
// Aceeași izolare ca pe Mac (vezi comentariul din ai-cli.mjs): argumentele care opresc uneltele vin de acolo, iar aici
// CLI-ul rulează într-un dosar gol (~/destraja-ai/.cache/ai-sandbox, lângă agenții agy din ~/destraja-ai/.agents),
// cu un mediu minim: HOME, PATH, limba și, doar pentru claude, tokenul lui din ~/.config/destraja/claude-oauth-token.
// Codex are CODEX_HOME-ul lui, cu config.toml primit de la Mac și autentificarea din ~/.codex.
//
// Ieșiri: codul CLI-ului; 3 = cererea nu se poate rula aici (de exemplu un prompt agy mai lung de 128 KB, limita
// Linux pentru un argument), iar Mac-ul o rulează atunci local. La limita de timp oprim tot grupul de procese, iar
// dacă Mac-ul a închis legătura (ssh oprit), o vedem la următorul semn de viață pe stderr și oprim la fel.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const BASE = path.join(HOME, 'destraja-ai');
const SANDBOX = path.join(BASE, '.cache', 'ai-sandbox');
const CODEX_HOME = path.join(BASE, '.cache', 'codex-home');
const BIN = path.join(HOME, '.local', 'bin');
const MAX_ARG = 128 * 1024 - 1;

const fail = (code, msg) => {
  process.stderr.write(`ai-run: ${msg}\n`);
  process.exit(code);
};

// Primul rând de pe stdin e cererea; restul e promptul, pe care îl dăm mai departe CLI-ului.
let buf = Buffer.alloc(0);
let header = null;
let child = null;
const early = [];

function start(req) {
  if (!['agy', 'claude', 'codex'].includes(req.model) || !Array.isArray(req.argv)) fail(3, 'cerere necunoscută');
  if (req.argv.some((a) => Buffer.byteLength(String(a)) > MAX_ARG)) fail(3, 'un argument trece de 128 KB');
  fs.mkdirSync(SANDBOX, { recursive: true });
  const env = { HOME, USER: os.userInfo().username, LANG: 'en_US.UTF-8', PATH: `${BIN}:/usr/local/bin:/usr/bin:/bin` };
  env.GIT_CEILING_DIRECTORIES = path.join(BASE, '.cache');
  if (req.model === 'codex') {
    fs.mkdirSync(CODEX_HOME, { recursive: true });
    const config = path.join(CODEX_HOME, 'config.toml');
    if (typeof req.codexConfig === 'string' && (!fs.existsSync(config) || fs.readFileSync(config, 'utf8') !== req.codexConfig)) fs.writeFileSync(config, req.codexConfig);
    const auth = path.join(CODEX_HOME, 'auth.json');
    if (!fs.existsSync(auth)) fs.symlinkSync(path.join(HOME, '.codex', 'auth.json'), auth);
    env.CODEX_HOME = CODEX_HOME;
  }
  if (req.model === 'claude') {
    try {
      env.CLAUDE_CODE_OAUTH_TOKEN = fs.readFileSync(path.join(HOME, '.config', 'destraja', 'claude-oauth-token'), 'utf8').trim();
    } catch {
      fail(3, 'claude nu e autentificat pe VM');
    }
  }
  child = spawn(path.join(BIN, req.model), req.argv.map(String), { cwd: SANDBOX, env, stdio: ['pipe', 'inherit', 'inherit'], detached: true });
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch {
      // gata deja
    }
  };
  const stop = () => {
    killGroup('SIGTERM');
    setTimeout(() => killGroup('SIGKILL'), 5000).unref();
  };
  const timer = setTimeout(stop, Number(req.timeoutMs || 600_000) + 30_000);
  // Semn de viață: un rând gol pe stderr la 20 de secunde. Când ssh-ul s-a închis, scrierea eșuează și oprim CLI-ul.
  const beat = setInterval(() => {
    try {
      fs.writeSync(2, '\n');
    } catch {
      stop();
    }
  }, 20_000);
  child.on('error', (err) => fail(3, err.message));
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    clearInterval(beat);
    process.exit(code ?? (signal ? 1 : 0));
  });
  child.stdin.on('error', () => {});
  for (const c of early) child.stdin.write(c);
}

process.stdin.on('data', (c) => {
  if (header) return void child.stdin.write(c);
  buf = Buffer.concat([buf, c]);
  const nl = buf.indexOf(10);
  if (nl === -1) return;
  try {
    header = JSON.parse(buf.subarray(0, nl).toString('utf8'));
  } catch {
    fail(3, 'primul rând nu e JSON');
  }
  if (buf.length > nl + 1) early.push(buf.subarray(nl + 1));
  start(header);
});
process.stdin.on('end', () => {
  if (!header) fail(3, 'cerere goală');
  child?.stdin.end();
});
process.on('SIGHUP', () => child && process.kill(-child.pid, 'SIGKILL'));
