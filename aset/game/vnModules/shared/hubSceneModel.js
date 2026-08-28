/**
 * hubSceneModel.js — Model data Hub Scene & jembatan kompatibilitas legacy
 * === Hub Scene Workspace (refaktor Hub) — Fase 2 ===
 *
 * Modul ini menambahkan bentuk data `scenes` ke `hub-config.json` tanpa
 * mengubah UI besar dan tanpa membuang field lama. Ia menjadi single source
 * of truth untuk derivasi/normalisasi scene, sehingga editor (vnManager.html)
 * dan runtime (novel-hub.html, fase lanjut) memakai logika yang sama.
 *
 * Konsep penting:
 *   - "Hub Scene" = layar/bagian pengalaman Hub (Splash, Warning, Main Menu,
 *     Info, Credits, dst.), BUKAN scene di dalam script cerita.
 *   - Pada Fase 2, sumber kebenaran tetap field lama (bootSequence, warningScreen,
 *     menu, credits). `scenes` adalah lapisan terstruktur yang DITURUNKAN dari
 *     field lama. Inspector/runtime (fase berikut) yang akan membalik arah ini.
 *
 * API publik (VN.HubScenes):
 *   - normalize(config, options)  → pastikan config.scenes & sceneFlow ada
 *   - syncLegacy(config)          → tulis balik field lama dari scene (inverse bridge)
 *   - createScene(type, opts)     → factory scene default per tipe
 *   - sceneTypes()                → daftar metadata tipe scene
 *   - sceneTypeMeta(type)         → metadata satu tipe
 *
 * Catatan: ditulis ES5-friendly & tanpa dependensi agar aman dimuat baik di
 * konteks editor maupun runtime hub.
 */
