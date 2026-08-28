// === novelFontEditor.js ===
// Font global novel — penghuni section "Tampilan" di view Profil Novel.
// Backend: IPC novel-font:list / :set / :add-file (vn-engine/novel-font.js).
//
// Tiga keputusan bentuk, dan alasannya:
//
// 1) BERLAKU LANGSUNG, bukan menunggu Save. Pilihannya bukan field melainkan
//    BERKAS (`novel-font.css`) — sekelas "Terapkan Template Hub", yang juga
//    langsung. Menaruhnya di alur Save justru menipu: preview Hub baru bisa
//    memakai fontnya SESUDAH berkasnya ada, jadi "tersimpan" dan "terlihat"
//    akan berbeda waktu tanpa penjelasan apa pun di layar.
//
// 2) PREVIEW MEMAKAI FONT YANG SAMA. Dropdown yang cuma menyebut nama font
//    memaksa kreator menerapkannya dulu untuk tahu wujudnya — persis keluhan
//    "template tak mengubah apa pun di preview". Baris contoh di bawah
//    dropdown memakai `stack` yang sama persis dengan yang ditulis ke CSS.
//
// 3) BATASNYA DIKATAKAN, BUKAN DISEMBUNYIKAN. Novel yang hub-nya masih legacy
//    (`index.html`, bukan hub code-first) tidak ikut — backend melaporkannya
//    lewat `hubDiperbarui`, dan kartu ini menuliskannya apa adanya.

