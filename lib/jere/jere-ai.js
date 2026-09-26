// lib/jere-ai.js — Port fitur AI Jere API (https://api.jerexd.my.id).
// Referensi pola: jere-md "plugins/ai" (endpoint /api/ai/* dan /api/maker/*).
// Standalone: JANGAN wiring ke router/handler dari file ini.
// CommonJS, fetch/FormData/Blob native (Node 18+), tanpa dependensi baru.
// Key dibaca dari require('../../config').JERE_API_KEY (jangan pernah log key).
// Error ramah bila key kosong.
const { jereGet } = require('./jere-api');

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

function requirePrompt(prompt, example) {
  const p = String(prompt == null ? '' : prompt).trim();
  if (!p) throw new Error(example || 'Prompt kosong.');
  return p;
}

function requireBuffer(buf, label) {
  if (!Buffer.isBuffer(buf) || !buf.length) {
    throw new Error(`${label || 'File'} kosong: kirim Buffer yang valid.`);
  }
  return buf;
}

function pickUrl(node, keys) {
  if (typeof node === 'string') {
    const s = node.trim();
    if (/^https?:\/\//i.test(s)) return s;
    return '';
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = pickUrl(item, keys);
      if (hit) return hit;
    }
    return '';
  }
  if (node && typeof node === 'object') {
    for (const k of keys) {
      const hit = pickUrl(node[k], keys);
      if (hit) return hit;
    }
    // fallback: properti string http apa pun
    for (const v of Object.values(node)) {
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
    }
  }
  return '';
}

async function fetchBuffer(url, timeoutMs = 120000) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) throw new Error('URL hasil AI tidak valid.');
  const res = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Gagal mengunduh hasil AI (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Hasil AI kosong.');
  return buf;
}

function decodeDataUrl(s) {
  const m = String(s || '').match(/^data:([a-z0-9/+.-]+);base64,(.*)$/is);
  if (!m) return null;
  const buf = Buffer.from((m[2] || '').replace(/\s+/g, ''), 'base64');
  return buf.length ? buf : null;
}

// Normalisasi hasil JSON GET (string / object / array) menjadi Buffer media.
async function resultToBuffer(result, urlKeys, label, timeoutMs = 120000) {
  if (Buffer.isBuffer(result)) {
    if (!result.length) throw new Error(`${label} kosong.`);
    return result;
  }
  if (typeof result === 'string') {
    const s = result.trim();
    if (!s) throw new Error(`${label} kosong.`);
    const dataBuf = decodeDataUrl(s);
    if (dataBuf) return dataBuf;
    if (/^https?:\/\//i.test(s)) return fetchBuffer(s, timeoutMs);
    // base64 mentah
    if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.replace(/\s+/g, '').length > 64) {
      try {
        const buf = Buffer.from(s.replace(/\s+/g, ''), 'base64');
        if (buf.length) return buf;
      } catch { /* abaikan, lempar error umum di bawah */ }
    }
    throw new Error(`${label} tidak valid.`);
  }
  const link = pickUrl(result, urlKeys);
  if (link) return fetchBuffer(link, timeoutMs);
  // Mungkin API mengembalikan base64 di field umum
  const r = result && typeof result === 'object' ? result : {};
  for (const k of ['base64', 'image_base64', 'data_base64', 'b64']) {
    if (typeof r[k] === 'string' && r[k].trim()) {
      const dataBuf = decodeDataUrl(r[k].trim()) || (() => {
        try {
          const b = Buffer.from(r[k].trim(), 'base64');
          return b.length ? b : null;
        } catch { return null; }
      })();
      if (dataBuf) return dataBuf;
    }
  }
  throw new Error(`${label} tidak ditemukan di respons AI.`);
}

function resultToText(result, fallbackMsg) {
  if (typeof result === 'string') {
    const s = result.trim();
    if (s) return s;
    throw new Error(fallbackMsg || 'AI tidak mengembalikan teks.');
  }
  if (result && typeof result === 'object') {
    for (const k of ['answer', 'response', 'reply', 'message', 'text', 'content', 'output']) {
      if (typeof result[k] === 'string' && result[k].trim()) return result[k].trim();
    }
    // array audios/teks? gabung yang string
    if (Array.isArray(result) && result.length) {
      const parts = result.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
      if (parts.length) return parts.join('\n');
    }
  }
  throw new Error(fallbackMsg || 'AI tidak mengembalikan teks.');
}

