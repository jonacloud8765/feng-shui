import test from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const { randomInt } = await import('../src/renderer/dom.js');

test('randomInt stays in range, covers negatives, and is roughly uniform', () => {
  const counts = new Map();
  for (let i = 0; i < 60000; i++) {
    const v = randomInt(-3, 2);
    assert.ok(v >= -3 && v <= 2 && Number.isInteger(v));
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const c of counts.values()) assert.ok(Math.abs(c - 10000) < 600, `bucket ${c}`);
  assert.equal(randomInt(7, 7), 7);
});
