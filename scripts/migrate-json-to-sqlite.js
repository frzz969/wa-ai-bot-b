// scripts/migrate-json-to-sqlite.js — Fase 4 OPSIONAL, sekali jalan (CJS).
// Menyalin level/wallet/group/quest (+limit) dari database/*.json -> data/bot.db (SQLite)
// + backup database/ ke database/backup-YYYYMMDD/ SEBELUM menulis DB.
//
// Cara pakai:
//   npm i better-sqlite3
//   DB_BACKEND=sqlite node scripts/migrate-json-to-sqlite.js
// Aman dijalankan ulang (idempoten: INSERT ... ON CONFLICT DO UPDATE).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_DIR = path.join(ROOT, 'database');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE =
  process.env.SQLITE_FILE || process.env.DB_FILE || process.env.SQLITE_PATH ||
  path.join(DATA_DIR, 'bot.db');

function stamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? d : null;
  } catch (e) {
    console.warn(`[migrate] lewati ${path.basename(file)} (bukan JSON valid):`, e?.message || e);
    return null;
  }
}

function backup() {
  const dir = path.join(DB_DIR, `backup-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(DB_DIR, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    try {
      fs.copyFileSync(path.join(DB_DIR, e.name), path.join(dir, e.name));
      n += 1;
    } catch (err) {
      console.warn(`[migrate] gagal backup ${e.name}:`, err?.message || err);
    }
  }
  console.log(`[migrate] backup ${n} file JSON -> ${path.relative(ROOT, dir)}/`);
  return dir;
}

async function main() {
  console.log('[migrate] JSON -> SQLite (sekali jalan)');
  console.log(`[migrate] sumber : ${path.relative(ROOT, DB_DIR)}/`);
  console.log(`[migrate] tujuan : ${path.relative(ROOT, DB_FILE)}`);

  // 1) Backup dulu (tanpa better-sqlite3 pun backup tetap jalan).
  backup();

  // 2) better-sqlite3 wajib ada untuk menulis bot.db.
  try {
    require.resolve('better-sqlite3');
  } catch {
    console.error('[migrate] GAGAL: better-sqlite3 belum terinstall.');
    console.error('[migrate] Jalankan: npm i better-sqlite3');
    console.error('[migrate] Lalu ulangi: DB_BACKEND=sqlite node scripts/migrate-json-to-sqlite.js');
    process.exitCode = 1;
    return;
  }

  // 3) Init adapter SQLite (buat data/bot.db + schema bila belum ada).
  const sqlite = require('../src/storage/sqlite');
  if (!sqlite || sqlite.available !== true) {
    console.error('[migrate] GAGAL: sqlite adapter fallback ke JSON (cek permission folder data/).');
    process.exitCode = 1;
    return;
  }

  const counts = { users: 0, limits: 0, groups: 0, warns: 0, quests: 0 };

  // 4a) level.json { jid: { xp, level } } + wallet.json
  // wallet shape: { jid: { balance, bank, bank_limit, lastMine, lastDaily, lastFish, lastWork } }
  const level = readJson(path.join(DB_DIR, 'level.json')) || {};
  const wallet = readJson(path.join(DB_DIR, 'wallet.json')) || {};
  const limit = readJson(path.join(DB_DIR, 'limit.json')) || {};
  const quest = readJson(path.join(DB_DIR, 'quest.json')) || {};
  const group = readJson(path.join(DB_DIR, 'group.json')) || null;

  const ids = new Set([...Object.keys(level), ...Object.keys(wallet)]);
  for (const id of ids) {
    const lv = level[id] && typeof level[id] === 'object' ? level[id] : {};
    const w = wallet[id] && typeof wallet[id] === 'object' ? wallet[id] : {};
    const cash = typeof w === 'object' ? w : { balance: Number(w) || 0 };
    sqlite.importUser(id, {
      xp: Number(lv.xp || 0),
      level: Number(lv.level || 1),
      balance: Number(cash.balance || 0),
      bank: Number(cash.bank || 0),
      bank_limit: Number(cash.bank_limit ?? cash.bankLimit ?? 10000),
      lastMine: Number(cash.lastMine || 0),
      lastDaily: Number(cash.lastDaily || 0),
      lastFish: Number(cash.lastFish || 0),
      lastWork: Number(cash.lastWork || 0),
    });
    counts.users += 1;
  }

  // 4b) limit.json { jid: { date, used } }
  for (const [uid, e] of Object.entries(limit)) {
    if (!e || typeof e !== 'object') continue;
    sqlite.importLimit(uid, String(e.date || ''), Number(e.used || 0));
    counts.limits += 1;
  }

  // 4c) group.json { groups: { jid: { antiflood, antilink, mute } }, warns: { g: { u: [{ reason, at }] } } }
  if (group) {
    const groups = group.groups && typeof group.groups === 'object' ? group.groups : {};
    for (const [gid, g] of Object.entries(groups)) {
      sqlite.setGroup(gid, {
        antiflood: Boolean(g && g.antiflood),
        antilink: Boolean(g && g.antilink),
        mute: Boolean(g && g.mute),
      });
      counts.groups += 1;
    }
    const warns = group.warns && typeof group.warns === 'object' ? group.warns : {};
    const db = sqlite.db;
    const stmt = db.prepare(
      'INSERT INTO warns (group_id, user_id, reason, at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(group_id, user_id, at) DO NOTHING'
    );
    const trx = db.transaction(() => {
      for (const [gid, users] of Object.entries(warns)) {
        if (!users || typeof users !== 'object') continue;
        for (const [uid, list] of Object.entries(users)) {
          if (!Array.isArray(list)) continue;
          for (const w of list) {
            stmt.run(String(gid), String(uid), String((w && w.reason) || 'tanpa alasan').slice(0, 200), Number((w && w.at) || 0));
            counts.warns += 1;
          }
        }
      }
    });
    trx();
  } else {
    console.log('[migrate] database/group.json tidak ada -> lewati groups/warns.');
  }

  // 4d) quest.json { jid: { questId: { claimed, at } } }
  {
    const db = sqlite.db;
    const stmt = db.prepare(
      'INSERT INTO quests (user_id, quest_id, claimed, at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(user_id, quest_id) DO UPDATE SET claimed = excluded.claimed, at = excluded.at'
    );
    const trx = db.transaction(() => {
      for (const [uid, qs] of Object.entries(quest)) {
        if (!qs || typeof qs !== 'object') continue;
        for (const [qid, q] of Object.entries(qs)) {
          const claimed = q && typeof q === 'object' ? (q.claimed !== false ? 1 : 0) : 1;
          const at = q && typeof q === 'object' ? Number(q.at || 0) : 0;
          stmt.run(String(uid), String(qid), claimed, at);
          counts.quests += 1;
        }
      }
    });
    trx();
  }

  if (typeof sqlite.close === 'function') sqlite.close();

  console.log(
    `[migrate] SELESAI: users=${counts.users} limits=${counts.limits} ` +
      `groups=${counts.groups} warns=${counts.warns} quests=${counts.quests}`
  );
  console.log('[migrate] Aktifkan dengan: DB_BACKEND=sqlite (di .env), pastikan npm i better-sqlite3 sudah dijalankan.');
}

main().catch((e) => {
  console.error('[migrate] FATAL:', (e && e.message) || e);
  process.exitCode = 1;
});
