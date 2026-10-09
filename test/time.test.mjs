// Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert';
import { zonedToEpoch, offsetLabel } from '../src/renderer/time.js';

test('wall time in a zone converts across DST', () => {
  // New York: EST (UTC-5) in January, EDT (UTC-4) in July.
  assert.equal(new Date(zonedToEpoch('2027-01-15T09:00', 'America/New_York')).toISOString(), '2027-01-15T14:00:00.000Z');
  assert.equal(new Date(zonedToEpoch('2027-07-15T09:00', 'America/New_York')).toISOString(), '2027-07-15T13:00:00.000Z');
  assert.equal(new Date(zonedToEpoch('2027-03-01T12:00', 'Asia/Kolkata')).toISOString(), '2027-03-01T06:30:00.000Z');
  assert.equal(offsetLabel(Date.UTC(2027, 0, 1), 'Asia/Kolkata'), 'UTC+5:30');
});
