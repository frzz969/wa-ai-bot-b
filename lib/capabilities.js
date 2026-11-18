// lib/capabilities.js — SINGLE SOURCE OF TRUTH untuk daftar fitur bot SONEZZ.
//
// Semua data berasal dari handlers/menu.js CATEGORIES (yang sudah memuat ~200
// command + deskripsi + kategori + badge reply/owner). File ini TIDAK mengarang
// fitur baru: ia hanya "membaca" menu yang sudah ada lalu mengeksposnya dalam
// bentuk yang bisa dipakai AI / prompt / function declarations (Fase 5).
//
// API:
//   listCapabilities()          -> array capability
//   getCapability(id)           -> exact / alias lookup (atau null)
//   searchCapabilities(query)   -> array hasil pencarian
//   capabilitiesForPrompt()     -> string ringkas, satu baris per capability
//   toFunctionDeclarations()    -> array Gemini-style function declarations
//   capabilitiesByCategory()    -> Map/tag ringkasan (dipakai menu + .capabilities)
//
// Bentuk capability:
//   { id, name, aliases:[], category, description,
//     needsReply, access:'user'|'owner', source:'menu' }

const { CATEGORIES } = require('../handlers/menu');

// Alias eksplisit yang memang sudah di-described di menu (dan/atau terdaftar di
// command registry). Kita hanya menambahkan alias yang BENAR-BENAR sudah ada —
// diambil dari teks "alias .xxx" di deskripsi menu dan dari registry bila ada.
function extractInlineAliases(description) {
  const out = [];
  const re = /alias\s+\.([a-z0-9_-]+)/gi;
  let m;
  while ((m = re.exec(String(description || '')))) {
    out.push(m[1].toLowerCase());
  }
  return out;
}

function registryAliases() {
  const map = new Map();
  try {
    const { listCommands } = require('../src/commands');
    for (const cmd of listCommands()) {
      if (!cmd || !cmd.name) continue;
      map.set(cmd.name.toLowerCase(), Array.isArray(cmd.aliases) ? cmd.aliases.slice() : []);
    }
  } catch {
    // Registry belum siap / tidak ada -> diamkan. Menu tetap jadi sumber utama.
  }
  return map;
}

function buildCapabilities() {
  const reg = registryAliases();
  const list = [];
  const seen = new Set();

  for (const cat of CATEGORIES) {
    if (!cat || !Array.isArray(cat.items)) continue;
    const category = cat.tag;
    for (const item of cat.items) {
      if (!Array.isArray(item)) continue;
      const [n, d, f] = item;
      // Item ['@grup', 'Sub judul'] bukan command.
      if (!n || n === '@grup') continue;

      const id = String(n).toLowerCase().trim();
      const description = String(d || '');
      const flags = f && typeof f === 'object' ? f : {};

      const aliases = new Set();
      for (const a of extractInlineAliases(description)) aliases.add(a);
      for (const a of reg.get(id) || []) aliases.add(String(a).toLowerCase());
      aliases.delete(id); // id bukan alias

      if (seen.has(id)) continue; // jangan duplikat (mis. .ai muncul di chat + vision)
      seen.add(id);

      list.push({
        id,
        name: String(n),
        aliases: [...aliases],
        category,
        description,
        needsReply: Boolean(flags.reply),
        access: flags.owner ? 'owner' : 'user',
        source: 'menu',
      });
    }
  }
  return list;
}

let CACHE = null;
function all() {
  if (!CACHE) CACHE = buildCapabilities();
  return CACHE;
}

function listCapabilities() {
  // Salinan dangkal supaya pemanggil tidak bisa memutasi cache internal.
  return all().map((c) => ({ ...c, aliases: c.aliases.slice() }));
}

function getCapability(id) {
  const key = String(id || '').toLowerCase().replace(/^\.+/, '').trim();
  if (!key) return null;
  for (const c of all()) {
    if (c.id === key || c.aliases.includes(key)) return { ...c, aliases: c.aliases.slice() };
  }
  return null;
}

function searchCapabilities(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  return listCapabilities().filter((c) =>
    c.id.includes(q) ||
    c.name.toLowerCase().includes(q) ||
    c.description.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q) ||
    c.aliases.some((a) => a.includes(q))
  );
}

function capabilitiesForPrompt() {
  return all()
    .map((c) => `- .${c.id} : ${c.description} (kategori ${c.category.toUpperCase()})`)
    .join('\n');
}

// Ringkasan jumlah capability per kategori: [{ tag, title, count }].
function capabilitiesByCategory() {
  const counts = new Map();
  for (const c of all()) counts.set(c.category, (counts.get(c.category) || 0) + 1);
  return CATEGORIES
    .filter((cat) => counts.has(cat.tag))
    .map((cat) => ({ tag: cat.tag, title: cat.title, count: counts.get(cat.tag) }));
}

// Satu tool router, BUKAN ~200 tool. Detail command dikirim lewat deskripsi
// supaya hemat token. Fase 5 bisa pakai format generik ini atau map ke Gemini.
function toFunctionDeclarations() {
  const total = all().length;
  const cats = capabilitiesByCategory().map((c) => `${c.tag}(${c.count})`).join(', ');
  return [
    {
      name: 'sonezz_run',
      description:
        'Jalankan salah satu command bot SONEZZ yang tersedia. ' +
        `Ada ${total} command dalam kategori: ${cats}. ` +
        'ATURAN WAJIB: nilai `command` HARUS persis salah satu nama yang ada di DAFTAR di bawah. ' +
        'JANGAN mengarang nama command, jangan menebak sinonim, jangan membuat kata baru. ' +
        'Bila tidak ada yang cocok, JANGAN panggil tool ini — jawab dengan teks biasa. ' +
        'Contoh: "bikin stiker dari teks X" -> command="stiker", args="X"; ' +
        '"cuaca Jakarta" -> command="weather", args="Jakarta"; ' +
        '"cari info X" -> command="search", args="X". ' +
        'DAFTAR COMMAND (nama — deskripsi):\n' +
        all().map((c) => `.${c.id} — ${c.description}`).join('\n'),
      parameters: {
        type: 'OBJECT',
        properties: {
          command: { type: 'STRING', description: 'Nama command tanpa prefix titik, mis. "ai" atau "stiker".' },
          args: { type: 'STRING', description: 'Argumen atau teks untuk command tersebut (boleh kosong).' },
          reason: { type: 'STRING', description: 'Alasan singkat memilih command ini.' },
        },
        required: ['command', 'args', 'reason'],
      },
    },
  ];
}

module.exports = {
  listCapabilities,
  getCapability,
  searchCapabilities,
  capabilitiesForPrompt,
  capabilitiesByCategory,
  toFunctionDeclarations,
};
