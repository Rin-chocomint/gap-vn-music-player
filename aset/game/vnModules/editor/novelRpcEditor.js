// === novelRpcEditor.js ===
// Gambar Discord Rich Presence per-novel — penghuni kedua section "Fitur Opsional".
// Nilainya tinggal di `novel-meta.json` (`discordRpc.largeImage`) dan ikut tombol
// Simpan Profil, sama seperti field metadata lain.
//
// Kenapa hanya http(s), dan kenapa itu dikatakan di layar:
//
//   Discord memuat gambar besar lewat proxy-nya sendiri (`mp:external/...`).
//   Berkas lokal, `data:`, dan `blob:` tak pernah bisa dijangkau proxy itu.
//   Menerimanya berarti menjanjikan sesuatu yang PASTI gagal, dan kegagalannya
//   tak punya gejala yang bisa dibaca kreator — ia cuma melihat ikon bawaan dan
//   tak punya cara tahu kenapa. Jadi ditolak di sini, dengan alasannya.
//
//   Konsekuensi yang paling mungkin mengejutkan: cover novel yang sudah ada di
//   folder TIDAK bisa dipakai langsung. Itu disebut di keterangan, bukan
//   dibiarkan ditemukan sendiri.
//
// Aturan penerimaannya sengaja SAMA dengan `sanitizeRpcLargeImage()` di main.js,
// yang tetap gerbang terakhir untuk semua sumber gambar RPC (musik maupun novel).
// Modul ini hanya memberi jawaban lebih awal.

