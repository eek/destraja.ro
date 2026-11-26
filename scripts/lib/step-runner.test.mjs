import test from 'node:test';
import assert from 'node:assert/strict';
import { runStep } from './step-runner.mjs';

// Un ceas care merge cu ceasul adevărat, plus salturile cerute (somnul Mac-ului, simulat).
function jumpingClock() {
  let jumped = 0;
  return { now: () => performance.now() + jumped, jump: (ms) => (jumped += ms) };
}

test('runStep: un salt de trei ore al ceasului (Mac-ul adormit) nu oprește pasul', async () => {
  const clock = jumpingClock();
  // Pasul lucrează 300 ms; limita e de 400 ms de timp treaz. La 100 ms ceasul sare cu trei ore, ca pe 25 noiembrie.
  // O limită pe ceasul de perete ar suna la primul interval de după salt; cu ceasul treaz pasul se termină singur.
  const jump = setTimeout(() => clock.jump(3 * 3_600_000), 100);
  const res = await runStep(process.execPath, ['-e', 'setTimeout(() => {}, 300)'], { timeoutMs: 400, tickMs: 10, maxGapMs: 50, now: clock.now });
  clearTimeout(jump);
  assert.equal(res.timedOut, false);
  assert.equal(res.code, 0);
  assert.ok(res.sleptSeconds >= 3 * 3600 - 1, `somnul văzut: ${res.sleptSeconds} s`);
  assert.ok(res.awakeSeconds < 5, `timpul treaz: ${res.awakeSeconds} s`);
});

test('runStep: un pas care lucrează peste limită e oprit, cu tot cu copiii lui', async () => {
  // Pasul pornește un nepot care ar dormi un minut; ambii trebuie să dispară la limită.
  const script = `
    const { spawn } = require('node:child_process');
    const kid = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
    console.log('nepot ' + kid.pid);
    setTimeout(() => {}, 60000);
  `;
  let out = '';
  const res = await runStep(process.execPath, ['-e', script], { timeoutMs: 300, tickMs: 20, onOutput: (c) => (out += c), killGraceMs: 500 });
  assert.equal(res.timedOut, true);
  assert.ok(res.seconds < 10);
  const kid = Number(out.match(/nepot (\d+)/)?.[1]);
  assert.ok(kid > 0, out);
  await new Promise((r) => setTimeout(r, 200));
  assert.throws(() => process.kill(kid, 0), 'nepotul a fost oprit și el');
});

test('runStep: o comandă care nu poate porni întoarce eroarea, nu oprește rularea', async () => {
  const res = await runStep('/nu/exista/comanda', [], { timeoutMs: 1000, tickMs: 20 });
  assert.equal(res.code, null);
  assert.match(res.error.message, /ENOENT/);
});
