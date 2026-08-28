// === scriptEditor.js ===

        // === Drawer Aset Chapter ===
        //
        // Dulu panel melayang yang MUNCUL SENDIRI tiap chapter dibuka dan menutupi
        // naskah; satu-satunya cara menyingkirkannya adalah tombol minimize yang
        // tetap menyisakan potongan panel di atas teks. Sekarang: tertutup secara
        // bawaan, dibuka dari tombol di header naskah.
        //
        // Dua keadaan yang berbeda dan sengaja dipisah:
        //   TERSEDIA — ada chapter yang benar-benar termuat. Kalau tidak, tombolnya
        //              mati dan drawer dipaksa tutup. Ini bukan preferensi kreator,
        //              melainkan kenyataan: tak ada chapter = tak ada aset chapter.
        //   TERBUKA  — pilihan kreator, bertahan selama sesi. Ia TIDAK direset saat
        //              pindah chapter: orang yang membuka drawer biasanya sedang
        //              bekerja dengan aset, dan menutupnya tiap pindah chapter berarti
        //              memaksanya mengklik lagi setiap kali.
        let _asetChapterTersedia = false;
        let _asetChapterTerbuka = false;

        function _terapkanDrawerAset() {
            const baris = document.getElementById('script-canvas-row');
            const tombol = document.getElementById('toggle-chapter-assets');
            const terbuka = _asetChapterTersedia && _asetChapterTerbuka;
            if (baris) baris.classList.toggle('assets-open', terbuka);
            if (tombol) {
                tombol.disabled = !_asetChapterTersedia;
                tombol.classList.toggle('is-active', terbuka);
                tombol.setAttribute('aria-expanded', terbuka ? 'true' : 'false');
            }
            if (!terbuka) _tutupPratinjauAsetChapter();
        }

        function _tutupPratinjauAsetChapter() {
            const kotak = document.getElementById('chapter-asset-preview');
            const isi = document.getElementById('chapter-asset-preview-content');
            // Isi dikosongkan, bukan cuma disembunyikan: audio/video yang masih
            // menempel di DOM terus berbunyi walau kotaknya tak terlihat.
            if (isi) {
                if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(isi);
                isi.innerHTML = '';
            }
            if (kotak) kotak.style.display = 'none';
        }

        function setChapterAssetsAvailable(tersedia) {
            _asetChapterTersedia = !!tersedia;
            _terapkanDrawerAset();
        }

        function setChapterAssetsOpen(terbuka) {
            if (!_asetChapterTersedia) return;
            _asetChapterTerbuka = !!terbuka;
            _terapkanDrawerAset();
        }

        /**
         * Tampilkan pratinjau aset DI DALAM drawer.
         *
         * Jalur lama (`showAssetPreview`) menyembunyikan `#script-editor-area` dan
         * memasang aset di kanvas — jadi satu klik pada thumbnail membuat naskah
         * lenyap, tanpa apa pun di layar yang menjelaskan ke mana perginya.
         * Jalur itu masih dipakai view Aset Global, di mana mengambil alih kanvas
         * memang perilaku yang benar; yang diubah hanya klik dari dalam drawer.
         */
        function showChapterAssetPreview(fullPath, type, relativePath) {
            const kotak = document.getElementById('chapter-asset-preview');
            const isi = document.getElementById('chapter-asset-preview-content');
            if (!kotak || !isi) return false;

            // Kosongkan lebih dulu supaya audio/video sebelumnya berhenti berbunyi.
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(isi);
            isi.innerHTML = '';

            let el = null;
            if (type === 'image') {
                el = document.createElement('img');
            } else if (type === 'audio') {
                el = document.createElement('audio');
                el.controls = true;
                el.autoplay = true;
            } else if (type === 'video') {
                el = document.createElement('video');
                el.controls = true;
                el.autoplay = true;
                el.loop = true;
                el.muted = true;
            }
            if (!el) return false;

            el.src = fullPath;
            isi.appendChild(el);

            const nama = document.createElement('p');
            nama.className = 'chapter-asset-preview-name';
            nama.textContent = String(relativePath || '');
            isi.appendChild(nama);

            kotak.style.display = 'block';
            return true;
        }

        window._showChapterAssetPreview = showChapterAssetPreview;
        window._setChapterAssetsAvailable = setChapterAssetsAvailable;
        window._setChapterAssetsOpen = setChapterAssetsOpen;
        window._tutupPratinjauAsetChapter = _tutupPratinjauAsetChapter;

        document.addEventListener('DOMContentLoaded', () => {
            const tombol = document.getElementById('toggle-chapter-assets');
            if (tombol) tombol.addEventListener('click', () => setChapterAssetsOpen(!_asetChapterTerbuka));

            const tutup = document.getElementById('close-chapter-assets');
            if (tutup) tutup.addEventListener('click', () => setChapterAssetsOpen(false));

            const tutupPratinjau = document.getElementById('close-chapter-asset-preview');
            if (tutupPratinjau) tutupPratinjau.addEventListener('click', _tutupPratinjauAsetChapter);

            _terapkanDrawerAset();
        });

        // Utility: escape HTML entities untuk mencegah XSS saat memasukkan user data ke innerHTML
        // ⚠ Penjaganya `== null`, bukan `!str` — lihat alasannya di entryEditorCard.js
        // (salinan kedua dari helper yang sama; `0` dan `false` adalah NILAI).
        function _escapeHTML(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function _escapeAttr(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // --- Logika Tambah Chapter ---

        async function showScriptEditor() {
            if (typeof window._hideNewNovelOnboarding === 'function') window._hideNewNovelOnboarding('kembali ke daftar novel');
            editorNovelList.innerHTML = '';
            const stories = await ipcRenderer.invoke('get-story-list');

            renderNovelSelectionList(stories);

            editorMainScreen.style.display = 'none';
            editorNovelSelectionScreen.style.display = 'flex';
            scriptEditorOverlay.style.display = 'flex';
            setTimeout(() => scriptEditorOverlay.classList.add('visible'), 10);
        }

        // Sembunyikan overlay editor
        async function hideScriptEditor() {
            if (typeof window._hideNewNovelOnboarding === 'function') window._hideNewNovelOnboarding('editor ditutup');
            cancelPendingChapterLoad();
            if (typeof window.closeFlowVisualization === 'function') window.closeFlowVisualization();
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            // Bongkar KEDUA preview agar webview-nya berhenti (video/audio mati).
            // Preview Player dulu terlewat di sini — niatnya sudah benar sejak
            // baris Hub ditulis, tapi panel VN Player lahir belakangan dan pintu
            // ini tak ikut diperbarui.
            if (typeof window.destroyHubPreview === 'function') {
                try { window.destroyHubPreview(); }
                catch (e) { console.error('[Tutup Editor] Gagal membongkar preview Hub:', e); }
            }
            if (typeof window.destroyPlayerPreview === 'function') {
                try { window.destroyPlayerPreview(); }
                catch (e) { console.error('[Tutup Editor] Gagal membongkar preview Player:', e); }
            }
            // Tutup window Hub Code Editor (bila terbuka) — meninggalkan editor novel ini
            ipcRenderer.send('hub-code-editor:close-all');
            scriptEditorOverlay.classList.remove('visible');
            setTimeout(() => scriptEditorOverlay.style.display = 'none', 300);
        }

        ipcRenderer.on('hub-html-updated', (event, { novelTitle }) => {
            // Pastikan novel yang diupdate adalah novel yang sedang kita pratinjau
            if (novelTitle === currentlyEditing.novel) {
                // Cari elemen webview yang sedang aktif di dalam area editor
                const webview = document.querySelector('#script-editor-area webview');

                // Jika webview ditemukan, panggil metode reload() bawaannya
                if (webview) {
                    console.log('[Host] Menerima sinyal update hub. Me-reload webview...');
                    webview.reload();
                }
            }
        });

        let _hubPreviewPromise = null;
        let _hubWebviewRO = null;
        const _activeObservers = new Set();
        // ⚠ KODE MATI — TIDAK BISA DICAPAI SIAPA PUN.
        // Satu-satunya pemicunya adalah tombol `#show-hub-preview-btn`, dan tombol
        // itu tak ada di HTML mana pun (sudah tercatat di kesiapan-rilis §9.6).
        // Dibiarkan berdiri untuk sekarang karena pencabutannya menyentuh jalur
        // lifecycle `_activeObservers` yang dijaga `editor-save-orchestration.test.js`
        // — pekerjaan tersendiri, bukan bagian dari fitur ganti-nama.
        // Lihat daftar cleanup §5 kesiapan-rilis alpha 0.0.0.9.
        async function showHubPreview() {
            if (!currentlyEditing.novel) return;
            
            // Jika sudah ada operasi berjalan, tunggu selesai
            if (_hubPreviewPromise) {
                await _hubPreviewPromise;
                return;
            }
            
            // Lock dengan Promise
            _hubPreviewPromise = (async () => {
                try {
                    // Disable UI button
                    const btn = document.getElementById('show-hub-preview-btn');
                    if (btn) {
                        btn.disabled = true;
                        btn.textContent = 'Loading...';
                    }

            // SEMBUNYIKAN KONTROL SKRIP UTAMA SAAT MASUK KE EDITOR HUB
            const workspaceControls = document.getElementById('workspace-controls-bar');
            if (workspaceControls) workspaceControls.style.display = 'none';
            const flowBtn = document.getElementById('btn-visualize-flow');
            if (flowBtn) flowBtn.style.display = 'none';

            // 1. Atur tampilan editor ke mode 'preview' menggunakan manajer terpusat
            updateEditorContentView('preview');

            // Siapkan kontainer dan bersihkan isinya
            const scriptArea = document.getElementById('script-editor-area');
            if (typeof window.cancelPendingChapterLoad === 'function') window.cancelPendingChapterLoad();
            if (typeof window.destroyScriptEditorSortables === 'function') window.destroyScriptEditorSortables(scriptArea);
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptArea.innerHTML = '';
            // Ubah ke flex layout agar wrapper & editorContainer berbagi ruang secara proporsional
            scriptArea.style.display = 'flex';
            scriptArea.style.flexDirection = 'column';
            editingChapterName.textContent = `Pratinjau & Edit Halaman Utama: ${currentlyEditing.novel}`;

            // 2. Minta detail novel (judul & deskripsi) dari main process
            const details = await ipcRenderer.invoke('get-hub-details', currentlyEditing.novel);

            // 3. Buat elemen pratinjau <webview>
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `width: 100%; flex: 0 0 auto; overflow: hidden; background-color: #000; border-radius: 8px; border: 2px solid #333; position: relative; margin-bottom: 20px;`;

            const webview = document.createElement('webview');
            const baseWidth = 1920;
            const baseHeight = 1080;

            webview.setAttribute('webpreferences', 'nodeIntegration=true, contextIsolation=false');
            
            // Cek apakah novel ini punya hub.html kustom
            const localHubExists = require('fs').existsSync(
                require('path').join(__dirname, 'visual_novels', currentlyEditing.novel, 'hub.html')
            );
            const loadedHubConfig = typeof hubConfig !== 'undefined' ? hubConfig : {};
            const customHubExists = loadedHubConfig.hubModeConfirmed === true
                ? loadedHubConfig.hubType === 'custom' && localHubExists
                : localHubExists;

            let hubUrl;
            if (customHubExists) {
                // Hub kustom kreator
                hubUrl = `./visual_novels/${encodeURIComponent(currentlyEditing.novel)}/hub.html?v=${Date.now()}`;
                console.log('[Host] Hub kustom terdeteksi, memuat:', hubUrl);
            } else if (details.isMetaJson) {
                // Hub default (novel-hub.html global — kini di hub-templates/_global/)
                hubUrl = `./hub-templates/_global/novel-hub.html?v=${Date.now()}`;
            } else {
                // Legacy (index.html di folder novel)
                hubUrl = `./visual_novels/${currentlyEditing.novel}/index.html?v=${Date.now()}`;
            }
                
            webview.src = hubUrl;
            webview.style.cssText = `width: ${baseWidth}px; height: ${baseHeight}px; border: none; position: absolute; top: 0; left: 0; transform-origin: 0 0;`;

            // 4. log diagnostik untuk <webview>
            webview.addEventListener('dom-ready', () => {
                console.log('%c[Host] Webview DOM Ready!', 'color: green; font-weight: bold;', `Konten untuk ${webview.src} telah dimuat.`);
                
                const novelPath = require('path').join(__dirname, 'visual_novels', currentlyEditing.novel);
                const metaData = {
                    title: details.title || currentlyEditing.novel,
                    storyDesc: details.storyDesc || '',
                    description: details.description,
                    genre: details.genre,
                    author: details.author,
                    illustrator: details.illustrator,
                    vnMapper: details.vnMapper,
                    cover: details.cover || '',
                    images: details.images || [],
                    promotionalVideo: details.promotionalVideo || ''
                };

                if (customHubExists) {
                    // Inject bridge API + shared runtime ke webview hub kustom
                    const jsDir = require('path').join(__dirname, '..', '..', 'vn-player', 'js');
                    try {
                        const bridgeCode = require('fs').readFileSync(require('path').join(jsDir, 'vn-hub-api.js'), 'utf-8');
                        const runtimeCode = require('fs').readFileSync(require('path').join(jsDir, 'vn-hub-runtime.js'), 'utf-8');
                        webview.executeJavaScript(bridgeCode + '\n;\n' + runtimeCode).then(() => {
                            webview.send('vn-engine:set-hub-context', {
                                storyTitle: currentlyEditing.novel,
                                novelPath: novelPath.replace(/\\/g, '/'),
                                metaData: metaData,
                                hubConfig: typeof hubConfig !== 'undefined' ? hubConfig : null
                            });
                            console.log('[Host] Bridge API + context terkirim ke hub kustom (webview).');
                        });
                    } catch (e) {
                        console.error('[Host] Gagal inject bridge API ke webview:', e);
                    }
                } else if (details.isMetaJson) {
                    webview.send('vn-engine:set-hub-context', {
                        storyTitle: currentlyEditing.novel,
                        novelPath: novelPath.replace(/\\/g, '/'),
                        metaData: metaData,
                        hubConfig: typeof hubConfig !== 'undefined' ? hubConfig : null
                    });
                }
            });
            webview.addEventListener('did-fail-load', (error) => {
                console.error('%c[Host] Webview Gagal Dimuat!', 'color: red; font-weight: bold;', `Error: ${error.errorDescription} (Code: ${error.errorCode})`, `URL: ${error.validatedURL}`);
            });
            webview.addEventListener('console-message', (e) => {
                console.log(`%c[Dari Webview]`, 'color: #3399FF; font-weight: bold;', e.message);
            });

            // 5. Buat elemen UI untuk editor (input judul, textarea, tombol)
            webview.style.pointerEvents = 'none';
            const interactionLayer = document.createElement('div');
            interactionLayer.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10;
                pointer-events: auto; /* Memastikan lapisan ini bisa di-scroll */
            `;
            const editorContainer = document.createElement('div');
            editorContainer.style.cssText = `display: flex; flex-direction: column; gap: 15px;`;

            const titleInputLabel = document.createElement('label');
            titleInputLabel.textContent = 'Judul Novel';
            titleInputLabel.style.fontWeight = 'bold';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = details.success ? details.title : currentlyEditing.novel;
            titleInput.placeholder = 'Judul Novel...';
            titleInput.style.cssText = `width: 100%; padding: 10px; background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 6px; font-size: 1.1em;`;

            const descEditorLabel = document.createElement('label');
            descEditorLabel.textContent = 'Deskripsi Novel';
            descEditorLabel.style.fontWeight = 'bold';

            const descEditor = document.createElement('textarea');
            descEditor.value = details.success ? details.description : 'Gagal memuat deskripsi...';
            descEditor.placeholder = 'Tulis deskripsi di sini...';
            descEditor.style.cssText = `width: 100%; min-height: 150px; background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 10px; font-family: 'Lexend', sans-serif; resize: vertical;`;

            // === NEW META INPUTS ===
            const metaContainer = document.createElement('div');
            metaContainer.style.cssText = `display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px;`;

            const createMetaInput = (label, value, placeholder) => {
                const container = document.createElement('div');
                const labelEl = document.createElement('label');
                labelEl.textContent = label;
                labelEl.style.cssText = `display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em;`;
                const input = document.createElement('input');
                input.type = 'text';
                input.value = value || '';
                input.placeholder = placeholder;
                input.style.cssText = `width: 100%; padding: 8px; background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 6px;`;
                container.appendChild(labelEl);
                container.appendChild(input);
                return { container, input };
            };

            const genreInputObj = createMetaInput('Genre', details.genre, 'Romance, Fantasy');
            const authorInputObj = createMetaInput('Penulis', details.author, 'Nama Penulis');
            const illustratorInputObj = createMetaInput('Ilustrator', details.illustrator, 'Nama Ilustrator');
            const vnMapperInputObj = createMetaInput('VN Mapper', details.vnMapper, 'Pembuat VN');

            metaContainer.appendChild(genreInputObj.container);
            metaContainer.appendChild(authorInputObj.container);
            metaContainer.appendChild(illustratorInputObj.container);
            metaContainer.appendChild(vnMapperInputObj.container);
            // =======================

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `display: flex; justify-content: flex-end; gap: 10px;`;

            const saveButton = document.createElement('button');
            saveButton.textContent = 'Simpan Semua Perubahan';
            saveButton.className = 'editor-button-save';

            // 6. Rangkai dan tampilkan semua elemen UI
            buttonContainer.appendChild(saveButton);
            editorContainer.appendChild(titleInputLabel);
            editorContainer.appendChild(titleInput);
            editorContainer.appendChild(descEditorLabel);
            editorContainer.appendChild(descEditor);
            editorContainer.appendChild(metaContainer);
            editorContainer.appendChild(buttonContainer);
            wrapper.appendChild(webview);
            wrapper.appendChild(interactionLayer);
            scriptArea.appendChild(wrapper);
            scriptArea.appendChild(editorContainer);

            document.getElementById('asset-preview-container').style.display = 'none';
            // scriptArea sudah di-set flexDirection di atas

            // 7. interaktivitas
            webview.addEventListener('ipc-message', async (event) => {
                if (event.channel === 'get-chapter-list-request') {
                    const chapters = await ipcRenderer.invoke('get-chapter-list', currentlyEditing.novel);
                    webview.send('chapter-data-response', chapters);
                }
                if (event.channel === 'play-chapter') {
                    ipcRenderer.send('play-chapter', event.args[0]);
                }
            });

            descEditor.addEventListener('input', () => {
                webview.send('update-description', descEditor.value.replace(/\n/g, '<br>'));
            });

            titleInput.addEventListener('input', () => {
                console.log(`[Host Editor] Mengirim 'update-title' dengan nilai: "${titleInput.value}"`);
                webview.send('update-title', titleInput.value);
            });

            saveButton.addEventListener('click', async () => {
                saveButton.textContent = 'Menyimpan...';
                saveButton.disabled = true;

                // `update-hub-details` DICABUT: ia me-rename folder tanpa transaksi
                // dan tanpa memigrasikan `storyTitle` di dalam tiap save slot.
                // Penggantinya dipisah menurut yang memang beda hakikatnya —
                // rename = ganti primary key, metadata = sunting field.
                await ipcRenderer.invoke('update-novel-details', {
                    novelTitle: currentlyEditing.novel,
                    description: descEditor.value,
                    genre: genreInputObj.input.value,
                    author: authorInputObj.input.value,
                    illustrator: illustratorInputObj.input.value,
                    vnMapper: vnMapperInputObj.input.value
                });
                const result = await ipcRenderer.invoke('novel:rename', {
                    originalTitle: currentlyEditing.novel,
                    newTitle: titleInput.value.trim()
                });

                if (result.success) {
                    const newTitle = titleInput.value.trim();
                    if (currentlyEditing.novel !== newTitle) {
                        currentlyEditing.novel = newTitle;
                        editingNovelName.textContent = newTitle;
                        await loadStories();
                        const stories = await ipcRenderer.invoke('get-story-list');
                        renderNovelSelectionList(stories);
                    }
                    showNotification(result.message, 'success');
                    
                    // Update preview real-time
                    if (customHubExists || details.isMetaJson) {
                         const novelPath = require('path').join(__dirname, 'visual_novels', currentlyEditing.novel);
                         webview.send('vn-engine:set-hub-context', {
                            storyTitle: currentlyEditing.novel,
                            novelPath: novelPath.replace(/\\/g, '/'),
                            metaData: {
                                title: titleInput.value.trim(),
                                description: descEditor.value,
                                genre: genreInputObj.input.value,
                                author: authorInputObj.input.value,
                                illustrator: illustratorInputObj.input.value,
                                vnMapper: vnMapperInputObj.input.value,
                                images: details.images || []
                            },
                            hubConfig: typeof hubConfig !== 'undefined' ? hubConfig : null
                        });
                    } else {
                        webview.reload();
                    }
                } else {
                    showNotification(result.message, 'error');
                    titleInput.value = currentlyEditing.novel;
                }

                saveButton.textContent = 'Simpan Semua Perubahan';
                saveButton.disabled = false;
            });

            // 8. Atur skala webview agar responsif — ResizeObserver supaya mengikuti resize window
            function rescaleHubWebview() {
                if (!wrapper.clientWidth) return;
                const containerWidth = wrapper.clientWidth;
                const scale = containerWidth / baseWidth;
                webview.style.transform = `scale(${scale})`;
                wrapper.style.height = `${baseHeight * scale}px`;
            }
            if (_hubWebviewRO) {
                _hubWebviewRO.disconnect();
                _activeObservers.delete(_hubWebviewRO);
            }
            _hubWebviewRO = new ResizeObserver(rescaleHubWebview);
            _hubWebviewRO.observe(scriptArea);
            _activeObservers.add(_hubWebviewRO);
            
            // Store cleanup function
            scriptArea._cleanup = () => {
                if (_hubWebviewRO) {
                    _hubWebviewRO.disconnect();
                    _activeObservers.delete(_hubWebviewRO);
                    _hubWebviewRO = null;
                }
            };
            
            // Initial scale setelah layout stabil
            setTimeout(rescaleHubWebview, 50);

                } catch (error) {
                    console.error('[Hub Preview] Error:', error);
                    showNotification('Gagal memuat preview: ' + error.message, 'error');
                } finally {
                    // Re-enable UI
                    const btn = document.getElementById('show-hub-preview-btn');
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Preview Hub';
                    }
                }
            })();
            
            await _hubPreviewPromise;
            _hubPreviewPromise = null;
        }

        // helper untuk merender daftar novel di editor
        function renderNovelSelectionList(stories) {
            editorNovelList.innerHTML = '';
            if (stories.length === 0) {
                editorNovelList.innerHTML = `<p>Belum ada novel. Buat novel baru terlebih dahulu.</p>`;
            } else {
                stories.forEach((story, index) => {
                    const storyCard = document.createElement('div');
                    storyCard.className = 'story-card';
                    storyCard.dataset.title = story.title;

                    // Cover sudah diselesaikan main process terhadap disk
                    // (`getProfileMediaWithFallback` → `findLegacyCover`): '' = memang
                    // tak ada. `|| 'cover.jpg'` yang dulu di sini membuang kebenaran itu
                    // dan meminta berkas yang tak ada → 404 senyap (terbukti pada
                    // "Jejak Bintang" & "Uji Fitur Engine").
                    if (story.cover) {
                        // Penanda versi = mtime cover (dari get-story-list). Dulu Date.now(),
                        // yang memang menyegarkan tetapi memaksa SEMUA cover dimuat ulang
                        // tiap daftar dirender; mtime hanya berubah saat berkasnya berubah.
                        const coverVersion = story.coverVersion ? `?v=${story.coverVersion}` : `?v=${Date.now()}`;
                        storyCard.style.backgroundImage = `url('./visual_novels/${encodeURIComponent(story.title)}/${story.cover}${coverVersion}')`;
                    } else {
                        storyCard.classList.add('no-cover');
                    }

                    storyCard.innerHTML = `
                <div class="overlay"><h2 class="story-title">${_escapeHTML(story.title)}</h2></div>
                <button class="delete-novel-btn" title="Hapus Novel">🗑️</button>
            `;

                    storyCard.onclick = (e) => {
                        // Jangan load novel jika yang diklik adalah tombol hapus
                        if (e.target.closest('.delete-novel-btn')) return;
                        console.info('[Onboarding][Renderer] Novel dibuka dari daftar existing.', {
                            novelTitle: story.title
                        });
                        if (typeof window._hideNewNovelOnboarding === 'function') {
                            window._hideNewNovelOnboarding('novel dibuka dari daftar existing');
                        }
                        loadNovelForEditing(story.title);
                    };

                    // Event listener untuk tombol hapus
                    const deleteBtn = storyCard.querySelector('.delete-novel-btn');
                    deleteBtn.onclick = async (e) => {
                        e.stopPropagation(); // Mencegah event bubbling ke storyCard
                        // Menggunakan showConfirmation() custom modal agar fokus tidak hilang
                        const confirmed = await showConfirmation(`Apakah Anda yakin ingin menghapus novel "${story.title}" beserta seluruh isinya? Tindakan ini tidak dapat dibatalkan.`);
                        if (confirmed) {
                            const result = await ipcRenderer.invoke('delete-novel-folder', story.title);
                            if (result.success) {
                                // DUA daftar memegang novel ini, bukan satu.
                                //
                                // Layar pemilihan editor (#editor-novel-list) dulu satu-satunya
                                // yang disegarkan di sini, sementara grid menu utama
                                // (#story-grid) tetap memajang kartu novel yang folder-nya
                                // sudah tidak ada — sampai vnManager.html dimuat ulang.
                                // Tester menemukannya persis begitu: "berhasil dihapus" lalu
                                // novelnya masih terpampang di belakang.
                                //
                                // `loadStories()` menarik ulang dari main process, jadi
                                // `storiesData` (yang dipakai pencarian) ikut bersih —
                                // menghapus kartunya dari DOM saja akan meninggalkan entri
                                // hantu yang muncul lagi begitu kotak Search dipakai.
                                if (typeof loadStories === 'function') {
                                    try { await loadStories(); }
                                    catch (e) { console.error('[Hapus Novel] Gagal menyegarkan grid utama:', e); }
                                }

                                const updatedStories = await ipcRenderer.invoke('get-story-list');
                                renderNovelSelectionList(updatedStories);
                                showNotification('Novel berhasil dihapus.', 'success');
                            } else {
                                showNotification(result.message || 'Gagal menghapus novel.', 'error');
                            }
                        }
                    };

                    editorNovelList.appendChild(storyCard);

                    // animasi muncul bertahap
                    setTimeout(() => {
                        storyCard.classList.add('show');
                    }, index * 50);
                });
            }
        }

        function groupScriptByPhase(scriptData) {
            return window.VNEditorFlowModel.groupScriptByPhase(scriptData);
        }

        let editorObserver = null;
        let _transitionObserver = null;
        const editorHistory = {
            undoStack: [],
            redoStack: [],
            lastHash: '',
            isApplyingSnapshot: false,
            maxSnapshots: 40
        };
        let historyDebounceTimer = null;
        let _baselineDirtyTimer = null;

        function isScriptEditorActive() {
            if (!scriptEditorOverlay || scriptEditorOverlay.style.display === 'none') return false;
            const activeTab = document.querySelector('.sidebar-tab.active');
            return !!activeTab && activeTab.dataset.tab === 'story' && !!currentlyEditing.chapter;
        }

        function isTypingElement(target) {
            if (!target) return false;
            if (target.isContentEditable) return true;
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        }

        // ==========================================================
        // EPOCH ISI NASKAH — penanda murah "sesuatu MUNGKIN berubah".
        //
        // `getScriptSnapshot()` bukan operasi ringan: ia menjalankan
        // `collectScriptDataFromEditor()`, yaitu ekstraksi PENUH seluruh
        // #script-editor-area, lalu hasilnya di-JSON.stringify. Untuk chapter
        // besar (yang terbesar di repo: 6.997 entri) itu berarti menyisir
        // ratusan ribu node dan membuat ratusan KB string.
        //
        // Sampai 21 Agustus 2026 biaya itu tak pernah terasa karena poller
        // penanda-kotor keluar lebih dulu: ia mencari elemen
        // `[data-novel-section="story"]` yang TIDAK PERNAH ADA, jadi
        // `scriptIsDirty()` tak pernah dipanggil dari sana. Ketika selektor itu
        // dibetulkan (§9.14c), pemeriksaannya jadi benar-benar jalan — setiap
        // 2 detik, selamanya, hanya untuk memutuskan apakah satu tab disorot.
        //
        // Epoch memutus itu tanpa mengorbankan ketelitian: selama tak ada yang
        // menyentuh naskah, jawabannya PASTI sama, jadi boleh dipakai ulang.
        // Arah amannya sengaja dipilih — bila ragu, hitung ulang.
        // ==========================================================
        var _scriptEpoch = 0;
        var _scriptDirtyCache = { epoch: -1, value: false };

        function _bumpScriptEpoch() { _scriptEpoch++; }
        window._bumpScriptEpoch = _bumpScriptEpoch;

        // Sinyal perubahan. `input`/`change` menangkap ketikan & pemilihan;
        // MutationObserver (dipasang di loadChapterScript) menangkap kartu yang
        // ditambah/dihapus/dipindah. Keduanya dipasang di fase CAPTURE supaya tak
        // bisa ditelan handler lain yang memanggil stopPropagation.
        (function pasangSinyalEpoch() {
            var area = document.getElementById('script-editor-area');
            if (!area) return;
            ['input', 'change'].forEach(function (ev) {
                area.addEventListener(ev, _bumpScriptEpoch, true);
            });
        })();

        function getScriptSnapshot() {
            if (typeof window.collectScriptDataFromEditor !== 'function') return null;
            try {
                return window.collectScriptDataFromEditor();
            } catch (error) {
                console.warn('[History] Gagal mengambil snapshot script:', error);
                return null;
            }
        }

        function getSnapshotHash(snapshot) {
            try {
                return JSON.stringify(snapshot);
            } catch (error) {
                console.warn('[History] Gagal membuat hash snapshot:', error);
                return String(Date.now());
            }
        }

        function getAvailableRefsFromScript(scriptData) {
            const labels = [];
            const phases = [];
            (scriptData || []).forEach(entry => {
                if (!entry || typeof entry !== 'object') return;
                if (entry.type === 'label' && entry.name) labels.push(entry.name);
                if (entry.type === 'phase' && entry.name) phases.push(entry.name);
            });

            return {
                labels: Array.from(new Set(labels)),
                phases: Array.from(new Set(phases))
            };
        }

        function updateUndoRedoButtons() {
            const undoBtn = document.getElementById('undo-script-btn');
            const redoBtn = document.getElementById('redo-script-btn');

            if (!undoBtn || !redoBtn) return;

            const canUndo = editorHistory.undoStack.length > 1;
            const canRedo = editorHistory.redoStack.length > 0;

            undoBtn.disabled = !canUndo;
            redoBtn.disabled = !canRedo;

            undoBtn.title = canUndo
                ? `Undo (Ctrl+Z) - ${editorHistory.undoStack.length - 1} langkah`
                : 'Undo (Ctrl+Z)';
            redoBtn.title = canRedo
                ? `Redo (Ctrl+Shift+Z / Ctrl+Y) - ${editorHistory.redoStack.length} langkah`
                : 'Redo (Ctrl+Shift+Z / Ctrl+Y)';
        }

        function recordHistorySnapshot() {
            if (!isScriptEditorActive() || editorHistory.isApplyingSnapshot) return;

            const snapshot = getScriptSnapshot();
            if (!snapshot) return;

            const nextHash = getSnapshotHash(snapshot);

            // Hash-nya sudah terlanjur dihitung di sini, jadi jawaban "kotor?"
            // ikut disegarkan gratis. Inilah yang membuat poll 2 detik tak pernah
            // perlu mengekstrak ulang selagi kreator mengetik: snapshot history
            // (debounce 280 ms) selalu tiba lebih dulu.
            if (_scriptSavedHash !== null) {
                _scriptDirtyCache = { epoch: _scriptEpoch, value: nextHash !== _scriptSavedHash };
            }

            if (nextHash === editorHistory.lastHash) return;

            editorHistory.undoStack.push(snapshot);
            if (editorHistory.undoStack.length > editorHistory.maxSnapshots) {
                editorHistory.undoStack.shift();
            }

            editorHistory.redoStack = [];
            editorHistory.lastHash = nextHash;
            updateUndoRedoButtons();
        }

        // Onboarding — langkah "Tulis Script" menandai user BENAR-BENAR menyunting
        // naskah, bukan sekadar chapter terbuka (membuat chapter pertama otomatis
        // memanggil loadChapterScript). Dipicu dari listener `input` di
        // #script-editor-area: hanya ketikan/pilihan ASLI user yang memicunya —
        // penyetelan programatik lewat `.value =` tidak, prinsip yang sama dipakai
        // langkah Profil.
        //
        // SENGAJA tidak memakai editorHistory.undoStack sebagai sinyal: snapshot
        // bergantung pada `window.collectScriptDataFromEditor` yang TIDAK PERNAH
        // didefinisikan di codebase, jadi undoStack tak pernah tumbuh. MutationObserver
        // juga tak dipakai karena dipasang SEBELUM updateAllJumpTargetDropdowns() yang
        // memutasi DOM → bisa salah-centang saat script baru dibuka.
        // Latch sekali per sesi onboarding; idempoten dan murah dipanggil berulang.
        function _noteOnboardingScriptEdit() {
            if (!window._novelOnboarding || window._hasEditedScript) return;
            window._hasEditedScript = true;
            if (typeof window._updateOnboardingState === 'function') window._updateOnboardingState();
        }

        function scheduleHistorySnapshot() {
            if (editorHistory.isApplyingSnapshot) return;
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = setTimeout(recordHistorySnapshot, 280);
        }

        function initializeHistoryForCurrentChapter(initialSnapshot) {
            editorHistory.undoStack = [];
            editorHistory.redoStack = [];
            editorHistory.lastHash = '';
            // Saat baru selesai memuat, payload IPC sudah merupakan snapshot
            // canonical untuk keperluan Undo/Redo (lastHash di sini cuma
            // pembanding "apakah snapshot berikutnya beda dari yang barusan",
            // bukan baseline dirty — lihat catatan di bawah untuk itu).
            // Memakainya langsung menghindari parse ulang ribuan data-raw-entry
            // hanya untuk menghasilkan data yang identik.
            if (Array.isArray(initialSnapshot)) {
                editorHistory.undoStack.push(initialSnapshot);
                editorHistory.lastHash = getSnapshotHash(initialSnapshot);
            } else {
                recordHistorySnapshot();
            }
            updateUndoRedoButtons();

            // Baseline dirty TIDAK BOLEH memakai hash mentah di atas: itu hash
            // dari `initialSnapshot` SEBELUM lewat pipeline ekstraksi
            // (extractFromCard/collectScriptDataFromEditor), sedangkan
            // scriptIsDirty() nanti SELALU membandingkan dengan hasil SESUDAH
            // ekstraksi. Keduanya bisa berbeda walau isinya sama menurut engine —
            // mis. label lama menyimpan bgmVolume sebagai string "1" padahal
            // ekstraksi sekarang menuliskannya sebagai angka 1, atau kunci bawaan
            // yang dipangkas `_buangBawaanTakDisentuh`. Membandingkan mentah vs
            // hasil-ekstraksi membuat chapter yang BELUM disentuh sama sekali
            // dilaporkan "kotor" hanya karena formatnya beda dari kali terakhir
            // file itu disimpan — persis yang dikeluhkan tester (konfirmasi
            // "belum disimpan" muncul walau tak ada yang diubah).
            //
            // Baseline yang benar HARUS lewat pipeline ekstraksi yang sama, jadi
            // dikerjakan satu kali lewat markScriptSaved() tanpa argumen. Supaya
            // itu tak menambah beban ke jalur render chapter besar, pekerjaannya
            // dijeda lewat setTimeout(0): scriptIsDirty() aman menjawab "belum
            // kotor" selama _scriptSavedHash masih null (baseline belum siap).
            _scriptSavedHash = null;
            _scriptDirtyCache = { epoch: _scriptEpoch, value: false };
            const chapterSaatIni = currentlyEditing.chapter;
            clearTimeout(_baselineDirtyTimer);
            _baselineDirtyTimer = setTimeout(function () {
                if (currentlyEditing.chapter !== chapterSaatIni) return;
                markScriptSaved();
            }, 0);
        }

        // ===== Deteksi dirty script (untuk konfirmasi simpan saat tekan "Kembali") =====
        // Bandingkan isi editor saat ini dengan baseline terakhir (saat dimuat / disimpan).
        var _scriptSavedHash = null;

        /** @param {string} [hashSiap] hash isi saat ini bila pemanggil sudah punya. */
        function markScriptSaved(hashSiap) {
            _scriptSavedHash = (typeof hashSiap === 'string' && hashSiap)
                ? hashSiap
                : getSnapshotHash(getScriptSnapshot());
            // Baru saja disimpan/dimuat → menurut definisi bersih.
            _scriptDirtyCache = { epoch: _scriptEpoch, value: false };
        }

        function scriptIsDirty() {
            if (!currentlyEditing.chapter) return false;
            if (_scriptSavedHash === null) return false;
            // Tak ada yang menyentuh naskah sejak jawaban terakhir → jawabannya
            // pasti masih sama. Inilah yang membuat poll tiap 2 detik gratis saat
            // kreator sedang membaca, bukan mengetik.
            if (_scriptDirtyCache.epoch === _scriptEpoch) return _scriptDirtyCache.value;
            var snap = getScriptSnapshot();
            if (!snap) return false;
            var kotor = getSnapshotHash(snap) !== _scriptSavedHash;
            _scriptDirtyCache = { epoch: _scriptEpoch, value: kotor };
            return kotor;
        }
        window._markScriptSaved = markScriptSaved;
        window._scriptIsDirty = scriptIsDirty;

        function restoreSnapshot(snapshot) {
            if (!Array.isArray(snapshot)) return;

            editorHistory.isApplyingSnapshot = true;
            try {
                const groupedData = groupScriptByPhase(snapshot);
                const refs = getAvailableRefsFromScript(snapshot);
                renderGroupedScriptEditor(groupedData, refs.labels, refs.phases);
                updateAllJumpTargetDropdowns();

                if (typeof window.checkSpriteTransitionVisibility === 'function') {
                    setTimeout(window.checkSpriteTransitionVisibility, 100);
                }
            } finally {
                editorHistory.lastHash = getSnapshotHash(snapshot);
                editorHistory.isApplyingSnapshot = false;
                updateUndoRedoButtons();
            }
        }

        function undoScriptChanges() {
            if (editorHistory.undoStack.length <= 1) return;

            const currentSnapshot = editorHistory.undoStack.pop();
            editorHistory.redoStack.push(currentSnapshot);

            const prevSnapshot = editorHistory.undoStack[editorHistory.undoStack.length - 1];
            restoreSnapshot(prevSnapshot);
        }

        function redoScriptChanges() {
            if (editorHistory.redoStack.length === 0) return;

            const nextSnapshot = editorHistory.redoStack.pop();
            editorHistory.undoStack.push(nextSnapshot);
            restoreSnapshot(nextSnapshot);
        }

        window.initializeEditorHistoryForChapter = initializeHistoryForCurrentChapter;
        window.undoScriptChanges = undoScriptChanges;
        window.redoScriptChanges = redoScriptChanges;

        // (Chip "jenis player" di header chapter DICABUT 2026-07-30 atas keputusan
        //  pengembang. Alasannya: untuk novel yang SELURUH chapternya custom — DDLC,
        //  13 dari 13 — chip menyala terus dan menasihati keputusan yang memang sadar,
        //  bertentangan dengan prinsip `data-player-omit` (berhenti memperingatkan
        //  begitu maksud kreator jelas; berkas custom itu SENDIRI adalah pernyataan
        //  maksud). Yang tetap berdiri: banner jenis player di panel VN Player (§21)
        //  beserta jalan keluarnya, dan penandaan kosakata di dropdown-nya sendiri.)

        // Guard untuk mencegah race condition saat user switch chapter cepat
        let _loadChapterRequestId = 0;

        function cancelPendingChapterLoad() {
            _loadChapterRequestId++;
            _indikatorSelesai();
            clearTimeout(historyDebounceTimer);
            clearTimeout(window.spriteTransitionCheckTimeout);
            if (editorObserver) {
                editorObserver.disconnect();
                editorObserver = null;
            }
            window._scriptLoadedChapter = null;
        }
        window.cancelPendingChapterLoad = cancelPendingChapterLoad;

        // Muat isi script.json dari chapter yang dipilih
        async function loadChapterScript(chapterName) {
            if (!chapterName) {
                console.error("loadChapterScript dipanggil tanpa chapterName yang valid. Proses dibatalkan.");
                _tampilkanStatusNaskah('error', 'Chapter tidak dapat dibuka',
                    'Tidak ada nama chapter yang diberikan.', '');
                return;
            }

            const requestId = ++_loadChapterRequestId;

            // Bersihkan lint panel dari chapter sebelumnya
            if (typeof window.clearLintPanel === 'function') window.clearLintPanel();

            currentlyEditing.chapter = chapterName;
            // Editor BELUM memegang isi chapter ini sampai render sukses. Selama
            // jendela ini menyimpan harus ditolak — lihat guard di saveScriptChanges().
            window._scriptLoadedChapter = null;
            switchWorkspaceView('script');
            editingChapterName.textContent = `Membuka: ${chapterName}`;
            _setKontrolSaatMemuat(true);
            _aturModeNaskahBesar(false, 0);
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            _tampilkanStatusNaskah('loading', 'Membuka naskah…',
                'Membaca script.json, memvalidasi struktur, dan menyiapkan editor.', chapterName);

            document.querySelectorAll('.chapter-edit-item').forEach(el => {
                el.classList.toggle('active', el.dataset.originalName === chapterName);
            });

            let result;
            try {
                result = await ipcRenderer.invoke('get-script-content', {
                    storyTitle: currentlyEditing.novel,
                    chapterName: chapterName
                });
            } catch (error) {
                if (requestId !== _loadChapterRequestId) return;
                console.error('[loadChapterScript] IPC gagal:', error);
                _tampilkanStatusNaskah('error', 'Naskah tidak dapat dibuka',
                    _detailErrorNaskah(error && error.message), chapterName);
                editingChapterName.textContent = `Gagal membuka: ${chapterName}`;
                _setKontrolSaatMemuat(true);
                return;
            }

            // Cek apakah user sudah switch ke chapter lain saat menunggu IPC
            if (requestId !== _loadChapterRequestId) {
                console.log('[loadChapterScript] Stale response diabaikan — user sudah switch chapter.');
                return;
            }

            if (result && result.success && Array.isArray(result.data)) {
                try {
                const bertahap = BERTAHAP_AKTIF && result.data.length >= AMBANG_BERTAHAP;
                _aturModeNaskahBesar(bertahap, result.data.length);
                const availableLabels = result.data
                    .filter(entry => entry.type === 'label')
                    .map(entry => entry.name);

                const availablePhases = result.data
                    .filter(entry => entry.type === 'phase' && entry.name)
                    .map(entry => entry.name);

                const groupedData = groupScriptByPhase(result.data);

                // Naskah kecil (median di repo: 29 entri) tetap lewat jalur lama
                // yang sepenuhnya sinkron — selesai seketika, dan memecahnya hanya
                // menambah kedipan indikator.
                const batal = () => requestId !== _loadChapterRequestId;
                let targetLompatanSiap = false;
                let historySiap = false;

                if (!bertahap) {
                    renderGroupedScriptEditor(groupedData, availableLabels, availablePhases);
                    scriptEditorArea.querySelectorAll('.image-input').forEach(input => {
                        updateImagePreviewUI(input);
                    });
                } else {
                    // Tombol Alur digerbang selama membangun: ia membaca .phase-card
                    // dari DOM, dan DOM yang baru separuh terisi menghasilkan graf
                    // yang salah tanpa satu pun galat. (Simpan sudah terjaga sendiri
                    // lewat window._scriptLoadedChapter yang baru diisi di akhir.)
                    const tombolAlur = document.getElementById('btn-visualize-flow');
                    if (tombolAlur) tombolAlur.disabled = true;

                    const TOTAL_TAHAP = 5;
                    _indikatorMulai(TOTAL_TAHAP);
                    try {
                        const ok1 = await renderGroupedScriptEditorBertahap(
                            groupedData, availableLabels, availablePhases, batal,
                            (selesai, total, nama) => _indikatorLapor(
                                1, 'Membangun entri', selesai, total,
                                nama ? 'Label: ' + nama : ''));
                        if (!ok1) return;

                        const gambar = scriptEditorArea.querySelectorAll('.image-input');
                        const ok2 = await _sapuBertahap(gambar, updateImagePreviewUI, batal,
                            (selesai, total) => _indikatorLapor(2, 'Menyiapkan pratinjau gambar', selesai, total, ''));
                        if (!ok2) return;

                        const centang = scriptEditorArea.querySelectorAll('.persist-background-checkbox');
                        const ok3 = await _sapuBertahap(centang, toggleTransitionOutControls, batal,
                            (selesai, total) => _indikatorLapor(3, 'Menyiapkan kontrol scene', selesai, total, ''));
                        if (!ok3) return;

                        _indikatorLapor(4, 'Menautkan target lompatan', 0, 1, '');
                        await _nafas();   // biar tulisannya sempat terlihat sebelum blok berikutnya
                        if (batal()) return;
                        updateAllJumpTargetDropdowns();
                        targetLompatanSiap = true;
                        _indikatorLapor(4, 'Menautkan target lompatan', 1, 1, 'Selesai');

                        _indikatorLapor(5, 'Menyiapkan riwayat Undo', 0, 1, '');
                        await _nafas();
                        if (batal()) return;
                        initializeHistoryForCurrentChapter(result.data);
                        historySiap = true;
                        _indikatorLapor(5, 'Menyiapkan riwayat Undo', 1, 1, 'Selesai');
                        await _nafas();
                    } finally {
                        _indikatorSelesai();
                        if (tombolAlur) tombolAlur.disabled = false;
                    }
                }

                workspaceControlsBar.style.display = 'flex';
                const btnVisualize = document.getElementById('btn-visualize-flow');
                if (btnVisualize) btnVisualize.style.display = 'inline-block';
                const saveScriptBtnEl = document.getElementById('save-script-btn');
                if (saveScriptBtnEl) saveScriptBtnEl.style.display = 'inline-flex';

                // Hentikan observer lama jika ada, untuk mencegah duplikasi
                if (editorObserver) {
                    editorObserver.disconnect();
                }

                // Siapkan observer baru untuk mengawasi perubahan DOM
                const targetNode = scriptEditorArea;
                const config = { childList: true, subtree: true };

                // Callback yang akan dijalankan setiap ada perubahan
                const callback = function (mutationsList, observer) {
                    const hanyaPergantianModeKartu = mutationsList.length > 0 &&
                        mutationsList.every(function (mutation) {
                            if (mutation.addedNodes.length !== 1 || mutation.removedNodes.length !== 1) return false;
                            const added = mutation.addedNodes[0];
                            const removed = mutation.removedNodes[0];
                            if (!added || !removed || added.nodeType !== 1 || removed.nodeType !== 1) return false;
                            const sameOrdinal = added.dataset && removed.dataset &&
                                added.dataset.compactOrdinal &&
                                added.dataset.compactOrdinal === removed.dataset.compactOrdinal;
                            const compactToFull = added.dataset?.largeHydrated === 'true' &&
                                removed.dataset?.compactEntry === 'true';
                            const fullToCompact = added.dataset?.compactEntry === 'true' &&
                                removed.dataset?.largeHydrated === 'true';
                            return !!sameOrdinal && (compactToFull || fullToCompact);
                        });
                    if (hanyaPergantianModeKartu) return;
                    // Kartu ditambah/dihapus/dipindah — isi naskah mungkin berubah.
                    _bumpScriptEpoch();
                    scheduleHistorySnapshot();
                };

                editorObserver = new MutationObserver(callback);
                editorObserver.observe(targetNode, config);

                // Jalur bertahap sudah menyapu ini sebagai tahap 3.
                if (!bertahap) {
                    scriptEditorArea.querySelectorAll('.persist-background-checkbox').forEach(checkbox => {
                        toggleTransitionOutControls(checkbox);
                    });
                }

                if (!targetLompatanSiap) updateAllJumpTargetDropdowns();
                if (!historySiap) initializeHistoryForCurrentChapter(result.data);

                // Render sukses → editor kini benar-benar memegang isi chapter ini,
                // sehingga menyimpan aman (termasuk bila chapter memang kosong).
                window._scriptLoadedChapter = chapterName;
                scriptEditorArea.setAttribute('aria-busy', 'false');
                editingChapterName.textContent = `Mengedit: ${chapterName}`;
                _setKontrolSaatMemuat(false);

                // Segarkan checklist onboarding (mis. langkah "Chapter Pertama").
                // CATATAN: MEMBUKA script sengaja TIDAK lagi mencentang "Tulis Script".
                // Membuat chapter pertama otomatis memanggil loadChapterScript, jadi
                // dulu dua langkah tercentang sekaligus padahal user belum menulis
                // apa pun. Langkah itu kini dilatch oleh suntingan NYATA di
                // recordHistorySnapshot().
                if (typeof window._updateOnboardingState === 'function') window._updateOnboardingState();
                } catch (error) {
                    if (requestId !== _loadChapterRequestId) return;
                    console.error('[loadChapterScript] Renderer naskah gagal:', error);
                    if (typeof window.destroyScriptEditorSortables === 'function') {
                        window.destroyScriptEditorSortables(scriptEditorArea);
                    }
                    _aturModeNaskahBesar(false, 0);
                    _tampilkanStatusNaskah('error', 'Editor gagal menampilkan naskah',
                        _detailErrorNaskah(error && error.message), chapterName);
                    editingChapterName.textContent = `Gagal membuka: ${chapterName}`;
                    window._scriptLoadedChapter = null;
                    _setKontrolSaatMemuat(true);
                    return;
                }

            } else {
                _aturModeNaskahBesar(false, 0);
                const loadMessage = result && result.message
                    ? result.message
                    : 'Isi script.json bukan array naskah yang valid.';
                _tampilkanStatusNaskah('error', 'Naskah tidak dapat dibuka',
                    _detailErrorNaskah(loadMessage), chapterName);
                editingChapterName.textContent = `Gagal membuka: ${chapterName}`;
                workspaceControlsBar.style.display = 'none';
                const btnVisualize = document.getElementById('btn-visualize-flow');
                if (btnVisualize) btnVisualize.style.display = 'none';
                setChapterAssetsAvailable(false);
                // Layar error TIDAK boleh bisa disimpan: dulu tombol Simpan tetap
                // terlihat dari chapter sebelumnya sementara currentlyEditing.chapter
                // masih terisi, sehingga satu klik menimpa naskah di disk jadi kosong.
                window._scriptLoadedChapter = null;
                const saveScriptBtnErr = document.getElementById('save-script-btn');
                if (saveScriptBtnErr) saveScriptBtnErr.style.display = 'none';
            }

            // Aset diambil HANYA kalau naskahnya benar-benar termuat. Dulu blok ini
            // berada di luar percabangan sukses/gagal, jadi layar error pun tetap
            // memunculkan panel aset — memberi kesan chapternya terbuka padahal tidak.
            if (!result || !result.success || !Array.isArray(result.data)) return;

            let chapterAssets;
            try {
                chapterAssets = await ipcRenderer.invoke('get-chapter-assets', {
                    novelTitle: currentlyEditing.novel,
                    chapterName: currentlyEditing.chapter
                });
            } catch (error) {
                if (requestId === _loadChapterRequestId) {
                    console.warn('[loadChapterScript] Aset chapter gagal dimuat:', error);
                    setChapterAssetsAvailable(false);
                }
                return;
            }

            // Penjaga respons basi, memakai penghitung yang sama dengan naskahnya:
            // pertanyaannya identik ("masih chapter yang sama?"), dan dua penghitung
            // terpisah untuk satu pertanyaan pasti menyimpang cepat atau lambat.
            // Tanpa ini, daftar aset chapter LAMA bisa mendarat di chapter baru.
            if (requestId !== _loadChapterRequestId) {
                console.log('[loadChapterScript] Respons aset basi diabaikan — chapter sudah berganti.');
                return;
            }

            renderAssetExplorer(chapterAssets, 'chapter-asset-content');
            setChapterAssetsAvailable(true);
        }

        // ==============================================================
        // PEMUATAN NASKAH BERTAHAP
        //
        // Naskah besar dulu dibangun dalam SATU task sinkron. Utas UI terkunci
        // dari awal sampai akhir, jadi tulisan "Memuat skrip..." memang tampil
        // tetapi tak pernah bisa bergerak — itulah kenapa terasa mati, bukan
        // sekadar lambat.
        //
        // Ukurannya nyata: kartu dialogue = 356 elemen DOM (93% di antaranya di
        // dalam seksi terlipat yang tak pernah dibuka), dan chapter terbesar di
        // repo punya 6.997 entri.
        //
        // AMBANG. Median chapter cuma 29 entri dan selesai seketika; memecahnya
        // di situ hanya menambah kedipan indikator tanpa manfaat. Di bawah ambang,
        // jalur LAMA yang sepenuhnya sinkron tetap dipakai apa adanya.
        const AMBANG_BERTAHAP = 200;

        // Jalur ini kini aman dinyalakan: chapter besar memakai kartu ringkas
        // (payload raw tetap canonical) dan pekerjaan dipecah per entri. Batching
        // menjaga event loop hidup; kartu ringkaslah yang membatasi heap Oilpan.
        const BERTAHAP_AKTIF = true;

        // Anggaran per batch. 12 ms menyisakan ruang di dalam satu frame 60 Hz
        // untuk browser benar-benar melukis — itu bedanya "mengalir" dan
        // "tersendat". Batch DIUKUR waktu, bukan dihitung jumlah, karena berat
        // tiap node berbeda jauh (satu label bisa memuat ratusan entri).
        const ANGGARAN_BATCH_MS = 12;

        function _nafas() {
            return new Promise(function (resolve) {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { resolve(); });
                else setTimeout(resolve, 0);
            });
        }

        // -------- State loading/error dan toolbar chapter besar --------
        let _timerFilterNaskahBesar = null;

        function _tampilkanStatusNaskah(kind, title, detail, chapterName) {
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.replaceChildren();
            scriptEditorArea.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
            const panel = document.createElement('div');
            panel.className = 'script-load-state script-load-state-' + kind;
            panel.setAttribute('role', kind === 'error' ? 'alert' : 'status');

            const icon = document.createElement('div');
            icon.className = 'script-load-state-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = kind === 'loading' ? '' : '!';
            const copy = document.createElement('div');
            copy.className = 'script-load-state-copy';
            const heading = document.createElement('h4');
            heading.textContent = title;
            const paragraph = document.createElement('p');
            paragraph.textContent = detail || '';
            copy.appendChild(heading);
            copy.appendChild(paragraph);
            panel.appendChild(icon);
            panel.appendChild(copy);

            if (kind === 'loading') {
                const skeleton = document.createElement('div');
                skeleton.className = 'script-load-skeleton';
                skeleton.setAttribute('aria-hidden', 'true');
                for (let i = 0; i < 3; i++) skeleton.appendChild(document.createElement('span'));
                copy.appendChild(skeleton);
            } else if (kind === 'error') {
                const actions = document.createElement('div');
                actions.className = 'script-load-state-actions';
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'script-load-retry';
                retry.textContent = 'Coba lagi';
                retry.addEventListener('click', function () {
                    loadChapterScript(chapterName || currentlyEditing.chapter);
                });
                actions.appendChild(retry);
                copy.appendChild(actions);
            }
            scriptEditorArea.appendChild(panel);
        }

        function _detailErrorNaskah(message) {
            const detail = String(message || 'Terjadi kesalahan yang tidak diketahui.');
            if (/json|unexpected token|unexpected end|position\s+\d+/i.test(detail)) {
                return 'Format script.json tidak valid. Periksa koma, kurung, atau teks di sekitar posisi yang disebutkan. Detail: ' + detail;
            }
            return detail;
        }

        function _setKontrolSaatMemuat(loading) {
            const flow = document.getElementById('btn-visualize-flow');
            const save = document.getElementById('save-script-btn');
            if (flow) {
                flow.disabled = !!loading;
                if (loading) flow.style.display = 'none';
            }
            if (save) {
                save.disabled = !!loading;
                if (loading) save.style.display = 'none';
            }
            if (loading) {
                workspaceControlsBar.style.display = 'none';
                setChapterAssetsAvailable(false);
            }
        }

        function _aturModeNaskahBesar(active, total) {
            active = !!active;
            total = Number(total) || 0;
            window._vnEditorCompactMode = active;
            window._vnEditorLargeScriptCount = active ? total : 0;
            editorHistory.maxSnapshots = active ? 8 : 40;
            scriptEditorArea.classList.toggle('large-script-mode', active);

            const toolbar = document.getElementById('large-script-toolbar');
            const search = document.getElementById('large-script-search');
            const statusGroup = document.getElementById('large-script-status');
            const summary = document.getElementById('large-script-summary');
            const status = document.getElementById('large-script-filter-status');

            // Kotak pencarian tersedia untuk CHAPTER APA PUN yang benar-benar
            // termuat — bukan cuma yang masuk mode ringan. Chapter kecil
            // (median cuma puluhan entri) layak dicari tanpa scroll manual;
            // "cukup fitur searching saja" untuknya, tanpa status/"Ringkas
            // semua" yang memang tak bermakna tanpa kartu ter-hydrate.
            const ada = total > 0;
            if (toolbar) toolbar.hidden = !ada;
            if (!ada && search) search.value = '';

            // Grup status+"Ringkas semua" tetap KHUSUS mode ringan.
            if (statusGroup) statusGroup.hidden = !active;
            if (!active) {
                if (status) status.textContent = '';
                return;
            }
            const formatted = total.toLocaleString('id-ID');
            if (summary) {
                const limit = Number(window._compactEntryLimit) || 6;
                summary.textContent = formatted + ' entri dimuat hemat memori. Klik kartu untuk mengedit; maksimal ' +
                    limit + ' editor lengkap dibuka bersamaan.';
            }
            if (status) status.textContent = 'Menampilkan seluruh ' + formatted + ' entri.';
        }

        function _teksCariCard(card) {
            if (card.__searchText) return card.__searchText;
            let data = null;
            try { data = JSON.parse(card.dataset.rawEntry || '{}'); } catch (e) { data = null; }
            if (data && typeof window._compactEntrySearchText === 'function') {
                card.__searchText = window._compactEntrySearchText(card.dataset.type, data);
                return card.__searchText;
            }
            return String(card.textContent || '').toLocaleLowerCase('id-ID');
        }

        function _terapkanFilterNaskahBesar(query) {
            // Bukan lagi khusus mode ringan — kotak pencarian kini tersedia
            // untuk chapter apa pun yang termuat, jadi penjaganya cukup
            // "ada chapter yang dibuka", bukan "chapter ini besar".
            if (!currentlyEditing.chapter) return;
            const q = String(query || '').trim().toLocaleLowerCase('id-ID');
            const cards = Array.from(scriptEditorArea.querySelectorAll('.dialogue-entry-card'));
            let cocok = 0;

            scriptEditorArea.querySelectorAll('.phase-card, .label-group-container, .sub-label-container')
                .forEach(function (el) { el.hidden = false; });
            cards.forEach(function (card) {
                const match = !q || _teksCariCard(card).includes(q);
                card.hidden = !match;
                if (match) cocok++;
            });

            if (q) {
                Array.from(scriptEditorArea.querySelectorAll('.sub-label-container')).reverse().forEach(function (group) {
                    const nama = String(group.querySelector('.sub-label-name-input')?.value || '').toLocaleLowerCase('id-ID');
                    const hasVisible = !!group.querySelector('.dialogue-entry-card:not([hidden]), .sub-label-container:not([hidden])');
                    group.hidden = !nama.includes(q) && !hasVisible;
                });
                Array.from(scriptEditorArea.querySelectorAll('.label-group-container')).reverse().forEach(function (group) {
                    const nama = String(group.querySelector('.label-name-input')?.value || '').toLocaleLowerCase('id-ID');
                    const hasVisible = !!group.querySelector('.dialogue-entry-card:not([hidden]), .sub-label-container:not([hidden])');
                    group.hidden = !nama.includes(q) && !hasVisible;
                });
                scriptEditorArea.querySelectorAll('.phase-card').forEach(function (phase) {
                    const nama = String(phase.querySelector('.phase-name-input')?.value || '').toLocaleLowerCase('id-ID');
                    const hasVisible = !!phase.querySelector('.dialogue-entry-card:not([hidden]), .label-group-container:not([hidden])');
                    phase.hidden = !nama.includes(q) && !hasVisible;
                });
            }

            const status = document.getElementById('large-script-filter-status');
            if (status) {
                status.textContent = q
                    ? cocok.toLocaleString('id-ID') + ' dari ' + cards.length.toLocaleString('id-ID') + ' entri cocok.'
                    : 'Menampilkan seluruh ' + cards.length.toLocaleString('id-ID') + ' entri.';
            }
        }

        function _pasangToolbarNaskahBesar() {
            const search = document.getElementById('large-script-search');
            const clear = document.getElementById('large-script-search-clear');
            const collapse = document.getElementById('collapse-large-script-cards');
            if (search && search.dataset.bound !== 'true') {
                search.dataset.bound = 'true';
                search.addEventListener('input', function () {
                    clearTimeout(_timerFilterNaskahBesar);
                    _timerFilterNaskahBesar = setTimeout(function () {
                        _terapkanFilterNaskahBesar(search.value);
                    }, 120);
                });
                search.addEventListener('keydown', function (event) {
                    if (event.key !== 'Enter') return;
                    const first = scriptEditorArea.querySelector('.dialogue-entry-card:not([hidden])');
                    if (!first) return;
                    const target = first.matches('.compact-entry-card') && typeof window._hydrateCompactEntryCard === 'function'
                        ? window._hydrateCompactEntryCard(first) : first;
                    if (target && typeof target.scrollIntoView === 'function') {
                        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }
                });
            }
            if (clear && clear.dataset.bound !== 'true') {
                clear.dataset.bound = 'true';
                clear.addEventListener('click', function () {
                    if (search) {
                        search.value = '';
                        search.focus();
                    }
                    _terapkanFilterNaskahBesar('');
                });
            }
            if (collapse && collapse.dataset.bound !== 'true') {
                collapse.dataset.bound = 'true';
                collapse.addEventListener('click', function () {
                    const count = typeof window._collapseAllCompactEntries === 'function'
                        ? window._collapseAllCompactEntries() : 0;
                    const status = document.getElementById('large-script-filter-status');
                    if (status && count) status.textContent = count + ' editor lengkap diringkas kembali.';
                });
            }
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _pasangToolbarNaskahBesar, { once: true });
        } else {
            _pasangToolbarNaskahBesar();
        }

        // -------- Indikator progres --------
        // Sengaja TIDAK memakai satu bar global. Total kerja seluruh tahap tak
        // diketahui di muka (tiap tahap baru bisa menghitung unitnya sesudah tahap
        // sebelumnya selesai), jadi bar global akan menebak — dan tebakan yang
        // meleset melahirkan bar yang melesat ke 100% lalu diam, persis pengalaman
        // yang ingin dihindari. Yang ditampilkan: nomor tahap, nama tahap, bar
        // untuk tahap BERJALAN, dan nama bagian yang sedang dipasang.
        var _indikator = null;

        function _indikatorMulai(totalTahap) {
            var induk = document.getElementById('script-canvas-main');
            if (!induk) return;
            _indikatorSelesai();
            var el = document.createElement('div');
            el.className = 'script-load-progress';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.innerHTML =
                '<div class="slp-tahap"></div>' +
                '<div class="slp-bar"><div class="slp-bar-isi"></div></div>' +
                '<div class="slp-detail"></div>';
            induk.appendChild(el);
            _indikator = {
                el: el,
                totalTahap: totalTahap,
                tahapEl: el.querySelector('.slp-tahap'),
                isiEl: el.querySelector('.slp-bar-isi'),
                detailEl: el.querySelector('.slp-detail')
            };
        }

        function _indikatorLapor(nomorTahap, namaTahap, selesai, total, detail) {
            if (!_indikator) return;
            _indikator.tahapEl.textContent =
                'Tahap ' + nomorTahap + '/' + _indikator.totalTahap + ' · ' + namaTahap;
            var persen = total > 0 ? Math.round((selesai / total) * 100) : 100;
            _indikator.isiEl.style.width = persen + '%';
            _indikator.detailEl.textContent = detail
                ? detail
                : (total > 1 ? selesai.toLocaleString('id-ID') + ' dari ' + total.toLocaleString('id-ID') : '');
        }

        function _indikatorSelesai() {
            if (_indikator && _indikator.el && _indikator.el.parentNode) {
                _indikator.el.parentNode.removeChild(_indikator.el);
            }
            _indikator = null;
        }

        /**
         * Jalankan daftar closure dalam batch beranggaran waktu.
         *
         * `batal()` diperiksa di SETIAP batas batch, bukan sekali di awal: kreator
         * bisa memilih chapter lain di tengah pembangunan, dan dua pembangunan yang
         * saling menimpa di area yang sama menghasilkan naskah campur aduk.
         *
         * @returns {Promise<boolean>} false bila dibatalkan.
         */
        async function _jalankanBatch(langkah, batal, lapor) {
            var i = 0;
            while (i < langkah.length) {
                if (batal && batal()) return false;
                var mulai = performance.now();
                var namaTerakhir = '';
                while (i < langkah.length && (performance.now() - mulai) < ANGGARAN_BATCH_MS) {
                    var fn = langkah[i++];
                    if (fn && fn.nama) namaTerakhir = fn.nama;
                    fn();
                }
                if (lapor) lapor(i, langkah.length, namaTerakhir);
                if (i < langkah.length) await _nafas();
            }
            return true;
        }

        /** Versi bertahap dari renderGroupedScriptEditor. */
        async function renderGroupedScriptEditorBertahap(groupedData, availableLabels, availablePhases, batal, lapor) {
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.innerHTML = '';
            if (groupedData.length === 0) {
                scriptEditorArea.innerHTML = '<h4>Skrip masih kosong. Buat fase dan entri pertama Anda.</h4>';
            } else {
                // DIBANGUN TERLEPAS DARI DOKUMEN, ditempel sekali di akhir.
                //
                // Versi pertama menempelkan kartu fase ke #script-editor-area lebih
                // dulu lalu mengisinya sambil memberi napas tiap ~12 ms. Itu keliru:
                // setiap napas memberi browser kesempatan menghitung ulang gaya,
                // menata letak, dan melukis SELURUH pohon yang sedang tumbuh menuju
                // ratusan ribu elemen — puluhan kali, bukan sekali seperti dulu.
                // Objek layout hidup di heap C++ yang sama dengan yang kehabisan
                // reservasi pada crash 21 Agustus.
                //
                // Terlepas dari dokumen, napasnya tetap membuat aplikasi responsif
                // (indikator bergerak, klik terlayani) TANPA satu pun layout
                // perantara. Yang hilang cuma kartu yang muncul mengalir — dan itu
                // memang tak pernah diminta; yang diminta adalah tidak terasa beku.
                var wadah = document.createDocumentFragment();
                var langkah = [];
                groupedData.forEach(function (group, index) {
                    var phaseCard = createPhaseEditorCard(
                        group, availableLabels, availablePhases, index === 0, { langkah: langkah });
                    wadah.appendChild(phaseCard);
                });
                var lanjut;
                try {
                    lanjut = await _jalankanBatch(langkah, batal, lapor);
                } catch (error) {
                    if (typeof window.destroyScriptEditorSortables === 'function') {
                        window.destroyScriptEditorSortables(wadah);
                    }
                    if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(wadah);
                    throw error;
                }
                if (!lanjut) {
                    if (typeof window.destroyScriptEditorSortables === 'function') {
                        window.destroyScriptEditorSortables(wadah);
                    }
                    if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(wadah);
                    return false;
                }
                scriptEditorArea.appendChild(wadah);
            }
            scriptEditorArea.appendChild(createAddPhaseButton());
            return true;
        }

        /** Sapuan atas NodeList, dipecah dengan anggaran yang sama. */
        async function _sapuBertahap(nodes, kerja, batal, lapor) {
            var langkah = Array.prototype.map.call(nodes, function (n) {
                return function () { kerja(n); };
            });
            return _jalankanBatch(langkah, batal, lapor);
        }

        function renderGroupedScriptEditor(groupedData, availableLabels = [], availablePhases = []) {
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.innerHTML = '';

            if (groupedData.length === 0) {
                scriptEditorArea.innerHTML = '<h4>Skrip masih kosong. Buat fase dan entri pertama Anda.</h4>';
            } else {
                groupedData.forEach((group, index) => {
                    // Oper argumennya ke fungsi berikutnya, dan tandai jika index adalah 0
                    const phaseCard = createPhaseEditorCard(group, availableLabels, availablePhases, index === 0);
                    scriptEditorArea.appendChild(phaseCard);
                });
            }

            const addPhaseButton = createAddPhaseButton();
            scriptEditorArea.appendChild(addPhaseButton);
        }

        function structurePhaseEntries(entries) {
            return window.VNEditorFlowModel.structurePhaseEntries(entries);
        }


        function extractLabelPreviewData(labelGroupContainer) {
            if (!labelGroupContainer) return null;

            // Ambil nama label
            const labelName = labelGroupContainer.querySelector('.label-name-input')?.value.trim() || 'Preview';

            // Ambil data konteks dari label (background, BGM, dll)
            const labelContext = {};

            // Background/Video dari label
            const mediaInput = labelGroupContainer.querySelector('.label-media-input');
            if (mediaInput && mediaInput.value.trim()) {
                const mediaValue = mediaInput.value.trim();
                const ext = mediaValue.split('.').pop().toLowerCase();
                const isVideo = ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(ext);

                if (isVideo) {
                    labelContext.video = mediaValue;
                } else {
                    labelContext.background = mediaValue;
                    const bgModeRadio = labelGroupContainer.querySelector('input[data-key="backgroundMode"]:checked');
                    labelContext.backgroundMode = bgModeRadio ? bgModeRadio.value : 'cover';
                }
            }

            // BGM dari label
            const bgmInput = labelGroupContainer.querySelector('.label-default-bgm-input');
            if (bgmInput && bgmInput.value.trim()) {
                labelContext.bgm = bgmInput.value.trim();

                // Volume BGM
                const bgmVolumeSlider = labelGroupContainer.querySelector('input[data-key="bgmVolume"]');
                if (bgmVolumeSlider) {
                    labelContext.bgmVolume = parseFloat(bgmVolumeSlider.value) || 100;
                }
            }

            // SFX dari label
            const sfxInput = labelGroupContainer.querySelector('.label-default-sfx-input');
            if (sfxInput && sfxInput.value.trim()) {
                labelContext.sfx = sfxInput.value.trim();
            }

            // Transisi masuk
            const transitionSelect = labelGroupContainer.querySelector('.label-entry-transition-select');
            if (transitionSelect && transitionSelect.value) {
                labelContext.transition = transitionSelect.value;
            }

            // Kumpulkan semua entri di dalam label
            const labelContent = labelGroupContainer.querySelector('.label-group-content');
            const entries = [];

            if (labelContent) {
                // Iterasi semua child elements (entry cards, sub-labels, dll)
                // Parameter parentLabelName digunakan untuk membangun nama lengkap sub-label
                const processChildren = (parentElement, parentLabelName = '') => {
                    const childElements = Array.from(parentElement.children);

                    childElements.forEach(element => {
                        if (element.classList.contains('dialogue-entry-card')) {
                            // Ekstrak data dari entry card
                            const cardData = extractDataFromCard(element);
                            entries.push(cardData);
                        } else if (element.classList.contains('sub-label-container')) {
                            // === PERBAIKAN: Tambahkan sub-label sebagai entri label header ===
                            const subLabelNameInput = element.querySelector('.sub-label-name-input');
                            const subLabelName = subLabelNameInput ? subLabelNameInput.value.trim() : '';

                            // Bangun nama lengkap sub-label (parentLabel.subLabel)
                            const fullSubLabelName = parentLabelName
                                ? `${parentLabelName}.${subLabelName}`
                                : `${labelName}.${subLabelName}`;

                            // Tambahkan entri label header untuk sub-label
                            entries.push({
                                type: 'label',
                                name: fullSubLabelName
                            });

                            // Proses isi sub-label secara rekursif
                            const subLabelContent = element.querySelector('.sub-label-content');
                            if (subLabelContent) {
                                processChildren(subLabelContent, fullSubLabelName);
                            }

                            // === PERBAIKAN: Tambahkan entri jump berdasarkan flow control sub-label ===
                            const jumpTargetSelect = element.querySelector('.sub-label-jump-target');
                            if (jumpTargetSelect) {
                                const jumpTarget = jumpTargetSelect.value;

                                // Hanya tambahkan jump jika bukan default exit (##EXIT_SUB_LABEL##)
                                // ##EXIT_SUB_LABEL## berarti lanjut ke entri berikutnya secara natural
                                if (jumpTarget && jumpTarget !== '##EXIT_SUB_LABEL##') {
                                    entries.push({
                                        type: 'jump',
                                        target: jumpTarget
                                    });
                                }
                            }
                        }
                    });
                };

                processChildren(labelContent);
            }

            // === PERBAIKAN: Tambahkan entri jump dari flow control label utama ===
            const mainLabelJumpSelect = labelGroupContainer.querySelector('.label-jump-target');
            if (mainLabelJumpSelect) {
                const mainJumpTarget = mainLabelJumpSelect.value;
                // Hanya tambahkan jump jika ada target (bukan default "lanjut ke entri berikutnya")
                if (mainJumpTarget && mainJumpTarget.trim() !== '') {
                    entries.push({
                        type: 'jump',
                        target: mainJumpTarget
                    });
                }
            }

            // Jika tidak ada entri, kembalikan null
            if (entries.length === 0) {
                return null;
            }

            // Patch path aset untuk semua entri
            if (currentlyEditing && currentlyEditing.novel && currentlyEditing.chapter) {
                const assetPrefix = `aset/game/visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/`;
                const assetKeys = ['background', 'video', 'sprite', 'sprite2', 'spriteCenter', 'bgm', 'sfx', 'sfxIn', 'sfxOut', 'voice'];

                // Patch konteks label
                assetKeys.forEach(key => {
                    if (labelContext[key] && !labelContext[key].startsWith('http') && !labelContext[key].startsWith('file:')) {
                        labelContext[key] = assetPrefix + labelContext[key];
                    }
                });

                // Patch setiap entri
                entries.forEach(entry => {
                    assetKeys.forEach(key => {
                        if (entry[key] && !entry[key].startsWith('http') && !entry[key].startsWith('file:')) {
                            entry[key] = assetPrefix + entry[key];
                        }
                    });

                    // Patch special event SFX
                    if (entry.specialEvent && entry.specialEvent.sfx) {
                        if (!entry.specialEvent.sfx.startsWith('http') && !entry.specialEvent.sfx.startsWith('file:')) {
                            entry.specialEvent.sfx = assetPrefix + entry.specialEvent.sfx;
                        }
                    }

                    // Patch array charSprites
                    if (entry.charSprites && Array.isArray(entry.charSprites)) {
                        entry.charSprites = entry.charSprites.map(sprite => {
                            if (sprite.src && !sprite.src.startsWith('http') && !sprite.src.startsWith('file:')) {
                                return { ...sprite, src: assetPrefix + sprite.src };
                            }
                            return sprite;
                        });
                    }
                });
            }

            return {
                labelName: labelName,
                context: labelContext,
                entries: entries,
                isPreview: true
            };
        }
        // ======================== AKHIR FUNGSI PREVIEW LABEL ======================== //

        // extractDataFromCard sekarang disediakan oleh node-registry.js via window.extractDataFromCard

        // Fungsi untuk menyimpan perubahan

        closeEditorBtn.addEventListener('click', hideScriptEditor);

        // Deteksi dirty GLOBAL: profil + hub + player + script. Inilah satu-satunya
        // titik yang menanyakan simpan/buang (navigasi antar menu kini mulus).
        function _anyNovelDirty() {
            if (VN.Documents && typeof VN.Documents.isDirty === 'function') {
                return VN.Documents.isDirty();
            }
            if (typeof window._profileIsDirty === 'function' && window._profileIsDirty()) return true;
            if (typeof window._hubIsDirty === 'function' && window._hubIsDirty()) return true;
            if (typeof window._playerIsDirty === 'function' && window._playerIsDirty()) return true;
            if (typeof window._scriptIsDirty === 'function' && window._scriptIsDirty()) return true;
            if (typeof window._translationIsDirty === 'function' && window._translationIsDirty()) return true;
            if (typeof window._manifestIsDirty === 'function' && window._manifestIsDirty()) return true;
            if (typeof window._achievementIsDirty === 'function' && window._achievementIsDirty()) return true;
            return false;
        }

        // Simpan semua domain yang berubah sekaligus.
        // PENTING: simpan SCRIPT lebih dulu — handleUpdateNovel('all') memanggil
        // loadNovelForEditing yang me-reset currentlyEditing.chapter ke null, sehingga
        // jika urutannya terbalik perubahan script bisa terlewat tak tersimpan.
        async function _saveAllNovelChanges() {
            if (VN.Documents && typeof VN.Documents.saveAll === 'function') {
                const aggregate = await VN.Documents.saveAll();
                window._lastDocumentSaveResult = aggregate;
                return aggregate.success === true;
            }
            if (currentlyEditing.chapter &&
                typeof window._scriptIsDirty === 'function' && window._scriptIsDirty()) {
                if (typeof saveScriptChanges !== 'function') return false;
                const scriptSaved = await saveScriptChanges();
                if (scriptSaved !== true) return false;
            }
            if (typeof window._translationIsDirty === 'function' && window._translationIsDirty()) {
                if (typeof window.saveTranslationChanges !== 'function') return false;
                const translationSaved = await window.saveTranslationChanges();
                if (translationSaved !== true) return false;
            }
            var configOrProfileDirty =
                (typeof window._profileIsDirty === 'function' && window._profileIsDirty()) ||
                (typeof window._hubIsDirty === 'function' && window._hubIsDirty()) ||
                (typeof window._playerIsDirty === 'function' && window._playerIsDirty());
            if (configOrProfileDirty) {
                if (typeof handleUpdateNovel !== 'function') return false;
                const domainsSaved = await handleUpdateNovel('all');
                if (domainsSaved !== true) return false;
            }
            return true;
        }
        window.saveAllNovelChanges = _saveAllNovelChanges;

        function _performBackToSelection() {
            cancelPendingChapterLoad();
            // Tutup window Hub Code Editor (bila terbuka) — meninggalkan editor novel ini
            ipcRenderer.send('hub-code-editor:close-all');

            // MATIKAN KEDUA PREVIEW SEBELUM APA PUN.
            //
            // Preview Hub dan Preview Player bukan gambar diam: keduanya webview
            // yang menjalankan runtime asli, lengkap dengan BGM, timer, dan (untuk
            // Player) playthrough yang meminjam state chapter di main process.
            // Tombol kembali dulu hanya mengganti view dan menyembunyikan overlay —
            // webview-nya tak pernah dibongkar, jadi suaranya terus terdengar di
            // layar pemilihan novel. Persis yang dilaporkan tester setelah
            // mem-preview hub yang bersuara.
            //
            // Keduanya idempoten dan aman dipanggil walau previewnya tak pernah
            // dibuka; dibungkus try/catch masing-masing supaya satu modul yang
            // gagal tidak menyandera jalan pulang.
            if (typeof window.destroyHubPreview === 'function') {
                try { window.destroyHubPreview(); }
                catch (e) { console.error('[Keluar Editor] Gagal membongkar preview Hub:', e); }
            }
            if (typeof window.destroyPlayerPreview === 'function') {
                try { window.destroyPlayerPreview(); }
                catch (e) { console.error('[Keluar Editor] Gagal membongkar preview Player:', e); }
            }

            // Reset state tampilan sebelum kembali
            switchWorkspaceView('script');
            editingChapterName.textContent = 'Pilih chapter untuk diedit atau edit aset';
            if (typeof window.destroyScriptEditorSortables === 'function') {
                window.destroyScriptEditorSortables(scriptEditorArea);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
            if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
            scriptEditorArea.innerHTML = '';
            workspaceControlsBar.style.display = 'none';
            document.getElementById('btn-visualize-flow').style.display = 'none';
            setChapterAssetsAvailable(false);
            currentlyEditing = { novel: null, chapter: null }; // Reset data novel/chapter yang diedit

            showScriptEditor();
        }

        backToNovelSelectionBtn.addEventListener('click', async () => {
            if (!_anyNovelDirty()) {
                _performBackToSelection();
                return;
            }
            VN.Toast.show('Ada perubahan yang belum disimpan pada novel ini.', {
                type: 'warning',
                actions: [
                    {
                        label: 'Simpan & Keluar',
                        primary: true,
                        onClick: async function () {
                            try {
                                await VN.Utils.continueAfterCheckedSave(
                                    _saveAllNovelChanges,
                                    _performBackToSelection
                                );
                            } catch (e) {
                                console.error('Gagal menyimpan saat keluar:', e);
                            }
                        }
                    },
                    {
                        label: 'Keluar Tanpa Simpan',
                        onClick: function () { _performBackToSelection(); }
                    },
                    {
                        label: 'Batal',
                        onClick: function () {}
                    }
                ]
            });
        });
        saveScriptBtn.addEventListener('click', saveScriptChanges);
        const undoScriptBtn = document.getElementById('undo-script-btn');
        const redoScriptBtn = document.getElementById('redo-script-btn');
        if (undoScriptBtn) undoScriptBtn.addEventListener('click', undoScriptChanges);
        if (redoScriptBtn) redoScriptBtn.addEventListener('click', redoScriptChanges);

        // Pembuatan chapter baru ditangani editorPanelNav.js (show-add-chapter-input-btn)
        // ------------------------------------------ End Script Editor Logic ------------------------------------ //

document.addEventListener('DOMContentLoaded', () => {
            scriptEditorArea.addEventListener('click', async (event) => {
                const target = event.target;

                // Menangani pembuatan Sub-Label
                if (target.classList.contains('add-sub-label-btn')) {
                    const parentHeader = target.closest('.label-group-header');
                    const parentLabelGroup = target.closest('.label-group-container');
                    const parentName = parentLabelGroup?.querySelector('.label-name-input')?.value.trim();
                    const parentContent = parentHeader.nextElementSibling;
                    if (parentContent && parentContent.classList.contains('label-group-content')) {
                        // [MODIFIKASI] Kirim nama induk saat membuat elemen
                        recordHistorySnapshot();
                        const newSubLabel = createSubLabelElement('', parentName);
                        parentContent.appendChild(newSubLabel);
                        newSubLabel.querySelector('input').focus();
                        updateAllJumpTargetDropdowns();
                    }
                    return;
                }

                // Menangani tombol "x" untuk menghapus input
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

                // Menangani tombol preview label grup
                const previewLabelBtn = target.closest('.preview-label-group-btn');
                if (previewLabelBtn) {
                    const labelGroupContainer = previewLabelBtn.closest('.label-group-container');
                    if (!labelGroupContainer) return;

                    // Ekstrak nama label
                    const labelName = labelGroupContainer.querySelector('.label-name-input')?.value.trim() || 'Tanpa Nama';

                    // Bangun payload preview label dengan mengekstrak semua data yang relevan
                    const labelPreviewPayload = extractLabelPreviewData(labelGroupContainer);

                    if (labelPreviewPayload && labelPreviewPayload.entries && labelPreviewPayload.entries.length > 0) {
                        // Kirim ke main process untuk diputar
                        ipcRenderer.send('vn-engine:preview-label', labelPreviewPayload);
                        showNotification(`Preview Label: ${labelName}`, 'success');
                    } else {
                        showNotification('Label kosong, tidak ada entri untuk di-preview.', 'error');
                    }
                    return;
                }

                // Menangani semua jenis tombol hapus
                const deleteBtn = target.closest('.delete-phase-btn, .delete-label-group-btn, .delete-dialogue-btn');
                if (deleteBtn) {
                    if (deleteBtn.classList.contains('delete-phase-btn')) {
                        const phaseCard = deleteBtn.closest('.phase-card');
                        const nameInput = phaseCard?.querySelector('.phase-name-input');
                        const phaseName = nameInput ? nameInput.value.trim() : '(tanpa nama)';
                        const confirmed = await showConfirmation(`Anda yakin ingin menghapus fase "${phaseName}" beserta seluruh isinya?`);
                        if (confirmed) {
                            recordHistorySnapshot();
                            if (typeof window.destroyScriptEditorSortables === 'function') {
                                window.destroyScriptEditorSortables(phaseCard);
                            }
                            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(phaseCard);
                            phaseCard.remove();
                            if (typeof window._renumberCompactEntries === 'function') window._renumberCompactEntries(scriptEditorArea);
                            updateAllJumpTargetDropdowns();
                        }
                        return;
                    }
                    if (deleteBtn.classList.contains('delete-label-group-btn')) {
                        const groupToRemove = deleteBtn.closest('.label-group-container');
                        const confirmed = await showConfirmation('Anda yakin ingin menghapus label ini beserta seluruh dialog di dalamnya?');
                        if (confirmed) {
                            recordHistorySnapshot();
                            if (typeof window.destroyScriptEditorSortables === 'function') {
                                window.destroyScriptEditorSortables(groupToRemove);
                            }
                            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(groupToRemove);
                            groupToRemove.remove();
                            if (typeof window._renumberCompactEntries === 'function') window._renumberCompactEntries(scriptEditorArea);
                            updateAllJumpTargetDropdowns();
                        }
                        return;
                    }
                    if (deleteBtn.classList.contains('delete-dialogue-btn')) {
                        const cardToRemove = deleteBtn.closest('.dialogue-entry-card, .sub-label-container');
                        if (!cardToRemove) return;
                        if (cardToRemove.classList.contains('entry-type-choice') || cardToRemove.classList.contains('sub-label-container')) {
                            const type = cardToRemove.classList.contains('sub-label-container') ? 'Sub-Label ini dan semua isinya' : 'kartu Pilihan (Choice) ini';
                            const confirmed = await showConfirmation(`Yakin ingin menghapus ${type}?`);
                            if (confirmed) {
                                recordHistorySnapshot();
                                if (window.VNInspector) VNInspector.deselectIfCard(cardToRemove);
                                if (typeof window.destroyScriptEditorSortables === 'function') {
                                    window.destroyScriptEditorSortables(cardToRemove);
                                }
                                if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(cardToRemove);
                                cardToRemove.remove();
                                if (typeof window._renumberCompactEntries === 'function') window._renumberCompactEntries(scriptEditorArea);
                                updateAllJumpTargetDropdowns();
                            }
                        } else {
                            recordHistorySnapshot();
                            if (window.VNInspector) VNInspector.deselectIfCard(cardToRemove);
                            if (typeof window.destroyScriptEditorSortables === 'function') {
                                window.destroyScriptEditorSortables(cardToRemove);
                            }
                            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(cardToRemove);
                            cardToRemove.remove();
                            if (typeof window._renumberCompactEntries === 'function') window._renumberCompactEntries(scriptEditorArea);
                        }
                        return;
                    }
                }

                // Menangani tombol Tambah Fase
                const addPhaseBtn = target.closest('#add-phase-btn-styled');
                if (addPhaseBtn) {
                    // hapus pesan "skrip kosong" jika ada
                    const emptyMessage = scriptEditorArea.querySelector('h4');
                    if (emptyMessage && emptyMessage.textContent.includes('Skrip masih kosong')) {
                        emptyMessage.remove();
                    }

                    const isFirstPhase = scriptEditorArea.querySelectorAll('.phase-card').length === 0;
                    const newPhaseCard = createPhaseEditorCard(undefined, [], [], isFirstPhase);

                    recordHistorySnapshot();
                    scriptEditorArea.insertBefore(newPhaseCard, addPhaseBtn);
                    newPhaseCard.querySelector('.phase-name-input').focus();
                    updateAllJumpTargetDropdowns();
                    return;
                }

                // Menangani tombol Browse File
                const browseBtn = target.closest('.browse-file-btn');
                if (browseBtn) {
                    const wrapper = browseBtn.previousElementSibling;
                    const textInput = wrapper?.querySelector('.script-input') || wrapper;
                    const fileType = browseBtn.dataset.type;
                    browseBtn.disabled = true;
                    try {
                        const filename = await ipcRenderer.invoke('open-file-dialog', {
                            fileType: fileType,
                            storyTitle: currentlyEditing.novel,
                            chapterName: currentlyEditing.chapter
                        });
                        if (filename) {
                            textInput.value = filename;
                            textInput.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // Segarkan list di panel Asset Explorer setelah menyalin file baru
                            if (typeof window.refreshAssetExplorers === 'function') {
                                window.refreshAssetExplorers();
                            }
                        }
                    } catch (error) {
                        console.error("Error selama pemilihan file:", error);
                        showConfirmation("Gagal membuka dialog pemilihan file.", true);
                    } finally {
                        browseBtn.disabled = false;
                    }
                    return;
                }

                // Menangani tombol Tambah Entri (Dialog/Label/Scene)
                const addEntryBtn = target.closest('.add-entry-btn');
                if (addEntryBtn) {
                    console.log('[Debug] Tombol .add-entry-btn terdeteksi.');

                    // Cek apakah tombol dinonaktifkan
                    if (addEntryBtn.disabled) {
                        console.warn('[Debug] AKSI DIBATALKAN: Tombol dalam keadaan nonaktif (disabled).');
                        return;
                    }

                    const type = addEntryBtn.dataset.type;
                    console.log(`[Debug] Tipe tombol yang diklik adalah: "${type}"`);

                    let newEntryCard;
                    let targetContainer;

                    // Cari konteks terdekat (Fase, Label, atau Sub-Label)
                    const subLabelGroup = addEntryBtn.closest('.sub-label-container');
                    const labelGroup = addEntryBtn.closest('.label-group-container');
                    const phaseCard = addEntryBtn.closest('.phase-card');
                    console.log('[Debug] Mencari kontainer target...');

                    // Tentukan di mana entri baru akan ditempatkan
                    if (subLabelGroup) {
                        targetContainer = subLabelGroup.querySelector('.sub-label-content');
                        console.log('[Debug] Target ditemukan di dalam Sub-Label:', targetContainer);
                    } else if (labelGroup) {
                        targetContainer = labelGroup.querySelector('.label-group-content');
                        console.log('[Debug] Target ditemukan di dalam Label:', targetContainer);
                    } else if (phaseCard) {
                        targetContainer = phaseCard.querySelector('.phase-content');
                        console.log('[Debug] Target ditemukan di dalam Fase:', targetContainer);
                    }

                    if (!targetContainer) {
                        console.error('[Debug] KRITIS: Tidak dapat menemukan kontainer target untuk menempatkan entri baru.');
                        return;
                    }

                    // Buat kartu baru berdasarkan tipenya
                    console.log(`[Debug] Memulai pembuatan kartu untuk tipe: "${type}"...`);
                    if (type === 'label') {
                        newEntryCard = createLabelGroupElement({}, [], []);
                        if (targetContainer) {
                            recordHistorySnapshot();
                            targetContainer.appendChild(newEntryCard);
                            newEntryCard.querySelector('input')?.focus();
                            updateAllJumpTargetDropdowns();
                        }
                    } else if (type === 'choice') {
                        const inLabelContext = targetContainer.matches('.label-group-content, .sub-label-content');
                        newEntryCard = createEntryEditorCard(type, {}, [], inLabelContext);
                    } else if (type === 'dialogue' || type === 'scene' || type === 'set_var' || type === 'custom') {
                        newEntryCard = createEntryEditorCard(type);
                    } else if (typeof VN !== 'undefined' && VN.NodeRegistry && VN.NodeRegistry.get(type)) {
                        // Tipe registry lain: load_hub_flags & tipe dari extension.
                        // Dulu tombol palette-nya dirender (getExtensionEntryButtons) tapi
                        // klik tidak masuk cabang mana pun — kartu tak pernah dibuat.
                        newEntryCard = createEntryEditorCard(type, VN.NodeRegistry.getDefaultData(type));
                    }
                    console.log('[Debug] Pembuatan kartu selesai. Hasil:', newEntryCard);


                    // Tambah kartu baru ke DOM jika berhasil dibuat
                    if (newEntryCard && targetContainer && type !== 'label') {
                        console.log('[Debug] Menambahkan kartu baru ke kontainer target...');
                        recordHistorySnapshot();
                        targetContainer.appendChild(newEntryCard);
                        if (newEntryCard.matches('.compact-entry-card') &&
                            typeof window._hydrateCompactEntryCard === 'function') {
                            newEntryCard = window._hydrateCompactEntryCard(newEntryCard) || newEntryCard;
                        }
                        if (typeof window._renumberCompactEntries === 'function') {
                            window._renumberCompactEntries(scriptEditorArea);
                        }
                        newEntryCard.querySelector('input, textarea, select')?.focus();
                        console.log('[Debug] Kartu baru berhasil ditambahkan.');
                    } else {
                        console.warn('[Debug] Proses penambahan kartu dibatalkan. newEntryCard:', newEntryCard, 'targetContainer:', targetContainer);
                    }

                    return; // Hentikan proses setelah tombol ditangani
                }

                // Menangani tombol Tambah Opsi Pilihan
                const addOptionBtn = target.closest('.add-choice-option-btn');
                if (addOptionBtn) {
                    const parentCard = addOptionBtn.closest('.dialogue-entry-card');
                    const container = parentCard.querySelector('.choice-options-container');
                    if (!container) return;

                    // 1. Kumpulkan semua label yang ada saat ini (logika ini tetap sama)
                    const allLabels = Array.from(scriptEditorArea.querySelectorAll('.label-name-input, .sub-label-name-input')).map(input => {
                        if (input.classList.contains('sub-label-name-input')) {
                            const parentName = input.closest('.label-group-container')?.querySelector('.label-name-input')?.value.trim();
                            return parentName ? `${parentName}.${input.value.trim()}` : null;
                        }
                        return input.value.trim();
                    }).filter(Boolean);

                    const parentLabelGroup = parentCard.closest('.label-group-container');
                    const parentLabelName = parentLabelGroup?.querySelector('.label-name-input')?.value.trim();
                    const availableLabels = allLabels.filter(name => {
                        const isSubLabel = name.includes('.');
                        if (!isSubLabel) return true;
                        if (parentLabelName && name.startsWith(parentLabelName + '.')) return true;
                        return false;
                    });

                    let optionsHTML = '<option value="">Pilih Label Tujuan...</option>';
                    const inSubLabelContext = !!addOptionBtn.closest('.sub-label-container');
                    const inMainLabelContext = !!addOptionBtn.closest('.label-group-container') && !inSubLabelContext;

                    let specialCommandsHTML = '';
                    if (inMainLabelContext) {
                        // Opsi untuk Choice di dalam Label Utama
                        specialCommandsHTML = `
                    <option value="##CONTINUE_PARENT##">Lanjut di Label Induk</option>
                    <option value="##FINISH_PARENT##">Selesaikan Label Induk</option>
                    <option value="##EXIT_LABEL##">Keluar dari Label</option>
                `;
                    } else if (!inSubLabelContext) {
                        // Opsi untuk Choice di luar label (level Fase)
                        specialCommandsHTML = `
                    <option value="##SKIP_ALL_LABEL##">Lewati/skip semua label di fase ini</option>
                `;
                    }
                    // Jika 'inSubLabelContext' true, 'specialCommandsHTML' akan kosong,
                    // sehingga <optgroup> tidak akan dibuat.

                    if (specialCommandsHTML) {
                        optionsHTML += `<optgroup label="------ Perintah Khususs ------">${specialCommandsHTML}</optgroup>`;
                    }

                    if (availableLabels.length > 0) {
                        optionsHTML += `<optgroup label="------ Lompat ke Label ------">`;
                        availableLabels.forEach(name => {
                            let displayName = name;
                            let className = 'option-main-label';
                            if (name.includes('.')) {
                                displayName = `↪ (sub) ${name.split('.')[1]}`;
                                className = 'option-sub-label';
                            }
                            optionsHTML += `<option value="${name}" class="${className}">${displayName}</option>`;
                        });
                        optionsHTML += `</optgroup>`;
                    }

                    // 5. Buat dan tambahkan elemen opsi baru lewat builder bersama
                    // (buildChoiceOptionEditorHTML, entryEditorCard.js) — markup identik
                    // dengan opsi hasil render card, termasuk panel "⚙ Lanjutan".
                    const optWrapper = document.createElement('div');
                    optWrapper.innerHTML = buildChoiceOptionEditorHTML({}, optionsHTML);
                    const newOption = optWrapper.firstElementChild;
                    container.appendChild(newOption);
                    newOption.querySelector('.choice-option-text').focus();
                    return;
                }

                // Menangani tombol Hapus Opsi Pilihan
                const removeOptionBtn = target.closest('.remove-option-btn');
                if (removeOptionBtn) {
                    const optionEditorToRemove = removeOptionBtn.closest('.choice-option-editor');
                    if (optionEditorToRemove) {
                        const container = optionEditorToRemove.parentElement;
                        if (container && container.querySelectorAll('.choice-option-editor').length <= 1) {
                            if (typeof showNotification === 'function') showNotification('Minimal harus ada 1 opsi pilihan.', 'error');
                            return;
                        }
                        optionEditorToRemove.remove();
                    }
                    return;
                }
            });

            scriptEditorArea.addEventListener('input', (event) => {
                const input = event.target;
                const key = input.dataset.key;

                if (input.classList.contains('persist-background-checkbox')) {
                    toggleTransitionOutControls(input);
                }

                if (key && key.toLowerCase().endsWith('delay')) {
                    console.log(`%c[DelayUpdate] Input delay diubah untuk key: "${key}"`, 'color: gold');

                    const audioKey = key.replace(/Volume|Pan|Delay/g, '');
                    console.log(`[DelayUpdate] Audio key dasar yang diekstrak: "${audioKey}"`);

                    const card = input.closest('.dialogue-entry-card, .phase-header, .label-group-header');
                    if (!card) {
                        console.error('[DelayUpdate] Gagal menemukan elemen .card induk.');
                        return;
                    }

                    const previewContainer = card.querySelector(`.audio-preview-container[data-preview-for="${audioKey}"]`);
                    if (!previewContainer) {
                        console.error(`[DelayUpdate] KRITIS: Gagal menemukan preview container untuk key "${audioKey}".`);
                        return;
                    }
                    console.log('[DelayUpdate] Menemukan preview container yang sesuai:', previewContainer);

                    const audio = previewContainer.querySelector('audio');
                    const timeDisplay = previewContainer.querySelector('.time-display');

                    if (audio && !audio.paused) {
                        audio.pause();
                    }

                    const newDelay = parseInt(input.value, 10) || 0;
                    console.log(`[DelayUpdate] Nilai delay baru: ${newDelay}ms`);

                    if (timeDisplay) {
                        if (newDelay > 0) {
                            timeDisplay.textContent = `Delay Set: ${(newDelay / 1000).toFixed(1)}s`;
                        } else {
                            timeDisplay.textContent = audio && audio.duration ? `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}` : '0:00 / 0:00';
                        }
                    }
                    return;
                }

                if (input.type === 'radio' && input.dataset.key === 'backgroundMode') {
                    const newMode = input.value; // 'cover' or 'contain'
                    // Cari elemen pratinjau gambar terdekat
                    const container = input.closest('div.phase-assets, div.entry-content');
                    if (container) {
                        const previewImage = container.querySelector('.image-preview');
                        if (previewImage) {
                            previewImage.style.objectFit = newMode;
                            console.log(`[PREVIEW] Pratinjau background diubah ke mode: ${newMode}`);
                        }
                    }
                }

                if (input.classList.contains('audio-input')) {
                    if (!key) return;

                    console.log(`%c[AudioUpdate] Blok audio-input terpicu untuk key: "${key}"`, 'color: cyan');

                    const card = input.closest('.dialogue-entry-card, .phase-header, .label-group-header');
                    if (!card) {
                        console.error('[AudioUpdate] Gagal menemukan elemen .card induk.');
                        return;
                    }

                    const selector = `.audio-preview-container[data-preview-for="${key}"]`;
                    console.log('[AudioUpdate] Mencari preview container dengan selector:', selector);

                    const previewContainer = card.querySelector(selector);
                    console.log('[AudioUpdate] Hasil pencarian previewContainer:', previewContainer);

                    if (!previewContainer) {
                        console.error('[AudioUpdate] KRITIS: Tidak dapat menemukan previewContainer. Pastikan atribut data-preview-for sudah benar di HTML.');
                        return;
                    }

                    const audio = previewContainer.querySelector('audio');
                    const playPauseBtn = previewContainer.querySelector('.play-pause-btn');
                    const timeDisplay = previewContainer.querySelector('.time-display');
                    const progressFill = previewContainer.querySelector('.progress-fill');

                    console.log('[AudioUpdate] Elemen yang ditemukan:', { audio, playPauseBtn, timeDisplay });

                    if (!audio || !playPauseBtn || !timeDisplay || !progressFill) {
                        console.error('[AudioUpdate] KRITIS: Salah satu elemen di dalam previewContainer tidak ditemukan.');
                        return;
                    }

                    const newFileName = input.value.trim();
                    console.log(`[AudioUpdate] Nama file baru dari input: "${newFileName}"`);

                    // Batalkan countdown/play tertunda SEBELUM src diganti. Tanpa
                    // ini timer file lama dapat menyalakan file baru beberapa saat
                    // setelah kreator sudah menghapus atau menggantinya.
                    if (typeof audio.__vnDisposePreview === 'function') audio.__vnDisposePreview();
                    try { audio.pause(); } catch (e) { /* media belum siap */ }
                    if (currentPreviewAudio === audio) currentPreviewAudio = null;

                    if (newFileName) {
                        const newSrc = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${newFileName}?v=${Date.now()}`;
                        console.log('[AudioUpdate] Mengatur audio.src baru ke:', newSrc);
                        audio.src = newSrc;
                        if (typeof audio.load === 'function') audio.load();
                        playPauseBtn.disabled = false;
                    } else {
                        console.log('[AudioUpdate] Input kosong. Menghapus src dan menonaktifkan tombol.');
                        audio.removeAttribute('src');
                        if (typeof audio.load === 'function') audio.load();
                        playPauseBtn.disabled = true;
                    }

                    // Reset tampilan pratinjau
                    console.log('[AudioUpdate] Mereset tampilan pratinjau (waktu, progress bar).');
                    playPauseBtn.classList.remove('playing');
                    timeDisplay.textContent = '0:00 / 0:00';
                    progressFill.style.width = '0%';
                    console.log('--- Selesai ---');
                }

                if (input.classList.contains('image-input')) {
                    updateImagePreviewUI(event.target);
                }
                // --- AWAL BLOK ELSE IF BARU UNTUK VIDEO ---
                else if (input.classList.contains('video-input')) { // Cek kelas baru kita
                    const card = input.closest('.dialogue-entry-card'); // Cari kartu scene induk
                    if (card) {
                        const previewContainer = card.querySelector('.video-preview-container');
                        const videoPreview = card.querySelector('.video-preview');
                        const placeholder = previewContainer ? previewContainer.querySelector('.preview-placeholder') : null;
                        const controlsBlock = card.querySelector('.video-controls-block'); // Cari blok kontrol

                        if (previewContainer && videoPreview && placeholder) {
                            const filename = input.value.trim();

                            // Logika visibilitas kontrol video
                            if (controlsBlock) {
                                controlsBlock.style.display = filename ? 'flex' : 'none';
                            }

                            if (filename) {
                                const newSrc = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${filename}?v=${Date.now()}`;
                                videoPreview.src = newSrc;
                                previewContainer.style.display = 'flex'; // Tampilkan container
                                videoPreview.style.display = 'block';    // Tampilkan video
                                placeholder.style.display = 'none';     // Sembunyikan placeholder
                                videoPreview.onerror = () => { // Handle error jika file berubah ke yg tidak valid
                                    videoPreview.style.display = 'none';
                                    placeholder.style.display = 'flex';
                                    placeholder.textContent = `Error: File "${filename}" tidak ditemukan.`;
                                    previewContainer.style.display = 'flex'; // Tetap tampilkan container
                                };
                            } else {
                                // Jika input dikosongkan
                                videoPreview.src = '';
                                videoPreview.style.display = 'none';     // Sembunyikan video
                                placeholder.style.display = 'flex';      // Tampilkan placeholder
                                placeholder.textContent = 'Pilih video...';
                                previewContainer.style.display = 'none'; // Sembunyikan container
                            }
                        }
                    }
                }

                // Preview aset layer bersifat mandiri; nilai transform/delay tetap
                // disimpan dan badge slot induk perlu tetap disegarkan saat diketik.
                if (input.classList.contains('sprite-layer-delay') ||
                    input.classList.contains('sprite-layer-offset-x') ||
                    input.classList.contains('sprite-layer-offset-y') ||
                    input.classList.contains('sprite-layer-scale') ||
                    input.classList.contains('sprite-layer-rotation') ||
                    input.classList.contains('sprite-layer-opacity')) {
                    const layerBlock = input.closest('.sprite-layers-block');
                    if (layerBlock && typeof window.refreshSpriteLayerBadge === 'function') {
                        window.refreshSpriteLayerBadge(layerBlock);
                    }
                }

                if (input.classList.contains('scene-type-selector')) {
                    const selectedCard = input.closest('.dialogue-entry-card');
                    const selectedType = input.value;

                    // Sembunyikan semua grup input spesifik scene
                    selectedCard.querySelectorAll('.scene-input-group').forEach(group => {
                        group.style.display = 'none';
                    });

                    // Tampilkan grup input yang relevan dengan tipe scene yang dipilih
                    const targetGroup = selectedCard.querySelector(`.scene-input-group[data-scene-type="${selectedType}"]`);
                    if (targetGroup) {
                        targetGroup.style.display = 'block';
                    }

                    // Update status kontrol transisi keluar
                    const activeCheckbox = targetGroup ? targetGroup.querySelector('.persist-background-checkbox') : null;
                    if (activeCheckbox) {
                        toggleTransitionOutControls(activeCheckbox);
                    } else {
                        // Fallback untuk tipe tanpa checkbox persist (seperti text_screen)
                        // Kita kirim input selector itu sendiri agar fungsi bisa menemukan card induknya
                        toggleTransitionOutControls(input);
                    }
                }

                // Toggle mode Choice: Pilihan Ganda (tombol) <-> Input Teks Bebas
                // (mis. nama pemain) — sama pola dengan scene-type-selector di atas.
                if (input.classList.contains('choice-input-type-selector')) {
                    const selectedCard = input.closest('.dialogue-entry-card');
                    const isTextMode = input.value === 'text';
                    if (selectedCard) {
                        const multipleGroup = selectedCard.querySelector('.choice-mode-group[data-choice-mode="multiple"]');
                        const textGroup = selectedCard.querySelector('.choice-mode-group[data-choice-mode="text"]');
                        if (multipleGroup) multipleGroup.style.display = isTextMode ? 'none' : 'block';
                        if (textGroup) textGroup.style.display = isTextMode ? 'block' : 'none';
                    }
                }

                const wrapper = input.closest('.input-with-clear-wrapper');
                if (wrapper) {
                    wrapper.classList.toggle('has-text', !!input.value);
                }

                if (event.target.classList.contains('phase-name-input') ||
                    event.target.classList.contains('label-name-input') ||
                    event.target.classList.contains('sub-label-name-input')) {

                    updateAllJumpTargetDropdowns();
                }

                if (input.classList.contains('is-ending-checkbox')) {
                    const parentCard = input.closest('.phase-card');
                    if (parentCard) {
                        parentCard.classList.toggle('is-ending', input.checked);

                        const flowControl = parentCard.querySelector('.phase-flow-control');
                        if (flowControl) {
                            flowControl.style.display = input.checked ? 'none' : 'flex';
                        }
                    }
                }

                if (input.classList.contains('auto-dialogue-toggle')) {
                    const optionsDiv = input.closest('.auto-dialogue-container').querySelector('.auto-dialogue-options');
                    if (optionsDiv) {
                        optionsDiv.classList.toggle('visible', input.checked);
                    }
                }

                const group = input.closest('.file-input-group');
                if (group) {
                    const preview = group.nextElementSibling;
                    if (!preview) return;

                    const newSrc = input.value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${input.value}` : '';
                    const cacheBustedSrc = newSrc ? `${newSrc}?v=${Date.now()}` : '';

                    if (input.classList.contains('image-input') && preview.classList.contains('image-preview')) {
                        preview.src = cacheBustedSrc;
                    }
                    if (input.classList.contains('audio-input') && preview.classList.contains('audio-preview')) {
                        preview.src = cacheBustedSrc;
                        preview.style.display = input.value ? 'block' : 'none';
                    }
                }
            });

            // `<select>` dan checkbox memancarkan `change`, bukan selalu `input`.
            // Delegasi ini juga mencakup baris layer yang baru dibuat via tombol
            // "+ Tambah Layer", sehingga preview langsung hidup saat file pertama
            // dipilih dari Browse atau diketik manual.
            scriptEditorArea.addEventListener('change', (event) => {
                const control = event.target;
                if (!control || !control.classList) return;
                const isLayerControl = control.classList.contains('sprite-layer-src') ||
                    control.classList.contains('sprite-layer-anim') ||
                    control.classList.contains('sprite-layer-flip-x') ||
                    control.classList.contains('sprite-layer-hide-base');
                if (!isLayerControl) return;

                if (control.classList.contains('sprite-layer-src') &&
                    typeof window.updateImagePreviewUI === 'function') {
                    window.updateImagePreviewUI(control);
                    return;
                }
                const host = control.closest('.sprite-layers-block');
                if (host && typeof window.refreshSpriteLayerBadge === 'function') {
                    window.refreshSpriteLayerBadge(host);
                }
            });

            scriptEditorArea.addEventListener('input', (event) => {
                const slider = event.target;

                if (slider.type !== 'range' || !slider.dataset.key) return;
                if (!slider.dataset.key.toLowerCase().includes('volume') && !slider.dataset.key.toLowerCase().includes('pan')) return;
                if (!currentPreviewAudio || currentPreviewAudio.paused) return;

                const card = slider.closest('.dialogue-entry-card, .phase-header, .label-group-header');
                if (!card) return;

                const key = slider.dataset.key;
                const audioType = key.replace(/Volume|Pan/g, '');
                const fileInput = card.querySelector(`input[data-key="${audioType}"]`);
                if (!fileInput) return;

                const decodedPlayingFile = decodeURIComponent(path.basename(new URL(currentPreviewAudio.src).pathname));
                const cleanedCardFile = fileInput.value.trim().replace(/[[\]]/g, '');

                if (decodedPlayingFile === cleanedCardFile) {
                    console.log('%c[LiveEffect] File COCOK! Menerapkan efek...', 'color: lightgreen; font-weight: bold;');
                    const pannerNode = livePannerNodes.get(currentPreviewAudio);

                    // Gunakan endsWith untuk pengecekan yang lebih akurat
                    if (key.toLowerCase().endsWith('volume')) {
                        console.log('[LiveEffect] Aksi terdeteksi: VOLUME');
                        const newVolume = parseFloat(slider.value);
                        const finalVolume = globalVolume * newVolume;
                        currentPreviewAudio.volume = finalVolume;
                        console.log(`[LiveEffect] Volume diubah menjadi: ${newVolume} (Final: ${finalVolume.toFixed(2)})`);

                    } else if (key.toLowerCase().endsWith('pan') && pannerNode) {
                        console.log('[LiveEffect] Aksi terdeteksi: PAN');
                        const newPan = parseFloat(slider.value);
                        pannerNode.pan.value = newPan;
                        console.log(`[LiveEffect] Pan diubah menjadi: ${newPan.toFixed(2)}`);
                    }
                } else {
                    console.log('%c[LiveEffect] File TIDAK COCOK. Efek tidak diterapkan.', 'color: orange;');
                    console.log(`   -> BERSIH (diputar): "${decodedPlayingFile}"`);
                    console.log(`   -> BERSIH (editor):  "${cleanedCardFile}"`);
                }
                console.log('---------------------------------');
            });

            scriptEditorArea.addEventListener('blur', (event) => {
                const target = event.target;

                // Cek apakah elemen yang baru saja ditinggalkan adalah salah satu input nama
                if (target.classList.contains('phase-name-input') ||
                    target.classList.contains('label-name-input') ||
                    target.classList.contains('sub-label-name-input')) {

                    console.log(`[Blur Event] Input nama '${target.value}' selesai diedit. Memperbarui semua dropdown...`);
                    updateAllJumpTargetDropdowns();
                }
            }, true); // Gunakan 'true' (capturing) agar event ini lebih andal

            scriptEditorArea.addEventListener('change', (event) => {
                if (event.target.tagName === 'SELECT') {
                    updateSelectColor(event.target);
                }
            });

            // Satu listener input sudah cukup untuk snapshot history
            // (dulu ada 2: input + change — menyebabkan double snapshot per aksi)
            scriptEditorArea.addEventListener('input', (event) => {
                if (event.target.matches('input, textarea, select')) {
                    scheduleHistorySnapshot();
                    _noteOnboardingScriptEdit(); // onboarding: suntingan naskah nyata
                }
            });

            // 2
            updateExtraOffsetY();
            updateCarouselPosition();
            console.log('DOM fully loaded. Attaching tab listener...');

            const tabsContainer = document.querySelector('.sidebar-tabs');
            console.log('Sidebar tabs container found:', tabsContainer);

            // --- Slider Listener Fix (Moved here to ensure execution) ---
            console.log('[Init] Menambahkan listener untuk slider scale (di dalam blok DOMLoaded)...');
            document.addEventListener('input', (e) => {
                if (e.target && e.target.classList && e.target.classList.contains('scale-slider')) {
                    console.log('[Slider Debug] Nilai berubah:', e.target.value);
                    let display = e.target.nextElementSibling;

                    // Fallback: Jika nextElementSibling bukan display (misal ada spasi/text node), cari di parent
                    if (!display || !display.classList.contains('scale-value-display')) {
                        display = e.target.parentElement.querySelector('.scale-value-display');
                    }

                    if (display) {
                        display.textContent = e.target.value + '%';
                    } else {
                        console.warn('[Slider Debug] Elemen display tidak ditemukan.');
                    }
                }

                // === MULTI-SPRITE SYSTEM: Listener untuk slider Posisi X (custom + preset) ===
                if (e.target && e.target.classList &&
                    (e.target.classList.contains('extra-sprite-x') || e.target.classList.contains('sprite-position-slider'))) {
                    let display = e.target.nextElementSibling;

                    // Fallback: Jika nextElementSibling bukan display, cari di parent
                    if (!display || !display.classList.contains('position-value-display')) {
                        display = e.target.parentElement.querySelector('.position-value-display');
                    }

                    if (display) {
                        display.textContent = e.target.value + '%';
                    }
                }

                // === SPRITE TRANSITION SYSTEM: Listener untuk slider durasi transisi ===
                if (e.target && e.target.classList && e.target.classList.contains('transition-duration-slider')) {
                    const display = e.target.parentElement.querySelector('.transition-duration-value');
                    if (display) {
                        display.textContent = e.target.value + 'ms';
                    }
                }
            });

            // === SPRITE TRANSITION SYSTEM: Toggle checkbox untuk enable/disable slider durasi ===
            scriptEditorArea.addEventListener('change', (e) => {
                if (e.target && e.target.classList.contains('sprite-transition-toggle')) {
                    const transitionRow = e.target.closest('.transition-row');
                    if (transitionRow) {
                        const durationControl = transitionRow.querySelector('.transition-duration-control');
                        const durationSlider = transitionRow.querySelector('.transition-duration-slider');

                        if (e.target.checked) {
                            // Aktifkan slider durasi
                            durationControl?.classList.remove('disabled');
                            if (durationSlider) durationSlider.disabled = false;
                        } else {
                            // Nonaktifkan slider durasi
                            durationControl?.classList.add('disabled');
                            if (durationSlider) durationSlider.disabled = true;
                        }
                    }
                }
            });

            // === SPRITE TRANSITION SYSTEM: Fungsi untuk mendeteksi dan menampilkan kontrol transisi ===
            // Dibuat sebagai window function agar bisa diakses dari handler Sortable onEnd
            window.checkSpriteTransitionVisibility = function checkSpriteTransitionVisibility() {
                const cards = scriptEditorArea.querySelectorAll('.dialogue-entry-card');

                // Kartu ringkas tidak mempunyai input sprite. Jalur lama mencari
                // mundur dari setiap kartu sampai menemukan input dan karena itu
                // berubah menjadi O(N²) pada ribuan kartu ringkas. Dalam mode besar
                // payload raw dipindai sekali secara linear; kontrol DOM hanya
                // disentuh untuk maksimal beberapa kartu yang sedang di-hydrate.
                if (window._vnEditorCompactMode) {
                    const slots = ['sprite', 'sprite2', 'spriteCenter'];
                    const defaultX = { sprite: 85, sprite2: 15, spriteCenter: 50 };
                    const baseSprite = function (value) {
                        return Array.isArray(value) ? (value[0] || '') : (value || '');
                    };
                    const stateFromCard = function (card) {
                        const compact = card.dataset.compactEntry === 'true';
                        let raw = {};
                        try { raw = JSON.parse(card.dataset.rawEntry || '{}'); } catch (e) { raw = {}; }
                        const eligible = card.dataset.type === 'dialogue' || card.dataset.type === 'choice' ||
                            slots.some(function (slot) { return raw[slot] !== undefined; });
                        if (!eligible) return null;
                        const state = {};
                        slots.forEach(function (slot) {
                            if (compact) {
                                state[slot] = {
                                    sprite: String(baseSprite(raw[slot])),
                                    scale: typeof raw[slot + 'Scale'] === 'number'
                                        ? Math.round((raw[slot + 'Scale'] - 0.25) / 0.015) : 50,
                                    pos: typeof raw[slot + 'X'] === 'number' ? raw[slot + 'X'] : defaultX[slot]
                                };
                                return;
                            }
                            const spriteInput = card.querySelector(`[data-key="${slot}"]`);
                            const scaleInput = card.querySelector(`[data-key="${slot}Scale"]`);
                            const posInput = card.querySelector(`[data-key="${slot}X-num"]`) ||
                                card.querySelector(`input[data-key="${slot}X"]`);
                            state[slot] = {
                                sprite: spriteInput ? String(spriteInput.value || '').trim() : String(baseSprite(raw[slot])),
                                scale: scaleInput ? parseInt(scaleInput.value, 10) : 50,
                                pos: posInput ? parseInt(posInput.value, 10) : defaultX[slot]
                            };
                        });
                        return state;
                    };

                    let previous = null;
                    cards.forEach(function (card) {
                        const current = stateFromCard(card);
                        const controls = card.querySelectorAll('.sprite-transition-controls');
                        if (!current || !previous) {
                            controls.forEach(function (ctrl) { ctrl.classList.remove('visible'); });
                            if (current) previous = current;
                            return;
                        }
                        slots.forEach(function (slot) {
                            const control = card.querySelector(`.sprite-transition-controls[data-slot="${slot}"]`);
                            if (!control) return;
                            const now = current[slot];
                            const before = previous[slot];
                            const changed = !!now.sprite && !!before.sprite &&
                                (now.scale !== before.scale || now.pos !== before.pos);
                            control.classList.toggle('visible', changed);
                            const hint = control.querySelector('.prev-value-hint');
                            if (hint && changed) {
                                const parts = [];
                                if (now.scale !== before.scale) parts.push(`Ukuran ${before.scale}% → ${now.scale}%`);
                                if (now.pos !== before.pos) parts.push(`Posisi ${before.pos}% → ${now.pos}%`);
                                hint.textContent = 'Perbedaan terdeteksi: ' + parts.join(' · ');
                            }
                        });
                        previous = current;
                    });
                    return;
                }

                cards.forEach((card, index) => {
                    if (index === 0) {
                        // Entri pertama tidak punya entri sebelumnya, sembunyikan kontrol
                        card.querySelectorAll('.sprite-transition-controls').forEach(ctrl => {
                            ctrl.classList.remove('visible');
                        });
                        return;
                    }

                    // Cari entri sebelumnya yang memiliki sprite (bukan scene atau yang lain)
                    let prevCard = cards[index - 1];
                    let prevIndex = index - 1;

                    // Mundur sampai menemukan entri dengan sprite
                    while (prevCard && prevIndex >= 0) {
                        const hasSpriteInputs = prevCard.querySelector('[data-key="sprite"], [data-key="sprite2"], [data-key="spriteCenter"]');
                        if (hasSpriteInputs) break;
                        prevIndex--;
                        prevCard = prevIndex >= 0 ? cards[prevIndex] : null;
                    }

                    if (!prevCard) return;

                    // Cek perbedaan untuk setiap slot sprite
                    ['sprite', 'sprite2', 'spriteCenter'].forEach(slotKey => {
                        const currentScaleSlider = card.querySelector(`[data-key="${slotKey}Scale"]`);
                        const currentPosSlider = card.querySelector(`[data-key="${slotKey}X"]`);
                        const prevScaleSlider = prevCard.querySelector(`[data-key="${slotKey}Scale"]`);
                        const prevPosSlider = prevCard.querySelector(`[data-key="${slotKey}X"]`);
                        const transitionControl = card.querySelector(`.sprite-transition-controls[data-slot="${slotKey}"]`);

                        if (!transitionControl) return;

                        // Cek apakah sprite slot ini aktif (ada gambar) di entri SAAT INI
                        const spriteInput = card.querySelector(`[data-key="${slotKey}"]`);
                        const hasSpriteValue = spriteInput && spriteInput.value && spriteInput.value.trim() !== '';

                        // Cek apakah sprite slot ini juga ada di entri SEBELUMNYA
                        const prevSpriteInput = prevCard.querySelector(`[data-key="${slotKey}"]`);
                        const hasPrevSpriteValue = prevSpriteInput && prevSpriteInput.value && prevSpriteInput.value.trim() !== '';

                        // Jika sprite tidak ada di entri saat ini ATAU tidak ada di entri sebelumnya,
                        // maka kontrol transisi tidak perlu ditampilkan
                        // (karena sprite baru muncul pertama kali, gunakan animasi masuk biasa)
                        if (!hasSpriteValue || !hasPrevSpriteValue) {
                            transitionControl.classList.remove('visible');
                            return;
                        }

                        // Bandingkan nilai scale dan posisi
                        const currentScale = currentScaleSlider ? parseInt(currentScaleSlider.value) : null;
                        const prevScale = prevScaleSlider ? parseInt(prevScaleSlider.value) : null;
                        const currentPos = currentPosSlider ? parseInt(currentPosSlider.value) : null;
                        const prevPos = prevPosSlider ? parseInt(prevPosSlider.value) : null;

                        // Jika ada perbedaan, tampilkan kontrol transisi
                        const hasDifference = (currentScale !== null && prevScale !== null && currentScale !== prevScale) ||
                            (currentPos !== null && prevPos !== null && currentPos !== prevPos);

                        if (hasDifference) {
                            transitionControl.classList.add('visible');

                            // Update hint dengan info perbedaan
                            const hintEl = transitionControl.querySelector('.prev-value-hint');
                            if (hintEl) {
                                let hintText = 'Perbedaan terdeteksi: ';
                                if (currentScale !== prevScale) hintText += `Ukuran ${prevScale}% → ${currentScale}% `;
                                if (currentPos !== prevPos) hintText += `Posisi ${prevPos}% → ${currentPos}%`;
                                hintEl.textContent = hintText;
                            }
                        } else {
                            transitionControl.classList.remove('visible');
                        }
                    });
                });
            }

            // === POSISI PANGGUNG BERNAMA (G2 irisan a) ===
            // Memilih nama harus MENONAKTIFKAN slider seketika. Tanpa ini slider tetap
            // bisa digeser padahal kolektor mengabaikannya (nama menang) — kreator
            // menggerakkan kontrol yang tak berefek, kelas §A dalam bentuk kecil.
            scriptEditorArea.addEventListener('change', (e) => {
                if (!e.target.classList) return;
                const isNama = e.target.classList.contains('sprite-position-name') ||
                    e.target.classList.contains('extra-sprite-x-name');
                if (!isNama) return;
                const pakaiNama = !!String(e.target.value || '').trim();
                // Baris slider = position-x-row berikutnya dalam grup transform yang sama.
                const grup = e.target.closest('.transform-controls-group') || e.target.parentElement.parentElement;
                const baris = e.target.closest('.position-x-row');
                const slider = grup && grup.querySelector(
                    '.sprite-position-slider, .extra-sprite-x');
                if (slider && (!baris || slider.closest('.position-x-row') !== baris)) {
                    slider.disabled = pakaiNama;
                    const tampil = slider.parentElement.querySelector('.position-value-display');
                    if (tampil) tampil.style.opacity = pakaiNama ? '0.4' : '';
                }
            });

            // Jalankan pengecekan saat slider berubah
            scriptEditorArea.addEventListener('input', (e) => {
                if (e.target.classList.contains('scale-slider') ||
                    e.target.classList.contains('sprite-position-slider')) {
                    // Debounce untuk performa
                    clearTimeout(window.spriteTransitionCheckTimeout);
                    window.spriteTransitionCheckTimeout = setTimeout(window.checkSpriteTransitionVisibility, 300);
                }
            });

            // Observer untuk menjalankan pengecekan saat kartu baru ditambahkan
            if (_transitionObserver) _transitionObserver.disconnect();
            _transitionObserver = new MutationObserver((mutations) => {
                if (!mutations.some(mutation => mutation.addedNodes.length > 0)) return;
                clearTimeout(window.spriteTransitionCheckTimeout);
                window.spriteTransitionCheckTimeout = setTimeout(window.checkSpriteTransitionVisibility, 100);
            });
            _transitionObserver.observe(scriptEditorArea, { childList: true, subtree: true });

            // Track sub-section aktif di tab Novel (untuk restore saat pindah tab)
            let lastNovelSubSection = 'profile';

            if (tabsContainer) {
                tabsContainer.addEventListener('click', (event) => {
                    if (event.target.classList.contains('sidebar-tab')) {
                        const tabName = event.target.dataset.tab;

                        document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
                        document.querySelectorAll('.sidebar-content').forEach(content => content.classList.remove('active'));
                        event.target.classList.add('active');
                        const contentPanel = document.getElementById(`sidebar-content-${tabName}`);
                        if (contentPanel) {
                            contentPanel.classList.add('active');
                        }

                        if (tabName === 'novel') {
                            // Restore workspace view sesuai sub-section yang BENAR-BENAR aktif
                            // di sidebar (sumber kebenaran tunggal), fallback ke sub-section
                            // terakhir. Ini mencegah desync ketika tombol sub-nav di-reset
                            // (mis. setelah membuka novel lain) tetapi closure lastNovelSubSection
                            // masih menyimpan nilai lama seperti 'hub'.
                            const activeSub = document.querySelector('#sidebar-content-novel [data-novel-section].active');
                            const section = (activeSub && activeSub.dataset.novelSection) || lastNovelSubSection || 'profile';
                            lastNovelSubSection = section;
                            const viewMap = { profile: 'profile', assets: 'assets', hub: 'hub', player: 'player' };
                            switchWorkspaceView(viewMap[section] || 'profile');
                        } else { // 'story' tab
                            switchWorkspaceView('script');
                            if (!currentlyEditing.chapter) {
                                editingChapterName.textContent = 'Pilih chapter untuk diedit';
                                editingChapterName.style.display = 'block';
                                if (typeof workspaceControlsBar !== 'undefined' && workspaceControlsBar) workspaceControlsBar.style.display = 'none';
                                if (typeof chapterAssetExplorer !== 'undefined' && chapterAssetExplorer) chapterAssetExplorer.style.display = 'none';
                                const flowBtn = document.getElementById('btn-visualize-flow');
                                if (flowBtn) flowBtn.style.display = 'none';
                                const saveBtn = document.getElementById('save-script-btn');
                                if (saveBtn) saveBtn.style.display = 'none';
                                if (typeof window.destroyScriptEditorSortables === 'function') {
                                    window.destroyScriptEditorSortables(scriptEditorArea);
                                }
                                if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
                                if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
                                scriptEditorArea.innerHTML = '';
                            }
                        }
                    }
                });

                // Novel sub-nav handler (Profil / Aset / Hub / Player)
                document.addEventListener('click', (event) => {
                    const navBtn = event.target.closest('[data-novel-section]');
                    const novelSidebar = document.getElementById('sidebar-content-novel');
                    if (!navBtn || !novelSidebar || !novelSidebar.contains(navBtn)) return;

                    const section = navBtn.dataset.novelSection;
                    if (!section) return;

                    novelSidebar.querySelectorAll('[data-novel-section]').forEach(b => b.classList.remove('active'));
                    navBtn.classList.add('active');

                    document.querySelectorAll('.novel-section').forEach(s => s.classList.remove('active'));
                    const target = document.getElementById(`novel-section-${section}`);
                    if (target) target.classList.add('active');

                    lastNovelSubSection = section;

                    const viewMap = { profile: 'profile', assets: 'assets', hub: 'hub', player: 'player' };
                    switchWorkspaceView(viewMap[section] || 'profile');
                });
            } else {
                console.error('Error: Could not find the .sidebar-tabs container element.');
            }

            document.addEventListener('keydown', (event) => {
                if (!scriptEditorOverlay || scriptEditorOverlay.style.display === 'none') return;

                const ctrlOrCmd = event.ctrlKey || event.metaKey;
                const activeTab = document.querySelector('.sidebar-tab.active');
                const activeTabName = activeTab ? activeTab.dataset.tab : '';

                if (ctrlOrCmd && event.key.toLowerCase() === 's') {
                    event.preventDefault();

                    // View Struktur Chapter punya tombol simpannya sendiri; tanpa
                    // cabang ini Ctrl+S diam-diam tidak melakukan apa pun di sana.
                    if (typeof VN !== 'undefined' && VN.Workspace && VN.Workspace.current === 'chapters') {
                        const manifestSaveBtn = document.getElementById('manifest-save-btn');
                        if (manifestSaveBtn && manifestSaveBtn.style.display !== 'none') manifestSaveBtn.click();
                        return;
                    }
                    if (typeof VN !== 'undefined' && VN.Workspace && VN.Workspace.current === 'translation') {
                        const transSaveBtn = document.getElementById('trans-save-btn');
                        if (transSaveBtn) transSaveBtn.click();
                        return;
                    }

                    // Cek apakah view novel-level aktif (tab novel + sub-section
                    // profile/hub/player — semuanya disimpan lewat tombol Simpan yang sama)
                    const activeNovelSub = document.querySelector('[data-novel-section].active');
                    const saveNovelActive = activeTabName === 'novel' && activeNovelSub &&
                        ['profile', 'hub', 'player'].includes(activeNovelSub.dataset.novelSection);
                    if (saveNovelActive) {
                        const saveHubBtn = document.getElementById('editor-save-btn');
                        if (saveHubBtn && saveHubBtn.style.display !== 'none' && !saveHubBtn.disabled) {
                            saveHubBtn.click();
                        }
                        return;
                    }

                    if (activeTabName === 'story' && currentlyEditing.chapter) {
                        const saveBtn = document.getElementById('save-script-btn');
                        if (saveBtn && saveBtn.style.display !== 'none' && !saveBtn.disabled) {
                            saveBtn.click();
                        }
                    }
                    return;
                }

                if (activeTabName === 'story' && currentlyEditing.chapter && ctrlOrCmd) {
                    const key = event.key.toLowerCase();
                    const isRedo = (key === 'y') || (key === 'z' && event.shiftKey);
                    const isUndo = (key === 'z' && !event.shiftKey);

                    if (isUndo && !isTypingElement(event.target)) {
                        event.preventDefault();
                        undoScriptChanges();
                        return;
                    }

                    if (isRedo && !isTypingElement(event.target)) {
                        event.preventDefault();
                        redoScriptChanges();
                        return;
                    }
                }

                if (event.altKey && !ctrlOrCmd && !event.shiftKey) {
                    if (event.key === '1') {
                        event.preventDefault();
                        document.querySelector('.sidebar-tab[data-tab="story"]')?.click();
                    } else if (event.key === '2') {
                        event.preventDefault();
                        document.querySelector('.sidebar-tab[data-tab="novel"]')?.click();
                    } else if (event.key === 'a' || event.key === 'A') {
                        // Alt+A → Aset sub-section
                        event.preventDefault();
                        var assetBtn = document.querySelector('[data-novel-section="assets"]');
                        if (assetBtn) assetBtn.click();
                    } else if (event.key === 'h' || event.key === 'H') {
                        // Alt+H → Hub sub-section
                        event.preventDefault();
                        var hubBtn = document.querySelector('[data-novel-section="hub"]');
                        if (hubBtn) hubBtn.click();
                    } else if (event.key === 'p' || event.key === 'P') {
                        // Alt+P → Player sub-section
                        event.preventDefault();
                        var playerBtn = document.querySelector('[data-novel-section="player"]');
                        if (playerBtn) playerBtn.click();
                    }
                }
            });

            // --- Fitur Auto Unexpand Editor Sidebar saat Scroll Overlay ---
            // Scroll terjadi di #script-editor-overlay (position:fixed; overflow-y:auto)
            const editorSidebar = document.querySelector('.editor-sidebar');
            const scriptEditorOverlayEl = document.getElementById('script-editor-overlay');

            if (scriptEditorOverlayEl && editorSidebar) {
                scriptEditorOverlayEl.addEventListener('scroll', () => {
                    const activeTab = document.querySelector('.sidebar-tab.active');
                    if (activeTab && activeTab.dataset.tab === 'story' && currentlyEditing.chapter) {
                        if (scriptEditorOverlayEl.scrollTop > 200) {
                            if (!editorSidebar.classList.contains('collapsed')) {
                                editorSidebar.classList.add('collapsed');
                            }
                        } else {
                            if (editorSidebar.classList.contains('collapsed')) {
                                editorSidebar.classList.remove('collapsed');
                            }
                        }
                    }
                });
            }
            
            // Global cleanup saat window close
            window.addEventListener('beforeunload', (event) => {
                // Browser/Electron hanya mengizinkan prompt native pada beforeunload;
                // modal async tidak sempat diselesaikan. Tahan close bila salah satu
                // domain yang sudah terdaftar masih dirty.
                if (_anyNovelDirty()) {
                    event.preventDefault();
                    event.returnValue = '';
                }
            });

            // Cleanup hanya sesudah unload benar-benar terjadi. Menjalankannya di
            // beforeunload merusak editor ketika user memilih batal pada prompt native.
            window.addEventListener('unload', () => {
                if (typeof window.cancelPendingChapterLoad === 'function') window.cancelPendingChapterLoad();
                if (typeof window.closeFlowVisualization === 'function') window.closeFlowVisualization();
                if (typeof window.destroyScriptEditorSortables === 'function') {
                    window.destroyScriptEditorSortables(scriptEditorArea);
                }
                if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(scriptEditorArea);
                // Cleanup all active observers
                _activeObservers.forEach(obs => obs.disconnect());
                _activeObservers.clear();
                
                // Cleanup script area if it has cleanup function
                const scriptArea = document.getElementById('script-editor-area');
                if (scriptArea && scriptArea._cleanup) {
                    scriptArea._cleanup();
                    delete scriptArea._cleanup;
                }
            });
        });

