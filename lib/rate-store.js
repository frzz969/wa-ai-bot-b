// lib/rate-store.js — persistensi counter rate-limit ke database/rate-limit.json.
// Diadaptasi dari pola lib/memory-store.js: tulis atomik (tmp + rename), debounce,
// try/catch di semua operasi — kegagalan I/O tidak pernah mengganggu bot.
//
// Format file: { [sender]: [timestampMs, ...] }
// Hanya timestamp dalam window yang disimpan; cleanup scheduler membuang yang lama.

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_FILE = path.join(DB_DIR, 'rate-limit.json');
const TMP_FILE = path.join(DB_DIR, 'rate-limit.json.tmp');

const WRITE_DEBOUNCE_MS = 2000;

let dataRef = null;
let timer = null;
let flushing = false;
let dirty = false;

function ensureData() {
  if (!dataRef) dataRef = {};
  return dataRef;
}

function load() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    // Normalisasi: hanya simpan array angka.
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = Array.isArray(v) ? v.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
    }
    return out;
  } catch (e) {
    console.error('[rate-store] gagal baca database/rate-limit.json:', e?.message || e);
    return {};
  }
}

function attach(data) {
  dataRef = data || {};
  return dataRef;
}

// Map tidak terserialisasi JSON.stringify(), jadi ambil snapshot objek bila perlu.
function toPlain(data) {
  if (data && typeof data.forEach === 'function' && typeof data.entries === 'function') {
    const out = {};
    for (const [k, v] of data.entries()) out[k] = v;
    return out;
  }
  return data;
}

function writeSync() {
  const data = toPlain(ensureData());
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(TMP_FILE, DB_FILE);
    dirty = false;
    return true;
  } catch (e) {
    console.error('[rate-store] gagal tulis database/rate-limit.json:', e?.message || e);
    try { if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE); } catch {}
    return false;
  }
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (flushing) return true;
  if (!dirty) return writeSync();
  flushing = true;
  try {
    return writeSync();
  } finally {
    flushing = false;
  }
}

function scheduleSave() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { flush(); } catch (e) {
      console.error('[rate-store] gagal flush terjadwal:', e?.message || e);
    }
  }, WRITE_DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

function deleteKey(key) {
  const data = ensureData();
  if (data && typeof data.delete === 'function') {
    if (data.delete(key)) scheduleSave();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(data, key)) {
    delete data[key];
    scheduleSave();
  }
}

function installExitHooks() {
  const handler = () => {
    try { flush(); } catch {}
  };
  process.once('exit', handler);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      try { flush(); } catch {}
    });
  }
}
installExitHooks();

module.exports = { DB_FILE, load, attach, flush, scheduleSave, deleteKey };