// POST multipart native (untuk endpoint upload: file + field teks).
// Mengembalikan: Buffer bila respons biner, atau JSON result (seperti jereGet).
async function postForm(path, form, query = {}, timeoutMs = 120000) {
  const key = getKey(); // error ramah bila kosong; key tidak pernah di-log
  const base = getBase();
  const cleanPath = String(path || '');
  const url = new URL(cleanPath.startsWith('http') ? cleanPath : base + (cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`));
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
  }
  url.searchParams.set('key', key);
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ct = String(res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('image/') || ct.includes('video/') || ct.includes('audio/') || ct.includes('application/octet-stream')) {
    if (!res.ok) throw new Error(`Jere API gagal: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('Jere API mengembalikan media kosong.');
    return buf;
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    throw new Error(`Jere API gagal: ${(data && (data.error || data.message)) || `HTTP ${res.status}`}`);
  }
  if (!data || data.status === false) {
    throw new Error((data && (data.error || data.message)) || 'Jere API mengembalikan status gagal.');
  }
  return data.result !== undefined ? data.result : (data.data !== undefined ? data.data : data);
}

function toFile(form, field, buffer, filename, contentType) {
  const buf = requireBuffer(buffer, `Gambar ${field}`);
  const blob = new Blob([new Uint8Array(buf)], { type: contentType || 'image/jpeg' });
  form.append(field, blob, filename || `${field}_${Date.now()}.jpg`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Text -> Image ---------------------------------------------------------
// Pola ref: POST /api/ai/txt2img { prompt } -> result.image|url|images[0].
// Di sini via jereGet (GET + prompt) lalu unduh URL menjadi Buffer.
async function txt2img(prompt) {
  const p = requirePrompt(prompt, 'Prompt gambar kosong. Contoh: txt2img("kucing astronot")');
  const result = await jereGet('/api/ai/txt2img', { prompt: p }, 120000);
  return resultToBuffer(result, ['image', 'url', 'images', 'image_url', 'download'], 'Gambar AI');
}

// --- Text -> Video ---------------------------------------------------------
// Pola ref: GET /api/ai/txt2video?prompt=&model=Anime -> result.video_url|video|url.
async function txt2video(prompt, opts = {}) {
  const p = requirePrompt(prompt, 'Prompt video kosong. Contoh: txt2video("sunset di neo tokyo")');
  const model = String(opts.model || 'Anime').trim() || 'Anime';
  const result = await jereGet('/api/ai/txt2video', { prompt: p, model }, 180000);
  return resultToBuffer(result, ['video_url', 'video', 'url', 'download'], 'Video AI', 180000);
}

// --- Image -> Video --------------------------------------------------------
// Pola ref: POST multipart file ke /api/ai/img2video?prompt= -> { video_url | task_id }
// task_id di-poll hingga video_url keluar. prompt opsional (default animasi hidup).
async function img2video(imageBuffer, prompt = '') {
  requireBuffer(imageBuffer, 'Gambar');
  const p = String(prompt == null ? '' : prompt).trim() || 'make the picture live and real';
  const form = new FormData();
  toFile(form, 'file', imageBuffer, `img2vid_${Date.now()}.jpg`, 'image/jpeg');
  const started = await postForm('/api/ai/img2video', form, { prompt: p }, 120000);
  let videoUrl = pickUrl(started, ['video_url', 'video', 'url', 'download']);
  if (videoUrl) return fetchBuffer(videoUrl, 180000);
  const s = started && typeof started === 'object' ? started : {};
  const taskId = s.task_id || s.taskId || s.id || '';
  if (!taskId) {
    // Mungkin API langsung mengembalikan buffer via postForm
    if (Buffer.isBuffer(started)) return started;
    throw new Error('Video AI gagal dimulai (tanpa video_url/task_id).');
  }
  await sleep(45000); // jeda awal render ala plugin ref
  const maxPoll = 12; // 12 x 10 dtk
  for (let i = 0; i < maxPoll; i++) {
    let poll;
    try {
      poll = await jereGet('/api/ai/img2video', { task_id: String(taskId) }, 30000);
    } catch (e) {
      if (/terlalu lama|timeout|ECONNRESET/i.test(e && e.message || '')) { await sleep(10000); continue; }
      throw e;
    }
    videoUrl = pickUrl(poll, ['video_url', 'video', 'url', 'download']);
    if (videoUrl) return fetchBuffer(videoUrl, 180000);
    await sleep(10000);
  }
  throw new Error('Video AI belum selesai (batas tunggu habis). Coba lagi nanti.');
}

// --- Sora (text -> video) --------------------------------------------------
// Pola ref: GET /api/ai/sora2-video?prompt= -> result.video_url|video|url.
async function sora(prompt) {
  const p = requirePrompt(prompt, 'Prompt video Sora kosong. Contoh: sora("drone di atas hutan purba")');
  const result = await jereGet('/api/ai/sora2-video', { prompt: p }, 180000);
  return resultToBuffer(result, ['video_url', 'video', 'url', 'download'], 'Video Sora', 180000);
}

// --- Suno (text -> music) --------------------------------------------------
// Pola ref: GET /api/ai/suno?prompt=&title=&style=&instrument= -> { task_id | audios[] }
// lalu GET /api/ai/suno?task_id= hingga status_ai=SUCCESS. Kembalikan Buffer MP3 pertama.
async function suno(prompt, opts = {}) {
  const p = requirePrompt(prompt, 'Prompt lagu kosong. Contoh: suno("lagu pop ceria tentang kopi pagi")');
  const title = String(opts.title || 'Suno Song').trim() || 'Suno Song';
  const style = String(opts.style || 'Pop').trim() || 'Pop';
  const instrument = opts.instrument === true || opts.instrument === 'true' || opts.instrument === 1 || opts.instrument === '1';
  const created = await jereGet(
    '/api/ai/suno',
    { prompt: p, title, style, instrument: instrument ? 'true' : 'false' },
    60000
  );
  const c = created && typeof created === 'object' ? created : {};
  let audios = Array.isArray(c.audios) ? c.audios : [];
  let taskId = c.task_id || c.taskId || c.id || '';
  if ((!audios.length || !audios.some((a) => a && a.audio_url)) && (c.status_ai === 'SUCCESS' || c.status === 'SUCCESS')) {
    audios = Array.isArray(c.audios) ? c.audios : audios;
  }
  if (!audios.some((a) => a && a.audio_url)) {
    if (!taskId) throw new Error('Lagu Suno gagal dibuat (tanpa task_id/audio).');
    await sleep(45000); // jeda awal render ala plugin ref
    const maxChecks = 15; // ~3,5 menit
    for (let i = 0; i < maxChecks; i++) {
      const st = await jereGet('/api/ai/suno', { task_id: String(taskId) }, 30000);
      const o = st && typeof st === 'object' ? st : {};
      const list = Array.isArray(o.audios) ? o.audios : [];
      if ((o.status_ai === 'SUCCESS' || o.status === 'SUCCESS') && list.some((a) => a && a.audio_url)) {
        audios = list;
        break;
      }
      await sleep(10000);
    }
  }
  const first = (audios || []).find((a) => a && a.audio_url);
  if (!first) throw new Error('Lagu Suno belum selesai (batas tunggu habis). Coba lagi nanti.');
  return fetchBuffer(first.audio_url, 120000);
}

// --- Voice clone (audio sample + text -> voice audio) ----------------------
// Pola ref: POST /api/ai/voiceclone { action:'tts', voice_id, text } (JSON)
//   atau multipart file+action=clone+voice_id untuk daftar clone.
// Di sini: audioBuffer = sampel suara, text = kalimat; kirim multipart
//   file + text (+voice_id opsional via opts.voice_id). Kembalikan Buffer audio.
async function voiceclone(audioBuffer, text, opts = {}) {
  requireBuffer(audioBuffer, 'Audio sampel');
  const t = requirePrompt(text, 'Teks voice clone kosong. Contoh: voiceclone(buf, "halo dunia")');
  const form = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/mpeg' });
  form.append('file', blob, `voice_${Date.now()}.mp3`);
  form.append('text', t);
  const voiceId = String(opts.voice_id || opts.voiceId || '').trim();
  if (voiceId) {
    form.append('action', 'tts');
    form.append('voice_id', voiceId);
  }
  const result = await postForm('/api/ai/voiceclone', form, {}, 120000);
  return resultToBuffer(result, ['url', 'audio_url', 'audio', 'download', 'video_url'], 'Audio voice clone', 120000);
}

// --- Faceswap (2 gambar -> 1 gambar) ---------------------------------------
// Pola ref: GET /api/ai/faceswap?source=&target= (URL). Di sini buffer di-POST
// multipart (field source & target) agar tanpa host gambar eksternal.
async function faceswap(img1, img2) {
  requireBuffer(img1, 'Gambar wajah (img1)');
  requireBuffer(img2, 'Gambar target (img2)');
  const form = new FormData();
  toFile(form, 'source', img1, `source_${Date.now()}.jpg`, 'image/jpeg');
  toFile(form, 'target', img2, `target_${Date.now()}.jpg`, 'image/jpeg');
  const result = await postForm('/api/ai/faceswap', form, {}, 120000);
  return resultToBuffer(result, ['image', 'url', 'image_url', 'download'], 'Gambar faceswap');
}

// --- Upscale / Enlarger ----------------------------------------------------
// Pola ref: GET /api/ai/enlarger?url= -> gambar biner langsung.
// Di sini buffer di-POST multipart (field file); bila API balas biner/URL
// sama-sama dinormalisasi menjadi Buffer.
async function upscale(imageBuffer) {
  requireBuffer(imageBuffer, 'Gambar');
  const form = new FormData();
  toFile(form, 'file', imageBuffer, `upscale_${Date.now()}.jpg`, 'image/jpeg');
  const result = await postForm('/api/ai/enlarger', form, {}, 120000);
  return resultToBuffer(result, ['image', 'url', 'image_url', 'download'], 'Gambar upscale');
}

// --- ToAnime ----------------------------------------------------------------
// Pola ref: POST multipart file+style ke /api/ai/tocartoon -> biner image / JSON url.
async function toanime(imageBuffer, style = 'Japanese Anime') {
  requireBuffer(imageBuffer, 'Gambar');
  const st = String(style || 'Japanese Anime').trim() || 'Japanese Anime';
  const form = new FormData();
  toFile(form, 'file', imageBuffer, `toanime_${Date.now()}.jpg`, 'image/jpeg');
  form.append('style', st);
  const result = await postForm('/api/ai/tocartoon', form, {}, 120000);
  return resultToBuffer(result, ['image', 'url', 'image_url', 'download'], 'Gambar anime');
}

// --- Chat alternatif (varian chatbot, teks) ---------------------------------
// Pola ref: GET /api/ai/aichat?prompt=&model=&session_id= ; default openai/gpt-4o.
// Dukung flag "--model sisa prompt" ala plugin aichat.js bila model tak diisi.
async function chatAlt(prompt, model = '') {
  let p = String(prompt == null ? '' : prompt).trim();
  let m = String(model == null ? '' : model).trim() || 'openai/gpt-4o';
  if (!String(model || '').trim()) {
    const flag = p.match(/^--([a-zA-Z0-9_./:-]+)\s+([\s\S]+)/);
    if (flag) {
      m = flag[1].trim();
      p = (flag[2] || '').trim();
    }
  }
  requirePrompt(p, 'Prompt chat kosong. Contoh: chatAlt("halo, siapa kamu?")');
  const result = await jereGet('/api/ai/aichat', { prompt: p, model: m }, 60000);
  return resultToText(result, 'AI tidak mengembalikan jawaban.');
}

module.exports = {
  txt2img,
  txt2video,
  img2video,
  sora,
  suno,
  voiceclone,
  faceswap,
  upscale,
  toanime,
  chatAlt,
};
