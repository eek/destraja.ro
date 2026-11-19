import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeReasons, nextHistory, snapshot } from './score-history.mjs';

const an = ({ score = 5, method, chars, form = 'initiator', agy = 'gemini-4-hydrogen-high', at = '2026-11-15T10:00:00Z', corrections = 0, scores } = {}) => ({
  updatedAt: at,
  ...(method && { coverage: { method, form, billChars: chars, ordinanceChars: 0 } }),
  ...(!method && { version: form }),
  consensus: { riskScore: score, riskLevel: score >= 6.8 ? 'red' : score >= 3.8 ? 'yellow' : 'green' },
  council: Object.fromEntries(['agy', 'claude', 'codex'].map((m) => [m, { status: 'ok', riskScore: scores?.[m] ?? score, ...(m === 'agy' && agy && { modelId: agy }) }])),
  corrections: Array(corrections).fill({}),
});

test('B563: formă nouă, citire integrală și alt Gemini, toate odată', () => {
  const before = snapshot(an({ score: 9.8, agy: null, at: '2026-10-23T11:00:00Z' }), 'initiator');
  assert.equal(before.agyModel, 'gemini-4-argon-high');
  assert.deepEqual(changeReasons(before, an({ score: 7, method: 'whole-text-v1', chars: 31_076, form: 'actualizata' })), ['text', 'metoda', 'model']);
});

test('un text scurt era citit tot și înainte: metoda nu e un motiv', () => {
  const before = snapshot(an({ score: 3 }));
  assert.deepEqual(changeReasons(before, an({ score: 3.7, method: 'whole-text-v1', chars: 9_000 })), ['reluare']);
  assert.deepEqual(changeReasons(before, an({ score: 7.3, method: 'whole-text-v1', chars: 38_000 })), ['metoda']);
});

test('aceeași rulare cu o corectură nouă; o reluare simplă', () => {
  const base = an({ method: 'whole-text-v1', chars: 20_000 });
  assert.deepEqual(changeReasons(snapshot(base), { ...base, corrections: [{}] }), ['corectura']);
  assert.deepEqual(changeReasons(snapshot(base), an({ score: 6, method: 'whole-text-v1', chars: 20_000 })), ['reluare']);
});

test('nextHistory: cel mai nou primul, cel mult șase', () => {
  let prev = an({ score: 1, method: 'whole-text-v1', chars: 20_000 });
  for (let i = 2; i <= 9; i++) {
    const next = an({ score: i, method: 'whole-text-v1', chars: 20_000, at: `2026-11-${10 + i}T10:00:00Z` });
    next.history = nextHistory(prev, next);
    prev = next;
  }
  assert.equal(prev.history.length, 6);
  assert.equal(prev.history[0].riskScore, 8);
  assert.equal(nextHistory(null, prev), null);
});
