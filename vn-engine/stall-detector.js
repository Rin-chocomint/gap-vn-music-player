/**
 * DETEKTOR STALL — mencatat saat aplikasi berhenti menjawab, beserta APA yang
 * sedang berjalan saat itu.
 *
 * KENAPA ADA. Freeze saat mengklik template dilaporkan user dari pemakaian
 * nyata, tapi TIGA harness berturut-turut gagal mereproduksinya — semuanya
 * karena alasan yang sama: mereka menjalankan UI dalam keadaan yang bukan
 * keadaan pemakaian (panel tersembunyi, layar editor tak pernah dibuka), jadi
 * bagian termahal tak pernah terjadi. Angka yang mereka hasilkan (296 ms,
 * 104 ms) mengukur produk yang berbeda dari yang dilihat user.
 *
 * Jadi arahnya dibalik: alih-alih menirukan pemakaian, biarkan APLIKASI
 * melaporkan sendiri. Sekali user memicu freeze-nya, kita langsung tahu utas
 * mana dan langkah mana.
 *
 * CARA KERJA. Satu `setInterval` berdenyut tetap. Kalau jarak antar-denyut jauh
 * melebihi periodenya, berarti utas itu SIBUK — timer tak bisa dijadwalkan.
 * Itu definisi paling jujur dari "membeku" seperti yang dirasakan user, dan ia
 * tak butuh instrumentasi di dalam kode yang lambat.
 *
 * Modul ini POLOS: tanpa DOM, tanpa Electron. Satu berkas dipakai main DAN
 * renderer supaya definisi "stall" tak punya dua versi yang menyimpang.
 */

const AMBANG_MS = 400;      // di bawah ini masih terasa seperti jeda biasa
const PERIODE_MS = 50;

function buatDetektor(opts) {
    opts = opts || {};
    const utas = opts.utas || 'tak-dikenal';
    const ambang = opts.ambang || AMBANG_MS;
    const lapor = typeof opts.lapor === 'function' ? opts.lapor : function () {};

    // Tumpukan penanda: kode menandai apa yang sedang ia kerjakan, dan detektor
    // membaca tumpukan itu saat stall terjadi. Tumpukan (bukan satu nilai)
    // karena pekerjaan bisa bersarang — apply memanggil reload preview.
    const tumpukan = [];
    let timer = null;
    let terakhir = 0;

    function mulai() {
        if (timer) return;
        terakhir = Date.now();
        timer = setInterval(function () {
            const kini = Date.now();
            const jeda = kini - terakhir;
            terakhir = kini;
            if (jeda < ambang) return;
            lapor({
                utas: utas,
                waktu: new Date(kini).toISOString(),
                stallMs: jeda - PERIODE_MS,   // buang periode denyut itu sendiri
                sedangBerjalan: tumpukan.slice(),
            });
        }, PERIODE_MS);
        if (timer && typeof timer.unref === 'function') timer.unref();   // jangan tahan proses
    }

    function berhenti() {
        if (timer) { clearInterval(timer); timer = null; }
    }

    /**
     * Tandai satu pekerjaan. Kembalikan fungsi penutup.
     *
     * Penutupnya WAJIB dipanggil di semua jalur keluar — termasuk error. Kalau
     * tidak, penanda menggantung dan tiap stall berikutnya dituduhkan padanya.
     * Pemakai disarankan memakai `sekitar()` di bawah supaya tak perlu ingat.
     */
    function tandai(nama) {
        const entri = { nama: String(nama), mulai: Date.now() };
        tumpukan.push(entri);
        let sudah = false;
        return function selesai() {
            if (sudah) return;
            sudah = true;
            const i = tumpukan.indexOf(entri);
            if (i >= 0) tumpukan.splice(i, 1);
        };
    }

    /** Bungkus fungsi sinkron dengan penanda — penutupnya dijamin lewat finally. */
    function sekitar(nama, fn) {
        const selesai = tandai(nama);
        try { return fn(); } finally { selesai(); }
    }

    return { mulai, berhenti, tandai, sekitar, _tumpukan: tumpukan };
}

module.exports = { buatDetektor, AMBANG_MS, PERIODE_MS };
