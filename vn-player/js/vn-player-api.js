/**
 * VN Player API — Bridge untuk Custom Player per-story milik kreator.
 *
 * Otomatis ter-inject ke setiap `player.html` kustom di folder chapter
 * (mirror VNHub untuk hub.html kustom). Custom Player membaca `script.json`
 * sendiri & menjalankan mekanismenya sendiri (engine global di-bypass);
 * VNPlayer jadi jembatan ke engine internal (IPC ke Main Process) untuk hal-hal
 * yang tetap dikelola engine: save/load, kembali ke Hub, settings, resolve aset.
 *
 * Cara pakai di player.html kustom:
 *   VNPlayer.onReady(() => {
 *     const script = VNPlayer.getScript();   // array entri dari script.json
 *     // render & jalankan flow sendiri...
 *   });
 *   img.src = VNPlayer.resolveAsset('bg/forest.jpg');
 *   VNPlayer.returnToHub();
 */

const VNPlayer = (() => {
    const { ipcRenderer } = require('electron');

    // State internal — diisi saat engine mengirim player context
    let _storyTitle = '';
    let _chapter = '';
    let _basePath = '';   // folder chapter (untuk aset chapter)
    let _novelPath = '';  // folder novel (untuk aset novel-level)
    let _script = [];     // isi script.json (parsed)
    let _savedState = null; // state dari save yang dimuat (jika load)
    let _contextReady = false;

    const _readyCallbacks = [];

    // ---- Scene Minimal (mirror showScreen hub) ----
    // Section ber-`data-player-scene` = scene; tampilkan satu, sembunyikan lainnya.
    // CSS-nya DISUNTIK runtime (sekali) agar bekerja seragam di engine global MAUPUN
    // custom player self-contained (yg tak me-link ui-panels.css). TANPA pengecualian:
    // layar akhir chapter pun scene biasa bernama "end" (lihat player.html), bukan
    // simpul DOM istimewa milik engine.
    // DUA JENIS BLOK LAYAR, dan bedanya nyata — bukan label.
    //
    //   overlay (baku)          : melayang di atas cerita; saling meniadakan.
    //   base (`data-scene-mode`): LATAR tempat cerita berjalan.
    //
    // Aturan di bawah SENGAJA tidak menyentuh blok base. Kalau ia diterapkan juga,
    // tiga hal patah sekaligus pada layar cerita: tata letaknya (position/ukuran
    // panggung dari --vn-container-*) tergusur `inset:0`, animasi masuk chapter
    // bentrok dengan `opacity:0`, dan permukaan kliknya mati oleh `pointer-events:none`.
    // Itulah sebabnya "jadikan saja semuanya section yang sama" tidak cukup.
    const _NON_BASE = '[data-player-scene]:not([data-scene-mode="base"])';
    const _SCENE_BASE_CSS =
        _NON_BASE + '{position:absolute;inset:0;z-index:250;opacity:0;pointer-events:none;}' +
        _NON_BASE + '.vn-scene-active{opacity:1;pointer-events:auto;}' +
        // Di PREVIEW (engine memasang body[data-vn-preview], lihat init.js) transisi
        // scene DIMATIKAN: preview merender keadaan STATIS satu entri, bukan alur.
        // Tanpa ini, scene yang sempat tampil lalu perlu disembunyikan (mis. cover
        // kartu judul boot yang dibuka saat data-vn-preview terpasang) bisa BEKU di
        // tengah transisi opacity — webview preview tak selalu melukis, jadi 1→0
        // tak pernah tuntas & scene menyangkut menutupi preview. transition:none
        // membuat opacity langsung mengikuti kaskade (0 bila tak aktif).
        'body[data-vn-preview] ' + _NON_BASE + '{transition:none !important;}';
    const _SCENE_ANIM_CSS =
        _NON_BASE + '{transition:opacity .5s ease-in-out;}';

    function _isBaseScene(el) {
        return !!el && el.getAttribute('data-scene-mode') === 'base';
    }

    let _sceneStylesInjected = false;
    function _ensureSceneStyles() {
        if (_sceneStylesInjected || typeof document === 'undefined') return;
        _sceneStylesInjected = true;
        const st = document.createElement('style');
        st.id = 'vn-player-scene-styles';
        // Transisi SENGAJA belum dipasang di frame pertama. Kalau aturan ini baru
        // mendarat setelah scene sempat tergambar (player berlapis memuat modul
        // engine secara dinamis), opacity 1→0 akan TERANIMASI dan terlihat persis
        // seperti "layar ending sempat berjalan lalu menutup sendiri" — itulah
        // bug yang dilaporkan. Transisi menyusul satu frame kemudian, saat
        // keadaan awal sudah stabil, sehingga show/hide berikutnya tetap halus.
        st.textContent = _SCENE_BASE_CSS;
        (document.head || document.documentElement).appendChild(st);
        const pasangTransisi = () => { st.textContent = _SCENE_BASE_CSS + _SCENE_ANIM_CSS; };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(pasangTransisi);
        else setTimeout(pasangTransisi, 0);
    }
    // Dipasang SEGERA saat modul dimuat, bukan menunggu show() pertama. Aturan
    // "scene adalah overlay tersembunyi" harus berlaku sejak scene ADA di dokumen;
    // menundanya membuat setiap <section data-player-scene> tampil sebagai blok
    // biasa yang menumpuk di atas layar cerita sampai ada yang memanggil show().
    _ensureSceneStyles();
    // Scene aktif juga ditandai di <body data-vn-scene="...">. Scene adalah OVERLAY
    // di atas loop cerita, jadi apa yang ikut terlihat di baliknya (kotak dialog,
    // pilihan, HUD) ditentukan oleh scene itu sendiri — bukan oleh engine. Penanda
    // ini memberi kreator kait CSS untuk menyatakannya per-scene, mis.
    //     body[data-vn-scene="ending"] #dialogue-box { display: none; }
    // Sekaligus membuat scene yang sedang menyala BISA DIAMATI dari luar (editor
    // preview membacanya untuk menyorot scene aktif) tanpa API pelaporan tambahan.
    function _markActiveScene(id) {
        if (!document.body) return;
        if (id) document.body.setAttribute('data-vn-scene', id);
        else document.body.removeAttribute('data-vn-scene');
    }
    function _activateScene(id) {
        _ensureSceneStyles();
        let found = false;
        let targetBase = false;
        document.querySelectorAll('[data-player-scene]').forEach((el) => {
            if (el.getAttribute('data-player-scene') === id) {
                found = true;
                targetBase = _isBaseScene(el);
            }
        });
        document.querySelectorAll('[data-player-scene]').forEach((el) => {
            const match = el.getAttribute('data-player-scene') === id;
            if (_isBaseScene(el)) {
                // Blok base hanya dipadamkan oleh blok base LAIN (tukar latar).
                // Menyalakan overlay tidak boleh memadamkannya — di situlah letak
                // kemampuan yang hilang kalau semua blok diperlakukan sama:
                // layar akhir bawaan tembus pandang & mengaburkan frame terakhir,
                // dan itu mustahil kalau ceritanya ikut padam.
                if (targetBase) el.classList.toggle('vn-scene-active', match);
                return;
            }
            el.classList.toggle('vn-scene-active', match);
        });
        // Penanda di <body> tetap menunjuk apa yang TERAKHIR dinyalakan, termasuk
        // saat itu blok base — supaya CSS kreator & editor bisa membedakannya.
        _markActiveScene(found ? id : '');
        return found;
    }

    ipcRenderer.on('vn-engine:set-player-context', (event, data) => {
        console.log('[VNPlayer API] Context diterima:', data && data.chapter);
        _storyTitle = data.storyTitle || '';
        _chapter = data.chapter || '';
        _basePath = data.basePath || '';
        _novelPath = data.novelPath || '';
        _script = Array.isArray(data.script) ? data.script : (data.script || []);
        _savedState = data.savedState || null;
        _contextReady = true;

        _readyCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error('[VNPlayer API] Error di onReady callback:', e); }
        });
        _readyCallbacks.length = 0;

        window.dispatchEvent(new CustomEvent('vnplayer:ready', {
            detail: { storyTitle: _storyTitle, chapter: _chapter, savedState: _savedState }
        }));
    });

    return {
        /** Daftarkan callback saat context siap (atau langsung jalan jika sudah siap). */
        onReady(callback) {
            if (_contextReady) {
                try { callback(); } catch (e) { console.error('[VNPlayer API] Error di onReady callback:', e); }
            } else {
                _readyCallbacks.push(callback);
            }
        },

        isReady() { return _contextReady; },

        /** Isi script.json chapter (array entri) yang dirender sendiri oleh player. */
        getScript() { return _script; },

        /** Context chapter lengkap. */
        getChapterContext() {
            return { storyTitle: _storyTitle, chapter: _chapter, basePath: _basePath, novelPath: _novelPath };
        },

        getStoryTitle() { return _storyTitle; },
        getChapter() { return _chapter; },
        getBasePath() { return _basePath; },

        /**
         * Laporan peran UI yang HILANG dari markup player ini (kontrak peran).
         * Kosong = semua peran yang dibutuhkan engine tersedia. Tiap entri:
         * `{ role, lapis, akibat }`. Dipakai extension & inspektur kontrak editor.
         * (`VNState` const top-level TIDAK menempel window — rujuk bare identifier.)
         */
        getRoleReport() {
            try {
                return (typeof VNState !== 'undefined' && VNState.roles) ? VNState.roles.report() : [];
            } catch (e) { return []; }
        },
        getNovelPath() { return _novelPath; },

        /**
         * Sistem scene Minimal — mirror `showScreen` hub. Section ber-`data-player-scene`
         * di player.html adalah scene; API ini menampilkan satu & menyembunyikan lainnya.
         * Dipakai a.l. dari hook `player:end-screen` untuk memasang ending kustom tanpa
         * fork engine. Scene DEKLARATIF (ada di markup) → terbaca navigator editor.
         */
        scene: {
            /**
             * Tampilkan scene.
             * @param {string|{html:string}} idOrSpec
             *   - string  → nilai `data-player-scene` section yg SUDAH ada di markup (jalur utama, terbaca navigator).
             *   - {html}  → suntik markup dinamis (jalur lanjutan; TIDAK muncul di navigator editor).
             * @returns {boolean} true bila ada scene yang tampil.
             */
            show(idOrSpec) {
                if (idOrSpec && typeof idOrSpec === 'object' && typeof idOrSpec.html === 'string') {
                    let host = document.querySelector('[data-player-scene="__dynamic__"]');
                    if (!host) {
                        host = document.createElement('section');
                        host.setAttribute('data-player-scene', '__dynamic__');
                        (document.getElementById('game-container') || document.body).appendChild(host);
                    }
                    host.innerHTML = idOrSpec.html;
                    return _activateScene('__dynamic__');
                }
                return _activateScene(String(idOrSpec == null ? '' : idOrSpec));
            },
            /**
             * Sembunyikan semua layar OVERLAY. Blok base tidak ikut dipadamkan —
             * "sembunyikan scene" berarti kembali ke cerita, bukan ke layar kosong.
             */
            hide() {
                document.querySelectorAll('[data-player-scene]').forEach((el) => {
                    if (_isBaseScene(el)) return;
                    el.classList.remove('vn-scene-active');
                });
                _markActiveScene('');
            },
            /** Daftar id scene yang ADA di markup (dipakai navigator editor Lapis A). */
            list() {
                return Array.from(document.querySelectorAll('[data-player-scene]'))
                    .map((el) => el.getAttribute('data-player-scene'))
                    .filter((v) => v && v !== '__dynamic__');
            }
        },

        /** State dari save yang dimuat (null jika mulai baru). */
        getSavedState() { return _savedState; },

        /**
         * Resolve path aset relatif folder chapter ke file:// URL.
         * @param {string} relativePath - relatif dari folder chapter (mis. 'bg.jpg')
         */
        resolveAsset(relativePath) {
            if (!relativePath) return '';
            if (relativePath.startsWith('file://') || relativePath.startsWith('http')) return relativePath;
            return `file:///${_basePath}/${relativePath}`;
        },

        /**
         * Resolve aset relatif folder NOVEL (mis. 'cover.png', 'audio/bgm/x.mp3').
         */
        resolveNovelAsset(relativePath) {
            if (!relativePath) return '';
            if (relativePath.startsWith('file://') || relativePath.startsWith('http')) return relativePath;
            return `file:///${_novelPath}/${relativePath}`;
        },

        /**
         * Simpan progress ke slot. `data` = state bebas milik player (dikembalikan
         * lewat getSavedState() saat load). previewType opsional.
         * @param {number} slotId
         * @param {Object} data
         * @param {Object} options - { previewType, previewImage }
         */
        saveGame(slotId, data, options = {}) {
            ipcRenderer.send('vn-engine:save-game', {
                slotId: slotId,
                previewType: options.previewType || 'none',
                previewImage: options.previewImage || null,
                playerPreferences: data || {}
            });
        },

        /** Daftar save slot novel ini. */
        async getSaveSlots() {
            if (!_storyTitle) return [];
            return await ipcRenderer.invoke('vn-engine:get-save-slots', _storyTitle);
        },

        /** Muat game dari slot (engine akan memuat ulang player chapter terkait). */
        loadGame(slotId) {
            ipcRenderer.send('vn-engine:load-game', { slotId: slotId });
        },

        /** Kembali ke Hub novel. */
        returnToHub() {
            ipcRenderer.send('vn-engine:return-to-hub', { storyTitle: _storyTitle });
        },

        /** Kembali ke VN Manager (daftar novel). */
        exitToManager() {
            ipcRenderer.send('vn-engine:exit-to-manager');
        },

        /** Buka Settings global. */
        showSettings() {
            ipcRenderer.send('vn-engine:show-settings');
        },

        /** Update Discord RPC. */
        updateRPC(activity) {
            ipcRenderer.send('update-rpc-activity', activity);
        },

        /** Ambil hub-config.json (untuk baca chapterConfig/playerProfile bila perlu). */
        async getHubConfig() {
            if (!_storyTitle) return null;
            const res = await ipcRenderer.invoke('get-hub-config', _storyTitle);
            return (res && res.success) ? res.config : null;
        },

        /**
         * Player profile EFEKTIF chapter ini: playerProfile global di-merge dengan
         * override chapterConfig dari editor (tab VN Player). Pakai ini bila
         * custom player ingin menghormati tema/gaya/restriksi yang disetel kreator.
         */
        async getEffectiveProfile() {
            const cfg = await this.getHubConfig();
            if (!cfg) return null;
            const globalProfile = cfg.playerProfile || {};
            const override = (cfg.chapterConfig || {})[_chapter] || {};
            const merged = Object.assign({}, globalProfile);
            // Hanya kunci PLAYER yang menimpa global; hidden/badge = metadata Chapter Select,
            // abaikan (chapter "ikut global" tetap dapat profil global penuh).
            ['spriteSlots'].forEach((k) => {
                if (override[k] !== undefined) merged[k] = override[k];
            });
            merged.restrictions = Object.assign({}, globalProfile.restrictions || {}, override.restrictions || {});
            return merged;
        },

        /**
         * Terapkan profil EFEKTIF (tema/gaya dialog/customCSS + cascade theme.css) ke DOM
         * player ini sebagai baseline — supaya custom player MENGHORMATI setting tab Gaya
         * (VN Player editor). Aman dipanggil saat boot; kreator bebas override/hapus di
         * CSS-nya sendiri. Template scaffold memanggilnya otomatis.
         */
        async applyEffectiveProfile() {
            let profile;
            try { profile = await this.getEffectiveProfile(); } catch (e) { return null; }
            if (!profile) return null;

            // 1. N5: tema & gaya dialog TIDAK lagi datang dari JSON. Custom player
            //    mendapat kosmetik dari cascade berkas di bawah — sumber yang sama
            //    dengan engine, jadi paritasnya tak bisa lagi menyimpang diam-diam.

            // 2. Cascade theme.css (baseline engine + novel + chapter) — hanya yang ADA.
            try {
                const css = await ipcRenderer.invoke('vn-engine:resolve-effective-css', {
                    storyTitle: _storyTitle, chapter: _chapter
                });
                if (css) {
                    this._injectProfileLink('vn-effective-theme', css.themeUrl);
                    this._injectProfileLink('vn-effective-novel-theme', css.novelUrl);
                    this._injectProfileLink('vn-effective-chapter-theme', css.chapterUrl);
                }
            } catch (e) { /* abaikan */ }

            // 3. (customCSS DICABUT — N5. Lapisan "menang atas segalanya" yang
            //    nilainya di JSON dan tak punya pintu UI sudah tak ada; yang paling
            //    lokal kini `<chapter>/theme.css`, dimuat di langkah 2.)
            return profile;
        },

        /** @private — pasang/refresh <link rel=stylesheet> ber-id (idempotent). */
        _injectProfileLink(id, href) {
            const old = document.getElementById(id);
            if (old) old.remove();
            // `null` dari resolver berarti lapisan ini tidak lagi efektif, bukan
            // perintah untuk mempertahankan stylesheet dari apply sebelumnya.
            if (!href) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet'; l.id = id; l.href = href;
            document.head.appendChild(l);
        },

        /** Metadata novel (novel-meta.json): title, description, genre, cover, images, dst. */
        async getNovelMeta() {
            if (!_storyTitle) return null;
            const res = await ipcRenderer.invoke('get-hub-details', _storyTitle);
            return (res && res.success) ? res : null;
        },

        /** Daftar chapter novel ini: { mainChapters: [], sideStories: [] }. */
        async getChapterList() {
            if (!_storyTitle) return { mainChapters: [], sideStories: [] };
            return await ipcRenderer.invoke('get-chapter-list', _storyTitle);
        },

        /**
         * Lompat ke chapter lain dari novel yang sama (mis. tombol "Chapter
         * Selanjutnya" buatan sendiri). Tetap melewati security check engine.
         */
        playChapter(chapterName) {
            if (!_storyTitle || !chapterName) return;
            ipcRenderer.send('play-chapter', { storyTitle: _storyTitle, chapter: chapterName });
        },

        /** Muat ulang chapter ini dari awal. */
        replayChapter() {
            this.playChapter(_chapter);
        },

        // =====================================
        // STORY ↔ HUB BRIDGE (untuk Custom Player)
        // Custom player mengelola variabel sendiri di renderer; API ini membuat
        // hasilnya tetap terlihat oleh hub (VNHub.getStoryFlags/getStoryVars).
        // =====================================
        /**
         * Tulis satu flag cerita persisten (setara custom command `set_hub_flag`
         * di player global). Dibaca hub via VNHub.getStoryFlags().
         */
        async setStoryFlag(key, value) {
            if (!_storyTitle || !key) return;
            try { await ipcRenderer.invoke('vn-hub:set-story-flag', { novelTitle: _storyTitle, key, value }); }
            catch (e) { console.error('[VNPlayer API] setStoryFlag gagal:', e); }
        },
        /** Baca semua flag cerita persisten novel ini. */
        async getStoryFlags() {
            if (!_storyTitle) return {};
            try {
                const res = await ipcRenderer.invoke('vn-hub:get-story-flags', _storyTitle);
                return (res && res.success && res.flags) || {};
            } catch (e) { return {}; }
        },
        /**
         * VFS — "folder virtual" per-novel (findings §9): pengganti tervalidasi
         * untuk meta-mekanik file (chr karakter, file misterius) tanpa menyentuh
         * filesystem nyata. Tersimpan di <novel>/vfs.json; hub membaca via VNHub.vfs.
         * Key path-like bebas, value JSON-able apa pun.
         */
        vfs: {
            async set(key, value) {
                if (!_storyTitle || !key) return false;
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-set', { novelTitle: _storyTitle, key, value }); return !!(r && r.success); }
                catch (e) { return false; }
            },
            async remove(key) {
                if (!_storyTitle || !key) return false;
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-remove', { novelTitle: _storyTitle, key }); return !!(r && r.success); }
                catch (e) { return false; }
            },
            async list() {
                if (!_storyTitle) return {};
                try { const r = await ipcRenderer.invoke('vn-novel:vfs-list', _storyTitle); return (r && r.success && r.files) || {}; }
                catch (e) { return {}; }
            },
            async get(key, fallback) {
                const files = await this.list();
                return Object.prototype.hasOwnProperty.call(files, key) ? files[key] : (fallback === undefined ? null : fallback);
            },
            async has(key) {
                const files = await this.list();
                return Object.prototype.hasOwnProperty.call(files, key);
            }
        },
        /**
         * Hapus satu save slot (findings §9/§11 — pola "hapus save" meta-mechanic
         * atau tombol hapus slot di UI save custom).
         * @returns {Promise<boolean>}
         */
        async deleteSaveSlot(slotId) {
            if (!_storyTitle) return false;
            try {
                const r = await ipcRenderer.invoke('vn-engine:delete-save-slot', { storyTitle: _storyTitle, slotId });
                return !!(r && r.success);
            } catch (e) { return false; }
        },
        /**
         * Persist snapshot SEMUA variabel milik custom player → story-vars.json.
         * Panggil saat chapter berakhir / sebelum returnToHub() agar hub bisa
         * membaca state cerita via VNHub.getStoryVars(). Player global melakukan
         * ini otomatis; custom player memanggilnya eksplisit.
         * @param {Object} vars - map variabel bebas (JSON-able)
         */
        async persistStoryVars(vars) {
            if (!_storyTitle) return;
            try {
                await ipcRenderer.invoke('vn-player:persist-story-vars', {
                    novelTitle: _storyTitle, chapter: _chapter, vars: vars || {}
                });
            } catch (e) { console.error('[VNPlayer API] persistStoryVars gagal:', e); }
        },

        // =====================================
        // SCRIPT LOGIC UTILITIES — evaluator kondisi & set_var SAMA dengan engine.
        // Custom player tak perlu menulis ulang semantik condition/set_var; cukup:
        //   if (VNPlayer.evaluateCondition(entry.condition, vars)) { ... }
        //   VNPlayer.applySetVar(vars, e.name, e.op, e.value)
        // Mendukung var-vs-var ("$namaVar" / {var:'nama'}), any/all/not, between,
        // bentuk terstruktur {var,index} (subscript array) & {concat:[...]} (gabung
        // string), dan op set_var tambahan (mod/min/max/random) — paritas penuh engine.
        // =====================================
        /** Resolusi operand: "$nama" / {var:'nama'} / {var,index} / {concat:[...]} → nilai; selain itu literal. */
        resolveOperand(value, variables) {
            variables = variables || {};
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (Array.isArray(value.concat)) {
                    return value.concat.map(part => {
                        const r = this.resolveOperand(part, variables);
                        return r === undefined || r === null ? '' : String(r);
                    }).join('');
                }
                if (value.var !== undefined) {
                    let v = variables[value.var];
                    if (value.index !== undefined) {
                        const idx = Number(this.resolveOperand(value.index, variables));
                        v = (Array.isArray(v) || typeof v === 'string') ? v[idx] : undefined;
                    }
                    return v === undefined ? 0 : v;
                }
            }
            if (typeof value === 'string' && value.length > 1 && value.charAt(0) === '$') {
                const v = variables[value.slice(1)];
                return v === undefined ? 0 : v;
            }
            return value;
        },
        /** Evaluasi condition (object/array/{all}/{any}/{not}) terhadap map variabel. */
        evaluateCondition(cond, variables) {
            variables = variables || {};
            if (!cond || typeof cond !== 'object') return true;
            if (Array.isArray(cond)) return cond.every(c => this.evaluateCondition(c, variables));
            if (Array.isArray(cond.all)) return cond.all.every(c => this.evaluateCondition(c, variables));
            if (Array.isArray(cond.any)) return cond.any.some(c => this.evaluateCondition(c, variables));
            if (cond.not !== undefined) return !this.evaluateCondition(cond.not, variables);
            const varName = cond.var, op = cond.op;
            if (!varName || !op) return true;
            let a = variables[varName] !== undefined ? variables[varName] : 0;
            if (cond.index !== undefined) {
                const idx = Number(this.resolveOperand(cond.index, variables));
                a = (Array.isArray(a) || typeof a === 'string') ? a[idx] : undefined;
                if (a === undefined) a = 0;
            }
            const b = this.resolveOperand(cond.value, variables);
            switch (op) {
                case '==': case '=': return String(a) === String(b);
                case '!=': return String(a) !== String(b);
                case '>':  return Number(a) > Number(b);
                case '>=': return Number(a) >= Number(b);
                case '<':  return Number(a) < Number(b);
                case '<=': return Number(a) <= Number(b);
                case 'in':  return Array.isArray(cond.value) && cond.value.map(v => this.resolveOperand(v, variables)).includes(a);
                case '!in': return Array.isArray(cond.value) && !cond.value.map(v => this.resolveOperand(v, variables)).includes(a);
                case 'between': {
                    if (!Array.isArray(cond.value) || cond.value.length < 2) return true;
                    const lo = Number(this.resolveOperand(cond.value[0], variables));
                    const hi = Number(this.resolveOperand(cond.value[1], variables));
                    const n = Number(a);
                    return n >= Math.min(lo, hi) && n <= Math.max(lo, hi);
                }
                default: return true;
            }
        },
        /** Terapkan operasi set_var ke map variabel (mutasi in-place, juga dikembalikan).
         *  `index` (opsional): tulis ke elemen array variables[name][index] — identik engine. */
        applySetVar(variables, name, op, value, index) {
            variables = variables || {};
            if (!name) return variables;
            const effectiveOp = op || '=';
            if (index !== undefined && index !== null && index !== '') {
                const idx = Number(this.resolveOperand(index, variables));
                if (!Number.isNaN(idx)) {
                    if (!Array.isArray(variables[name])) variables[name] = [];
                    const holder = { __el: variables[name][idx] };
                    this.applySetVar(holder, '__el', effectiveOp, value);
                    variables[name][idx] = holder.__el;
                    return variables;
                }
            }
            let cur = variables[name];
            if (cur === undefined) cur = 0;
            const resolved = (effectiveOp === 'random') ? value : this.resolveOperand(value, variables);
            const numVal = Number(cur), numInput = Number(resolved);
            switch (effectiveOp) {
                case '=': case 'set': variables[name] = resolved; break;
                case 'add': case '+=': variables[name] = numVal + numInput; break;
                case 'sub': case '-=': variables[name] = numVal - numInput; break;
                case 'mul': case '*=': variables[name] = numVal * numInput; break;
                case 'div': case '/=': variables[name] = numInput !== 0 ? numVal / numInput : numVal; break;
                case 'mod': case '%=': variables[name] = numInput !== 0 ? numVal % numInput : numVal; break;
                case 'min': variables[name] = Math.min(numVal, numInput); break;
                case 'max': variables[name] = Math.max(numVal, numInput); break;
                case 'random': {
                    const lo = Array.isArray(value) ? Number(this.resolveOperand(value[0], variables)) : 0;
                    const hi = Array.isArray(value) ? Number(this.resolveOperand(value[1], variables)) : (Number(resolved) || 0);
                    const a2 = Math.min(lo, hi), b2 = Math.max(lo, hi);
                    variables[name] = Math.floor(Math.random() * (b2 - a2 + 1)) + a2;
                    break;
                }
                default: variables[name] = resolved; break;
            }
            return variables;
        },
        /**
         * Sisipkan variabel ke string, mis. "Halo {playerName}!" — identik
         * vn-engine/core.js#interpolateVars. Token yang variabelnya tak ada
         * dibiarkan apa adanya (bukan diganti kosong) supaya typo kelihatan.
         */
        interpolateVars(text, variables) {
            if (typeof text !== 'string' || text.indexOf('{') === -1) return text;
            variables = variables || {};
            return text.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, function (match, name) {
                return Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match;
            });
        }
    };
})();

window.VNPlayer = VNPlayer;
window.dispatchEvent(new CustomEvent('vnplayer:api-ready'));
