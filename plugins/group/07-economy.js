// handlers/economy.js — ECONOMY/RPG-level: level, leaderboard, limit, dompet, transfer, mining
// Diekstrak verbatim dari handlers/messages.js; tanpa perubahan perilaku.
// Dipanggil router handlers/messages.js sesuai urutan asli. Return true = tertangani.
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
    if (cmd === 'leaderboard' || cmd === 'lb' || cmd === 'top') {
      const list = systems.leaderboard(10);
      if (!list.length) { await safeReply(sock, jid, systems.leaderboardText(10), m); return true; }
      const ids = list.map((e) => String(e.id));
      await sock.sendMessage(jid, { text: systems.leaderboardText(10), mentions: ids }, { quoted: m });
      return true;
    }
    if (cmd === 'limit') {
      const l = systems.getLimit(sender);
      await safeReply(sock, jid, `⏳ *Limit harian:* ${l.remaining}/${l.max} tersisa.`, m); return true;
    }
    if (cmd === 'dompet' || cmd === 'wallet' || cmd === 'saldo' || cmd === 'balance') {
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
    if (cmd === 'mining' || cmd === 'mine' || cmd === 'nambang') {
      const r = systems.mine(sender);
      if (!r.ok) { await safeReply(sock, jid, r.msg, m); return true; }
      await safeReply(sock, jid, `⛏️ Dapat *${r.reward}* koin! Saldo: ${r.balance}.`, m); return true;
    }

  return false;
}

module.exports = { handleEconomy };
