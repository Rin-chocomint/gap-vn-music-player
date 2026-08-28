// =============================================
// Target Viewport — kanvas acuan sebuah novel
// =============================================
//
// APA INI, DAN APA YANG BUKAN
// ---------------------------
// Ini metadata KREATOR: "novelku dirancang untuk panggung sebesar ini".
// Ia BUKAN preferensi pengguna. Aplikasi sudah punya satu setting bernama
// "Resolution" di Options — itu milik PEMAIN, disimpan di `userSettings`, dan
// tidak boleh ditimpa oleh metadata novel mana pun. Keduanya wajib tetap
// terpisah namanya di UI; menyebut keduanya "Resolusi" adalah cara tercepat
// membuat pemain mengira setting-nya rusak.
//
// KENAPA TIDAK DISEMAI KE novel-meta.json
// ---------------------------------------
// Novel yang tidak menyebut `display.targetViewport` memakai 1920×1080. Nilai
// itu TIDAK ditulis ke berkas novel lama (nol eager rewrite) dan tidak disemai
// ke novel baru — persis alasan `version` sengaja lahir kosong: menyemai nilai
// bawaan membuat tiap novel memamerkan angka yang tak pernah dipilih siapa pun,
// dan membuat "belum diatur" tak bisa dibedakan dari "kebetulan sama".
//
// RASIO DIHITUNG, TIDAK DISIMPAN
// ------------------------------
// Menyimpan rasio di samping width/height melahirkan dua sumber kebenaran yang
// pasti berselisih. Rasio selalu diturunkan dari kedua angka itu.

const fs = require('fs');
const path = require('path');

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

// Batas kewarasan. Bukan batas layar — layar pemain bisa lebih kecil, dan itu
// ditangani saat penerapan (host-viewport), bukan di sini. Ini semata menolak
// angka yang tak mungkin dimaksudkan: 0, negatif, atau puluhan ribu piksel.
const MIN_SISI = 320;
const MAX_SISI = 7680;

function _angka(nilai) {
    const n = Math.round(Number(nilai));
    return Number.isFinite(n) ? n : null;
}

/**
 * Bersihkan sepasang angka jadi ukuran yang sah, atau null bila tak masuk akal.
 * @returns {null|{width:number, height:number}}
 */
function normalisasi(width, height) {
    const w = _angka(width);
    const h = _angka(height);
    if (w === null || h === null) return null;
    if (w < MIN_SISI || h < MIN_SISI || w > MAX_SISI || h > MAX_SISI) return null;
    return { width: w, height: h };
}

/**
 * Ukuran efektif dari objek metadata novel.
 * @param {Object} metaData isi novel-meta.json
 * @returns {{width:number, height:number, bawaan:boolean}}
 */
function dariMeta(metaData) {
    const tv = metaData && metaData.display && metaData.display.targetViewport;
    const bersih = tv ? normalisasi(tv.width, tv.height) : null;
    if (!bersih) return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, bawaan: true };
    return { width: bersih.width, height: bersih.height, bawaan: false };
}

/**
 * Ukuran efektif sebuah novel di disk. Novel tanpa metadata (atau dengan
 * metadata rusak) memakai bawaan — membaca viewport tak boleh jadi alasan
 * sebuah novel gagal dibuka.
 */
function dariNovel(novelPath) {
    try {
        const p = path.join(novelPath, 'novel-meta.json');
        if (!fs.existsSync(p)) return dariMeta(null);
        return dariMeta(JSON.parse(fs.readFileSync(p, 'utf-8')));
    } catch (e) {
        return dariMeta(null);
    }
}

/** Rasio sebagai pecahan terkecil, mis. {w:16,h:9}. DITURUNKAN, tidak disimpan. */
function rasio(width, height) {
    const bersih = normalisasi(width, height);
    if (!bersih) return null;
    const fpb = (a, b) => (b === 0 ? a : fpb(b, a % b));
    const d = fpb(bersih.width, bersih.height) || 1;
    return { w: bersih.width / d, h: bersih.height / d };
}

/** Label rasio untuk UI, mis. "16:9". */
function labelRasio(width, height) {
    const r = rasio(width, height);
    if (!r) return '';
    // Rasio yang penyebutnya besar (mis. 1366×768 → 683:384) tak terbaca sebagai
    // rasio oleh siapa pun. Di atas ambang ini tampilkan desimal saja.
    //
    // Ambangnya 100 dan bukan angka kecil karena rasio ultrawide yang SAH memang
    // berangka besar: 2560×1080 = 64:27. Ambang 40 akan membuang nama yang benar
    // dan menggantinya dengan "2.37 : 1" — kurang informatif, bukan lebih.
    if (r.w > 100 || r.h > 100) return (width / height).toFixed(2) + ' : 1';
    return r.w + ':' + r.h;
}

/**
 * Terapkan/cabut pilihan ke objek metadata (dimutasi & dikembalikan).
 * `null` = kembali ke bawaan, dan kuncinya DIBUANG — bukan ditulis 1920×1080.
 * Menulis nilai bawaan secara eksplisit membuat "belum diatur" tak bisa
 * dibedakan dari "kebetulan sama".
 */
function terapkanKeMeta(metaData, width, height) {
    const meta = metaData && typeof metaData === 'object' ? metaData : {};
    const bersih = (width === null || width === undefined) ? null : normalisasi(width, height);

    if (!bersih) {
        if (meta.display) {
            delete meta.display.targetViewport;
            if (!Object.keys(meta.display).length) delete meta.display;
        }
        return meta;
    }

    if (!meta.display || typeof meta.display !== 'object') meta.display = {};
    meta.display.targetViewport = { width: bersih.width, height: bersih.height };
    return meta;
}

module.exports = {
    DEFAULT_WIDTH,
    DEFAULT_HEIGHT,
    MIN_SISI,
    MAX_SISI,
    normalisasi,
    dariMeta,
    dariNovel,
    rasio,
    labelRasio,
    terapkanKeMeta
};
