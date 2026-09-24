// src/guards/throttles/cooldown.js — cooldown per user+command (CJS).
// Map in-memory; persist opsional via file JSON (tahan restart).
// Referensi: Haruna-Bot src/guards/throttles/cooldown.js + src/storage/models/cooldown.js
// (diadaptasi: tanpa DB server, tanpa ESM).
const fs = require('fs');
const path = require('path');

const store = new Map(); // key `${sender}:${command}` -> expiresAt (ms epoch)
let persistFile = null;
let persistTimer = null;

function keyOf(sender, commandName) {
  return `${String(sender || '')}::${String(commandName || '').toLowerCase()}`;
}

function formatDuration(ms) {
  const s = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
  if (s < 60) return `${s} detik`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} mnt ${rest} dtk` : `${m} menit`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} jam ${rm} menit` : `${h} jam`;
}

// Aktifkan persist opsional. Contoh: enablePersist(path.join(__dirname,'..','..','..','database','cooldown.json'))
function enablePersist(file, saveIntervalMs = 30000) {
  persistFile = file;
  // Load awal (toleran rusak).
  try {
    if (persistFile && fs.existsSync(persistFile)) {
      const raw = fs.readFileSync(persistFile, 'utf8').trim();
      if (raw) {
        const d = JSON.parse(raw);
        const now = Date.now();
        if (d && typeof d === 'object') {
          for (const [k, exp] of Object.entries(d)) {
            if (Number(exp) > now) store.set(k, Number(exp));
          }
        }
      }
    }
  } catch {}
  if (persistTimer) clearInterval(persistTimer);
  if (persistFile) {
    persistTimer = setInterval(() => {
      try {
        const now = Date.now();
        const obj = {};
        for (const [k, exp] of store) {
          if (Number(exp) > now) obj[k] = Number(exp);
        }
        fs.mkdirSync(path.dirname(persistFile), { recursive: true });
        fs.writeFileSync(persistFile, JSON.stringify(obj, null, 2));
      } catch {}
    }, saveIntervalMs);
    if (persistTimer.unref) persistTimer.unref();
  }
}

function check(sender, commandName) {
  const k = keyOf(sender, commandName);
  const exp = store.get(k);
  if (!exp) return 0;
  const remaining = Number(exp) - Date.now();
  if (remaining <= 0) {
    store.delete(k);
    return 0;
  }
  return remaining;
}

function set(sender, commandName, durationMs) {
  const ms = Number(durationMs || 0);
  if (ms <= 0) return;
  store.set(keyOf(sender, commandName), Date.now() + ms);
}

function clear(sender, commandName) {
  store.delete(keyOf(sender, commandName));
}

// Guard pipeline: cek sisa cooldown, tolak + reply bila masih aktif,
// catat cooldown BARU setelah lolos (dievaluasi sebelum execute).
async function checkCooldown(ctx, command) {
  const ms = Number(command && command.cooldown || 0);
  if (!ms || ms <= 0) return true;
  const remaining = check(ctx.sender, command.name);
  if (remaining > 0) {
    try {
      await ctx.reply(`⏳ Tunggu ${formatDuration(remaining)} sebelum pakai *${command.name}* lagi.`);
    } catch {}
    return false;
  }
  set(ctx.sender, command.name, ms);
  return true;
}

// Bersihkan entri kedaluwarsa (dipakai scheduler Fase 2 tiap 10 menit).
function cleanupCooldowns(now = Date.now()) {
  let removed = 0;
  for (const [k, exp] of store) {
    if (Number(exp) <= Number(now)) {
      store.delete(k);
      removed++;
    }
  }
  return removed;
}

module.exports = { check, set, clear, checkCooldown, formatDuration, enablePersist, cleanupCooldowns, _store: store };
