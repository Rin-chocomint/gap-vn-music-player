/**
 * vn-hub-runtime.js — Runtime konvensi Hub code-first (SHARED & VERSIONED).
 *
 * Di-inject engine berdampingan dengan `vn-hub-api.js` ke setiap hub kustom.
 * Menyediakan perilaku berbasis data-attribute:
 *   - Alur scene: splash/warning (boot) berurutan → scene terminal (main_menu/info).
 *   - `data-bind`        : isi teks dari metadata novel.
 *   - `data-bind-asset`  : isi src gambar (cover) dari metadata.
 *   - `data-action`      : tombol (start | chapter-select | exit | continue | back | goto).
 *   - `data-transition`  : mode transisi MASUK sebuah scene (sequential|crossfade|cut).
 *
 * SCENE MANAGER (v1.1.0):
 * Perpindahan scene kini dikelola state machine kecil (`VNHubScenes`), bukan
 * sekadar toggle class serentak. Mode transisi:
 *   - sequential (default): scene lama fade-out SAMPAI SELESAI, baru scene baru
 *     fade-in. Menghilangkan frame "dua scene semi-transparan" khas crossfade
 *     yang membuat scene tujuan/latar root tampak bocor sebelum waktunya.
 *   - crossfade : perilaku lama — keduanya bertransisi bersamaan.
 *   - cut       : pindah instan tanpa transisi CSS (untuk splash beruntun
 *     dengan latar sama, dsb.).
 * Prioritas resolusi mode: argumen show() > data-transition scene tujuan >
 * data-scene-transition pada #hub-root/body > 'sequential'.
 *
 * Diekspos sebagai `window.VNHubScenes` dan `VNHub.scenes`. Event window:
 *   'vnhub:scene-will-change' { fromId, toId, transition }
 *   'vnhub:scene-change'      { fromId, toId, transition }
 * (juga dipancarkan lewat bus VNHub bila tersedia: VNHub.on('scene-change', ...)).
 *
 * KENAPA SHARED: dulu runtime ini ditanam inline di tiap hub.html sehingga
 * perbaikan engine tak menyebar tanpa recompose. Kini ia satu berkas; perbaikan
 * langsung berlaku ke semua hub yang memakai runtime eksternal.
 *
 * GATE: hanya berjalan bila hub menandai dirinya memakai runtime eksternal
 * (`window.__VN_HUB_EXTERNAL_RUNTIME__`). Hub lama yang masih menanam runtime
 * inline TIDAK akan menjalankan berkas ini (mencegah dobel-binding) sampai ia
 * di-recompose (saat itu hub.html baru menandai dirinya eksternal).
 */
