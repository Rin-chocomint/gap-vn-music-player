// === novelViewportEditor.js ===
// Target viewport novel — kanvas acuan yang dirancang kreator.
// Nilainya tinggal di `novel-meta.json` (`display.targetViewport`) dan ikut
// tombol Simpan Profil, TIDAK seperti font yang menulis berkas sendiri.
//
// Dua hal yang wajib tidak tertukar:
//
//   Target viewport (INI)   milik KREATOR, per-novel, di novel-meta.json.
//   Resolution di Options   milik PEMAIN, global, di setting aplikasi.
//
// Keduanya sengaja tidak berbagi nama di UI. Menyebut keduanya "Resolusi"
// adalah cara tercepat membuat pemain mengira setelannya rusak.
//
// Modul ini hanya mengurus FORM-nya. Nilai yang ia pegang dibaca `novelCrud.js`
// saat Simpan, dan disiarkan ke preview lewat `window.VN_TARGET_VIEWPORT` +
// variabel CSS `--vn-preview-aspect` supaya kanvas acuan preview ikut berubah.

(function () {
    'use strict';

    const el = (id) => document.getElementById(id);

    const BAWAAN = { width: 1920, height: 1080 };

    // Preset yang benar-benar dipakai orang. Bukan daftar lengkap semua resolusi —
    // daftar panjang justru membuat pilihan terasa seperti pekerjaan.
    const PRESET = [
        { w: 1280, h: 720, label: '1280 × 720 — 16:9' },
        { w: 1600, h: 900, label: '1600 × 900 — 16:9' },
        { w: 1920, h: 1080, label: '1920 × 1080 — 16:9' },
        { w: 2560, h: 1440, label: '2560 × 1440 — 16:9' },
        { w: 1024, h: 768, label: '1024 × 768 — 4:3' },
        { w: 1280, h: 960, label: '1280 × 960 — 4:3' },
        { w: 2560, h: 1080, label: '2560 × 1080 — 21:9' },
        { w: 1080, h: 1920, label: '1080 × 1920 — 9:16 (potret)' }
    ];

    function fpb(a, b) { return b === 0 ? a : fpb(b, a % b); }

    // Rasio DITURUNKAN dari width/height, tidak pernah disimpan terpisah —
    // dua sumber kebenaran untuk hal yang sama pasti berselisih cepat atau lambat.
    function labelRasio(w, h) {
        if (!w || !h) return '';
        const d = fpb(w, h) || 1;
        const rw = w / d, rh = h / d;
        if (rw > 40 || rh > 40) return (w / h).toFixed(2) + ' : 1';
        return rw + ':' + rh;
    }

    function isiPreset() {
        const sel = el('novel-viewport-preset');
        if (!sel || sel._vnTerisi) return;
        sel._vnTerisi = true;
        PRESET.forEach(function (p) {
            const opt = document.createElement('option');
            opt.value = p.w + 'x' + p.h;
            opt.textContent = p.label;
            sel.appendChild(opt);
        });
    }

    /** Nilai form saat ini, atau null bila kembali ke bawaan. */
    function nilai() {
        const w = parseInt((el('novel-viewport-w') || {}).value, 10);
        const h = parseInt((el('novel-viewport-h') || {}).value, 10);
        if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
        if (w === BAWAAN.width && h === BAWAAN.height) return null;
        return { width: w, height: h };
    }

    function catat(teks, error) {
        const note = el('novel-viewport-note');
        if (!note) return;
        note.textContent = teks || '';
        note.classList.toggle('is-error', !!error);
    }

    /**
     * Siarkan kanvas acuan ke preview editor. Dua permukaan membacanya:
     *   - `previewFrame.js` (skala webview/iframe) lewat window.VN_TARGET_VIEWPORT
     *   - `editor.css` (kotak viewport preview) lewat --vn-preview-aspect
     * Tanpa yang kedua, novel 4:3 akan tampil melar di preview padahal
     * berkasnya benar — persis kelas "aplikasi berbohong".
     */
    function siarkan(w, h) {
        window.VN_TARGET_VIEWPORT = { width: w, height: h };
        try {
            document.documentElement.style.setProperty('--vn-preview-aspect', w + ' / ' + h);
        } catch (e) { /* abaikan */ }
        if (typeof window._vnPreviewRescaleAll === 'function') window._vnPreviewRescaleAll();
    }

    function segarkan() {
        const w = parseInt((el('novel-viewport-w') || {}).value, 10) || BAWAAN.width;
        const h = parseInt((el('novel-viewport-h') || {}).value, 10) || BAWAAN.height;

        const lbl = el('novel-viewport-ratio');
        if (lbl) lbl.textContent = labelRasio(w, h);

        const sel = el('novel-viewport-preset');
        if (sel) {
            const cocok = w + 'x' + h;
            sel.value = (w === BAWAAN.width && h === BAWAAN.height) ? '' :
                (PRESET.some(function (p) { return p.w + 'x' + p.h === cocok; }) ? cocok : '');
        }

        if (w < 320 || h < 320 || w > 7680 || h > 7680) {
            catat('Ukuran di luar batas wajar (320–7680 px). Nilai ini akan diabaikan dan novel memakai bawaan.', true);
        } else if (w === BAWAAN.width && h === BAWAAN.height) {
            catat('Memakai bawaan — kunci ini tidak ditulis ke novel-meta.json.');
        } else {
            catat('Rasio ' + labelRasio(w, h) + '. Preview editor memakai ukuran ini sebagai kanvas acuan.');
        }

        siarkan(w, h);
    }

    function render(tv) {
        isiPreset();
        const w = (tv && tv.width) || BAWAAN.width;
        const h = (tv && tv.height) || BAWAAN.height;
        if (el('novel-viewport-w')) el('novel-viewport-w').value = w;
        if (el('novel-viewport-h')) el('novel-viewport-h').value = h;
        segarkan();
    }

    function pasang() {
        const sel = el('novel-viewport-preset');
        if (sel && !sel._vnBound) {
            sel._vnBound = true;
            sel.addEventListener('change', function () {
                const v = String(sel.value || '');
                const cocok = v.match(/^(\d+)x(\d+)$/);
                const w = cocok ? parseInt(cocok[1], 10) : BAWAAN.width;
                const h = cocok ? parseInt(cocok[2], 10) : BAWAAN.height;
                if (el('novel-viewport-w')) el('novel-viewport-w').value = w;
                if (el('novel-viewport-h')) el('novel-viewport-h').value = h;
                segarkan();
            });
        }
        ['novel-viewport-w', 'novel-viewport-h'].forEach(function (id) {
            const input = el(id);
            if (input && !input._vnBound) {
                input._vnBound = true;
                input.addEventListener('input', segarkan);
            }
        });
    }

    // Dibaca novelCrud.js saat Simpan Profil.
    window._novelViewportValue = nilai;
    // Ikut tanda-tangan draft supaya "tidak ada perubahan" tetap jujur.
    window._novelViewportSignature = function () {
        const v = nilai();
        return v ? v.width + 'x' + v.height : '';
    };

    // Dipanggil hubEditor.js saat novel dimuat.
    window._refreshNovelViewportCard = function (targetViewport) {
        pasang();
        render(targetViewport);
    };

    pasang();
    console.log('[VN NovelViewport] Module dimuat.');
})();
