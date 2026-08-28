// =============================================
// DIAGNOSTICS MAIN-SIDE (UX-B07) — kejadian yang RENDERER TAK BISA melaporkan
// =============================================
//
// Panel "Masalah & Log Preview" hidup di renderer editor, dan itu cukup untuk
// hampir semuanya: gagal load, pesan konsol, error extension. Ada satu kelas yang
// TIDAK bisa dilaporkan dari sana — kejadian yang membunuh pelapornya sendiri:
//
//   render-process-gone  — proses renderer mati (crash / OOM / killed)
//   unresponsive         — proses membeku dan berhenti menjawab
//   preload-error        — preload gagal sebelum halaman sempat berjalan
//
// Renderer yang baru saja mati tak bisa menuliskan nisannya sendiri. Karena itu
// buffer ini hidup di MAIN dan bertahan lintas sesi lewat satu berkas kecil:
// sesudah aplikasi pulih, panel bisa menampilkan "sesi sebelumnya berakhir
// begini". Tanpa itu, satu-satunya jejak crash adalah ingatan pengguna.
//
// KENAPA INI BUKAN LOG BIASA. Aplikasi ini baru menutup bug OOM, dan jalur
// pelaporan crash yang tidak berbatas justru bisa memperburuk situasi yang
// sedang ia laporkan. Karena itu:
//
//   • ring buffer BATAS entri, di memori;
//   • berkasnya ditulis ulang seluruhnya (bukan append) sehingga tak pernah
//     tumbuh melewati batas yang sama;
//   • pesan dipotong;
//   • kegagalan menulis DIABAIKAN diam-diam — diagnostik yang menjatuhkan
//     aplikasi lebih buruk daripada diagnostik yang hilang.

const path = require('path');
const fs = require('fs');

const BATAS = 50;
const MAKS_PESAN = 400;
const NAMA_BERKAS = 'vn-diagnostics-sesi.json';

let _berkas = null;
let _sesiIni = [];
let _sesiLalu = [];

function _potong(v) {
    const s = String(v == null ? '' : v);
    return s.length > MAKS_PESAN ? s.slice(0, MAKS_PESAN) + ' …' : s;
}

function _muatSesiLalu() {
    try {
        if (!_berkas || !fs.existsSync(_berkas)) return [];
        const isi = JSON.parse(fs.readFileSync(_berkas, 'utf-8'));
        return Array.isArray(isi) ? isi.slice(-BATAS) : [];
    } catch (e) {
        return [];   // berkas rusak = tak ada laporan, bukan aplikasi gagal start
    }
}

function _simpan() {
    try {
        if (!_berkas) return;
        fs.writeFileSync(_berkas, JSON.stringify(_sesiIni.slice(-BATAS)), 'utf-8');
    } catch (e) { /* lihat catatan modul: kegagalan menulis sengaja diabaikan */ }
}

/** Catat satu kejadian tingkat-proses. */
function catat(jenis, pesan, ekstra) {
    const it = Object.assign({
        jenis: String(jenis || 'lain'),
        pesan: _potong(pesan),
        waktu: Date.now()
    }, ekstra || {});
    _sesiIni.push(it);
    if (_sesiIni.length > BATAS) _sesiIni.splice(0, _sesiIni.length - BATAS);
    _simpan();
    return it;
}

/**
 * @param {object} deps
 * @param {object} deps.ipcMain
 * @param {object} deps.app       - electron app (untuk getPath + web-contents-created)
 */
function registerHandlers({ ipcMain, app } = {}) {
    if (!ipcMain || !app) return;

    try {
        _berkas = path.join(app.getPath('userData'), NAMA_BERKAS);
    } catch (e) {
        _berkas = null;   // tanpa userData, buffer tetap jalan di memori saja
    }

    // Dibaca SEKALI di awal, sebelum sesi ini menimpanya. Urutan ini yang
    // membuat "laporan sesi sebelumnya" mungkin sama sekali.
    _sesiLalu = _muatSesiLalu();
    _sesiIni = [];
    _simpan();

    // Satu titik pasang untuk SEMUA webContents — jendela utama, preview,
    // maupun <webview> yang lahir belakangan. Mendaftarkannya per-jendela berarti
    // webview preview (yang justru paling sering menjalankan kode kreator) tak
    // pernah terpantau.
    app.on('web-contents-created', (event, contents) => {
        let jenisWC = 'window';
        try { jenisWC = contents.getType(); } catch (e) { /* biarkan default */ }

        contents.on('render-process-gone', (e, detail) => {
            catat('render-process-gone',
                'Proses render berhenti: ' + ((detail && detail.reason) || 'unknown'),
                { wc: jenisWC, exitCode: (detail && detail.exitCode) });
        });

        contents.on('unresponsive', () => {
            catat('unresponsive', 'Halaman berhenti menjawab.', { wc: jenisWC });
        });

        contents.on('preload-error', (e, preloadPath, error) => {
            catat('preload-error',
                'Preload gagal: ' + ((error && error.message) || 'unknown'),
                { wc: jenisWC, preload: _potong(preloadPath) });
        });
    });

    /**
     * Laporan untuk panel. `sesiLalu` yang bikin ini berguna: kalau isinya tak
     * kosong, sesi sebelumnya berakhir dengan sesuatu yang layak dilihat.
     */
    ipcMain.handle('diagnostics:session-report', async () => ({
        success: true,
        sesiIni: _sesiIni.slice(),
        sesiLalu: _sesiLalu.slice()
    }));

    /** Dipanggil sesudah panel menampilkannya — laporan lama tak perlu muncul dua kali. */
    ipcMain.handle('diagnostics:ack-previous', async () => {
        _sesiLalu = [];
        return { success: true };
    });
}

module.exports = { registerHandlers, catat, BATAS, NAMA_BERKAS };
