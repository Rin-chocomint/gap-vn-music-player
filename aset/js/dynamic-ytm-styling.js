/**
 * Dynamic YTM Styling v2.1 (Reimplementasi Lengkap)
 * 
 * Skrip ini adalah "otak" di balik perubahan tampilan dinamis berdasarkan cover album.
 * 
 * CARA KERJA SISTEMATIS:
 * 1. MENDENGAR: Menguunakan MutationObserver dan MediaSession API untuk tahu kapan lagu berubah.
 * 2. MENGAMBIL: Mengambil gambar cover album terbaru.
 * 3. MENGANALISA: Menggunakan library `node-vibrant` untuk mengekstrak palet warna dominan (Vibrant, Muted, Dark, Light).
 * 4. MENERAPKAN: Menyuntikkan variabel CSS (CSS Variables) ke `:root` dokumen.
 * 
 * TEMA & STRATEGI RENDER:
 * - 'default-optimized': Menggunakan `position: fixed` pseudo-element untuk background.
 *    KENAPA? Karena mengubah `background` pada elemen `body` yang bisa discroll akan memicu "Paint" ulang seluruh halaman.
 *    Dengan pseudo-element fixed, browser menaruhnya di layer komposit terpisah => Performa 60fps mulus.
 * 
 * - 'seamless': Membuat semua kontainer UI (navbar, playerbar) menjadi transparan (`transparent`), 
 *    sehingga satu gradien besar di background terlihat menembus menyatukan seluruh aplikasi.
 * 
 * - 'harmony': Menggunakan teori warna untuk mencampur (blend) warna palet menjadi gradien yang lebih
 *    kompleks dan artistik, tidak sekedar comot warna mentah.
 */

// ============================================================================
// 1. SISTEM VARIABEL CSS (The "Base Styles")
// Definisi variabel dasar agar kita punya nilai default sebelum lagu dimuat.
// ============================================================================

function getBaseCss() {
    return `
    :root {
        /* Base Grayscale Colors (00-100) */
        --ts-base-00-color: #000000;
        --ts-base-10-color: #1a1a1a;
        --ts-base-20-color: #333333;
        --ts-base-30-color: #4d4d4d;
        --ts-base-40-color: #666666;
        --ts-base-50-color: #808080;
        --ts-base-60-color: #999999;
        --ts-base-70-color: #b3b3b3;
        --ts-base-80-color: #cccccc;
        --ts-base-90-color: #e6e6e6;
        --ts-base-100-color: #ffffff;

        /* Alpha Variants for Base 00 (Black) */
        --ts-base-00-alpha-005-color: rgba(0, 0, 0, 0.05);
        --ts-base-00-alpha-01-color: rgba(0, 0, 0, 0.1);
        --ts-base-00-alpha-02-color: rgba(0, 0, 0, 0.2);
        --ts-base-00-alpha-05-color: rgba(0, 0, 0, 0.5);
        --ts-base-00-alpha-09-color: rgba(0, 0, 0, 0.9);

        /* Alpha Variants for Base 100 (White) */
        --ts-base-100-alpha-005-color: rgba(255, 255, 255, 0.05);
        --ts-base-100-alpha-01-color: rgba(255, 255, 255, 0.1);
        --ts-base-100-alpha-02-color: rgba(255, 255, 255, 0.2);
        --ts-base-100-alpha-05-color: rgba(255, 255, 255, 0.5);
        --ts-base-100-alpha-09-color: rgba(255, 255, 255, 0.9);

        /* Default Theme Variables */
        --ts-primary-text-color: var(--ts-base-100-color);
        --ts-secondary-text-color: var(--ts-base-80-color);
        --ts-body-color: var(--ts-base-10-color);
        --ts-playerbar-color: var(--ts-base-20-color);
        
        /* Dynamic Palette Placeholders */
        --ts-palette-dominant-hex: #000000;
        --ts-palette-vibrant-hex: #000000;
        --ts-palette-muted-hex: #000000;
        --ts-palette-darkvibrant-hex: #000000;
        --ts-palette-darkmuted-hex: #000000;
        --ts-palette-lightvibrant-hex: #000000;
        --ts-palette-lightmuted-hex: #000000;
        
        /* Unified gradient variables */
        --ts-unified-gradient: linear-gradient(to bottom, #000000, #000000);

        /* Global overlay mode tuning */
        --ts-global-gradient-overlay-opacity: 0.55;
    }

    /* Styling Target Elements (Meniru perilaku ekstensi) */
    body {
        background: var(--ts-body-color) !important;
        color: var(--ts-primary-text-color) !important;
        transition: background 0.5s ease, color 0.5s ease;
        background-attachment: fixed !important;
    }

    ytmusic-player-bar {
        background: var(--ts-playerbar-color) !important;
        transition: background 0.5s ease;
    }

    /* nge-Fix Player bar bawaan ytMusic yang gak nyambung di sisi kanan */
    ytmusic-player-bar {
        width: 100% !important;
        right: 0 !important;
        left: 0 !important;
    }

    /* nge-Fix Player bar bawaan ytMusic yang gak nyambung di sisi kanan */
    ytmusic-app-layout > [slot="player-bar"],
    #player-bar-background {
        width: 100% !important;
        right: 0 !important;
    }

    /* Additional Transitions for Extended Styling */
    ytmusic-app-layout > [slot="nav-bar"],
    #nav-bar-background {
        transition: background 0.5s ease !important;
    }
    
    ytmusic-player-page {
        transition: background 0.5s ease !important;
    }
    
    ytmusic-player-queue {
        transition: background 0.5s ease !important;
    }

    /* Prevent hidden browse/home layer from contributing scrollbars in player mode.
       YT Music keeps #content (browse) in DOM and often only toggles visibility.
       If it's scrollable, it can still show a scrollbar behind the player page.
    */
    html.ts-player-page-open ytmusic-app #content[slot="content"] {
        display: none !important;
    }

    /* Scrollbar Styling (Global)
       Agar tampilan konsisten, kita juga warnai scrollbar sesuai tema.
    */
    html::-webkit-scrollbar,
    body::-webkit-scrollbar,
    ytmusic-app::-webkit-scrollbar,
    ytmusic-app *::-webkit-scrollbar {
        width: 10px;
        background: var(--ts-base-00-alpha-01-color);
    }
    html::-webkit-scrollbar-thumb,
    body::-webkit-scrollbar-thumb,
    ytmusic-app::-webkit-scrollbar-thumb,
    ytmusic-app *::-webkit-scrollbar-thumb {
        background: var(--ts-palette-vibrant-hex);
        border-radius: 5px;
    }
    `;
}

