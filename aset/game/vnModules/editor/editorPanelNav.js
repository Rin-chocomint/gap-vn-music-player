// === editorPanelNav.js ===

        document.getElementById('show-add-chapter-input-btn').addEventListener('click', () => {
            // Buat item baru yang kosong
            const newChapterElement = createChapterItemElement('');
            editorChapterListEditable.appendChild(newChapterElement);

            // Langsung masuk ke mode edit untuk item baru ini
            enterEditMode(newChapterElement);
        });

        function enterEditMode(chapterItemElement) {
            chapterItemElement.classList.add('editing');
            chapterItemElement.querySelector('.chapter-name-display').style.display = 'none';
            chapterItemElement.querySelector('.chapter-item-controls').style.display = 'none';

            const input = chapterItemElement.querySelector('.chapter-name-input');
            input.style.display = 'block';
            input.focus();

            // Buat tombol Simpan (✓) dan Batal (✗)
            const actionButtons = document.createElement('div');
            actionButtons.className = 'chapter-edit-actions';
            actionButtons.innerHTML = `
            <button class="save-chapter-btn" title="Simpan">✓</button>
            <button class="cancel-edit-btn" title="Batal">✗</button>
        `;
            chapterItemElement.appendChild(actionButtons);
        }

        function exitEditMode(chapterItemElement) {
            chapterItemElement.classList.remove('editing');
            chapterItemElement.querySelector('.chapter-name-display').style.display = 'inline';
            chapterItemElement.querySelector('.chapter-item-controls').style.display = 'flex'; // atau 'block'
            chapterItemElement.querySelector('.chapter-name-input').style.display = 'none';

            const actionButtons = chapterItemElement.querySelector('.chapter-edit-actions');
            if (actionButtons) {
                actionButtons.remove();
            }
        }

        // Slice awal DocumentManager: chapter adalah dokumen berbeda. Canvas script
        // akan diganti total saat chapter lain dibuka, jadi keputusan Save/Discard/
        // Cancel wajib selesai sebelum loadChapterScript menyentuh DOM.
        async function resolveActiveScriptDraft(nextLabel) {
            const hasActiveScript = !!(currentlyEditing.chapter && window._scriptLoadedChapter);
            const scriptDirty = hasActiveScript &&
                typeof window._scriptIsDirty === 'function' &&
                window._scriptIsDirty();
            const translationDirty = typeof window._translationIsDirty === 'function' &&
                window._translationIsDirty();
            const dirtyLabels = [];
            if (scriptDirty) dirtyLabels.push('script');
            if (translationDirty) dirtyLabels.push('terjemahan');
            return VN.Utils.resolveDirtyDecision({
                dirty: dirtyLabels.length > 0,
                message: 'Draft ' + dirtyLabels.join(' dan ') + ' untuk "' + currentlyEditing.chapter +
                    '" belum disimpan. Simpan sebelum ' + nextLabel + '?',
                saveAction: async function () {
                    if (scriptDirty) {
                        if (typeof window.saveScriptChanges !== 'function' ||
                            await window.saveScriptChanges() !== true) return false;
                    }
                    if (translationDirty) {
                        if (typeof window.saveTranslationChanges !== 'function' ||
                            await window.saveTranslationChanges() !== true) return false;
                    }
                    return true;
                }
            });
        }
        window.resolveActiveScriptDraft = resolveActiveScriptDraft;

        async function openChapterWithDraftGuard(chapterName) {
            if (!chapterName) return false;
            if (currentlyEditing.chapter === chapterName &&
                window._scriptLoadedChapter === chapterName) return true;
            const allowed = await resolveActiveScriptDraft('membuka "' + chapterName + '"');
            if (!allowed) return false;
            await loadChapterScript(chapterName);
            return true;
        }
        window.openChapterWithDraftGuard = openChapterWithDraftGuard;

        function clearActiveChapterEditor() {
            if (typeof window.cancelPendingChapterLoad === 'function') window.cancelPendingChapterLoad();
            currentlyEditing.chapter = null;
            window._scriptLoadedChapter = null;
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.innerHTML = '';
            editingChapterName.textContent = 'Pilih chapter untuk diedit atau edit aset';
            workspaceControlsBar.style.display = 'none';
            const flowBtn = document.getElementById('btn-visualize-flow');
            if (flowBtn) flowBtn.style.display = 'none';
            if (typeof window._setChapterAssetsAvailable === 'function') window._setChapterAssetsAvailable(false);
        }

        // Event listener utama untuk semua tombol di dalam daftar chapter
        editorChapterListEditable.addEventListener('click', async (event) => {
            const target = event.target;
            if (target.classList.contains('add-sub-label-btn')) {
                const parentHeader = target.closest('.label-group-header');
                const parentContent = parentHeader.nextElementSibling; // .label-group-content
                if (parentContent && parentContent.classList.contains('label-group-content')) {
                    const newSubLabel = createSubLabelElement();
                    parentContent.appendChild(newSubLabel);
                    newSubLabel.querySelector('input').focus();
                }
                return;
            }
            const clearBtn = target.closest('.clear-input-btn-inside');
            if (clearBtn) {
                const wrapper = clearBtn.closest('.input-with-clear-wrapper');
                const textInput = wrapper?.querySelector('.script-input');
                if (textInput) {
                    textInput.value = '';
                    textInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                return;
            }
            const deleteBtn = target.closest('.delete-phase-btn, .delete-label-group-btn, .delete-dialogue-btn');

            const chapterItem = target.closest('.chapter-edit-item');
            if (!chapterItem) return;

            // --- Logika Tombol Hapus (×) ---
            if (target.classList.contains('delete-chapter-btn')) {
                const chapterName = chapterItem.dataset.originalName;
                const confirmed = await showConfirmation(`Yakin ingin menghapus chapter "${chapterName}" beserta semua isinya? Aksi ini tidak bisa dibatalkan.`);
                if (confirmed) {
                    const deletingActiveChapter = currentlyEditing.chapter === chapterName;
                    if (deletingActiveChapter) {
                        const allowed = await resolveActiveScriptDraft('menghapus "' + chapterName + '"');
                        if (!allowed) return;
                    }
                    let result;
                    try {
                        result = await VN.Utils.invokeChecked(
                            ipcRenderer,
                            'delete-chapter',
                            { novelTitle: currentlyEditing.novel, chapterName }
                        );
                    } catch (error) {
                        showNotification('Gagal menghapus chapter: ' + error.message, 'error');
                        return;
                    }
                    showNotification(result.message || 'Chapter berhasil dihapus.', 'success');
                    if (result.success) {
                        if (deletingActiveChapter) clearActiveChapterEditor();
                        await refreshChapterSidebar();
                    }
                }
            }

            // --- Logika Tombol Edit (✎) ---
            if (target.classList.contains('edit-chapter-btn')) {
                enterEditMode(chapterItem);
            }

            // --- Logika Tombol Batal (✗) ---
            if (target.classList.contains('cancel-edit-btn')) {
                // Jika ini chapter baru yang belum disimpan, hapus saja elemennya
                if (chapterItem.dataset.originalName === '') {
                    chapterItem.remove();
                } else {
                    exitEditMode(chapterItem);
                }
            }

            // --- Logika Tombol Simpan (✓) ---
            if (target.classList.contains('save-chapter-btn')) {
                const input = chapterItem.querySelector('.chapter-name-input');
                const oldName = chapterItem.dataset.originalName;
                const newName = input.value.trim();

                if (!newName) {
                    showNotification('Nama chapter tidak boleh kosong.', 'error');
                    return;
                }

                // Sanitize: strip path-unsafe characters
                const UNSAFE_CHARS = /[\\/:*?"<>|.]+/g;
                const sanitized = newName.replace(UNSAFE_CHARS, '').trim();
                if (!sanitized || sanitized !== newName) {
                    showNotification('Nama chapter tidak boleh mengandung karakter: \\ / : * ? " < > | .', 'error');
                    return;
                }

                const creatingChapter = oldName === '';
                const renamingActiveChapter = !creatingChapter && currentlyEditing.chapter === oldName;
                if (creatingChapter || renamingActiveChapter) {
                    const actionLabel = creatingChapter
                        ? 'membuat chapter "' + newName + '"'
                        : 'mengganti nama chapter menjadi "' + newName + '"';
                    const allowed = await resolveActiveScriptDraft(actionLabel);
                    if (!allowed) return;
                }

                let result;
                if (!creatingChapter && oldName === newName) { // Nama tidak berubah
                    exitEditMode(chapterItem);
                    return;
                }

                try {
                    if (creatingChapter) { // Ini adalah chapter baru
                        result = await VN.Utils.invokeChecked(
                            ipcRenderer,
                            'create-new-chapter',
                            { storyTitle: currentlyEditing.novel, newChapterName: newName }
                        );
                    } else { // Ini ganti nama chapter lama
                        result = await VN.Utils.invokeChecked(
                            ipcRenderer,
                            'rename-chapter',
                            { novelTitle: currentlyEditing.novel, oldChapterName: oldName, newChapterName: newName }
                        );
                    }
                } catch (error) {
                    showNotification('Gagal menyimpan struktur chapter: ' + error.message, 'error');
                    return;
                }

                showNotification(result.message || 'Struktur chapter berhasil disimpan.', 'success');

                if (result.success) {
                    // Segarkan hanya sidebar agar draft domain editor lain tidak ikut
                    // ter-reset oleh loadNovelForEditing penuh.
                    await refreshChapterSidebar();

                    // Chapter baru dan chapter aktif yang di-rename menjadi dokumen
                    // baru; buka hanya setelah keputusan draft selesai.
                    if (creatingChapter || renamingActiveChapter) {
                        await loadChapterScript(newName);
                    }
                }
            }
        });

        // Tampilkan overlay dan layar pilihan novel

        // Render daftar chapter di sidebar Story dari hasil 'get-chapter-list'.
        function renderChapterSidebar(chapterData) {
            currentNovelChapters = chapterData.mainChapters.concat(chapterData.sideStories);
            // `availableChapters` dipakai Hub/Player DAN onboarding. Sebelumnya ia
            // hanya diisi ketika Hub pertama dimuat; membuat chapter lalu hanya
            // merender ulang sidebar, sehingga langkah "Chapter Pertama" terus
            // membaca daftar lama yang kosong. Render sidebar adalah satu titik
            // canonical setelah semua mutasi chapter (buat/hapus/rename/manifest).
            window.availableChapters = currentNovelChapters.slice();
            if (typeof window._updateOnboardingState === 'function') {
                window._updateOnboardingState();
            }
            const meta = chapterData.chapterMeta || null;

            editorChapterListEditable.innerHTML = '';
            if (currentNovelChapters.length === 0) {
                editorChapterListEditable.innerHTML =
                    '<div class="empty-chapter-state">' +
                        '<p style="opacity: 0.6;">Belum ada chapter di novel ini.</p>' +
                    '</div>';
                return;
            }
            currentNovelChapters.forEach(chapter => {
                const chapterElement = createChapterItemElement(chapter);
                // Subtitle dari manifest chapters.json: judul tampil + penanda unlockFlag.
                if (meta && meta[chapter]) {
                    const m = meta[chapter];
                    const display = chapterElement.querySelector('.chapter-name-display');
                    const bits = [];
                    // Emoji dicabut dari sidebar (UX-B03). Keduanya dulu memikul
                    // pembeda makna, jadi tidak bisa cuma dibuang: yang menggantikan
                    // adalah kata. "terkunci:" bahkan lebih jelas daripada 🔑, yang
                    // sama-sama bisa dibaca "ini kuncinya" atau "ini terkunci".
                    if (m.title && m.title !== chapter) bits.push(m.title);
                    if (m.unlockFlag) bits.push('terkunci: ' + m.unlockFlag);
                    if (display && bits.length) {
                        const sub = document.createElement('span');
                        sub.className = 'chapter-manifest-subtitle';
                        sub.style.cssText = 'display:block; font-size:0.75em; color:#8fb996; opacity:0.9; margin-top:1px;';
                        sub.textContent = bits.join('  ·  ');
                        display.appendChild(sub);
                    }
                }
                chapterElement.addEventListener('click', async (e) => {
                    if (!e.target.closest('button')) {
                        await openChapterWithDraftGuard(chapter);
                    }
                });
                editorChapterListEditable.appendChild(chapterElement);
            });

        }

        // Segarkan sidebar tanpa mereset seluruh state editor (dipakai setelah
        // manifest disimpan/dihapus — loadNovelForEditing terlalu destruktif).
        async function refreshChapterSidebar() {
            if (!currentlyEditing.novel) return;
            const chapterData = await ipcRenderer.invoke('get-chapter-list', currentlyEditing.novel);
            renderChapterSidebar(chapterData);
        }

        function createChapterItemElement(chapterName) {
            const item = document.createElement('div');
            item.className = 'chapter-edit-item';
            item.dataset.originalName = chapterName; // Simpan nama asli untuk proses rename

            const safeName = chapterName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            item.innerHTML = `
            <span class="chapter-name-display">${safeName}</span>
            <input type="text" class="chapter-name-input" value="${safeName}" style="display: none;">
            <div class="chapter-item-controls">
                <button class="edit-chapter-btn" title="Ganti Nama">✎</button>
                <button class="delete-chapter-btn" title="Hapus Chapter">×</button>
            </div>
        `;
        return item;
        }


        // `opts.keepWorkspace` — penyegaran data SETELAH menyimpan, bukan perpindahan
        // novel. Tanpa ini, menyimpan di Profil memanggil fungsi ini secara penuh dan
        // efek sampingnya membuang pekerjaan user: chapter ter-deselect, isi
        // #script-editor-area dikosongkan (suntingan yang belum disimpan lenyap tanpa
        // peringatan), dan workspace dipaksa balik ke tab Story. Mode ini hanya
        // menyegarkan DATA dan membiarkan tempat kerja user apa adanya.
        async function loadNovelForEditing(novelTitle, opts) {
            opts = opts || {};
            // Hanya sah dipertahankan bila novelnya memang sama (bukan pindah novel).
            const keepWorkspace = opts.keepWorkspace === true && currentlyEditing.novel === novelTitle;

            if (window._novelOnboarding &&
                window._newNovelOnboardingNovel &&
                window._newNovelOnboardingNovel !== novelTitle &&
                typeof window._hideNewNovelOnboarding === 'function') {
                console.info('[Onboarding][Renderer] Mematikan onboarding karena novel berubah.', {
                    onboardingNovel: window._newNovelOnboardingNovel,
                    nextNovel: novelTitle
                });
                window._hideNewNovelOnboarding('berpindah ke novel lain');
            }

            console.info('[NovelEditor] Memuat novel.', {
                novelTitle: novelTitle,
                onboardingActive: !!window._novelOnboarding,
                onboardingNovel: window._newNovelOnboardingNovel || null
            });
            currentlyEditing.novel = novelTitle;
            if (!keepWorkspace) currentlyEditing.chapter = null;
            editingNovelName.textContent = novelTitle;

            // Bersihkan lint panel novel sebelumnya
            if (typeof window.clearLintPanel === 'function') window.clearLintPanel();

            // Reset tampilan
            editorChapterListEditable.innerHTML = '<p>Memuat chapters...</p>';
            document.getElementById('asset-explorer-content').innerHTML = '<p>Memuat aset global...</p>';
            if (!keepWorkspace) {
                if (typeof window.cancelPendingChapterLoad === 'function') window.cancelPendingChapterLoad();
                if (typeof window.destroyScriptEditorSortables === 'function') {
                    window.destroyScriptEditorSortables(scriptEditorArea);
                }
                if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
                if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
                scriptEditorArea.innerHTML = '';
                // Area dikosongkan → editor tak lagi memegang isi chapter mana pun.
                window._scriptLoadedChapter = null;
                editingChapterName.textContent = 'Pilih chapter untuk diedit atau edit aset';
                workspaceControlsBar.style.display = 'none';
                document.getElementById('btn-visualize-flow').style.display = 'none';
                if (typeof window._setChapterAssetsAvailable === 'function') window._setChapterAssetsAvailable(false);
            }

            // Panggil IPC untuk mendapatkan daftar chapter, lalu render sidebar.
            // Urutan mainChapters SUDAH mengikuti chapters.json bila novel punya
            // manifest (getChapterListData); chapterMeta dipakai untuk subtitle.
            const chapterData = await ipcRenderer.invoke('get-chapter-list', novelTitle);
            renderChapterSidebar(chapterData);

            // Daftar chapter dibangun ulang → sorotan chapter yang sedang dibuka ikut
            // hilang. Pasang kembali agar penyegaran tidak terasa seperti kehilangan konteks.
            if (keepWorkspace && currentlyEditing.chapter) {
                document.querySelectorAll('.chapter-edit-item').forEach(function (el) {
                    el.classList.toggle('active', el.dataset.originalName === currentlyEditing.chapter);
                });
            }

            const globalAssets = await ipcRenderer.invoke('get-global-novel-assets', novelTitle);
            renderAssetExplorer(globalAssets, 'asset-explorer-content');

            // Load storyDesc dan isi ke textarea
            const storyDescResult = await ipcRenderer.invoke('get-story-desc', novelTitle);
            const storyDescInput = document.getElementById('editor-story-desc');
            if (storyDescInput && storyDescResult.success) {
                storyDescInput.value = storyDescResult.storyDesc || '';
            }

            // Panggil untuk memuat form Hub Editor
            if (typeof loadHubEditorData === 'function') {
                await loadHubEditorData(novelTitle);
            }

            editorNovelSelectionScreen.style.display = 'none';
            editorMainScreen.style.display = 'flex';

            // Reset tampilan workspace ke kondisi default (tab Story + view 'script').
            // Tanpa ini, membuka novel lain setelah sebelumnya berada di Hub bisa
            // meninggalkan state desync — sidebar menyorot satu menu tetapi
            // workspace-body kosong. Reset di sini menyamakan dengan pengalaman
            // membuka editor pertama kali. (Alur create-novel menimpa ke Profil
            // setelahnya, jadi tidak terganggu.)
            // Dilewati saat keepWorkspace: user sedang menyimpan dari Profil/Hub/Player,
            // melempar dia ke tab Story justru membuang konteksnya sendiri.
            if (keepWorkspace) return;

            try {
                document.querySelectorAll('.sidebar-tab').forEach(function (t) { t.classList.remove('active'); });
                document.querySelectorAll('.sidebar-content').forEach(function (c) { c.classList.remove('active'); });
                var storyTab = document.querySelector('.sidebar-tab[data-tab="story"]');
                if (storyTab) storyTab.classList.add('active');
                var storyContent = document.getElementById('sidebar-content-story');
                if (storyContent) storyContent.classList.add('active');

                // Sub-nav Novel kembali ke Profil agar tidak menyorot Hub yang basi.
                document.querySelectorAll('[data-novel-section]').forEach(function (b) { b.classList.remove('active'); });
                var profileSubBtn = document.querySelector('[data-novel-section="profile"]');
                if (profileSubBtn) profileSubBtn.classList.add('active');
                document.querySelectorAll('.novel-section').forEach(function (s) { s.classList.remove('active'); });
                var profileSection = document.getElementById('novel-section-profile');
                if (profileSection) profileSection.classList.add('active');

                if (typeof switchWorkspaceView === 'function') switchWorkspaceView('script');
            } catch (e) { /* defensif: jangan gagalkan load karena reset UI */ }
        }

        // =============================================
        // 📚 Chapter Manifest Manager — UI untuk chapters.json
        // Urutan main & auto-next, judul tampil, deskripsi, cover, unlockFlag.
        // Backend: IPC chapter-manifest:get/save/delete (vn-engine/novel-crud.js);
        // konsumsi runtime sudah ada (core.js getChapterListData sejak 2026-07-04).
        // =============================================

        (function initChapterManifestManager() {
            const addBtn = document.getElementById('show-add-chapter-input-btn');
            if (!addBtn) return;
            const manageBtn = document.createElement('button');
            manageBtn.id = 'manage-chapter-manifest-btn';
            manageBtn.textContent = '📚 Atur Chapter';
            manageBtn.title = 'Atur urutan, judul tampil, deskripsi, cover, dan syarat unlock chapter (chapters.json)';
            manageBtn.className = addBtn.className;
            manageBtn.style.marginTop = '6px';
            addBtn.insertAdjacentElement('afterend', manageBtn);
            manageBtn.addEventListener('click', function () {
                if (!currentlyEditing.novel) return;
                switchWorkspaceView('chapters');
            });

            // (Tombol "Terjemahan" TIDAK lagi di sini: scope-nya chapter yang sedang
            //  dibuka, jadi pintunya pindah ke header chapter di vnManager.html.)
        })();

        // Render isi view "Struktur Chapter" ke #manifest-body. Dipanggil saat view
        // di-mount (state.js). DOM-nya SENGAJA tidak dibangun ulang bila novel yang
        // sama sudah dirender: suntingan yang belum disimpan tetap aman saat user
        // bolak-balik ke editor script — konsisten dengan view hub/profil.
        let _manifestRenderedFor = null;
        let _manifestBaseline = null;

        /**
         * Apakah baris ini punya isi di luar identitasnya (judul/folder)?
         *
         * Dipakai memutuskan lipatan "Detail tampilan" dibuka atau tidak.
         * Menyembunyikan field yang ADA datanya adalah cara tercepat membuat
         * kreator mengira datanya hilang, jadi yang boleh terlipat hanya yang
         * benar-benar kosong.
         *
         * `badge` di-trim lebih dulu: spasi doang bukan isi, tapi ia truthy.
         * `hidden` sengaja dipakai apa adanya — `false` memang berarti kosong.
         *
         * @param {Object} m entri manifest (chapters.json)
         * @param {Object} cc metadata Chapter Select (hubConfig.chapterConfig)
         */
        function manifestPunyaDetail(m, cc) {
            m = m || {};
            cc = cc || {};
            return !!(m.desc || m.cover || m.unlockFlag ||
                cc.hidden || (cc.badge && String(cc.badge).trim()));
        }
        window._manifestPunyaDetail = manifestPunyaDetail;

        function collectManifestDraft() {
            const rowsContainer = document.getElementById('manifest-rows');
            if (!rowsContainer) return [];
            return Array.from(rowsContainer.querySelectorAll('.manifest-row')).map(row => ({
                folder: row.dataset.folder,
                title: row.querySelector('.manifest-title-input').value,
                desc: row.querySelector('.manifest-desc').value,
                cover: row.querySelector('.manifest-cover').value,
                unlockFlag: row.querySelector('.manifest-unlock').value,
                hidden: row.querySelector('.manifest-hidden').checked,
                badge: row.querySelector('.manifest-badge').value.trim(),
            }));
        }

        function manifestSnapshot() {
            return JSON.stringify(collectManifestDraft());
        }

        function manifestIsDirty() {
            return !!(
                currentlyEditing.novel &&
                _manifestRenderedFor === currentlyEditing.novel &&
                _manifestBaseline !== null &&
                manifestSnapshot() !== _manifestBaseline
            );
        }

        function markManifestClean() {
            _manifestBaseline = manifestSnapshot();
        }

        window._manifestIsDirty = manifestIsDirty;

        window.renderChapterManifestView = async function renderChapterManifestView(force) {
            const body = document.getElementById('manifest-body');
            const titleEl = document.getElementById('manifest-title');
            const statusEl = document.getElementById('manifest-status');
            const saveBtn = document.getElementById('manifest-save-btn');
            const delBtn = document.getElementById('manifest-delete-btn');
            if (!body) return;

            const esc = s => String(s === undefined || s === null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

            const novel = currentlyEditing.novel;
            const kosongkanAksi = () => {
                if (statusEl) { statusEl.textContent = ''; statusEl.classList.remove('is-active'); }
                if (saveBtn) saveBtn.style.display = 'none';
                if (delBtn) delBtn.style.display = 'none';
            };

            if (!novel) {
                _manifestRenderedFor = null;
                _manifestBaseline = null;
                body.innerHTML = '<p class="manifest-empty">Pilih novel dulu.</p>';
                kosongkanAksi();
                return;
            }
            if (!force && _manifestRenderedFor === novel) return; // pertahankan draft

            if (titleEl) titleEl.textContent = 'Atur Chapter: ' + novel;
            body.innerHTML = '<p class="manifest-empty">Memuat…</p>';

            const res = await ipcRenderer.invoke('chapter-manifest:get', { novelTitle: novel });
            if (!res || !res.success) {
                _manifestRenderedFor = null;
                _manifestBaseline = null;
                body.innerHTML = '<p class="manifest-empty manifest-error">Gagal membaca manifest: ' +
                    esc((res && res.message) || 'unknown') + '</p>';
                kosongkanAksi();
                return;
            }
            if (!res.chapters.length) {
                _manifestRenderedFor = null;
                _manifestBaseline = null;
                body.innerHTML = '<p class="manifest-empty">Belum ada chapter di novel ini. ' +
                    'Buat dulu lewat <b>+ Tambah Chapter Baru</b>, lalu atur urutan & aksesnya di sini.</p>';
                kosongkanAksi();
                return;
            }

            // Urutkan tampilan mengikuti manifest yang ada (aturan sama dgn core.js);
            // folder di luar manifest ditaruh di akhir.
            const byFolder = {};
            const orderOf = {};
            (res.manifest || []).forEach((m, idx) => {
                if (!m || !m.folder) return;
                byFolder[m.folder] = m;
                orderOf[m.folder] = (m.order !== undefined ? m.order : idx);
            });
            const chapters = res.chapters.slice().sort((a, b) => {
                const oa = Object.prototype.hasOwnProperty.call(orderOf, a) ? orderOf[a] : Infinity;
                const ob = Object.prototype.hasOwnProperty.call(orderOf, b) ? orderOf[b] : Infinity;
                return oa - ob;
            });

            const rowsHTML = chapters.map(folder => {
                const m = byFolder[folder] || {};
                // Metadata Chapter Select (hidden/badge) disimpan di hubConfig.chapterConfig,
                // bukan chapters.json — diedit di sini, ditulis balik saat Simpan.
                const cc = (window.hubConfig && window.hubConfig.chapterConfig && window.hubConfig.chapterConfig[folder]) || {};

                // HIERARKI (UX-B03). Dulu tiga baris field berbobot sama, jadi mata tak
                // punya tempat mendarat dan daftar sepuluh chapter terbaca seperti
                // formulir pajak. Sekarang: baris identitas (folder + judul) selalu
                // terlihat, sisanya masuk lipatan.
                //
                // Lipatan DIBUKA sendiri kalau barisnya sudah punya isi. Menyembunyikan
                // field yang ada datanya adalah cara tercepat membuat kreator mengira
                // datanya hilang — dan itu kelas kesalahan yang justru sedang ditutup
                // milestone ini. Yang boleh disembunyikan hanya yang memang kosong.
                const adaDetail = manifestPunyaDetail(m, cc);

                return '<div class="manifest-row" data-folder="' + esc(folder) + '">' +
                    '<span class="manifest-drag-handle" title="Seret untuk mengubah urutan">⠿</span>' +
                    '<div class="manifest-row-fields">' +
                        '<div class="manifest-row-line manifest-row-identity">' +
                            '<span class="manifest-folder" title="Nama folder chapter (ganti nama lewat tombol ubah nama di sidebar)">' + esc(folder) + '</span>' +
                            '<input type="text" class="script-input manifest-title-input" value="' + esc(m.title || '') + '" placeholder="Judul tampil (kosong = nama folder)">' +
                        '</div>' +
                        '<details class="manifest-detail"' + (adaDetail ? ' open' : '') + '>' +
                            '<summary class="manifest-detail-summary">Detail tampilan' +
                            (adaDetail ? '<span class="manifest-detail-mark">terisi</span>' : '') +
                            '</summary>' +
                            // Grid label + kotak. Sebelumnya tiga kotak berjejer tanpa label,
                            // jadi placeholder-nya terpaksa memikul seluruh penjelasan lalu
                            // terpotong justru di bagian yang penting. Label terpisah membuat
                            // placeholder boleh pendek dan keterangannya tetap utuh.
                            '<div class="manifest-detail-grid">' +
                                '<span class="manifest-detail-label">Deskripsi</span>' +
                                '<input type="text" class="script-input manifest-desc manifest-detail-wide" value="' + esc(m.desc || '') + '" placeholder="Ringkasan singkat chapter">' +
                                '<span class="manifest-detail-label">Cover</span>' +
                                '<input type="text" class="script-input manifest-cover" value="' + esc(m.cover || '') + '" placeholder="path relatif root novel">' +
                                '<span class="manifest-detail-label">Kunci</span>' +
                                '<input type="text" class="script-input manifest-unlock" list="manifest-known-flags" value="' + esc(m.unlockFlag || '') + '" placeholder="kosong = selalu terbuka" title="Chapter terkunci (gembok di Chapter Select) sampai hub-flag ini truthy. Saran = key set_hub_flag yang benar-benar ada di script + hub-flags.json.">' +
                                '<span class="manifest-detail-label">Badge</span>' +
                                '<input type="text" class="script-input manifest-badge" value="' + esc(cc.badge || '') + '" placeholder="NEW, FINAL...">' +
                                '<label class="manifest-hidden-label manifest-detail-span2" title="Sembunyikan chapter ini dari layar Chapter Select">' +
                                    '<input type="checkbox" class="manifest-hidden"' + (cc.hidden ? ' checked' : '') + '> Sembunyikan dari Chapter Select' +
                                '</label>' +
                            '</div>' +
                        '</details>' +
                    '</div>' +
                '</div>';
            }).join('');

            const missingHTML = (res.missingFolders && res.missingFolders.length)
                ? '<div class="manifest-warning">⚠️ Entri manifest berikut menunjuk folder yang sudah tidak ada dan akan DIBUANG saat disimpan: <b>' +
                  res.missingFolders.map(esc).join(', ') + '</b></div>'
                : '';

            body.innerHTML = missingHTML +
                '<p class="manifest-note">Seret ⠿ untuk mengubah urutan — urutan ini dipakai layar Chapter Select dan auto-next di akhir chapter. ' +
                'Kolom kosong berarti fallback: judul kosong memakai nama folder, tanpa unlockFlag chapter selalu terbuka. ' +
                'Buka <b>Detail tampilan</b> untuk deskripsi, cover, kunci, serta Sembunyikan/Badge di Chapter Select. ' +
                'Side story tidak diatur manifest.</p>' +
                '<div id="manifest-rows">' + rowsHTML + '</div>' +
                '<datalist id="manifest-known-flags">' +
                (res.knownFlags || []).map(f => '<option value="' + esc(f) + '"></option>').join('') +
                '</datalist>';

            if (statusEl) {
                statusEl.textContent = res.exists ? 'chapters.json AKTIF' : 'urutan otomatis (belum ada chapters.json)';
                statusEl.classList.toggle('is-active', !!res.exists);
            }
            if (saveBtn) saveBtn.style.display = '';
            if (delBtn) delBtn.style.display = res.exists ? '' : 'none';

            const rowsContainer = document.getElementById('manifest-rows');
            if (typeof Sortable === 'function') {
                new Sortable(rowsContainer, { animation: 150, handle: '.manifest-drag-handle' });
            }

            _manifestRenderedFor = novel;
            markManifestClean();
        };

        // Aksi dipasang SEKALI ke tombol di header view (bukan tiap render).
        (function bindManifestActions() {
            // Back dipasang SEBELUM penjaga di bawah: jalan pulang harus tetap ada
            // meski tombol simpan/hapus kebetulan tak dirender.
            const backBtn = document.getElementById('manifest-back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', function () {
                    // Cukup mengganti workspace view — TIDAK memuat ulang naskah maupun
                    // draft manifest. Wrapper hanya disembunyikan, dan render saat kembali
                    // dijaga `if (!force && _manifestRenderedFor === novel) return`.
                    switchWorkspaceView('script');
                });
            }

            const saveBtn = document.getElementById('manifest-save-btn');
            const delBtn = document.getElementById('manifest-delete-btn');
            if (!saveBtn || !delBtn) return;

            async function saveChapterManifestChanges() {
                // Guard pelajaran FB18: jangan pernah mengirim koleksi kosong hanya
                // karena view belum termuat — bedakan "memang kosong" dari "belum siap".
                if (!currentlyEditing.novel || _manifestRenderedFor !== currentlyEditing.novel) {
                    showNotification('Struktur chapter belum termuat — buka ulang Atur Chapter.', 'error');
                    return false;
                }
                const rowsContainer = document.getElementById('manifest-rows');
                if (!rowsContainer) return false;

                const draft = collectManifestDraft();
                const entries = draft.map(item => ({
                    folder: item.folder,
                    title: item.title,
                    desc: item.desc,
                    cover: item.cover,
                    unlockFlag: item.unlockFlag,
                }));
                const novelTitle = currentlyEditing.novel;

                // UX-A09 — metadata Chapter Select ikut dalam SATU transaksi.
                //
                // Yang dikirim hanya metadata chapter. DULU di sini seluruh
                // `window.hubConfig` dikirim ke `save-hub-config`; objek itu adalah
                // draft hidup yang dimutasi Inspector Hub tanpa Save, jadi menyimpan
                // urutan chapter diam-diam ikut meng-commit rename scene yang belum
                // disetujui — dan sejak UX-A03 ikut menuliskannya ke hub.html.
                // Backend membaca hub-config.json canonical dari disk sendiri.
                const chapterMeta = {};
                draft.forEach((item) => {
                    chapterMeta[item.folder] = {
                        hidden: item.hidden === true,
                        badge: typeof item.badge === 'string' ? item.badge : ''
                    };
                });

                let result;
                try {
                    result = await VN.Utils.invokeChecked(
                        ipcRenderer,
                        'chapter-manifest:save',
                        { novelTitle, entries, chapterMeta }
                    );
                } catch (error) {
                    showNotification('Gagal menyimpan struktur chapter: ' +
                        ((error && error.message) || 'operasi IPC gagal'), 'error');
                    return false;
                }

                // Respons untuk novel lama tak boleh menyentuh novel yang kini dibuka.
                if (currentlyEditing.novel !== novelTitle) return false;

                // Model lokal disegarkan dari nilai CANONICAL hasil commit, bukan dari
                // tebakan renderer. Hanya `chapterConfig` yang diganti — dirty state
                // domain Hub lain sengaja tidak disentuh.
                if (window.hubConfig && result.chapterConfig) {
                    window.hubConfig.chapterConfig = result.chapterConfig;
                }

                showNotification(result.message || 'Struktur chapter berhasil disimpan.', 'success');
                await refreshChapterSidebar();
                await window.renderChapterManifestView(true);
                return true;
            }
            window.saveChapterManifestChanges = saveChapterManifestChanges;
            saveBtn.addEventListener('click', saveChapterManifestChanges);

            delBtn.addEventListener('click', async () => {
                if (!currentlyEditing.novel) return;
                const ok = await showConfirmation('Hapus chapters.json? Urutan & judul chapter kembali ke mode otomatis (alfabetis + heuristik prolog/angka).');
                if (!ok) return;
                try {
                    const result = await VN.Utils.invokeChecked(
                        ipcRenderer,
                        'chapter-manifest:delete',
                        { novelTitle: currentlyEditing.novel }
                    );
                    showNotification(result.message || 'Manifest chapter berhasil dihapus.', 'success');
                    await refreshChapterSidebar();
                    await window.renderChapterManifestView(true);
                } catch (error) {
                    showNotification('Gagal menghapus manifest chapter: ' +
                        ((error && error.message) || 'operasi IPC gagal'), 'error');
                }
            });
        })();


