// plugins/info/06-islami.js — konten Islami statis (tanpa fetch) ala Furina.
// Data di-embed di file: akurat, offline, tanpa API key.
// Kontrak: async (ctx) => boolean. Teks list memakai simbol ▸.
// Command: asmaulhusna, ayatkursi, niatsholat, bacaansholat, doaharian,
//          doatahlil, kisahnabi, quotesislami
const S = require('../../handlers/state');
const { safeReply, sendLongText } = S;

// ------------------------------------------------------- Asmaul Husna ---
const ASMAUL = [
  ['Ar-Rahman', 'Yang Maha Pengasih'],
  ['Ar-Rahim', 'Yang Maha Penyayang'],
  ['Al-Malik', 'Yang Maha Merajai'],
  ['Al-Quddus', 'Yang Maha Suci'],
  ['As-Salam', 'Yang Maha Memberi Kesejahteraan'],
  ["Al-Mu'min", 'Yang Maha Memberi Keamanan'],
  ['Al-Muhaimin', 'Yang Maha Pemelihara'],
  ["Al-'Aziz", 'Yang Maha Perkasa'],
  ['Al-Jabbar', 'Yang Maha Kuasa atas kehendak-Nya'],
  ['Al-Mutakabbir', 'Yang Maha Megah'],
  ['Al-Khaliq', 'Yang Maha Pencipta'],
  ["Al-Bari'", 'Yang Maha Mengadakan dari tiada'],
  ['Al-Mushawwir', 'Yang Maha Membentuk Rupa'],
  ['Al-Ghaffar', 'Yang Maha Pengampun berulang-ulang'],
  ['Al-Qahhar', 'Yang Maha Menundukkan'],
  ['Al-Wahhab', 'Yang Maha Pemberi Karunia'],
  ['Ar-Razzaq', 'Yang Maha Pemberi Rezeki'],
  ['Al-Fattah', 'Yang Maha Pembuka rahmat'],
  ["Al-'Alim", 'Yang Maha Mengetahui'],
  ['Al-Qabidh', 'Yang Maha Menyempitkan (rezeki)'],
  ['Al-Basith', 'Yang Maha Melapangkan (rezeki)'],
  ['Al-Khafidh', 'Yang Maha Merendahkan'],
  ["Ar-Rafi'", 'Yang Maha Meninggikan'],
  ["Al-Mu'izz", 'Yang Maha Memuliakan'],
  ['Al-Mudzill', 'Yang Maha Menghinakan'],
  ["As-Sami'", 'Yang Maha Mendengar'],
  ['Al-Bashir', 'Yang Maha Melihat'],
  ['Al-Hakam', 'Yang Maha Menetapkan Hukum'],
  ["Al-'Adl", 'Yang Maha Adil'],
  ['Al-Lathif', 'Yang Maha Lembut'],
  ['Al-Khabir', 'Yang Maha Mengetahui yang tersembunyi'],
  ['Al-Halim', 'Yang Maha Penyantun'],
  ["Al-'Azhim", 'Yang Maha Agung'],
  ['Al-Ghafur', 'Yang Maha Pengampun'],
  ['Asy-Syakur', 'Yang Maha Penghargai amal hamba'],
  ["Al-'Aliy", 'Yang Maha Tinggi'],
  ['Al-Kabir', 'Yang Maha Besar'],
  ['Al-Hafizh', 'Yang Maha Memelihara'],
  ['Al-Muqit', 'Yang Maha Pemberi Kecukupan'],
  ['Al-Hasib', 'Yang Maha Membuat Perhitungan'],
  ['Al-Jalil', 'Yang Maha Luhur'],
  ['Al-Karim', 'Yang Maha Pemurah'],
  ['Ar-Raqib', 'Yang Maha Mengawasi'],
  ['Al-Mujib', 'Yang Maha Mengabulkan'],
  ["Al-Wasi'", 'Yang Maha Luas (karunia-Nya)'],
  ['Al-Hakim', 'Yang Maha Bijaksana'],
  ['Al-Wadud', 'Yang Maha Mengasihi'],
  ['Al-Majid', 'Yang Maha Mulia'],
  ["Al-Ba'its", 'Yang Maha Membangkitkan'],
  ['Asy-Syahid', 'Yang Maha Menyaksikan'],
  ['Al-Haqq', 'Yang Maha Benar'],
  ['Al-Wakil', 'Yang Maha Mewakili (tempat bertawakal)'],
  ['Al-Qawiyy', 'Yang Maha Kuat'],
  ['Al-Matin', 'Yang Maha Kokoh'],
  ['Al-Waliyy', 'Yang Maha Melindungi'],
  ['Al-Hamid', 'Yang Maha Terpuji'],
  ['Al-Muhshi', 'Yang Maha Menghitung'],
  ["Al-Mubdi'", 'Yang Maha Memulai penciptaan'],
  ["Al-Mu'id", 'Yang Maha Mengembalikan'],
  ['Al-Muhyi', 'Yang Maha Menghidupkan'],
  ['Al-Mumit', 'Yang Maha Mematikan'],
  ['Al-Hayy', 'Yang Maha Hidup'],
  ['Al-Qayyum', 'Yang Maha Berdiri Sendiri'],
  ['Al-Wajid', 'Yang Maha Kaya (tiada membutuhkan)'],
  ['Al-Majid', 'Yang Maha Agung nan Mulia'],
  ['Al-Wahid', 'Yang Maha Tunggal'],
  ['Al-Ahad', 'Yang Maha Esa'],
  ['Ash-Shamad', 'Yang Maha Dibutuhkan (tempat bergantung)'],
  ['Al-Qadir', 'Yang Maha Kuasa'],
  ['Al-Muqtadir', 'Yang Maha Berkuasa penuh'],
  ['Al-Muqaddim', 'Yang Maha Mendahulukan'],
  ["Al-Mu'akhkhir", 'Yang Maha Mengakhirkan'],
  ['Al-Awwal', 'Yang Maha Awal'],
  ['Al-Akhir', 'Yang Maha Akhir'],
  ['Azh-Zhahir', 'Yang Maha Nyata'],
  ['Al-Bathin', 'Yang Maha Tersembunyi (Ghaib)'],
  ['Al-Wali', 'Yang Maha Memerintah'],
  ["Al-Muta'ali", 'Yang Maha Tinggi melebihi segalanya'],
  ['Al-Barr', 'Yang Maha Penderma kebaikan'],
  ['At-Tawwab', 'Yang Maha Penerima Tobat'],
  ['Al-Muntaqim', 'Yang Maha Pemberi Balasan (bagi pendosa)'],
  ["Al-'Afuww", 'Yang Maha Pemaaf'],
  ["Ar-Ra'uf", 'Yang Maha Belas Kasih'],
  ['Malikul Mulk', 'Yang Maha Penguasa Kerajaan'],
  ['Dzul Jalali wal Ikram', 'Yang Maha Memiliki Kebesaran dan Kemuliaan'],
  ['Al-Muqsith', 'Yang Maha Pemberi Keadilan'],
  ["Al-Jami'", 'Yang Maha Mengumpulkan'],
  ['Al-Ghaniyy', 'Yang Maha Kaya'],
  ['Al-Mughni', 'Yang Maha Pemberi Kekayaan'],
  ["Al-Mani'", 'Yang Maha Mencegah'],
  ['Adh-Dharr', 'Yang Maha Pemberi Kemudaratan (atas hikmah-Nya)'],
  ["An-Nafi'", 'Yang Maha Pemberi Manfaat'],
  ['An-Nur', 'Yang Maha Bercahaya (pemberi cahaya)'],
  ['Al-Hadi', 'Yang Maha Pemberi Petunjuk'],
  ["Al-Badi'", 'Yang Maha Pencipta tiada bandingan'],
  ['Al-Baqi', 'Yang Maha Kekal'],
  ['Al-Warits', 'Yang Maha Pewaris'],
  ['Ar-Rasyid', 'Yang Maha Pemberi Petunjuk yang benar'],
  ['Ash-Shabur', 'Yang Maha Sabar'],
];

