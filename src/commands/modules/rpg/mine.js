// src/commands/modules/rpg/mine.js — nambang 50-300 cash + EXP, cooldown 5 mnt.
// Kompatibel systems.js: pakai field lastMine yang SAMA dengan systems.mine() agar
// cooldown sinkron dengan handler lama (.mining). Reward + EXP versi Fase 3.
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');
const { withWalletLock } = require('../../../../lib/wallet-lock');

const MINE_MS = 5 * 60 * 1000;
const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

const MINERALS = [
  { name: 'Batu Bara', min: 50, max: 120, exp: 5, emoji: '🪨' },
  { name: 'Bijih Besi', min: 100, max: 200, exp: 8, emoji: '⛏️' },
  { name: 'Tembaga', min: 150, max: 250, exp: 12, emoji: '🟤' },
  { name: 'Perak', min: 200, max: 300, exp: 15, emoji: '🥈' },
];

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

function saveCashWithMarker(id, amount, now) {
  const k = String(id || '').trim();
  const db = readWalletRaw();
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  const balance = Number(cur.balance || 0) + Math.floor(Number(amount || 0));
  db[k] = { ...cur, balance, lastMine: now };
  fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
  fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  return balance;
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

module.exports = {
  name: 'mine',
  // 'mining' SENGAJA tidak jadi alias: .mining dipakai plugins/group/07-economy.js
  // untuk nambang SALDO (koin) — dua-duanya butuh reconcile di menu.
  aliases: ['tambang'],
  description: 'Nambang 50-300 cash + EXP (cooldown 5 mnt)',
  cooldown: MINE_MS,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const now = Date.now();

    const result = await withWalletLock('rpg:mine', () => {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastMine || 0);
      const sisa = MINE_MS - (now - last);
      if (sisa > 0) return { cooldown: sisa };

      const m = MINERALS[Math.floor(Math.random() * MINERALS.length)];
      const reward = Math.max(50, Math.min(300, rand(m.min, m.max)));
      const balance = saveCashWithMarker(sender, reward, now);
      const lv = systems.addXp(sender, m.exp);
      return { m, reward, balance, lv };
    });

    if (result.cooldown) {
      await ctx.reply(`⛏️ Capek! Tunggu ~${Math.ceil(result.cooldown / 60000)} menit lagi.`);
      return;
    }

    const { m, reward, balance, lv } = result;
    let text = `⛏️ *Mining!*\n\n${m.emoji} Dapat: *${m.name}*\n🪙 +${reward} → saldo: ${balance}\n⭐ +${m.exp} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    await ctx.reply(text);
  },
};
