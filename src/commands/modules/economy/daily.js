// src/commands/modules/economy/daily.js — contoh command: bansos harian.
// +5000 cash (wallet) +50 EXP (level), cooldown 20 jam.
// Baca/tulis database JSON existing via lib/systems.js agar kompatibel.
// Cooldown ganda: guard pipeline (in-memory) + penanda persist lastDaily di database/wallet.json
// (field tambahan, bentuk { balance, lastMine } tetap dijaga agar kompatibel dengan systems.js).
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');

const DAILY_CASH = 5000;
const DAILY_EXP = 50;
const DAILY_MS = 20 * 60 * 60 * 1000; // 20 jam

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

function writeLastDaily(id, now) {
  try {
    const db = readWalletRaw();
    const k = String(id || '').trim();
    if (!k) return;
    const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
    // Pertahankan shape kompatibel { balance, lastMine }, tambah lastDaily.
    db[k] = {
      balance: Number(cur.balance || 0),
      lastMine: Number(cur.lastMine || 0),
      lastDaily: now,
    };
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  } catch {
    // non-fatal: guard cooldown in-memory tetap melindungi
  }
}

function formatSisa(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} menit`;
  return `${h} jam ${m} menit`;
}

module.exports = {
  name: 'daily',
  aliases: ['bansos', 'klaim'],
  description: 'Klaim bansos harian +5000 cash +50 EXP (cooldown 20 jam)',
  cooldown: DAILY_MS,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const now = Date.now();

    // Cek persist (tahan restart). Guard pipeline sudah cek in-memory duluan.
    try {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastDaily || 0);
      const sisa = DAILY_MS - (now - last);
      if (sisa > 0) {
        await ctx.reply(`🎁 Bansos sudah diklaim! Balik lagi dalam ~${formatSisa(sisa)} ya.`);
        return;
      }
    } catch {}

    const balance = systems.addBalance(sender, DAILY_CASH);
    const lv = systems.addXp(sender, DAILY_EXP);
    writeLastDaily(sender, now);

    let text =
      `🎁 *BANSOS HARIAN*\n` +
      `+${DAILY_CASH} cash → saldo: ${balance}\n` +
      `+${DAILY_EXP} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    text += `\n_Balik lagi ~20 jam ya._`;
    await ctx.reply(text);
  },
};
