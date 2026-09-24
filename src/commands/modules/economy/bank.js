// src/commands/modules/economy/bank.js — deposit/withdraw + limit bank.
// Kompatibel wallet.json shape { balance, lastMine }: field bank/bank_limit ADITIF.
// Usage: .bank | .bank deposit <n> | .bank withdraw <n>
// Alias: .deposit/.tabung/.withdraw/.ambil juga terdaftar (tetap via loader).
const fs = require('fs');
const path = require('path');

const BANK_CD = 5000;
const DEFAULT_BANK_LIMIT = 10000;
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

function saveWalletRaw(db) {
  try {
    fs.mkdirSync(path.dirname(WALLET_FILE), { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(db, null, 2));
  } catch {}
}

function getEntry(id) {
  const db = readWalletRaw();
  const k = String(id || '').trim();
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  return {
    db,
    key: k,
    cash: Number(cur.balance || 0),
    bank: Number(cur.bank || 0),
    limit: Number(cur.bank_limit || DEFAULT_BANK_LIMIT),
  };
}

// Baca nama command yang diketik user (untuk alias .deposit/.withdraw) dari pesan asli.
function invokedName(ctx) {
  try {
    const msg = ctx.m?.message || {};
    const inner = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg;
    const t =
      inner.conversation ||
      inner.extendedTextMessage?.text ||
      inner.imageMessage?.caption ||
      inner.videoMessage?.caption ||
      '';
    const first = String(t || '').trim().split(/\s+/)[0] || '';
    return first.replace(/^[.!#/]/, '').toLowerCase();
  } catch {
    return '';
  }
}

function parseArgs(ctx) {
  const s = Array.isArray(ctx.args) ? ctx.args.join(' ') : String(ctx.args ?? ctx.text ?? '');
  return s.trim().split(/\s+/).filter(Boolean);
}

module.exports = {
  name: 'bank',
  aliases: ['deposit', 'withdraw', 'tabung', 'ambil'],
  description: 'Bank: .bank | .bank deposit <n> | .bank withdraw <n> (limit 10000)',
  cooldown: BANK_CD,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const parts = parseArgs(ctx);
    let sub = String(parts[0] || '').toLowerCase();
    let amount = Math.floor(Number(parts[1] || 0));

    // Dukung alias langsung: ".deposit 1000" / ".withdraw 1000" (tanpa sub).
    if (/^\d+$/.test(sub)) {
      const inv = invokedName(ctx);
      amount = Math.floor(Number(sub));
      sub = inv === 'withdraw' || inv === 'ambil' ? 'withdraw' : 'deposit';
    } else if (!sub) {
      const inv = invokedName(ctx);
      if (inv === 'deposit' || inv === 'tabung') sub = 'deposit';
      else if (inv === 'withdraw' || inv === 'ambil') sub = 'withdraw';
    }

    // Tanpa argumen -> tampilkan info saldo bank.
    if (!sub || (sub !== 'deposit' && sub !== 'tabung' && sub !== 'withdraw' && sub !== 'ambil')) {
      const e = getEntry(sender);
      await ctx.reply(
        `🏦 *BANK*\n` +
        `🪙 Cash: ${e.cash}\n` +
        `🏦 Bank: ${e.bank} / ${e.limit}\n\n` +
        `Cara pakai:\n` +
        `• .bank deposit <nominal>\n` +
        `• .bank withdraw <nominal>`
      );
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      await ctx.reply('❌ Nominal harus angka > 0.\nContoh: `.bank deposit 1000`');
      return;
    }

    const e = getEntry(sender);
    if (sub === 'deposit' || sub === 'tabung') {
      if (e.cash < amount) {
        await ctx.reply(`❌ Cash kurang (punya ${e.cash}, mau nabung ${amount}).`);
        return;
      }
      if (e.bank + amount > e.limit) {
        await ctx.reply(`❌ Bank penuh! Kapasitas ${e.limit} (isi ${e.bank}). Maks nabung ${e.limit - e.bank}.`);
        return;
      }
      const cur = e.db[e.key] && typeof e.db[e.key] === 'object' ? e.db[e.key] : {};
      e.db[e.key] = { ...cur, balance: e.cash - amount, bank: e.bank + amount, bank_limit: e.limit };
      saveWalletRaw(e.db);
      await ctx.reply(`✅ Deposit *${amount}* berhasil!\n🪙 Cash: ${e.cash - amount}\n🏦 Bank: ${e.bank + amount} / ${e.limit}`);
      return;
    }

    // withdraw / ambil
    if (e.bank < amount) {
      await ctx.reply(`❌ Saldo bank kurang (isi ${e.bank}, mau ambil ${amount}).`);
      return;
    }
    const cur = e.db[e.key] && typeof e.db[e.key] === 'object' ? e.db[e.key] : {};
    e.db[e.key] = { ...cur, balance: e.cash + amount, bank: e.bank - amount, bank_limit: e.limit };
    saveWalletRaw(e.db);
    await ctx.reply(`✅ Withdraw *${amount}* berhasil!\n🪙 Cash: ${e.cash + amount}\n🏦 Bank: ${e.bank - amount} / ${e.limit}`);
  },
};
