// src/guards/pipeline.js — urutan guard: ban → rate-limit → cooldown → owner → group → admin (CJS).
// Referensi: Haruna-Bot src/guards/pipeline.js (diadaptasi ke ctx boolean repo ini).
const { checkBanned } = require('./throttles/ban-check');
const { checkRateLimit } = require('./throttles/rate-limiter');
const { checkCooldown } = require('./throttles/cooldown');
const { checkOwner } = require('./restrictions/owner-only');
const { checkGroup } = require('./restrictions/group-only');
const { checkAdmin } = require('./restrictions/admin-only');

const PIPELINE = [
  checkBanned,
  checkRateLimit,
  checkCooldown,
  checkOwner,
  checkGroup,
  checkAdmin,
];

async function runPipeline(ctx, command) {
  for (const guard of PIPELINE) {
    try {
      const ok = await guard(ctx, command);
      if (ok === false) return false;
    } catch (e) {
      console.error('[guard]', e?.message || e);
      return false; // gagal guard = blokir aman
    }
  }
  return true;
}

module.exports = { PIPELINE, runPipeline };
