// lib/group.js — LANE GRUP: fungsi admin grup (Baileys v7, CommonJS, prefix ".").
// Tidak menyentuh lane lain. Router/integrasi dilakukan terpisah oleh orchestrator
// di handlers/messages.js. File ini hanya menyediakan helpers + aksi grup.

function normNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

// Samakan dua JID (toleran @lid vs @s.whatsapp.net + device suffix ":xx").
function sameUser(a, b) {
  if (!a || !b) return false;
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return true;
  const na = normNum(sa);
  const nb = normNum(sb);
  if (na && nb && na === nb) return true;
  return sa.split('@')[0].split(':')[0] === sb.split('@')[0].split(':')[0];
}

function isGroup(jid) {
  return String(jid || '').endsWith('@g.us');
}

function isParticipantAdmin(p) {
  if (!p) return false;
  if (p.admin === 'admin' || p.admin === 'superadmin') return true;
  if (p.isAdmin || p.isSuperAdmin) return true;
  return false;
}

async function getGroupMetadata(sock, jid) {
  return await sock.groupMetadata(jid);
}

async function getParticipants(sock, jid) {
  const meta = await getGroupMetadata(sock, jid);
  return Array.isArray(meta?.participants) ? meta.participants : [];
}

function findParticipant(participants, userJid) {
  const arr = Array.isArray(participants) ? participants : [];
  return arr.find((p) => sameUser(p?.id, userJid)) || null;
}

// Cek apakah sender adalah admin/superadmin grup.
async function isAdmin(sock, jid, sender) {
  const parts = await getParticipants(sock, jid);
  const me = findParticipant(parts, sender);
  return isParticipantAdmin(me);
}

// Alias eksplisit (nama lama) — sama dengan isAdmin.
async function isSenderAdmin(sock, jid, sender) {
  return await isAdmin(sock, jid, sender);
}

function botId(sock) {
  const id = sock?.user?.id || '';
  return String(id).split(':')[0];
}

// Cek apakah BOT sendiri admin grup.
async function isBotAdmin(sock, jid) {
  const parts = await getParticipants(sock, jid);
  const me = findParticipant(parts, botId(sock)) || findParticipant(parts, sock?.user?.id);
  return isParticipantAdmin(me);
}

// ---- Guards (return null bila lolos, atau teks error bila gagal) ----
function guardGroup(jid) {
  if (!isGroup(jid)) return '❌ Perintah ini khusus grup.';
  return null;
}

async function guardAdmin(sock, jid, sender) {
  const g = guardGroup(jid);
  if (g) return g;
  try {
    const ok = await isAdmin(sock, jid, sender);
    if (!ok) return '❌ Khusus admin grup.';
    return null;
  } catch {
    return '❌ Gagal cek admin grup. Coba lagi.';
  }
}

async function guardBotAdmin(sock, jid) {
  const g = guardGroup(jid);
  if (g) return g;
  try {
    const ok = await isBotAdmin(sock, jid);
    if (!ok) return '❌ Bot harus jadi admin dulu.';
    return null;
  } catch {
    return '❌ Gagal cek status bot. Coba lagi.';
  }
}

// Ambil display list "@user" + mentions array dari participants.
function buildMentions(participants) {
  const ids = (Array.isArray(participants) ? participants : [])
    .map((p) => String(p?.id || p || ''))
    .filter(Boolean);
  const text = ids.map((id) => '@' + id.split('@')[0].split(':')[0]).join(' ');
  return { ids, text };
}

// .tagall — sebut semua anggota (tampilkan daftar).
async function tagall(sock, jid, m, extraText) {
  const parts = await getParticipants(sock, jid);
  const { ids, text } = buildMentions(parts);
  const msg = (extraText ? String(extraText).trim() + '\n\n' : '') + '📢 *TAG ALL*\n' + text;
  return await sock.sendMessage(jid, { text: msg, mentions: ids }, m ? { quoted: m } : undefined);
}

// .hidetag — sebut semua anggota tanpa daftar terlihat (teks saja + mentions).
async function hidetag(sock, jid, text, m) {
  const parts = await getParticipants(sock, jid);
  const { ids } = buildMentions(parts);
  return await sock.sendMessage(jid, { text: String(text || ''), mentions: ids }, m ? { quoted: m } : undefined);
}

