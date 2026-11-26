import test from 'node:test';
import assert from 'node:assert/strict';
import { awakeClock, awakeTimeout, formatSleep } from './awake-clock.mjs';

const MIN = 60_000;

/** Un ceas fals și cronometre false: `advance(ms)` mută ceasul în pași de `tick` și cheamă intervalele la fiecare pas. */
function fakeTime(tick = 5000) {
  let t = 0;
  const intervals = new Map();
  let nextId = 1;
  const timers = {
    setInterval: (fn) => {
      const id = nextId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
  };
  const fire = () => [...intervals.values()].forEach((fn) => fn());
  return {
    now: () => t,
    timers,
    pending: () => intervals.size,
    /** Mac-ul treaz: ceasul merge și cronometrele bat la fiecare `tick`. */
    advance(ms) {
      for (let left = ms; left > 0; left -= tick) {
        t += Math.min(tick, left);
        fire();
      }
    },
    /** Mac-ul doarme `ms`: ceasul sare, cronometrele nu bat; la trezire bat o dată. */
    sleep(ms) {
      t += ms;
      fire();
    },
  };
}

test('awakeClock: pașii obișnuiți se adună, saltul somnului nu', () => {
  const time = fakeTime();
  const clock = awakeClock({ now: time.now });
  for (let i = 0; i < 12; i++) {
    time.advance(5000);
    clock.sample();
  }
  assert.equal(clock.awakeMs(), MIN);
  time.sleep(3 * 60 * MIN);
  assert.equal(clock.awakeMs(), MIN + 5000, 'trei ore de somn numără cât un interval');
  assert.equal(clock.sleptMs(), 3 * 60 * MIN - 5000);
});

test('awakeClock: un ceas dat înapoi nu scade timpul treaz', () => {
  let t = 10_000;
  const clock = awakeClock({ now: () => t });
  t = 2000;
  assert.equal(clock.awakeMs(), 0);
  t = 7000;
  assert.equal(clock.awakeMs(), 5000);
});

test('awakeTimeout: ziua de 25 noiembrie, cu somnul numărat de ceasul treaz, nu oprește pasul la trezire', () => {
  const time = fakeTime();
  let fired = false;
  // Limita pasului Senatului: 180 de minute.
  awakeTimeout(180 * MIN, () => (fired = true), { now: time.now, timers: time.timers });
  time.advance(14 * MIN); // 09:30–09:44, MinerU lucrează
  time.sleep(3 * 60 * MIN + 18 * MIN); // capacul închis 09:44–13:02 (cu ceasul de perete, 212 minute de la pornire)
  assert.equal(fired, false, 'la trezire pasul a lucrat doar ~14 minute');
  time.advance(165 * MIN);
  assert.equal(fired, false);
  time.advance(2 * MIN);
  assert.equal(fired, true, 'după 180 de minute de lucru limita se aplică');
  assert.equal(time.pending(), 0, 'cronometrul se oprește după ce a sunat');
});

test('awakeTimeout: un pas care chiar lucrează prea mult e oprit la limită, o singură dată', () => {
  const time = fakeTime();
  let fired = 0;
  awakeTimeout(10 * MIN, () => fired++, { now: time.now, timers: time.timers });
  time.advance(10 * MIN - 5000);
  assert.equal(fired, 0);
  time.advance(5000);
  assert.equal(fired, 1);
  time.advance(30 * MIN);
  assert.equal(fired, 1);
});

test('awakeTimeout: clear oprește cronometrul', () => {
  const time = fakeTime();
  let fired = false;
  const t = awakeTimeout(MIN, () => (fired = true), { now: time.now, timers: time.timers });
  time.advance(30_000);
  t.clear();
  time.advance(5 * MIN);
  assert.equal(fired, false);
  assert.equal(time.pending(), 0);
});

test('awakeTimeout: cu cronometrele adevărate', async () => {
  let t = 0;
  const done = new Promise((resolve) => awakeTimeout(50, resolve, { tickMs: 5, maxGapMs: 30, now: () => t }));
  // Un somn lung la început, apoi pași mici: limita vine după cei 50 ms de pași mici.
  t = 1_000_000;
  const tick = setInterval(() => (t += 5), 2);
  await done;
  clearInterval(tick);
  assert.ok(t >= 1_000_000 + 45, `a sunat la ${t}`);
});

test('formatSleep', () => {
  assert.equal(formatSleep(7 * MIN), '7 min');
  assert.equal(formatSleep(198 * MIN), '3 h 18 min');
  assert.equal(formatSleep(120 * MIN), '2 h');
});