// -------------------------------------------------------- Ayat Kursi ---
const AYAT_KURSI =
  '🕌 *Ayat Kursi (QS. Al-Baqarah: 255)*\n\n' +
  'اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ، مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ، وَلَا يَئُودُهُ حِفْظُهُمَا، وَهُوَ الْعَلِيُّ الْعَظِيمُ\n\n' +
  '*Latin:*\nAllaahu laa ilaaha illaa huwal hayyul qayyuum, laa ta’khudzuhuu sinatuw wa laa naum, lahuu maa fis-samaawaati wa maa fil-ardh, man dzal-ladzii yasyfa’u ’indahuu illaa bi-idznih, ya’lamu maa baina aidiihim wa maa khalfahum, wa laa yuhiithuuna bisyai-im min ’ilmihii illaa bimaa syaa’, wasi’a kursiyyuhus-samaawaati wal-ardh, wa laa ya-uuduhuu hifzhuhumaa, wa huwal ’aliyyul ’azhiim.\n\n' +
  '*Artinya:*\n_“Allah, tidak ada tuhan selain Dia, Yang Mahahidup, Yang terus-menerus mengurus (makhluk-Nya). Dia tidak mengantuk dan tidak tidur. Milik-Nya apa yang ada di langit dan di bumi. Tidak ada yang dapat memberi syafaat di sisi-Nya tanpa izin-Nya. Dia mengetahui apa yang di hadapan mereka dan apa yang di belakang mereka, dan mereka tidak mengetahui sesuatu pun dari ilmu-Nya melainkan apa yang Dia kehendaki. Kursi-Nya meliputi langit dan bumi, dan Dia tidak merasa berat memelihara keduanya. Dan Dia Mahatinggi, Mahaagung.”_';

