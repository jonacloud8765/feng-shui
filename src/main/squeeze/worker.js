'use strict';

// Runs the format modules off the main thread, so recompressing a large PNG
// or PDF never freezes the app's windows. Each request reads the original
// itself and writes only the temporary output path it was given.

const { parentPort } = require('worker_threads');
const fs = require('fs');

const modules = {
  jpeg: () => require('./jpeg'),
  png: () => require('./png'),
  heif: () => require('./heif'),
  webp: () => require('./webp'),
  gif: () => require('./gif'),
  svg: () => require('./svg'),
  pdf: () => require('./pdf'),
  audio: () => require('./audio'),
};

function run({ op, format, input, output, opts }) {
  const buf = fs.readFileSync(input);
  let r;
  if (op === 'features') return { features: modules.pdf().features(buf) };
  switch (format) {
    case 'jpeg': r = modules.jpeg().clean(buf); break;
    case 'heif': r = modules.heif().clean(buf); break;
    case 'webp': r = modules.webp().clean(buf); break;
    case 'gif': r = modules.gif().clean(buf); break;
    case 'svg': r = modules.svg().clean(buf); break;
    case 'png': r = op === 'optimise' ? modules.png().optimise(buf, { level: opts.level }) : modules.png().clean(buf); break;
    case 'pdf': r = modules.pdf().optimise(buf, { recompress: op === 'optimise' }); break;
    case 'mp3': case 'aac': case 'flac': case 'wav': case 'aiff': {
      const a = modules.audio();
      r = a.clean(format, buf, opts);
      if (!a.sameAudio(buf, r)) throw new Error('The audio would change; stopping.');
      break;
    }
    default: throw new Error(`No cleaner for ${format}.`);
  }
  const fd = fs.openSync(output, 'wx');
  try { fs.writeSync(fd, r.buf); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { size: r.buf.length, removed: r.removed, notes: r.notes, lossless: r.lossless, stats: r.stats };
}

parentPort.on('message', (msg) => {
  try {
    parentPort.postMessage({ id: msg.id, ok: true, result: run(msg) });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, ok: false, error: String(err && err.message || err) });
  }
});
