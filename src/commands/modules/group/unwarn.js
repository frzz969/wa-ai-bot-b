// src/commands/modules/group/unwarn.js — !unwarn @tag (CJS).
// Hapus 1 warn terbaru. groupOnly + adminOnly (via guard pipeline).
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
  name: 'unwarn',
  aliases: ['unperingatan', 'delwarn'],
  description: 'Hapus 1 warn terbaru member (!unwarn @tag)',
  cooldown: 3000,
  groupOnly: true,
  adminOnly: true,
  async execute(ctx) {
    const target = resolveTarget(ctx);
    if (!target) {
      await ctx.reply('Contoh: .unwarn @tag');
      return;
    }
    const before = store.getWarns(ctx.jid, target).length;
    if (!before) {
      await ctx.reply(`ℹ️ @${target.split('@')[0]} tidak punya warn.`);
      return;
    }
    const rest = store.popWarn(ctx.jid, target);
    await ctx.sock.sendMessage(ctx.jid, {
      text: `✅ Warn @${target.split('@')[0]} dikurangi 1 (sisa ${rest}/${store.MAX_WARNS}).`,
      mentions: [target],
    }).catch(() => {});
  },
};
