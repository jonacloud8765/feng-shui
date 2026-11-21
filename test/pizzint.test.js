'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { nehFromMarkets } = require('../src/main/pizzint');

test('the Nothing Ever Happens Index follows the most likely escalation', () => {
  const r = nehFromMarkets([{ label: 'A', price: 0.08 }, { label: 'B', price: 0.325 }, { label: 'C', price: 0.9, escalation_polarity: 'neutral' }]);
  assert.equal(r.value, 33);
  assert.equal(r.label, 'Something Might Happen');
  assert.equal(r.driver, 'B');
});

test('markets where "no" escalates count from the other side', () => {
  const r = nehFromMarkets([{ label: 'Ceasefire holds', price: 0.2, escalation_polarity: 'no_escalates' }]);
  // Not a valid candidate, so it is only used when nothing else exists.
  assert.equal(r.value, 80);
});

test('no markets, no reading', () => {
  assert.equal(nehFromMarkets([]), null);
});