(function () {
    'use strict';

    const el = (id) => document.getElementById(id);

    // Judul novel yang sedang dibuka. Dipakai tombol "Tes di Discord" sebagai
    // teks status. Diisi lewat `_refreshNovelRpcCard` saat novel dimuat.
    let _novel = null;

    const MAX_PANJANG = 512;

    function normalisasi(value) {
        if (typeof value !== 'string') return null;
        const bersih = value.trim();
        if (!bersih || bersih.length > MAX_PANJANG) return null;
        return /^https?:\/\/\S+$/i.test(bersih) ? bersih : null;
    }

    function alasanTolak(value) {
        if (typeof value !== 'string' || !value.trim()) return null;
        const bersih = value.trim();
        if (bersih.length > MAX_PANJANG) return 'Alamatnya terlalu panjang (maksimal ' + MAX_PANJANG + ' karakter).';
        if (/^(file|data|blob):/i.test(bersih)) {
            return 'Discord memuat gambar lewat internet, jadi berkas lokal tidak bisa dipakai. Unggah dulu gambarnya, lalu tempel alamat https-nya.';
        }
        if (!/^https?:\/\//i.test(bersih)) return 'Harus berupa alamat lengkap yang diawali https://';
        if (!/^https?:\/\/\S+$/i.test(bersih)) return 'Alamat tidak boleh memuat spasi.';
        return null;
    }

    function catat(teks, error) {
        const note = el('rpc-image-note');
        if (!note) return;
        note.textContent = teks || '';
        note.classList.toggle('is-error', !!error);
    }

    // =====================================================================
    // IZIN INTERNET
    // =====================================================================
    // Aplikasi memblokir semua request http(s) sampai pengguna mengizinkannya,
    // dan pemblokiran itu ikut mengenai PRATINJAU di kartu ini. Tanpa tombolnya
    // di sini, gejalanya adalah "pratinjau selalu gagal" tanpa petunjuk apa pun
    // — dan penyebabnya ada di menu lain, di halaman lain.
    //
    // BATASNYA: ini soal pratinjau. Discord mengambil gambarnya lewat proxy-nya
    // sendiri, jadi PEMAIN tidak perlu mengizinkan apa pun. Kartu ini menulis
    // batas itu, karena menyamakan keduanya akan membuat kreator mengira
    // novelnya menuntut izin internet dari pemain.
    // Barisnya AFORDANS SEMENTARA, bukan panel status permanen. Aturannya:
    //
    //   sudah diizinkan sejak kartu dibuka  → tak pernah ditampilkan
    //   belum diizinkan                     → tampil, dengan tombolnya
    //   baru diizinkan & TERBUKTI tersambung → ucapan pamit ✓, lalu menghilang
    //
    // Panel status yang selalu ada memakan perhatian untuk sesuatu yang sudah
    // beres. Yang layak menetap cuma keadaan yang masih menuntut tindakan.
    let _internetDiizinkan = null;   // null = belum diketahui
    let _barisTampil = false;

    function baris() { return el('rpc-net-row'); }

    function tampilkanBaris(tampil) {
        const b = baris();
        if (!b) return;
        b.classList.remove('is-leaving', 'is-done');
        b.hidden = !tampil;
        _barisTampil = !!tampil;
    }

    /** Ucapan pamit lalu menghilang. Dipakai HANYA setelah terbukti tersambung. */
    function pamitLaluHilang() {
        const b = baris();
        const dot = el('rpc-net-dot');
        const status = el('rpc-net-status');
        const tombol = el('rpc-net-allow');
        if (!b || !status) return;

        if (tombol) tombol.hidden = true;          // tugasnya selesai
        if (dot) dot.className = 'rpc-net-dot is-on';
        status.textContent = '✓ Terhubung ke internet — pratinjau sudah bisa memuat gambar.';
        b.classList.add('is-done');

        // Beri waktu membaca dulu, baru animasi keluar.
        setTimeout(function () {
            if (!b || b.hidden) return;
            b.classList.add('is-leaving');

            // `transitionend` bisa tidak terpicu (elemen tersembunyi, tab pindah,
            // prefers-reduced-motion). Jaring pengaman wajib, kalau tidak barisnya
            // tinggal separuh selamanya — pelajaran yang sama dengan showScene()
            // di vn-hub-runtime.js.
            let selesai = false;
            const tutup = function () {
                if (selesai) return;
                selesai = true;
                b.hidden = true;
                b.classList.remove('is-leaving', 'is-done');
                _barisTampil = false;
            };
            b.addEventListener('transitionend', function (e) {
                if (e.target === b && e.propertyName === 'opacity') tutup();
            }, { once: true });
            setTimeout(tutup, 700);
        }, 1400);
    }

    function renderInternet() {
        const dot = el('rpc-net-dot');
        const status = el('rpc-net-status');
        const tombol = el('rpc-net-allow');
        if (!status || !tombol) return;

        if (_internetDiizinkan === null) {
            // Belum tahu: jangan menampilkan apa pun. Baris "memeriksa…" yang
            // berkedip lalu hilang lebih mengganggu daripada tidak ada.
            tampilkanBaris(false);
            return;
        }
        if (_internetDiizinkan) {
            tampilkanBaris(false);
            return;
        }
        status.textContent = 'Akses internet diblokir, jadi pratinjau di bawah tidak akan memuat gambar.';
        tombol.hidden = false;
        if (dot) dot.className = 'rpc-net-dot is-off';
        tampilkanBaris(true);
    }

    async function periksaInternet() {
        try {
            const res = await ipcRenderer.invoke('internet:status');
            _internetDiizinkan = !!(res && res.allowed);
        } catch (e) {
            // Host lama tanpa handler: jangan menebak "diblokir" dan memasang
            // tombol yang tak melakukan apa-apa.
            _internetDiizinkan = null;
        }
        renderInternet();
    }

    /**
     * Bukti bahwa internet BENAR-BENAR tersambung, bukan sekadar izin diberikan.
     * Keduanya beda: izin bisa diberikan di komputer yang sedang offline, dan
     * memasang ✓ di situ adalah tanda centang yang berbohong.
     *
     * `no-cors` cukup — kita tidak membaca isinya, hanya perlu tahu permintaannya
     * sampai. `generate_204` dipilih karena jawabannya kosong (nol byte badan).
     */
    async function buktikanTersambung() {
        try {
            await fetch('https://www.gstatic.com/generate_204', {
                mode: 'no-cors',
                cache: 'no-store',
                signal: AbortSignal.timeout(5000)
            });
            return true;
        } catch (e) {
            return false;
        }
    }

    async function izinkanInternet() {
        const tombol = el('rpc-net-allow');
        const status = el('rpc-net-status');
        if (tombol) { tombol.disabled = true; tombol.textContent = 'Mengizinkan…'; }
        try {
            const res = await ipcRenderer.invoke('internet:allow');
            _internetDiizinkan = !!(res && res.allowed);

            if (!_internetDiizinkan) {
                if (status) status.textContent = 'Izin tidak diberikan. Coba lewat Options → Network.';
                return;
            }

            if (status) status.textContent = 'Memeriksa koneksi…';
            const tersambung = await buktikanTersambung();

            // Muat ulang pratinjau: sebelumnya ia gagal karena diblokir, dan
            // membiarkannya menampilkan kegagalan lama akan terbaca sebagai
            // "izinnya tidak berpengaruh".
            segarkan();

            if (tersambung) {
                pamitLaluHilang();
            } else {
                // Izinnya NYATA sudah diberikan — jangan katakan sebaliknya. Yang
                // gagal cuma pembuktiannya, dan itu bisa berarti komputernya
                // memang offline atau probe-nya yang terhalang. Tanpa ✓, dan
                // barisnya menetap supaya keadaannya tetap terlihat.
                if (tombol) tombol.hidden = true;
                const dot = el('rpc-net-dot');
                if (dot) dot.className = 'rpc-net-dot is-off';
                if (status) {
                    status.textContent = 'Izin sudah diberikan, tapi koneksi belum terbukti. ' +
                        'Pratinjau di bawah akan menunjukkan hasil sebenarnya.';
                }
            }
        } catch (e) {
            console.error('[VN NovelRpc] Gagal meminta izin internet:', e);
            if (typeof showNotification === 'function') {
                showNotification('Gagal mengizinkan akses internet: ' + e.message, 'error');
            }
        } finally {
            if (tombol) { tombol.disabled = false; tombol.textContent = 'Izinkan akses internet'; }
        }
    }

    function setStatus(teks, aktif) {
        const s = el('rpc-status');
        if (!s) return;
        s.textContent = teks;
        s.classList.toggle('is-active', !!aktif);
    }

    /**
     * Pratinjau memuat URL-nya SUNGGUHAN. Kotak yang cuma menampilkan alamat
     * sebagai teks tidak membuktikan apa pun — dan gambar yang alamatnya benar
     * tapi tak bisa diakses publik adalah kegagalan paling sering di fitur ini.
     * Memuatnya di sini membuat kreator melihatnya sebelum pemain melihatnya.
     */
    function segarkan() {
        const input = el('editor-rpc-large-image');
        const thumb = el('rpc-image-thumb');
        const img = el('rpc-image-preview');
        if (!input || !thumb || !img) return;

        const nilai = input.value;
        const bersih = normalisasi(nilai);
        const alasan = alasanTolak(nilai);

        periksaTautan(nilai);

        if (alasan) {
            catat(alasan, true);
            setStatus('Alamat tidak sah');
            img.removeAttribute('src');
            thumb.classList.remove('is-loaded', 'is-error');
            return;
        }

        if (!bersih) {
            catat('Kosong — status Discord memakai ikon bawaan aplikasi.');
            setStatus('Ikon bawaan');
            img.removeAttribute('src');
            thumb.classList.remove('is-loaded', 'is-error');
            return;
        }

        catat('Memuat pratinjau…');
        setStatus('Diatur', true);
        thumb.classList.remove('is-loaded', 'is-error');
        img.onload = function () {
            thumb.classList.add('is-loaded');
            thumb.classList.remove('is-error');
            // JANGAN menjanjikan Discord ikut berhasil. Pratinjau memuat URL apa
            // adanya; Discord memuatnya lewat bentuk proxy yang membuang parameter
            // query. Tautan bertanda tangan karena itu bisa TAMPIL di sini dan
            // tetap kosong di Discord — persis kasus yang membuat fitur ini
            // terlihat rusak tanpa sebab. Pakai tombol Tes untuk jawaban yang benar.
            catat('Gambar terbaca di sini. Itu belum menjamin Discord ikut memuatnya — pakai "Tes di Discord" untuk memastikan.');
        };
        img.onerror = function () {
            thumb.classList.remove('is-loaded');
            thumb.classList.add('is-error');
            // Ini BUKAN penolakan: alamatnya sah, cuma tak terjangkau dari sini.
            // Mengatakannya sebagai "tidak sah" akan menyesatkan.
            //
            // Dan bila aksesnya memang sedang diblokir aplikasi, sebutkan ITU —
            // menyuruh kreator memeriksa tautannya padahal masalahnya izin
            // internet akan mengirimnya mengejar bug yang tidak ada.
            if (_internetDiizinkan === false) {
                catat('Gambar tidak bisa dimuat karena akses internet aplikasi sedang diblokir. Tekan "Izinkan akses internet" di atas, lalu coba lagi.', true);
            } else {
                catat('Alamatnya sah, tapi gambarnya tidak bisa dimuat dari sini. Pastikan tautannya bisa dibuka publik (bukan halaman, melainkan berkas gambar langsung).', true);
            }
        };
        img.src = bersih;
    }

    // =====================================================================
    // PERINGATAN BENTUK TAUTAN
    // =====================================================================
    // Discord tidak memuat URL kita apa adanya: klien mengubahnya jadi bentuk
    // proxy `mp:external/<hash>/<skema>/<host>/<path>`. Bentuk itu menyimpan
    // SKEMA, HOST, dan PATH — **parameter query tidak ikut**.
    //
    // Itulah beda paling nyata antara cover musik yang TAMPIL dan gambar novel
    // yang kosong. Cover YouTube Music berbentuk
    //   https://lh3.googleusercontent.com/…=w512-h512      (nol query)
    // sementara tautan lampiran Discord berbentuk
    //   https://media.discordapp.net/…?ex=…&is=…&hm=…       (tanda tangan DI query)
    // Begitu query-nya hilang saat diproksikan, tanda tangannya ikut hilang dan
    // CDN menolaknya → ikon kosong.
    //
    // Ditambah satu masalah kedua khusus tautan Discord: `ex` adalah waktu
    // kedaluwarsa, dan umurnya cuma ~24 jam. Discord menyegarkan tanda tangan
    // untuk tautan yang dibuka DI DALAM Discord; URL yang kita simpan di
    // novel-meta.json tidak ikut disegarkan.
    //
    // Keduanya DIPERINGATKAN, bukan ditolak: URL-nya sah, dan menolaknya berarti
    // menebak lebih jauh dari yang bisa kita buktikan.
    function periksaTautan(nilai) {
        const warn = el('rpc-image-warn');
        if (!warn) return;
        warn.hidden = true;
        warn.textContent = '';

        const bersih = normalisasi(nilai);
        if (!bersih) return;

        let u;
        try { u = new URL(bersih); } catch (e) { return; }

        const pesan = [];

        // (1) Query string — sebab paling mungkin dari "ikon kosong".
        if (u.search && u.search.length > 1) {
            pesan.push('Alamat ini memakai parameter query (bagian sesudah "?"). ' +
                'Discord memuat gambar lewat bentuk proxy yang hanya membawa host dan path — ' +
                'parameternya ikut hilang. Tautan yang aksesnya BERGANTUNG pada parameter itu ' +
                '(tautan bertanda tangan) akan tampil sebagai ikon kosong. Pakai alamat yang ' +
                'berakhir langsung pada berkas gambar, tanpa "?".');
        }

        // (2) Tautan lampiran Discord — tanda tangannya juga kedaluwarsa.
        if (/(^|\.)discordapp\.(com|net)$/i.test(u.hostname)) {
            const ex = u.searchParams.get('ex');
            const kadaluarsa = ex ? new Date(parseInt(ex, 16) * 1000) : null;
            if (kadaluarsa && !isNaN(kadaluarsa.getTime())) {
                const sisaJam = (kadaluarsa - Date.now()) / 3600000;
                pesan.push(sisaJam <= 0
                    ? 'Tanda tangan tautan lampiran Discord ini juga SUDAH kedaluwarsa (' +
                      kadaluarsa.toLocaleString('id-ID') + ').'
                    : 'Tanda tangan tautan lampiran Discord ini juga berakhir ' +
                      kadaluarsa.toLocaleString('id-ID') + ' (±' + Math.round(sisaJam) + ' jam lagi).');
            }
            pesan.push('Unggah gambarnya ke layanan yang memberi tautan permanen tanpa parameter.');
        }

        if (!pesan.length) return;
        warn.hidden = false;
        warn.textContent = pesan.join(' ');
    }

    // =====================================================================
    // TES LANGSUNG KE DISCORD
    // =====================================================================
    // Tanpa ini, satu-satunya cara memeriksa hasilnya adalah simpan → keluar
    // editor → mainkan novel → lihat Discord. Dan kalau gambarnya tidak muncul,
    // kreator tak punya cara membedakan URL salah, Discord tak tersambung, atau
    // nilainya memang tak tersimpan.
    async function tesDiscord() {
        const tombol = el('rpc-test-btn');
        const note = el('rpc-test-note');
        const nilai = (el('editor-rpc-large-image') || {}).value || '';

        function lapor(teks, error) {
            if (!note) return;
            note.textContent = teks;
            note.classList.toggle('is-error', !!error);
        }

        if (tombol) { tombol.disabled = true; tombol.textContent = 'Mengirim…'; }
        try {
            const res = await ipcRenderer.invoke('novel-rpc:test', {
                novelTitle: _novel, largeImage: nilai.trim()
            });
            if (!res || !res.ok) {
                const alasan = res && res.alasan;
                lapor(alasan === 'nonaktif'
                    ? 'Discord RPC dimatikan di Options — nyalakan dulu.'
                    : 'Discord belum tersambung. Pastikan aplikasi Discord berjalan, lalu coba lagi.', true);
                return;
            }
            if (res.ditolakPenyaring) {
                lapor('Alamatnya ditolak penyaring, jadi yang terkirim ikon bawaan. Pastikan diawali https://', true);
                return;
            }
            lapor(res.terkirim === 'main_icon'
                ? 'Terkirim dengan ikon bawaan (kolom alamat kosong). Lihat status Discord-mu.'
                : 'Terkirim. Lihat status Discord-mu — bisa tertunda beberapa detik karena pembatasan laju.');
        } catch (e) {
            console.error('[VN NovelRpc] Tes Discord gagal:', e);
            lapor('Gagal mengirim tes: ' + e.message, true);
        } finally {
            if (tombol) { tombol.disabled = false; tombol.textContent = 'Tes di Discord'; }
        }
    }

    function render(rpc) {
        const input = el('editor-rpc-large-image');
        if (!input) return;
        input.value = (rpc && rpc.largeImage) || '';
        const note = el('rpc-test-note');
        if (note) { note.textContent = ''; note.classList.remove('is-error'); }
        segarkan();
    }

    function pasang() {
        const tombolNet = el('rpc-net-allow');
        if (tombolNet && !tombolNet._vnRpcBound) {
            tombolNet._vnRpcBound = true;
            tombolNet.addEventListener('click', izinkanInternet);
        }
        if (!window._vnRpcNetListener) {
            window._vnRpcNetListener = true;
            // Izin bisa juga diubah dari panel Options. Tanpa mendengarkan
            // siarannya, kartu ini akan menampilkan keadaan basi.
            ipcRenderer.on('internet:status-changed', function (e, data) {
                const sebelumnya = _internetDiizinkan;
                _internetDiizinkan = !!(data && data.allowed);

                // Diizinkan dari panel Options SELAGI barisnya terlihat: perlakukan
                // sama seperti ditekan dari sini — pamit lalu menghilang. Kalau
                // barisnya memang sudah tak ada, tak ada yang perlu dilakukan.
                if (_internetDiizinkan && sebelumnya === false && _barisTampil) {
                    buktikanTersambung().then(function (tersambung) {
                        segarkan();
                        if (tersambung) pamitLaluHilang();
                        else renderInternet();
                    });
                    return;
                }
                renderInternet();
            });
        }

        const tombolTes = el('rpc-test-btn');
        if (tombolTes && !tombolTes._vnRpcBound) {
            tombolTes._vnRpcBound = true;
            tombolTes.addEventListener('click', tesDiscord);
        }

        const input = el('editor-rpc-large-image');
        if (input && !input._vnRpcBound) {
            input._vnRpcBound = true;
            let timer = null;
            input.addEventListener('input', function () {
                // Ditunda sebentar: memuat gambar pada tiap ketukan tombol berarti
                // puluhan permintaan jaringan untuk satu kali menempel alamat.
                clearTimeout(timer);
                timer = setTimeout(segarkan, 400);
            });
            input.addEventListener('blur', segarkan);
        }
    }

    // Dibaca novelCrud.js saat Simpan Profil.
    window._novelRpcValue = function () {
        const input = el('editor-rpc-large-image');
        return input ? String(input.value || '').trim() : '';
    };
    // Ikut tanda tangan draft supaya "tidak ada perubahan" tetap jujur.
    window._novelRpcSignature = window._novelRpcValue;

    // Dipanggil hubEditor.js saat novel dimuat.
    window._refreshNovelRpcCard = function (novelTitle, rpc) {
        _novel = novelTitle || null;
        pasang();
        render(rpc);
        // Status internet diperiksa SESUDAH render supaya pesan gagal-muat
        // pertama sudah tahu apakah penyebabnya pemblokiran.
        return periksaInternet();
    };

    pasang();
    console.log('[VN NovelRpc] Module dimuat.');
})();