// ------------------------------------------------------- Niat Sholat ---
const NIAT = [
  { key: ['subuh'], judul: 'Niat Sholat Subuh (2 rakaat)',
    arab: 'أُصَلِّي فَرْضَ الصُّبْحِ رَكْعَتَيْنِ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلَّهِ تَعَالَى',
    latin: 'Ushallii fardhash-shubhi rak’ataini mustaqbilal-qiblati adaa-an lillaahi ta’aalaa.',
    arti: 'Aku berniat sholat fardu Subuh dua rakaat menghadap kiblat karena Allah Ta’ala.' },
  { key: ['dzuhur', 'zhuhur', 'duhur', 'lohor'], judul: 'Niat Sholat Dzuhur (4 rakaat)',
    arab: 'أُصَلِّي فَرْضَ الظُّهْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلَّهِ تَعَالَى',
    latin: 'Ushallii fardhazh-zhuhri arba’a raka’aatim mustaqbilal-qiblati adaa-an lillaahi ta’aalaa.',
    arti: 'Aku berniat sholat fardu Dzuhur empat rakaat menghadap kiblat karena Allah Ta’ala.' },
  { key: ['ashar', 'asar', 'asr'], judul: 'Niat Sholat Ashar (4 rakaat)',
    arab: 'أُصَلِّي فَرْضَ الْعَصْرِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلَّهِ تَعَالَى',
    latin: 'Ushallii fardhal-’ashri arba’a raka’aatim mustaqbilal-qiblati adaa-an lillaahi ta’aalaa.',
    arti: 'Aku berniat sholat fardu Ashar empat rakaat menghadap kiblat karena Allah Ta’ala.' },
  { key: ['maghrib', 'magrib'], judul: 'Niat Sholat Maghrib (3 rakaat)',
    arab: 'أُصَلِّي فَرْضَ الْمَغْرِبِ ثَلَاثَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلَّهِ تَعَالَى',
    latin: 'Ushallii fardhal-maghribi tsalaatsa raka’aatim mustaqbilal-qiblati adaa-an lillaahi ta’aalaa.',
    arti: 'Aku berniat sholat fardu Maghrib tiga rakaat menghadap kiblat karena Allah Ta’ala.' },
  { key: ['isya', 'isya’', 'isa'], judul: 'Niat Sholat Isya (4 rakaat)',
    arab: 'أُصَلِّي فَرْضَ الْعِشَاءِ أَرْبَعَ رَكَعَاتٍ مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً لِلَّهِ تَعَالَى',
    latin: 'Ushallii fardhal-’isyaa-i arba’a raka’aatim mustaqbilal-qiblati adaa-an lillaahi ta’aalaa.',
    arti: 'Aku berniat sholat fardu Isya empat rakaat menghadap kiblat karena Allah Ta’ala.' },
];

function formatNiat(n) {
  return '🕌 *' + n.judul + '*\n\n' + n.arab + '\n\n*Latin:*\n' + n.latin + '\n\n*Artinya:*\n_' + n.arti + '_';
}

