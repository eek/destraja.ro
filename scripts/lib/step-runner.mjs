// Un pas al rulării zilnice (scripts/straja-daily.mjs): o comandă cu ieșirea ei și cu limita de timp.
//
// Limita se numără pe timpul treaz (lib/awake-clock.mjs), nu pe ceasul de perete: un Mac adormit cu capacul închis nu mai
// oprește pasul la trezire (25 noiembrie 2026: pasul Senatului, oprit la 13:02 după 15 minute de lucru și 3 ore de somn).
// La limită oprim pasul cu tot ce a pornit: modelele și MinerU rulează în grupuri de procese proprii și un SIGTERM dat
// doar pasului le lăsa în urmă, cu memoria și cu cererile lor. Ce nu iese în 10 secunde e oprit forțat.
import { spawn, spawnSync } from 'node:child_process';
import { awakeTimeout } from './awake-clock.mjs';

/** Un proces cu tot ce a pornit el. Îi căutăm înainte să-l oprim: copiii unui părinte oprit nu mai pot fi găsiți după el. */
export function tree(pid) {
  const kids = new Map();
  for (const line of (spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).stdout ?? '').split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (child) kids.set(parent, [...(kids.get(parent) ?? []), child]);
  }
  const all = [pid];
  for (let i = 0; i < all.length; i++) all.push(...(kids.get(all[i]) ?? []));
  return all;
}

export function signalAll(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // s-a terminat între timp
    }
  }
}

/**
 * Pornește `cmd argv` și așteaptă să se termine. `timeoutMs`: limita pe timpul treaz (0 = fără limită). `onOutput(chunk)`
 * primește stdout și stderr; `onSpawn(child)` copilul, ca rularea să-l poată opri la un semnal. Întoarce
 * { code, error, timedOut, seconds, awakeSeconds, sleptSeconds }: `seconds` pe ceasul de perete, celelalte două din
 * ceasul treaz. `tickMs`, `maxGapMs`, `now` și `killGraceMs` sunt pentru teste.
 */
export function runStep(cmd, argv, { cwd, env = process.env, timeoutMs = 3_600_000, onOutput = () => {}, onSpawn = () => {}, tickMs = 5000, maxGapMs = 30_000, now, killGraceMs = 10_000 } = {}) {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn(child);
    let timedOut = false;
    let done = false;
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    const limit = awakeTimeout(
      timeoutMs || Infinity,
      () => {
        timedOut = true;
        const pids = tree(child.pid);
        signalAll(pids, 'SIGTERM');
        setTimeout(() => signalAll(pids, 'SIGKILL'), killGraceMs).unref();
      },
      { tickMs, maxGapMs, now },
    );
    const finish = (code, error = null) => {
      if (done) return;
      done = true;
      limit.clear();
      const awake = limit.clock.awakeMs();
      const slept = limit.clock.sleptMs();
      resolve({
        code,
        error,
        timedOut,
        seconds: Math.round((Date.now() - start) / 1000),
        awakeSeconds: Math.round(awake / 1000),
        sleptSeconds: Math.round(slept / 1000),
      });
    };
    // Fără ascultătorul de „error”, o comandă care nu poate porni ar opri toată rularea.
    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });
}
