/**
 * state.js — Central State Management, Referensi DOM & Workspace Router
 * Fase 3: Editor State & Workspace
 *
 * Single source of truth untuk:
 *   1. VN.Events    — Event bus untuk komunikasi antar modul
 *   2. VN.DOM       — Referensi elemen DOM yang dibagi antar modul
 *   3. VN.State     — State management reaktif dengan event saat berubah
 *   4. VN.Workspace — Router view dengan lifecycle mount/unmount
 *
 * Backward Compatibility:
 *   Semua variabel global lama (storyGrid, currentlyEditing, dsb.)
 *   di-bridge ke VN.DOM/VN.State sehingga kode lama tetap berfungsi.
 */
window.VN = window.VN || {};

// Shared configuration constants
VN.Config = {
    PREVIEW_DEBOUNCE_MS: 350
};

// ======================================================================
// 1. EVENT BUS — Komunikasi antar modul tanpa coupling langsung
// ======================================================================
VN.Events = {
    _listeners: {},

    /**
     * Dengarkan event. Mengembalikan fungsi unsubscribe.
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    },

    off(event, callback) {
        const list = this._listeners[event];
        if (!list) return;
        this._listeners[event] = list.filter(cb => cb !== callback);
    },

    emit(event, data) {
        const list = this._listeners[event];
        if (!list) return;
        list.forEach(cb => {
            try { cb(data); } catch (e) { console.error(`[VN.Events] Error di listener '${event}':`, e); }
        });
    }
};

// ======================================================================
// 2. DOM REFERENCES — Semua elemen DOM yang dibagi antar modul
// ======================================================================
VN.DOM = {
    // --- Intro & Main Menu ---
    introScene:               document.getElementById('intro-scene'),
    backgroundVideo:          document.querySelector('.background-video'),
    videoOverlay:             document.querySelector('.video-overlay'),
    storyGrid:                document.getElementById('story-grid'),
    searchInput:              document.getElementById('searchInput'),
    searchBtn:                document.getElementById('searchBtn'),
    switchLayoutBtn:          document.getElementById('switchLayoutBtn'),
    prevBtn:                  document.getElementById('prevBtn'),
    nextBtn:                  document.getElementById('nextBtn'),

    // --- Create Novel Modal ---
    createNovelModal:         document.getElementById('create-novel-modal'),
    newNovelTitleInput:       document.getElementById('new-novel-title-input'),
    newNovelDescInput:        document.getElementById('new-novel-desc-input'),
    confirmCreateBtn:         document.getElementById('confirm-create-btn'),
    cancelCreateBtn:          document.getElementById('cancel-create-btn'),
    newNovelCoverInput:       document.getElementById('new-novel-cover-input'),
    imagePreview:             document.getElementById('modal-image-preview'),
    coverUploadLabel:         document.getElementById('cover-upload-label'),

    // --- Hub Editor ---
    editorSaveBtn:            document.getElementById('editor-save-btn'),
    novelProfileWrapper:       document.getElementById('novel-profile-wrapper'),
    hubEditingWrapper:        document.getElementById('hub-editing-wrapper'),
    editorBackgroundVideoInput: document.getElementById('editor-background-video-input'),
    videoPreviewName:         document.getElementById('video-preview-name'),

    // --- Workspace / Script Editor ---
    scriptEditorOverlay:      document.getElementById('script-editor-overlay'),
    closeEditorBtn:           document.getElementById('close-editor-btn'),
    editorNovelSelectionScreen: document.getElementById('editor-novel-selection-screen'),
    editorNovelList:          document.getElementById('editor-novel-list'),
    editorMainScreen:         document.getElementById('editor-main-screen'),
    backToNovelSelectionBtn:  document.getElementById('back-to-novel-selection-btn'),
    editingNovelName:         document.getElementById('editing-novel-name'),
    editorChapterListEditable: document.getElementById('editor-chapter-list-editable'),
    scriptEditorArea:         document.getElementById('script-editor-area'),
    workspaceControlsBar:     document.getElementById('workspace-controls-bar'),
    saveScriptBtn:            document.getElementById('save-script-btn'),
    editingChapterName:       document.getElementById('editing-chapter-name'),
    scriptEditingWrapper:     document.getElementById('script-editing-wrapper'),
    chapterManifestWrapper:   document.getElementById('chapter-manifest-wrapper'),
    translationWrapper:       document.getElementById('translation-wrapper'),
    globalAssetView:          document.getElementById('global-asset-view'),
    assetPreviewContainer:    document.getElementById('asset-preview-container'),
    chapterAssetExplorer:     document.getElementById('chapter-asset-explorer'),
};

// ======================================================================
// 3. STATE MANAGEMENT — State reaktif dengan tracking perubahan
// ======================================================================
VN.State = {};

// 3A. Editing State — Proxy untuk tracking mutasi properti
const _editingTarget = { novel: null, chapter: null };
VN.State.editing = new Proxy(_editingTarget, {
    set(target, prop, value) {
        if (prop !== 'novel' && prop !== 'chapter') return false;
        const oldVal = target[prop];
        target[prop] = value;
        if (oldVal !== value) {
            VN.Events.emit('editing:changed', { property: prop, oldValue: oldVal, newValue: value });
            VN.Events.emit('editing:' + prop, { oldValue: oldVal, newValue: value });
        }
        return true;
    }
});

// 3B. Reactive State — array/primitive dengan event saat berubah
(function() {
    const defaults = { storiesData: [], currentNovelChapters: [] };
    Object.keys(defaults).forEach(function(key) {
        var _val = defaults[key];
        Object.defineProperty(VN.State, key, {
            get: function() { return _val; },
            set: function(val) {
                var old = _val;
                _val = val;
                VN.Events.emit('state:' + key, { oldValue: old, newValue: val });
            },
            enumerable: true, configurable: true
        });
    });
})();

// 3C. Transient State — timer, animasi, UI (non-reactive)
VN.State.carousel = {
    currentCenterIndex: 0,
    defaultCenterIndex: 0,
    extraOffsetY: 385,
    hoverTimeout: null,
    fadeInInterval: null,
    fadeOutInterval: null,
    defaultCenterTimeout: null,
    userHasInteractedWithCarousel: false
};

VN.State.ui = {
    dragTooltip: undefined,
    currentPreviewAudio: null,
    isInitialLoad: true,
    isNavigating: false
};

// (Flag dirty global VN.State.isDirty/markDirty/clearDirty dihapus — tak pernah
// dibaca siapa pun (audit H2). Deteksi dirty yang nyata = baseline per-domain:
// _hubIsDirty / _playerIsDirty / _profileIsDirty / _scriptIsDirty, dipoll
// indikator titik nav di bagian 4B.)

// ======================================================================
// 4. WORKSPACE ROUTER — Navigasi view dengan lifecycle mount/unmount
// ======================================================================

// --- Toast Notification Utility ---
// Document registry bertahap: setiap panel mendaftarkan adapter dirty/save.
// Ini menggantikan daftar domain hard-code di orkestrator dan menjadi fondasi
// DocumentManager penuh (revision/recovery menyusul di batch berikutnya).
VN.Documents = {
    _adapters: new Map(),
    _saveAllPromise: null,

    register: function(id, adapter) {
        if (typeof id !== 'string' || !id || !adapter || typeof adapter !== 'object') {
            throw new TypeError('Document adapter membutuhkan id dan object adapter.');
        }
        this._adapters.set(id, adapter);
        VN.Events.emit('documents:registered', { id: id });
        return () => this.unregister(id);
    },

    unregister: function(id) {
        const removed = this._adapters.delete(id);
        if (removed) VN.Events.emit('documents:unregistered', { id: id });
        return removed;
    },

    list: function() {
        return Array.from(this._adapters.entries()).map(([id, adapter]) => ({ id, adapter }));
    },

    setDirty: function(id, dirty) {
        var adapter = this._adapters.get(id);
        if (!adapter || typeof adapter.setDirty !== 'function') return false;
        adapter.setDirty(!!dirty);
        VN.Events.emit('documents:dirty-changed', { id: id, dirty: !!dirty });
        return true;
    },

    isDocumentDirty: function(id) {
        var adapter = this._adapters.get(id);
        return adapter ? this._isAdapterDirty({ id: id, adapter: adapter }) : false;
    },

    _isAdapterDirty: function(item) {
        try {
            return typeof item.adapter.isDirty === 'function' && !!item.adapter.isDirty();
        } catch (error) {
            // Gagal membaca baseline tidak boleh dianggap bersih: close/back harus
            // tetap ditahan sampai adapter tersebut dapat diperiksa/disimpan.
            console.error('[VN.Documents] Gagal memeriksa dirty "' + item.id + '":', error);
            return true;
        }
    },

    dirtyDocuments: function() {
        return this.list().filter(item => this._isAdapterDirty(item));
    },

    isDirty: function() {
        return this.dirtyDocuments().length > 0;
    },

    saveAll: function() {
        // Save toolbar, shortcut, dan aksi keluar dapat tiba nyaris bersamaan. Semua
        // caller harus menunggu transaksi logis yang sama, bukan memulai write kedua.
        if (this._saveAllPromise) return this._saveAllPromise;

        const registry = this;
        // Mulai pada microtask berikutnya agar latch terpasang sebelum adapter pertama
        // dipanggil (termasuk bila adapter secara tak sengaja re-entrant ke saveAll).
        const run = Promise.resolve().then(async function() {
            const results = [];
            // Periksa ulang tepat sebelum tiap save. Adapter sebelumnya dapat membersihkan
            // domain agregat (contoh: player-code juga terbaca oleh _playerIsDirty), jadi
            // snapshot dirty tunggal dapat memicu save/reload konfigurasi yang tak perlu.
            for (const item of registry.list()) {
                if (!registry._isAdapterDirty(item)) continue;
                if (typeof item.adapter.save !== 'function') {
                    results.push({ id: item.id, success: false, reason: 'save-tidak-tersedia' });
                    return { success: false, results };
                }
                try {
                    const success = (await item.adapter.save()) === true;
                    if (!success) {
                        results.push({ id: item.id, success: false });
                        return { success: false, results };
                    }
                    // `true` adalah kontrak mutasi, tetapi baseline juga wajib benar-benar
                    // bersih. Ini menahan navigasi bila save lupa menggeser baseline atau
                    // ada edit baru saat operasi async masih berjalan.
                    if (registry._isAdapterDirty(item)) {
                        results.push({
                            id: item.id,
                            success: false,
                            reason: 'masih-dirty-setelah-save'
                        });
                        return { success: false, results };
                    }
                    results.push({ id: item.id, success: true });
                } catch (error) {
                    results.push({ id: item.id, success: false, error });
                    return { success: false, results };
                }
            }
            return { success: true, results };
        });

        this._saveAllPromise = run;
        const release = function() {
            if (registry._saveAllPromise === run) registry._saveAllPromise = null;
        };
        // Gunakan dua callback `then`, bukan `.finally()`, agar tidak menciptakan
        // Promise rejection turunan yang tidak diobservasi.
        run.then(release, release);
        return run;
    }
};

[
    ['script', '_scriptIsDirty', 'saveScriptChanges'],
    ['translation', '_translationIsDirty', 'saveTranslationChanges'],
    ['chapter-manifest', '_manifestIsDirty', 'saveChapterManifestChanges'],
    ['achievements', '_achievementIsDirty', 'saveAchievementChanges']
].forEach(function(definition) {
    const id = definition[0];
    const dirtyName = definition[1];
    const saveName = definition[2];
    VN.Documents.register(id, {
        isDirty: function() {
            return typeof window[dirtyName] === 'function' && !!window[dirtyName]();
        },
        save: async function() {
            if (typeof window[saveName] !== 'function') return false;
            return (await window[saveName]()) === true;
        }
    });
});

VN.Documents.register('player-code', {
    isDirty: function() {
        return typeof window._playerCodeIsDirty === 'function' && !!window._playerCodeIsDirty();
    },
    save: async function() {
        if (typeof window.savePlayerCodeChanges !== 'function') return false;
        return (await window.savePlayerCodeChanges()) === true;
    }
});

(function registerDetachedHubCodeDocument() {
    var dirty = false;
    VN.Documents.register('hub-code', {
        isDirty: function() { return dirty; },
        setDirty: function(value) { dirty = value === true; },
        save: async function() {
            var transport = typeof ipcRenderer !== 'undefined' ? ipcRenderer : window.ipcRenderer;
            if (!transport || !VN.Utils || typeof VN.Utils.invokeChecked !== 'function') return false;
            var result = await VN.Utils.invokeChecked(transport, 'hub-code-editor:flush-if-dirty');
            dirty = result.dirty === true;
            return !dirty;
        }
    });
})();

VN.Documents.register('profile-hub-player', {
    isDirty: function() {
        // Draft file Player disimpan adapter `player-code` di atas. Gunakan
        // dirty config khusus di sini agar satu Save All tidak menyimpan file
        // yang sama dua kali hanya karena snapshot dirty dihitung di awal.
        var playerConfigCheck = window._playerConfigIsDirty || window._playerIsDirty;
        return [window._profileIsDirty, window._hubIsDirty, playerConfigCheck]
            .some(function(check) { return typeof check === 'function' && !!check(); });
    },
    save: async function() {
        if (typeof window.handleUpdateNovel !== 'function') return false;
        return (await window.handleUpdateNovel('all')) === true;
    }
});

VN.Toast = {
    _container: null,
    _toasts: [],
    MAX_VISIBLE: 5,
    ACTION_FALLBACK_MS: 15000,

    _getContainer: function() {
        if (this._container) return this._container;
        this._container = document.createElement('div');
        this._container.id = 'vn-toast-container';
        this._container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:100000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(this._container);
        return this._container;
    },

    _dismissToast: function(toast, immediate) {
        if (!toast) return false;

        // Registry adalah sumber batas kapasitas. Keluarkan SECARA SINKRON sebelum
        // animasi: `_enforceMax()` tidak boleh menunggu timer untuk melihat panjang
        // array berubah. Implementasi lama baru melakukan splice 200 ms kemudian;
        // toast keenam membuat while-loop tak pernah yield dan mengalokasikan timer
        // sampai renderer kehabisan Oilpan/CppHeap.
        var idx = this._toasts.indexOf(toast);
        if (idx !== -1) this._toasts.splice(idx, 1);

        // Auto-dismiss menyimpan closure yang memegang node toast. Bila overflow
        // membuang toast lebih awal, lepaskan timer itu juga agar node detached tidak
        // tertahan selama 9-15 detik.
        if (toast._vnAutoDismissTimer != null) {
            clearTimeout(toast._vnAutoDismissTimer);
            toast._vnAutoDismissTimer = null;
        }

        // Close, Escape, action, auto-timeout, dan overflow dapat beradu. Hanya satu
        // jalur yang boleh menjadwalkan animasi/removal.
        if (toast._vnDismissing) {
            if (immediate && toast.parentNode) {
                if (toast._vnRemoveTimer != null) clearTimeout(toast._vnRemoveTimer);
                toast._vnRemoveTimer = null;
                toast.remove();
            }
            return idx !== -1;
        }
        toast._vnDismissing = true;

        // Overflow harus benar-benar bounded pada frame yang sama: tak perlu menahan
        // puluhan node selama animasi ketika notifikasi datang sebagai burst.
        if (immediate || !toast.parentNode) {
            toast.remove();
            return true;
        }

        toast.style.animation = 'vn-toast-out 0.2s ease forwards';
        toast._vnRemoveTimer = setTimeout(function() {
            toast._vnRemoveTimer = null;
            toast.remove();
        }, 200);
        return true;
    },

    _enforceMax: function() {
        var max = Math.max(0, parseInt(this.MAX_VISIBLE, 10) || 0);
        var overflow = this._toasts.length - max;
        if (overflow <= 0) return;

        // Snapshot berhingga, bukan while yang bergantung pada efek asynchronous.
        // Walau implementasi dismiss kelak berubah, loop fatal tidak dapat kembali.
        this._toasts.slice(0, overflow).forEach(function(toast) {
            this._dismissToast(toast, true);
        }, this);
    },

    show: function(message, options) {
        options = options || {};
        var type = options.type || 'info';
        var duration = options.duration || 4000;
        var actions = options.actions || [];
        var self = this;

        var toast = document.createElement('div');
        toast.className = 'vn-toast vn-toast-' + type;
        // Latar #202020 senada dengan panel melayang lain di editor (mis.
        // .script-load-state) yang basisnya #141414 — bukan #1e1e2e lama
        // yang condong navy/ungu dan tak nyambung dengan tema abu netral.
        toast.style.cssText = 'pointer-events:auto;background:#202020;color:#e0e0e0;padding:12px 16px;border-radius:8px;border:1px solid #333;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:380px;font-size:0.9em;display:flex;flex-direction:column;gap:8px;animation:vn-toast-in 0.25s ease;position:relative;';
        if (type === 'warning') toast.style.borderColor = '#f5a623';
        else if (type === 'error') toast.style.borderColor = '#e74c3c';
        else if (type === 'success') toast.style.borderColor = '#1cccae';

        // Close button (×)
        var closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'position:absolute;top:4px;right:6px;background:none;border:none;color:#888;font-size:1.1em;cursor:pointer;padding:2px 5px;line-height:1;';
        closeBtn.addEventListener('mouseenter', function() { closeBtn.style.color = '#fff'; });
        closeBtn.addEventListener('mouseleave', function() { closeBtn.style.color = '#888'; });
        closeBtn.addEventListener('click', function() { self._dismissToast(toast); });
        toast.appendChild(closeBtn);

        var msgEl = document.createElement('div');
        msgEl.textContent = message;
        msgEl.style.paddingRight = '18px';
        toast.appendChild(msgEl);

        if (actions.length > 0) {
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
            actions.forEach(function(action) {
                var btn = document.createElement('button');
                btn.textContent = action.label;
                btn.style.cssText = 'padding:4px 12px;border-radius:4px;border:1px solid #555;background:' + (action.primary ? '#1cccae22' : 'transparent') + ';color:' + (action.primary ? '#1cccae' : '#aaa') + ';cursor:pointer;font-size:0.85em;';
                btn.addEventListener('click', function() {
                    if (action.onClick) action.onClick();
                    self._dismissToast(toast);
                });
                btnRow.appendChild(btn);
            });
            toast.appendChild(btnRow);
        }

        // Auto-dismiss: normal duration for simple toasts, fallback for action-toasts
        var timeout = actions.length > 0 ? self.ACTION_FALLBACK_MS : duration;
        toast._vnAutoDismissTimer = setTimeout(function() {
            toast._vnAutoDismissTimer = null;
            self._dismissToast(toast);
        }, timeout);

        this._getContainer().appendChild(toast);
        this._toasts.push(toast);
        this._enforceMax();

        return toast;
    },
    info: function(msg, opts) { return this.show(msg, Object.assign({}, opts, { type: 'info' })); },
    success: function(msg, opts) { return this.show(msg, Object.assign({}, opts, { type: 'success' })); },
    warning: function(msg, opts) { return this.show(msg, Object.assign({}, opts, { type: 'warning' })); },
    error: function(msg, opts) { return this.show(msg, Object.assign({}, opts, { type: 'error' })); },
    dismissAll: function() {
        var copy = this._toasts.slice();
        for (var i = 0; i < copy.length; i++) this._dismissToast(copy[i]);
    }
};

// Inject toast CSS animation keyframes
(function() {
    var style = document.createElement('style');
    style.textContent = '@keyframes vn-toast-in{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}@keyframes vn-toast-out{to{opacity:0;transform:translateX(30px)}}';
    document.head.appendChild(style);

    // Escape key dismisses topmost toast
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && VN.Toast._toasts.length > 0) {
            VN.Toast._dismissToast(VN.Toast._toasts[VN.Toast._toasts.length - 1]);
        }
    });
})();

VN.Workspace = {
    _current: 'script',
    _views: {},
    _switchPending: false,

    get current() { return this._current; },

    /**
     * Daftarkan view baru.
     * @param {string} name - Nama view ('script', 'hub', 'assets', dsb.)
     * @param {Object} config - { wrapperEl, onMount?, onUnmount?, isDirty? }
     */
    registerView: function(name, config) {
        this._views[name] = config;
    },

    /**
     * Internal: Execute the actual view switch (no dirty check).
     */
    _doSwitch: function(view) {
        var prev = this._current;

        // Unmount previous
        var prevConfig = this._views[prev];
        if (prevConfig && prevConfig.onUnmount) prevConfig.onUnmount();

        // Hide all wrappers
        var keys = Object.keys(this._views);
        for (var i = 0; i < keys.length; i++) {
            var v = this._views[keys[i]];
            if (v.wrapperEl) v.wrapperEl.style.display = 'none';
        }

        // Reset toolbar
        if (VN.DOM.workspaceControlsBar) VN.DOM.workspaceControlsBar.style.display = 'none';
        var saveScrBtn = document.getElementById('save-script-btn');
        var saveHubBtn = document.getElementById('editor-save-btn');
        var flowBtn = document.getElementById('btn-visualize-flow');
        if (saveScrBtn) saveScrBtn.style.display = 'none';
        if (saveHubBtn) saveHubBtn.style.display = 'none';
        if (flowBtn) flowBtn.style.display = 'none';

        // Switch contextual controls group
        var allGroups = document.querySelectorAll('.controls-view-group');
        for (var g = 0; g < allGroups.length; g++) allGroups[g].style.display = 'none';
        var viewGroupMap = { script: 'script-controls-group', hub: 'hub-controls-group', player: 'player-controls-group' };
        var activeGroup = document.getElementById(viewGroupMap[view]);
        if (activeGroup) activeGroup.style.display = '';

        // Show & mount target
        var targetConfig = this._views[view];
        if (targetConfig.wrapperEl) {
            targetConfig.wrapperEl.style.display = 'flex';
            targetConfig.wrapperEl.classList.remove('view-enter');
            void targetConfig.wrapperEl.offsetWidth; // force reflow
            targetConfig.wrapperEl.classList.add('view-enter');
        }
        if (targetConfig.onMount) targetConfig.onMount();

        this._current = view;
        VN.Events.emit('workspace:viewChanged', { from: prev, to: view });
    },

    /**
     * Pindah ke view lain.
     *
     * Navigasi antar menu kini SELALU mulus — tidak ada lagi konfirmasi "buang
     * perubahan" tiap pindah view. Edit yang belum disimpan tetap aman di state
     * in-memory (hubConfig / playerProfile / profil) karena view lama TIDAK
     * di-discard. Indikator titik "dirty" pada tombol nav tetap memberi tahu ada
     * perubahan. Konfirmasi simpan/buang hanya muncul saat menekan tombol
     * "Kembali ke Pilihan Novel" (lihat scriptEditor.js).
     *
     * @param {string} view - Nama view target
     * @param {Object} [opts] - dipertahankan untuk kompatibilitas (tidak dipakai)
     */
    switchView: function(view, opts) {
        if (!this._views[view]) {
            console.warn('[VN.Workspace] View \'' + view + '\' tidak terdaftar.');
            return;
        }
        if (view === this._current) {
            // Resilience: bila _current sudah menunjuk view ini TETAPI wrapper-nya
            // tersembunyi (display:none), berarti state desync — mis. setelah keluar
            // dari Hub lalu membuka novel lain. Paksa re-sync agar workspace-body
            // tidak kosong. (Tanpa ini, klik sub-nav yang sama tidak menyembuhkan.)
            var cur = this._views[this._current];
            var hidden = cur && cur.wrapperEl && cur.wrapperEl.style.display === 'none';
            if (hidden) this._doSwitch(view);
            return;
        }
        this._doSwitch(view);
    }
};

