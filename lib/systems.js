// lib/systems.js — LANE GRUP: leveling, limit, dompet, afk, welcome, antilink, badword.
// Storage file-flat JSON di database/ (dibuat bila belum ada). Tanpa DB server.
// CommonJS. Semua fungsi sync kecuali yang dinyatakan.

const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'database');

const FILES = {
  level: path.join(DB_DIR, 'level.json'),
  limit: path.join(DB_DIR, 'limit.json'),
  wallet: path.join(DB_DIR, 'wallet.json'),
  afk: path.join(DB_DIR, 'afk.json'),
  welcome: path.join(DB_DIR, 'welcome.json'),
  antilink: path.join(DB_DIR, 'antilink.json'),
  badword: path.join(DB_DIR, 'badword.json'),
};

const DEFAULT_LIMIT = 25;
const MINE_COOLDOWN_MS = 5 * 60 * 1000;

function ensureDir() {
  try {
    fs.mkdirSync(DB_DIR, { recursive: true });
  } catch { /* abaikan */ }
}

function loadJson(file, fallback) {
  ensureDir();
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return structuredCloneSafe(fallback);
    }
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return structuredCloneSafe(fallback);
    return JSON.parse(raw);
  } catch {
    return structuredCloneSafe(fallback);
  }
}

function saveJson(file, data) {
  ensureDir();
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch { /* abaikan */ }
}

function structuredCloneSafe(v) {
  return JSON.parse(JSON.stringify(v));
}

