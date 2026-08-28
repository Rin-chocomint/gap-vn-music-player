// ============================================================
// DIAGNOSTICS (UX-B07) — "Masalah & Log Preview"
//
// Yang dibutuhkan kreator bukan konsol mentah, melainkan jawaban atas satu
// pertanyaan: **apa yang barusan gagal, dan di berkas/scene mana?** Karena itu
// bawaannya hanya Warning/Error; Info dan pesan konsol mentah baru muncul di
// mode Developer.
//
// TIGA BATAS YANG TIDAK BOLEH DILONGGARKAN.
//
// Aplikasi ini baru saja menutup bug OOM di renderer editor (9 detik GC, Oilpan
// habis — lihat docs/investigasi-freeze-oom-2026-08-01.md), dan panel log adalah
// jalur paling gampang menghidupkannya kembali: satu `console-message` di dalam
// loop preview bisa melahirkan ribuan entri per detik, masing-masing dengan
// stringnya sendiri.
//
//   1. RING BUFFER — maksimum `BATAS` entri. Yang terlama dibuang, bukan
//      ditumpuk. Buffer tak berbatas hanyalah kebocoran yang ditulis rapi.
//   2. DEDUP — pesan identik yang berulang dalam `JENDELA_DEDUP` menaikkan
//      penghitung entri yang sudah ada, bukan menambah entri baru. Inilah yang
//      menjinakkan banjir konsol.
//   3. POTONG — pesan & stack dipotong. Satu stack trace dari extension yang
//      rusak bisa puluhan KB, dan menyimpan 200 di antaranya bukan diagnosa.
//
// Modul ini MURNI (nol DOM, nol IPC) supaya bisa diuji apa adanya — dan supaya
// panelnya boleh berganti bentuk tanpa menyentuh aturan penyimpanannya.
// ============================================================
(function () {
    'use strict';

    window.VN = window.VN || {};

    var BATAS = 200;
    var JENDELA_DEDUP = 5000;     // ms
    var MAKS_PESAN = 500;         // karakter
    var MAKS_STACK = 1200;        // karakter

    var LEVEL = ['error', 'warning', 'info'];

    var _items = [];              // terlama → terbaru
    var _nomor = 0;
    var _pendengar = [];

    function _potong(teks, maks) {
        var s = String(teks == null ? '' : teks).replace(/\s+$/, '');
        return s.length > maks ? s.slice(0, maks) + ' …' : s;
    }

    function _levelSah(v) {
        return LEVEL.indexOf(v) >= 0 ? v : 'info';
    }

    /** Identitas dedup: sumber + level + pesan + konteks yang sama = kejadian yang sama. */
    function _kunci(it) {
        // JSON, bukan gabungan berpemisah: pesan kreator boleh memuat karakter
        // apa pun, jadi pemisah apa pun bisa bertabrakan. (Versi pertama fungsi ini
        // sempat memakai byte NUL sebagai pemisah — aman secara logika, tetapi byte
        // itu membuat berkasnya terbaca BINER oleh grep dan alat lain.)
        return JSON.stringify([it.sumber, it.level, it.pesan, it.konteksKunci || '']);
    }

    function _konteksKunci(k) {
        if (!k) return '';
        return [k.file || '', k.scene || '', k.baris == null ? '' : k.baris].join('/');
    }

    function _beritahu() {
        for (var i = 0; i < _pendengar.length; i++) {
            try { _pendengar[i](); } catch (e) { /* satu pendengar rusak tak boleh membungkam sisanya */ }
        }
    }

    /**
     * Catat satu kejadian.
     * @param {{sumber:string, level?:string, pesan:string, konteks?:object, stack?:string}} masuk
     * @returns {object|null} entri (baru atau yang dinaikkan penghitungnya)
     */
    function catat(masuk) {
        if (!masuk || !masuk.pesan) return null;
        var sekarang = Date.now();
        var it = {
            id: 0,
            sumber: String(masuk.sumber || 'lain'),
            level: _levelSah(masuk.level),
            pesan: _potong(masuk.pesan, MAKS_PESAN),
            konteks: masuk.konteks || null,
            konteksKunci: _konteksKunci(masuk.konteks),
            stack: masuk.stack ? _potong(masuk.stack, MAKS_STACK) : '',
            waktu: sekarang,
            waktuAkhir: sekarang,
            jumlah: 1
        };

        // Dedup: cari kejadian yang SAMA paling akhir. Ditelusur dari belakang
        // karena banjir pesan selalu berdekatan — pencarian berhenti cepat.
        var kunci = _kunci(it);
        for (var i = _items.length - 1; i >= 0; i--) {
            if (_kunci(_items[i]) !== kunci) continue;
            if (sekarang - _items[i].waktuAkhir > JENDELA_DEDUP) break;
            _items[i].jumlah++;
            _items[i].waktuAkhir = sekarang;
            _beritahu();
            return _items[i];
        }

        it.id = ++_nomor;
        _items.push(it);
        _pangkas();
        _beritahu();
        return it;
    }

    /**
     * Pangkas ke BATAS — dan saat harus membuang, INFO dikorbankan lebih dulu.
     *
     * Tanpa aturan ini satu preview yang cerewet di konsol (ratusan pesan info per
     * detik, semuanya berbeda sehingga lolos dedup) akan mendesak keluar justru
     * error yang sedang dicari kreator. Buffer penuh berisi kabar remeh adalah
     * kegagalan yang lebih halus daripada buffer yang meledak, tapi tetap kegagalan.
     */
    function _pangkas() {
        var lebih = _items.length - BATAS;
        if (lebih <= 0) return;
        var sisa = [];
        for (var i = 0; i < _items.length; i++) {
            if (lebih > 0 && _items[i].level === 'info') { lebih--; continue; }
            sisa.push(_items[i]);
        }
        // Masih kelebihan (semuanya error/warning) → yang terlama yang keluar.
        if (lebih > 0) sisa.splice(0, lebih);
        _items = sisa;
    }

    /**
     * Daftar entri, terbaru dulu.
     * @param {{sumber?:string, semuaLevel?:boolean}} [opsi] `semuaLevel` = mode Developer.
     */
    function daftar(opsi) {
        var o = opsi || {};
        var out = [];
        for (var i = _items.length - 1; i >= 0; i--) {
            var it = _items[i];
            if (o.sumber && it.sumber !== o.sumber) continue;
            if (!o.semuaLevel && it.level === 'info') continue;
            out.push(it);
        }
        return out;
    }

    /** Hitungan per level untuk badge. */
    function ringkasan(sumber) {
        var r = { error: 0, warning: 0, info: 0 };
        for (var i = 0; i < _items.length; i++) {
            var it = _items[i];
            if (sumber && it.sumber !== sumber) continue;
            r[it.level] += it.jumlah;
        }
        return r;
    }

    /** Kosongkan — seluruhnya, atau satu sumber saja. */
    function bersihkan(sumber) {
        if (!sumber) _items = [];
        else _items = _items.filter(function (it) { return it.sumber !== sumber; });
        _beritahu();
    }

    function _jam(ms) {
        var d = new Date(ms);
        return String(d.getHours()).padStart(2, '0') + ':' +
            String(d.getMinutes()).padStart(2, '0') + ':' +
            String(d.getSeconds()).padStart(2, '0');
    }

    /** Teks siap tempel untuk laporan bug. Urutannya sama dengan yang di layar. */
    function teksSalin(opsi) {
        var baris = daftar(opsi).map(function (it) {
            var k = [];
            if (it.konteks && it.konteks.file) k.push(it.konteks.file);
            if (it.konteks && it.konteks.scene) k.push('scene:' + it.konteks.scene);
            if (it.konteks && it.konteks.baris != null) k.push('baris ' + it.konteks.baris);
            return '[' + _jam(it.waktuAkhir) + '] ' + it.level.toUpperCase() +
                ' (' + it.sumber + ')' + (k.length ? ' ' + k.join(' · ') : '') +
                (it.jumlah > 1 ? ' ×' + it.jumlah : '') + ' — ' + it.pesan +
                (it.stack ? '\n    ' + it.stack.split('\n').join('\n    ') : '');
        });
        return baris.join('\n');
    }

    /** @returns {Function} pembatal langganan. */
    function berlangganan(fn) {
        if (typeof fn !== 'function') return function () {};
        _pendengar.push(fn);
        return function () {
            var i = _pendengar.indexOf(fn);
            if (i >= 0) _pendengar.splice(i, 1);
        };
    }

    VN.Diagnostics = {
        BATAS: BATAS,
        JENDELA_DEDUP: JENDELA_DEDUP,
        catat: catat,
        daftar: daftar,
        ringkasan: ringkasan,
        bersihkan: bersihkan,
        teksSalin: teksSalin,
        berlangganan: berlangganan,
        // Seam uji: kebocoran pendengar tak punya gejala yang terlihat sampai
        // panel menggambar ke DOM yang sudah dibuang. Angka ini yang membuatnya
        // bisa dijaga.
        jumlahPendengar: function () { return _pendengar.length; },
        jam: _jam
    };
})();