// Aksi membership via Baileys v7: sock.groupParticipantsUpdate(jid, [targets], action)
async function kick(sock, jid, targets) {
  const arr = Array.isArray(targets) ? targets : [targets];
  const clean = arr.map(String).filter(Boolean);
  if (!clean.length) throw new Error('kick: target kosong');
  return await sock.groupParticipantsUpdate(jid, clean, 'remove');
}

async function addMembers(sock, jid, numbers) {
  const arr = Array.isArray(numbers) ? numbers : [numbers];
  const jids = arr
    .map((n) => String(n || '').replace(/[^0-9]/g, ''))
    .filter(Boolean)
    .map((n) => n + '@s.whatsapp.net');
  if (!jids.length) throw new Error('add: nomor kosong');
  return await sock.groupParticipantsUpdate(jid, jids, 'add');
}

async function promote(sock, jid, targets) {
  const arr = (Array.isArray(targets) ? targets : [targets]).map(String).filter(Boolean);
  if (!arr.length) throw new Error('promote: target kosong');
  return await sock.groupParticipantsUpdate(jid, arr, 'promote');
}

async function demote(sock, jid, targets) {
  const arr = (Array.isArray(targets) ? targets : [targets]).map(String).filter(Boolean);
  if (!arr.length) throw new Error('demote: target kosong');
  return await sock.groupParticipantsUpdate(jid, arr, 'demote');
}

// .linkgc — ambil invite link grup.
async function getInviteLink(sock, jid) {
  const code = await sock.groupInviteCode(jid);
  return 'https://chat.whatsapp.com/' + String(code || '').trim();
}

// .buka / .tutup — groupSettingUpdate('not_announcement' | 'announcement')
async function openGroup(sock, jid) {
  return await sock.groupSettingUpdate(jid, 'not_announcement');
}

async function closeGroup(sock, jid) {
  return await sock.groupSettingUpdate(jid, 'announcement');
}

// Ganti nama / deskripsi grup.
async function setGroupName(sock, jid, name) {
  const n = String(name || '').trim();
  if (!n) throw new Error('setGroupName: nama kosong');
  return await sock.groupUpdateSubject(jid, n.slice(0, 100));
}

async function setGroupDesc(sock, jid, desc) {
  return await sock.groupUpdateDescription(jid, String(desc || ''));
}

// Info ringkas grup untuk balasan .infogc.
function groupInfoText(meta) {
  const name = meta?.subject || '-';
  const desc = String(meta?.desc || '').slice(0, 300);
  const total = Array.isArray(meta?.participants) ? meta.participants.length : 0;
  const admins = (Array.isArray(meta?.participants) ? meta.participants : []).filter(isParticipantAdmin).length;
  return `👥 *${name}*\nAnggota: ${total} | Admin: ${admins}${desc ? `\n📝 ${desc}` : ''}`;
}

// Helper: kumpulkan target dari mention / quoted sender / angka di args.
// Dipakai orchestrator saat wiring .kick/.promote/.demote.
function resolveTargets(m, argsText) {
  const out = [];
  try {
    const inner = (m?.message || {});
    const ctx =
      inner?.extendedTextMessage?.contextInfo ||
      inner?.imageMessage?.contextInfo ||
      inner?.videoMessage?.contextInfo ||
      null;
    for (const j of ctx?.mentionedJid || []) out.push(String(j));
    const quotedSender = ctx?.participant;
    if (quotedSender && !out.length) out.push(String(quotedSender));
  } catch { /* abaikan */ }
  const nums = String(argsText || '').match(/\+?\d{8,16}/g) || [];
  for (const n of nums) {
    const digits = String(n).replace(/[^0-9]/g, '');
    if (digits) out.push(digits + '@s.whatsapp.net');
  }
  return [...new Set(out.map(String).filter(Boolean))];
}

module.exports = {
  normNum,
  sameUser,
  isGroup,
  isParticipantAdmin,
  getGroupMetadata,
  getParticipants,
  findParticipant,
  isAdmin,
  isSenderAdmin,
  isBotAdmin,
  botId,
  guardGroup,
  guardAdmin,
  guardBotAdmin,
  buildMentions,
  tagall,
  hidetag,
  kick,
  addMembers,
  promote,
  demote,
  getInviteLink,
  openGroup,
  closeGroup,
  setGroupName,
  setGroupDesc,
  groupInfoText,
  resolveTargets,
};
