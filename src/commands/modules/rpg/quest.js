// src/commands/modules/rpg/quest.js — lihat + claim quest (NO-JUDI).
// Simpan database/quest.json BARU, tidak menyentuh shape JSON existing.
// Quest berbasis milestone (level / total saldo) — selesai otomatis terdeteksi,
// klaim sekali per user.
const fs = require('fs');
const path = require('path');
const systems = require('../../../../lib/systems');

const QUEST_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'quest.json');
const WALLET_FILE = path.join(__dirname, '..', '..', '..', '..', 'database', 'wallet.json');

const QUESTS = [
  {
    id: 'saldo5k',
    name: 'Pejuang Receh',
    description: 'Kumpulkan total 5.000 (cash+bank)',
    rewardCash: 500,
    rewardExp: 10,
    isDone: (level, total) => total >= 5000,
    goalText: '5000',
  },
  {
    id: 'level2',
    name: 'Naik Kelas',
    description: 'Capai Lv.2',
    rewardCash: 1000,
    rewardExp: 20,
    isDone: (level) => level >= 2,
    goalText: 'Lv.2',
  },
  {
    id: 'kaya10k',
    name: 'Sultan Mini',
    description: 'Kumpulkan total 10.000 (cash+bank)',
    rewardCash: 1500,
    rewardExp: 30,
    isDone: (level, total) => total >= 10000,
    goalText: '10000',
  },
];

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return {};
    const d = JSON.parse(raw);
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

function saveJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch {}
}

function getStats(id) {
  const k = String(id || '').trim();
  const lv = systems.getLevel(k);
  let cash = 0;
  let bank = 0;
  try {
    const w = readJson(WALLET_FILE);
    const cur = w[k];
    if (cur && typeof cur === 'object') {
      cash = Number(cur.balance || 0);
      bank = Number(cur.bank || 0);
    } else if (Number.isFinite(Number(cur))) {
      cash = Number(cur);
    }
  } catch {}
  return { level: Number(lv.level || 1), xp: Number(lv.xp || 0), cash, bank, total: cash + bank };
}

function getClaimed(id) {
  const db = readJson(QUEST_FILE);
  const e = db[String(id || '').trim()];
  return e && typeof e === 'object' ? e : {};
}

function setClaimed(id, questId) {
  const db = readJson(QUEST_FILE);
  const k = String(id || '').trim();
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  cur[String(questId)] = { claimed: true, at: Date.now() };
  db[k] = cur;
  saveJson(QUEST_FILE, db);
}

function addCashPreserve(id, amount) {
  const db = readJson(WALLET_FILE);
  const k = String(id || '').trim();
  const cur = db[k] && typeof db[k] === 'object' ? db[k] : {};
  const balance = Number(cur.balance || 0) + Math.floor(Number(amount || 0));
  db[k] = { ...cur, balance };
  saveJson(WALLET_FILE, db);
  return balance;
}

function parseArgs(ctx) {
  const s = Array.isArray(ctx.args) ? ctx.args.join(' ') : String(ctx.args ?? ctx.text ?? '');
  return s.trim().split(/\s+/).filter(Boolean);
}

module.exports = {
  name: 'quest',
  aliases: ['mission', 'tugas'],
  description: 'Lihat quest (.quest) & klaim (.quest claim <id>)',
  cooldown: 5000,
  groupOnly: false,
  adminOnly: false,
  ownerOnly: false,
  async execute(ctx) {
    const sender = ctx.sender;
    const parts = parseArgs(ctx);
    const sub = String(parts[0] || '').toLowerCase();
    const st = getStats(sender);
    const claimed = getClaimed(sender);

    if (sub === 'claim' || sub === 'klaim') {
      const qid = String(parts[1] || '').toLowerCase();
      const q = QUESTS.find((x) => x.id === qid);
      if (!qid || !q) {
        await ctx.reply(
          `❌ Quest tidak ditemukan.\nPakai: \`.quest claim <id>\`\nID: ${QUESTS.map((x) => x.id).join(', ')}`
        );
        return;
      }
      if (claimed[q.id]?.claimed) {
        await ctx.reply('✅ Quest ini sudah di-claim!');
        return;
      }
      if (!q.isDone(st.level, st.total)) {
        await ctx.reply(`📌 Quest *${q.name}* belum selesai.\n_${q.description} (target: ${q.goalText})_\nProgresmu: Lv.${st.level}, total ${st.total}`);
        return;
      }
      const bal = addCashPreserve(sender, q.rewardCash);
      const lv = systems.addXp(sender, q.rewardExp);
      setClaimed(sender, q.id);
      let text = `✅ Quest *${q.name}* selesai!\n🪙 +${q.rewardCash} → saldo: ${bal}\n⭐ +${q.rewardExp} EXP → Lv.${lv.level} (${lv.xp} XP)`;
      if (lv && lv.leveledUp) text += `\n🎉 Naik ke *Lv.${lv.level}!*`;
      await ctx.reply(text);
      return;
    }

    // Lihat daftar
    let text = `📋 *QUEST* (Lv.${st.level} | total ${st.total})\n\n`;
    for (const q of QUESTS) {
      const done = q.isDone(st.level, st.total);
      const isClaimed = Boolean(claimed[q.id]?.claimed);
      const badge = isClaimed ? '✅' : done ? '⭐' : '📌';
      const status = isClaimed ? 'sudah diklaim' : done ? 'bisa di-claim!' : q.description;
      text += `${badge} *${q.name}* (\`${q.id}\`)\n  _${status}_ → +${q.rewardCash} cash +${q.rewardExp} EXP\n`;
    }
    text += `\nKlaim: \`.quest claim <id>\``;
    await ctx.reply(text.trimEnd());
  },
};
