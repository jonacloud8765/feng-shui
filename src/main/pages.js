'use strict';

// Custom Widget pages are copied into Morrow's data folder, like photos, so
// a widget keeps working if the original file moves. Pages run in their own
// frame inside the widget and can't reach Morrow's settings or the network
// rules of the widget itself.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createPages(dataDir) {
  const dir = path.join(dataDir, 'pages');

  async function importPage(src) {
    if (!src || !fs.existsSync(src)) throw new Error('That file can’t be found.');
    if (!/\.html?$/i.test(src)) throw new Error('Choose an .html file.');
    const st = await fs.promises.stat(src);
    if (st.size > 20 * 1024 * 1024) throw new Error('That page is larger than 20 MB.');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${crypto.randomUUID()}.html`);
    await fs.promises.copyFile(src, dest);
    return { file: dest, name: path.basename(src) };
  }

  return { dir, importPage };
}

module.exports = { createPages };
