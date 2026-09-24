// src/commands/modules/group/cekwarn.js — !cekwarn [@tag] (CJS).
// Tanpa argumen: daftar semua warn di grup. Dengan @tag/nomor: rincian warn user.
// groupOnly + adminOnly (via guard pipeline).
const store = require('../../../extensions/safety/group-store');

function resolveTarget(ctx) {
  if (ctx.mentions && ctx.mentions[0]) return String(ctx.mentions[0]);
  const m = String(ctx.args || '').match(/(\d{8,16})/);
  if (m) {
    let d = m[1];
    if (d.startsWith('0')) d = '62' + d.slice(1);
    return `${d}@s.whatsapp.net`;
  }
  return null;
}

module.exports = {
  name: 'cekwarn',
  aliases: ['warnlist', 'checkwarn', 'cekperingatan'],
  description: 'Cek warn member (!cekwarn [@tag])',
  cooldown: 3000,
  groupOnly: true,
  adminOnly: true,
  async execute(ctx) {
    const target = resolveTarget(ctx);
    if (target) {
      const list = store.getWarns(ctx.jid, target);
      if (!list.length) {
        await ctx.reply(`ℹ️ @${target.split('@')[0]} tidak punya warn.`);
        return;
      }
      const lines = list.map((w, i) => {
        const date = new Date(Number(w.at)).toLocaleString('id-ID');
        return `${i + 1}. ${w.reason} (${date})`;
      });
      await ctx.sock.sendMessage(ctx.jid, {
        text: `⚠️ Warn @${target.split('@')[0]} (${list.length}/${store.MAX_WARNS}):\n${lines.join('\n')}`,
        mentions: [target],
      }).catch(() => {});
      return;
    }
    const all = store.getAllWarns(ctx.jid);
    const keys = Object.keys(all);
    if (!keys.length) {
      await ctx.reply('✅ Grup ini bersih, belum ada warn.');
      return;
    }
    const mentions = keys.slice(0, 10);
    const lines = keys.slice(0, 20).map((u) => `• @${u.split('@')[0]}: ${all[u].length}/${store.MAX_WARNS}`);
    let text = `⚠️ *Daftar warn grup:*\n${lines.join('\n')}`;
    if (keys.length > 20) text += `\n…dan ${keys.length - 20} lainnya.`;
    await ctx.sock.sendMessage(ctx.jid, { text, mentions }).catch(() => {});
  },
};