(function () {
    'use strict';

    var RUNTIME_VERSION = '1.2.0';

    // Hub lama (runtime inline) → jangan jalan agar tidak dobel.
    if (!window.__VN_HUB_EXTERNAL_RUNTIME__) return;
    // Idempoten — cegah eksekusi ganda bila ter-inject lebih dari sekali.
    if (window.__VN_HUB_RUNTIME_RAN__) return;
    window.__VN_HUB_RUNTIME_RAN__ = true;
    console.log('[VN Hub Runtime] v' + RUNTIME_VERSION + ' aktif (shared).');

    function whenHubReady(cb) {
        if (window.VNHub && VNHub.isReady && VNHub.isReady()) { cb(); return; }
        if (window.VNHub) { VNHub.onReady(cb); return; }
        window.addEventListener('vnhub:api-ready', function () { VNHub.onReady(cb); }, { once: true });
    }

    function hubScenes() {
        return Array.prototype.slice.call(document.querySelectorAll('.hub-scene'))
            .filter(function (el) { return el.getAttribute('data-disabled') !== 'true'; });
    }

    function sceneId(el) { return el ? (el.getAttribute('data-scene-id') || null) : null; }

    function terminalScene() {
        var list = hubScenes();
        var byType = function (t) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('data-scene-type') === t) return list[i];
            }
            return null;
        };
        return byType('main_menu') || byType('info') || list[list.length - 1] || null;
    }

    // =====================================================================
    // SCENE MANAGER — perpindahan scene terkelola (perbaikan bug visibilitas:
    // crossfade membuat KEDUA scene semi-transparan bersamaan sehingga scene
    // tujuan & latar #hub-root tampak "di belakang" sebelum waktunya).
    // =====================================================================
    var _current = null;      // elemen scene aktif menurut manager
    var _transToken = 0;      // membatalkan aktivasi tertunda bila show() dipanggil lagi
    var _transitioning = false;

    // Durasi fade-out efektif (transition opacity) sebuah scene, dalam ms.
    function fadeMs(el) {
        try {
            var cs = getComputedStyle(el);
            var props = (cs.transitionProperty || '').split(',');
            var durs = (cs.transitionDuration || '0s').split(',');
            var delays = (cs.transitionDelay || '0s').split(',');
            var max = 0;
            for (var i = 0; i < props.length; i++) {
                var p = props[i].trim();
                if (p === 'opacity' || p === 'all') {
                    var d = parseFloat(durs[i % durs.length]) || 0;
                    var dl = parseFloat(delays[i % delays.length]) || 0;
                    if ((d + dl) * 1000 > max) max = (d + dl) * 1000;
                }
            }
            return Math.min(max, 5000); // pagar: transisi CSS ekstrem tak boleh mengunci alur
        } catch (e) { return 0; }
    }

    function defaultTransition() {
        var root = document.getElementById('hub-root');
        return (root && root.getAttribute('data-scene-transition')) ||
            (document.body && document.body.getAttribute('data-scene-transition')) ||
            'sequential';
    }

    function resolveScene(target) {
        if (!target) return null;
        if (typeof target !== 'string') return target;
        return document.querySelector('.hub-scene[data-scene-id="' + target + '"]');
    }

    function emitSceneEvent(name, detail) {
        // VNHub.emit sudah memancarkan window CustomEvent('vnhub:<name>') juga;
        // dispatch manual hanya fallback bila API belum ter-load.
        try {
            if (window.VNHub && typeof VNHub.emit === 'function') VNHub.emit(name, detail);
            else window.dispatchEvent(new CustomEvent('vnhub:' + name, { detail: detail }));
        } catch (e) { /* ignore */ }
    }

    function deactivate(el) {
        if (!el) return;
        el.classList.remove('active');
        el.classList.add('scene-leaving'); // hook CSS opsional untuk kreator
    }

    function activate(el) {
        hubScenes().forEach(function (s) {
            s.classList.remove('scene-leaving');
            if (s !== el) s.classList.remove('active');
        });
        el.classList.add('active');
        _current = el;
        var root = document.getElementById('hub-root');
        if (root) root.setAttribute('data-current-scene', sceneId(el) || '');
    }

    // Pindah instan tanpa memicu transisi CSS (mode 'cut').
    function activateInstant(fromEl, toEl) {
        var els = fromEl && fromEl !== toEl ? [fromEl, toEl] : [toEl];
        els.forEach(function (el) { el.style.transition = 'none'; });
        if (fromEl && fromEl !== toEl) fromEl.classList.remove('active');
        activate(toEl);
        // Paksa reflow agar 'transition: none' terpakai pada frame ini, lalu pulihkan.
        void toEl.offsetWidth;
        requestAnimationFrame(function () {
            els.forEach(function (el) { el.style.transition = ''; });
        });
    }

    /**
     * Tampilkan sebuah scene.
     * @param {string|Element} target - data-scene-id atau elemen .hub-scene.
     * @param {{transition?: 'sequential'|'crossfade'|'cut'}} [opts]
     * @returns {Promise<Element|null>} resolve saat scene tujuan aktif.
     */
    function showScene(target, opts) {
        opts = opts || {};
        var el = resolveScene(target);
        if (!el) {
            console.warn('[VN Hub Runtime] showScene: scene tidak ditemukan:', target);
            return Promise.resolve(null);
        }
        // Adopsi state awal (mis. hub.js sudah mengaktifkan scene sebelum manager jalan).
        if (!_current) _current = document.querySelector('.hub-scene.active');
        if (el === _current && el.classList.contains('active')) return Promise.resolve(el);

        var from = _current;
        var mode = opts.transition || el.getAttribute('data-transition') || defaultTransition();
        if (mode !== 'sequential' && mode !== 'crossfade' && mode !== 'cut') mode = 'sequential';
        // Aktivasi PERTAMA (belum ada scene asal): tampil instan ('cut') kecuali
        // caller secara eksplisit meminta mode lain. Fade-in di sini membuat latar
        // #hub-root/scene lain sempat tembus di frame-frame awal boot.
        if (!from) mode = opts.transition ? ((mode === 'sequential') ? 'crossfade' : mode) : 'cut';

        var token = ++_transToken;
        var detail = { fromId: sceneId(from), toId: sceneId(el), transition: mode };
        emitSceneEvent('scene-will-change', detail);
        _transitioning = true;

        function finish() {
            if (token !== _transToken) return null; // dibatalkan oleh show() lebih baru
            activate(el);
            _transitioning = false;
            emitSceneEvent('scene-change', detail);
            return el;
        }

        if (mode === 'cut') {
            activateInstant(from, el);
            _transitioning = false;
            emitSceneEvent('scene-change', detail);
            return Promise.resolve(el);
        }

        if (mode === 'crossfade') {
            return Promise.resolve(finish());
        }

        // sequential: fade-out scene lama sampai tuntas, baru fade-in scene baru.
        return new Promise(function (resolve) {
            deactivate(from);
            var ms = fadeMs(from);
            var done = false;
            function proceed() {
                if (done) return;
                done = true;
                from.removeEventListener('transitionend', onEnd);
                resolve(finish());
            }
            function onEnd(e) {
                if (e.target === from && (e.propertyName === 'opacity' || e.propertyName === 'visibility')) proceed();
            }
            if (ms <= 0) { proceed(); return; }
            from.addEventListener('transitionend', onEnd);
            setTimeout(proceed, ms + 80); // jaring pengaman bila transitionend tak terpicu
        });
    }

    // ---------------------------------------------------------------------
    // Alur boot: jalankan splash/warning berurutan, lalu berhenti di terminal.
    // ---------------------------------------------------------------------
    var _bootSkipped = false;

    function runFlow() {
        var boots = hubScenes().filter(function (s) { return s.classList.contains('hub-scene-boot'); });
        var term = terminalScene();

        // Scene yang SUDAH aktif sebelum runtime jalan bisa datang dari dua arah:
        //   1. Bootstrap anti-flash inline hub.html → mengaktifkan boot pertama
        //      sebelum first paint (agar latar #hub-root tak sempat terlihat).
        //   2. hub.js kreator (mis. skip-intro) → mengaktifkan scene terminal.
        // Bila keduanya terjadi, scene NON-boot menang (kreator sengaja melompati
        // boot). Penentuan "boot" memakai data-scene-type (splash/warning), bukan
        // class .hub-scene-boot — kreator yang menstrip class boot saat skip-intro
        // tetap terdeteksi benar.
        var actives = Array.prototype.slice.call(document.querySelectorAll('.hub-scene.active'));
        var isBootType = function (el) {
            var t = el.getAttribute('data-scene-type');
            return t === 'splash' || t === 'warning';
        };
        var nonBoot = actives.filter(function (a) { return !isBootType(a); })[0] || null;
        var preActive = nonBoot || actives[0] || null;

        var i = 0;

        // Pasang timer auto-lanjut / klik-skip untuk sebuah boot scene yang tampil.
        function armBoot(el) {
            if (el.getAttribute('data-scene-type') === 'splash') {
                var dur = parseInt(el.getAttribute('data-duration'), 10) || 3000;
                var t = setTimeout(next, dur);
                el.addEventListener('click', function () { clearTimeout(t); next(); }, { once: true });
            }
            // warning menunggu tombol [data-action="continue"] → ditangani handler aksi.
        }

        function next() {
            if (_bootSkipped) return;
            if (i >= boots.length) { if (term) showScene(term); return; }
            var el = boots[i++];
            showScene(el).then(function (shown) {
                if (!shown) { next(); return; }
                armBoot(el);
            });
        }
        window.__hubFlowNext = next;

        if (preActive) {
            _current = preActive;
            activate(preActive); // rapikan bila ada dobel-active (bootstrap + hub.js)
            var bi = boots.indexOf(preActive);
            if (bi < 0) return;  // sudah di scene terminal/non-boot → alur boot selesai
            i = bi + 1;          // lanjutkan alur DARI boot yang teradopsi
            armBoot(preActive);
            return;
        }
        next();
    }

    // Lewati semua boot scene tersisa dan langsung ke terminal scene.
    function skipBoot(opts) {
        _bootSkipped = true;
        var term = terminalScene();
        return term ? showScene(term, opts || { transition: 'cut' }) : Promise.resolve(null);
    }

    // API publik Scene Manager.
    var SceneManager = {
        version: RUNTIME_VERSION,
        /** Semua elemen scene aktif-boot (yang tidak data-disabled). */
        list: hubScenes,
        /** Semua data-scene-id. */
        ids: function () { return hubScenes().map(sceneId); },
        /** Elemen scene by id (termasuk yang disabled). */
        get: function (id) { return resolveScene(id); },
        /** Elemen scene yang sedang aktif. */
        current: function () { return _current || document.querySelector('.hub-scene.active'); },
        /** data-scene-id scene aktif. */
        currentId: function () { return sceneId(SceneManager.current()); },
        /** Apakah sedang di tengah transisi sequential. */
        isTransitioning: function () { return _transitioning; },
        /** Pindah scene. show(id | el, { transition }) → Promise<Element|null>. */
        show: showScene,
        /** Elemen scene terminal (main_menu > info > terakhir). */
        terminal: terminalScene,
        /** Lewati boot flow, langsung ke terminal scene. */
        skipBoot: skipBoot
    };
    window.VNHubScenes = SceneManager;
    function attachToVNHub() { if (window.VNHub && !window.VNHub.scenes) { window.VNHub.scenes = SceneManager; } }
    attachToVNHub();
    window.addEventListener('vnhub:api-ready', attachToVNHub, { once: true });

    function bindMeta() {
        var meta = VNHub.getNovelMeta() || {};
        document.querySelectorAll('[data-bind]').forEach(function (el) {
            var key = el.getAttribute('data-bind');
            if (meta[key] != null && String(meta[key]).trim() !== '') el.textContent = meta[key];
        });
        document.querySelectorAll('[data-bind-asset]').forEach(function (el) {
            if (meta.cover && el.tagName === 'IMG' && !el.getAttribute('src')) el.src = VNHub.resolveAsset(meta.cover);
        });
        var title = meta.title || VNHub.getStoryTitle();
        if (title) document.title = title;
    }

    function bindActions() {
        document.body.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            // Tombol boleh memaksa mode transisi via data-transition.
            var trans = btn.getAttribute('data-transition');
            var opts = trans ? { transition: trans } : undefined;
            if (action === 'start') {
                VNHub.getChapterList().then(function (c) {
                    var first = c.mainChapters && c.mainChapters[0];
                    if (first) VNHub.playChapter(first); else VNHub.showChapterSelect();
                });
            } else if (action === 'chapter-select') {
                VNHub.showChapterSelect();
            } else if (action === 'exit') {
                VNHub.exitToManager();
            } else if (action === 'continue') {
                if (typeof window.__hubFlowNext === 'function') window.__hubFlowNext();
            } else if (action === 'back') {
                var term = terminalScene(); if (term) showScene(term, opts);
            } else if (action === 'goto') {
                var id = btn.getAttribute('data-target');
                if (id) showScene(id, opts);
            } else if (action === 'link') {
                var href = btn.getAttribute('data-href');
                if (href) { try { window.open(href, '_blank'); } catch (err) { /* ignore */ } }
            }
            // Aksi lain (mis. 'gallery') belum ditangani runtime bawaan → no-op;
            // kreator bisa menanganinya sendiri via VNHub di hub.js.
        });
    }

    // Alur scene & binding aksi TIDAK menunggu context IPC — keduanya murni DOM.
    // (Dulu keduanya di whenHubReady; jeda menunggu context membuat latar
    // #hub-root telanjang terlihat sebelum splash pertama muncul.) Runtime
    // di-inject setelah did-finish-load, jadi DOM & hub.js sudah selesai jalan.
    bindActions();
    runFlow();

    // Hanya data-bind metadata yang butuh context novel.
    whenHubReady(function () {
        bindMeta();
    });
})();
