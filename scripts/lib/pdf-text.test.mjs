import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Un MinerU fals: pornește un nepot într-o sesiune proprie (setsid), care moștenește stdout/stderr și le ține deschise
// 30 de secunde, și scrie PID-ul nepotului în FAKE_PID_FILE. Cu FAKE_MODE=hang „lucrează” la nesfârșit; cu exit0 iese
// imediat cu succes, lăsând nepotul în urmă. Așa arăta ipoteza pentru cele 11.933 s ale lui b586 pe 25 noiembrie 2026:
// oprirea grupului de procese nu ajungea la nepot, iar „close” venea abia la ieșirea lui.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-text-test-'));
const fake = path.join(dir, 'fake-mineru.mjs');
fs.writeFileSync(
  fake,
  `#!/usr/bin/env node
import fs from 'node:fs';
import { spawn } from 'node:child_process';
if (process.argv[2] === 'nepot') setTimeout(() => {}, 30_000);
else {
  const g = spawn(process.execPath, [process.argv[1], 'nepot'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] });
  fs.writeFileSync(process.env.FAKE_PID_FILE, String(g.pid));
  console.log('pornit');
  if (process.env.FAKE_MODE === 'exit0') process.exit(0);
  setInterval(() => {}, 1000);
}
`,
);
fs.chmodSync(fake, 0o755);
const pidFile = path.join(dir, 'nepot.pid');
// pdf-text.mjs citește MINERU_BIN și mediul lui MinerU la încărcare.
process.env.MINERU_BIN = fake;
process.env.LASTRAJA_OCR_HOME = path.join(dir, 'ocr-home');
process.env.FAKE_PID_FILE = pidFile;
process.env.FAKE_MODE = 'hang';
const { runTool, runMineru } = await import('./pdf-text.mjs');

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function gone(pid, ms = 2000) {
  for (const until = Date.now() + ms; Date.now() < until; ) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !alive(pid);
}

test.after(() => {
  try {
    process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');
  } catch {
    // oprit deja
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('runTool: la limită se încheie fără să aștepte un nepot care ține pipe-urile, iar nepotul e oprit', async () => {
  fs.rmSync(pidFile, { force: true });
  const t = Date.now();
  await assert.rejects(runTool(fake, [], { env: { ...process.env, FAKE_MODE: 'hang' }, timeoutMs: 1500 }), (err) => {
    assert.equal(err.timedOut, true);
    assert.match(err.message, /oprit după/);
    return true;
  });
  // Înainte: ~30 s (până ieșea nepotul). Acum: limita plus cel mult PIPE_GRACE_MS (3 s).
  assert.ok(Date.now() - t < 6000, `a durat ${Date.now() - t} ms`);
  assert.ok(await gone(Number(fs.readFileSync(pidFile, 'utf8'))), 'nepotul a rămas în viață');
});

test('runTool: o unealtă ieșită cu succes nu e ținută de nepotul rămas cu pipe-urile ei', async () => {
  fs.rmSync(pidFile, { force: true });
  const t = Date.now();
  const res = await runTool(fake, [], { env: { ...process.env, FAKE_MODE: 'exit0' }, timeoutMs: 60_000 });
  assert.match(res.stdout, /pornit/);
  assert.ok(Date.now() - t < 4500, `a durat ${Date.now() - t} ms`);
  process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');
});

test('runMineru: documentul la care MinerU stă peste limită e ținut minte (mineru-ratat), iar rularea se încheie', async () => {
  fs.rmSync(pidFile, { force: true });
  const cacheDir = path.join(dir, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const pdfPath = path.join(dir, 'doc.pdf');
  fs.writeFileSync(pdfPath, '%PDF-1.4 fals');
  const tool = { id: 'mineru-test', failures: 0 };
  const t = Date.now();
  const read = await runMineru([{ pdfPath, hash: 'abc123', pages: 1 }], { cacheDir, tool, label: 'b586-2026', maxMs: 1500, pollMs: 100 });
  assert.equal(read, 0);
  assert.ok(Date.now() - t < 6500, `a durat ${Date.now() - t} ms`);
  assert.equal(tool.failures, 1);
  const failed = JSON.parse(fs.readFileSync(path.join(cacheDir, 'mineru-ratat', 'abc123-mineru-test.json'), 'utf8'));
  assert.equal(failed.ori, 1);
  assert.match(failed.eroare, /oprit după/);
  assert.ok(await gone(Number(fs.readFileSync(pidFile, 'utf8'))), 'nepotul a rămas în viață');
});