// ---------------------------------------------------- Bacaan Sholat ---
const BACAAN = [
  { key: ['iftitah', 'doa iftitah'], judul: 'Doa Iftitah',
    arab: 'اَللهُ أَكْبَرُ كَبِيْرًا وَالْحَمْدُ لِلَّهِ كَثِيْرًا وَسُبْحَانَ اللهِ بُكْرَةً وَأَصِيْلًا، إِنِّي وَجَّهْتُ وَجْهِيَ لِلَّذِي فَطَرَ السَّمَاوَاتِ وَالْأَرْضَ حَنِيْفًا مُسْلِمًا وَمَا أَنَا مِنَ الْمُشْرِكِيْنَ، إِنَّ صَلَاتِي وَنُسُكِي وَمَحْيَايَ وَمَمَاتِي لِلَّهِ رَبِّ الْعَالَمِيْنَ، لَا شَرِيْكَ لَهُ وَبِذَلِكَ أُمِرْتُ وَأَنَا مِنَ الْمُسْلِمِيْنَ',
    latin: 'Allaahu akbar kabiiraw walhamdu lillaahi katsiiraw wa subhaanallaahi bukrataw wa ashiilaa. Innii wajjahtu wajhiya lilladzii fatharas-samaawaati wal-ardha haniifam muslimaa, wa maa ana minal-musyrikiin. Inna shalaatii wa nusukii wa mahyaaya wa mamaatii lillaahi rabbil-’aalamiin. Laa syariika lahuu wa bidzaalika umirtu wa ana minal-muslimiin.',
    arti: 'Allah Mahabesar dengan sebesar-besarnya, segala puji bagi Allah dengan pujian yang banyak, Mahasuci Allah pagi dan petang. Sungguh kuhadapkan wajahku kepada (Allah) yang menciptakan langit dan bumi dengan lurus dan berserah diri, dan aku bukan termasuk orang-orang musyrik. Sesungguhnya sholatku, ibadahku, hidupku, dan matiku hanyalah untuk Allah Tuhan semesta alam. Tiada sekutu bagi-Nya, demikian aku diperintah, dan aku termasuk orang-orang muslim.' },
  { key: ['ruku', 'ruku’', 'rukuk'], judul: "Bacaan Ruku' (dibaca 3x)",
    arab: 'سُبْحَانَ رَبِّيَ الْعَظِيْمِ وَبِحَمْدِهِ',
    latin: 'Subhaana rabbiyal-’azhiimi wa bihamdih (3x).',
    arti: 'Mahasuci Tuhanku Yang Mahaagung dan aku memuji-Nya.' },
  { key: ['sujud'], judul: 'Bacaan Sujud (dibaca 3x)',
    arab: 'سُبْحَانَ رَبِّيَ الْأَعْلَى وَبِحَمْدِهِ',
    latin: 'Subhaana rabbiyal-a’laa wa bihamdih (3x).',
    arti: 'Mahasuci Tuhanku Yang Mahatinggi dan aku memuji-Nya.' },
  { key: ['tahiyat', 'tasyahud', 'tahyat'], judul: 'Tahiyat Akhir',
    arab: 'اَلتَّحِيَّاتُ الْمُبَارَكَاتُ الصَّلَوَاتُ الطَّيِّبَاتُ لِلَّهِ، اَلسَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللهِ وَبَرَكَاتُهُ، اَلسَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللهِ الصَّالِحِيْنَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا رَسُوْلُ اللهِ، اَللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيْمَ وَعَلَى آلِ إِبْرَاهِيْمَ، وَبَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَى إِبْرَاهِيْمَ وَعَلَى آلِ إِبْرَاهِيْمَ فِي الْعَالَمِيْنَ إِنَّكَ حَمِيْدٌ مَجِيْدٌ',
    latin: 'At-tahiyyaatul-mubaarakaatush-shalawaatuth-thayyibaatu lillaah. As-salaamu ’alaika ayyuhan-nabiyyu wa rahmatullaahi wa barakaatuh. As-salaamu ’alainaa wa ’alaa ’ibaadillaahish-shaalihiin. Asyhadu al-laa ilaaha illallaah, wa asyhadu anna muhammadar-rasuulullaah. Allaahumma shalli ’alaa muhammad wa ’alaa aali muhammad, kamaa shallaita ’alaa ibraahiim wa ’alaa aali ibraahiim, wa baarik ’alaa muhammad wa ’alaa aali muhammad, kamaa baarakta ’alaa ibraahiim wa ’alaa aali ibraahiim, fil-’aalamiina innaka hamiidum-majiid.',
    arti: 'Segala kehormatan, keberkahan, sholawat, dan kebaikan hanya milik Allah. Keselamatan atasmu wahai Nabi beserta rahmat Allah dan berkah-Nya. Keselamatan atas kami dan atas hamba-hamba Allah yang saleh. Aku bersaksi tiada tuhan selain Allah dan aku bersaksi bahwa Muhammad adalah utusan Allah. Ya Allah, limpahkan sholawat atas Muhammad dan keluarga Muhammad sebagaimana Engkau limpahkan atas Ibrahim dan keluarga Ibrahim, dan berkahilah Muhammad dan keluarga Muhammad sebagaimana Engkau berkahi Ibrahim dan keluarga Ibrahim di seluruh alam. Sungguh Engkau Maha Terpuji lagi Maha Mulia.' },
];

function formatBacaan(b) {
  return '🕌 *' + b.judul + '*\n\n' + b.arab + '\n\n*Latin:*\n' + b.latin + '\n\n*Artinya:*\n_' + b.arti + '_';
}