function injectBaseStyles() {
    const styleId = 'ts-base-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = getBaseCss();
    document.head.appendChild(style);
}

// ============================================================================
// 2. SCRAPER & ANALYZER (The "Brain")
// ============================================================================

function getSongInfo() {
    // 1. MediaSession API (Sumber Terbaik)
    // API standar browser modern yang dipakai Spotify/Youtube untuk nampilin info di Lock Screen HP/Windows.
    // Kita ambil dari sini karena datanya paling bersih dan resolusi gambarnya biasanya paling tinggi.
    if (navigator.mediaSession && navigator.mediaSession.metadata) {
        const md = navigator.mediaSession.metadata;

        // Cari gambar dengan resolusi terbesar. 
        // Metadata artwork biasanya array dengan berbagai ukuran. Kita sort descending.
        const artwork = md.artwork && md.artwork.length > 0
            ? [...md.artwork].sort((a, b) => parseInt(b.sizes?.split('x')[0] || 0) - parseInt(a.sizes?.split('x')[0] || 0))[0].src
            : null;

        return {
            title: md.title,
            artist: md.artist,
            album: md.album,
            artwork: artwork
        };
    }

    // 2. DOM Fallback (Cara Manual)
    // Kalau MediaSession belum siap (misal baru load), kita 'ngintip' elemen HTML langsung.
    // Selector ini ('ytmusic-player-bar .title') spesifik struktur HTML YouTube Music.
    const titleEl = document.querySelector("ytmusic-player-bar .title");
    const artistEl = document.querySelector("ytmusic-player-bar .byline");
    const imgEl = document.querySelector(".middle-controls .thumbnail-image-wrapper img");

    return {
        title: titleEl ? titleEl.textContent : '',
        artist: artistEl ? artistEl.textContent : '',
        album: '',
        artwork: imgEl ? imgEl.src : null
    };
}

async function extractColors(imageUrl) {
    if (!imageUrl) return null;
    try {
        if (typeof Vibrant === 'undefined') {
            console.warn("Vibrant.js not found.");
            return null;
        }
        // Quality 1 is used in original code for best results
        return await Vibrant.from(imageUrl).quality(1).getPalette();
    } catch (e) {
        console.error("Color extraction failed:", e);
        return null;
    }
}

// ============================================================================
// 3. STYLER & COMMUNICATOR (The "Action")
// ============================================================================

