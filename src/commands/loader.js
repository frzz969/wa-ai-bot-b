// src/commands/loader.js — registry + loader rekursif (CJS).
// Format command: { name, aliases?, description?, cooldown?, groupOnly?, adminOnly?, ownerOnly?, execute(ctx) }
// ctx = { sock, m, jid, sender, pushName, args, text, mentions, isGroup,
//         isOwner, isAdmin, isBotAdmin, reply, react }
const fs = require('fs');
const path = require('path');

const commands = new Map(); // key: lowercase name/alias -> command object

function normalize(cmd, file) {
  if (!cmd || typeof cmd !== 'object') throw new Error(`Invalid command export: ${file}`);
  if (!cmd.name || typeof cmd.name !== 'string') throw new Error(`Command missing "name": ${file}`);
  if (typeof cmd.execute !== 'function') throw new Error(`Command "${cmd.name}" missing execute(ctx): ${file}`);
  cmd.name = cmd.name.toLowerCase().trim();
  cmd.aliases = Array.isArray(cmd.aliases)
    ? cmd.aliases.map((a) => String(a).toLowerCase().trim()).filter(Boolean)
    : [];
  cmd.cooldown = Number.isFinite(Number(cmd.cooldown)) ? Number(cmd.cooldown) : 0;
  cmd.groupOnly = Boolean(cmd.groupOnly);
  cmd.adminOnly = Boolean(cmd.adminOnly);
  cmd.ownerOnly = Boolean(cmd.ownerOnly);
  cmd.file = file;
  return cmd;
}

function walkJsFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJsFiles(full, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Muat semua command di bawah modulesDir (rekursif). Aman dipanggil ulang (reset registry).
function loadCommands(modulesDir) {
  commands.clear();
  const dir = modulesDir || path.join(__dirname, 'modules');
  const files = walkJsFiles(dir);
  for (const file of files) {
    try {
      // Hapus dari cache agar reload bersih (mis. saat dev).
      try { delete require.cache[require.resolve(file)]; } catch {}
      const mod = require(file);
      const list = Array.isArray(mod) ? mod : [mod && mod.command ? mod.command : mod];
      for (const raw of list) {
        if (!raw) continue;
        const cmd = normalize(raw, file);
        commands.set(cmd.name, cmd);
        for (const alias of cmd.aliases) {
          if (!commands.has(alias)) commands.set(alias, cmd);
        }
      }
    } catch (e) {
      console.error(`[commands] gagal load ${file}:`, e?.message || e);
    }
  }
  return commands;
}

function getCommand(name) {
  if (!name) return null;
  return commands.get(String(name).toLowerCase().trim()) || null;
}

function listCommands() {
  // Kembalikan command unik (tanpa duplikat alias).
  return [...new Set(commands.values())];
}

module.exports = { commands, loadCommands, getCommand, listCommands };
