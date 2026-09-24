-- src/storage/schema.sql — Fase 4 OPSIONAL (SQLite, default NONAKTIF).
-- Dipakai hanya bila DB_BACKEND=sqlite. DB file: data/bot.db
-- Tabel mencakup: users (level + wallet), cooldowns, groups (+ warns, quests, limits).
-- Idempoten: semua CREATE TABLE IF NOT EXISTS agar aman dijalankan ulang.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  balance INTEGER NOT NULL DEFAULT 0,
  bank INTEGER NOT NULL DEFAULT 0,
  bank_limit INTEGER NOT NULL DEFAULT 10000,
  last_mine INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  last_fish INTEGER NOT NULL DEFAULT 0,
  last_work INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Cooldown generik per user+kind (cadangan bila ada cooldown baru).
-- key = kind + ':' + user_id, mis. "daily:628xx@s.whatsapp.net".
CREATE TABLE IF NOT EXISTS cooldowns (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  last_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cooldowns_user ON cooldowns(user_id);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  antiflood INTEGER NOT NULL DEFAULT 0,
  antilink INTEGER NOT NULL DEFAULT 0,
  mute INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warns (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id, at)
);
CREATE INDEX IF NOT EXISTS idx_warns_group_user ON warns(group_id, user_id);

CREATE TABLE IF NOT EXISTS quests (
  user_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 1,
  at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, quest_id)
);
CREATE INDEX IF NOT EXISTS idx_quests_user ON quests(user_id);

-- Limit harian per user (cerminan database/limit.json { date, used }).
CREATE TABLE IF NOT EXISTS limits (
  user_id TEXT PRIMARY KEY,
  date TEXT NOT NULL DEFAULT '',
  used INTEGER NOT NULL DEFAULT 0
);
