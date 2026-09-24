// src/extensions/safety/group-store.js — setting grup + warn (CJS, JSON file).
// File: database/group.json (dibuat otomatis bila belum ada).
// Bentuk: { groups: { <jid>: { antiflood, antilink, mute } }, warns: { <groupJid>: { <userJid>: [{ reason, at }] } } }
// TIDAK menyentuh database/*.json lain.
const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(__dirname, '..', '..', '..', 'database', 'group.json');
const MAX_WARNS = 3;
const WARN_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // warn kedaluwarsa 30 hari

const DEFAULT_GROUP = { antiflood: false, antilink: false, mute: false };

let cache = null;

function load() {
  if (cache) return cache;
  cache = { groups: {}, warns: {} };
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf8').trim();
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          if (d.groups && typeof d.groups === 'object') cache.groups = d.groups;
          if (d.warns && typeof d.warns === 'object') cache.warns = d.warns;
        }
      }
    }
  } catch (e) {
    console.error('[group-store] gagal load, pakai kosong:', e?.message || e);
    cache = { groups: {}, warns: {} };
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(cache || { groups: {}, warns: {} }, null, 2));
  } catch (e) {
    console.error('[group-store] gagal save:', e?.message || e);
  }
}

function freshWarns(list, now = Date.now()) {
  if (!Array.isArray(list)) return [];
  return list.filter((w) => w && Number(w.at) > 0 && now - Number(w.at) < WARN_EXPIRE_MS);
}

function getGroup(jid) {
  const db = load();
  const cur = db.groups[String(jid)] || {};
  return {
    antiflood: Boolean(cur.antiflood),
    antilink: Boolean(cur.antilink),
    mute: Boolean(cur.mute),
  };
}

function setGroup(jid, patch) {
  const db = load();
  const key = String(jid);
  const cur = getGroup(key);
  const next = { ...cur };
  for (const k of ['antiflood', 'antilink', 'mute']) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, k)) next[k] = Boolean(patch[k]);
  }
  db.groups[key] = next;
  save();
  return next;
}

function isAntiFloodOn(jid) { return getGroup(jid).antiflood; }
function isAntiLinkOn(jid) { return getGroup(jid).antilink; }
function isMuteOn(jid) { return getGroup(jid).mute; }

// Tambah 1 warn, kembalikan jumlah aktif (non-kedaluwarsa).
function addWarn(groupJid, userJid, reason) {
  const db = load();
  const g = String(groupJid);
  const u = String(userJid);
  if (!db.warns[g] || typeof db.warns[g] !== 'object') db.warns[g] = {};
  const list = freshWarns(db.warns[g][u]);
  list.push({ reason: String(reason || 'tanpa alasan').slice(0, 200), at: Date.now() });
  db.warns[g][u] = list;
  save();
  return list.length;
}

// Hapus 1 warn terbaru, kembalikan sisa aktif.
function popWarn(groupJid, userJid) {
  const db = load();
  const g = String(groupJid);
  const u = String(userJid);
  const list = freshWarns(db.warns[g]?.[u]);
  list.pop();
  if (db.warns[g]) {
    if (list.length) db.warns[g][u] = list;
    else delete db.warns[g][u];
  }
  save();
  return list.length;
}

function clearWarns(groupJid, userJid) {
  const db = load();
  const g = String(groupJid);
  const u = String(userJid);
  if (db.warns[g]) delete db.warns[g][u];
  save();
}

function getWarns(groupJid, userJid) {
  const db = load();
  return freshWarns(db.warns[String(groupJid)]?.[String(userJid)]);
}

function getAllWarns(groupJid) {
  const db = load();
  const grp = db.warns[String(groupJid)] || {};
  const out = {};
  for (const [u, list] of Object.entries(grp)) {
    const fresh = freshWarns(list);
    if (fresh.length) out[u] = fresh;
  }
  return out;
}

// Dipakai scheduler tiap 10 menit. Kembalikan jumlah warn kedaluwarsa yang dibuang.
function cleanupExpiredWarns(maxAgeMs = WARN_EXPIRE_MS) {
  const db = load();
  const now = Date.now();
  const maxAge = Number(maxAgeMs) > 0 ? Number(maxAgeMs) : WARN_EXPIRE_MS;
  let removed = 0;
  let changed = false;
  for (const g of Object.keys(db.warns || {})) {
    const grp = db.warns[g];
    if (!grp || typeof grp !== 'object') { delete db.warns[g]; changed = true; continue; }
    for (const u of Object.keys(grp)) {
      const list = Array.isArray(grp[u]) ? grp[u] : [];
      const fresh = list.filter((w) => w && Number(w.at) > 0 && now - Number(w.at) < maxAge);
      removed += list.length - fresh.length;
      if (fresh.length !== list.length) changed = true;
      if (fresh.length) grp[u] = fresh;
      else delete grp[u];
    }
    if (!Object.keys(grp).length) { delete db.warns[g]; changed = true; }
  }
  if (changed) save();
  return removed;
}

module.exports = {
  STORE_FILE,
  MAX_WARNS,
  WARN_EXPIRE_MS,
  load,
  getGroup,
  setGroup,
  isAntiFloodOn,
  isAntiLinkOn,
  isMuteOn,
  addWarn,
  popWarn,
  clearWarns,
  getWarns,
  getAllWarns,
  cleanupExpiredWarns,
};
