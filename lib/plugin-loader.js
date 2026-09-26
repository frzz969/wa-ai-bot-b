// lib/plugin-loader.js — pemuat otomatis folder plugins/ (ala bot Jere).
//
// CARA PAKAI:
//   1. Buat file .js baru di plugins/<tema>/, mis. plugins/tools/11-ftp.js
//   2. Export fungsi handler:      module.exports = { handleFtp }
//      atau langsung satu fungsi: module.exports = handleFtp
//   3. Selesai. Router (handlers/messages.js) otomatis memanggilnya.
//      Urutan pemanggilan = urutan nama file (01-, 02-, ... ) jadi pakai
//      prefix angka bila urutan antar plugin penting.
//
// Kontrak handler: async (ctx) => boolean|void
//   ctx = { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped }
//   kembalikan true bila pesan sudah ditangani, false/undefined bila bukan milikmu.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'plugins');

// Nama file yang dilewati: prefiks privat (_ dan .) supaya bisa dipakai
// untuk helper/partial yang tidak boleh jadi plugin.
const isSkipped = (name) => name.startsWith('_') || name.startsWith('.');

function collect(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (isSkipped(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) collect(full, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Kembalikan handler dari sebuah modul: boleh `module.exports = fn`,
// `module.exports = { handler }`, atau `module.exports = { handleX, ... }`.
function resolveHandler(mod) {
  if (typeof mod === 'function') return mod;
  if (mod && typeof mod === 'object') {
    if (typeof mod.handler === 'function') return mod.handler;
    for (const key of Object.keys(mod)) {
      if (/^handle/.test(key) && typeof mod[key] === 'function') return mod[key];
    }
  }
  return null;
}

// Urutan pemanggilan ditentukan prefix angka pada NAMA FILE (01-, 02-, ...),
// bukan nama folder — supaya urutan router konsistencross-folder.
function orderKey(file) {
  const base = path.basename(file, '.js');
  const m = base.match(/^(\d+)[-_ ]/);
  return m ? m[1].padStart(6, '0') : '999999';
}

function loadPlugins() {
  const files = collect(ROOT).sort((a, b) => {
    const ka = orderKey(a);
    const kb = orderKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.localeCompare(b, 'en');
  });
  const plugins = [];
  for (const file of files) {
    let mod;
    try {
      mod = require(file);
    } catch (e) {
      console.error('[plugin-load]', path.relative(ROOT, file), e?.message || e);
      continue; // satu plugin rusak tidak mematikan yang lain
    }
    const handler = resolveHandler(mod);
    if (!handler) {
      console.error('[plugin-load]', path.relative(ROOT, file), 'tidak export handler');
      continue;
    }
    plugins.push({
      name: path.relative(ROOT, file).replace(/\\/g, '/'),
      file,
      handler,
    });
  }
  return plugins;
}

module.exports = { loadPlugins, collect, resolveHandler };
