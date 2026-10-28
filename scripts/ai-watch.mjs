#!/usr/bin/env node
// Terminalul de urmărire: arată live ce fac acum Gemini, Claude și ChatGPT în scripturile straja (consiliul, presa,
// rapoartele…), din jurnalele scrise de scripts/lib/ai-cli.mjs în .cache/ai-live/. Doar citește; Ctrl+C iese.
//
//   npm run ai:watch
import fs from 'node:fs';
import path from 'node:path';
import { LIVE_DIR } from './lib/ai-cli.mjs';

const RECENT_MS = 3 * 3_600_000;
const NAMES = { agy: 'Gemini', claude: 'Claude', codex: 'ChatGPT' };
const COLOR = { agy: 34, claude: 33, codex: 32 };
const c = (code, s) => `\x1b[${code}m${s}\x1b[0m`;
const dim = (s) => c(2, s);
const mmss = (ms) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

function calls() {
  if (!fs.existsSync(LIVE_DIR)) return [];
  return fs
    .readdirSync(LIVE_DIR)
    .filter((f) => f.endsWith('.log'))
    .map((f) => {
      const file = path.join(LIVE_DIR, f);
      const stat = fs.statSync(file);
      return { file, mtime: stat.mtimeMs, text: '' };
    })
    .filter((x) => Date.now() - x.mtime < RECENT_MS)
    .map((x) => {
      const text = fs.readFileSync(x.file, 'utf8');
      const [, model, label, start, limit] = text.match(/^# (\w+) · (.*?) · ([\d:]+) · limită (\d+)s/) ?? [];
      const done = text.match(/\n# gata: (.*) în (\d+)s\n?$/);
      const born = fs.statSync(x.file).birthtimeMs;
      return { ...x, text, model, label, start, limit: +limit, done: done && { status: done[1], secs: +done[2] }, born };
    })
    .filter((x) => x.model)
    .sort((a, b) => a.born - b.born);
}

// Rupe un rând la spații, ca să nu taie cuvintele; un cuvânt mai lung decât ecranul se rupe unde se poate.
function wrap(line, width) {
  const out = [];
  let cur = '';
  for (const word of line.split(' ')) {
    if (cur && cur.length + 1 + word.length > width) {
      out.push(cur);
      cur = '';
    }
    cur = cur ? `${cur} ${word}` : word;
    while (cur.length > width) {
      out.push(cur.slice(0, width));
      cur = cur.slice(width);
    }
  }
  out.push(cur);
  return out;
}

function render() {
  const width = Math.max(40, (process.stdout.columns || 100) - 2);
  const height = Math.max(20, process.stdout.rows || 40);
  const all = calls();
  const running = all.filter((x) => !x.done);
  const finished = all.filter((x) => x.done).slice(-8).reverse();
  const out = [c(1, `destrajă.ro · modele AI · ${new Date().toLocaleTimeString('ro-RO')}`), dim(`${running.length} în lucru · jurnale în ${path.relative(process.cwd(), LIVE_DIR)} · Ctrl+C iese`), ''];

  const room = Math.max(3, Math.floor((height - out.length - finished.length - 4) / Math.max(1, running.length)) - 2);
  for (const x of running) {
    const elapsed = Date.now() - x.born;
    const late = x.limit && elapsed > x.limit * 1000;
    let extra = '';
    const agyLog = x.file.replace(/\.log$/, '.agy.txt');
    if (x.model === 'agy' && fs.existsSync(agyLog)) extra = dim(` · ultima cerere a lui agy acum ${mmss(Date.now() - fs.statSync(agyLog).mtimeMs)}`);
    out.push(
      `${c(`1;${COLOR[x.model] ?? 37}`, NAMES[x.model] ?? x.model)} ${x.label} ${late ? c(31, `${mmss(elapsed)} / ${mmss(x.limit * 1000)} peste limită`) : dim(`${mmss(elapsed)} / ${mmss(x.limit * 1000)}`)}${extra}`,
    );
    const body = x.text.split('\n').slice(1).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    const lines = body ? body.split('\n').flatMap((l) => wrap(l, width - 2)) : [dim('(încă nimic; modelul citește promptul)')];
    for (const l of lines.slice(-room)) out.push(`  ${l.startsWith('[') ? dim(l) : l}`);
    out.push('');
  }
  if (!running.length) out.push(dim('Niciun model nu lucrează acum.'), '');

  if (finished.length) {
    out.push(c(1, 'Terminate recent'));
    for (const x of finished) {
      const ok = x.done.status === 'ok';
      out.push(`  ${dim(x.start)} ${(NAMES[x.model] ?? x.model).padEnd(8)} ${x.label.slice(0, 30).padEnd(30)} ${ok ? c(32, 'ok') : c(31, x.done.status.slice(0, width - 60))} ${dim(`${x.done.secs}s`)}`);
    }
  }
  process.stdout.write(`\x1b[H\x1b[2J${out.slice(0, height - 1).join('\n')}`);
}

// --once: un singur cadru, fără ștergerea ecranului (pentru verificări).
if (process.argv.includes('--once')) {
  process.stdout.write = ((write) => (chunk) => write(String(chunk).replace('\x1b[H\x1b[2J', '')))(process.stdout.write.bind(process.stdout));
  render();
  process.stdout.write('\n');
  process.exit(0);
}
process.stdout.write('\x1b[?25l');
const stop = () => {
  process.stdout.write('\x1b[?25h\n');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
render();
setInterval(render, 1000);