// ------------------------------------------------------- Doa Harian ---
const DOA = [
  { judul: 'Doa Bangun Tidur',
    arab: 'اَلْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُوْرُ',
    latin: 'Alhamdu lillaahil-ladzii ahyaanaa ba’da maa amaatanaa wa ilaihin-nusyuur.',
    arti: 'Segala puji bagi Allah yang telah menghidupkan kami setelah mematikan kami, dan kepada-Nya kami kembali.' },
  { judul: 'Doa Sebelum Makan',
    arab: 'اَللَّهُمَّ بَارِكْ لَنَا فِيْمَا رَزَقْتَنَا وَقِنَا عَذَابَ النَّارِ',
    latin: 'Allaahumma baarik lanaa fiimaa razaqtanaa wa qinaa ’adzaaban-naar.',
    arti: 'Ya Allah, berkahilah rezeki yang Engkau berikan kepada kami dan jagalah kami dari siksa api neraka.' },
  { judul: 'Doa Sesudah Makan',
    arab: 'اَلْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مِنَ الْمُسْلِمِيْنَ',
    latin: 'Alhamdu lillaahil-ladzii ath’amanaa wa saqaanaa wa ja’alanaa minal-muslimiin.',
    arti: 'Segala puji bagi Allah yang telah memberi kami makan dan minum serta menjadikan kami termasuk orang-orang muslim.' },
  { judul: 'Doa Sebelum Tidur',
    arab: 'بِاسْمِكَ اللَّهُمَّ أَحْيَا وَبِاسْمِكَ أَمُوْتُ',
    latin: 'Bismika-llaahumma ahyaa wa bismika amuut.',
    arti: 'Dengan nama-Mu ya Allah aku hidup dan dengan nama-Mu aku mati.' },
  { judul: 'Doa Masuk Kamar Mandi',
    arab: 'اَللَّهُمَّ إِنِّي أَعُوْذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ',
    latin: 'Allaahumma innii a’uudzu bika minal-khubutsi wal-khabaa-its.',
    arti: 'Ya Allah, aku berlindung kepada-Mu dari setan laki-laki dan setan perempuan.' },
  { judul: 'Doa Keluar Kamar Mandi',
    arab: 'غُفْرَانَكَ، اَلْحَمْدُ لِلَّهِ الَّذِي أَذْهَبَ عَنِّي الْأَذَى وَعَافَانِي',
    latin: 'Ghufraanaka. Alhamdu lillaahil-ladzii adzhaba ’annil-adzaa wa ’aafaanii.',
    arti: 'Ampunan-Mu (kupan­jatkan). Segala puji bagi Allah yang telah menghilangkan kotoran dariku dan menyehatkanku.' },
  { judul: 'Doa Keluar Rumah',
    arab: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
    latin: 'Bismillaahi tawakkaltu ’alallaah, wa laa haula wa laa quwwata illaa billaah.',
    arti: 'Dengan nama Allah, aku bertawakal kepada Allah, tiada daya dan kekuatan kecuali dengan (pertolongan) Allah.' },
  { judul: 'Doa Naik Kendaraan',
    arab: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِيْنَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُوْنَ',
    latin: 'Subhaanal-ladzii sakhkhara lanaa haadzaa wa maa kunnaa lahuu muqriniin, wa innaa ilaa rabbinaa lamunqalibuun.',
    arti: 'Mahasuci (Allah) yang telah menundukkan kendaraan ini untuk kami, padahal kami tidak mampu menguasainya, dan sesungguhnya kami akan kembali kepada Tuhan kami.' },
  { judul: 'Doa Masuk Masjid',
    arab: 'اَللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ',
    latin: 'Allaahummaftah lii abwaaba rahmatik.',
    arti: 'Ya Allah, bukakanlah untukku pintu-pintu rahmat-Mu.' },
  { judul: 'Doa untuk Kedua Orang Tua',
    arab: 'اَللَّهُمَّ اغْفِرْ لِي وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيْرًا',
    latin: 'Allaahummaghfir lii wa liwaalidayya warhamhumaa kamaa rabbayaanii shaghiiraa.',
    arti: 'Ya Allah, ampunilah aku dan kedua orang tuaku, dan sayangilah mereka sebagaimana mereka menyayangiku di waktu kecil.' },
];

function formatDoa(i, d) {
  return '🤲 *' + (i + 1) + '. ' + d.judul + '*\n\n' + d.arab + '\n\n*Latin:*\n' + d.latin + '\n\n*Artinya:*\n_' + d.arti + '_';
}

// --------------------------------------------------------- Doa Tahlil ---
const TAHLIL =
  '🕌 *Susunan Tahlil Ringkas*\n\n' +
  '▸ Membaca ta’awudz & basmalah\n' +
  '▸ Istighfar 3x: _Astaghfirullaahal-’azhiim_\n' +
  '▸ Syahadat: _Asyhadu al-laa ilaaha illallaah, wa asyhadu anna muhammadar-rasuulullaah_\n' +
  '▸ Sholawat Nabi 3x: _Allaahumma shalli ’alaa muhammad_\n' +
  '▸ Al-Fatihah 1x\n' +
  '▸ Al-Ikhlas 3x, Al-Falaq 1x, An-Nas 1x\n' +
  '▸ Al-Fatihah 1x, lalu Ayat Kursi 1x\n' +
  '▸ Tasbih 33x: _Subhaanallaah_ — Tahmid 33x: _Alhamdulillaah_ — Takbir 33x: _Allaahu akbar_\n' +
  '▸ Tahlil 100x/33x: _Laa ilaaha illallaah_\n\n' +
  '🤲 *Doa penutup:*\n' +
  'اَللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ وَعَافِهِ وَاعْفُ عَنْهُ\n' +
  '*Latin:*\nAllaahummaghfir lahu warhamhu wa ’aafihi wa’fu ’anhu.\n\n' +
  '*Artinya:*\n_“Ya Allah, ampunilah dia, rahmatilah dia, sehatkanlah dia, dan maafkanlah dia.”_\n' +
  '_(Untuk jenazah perempuan: “lahaa … warhamhaa wa ’aafihaa wa’fu ’anhaa”)_';