// Daftarkan default workspace views
VN.Workspace.registerView('script', {
    wrapperEl: VN.DOM.scriptEditingWrapper,
    onMount: function() {
        var pending = window._pendingScriptLoadResume;
        if (pending && pending.novel === VN.State.editing.novel &&
            pending.chapter === VN.State.editing.chapter &&
            typeof window.loadChapterScript === 'function') {
            window._pendingScriptLoadResume = null;
            window.loadChapterScript(pending.chapter);
            return;
        }
        if (VN.State.editing.chapter) {
            if (VN.DOM.workspaceControlsBar) VN.DOM.workspaceControlsBar.style.display = 'flex';
            var saveBtn = document.getElementById('save-script-btn');
            var flowBtn = document.getElementById('btn-visualize-flow');
            if (saveBtn) saveBtn.style.display = 'inline-flex';
            if (flowBtn) flowBtn.style.display = 'inline-flex';
        }
    },
    onUnmount: function() {
        if (typeof window.closeFlowVisualization === 'function') window.closeFlowVisualization();
        var area = document.getElementById('script-editor-area');
        if (area && area.getAttribute('aria-busy') === 'true' &&
            VN.State.editing.novel && VN.State.editing.chapter) {
            window._pendingScriptLoadResume = {
                novel: VN.State.editing.novel,
                chapter: VN.State.editing.chapter
            };
            if (typeof window.cancelPendingChapterLoad === 'function') window.cancelPendingChapterLoad();
        }
    }
});

