// lib/tts.js — Text-to-speech: utama Edge TTS (node-edge-tts), fallback Google Translate TTS
const fs = require('fs');
const os = require('os');
const path = require('path');

function withTimeoutMs(promise, ms, label) {
  let t;
  const to = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error((label || 'Timeout') + ' ' + ms + 'ms')), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), to]);
}

// Edge TTS -> MP3 buffer. voice default id-ID-ArdiNeural. Timeout 15 detik.
async function ttsEdge(text, voice = 'id-ID-ArdiNeural') {
  let EdgeTTS;
  try {
    ({ EdgeTTS } = require('node-edge-tts'));
  } catch {
    throw new Error('edge-missing');
  }
  const tts = new EdgeTTS({ voice, lang: 'id-ID', timeout: 15000 });
  const tmp =
    path.join(os.tmpdir(), `edge-${Date.now()}-${Math.floor(Math.random() * 1e6)}.mp3`);
  try {
    await withTimeoutMs(tts.ttsPromise(String(text), tmp), 15000, 'Edge TTS');
    const buf = await fs.promises.readFile(tmp);
    if (!buf.length) throw new Error('Edge audio kosong');
    return buf;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

// Fallback: Google Translate TTS satu chunk -> MP3 buffer
async function googleTTSChunk(chunk) {
  const url =
    `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}` +
    `&tl=id&client=tw-ob`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      Referer: 'https://translate.google.com/',
    },
  });
  if (!res.ok) throw new Error('TTS HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { ttsEdge, googleTTSChunk };
