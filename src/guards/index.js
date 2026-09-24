// src/guards/index.js — re-export guard agar mudah di-require (CJS).
const { runPipeline, PIPELINE } = require('./pipeline');
const { checkBanned, isBanned } = require('./throttles/ban-check');
const { checkRateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } = require('./throttles/rate-limiter');
const { checkCooldown, check, set, clear, formatDuration, enablePersist } = require('./throttles/cooldown');
const { checkOwner } = require('./restrictions/owner-only');
const { checkGroup } = require('./restrictions/group-only');
const { checkAdmin } = require('./restrictions/admin-only');

module.exports = {
  runPipeline,
  PIPELINE,
  checkBanned,
  isBanned,
  checkRateLimit,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  checkCooldown,
  check,
  set,
  clear,
  formatDuration,
  enablePersist,
  checkOwner,
  checkGroup,
  checkAdmin,
};
