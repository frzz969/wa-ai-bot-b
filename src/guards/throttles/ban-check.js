// src/guards/throttles/ban-check.js — tolak user yang di-ban (CJS).
// Sumber ban: database/banned.json (array JID) bila ada; tidak ada file = tidak ada yang di-ban.
// Owner tidak pernah diblokir.
const fs = require('fs');
const path = require('path');

const BANNED_FILE = path.join(__dirname, '..', '..', '..', 'database', 'banned.json');

function loadBanned() {
  try {
    if (!fs.existsSync(BANNED_FILE)) return [];
    const raw = fs.readFileSync(BANNED_FILE, 'utf8').trim();
    if (!raw) return [];
    const d = JSON.parse(raw);
    return Array.isArray(d) ? d.map(String) : [];
  } catch {
    return [];
  }
}

function isBanned(sender) {
  const list = loadBanned();
  return list.includes(String(sender || ''));
}

async function checkBanned(ctx /* , command */) {
  if (ctx && ctx.isOwner) return true;
  if (isBanned(ctx && ctx.sender)) return false; // diam-diam tolak (tanpa reply)
  return true;
}

module.exports = { isBanned, checkBanned, BANNED_FILE };