VN.Workspace.registerView('hub', {
    wrapperEl: VN.DOM.hubEditingWrapper,
    onMount: function() {
        var saveBtn = document.getElementById('editor-save-btn');
        if (saveBtn) {
            saveBtn.style.display = 'inline-flex';
            saveBtn.textContent = '💾 Simpan';
        }
        // Lazy init: webview preview (nodeintegration + runtime hub penuh) baru
        // dibuat saat tab Hub ini benar-benar dibuka, bukan saat novel dimuat.
        // Idempotent — initHubPreview() no-op bila frame sudah ada.
        if (typeof window.initHubPreview === 'function') window.initHubPreview();
    }
});

VN.Workspace.registerView('profile', {
    wrapperEl: VN.DOM.novelProfileWrapper,
    onMount: function() {
        var saveBtn = document.getElementById('editor-save-btn');
        if (saveBtn) {
            saveBtn.style.display = 'inline-flex';
            saveBtn.textContent = '💾 Simpan';
        }
    }
});

// Struktur Chapter (chapters.json). Isinya dirender editorPanelNav.js; view ini
// TIDAK dibangun ulang tiap mount — DOM-nya sendiri yang memegang suntingan yang
// belum disimpan, konsisten dengan hub/profil (pindah view tak membuang pekerjaan).
VN.Workspace.registerView('chapters', {
    wrapperEl: VN.DOM.chapterManifestWrapper,
    onMount: function () {
        if (typeof window.renderChapterManifestView === 'function') {
            window.renderChapterManifestView();
        }
    }
});

