// src/guards/throttles/rate-limiter.js — max 5 command / 10 detik per user (CJS).
// Referensi: Haruna-Bot src/guards/throttles/rate-limiter.js (diadaptasi tanpa node-cache/ESM).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 1000;

const hits = new Map(); // sender -> number[] timestamp ms

function prune(arr, now) {
  const cut = now - RATE_LIMIT_WINDOW_MS;
  while (arr.length && arr[0] <= cut) arr.shift();
  return arr;
}

async function checkRateLimit(ctx /* , command */) {
  // Owner bebas rate-limit.
  if (ctx && ctx.isOwner) return true;
  const now = Date.now();
  const k = String((ctx && ctx.sender) || '');
  if (!k) return true;
  let arr = hits.get(k);
  if (!arr) {
    arr = [];
    hits.set(k, arr);
  }
  prune(arr, now);
  arr.push(now);
  // Batasi memori: simpan max 2x lipat window.
  if (arr.length > RATE_LIMIT_MAX * 4) arr.splice(0, arr.length - RATE_LIMIT_MAX * 4);
  if (arr.length > RATE_LIMIT_MAX) {
    // Balas hanya saat pertama kali melewati batas di window ini (hindari spam).
    if (arr.length === RATE_LIMIT_MAX + 1) {
      try {
        await ctx.reply('🐢 Terlalu banyak command! Tunggu sebentar ya (~10 detik).');
      } catch {}
    }
    return false;
  }
  return true;
}

function resetRateLimit(sender) {
  hits.delete(String(sender || ''));
}

// Bersihkan timestamp kedaluwarsa + key kosong (dipakai scheduler Fase 2 tiap 10 menit).
function cleanupRateLimits(now = Date.now()) {
  let removed = 0;
  for (const [k, arr] of hits) {
    if (!Array.isArray(arr)) {
      hits.delete(k);
      removed++;
      continue;
    }
    const before = arr.length;
    prune(arr, Number(now));
    removed += before - arr.length;
    if (!arr.length) {
      hits.delete(k);
      removed++;
    }
  }
  return removed;
}

module.exports = { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS, checkRateLimit, resetRateLimit, cleanupRateLimits, _hits: hits };
