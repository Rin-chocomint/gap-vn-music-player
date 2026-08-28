/**
 * node-registry.js — Central Node Type Registry
 * === Schema-Driven Script Authoring ===
 *
 * Single source of truth untuk semua tipe entry VN script:
 *   - Skema field per tipe (key, tipe data, default, aturan ekstraksi)
 *   - Konstanta UI (animasi, transisi, operator, event)
 *   - Data default per tipe
 *   - Extraction rules (menggantikan DOM scraping)
 *   - Extension point: register() untuk tipe custom baru
 */
window.VN = window.VN || {};

// ============================================================
// 1. CONSTANTS — Opsi-opsi yang dipakai di editor UI
// ============================================================

// (Daftar animasi yang dulu di sini DIBUANG — kini diturunkan dari kelas `.anim-*`
//  nyata; label & grupnya hidup di _NodeConst.ANIM_UI. `_ANIM_ENTER`/`_ANIM_EXIT`
//  ikut dihapus: keduanya sudah NOL pemakai — dead code yang ditangkap kontrak
//  smoke sumbu A saat sumbu ini diturunkan.)

var _NodeConst = {
    // === Animasi sprite — ANOTASI UI (sumbu A dari D10) ===
    // Daftar animasi TIDAK lagi dimiliki editor. `ANIM_OPTIONS_*` kini GETTER yang
    // menurunkan opsi dari kelas `.anim-*` NYATA di CSS yang dimuat player
    // (`VN.PlayerCapabilities.getSpriteAnims()`), jadi:
    //   - kelas engine yang dihapus/diganti nama tak bisa lagi jadi opsi mati;
    //   - animasi buatan KREATOR di `theme.css` muncul sendiri, grup "Dari CSS-mu".
    // Yang tinggal di sini cuma label/grup + `slots` (slot mana yang menawarkannya).
    //
    // `slots` adalah kurasi yang BERALASAN: sprite di slot kanan yang masuk dari kiri
    // menyeberangi panggung. Yang TIDAK beralasan sudah dinormalkan — daftar CUSTOM
    // lama kehilangan slide kiri/kanan, seluruh grup oneshot, dan 2 dari 4 loop tanpa
    // sebab apa pun (sprite custom posisinya bebas, jadi tak ada arah yang salah).
    // Normalisasi ini hanya MENAMBAH opsi; nol skrip lama terpengaruh.
    ANIM_UI: {
        'anim-in-fade':              { label: 'Tampil Langsung (Default)' },  // tanpa grup → di puncak
        'anim-in-slide-from-bottom': { label: 'Naik dari Bawah',   group: 'Animasi Masuk' },
        'anim-in-slide-from-left':   { label: 'Geser dari Kiri',   group: 'Animasi Masuk',  slots: ['left', 'center', 'custom'] },
        'anim-in-slide-from-right':  { label: 'Geser dari Kanan',  group: 'Animasi Masuk',  slots: ['right', 'center', 'custom'] },
        'anim-out-fade':             { label: 'Hilang Perlahan (Fade Out)', group: 'Animasi Keluar' },
        'anim-out-slide-to-bottom':  { label: 'Turun ke Bawah',    group: 'Animasi Keluar' },
        'anim-out-slide-to-left':    { label: 'Geser ke Kiri',     group: 'Animasi Keluar', slots: ['left', 'center', 'custom'] },
        'anim-out-slide-to-right':   { label: 'Geser ke Kanan',    group: 'Animasi Keluar', slots: ['right', 'center', 'custom'] },
        'anim-oneshot-shake':        { label: 'Berguncang Singkat (Nervous)', group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-jump':         { label: 'Melompat Kaget (Surprised)',   group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-flip-right':   { label: 'Flip ke Kanan',                group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-flip-left':    { label: 'Flip ke Kiri',                 group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-flip-up':      { label: 'Flip ke Atas',                 group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-flip-down':    { label: 'Flip ke Bawah',                group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-pass-left-to-right': { label: 'Melintas Kiri → Kanan', group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-pass-right-to-left': { label: 'Melintas Kanan → Kiri', group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-pass-bottom-to-top': { label: 'Melintas Bawah → Atas', group: 'Animasi Sekali Eksekusi' },
        'anim-oneshot-pass-top-to-bottom': { label: 'Melintas Atas → Bawah', group: 'Animasi Sekali Eksekusi' },
        'anim-loop-pulse-glow':      { label: 'Berkedip Lembut',   group: 'Animasi Loop' },
        'anim-loop-gentle-float':    { label: 'Mengambang',        group: 'Animasi Loop' },
        'anim-loop-shake':           { label: 'Berguncang (Shake)', group: 'Animasi Loop' },
        'anim-loop-motor-vibration': { label: 'Getaran Mesin Motor', group: 'Animasi Loop' },
        'anim-loop-pulse':           { label: 'Berdenyut (Pulse)', group: 'Animasi Loop' },
        'anim-loop-confused':        { label: 'Bingung (Goyang Kepala)', group: 'Animasi Loop' },
        'anim-loop-flip-confused':   { label: 'Bingung (Menoleh Acak)', group: 'Animasi Loop' },
    },

    // === Transisi — ANOTASI UI (audit D8) ===
    // Daftar transisi TIDAK lagi dimiliki editor. `TRANSITION_IN`/`TRANSITION_OUT`
    // kini GETTER yang menurunkan opsinya dari kosakata player yang sebenarnya
    // (VN.PlayerCapabilities — hasil pemindaian panggilan VNRegistry.register
    // di transitions.js + extensions novel/chapter). Anotasi di bawah HANYA
    // menempelkan label/grup/arah untuk transisi BAWAAN; transisi dari extension
    // muncul otomatis tanpa perlu menyentuh file ini.
    //
    // F7 di Gelombang 2 adalah tambalan manual atas masalah ini — menambah
    // hardcode baru untuk transisi yang sudah lama hidup di runtime. D8
    // menghapus kebutuhan tambalan sejenis selamanya.
    TRANSITION_UI: {
        'cut':               { label: 'Langsung (Tanpa Animasi)', group: null,        dirs: ['in', 'out'] },
        'fade_black':        { label: 'Fade Hitam ⚫',            group: 'Fade',      dirs: ['in', 'out'] },
        'fade_white':        { label: 'Fade Putih ⚪',            group: 'Fade',      dirs: ['in', 'out'] },
        'swipe_black_left':  { label: 'Swipe Hitam ke Kiri ←',    group: 'Slide',     dirs: ['out'] },
        'swipe_black_right': { label: 'Swipe Hitam ke Kanan →',   group: 'Slide',     dirs: ['out'] },
        'slide_left':        { label: 'Geser dari Kiri ←',        group: 'Slide',     dirs: ['in'] },
        'slide_right':       { label: 'Geser dari Kanan →',       group: 'Slide',     dirs: ['in'] },
        'hpunch':            { label: 'Goncang Horizontal',    group: 'Efek',      dirs: ['in', 'out'] },
        'vpunch':            { label: 'Goncang Vertikal',      group: 'Efek',      dirs: ['in', 'out'] },
        'flash_white':       { label: 'Kilat Putih',           group: 'Efek',      dirs: ['in', 'out'] },
        'flash_black':       { label: 'Kilat Hitam',           group: 'Efek',      dirs: ['in', 'out'] },
        'combined_fade_white_to_slide_right': { label: 'Fade Putih → Geser Kanan', group: 'Kombinasi', dirs: ['in', 'out'] },
        // combined_fade_white_to_fade_black SENGAJA tanpa anotasi: dipakai engine
        // otomatis untuk fade berantai (G1), bukan untuk dipilih manual.
        // Tanpa anotasi → tak muncul di dropdown (lihat buildTransitionOptions).
    },

    // === Tipe LATAR satu entri (audit M1) ===
    // DULU bernama SCENE_TYPES — nama itu menyesatkan: ini BUKAN "scene" dalam
    // pengertian sistem scene Hub (HUB_SCENE_TYPES: splash/warning/credits/…),
    // melainkan mode latar untuk SATU entri dialog. Selama dua hal ini bernama
    // sama, tiap diskusi desain scene tergelincir.
    // ⚠ Kunci DATA-nya tetap `sceneType` (dibaca display-controller.js) — rename
    // hanya di konstanta & label UI, supaya script.json novel lama tetap jalan.
    BACKDROP_TYPES: [
        { value: 'image', label: 'Gambar Latar' },
        { value: 'video', label: 'Video Latar' },
        { value: 'text_screen', label: 'Layar Teks (Hitam)' },
    ],

    SET_VAR_OPS: [
        { value: '=', label: '= (Set)' },
        { value: '+=', label: '+= (Tambah)' },
        { value: '-=', label: '-= (Kurangi)' },
        { value: '*=', label: '*= (Kali)' },
        { value: '/=', label: '÷= (Bagi)' },
        { value: '%=', label: '%= (Sisa Bagi / Modulo)' },
        { value: 'min', label: 'min (Ambil yang terkecil)' },
        { value: 'max', label: 'max (Ambil yang terbesar)' },
        { value: 'random', label: 'random (Acak antara Min–Max)' },
    ],

    // in/!in: nilai = daftar dipisah koma; between: nilai = "min, max" (inklusif).
    // Semua operator menerima operand "$namaVariabel" untuk membandingkan antar variabel.
    CONDITION_OPS: ['==', '!=', '>', '>=', '<', '<=', 'in', '!in', 'between'],

    // Sumber data untuk entry `load_hub_flags` (jembatan hub → cerita).
    LOAD_HUB_FLAGS_SOURCES: [
        { value: 'hub-flags', label: 'hub-flags.json — flag eksplisit dari set_hub_flag' },
        { value: 'story-vars', label: 'story-vars.json — snapshot semua variabel sesi terakhir' },
        { value: 'both', label: 'Keduanya (story-vars menang bila key sama)' },
    ],

    // === Special Event (effect) — ANOTASI UI (audit D8, sumbu ke-2) ===
    // Sama seperti transisi: daftarnya TIDAK dimiliki editor. `SPECIAL_EVENT_TYPES`
    // kini getter yang menurunkan opsinya dari `VNRegistry.register('effect', …)`
    // di vn-player/js/effects.js + extensions novel/chapter.
    // Efek dari extension muncul otomatis — mis. `rainbow_flash` (Jejak Bintang)
    // dan `spell_flash` (Elaina) yang selama ini TAK PERNAH terlihat di editor.
    SPECIAL_EVENT_UI: {
        'glitch_screen':  { label: 'Glitch Screen',                 group: '⚠️ Horror / Psychological' },
        'fake_bsod':      { label: 'Fake BSOD (Blue Screen)',       group: '⚠️ Horror / Psychological' },
        'shake_window':   { label: 'Shake Window (Guncangan)',      group: '⚠️ Horror / Psychological' },
        'invert_colors':  { label: 'Invert Colors (Negatif)',       group: '⚠️ Horror / Psychological' },
        'heartbeat_zoom': { label: 'Heartbeat Zoom (Detak Jantung)',group: '⚠️ Horror / Psychological' },
        'red_overlay':    { label: 'Red Pulse (Horror tint)',       group: '⚠️ Horror / Psychological' },
        'flash_white':    { label: 'Flashbang (White Flash)',       group: 'Cinematic / Visual' },
        'crt_shutdown':   { label: 'CRT Shutdown (TV Mati)',        group: 'Cinematic / Visual' },
        'cinematic_bars': { label: 'Cinematic Bars (Letterbox)',    group: 'Cinematic / Visual' },
        'sepia_tone':     { label: 'Sepia Filter (Kuno)',           group: 'Cinematic / Visual' },
        'blur_vision':    { label: 'Blur Vision (Buram)',           group: 'Cinematic / Visual' },
    },

    // Daftar key yang merupakan path aset file
    ASSET_KEYS: ['background', 'video', 'sprite', 'sprite2', 'spriteCenter', 'bgm', 'ambient', 'sfx', 'sfxIn', 'sfxOut', 'voice'],

    // Key inti yang selalu relevan untuk diekstrak (tidak bergantung pada aset)
    CORE_KEYS: [
        'persistBackground', 'sceneType', 'transition', 'transitionOut',
        'speaker', 'text', 'duration', 'backgroundMode', 'bgmLoop',
        'bgmFade', 'name', 'videoMuted', 'mutePhaseBgm',
        'sfxInVolume', 'sfxInDelay', 'sfxInPan',
        'sfxOutVolume', 'sfxOutDelay', 'sfxOutPan',
        'op', 'value', 'command', 'params'
    ],

    // === Hub Menu Action Types ===
    HUB_ACTION_TYPES: [
        { value: 'start_game', label: 'Mulai Game (Chapter 1)' },
        { value: 'load_chapter', label: 'Pilih Chapter' },
        { value: 'load_save', label: 'Muat Permainan Tersimpan' },
        { value: 'gallery', label: 'Galeri' },
        { value: 'credits', label: 'Kredit / Tentang' },
        { value: 'link', label: 'Buka Link Tautan' },
        { value: 'exit', label: 'Keluar Game' },
    ],

    // === Hub Action Payload Requirements ===
    // Definisi payload per action type — DISELARASKAN dengan runtime novel-hub.html
    // handleMenuAction(): hanya `start_game` (payload = chapter awal) & `link` (payload = URL)
    // yang benar-benar memakai payload. `control` memberi tahu Inspector kontrol mana yang
    // dirender: 'chapter' (dropdown chapter), 'url' (teks URL), atau 'none' (tanpa payload).
    HUB_ACTION_PAYLOAD: {
        start_game:   { required: false, control: 'chapter', hint: 'Chapter yang dimainkan saat tombol ditekan. Kosong = chapter pertama.' },
        load_chapter: { required: false, control: 'none',    hint: 'Membuka layar pilih chapter. Action ini tidak memakai payload.' },
        load_save:    { required: false, control: 'none',    hint: '' },
        gallery:      { required: false, control: 'none',    hint: '' },
        credits:      { required: false, control: 'none',    hint: '' },
        link:         { required: true,  control: 'url',     hint: 'URL tujuan (wajib, contoh: https://...)' },
        exit:         { required: false, control: 'none',    hint: '' },
    },

    // === Player Profile & Theme Constants (Fase 5) ===
    PLAYER_THEMES: [
        { value: 'default', label: 'Default' },
        { value: 'dark-horror', label: 'Dark Horror' },
        { value: 'light-romance', label: 'Light Romance' },
        { value: 'sci-fi', label: 'Sci-Fi' },
        { value: 'retro', label: 'Retro' },
    ],

    DIALOGUE_STYLES: [
        { value: 'bottom-bar', label: 'Bottom Bar (Klasik)' },
        { value: 'center-box', label: 'Center Box (RPG)' },
        { value: 'adv-fullscreen', label: 'Fullscreen (Novel)' },
        { value: 'bubble', label: 'Speech Bubble' },
    ],

    // === HUB_TEMPLATES DICABUT (UX-C01, Tahap 5) ===
    // Dulu konstanta ini memegang empat "template Hub" yang dirakit dari
    // `sceneSet` hardcoded: Basic, Splash Intro, Lobby Style, dan Blank Canvas.
    // Keempatnya memakai markup generik + hub.css gaya dasar yang SAMA, jadi
    // yang membedakannya hanya ada/tidaknya scene splash & credits - sesuatu
    // yang sudah bisa diatur kreator lewat "Tambah Scene". Memilih di antaranya
    // tak pernah mengubah tampilan, dan itu membuat picker terasa penuh pilihan
    // yang sebenarnya tidak memilih apa pun.
    //
    // Penggantinya BUKAN daftar baru di sini, melainkan pustaka folder di
    // `aset/game/hub-templates/<id>/` yang tiap anggotanya membawa hub.css,
    // markup scene, dan FOTO hasil potret runtime. Jangan hidupkan kembali
    // konstanta ini: template yang tak membawa gayanya sendiri akan selalu
    // kembali jadi pilihan yang tak terlihat bedanya.
    //
    // Scene `blank` TIDAK ikut hilang - ia tetap ada di HUB_SCENE_TYPES di bawah,
    // jadi "mulai dari nol" tetap bisa lewat Tambah Scene.

    // === Hub Scene Types (Hub Scene Workspace — refaktor Hub) ===
    // Tipe Hub Scene: layar/bagian pengalaman Hub sebelum cerita dimulai.
    // Dipakai oleh model scene (VN.HubScenes) untuk derivasi, factory, dan picker.
    HUB_SCENE_TYPES: [
        { value: 'splash',      icon: '🎬', label: 'Splash / Opening', description: 'Gambar atau video pembuka sebelum menu. Menggantikan item bootSequence.' },
        { value: 'warning',     icon: '⚠️', label: 'Content Warning',  description: 'Layar peringatan konten sebelum cerita dimulai.' },
        { value: 'main_menu',   icon: '🏠', label: 'Main Menu',        description: 'Menu utama Hub dengan tombol navigasi.' },
        { value: 'info',        icon: 'ℹ️', label: 'Info Novel',       description: 'Metadata, sinopsis, dan cover novel.' },
        { value: 'credits',     icon: '🎖️', label: 'Credits',          description: 'Daftar kredit dan penghargaan.' },
        { value: 'custom_code', icon: '🔧', label: 'Custom Code',      description: 'Scene berbasis HTML/CSS custom (jalur Advanced).' },
        { value: 'blank',       icon: '⬜', label: 'Blank',            description: 'Scene kosong untuk desain manual.' },
    ],

    // === Player CSS Variable — ANOTASI UI (audit A1/A5/A6/N8) ===
    // Ini BUKAN daftar var + default hardcoded lagi (sumber kelas bug "var mati").
    // Hanya metadata UI (kategori/label/kontrol) ber-key NAMA VAR RUNTIME SEBENARNYA.
    // Nama & nilai default DITURUNKAN dari vn-player/css/variables.css saat render
    // (lihat buildPlayerCssVars) — anotasi yang menyebut var tak ada di variables.css
    // otomatis di-skip + di-warn, jadi drift MUSTAHIL menghasilkan kontrol mati.
    // Kurasi: fokus ke yang paling sering distyle kreator (warna) + beberapa layout.
    PLAYER_VAR_UI: [
        { var: '--vn-dialogue-bg',        category: 'Warna',     label: 'Background Dialog',   type: 'color' },
        { var: '--vn-dialogue-color',     category: 'Warna',     label: 'Teks Dialog',         type: 'color' },
        { var: '--vn-name-color',         category: 'Warna',     label: 'Nama Karakter',       type: 'color' },
        { var: '--vn-choice-bg',          category: 'Warna',     label: 'Background Pilihan',  type: 'color' },
        { var: '--vn-choice-color',       category: 'Warna',     label: 'Teks Pilihan',        type: 'color' },
        { var: '--vn-choice-hover-bg',    category: 'Warna',     label: 'Pilihan Hover (bg)',  type: 'color' },
        { var: '--vn-choice-hover-color', category: 'Warna',     label: 'Pilihan Hover (teks)',type: 'color' },
        { var: '--vn-dialogue-size',      category: 'Tipografi', label: 'Ukuran Teks',         type: 'slider', min: 0.8, max: 1.8, step: 0.05, unit: 'em' },
        // Indikator lanjut: nilainya string CSS `content`, jadi `quote: true` —
        // kreator mengetik tandanya saja, editor yang mengurus kutipnya.
        // Dikosongkan = indikator mati; itu jalur resmi bagi preset yang menaruh
        // versinya sendiri di tempat lain.
        { var: '--vn-continue-indicator', category: 'Tipografi', label: 'Tanda Lanjut',        type: 'text', quote: true },
        { var: '--vn-continue-opacity',   category: 'Tipografi', label: 'Kepekatan Tanda Lanjut', type: 'slider', min: 0.2, max: 1, step: 0.05, unit: '' },
        { var: '--vn-dialogue-padding',   category: 'Layout',    label: 'Padding Dialog',      type: 'slider', min: 8, max: 40, step: 2, unit: 'px' },
        { var: '--vn-dialogue-radius',    category: 'Layout',    label: 'Border Radius',       type: 'slider', min: 0, max: 24, step: 2, unit: 'px' },
        { var: '--vn-sprite-base-height', category: 'Layout',    label: 'Tinggi Sprite',       type: 'slider', min: 40, max: 100, step: 5, unit: 'vh' },
    ],

    // === Inspector Context Schema ===
    INSPECTOR_CONTEXTS: ['script-entry', 'hub-config', 'player-profile'],

    // === Credits Line Types ===
    CREDITS_LINE_TYPES: [
        { value: 'heading', label: 'Heading (Judul Besar)' },
        { value: 'text', label: 'Teks Biasa' },
        { value: 'separator', label: 'Pemisah (Garis)' },
    ],

    // === Menu Layout Presets ===
    MENU_LAYOUT_PRESETS: [
        {
            id: 'classic',
            label: '🎮 Klasik',
            description: 'Play, Load, Gallery, Credits, Exit — layout vertikal standar.',
            items: [
                { label: 'Mulai Bermain', action: 'start_game', payload: '' },
                { label: 'Muat Permainan', action: 'load_save', payload: '' },
                { label: 'Galeri', action: 'gallery', payload: '' },
                { label: 'Kredit', action: 'credits', payload: '' },
                { label: 'Keluar', action: 'exit', payload: '' },
            ]
        },
        {
            id: 'minimal',
            label: '⚡ Minimal',
            description: 'Play dan Exit saja — simpel dan langsung.',
            items: [
                { label: 'Mulai Bermain', action: 'start_game', payload: '' },
                { label: 'Keluar', action: 'exit', payload: '' },
            ]
        },
        {
            id: 'full',
            label: '🏰 Lengkap',
            description: 'Play, Load, Chapter, Gallery, Credits, Link, Exit — semua fitur.',
            items: [
                { label: 'Mulai Bermain', action: 'start_game', payload: '' },
                { label: 'Pilih Chapter', action: 'load_chapter', payload: '' },
                { label: 'Muat Permainan', action: 'load_save', payload: '' },
                { label: 'Galeri', action: 'gallery', payload: '' },
                { label: 'Kredit', action: 'credits', payload: '' },
                { label: 'Keluar', action: 'exit', payload: '' },
            ]
        },
        {
            id: 'story-focused',
            label: '📖 Fokus Cerita',
            description: 'Play, Chapter, Credits — untuk novel multi-chapter.',
            items: [
                { label: 'Mulai Cerita', action: 'start_game', payload: '' },
                { label: 'Pilih Chapter', action: 'load_chapter', payload: '' },
                { label: 'Kredit', action: 'credits', payload: '' },
                { label: 'Keluar', action: 'exit', payload: '' },
            ]
        },
    ],

    // (PLAYER_PROFILE_PRESETS & CHAPTER_ATMOSPHERE_PRESETS DIHAPUS 2026-07-30.
    //  Perannya diambil pustaka template player (yang materialisasi file, bukan
    //  menaburkan nilai ke JSON); PLAYER_PROFILE_PRESETS inert sejak D3 dan
    //  CHAPTER_ATMOSPHERE_PRESETS sejak FB10. Jangan hidupkan kembali: preset yang
    //  menulis kunci JSON kosmetik akan menghidupkan ulang lapisan "mode" N5.)
};

// ============================================================
// 2. HELPER — Generate HTML options dari data konstanta
// ============================================================

/**
 * Penanda "kosakata ini belum tentu dibaca player chapter ini" (B1 dari D10).
 *
 * Dipasang saat player yang ter-resolve berjenis `custom`: ia menggerakkan dirinya
 * sendiri lewat `set-player-context`, jadi tak ada jaminan ia memakai kosakata
 * engine maupun memuat `extensions/`. Contoh nyata: chapter DDLC yang memakai
 * `ddlc-player.js`.
 *
 * KEPUTUSAN PENGEMBANG 2026-07-30: **DITANDAI, bukan disembunyikan.** Dua dasar —
 * (1) preseden §21/§22: untuk engine custom, SEKSI profil disembunyikan tapi
 * Berkas dipertahankan, karena file tetap milik kreator; (2) mitigasi §23: sumbu
 * yang MENGHILANGKAN opsi harus selalu memberi alasan, sebab kontrol yang lenyap
 * tanpa penjelasan terasa seperti aplikasi rusak, bukan jujur.
 *
 * Penandaannya menempel di NAMA GRUP (bukan per-opsi) supaya ia tampil sekali per
 * grup di dalam dropdown itu sendiri — jadi tak ada permukaan UI baru yang harus
 * dirawat di setiap pemakai (kartu entri, Inspector, dan pemakai berikutnya).
 *
 * ISTILAH DIPERBAIKI 2026-07-30: dulu berbunyi "engine sendiri", yang MENGKLAIM LEBIH
 * dari yang diketahui sistem. `kind:'custom'` sesungguhnya berarti *"tidak menyatakan
 * memakai engine bawaan"* — definisi NEGATIF berbasis DEKLARASI (satu `<meta>`), bukan
 * berbasis kemampuan: resolver nol memeriksa implementasi, jadi berkas sempurna tanpa
 * penanda pun `custom`, dan berkas rusak berpenanda tetap `engine-shim`. Untuk
 * `player.html` yang dibuat tanpa sengaja, "engine sendiri" justru menyesatkan —
 * kreatornya tak punya engine apa pun, ia cuma lupa satu baris.
 */
_NodeConst.VOCAB_UNREAD_MARK = '⚠ tanpa engine bawaan';

/**
 * Nama grup dropdown menurut ASAL kosakata (dipakai untuk yang tak beranotasi).
 * Sumber yang tak terdaftar di sini jatuh ke `nonEngineGroup` milik pemanggil —
 * jadi menambah sumber baru tak pernah membuat opsi hilang, hanya kurang spesifik.
 */
_NodeConst.VOCAB_SOURCE_GROUP = {
    extension: 'Dari Extension',
    creator: 'Dari CSS-mu',
    player: 'Dari Player-mu',   // B2 — didaftarkan di dalam player.html kreator
};

/**
 * Bangun daftar opsi transisi dari KOSAKATA PLAYER (audit D8).
 *
 * @param {Array<{name:string,description?:string}>|string[]} available
 *        transisi yang benar-benar terdaftar di player (hasil pemindaian)
 * @param {{key:string, val:string}|null} filter penyaring anotasi — mis.
 *        `{key:'dirs', val:'in'}` (arah transisi) atau `{key:'slots', val:'right'}`
 *        (slot sprite). Anotasi tanpa kunci itu = berlaku untuk semua nilai.
 * @param {{engineUnread?:boolean, nonEngineGroup?:string}} [opts] engineUnread =
 *        player yang menjalankan chapter ini berjenis `custom` → kosakata ini belum
 *        tentu dibacanya, jadi setiap grup DITANDAI (opsi tetap ditawarkan, lihat
 *        VOCAB_UNREAD_MARK). nonEngineGroup = nama grup untuk kosakata NON-engine
 *        yang tak beranotasi (extension / CSS kreator).
 * @returns {Array} bentuk sama dengan konstanta lama: {value,label} / {group,items[]}
 */
function _buildVocabOptions(available, ui, filter, opts) {
    var out = [], groups = {};
    var mark = !!(opts && opts.engineUnread);
    var nonEngineGroup = (opts && opts.nonEngineGroup) || 'Dari Extension';
    function _grp(name, tandai) {
        return tandai ? (_NodeConst.VOCAB_UNREAD_MARK + ' · ' + name) : name;
    }

    (available || []).forEach(function(entry) {
        var name = (typeof entry === 'string') ? entry : (entry && entry.name);
        if (!name) return;
        var src = (typeof entry === 'object' && entry.source) ? entry.source : '';
        // Penanda "belum tentu dibaca engine bawaan" TIDAK berlaku untuk kosakata
        // yang didaftarkan DI DALAM player.html itu sendiri (B2): ia didaftarkan oleh
        // berkas yang justru menjalankan chapter ini, jadi kepastiannya paling tinggi
        // di antara semua sumber. Menandainya = memperingatkan hal yang salah.
        var tandai = mark && src !== 'player';
        var a = ui[name];
        // Disembunyikan SADAR oleh kreator (§27): player custom yang memang tak
        // mengimplementasikan sebuah kosakata bawaan bisa menyatakannya, alih-alih
        // membiarkan editor menawarkan sesuatu yang tak berefek (§A).
        if (a && a.hidden) return;
        // NON-engine = extension (registry) atau CSS kreator (sumbu animasi).
        var isEngine = !(typeof entry === 'object' && entry.source && entry.source !== 'engine');

        // Pembedanya SUMBER, bukan ada/tidaknya anotasi:
        //  - ENGINE tanpa anotasi  = handler internal (mis. fade berantai yang
        //    dipanggil otomatis oleh input-controller) → JANGAN tawarkan manual.
        //  - ENGINE dengan anotasi = tampil; hormati penyaring bila anotasinya punya.
        //  - NON-ENGINE            = selalu tampil; inilah inti D8.
        if (isEngine) {
            if (!a) return;
            if (filter && a[filter.key] && a[filter.key].indexOf(filter.val) < 0) return;
        }

        var label, groupName;
        if (a) {
            label = a.label; groupName = a.group;
        } else {
            var desc = (typeof entry === 'object' && entry.description) ? entry.description : '';
            label = desc ? (desc + ' — ' + name) : name;
            // Grup mengikuti ASAL kosakata bila asalnya dikenal. Kosakata yang
            // didaftarkan di dalam `player.html` (B2) tidak boleh disamarkan sebagai
            // "Dari Extension": kreator perlu tahu berkas mana yang harus disunting
            // kalau ingin mengubahnya, dan keduanya punya cascade yang berbeda.
            groupName = _NodeConst.VOCAB_SOURCE_GROUP[src] || nonEngineGroup;
        }

        // Item tanpa grup pun harus terbawa penandaannya — kalau tidak, ia jadi
        // satu-satunya opsi yang tampak "pasti dibaca" padahal tidak. (Hari ini
        // hanya `cut`.) Grupnya = penanda SAJA: mengarang nama kategori baru
        // ("Lainnya") berarti editor kembali berpendapat soal isi kosakata.
        if (!groupName && !tandai) { out.push({ value: name, label: label }); return; }
        groupName = groupName ? _grp(groupName, tandai) : _NodeConst.VOCAB_UNREAD_MARK;
        if (!groups[groupName]) { groups[groupName] = { group: groupName, items: [] }; out.push(groups[groupName]); }
        groups[groupName].items.push({ value: name, label: label });
    });

    return out;
}

// ============================================================
// LAPISAN MERGE ANOTASI (§27)
// ============================================================
// Anotasi EFEKTIF = bawaan editor + timpaan kreator (`vocab-ui.json` / pulau JSON
// di player.html). Yang BOLEH ditimpa hanya PRESENTASI — daftar apa yang tersedia
// tetap milik pemindai, jadi peta ini tak bisa menghidupkan opsi mati.
//
// Kenapa MERGE dan bukan memindahkan anotasi ke player:
//   1. fork tanpa peta tetap dapat label bawaan (tebing N4 tak lahir kembali);
//   2. jaring bootstrap tetap ada (`_availableVocab` tetap jatuh ke peta BAWAAN,
//      bukan peta gabungan — supaya kegagalan pemindaian tak pernah memunculkan
//      nama yang cuma dideklarasikan kreator);
//   3. arah gagal tetap aman: tanpa anotasi = tersembunyi, jadi handler internal
//      tak bocor karena kelalaian. Kreator tetap bisa MEMBUKANYA dengan menyebut
//      namanya — itu tindakan sadar, bukan kelalaian.
var _VOCAB_BASE = {
    transition: function() { return _NodeConst.TRANSITION_UI; },
    effect:     function() { return _NodeConst.SPECIAL_EVENT_UI; },
    anim:       function() { return _NodeConst.ANIM_UI; },
    position:   function() { return _NodeConst.POS_UI; },
};

function _uiFor(sumbu) {
    var dasar = (_VOCAB_BASE[sumbu] || function() { return {}; })();
    var kreator = null;
    try {
        if (typeof VN !== 'undefined' && VN.PlayerCapabilities &&
            typeof VN.PlayerCapabilities.getVocabUi === 'function') {
            kreator = (VN.PlayerCapabilities.getVocabUi() || {})[sumbu];
        }
    } catch (e) { /* pemindai tak tersedia → pakai bawaan */ }
    if (!kreator) return dasar;

    var out = {};
    Object.keys(dasar).forEach(function(k) { out[k] = dasar[k]; });
    Object.keys(kreator).forEach(function(k) {
        var e = kreator[k];
        if (!e || typeof e !== 'object') return;
        // DANGKAL per-entri, bukan mengganti: kreator yang hanya menulis `label`
        // untuk `fade_black` tak boleh kehilangan `dirs` bawaannya — kalau hilang,
        // transisi itu bocor ke dropdown MASUK dan KELUAR sekaligus.
        out[k] = Object.assign({}, out[k], e);
    });
    return out;
}
_NodeConst.uiFor = _uiFor;   // diekspos untuk test & pemakai lanjutan

_NodeConst.buildTransitionOptions = function(available, dir, opts) {
    return _buildVocabOptions(available, _uiFor('transition'),
        dir ? { key: 'dirs', val: dir } : null, opts);
};

/** Opsi special event (effect) dari kosakata player — lihat buildTransitionOptions. */
_NodeConst.buildSpecialEventOptions = function(available, opts) {
    return _buildVocabOptions(available, _uiFor('effect'), null, opts);
};

/**
 * Opsi animasi sprite (sumbu A, D10) — diturunkan dari kelas `.anim-*` NYATA.
 * @param {Array} available hasil pindai `VN.PlayerCapabilities.getSpriteAnims()`
 * @param {'right'|'left'|'center'|'custom'} slot slot sprite yang dilayani
 */
_NodeConst.buildAnimOptions = function(available, slot, opts) {
    return _buildVocabOptions(available, _uiFor('anim'),
        slot ? { key: 'slots', val: slot } : null,
        { engineUnread: !!(opts && opts.engineUnread), nonEngineGroup: 'Dari CSS-mu' });
};

/**
 * Anotasi posisi panggung BAWAAN (G2 irisan a, sumbu D8 ke-6).
 *
 * Ini bukan tabel kosakata — nama & nilainya hidup di `variables.css`
 * (`--vn-pos-*`); map ini hanya memberi LABEL manusiawi untuk nama bawaan.
 * Nama yang ada di CSS tapi tak ada di sini tetap ditawarkan (masuk grup
 * "Dari CSS-mu") — itu inti D8. Sebaliknya, nama di sini yang TAK ADA di CSS
 * tak akan pernah muncul, karena daftarnya berasal dari pemindai.
 * Dijaga drift guard DUA ARAH di test.
 */
_NodeConst.POS_UI = {
    'far-left':  { label: 'Jauh Kiri',  group: 'Posisi Panggung' },
    'left':      { label: 'Kiri',       group: 'Posisi Panggung' },
    'center':    { label: 'Tengah',     group: 'Posisi Panggung' },
    'right':     { label: 'Kanan',      group: 'Posisi Panggung' },
    'far-right': { label: 'Jauh Kanan', group: 'Posisi Panggung' },
};

/**
 * Opsi posisi bernama. Opsi pertama = kabur ke ANGKA (slider), karena posisi
 * bernama bersifat menambah: entri lama yang memakai angka tetap sah selamanya.
 */
_NodeConst.buildPositionOptions = function(available, opts) {
    var vocab = _buildVocabOptions(available, _uiFor('position'), null,
        { engineUnread: !!(opts && opts.engineUnread), nonEngineGroup: 'Dari CSS-mu' });
    return [{ value: '', label: '— pakai angka (slider) —' }].concat(vocab);
};

// Sumber kosakata: player nyata bila modul pemindainya tersedia. Fallback =
// nama-nama BERANOTASI (kosakata bawaan engine) supaya editor tak pernah
// tampil kosong (mitigasi risiko "bootstrap kosong" D8). Fallback ini aman
// karena drift-guard test menjamin tiap nama beranotasi memang terdaftar di
// transitions.js — jadi ia tak bisa menghidupkan opsi mati.
function _availableVocab(getterName, uiMap) {
    try {
        if (typeof VN !== 'undefined' && VN.PlayerCapabilities &&
            typeof VN.PlayerCapabilities[getterName] === 'function') {
            var live = VN.PlayerCapabilities[getterName]();
            if (live && live.length) return live;
        }
    } catch (e) { /* jatuh ke fallback */ }
    return Object.keys(uiMap).map(function(n) { return { name: n }; });
}
function _availableTransitions() { return _availableVocab('getTransitions', _NodeConst.TRANSITION_UI); }
function _availableEffects()     { return _availableVocab('getEffects', _NodeConst.SPECIAL_EVENT_UI); }

/**
 * Opsi penandaan untuk builder: hanya `custom` yang belum tentu membaca kosakata
 * ini — `global` dan `engine-shim` sama-sama menjalankan engine bersama.
 * Jenis TAK DIKETAHUI (null; mis. tak ada novel terbuka, atau modul kapabilitas
 * belum ada) → **jangan tandai**. Menandai atas dasar ketidaktahuan sama saja
 * berbohong ke arah yang lain.
 */
function _vocabOpts() {
    try {
        if (typeof VN !== 'undefined' && VN.PlayerCapabilities &&
            typeof VN.PlayerCapabilities.getPlayerKind === 'function') {
            var k = VN.PlayerCapabilities.getPlayerKind();
            if (k && k.kind === 'custom') return { engineUnread: true };
        }
    } catch (e) { /* tak tersedia → tanpa penanda */ }
    return null;
}
_NodeConst.vocabMarkOpts = _vocabOpts;   // diekspos untuk pemakai non-dropdown (mis. datalist command)

// Getter: seluruh pemanggil lama (`_C.TRANSITION_IN`) tetap bekerja tanpa diubah,
// tapi isinya kini diturunkan, bukan dihardcode.
Object.defineProperty(_NodeConst, 'TRANSITION_IN', {
    get: function() { return _NodeConst.buildTransitionOptions(_availableTransitions(), 'in', _vocabOpts()); },
    enumerable: true, configurable: true
});
Object.defineProperty(_NodeConst, 'TRANSITION_OUT', {
    get: function() { return _NodeConst.buildTransitionOptions(_availableTransitions(), 'out', _vocabOpts()); },
    enumerable: true, configurable: true
});
Object.defineProperty(_NodeConst, 'SPECIAL_EVENT_TYPES', {
    get: function() { return _NodeConst.buildSpecialEventOptions(_availableEffects(), _vocabOpts()); },
    enumerable: true, configurable: true
});

// Sumbu posisi panggung: satu sumber (`--vn-pos-*` nyata di CSS yang dimuat).
function _availablePositions() { return _availableVocab('getSpritePositions', _NodeConst.POS_UI); }
Object.defineProperty(_NodeConst, 'SPRITE_POS', {
    get: function() { return _NodeConst.buildPositionOptions(_availablePositions(), _vocabOpts()); },
    enumerable: true, configurable: true
});

// Sumbu animasi sprite: satu sumber (kelas .anim-* nyata), empat pintu (slot).
function _availableAnims() { return _availableVocab('getSpriteAnims', _NodeConst.ANIM_UI); }
['RIGHT', 'LEFT', 'CENTER', 'CUSTOM'].forEach(function(slotKey) {
    Object.defineProperty(_NodeConst, 'ANIM_OPTIONS_' + slotKey, {
        get: function() {
            return _NodeConst.buildAnimOptions(_availableAnims(), slotKey.toLowerCase(), _vocabOpts());
        },
        enumerable: true, configurable: true
    });
});

// === FOKUS BICARA (G2 irisan b) ===
// Tiga slot preset adalah KONSTANTA ENGINE (nama field di skema entri), bukan
// kosakata kreator — jadi mendaftarnya di sini bukan pelanggaran D8. Yang kosakata
// kreator adalah slot custom, dan itu justru DITURUNKAN dari entri (lihat builder).
_NodeConst.SPRITE_FOCUS_BASE = [
    { value: '', label: '— Tanpa fokus (semua terang) —' },
    { value: 'sprite2', label: 'Sprite Kiri' },
    { value: 'spriteCenter', label: 'Sprite Tengah' },
    { value: 'sprite', label: 'Sprite Kanan' },
];
Object.defineProperty(_NodeConst, 'SPRITE_FOCUS', {
    get: function() { return _NodeConst.SPRITE_FOCUS_BASE; },
    enumerable: true, configurable: true
});

/**
 * Opsi dropdown "Fokus Bicara" untuk SATU entri: 3 slot preset + slot custom milik
 * entri itu sendiri.
 *
 * ⚠ Dua aturan yang wajib sama dengan runtime (`customSlotId`, sprite-manager.js) —
 * kalau menyimpang, dropdown menawarkan target yang tak pernah ada di DOM (kelas §A):
 *   1. id = `sp.id` bila ada, kalau tidak `dynamic-sprite-<index>`;
 *   2. `<index>` dihitung di array `charSprites` UTUH, bukan hasil filter — runtime
 *      mengiterasi seluruh array (slot left/right/center di-skip TAPI indeksnya tetap
 *      terpakai), jadi memfilter dulu akan menggeser nomor.
 * Dijaga kontrak smoke dua arah.
 *
 * Nilai terpilih yang tak dikenal DIPERTAHANKAN + ditandai (aturan D8: jangan pernah
 * membuang keputusan kreator diam-diam — mis. id hasil sunting tangan).
 */
_NodeConst.buildFocusOptions = function(charSprites, selected) {
    var opts = _NodeConst.SPRITE_FOCUS_BASE.slice();
    var daftar = Array.isArray(charSprites) ? charSprites : [];
    var nomor = 0;
    daftar.forEach(function(sp, index) {
        if (!sp || (sp.slot && sp.slot !== 'custom')) return;
        nomor++;
        var id = sp.id || ('dynamic-sprite-' + index);
        opts.push({ value: id, label: 'Sprite Custom #' + nomor + ' (' + id + ')' });
    });
    // Aturan bersama (lihat withUnknownOption) dengan penanda khusus: di sumbu ini
    // daftarnya LENGKAP (3 preset + slot entri ini), jadi sebabnya pasti "tak ada".
    return _NodeConst.withUnknownOption(opts, selected, '⚠ slot tak ditemukan');
};

/**
 * Bangun skema CSS var editor DENGAN MENURUNKANNYA dari default runtime
 * (parsed variables.css [+ theme.css], key = nama var). Menutup akar §A/N8:
 * anotasi PLAYER_VAR_UI yang menyebut var TAK ADA di `defaults` di-skip + di-warn,
 * jadi editor tak pernah lagi menampilkan kontrol untuk var yang tak dibaca runtime.
 *
 * @param {Object} defaults - map { '--vn-x': 'nilai', ... } dari variables.css/theme
 * @returns {Object} grouped { kategori: [ {var,label,type,default,min,max,step,unit} ] }
 */
_NodeConst.buildPlayerCssVars = function(defaults) {
    defaults = defaults || {};
    var groups = {};
    var missing = [];
    _NodeConst.PLAYER_VAR_UI.forEach(function(a) {
        if (!Object.prototype.hasOwnProperty.call(defaults, a.var)) { missing.push(a.var); return; }
        if (!groups[a.category]) groups[a.category] = [];
        groups[a.category].push({
            var: a.var, label: a.label, type: a.type, default: defaults[a.var],
            min: a.min, max: a.max, step: a.step, unit: a.unit,
            // Diteruskan eksplisit: anotasi yang tak diteruskan di sini akan
            // hilang diam-diam, dan widget-nya berperilaku seolah anotasi itu
            // tak pernah ditulis.
            quote: a.quote
        });
    });
    if (missing.length && typeof console !== 'undefined' && console.warn) {
        console.warn('[NodeRegistry] PLAYER_VAR_UI menyebut var yang TAK ADA di variables.css (drift, di-skip):', missing);
    }
    return groups;
};

/**
 * Parser deklarasi --vn-* untuk file CSS engine (variables.css / themes/x/theme.css).
 * Dua koreksi audit #1/#7 terkandung di sini:
 *   (1) Blok di dalam @media DILEWATI — variables.css menaruh 4 blok @media
 *       responsif yang mendefinisikan ulang var sprite dengan nilai makin kecil;
 *       parser lama menelan semuanya sehingga nilai viewport terkecil (55vh)
 *       menimpa default desktop (75vh) dan slider "Tinggi Sprite" berbohong
 *       (kelas kebohongan yang justru dijanjikan hilang oleh A8).
 *   (2) Selain :root, blok `.theme-<nama> { }` juga dibaca — file tema TIDAK
 *       memakai :root (semua deklarasi di bawah kelas temanya), jadi parser
 *       lama SELALU mengembalikan map kosong untuk tema → overlay tema A8
 *       tak pernah bekerja dan swatch tak mencerminkan tema aktif.
 *
 * @media DILEWATI dengan brace-matching, BUKAN dipotong di kemunculan pertama.
 * Versi potong-di-@media (2026-07-19) membuang seluruh sisa file, sehingga
 * deklarasi SETELAH blok @media hilang senyap — kelas bug yang sama dengan (1),
 * arah berlawanan. Aman kebetulan hari ini (var utama kebetulan di atas), tapi
 * rapuh; dijaga `tests/unit/css-var-parser.test.js`.
 *
 * @param {string} cssText - isi file CSS
 * @returns {Object} map { '--vn-x': 'nilai', ... }
 */
_NodeConst.parseRootVars = function (cssText) {
    var src = String(cssText || '');

    // Buang setiap blok @media BESERTA isinya (nested brace aman), sisakan
    // sisanya utuh — termasuk deklarasi yang muncul sesudahnya.
    var topLevel = '';
    var i = 0;
    while (i < src.length) {
        var at = src.indexOf('@media', i);
        if (at < 0) { topLevel += src.slice(i); break; }
        topLevel += src.slice(i, at);
        var brace = src.indexOf('{', at);
        if (brace < 0) break;                       // @media tanpa blok → abaikan sisa
        var depth = 1, j = brace + 1;
        while (j < src.length && depth > 0) {
            var ch = src.charAt(j);
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            j++;
        }
        i = j;                                       // lanjut TEPAT setelah blok @media
    }

    var out = {};
    var roots = topLevel.match(/(?::root|\.theme-[\w-]+)\s*\{[^}]*\}/g) || [];
    roots.forEach(function (block) {
        var re = /(--[\w-]+)\s*:\s*([^;]+);/g, m;
        while ((m = re.exec(block)) !== null) out[m[1]] = m[2].trim();
    });
    return out;
};

// (validatePresets DIHAPUS 2026-07-30 — preset yang ia validasi sudah tak ada.)


// ============================================================
// ATURAN "PERTAHANKAN + TANDAI" — satu rumah, semua dropdown
// ============================================================
// Audit round-trip 2026-07-31 §3: kalau nilai di script.json TIDAK ADA di daftar
// opsi, `<select>` jatuh ke opsi PERTAMA — lalu jalur simpan menuliskan opsi
// pertama itu ke berkas. Keputusan kreator hilang tanpa jejak hanya karena
// kartunya pernah dibuka. Terukur: `scene.transition: "swipe_black_left"` → `"cut"`.
//
// Sebabnya BUKAN cuma "nama tak dikenal". Empat sebab yang sah, semuanya
// menghasilkan kerusakan yang sama:
//   1. kosakata milik player LAIN (novel dipindah / player diganti);
//   2. transisi yang sah tapi dianotasi untuk arah SEBALIKNYA (`dirs`),
//      atau animasi yang dianotasi untuk slot lain (`slots`);
//   3. disembunyikan sadar oleh kreator lewat `hidden` (§27);
//   4. hasil sunting tangan di script.json.
// Karena itu penandanya berbunyi "di luar daftar" — pernyataan yang benar untuk
// keempatnya — bukan "tak dikenal", yang hanya benar untuk (1) dan (4).
//
// Aturan ini sudah dipakai kosakata yang dibuat belakangan (`buildFocusOptions`,
// `_posXOpsi`); di sini ia diangkat jadi SATU fungsi supaya berlaku untuk
// dropdown LAMA juga — dan supaya dropdown yang ditambahkan besok ikut sendiri.
_NodeConst.VOCAB_UNKNOWN_MARK = '⚠ di luar daftar';
_NodeConst.VOCAB_UNKNOWN_TITLE =
    'Nilai dari script.json yang tidak ada di daftar ini — mis. kosakata player lain, ' +
    'transisi untuk arah sebaliknya, atau hasil sunting tangan. ' +
    'Dipertahankan apa adanya; hanya berubah kalau kamu sendiri memilih opsi lain.';

/** Apakah `value` ada di daftar opsi (menembus optgroup)? */
_NodeConst.hasOptionValue = function(options, value) {
    return (options || []).some(function(opt) {
        if (!opt) return false;
        if (opt.group && opt.items) return _NodeConst.hasOptionValue(opt.items, value);
        return opt.value === value;
    });
};

/**
 * Kutip nilai CSS bertipe string (`content`) — dua arah.
 *
 * Kreator harus melihat TANDANYA (`▸`), sedangkan berkas harus menyimpan string
 * CSS yang sah (`'\25B8'`). Dua terjemahan itu tinggal di sini, bukan di editor,
 * karena begitu ada penulis kedua (preview, materializer tema) keduanya wajib
 * memakai aturan yang sama — satu fitur dengan dua penerjemah selalu menyimpang.
 *
 * `\25B8` ikut diterjemahkan saat DIBACA: nilai baku ditulis sebagai escape agar
 * `variables.css` aman dibaca alat apa pun, tapi `\25B8` di sebuah kotak isian
 * tak berarti apa-apa bagi manusia.
 */
_NodeConst.lepasKutipCss = function(v) {
    var s = String(v == null ? '' : v).trim();
    var m = s.match(/^(['"])([\s\S]*)\1$/);
    if (!m) return s;
    // SATU lintasan untuk kedua bentuk escape. Dua lintasan terpisah salah:
    // membuang `\\` lebih dulu mengubah `\\25B8` (backslash literal + teks)
    // menjadi escape hex, dan sebaliknya. Uji bolak-balik yang menemukannya —
    // membaca kodenya saja, versi dua-lintasan tampak benar.
    return m[2].replace(/\\(?:([0-9a-fA-F]{1,6})\s?|([\s\S]))/g, function(_, hex, ch) {
        return hex ? String.fromCodePoint(parseInt(hex, 16)) : ch;
    });
};

/** Kebalikannya. Nilai yang SUDAH dikutip kreator dibiarkan apa adanya. */
_NodeConst.pasangKutipCss = function(v) {
    var s = String(v == null ? '' : v);
    if (/^(['"])[\s\S]*\1$/.test(s.trim())) return s.trim();
    return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

/**
 * Kembalikan daftar opsi yang DIJAMIN memuat `selected`.
 *
 * @param {Array} options daftar opsi ({value,label} / {group,items[]})
 * @param {string} [selected] nilai terpilih dari data
 * @param {string} [tanda] penanda khusus (mis. '⚠ tak ada di CSS'); default
 *        VOCAB_UNKNOWN_MARK. Dipakai pemanggil yang TAHU sebabnya dengan pasti.
 * @returns {Array} `options` apa adanya bila sudah memuat `selected`
 */
_NodeConst.withUnknownOption = function(options, selected, tanda) {
    var list = options || [];
    // Kosong/non-string bukan "nilai kreator": undefined = field tak diisi, dan
    // '' memang lazim jadi opsi "— tanpa —". Menandainya justru membuat bising.
    if (typeof selected !== 'string' || selected === '') return list;
    if (_NodeConst.hasOptionValue(list, selected)) return list;
    return list.concat([{
        value: selected,
        label: (tanda || _NodeConst.VOCAB_UNKNOWN_MARK) + ' · ' + selected,
        title: _NodeConst.VOCAB_UNKNOWN_TITLE,
        unknown: true,
    }]);
};

// Nilai & label opsi bisa berasal dari kreator (nama transisi extension, id sprite
// hasil sunting tangan, deskripsi registrasi) — jadi ia dilewatkan escape sebelum
// masuk HTML. Untuk kosakata bawaan ini no-op.
function _escOpt(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Convert array opsi terstruktur ke HTML <option>/<optgroup>
 * @param {Array} options - Array dari {value, label} atau {group, items[]}
 * @param {string} [selected] - Nilai yang terpilih
 * @returns {string} HTML string
 */
_NodeConst.optionsToHTML = function(options, selected) {
    function _opt(o) {
        var sel = o.value === selected ? ' selected' : '';
        var ttl = o.title ? ' title="' + _escOpt(o.title) + '"' : '';
        return '<option value="' + _escOpt(o.value) + '"' + sel + ttl + '>' +
            _escOpt(o.label) + '</option>';
    }
    return _NodeConst.withUnknownOption(options, selected).map(function(opt) {
        if (opt.group) {
            return '<optgroup label="' + _escOpt(opt.group) + '">' +
                opt.items.map(_opt).join('') + '</optgroup>';
        }
        return _opt(opt);
    }).join('');
};

// ============================================================
// 3. TYPE DEFINITIONS — Skema lengkap per tipe entry
// ============================================================

// Field definition: { key, extract, dependsOn?, dependsOnChecked? }
// extract types:
//   'asset'                — path file, hanya disimpan jika tidak kosong
//   'string'               — teks, trim, skip jika kosong
//   'string-allow-empty'   — teks, trim, selalu disimpan
//   'boolean'              — checkbox, simpan true/false
//   'number'               — parseFloat
//   'scale'                — slider 0-100 → factor 0.25-1.75
//   'position'             — parseInt, default 50
//   'duration-sec'         — detik → milidetik (min 100ms)
//   'transition-duration'  — parseInt ms, default 500
//   'radio'                — simpan value jika checked

// CATATAN (kebersihan 2026-07-30): dulu ada `_spriteFields(prefix)` &
// `_audioFields(prefix)` di sini — generator daftar field per-slot yang TIDAK PERNAH
// dipanggil (tiap tipe menulis fieldnya sendiri di bawah). Keduanya dihapus; salah
// satunya bahkan menyimpan ternary tanpa efek (`prefix + (prefix === 'sprite' ? '' : '')`)
// dan `extract: 'position'` yang kini sudah usang (lihat 'position-or-name', G2 irisan a) —
// contoh persis kenapa kode mati berbahaya: ia membeku di masa lalu dan tetap tampak sah.

// ============================================================
// 3B. FIELD UI METADATA — Label, grup, tipe input untuk Inspector Panel
// Map terpisah agar tidak mengganggu extraction logic
// ============================================================

_NodeConst.FIELD_UI = {
    // === Dasar ===
    speaker:    { label: 'Pembicara',       group: 'Dasar',   inputType: 'text',     placeholder: 'Nama karakter...' },
    text:       { label: 'Dialog / Teks',   group: 'Dasar',   inputType: 'textarea', placeholder: 'Ketik teks... (tag: [w=800] jeda, [i]..[/i], [color=#f00]..[/color], [cps=10]..[/cps])' },
    name:       { label: 'Nama',            group: 'Dasar',   inputType: 'text' },
    target:     { label: 'Target Jump',     group: 'Dasar',   inputType: 'text' },
    sceneType:  { label: 'Tipe Latar',      group: 'Dasar',   inputType: 'select',   options: 'BACKDROP_TYPES' },
    duration:   { label: 'Durasi',          group: 'Dasar',   inputType: 'number',   unit: 'detik', step: 0.5 },
    op:         { label: 'Operator',        group: 'Dasar',   inputType: 'select',   options: 'SET_VAR_OPS' },
    value:      { label: 'Nilai',           group: 'Dasar',   inputType: 'text' },
    command:    { label: 'Perintah',        group: 'Dasar',   inputType: 'text' },
    params:     { label: 'Parameter (JSON)',group: 'Dasar',   inputType: 'textarea', placeholder: '{"key": "value"}' },
    isEnding:   { label: 'Ending?',         group: 'Dasar',   inputType: 'checkbox' },
    // Timed choice (QTE): bila diisi, choice menampilkan bar hitung mundur; saat
    // habis, opsi ber-flag "timeout": true dipilih otomatis (fallback: opsi terakhir).
    timeLimit:      { label: 'Batas Waktu (QTE)', group: 'Dasar', inputType: 'number', unit: 'ms', placeholder: 'mis. 5000 (kosong = tanpa timer)' },
    timeLimitLabel: { label: 'Label Timer',       group: 'Dasar', inputType: 'text',   placeholder: 'mis. Waktu menipis...' },
    // load_hub_flags — jembatan hub → cerita
    prefix:         { label: 'Prefix Variabel',   group: 'Dasar', inputType: 'text',   placeholder: 'mis. hf_ (boleh kosong)' },
    source:         { label: 'Sumber Data',       group: 'Dasar', inputType: 'select', options: 'LOAD_HUB_FLAGS_SOURCES' },

    // === Visual ===
    transition:        { label: 'Transisi Masuk',          group: 'Visual',  inputType: 'select', options: 'TRANSITION_IN' },
    transitionDuration:{ label: 'Durasi Transisi Masuk',   group: 'Visual',  inputType: 'number', unit: 'ms', placeholder: 'kosong = default 500' },
    transitionOut:     { label: 'Transisi Keluar',         group: 'Visual',  inputType: 'select', options: 'TRANSITION_OUT' },
    background:        { label: 'Gambar Latar',            group: 'Visual',  inputType: 'file' },
    backgroundMode:    { label: 'Mode Background',         group: 'Visual',  inputType: 'select', options: [{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }] },
    video:             { label: 'Video',                   group: 'Visual',  inputType: 'file' },
    videoMuted:        { label: 'Video Muted',             group: 'Visual',  inputType: 'checkbox' },
    persistBackground: { label: 'Pertahankan Background',  group: 'Visual',  inputType: 'checkbox' },
    mutePhaseBgm:      { label: 'Matikan BGM Fase',        group: 'Audio',   inputType: 'checkbox' },

    // === Sprite Kanan ===
    sprite:                     { label: 'Sprite Kanan',           group: 'Sprite',  inputType: 'file' },
    spriteAnim:                 { label: 'Animasi',                group: 'Sprite',  inputType: 'select', options: 'ANIM_OPTIONS_RIGHT' },
    spriteDelay:                { label: 'Delay Tampil',           group: 'Sprite',  inputType: 'number', unit: 'ms' },
    spriteChroma:               { label: 'Chroma Key',             group: 'Sprite',  inputType: 'chroma-key' },
    spriteScale:                { label: 'Ukuran',                 group: 'Sprite',  inputType: 'slider', min: 0, max: 100, step: 1, unit: '%' },
    spriteX:                    { label: 'Posisi X',               group: 'Sprite',  inputType: 'position', options: 'SPRITE_POS', min: 0, max: 100, step: 1, unit: '%' },
    spriteZ:                    { label: 'Z-Order',                group: 'Sprite',  inputType: 'number', placeholder: 'kosong = urutan alami' },
    spriteTransition:           { label: 'Transisi Sprite',        group: 'Sprite',  inputType: 'checkbox' },
    spriteTransitionDuration:   { label: 'Durasi Transisi',        group: 'Sprite',  inputType: 'number', unit: 'ms' },

    // === Sprite Kiri ===
    sprite2:                    { label: 'Sprite Kiri',            group: 'Sprite 2', inputType: 'file' },
    sprite2Anim:                { label: 'Animasi',                group: 'Sprite 2', inputType: 'select', options: 'ANIM_OPTIONS_LEFT' },
    sprite2Delay:               { label: 'Delay Tampil',           group: 'Sprite 2', inputType: 'number', unit: 'ms' },
    sprite2Chroma:              { label: 'Chroma Key',             group: 'Sprite 2', inputType: 'chroma-key' },
    sprite2Scale:               { label: 'Ukuran',                 group: 'Sprite 2', inputType: 'slider', min: 0, max: 100, step: 1, unit: '%' },
    sprite2X:                   { label: 'Posisi X',               group: 'Sprite 2', inputType: 'position', options: 'SPRITE_POS', min: 0, max: 100, step: 1, unit: '%' },
    sprite2Z:                   { label: 'Z-Order',                group: 'Sprite 2', inputType: 'number', placeholder: 'kosong = urutan alami' },
    sprite2Transition:          { label: 'Transisi Sprite',        group: 'Sprite 2', inputType: 'checkbox' },
    sprite2TransitionDuration:  { label: 'Durasi Transisi',        group: 'Sprite 2', inputType: 'number', unit: 'ms' },

    // === Sprite Tengah ===
    spriteCenter:                   { label: 'Sprite Tengah',      group: 'Sprite C', inputType: 'file' },
    spriteCenterAnim:               { label: 'Animasi',            group: 'Sprite C', inputType: 'select', options: 'ANIM_OPTIONS_CENTER' },
    spriteCenterDelay:              { label: 'Delay Tampil',       group: 'Sprite C', inputType: 'number', unit: 'ms' },
    spriteCenterChroma:             { label: 'Chroma Key',         group: 'Sprite C', inputType: 'chroma-key' },
    spriteCenterScale:              { label: 'Ukuran',             group: 'Sprite C', inputType: 'slider', min: 0, max: 100, step: 1, unit: '%' },
    spriteCenterX:                  { label: 'Posisi X',           group: 'Sprite C', inputType: 'position', options: 'SPRITE_POS', min: 0, max: 100, step: 1, unit: '%' },
    spriteCenterZ:                  { label: 'Z-Order',            group: 'Sprite C', inputType: 'number', placeholder: 'kosong = urutan alami' },
    spriteCenterTransition:         { label: 'Transisi Sprite',    group: 'Sprite C', inputType: 'checkbox' },
    spriteCenterTransitionDuration: { label: 'Durasi Transisi',    group: 'Sprite C', inputType: 'number', unit: 'ms' },

    // === Fokus bicara (G2) — LINTAS-SLOT, karena itu grupnya sendiri: menaruhnya di
    // grup 'Sprite' akan membuatnya terbaca sebagai milik slot kanan saja. ===
    spriteFocus:      { label: 'Fokus Bicara',    group: 'Fokus', inputType: 'select', options: 'SPRITE_FOCUS' },
    spriteDim:        { label: 'Kekuatan Redup',  group: 'Fokus', inputType: 'number', min: 0, max: 1, step: 0.05, placeholder: 'kosong = tema (--vn-sprite-dim)' },
    spriteFocusScale: { label: 'Zoom Fokus',      group: 'Fokus', inputType: 'number', min: 0.5, max: 2, step: 0.01, placeholder: 'kosong = tanpa zoom' },

    // === Audio ===
    voice:      { label: 'Suara Karakter',  group: 'Audio',   inputType: 'file' },
    voiceVolume:{ label: 'Volume Suara',    group: 'Audio',   inputType: 'slider', min: 0, max: 1, step: 0.1 },
    bgm:        { label: 'Musik Latar',     group: 'Audio',   inputType: 'file' },
    bgmVolume:  { label: 'Volume BGM',      group: 'Audio',   inputType: 'slider', min: 0, max: 1, step: 0.1 },
    bgmFade:    { label: 'Fade BGM',        group: 'Audio',   inputType: 'number', unit: 'detik', step: 0.5 },
    bgmLoop:    { label: 'Loop BGM',        group: 'Audio',   inputType: 'checkbox' },
    bgmOneShot: { label: 'One-Shot / Sting (kembali otomatis ke BGM sebelumnya)', group: 'Audio', inputType: 'checkbox' },
    bgmOneShotDuration: { label: 'Durasi Sting', group: 'Audio', inputType: 'number', unit: 'ms' },
    bgmStop:    { label: 'Hentikan BGM mulai entri ini', group: 'Audio', inputType: 'checkbox' },
    bgmLoopStart: { label: 'Loop Mulai (detik)', group: 'Audio', inputType: 'number', unit: 'detik', step: 0.1, placeholder: 'intro tak diulang' },
    bgmLoopEnd:   { label: 'Loop Akhir (detik)', group: 'Audio', inputType: 'number', unit: 'detik', step: 0.1, placeholder: 'kosong = akhir file' },
    ambient:       { label: 'Ambient (loop kedua)', group: 'Audio', inputType: 'file' },
    ambientVolume: { label: 'Volume Ambient',       group: 'Audio', inputType: 'slider', min: 0, max: 1, step: 0.05 },
    ambientStop:   { label: 'Hentikan Ambient mulai entri ini', group: 'Audio', inputType: 'checkbox' },
    sfx:        { label: 'Efek Suara',      group: 'Audio',   inputType: 'file' },
    sfxVolume:  { label: 'Volume SFX',      group: 'Audio',   inputType: 'slider', min: 0, max: 1, step: 0.1 },
    sfxDelay:   { label: 'Delay SFX',       group: 'Audio',   inputType: 'number', unit: 'ms' },
    sfxPan:     { label: 'Pan SFX',         group: 'Audio',   inputType: 'slider', min: -1, max: 1, step: 0.1 },
    sfxIn:      { label: 'SFX Masuk',       group: 'Audio',   inputType: 'file' },
    sfxInVolume:{ label: 'Volume SFX Masuk',group: 'Audio',   inputType: 'slider', min: 0, max: 1, step: 0.1 },
    sfxInDelay: { label: 'Delay SFX Masuk', group: 'Audio',   inputType: 'number', unit: 'ms' },
    sfxInPan:   { label: 'Pan SFX Masuk',   group: 'Audio',   inputType: 'slider', min: -1, max: 1, step: 0.1 },
    sfxOut:     { label: 'SFX Keluar',      group: 'Audio',   inputType: 'file' },
    sfxOutVolume:{ label: 'Volume SFX Keluar',group: 'Audio', inputType: 'slider', min: 0, max: 1, step: 0.1 },
    sfxOutDelay: { label: 'Delay SFX Keluar',group: 'Audio',  inputType: 'number', unit: 'ms' },
    sfxOutPan:   { label: 'Pan SFX Keluar', group: 'Audio',   inputType: 'slider', min: -1, max: 1, step: 0.1 },
};

// Urutan grup di Inspector panel
_NodeConst.FIELD_GROUPS = ['Dasar', 'Visual', 'Sprite', 'Sprite 2', 'Sprite C', 'Fokus', 'Audio'];

var _typeDefinitions = {
    dialogue: {
        label: '💬 Dialog',
        category: 'narrative',
        canHaveCondition: true,
        canHaveSpecialEvent: true,
        canHaveCustomSprites: true,
        assetKeys: ['voice', 'sprite', 'sprite2', 'spriteCenter', 'sfx', 'bgm'],
        fields: [
            { key: 'speaker', extract: 'string' },
            { key: 'text', extract: 'string' },
            // Voice
            { key: 'voice', extract: 'asset' },
            { key: 'voiceVolume', extract: 'number', dependsOn: 'voice' },
            // Sprite kanan
            { key: 'sprite', extract: 'asset-layers' },
            { key: 'spriteAnim', extract: 'string', dependsOn: 'sprite', bawaan: 'anim-in-fade' },
            { key: 'spriteDelay', extract: 'number', dependsOn: 'sprite' },
            { key: 'spriteChroma', extract: 'chroma-key', dependsOn: 'sprite' },
            { key: 'spriteScale', extract: 'scale', dependsOn: 'sprite', bawaan: 1 },
            { key: 'spriteX', extract: 'position-or-name', dependsOn: 'sprite', bawaan: 85 },
            { key: 'spriteZ', extract: 'number', dependsOn: 'sprite' },
            { key: 'spriteTransition', extract: 'boolean', dependsOn: 'sprite', bawaan: false },
            { key: 'spriteTransitionDuration', extract: 'transition-duration', dependsOnChecked: 'spriteTransition' },
            // Sprite kiri
            { key: 'sprite2', extract: 'asset-layers' },
            { key: 'sprite2Anim', extract: 'string', dependsOn: 'sprite2', bawaan: 'anim-in-fade' },
            { key: 'sprite2Delay', extract: 'number', dependsOn: 'sprite2' },
            { key: 'sprite2Chroma', extract: 'chroma-key', dependsOn: 'sprite2' },
            { key: 'sprite2Scale', extract: 'scale', dependsOn: 'sprite2', bawaan: 1 },
            { key: 'sprite2X', extract: 'position-or-name', dependsOn: 'sprite2', bawaan: 15 },
            { key: 'sprite2Z', extract: 'number', dependsOn: 'sprite2' },
            { key: 'sprite2Transition', extract: 'boolean', dependsOn: 'sprite2', bawaan: false },
            { key: 'sprite2TransitionDuration', extract: 'transition-duration', dependsOnChecked: 'sprite2Transition' },
            // Sprite tengah
            { key: 'spriteCenter', extract: 'asset-layers' },
            { key: 'spriteCenterAnim', extract: 'string', dependsOn: 'spriteCenter', bawaan: 'anim-in-fade' },
            { key: 'spriteCenterDelay', extract: 'number', dependsOn: 'spriteCenter' },
            { key: 'spriteCenterChroma', extract: 'chroma-key', dependsOn: 'spriteCenter' },
            { key: 'spriteCenterScale', extract: 'scale', dependsOn: 'spriteCenter', bawaan: 1 },
            { key: 'spriteCenterX', extract: 'position-or-name', dependsOn: 'spriteCenter', bawaan: 50 },
            { key: 'spriteCenterZ', extract: 'number', dependsOn: 'spriteCenter' },
            { key: 'spriteCenterTransition', extract: 'boolean', dependsOn: 'spriteCenter', bawaan: false },
            { key: 'spriteCenterTransitionDuration', extract: 'transition-duration', dependsOnChecked: 'spriteCenterTransition' },
            // Fokus bicara (lintas-slot, per-entri). SENGAJA TANPA dependsOn ke slot mana
            // pun: di mode sticky sprite yang bicara boleh DIWARISI dari entri sebelumnya,
            // jadi fokus sah ada walau entri ini tak mendeklarasikan slotnya. Memberi
            // dependsOn di sini akan menghapus fokus tiap kali disimpan (kelas FB18).
            { key: 'spriteFocus', extract: 'string' },
            { key: 'spriteDim', extract: 'number', dependsOn: 'spriteFocus' },
            { key: 'spriteFocusScale', extract: 'number', dependsOn: 'spriteFocus' },
            // SFX
            { key: 'sfx', extract: 'asset' },
            { key: 'sfxVolume', extract: 'number', dependsOn: 'sfx' },
            { key: 'sfxDelay', extract: 'number', dependsOn: 'sfx' },
            { key: 'sfxPan', extract: 'number', dependsOn: 'sfx' },
        ],
        defaultData: {
            speaker: '', text: '', voice: '',
            sprite: '', sprite2: '', spriteCenter: '',
            spriteScale: 1.0, sprite2Scale: 1.0, spriteCenterScale: 1.0,
            spriteX: 85, sprite2X: 15, spriteCenterX: 50,
            spriteAnim: 'anim-in-fade', sprite2Anim: 'anim-in-fade', spriteCenterAnim: 'anim-in-fade',
        },
    },

    choice: {
        label: '🔀 Pilihan (Choice)',
        category: 'narrative',
        canHaveCondition: true,
        canHaveSpecialEvent: true,
        canHaveCustomSprites: true,
        inherits: 'dialogue', // Mewarisi semua field dari dialogue
        extraFields: [
            // choice-specific: choices array & autoDialogue diekstrak via widget, bukan field biasa
            // inputType 'text' → mode input bebas (mis. nama pemain), bukan pilihan-ganda.
            // Field di bawah dependsOn 'inputType' — otomatis terhapus (lihat _isFieldRelevant
            // di extractFromCard) saat mode dikembalikan ke pilihan-ganda (inputType='').
            { key: 'inputType', extract: 'string' },
            { key: 'variable', extract: 'string', dependsOn: 'inputType' },
            { key: 'placeholder', extract: 'string-allow-empty', dependsOn: 'inputType', bawaan: '' },
            { key: 'maxLength', extract: 'number', dependsOn: 'inputType', bawaan: 30 },
            { key: 'defaultValue', extract: 'string-allow-empty', dependsOn: 'inputType', bawaan: '' },
            { key: 'submitLabel', extract: 'string-allow-empty', dependsOn: 'inputType', bawaan: '' },
            // Timed choice (QTE). timeLimit kosong → field dihapus (extract 'number'),
            // choice tetap non-timer seperti biasa. Flag per-opsi "timeout": true TIDAK
            // punya widget UI sendiri, tapi AMAN saat round-trip editor: ikut terbawa
            // lewat baseline data-raw-option di _extractChoices (mekanisme yang sama
            // yang melindungi setVariable/condition per-opsi).
            { key: 'timeLimit', extract: 'number' },
            { key: 'timeLimitLabel', extract: 'string' },
        ],
        defaultData: {
            speaker: '', text: '', voice: '', choices: [], autoDialogue: false,
            sprite: '', sprite2: '', spriteCenter: '',
        },
    },

    scene: {
        label: '🎬 Transisi Scene',
        category: 'media',
        canHaveCondition: true,
        canHaveSpecialEvent: true,
        assetKeys: ['background', 'video', 'bgm', 'ambient', 'sfxIn', 'sfxOut'],
        fields: [
            { key: 'sceneType', extract: 'string', bawaan: 'image' },
            { key: 'transition', extract: 'string', bawaan: 'cut' },
            // Durasi transisi masuk per-entry (ms) — dibaca init.js, meng-override
            // state.transitionDuration HANYA untuk transisi ini (audit F10).
            { key: 'transitionDuration', extract: 'number' },
            { key: 'transitionOut', extract: 'string', bawaan: 'cut' },
            // SFX masuk
            { key: 'sfxIn', extract: 'asset' },
            { key: 'sfxInVolume', extract: 'number', dependsOn: 'sfxIn' },
            { key: 'sfxInDelay', extract: 'number', dependsOn: 'sfxIn' },
            { key: 'sfxInPan', extract: 'number', dependsOn: 'sfxIn' },
            // SFX keluar
            { key: 'sfxOut', extract: 'asset' },
            { key: 'sfxOutVolume', extract: 'number', dependsOn: 'sfxOut' },
            { key: 'sfxOutDelay', extract: 'number', dependsOn: 'sfxOut' },
            { key: 'sfxOutPan', extract: 'number', dependsOn: 'sfxOut' },
            // BGM
            { key: 'bgm', extract: 'asset' },
            { key: 'bgmFade', extract: 'number', dependsOn: 'bgm', bawaan: 1 },
            { key: 'bgmLoop', extract: 'boolean', bawaan: true },
            { key: 'bgmVolume', extract: 'number', dependsOn: 'bgm' },
            // BGM lanjutan: sting one-shot (kembali otomatis ke BGM sebelumnya) &
            // stop eksplisit. 'flag' = hanya disimpan saat true (tidak menyampah
            // "false" di setiap entri).
            { key: 'bgmOneShot', extract: 'flag', dependsOn: 'bgm' },
            { key: 'bgmOneShotDuration', extract: 'number', dependsOn: 'bgm', dependsOnChecked: 'bgmOneShot' },
            { key: 'bgmStop', extract: 'flag' },
            // Loop-point BGM (detik) — intro dimainkan sekali, pengulangan mulai
            // dari bgmLoopStart / dipotong di bgmLoopEnd (audit F2; audio-manager).
            { key: 'bgmLoopStart', extract: 'number', dependsOn: 'bgm' },
            { key: 'bgmLoopEnd', extract: 'number', dependsOn: 'bgm' },
            // Ambient: channel loop kedua yang hidup berdampingan dengan BGM
            // (hujan/keramaian). ambientStop → core menghentikan channel (audit F1).
            { key: 'ambient', extract: 'asset' },
            { key: 'ambientVolume', extract: 'number', dependsOn: 'ambient' },
            { key: 'ambientStop', extract: 'flag' },
            // === Conditional per sceneType — ditangani di cleanupScene ===
            // Image
            { key: 'background', extract: 'asset', sceneType: 'image' },
            { key: 'backgroundMode', extract: 'radio', sceneType: 'image', bawaan: 'cover' },
            { key: 'persistBackground', extract: 'boolean', sceneType: 'image', bawaan: true },
            // Video
            { key: 'video', extract: 'asset', sceneType: 'video' },
            { key: 'videoMuted', extract: 'boolean', sceneType: 'video', bawaan: true },
            { key: 'mutePhaseBgm', extract: 'boolean', sceneType: 'video', bawaan: false },
            { key: 'duration', extract: 'duration-sec', sceneType: 'video', bawaan: 3000 },
            { key: 'persistBackground', extract: 'boolean', sceneType: 'video', bawaan: true },
            // Text Screen
            { key: 'text', extract: 'string', sceneType: 'text_screen' },
            { key: 'duration', extract: 'duration-sec', sceneType: 'text_screen', bawaan: 3000 },
        ],
        defaultData: {
            sceneType: 'image', transition: 'cut', transitionOut: 'cut',
            background: '', video: '', text: '',
            persistBackground: true, videoMuted: true, mutePhaseBgm: true,
            duration: 3000, bgmLoop: true, bgmFade: 1,
        },
    },

    set_var: {
        label: 'Set Variable',
        category: 'scripting',
        canHaveCondition: true,
        canHaveSpecialEvent: false,
        fields: [
            { key: 'name', extract: 'string' },
            { key: 'op', extract: 'string' },
            { key: 'value', extract: 'string-allow-empty' },
        ],
        defaultData: { name: '', op: '=', value: '' },
    },

    custom: {
        label: 'Custom Command',
        category: 'scripting',
        canHaveCondition: true,
        canHaveSpecialEvent: false,
        fields: [
            { key: 'command', extract: 'string' },
            { key: 'params', extract: 'string' },
        ],
        defaultData: { command: '', params: '' },
    },

    label: {
        label: '🏷️ Label',
        category: 'flow',
        canHaveCondition: false,
        fields: [
            { key: 'name', extract: 'string' },
            { key: 'transition', extract: 'string' },
            { key: 'transitionOut', extract: 'string' },
            { key: 'background', extract: 'asset' },
            { key: 'backgroundMode', extract: 'radio' },
            { key: 'video', extract: 'asset' },
            { key: 'bgm', extract: 'asset' },
            { key: 'bgmVolume', extract: 'number', dependsOn: 'bgm' },
            { key: 'sfx', extract: 'asset' },
        ],
        defaultData: { name: '', transition: 'cut', transitionOut: 'cut' },
    },

    phase: {
        label: '📑 Fase',
        category: 'flow',
        canHaveCondition: false,
        fields: [
            { key: 'name', extract: 'string' },
            { key: 'background', extract: 'asset' },
            { key: 'backgroundMode', extract: 'radio' },
            { key: 'video', extract: 'asset' },
            { key: 'bgm', extract: 'asset' },
            { key: 'bgmVolume', extract: 'number', dependsOn: 'bgm' },
            { key: 'bgmFade', extract: 'number' },
            { key: 'transitionOut', extract: 'string' },
            { key: 'isEnding', extract: 'boolean' },
        ],
        defaultData: { name: 'default', background: '', bgm: '', bgmFade: 1, isEnding: false },
    },

    jump: {
        label: '➡️ Jump',
        category: 'flow',
        // 'jump' ber-condition = conditional jump (percabangan berbasis variabel,
        // pola resmi didukung engine — lihat core.js evaluateCondition). UI kondisi
        // sudah selalu dirender untuk semua tipe (entryEditorCard.js); dulu flag ini
        // false membuat kondisinya TERLIHAT bisa diedit tapi diam-diam tak pernah
        // disimpan (baris ini tidak dieksekusi extractFromCard).
        canHaveCondition: true,
        fields: [
            { key: 'target', extract: 'string' },
        ],
        defaultData: { target: '' },
    },

    load_hub_flags: {
        label: '🔗 Muat Flag Hub',
        category: 'scripting',
        canHaveCondition: false,
        canHaveSpecialEvent: false,
        fields: [
            { key: 'prefix', extract: 'string' },
            { key: 'source', extract: 'string', bawaan: 'hub-flags' },
        ],
        // Entri BARU tetap berangkat dengan prefix 'hf_' (lihat getDefaultData);
        // yang berubah hanya entri tulisan tangan yang memang tak menyebut prefix.
        defaultData: { prefix: 'hf_', source: 'hub-flags' },
    },
};

// ============================================================
// 4. REGISTRY API
// ============================================================

VN.NodeRegistry = {
    _types: {},

    /**
     * Daftarkan tipe entry baru atau override yang ada.
     * @param {string} id - Identifier tipe (contoh: 'dialogue', 'my_custom_type')
     * @param {Object} definition - Definisi tipe
     */
    register: function(id, definition) {
        var def = { id: id };
        // Jika inherit dari tipe lain, gabungkan field-nya
        if (definition.inherits && this._types[definition.inherits]) {
            var parent = this._types[definition.inherits];
            def.fields = (parent.fields || []).concat(definition.extraFields || []);
            def.assetKeys = parent.assetKeys;
            def.canHaveSpecialEvent = definition.canHaveSpecialEvent !== undefined ? definition.canHaveSpecialEvent : parent.canHaveSpecialEvent;
            def.canHaveCondition = definition.canHaveCondition !== undefined ? definition.canHaveCondition : parent.canHaveCondition;
            def.canHaveCustomSprites = definition.canHaveCustomSprites !== undefined ? definition.canHaveCustomSprites : parent.canHaveCustomSprites;
        }
        // Override individual properties
        var keys = Object.keys(definition);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] !== 'inherits' && keys[i] !== 'extraFields') {
                def[keys[i]] = definition[keys[i]];
            }
        }
        if (!def.fields) def.fields = definition.fields || [];
        this._types[id] = def;
    },

    /**
     * Dapatkan definisi tipe.
     * @param {string} id
     * @returns {Object|null}
     */
    get: function(id) {
        return this._types[id] || null;
    },

    /** Semua tipe terdaftar */
    getAll: function() {
        return Object.values(this._types);
    },

    /** Filter berdasarkan kategori */
    getByCategory: function(category) {
        return this.getAll().filter(function(t) { return t.category === category; });
    },

    /**
     * Data default untuk entry baru.
     * @param {string} id
     * @returns {Object}
     */
    getDefaultData: function(id) {
        var typeDef = this.get(id);
        if (!typeDef || !typeDef.defaultData) return { type: id };
        var data = { type: id };
        var keys = Object.keys(typeDef.defaultData);
        for (var i = 0; i < keys.length; i++) {
            var val = typeDef.defaultData[keys[i]];
            data[keys[i]] = (typeof val === 'object' && val !== null) ? JSON.parse(JSON.stringify(val)) : val;
        }
        return data;
    },

    // Expose constants
    C: _NodeConst,
};

// Daftarkan semua tipe built-in
(function() {
    var ids = Object.keys(_typeDefinitions);
    for (var i = 0; i < ids.length; i++) {
        VN.NodeRegistry.register(ids[i], _typeDefinitions[ids[i]]);
    }
})();

// ============================================================
// 4B. CONDITION UI — Builder kondisi bertingkat (all/any/not)
//
// Satu komponen untuk SEMUA tempat kondisi diedit (entry-level & per-opsi
// choice): render HTML dari bentuk kondisi apa pun yang didukung engine,
// wiring tombol via delegasi, dan serialisasi balik DOM → objek kondisi.
//
// Kontrak diff-nol: bentuk JSON asli dilacak per-grup lewat data-orig-form
// (single / array / all / any / not / not-array) sehingga entry yang dibuka
// lalu disimpan TANPA disentuh menghasilkan bentuk yang identik — {all:[...]}
// tidak diam-diam berubah jadi array, dst.
//
// Bentuk yang TIDAK bisa direpresentasikan (canRepresent() false — mis.
// operand objek {var:'x'} atau leaf dengan field tambahan): container diberi
// data-cond-mode="raw", ekstraktor membiarkan kondisi baseline utuh.
// ============================================================

VN.NodeRegistry.ConditionUI = (function () {
    function esc(str) {
        if (str === undefined || str === null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var COMB_OPTIONS = [
        { value: 'all', label: 'SEMUA benar (AND)' },
        { value: 'any', label: 'SALAH SATU benar (OR)' },
        { value: 'not', label: 'BUKAN — negasi (NOT)' },
    ];

    function parseLegacyString(str) {
        // Format lama: "varName op value" (mis. "affection > 50")
        var match = String(str).trim().match(/^(\S+)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);
        if (match) {
            return { var: match[1], op: match[2] === '=' ? '==' : match[2], value: match[3].trim() };
        }
        return { var: String(str), op: '==', value: '' };
    }

    function isLeaf(c) {
        return !!c && typeof c === 'object' && !Array.isArray(c) &&
            c.var !== undefined && c.all === undefined && c.any === undefined && c.not === undefined;
    }

    function leafRepresentable(c) {
        var keys = Object.keys(c);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i] !== 'var' && keys[i] !== 'op' && keys[i] !== 'value') return false;
        }
        if (typeof c.var !== 'string') return false;
        var v = c.value;
        // Operand bentuk objek ({var:'x'}) tak muat di input teks — pakai "$x".
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) return false;
        if (Array.isArray(v) && v.some(function (x) { return x !== null && typeof x === 'object'; })) return false;
        return true;
    }

    function canRepresent(cond) {
        if (cond === undefined || cond === null) return true;
        if (typeof cond === 'string') return true;
        if (Array.isArray(cond)) return cond.every(canRepresent);
        if (typeof cond !== 'object') return false;
        if (Array.isArray(cond.all)) return Object.keys(cond).length === 1 && cond.all.every(canRepresent);
        if (Array.isArray(cond.any)) return Object.keys(cond).length === 1 && cond.any.every(canRepresent);
        if (cond.not !== undefined) return Object.keys(cond).length === 1 && canRepresent(cond.not);
        if (isLeaf(cond)) return leafRepresentable(cond);
        return false;
    }

    function rowHTML(varName, op, value) {
        var ops = VN.NodeRegistry.C.CONDITION_OPS;
        var opOptions = ops.map(function (o) {
            return '<option value="' + o + '"' + (op === o ? ' selected' : '') + '>' + o + '</option>';
        }).join('');
        var displayValue = Array.isArray(value) ? value.join(', ') : value;
        // `null` tak punya cara ditulis di kotak teks, dan bagi engine `null` BUKAN
        // `""` (`null == ""` bernilai false) — menggantinya MENGUBAH percabangan,
        // bukan sekadar merapikan. Barisnya ditandai supaya serializeRow bisa
        // memulangkan `null` selama kotaknya belum disentuh; semangat yang sama
        // dengan pemulihan operand terstruktur pada set_var.
        var tandaNull = (value === null) ? ' data-nilai-null="1"' : '';
        var valueTitle = 'Angka/teks/true/false. Ketik $namaVariabel untuk membandingkan dengan variabel lain. Untuk in/!in/between: pisahkan nilai dengan koma (between = min, max).';
        return '<div class="condition-row"' + tandaNull + ' style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">' +
            '<input type="text" class="script-input condition-var" value="' + esc(varName) + '" placeholder="nama_variabel" style="flex: 2; font-family: monospace; font-size: 0.85em;">' +
            '<select class="script-input condition-op" style="flex: 0.8; font-size: 0.85em;">' + opOptions + '</select>' +
            '<input type="text" class="script-input condition-value" value="' + esc(displayValue) + '" placeholder="nilai / $variabel" title="' + valueTitle + '" style="flex: 2; font-family: monospace; font-size: 0.85em;">' +
            '<button type="button" class="remove-condition-row-btn" style="background: transparent; color: #e74c3c; border: none; cursor: pointer; font-size: 1.1em; padding: 2px 6px;" title="Hapus kondisi">×</button>' +
            '</div>';
    }

    function groupHTML(comb, childrenHTML, isRoot, origForm) {
        var options = COMB_OPTIONS.map(function (o) {
            return '<option value="' + o.value + '"' + (o.value === comb ? ' selected' : '') + '>' + o.label + '</option>';
        }).join('');
        return '<div class="condition-group' + (isRoot ? ' condition-group-root' : '') + '" data-orig-form="' + (origForm || '') + '"' +
            (isRoot ? '' : ' style="border: 1px dashed #556; border-radius: 4px; padding: 6px; margin-bottom: 4px;"') + '>' +
            '<div class="condition-group-header" style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">' +
            '<select class="script-input condition-group-combinator" style="flex: 0 0 auto; font-size: 0.8em;">' + options + '</select>' +
            (isRoot ? '' : '<button type="button" class="cond-remove-group" style="background: transparent; color: #e74c3c; border: none; cursor: pointer; font-size: 1.05em; padding: 2px 6px; margin-left: auto;" title="Hapus grup ini">×</button>') +
            '</div>' +
            '<div class="condition-group-children">' + childrenHTML + '</div>' +
            '<div class="condition-group-actions" style="display: flex; gap: 6px; margin-top: 2px;">' +
            '<button type="button" class="cond-add-row" style="background: transparent; color: #66ccff; border: 1px dashed #66ccff; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75em;">+ Kondisi</button>' +
            '<button type="button" class="cond-add-group" style="background: transparent; color: #b48ead; border: 1px dashed #b48ead; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75em;" title="Grup bertingkat (AND/OR/NOT)">+ Grup</button>' +
            '</div>' +
            '</div>';
    }

    function nodeHTML(cond) {
        if (typeof cond === 'string') {
            var p = parseLegacyString(cond);
            return rowHTML(p.var, p.op, p.value);
        }
        if (Array.isArray(cond)) return groupHTML('all', cond.map(nodeHTML).join(''), false, 'array');
        if (Array.isArray(cond.all)) return groupHTML('all', cond.all.map(nodeHTML).join(''), false, 'all');
        if (Array.isArray(cond.any)) return groupHTML('any', cond.any.map(nodeHTML).join(''), false, 'any');
        if (cond.not !== undefined) {
            var kids = Array.isArray(cond.not) ? cond.not.map(nodeHTML).join('') : nodeHTML(cond.not);
            return groupHTML('not', kids, false, Array.isArray(cond.not) ? 'not-array' : 'not');
        }
        return rowHTML(cond.var !== undefined ? cond.var : '', cond.op || '==', cond.value !== undefined ? cond.value : '');
    }

    function buildHTML(cond) {
        var comb = 'all', kidsHTML = '', orig = 'new';
        if (cond === undefined || cond === null) {
            kidsHTML = rowHTML('', '==', '');
        } else if (typeof cond === 'string') {
            var p = parseLegacyString(cond);
            kidsHTML = rowHTML(p.var, p.op, p.value);
            orig = 'single';
        } else if (Array.isArray(cond)) {
            kidsHTML = cond.map(nodeHTML).join(''); orig = 'array';
        } else if (Array.isArray(cond.all)) {
            kidsHTML = cond.all.map(nodeHTML).join(''); orig = 'all';
        } else if (Array.isArray(cond.any)) {
            comb = 'any'; kidsHTML = cond.any.map(nodeHTML).join(''); orig = 'any';
        } else if (cond.not !== undefined) {
            comb = 'not';
            kidsHTML = Array.isArray(cond.not) ? cond.not.map(nodeHTML).join('') : nodeHTML(cond.not);
            orig = Array.isArray(cond.not) ? 'not-array' : 'not';
        } else {
            kidsHTML = nodeHTML(cond); orig = 'single';
        }
        return '<div class="condition-builder">' + groupHTML(comb, kidsHTML, true, orig) + '</div>';
    }

    function serializeRow(rowEl) {
        var varInput = rowEl.querySelector('.condition-var');
        var varName = varInput ? varInput.value.trim() : '';
        if (!varName) return null;
        var opEl = rowEl.querySelector('.condition-op');
        var opVal = opEl ? opEl.value : '==';
        var valEl = rowEl.querySelector('.condition-value');
        var v = valEl ? valEl.value.trim() : '';
        // Kotak masih kosong DAN barisnya lahir dari `null` → kreator belum
        // menyentuhnya, jadi `null` dipulangkan apa adanya.
        if (v === '' && rowEl.dataset.nilaiNull === '1') {
            return { var: varName, op: opVal, value: null };
        }
        if (opVal === 'in' || opVal === '!in' || opVal === 'between') {
            var arr = v.split(',')
                .map(function (s) { return s.trim(); })
                .filter(function (s) { return s !== ''; })
                .map(_autoDetectConditionValue);
            return { var: varName, op: opVal, value: arr };
        }
        return { var: varName, op: opVal, value: _autoDetectConditionValue(v) };
    }

    function serializeGroup(groupEl, isRoot) {
        var combSel = groupEl.querySelector(':scope > .condition-group-header > .condition-group-combinator');
        var comb = combSel ? combSel.value : 'all';
        var childrenEl = groupEl.querySelector(':scope > .condition-group-children');
        var kids = [];
        if (childrenEl) {
            Array.prototype.forEach.call(childrenEl.children, function (el) {
                var out = null;
                if (el.classList.contains('condition-row')) out = serializeRow(el);
                else if (el.classList.contains('condition-group')) out = serializeGroup(el, false);
                if (out !== null && out !== undefined) kids.push(out);
            });
        }
        if (kids.length === 0) return null;
        var orig = groupEl.dataset.origForm || '';
        if (comb === 'not') {
            if (orig === 'not-array') return { not: kids };
            if (kids.length === 1) return { not: kids[0] };
            return { not: { all: kids } };
        }
        if (comb === 'any') return { any: kids };
        // comb === 'all' — hormati bentuk asli agar diff-nol
        if (orig === 'all') return { all: kids };
        if (orig === 'array') return kids;
        if (kids.length === 1) return kids[0];
        if (isRoot) return kids; // bentuk legacy: array = AND (sama dgn builder lama)
        return { all: kids };
    }

    function serialize(builderEl) {
        if (!builderEl) return null;
        var root = builderEl.querySelector(':scope > .condition-group');
        if (!root) return null;
        return serializeGroup(root, true);
    }

    function describe(cond) {
        if (cond === undefined || cond === null) return '(kosong)';
        if (typeof cond === 'string') return cond;
        if (Array.isArray(cond)) return cond.map(_wrapDescribe).join(' DAN ');
        if (Array.isArray(cond.all)) return cond.all.map(_wrapDescribe).join(' DAN ');
        if (Array.isArray(cond.any)) return cond.any.map(_wrapDescribe).join(' ATAU ');
        if (cond.not !== undefined) return 'TIDAK ' + _wrapDescribe(cond.not);
        var v = Array.isArray(cond.value) ? '[' + cond.value.join(', ') + ']' : cond.value;
        return (cond.var || '?') + ' ' + (cond.op || '==') + ' ' + v;
    }
    function _wrapDescribe(c) {
        var s = describe(c);
        var isComposite = Array.isArray(c) || (c && typeof c === 'object' && (c.all || c.any || c.not !== undefined));
        return isComposite ? '(' + s + ')' : s;
    }

    /**
     * Delegasi event tombol builder — panggil SEKALI per card/scope; mencakup
     * builder entry-level, per-opsi choice, dan opsi yang ditambahkan belakangan.
     */
    function attach(scopeEl) {
        if (!scopeEl || scopeEl.dataset.condUiAttached) return;
        scopeEl.dataset.condUiAttached = '1';
        scopeEl.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            var btn = t.closest('.cond-add-row, .cond-add-group, .remove-condition-row-btn, .cond-remove-group');
            if (!btn || !scopeEl.contains(btn)) return;
            if (btn.classList.contains('cond-add-row')) {
                var group = btn.closest('.condition-group');
                var children = group && group.querySelector(':scope > .condition-group-children');
                if (children) children.insertAdjacentHTML('beforeend', rowHTML('', '==', ''));
            } else if (btn.classList.contains('cond-add-group')) {
                var group2 = btn.closest('.condition-group');
                var children2 = group2 && group2.querySelector(':scope > .condition-group-children');
                if (children2) children2.insertAdjacentHTML('beforeend', groupHTML('all', rowHTML('', '==', ''), false, ''));
            } else if (btn.classList.contains('remove-condition-row-btn')) {
                var row = btn.closest('.condition-row');
                if (row) row.remove();
            } else if (btn.classList.contains('cond-remove-group')) {
                var g = btn.closest('.condition-group');
                if (g && !g.classList.contains('condition-group-root')) g.remove();
            }
        });
    }

    return {
        canRepresent: canRepresent,
        buildHTML: buildHTML,
        serialize: serialize,
        describe: describe,
        attach: attach,
        rowHTML: rowHTML,
        parseLegacyString: parseLegacyString,
    };
})();

// ============================================================
// 5. DATA-DRIVEN EXTRACTION
//    Menggantikan extractDataFromCard() di scriptEditor.js
//    Konsisten, tanpa DOM scraping hardcoded
// ============================================================

/**
 * Ekstrak nilai dari satu input DOM berdasarkan field definition.
 * @param {Object} [baseline] entri ASLI (rawEntry) — dipakai field yang lossy
 *        saat bolak-balik lewat widget (lihat `scale`).
 * @private
 */
function _extractFieldValue(card, field, result, baseline) {
    // Untuk radio buttons, perlu query yang berbeda
    if (field.extract === 'radio') {
        var radio = card.querySelector('[data-key="' + field.key + '"]:checked');
        if (radio) result[field.key] = radio.value; else delete result[field.key];
        return;
    }

    // Sprite MULTI-LAYER (F4): satu kunci JSON, nilainya STRING (satu gambar) atau
    // ARRAY `[dasar, ...overlay]`. Sebelum ini kunci ini `extract: 'asset'` — nilai
    // array dirender jadi "a.png,b.png" lalu disimpan sebagai STRING itu, jadi entri
    // multi-layer HILANG hanya karena dibuka lalu disimpan (kelas FB18/FB19).
    if (field.extract === 'asset-layers') {
        var baseEl = card.querySelector('[data-key="' + field.key + '"]');
        if (!baseEl) return;                       // kartu tak merender slot ini → jangan sentuh
        var base = String(baseEl.value || '').trim();
        // Metadata layer sengaja menjadi kunci SAMPINGAN, bukan bentuk baru
        // untuk `sprite`: array lama `[dasar, ...overlay]` tetap kontrak asetnya.
        // Dengan begitu script lama tetap dibaca persis sama, sementara setiap
        // overlay baru boleh membawa delay, transform, dan animasi sendiri.
        var layerSettingsKey = field.key + 'LayerSettings';
        if (!base) {
            delete result[field.key];
            delete result[layerSettingsKey];
            return;
        }

        var wadah = card.querySelector('.sprite-layers-container[data-slot="' + field.key + '"]');
        if (!wadah) {
            // Kontainer layer tak dirender: JANGAN membuang overlay yang sudah ada —
            // hanya ganti layer dasarnya (pengaman FB18, sama semangatnya dengan
            // `audioChannels`: container absen ≠ hapus data).
            var lama = result[field.key];
            result[field.key] = (Array.isArray(lama) && lama.length > 1)
                ? [base].concat(lama.slice(1))
                : base;
            return;
        }

        var layers = [];
        var layerSettings = [];
        var hasLayerSettings = false;
        wadah.querySelectorAll('.sprite-layer-src').forEach(function (el) {
            var v = String(el.value || '').trim();
            if (!v) return;                        // baris kosong tak menyampah
            layers.push(v);

            // Offset memakai persen ukuran gambar layer, agar proporsional saat
            // responsive scale berubah. `{}` adalah placeholder posisi: perlu
            // disimpan hanya bila layer sesudahnya punya konfigurasi non-default.
            var item = el.closest ? el.closest('.sprite-layer-item') : null;
            var readLayerNumber = function(selector, min, max, fallback) {
                var control = item && item.querySelector(selector);
                var number = control && control.value !== '' ? Number(control.value) : fallback;
                if (!isFinite(number)) number = fallback;
                return Math.max(min, Math.min(max, number));
            };
            var setting = {};
            var layerDelay = readLayerNumber('.sprite-layer-delay', 0, 60000, 0);
            var layerOffsetX = readLayerNumber('.sprite-layer-offset-x', -100, 100, 0);
            var layerOffsetY = readLayerNumber('.sprite-layer-offset-y', -100, 100, 0);
            var layerScale = readLayerNumber('.sprite-layer-scale', 0, 300, 100);
            var layerRotation = readLayerNumber('.sprite-layer-rotation', -360, 360, 0);
            var layerOpacity = readLayerNumber('.sprite-layer-opacity', 0, 100, 100);
            var layerFlipX = !!(item && item.querySelector('.sprite-layer-flip-x:checked'));
            var layerHideBase = !!(item && item.querySelector('.sprite-layer-hide-base:checked'));
            var layerAnimEl = item && item.querySelector('.sprite-layer-anim');
            var layerAnim = String(layerAnimEl ? layerAnimEl.value : '').trim();
            if (!/^anim-[A-Za-z0-9_-]+$/.test(layerAnim)) layerAnim = '';
            if (layerDelay) setting.delay = layerDelay;
            if (layerOffsetX) setting.offsetX = layerOffsetX;
            if (layerOffsetY) setting.offsetY = layerOffsetY;
            if (layerScale !== 100) setting.scale = layerScale;
            if (layerRotation) setting.rotation = layerRotation;
            if (layerOpacity !== 100) setting.opacity = layerOpacity;
            if (layerFlipX) setting.flipX = true;
            if (layerHideBase) setting.hideBase = true;
            if (layerAnim) setting.anim = layerAnim;
            if (Object.keys(setting).length) hasLayerSettings = true;
            layerSettings.push(setting);
        });
        // Satu gambar tetap disimpan sebagai STRING — nol migrasi untuk entri lama.
        result[field.key] = layers.length ? [base].concat(layers) : base;
        if (hasLayerSettings) result[layerSettingsKey] = layerSettings;
        else delete result[layerSettingsKey];
        return;
    }

    // Chroma key sprite disimpan sebagai satu objek per slot supaya konfigurasi
    // warna/toleransi tidak tercecer menjadi tiga kunci top-level. Kontrolnya
    // tetap berupa input biasa agar kartu mudah diinspeksi dan kompatibel dengan
    // editor lama yang hanya mengenal `data-key`.
    if (field.extract === 'chroma-key') {
        var enabledEl = card.querySelector('[data-key="' + field.key + 'Enabled"]');
        if (!enabledEl) return;                    // kartu tak memuat UI ini
        if (!enabledEl.checked) { delete result[field.key]; return; }

        var colorEl = card.querySelector('[data-key="' + field.key + 'Color"]');
        var toleranceEl = card.querySelector('[data-key="' + field.key + 'Tolerance"]');
        var color = colorEl ? String(colorEl.value || '').trim() : '';
        // Browser <input type=color> selalu memberi #rrggbb. Nilai fallback
        // menjaga skrip yang diketik tangan/DOM fixture tetap aman di runtime.
        if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#00ff00';
        var tolerance = toleranceEl ? parseInt(toleranceEl.value, 10) : 45;
        if (!isFinite(tolerance)) tolerance = 45;
        result[field.key] = {
            enabled: true,
            color: color,
            tolerance: Math.max(0, Math.min(255, tolerance))
        };
        return;
    }

    // Posisi X: SATU kunci JSON, DUA kontrol (dropdown nama + slider angka). Harus
    // ditangani sebelum pencarian input tunggal di bawah, karena kunci utama menempel
    // pada dropdown sementara angkanya ada di `<key>-num`.
    //   nama terisi  → simpan STRING (posisi panggung, di-resolve CSS)
    //   nama kosong  → simpan ANGKA slider (perilaku lama, nol migrasi)
    //   dua-duanya tak ada → JANGAN sentuh (pengaman FB18: kartu yang tak merender
    //   kontrolnya tak boleh membuang nilai yang sudah ada)
    if (field.extract === 'position-or-name') {
        var selPos = card.querySelector('[data-key="' + field.key + '"]');
        var numPos = card.querySelector('[data-key="' + field.key + '-num"]');
        if (!selPos && !numPos) return;
        var namaPos = selPos ? String(selPos.value || '').trim() : '';
        if (namaPos) { result[field.key] = namaPos; return; }
        if (numPos) result[field.key] = parseInt(numPos.value) || 50;
        return;
    }

    var input = card.querySelector('[data-key="' + field.key + '"]');
    if (!input) return;

    var val;
    switch (field.extract) {
        case 'asset':
            val = input.value.trim();
            if (val) result[field.key] = val; else delete result[field.key];
            break;
        case 'string':
            val = input.value.trim();
            if (val) result[field.key] = val; else delete result[field.key];
            break;
        case 'string-allow-empty':
            result[field.key] = input.value.trim();
            break;
        case 'boolean':
            result[field.key] = input.checked;
            break;
        case 'flag':
            // Seperti boolean, tapi hanya disimpan saat true — untuk field opsional
            // (bgmOneShot/bgmStop) agar JSON tak dipenuhi "false" di tiap entri.
            if (input.checked) result[field.key] = true; else delete result[field.key];
            break;
        case 'number':
            val = input.value;
            if (val !== '' && !isNaN(parseFloat(val))) result[field.key] = parseFloat(val); else delete result[field.key];
            break;
        case 'scale':
            // Slider 0-100 → scale factor 0.25-1.75.
            //
            // Pemetaannya LOSSY: slider bilangan bulat, jadi hanya kelipatan 0.015
            // yang punya wakil. `1.2` yang ditulis tangan berubah jadi
            // 1.1949999999999998 begitu kartunya dibuka lalu disimpan — kreator tak
            // menyentuh apa pun. Kalau posisi slider MASIH sama dengan nilai asli,
            // nilai asli yang dipakai; menggeser slider tetap menang seperti biasa.
            val = 0.015 * parseFloat(input.value) + 0.25;
            if (baseline && typeof baseline[field.key] === 'number') {
                var sliderAsli = Math.round((baseline[field.key] - 0.25) / 0.015);
                if (sliderAsli === parseInt(input.value, 10)) val = baseline[field.key];
            }
            result[field.key] = val;
            break;
        case 'position':
            result[field.key] = parseInt(input.value) || 50;
            break;
        case 'duration-sec':
            val = parseFloat(input.value);
            if (!isNaN(val)) result[field.key] = Math.max(100, val * 1000); else delete result[field.key];
            break;
        case 'transition-duration':
            result[field.key] = parseInt(input.value) || 500;
            break;
    }
}

/**
 * Cek apakah field harus diekstrak berdasarkan dependency.
 * @private
 */
function _isFieldRelevant(field, result, card, baseline) {
    if (field.dependsOn) {
        // Hanya ekstrak jika field induk (biasanya aset) sudah ada di result…
        if (!result[field.dependsOn]) {
            // …KECUALI kalau entri aslinya memang menulis anak TANPA induk. Induk
            // boleh diwarisi: `bgm` dari `phase`, `sprite` dari mode lengket. Aturan
            // ini sudah diakui benar di skema — lihat catatan `spriteFocus` yang
            // SENGAJA tanpa dependsOn karena alasan yang sama persis. Tanpa
            // pengecualian ini, membuka entri semacam itu membuang `bgmFade`,
            // `bgmLoopStart`, `sfxIn*`/`sfxOut*` (terukur: 106 entri shipped).
            //
            // Syaratnya SEMPIT: hanya bila BASELINE-nya sendiri sudah begitu.
            // Kartu BARU (tanpa baseline) tetap dibersihkan seperti dulu — kalau
            // tidak, tiap entri baru akan menabung `spriteAnim: 'anim-in-fade'`
            // dan sejenisnya hanya karena widget-nya punya opsi pertama.
            var warisanSah = baseline &&
                baseline[field.key] !== undefined && !baseline[field.dependsOn];
            if (!warisanSah) return false;
        }
    }
    if (field.dependsOnChecked) {
        // Hanya ekstrak jika checkbox terkait checked
        var cb = card.querySelector('[data-key="' + field.dependsOnChecked + '"]');
        if (!cb || !cb.checked) return false;
    }
    return true;
}

/**
 * Ekstrak special event dari card.
 * @private
 */
function _extractSpecialEvent(card, result) {
    // `result` berangkat dari rawEntry, jadi isi specialEvent SEBELUM ditimpa di
    // bawah adalah persis apa yang tertulis di berkas.
    var seAsli = result.specialEvent;
    var form = card.querySelector('.special-event-form');
    if (!form || form.style.display === 'none') { delete result.specialEvent; return; }

    var eventType = form.querySelector('.special-event-type');
    if (!eventType || !eventType.value || !eventType.value.trim()) { delete result.specialEvent; return; }

    var delayEnable = form.querySelector('.special-event-delay-enable');
    var delayInput = form.querySelector('.special-event-delay');

    // `sfx` kosong berarti efeknya tak bersuara — sama saja dengan kuncinya tak ada.
    // Dirakit bertahap, BUKAN dengan menghapus kunci sesudahnya, supaya urutan kunci
    // tak bergeser: entri lama menyimpan `sfx` di tengah, dan menggesernya ke ekor
    // membuat berkas berubah walau isinya sama.
    var seSfx = (form.querySelector('.special-event-sfx').value || '').trim();
    var se = {
        type: eventType.value,
        duration: parseInt(form.querySelector('.special-event-duration').value) || 1000,
        intensity: parseFloat(form.querySelector('.special-event-intensity').value) || 1.0,
    };
    if (seSfx) se.sfx = seSfx;
    else if (seAsli && typeof seAsli === 'object' && seAsli.sfx === '') se.sfx = '';
    // `wait: false` dan `delay: 0` adalah keadaan diam efek ini — sama saja dengan
    // kuncinya tak ada. Ditulis hanya kalau bernilai atau kalau berkasnya memang
    // sudah menyimpannya (aturan yang sama dengan _buangBawaanTakDisentuh).
    var seWait = form.querySelector('.special-event-wait').checked;
    var seDelay = (delayEnable && delayEnable.checked && delayInput) ? (parseInt(delayInput.value) || 0) : 0;
    var sePunya = function (k) { return seAsli && typeof seAsli === 'object' && (k in seAsli); };
    if (seWait || sePunya('wait')) se.wait = seWait;
    if (seDelay || sePunya('delay')) se.delay = seDelay;
    result.specialEvent = se;
}

/**
 * Auto-detect tipe nilai kondisi: boolean/angka di-cast, sisanya tetap string
 * (termasuk operand var-vs-var "$namaVariabel" — sengaja TIDAK disentuh).
 * @private
 */
function _autoDetectConditionValue(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v !== '' && v.charAt(0) !== '$' && !isNaN(Number(v))) return Number(v);
    return v;
}

/**
 * Ekstrak kondisi eksekusi dari card.
 * @private
 */
function _extractCondition(card, result) {
    var toggle = card.querySelector('.toggle-condition');
    if (!toggle || !toggle.checked) { delete result.condition; return; }

    // === Jalur utama: Condition Builder v2 (container entry-level) ===
    var container = card.querySelector('.entry-condition-container');
    if (container) {
        // Mode raw: kondisi tak terepresentasikan builder (mis. operand {var:..})
        // — baseline dari rawEntry dibiarkan utuh, tidak ditimpa/dihapus.
        if (container.dataset.condMode === 'raw') return;
        var cond = VN.NodeRegistry.ConditionUI.serialize(container.querySelector('.condition-builder'));
        if (cond === null || cond === undefined) delete result.condition;
        else result.condition = cond;
        return;
    }

    // === Fallback kompat: struktur baris flat lama tanpa container ===
    // (fixture/DOM lama). Baris di dalam opsi choice BUKAN kondisi entry-level.
    var rows = Array.prototype.filter.call(card.querySelectorAll('.condition-row'), function (row) {
        return !row.closest('.choice-option-editor');
    });
    var conditions = [];
    rows.forEach(function(row) {
        var varName = row.querySelector('.condition-var');
        var op = row.querySelector('.condition-op');
        var val = row.querySelector('.condition-value');
        varName = varName ? varName.value.trim() : '';
        if (!varName) return;

        var opVal = op ? op.value : '==';
        var v = val ? val.value.trim() : '';

        if (opVal === 'in' || opVal === '!in' || opVal === 'between') {
            // Nilai = daftar dipisah koma → array. Tiap elemen di-auto-detect
            // sendiri; string "$var" TIDAK di-cast (operand var-vs-var engine).
            var arr = v.split(',')
                .map(function(s) { return s.trim(); })
                .filter(function(s) { return s !== ''; })
                .map(_autoDetectConditionValue);
            conditions.push({ var: varName, op: opVal, value: arr });
            return;
        }

        conditions.push({ var: varName, op: opVal, value: _autoDetectConditionValue(v) });
    });

    if (conditions.length === 1) result.condition = conditions[0];
    else if (conditions.length > 1) result.condition = conditions;
    // conditions.length === 0 dengan toggle checked → baris kosong → baseline
    // dari rawEntry dibiarkan utuh, TIDAK ditimpa/dihapus (perilaku lama).
}

/**
 * Ekstrak choice options dari card.
 * @private
 */
function _extractChoices(card, result) {
    // autoDialogue
    var autoToggle = card.querySelector('.auto-dialogue-toggle');
    if (autoToggle && autoToggle.checked) {
        var typeRadio = card.querySelector('.auto-dialogue-type:checked');
        result.autoDialogue = typeRadio ? typeRadio.value : 'character';
    } else {
        delete result.autoDialogue;
    }

    var choices = [];
    card.querySelectorAll('.choice-option-editor').forEach(function(optEditor) {
        var text = optEditor.querySelector('.choice-option-text');
        var jump = optEditor.querySelector('.choice-option-jump');
        text = text ? text.value.trim() : '';
        jump = jump ? jump.value.trim() : '';
        if (!text) return;

        // Baseline per-opsi (data-raw-option, disetel saat render) — bawa serta
        // field yang tak dimodel widget mana pun, lalu timpa field yang dimodel
        // UI saat ini. Opsi baru (tombol "+ Tambah Opsi") tak punya atribut ini
        // → baseline kosong, wajar.
        var base = {};
        if (optEditor.dataset.rawOption) {
            try {
                var parsed = JSON.parse(optEditor.dataset.rawOption);
                if (parsed && typeof parsed === 'object') base = parsed;
            } catch (e) { /* abaikan, pakai baseline kosong */ }
        }
        var merged = Object.assign({}, base, { text: text });
        // `jump` kosong sama artinya dengan kuncinya tak ada — dua-duanya berarti
        // "tak melompat". Menuliskannya menambah satu baris kosong di TIAP opsi
        // pilihan. Dihapus dari baseline juga, supaya mengosongkan kotaknya benar-benar
        // mencabut lompatan yang dulu tertulis.
        // Tapi kalau berkasnya MEMANG sudah menyimpan `jump: ""`, ia dibiarkan —
        // aturan yang sama dengan _buangBawaanTakDisentuh: save tidak menyentuh apa
        // yang tak diminta. Lompatan yang dikosongkan kreator tetap dicabut.
        if (jump) merged.jump = jump;
        else if (base.jump !== '') delete merged.jump;

        // === Choice Option Editor v2 — widget lanjutan per-opsi ===
        // Set Variabel: nama kosong = tidak ada (hapus dari baseline juga).
        var svNameEl = optEditor.querySelector('.opt-sv-name');
        if (svNameEl) {
            var svName = svNameEl.value.trim();
            if (!svName) {
                delete merged.setVariable;
            } else {
                var svOpEl = optEditor.querySelector('.opt-sv-op');
                var svOp = svOpEl ? svOpEl.value : '=';
                var sv = { name: svName, op: svOp };
                if (svOp === 'random') {
                    var mnEl = optEditor.querySelector('.opt-sv-random-min');
                    var mxEl = optEditor.querySelector('.opt-sv-random-max');
                    var mn = mnEl ? parseFloat(mnEl.value) : NaN;
                    var mx = mxEl ? parseFloat(mxEl.value) : NaN;
                    if (!isNaN(mn) && !isNaN(mx)) sv.value = [mn, mx];
                    else if (base.setVariable && Array.isArray(base.setVariable.value)) sv.value = base.setVariable.value;
                } else {
                    var svValEl = optEditor.querySelector('.opt-sv-value');
                    sv.value = _autoDetectConditionValue(svValEl ? svValEl.value.trim() : '');
                }
                merged.setVariable = sv;
            }
        }

        // Kondisi tampil per-opsi (Condition Builder v2, container ber-scope opsi).
        var optCondToggle = optEditor.querySelector('.opt-cond-toggle');
        if (optCondToggle) {
            if (!optCondToggle.checked) {
                delete merged.condition;
            } else {
                var optCondContainer = optEditor.querySelector('.opt-cond-container');
                if (optCondContainer && optCondContainer.dataset.condMode !== 'raw') {
                    var optCond = VN.NodeRegistry.ConditionUI.serialize(optCondContainer.querySelector('.condition-builder'));
                    if (optCond === null || optCond === undefined) delete merged.condition;
                    else merged.condition = optCond;
                }
                // mode raw: condition baseline dibiarkan utuh
            }
        }

        // Flag QTE per-opsi: auto-pilih saat waktu habis.
        var timeoutCheck = optEditor.querySelector('.opt-timeout-check');
        if (timeoutCheck) {
            if (timeoutCheck.checked) merged.timeout = true;
            else delete merged.timeout;
        }

        choices.push(merged);
    });
    result.choices = choices;
}

/**
 * Ekstrak custom sprites (multi-sprite system) dari card.
 * @private
 */
function _extractCustomSprites(card, result) {
    var spriteModeToggle = card.querySelector('.sprite-mode-toggle');
    if (spriteModeToggle) {
        result.spriteMode = spriteModeToggle.checked ? 'auto' : 'custom';
    }

    var container = card.querySelector('.extra-sprites-container');
    if (!container) { delete result.charSprites; return; }

    var items = container.querySelectorAll('.extra-sprite-item');
    if (items.length === 0) { delete result.charSprites; return; }

    var charSprites = [];
    items.forEach(function(item, idx) {
        var srcInput = item.querySelector('.extra-sprite-src');
        var src = srcInput ? srcInput.value.trim() : '';
        if (!src) return;

        var xInput = item.querySelector('.extra-sprite-x');
        var xNameSel = item.querySelector('.extra-sprite-x-name');
        var xName = xNameSel ? String(xNameSel.value || '').trim() : '';
        var animSelect = item.querySelector('.extra-sprite-anim');
        var delayInput = item.querySelector('.extra-sprite-delay');
        var scaleSlider = item.querySelector('.extra-sprite-scale');
        var zInput = item.querySelector('.extra-sprite-z');
        var chromaEnabled = item.querySelector('.extra-sprite-chroma-enabled');
        var chromaColor = item.querySelector('.extra-sprite-chroma-color');
        var chromaTolerance = item.querySelector('.extra-sprite-chroma-tolerance');

        var scalePercent = scaleSlider ? parseFloat(scaleSlider.value) : 50;
        var scaleFactor = 0.015 * scalePercent + 0.25;

        var entry = {
            id: 'custom-sprite-' + idx,
            src: src,
            slot: 'custom',
            // Posisi bernama menang atas slider — aturan yang SAMA dengan slot preset
            // (`position-or-name`), supaya nama tak cuma berlaku di 3 slot bawaan.
            x: xName ? xName : (xInput ? (parseInt(xInput.value) || 50) : 50),
            anim: animSelect ? animSelect.value : 'anim-in-fade',
            scale: scaleFactor,
        };
        // z-order opsional (audit F3) — kosong = urutan alami (tanpa key).
        if (zInput && zInput.value !== '' && !isNaN(parseInt(zInput.value))) {
            entry.z = parseInt(zInput.value);
        }
        if (delayInput && delayInput.value !== '' && !isNaN(parseInt(delayInput.value, 10))) {
            entry.delay = Math.max(0, parseInt(delayInput.value, 10));
        }
        if (chromaEnabled && chromaEnabled.checked) {
            var color = chromaColor ? String(chromaColor.value || '').trim() : '';
            if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#00ff00';
            var tolerance = chromaTolerance ? parseInt(chromaTolerance.value, 10) : 45;
            if (!isFinite(tolerance)) tolerance = 45;
            entry.chromaKey = {
                enabled: true,
                color: color,
                tolerance: Math.max(0, Math.min(255, tolerance))
            };
        }
        charSprites.push(entry);
    });

    if (charSprites.length > 0) result.charSprites = charSprites; else delete result.charSprites;
}

/**
 * Ekstrak channel audio bernama (G1) dari kartu entri.
 *
 * ⚠ PENGAMAN FB18: bila containernya TIDAK ADA, nilai lama **dipertahankan**, bukan
 * dihapus. Bedanya dengan `_extractCustomSprites` (yang menghapus) disengaja: blok ini
 * baru dirender di kartu `scene`, sementara skema `label`/`phase` juga menerima
 * `audioChannels`. Kalau ketiadaan container diartikan "kosongkan", entri hasil
 * hand-edit akan kehilangan datanya begitu kartunya disimpan — kelas FB18 persis.
 * @private
 */
function _extractAudioChannels(card, result) {
    var container = card.querySelector('.audio-channels-container');
    if (!container) return;                       // JANGAN hapus — lihat catatan di atas

    var items = container.querySelectorAll('.audio-channel-item');
    var daftar = [];
    items.forEach(function(item) {
        var nama = (item.querySelector('.ac-name') || {}).value;
        nama = nama ? nama.trim() : '';
        if (!nama) return;                        // baris tanpa nama = belum diisi

        var src = ((item.querySelector('.ac-src') || {}).value || '').trim();
        var queueRaw = ((item.querySelector('.ac-queue') || {}).value || '').trim();
        var fadeRaw = ((item.querySelector('.ac-fade') || {}).value || '').trim();
        var loopEl = item.querySelector('.ac-loop');
        var stopEl = item.querySelector('.ac-stop');

        var entry = { channel: nama };
        if (queueRaw) {
            entry.queue = queueRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        }
        if (src) entry.src = src;
        if (fadeRaw !== '' && !isNaN(parseFloat(fadeRaw))) entry.fade = parseFloat(fadeRaw);
        if (loopEl && !loopEl.checked) entry.loop = false;   // hanya simpan bila BUKAN default
        if (stopEl && stopEl.checked) entry.stop = true;
        // Baris tanpa src, tanpa queue, dan bukan perintah stop = tak bermakna.
        if (!entry.src && !entry.queue && !entry.stop) return;
        daftar.push(entry);
    });

    if (daftar.length > 0) result.audioChannels = daftar; else delete result.audioChannels;
}

/**
 * Cleanup per-type: hapus field yang tidak relevan untuk tipe scene tertentu.
 * @private
 */
function _cleanupSceneFields(result) {
    var st = result.sceneType || 'image';
    switch (st) {
        case 'image':
            delete result.video; delete result.videoMuted; delete result.duration; delete result.mutePhaseBgm;
            delete result.text;
            break;
        case 'video':
            delete result.background; delete result.backgroundMode; delete result.text;
            break;
        case 'text_screen':
            // `persistBackground` SENGAJA tidak ikut dibuang di sini. Runtime
            // membacanya untuk SEMUA jenis scene, bukan cuma image/video:
            // `story-carry.js` memakainya untuk memutuskan latar dibawa atau tidak,
            // dan cabang transisi keluar `display-controller.js` juga memeriksanya.
            // Membuangnya karena skema tak punya widget untuk jenis ini = menghapus
            // kunci yang justru dipatuhi engine — kelas kesalahan yang sama dengan
            // `dialogue.background` di audit round-trip.
            delete result.background; delete result.video; delete result.backgroundMode;
            delete result.videoMuted; delete result.mutePhaseBgm;
            break;
    }
}

/**
 * Buang kunci yang BENAR-BENAR tak bermakna di luar entri `scene`.
 *
 * ⚠ Daftar ini dulu memuat 14 kunci dan menghapus semuanya dari SETIAP entri
 * non-scene. Itu editor yang berpendapat, bukan editor yang membaca kenyataan
 * (P0) — dan runtime membantahnya secara harfiah:
 *
 *   story-carry.js:  `line.type === 'dialogue' || (line.type === 'scene' && …)`
 *                    → `background` pada dialogue DIBACA dan DIWARISKAN
 *   display-controller renderContent(): `background`, `backgroundMode`,
 *                    `mutePhaseBgm`, `video` (justru dijaga `type !== 'scene'`)
 *   init.js:         `data.transition`, `data.sfxIn*` = jalur render SEMUA entri
 *   audio-manager:   `bgmFade`/`bgmLoop` diteruskan ke playBGM tanpa lihat tipe
 *
 * Terukur: 11 entri di novel shipped memakainya, termasuk showcase `Elaina`
 * (dialogue ber-`background`) dan fixture `Uji Fitur Engine` (dialogue ber-
 * `transition`). Membukanya di editor lalu menyimpan = latar & transisi lenyap.
 *
 * Yang TERSISA di bawah sudah diperiksa satu per satu: masing-masing hanya
 * dibaca di dalam cabang `data.type === 'scene'`, jadi membuangnya aman.
 * Menambah kunci ke daftar ini WAJIB disertai bukti cabang tipe di runtime.
 */
function _cleanupNonSceneFields(result) {
    delete result.sceneType;          // display-controller: switch di dalam if (type === 'scene')
    delete result.videoMuted;         // idem — jalur video non-scene memakai muted tetap
    delete result.persistBackground;  // story-carry & core.js sama-sama menguji type === 'scene'
    delete result.transitionOut;      // display-controller: pendingExitTransition, scene-only
    delete result.sfxOut;             // idem (sfx transisi keluar)
    delete result.sfxOutVolume; delete result.sfxOutDelay; delete result.sfxOutPan;
}

/**
 * Ekstrak SEMUA data dari entry card berdasarkan registry schema.
 * Menggantikan extractDataFromCard() di scriptEditor.js.
 *
 * @param {HTMLElement} card - Entry card element (.dialogue-entry-card)
 * @returns {Object} Data entry siap serialisasi ke JSON
 */
/**
 * Buang kunci BAWAAN yang tak pernah ada di berkas dan tak pernah disentuh.
 *
 * Akar polusinya sederhana: widget selalu merender SESUATU — slider mendarat di
 * 85, dropdown di `anim-in-fade`, checkbox tercentang — lalu ekstraksi membaca
 * nilai itu tanpa bertanya apakah ia datang dari kreator atau dari kekosongan.
 * Akibatnya membuka satu chapter lalu menyimpannya menulis ulang hampir setiap
 * entri: dari 232 bentuk entri nyata di novel shipped, cuma 106 yang kembali
 * persis.
 *
 * Dan ini bukan sekadar derau diff. Beberapa kunci BERUBAH ARTI begitu ditulis
 * eksplisit, jadi sekadar membuka-menyimpan mengubah cara novel berjalan:
 *
 *   - `bgmLoop` yang absen berarti "warisi dari phase / bgm lengket"
 *     (`init.js`, `story-carry.js`). Ditulis `true`, warisan itu putus.
 *   - `mutePhaseBgm` dibaca dengan `=== true`, jadi absen berarti TIDAK
 *     membisukan. Menulis `true` menyalakan pembisuan yang tak pernah diminta.
 *   - `transitionOut: 'cut'` bernilai truthy, jadi cabang transisi keluar di
 *     `display-controller.js` mulai berjalan di entri yang dulu melewatinya.
 *
 * Aturannya sengaja SEMPIT: hanya kunci yang memang tak ada di berkas. Kunci
 * yang sudah tertulis kreator selalu ditulis balik apa adanya — termasuk saat
 * nilainya kebetulan sama dengan bawaan — sehingga mengubah `bgmLoop: false`
 * jadi tercentang tetap tersimpan sebagai `true`.
 *
 * Nilai `bawaan` tiap field DIUKUR dari render sungguhan, bukan ditebak; ada
 * drift guard yang merendernya ulang dan membandingkan.
 */
function _buangBawaanTakDisentuh(result, baseline, typeDef) {
    var asli = baseline || {};
    var fields = (typeDef && typeDef.fields) || [];
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (!('bawaan' in field)) continue;
        if (field.key in asli) continue;
        if (!(field.key in result)) continue;
        if (JSON.stringify(result[field.key]) !== JSON.stringify(field.bawaan)) continue;
        delete result[field.key];
    }

    // `spriteMode` tak punya baris di skema — ia ditulis _extractCustomSprites
    // langsung dari toggle, yang tak tercentang berarti 'custom'. Aturannya sama.
    if (!('spriteMode' in asli) && result.spriteMode === 'custom') delete result.spriteMode;
}

VN.NodeRegistry.extractFromCard = function(card) {
    var type = card.dataset.type;
    var typeDef = this.get(type);

    // Baseline = entry ASLI (disimpan saat card dirender, entryEditorCard.js).
    // Field yang tak dimodel skema/widget manapun (mis. condition kombinator
    // all/any/not, choice.setVariable) ikut lolos apa adanya alih-alih hilang
    // diam-diam — sebelumnya extractFromCard selalu mulai dari objek kosong.
    var result = { type: type };
    // `baseline` = salinan TERPISAH yang tak ikut termutasi selama ekstraksi.
    // `result` dimulai dari rawEntry lalu ditimpa widget, jadi ia TIDAK bisa
    // dipakai untuk menjawab "apa yang tertulis di berkas tadi?" — pertanyaan
    // yang dibutuhkan aturan warisan (dependsOn) dan `scale`.
    var baseline = null;
    if (card.dataset.rawEntry) {
        try {
            var raw = JSON.parse(card.dataset.rawEntry);
            if (raw && typeof raw === 'object') {
                result = raw;
                // Kartu ringkas tidak akan dimutasi oleh extractor. Hindari parse
                // kedua untuk ribuan payload yang memang langsung dikembalikan.
                if (card.dataset.compactEntry === 'true') {
                    result.type = type;
                    return result;
                }
                baseline = JSON.parse(card.dataset.rawEntry);
            }
        } catch (e) { /* rawEntry korup/tak valid, pakai objek kosong */ }
    }
    result.type = type;

    // Kartu ringkas pada chapter besar sengaja tidak memiliki widget lanjutan.
    // Ketiadaan widget di sini berarti "belum di-hydrate", bukan "hapus field".
    // Payload raw adalah sumber canonical sampai kartu dibuka; mengembalikannya
    // langsung menjaga Save/Undo lossless tanpa membangun ratusan node tersembunyi.
    if (card.dataset.compactEntry === 'true') {
        return result;
    }

    // Jika tipe tidak dikenal, fallback ke extraction manual lama
    if (!typeDef) {
        console.warn('[VN.NodeRegistry] Tipe tidak dikenal:', type);
        return result;
    }

    // 1. Special Event (jika tipe mendukung)
    if (typeDef.canHaveSpecialEvent) {
        _extractSpecialEvent(card, result);
    }

    // 2. Tentukan active scene type untuk field filtering
    var activeSceneType = null;
    if (type === 'scene') {
        var sceneSelector = card.querySelector('.scene-type-selector');
        activeSceneType = sceneSelector ? sceneSelector.value : 'image';
        result.sceneType = activeSceneType;
    }

    // 3. Ekstrak field dari schema
    var fields = typeDef.fields || [];
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];

        // Filter berdasarkan sceneType (jika ada)
        if (field.sceneType && activeSceneType && field.sceneType !== activeSceneType) continue;

        // Cek dependency — field tak relevan (mis. bgmVolume tanpa bgm) dihapus
        // dari baseline juga, bukan cuma dilewati, supaya tak lagi tersisa dari
        // rawEntry lama setelah field induknya dikosongkan lewat UI.
        if (!_isFieldRelevant(field, result, card, baseline)) { delete result[field.key]; continue; }

        // Untuk scene, hanya query input dalam scene-input-group yang aktif
        if (activeSceneType && field.sceneType) {
            var group = card.querySelector('.scene-input-group[data-scene-type="' + activeSceneType + '"]');
            if (group) {
                // Cari input dalam group spesifik
                var scoped = { querySelector: function(sel) { return group.querySelector(sel); } };
                _extractFieldValue(scoped, field, result, baseline);
                continue;
            }
        }

        _extractFieldValue(card, field, result, baseline);
    }

    // 4. Widget khusus per tipe
    if (type === 'choice') {
        // Mode input teks (inputType:'text') tak punya daftar opsi — choices/autoDialogue
        // dihapus eksplisit (bukan cuma dilewati) supaya tak nyangkut dari baseline saat
        // entry dipindah dari mode pilihan-ganda ke mode input teks.
        if (result.inputType === 'text') {
            delete result.choices;
            delete result.autoDialogue;
            // Timer QTE tidak bermakna untuk mode input teks bebas.
            delete result.timeLimit;
            delete result.timeLimitLabel;
        } else {
            _extractChoices(card, result);
        }
    }
    if (typeDef.canHaveCustomSprites) {
        _extractCustomSprites(card, result);
    }
    // Channel audio bernama (G1) — dijalankan untuk SEMUA tipe: ekstraktornya sendiri
    // yang memutuskan (container ada → baca; tak ada → pertahankan nilai lama).
    _extractAudioChannels(card, result);

    // 5. Condition
    if (typeDef.canHaveCondition) {
        _extractCondition(card, result);
    }

    // 6. TYPE CLEANUP — hapus field tidak relevan
    if (type === 'scene') {
        _cleanupSceneFields(result);
    } else if (type !== 'set_var' && type !== 'custom') {
        _cleanupNonSceneFields(result);
    }

    // 7. Nilai set_var: op 'random' memakai widget rentang Min–Max (value = [min, max]);
    //    op lain memakai textbox biasa dengan auto-detect tipe. Operand "$var" tetap string.
    if (type === 'set_var') {
        if (result.op === 'random') {
            var minEl = card.querySelector('.set-var-random-min');
            var maxEl = card.querySelector('.set-var-random-max');
            var mn = minEl ? parseFloat(minEl.value) : NaN;
            var mx = maxEl ? parseFloat(maxEl.value) : NaN;
            if (!isNaN(mn) && !isNaN(mx)) {
                result.value = [mn, mx];
            } else {
                // Widget kosong/tak ada — pulihkan array asli dari baseline agar
                // entry lama tidak terkorup jadi string kosong.
                try {
                    var rawVal = JSON.parse(card.dataset.rawEntry || '{}').value;
                    if (Array.isArray(rawVal)) result.value = rawVal; else delete result.value;
                } catch (e) { delete result.value; }
            }
        } else if (result.value !== undefined && typeof result.value === 'string') {
            var v = result.value;
            // OPERAND TERSTRUKTUR (array, atau `{concat:[…]}` — lihat engine-fixes
            // §1) tak punya widget: kartu merender '' untuk array dan
            // '[object Object]' untuk objek. Selama teksnya masih persis itu,
            // kreator belum menyentuhnya — jadi nilai asli dipulihkan alih-alih
            // ditimpa jadi string. Tanpa ini, membuka fixture `Uji Fitur Engine`
            // lalu menyimpan mengubah `{"concat":["seg_","$segNo"]}` menjadi
            // string harfiah "[object Object]". Semangatnya sama dengan pemulihan
            // rentang Min–Max di cabang `random` di atas.
            // `null` masuk kelas yang sama: kotak teks tak punya cara menuliskannya,
            // dan bagi engine `null` ≠ `""` (`null == ""` bernilai false), jadi
            // menggantinya MENGUBAH percabangan — bukan sekadar merapikan.
            var asliVal = baseline ? baseline.value : undefined;
            var takTerwakili = (asliVal === null && v === '') ||
                (asliVal !== null && typeof asliVal === 'object' &&
                 (v === '' || v === '[object Object]' || v === String(asliVal)));
            if (takTerwakili) result.value = asliVal;
            else if (v === 'true') result.value = true;
            else if (v === 'false') result.value = false;
            else if (v !== '' && v.charAt(0) !== '$' && !isNaN(Number(v))) result.value = Number(v);
        }
    }


    // 8. `custom.params` boleh berbentuk OBJEK, bukan cuma string JSON — runtime
    //    menerima dua-duanya (`screen-commands.js`, `hub-bridge-commands.js`).
    //    Kotak teks cuma sanggup memikul string, jadi bentuk objek dipulangkan ke
    //    objek saat disimpan. Tanpa ini, sekadar MEMBUKA lalu menyimpan entri
    //    custom ber-params objek merusaknya jadi teks "[object Object]" — persis
    //    kelas kehilangan yang sudah dibereskan untuk operand `{concat}` di atas.
    //
    //    Bentuk sumber dipertahankan dengan sengaja: entri yang memang menulis
    //    params sebagai STRING tidak ikut diubah jadi objek. Save tak boleh
    //    menulis ulang apa pun yang tidak disentuh kreator.
    if (type === 'custom') {
        var paramsAsli = baseline ? baseline.params : undefined;
        if (paramsAsli !== null && typeof paramsAsli === 'object' &&
            typeof result.params === 'string') {
            var teksParams = result.params.trim();
            if (teksParams === '' || teksParams === '[object Object]') {
                // Kartu tak pernah sanggup menuliskannya, jadi kreator mustahil
                // sudah menyuntingnya — nilai asli dipulihkan apa adanya.
                result.params = paramsAsli;
            } else {
                try {
                    result.params = JSON.parse(teksParams);
                } catch (e) {
                    // JSON yang belum sah = kreator masih di tengah mengetik.
                    // Teksnya dibiarkan hidup; membuangnya menghapus ketikannya.
                }
            }
        }
    }
    // 9. Kunci bawaan yang tak pernah ditulis kreator tidak ikut tersimpan.
    //    Dijalankan PALING AKHIR supaya ia melihat hasil final, sesudah cleanup
    //    per-tipe dan sesudah pemulihan nilai terstruktur di atas.
    _buangBawaanTakDisentuh(result, baseline, typeDef);

    return result;
};

// ============================================================
// 6. BACKWARD COMPATIBILITY BRIDGE
// ============================================================

// Global function yang dipakai entryEditorCard.js (preview) dan editorToolbar.js (save)
window.extractDataFromCard = function(card) {
    return VN.NodeRegistry.extractFromCard(card);
};

console.log('[VN NodeRegistry] Dimuat. Tipe terdaftar:', Object.keys(VN.NodeRegistry._types).length);