// Terjemahan per-chapter. Beda dari view lain: isinya TERIKAT chapter aktif,
// jadi ia dirender ulang tiap mount (chapter bisa berganti di antara kunjungan).
VN.Workspace.registerView('translation', {
    wrapperEl: VN.DOM.translationWrapper,
    onMount: function () {
        if (typeof window.renderTranslationView === 'function') window.renderTranslationView();
    }
});

VN.Workspace.registerView('assets', {
    wrapperEl: VN.DOM.globalAssetView,
    onMount: function () {
        if (typeof window.refreshUnifiedAssetView === 'function') {
            window.refreshUnifiedAssetView();
        }
    }
});

// ======================================================================
// 4B. PENANDA BELUM DISIMPAN — poll isDirty lalu sorot tombol navigasinya
//
// Bentuknya SOROTAN pada tombol, bukan titik kecil di ujung label (permintaan
// tester; alasan lengkapnya di blok "PENANDA BELUM DISIMPAN" pada editor.css).
//
// Dua cacat lama ikut ditutup di sini, dan keduanya sejenis: penanda yang tak
// pernah bisa dilihat orang yang perlu melihatnya.
//
//   1. Kunci `story` mencari `[data-novel-section="story"]`. Elemen itu TIDAK
//      PERNAH ADA — Story adalah tab sidebar (`[data-tab="story"]`), bukan
//      sub-seksi Novel. Jadi naskah, manifest, dan terjemahan yang belum
//      tersimpan tak pernah menyalakan tanda apa pun.
//
//   2. Tombol sub-seksi Novel (Aset/Hub/VN Player) ikut TERSEMBUNYI ketika tab
//      Story sedang aktif, begitu pula sebaliknya. Perubahan Hub yang belum
//      disimpan karena itu tak terlihat sama sekali selagi kreator menulis
//      naskah. Karena itu tanda di sini MERAMBAT NAIK ke tab induknya: tab
//      Novel menyala bila ada sub-seksi mana pun yang kotor.
// ======================================================================
(function() {
    // Satu pemeriksa per DOMAIN. Kesalahan saat memeriksa dianggap kotor:
    // lebih baik menyuruh orang menyimpan yang sudah tersimpan daripada diam
    // saat ada pekerjaan yang bisa hilang.
    var domainChecks = {
        profile: function() {
            return (typeof window._profileIsDirty === 'function' && window._profileIsDirty()) ||
                (typeof window._achievementIsDirty === 'function' && window._achievementIsDirty());
        },
        hub: function() {
            return (typeof window._hubIsDirty === 'function' && window._hubIsDirty()) ||
                (VN.Documents && VN.Documents.isDocumentDirty('hub-code'));
        },
        player: function() {
            return typeof window._playerIsDirty === 'function' && window._playerIsDirty();
        },
        story: function() {
            return (typeof window._scriptIsDirty === 'function' && window._scriptIsDirty()) ||
                (typeof window._manifestIsDirty === 'function' && window._manifestIsDirty()) ||
                (typeof window._translationIsDirty === 'function' && window._translationIsDirty());
        }
    };

    // Rumah setiap domain di layar. `story` sengaja menunjuk tab, bukan
    // sub-seksi Novel yang memang tak punya baris untuknya.
    var homes = {
        profile: '[data-novel-section="profile"]',
        hub: '[data-novel-section="hub"]',
        player: '[data-novel-section="player"]',
        story: '.sidebar-tab[data-tab="story"]'
    };

    // Sub-seksi yang dirangkum tab Novel saat tab itu tidak sedang dibuka.
    var novelDomains = ['profile', 'hub', 'player'];

    var JUDUL_KOTOR = 'Ada perubahan yang belum disimpan di sini.';

    function tandai(el, dirty) {
        if (!el) return;
        var sudah = el.classList.contains('dirty');
        if (sudah === !!dirty) return;   // nol sentuhan DOM saat keadaan tak berubah
        el.classList.toggle('dirty', !!dirty);
        if (dirty) {
            if (!el.dataset.judulAsli) el.dataset.judulAsli = el.getAttribute('title') || '';
            el.setAttribute('title', JUDUL_KOTOR);
        } else if (el.dataset.judulAsli !== undefined) {
            if (el.dataset.judulAsli) el.setAttribute('title', el.dataset.judulAsli);
            else el.removeAttribute('title');
            delete el.dataset.judulAsli;
        }
    }

    function periksa(domain) {
        try { return !!domainChecks[domain](); }
        catch (error) { return true; }
    }

    function refreshDirtyMarks() {
        var state = {};
        Object.keys(domainChecks).forEach(function(domain) {
            state[domain] = periksa(domain);
            tandai(document.querySelector(homes[domain]), state[domain]);
        });

        // Tab Novel merangkum sub-seksinya, TAPI hanya selagi tab itu tertutup —
        // saat terbuka, tombol sub-seksinya sendiri sudah menjawab lebih tepat
        // dan dua tanda untuk satu fakta cuma bikin ramai.
        var novelTab = document.querySelector('.sidebar-tab[data-tab="novel"]');
        var novelTerbuka = !!(novelTab && novelTab.classList.contains('active'));
        var adaSubKotor = novelDomains.some(function(d) { return state[d]; });
        tandai(novelTab, !novelTerbuka && adaSubKotor);
    }

    // Diekspos supaya pemanggil yang BARU SAJA menyimpan bisa memadamkan
    // sorotan seketika, tanpa menunggu tick berikutnya.
    window.refreshDirtyMarks = refreshDirtyMarks;

    setInterval(refreshDirtyMarks, 2000);
})();

