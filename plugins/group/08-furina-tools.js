// plugins/group/08-furina-tools.js — GROUP TOOLS ala Furina (sider/vote/votekick/mute/welcome-text/resetlink/ephemeral).
//
// Plugin BARU saja: tidak menyentuh handlers/menu.js maupun plugin grup lain.
// Kontrak: async (ctx) => true bila tertangani. ctx = { sock, m, jid, isGroup, sender, body, cmd, args, prefix, ... }.
// Guards + aksi grup memakai pola yang sama dengan plugins/group/06-group.js (groupLane + safeReply).
//
// CATATAN STATUS HOOK (dibaca lane owner):
// - Join : event 'group-participants.update' SUDAH tersambung (index.js -> handleParticipantsUpdate di
//          handlers/messages.js, action 'add'), tapi handler itu mengirim teks default. Teks custom dari
//          .setwelcome baru kepakai setelah handler tersebut memanggil getWelcomeReply(sock, jid, userJids)
//          yang di-export file ini (tinggal 1 baris wiring, milik lane lain).
// - Leave: event socket-nya ada, tapi handleParticipantsUpdate mengabaikan action selain 'add',
//          jadi teks custom .setleft tersimpan saja dan BELUM terkirim otomatis (butuh wiring lane lain).
// - Sider: repo TIDAK punya store riwayat pesan per user (lib/memory.js hanya konteks AI, capped) —
//          jadi dipakai pendekatan daftar member + disclaimer (bukan data aktivitas real).
// - Ephemeral: Baileys v7 rc14 Mendukung sock.groupToggleEphemeral(jid, detik) — dipakai langsung
//          (feature-detected; bila API tidak ada, bot melapor jujur, tanpa implementasi palsu).
const S = require('../../handlers/state');
const { groupLane, systems, safeReply } = S;

// ---------- Store in-memory (cache) + persist via systems.getGreet/setGreet ----------
const votes = new Map(); // jid -> { topic, by, up:Set, down:Set, at }
const votekicks = new Map(); // jid -> { target, by, up:Set, down:Set, at }
const greetTexts = new Map(); // jid -> { welcome?: string, left?: string } (cache; sumber utama: systems greet.json)

const VOTEKICK_MIN = 3; // ambang tetap ala Furina; grup kecil menyesuaikan otomatis (lihat requiredVotes)

function keyOf(jid) {
  return String(jid || '').trim();
}

// Samarkan nomor: 6281234567890 -> 62812****890
function maskNum(num) {
  const d = String(num || '').replace(/[^0-9]/g, '');
  if (d.length <= 7) return d.slice(0, 2) + '****';
  return d.slice(0, 5) + '****' + d.slice(-3);
}

