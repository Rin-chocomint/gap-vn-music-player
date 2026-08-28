const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

/**
 * Kontrak cascade theme.css.
 *
 * Tanpa marker, perilaku lama tetap berlaku:
 *   engine -> novel -> chapter
 *
 * Template yang diterapkan khusus ke chapter adalah sebuah PILIHAN tampilan,
 * bukan sekadar tambahan kecil di atas tampilan Global. Karena itu generator
 * boleh menulis marker berikut ke theme.css chapter:
 *
 *   /* @vn-theme-cascade: replace-novel *\/
 *
 * Marker hanya bermakna pada file chapter. Baseline engine tetap dimuat, tetapi
 * theme.css novel dilewati sehingga preset netral/Default benar-benar dapat
 * membatalkan preset struktural milik novel (misalnya Klasik ADV).
 *
 * File buatan kreator yang tidak membawa marker tetap overlay/inherit demi
 * kompatibilitas. Kegagalan membaca marker juga jatuh ke inherit; resolver tidak
 * boleh menghilangkan theme novel hanya karena I/O sementara gagal.
 */
const CHAPTER_REPLACES_NOVEL_MARKER = '/* @vn-theme-cascade: replace-novel */';
// Hanya header yang ditulis materializer yang punya arti. Teks serupa di tengah
// komentar dokumentasi/kode kreator tidak boleh diam-diam mengubah cascade.
// BOM diterima karena editor teks Windows kadang menambahkannya ketika file
// disimpan ulang; selain itu ejaan/posisinya sengaja ketat dan deterministic.
const CHAPTER_REPLACES_NOVEL_HEADER_RE = /^\uFEFF?\/\* @vn-theme-cascade: replace-novel \*\/(?:\r?\n|$)/;

/**
 * Normalisasi CSS template sebelum ditulis ke scope chapter. Header canonical
 * lama disapu dulu supaya metadata template menjadi authority mode cascade;
 * teks serupa di badan CSS tetap sekadar isi milik kreator.
 */
function materializeChapterThemeCss(css, mode = 'inherit') {
    const clean = String(css == null ? '' : css)
        .replace(CHAPTER_REPLACES_NOVEL_HEADER_RE, '')
        .replace(/^\s+/, '');
    return mode === 'replace-novel'
        ? CHAPTER_REPLACES_NOVEL_MARKER + '\n\n' + clean
        : clean;
}

function readChapterCascadeMode(chapterThemePath, fsImpl = fs) {
    if (!chapterThemePath || !fsImpl.existsSync(chapterThemePath)) return 'inherit';
    try {
        const css = fsImpl.readFileSync(chapterThemePath, 'utf8');
        return CHAPTER_REPLACES_NOVEL_HEADER_RE.test(css) ? 'replace-novel' : 'inherit';
    } catch (e) {
        return 'inherit';
    }
}

/**
 * Resolve file CSS efektif untuk engine, preview editor, dan custom player.
 * Nilai null berarti lapisan itu sengaja/tidak tersedia dan jangan dimuat.
 */
function resolveEffectiveThemeFiles({ engineThemePath, novelDir, chapterDir, fsImpl = fs } = {}) {
    const novelThemePath = novelDir ? path.join(novelDir, 'theme.css') : null;
    const chapterThemePath = chapterDir ? path.join(chapterDir, 'theme.css') : null;
    const cascadeMode = readChapterCascadeMode(chapterThemePath, fsImpl);

    const exists = (p) => !!(p && fsImpl.existsSync(p));
    return {
        cascadeMode,
        themePath: exists(engineThemePath) ? engineThemePath : null,
        novelPath: cascadeMode === 'replace-novel'
            ? null
            : (exists(novelThemePath) ? novelThemePath : null),
        chapterPath: exists(chapterThemePath) ? chapterThemePath : null,
        novelSkipped: cascadeMode === 'replace-novel' && exists(novelThemePath)
    };
}

/**
 * URL file dengan revision stabil per versi ISI. Apply template menimpa
 * theme.css pada path yang sama; URL polos membiarkan Chromium memakai CSS lama
 * setelah reload. mtime + ukuran saja tidak cukup: dua write cepat dapat punya
 * timestamp dan ukuran identik. Hash isi membuat revision tetap deterministic
 * untuk kasus itu. Metadata hanya fallback saat file sementara tidak bisa dibaca.
 */
function toVersionedFileUrl(filePath, fsImpl = fs) {
    if (!filePath) return null;
    let revision = '';
    try {
        const contents = fsImpl.readFileSync(filePath);
        revision = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);
    } catch (readError) {
        try {
            const stat = fsImpl.statSync(filePath);
            revision = Math.round(Number(stat.mtimeMs || 0) * 1000) + '-' + Number(stat.size || 0);
        } catch (statError) { /* URL tanpa revision masih lebih baik daripada membuang lapisan */ }
    }
    const url = 'file:///' + String(filePath).replace(/\\/g, '/');
    return revision ? url + '?vnrev=' + encodeURIComponent(revision) : url;
}

module.exports = {
    CHAPTER_REPLACES_NOVEL_MARKER,
    materializeChapterThemeCss,
    readChapterCascadeMode,
    resolveEffectiveThemeFiles,
    toVersionedFileUrl
};
