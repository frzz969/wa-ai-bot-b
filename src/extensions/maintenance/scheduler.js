// src/extensions/maintenance/scheduler.js (CJS).
// Interval 10 menit: bersihkan cooldown/rate Map + flood log + warn kedaluwarsa.
// Auto-start saat di-require (handlers/messages.js me-require file ini toleran-gagal).
// Idempotent: start ganda aman. Timer di-unref agar tidak menahan process exit (test/boot check).
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

let timer = null;
let started = false;

function runCleanupOnce() {
  const result = { cooldown: 0, rate: 0, flood: 0, warns: 0 };
  try {
    const { cleanupCooldowns } = require('../../guards/throttles/cooldown');
    if (typeof cleanupCooldowns === 'function') result.cooldown = cleanupCooldowns();
  } catch {}
  try {
    const { cleanupRateLimits } = require('../../guards/throttles/rate-limiter');
    if (typeof cleanupRateLimits === 'function') result.rate = cleanupRateLimits();
  } catch {}
  try {
    const { cleanupAntiFlood } = require('../safety/anti-flood');
    if (typeof cleanupAntiFlood === 'function') result.flood = cleanupAntiFlood();
  } catch {}
  try {
    const { cleanupExpiredWarns } = require('../safety/group-store');
    if (typeof cleanupExpiredWarns === 'function') result.warns = cleanupExpiredWarns();
  } catch {}
  const total = result.cooldown + result.rate + result.flood + result.warns;
  if (total > 0) console.log('[scheduler] cleanup:', JSON.stringify(result));
  return result;
}

function startScheduler(intervalMs = CLEANUP_INTERVAL_MS) {
  if (started) return timer;
  started = true;
  const ms = Number(intervalMs) > 0 ? Number(intervalMs) : CLEANUP_INTERVAL_MS;
  timer = setInterval(() => {
    try {
      runCleanupOnce();
    } catch (e) {
      console.error('[scheduler]', e?.message || e);
    }
  }, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

// Auto-start (side effect). Gagal start tidak boleh crash bot.
try {
  startScheduler();
} catch (e) {
  console.error('[scheduler] gagal start:', e?.message || e);
}

module.exports = { CLEANUP_INTERVAL_MS, startScheduler, stopScheduler, runCleanupOnce };
