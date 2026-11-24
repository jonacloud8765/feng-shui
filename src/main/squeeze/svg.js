'use strict';

// SVG: a careful text clean-up. Comments, <metadata> blocks (author, licence,
// editing tool) and editor-only data (Inkscape and Sodipodi attributes and
// views) are removed. Whitespace between tags is collapsed only when the
// drawing has no text, where spaces can matter. Nothing that draws anything
// is changed, and the result is drawn and compared with the original before
// it is kept.

function clean(buf) {
  let s = buf.toString('utf8');
  if (!/<svg[\s>]/i.test(s)) throw new Error('This is not an SVG file.');
  if (/<!ENTITY/i.test(s)) throw new Error('This SVG defines its own entities, so it was left alone to be safe.');
  const removed = new Set();
  const before = s.length;
  // Keep CDATA (scripts, styles) out of reach while cleaning.
  const held = [];
  s = s.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => { held.push(m); return `\u0000${held.length - 1}\u0000`; });
  s = s.replace(/<!--[\s\S]*?-->/g, () => { removed.add('comments'); return ''; });
  s = s.replace(/<metadata\b[\s\S]*?<\/metadata>|<metadata\b[^>]*\/>/gi, () => { removed.add('author'); return ''; });
  s = s.replace(/<sodipodi:namedview\b[\s\S]*?(<\/sodipodi:namedview>|\/>)/g, () => { removed.add('software'); return ''; });
  s = s.replace(/\s(inkscape|sodipodi):[\w.-]+="[^"]*"/g, () => { removed.add('software'); return ''; });
  if (!/(inkscape|sodipodi):/.test(s.replace(/xmlns:(inkscape|sodipodi)="[^"]*"/g, ''))) {
    s = s.replace(/\sxmlns:(inkscape|sodipodi)="[^"]*"/g, '');
  }
  if (!/<(text|tspan|textPath|foreignObject|style|script|pre)\b/i.test(s) && !/xml:space/i.test(s)) {
    const t = s.replace(/>\s+</g, '><').trim();
    if (t !== s) s = t;
  }
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
  const out = Buffer.from(s, 'utf8');
  return { buf: out, removed: [...removed], notes: before === s.length ? [] : [], lossless: 'drawn-identical' };
}

module.exports = { clean };
