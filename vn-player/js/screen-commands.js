/**
 * screen-commands.js — Command bawaan untuk LAYAR tambahan engine.
 *
 * `kartu_judul` & `buka_galeri` dulu hidup di `extensions/` milik template
 * "Judul & Galeri". Menaikkannya jadi kosakata BAWAAN punya dua alasan:
 *
 *  1. Layarnya sendiri kini bawaan (`player.html` → scene `judul` & `galeri`),
 *     dan layar tanpa cara menyalakannya cuma markup mati. Command `scene`
 *     generik bisa menampilkannya, tapi tak bisa MENGISI teks kartunya —
 *     justru bagian yang membuat kartu judul berguna.
 *  2. Kalau ia tetap di extensions, tiap novel baru lahir membawa berkas JS
 *     contoh yang bukan tulisan kreatornya.
 *
 * Keduanya deklaratif & editor-first (params JSON, nol string yang di-eval),
 * jadi ia memang muat sebagai stock vocabulary.
 *
 * KONTRAK COMMAND — wajib dipenuhi di SEMUA jalur, termasuk error:
 *   handler(data, vnapi) → akhiri dengan `vnapi.ipc.send('vn-engine:request-next-line')`.
 *   Lupa = cerita macet permanen (engine punya watchdog 8 dtk yang meneriakkannya).
 *   Kalau handler menunggu pemain (bukan timer pendek), panggil
 *   `vnapi.markInteractive()` supaya watchdog tak salah-alarm.
 */
(function () {
    if (typeof VNRegistry === 'undefined' || !VNRegistry.register) return;

    /** params boleh string JSON atau objek — dua-duanya dipakai novel nyata. */
    function bacaParams(data, namaCommand) {
        var p = data && data.params;
        try {
            if (typeof p === 'string') p = p.trim() ? JSON.parse(p) : {};
        } catch (e) {
            console.warn('[VNScreens] params ' + namaCommand + ' bukan JSON valid:', data.params);
            p = {};
        }
        return p || {};
    }

    function scene(nama) {
        return document.querySelector('[data-player-scene="' + nama + '"]');
    }

    /**
     * `kartu_judul` — kartu judul di TENGAH cerita (pergantian babak, lompatan
     * waktu, judul chapter di awal).
     *
     *   { "type": "custom", "command": "kartu_judul",
     *     "params": "{\"judul\":\"Bab 2\",\"sub\":\"tiga hari kemudian\",\"durasi\":2200}" }
     *
     *   judul  teks besar                     (default: teks yang sudah ada di markup)
     *   sub    baris kecil di bawahnya        (default: ikut markup; "" mengosongkan)
     *   durasi lama tampil dalam ms           (default 2200)
     *   tunggu "klik" → tampil sampai pemain klik, `durasi` diabaikan
     */
    VNRegistry.register('command', 'kartu_judul', function (data, vnapi) {
        var p = bacaParams(data, 'kartu_judul');
        var lanjut = function () { vnapi.ipc.send('vn-engine:request-next-line'); };

        var el = scene('judul');
        if (!el) {
            // Scene-nya dibuang/diganti nama di player.html kreator — itu haknya.
            // Jangan menghentikan cerita karena hiasan tak ada.
            console.warn('[VNScreens] scene "judul" tak ada di player ini — kartu judul dilewati.');
            lanjut();
            return;
        }

        var teks = el.querySelector('[data-judul-teks]');
        var sub = el.querySelector('[data-judul-sub]');
        if (teks && p.judul != null) teks.textContent = String(p.judul);
        if (sub && p.sub != null) sub.textContent = String(p.sub);

        VNPlayer.scene.show('judul');

        var tutup = function () {
            VNPlayer.scene.hide();
            lanjut();
        };

        if (String(p.tunggu || '').toLowerCase() === 'klik') {
            vnapi.markInteractive();   // menunggu pemain = di luar wewenang watchdog
            el.addEventListener('click', function sekali() {
                el.removeEventListener('click', sekali);
                tutup();
            });
            return;
        }

        var durasi = Number(p.durasi);
        if (!isFinite(durasi) || durasi <= 0) durasi = 2200;
        if (durasi >= 7000) vnapi.markInteractive();   // lebih lama dari watchdog, tapi sah
        setTimeout(tutup, durasi);
    }, {
        description: 'Tampilkan kartu judul (judul, sub, durasi/tunggu) lalu lanjut.',
        category: 'layar'
    });

    /**
     * `buka_galeri` — buka galeri dari DALAM cerita; cerita lanjut sesudah
     * pemain menutupnya.
     *
     *   { "type": "custom", "command": "buka_galeri" }
     *
     * Galeri juga bisa dibuka dari hub/menu tanpa command ini. Yang membedakan
     * adalah arti "Kembali": dari cerita ia kembali ke CERITA, dari hub ia
     * kembali ke hub (itu yang dikerjakan `data-scene-action="hub"`).
     */
    VNRegistry.register('command', 'buka_galeri', function (data, vnapi) {
        var lanjut = function () { vnapi.ipc.send('vn-engine:request-next-line'); };

        var el = scene('galeri');
        if (!el) {
            console.warn('[VNScreens] scene "galeri" tak ada di player ini — dilewati.');
            lanjut();
            return;
        }

        var tombol = el.querySelector('[data-galeri-tutup]');
        if (!tombol) {
            console.warn('[VNScreens] scene "galeri" tanpa [data-galeri-tutup] — ' +
                'pemain takkan bisa menutupnya, jadi galeri tidak dibuka.');
            lanjut();
            return;
        }

        vnapi.markInteractive();
        VNPlayer.scene.show('galeri');

        // Dipasang di sini, bukan sekali di boot: selama cerita yang membuka
        // galeri, "Kembali" berarti kembali ke CERITA. Handler engine untuk
        // `data-scene-action="hub"` sengaja dicegat selama mode ini.
        var kembali = function (e) {
            e.stopPropagation();
            e.preventDefault();
            tombol.removeEventListener('click', kembali, true);
            VNPlayer.scene.hide();
            lanjut();
        };
        tombol.addEventListener('click', kembali, true);
    }, {
        description: 'Buka galeri; cerita lanjut setelah pemain menutupnya.',
        category: 'layar'
    });
})();
