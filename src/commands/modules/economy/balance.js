// src/commands/modules/economy/balance.js — cek cash (+bank bila ada).
// Baca wallet.json { balance } via lib/systems.js agar kompatibel.
const systems = require('../../../../lib/systems');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'saldo', 'dompet'],
  description: 'Cek saldo cash + bank kamu',
  cooldown: 5000,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const cash = systems.getBalance(sender);
    let bank = 0;
    let limit = 0;
    try {
      // Baca bank secara toleran (field aditif, tidak wajib ada).
      const fs = require('fs');
      const path = require('path');
      const f = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');
      if (fs.existsSync(f)) {
        const db = JSON.parse(fs.readFileSync(f, 'utf8') || '{}');
        const cur = db[String(sender)];
        if (cur && typeof cur === 'object') {
          bank = Number(cur.bank || 0);
          if (cur.bank_limit !== undefined) limit = Number(cur.bank_limit || 0);
        }
      }
    } catch {}
    const name = String(ctx.pushName || 'Kamu').trim() || 'Kamu';
    let text = `💰 *Dompet ${name}*\n🪙 Cash: *${cash}*`;
    if (bank > 0 || limit > 0) text += `\n🏦 Bank: *${bank}*` + (limit > 0 ? ` / ${limit}` : '');
    if (bank > 0) text += `\n📊 Total: *${cash + bank}*`;
    await ctx.reply(text);
  },
};