(function (root) {
    'use strict';

    var VN = root.VN = root.VN || {};
    if (VN.HubScenes) return; // idempoten — jangan re-define jika sudah ada

    // Versi schema scene yang ditulis modul ini. Berdampingan dengan _configVersion
    // milik migrator backend (yang mengurus migrasi file), tidak menggantikannya.
    var SCENE_SCHEMA_VERSION = 2;

    // Fallback metadata tipe scene bila NodeRegistry belum dimuat (mis. runtime hub).
    // Sumber kebenaran sebenarnya: VN.NodeRegistry.C.HUB_SCENE_TYPES.
    var FALLBACK_SCENE_TYPES = [
        { value: 'splash',      icon: '🎬', label: 'Splash / Opening', description: 'Gambar atau video pembuka sebelum menu.' },
        { value: 'warning',     icon: '⚠️', label: 'Content Warning',  description: 'Layar peringatan konten sebelum cerita dimulai.' },
        { value: 'main_menu',   icon: '🏠', label: 'Main Menu',        description: 'Menu utama Hub dengan tombol navigasi.' },
        { value: 'info',        icon: 'ℹ️', label: 'Info Novel',       description: 'Metadata, sinopsis, dan cover novel.' },
        { value: 'credits',     icon: '🎖️', label: 'Credits',          description: 'Daftar kredit dan penghargaan.' },
        { value: 'custom_code', icon: '🔧', label: 'Custom Code',      description: 'Scene berbasis HTML/CSS custom (jalur Advanced).' },
        { value: 'blank',       icon: '⬜', label: 'Blank',            description: 'Scene kosong untuk desain manual.' },
    ];

    // Band "order" default per tipe agar scene hasil derivasi terurut logis.
    var ORDER_BY_TYPE = {
        splash: 10,
        warning: 20,
        main_menu: 30,
        info: 40,
        credits: 50,
        custom_code: 60,
        blank: 70
    };

    var DEFAULT_NAME_BY_TYPE = {
        splash: 'Splash Opening',
        warning: 'Content Warning',
        main_menu: 'Main Menu',
        info: 'Info Novel',
        credits: 'Credits',
        custom_code: 'Custom Code',
        blank: 'Scene Baru'
    };

    function sceneTypes() {
        if (VN.NodeRegistry && VN.NodeRegistry.C && Array.isArray(VN.NodeRegistry.C.HUB_SCENE_TYPES)) {
            return VN.NodeRegistry.C.HUB_SCENE_TYPES;
        }
        return FALLBACK_SCENE_TYPES;
    }

    function sceneTypeMeta(type) {
        var list = sceneTypes();
        for (var i = 0; i < list.length; i++) {
            if (list[i].value === type) return list[i];
        }
        return null;
    }

    function defaultNameForType(type) {
        if (DEFAULT_NAME_BY_TYPE[type]) return DEFAULT_NAME_BY_TYPE[type];
        var meta = sceneTypeMeta(type);
        return (meta && meta.label) || 'Scene Baru';
    }

    function defaultOrderForType(type) {
        return ORDER_BY_TYPE[type] !== undefined ? ORDER_BY_TYPE[type] : 90;
    }

    // ID acak untuk scene buatan user (createScene). Scene hasil derivasi memakai
    // ID deterministik agar rebuild dari legacy menghasilkan ID yang stabil.
    function genId(type) {
        return 'hub_scene_' + (type || 'blank') + '_' + Date.now().toString(36) +
            Math.floor(Math.random() * 1296).toString(36);
    }

    // ==========================================
    // DERIVASI: field lama → scenes
    // ==========================================
    /**
     * Bangun daftar scene dari field lama, MENCERMINKAN apa yang benar-benar
     * dirender runtime (novel-hub.html): boot → warning → (main_menu | info) + credits.
     *
     * Penting: runtime selalu menampilkan SATU layar terminal untuk Generated Hub —
     * Main Menu bila `menu.items` terisi, atau layar Info Novel (renderHubInfo) sebagai
     * fallback. Karena itu Generated Hub baru pun (menu kosong) tetap menurunkan scene
     * `info`, sehingga daftar scene MENJELASKAN isi preview (tidak ada lagi "list kosong
     * tetapi preview berisi").
     *
     * Custom Hub dirender dari hub.html → tidak menurunkan scene (sidebar menampilkan
     * item "Custom Hub Runtime" terpisah).
     * @param {object} config
     * @returns {Array<object>}
     */
    function deriveScenesFromLegacy(config) {
        var scenes = [];
        if (config && config.hubType === 'custom') return scenes;

        var boot = Array.isArray(config.bootSequence) ? config.bootSequence : [];
        for (var i = 0; i < boot.length; i++) {
            scenes.push({
                id: 'hub_scene_splash_' + (i + 1),
                name: boot.length > 1 ? ('Splash ' + (i + 1)) : DEFAULT_NAME_BY_TYPE.splash,
                type: 'splash',
                enabled: true,
                order: ORDER_BY_TYPE.splash + i,
                source: 'legacy:bootSequence[' + i + ']'
            });
        }

        var warn = config.warningScreen;
        if (warn && (warn.enabled === true || (typeof warn.text === 'string' && warn.text.trim() !== ''))) {
            scenes.push({
                id: 'hub_scene_warning',
                name: DEFAULT_NAME_BY_TYPE.warning,
                type: 'warning',
                enabled: warn.enabled !== false,
                order: ORDER_BY_TYPE.warning,
                source: 'legacy:warningScreen'
            });
        }

        // Layar terminal (cermin runtime showTerminalScreen()):
        //   - Main Menu jika ada item menu,
        //   - Blank jika hubLayout 'blank' (novel baru — hub hampa didesain user),
        //   - Info Novel landing sebagai fallback (novel lama).
        var menu = config.menu;
        if (menu && Array.isArray(menu.items) && menu.items.length > 0) {
            scenes.push({
                id: 'hub_scene_main_menu',
                name: DEFAULT_NAME_BY_TYPE.main_menu,
                type: 'main_menu',
                enabled: true,
                order: ORDER_BY_TYPE.main_menu,
                source: 'legacy:menu'
            });
        } else if (config.hubLayout === 'blank') {
            scenes.push({
                id: 'hub_scene_blank',
                name: 'Hub Kosong',
                type: 'blank',
                enabled: true,
                order: ORDER_BY_TYPE.info,
                source: 'legacy:blank'
            });
        } else {
            scenes.push({
                id: 'hub_scene_info',
                name: DEFAULT_NAME_BY_TYPE.info,
                type: 'info',
                enabled: true,
                order: ORDER_BY_TYPE.info,
                source: 'legacy:info'
            });
        }

        var credits = config.credits;
        if (credits && Array.isArray(credits.lines) && credits.lines.length > 0) {
            scenes.push({
                id: 'hub_scene_credits',
                name: DEFAULT_NAME_BY_TYPE.credits,
                type: 'credits',
                enabled: true,
                order: ORDER_BY_TYPE.credits,
                source: 'legacy:credits'
            });
        }

        return scenes;
    }

    // Bersihkan satu scene agar punya field wajib (id, name, type, order, enabled).
    function sanitizeScene(scene) {
        if (!scene || typeof scene !== 'object') return null;
        var type = scene.type || 'blank';
        var clean = {};
        // Salin semua properti yang sudah ada (mis. background/layout/source) lalu
        // timpa field wajib agar konsisten.
        for (var k in scene) {
            if (Object.prototype.hasOwnProperty.call(scene, k)) clean[k] = scene[k];
        }
        clean.id = scene.id || genId(type);
        clean.name = scene.name || defaultNameForType(type);
        clean.type = type;
        clean.enabled = scene.enabled !== false;
        clean.order = typeof scene.order === 'number' ? scene.order : defaultOrderForType(type);
        return clean;
    }

    // ==========================================
    // NORMALIZE — pastikan config.scenes & sceneFlow ada
    // ==========================================
    /**
     * Pastikan `config.scenes` & `config.sceneFlow` ada dan valid.
     *
     * - Jika `scenes` belum ada (atau kosong), turunkan dari field lama.
     * - Jika `options.rebuildFromLegacy` true, paksa derivasi ulang dari field lama
     *   (dipakai saat SAVE pada Fase 2, di mana field lama masih jadi sumber kebenaran).
     *   Override `name`/`enabled` dari scene lama dengan id yang sama dipertahankan.
     * - Field lama TIDAK PERNAH dihapus.
     *
     * @param {object} config
     * @param {{rebuildFromLegacy?: boolean}} [options]
     * @returns {object} config (dimutasi in-place)
     */
    function normalize(config, options) {
        options = options || {};
        if (!config || typeof config !== 'object') return config;

        if (typeof config.schemaVersion !== 'number') config.schemaVersion = SCENE_SCHEMA_VERSION;

        var hasScenes = Array.isArray(config.scenes) && config.scenes.length > 0;

        if (!hasScenes || options.rebuildFromLegacy) {
            var derived = deriveScenesFromLegacy(config);
            var preservedUser = [];

            if (Array.isArray(config.scenes) && config.scenes.length) {
                // Pertahankan SEMUA field rich-data (name, enabled, background, dst.) dari
                // scene legacy berdasarkan id. Hanya field struktural hasil derivasi yang
                // tidak ditimpa (id/type/order/source).
                var STRUCTURAL = { id: 1, type: 1, order: 1, source: 1 };
                var prevById = {};
                config.scenes.forEach(function (s) { if (s && s.id) prevById[s.id] = s; });
                derived.forEach(function (s) {
                    var prev = prevById[s.id];
                    if (!prev) return;
                    Object.keys(prev).forEach(function (k) {
                        if (STRUCTURAL[k]) return;
                        s[k] = prev[k];
                    });
                });

                // Pertahankan scene buatan user (tanpa backing legacy) agar TIDAK hilang
                // saat rebuild dari legacy. Scene legacy (source: 'legacy:...') digantikan
                // oleh hasil derivasi terbaru.
                var derivedIds = {};
                derived.forEach(function (s) { derivedIds[s.id] = true; });
                config.scenes.forEach(function (s) {
                    if (!s || typeof s !== 'object') return;
                    var isLegacyBacked = typeof s.source === 'string' && s.source.indexOf('legacy:') === 0;
                    if (isLegacyBacked) return;
                    if (derivedIds[s.id]) return; // id bentrok dengan derived → derived menang
                    preservedUser.push(sanitizeScene(s));
                });
            }

            config.scenes = derived.concat(preservedUser);
            config.scenes.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        } else {
            config.scenes = config.scenes.map(sanitizeScene).filter(Boolean);
        }

        if (!config.sceneFlow || typeof config.sceneFlow !== 'object') {
            config.sceneFlow = { startSceneId: null, transitions: [] };
        }
        if (!Array.isArray(config.sceneFlow.transitions)) config.sceneFlow.transitions = [];

        // Pastikan startSceneId valid; pilih scene aktif pertama (urut order).
        var ids = {};
        config.scenes.forEach(function (s) { ids[s.id] = true; });
        if (!config.sceneFlow.startSceneId || !ids[config.sceneFlow.startSceneId]) {
            var ordered = config.scenes.slice().sort(function (a, b) {
                return (a.order || 0) - (b.order || 0);
            });
            var firstEnabled = null;
            for (var i = 0; i < ordered.length; i++) {
                if (ordered[i].enabled !== false) { firstEnabled = ordered[i]; break; }
            }
            var pick = firstEnabled || ordered[0];
            config.sceneFlow.startSceneId = pick ? pick.id : null;
        }

        return config;
    }

    // ==========================================
    // SYNC LEGACY — scenes → field lama (inverse bridge)
    // ==========================================
    /**
     * Tulis balik field lama dari data scene. Pada Fase 2 scene masih ringan
     * (hanya metadata: id/name/type/enabled/order), jadi fungsi ini hanya
     * menyinkronkan field yang benar-benar dimiliki scene secara aman & non-destruktif.
     * Akan diperluas saat scene menjadi sumber kebenaran (Fase 7+).
     *
     * Field lama TIDAK dihapus; hanya nilai yang relevan diperbarui.
     * @param {object} config
     * @returns {object} config
     */
    function syncLegacy(config) {
        if (!config || typeof config !== 'object' || !Array.isArray(config.scenes)) return config;

        config.scenes.forEach(function (scene) {
            if (!scene || typeof scene !== 'object') return;
            if (scene.type === 'warning' && typeof scene.enabled === 'boolean') {
                if (!config.warningScreen || typeof config.warningScreen !== 'object') {
                    config.warningScreen = { enabled: false, text: '', style: 'default' };
                }
                config.warningScreen.enabled = scene.enabled;
            }
            // main_menu / splash / credits: field lama (menu/bootSequence/credits)
            // tetap dipegang builder legacy pada Fase 2 → tidak ditimpa di sini.
        });

        return config;
    }

    // ==========================================
    // FACTORY — scene default per tipe (dipakai Create Scene, Fase 4)
    // ==========================================
    /**
     * Buat objek scene baru dengan default minimal per tipe.
     * @param {string} type - salah satu dari sceneTypes()
     * @param {{id?:string,name?:string,order?:number,enabled?:boolean}} [opts]
     * @returns {object}
     */
    function createScene(type, opts) {
        opts = opts || {};
        type = type || 'blank';

        var scene = {
            id: opts.id || genId(type),
            name: opts.name || defaultNameForType(type),
            type: type,
            enabled: opts.enabled !== false,
            order: typeof opts.order === 'number' ? opts.order : defaultOrderForType(type)
        };

        // Hint default ringan per tipe (struktur penuh menyusul di fase inspector/runtime).
        switch (type) {
            case 'splash':
                scene.background = { type: 'image', src: '' };
                scene.duration = 3000;
                break;
            case 'warning':
                scene.text = '';
                scene.style = 'default';
                break;
            case 'main_menu':
                scene.layout = { preset: '', safeArea: 'center' };
                scene.background = { type: '', src: '' };
                break;
            case 'custom_code':
                scene.customFile = 'hub.html';
                break;
            default:
                break;
        }

        return scene;
    }

    // ==========================================
    // SCENE ↔ SCREEN MAPPING (Fondasi bersama)
    // ==========================================
    // Pemetaan kanonik tipe Hub Scene → screenId runtime (novel-hub.html).
    // `screenId` mengacu pada elemen #screen-<id> sekaligus nilai `detail.screen`
    // pada event `vnhub:navigate`. Dipakai oleh:
    //   - Live highlight: screen yang sedang tampil → sorot scene di hub-scene-list.
    //   - Per-scene preview (rencana berikutnya): scene terpilih → kunci ke 1 screen.
    var TYPE_TO_SCREEN = {
        splash: 'boot',
        warning: 'warning',
        main_menu: 'main-menu',
        info: 'hub-info',
        blank: 'blank',
        credits: 'credits'
        // custom_code: tidak punya screen kanonik (jalur Advanced/Custom Hub).
    };

    // Sub-screen yang dijangkau DARI main menu dan tak punya Hub Scene tersendiri.
    // Untuk highlight, perlakukan sebagai masih berada di scene main_menu.
    var SUBSCREEN_ORIGIN_TYPE = {
        'chapter-select': 'main_menu',
        'load-game': 'main_menu',
        'gallery': 'main_menu',
        'settings': 'main_menu'
    };

    // Normalisasi penulisan id screen (runtime kadang memakai 'main_menu' vs 'main-menu').
    function normScreenId(screenId) {
        return String(screenId == null ? '' : screenId).trim().toLowerCase().replace(/_/g, '-');
    }

    // screenId runtime → tipe scene editor (atau null bila tak dikenali).
    function screenToType(screenId) {
        var s = normScreenId(screenId);
        for (var type in TYPE_TO_SCREEN) {
            if (!Object.prototype.hasOwnProperty.call(TYPE_TO_SCREEN, type)) continue;
            if (normScreenId(TYPE_TO_SCREEN[type]) === s) return type;
        }
        if (SUBSCREEN_ORIGIN_TYPE[s]) return SUBSCREEN_ORIGIN_TYPE[s];
        return null;
    }

    // tipe scene → screenId runtime (atau null untuk tipe tanpa screen kanonik).
    function typeToScreen(type) {
        return TYPE_TO_SCREEN[type] || null;
    }

    // tipe scene → sceneId pada config. Pilih scene aktif (enabled) pertama menurut
    // `order`; fallback ke scene pertama bertipe sama bila semua nonaktif.
    // Dipakai hub custom code-first yang melaporkan data-scene-type section yang sedang
    // tampil (ID section di hub.html bisa beda dari ID config → cocokkan via type).
    function resolveSceneIdForType(config, type) {
        if (!config || !Array.isArray(config.scenes) || !type) return null;
        var ordered = config.scenes.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var firstAny = null;
        for (var i = 0; i < ordered.length; i++) {
            var sc = ordered[i];
            if (!sc || sc.type !== type) continue;
            if (firstAny === null) firstAny = sc;
            if (sc.enabled !== false) return sc.id;
        }
        return firstAny ? firstAny.id : null;
    }

    // Cari sceneId pada config yang berkorespondensi dengan sebuah screenId runtime.
    // Kembalikan null bila tak ada padanan.
    function resolveSceneIdForScreen(config, screenId) {
        return resolveSceneIdForType(config, screenToType(screenId));
    }

    // Kebalikannya: screenId runtime untuk sebuah sceneId (dipakai Per-scene preview).
    function resolveScreenForScene(config, sceneId) {
        if (!config || !Array.isArray(config.scenes)) return null;
        for (var i = 0; i < config.scenes.length; i++) {
            var sc = config.scenes[i];
            if (sc && sc.id === sceneId) return typeToScreen(sc.type);
        }
        return null;
    }

    VN.HubScenes = {
        SCHEMA_VERSION: SCENE_SCHEMA_VERSION,
        normalize: normalize,
        syncLegacy: syncLegacy,
        createScene: createScene,
        deriveFromLegacy: deriveScenesFromLegacy,
        sceneTypes: sceneTypes,
        sceneTypeMeta: sceneTypeMeta,
        defaultNameForType: defaultNameForType,
        defaultOrderForType: defaultOrderForType,
        // Mapping scene ↔ screen (fondasi Live highlight & Per-scene preview)
        TYPE_TO_SCREEN: TYPE_TO_SCREEN,
        normScreenId: normScreenId,
        screenToType: screenToType,
        typeToScreen: typeToScreen,
        resolveSceneIdForType: resolveSceneIdForType,
        resolveSceneIdForScreen: resolveSceneIdForScreen,
        resolveScreenForScene: resolveScreenForScene
    };

    // Alias global sesuai penamaan di dokumen perancangan (Fase 2/3/4) agar mudah
    // ditemukan oleh kode/pencarian lintas fase.
    if (typeof root.normalizeHubScenes !== 'function') {
        root.normalizeHubScenes = normalize;
    }
    if (typeof root.syncLegacyHubConfigFromScenes !== 'function') {
        root.syncLegacyHubConfigFromScenes = syncLegacy;
    }
    if (typeof root.createDefaultHubScene !== 'function') {
        root.createDefaultHubScene = createScene;
    }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
