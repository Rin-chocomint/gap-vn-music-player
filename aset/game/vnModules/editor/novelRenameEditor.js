// === novelRenameEditor.js ===
// Ganti nama novel — baris "Judul novel" di section Identitas Publikasi.
// Backend: IPC novel:rename (vn-engine/novel-crud.js), satu transaksi dengan
// rollback dan migrasi `storyTitle` di dalam tiap save slot.
//
// Kenapa ia AKSI, bukan field yang ikut tombol Simpan:
//
//   Judul novel ADALAH nama foldernya di disk (`resolveNovelPath(title)`).
//   Sebuah textbox berlabel "Judul" yang diam-diam memindahkan folder ketika
//   orang menekan Simpan adalah kejutan terburuk yang bisa dibuat editor ini —
//   apalagi karena Simpan di Profil juga menulis cover, video, dan metadata.
//   Batas transaksinya jadi kabur, dan rollback-nya tidak bisa dijanjikan.
//
//   Jadi: baris teks + tombol "Ganti Nama…", form yang harus dibuka sengaja,
//   dan tombol konfirmasi yang menyebut apa yang akan terjadi.
//
// Sesudah berhasil, editor TIDAK menambal belasan variabel global satu per satu.
// Ia memuat ulang novel dari disk (`loadNovelForEditing`) — prinsip yang sama
// dengan seluruh audit editor: editor MEMBACA kenyataan, bukan menebaknya.

(function () {
    'use strict';

    const { ipcRenderer } = require('electron');
    const el = (id) => document.getElementById(id);

    let _novel = null;

    function catat(teks, jenis) {
        const note = el('novel-rename-note');
        if (!note) return;
        note.textContent = teks || '';
        note.classList.toggle('is-error', jenis === 'error');
    }

    function tampilkanForm(buka) {
        const form = el('novel-rename-form');
        const tombol = el('novel-rename-btn');
        if (!form || !tombol) return;
        form.hidden = !buka;
        tombol.hidden = !!buka;
        if (buka) {
            const input = el('novel-rename-input');
            if (input) {
                input.value = _novel || '';
                input.focus();
                input.select();
            }
        }
    }

    function render(novelTitle) {
        _novel = novelTitle || null;
        const label = el('novel-title-current');
        if (label) label.textContent = _novel || '—';
        const tombol = el('novel-rename-btn');
        if (tombol) tombol.disabled = !_novel;
        tampilkanForm(false);
        catat('');
    }

    async function konfirmasi() {
        const input = el('novel-rename-input');
        const tombol = el('novel-rename-confirm');
        if (!input || !_novel) return;

        const baru = String(input.value || '').trim();
        if (!baru) { catat('Judul baru tidak boleh kosong.', 'error'); return; }
        if (baru === _novel) { tampilkanForm(false); return; }

        // Karakter yang tak sah untuk nama folder ditolak DI SINI juga, bukan
        // hanya di backend: pesan yang datang setelah perjalanan IPC terbaca
        // seperti kegagalan sistem, padahal ini sekadar salah ketik.
        if (/[<>:"/\\|?*]/.test(baru)) {
            catat('Judul tidak boleh memuat < > : " / \\ | ? *  — ia juga dipakai sebagai nama folder.', 'error');
            return;
        }

        if (tombol) { tombol.disabled = true; tombol.textContent = 'Mengganti...'; }
        try {
            const res = await ipcRenderer.invoke('novel:rename', {
                originalTitle: _novel,
                newTitle: baru
            });

            if (!res || !res.success) {
                catat((res && res.message) || 'Gagal mengganti nama.', 'error');
                return;
            }

            if (typeof showNotification === 'function') showNotification(res.message, 'success');
            tampilkanForm(false);

            // Muat ulang novel dari disk dengan nama barunya. Menambal
            // `currentlyEditing`, daftar novel, preview, dan jendela editor kode
            // satu per satu berarti menebak-nebak state; memuat ulang membacanya.
            const muat = (typeof loadNovelForEditing === 'function')
                ? loadNovelForEditing
                : window.loadNovelForEditing;
            if (typeof muat === 'function') {
                await muat(res.novelTitle);
            } else {
                // Tak ada jalan memuat ulang: jangan diam-diam menampilkan nama
                // lama seolah tak terjadi apa-apa.
                render(res.novelTitle);
                catat('Nama sudah diganti. Tutup dan buka lagi novel ini agar seluruh editor menyusul.');
            }

            if (res.hubLegacy) {
                catat('Hub lama novel ini masih memuat judul lama di markup-nya — buka Editor Kode untuk memperbaruinya.');
            }
        } catch (e) {
            console.error('[VN NovelRename] Gagal mengganti nama:', e);
            catat('Gagal mengganti nama: ' + e.message, 'error');
        } finally {
            if (tombol) { tombol.disabled = false; tombol.textContent = 'Ganti Nama'; }
        }
    }

    function pasang() {
        const tombol = el('novel-rename-btn');
        if (tombol && !tombol._vnRenameBound) {
            tombol._vnRenameBound = true;
            tombol.addEventListener('click', () => tampilkanForm(true));
        }
        const batal = el('novel-rename-cancel');
        if (batal && !batal._vnRenameBound) {
            batal._vnRenameBound = true;
            batal.addEventListener('click', () => { tampilkanForm(false); catat(''); });
        }
        const konfirm = el('novel-rename-confirm');
        if (konfirm && !konfirm._vnRenameBound) {
            konfirm._vnRenameBound = true;
            konfirm.addEventListener('click', konfirmasi);
        }
        const input = el('novel-rename-input');
        if (input && !input._vnRenameBound) {
            input._vnRenameBound = true;
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); konfirmasi(); }
                if (e.key === 'Escape') { e.preventDefault(); tampilkanForm(false); catat(''); }
            });
        }
    }

    // Dipanggil hubEditor.js saat novel dimuat (pola sama dengan _refreshAchievementsCard).
    window._refreshNovelIdentityCard = function (novelTitle) {
        pasang();
        render(novelTitle);
    };

    pasang();
    console.log('[VN NovelRename] Module dimuat.');
})();