// ======================================================================
// 5. BACKWARD COMPATIBILITY BRIDGES
// Semua global lama di-bridge agar kode yang belum dimigrasikan tetap jalan.
// @deprecated — Gunakan VN.DOM.xxx / VN.State.xxx / VN.Workspace.switchView()
// ======================================================================

// 5A. DOM element bridges — setiap VN.DOM.key menjadi window.key
(function() {
    var keys = Object.keys(VN.DOM);
    for (var i = 0; i < keys.length; i++) {
        (function(key) {
            try {
                Object.defineProperty(window, key, {
                    get: function() { return VN.DOM[key]; },
                    configurable: true, enumerable: false
                });
            } catch (e) { /* skip jika sudah ada const/let yang sama */ }
        })(keys[i]);
    }
})();

// 5B. Alias kompatibilitas
window.storyGridElement = VN.DOM.storyGrid;
window.hubEditor = VN.DOM.scriptEditorOverlay;

// 5C. Editing state bridge — intercept reassignment agar Proxy tetap utuh
//     currentlyEditing = { novel: null, chapter: null } akan memperbarui Proxy, bukan menggantikannya
(function() {
    Object.defineProperty(window, 'currentlyEditing', {
        get: function() { return VN.State.editing; },
        set: function(obj) {
            if (obj && typeof obj === 'object') {
                VN.State.editing.novel = obj.novel !== undefined ? obj.novel : null;
                VN.State.editing.chapter = obj.chapter !== undefined ? obj.chapter : null;
            }
        },
        configurable: true
    });
})();

