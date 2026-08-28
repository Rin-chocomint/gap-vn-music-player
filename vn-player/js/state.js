/**
 * VN Player — State
 * Pusat referensi DOM dan variabel state engine.
 * Semua modul mengakses DOM dan state melalui objek ini.
 */

const VNState = (() => {
    // === REFERENSI ELEMEN DOM — resolusi berbasis PERAN ===
    //
    // Dulu tiap simpul di-cache SEKALI lewat getElementById(id) saat modul dimuat.
    // Itu membuat engine terikat pada 46 id hardcoded: kreator tak bisa menyusun
    // ulang UI gameplay, dan cache basi bila markup dibangun ulang belakangan
    // (biang bug `processCharSprites` `.dataset of null`).
    //
    // Sekarang engine mencari PERAN (`data-player-role`), bukan id. Kreator boleh
    // membungkus/memindah/menata ulang elemen asal perannya tetap ada; `id`/`class`
    // tinggal urusan CSS. Lihat docs/rancangan-kontrak-peran-ui-player.md.
    //
    // TAHAP 4 SELESAI (2026-07-31): cadangan resolusi lewat `id` DICABUT. Peran kini
    // SATU-SATUNYA kontrak — sebuah elemen ditemukan engine jika dan hanya jika ia
    // menyatakan `data-player-role`.
    //
    // Kenapa pasangan id-nya masih tercatat di bawah (`idLama`): ia bukan lagi jalur
    // resolusi, melainkan PENGETAHUAN MIGRASI. Dua alat memarsingnya dari sini
    // supaya tak ada tabel salinan yang bisa basi:
    //   tools/migrasi-peran-id.js       id lama → data-player-role di player.html
    //   vn-engine/theme-materializer.js `#dialogue-box` → `[data-player-role="…"]`
    //                                   di customCSS yang dimaterialisasi (N5)
    // Kalau `idLama` ikut dihapus, keduanya diam-diam berhenti bekerja tepat saat
    // kreator paling membutuhkannya. Dijaga kontrak: `resolveRole` TIDAK boleh
    // menyentuhnya.
    const ROLE_SPEC = {
        // — Lapis 1: panggung cerita (INTI) —
        gameContainer:       { role: 'stage',            idLama: 'game-container' },
        transitionOverlay:   { role: 'transition',       idLama: 'transition-overlay' },
        background:          { role: 'background',        idLama: 'background' },
        backgroundNext:      { role: 'background-next',   idLama: 'background-next' },
        backgroundVideo:     { role: 'background-video',  idLama: 'background-video' },
        textScreenOverlay:   { role: 'text-screen',       idLama: 'text-screen-overlay' },
        dialogueBox:         { role: 'dialogue',          idLama: 'dialogue-box' },
        characterName:       { role: 'speaker',           idLama: 'character-name' },
        dialogueText:        { role: 'text',              idLama: 'dialogue-text' },
        makeChoiceContainer: { role: 'choices',           idLama: 'make-choice-container' },
        charSpritesLayer:    { role: 'sprite-layer',      idLama: 'char-sprites-layer' },
        // — Lapis 2: kontrol & panel (OPSIONAL — hilang = fiturnya sekadar tak ada) —
        autoModeButton:      { role: 'btn-auto',          idLama: 'auto-mode-button' },
        historyButton:       { role: 'btn-history',       idLama: 'history-button' },
        rollbackButton:      { role: 'btn-rollback',      idLama: 'rollback-button' },
        backToHubButton:     { role: 'btn-hub',           idLama: 'back-to-hub-button' },
        backlogOverlay:      { role: 'backlog',           idLama: 'backlog-overlay' },
        backlogContent:      { role: 'backlog-content',   idLama: 'backlog-content' },
        closeBacklogButton:  { role: 'backlog-close',     idLama: 'close-backlog-button' },
        saveButton:          { role: 'btn-save',          idLama: 'save-button' },
        loadButton:          { role: 'btn-load',          idLama: 'load-button' },
        settingButton:       { role: 'btn-settings',      idLama: 'setting-button' },
        saveLoadModal:       { role: 'saveload',          idLama: 'save-load-modal' },
        slotsContainer:      { role: 'saveload-slots',    idLama: 'slots-container' },
        saveLoadTitle:       { role: 'saveload-title',    idLama: 'save-load-title' },
        closeSaveLoadModal:  { role: 'saveload-close',    idLama: 'close-save-load-modal' },
        settingsModal:       { role: 'settings',          idLama: 'settings-modal' },
        settingBgmVolume:    { role: 'set-bgm',           idLama: 'setting-bgm-volume' },
        settingVoiceVolume:  { role: 'set-voice',         idLama: 'setting-voice-volume' },
        settingSfxVolume:    { role: 'set-sfx',           idLama: 'setting-sfx-volume' },
        bgmVolumeDisplay:    { role: 'bgm-display',       idLama: 'bgm-volume-display' },
        voiceVolumeDisplay:  { role: 'voice-display',     idLama: 'voice-volume-display' },
        sfxVolumeDisplay:    { role: 'sfx-display',       idLama: 'sfx-volume-display' },
        closeSettingsBtn:    { role: 'settings-close',    idLama: 'close-settings-modal' },
        saveSettingsBtn:     { role: 'settings-save',     idLama: 'save-settings-btn' },
        fullscreenToggle:    { role: 'set-fullscreen',    idLama: 'setting-fullscreen-toggle' },
        settingTextSpeed:    { role: 'set-text-speed',    idLama: 'setting-text-speed' },
        textSpeedDisplay:    { role: 'text-speed-display',idLama: 'text-speed-display' },
        settingAutoDelay:    { role: 'set-auto-delay',    idLama: 'setting-auto-delay' },
        autoDelayDisplay:    { role: 'auto-delay-display',idLama: 'auto-delay-display' },
        // — Lapis 3: non-tampilan (wajib, tapi memindahkannya tak berarti visual) —
        bgmAudio:            { role: 'bgm',               idLama: 'bgm-audio' },
        sfxAudio:            { role: 'sfx',               idLama: 'sfx-audio' },
        voiceAudio:          { role: 'voice',             idLama: 'voice-audio' },
        toastContainer:      { role: 'toast',             idLama: 'vn-toast-container' },
    };

    // (End Screen & slot sprite TIDAK di ROLE_SPEC. End screen = scene `end`
    //  (dicari saat dibutuhkan). Slot sprite (`charSprite1/2/Center` + alias)
    //  dibangun DINAMIS oleh setupSpriteSlots dan di-assign imperatif — bukan
    //  markup yang bisa ditandai peran; mereka disimpan lewat set trap di bawah.)

    // Katalog peran: lapis kepentingan + apa akibatnya bila hilang. Dibaca registry
    // peran-hilang (pesan warn) DAN inspektur kontrak di editor (tahap 3) — satu
    // sumber, bukan disalin. Lapis: 1=inti panggung, 2=kontrol opsional, 3=audio.
    const ROLE_META = {
        stage:            { lapis: 1, akibat: 'panggung & permukaan klik hilang' },
        transition:       { lapis: 1, akibat: 'transisi antar-adegan mati' },
        background:       { lapis: 1, akibat: 'latar gambar tak tampil' },
        'background-next':{ lapis: 1, akibat: 'cross-fade latar mati' },
        'background-video':{ lapis: 1, akibat: 'latar video mati' },
        'text-screen':    { lapis: 1, akibat: 'adegan layar-teks mati' },
        dialogue:         { lapis: 1, akibat: 'kotak dialog tak tampil' },
        speaker:          { lapis: 1, akibat: 'nama tokoh tak tampil' },
        text:             { lapis: 1, akibat: 'teks cerita tak tampil' },
        choices:          { lapis: 1, akibat: 'pilihan tak bisa ditampilkan' },
        'sprite-layer':   { lapis: 1, akibat: 'sprite karakter tak tampil' },
        bgm:              { lapis: 3, akibat: 'BGM tak bisa diputar' },
        sfx:              { lapis: 3, akibat: 'efek suara tak bisa diputar' },
        voice:            { lapis: 3, akibat: 'suara karakter tak bisa diputar' },
        toast:            { lapis: 3, akibat: 'notifikasi tak tampil' },
        // Sisanya Lapis 2 (kontrol opsional) — akibatnya seragam: fiturnya tak ada.
    };
    function roleMeta(role) {
        return ROLE_META[role] || { lapis: 2, akibat: 'kontrol "' + role + '" tidak tersedia' };
    }

    // === Registry PERAN-HILANG (kebijakan §5: stub yang MELAPOR) ===
    // Prinsip: stub boleh menelan EFEK, tapi tidak boleh menelan INFORMASI.
    // Peran yang tak ada di markup → engine tetap jalan (stub menyerap akses),
    // tiap peran dicatat & di-warn SEKALI, lalu diekspos ke editor & extension.
    const _missingRoles = new Map();   // role -> 'missing' | 'omitted'
    // Peran yang SENGAJA tak dipakai kreator — dinyatakan via `data-player-omit`
    // di blok layar cerita (base). DIBACA DARI MARKUP (bukan JSON side-store),
    // sejalan keluarga data-player-*. Membedakan "lupa" (⚠ warn) dari "pilihan" (diam).
    function omittedRoleSet() {
        if (typeof document === 'undefined') return null;
        var base = document.querySelector('[data-scene-mode="base"][data-player-omit]');
        if (!base) return null;
        var raw = (base.getAttribute('data-player-omit') || '').trim();
        return raw ? new Set(raw.split(/\s+/)) : new Set();
    }
    function noteMissingRole(role) {
        if (_missingRoles.has(role)) return;
        var omit = omittedRoleSet();
        if (omit && omit.has(role)) {
            _missingRoles.set(role, 'omitted');   // diakui sengaja → TIDAK di-warn
            return;
        }
        _missingRoles.set(role, 'missing');
        var m = roleMeta(role);
        console.warn('[VNRoles] Peran hilang: "' + role + '" — ' + m.akibat +
            ' (markup tidak menyediakan [data-player-role="' + role + '"]).');
    }
    // Stub: menyerap get/set/call apa pun tanpa crash, condong FALSY untuk
    // perbandingan (mis. `.classList.contains(x)` → undefined). TIDAK di-cache
    // (isConnected:false) supaya begitu kreator menambah perannya, langsung terpakai.
    const _KOSONG = { isConnected: false, value: '', textContent: '', innerHTML: '',
                      src: '', id: '', className: '', nodeType: 0, length: 0 };
    function makeRoleStub() {
        var f = function () {};
        var stub = new Proxy(f, {
            get: function (_t, prop) {
                if (prop in _KOSONG) return _KOSONG[prop];
                if (prop === Symbol.toPrimitive || prop === 'valueOf' || prop === 'toString') return function () { return ''; };
                return stub;   // properti & metode apa pun → chainable/callable
            },
            set: function () { return true; },        // dom.X.style.display = ... → ditelan
            apply: function () { return undefined; },  // classList.add(...) / play() → no-op
        });
        return stub;
    }
    var _stubTunggal = null;
    function roleStub() { return _stubTunggal || (_stubTunggal = makeRoleStub()); }

    // === POTONG 3 — KREATOR MENANG, per PERAN ===
    //
    // Shim menyuntik markup engine ke `#vn-engine-root`, lalu membuang kembarannya
    // berdasarkan NAMA SCENE. Granularitas itu semua-atau-tidak: memiliki kotak
    // dialog berarti mengambil alih seluruh layar cerita (43 peran) dan
    // MEMBEKUKANNYA — perbaikan engine berikutnya tak sampai.
    //
    // Di sini aturan yang sama diterapkan per-PERAN: elemen engine yang perannya
    // JUGA dideklarasikan kreator di luar wadah suntikan dibuang, sisanya tetap
    // milik engine dan ikut update. Kepemilikan campur.
    //
    // ⚠ KENAPA DI ENGINE, BUKAN DI SHIM. Logika suntikan shim TERSALIN ke tiap
    // novel saat template diterapkan (hari ini 3 salinan beredar + 1 template).
    // Menaruh dedup di sana berarti novel yang sudah ada tak akan pernah
    // mendapatkannya tanpa menerapkan ulang template — yaitu kehilangan
    // suntingannya. Engine dimuat BERSAMA oleh semua salinan, jadi satu rumah di
    // sini menjangkau semuanya sekaligus. (Penyakit E1 dalam bentuk kecil:
    // memperbaiki sesuatu yang sudah terlanjur disalin.)
    //
    // Wajib berjalan SEBELUM resolusi peran pertama — `_domCache` memoize, dan
    // memo yang menunjuk elemen engine yang seharusnya dibuang akan bertahan
    // seumur sesi. Aman: shim menyuntik markup (langkah 2) sebelum memuat script
    // engine (langkah 3), jadi DOM sudah lengkap saat berkas ini dieksekusi.
    function dedupPeranKreator() {
        const wadah = document.getElementById('vn-engine-root');
        // Nol wadah = tak ada yang disuntik (player global / custom) → tak ada
        // kembar yang mungkin. Bukan kegagalan.
        if (!wadah) return 0;
        const punyaKreator = new Set();
        document.querySelectorAll('[data-player-role]').forEach(function (el) {
            if (!wadah.contains(el)) punyaKreator.add(el.getAttribute('data-player-role'));
        });
        let dibuang = 0;
        punyaKreator.forEach(function (peran) {
            // SEMUA kembar, bukan yang pertama saja — markup engine boleh saja
            // memuat peran yang sama lebih dari sekali kelak.
            wadah.querySelectorAll('[data-player-role="' + peran + '"]').forEach(function (el) {
                el.remove();
                dibuang++;
            });
        });
        if (dibuang) {
            console.log('[VNState] Potong 3: ' + dibuang + ' elemen engine dibuang — ' +
                'perannya disediakan kreator (' + Array.from(punyaKreator).join(', ') + ').');
        }
        return dibuang;
    }
    dedupPeranKreator();

    /**
     * Dedup per-NAMA SCENE — jaring pengaman untuk dedup shim.
     *
     * Shim juga membuang kembaran scene, tapi ia melakukannya dari dalam
     * `<script>` inline yang berjalan SAAT PARSING. `document.querySelectorAll`
     * di sana hanya melihat markup DI ATAS script itu, sedangkan scene yang
     * ditambahkan kemudian — baik oleh preset maupun oleh "ambil alih scene" —
     * mendarat tepat sebelum `</body>`, jauh di bawahnya. Akibatnya scene yang
     * sudah kreator ambil alih tetap punya kembaran engine, dan keduanya menyala
     * bersamaan.
     *
     * Tak pernah terlihat sampai sekarang karena satu-satunya pembawa scene
     * sebelumnya adalah preset, dan penjaga tabrakan menolak preset yang memakai
     * nama milik engine — jadi tak pernah ada kembaran untuk dibuang. Ambil-alih
     * adalah fitur pertama yang MEMANG membuat nama kembar dengan sengaja.
     *
     * ⚠ DI ENGINE, BUKAN DI SHIM — alasan yang sama persis dengan
     * `dedupPeranKreator` di atas: shim tersalin ke tiap novel, engine tidak.
     * Memperbaikinya di shim berarti novel yang sudah ada tak pernah ikut sembuh.
     * Yang di shim sengaja DIBIARKAN: ia berjalan lebih awal (sebelum layar
     * digambar), jadi untuk scene yang memang terlihat olehnya ia mencegah kedip.
     * Yang ini menyapu sisanya, dan bekerja nol kali bila tak ada sisa.
     */
    function dedupSceneKreator() {
        const wadah = document.getElementById('vn-engine-root');
        if (!wadah) return 0;
        const punyaKreator = new Set();
        document.querySelectorAll('[data-player-scene]').forEach(function (el) {
            if (!wadah.contains(el)) punyaKreator.add(el.getAttribute('data-player-scene'));
        });
        let dibuang = 0;
        punyaKreator.forEach(function (nama) {
            wadah.querySelectorAll('[data-player-scene="' + nama + '"]').forEach(function (el) {
                el.remove();
                dibuang++;
            });
        });
        if (dibuang) {
            console.log('[VNState] Dedup scene: ' + dibuang + ' layar engine dibuang — ' +
                'namanya disediakan kreator (' + Array.from(punyaKreator).join(', ') + ').');
        }
        return dibuang;
    }
    dedupSceneKreator();

    /**
     * Cerminkan gaya dialog ke `<html>` — kunci kedua dari perbaikan cascade
     * yang dijelaskan panjang di `css/dialogue-variants.css`.
     *
     * Ringkasnya: custom property diambil dari ANCESTOR TERDEKAT yang
     * mendeklarasikannya. Selama kelas gaya menempel di `#game-container`, ia
     * selalu lebih dekat ke kotak dialog daripada `:root` — jadi setiap
     * `--vn-dialogue-*` milik kreator (theme.css preset MAUPUN picker editor)
     * kalah tanpa peringatan. Dengan kelasnya di `<html>`, varian dan kreator
     * mendeklarasikan di elemen yang SAMA dan cascade biasa yang memutuskan.
     *
     * DITARUH DI ENGINE, bukan di shim — dan itu keputusan yang sama dengan
     * dedup Potong 3: shim TERSALIN ke tiap novel, jadi memperbaikinya di sana
     * tak akan pernah menjangkau novel yang sudah ada. `state.js` dimuat oleh
     * semua salinan sekaligus.
     *
     * Dua sumber dibaca karena dua generasi berkas beredar: shim menulis
     * `data-dialogue-style` di <body>, dan salinan lama menaruh kelasnya di
     * `#game-container`. Yang kedua kini tak cocok selektor mana pun, jadi
     * membacanya adalah satu-satunya cara novel lama tetap dapat variannya.
     */
    function cerminkanGayaDialog() {
        if (typeof document === 'undefined' || !document.documentElement) return '';
        var akar = document.documentElement;
        var gaya = (document.body && document.body.getAttribute('data-dialogue-style')) || '';
        if (!gaya) {
            var pembawa = document.querySelector('[class*="dialogue-style-"]');
            var cocok = pembawa && pembawa.className.match(/dialogue-style-([\w-]+)/);
            if (cocok) gaya = cocok[1];
        }
        if (!gaya) return '';                       // player global: nol varian, baseline variables.css
        // Bersihkan dulu: hot-reload boleh mengganti gaya, dan dua kelas gaya
        // sekaligus akan membuat pemenangnya ditentukan urutan berkas — bukan
        // pilihan kreator.
        akar.className = akar.className.replace(/\bdialogue-style-\S+/g, '').trim();
        akar.classList.add('dialogue-style-' + gaya);
        return gaya;
    }
    cerminkanGayaDialog();

    // Memo per-peran: re-resolve hanya bila node lepas dari dokumen (markup
    // dibangun ulang). `isConnected` murah → akses panas (bgmAudio 47×) tak
    // memanggil querySelector tiap kali, tapi slot yang di-rebuild tetap tertangkap.
    const _domCache = Object.create(null);
    const _domOverride = Object.create(null);   // nilai yang di-assign imperatif

    function resolveRole(role) {
        const c = _domCache[role];
        if (c && c.isConnected) return c;
        // TAHAP 4: nol cadangan. Dulu baris ini diakhiri
        // `|| (id ? document.getElementById(id) : null)`, dan itulah yang membuat
        // elemen bisa BEKERJA di runtime sambil DILAPORKAN HILANG oleh inspektur
        // editor (yang hanya memindai `data-player-role`) — laporan yang salah,
        // bukan sekadar kurang lengkap. Menghapus jalurnya menutup kelas itu di
        // akarnya, bukan menambal laporannya.
        const el = document.querySelector('[data-player-role="' + role + '"]');
        if (el) { _domCache[role] = el; return el; }
        // Hilang → catat (sekali) + kembalikan stub pelapor. Stub TIDAK di-cache:
        // akses berikutnya mencoba querySelector lagi (kreator bisa menambahkannya).
        noteMissingRole(role);
        return roleStub();
    }

    // Diekspos untuk VNPlayer.getRoleReport() & inspektur kontrak editor.
    const VNRoles = {
        meta: ROLE_META,
        metaFor: roleMeta,
        report: function () {
            return Array.from(_missingRoles.entries()).map(function (e) {
                var m = roleMeta(e[0]);
                return { role: e[0], lapis: m.lapis, akibat: m.akibat, status: e[1] };
            });
        },
        // Daftar SEMUA peran yang dikenal engine (dipakai editor: "yang seharusnya ada").
        known: function () {
            var out = [];
            for (var k in ROLE_SPEC) out.push(ROLE_SPEC[k].role);
            return out;
        }
    };

    const dom = new Proxy({}, {
        get(_t, key) {
            if (typeof key !== 'string') return undefined;
            if (key in _domOverride) return _domOverride[key];
            const spec = ROLE_SPEC[key];
            return spec ? resolveRole(spec.role) : undefined;
        },
        set(_t, key, val) { _domOverride[key] = val; return true; },
        has(_t, key) { return (key in _domOverride) || (key in ROLE_SPEC); },
    });

    // Slot sprite legacy: null saat mulai (belum ada slot), diisi setupSpriteSlots.
    dom.charSprite1 = document.getElementById('char-sprite-1');
    dom.charSprite2 = document.getElementById('char-sprite-2');
    dom.charSpriteCenter = document.getElementById('char-sprite-center');
    dom.characterSprite = dom.charSprite1;
    dom.characterSprite2 = dom.charSprite2;
    dom.characterSpriteCenter = dom.charSpriteCenter;

    // === VARIABEL STATE ===
    const state = {
        // Typewriter
        isTyping: false,
        typewriterTimeout: null,
        currentFullText: '',
        TYPE_SPEED: 45,

        // Auto Mode
        AUTO_MODE_DELAY: 2000,
        isAutoMode: false,
        autoModeTimeout: null,

        // Transitions
        transitionDuration: 500,
        pendingExitTransition: null,

        // Current Display Data
        currentData: {},

        // Preview Mode
        isPreviewMode: false,
        isLabelPreviewMode: false,
        labelPreviewInfo: null,

        // Web Audio API
        audioContext: null,
        bgmSource: null,
        sfxSource: null,
        voiceSource: null,
        bgmPanner: null,
        sfxPanner: null,
        voicePanner: null,
        globalVolume: 0.8,
        originalPhaseBgmVolume: 0.5,
        isPhaseBgmCurrentlyMuted: false,
        audioFallbackMode: false,

        // Volume multipliers dari settings
        bgmVolumeMultiplier: 0.8,
        voiceVolumeMultiplier: 0.8,
        sfxVolumeMultiplier: 0.8,

        // Responsive Scaling
        REFERENCE_HEIGHT: 900,
        currentResponsiveScale: 1,

        // Event Blocking (Special Event wait=true)
        isEventBlocking: false,

        // Save/Load
        currentModalMode: 'save',

        // Chapter Context (diisi via IPC dari engine, untuk resolve path aset)
        basePath: '',       // Path absolut ke folder chapter (file:// URL)
        novelPath: '',      // Path absolut ke folder novel
        storyTitle: '',
        chapterName: '',
    };

    // Dynamic styles element untuk runtime keyframes.
    //
    // Disisipkan SEBELUM `#creator-style` bila ada (diperbaiki 2026-07-30, edge case
    // yang tercatat saat E1): node ini dulu selalu di-`appendChild` sehingga mendarat
    // di EKOR `<head>` — sesudah blok CSS kreator di template shim. Untuk aturan biasa
    // itu tak masalah, tapi `@keyframes` BERNAMA SAMA yang ditulis kreator jadi kalah,
    // padahal seluruh cascade proyek ini bergerak ke arah sebaliknya (B1: milik kreator
    // menang, disuntik paling akhir). Menyisipkan node engine lebih awal menyelaraskan
    // sumbu @keyframes dengan aturan itu.
    const dynamicStyles = (function () {
        const el = document.createElement('style');
        const creatorStyle = document.getElementById('creator-style');
        if (creatorStyle && creatorStyle.parentNode === document.head) {
            document.head.insertBefore(el, creatorStyle);
        } else {
            document.head.appendChild(el);
        }
        return el;
    })();

    /** Show a non-blocking toast notification. type: 'info'|'success'|'error'|'warn' */
    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;
        var container = dom.toastContainer;
        if (!container) return;
        var el = document.createElement('div');
        el.className = 'vn-toast ' + type;
        el.textContent = message;
        container.appendChild(el);
        requestAnimationFrame(function () { el.classList.add('visible'); });
        setTimeout(function () {
            el.classList.remove('visible');
            setTimeout(function () { el.remove(); }, 350);
        }, duration);
    }

    // Peta peran diekspos supaya inspektur kontrak di editor (tahap 3) &
    // registry peran-hilang (tahap 2) membaca sumber yang sama, bukan menyalinnya.
    return { dom, state, dynamicStyles, showToast, roleSpec: ROLE_SPEC, resolveRole, roles: VNRoles,
        // Diekspos supaya hot-reload/preview bisa memasang ulang gaya tanpa
        // menyalin aturannya — dua salinan pasti menyimpang.
        cerminkanGayaDialog };
})();
