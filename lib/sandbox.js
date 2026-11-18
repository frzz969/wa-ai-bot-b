'use strict';
// lib/sandbox.js — eksekusi JS "owner only" dari handler.
//
// CATATAN KEAMANAN: node:vm BUKAN boundary keamanan. Blacklist substring juga
// mudah ditembus (mis. ['con'+'structor'], this['process'], bracket access).
// Karena itu:
//   1. context dibuat benar-benar minimal (tanpa process/require/Function/global)
//   2. semua akses properti via bracket / computed / string-concat DITOLAK
//   3. identifier yang dibangun dinamis (eval/Function/atob/... walau dipecah) DITOLAK
//   4. pola berbahaya (prototype pollution, escape, loop tanpa batas) DITOLAK
//   5. timeout + output dibatasi; error internal tidak dibocorkan ke caller
// Jika jaminan ini tidak cukup untuk payload tertentu, eksekusi gagal tertutup
// (error generik) — command .run tetap dikenal di handler (bukan unknown command).

const vm = require('node:vm');

const MAX_CODE = 2000;
const MAX_OUTPUT = 1500;
const TIMEOUT_MS = 3000;
const MAX_LOGS = 5;

// Token yang menandakan percobaan mengakses built-in berbahaya / escape.
// Dicocokkan pada sumber yang sudah "dinormalisasi" (spasi & tanda kutip
// dihapus), sehingga 'con'+'structor' -> 'constructor' tetap tertangkap.
const DANGEROUS = [
  'constructor',
  'prototype',
  '__proto__',
  'process',
  'require',
  'globalthis',
  'global',
  'function',
  'eval',
  'import',
  'module',
  'exports',
  'this',
  'return',
  'throw',
  'new',
  'class',
  'async',
  'await',
  'fetch',
  'xmlhttprequest',
  'websocket',
  'childprocess',
  'child_process',
  'exec',
  'spawn',
  'fs',
  'vm',
  'buffer',
  'atob',
  'btoa',
  'stringfromcharcode',
  'fromcharcode',
  'charcodeat',
  'settimeout',
  'setinterval',
  'setimmediate',
  'queueMicrotask'.toLowerCase(),
  'promise',
  'reflect',
  'proxy',
  'object',
  'array',
  'symbol',
  'bigint',
  'date',
  'math',
  'json',
  'error',
  'regexp',
  'map',
  'set',
  'weakmap',
  'weakset',
  'intl',
  'parseint',
  'parsefloat',
  'isnan',
  'isFinite'.toLowerCase(),
  'encodeuri',
  'decodeuri',
  'encodeuricomponent',
  'decodeuricomponent',
  'typeof',
  'instanceof',
  'delete',
  'void',
  'in',
  'of',
  'yield',
  'debugger',
  'with',
  'let',
  'const',
  'var',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
];

// Pola struktural yang diblokir (regex di-source asli).
const BLOCK_PATTERNS = [
  /\bwhile\s*\(\s*true\s*\)/i,
  /\bfor\s*\(\s*;\s*;\s*\)/i,
  /\[[^\]]*\]/,               // bracket access / computed property
  /\bconstructor\b/i,
  /\b__proto__\b/i,
  /\bprototype\b/i,
  /\.\s*[A-Za-z_$][\w$]*\s*\(/, // method call pada properti (mis. x.toString())
];

