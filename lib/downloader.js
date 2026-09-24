// lib/downloader.js — LANE DOWNLOADER (lokal-first, tanpa API key)
// Search via yt-search (opsional, bila terinstal), download via yt-dlp lokal
// dengan execFile (BUKAN exec string). Tanpa API key.
// Batasan WA: video ~16MB, audio ~10MB. Error jelas bila yt-dlp/ffmpeg belum install.
// Contoh pasang di router (TANPA edit file lain — cukup require saat dipakai):
//   const { handlePlay } = require('../lib/downloader');
//   if (cmd === 'play') return await handlePlay(sock, jid, m, args);

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_VIDEO_BYTES = 16 * 1024 * 1024; // ~16MB (video WA)
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10MB (audio WA)

// yt-search opsional: bila belum `npm i yt-search`, search judul → error jelas.
let yts = null;
try {
  yts = require('yt-search');
} catch {
  yts = null;
}

function runBin(bin, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, Object.assign({ timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, opts || {}), (err, stdout, stderr) => {
      if (err) {
        const msg = String((stderr || stdout || err.message || err)).slice(0, 500);
        const e = new Error(bin + ' gagal: ' + msg);
        e.code = err.code;
        return reject(e);
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function checkBin(bin) {
  try {
    await runBin(bin, ['--version']);
    return true;
  } catch (e) {
    if (e && (e.code === 'ENOENT' || String(e.message || '').includes('ENOENT'))) return false;
    return true; // binary ada tapi argumen/version aneh → anggap ada
  }
}

async function ensureTools(needFfmpeg) {
  const hasYtDlp = await checkBin('yt-dlp');
  if (!hasYtDlp) {
    throw new Error(
      '❌ yt-dlp belum terinstal.\n' +
      'Install: https://github.com/yt-dlp/yt-dlp#installation\n' +
      '• Windows: winget install yt-dlp\n' +
      '• Linux: sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp'
    );
  }
  if (needFfmpeg !== false) {
    const hasFfmpeg = await checkBin('ffmpeg');
    if (!hasFfmpeg) throw new Error('❌ ffmpeg belum terinstal (dibutuhkan untuk merge/convert). Install: https://ffmpeg.org/download.html');
  }
}

function tmpDir() {
  const d = path.join(os.tmpdir(), 'wa-dl');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function tmpOut(ext) {
  return path.join(tmpDir(), 'dl-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.' + ext);
}

function statSize(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function cleanup(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

function isUrl(s) {
  return /^https?:\/\//i.test(String(s || '').trim());
}

// ------------------------------------------------------------ search ---
// Cari video YouTube dari judul. Butuh paket `yt-search`.
// Contoh: const r = await ytSearch('dhyo haw - bajingan'); // { title, url, ... }
async function ytSearch(query) {
  const q = String(query || '').trim();
  if (!q) throw new Error('Contoh: .play dhyo haw bajingan');
  if (!yts) {
    throw new Error(
      '❌ Fitur pencarian butuh paket `yt-search` yang belum terinstal.\n' +
      'Jalankan: npm i yt-search\n' +
      'Sementara: tempel link YouTube langsung (cth: .ytmp3 <link>).'
    );
  }
  const res = await yts(q);
  const v = (res && res.videos && res.videos[0]) || null;
  if (!v || !v.url) throw new Error('❌ Tidak ketemu hasil untuk: ' + q);
  return { title: v.title, url: v.url, duration: v.duration, author: (v.author && v.author.name) || '', videoId: v.videoId };
}

async function resolveTarget(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('Kasih judul atau link dulu.');
  if (isUrl(s)) return { title: s, url: s };
  const found = await ytSearch(s);
  return found;
}

// ---------------------------------------------------------- download ---
async function dumpMeta(url) {
  try {
    const { stdout } = await runBin('yt-dlp', ['--no-playlist', '--skip-download', '--print', '%(title)s | %(uploader)s | %(duration_string)s', url]);
    return stdout.trim();
  } catch {
    return '';
  }
}

// Audio → mp3. Kembalikan { file, title, size, meta }.
async function downloadAudio(url, opts) {
  await ensureTools(true);
  const out = tmpOut('mp3');
  const args = [
    '--no-playlist',
    '--max-filesize', String((opts && opts.maxBytes) || MAX_AUDIO_BYTES),
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '-o', out,
    url,
  ];
  await runBin('yt-dlp', args);
  // yt-dlp bisa menambah ekstensi sendiri bila template tanpa ext — cari file hasil.
  const file = fs.existsSync(out) ? out : pickSibling(out);
  const size = statSize(file);
  if (!file || size < 1024) throw new Error('❌ Gagal mengunduh audio (file kosong).');
  if (size > MAX_AUDIO_BYTES) {
    cleanup(file);
    throw new Error('❌ Audio ' + fmtSize(size) + ' melebihi batas WA ~10MB. Coba lagu lain / durasi lebih pendek.');
  }
  return { file, title: (opts && opts.title) || path.basename(file), size, meta: (opts && opts.meta) || '' };
}

// Video → mp4 max 720p (merge mp4). Kembalikan { file, title, size, meta }.
async function downloadVideo(url, opts) {
  await ensureTools(true);
  const out = tmpOut('mp4');
  const args = [
    '--no-playlist',
    '--max-filesize', String((opts && opts.maxBytes) || MAX_VIDEO_BYTES),
    '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
    '--merge-output-format', 'mp4',
    '-o', out,
    url,
  ];
  await runBin('yt-dlp', args);
  const file = fs.existsSync(out) ? out : pickSibling(out);
  const size = statSize(file);
  if (!file || size < 1024) throw new Error('❌ Gagal mengunduh video (file kosong).');
  if (size > MAX_VIDEO_BYTES) {
    cleanup(file);
    throw new Error('❌ Video ' + fmtSize(size) + ' melebihi batas WA ~16MB. Coba video lebih pendek.');
  }
  return { file, title: (opts && opts.title) || path.basename(file), size, meta: (opts && opts.meta) || '' };
}

// Bila yt-dlp menulis nama sedikit berbeda (info/ext), cari file termuda seawalan.
function pickSibling(out) {
  try {
    const dir = path.dirname(out);
    const base = path.basename(out).split('.')[0];
    const files = fs.readdirSync(dir)
      .filter((f) => f.startsWith(base))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files.length ? path.join(dir, files[0].f) : '';
  } catch {
    return '';
  }
}

function fmtSize(n) {
  const mb = Number(n || 0) / (1024 * 1024);
  return mb.toFixed(1) + 'MB';
}

// ------------------------------------------------------------- API ---
// play: judul → cari → mp3 + metadata.
// Contoh: const r = await play('dhyo haw bajingan');
async function play(query) {
  const t = await resolveTarget(query);
  const meta = isUrl(query) ? await dumpMeta(t.url) : [t.title, t.author].filter(Boolean).join(' | ');
  return await downloadAudio(t.url, { title: t.title, meta });
}

// ytmp3: link → mp3. Contoh: const r = await ytmp3('https://youtu.be/xxxx');
async function ytmp3(url) {
  const s = String(url || '').trim();
  if (!isUrl(s)) throw new Error('Contoh: .ytmp3 https://youtu.be/xxxx');
  const meta = await dumpMeta(s);
  return await downloadAudio(s, { meta });
}

// ytmp4: link → mp4 max 720p. Contoh: const r = await ytmp4('https://youtu.be/xxxx');
async function ytmp4(url, opts) {
  const s = String(url || '').trim();
  if (!isUrl(s)) throw new Error('Contoh: .ytmp4 https://youtu.be/xxxx');
  const meta = await dumpMeta(s);
  return await downloadVideo(s, { meta, maxBytes: (opts && opts.maxBytes) || MAX_VIDEO_BYTES });
}

// tiktok tanpa watermark (yt-dlp otomatis ambil versi no-watermark bila bisa).
// Contoh: const r = await tiktokNowm('https://vt.tiktok.com/xxxx');
async function tiktokNowm(url) {
  const s = String(url || '').trim();
  if (!isUrl(s)) throw new Error('Contoh: .tiktok https://vt.tiktok.com/xxxx');
  return await downloadVideo(s, {});
}

// fbdl: video Facebook publik. Contoh: const r = await fbdl('https://www.facebook.com/...');
async function fbdl(url) {
  const s = String(url || '').trim();
  if (!isUrl(s)) throw new Error('Contoh: .fbdl https://www.facebook.com/...');
  return await downloadVideo(s, {});
}

// igdl: reel/postingan Instagram publik. Contoh: const r = await igdl('https://www.instagram.com/reel/...');
async function igdl(url) {
  const s = String(url || '').trim();
  if (!isUrl(s)) throw new Error('Contoh: .igdl https://www.instagram.com/reel/...');
  return await downloadVideo(s, {});
}

// --------------------------------------------------------- handlers ---
// Contoh router:
//   if (cmd === 'play') return await handlePlay(sock, jid, m, args);
//   if (cmd === 'ytmp3') return await handleYtmp3(sock, jid, m, args);
//   if (cmd === 'ytmp4') return await handleYtmp4(sock, jid, m, args);
//   if (cmd === 'tiktok') return await handleTiktok(sock, jid, m, args);
//   if (cmd === 'fbdl') return await handleFbdl(sock, jid, m, args);
//   if (cmd === 'igdl') return await handleIgdl(sock, jid, m, args);

async function sendAudioResult(sock, jid, m, r, caption) {
  await sock.sendMessage(
    jid,
    { audio: fs.readFileSync(r.file), mimetype: 'audio/mpeg', ptt: false, caption: caption || undefined },
    { quoted: m }
  );
}

async function sendVideoResult(sock, jid, m, r, caption) {
  await sock.sendMessage(
    jid,
    { video: fs.readFileSync(r.file), mimetype: 'video/mp4', caption: caption || undefined },
    { quoted: m }
  );
}

// handlePlay mengirim audio + menghapus file temp setelah terkirim.
// Contoh router: if (cmd === 'play') return await handlePlay(sock, jid, m, args);
async function handlePlay(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .play dhyo haw bajingan' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎵 Lagi cari + download audio...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await play(args);
    await sendAudioResult(sock, jid, m, r, '🎵 *' + r.title + '*' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('play', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal memproses .play') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

async function handleYtmp3(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .ytmp3 https://youtu.be/xxxx' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎵 Lagi download mp3...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await ytmp3(args);
    await sendAudioResult(sock, jid, m, r, '🎵 *' + r.title + '*' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('ytmp3', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal download mp3.') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

async function handleYtmp4(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .ytmp4 https://youtu.be/xxxx' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎬 Lagi download video (max 720p)...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await ytmp4(args);
    await sendVideoResult(sock, jid, m, r, '🎬 *' + r.title + '*' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('ytmp4', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal download video.') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

async function handleTiktok(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .tiktok https://vt.tiktok.com/xxxx' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎬 Lagi download tiktok...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await tiktokNowm(args);
    await sendVideoResult(sock, jid, m, r, '🎬 TikTok' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('tiktok', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal download tiktok.') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

async function handleFbdl(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .fbdl https://www.facebook.com/...' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎬 Lagi download video FB...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await fbdl(args);
    await sendVideoResult(sock, jid, m, r, '🎬 Facebook' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('fbdl', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal download video FB.') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

async function handleIgdl(sock, jid, m, args) {
  if (!args) return await sock.sendMessage(jid, { text: 'Contoh: .igdl https://www.instagram.com/reel/...' }, { quoted: m });
  await sock.sendMessage(jid, { text: '🎬 Lagi download video IG...' }, { quoted: m }).catch(() => {});
  let r = null;
  try {
    r = await igdl(args);
    await sendVideoResult(sock, jid, m, r, '🎬 Instagram' + (r.meta ? '\n' + r.meta : ''));
  } catch (e) {
    console.error('igdl', (e && e.message) || e);
    await sock.sendMessage(jid, { text: String((e && e.message) || '❌ Gagal download video IG.') }, { quoted: m });
  } finally {
    if (r && r.file) cleanup(r.file);
  }
}

module.exports = {
  MAX_VIDEO_BYTES,
  MAX_AUDIO_BYTES,
  ytSearch,
  play,
  ytmp3,
  ytmp4,
  tiktokNowm,
  fbdl,
  igdl,
  downloadAudio,
  downloadVideo,
  cleanup,
  handlePlay,
  handleYtmp3,
  handleYtmp4,
  handleTiktok,
  handleFbdl,
  handleIgdl,
};
