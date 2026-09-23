// index.js — koneksi Baileys: pairing-code / QR + auto-reconnect
require('dotenv').config();
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const config = require('./config');
const { handleMessage } = require('./handlers/messages');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // QR manual via qrcode-terminal
    browser: ['WA-AI-Bot-B', 'Chrome', '1.0.0'],
  });

  // Pairing code (jika PAIRING_NUMBER diisi & belum terdaftar)
  if (config.PAIRING_NUMBER && !sock.authState.creds.registered) {
    try {
      // beri jeda agar socket siap
      await new Promise((r) => setTimeout(r, 2000));
      const code = await sock.requestPairingCode(config.PAIRING_NUMBER);
      console.log('══════════════════════════════════');
      console.log('  PAIRING CODE:', code);
      console.log(`  Buka WA > Perangkat Tertaut > Tautkan > ketik kode di atas`);
      console.log('  Nomor:', config.PAIRING_NUMBER);
      console.log('══════════════════════════════════');
    } catch (e) {
      console.error('Gagal request pairing code:', e?.message || e);
    }
  }

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;

    // Fallback QR di terminal (hanya jika tidak pakai pairing number)
    if (qr && !config.PAIRING_NUMBER) {
      console.log('Scan QR berikut dengan WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Bot terhubung sebagai', sock.user?.id);
      console.log(`Prefix: "${config.PREFIX}" | Session: ${config.SESSION_DIR}/`);
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Code:', code, '| loggedOut:', loggedOut);
      if (!loggedOut) {
        console.log('Reconnect dalam 3 detik...');
        setTimeout(startBot, 3000);
      } else {
        console.log('❌ Session logged out. Hapus folder session/ lalu jalankan ulang untuk scan baru.');
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Semaphore sederhana: maks 4 pesan diproses bersamaan (FIFO).
  // Tiap pesan fire-and-forget (tidak blokir pesan lain), antrean berlebih menunggu giliran.
  const MAX_CONCURRENT = 4;
  let active = 0;
  const waitQueue = [];
  function pump() {
    while (active < MAX_CONCURRENT && waitQueue.length > 0) {
      active++;
      const job = waitQueue.shift();
      job().catch((e) => console.error('[msg]', e?.message || e));
    }
  }
  function runLimited(task) {
    return new Promise((resolve) => {
      waitQueue.push(async () => {
        try {
          await task();
        } catch (e) {
          console.error('[msg]', e?.message || e);
        } finally {
          resolve();
          active--;
          pump();
        }
      });
      pump();
    });
  }

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const m of messages) {
      runLimited(() => handleMessage(sock, m)).catch((e) =>
        console.error('[msg]', e?.message || e)
      );
    }
  });

  return sock;
}

startBot().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
