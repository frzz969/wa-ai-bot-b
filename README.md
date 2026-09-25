# WA AI Bot B 🤖

**WA AI Bot B** adalah bot WhatsApp modular berbasis Baileys yang menggabungkan AI, automation, downloader, group management, utility, media tools, economy, RPG, dan game arcade dalam satu bot. Dibangun untuk penggunaan pribadi, eksperimen, dan pembelajaran dengan struktur modular yang mudah dikembangkan.

## ✨ Features

- AI Gemini + Groq
- WhatsApp automation
- Downloader
- Group management & moderation
- Economy & RPG
- Media tools
- Arcade game
- Owner tools

Fitur yang tidak dipasang karena unsur judi: `slots`, `roulette`, `coinflip` sebagai game, `crime`, `lootbox`, dan `rob`.

## 🛠️ Requirements

- Node.js >= 18
- FFmpeg
- yt-dlp

FFmpeg dan yt-dlp dipakai oleh command downloader:

```bash
ffmpeg -version
yt-dlp --version
```

### Command downloader

```text
.play I Lay My Love On You - Westlife
.ytmp3 https://youtu.be/ID_VIDEO
.ytmp4 https://youtu.be/ID_VIDEO
.tiktok https://vt.tiktok.com/ID_VIDEO
.fbdl https://www.facebook.com/ID_VIDEO
.igdl https://www.instagram.com/reel/ID_REEL/
```

Command `.iqc`, `.stiker`, dan `.tts` tidak memerlukan FFmpeg atau yt-dlp.

## 🚀 Installation

### Laptop/PC

```bash
git clone <repo-mu>
cd wa-ai-bot-b
npm install
cp .env.example .env
npm start
```

Windows PowerShell 5.1 tidak mendukung `&&`. Jalankan `npm install` dan `npm start` secara terpisah.

## 🔑 Environment

Salin `.env.example` ke `.env`, lalu isi:

```env
PREFIX=.
PAIRING_NUMBER=6281234567890
OWNER_NUMBER=6281234567890
GEMINI_API_KEY=
GROQ_API_KEY=
DB_BACKEND=json
```

`PAIRING_NUMBER` boleh dikosongkan untuk memakai QR. `GEMINI_API_KEY` dipakai untuk fitur AI. `GROQ_API_KEY` dipakai untuk AI dan transkripsi voice note.

## 📱 Termux

```bash
pkg update
pkg install nodejs git ffmpeg python
pip install yt-dlp
cd wa-ai-bot-b
npm install
cp .env.example .env
nano .env
npm start
```

Jika `sharp` gagal di Termux, gunakan salah satu opsi berikut.

### Opsi A: Sharp WebAssembly

```bash
cd ~/wa-ai-bot-b
npm remove sharp
npm install --cpu=wasm32 sharp
npm install @img/sharp-wasm32
node -e "console.log(require('sharp').versions)"
```

Kalau daftar versi `sharp` dan `vips` muncul, berarti berhasil. Lanjut dengan:

```bash
npm start
```

### Opsi B: Rebuild dengan libvips

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

## 🧩 Command IQC

`.iqc` membuat gambar quote WhatsApp secara lokal. Tidak memakai API screenshot, Playwright, atau browser.

```text
.iqc halo testt 😭
```

Output berukuran `864x1536`. Emoji memakai asset lokal dari `assets/emoji-iphone/`. Font memakai `assets/fonts/sf-pro-display/SFPRODISPLAYREGULAR.OTF`.

## 🗄️ Storage

Default memakai JSON di `database/`. Untuk grup besar, SQLite opsional tersedia:

```bash
npm i better-sqlite3
```

```env
DB_BACKEND=sqlite
```

```bash
DB_BACKEND=sqlite node scripts/migrate-json-to-sqlite.js
```

## 🔒 Security

Jangan upload atau push file berikut:

```text
.env
session/
node_modules/
database/*.json
database/backup-*/
```

Backup folder `session/` secara berkala. Jangan bagikan API key.

## ⚠️ Notes

- Beberapa fitur dapat bergantung pada layanan pihak ketiga.
- Downloader bergantung pada `yt-dlp` dan dukungan platform target.
- `.iqc`, stiker, dan TTS berjalan lokal.
- Kalau FFmpeg atau yt-dlp belum terpasang, downloader akan gagal dengan pesan jelas.

## 📜 License

No license specified.
