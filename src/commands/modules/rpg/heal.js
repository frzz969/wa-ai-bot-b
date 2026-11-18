// src/commands/modules/rpg/heal.js — istirahat/heal +5 EXP, cooldown 60 dtk (NO-JUDI).
// Tanpa sistem HP baru: heal = pulihkan stamina naratif + vitamin EXP kecil.
// Cooldown ganda: guard pipeline + penanda persist lastHeal di wallet.json (aditif).
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');
const { withWalletLock } = require('../../../../lib/wallet-lock');

const HEAL_MS = 60 * 1000;
const HEAL_EXP = 5;
const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

function readWalletRaw() {
  try {
    if (!fs.existsSync(WALLET_FILE)) return {};
    const raw = fs.readFileSync(WALLET_FILE, 'utf8').trim();
    if (!raw) return {};
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

function saveLastHeal(db, id, now) {
  const k = String(id || '').trim();
  if (!k) return;
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  db[k] = { ...cur, balance: Number(cur.balance || 0), lastHeal: now };
  fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
}

module.exports = {
  name: 'heal',
  aliases: ['sembuh', 'recover', 'istirahat'],
  description: 'Istirahat memulihkan stamina +5 EXP (cooldown 60 dtk)',
  cooldown: HEAL_MS,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const now = Date.now();

    const result = await withWalletLock('rpg:heal', () => {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastHeal || 0);
      const sisa = HEAL_MS - (now - last);
      if (sisa > 0) return { cooldown: sisa };

      const lv = systems.addXp(sender, HEAL_EXP);
      saveLastHeal(readWalletRaw(), sender, now);
      return { lv };
    });

    if (result.cooldown) {
      await ctx.reply(`❤️ Masih fit! Istirahat lagi dalam ~${Math.ceil(result.cooldown / 1000)} detik ya.`);
      return;
    }

    const { lv } = result;
    let text = `❤️ *Heal berhasil!* Stamina pulih penuh!\n⭐ +${HEAL_EXP} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    await ctx.reply(text);
  },
};