function todayStr() {
  // Tanggal lokal YYYY-MM-DD untuk reset limit harian.
  try {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function keyOf(id) {
  return String(id || '').trim();
}

// ================= LEVELING (XP/level/leaderboard) =================
// Pola modern dari leveling lama akirabot (array {id,xp,level} -> map agar O(1)).
// Naik level bila xp >= level * 100 (level mulai 1).
function readLevel() {
  const d = loadJson(FILES.level, {});
  return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
}

function requiredXp(level) {
  return Math.max(100, Number(level || 1) * 100);
}

function getLevel(id) {
  const db = readLevel();
  const k = keyOf(id);
  const e = db[k] || { xp: 0, level: 1 };
  return { xp: Number(e.xp || 0), level: Number(e.level || 1) };
}

function addXp(id, amount) {
  const k = keyOf(id);
  if (!k) return { xp: 0, level: 1, leveledUp: false };
  const gain = Number.isFinite(Number(amount)) ? Math.max(1, Math.floor(Number(amount))) : 5;
  const db = readLevel();
  const cur = db[k] || { xp: 0, level: 1 };
  cur.xp = Number(cur.xp || 0) + gain;
  cur.level = Number(cur.level || 1);
  let leveledUp = false;
  while (cur.xp >= requiredXp(cur.level)) {
    cur.xp -= requiredXp(cur.level);
    cur.level += 1;
    leveledUp = true;
  }
  db[k] = cur;
  saveJson(FILES.level, db);
  return { xp: cur.xp, level: cur.level, leveledUp };
}

function leaderboard(topN) {
  const n = Math.max(1, Math.min(25, Number(topN || 10)));
  const db = readLevel();
  return Object.entries(db)
    .map(([id, v]) => ({ id, xp: Number(v?.xp || 0), level: Number(v?.level || 1) }))
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, n);
}

function leaderboardText(topN) {
  const list = leaderboard(topN);
  if (!list.length) return '🏆 Belum ada data level. Chat dulu biar dapat XP!';
  return '🏆 *LEADERBOARD LEVEL*\n' + list
    .map((e, i) => `${i + 1}. @${String(e.id).split('@')[0]} — Lv.${e.level} (${e.xp} XP)`)
    .join('\n');
}

// ================= LIMIT HARIAN (reset per tanggal) =================
function readLimit() {
  const d = loadJson(FILES.limit, {});
  return (d && typeof d === 'object') ? d : {};
}

// { date, used } per user. Ganti hari -> used reset 0.
function getLimit(id, max) {
  const mx = Number(max || DEFAULT_LIMIT);
  const db = readLimit();
  const k = keyOf(id);
  const t = todayStr();
  const e = db[k];
  if (!e || e.date !== t) return { date: t, used: 0, remaining: mx, max: mx };
  const used = Number(e.used || 0);
  return { date: t, used, remaining: Math.max(0, mx - used), max: mx };
}

function useLimit(id, cost, max) {
  const c = Math.max(1, Math.floor(Number(cost || 1)));
  const mx = Number(max || DEFAULT_LIMIT);
  const k = keyOf(id);
  if (!k) return { ok: false, remaining: 0 };
  const db = readLimit();
  const t = todayStr();
  const e = db[k] && db[k].date === t ? db[k] : { date: t, used: 0 };
  if (Number(e.used || 0) + c > mx) return { ok: false, remaining: Math.max(0, mx - Number(e.used || 0)), max: mx };
  e.used = Number(e.used || 0) + c;
  e.date = t;
  db[k] = e;
  saveJson(FILES.limit, db);
  return { ok: true, remaining: Math.max(0, mx - e.used), max: mx };
}

// ================= DOMPET / TRANSFER / MINING =================
function readWallet() {
  const d = loadJson(FILES.wallet, {});
  return (d && typeof d === 'object') ? d : {};
}

function getBalance(id) {
  const db = readWallet();
  return Number(db[keyOf(id)]?.balance || 0);
}

function addBalance(id, amount) {
  const k = keyOf(id);
  if (!k) return 0;
  const db = readWallet();
  const cur = Number(db[k]?.balance || 0) + Math.floor(Number(amount || 0));
  db[k] = { balance: cur, lastMine: Number(db[k]?.lastMine || 0) };
  saveJson(FILES.wallet, db);
  return cur;
}

function transfer(from, to, amount) {
  const f = keyOf(from);
  const t = keyOf(to);
  const amt = Math.floor(Number(amount || 0));
  if (!f || !t) return { ok: false, msg: '❌ Tujuan tidak valid.' };
  if (f === t) return { ok: false, msg: '❌ Tidak bisa transfer ke diri sendiri.' };
  if (!Number.isFinite(amt) || amt <= 0) return { ok: false, msg: '❌ Nominal harus angka > 0.' };
  const db = readWallet();
  const bal = Number(db[f]?.balance || 0);
  if (bal < amt) return { ok: false, msg: `❌ Saldo kurang (punya ${bal}).` };
  db[f] = { balance: bal - amt, lastMine: Number(db[f]?.lastMine || 0) };
  db[t] = { balance: Number(db[t]?.balance || 0) + amt, lastMine: Number(db[t]?.lastMine || 0) };
  saveJson(FILES.wallet, db);
  return { ok: true, msg: `✅ Transfer ${amt} ke @${t.split('@')[0]} berhasil.` };
}

function mine(id) {
  const k = keyOf(id);
  if (!k) return { ok: false, msg: '❌ ID tidak valid.' };
  const db = readWallet();
  const now = Date.now();
  const last = Number(db[k]?.lastMine || 0);
  const wait = MINE_COOLDOWN_MS - (now - last);
  if (wait > 0) {
    const mins = Math.ceil(wait / 60000);
    return { ok: false, msg: `⛏️ Capek! Tunggu ~${mins} menit lagi.`, cooldownMs: wait };
  }
  const reward = 50 + Math.floor(Math.random() * 151); // 50..200
  db[k] = { balance: Number(db[k]?.balance || 0) + reward, lastMine: now };
  saveJson(FILES.wallet, db);
  return { ok: true, reward, balance: db[k].balance };
}

// ================= AFK =================
function readAfk() {
  const d = loadJson(FILES.afk, {});
  return (d && typeof d === 'object') ? d : {};
}

function setAfk(id, reason) {
  const k = keyOf(id);
  if (!k) return null;
  const db = readAfk();
  db[k] = { reason: String(reason || 'AFK').slice(0, 200), since: Date.now() };
  saveJson(FILES.afk, db);
  return db[k];
}

function clearAfk(id) {
  const k = keyOf(id);
  const db = readAfk();
  const had = Boolean(db[k]);
  delete db[k];
  saveJson(FILES.afk, db);
  return had;
}

function getAfk(id) {
  const db = readAfk();
  return db[keyOf(id)] || null;
}

// Cek daftar mention -> kembalikan yang sedang AFK (untuk auto-notify).
function checkAfk(mentionedJids) {
  const arr = Array.isArray(mentionedJids) ? mentionedJids : [];
  if (!arr.length) return [];
  const db = readAfk();
  const out = [];
  for (const j of arr) {
    const e = db[keyOf(j)];
    if (e) out.push({ id: String(j), reason: e.reason, since: e.since });
  }
  return out;
}

// ================= WELCOME ON/OFF =================
function readStrArray(file) {
  const d = loadJson(file, []);
  return Array.isArray(d) ? d.map(String) : [];
}

function welcomeOn(groupId) {
  const g = keyOf(groupId);
  const list = readStrArray(FILES.welcome);
  if (g && !list.includes(g)) {
    list.push(g);
    saveJson(FILES.welcome, list);
  }
  return true;
}

function welcomeOff(groupId) {
  const g = keyOf(groupId);
  const list = readStrArray(FILES.welcome).filter((x) => x !== g);
  saveJson(FILES.welcome, list);
  return true;
}

function isWelcomeOn(groupId) {
  return readStrArray(FILES.welcome).includes(keyOf(groupId));
}

// ================= ANTILINK ON/OFF =================
function antilinkOn(groupId) {
  const g = keyOf(groupId);
  const list = readStrArray(FILES.antilink);
  if (g && !list.includes(g)) {
    list.push(g);
    saveJson(FILES.antilink, list);
  }
  return true;
}

function antilinkOff(groupId) {
  const g = keyOf(groupId);
  const list = readStrArray(FILES.antilink).filter((x) => x !== g);
  saveJson(FILES.antilink, list);
  return true;
}

function isAntilinkOn(groupId) {
  return readStrArray(FILES.antilink).includes(keyOf(groupId));
}

// Deteksi link invite grup WA di teks chat.
function containsInviteLink(text) {
  const s = String(text || '');
  return /chat\.whatsapp\.com\/[A-Za-z0-9]+/i.test(s) ||
    /whatsapp\.com\/channel\//i.test(s) ||
    /t\.me\/\S+/i.test(s) && /chat\.whatsapp\.com/i.test(s);
}

// ================= BADWORD add/del/list + auto-delete =================
function listBadword() {
  return readStrArray(FILES.badword);
}

function addBadword(word) {
  const w = String(word || '').trim().toLowerCase();
  if (!w) return { ok: false, msg: '❌ Kata kosong.' };
  const list = listBadword();
  if (list.includes(w)) return { ok: false, msg: '❌ Kata sudah ada.' };
  list.push(w);
  saveJson(FILES.badword, list);
  return { ok: true, msg: `✅ "${w}" ditambahkan.` };
}

function removeBadword(word) {
  const w = String(word || '').trim().toLowerCase();
  const list = listBadword().filter((x) => x !== w);
  saveJson(FILES.badword, list);
  return { ok: true, msg: `✅ "${w}" dihapus.` };
}

// Kembalikan kata kasar yang cocok (atau null). Pencocokan case-insensitive, whole-word.
function containsBadword(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  const list = listBadword();
  for (const w of list) {
    if (!w) continue;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      if (new RegExp(`(^|\\W)${esc}(\\W|$)`, 'i').test(s)) return w;
    } catch {
      if (s.includes(w)) return w;
    }
  }
  return null;
}

module.exports = {
  DB_DIR,
  FILES,
  DEFAULT_LIMIT,
  MINE_COOLDOWN_MS,
  // leveling
  requiredXp,
  getLevel,
  addXp,
  leaderboard,
  leaderboardText,
  // limit
  todayStr,
  getLimit,
  useLimit,
  // wallet
  getBalance,
  addBalance,
  transfer,
  mine,
  // afk
  setAfk,
  clearAfk,
  getAfk,
  checkAfk,
  // welcome
  welcomeOn,
  welcomeOff,
  isWelcomeOn,
  // antilink
  antilinkOn,
  antilinkOff,
  isAntilinkOn,
  containsInviteLink,
  // badword
  listBadword,
  addBadword,
  removeBadword,
  containsBadword,
};
