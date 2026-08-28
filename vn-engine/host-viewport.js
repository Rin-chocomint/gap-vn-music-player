// =============================================
// Host Viewport — siapa yang memiliki ukuran window
// =============================================
//
// Modul ini melunasi lima utang yang disebut D8 ketika sebuah novel diizinkan
// meminta ukuran window host. Tanpa kelimanya, fitur ini MENCURI setting
// pengguna tanpa satu pun dialog. Rantai kebocorannya nyata, bukan teoretis:
//
//   novel menyetel window ke 1280×720 → pemain membuka Options untuk urusan
//   lain → dropdown Resolution menampilkan 1280×720 karena ia membaca ukuran
//   window yang SEDANG BERLAKU (`get-window-size`) → pemain menekan Apply →
//   1280×720 menjadi preferensi tersimpan pemain, selamanya.
//
// Kelimanya:
//
//   (a) SNAPSHOT & PULIHKAN. Ukuran direkam sebelum diubah, dikembalikan saat
//       pemain keluar dari novel. Inilah yang menutup rantai di atas.
//   (b) FULLSCREEN DIHORMATI, BUKAN DIBATALKAN. `vn-engine:set-window-size`
//       yang sudah ada memaksa keluar dari fullscreen — wajar untuk
//       `VNHub.settings.setResolution()` yang dipicu tombol buatan kreator,
//       tetapi hostile untuk penerapan otomatis. Di sini fullscreen berarti
//       LEWATI; novel berjalan mengisi layar, seperti perilaku hari ini.
//   (c) SERAH-TERIMA KEPEMILIKAN. Begitu pemain menarik tepi window sendiri,
//       aplikasi berhenti menegaskan ukuran target untuk sisa sesi novel itu —
//       dan tidak memulihkan apa pun saat keluar, karena ukuran terakhir sudah
//       menjadi pilihan pemain, bukan bekas permintaan novel.
//   (d) LAYAR LEBIH KECIL DARI TARGET. Tidak ada penanganan khusus: Electron
//       menjepitnya, dan novel berjalan fluid pada ukuran yang muat. Target
//       viewport adalah PERMINTAAN, bukan jaminan.
//   (e) TIDAK MENULIS `userSettings`. Modul ini tak pernah menyentuh preferensi
//       tersimpan siapa pun. Ia hanya memindahkan ukuran window sementara.

// State per-proses. Sengaja modul-level: hanya ada satu window host.
let _snapshot = null;      // { width, height } sebelum novel meminta
let _diminta = null;       // ukuran yang terakhir kita minta
let _diserahkan = false;   // pemain mengambil alih dengan menarik window
let _terpasang = false;    // listener resize sudah dipasang
let _menerapkan = false;   // sedang memanggil setContentSize sendiri

// Resize akibat panggilan kita sendiri dan resize akibat tarikan pemain sama-
// sama memicu event 'resize'. Bedanya cuma ukurannya. Toleransi kecil menutupi
// pembulatan DPI-scaling, yang bisa meleset satu-dua piksel.
const TOLERANSI = 4;

function _mendekati(a, b) {
    return Math.abs(a - b) <= TOLERANSI;
}

function _pasangPenjaga(win) {
    if (_terpasang || !win || win.isDestroyed()) return;
    _terpasang = true;
    win.on('resize', () => {
        if (_menerapkan || _diserahkan || !_diminta) return;
        try {
            const [w, h] = win.getContentSize();
            if (!_mendekati(w, _diminta.width) || !_mendekati(h, _diminta.height)) {
                _diserahkan = true;
                console.log('[HostViewport] Pemain mengubah ukuran window sendiri — target novel tidak ditegaskan lagi.');
            }
        } catch (e) { /* window sedang ditutup */ }
    });
}

/**
 * Minta window host memakai ukuran target sebuah novel.
 * @returns {{diterapkan:boolean, alasan:string, diminta?:{width,height}, sebelum?:{width,height}}}
 */