// 5C2. currentlyEditingNovel — variabel legacy terpisah yang masih dipakai hubEditor & novelCrud
window.currentlyEditingNovel = null;

// 5D. Reactive state bridges
(function() {
    ['storiesData', 'currentNovelChapters'].forEach(function(key) {
        try {
            Object.defineProperty(window, key, {
                get: function() { return VN.State[key]; },
                set: function(val) { VN.State[key] = val; },
                configurable: true
            });
        } catch (e) {}
    });
})();

// 5E. Carousel transient state bridges
(function() {
    var carouselKeys = [
        'hoverTimeout', 'fadeInInterval', 'fadeOutInterval',
        'currentCenterIndex', 'defaultCenterIndex', 'extraOffsetY',
        'defaultCenterTimeout', 'userHasInteractedWithCarousel'
    ];
    carouselKeys.forEach(function(key) {
        try {
            Object.defineProperty(window, key, {
                get: function() { return VN.State.carousel[key]; },
                set: function(val) { VN.State.carousel[key] = val; },
                configurable: true
            });
        } catch (e) {}
    });
})();

// 5F. UI transient state bridges
(function() {
    ['dragTooltip', 'currentPreviewAudio', 'isInitialLoad', 'isNavigating'].forEach(function(key) {
        try {
            Object.defineProperty(window, key, {
                get: function() { return VN.State.ui[key]; },
                set: function(val) { VN.State.ui[key] = val; },
                configurable: true
            });
        } catch (e) {}
    });
})();

// 5G. Workspace view bridge
try {
    Object.defineProperty(window, 'activeWorkspaceView', {
        get: function() { return VN.Workspace.current; },
        set: function() { /* no-op — gunakan VN.Workspace.switchView() */ },
        configurable: true
    });
} catch (e) {}

window.switchWorkspaceView = function(view) { VN.Workspace.switchView(view); };

console.log('[VN State] Modul state dimuat. DOM:', Object.keys(VN.DOM).length, 'elemen | Workspace:', Object.keys(VN.Workspace._views).length, 'view.');