// Pola yang dipakai untuk menyusun identifier secara dinamis: string literal,
// escape unicode/hex, .concat()/join(). Tanda '+' saja tidak mencukupi karena
// dipakai untuk aritmetika (2+2); '+' hanya berbahaya bila bersama string.
const OBFUSCATION_RE = /['"`]|\\u|\\x|\.concat\s*\(|\.join\s*\(|join\s*\(/;

function normalize(src) {
  return String(src)
    .toLowerCase()
    .replace(/[\s'"`\\]/g, ''); // buang spasi & tanda kutip -> 'con'+'structor' jadi 'constructor'
}

// Calls aman yang boleh dipanggil: hanya method pada objek yang kita sediakan.
const SAFE_CALLS = /^(?:Math\.(?:abs|floor|ceil|round|max|min|pow|sqrt|random|trunc|sign)|JSON\.(?:stringify|parse)|console\.(?:log|info|warn|error))\s*\([\w\s\d+\-*/%.,'"[\]{}:]*\)$/;

function findBlocked(src) {
  // Izinkan satu call aman pada Math/JSON/console (tanpa bracket/computed).
  const safeCall = SAFE_CALLS.test(src);

  for (const re of BLOCK_PATTERNS) {
    // bracket access selalu ditolak; method-call pattern hanya ditolak bila
    // bukan safe-call yang dikenal (Math./JSON./console.).
    if (re.test(src)) {
      const isMethodPattern = re.source.includes('\\s*\\(');
      if (isMethodPattern && safeCall) continue;
      return re.source;
    }
  }
  // Normalisasi + cek token berbahaya. Safe-call sudah tervalidi grammar
  // eksaknya (SAFE_CALLS), sehingga tidak perlu dicek token per token —
  // token pendek seperti "in"/"of" akan false-positive pada "min"/"stringify".
  if (!safeCall) {
    const norm = normalize(src);
    for (const token of DANGEROUS) {
      if (token && norm.includes(token)) return token;
    }
  }
  // String concatenation / template / escape -> bisa membentuk identifier dinamis.
  // (String literal di dalam JSON.stringify/console.log tetap diblokir di sini;
  //  ini disengaja — .run hanya menerima ekspresi angka & call numerik aman.)
  if (OBFUSCATION_RE.test(src)) return 'dynamic-identifier';
  // Akses properti dot: boleh hanya bila ini safe call yang dikenal.
  const dotProps = src.match(/\.\s*([A-Za-z_$][\w$]*)/g) || [];
  for (const d of dotProps) {
    const prop = d.replace(/[.\s]/g, '');
    if (!/^(log|info|warn|error|abs|floor|ceil|round|max|min|pow|sqrt|random|trunc|sign|stringify|parse)$/.test(prop)) {
      return 'property-access:' + prop;
    }
  }
  if ((src.includes('Math.') || src.includes('JSON.') || src.includes('console.')) && !safeCall) {
    return 'unsafe-call';
  }
  return null;
}

function formatValue(v) {
  if (typeof v === 'string') return v;
  if (v === undefined || v === null) return String(v);
  // Hanya tipe primitif sederhana yang boleh dirender.
  if (['number', 'boolean', 'bigint'].includes(typeof v)) return String(v);
  return '[object]';
}

// Context minimal: hanya ASCII math/JSON dasar & console dengan prototype null.
// Tidak ada process, require, Function, globalThis; timer sengaja tidak
// diberikan (loop/async di luar kendali tidak diperlukan untuk .run).
function makeContext(logs) {
  const push = (...a) => {
    if (logs.length < MAX_LOGS) {
      logs.push(a.map((x) => formatValue(x)).join(' '));
    }
  };
  const safeConsole = Object.freeze({
    log: push,
    info: push,
    warn: push,
    error: push,
  });

  const sandbox = Object.create(null);
  sandbox.console = safeConsole;
  // Math/JSON dibungkus null-prototype supaya tidak ada jalan ke constructor.
  sandbox.Math = Object.assign(Object.create(null), {
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    max: Math.max, min: Math.min, pow: Math.pow, sqrt: Math.sqrt,
    random: Math.random, PI: Math.PI, E: Math.E,
    trunc: Math.trunc, sign: Math.sign,
  });
  sandbox.JSON = Object.freeze({
    stringify: (v) => {
      try { return JSON.stringify(v); } catch { return 'null'; }
    },
    parse: (s) => {
      try { return JSON.parse(s); } catch { return null; }
    },
  });

  const context = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  // Pastikan tidak ada global berbahaya yang tersisa di context.
  for (const k of ['process', 'require', 'global', 'globalThis', 'Function', 'eval', 'Buffer', 'setTimeout', 'setInterval', 'fetch']) {
    try { Object.defineProperty(context, k, { value: undefined, configurable: false, writable: false }); } catch {}
  }
  return context;
}

async function runSandboxed(code) {
  const src = String(code || '').trim();
  if (!src) throw new Error('Kode kosong.');
  if (src.length > MAX_CODE) {
    throw new Error(`Kode terlalu panjang (max ${MAX_CODE} char).`);
  }

  const blocked = findBlocked(src);
  if (blocked) {
    // Pesan generik: jangan bocorkan detail internal/ pola ke user.
    throw new Error('Eksekusi ditolak demi keamanan.');
  }

  const logs = [];
  const context = makeContext(logs);

  // Ekspresi aritmetika satu baris ATAU satu safe-call dijalankan langsung.
  // Apa pun bentuk lain (pernyataan, blok, function, multiple statement)
  // DITOLAK — vm bukan boundary yang aman untuk kode user arbitrary.
  const isArithmetic =
    !src.includes('\n') && !src.includes(';') &&
    /^[\d\s+\-*/%.]+$/.test(src);
  const isSafeCall =
    !src.includes('\n') && !src.includes(';') &&
    SAFE_CALLS.test(src) && !/['"\[\]\\]/.test(src);
  if (!isArithmetic && !isSafeCall) {
    throw new Error('Eksekusi ditolak demi keamanan.');
  }

  let result;
  try {
    result = vm.runInContext(`(${src})`, context, { timeout: TIMEOUT_MS });
  } catch {
    // Jangan pernah mengembalikan pesan error vm/internal ke pemanggil.
    throw new Error('Eksekusi gagal.');
  }

  const parts = [];
  if (logs.length) parts.push(logs.join('\n'));
  if (result !== undefined) parts.push('=> ' + formatValue(result));
  const out = parts.join('\n').slice(0, MAX_OUTPUT);
  return out || '(tanpa output)';
}

module.exports = { runSandboxed };
