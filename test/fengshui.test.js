'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { arrange, variants } = require('../src/main/fengshui');

const work = { x: 0, y: 25, width: 1440, height: 790 };
const min = { width: 100, height: 80 };
const w = (id, width, height, type) => ({ id, type, bounds: { x: 0, y: 0, width, height }, min });

function tidy(out) {
  const rects = Object.values(out);
  for (const r of rects) {
    assert.ok(r.x >= work.x && r.y >= work.y && r.x + r.width <= work.x + work.width && r.y + r.height <= work.y + work.height, 'on screen');
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(!(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height), 'no overlaps');
  }
}

test('feng shui keeps everything on screen without overlap', () => {
  const ws = [w('big', 520, 400), w('a', 300, 200), w('b', 260, 170), w('c', 220, 160), w('d', 320, 150), w('e', 300, 112)];
  const out = arrange(ws, work);
  assert.equal(Object.keys(out).length, ws.length);
  tidy(out);
});

test('feng shui shrinks a widget that is larger than the screen', () => {
  const out = arrange([w('huge', 3000, 2000)], work);
  assert.ok(out.huge.width <= work.width && out.huge.height <= work.height);
});

test('feng shui grows a whiteboard to fill the screen', () => {
  const out = arrange([w('board', 578, 337, 'board'), w('clock', 220, 110, 'clock')], work);
  assert.ok(out.board.width * out.board.height > 4 * out.clock.width * out.clock.height, 'the board gets the room');
  assert.ok(out.board.width > 900, 'the board is expanded');
  tidy(out);
});

test('feng shui gives Films more room than glanceable widgets', () => {
  const ws = [w('films', 234, 305, 'films'), w('watched', 220, 130, 'watched'), w('clock', 220, 110, 'clock'), w('photo', 300, 220, 'image')];
  const out = arrange(ws, work);
  assert.ok(out.films.width * out.films.height > 2.5 * 234 * 305, 'films expands');
  assert.ok(out.films.width * out.films.height > out.clock.width * out.clock.height * 2, 'clock stays compact');
  tidy(out);
});

test('feng shui gives the corkboard at least a quarter of the screen, every variant', () => {
  const ws = [w('page', 430, 297, 'page'), w('cork', 330, 450, 'cork'), w('films', 234, 305, 'films'), w('watched', 300, 150, 'watched'), w('clock', 300, 150, 'clock'),
    w('weather', 300, 190, 'weather'), w('world', 300, 200, 'worldclock'), w('dock', 520, 88, 'launcher'), w('photo', 127, 127, 'image'), w('stop', 260, 140, 'stopwatch')];
  ws[1].share = 0.25;
  const n = variants(ws, work);
  assert.ok(n >= 2);
  for (let v = 0; v < n; v++) {
    const out = arrange(ws, work, { variant: v });
    assert.ok(out.cork.width * out.cork.height >= 0.25 * work.width * work.height - 1, 'a quarter of the screen');
    tidy(out);
  }
});
