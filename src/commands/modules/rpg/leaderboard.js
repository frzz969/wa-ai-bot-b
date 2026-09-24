// src/commands/modules/rpg/leaderboard.js — peringkat level (NO-JUDI).
// Baca via lib/systems.js agar kompatibel database/level.json.
const systems = require('../../../../lib/systems');

function parseArgs(ctx) {
  const s = Array.isArray(ctx.args) ? ctx.args.join(' ') : String(ctx.args ?? ctx.text ?? '');
  return s.trim().split(/\s+/).filter(Boolean);
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top', 'ranking'],
  description: 'Peringkat level top 10',
  cooldown: 10000,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const parts = parseArgs(ctx);
    let n = parseInt(parts[0], 10);
    if (!Number.isFinite(n)) n = 10;
    n = Math.max(1, Math.min(15, n));
    const top = systems.leaderboard(n);
    if (!top.length) {
      await ctx.reply('🏆 Belum ada data level. Chat dulu biar dapat XP!');
      return;
    }
    let text = `🏆 *LEADERBOARD LEVEL* (Top ${top.length})\n\n`;
    top.forEach((e, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} @${String(e.id).split('@')[0]} — Lv.${e.level} (${e.xp} XP)\n`;
    });
    const mentions = top.map((e) => String(e.id));
    if (ctx.sock && ctx.jid && ctx.m) {
      try {
        await ctx.sock.sendMessage(ctx.jid, { text: text.trimEnd(), mentions }, { quoted: ctx.m });
        return;
      } catch {}
    }
    await ctx.reply(text.trimEnd());
  },
};
