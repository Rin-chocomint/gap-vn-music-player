        // --- Logika untuk Panel Pratinjau Aset ---
        const previewContainer = document.getElementById('asset-preview-container');
        const previewContent = document.getElementById('asset-preview-content');
        const closePreviewBtn = document.getElementById('close-asset-preview');

        // === Variabel untuk Live Audio Effects ===
        let liveAudioContext;
        const liveSourceNodes = new Map(); // Menyimpan source node untuk setiap elemen audio
        const livePannerNodes = new Map(); // Menyimpan panner node untuk setiap elemen audio
        let globalVolume = 0.8; // Asumsikan volume global, bisa juga dimuat dari settings

        /**
         * Lepaskan media dan graph Web Audio sebelum subtree editor dibuang.
         * MediaElementSourceNode tetap memegang elemen audio walau DOM-nya sudah
         * dilepas; Map kuat di atas lalu membuat seluruh kartu ikut tertahan.
         */
        function disposeMediaWithin(root) {
            if (!root || typeof root.querySelectorAll !== 'function') return 0;
            const media = [];
            if (root.matches && root.matches('audio, video')) media.push(root);
            root.querySelectorAll('audio, video').forEach(function (element) { media.push(element); });

            media.forEach(function (element) {
                if (typeof element.__vnDisposePreview === 'function') {
                    try { element.__vnDisposePreview(); } catch (e) {
                        console.warn('[VN Editor] Gagal menghentikan timer pratinjau media:', e);
                    }
                }
                try { element.pause(); } catch (e) { /* media mungkin belum siap */ }

                const source = liveSourceNodes.get(element);
                const panner = livePannerNodes.get(element);
                try { if (source && typeof source.disconnect === 'function') source.disconnect(); } catch (e) { /* sudah putus */ }
                try { if (panner && typeof panner.disconnect === 'function') panner.disconnect(); } catch (e) { /* sudah putus */ }
                liveSourceNodes.delete(element);
                livePannerNodes.delete(element);

                if (window.currentPreviewAudio === element) window.currentPreviewAudio = null;
                try {
                    element.removeAttribute('src');
                    element.querySelectorAll('source').forEach(function (sourceEl) { sourceEl.removeAttribute('src'); });
                    if (typeof element.load === 'function') element.load();
                } catch (e) { /* jsdom/media backend boleh tidak mendukung load */ }
                try { delete element.__vnDisposePreview; } catch (e) { element.__vnDisposePreview = null; }
            });
            return media.length;
        }
        window.disposeMediaWithin = disposeMediaWithin;

        function showAssetPreview(path, type, relativePath) {
            console.log(`[Asset Preview] Trying to show asset. Path: ${path}, Type: ${type}`);
            updateEditorContentView('preview'); // Atur tampilan ke mode pratinjau

            const previewContent = document.getElementById('asset-preview-content');
            disposeMediaWithin(previewContent);
            previewContent.innerHTML = '';
            let assetElement;

            if (type === 'image') {
                assetElement = document.createElement('img');
            } else if (type === 'audio') {
                assetElement = document.createElement('audio');
                assetElement.controls = true;
                assetElement.autoplay = true;
            } else if (type === 'video') {
                assetElement = document.createElement('video');
                assetElement.controls = true;
                assetElement.autoplay = true;
                assetElement.loop = true;
                assetElement.muted = true;
            }

            if (assetElement) {
                assetElement.src = path;
                previewContent.appendChild(assetElement);
            }

            assetPreviewContainer.style.display = 'block';
            console.log('[Asset Preview] Preview container is now visible.');
        }

        function updateEditorContentView(viewState) {
            const assetPreview = document.getElementById('asset-preview-container');
            const scriptArea = document.getElementById('script-editor-area');

            if (viewState === 'chapters') {
                switchWorkspaceView('script');
                assetPreview.style.display = 'none';
                scriptArea.style.display = 'block';
            } else if (viewState === 'assets') {
                switchWorkspaceView('assets');
            } else if (viewState === 'preview') {
                switchWorkspaceView('script'); // Gunakan wrapper script untuk preview
                assetPreview.style.display = 'block';
                scriptArea.style.display = 'none';
                
                // Sembunyikan controls bar saat preview
                const controlsBar = document.getElementById('workspace-controls-bar');
                if (controlsBar) controlsBar.style.display = 'none';
            }
        }

        function hideAssetPreview() {
            console.log('[Asset Preview] Hiding asset preview.');
            assetPreviewContainer.style.display = 'none';
            disposeMediaWithin(previewContent);
            previewContent.innerHTML = '';
            
            // JANGAN clear scriptEditorArea jika kita sedang mengedit sebuah chapter!
            if (!currentlyEditing.chapter) {
                if (typeof window.destroyScriptEditorSortables === 'function') {
                    window.destroyScriptEditorSortables(scriptEditorArea);
                }
                disposeMediaWithin(scriptEditorArea);
                if (typeof window._resetCompactEntryCache === 'function') window._resetCompactEntryCache();
                scriptEditorArea.innerHTML = '';
            } else {
                // KEMBALIKAN display block agar canvas kembali muncul!
                scriptEditorArea.style.display = 'block';
            }

            const activeTab = document.querySelector('.sidebar-tab.active');
            if (!activeTab) return;
            const activeTabName = activeTab.dataset.tab;

            if (activeTabName === 'novel') {
                const activeNovelSub = document.querySelector('[data-novel-section].active');
                const subSection = activeNovelSub ? activeNovelSub.dataset.novelSection : 'profile';
                const viewMap = { profile: 'profile', assets: 'assets', hub: 'hub', player: 'player' };
                switchWorkspaceView(viewMap[subSection] || 'profile');
            } else {
                switchWorkspaceView('script');
                // Atur ulang tampilan default untuk tab Chapters HANYA jika tidak ada chapter yang sedang diedit
                if (!currentlyEditing.chapter) {
                    editingChapterName.textContent = 'Pilih chapter untuk diedit';
                    editingChapterName.style.display = 'block';
                    if (workspaceControlsBar) workspaceControlsBar.style.display = 'none';
                    if (chapterAssetExplorer) chapterAssetExplorer.style.display = 'none';
                } else {
                    // Jika ada chapter, kembalikan toolbar dan explorer
                    if (workspaceControlsBar) workspaceControlsBar.style.display = 'flex';
                    if (chapterAssetExplorer) chapterAssetExplorer.style.display = 'block';
                }
            }
        }

        async function handleReplaceFile(assetInfo) {
            hideAssetPreview();

            const fileType = assetInfo.type;
            const filters = fileType === 'image'
                ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                : [{ name: 'Video', extensions: ['mp4', 'webm'] }];

            const newFile = await ipcRenderer.invoke('open-and-read-file', { filters });

            if (newFile) {
                const result = await ipcRenderer.invoke('replace-asset-file', {
                    novelTitle: currentlyEditing.novel,
                    relativePath: assetInfo.path,
                    buffer: newFile.buffer
                });

                if (result.success) {
                    showNotification(result.message, 'success');

                    const novelTitle = currentlyEditing.novel;

                    // 1. Tetap panggil ini untuk refresh sidebar editor
                    loadNovelForEditing(novelTitle);

                    // 2. Buat URL gambar baru dengan cache buster
                    const newImageUrl = `url('./visual_novels/${novelTitle}/cover.jpg?v=${Date.now()}')`;
                    console.log(`[DEBUG] Memperbarui story-card dengan URL: ${newImageUrl}`);

                    // 3. Update kartu di menu utama
                    const cardInMainMenu = document.querySelector(`#story-grid .story-card[data-title="${novelTitle}"]`);
                    if (cardInMainMenu) {
                        cardInMainMenu.style.backgroundImage = newImageUrl;
                        console.log('[DEBUG] Kartu di menu utama berhasil diperbarui.');
                    }

                    // 4. Update kartu di menu pilihan editor
                    const cardInEditorMenu = document.querySelector(`#editor-novel-list .story-card[data-title="${novelTitle}"]`);
                    if (cardInEditorMenu) {
                        cardInEditorMenu.style.backgroundImage = newImageUrl;
                        console.log('[DEBUG] Kartu di menu editor berhasil diperbarui.');
                    }
                } else {
                    showNotification(result.message, 'error');
                }
            }
        }



        function renderAssetExplorer(assets, containerId) {
            console.log(`[Asset Manager] Dipanggil renderAssetExplorer untuk container: ${containerId}`, assets);
            const container = document.getElementById(containerId);
            container.innerHTML = '';

            if (!assets || (assets.images.length === 0 && assets.audios.length === 0 && assets.videos.length === 0)) {
                container.innerHTML = '<p style="opacity:0.7; font-size:0.9em;">Tidak ada aset yang ditemukan.</p>';
                // Khusus untuk gambar dan video, tetap tampilkan tombol tambah
                if (containerId === 'chapter-asset-content' || containerId === 'asset-explorer-content') {
                    container.innerHTML += `<div class="asset-category"><h4>Gambar Lainnya</h4><button class="add-asset-btn" data-type="image" title="Tambah Gambar Baru">+</button></div>`;
                    container.innerHTML += `<div class="asset-category"><h4>Video</h4><button class="add-asset-btn" data-type="video" title="Tambah Video Baru">+</button></div>`;
                }
                return;
            }

            const coverImage = assets.images.find(img => img.fileName.startsWith('cover.'));
            const otherImages = assets.images.filter(img => !img.fileName.startsWith('cover.'));

            if (coverImage) {
                const coverCategoryHTML = `
            <div class="asset-category">
                <h4>Cover Novel</h4>
                <div class="cover-image-wrapper">
                    <img src="${coverImage.fullPath}?v=${Date.now()}" alt="${coverImage.fileName}" class="cover-image-full">
                    <button class="ganti-btn" data-path="${coverImage.relativePath}" data-full-path="${coverImage.fullPath}" data-type="image">
                        Ganti Cover
                    </button>
                </div>
            </div>
        `;
                container.innerHTML += coverCategoryHTML;
            }

            const createAssetCategory = (title, items, type) => {
                let itemsHTML = items.map(item => {
                    let previewHTML = '';
                    if (type === 'image') previewHTML = `<img src="${item.fullPath}?v=${Date.now()}" alt="${item.fileName}">`;
                    else if (type === 'video') previewHTML = '<span>🎥</span>';

                    // Tombol hapus untuk gambar dan video
                    const deleteButtonHTML = (type === 'image' || type === 'video')
                        ? `<button class="delete-asset-btn" data-path="${item.relativePath}" title="Hapus Aset">×</button>`
                        : '';

                    return `
                <div class="asset-item" title="Klik untuk pratinjau" data-path="${item.relativePath}" data-full-path="${item.fullPath}" data-type="${type}">
                    ${previewHTML}
                    <span class="file-name">${item.fileName}</span>
                    ${deleteButtonHTML}
                </div>
            `;
                }).join('');

                // Tombol tambah kondisional
                let addButtonHTML = '';
                const buttonContent = `<span class="plus-icon">+</span><div class="spinner"></div>`;

                if (type === 'image') {
                    addButtonHTML = `<button class="add-asset-btn" data-type="image" title="Tambah Gambar Baru">${buttonContent}</button>`;
                } else if (type === 'video' && items.length === 0) {
                    addButtonHTML = `<button class="add-asset-btn" data-type="video" title="Tambah Video Baru">${buttonContent}</button>`;
                }

                // Jangan render kategori sama sekali jika kosong (kecuali gambar & video)
                if (items.length === 0 && (type !== 'image' && type !== 'video')) return '';

                return `<div class="asset-category"><h4>${title}</h4>${itemsHTML}${addButtonHTML}</div>`;
            };

            container.innerHTML += createAssetCategory('Gambar Lainnya', otherImages, 'image');
            container.innerHTML += createAssetCategory('Audio', assets.audios, 'audio');
            container.innerHTML += createAssetCategory('Video', assets.videos, 'video');
        }



        async function refreshAssetExplorers() {
            // Refresh Aset Global
            const globalAssets = await ipcRenderer.invoke('get-global-novel-assets', currentlyEditing.novel);
            renderAssetExplorer(globalAssets, 'asset-explorer-content');

            if (currentlyEditing.chapter) {
                const chapterAssets = await ipcRenderer.invoke('get-chapter-assets', {
                    novelTitle: currentlyEditing.novel,
                    chapterName: currentlyEditing.chapter
                });
                renderAssetExplorer(chapterAssets, 'chapter-asset-content');
            }

            // Also refresh the new unified asset view if it's mounted
            if (document.getElementById('asset-explorer-new')) {
                refreshUnifiedAssetView();
            }
        }
        
        window.refreshAssetExplorers = refreshAssetExplorers;
        window.renderAssetExplorer = renderAssetExplorer;

        // ============================================================
        // UNIFIED ASSET EXPLORER — Grid/List view with filtering
        // ============================================================

        let _allAssets = [];          // Cached flat array from get-all-novel-assets
        let _assetViewMode = 'grid';  // 'grid' | 'list'
        let _assetFilterChapter = 'all';
        let _assetFilterType = 'all';

        async function refreshUnifiedAssetView() {
            if (!currentlyEditing.novel) return;
            _allAssets = await ipcRenderer.invoke('get-all-novel-assets', currentlyEditing.novel);

            // Populate chapter filter dropdown
            const chapterSelect = document.getElementById('asset-filter-chapter');
            if (chapterSelect) {
                const chapters = [...new Set(_allAssets.filter(a => a.chapter).map(a => a.chapter))].sort();
                // Keep existing value if possible
                const prev = chapterSelect.value;
                chapterSelect.innerHTML = '<option value="all">Semua Aset</option><option value="global">📁 Global (root)</option>';
                chapters.forEach(ch => {
                    const opt = document.createElement('option');
                    opt.value = ch;
                    opt.textContent = '📂 ' + ch;
                    chapterSelect.appendChild(opt);
                });
                if ([...chapterSelect.options].some(o => o.value === prev)) chapterSelect.value = prev;
            }

            renderUnifiedAssets();
        }

        window.refreshUnifiedAssetView = refreshUnifiedAssetView;

        function getFilteredAssets() {
            return _allAssets.filter(a => {
                if (_assetFilterChapter === 'global') { if (a.chapter !== null) return false; }
                else if (_assetFilterChapter !== 'all') { if (a.chapter !== _assetFilterChapter) return false; }
                if (_assetFilterType !== 'all') { if (a.type !== _assetFilterType) return false; }
                return true;
            });
        }

        function formatFileSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function getTypeIcon(type) {
            return type === 'image' ? '🖼' : type === 'audio' ? '🎵' : type === 'video' ? '🎥' : '📄';
        }

        /**
         * Opsi animasi sprite custom — DITURUNKAN dari kelas `.anim-*` nyata
         * (sumbu A, D10), bukan ditulis di markup.
         *
         * Daftar ini dulu ditulis tangan DI SINI **dan** di node-registry: dua daftar
         * untuk satu kosakata, dengan isi yang bahkan berbeda. Akibatnya animasi
         * buatan kreator hanya akan muncul di salah satunya — belahan yang persis
         * melahirkan §A. Fallback dipakai hanya bila modul registry tak tersedia.
         */
        function _animOptionsHTML(selected) {
            try {
                const C = VN.NodeRegistry.C;
                return C.optionsToHTML(C.ANIM_OPTIONS_CUSTOM, selected || 'anim-in-fade');
            } catch (e) {
                return '<option value="anim-in-fade">Tampil Langsung</option>';
            }
        }

        /**
         * Opsi posisi panggung bernama (G2 irisan a) — sama alasannya dengan
         * `_animOptionsHTML` di atas: kosakatanya DITURUNKAN dari `--vn-pos-*` nyata,
         * dan markup baris-baru ini wajib memakai daftar yang sama dengan kartu.
         * Fallback hanya "pakai angka" — tanpa registry, mengarang nama posisi berarti
         * menawarkan nilai yang belum tentu dideklarasikan CSS mana pun.
         */
        function _posOptionsHTML() {
            try {
                const C = VN.NodeRegistry.C;
                return C.optionsToHTML(C.SPRITE_POS, '');
            } catch (e) {
                return '<option value="">— pakai angka (slider) —</option>';
            }
        }

        function renderUnifiedAssets() {
            const container = document.getElementById('asset-explorer-new');
            if (!container) return;

            const filtered = getFilteredAssets();

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="asset-empty-state">
                        <span class="asset-empty-icon">📭</span>
                        <span class="asset-empty-text">Tidak ada aset yang ditemukan.</span>
                    </div>`;
                return;
            }

            // Group by chapter
            const groups = {};
            filtered.forEach(a => {
                const key = a.chapter || '__global__';
                if (!groups[key]) groups[key] = [];
                groups[key].push(a);
            });

            let html = '';
            const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === '__global__') return -1;
                if (b === '__global__') return 1;
                return a.localeCompare(b);
            });

            for (const key of sortedKeys) {
                const items = groups[key];
                const label = key === '__global__' ? 'Global (root)' : key;
                html += `<div class="asset-group-header"><span>${label}</span><span class="asset-group-count">${items.length} file</span></div>`;

                if (_assetViewMode === 'grid') {
                    html += '<div class="asset-grid">';
                    for (const a of items) {
                        const thumbHTML = a.type === 'image'
                            ? `<img src="${a.fullPath}?v=${Date.now()}" alt="${a.fileName}" loading="lazy">`
                            : `<span class="asset-icon">${getTypeIcon(a.type)}</span>`;
                        html += `
                        <div class="asset-card" data-path="${a.relativePath}" data-full-path="${a.fullPath}" data-type="${a.type}" title="${a.fileName}">
                            <div class="asset-card-thumb">${thumbHTML}</div>
                            <div class="asset-card-info">
                                <div class="asset-card-name">${a.fileName}</div>
                                <div class="asset-card-meta">
                                    <span class="asset-info-badge">${getTypeIcon(a.type)} ${a.type}</span>
                                    <span class="asset-info-badge">${formatFileSize(a.size)}</span>
                                </div>
                            </div>
                            <button class="asset-card-delete" data-path="${a.relativePath}" title="Hapus">×</button>
                        </div>`;
                    }
                    html += '</div>';
                } else {
                    html += '<div class="asset-list">';
                    for (const a of items) {
                        const iconHTML = a.type === 'image'
                            ? `<img src="${a.fullPath}?v=${Date.now()}" alt="${a.fileName}" loading="lazy">`
                            : getTypeIcon(a.type);
                        html += `
                        <div class="asset-row" data-path="${a.relativePath}" data-full-path="${a.fullPath}" data-type="${a.type}">
                            <div class="asset-row-icon">${iconHTML}</div>
                            <span class="asset-row-name" title="${a.fileName}">${a.fileName}</span>
                            <span class="asset-row-type">${a.type}</span>
                            <span class="asset-row-size">${formatFileSize(a.size)}</span>
                            <button class="asset-row-delete" data-path="${a.relativePath}" title="Hapus">×</button>
                        </div>`;
                    }
                    html += '</div>';
                }
            }

            container.innerHTML = html;
        }

        // --- Unified Asset View Event Wiring ---
        (function initUnifiedAssetEvents() {
            // View toggle (grid/list)
            const viewToggle = document.querySelector('#global-asset-view .asset-view-toggle');
            if (viewToggle) {
                viewToggle.addEventListener('click', (e) => {
                    const btn = e.target.closest('.asset-view-btn');
                    if (!btn) return;
                    _assetViewMode = btn.dataset.view;
                    viewToggle.querySelectorAll('.asset-view-btn').forEach(b => b.classList.toggle('active', b === btn));
                    renderUnifiedAssets();
                });
            }

            // Chapter filter
            const chapterFilter = document.getElementById('asset-filter-chapter');
            if (chapterFilter) {
                chapterFilter.addEventListener('change', () => {
                    _assetFilterChapter = chapterFilter.value;
                    renderUnifiedAssets();
                });
            }

            // Type filter
            const typeFilter = document.getElementById('asset-filter-type');
            if (typeFilter) {
                typeFilter.addEventListener('change', () => {
                    _assetFilterType = typeFilter.value;
                    renderUnifiedAssets();
                });
            }

            // Click on asset card/row → show preview
            const contentArea = document.getElementById('asset-content-area');
            if (contentArea) {
                contentArea.addEventListener('click', (e) => {
                    // Delete button
                    const delBtn = e.target.closest('.asset-card-delete, .asset-row-delete');
                    if (delBtn) {
                        e.stopPropagation();
                        const relPath = delBtn.dataset.path;
                        if (relPath) {
                            showConfirmation(`Hapus file "${path.basename(relPath)}" secara permanen?`).then(async ok => {
                                if (!ok) return;
                                const result = await ipcRenderer.invoke('delete-asset-file', {
                                    novelTitle: currentlyEditing.novel,
                                    relativePath: relPath
                                });
                                showNotification(result.message, result.success ? 'success' : 'error');
                                if (result.success) refreshUnifiedAssetView();
                            });
                        }
                        return;
                    }

                    // Click on card/row → preview
                    const item = e.target.closest('.asset-card, .asset-row');
                    if (item) {
                        showAssetPreview(item.dataset.fullPath, item.dataset.type, item.dataset.path);
                    }
                });

                // Drag & drop
                contentArea.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const zone = document.getElementById('asset-drop-zone');
                    if (zone) zone.classList.add('active');
                });

                contentArea.addEventListener('dragleave', (e) => {
                    // Only deactivate if leaving the content area entirely
                    if (!contentArea.contains(e.relatedTarget)) {
                        const zone = document.getElementById('asset-drop-zone');
                        if (zone) zone.classList.remove('active');
                    }
                });

                contentArea.addEventListener('drop', async (e) => {
                    e.preventDefault();
                    const zone = document.getElementById('asset-drop-zone');
                    if (zone) zone.classList.remove('active');

                    if (!currentlyEditing.novel) return;

                    const files = e.dataTransfer.files;
                    if (!files || files.length === 0) return;

                    // Guard: cegah upload bersamaan saat proses sebelumnya masih berjalan
                    if (contentArea._uploadInProgress) return;
                    contentArea._uploadInProgress = true;

                    // Constants untuk file size validation
                    const MAX_FILE_SIZE = {
                        image: 10 * 1024 * 1024,  // 10 MB
                        audio: 50 * 1024 * 1024,  // 50 MB
                        video: 200 * 1024 * 1024  // 200 MB
                    };

                    // File validation function
                    function validateFile(file, type) {
                        // Check file size
                        if (file.size > MAX_FILE_SIZE[type]) {
                            const maxMB = (MAX_FILE_SIZE[type] / (1024 * 1024)).toFixed(0);
                            throw new Error(`File "${file.name}" terlalu besar. Maksimal ${maxMB} MB untuk ${type}.`);
                        }
                        
                        // Check file type
                        const ext = path.extname(file.name).toLowerCase();
                        const validExts = {
                            image: ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
                            audio: ['.mp3', '.ogg', '.wav', '.m4a'],
                            video: ['.mp4', '.webm', '.ogv']
                        };
                        
                        if (!validExts[type].includes(ext)) {
                            throw new Error(`Format file "${file.name}" tidak didukung: ${ext}`);
                        }
                        
                        return true;
                    }

                    // Detect file type function
                    function detectFileType(file) {
                        const ext = path.extname(file.name).toLowerCase();
                        const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
                        const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
                        const videoExts = ['.mp4', '.webm', '.ogv'];

                        if (imageExts.includes(ext)) return 'image';
                        else if (audioExts.includes(ext)) return 'audio';
                        else if (videoExts.includes(ext)) return 'video';
                        return null;
                    }

                    // Show upload progress
                    function showUploadProgress(current, total) {
                        let overlay = document.getElementById('upload-progress-overlay');
                        if (!overlay) {
                            overlay = document.createElement('div');
                            overlay.id = 'upload-progress-overlay';
                            overlay.style.cssText = `
                                position: fixed;
                                top: 0;
                                left: 0;
                                width: 100%;
                                height: 100%;
                                background: rgba(0, 0, 0, 0.8);
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                z-index: 10000;
                            `;
                            overlay.innerHTML = `
                                <div class="upload-progress-modal" style="
                                    background: #1a1a1a;
                                    border: 2px solid #333;
                                    border-radius: 12px;
                                    padding: 30px;
                                    min-width: 400px;
                                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                                ">
                                    <h3 style="margin: 0 0 20px 0; color: #fff; font-size: 1.2em;">Uploading Files...</h3>
                                    <div class="progress-bar" style="
                                        width: 100%;
                                        height: 30px;
                                        background: #2a2a2a;
                                        border-radius: 15px;
                                        overflow: hidden;
                                        position: relative;
                                        border: 1px solid #444;
                                    ">
                                        <div class="progress-fill" id="upload-progress-fill" style="
                                            height: 100%;
                                            background: linear-gradient(90deg, #00ffff, #00cccc);
                                            width: 0%;
                                            transition: width 0.3s ease;
                                            border-radius: 15px;
                                        "></div>
                                    </div>
                                    <p id="upload-progress-text" style="
                                        margin: 15px 0 0 0;
                                        color: #aaa;
                                        text-align: center;
                                        font-size: 0.95em;
                                    ">0 / 0 files</p>
                                </div>
                            `;
                            document.body.appendChild(overlay);
                        }
                        
                        overlay.style.display = 'flex';
                        const fill = document.getElementById('upload-progress-fill');
                        const text = document.getElementById('upload-progress-text');
                        
                        const percent = total > 0 ? (current / total) * 100 : 0;
                        fill.style.width = percent + '%';
                        text.textContent = `${current} / ${total} files`;
                    }

                    function hideUploadProgress() {
                        const overlay = document.getElementById('upload-progress-overlay');
                        if (overlay) {
                            overlay.style.display = 'none';
                        }
                    }

                    try {
                        // Filter valid files
                        const validFiles = Array.from(files).filter(f => detectFileType(f) !== null);
                        
                        if (validFiles.length === 0) {
                            showNotification('Tidak ada file yang valid untuk diupload.', 'error');
                            return;
                        }

                        // Show progress
                        showUploadProgress(0, validFiles.length);

                        let uploadedCount = 0;
                        let errorCount = 0;
                        const errors = [];

                        for (const file of validFiles) {
                            try {
                                const type = detectFileType(file);
                                if (!type) continue;

                                // Validate file
                                validateFile(file, type);

                                // Upload file
                                const buffer = await file.arrayBuffer();
                                const result = await ipcRenderer.invoke('add-asset-file', {
                                    novelTitle: currentlyEditing.novel,
                                    chapterName: '',
                                    file: { name: file.name, buffer: Buffer.from(buffer) }
                                });

                                if (result.success) {
                                    uploadedCount++;
                                } else {
                                    errorCount++;
                                    errors.push(`${file.name}: ${result.message}`);
                                }
                            } catch (error) {
                                errorCount++;
                                errors.push(error.message);
                                console.error('Upload error:', error);
                            }

                            // Update progress
                            showUploadProgress(uploadedCount + errorCount, validFiles.length);
                        }

                        // Hide progress after a short delay
                        setTimeout(() => {
                            hideUploadProgress();

                            // Show result notification
                            if (uploadedCount > 0) {
                                showNotification(`${uploadedCount} file berhasil diupload.`, 'success');
                                refreshUnifiedAssetView();
                            }

                            if (errorCount > 0) {
                                const errorMsg = errors.length > 3 
                                    ? `${errorCount} file gagal diupload. Lihat console untuk detail.`
                                    : errors.join('\n');
                                showNotification(errorMsg, 'error');
                                console.error('Upload errors:', errors);
                            }
                        }, 500);

                    } finally {
                        contentArea._uploadInProgress = false;
                    }
                });
            }
        })();

        // Listener utama untuk tombol Tambah dan Hapus
        document.addEventListener('click', async (event) => {
            const addBtn = event.target.closest('.add-asset-btn');
            const deleteAssetBtn = event.target.closest('.delete-asset-btn');
            const hubPreviewBtn = event.target.closest('#show-hub-preview-btn');

            if (hubPreviewBtn) {
                showHubPreview();
                return;
            }

            // Logika Tombol Clone/Duplikat Entri
            const cloneBtn = event.target.closest('.clone-dialogue-btn');
            if (cloneBtn) {
                const entryCard = cloneBtn.closest('.dialogue-entry-card');
                if (entryCard) {
                    // 1. Ekstrak data dari kartu saat ini
                    const entryData = extractDataFromCard(entryCard);

                    // 2. Buat kartu baru dengan data tersebut
                    // Dialogue entry tidak butuh availableLabels (hanya choice yang butuh), jadi [] aman.
                    const newCard = createEntryEditorCard(entryData.type, entryData, []);

                    // 3. Sisipkan setelah kartu saat ini
                    entryCard.after(newCard);

                    // 4. Scroll ke kartu baru
                    newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // 5. Animasi highlight
                    const originalBg = newCard.style.backgroundColor;
                    newCard.style.transition = 'background-color 0.5s';
                    newCard.style.backgroundColor = '#2c3e50'; // Highlight color
                    setTimeout(() => {
                        newCard.style.backgroundColor = originalBg;
                    }, 500);

                    showNotification('Entri berhasil diduplikasi.', 'success');
                }
                return;
            }

            // === CHANNEL AUDIO BERNAMA (G1): tombol Tambah Channel ===
            // Barisnya dibuat di sini (delegasi, pola yang sama dengan sprite tambahan)
            // supaya markupnya hanya hidup di satu tempat: _audioChannelsHTML merender
            // yang SUDAH ADA, tombol ini menambah yang baru.
            // Layer sprite tambahan (F4) — pola yang sama: `_spriteLayersHTML`
            // merender layer yang SUDAH ADA, tombol ini menambah yang baru.
            const addLayerBtn = event.target.closest('.add-sprite-layer-btn');
            if (addLayerBtn) {
                const blok = addLayerBtn.closest('.sprite-layers-block');
                const container = blok?.querySelector('.sprite-layers-container');
                const emptyMsg = blok?.querySelector('.sprite-layers-empty-msg');
                if (container) {
                    // Markup barisnya milik entryEditorCard — di sinilah dulu ada
                    // salinan kedua yang bergaya beda dari baris hasil muat berkas.
                    const bungkus = document.createElement('div');
                    bungkus.innerHTML = typeof window.buildSpriteLayerItemHTML === 'function'
                        ? window.buildSpriteLayerItemHTML('')
                        : '';
                    const item = bungkus.firstElementChild;
                    if (!item) return;
                    container.appendChild(item);
                    if (emptyMsg) emptyMsg.style.display = 'none';
                    const srcInput = item.querySelector('.sprite-layer-src');
                    if (srcInput) srcInput.focus();
                }
                return;
            }

            const removeLayerBtn = event.target.closest('.remove-sprite-layer-btn');
            if (removeLayerBtn) {
                const item = removeLayerBtn.closest('.sprite-layer-item');
                const blok = removeLayerBtn.closest('.sprite-layers-block');
                if (item) item.remove();
                const sisa = blok?.querySelectorAll('.sprite-layer-item').length || 0;
                const emptyMsg = blok?.querySelector('.sprite-layers-empty-msg');
                if (emptyMsg) emptyMsg.style.display = sisa ? 'none' : 'block';
                // Hapus baris TIDAK memicu event `input`, jadi badge jumlah layer di
                // sebelah thumbnail harus disegarkan sendiri (UX-A05).
                if (blok && typeof window.refreshSpriteLayerBadge === 'function') {
                    window.refreshSpriteLayerBadge(blok);
                }
                return;
            }

            const addAudioChBtn = event.target.closest('.add-audio-channel-btn');
            if (addAudioChBtn) {
                const wrap = addAudioChBtn.parentElement;
                const container = wrap?.querySelector('.audio-channels-container');
                const emptyMsg = wrap?.querySelector('.audio-channels-empty-msg');
                if (container) {
                    const item = document.createElement('div');
                    item.className = 'audio-channel-item';
                    item.style.cssText = 'display: grid; grid-template-columns: 1fr 2fr auto auto auto; gap: 6px; align-items: center; margin-bottom: 6px;';
                    item.innerHTML = `
                        <input type="text" class="script-input ac-name" value="" placeholder="nama channel" title="Nama channel (mis. musicpoem). 'bgm'/'ambient' punya field sendiri.">
                        <input type="text" class="script-input ac-src audio-input" value="" placeholder="file audio… (atau kosongkan + centang Stop)">
                        <input type="number" class="script-input ac-fade" value="" min="0" step="0.5" style="width: 70px;" placeholder="fade" title="Fade in/out (detik)">
                        <label style="display: flex; align-items: center; gap: 4px; margin: 0; font-size: 0.8em;" title="Ulangi track / daftar">
                            <input type="checkbox" class="script-input ac-loop" checked> loop
                        </label>
                        <label style="display: flex; align-items: center; gap: 4px; margin: 0; font-size: 0.8em;" title="Hentikan channel ini mulai entri ini">
                            <input type="checkbox" class="script-input ac-stop"> ⏹
                        </label>
                        <input type="text" class="script-input ac-queue" value="" placeholder="playlist (opsional): a.mp3, b.mp3" style="grid-column: 1 / -1;" title="Beberapa berkas dipisah koma — track berpindah otomatis saat selesai">`;
                    container.appendChild(item);
                    if (emptyMsg) emptyMsg.style.display = 'none';
                    const namaInput = item.querySelector('.ac-name');
                    if (namaInput) namaInput.focus();
                }
                return;
            }

            // === MULTI-SPRITE SYSTEM: Tombol Tambah Sprite Tambahan ===
            const addExtraSpriteBtn = event.target.closest('.add-extra-sprite-btn');
            if (addExtraSpriteBtn) {
                const extraSpritesSection = addExtraSpriteBtn.closest('.extra-sprites-section');
                const container = extraSpritesSection?.querySelector('.extra-sprites-container');
                const emptyMsg = extraSpritesSection?.querySelector('.extra-sprites-empty-msg');
                const spriteIndex = container ? container.children.length : 0;

                if (container) {
                    // Buat item sprite baru dengan format yang sama seperti sprite preset
                    const newSpriteItem = document.createElement('div');
                    newSpriteItem.className = 'extra-sprite-item';
                    newSpriteItem.dataset.spriteIndex = spriteIndex;
                    newSpriteItem.innerHTML = `
                        <div class="file-input-group">
                            <div class="input-with-clear-wrapper">
                                <input type="text" class="script-input image-input extra-sprite-src" value="" placeholder="Pilih gambar atau video...">
                                <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                            </div>
                            <button type="button" class="browse-file-btn" data-type="all-media">📁</button>
                            <button type="button" class="remove-extra-sprite-btn" title="Hapus Sprite Custom" style="background: #f44; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 0.9em;">×</button>
                        </div>
                        <div class="sprite-config-container">
                            <div class="sprite-anim-wrapper extra-sprite-wrapper" data-preview-for="extra-new"><img src="" class="sprite-anim-img extra-sprite-preview" onload="this.parentElement.classList.add('visible')" onerror="this.parentElement.classList.remove('visible')"></div>
                            <div class="animation-controls" style="display: none;">
                                <label class="animation-label">⚙️ Konfigurasi</label>
                                <div class="sprite-anim-selection-row">
                                    <label class="sprite-delay-control" title="Tunda kemunculan dan mulai animasi sprite pada entri ini.">Delay tampil <input type="number" class="script-input extra-sprite-delay" value="" min="0" max="60000" step="50" placeholder="0"> <span>ms</span></label>
                                    <select class="script-input sprite-anim-selector extra-sprite-anim">${_animOptionsHTML('anim-in-fade')}</select>
                                </div>
                                <label class="animation-label" style="margin-top: 8px;">Transformasi</label>
                                <div class="transform-controls-group">
                                    <div class="transform-row">
                                        <span class="transform-label">Ukuran</span>
                                        <input type="range" class="script-input scale-slider extra-sprite-scale transform-slider" min="0" max="100" step="1" value="50">
                                        <span class="scale-value-display transform-value">50%</span>
                                    </div>
                                    <div class="transform-row position-x-row">
                                        <span class="transform-label">Posisi X</span>
                                        <select class="script-input extra-sprite-x-name" title="Posisi panggung bernama (--vn-pos-* di CSS). Pilih '— pakai angka —' untuk memakai slider.">
                                            ${_posOptionsHTML()}
                                        </select>
                                    </div>
                                    <div class="transform-row position-x-row">
                                        <span class="transform-label"></span>
                                        <input type="range" class="script-input extra-sprite-x transform-slider" min="0" max="100" step="1" value="50">
                                        <span class="position-value-display transform-value">50%</span>
                                    </div>
                                    <div class="transform-row">
                                        <span class="transform-label">Z-Order</span>
                                        <input type="number" class="script-input extra-sprite-z" value="" placeholder="auto" title="Angka lebih besar tampil di depan; kosong = urutan alami" style="width: 70px; padding: 4px 6px;">
                                    </div>
                                </div>
                                <div class="sprite-chroma-controls">
                                    <label class="sprite-chroma-toggle" title="Hapus warna latar dari gambar atau video sprite saat diputar."><input type="checkbox" class="script-input extra-sprite-chroma-enabled"> Chroma key</label>
                                    <div class="sprite-chroma-fields" style="display: none;">
                                        <label>Warna <input type="color" class="script-input extra-sprite-chroma-color" value="#00ff00"></label>
                                        <label>Toleransi <input type="number" class="script-input extra-sprite-chroma-tolerance" value="45" min="0" max="255" step="1"></label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                    container.appendChild(newSpriteItem);

                    // Sembunyikan pesan kosong
                    if (emptyMsg) emptyMsg.style.display = 'none';

                    // Bind event listener untuk live animation preview pada selector animasi
                    const animSelector = newSpriteItem.querySelector('.extra-sprite-anim');
                    const getPreviewSurface = () => newSpriteItem.querySelector('.extra-sprite-preview');

                    if (animSelector && getPreviewSurface()) {
                        // Fungsi untuk menerapkan animasi live
                        const applyLiveAnimation = () => {
                            const imgPreview = getPreviewSurface();
                            if (!imgPreview) return;
                            const animValue = animSelector.value || 'anim-in-fade';
                            const animClassMap = {
                                // 'anim-in-fade': 'editor-anim-in-fade',
                                'anim-in-slide-from-bottom': 'editor-anim-in-slide-from-bottom',
                                'anim-in-slide-from-left': 'editor-anim-in-slide-from-left',
                                'anim-in-slide-from-right': 'editor-anim-in-slide-from-right',
                                'anim-out-fade': 'editor-anim-out-fade',
                                'anim-out-slide-to-bottom': 'editor-anim-out-slide-to-bottom',
                                'anim-out-slide-to-left': 'editor-anim-out-slide-to-left',
                                'anim-out-slide-to-right': 'editor-anim-out-slide-to-right',
                                'anim-loop-pulse-glow': 'editor-anim-loop-pulse-glow',
                                'anim-loop-gentle-float': 'editor-anim-loop-gentle-float',
                                'anim-loop-shake': 'editor-anim-loop-shake',
                                'anim-oneshot-shake': 'editor-anim-oneshot-shake',
                                'anim-oneshot-jump': 'editor-anim-oneshot-jump',
                                'anim-loop-pulse': 'editor-anim-loop-pulse',
                                'anim-oneshot-flip-right': 'editor-anim-oneshot-flip-right',
                                'anim-oneshot-flip-left': 'editor-anim-oneshot-flip-left',
                                'anim-oneshot-flip-up': 'editor-anim-oneshot-flip-up',
                                'anim-oneshot-flip-down': 'editor-anim-oneshot-flip-down',
                                'anim-oneshot-pass-left-to-right': 'editor-anim-oneshot-pass-left-to-right',
                                'anim-oneshot-pass-right-to-left': 'editor-anim-oneshot-pass-right-to-left',
                                'anim-oneshot-pass-bottom-to-top': 'editor-anim-oneshot-pass-bottom-to-top',
                                'anim-oneshot-pass-top-to-bottom': 'editor-anim-oneshot-pass-top-to-bottom',
                                'anim-loop-motor-vibration': 'editor-anim-loop-motor-vibration',
                                'anim-loop-confused': 'editor-anim-loop-confused',
                                'anim-loop-flip-confused': 'editor-anim-loop-flip-confused'
                            };

                            // Hapus semua kelas animasi
                            Object.values(animClassMap).forEach(cls => imgPreview.classList.remove(cls));

                            // Terapkan kelas animasi baru - cek parent wrapper untuk visibility
                            const editorAnimClass = animClassMap[animValue];
                            const wrapper = imgPreview.closest('.sprite-anim-wrapper');
                            const isVisible = wrapper ? wrapper.classList.contains('visible') : imgPreview.parentElement && imgPreview.parentElement.style.display !== 'none';

                            if (editorAnimClass && isVisible) {
                                void imgPreview.offsetWidth; // Trigger reflow
                                imgPreview.classList.add(editorAnimClass);
                            }
                        };

                        // Pasang listener untuk perubahan selector
                        animSelector.addEventListener('change', applyLiveAnimation);
                    }

                    const chromaToggle = newSpriteItem.querySelector('.extra-sprite-chroma-enabled');
                    const chromaFields = newSpriteItem.querySelector('.sprite-chroma-fields');
                    if (chromaToggle && chromaFields) {
                        chromaToggle.addEventListener('change', () => {
                            chromaFields.style.display = chromaToggle.checked ? 'grid' : 'none';
                        });
                    }

                    // Focus ke input file
                    newSpriteItem.querySelector('.extra-sprite-src')?.focus();
                }
                return;
            }

            // === MULTI-SPRITE SYSTEM: Tombol Hapus Sprite Tambahan ===
            const removeExtraSpriteBtn = event.target.closest('.remove-extra-sprite-btn');
            if (removeExtraSpriteBtn) {
                const spriteItem = removeExtraSpriteBtn.closest('.extra-sprite-item');
                const container = spriteItem?.parentElement;
                const extraSpritesSection = spriteItem?.closest('.extra-sprites-section');
                const emptyMsg = extraSpritesSection?.querySelector('.extra-sprites-empty-msg');

                if (spriteItem) {
                    spriteItem.remove();

                    // Tampilkan pesan kosong jika tidak ada sprite tersisa
                    if (container && container.children.length === 0 && emptyMsg) {
                        emptyMsg.style.display = 'block';
                    }
                }
                return;
            }

            // Logika Tombol Hapus Aset
            if (deleteAssetBtn) {
                const assetItem = deleteAssetBtn.closest('.asset-item');
                const relativePath = assetItem?.dataset.path;

                if (!relativePath) return;

                const confirmed = await showConfirmation(`Anda yakin ingin menghapus file aset "${path.basename(relativePath)}" secara permanen? Aksi ini tidak bisa dibatalkan.`);

                if (confirmed) {
                    const result = await ipcRenderer.invoke('delete-asset-file', {
                        novelTitle: currentlyEditing.novel,
                        relativePath: relativePath
                    });

                    showNotification(result.message, result.success ? 'success' : 'error');

                    if (result.success) {
                        refreshAssetExplorers(); // Memuat ulang daftar aset
                    }
                }
                return;
            }

            // Logika Tombol Tambah (+)
            if (addBtn) {
                const assetType = addBtn.dataset.type;
                let filters;

                if (assetType === 'image') {
                    filters = [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];
                } else if (assetType === 'video') {
                    filters = [{ name: 'Video', extensions: ['mp4', 'webm'] }];
                }

                if (!filters) return;

                const inChapterEditor = addBtn.closest('#chapter-asset-content');
                const targetChapter = inChapterEditor ? currentlyEditing.chapter : '';

                const newFile = await ipcRenderer.invoke('open-and-read-file', { filters });
                if (newFile) {
                    // Tampilkan loading indicator
                    addBtn.classList.add('loading');

                    try {
                        let result;
                        if (assetType === 'image') {
                            result = await ipcRenderer.invoke('add-asset-file', {
                                novelTitle: currentlyEditing.novel,
                                chapterName: targetChapter,
                                file: newFile
                            });
                        } else if (assetType === 'video') {
                            result = await ipcRenderer.invoke('add-asset-file', { // Tetap panggil handler yang pintar
                                novelTitle: currentlyEditing.novel,
                                chapterName: targetChapter, // akan bernilai '' untuk video global
                                file: newFile
                            });
                        }

                        showNotification(result.message, result.success ? 'success' : 'error');
                        if (result.success) {
                            refreshAssetExplorers();
                        }
                    } finally {
                        // Selalu hilangkan loading indicator setelah selesai
                        addBtn.classList.remove('loading');
                    }
                }
            }

            // Penghapusan kartu Story dimiliki scriptEditor.js. Menanganinya juga
            // di listener aset membuat satu klik menghapus subtree sebelum cleanup
            // Sortable/WebAudio dan dapat memunculkan konfirmasi ganda.
        });

        // ============== Edit cerita ================ //

