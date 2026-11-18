// lib/wallet-lock.js — mutex antrean untuk operasi wallet read-modify-write.
// Penulisan database/wallet.json dijalankan bergantian supaya pesan paralel
// tidak saling menimpa saldo. Timeout mencegah antrean macet; finally selalu
// melepas lock walau task melempar error.

const DEFAULT_TIMEOUT_MS = 5000;

let tail = Promise.resolve();

function withWalletLock(scope, fn) {
  const label = typeof scope === 'string' && scope ? scope : 'wallet';
  const task = typeof scope === 'function' ? scope : fn;
  if (typeof task !== 'function') return Promise.reject(new TypeError('withWalletLock butuh fungsi'));

  // Antre: setiap pemanggil menunggu `tail` sebelum jalan, lalu `tail` diganti
  // dengan promise task-nya. `run` selalu melepas (timeout pun tak deadlock).
  const run = tail.then(async () => {
    let timer = null;
    const guard = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`wallet-lock timeout (${label})`)),
        DEFAULT_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([Promise.resolve().then(task), guard]);
    } finally {
      clearTimeout(timer);
    }
  });

  // Jangan biarkan kegagalan satu task merusak rantai antrean berikutnya.
  tail = run.catch(() => {});
  return run;
}

module.exports = { withWalletLock, DEFAULT_TIMEOUT_MS };
