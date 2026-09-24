// src/storage/sqlite.js — Fase 4 OPSIONAL (SQLite adapter, default NONAKTIF).
// CommonJS. WAJIB toleran-gagal: kalau `better-sqlite3` belum diinstall,
// modul ini TIDAK boleh crash — fallback ke JSON (lib/systems.js + database/*.json)
// + console.warn sekali, dan `available === false`.
//
// Aktif hanya bila dipanggil via src/storage/index.js dengan DB_BACKEND=sqlite.
// Commands Fase 1-3 TIDAK diubah: adapter ini standalone, dipakai eksplisit.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE =
  process.env.SQLITE_FILE || process.env.DB_FILE || process.env.SQLITE_PATH ||
  path.join(DATA_DIR, 'bot.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

// ---- require toleran-gagal (JANGAN crash bila native module belum ada) ----
let Database = null;
let loadError = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  Database = require('better-sqlite3');
} catch (e) {
  loadError = e;
  Database = null;
}

let warnedOnce = false;
function warnFallback(reason) {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(
    '[storage/sqlite] better-sqlite3 tidak tersedia, fallback ke JSON ' +
      '(perilaku seperti sekarang, tanpa crash). ' +
      'Untuk mengaktifkan SQLite: npm i better-sqlite3 lalu DB_BACKEND=sqlite. ' +
      `(${reason || (loadError && loadError.message) || 'module not found'})`
  );
}

