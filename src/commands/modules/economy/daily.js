// src/commands/modules/economy/daily.js — contoh command: bansos harian.
// +5000 cash (wallet) +50 EXP (level), cooldown 20 jam.
// Baca/tulis database JSON existing via lib/systems.js agar kompatibel.
// Cooldown ganda: guard pipeline (in-memory) + penanda persist lastDaily di database/wallet.json
// (field tambahan, bentuk { balance, lastMine } tetap dijaga agar kompatibel dengan systems.js).
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');
const { withWalletLock } = require('../../../../lib/wallet-lock');

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

function writeLastDaily(db, id, now) {
  const k = String(id || '').trim();
  if (!k) return;
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  // Pertahankan shape kompatibel { balance, lastMine }, tambah lastDaily.
  db[k] = {
    ...cur,
    balance: Number(cur.balance || 0),
    lastMine: Number(cur.lastMine || 0),
    lastDaily: now,
  };
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

    // Cek persist + klaim dijalankan atomik: dua klaim paralel tidak bisa
    // dua-duanya lolos cek cooldown sebelum penulisan penanda.
    const result = await withWalletLock('economy:daily', () => {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastDaily || 0);
      const sisa = DAILY_MS - (now - last);
      if (sisa > 0) return { cooldown: sisa };

      const balance = systems.addBalance(sender, DAILY_CASH);
      const lv = systems.addXp(sender, DAILY_EXP);
      // addBalance/addXp menulis file mereka sendiri; tulis ulang penanda
      // dengan data wallet terbaru supaya tidak menimpa perubahan di atas.
      const fresh = readWalletRaw();
      writeLastDaily(fresh, sender, now);
      fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
      fs.writeFileSync(WALLET_FILE, JSON.stringify(fresh, null, 2));
      return { balance, lv };
    });

    if (result.cooldown) {
      await ctx.reply(`🎁 Bansos sudah diklaim! Balik lagi dalam ~${formatSisa(result.cooldown)} ya.`);
      return;
    }

    const { balance, lv } = result;
    let text =
      `🎁 *BANSOS HARIAN*\n` +
      `+${DAILY_CASH} cash → saldo: ${balance}\n` +
      `+${DAILY_EXP} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    text += `\n_Balik lagi ~20 jam ya._`;
    await ctx.reply(text);
  },
};
