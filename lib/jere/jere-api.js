// lib/jere-api.js — Wrapper GET ke Jere API (https://api.jerexd.my.id).
// Key dibaca dari require('../../config').JERE_API_KEY saat dipanggil.
// Jangan wiring ke handlers/messages.js dari file ini.
// Jangan pernah print/log API key ke mana pun.
function getKey() {
  const cfg = require('../../config');
  const key = String(cfg.JERE_API_KEY || process.env.JERE_API_KEY || '').trim();
  if (!key) {
    throw new Error('Jere API butuh key: isi JERE_API_KEY di .env');
  }
  return key;
}

function getBase() {
  const cfg = require('../../config');
  const base = String(cfg.JERE_API_BASE || 'https://api.jerexd.my.id').trim() || 'https://api.jerexd.my.id';
  return base.replace(/\/+$/, '');
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireUrl(value, label = 'URL') {
  if (!isHttpUrl(value)) throw new Error(`${label} harus berupa link http/https yang valid.`);
  return String(value).trim();
}

async function jereGet(path, params = {}, timeoutMs = 60000) {
  const key = getKey();
  const base = getBase();
  const cleanPath = String(path || '');
  const url = new URL(cleanPath.startsWith('http') ? cleanPath : base + (cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`));

  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,image/*,*/*;q=0.8', 'User-Agent': 'wa-ai-bot-b/1.0' },
      signal: controller.signal,
    });
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    // Endpoint biner (mis. /api/maker/iqc mengembalikan image/png langsung):
    // kembalikan Buffer agar pemanggil bisa langsung kirim sebagai image.
    if (ct.includes('image/') || ct.includes('application/octet-stream')) {
      if (!res.ok) throw Object.assign(new Error(`Jere API gagal: HTTP ${res.status}`), { code: 'JERE_API_HTTP', status: res.status });
      return Buffer.from(await res.arrayBuffer());
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) {
      const detail = data?.error || data?.message || `HTTP ${res.status}`;
      const err = new Error(`Jere API gagal: ${detail}`);
      err.code = 'JERE_API_HTTP';
      err.status = res.status;
      throw err;
    }
    if (!data || data.status === false) {
      const err = new Error(data?.error || data?.message || 'Jere API mengembalikan status gagal.');
      err.code = 'JERE_API_STATUS';
      throw err;
    }
    return data.result !== undefined ? data.result : (data.data !== undefined ? data.data : data);
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('Jere API terlalu lama merespons. Coba lagi sebentar.');
      err.code = 'JERE_API_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Downloader TikTok via Jere API.
// Contoh Baileys:
//   const { no_watermark, title } = await jereTiktok('https://vt.tiktok.com/...');
//   await sock.sendMessage(jid, { video: { url: no_watermark }, caption: title });
async function jereTiktok(url) {
  const target = requireUrl(url, 'URL TikTok');
  const result = await jereGet('/api/downloader/tiktok', { url: target }, 90000);
  const r = result && typeof result === 'object' ? result : {};
  const no_watermark =
    r.no_watermark || r.noWatermark || r.nowm || r.video || r.play || r.download || r.url || r.video_url || r.download_url || '';
  const title = r.title || r.caption || r.desc || r.description || '';
  if (!no_watermark) throw new Error('Jere API tidak mengembalikan link video TikTok.');
  return { no_watermark: String(no_watermark), title: String(title || '') };
}

// IQC (iPhone Quoted Chat) via Jere API — GET ${base}/api/maker/iqc.
// Parameter mengikuti plugins/maker/iqc.js milik jere-md:
//   text (wajib), time (default jam WIB "HH.MM"), theme (default "dark"), url (opsional avatar).
// Format "teks|tema" didukung, mis. jereIqc('halo|light').
// Mengembalikan Buffer gambar siap kirim via Baileys ({ image: buf }).
// Contoh:
//   const { jereIqc } = require('./jere-api');
//   const buf = await jereIqc('halo|light');
//   await sock.sendMessage(jid, { image: buf, caption: '📱 halo' }, { quoted: m });
async function jereIqc(text, opts = {}) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) throw new Error('Teks IQC kosong. Contoh: .iqc halo|light');
  // Dukung "teks|tema" ala plugin jere-md (opts eksplisit menang).
  let msgText = raw;
  let theme = String(opts.theme || '').trim();
  if (raw.includes('|')) {
    const parts = raw.split('|');
    if (!theme) theme = String(parts[1] || '').trim();
    msgText = String(parts[0] || '').trim();
  }
  if (!msgText) throw new Error('Teks IQC kosong. Contoh: .iqc halo|light');
  if (!theme) theme = 'dark';
  let time = String(opts.time || '').trim();
  if (!time) {
    try {
      time = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date()).replace(':', '.');
    } catch {
      time = '';
    }
  }
  const avatar = String(opts.url || '').trim();
  // jereGet melempar error ramah bila key kosong (tanpa pernah me-log key).
  const result = await jereGet('/api/maker/iqc', { text: msgText, time, theme, url: avatar }, 60000);
  if (Buffer.isBuffer(result)) {
    if (!result.length) throw new Error('Jere API mengembalikan gambar kosong.');
    return result;
  }
  // Toleransi bila API membalas JSON berisi link/base64 gambar.
  const r = result && typeof result === 'object' ? result : {};
  const link = typeof result === 'string' && /^https?:\/\//i.test(result)
    ? result
    : (r.url || r.image || r.image_url || r.download || r.result || '');
  if (typeof link === 'string' && /^https?:\/\//i.test(link)) {
    const res = await fetch(link, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Jere API gagal mengambil gambar IQC (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('Jere API mengembalikan gambar kosong.');
    return buf;
  }
  if (typeof link === 'string' && /^data:image\//i.test(link)) {
    const b64 = link.split(',')[1] || '';
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new Error('Jere API mengembalikan gambar kosong.');
    return buf;
  }
  throw new Error('Jere API tidak mengembalikan gambar IQC.');
}

module.exports = {
  jereGet,
  jereTiktok,
  jereIqc,
};
