// lib/public-api.js — API publik gratis tanpa key untuk fitur tambahan.
// Endpoint dipakai: Nexray API publik. Semua request punya timeout dan error handling.
// Jangan menaruh API key atau pembayaran di file ini.
const DEFAULT_BASE = 'https://api.nexray.eu.cc';
const BASE = String(process.env.PUBLIC_API_BASE || DEFAULT_BASE).replace(/\/+$/, '');

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

async function request(path, params = {}, timeoutMs = 60000) {
  const url = new URL(path.startsWith('http') ? path : BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== '') url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8', 'User-Agent': 'wa-ai-bot-b/1.0' },
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) {
      const detail = data?.error || data?.message || `HTTP ${res.status}`;
      const err = new Error(`API publik gagal: ${detail}`);
      err.code = 'PUBLIC_API_HTTP';
      err.status = res.status;
      throw err;
    }
    if (!data || data.status === false) {
      const err = new Error(data?.error || 'API publik mengembalikan status gagal.');
      err.code = 'PUBLIC_API_STATUS';
      throw err;
    }
    return data.result;
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error('API publik terlalu lama merespons. Coba lagi sebentar.');
      err.code = 'PUBLIC_API_TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function pickAioVideo(result) {
  const medias = Array.isArray(result?.medias) ? result.medias : [];
  const videos = medias.filter((x) => x && x.type === 'video' && x.url);
  if (!videos.length) return null;
  const progressive = videos.find((x) => Number(x.formatId) === 18 && String(x.ext).toLowerCase() === 'mp4');
  if (progressive) return progressive;
  const mp4 = videos.filter((x) => String(x.ext).toLowerCase() === 'mp4');
  const pool = mp4.length ? mp4 : videos;
  return pool
    .filter((x) => !Number(x.height) || Number(x.height) <= 720)
    .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0))[0] || pool[0];
}

async function aio(input) {
  const url = requireUrl(input);
  const result = await request('/downloader/aio', { url }, 90000);
  const media = pickAioVideo(result);
  if (!media) throw new Error('API publik tidak menemukan video yang bisa dikirim.');
  return { ...result, media };
}

async function spotify(input) {
  const url = requireUrl(input);
  return await request('/downloader/spotify', { url }, 90000);
}

async function googleDrive(input) {
  const url = requireUrl(input);
  return await request('/downloader/googledrive', { url }, 90000);
}

async function deepSearch(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('Tulis pertanyaan atau topik untuk deep search.');
  return await request('/ai/deepsearch', { text }, 120000);
}

module.exports = {
  BASE,
  aio,
  spotify,
  googleDrive,
  deepSearch,
  pickAioVideo,
};