// -------------------------------------------------------- Kisah Nabi ---
const KISAH = [
  ['Adam', 'Manusia dan nabi pertama; diciptakan dari tanah lalu diajari nama-nama oleh Allah, kemudian diturunkan ke bumi, bertobat, dan diampuni.'],
  ['Idris', 'Dikenal cerdas dan rajin; pandai membaca-menulis dan berhitung, tekun beribadah, hingga Allah mengangkatnya ke kedudukan yang tinggi.'],
  ['Nuh', 'Berdakwah 950 tahun namun hanya sedikit yang beriman; atas perintah Allah ia membuat bahtera dan orang beriman selamat dari banjir besar.'],
  ['Hud', "Diutus kepada kaum ’Ad yang kuat namun sombong; karena mendustakan, mereka dibinasakan oleh angin topan yang dahsyat."],
  ['Shalih', 'Diutus kepada kaum Tsamud dengan mukjizat unta betina; setelah kaumnya membunuh unta itu, mereka diazab gempa yang dahsyat.'],
  ['Ibrahim', 'Bapak para nabi; menghancurkan berhala, selamat dari kobaran api Namrudz, dan membangun Ka’bah bersama putranya Ismail.'],
  ['Luth', 'Diutus kepada kaum yang berbuat keji; karena menolak bertobat, negeri mereka dibalikkan dan dihujani batu.'],
  ['Ismail', 'Putra Ibrahim yang sabar saat akan dikurbankan hingga Allah menggantinya dengan sembelihan besar; ia ikut meninggikan Ka’bah.'],
  ['Ishaq', 'Putra Ibrahim dari Sarah; menjadi nabi dan ayah Ya’qub, nenek moyang Bani Israil.'],
  ['Ya’qub', 'Dikenal juga sebagai Israil; ayah Nabi Yusuf dan saudara-saudaranya, teladan kesabaran saat kehilangan Yusuf.'],
  ['Yusuf', 'Diberi rupa yang indah dan ilmu takwil mimpi; dibuang ke sumur, dijual, dan dipenjara, lalu menjadi bendahara Mesir dan memaafkan saudaranya.'],
  ['Syu’aib', 'Diutus kepada penduduk Madyan yang curang dalam takaran dan timbangan; karena mendustakan, mereka diazab gempa.'],
  ['Ayyub', 'Teladan kesabaran; bertahun-tahun sakit dan kehilangan harta namun tetap bersyukur hingga Allah memulihkan keadaannya.'],
  ['Dzulkifli', 'Dikenal sangat sabar, tekun beribadah, dan menepati janji serta amanahnya hingga dipuji oleh Allah.'],
  ['Musa', 'Menerima kitab Taurat; dengan tongkatnya ia membelah Laut Merah dan dengan sabar menghadapi Fir’aun yang zalim hingga Fir’aun tenggelam.'],
  ['Harun', 'Saudara Musa yang fasih berbicara; mendampingi Musa berdakwah kepada Fir’aun dan membimbing Bani Israil.'],
  ['Dawud', 'Diberi kitab Zabur dan suara yang merdu; mengalahkan Jalut, dan besi menjadi lunak di tangannya untuk membuat baju besi.'],
  ['Sulaiman', 'Putra Dawud yang diberi kerajaan agung; memahami bahasa binatang, menundukkan jin dan angin, hingga Ratu Balqis beriman.'],
  ['Ilyas', 'Berdakwah kepada kaumnya yang menyembah berhala Ba’al; hanya sedikit yang beriman namun ia tetap teguh.'],
  ['Ilyasa', 'Penerus dakwah Ilyas kepada Bani Israil; dengan sabar membimbing kaumnya kembali menyembah Allah.'],
  ['Yunus', 'Pergi sebelum diizinkan lalu ditelan ikan besar; ia bertasbih dalam kegelapan hingga dikeluarkan, dan kaumnya akhirnya beriman.'],
  ['Zakaria', 'Berdoa di usia tua agar diberi keturunan hingga dikaruniai Yahya; ia tekun beribadah dan merawat Maryam di mihrab.'],
  ['Yahya', 'Putra Zakaria yang saleh sejak kecil; jujur, zuhud, dan gugur syahid karena mempertahankan kebenaran.'],
  ['Isa', 'Lahir tanpa ayah atas kuasa Allah; diberi kitab Injil dan mukjizat menyembuhkan orang sakit atas izin Allah.'],
  ['Muhammad', 'Nabi terakhir dan rahmat bagi semesta alam; menerima Al-Qur’an, berakhlak paling mulia, dan menyempurnakan risalah para nabi.'],
];

