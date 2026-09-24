// src/commands/modules/rpg/fish.js — mancing 50-300 cash + EXP, cooldown 30 dtk.
// Kompatibel wallet.json { balance, lastMine } + level via lib/systems.js.
// Field lastFish aditif (tahan restart), tidak merusak shape.
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');

const FISH_MS = 30 * 1000;
const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

const CATCHES = [
  { name: 'Ikan Lele', min: 50, max: 150, exp: 5, emoji: '🐟' },
  { name: 'Ikan Nila', min: 100, max: 220, exp: 8, emoji: '🐠' },
  { name: 'Ikan Gurame', min: 150, max: 300, exp: 12, emoji: '🐡' },
  { name: 'Sepatu Bekas', min: 50, max: 80, exp: 2, emoji: '👟' },
  { name: 'Botol Plastik', min: 50, max: 70, exp: 1, emoji: '🧴' },
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

function addCashPreserve(id, amount) {
  const k = String(id || '').trim();
  const db = readWalletRaw();
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  const balance = Number(cur.balance || 0) + Math.floor(Number(amount || 0));
  db[k] = { ...cur, balance };
  try {
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  } catch {}
  return balance;
}

function writeLastFish(id, now) {
  try {
    const db = readWalletRaw();
    const k = String(id || '').trim();
    if (!k) return;
    const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
    db[k] = { ...cur, balance: Number(cur.balance || 0), lastFish: now };
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  } catch {}
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

module.exports = {
  name: 'fish',
  aliases: ['fishing', 'pancing', 'mancing'],
  description: 'Mancing 50-300 cash + EXP (cooldown 30 dtk)',
  cooldown: FISH_MS,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const now = Date.now();
    try {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastFish || 0);
      const sisa = FISH_MS - (now - last);
      if (sisa > 0) {
        await ctx.reply(`🎣 Sabar! Lempar lagi dalam ~${Math.ceil(sisa / 1000)} detik ya.`);
        return;
      }
    } catch {}

    const c = CATCHES[Math.floor(Math.random() * CATCHES.length)];
    const reward = Math.max(50, Math.min(300, rand(c.min, c.max)));
    const balance = addCashPreserve(sender, reward);
    const lv = systems.addXp(sender, c.exp);
    writeLastFish(sender, now);

    let text = `🎣 *Mancing!*\n\n${c.emoji} Dapat: *${c.name}*\n🪙 +${reward} → saldo: ${balance}\n⭐ +${c.exp} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    await ctx.reply(text);
  },
};
