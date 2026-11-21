'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { arrange } = require('../src/main/fengshui');

const work = { x: 0, y: 25, width: 1440, height: 790 };
const min = { width: 100, height: 80 };
const w = (id, width, height) => ({ id, bounds: { x: 0, y: 0, width, height }, min });

test('feng shui centres the largest widget and keeps everything on screen without overlap', () => {
  const ws = [w('big', 520, 400), w('a', 300, 200), w('b', 260, 170), w('c', 220, 160), w('d', 320, 150), w('e', 300, 112)];
  const out = arrange(ws, work);
  assert.equal(Object.keys(out).length, ws.length);
  const big = out.big;
  assert.ok(Math.abs(big.x + big.width / 2 - (work.x + work.width / 2)) < 2, 'heart is centred');
  const rects = Object.values(out);
  for (const r of rects) {
    assert.ok(r.x >= work.x && r.y >= work.y && r.x + r.width <= work.x + work.width && r.y + r.height <= work.y + work.height, 'on screen');
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    assert.ok(!overlap, 'no overlaps');
  }
});

test('feng shui shrinks a widget that is larger than the screen', () => {
  const out = arrange([w('huge', 3000, 2000)], work);
  assert.ok(out.huge.width <= work.width && out.huge.height <= work.height);
});

test('feng shui keeps a full dashboard of ten widgets tidy', () => {
  const ws = [w('idf', 523, 399), w('cork', 440, 636), w('films', 360, 520), w('watched', 300, 300), w('clock', 260, 140),
    w('weather', 300, 180), w('world', 320, 200), w('dock', 420, 92), w('photo', 280, 340), w('stop', 260, 150)];
  ws[0].bounds.x = 458; ws[0].bounds.y = 250;
  const out = arrange(ws, work);
  assert.ok(Math.abs(out.idf.x + out.idf.width / 2 - 720) < 2, 'the widget in the middle stays the heart');
  assert.ok(out.dock.y > out.idf.y + out.idf.height, 'the dock rests under the heart');
  const rects = Object.values(out);
  for (const r of rects) assert.ok(r.x >= 0 && r.y >= 25 && r.x + r.width <= 1440 && r.y + r.height <= 815, 'on screen');
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(!(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height), 'no overlaps');
  }
});
