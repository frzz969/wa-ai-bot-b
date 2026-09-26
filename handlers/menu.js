// handlers/menu.js — teks menu (dipindah verbatim dari handlers/messages.js, tanpa perubahan isi).
function menuText(pushName, prefix) {
  // Kompatibel pemanggilan lama menuText(prefix) → anggap prefix saja, nama fallback 'kak'.
  if (prefix === undefined) {
    prefix = pushName;
    pushName = 'kak';
  }
  pushName = String(pushName || '').trim() || 'kak';
  prefix = String(prefix == null ? '.' : prefix);
  let tanggal = '';
  try {
    tanggal = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    tanggal = new Date().toDateString();
  }
  return (
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🤖 *SONEZZ AI ASSISTANT*\n` +
    `AI · Media · Utility\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Halo kak _${pushName}_ 👋, ada yang bisa dibantu?\n` +
    `🕐 ${tanggal} · 🔑 Prefix \`${prefix}\`\n\n` +

    `╭─「 🤖 BOT 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}menu / ${prefix}help — tampilkan menu ini\n` +
    `│ ${prefix}about — info tentang bot\n` +
    `│ ${prefix}status — cek status bot\n` +
    `│ ${prefix}ping — cek respon bot\n` +
    `│ ${prefix}rules — peraturan bot\n` +
    `╰─\n\n` +

    `╭─「 💬 CHAT 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}ai <teks> — tanya AI (mengingat 10 pesan)\n` +
    `│ ${prefix}talk [teks] — mode curhat gaya lembut\n` +
    `│ ${prefix}stoptalk — keluar dari mode curhat\n` +
    `│ ${prefix}new — mulai chat baru + sapaan\n` +
    `│ ${prefix}clear — hapus ingatan\n` +
    `│ ${prefix}memory — lihat ingatan\n` +
    `│ ${prefix}model — lihat model aktif\n` +
    `╰─\n\n` +

    `╭─「 🧠 AI TOOLS 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}ask <tanya> — tanya apa saja\n` +
    `│ ${prefix}explain <topik> — jelaskan sederhana\n` +
    `│ ${prefix}summarize <teks> — ringkas teks\n` +
    `│ ${prefix}rewrite <teks> — tulis ulang gaya beda\n` +
    `│ ${prefix}translate <teks> — terjemahkan ID ⇄ EN\n` +
    `│ ${prefix}ideas <topik> — buat 7 ide\n` +
    `│ ${prefix}qr <teks> — buat QR dari teks\n` +
    `╰─\n\n` +

    `╭─「 💻 CODING 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}code <minta> — buatkan kode\n` +
    `│ ${prefix}debug <kode+error> — analisis error\n` +
    `│ ${prefix}fix <kode> — perbaiki kode\n` +
    `│ ${prefix}run <kode> — eksekusi JS (owner only)\n` +
    `╰─\n\n` +

    `╭─「 🌐 WEB & INFO 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}search <q> — cari informasi di web\n` +
    `│ ${prefix}news <topik> — berita terbaru\n` +
    `│ ${prefix}weather <kota> — cek cuaca\n` +
    `│ ${prefix}time <kota> — cek waktu lokal\n` +
    `│ ${prefix}jadwalsholat <kota> — jadwal sholat\n` +
    `│ ${prefix}quran <nomor> [jml] — baca surat\n` +
    `│ ${prefix}gempa — info gempa BMKG\n` +
    `│ ${prefix}lirik <judul> — cari lirik lagu\n` +
    `│ ${prefix}shortlink <url> — perpendek link\n` +
    `│ ${prefix}kbbi <kata> — arti kata KBBI\n` +
    `│ ${prefix}animesaran — rekomendasi anime\n` +
    `╰─\n\n` +

    `╭─「 ⬇️ DOWNLOADER 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}play <judul> — cari + download mp3\n` +
    `│ ${prefix}ytmp3 <link> — YouTube jadi mp3\n` +
    `│ ${prefix}ytmp4 <link> — YouTube jadi mp4 (max 720p)\n` +
    `│ ${prefix}tiktok <link> — download TikTok\n` +
    `│ ${prefix}fbdl <link> — download video FB\n` +
    `│ ${prefix}igdl <link> — download video IG\n` +
    `╰─\n\n` +

    `╭─「 🆓 API PUBLIK 」\n` +
    `│ ${prefix}aio <link> — download multi-platform via API gratis\n` +
    `│ ${prefix}spotify <link> — audio Spotify via API gratis\n` +
    `│ ${prefix}gdrive <link> — download file Google Drive\n` +
    `│ ${prefix}deepsearch <topik> — riset singkat via AI publik\n` +
    `╰─\n\n` +

    `╭─「 🎭 STICKER & MEDIA 」\n` +
    `│ Reply gambar untuk:\n` +
    `│ ${prefix}stiker — gambar jadi stiker\n` +
    `│ ${prefix}stickerwm <pack>|<author> — watermark\n` +
    `│ ${prefix}triggered — efek triggered\n` +
    `│ Reply stiker untuk:\n` +
    `│ ${prefix}toimg — stiker jadi gambar\n` +
    `│ Langsung:\n` +
    `│ ${prefix}stiker <teks> — teks jadi stiker\n` +
    `│ ${prefix}attp / ${prefix}ttp <teks> — teks jadi stiker\n` +
    `│ ${prefix}emoji <emoji> — emoji jadi gambar\n` +
    `│ ${prefix}iqc <teks>|<tema> — quote iPhone (tema online)\n` +
    `│ ${prefix}iqclocal <teks> — quote iPhone (offline)\n` +
    `╰─\n\n` +

    `╭─「 👁️ VISION & VOICE 」\n` +
    `│ Reply gambar untuk:\n` +
    `│ ${prefix}ai <tanya> — tanya AI tentang gambar\n` +
    `│ ${prefix}ocr — baca tulisan di gambar\n` +
    `│ ${prefix}describe — deskripsikan gambar\n` +
    `│ ${prefix}analyze — analisis gambar mendalam\n` +
    `│ Reply voice note untuk:\n` +
    `│ ${prefix}vn / ${prefix}transcribe — transkrip voice note\n` +
    `│ Langsung:\n` +
    `│ ${prefix}tts <teks> — ubah teks menjadi suara\n` +
    `╰─\n\n` +

    `╭─「 🎨 CREATIVE 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}img / ${prefix}image <prompt> — buat gambar\n` +
    `│ ${prefix}brat <teks> — stiker teks ala brat\n` +
    `│ ${prefix}caption <topik> — caption medsos\n` +
    `│ ${prefix}story <tema> — cerita pendek\n` +
    `│ ${prefix}prompt <ide> — prompt gambar detail\n` +
     `│ ${prefix}nulis <teks> — tulis tangan di buku\n` +
     `╰─\n\n` +

     `╭─「 🛠️ TOOLS 」\n` +
     `│ Langsung:\n` +
     `│ ${prefix}morse <teks> — teks jadi sandi morse\n` +
     `│ ${prefix}dmorse <sandi> — sandi morse jadi teks\n` +
     `│ ${prefix}calc <ekspresi> — hitung cepat\n` +
     `│ Reply media untuk:\n` +
     `│ ${prefix}tourl — upload media jadi link\n` +
     `│ ${prefix}toimage — gambar jadi gambar 512px\n` +
     `│ ${prefix}toaudio / ${prefix}tovn — audio/video jadi VN\n` +
     `│ ${prefix}removebg — hapus background gambar\n` +
     `│ ${prefix}hd — HD-kan gambar\n` +
     `│ ${prefix}qrdetect — baca isi QR di gambar\n` +
     `│ ${prefix}blurface — blur wajah di gambar\n` +
     `╰─\n\n` +

     `╭─「 🎮 MINI GAME 」\n` +
     `│ Langsung:\n` +
     `│ ${prefix}ttt — main TicTacToe lawan bot\n` +
     `│ ${prefix}kuis [kategori] — soal acak\n` +
     `│ ${prefix}jawab <teks> — jawab soal kuis\n` +
     `╰─\n\n` +

    `╭─「 🎉 FUN 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}truth / ${prefix}dare — truth or dare\n` +
    `│ ${prefix}tarot — kartu tarot harianmu\n` +
    `│ ${prefix}zodiak <nama> — karakter zodiak\n` +
    `│ ${prefix}ship <nama1> | <nama2> — cek kecocokan\n` +
    `│ ${prefix}pantun — pantun random\n` +
    `│ ${prefix}weton <tgl-bln-thn> — hitung weton Jawa\n` +
    `│ ${prefix}ramal — ramalan hari ini\n` +
    `│ ${prefix}keberuntungan [nama] — persen hoki\n` +
    `│ ${prefix}mimpi <kata> — tafsir mimpi\n` +
    `│ ${prefix}karakter <nama> — baca karakter\n` +
    `│ ${prefix}pilih <a> | <b> | <c> — pilihkan satu\n` +
    `│ ${prefix}coinflip — lempar koin\n` +
    `│ ${prefix}dadu [2-100] — lempar dadu\n` +
    `│ ${prefix}8ball <tanya> — Magic 8-Ball\n` +
    `│ ${prefix}puji [nama] — pujian random\n` +
    `│ ${prefix}quotes — quote motivasi\n` +
    `╰─\n\n` +

    `╭─「 🎮 RPG 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}dash — main SPEEDY DASH\n` +
    `│ ${prefix}fish — memancing\n` +
    `│ ${prefix}mine — menambang\n` +
    `│ ${prefix}quest — misi harian\n` +
    `│ ${prefix}profile — profil RPG kamu\n` +
    `│ ${prefix}leaderboard — peringkat level\n` +
    `│ ${prefix}heal — pulihkan HP\n` +
    `╰─\n\n` +

    `╭─「 👥 GROUP 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}tagall [teks] — sebut semua anggota\n` +
    `│ ${prefix}hidetag <teks> — sebut tanpa daftar\n` +
    `│ ${prefix}kick @user / reply — keluarkan anggota\n` +
    `│ ${prefix}add <nomor> — tambah anggota\n` +
    `│ ${prefix}promote / ${prefix}demote @user\n` +
    `│ ${prefix}linkgc — link invite grup\n` +
    `│ ${prefix}group buka / tutup — buka/tutup grup\n` +
    `│ ${prefix}setname <nama> — ganti nama grup\n` +
    `│ ${prefix}setdesc <teks> — ganti deskripsi grup\n` +
    `│ ${prefix}grouplist — daftar grup bot\n` +
    `│ ${prefix}listadmin — daftar admin grup\n` +
    `│ ${prefix}infogc — info grup\n` +
    `│ ${prefix}welcome on / off — sambutan anggota\n` +
    `│ ${prefix}antilink on / off — hapus link otomatis\n` +
    `│ ${prefix}antiflood on / off — anti spam\n` +
    `│ ${prefix}badword add / del / list <kata>\n` +
    `│ ${prefix}warn / ${prefix}unwarn / ${prefix}cekwarn @user\n` +
    `│ ${prefix}groupset <opsi> — pengaturan grup\n` +
    `│ ${prefix}afk [alasan] — mode AFK\n` +
    `╰─\n\n` +

    `╭─「 💰 ECONOMY 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}daily — klaim harian\n` +
    `│ ${prefix}work — kerja dapat saldo\n` +
    `│ ${prefix}bank — info bank\n` +
    `│ ${prefix}balance — cek saldo\n` +
    `│ ${prefix}level — cek XP & level\n` +
    `│ ${prefix}limit — sisa limit harian\n` +
    `│ ${prefix}dompet — cek saldo dompet\n` +
    `│ ${prefix}transfer @user <nominal> — kirim saldo\n` +
    `│ ${prefix}mining — nambang saldo (cd 5 menit)\n` +
    `╰─\n\n` +

    `╭─「 ⬇️ JERE-DL 」\n` +
    `│ Langsung (butuh JERE_API_KEY valid):\n` +
    `│ ${prefix}dlcapcut <link> — download CapCut\n` +
    `│ ${prefix}dlmediafire <link> — download MediaFire\n` +
    `│ ${prefix}dlterabox <link> — download TeraBox\n` +
    `│ ${prefix}dlsfile <link> — download SFile\n` +
    `│ ${prefix}dldouyin <link> — download Douyin\n` +
    `│ ${prefix}dlsnack <link> — download SnackVideo\n` +
    `│ ${prefix}dltwitter <link> — download X/Twitter\n` +
    `│ ${prefix}dlsound <link> — download SoundCloud\n` +
    `│ ${prefix}dlapple <link> — download Apple Music\n` +
    `│ ${prefix}dlpin <link> — download Pinterest\n` +
    `│ ${prefix}dlthreads <link> — download Threads\n` +
    `│ ${prefix}dltele <link> — stiker Telegram\n` +
    `│ ${prefix}dlaio <link> — multi-platform (Jere)\n` +
    `│ Fallback (saat lane utama gagal):\n` +
    `│ ${prefix}dltt <link> — TikTok via Jere\n` +
    `│ ${prefix}dlytmp3 / ${prefix}dlytmp4 <link> — YouTube via Jere\n` +
    `│ ${prefix}dlig / ${prefix}dlfb <link> — IG/FB via Jere\n` +
    `│ ${prefix}dlspot <link> — Spotify via Jere\n` +
    `╰─\n\n` +

    `╭─「 ✨ JERE-AI 」\n` +
    `│ Langsung (butuh JERE_API_KEY valid):\n` +
    `│ ${prefix}jtxt2img <prompt> — teks jadi gambar\n` +
    `│ ${prefix}jtxt2vid <prompt> — teks jadi video\n` +
    `│ ${prefix}jsora <prompt> — video ala Sora\n` +
    `│ ${prefix}jsuno <prompt> — lagu AI (prompt|judul|style)\n` +
    `│ ${prefix}jchat <teks> — chat AI alternatif\n` +
    `│ Reply media untuk:\n` +
    `│ ${prefix}jimg2vid [prompt] — gambar jadi video\n` +
    `│ ${prefix}jupscale — HD-kan gambar (Jere)\n` +
    `│ ${prefix}jtoanime [style] — gambar jadi anime\n` +
    `│ ${prefix}jclone <teks> — voice clone (reply audio)\n` +
    `│ ${prefix}jswap — faceswap (2 gambar: kirim+reply)\n` +
    `╰─\n\n` +

    `╭─「 🎮 JERE-GAME 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}jkuis <game> — 23 kuis Jere (lihat daftar)\n` +
    `│ ${prefix}jkuislist — daftar game Jere\n` +
    `│ ${prefix}jawab <teks> — jawab kuis lokal/Jere\n` +
    `│ ${prefix}primbon <jenis>|<param> — 11 primbon\n` +
    `│ ${prefix}primbonlist — daftar primbon\n` +
    `│ ${prefix}animequotes — quote anime random\n` +
    `│ ${prefix}fakta — fakta unik\n` +
    `│ ${prefix}alkitab [kitab pasal:ayat] — baca Alkitab\n` +
    `│ ${prefix}tukar <jumlah|all> — 50 koin = 1 limit\n` +
    `╰─\n\n` +

    `╭─「 🎭 JERE-MEDIA 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}jqc <teks>|<nama> — quote WA\n` +
    `│ ${prefix}jdrake <atas>|<bawah> — meme drake\n` +
    `│ ${prefix}jfakewa <nama>|<tentang>|<no> — fake WA\n` +
    `│ ${prefix}jfakecall <nama>|<durasi> — fake call iOS\n` +
    `│ ${prefix}jsmeme <atas>|<bawah> — meme (reply gambar/URL)\n` +
    `│ ${prefix}jotaku <judul> — cari anime Otakudesu\n` +
    `│ ${prefix}jkomik <judul> — cari komik Komikindo\n` +
    `│ ${prefix}jmovie <judul> — cari film Moviebox\n` +
    `│ ${prefix}jviu <judul> — cari drama Viu\n` +
    `│ ${prefix}igstalk / ${prefix}ttstalk / ${prefix}ytstalk <user>\n` +
    `│ ${prefix}ghstalk / ${prefix}robstalk <user> — stalk GitHub/Roblox\n` +
    `╰─\n\n` +

    `╭─「 🛠️ JERE-UTIL 」\n` +
    `│ Langsung:\n` +
    `│ ${prefix}jyts <q> — search YouTube (Jere)\n` +
    `│ ${prefix}jspotify <q> — search Spotify (Jere)\n` +
    `│ ${prefix}jpin <q> — search Pinterest (Jere)\n` +
    `│ ${prefix}jwallpaper <q> — wallpaper random\n` +
    `│ ${prefix}jcuaca <kota> — cuaca (Jere)\n` +
    `│ ${prefix}jbmkg [kota] — cuaca BMKG (Jere)\n` +
    `│ ${prefix}jlibur [tahun] — hari libur nasional\n` +
    `│ ${prefix}jstyle <teks> — variasi gaya teks\n` +
    `│ ${prefix}jshort <url> — perpendek link\n` +
    `│ ${prefix}jgenius <judul> — cari lagu Genius\n` +
    `│ ${prefix}jmlbb <hero> — build MLBB\n` +
    `│ ${prefix}jmlbbtier — tier MLBB\n` +
    `│ ${prefix}jff <uid> — stalk Free Fire\n` +
    `│ ${prefix}jspeed / ${prefix}jos — info bot/server\n` +
    `│ Owner only:\n` +
    `│ ${prefix}jbackup — ringkasan file database\n` +
    `│ ${prefix}jplugins [nama] — list/baca src/commands\n` +
    `│ ${prefix}jjoin <link invite> — bot join grup\n` +
    `╰─\n\n` +

    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Private* → chat bebas\n` +
    `*Group* → \`${prefix}\` / mention bot\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

module.exports = { menuText };
