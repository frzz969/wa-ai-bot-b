// handlers/economy.js — ECONOMY: level, limit, wallet, transfer, mining (nambang saldo)
// Dipanggil router handlers/messages.js. Return true = tertangani.
// CATATAN: balance/dompet/saldo dan leaderboard/lb/top sudah pindah ke router baru
// (src/commands/modules/{economy/balance,rpg/leaderboard}.js) dan menang lebih dulu —
// karena itu TIDAK ada cabangnya di sini lagi. .mine/.tambang = rambut RPG.
const S = require('../../handlers/state');
const {
  groupLane,
  systems,
  safeReply,
} = S;

async function handleEconomy(ctx) {
  const { sock, m, jid, isGroup, sender, body, cmd, args, prefix, start, unwrapped } = ctx;
    if (cmd === 'level' || cmd === 'lvl' || cmd === 'rank') {
      const lv = systems.getLevel(sender);
      await safeReply(
        sock, jid,
        `⭐ *Level @${String(sender).split('@')[0]}*\nLevel: ${lv.level}\nXP: ${lv.xp}/${systems.requiredXp(lv.level)}`,
        m
      ); return true;
    }
    // leaderboard / lb / top / ranking -> src/commands/modules/rpg/leaderboard.js
    // (router baru menang di handlers/messages.js:108, jadi cabang ini dihapus agar tidak dobel)
    if (cmd === 'limit') {
      const l = systems.getLimit(sender);
      await safeReply(sock, jid, `⏳ *Limit harian:* ${l.remaining}/${l.max} tersisa.`, m); return true;
    }
    // balance / saldo / dompet / bal -> src/commands/modules/economy/balance.js (baca cash + bank)
    // wallet TIDAK terdaftar di router baru, jadi tetap dipegang plugin ini.
    if (cmd === 'wallet') {
      const bal = systems.getBalance(sender);
      await safeReply(sock, jid, `💰 *Dompet @${String(sender).split('@')[0]}:* ${bal} koin.`, m); return true;
    }
    if (cmd === 'transfer' || cmd === 'tf') {
      const targets = groupLane.resolveTargets(m, args);
      const nums = String(args || '').match(/\d+/g) || [];
      const amt = Number(nums[nums.length - 1]);
      if (!targets.length || !Number.isFinite(amt) || amt <= 0) {
        await safeReply(sock, jid, `Contoh: ${prefix}transfer @user 100`, m); return true;
      }
      const r = systems.transfer(sender, targets[0], amt);
      await sock.sendMessage(jid, { text: r.msg, mentions: [String(sender), String(targets[0])] }, { quoted: m });
      return true;
    }
    // Nambang SALDO (koin). Versi RAMBUT RPG memakai .mine/.tambang dan dipegang
    // src/commands/modules/rpg/mine.js (router baru menang lebih dulu), jadi
    // cmd === 'mine' sengaja TIDAK ada di sini — menu menulis .mining = nambang saldo.
    if (cmd === 'mining' || cmd === 'nambang') {
      const r = systems.mine(sender);
      if (!r.ok) { await safeReply(sock, jid, r.msg, m); return true; }
      await safeReply(sock, jid, `⛏️ Dapat *${r.reward}* koin! Saldo: ${r.balance}.`, m); return true;
    }

  return false;
}

module.exports = { handleEconomy };
