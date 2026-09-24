// src/commands/modules/group/groupset.js — !groupset <antiflood|antilink|mute> <on|off> (CJS).
// Simpan di database/group.json via safety/group-store. groupOnly + adminOnly (via guard pipeline).
const store = require('../../../extensions/safety/group-store');

const VALID_KEYS = ['antiflood', 'antilink', 'mute'];

function statusPanel(jid) {
  const g = store.getGroup(jid);
  const icon = (b) => (b ? '✅' : '❌');
  return (
    `*⚙️ Pengaturan Grup*\n\n` +
    `🌊 Antiflood: ${icon(g.antiflood)}\n` +
    `🔗 Antilink: ${icon(g.antilink)}\n` +
    `🔇 Mute: ${icon(g.mute)}\n\n` +
    `Contoh: .groupset antiflood on`
  );
}

module.exports = {
  name: 'groupset',
  aliases: ['gset', 'grpset'],
  description: 'Atur proteksi grup (!groupset antiflood/antilink/mute on/off)',
  cooldown: 3000,
  groupOnly: true,
  adminOnly: true,
  async execute(ctx) {
    const tokens = String(ctx.args || '').toLowerCase().split(/\s+/).filter(Boolean);
    const sub = tokens[0];
    const value = tokens[1];
    if (!VALID_KEYS.includes(sub) || !['on', 'off'].includes(value)) {
      await ctx.reply(statusPanel(ctx.jid));
      return;
    }
    const patch = {};
    patch[sub] = value === 'on';
    store.setGroup(ctx.jid, patch);
    await ctx.reply(`✅ *${sub}* ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}.`);
  },
};
