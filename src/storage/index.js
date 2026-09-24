// src/storage/index.js — Fase 4 OPSIONAL: pemilih backend storage (CJS).
// Default NONAKTIF: DB_BACKEND=json (atau kosong) -> perilaku 100% seperti sekarang
// (lib/systems.js + database/*.json). Commands Fase 1-3 tidak perlu diubah.
//
// DB_BACKEND=sqlite -> pakai adapter baru src/storage/sqlite.js (data/bot.db).
// sqlite.js toleran-gagal: bila better-sqlite3 belum install -> fallback JSON + warn.
//
// Pemakaian (opsional, tidak wajib dipakai commands existing):
//   const storage = require('../storage'); // atau require('../../storage')
//   console.log(storage.backend); // 'json' | 'sqlite' | 'json-fallback'

function backendName() {
  const v = String(process.env.DB_BACKEND || 'json').trim().toLowerCase();
  if (v === 'sqlite' || v === 'sqlite3' || v === 'better-sqlite3') return 'sqlite';
  return 'json';
}

function loadJsonBackend() {
  const systems = require('../../lib/systems');
  let groupStore = null;
  try {
    // eslint-disable-next-line global-require
    groupStore = require('../extensions/safety/group-store');
  } catch {
    groupStore = null;
  }
  return {
    backend: 'json',
    available: true,
    isAvailable: () => true,
    db: null,
    dbFile: null,
    // wallet/level: teruskan 1:1 ke lib/systems.js (perilaku identik)
    getBalance: (id) => systems.getBalance(id),
    addBalance: (id, n) => systems.addBalance(id, n),
    transfer: (f, t, n) => systems.transfer(f, t, n),
    mine: (id) => systems.mine(id),
    getLevel: (id) => systems.getLevel(id),
    addXp: (id, n) => systems.addXp(id, n),
    leaderboard: (n) => systems.leaderboard(n),
    getGroup: (jid) => (groupStore ? groupStore.getGroup(jid) : { antiflood: false, antilink: false, mute: false }),
    setGroup: (jid, patch) => (groupStore ? groupStore.setGroup(jid, patch) : null),
    getCooldown: () => 0,
    setCooldown: () => 0,
    close: () => {},
  };
}

function load() {
  if (backendName() !== 'sqlite') return loadJsonBackend();
  try {
    // eslint-disable-next-line global-require
    const sqlite = require('./sqlite');
    return sqlite;
  } catch (e) {
    console.warn('[storage] gagal load sqlite adapter, fallback ke JSON:', (e && e.message) || e);
    return loadJsonBackend();
  }
}

const current = load();

module.exports = current;
module.exports.backendName = backendName;
module.exports.getStorage = load;
module.exports.isSqlite = () => current && current.backend === 'sqlite' && current.available === true;
