// src/commands/modules/economy/work.js — kerja random 300-5000 + EXP, cooldown 30 mnt.
// Kompatibel lib/systems.js (level via addXp) + database/wallet.json shape { balance, lastMine }.
// Field tambahan lastWork bersifat aditif, tidak merusak shape existing.
// Cooldown ganda: guard pipeline (in-memory) + penanda persist lastWork (tahan restart).
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');

const WORK_MS = 30 * 60 * 1000; // 30 menit
const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

const JOBS = [
  { name: 'kuli bangunan', min: 500, max: 1500, exp: 10 },
  { name: 'tukang kebun', min: 300, max: 1000, exp: 8 },
  { name: 'ojol', min: 400, max: 1200, exp: 12 },
  { name: 'guru les', min: 600, max: 2000, exp: 15 },
  { name: 'chef', min: 800, max: 2500, exp: 18 },
  { name: 'programmer freelance', min: 2000, max: 5000, exp: 30 },
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

// Tambah cash dengan MEMPERTAHANKAN semua field existing (bank, lastMine, lastDaily, ...).
function addCashPreserve(id, amount) {
  const k = String(id || '').trim();
  if (!k) return 0;
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

function writeLastWork(id, now) {
  try {
    const db = readWalletRaw();
    const k = String(id || '').trim();
    if (!k) return;
    const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
    db[k] = { ...cur, balance: Number(cur.balance || 0), lastWork: now };
    if (cur.lastMine === undefined && db[k].lastMine === undefined) db[k].lastMine = 0;
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  } catch {}
}

function formatSisa(ms) {
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} menit`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} jam ${m} menit`;
}

function rand(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

module.exports = {
  name: 'work',
  aliases: ['kerja', 'bekerja'],
  description: 'Kerja random 300-5000 cash + EXP (cooldown 30 mnt)',
  cooldown: WORK_MS,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const now = Date.now();
    try {
      const db = readWalletRaw();
      const last = Number(db[String(sender)]?.lastWork || 0);
      const sisa = WORK_MS - (now - last);
      if (sisa > 0) {
        await ctx.reply(`💼 Kamu masih capek! Istirahat ~${formatSisa(sisa)} lagi ya.`);
        return;
      }
    } catch {}

    const job = JOBS[Math.floor(Math.random() * JOBS.length)];
    // Clamp ke 300-5000 sesuai spek Fase 3.
    const reward = Math.max(300, Math.min(5000, rand(job.min, job.max)));
    const balance = addCashPreserve(sender, reward);
    const lv = systems.addXp(sender, job.exp);
    writeLastWork(sender, now);

    let text =
      `💼 *Bekerja*\n` +
      `Kamu kerja sebagai *${job.name}*\n` +
      `🪙 +${reward} cash → saldo: ${balance}\n` +
      `⭐ +${job.exp} EXP → Lv.${lv.level} (${lv.xp} XP)`;
    if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
    await ctx.reply(text);
  },
};
