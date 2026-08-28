// =============================================
// N5 — MATERIALISASI KOSMETIK LEGACY
// =============================================
//
// MASALAH yang diselesaikan (audit §24.2, diukur ulang 2026-07-31):
// `playerProfile.playerTheme`, `.dialogueStyle`, dan `.customCSS` di
// `hub-config.json` masih DIPATUHI runtime, tapi **tak ada satu pun pintu di
// editor yang bisa mengubahnya** — dropdown Tema Player & picker Gaya Dialog
// sudah dicabut (D3), dan `customCSS` sudah pindah jadi berkas (D4). Nilainya
// jadi YATIM: kreator melihat `theme.css`-nya tak berpengaruh dan tak ada
// tempat mana pun di aplikasi yang bisa menjelaskan kenapa.
//
// Terukur: 8 nilai efektif di 4 novel (Doki Doki Literature Club!, Jejak
// Bintang, DDLC, The Wandering Witch) + 17 nilai default yang nol efek.
//
// SOLUSINYA memindahkan nilai ke rumah yang SUDAH ditetapkan pekerjaan
// sebelumnya — modul ini tidak mengarang tempat baru:
//   playerTheme   → `<novel|chapter>/theme.css`   (cascade lapis 5/6, extension-loader)
//   dialogueStyle → idem                          (deklarasinya, bukan nama kelasnya)
//   customCSS     → idem                          (tab Kode scope-aware, D4)
//
// KENAPA CSS untuk ketiganya, bukan atribut `data-dialogue-style` (FB5):
// atribut itu hanya dibaca shim, sementara `theme.css` dimuat untuk SEMUA jenis
// player. Satu mekanisme, satu cara verifikasi. Atribut FB5 tak disentuh —
// ia jalur template, bukan lapisan JSON yang sedang dicabut.
//
// ⚠ TERJEMAHAN SELEKTOR: `customCSS` novel lama memilih lewat id engine
// (`#dialogue-box`, `#character-name`, …) — id yang akan dicabut Tahap 4.
// Materialisasi menerjemahkannya ke `[data-player-role="…"]` supaya kosmetik
// kreator selamat dari Tahap 4 tanpa pekerjaan tambahan nanti. Petanya
// DITURUNKAN dari `ROLE_SPEC` di `vn-player/js/state.js` (sumber kanonik),
// bukan disalin — kalau ada peran baru, ia ikut sendiri.

const fs = require('fs');
const path = require('path');

const ENGINE_DIR = path.join(path.dirname(__dirname), 'vn-player');

// Tanda blok supaya materialisasi IDEMPOTEN: menjalankan ulang mengganti blok
// lama, bukan menumpuk. Tanpa ini, migrasi dua kali menggandakan CSS.
const MULAI = '/* === N5:materialisasi-kosmetik (dibuat otomatis) === */';
const SELESAI = '/* === /N5:materialisasi-kosmetik === */';

/** Peta id→peran dari ROLE_SPEC yang NYATA (bukan salinan). */
function bacaPetaPeran(stateJsPath) {
    const src = fs.readFileSync(stateJsPath || path.join(ENGINE_DIR, 'js', 'state.js'), 'utf-8');
    const blok = (src.match(/const ROLE_SPEC = \{[\s\S]*?\n    \};/) || [''])[0];
    const peta = {};
    // `idLama` sejak Tahap 4 (2026-07-31): pasangannya tetap tercatat sebagai
    // pengetahuan MIGRASI, bukan jalur resolusi. Justru karena engine tak lagi
    // mengenali id, terjemahan selektor ini jadi WAJIB, bukan opsional.
    const re = /role:\s*'([\w-]+)'\s*,\s*idLama:\s*'([\w-]+)'/g;
    let m;
    while ((m = re.exec(blok)) !== null) peta['#' + m[2]] = '[data-player-role="' + m[1] + '"]';
    return peta;
}

/**
 * Ganti selektor id engine jadi selektor peran. Hanya menyentuh id yang
 * BENAR-BENAR punya peran; id lain (milik kreator) dibiarkan apa adanya.
 */
