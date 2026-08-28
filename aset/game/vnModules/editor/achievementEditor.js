// === achievementEditor.js ===
// Achievements — penghuni pertama section "Extras" di view Profil Novel.
// Backend: IPC achievements:list / save-defs / reset (vn-engine/achievement-manager.js).
//
// Dua prinsip yang membentuk UI ini:
//
// 1) BENTUK MENGIKUTI KENYATAAN. Tidak ada switch "aktifkan achievements" —
//    sebuah switch akan jadi sumber kebenaran KEDUA yang bisa berselisih dengan
//    isi achievements.json (pelajaran FB15: switch bilang A, berkas bilang B).
//    Selama definisinya kosong, kartu ini cuma satu strip; menyimpan daftar
//    kosong menghapus achievements.json (backend sudah bersemantik begitu) —
//    itulah tombol "matikan" yang jujur.
//
// 2) JANGAN MENJANJIKAN LEBIH DARI YANG ENGINE LAKUKAN. `unlockFlag` hanya
//    disapu saat `achievements:list` dipanggil, dan pemanggilnya adalah HUB
//    (VNHub.achievements.list()). Tanpa layar hub, jalur otomatis itu tak pernah
//    menyala — kartu ini mengatakannya apa adanya, bukan menulis "OTOMATIS" polos.
//
// Catatan: pemuatan dari editor memakai { sweep: false } supaya sekadar MELIHAT
// definisi tidak ikut meng-unlock achievement di progres pemain.

