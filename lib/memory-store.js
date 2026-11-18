// lib/memory-store.js — persistensi memory chat ke disk (satu file JSON).
//
// Format file database/memory.json:
//   { [scope]: { messages: [...], summary: '', prefs: {}, updatedAt: <ms> } }
//
// - Tulis ATOMIK: tulis file.tmp lalu rename menimpa file utama.
// - Throttled/debounced: pushMessage tidak menulis sinkron tiap pesan.
// - flush saat process exit bila memungkinkan.
// - SEMUA operasi dibungkus try/catch: kegagalan I/O tidak boleh crash bot.
//
// Modul ini TIDAK tahu konsep jid/sender — itu urusan lib/memory.js.

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'database');
const DB_FILE = path.join(DB_DIR, 'memory.json');
const TMP_FILE = path.join(DB_DIR, 'memory.json.tmp');

const WRITE_DEBOUNCE_MS = 2000; // debounce tulis disk
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari default (0 = nonaktif)

// Referensi objek yang dipakai lib/memory.js. Kita simpan poin ke objek
// dan menuliskan snapshot saat flush. Null sampai di-init oleh memory.js.
let dataRef = null;
let timer = null;
let flushing = false;
let dirty = false;

function getTtlMs() {
  const raw = process.env.MEMORY_TTL_MS;
  if (raw === undefined || raw === '') return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
}

function ensureData() {
  if (!dataRef) dataRef = {};
  return dataRef;
}

// Dipanggil sekali oleh lib/memory.js()
function attach(data) {
  dataRef = data || {};
  return dataRef;
}

function load() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    if (!fs.existsSync(DB_FILE)) return {};
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.error('[memory-store] gagal baca database/memory.json:', e?.message || e);
    return {};
  }
}

function writeSync() {
  const data = ensureData();
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(TMP_FILE, json, 'utf8');
    fs.renameSync(TMP_FILE, DB_FILE);
    dirty = false;
    return true;
  } catch (e) {
    console.error('[memory-store] gagal tulis database/memory.json:', e?.message || e);
    // Bersihkan file tmp yang mungkin setengah jadi (non-fatal).
    try { if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE); } catch {}
    return false;
  }
}

// Tulis segera (dipakai exit hook & test).
function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty && !flushing) return writeSync();
  if (flushing) return true;
  flushing = true;
  try {
    return writeSync();
  } finally {
    flushing = false;
  }
}

// Jadwalkan tulis debounced. Tidak sinkron, tidak melempar.
function scheduleSave() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { flush(); } catch (e) {
      console.error('[memory-store] gagal flush terjadwal:', e?.message || e);
    }
  }, WRITE_DEBOUNCE_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

// Hapus scope dari data & jadwalkan tulis.
function deleteScope(scope) {
  const data = ensureData();
  if (Object.prototype.hasOwnProperty.call(data, scope)) {
    delete data[scope];
    scheduleSave();
  }
}

// Buang scope yang sudah kedaluwarsa berdasarkan updatedAt (TTL).
// Dipanggil saat load & sesekali saat akses. Mengembalikan jumlah yang dibuang.
function pruneExpired() {
  const ttl = getTtlMs();
  if (!ttl || !dataRef) return 0;
  const now = Date.now();
  let n = 0;
  for (const key of Object.keys(dataRef)) {
    const rec = dataRef[key];
    const at = rec && Number(rec.updatedAt);
    if (!at || now - at > ttl) {
      delete dataRef[key];
      n++;
    }
  }
  if (n) scheduleSave();
  return n;
}

// Pasang exit hook sekali saat modul dimuat.
function installExitHooks() {
  const handler = () => {
    try { flush(); } catch {}
  };
  process.once('exit', handler);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      try { flush(); } catch {}
      // Tidak memanggil process.exit di sini: biarkan handler lain jalan.
    });
  }
}
installExitHooks();

module.exports = {
  DB_FILE,
  DEFAULT_TTL_MS,
  attach,
  load,
  flush,
  scheduleSave,
  deleteScope,
  pruneExpired,
  getTtlMs,
};
