// handlers/group.js — GROUP: admin tools + sistem (welcome/antilink/badword/afk)
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
const S = require('../../handlers/state');
const {
  groupLane,
  systems,
  safeReply,
} = S;

async function handleGroup(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    // ---------- LANE GRUP ADMIN (lib/group.js) ----------
    if (cmd === 'tagall') {
      const g = groupLane.guardGroup(jid);
      if (g) { await safeReply(sock, jid, g, m); return true; }
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      try {
        await groupLane.tagall(sock, jid, m, args);
      } catch (e) {
        console.error('tagall', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal tagall. Coba lagi.', m); return true;
      }
      return true;
    }
    if (cmd === 'hidetag' || cmd === 'hideteg') {
      const g = groupLane.guardGroup(jid);
      if (g) { await safeReply(sock, jid, g, m); return true; }
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}hidetag Halo semua!`, m); return true; }
      try {
        await groupLane.hidetag(sock, jid, args, m);
      } catch (e) {
        console.error('hidetag', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal hidetag. Coba lagi.', m); return true;
      }
      return true;
    }
    if (cmd === 'kick') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, gb, m); return true; }
      const targets = groupLane.resolveTargets(m, args);
      if (!targets.length) { await safeReply(sock, jid, `Contoh: ${prefix}kick @user (atau reply pesannya)`, m); return true; }
      try {
        await groupLane.kick(sock, jid, targets);
        await safeReply(sock, jid, `✅ ${targets.length} anggota dikeluarkan.`, m); return true;
      } catch (e) {
        console.error('kick', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal kick. Pastikan target valid & bot admin.', m); return true;
      }
    }
    if (cmd === 'add') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, gb, m); return true; }
      const nums = (String(args || '').match(/\d{8,16}/g) || []).map(String);
      if (!nums.length) { await safeReply(sock, jid, `Contoh: ${prefix}add 6281234567890`, m); return true; }
      try {
        await groupLane.addMembers(sock, jid, nums);
        await safeReply(sock, jid, `✅ Undangan dikirim ke ${nums.length} nomor.`, m); return true;
      } catch (e) {
        console.error('add', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal add. Nomor harus terdaftar WA & mengizinkan ditambah.', m); return true;
      }
    }
    if (cmd === 'promote' || cmd === 'demote') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, gb, m); return true; }
      const targets = groupLane.resolveTargets(m, args);
      if (!targets.length) { await safeReply(sock, jid, `Contoh: ${prefix}${cmd} @user`, m); return true; }
      try {
        if (cmd === 'promote') await groupLane.promote(sock, jid, targets);
        else await groupLane.demote(sock, jid, targets);
        await safeReply(sock, jid, `✅ ${cmd} berhasil untuk ${targets.length} anggota.`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, `❌ Gagal ${cmd}. Coba lagi.`, m); return true;
      }
    }
    if (cmd === 'linkgc' || cmd === 'linkgrup' || cmd === 'linkgroup') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      try {
        const link = await groupLane.getInviteLink(sock, jid);
        await safeReply(sock, jid, `🔗 *Link grup:*\n${link}`, m); return true;
      } catch (e) {
        console.error('linkgc', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil link grup. Pastikan bot admin.', m); return true;
      }
    }
    if (cmd === 'group' || cmd === 'grup') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, gb, m); return true; }
      const sub = String(args || '').trim().toLowerCase();
      try {
        if (sub === 'buka' || sub === 'open') {
          await groupLane.openGroup(sock, jid);
          await safeReply(sock, jid, '✅ Grup dibuka — semua anggota bisa chat.', m); return true;
        }
        if (sub === 'tutup' || sub === 'close') {
          await groupLane.closeGroup(sock, jid);
          await safeReply(sock, jid, '🔒 Grup ditutup — hanya admin yang bisa chat.', m); return true;
        }
        await safeReply(sock, jid, `Contoh: ${prefix}group buka / ${prefix}group tutup`, m); return true;
      } catch (e) {
        console.error('group', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ubah setelan grup.', m); return true;
      }
    }
    if (cmd === 'setname' || cmd === 'setdesc') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const gb = await groupLane.guardBotAdmin(sock, jid);
      if (gb) { await safeReply(sock, jid, gb, m); return true; }
      if (!args) { await safeReply(sock, jid, `Contoh: ${prefix}${cmd} Teks baru`, m); return true; }
      try {
        if (cmd === 'setname') await groupLane.setGroupName(sock, jid, args);
        else await groupLane.setGroupDesc(sock, jid, args);
        await safeReply(sock, jid, `✅ ${cmd} berhasil.`, m); return true;
      } catch (e) {
        console.error(cmd, e?.message || e);
        await safeReply(sock, jid, `❌ Gagal ${cmd}.`, m); return true;
      }
    }
    if (cmd === 'grouplist' || cmd === 'listgc' || cmd === 'listgrup') {
      try {
        const all = await sock.groupFetchAllParticipating();
        const list = Object.values(all || {});
        if (!list.length) { await safeReply(sock, jid, '📋 Bot belum ikut grup mana pun.', m); return true; }
        const out = list.map((gr, i) => `${i + 1}. *${gr.subject || '-'}* (${(gr.participants || []).length} anggota)`).join('\n');
        await safeReply(sock, jid, `📋 *Grup bot (${list.length}):*\n${out}`, m); return true;
      } catch (e) {
        console.error('grouplist', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil daftar grup.', m); return true;
      }
    }
    if (cmd === 'listadmin' || cmd === 'adminlist') {
      const g = groupLane.guardGroup(jid);
      if (g) { await safeReply(sock, jid, g, m); return true; }
      try {
        const parts = await groupLane.getParticipants(sock, jid);
        const admins = parts.filter(groupLane.isParticipantAdmin);
        if (!admins.length) { await safeReply(sock, jid, 'Belum ada admin terdeteksi.', m); return true; }
        const ids = admins.map((p) => String(p.id));
        const text = '👑 *Admin grup:*\n' + ids.map((id, i) => `${i + 1}. @${id.split('@')[0]}`).join('\n');
        await sock.sendMessage(jid, { text, mentions: ids }, { quoted: m });
      } catch (e) {
        console.error('listadmin', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil daftar admin.', m); return true;
      }
      return true;
    }
    if (cmd === 'infogc' || cmd === 'infogrup' || cmd === 'infogroup') {
      const g = groupLane.guardGroup(jid);
      if (g) { await safeReply(sock, jid, g, m); return true; }
      try {
        const meta = await groupLane.getGroupMetadata(sock, jid);
        await safeReply(sock, jid, groupLane.groupInfoText(meta), m); return true;
      } catch (e) {
        console.error('infogc', e?.message || e);
        await safeReply(sock, jid, '❌ Gagal ambil info grup.', m); return true;
      }
    }

    // ---------- LANE GRUP SISTEM (lib/systems.js) ----------
    if (cmd === 'welcome') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const sub = String(args || '').trim().toLowerCase();
      if (sub === 'on') {
        systems.welcomeOn(jid);
        await safeReply(sock, jid, '✅ Welcome ON — anggota baru otomatis disambut.', m); return true;
      }
      if (sub === 'off') {
        systems.welcomeOff(jid);
        await safeReply(sock, jid, '✅ Welcome OFF.', m); return true;
      }
      await safeReply(sock, jid, `Contoh: ${prefix}welcome on / off (saat ini: ${systems.isWelcomeOn(jid) ? 'ON' : 'OFF'})`, m); return true;
    }
    if (cmd === 'antilink') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const sub = String(args || '').trim().toLowerCase();
      if (sub === 'on') {
        systems.antilinkOn(jid);
        await safeReply(sock, jid, '✅ Antilink ON — link invite otomatis dihapus.', m); return true;
      }
      if (sub === 'off') {
        systems.antilinkOff(jid);
        await safeReply(sock, jid, '✅ Antilink OFF.', m); return true;
      }
      await safeReply(sock, jid, `Contoh: ${prefix}antilink on / off (saat ini: ${systems.isAntilinkOn(jid) ? 'ON' : 'OFF'})`, m); return true;
    }
    if (cmd === 'badword') {
      const ga = await groupLane.guardAdmin(sock, jid, sender);
      if (ga) { await safeReply(sock, jid, ga, m); return true; }
      const [sub, ...rest] = String(args || '').trim().split(/\s+/);
      const word = rest.join(' ').trim();
      if (sub === 'add' && word) {
        const r = systems.addBadword(word);
        await safeReply(sock, jid, r.msg, m); return true;
      }
      if ((sub === 'del' || sub === 'delete' || sub === 'remove') && word) {
        const r = systems.removeBadword(word);
        await safeReply(sock, jid, r.msg, m); return true;
      }
      if (sub === 'list' || !sub) {
        const list = systems.listBadword();
        await safeReply(sock, jid, list.length ? `🚫 *Badword (${list.length}):*\n${list.map((w, i) => `${i + 1}. ${w}`).join('\n')}` : '🚫 Daftar badword masih kosong.', m); return true;
      }
      await safeReply(sock, jid, `Contoh: ${prefix}badword add <kata> / del <kata> / list`, m); return true;
    }

    if (cmd === 'afk') {
      systems.setAfk(sender, args || 'AFK');
      await safeReply(sock, jid, `💤 @${String(sender).split('@')[0]} sekarang AFK${args ? `: ${args}` : ''}.`, m); return true;
    }

  return false;
}

module.exports = { handleGroup };