(function () {
    'use strict';

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // State lokal: sedang membuat daftar baru (belum ada apa pun di disk).
    // Sengaja TIDAK menulis achievements.json kosong ke disk saat klik "Buat" —
    // berkas baru lahir kalau memang ada definisi yang disimpan.
    let _creating = false;
    let _knownFlags = [];
    let _achievementBaseline = null;
    let _achievementNovel = null;

    const el = (id) => document.getElementById(id);

    // Satu sumber untuk contoh yang ditampilkan DAN yang disalin. Ditulis
    // terpisah supaya keduanya tak bisa menyimpang: tombol Salin yang
    // memberikan teks berbeda dari yang terbaca di layar adalah jebakan.
    const CONTOH_PEMICU = '{ "type": "custom", "command": "unlock_achievement", "params": { "id": "ending_baik" } }';

    function salinContohPemicu(btn) {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            if (typeof showNotification === 'function') showNotification('Clipboard tak tersedia di sini.', 'error');
            return;
        }
        navigator.clipboard.writeText(CONTOH_PEMICU).then(function () {
            const teksLama = btn.textContent;
            btn.textContent = 'Tersalin';
            setTimeout(function () { btn.textContent = teksLama; }, 1500);
        }).catch(function () {
            if (typeof showNotification === 'function') showNotification('Gagal menyalin ke clipboard.', 'error');
        });
    }

    function buildRowHTML(def) {
        def = def || {};
        return `<div class="ach-row">
            <span class="ach-drag-handle" title="Seret untuk mengubah urutan tampil">⠿</span>
            <div class="ach-row-fields">
                <div class="ach-row-line">
                    <input type="text" class="script-input ach-icon" value="${esc(def.icon || '')}" placeholder="🏆" title="Ikon (emoji, opsional — default 🏆)">
                    <input type="text" class="script-input ach-id" value="${esc(def.id || '')}" placeholder="id_unik (wajib, dipakai di script)">
                    <input type="text" class="script-input ach-title" value="${esc(def.title || '')}" placeholder="Judul tampil">
                    ${def.unlocked ? '<span class="ach-unlocked-mark" title="Sudah terbuka di progres pemain">✅</span>' : ''}
                    <button type="button" class="ach-remove-btn" title="Hapus achievement ini">×</button>
                </div>
                <div class="ach-row-line">
                    <input type="text" class="script-input ach-desc" value="${esc(def.desc || '')}" placeholder="Deskripsi singkat (opsional)">
                    <input type="text" class="script-input ach-unlock" list="ach-known-flags" value="${esc(def.unlockFlag || '')}" placeholder="unlockFlag — butuh layar hub (opsional)" title="Terbuka otomatis saat hub-flag/story-var ini truthy — HANYA diperiksa ketika hub memanggil VNHub.achievements.list(). Tanpa layar hub, pakai command unlock_achievement di script.">
                    <label class="ach-hidden-label" title="Disembunyikan dari daftar sampai terbuka — anti-spoiler.">
                        <input type="checkbox" class="ach-hidden" ${def.hidden ? 'checked' : ''}> 🙈 Hidden
                    </label>
                </div>
            </div>
        </div>`;
    }

    function collectRows() {
        const rows = el('ach-rows');
        if (!rows) return [];
        return Array.from(rows.querySelectorAll('.ach-row')).map(row => ({
            id: row.querySelector('.ach-id').value,
            title: row.querySelector('.ach-title').value,
            desc: row.querySelector('.ach-desc').value,
            icon: row.querySelector('.ach-icon').value,
            unlockFlag: row.querySelector('.ach-unlock').value,
            hidden: row.querySelector('.ach-hidden').checked,
        }));
    }

    function achievementSnapshot() {
        return JSON.stringify(collectRows());
    }

    function achievementIsDirty() {
        return !!(
            currentlyEditing.novel &&
            _achievementNovel === currentlyEditing.novel &&
            _achievementBaseline !== null &&
            achievementSnapshot() !== _achievementBaseline
        );
    }

    function markAchievementClean() {
        _achievementBaseline = achievementSnapshot();
    }

    window._achievementIsDirty = achievementIsDirty;

    function addRow(def) {
        const rows = el('ach-rows');
        if (!rows) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = buildRowHTML(def || {});
        const row = wrap.firstElementChild;
        rows.appendChild(row);
        const idInput = row.querySelector('.ach-id');
        if (idInput) idInput.focus();
    }

    // ---- Render ----------------------------------------------------------

    function renderStrip() {
        const status = el('ach-status');
        const actions = el('ach-actions');
        const body = el('ach-body');
        if (!status || !actions || !body) return;

        status.textContent = 'belum dipakai';
        status.className = 'extras-item-status';
        actions.innerHTML = '<button type="button" id="ach-create-btn" class="extras-create-btn">Buat achievement pertama</button>';
        // Keadaan kosong inilah yang dikeluhkan tester: ia melihat panel bernama
        // "Extras" dan tak bisa membayangkan gunanya. Jadi yang ditampilkan bukan
        // definisi istilahnya, melainkan KAPAN orang memakainya dan langkah apa saja
        // yang menantinya — termasuk langkah yang belum mulus, supaya ia tak merasa
        // ditipu di tengah jalan.
        body.innerHTML =
            '<p class="extras-item-desc">Beri penghargaan saat pemain menemukan rahasia atau mencapai ending tertentu. ' +
            'Opsional — novel tanpa achievement berjalan persis seperti sekarang.</p>' +
            '<ol class="extras-flow">' +
            '<li>Definisikan achievement di sini</li>' +
            '<li>Tambahkan pemicunya di Story lewat entri <b>Custom Command</b></li>' +
            '<li>Pemain menerima toast begitu achievement terbuka</li>' +
            '</ol>' +
            '<p class="extras-item-desc">Langkah kedua masih ditulis manual — <b>belum ada pemilih pemicu siap pakai</b>. ' +
            'Perintah lengkapnya disediakan dan bisa disalin begitu kamu mulai.</p>';

        el('ach-create-btn').addEventListener('click', () => {
            _creating = true;
            renderEditor([]);
            addRow({});
        });
        markAchievementClean();
    }

    function renderEditor(defs) {
        const status = el('ach-status');
        const actions = el('ach-actions');
        const body = el('ach-body');
        if (!status || !actions || !body) return;

        const tersimpan = defs.length;
        status.textContent = tersimpan
            ? `${tersimpan} definisi · achievements.json`
            : 'baru — belum disimpan';
        status.className = 'extras-item-status' + (tersimpan ? ' is-active' : '');

        actions.innerHTML =
            '<button type="button" id="ach-add-btn" class="extras-add-btn">+ Tambah</button>' +
            '<button type="button" id="ach-save-btn" class="extras-save-btn">💾 Simpan Achievements</button>' +
            (tersimpan ? '<button type="button" id="ach-reset-btn" class="extras-danger-btn" title="Hapus achievements-state.json (progres pemain di mesin ini)">Reset Progres</button>' : '');

        body.innerHTML =
            '<p class="ach-note">' +
            '<b>Pemicu lanjutan.</b> Achievement tidak terbuka sendiri — bukaan dipicu dari Story lewat entri ' +
            '<b>Custom Command</b>. Belum ada pemilih siap pakai, jadi perintahnya ditulis tangan; ' +
            'salin baris di bawah lalu ganti <code>id</code>-nya. Pemain langsung melihat <b>toast 🏆</b> saat terbuka.' +
            '</p>' +
            '<div class="ach-snippet">' +
            '<code id="ach-snippet-text">' + esc(CONTOH_PEMICU) + '</code>' +
            '<button type="button" id="ach-copy-btn" class="extras-add-btn">Salin</button>' +
            '</div>' +
            '<p class="ach-note ach-note-warn">' +
            'Kolom <b>unlockFlag</b> di bawah baru diperiksa saat hub memanggil ' +
            '<code>VNHub.achievements.list()</code>. Selama novelmu belum punya layar hub yang ' +
            'memanggilnya, kolom itu tidak akan menyala sendiri — pakai command di atas. ' +
            'Layar daftar/koleksinya juga dibuat sendiri di hub (lihat pola Galeri di template showcase).' +
            '</p>' +
            '<div id="ach-rows"></div>' +
            `<datalist id="ach-known-flags">${_knownFlags.map(f => `<option value="${esc(f)}"></option>`).join('')}</datalist>`;

        const rows = el('ach-rows');
        rows.innerHTML = defs.map(buildRowHTML).join('');
        if (typeof Sortable === 'function') {
            new Sortable(rows, { animation: 150, handle: '.ach-drag-handle' });
        }
        rows.addEventListener('click', (e) => {
            const rm = e.target.closest('.ach-remove-btn');
            if (rm) rm.closest('.ach-row').remove();
        });

        const copyBtn = el('ach-copy-btn');
        if (copyBtn) copyBtn.addEventListener('click', () => salinContohPemicu(copyBtn));
        el('ach-add-btn').addEventListener('click', () => addRow({}));
        el('ach-save-btn').addEventListener('click', saveDefs);
        const resetBtn = el('ach-reset-btn');
        if (resetBtn) resetBtn.addEventListener('click', resetProgress);
        markAchievementClean();
    }

    // ---- Aksi ------------------------------------------------------------

    async function saveDefs() {
        if (!currentlyEditing.novel || _achievementNovel !== currentlyEditing.novel) return false;
        const entries = collectRows();
        const berisi = entries.filter(e => e.id && e.id.trim());

        // Daftar dikosongkan = mematikan fitur → backend menghapus achievements.json.
        // Destruktif, jadi minta konfirmasi dulu (kecuali memang belum pernah ada).
        if (berisi.length === 0) {
            const adaSebelumnya = el('ach-status').classList.contains('is-active');
            if (adaSebelumnya) {
                const ok = await showConfirmation(
                    'Daftar achievement kosong. Menyimpan akan MENGHAPUS achievements.json ' +
                    '(fitur dimatikan untuk novel ini). Progres pemain tidak ikut terhapus. Lanjutkan?'
                );
                if (!ok) return false;
            } else {
                _creating = false;
                await refresh(currentlyEditing.novel);
                return true;
            }
        }

        try {
            const result = await VN.Utils.invokeChecked(ipcRenderer, 'achievements:save-defs', {
                novelTitle: currentlyEditing.novel,
                defs: entries
            });
            showNotification(result.message || 'Achievements berhasil disimpan.', 'success');
            _creating = false;
            await refresh(currentlyEditing.novel);
            return true;
        } catch (error) {
            showNotification('Gagal menyimpan achievements: ' +
                ((error && error.message) || 'operasi IPC gagal'), 'error');
            return false;
        }
    }
    window.saveAchievementChanges = saveDefs;

    async function resetProgress() {
        if (!currentlyEditing.novel) return;
        const ok = await showConfirmation('Reset progres unlock (achievements-state.json)? Definisi achievement TIDAK ikut terhapus.');
        if (!ok) return;
        try {
            const result = await VN.Utils.invokeChecked(
                ipcRenderer,
                'achievements:reset',
                { novelTitle: currentlyEditing.novel }
            );
            showNotification(result.message || 'Progres achievement berhasil direset.', 'success');
            await refresh(currentlyEditing.novel);
        } catch (error) {
            showNotification('Gagal mereset progres achievement: ' +
                ((error && error.message) || 'operasi IPC gagal'), 'error');
        }
    }

    // ---- Pemuatan --------------------------------------------------------

    // sweep:false — membuka Profil TIDAK boleh ikut meng-unlock achievement
    // ber-unlockFlag; melihat bukan memainkan.
    async function refresh(novelTitle) {
        if (!el('extras-achievements')) return;
        _achievementNovel = novelTitle || null;
        if (!novelTitle) { _creating = false; renderStrip(); return; }

        let defs = [];
        try {
            const [listRes, flagRes] = await Promise.all([
                ipcRenderer.invoke('achievements:list', { novelTitle, sweep: false }),
                ipcRenderer.invoke('chapter-manifest:get', { novelTitle }),
            ]);
            if (listRes && listRes.success) defs = listRes.achievements || [];
            _knownFlags = (flagRes && flagRes.success && flagRes.knownFlags) || [];
        } catch (e) {
            console.error('[VN AchievementEditor] Gagal memuat achievements:', e);
        }

        if (defs.length === 0 && !_creating) renderStrip();
        else renderEditor(defs);
    }

    // Dipanggil hubEditor.js saat novel dimuat (pola sama dengan _setCoverCard).
    window._refreshAchievementsCard = function (novelTitle) {
        _creating = false;
        return refresh(novelTitle);
    };

    renderStrip();
    console.log('[VN AchievementEditor] Module dimuat.');
})();
