// lib/sandbox.js — eksekusi JS aman via node:vm (owner only, dipanggil dari handler)
const vm = require('node:vm');

const MAX_CODE = 2000;
const MAX_OUTPUT = 1500;
const TIMEOUT_MS = 3000;
const MAX_LOGS = 5;

const BLOCKED = [
  'require',
  'process',
  'global',
  'globalThis',
  'eval',
  'Function',
  'fs',
  'child_process',
  'exec',
  'spawn',
  'fetch',
  'axios',
  'http',
  'WebSocket',
  'constructor',
  'prototype',
  '__proto__',
  'module',
  'exports',
  'setTimeout',
  'setInterval',
  'while(true)',
  'for(;;)',
];

// Dicek via word-boundary agar tidak false positive (mis. "important" lolos)
const BLOCKED_WORD = ['import', 'this'];

function findBlocked(code) {
  const src = String(code);
  const lower = src.toLowerCase();
  const nospace = lower.replace(/\s+/g, '');
  for (const w of BLOCKED) {
    const wl = w.toLowerCase();
    // pola tanpa spasi (while(true), for(;;)) dicek versi rapat
    if (wl === 'while(true)' || wl === 'for(;;)') {
      if (nospace.includes(wl)) return w;
    } else if (lower.includes(wl)) {
      return w;
    }
  }
  for (const w of BLOCKED_WORD) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(src)) return w;
  }
  return null;
}

function formatValue(v) {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

async function runSandboxed(code) {
  const src = String(code || '').trim();
  if (!src) throw new Error('Kode kosong.');
  if (src.length > MAX_CODE) {
    throw new Error(`Kode terlalu panjang (max ${MAX_CODE} char).`);
  }
  const blocked = findBlocked(src);
  if (blocked) {
    throw new Error(`Diblokir: kata "${blocked}" tidak diizinkan.`);
  }

  const logs = [];
  const customConsole = {
    log: (...a) => {
      if (logs.length < MAX_LOGS) logs.push(a.map((x) => formatValue(x)).join(' '));
    },
    info: (...a) => {
      if (logs.length < MAX_LOGS) logs.push(a.map((x) => formatValue(x)).join(' '));
    },
    warn: (...a) => {
      if (logs.length < MAX_LOGS) logs.push(a.map((x) => formatValue(x)).join(' '));
    },
    error: (...a) => {
      if (logs.length < MAX_LOGS) logs.push(a.map((x) => formatValue(x)).join(' '));
    },
  };

  const context = vm.createContext({ Math, JSON, console: customConsole });

  // Support await + return nilai terakhir:
  // ekspresi satu baris dibungkus "return (...)", blok multi-baris dipakai apa adanya
  const isSingleExpr =
    !src.includes('\n') && !src.includes(';') && !/^\s*return\b/.test(src);
  const wrapped = isSingleExpr
    ? `(async () => { return (${src}); })()`
    : `(async () => { ${src} })()`;

  let result;
  try {
    result = await vm.runInContext(wrapped, context, { timeout: TIMEOUT_MS });
  } catch (e) {
    // potong pesan error, jangan bocorkan stack internal
    throw new Error(String((e && e.message) || e || 'Error').slice(0, 500));
  }

  const parts = [];
  if (logs.length) parts.push(logs.join('\n'));
  if (result !== undefined) parts.push('=> ' + formatValue(result));
  const out = parts.join('\n').slice(0, MAX_OUTPUT);
  return out || '(tanpa output)';
}

module.exports = { runSandboxed };