function terjemahkanSelektor(css, peta) {
    if (!css) return { css: css || '', diganti: [] };
    const diganti = [];
    let out = css;
    Object.keys(peta).forEach((id) => {
        // batas kata di belakang: `#dialogue-box` tak boleh cocok ke `#dialogue-boxer`
        const re = new RegExp(id.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '(?![\\w-])', 'g');
        const n = (out.match(re) || []).length;
        if (n) { diganti.push(id + ' ×' + n); out = out.replace(re, peta[id]); }
    });
    return { css: out, diganti };
}

// Komentar BUKAN kode. `themes/default/theme.css` mencontohkan `:root { … }` di
// dalam komentar, dan tanpa penyaringan ini pemindai memungutnya sebagai aturan
// nyata. Kelas kesalahan yang sama sudah muncul tiga kali di repo ini (kosakata
// player, `data-player-omit`, dan sekarang di sini) — jadi penyaringnya dipasang
// di pintu masuk, bukan di tiap pemanggil.
function tanpaKomentarCss(css) {
    return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Ambil isi satu blok aturan CSS teratas berselektor `selektor`. */
function isiBlok(cssMentah, selektor) {
    const css = tanpaKomentarCss(cssMentah);
    const i = css.indexOf(selektor);
    if (i < 0) return null;
    const buka = css.indexOf('{', i);
    if (buka < 0) return null;
    let dalam = 1, j = buka + 1;
    while (j < css.length && dalam > 0) {
        if (css[j] === '{') dalam++;
        else if (css[j] === '}') dalam--;
        j++;
    }
    return css.slice(buka + 1, j - 1).trim();
}

/** Semua aturan turunan `<gate> <sisa> { … }` di sebuah stylesheet. */
function aturanTurunan(cssMentah, gate) {
    const css = tanpaKomentarCss(cssMentah);
    const out = [];
    const re = new RegExp(gate.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '\\s+([^{}]+)\\{([^}]*)\\}', 'g');
    let m;
    while ((m = re.exec(css)) !== null) out.push({ sisa: m[1].trim(), isi: m[2].trim() });
    return out;
}

function indent(teks) {
    return teks.split('\n').map((b) => (b.trim() ? '    ' + b.trim() : '')).join('\n');
}

/**
 * Bangun CSS materialisasi untuk SATU cakupan (novel atau chapter).
 *
 * @param {{playerTheme?:string, dialogueStyle?:string, customCSS?:string}} nilai
 * @param {{peta:Object, themesDir?:string, variantsCss?:string}} sumber
 * @returns {{css:string, catatan:string[], dipakai:string[]}} css '' bila nol nilai efektif
 */
function bangunCss(nilai, sumber, cakupan) {
    const peta = sumber.peta;
    // CAKUPAN menentukan apakah nilai DEFAULT boleh dilewati.
    //   global  → boleh: engine sudah memakai baseline itu, jadi menuliskannya
    //             cuma menggandakan.
    //   chapter → TIDAK boleh: override chapter ada justru untuk MEMBATALKAN
    //             nilai novel. Jejak Bintang membuktikannya — global `center-box`,
    //             Chapter 2 `bottom-bar`. Melewatinya sebagai "default" membuat
    //             Chapter 2 mewarisi center-box dari theme.css novel; hari ini ia
    //             bottom-bar. Melewati default hanya aman kalau tak ada yang
    //             perlu dibatalkan.
    const bolehLewatiDefault = cakupan !== 'chapter';
    const themesDir = sumber.themesDir || path.join(ENGINE_DIR, 'themes');
    // ⚠ URUTAN BAGIAN = SEMANTIK, bukan selera. Di runtime lama ketiganya menang
    // dengan aturan berbeda: `.theme-<x>` menempel di <body>, `.dialogue-style-<y>`
    // di #game-container (keturunan body), dan `customCSS` disuntik paling akhir.
    // Untuk custom property, ancestor TERDEKAT yang menang — jadi gaya dialog
    // mengalahkan tema meski temanya dimuat belakangan. Setelah diratakan ke
    // `:root`, yang menentukan tinggal URUTAN SUMBER. Karena itu susunannya
    // tema → gaya dialog → customCSS: satu-satunya susunan yang mereproduksi
    // pemenang yang sama.
    const bagian = [];
    const catatan = [];
    const dipakai = [];

    // --- 1. playerTheme → custom property di :root ---
    // 'default' dilewati di cakupan global (berkasnya sudah dimuat <link> statis
    // di player.html); di cakupan chapter ia DIMATERIALISASI supaya bisa
    // membatalkan tema novel.
    const tema = nilai.playerTheme;
    if (tema && !(bolehLewatiDefault && tema === 'default')) {
        const p = path.join(themesDir, tema, 'theme.css');
        if (!fs.existsSync(p)) {
            catatan.push(`playerTheme '${tema}': berkas tema TAK ADA — dilewati (nilai memang tak pernah berefek)`);
        } else {
            const src = fs.readFileSync(p, 'utf-8');
            const isi = isiBlok(src, '.theme-' + tema);
            if (!isi && tema === 'default') {
                // `themes/default/theme.css` sengaja KOSONG — baseline sebenarnya
                // hidup di `variables.css`. Jadi "kembali ke default" di cakupan
                // chapter tak bisa dimaterialisasi jadi CSS tanpa MENYALIN seluruh
                // baseline engine — dan salinan itu akan MEMBEKU (perbaikan engine
                // berikutnya tak sampai ke chapter itu). Lebih jujur melaporkannya
                // daripada diam-diam memilih salah satu.
                catatan.push("playerTheme 'default' di cakupan chapter: baseline ada di " +
                    'variables.css, bukan di berkas tema — TIDAK dimaterialisasi. ' +
                    'Kalau chapter ini memang harus membatalkan tema novel, tulis ' +
                    'sendiri var yang ingin dikembalikan di theme.css chapter.');
            } else if (!isi) {
                catatan.push(`playerTheme '${tema}': blok .theme-${tema} tak ditemukan — dilewati`);
            } else {
                bagian.push(`/* dari themes/${tema}/theme.css */\n:root {\n${indent(isi)}\n}`);
                dipakai.push('playerTheme=' + tema);
            }
        }
    }

    // --- 2. dialogueStyle → deklarasinya, bukan nama kelasnya ---
    // 'bottom-bar' dilewati di cakupan global (ia default `variables.css`; blok
    // variannya sendiri menyebut dirinya "eksplisit untuk fallback"); di cakupan
    // chapter ia justru WAJIB ditulis — lihat catatan bolehLewatiDefault.
    const gaya = nilai.dialogueStyle;
    if (gaya && !(bolehLewatiDefault && gaya === 'bottom-bar')) {
        const varian = sumber.variantsCss !== undefined ? sumber.variantsCss
            : fs.readFileSync(path.join(ENGINE_DIR, 'css', 'dialogue-variants.css'), 'utf-8');
        // Gate = selektor PERSIS seperti tertulis di dialogue-variants.css.
        // Sejak perbaikan cascade ia berbentuk `:root:where(.dialogue-style-x)`
        // (alasannya panjang, ada di berkas CSS itu). Kalau gate di sini masih
        // `.dialogue-style-x`, `isiBlok`/`aturanTurunan` tak menemukan apa pun
        // dan materialisasi diam-diam menghasilkan blok KOSONG — kegagalan yang
        // tak menyebut sebabnya. Bentuk lama tetap dicoba sebagai cadangan supaya
        // stylesheet varian buatan sendiri (mis. di test) tetap terbaca.
        const gateBaru = ':root:where(.dialogue-style-' + gaya + ')';
        const gateLama = '.dialogue-style-' + gaya;
        const gate = (varian.indexOf(gateBaru) >= 0) ? gateBaru : gateLama;
        const isi = isiBlok(varian, gate + ' {') || isiBlok(varian, gate + '{');
        const turunan = aturanTurunan(varian, gate);
        if (!isi && !turunan.length) {
            catatan.push(`dialogueStyle '${gaya}': tak ada aturannya di dialogue-variants.css — dilewati`);
        } else {
            let blok = `/* dari css/dialogue-variants.css — ${gate} */`;
            if (isi) blok += `\n:root {\n${indent(isi)}\n}`;
            turunan.forEach((t) => {
                const sel = terjemahkanSelektor(t.sisa, peta);
                if (sel.diganti.length) catatan.push(`dialogueStyle: selektor diterjemahkan (${sel.diganti.join(', ')})`);
                blok += `\n${sel.css} {\n${indent(t.isi)}\n}`;
            });
            bagian.push(blok);
            dipakai.push('dialogueStyle=' + gaya);
        }
    }

    // --- 3. customCSS → apa adanya, selektor id diterjemahkan ---
    const kustom = nilai.customCSS;
    if (kustom && String(kustom).trim()) {
        const t = terjemahkanSelektor(String(kustom).trim(), peta);
        if (t.diganti.length) catatan.push(`customCSS: selektor id→peran (${t.diganti.join(', ')})`);
        bagian.push('/* dari playerProfile.customCSS */\n' + t.css);
        dipakai.push('customCSS');
    }

    if (!bagian.length) return { css: '', catatan, dipakai };
    return {
        css: [MULAI,
            '/* Dipindahkan dari hub-config.json oleh migrasi N5.',
            ' * Kunci JSON-nya sudah dikosongkan — INI sekarang satu-satunya rumah',
            ' * kosmetik ini, dan kamu bebas menyunting/menghapusnya. */',
            '', bagian.join('\n\n'), SELESAI].join('\n'),
        catatan, dipakai
    };
}

/** Sisipkan/ganti blok materialisasi di isi theme.css yang sudah ada. */
function gabungKeBerkas(isiLama, blokBaru) {
    const lama = isiLama || '';
    const i = lama.indexOf(MULAI);
    if (i >= 0) {
        const j = lama.indexOf(SELESAI);
        const akhir = j >= 0 ? j + SELESAI.length : lama.length;
        return (lama.slice(0, i) + blokBaru + lama.slice(akhir)).replace(/\n{3,}/g, '\n\n');
    }
    // Blok materialisasi ditaruh di ATAS: ia nilai warisan, jadi CSS yang sudah
    // ditulis kreator di bawahnya tetap menang bila keduanya bertabrakan.
    return blokBaru + (lama.trim() ? '\n\n' + lama.trimStart() : '\n');
}

/** Kunci yang dipindahkan modul ini (dan karena itu dikosongkan dari JSON). */
const KUNCI_KOSMETIK = ['playerTheme', 'dialogueStyle', 'customCSS'];

/**
 * Rencanakan materialisasi SATU novel — murni, nol tulis ke disk.
 * Pemanggil yang memutuskan menulis atau tidak (lihat tools/materialisasi-tema-n5.js).
 *
 * @returns {{aksi:Array<{berkas:string, css:string, dipakai:string[]}>, configBaru:Object, catatan:string[], adaPerubahan:boolean}}
 */
function rencanakan(config, opsi) {
    const o = opsi || {};
    const peta = o.peta || bacaPetaPeran(o.stateJsPath);
    const sumber = { peta, themesDir: o.themesDir, variantsCss: o.variantsCss };
    const cfg = JSON.parse(JSON.stringify(config || {}));
    const aksi = [];
    const catatan = [];
    let adaPerubahan = false;

    const bersihkan = (obj) => {
        if (!obj) return;
        KUNCI_KOSMETIK.forEach((k) => {
            if (obj[k] !== undefined) { delete obj[k]; adaPerubahan = true; }
        });
    };

    const pp = cfg.playerProfile || {};
    const global = bangunCss(pp, sumber, 'global');
    catatan.push(...global.catatan.map((c) => 'global · ' + c));
    if (global.css) aksi.push({ berkas: 'theme.css', css: global.css, dipakai: global.dipakai });
    bersihkan(cfg.playerProfile);

    const cc = cfg.chapterConfig || {};
    Object.keys(cc).forEach((bab) => {
        // Override chapter berlaku DI ATAS global. Yang dimaterialisasi hanya kunci
        // yang override-nya sendiri sebutkan — sisanya sudah ditangani theme.css novel.
        const hasil = bangunCss(cc[bab] || {}, sumber, 'chapter');
        catatan.push(...hasil.catatan.map((c) => bab + ' · ' + c));
        if (hasil.css) aksi.push({ berkas: path.join(bab, 'theme.css'), css: hasil.css, dipakai: hasil.dipakai });
        bersihkan(cc[bab]);
    });

    return { aksi, configBaru: cfg, catatan, adaPerubahan };
}

module.exports = {
    MULAI, SELESAI, KUNCI_KOSMETIK,
    bacaPetaPeran, terjemahkanSelektor, isiBlok, aturanTurunan,
    bangunCss, gabungKeBerkas, rencanakan,
};
