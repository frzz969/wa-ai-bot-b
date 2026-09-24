# Storage — Fase 4 OPSIONAL (SQLite, default NONAKTIF)

Default bot memakai JSON (`lib/systems.js` + `database/*.json`).
SQLite hanya dipakai bila diminta eksplisit. Commands Fase 1–3 tidak berubah.

## Aktifkan SQLite (opsional)

```bash
npm i better-sqlite3
# di .env (atau environment):
# DB_BACKEND=sqlite
DB_BACKEND=sqlite node scripts/migrate-json-to-sqlite.js
```

Script migrasi: backup `database/*.json` → `database/backup-YYYYMMDD/`,
lalu salin level/wallet/group/quest (+limit) → `data/bot.db`.

Tanpa `better-sqlite3`, adapter otomatis fallback ke JSON + warn (tidak crash).
Untuk kembali ke JSON: hapus/kosongkan `DB_BACKEND` (atau `DB_BACKEND=json`).

## File

- `schema.sql` — tabel `users` (level+wallet), `cooldowns`, `groups` (+`warns`, `quests`, `limits`).
- `sqlite.js` — adapter SQLite, `require('better-sqlite3')` toleran-gagal.
- `index.js` — pemilih backend: `DB_BACKEND=json` (default) vs `sqlite`.