// ---- JSON fallback (delegasi 1:1 ke storage existing, tanpa ubah logic) ----
function jsonFallback() {
  warnFallback();
  const systems = require('../../lib/systems');
  let groupStore = null;
  try {
    // eslint-disable-next-line global-require
    groupStore = require('../extensions/safety/group-store');
  } catch {
    groupStore = null;
  }
  return {
    backend: 'json-fallback',
    available: false,
    isAvailable: () => false,
    db: null,
    dbFile: DB_FILE,
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

const MINE_COOLDOWN_MS = 5 * 60 * 1000;

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function buildSqliteAdapter(db) {
  function ensureUser(id) {
    const k = String(id || '').trim();
    if (!k) return null;
    db.prepare(
      'INSERT INTO users (id, xp, level, balance, bank, bank_limit, last_mine, last_daily, last_fish, last_work, updated_at) ' +
        'VALUES (?, 0, 1, 0, 0, 10000, 0, 0, 0, 0, ?) ON CONFLICT(id) DO NOTHING'
    ).run(k, Date.now());
    return k;
  }

  function rowUser(id) {
    const k = String(id || '').trim();
    if (!k) return { xp: 0, level: 1, balance: 0, bank: 0, bank_limit: 10000, last_mine: 0, last_daily: 0, last_fish: 0, last_work: 0 };
    ensureUser(k);
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(k) || {};
    return {
      xp: num(r.xp, 0),
      level: num(r.level, 1),
      balance: num(r.balance, 0),
      bank: num(r.bank, 0),
      bank_limit: num(r.bank_limit, 10000),
      last_mine: num(r.last_mine, 0),
      last_daily: num(r.last_daily, 0),
      last_fish: num(r.last_fish, 0),
      last_work: num(r.last_work, 0),
    };
  }

  function requiredXp(level) {
    return Math.max(100, num(level, 1) * 100);
  }

  return {
    backend: 'sqlite',
    available: true,
    isAvailable: () => true,
    db,
    dbFile: DB_FILE,

    // ---- wallet ----
    getBalance(id) {
      return rowUser(id).balance;
    },
    addBalance(id, amount) {
      const k = ensureUser(id);
      if (!k) return 0;
      const cur = rowUser(k).balance + Math.floor(num(amount, 0));
      db.prepare('UPDATE users SET balance = ?, updated_at = ? WHERE id = ?').run(cur, Date.now(), k);
      return cur;
    },
    transfer(from, to, amount) {
      const f = String(from || '').trim();
      const t = String(to || '').trim();
      const amt = Math.floor(num(amount, 0));
      if (!f || !t) return { ok: false, msg: '❌ Tujuan tidak valid.' };
      if (f === t) return { ok: false, msg: '❌ Tidak bisa transfer ke diri sendiri.' };
      if (!Number.isFinite(amt) || amt <= 0) return { ok: false, msg: '❌ Nominal harus angka > 0.' };
      const bal = rowUser(f).balance;
      if (bal < amt) return { ok: false, msg: `❌ Saldo kurang (punya ${bal}).` };
      const trx = db.transaction(() => {
        ensureUser(f);
        ensureUser(t);
        db.prepare('UPDATE users SET balance = balance - ?, updated_at = ? WHERE id = ?').run(amt, Date.now(), f);
        db.prepare('UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?').run(amt, Date.now(), t);
      });
      trx();
      return { ok: true, msg: `✅ Transfer ${amt} ke @${t.split('@')[0]} berhasil.` };
    },
    mine(id) {
      const k = ensureUser(id);
      if (!k) return { ok: false, msg: '❌ ID tidak valid.' };
      const now = Date.now();
      const last = rowUser(k).last_mine;
      const wait = MINE_COOLDOWN_MS - (now - last);
      if (wait > 0) {
        return { ok: false, msg: `⛏️ Capek! Tunggu ~${Math.ceil(wait / 60000)} menit lagi.`, cooldownMs: wait };
      }
      const reward = 50 + Math.floor(Math.random() * 151);
      db.prepare('UPDATE users SET balance = balance + ?, last_mine = ?, updated_at = ? WHERE id = ?')
        .run(reward, now, now, k);
      return { ok: true, reward, balance: rowUser(k).balance };
    },

    // ---- level ----
    getLevel(id) {
      const u = rowUser(id);
      return { xp: u.xp, level: u.level };
    },
    addXp(id, amount) {
      const k = ensureUser(id);
      if (!k) return { xp: 0, level: 1, leveledUp: false };
      const gain = Number.isFinite(Number(amount)) ? Math.max(1, Math.floor(Number(amount))) : 5;
      const u = rowUser(k);
      let xp = u.xp;
      let level = u.level;
      xp += gain;
      let leveledUp = false;
      while (xp >= requiredXp(level)) {
        xp -= requiredXp(level);
        level += 1;
        leveledUp = true;
      }
      db.prepare('UPDATE users SET xp = ?, level = ?, updated_at = ? WHERE id = ?').run(xp, level, Date.now(), k);
      return { xp, level, leveledUp };
    },
    leaderboard(topN) {
      const n = Math.max(1, Math.min(25, num(topN, 10)));
      return db.prepare('SELECT id, xp, level FROM users ORDER BY level DESC, xp DESC LIMIT ?').all(n);
    },

    // ---- cooldown generik (key = kind:user) ----
    getCooldown(userId, kind) {
      const key = `${String(kind || 'generic')}:${String(userId || '')}`;
      const r = db.prepare('SELECT last_at FROM cooldowns WHERE key = ?').get(key);
      return num(r && r.last_at, 0);
    },
    setCooldown(userId, kind, at) {
      const key = `${String(kind || 'generic')}:${String(userId || '')}`;
      const ts = num(at !== undefined && at !== null ? at : Date.now(), 0);
      db.prepare(
        'INSERT INTO cooldowns (key, user_id, kind, last_at) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(key) DO UPDATE SET last_at = excluded.last_at'
      ).run(key, String(userId || ''), String(kind || 'generic'), ts);
      return ts;
    },

    // ---- groups ----
    getGroup(jid) {
      const k = String(jid || '').trim();
      db.prepare(
        'INSERT INTO groups (id, antiflood, antilink, mute, updated_at) VALUES (?, 0, 0, 0, ?) ON CONFLICT(id) DO NOTHING'
      ).run(k, Date.now());
      const r = db.prepare('SELECT * FROM groups WHERE id = ?').get(k) || {};
      return { antiflood: Boolean(r.antiflood), antilink: Boolean(r.antilink), mute: Boolean(r.mute) };
    },
    setGroup(jid, patch) {
      const cur = this.getGroup(jid);
      const next = { antiflood: cur.antiflood, antilink: cur.antilink, mute: cur.mute };
      const keys = ['antiflood', 'antilink', 'mute'];
      for (const kk of keys) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, kk)) next[kk] = Boolean(patch[kk]);
      }
      db.prepare('UPDATE groups SET antiflood = ?, antilink = ?, mute = ?, updated_at = ? WHERE id = ?')
        .run(next.antiflood ? 1 : 0, next.antilink ? 1 : 0, next.mute ? 1 : 0, Date.now(), String(jid));
      return next;
    },

    // ---- warns ----
    addWarn(groupJid, userJid, reason) {
      db.prepare('INSERT INTO warns (group_id, user_id, reason, at) VALUES (?, ?, ?, ?)')
        .run(String(groupJid), String(userJid), String(reason || 'tanpa alasan').slice(0, 200), Date.now());
      const r = db.prepare('SELECT COUNT(*) AS c FROM warns WHERE group_id = ? AND user_id = ?')
        .get(String(groupJid), String(userJid));
      return num(r && r.c, 1);
    },
    getWarns(groupJid, userJid) {
      return db.prepare('SELECT reason, at FROM warns WHERE group_id = ? AND user_id = ? ORDER BY at ASC')
        .all(String(groupJid), String(userJid));
    },
    clearWarns(groupJid, userJid) {
      db.prepare('DELETE FROM warns WHERE group_id = ? AND user_id = ?').run(String(groupJid), String(userJid));
    },

    // ---- quests ----
    getQuests(userId) {
      return db.prepare('SELECT quest_id, claimed, at FROM quests WHERE user_id = ?').all(String(userId || ''));
    },
    setQuestClaimed(userId, questId) {
      db.prepare(
        'INSERT INTO quests (user_id, quest_id, claimed, at) VALUES (?, ?, 1, ?) ' +
          'ON CONFLICT(user_id, quest_id) DO UPDATE SET claimed = 1, at = excluded.at'
      ).run(String(userId || ''), String(questId), Date.now());
    },

    // ---- impor sekali jalan (dipakai scripts/migrate-json-to-sqlite.js) ----
    importUser(id, f) {
      const k = ensureUser(id);
      if (!k) return;
      const cur = rowUser(k);
      const src = f && typeof f === 'object' ? f : {};
      const pick = (names, fb) => {
        for (const n of names) {
          if (src[n] !== undefined && src[n] !== null) return num(src[n], fb);
        }
        return fb;
      };
      const next = {
        xp: pick(['xp'], cur.xp),
        level: pick(['level'], cur.level),
        balance: pick(['balance'], cur.balance),
        bank: pick(['bank'], cur.bank),
        bank_limit: pick(['bank_limit', 'bankLimit'], cur.bank_limit),
        last_mine: pick(['lastMine', 'last_mine'], cur.last_mine),
        last_daily: pick(['lastDaily', 'last_daily'], cur.last_daily),
        last_fish: pick(['lastFish', 'last_fish'], cur.last_fish),
        last_work: pick(['lastWork', 'last_work'], cur.last_work),
      };
      db.prepare(
        'UPDATE users SET xp = ?, level = ?, balance = ?, bank = ?, bank_limit = ?, ' +
          'last_mine = ?, last_daily = ?, last_fish = ?, last_work = ?, updated_at = ? WHERE id = ?'
      ).run(
        next.xp, next.level, next.balance, next.bank, next.bank_limit,
        next.last_mine, next.last_daily, next.last_fish, next.last_work, Date.now(), k
      );
    },
    importLimit(userId, date, used) {
      db.prepare(
        'INSERT INTO limits (user_id, date, used) VALUES (?, ?, ?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET date = excluded.date, used = excluded.used'
      ).run(String(userId || ''), String(date || ''), num(used, 0));
    },

    close() {
      try { db.close(); } catch { /* abaikan */ }
    },
  };
}

function initSqlite() {
  if (!Database) return jsonFallback();
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
    db.exec(schema);
    return buildSqliteAdapter(db);
  } catch (e) {
    console.warn('[storage/sqlite] gagal membuka data/bot.db, fallback ke JSON:', (e && e.message) || e);
    return jsonFallback();
  }
}

// Catatan: modul ini TIDAK auto-init saat DB_BACKEND=json.
// src/storage/index.js yang memutuskan kapan init dipanggil.
// Di sini kita init langsung karena file ini hanya di-require dari jalur sqlite.
module.exports = initSqlite();
