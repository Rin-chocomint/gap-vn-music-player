        async function showHubEditor(novelTitle, onboardingRequest = false) {
            // Consume first so an immediate close/reopen cannot display this one-time prompt again.
            const normalizedOnboarding = _normalizeNewNovelOnboardingRequest(onboardingRequest);
            console.info('[Onboarding][Renderer] Membuka Hub Editor.', {
                novelTitle: novelTitle,
                fromCreateFlow: normalizedOnboarding.isNewNovel,
                expectedNovelId: normalizedOnboarding.novelId
            });
            const shouldShowOnboarding = normalizedOnboarding.isNewNovel
                && await _consumeNewNovelOnboarding(novelTitle, normalizedOnboarding.novelId);
            console.info('[Onboarding][Renderer] Keputusan awal tampilan.', {
                novelTitle: novelTitle,
                shouldShow: shouldShowOnboarding
            });
            _hideNewNovelOnboarding('menyiapkan workspace novel');

            // Atur ulang input video
            editorBackgroundVideoInput.value = '';
            videoPreviewName.textContent = '';
            document.getElementById('video-upload-label').classList.remove('file-selected');

            hideCreateNovelModal();
            
            // Buka workspace editor (overlay gelap)
            scriptEditorOverlay.style.display = 'flex';
            setTimeout(() => scriptEditorOverlay.classList.add('visible'), 10);
            
            // PENTING: Muat seluruh data editor (termasuk chapter list, aset global, dan form metadata)
            // loadNovelForEditing juga akan mengisi currentlyEditing = {novel: title} dan membuka editor-main-screen
            await loadNovelForEditing(novelTitle);
            
            // Pindah ke tab novel + Profil sebagai awal authoring
            switchWorkspaceView('profile');
            const novelTab = document.querySelector('.sidebar-tab[data-tab="novel"]');
            if (novelTab) {
                document.querySelectorAll('.sidebar-tab').forEach(tab => tab.classList.remove('active'));
                document.querySelectorAll('.sidebar-content').forEach(content => content.classList.remove('active'));
                novelTab.classList.add('active');
                const novelContent = document.getElementById('sidebar-content-novel');
                if (novelContent) novelContent.classList.add('active');

                // Aktifkan sub-section Profil Novel
                document.querySelectorAll('[data-novel-section]').forEach(b => b.classList.remove('active'));
                const profileSubBtn = document.querySelector('[data-novel-section="profile"]');
                if (profileSubBtn) profileSubBtn.classList.add('active');
                document.querySelectorAll('.novel-section').forEach(s => s.classList.remove('active'));
                const profileSection = document.getElementById('novel-section-profile');
                if (profileSection) profileSection.classList.add('active');
            }

            if (shouldShowOnboarding) {
                window._hasEditedScript = false;
                _showNewNovelOnboarding(novelTitle);
            } else {
                _hideNewNovelOnboarding('bukan sesi pertama setelah create');
            }
        }

        function _normalizeNewNovelOnboardingRequest(request) {
            if (request === true) return { isNewNovel: true, novelId: null };
            if (request && typeof request === 'object') {
                return {
                    isNewNovel: !!(request.isNewNovel || request.showNewNovelOnboarding),
                    novelId: request.novelId || null
                };
            }
            return { isNewNovel: false, novelId: null };
        }

        async function _consumeNewNovelOnboarding(novelTitle, expectedNovelId) {
            try {
                const state = await ipcRenderer.invoke('consume-new-novel-onboarding', {
                    novelTitle: novelTitle,
                    expectedNovelId: expectedNovelId || null
                });
                console.info('[Onboarding][Renderer] Hasil consume backend.', {
                    novelTitle: novelTitle,
                    expectedNovelId: expectedNovelId || null,
                    success: !!(state && state.success),
                    shouldShow: !!(state && state.shouldShow),
                    shownAt: state && state.shownAt ? state.shownAt : null
                });
                return !!(state && state.success && state.shouldShow);
            } catch (err) {
                console.error('[Onboarding] Gagal mengonsumsi status onboarding:', err);
                return false;
            }
        }

        function _setNewNovelOnboardingVisible(visible, reason) {
            var bar = document.getElementById('new-novel-onboarding');
            if (!bar) return;

            var wasHidden = bar.classList.contains('onboarding-hidden');
            bar.classList.toggle('onboarding-hidden', !visible);
            bar.style.display = visible ? 'flex' : 'none';
            bar.setAttribute('aria-hidden', visible ? 'false' : 'true');

            if (wasHidden === visible) {
                console.info('[Onboarding][Renderer] Bar ' + (visible ? 'ditampilkan.' : 'disembunyikan.'), {
                    reason: reason,
                    activeNovel: typeof currentlyEditing !== 'undefined' ? currentlyEditing.novel : null,
                    onboardingNovel: window._newNovelOnboardingNovel || null
                });
            }
        }

        function _hideNewNovelOnboarding(reason) {
            _setNewNovelOnboardingVisible(false, reason || 'onboarding dinonaktifkan');
            window._novelOnboarding = false;
            window._newNovelOnboardingNovel = null;
        }
        window._hideNewNovelOnboarding = _hideNewNovelOnboarding;

        // Onboarding = panduan yang MENEMANI user menjelajah editor, jadi ia tidak
        // boleh lenyap begitu user membuka menu di luar daftar "langkah".
        //
        // Dulu fungsi ini menggerbangi konteks secara sempit (hanya tab Story,
        // section Profil, dan Hub target overview/opening/menu) → bar HILANG saat
        // user membuka VN Player, Aset, Achievements, Terjemahan, atau Hub→Advanced.
        // Itu membuat panduan terasa "kabur" persis ketika user sedang eksplorasi.
        //
        // Sekarang satu-satunya gerbang: workspace editor sedang terbuka. Bar tetap
        // punya tombol ✕ dan auto-dismiss saat semua langkah selesai.
        function _isOnboardingRelevantContext() {
            var mainScreen = document.getElementById('editor-main-screen');
            if (!mainScreen) return false;
            if (mainScreen.style.display === 'none') return false;
            // Jaga-jaga bila disembunyikan lewat CSS/class, bukan style inline.
            if (typeof window.getComputedStyle === 'function') {
                var cs = window.getComputedStyle(mainScreen);
                if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
            }
            return true;
        }

        function _refreshOnboardingVisibility() {
            var bar = document.getElementById('new-novel-onboarding');
            if (!bar || !window._novelOnboarding) return;
            var relevantContext = _isOnboardingRelevantContext();
            _setNewNovelOnboardingVisible(
                relevantContext,
                relevantContext ? 'konteks onboarding aktif' : 'berpindah dari konteks onboarding'
            );
        }

        function _bindOnboardingContextListeners() {
            if (window._onboardingContextListenersBound) return;
            window._onboardingContextListenersBound = true;

            // Klik nav — menangkap sub-navigasi yang TIDAK mengganti workspace view
            // (mis. antar hub-nav-btn di dalam view Hub yang sama).
            document.querySelectorAll('.sidebar-tab, [data-novel-section], .hub-nav-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    setTimeout(function () {
                        _noteOnboardingHubVisit();
                        _refreshOnboardingVisibility();
                    }, 0);
                });
            });

            // Tulang punggung yang ANDAL: setiap pergantian view workspace memancarkan
            // event ini — termasuk navigasi PROGRAMATIK (pilih chapter, switchWorkspaceView
            // dari modul lain) yang tak pernah menyentuh tombol di atas. Tanpa ini,
            // visibilitas & centang bisa basi karena listener klik saja tak terpicu.
            // Bonus: kebal terhadap tombol nav yang di-render ulang setelah binding.
            if (window.VN && VN.Events && typeof VN.Events.on === 'function') {
                VN.Events.on('workspace:viewChanged', function (data) {
                    _noteOnboardingHubVisit(data && data.to);
                    _refreshOnboardingVisibility();
                });
            }
        }

        // FB3: langkah 'Hub Overview' (data-step="template") ditandai saat user
        // BENAR-BENAR membuka bagian Hub — bukan karena novel code-first membuat
        // hubModeConfirmed=true otomatis. Latch sekali; idempoten.
        // `viewName` opsional: dari event workspace:viewChanged. Dipakai karena DOM
        // section bisa belum ter-update saat event dipancarkan — dua sumber ini saling
        // menambal sehingga langkah Hub tak pernah terlewat.
        function _noteOnboardingHubVisit(viewName) {
            if (!window._novelOnboarding || !window._novelOnboardingActions) return;
            if (window._novelOnboardingActions.template) return;
            var activeNovelSection = document.querySelector('[data-novel-section].active');
            var novelSection = activeNovelSection ? activeNovelSection.dataset.novelSection : '';
            if (novelSection === 'hub' || viewName === 'hub') {
                window._novelOnboardingActions.template = true;
                _updateOnboardingState();
            }
        }

        // ==========================================
        // NEW NOVEL ONBOARDING CHECKLIST
        // ==========================================
        function _showNewNovelOnboarding(novelTitle) {
            const bar = document.getElementById('new-novel-onboarding');
            if (!bar) return;
            window._novelOnboarding = true;
            window._newNovelOnboardingNovel = novelTitle;
            // FB3: langkah ditandai berdasarkan AKSI user, bukan keadaan scaffold.
            // Reset tiap onboarding baru: metadata & template mulai kosong sampai
            // user benar-benar menyunting Profil / membuka Hub (chapter & script
            // sudah aksi-alamiah — novel baru punya 0 chapter & belum buka script).
            window._novelOnboardingActions = { metadata: false, template: false };
            console.info('[Onboarding][Renderer] Onboarding diaktifkan untuk novel baru.', {
                novelTitle: novelTitle
            });
            _bindOnboardingContextListeners();
            _refreshOnboardingVisibility();
            _updateOnboardingState();

            // Dismiss button
            const dismissBtn = document.getElementById('onboarding-dismiss-btn');
            if (dismissBtn) {
                dismissBtn.onclick = function () {
                    _hideNewNovelOnboarding();
                };
            }

            if (window._newNovelOnboardingListenersBound) return;
            window._newNovelOnboardingListenersBound = true;

            // Clickable steps navigate to relevant sections
            bar.querySelectorAll('.onboarding-step').forEach(function (step) {
                step.style.cursor = 'pointer';
                step.addEventListener('click', function () {
                    var target = step.dataset.step;
                    if (target === 'metadata') {
                        var profileBtn = document.querySelector('[data-novel-section="profile"]');
                        if (profileBtn) profileBtn.click();
                    } else if (target === 'template') {
                        var hubBtn = document.querySelector('[data-novel-section="hub"]');
                        if (hubBtn) hubBtn.click();
                        setTimeout(function () {
                            var overviewBtn = document.querySelector('.hub-nav-btn[data-hub-target="overview"]');
                            if (overviewBtn) overviewBtn.click();
                        }, 50);
                    } else if (target === 'chapter') {
                        // Go to Story tab
                        var storyTab = document.querySelector('.sidebar-tab[data-tab="story"]');
                        if (storyTab) storyTab.click();
                    } else if (target === 'script') {
                        var storyTab = document.querySelector('.sidebar-tab[data-tab="story"]');
                        if (storyTab) storyTab.click();
                    }
                });
            });

            // Live-update onboarding saat user mengisi metadata
            ['editor-description', 'editor-genre', 'editor-author'].forEach(function (id) {
                var el = document.getElementById(id);
                if (el) el.addEventListener('input', function () {
                    if (window._novelOnboarding) {
                        // FB3: 'input' hanya dari ketikan user (auto-fill tagline via
                        // .value tak memicunya) → aksi menyunting Profil yang sah.
                        if (window._novelOnboardingActions) window._novelOnboardingActions.metadata = true;
                        _updateOnboardingState();
                    }
                });
            });
        }

        function _updateOnboardingState() {
            var bar = document.getElementById('new-novel-onboarding');
            if (!bar || !window._novelOnboarding) return;

            var steps = bar.querySelectorAll('.onboarding-step');
            steps.forEach(function (step) {
                var key = step.dataset.step;
                var check = step.querySelector('.onboarding-check');
                var done = false;

                if (key === 'metadata') {
                    // FB3: aksi user (menyunting Profil), bukan keadaan terisi —
                    // tagline auto-mengisi description saat scaffold, jangan dihitung.
                    done = !!(window._novelOnboardingActions && window._novelOnboardingActions.metadata);
                } else if (key === 'template') {
                    // FB3: aksi user membuka Hub, bukan hubModeConfirmed otomatis.
                    done = !!(window._novelOnboardingActions && window._novelOnboardingActions.template);
                } else if (key === 'chapter') {
                    done = (window.availableChapters || []).length > 0;
                } else if (key === 'script') {
                    // FB3: aksi MENYUNTING naskah (dilatch scriptEditor saat ada
                    // perubahan di atas baseline), bukan sekadar script terbuka —
                    // membuat chapter pertama otomatis membuka script-nya.
                    done = !!window._hasEditedScript;
                }

                if (check) check.textContent = done ? '☑' : '☐';
                step.classList.toggle('onboarding-done', done);
            });

            // Auto-dismiss when all done
            var allDone = Array.from(steps).every(function (s) { return s.classList.contains('onboarding-done'); });
            if (allDone) {
                setTimeout(function () {
                    _hideNewNovelOnboarding();
                    VN.Toast.success('Novel siap! Semua langkah awal selesai. 🎉');
                }, 800);
            }

            _refreshOnboardingVisibility();
        }

        // Expose for other modules to trigger onboarding update
        window._updateOnboardingState = _updateOnboardingState;

        function createImgPreview(value, key) {
            const src = value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}` : '';
            return `<img src="${src}" class="image-preview" data-preview-for="${key}" style="display: ${value ? 'block' : 'none'};" onload="this.style.display='block'" onerror="this.style.display='none'">`;
        };

        // `updateImagePreviewUI` pindah ke `vnModules/shared/mediaPreview.js` (UX-A05).
        // Ia satu-satunya pemakainya adalah scriptEditor, dan versi yang menumpang di
        // sini sempat kehilangan jejak markup sprite tanpa ada yang menyadarinya.

        // Rekonstruksi tampilan media existing saat membuka novel yang sudah ada.
        // (Media Showcase dihapus 2026-07-21 — novel-meta.images tidak lagi ada;
        //  galeri/slideshow kini urusan hub kustom lewat kodenya sendiri.)
        function _reconstructExistingMedia(novelTitle, promotionalVideo) {
            var novelDir = path.join(__dirname, 'visual_novels', novelTitle);
            var fsCheck = require('fs');

            // Tampilkan info video promosi canonical; kalau meta belum mencatatnya,
            // cari berkas legacy `video.<ext>` di disk. Menebak 'video.mp4' saja
            // membuat novel ber-WebM tampil seolah belum punya video (UX-A07b).
            var videoName = promotionalVideo || '';
            if (!videoName && fsCheck.existsSync(novelDir)) {
                try {
                    videoName = fsCheck.readdirSync(novelDir).find(function (f) {
                        return /^video\.(mp4|webm)$/i.test(f);
                    }) || '';
                } catch (e) { videoName = ''; }
            }
            if (videoName && fsCheck.existsSync(path.join(novelDir, videoName))) {
                videoPreviewName.textContent = videoName + ' (existing)';
                var uploadLabel = document.getElementById('video-upload-label');
                if (uploadLabel) uploadLabel.classList.add('file-selected');
            }
        }

        // Logika pembatalan pembuatan novel akan dipindahkan ke pengelola workspace utama

        // ==========================================
        // LOGIKA NAV HUB (hub-nav-btn) — kini tombol action di header (Fase 5)
        // Tiap tombol membuka drawer config (.hub-config-drawer) + switch hub-section.
        // ==========================================
        const hubNavBtns = document.querySelectorAll('.hub-nav-btn');
        const hubSections = document.querySelectorAll('.hub-section');

        // Drawer config (Fase 5/6): panel pengaturan kini muncul sebagai drawer geser
        // dari kanan, dibuka lewat tombol header. Preview tetap kanvas utama.
        function _closeHubConfigDrawer() {
            var drawer = document.getElementById('hub-config-drawer');
            if (drawer) drawer.classList.remove('open');
            hubNavBtns.forEach(b => b.classList.remove('active'));
        }
        window._closeHubConfigDrawer = _closeHubConfigDrawer;

        // Window Hub Code Editor (terpisah): buka/fokus lewat main process, dengan
        // info novel + mode partial saat ini, dan opsional target scene yang dilompati.
        function openHubCodeEditorWindow(extra) {
            extra = extra || {};
            // Default: langsung tampilkan kode scene yang sedang dipilih/disorot.
            // Bila belum ada yang dipilih, jatuh ke scene awal (startSceneId) atau
            // scene pertama — supaya editor tidak terbuka kosong & membingungkan.
            if (!extra.activeSceneId) {
                var cfg = window.hubConfig || {};
                var scenes = Array.isArray(cfg.scenes) ? cfg.scenes : [];
                var sid = window.activeHubSceneId ||
                    (cfg.sceneFlow && cfg.sceneFlow.startSceneId) ||
                    (scenes[0] && scenes[0].id) || null;
                if (sid) {
                    extra.activeSceneId = sid;
                    if (!extra.activeSceneLabel) {
                        var sc = scenes.filter(function (s) { return s.id === sid; })[0];
                        extra.activeSceneLabel = sc ? (sc.name || sc.id) : sid;
                    }
                }
            }
            ipcRenderer.send('hub-code-editor:open', Object.assign({
                novelTitle: window.currentlyEditingNovel,
                hubPartials: !!(window.hubConfig && window.hubConfig.hubPartials)
            }, extra));
            hubNavBtns.forEach(b => b.classList.toggle('active', b.dataset.hubTarget === 'advanced'));
        }
        window.openHubCodeEditorWindow = openHubCodeEditorWindow;

        // Minta window Hub Code Editor (bila terbuka) memuat ulang file dari disk —
        // dipakai setelah hub.html/hub.css berubah lewat aksi di window utama
        // (tambah/hapus scene, terapkan template, ganti mode hub).
        function refreshDetachedCodeEditor() {
            ipcRenderer.send('hub-code-editor:reload');
        }

        function _openHubConfigSection(target) {
            var drawer = document.getElementById('hub-config-drawer');
            if (target === 'advanced') {
                openHubCodeEditorWindow({});
                return;
            }
            hubNavBtns.forEach(b => b.classList.toggle('active', b.dataset.hubTarget === target));
            hubSections.forEach(sec => sec.classList.remove('active'));
            var targetSec = document.getElementById('hub-section-' + target);
            if (targetSec) targetSec.classList.add('active');
            if (drawer) drawer.classList.add('open');

            var titleEl = document.getElementById('hub-config-drawer-title');
            var btnLabel = (document.querySelector('.hub-nav-btn[data-hub-target="' + target + '"]') || {}).textContent;
            if (titleEl) titleEl.textContent = btnLabel || 'Pengaturan Hub';

        }
        window._openHubConfigSection = _openHubConfigSection;

        hubNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.hubTarget === 'advanced') {
                    openHubCodeEditorWindow({});
                    return;
                }
                var drawer = document.getElementById('hub-config-drawer');
                var drawerOpen = drawer && drawer.classList.contains('open');
                // Klik tombol yang sama saat drawer terbuka → tutup (toggle).
                if (drawerOpen && btn.classList.contains('active')) {
                    _closeHubConfigDrawer();
                    return;
                }
                _openHubConfigSection(btn.dataset.hubTarget);
            });
        });

        // Tombol tutup drawer.
        (function bindHubDrawerClose() {
            var closeBtn = document.getElementById('hub-config-drawer-close');
            if (closeBtn) closeBtn.addEventListener('click', _closeHubConfigDrawer);
        })();

        // ==========================================
        // HUB SCENE LIST (Fase 3) — Sidebar daftar Hub Scene
        // Sidebar Hub kini menampilkan daftar Hub Scene (dari hubConfig.scenes),
        // bukan tab pengaturan. Klik scene mengubah window.activeHubSceneId.
        // ==========================================
        window.activeHubSceneId = window.activeHubSceneId || null;

        function _hubScenePad(n) { return (n < 10 ? '0' : '') + n; }

        function _refreshHubInspectorAvailability() {
            if (window.VNInspector && typeof window.VNInspector.refreshAvailability === 'function') {
                window.VNInspector.refreshAvailability();
            }
        }

        // ==========================================
        // TREE — node aktif & anak scene (Fase D)
        // Node aktif: { sceneId, kind: 'scene'|'menu_item'|'credits_line', index }
        // activeHubSceneId selalu = sceneId node (agar inspector availability tetap jalan).
        // ==========================================
        window.activeHubNode = window.activeHubNode || null;

        var _hubTreeCollapsed = (function () {
            try { return new Set(JSON.parse(localStorage.getItem('vn_hub_tree_collapsed') || '[]')); } catch (e) { return new Set(); }
        })();
        function _saveHubTreeCollapsed() {
            try { localStorage.setItem('vn_hub_tree_collapsed', JSON.stringify(Array.from(_hubTreeCollapsed))); } catch (e) {}
        }

        // Anak sebuah scene = bagian yang sudah ada di data legacy.
        // === Parent/child code-first: elemen bertanda data-node di dalam partial ===
        // Cache: sceneId -> [{name, depth, tag}]. Diisi dari parsing partial (DOMParser).
        var _hubNodeCache = {};

        function parseHubNodes(html) {
            if (!html || typeof html !== 'string') return [];
            var out = [];
            try {
                var doc = new DOMParser().parseFromString('<div id="__hubnoderoot">' + html + '</div>', 'text/html');
                var root = doc.getElementById('__hubnoderoot');
                if (!root) return [];
                (function walk(el, depth) {
                    var kids = el.children;
                    for (var i = 0; i < kids.length; i++) {
                        var c = kids[i];
                        if (c.hasAttribute('data-node')) {
                            // Tangkap juga data-action/target/href/bind + teks tampil — dulu hanya
                            // {name,depth,tag} disimpan, jadi tombol hand-coded MUNCUL di tree tapi
                            // propertinya tak terlihat sama sekali. Lihat _renderHubNodeInspector.
                            var text = (c.textContent || '').replace(/\s+/g, ' ').trim();
                            out.push({
                                name: c.getAttribute('data-node') || '(node)',
                                depth: depth,
                                tag: c.tagName.toLowerCase(),
                                action: c.getAttribute('data-action') || null,
                                target: c.getAttribute('data-target') || null,
                                href: c.getAttribute('data-href') || null,
                                bind: c.getAttribute('data-bind') || null,
                                bindAsset: c.hasAttribute('data-bind-asset'),
                                text: text.length > 60 ? (text.slice(0, 57) + '...') : text
                            });
                            walk(c, depth + 1);
                        } else {
                            walk(c, depth);
                        }
                    }
                })(root, 0);
            } catch (e) { /* parse gagal → kosong */ }
            return out;
        }

        // Perbarui cache node sebuah scene dari konten partial-nya, lalu render ulang tree.
        function refreshSceneNodes(sceneId, content) {
            if (!sceneId) return;
            _hubNodeCache[sceneId] = parseHubNodes(content);
            if (typeof renderHubSceneList === 'function') renderHubSceneList();
        }
        window.refreshSceneNodes = refreshSceneNodes;

        // Scene punya <img data-bind-asset> (cover novel diisi otomatis oleh
        // vn-hub-runtime.js saat boot) — dipakai Inspector supaya "Background Scene"
        // tak bilang "(tanpa background)" pada scene yang visualnya sudah berlatar cover.
        function _sceneHasAutoCoverBinding(sceneId) {
            return (_hubNodeCache[sceneId] || []).some(function (n) { return n.tag === 'img' && n.bindAsset; });
        }

        // Muat & parse SEMUA partial scene (sekali, saat Hub dibuka) untuk isi cache.
        async function loadAllSceneNodes(novelTitle) {
            var cfg = window.hubConfig || {};
            if (cfg.codeScenes !== true || cfg.hubPartials !== true) return;
            var scenes = Array.isArray(cfg.scenes) ? cfg.scenes : [];
            for (var i = 0; i < scenes.length; i++) {
                try {
                    var r = await ipcRenderer.invoke('hub:read-scene-partial', { novelTitle: novelTitle, sceneId: scenes[i].id });
                    if (r && r.success) _hubNodeCache[scenes[i].id] = parseHubNodes(r.content || '');
                } catch (e) { /* skip */ }
            }
            renderHubSceneList();
        }
        window.loadAllSceneNodes = loadAllSceneNodes;

        // === Sinkronisasi editan eksternal (VS Code) ===
        // Saat app kembali fokus/terlihat, muat ulang cache node scene agar
        // sidebar Hub tercermin perubahan dari VS Code. Reload editor file
        // (hub.css/js/html) ditangani sendiri oleh window Hub Code Editor
        // (lihat hubCodeEditorWindow.js), karena editor itu kini berjalan
        // di window/process terpisah.
        (function initExternalEditSync() {
            var _lastSync = 0;
            async function syncExternal() {
                if (!window.currentlyEditingNovel) return;
                if (Date.now() - _lastSync < 400) return;
                _lastSync = Date.now();
                var cfg = window.hubConfig || {};
                if (cfg.codeScenes === true && typeof loadAllSceneNodes === 'function') {
                    await loadAllSceneNodes(window.currentlyEditingNovel);
                }
            }
            window.addEventListener('focus', syncExternal);
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') syncExternal();
            });
        })();

        function getSceneChildren(scene) {
            var cfg = window.hubConfig || {};
            // Code-first: child = elemen ber-data-node di partial scene (dari cache).
            if (cfg.codeScenes === true) {
                var nodes = _hubNodeCache[scene.id] || [];
                return nodes.map(function (n, i) {
                    // Label tree: nama node + petunjuk singkat (action terdeteksi, atau teks
                    // tampilnya) — dulu cuma nama data-node polos, tak kelihatan itu tombol apa.
                    var hint = n.action ? ('[' + n.action + ']') : (n.text ? ('"' + n.text + '"') : '');
                    return {
                        kind: 'node', index: i, label: hint ? (n.name + ' ' + hint) : n.name,
                        nodeName: n.name, depth: n.depth || 0
                    };
                });
            }
            if (scene.type === 'main_menu') {
                var items = (cfg.menu && Array.isArray(cfg.menu.items)) ? cfg.menu.items : [];
                return items.map(function (item, i) {
                    return { kind: 'menu_item', index: i, label: (item.label && item.label.trim()) ? item.label : '(tanpa label)' };
                });
            }
            if (scene.type === 'credits') {
                var lines = (cfg.credits && Array.isArray(cfg.credits.lines)) ? cfg.credits.lines : [];
                return lines.map(function (line, i) {
                    return { kind: 'credits_line', index: i, label: line.type === 'separator' ? '— pemisah —' : ((line.text && line.text.trim()) ? line.text : '(kosong)') };
                });
            }
            return [];
        }

        function _isActiveNode(sceneId, kind, index) {
            var n = window.activeHubNode;
            if (!n || n.sceneId !== sceneId || n.kind !== kind) return false;
            if (kind === 'scene') return true;
            return n.index === index;
        }

        function renderHubSceneList() {
            var list = document.getElementById('hub-scene-list');
            if (!list) return;
            var cfg = window.hubConfig || {};
            var scenes = Array.isArray(cfg.scenes) ? cfg.scenes.slice() : [];
            scenes.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

            // Code-first (Pendekatan A): hubType 'custom' TAPI scenes[] adalah section
            // nyata di hub.html. Render sebagai daftar scene biasa (tanpa placeholder).
            var isCodeFirst = cfg.codeScenes === true;

            // CTA template relevan untuk Generated Hub dan code-first (bukan Custom legacy).
            var templateCta = document.getElementById('hub-pick-template-btn');
            if (templateCta) templateCta.style.display = (cfg.hubType === 'custom' && !isCodeFirst) ? 'none' : '';

            // Validasi: jika scene aktif tidak ada lagi, kosongkan.
            var activeStillExists = scenes.some(function (s) { return s.id === window.activeHubSceneId; });
            if (!activeStillExists) { window.activeHubSceneId = null; window.activeHubNode = null; }

            list.innerHTML = '';

            // Mode Custom Hub legacy (tanpa codeScenes): tampilkan item runtime khusus.
            if (cfg.hubType === 'custom' && !isCodeFirst) {
                var customEl = document.createElement('div');
                customEl.className = 'hub-scene-custom-runtime';
                customEl.innerHTML =
                    '<span class="hub-scene-custom-label">Custom Hub Runtime</span>' +
                    '<span class="hub-scene-custom-desc">Output berasal dari hub.html. Edit lewat Advanced / VS Code.</span>';
                list.appendChild(customEl);
                if (scenes.length === 0) { _refreshHubInspectorAvailability(); return; }
            }

            if (scenes.length === 0) {
                var empty = document.createElement('div');
                empty.className = 'hub-scene-empty';
                empty.textContent = 'Belum ada Hub Scene. Buat scene pertama untuk mulai mendesain Hub.';
                list.appendChild(empty);
                _refreshHubInspectorAvailability();
                return;
            }

            scenes.forEach(function (scene, i) {
                var meta = (VN.HubScenes && VN.HubScenes.sceneTypeMeta(scene.type)) || null;
                var badgeLabel = meta ? meta.label : scene.type;
                var statusOn = scene.enabled !== false;
                // Generated Hub: layar terminal (info/blank) selalu ada → tak bisa dihapus.
                // Code-first: tiap scene adalah <section> nyata (boleh banyak, termasuk
                // blank/info) → semuanya bisa dihapus.
                var deletable = isCodeFirst ? true : (scene.type !== 'info' && scene.type !== 'blank');
                var children = getSceneChildren(scene);
                var hasChildren = children.length > 0;
                var collapsed = _hubTreeCollapsed.has(scene.id);

                var item = document.createElement('div');
                item.className = 'hub-scene-item';
                item.dataset.sceneId = scene.id;
                item.dataset.nodeKind = 'scene';
                if (_isActiveNode(scene.id, 'scene', null)) item.classList.add('active');
                if (!statusOn) item.classList.add('disabled');
                item.innerHTML =
                    (hasChildren
                        ? '<button type="button" class="hub-scene-chevron" title="Lipat/buka">' + (collapsed ? '▸' : '▾') + '</button>'
                        : '<span class="hub-scene-chevron-spacer"></span>') +
                    '<span class="hub-scene-item-index">' + _hubScenePad(i + 1) + '</span>' +
                    '<div class="hub-scene-item-main">' +
                        '<span class="hub-scene-item-name">' + escapeHTML(scene.name || badgeLabel) + '</span>' +
                        '<span class="hub-scene-type-badge">' + escapeHTML(badgeLabel) + '</span>' +
                    '</div>' +
                    '<span class="hub-scene-item-status ' + (statusOn ? 'on' : 'off') + '" title="' +
                        (statusOn ? 'Aktif' : 'Nonaktif') + '">' + (statusOn ? '●' : '○') + '</span>' +
                    (deletable ? '<button type="button" class="hub-scene-item-del" title="Hapus scene" aria-label="Hapus scene">&times;</button>' : '');
                list.appendChild(item);

                if (hasChildren && !collapsed) {
                    var childWrap = document.createElement('div');
                    childWrap.className = 'hub-scene-children';
                    children.forEach(function (child) {
                        var childEl = document.createElement('div');
                        childEl.className = 'hub-scene-child';
                        childEl.dataset.sceneId = scene.id;
                        childEl.dataset.nodeKind = child.kind;
                        childEl.dataset.nodeIndex = child.index;
                        if (child.nodeName) childEl.dataset.nodeName = child.nodeName;
                        if (child.depth) childEl.style.marginLeft = (child.depth * 14) + 'px';
                        if (_isActiveNode(scene.id, child.kind, child.index)) childEl.classList.add('active');
                        // Node code-first tidak dihapus lewat tree (navigasi saja).
                        var delBtn = (child.kind === 'node') ? '' :
                            '<button type="button" class="hub-scene-item-del hub-scene-child-del" title="Hapus" aria-label="Hapus">&times;</button>';
                        childEl.innerHTML =
                            '<span class="hub-scene-child-bullet">' + (child.kind === 'node' ? '◦' : '•') + '</span>' +
                            '<span class="hub-scene-child-label">' + escapeHTML(child.label) + '</span>' +
                            delBtn;
                        childWrap.appendChild(childEl);
                    });
                    list.appendChild(childWrap);
                }
            });

            _applyHubPreviewHighlight();
            _refreshHubInspectorAvailability();
        }

        // Pilih node (scene atau anak). activeHubSceneId mengikuti scene induk.
        function setActiveHubNode(node) {
            window.activeHubNode = node || null;
            window.activeHubSceneId = node ? node.sceneId : null;
            renderHubSceneList();
            VN.Events.emit('hub:activeSceneChanged', { sceneId: window.activeHubSceneId, node: window.activeHubNode });
            _refreshHubInspectorAvailability();
            if (node && window.VNInspector && typeof window.VNInspector.show === 'function') {
                window.VNInspector.show();
            }
            scheduleHubPreviewRefresh();
            // Mode Per-scene: kunci preview ke scene yang baru dipilih.
            if (window.activeHubSceneId && _hubPreviewFrame && _hubPreviewFrame.getMode &&
                _hubPreviewFrame.getMode() === 'per-scene') {
                _driveHubPreviewToScene(window.activeHubSceneId);
            }
            _maybeRevealCodeScene(node);
        }

        // Code-first (Pendekatan A2): pada novel codeScenes, klik sebuah Hub Scene
        // membuka tab Advanced dan melompat ke <section data-scene-id="..."> miliknya,
        // sehingga "klik scene → lihat kodenya" terpenuhi. Tidak berlaku untuk Generated
        // Hub (codeScenes != true) maupun untuk klik anak (menu item/credits line).
        function _maybeRevealCodeScene(node) {
            var cfg = window.hubConfig || {};
            if (cfg.codeScenes !== true) return;
            if (!node || !node.sceneId) return;
            if (!window.__hubCodeEditorOpen) return; // editor terpisah belum dibuka → tak ada yang perlu di-reveal
            var sceneId = node.sceneId;
            var sc = (Array.isArray(cfg.scenes) ? cfg.scenes : []).filter(function (s) { return s && s.id === sceneId; })[0];
            var label = sc ? (sc.name || sceneId) : sceneId;

            // Klik CHILD node → load partial scene-nya (bila belum aktif) lalu lompat ke data-node.
            if (node.kind === 'node' && node.nodeName && cfg.hubPartials === true) {
                ipcRenderer.send('hub-code-editor:load-scene', {
                    novelTitle: currentlyEditingNovel, sceneId: sceneId, label: label, nodeName: node.nodeName
                });
                return;
            }
            if (node.kind !== 'scene') return; // child legacy non-node: tak diproses code-first

            // Klik SCENE → B2: buka file partial; A2 fallback monolith: lompat ke <section>.
            ipcRenderer.send('hub-code-editor:load-scene', {
                novelTitle: currentlyEditingNovel, sceneId: sceneId, label: label
            });
        }

        function setActiveHubScene(sceneId) {
            setActiveHubNode(sceneId ? { sceneId: sceneId, kind: 'scene', index: null } : null);
        }

        // Hapus anak (tombol menu / baris credits).
        function deleteHubSceneChild(sceneId, kind, index) {
            var cfg = window.hubConfig;
            if (!cfg) return;
            if (kind === 'menu_item' && cfg.menu && Array.isArray(cfg.menu.items)) cfg.menu.items.splice(index, 1);
            else if (kind === 'credits_line' && cfg.credits && Array.isArray(cfg.credits.lines)) cfg.credits.lines.splice(index, 1);
            else return;
            if (_isActiveNode(sceneId, kind, index)) {
                setActiveHubNode({ sceneId: sceneId, kind: 'scene', index: null });
            } else {
                renderHubSceneList();
                scheduleHubPreviewRefresh();
            }
            scheduleHubSnapshot();
        }

        // Event delegation: chevron lipat/buka, ✕ hapus, klik node → pilih.
        (function initHubSceneListDelegation() {
            var list = document.getElementById('hub-scene-list');
            if (!list) return;
            list.addEventListener('click', function (e) {
                var chev = e.target.closest('.hub-scene-chevron');
                if (chev) {
                    e.stopPropagation();
                    var sItem = chev.closest('.hub-scene-item');
                    var sid = sItem && sItem.dataset.sceneId;
                    if (sid) {
                        if (_hubTreeCollapsed.has(sid)) _hubTreeCollapsed.delete(sid); else _hubTreeCollapsed.add(sid);
                        _saveHubTreeCollapsed();
                        renderHubSceneList();
                    }
                    return;
                }
                var delBtn = e.target.closest('.hub-scene-item-del');
                if (delBtn) {
                    e.stopPropagation();
                    var childOwner = delBtn.closest('.hub-scene-child');
                    if (childOwner) {
                        deleteHubSceneChild(childOwner.dataset.sceneId, childOwner.dataset.nodeKind, parseInt(childOwner.dataset.nodeIndex, 10));
                        return;
                    }
                    var sceneOwner = delBtn.closest('.hub-scene-item');
                    if (sceneOwner && sceneOwner.dataset.sceneId) deleteHubScene(sceneOwner.dataset.sceneId);
                    return;
                }
                var child = e.target.closest('.hub-scene-child');
                if (child) {
                    setActiveHubNode({ sceneId: child.dataset.sceneId, kind: child.dataset.nodeKind, index: parseInt(child.dataset.nodeIndex, 10), nodeName: child.dataset.nodeName });
                    return;
                }
                var item = e.target.closest('.hub-scene-item');
                if (!item || !item.dataset.sceneId) return;
                setActiveHubNode({ sceneId: item.dataset.sceneId, kind: 'scene', index: null });
            });
        })();

        // Hapus Hub Scene = kebalikan createHubSceneOfType: petakan ke field lama,
        // lalu rebuild. Layar utama (info/blank) tak bisa dihapus. Toast + Undo.
        function _deepCloneCfg(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }

        function deleteHubScene(sceneId) {
            var cfg = window.hubConfig;
            if (!cfg || !VN.HubScenes) return;
            var scene = (Array.isArray(cfg.scenes) ? cfg.scenes : []).filter(function (s) { return s.id === sceneId; })[0];
            if (!scene) return;
            // Code-first (A3): tiap scene = <section> nyata (boleh banyak, termasuk
            // blank/info) → hapus dengan membuang <section> dari hub.html via backend.
            if (cfg.codeScenes === true) { removeCodeHubScene(sceneId, scene); return; }
            // Generated Hub: layar terminal (info/blank) selalu ada → tak bisa dihapus.
            if (scene.type === 'info' || scene.type === 'blank') {
                VN.Toast.info('Layar utama tak bisa dihapus — pakai Create Scene untuk menggantinya.');
                return;
            }
            var backup = _deepCloneCfg(cfg);
            switch (scene.type) {
                case 'splash':
                    var idx = parseInt(String(sceneId).replace('hub_scene_splash_', ''), 10) - 1;
                    if (Array.isArray(cfg.bootSequence) && idx >= 0 && idx < cfg.bootSequence.length) cfg.bootSequence.splice(idx, 1);
                    break;
                case 'warning':
                    if (cfg.warningScreen) { cfg.warningScreen.enabled = false; cfg.warningScreen.text = ''; }
                    break;
                case 'credits':
                    if (cfg.credits) cfg.credits.lines = [];
                    break;
                case 'main_menu':
                    if (cfg.menu) cfg.menu.items = [];
                    break;
                default:
                    cfg.scenes = (cfg.scenes || []).filter(function (s) { return s.id !== sceneId; });
                    break;
            }
            VN.HubScenes.normalize(cfg, { rebuildFromLegacy: true });
            window.hubConfig = cfg;
            if (window.activeHubSceneId === sceneId) window.activeHubSceneId = null;
            _syncHubLegacyForm();
            renderHubSceneList();
            scheduleHubSnapshot();
            scheduleHubPreviewRefresh();

            VN.Toast.show('Scene "' + (scene.name || scene.type) + '" dihapus.', {
                type: 'success', duration: 6000,
                actions: backup ? [{
                    label: 'Undo',
                    onClick: function () {
                        Object.keys(hubConfig).forEach(function (k) { delete hubConfig[k]; });
                        Object.assign(hubConfig, _deepCloneCfg(backup));
                        window.hubConfig = hubConfig;
                        _syncHubLegacyForm();
                        renderHubSceneList();
                        scheduleHubSnapshot();
                        scheduleHubPreviewRefresh();
                        VN.Toast.info('Penghapusan dibatalkan.');
                    }
                }] : []
            });
        }
        window.deleteHubScene = deleteHubScene;

        // Tombol "🎯 Pilih Template Hub" — CTA menonjol untuk membuka template picker.
        // (Masukan user: default + tombol jelas.) Picker tinggal di Hub Overview.
        (function initPickTemplateBtn() {
            var btn = document.getElementById('hub-pick-template-btn');
            if (!btn) return;
            btn.addEventListener('click', function () {
                // Tak ada lagi gerbang "mode": template berlaku untuk hub apa pun.
                // Cukup buka panel Template (tempat picker tinggal permanen).
                var overviewBtn = document.querySelector('.hub-nav-btn[data-hub-target="overview"]');
                if (overviewBtn) overviewBtn.click();
                var picker = document.getElementById('hub-template-picker');
                if (picker) picker.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        })();

        // ==========================================
        // CREATE HUB SCENE (Fase 4) — picker tipe + pembuatan via jembatan legacy
        // ==========================================

        // Sinkronkan panel "Pengaturan Hub" (demoted) dari hubConfig setelah mutasi.
        function _syncHubLegacyForm() {
            if (typeof renderBootSequenceList === 'function') renderBootSequenceList();
            if (typeof renderMenuBuilderList === 'function') renderMenuBuilderList();
            if (typeof renderCreditsLinesList === 'function') renderCreditsLinesList();
            var cfg = window.hubConfig || {};
            var we = document.getElementById('warning-screen-enabled');
            if (we) we.checked = !!(cfg.warningScreen && cfg.warningScreen.enabled);
            var wt = document.getElementById('warning-screen-text');
            if (wt && cfg.warningScreen) wt.value = cfg.warningScreen.text || '';
        }

        // Buat Hub Scene tipe tertentu dengan memetakan ke field lama (jembatan),
        // agar runtime & preview ikut menampilkannya (bukan sekadar entri di list).
        // Catatan struktur legacy: splash = banyak (bootSequence), warning/credits = tunggal,
        // dan main_menu/info/blank = "layar utama" yang saling eksklusif.
        function createHubSceneOfType(type) {
            var cfg = window.hubConfig;
            if (!cfg || !VN.HubScenes) return;
            // Code-first (A3a): tambah scene = sisipkan <section> ke hub.html via backend.
            if (cfg.codeScenes === true) { createCodeHubScene(type); return; }
            if (cfg.hubType === 'custom') {
                VN.Toast.warning('Beralih ke Generated Hub untuk menambah scene.');
                return;
            }

            // Pastikan kontainer field lama ada.
            if (!Array.isArray(cfg.bootSequence)) cfg.bootSequence = [];
            if (!cfg.warningScreen || typeof cfg.warningScreen !== 'object') cfg.warningScreen = { enabled: false, text: '', style: 'default' };
            if (!cfg.menu || typeof cfg.menu !== 'object') cfg.menu = { bgm: '', layout: '', background: { type: '', src: '' }, items: [] };
            if (!Array.isArray(cfg.menu.items)) cfg.menu.items = [];
            if (!cfg.credits || typeof cfg.credits !== 'object') cfg.credits = { lines: [] };
            if (!Array.isArray(cfg.credits.lines)) cfg.credits.lines = [];

            var selectId = null;
            var infoMsg = '';
            var clearedMenuBackup = null;

            switch (type) {
                case 'splash':
                    cfg.bootSequence.push({ type: 'image', src: '', duration: 3000 });
                    selectId = 'hub_scene_splash_' + cfg.bootSequence.length;
                    infoMsg = 'Scene Splash ditambahkan. Pilih file di panel Opening Flow.';
                    break;
                case 'warning':
                    if (cfg.warningScreen.enabled === true || (cfg.warningScreen.text || '').trim()) {
                        infoMsg = 'Scene Warning sudah ada.';
                    } else {
                        cfg.warningScreen.enabled = true;
                        if (!(cfg.warningScreen.text || '').trim()) cfg.warningScreen.text = 'Konten sensitif. Klik untuk melanjutkan.';
                        infoMsg = 'Scene Warning ditambahkan.';
                    }
                    selectId = 'hub_scene_warning';
                    break;
                case 'credits':
                    if (cfg.credits.lines.length > 0) {
                        infoMsg = 'Scene Credits sudah ada.';
                    } else {
                        cfg.credits.lines.push({ type: 'heading', text: 'Credits' });
                        infoMsg = 'Scene Credits ditambahkan. Edit baris di panel Screens.';
                    }
                    selectId = 'hub_scene_credits';
                    break;
                case 'main_menu':
                    if (cfg.menu.items.length === 0) {
                        cfg.menu.items.push({ label: 'Mulai Cerita', action: 'start_game', payload: '' });
                    }
                    selectId = 'hub_scene_main_menu';
                    infoMsg = 'Main Menu diaktifkan sebagai layar utama.';
                    break;
                case 'info':
                case 'blank':
                    if (cfg.menu.items.length > 0) {
                        clearedMenuBackup = JSON.parse(JSON.stringify(cfg.menu.items));
                        cfg.menu.items = [];
                    }
                    cfg.hubLayout = (type === 'blank') ? 'blank' : 'info';
                    selectId = (type === 'blank') ? 'hub_scene_blank' : 'hub_scene_info';
                    infoMsg = (type === 'blank') ? 'Layar utama diatur ke Hub Kosong.' : 'Layar utama diatur ke Info Novel.';
                    break;
                default:
                    return;
            }

            VN.HubScenes.normalize(cfg, { rebuildFromLegacy: true });
            window.hubConfig = cfg;
            _syncHubLegacyForm();
            renderHubSceneList();
            if (selectId) setActiveHubScene(selectId);
            scheduleHubSnapshot();
            scheduleHubPreviewRefresh();

            if (clearedMenuBackup) {
                VN.Toast.show(infoMsg + ' Item Main Menu lama dikosongkan.', {
                    type: 'success',
                    duration: 6000,
                    actions: [{
                        label: 'Undo',
                        onClick: function () {
                            cfg.menu.items = clearedMenuBackup;
                            VN.HubScenes.normalize(cfg, { rebuildFromLegacy: true });
                            window.hubConfig = cfg;
                            _syncHubLegacyForm();
                            renderHubSceneList();
                            setActiveHubScene('hub_scene_main_menu');
                            scheduleHubSnapshot();
                            scheduleHubPreviewRefresh();
                            VN.Toast.info('Item Main Menu dipulihkan.');
                        }
                    }]
                });
            } else {
                VN.Toast.success(infoMsg);
            }
        }

        // Code-first (A3a): buat scene baru dengan menyisipkan <section> ke hub.html.
        // Edit yang belum disimpan di-flush dulu agar disk = editor sebelum penyisipan.
        async function createCodeHubScene(type) {
            var novelTitle = currentlyEditingNovel;
            if (!novelTitle) return;
            var name = (VN.HubScenes && typeof VN.HubScenes.defaultNameForType === 'function')
                ? VN.HubScenes.defaultNameForType(type) : type;
            var res;
            try {
                // Flush adalah bagian dari transaksi authoring: bila draft code gagal
                // disimpan, mutasi struktur tidak boleh menyentuh disk versi lama.
                await VN.Utils.invokeChecked(ipcRenderer, 'hub-code-editor:flush-if-dirty');
                res = await VN.Utils.invokeChecked(ipcRenderer, 'hub:add-code-scene', {
                    novelTitle: novelTitle, type: type, name: name
                });
                if (!res || !res.config || !res.scene) {
                    throw new Error('Respons penambahan scene tidak lengkap.');
                }
            } catch (error) {
                VN.Toast.error('Gagal menambah scene: ' + (error && error.message || 'Unknown error'));
                return false;
            }
            hubConfig = res.config;
            window.hubConfig = hubConfig;
            refreshDetachedCodeEditor();   // minta editor terpisah (bila terbuka) reload dari disk
            renderHubSceneList();
            setActiveHubScene(res.scene.id);         // buka Advanced + lompat ke section
            scheduleHubSnapshot();
            VN.Toast.success('Scene "' + res.scene.name + '" ditambahkan (hub/scenes/' + res.scene.id + '.html).');
            return true;
        }

        // Code-first (A3): hapus scene = buang <section> dari hub.html (+ scenes[]).
        async function removeCodeHubScene(sceneId, scene) {
            var novelTitle = currentlyEditingNovel;
            if (!novelTitle) return;
            var res;
            try {
                await VN.Utils.invokeChecked(ipcRenderer, 'hub-code-editor:flush-if-dirty');
                res = await VN.Utils.invokeChecked(ipcRenderer, 'hub:remove-code-scene', {
                    novelTitle: novelTitle, sceneId: sceneId
                });
                if (!res || !res.config || !res.snapshot) {
                    throw new Error('Respons penghapusan scene tidak lengkap.');
                }
            } catch (error) {
                VN.Toast.error('Gagal menghapus scene: ' + (error && error.message || 'Unknown error'));
                return false;
            }
            var snapshot = res.snapshot;
            hubConfig = res.config;
            window.hubConfig = hubConfig;
            if (window.activeHubSceneId === sceneId) window.activeHubSceneId = null;
            refreshDetachedCodeEditor();
            renderHubSceneList();
            scheduleHubSnapshot();
            VN.Toast.show('Scene "' + (scene && scene.name || sceneId) + '" dihapus.', {
                type: 'success', duration: 6000,
                actions: [{
                    label: 'Undo',
                    onClick: async function () {
                        var r;
                        try {
                            await VN.Utils.invokeChecked(ipcRenderer, 'hub-code-editor:flush-if-dirty');
                            r = await VN.Utils.invokeChecked(ipcRenderer, 'hub:restore-code-state', {
                                novelTitle: novelTitle, snapshot: snapshot
                            });
                            if (!r || !r.config) throw new Error('Respons pemulihan scene tidak lengkap.');
                        } catch (error) {
                            VN.Toast.error('Gagal memulihkan scene: ' + (error && error.message || 'Unknown error'));
                            return false;
                        }
                        hubConfig = r.config;
                        window.hubConfig = hubConfig;
                        refreshDetachedCodeEditor();
                        renderHubSceneList();
                        VN.Toast.info('Penghapusan dibatalkan.');
                        return true;
                    }
                }]
            });
            return true;
        }

        // CATATAN PENCABUTAN (UX-C01, Tahap 5).
        // `applyCodeTemplate()` DICABUT bersama HUB_TEMPLATES registry. Ia satu-
        // satunya pemanggil IPC `hub:apply-code-template`, dan satu-satunya
        // pemakainya adalah kartu registry di picker yang juga dicabut. Empat
        // template registry itu berbeda hanya pada ada/tidaknya scene splash &
        // credits - sesuatu yang sudah bisa diatur lewat "Tambah Scene", jadi
        // memilih di antaranya tak pernah menghasilkan tampilan yang berbeda.
        // Penerapan template kini SATU jalur: pustaka folder (applyFolderTemplate).

        // Terapkan template dari PUSTAKA FOLDER (aset/game/hub-templates/<id>/) —
        // sejak pencabutan di atas, ini SATU-SATUNYA jalur penerapan template Hub.
        // Ia menyalin markup scene + hub.css + hub.js dari folder template sehingga
        // gaya benar-benar bervariasi. Selalu menghasilkan hub code-first;
        // hub.css/hub.js DITIMPA (bisa di-Undo).
        async function applyFolderTemplate(templateId, label) {
            var novelTitle = currentlyEditingNovel;
            if (!novelTitle || !templateId) return;
            var ok = await showConfirmation('Terapkan template "' + (label || templateId) +
                '"? Hub akan menjadi mode code-first — hub.html, hub.css, dan markup tiap scene ' +
                'ditulis ulang dari template. Perubahan ini bisa di-Undo.');
            if (!ok) return;
            var res;
            try {
                await VN.Utils.invokeChecked(ipcRenderer, 'hub-code-editor:flush-if-dirty');
                res = await VN.Utils.invokeChecked(ipcRenderer, 'hub:apply-code-template-folder', {
                    novelTitle: novelTitle, templateId: templateId, title: novelTitle
                });
                if (!res || !res.config || !res.snapshot) {
                    throw new Error('Respons penerapan template folder tidak lengkap.');
                }
            } catch (error) {
                VN.Toast.error('Gagal menerapkan template: ' + (error && error.message || 'Unknown error'));
                return false;
            }
            var snapshot = res.snapshot;
            hubConfig = res.config;
            window.hubConfig = hubConfig;
            refreshDetachedCodeEditor();
            window.activeHubSceneId = null;
            renderHubSceneList();
            updateHubOverviewState();
            scheduleHubSnapshot();
            reloadHubPreview(); // FB11: muat ulang hub.html/hub.css baru di preview
            VN.Toast.show('Template "' + (res.label || label || templateId) + '" diterapkan (code-first).', {
                type: 'success', duration: 6000,
                actions: [{
                    label: 'Undo',
                    onClick: async function () {
                        var r;
                        try {
                            await VN.Utils.invokeChecked(ipcRenderer, 'hub-code-editor:flush-if-dirty');
                            r = await VN.Utils.invokeChecked(ipcRenderer, 'hub:restore-code-state', {
                                novelTitle: novelTitle, snapshot: snapshot
                            });
                            if (!r || !r.config) throw new Error('Respons pemulihan template tidak lengkap.');
                        } catch (error) {
                            VN.Toast.error('Gagal memulihkan template: ' + (error && error.message || 'Unknown error'));
                            return false;
                        }
                        hubConfig = r.config;
                        window.hubConfig = hubConfig;
                        refreshDetachedCodeEditor();
                        window.activeHubSceneId = null;
                        renderHubSceneList();
                        updateHubOverviewState();
                        reloadHubPreview(); // FB11: preview kembali ke hub.html sebelum template
                        VN.Toast.info('Template dibatalkan, hub dipulihkan.');
                        return true;
                    }
                }]
            });
            return true;
        }
        window.applyFolderTemplate = applyFolderTemplate;

        // Modal picker tipe Hub Scene (dibangun sekali, dipasang ke body).
        (function initHubSceneTypePicker() {
            var modal = document.createElement('div');
            modal.id = 'hub-scene-type-modal';
            modal.className = 'hub-scene-type-modal';
            modal.style.display = 'none';
            modal.innerHTML =
                '<div class="hub-scene-type-dialog">' +
                    '<div class="hub-scene-type-header">' +
                        '<h3 class="vn-gradient-text">Buat Hub Scene</h3>' +
                        '<button type="button" class="hub-scene-type-close" aria-label="Tutup">&times;</button>' +
                    '</div>' +
                    '<p class="hub-scene-type-hint">Pilih tipe layar Hub yang ingin dibuat.</p>' +
                    '<div class="hub-scene-type-grid"></div>' +
                '</div>';
            document.body.appendChild(modal);

            var grid = modal.querySelector('.hub-scene-type-grid');
            var ALLOWED = ['main_menu', 'splash', 'warning', 'info', 'credits', 'blank'];
            var types = (VN.HubScenes ? VN.HubScenes.sceneTypes() : []).filter(function (t) {
                return ALLOWED.indexOf(t.value) >= 0;
            });
            types.sort(function (a, b) { return ALLOWED.indexOf(a.value) - ALLOWED.indexOf(b.value); });
            types.forEach(function (t) {
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'hub-scene-type-card';
                card.dataset.sceneType = t.value;
                card.innerHTML =
                    '<span class="hub-scene-type-icon">' + escapeHTML(t.icon || '') + '</span>' +
                    '<span class="hub-scene-type-name">' + escapeHTML(t.label) + '</span>' +
                    '<span class="hub-scene-type-desc">' + escapeHTML(t.description || '') + '</span>';
                grid.appendChild(card);
            });

            function closeModal() { modal.style.display = 'none'; }
            window._openHubSceneTypePicker = function () { modal.style.display = 'flex'; };

            modal.querySelector('.hub-scene-type-close').addEventListener('click', closeModal);
            modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
            grid.addEventListener('click', function (e) {
                var card = e.target.closest('.hub-scene-type-card');
                if (!card) return;
                closeModal();
                createHubSceneOfType(card.dataset.sceneType);
            });
            document.addEventListener('keydown', function (e) {
                if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
            });
        })();

        // Tombol "+ Create Scene" → buka picker tipe.
        (function initCreateHubSceneBtn() {
            var btn = document.getElementById('create-hub-scene-btn');
            if (!btn) return;
            btn.addEventListener('click', function () {
                if (window.hubConfig && window.hubConfig.hubType === 'custom' && window.hubConfig.codeScenes !== true) {
                    VN.Toast.warning('Mode Custom Hub memakai hub.html. Beralih ke Generated Hub untuk menambah scene.');
                    return;
                }
                if (typeof window._openHubSceneTypePicker === 'function') window._openHubSceneTypePicker();
            });
        })();

        // Refresh terdebounce: turunkan ulang scene dari field lama yang baru diedit
        // agar daftar tetap mencerminkan preview (mis. menambah item menu mengubah
        // layar terminal Info → Main Menu).
        var _hubSceneListTimer = null;
        function scheduleHubSceneListRefresh() {
            clearTimeout(_hubSceneListTimer);
            _hubSceneListTimer = setTimeout(function () {
                if (VN.HubScenes && window.hubConfig) {
                    VN.HubScenes.normalize(window.hubConfig, { rebuildFromLegacy: true });
                }
                renderHubSceneList();
            }, VN.Config.PREVIEW_DEBOUNCE_MS);
        }

        window.renderHubSceneList = renderHubSceneList;
        window.setActiveHubScene = setActiveHubScene;

        // ==========================================
        // HUB SCENE INSPECTOR (Fase 7) — edit properti scene per-tipe.
        // Metadata (name/enabled) → objek scene (dipertahankan normalize). Properti
        // spesifik → field lama (warningScreen/menu/bootSequence) agar runtime & preview
        // ikut berubah. Dipanggil oleh inspectorPanel.renderHubSceneInspector.
        // ==========================================
        function _inspRow(labelText) {
            var row = document.createElement('div');
            row.className = 'inspector-field';
            if (labelText) {
                var label = document.createElement('label');
                label.className = 'inspector-field-label';
                label.textContent = labelText;
                row.appendChild(label);
            }
            return row;
        }
        function _inspText(label, value, onInput) {
            var row = _inspRow(label);
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'inspector-input';
            input.value = value || '';
            input.addEventListener('input', function () { onInput(input.value); });
            row.appendChild(input);
            return row;
        }
        function _inspTextarea(label, value, onInput) {
            var row = _inspRow(label);
            var ta = document.createElement('textarea');
            ta.className = 'inspector-input inspector-textarea';
            ta.rows = 3;
            ta.value = value || '';
            ta.addEventListener('input', function () { onInput(ta.value); });
            row.appendChild(ta);
            return row;
        }
        function _inspNumber(label, value, onInput) {
            var row = _inspRow(label);
            var input = document.createElement('input');
            input.type = 'number';
            input.className = 'inspector-input';
            input.value = value;
            input.addEventListener('input', function () { onInput(input.value); });
            row.appendChild(input);
            return row;
        }
        function _inspCheckbox(label, checked, onChange) {
            var row = document.createElement('div');
            row.className = 'inspector-field inspector-check-row';
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'inspector-checkbox';
            input.checked = !!checked;
            input.addEventListener('change', function () { onChange(input.checked); });
            var lab = document.createElement('label');
            lab.className = 'inspector-field-label';
            lab.textContent = label;
            row.appendChild(input);
            row.appendChild(lab);
            return row;
        }
        function _inspSelect(label, options, value, onChange) {
            var row = _inspRow(label);
            var sel = document.createElement('select');
            sel.className = 'inspector-input inspector-select';
            options.forEach(function (o) {
                var op = document.createElement('option');
                op.value = o.value;
                op.textContent = o.label;
                if (o.value === value) op.selected = true;
                sel.appendChild(op);
            });
            sel.addEventListener('change', function () { onChange(sel.value); });
            row.appendChild(sel);
            return row;
        }
        function _inspReadonly(label, value) {
            var row = _inspRow(label);
            var span = document.createElement('div');
            span.className = 'inspector-readonly-value';
            span.textContent = value;
            row.appendChild(span);
            return row;
        }
        function _inspFilePicker(label, value, onPick) {
            var row = _inspRow(label);
            var wrap = document.createElement('div');
            wrap.className = 'inspector-file-row';
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'inspector-input';
            input.value = value || '';
            input.readOnly = true;
            input.placeholder = '(belum ada)';
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'inspector-pick-btn';
            btn.textContent = 'Pilih';
            btn.addEventListener('click', function () { onPick(); });
            wrap.appendChild(input);
            wrap.appendChild(btn);
            row.appendChild(wrap);
            return row;
        }
        function _inspNote(text) {
            var p = document.createElement('p');
            p.className = 'inspector-hint';
            p.textContent = text;
            return p;
        }
        function _inspWarn(text) {
            var p = document.createElement('p');
            p.className = 'inspector-warn';
            p.textContent = '⚠ ' + text;
            return p;
        }

        // UX-A03 — status "Dikelola lewat kode".
        //
        // Aturannya: kontrol yang TIDAK dibaca hub yang sedang berlaku tidak boleh
        // tampil sebagai input yang bisa diklik. Pada hub code-first, runtime bersama
        // (`vn-hub-runtime.js`) membaca DOM — `.hub-scene`, `data-scene-type`,
        // `data-duration`, `data-action`, `data-bind` — dan tak pernah menyentuh
        // `bootSequence`, `warningScreen`, `menu`, atau `credits` di hub-config.json.
        // Yang disinkronkan ke markup saat Simpan hanya NAMA scene dan BACKGROUND
        // gambar. Sisanya kalau ditampilkan sebagai field hanya akan menampung nilai
        // yang tak pernah dipakai siapa pun — persis keluhan "Background/Gaya tidak
        // terasa bekerja". Jadi di sini ia diganti keterangan + jalan masuk ke kode.
        // Tombol "Edit kode scene (Advanced)" sudah dipasang di akhir inspector untuk
        // tiap scene code-first, jadi keterangan ini cukup menjelaskan DI MANA nilainya
        // hidup — tanpa menduplikasi jalan masuknya.
        function _inspManagedByCode(container, text) {
            var row = _inspRow('Dikelola lewat kode');
            var span = document.createElement('div');
            span.className = 'inspector-readonly-value inspector-managed-by-code';
            span.textContent = text;
            row.appendChild(span);
            container.appendChild(row);
        }

        // Peran scene di alur runtime — MENCERMINKAN novel-hub.html computeSceneFlow()
        // & showTerminalScreen(): boot(splash) → warning → satu layar akhir (terminal).
        // Dipakai untuk menampilkan status jujur di Inspector. Catatan: runtime BELUM
        // membaca sceneFlow.startSceneId/transitions, jadi alur murni urutan + enabled.
        // `canToggle` hanya true untuk tipe yang efek enable/disable-nya benar-benar
        // dihormati runtime (splash & warning); terminal selalu tampil via fallback.
        // HUB_SCENE_RUNTIME_ROLE_START
        /**
         * Versi code-first: alur DITURUNKAN dari daftar scene, bukan dari
         * bootSequence/warningScreen/menu — `vn-hub-runtime.js` tak pernah membaca
         * kunci-kunci itu. Peringatan berbasis config sengaja tidak dibuat di sini:
         * isinya hidup di markup, jadi "teks peringatan kosong" atau "belum ada tombol
         * menu" akan SELALU salah untuk hub code-first (UX-A03). Satu-satunya
         * peringatan yang benar-benar dapat disimpulkan dari config adalah keadaan
         * "semua scene nonaktif".
         */
        function _hubSceneRuntimeRoleCodeFirst(cfg, scene) {
            var scenes = Array.isArray(cfg.scenes) ? cfg.scenes.slice() : [];
            scenes.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
            var aktif = scenes.filter(function (s) { return s.enabled !== false; });
            var kosong = aktif.length === 0
                ? 'Semua scene nonaktif — Hub tampil kosong saat runtime.'
                : null;

            // Sama seperti terminalScene() runtime: main_menu → info → scene terakhir.
            var terminal = aktif.filter(function (s) { return s.type === 'main_menu'; })[0] ||
                aktif.filter(function (s) { return s.type === 'info'; })[0] ||
                (aktif.length ? aktif[aktif.length - 1] : null);

            if (scene.type === 'splash' || scene.type === 'warning') {
                var boots = aktif.filter(function (s) { return s.type === 'splash' || s.type === 'warning'; });
                var pos = boots.map(function (s) { return s.id; }).indexOf(scene.id);
                var label = scene.type === 'warning' ? '⚠️ Layar Peringatan' : 'Splash / Boot';
                return {
                    role: label + (pos >= 0 ? ' #' + (pos + 1) : '') + ' (sebelum layar akhir)',
                    warn: kosong,
                    canToggle: true
                };
            }
            if (terminal && terminal.id === scene.id) {
                return { role: 'Layar Akhir — tampil setelah alur boot selesai', warn: kosong, canToggle: true };
            }
            return {
                role: 'Di luar alur otomatis — dibuka lewat tombol (data-action="goto") atau hub.js',
                warn: kosong,
                canToggle: true
            };
        }

        function _hubSceneRuntimeRole(cfg, scene) {
            // Dua runtime, dua kebenaran: Generated Hub (novel-hub.html) membaca
            // hub-config.json, hub code-first membaca markup. Menyimpulkan peran &
            // peringatan code-first dari config akan selalu meleset.
            if (cfg.codeScenes === true) return _hubSceneRuntimeRoleCodeFirst(cfg, scene);

            var boot = Array.isArray(cfg.bootSequence) ? cfg.bootSequence : [];
            var hasMenu = !!(cfg.menu && Array.isArray(cfg.menu.items) && cfg.menu.items.length > 0);
            switch (scene.type) {
                case 'splash': {
                    var idx = parseInt(String(scene.id).replace('hub_scene_splash_', ''), 10) - 1;
                    var item = boot[idx];
                    var n = isNaN(idx) ? '' : ' #' + (idx + 1);
                    return {
                        role: 'Splash / Boot' + n + ' (sebelum menu)',
                        warn: (!item || !item.src) ? 'File splash belum dipilih — scene ini dilewati saat runtime.' : null,
                        canToggle: true
                    };
                }
                case 'warning': {
                    var txt = (cfg.warningScreen && cfg.warningScreen.text) ? String(cfg.warningScreen.text).trim() : '';
                    return {
                        role: '⚠️ Layar Peringatan (sebelum layar akhir)',
                        warn: !txt ? 'Teks peringatan kosong — layar ini tidak akan muncul di runtime.' : null,
                        canToggle: true
                    };
                }
                case 'main_menu':
                    return {
                        role: '🏠 Layar Akhir — Main Menu',
                        warn: !hasMenu ? 'Belum ada tombol menu — runtime menampilkan Info Novel sebagai gantinya.' : null,
                        canToggle: false
                    };
                case 'info':
                    return { role: 'ℹ️ Layar Akhir — Info Novel (wajib)', warn: null, canToggle: false };
                case 'blank':
                    return { role: '⬜ Layar Akhir — Blank (wajib)', warn: null, canToggle: false };
                case 'credits':
                    return { role: 'Di luar alur otomatis — dibuka via tombol menu (action: credits)', warn: null, canToggle: false };
                case 'custom_code':
                    return { role: 'Scene Code-First — dirender dari hub.html', warn: null, canToggle: false };
                default:
                    return { role: scene.type, warn: null, canToggle: false };
            }
        }
        // HUB_SCENE_RUNTIME_ROLE_END

        // Background mandiri per-scene (rich-data: scene.background = {type,src,overlay}).
        // Dipakai untuk blank/info/warning. Saat SIMPAN, background bertipe 'image'
        // disuntikkan ke atribut style <section> di kode (lihat hub-scaffolder
        // .syncSceneBackgroundInMarkup) sehingga benar-benar tampil di preview/runtime.
        function _inspSceneBackground(scene, sceneId, container) {
            if (!scene.background || typeof scene.background !== 'object') scene.background = { type: '', src: '', overlay: 0.45 };
            var bg = scene.background;

            // UX-A03/D3: pada code-first hanya background GAMBAR yang benar-benar
            // sampai ke runtime (disuntik ke atribut style <section> saat Simpan).
            // Opsi "Video" tidak punya materializer, jadi ia tak ditawarkan lagi —
            // dulu memilihnya cuma menyimpan nilai yang tak pernah dirender.
            var isCodeFirst = (window.hubConfig || {}).codeScenes === true;
            // Scene bisa sudah berlatar cover lewat <img data-bind-asset> di markup
            // (template Spotlight/Panorama/Showcase) — mekanisme itu sama sekali lepas
            // dari scene.background, jadi label opsi kosong disesuaikan supaya dropdown
            // tak bilang "tanpa background" pada scene yang visualnya sudah berlatar.
            var hasAutoCover = _sceneHasAutoCoverBinding(sceneId);
            var bgOptions = [{ value: '', label: hasAutoCover ? '(pakai cover novel — otomatis)' : '(tanpa background)' }, { value: 'image', label: 'Gambar' }];
            if (!isCodeFirst || bg.type === 'video') bgOptions.push({ value: 'video', label: 'Video' });

            container.appendChild(_inspSelect('Background Scene', bgOptions,
                bg.type || '', function (v) {
                    bg.type = v;
                    if (!v) bg.src = '';
                    renderHubSceneInspector(sceneId, container);
                    scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                }));
            if (hasAutoCover && !bg.type) {
                container.appendChild(_inspNote('Scene ini sudah menampilkan cover novel secara otomatis lewat elemen bertanda data-bind-asset di kode (lihat "artwork" di sidebar). Opsi "Gambar" di atas hanya kalau kamu ingin MENIMPANYA dengan gambar lain.'));
            }
            if (isCodeFirst && bg.type === 'video') {
                // Nilai warisan dipertahankan + ditandai, bukan dihapus diam-diam.
                container.appendChild(_inspWarn('Background video tidak diterapkan ke scene code-first. Nilainya disimpan apa adanya; untuk menampilkannya, tambahkan elemen <video> lewat "Edit kode scene".'));
            } else if (bg.type === 'video') {
                container.appendChild(_inspNote('Background video untuk scene code-first diatur lewat kode (tab Advanced) — tambahkan elemen <video> di dalam scene. Background gambar diterapkan otomatis ke kode saat disimpan.'));
            }
            if (bg.type) {
                container.appendChild(_inspFilePicker('File Background', bg.src || '', async function () {
                    var filters = bg.type === 'image'
                        ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                        : [{ name: 'Video', extensions: ['mp4', 'webm'] }];
                    var result = await ipcRenderer.invoke('hub:pick-asset', { novelTitle: currentlyEditingNovel, filters: filters, prefix: 'scene_bg' });
                    if (result && result.success) {
                        bg.src = result.relativePath;
                        renderHubSceneInspector(sceneId, container);
                        scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                    } else if (result && !result.success) {
                        VN.Toast.error('Gagal menyalin file ke folder novel.');
                    }
                }));
                var ovRow = _inspRow('Gelap Overlay');
                var sliderWrap = document.createElement('div');
                sliderWrap.className = 'inspector-slider-wrap';
                var slider = document.createElement('input');
                slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.05';
                slider.className = 'inspector-slider';
                slider.value = (typeof bg.overlay === 'number' ? bg.overlay : 0.45);
                var valSpan = document.createElement('span');
                valSpan.className = 'inspector-slider-val';
                valSpan.textContent = Math.round((typeof bg.overlay === 'number' ? bg.overlay : 0.45) * 100) + '%';
                slider.addEventListener('input', function () {
                    bg.overlay = parseFloat(slider.value);
                    valSpan.textContent = Math.round(bg.overlay * 100) + '%';
                    scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                });
                sliderWrap.appendChild(slider); sliderWrap.appendChild(valSpan);
                ovRow.appendChild(sliderWrap);
                container.appendChild(ovRow);
            }
        }

        // Aksi reorder/hapus untuk node anak (dipakai inspector item tunggal).
        function _inspNodeActions(arr, index, sceneId, kind) {
            var row = document.createElement('div');
            row.className = 'inspector-node-actions';
            var up = document.createElement('button');
            up.type = 'button'; up.className = 'inspector-pick-btn'; up.textContent = '↑ Naik'; up.disabled = index === 0;
            up.addEventListener('click', function () {
                var t = arr[index - 1]; arr[index - 1] = arr[index]; arr[index] = t;
                setActiveHubNode({ sceneId: sceneId, kind: kind, index: index - 1 });
                scheduleHubSnapshot();
            });
            var down = document.createElement('button');
            down.type = 'button'; down.className = 'inspector-pick-btn'; down.textContent = '↓ Turun'; down.disabled = index === arr.length - 1;
            down.addEventListener('click', function () {
                var t = arr[index + 1]; arr[index + 1] = arr[index]; arr[index] = t;
                setActiveHubNode({ sceneId: sceneId, kind: kind, index: index + 1 });
                scheduleHubSnapshot();
            });
            var del = document.createElement('button');
            del.type = 'button'; del.className = 'inspector-pick-btn inspector-builder-del'; del.textContent = '✕ Hapus';
            del.addEventListener('click', function () { deleteHubSceneChild(sceneId, kind, index); });
            row.appendChild(up); row.appendChild(down); row.appendChild(del);
            return row;
        }

        function _renderMenuItemInspector(cfg, sceneId, index, container) {
            var item = cfg.menu && cfg.menu.items && cfg.menu.items[index];
            if (!item) { container.appendChild(_inspNote('Tombol tidak ditemukan.')); return; }
            var actionTypes = (VN.NodeRegistry && VN.NodeRegistry.C && VN.NodeRegistry.C.HUB_ACTION_TYPES) || [];
            var payloadSpecs = (VN.NodeRegistry && VN.NodeRegistry.C && VN.NodeRegistry.C.HUB_ACTION_PAYLOAD) || {};
            container.appendChild(_inspReadonly('Bagian', '🔘 Tombol Menu #' + (index + 1)));
            container.appendChild(_inspText('Label', item.label || '', function (v) {
                item.label = v; renderHubSceneList(); scheduleHubPreviewRefresh(); scheduleHubSnapshot();
            }));
            container.appendChild(_inspSelect('Action', actionTypes.map(function (o) { return { value: o.value, label: o.label }; }), item.action, function (v) {
                item.action = v;
                renderHubSceneList();
                renderHubSceneInspector(sceneId, container); // refresh hint & status payload sesuai action baru
                scheduleHubPreviewRefresh(); scheduleHubSnapshot();
            }));

            // Payload: kontrol diturunkan per-action dari HUB_ACTION_PAYLOAD.control agar
            // selaras dengan runtime (start_game→chapter, link→URL, sisanya tak memakai payload).
            var spec = payloadSpecs[item.action] || { required: false, control: 'url', hint: '' };
            if (spec.control === 'chapter') {
                var chapters = (window.availableChapters || []);
                var cur = item.payload ? String(item.payload).trim() : '';
                var stale = !!cur && chapters.indexOf(cur) === -1;
                var chapterOpts = [{ value: '', label: '(default: chapter pertama)' }];
                chapters.forEach(function (c) { chapterOpts.push({ value: c, label: c }); });
                if (stale) chapterOpts.push({ value: cur, label: '⚠ ' + cur + ' (tidak ditemukan)' });
                container.appendChild(_inspSelect('Chapter Awal', chapterOpts, cur, function (v) {
                    item.payload = v;
                    renderHubSceneList();
                    renderHubSceneInspector(sceneId, container); // refresh status chapter
                    scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                }));
                if (spec.hint) container.appendChild(_inspNote(spec.hint));
                if (stale) container.appendChild(_inspWarn('Chapter "' + cur + '" tidak ada di novel ini — runtime akan memulai chapter pertama.'));
                else if (!chapters.length) container.appendChild(_inspNote('Belum ada chapter di novel ini.'));
            } else if (spec.control === 'url') {
                var urlWarn = _inspWarn('Action "' + (item.action || '') + '" memerlukan URL tujuan, tapi masih kosong.');
                container.appendChild(_inspText('URL Tautan' + (spec.required ? ' (wajib)' : ''), item.payload || '', function (v) {
                    item.payload = v;
                    if (spec.required) urlWarn.style.display = v.trim() ? 'none' : '';
                    scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                }));
                if (spec.hint) container.appendChild(_inspNote(spec.hint));
                urlWarn.style.display = (spec.required && !(item.payload && String(item.payload).trim())) ? '' : 'none';
                container.appendChild(urlWarn);
            } else if (spec.hint) {
                // control === 'none' → tak ada field payload; cukup catatan kalau ada.
                container.appendChild(_inspNote(spec.hint));
            }

            container.appendChild(_inspNodeActions(cfg.menu.items, index, sceneId, 'menu_item'));
        }

        function _renderCreditsLineInspector(cfg, sceneId, index, container) {
            var line = cfg.credits && cfg.credits.lines && cfg.credits.lines[index];
            if (!line) { container.appendChild(_inspNote('Baris tidak ditemukan.')); return; }
            var lineTypes = (VN.NodeRegistry && VN.NodeRegistry.C && VN.NodeRegistry.C.CREDITS_LINE_TYPES) || [
                { value: 'heading', label: 'Heading' }, { value: 'text', label: 'Teks' }, { value: 'separator', label: 'Pemisah' }
            ];
            container.appendChild(_inspReadonly('Bagian', '📜 Baris Kredit #' + (index + 1)));
            container.appendChild(_inspSelect('Tipe', lineTypes.map(function (o) { return { value: o.value, label: o.label }; }), line.type, function (v) {
                line.type = v; if (v === 'separator') line.text = '';
                renderHubSceneList(); renderHubSceneInspector(sceneId, container); scheduleHubPreviewRefresh(); scheduleHubSnapshot();
            }));
            if (line.type !== 'separator') {
                container.appendChild(_inspText('Teks', line.text || '', function (v) {
                    line.text = v; renderHubSceneList(); scheduleHubPreviewRefresh(); scheduleHubSnapshot();
                }));
            }
            container.appendChild(_inspNodeActions(cfg.credits.lines, index, sceneId, 'credits_line'));
        }

        // Elemen hand-coded (data-node di partial code-first) — dulu tak terkelola sama
        // sekali di Inspector (fallback ke inspector scene generik). Sekarang menampilkan
        // properti nyata yang terdeteksi (data-action/target/href/bind, teks tampil) —
        // read-only (form tak menulis-ulang HTML mentah), plus tombol lompat ke sumbernya
        // di Editor Kode. Menjawab keluhan "tombol buatanku tidak muncul/tidak terkelola".
        function _renderHubNodeInspector(cfg, sceneId, index, container) {
            var raw = (_hubNodeCache[sceneId] || [])[index];
            if (!raw) {
                container.appendChild(_inspNote('Elemen tidak ditemukan — mungkin scene belum dimuat ulang setelah diedit di luar (VS Code).'));
                return;
            }
            container.appendChild(_inspReadonly('Bagian', '🔘 Elemen Kode (hand-coded)'));
            container.appendChild(_inspReadonly('Nama (data-node)', raw.name));
            container.appendChild(_inspReadonly('Tag HTML', '<' + raw.tag + '>'));
            if (raw.text) container.appendChild(_inspReadonly('Teks tampil', raw.text));
            if (raw.action) container.appendChild(_inspReadonly('data-action', raw.action));
            if (raw.target) container.appendChild(_inspReadonly('data-target', raw.target));
            if (raw.href) container.appendChild(_inspReadonly('data-href', raw.href));
            if (raw.bind) container.appendChild(_inspReadonly('data-bind', raw.bind));
            if (raw.bindAsset) container.appendChild(_inspReadonly('data-bind-asset', 'Cover novel — diisi otomatis oleh engine saat boot (bukan logika kustom)'));
            if (!raw.action && !raw.target && !raw.href && !raw.bind && !raw.bindAsset) {
                container.appendChild(_inspNote('Tidak ada data-action/data-bind terdeteksi pada elemen ini — kemungkinan ditangani logika kustom di hub.js (mis. addEventListener manual).'));
            }
            container.appendChild(_inspNote('Elemen ini ditulis manual di kode (bukan dari Menu builder), jadi propertinya tak bisa diedit lewat form di sini — edit langsung di kode.'));

            var editRow = _inspRow('');
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'inspector-pick-btn';
            editBtn.textContent = '📝 Buka di Editor Kode';
            editBtn.addEventListener('click', function () {
                var sc = (Array.isArray(cfg.scenes) ? cfg.scenes : []).filter(function (s) { return s && s.id === sceneId; })[0];
                var label = sc ? (sc.name || sceneId) : sceneId;
                if (window.__hubCodeEditorOpen) {
                    ipcRenderer.send('hub-code-editor:load-scene', {
                        novelTitle: currentlyEditingNovel, sceneId: sceneId, label: label, nodeName: raw.name
                    });
                } else {
                    openHubCodeEditorWindow({ activeSceneId: sceneId, activeSceneLabel: label });
                }
            });
            editRow.appendChild(editBtn);
            container.appendChild(editRow);
        }

        function renderHubSceneInspector(sceneId, container) {
            container.innerHTML = '';
            var cfg = window.hubConfig || {};
            var scenes = Array.isArray(cfg.scenes) ? cfg.scenes : [];
            var scene = scenes.filter(function (s) { return s.id === sceneId; })[0];
            if (!scene) {
                container.appendChild(_inspNote('Scene tidak ditemukan. Pilih scene lain di sidebar.'));
                return;
            }

            // Node anak terpilih (tombol menu / baris credits / elemen kode) → editor item tunggal.
            var node = window.activeHubNode;
            if (node && node.sceneId === sceneId && node.kind === 'menu_item') { _renderMenuItemInspector(cfg, sceneId, node.index, container); return; }
            if (node && node.sceneId === sceneId && node.kind === 'credits_line') { _renderCreditsLineInspector(cfg, sceneId, node.index, container); return; }
            if (node && node.sceneId === sceneId && node.kind === 'node') { _renderHubNodeInspector(cfg, sceneId, node.index, container); return; }

            var meta = (VN.HubScenes && VN.HubScenes.sceneTypeMeta(scene.type)) || {};

            // --- Umum ---
            container.appendChild(_inspText('Nama Scene', scene.name || '', function (v) {
                scene.name = v;
                renderHubSceneList();
                scheduleHubSnapshot();
            }));
            container.appendChild(_inspReadonly('Tipe', (meta.icon ? meta.icon + ' ' : '') + (meta.label || scene.type)));

            // Peran scene di alur runtime (read-only, mencerminkan computeSceneFlow runtime).
            var flowRole = _hubSceneRuntimeRole(cfg, scene);
            var roleText = (scene.enabled === false)
                ? '⏸ Nonaktif — dilewati runtime. (Peran asli: ' + flowRole.role + ')'
                : flowRole.role;
            container.appendChild(_inspReadonly('Peran di Alur', roleText));

            // Toggle "Aktif" hanya untuk tipe yang efek enable/disable-nya benar-benar
            // dihormati runtime (splash & warning). Layar akhir selalu tampil via fallback
            // dan credits dipanggil via menu — menampilkan toggle di sana akan menyesatkan.
            if (flowRole.canToggle) {
                container.appendChild(_inspCheckbox('Aktif', scene.enabled !== false, function (checked) {
                    scene.enabled = checked;
                    if (scene.type === 'warning') {
                        if (!cfg.warningScreen) cfg.warningScreen = { enabled: false, text: '', style: 'default' };
                        cfg.warningScreen.enabled = checked;
                        var we = document.getElementById('warning-screen-enabled');
                        if (we) we.checked = checked;
                    }
                    renderHubSceneList();
                    renderHubSceneInspector(sceneId, container); // refresh baris "Peran di Alur"
                    scheduleHubPreviewRefresh();
                    scheduleHubSnapshot();
                }));
            }

            // Peringatan kontekstual (mis. file/teks kosong → scene tak muncul di runtime).
            if (flowRole.warn) container.appendChild(_inspWarn(flowRole.warn));

            // --- Spesifik per tipe ---
            // UX-A03: gerbang kapabilitas. Hub code-first dirender runtime bersama yang
            // MEMBACA MARKUP; `bootSequence`, `warningScreen`, `menu`, dan `credits` di
            // hub-config.json tak pernah dibacanya. Field-field itu karena itu hanya
            // ditampilkan untuk Generated Hub — yang memang mengonsumsinya.
            var isCodeFirstScene = cfg.codeScenes === true;

            if (scene.type === 'splash') {
                var idx = parseInt(String(sceneId).replace('hub_scene_splash_', ''), 10) - 1;
                var item = (!isCodeFirstScene && Array.isArray(cfg.bootSequence)) ? cfg.bootSequence[idx] : null;
                if (isCodeFirstScene) {
                    _inspManagedByCode(container, 'Gambar/video dan durasi splash ada di markup scene (<img>/<video> dan data-duration).');
                }
                if (item) {
                    container.appendChild(_inspSelect('Tipe Media',
                        [{ value: 'image', label: 'Gambar (Splash)' }, { value: 'video', label: 'Video' }],
                        item.type, function (v) {
                            item.type = v;
                            renderBootSequenceList();
                            scheduleHubPreviewRefresh();
                            scheduleHubSnapshot();
                        }));
                    container.appendChild(_inspFilePicker('File Sumber', item.src || '', async function () {
                        var filters = item.type === 'image'
                            ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                            : [{ name: 'Video', extensions: ['mp4', 'webm'] }];
                        var result = await ipcRenderer.invoke('hub:pick-asset', { novelTitle: currentlyEditingNovel, filters: filters, prefix: 'boot' });
                        if (result && result.success) {
                            item.src = result.relativePath;
                            renderBootSequenceList();
                            renderHubSceneInspector(sceneId, container);
                            scheduleHubPreviewRefresh();
                            scheduleHubSnapshot();
                        } else if (result && !result.success) {
                            VN.Toast.error('Gagal menyalin file ke folder novel.');
                        }
                    }));
                    container.appendChild(_inspNumber('Durasi (ms)', item.duration || 3000, function (v) {
                        item.duration = parseInt(v, 10) || 3000;
                        renderBootSequenceList();
                        scheduleHubPreviewRefresh();
                        scheduleHubSnapshot();
                    }));
                }
            } else if (scene.type === 'warning') {
                if (isCodeFirstScene) {
                    // "Teks Peringatan" & "Gaya" hanya dibaca Generated Hub. Di code-first,
                    // teksnya adalah isi <section> dan gayanya urusan hub.css.
                    _inspManagedByCode(container, 'Teks & gaya layar peringatan ada di markup scene dan hub.css.');
                } else {
                    if (!cfg.warningScreen) cfg.warningScreen = { enabled: false, text: '', style: 'default' };
                    container.appendChild(_inspTextarea('Teks Peringatan', cfg.warningScreen.text || '', function (v) {
                        cfg.warningScreen.text = v;
                        var wt = document.getElementById('warning-screen-text');
                        if (wt) wt.value = v;
                        scheduleHubPreviewRefresh();
                        scheduleHubSnapshot();
                    }));
                    container.appendChild(_inspSelect('Gaya',
                        [{ value: 'default', label: 'Default' }, { value: 'retro', label: 'Retro' }],
                        cfg.warningScreen.style || 'default', function (v) {
                            cfg.warningScreen.style = v;
                            var ws = document.getElementById('warning-screen-style');
                            if (ws) ws.value = v;
                            scheduleHubPreviewRefresh();
                            scheduleHubSnapshot();
                        }));
                }
                _inspSceneBackground(scene, sceneId, container);
            } else if (scene.type === 'main_menu' && isCodeFirstScene) {
                // Tombol menu code-first = elemen ber-data-node di markup, bukan
                // cfg.menu.items — daftar itu tak pernah dirender. Yang tersisa nyata:
                // background scene (disuntik ke <section> saat Simpan).
                _inspManagedByCode(container, 'Tombol, background, dan BGM menu ada di markup scene serta hub.js. Tombol muncul sebagai anak scene di sidebar.');
                _inspSceneBackground(scene, sceneId, container);
            } else if (scene.type === 'main_menu') {
                if (!cfg.menu) cfg.menu = { items: [], bgm: '', layout: '', background: { type: '', src: '' } };
                if (!cfg.menu.background) cfg.menu.background = { type: '', src: '' };
                container.appendChild(_inspFilePicker('BGM Menu', cfg.menu.bgm || '', async function () {
                    var result = await ipcRenderer.invoke('hub:pick-asset', { novelTitle: currentlyEditingNovel, filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav'] }], subdir: 'audio/bgm', prefix: 'menu_bgm' });
                    if (result && result.success) {
                        cfg.menu.bgm = result.relativePath;
                        var bi = document.getElementById('menu-bgm-input');
                        if (bi) bi.value = result.relativePath;
                        renderHubSceneInspector(sceneId, container);
                        scheduleHubPreviewRefresh();
                        scheduleHubSnapshot();
                    }
                }));
                container.appendChild(_inspSelect('Background Tipe',
                    [{ value: '', label: '(tanpa background)' }, { value: 'image', label: 'Gambar' }, { value: 'video', label: 'Video' }],
                    cfg.menu.background.type || '', function (v) {
                        cfg.menu.background.type = v;
                        var bt = document.getElementById('menu-bg-type');
                        if (bt) bt.value = v;
                        if (!v) {
                            cfg.menu.background.src = '';
                            var bs = document.getElementById('menu-bg-src');
                            if (bs) bs.value = '';
                        }
                        renderHubSceneInspector(sceneId, container);
                        scheduleHubPreviewRefresh();
                        scheduleHubSnapshot();
                    }));
                if (cfg.menu.background.type) {
                    container.appendChild(_inspFilePicker('Background File', cfg.menu.background.src || '', async function () {
                        var filters = cfg.menu.background.type === 'image'
                            ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                            : [{ name: 'Video', extensions: ['mp4', 'webm'] }];
                        var result = await ipcRenderer.invoke('hub:pick-asset', { novelTitle: currentlyEditingNovel, filters: filters, prefix: 'menu_bg' });
                        if (result && result.success) {
                            cfg.menu.background.src = result.relativePath;
                            var bs = document.getElementById('menu-bg-src');
                            if (bs) bs.value = result.relativePath;
                            renderHubSceneInspector(sceneId, container);
                            scheduleHubPreviewRefresh();
                            scheduleHubSnapshot();
                        }
                    }));
                }
                var presets = (VN.NodeRegistry && VN.NodeRegistry.C && VN.NodeRegistry.C.MENU_LAYOUT_PRESETS) || [];
                if (presets.length) {
                    var presetOpts = [{ value: '', label: '(terapkan preset…)' }].concat(presets.map(function (p) { return { value: p.id, label: p.label }; }));
                    container.appendChild(_inspSelect('Preset Layout Menu', presetOpts, '', function (v) {
                        var p = presets.filter(function (x) { return x.id === v; })[0];
                        if (!p) return;
                        cfg.menu.items = JSON.parse(JSON.stringify(p.items));
                        renderMenuBuilderList();
                        renderHubSceneInspector(sceneId, container);
                        scheduleHubPreviewRefresh();
                        scheduleHubSnapshot();
                        VN.Toast.success('Preset menu "' + p.label + '" diterapkan.');
                    }));
                }
                // Tombol menu = anak scene di sidebar. Tambah di sini, edit per-item di tree.
                container.appendChild(_inspNote('Tombol menu ada di sidebar sebagai anak scene ini — klik tombol untuk mengedit/urutkan.'));
                var addMenuBtn = document.createElement('button');
                addMenuBtn.type = 'button'; addMenuBtn.className = 'inspector-add-btn'; addMenuBtn.textContent = '+ Tambah Tombol';
                addMenuBtn.addEventListener('click', function () {
                    if (!cfg.menu) cfg.menu = { items: [], bgm: '', layout: '', background: { type: '', src: '' } };
                    if (!Array.isArray(cfg.menu.items)) cfg.menu.items = [];
                    cfg.menu.items.push({ label: 'Tombol Baru', action: 'start_game', payload: '' });
                    _hubTreeCollapsed.delete(sceneId); _saveHubTreeCollapsed();
                    setActiveHubNode({ sceneId: sceneId, kind: 'menu_item', index: cfg.menu.items.length - 1 });
                    scheduleHubSnapshot();
                });
                container.appendChild(addMenuBtn);
            } else if (scene.type === 'info') {
                container.appendChild(_inspNote('Konten Info Novel (sinopsis, cover, daftar chapter) diambil dari Profil Novel.'));
                _inspSceneBackground(scene, sceneId, container);
            } else if (scene.type === 'blank') {
                container.appendChild(_inspNote('Layar kosong — kanvas bebas. Atur background sendiri di bawah.'));
                _inspSceneBackground(scene, sceneId, container);
            } else if (scene.type === 'credits' && isCodeFirstScene) {
                // cfg.credits.lines tidak dirender runtime code-first; baris kredit
                // adalah elemen nyata di markup (dan muncul sebagai anak scene lewat
                // data-node), jadi tombol "+ Tambah Baris" di sini akan menipu.
                _inspManagedByCode(container, 'Baris kredit ada di markup scene. Tandai elemennya dengan data-node agar muncul sebagai anak scene di sidebar.');
                _inspSceneBackground(scene, sceneId, container);
            } else if (scene.type === 'credits') {
                if (!cfg.credits || typeof cfg.credits !== 'object') cfg.credits = { lines: [] };
                if (!Array.isArray(cfg.credits.lines)) cfg.credits.lines = [];
                container.appendChild(_inspNote('Baris kredit ada di sidebar sebagai anak scene ini — klik baris untuk mengedit/urutkan.'));
                var addLineBtn = document.createElement('button');
                addLineBtn.type = 'button'; addLineBtn.className = 'inspector-add-btn'; addLineBtn.textContent = '+ Tambah Baris';
                addLineBtn.addEventListener('click', function () {
                    if (!cfg.credits) cfg.credits = { lines: [] };
                    if (!Array.isArray(cfg.credits.lines)) cfg.credits.lines = [];
                    cfg.credits.lines.push({ type: 'text', text: '' });
                    _hubTreeCollapsed.delete(sceneId); _saveHubTreeCollapsed();
                    setActiveHubNode({ sceneId: sceneId, kind: 'credits_line', index: cfg.credits.lines.length - 1 });
                    scheduleHubSnapshot();
                });
                container.appendChild(addLineBtn);
            } else if (scene.type === 'custom_code') {
                container.appendChild(_inspReadonly('File Scene', scene.customFile || (sceneId + '.html')));
                container.appendChild(_inspNote('Scene ini dirender dari kode (hub.html / partial). Atur tampilannya di tab Advanced atau lewat VS Code.'));
                var editCodeBtn = document.createElement('button');
                editCodeBtn.type = 'button';
                editCodeBtn.className = 'inspector-add-btn';
                editCodeBtn.textContent = '✏️ Edit di Advanced';
                editCodeBtn.addEventListener('click', function () {
                    openHubCodeEditorWindow({ activeSceneId: sceneId, activeSceneLabel: scene.name || sceneId });
                });
                container.appendChild(editCodeBtn);
            }

            // --- Code-first: jalan pintas desain bebas per scene ---
            // Pada hub code-first, TIAP scene (termasuk blank & info) adalah <section>
            // HTML nyata yang bisa didesain bebas hingga menyerupai tipe lain — mis.
            // scene blank diberi tombol & data-action sehingga jadi seperti Main Menu,
            // atau diberi <img> sehingga jadi seperti Splash. custom_code sudah punya
            // tombolnya sendiri di atas; untuk tipe lain, sediakan di sini.
            if (cfg.codeScenes === true && scene.type !== 'custom_code') {
                var editSceneCodeBtn = document.createElement('button');
                editSceneCodeBtn.type = 'button';
                editSceneCodeBtn.className = 'inspector-add-btn';
                editSceneCodeBtn.textContent = '✏️ Edit kode scene (Advanced)';
                editSceneCodeBtn.title = 'Buka HTML scene ini untuk desain bebas (blank bisa dijadikan menu, splash, dll.)';
                editSceneCodeBtn.addEventListener('click', function () {
                    openHubCodeEditorWindow({ activeSceneId: sceneId, activeSceneLabel: scene.name || sceneId });
                });
                container.appendChild(editSceneCodeBtn);
            }

            // --- Aksi hapus scene (eksplisit di Inspector) ---
            // Mengikuti aturan deletable yang sama dengan daftar sidebar: Generated Hub
            // melindungi layar terminal (info/blank), sedangkan code-first membolehkan
            // semua scene dihapus (tiap scene = <section> nyata).
            var canDeleteScene = (cfg.codeScenes === true) || (scene.type !== 'info' && scene.type !== 'blank');
            if (canDeleteScene) {
                var delSceneBtn = document.createElement('button');
                delSceneBtn.type = 'button';
                delSceneBtn.className = 'inspector-delete-btn';
                delSceneBtn.textContent = '🗑 Hapus Scene';
                delSceneBtn.title = 'Hapus scene ini';
                delSceneBtn.addEventListener('click', function () {
                    if (typeof window.deleteHubScene === 'function') window.deleteHubScene(sceneId);
                });
                container.appendChild(delSceneBtn);
            }
        }
        window.renderHubSceneInspector = renderHubSceneInspector;

        // ==========================================
        // DATA STATE: BOOT SEQUENCE & MENU BUILDER
        // ==========================================
        let hubConfig = {
            hubType: "default",
            hubModeConfirmed: false,
            bootSequence: [],
            warningScreen: { enabled: false, text: "", style: "default" },
            menu: { bgm: "", layout: "", background: { type: "", src: "" }, items: [] },
            chapterConfig: {}
        };
        window.hubConfig = hubConfig;

        // Sorot template yang SEDANG dipakai di grid. Setelah mode Generated/Custom
        // disatukan menjadi 'pilihan template', inilah satu-satunya keadaan Hub yang
        // masih perlu ditampilkan. Papan status lama dibuang: Opening Flow & Main Menu
        // sudah terbaca langsung dari daftar Hub Scenes, dan label 'mode' tak lagi
        // bermakna bagi kreator — hasilnya selalu hub.html milik novel yang bisa
        // disunting lagi lewat Editor Kode.
        function updateHubOverviewState() {
            var grid = document.getElementById('hub-template-grid');
            if (!grid) return;
            var activeId = (window.hubConfig || {})._templateId || null;
            grid.querySelectorAll('.template-card').forEach(function (card) {
                card.classList.toggle('active', !!activeId && card.dataset.templateId === activeId);
            });
        }

        // ==========================================
        // DIRTY TRACKING: baseline for isDirty detection
        // ==========================================
        let _hubSavedBaseline = '';

        function hubMarkClean() {
            _hubSavedBaseline = JSON.stringify(hubConfig);
        }
        function hubIsDirty() {
            const configDirty = !!_hubSavedBaseline &&
                JSON.stringify(hubConfig) !== _hubSavedBaseline;
            const codeDirty = !!(window.VNCodeEditor &&
                typeof window.VNCodeEditor.isDirty === 'function' &&
                window.VNCodeEditor.isDirty());
            return configDirty || codeDirty;
        }
        window._hubMarkClean = hubMarkClean;
        window._hubIsDirty = hubIsDirty;

        let _profileSavedBaseline = '';

        // SATU daftar field profil, dipakai DUA pembaca:
        //   1. pelacak dirty di sini — menentukan `saveProfile` di novelCrud.js;
        //   2. revision guard `profileDraftSignature()` di novelCrud.js — menentukan
        //      apakah respons Save yang datang masih milik draft yang sama.
        //
        // Keduanya dulu punya salinan daftar masing-masing, dan itu sempat
        // menelan fitur utuh: field "Gambar Discord" dan "Target viewport"
        // ditambahkan ke daftar (2) saja, jadi mengisinya TIDAK membuat profil
        // dianggap kotor, `saveProfile` tetap false, dan `update-novel-details`
        // tak pernah dipanggil. Gejalanya: tekan Simpan, tak ada galat apa pun,
        // lalu nilainya hilang saat novel dibuka lagi.
        //
        // Karena itu daftarnya sekarang tinggal SATU dan diekspor. Menambah field
        // profil baru = menambah satu baris DI SINI, bukan di dua tempat.
        function profileSnapshot() {
            return JSON.stringify({
                storyDesc: (document.getElementById('editor-story-desc') || {}).value || '',
                description: (document.getElementById('editor-description') || {}).value || '',
                genre: (document.getElementById('editor-genre') || {}).value || '',
                author: (document.getElementById('editor-author') || {}).value || '',
                illustrator: (document.getElementById('editor-illustrator') || {}).value || '',
                vnMapper: (document.getElementById('editor-vn-mapper') || {}).value || '',
                version: (document.getElementById('editor-novel-version') || {}).value || '',
                viewport: (typeof window._novelViewportSignature === 'function')
                    ? window._novelViewportSignature() : '',
                rpcLargeImage: (typeof window._novelRpcSignature === 'function')
                    ? window._novelRpcSignature() : '',
                coverDraft: ((document.getElementById('editor-cover-input') || {}).value || ''),
                videoDraft: (editorBackgroundVideoInput || {}).value || ''
            });
        }
        function profileMarkClean() { _profileSavedBaseline = profileSnapshot(); }
        function profileIsDirty() { return !!_profileSavedBaseline && profileSnapshot() !== _profileSavedBaseline; }
        window._profileSnapshot = profileSnapshot;
        window._profileMarkClean = profileMarkClean;
        window._profileIsDirty = profileIsDirty;

        // Patch workspace view dengan dirty tracking (dipoll indikator titik nav).
        // (saveChanges/discardChanges per-view dihapus — bukan bagian kontrak
        // registerView dan tak pernah dipanggil Workspace; alur simpan/buang yang
        // nyata ada di scriptEditor.js via saveAllNovelChanges. Audit H3.)
        (function() {
            var hubView = VN.Workspace._views['hub'];
            if (hubView) {
                hubView.isDirty = function() { return hubIsDirty(); };
            }
        })();

        (function() {
            var profileView = VN.Workspace._views['profile'];
            if (!profileView) return;
            profileView.isDirty = profileIsDirty;
        })();

        // ==========================================
        // HUB EDITOR UNDO/REDO
        // ==========================================
        const _hubHistory = { undoStack: [], redoStack: [], isApplying: false, maxSnapshots: 30 };
        let _hubHistoryTimer = null;

        function _hubSnapshot() {
            try { return JSON.parse(JSON.stringify(hubConfig)); } catch (e) { return null; }
        }
        function recordHubSnapshot() {
            if (_hubHistory.isApplying) return;
            var snap = _hubSnapshot();
            if (!snap) return;
            var last = _hubHistory.undoStack[_hubHistory.undoStack.length - 1];
            if (last && JSON.stringify(last) === JSON.stringify(snap)) return;
            _hubHistory.undoStack.push(snap);
            if (_hubHistory.undoStack.length > _hubHistory.maxSnapshots) _hubHistory.undoStack.shift();
            _hubHistory.redoStack = [];
        }
        function scheduleHubSnapshot() {
            if (_hubHistory.isApplying) return;
            clearTimeout(_hubHistoryTimer);
            _hubHistoryTimer = setTimeout(recordHubSnapshot, 300);
        }
        function undoHubConfig() {
            if (_hubHistory.undoStack.length <= 1) return;
            var current = _hubHistory.undoStack.pop();
            _hubHistory.redoStack.push(current);
            var prev = _hubHistory.undoStack[_hubHistory.undoStack.length - 1];
            _applyHubSnapshot(prev);
        }
        function redoHubConfig() {
            if (_hubHistory.redoStack.length === 0) return;
            var next = _hubHistory.redoStack.pop();
            _hubHistory.undoStack.push(next);
            _applyHubSnapshot(next);
        }
        function _applyHubSnapshot(snap) {
            _hubHistory.isApplying = true;
            try {
                Object.assign(hubConfig, JSON.parse(JSON.stringify(snap)));
                window.hubConfig = hubConfig;
                renderBootSequenceList();
                renderMenuBuilderList();
                renderCreditsLinesList();
                // Warning kini diedit via Inspector; input drawer Opening dihapus → guard.
                var _we2 = document.getElementById('warning-screen-enabled'); if (_we2) _we2.checked = !!hubConfig.warningScreen.enabled;
                var _wt2 = document.getElementById('warning-screen-text'); if (_wt2) _wt2.value = hubConfig.warningScreen.text || '';
                var _ws2 = document.getElementById('warning-screen-style'); if (_ws2) _ws2.value = hubConfig.warningScreen.style || 'default';
                // Field menu kini diedit di Inspector — input drawer sudah dihapus; guard.
                var _ml = document.getElementById('menu-layout-input'); if (_ml) _ml.value = hubConfig.menu.layout || '';
                var _mb = document.getElementById('menu-bgm-input'); if (_mb) _mb.value = hubConfig.menu.bgm || '';
                var _mbt = document.getElementById('menu-bg-type'); if (_mbt) _mbt.value = (hubConfig.menu.background || {}).type || '';
                var _mbs = document.getElementById('menu-bg-src'); if (_mbs) _mbs.value = (hubConfig.menu.background || {}).src || '';
                updateHubOverviewState();
                if (typeof renderHubSceneList === 'function') renderHubSceneList();
                // Refresh inspector bila sedang menampilkan scene aktif (undo/redo).
                if (window.VNInspector && window.VNInspector.isVisible && window.activeHubSceneId) {
                    window.VNInspector.showHubScene(window.activeHubSceneId);
                }
                refreshHubPreview();
            } finally {
                _hubHistory.isApplying = false;
            }
        }
        function initHubHistory() {
            _hubHistory.undoStack = [];
            _hubHistory.redoStack = [];
            recordHubSnapshot();
        }

        // Ctrl+Z / Ctrl+Shift+Z support for hub tab
        document.addEventListener('keydown', function (e) {
            // Only when hub editing workspace is visible
            var hubWrapper = document.getElementById('hub-editing-wrapper');
            if (!hubWrapper || hubWrapper.offsetParent === null) return;
            // e.key dengan Shift adalah 'Z' (kapital) — normalisasi dulu agar redo terdeteksi
            var hubKey = e.key.toLowerCase();
            if (e.ctrlKey && !e.altKey && hubKey === 'z' && !e.shiftKey) {
                e.preventDefault();
                undoHubConfig();
            } else if (e.ctrlKey && !e.altKey && ((hubKey === 'z' && e.shiftKey) || hubKey === 'y')) {
                e.preventDefault();
                redoHubConfig();
            }
        });

        // Guard flag untuk mencegah loadHubEditorData dipanggil overlap
        let _isLoadingHub = false;

        // Escape utility untuk attribute values (mencegah XSS via " dan ')
        function escapeAttr(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // Daftar chapter yang tersedia (diisi saat loadHubEditorData)
        let availableChapters = [];
        // Expose ke playerProfileEditor.js
        Object.defineProperty(window, 'availableChapters', {
            get() { return availableChapters; },
            set(v) { availableChapters = v; }
        });

        // ==========================================
        // FUNGSI LOAD / POPULATE HUB CONFIG
        // ==========================================
        async function loadHubEditorData(novelTitle) {
            if (_isLoadingHub) return;
            _isLoadingHub = true;
            try {
                currentlyEditingNovel = novelTitle;
                document.getElementById('editor-title').textContent = `Kustomisasi Novel: ${novelTitle}`;
                var profileTitle = document.getElementById('profile-title');
                if (profileTitle) profileTitle.textContent = `Profil Novel: ${novelTitle}`;
                editorBackgroundVideoInput.value = '';
                videoPreviewName.textContent = 'Belum ada video dipilih';
                document.getElementById('video-upload-label')?.classList.remove('file-selected');
                var coverInput = document.getElementById('editor-cover-input');
                if (coverInput) coverInput.value = '';
                // Kosongkan kartu dulu; diisi ulang dari details di bawah. Tanpa ini,
                // novel yang gagal dimuat akan tetap memamerkan cover novel sebelumnya.
                if (typeof window._setCoverCard === 'function') window._setCoverCard(null);

                // Ambil details reguler dari main process
                const details = await ipcRenderer.invoke('get-hub-details', novelTitle);
                if (details.success) {
                    document.getElementById('editor-story-desc').value = details.storyDesc || '';
                    document.getElementById('editor-description').value = details.description || '';
                    document.getElementById('editor-genre').value = details.genre || '';
                    document.getElementById('editor-author').value = details.author || '';
                    document.getElementById('editor-illustrator').value = details.illustrator || '';
                    document.getElementById('editor-vn-mapper').value = details.vnMapper || '';
                    document.getElementById('editor-novel-version').value = details.version || '';

                    // Simpan metadata lengkap untuk dipakai oleh hub preview
                    _loadedNovelMeta = {
                        title: details.title || novelTitle,
                        description: details.description || '',
                        genre: details.genre || '',
                        author: details.author || '',
                        illustrator: details.illustrator || '',
                        vnMapper: details.vnMapper || '',
                        version: details.version || '',
                        cover: details.cover || '',
                        promotionalVideo: details.promotionalVideo || ''
                    };

                    // Kartu cover (pratinjau + nama berkas + dimensi/rasio) dikelola
                    // initCoverCard di novelCrud.js; di sini cukup menyuapkan kenyataan disk.
                    if (typeof window._setCoverCard === 'function') {
                        var coverAbs = details.cover
                            ? path.join(__dirname, 'visual_novels', novelTitle, details.cover)
                            : '';
                        window._setCoverCard(details.cover ? {
                            src: 'file:///' + coverAbs.replace(/\\/g, '/'),
                            fsPath: coverAbs,   // dipakai kartu untuk menandai versi (mtime)
                            fileName: details.cover
                        } : null);
                    }

                    // Rekonstruksi info video promosi.
                    _reconstructExistingMedia(novelTitle, details.promotionalVideo || '');

                    // Section Extras (Achievements) — dirender dari kenyataan disk.
                    if (typeof window._refreshAchievementsCard === 'function') {
                        window._refreshAchievementsCard(novelTitle);
                    }

                    // Section Tampilan (font global) — dibaca dari novel-font.css,
                    // bukan dari kunci JSON mana pun.
                    if (typeof window._refreshNovelFontCard === 'function') {
                        window._refreshNovelFontCard(novelTitle);
                    }

                    // Baris identitas (judul + aksi Ganti Nama).
                    if (typeof window._refreshNovelIdentityCard === 'function') {
                        window._refreshNovelIdentityCard(novelTitle);
                    }

                    // Target viewport — kanvas acuan novel. Juga menyiarkan
                    // ukurannya ke preview supaya skalanya ikut, bukan tetap 16:9.
                    if (typeof window._refreshNovelViewportCard === 'function') {
                        window._refreshNovelViewportCard(details.targetViewport || null);
                    }

                    // Gambar Discord RPC — dibaca dari novel-meta.json.
                    if (typeof window._refreshNovelRpcCard === 'function') {
                        window._refreshNovelRpcCard(novelTitle, details.discordRpc || null);
                    }
                }

                // Novel legacy tanpa mode terkonfirmasi. `needsConfirmation` hanya true
                // bila novel punya hub.html yang BERBEDA dari template global — artinya
                // kreatornya memang menulis hub sendiri. Karena pilihan mode sudah
                // dihapus dari UI, jawabannya tak lagi ambigu: pakai hub.html miliknya.
                // (Prompt lama malah berisiko: menekan "Batal" diam-diam mengabaikan
                // file custom yang sudah ia buat.)
                const modeStatus = await ipcRenderer.invoke('get-hub-mode-status', novelTitle);
                if (modeStatus.success && modeStatus.needsConfirmation) {
                    await ipcRenderer.invoke('confirm-hub-mode', {
                        novelTitle: novelTitle,
                        hubType: 'custom'
                    });
                    VN.Toast.info('Novel ini memakai hub.html miliknya sendiri.');
                }

                // Ambil konfigurasi Hub setelah resolusi mode selesai.
                const configResult = await ipcRenderer.invoke('get-hub-config', novelTitle);
                if (configResult.success) {
                    hubConfig = configResult.config;
                    window.hubConfig = hubConfig;
                    // Backward compat — pastikan field baru ada
                    if (!hubConfig.hubType) hubConfig.hubType = 'default';
                    if (typeof hubConfig.hubModeConfirmed !== 'boolean') hubConfig.hubModeConfirmed = false;
                    if (!hubConfig.chapterConfig) hubConfig.chapterConfig = {};
                    if (!hubConfig.warningScreen.style) hubConfig.warningScreen.style = 'default';
                    if (!hubConfig.menu.background) hubConfig.menu.background = { type: '', src: '' };
                    if (!hubConfig.credits) hubConfig.credits = { lines: [] };

                    // Hub Scene Workspace (Fase 2): pastikan hubConfig.scenes ada.
                    // Diturunkan dari field lama bila belum ada; field lama tetap dipertahankan.
                    if (VN.HubScenes) {
                        VN.HubScenes.normalize(hubConfig);
                        window.hubConfig = hubConfig;
                    }
                    // Fase 3: reset scene aktif untuk novel baru lalu render daftar scene.
                    window.activeHubSceneId = null;
                    renderHubSceneList();

                    renderBootSequenceList();
                    renderMenuBuilderList();
                    renderCreditsLinesList();
                    renderMenuPresetGrid();

                    // Warning kini diedit via Inspector; input drawer Opening dihapus → guard.
                    var _weL = document.getElementById('warning-screen-enabled'); if (_weL) _weL.checked = hubConfig.warningScreen.enabled;
                    var _wtL = document.getElementById('warning-screen-text'); if (_wtL) _wtL.value = hubConfig.warningScreen.text;
                    // Field menu kini diedit di Inspector — input drawer sudah dihapus; guard.
                    var _mlEl = document.getElementById('menu-layout-input'); if (_mlEl) _mlEl.value = hubConfig.menu.layout;
                    var _mbEl = document.getElementById('menu-bgm-input'); if (_mbEl) _mbEl.value = hubConfig.menu.bgm;

                    // Populasi field Fase 2B
                    const warningStyleSelect = document.getElementById('warning-screen-style');
                    if (warningStyleSelect) warningStyleSelect.value = hubConfig.warningScreen.style;

                    const bgTypeSelect = document.getElementById('menu-bg-type');
                    const bgSrcInput = document.getElementById('menu-bg-src');
                    if (bgTypeSelect) bgTypeSelect.value = hubConfig.menu.background.type || '';
                    if (bgSrcInput) bgSrcInput.value = hubConfig.menu.background.src || '';
                    updateHubOverviewState();
                }

                // Ambil daftar chapter (dipakai daftar target VN Player & lain-lain).
                // Chapter config VN Player kini dirender per chapter aktif oleh
                // playerProfileEditor (showPlayerTab → renderChapterGaya), bukan multi-list.
                const chapterResult = await ipcRenderer.invoke('get-chapter-list-for-config', novelTitle);
                if (chapterResult.success) {
                    availableChapters = chapterResult.chapters;
                    renderPlayerProfileSummary();
                }

                // Code-first (B): pastikan partial per-scene ada (migrasi monolith→partial bila perlu).
                if (hubConfig && hubConfig.codeScenes === true) {
                    var _ep = await ipcRenderer.invoke('hub:ensure-partials', { novelTitle: novelTitle });
                    if (_ep && _ep.success && _ep.config) { hubConfig = _ep.config; window.hubConfig = hubConfig; }
                }

                // Tutup window Hub Code Editor (bila terbuka) — kemungkinan menampilkan
                // novel sebelumnya; akan dibuka ulang untuk novel ini lewat tombol Advanced.
                ipcRenderer.send('hub-code-editor:close-all');

                // Parse node (data-node) tiap scene untuk tree parent/child code-first.
                await loadAllSceneNodes(novelTitle);

                // Buang frame preview novel sebelumnya (bila ada) agar tidak menampilkan
                // hub yang salah saat tab Hub dibuka nanti. TIDAK di-init ulang di sini —
                // webview (dengan nodeintegration + JS runtime penuh) baru dibuat secara
                // lazy oleh onMount view 'hub' (state.js) saat pengguna benar-benar masuk
                // ke tab Hub. Sebelumnya ini jalan tiap kali novel dibuka meski workspace
                // langsung berpindah ke tab Story — preview jadi "berjalan sembarang" di
                // background walau tidak terlihat.
                // Selalu lewat pemilik lifecycle agar timer/revision/scene lock dari
                // novel lama ikut dibatalkan. Raw frame.destroy() dapat menyisakan
                // Promise mode lama yang kemudian me-reload frame novel baru.
                if (_hubPreviewFrame) destroyHubPreview();
                initHubHistory();

                // Mark config as clean after full load
                hubMarkClean();
                profileMarkClean();
                if (typeof window._playerMarkClean === 'function') window._playerMarkClean();
            } catch (err) {
                console.error("Gagal memuat detail hub:", err);
            } finally {
                _isLoadingHub = false;
            }
        }

        // ==========================================
        // FUNGSI RENDER BUILDER (TBA)
        // ==========================================
        function renderBootSequenceList() {
            const container = document.getElementById('boot-sequence-list');
            if(!container) return;
            container.innerHTML = '';
            
            if (hubConfig.bootSequence.length === 0) {
                container.innerHTML = '<p style="text-align: center; opacity: 0.5;">Belum ada layar intro disetel.</p>';
            }
            
            hubConfig.bootSequence.forEach((item, index) => {
                const el = document.createElement('div');
                el.className = 'builder-item';
                el.innerHTML = `
                    <div class="builder-item-drag">&#9776;</div>
                    <div class="builder-item-content">
                        <div class="builder-item-row">
                            <span style="width: 80px; opacity: 0.8;">Tipe Media:</span>
                            <select class="boot-type" data-index="${index}">
                                <option value="image" ${item.type === 'image' ? 'selected' : ''}>Gambar (Splash)</option>
                                <option value="video" ${item.type === 'video' ? 'selected' : ''}>Video</option>
                            </select>
                        </div>
                        <div class="builder-item-row">
                            <span style="width: 80px; opacity: 0.8;">File sumber:</span>
                            <input type="text" class="boot-src" data-index="${index}" style="flex: 1;" placeholder="Pilih file..." value="${escapeAttr(item.src || '')}" disabled>
                            <button class="file-picker-btn boot-picker" data-index="${index}" style="padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px; cursor: pointer;">Pilih</button>
                        </div>
                        <div class="builder-item-row">
                            <span style="width: 150px; opacity: 0.8;">Durasi Tampil (mdtk):</span>
                            <input type="number" class="boot-duration" data-index="${index}" style="width: 100px;" value="${item.duration || 3000}">
                        </div>
                    </div>
                    <button class="builder-item-delete boot-delete" data-index="${index}">&times;</button>
                `;
                container.appendChild(el);
            });
            
            // Re-bind listener
            bindBootListeners();
        }

        function renderMenuBuilderList() {
            const container = document.getElementById('menu-items-list');
            if(!container) return;
            container.innerHTML = '';
            
            if (hubConfig.menu.items.length === 0) {
                container.innerHTML = '<p style="text-align: center; opacity: 0.5;">Gunakan tata letak tombol menu asli bawaan sistem.</p>';
            }
            
            hubConfig.menu.items.forEach((item, index) => {
                const el = document.createElement('div');
                el.className = 'builder-item';

                // --- Validasi warning per menu item ---
                const warningHTML = _getMenuItemWarningHTML(item);

                el.innerHTML = `
                    <div class="builder-item-drag">&#9776;</div>
                    <div class="builder-item-content">
                        <div class="builder-item-row">
                            <input type="text" class="menu-label" data-index="${index}" placeholder="Label Tombol" value="${escapeAttr(item.label)}" style="width: 150px;">
                            <select class="menu-action" data-index="${index}">
                                ${(VN.NodeRegistry?.C?.HUB_ACTION_TYPES || [
                                    { value: 'start_game', label: 'Mulai Game (Chapter 1)' },
                                    { value: 'load_chapter', label: 'Pilih Chapter' },
                                    { value: 'load_save', label: 'Muat Permainan Tersimpan' },
                                    { value: 'gallery', label: 'Galeri' },
                                    { value: 'credits', label: 'Kredit / Tentang' },
                                    { value: 'link', label: 'Buka Link Tautan' },
                                    { value: 'exit', label: 'Keluar Game' },
                                ]).map(opt => `<option value="${opt.value}" ${item.action === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                            </select>
                            <input type="text" class="menu-payload" data-index="${index}" placeholder="Payload / Link (Optional)" value="${escapeAttr(item.payload || '')}" style="flex: 1;">
                            ${warningHTML}
                        </div>
                    </div>
                    <button class="builder-item-delete menu-delete" data-index="${index}">&times;</button>
                `;
                container.appendChild(el);
            });
            
            bindMenuListeners();
        }

        // Validasi warning untuk satu menu item
        function _getMenuItemWarningHTML(item) {
            const payloadInfo = VN.NodeRegistry?.C?.HUB_ACTION_PAYLOAD?.[item.action];
            const actionTypes = VN.NodeRegistry?.C?.HUB_ACTION_TYPES || [];
            const validActions = actionTypes.map(a => a.value);

            // Cek apakah action valid
            if (item.action && !validActions.includes(item.action)) {
                return '<span class="vn-warning-badge vn-warning-error" title="Action tidak dikenali">⚠ Action tidak valid</span>';
            }

            // Cek payload wajib
            if (payloadInfo && payloadInfo.required && !item.payload?.trim()) {
                return `<span class="vn-warning-badge" title="${escapeAttr(payloadInfo.hint)}">⚠ Perlu payload</span>`;
            }
            if (item.action === 'start_game' && item.payload?.trim() &&
                !availableChapters.includes(item.payload.trim())) {
                return '<span class="vn-warning-badge vn-warning-error" title="Chapter tujuan belum tersedia">⚠ Chapter tidak ditemukan</span>';
            }

            // Cek label kosong
            if (!item.label?.trim()) {
                return '<span class="vn-warning-badge" title="Label tombol kosong">⚠ Label kosong</span>';
            }

            return '';
        }

        // Update warning badge in-place tanpa re-render seluruh list
        function _updateMenuItemWarning(builderItem, item) {
            if (!builderItem) return;
            const existing = builderItem.querySelector('.vn-warning-badge');
            if (existing) existing.remove();
            const html = _getMenuItemWarningHTML(item);
            if (html) {
                const row = builderItem.querySelector('.builder-item-row');
                if (row) row.insertAdjacentHTML('beforeend', html);
            }
        }

        // ==========================================
        // EVENT DELEGATION UTK BUILDER (menggantikan bind per-element)
        // Menggunakan satu listener di parent container → tidak ada listener leak saat re-render
        // ==========================================
        (function initBootDelegation() {
            const container = document.getElementById('boot-sequence-list');
            if (!container) return;

            container.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined) return;
                if (e.target.classList.contains('boot-type')) {
                    if (hubConfig.bootSequence[idx]) hubConfig.bootSequence[idx].type = e.target.value;
                } else if (e.target.classList.contains('boot-duration')) {
                    if (hubConfig.bootSequence[idx]) hubConfig.bootSequence[idx].duration = parseInt(e.target.value) || 3000;
                }
            });

            container.addEventListener('input', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined) return;
                if (e.target.classList.contains('boot-src')) {
                    if (hubConfig.bootSequence[idx]) hubConfig.bootSequence[idx].src = e.target.value;
                }
            });

            container.addEventListener('click', async (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined) return;

                if (e.target.classList.contains('boot-picker')) {
                    const seqItem = hubConfig.bootSequence[idx];
                    if (!seqItem) return;
                    const type = seqItem.type;
                    const filters = type === 'image'
                        ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                        : [{ name: 'Video', extensions: ['mp4', 'webm'] }];

                    const result = await ipcRenderer.invoke('hub:pick-asset', {
                        novelTitle: currentlyEditingNovel,
                        filters,
                        prefix: 'boot'
                    });
                    // Re-validasi setelah async — item bisa berubah saat dialog terbuka
                    if (result && result.success && hubConfig.bootSequence[idx]) {
                        hubConfig.bootSequence[idx].src = result.relativePath;
                        renderBootSequenceList();
                    } else if (result && !result.success) {
                        VN.Toast.error('Gagal menyalin file ke folder project novel.');
                    }
                } else if (e.target.classList.contains('boot-delete')) {
                    const numIdx = parseInt(idx);
                    if (numIdx >= 0 && numIdx < hubConfig.bootSequence.length) {
                        hubConfig.bootSequence.splice(numIdx, 1);
                        renderBootSequenceList();
                    }
                }
            });
        })();

        (function initMenuDelegation() {
            const container = document.getElementById('menu-items-list');
            if (!container) return;

            container.addEventListener('input', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined || !hubConfig.menu.items[idx]) return;
                if (e.target.classList.contains('menu-label')) {
                    hubConfig.menu.items[idx].label = e.target.value;
                    _updateMenuItemWarning(e.target.closest('.builder-item'), hubConfig.menu.items[idx]);
                } else if (e.target.classList.contains('menu-payload')) {
                    hubConfig.menu.items[idx].payload = e.target.value;
                    _updateMenuItemWarning(e.target.closest('.builder-item'), hubConfig.menu.items[idx]);
                }
            });

            container.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined || !hubConfig.menu.items[idx]) return;
                if (e.target.classList.contains('menu-action')) {
                    hubConfig.menu.items[idx].action = e.target.value;
                    _updateMenuItemWarning(e.target.closest('.builder-item'), hubConfig.menu.items[idx]);
                }
            });

            container.addEventListener('click', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined) return;
                if (e.target.classList.contains('menu-delete')) {
                    const numIdx = parseInt(idx);
                    if (numIdx >= 0 && numIdx < hubConfig.menu.items.length) {
                        hubConfig.menu.items.splice(numIdx, 1);
                        renderMenuBuilderList();
                    }
                }
            });
        })();

        // Legacy compat — no-op karena sekarang pakai delegation
        function bindBootListeners() {}
        function bindMenuListeners() {}

        // ==========================================
        // TOMBOL ADD ITEM BUILDER
        // ==========================================
        document.getElementById('add-boot-item-btn')?.addEventListener('click', () => {
            hubConfig.bootSequence.push({
                type: 'image',
                src: '',
                duration: 3000
            });
            renderBootSequenceList();
        });

        // Builder menu item lama (drawer) sudah dipindah ke Inspector; guard jika tombol tak ada.
        document.getElementById('add-menu-item-btn')?.addEventListener('click', () => {
            hubConfig.menu.items.push({
                label: 'Tombol Baru',
                action: 'load_chapter',
                payload: ''
            });
            renderMenuBuilderList();
        });

        // BGM Menu Picker
        document.querySelector('.bgm-picker')?.addEventListener('click', async () => {
            const filters = [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav'] }];
            const result = await ipcRenderer.invoke('hub:pick-asset', {
                novelTitle: currentlyEditingNovel,
                filters,
                subdir: 'audio/bgm',
                prefix: 'menu_bgm'
            });
            if (result && result.success) {
                document.getElementById('menu-bgm-input').value = result.relativePath;
                hubConfig.menu.bgm = result.relativePath;
            } else if (result && !result.success) {
                VN.Toast.error('Gagal menyalin file BGM ke folder novel.');
            }
        });

        // ==========================================
        // INIT SORTABLE (DRAG AND DROP)
        // ==========================================
        if (typeof Sortable !== 'undefined') {
            const bootContainer = document.getElementById('boot-sequence-list');
            if (bootContainer) {
                new Sortable(bootContainer, {
                    handle: '.builder-item-drag',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: function (evt) {
                        const item = hubConfig.bootSequence.splice(evt.oldIndex, 1)[0];
                        hubConfig.bootSequence.splice(evt.newIndex, 0, item);
                        renderBootSequenceList();
                    }
                });
            }

            const menuContainer = document.getElementById('menu-items-list');
            if (menuContainer) {
                new Sortable(menuContainer, {
                    handle: '.builder-item-drag',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: function (evt) {
                        const item = hubConfig.menu.items.splice(evt.oldIndex, 1)[0];
                        hubConfig.menu.items.splice(evt.newIndex, 0, item);
                        renderMenuBuilderList();
                    }
                });
            }
        }

        // ==========================================
        // NOVEL-LEVEL PLAYER PROFILE — Read-only summary + navigate to Player editor
        // ==========================================
        function renderPlayerProfileSummary() {
            if (!hubConfig.playerProfile) {
                hubConfig.playerProfile = {
                    playerTheme: 'default',
                    dialogueStyle: 'bottom-bar',
                    spriteSlots: 5,
                    customCSS: '',
                    restrictions: { autoMode: true, skipMode: true }
                };
            }
            const p = hubConfig.playerProfile;
            const themeEl = document.getElementById('profile-summary-theme');
            const dialogueEl = document.getElementById('profile-summary-dialogue');
            const slotsEl = document.getElementById('profile-summary-slots');
            const restrictionsEl = document.getElementById('profile-summary-restrictions');

            if (themeEl) themeEl.textContent = p.playerTheme || 'default';
            if (dialogueEl) dialogueEl.textContent = p.dialogueStyle || 'bottom-bar';
            if (slotsEl) slotsEl.textContent = p.spriteSlots || 5;
            if (restrictionsEl) {
                const r = p.restrictions || {};
                const parts = [];
                parts.push('Auto ' + (r.autoMode !== false ? '✓' : '✗'));
                parts.push('Skip ' + (r.skipMode !== false ? '✓' : '✗'));
                restrictionsEl.textContent = parts.join(' | ');
            }
        }

        // ==========================================
        // CHAPTER CONFIG — Ada di playerProfileEditor.js (VN Player, select-first).
        // Dirender per chapter aktif via showPlayerTab → renderChapterGaya.
        // ==========================================

        // Listener perubahan Warning Screen Style
        document.getElementById('warning-screen-style')?.addEventListener('change', (e) => {
            hubConfig.warningScreen.style = e.target.value;
        });

        // ==========================================
        // BACKGROUND MENU PICKER
        // ==========================================
        document.getElementById('menu-bg-type')?.addEventListener('change', (e) => {
            if (!hubConfig.menu.background) hubConfig.menu.background = { type: '', src: '' };
            hubConfig.menu.background.type = e.target.value;
            // Reset src jika tipe diubah ke kosong
            if (!e.target.value) {
                hubConfig.menu.background.src = '';
                document.getElementById('menu-bg-src').value = '';
            }
        });

        document.getElementById('menu-bg-picker')?.addEventListener('click', async () => {
            const bgType = document.getElementById('menu-bg-type').value;
            if (!bgType) {
                VN.Toast.warning('Pilih tipe background (Gambar/Video) terlebih dahulu.');
                return;
            }

            const filters = bgType === 'image'
                ? [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
                : [{ name: 'Video', extensions: ['mp4', 'webm'] }];

            const result = await ipcRenderer.invoke('hub:pick-asset', {
                novelTitle: currentlyEditingNovel,
                filters,
                prefix: 'menu_bg'
            });
            if (result && result.success) {
                hubConfig.menu.background.src = result.relativePath;
                document.getElementById('menu-bg-src').value = result.relativePath;
            } else if (result && !result.success) {
                VN.Toast.error('Gagal menyalin file background ke folder novel.');
            }
        });

        // ==========================================
        // CREDITS EDITOR — List editor untuk baris kredit
        // ==========================================
        function renderCreditsLinesList() {
            const container = document.getElementById('credits-lines-list');
            if (!container) return;
            container.innerHTML = '';

            if (!hubConfig.credits) hubConfig.credits = { lines: [] };
            const lines = hubConfig.credits.lines;

            if (lines.length === 0) {
                container.innerHTML = '<p style="text-align: center; opacity: 0.5;">Belum ada baris kredit. Klik tombol di bawah untuk menambah.</p>';
                return;
            }

            const creditsLineTypes = VN.NodeRegistry?.C?.CREDITS_LINE_TYPES || [
                { value: 'heading', label: 'Heading' },
                { value: 'text', label: 'Teks' },
                { value: 'separator', label: 'Pemisah' },
            ];

            lines.forEach((line, index) => {
                const el = document.createElement('div');
                el.className = 'builder-item';
                const isSep = (line.type === 'separator');
                el.innerHTML = `
                    <div class="builder-item-drag">&#9776;</div>
                    <div class="builder-item-content">
                        <div class="builder-item-row">
                            <select class="credits-type" data-index="${index}" style="width: 150px;">
                                ${creditsLineTypes.map(t => `<option value="${t.value}" ${line.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                            <input type="text" class="credits-text" data-index="${index}" placeholder="${isSep ? '(pemisah)' : 'Isi teks baris kredit...'}" value="${escapeAttr(line.text || '')}" style="flex: 1;" ${isSep ? 'disabled' : ''}>
                        </div>
                    </div>
                    <button class="builder-item-delete credits-delete" data-index="${index}">&times;</button>
                `;
                container.appendChild(el);
            });
        }

        // Event delegation untuk Credits
        (function initCreditsDelegation() {
            const container = document.getElementById('credits-lines-list');
            if (!container) return;

            container.addEventListener('input', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined || !hubConfig.credits?.lines[idx]) return;
                if (e.target.classList.contains('credits-text')) {
                    hubConfig.credits.lines[idx].text = e.target.value;
                }
            });

            container.addEventListener('change', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined || !hubConfig.credits?.lines[idx]) return;
                if (e.target.classList.contains('credits-type')) {
                    hubConfig.credits.lines[idx].type = e.target.value;
                    // Jika separator, kosongkan teks dan disable input
                    const textInput = container.querySelector(`.credits-text[data-index="${idx}"]`);
                    if (textInput) {
                        if (e.target.value === 'separator') {
                            hubConfig.credits.lines[idx].text = '';
                            textInput.value = '';
                            textInput.disabled = true;
                            textInput.placeholder = '(pemisah)';
                        } else {
                            textInput.disabled = false;
                            textInput.placeholder = 'Isi teks baris kredit...';
                        }
                    }
                }
            });

            container.addEventListener('click', (e) => {
                const idx = e.target.dataset.index;
                if (idx === undefined) return;
                if (e.target.classList.contains('credits-delete')) {
                    const numIdx = parseInt(idx);
                    if (numIdx >= 0 && numIdx < hubConfig.credits.lines.length) {
                        hubConfig.credits.lines.splice(numIdx, 1);
                        renderCreditsLinesList();
                    }
                }
            });
        })();

        // Tombol tambah baris kredit
        document.getElementById('add-credits-line-btn')?.addEventListener('click', () => {
            if (!hubConfig.credits) hubConfig.credits = { lines: [] };
            hubConfig.credits.lines.push({ type: 'text', text: '' });
            renderCreditsLinesList();
        });

        // Sortable untuk credits
        if (typeof Sortable !== 'undefined') {
            const creditsContainer = document.getElementById('credits-lines-list');
            if (creditsContainer) {
                new Sortable(creditsContainer, {
                    handle: '.builder-item-drag',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: function (evt) {
                        if (!hubConfig.credits) return;
                        const item = hubConfig.credits.lines.splice(evt.oldIndex, 1)[0];
                        hubConfig.credits.lines.splice(evt.newIndex, 0, item);
                        renderCreditsLinesList();
                    }
                });
            }
        }

        // ==========================================
        // MENU LAYOUT PRESETS — Preset grid picker
        // ==========================================
        function renderMenuPresetGrid() {
            const grid = document.getElementById('menu-preset-grid');
            if (!grid) return;
            grid.innerHTML = '';

            const presets = VN.NodeRegistry?.C?.MENU_LAYOUT_PRESETS || [];
            presets.forEach(preset => {
                const card = document.createElement('div');
                card.className = 'preset-card';
                card.dataset.presetId = preset.id;
                card.innerHTML = `
                    <div class="preset-card-label">${escapeHTML(preset.label)}</div>
                    <div class="preset-card-desc">${escapeHTML(preset.description)}</div>
                `;
                grid.appendChild(card);
            });
        }

        // Event delegation untuk Menu Preset grid
        document.getElementById('menu-preset-grid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.preset-card');
            if (!card) return;
            const presetId = card.dataset.presetId;
            const presets = VN.NodeRegistry?.C?.MENU_LAYOUT_PRESETS || [];
            const preset = presets.find(p => p.id === presetId);
            if (!preset) return;

            // Backup items sebelum overwrite
            const backup = JSON.parse(JSON.stringify(hubConfig.menu.items));

            // Apply preset items (deep clone)
            hubConfig.menu.items = JSON.parse(JSON.stringify(preset.items));
            renderMenuBuilderList();

            // Visual feedback
            document.querySelectorAll('#menu-preset-grid .preset-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            VN.Toast.show('Preset menu "' + preset.label + '" diterapkan!', {
                type: 'success',
                duration: 5000,
                actions: [{
                    label: 'Undo',
                    onClick: function () {
                        hubConfig.menu.items = backup;
                        renderMenuBuilderList();
                        document.querySelectorAll('#menu-preset-grid .preset-card').forEach(c => c.classList.remove('active'));
                        VN.Toast.info('Preset menu dibatalkan.');
                    }
                }]
            });
        });

        // ==========================================
        // HUB TEMPLATE PICKER — katalog berkelompok + foto (UX-C01)
        //
        // Dulu picker ini menampilkan SATU grid datar berisi dua jenis kartu:
        // template folder (bertema) dan "template registry" (sceneSet hardcoded
        // yang selalu menghasilkan gaya dasar). Dua masalah menumpuk di situ:
        //
        //   1. Empat template registry ternyata nyaris tak berbeda satu sama lain
        //      — bedanya cuma ada/tidaknya scene splash & credits, sesuatu yang
        //      sudah bisa diatur lewat "Tambah Scene". Kreator yang mencobanya
        //      menemukan hasil yang sama saja. Keempatnya DICABUT, bukan
        //      dirapikan: pilihan yang tak berbeda bukan pilihan.
        //   2. Kartunya hanya emoji + paragraf. Untuk memilih SUSUNAN, paragraf
        //      adalah alat yang salah — "menu di kiri" dan "menu melintang"
        //      terbaca sama saja sampai template benar-benar diterapkan.
        //
        // Sekarang: kartu membawa FOTO template (dipotret `tools/render-thumbnails.js`
        // dari jalur Apply yang sama dengan tombol di panel ini), dan kartunya
        // dikelompokkan per KELUARGA SUSUNAN. Template tanpa metadata taksonomi
        // — buatan kreator, atau paket lama — tetap tampil di grup "Belum
        // dikategorikan" dan tetap bisa dipilih.
        // ==========================================
        (function initTemplatePickerAndExternalButtons() {
            const pickerPanel = document.getElementById('hub-template-picker');
            const overviewPanel = document.getElementById('hub-section-overview');
            if (pickerPanel && overviewPanel && pickerPanel.parentElement !== overviewPanel) {
                overviewPanel.appendChild(pickerPanel);
            }
            const grid = document.getElementById('hub-template-grid');
            if (grid) {
                // Judul & keterangan keluarga susunan. Keterangannya menyebut
                // PERBEDAAN YANG BISA DILIHAT — itu satu-satunya alasan sebuah
                // keluarga pantas jadi sekat di tingkat teratas picker.
                var KELUARGA = {
                    'left-rail': {
                        judul: 'Menu di Kiri',
                        ket: 'Judul dan menu menempati sisi kiri layar; sisanya untuk artwork.'
                    },
                    'center-stack': {
                        judul: 'Tumpukan Tengah',
                        ket: 'Judul di tengah, tombol bertumpuk vertikal di bawahnya.'
                    },
                    'cinematic-bottom': {
                        judul: 'Menu Melintang Bawah',
                        ket: 'Menu berbaris mendatar di dekat dasar layar, judul menepi.'
                    },
                    'split-artwork': {
                        judul: 'Artwork Terbelah',
                        ket: 'Artwork di satu sisi, menu di sisi lain.'
                    },
                    'detail-page': {
                        judul: 'Halaman Detail',
                        ket: 'Bukan menu: info, sinopsis, dan seluruh daftar chapter terlihat sekaligus dalam satu layar yang bisa digulung.'
                    }
                };

                function _thumbUrl(tpl) {
                    // Renderer tahu letak pustaka (pola yang sama dipakai resolusi
                    // novel-hub.html di modul ini); MAIN yang menjawab ada/tidaknya
                    // berkas lewat `hasThumbnail`, karena main yang memegang disk.
                    return 'hub-templates/' + encodeURIComponent(tpl.folder || tpl.id) +
                        '/' + encodeURIComponent(tpl.thumbnail || 'preview.png');
                }

                function _kartu(tpl) {
                    var card = document.createElement('div');
                    card.className = 'template-card';
                    card.dataset.templateId = tpl.id;
                    card.dataset.folderTemplate = '1';
                    card.title = tpl.description || '';

                    // Foto MENGGANTIKAN emoji, tidak menemaninya: kartu yang sudah
                    // memperlihatkan wujud template tak butuh ikon dekoratif di
                    // atasnya (aturan emoji §9.6). Emoji hanya dipakai sebagai
                    // pengganti saat template belum punya foto — mis. template
                    // buatan kreator sendiri.
                    var muka = tpl.hasThumbnail
                        ? '<div class="template-card-shot">' +
                          '<img src="' + escapeHTML(_thumbUrl(tpl)) + '" alt="" loading="lazy">' +
                          '</div>'
                        : '<div class="template-card-shot template-card-shot-kosong">' +
                          '<span class="template-card-icon">' + escapeHTML(tpl.icon) + '</span>' +
                          '<span class="template-card-shot-note">tanpa foto</span>' +
                          '</div>';

                    card.innerHTML = muka +
                        '<div class="template-card-name">' + escapeHTML(tpl.label) + '</div>' +
                        '<div class="template-card-desc">' + escapeHTML(tpl.description) + '</div>' +
                        '<div class="template-card-badge">' + (tpl.sceneCount || 0) + ' scene</div>';
                    return card;
                }

                function _blok(judul, ket, isi) {
                    var blok = document.createElement('div');
                    blok.className = 'preset-group';
                    var head = document.createElement('div');
                    head.className = 'preset-group-head';
                    head.innerHTML = '<span class="preset-group-title">' + escapeHTML(judul) + '</span>' +
                        '<span class="field-hint">' + escapeHTML(ket) + '</span>';
                    blok.appendChild(head);
                    var body = document.createElement('div');
                    body.className = 'preset-group-body';
                    isi.forEach(function (tpl) { body.appendChild(_kartu(tpl)); });
                    blok.appendChild(body);
                    return blok;
                }

                /**
                 * Susun katalog: keluarga susunan dulu, lalu blueprint lengkap,
                 * lalu yang belum dikategorikan. Template TANPA metadata taksonomi
                 * tidak ditebak-tebak — ia jatuh ke grup terakhir dan TETAP bisa
                 * dipilih. Ini yang menjaga template pihak ketiga/lama tetap hidup.
                 */
                function _renderKatalog(templates) {
                    grid.innerHTML = '';

                    var perKeluarga = {};
                    var urutanKeluarga = [];
                    var advanced = [];
                    var lain = [];

                    templates.forEach(function (tpl) {
                        if (tpl.kind === 'advanced') { advanced.push(tpl); return; }
                        if (tpl.kind === 'layout' && tpl.layoutFamily) {
                            if (!perKeluarga[tpl.layoutFamily]) {
                                perKeluarga[tpl.layoutFamily] = [];
                                urutanKeluarga.push(tpl.layoutFamily);
                            }
                            perKeluarga[tpl.layoutFamily].push(tpl);
                            return;
                        }
                        lain.push(tpl);
                    });

                    urutanKeluarga.forEach(function (fam) {
                        var meta = KELUARGA[fam] || { judul: fam, ket: '' };
                        grid.appendChild(_blok(meta.judul, meta.ket, perKeluarga[fam]));
                    });

                    if (advanced.length) {
                        grid.appendChild(_blok('Blueprint Lengkap',
                            'Bukan sekadar susunan: membawa scene tambahan dan hub.js yang berjalan.',
                            advanced));
                    }

                    if (lain.length) {
                        grid.appendChild(_blok('Belum Dikategorikan',
                            'Template tanpa metadata keluarga — tetap bisa dipakai seperti biasa.',
                            lain));
                    }
                }

                function _renderKosong(pesan) {
                    grid.innerHTML = '<p class="field-hint">' + escapeHTML(pesan) + '</p>';
                }

                ipcRenderer.invoke('hub:list-code-templates').then(function (res) {
                    if (res && res.success && Array.isArray(res.templates) && res.templates.length) {
                        _renderKatalog(res.templates);
                    } else {
                        // Grid kosong TANPA penjelasan adalah kelas cacat tersendiri:
                        // kreator tak bisa membedakan "belum dimuat" dari "memang
                        // tak ada". Sejak kartu registry dicabut, pustaka folder
                        // adalah satu-satunya sumber — jadi kosong harus bicara.
                        _renderKosong('Tidak ada template Hub terbaca di aset/game/hub-templates/.');
                    }
                    updateHubOverviewState(); // sorot ulang template aktif
                }).catch(function (err) {
                    _renderKosong('Gagal memuat daftar template Hub: ' +
                        ((err && err.message) || 'penyebab tidak diketahui'));
                });

                grid.addEventListener('click', function (e) {
                    const card = e.target.closest('.template-card');
                    if (!card) return;
                    var nameEl = card.querySelector('.template-card-name');
                    applyFolderTemplate(card.dataset.templateId,
                        nameEl ? nameEl.textContent : card.dataset.templateId);
                    grid.querySelectorAll('.template-card').forEach(function (c) { c.classList.remove('active'); });
                    card.classList.add('active');
                });
            }

            // Picker kini permanen di panel Template — tak ada lagi tombol 'Ganti
            // Template' (redundan dengan panel ini) maupun 'Lewati, Atur Manual'.
            // Yang tersisa: menandai template mana yang SEDANG dipakai.
            window.showTemplatePickerIfDefault = function () {
                updateHubOverviewState();
            };

            // === Open in VS Code Button ===
            var vsCodeBtn = document.getElementById('open-in-vscode-btn');
            if (vsCodeBtn) {
                vsCodeBtn.addEventListener('click', async function () {
                    if (!currentlyEditingNovel) return;
                    try {
                        await ipcRenderer.invoke('open-in-external-editor', {
                            novelTitle: currentlyEditingNovel,
                            editor: 'vscode'
                        });
                    } catch (err) {
                        if (typeof showNotification === 'function') {
                            showNotification('Gagal membuka VS Code: ' + err.message, 'error');
                        }
                    }
                });
            }

            // === Open Folder Button ===
            var openFolderBtn = document.getElementById('open-folder-btn');
            if (openFolderBtn) {
                openFolderBtn.addEventListener('click', async function () {
                    if (!currentlyEditingNovel) return;
                    try {
                        await ipcRenderer.invoke('open-in-external-editor', {
                            novelTitle: currentlyEditingNovel,
                            editor: 'folder'
                        });
                    } catch (err) {
                        if (typeof showNotification === 'function') {
                            showNotification('Gagal membuka folder: ' + err.message, 'error');
                        }
                    }
                });
            }
        })();

        // ==========================================
        // HUB PREVIEW FRAME — Embed real novel-hub.html via webview
        // ==========================================

        var _hubPreviewFrame = null;
        var _hubPreviewTimer = null;
        var _hubPreviewDriveTimer = null;
        var _hubPreviewModeChangeTimer = null;
        var _hubPreviewSceneDriveRevision = 0;
        var _hubPreviewModeChangeRevision = 0;
        var _hubPreviewContextSent = false;

        // Scene yang SEDANG tampil di Live preview (hasil resolve dari screenId runtime).
        // Disimpan terpisah dari render agar animasi bertahan saat hub-scene-list
        // di-render ulang (renderHubSceneList menghapus innerHTML tiap edit).
        var _hubPreviewShownSceneId = null;

        // Sorot item scene yang sedang tampil di Live preview ("warna mengalir").
        // Idempoten: aman dipanggil ulang setiap kali daftar di-render.
        function _applyHubPreviewHighlight() {
            var list = document.getElementById('hub-scene-list');
            if (!list) return;
            var liveOn = !!(_hubPreviewFrame && _hubPreviewFrame.getMode &&
                _hubPreviewFrame.getMode() === 'live') && !!_hubPreviewShownSceneId;
            var items = list.querySelectorAll('.hub-scene-item');
            for (var i = 0; i < items.length; i++) {
                var match = liveOn && items[i].dataset.sceneId === _hubPreviewShownSceneId;
                items[i].classList.toggle('preview-playing', match);
            }
        }

        // Dipanggil saat preview melaporkan scene/layar yang sedang tampil ('hub:scene-shown').
        // Sumber laporan beragam:
        //   - Generated Hub (novel-hub.html): { screen: 'main-menu' }
        //   - Custom code-first (hub.html):   { sceneType: 'main_menu', sceneId, sceneName }
        function _onHubPreviewSceneShown(detail) {
            detail = detail || {};
            var cfg = window.hubConfig || {};
            var scenes = Array.isArray(cfg.scenes) ? cfg.scenes : [];
            var HS = VN.HubScenes || {};
            var sceneId = null;

            // 1) ID langsung (bila hub.html & config sinkron)
            if (detail.sceneId && scenes.some(function (s) { return s && s.id === detail.sceneId; })) {
                sceneId = detail.sceneId;
            }
            // 2) Lewat data-scene-type (hub custom code-first — ID section bisa beda dari config)
            if (!sceneId && detail.sceneType && HS.resolveSceneIdForType) {
                sceneId = HS.resolveSceneIdForType(cfg, detail.sceneType);
            }
            // 3) Lewat screenId runtime (Generated Hub)
            if (!sceneId && detail.screen && HS.resolveSceneIdForScreen) {
                sceneId = HS.resolveSceneIdForScreen(cfg, detail.screen);
            }

            if (sceneId === _hubPreviewShownSceneId) return;
            _hubPreviewShownSceneId = sceneId;
            _applyHubPreviewHighlight();
        }

        // ID scene pertama (urut order) — fallback target Per-scene saat tak ada yang dipilih.
        function _firstHubSceneId() {
            var scenes = (window.hubConfig && Array.isArray(window.hubConfig.scenes)) ? window.hubConfig.scenes.slice() : [];
            scenes.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
            return scenes.length ? scenes[0].id : null;
        }

        // HUB_PREVIEW_SCENE_LOCK_BUILDERS_START
        // Script ini berjalan di world preview. Lock memakai atribut milik editor +
        // class `active`; target TIDAK pernah diberi inline `display`, sehingga
        // display:flex/grid milik template tetap menjadi sumber layout sebenarnya.
        // Revision menahan executeJavaScript lama yang selesai setelah pilihan/mode baru.
        function _buildHubPreviewSceneLockScript(sceneId, screen, revision) {
            return '(function(){'
                + 'var revision=' + JSON.stringify(revision) + ';'
                + 'var sceneId=' + JSON.stringify(sceneId) + ';'
                + 'var screenId=' + JSON.stringify(screen || null) + ';'
                + 'var previous=window.__vnHubPreviewSceneLock;'
                + 'if(previous&&previous.revision>revision)return false;'
                + 'if(previous&&typeof previous.release==="function")previous.release();'
                + 'var custom=Array.prototype.slice.call(document.querySelectorAll(".hub-scene[data-scene-id]"));'
                + 'var target=null;'
                + 'for(var i=0;i<custom.length;i++){if(custom[i].getAttribute("data-scene-id")===sceneId){target=custom[i];break;}}'
                + 'var kind="custom";var members=custom;'
                + 'if(!target&&screenId){kind="generated";members=Array.prototype.slice.call(document.querySelectorAll(".hub-screen"));var wanted="screen-"+String(screenId).replace(/_/g,"-");for(var j=0;j<members.length;j++){if(members[j].id===wanted){target=members[j];break;}}}'
                + 'if(!target){window.__vnHubPreviewSceneLock={revision:revision,release:function(){}};return false;}'
                + 'var marker="data-vn-preview-scene-hidden";var rootMarker="data-vn-hub-preview-scene-lock";'
                + 'var records=[];var known=[];var applying=false;var classObserver=null;'
                + 'function remember(el){if(known.indexOf(el)>=0)return;known.push(el);records.push({el:el,classAttr:el.getAttribute("class"),markerAttr:el.getAttribute(marker)});if(classObserver)classObserver.observe(el,{attributes:true,attributeFilter:["class"]});}'
                + 'function collect(){var selector=kind==="custom"?".hub-scene[data-scene-id]":".hub-screen";members=Array.prototype.slice.call(document.querySelectorAll(selector));for(var n=0;n<members.length;n++)remember(members[n]);}'
                + 'function resolveTarget(){for(var n=0;n<members.length;n++){if(kind==="custom"?members[n].getAttribute("data-scene-id")===sceneId:members[n].id==="screen-"+String(screenId).replace(/_/g,"-"))return members[n];}return null;}'
                + 'function enforce(){if(applying)return;applying=true;collect();target=resolveTarget();if(target){if(document.documentElement.getAttribute(rootMarker)!=="true")document.documentElement.setAttribute(rootMarker,"true");for(var n=0;n<members.length;n++){var el=members[n];var selected=el===target;if(selected){if(el.hasAttribute(marker))el.removeAttribute(marker);if(!el.classList.contains("active"))el.classList.add("active");}else{if(el.getAttribute(marker)!=="true")el.setAttribute(marker,"true");if(el.classList.contains("active"))el.classList.remove("active");}}}applying=false;}'
                + 'var style=document.createElement("style");style.setAttribute("data-vn-preview-owned","scene-lock-"+revision);style.textContent="html["+rootMarker+"] ["+marker+"=\\"true\\"]{display:none!important;visibility:hidden!important;pointer-events:none!important;}";(document.head||document.documentElement).appendChild(style);'
                + 'classObserver=new MutationObserver(function(){if(!applying)enforce();});var treeObserver=new MutationObserver(function(muts){for(var n=0;n<muts.length;n++){if(muts[n].addedNodes&&muts[n].addedNodes.length){enforce();break;}}});treeObserver.observe(document.documentElement,{subtree:true,childList:true});'
                + 'var state={revision:revision,release:function(){classObserver.disconnect();treeObserver.disconnect();for(var n=0;n<records.length;n++){var rec=records[n];if(!rec.el||!rec.el.setAttribute)continue;if(rec.classAttr===null)rec.el.removeAttribute("class");else rec.el.setAttribute("class",rec.classAttr);if(rec.markerAttr===null)rec.el.removeAttribute(marker);else rec.el.setAttribute(marker,rec.markerAttr);}document.documentElement.removeAttribute(rootMarker);if(style&&style.parentNode)style.parentNode.removeChild(style);if(window.__vnHubPreviewSceneLock===state)window.__vnHubPreviewSceneLock=null;}};'
                + 'window.__vnHubPreviewSceneLock=state;enforce();return true;'
                + '})();';
        }

        function _buildHubPreviewSceneReleaseScript(revision) {
            return '(function(){'
                + 'var revision=' + JSON.stringify(revision) + ';'
                + 'var state=window.__vnHubPreviewSceneLock;'
                + 'if(state&&state.revision>revision)return false;'
                + 'if(state&&typeof state.release==="function")state.release();'
                // Tombstone revision mencegah drive lama mengunci kembali sesudah release.
                + 'window.__vnHubPreviewSceneLock={revision:revision,release:function(){window.__vnHubPreviewSceneLock=null;}};'
                + 'return true;})();';
        }
        // HUB_PREVIEW_SCENE_LOCK_BUILDERS_END

        function _releaseHubPreviewScene() {
            clearTimeout(_hubPreviewDriveTimer);
            _hubPreviewDriveTimer = null;
            var revision = ++_hubPreviewSceneDriveRevision;
            var wv = _hubPreviewFrame && _hubPreviewFrame.getWebview && _hubPreviewFrame.getWebview();
            if (!wv || !wv.executeJavaScript) return Promise.resolve(false);
            try {
                var result = wv.executeJavaScript(_buildHubPreviewSceneReleaseScript(revision));
                return result && typeof result.then === 'function'
                    ? result.catch(function () { return false; })
                    : Promise.resolve(result);
            } catch (e) {
                return Promise.resolve(false);
            }
        }

        // Live dan Per-scene berbagi renderer webview, tetapi tidak boleh berbagi
        // lifecycle runtime: timer splash/transisi dari mode sebelumnya bisa tetap
        // berjalan. Release lock lalu reload sekali pada boundary mode agar runtime
        // tujuan selalu dimulai dari state canonical. Token mencegah reload stale.
        function _handleHubPreviewModeChange(mode) {
            var modeRevision = ++_hubPreviewModeChangeRevision;
            clearTimeout(_hubPreviewDriveTimer);
            _hubPreviewDriveTimer = null;
            _hubPreviewShownSceneId = null;
            _applyHubPreviewHighlight();
            clearTimeout(_hubPreviewModeChangeTimer);
            _hubPreviewModeChangeTimer = setTimeout(function () {
                _hubPreviewModeChangeTimer = null;
                _releaseHubPreviewScene().then(function () {
                    if (modeRevision !== _hubPreviewModeChangeRevision) return;
                    if (!_hubPreviewFrame || !_hubPreviewFrame.getMode || _hubPreviewFrame.getMode() !== mode) return;
                    if (typeof _hubPreviewFrame.reload === 'function') {
                        try { _hubPreviewFrame.reload(); return; } catch (e) { /* fallback drive di bawah */ }
                    }
                    if (mode === 'per-scene') _driveHubPreviewToScene(window.activeHubSceneId || _firstHubSceneId());
                });
            // Satu burst klik mode hanya menghasilkan satu release/reload. Jeda
            // pendek ini tidak terasa di UI, tetapi mencegah antrean reload webview
            // menumpuk bila toggle ditekan cepat/otomatis.
            }, 40);
        }

        function _driveHubPreviewToScene(sceneId) {
            if (!_hubPreviewFrame || !_hubPreviewFrame.getMode || _hubPreviewFrame.getMode() !== 'per-scene') return;
            var wv = _hubPreviewFrame.getWebview && _hubPreviewFrame.getWebview();
            if (!wv || !sceneId) return;
            var scenes = (window.hubConfig && Array.isArray(window.hubConfig.scenes)) ? window.hubConfig.scenes : [];
            var scene = scenes.filter(function (s) { return s && s.id === sceneId; })[0];
            if (!scene) return;
            var type = scene.type;

            // Generated Hub: lewat screen mapping + IPC.
            var screen = (VN.HubScenes && VN.HubScenes.typeToScreen) ? VN.HubScenes.typeToScreen(type) : null;
            if (screen) { try { wv.send('preview:goto-screen', { screen: screen }); } catch (e) { /* webview belum siap */ } }

            // Lock DOM mencocokkan scene ID secara persis. Untuk Generated Hub,
            // builder jatuh ke screen mapping karena markup runtime tidak memiliki
            // data-scene-id. Tidak ada inline display yang ditulis ke target.
            var revision = ++_hubPreviewSceneDriveRevision;
            var js = _buildHubPreviewSceneLockScript(sceneId, screen, revision);
            try {
                var lockResult = wv.executeJavaScript(js);
                if (lockResult && lockResult.catch) lockResult.catch(function () {});
            } catch (e) { /* webview belum siap */ }
        }
        window._driveHubPreviewToScene = _driveHubPreviewToScene;

        // Metadata novel yang di-load dari IPC — dipakai oleh preview agar lengkap
        var _loadedNovelMeta = {};

        function _buildHubContextPayload() {
            var novelDir = currentlyEditingNovel
                ? path.join(__dirname, 'visual_novels', currentlyEditingNovel).replace(/\\/g, '/')
                : '';
            var novelPathNorm = novelDir ? (novelDir + '/') : '';

            // Gabungkan metadata dari disk (_loadedNovelMeta) dengan nilai live dari form editor
            var metaData = Object.assign({}, _loadedNovelMeta);
            metaData.storyDesc = (document.getElementById('editor-story-desc') || {}).value || metaData.storyDesc || '';
            metaData.description = (document.getElementById('editor-description') || {}).value || metaData.description || '';
            metaData.genre = (document.getElementById('editor-genre') || {}).value || metaData.genre || '';
            metaData.author = (document.getElementById('editor-author') || {}).value || metaData.author || '';
            metaData.illustrator = (document.getElementById('editor-illustrator') || {}).value || metaData.illustrator || '';
            metaData.vnMapper = (document.getElementById('editor-vn-mapper') || {}).value || metaData.vnMapper || '';
            metaData.version = (document.getElementById('editor-novel-version') || {}).value || metaData.version || '';

            return {
                storyTitle: currentlyEditingNovel || 'Novel',
                novelPath: novelPathNorm,
                metaData: metaData,
                hubConfig: window.hubConfig || {}
            };
        }

        // Rekonsiliasi ringan setelah checked-save. Caller sudah memegang guard
        // snapshot/target; helper ini tetap menolak novel stale dan tidak pernah
        // mengganti object hubConfig, mereset workspace, atau menandai dokumen clean.
        function reconcileHubEditorAfterSave(payload) {
            payload = payload || {};
            if (!payload.novelTitle || payload.novelTitle !== currentlyEditingNovel) return false;
            if (payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)) {
                _loadedNovelMeta = Object.assign({}, _loadedNovelMeta, payload.meta);
                var savedCover = _loadedNovelMeta.cover || '';
                if (typeof window._setCoverCard === 'function') {
                    var coverAbs = savedCover
                        ? path.join(__dirname, 'visual_novels', currentlyEditingNovel, savedCover)
                        : '';
                    window._setCoverCard(savedCover ? {
                        src: 'file:///' + coverAbs.replace(/\\/g, '/'),
                        fsPath: coverAbs,
                        fileName: savedCover
                    } : null);
                }
                videoPreviewName.textContent = 'Belum ada video dipilih';
                var savedVideoLabel = document.getElementById('video-upload-label');
                if (savedVideoLabel) savedVideoLabel.classList.remove('file-selected');
                _reconstructExistingMedia(currentlyEditingNovel, _loadedNovelMeta.promotionalVideo || '');
            }
            refreshHubPreview();
            return true;
        }
        window.reconcileHubEditorAfterSave = reconcileHubEditorAfterSave;

        function escapeHTML(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        function initHubPreview() {
            var container = document.getElementById('hub-preview-frame');
            if (!container || _hubPreviewFrame) return;

            // Pilih file hub sesuai hubType — sama seperti runtime
            var currentHubConfig = window.hubConfig || {};
            var hubHtmlPath;
            var useCustomHub = currentHubConfig.hubType === 'custom' && currentHubConfig.hubModeConfirmed === true && !!currentlyEditingNovel;
            if (useCustomHub) {
                var customPath = path.join(__dirname, 'visual_novels', currentlyEditingNovel, 'hub.html');
                var fsNode = require('fs');
                hubHtmlPath = fsNode.existsSync(customPath) ? customPath : path.join(__dirname, 'hub-templates', '_global', 'novel-hub.html');
                useCustomHub = fsNode.existsSync(customPath);
            } else {
                hubHtmlPath = path.join(__dirname, 'hub-templates', '_global', 'novel-hub.html');
            }
            var liveURL = 'file:///' + hubHtmlPath.replace(/\\/g, '/');

            _hubPreviewContextSent = false;

            _hubPreviewFrame = new VN.PreviewFrame('hub-preview-frame', {
                title: 'Hub Preview',
                diagSource: 'hub',
                // Per-scene: tampilkan hanya scene terpilih (kunci 1 layar).
                // Live: jalankan seluruh alur hub seperti yang dilihat pemain.
                // Keduanya memakai webview runtime asli (bukan renderer kedua).
                modes: [
                    { id: 'per-scene', label: 'Per-scene', title: 'Tampilkan hanya scene yang dipilih', renderer: 'webview' },
                    { id: 'live', label: 'Live', title: 'Jalankan seluruh alur hub', renderer: 'webview' }
                ],
                defaultMode: 'live',
                liveURL: liveURL,
                preloadSrc: path.join(__dirname, 'vnModules', 'preview', 'preview-preload.js'),
                buildSrcdoc: null,
                configChannel: 'preview:apply-hub-config',
                onModeChange: function (mode) {
                    _handleHubPreviewModeChange(mode);
                },
                onIpcMessage: function (channel, args) {
                    if (channel === 'hub:scene-shown') _onHubPreviewSceneShown(args && args[0]);
                },
                onWebviewReady: function (webview) {
                    clearTimeout(_hubPreviewDriveTimer);
                    _hubPreviewDriveTimer = null;
                    // Inject hub context saat webview selesai load novel-hub.html
                    _hubPreviewContextSent = false;
                    // Reset highlight: runtime akan melaporkan ulang lewat 'hub:scene-shown'.
                    _hubPreviewShownSceneId = null;
                    _applyHubPreviewHighlight();
                    var contextPayload = _buildHubContextPayload();
                    var injectScript = ''
                        + 'window.__previewMode = true;'
                        + 'window.__previewNovelTitle = ' + JSON.stringify(contextPayload.storyTitle) + ';'
                        + 'window.__previewBasePath = ' + JSON.stringify(contextPayload.novelPath) + ';'
                        // Catatan: forwarding navigasi dilakukan oleh runtime sendiri (novel-hub.html
                        // navigateTo → ipcRenderer.sendToHost('hub:scene-shown')), karena injeksi via
                        // executeJavaScript berjalan di isolated world & tak bisa melihat global runtime.
                        // Intercept play-chapter agar hub preview tidak memulai game
                        + '(function() {'
                        + '  var _origSend = require("electron").ipcRenderer.send;'
                        + '  require("electron").ipcRenderer.send = function(ch) {'
                        + '    if (ch === "play-chapter" && window.__previewMode) {'
                        + '      console.log("[Hub Preview] play-chapter diblokir dalam mode preview.");'
                        + '      return;'
                        + '    }'
                        + '    return _origSend.apply(this, arguments);'
                        + '  };'
                        + '})();'
                        // Observer hub custom code-first: DOM dibagi antar-world, jadi walau injeksi ini
                        // di isolated world ia tetap bisa membaca <section.hub-scene.active> & sendToHost.
                        // Cocokkan di editor via data-scene-type (ID section hub.html bisa beda dari config).
                        + '(function(){'
                        + '  var ipc; try { ipc = require("electron").ipcRenderer; } catch (e) { return; }'
                        + '  function rep(el){ if(!el) return; try { ipc.sendToHost("hub:scene-shown", { sceneId: el.getAttribute("data-scene-id"), sceneType: el.getAttribute("data-scene-type"), sceneName: el.getAttribute("data-scene-name") }); } catch(e){} }'
                        + '  var secs = document.querySelectorAll(".hub-scene[data-scene-id]");'
                        + '  if (!secs.length) return;'                 // hub generated (.hub-screen) → ditangani navigateTo
                        + '  rep(document.querySelector(".hub-scene.active[data-scene-id]"));'
                        + '  if (window.__vnHubSceneObs) return; window.__vnHubSceneObs = true;'
                        + '  var obs = new MutationObserver(function(muts){ for (var i=0;i<muts.length;i++){ var t=muts[i].target; if (t.classList && t.classList.contains("active") && t.hasAttribute("data-scene-id")) { rep(t); break; } } });'
                        + '  Array.prototype.forEach.call(secs, function(s){ obs.observe(s, { attributes:true, attributeFilter:["class","style"] }); });'
                        + '})();'
                        + 'require("electron").ipcRenderer.emit("vn-engine:set-hub-context", null, ' + JSON.stringify(contextPayload) + ');';
                    var injectContext = function () {
                        return webview.executeJavaScript(injectScript).then(function () {
                            _hubPreviewContextSent = true;
                        }).catch(function () {});
                    };
                    try {
                        if (useCustomHub) {
                            var jsDir = path.join(__dirname, '..', '..', 'vn-player', 'js');
                            var bridgeCode = require('fs').readFileSync(path.join(jsDir, 'vn-hub-api.js'), 'utf-8');
                            var runtimeCode = require('fs').readFileSync(path.join(jsDir, 'vn-hub-runtime.js'), 'utf-8');
                            webview.executeJavaScript(bridgeCode + '\n;\n' + runtimeCode).then(injectContext).catch(function () {});
                        } else {
                            injectContext();
                        }
                    } catch (e) { /* webview not ready */ }

                    // Bila sedang mode Per-scene, kunci ke scene terpilih setelah runtime sempat init.
                    if (_hubPreviewFrame && _hubPreviewFrame.getMode && _hubPreviewFrame.getMode() === 'per-scene') {
                        clearTimeout(_hubPreviewDriveTimer);
                        _hubPreviewDriveTimer = setTimeout(function () {
                            _hubPreviewDriveTimer = null;
                            _driveHubPreviewToScene(window.activeHubSceneId || _firstHubSceneId());
                        }, 250);
                    }
                }
            });
            _hubPreviewFrame.mount();
        }

        function refreshHubPreview() {
            if (!_hubPreviewFrame) return;
            updateHubOverviewState();
            // Push config ke embedded webview
            _hubPreviewFrame.sendConfig(window.hubConfig || {});
            var embeddedWebview = _hubPreviewFrame.getWebview && _hubPreviewFrame.getWebview();
            if (embeddedWebview && embeddedWebview.send) {
                embeddedWebview.send('preview:apply-hub-meta', _buildHubContextPayload().metaData);
            }
            ipcRenderer.invoke('vn-engine:push-hub-meta', { metaData: _buildHubContextPayload().metaData }).catch(function() {});
            // Hot-reload: push config to external preview window if open
            ipcRenderer.invoke('vn-engine:push-hub-config', { config: window.hubConfig || {} }).catch(function() {});
        }

        function scheduleHubPreviewRefresh() {
            clearTimeout(_hubPreviewTimer);
            _hubPreviewTimer = setTimeout(refreshHubPreview, VN.Config.PREVIEW_DEBOUNCE_MS);
        }

        // FB11: apply/undo template menulis ULANG hub.html (+hub.css) di disk —
        // perubahan STRUKTURAL yang tak terbaca preview lewat sekadar push config.
        // Sejalan _hardReloadPreview di VN Player (FB5): bongkar + init ulang agar
        // webview memuat file baru. No-op bila preview belum ada (mis. tab lain).
        function reloadHubPreview() {
            if (!_hubPreviewFrame) return;
            destroyHubPreview();
            initHubPreview();
        }
        window.reloadHubPreview = reloadHubPreview;

        function destroyHubPreview() {
            clearTimeout(_hubPreviewTimer);
            _hubPreviewTimer = null;
            clearTimeout(_hubPreviewDriveTimer);
            _hubPreviewDriveTimer = null;
            clearTimeout(_hubPreviewModeChangeTimer);
            _hubPreviewModeChangeTimer = null;
            ++_hubPreviewModeChangeRevision;
            if (_hubPreviewFrame) {
                // Best effort: lepas atribut/observer preview sebelum webview dibuang.
                // Frame tetap langsung dihancurkan; rejection executeJavaScript ditelan helper.
                _releaseHubPreviewScene();
                _hubPreviewFrame.destroy();
                _hubPreviewFrame = null;
                _hubPreviewContextSent = false;
                _hubPreviewShownSceneId = null;
            }
        }

        // Expose for use by other modules
        window.initHubPreview = initHubPreview;
        window.destroyHubPreview = destroyHubPreview;
        window.refreshHubPreview = refreshHubPreview;
        window.scheduleHubPreviewRefresh = scheduleHubPreviewRefresh;

        // Auto-refresh: catch all input/change events inside hub editing wrapper
        (function () {
            var wrapper = document.getElementById('hub-editing-wrapper');
            if (!wrapper) return;
            wrapper.addEventListener('input', function () { scheduleHubPreviewRefresh(); scheduleHubSnapshot(); scheduleHubSceneListRefresh(); });
            wrapper.addEventListener('change', function () { scheduleHubPreviewRefresh(); scheduleHubSnapshot(); scheduleHubSceneListRefresh(); });
            var profileWrapper = document.getElementById('novel-profile-wrapper');
            if (profileWrapper) {
                profileWrapper.addEventListener('input', scheduleHubPreviewRefresh);
                profileWrapper.addEventListener('change', scheduleHubPreviewRefresh);
            }
        })();

        // ==========================================
        // EVENT: SIMPAN & BUAT NOVEL
        // ==========================================

        confirmCreateBtn.addEventListener('click', handleCreateNovel);
        cancelCreateBtn.addEventListener('click', hideCreateNovelModal);
        // Tombol Simpan GLOBAL wajib melewati Document Registry agar script,
        // terjemahan, manifest, achievement, kode Player, profil, Hub, dan Player
        // mengikuti checked-result + urutan save yang sama dengan Back/Launch.
        editorSaveBtn.addEventListener('click', async function () {
            try {
                if (typeof window.saveAllNovelChanges === 'function') {
                    await window.saveAllNovelChanges();
                } else {
                    // Fallback hanya untuk build/tes terisolasi sebelum scriptEditor
                    // selesai memasang orkestrator global.
                    await handleUpdateNovel('all');
                }
            } catch (error) {
                console.error('Gagal menjalankan Simpan Semua:', error);
                showNotification('Gagal menyimpan semua perubahan: ' + error.message, 'error');
            }
        });

        newNovelTitleInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                handleCreateNovel();
            }
        });

        // ==========================================
        // HUB TOOLBAR BUTTONS (Controls Bar)
        // ==========================================
        (function() {
            var undoBtn = document.getElementById('undo-hub-btn');
            var redoBtn = document.getElementById('redo-hub-btn');
            if (undoBtn) undoBtn.addEventListener('click', undoHubConfig);
            if (redoBtn) redoBtn.addEventListener('click', redoHubConfig);

            var previewBtn = document.getElementById('btn-preview-hub');
            if (previewBtn) previewBtn.addEventListener('click', function() {
                refreshHubPreview();
                VN.Toast.info('Preview Hub diperbarui.');
            });

            var runBtn = document.getElementById('btn-run-hub');
            if (runBtn) runBtn.addEventListener('click', async function() {
                if (!currentlyEditingNovel) {
                    VN.Toast.warning('Belum ada novel yang dipilih.');
                    return;
                }
                try {
                    runBtn.disabled = true;
                    runBtn.textContent = '⏳ Membuka Hub…';
                    var savedConfigResult = await ipcRenderer.invoke('get-hub-config', currentlyEditingNovel);
                    var savedMetaResult = await ipcRenderer.invoke('get-hub-details', currentlyEditingNovel);
                    var runtimeConfig = savedConfigResult && savedConfigResult.success
                        ? savedConfigResult.config
                        : hubConfig;
                    var result = await ipcRenderer.invoke('vn-engine:preview-hub', {
                        novelTitle: currentlyEditingNovel,
                        hubConfig: runtimeConfig,
                        metaData: savedMetaResult && savedMetaResult.success ? savedMetaResult : {}
                    });
                    if (result && result.success) {
                        VN.Toast.success('Hub dibuka di jendela preview.');
                    } else {
                        VN.Toast.error('Gagal membuka Hub: ' + (result && result.message || 'Unknown error'));
                    }
                } catch (err) {
                    VN.Toast.error('Gagal membuka Hub: ' + err.message);
                } finally {
                    runBtn.disabled = false;
                    runBtn.textContent = '▶ Jalankan Hub';
                }
            });
        })();
