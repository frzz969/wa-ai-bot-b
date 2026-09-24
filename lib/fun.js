// lib/fun.js — LANE FUN (murni lokal, tanpa API)
// truth/dare/pantun/weton + tarot/zodiak/ramal/keberuntungan/mimpi/karakter/
// pilih/coinflip/dadu/eightball/ship/puji/quotes.
// Pola adaptasi Akira (bacot.json/anime.json di E:\folder projek vs code\akirabotv1\akiraganz\):
// file JSON dibaca bila ada (tulis ulang lewat loader), bila tak ada → fallback statis.
// Contoh router:
//   const fun = require('../lib/fun');
//   if (cmd === 'truth') return await sock.sendMessage(jid, { text: fun.truth() }, { quoted: m });

const fs = require('fs');
const path = require('path');

const AKIRA_DIR = process.env.AKIRA_DIR || path.join('E:', 'folder projek vs code', 'akirabotv1', 'akiraganz');

// Muat JSON eksternal bila ada & valid array, else null (→ fallback statis).
function loadAkiraJson(name) {
  try {
    const p = path.join(AKIRA_DIR, name);
    if (!fs.existsSync(p)) return null;
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.map(String);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- fallback ---
const TRUTH_STATIC = [
  'Siapa orang yang diam-diam kamu suka sekarang?',
  'Apa kebohongan terbesar yang pernah kamu katakan ke orang tua?',
  'Kapan terakhir kali kamu nangis? Karena apa?',
  'Apa hal paling memalukan yang pernah kamu lakukan di sekolah?',
  'Siapa nama mantan yang belum bisa kamu lupain?',
  'Pernah stalking siapa sampai ke postingan paling lama? Ngaku!',
  'Apa chat yang paling kamu sesali pernah dikirim?',
  'Kalau bisa balik ke masa lalu, apa yang mau kamu ubah?',
];

const DARE_STATIC = [
  'Kirim voice note nyanyi lagu favoritmu, minimal 10 detik!',
  'Ganti nama grup jadi "Aku Sayang Kamu" selama 1 jam!',
  'Chat mantanmu dengan teks "hai, kangen" lalu screenshot ke sini!',
  'Kirim foto muka jelekmu ke chat ini sekarang!',
  'Telepon kontak ke-5 di HP kamu dan bilang "aku sayang kamu"!',
  'Push-up 10x lalu kirim video buktinya!',
  'Kirim 100 ribu ke teman yang paling aktif di grup ini! (bercanda... atau tidak)',
  'Teriak "AKU GANTENG/CANTIK" pakai voice note!',
];

const PANTUN_STATIC = [
  'Jalan-jalan ke kota Blitar,\nJangan lupa membeli sukun.\nKalau kamu rajin belajar,\nMasa depan cerah menanti pun.',
  'Burung nuri burung dara,\nTerbang tinggi ke angkasa.\nJangan suka menunda-nunda,\nNanti menyesal tak berasa.',
  'Makan soto di pinggir jalan,\nMinumnya es teh manis.\nJangan lupa tersenyum kawan,\nHidup ini harus optimis.',
  'Ke pasar beli pepaya,\nPulangnya mampir ke Kediri.\nRajin-rajinlah berdoa,\nAgar hidup penuh berkah diri.',
  'Naik kereta ke Surabaya,\nDuduk manis di samping jendela.\nBelajar giat setiap harinya,\nSukses menanti di depan mata.',
];

const TRUTH = loadAkiraJson('truth.json') || TRUTH_STATIC;
const DARE = loadAkiraJson('dare.json') || DARE_STATIC;
const PANTUN = loadAkiraJson('pantun.json') || PANTUN_STATIC;

// ---------------------------------------------------------------- util ---
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Hash deterministik agar .ship/.keberuntungan stabil untuk input sama.
function hashStr(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ----------------------------------------------------------------- api ---
// Contoh: fun.truth() → '🤔 Truth: ...'
function truth() {
  return '🤔 *Truth:*\n' + pick(TRUTH);
}

function dare() {
  return '😈 *Dare:*\n' + pick(DARE);
}

function pantun() {
  return '🎭 *Pantun:*\n' + pick(PANTUN);
}

const PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Weton Jawa dari tanggal lahir. Epoch: 1 Jan 1970 = Kamis Wage.
// Contoh: fun.weton('17-8-1945') atau fun.weton('17 8 1945')
function weton(input) {
  const parts = String(input || '').trim().split(/[^0-9]+/).filter(Boolean).map(Number);
  if (parts.length < 3) return 'Contoh: .weton 17-8-1945';
  const d = parts[0];
  const mo = parts[1];
  const y = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  const dt = new Date(y, mo - 1, d);
  if (isNaN(dt.getTime()) || dt.getDate() !== d || dt.getMonth() !== mo - 1) return '❌ Tanggal tidak valid. Contoh: .weton 17-8-1945';
  const epoch = new Date(1970, 0, 1); // Kamis Wage
  const diffDays = Math.round((dt - epoch) / 86400000);
  const pasaran = PASARAN[((diffDays % 5) + 5) % 5];
  const hari = HARI_ID[dt.getDay()];
  return '🗓️ *Weton ' + d + '-' + mo + '-' + y + ':*\n' + hari + ' ' + pasaran;
}

// ------------------------------------------------------- fungsi baru ---
const TAROT_CARDS = [
  { name: 'The Fool', arti: 'Awal baru menantimu. Berani melangkah, jangan takut gagal, rezeki orang berani!' },
  { name: 'The Magician', arti: 'Semua modal sudah ada di tanganmu. Tinggal eksekusi, jangan kebanyakan mikir.' },
  { name: 'The High Priestess', arti: 'Dengerin intuisi kamu. Jawaban yang kamu cari sebenarnya sudah kamu tahu.' },
  { name: 'The Empress', arti: 'Rezeki dan kasih sayang lagi subur. Saat yang pas buat merawat diri dan orang tersayang.' },
  { name: 'The Emperor', arti: 'Butuh ketegasan dan disiplin. Bikin aturan main, lalu konsisten jalanin.' },
  { name: 'The Hierophant', arti: 'Minta nasihat orang yang lebih berpengalaman. Jangan malu belajar dari senior.' },
  { name: 'The Lovers', arti: 'Ada pilihan penting soal hati. Ikuti yang bikin hatimu tenang, bukan yang bikin penasaran sesaat.' },
  { name: 'The Chariot', arti: 'Fokus dan gaspol! Selama kamu konsisten, kemenangan sudah di depan mata.' },
  { name: 'Strength', arti: 'Sabar dan lembut justru bikin kamu menang. Kendalikan emosi, bukan orang lain.' },
  { name: 'The Hermit', arti: 'Rehat sejenak dan renungkan. Jawaban terbaik datang pas kamu tenang sendirian.' },
  { name: 'Wheel of Fortune', arti: 'Roda nasib lagi muter ke arahmu. Hoki datang, siap-siap manfaatkan peluang!' },
  { name: 'Justice', arti: 'Yang jujur bakal menang. Bertindak adil, karma baik lagi jalan ke kamu.' },
  { name: 'The Hanged Man', arti: 'Coba lihat dari sudut lain. Kadang diam dulu justru bikin solusi muncul.' },
  { name: 'Death', arti: 'Santai, ini soal akhir dan awal baru. Lepaskan yang sudah usang biar yang baru bisa masuk.' },
  { name: 'Temperance', arti: 'Jaga keseimbangan. Jangan terlalu gas, jangan terlalu rem, santai tapi jalan.' },
  { name: 'The Devil', arti: 'Awas jebakan nafsu sesaat. Jangan sampai kesenangan singkat merusak rencana besar.' },
  { name: 'The Tower', arti: 'Ada perubahan mendadak. Jangan panik, ini cara semesta bangun fondasi yang lebih kuat.' },
  { name: 'The Star', arti: 'Harapanmu cerah banget. Terus berdoa dan usaha, bintangmu lagi bersinar.' },
  { name: 'The Moon', arti: 'Banyak hal belum jelas. Jangan ambil keputusan besar sebelum semua terang.' },
  { name: 'The Sun', arti: 'Hari cerah! Kebahagiaan, rezeki, dan kabar baik lagi dekat sama kamu.' },
  { name: 'Judgement', arti: 'Saatnya evaluasi dan bangkit. Maafkan masa lalu, mulai lembaran baru.' },
  { name: 'The World', arti: 'Satu fase selesai dengan manis. Nikmati hasilnya, kamu pantas merayakannya!' },
];

// Contoh: fun.tarot() → kartu Major Arcana random + arti + upright/reversed
function tarot() {
  const kartu = pick(TAROT_CARDS);
  const upright = Math.random() < 0.5;
  const posisi = upright ? 'Upright' : 'Reversed';
  const extra = upright ? '' : '\n_Kalau reversed: energinya ketahan, santai dulu jangan dipaksa._';
  return '🔮 *Tarot kamu: ' + kartu.name + ' (' + posisi + ')*\n' + kartu.arti + extra;
}

const ZODIAK_DATA = {
  aries: { nama: 'Aries', tanggal: '21 Mar – 19 Apr', elemen: 'Api', sifat: 'Berani, semangat, dan pantang mundur. Kamu tipe pemimpin yang gaspol duluan, mikir belakangan. Hati-hati gampang kebakar emosi ya.' },
  taurus: { nama: 'Taurus', tanggal: '20 Apr – 20 Mei', elemen: 'Tanah', sifat: 'Setia, sabar, dan pekerja keras. Kamu sayang banget sama kenyamanan dan makanan enak. Sekali sayang, susah pindah ke lain hati.' },
  gemini: { nama: 'Gemini', tanggal: '21 Mei – 20 Jun', elemen: 'Udara', sifat: 'Cerewet seru, pinter ngobrol, dan gampang beradaptasi. Otakmu muter terus kayak kipas angin. Kadang mood-mu gampang berubah-ubah.' },
  cancer: { nama: 'Cancer', tanggal: '21 Jun – 22 Jul', elemen: 'Air', sifat: 'Perasa, penyayang, dan family-oriented. Kamu gampang baper tapi juga paling tulus. Rumah dan orang tersayang adalah duniamu.' },
  leo: { nama: 'Leo', tanggal: '23 Jul – 22 Agu', elemen: 'Api', sifat: 'Pede, karismatik, dan suka jadi pusat perhatian. Kamu lahir buat bersinar. Dermawan banget ke orang yang kamu sayang.' },
  virgo: { nama: 'Virgo', tanggal: '23 Agu – 22 Sep', elemen: 'Tanah', sifat: 'Teliti, rapi, dan perfeksionis. Kamu paling bisa diandalkan buat hal detail. Coba agak santai, jangan semua harus sempurna.' },
  libra: { nama: 'Libra', tanggal: '23 Sep – 22 Okt', elemen: 'Udara', sifat: 'Adil, charming, dan cinta damai. Kamu benci konflik dan pinter bikin semua orang nyaman. Cuma kadang susah ambil keputusan.' },
  scorpio: { nama: 'Scorpio', tanggal: '23 Okt – 21 Nov', elemen: 'Air', sifat: 'Misterius, intens, dan setia mati. Sekali percaya ya total, sekali dikhianati ya susah lupa. Intuisimu tajam banget.' },
  sagitarius: { nama: 'Sagitarius', tanggal: '22 Nov – 21 Des', elemen: 'Api', sifat: 'Petualang, jujur, dan optimis. Kamu cinta kebebasan dan benci dikekang. Humormu receh tapi ngangenin.' },
  capricorn: { nama: 'Capricorn', tanggal: '22 Des – 19 Jan', elemen: 'Tanah', sifat: 'Ambisius, disiplin, dan tahan banting. Kamu pendaki mimpi yang pelan tapi pasti sampai puncak. Kerja keras adalah nama tengahmu.' },
  aquarius: { nama: 'Aquarius', tanggal: '20 Jan – 18 Feb', elemen: 'Udara', sifat: 'Unik, kreatif, dan punya pikiran jauh ke depan. Kamu cuek di luar tapi peduli banget sama kemanusiaan. Anti mainstream!' },
  pisces: { nama: 'Pisces', tanggal: '19 Feb – 20 Mar', elemen: 'Air', sifat: 'Lembut, imajinatif, dan gampang empati. Kamu pemimpi ulung yang hatinya luas. Seni dan perasaan adalah bahasamu.' },
};

// Contoh: fun.zodiak('leo') → karakter + tanggal + elemen
function zodiak(s) {
  const key = String(s || '').trim().toLowerCase();
  if (!key || !ZODIAK_DATA[key]) {
    return 'Contoh: .zodiak leo\nPilih: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagitarius, capricorn, aquarius, pisces';
  }
  const z = ZODIAK_DATA[key];
  return '♈ *Zodiak ' + z.nama + '*\n📅 ' + z.tanggal + ' · Elemen: ' + z.elemen + '\n' + z.sifat;
}

const RAMAL_STATIC = [
  '💘 Cinta: ada yang diam-diam kepoin kamu. Karier: kerjaan numpuk tapi bakal kelar. Keuangan: jangan jajan berlebihan. Hoki: ⭐⭐⭐⭐',
  '💘 Cinta: cocok buat PDKT hari ini, gas aja! Karier: ide kamu bakal dilirik atasan. Keuangan: ada rezeki kecil. Hoki: ⭐⭐⭐⭐⭐',
  '💘 Cinta: jangan baper duluan, santai aja. Karier: fokus satu kerjaan biar beres. Keuangan: aman asal nggak fomo. Hoki: ⭐⭐⭐',
  '💘 Cinta: mantan kepikiran kamu, eh. Karier: cocok buat belajar skill baru. Keuangan: nabung dikit hari ini. Hoki: ⭐⭐⭐⭐',
  '💘 Cinta: waktu yang pas buat ngobrol dalam sama doi. Karier: jangan tunda deadline. Keuangan: ada peluang cuan kecil. Hoki: ⭐⭐⭐⭐⭐',
  '💘 Cinta: sabar, pasangan hidup lagi di jalan. Karier: hari ini cocok buat kolaborasi. Keuangan: hindari pinjemin uang dulu. Hoki: ⭐⭐⭐',
  '💘 Cinta: tebar pesona dikit, yang naksir nambah. Karier: bakal ada kabar baik soal kerjaan. Keuangan: stabil. Hoki: ⭐⭐⭐⭐',
  '💘 Cinta: jangan overthinking chat doi. Karier: kerjain yang penting dulu. Keuangan: cek dompet sebelum checkout. Hoki: ⭐⭐⭐',
  '💘 Cinta: kejutan manis menanti sore ini. Karier: tunjukkan kemampuanmu, jangan malu. Keuangan: rezeki nomplok kecil. Hoki: ⭐⭐⭐⭐⭐',
  '💘 Cinta: quality time sama orang tersayang. Karier: istirahat juga produktif. Keuangan: cukup, jangan serakah. Hoki: ⭐⭐⭐⭐',
];

// Contoh: fun.ramal() → ramalan hari ini
function ramal() {
  return '🔮 *Ramalan hari ini:*\n' + pick(RAMAL_STATIC);
}

// Contoh: fun.keberuntungan('Budi') → angka hoki + persen + label (stabil untuk nama sama)
function keberuntungan(s) {
  const nama = String(s || '').trim();
  let angka;
  let persen;
  if (nama) {
    const h = hashStr('hoki' + nama.toLowerCase());
    angka = (h % 99) + 1;
    persen = ((Math.floor(h / 101) % 101));
  } else {
    angka = 1 + Math.floor(Math.random() * 99);
    persen = Math.floor(Math.random() * 101);
  }
  const label = persen >= 85 ? '🔥 Hoki maksimal! Gas ambil peluang hari ini!' : persen >= 65 ? '🍀 Hoki bagus, manfaatkan momennya!' : persen >= 40 ? '🙂 Lumayan, tetap usaha jangan pasrah.' : '😅 Lagi kurang hoki, santai dan hati-hati aja.';
  const siapa = nama ? ' buat ' + nama : '';
  return '🍀 *Keberuntungan' + siapa + ':*\n🔢 Angka hoki: ' + angka + '\n📊 Persen hoki: ' + persen + '%\n' + label;
}

const MIMPI_DICT = {
  ular: 'Ketemu ular: ada orang yang perlu diwaspadai, tapi juga tanda rezeki atau pasangan mendekat.',
  air: 'Mimpi air jernih: hati lagi tenang dan rezeki mengalir. Kalau keruh: lagi banyak pikiran.',
  terbang: 'Mimpi terbang: kamu pengen bebas dan cita-citamu lagi tinggi. Pertanda bagus buat kejar mimpi!',
  gigi: 'Mimpi gigi rontok: lagi cemas soal penampilan atau ada perubahan besar. Santai, ini fase lewat.',
  uang: 'Mimpi uang: lagi mikirin rezeki. Bisa jadi tanda ada peluang cuan asal kamu peka.',
  menikah: 'Mimpi menikah: ada komitmen baru atau perubahan hidup. Bisa soal kerjaan, bukan cuma soal pasangan.',
  bayi: 'Mimpi bayi: ada awal baru yang butuh dirawat. Ide atau proyek kecilmu bakal tumbuh.',
  meninggal: 'Mimpi meninggal: bukan hal buruk, justru tanda umur panjang dan fase lama bakal berakhir.',
  dikejar: 'Mimpi dikejar: ada masalah yang kamu hindari. Hadapi pelan-pelan, pasti kelar.',
  jatuh: 'Mimpi jatuh: kamu takut gagal atau kehilangan kendali. Istirahat dan atur ulang rencanamu.',
  api: 'Mimpi api: semangatmu lagi membara. Bagus buat action, asal jangan kebakar emosi.',
  ikan: 'Mimpi ikan: tanda rezeki dan keberuntungan, apalagi kalau ikannya banyak dan hidup.',
  kucing: 'Mimpi kucing: ada kenyamanan dan kemandirian. Bisa juga ada teman yang butuh perhatianmu.',
  hujan: 'Mimpi hujan: pembersihan emosi. Setelah hujan ada rezeki dan ketenangan.',
  rumah: 'Mimpi rumah: soal diri dan keluarga. Rumah rapi berarti hati tenang, rumah rusak berarti perlu beres-beres batin.',
};

// Contoh: fun.mimpi('ular') → tafsir mimpi
function mimpi(s) {
  const key = String(s || '').trim().toLowerCase();
  if (!key) return 'Contoh: .mimpi ular';
  const found = Object.keys(MIMPI_DICT).find((k) => key.includes(k));
  if (found) return '💤 *Arti mimpi "' + found + '":*\n' + MIMPI_DICT[found];
  return '💤 Mimpimu unik, belum ada di kamus. Tapi biasanya mimpi cuma bunga tidur — yang penting paginya tetap semangat!';
}

const KARAKTER_TPL = [
  '{nama} itu orangnya asik banget, gampang akrab sama siapa aja. Cuma kadang pelupa, naro barang lupa naruh di mana.',
  '{nama} kelihatannya cuek, padahal perhatiannya gede banget ke orang tersayang. Tipe yang diam-diam berjuang.',
  '{nama} itu pekerja keras dan pantang nyerah. Kalau sudah punya target, bakal dikejar sampai dapat!',
  '{nama} humoris dan bikin suasana cair. Di mana ada dia, di situ ada ketawa. Tapi kalau serius ya serius banget.',
  '{nama} kreatif dan imajinasinya liar. Cocok jadi seniman atau kreator. Kadang idenya terlalu maju sampai orang lain bingung.',
  '{nama} setia dan bisa dipercaya. Sekali jadi temen ya temen beneran, bukan temen musiman.',
  '{nama} sabar dan dewasa. Cocok jadi tempat curhat karena dengerinnya tulus, solusinya masuk akal.',
  '{nama} ambisius dan berani ambil risiko. Hoki sering nempel karena berani coba duluan.',
];

// Contoh: fun.karakter('Budi') → deskripsi karakter random pakai nama
function karakter(nama) {
  const n = String(nama || '').trim();
  if (!n) return 'Contoh: .karakter Budi';
  return '🧬 *Karakter ' + n + ':*\n' + pick(KARAKTER_TPL).split('{nama}').join(n);
}

// Contoh: fun.pilih('nasi | mie | soto') → pilih 1 random
function pilih(s) {
  const raw = String(s || '').trim();
  if (!raw) return 'Contoh: .pilih nasi | mie | soto';
  let opts;
  if (raw.includes('|')) opts = raw.split('|');
  else if (raw.includes(',')) opts = raw.split(',');
  else opts = raw.split(/\s+/);
  opts = opts.map((x) => String(x || '').trim()).filter(Boolean);
  if (opts.length < 2) return 'Kasih minimal 2 pilihan ya. Contoh: .pilih nasi | mie | soto';
  return '🎯 *Aku pilih: ' + pick(opts) + '*\ndari: ' + opts.join(' | ');
}

// Contoh: fun.coinflip() → '🪙 Gambar!' / '🪙 Angka!'
function coinflip() {
  return pick(['🪙 Gambar!', '🪙 Angka!']);
}

// Contoh: fun.dadu('20') atau fun.dadu() → '🎲 Dadu (d6): 4'
function dadu(n) {
  const raw = String(n == null ? '' : n).trim();
  let sisi = 6;
  if (raw) {
    const v = parseInt(raw, 10);
    if (isNaN(v) || v < 2 || v > 100) return 'Contoh: .dadu 6 (isi 2-100)';
    sisi = v;
  }
  const hasil = 1 + Math.floor(Math.random() * sisi);
  return '🎲 Dadu (d' + sisi + '): ' + hasil;
}

const EIGHTBALL_JAWABAN = [
  'Ya, jelas banget!',
  'Sudah pasti iya.',
  'Tanpa ragu, iya!',
  'Kayaknya iya, gas aja.',
  'Kemungkinan besar iya.',
  'Tanda-tandanya bagus.',
  'Coba lagi nanti, belum jelas.',
  'Fokus dan tanya lagi nanti.',
  'Mending jangan sekarang.',
  'Nggak bisa diprediksi sekarang.',
  'Konsentrasi... coba tanya lagi.',
  'Jawabannya masih kabur.',
  'Jangan terlalu berharap soal itu.',
  'Menurutku sih enggak.',
  'Kemungkinan kecil.',
  'Sangat meragukan.',
  'Tidak.',
  'Jangan harap.',
  'Iya, tapi jangan buru-buru.',
  'Percaya diri aja, iya!',
];

// Contoh: fun.eightball('aku lulus?') → jawaban Magic 8-Ball
function eightball(q) {
  const s = String(q || '').trim();
  if (!s) return 'Contoh: .8ball aku bakal lulus?';
  return '🎱 *' + s + '*\n' + pick(EIGHTBALL_JAWABAN);
}

// Kecocokan ship 0-100 + label, stabil untuk pasangan sama. Contoh: fun.ship('Andi', 'Sinta')
function ship(n1, n2) {
  const a = String(n1 || '').trim();
  const b = String(n2 || '').trim();
  if (!a || !b) return 'Contoh: .ship Andi | Sinta';
  const key = [a.toLowerCase(), b.toLowerCase()].sort().join('&');
  const v = hashStr('ship' + key) % 101;
  const label = v >= 85 ? '💖 SANGAT COCOK! Kapal berlayar sampai pelaminan!' : v >= 65 ? '💕 Cocok! Lanjut, jangan ragu!' : v >= 40 ? '🙂 Lumayan, masih bisa diperjuangkan.' : '😅 Kurang cocok, mending jadi temen baik aja.';
  return '💘 *Ship ' + a + ' & ' + b + ': ' + v + '%*\n' + label;
}

const PUJI_LIST = [
  'kamu keren banget hari ini, vibes-nya positif terus!',
  'senyum kamu bisa bikin hari orang lain jadi cerah, serius!',
  'kamu itu definisi paket lengkap: baik, pinter, asik!',
  'semangatmu nular, pertahankan ya!',
  'kamu pekerja keras, hasilnya pasti nggak bakal khianat!',
  'gayamu simpel tapi memikat, suka deh!',
  'kamu pendengar yang baik, langka banget zaman sekarang!',
  'otak kamu encer, ide-idenya selalu fresh!',
  'kamu tulus, makanya banyak yang sayang sama kamu!',
  'tetap jadi kamu yang apa adanya, itu yang bikin spesial!',
];

// Contoh: fun.puji('Sinta') → pujian random (boleh tanpa nama)
function puji(nama) {
  const n = String(nama || '').trim() || 'kamu';
  return '🥰 *Pujian buat ' + n + ':*\n' + n + ' ' + pick(PUJI_LIST);
}

const QUOTES_LIST = [
  'Jangan tunggu sempurna buat mulai, mulai aja dulu biar sempurna belakangan.',
  'Gagal itu biasa, yang luar biasa itu yang tetap bangkit.',
  'Pelan-pelan nggak apa, yang penting tetap jalan.',
  'Mimpi besar butuh langkah kecil yang konsisten.',
  'Capek boleh, nyerah jangan.',
  'Fokus ke progres, bukan ke omongan orang.',
  'Hari ini mungkin berat, tapi kamu lebih kuat.',
  'Sukses itu sabar + konsisten + doa.',
  'Jangan bandingkan prosesmu dengan hasil orang lain.',
  'Sedikit demi sedikit, lama-lama jadi bukit.',
];

// Contoh: fun.quotes() → quote motivasi random
function quotes() {
  return '💡 *Quotes:*\n"' + pick(QUOTES_LIST) + '"';
}

module.exports = {
  truth,
  dare,
  pantun,
  weton,
  tarot,
  zodiak,
  ramal,
  keberuntungan,
  mimpi,
  karakter,
  pilih,
  coinflip,
  dadu,
  eightball,
  ship,
  puji,
  quotes,
  pick,
  hashStr,
  loadAkiraJson,
};
