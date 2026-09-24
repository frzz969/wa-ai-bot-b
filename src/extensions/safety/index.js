// src/extensions/safety/index.js — 1 hook trySafety (CJS).
// Dipakai handlers/messages.js SEBELUM tryNewRouter (dan sebelum early-return grup non-prefix
// agar spam teks biasa ikut dicek). Toleran-gagal: selalu kembalikan boolean, tak pernah throw.
// Urutan: mute -> anti-flood -> anti-link. Admin/owner/fromMe dilewati.
const store = require('./group-store');
const { checkAntiFlood } = require('./anti-flood');
const { checkAntiLink } = require('./anti-link');

let groupLane = null;
try {
  groupLane = require('../../../lib/group');
} catch {}

let OWNER_NUMBER = '';
try {
  OWNER_NUMBER = String(require('../../../config').OWNER_NUMBER || '').replace(/[^0-9]/g, '');
} catch {}

// Prefix command router Fase 1 — pesan ber-prefix dilewati anti-link agar
// command ber-URL (.play/.shortlink/dll) tidak kena hapus. Sinkron dgn ROUTER_PREFIXES handler.
const COMMAND_PREFIXES = ['.', '!', '#'];

const adminCache = new Map(); // key `${jid}|${sender}` -> { admin, exp }
const ADMIN_CACHE_MS = 60 * 1000;
const ADMIN_CACHE_MAX = 500;

function normNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

function cacheSet(k, v) {
  adminCache.set(k, v);
  while (adminCache.size > ADMIN_CACHE_MAX) {
    adminCache.delete(adminCache.keys().next().value);
  }
}

async function resolveIsAdmin(sock, jid, sender) {
  const key = `${String(jid)}|${String(sender)}`;
  const now = Date.now();
  const hit = adminCache.get(key);
  if (hit && Number(hit.exp) > now) return Boolean(hit.admin);
  let admin = false;
  if (groupLane && typeof groupLane.isAdmin === 'function') {
    admin = await groupLane.isAdmin(sock, jid, sender);
  } else {
    const meta = await sock.groupMetadata(jid);
    const list = Array.isArray(meta?.participants) ? meta.participants : [];
    for (const p of list) {
      if (String(p?.id || '') === String(sender) && (p?.admin === 'admin' || p?.admin === 'superadmin')) {
        admin = true;
        break;
      }
    }
  }
  cacheSet(key, { admin: Boolean(admin), exp: now + ADMIN_CACHE_MS });
  return Boolean(admin);
}

// true = pesan sudah ditangani (hapus/warn), caller harus stop (return).
// false = lanjutkan ke router/handler lama.
async function trySafety(sock, m, { jid, sender, text }) {
  try {
    if (!sock || !m || !jid || !sender) return false;
    if (!String(jid).endsWith('@g.us')) return false;
    if (m?.key?.fromMe) return false;

    let g;
    try {
      g = store.getGroup(jid);
    } catch {
      return false;
    }
    if (!g.antiflood && !g.antilink && !g.mute) return false;

    // Owner bypass.
    try {
      if (OWNER_NUMBER && normNum(sender) === OWNER_NUMBER) return false;
    } catch {}

    // Admin check fail-open: metadata gagal -> lewati enforcement (hindari false positive).
    let isAdmin = false;
    try {
      isAdmin = await resolveIsAdmin(sock, jid, sender);
    } catch {
      return false;
    }
    if (isAdmin) return false; // skip admin

    // Mute: hapus semua pesan non-admin, diam-diam (tanpa reply biar tidak spam).
    if (g.mute) {
      try {
        await sock.sendMessage(jid, { delete: m.key });
      } catch {}
      return true;
    }

    // Anti-flood: hitung SEMUA pesan grup (termasuk stiker/gambar tanpa teks).
    if (g.antiflood) {
      try {
        if (await checkAntiFlood(sock, m, { jid, sender })) return true;
      } catch {}
    }

    // Anti-link: lewati pesan command ber-prefix.
    if (g.antilink) {
      const body = String(text || '');
      if (body) {
        const isCmd = COMMAND_PREFIXES.includes(body.trim().charAt(0));
        if (!isCmd) {
          try {
            if (await checkAntiLink(sock, m, { jid, sender, text: body })) return true;
          } catch {}
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

module.exports = { trySafety, _adminCache: adminCache };