function applyDynamicTheme(palette) {
    if (!palette) return;
    if (dynamicThemeDisabled) return;

    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);
    const unset = (k) => root.style.removeProperty(k);

    // Get current theme mode (default to 'default')
    // Back-compat: old config may still send 'unified' (removed). Treat it as 'overlay'.
    const requestedMode = window.DYNAMIC_THEME_MODE;
    const themeMode = (requestedMode === 'unified') ? 'overlay' : (requestedMode || 'default');
    console.log('[DynamicTheme] Applying theme with mode:', themeMode);

    // Always reset mode-specific YTM variables first.
    // These are used by YT Music's own CSS; if we leave them set from a previous mode,
    // switching modes will cause visual "identity mixing".
    unset('--ytmusic-nav-bar');
    unset('--ytmusic-player-page-background');

    // Set Raw Palette Variables
    if (palette.Vibrant) set('--ts-palette-vibrant-hex', palette.Vibrant.getHex());
    if (palette.Muted) set('--ts-palette-muted-hex', palette.Muted.getHex());
    if (palette.DarkVibrant) set('--ts-palette-darkvibrant-hex', palette.DarkVibrant.getHex());
    if (palette.DarkMuted) set('--ts-palette-darkmuted-hex', palette.DarkMuted.getHex());
    if (palette.LightVibrant) set('--ts-palette-lightvibrant-hex', palette.LightVibrant.getHex());
    if (palette.LightMuted) set('--ts-palette-lightmuted-hex', palette.LightMuted.getHex());

    // Determine Dominant Color (Logic from themesong: DarkVibrant usually preferred for BG)
    const dominant = palette.DarkVibrant || palette.DarkMuted || palette.Vibrant;
    if (dominant) {
        set('--ts-palette-dominant-hex', dominant.getHex());

        // --- LOGIKA GRADIEN UTAMA ---
        // Kita ambil dua warna utama: Primer & Sekunder.
        // Primer: Biasanya warna 'Vibrant' (mencolok) atau Muted kalau gambar kurang berwarna.
        // Sekunder: Pendukung, biasanya DarkMuted untuk kontras.
        const primaryColor = palette.DarkVibrant ? palette.DarkVibrant.getHex() : (palette.Muted ? palette.Muted.getHex() : '#000000');
        const secondaryColor = palette.DarkMuted ? palette.DarkMuted.getHex() : (palette.DarkVibrant ? palette.DarkVibrant.getHex() : '#000000');

        // Gradien default yang bisa dipakai berbagai komponen
        const unifiedGradient = `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
        set('--ts-unified-gradient', unifiedGradient);

        if (themeMode === 'overlay') {
            // === MODE OVERLAY: Overlay gradien global tunggal (non-destruktif) ===
            // Tujuan: membuat tampilan *seperti* satu gradien kontinu di seluruh UI
            // tanpa memaksa kontainer YTM menjadi transparan.
            console.log('[DynamicTheme] Applying OVERLAY gradient mode');

            // Hapus style mode unified legacy jika ada
            const unifiedStyle = document.getElementById('ts-unified-mode-styles');
            if (unifiedStyle) unifiedStyle.remove();
            const harmonyStyle = document.getElementById('ts-harmony-mode-styles');
            if (harmonyStyle) harmonyStyle.remove();
            const optStyle = document.getElementById('ts-default-optimized-styles');
            if (optStyle) optStyle.remove();
            const seamlessStyle = document.getElementById('ts-seamless-mode-styles');
            if (seamlessStyle) seamlessStyle.remove();

            // Jaga background dasar tetap stabil; biarkan overlay memberikan nuansa gradien dinamis.
            // Ini sengaja dibuat konservatif untuk menghindari kerusakan background asli YT Music.
            set('--ts-body-color', '#030303');
            set('--ts-playerbar-color', 'rgba(0, 0, 0, 0.25)');

            const styleId = 'ts-overlay-mode-styles';
            let overlayStyle = document.getElementById(styleId);
            if (!overlayStyle) {
                overlayStyle = document.createElement('style');
                overlayStyle.id = styleId;
                document.head.appendChild(overlayStyle);
            }

            overlayStyle.textContent = `
                /* Mode Overlay - gradien mulus tunggal di seluruh aplikasi */
                body { 
                    isolation: isolate;
                }

                /* Fallback: Overlay polos halus */
                body::after {
                    content: '';
                    position: fixed; /* Fixed position biar ga ikut scroll -> Performa tinggi */
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: var(--ts-unified-gradient) !important;
                    opacity: 0.18;
                    pointer-events: none; /* Klik tembus ke elemen di bawahnya */
                    z-index: 2147483646; /* Z-index tinggi biar di atas segalanya */
                }

                /* Gunakan blend untuk tint yang lebih natural (tidak "menghapus" background yang ada) */
                @supports (mix-blend-mode: soft-light) {
                    body::after {
                        mix-blend-mode: soft-light;
                        opacity: var(--ts-global-gradient-overlay-opacity);
                    }
                }
            `;

        } else if (themeMode === 'default-optimized') {
            // === MODE DEFAULT OPTIMIZED: Performa Tinggi ===
            // Masalah di mode Default biasa: Gradient dipasang di `body`.
            // Saat user scroll daftar lagu, browser harus menggambar ulang (repaint) gradient background setiap frame.
            // Ini berat.

            // Solusi: Kita pasang gradient di `body::before` dengan `position: fixed`.
            // Karena fixed, dia punya layer sendiri dan tidak perlu digambar ulang saat konten di atasnya discroll.
            console.log('[DynamicTheme] Applying DEFAULT-OPTIMIZED gradient mode');

            // Hapus style mode lain
            const overlayStyleEl = document.getElementById('ts-overlay-mode-styles');
            if (overlayStyleEl) overlayStyleEl.remove();
            const unifiedStyleEl = document.getElementById('ts-unified-mode-styles');
            if (unifiedStyleEl) unifiedStyleEl.remove();
            const harmonyStyleEl = document.getElementById('ts-harmony-mode-styles');
            if (harmonyStyleEl) harmonyStyleEl.remove();
            const seamlessStyleEl = document.getElementById('ts-seamless-mode-styles');
            if (seamlessStyleEl) seamlessStyleEl.remove();

            // Warna untuk gradien (sama seperti default)
            const playerBarColor = palette.Muted ? palette.Muted.getHex() : primaryColor;

            // Set variabel dasar - body dijaga gelap, gradien via pseudo-element
            set('--ts-body-color', '#0a0a0a');
            set('--ts-playerbar-color', playerBarColor);

            // Variabel khusus untuk mode ini
            set('--ts-opt-primary', primaryColor);
            set('--ts-opt-secondary', secondaryColor);
            set('--ts-opt-playerbar', playerBarColor);

            const styleId = 'ts-default-optimized-styles';
            let optStyle = document.getElementById(styleId);
            if (!optStyle) {
                optStyle = document.createElement('style');
                optStyle.id = styleId;
                document.head.appendChild(optStyle);
            }

            // Teknik: Pakai pseudo-element dengan position fixed untuk gradien utama
            // Ini jauh lebih ringan karena browser tidak perlu repaint gradien saat scroll
            optStyle.textContent = `
                /* Mode Default Optimized - gradien ringan tanpa repaint saat scroll */
                
                /* Layer gradien utama via pseudo-element - tidak ikut scroll = no repaint */
                body::before {
                    content: '';
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(to bottom, var(--ts-opt-primary), var(--ts-opt-secondary));
                    z-index: -1;
                    pointer-events: none;
                }

                /* Pastikan body sendiri transparent agar pseudo-element terlihat */
                body {
                    background: transparent !important;
                }

                /* Player bar tetap solid untuk performa */
                ytmusic-player-bar {
                    background: var(--ts-opt-playerbar) !important;
                }

                /* Nav bar mengikuti warna primer */
                ytmusic-app-layout > [slot="nav-bar"],
                #nav-bar-background {
                    background: var(--ts-opt-primary) !important;
                }

                /* Player page full screen - gradien radial tapi via pseudo bukan langsung */
                ytmusic-player-page {
                    position: relative;
                    background: transparent !important;
                }
                
                ytmusic-player-page::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: radial-gradient(circle at center, var(--ts-opt-primary), var(--ts-opt-secondary));
                    z-index: -1;
                    pointer-events: none;
                }

                /* Queue panel dan elemen terkait - transparent agar gradien body terlihat tembus */
                ytmusic-player-queue,
                ytmusic-player-queue #contents,
                ytmusic-player-queue ytmusic-tab-renderer,
                ytmusic-player-queue #tab-content {
                    background: transparent !important;
                }

                /* Elemen kontainer utama YTM juga harus transparent */
                ytmusic-app,
                ytmusic-app-layout,
                #content.ytmusic-app,
                ytmusic-browse-response {
                    background: transparent !important;
                }

                /* === MOBILE/SMARTPHONE LAYOUT === */
                /* Player page mobile view - transparent */
                ytmusic-player-page,
                ytmusic-player-page #main-panel,
                ytmusic-player-page #player-page-content,
                ytmusic-player-page .player-page,
                ytmusic-player-page .content,
                ytmusic-player-page #song-media-window,
                ytmusic-player-page #song-video {
                    background: transparent !important;
                }

                /* Tab bar di bawah (次のコンテンツ, 歌詞, 関連コンテンツ) */
                ytmusic-player-page ytmusic-pivot-bar-renderer,
                ytmusic-player-page #tabs,
                ytmusic-player-page #tabsContent,
                ytmusic-player-page #tab-bar,
                ytmusic-player-page paper-tabs {
                    background: transparent !important;
                }

                /* Controls area - transparent */
                ytmusic-player-page #player-controls,
                ytmusic-player-page .player-controls-container,
                ytmusic-player-page #progress-bar,
                ytmusic-player-page .time-info {
                    background: transparent !important;
                }

                /* Song info area di mobile */
                ytmusic-player-page .song-info,
                ytmusic-player-page #song-info,
                ytmusic-player-page .middle-controls {
                    background: transparent !important;
                }
            `;

            // Set juga variabel YTM native untuk konsistensi
            set('--ytmusic-nav-bar', primaryColor);

            // PENTING: Set variabel native YTM untuk player page (termasuk mobile view)
            // Ini yang membuat mode Default dan Harmony bisa styling mobile
            const playerPageGradient = `linear-gradient(to bottom, ${primaryColor}, ${secondaryColor})`;
            set('--ytmusic-player-page-background', playerPageGradient);

        } else if (themeMode === 'seamless') {
            // === MODE SEAMLESS: Tampilan Menyatu ===
            // Ide utamanya adalah transparansi total.
            // Kita bikin Navbar, PlayerBar, dan ContentPanel jadi 'transparent'.
            // Lalu kita taruh satu background gradient besar di belakang semuanya (`body::before`).
            // Hasilnya: Tidak ada garis pemisah kaku antar komponen. UI terlihat "mengambang".
            console.log('[DynamicTheme] Applying SEAMLESS gradient mode');

            // Hapus style mode lain
            const overlayStyleEl = document.getElementById('ts-overlay-mode-styles');
            if (overlayStyleEl) overlayStyleEl.remove();
            const unifiedStyleEl = document.getElementById('ts-unified-mode-styles');
            if (unifiedStyleEl) unifiedStyleEl.remove();
            const harmonyStyleEl = document.getElementById('ts-harmony-mode-styles');
            if (harmonyStyleEl) harmonyStyleEl.remove();
            const optStyleEl = document.getElementById('ts-default-optimized-styles');
            if (optStyleEl) optStyleEl.remove();

            // Set variabel dasar - body dijaga transparent
            set('--ts-body-color', 'transparent');
            set('--ts-playerbar-color', 'transparent');

            // Variabel khusus untuk mode ini
            set('--ts-seamless-primary', primaryColor);
            set('--ts-seamless-secondary', secondaryColor);

            const styleId = 'ts-seamless-mode-styles';
            let seamlessStyle = document.getElementById(styleId);
            if (!seamlessStyle) {
                seamlessStyle = document.createElement('style');
                seamlessStyle.id = styleId;
                document.head.appendChild(seamlessStyle);
            }

            seamlessStyle.textContent = `
                /* Mode Seamless - gradien tembus di seluruh UI */
                
                /* Layer gradien utama via pseudo-element */
                body::before {
                    content: '';
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: linear-gradient(to bottom, var(--ts-seamless-primary), var(--ts-seamless-secondary));
                    z-index: -1;
                    pointer-events: none;
                }

                /* SEMUA elemen harus transparent agar gradien tembus */
                body,
                ytmusic-app,
                ytmusic-app-layout,
                #content.ytmusic-app,
                ytmusic-browse-response {
                    background: transparent !important;
                }

                /* Nav bar dan sidebar background - TRANSPARENT, gradien tembus */
                ytmusic-app-layout > [slot="nav-bar"],
                #nav-bar-background,
                #mini-guide-background,
                #mini-guide,
                #mini-guide-spacer {
                    background: transparent !important;
                }

                /* Sidebar/Guide yang di-expand - TRANSPARENT */
                tp-yt-app-drawer,
                tp-yt-app-drawer #contentContainer,
                tp-yt-app-drawer #scrim,
                #guide-wrapper,
                #guide-spacer,
                #guide-content,
                ytmusic-guide-renderer,
                ytmusic-guide-renderer #sections {
                    background: transparent !important;
                }

                /* Player bar background - TRANSPARENT */
                #player-bar-background {
                    background: transparent !important;
                }

                /* Player bar - TRANSPARENT dengan sedikit blur untuk keterbacaan */
                ytmusic-player-bar {
                    background: rgba(0, 0, 0, 0.15) !important;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                }

                /* Player page full screen - TRANSPARENT */
                ytmusic-player-page {
                    background: transparent !important;
                }

                /* Queue panel dan child-nya - TRANSPARENT */
                ytmusic-player-queue,
                ytmusic-player-queue #contents,
                ytmusic-player-queue ytmusic-tab-renderer,
                ytmusic-player-queue #tab-content {
                    background: transparent !important;
                }

                /* Tab bar dan headers - transparent */
                ytmusic-pivot-bar-renderer,
                ytmusic-header-renderer {
                    background: transparent !important;
                }

                /* === MOBILE/SMARTPHONE LAYOUT === */
                /* Player page mobile view - transparent */
                ytmusic-player-page,
                ytmusic-player-page #main-panel,
                ytmusic-player-page #player-page-content,
                ytmusic-player-page .player-page,
                ytmusic-player-page .content,
                ytmusic-player-page #song-media-window,
                ytmusic-player-page #song-video {
                    background: transparent !important;
                }

                /* Tab bar di bawah (次のコンテンツ, 歌詞, 関連コンテンツ) */
                ytmusic-player-page ytmusic-pivot-bar-renderer,
                ytmusic-player-page #tabs,
                ytmusic-player-page #tabsContent,
                ytmusic-player-page #tab-bar,
                ytmusic-player-page paper-tabs {
                    background: transparent !important;
                }

                /* Controls area - transparent */
                ytmusic-player-page #player-controls,
                ytmusic-player-page .player-controls-container,
                ytmusic-player-page #progress-bar,
                ytmusic-player-page .time-info {
                    background: transparent !important;
                }

                /* Song info area di mobile */
                ytmusic-player-page .song-info,
                ytmusic-player-page #song-info,
                ytmusic-player-page .middle-controls {
                    background: transparent !important;
                }

                /* Sedikit shadow pada teks untuk keterbacaan di atas gradien */
                .title, .subtitle, .byline, 
                ytmusic-player-bar .title,
                ytmusic-player-bar .byline {
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
                }
            `;

            // Set variabel YTM native untuk mobile view
            // Pada mode seamless, kita ingin gradien tembus, jadi gunakan gradien yang sama
            const seamlessPlayerPageGradient = `linear-gradient(to bottom, var(--ts-seamless-primary), var(--ts-seamless-secondary))`;
            set('--ytmusic-player-page-background', seamlessPlayerPageGradient);

            // Nav bar biarkan transparent
            unset('--ytmusic-nav-bar');

        } else if (themeMode === 'harmony') {
            // === MODE HARMONY: Sistem gradien multi-layer yang kohesif ===
            // aliran warna yang harmonis dan terpadu di seluruh elemen UI
            // menggunakan color blending dan gradien komplementer.
            console.log('[DynamicTheme] Applying HARMONY gradient mode');

            // Hapus style mode lain
            const overlayStyleEl = document.getElementById('ts-overlay-mode-styles');
            if (overlayStyleEl) overlayStyleEl.remove();
            const unifiedStyleEl = document.getElementById('ts-unified-mode-styles');
            if (unifiedStyleEl) unifiedStyleEl.remove();
            const optStyleEl = document.getElementById('ts-default-optimized-styles');
            if (optStyleEl) optStyleEl.remove();
            const seamlessStyleEl = document.getElementById('ts-seamless-mode-styles');
            if (seamlessStyleEl) seamlessStyleEl.remove();

            // --- Algoritma Pencampuran Warna (Harmony) ---
            // Bangun Palet Warna Harmony yang lebih soft.
            // Kita prioritaskan warna Muted untuk background agar teks (biasanya putih) lebih mudah dibaca.
            const harmonyPrimary = palette.DarkMuted ? palette.DarkMuted.getHex() : primaryColor;
            const harmonySecondary = palette.Muted ? palette.Muted.getHex() : secondaryColor;

            // Accent color untuk highlight elemen kecil
            const harmonyAccent = palette.Vibrant ? palette.Vibrant.getHex() : harmonyPrimary;
            const harmonyLight = palette.LightMuted ? palette.LightMuted.getHex() : '#3a3a3a';
            const harmonyDark = palette.DarkVibrant ? palette.DarkVibrant.getHex() : '#0a0a0a';

            // Helper function untuk mencampur (interpolate) dua warna Hex.
            // Mirip function `mix()` di SCSS.
            const blendColors = (hex1, hex2, ratio = 0.5) => {
                const r1 = parseInt(hex1.slice(1, 3), 16);
                const g1 = parseInt(hex1.slice(3, 5), 16);
                const b1 = parseInt(hex1.slice(5, 7), 16);
                const r2 = parseInt(hex2.slice(1, 3), 16);
                const g2 = parseInt(hex2.slice(3, 5), 16);
                const b2 = parseInt(hex2.slice(5, 7), 16);
                const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
                const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
                const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
                return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            };

            const harmonyMidpoint = blendColors(harmonyPrimary, harmonySecondary, 0.5);
            const harmonySubtle = blendColors(harmonyDark, harmonyPrimary, 0.3);

            // Set variabel CSS untuk mode harmony
            set('--ts-harmony-primary', harmonyPrimary);
            set('--ts-harmony-secondary', harmonySecondary);
            set('--ts-harmony-accent', harmonyAccent);
            set('--ts-harmony-light', harmonyLight);
            set('--ts-harmony-dark', harmonyDark);
            set('--ts-harmony-midpoint', harmonyMidpoint);
            set('--ts-harmony-subtle', harmonySubtle);

            // Body menggunakan gradien 3-stop halus yang mengalir diagonal
            const bodyHarmonyGradient = `linear-gradient(160deg, 
                ${harmonyDark} 0%, 
                ${harmonyPrimary} 35%, 
                ${harmonyMidpoint} 65%, 
                ${harmonySecondary} 100%)`;
            set('--ts-body-color', bodyHarmonyGradient);

            // Player bar menggunakan gradien horizontal komplementer
            const playerBarHarmonyGradient = `linear-gradient(90deg, 
                ${blendColors(harmonyPrimary, '#000000', 0.4)} 0%, 
                ${blendColors(harmonyMidpoint, '#000000', 0.3)} 50%,
                ${blendColors(harmonySecondary, '#000000', 0.4)} 100%)`;
            set('--ts-playerbar-color', playerBarHarmonyGradient);

            // Nav bar melanjutkan aliran warna
            set('--ytmusic-nav-bar', blendColors(harmonyDark, harmonyPrimary, 0.6));

            // Player page menggunakan gradien radial yang menggemakan tema utama
            const playerPageHarmonyGradient = `radial-gradient(ellipse at 30% 20%, 
                ${harmonyPrimary} 0%, 
                ${harmonyMidpoint} 40%, 
                ${harmonyDark} 100%)`;
            set('--ytmusic-player-page-background', playerPageHarmonyGradient);

            // Buat gradien terpadu untuk penggunaan bersama
            const harmonyUnifiedGradient = `linear-gradient(135deg, 
                ${harmonyPrimary} 0%, 
                ${harmonyMidpoint} 50%, 
                ${harmonySecondary} 100%)`;
            set('--ts-unified-gradient', harmonyUnifiedGradient);

            const styleId = 'ts-harmony-mode-styles';
            let harmonyStyleEl = document.getElementById(styleId);
            if (!harmonyStyleEl) {
                harmonyStyleEl = document.createElement('style');
                harmonyStyleEl.id = styleId;
                document.head.appendChild(harmonyStyleEl);
            }

            harmonyStyleEl.textContent = `
                /* Mode Harmony - sistem gradien multi-layer yang kohesif */
                
                /* Background attachment halus untuk aliran kontinu */
                body {
                    background-attachment: fixed !important;
                    background-size: 100% 100% !important;
                }

                /* Nav bar menyatu mulus dengan gradien body */
                ytmusic-app-layout > [slot="nav-bar"],
                #nav-bar-background {
                    background: linear-gradient(180deg, 
                        var(--ts-harmony-dark) 0%, 
                        transparent 100%) !important;
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }

                /* Player bar dengan efek glass-morphism */
                ytmusic-player-bar {
                    backdrop-filter: blur(20px) saturate(1.2) !important;
                    -webkit-backdrop-filter: blur(20px) saturate(1.2) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
                }

                /* Player page mewarisi aliran harmony */
                ytmusic-player-page {
                    background: var(--ytmusic-player-page-background) !important;
                    background-attachment: fixed !important;
                }

                /* Panel queue menjaga koherensi visual */
                ytmusic-player-queue {
                    background: linear-gradient(180deg,
                        var(--ts-harmony-subtle) 0%,
                        rgba(0, 0, 0, 0.85) 100%) !important;
                    backdrop-filter: blur(15px) !important;
                    -webkit-backdrop-filter: blur(15px) !important;
                }

                /* Tab bar harmony */
                ytmusic-pivot-bar-renderer {
                    background: transparent !important;
                }

                /* Cards dan items mendapat tint harmony halus */
                ytmusic-two-row-item-renderer,
                ytmusic-responsive-list-item-renderer {
                    transition: background 0.3s ease, transform 0.2s ease !important;
                }

                ytmusic-two-row-item-renderer:hover,
                ytmusic-responsive-list-item-renderer:hover {
                    background: linear-gradient(135deg, 
                        rgba(255, 255, 255, 0.05) 0%, 
                        rgba(255, 255, 255, 0.02) 100%) !important;
                    transform: translateY(-2px);
                }

                /* Efek ambient glow halus */
                ytmusic-player-page::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: radial-gradient(circle at 50% 30%, 
                        var(--ts-harmony-accent) 0%, 
                        transparent 60%);
                    opacity: 0.08;
                    pointer-events: none;
                    z-index: 0;
                }

                /* Scrollbar harmony */
                html::-webkit-scrollbar-thumb,
                body::-webkit-scrollbar-thumb,
                ytmusic-app::-webkit-scrollbar-thumb,
                ytmusic-app *::-webkit-scrollbar-thumb {
                    background: linear-gradient(180deg,
                        var(--ts-harmony-accent) 0%,
                        var(--ts-harmony-secondary) 100%) !important;
                }

                /* Text shadow untuk kedalaman */
                .title, .subtitle, .byline {
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                }
            `;

        } else {
            // === MODE DEFAULT: Gradien per-elemen (perilaku asli) ===
            console.log('[DynamicTheme] Applying DEFAULT gradient mode');

            // Gradien Body
            const bodyGradient = `linear-gradient(to bottom, ${primaryColor}, ${secondaryColor})`;
            set('--ts-body-color', bodyGradient);

            // Player bar sedikit lebih terang/berbeda
            const playerBarColor = palette.Muted ? palette.Muted.getHex() : primaryColor;
            set('--ts-playerbar-color', playerBarColor);

            // Navigation Bar
            set('--ytmusic-nav-bar', primaryColor);

            // Background Player Full Screen - Gradien radial untuk efek spotlight
            const playerPageGradient = `radial-gradient(circle at center, ${primaryColor}, ${secondaryColor})`;
            set('--ytmusic-player-page-background', playerPageGradient);

            // Hapus style mode lain jika ada
            const unifiedStyle = document.getElementById('ts-unified-mode-styles');
            if (unifiedStyle) unifiedStyle.remove();
            const overlayStyle = document.getElementById('ts-overlay-mode-styles');
            if (overlayStyle) overlayStyle.remove();
            const harmonyStyle = document.getElementById('ts-harmony-mode-styles');
            if (harmonyStyle) harmonyStyle.remove();
            const optStyle = document.getElementById('ts-default-optimized-styles');
            if (optStyle) optStyle.remove();
            const seamlessStyle = document.getElementById('ts-seamless-mode-styles');
            if (seamlessStyle) seamlessStyle.remove();
        }

        // --- Progress Bar (Slider) - Sama untuk semua mode ---
        if (palette.Vibrant) {
            const vibrantHex = palette.Vibrant.getHex();
            set('--paper-slider-active-color', vibrantHex);
            set('--paper-slider-knob-color', vibrantHex);
            set('--paper-slider-secondary-color', vibrantHex + '40'); // 25% opacity (Softer)
            set('--paper-slider-container-color', 'rgba(255,255,255,0.1)');
        }
    }
}

function notifyBackground(songInfo, palette) {

    const message = {
        notify: {
            songName: songInfo.title,
            songArtist: songInfo.artist,
            songImg: songInfo.artwork
        },
        iconColor: {
            // Data warna untuk ikon ekstensi dinamis
            lightDominant: palette.LightVibrant ? palette.LightVibrant.getHex() : '#ffffff',
            darkDominant: palette.DarkVibrant ? palette.DarkVibrant.getHex() : '#000000',
            secondary: palette.Vibrant ? palette.Vibrant.getHex() : '#ff0000'
        }
    };

    // Jika berjalan di lingkungan ekstensi
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message);
    } else {
        console.log("[Mock Background Message]", message);
    }
}

// ============================================================================
// 4. MAIN LOOP (The "Engine")
// ============================================================================

let currentArtworkUrl = '';
let themeObserver = null;
let playerUiObserver = null;
let dynamicThemeDisabled = false;

function syncPlayerPageOpenState() {
    const root = document.documentElement;

    // Full player page open: either the player-page has [player-page-open]
    // or the app layout indicates [player-page-open].
    const isOpen = !!(
        document.querySelector('ytmusic-player-page[player-page-open]') ||
        document.querySelector('ytmusic-app-layout[player-page-open]')
    );

    root.classList.toggle('ts-player-page-open', isOpen);
}

function initPlayerUiObserver() {
    if (dynamicThemeDisabled) {
        return;
    }
    if (playerUiObserver) {
        return;
    }

    const target = document.querySelector('ytmusic-app');
    if (!target) {
        setTimeout(initPlayerUiObserver, 1000);
        return;
    }

    // Keep initial state in sync.
    syncPlayerPageOpenState();

    // Observe attribute flips that indicate player-page open/close.
    const observer = new MutationObserver(() => {
        syncPlayerPageOpenState();
    });

    observer.observe(target, {
        subtree: true,
        attributes: true,
        attributeFilter: ['player-page-open', 'player-ui-state', 'style', 'hidden']
    });

    playerUiObserver = observer;
}

async function onSongChange() {
    if (dynamicThemeDisabled) return;
    const songInfo = getSongInfo();

    if (songInfo.artwork && songInfo.artwork !== currentArtworkUrl) {
        currentArtworkUrl = songInfo.artwork;
        console.log(`Now Playing: ${songInfo.title} by ${songInfo.artist}`);

        const palette = await extractColors(songInfo.artwork);
        if (palette) {
            applyDynamicTheme(palette);
            notifyBackground(songInfo, palette);
        }
    }
}

function initObserver() {
    if (dynamicThemeDisabled) {
        console.log('[DynamicTheme] initObserver skipped (disabled)');
        return;
    }
    if (themeObserver) {
        // Prevent duplicate observers if the script gets injected multiple times.
        return;
    }
    // Observer untuk mendeteksi perubahan di player bar (judul/artis/gambar)
    const target = document.querySelector("ytmusic-player-bar");
    if (!target) {
        setTimeout(initObserver, 1000);
        return;
    }

    const observer = new MutationObserver((mutations) => {
        // Debounce bisa ditambahkan di sini jika perlu
        onSongChange();
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'title', 'aria-label'] // Filter atribut relevan
    });

    themeObserver = observer;

    // Initial run
    onSongChange();
    console.log("Dynamic YTM Styling v2.0 Started");
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

// Global function to update theme mode and reapply
window.updateThemeMode = function (newMode) {
    const sanitizedMode = (newMode === 'unified') ? 'overlay' : newMode;
    console.log('[DynamicTheme] Updating theme mode to:', sanitizedMode);
    window.DYNAMIC_THEME_MODE = sanitizedMode;

    // Reapply theme with current artwork
    if (currentArtworkUrl) {
        extractColors(currentArtworkUrl).then(palette => {
            if (palette) {
                applyDynamicTheme(palette);
            }
        });
    }
};

// Global function to disable Dynamic Theme cleanly (no reload required)
window.disableDynamicTheme = function () {
    if (dynamicThemeDisabled) return;
    console.log('[DynamicTheme] Disabling Dynamic Theme...');
    dynamicThemeDisabled = true;

    // Force a fresh apply next time we're enabled (even if the same song is still playing)
    currentArtworkUrl = '';

    try {
        if (themeObserver) {
            themeObserver.disconnect();
            themeObserver = null;
        }
    } catch (e) {
        console.warn('[DynamicTheme] Failed to disconnect observer:', e);
    }

    try {
        if (playerUiObserver) {
            playerUiObserver.disconnect();
            playerUiObserver = null;
        }
    } catch (e) {
        console.warn('[DynamicTheme] Failed to disconnect UI observer:', e);
    }

    // Remove helper state class
    document.documentElement.classList.remove('ts-player-page-open');

    // Remove injected style tags
    const styleIds = ['ts-overlay-mode-styles', 'ts-unified-mode-styles', 'ts-harmony-mode-styles', 'ts-default-optimized-styles', 'ts-seamless-mode-styles', 'ts-base-styles'];
    for (const id of styleIds) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Clear all CSS variables we set inline (root.style)
    const root = document.documentElement;
    const removeVar = (k) => root.style.removeProperty(k);

    const varsToClear = [
        '--ts-primary-text-color',
        '--ts-secondary-text-color',
        '--ts-body-color',
        '--ts-playerbar-color',

        '--ts-palette-dominant-hex',
        '--ts-palette-vibrant-hex',
        '--ts-palette-muted-hex',
        '--ts-palette-darkvibrant-hex',
        '--ts-palette-darkmuted-hex',
        '--ts-palette-lightvibrant-hex',
        '--ts-palette-lightmuted-hex',

        '--ts-unified-gradient',

        // Harmony mode variables
        '--ts-harmony-primary',
        '--ts-harmony-secondary',
        '--ts-harmony-accent',
        '--ts-harmony-light',
        '--ts-harmony-dark',
        '--ts-harmony-midpoint',
        '--ts-harmony-subtle',

        // Default-optimized mode variables
        '--ts-opt-primary',
        '--ts-opt-secondary',
        '--ts-opt-playerbar',

        // Seamless mode variables
        '--ts-seamless-primary',
        '--ts-seamless-secondary',

        '--paper-slider-active-color',
        '--paper-slider-knob-color',
        '--paper-slider-secondary-color',
        '--paper-slider-container-color',

        '--ytmusic-nav-bar',
        '--ytmusic-player-page-background'
    ];

    for (const v of varsToClear) removeVar(v);

    // Also clear mode state (so re-enable can set it again)
    try {
        delete window.DYNAMIC_THEME_MODE;
    } catch (_) {
        window.DYNAMIC_THEME_MODE = undefined;
    }
};

// Optional: allow re-enabling without reload
window.enableDynamicTheme = function (mode = 'default') {
    const sanitizedMode = (mode === 'unified') ? 'overlay' : mode;
    console.log('[DynamicTheme] Enabling Dynamic Theme...');
    dynamicThemeDisabled = false;
    window.DYNAMIC_THEME_MODE = sanitizedMode;

    injectBaseStyles();
    initPlayerUiObserver();
    initObserver();

    // If we're already running, prefer updating mode + forcing a reapply.
    if (typeof window.updateThemeMode === 'function') {
        window.updateThemeMode(sanitizedMode);
    } else {
        onSongChange();
    }
};

(function () {
    injectBaseStyles();
    initPlayerUiObserver();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }

    // Marker for host-side injection guards
    try {
        window.__gapDynamicThemeLoaded = true;
        window.__gapDynamicThemeVersion = '2.1';
    } catch (_) { }
})();
