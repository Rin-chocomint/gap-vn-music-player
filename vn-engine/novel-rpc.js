// =============================================
// Novel RPC — gambar besar Discord Rich Presence per-novel
// =============================================
//
// Aplikasi ini sudah punya jalur gambar RPC dinamis: saat memutar musik online,
// URL cover lagu dikirim sebagai `largeImageKey` dan Discord mem-proxy-nya
// (`mp:external/...`). Fitur ini memakai jalur yang SAMA untuk novel — bedanya
// URL-nya dipilih kreator, bukan diambil dari pemutar.
//
// SIAPA GERBANG TERAKHIRNYA
// -------------------------
// `sanitizeRpcLargeImage()` di `main.js` tetap gerbang terakhir untuk SEMUA
// sumber gambar RPC (musik maupun novel). Modul ini TIDAK menggantikannya; ia
// menyimpan nilainya dan memberi kreator jawaban lebih awal, memakai aturan yang
// sama. Kalau toh ada URL yang lolos di sini tapi ditolak di sana, akibatnya
// cuma jatuh ke ikon bawaan — tidak ada yang rusak.
//
// KENAPA HANYA http(s)
// --------------------
// Discord memuat gambar besar dari internet lewat proxy-nya sendiri. Berkas
// lokal (`file:`), `data:`, dan `blob:` tak pernah bisa dijangkau proxy itu,
// jadi menerimanya berarti menjanjikan sesuatu yang pasti gagal — kreator akan
// melihat ikon bawaan dan tak punya cara tahu kenapa. Itu sebabnya cover novel
// yang ada di disk TIDAK bisa dipakai langsung; ia harus diunggah ke suatu
// tempat yang bisa diakses internet lebih dulu.

const fs = require('fs');
const path = require('path');

// Discord memangkas asset key/URL yang terlalu panjang. Batas ini bukan aturan
// Discord yang pasti, melainkan pagar kewarasan supaya novel-meta.json tidak
// menampung string raksasa dari salah-tempel.
const MAX_PANJANG = 512;

/**
 * Bersihkan URL gambar RPC, atau null bila tidak dipakai/ tidak sah.
 * @returns {null|string}
 */
function normalisasiUrl(value) {
    if (typeof value !== 'string') return null;
    const bersih = value.trim();
    if (!bersih) return null;
    if (bersih.length > MAX_PANJANG) return null;
    if (!/^https?:\/\/\S+$/i.test(bersih)) return null;
    return bersih;
}

/** Alasan sebuah nilai ditolak — untuk pesan editor, bukan untuk runtime. */
function alasanTolak(value) {
    if (typeof value !== 'string' || !value.trim()) return null;   // kosong = sah
    const bersih = value.trim();
    if (bersih.length > MAX_PANJANG) return 'Alamatnya terlalu panjang (maksimal ' + MAX_PANJANG + ' karakter).';
    if (/^(file|data|blob):/i.test(bersih)) {
        return 'Discord memuat gambar lewat internet, jadi berkas lokal tidak bisa dipakai. Unggah dulu gambarnya ke layanan yang bisa diakses publik, lalu tempel alamat https-nya.';
    }
    if (!/^https?:\/\//i.test(bersih)) return 'Harus berupa alamat lengkap yang diawali https://';
    if (!/^https?:\/\/\S+$/i.test(bersih)) return 'Alamat tidak boleh memuat spasi.';
    return null;
}

// Tombol kedua opsional di kartu Discord. Sengaja https-only dan tanpa spasi:
// satu URL cacat membuat Discord menolak SELURUH activity, bukan cuma tombolnya,
// dan status berhenti diperbarui tanpa gejala apa pun.
function normalisasiTautan(nilai) {
    if (!nilai || typeof nilai !== 'object') return null;
    const label = typeof nilai.label === 'string' ? nilai.label.trim() : '';
    const url = typeof nilai.url === 'string' ? nilai.url.trim() : '';
    if (!label || !url) return null;
    if (url.length > MAX_PANJANG) return null;
    if (!/^https:\/\/\S+$/i.test(url)) return null;
    return { label: label.slice(0, 31), url };
}

const KOSONG = { largeImage: null, privat: false, tautan: null };

/**
 * @returns {{largeImage: string|null, privat: boolean, tautan: {label: string, url: string}|null}}
 *
 * `privat` adalah penanda milik KREATOR, bukan pemain: sebagian novel memang
 * tidak layak judulnya terpampang di server Discord orang lain (garapan pribadi,
 * konten dewasa, atau sekadar judul kerja yang memalukan). Tingkat privasi milik
 * pemain diurus terpisah di setelan aplikasi; yang lebih ketat di antara
 * keduanya yang berlaku.
 */
function dariMeta(metaData) {
    const rpc = metaData && metaData.discordRpc;
    if (!rpc || typeof rpc !== 'object') return { ...KOSONG };
    return {
        largeImage: normalisasiUrl(rpc.largeImage),
        privat: rpc.private === true,
        tautan: normalisasiTautan(rpc.tautan)
    };
}

/** Baca dari novel di disk. Gagal baca = tidak ada gambar, bukan galat. */
function dariNovel(novelPath) {
    try {
        const p = path.join(novelPath, 'novel-meta.json');
        if (!fs.existsSync(p)) return { ...KOSONG };
        return dariMeta(JSON.parse(fs.readFileSync(p, 'utf-8')));
    } catch (e) {
        return { ...KOSONG };
    }
}

/**
 * Terapkan/cabut ke objek metadata (dimutasi & dikembalikan).
 * Nilai kosong/tak sah MEMBUANG kuncinya — sama seperti target viewport:
 * menyimpan string kosong membuat "belum diisi" tak bisa dibedakan dari
 * "pernah diisi lalu dikosongkan", dan keduanya berarti hal yang sama.
 */
function terapkanKeMeta(metaData, url) {
    const meta = metaData && typeof metaData === 'object' ? metaData : {};
    const bersih = normalisasiUrl(url);

    if (!bersih) {
        if (meta.discordRpc) {
            delete meta.discordRpc.largeImage;
            if (!Object.keys(meta.discordRpc).length) delete meta.discordRpc;
        }
        return meta;
    }

    if (!meta.discordRpc || typeof meta.discordRpc !== 'object') meta.discordRpc = {};
    meta.discordRpc.largeImage = bersih;
    return meta;
}

/**
 * Terapkan/cabut penanda privat. Sengaja fungsi terpisah dari `terapkanKeMeta`:
 * mengosongkan alamat gambar tidak boleh ikut membatalkan keputusan kreator
 * untuk menyembunyikan judul novelnya — itu dua hal yang berbeda.
 */
function terapkanPrivatKeMeta(metaData, privat) {
    const meta = metaData && typeof metaData === 'object' ? metaData : {};
    if (privat === true) {
        if (!meta.discordRpc || typeof meta.discordRpc !== 'object') meta.discordRpc = {};
        meta.discordRpc.private = true;
        return meta;
    }
    if (meta.discordRpc) {
        delete meta.discordRpc.private;
        if (!Object.keys(meta.discordRpc).length) delete meta.discordRpc;
    }
    return meta;
}

module.exports = {
    MAX_PANJANG, normalisasiUrl, normalisasiTautan, alasanTolak,
    dariMeta, dariNovel, terapkanKeMeta, terapkanPrivatKeMeta
};
