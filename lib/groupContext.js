// lib/groupContext.js — identitas per-pengirim untuk grup (multi-user)
// Dipakai HANYA untuk grup (@g.us). Private tidak tersentuh.
//
// Konsep:
// - Setiap grup (groupId = jid) punya mapping senderId -> { label "User N", displayName }.
// - Label "User N" stabil per grup (counter naik, tidak dipakai ulang) agar AI bisa
//   melacak siapa bicara dengan siapa walau nama sama/ganti.
// - Format pesan grup: "[Nama | User N | senderId]: text" + baris reply/mention bila ada.
// - AI dipandu memanggil user dengan NAMA (bukan "User N") via GROUP_INSTRUCTIONS.

const MAX_SENDERS_PER_GROUP = 200;
const MAX_NAME_LEN = 30;
const MAX_QUOTED_LEN = 300;

const { EMOJI_GUIDE, PERSONA_SUMMARY } = require('./persona');

// groupId -> Map(senderId -> { label, displayName })
const groupMaps = new Map();
// groupId -> counter User N berikutnya
const groupCounters = new Map();

function cleanName(v, fallback) {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LEN);
  if (s) return s;
  const f = String(fallback || '').split('@')[0].trim().slice(0, MAX_NAME_LEN);
  return f || 'User';
}

function cleanSenderId(v) {
  return String(v || '').trim().slice(0, 100);
}

// Ambil label yang sudah ada, atau tetapkan "User N" baru untuk sender baru.
// displayName di-update bila berubah (user ganti nama) tanpa mengubah label.
function getOrAssignLabel(groupId, senderId, displayName) {
  const gid = String(groupId || '');
  const sid = cleanSenderId(senderId) || cleanName(displayName, 'unknown');
  if (!gid) return { label: 'User 1', displayName: cleanName(displayName, sid) };
  let g = groupMaps.get(gid);
  if (!g) {
    g = new Map();
    groupMaps.set(gid, g);
  }
  const name = cleanName(displayName, sid);
  const ex = g.get(sid);
  if (ex) {
    if (name && name !== ex.displayName) ex.displayName = name;
    return ex;
  }
  const n = (groupCounters.get(gid) || 0) + 1;
  groupCounters.set(gid, n);
  const ent = { label: `User ${n}`, displayName: name };
  if (g.size >= MAX_SENDERS_PER_GROUP) {
    g.delete(g.keys().next().value); // buang sender tertua bila penuh
  }
  g.set(sid, ent);
  return ent;
}

function getSenderMeta(groupId, senderId) {
  const g = groupMaps.get(String(groupId || ''));
  if (!g) return null;
  return g.get(String(senderId || '')) || null;
}

// Opsional: dipanggil saat .new/.clear bila ingin identitas grup ikut di-reset.
// Default TIDAK dipanggil (label stabil antar sesi) — disediakan untuk kebutuhan khusus.
function resetGroup(groupId) {
  groupMaps.delete(String(groupId || ''));
  groupCounters.delete(String(groupId || ''));
}

function formatMentions(mentions) {
  const arr = Array.isArray(mentions) ? mentions : [];
  return arr.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 10);
}

// Satu pesan user grup -> satu blok teks untuk prompt.
// Selalu sertakan senderId agar "senderId beda = orang beda" bisa dipahami AI.
function formatGroupMessage({ senderId, displayName, label, text, quotedText, mentions } = {}) {
  const sid = cleanSenderId(senderId) || '-';
  const lb = String(label || '').trim() || 'User ?';
  const name = cleanName(displayName, sid);
  const t = String(text || '');
  let out = `[${name} | ${lb} | ${sid}]: ${t}`;
  const q = String(quotedText || '').trim();
  if (q) out += `\n  ↩️ reply ke: "${q.slice(0, MAX_QUOTED_LEN)}"`;
  const ms = formatMentions(mentions);
  if (ms.length) out += `\n  👥 mention: ${ms.join(', ')}`;
  return out;
}

// Susun riwayat grup yang sudah tersimpan (entri user ber-meta sender diformat
// via formatGroupMessage; entri bot tetap "Bot:"; entri lama tanpa meta tetap "User:").
function buildGroupPrompt(history) {
  const arr = Array.isArray(history) ? history : [];
  return arr
    .map((h) => {
      if (!h) return '';
      if (h.role === 'bot') return `Bot: ${h.content}`;
      if (h.senderId || h.label) {
        return formatGroupMessage({
          senderId: h.senderId || '-',
          displayName: h.displayName || '',
          label: h.label || 'User ?',
          text: h.content,
          quotedText: h.quotedText || '',
          mentions: h.mentions || [],
        });
      }
      return `User: ${h.content}`;
    })
    .filter(Boolean)
    .join('\n');
}

// Blok instruksi KHUSUS grup — ditempel di depan prompt grup saja.
// Private tidak memakai blok ini.
const GROUP_INSTRUCTIONS =
  `[KONTEKS GRUP — ADA BANYAK ORANG DI SINI]\n` +
  `- Setiap pesan user diawali "[Nama | User N | senderId]". senderId yang berbeda = orang yang berbeda, ` +
  `walau namanya sama. Jangan pernah menganggap dua senderId berbeda sebagai orang yang sama.\n` +
  `- Panggil tiap user dengan NAMANYA (bagian pertama sebelum "|"), BUKAN dengan "User N". ` +
  `"User N" hanya penanda internal agar kamu tidak tertukar antar orang.\n` +
  `- Ikuti tone tiap orang: kalau dia bercanda, balas santai/nyambung bercandanya; ` +
  `kalau dia serius, jawab serius dan fokus. Jangan campur tone antar orang.\n` +
  `- Perhatikan baris "↩️ reply ke" (pesan ini membalas pesan lain) dan "👥 mention" (pesan ini menyebut user tertentu) ` +
  `untuk memahami ke SIAPA pesan ditujukan.\n` +
  `- Saat menjawab pertanyaan yang ditujukan ke bot, sebut nama penanya bila natural.\n` +
  PERSONA_SUMMARY +
  EMOJI_GUIDE;

module.exports = {
  getOrAssignLabel,
  getSenderMeta,
  resetGroup,
  formatGroupMessage,
  buildGroupPrompt,
  GROUP_INSTRUCTIONS,
};
