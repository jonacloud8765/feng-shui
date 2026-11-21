'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { arrange, classify, skinFor, isFengShuiLayout } = require('../src/main/bagua');
const { TYPES } = require('../src/shared/registry');

const work = { x: 0, y: 25, width: 1440, height: 875 };
const w = (type, config = {}, bounds = { x: 0, y: 0, width: 300, height: 200 }) => ({ id: `${type}-${JSON.stringify(config).length}`, type, config, bounds, min: TYPES[type].min, max: TYPES[type].max });
const desk = [w('page', { file: '/x/pages/my-service.html' }, { x: 0, y: 0, width: 512, height: 351 }), w('cork'), w('films', { title: 'Ready to watch' }), w('watched'), w('clock'), w('weather'), w('worldclock'), w('image'), w('launcher')];

function check(placed) {
  const rects = Object.values(placed);
  for (const r of rects) {
    assert.ok(r.x >= 16 && r.y >= work.y + 16 && r.x + r.width <= work.width - 16 && r.y + r.height <= work.y + work.height - 16, 'inside the 16px margin');
    for (const k of ['x', 'y', 'width', 'height']) assert.equal(r[k] % 8, 0, `${k} on the 8px grid`);
  }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(!(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height), 'no overlaps');
  }
}

test('the worked example from the kit is seated in its zones', () => {
  const { placed, report } = arrange(desk, work);
  check(placed);
  const cells = report.cells;
  assert.equal(cells[desk[0].id], 'career');
  assert.equal(cells[desk[1].id], 'family');
  assert.equal(cells[desk[2].id], 'children');
  assert.equal(cells[desk[3].id], 'fame');
  assert.equal(cells[desk[6].id], 'helpful');
  assert.ok(!Object.values(cells).includes('center'), 'the centre is left open');
  assert.ok(report.ratio <= 2.5 + 1e-9, 'largest at most 2.5x the smallest');
  assert.ok(report.elements.fire <= report.elements.water + 1, 'Fire is balanced by Water');
});

test('no widget takes more than 22% of the room', () => {
  const { placed } = arrange([w('cabinet', {}, { x: 0, y: 0, width: 1400, height: 800 }), w('clock')], work);
  const room = (1440 - 32) * (875 - 32 - 40);
  for (const r of Object.values(placed)) assert.ok(r.width * r.height <= 0.22 * room);
});

test('custom widgets are classified from their words', () => {
  assert.equal(classify({ type: 'page', config: { file: 'trip-to-tokyo-flight.html' } }).zone, 'helpful');
  assert.equal(classify({ type: 'page', config: { file: 'zen.html' } }).element, 'earth');
  assert.equal(classify({ type: 'page', config: {} }).zone, 'family');
  assert.equal(skinFor({ type: 'page', config: { file: '/a/my-service.html' } }).title, 'Service');
});

test('only the Feng Shui layout is skinned', () => {
  assert.ok(isFengShuiLayout({ name: 'Feng Shui' }));
  assert.ok(!isFengShuiLayout({ name: 'Cinema' }));
});

test('a lone Fire-heavy desk still keeps Fire in check', () => {
  const { report } = arrange([w('films'), w('watched'), w('doughcon'), w('nuke'), w('worldclock')], work);
  assert.ok(Object.values(report.cells).includes('career'), 'a Fire widget is restrained in Career');
});
