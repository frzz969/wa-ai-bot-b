'use strict';
// lib/url-guard.js — validasi URL buatan user (SSRF guard).
//
// Dipakai sebelum fetch/yt-dlp/request ke URL yang berasal dari pesan user.
// Aturan:
//   - hanya skema http/https
//   - tolak IP private/loopback/link-local + IPv6 localhost/ULA/link-local
//   - tolak hostname localhost / metadata / *.localhost / *.internal / *.local
//   - tolak bentuk IP yang disamarkan (desimal, oktal, heksadesimal, IPv4-mapped IPv6)
// Domain normal (contoh https://example.com) TIDAK diblokir.
//
// Fungsi murni: TIDAK melakukan DNS lookup (menghindari DNS rebinding palsu pada
// tests). Pemanggil yang perlu resolusi nyata tetap bisa memakai result URL.

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
];

// Parse IPv4 yang bisa ditulis dalam berbagai notasi pada URL:
//   127.0.0.1, 0x7f000001, 2130706433, 0177.0.0.1, dll.
function parseIPv4(host) {
  const h = String(host || '').trim();
  // IPv4 standar 4 oktet desimal.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split('.').map(Number);
    if (parts.every((p) => p >= 0 && p <= 255)) return parts;
    return null;
  }
  // Bukan notasi angka tunggal / heksadesimal -> bukan IP tersamarkan.
  return null;
}

function isPrivateIPv4(parts) {
  if (!parts || parts.length !== 4) return false;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0/0, 192.0.2/24 (TEST-NET)
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 224 || a === 225) return true; // multicast
  if (a >= 240) return true; // reserved
  return false;
}

// Tangani IPv4 literal + bentuk numerik (int/hex/oktal) setelah URL parse.
// URL WHATWG normalisasi 0x7f000001 -> 127.0.0.1, 2130706433 -> 127.0.0.1,
// jadi pemeriksaan pada u.hostname sudah cukup di Node modern. Tetap kita
// pertahankan parser eksplisit sebagai lapis tambahan.
function isBlockedIPv4Literal(hostname) {
  const h = String(hostname || '').replace(/^\[|\]$/g, '');
  const p = parseIPv4(h);
  if (p) return isPrivateIPv4(p);
  // Cadangan: desimal/hex tunggal (beberapa runtime tidak menormalkan).
  if (/^(0x[0-9a-f]+|[0-9]+)$/i.test(h)) {
    const n = /^0x/i.test(h) ? parseInt(h, 16) : (/^0[0-7]+$/.test(h) ? parseInt(h, 8) : parseInt(h, 10));
    if (Number.isFinite(n) && n >= 0 && n <= 0xffffffff) {
      const parts = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
      return isPrivateIPv4(parts);
    }
  }
  return false;
}

function isBlockedIPv6(hostname) {
  let h = String(hostname || '').trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1' || h === '0:0:0:0:0:0:0:0') return true;
  if (/^::ffff:/.test(h)) {
    // IPv4-mapped: ::ffff:127.0.0.1 / ::ffff:7f00:1
    const tail = h.slice(7);
    if (tail.includes('.')) return isBlockedIPv4Literal(tail);
    const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16);
      return isPrivateIPv4([(a >> 8) & 255, a & 255, (b >> 8) & 255, b & 255]);
    }
    return true; // mapped address apa pun -> tolak
  }
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 ULA
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(h)) return true; // multicast
  return false;
}

function isBlockedHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // Hostname yang merupakan IP (literal / tersamarkan).
  if (isBlockedIPv4Literal(h)) return true;
  if (isBlockedIPv6(h)) return true;
  return false;
}

/**
 * Validasi URL user. Melempar Error bila tidak aman.
 * @param {*} value input URL
 * @param {string} label label untuk pesan error
 * @returns {string} URL sudah di-trim
 */
function assertSafeUrl(value, label = 'URL') {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) throw new Error(`${label} tidak valid.`);
  // Tolak whitespace/scontrol yang bisa dipakai mengelabui parser.
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error(`${label} tidak valid.`);
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${label} harus berupa link http/https yang valid.`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${label} harus berupa link http/https yang valid.`);
  }
  // Userinfo (user:pass@host) sering dipakai trik SSRF — tolak.
  if (u.username || u.password) throw new Error(`${label} tidak valid.`);
  if (!u.hostname) throw new Error(`${label} tidak valid.`);
  if (isBlockedHostname(u.hostname)) {
    throw new Error(`${label} tidak diizinkan (alamat lokal/private).`);
  }
  return raw;
}

/**
 * Versi boolean dari assertSafeUrl.
 */
function isSafeUrl(value) {
  try {
    assertSafeUrl(value);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  assertSafeUrl,
  isSafeUrl,
  isBlockedHostname,
  isPrivateIPv4,
  // alias kompatibilitas bila pemanggil menyebut "requireUrl"
  requireSafeUrl: assertSafeUrl,
};