// ------------------------------------------------------ Quotes Islami ---
const QUOTES = [
  'Sesungguhnya sesudah kesulitan itu ada kemudahan. — QS. Al-Insyirah: 6',
  'Allah tidak membebani seseorang melainkan sesuai dengan kesanggupannya. — QS. Al-Baqarah: 286',
  'Sabar itu separuh iman, dan syukur adalah separuhnya lagi.',
  'Barang siapa bertakwa kepada Allah, niscaya Dia memberi jalan keluar dan rezeki dari arah yang tak disangka.',
  'Jangan bersedih, sesungguhnya Allah bersama kita.',
  'Doa adalah senjata orang beriman dan cahaya langit serta bumi.',
  'Sebaik-baik manusia adalah yang paling bermanfaat bagi sesama.',
  'Ikhlas itu ketika amalmu tetap sama, dilihat ataupun tidak dilihat manusia.',
  'Hati yang bersih akan menenangkan jiwa yang gelisah.',
  'Syukuri yang sedikit, niscaya Allah tambah dengan yang banyak.',
  'Kesabaran adalah kunci dari segala kebaikan.',
  'Jangan menunda tobat, karena ajal tidak pernah menunggu.',
  'Ilmu tanpa amal bagaikan pohon tanpa buah.',
  'Orang kuat bukanlah yang menang bergulat, melainkan yang mampu menahan amarah.',
  'Setiap anak Adam pernah bersalah, dan sebaik-baik yang bersalah adalah yang bertobat.',
  'Dunia ini hanya persinggahan, akhirat adalah tujuan.',
  'Tersenyum kepada saudaramu adalah sedekah.',
  'Jaga lisanmu, karena luka karena lisan lebih lama sembuhnya.',
  'Sholat adalah tiang agama; siapa menegakkannya, ia menegakkan agama.',
  'Rezeki sudah dijamin, yang belum dijamin adalah surga — maka kejarlah ia.',
  'Jangan iri pada rezeki orang lain, karena setiap orang punya ujiannya sendiri.',
  'Maafkanlah, karena Allah mencintai orang-orang yang memaafkan.',
  'Ketenangan datang dari zikir, bukan dari harta.',
  'Berbuat baiklah meski kebaikanmu tak dibalas manusia, karena Allah tak pernah lupa.',
  'Awalilah harimu dengan basmalah dan akhirilah dengan hamdalah.',
  'Keberkahan waktu ada pada mereka yang menjaga sholat lima waktu.',
  'Jangan takut gagal selama engkau jujur dan bertawakal.',
  'Sahabat sejati adalah yang mengingatkanmu kepada Allah.',
  'Sedekah tidak mengurangi harta, justru menyuburkannya.',
  'Cukuplah Allah sebagai penolong, dan Dia sebaik-baik pelindung.',
  'Hidup sederhana dan hati yang qanaah adalah kekayaan yang hakiki.',
];

