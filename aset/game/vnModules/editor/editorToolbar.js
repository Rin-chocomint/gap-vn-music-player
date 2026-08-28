// === editorToolbar.js ===

        // Kumpulkan seluruh isi editor (#script-editor-area) menjadi array data skrip.
        // SATU sumber kebenaran yang dipakai bersama oleh:
        //   - saveScriptChanges()  : isi yang ditulis ke disk
        //   - getScriptSnapshot()  : snapshot Undo/Redo (scriptEditor.js)
        //   - scriptIsDirty()      : deteksi "perubahan belum disimpan"
        //
        // Sebelumnya logika ini hanya hidup INLINE di jalur simpan, sementara
        // window.collectScriptDataFromEditor TIDAK PERNAH didefinisikan di codebase.
        // Akibatnya getScriptSnapshot() selalu mengembalikan null sehingga history
        // Undo/Redo script mati total dan scriptIsDirty() selalu false (konfirmasi
        // "belum disimpan" tak pernah muncul, dan _saveAllNovelChanges melewati script).
        //
        // MURNI BACA: tidak menyimpan, tidak menampilkan notifikasi, tidak menyentuh
        // DOM — aman dipanggil sering (snapshot history di-debounce tiap ~280ms).
        /**
         * Kunci entri asli yang TIDAK dimodel UI — supaya ikut tertulis kembali.
         *
         * `phase`/`label` dibangun ULANG dari input headernya (beda dari kartu entri
         * yang sejak FB19 punya baseline). Akibatnya tiap kunci tanpa input dibuang
         * saat disimpan; audit 2026-07-31 membuktikan `spriteSticky`, `audioChannels`,
         * dan `bgmLoopStart` hilang begitu kreator menekan Simpan.
         *
         * Kunci yang DIMODEL sengaja dibuang dari baseline: kalau kreator mengosongkan
         * background atau bgm, nilainya memang harus HILANG — baseline tak boleh
         * menghidupkannya kembali.
         */
        function _sisaTakBermodel(el, dimodel) {
            let dasar;
            try { dasar = JSON.parse(el?.dataset?.rawEntry || '{}'); } catch (e) { return {}; }
            if (!dasar || typeof dasar !== 'object' || Array.isArray(dasar)) return {};
            dimodel.forEach((k) => { delete dasar[k]; });
            return dasar;
        }

        /** Tempelkan kunci tak bermodel TANPA menimpa apa pun yang sudah dikumpulkan UI. */
        function _tempelSisa(obj, sisa) {
            Object.keys(sisa).forEach((k) => { if (!(k in obj)) obj[k] = sisa[k]; });
            return obj;
        }

        function collectScriptDataFromEditor() {
            const newScriptData = [];
            const phaseCards = scriptEditorArea.querySelectorAll('.phase-card');

            phaseCards.forEach(phaseCard => {
                // Pengaman null di seluruh fungsi ini: nilainya identik untuk DOM yang
                // utuh, tapi mencegah lempar-error saat dipanggil di tengah mutasi DOM
                // (snapshot history & cek dirty kini memanggilnya terus-menerus).
                const phaseObject = { type: 'phase', name: (phaseCard.querySelector('.phase-name-input')?.value || '').trim() };

                // --- Logic Background Phase (Image vs Video) ---
                const mediaInput = phaseCard.querySelector('.phase-media-input');
                const mediaValue = mediaInput ? mediaInput.value.trim() : '';

                if (mediaValue) {
                    const ext = mediaValue.split('.').pop().toLowerCase();
                    const isVideo = ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext);

                    if (isVideo) {
                        phaseObject.video = mediaValue;
                    } else {
                        phaseObject.background = mediaValue;
                        const checkedModeRadio = phaseCard.querySelector('.phase-header input[data-key="backgroundMode"]:checked');
                        if (checkedModeRadio) {
                            phaseObject.backgroundMode = checkedModeRadio.value;
                        }
                    }
                }

                const defaultBgm = phaseCard.querySelector('.phase-default-bgm-input')?.value.trim();
                if (defaultBgm) phaseObject.bgm = defaultBgm;

                const phaseHeaderInputs = phaseCard.querySelectorAll('.phase-header .script-input');
                phaseHeaderInputs.forEach(input => {
                    const key = input.dataset.key;
                    // Skip background/video related keys as they are handled above
                    if (['background', 'video', 'backgroundMode', 'media'].includes(key)) return;

                    if (key) {
                        const value = input.value;
                        if (value.trim() !== '' || key.toLowerCase().includes('volume') || key.toLowerCase().includes('pan') || key.toLowerCase().includes('delay')) {
                            if (input.type === 'range' || input.type === 'number') {
                                phaseObject[key] = parseFloat(value);
                            } else if (value.trim() !== '') {
                                phaseObject[key] = value.trim();
                            }
                        }
                    }
                });

                if (phaseCard.querySelector('.is-ending-checkbox')?.checked) {
                    phaseObject.isEnding = true;
                }

                // Simpan transisi keluar fase
                const phaseExitTransition = phaseCard.querySelector('.phase-exit-transition-select')?.value;
                if (phaseExitTransition) {
                    phaseObject.transitionOut = phaseExitTransition;
                }

                // Kunci yang TAK dimodel header ikut dibawa kembali (lihat _sisaTakBermodel).
                const phaseDimodel = ['type', 'name', 'background', 'video', 'backgroundMode',
                    'bgm'];
                // UX-A06: `transitionOut` hanya "dimodel" bila widgetnya benar-benar
                // dirender. Sejak dropdown-nya dicabut (runtime tak pernah menjalankan
                // transisi keluar fase), kunci ini harus jatuh ke baseline supaya nilai
                // lama — termasuk nilai dari extension — terbawa utuh, bukan terhapus.
                if (phaseCard.querySelector('.phase-exit-transition-select')) phaseDimodel.push('transitionOut');
                // Fase pertama legacy tidak menampilkan checkbox ending. Bila raw data
                // memilikinya, jangan masukkan isEnding ke daftar field termodel karena
                // tidak ada widget yang dapat menimpa baseline itu.
                if (phaseCard.querySelector('.is-ending-checkbox')) phaseDimodel.push('isEnding');
                phaseHeaderInputs.forEach((input) => {
                    if (input.dataset.key) phaseDimodel.push(input.dataset.key);
                });
                _tempelSisa(phaseObject, _sisaTakBermodel(phaseCard, phaseDimodel));

                // Header `default` implisit hanya wadah editor bagi script legacy yang
                // dimulai langsung dengan entry; ia bukan node dan tak boleh tercipta
                // hanya karena naskah dibuka lalu disimpan.
                if (phaseCard.dataset.implicitPhase !== 'true') newScriptData.push(phaseObject);

                const processChildren = (children) => {
                    const results = [];
                    children.forEach(element => {
                        if (element.classList.contains('label-group-container')) {
                            const labelName = (element.querySelector('.label-name-input')?.value || '').trim();
                            if (labelName) {
                                const labelObject = { type: 'label', name: labelName };

                                const sceneTransition = element.querySelector('.label-entry-transition-select')?.value;
                                if (sceneTransition) labelObject.transition = sceneTransition;

                                // --- Logic Background Label (Image vs Video) ---
                                const mediaInput = element.querySelector('.label-media-input');
                                const mediaValue = mediaInput ? mediaInput.value.trim() : '';

                                if (mediaValue) {
                                    const ext = mediaValue.split('.').pop().toLowerCase();
                                    const isVideo = ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext);

                                    if (isVideo) {
                                        labelObject.video = mediaValue;
                                    } else {
                                        labelObject.background = mediaValue;
                                        const bgModeInput = element.querySelector('input[data-key="backgroundMode"]:checked');
                                        if (bgModeInput) labelObject.backgroundMode = bgModeInput.value;
                                    }
                                }

                                const headerAssetInputs = element.querySelectorAll('.phase-assets input[data-key]');
                                headerAssetInputs.forEach(input => {
                                    const key = input.dataset.key;
                                    // Skip background/video related keys as they are handled above
                                    if (['background', 'video', 'backgroundMode', 'media'].includes(key)) return;

                                    if (input.type === 'radio' && !input.checked) {
                                        return;
                                    }
                                    const value = input.value.trim();
                                    // Angka disimpan sebagai ANGKA — kolektor phase sudah begitu, label
                                    // belum, sehingga `bgmVolume` dkk berubah jadi string tiap disimpan
                                    // (label shipped memang berisi "1", bekas simpanan lama).
                                    if (input.type === 'range' || input.type === 'number') {
                                        if (value !== '') labelObject[key] = parseFloat(value);
                                    } else if (value) {
                                        labelObject[key] = value;
                                    }
                                });

                                // Simpan transisi keluar label
                                const labelExitTransition = element.querySelector('.label-exit-transition-select')?.value;
                                if (labelExitTransition) {
                                    labelObject.transitionOut = labelExitTransition;
                                }

                                // Kunci tak bermodel ikut dibawa kembali (alasan sama dgn phase).
                                const labelDimodel = ['type', 'name', 'background', 'video',
                                    'backgroundMode'];
                                // UX-A06: keduanya hanya "dimodel" saat widgetnya dirender.
                                // `transitionOut` dicabut (runtime tak menjalankannya untuk
                                // label); `transition` hanya muncul saat label mengganti media
                                // — di luar itu `core.js:908` tak pernah membacanya.
                                if (element.querySelector('.label-exit-transition-select')) labelDimodel.push('transitionOut');
                                if (element.querySelector('.label-entry-transition-select')) labelDimodel.push('transition');
                                headerAssetInputs.forEach((input) => {
                                    if (input.dataset.key) labelDimodel.push(input.dataset.key);
                                });
                                _tempelSisa(labelObject, _sisaTakBermodel(element, labelDimodel));

                                results.push(labelObject);

                                const labelContentEl = element.querySelector('.label-group-content');
                                results.push(...processChildren(labelContentEl ? Array.from(labelContentEl.children) : []));

                                const mainLabelJumpTarget = element.querySelector('.label-jump-target')?.value;
                                if (mainLabelJumpTarget) {
                                    results.push({ type: 'jump', target: mainLabelJumpTarget });
                                } else if (element.nextElementSibling &&
                                    !element.nextElementSibling.classList.contains('label-group-container')) {
                                    // Marker hanya diperlukan bila ada node level-phase
                                    // setelah grup. Pada akhir phase / sebelum label baru,
                                    // batas sudah eksplisit dan menambah jump mengubah data.
                                    results.push({ type: 'jump', target: '##EXIT_LABEL##' });
                                }
                            }
                        } else if (element.classList.contains('sub-label-container')) {
                            const parentLabelName = element.dataset.parentName;
                            const subLabelName = (element.querySelector('.sub-label-name-input')?.value || '').trim();
                            if (parentLabelName && subLabelName) {
                                // Sub-label = `label` biasa di mata engine, jadi ia sah membawa
                                // bgm/background/audioChannels walau UI-nya hanya memodel nama.
                                // Baseline menutup kelas kebocoran yang sama seperti phase/label.
                                const subLabelObject = { type: 'label', name: `${parentLabelName}.${subLabelName}` };
                                _tempelSisa(subLabelObject, _sisaTakBermodel(element, ['type', 'name']));
                                results.push(subLabelObject);
                                const subContentEl = element.querySelector('.sub-label-content');
                                results.push(...processChildren(subContentEl ? Array.from(subContentEl.children) : []));
                                const subLabelJumpTarget = element.querySelector('.sub-label-jump-target')?.value;
                                if (subLabelJumpTarget && subLabelJumpTarget !== '##EXIT_SUB_LABEL##') {
                                    results.push({ type: 'jump', target: subLabelJumpTarget });
                                }
                            }
                        } else if (element.classList.contains('dialogue-entry-card')) {
                            results.push(extractDataFromCard(element));
                        }
                    });
                    return results;
                };

                const phaseContentEl = phaseCard.querySelector('.phase-content');
                const topLevelChildren = phaseContentEl ? Array.from(phaseContentEl.children) : [];
                let processedEntries = processChildren(topLevelChildren);

                newScriptData.push(...processedEntries);

                const phaseJumpTarget = phaseCard.querySelector('.phase-jump-target')?.value;
                if (phaseJumpTarget && !phaseObject.isEnding) {
                    newScriptData.push({ type: 'jump', target: phaseJumpTarget });
                }
            });
            return newScriptData;
        }
        window.collectScriptDataFromEditor = collectScriptDataFromEditor;

        async function saveScriptChanges() {
            if (!currentlyEditing.novel || !currentlyEditing.chapter) {
                showNotification('Tidak ada chapter yang dipilih untuk disimpan.', 'error');
                return;
            }

            // PENTING (cegah kehilangan data): isi simpanan dikumpulkan dari DOM
            // #script-editor-area. Bila editor TIDAK sedang memegang isi chapter ini
            // (gagal muat, masih memuat, atau area sudah dibersihkan), koleksi menghasilkan
            // [] dan dulu itu tetap ditulis ke disk — menghapus seluruh naskah chapter.
            // Latch di-set hanya setelah render sukses (loadChapterScript), jadi ia
            // membedakan "chapter memang kosong" (boleh disimpan) dari "editor belum
            // memuatnya" (tolak).
            if (window._scriptLoadedChapter !== currentlyEditing.chapter) {
                showNotification(
                    'Script chapter ini belum termuat di editor, jadi penyimpanan dibatalkan agar naskahmu tidak tertimpa kosong. Buka ulang chapter-nya lalu simpan.',
                    'error'
                );
                return;
            }

            const newScriptData = collectScriptDataFromEditor();

            saveScriptBtn.textContent = 'Menyimpan...';
            saveScriptBtn.disabled = true;
            try {
                console.log("Data yang akan disimpan:", JSON.stringify(newScriptData, null, 2));
                // Handler menangkap error filesystem dan mengembalikan
                // `{ success:false }` (bukan me-reject Promise). Wajib lewat helper
                // checked supaya jalur sukses di bawah tidak dijalankan saat disk gagal.
                const result = await VN.Utils.invokeChecked(ipcRenderer, 'save-script-content', {
                    storyTitle: currentlyEditing.novel,
                    chapterName: currentlyEditing.chapter,
                    scriptContent: newScriptData
                });
                showNotification(result.message, 'success');

                // Tandai script "bersih" agar konfirmasi saat Back akurat.
                if (typeof window._markScriptSaved === 'function') window._markScriptSaved();

                // Sprint 4: Jalankan lint ringan setelah save berhasil
                _lintScriptData(newScriptData);
                return true;
            } catch (error) {
                showNotification('Gagal menyimpan: ' + error.message, 'error');
                console.error("Error saat menyimpan skrip:", error);
                return false;
            } finally {
                saveScriptBtn.textContent = 'Simpan Perubahan';
                saveScriptBtn.disabled = false;
            }
        }
        // Ekspor eksplisit untuk orkestrasi lintas-file dan regression test. Classic
        // script sebelumnya mengandalkan implicit global function binding.
        window.saveScriptChanges = saveScriptChanges;

        // ==========================================
        // SPRINT 4: LINT RINGAN SAAT SAVE
        // Validasi non-blocking — hanya informatif
        // ==========================================

        async function _lintScriptData(scriptData) {
            const lintResults = [];

            // Kumpulkan semua label dan phase names
            const allLabels = new Set();
            const allPhases = new Set();
            const labelEntryCount = {};  // label → jumlah entry setelahnya
            const allJumpTargets = [];
            const allChoiceJumps = [];

            let currentContainer = null; // Track label/phase context

            scriptData.forEach((entry, idx) => {
                if (entry.type === 'phase') {
                    allPhases.add(entry.name);
                    currentContainer = entry.name;
                    labelEntryCount[entry.name] = 0;
                } else if (entry.type === 'label') {
                    allLabels.add(entry.name);
                    currentContainer = entry.name;
                    labelEntryCount[entry.name] = 0;
                } else if (entry.type === 'jump') {
                    allJumpTargets.push({ target: entry.target, context: currentContainer, index: idx });
                    if (currentContainer && labelEntryCount[currentContainer] !== undefined) {
                        // jump sendiri tidak dihitung sebagai entry konten
                    }
                } else {
                    // Entry konten (dialogue, choice, scene, set_var, custom)
                    if (currentContainer && labelEntryCount[currentContainer] !== undefined) {
                        labelEntryCount[currentContainer]++;
                    }
                    // Kumpulkan choice jump targets
                    if (entry.type === 'choice' && entry.choices) {
                        entry.choices.forEach(opt => {
                            if (opt.jump && opt.jump.trim() && !opt.jump.startsWith('##')) {
                                allChoiceJumps.push({ target: opt.jump, text: opt.text, context: currentContainer });
                            }
                        });
                    }
                }
            });

            // 1. Orphan labels — label tanpa entry di dalamnya
            Object.entries(labelEntryCount).forEach(([name, count]) => {
                if (count === 0 && allLabels.has(name)) {
                    lintResults.push({ type: 'warning', text: `Label "${name}" tidak memiliki entri di dalamnya (orphan label).` });
                }
            });

            // 2. Jump target tidak valid
            const allTargetNames = new Set([...allLabels, ...allPhases]);
            allJumpTargets.forEach(jt => {
                if (!jt.target || jt.target.startsWith('##')) return; // Special commands OK
                // Dropdown fase menggunakan prefix "fase:" pada value-nya — strip sebelum validasi
                const resolvedTarget = jt.target.startsWith('fase:') ? jt.target.slice(5) : jt.target;
                if (!allTargetNames.has(resolvedTarget)) {
                    lintResults.push({ type: 'error', text: `Jump target "${jt.target}" tidak ditemukan (dari ${jt.context || 'unknown'}).` });
                }
            });

            // 3. Choice jump targets tidak valid
            allChoiceJumps.forEach(cj => {
                if (!allTargetNames.has(cj.target)) {
                    lintResults.push({ type: 'error', text: `Pilihan "${cj.text}" menuju target "${cj.target}" yang tidak ditemukan (dari ${cj.context || 'unknown'}).` });
                }
            });

            // 4. Duplikat menu button di hub (jika hubConfig tersedia)
            if (window.hubConfig && window.hubConfig.menu && window.hubConfig.menu.items) {
                const menuLabels = window.hubConfig.menu.items.map(item => item.label?.trim().toLowerCase()).filter(Boolean);
                const seen = new Set();
                menuLabels.forEach(label => {
                    if (seen.has(label)) {
                        lintResults.push({ type: 'warning', text: `Menu hub memiliki tombol duplikat: "${label}".` });
                    }
                    seen.add(label);
                });
            }

            // 5. Aset hilang (sprite/background/bgm/sfx/voice) — cek main process,
            // referensi aset yang salah ketik/hilang sebelumnya gagal diam-diam saat dimainkan.
            try {
                const assetResult = await ipcRenderer.invoke('lint-novel-assets', {
                    storyTitle: currentlyEditing.novel,
                    chapter: currentlyEditing.chapter,
                    scriptData
                });
                if (assetResult && assetResult.success && assetResult.missing.length > 0) {
                    assetResult.missing.forEach(m => {
                        lintResults.push({
                            type: 'warning',
                            text: `Entri #${m.index} (${m.entryType}): aset "${m.field}" tidak ditemukan → "${m.value}".`
                        });
                    });
                }
            } catch (e) {
                console.warn('[Lint] Gagal menjalankan lint aset:', e);
            }

            // Tampilkan hasil lint
            if (lintResults.length > 0) {
                _showLintResults(lintResults);
            }
        }

        function _showLintResults(results) {
            const errorCount = results.filter(r => r.type === 'error').length;
            const warningCount = results.filter(r => r.type === 'warning').length;
            const infoCount = results.filter(r => r.type === 'info').length;

            let summary = '📋 Lint: ';
            const parts = [];
            if (errorCount > 0) parts.push(`${errorCount} error`);
            if (warningCount > 0) parts.push(`${warningCount} peringatan`);
            if (infoCount > 0) parts.push(`${infoCount} info`);
            summary += parts.join(', ');

            // Buat detail HTML untuk toast
            let detailText = results.map(r => {
                const icon = r.type === 'error' ? '❌' : r.type === 'warning' ? '⚠️' : 'ℹ️';
                return `${icon} ${r.text}`;
            }).join('\n');

            // Tampilkan sebagai toast dengan detail
            VN.Toast.show(summary, {
                type: errorCount > 0 ? 'error' : 'warning',
                duration: 8000,
                actions: [{
                    label: 'Lihat Detail',
                    onClick: function() {
                        _showLintPanel(results);
                    }
                }]
            });

            console.log('[Lint]', summary);
            results.forEach(r => console.log(`  [${r.type}] ${r.text}`));
        }

        function _showLintPanel(results) {
            // Hapus panel sebelumnya jika ada
            const existing = document.getElementById('lint-results-panel');
            if (existing) existing.remove();

            const panel = document.createElement('div');
            panel.id = 'lint-results-panel';
            panel.className = 'lint-results-panel';

            const errorCount = results.filter(r => r.type === 'error').length;
            const warningCount = results.filter(r => r.type === 'warning').length;

            panel.innerHTML = `
                <div class="lint-results-header" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                    <span class="lint-results-title">
                        📋 Hasil Lint — ${errorCount} error, ${warningCount} peringatan
                    </span>
                    <span style="color: #666; font-size: 0.8em;">klik untuk buka/tutup</span>
                </div>
                <div class="lint-results-body">
                    ${results.map(r => `
                        <div class="lint-item lint-${r.type}">
                            <span class="lint-item-icon">${r.type === 'error' ? '❌' : r.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                            <span>${r.text}</span>
                        </div>
                    `).join('')}
                </div>
            `;

            // Sisipkan panel di bawah save button
            const saveBtn = document.getElementById('save-script-btn');
            if (saveBtn && saveBtn.parentElement) {
                saveBtn.parentElement.insertAdjacentElement('afterend', panel);
            } else {
                // Fallback: tampilkan di workspace controls bar
                const controlsBar = document.getElementById('workspace-controls-bar');
                if (controlsBar) controlsBar.appendChild(panel);
            }
        }

        // Hapus lint panel — dipanggil saat ganti novel atau ganti chapter
        window.clearLintPanel = function() {
            document.getElementById('lint-results-panel')?.remove();
        };