function jidToNum(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

// Ambang votekick: minimal 3 upvote, tapi tidak boleh melebihi mayoritas kecil grup.
// eligible = anggota non-admin non-bot (yang wajar ikut voting).
function requiredVotes(eligibleCount) {
  const n = Math.max(1, Number(eligibleCount || 1));
  const majority = Math.ceil(n / 2);
  return Math.max(1, Math.min(VOTEKICK_MIN, majority));
}

function voteStatusText(jid, prefix) {
  const v = votes.get(keyOf(jid));
  const vk = votekicks.get(keyOf(jid));
  if (!v && !vk) return `Belum ada voting aktif. Mulai dengan ${prefix}vote <topik> atau ${prefix}votekick @user (admin).`;
  const out = [];
  if (v) {
    out.push(
      `🗳️ *VOTE:* ${v.topic}\n` +
      `✅ Up: ${v.up.size}  |  ❌ Down: ${v.down.size}\n` +
      `Ketik ${prefix}upvote / ${prefix}downvote untuk bersuara.`
    );
  }
  if (vk) {
    out.push(
      `👢 *VOTEKICK:* @${jidToNum(vk.target)}\n` +
      `✅ Setuju: ${vk.up.size} (butuh ${vk.need})  |  ❌ Tolak: ${vk.down.size}\n` +
      `Ketik ${prefix}upvote untuk setuju, ${prefix}downvote untuk menolak.`
    );
  }
  return out.join('\n\n');
}

// ---------- Helper teks join/leave custom (dipakai lane owner untuk wiring) ----------
// Ganti placeholder: "@tag" atau "{tag}" -> mention user; "{grup}" -> nama grup (best-effort).
// Return null bila tidak ada teks custom / welcome OFF -> caller pakai teks default lama.
// Baca dari store persisten: cache (greetTexts) dulu, lalu systems.getGreet bila tersedia.
function readStoredGreet(jid) {
  const k = keyOf(jid);
  let cached = {};
  try {
    cached = greetTexts.get(k) || {};
  } catch { cached = {}; }
  try {
    if (systems && typeof systems.getGreet === 'function') {
      const persisted = systems.getGreet(jid) || {};
      const merged = {
        ...(cached || {}),
        ...(persisted || {}),
      };
      // Segarkan cache agar baca berikutnya cepat.
      try {
        if (merged.welcome || merged.left) greetTexts.set(k, merged);
        else if (cached.welcome || cached.left) greetTexts.set(k, cached);
      } catch { /* abaikan */ }
      if (merged.welcome || merged.left) return merged;
      return cached || {};
    }
  } catch { /* abaikan, pakai cache */ }
  return cached || {};
}

function saveStoredGreet(jid, obj) {
  const k = keyOf(jid);
  const cur = (() => { try { return greetTexts.get(k) || {}; } catch { return {}; } })();
  const next = { ...cur, ...(obj || {}) };
  try {
    greetTexts.set(k, next);
  } catch { /* abaikan */ }
  try {
    if (systems && typeof systems.setGreet === 'function') {
      systems.setGreet(jid, obj || {});
    }
  } catch { /* abaikan */ }
  return next;
}
function renderGreet(raw, userJids, groupName) {
  let text = String(raw || '');
  const ids = (Array.isArray(userJids) ? userJids : []).map(String).filter(Boolean);
  const tags = ids.map((id) => '@' + jidToNum(id)).join(' ');
  text = text.replace(/\{tag\}/gi, tags).replace(/@tag/gi, tags);
  text = text.replace(/\{grup\}/gi, String(groupName || 'grup ini'));
  return { text, mentions: ids };
}

async function getWelcomeReply(sock, jid, userJids) {
  try {
    const g = readStoredGreet(jid);
    if (!g || !g.welcome) return null;
    if (systems && typeof systems.isWelcomeOn === 'function' && !systems.isWelcomeOn(jid)) return null;
    let name = '';
    try {
      const meta = await sock.groupMetadata(jid);
      name = meta?.subject || '';
    } catch { /* abaikan, pakai fallback */ }
    return renderGreet(g.welcome, userJids, name);
  } catch {
    return null;
  }
}

async function getLeftReply(sock, jid, userJids) {
  try {
    const g = readStoredGreet(jid);
    if (!g || !g.left) return null;
    let name = '';
    try {
      const meta = await sock.groupMetadata(jid);
      name = meta?.subject || '';
    } catch { /* abaikan */ }
    return renderGreet(g.left, userJids, name);
  } catch {
    return null;
  }
}

async function handleFurinaTools(ctx) {
  const { sock, m, jid, isGroup, sender, cmd, args, prefix } = ctx;

  // ===== 1. sider — daftar non-admin (member-list + disclaimer, tanpa riwayat chat) =====
  if (cmd === 'sider') {
    const g = groupLane.guardGroup(jid);
    if (g) { await safeReply(sock, jid, g, m); return true; }
    try {
      const parts = await groupLane.getParticipants(sock, jid);
      const members = parts.filter((p) => !groupLane.isParticipantAdmin(p));
      if (!members.length) { await safeReply(sock, jid, '👻 Tidak ada member non-admin di grup ini.', m); return true; }
      const lines = members.map((p, i) => {
        const num = jidToNum(p?.id);
        return `${i + 1}. ${maskNum(num)}`;
      });
      await safeReply(
        sock, jid,
        `👻 *SIDER (${members.length} non-admin):*\n${lines.join('\n')}\n\n` +
        `_Catatan: berdasar daftar member, bukan riwayat chat (bot tidak menyimpan histori aktivitas)._`,
        m
      );
    } catch (e) {
      console.error('sider', e?.message || e);
      await safeReply(sock, jid, '❌ Gagal ambil daftar member. Coba lagi.', m);
    }
    return true;
  }

  // ===== 2. vote / upvote / downvote / checkvote / delvote (key = jid grup) =====
  if (cmd === 'vote') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const topic = String(args || '').trim().slice(0, 300);
    if (!topic) { await safeReply(sock, jid, `Contoh: ${prefix}vote Libur hari Minggu?`, m); return true; }
    votes.set(keyOf(jid), { topic, by: sender, up: new Set(), down: new Set(), at: Date.now() });
    votekicks.delete(keyOf(jid)); // satu jenis voting aktif per grup (hindari suara ganda makna)
    await safeReply(
      sock, jid,
      `🗳️ *VOTING DIMULAI*\n📌 ${topic}\n\nKetik ${prefix}upvote (setuju) / ${prefix}downvote (tolak).\nSatu user satu suara — ganti pilihan otomatis memindahkan suaramu.`,
      m
    );
    return true;
  }
  if (cmd === 'upvote' || cmd === 'downvote') {
    const g = groupLane.guardGroup(jid);
    if (g) { await safeReply(sock, jid, g, m); return true; }
    const k = keyOf(jid);
    const v = votes.get(k);
    const vk = votekicks.get(k);
    if (!v && !vk) { await safeReply(sock, jid, `Belum ada voting aktif. Admin bisa mulai via ${prefix}vote <topik>.`, m); return true; }
    const me = String(sender || '');
    if (v) {
      if (cmd === 'upvote') { v.up.add(me); v.down.delete(me); }
      else { v.down.add(me); v.up.delete(me); }
      await safeReply(sock, jid, `✅ Suaramu dicatat (${cmd === 'upvote' ? 'SETUJU' : 'TOLAK'}).\n${voteStatusText(jid, prefix)}`, m);
      return true;
    }
    // votekick aktif: upvote = setuju kick, downvote = tolak kick
    if (cmd === 'upvote') { vk.up.add(me); vk.down.delete(me); }
    else { vk.down.add(me); vk.up.delete(me); }
    if (vk.up.size >= vk.need) {
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, `${gb}\nVoting tercapai (${vk.up.size}/${vk.need}) tapi eksekusi batal.`, m); votekicks.delete(k); return true; }
      try {
        await groupLane.kick(sock, jid, [vk.target]);
        votekicks.delete(k);
        await safeReply(sock, jid, `👢 Votekick lolos (${vk.up.size}/${vk.need}) — @${jidToNum(vk.target)} dikeluarkan.`, m);
      } catch (e) {
        console.error('votekick-exec', e?.message || e);
        votekicks.delete(k);
        await safeReply(sock, jid, '❌ Voting lolos tapi gagal kick. Pastikan target valid & bot admin.', m);
      }
      return true;
    }
    await safeReply(sock, jid, `✅ Suaramu dicatat.\n${voteStatusText(jid, prefix)}`, m);
    return true;
  }
  if (cmd === 'checkvote') {
    const g = groupLane.guardGroup(jid);
    if (g) { await safeReply(sock, jid, g, m); return true; }
    const vk = votekicks.get(keyOf(jid));
    if (vk) {
      const ids = [...vk.up].map(String).filter(Boolean);
      const text = `${voteStatusText(jid, prefix)}`;
      if (ids.length) await sock.sendMessage(jid, { text, mentions: ids }, { quoted: m }).catch(() => safeReply(sock, jid, text, m));
      else await safeReply(sock, jid, text, m);
    } else {
      await safeReply(sock, jid, voteStatusText(jid, prefix), m);
    }
    return true;
  }
  if (cmd === 'delvote') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const k = keyOf(jid);
    const hadVote = votes.delete(k);
    const hadKick = votekicks.delete(k);
    await safeReply(sock, jid, (hadVote || hadKick) ? '🗑️ Voting grup ditutup/dihapus.' : 'Tidak ada voting aktif di grup ini.', m);
    return true;
  }

  // ===== 3. votekick @tag — voting kick, eksekusi via sock yang sama seperti .kick =====
  if (cmd === 'votekick') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const targets = groupLane.resolveTargets(m, args);
    if (!targets.length) { await safeReply(sock, jid, `Contoh: ${prefix}votekick @user`, m); return true; }
    const target = String(targets[0]);
    try {
      const parts = await groupLane.getParticipants(sock, jid);
      const tp = groupLane.findParticipant(parts, target);
      if (tp && groupLane.isParticipantAdmin(tp)) { await safeReply(sock, jid, '❌ Tidak bisa votekick admin grup.', m); return true; }
      const botNum = String(sock?.user?.id || '').split(':')[0].split('@')[0];
      if (botNum && jidToNum(target) === botNum) { await safeReply(sock, jid, '❌ Tidak bisa votekick bot.', m); return true; }
      const eligible = parts.filter((p) => !groupLane.isParticipantAdmin(p) && jidToNum(p?.id) !== botNum).length;
      const need = requiredVotes(eligible);
      votekicks.set(keyOf(jid), { target, by: sender, up: new Set(), down: new Set(), at: Date.now(), need });
      votes.delete(keyOf(jid)); // satu jenis voting aktif per grup
      await safeReply(
        sock, jid,
        `👢 *VOTEKICK:* @${jidToNum(target)}\nButuh ${need} suara SETUJU (minimal 3 / mayoritas kecil).\nKetik ${prefix}upvote untuk setuju, ${prefix}downvote untuk menolak.`,
        m
      );
    } catch (e) {
      console.error('votekick', e?.message || e);
      await safeReply(sock, jid, '❌ Gagal mulai votekick. Coba lagi.', m);
    }
    return true;
  }

  // ===== 4. mute / unmute — kunci grup (announcement mode) =====
  if (cmd === 'mute' || cmd === 'unmute') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const gb = await groupLane.guardBotAdmin(sock, jid);
    if (gb) { await safeReply(sock, jid, gb, m); return true; }
    try {
      if (cmd === 'mute') {
        await groupLane.closeGroup(sock, jid); // groupSettingUpdate 'announcement'
        await safeReply(sock, jid, '🔒 Grup di-mute — hanya admin yang bisa chat.', m);
      } else {
        await groupLane.openGroup(sock, jid); // groupSettingUpdate 'not_announcement'
        await safeReply(sock, jid, '🔓 Grup di-unmute — semua anggota bisa chat.', m);
      }
    } catch (e) {
      console.error(cmd, e?.message || e);
      await safeReply(sock, jid, `❌ Gagal ${cmd}. Pastikan bot admin.`, m);
    }
    return true;
  }

  // ===== 5. setwelcome / setleft / welcome on|off =====
  if (cmd === 'setwelcome' || cmd === 'setleft') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const text = String(args || '').trim().slice(0, 1000);
    if (!text) { await safeReply(sock, jid, `Contoh: ${prefix}${cmd} Halo @tag, selamat datang di {grup}!`, m); return true; }
    if (cmd === 'setwelcome') saveStoredGreet(jid, { welcome: text });
    else saveStoredGreet(jid, { left: text });
    const note = cmd === 'setwelcome'
      ? 'Hook join sudah ada, tapi teks custom baru terkirim setelah wiring getWelcomeReply (milik lane lain).'
      : 'Hook leave BELUM tersambung (handler hanya proses join) — teks tersimpan, belum terkirim otomatis.';
    await safeReply(sock, jid, `✅ Teks ${cmd === 'setwelcome' ? 'welcome' : 'left'} tersimpan.\n${note}`, m);
    return true;
  }
  if (cmd === 'welcome') {
    // Fallback: handler kanonis ada di plugins/group/06-group.js (file-backed via lib/systems).
    // Cabang ini hanya jalan bila handler kanonis tidak menangani; state-nya SAMA (tidak divergen).
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const sub = String(args || '').trim().toLowerCase();
    if (sub === 'on') { systems.welcomeOn(jid); await safeReply(sock, jid, '✅ Welcome ON.', m); return true; }
    if (sub === 'off') { systems.welcomeOff(jid); await safeReply(sock, jid, '✅ Welcome OFF.', m); return true; }
    const cur = readStoredGreet(jid);
    await safeReply(
      sock, jid,
      `Contoh: ${prefix}welcome on / off (saat ini: ${systems.isWelcomeOn(jid) ? 'ON' : 'OFF'})` +
      (cur && (cur.welcome || cur.left) ? `\n📝 Custom tersimpan: ${cur.welcome ? 'welcome ✅' : ''}${cur.welcome && cur.left ? ' + ' : ''}${cur.left ? 'left ✅' : ''}` : ''),
      m
    );
    return true;
  }

  // ===== 6. resetlink — reset invite code grup =====
  if (cmd === 'resetlink') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const gb = await groupLane.guardBotAdmin(sock, jid);
    if (gb) { await safeReply(sock, jid, gb, m); return true; }
    try {
      const code = await sock.groupRevokeInvite(jid);
      await safeReply(sock, jid, `🔗 *Link grup baru:*\nhttps://chat.whatsapp.com/${String(code || '').trim()}\n_Link lama sudah tidak berlaku._`, m);
    } catch (e) {
      console.error('resetlink', e?.message || e);
      await safeReply(sock, jid, '❌ Gagal reset link. Pastikan bot admin.', m);
    }
    return true;
  }

  // ===== 7. ephemeral on|off|1h|1d|7d|90d — pesan sementara grup =====
  if (cmd === 'ephemeral') {
    const ga = await groupLane.guardAdmin(sock, jid, sender);
    if (ga) { await safeReply(sock, jid, ga, m); return true; }
    const gb = await groupLane.guardBotAdmin(sock, jid);
    if (gb) { await safeReply(sock, jid, gb, m); return true; }
    if (typeof sock.groupToggleEphemeral !== 'function') {
      await safeReply(sock, jid, '❌ Versi Baileys yang dipakai tidak mendukung atur pesan sementara grup.', m);
      return true;
    }
    const sub = String(args || '').trim().toLowerCase();
    const MAP = { on: 7 * 86400, '1h': 3600, '24h': 86400, '1d': 86400, '7d': 7 * 86400, '90d': 90 * 86400, off: 0, '0': 0 };
    if (!(sub in MAP)) { await safeReply(sock, jid, `Contoh: ${prefix}ephemeral on / off / 1h / 1d / 7d / 90d`, m); return true; }
    try {
      await sock.groupToggleEphemeral(jid, MAP[sub]);
      await safeReply(sock, jid, sub === 'off' || sub === '0' ? '✅ Pesan sementara DIMATIKAN.' : `✅ Pesan sementara: ${sub === 'on' ? '7 hari (default)' : sub}.`, m);
    } catch (e) {
      console.error('ephemeral', e?.message || e);
      await safeReply(sock, jid, '❌ Gagal atur pesan sementara. Pastikan bot admin & coba lagi.', m);
    }
    return true;
  }

  return false;
}

module.exports = { handleFurinaTools, getWelcomeReply, getLeftReply };