// -------------------------------------------------------------- Router ---
async function handleIslami(ctx) {
  const { sock, m, jid, cmd, args, prefix } = ctx;
  const a = String(args || '').trim();

  if (cmd === 'asmaulhusna' || cmd === 'asmaulhusna99') {
    const n = Number(a);
    if (a && Number.isInteger(n) && n >= 1 && n <= 99) {
      const e = ASMAUL[n - 1];
      await safeReply(sock, jid, '📿 *Asmaul Husna ' + n + '/99*\n\n▸ ' + e[0] + ' — ' + e[1], m);
      return true;
    }
    if (a && !/^\d+$/.test(a)) {
      const q = a.toLowerCase();
      const hit = ASMAUL.map((e, i) => ({ e, i })).filter((x) => x.e[0].toLowerCase().includes(q));
      if (!hit.length) {
        await safeReply(sock, jid, '❌ Tidak ketemu. Contoh: ' + prefix + 'asmaulhusna 1', m);
        return true;
      }
      const out = hit.map((x) => '▸ ' + (x.i + 1) + '. ' + x.e[0] + ' — ' + x.e[1]).join('\n');
      await safeReply(sock, jid, '📿 *Asmaul Husna — hasil "' + a + '":*\n\n' + out, m);
      return true;
    }
    const out = '📿 *Asmaul Husna (99)*\n\n' +
      ASMAUL.map((e, i) => '▸ ' + (i + 1) + '. ' + e[0] + ' — ' + e[1]).join('\n');
    await sendLongText(sock, jid, out, m);
    return true;
  }

  if (cmd === 'ayatkursi' || cmd === 'ayat') {
    await safeReply(sock, jid, AYAT_KURSI, m);
    return true;
  }

  if (cmd === 'niatsholat' || cmd === 'niatshalat' || cmd === 'niat') {
    if (a) {
      const q = a.toLowerCase();
      const hit = NIAT.find((n) => n.key.some((k) => q.includes(k)));
      if (hit) {
        await safeReply(sock, jid, formatNiat(hit), m);
        return true;
      }
    }
    const out = '🕌 *Niat Sholat 5 Waktu*\n_(Contoh: ' + prefix + 'niatsholat subuh)_\n\n' +
      NIAT.map((n) => '▸ *' + n.judul + '*\n' + n.arab + '\n_' + n.latin + '_').join('\n\n');
    await safeReply(sock, jid, out, m);
    return true;
  }

  if (cmd === 'bacaansholat' || cmd === 'bacaanshalat' || cmd === 'bacaan') {
    if (a) {
      const q = a.toLowerCase();
      const hit = BACAAN.find((b) => b.key.some((k) => q.includes(k)));
      if (hit) {
        await safeReply(sock, jid, formatBacaan(hit), m);
        return true;
      }
    }
    const out = '🕌 *Bacaan Sholat (ringkas)*\n_(Contoh: ' + prefix + 'bacaansholat ruku)_\n\n' +
      BACAAN.map((b) => '▸ *' + b.judul + '*\n' + b.arab + '\n_' + b.latin + '_\n_' + b.arti + '_').join('\n\n');
    await safeReply(sock, jid, out, m);
    return true;
  }

  if (cmd === 'doaharian' || cmd === 'doa') {
    const n = Number(a);
    if (a && Number.isInteger(n) && n >= 1 && n <= DOA.length) {
      await safeReply(sock, jid, '🤲 *Doa Harian ' + n + '/' + DOA.length + '*\n\n' + formatDoa(n - 1, DOA[n - 1]).split('\n').slice(1).join('\n'), m);
      return true;
    }
    const out = '🤲 *Doa Harian (' + DOA.length + ' doa)*\n_(Contoh: ' + prefix + 'doaharian 1)_\n\n' +
      DOA.map((d, i) => '▸ *' + (i + 1) + '. ' + d.judul + '*\n' + d.arab + '\n_' + d.arti + '_').join('\n\n');
    await safeReply(sock, jid, out, m);
    return true;
  }

  if (cmd === 'doatahlil' || cmd === 'tahlil') {
    await safeReply(sock, jid, TAHLIL, m);
    return true;
  }

  if (cmd === 'kisahnabi' || cmd === 'kisah' || cmd === 'nabi') {
    if (a) {
      const q = a.toLowerCase();
      const idx = Number(a);
      let hit = -1;
      if (Number.isInteger(idx) && idx >= 1 && idx <= KISAH.length) hit = idx - 1;
      else hit = KISAH.findIndex((k) => k[0].toLowerCase().includes(q));
      if (hit >= 0) {
        await safeReply(sock, jid, '📖 *Kisah Nabi ' + KISAH[hit][0] + ' (' + (hit + 1) + '/25)*\n\n▸ ' + KISAH[hit][1], m);
        return true;
      }
      await safeReply(sock, jid, '❌ Nabi tidak ketemu. Contoh: ' + prefix + 'kisahnabi musa', m);
      return true;
    }
    const out = '📖 *Kisah 25 Nabi (ringkas)*\n_(Contoh: ' + prefix + 'kisahnabi 15)_\n\n' +
      KISAH.map((k, i) => '▸ *' + (i + 1) + '. Nabi ' + k[0] + '* — ' + k[1]).join('\n');
    await sendLongText(sock, jid, out, m);
    return true;
  }

  if (cmd === 'quotesislami' || cmd === 'quoteislami') {
    const n = Number(a);
    if (a && Number.isInteger(n) && n >= 1 && n <= QUOTES.length) {
      await safeReply(sock, jid, '💬 *Quotes Islami ' + n + '/' + QUOTES.length + '*\n\n▸ _“' + QUOTES[n - 1] + '”_', m);
      return true;
    }
    const i = Math.floor(Math.random() * QUOTES.length);
    await safeReply(sock, jid, '💬 *Quotes Islami ' + (i + 1) + '/' + QUOTES.length + '*\n\n▸ _“' + QUOTES[i] + '”_', m);
    return true;
  }

  return false;
}

module.exports = { handleIslami };
