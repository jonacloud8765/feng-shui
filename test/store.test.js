'use strict';
// Run with: node --test test/
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/main/store');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fengshui-test-'));

test('widgets, bounds and config survive a reload', () => {
  const dir = tmp();
  const a = new Store(dir);
  const w = a.addWidget('countdown', { x: 10, y: 20, width: 300, height: 200 });
  a.updateWidget(w.id, { config: { title: 'Lisbon' }, appearance: { radius: 30 } });
  a.flush();
  const b = new Store(dir);
  const r = b.widget(w.id);
  assert.equal(r.config.title, 'Lisbon');
  assert.equal(r.appearance.radius, 30);
  assert.deepEqual(r.bounds, { x: 10, y: 20, width: 300, height: 200 });
});

test('size limits are enforced', () => {
  const s = new Store(tmp());
  const w = s.addWidget('clock', { x: 0, y: 0, width: 5, height: 99999 });
  assert.equal(w.bounds.width, 140);
  assert.equal(w.bounds.height, 800);
});

test('corrupt file is kept as a backup and the app starts fresh', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'fengshui-config.json'), '{ not json');
  const s = new Store(dir);
  assert.equal(s.widgets.length, 0);
  assert.ok(s.notice);
  assert.ok(fs.readdirSync(dir).some((f) => f.includes('.corrupt-')));
});

test('outdated or partial data is filled in, unknown widget types dropped', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'fengshui-config.json'), JSON.stringify({
    layouts: [{ id: 'L', name: 'Old', widgets: [
      { id: 'a', type: 'clock', bounds: { x: 5, y: 6 } },
      { id: 'b', type: 'hologram' },
    ] }],
  }));
  const s = new Store(dir);
  assert.equal(s.widgets.length, 1);
  const w = s.widget('a');
  assert.equal(w.config.showDate, true);
  assert.equal(w.bounds.width, 340);
  assert.equal(typeof w.appearance.material, 'string');
  assert.equal(s.doc.settings.windowMode, 'desktop');
});

test('layouts keep separate widgets; duplicate copies with new ids', () => {
  const s = new Store(tmp());
  const w = s.addWidget('random', { x: 1, y: 1, width: 150, height: 150 });
  const first = s.layout.id;
  const copy = s.createLayout('Work', first);
  assert.equal(copy.widgets.length, 1);
  assert.notEqual(copy.widgets[0].id, w.id);
  s.switchLayout(copy.id);
  s.removeWidget(copy.widgets[0].id);
  assert.equal(s.widgets.length, 0);
  s.switchLayout(first);
  assert.equal(s.widgets.length, 1);
});

test('layouts can be put in a new order, and the order is saved', () => {
  const dir = tmp();
  const s = new Store(dir);
  const a = s.layout.id;
  const b = s.createLayout('B', a).id;
  const c = s.createLayout('C', a).id;
  s.moveLayout(c, 0);
  assert.deepEqual(s.doc.layouts.map((l) => l.id), [c, a, b]);
  s.moveLayout(c, 99);
  assert.deepEqual(s.doc.layouts.map((l) => l.id), [a, b, c]);
  s.moveLayout('nope', 0);
  assert.equal(s.doc.layouts.length, 3);
  s.flush?.();
  assert.deepEqual(new Store(dir).doc.layouts.map((l) => l.id), [a, b, c]);
});

test('old countdown layouts map onto the new styles', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'fengshui-config.json'), JSON.stringify({
    layouts: [{ id: 'L', name: 'Old', widgets: [
      { id: 'a', type: 'countdown', config: { title: 'Trip', target: '2027-05-01T10:00', layout: 'live' } },
      { id: 'b', type: 'countdown', config: { title: 'Exam', target: '2027-06-01T09:00', layout: 'days' } },
    ] }],
  }));
  const s = new Store(dir);
  assert.equal(s.widget('a').config.style, 'live');
  assert.equal(s.widget('a').config.title, 'Trip');
  assert.equal(s.widget('b').config.style, 'editorial');
  assert.equal(s.widget('b').config.target, '2027-06-01T09:00');
});
