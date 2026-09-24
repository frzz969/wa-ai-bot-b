# WA AI Bot B 🤖

Bot WhatsApp modular (Baileys) — AI Gemini + Groq, downloader, economy & RPG **tanpa judi**, anti-spam, game arcade. 100% gratis, tanpa premium/sewa.

## ✨ Fitur

| Kategori | Command |
|---|---|
| AI | `.ai` (teks+vision, memory 10), `.talk/.curhat`, `.ask` (RAG dokumen), `.explain/.summarize/.rewrite/.translate/.ideas`, `.ocr/.describe/.analyze`, `.img/.brat`, `.vn` + auto-transkrip VN |
| Grup admin | `.tagall/.hidetag/.kick/.add/.promote/.demote/.linkgc/.group/.setname/.setdesc/.infogc`, `.welcome on/off` |
| Moderasi | `.antilink`, badword auto-delete, `.warn/.unwarn/.cekwarn` (3x auto-kick), `.groupset antiflood/antilink/mute` |
| Economy (aman, no judi) | `.daily`, `.work`, `.bank`, `.balance/.dompet`, `.transfer` |
| RPG (teks, no judi) | `.fish/.mine`, `.quest`, `.profile/.leaderboard`, `.heal` |
| Downloader | `.play/.ytmp3/.ytmp4/.tiktok/.fbdl/.igdl` (limit 25/hari) |
| Util & info | `.menu/.ping/.status`, `.jadwalsholat/.quran/.gempa/.lirik/.shortlink/.kbbi`, `.qr/.calc/.ssweb/.nulis`, truth/dare/pantun/fakta |
| Media | `.stickerwm/.toimg/.attp/.ttp/.triggered/.emoji`, TTS, file PDF/DOCX auto-ringkas |
| Game arcade | `.dash` (SPEEDY DASH v4, HTML5 offline) |
| Owner | `.run` (sandbox, owner only) |

> ❌ Yang **sengaja tidak dipasang**: `slots/roulette/coinflip/crime/lootbox/rob` (unsur judi).

## 🛠️ Syarat

- Node.js >= 18
- `ffmpeg` + `yt-dlp` (wajib untuk downloader/stiker)
- API key gratis: [Gemini](https://aistudio.google.com) + [Groq](https://console.groq.com)

## 🚀 Instal (Laptop/PC)

```bash
git clone <repo-mu>
cd wa-ai-bot-b
npm install
cp .env.example .env
# isi .env (lihat bawah)
npm start
```

## 📱 Instal (Termux HP)

```bash
pkg update && pkg install nodejs git ffmpeg python
pip install yt-dlp
git clone <repo-mu>
cd wa-ai-bot-b
npm install
cp .env.example .env
# isi .env pakai nano:
nano .env
npm start
```

### 🩹 Khusus Termux: kalau `sharp` error

Sharp (buat stiker) sering gagal install di Termux (`ERR_DLOPEN_FAILED`, simbol NDK tidak ketemu). Kalau `npm install` error soal sharp / `node -e "console.log(require('sharp').versions)"` gagal, coba berurutan:

**Opsi A — versi WebAssembly (paling gampang, recommended):**

```bash
cd ~/wa-ai-bot-b
npm remove sharp
npm install --cpu=wasm32 sharp
npm install @img/sharp-wasm32
node -e "console.log(require('sharp').versions)"
```

Kalau daftar versi (`vips`, `sharp`, ...) ke-print = sukses. Sedikit lebih lambat dari versi native, tapi buat stiker gak kerasa. Lanjut `npm start`.

**Opsi B — rebuild pakai libvips Termux (kalau Opsi A gagal):**

```bash
pkg update
pkg upgrade
pkg install nodejs-lts libvips
cd ~/wa-ai-bot-b
npm install-scripts approve sharp
unset SHARP_IGNORE_GLOBAL_LIBVIPS
rm -rf node_modules/sharp
SHARP_FORCE_GLOBAL_LIBVIPS=1 \
PKG_CONFIG_PATH=$PREFIX/lib/pkgconfig:$PREFIX/share/pkgconfig \
npm install --foreground-scripts sharp@0.33.5
node -e "console.log(require('sharp').versions)"
npm start
```

## 🔑 Isi `.env`

```env
PREFIX=.
PAIRING_NUMBER=6281234567890   # nomor WA bot, tanpa +/spasi. Kosongkan = pakai QR
OWNER_NUMBER=6281234567890     # nomor owner (untuk .run)
GEMINI_API_KEY=isi_dari_aistudio
GROQ_API_KEY=isi_dari_console_groq
DB_BACKEND=json                 # default. sqlite = opsional (lihat bawah)
```

Jalankan `npm start` → muncul `PAIRING CODE: xxxx-xxxx` → di HP buka **WA > Perangkat Tertaut > Tautkan** → ketik kode itu. Kalau sukses: `✅ Bot terhubung` + folder `session/` terbentuk. **Backup folder `session/`.**

## 📁 Struktur

```
wa-ai-bot-b/
├── index.js                 # koneksi Baileys + semaphore
├── config.js                # baca .env
├── handlers/messages.js     # router tipis (parse → guard → execute)
├── src/
│   ├── commands/modules/    # 1 fitur = 1 file (ai, economy, rpg, group, downloader, utility, owner)
│   ├── guards/              # pipeline: ban → rate-limit → cooldown → owner → group → admin
│   ├── extensions/safety/   # anti-flood, anti-link, warn store
│   ├── extensions/maintenance/ # scheduler bersih-bersih
│   └── storage/             # adapter JSON (default) / SQLite (opsional)
├── lib/                     # helper berat (media, stiker, TTS, AI, downloader)
├── games/dash.html          # SPEEDY DASH v4
├── database/*.json          # data user (jangan push isi aslinya!)
└── scripts/migrate-json-to-sqlite.js
```

## 🗄️ SQLite (opsional, default MATI)

Default `DB_BACKEND=json` — cukup untuk 10–30 orang. Kalau grup 50+ / mulai corrupt:

```bash
npm i better-sqlite3
# .env: DB_BACKEND=sqlite
DB_BACKEND=sqlite node scripts/migrate-json-to-sqlite.js
```

Backup otomatis ke `database/backup-YYYYMMDD/`. Balik ke JSON kapan saja: `DB_BACKEND=json`. Tanpa `better-sqlite3` bot otomatis fallback ke JSON (tidak crash).

## ⚠️ Yang jangan di-push ke GitHub

Sudah ada di `.gitignore`, tapi ingat:

```
.env            # API key!
session/        # kunci login WA!
node_modules/
data/           # bot.db (data user)
database/backup-*/
```

`database/*.json` berisi saldo/level user — push versi kosongnya saja untuk publik.

## ❓ FAQ

**Session hilang?** Folder `session/` kehapus / logout sendiri. Solusi: `npm start` → pairing ulang sekali. Biar awet: jangan hapus folder `session/`, tambahkan ke `.gitignore` (sudah), backup manual.

**Spam?** Nyalakan di grup: `.groupset antiflood on` + `.groupset antilink on`. Cooldown tiap command otomatis (umum 5 dtk, downloader 30 dtk, `work` 30 mnt, `daily` 20 jam).

**Perintah judi?** Tidak ada. Kalau nemu yang mirip, laporkan — itu bug.

## 📜 Lisensi

Pribadi / bebas pakai. API key & session tanggung jawab masing-masing.