(function () {
    'use strict';

    const { ipcRenderer } = require('electron');

    const el = (id) => document.getElementById(id);

    let _novel = null;
    let _opsi = [];

    const SUMBER_LABEL = {
        bundel: 'Ikut aplikasi',
        sistem: 'Font sistem',
        kreator: 'Berkasmu'
    };

    // Nilai <option> = "sumber:id". Keduanya dibutuhkan backend, dan id sendiri
    // tidak unik antar-sumber (berkas kreator bernama "lexend.woff2" bukan hal
    // yang mustahil).
    function nilai(o) { return o.sumber + ':' + o.id; }

    function pecah(v) {
        const i = String(v || '').indexOf(':');
        if (i < 0) return null;
        return { sumber: v.slice(0, i), id: v.slice(i + 1) };
    }

    function render(active) {
        const select = el('novel-font-select');
        if (!select) return;

        select.innerHTML = '';
        const kosong = document.createElement('option');
        kosong.value = '';
        kosong.textContent = 'Bawaan template';
        select.appendChild(kosong);

        ['bundel', 'sistem', 'kreator'].forEach(function (sumber) {
            const anggota = _opsi.filter(function (o) { return o.sumber === sumber; });
            if (!anggota.length) return;
            const grup = document.createElement('optgroup');
            grup.label = SUMBER_LABEL[sumber] || sumber;
            anggota.forEach(function (o) {
                const opt = document.createElement('option');
                opt.value = nilai(o);
                opt.textContent = o.label;
                grup.appendChild(opt);
            });
            select.appendChild(grup);
        });

        select.value = active ? (active.sumber + ':' + active.id) : '';
        // Pilihan tersimpan yang berkasnya sudah tidak ada (font kreator dihapus
        // manual) tidak akan cocok dengan option mana pun; <select> lalu jatuh ke
        // string kosong. Katakan, jangan diam.
        if (active && select.value === '') {
            catat('Font yang tersimpan (' + active.id + ') tidak ditemukan lagi di folder novel. Pilih ulang, atau kembalikan berkasnya.');
        } else {
            terapkanPreview(select.value);
        }
    }

    function catat(teks) {
        const note = el('novel-font-note');
        if (note) note.textContent = teks || '';
    }

    // Contoh di layar memakai `stack` yang SAMA dengan yang ditulis ke CSS.
    // Untuk font kreator, berkasnya belum tentu ter-`@font-face` di jendela
    // editor — jadi katakan itu daripada memperlihatkan fallback diam-diam.
    function terapkanPreview(value) {
        const contoh = el('novel-font-preview');
        if (!contoh) return;
        const pilih = pecah(value);
        const o = pilih && _opsi.filter(function (x) {
            return x.sumber === pilih.sumber && x.id === pilih.id;
        })[0];

        if (!o) {
            contoh.style.fontFamily = '';
            catat('Tiap template Hub memakai fontnya sendiri, dan VN Player memakai Lexend.');
            return;
        }

        contoh.style.fontFamily = o.stack;
        if (o.sumber === 'kreator') {
            catat(o.catatan + ' — contoh di atas mungkin belum memperlihatkan wujud aslinya sampai kamu membuka preview Hub atau Player.');
        } else {
            catat(o.catatan || '');
        }
    }

    async function muat(novelTitle) {
        _novel = novelTitle || null;
        const select = el('novel-font-select');
        if (!select) return;

        if (!_novel) {
            _opsi = [];
            render(null);
            return;
        }

        try {
            const res = await ipcRenderer.invoke('novel-font:list', { novelTitle: _novel });
            if (!res || !res.success) {
                catat('Daftar font tidak bisa dibaca: ' + ((res && res.message) || 'alasan tak diketahui'));
                return;
            }
            _opsi = res.options || [];
            render(res.active || null);
        } catch (e) {
            console.error('[VN NovelFont] Gagal memuat daftar font:', e);
            catat('Daftar font tidak bisa dibaca.');
        }
    }

    async function terapkan(value) {
        if (!_novel) return;
        const pilih = pecah(value);
        try {
            const res = await ipcRenderer.invoke('novel-font:set', {
                novelTitle: _novel,
                sumber: pilih ? pilih.sumber : null,
                id: pilih ? pilih.id : null
            });
            if (!res || !res.success) {
                if (typeof showNotification === 'function') {
                    showNotification((res && res.message) || 'Gagal menyimpan font.', 'error');
                }
                return;
            }
            terapkanPreview(value);
            if (typeof showNotification === 'function') showNotification(res.message, 'success');
            // Hub legacy (`index.html`) tak punya tautan ke novel-font.css, jadi
            // fontnya hanya berlaku di Player. Itu batas nyata — sebutkan.
            if (!res.hubDiperbarui) {
                catat('Font berlaku di VN Player. Hub novel ini belum berbentuk hub code-first, jadi ia belum ikut — terapkan sebuah Template Hub untuk membuatnya ikut.');
            }
        } catch (e) {
            console.error('[VN NovelFont] Gagal menyimpan font:', e);
            if (typeof showNotification === 'function') showNotification('Gagal menyimpan font: ' + e.message, 'error');
        }
    }

    async function tambahBerkas() {
        if (!_novel) return;
        try {
            const res = await ipcRenderer.invoke('novel-font:add-file', { novelTitle: _novel });
            if (!res || res.canceled) return;
            if (!res.success) {
                if (typeof showNotification === 'function') {
                    showNotification(res.message || 'Gagal menambah font.', 'error');
                }
                return;
            }
            _opsi = res.options || [];
            render(res.active || null);
            // Berkas yang baru disalin langsung dipilihkan: menyalin font lalu
            // membiarkan dropdown tak berubah membuat orang mengira gagal.
            const baru = _opsi.filter(function (o) {
                return o.sumber === 'kreator' && o.id === res.file;
            })[0];
            if (baru) {
                const select = el('novel-font-select');
                if (select) select.value = nilai(baru);
                await terapkan(nilai(baru));
            }
        } catch (e) {
            console.error('[VN NovelFont] Gagal menambah berkas font:', e);
        }
    }

    function pasang() {
        const select = el('novel-font-select');
        if (select && !select._vnFontBound) {
            select._vnFontBound = true;
            select.addEventListener('change', function () { terapkan(select.value); });
        }
        const tombol = el('novel-font-add-btn');
        if (tombol && !tombol._vnFontBound) {
            tombol._vnFontBound = true;
            tombol.addEventListener('click', tambahBerkas);
        }
    }

    // Dipanggil hubEditor.js saat novel dimuat (pola sama dengan _refreshAchievementsCard).
    window._refreshNovelFontCard = function (novelTitle) {
        pasang();
        return muat(novelTitle);
    };

    pasang();
    console.log('[VN NovelFont] Module dimuat.');
})();
