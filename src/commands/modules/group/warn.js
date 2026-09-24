// src/commands/modules/group/warn.js — !warn @tag [alasan] (CJS).
// 3x warn -> auto-kick via groupParticipantsUpdate. groupOnly + adminOnly (via guard pipeline).
const store = require('../../../extensions/safety/group-store');

function resolveTarget(ctx) {
  if (ctx.mentions && ctx.mentions[0]) return { jid: String(ctx.mentions[0]), via: 'mention' };
  const m = String(ctx.args || '').match(/(\d{8,16})/);
  if (m) {
    let d = m[1];
    if (d.startsWith('0')) d = '62' + d.slice(1);
    return { jid: `${d}@s.whatsapp.net`, via: 'number' };
  }
  return null;
}

function extractReason(ctx, target) {
  const tokens = String(ctx.args || '').split(/\s+/).filter(Boolean);
  let rest = tokens;
  if (target.via === 'mention') {
    rest = tokens.filter((t) => !t.startsWith('@'));
  } else {
    rest = tokens.slice(1);
  }
  return rest.join(' ').trim().slice(0, 200) || 'tanpa alasan';
}

function botNumber(sock) {
  try {
    return String(sock?.user?.id || '').split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
  } catch {
    return '';
  }
}

function numOf(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
}

module.exports = {
  name: 'warn',
  aliases: ['peringatan', 'warning'],
  description: 'Warn member grup (!warn @tag [alasan], 3x auto-kick)',
  cooldown: 3000,
  groupOnly: true,
  adminOnly: true,
  async execute(ctx) {
    const target = resolveTarget(ctx);
    const prefix = '.';
    if (!target) {
      await ctx.reply(`Contoh: ${prefix}warn @tag [alasan]`);
      return;
    }
    if (target.jid === ctx.sender) {
      await ctx.reply('❌ Tidak bisa warn diri sendiri.');
      return;
    }
    if (numOf(target.jid) && numOf(target.jid) === botNumber(ctx.sock)) {
      await ctx.reply('❌ Tidak bisa warn bot.');
      return;
    }

    const reason = extractReason(ctx, target);
    const count = store.addWarn(ctx.jid, target.jid, reason);
    const tag = target.jid.split('@')[0];

    if (count >= store.MAX_WARNS) {
      if (!ctx.isBotAdmin) {
        await ctx.reply(
          `⚠️ @${tag} sudah ${count}/${store.MAX_WARNS} warn (terakhir: ${reason}), ` +
          `tapi bot bukan admin jadi tidak bisa kick. Jadikan bot admin lalu ulangi.`
        );
        return;
      }
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [target.jid], 'remove');
      } catch (e) {
        await ctx.reply(`❌ Gagal kick @${tag}: ${e?.message || e}`);
        return;
      }
      store.clearWarns(ctx.jid, target.jid);
      await ctx.sock.sendMessage(ctx.jid, {
        text: `👢 @${tag} mendapat ${store.MAX_WARNS} warn dan di-kick! (terakhir: ${reason})`,
        mentions: [target.jid],
      }).catch(() => {});
    } else {
      await ctx.sock.sendMessage(ctx.jid, {
        text: `⚠️ @${tag} di-warn (${count}/${store.MAX_WARNS})\nAlasan: ${reason}`,
        mentions: [target.jid],
      }).catch(() => {});
    }
  },
};
