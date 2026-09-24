// src/commands/modules/rpg/profile.js — profil level/EXP dari database/level.json.
// Baca via lib/systems.js (getLevel/requiredXp/getBalance) agar kompatibel.
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');

const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

function readBank(id) {
  try {
    if (!fs.existsSync(WALLET_FILE)) return { bank: 0, limit: 0 };
    const db = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8') || '{}');
    const cur = db[String(id || '').trim()];
    if (!cur || typeof cur !== 'object') return { bank: 0, limit: 0 };
    return {
      bank: Number(cur.bank || 0),
      limit: cur.bank_limit !== undefined ? Number(cur.bank_limit || 0) : 0,
    };
  } catch {
    return { bank: 0, limit: 0 };
  }
}

module.exports = {
  name: 'profile',
  aliases: ['profil', 'me', 'akun'],
  description: 'Lihat profil RPG: level, EXP, saldo',
  cooldown: 5000,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const target = (Array.isArray(ctx.mentions) && ctx.mentions[0]) || ctx.sender;
    const lv = systems.getLevel(target);
    const need = systems.requiredXp(lv.level);
    const cash = systems.getBalance(target);
    const { bank, limit } = readBank(target);
    const total = cash + bank;
    const pct = need > 0 ? Math.min(100, Math.round((lv.xp / need) * 100)) : 0;
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const who = String(target).split('@')[0];
    const name = target === ctx.sender ? String(ctx.pushName || who).trim() || who : `@${who}`;

    let text =
      `👤 *Profil ${name}*\n` +
      `⭐ Level: *${lv.level}*\n` +
      `📊 EXP: ${lv.xp} / ${need} (${pct}%)\n` +
      `${bar}\n` +
      `🪙 Cash: *${cash}*`;
    if (bank > 0 || limit > 0) text += `\n🏦 Bank: *${bank}*` + (limit > 0 ? ` / ${limit}` : '');
    if (bank > 0) text += `\n📦 Total: *${total}*`;
    const mentions = target !== ctx.sender ? [String(target)] : [];
    // reply() di router hanya terima text; kirim via sock bila perlu mention.
    if (mentions.length && ctx.sock && ctx.jid && ctx.m) {
      try {
        await ctx.sock.sendMessage(ctx.jid, { text, mentions }, { quoted: ctx.m });
        return;
      } catch {}
    }
    await ctx.reply(text);
  },
};
