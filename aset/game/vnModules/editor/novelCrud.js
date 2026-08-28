        // --------------------- Create Novel Logic ------------------- //
        // UX-A07a: modal Create SELALU berangkat dari draft kosong.
        // Dulu tagline diambil dari novel yang kebetulan berada di tengah carousel,
        // jadi novel baru lahir membawa deskripsi milik novel lain padahal pengguna
        // tak pernah minta duplikasi. Menyalin novel, kalau kelak dibutuhkan, harus
        // jadi aksi tersendiri yang namanya jelas — bukan efek samping tombol Buat.
        function showCreateNovelModal() {
            newNovelTitleInput.value = '';
            newNovelDescInput.value = '';
            newNovelCoverInput.value = '';
            imagePreview.innerHTML = '<span>Pratinjau Cover</span>';

            createNovelModal.classList.add('visible');
            newNovelTitleInput.focus();
        }

        // Fungsi untuk update preview story-card di modal
        function updateModalPreview() {
            const title = newNovelTitleInput.value.trim() || 'Judul Novel';
            const desc = newNovelDescInput.value.trim() || 'Deskripsi novel akan muncul di sini...';

            // Cek apakah sudah ada gambar di preview
            const existingImg = imagePreview.querySelector('img');
            if (existingImg) {
                // Hapus overlay lama jika ada
                const oldOverlay = imagePreview.querySelector('.preview-overlay');
                if (oldOverlay) oldOverlay.remove();

                // Buat overlay baru dengan data terkini
                const overlay = document.createElement('div');
                overlay.className = 'preview-overlay';
                overlay.innerHTML = `
                    <div class="preview-title">${escapeHtml(title)}</div>
                    <div class="preview-desc">${escapeHtml(desc)}</div>
                `;
                imagePreview.appendChild(overlay);
            }
        }

        // Helper function escapeHtml dipindah ke utils.js

        // Event listener untuk update preview saat input berubah
        newNovelTitleInput.addEventListener('input', updateModalPreview);
        newNovelDescInput.addEventListener('input', updateModalPreview);

        function hideCreateNovelModal() {
            createNovelModal.classList.remove('visible');
        }

        async function handleCreateNovel() {
            const title = newNovelTitleInput.value.trim();
            const storyDesc = newNovelDescInput.value.trim();
            const coverFile = newNovelCoverInput.files[0];
            if (!title || !coverFile) {
                showConfirmation('Judul dan gambar cover harus diisi!', true);
                return;
            }

            const fileArrayBuffer = await coverFile.arrayBuffer();
            const result = await ipcRenderer.invoke('create-new-novel', {
                title: title,
                storyDesc: storyDesc,  // Kirim story description ke main process
                cover: { name: coverFile.name, buffer: fileArrayBuffer }
            });

            if (result.success) {
                // Beri tanda bahwa ini adalah alur pembuatan novel baru
                await showHubEditor(title, {
                    isNewNovel: true,
                    novelId: result.novelId || null,
                    showNewNovelOnboarding: result.showNewNovelOnboarding === true
                });
            } else {
                showConfirmation(`Error: ${result.message}`, true);
            }
        }

        async function handleUpdateNovel(scopeOpt) {
            if (!currentlyEditingNovel) return false;
            // Kunci target saat Save dimulai. IPC profil dapat menunggu file besar;
            // jangan sampai kelanjutannya menulis config ke novel yang baru dipilih.
            const saveTargetNovel = currentlyEditingNovel;
            const currentWorkspace = (typeof VN !== 'undefined' && VN.Workspace) ? VN.Workspace.current : '';

            // Simpan global: tentukan domain mana yang perlu ditulis.
            //   'all'     → simpan SEMUA domain yang dirty (dipakai tombol Simpan &
            //               konfirmasi saat Back). Dirty-gated agar tidak menimpa
            //               data profil/media saat hanya hub yang berubah.
            //   'profile' → paksa simpan profil saja.
            //   'config'  → paksa simpan hub/player config saja.
            //   (kosong)  → fallback lama berbasis workspace aktif.
            const dirtyProfile = (typeof window._profileIsDirty === 'function') ? window._profileIsDirty() : false;
            const dirtyConfig = (typeof window._hubIsDirty === 'function' && window._hubIsDirty()) ||
                                (typeof window._playerIsDirty === 'function' && window._playerIsDirty());
            let saveProfile, saveConfig;
            if (scopeOpt === 'all') {
                saveProfile = dirtyProfile;
                saveConfig = dirtyConfig;
            } else if (scopeOpt === 'profile') {
                saveProfile = true; saveConfig = false;
            } else if (scopeOpt === 'config') {
                saveProfile = false; saveConfig = true;
            } else {
                saveProfile = currentWorkspace === 'profile';
                saveConfig = currentWorkspace !== 'profile';
            }

            // Simpan global tanpa perubahan apa pun → jangan tulis ulang/flicker.
            if (scopeOpt === 'all' && !saveProfile && !saveConfig) {
                if (typeof VN !== 'undefined' && VN.Toast) VN.Toast.info('Tidak ada perubahan untuk disimpan.');
                return true;
            }

            const configSavedMessage = (saveProfile && saveConfig)
                ? 'Semua perubahan berhasil disimpan!'
                : (currentWorkspace === 'player'
                    ? 'Konfigurasi Player berhasil disimpan!'
                    : 'Konfigurasi Hub berhasil disimpan!');

            const storyDesc = document.getElementById('editor-story-desc').value;
            const description = document.getElementById('editor-description').value;
            const genre = document.getElementById('editor-genre').value;
            const author = document.getElementById('editor-author').value;
            const illustrator = document.getElementById('editor-illustrator').value;
            const vnMapper = document.getElementById('editor-vn-mapper').value;
            const novelVersion = (document.getElementById('editor-novel-version') || {}).value || '';

            const coverInput = document.getElementById('editor-cover-input');
            // Revision guard memakai daftar field yang SAMA PERSIS dengan pelacak
            // dirty (`window._profileSnapshot`, didefinisikan di hubEditor.js).
            // Dua salinan daftar pernah menelan fitur utuh: field yang cuma ada di
            // salah satunya tidak membuat profil dianggap kotor, jadi Save berhasil
            // tanpa galat sambil TIDAK menyimpan apa-apa. Satu daftar, dua pembaca.
            const profileDraftSignature = function () {
                if (typeof window._profileSnapshot === 'function') return window._profileSnapshot();
                // hubEditor.js belum sempat memasang daftarnya. Jangan mengarang
                // daftar cadangan di sini — itu justru melahirkan salinan kedua.
                // Nilai yang TAK PERNAH sama dengan dirinya sendiri membuat revision
                // guard bersikap konservatif (menganggap ada draft lebih baru),
                // bukan menganggap semuanya cocok.
                console.warn('[VN Editor] _profileSnapshot belum tersedia; revision guard bersikap konservatif.');
                return 'tanpa-snapshot:' + Date.now() + ':' + Math.random();
            };
            const savedProfileDraftSignature = saveProfile ? profileDraftSignature() : null;
            const coverFileAtStart = saveProfile && coverInput && coverInput.files
                ? coverInput.files[0] || null
                : null;
            const promotionalVideoFileAtStart = saveProfile && editorBackgroundVideoInput.files
                ? editorBackgroundVideoInput.files[0] || null
                : null;
            // Nama/path input saja tidak cukup sebagai revision guard: pengguna dapat
            // memilih File baru dengan nama yang sama ketika Save lama masih berjalan.
            // Pertahankan identitas object File agar respons lama tak menghapus draft baru.
            const profileFilesStillMatch = function () {
                const currentCoverFile = coverInput && coverInput.files
                    ? coverInput.files[0] || null
                    : null;
                const currentVideoFile = editorBackgroundVideoInput.files
                    ? editorBackgroundVideoInput.files[0] || null
                    : null;
                return currentCoverFile === coverFileAtStart &&
                    currentVideoFile === promotionalVideoFileAtStart;
            };

            // Snapshot config dibuat sebelum await pertama. Edit lanjutan saat IPC
            // berjalan tetap menjadi draft baru dan tidak ikut payload Save lama.
            let configSourceAtStart = null;
            let configSaveSnapshot = null;
            let configSaveSignature = null;
            if (saveConfig) {
                if (typeof hubConfig === 'undefined') {
                    showNotification('Gagal menyimpan konfigurasi: data Hub belum termuat.', 'error');
                    return false;
                }

                const warnEnabledEl = document.getElementById('warning-screen-enabled');
                if (warnEnabledEl) hubConfig.warningScreen.enabled = warnEnabledEl.checked;
                const warnTextEl = document.getElementById('warning-screen-text');
                if (warnTextEl) hubConfig.warningScreen.text = warnTextEl.value;
                const bgmInputEl = document.getElementById('menu-bgm-input');
                if (bgmInputEl) hubConfig.menu.bgm = bgmInputEl.value;
                const layoutInputEl = document.getElementById('menu-layout-input');
                if (layoutInputEl) hubConfig.menu.layout = layoutInputEl.value;
                const warnStyleEl = document.getElementById('warning-screen-style');
                if (warnStyleEl) hubConfig.warningScreen.style = warnStyleEl.value;
                const bgTypeEl = document.getElementById('menu-bg-type');
                const bgSrcEl = document.getElementById('menu-bg-src');
                if (bgTypeEl && bgSrcEl) {
                    if (!hubConfig.menu.background) hubConfig.menu.background = {};
                    hubConfig.menu.background.type = bgTypeEl.value;
                    hubConfig.menu.background.src = bgSrcEl.value;
                }
                if (typeof VN !== 'undefined' && VN.HubScenes) {
                    VN.HubScenes.normalize(hubConfig, { rebuildFromLegacy: true });
                }

                configSourceAtStart = hubConfig;
                try {
                    configSaveSnapshot = JSON.parse(JSON.stringify(hubConfig));
                    configSaveSignature = JSON.stringify(configSaveSnapshot);
                } catch (error) {
                    showNotification('Gagal menyiapkan konfigurasi Hub: ' + error.message, 'error');
                    return false;
                }
            }

            // Simpan editor kode yang memang aktif pada awal transaksi, sebelum
            // await profil/media. Jangan membaca window.VNCodeEditor lagi setelah
            // user mungkin berpindah novel.
            if (saveConfig) {
                const codeEditorAtStart = window.VNCodeEditor;
                if (codeEditorAtStart && codeEditorAtStart.isDirty && codeEditorAtStart.isDirty()) {
                    if (typeof codeEditorAtStart.save === 'function') {
                        const codeSaved = await codeEditorAtStart.save();
                        if (codeSaved === false || (codeSaved && codeSaved.success === false)) {
                            showNotification(
                                'Gagal menyimpan kode Hub: ' + ((codeSaved && codeSaved.message) || 'operasi ditolak.'),
                                'error'
                            );
                            return false;
                        }
                    }
                }
            }

            // Kumpulkan video promosi (jika ada)
            let promotionalVideo = null;
            if (promotionalVideoFileAtStart) {
                const buffer = await promotionalVideoFileAtStart.arrayBuffer();
                promotionalVideo = { name: promotionalVideoFileAtStart.name, buffer };
            }

            let result = { success: true, message: configSavedMessage };
            let profileSaved = false;
            if (saveProfile) {
                let coverFile = null;
                if (coverFileAtStart) {
                    coverFile = {
                        name: coverFileAtStart.name,
                        buffer: await coverFileAtStart.arrayBuffer()
                    };
                }
                try {
                    result = await VN.Utils.invokeChecked(ipcRenderer, 'update-novel-details', {
                        novelTitle: saveTargetNovel,
                        storyDesc: storyDesc,
                        description: description,
                        genre: genre,
                        author: author,
                        illustrator: illustrator,
                        vnMapper: vnMapper,
                        version: novelVersion,
                        // `null` = kembali ke bawaan; backend membuang kuncinya,
                        // bukan menulis 1920×1080.
                        viewport: typeof window._novelViewportValue === 'function'
                            ? window._novelViewportValue() : undefined,
                        // String kosong = cabut; backend membuang kuncinya.
                        rpcLargeImage: typeof window._novelRpcValue === 'function'
                            ? window._novelRpcValue() : undefined,
                        coverFile: coverFile,
                        promotionalVideo: promotionalVideo
                    });
                    profileSaved = true;
                } catch (error) {
                    showNotification('Gagal menyimpan profil: ' + error.message, 'error');
                    console.error('[VN Editor] Gagal menyimpan profil novel:', error);
                    return false;
                }
            }

            // Kirim konfigurasi Hub Builder (Boot Sequence, Menu Builder, Chapter Config)
            if (saveConfig) {
                try {
                    await VN.Utils.invokeChecked(ipcRenderer, 'save-hub-config', {
                        novelTitle: saveTargetNovel,
                        config: configSaveSnapshot
                    });
                } catch (error) {
                    showNotification('Gagal menyimpan konfigurasi: ' + error.message, 'error');
                    console.error('[VN Editor] Gagal menyimpan konfigurasi Hub/Player:', error);
                    return false;
                }

                result = { success: true, message: configSavedMessage };
            }

            if (result.success) {
                let savedMeta = null;
                if (profileSaved && currentlyEditingNovel === saveTargetNovel) {
                    try {
                        savedMeta = await VN.Utils.invokeChecked(
                            ipcRenderer,
                            'get-hub-details',
                            saveTargetNovel
                        );
                    } catch (error) {
                        // Commit sudah berhasil. Kegagalan read-back tidak boleh
                        // merobohkan workspace atau mengubah hasil Save menjadi gagal.
                        console.warn('[VN Editor] Metadata tersimpan tetapi gagal direkonsiliasi:', error);
                    }
                }

                if (currentlyEditingNovel === saveTargetNovel) {
                    showNotification(result.message, 'success');
                    let configStillMatches = !saveConfig;
                    try {
                        configStillMatches = !saveConfig || (
                            window.hubConfig === configSourceAtStart &&
                            JSON.stringify(window.hubConfig) === configSaveSignature
                        );
                    } catch (error) {
                        configStillMatches = false;
                    }
                    const profileStillMatches = !saveProfile || (
                        profileDraftSignature() === savedProfileDraftSignature &&
                        profileFilesStillMatch()
                    );

                    // Rekonsiliasi lokal: PreviewFrame, mode Live/Per-scene, scene
                    // aktif, Inspector, dan scroll tidak dibongkar. Metadata hanya
                    // diterapkan bila tidak ada draft profil yang lebih baru.
                    let reconciled = false;
                    try {
                        if (typeof window.reconcileHubEditorAfterSave === 'function') {
                            reconciled = await window.reconcileHubEditorAfterSave({
                                novelTitle: saveTargetNovel,
                                meta: profileStillMatches ? savedMeta : null,
                                config: configStillMatches ? configSaveSnapshot : null,
                                preserveConfigDraft: !configStillMatches
                            });
                        } else if (typeof window.refreshHubPreview === 'function') {
                            window.refreshHubPreview();
                            reconciled = true;
                        }
                    } catch (error) {
                        console.warn('[VN Editor] Preview gagal direkonsiliasi setelah Save:', error);
                    }

                    // Periksa lagi sesudah read-back/reconcile yang asynchronous.
                    // Edit baru tidak boleh ikut dianggap tersimpan oleh response lama.
                    let finalConfigMatches = !saveConfig;
                    try {
                        finalConfigMatches = !saveConfig || (
                            window.hubConfig === configSourceAtStart &&
                            JSON.stringify(window.hubConfig) === configSaveSignature
                        );
                    } catch (error) {
                        finalConfigMatches = false;
                    }
                    const finalProfileMatches = !saveProfile || (
                        profileDraftSignature() === savedProfileDraftSignature &&
                        profileFilesStillMatch()
                    );

                    if (saveConfig && finalConfigMatches) {
                        if (typeof window._hubMarkClean === 'function') window._hubMarkClean();
                        if (typeof window._playerMarkClean === 'function') window._playerMarkClean();
                    }
                    if (saveProfile && finalProfileMatches && (!profileSaved || (savedMeta && reconciled))) {
                        // File input hanya staging. Kosongkan setelah read-back sukses,
                        // lalu buat baseline dari bentuk UI pasca-commit.
                        if (coverInput) coverInput.value = '';
                        if (editorBackgroundVideoInput) editorBackgroundVideoInput.value = '';
                        if (typeof window._profileMarkClean === 'function') window._profileMarkClean();
                    }

                    // Update onboarding hanya untuk novel yang masih menjadi target UI.
                    if (typeof window._updateOnboardingState === 'function') window._updateOnboardingState();
                }

                // Refresh daftar novel di latar belakang
                loadStories();
                // Save boleh saja sudah berhasil di target awal, tetapi continuation
                // (Keluar/Jalankan) tidak boleh diteruskan untuk novel baru yang belum
                // menjadi bagian transaksi ini.
                if (currentlyEditingNovel !== saveTargetNovel) return false;
                return true;
            } else {
                showNotification(`Error: ${result.message}`, 'error');
                return false;
            }
        }
        window.handleUpdateNovel = handleUpdateNovel;

        newNovelCoverInput.addEventListener('change', () => {
            const file = newNovelCoverInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Tampilkan gambar lalu tambahkan overlay
                    imagePreview.innerHTML = `<img src="${e.target.result}" alt="Pratinjau">`;
                    // Trigger update preview untuk menambahkan overlay dengan data terkini
                    updateModalPreview();
                };
                reader.readAsDataURL(file);
            } else {
                imagePreview.innerHTML = '<span>Pratinjau Cover</span>';
            }
        });

        // ---- Kartu konfigurasi Cover Novel ----
        // Satu pengendali untuk dua sumber: cover yang SUDAH ada di disk (diisi
        // hubEditor lewat window._setCoverCard saat memuat novel) dan pilihan baru
        // yang belum disimpan. Dimensi & rasio DIBACA dari gambarnya sendiri —
        // termasuk saat berkasnya ternyata tidak ada, supaya kartu tidak mengklaim
        // cover yang sebenarnya hilang.
        (function initCoverCard() {
            const input = document.getElementById('editor-cover-input');
            const zone = document.getElementById('cover-dropzone');
            const img = document.getElementById('profile-cover-preview');
            const fileEl = document.getElementById('cover-meta-file');
            const sizeEl = document.getElementById('cover-meta-size');
            const ratioEl = document.getElementById('cover-meta-ratio');
            const resetBtn = document.getElementById('cover-reset-btn');
            if (!input || !zone || !img) return;

            let savedState = null;  // cover tersimpan terakhir — dasar "Batalkan pilihan"
            let draftURL = null;    // objectURL draft yang perlu dibebaskan

            function setText(el, text, cls) {
                if (!el) return;
                el.textContent = text;
                el.classList.remove('cover-meta-ok', 'cover-meta-warn');
                if (cls) el.classList.add(cls);
            }

            // Rasio ditulis sebagai bilangan bulat kecil bila memungkinkan (2:3, 3:4);
            // kalau tidak, normalkan ke "1 : n" agar tetap langsung dibandingkan
            // dengan ideal 2:3 (= 1 : 1,5) alih-alih pecahan yang sulit dibaca.
            function ratioLabel(w, h) {
                const gcd = (a, b) => (b ? gcd(b, a % b) : a);
                const g = gcd(w, h) || 1;
                const rw = w / g, rh = h / g;
                if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
                return '1 : ' + (h / w).toFixed(2).replace('.', ',');
            }

            img.addEventListener('load', () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                if (!w || !h) return;
                setText(sizeEl, `${w} × ${h} px`);
                const selisih = Math.abs((w / h) - (2 / 3)) / (2 / 3);
                setText(ratioEl, ratioLabel(w, h) + (selisih <= 0.04 ? ' — pas 2:3' : ' — ideal 2:3'),
                    selisih <= 0.04 ? 'cover-meta-ok' : 'cover-meta-warn');
            });

            img.addEventListener('error', () => {
                if (!img.getAttribute('src')) return;
                setText(sizeEl, 'berkas tidak terbaca', 'cover-meta-warn');
                setText(ratioEl, '—');
            });

            // Cover baru ditulis dengan NAMA yang sama (cover.jpg), jadi URL-nya tak
            // berubah sesudah Simpan: menyetel img.src ke nilai identik tidak memicu
            // muat ulang, dan bitmap lama masih di cache → pratinjau memamerkan gambar
            // lama padahal disk sudah benar. Tempelkan mtime berkas sebagai penanda
            // versi supaya URL ikut berubah tiap isinya berubah (dan TIDAK berubah
            // kalau isinya sama, jadi cache tetap berguna).
            function withVersion(src, fsPath) {
                if (!fsPath) return src;
                try {
                    return src + '?v=' + Math.round(require('fs').statSync(fsPath).mtimeMs);
                } catch (e) {
                    return src;
                }
            }

            function apply(info) {
                if (draftURL) { URL.revokeObjectURL(draftURL); draftURL = null; }

                if (!info || !info.src) {
                    img.removeAttribute('src');
                    zone.classList.remove('has-cover', 'is-draft');
                    setText(fileEl, 'belum ada');
                    setText(sizeEl, '—');
                    setText(ratioEl, '—');
                    if (resetBtn) resetBtn.hidden = true;
                    return;
                }

                if (info.isDraftURL) draftURL = info.src;
                setText(sizeEl, 'membaca…');
                setText(ratioEl, '—');
                img.src = info.isDraftURL ? info.src : withVersion(info.src, info.fsPath);
                zone.classList.add('has-cover');
                zone.classList.toggle('is-draft', !!info.staged);
                setText(fileEl, info.fileName || '—');
                if (resetBtn) resetBtn.hidden = !info.staged;
            }

            // Dipanggil hubEditor.js saat novel dimuat / gagal dimuat.
            window._setCoverCard = function (info) {
                if (!info || !info.staged) savedState = info ? Object.assign({}, info) : null;
                apply(info);
            };

            input.addEventListener('change', function () {
                const file = this.files && this.files[0];
                if (!file) { apply(savedState); return; }
                apply({ src: URL.createObjectURL(file), isDraftURL: true, fileName: file.name, staged: true });
            });

            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    input.value = '';           // menyamakan lagi dengan baseline dirty-check
                    apply(savedState);
                });
            }

            // Seret-lepas ke dropzone = setara memilih lewat dialog (input.files
            // ikut diisi, jadi tombol Simpan & dirty-check membacanya sama saja).
            ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            }));
            ['dragleave', 'dragend', 'drop'].forEach(ev => zone.addEventListener(ev, () => {
                zone.classList.remove('dragover');
            }));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!file) return;
                if (!/^image\//.test(file.type)) {
                    showNotification('Cover harus berupa berkas gambar (JPG/PNG/WebP/GIF).', 'error');
                    return;
                }
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
        })();

        editorBackgroundVideoInput.addEventListener('change', () => {
            if (editorBackgroundVideoInput.files.length > 0) {
                const fileName = editorBackgroundVideoInput.files[0].name;
                videoPreviewName.textContent = `File dipilih: ${fileName}`;
                document.getElementById('video-upload-label').classList.add('file-selected');
            } else {
                videoPreviewName.textContent = '';
                document.getElementById('video-upload-label').classList.remove('file-selected');
            }
        });

        // --------------------- End Create Novel Logic ------------------- //
