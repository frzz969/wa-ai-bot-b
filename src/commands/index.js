// src/commands/index.js — entrypoint registry (CJS).
// Dipakai handlers/messages.js: loadCommands() sekali saat boot, getCommand() per pesan.
const path = require('path');
const { commands, loadCommands, getCommand, listCommands } = require('./loader');

// Auto-load saat pertama kali di-require agar router langsung siap.
// Gagal load tidak boleh bikin bot crash (fallback ke handler lama).
try {
  loadCommands(path.join(__dirname, 'modules'));
} catch (e) {
  console.error('[commands] auto-load gagal:', e?.message || e);
}

// Ekspos capabilities (single source of truth fitur) agar bisa di-require dari
// plugin / AI. Ini export tambahan saja — tidak mengubah registry command.
let capabilities = null;
try {
  capabilities = require('../../lib/capabilities');
} catch {
  capabilities = null;
}

module.exports = { commands, loadCommands, getCommand, listCommands, capabilities };