function terapkan(win, target) {
    if (!win || win.isDestroyed() || !target) {
        return { diterapkan: false, alasan: 'tidak-ada-window' };
    }
    if (_diserahkan) {
        return { diterapkan: false, alasan: 'diserahkan-ke-pemain' };
    }
    try {
        if (win.isFullScreen()) {
            // (b) — JANGAN keluar dari fullscreen. Pemain yang memilihnya.
            return { diterapkan: false, alasan: 'fullscreen' };
        }

        const [wSekarang, hSekarang] = win.getContentSize();
        // (a) — snapshot hanya sekali per sesi novel.
        if (!_snapshot) _snapshot = { width: wSekarang, height: hSekarang };

        if (_mendekati(wSekarang, target.width) && _mendekati(hSekarang, target.height)) {
            _diminta = { width: target.width, height: target.height };
            _pasangPenjaga(win);
            return { diterapkan: false, alasan: 'sudah-sesuai', sebelum: { ..._snapshot } };
        }

        _menerapkan = true;
        win.setContentSize(Math.round(target.width), Math.round(target.height));
        win.center();
        _menerapkan = false;

        _diminta = { width: target.width, height: target.height };
        _pasangPenjaga(win);

        console.log('[HostViewport] Window disetel ke target novel ' + target.width + '×' + target.height +
            ' (sebelumnya ' + _snapshot.width + '×' + _snapshot.height + ').');
        return { diterapkan: true, alasan: 'diterapkan', diminta: { ..._diminta }, sebelum: { ..._snapshot } };
    } catch (e) {
        _menerapkan = false;
        console.error('[HostViewport] Gagal menerapkan target viewport:', e);
        return { diterapkan: false, alasan: 'galat' };
    }
}

/**
 * Kembalikan ukuran window ke keadaan sebelum novel meminta.
 * @returns {{dipulihkan:boolean, alasan:string, ke?:{width,height}}}
 */
function pulihkan(win) {
    const snapshot = _snapshot;
    const diserahkan = _diserahkan;
    // State dibersihkan APA PUN hasilnya: sesi novel sudah berakhir, dan
    // menyisakan snapshot lama akan membuat novel berikutnya memulihkan ke
    // ukuran yang tak ada hubungannya dengannya.
    _snapshot = null;
    _diminta = null;
    _diserahkan = false;

    if (!snapshot) return { dipulihkan: false, alasan: 'tak-pernah-diubah' };
    if (diserahkan) {
        // (c) — ukuran terakhir sudah jadi pilihan pemain. Jangan diutak-atik.
        console.log('[HostViewport] Ukuran window tidak dipulihkan: pemain sudah mengubahnya sendiri.');
        return { dipulihkan: false, alasan: 'diserahkan-ke-pemain' };
    }
    if (!win || win.isDestroyed()) return { dipulihkan: false, alasan: 'tidak-ada-window' };

    try {
        if (win.isFullScreen()) return { dipulihkan: false, alasan: 'fullscreen' };
        _menerapkan = true;
        win.setContentSize(snapshot.width, snapshot.height);
        win.center();
        _menerapkan = false;
        console.log('[HostViewport] Ukuran window dipulihkan ke ' + snapshot.width + '×' + snapshot.height + '.');
        return { dipulihkan: true, alasan: 'dipulihkan', ke: { ...snapshot } };
    } catch (e) {
        _menerapkan = false;
        console.error('[HostViewport] Gagal memulihkan ukuran window:', e);
        return { dipulihkan: false, alasan: 'galat' };
    }
}

/** Keadaan saat ini — dipakai test dan diagnostics. */
function keadaan() {
    return {
        snapshot: _snapshot ? { ..._snapshot } : null,
        diminta: _diminta ? { ..._diminta } : null,
        diserahkan: _diserahkan
    };
}

/** Lupakan semua state (dipakai test). Tidak menyentuh window. */
function reset() {
    _snapshot = null;
    _diminta = null;
    _diserahkan = false;
    _terpasang = false;
    _menerapkan = false;
}

module.exports = { terapkan, pulihkan, keadaan, reset, TOLERANSI };
