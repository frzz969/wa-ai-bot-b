'use strict';
// lib/tools-remote.js — wrapper API publik numpang (TANPA key) + upload file.
// Pola ditiru dari DENIA-MD: lib/Request.js (faa/nexray/zenzxz) + plugins/tools/* + lib/Scraper.js (catbox/litterbox/uguu).
// CommonJS, fetch/FormData/Blob native Node18+, tanpa dependensi baru.

const OFFLINE_MSG = 'layanan numpang sedang offline, coba lagi nanti';

const FAA_BASE = 'https://api-faa.my.id/faa/';
const NEXRAY_BASE = 'https://api.nexray.web.id/';
const ZENZXZ_BASE = 'https://api.zenzxz.my.id/';

const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';

function offlineError(service, detail) {
  const d = detail ? ` (${detail})` : '';
  return new Error(`${OFFLINE_MSG} [${service}]${d}`);
}

function isURL(s) {
  try {
    const u = new URL(String(s || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Tebak ekstensi dari magic bytes (tanpa dep file-type) + fallback filename.
function guessExt(buffer, filename) {
  if (Buffer.isBuffer(buffer) && buffer.length >= 4) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { ext: 'png', mime: 'image/png' };
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return { ext: 'gif', mime: 'image/gif' };
    if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return { ext: 'pdf', mime: 'application/pdf' };
    if (buffer.subarray(0, 3).toString('ascii') === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
    if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return { ext: 'mp4', mime: 'video/mp4' };
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return { ext: 'mkv', mime: 'video/x-matroska' };
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return { ext: 'ogg', mime: 'audio/ogg' };
  }
  const m = String(filename || '').toLowerCase().match(/\.([a-z0-9]{2,5})(?:[?#].*)?$/);
  if (m) {
    const ext = m[1];
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4', mp3: 'audio/mpeg', pdf: 'application/pdf' };
    return { ext, mime: mimeMap[ext] || 'application/octet-stream' };
  }
  return { ext: 'bin', mime: 'application/octet-stream' };
}

// request() ala DENIA-MD/lib/Request.js: Buffer bila content-type media, teks bila text/*, else JSON.
async function request(url, options = {}, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: options.signal || ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('image/') || ct.includes('video/') || ct.includes('audio/') || ct.includes('octet-stream')) {
      return Buffer.from(await res.arrayBuffer());
    }
    if (ct.startsWith('text/')) return await res.text();
    // Default JSON; sebagian host upload (catbox) balas text/plain tanpa header → tangani aman.
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(t);
  }
}

function qs(params = {}) {
  return new URLSearchParams(params).toString();
}

async function faa(path = '', params = {}, options) {
  const url = FAA_BASE + String(path).replace(/^\//, '') + (qs(params) ? `?${qs(params)}` : '');
  try {
    return await request(url, options);
  } catch (e) {
    throw offlineError('faa', e.message);
  }
}

async function nexray(path = '', params = {}, options) {
  const url = NEXRAY_BASE + String(path).replace(/^\//, '') + (qs(params) ? `?${qs(params)}` : '');
  try {
    return await request(url, options);
  } catch (e) {
    throw offlineError('nexray', e.message);
  }
}

async function zenzxz(path = '', params = {}, options) {
  const url = ZENZXZ_BASE + String(path).replace(/^\//, '') + (qs(params) ? `?${qs(params)}` : '');
  try {
    return await request(url, options);
  } catch (e) {
    throw offlineError('zenzxz', e.message);
  }
}

// Ambil URL hasil API yang mungkin berupa Buffer gambar langsung.
async function fetchBuffer(url, service = 'remote') {
  try {
    const out = await request(url, { headers: { 'User-Agent': UA } }, 30000);
    if (Buffer.isBuffer(out)) return out;
    // Kadang API balas JSON berisi URL hasil → kejar satu level.
    const text = typeof out === 'string' ? out : JSON.stringify(out || '');
    const found = text.match(/https?:\/\/[^\s"'<>\\]+/);
    if (found && isURL(found[0]) && !found[0].includes('api-faa.my.id') && !found[0].includes('api.nexray.web.id') && !found[0].includes('api.zenzxz.my.id')) {
      const bin = await request(found[0], { headers: { 'User-Agent': UA } }, 30000);
      if (Buffer.isBuffer(bin)) return bin;
    }
    throw new Error('respon bukan gambar');
  } catch (e) {
    if (String(e.message || '').includes(OFFLINE_MSG)) throw e;
    throw offlineError(service, e.message);
  }
}

// ── Upload (Scraper.js style) ──────────────────────────────────────────────

async function uploadCatbox(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('tourl: buffer harus Buffer');
  const { ext, mime } = guessExt(buffer, filename);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([buffer], { type: mime }), `${Date.now()}.${ext}`);
  const data = await request('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: { Origin: 'https://catbox.moe', Referer: 'https://catbox.moe/', 'User-Agent': UA },
    body: form,
  });
  const url = String(typeof data === 'string' ? data : '').trim();
  if (!isURL(url)) throw new Error('catbox: respon tidak valid');
  return url;
}

async function uploadLitterbox(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('tourl: buffer harus Buffer');
  const { ext, mime } = guessExt(buffer, filename);
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '72h');
  form.append('fileToUpload', new Blob([buffer], { type: mime }), `${Date.now()}.${ext}`);
  const data = await request('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    headers: { Origin: 'https://litterbox.catbox.moe', Referer: 'https://litterbox.catbox.moe/', 'User-Agent': UA },
    body: form,
  });
  const url = String(typeof data === 'string' ? data : '').trim();
  if (!isURL(url)) throw new Error('litterbox: respon tidak valid');
  return url;
}

async function uploadUguu(buffer, filename) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('tourl: buffer harus Buffer');
  const { ext, mime } = guessExt(buffer, filename);
  const form = new FormData();
  form.append('files[]', new Blob([buffer], { type: mime }), `${Date.now()}.${ext}`);
  const data = await request('https://uguu.se/upload.php', {
    method: 'POST',
    headers: { Origin: 'https://uguu.se', Referer: 'https://uguu.se/', 'User-Agent': UA },
    body: form,
  });
  const url = data && data.files && data.files[0] && data.files[0].url;
  if (!isURL(url)) throw new Error('uguu: respon tidak valid');
  return String(url).trim();
}

// ── API publik ─────────────────────────────────────────────────────────────

/**
 * Upload buffer ke catbox → litterbox → uguu (fallback berurutan via allSettled).
 * @returns {Promise<string>} URL file
 */
async function tourl(buffer, filename = 'file.bin') {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('tourl: buffer harus Buffer');
  const attempts = await Promise.allSettled([
    uploadCatbox(buffer, filename),
    uploadLitterbox(buffer, filename),
    uploadUguu(buffer, filename),
  ]);
  const ok = attempts.find((r) => r.status === 'fulfilled');
  if (ok) return ok.value;
  const reasons = attempts.map((r) => (r.status === 'rejected' ? r.reason && r.reason.message : '')).filter(Boolean).join(' | ');
  throw offlineError('upload', reasons || 'semua host upload gagal');
}

/** Screenshot halaman web → Buffer gambar. */
async function ssweb(url) {
  if (!isURL(url)) throw new Error('ssweb: URL tidak valid');
  let data;
  try {
    data = await zenzxz('tools/ssweb', { url });
  } catch (e) {
    throw e; // sudah dibungkus offlineError oleh zenzxz()
  }
  const img = data && data.result && (data.result.url || data.result.image || data.result.screenshot);
  if (data && data.status === false) throw offlineError('zenzxz', 'API menolak permintaan ssweb');
  if (!isURL(img)) throw offlineError('zenzxz', 'ssweb tanpa URL hasil');
  return fetchBuffer(img, 'zenzxz');
}

/** Stalk TikTok → objek info akun. */
async function stalkTiktok(username) {
  const u = String(username || '').trim().replace(/^@/, '');
  if (!u) throw new Error('stalkTiktok: username kosong');
  let data;
  try {
    data = await zenzxz('stalker/tiktok', { username: u });
  } catch (e) {
    throw e;
  }
  if (!data || data.status === false || !data.result) throw offlineError('zenzxz', 'tiktok stalk gagal');
  return data.result;
}

/** Stalk Instagram → objek info akun. */
async function stalkIG(username) {
  const u = String(username || '').trim().replace(/^@/, '');
  if (!u) throw new Error('stalkIG: username kosong');
  let data;
  try {
    data = await zenzxz('stalker/instagram', { username: u });
  } catch (e) {
    throw e;
  }
  if (!data || data.status === false || !data.result) throw offlineError('zenzxz', 'instagram stalk gagal');
  return data.result;
}

async function uploadFirst(buffer, filename) {
  // Upload internal dgn fallback penuh tourl(); error upload ikut pola offline.
  return tourl(buffer, filename);
}

/** Hapus background gambar → Buffer PNG. */
async function removebg(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('removebg: buffer harus Buffer');
  const up = await uploadFirst(buffer, 'removebg.png');
  let data;
  try {
    data = await nexray('tools/removebg', { url: up });
  } catch (e) {
    throw e;
  }
  if (Buffer.isBuffer(data)) return data;
  if (data && isURL(data.result)) return fetchBuffer(data.result, 'nexray');
  if (data && isURL(data.url)) return fetchBuffer(data.url, 'nexray');
  throw offlineError('nexray', 'removebg tanpa hasil gambar');
}

/** HD / enhance wajah (remini) → Buffer gambar. */
async function hdImage(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('hdImage: buffer harus Buffer');
  const up = await uploadFirst(buffer, 'hd.png');
  let data;
  try {
    data = await nexray('tools/remini', { url: up });
  } catch (e) {
    throw e;
  }
  if (Buffer.isBuffer(data)) return data;
  if (data && isURL(data.result)) return fetchBuffer(data.result, 'nexray');
  if (data && isURL(data.url)) return fetchBuffer(data.url, 'nexray');
  throw offlineError('nexray', 'hdImage tanpa hasil gambar');
}

/** Gabung dua emoji → Buffer stiker/gambar. */
async function emojimix(e1, e2) {
  if (!e1 || !e2) throw new Error('emojimix: butuh dua emoji, contoh: emojimix("😁","😆")');
  let data;
  try {
    data = await nexray('tools/emojimix', { emoji1: String(e1), emoji2: String(e2) });
  } catch (e) {
    throw e;
  }
  if (Buffer.isBuffer(data)) return data;
  if (data && isURL(data.result)) return fetchBuffer(data.result, 'nexray');
  if (data && isURL(data.url)) return fetchBuffer(data.url, 'nexray');
  throw offlineError('nexray', 'emojimix tanpa hasil gambar');
}

/** OCR gambar → teks hasil. */
async function ocrImage(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('ocrImage: buffer harus Buffer');
  const up = await uploadFirst(buffer, 'ocr.png');
  let data;
  try {
    data = await nexray('tools/ocr', { url: up });
  } catch (e) {
    throw e;
  }
  const text = data && data.result && (data.result.text || data.result.ocr || data.result);
  if (typeof text === 'string' && text.trim()) return text.trim();
  if (typeof data === 'string' && data.trim()) return data.trim();
  throw offlineError('nexray', 'ocr tanpa teks hasil');
}

/** Baca QR dari gambar → teks isi QR. */
async function qrDetect(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('qrDetect: buffer harus Buffer');
  const up = await uploadFirst(buffer, 'qr.png');
  let data;
  try {
    data = await faa('qr-detect', { url: up });
  } catch (e) {
    throw e;
  }
  const out = (data && (data.result ?? data.data ?? data.text)) ?? data;
  if (typeof out === 'string' && out.trim()) return out.trim();
  if (out && typeof out === 'object') {
    const s = JSON.stringify(out);
    if (s && s !== '{}') return s;
  }
  throw offlineError('faa', 'qr-detect tanpa hasil');
}

/** Blur wajah pada gambar → Buffer gambar. */
async function blurface(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('blurface: buffer harus Buffer');
  const up = await uploadFirst(buffer, 'blur.png');
  let data;
  try {
    data = await nexray('tools/blurface', { url: up });
  } catch (e) {
    throw e;
  }
  if (Buffer.isBuffer(data)) return data;
  if (data && isURL(data.result)) return fetchBuffer(data.result, 'nexray');
  if (data && isURL(data.url)) return fetchBuffer(data.url, 'nexray');
  throw offlineError('nexray', 'blurface tanpa hasil gambar');
}

module.exports = {
  OFFLINE_MSG,
  faa,
  nexray,
  zenzxz,
  tourl,
  uploadCatbox,
  uploadLitterbox,
  uploadUguu,
  ssweb,
  stalkTiktok,
  stalkIG,
  removebg,
  hdImage,
  emojimix,
  ocrImage,
  qrDetect,
  blurface,
};
