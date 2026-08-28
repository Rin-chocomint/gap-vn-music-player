const path = require('path');
const fs = require('fs');

/**
 * Menentukan renderer player chapter yang dipakai runtime.
 *
 * Mirror dari hub-source-resolver: jika folder chapter punya `player.html` sendiri,
 * itu = Custom Player (engine sendiri milik user) → dimuat menggantikan player global
 * dengan bridge VNPlayer API. Jika tidak ada → player global (engine server-side).
 *
 * Deteksi via keberadaan file `player.html` (nama baru & bersih; tidak bentrok dengan
 * `index.html` legacy per-chapter yang sudah tidak dipakai runtime).
 *
 * JENIS KETIGA — 'engine-shim' (audit E1). `player.html` yang membawa penanda
 * `<meta name="vn-player" content="engine-shim">` BUKAN custom player: ia file
 * tipis milik chapter yang me-`<link>`/`<script src>` ENGINE BERSAMA, lalu
 * digerakkan jalur GLOBAL (server-side `set-chapter-context` + `update-display`).
 *
 * Kenapa butuh jenis sendiri: 'custom' dan 'global' bukan dua lokasi file, tapi
 * dua MODEL EKSEKUSI. Custom menerima `set-player-context` beserta SELURUH skrip
 * dan menggerakkan dirinya sendiri; engine bersama mendengar `set-chapter-context`
 * dan digerakkan per-baris oleh main. Shim tanpa jenis sendiri akan diperlakukan
 * 'custom' → engine tak pernah menerima perintah menggambar → layar KOSONG tanpa
 * error. (13 shim DDLC menunjuk engine DDLC sendiri — model klien — sehingga
 * polanya TIDAK bisa ditiru mentah-mentah untuk engine bersama.)
 *
 * Kompat mundur: file tanpa penanda tetap 'custom' — 2 fork beku, 13 shim DDLC,
 * dan DDLC-lama tak tersentuh sama sekali.
 *
 * @param {string} chapterPath - path absolut folder chapter
 * @param {string} globalPlayerPath - path absolut vn-player/player.html
 * @returns {{kind:'custom'|'engine-shim'|'global', filePath:string, useBridge:boolean, hasCustomFile:boolean}}
 */
const ENGINE_SHIM_MARKER = /<meta[^>]+name=["']vn-player["'][^>]+content=["']engine-shim["']/i;

/**
 * SCOPE NOVEL (audit D2). `player.html` dulu satu-satunya artefak code-first yang
 * TAK punya level novel, padahal `theme.css` dan `extensions/` punya:
 *
 *   artefak        novel   chapter
 *   theme.css        ✓        ✓
 *   extensions/      ✓        ✓
 *   player.html      ✗ ←      ✓
 *
 * Akibatnya novel 13 chapter yang ingin tampilan SAMA butuh 13 file — duplikasi
 * yang persis melahirkan 13 file DDLC. Dengan level novel: satu file untuk yang
 * seragam, `<chapter>/player.html` hanya untuk chapter yang memang harus beda.
 * Urutan menang: chapter → novel → engine global (pola yang sama dengan cascade
 * theme.css, jadi kreator tak perlu menghafal aturan baru).
 */
function _classify(filePath, scope) {
    let isShim = false;
    try {
        isShim = ENGINE_SHIM_MARKER.test(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) { /* tak terbaca → perlakukan sebagai custom (perilaku lama) */ }

    return {
        kind: isShim ? 'engine-shim' : 'custom',
        filePath,
        useBridge: !isShim,        // shim digerakkan jalur GLOBAL, bukan bridge
        hasCustomFile: true,
        scope                       // 'chapter' | 'novel'
    };
}

/**
 * @param {string} chapterPath - path absolut folder chapter
 * @param {string} globalPlayerPath - path absolut vn-player/player.html
 * @param {string} [novelPath] - path absolut folder novel (opsional; tanpa ini
 *        level novel dilewati — menjaga kompat pemanggil lama)
 */
function resolvePlayerSource(chapterPath, globalPlayerPath, novelPath) {
    const customPlayerPath = path.join(chapterPath, 'player.html');
    if (fs.existsSync(customPlayerPath)) return _classify(customPlayerPath, 'chapter');

    if (novelPath) {
        const novelPlayerPath = path.join(novelPath, 'player.html');
        if (fs.existsSync(novelPlayerPath)) return _classify(novelPlayerPath, 'novel');
    }

    return {
        kind: 'global',
        filePath: globalPlayerPath,
        useBridge: false,
        hasCustomFile: false,
        scope: 'global'
    };
}

/**
 * Apakah isi player.html ini SHIM engine bersama (bukan engine custom kreator)?
 * Diekspos supaya penulis file (mis. generator template) memakai aturan yang SAMA
 * dengan resolver — bukan menyalin regexnya dan berisiko menyimpang.
 */
function isEngineShim(htmlContent) {
    return ENGINE_SHIM_MARKER.test(String(htmlContent || ''));
}

module.exports = { resolvePlayerSource, isEngineShim };
