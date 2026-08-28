// === editorCanvas.js ===

        // Model alur murni untuk batas phase/label. Diletakkan sebelum renderer agar
        // proses LOAD dan renderer memakai aturan yang sama, sementara golden test
        // dapat mengujinya tanpa Electron/DOM. Format script tetap flat; struktur ini
        // hanya proyeksi editor dan tidak boleh mengubah urutan/isi node.
        (function initVNEditorFlowModel(root) {
            function isSimpleTerminalJump(entry) {
                if (!entry || entry.type !== 'jump' || typeof entry.target !== 'string' || !entry.target) {
                    return false;
                }
                // Dropdown hanya memodel `target`. Begitu ada field lain (condition,
                // targetVar/targetConcat, id, metadata extension, dst), jump WAJIB
                // tetap menjadi kartu agar baseline dan perilakunya tidak tersedot.
                const semanticKeys = Object.keys(entry);
                return semanticKeys.length === 2 && semanticKeys.includes('type') && semanticKeys.includes('target');
            }

            function groupScriptByPhase(scriptData) {
                const phaseGroups = [];
                let currentPhaseGroup = null;

                (Array.isArray(scriptData) ? scriptData : []).forEach(entry => {
                    if (entry && entry.type === 'phase') {
                        // Phase eksplisit tetap merupakan data meski kosong. Aturan lama
                        // hanya push grup berisi entry sehingga phase kosong/beruntun lenyap.
                        if (currentPhaseGroup) phaseGroups.push(currentPhaseGroup);
                        currentPhaseGroup = { phase: entry, entries: [], implicit: false };
                        return;
                    }

                    // Script legacy boleh dimulai tanpa header phase. Hanya untuk kasus
                    // itu dibuat phase `default` implisit; ia tidak diserialisasi kembali.
                    if (!currentPhaseGroup) {
                        currentPhaseGroup = {
                            phase: { type: 'phase', name: 'default' },
                            entries: [],
                            implicit: true
                        };
                    }
                    currentPhaseGroup.entries.push(entry);
                });

                if (currentPhaseGroup) phaseGroups.push(currentPhaseGroup);
                return phaseGroups;
            }

            function structurePhaseEntries(entries) {
                const structured = [];
                let currentLabelGroup = null;
                let currentSubLabelGroup = null;

                (Array.isArray(entries) ? entries : []).forEach(entry => {
                    if (entry && entry.type === 'label') {
                        const entryName = typeof entry.name === 'string' ? entry.name : '';
                        const parentName = currentLabelGroup && currentLabelGroup.label
                            ? String(currentLabelGroup.label.name || '') : '';
                        const isChildOfCurrent = !!parentName && entryName.startsWith(parentName + '.');

                        if (entryName.includes('.') && isChildOfCurrent) {
                            currentSubLabelGroup = {
                                type: 'sub_label_group', label: entry, children: [], terminalJump: null
                            };
                            currentLabelGroup.children.push(currentSubLabelGroup);
                        } else {
                            // Label bertitik tanpa induk yang cocok BUKAN sampah. Render
                            // sebagai label mandiri dengan nama utuh agar round-trip aman.
                            currentLabelGroup = {
                                type: 'label_group', label: entry, children: [], terminalJump: null
                            };
                            structured.push(currentLabelGroup);
                            currentSubLabelGroup = null;
                        }
                        return;
                    }

                    if (entry && entry.type === 'jump' && isSimpleTerminalJump(entry)) {
                        if (currentSubLabelGroup) {
                            currentSubLabelGroup.terminalJump = entry;
                            currentSubLabelGroup = null;
                            return;
                        }
                        if (currentLabelGroup) {
                            currentLabelGroup.terminalJump = entry;
                            currentLabelGroup = null;
                            return;
                        }
                    }

                    // Conditional/dynamic/ber-metadata jump adalah node biasa. Ia tidak
                    // menutup grup karena kondisinya bisa gagal dan eksekusi harus lanjut.
                    const container = currentSubLabelGroup?.children || currentLabelGroup?.children;
                    if (container) container.push(entry); else structured.push(entry);
                });

                return structured;
            }

            function flattenStructuredEntries(nodes) {
                const flat = [];
                (Array.isArray(nodes) ? nodes : []).forEach(node => {
                    if (node && (node.type === 'label_group' || node.type === 'sub_label_group')) {
                        flat.push(node.label);
                        flat.push(...flattenStructuredEntries(node.children));
                        if (node.terminalJump) flat.push(node.terminalJump);
                    } else {
                        flat.push(node);
                    }
                });
                return flat;
            }

            function roundTripScriptData(scriptData) {
                const flat = [];
                groupScriptByPhase(scriptData).forEach(group => {
                    if (!group.implicit) flat.push(group.phase);
                    flat.push(...flattenStructuredEntries(structurePhaseEntries(group.entries)));
                });
                return flat;
            }

            root.VNEditorFlowModel = Object.freeze({
                isSimpleTerminalJump,
                groupScriptByPhase,
                structurePhaseEntries,
                flattenStructuredEntries,
                roundTripScriptData
            });
        })(window);

        // SortableJS menyimpan setiap root di registry global sampai instance-nya
        // di-destroy. Melepas subtree lewat `innerHTML = ''` saja membuat seluruh
        // chapter lama tetap tertahan di heap C++/Oilpan. Semua Sortable milik kanvas
        // script harus lewat dua helper ini agar satu root tidak mendapat instance
        // ganda dan lifecycle-nya dapat dibongkar sebelum kanvas diganti.
        const _scriptSortableInstances = new Map();

        function pasangScriptSortable(element, options) {
            if (!element || typeof Sortable === 'undefined') return null;
            let existing = null;
            try {
                existing = typeof Sortable.get === 'function' ? Sortable.get(element) : element.__vnScriptSortable;
            } catch (e) { existing = element.__vnScriptSortable || null; }
            if (existing) {
                _scriptSortableInstances.set(element, existing);
                return existing;
            }
            // Seluruh jalur reorder perlu menyegarkan nomor kartu ringkas. Membungkus
            // onEnd di satu tempat mencegah satu tipe kontainer terlupakan.
            const sortableOptions = Object.assign({}, options || {});
            const originalOnEnd = sortableOptions.onEnd;
            sortableOptions.onEnd = function (event) {
                if (typeof originalOnEnd === 'function') originalOnEnd.call(this, event);
                if (typeof window._renumberCompactEntries === 'function') {
                    window._renumberCompactEntries(document.getElementById('script-editor-area'));
                }
            };
            const instance = new Sortable(element, sortableOptions);
            element.__vnScriptSortable = instance;
            element.dataset.vnScriptSortable = 'true';
            _scriptSortableInstances.set(element, instance);
            return instance;
        }

        function destroyScriptEditorSortables(root) {
            root = root || document.getElementById('script-editor-area');
            if (!root) return 0;
            let destroyed = 0;
            Array.from(_scriptSortableInstances.entries()).forEach(function (entry) {
                const element = entry[0];
                const instance = entry[1];
                const milikRoot = !!element && (element === root ||
                    (typeof root.contains === 'function' && root.contains(element)));
                if (!milikRoot) return;
                if (instance && typeof instance.destroy === 'function') {
                    try { instance.destroy(); destroyed++; } catch (e) {
                        console.warn('[VN Editor] Gagal membongkar Sortable:', e);
                    }
                }
                _scriptSortableInstances.delete(element);
                if (element) {
                    try { delete element.__vnScriptSortable; } catch (e) { element.__vnScriptSortable = null; }
                    if (element.dataset) delete element.dataset.vnScriptSortable;
                }
            });
            return destroyed;
        }
        window.destroyScriptEditorSortables = destroyScriptEditorSortables;

        // Menyetel nilai select tidak boleh menghapus target lama hanya karena label/
        // phase tujuannya kini orphan. Opsi peringatan membuat nilai tetap terlihat dan
        // tetap terserialisasi sampai kreator sengaja menggantinya.
        function setFlowSelectValuePreservingUnknown(select, value) {
            if (!select || !value) return;
            const known = Array.from(select.options || []).some(option => option.value === value);
            if (!known) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = `⚠ Target lama (dipertahankan): ${value}`;
                option.dataset.preservedUnknown = 'true';
                select.appendChild(option);
            }
            select.value = value;
        }

        /**
         * Opsi transisi MASUK label — diturunkan dari kosakata player yang
         * benar-benar menjalankan chapter ini, bukan daftar tetap.
         *
         * Dulu isinya dua `<option>` tulis tangan (fade_black / fade_white),
         * padahal runtime menjalankan nama APA PUN yang terdaftar di VNRegistry
         * (core.js → execute-transition → VNRegistry.get). Akibatnya transisi
         * yang didaftarkan kreator di `extensions/` atau di dalam player.html-nya
         * sendiri tak pernah bisa dipilih dari sini. Kartu entri (scene) sudah
         * lama memakai kosakata ini; label yang tertinggal.
         *
         * `cut` sengaja dibuang: opsi kosong di atasnya sudah berarti hal yang
         * sama (core.js membaca `transition || 'cut'`), dan dua baris bermakna
         * identik cuma membuat pemilihnya ragu. Nilai kosong itu pula yang
         * menjaga label tanpa transisi tetap tak menulis kunci saat disimpan.
         */
        function labelEntryTransitionOptionsHTML(selected) {
            const C = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.C : null;
            if (!C || typeof C.optionsToHTML !== 'function') return '';
            // Item bergrup tak punya `.value`, jadi penyaring ini hanya menyentuh
            // opsi tingkat atas — persis di mana `cut` berada.
            const opsi = (C.TRANSITION_IN || []).filter((o) => o.value !== 'cut');
            return C.optionsToHTML(opsi, selected || '');
        }

        // Helper: generate buttons untuk tipe extension dari NodeRegistry
        const _BUILTIN_TYPES = ['dialogue', 'choice', 'scene', 'set_var', 'custom', 'label', 'phase', 'jump'];
        function getExtensionEntryButtons() {
            if (!VN || !VN.NodeRegistry) return '';
            return VN.NodeRegistry.getAll()
                .filter(function(t) { return _BUILTIN_TYPES.indexOf(t.id) === -1; })
                .map(function(t) {
                    var lbl = t.label || t.id;
                    return '<button class="add-entry-btn" data-type="' + t.id + '">+ ' + lbl + '</button>';
                })
                .join('\n');
        }

        // `entriAsli` opsional: entri label mentah dari script.json. Dipakai sebagai
        // BASELINE saat menyimpan — sub-label adalah `label` biasa di mata engine
        // (titik di namanya hanya urusan navigasi), jadi ia SAH membawa `bgm`,
        // `background`, `audioChannels`, dst. UI-nya cuma memodel nama, jadi tanpa
        // baseline kunci lain akan dibuang. Hari ini nol sub-label memakainya —
        // baseline ini menutup kelasnya sebelum ada yang memakainya.
        // Sub-label BARU (dibuat dari tombol) tak punya entri asli → tanpa baseline,
        // dan itu benar: tak ada apa pun untuk dipertahankan.
        function createSubLabelElement(name = '', parentLabelName = '', jumpTarget = '', entriAsli = null) {
            // Log saat fungsi ini dipanggil dan nilai apa yang diterimanya
            console.log(`[SubLabel Creator] Membuat sub-label '${name}' dengan jumpTarget awal: '${jumpTarget}'`);

            const subLabelContainer = document.createElement('div');
            subLabelContainer.className = 'sub-label-container';
            subLabelContainer.dataset.type = 'sub-label';
            subLabelContainer.dataset.parentName = parentLabelName;
            if (entriAsli) {
                try { subLabelContainer.dataset.rawEntry = JSON.stringify(entriAsli); }
                catch (e) { /* tak bisa diserialisasi → perilaku lama */ }
            }

            subLabelContainer.innerHTML = `
                <div class="sub-label-header">
                    <div class="drag-handle">⠿</div>
                    <span class="label-icon">🏷️</span>
                    <input type="text" class="script-input sub-label-name-input" value="${name}" placeholder="Nama sub-label...">
                    <button type="button" class="delete-dialogue-btn" title="Hapus Sub Label dan Isinya">×</button>
                </div>
                <div class="sub-label-content">
                    </div>
                <div class="phase-card-controls sub-label-controls" style="padding: 10px 15px; border-top: 1px solid #3a3a3a;">
                    <button class="add-entry-btn" data-type="dialogue">+ Tambah Dialog</button>
                    <button class="add-entry-btn" data-type="choice">+ Tambah Pilihan</button>
                    <button class="add-entry-btn" data-type="set_var">+ Tambah Variabel</button>
                    <button class="add-entry-btn" data-type="custom">+ Tambah Custom Cmd</button>
                    ${getExtensionEntryButtons()}
                </div>
                <div class="sub-label-flow-control">
                    <label>Alur selanjutnya:</label>
                    <select class="sub-label-jump-target">
                        <option value="##EXIT_SUB_LABEL##">Selesaikan sub-label ini (Default)</option>
                        <optgroup label="------ Perintah Khusus ------">
                            <option value="##CONTINUE_PARENT_FLOW##">Lanjut di Label Induk (lewati sisa sub-label)</option>
                            <option value="##FINISH_PARENT##" class="option-main-label">Selesaikan Label "${parentLabelName}"</option>
                        </optgroup>
                    </select>
                </div>
            `;

            const dropdown = subLabelContainer.querySelector('.sub-label-jump-target');
            if (dropdown) {
                console.log(`[SubLabel Creator] ...Mencoba mengatur dropdown.value menjadi '${jumpTarget}'`);
                setFlowSelectValuePreservingUnknown(dropdown, jumpTarget);
                // Log nilai aktual setelah di-set untuk verifikasi
                console.log(`[SubLabel Creator] ...Nilai dropdown setelah diatur adalah: '${dropdown.value}'`);
                updateSelectColor(dropdown);
            }

            const contentArea = subLabelContainer.querySelector('.sub-label-content');
            pasangScriptSortable(contentArea, {
                group: {
                    name: 'phase-entries',
                    // penjaga gerbang antar kontainer
                    put: function (toList, fromList, draggedEl) {
                        const draggedType = draggedEl.dataset.type;
                        const sourceType = getDragContext(fromList);
                        const targetType = getDragContext(toList);

                        // ATURAN 1: Sub-label tidak boleh pindah ke kontainer lain sama sekali.
                        if (draggedType === 'sub-label') {
                            return false;
                        }

                        // ATURAN 2: Choice memiliki aturan ketat.
                        if (draggedType === 'choice') {
                            // Dilarang pindah dari Fase ke dalam Label/SubLabel.
                            if (sourceType === 'Phase' && (targetType === 'Label' || targetType === 'SubLabel')) {
                                return false;
                            }
                            // Dilarang pindah dari Label/SubLabel keluar ke Fase.
                            if ((sourceType === 'Label' || sourceType === 'SubLabel') && targetType === 'Phase') {
                                return false;
                            }
                        }

                        // ATURAN LAMA: Mencegah Label bersarang di dalam Label lain.
                        if (draggedEl.classList.contains('label-group-container') && (targetType === 'Label' || targetType === 'SubLabel')) {
                            return false;
                        }

                        // Jika semua aturan di atas lolos, izinkan.
                        return true;
                    }
                },
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                forceFallback: true,
                fallbackOnBody: true,

                // --- onMove untuk memberikan feedback ---
                // Catatan: aturan lama "scene tidak boleh jadi entri pertama" sudah DICABUT —
                // akar masalahnya (flicker keluar dari text_screen) diperbaiki di engine
                // 2026-07-02 (lihat docs/elaina-vn-build-findings.md Bug 2), jadi scene apa pun
                // kini aman di posisi mana pun.
                onMove: function (evt) {
                    // Validasi perpindahan antar kontainer
                    if (evt.from !== evt.to) {
                        // Kita panggil logika 'put' secara manual untuk memeriksa validitas
                        const canPut = this.options.group.put(evt.to, evt.from, evt.dragged);
                        if (!canPut) {
                            document.body.classList.add('invalid-drag-state');
                            dragTooltip.textContent = "🚫 Tipe entri ini tidak bisa dipindahkan ke sini.";
                            return false;
                        }
                    }

                    // Jika semua valid, pastikan state bersih
                    document.body.classList.remove('invalid-drag-state');
                    return true;
                },

                onEnd: function (evt) {
                    // Cleanup tetap sama
                    document.body.classList.remove('invalid-drag-state');
                },
            });

            return subLabelContainer;
        }

        // pratinjau saat item aset diklik

        function getDragContext(sortableList) {
            if (sortableList.closest('.sub-label-container')) {
                return 'SubLabel';
            }
            if (sortableList.closest('.label-group-container')) {
                return 'Label';
            }
            if (sortableList.closest('.phase-card')) {
                return 'Phase';
            }
            return null;
        }

        /**
         * UX-A06 — baris untuk transisi yang DIPERTAHANKAN tetapi tak dieksekusi.
         *
         * Phase exit dan Label exit selama ini punya dropdown penuh di editor,
         * padahal `transitionOut` hanya dibaca `display-controller.js` di dalam
         * cabang `data.type === 'scene'`. Untuk phase/label runtime tak pernah
         * menjalankannya — kontrol mati, kelas yang sama dengan Background/Gaya
         * yang dicabut di UX-A03. Dropdown-nya juga hardcoded, jadi nilai dari
         * extension kreator bahkan tak punya opsinya dan berisiko tertimpa.
         *
         * Kontrolnya dicabut, TETAPI nilainya tidak dihapus: kolektor membawanya
         * lewat baseline `rawEntry`, dan baris ini yang membuatnya tetap terlihat.
         * Aturan UX #3 — advanced boleh tersembunyi, tidak boleh hilang.
         *
         * Novel bersih tidak melihat apa pun: '' saat tak ada nilai lama.
         */
        function inertTransitionNoticeHTML(value, judul) {
            if (!value) return '';
            const esc = (typeof window.escapeHtml === 'function') ? window.escapeHtml : function (v) { return v; };
            return `
                <div class="inert-transition-notice"
                     title="Nilai ini tetap tersimpan apa adanya di script.json dan tidak hilang saat kamu menyimpan.">
                    <span class="inert-transition-label">${esc(judul)}</span>
                    <code class="inert-transition-value">${esc(String(value))}</code>
                    <span class="inert-transition-why">tersimpan, belum dijalankan runtime</span>
                </div>`;
        }

        /**
         * Penomoran kartu untuk menamai grup radio dan mengaitkan label ke
         * checkbox. Sengaja BUKAN nama fase/label: nama boleh kosong, boleh
         * kembar, dan berubah begitu pengguna mengetik.
         */
        let _nomorKartu = 0;
        function _idKartuBerikutnya() { return ++_nomorKartu; }

        // membuat kartu fase lengkap
        /**
         * @param {{langkah?: Function[]}} [opts] Bila `opts.langkah` diberikan, kartu
         *   fase dikembalikan SEGERA dengan wadah entri yang masih kosong, dan
         *   pekerjaan beratnya dititipkan ke array itu sebagai daftar closure —
         *   satu per node tingkat atas, ditutup satu langkah finalisasi. Pemanggil
         *   yang menjalankannya bertahap membuat utas UI bernapas di antara batch.
         *
         *   TANPA `opts`, urutan eksekusinya IDENTIK dengan sebelumnya — itu syarat
         *   yang sengaja dipegang, karena jalur sinkron masih dipakai undo/redo dan
         *   tombol "Tambah Fase".
         */
        function createPhaseEditorCard(group = { phase: {}, entries: [] }, availableLabels = [], availablePhases = [], isFirstPhase = false, opts = null) {
            const _tunda = !!(opts && Array.isArray(opts.langkah));
            const phaseCard = document.createElement('div');
            phaseCard.className = `phase-card ${group.phase?.isEnding ? 'is-ending' : ''}`.trim();
            phaseCard.dataset.phaseName = group.phase.name || 'default';
            phaseCard.dataset.implicitPhase = group.implicit ? 'true' : 'false';
            // Baseline entri MENTAH — obat yang sama dengan kartu entri (FB19).
            // Kolektor simpan membangun ulang phase dari input header, jadi kunci yang
            // tak punya input DIBUANG diam-diam (`spriteSticky`, `audioChannels`,
            // `bgmLoopStart` terbukti hilang, audit 2026-07-31). Dengan baseline ini,
            // kunci tak bermodel ikut tertulis kembali — termasuk kunci yang BELUM ADA
            // hari ini, sehingga fitur engine berikutnya tak otomatis jadi kebocoran.
            try { phaseCard.dataset.rawEntry = JSON.stringify(group.phase || {}); }
            catch (e) { /* tak bisa diserialisasi → tanpa baseline, perilaku lama */ }

            const createImgPreview = (value, key) => {
                const src = value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}` : '';
                return `<img src="${src}" class="image-preview" data-preview-for="${key}" style="display: ${value ? 'block' : 'none'};" onload="this.style.display='block'" onerror="this.style.display='none'">`;
            };

            // Nama grup radio & id checkbox dihitung SEKALI di sini.
            // Sebelumnya keduanya ditulis `${group.phase.name || Math.random()}`
            // langsung di DUA tempat dalam satu template — dan `Math.random()`
            // dievaluasi ulang di tiap tempat. Fase tanpa nama karena itu
            // menghasilkan dua nama grup berbeda: Crop dan Fit bisa tercentang
            // berbarengan, kolektor mengambil yang pertama, dan pilihan Fit
            // tersimpan sebagai Crop. Label "Jadikan Fase Akhir" kehilangan
            // pasangan `for`-nya karena sebab yang sama. Kartu entri sudah lama
            // memakai pola satu-variabel ini (uniqueRadioName di entryEditorCard).
            const nomorKartu = _idKartuBerikutnya();
            const uniqueRadioName = `background-mode-${nomorKartu}`;
            const endingCheckId = `ending-check-${nomorKartu}`;

            const endingToggleHTML = isFirstPhase ? '' : `
                <div class="phase-ending-toggle">
                    <input type="checkbox" class="is-ending-checkbox" id="${endingCheckId}" ${group.phase.isEnding ? 'checked' : ''}>
                    <label for="${endingCheckId}">Jadikan Fase Akhir (Ending)</label>
                </div>
            `;

            // Determine initial value (video takes precedence if both exist, though they shouldn't)
            const initialMediaValue = group.phase.video || group.phase.background || '';
            const isVideo = !!group.phase.video;

            phaseCard.innerHTML = `
        <div class="phase-header">
            <h3>
                <input type="text" class="phase-name-input" value="${group.phase.name || ''}" placeholder="Nama Fase...">
                <button type="button" class="delete-phase-btn" title="Hapus Fase Ini">×</button>
            </h3>
            <div class="phase-assets">
                <div>
                    <label>Default Background (Gambar / Video)</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${initialMediaValue ? 'has-text' : ''}">
                            <input data-key="media" type="text" class="phase-media-input script-input" value="${initialMediaValue}" placeholder="Pilih file gambar atau video...">
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="all-media">📁</button>
                    </div>

                    <div class="media-preview-container" style="margin-top: 10px;">
                        <!-- Image Preview Wrapper -->
                        <div class="image-preview-wrapper" style="display: ${!isVideo && initialMediaValue ? 'block' : 'none'};">
                            <div class="image-preview-container-16-9">
                                <img class="image-preview" data-preview-for="background" src="${!isVideo && initialMediaValue ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${initialMediaValue}` : ''}" style="display: ${!isVideo && initialMediaValue ? 'block' : 'none'};">
                            </div>
                            <div class="background-mode-options">
                                <label>Tampilan:</label>
                                <label>
                                    <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="cover" ${!group.phase.backgroundMode || group.phase.backgroundMode === 'cover' ? 'checked' : ''}> Crop (Penuhi Layar)
                                </label>
                                <label>
                                    <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="contain" ${group.phase.backgroundMode === 'contain' ? 'checked' : ''}> Fit (Tampilkan Utuh)
                                </label>
                            </div>
                        </div>

                        <!-- Video Preview Wrapper -->
                        <div class="video-preview-wrapper" style="display: ${isVideo ? 'block' : 'none'};">
                            <div class="video-preview-container" style="width: 100%; aspect-ratio: 16 / 9; background-color: #000; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid #444;">
                                <video class="video-preview" data-preview-for="video" controls muted src="${isVideo ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${initialMediaValue}` : ''}" style="display: ${isVideo ? 'block' : 'none'}; width: 100%; height: 100%; object-fit: contain;"></video>
                            </div>
                        </div>
                        
                        <span class="preview-placeholder" style="display: ${!initialMediaValue ? 'block' : 'none'}; color: #777; text-align: center; padding: 20px; border: 1px dashed #555; border-radius: 4px;">Belum ada background dipilih...</span>
                    </div>
                </div>
                <div>
                    <label>Default BGM</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${group.phase.bgm ? 'has-text' : ''}">
                            <input data-key="bgm" type="text" class="phase-default-bgm-input script-input audio-input" value="${group.phase.bgm || ''}" placeholder="Pilih file audio...">
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                    </div>
                    <div class="audio-preview-placeholder" data-src="${group.phase.bgm || ''}" data-preview-for="bgm"></div>
                </div>
            </div>
            ${endingToggleHTML}
        </div>
    `;

            const bgmInput = phaseCard.querySelector('.phase-default-bgm-input');
            const bgmVolumeControl = createAudioControls('bgm', group.phase);
            bgmInput.closest('.file-input-group').after(bgmVolumeControl);
            linkAudioInputToVolumeControl(bgmInput, bgmVolumeControl);

            // Logic to handle input changes and update preview
            const mediaInput = phaseCard.querySelector('.phase-media-input');
            const imageWrapper = phaseCard.querySelector('.image-preview-wrapper');
            const videoWrapper = phaseCard.querySelector('.video-preview-wrapper');
            const placeholder = phaseCard.querySelector('.preview-placeholder');
            const imgPreview = phaseCard.querySelector('.image-preview');
            const videoPreview = phaseCard.querySelector('.video-preview');

            const updateMediaPreview = (filename) => {
                if (!filename) {
                    imageWrapper.style.display = 'none';
                    videoWrapper.style.display = 'none';
                    placeholder.style.display = 'block';
                    return;
                }

                const ext = filename.split('.').pop().toLowerCase();
                const isVideoFile = ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext);
                const src = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${filename}`;

                if (isVideoFile) {
                    imageWrapper.style.display = 'none';
                    videoWrapper.style.display = 'block';
                    placeholder.style.display = 'none';
                    videoPreview.src = src;
                    videoPreview.style.display = 'block';
                    videoPreview.load();
                } else {
                    imageWrapper.style.display = 'block';
                    videoWrapper.style.display = 'none';
                    placeholder.style.display = 'none';
                    imgPreview.src = src;
                    imgPreview.style.display = 'block';
                }
            };

            mediaInput.addEventListener('input', (e) => {
                updateMediaPreview(e.target.value);
            });

            const contentDiv = document.createElement('div');
            contentDiv.className = 'phase-content';

            const lastEntryOfPhase = group.entries[group.entries.length - 1];
            const phaseTerminalJump = window.VNEditorFlowModel.isSimpleTerminalJump(lastEntryOfPhase) &&
                lastEntryOfPhase.target.startsWith('fase:') ? lastEntryOfPhase : null;
            const entriesForCanvas = phaseTerminalJump ? group.entries.slice(0, -1) : group.entries;
            const structuredEntries = window.VNEditorFlowModel.structurePhaseEntries(entriesForCanvas);

            let jadwalkanNode;
            const renderNode = (node, parentContainer, deferChildren, contextName, anchor) => {
                if (node.isDefaultAssetHolder) {
                    return;
                }

                const inLabelContext = parentContainer.matches('.label-group-content, .sub-label-content');

                if (node.type === 'label_group') {
                    const labelGroupEl = createLabelGroupElement(node.label, availableLabels, availablePhases, node.label);

                    const dropdown = labelGroupEl.querySelector('.label-jump-target');
                    if (dropdown && node.terminalJump) {
                        setFlowSelectValuePreservingUnknown(dropdown, node.terminalJump.target);
                        updateSelectColor(dropdown);
                    }
                    const contentContainer = labelGroupEl.querySelector('.label-group-content');

                    const namaBagian = String((node.label && node.label.name) || contextName || '');
                    node.children.forEach(childNode => {
                        if (deferChildren) jadwalkanNode(childNode, contentContainer, namaBagian);
                        else renderNode(childNode, contentContainer, false, namaBagian);
                    });
                    parentContainer.appendChild(labelGroupEl);

                } else if (node.type === 'sub_label_group') {
                    const parentGroup = parentContainer.closest('.label-group-container');
                    const parentName = parentGroup?.querySelector('.label-name-input')?.value ||
                        String(node.label.name || '').split('.')[0] || '';
                    const subLabelName = String(node.label.name || '').startsWith(parentName + '.')
                        ? String(node.label.name).slice(parentName.length + 1)
                        : String(node.label.name || '');
                    const subLabelEl = createSubLabelElement(subLabelName, parentName, '', node.label);
                    if (node.terminalJump) {
                        const dropdown = subLabelEl.querySelector('.sub-label-jump-target');
                        if (dropdown) {
                            setFlowSelectValuePreservingUnknown(dropdown, node.terminalJump.target);
                            updateSelectColor(dropdown);
                        }
                    }
                    const contentContainer = subLabelEl.querySelector('.sub-label-content');
                    const namaBagian = String((node.label && node.label.name) || contextName || '');
                    node.children.forEach(childNode => {
                        if (deferChildren) jadwalkanNode(childNode, contentContainer, namaBagian);
                        else renderNode(childNode, contentContainer, false, namaBagian);
                    });
                    parentContainer.appendChild(subLabelEl);
                } else {
                    const card = createEntryEditorCard(node.type, node, availableLabels, inLabelContext);
                    if (card && anchor && anchor.parentNode) anchor.replaceWith(card);
                    else if (card) parentContainer.appendChild(card);
                }
            };

            // Kerangka phase/label murah dibangun di muka; isi label dipecah per
            // entri agar satu label berisi ribuan dialog tidak menjadi satu task.
            jadwalkanNode = (node, parentContainer, contextName) => {
                if (node.type === 'label_group' || node.type === 'sub_label_group') {
                    renderNode(node, parentContainer, true, contextName);
                    return;
                }
                // Marker menjaga urutan asli ketika kerangka label setelahnya sudah
                // terpasang tetapi kartu ini baru dibangun pada batch berikutnya.
                const marker = document.createComment('vn-entry-pending');
                parentContainer.appendChild(marker);
                const tugas = () => renderNode(node, parentContainer, false, contextName, marker);
                tugas.nama = contextName || '';
                opts.langkah.push(tugas);
            };

            // Di jalur bertahap, node-node ini dititipkan ke `opts.langkah` di akhir
            // fungsi — bukan dibangun di sini.
            if (!_tunda) structuredEntries.forEach(node => renderNode(node, contentDiv, false, ''));
            phaseCard.appendChild(contentDiv);
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'phase-card-controls';
            controlsDiv.innerHTML = `
                <button class="add-entry-btn" data-type="label">+ Tambah Label</button>
                <button class="add-entry-btn" data-type="dialogue">+ Tambah Dialog</button>
                <button class="add-entry-btn" data-type="choice">+ Tambah Dialog ber-Pilihan Jawaban</button> 
                <button class="add-entry-btn" data-type="scene">+ Tambah Transisi</button>
                <button class="add-entry-btn" data-type="set_var">+ Tambah Variabel</button>
                <button class="add-entry-btn" data-type="custom">+ Tambah Custom Cmd</button>
                ${getExtensionEntryButtons()}
            `;

            // UX-A06: dropdown "Transisi Keluar Fase" DICABUT — runtime tak pernah
            // menjalankannya (lihat inertTransitionNoticeHTML). Nilai lama tetap
            // ditampilkan agar tidak menghilang tanpa jejak.
            const exitTransitionDiv = document.createElement('div');
            exitTransitionDiv.className = 'phase-exit-transition';
            exitTransitionDiv.innerHTML =
                inertTransitionNoticeHTML(group.phase.transitionOut, 'Transisi keluar fase');

            const flowControlDiv = document.createElement('div');
            flowControlDiv.className = 'phase-flow-control';
            const phaseOptions = availablePhases.filter(name => name !== group.phase.name).map(name => `<option value="fase:${name}">${name}</option>`).join('');
            flowControlDiv.innerHTML = `
                <div class="label-with-tooltip">
                    <label>Jika alur cerita sampai ke ujung fase ini, mau ke mana? :</label>
                    <div class="tooltip-trigger">?
                        <span class="tooltip-text">Pada kasus tertentu mungkin cerita/dialog yang kamu buat tidak akan selalu sampai di ujung Fase, karena bisa saja ada label yang kamu atur untuk keluar ke Fase lain.</span>
                    </div>
                </div>
                <select class="phase-jump-target">
                    <option value="">Lanjut ke fase berikutnya (Default)</option>
                    <optgroup label="------ Fase ------">${phaseOptions}</optgroup>
                </select>
            `;
            if (group.phase?.isEnding) {
                flowControlDiv.style.display = 'none';
            }
            phaseCard.appendChild(controlsDiv);
            phaseCard.appendChild(exitTransitionDiv);
            phaseCard.appendChild(flowControlDiv);
            const sortableGroupConfig = {
                name: 'phase-entries',
                put: function (toList, fromList, draggedEl) {
                    return !draggedEl.classList.contains('label-group-container');
                }
            };
            pasangScriptSortable(contentDiv, {
                group: {
                    name: 'phase-entries',
                    put: function (toList, fromList, draggedEl) {
                        const draggedType = draggedEl.dataset.type;
                        const sourceType = getDragContext(fromList);
                        const targetType = getDragContext(toList);

                        if (draggedType === 'sub-label') {
                            return false;
                        }

                        if (draggedType === 'choice') {
                            if (sourceType === 'Phase' && (targetType === 'Label' || targetType === 'SubLabel')) {
                                return false;
                            }
                            if ((sourceType === 'Label' || sourceType === 'SubLabel') && targetType === 'Phase') {
                                return false;
                            }
                        }

                        if (draggedEl.classList.contains('label-group-container') && (targetType === 'Label' || targetType === 'SubLabel')) {
                            return false;
                        }

                        return true;
                    }
                },
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                forceFallback: true,
                fallbackOnBody: true,

                onMove: function (evt) {
                    if (evt.from !== evt.to) {
                        const canPut = this.options.group.put(evt.to, evt.from, evt.dragged);
                        if (!canPut) {
                            document.body.classList.add('invalid-drag-state');
                            dragTooltip.textContent = "🚫 Tipe entri ini tidak bisa dipindahkan ke sini.";
                            return false;
                        }
                    }

                    document.body.classList.remove('invalid-drag-state');
                    return true;
                },

                onEnd: function (evt) {
                    document.body.classList.remove('invalid-drag-state');
                },
            });
            // Dua hal berikut MEMBACA entri yang sudah terpasang: Sortable untuk tiap
            // wadah label/sub-label, dan penggantian placeholder pratinjau audio.
            // Keduanya karena itu tak boleh berjalan sebelum entri ada — di jalur
            // bertahap ia jadi langkah TERAKHIR, sesudah seluruh node terpasang.
            const _finalisasiEntri = () => {
                const innerSortableContainers = phaseCard.querySelectorAll('.label-group-content, .sub-label-content');
                innerSortableContainers.forEach(container => {
                    pasangScriptSortable(container, {
                        group: {
                            name: 'phase-entries',
                            put: function (toList, fromList, draggedEl) {
                                const draggedType = draggedEl.dataset.type;
                                const sourceType = getDragContext(fromList);
                                const targetType = getDragContext(toList);

                                if (draggedType === 'sub-label') {
                                    return false;
                                }

                                if (draggedType === 'choice') {
                                    if (sourceType === 'Phase' && (targetType === 'Label' || targetType === 'SubLabel')) {
                                        return false;
                                    }
                                    if ((sourceType === 'Label' || sourceType === 'SubLabel') && targetType === 'Phase') {
                                        return false;
                                    }
                                }

                                if (draggedEl.classList.contains('label-group-container') && (targetType === 'Label' || targetType === 'SubLabel')) {
                                    return false;
                                }

                                return true;
                            }
                        },
                        animation: 150,
                        handle: '.drag-handle',
                        ghostClass: 'sortable-ghost',
                        forceFallback: true,
                        fallbackOnBody: true,

                        onMove: function (evt) {
                            if (evt.from !== evt.to) {
                                const canPut = this.options.group.put(evt.to, evt.from, evt.dragged);
                                if (!canPut) {
                                    document.body.classList.add('invalid-drag-state');
                                    dragTooltip.textContent = "🚫 Tipe entri ini tidak bisa dipindahkan ke sini.";
                                    return false;
                                }
                            }

                            document.body.classList.remove('invalid-drag-state');
                            return true;
                        },

                        onEnd: function (evt) {
                            document.body.classList.remove('invalid-drag-state');

                            // Update visibilitas kontrol transisi setelah drag karena posisi bisa berubah
                            // dan perbedaan sprite dengan entri sebelumnya mungkin tidak lagi relevan
                            if (typeof window.checkSpriteTransitionVisibility === 'function') {
                                setTimeout(window.checkSpriteTransitionVisibility, 100);
                            }
                        },
                    });
                });
                if (phaseTerminalJump) {
                    const phaseDropdown = phaseCard.querySelector('.phase-jump-target');
                    if (phaseDropdown) {
                        setFlowSelectValuePreservingUnknown(phaseDropdown, phaseTerminalJump.target);
                        updateSelectColor(phaseDropdown);
                    }
                }
                phaseCard.querySelectorAll('.audio-preview-placeholder').forEach(p => {
                    const src = p.dataset.src;
                    const key = p.dataset.previewFor;
                    p.replaceWith(createAudioPreview(src, key));
                });
            };
            if (!_tunda) _finalisasiEntri();

            const bgMode = group.phase.backgroundMode || 'cover';
            const bgModeRadio = phaseCard.querySelector(`input[data-key="backgroundMode"][value="${bgMode}"]`);
            const bgPreviewImg = phaseCard.querySelector('.image-preview[data-preview-for="background"]');

            if (bgModeRadio) {
                bgModeRadio.checked = true;
            }
            if (bgPreviewImg) {
                bgPreviewImg.style.objectFit = bgMode;
            }

            // Event listener untuk toggle tipe background
            phaseCard.querySelectorAll('.phase-bg-type-selector').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const type = e.target.value;
                    phaseCard.querySelectorAll('.phase-bg-input-group').forEach(group => {
                        group.style.display = group.dataset.type === type ? 'block' : 'none';
                    });
                });
            });

            // Event listener untuk preview video
            const videoInput = phaseCard.querySelector('.phase-default-video-input');
            if (videoInput) {
                const videoPreviewContainer = phaseCard.querySelector('.video-preview-container');
                const videoPreview = phaseCard.querySelector('.video-preview');
                const placeholder = videoPreviewContainer.querySelector('.preview-placeholder');

                const updateVideoPreview = () => {
                    const val = videoInput.value.trim();
                    if (val) {
                        videoPreview.src = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${val}`;
                        videoPreview.style.display = 'block';
                        placeholder.style.display = 'none';
                        videoPreviewContainer.style.display = 'flex';
                    } else {
                        videoPreview.style.display = 'none';
                        placeholder.style.display = 'block';
                        videoPreviewContainer.style.display = 'none';
                    }
                };
                videoInput.addEventListener('input', updateVideoPreview);
                // Trigger initial preview
                updateVideoPreview();
            }

            if (_tunda) {
                structuredEntries.forEach(node => jadwalkanNode(node, contentDiv, ''));
                opts.langkah.push(_finalisasiEntri);
            }

            return phaseCard;
        }

        // buat tombol "Tambah Fase"
        function createAddPhaseButton() {
            const buttonDiv = document.createElement('div');
            buttonDiv.id = 'add-phase-btn-styled';
            buttonDiv.innerHTML = `
        <div class="plus-icon">+</div>
        <div class="create-text">Tambah Fase Baru</div>
    `;
            return buttonDiv;
        }

        // ------------------- function createEntryEditorCard dipindah ke vnModules/editor/entryEditorCard.js ------------------- //
        // Catatan: updateSceneButtonStates() (menonaktifkan tombol "+ Tambah Transisi" di
        // kontainer kosong) sudah DIHAPUS — turunan aturan lama "scene tidak boleh jadi
        // entri pertama" yang akar masalahnya (flicker keluar text_screen) diperbaiki di
        // engine 2026-07-02 (docs/elaina-vn-build-findings.md Bug 2).


        function renderScriptEditor(scriptData) {
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.innerHTML = '';
            if (!scriptData || scriptData.length === 0) {
                scriptEditorArea.innerHTML = '<p style="opacity: 0.7;">Skrip masih kosong. Tambahkan entri pertama.</p>';
            }

            scriptData.forEach((entry, index) => {
                const card = document.createElement('div');
                card.className = 'dialogue-entry-card';
                card.dataset.index = index;
                card.dataset.type = entry.type; // Simpan tipe entri untuk proses save

                let contentHTML = '';

                // Fungsi helper untuk membuat preview gambar
                const createImgPreview = (name, value) => {
                    const imgSrc = value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}` : '';
                    return `<img src="${imgSrc}" class="image-preview" onerror="this.style.display='none'" onload="this.style.display='block'" alt="Preview">`;
                };

                switch (entry.type) {
                    case 'dialogue':
                        contentHTML = `
                    <label>Tipe: <strong>Dialog</strong></label>
                    <label>Speaker</label>
                    <input type="text" class="script-input" data-key="speaker" value="${entry.speaker || ''}">
                    <label>Teks Dialog</label>

                    <textarea class="script-input" data-key="text" rows="3">${entry.text || ''}</textarea>

                    <label>Sprite (cth: elaina1.png)</label>
                    <input type="text" class="script-input image-input" data-key="sprite" value="${entry.sprite || ''}">
                    ${createImgPreview('sprite', entry.sprite)}
                    <label>Sprite 2 (opsional)</label>
                    <input type="text" class="script-input image-input" data-key="sprite2" value="${entry.sprite2 || ''}">
                    ${createImgPreview('sprite2', entry.sprite2)}
                    <label>Background (cth: bg1.jpg)</label>
                    <input type="text" class="script-input image-input" data-key="background" value="${entry.background || ''}">
                    ${createImgPreview('background', entry.background)}
                    <label>BGM (opsional, cth: music.mp3)</label>
                    <input type="text" class="script-input audio-input" data-key="bgm" value="${entry.bgm || ''}">
                    <label>SFX (opsional, cth: sound.mp3)</label>
                    <input type="text" class="script-input audio-input" data-key="sfx" value="${entry.sfx || ''}">
                `;
                        break;
                    case 'scene':
                        contentHTML = `
                    <label>Tipe: <strong>Scene Transition</strong></label>
                    <label>Background</label>
                    <input type="text" class="script-input image-input" data-key="background" value="${entry.background || ''}">
                    ${createImgPreview('background', entry.background)}
                    <label>SFX (opsional)</label>
                    <input type="text" class="script-input audio-input" data-key="sfx" value="${entry.sfx || ''}">
                `;
                        break;

                    case 'label':
                        contentHTML = `
                    <label>Tipe: <strong>Label</strong> (Untuk tujuan 'jump')</label>
                    <label>Nama Label</label>
                    <input type="text" class="script-input" data-key="name" value="${entry.name || ''}">
                `;
                        break;
                    default:
                        contentHTML = `<p>Tipe: <strong>${entry.type}</strong> (editor untuk tipe ini belum lengkap)</p>`;
                        break;
                }

                card.innerHTML = contentHTML + '<button class="delete-dialogue-btn">Hapus</button>';
                scriptEditorArea.appendChild(card);
            });

            // preview real-time
            scriptEditorArea.querySelectorAll('.image-input').forEach(input => {
                const preview = input.nextElementSibling;
                input.addEventListener('input', () => {
                    const newSrc = input.value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${input.value}` : '';
                    preview.src = newSrc;
                });
            });
            scriptEditorArea.querySelectorAll('.audio-input').forEach(input => {
                const preview = input.nextElementSibling;
                input.addEventListener('input', () => {
                    const newSrc = input.value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${input.value}` : '';
                    preview.src = newSrc;
                });
            });
        }

        // memperbarui warna kotak <select> berdasarkan pilihan
        function updateSelectColor(selectElement) {
            if (!selectElement) return;

            // Hapus kelas warna lama terlebih dahulu
            selectElement.classList.remove('has-main-label-selection', 'has-sub-label-selection');

            // Dapatkan opsi yang sedang dipilih
            const selectedOption = selectElement.selectedOptions[0];
            if (!selectedOption) return;

            if (selectedOption.classList.contains('option-main-label')) {
                selectElement.classList.add('has-main-label-selection');
            } else if (selectedOption.classList.contains('option-sub-label')) {
                selectElement.classList.add('has-sub-label-selection');
            }
        }

        // refresh untuk dropdown
        function updateAllJumpTargetDropdowns() {
            console.log('[Updater] Memperbarui semua dropdown target lompatan...');

            const allPhaseNames = Array.from(document.querySelectorAll('.phase-name-input')).map(input => input.value.trim()).filter(Boolean);
            const subLabelNames = new Set(Array.from(document.querySelectorAll('.sub-label-name-input')).map(input => {
                const parentLabelName = input.closest('.label-group-container')?.querySelector('.label-name-input')?.value.trim();
                return parentLabelName ? `${parentLabelName}.${input.value.trim()}` : null;
            }).filter(Boolean));
            const allLabelNames = Array.from(document.querySelectorAll('.label-name-input, .sub-label-name-input')).map(input => {
                if (input.classList.contains('sub-label-name-input')) {
                    const parentLabelName = input.closest('.label-group-container')?.querySelector('.label-name-input')?.value.trim();
                    return parentLabelName ? `${parentLabelName}.${input.value.trim()}` : null;
                }
                return input.value.trim();
            }).filter(Boolean);

            // Memperbarui dropdown di akhir Fase
            document.querySelectorAll('.phase-jump-target').forEach(select => {
                const parentPhaseName = select.closest('.phase-card')?.querySelector('.phase-name-input')?.value.trim();
                const currentValue = select.value;
                let optionsHTML = '<option value="">Lanjut ke fase berikutnya (Default)</option>';
                allPhaseNames.forEach(name => {
                    if (name !== parentPhaseName) {
                        optionsHTML += `<option value="fase:${name}">Fase: ${name}</option>`;
                    }
                });
                // Menulis innerHTML berarti MEM-PARSING string lalu membuat puluhan
                // elemen <option> baru — biaya DOM, bukan biaya string. Di jalur
                // buka-chapter mayoritasnya sia-sia: `createEntryEditorCard` sudah
                // merender opsi jump yang sama persis saat kartunya dibangun, lalu
                // fungsi ini membangunnya ulang untuk SETIAP dropdown.
                // Perbandingan string beberapa KB jauh lebih murah daripada
                // membuang & membuat ulang node-nya.
                if (select.innerHTML !== optionsHTML) select.innerHTML = optionsHTML;
                setFlowSelectValuePreservingUnknown(select, currentValue);
            });

            // Memperbarui dropdown di akhir Grup Label Utama
            //
            // Daftar fase SAMA untuk setiap label, jadi ia dibangun sekali di luar
            // loop. Dulu string yang sama dirakit ulang untuk tiap dropdown — 244
            // kali di chapter terbesar.
            const _optFaseBersama = allPhaseNames
                .map(name => `<option value="fase:${name}">Fase: ${name}</option>`).join('');
            // Daftar label berbeda per label (ia mengecualikan dirinya sendiri),
            // tetapi hanya sebanyak jumlah label — bukan sebanyak dropdown.
            const _memoLabelOpt = Object.create(null);
            document.querySelectorAll('.label-jump-target').forEach(select => {
                const parentLabelName = select.closest('.label-group-container')?.querySelector('.label-name-input')?.value.trim();
                const currentValue = select.value;
                const phaseOptionsHTML = _optFaseBersama;
                const labelOptionsHTML = (parentLabelName in _memoLabelOpt)
                    ? _memoLabelOpt[parentLabelName]
                    : (_memoLabelOpt[parentLabelName] = allLabelNames
                    .filter(name => name !== parentLabelName && !subLabelNames.has(name))
                    .map(name => `<option value="${name}" class="option-main-label">🏷️Label: ${name}</option>`)
                    .join(''));

                let optionsHTML = '<option value="">Lanjut ke entri berikutnya (Default)</option>';
                if (phaseOptionsHTML) optionsHTML += `<optgroup label="------ Lompat ke Fase ------">${phaseOptionsHTML}</optgroup>`;
                if (labelOptionsHTML) optionsHTML += `<optgroup label="------ Lompat ke Label ------">${labelOptionsHTML}</optgroup>`;

                optionsHTML += `
            <optgroup label="------ Perintah Khusus ------">
                <option value="##SKIP_ALL_LABEL##">Lewati/skip semua label yang ada di fase ini</option>
            </optgroup>
        `;

                // Menulis innerHTML berarti MEM-PARSING string lalu membuat puluhan
                // elemen <option> baru — biaya DOM, bukan biaya string. Di jalur
                // buka-chapter mayoritasnya sia-sia: `createEntryEditorCard` sudah
                // merender opsi jump yang sama persis saat kartunya dibangun, lalu
                // fungsi ini membangunnya ulang untuk SETIAP dropdown.
                // Perbandingan string beberapa KB jauh lebih murah daripada
                // membuang & membuat ulang node-nya.
                if (select.innerHTML !== optionsHTML) select.innerHTML = optionsHTML;
                setFlowSelectValuePreservingUnknown(select, currentValue);
            });

            // Memperbarui dropdown di dalam kartu Pilihan (Choice)
            const _memoChoiceOpt = Object.create(null);
            document.querySelectorAll('.choice-option-jump').forEach(select => {
                const currentValue = select.value;
                const parentChoiceCard = select.closest('.dialogue-entry-card');
                const parentLabelGroup = select.closest('.label-group-container');
                const inLabelContext = parentChoiceCard && parentChoiceCard.dataset.inLabelContext === 'true';
                const parentLabelName = parentLabelGroup?.querySelector('.label-name-input')?.value.trim();
                // Isi dropdown ini hanya ditentukan DUA hal: apakah kartunya berada
                // di dalam label, dan label mana induknya. Sebelumnya string yang
                // sama dirakit ulang untuk SETIAP opsi pilihan di seluruh chapter;
                // dengan memo, jumlah perakitan turun ke jumlah kombinasi yang
                // benar-benar berbeda (paling banyak 2 × jumlah label).
                const _kunciOpt = (inLabelContext ? '1' : '0') + '\n' + (parentLabelName || '');
                let optionsHTML = _memoChoiceOpt[_kunciOpt];
                if (optionsHTML === undefined) {
                    const availableLabels = allLabelNames.filter(name => {
                        const isSubLabel = subLabelNames.has(name);
                        if (!isSubLabel) return true;
                        if (parentLabelName && name.startsWith(parentLabelName + '.')) return true;
                        return false;
                    });

                    optionsHTML = '<option value="">Pilih Label Tujuan...</option>';
                    let specialCommandsHTML = '';

                    if (inLabelContext) {
                        // Opsi ini HANYA muncul jika Choice berada DI DALAM sebuah Label
                        specialCommandsHTML = `
                    <option value="##CONTINUE_PARENT##">Lanjut di Label Induk (lewati sub-label)</option>
                    <option value="##FINISH_PARENT##">Selesaikan Label Induk</option>
                    <option value="##EXIT_LABEL##">Keluar dari Label (lanjut ke bawah)</option>
                `;
                    } else {
                        // Opsi ini HANYA muncul jika Choice berada DI LUAR Label (di level Fase)
                        specialCommandsHTML = `
                    <option value="##SKIP_ALL_LABEL##">Lewati/skip semua label di fase ini</option>
                `;
                    }
                    optionsHTML += `<optgroup label="------ Perintah Khusus ------">${specialCommandsHTML}</optgroup>`;

                    if (availableLabels.length > 0) {
                        optionsHTML += `<optgroup label="------ Lompat ke Label ------">`;
                        availableLabels.forEach(name => {
                            let displayName = name;
                            let className = 'option-main-label';
                            if (subLabelNames.has(name)) {
                                displayName = `↪ (sub) ${name.slice(name.indexOf('.') + 1)}`;
                                className = 'option-sub-label';
                            }
                            optionsHTML += `<option value="${name}" class="${className}">${displayName}</option>`;
                        });
                        optionsHTML += `</optgroup>`;
                    }
                    _memoChoiceOpt[_kunciOpt] = optionsHTML;
                }
                // Menulis innerHTML berarti MEM-PARSING string lalu membuat puluhan
                // elemen <option> baru — biaya DOM, bukan biaya string. Di jalur
                // buka-chapter mayoritasnya sia-sia: `createEntryEditorCard` sudah
                // merender opsi jump yang sama persis saat kartunya dibangun, lalu
                // fungsi ini membangunnya ulang untuk SETIAP dropdown.
                // Perbandingan string beberapa KB jauh lebih murah daripada
                // membuang & membuat ulang node-nya.
                if (select.innerHTML !== optionsHTML) select.innerHTML = optionsHTML;
                setFlowSelectValuePreservingUnknown(select, currentValue);
            });

            // Memperbarui dropdown di dalam Sub-Label
            document.querySelectorAll('.sub-label-jump-target').forEach(select => {
                const subLabelContainer = select.closest('.sub-label-container');
                const parentLabelName = subLabelContainer.dataset.parentName;
                const currentSubLabelInput = subLabelContainer.querySelector('.sub-label-name-input');
                const currentSubLabelName = currentSubLabelInput ? `${parentLabelName}.${currentSubLabelInput.value.trim()}` : null;
                const currentValue = select.value;
                const siblingSubLabels = Array.from(subLabelNames).filter(name =>
                    name.startsWith(parentLabelName + '.') && name !== currentSubLabelName
                );

                let optionsHTML = `
            <option value="##EXIT_SUB_LABEL##">Selesaikan sub-label ini (Default, ini berarti alur cerita akan lanjut ke bawahnya.)</option>
        `;

                optionsHTML += `
            <optgroup label="------ Perintah Khusus ------">
                <option value="##CONTINUE_PARENT_FLOW##">Lanjut di Label Induk (Lewati semua sub-label Di bawahnya)</option>
                <option value="##FINISH_PARENT##" class="option-main-label">Selesaikan Label "${parentLabelName}" (ini Berarti Label "${parentLabelName}" dianggap telah berakhir)</option>
            </optgroup>
        `;

                if (siblingSubLabels.length > 0) {
                    optionsHTML += `<optgroup label="------ Lompat ke Sub-Label Lain ------">`;
                    siblingSubLabels.forEach(name => {
                        const displayName = name.slice(parentLabelName.length + 1);
                        optionsHTML += `<option value="${name}" class="option-sub-label">↪ ${displayName}</option>`;
                    });
                    optionsHTML += `</optgroup>`;
                }

                // Menulis innerHTML berarti MEM-PARSING string lalu membuat puluhan
                // elemen <option> baru — biaya DOM, bukan biaya string. Di jalur
                // buka-chapter mayoritasnya sia-sia: `createEntryEditorCard` sudah
                // merender opsi jump yang sama persis saat kartunya dibangun, lalu
                // fungsi ini membangunnya ulang untuk SETIAP dropdown.
                // Perbandingan string beberapa KB jauh lebih murah daripada
                // membuang & membuat ulang node-nya.
                if (select.innerHTML !== optionsHTML) select.innerHTML = optionsHTML;
                setFlowSelectValuePreservingUnknown(select, currentValue);
            });

            console.log('[Updater] Semua dropdown telah diperbarui.');
            scriptEditorArea.querySelectorAll('.label-jump-target, .choice-option-jump, .sub-label-jump-target')
                .forEach(updateSelectColor);
        }

        // ======================== FUNGSI PREVIEW LABEL ======================== //
        // Fungsi untuk mengekstrak data preview dari grup label
        // Mengambil semua entri di dalam label dan membangun payload untuk diputar

        function createEntryCard(entryData, index) {
            const card = document.createElement('div');
            card.className = 'dialogue-entry-card';
            card.dataset.index = index;
            card.dataset.type = entryData.type;

            let contentHTML = '';
            if (entryData.type === 'dialogue') {
                contentHTML = `
            <label>Tipe: <strong>Dialog</strong></label>
            <label>Speaker</label>
            <input type="text" class="script-input" data-key="speaker" value="${entryData.speaker || ''}">
            <label>Teks Dialog</label>
            <textarea class="script-input" data-key="text" rows="3">${entryData.text || ''}</textarea>
        `;
            }

            card.innerHTML = contentHTML + '<button class="delete-dialogue-btn">Hapus</button>';

            // Pasang event listener di sini (untuk preview, tombol hapus, dll.)
            card.querySelector('.delete-dialogue-btn').onclick = () => card.remove();

            return card;
        }

        function createLabelGroupElement(data = {}, availableLabels = [], availablePhases = [], subsequentSceneData = {}) {
            const newLabelGroupContainer = document.createElement('div');
            newLabelGroupContainer.className = 'label-group-container';
            // Baseline entri MENTAH — alasannya sama dengan phase (lihat
            // createPhaseEditorCard): `audioChannels` pada label terbukti hilang saat
            // disimpan karena kolektor membangun ulang dari input header saja.
            try { newLabelGroupContainer.dataset.rawEntry = JSON.stringify(data || {}); }
            catch (e) { /* tak bisa diserialisasi → tanpa baseline, perilaku lama */ }

            const createImgPreview = (value, key) => {
                const src = value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}` : '';
                return `<img src="${src}" class="image-preview" data-preview-for="${key}" style="display: ${value ? 'block' : 'none'};" onload="this.style.display='block'" onerror="this.style.display='none'">`;
            };

            // Determine initial value
            const initialMediaValue = subsequentSceneData.video || subsequentSceneData.background || '';
            const isVideo = !!subsequentSceneData.video;

            // Alasannya sama dengan kartu fase di atas: satu nama grup per kartu,
            // dihitung sekali. Ini yang dilaporkan pengguna — pada label, Crop dan
            // Fit bisa tercentang keduanya sekaligus.
            const uniqueRadioName = `background-mode-label-${_idKartuBerikutnya()}`;

            const header = document.createElement('div');
            header.className = 'label-group-header';

            header.innerHTML = `
                <div class="drag-handle" title="Seret grup label ini">⠿</div>
                <div style="flex-grow: 1;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                        <span class="label-icon">🏷️</span>
                        <input type="text" class="script-input label-name-input" data-key="name" value="${data.name || ''}" placeholder="Beri nama unik untuk label ini...">
                        <button type="button" class="add-sub-label-btn" data-type="sub-label">+ Sub-Label</button>
                        <button type="button" class="preview-label-group-btn" title="Preview label ini di jendela terpisah">▶ Preview</button>
                        <button type="button" class="delete-label-group-btn" title="Hapus Label dan Isinya">×</button>
                    </div>

                    <div class="label-config-row">
                        ${initialMediaValue ? `
                        <div>
                            <label>Animasi Transisi Masuk Ke Label Ini</label>
                            <div class="file-input-group">
                                <select class="script-input label-entry-transition-select">
                                    <option value="">Langsung (Tanpa Animasi)</option>
                                    ${labelEntryTransitionOptionsHTML(subsequentSceneData.transition)}
                                </select>
                            </div>
                        </div>` : inertTransitionNoticeHTML(subsequentSceneData.transition, 'Transisi masuk label')}
                    </div>
                    <div class="phase-assets">
                        <div>
                            <label>Label Background (Gambar / Video)</label>
                            <div class="file-input-group">
                                <div class="input-with-clear-wrapper ${initialMediaValue ? 'has-text' : ''}">
                                    <input data-key="media" type="text" class="script-input label-media-input" value="${initialMediaValue}" placeholder="Kosongkan jika tidak berubah...">
                                    <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                                </div>
                                <button type="button" class="browse-file-btn" data-type="all-media">📁</button>
                            </div>

                            <div class="media-preview-container" style="margin-top: 10px;">
                                <!-- Image Preview Wrapper -->
                                <div class="image-preview-wrapper" style="display: ${!isVideo && initialMediaValue ? 'block' : 'none'};">
                                    <div class="image-preview-container-16-9">
                                        <img class="image-preview" data-preview-for="background" src="${!isVideo && initialMediaValue ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${initialMediaValue}` : ''}" style="display: ${!isVideo && initialMediaValue ? 'block' : 'none'};">
                                    </div>
                                    <div class="background-mode-options">
                                        <label>Tampilan:</label>
                                        <label>
                                            <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="cover" checked> Crop (Penuhi Layar)
                                        </label>
                                        <label>
                                            <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="contain"> Fit (Tampilkan Utuh)
                                        </label>
                                    </div>
                                </div>

                                <!-- Video Preview Wrapper -->
                                <div class="video-preview-wrapper" style="display: ${isVideo ? 'block' : 'none'};">
                                    <div class="video-preview-container" style="width: 100%; aspect-ratio: 16 / 9; background-color: #000; border-radius: 4px; overflow: hidden; display: flex; align-items: center; justify-content: center; border: 1px solid #444;">
                                        <video class="video-preview" data-preview-for="video" controls muted src="${isVideo ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${initialMediaValue}` : ''}" style="display: ${isVideo ? 'block' : 'none'}; width: 100%; height: 100%; object-fit: contain;"></video>
                                    </div>
                                </div>
                                
                                <span class="preview-placeholder" style="display: ${!initialMediaValue ? 'block' : 'none'}; color: #777; text-align: center; padding: 20px; border: 1px dashed #555; border-radius: 4px;">Belum ada background dipilih...</span>
                            </div>
                        </div>
                        <div>
                            <label>Label BGM</label>
                            <div class="file-input-group">
                                <div class="input-with-clear-wrapper ${subsequentSceneData.bgm ? 'has-text' : ''}">
                                    <input data-key="bgm" type="text" class="script-input audio-input label-default-bgm-input" value="${subsequentSceneData.bgm || ''}" placeholder="Kosongkan jika tidak berubah...">
                                    <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                                </div>
                                <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                            </div>
                            
                            <div class="audio-preview-placeholder" data-src="${subsequentSceneData.bgm || ''}" data-preview-for="bgm"></div>
                        </div>
                        <div>
                            <label>Label SFX</label>
                            <div class="file-input-group">
                                <div class="input-with-clear-wrapper ${subsequentSceneData.sfx ? 'has-text' : ''}">
                                    <input data-key="sfx" type="text" class="script-input audio-input label-default-sfx-input" value="${subsequentSceneData.sfx || ''}" placeholder="Kosongkan jika tidak ada...">
                                    <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                                </div>
                                <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                            </div>

                            <div class="audio-preview-placeholder" data-src="${subsequentSceneData.sfx || ''}" data-preview-for="sfx"></div>
                        </div>
                    </div>
                    </div>
            `;

            const bgMode = subsequentSceneData.backgroundMode || 'cover';
            const bgModeRadio = header.querySelector(`input[data-key="backgroundMode"][value="${bgMode}"]`);
            if (bgModeRadio) {
                bgModeRadio.checked = true;
            }

            const bgPreviewImg = header.querySelector('.image-preview[data-preview-for="background"]');
            if (bgPreviewImg) {
                bgPreviewImg.style.objectFit = bgMode;
            }
            const labelBgmInput = header.querySelector('.label-default-bgm-input');
            const labelBgmVolume = createAudioControls('bgm', subsequentSceneData);
            labelBgmInput.closest('.file-input-group').after(labelBgmVolume);
            linkAudioInputToVolumeControl(labelBgmInput, labelBgmVolume);

            const labelSfxInput = header.querySelector('.label-default-sfx-input');
            const labelSfxVolume = createAudioControls('sfx', subsequentSceneData);
            labelSfxInput.closest('.file-input-group').after(labelSfxVolume);
            linkAudioInputToVolumeControl(labelSfxInput, labelSfxVolume);

            const transitionDropdown = header.querySelector('.label-entry-transition-select');
            if (transitionDropdown) {
                if (subsequentSceneData.transition) {
                    // Kosakata player pun bisa MENYUSUT: transisi yang kreator cabut
                    // dari extension-nya tak lagi punya opsi. Assignment polos akan
                    // mengembalikannya jadi '' dan Simpan berikutnya menghapusnya.
                    // Pertahankan + tandai (UX-A06).
                    setFlowSelectValuePreservingUnknown(transitionDropdown, subsequentSceneData.transition);
                } else {
                    // Disetel EKSPLISIT, bukan menumpang atribut `selected`: begitu
                    // daftarnya punya <optgroup>, pilihan "tanpa animasi" gampang
                    // meleset ke opsi pertama grup.
                    transitionDropdown.value = '';
                }
            }

            // Logic to handle input changes and update preview
            const mediaInput = header.querySelector('.label-media-input');
            const imageWrapper = header.querySelector('.image-preview-wrapper');
            const videoWrapper = header.querySelector('.video-preview-wrapper');
            const placeholder = header.querySelector('.preview-placeholder');
            const imgPreview = header.querySelector('.image-preview');
            const videoPreview = header.querySelector('.video-preview');

            const updateMediaPreview = (filename) => {
                if (!filename) {
                    imageWrapper.style.display = 'none';
                    videoWrapper.style.display = 'none';
                    placeholder.style.display = 'block';
                    return;
                }

                const ext = filename.split('.').pop().toLowerCase();
                const isVideoFile = ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext);
                const src = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${filename}`;

                if (isVideoFile) {
                    imageWrapper.style.display = 'none';
                    videoWrapper.style.display = 'block';
                    placeholder.style.display = 'none';
                    videoPreview.src = src;
                    videoPreview.style.display = 'block';
                    videoPreview.load();
                } else {
                    imageWrapper.style.display = 'block';
                    videoWrapper.style.display = 'none';
                    placeholder.style.display = 'none';
                    imgPreview.src = src;
                    imgPreview.style.display = 'block';
                }
            };

            mediaInput.addEventListener('input', (e) => {
                updateMediaPreview(e.target.value);
            });

            const newContentWrapper = document.createElement('div');
            newContentWrapper.className = 'label-group-content';

            const newControlsDiv = document.createElement('div');
            newControlsDiv.className = 'phase-card-controls';
            newControlsDiv.style.paddingTop = '15px';
            newControlsDiv.innerHTML = `
                <button class="add-entry-btn" data-type="dialogue">+ Tambah Dialog</button>
                <button class="add-entry-btn" data-type="choice">+ Tambah Dialog ber-Pilihan Jawaban</button>
                <button class="add-entry-btn" data-type="scene">+ Tambah Transisi</button>
                <button class="add-entry-btn" data-type="set_var">+ Tambah Variabel</button>
                <button class="add-entry-btn" data-type="custom">+ Tambah Custom Cmd</button>
                ${getExtensionEntryButtons()}
            `;

            // UX-A06: dropdown "Transisi Keluar Label" DICABUT dengan alasan yang
            // sama dengan phase exit — nilainya dipertahankan, bukan dihapus.
            const labelExitTransitionDiv = document.createElement('div');
            labelExitTransitionDiv.className = 'label-exit-transition';
            labelExitTransitionDiv.innerHTML =
                inertTransitionNoticeHTML(subsequentSceneData.transitionOut, 'Transisi keluar label');

            const flowControlDiv = document.createElement('div');
            flowControlDiv.className = 'label-group-flow-control';

            const labelOptionsHTML = availableLabels
                .filter(name => name !== data.name)
                .map(name => `<option value="${name}">🏷️Label: ${name}</option>`)
                .join('');

            const phaseOptionsHTML = availablePhases
                .map(name => `<option value="fase:${name}">Fase: ${name}</option>`)
                .join('');

            let selectHTML = `
                <label>Setelah Label ini selesai/berakhir, mau ke mana? :</label>
                <select class="label-jump-target">
                    <option value="">Lanjut ke entri berikutnya (Default)</option>
            `;

            if (phaseOptionsHTML) {
                selectHTML += `<optgroup label="------ Fase ------">${phaseOptionsHTML}</optgroup>`;
            }

            if (labelOptionsHTML) {
                selectHTML += `<optgroup label="------ Label ------">${labelOptionsHTML}</optgroup>`;
            }

            selectHTML += `
                <optgroup label="------ Perintah Khusus ------">
                    <option value="##SKIP_ALL_LABEL##">Lewati/skip semua label yang ada di fase ini</option>
                </optgroup>
            `;

            selectHTML += `</select>`;
            flowControlDiv.innerHTML = selectHTML;

            newLabelGroupContainer.appendChild(header);
            newLabelGroupContainer.appendChild(newContentWrapper);
            newLabelGroupContainer.appendChild(newControlsDiv);
            newLabelGroupContainer.appendChild(labelExitTransitionDiv);
            newLabelGroupContainer.appendChild(flowControlDiv);

            pasangScriptSortable(newContentWrapper, {
                group: {
                    name: 'phase-entries',
                    put: function (toList, fromList, draggedEl) {
                        if (draggedEl.classList.contains('label-group-container')) {
                            return false;
                        }
                        if (!draggedEl.classList.contains('entry-type-choice')) {
                            return true;
                        }
                        const fromIsLabel = fromList.closest('.label-group-container, .sub-label-container');
                        const toIsLabel = toList.closest('.label-group-container, .sub-label-container');
                        if (fromIsLabel && !toIsLabel) {
                            return false;
                        }
                        if (!fromIsLabel && toIsLabel) {
                            return false;
                        }
                        return true;
                    }
                },
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                forceFallback: true,
                fallbackOnBody: true,

                onMove: function (evt) {
                    const isScene = evt.dragged.dataset.type === 'scene';
                    if (!isScene) {
                        document.body.classList.remove('invalid-drag-state');
                        return true;
                    }
                    let isInvalidMove = false;
                    if (evt.to.children.length === 0 || (evt.to.children.length === 1 && evt.to.children[0] === evt.dragged)) {
                        isInvalidMove = true;
                    }
                    if (evt.willInsertAfter === false && evt.related === evt.to.children[0]) {
                        isInvalidMove = true;
                    }
                    if (isInvalidMove) {
                        document.body.classList.add('invalid-drag-state');
                        return false;
                    } else {
                        document.body.classList.remove('invalid-drag-state');
                        return true;
                    }
                },

                onEnd: function (evt) {
                    document.body.classList.remove('invalid-drag-state');
                },
            });

            newLabelGroupContainer.querySelectorAll('.audio-preview-placeholder').forEach(p => {
                const src = p.dataset.src;
                const key = p.dataset.previewFor;
                p.replaceWith(createAudioPreview(src, key));
            });

            return newLabelGroupContainer;
        }

        // Menambahkan entri dialog baru ke editor
        function addNewDialogueEntry() {
            const placeholder = scriptEditorArea.querySelector('p');
            if (placeholder) placeholder.remove(); // Hapus pesan "skrip masih kosong"

            const newIndex = scriptEditorArea.children.length;
            const defaultData = { type: 'dialogue', speaker: '', text: '' };
            const newCard = createEntryCard(defaultData, newIndex);
            scriptEditorArea.appendChild(newCard);
        }

        // Event Listeners untuk tombol-tombol di editor
