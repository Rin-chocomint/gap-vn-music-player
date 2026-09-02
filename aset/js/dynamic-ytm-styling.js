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
// 0. PENJAGA HOST
// Skrip ini disuntikkan oleh aplikasi ke APA PUN yang sedang dimuat webview,
// bukan hanya ke YouTube Music. Saat pengguna menekan "Masuk", webview pindah ke
// accounts.google.com, dan tanpa penjaga ini gaya kita ikut terpasang di sana:
// #ts-game-bg menutupi satu layar penuh, body dibuat transparan, dan panel
// kecepatan (z-index 999999) mengambang di atas formulir. Halaman loginnya jadi
// tidak bisa dipakai.
//
// Semua pintu masuk publik (bootstrap, enableDynamicTheme, applyDynamicTheme)
// lewat sini dulu. Menjaganya di satu tempat lebih aman daripada mengandalkan
// sisi host, karena injeksinya dipicu dari beberapa lifecycle webview sekaligus.
// ============================================================================

const TS_HOST_DIDUKUNG = ['music.youtube.com'];

function isHostDidukung() {
    try {
        return TS_HOST_DIDUKUNG.indexOf(location.hostname) !== -1;
    } catch (_) {
        return false;
    }
}

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

       Kekecualian 'ts-player-exiting': saat preset Game Lobby memutar animasi
       keluar halaman browse, #content harus tetap ter-render sebentar — animasi
       CSS tidak pernah mulai dari display:none.
    */
    html.ts-player-page-open:not(.ts-player-exiting) ytmusic-app #content[slot="content"] {
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
// 2b. PANEL INFO "GAME LOBBY" (UI MOD)
// Panel DOM kecil bergaya panel info beatmap di song-select game!:
// badge status, judul besar, artis, pill aksen, dan kolom statistik bergaris.
// Semua datanya nyata (judul/artis/album/durasi) — bukan gamifikasi.
// ============================================================================

function renderGameInfoPanel() {
    try {
        const songInfo = getSongInfo();
        let panel = document.getElementById('ts-game-info-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ts-game-info-panel';
            panel.innerHTML = `
                <div class="ts-game-badge">SEDANG DIPUTAR</div>
                <div class="ts-game-title"></div>
                <div class="ts-game-artist"></div>
                <div class="ts-game-meta">
                    <span class="ts-game-star-pill">♪</span>
                    <span class="ts-game-meta-text"></span>
                </div>
                <div class="ts-game-stats">
                    <div class="ts-game-stat">
                        <div class="ts-game-stat-label">Artis</div>
                        <div class="ts-game-stat-value" data-stat="artist">—</div>
                    </div>
                    <div class="ts-game-stat">
                        <div class="ts-game-stat-label">Album</div>
                        <div class="ts-game-stat-value" data-stat="album">—</div>
                    </div>
                    <div class="ts-game-stat">
                        <div class="ts-game-stat-label">Durasi</div>
                        <div class="ts-game-stat-value" data-stat="duration">—</div>
                    </div>
                </div>`;
            document.body.appendChild(panel);
        }

        const setText = (sel, v) => {
            const el = panel.querySelector(sel);
            if (el) el.textContent = v;
        };

        setText('.ts-game-title', songInfo.title || '—');
        setText('.ts-game-artist', songInfo.artist || '');
        setText('.ts-game-meta-text', songInfo.album
            ? `dari album「${songInfo.album}」`
            : (songInfo.artist ? `oleh ${songInfo.artist}` : ''));
        setText('[data-stat="artist"]', songInfo.artist || '—');
        setText('[data-stat="album"]', songInfo.album || '—');

        // Durasi diambil dari time-info player bar ("0:42 / 3:36" -> "3:36").
        const applyDuration = () => {
            const t = document.querySelector('ytmusic-player-bar .time-info');
            const parts = t ? t.textContent.split('/') : [];
            if (parts.length > 1 && parts[1].trim()) {
                setText('[data-stat="duration"]', parts[1].trim());
            }
        };
        applyDuration();
        // Saat lagu baru saja berganti, time-info sering belum termuat — coba sekali lagi.
        setTimeout(() => {
            if (document.documentElement.classList.contains('ts-game-lobby-uimod')) applyDuration();
        }, 1500);

        // Mainkan ulang animasi masuk tiap ganti lagu.
        replayGamePanelIn();
    } catch (e) {
        console.warn('[DynamicTheme] Gagal merender panel info game:', e);
    }
}

// Putar ulang animasi masuk panel info.
// Dipakai saat ganti lagu DAN saat berpindah ke/dari player page: di sana panel
// berpindah posisi (kiri-atas <-> terpusat di bawah artwork), jadi tanpa replay
// ini posisinya cuma melompat begitu saja.
function replayGamePanelIn() {
    const panel = document.getElementById('ts-game-info-panel');
    if (!panel) return;
    panel.classList.remove('ts-game-panel-in');
    void panel.offsetWidth;   // paksa reflow => animasi benar-benar diputar ulang
    panel.classList.add('ts-game-panel-in');
}

// ============================================================================
// 2c. CERMIN TOMBOL GUIDE -> NAVBAR (UI MOD "GAME LOBBY")
// Membuat deretan tombol di navbar yang MENCERMINKAN entri guide
// (Beranda/Eksplorasi/Koleksi/Upgrade), tombol "Playlist baru", dan playlist.
//
// KENAPA "cermin", bukan memindah node asli?
//   Versi awal MEMINDAH node Polymer asli ke navbar. Masalahnya, saat pengguna
//   berpindah halaman, YTM me-render ulang (re-stamp) guide-nya; node yang kita
//   pindah jadi "diperebutkan" Polymer => layout navbar berantakan.
//   Solusi tahan banting: JANGAN sentuh node Polymer. Kita bikin <button> POLOS
//   sendiri (ikon = clone SVG dari entri asli) lalu teruskan klik ke entri asli.
//   Tombol polos tak pernah disentuh Polymer => layout SELALU rapi. Strip
//   dibangun ulang tiap selesai navigasi & saat guide berubah, jadi isinya
//   (termasuk state aktif) selalu sinkron.
//
// Tombol hamburger (#guide-button) & rel mini-guide kiri disembunyikan via CSS.
// ============================================================================

function pickPopulatedGuide() {
    // YTM punya DUA <ytmusic-guide-renderer>: '#guide-renderer' (laci penuh, sering
    // belum ter-render saat terlipat) & '#mini-guide-renderer' (rel mini, selalu
    // terisi saat terlipat). Pilih yang BENAR-BENAR berisi entri; utamakan mini.
    const hasEntries = (g) => g && g.querySelector('#sections ytmusic-guide-entry-renderer');
    const guides = document.querySelectorAll('ytmusic-guide-renderer');
    for (const g of guides) if (g.id === 'mini-guide-renderer' && hasEntries(g)) return g;
    for (const g of guides) if (hasEntries(g)) return g;
    return null;
}

let tsGuideIdSeq = 0;

function buildNavbarGuide() {
    if (!document.documentElement.classList.contains('ts-game-lobby-uimod')) return false;

    const leftContent = document.querySelector('ytmusic-nav-bar #left-content');
    const guide = pickPopulatedGuide();
    if (!leftContent || !guide) return false;

    const items = guide.querySelectorAll(
        '#sections ytmusic-guide-entry-renderer,' +
        '#sections ytmusic-guide-section-renderer #buttons yt-button-renderer'
    );
    if (!items.length) return false;

    let strip = document.getElementById('ts-game-navbar-guide');
    if (!strip) {
        strip = document.createElement('div');
        strip.id = 'ts-game-navbar-guide';
        // Sibling tepat di kanan #left-content (jangan di dalamnya — sering ke-clip).
        leftContent.insertAdjacentElement('afterend', strip);
    }

    // Tanda tangan isi strip: id unik tiap node guide ASLI, berurutan. Selama
    // Polymer tidak men-stamp ulang guide-nya (kasus paling umum saat sekadar
    // pindah halaman), tanda tangannya sama => strip TIDAK dibongkar-pasang.
    //
    // KENAPA PENTING: dulu strip selalu dibangun ulang dari nol tiap navigasi
    // (dan tiap ganti lagu), jadi deretan ikon navbar berkedip hilang-muncul
    // persis saat halaman sedang beranimasi — salah satu sumber rasa stutter.
    // Kalau tanda tangannya sama, cukup segarkan penanda entri aktifnya.
    const isActive = (o) => o.hasAttribute('active') || o.getAttribute('aria-current') === 'true';
    const sig = [];
    items.forEach((o) => {
        if (!o.__tsGuideId) o.__tsGuideId = ++tsGuideIdSeq;
        sig.push(o.__tsGuideId);
    });
    const sigStr = sig.join(',');

    if (strip.dataset.tsSig === sigStr && strip.children.length === items.length) {
        items.forEach((orig, i) => {
            const btn = strip.children[i];
            if (btn) btn.classList.toggle('ts-game-nav-active', isActive(orig));
        });
        document.documentElement.classList.add('ts-game-guide-relocated');
        return true;
    }

    // Isi guide benar-benar berubah => baru bangun ulang dari nol.
    strip.dataset.tsSig = sigStr;
    strip.textContent = '';

    items.forEach((orig) => {
        const title = (
            (orig.querySelector('.title') && orig.querySelector('.title').textContent) ||
            (orig.querySelector('.ytSpecButtonShapeNextButtonTextContent') && orig.querySelector('.ytSpecButtonShapeNextButtonTextContent').textContent) ||
            orig.getAttribute('aria-label') || ''
        ).trim();

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ts-game-nav-btn';
        if (title) { btn.title = title; btn.setAttribute('aria-label', title); }
        if (isActive(orig)) btn.classList.add('ts-game-nav-active');

        // Ikon = clone SVG dari entri asli HANYA untuk yang punya ikon khas:
        //   - .guide-icon          -> ikon nav (Beranda/Eksplorasi/Koleksi/Upgrade)
        //   - .ytSpecButtonShapeNextIcon -> "+" tombol "Playlist baru"
        // Entri playlist sengaja TIDAK pakai ikon play/badge-nya (semua sama),
        // melainkan INISIAL judul supaya tiap playlist bisa dibedakan.
        const svg = orig.querySelector('.guide-icon svg, .ytSpecButtonShapeNextIcon svg');
        if (svg) {
            btn.appendChild(svg.cloneNode(true));
        } else {
            const span = document.createElement('span');
            span.className = 'ts-game-nav-initial';
            span.textContent = (title.charAt(0) || '♪').toUpperCase();
            btn.appendChild(span);
        }

        // Teruskan klik ke entri ASLI (yang masih dikelola YTM) => navigasi tetap jalan.
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = orig.querySelector('a[href], button') ||
                orig.querySelector('tp-yt-paper-item') || orig;
            try { target.click(); } catch (_) { orig.click(); }
        });

        strip.appendChild(btn);
    });

    document.documentElement.classList.add('ts-game-guide-relocated');
    return true;
}

let guideMirrorObserver = null;
let guideMirrorNavHandler = null;

function relocateGuideButtonsToNavbar(retries = 12) {
    if (!document.documentElement.classList.contains('ts-game-lobby-uimod')) return;

    try {
        if (!buildNavbarGuide()) {
            // Navbar/guide belum termuat => coba lagi nanti.
            if (retries > 0) setTimeout(() => relocateGuideButtonsToNavbar(retries - 1), 700);
            return;
        }

        // Bangun ulang strip tiap selesai navigasi (supaya state aktif & isi sinkron).
        if (!guideMirrorNavHandler) {
            guideMirrorNavHandler = () => {
                if (!document.documentElement.classList.contains('ts-game-lobby-uimod')) return;
                // Beri jeda agar YTM sempat me-render guide & header halaman baru.
                // Header trapesium hanya boleh DIPERIKSA SEKALI per navigasi:
                // dulu kedua pass memanggilnya, dan pass ke-2 (900ms) melihat
                // header yang sama lalu memutar ULANG animasinya di tengah jalan
                // => banner channel terlihat "masuk, kedip, masuk lagi".
                let trapezoidDone = false;
                const pass = () => {
                    buildNavbarGuide();
                    if (!trapezoidDone) trapezoidDone = replayTrapezoidIfReused();
                    refreshGameCarouselCards();
                    updateGameCarouselCentered();
                };
                setTimeout(pass, 250);
                setTimeout(pass, 900);
            };
            document.addEventListener('yt-navigate-finish', guideMirrorNavHandler);
        }

        // Pantau guide untuk perubahan (re-stamp) di luar event navigasi.
        if (!guideMirrorObserver) {
            // HANYA pantau rel mini-guide. Fallback lama ke <ytmusic-app> berarti
            // memantau childList + attributes SELURUH aplikasi: callback-nya banjir
            // tiap Polymer men-stamp halaman baru, membebani main-thread persis
            // saat animasi transisi berjalan. Kalau rel-nya belum ada, biarkan —
            // relocateGuideButtonsToNavbar() dipanggil lagi tiap ganti lagu.
            const miniHost = document.querySelector('#mini-guide');
            if (miniHost) {
                let pending = null;
                guideMirrorObserver = new MutationObserver(() => {
                    if (pending) return;
                    pending = setTimeout(() => { pending = null; buildNavbarGuide(); }, 300);
                });
                // childList -> tangkap re-stamp guide; attribute active/aria-current
                // -> tangkap pergantian halaman aktif agar highlight ikut diperbarui.
                guideMirrorObserver.observe(miniHost, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['active', 'aria-current']
                });
            }
        }
    } catch (e) {
        console.warn('[DynamicTheme] Gagal membangun tombol guide navbar:', e);
    }
}

function restoreGuideButtons() {
    // Tombol kita cuma <button> polos => cukup buang strip-nya; tak ada node Polymer
    // yang perlu dikembalikan (entri asli tak pernah kita pindah).
    const strip = document.getElementById('ts-game-navbar-guide');
    if (strip) strip.remove();
    document.documentElement.classList.remove('ts-game-guide-relocated');

    if (guideMirrorNavHandler) {
        document.removeEventListener('yt-navigate-finish', guideMirrorNavHandler);
        guideMirrorNavHandler = null;
    }
    if (guideMirrorObserver) {
        try { guideMirrorObserver.disconnect(); } catch (_) { }
        guideMirrorObserver = null;
    }
    lastTrapezoidHeader = null;
}

// ----------------------------------------------------------------------------
// Animasi "in" trapesium banner channel.
// Header BARU (di-stamp ulang) otomatis memutar animasi CSS-nya saat dibuat.
// Tapi kalau YTM MEMAKAI-ULANG elemen header yang sama antar-channel, animasi
// CSS tak ikut main lagi — maka kita paksa replay di sini (reset 'animation'
// lalu reflow). Hanya untuk header yang dipakai-ulang, supaya header baru tak
// dobel main.
// ----------------------------------------------------------------------------
let lastTrapezoidHeader = null;

// Mengembalikan true kalau header channel-nya SUDAH ada (berarti urusan
// trapesium untuk navigasi ini selesai), false kalau belum ter-render — pemanggil
// boleh mencoba lagi di pass berikutnya.
function replayTrapezoidIfReused() {
    if (!document.documentElement.classList.contains('ts-game-lobby-uimod')) return false;
    const header = document.querySelector(
        'ytmusic-browse-response ytmusic-immersive-header-renderer,' +
        'ytmusic-browse-response ytmusic-visual-header-renderer'
    );
    if (!header) { lastTrapezoidHeader = null; return false; }

    if (header === lastTrapezoidHeader) {
        // Dipakai-ulang => putar ulang animasi CSS-nya.
        try {
            header.style.animation = 'none';
            void header.offsetWidth;      // paksa reflow
            header.style.animation = '';  // balik ke animasi dari stylesheet => replay
        } catch (_) { }
    }
    lastTrapezoidHeader = header;
    return true;
}

// ============================================================================
// 2d. CAROUSEL "SONG SELECT" — busur lebar + klik-ke-tengah (UI MOD GAME LOBBY)
// BUSUR sekarang 100% digerakkan CSS Scroll-Driven Animations:
//   animation-timeline: view(block) pada kartu => kompositor browser sendiri
//   yang menghitung scaleX dari posisi scroll. Zero JS per-frame.
// JS hanya perlu:
//   - Deteksi kartu paling dekat pusat viewport (untuk klik-ke-tengah).
//   - Refresh daftar kartu saat navigasi / lazy load.
// ============================================================================

let gameCarouselActive = false;
let gameCarouselCards = [];
let gameCarouselCenterCard = null;
let gameCarouselScroller = null;
let gameCarouselLastRefresh = 0;
let gameCarouselScrollHandler = null;
let gameCarouselClickHandler = null;
let gameCarouselRaf = 0;
let gameCarouselPendingCard = null;   // kartu yang baru saja "diluncurkan ke tengah"
let gameCarouselPendingAt = 0;

function isHomeBrowse(br) {
    if (!br) return false;
    const pt = br.getAttribute('page-type');
    if (pt && pt !== 'MUSIC_PAGE_TYPE_HOME') return false;
    if (br.querySelector('ytmusic-immersive-header-renderer')) return false;
    if (br.querySelector('ytmusic-visual-header-renderer')) return false;
    return true;
}

function refreshGameCarouselCards() {
    const out = [];
    document
        .querySelectorAll('ytmusic-browse-response ytmusic-carousel ytmusic-two-row-item-renderer')
        .forEach((c) => { if (isHomeBrowse(c.closest('ytmusic-browse-response'))) out.push(c); });
    gameCarouselCards = out;

    // Kontainer yang men-scroll (acuan pusat + scrollIntoView).
    gameCarouselScroller = null;
    let p = out[0] ? out[0].parentElement : null;
    while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 4) { gameCarouselScroller = p; break; }
        p = p.parentElement;
    }
}

// Deteksi kartu paling dekat pusat viewport — HANYA untuk logika klik-ke-tengah.
// Dipanggil saat scroll event (throttled), BUKAN per-frame.
// Busur (scaleX) sudah ditangani sepenuhnya oleh CSS animation-timeline: view().
function updateGameCarouselCentered() {
    if (!gameCarouselActive || !gameCarouselCards.length) return;
    // Saat halaman sedang MUNDUR (kartu barusan dipilih, animasi keluar jalan),
    // jangan pindahkan sorotan. Kartu yang baru diklik harus tetap menyala sampai
    // halamannya benar-benar berganti — terutama kartu yang tak bisa ditengahkan,
    // yang menurut hitungan pusat memang bukan "kartu tengah".
    if (document.documentElement.classList.contains('ts-page-out')) return;

    const centerY = gameCarouselCenterY();
    const vh = window.innerHeight;
    let best = null, bestD = Infinity;

    for (const card of gameCarouselCards) {
        if (!card.isConnected) continue;
        const r = card.getBoundingClientRect();
        if (!r.height || r.bottom < 0 || r.top > vh) continue;
        const dist = Math.abs((r.top + r.height / 2) - centerY);
        if (dist < bestD) { bestD = dist; best = card; }
    }

    if (best && best !== gameCarouselCenterCard) {
        if (gameCarouselCenterCard) gameCarouselCenterCard.classList.remove('ts-game-card-centered');
        best.classList.add('ts-game-card-centered');
        gameCarouselCenterCard = best;
    }
}

function getCenterHomeCard() {
    // Dipakai saat KLIK (jarang) => baca rect segar agar akurat.
    const centerY = gameCarouselCenterY();
    let best = null, bestD = Infinity;
    for (const card of gameCarouselCards) {
        if (!card.isConnected) continue;
        const r = card.getBoundingClientRect();
        if (r.height === 0) continue;
        const dist = Math.abs((r.top + r.height / 2) - centerY);
        if (dist < bestD) { bestD = dist; best = card; }
    }
    return best;
}

function gameCarouselCenterY() {
    if (gameCarouselScroller && gameCarouselScroller.isConnected) {
        const r = gameCarouselScroller.getBoundingClientRect();
        return r.top + r.height / 2;
    }
    return window.innerHeight * 0.46;
}

// Bisakah kartu ini benar-benar berakhir sebagai kartu-tengah?
//
// MASALAH: klik pada kartu yang belum di tengah selalu DICEGAT dan diganti jadi
// "luncurkan ke tengah dulu". Padahal kartu paling atas / paling bawah — juga
// semua kartu kalau daftarnya lebih pendek dari setengah layar — TIDAK PERNAH
// bisa sampai ke tengah, karena scroll-nya mentok di batas atas/bawah. Akibatnya
// lagu-lagu itu jadi mustahil diputar: diklik berkali-kali pun tak terjadi apa-apa.
//
// Di sini kita hitung dulu: kalau kartu ini diluncurkan ke tengah lalu scroll-nya
// dijepit ke rentang yang sah, apakah dia yang PALING dekat ke pusat? Kalau iya,
// peluncuran itu berguna. Kalau tidak, memaksa "ke tengah" cuma jalan buntu —
// pemanggil boleh langsung memutarnya.
function gameCardCanBeCentered(card) {
    const scroller = (gameCarouselScroller && gameCarouselScroller.isConnected)
        ? gameCarouselScroller
        : (document.scrollingElement || document.documentElement);
    if (!scroller) return true;

    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return false;            // tak ada ruang scroll sama sekali

    const r = card.getBoundingClientRect();
    if (!r.height) return true;            // belum ter-layout; jangan menghalangi

    const centerY = gameCarouselCenterY();
    // scrollTop yang DIBUTUHKAN agar pusat kartu tepat di pusat acuan.
    const needed = scroller.scrollTop + (r.top + r.height / 2) - centerY;
    if (needed >= 0 && needed <= max) return true;   // masih dalam jangkauan

    // Di luar jangkauan => scroll akan mentok. Cek siapa yang menang di posisi
    // mentok itu; kalau bukan kartu ini, dia memang tak akan pernah jadi
    // kartu-tengah berapa kali pun diklik.
    const shift = Math.min(Math.max(needed, 0), max) - scroller.scrollTop;
    const myDist = Math.abs((r.top + r.height / 2) - shift - centerY);
    for (const other of gameCarouselCards) {
        if (other === card || !other.isConnected) continue;
        const or = other.getBoundingClientRect();
        if (!or.height) continue;
        if (Math.abs((or.top + or.height / 2) - shift - centerY) < myDist) return false;
    }
    return true;
}

// Pindahkan sorotan "kartu terpilih" ke kartu tertentu, apa pun kata perhitungan
// pusat. Dipakai saat kartu yang tak bisa ditengahkan langsung diputar, supaya
// umpan baliknya tetap jelas: yang menyala persis yang diklik.
function markGameCardCentered(card) {
    if (gameCarouselCenterCard && gameCarouselCenterCard !== card) {
        gameCarouselCenterCard.classList.remove('ts-game-card-centered');
    }
    card.classList.add('ts-game-card-centered');
    gameCarouselCenterCard = card;
}

function onGameCarouselClickCapture(e) {
    if (!gameCarouselActive) return;
    const card = e.target.closest && e.target.closest('ytmusic-two-row-item-renderer');
    if (!card) return;
    if (gameCarouselCards.indexOf(card) === -1) {
        refreshGameCarouselCards();
        if (gameCarouselCards.indexOf(card) === -1) return;
    }

    // Klik yang KITA teruskan sendiri (a.click() di bawah) MASUK LAGI ke handler
    // ini, karena listener-nya dipasang di fase capture pada document. Kartu yang
    // sedang dalam proses navigasi WAJIB dibiarkan lolos, apa pun hasil hitungan
    // "kartu tengah" saat itu.
    //
    // Dulu penjaga ini ada DI DALAM cabang "putar". Akibatnya, kalau kartunya
    // bukan kartu-tengah (mis. dipilih lewat klik kedua atau karena tak bisa
    // ditengahkan), klik-terusan kita sendiri jatuh ke cabang "luncurkan ke
    // tengah" dan ditelan preventDefault di sana => lagunya tidak jadi diputar.
    if (card.__tsNavigating) return;

    // Kartu boleh LANGSUNG diputar kalau salah satu terpenuhi:
    //   1. memang sudah di tengah (perilaku song-select seperti biasa);
    //   2. tak mungkin sampai ke tengah (paling atas/bawah, atau daftarnya lebih
    //      pendek dari setengah layar) — dulu kartu begini mustahil dipilih;
    //   3. ini klik kedua pada kartu yang sama dalam 1,2 detik — jaring pengaman
    //      terakhir, supaya tak ada lagu yang benar-benar tak bisa diputar
    //      seandainya ada kasus geometri yang luput dari perhitungan di atas.
    const isRepeatClick = card === gameCarouselPendingCard &&
        Date.now() - gameCarouselPendingAt < 1200;

    if (card === getCenterHomeCard() || isRepeatClick || !gameCardCanBeCentered(card)) {
        const a = card.querySelector('a');
        if (!a) return;

        // Cegat klik langsung agar kita bisa putar animasi dulu
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();

        gameCarouselPendingCard = null;
        markGameCardCentered(card);

        // Mundurkan halaman lewat mesin transisi bersama (bukan class ad-hoc),
        // supaya klik kartu, klik tombol navbar, dan tombol back memakai jalur
        // yang sama persis — termasuk watchdog-nya kalau navigasinya gagal.
        tsPageOut();
        card.__tsNavigating = true;

        // Klik diteruskan saat animasi keluar sudah lewat separuh: YTM mulai
        // memuat halaman baru sementara animasinya masih berjalan, jadi tidak ada
        // jeda mati yang terasa seperti nge-lag.
        setTimeout(() => {
            a.click();
            setTimeout(() => { card.__tsNavigating = false; }, 800);
        }, Math.round(TS_PAGE_OUT_MS * 0.55));
        return;
    }

    // Belum di tengah TAPI masih bisa ditengahkan => batalkan aksi YTM,
    // luncurkan kartu ke tengah dulu. Kartunya dicatat supaya klik berikutnya
    // pasti diteruskan walau peluncurannya meleset.
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    gameCarouselPendingCard = card;
    gameCarouselPendingAt = Date.now();
    try { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (_) { try { card.scrollIntoView(); } catch (__) { } }
    // Perbarui centered card setelah scroll settle
    setTimeout(updateGameCarouselCentered, 300);
    setTimeout(updateGameCarouselCentered, 650);
}

function initGameCarousel() {
    if (gameCarouselActive) { refreshGameCarouselCards(); updateGameCarouselCentered(); return; }
    gameCarouselActive = true;
    refreshGameCarouselCards();

    // Scroll handler ringan: hanya refresh daftar kartu & deteksi centered card.
    // Busur (scaleX) sepenuhnya dikerjakan CSS animation-timeline: view().
    //
    // Dikumpulkan ke SATU rAF: event scroll bisa datang berkali-kali per frame,
    // dan tiap panggilan updateGameCarouselCentered() membaca getBoundingClientRect
    // semua kartu (= forced layout). Selama animasi transisi halaman berjalan,
    // pekerjaan ini dilewati sama sekali supaya main-thread tidak direbut.
    gameCarouselScrollHandler = () => {
        if (gameCarouselRaf) return;
        gameCarouselRaf = requestAnimationFrame(() => {
            gameCarouselRaf = 0;
            if (!gameCarouselActive || tsPageInFlight) return;
            const now = Date.now();
            if (now - gameCarouselLastRefresh > 600) { gameCarouselLastRefresh = now; refreshGameCarouselCards(); }
            updateGameCarouselCentered();
        });
    };
    document.addEventListener('scroll', gameCarouselScrollHandler, true);

    gameCarouselClickHandler = onGameCarouselClickCapture;
    document.addEventListener('click', gameCarouselClickHandler, true);

    // Home memuat bertahap => beberapa pass awal untuk kumpulkan kartu.
    [120, 500, 1200, 2500].forEach((t) => setTimeout(() => {
        if (!gameCarouselActive) return;
        refreshGameCarouselCards();
        updateGameCarouselCentered();
    }, t));
}

function teardownGameCarousel() {
    if (!gameCarouselActive) return;
    gameCarouselActive = false;
    if (gameCarouselScrollHandler) document.removeEventListener('scroll', gameCarouselScrollHandler, true);
    if (gameCarouselClickHandler) document.removeEventListener('click', gameCarouselClickHandler, true);
    if (gameCarouselRaf) { cancelAnimationFrame(gameCarouselRaf); gameCarouselRaf = 0; }
    gameCarouselPendingCard = null;
    gameCarouselCards.forEach((c) => {
        c.classList.remove('ts-game-card-centered');
    });
    gameCarouselCards = [];
    gameCarouselCenterCard = null;
    gameCarouselScroller = null;
    gameCarouselScrollHandler = gameCarouselClickHandler = null;
}

// ============================================================================
// 2e. MESIN TRANSISI ANTAR-HALAMAN (UI MOD "GAME LOBBY")
//
// MASALAH LAMA
//   Perpindahan halaman hanya punya SATU animasi: <ul id="items"> carousel home
//   digeser keluar/masuk, dan itu pun cuma dipicu saat player page ditutup.
//   Akibatnya:
//     1. Jenis halaman lain (channel/artis, playlist/album, eksplorasi, koleksi,
//        hasil pencarian) berganti TANPA animasi apa pun => terasa "potong
//        mendadak" alias stuttering.
//     2. Bahkan di home animasi "in"-nya SERING TIDAK JALAN, karena:
//        - <ul#items> baru di-stamp Polymer SETELAH class 'ts-game-animating-in'
//          keburu dilepas (600 ms), jadi tak ada elemen yang memainkannya;
//        - saat player page terbuka #content di-display:none, sedangkan animasi
//          maupun transisi tidak pernah mulai dari kondisi display:none;
//        - onSongChange() memanggil applyDynamicTheme() yang MENIMPA ULANG isi
//          <style> mode ini. Mengganti teks stylesheet berarti seluruh rule
//          dicabut lalu dipasang lagi => SEMUA animasi CSS yang sedang berjalan
//          ikut ter-reset. Dan lagu memang berganti tepat pada detik kita
//          berpindah halaman lewat kartu. (Diatasi di applyDynamicTheme: teks
//          stylesheet sekarang hanya ditulis kalau isinya benar-benar berubah.)
//
// PENDEKATAN BARU
//   Yang dianimasikan adalah CANGKANG HALAMAN (ytmusic-browse-response /
//   ytmusic-search-page), bukan node daftar di dalamnya. Cangkang selalu ada
//   selama halaman tampil dan tidak dibongkar-pasang Polymer sesering isinya,
//   jadi animasinya tak pernah "kelewat".
//
//   State-nya ditaruh di <html> supaya elemen yang baru LAHIR di tengah jendela
//   animasi tetap ikut memainkannya sejak frame pertama:
//     <html data-ts-page="home|channel|playlist|browse|search|player">
//     .ts-page-out   -> halaman lama mundur
//     .ts-page-in    -> halaman baru masuk (arah menyesuaikan data-ts-page)
//     .ts-page-hold  -> ditahan transparan; dipakai selama player page terbuka
//                       supaya saat player ditutup konten tidak sempat berkedip
//                       muncul dulu baru dianimasikan.
//
//   Pemicu: 'yt-navigate-start' (out) dan 'yt-navigate-finish' (in), ditambah
//   dua jaring pengaman: watchdog (konten TIDAK BOLEH tertinggal transparan
//   kalau navigasi batal/gagal) dan observer #content (menangkap perpindahan
//   yang tidak memancarkan event, mis. tombol back/forward).
// ============================================================================

// Durasi di sini WAJIB sama dengan --ts-page-out-dur / --ts-page-in-dur di CSS.
const TS_PAGE_OUT_MS = 240;
const TS_PAGE_IN_MS = 520;
const TS_PAGE_STAGGER_TAIL_MS = 320;   // ekor delay stagger blok terakhir

let tsPageEngineActive = false;
let tsPageCurrentType = '';
let tsPageOutWatchdog = null;
let tsPageInTimer = null;
let tsPageLastIn = 0;
let tsPageInFlight = false;            // true selama out/in sedang berjalan
let tsPageContentObserver = null;
let tsPageObserverDebounce = null;
let tsPageNavStartHandler = null;
let tsPageNavFinishHandler = null;

function isGameLobbyMode() {
    return document.documentElement.classList.contains('ts-game-lobby-uimod');
}

// Jenis halaman BROWSE (tanpa memperhitungkan player page yang menimpanya).
// Dipakai animasi "out": saat player page dibuka atributnya sudah menyala,
// padahal yang sedang mundur adalah halaman browse di belakangnya.
function detectGameBrowseType() {
    const path = (location && location.pathname) || '';
    if (path.indexOf('/search') === 0) return 'search';

    const br = document.querySelector('ytmusic-app #content ytmusic-browse-response') ||
        document.querySelector('ytmusic-browse-response');
    if (!br) return 'browse';

    // Pembeda yang sama dipakai HOME_SCOPE di CSS: halaman channel/artis
    // dikenali dari header khasnya, bukan dari ada/tidaknya page-type.
    if (br.querySelector('ytmusic-immersive-header-renderer') ||
        br.querySelector('ytmusic-visual-header-renderer')) return 'channel';
    if (br.querySelector('ytmusic-responsive-header-renderer')) return 'playlist';
    if (isHomeBrowse(br)) return 'home';
    return 'browse';
}

function detectGamePageType() {
    if (document.querySelector('ytmusic-player-page[player-page-open]') ||
        document.querySelector('ytmusic-app-layout[player-page-open]')) return 'player';
    return detectGameBrowseType();
}

function tsApplyPageType(type) {
    const root = document.documentElement;
    if (root.getAttribute('data-ts-page') !== type) root.setAttribute('data-ts-page', type);
    tsPageCurrentType = type;
}

// Mundurkan halaman yang sedang tampil. Idempoten: dipanggil dua kali (mis.
// klik kartu + yt-navigate-start) tidak akan memutar ulang animasinya.
function tsPageOut() {
    if (!isGameLobbyMode()) return;
    const root = document.documentElement;
    if (root.classList.contains('ts-page-out')) return;

    tsApplyPageType(detectGameBrowseType());   // arah keluar = jenis halaman LAMA
    root.classList.remove('ts-page-in', 'ts-page-hold');
    root.classList.add('ts-page-out');
    tsPageInFlight = true;

    clearTimeout(tsPageOutWatchdog);
    // PENGAMAN: kalau navigasinya batal (klik entri yang sedang aktif, request
    // gagal, dsb) konten tidak boleh tertinggal transparan selamanya.
    tsPageOutWatchdog = setTimeout(() => tsPageIn(), 1100);
}

// Masukkan halaman yang aktif sekarang. Selalu aman dipanggil: fungsinya juga
// yang membereskan sisa state 'out'/'hold'.
function tsPageIn() {
    if (!isGameLobbyMode()) return;
    const root = document.documentElement;

    clearTimeout(tsPageOutWatchdog);
    tsPageOutWatchdog = null;

    const type = detectGamePageType();
    tsApplyPageType(type);
    tsPageLastIn = Date.now();

    if (type === 'player') {
        // Player page punya animasi buka/tutupnya sendiri dari YTM. Cangkang
        // browse di belakangnya cukup DITAHAN transparan, bukan dilepas: dengan
        // begitu saat player ditutup nanti ia sudah siap masuk dan tidak sempat
        // berkedip muncul penuh satu frame dulu.
        clearTimeout(tsPageInTimer);
        root.classList.remove('ts-page-out', 'ts-page-in');
        root.classList.add('ts-page-hold');
        tsPageInFlight = false;
        return;
    }

    root.classList.remove('ts-page-out', 'ts-page-in', 'ts-page-hold');

    // Reflow sekali supaya browser "melupakan" animasi sebelumnya => ts-page-in
    // benar-benar diputar ulang walau class-nya baru saja dilepas di baris atas.
    void root.offsetWidth;

    root.classList.add('ts-page-in');
    tsPageInFlight = true;

    clearTimeout(tsPageInTimer);
    tsPageInTimer = setTimeout(() => {
        root.classList.remove('ts-page-in');
        tsPageInFlight = false;
    }, TS_PAGE_IN_MS + TS_PAGE_STAGGER_TAIL_MS);
}

// Tunggu dua frame supaya Polymer sempat menaruh & me-layout cangkang halaman
// baru, baru mainkan animasi masuk. Elemen yang menyusul lahir setelah itu tetap
// kebagian, karena class-nya masih menempel di <html> selama jendela animasi.
function tsSchedulePageIn(delayMs) {
    if (!isGameLobbyMode()) return;
    const run = () => requestAnimationFrame(() => requestAnimationFrame(() => tsPageIn()));
    if (delayMs > 0) setTimeout(run, delayMs); else run();
}

// Tahan konten transparan tanpa animasi. Dipakai saat player page terbuka:
// begitu player ditutup konten sudah "siap masuk", tidak berkedip muncul penuh
// satu frame lalu baru dianimasikan.
function tsPageHold() {
    if (!isGameLobbyMode()) return;
    const root = document.documentElement;
    clearTimeout(tsPageOutWatchdog);
    tsPageOutWatchdog = null;
    clearTimeout(tsPageInTimer);
    root.classList.remove('ts-page-out', 'ts-page-in');
    root.classList.add('ts-page-hold');
    tsPageInFlight = false;
}

function initGamePageTransitions() {
    if (tsPageEngineActive) return;
    tsPageEngineActive = true;

    tsApplyPageType(detectGamePageType());

    tsPageNavStartHandler = () => { if (isGameLobbyMode()) tsPageOut(); };
    tsPageNavFinishHandler = () => { if (isGameLobbyMode()) tsSchedulePageIn(); };
    document.addEventListener('yt-navigate-start', tsPageNavStartHandler, true);
    document.addEventListener('yt-navigate-finish', tsPageNavFinishHandler, true);

    attachGamePageContentObserver();

    // Sekali di awal: halaman yang sedang terbuka ikut diperkenalkan dengan
    // animasi masuk, biar pengaktifan preset terasa disengaja.
    tsSchedulePageIn();
}

// Jaring pengaman: sebagian perpindahan (back/forward, redirect internal) tidak
// selalu memancarkan yt-navigate-finish. Cangkang halaman adalah anak LANGSUNG
// #content, jadi observer childList TANPA subtree sudah cukup — sengaja tidak
// memakai subtree supaya callback-nya tidak membanjir saat Polymer men-stamp
// ribuan node, karena banjir callback itu sendiri sumber stutter.
function attachGamePageContentObserver(retries = 10) {
    if (tsPageContentObserver || !tsPageEngineActive) return;

    const contentHost = document.querySelector('ytmusic-app #content[slot="content"]') ||
        document.querySelector('ytmusic-app #content');
    if (!contentHost) {
        if (retries > 0) setTimeout(() => attachGamePageContentObserver(retries - 1), 800);
        return;
    }

    tsPageContentObserver = new MutationObserver(() => {
        if (!isGameLobbyMode()) return;
        clearTimeout(tsPageObserverDebounce);
        tsPageObserverDebounce = setTimeout(() => {
            const root = document.documentElement;
            if (root.classList.contains('ts-page-hold')) return;   // player page terbuka
            if (root.classList.contains('ts-page-out')) { tsPageIn(); return; }
            // Jangan memutar ulang animasi yang baru saja jalan (mutasi datang
            // bergelombang saat konten lazy-load), dan jangan bereaksi kalau
            // jenis halamannya memang tidak berpindah.
            if (Date.now() - tsPageLastIn < 500) return;
            if (detectGamePageType() === tsPageCurrentType) return;
            tsPageIn();
        }, 90);
    });
    tsPageContentObserver.observe(contentHost, { childList: true });
}

function teardownGamePageTransitions() {
    const root = document.documentElement;
    clearTimeout(tsPageOutWatchdog);
    clearTimeout(tsPageInTimer);
    clearTimeout(tsPageObserverDebounce);
    tsPageOutWatchdog = tsPageInTimer = tsPageObserverDebounce = null;

    if (tsPageNavStartHandler) {
        document.removeEventListener('yt-navigate-start', tsPageNavStartHandler, true);
        tsPageNavStartHandler = null;
    }
    if (tsPageNavFinishHandler) {
        document.removeEventListener('yt-navigate-finish', tsPageNavFinishHandler, true);
        tsPageNavFinishHandler = null;
    }
    if (tsPageContentObserver) {
        try { tsPageContentObserver.disconnect(); } catch (_) { }
        tsPageContentObserver = null;
    }

    root.classList.remove('ts-page-out', 'ts-page-in', 'ts-page-hold', 'ts-player-exiting');
    root.removeAttribute('data-ts-page');
    tsPageEngineActive = false;
    tsPageInFlight = false;
    tsPageCurrentType = '';
}

// ============================================================================
// 3. STYLER & COMMUNICATOR (The "Action")
// ============================================================================

function applyDynamicTheme(palette) {
    if (!palette) return;
    if (dynamicThemeDisabled) return;
    if (!isHostDidukung()) return;

    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);
    const unset = (k) => root.style.removeProperty(k);

    // Get current theme mode (default to 'default')
    // Back-compat: old config may still send 'unified' (removed) -> 'overlay',
    // atau mode Lobby lawas -> 'game-lobby-uimod'.
    let requestedMode = window.DYNAMIC_THEME_MODE;
    if (requestedMode !== 'game-lobby-uimod' && requestedMode?.endsWith('-lobby-uimod')) requestedMode = 'game-lobby-uimod';
    const themeMode = requestedMode === 'unified'
        ? 'overlay'
        : (requestedMode === 'default' ? 'default-optimized' : (requestedMode || 'default-optimized'));
    console.log('[DynamicTheme] Applying theme with mode:', themeMode);

    // Always reset mode-specific YTM variables first.
    // These are used by YT Music's own CSS; if we leave them set from a previous mode,
    // switching modes will cause visual "identity mixing".
    unset('--ytmusic-nav-bar');
    unset('--ytmusic-player-page-background');

    // Cleanup terpusat untuk mode Aurora (ui mod): kalau mode aktif bukan aurora,
    // pastikan style & state-nya dicabut total (dia paling agresif merombak DOM look).
    if (themeMode !== 'aurora-uimod') {
        const auroraStyle = document.getElementById('ts-aurora-uimod-styles');
        if (auroraStyle) auroraStyle.remove();
        document.documentElement.classList.remove('ts-aurora-uimod');
        unset('--ts-aurora-artwork');
    }

    // Cleanup terpusat untuk mode Game Lobby (ui mod): cabut style, class root,
    // dan panel info DOM-nya kalau mode aktif bukan dia.
    if (themeMode !== 'game-lobby-uimod') {
        const gameStyle = document.getElementById('ts-game-lobby-uimod-styles');
        if (gameStyle) gameStyle.remove();
        document.documentElement.classList.remove('ts-game-lobby-uimod');
        const gamePanel = document.getElementById('ts-game-info-panel');
        if (gamePanel) gamePanel.remove();
        // Buang backdrop parallax (elemen nyata) agar tidak menggantung di mode lain.
        const gameBg = document.getElementById('ts-game-bg');
        if (gameBg) gameBg.remove();
        // Kembalikan tombol guide yang sempat dipindah ke navbar.
        restoreGuideButtons();
        // Matikan efek busur carousel + bersihkan lebar/inline-nya.
        teardownGameCarousel();
        // Lepas mesin transisi + semua class state-nya (jangan sampai konten
        // tertinggal transparan di mode lain).
        teardownGamePageTransitions();
        unset('--ts-game-artwork');
    }

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

        } else if (themeMode === 'aurora-uimod') {
            // === MODE AURORA (UI MOD): Perombakan tampilan, bukan sekadar warna ===
            // Konsep: YT Music dirombak jadi "music lounge" —
            // 1. Backdrop = cover album itu sendiri, di-blur ekstrem + animasi aurora dari palet.
            // 2. Player bar dilepas dari tepi layar jadi "dock" kapsul kaca melayang.
            // 3. Artwork di player page jadi piringan vinyl bundar yang berputar pelan.
            // 4. Kartu home/playlist di-rounded, hover-nya mengangkat dengan glow warna palet.
            // 5. Nav bar melebur transparan; scrollbar nyaris hilang.
            console.log('[DynamicTheme] Applying AURORA (UI MOD) mode');

            // Hapus style mode lain
            for (const id of ['ts-overlay-mode-styles', 'ts-unified-mode-styles', 'ts-harmony-mode-styles', 'ts-default-optimized-styles', 'ts-seamless-mode-styles']) {
                const el = document.getElementById(id);
                if (el) el.remove();
            }

            const auroraAccent = palette.Vibrant ? palette.Vibrant.getHex() : primaryColor;
            const auroraGlow = palette.LightVibrant ? palette.LightVibrant.getHex() : auroraAccent;
            const auroraDeep = palette.DarkMuted ? palette.DarkMuted.getHex() : '#0a0a0a';

            set('--ts-body-color', 'transparent');
            set('--ts-playerbar-color', 'transparent');
            set('--ts-aurora-primary', primaryColor);
            set('--ts-aurora-secondary', secondaryColor);
            set('--ts-aurora-accent', auroraAccent);
            set('--ts-aurora-glow', auroraGlow);
            set('--ts-aurora-deep', auroraDeep);

            // Cover album sebagai backdrop. currentArtworkUrl di-set oleh onSongChange.
            if (currentArtworkUrl) {
                set('--ts-aurora-artwork', `url("${currentArtworkUrl.replace(/"/g, '%22')}")`);
            }

            // Tandai root agar selector CSS bisa scoped ke mode ini
            document.documentElement.classList.add('ts-aurora-uimod');

            const styleId = 'ts-aurora-uimod-styles';
            let auroraStyle = document.getElementById(styleId);
            if (!auroraStyle) {
                auroraStyle = document.createElement('style');
                auroraStyle.id = styleId;
                document.head.appendChild(auroraStyle);
            }

            auroraStyle.textContent = `
                /* ===== AURORA (UI MOD) ===== */

                @keyframes ts-aurora-drift {
                    0%   { transform: translate3d(-4%, -4%, 0) scale(1.12) rotate(0deg); }
                    50%  { transform: translate3d(4%, 3%, 0) scale(1.18) rotate(1.5deg); }
                    100% { transform: translate3d(-4%, -4%, 0) scale(1.12) rotate(0deg); }
                }
                @keyframes ts-aurora-hue {
                    0%   { filter: blur(60px) saturate(1.4) hue-rotate(0deg) brightness(0.55); }
                    50%  { filter: blur(60px) saturate(1.4) hue-rotate(-14deg) brightness(0.5); }
                    100% { filter: blur(60px) saturate(1.4) hue-rotate(0deg) brightness(0.55); }
                }
                @keyframes ts-vinyl-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }

                /* --- LAYER 1: Backdrop cover album blur + aurora --- */
                body::before {
                    content: '';
                    position: fixed;
                    inset: -8%;
                    background:
                        var(--ts-aurora-artwork, linear-gradient(135deg, var(--ts-aurora-primary), var(--ts-aurora-secondary)))
                        center / cover no-repeat;
                    animation: ts-aurora-drift 38s ease-in-out infinite,
                               ts-aurora-hue 24s ease-in-out infinite;
                    z-index: -2;
                    pointer-events: none;
                }
                /* Vignette + tint palet di atas backdrop agar teks tetap terbaca */
                body::after {
                    content: '';
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse at 50% 110%, color-mix(in srgb, var(--ts-aurora-accent) 30%, transparent) 0%, transparent 55%),
                        linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.75) 100%);
                    z-index: -1;
                    pointer-events: none;
                }

                /* Semua kontainer utama transparan agar backdrop tembus */
                body,
                ytmusic-app, ytmusic-app-layout,
                #content.ytmusic-app, ytmusic-browse-response,
                ytmusic-player-page, ytmusic-player-queue,
                ytmusic-player-queue #contents,
                ytmusic-player-queue ytmusic-tab-renderer,
                ytmusic-player-queue #tab-content,
                ytmusic-pivot-bar-renderer, ytmusic-header-renderer,
                ytmusic-player-page #main-panel,
                ytmusic-player-page #player-page-content,
                ytmusic-player-page #song-media-window,
                ytmusic-player-page #player-controls,
                ytmusic-player-page .middle-controls {
                    background: transparent !important;
                }

                /* --- LAYER 2: Nav bar melebur jadi kabut kaca tipis --- */
                ytmusic-app-layout > [slot="nav-bar"],
                #nav-bar-background,
                #mini-guide-background, #mini-guide, #mini-guide-spacer,
                tp-yt-app-drawer, tp-yt-app-drawer #contentContainer,
                #guide-wrapper, #guide-content,
                ytmusic-guide-renderer, ytmusic-guide-renderer #sections {
                    background: transparent !important;
                }
                ytmusic-app-layout > [slot="nav-bar"] {
                    backdrop-filter: blur(18px) brightness(0.85);
                    -webkit-backdrop-filter: blur(18px) brightness(0.85);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }

                /* --- LAYER 3: Player bar => DOCK kapsul kaca melayang --- */
                #player-bar-background { background: transparent !important; }
                /* Centering TANPA transform: YTM memakai transform sendiri untuk animasi
                   show/hide player bar, jadi transform kita bisa ditimpa dan bar bergeser
                   keluar layar. left:0 + right:0 + margin:auto aman dari konflik itu. */
                ytmusic-player-bar {
                    left: 0 !important;
                    right: 0 !important;
                    margin-left: auto !important;
                    margin-right: auto !important;
                    bottom: 14px !important;
                    width: min(92vw, 1100px) !important;
                    border-radius: 999px !important;
                    background: rgba(10, 10, 14, 0.45) !important;
                    backdrop-filter: blur(24px) saturate(1.5);
                    -webkit-backdrop-filter: blur(24px) saturate(1.5);
                    border: 1px solid rgba(255,255,255,0.12) !important;
                    box-shadow:
                        0 12px 40px rgba(0,0,0,0.55),
                        0 0 0 1px color-mix(in srgb, var(--ts-aurora-accent) 25%, transparent),
                        0 0 32px color-mix(in srgb, var(--ts-aurora-accent) 18%, transparent) !important;
                    overflow: hidden;
                    transition: box-shadow 0.5s ease, background 0.5s ease;
                }
                /* Thumbnail di dock: JANGAN paksa ukuran/bentuk — biarkan dimensi
                   alaminya (thumbnail video 16:9 jadi tampak "ditarik" kalau dipaksa).
                   Cukup rounding halus + object-fit agar tidak pernah terdistorsi. */
                ytmusic-player-bar .middle-controls img {
                    width: auto !important;
                    max-width: none !important;
                    border-radius: 8px !important;
                    object-fit: contain !important;
                }

                /* --- LAYER 4: Vinyl mode di player page --- */
                /* Hilangkan kotak letterbox gelap di belakang vinyl:
                   kontainer player YTM punya background hitam sendiri. */
                ytmusic-player,
                ytmusic-player #player,
                ytmusic-player #song-image,
                ytmusic-player #song-media-window,
                ytmusic-player-page #player,
                ytmusic-player-page #main-panel #player {
                    background: transparent !important;
                    box-shadow: none !important;
                }
                ytmusic-player-page #song-image,
                ytmusic-player-page #song-image img,
                ytmusic-player-page #thumbnail,
                ytmusic-player #song-image img {
                    border-radius: 50% !important;
                    box-shadow:
                        0 0 0 10px rgba(0,0,0,0.55),
                        0 0 0 12px color-mix(in srgb, var(--ts-aurora-glow) 40%, transparent),
                        0 24px 60px rgba(0,0,0,0.6) !important;
                }
                /* Putar pelan saat lagu berjalan (state attr milik YTM player bar) */
                html.ts-aurora-uimod body:has(ytmusic-player-bar[play-button-state="playing"]) ytmusic-player-page #song-image img {
                    animation: ts-vinyl-spin 28s linear infinite;
                }
                /* Video tetap kotak rounded biasa, jangan dipaksa bundar */
                ytmusic-player-page #song-video,
                ytmusic-player-page #song-video video {
                    border-radius: 16px !important;
                    animation: none !important;
                }

                /* --- LAYER 5: Kartu konten jadi panel kaca rounded --- */
                ytmusic-two-row-item-renderer,
                ytmusic-responsive-list-item-renderer,
                ytmusic-carousel-shelf-renderer .ytmusic-carousel {
                    border-radius: 14px !important;
                    transition: background 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease !important;
                }
                ytmusic-two-row-item-renderer:hover,
                ytmusic-responsive-list-item-renderer:hover {
                    background: rgba(255,255,255,0.06) !important;
                    transform: translateY(-3px) scale(1.01);
                    box-shadow: 0 10px 28px rgba(0,0,0,0.45),
                                0 0 18px color-mix(in srgb, var(--ts-aurora-accent) 22%, transparent);
                }
                ytmusic-two-row-item-renderer img {
                    border-radius: 10px !important;
                }

                /* ============================================================
                   LAYER 6: STYLING PER JENIS HALAMAN
                   ============================================================ */

                /* --- 6a. HOME: judul shelf bergradien + chip filter kaca --- */
                ytmusic-carousel-shelf-basic-header-renderer .title {
                    background: linear-gradient(90deg, #ffffff 30%, var(--ts-aurora-glow) 100%);
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                /* Chip filter (All, J-pop, Sedih, dst) => pil kaca rapi & kompak.
                   PENTING: style ditempel ke .gradient-box / <a> di DALAM chip,
                   bukan ke <ytmusic-chip-cloud-chip-renderer> luarnya — kalau di luar,
                   chip home (chip-style STYLE_LARGE_TRANSLUCENT) berubah jadi blob bulat besar. */
                ytmusic-chip-cloud-chip-renderer {
                    background: transparent !important;
                    border: none !important;
                }
                ytmusic-chip-cloud-chip-renderer .gradient-box {
                    border-radius: 999px !important;
                    background: rgba(255,255,255,0.07) !important;
                    border: 1px solid rgba(255,255,255,0.12) !important;
                    transition: background 0.25s ease, box-shadow 0.25s ease,
                                border-color 0.25s ease !important;
                    overflow: hidden;
                }
                ytmusic-chip-cloud-chip-renderer a,
                ytmusic-chip-cloud-chip-renderer button {
                    border-radius: 999px !important;
                    background: transparent !important;
                    height: 38px !important;
                    min-height: 0 !important;
                    padding: 0 18px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    white-space: nowrap;
                }
                ytmusic-chip-cloud-chip-renderer:hover .gradient-box {
                    background: rgba(255,255,255,0.14) !important;
                }
                ytmusic-chip-cloud-chip-renderer[is-selected] .gradient-box,
                ytmusic-chip-cloud-chip-renderer[aria-selected="true"] .gradient-box {
                    background: color-mix(in srgb, var(--ts-aurora-accent) 45%, rgba(0,0,0,0.4)) !important;
                    border-color: color-mix(in srgb, var(--ts-aurora-accent) 70%, transparent) !important;
                    box-shadow: 0 0 14px color-mix(in srgb, var(--ts-aurora-accent) 35%, transparent);
                }

                /* --- 6a-2. HOME: PEROMBAKAN SUSUNAN UI --- */

                /* Bar chip mood (Sedih, Tidur, ...) jadi STICKY di bawah nav bar:
                   tetap terlihat saat scroll, dengan kabut kaca agar konten lewat di belakangnya. */
                ytmusic-browse-response ytmusic-section-list-renderer > #header {
                    position: sticky !important;
                    top: 0;
                    z-index: 20;
                    padding: 8px 0 10px 0;
                    background: linear-gradient(180deg, rgba(8,8,12,0.78) 0%, rgba(8,8,12,0.45) 70%, transparent 100%) !important;
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                }

                /* Setiap shelf/rak konten jadi PANEL kaca modular — home berubah dari
                   daftar polos memanjang menjadi susunan kartu-panel bertingkat. */
                ytmusic-browse-response ytmusic-carousel-shelf-renderer,
                ytmusic-browse-response ytmusic-grid-renderer,
                ytmusic-browse-response ytmusic-shelf-renderer {
                    background: rgba(255,255,255,0.035) !important;
                    border: 1px solid rgba(255,255,255,0.07) !important;
                    border-radius: 22px !important;
                    padding: 18px 20px !important;
                    margin: 0 4px 26px 4px !important;
                    box-shadow: 0 6px 24px rgba(0,0,0,0.25);
                    transition: border-color 0.3s ease, box-shadow 0.3s ease;
                }
                ytmusic-browse-response ytmusic-carousel-shelf-renderer:hover,
                ytmusic-browse-response ytmusic-grid-renderer:hover,
                ytmusic-browse-response ytmusic-shelf-renderer:hover {
                    border-color: color-mix(in srgb, var(--ts-aurora-accent) 30%, rgba(255,255,255,0.07)) !important;
                    box-shadow: 0 6px 24px rgba(0,0,0,0.25),
                                0 0 22px color-mix(in srgb, var(--ts-aurora-accent) 12%, transparent);
                }

                /* Header shelf (avatar + "Dengarkan lagi") diberi garis aksen bawah
                   sebagai pemisah visual antara judul dan isi rak. */
                ytmusic-carousel-shelf-basic-header-renderer {
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                    padding-bottom: 10px !important;
                    margin-bottom: 14px !important;
                }
                /* Strapline kecil di atas judul (nama channel) berwarna aksen */
                ytmusic-carousel-shelf-basic-header-renderer .strapline,
                ytmusic-carousel-shelf-basic-header-renderer .strapline-text {
                    color: var(--ts-aurora-glow) !important;
                    letter-spacing: 1.5px;
                }
                /* Avatar channel di header shelf diberi ring aksen */
                ytmusic-carousel-shelf-basic-header-renderer img {
                    border-radius: 50% !important;
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ts-aurora-accent) 60%, transparent);
                }
                /* Tombol "Selengkapnya" jadi pil kaca */
                ytmusic-carousel-shelf-basic-header-renderer yt-button-renderer,
                ytmusic-carousel-shelf-basic-header-renderer .more-button {
                    border-radius: 999px !important;
                    background: rgba(255,255,255,0.06) !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                }

                /* Hover kartu: thumbnail ikut zoom halus (melengkapi lift yang sudah ada) */
                ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer {
                    overflow: hidden;
                    border-radius: 10px !important;
                }
                ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer img {
                    transition: transform 0.35s ease;
                }
                ytmusic-two-row-item-renderer:hover ytmusic-thumbnail-renderer img {
                    transform: scale(1.06);
                }

                /* Sidebar kiri (Beranda/Eksplorasi/Koleksi) jadi pill rail:
                   item membulat, yang aktif menyala warna aksen. */
                ytmusic-guide-entry-renderer {
                    border-radius: 14px !important;
                    margin: 2px 6px !important;
                    transition: background 0.2s ease !important;
                }
                ytmusic-guide-entry-renderer:hover {
                    background: rgba(255,255,255,0.08) !important;
                }
                ytmusic-guide-entry-renderer[active],
                ytmusic-guide-entry-renderer[aria-selected="true"] {
                    background: color-mix(in srgb, var(--ts-aurora-accent) 25%, rgba(255,255,255,0.05)) !important;
                    box-shadow: inset 3px 0 0 var(--ts-aurora-accent);
                }

                /* --- 6b. CHANNEL: banner artis melebur ke backdrop aurora --- */
                ytmusic-immersive-header-renderer {
                    position: relative;
                    background: transparent !important;
                    border-radius: 0 0 28px 28px;
                    overflow: hidden;
                }
                /* Fade bawah banner agar menyatu dengan backdrop, tidak putus kaku */
                ytmusic-immersive-header-renderer::after {
                    content: '';
                    position: absolute;
                    left: 0; right: 0; bottom: 0;
                    height: 45%;
                    background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.65) 100%);
                    pointer-events: none;
                }
                ytmusic-immersive-header-renderer .immersive-header-title,
                ytmusic-immersive-header-renderer h1 {
                    text-shadow: 0 2px 18px rgba(0,0,0,0.8);
                }

                /* --- 6c. PLAYLIST: header jadi panel kaca dengan cover bercahaya --- */
                ytmusic-responsive-header-renderer,
                ytmusic-editable-playlist-detail-header-renderer,
                ytmusic-detail-header-renderer {
                    background: rgba(255,255,255,0.05) !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                    border-radius: 20px !important;
                    backdrop-filter: blur(20px) saturate(1.3);
                    -webkit-backdrop-filter: blur(20px) saturate(1.3);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4),
                                0 0 24px color-mix(in srgb, var(--ts-aurora-accent) 12%, transparent) !important;
                    overflow: hidden;
                }
                ytmusic-responsive-header-renderer img,
                ytmusic-editable-playlist-detail-header-renderer img,
                ytmusic-detail-header-renderer img {
                    border-radius: 14px !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5),
                                0 0 20px color-mix(in srgb, var(--ts-aurora-glow) 25%, transparent) !important;
                }

                /* --- 6d. SEARCH: kotak cari pil kaca + hasil "top result" premium --- */
                ytmusic-search-box {
                    background: rgba(255,255,255,0.08) !important;
                    border: 1px solid rgba(255,255,255,0.12) !important;
                    border-radius: 999px !important;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    transition: background 0.25s ease, border-radius 0.25s ease !important;
                }
                /* Saat dropdown saran terbuka, melebar jadi panel solid agar terbaca */
                ytmusic-search-box[opened] {
                    border-radius: 20px !important;
                    background: rgba(12, 12, 18, 0.92) !important;
                }
                ytmusic-search-suggestions-section,
                ytmusic-search-suggestion {
                    background: transparent !important;
                }
                ytmusic-search-suggestion:hover {
                    background: color-mix(in srgb, var(--ts-aurora-accent) 18%, transparent) !important;
                    border-radius: 10px;
                }
                /* Kartu "Hasil teratas" => panel kaca dengan aksen tepi kiri */
                ytmusic-card-shelf-renderer {
                    background: rgba(255,255,255,0.05) !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                    border-left: 3px solid var(--ts-aurora-accent) !important;
                    border-radius: 16px !important;
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                }
                ytmusic-tabbed-search-results-renderer,
                ytmusic-shelf-renderer,
                ytmusic-playlist-shelf-renderer,
                ytmusic-item-section-renderer {
                    background: transparent !important;
                }

                /* --- 6e. UNIVERSAL: tab & antrean (BERIKUTNYA/LIRIK/TERKAIT) --- */
                tp-yt-paper-tabs, paper-tabs {
                    --paper-tabs-selection-bar-color: var(--ts-aurora-accent);
                }
                ytmusic-player-queue-item {
                    border-radius: 10px !important;
                    transition: background 0.2s ease !important;
                }
                ytmusic-player-queue-item:hover {
                    background: rgba(255,255,255,0.07) !important;
                }
                ytmusic-player-queue-item[selected],
                ytmusic-player-queue-item[play-button-state="playing"],
                ytmusic-player-queue-item[play-button-state="paused"] {
                    background: color-mix(in srgb, var(--ts-aurora-accent) 22%, rgba(0,0,0,0.3)) !important;
                }
                /* Ikon overlay (speaker/play) di thumbnail antrean: kunci ke 24px genap
                   agar render-nya tajam, tidak kena pembulatan scaling (23.99px). */
                ytmusic-player-queue-item yt-icon,
                ytmusic-player-queue-item yt-icon svg {
                    width: 24px !important;
                    height: 24px !important;
                    shape-rendering: geometricPrecision;
                }

                /* --- Detail: scrollbar tipis, teks dengan depth --- */
                html::-webkit-scrollbar, body::-webkit-scrollbar,
                ytmusic-app::-webkit-scrollbar, ytmusic-app *::-webkit-scrollbar {
                    width: 6px;
                    background: transparent;
                }
                html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb,
                ytmusic-app::-webkit-scrollbar-thumb, ytmusic-app *::-webkit-scrollbar-thumb {
                    background: color-mix(in srgb, var(--ts-aurora-accent) 55%, transparent) !important;
                    border-radius: 3px;
                }
                .title, .subtitle, .byline,
                ytmusic-player-bar .title, ytmusic-player-bar .byline {
                    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
                }

                /* Beri ruang ekstra di bawah konten supaya tidak ketutup dock melayang */
                ytmusic-app-layout #content,
                ytmusic-player-page {
                    padding-bottom: 24px;
                }
            `;

            // Variabel native YTM: biarkan player page transparan (backdrop kita yang tampil)
            set('--ytmusic-player-page-background', 'transparent');
            unset('--ytmusic-nav-bar');

        } else if (themeMode === 'game-lobby-uimod') {
            // === MODE GAME LOBBY (UI MOD): YT Music dirias jadi lobby game ritme ===
            // Referensi: layar song-select (home) & layar loading beatmap (player page).
            // 1. HOME = "song select": backdrop cover album tajam yang digelapkan,
            //    toolbar atas gelap, kartu konten jadi "beatmap card" dengan tepi aksen
            //    yang menggeser ke kiri saat hover, chip filter jadi pil + garis pelangi
            //    star-difficulty, dan panel info lagu (DOM) bergaya panel beatmap game.
            // 2. PLAYER PAGE = "loading screen": backdrop blur ekstrem terang, artwork
            //    jadi lingkaran ber-ring putih seperti logo game!, info lagu terpusat,
            //    panel queue kanan jadi panel "PENGATURAN" frosted beraksen kuning.
            // Tetap informatif, bukan gamifikasi: semua teks/statistik adalah data asli.
            console.log('[DynamicTheme] Applying GAME LOBBY (UI MOD) mode');

            // Hapus style mode lain (aurora dibersihkan oleh cleanup terpusat di atas)
            for (const id of ['ts-overlay-mode-styles', 'ts-unified-mode-styles', 'ts-harmony-mode-styles', 'ts-default-optimized-styles', 'ts-seamless-mode-styles']) {
                const el = document.getElementById(id);
                if (el) el.remove();
            }

            const gameAccent = palette.Vibrant ? palette.Vibrant.getHex() : primaryColor;
            const gameGlow = palette.LightVibrant ? palette.LightVibrant.getHex() : gameAccent;
            const gameDeep = palette.DarkMuted ? palette.DarkMuted.getHex() : '#101018';

            set('--ts-body-color', 'transparent');
            set('--ts-playerbar-color', 'transparent');
            set('--ts-game-primary', primaryColor);
            set('--ts-game-secondary', secondaryColor);
            set('--ts-game-accent', gameAccent);
            set('--ts-game-glow', gameGlow);
            set('--ts-game-deep', gameDeep);

            // Cover album sebagai backdrop "song select". Di-set oleh onSongChange.
            if (currentArtworkUrl) {
                set('--ts-game-artwork', `url("${currentArtworkUrl.replace(/"/g, '%22')}")`);
            }

            document.documentElement.classList.add('ts-game-lobby-uimod');

            // Backdrop "song select" sebagai elemen NYATA agar parallax kursor bisa
            // di-transform langsung pada satu elemen daun (tanpa CSS var di <body>
            // yang memicu recalc seluruh subtree). Background-nya tetap dibaca dari
            // --ts-game-artwork lewat CSS, jadi otomatis ikut berganti tiap lagu.
            if (!document.getElementById('ts-game-bg')) {
                const gameBg = document.createElement('div');
                gameBg.id = 'ts-game-bg';
                gameBg.setAttribute('aria-hidden', 'true');
                document.body.appendChild(gameBg);
            }

            // Scope perombakan layout HANYA ke halaman HOME.
            // CATATAN PENTING: halaman CHANNEL/ARTIS juga TIDAK membawa page-type
            // (cuma immersive-mode), jadi ':not([page-type])' saja keliru ikut
            // menyeret halaman channel ke layout home (konten kedorong ke kanan).
            // Pembeda andal: halaman channel/artis memuat salah satu header:
            //   - <ytmusic-immersive-header-renderer>  (kasus 1: artis/daftar musik)
            //   - <ytmusic-visual-header-renderer>     (kasus 2: channel pengguna)
            // sedangkan home tidak punya keduanya. Maka kecualikan browse-response
            // yang mengandung salah satu header tsb dari layout home.
            const HOME_SCOPE = 'ytmusic-browse-response:is(:not([page-type]),[page-type="MUSIC_PAGE_TYPE_HOME"]):not(:has(ytmusic-immersive-header-renderer)):not(:has(ytmusic-visual-header-renderer))';

            const styleId = 'ts-game-lobby-uimod-styles';
            let gameStyle = document.getElementById(styleId);
            if (!gameStyle) {
                gameStyle = document.createElement('style');
                gameStyle.id = styleId;
                document.head.appendChild(gameStyle);
            }

            const gameCss = `
                /* ===== GAME LOBBY (UI MOD) ===== */

                /* ============================================================
                   TRANSISI ANTAR-JENIS-HALAMAN
                   (pengendalinya: "MESIN TRANSISI ANTAR-HALAMAN" di bagian 2e JS)

                   Yang dianimasikan adalah WADAH DAFTAR halaman — <ytmusic-carousel>
                   di home, '#contents' milik section-list di halaman lain — bukan
                   tiap kartu satu per satu. Wadah ini bertahan selama halaman
                   tampil, jadi animasinya tak pernah "kelewat" walau Polymer
                   men-stamp ulang isinya kapan saja. Rinciannya di blok
                   "LAPISAN MANA YANG BOLEH BERGERAK" di bawah.

                   Arah gerak menyesuaikan data-ts-page supaya tiap jenis halaman
                   masuk dari sisi yang masuk akal dengan tata letaknya sendiri:
                     home     -> horizontal (daftar beatmap memang menepi ke kanan)
                     channel  -> dari kiri  (balok trapesium menggantung di kiri)
                     lainnya  -> naik lembut (playlist/album/eksplorasi/pencarian)

                   CATATAN PENTING soal home: kartu home memakai scroll-driven
                   animation (animation-timeline: view(block)) yang mengukur posisi
                   VERTIKAL kartu terhadap viewport. Menggeser sumbu Y saat transisi
                   akan membuat busur scaleX-nya berkedut tiap frame. Karena itu
                   home HANYA digeser horizontal — aman, sekaligus mempertahankan
                   gerak "daftar menepi ke kanan" yang sudah jadi ciri presetnya.
                   ============================================================ */
                :root {
                    --ts-page-out-dur: 240ms;
                    --ts-page-in-dur: 520ms;
                    --ts-page-item-dur: 460ms;
                    --ts-page-ease-out: cubic-bezier(0.4, 0, 1, 1);
                    --ts-page-ease-in: cubic-bezier(0.22, 1, 0.36, 1);
                }

                @keyframes ts-page-out-x {
                    from { opacity: 1; transform: translate3d(0, 0, 0); }
                    to   { opacity: 0; transform: translate3d(7%, 0, 0); }
                }
                @keyframes ts-page-in-x {
                    from { opacity: 0; transform: translate3d(7%, 0, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }
                @keyframes ts-page-out-left {
                    from { opacity: 1; transform: translate3d(0, 0, 0); }
                    to   { opacity: 0; transform: translate3d(-3.5%, 0, 0); }
                }
                @keyframes ts-page-in-left {
                    from { opacity: 0; transform: translate3d(-3.5%, 0, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }
                @keyframes ts-page-out-y {
                    from { opacity: 1; transform: translate3d(0, 0, 0); }
                    to   { opacity: 0; transform: translate3d(0, -16px, 0); }
                }
                @keyframes ts-page-in-y {
                    from { opacity: 0; transform: translate3d(0, 20px, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }
                /* Stagger blok isi: offsetnya kecil karena menumpang di atas
                   gerak cangkangnya (kalau sama besar, jaraknya jadi dobel). */
                @keyframes ts-page-item-x {
                    from { opacity: 0; transform: translate3d(4%, 0, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }
                @keyframes ts-page-item-y {
                    from { opacity: 0; transform: translate3d(0, 16px, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }

                /* Geser horizontal tidak boleh memunculkan scrollbar mendatar.
                   Dipilih 'clip' (bukan 'hidden') karena tidak membuat kotak
                   scroll baru dan tidak memaksa overflow-y jadi auto; margin
                   klipnya menyisakan ruang untuk glow/bayangan hover kartu. */
                html.ts-game-lobby-uimod ytmusic-app #content[slot="content"] {
                    overflow-x: clip;
                    overflow-clip-margin: 40px;
                }

                /* ============================================================
                   LAPISAN MANA YANG BOLEH BERGERAK

                   Bukan seluruh cangkang halaman. Aturannya per jenis halaman:

                     home   -> HANYA <ytmusic-carousel> (tumpukan kartu beatmap).
                               Judul shelf, tombol "Selengkapnya", baris chip,
                               navbar, dan playerbar tetap diam.
                     lainnya-> '#contents' milik <ytmusic-section-list-renderer>.

                   Kenapa '#contents', bukan cangkangnya? Karena '#header' — baris
                   chip sticky "Senang / Bersantai / Tidur / ..." beserta garis
                   pelanginya — adalah SAUDARA dari '#contents', bukan anaknya.
                   Dengan menaruh animasi di '#contents', baris chip itu otomatis
                   TIDAK PERNAH ikut bergerak atau memudar.

                   Jadi aturan mainnya gampang diingat, dan gampang ditambahi:
                   apa pun yang berada DI LUAR '#contents' bersifat tetap —
                   termasuk balok trapesium banner channel yang punya animasi
                   masuknya sendiri.
                   ============================================================ */

                /* --- HOME: keluar/masuk --- */
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-out ytmusic-browse-response ytmusic-carousel {
                    animation: ts-page-out-x var(--ts-page-out-dur) var(--ts-page-ease-out) both !important;
                    pointer-events: none !important;
                    will-change: transform, opacity;
                }
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-browse-response ytmusic-carousel {
                    animation: ts-page-in-x var(--ts-page-in-dur) var(--ts-page-ease-in) both !important;
                    will-change: transform, opacity;
                }
                /* Stagger antar-shelf: dihitung dari urutan shelf-nya, karena yang
                   dianimasikan kini carousel di DALAM shelf, bukan shelf-nya. */
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(1) ytmusic-carousel { animation-delay: 0ms !important; }
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(2) ytmusic-carousel { animation-delay: 60ms !important; }
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(3) ytmusic-carousel { animation-delay: 120ms !important; }
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(4) ytmusic-carousel { animation-delay: 180ms !important; }
                html.ts-game-lobby-uimod[data-ts-page="home"].ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(n+5) ytmusic-carousel { animation-delay: 240ms !important; }

                /* --- HALAMAN LAIN: keluar/masuk --- */
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-out ytmusic-browse-response ytmusic-section-list-renderer > #contents,
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-out ytmusic-search-page ytmusic-section-list-renderer > #contents {
                    animation: ts-page-out-y var(--ts-page-out-dur) var(--ts-page-ease-out) both !important;
                    pointer-events: none !important;
                    will-change: transform, opacity;
                }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-browse-response ytmusic-section-list-renderer > #contents,
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-search-page ytmusic-section-list-renderer > #contents {
                    animation: ts-page-in-y var(--ts-page-in-dur) var(--ts-page-ease-in) both !important;
                    will-change: transform, opacity;
                }
                /* Channel/artis: searah dengan balok trapesium yang menggantung di
                   kiri. Spesifisitasnya SAMA dengan dua aturan di atas, jadi harus
                   ditulis SESUDAHNYA supaya menang. */
                html.ts-game-lobby-uimod[data-ts-page="channel"].ts-page-out ytmusic-browse-response ytmusic-section-list-renderer > #contents {
                    animation-name: ts-page-out-left !important;
                }
                html.ts-game-lobby-uimod[data-ts-page="channel"].ts-page-in ytmusic-browse-response ytmusic-section-list-renderer > #contents {
                    animation-name: ts-page-in-left !important;
                }

                /* Isi halaman masuk bertahap supaya terasa "dibangun", bukan
                   nongol sekaligus. Dibatasi empat blok teratas; sisanya memakai
                   delay yang sama agar halaman panjang tidak terasa lambat. */
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-browse-response ytmusic-section-list-renderer > #contents > *,
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-search-page ytmusic-section-list-renderer > #contents > * {
                    animation: ts-page-item-y var(--ts-page-item-dur) var(--ts-page-ease-in) both;
                }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(1) { animation-delay: 0ms; }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(2) { animation-delay: 60ms; }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(3) { animation-delay: 120ms; }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(4) { animation-delay: 180ms; }
                html.ts-game-lobby-uimod:not([data-ts-page="home"]).ts-page-in ytmusic-section-list-renderer > #contents > *:nth-child(n+5) { animation-delay: 240ms; }

                /* --- Ditahan (player page terbuka): transparan, tanpa animasi ---
                   Sengaja dipasang di '#contents' untuk SEMUA jenis halaman: ia
                   membungkus carousel juga, jadi satu aturan sudah cukup dan
                   tidak ada konten yang sempat berkedip saat player ditutup. */
                html.ts-game-lobby-uimod.ts-page-hold ytmusic-browse-response ytmusic-section-list-renderer > #contents,
                html.ts-game-lobby-uimod.ts-page-hold ytmusic-search-page ytmusic-section-list-renderer > #contents {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }

                /* Hormati preferensi sistem: matikan gerakannya, bukan tampilannya. */
                @media (prefers-reduced-motion: reduce) {
                    html.ts-game-lobby-uimod.ts-page-out ytmusic-carousel,
                    html.ts-game-lobby-uimod.ts-page-in ytmusic-carousel,
                    html.ts-game-lobby-uimod.ts-page-out ytmusic-section-list-renderer > #contents,
                    html.ts-game-lobby-uimod.ts-page-in ytmusic-section-list-renderer > #contents,
                    html.ts-game-lobby-uimod.ts-page-in ytmusic-section-list-renderer > #contents > * {
                        animation-duration: 1ms !important;
                        animation-delay: 0ms !important;
                    }
                }

                @keyframes ts-game-panel-in {
                    from { opacity: 0; transform: translateX(-18px); }
                    to   { opacity: 1; transform: none; }
                }
                @keyframes ts-game-logo-pulse {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.015); }
                }
                @keyframes ts-game-panel-in-center {
                    from { opacity: 0; transform: translate3d(0, 18px, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }

                /* BUSUR CAROUSEL via CSS Scroll-Driven Animations (Chromium 115+)
                   Kartu di-scaleX berdasarkan posisi scroll — TANPA JS per-frame.
                   entry 0% = kartu baru masuk viewport (atas/bawah tepi),
                   entry 50% = kartu tepat di tengah viewport = skala penuh.
                   cover range dipakai agar animasi berjalan selama kartu terlihat. */
                @keyframes ts-game-arc-scale {
                    0%   { transform: scaleX(0.66); }
                    50%  { transform: scaleX(1); }
                    100% { transform: scaleX(0.66); }
                }
                /* Counter-scale untuk teks .details agar tetap proporsional.
                   Nilai 1/0.66 ≈ 1.515 di tepi, 1 di tengah. */
                @keyframes ts-game-arc-counter {
                    0%   { transform: scaleX(1.515); }
                    50%  { transform: scaleX(1); }
                    100% { transform: scaleX(1.515); }
                }

                /* --- LAYER 0: Backdrop "song select" = cover album digelapkan ---
                   Dirender sebagai ELEMEN NYATA (#ts-game-bg), BUKAN body::before.
                   Kenapa? Parallax kursor menggerakkan layer ini tiap frame. Kalau
                   pakai body::before, satu-satunya cara menggesernya adalah lewat CSS
                   var di <body> (pseudo hanya bisa membacanya via inheritance) — dan
                   mengubah var pewarisan di <body> memaksa SELURUH subtree app
                   (ribuan node YTM) di-recalc style tiap frame => stutter.
                   Elemen daun tersendiri yang transform-nya ditulis langsung oleh JS
                   = nol invalidasi subtree => benar-benar mulus, murni di kompositor. */
                #ts-game-bg {
                    position: fixed;
                    inset: -2%;
                    background:
                        var(--ts-game-artwork, linear-gradient(135deg, var(--ts-game-primary), var(--ts-game-secondary)))
                        no-repeat center center / cover !important;
                    filter: brightness(1) saturate(1.15);
                    transform: scale(1.08) translate3d(0px, 0px, 0); /* offset di-set oleh JS parallax */
                    z-index: -1;
                    transition: background 0.8s ease, filter 0.8s ease;
                    will-change: transform;
                    backface-visibility: hidden;
                    pointer-events: none;
                }
                /* Scrim khas song select: kiri lebih gelap (zona panel info) + vignette */
                body::after {
                    content: '';
                    position: fixed;
                    inset: 0;
                    background:
                        linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.4) 100%),
                        linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 18%, transparent 70%, rgba(0,0,0,0.55) 100%);
                    z-index: -1;
                    pointer-events: none;
                }
                /* Saat player page terbuka => backdrop berubah jadi blur ekstrem terang
                   seperti layar loading beatmap (screenshot 2).

                   CARA BARU: blur-nya STATIS, yang dianimasikan hanya opacity.
                   Menganimasikan radius blur memaksa GPU merender ulang blur
                   se-layar penuh TIAP FRAME — itu persis rasa tersendat saat
                   masuk/keluar player page. Cross-fade dua lapisan (tajam <->
                   blur) murni kerja kompositor, jadi mulus. Hasil akhirnya sama:
                   lapisan blur sudah memuat scrim mode player sekaligus, dan
                   scrim song-select (body::after) memudar berbarengan. */
                #ts-game-bg::before {
                    content: '';
                    position: absolute;
                    /* Lebih lebar dari induknya supaya tepi yang "termakan" blur
                       48px jatuh di luar layar, bukan jadi pinggiran pudar. */
                    inset: -10%;
                    background:
                        linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.45)),
                        var(--ts-game-artwork, linear-gradient(135deg, var(--ts-game-primary), var(--ts-game-secondary)))
                        no-repeat center center / cover;
                    /* saturate 1.09 karena filter induk (saturate 1.15) ikut
                       menimpa lapisan ini juga => gabungannya ~1.25, sama seperti
                       nilai lama. */
                    filter: blur(48px) brightness(0.8) saturate(1.09);
                    opacity: 0;
                    transition: opacity 0.45s ease;
                    pointer-events: none;
                }
                html.ts-player-page-open #ts-game-bg::before {
                    opacity: 1;
                }
                /* Scrim song-select memudar, bukan berganti mendadak: gradien
                   bertumpuk memang tidak bisa ditransisikan, opacity bisa. */
                body::after {
                    transition: opacity 0.45s ease;
                }
                html.ts-player-page-open body::after {
                    opacity: 0;
                }

                /* Semua kontainer utama transparan agar backdrop tembus */
                body,
                ytmusic-app, ytmusic-app-layout,
                #content.ytmusic-app, ytmusic-browse-response,
                ytmusic-player-page,
                ytmusic-player-page #main-panel,
                ytmusic-player-page #player-page-content,
                ytmusic-player-page #song-media-window,
                ytmusic-player-page #player-controls,
                ytmusic-player-page .middle-controls,
                ytmusic-pivot-bar-renderer, ytmusic-header-renderer {
                    background: transparent !important;
                }

                /* Menghilangkan batasan tinggi gradien bawaan YT Music (biasanya kepotong setengah layar) */
                ytmusic-browse-response[has-background]:not([disable-gradient]) .background-gradient.ytmusic-browse-response,
                .background-gradient {
                    background-size: 100% 100% !important;
                    background-image: none !important; /* Matikan sekalian jika mengganggu background artwork lama. */
                }

                /* --- LAYER 1: Nav bar => toolbar gelap game --- */
                #nav-bar-background,
                #mini-guide-background, #mini-guide, #mini-guide-spacer,
                ytmusic-guide-renderer {
                    background: transparent !important;
                }
                
                /* Menghilangkan seluruh struktur sidebar/guide dari layout agar tidak menyisakan kolom kosong */
                tp-yt-app-drawer, 
                tp-yt-app-drawer #contentContainer,
                #guide-wrapper, 
                #guide-content,
                ytmusic-guide-renderer #sections,
                ytmusic-guide-section-renderer {
                    display: none !important;
                    width: 0 !important;
                }
                ytmusic-app-layout > [slot="nav-bar"] {
                    background: rgba(16, 16, 22, 0.96) !important;
                    border-bottom: 1px solid rgba(255,255,255,0.07);
                }

                /* Kotak cari => panel cari gelap khas pojok kanan-atas song select */
                ytmusic-search-box {
                    background: rgba(0,0,0,0.5) !important;
                    border: 1px solid rgba(255,255,255,0.1) !important;
                    border-radius: 8px !important;
                    transition: background 0.25s ease, border-radius 0.25s ease !important;
                }
                ytmusic-search-box input {
                    caret-color: var(--ts-game-glow) !important;
                }
                ytmusic-search-box[opened] {
                    border-radius: 12px !important;
                    background: rgba(12, 12, 18, 0.95) !important;
                }
                ytmusic-search-suggestions-section,
                ytmusic-search-suggestion {
                    background: transparent !important;
                }
                ytmusic-search-suggestion:hover {
                    background: color-mix(in srgb, var(--ts-game-accent) 20%, transparent) !important;
                    border-radius: 8px;
                }

                /* Sidebar kiri jadi pill rail; item aktif menyala aksen */
                ytmusic-guide-entry-renderer {
                    border-radius: 12px !important;
                    margin: 2px 6px !important;
                    transition: background 0.2s ease !important;
                }
                ytmusic-guide-entry-renderer:hover {
                    background: rgba(255,255,255,0.08) !important;
                }
                ytmusic-guide-entry-renderer[active],
                ytmusic-guide-entry-renderer[aria-selected="true"] {
                    background: color-mix(in srgb, var(--ts-game-accent) 25%, rgba(0,0,0,0.35)) !important;
                    box-shadow: inset 3px 0 0 var(--ts-game-accent);
                }

                /* --- LAYER 2: Bar chip => baris filter/sortir + garis pelangi --- */
                /* Sticky seperti baris "Sortir/Pengelompokan" game, dengan garis pelangi
                   star-difficulty sebagai pembatas bawah. */
                ytmusic-browse-response ytmusic-section-list-renderer > #header {
                    position: sticky !important;
                    top: 0;
                    z-index: 20;
                    padding: 8px 0 12px 0;
                    background: linear-gradient(180deg, rgba(10,10,16,0.88) 0%, rgba(10,10,16,0.55) 75%, transparent 100%) !important;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                }
                ytmusic-browse-response ytmusic-section-list-renderer > #header::after {
                    content: '';
                    position: absolute;
                    left: 0; right: 0; bottom: 0;
                    height: 2px;
                    background: linear-gradient(90deg,
                        #4fc0ff 0%, #4ffbdf 18%, #7cff4f 35%, #f6f05a 50%,
                        #ff8068 65%, #ff4e6f 82%, #c645b8 100%);
                    opacity: 0.75;
                    pointer-events: none;
                }
                ytmusic-chip-cloud-chip-renderer {
                    background: transparent !important;
                    border: none !important;
                }
                ytmusic-chip-cloud-chip-renderer .gradient-box {
                    border-radius: 999px !important;
                    background: rgba(0,0,0,0.45) !important;
                    border: 1px solid rgba(255,255,255,0.14) !important;
                    transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease !important;
                    overflow: hidden;
                }
                ytmusic-chip-cloud-chip-renderer a,
                ytmusic-chip-cloud-chip-renderer button {
                    border-radius: 999px !important;
                    background: transparent !important;
                    height: 36px !important;
                    min-height: 0 !important;
                    padding: 0 18px !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    white-space: nowrap;
                }
                ytmusic-chip-cloud-chip-renderer:hover .gradient-box {
                    background: rgba(255,255,255,0.12) !important;
                }
                ytmusic-chip-cloud-chip-renderer[is-selected] .gradient-box,
                ytmusic-chip-cloud-chip-renderer[aria-selected="true"] .gradient-box {
                    background: color-mix(in srgb, var(--ts-game-accent) 55%, rgba(0,0,0,0.35)) !important;
                    border-color: color-mix(in srgb, var(--ts-game-accent) 80%, transparent) !important;
                    box-shadow: 0 0 14px color-mix(in srgb, var(--ts-game-accent) 40%, transparent);
                }

                /* --- LAYER 3: PEROMBAKAN HOME => layout "song select" 1:1 --- */
                /* Seluruh konten home dipindah jadi KOLOM KANAN (daftar beatmap),
                   sisi kiri dibiarkan lapang untuk backdrop + panel info lagu,
                   persis pembagian layar song select game ritme. */
                ${HOME_SCOPE} {
                    width: min(65vw, 1000px) !important; /* Diperpanjang agar beatmap card bisa ditarik lebih jauh ke kiri */
                    margin-left: auto !important;
                    margin-right: 0 !important;
                }
                @media (max-width: 1100px) {
                    ${HOME_SCOPE} {
                        width: auto !important;
                        margin-left: 0 !important;
                    }
                }

                /* Carousel horizontal => TUMPUKAN VERTIKAL ala daftar beatmap.
                   SEMUA pembungkus dibuat overflow: visible supaya kartu bebas
                   melebar/mengecil (busur) & efek hover tak terpotong. */
                ${HOME_SCOPE} ytmusic-carousel,
                ${HOME_SCOPE} ytmusic-carousel-shelf-renderer,
                ${HOME_SCOPE} ytmusic-carousel .carousel,
                ${HOME_SCOPE} ytmusic-carousel #items-wrapper {
                    overflow: visible !important;
                }
                ${HOME_SCOPE} ytmusic-carousel ul#items {
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: flex-end !important;   /* kartu di-anchor ke KANAN */
                    gap: 4px !important;
                    width: 100% !important;
                    padding: 0 16px !important;          /* ruang utk hover */
                    transform: translateX(0) !important;
                    overflow: visible !important;
                    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease !important;
                }
                /* CATATAN: animasi keluar/masuk daftar home DULU dipasang di sini
                   (translateX(120%) + ts-game-carousel-in pada <ul#items>) dan
                   sering tidak jalan — <ul#items> di-stamp ulang Polymer setelah
                   class pemicunya keburu dilepas, dan saat player page terbuka
                   #content ber-display:none sehingga animasinya tak pernah mulai.
                   Sekarang ditangani mesin transisi di bagian atas berkas ini,
                   pada CANGKANG halaman yang selalu ada selama halaman tampil. */
                ${HOME_SCOPE} ytmusic-grid-renderer #items {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 8px !important;
                }
                /* Panah geser carousel tidak relevan lagi di layout vertikal */
                ${HOME_SCOPE} ytmusic-carousel-shelf-basic-header-renderer yt-icon-button {
                    display: none !important;
                }

                /* KARTU BEATMAP 1:1 — artwork full-bleed jadi BACKGROUND kartu,
                   scrim gelap di sisi kiri, judul+info menumpang di atasnya,
                   tepi aksen kiri dari palet. Hover = kartu menggeser ke kiri
                   dengan outline putih, persis kartu terpilih di carousel game. */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer {
                    position: relative !important;
                    display: flex !important;
                    flex-direction: row !important;
                    align-items: stretch !important;
                    width: 100% !important;
                    margin: 0 0 0 auto !important;
                    /* BUSUR via CSS Scroll-Driven Animation — kompositor browser
                       menghitung scaleX langsung dari posisi scroll kartu di viewport.
                       Poros kanan => mengecil dari kiri (tepi resede), tengah penuh. */
                    transform-origin: right center !important;
                    animation: ts-game-arc-scale linear both !important;
                    animation-timeline: view(block) !important;
                    min-height: 110px !important;
                    max-height: 110px !important;
                    padding: 0 !important;
                    border-left: 6px solid var(--ts-game-accent) !important;
                    border-radius: 12px 6px 6px 12px !important;
                    overflow: hidden !important;
                    background: rgba(10,10,16,0.7) !important;
                    outline: 2px solid transparent;
                    outline-offset: -2px;
                    transition: border-left-width 0.2s ease, box-shadow 0.2s ease, outline-color 0.2s ease, filter 0.2s ease !important;
                    will-change: transform;
                }
                /* Hover: sorotan TANPA ubah ukuran (outline + sedikit terang + glow)
                   supaya tak bentrok dgn transform busur CSS scroll-driven. */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer:hover {
                    outline-color: rgba(255,255,255,0.9);
                    filter: brightness(1.1);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.55),
                                0 0 18px color-mix(in srgb, var(--ts-game-accent) 35%, transparent);
                    z-index: 3;
                }
                /* Kartu yang sedang DI TENGAH (siap diputar sekali klik) => disorot,
                   gema "beatmap terpilih" di song-select. */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer.ts-game-card-centered {
                    outline-color: rgba(255,255,255,0.92) !important;
                    border-left-width: 16px !important;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.6),
                                0 0 26px color-mix(in srgb, var(--ts-game-accent) 50%, transparent) !important;
                    z-index: 4 !important;
                }
                /* Link gambar direntangkan ke seluruh kartu => seluruh kartu klikabel */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer a.image-wrapper {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    margin: 0 !important;
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 0 !important;
                    overflow: hidden;
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer yt-img-shadow,
                ${HOME_SCOPE} ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer img {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    /* Mengarahkan fokus potongan (crop) lebih ke atas agar area kepala/wajah tidak hilang */
                    object-position: center 25% !important;
                    border-radius: 0 !important;
                    transition: transform 0.35s ease;
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer:hover ytmusic-thumbnail-renderer img {
                    transform: scale(1.05);
                }
                /* Scrim agar teks terbaca di atas artwork */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg,
                        rgba(8,8,12,0.95) 0%, rgba(8,8,12,0.85) 45%,
                        rgba(8,8,12,0.4) 75%, rgba(8,8,12,0.05) 100%);
                    z-index: 1;
                    pointer-events: none;
                }
                /* Overlay play/speaker tetap di atas scrim agar terlihat & klikabel */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer ytmusic-item-thumbnail-overlay-renderer {
                    z-index: 2;
                }
                /* Teks di atas semua layer; area kosongnya tembus klik ke kartu.
                   COUNTER-SCALE: kartu di-scaleX(f) untuk busur => teks ikut gepeng.
                   JS membalas dgn 'transform: scaleX(1/f)' LANGSUNG ke elemen ini
                   (poros kiri) supaya TEKS tetap proporsional & terbaca. Yang sedikit
                   gepeng hanya gambar latar. */
                ${HOME_SCOPE} ytmusic-two-row-item-renderer .details {
                    position: relative;
                    z-index: 2;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    width: 72%;
                    margin: 0 !important;
                    padding: 4px 16px !important;
                    pointer-events: none;
                    transform-origin: left center;
                    /* Counter-scale: membalas scaleX busur kartu agar teks tetap
                       proporsional. Juga digerakkan CSS scroll-driven animation. */
                    animation: ts-game-arc-counter linear both;
                    animation-timeline: view(block);
                    will-change: transform;
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer .details a {
                    pointer-events: auto;
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer .details .title {
                    font-size: 16px !important;
                    font-weight: 700 !important;
                    line-height: 1.3 !important;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
                }
                ${HOME_SCOPE} ytmusic-two-row-item-renderer .details .subtitle {
                    font-size: 12px !important;
                    opacity: 0.88;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                }

                /* Header shelf dikecilkan jadi label grup ringkas di atas tumpukan
                   kartu (gema teks "298 matches" di atas daftar beatmap). */
                ${HOME_SCOPE} ytmusic-carousel-shelf-basic-header-renderer {
                    padding: 2px 4px !important;
                    margin: 14px 0 8px 0 !important;
                }
                ${HOME_SCOPE} ytmusic-carousel-shelf-basic-header-renderer .title,
                ${HOME_SCOPE} ytmusic-carousel-shelf-basic-header-renderer .title a {
                    font-size: 17px !important;
                    font-weight: 700 !important;
                    letter-spacing: 0.4px;
                    text-shadow: 0 1px 6px rgba(0,0,0,0.7);
                }
                ${HOME_SCOPE} ytmusic-carousel-shelf-basic-header-renderer img {
                    width: 28px !important;
                    height: 28px !important;
                }

                /* Baris lagu di halaman lain (list item): versi ramping kartu beatmap */
                ytmusic-responsive-list-item-renderer {
                    background: rgba(10,10,16,0.55) !important;
                    border-left: 4px solid color-mix(in srgb, var(--ts-game-accent) 75%, transparent) !important;
                    border-radius: 10px !important;
                    margin: 3px 0 !important;
                    transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease !important;
                }
                ytmusic-responsive-list-item-renderer:hover {
                    background: rgba(255,255,255,0.08) !important;
                    transform: translateX(-6px);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                }

                /* Aksen umum header shelf (semua halaman) */
                ytmusic-carousel-shelf-basic-header-renderer .strapline,
                ytmusic-carousel-shelf-basic-header-renderer .strapline-text {
                    color: var(--ts-game-glow) !important;
                    letter-spacing: 1.5px;
                }
                ytmusic-carousel-shelf-basic-header-renderer img {
                    border-radius: 50% !important;
                    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ts-game-accent) 60%, transparent);
                }
                ytmusic-carousel-shelf-basic-header-renderer yt-button-renderer,
                ytmusic-carousel-shelf-basic-header-renderer .more-button {
                    border-radius: 999px !important;
                    background: rgba(0,0,0,0.45) !important;
                    border: 1px solid rgba(255,255,255,0.12) !important;
                }

                /* --- LAYER 4: Player bar => toolbar bawah game + wedge pink --- */
                #player-bar-background { background: transparent !important; }
                ytmusic-player-bar {
                    background: rgba(14, 14, 20, 0.92) !important;
                    border-top: 1px solid rgba(255,255,255,0.08) !important;
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    /* Pertahankan clipping/original geometry player bar Game Lobby. */
                    overflow: hidden;
                }
                /* Wedge pink miring khas tombol "Kembali" game, jadi alas kontrol kiri */
                ytmusic-player-bar::before {
                    content: '';
                    position: absolute;
                    top: 0; bottom: 0;
                    left: -28px;
                    width: 250px;
                    background: linear-gradient(135deg, #ff70ab 0%, #e0457f 100%);
                    transform: skewX(-18deg);
                    box-shadow: 0 0 24px rgba(255, 90, 150, 0.45);
                    z-index: 0;
                    pointer-events: none;
                }
                ytmusic-player-bar #left-controls,
                ytmusic-player-bar .middle-controls,
                ytmusic-player-bar .right-controls {
                    position: relative;
                    z-index: 1;
                }
                /* Pertahankan posisi asli slider; hanya naikkan hit-area di atas
                   dekorasi agar bisa dijangkau kursor. Jangan override position. */
                ytmusic-player-bar #progress-bar,
                ytmusic-player-bar tp-yt-paper-slider.progress-bar,
                ytmusic-player-bar tp-yt-paper-slider[role="slider"] {
                    z-index: 3 !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                }
                ytmusic-player-bar #left-controls .time-info {
                    color: #ffffff !important;
                    font-weight: 600;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.35);
                }
                ytmusic-player-bar .middle-controls img {
                    border-radius: 6px !important;
                    object-fit: contain !important;
                }

                /* --- LAYER 5: Player page => layar "loading beatmap" --- */
                /* Hilangkan letterbox gelap di belakang artwork */
                ytmusic-player,
                ytmusic-player #player,
                ytmusic-player #song-image,
                ytmusic-player #song-media-window,
                ytmusic-player-page #player,
                ytmusic-player-page #main-panel #player {
                    background: transparent !important;
                    box-shadow: none !important;
                }
                /* Artwork bundar ber-ring putih, gema dari logo game! di layar loading */
                ytmusic-player-page #song-image,
                ytmusic-player-page #song-image img,
                ytmusic-player-page #thumbnail,
                ytmusic-player #song-image img {
                    border-radius: 50% !important;
                    box-shadow:
                        0 0 0 6px rgba(255,255,255,0.92),
                        0 0 0 7px rgba(0,0,0,0.15),
                        0 18px 60px rgba(0,0,0,0.45),
                        0 0 40px color-mix(in srgb, var(--ts-game-glow) 35%, transparent) !important;
                }
                /* Denyut halus saat lagu berjalan (logo game! berdetak ke musik) */
                html.ts-game-lobby-uimod body:has(ytmusic-player-bar[play-button-state="playing"]) ytmusic-player-page #song-image img {
                    animation: ts-game-logo-pulse 2.4s ease-in-out infinite;
                }
                /* Video tetap kotak rounded, jangan dipaksa bundar */
                ytmusic-player-page #song-video,
                ytmusic-player-page #song-video video {
                    border-radius: 16px !important;
                    animation: none !important;
                }

                /* Panel queue kanan => panel "PENGATURAN" frosted beraksen kuning */
                ytmusic-player-queue {
                    background: rgba(255,255,255,0.1) !important;
                    backdrop-filter: blur(26px) saturate(1.2);
                    -webkit-backdrop-filter: blur(26px) saturate(1.2);
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,0.18);
                }
                ytmusic-player-queue #contents,
                ytmusic-player-queue ytmusic-tab-renderer,
                ytmusic-player-queue #tab-content {
                    background: transparent !important;
                }
                tp-yt-paper-tabs, paper-tabs {
                    --paper-tabs-selection-bar-color: #ffd966;
                }
                ytmusic-player-page .tab-header {
                    font-weight: 700 !important;
                    letter-spacing: 1px;
                }
                ytmusic-player-queue-item {
                    border-radius: 8px !important;
                    transition: background 0.2s ease !important;
                }
                ytmusic-player-queue-item:hover {
                    background: rgba(255,255,255,0.08) !important;
                }
                ytmusic-player-queue-item[selected],
                ytmusic-player-queue-item[play-button-state="playing"],
                ytmusic-player-queue-item[play-button-state="paused"] {
                    background: rgba(255, 217, 102, 0.2) !important;
                    box-shadow: inset 3px 0 0 #ffd966;
                }

                /* ============================================================
                   KEHADIRAN ISI ANTREAN (panel "BERIKUTNYA" di player page)

                   Antrean di-render belakangan. Begitu player page terbuka,
                   <ytmusic-player-queue id="queue"> masih kosong; beberapa saat
                   kemudian Polymer men-stamp <ytmusic-queue-header-renderer>,
                   #steering-chips, lalu deretan <ytmusic-player-queue-item> di
                   dalam #contents. Tanpa penanganan, isinya "nongol" sekaligus di
                   panel frosted yang tadinya kosong.

                   Animasinya sengaja TIDAK digantungkan pada jendela waktu apa pun.
                   Rule-nya berada di bawah 'html.ts-player-page-open', jadi
                   animasi mulai sendiri pada dua momen yang tepat:
                     - elemen LAHIR ketika player page sedang terbuka  -> ikut main;
                     - elemen sudah ada lalu player page BARU DIBUKA   -> ikut main,
                       karena rule-nya baru berlaku saat itu.
                   Tidak ada setTimeout yang bisa keburu habis, dan isi yang datang
                   menyusul (autoplay menambah lagu, atau balik dari tab LIRIK)
                   tetap kebagian.

                   Dua pilihan yang disengaja:
                   - fill-mode 'backwards', BUKAN 'both'. Sesudah selesai, elemen
                     kembali ke gaya normalnya. Dengan 'both', penyisipan item baru
                     di tengah daftar menggeser urutan => animation-delay berubah =>
                     item yang sudah settle bisa berkedip transparan lagi.
                   - ':nth-of-type', BUKAN ':nth-child'. #contents juga memuat
                     <dom-if>/<template> milik Polymer yang ikut terhitung sebagai
                     anak; menghitung per nama-tag membuat urutannya tetap benar.
                   ============================================================ */
                @keyframes ts-queue-in {
                    from { opacity: 0; transform: translate3d(16px, 0, 0); }
                    to   { opacity: 1; transform: translate3d(0, 0, 0); }
                }

                /* Kepala panel: "Diputar dari <nama mix>" + tombol Simpan. */
                html.ts-player-page-open ytmusic-tab-renderer ytmusic-queue-header-renderer {
                    animation: ts-queue-in 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
                }
                /* Baris chip penyaring antrean ("Semua / musik J-pop / Ceria / ..."). */
                html.ts-player-page-open ytmusic-player-queue > #steering-chips {
                    animation: ts-queue-in 420ms cubic-bezier(0.22, 1, 0.36, 1) 70ms backwards;
                }
                /* Baris lagu: menyusul bertahap dari kanan, mengikuti arah panel. */
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item {
                    animation: ts-queue-in 380ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
                }
                /* Tangga delay dibatasi delapan baris teratas — itu yang benar-benar
                   terlihat; sisanya menyusul serempak supaya antrean panjang tidak
                   terasa lambat merangkak. */
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(1) { animation-delay: 140ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(2) { animation-delay: 172ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(3) { animation-delay: 204ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(4) { animation-delay: 236ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(5) { animation-delay: 268ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(6) { animation-delay: 300ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(7) { animation-delay: 332ms; }
                html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item:nth-of-type(n+8) { animation-delay: 364ms; }

                @media (prefers-reduced-motion: reduce) {
                    html.ts-player-page-open ytmusic-tab-renderer ytmusic-queue-header-renderer,
                    html.ts-player-page-open ytmusic-player-queue > #steering-chips,
                    html.ts-player-page-open ytmusic-player-queue > #contents > ytmusic-player-queue-item {
                        animation-duration: 1ms !important;
                        animation-delay: 0ms !important;
                    }
                }

                /* --- LAYER 6: Panel info lagu (DOM #ts-game-info-panel) --- */
                /* Mode home: panel KIRI-ATAS di area lapang sisi kiri, persis posisi
                   panel info beatmap di song select (teks di atas scrim gradien,
                   kolom statistik bergaris atas seperti tabel CS/AR/HP). */
                #ts-game-info-panel {
                    position: fixed;
                    left: 96px;
                    top: 84px;
                    z-index: 6;
                    max-width: min(38vw, 540px);
                    padding: 18px 30px 16px 18px;
                    pointer-events: none;
                    color: #fff;
                    background: linear-gradient(90deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.35) 75%, transparent 100%);
                    border-left: 4px solid var(--ts-game-accent, #ff70ab);
                    border-radius: 0 14px 14px 0;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                }
                #ts-game-info-panel.ts-game-panel-in {
                    animation: ts-game-panel-in 0.45s ease;
                }
                /* Di mode player, panel duduk terpusat di bawah artwork — masuknya
                   naik dari bawah, bukan menggeser dari kiri seperti di home. */
                html.ts-player-page-open #ts-game-info-panel.ts-game-panel-in {
                    animation: ts-game-panel-in-center 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }
                #ts-game-info-panel .ts-game-badge {
                    display: inline-block;
                    background: #b8f37c;
                    color: #243a0a;
                    font-size: 10px;
                    font-weight: 800;
                    letter-spacing: 1.6px;
                    border-radius: 999px;
                    padding: 3px 12px;
                    margin-bottom: 8px;
                }
                #ts-game-info-panel .ts-game-title {
                    font-size: 36px;
                    font-weight: 300;
                    line-height: 1.15;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.7);
                    overflow: hidden;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }
                #ts-game-info-panel .ts-game-artist {
                    font-size: 16px;
                    opacity: 0.92;
                    margin-top: 2px;
                    text-shadow: 0 1px 6px rgba(0,0,0,0.7);
                }
                #ts-game-info-panel .ts-game-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 10px;
                }
                #ts-game-info-panel .ts-game-star-pill {
                    background: var(--ts-game-accent, #ff70ab);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 2px 10px;
                    border-radius: 999px;
                    box-shadow: 0 0 10px color-mix(in srgb, var(--ts-game-accent) 45%, transparent);
                }
                #ts-game-info-panel .ts-game-meta-text {
                    font-size: 12.5px;
                    opacity: 0.95;
                    text-shadow: 0 1px 4px rgba(0,0,0,0.7);
                }
                #ts-game-info-panel .ts-game-stats {
                    display: flex;
                    gap: 22px;
                    margin-top: 12px;
                }
                #ts-game-info-panel .ts-game-stat {
                    border-top: 2px solid rgba(255,255,255,0.85);
                    padding-top: 4px;
                    min-width: 64px;
                    max-width: 150px;
                }
                #ts-game-info-panel .ts-game-stat-label {
                    font-size: 10.5px;
                    opacity: 0.8;
                    letter-spacing: 0.4px;
                }
                #ts-game-info-panel .ts-game-stat-value {
                    font-size: 13px;
                    font-weight: 600;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                @media (max-width: 1000px) {
                    #ts-game-info-panel { display: none; }
                }

                /* Mode player page: panel berubah jadi info terpusat di bawah artwork
                   ("No title / Reol / Celsius' Easy" di screenshot loading). */
                html.ts-player-page-open #ts-game-info-panel {
                    left: 0;
                    right: 36vw;
                    top: auto;
                    bottom: 110px;
                    max-width: none;
                    background: none;
                    border-left: none;
                    backdrop-filter: none;
                    -webkit-backdrop-filter: none;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }
                html.ts-player-page-open #ts-game-info-panel .ts-game-title {
                    font-size: 34px;
                    max-width: 560px;
                }
                html.ts-player-page-open #ts-game-info-panel .ts-game-stats {
                    justify-content: center;
                }
                html.ts-player-page-open #ts-game-info-panel .ts-game-stat {
                    border-top-color: rgba(255,255,255,0.65);
                    text-align: center;
                }
                /* Layout sempit: queue pindah ke bawah, info kembali ke tengah penuh */
                @media (max-width: 936px) {
                    html.ts-player-page-open #ts-game-info-panel { right: 0; }
                }

                /* --- Detail: scrollbar tipis aksen --- */
                html::-webkit-scrollbar, body::-webkit-scrollbar,
                ytmusic-app::-webkit-scrollbar, ytmusic-app *::-webkit-scrollbar {
                    width: 6px;
                    background: transparent;
                }
                html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb,
                ytmusic-app::-webkit-scrollbar-thumb, ytmusic-app *::-webkit-scrollbar-thumb {
                    background: color-mix(in srgb, var(--ts-game-accent) 55%, transparent) !important;
                    border-radius: 3px;
                }
                .title, .subtitle, .byline,
                ytmusic-player-bar .title, ytmusic-player-bar .byline {
                    text-shadow: 0 1px 4px rgba(0,0,0,0.6);
                }

                /* ============================================================
                   LAYER 7a — HOME: hapus hero "immersive-background"
                   Background cover raksasa bawaan home (is-background) ditiadakan;
                   sebagai gantinya backdrop "song select" kita (body::before) yang
                   dipakai. Banner channel (.image, tanpa is-background) tidak kena.
                   ============================================================ */
                ytmusic-browse-response #background.immersive-background,
                ytmusic-browse-response .immersive-background,
                ytmusic-fullbleed-thumbnail-renderer[is-background] {
                    display: none !important;
                }

                /* ============================================================
                   LAYER 7b — NAVBAR: hamburger guide-button tak diperlukan lagi
                   (semua isi guide sudah dipindah jadi deretan ikon di navbar).
                   Rel mini-guide kiri juga disembunyikan karena isinya sudah pindah;
                   ruang kirinya jadi lapang untuk backdrop "song select".
                   ============================================================ */
                ytmusic-nav-bar #guide-button {
                    display: none !important;
                }
                /* Rel mini-guide kiri hanya disembunyikan SETELAH isinya benar-benar
                   pindah ke navbar (class ts-game-guide-relocated diset oleh JS).
                   Kalau relokasi gagal, rel asli tetap tampil agar tombol tak hilang. */
                html.ts-game-guide-relocated #mini-guide,
                html.ts-game-guide-relocated #mini-guide-background,
                html.ts-game-guide-relocated #mini-guide-spacer {
                    display: none !important;
                    width: 0 !important;
                }

                /* ============================================================
                   LAYER 7c — NAVBAR: deretan tombol "cermin" guide (IKON saja)
                   Tombol di sini adalah <button class="ts-game-nav-btn"> POLOS buatan
                   sendiri (lihat buildNavbarGuide di JS), BUKAN node Polymer YTM —
                   makanya layout-nya stabil walau halaman berganti-ganti.
                   ============================================================ */

                /* PENTING: secara default kotak search (.center-content) YTM dipasang
                   'position:absolute; left:50%; translateX(-50%)' (mengambang di
                   TENGAH, lepas dari alur), sehingga MENUTUPI strip tombol kita.
                   Saat tombol aktif (ts-game-guide-relocated), kembalikan navbar jadi
                   baris flex normal: [logo][tombol][search] berurutan, tak tumpuk.
                   right-content (cast/avatar) dibiarkan absolut mengambang di kanan. */
                html.ts-game-guide-relocated ytmusic-nav-bar {
                    justify-content: flex-start !important;
                }
                html.ts-game-guide-relocated ytmusic-nav-bar .center-content {
                    position: static !important;
                    transform: none !important;
                    left: auto !important;
                    margin-left: 0 !important;
                    width: auto !important;
                    flex: 0 1 auto !important;
                    justify-content: flex-start !important;
                    padding-left: 0 !important;
                }
                html.ts-game-guide-relocated ytmusic-nav-bar .center-content ytmusic-search-box {
                    margin-left: 0 !important;
                }

                ytmusic-nav-bar #ts-game-navbar-guide {
                    display: flex !important;
                    align-items: center;
                    gap: 24px;
                    /* Jarak lega: kiri dari logo, kanan ke kotak search */
                    margin: 0 22px 0 28px;
                    padding: 0 2px;
                    /* Jangan menyusut: tampilkan tombol apa adanya (dibatasi max-width,
                       lebihnya bisa di-scroll horizontal) supaya tak terdesak search. */
                    flex: 0 0 auto;
                    max-width: 56vw;
                    overflow-x: auto;
                    overflow-y: hidden;
                    scrollbar-width: none;
                }
                ytmusic-nav-bar #ts-game-navbar-guide::-webkit-scrollbar {
                    width: 0 !important;
                    height: 0 !important;
                    background: transparent !important;
                }
                /* Ubin ikon 38x38 yang seragam & SELALU terlihat (latar sendiri). */
                ytmusic-nav-bar #ts-game-navbar-guide .ts-game-nav-btn {
                    flex: 0 0 auto;
                    box-sizing: border-box;
                    width: 28px;
                    height: 28px;
                    margin: 0;
                    padding: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    border-radius: 9px;
                    background: rgba(255,255,255,0.07);
                    color: #fff;
                    cursor: pointer;
                    transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
                }
                ytmusic-nav-bar #ts-game-navbar-guide .ts-game-nav-btn:hover {
                    background: rgba(255,255,255,0.18);
                    transform: translateY(-1px);
                }
                /* Ikon (SVG clone) — putih, ukuran pas */
                ytmusic-nav-bar #ts-game-navbar-guide .ts-game-nav-btn svg {
                    width: 22px;
                    height: 22px;
                    fill: #fff;
                    color: #fff;
                    pointer-events: none;
                    opacity: 0.95;
                }
                /* Inisial untuk playlist (yang tak punya ikon) */
                ytmusic-nav-bar #ts-game-navbar-guide .ts-game-nav-btn .ts-game-nav-initial {
                    font-size: 14px;
                    font-weight: 800;
                    line-height: 1;
                    color: #fff;
                    opacity: 0.95;
                }

                /* ============================================================
                   LAYER 7d — CHANNEL: banner + content dibungkus balok TRAPESIUM
                   menggantung di kiri. Kiri lurus nempel batas layar; hanya sudut
                   miring kanan yang terlihat. Bentuknya ELONGATED & KONSISTEN
                   (aspect-ratio tetap), TIDAK bergantung ukuran gambar — gambar
                   sekadar mengisi via object-fit: cover.

                   Animasi "in" diadaptasi dari referensi panel lobby (rotate+scale+
                   fade, easing cubic-bezier(.22,1,.36,1)), tapi PORosnya digeser ke
                   KIRI (transform-origin: left center) sesuai posisi kiri kita, dan
                   mulai miring ke bawah (rotate +deg => ujung kanan turun) lalu lurus.
                   Efek glow "settled" baru dinyalakan SETELAH animasi gerak selesai
                   (animation-delay) supaya mulus/tak nge-lag — seperti .ldp-settled.
                   ============================================================ */
                @keyframes ts-game-trapezoid-in {
                    from { opacity: 0; transform: rotate(4deg) scale(0.97); }
                    to   { opacity: 1; transform: rotate(0deg) scale(1); }
                }
                @keyframes ts-game-trapezoid-settle {
                    from {
                        border-color: transparent;
                        box-shadow: inset 0 0 0 0 transparent;
                    }
                    to {
                        border-color: color-mix(in srgb, var(--ts-game-glow, #00aeef) 40%, transparent);
                        box-shadow:
                            inset 0 0 18px color-mix(in srgb, var(--ts-game-glow, #00aeef) 20%, transparent),
                            inset 0 0 40px color-mix(in srgb, var(--ts-game-glow, #00aeef) 8%, transparent);
                    }
                }
                /* Balok trapesium — berlaku untuk KEDUA jenis header channel:
                   - kasus 1: ytmusic-immersive-header-renderer
                   - kasus 2: ytmusic-visual-header-renderer */
                ytmusic-browse-response ytmusic-immersive-header-renderer,
                ytmusic-browse-response ytmusic-visual-header-renderer {
                    position: relative !important;
                    display: block !important;
                    box-sizing: border-box !important;
                    width: min(64vw, 960px) !important;
                    /* Tinggi = 5/16 lebar => balok memanjang & konsisten, lepas dari
                       ukuran gambar. (Konten dijadikan overlay absolut di bawah supaya
                       tidak ikut menambah tinggi.) */
                    aspect-ratio: 16 / 5 !important;
                    min-height: 0 !important;
                    margin: 88px auto 0 0 !important;
                    background: var(--ts-game-deep, #101018) !important;
                    border: 1px solid transparent !important;   /* untuk glow "settled" */
                    /* Trapesium: kiri lurus (x=0), kanan miring (bawah-kanan ditarik masuk) */
                    -webkit-clip-path: polygon(0 0, 100% 0, calc(100% - 96px) 100%, 0 100%);
                    clip-path: polygon(0 0, 100% 0, calc(100% - 96px) 100%, 0 100%);
                    border-radius: 0 !important;
                    overflow: hidden !important;
                    transform-origin: left center !important;   /* mengayun dari sisi kiri */
                    /* TANPA !important supaya JS bisa memutar-ulang animasi (replay)
                       saat header dipakai-ulang antar-channel (lihat replayTrapezoid). */
                    animation: ts-game-trapezoid-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both,
                               ts-game-trapezoid-settle 520ms ease 380ms both;
                    /* drop-shadow (bukan box-shadow) karena elemen ber-clip-path tak bisa
                       menampilkan box-shadow biasa. */
                    filter: drop-shadow(-4px 10px 22px rgba(0,0,0,0.45));
                    will-change: transform, opacity;
                    backface-visibility: hidden;
                }
                /* Banner mengisi penuh balok (kedua jenis header), apa pun ukurannya */
                ytmusic-browse-response ytmusic-immersive-header-renderer ytmusic-fullbleed-thumbnail-renderer.image,
                ytmusic-browse-response ytmusic-immersive-header-renderer ytmusic-fullbleed-thumbnail-renderer.image picture,
                ytmusic-browse-response ytmusic-immersive-header-renderer ytmusic-fullbleed-thumbnail-renderer.image img,
                ytmusic-browse-response ytmusic-visual-header-renderer ytmusic-fullbleed-thumbnail-renderer.image,
                ytmusic-browse-response ytmusic-visual-header-renderer ytmusic-fullbleed-thumbnail-renderer.image picture,
                ytmusic-browse-response ytmusic-visual-header-renderer ytmusic-fullbleed-thumbnail-renderer.image img {
                    position: absolute !important;
                    inset: 0 !important;
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: cover !important;
                    object-position: center center !important;
                }
                /* content (judul/avatar + tombol) jadi OVERLAY absolut di bawah balok
                   => tidak ikut menentukan tinggi (tinggi tetap konsisten via aspect).
                   Beri ruang kanan supaya tombol tak kena sudut miring trapesium. */
                ytmusic-browse-response ytmusic-immersive-header-renderer .content-container-wrapper,
                ytmusic-browse-response ytmusic-visual-header-renderer .gradient-container {
                    position: absolute !important;
                    left: 0 !important;
                    right: 0 !important;
                    bottom: 0 !important;
                    z-index: 1;
                }
                ytmusic-browse-response ytmusic-immersive-header-renderer .content-container,
                ytmusic-browse-response ytmusic-visual-header-renderer .content-container {
                    padding-right: 116px !important;
                }
            `;

            // JANGAN tulis ulang kalau isinya sama persis. applyDynamicTheme()
            // dipanggil SETIAP kali lagu berganti; mengganti teks <style> berarti
            // seluruh rule dicabut lalu dipasang lagi, dan itu me-RESET semua
            // animasi CSS yang sedang berjalan — termasuk animasi transisi halaman
            // yang baru saja dimulai saat kita mengklik kartu (lagu memang berganti
            // tepat di momen itu). Inilah penyebab utama animasi "in" home terasa
            // suka hilang. Warna tetap ikut berubah karena palet dikirim lewat CSS
            // variable di :root, bukan lewat teks stylesheet ini.
            if (gameStyle.textContent !== gameCss) gameStyle.textContent = gameCss;

            // Variabel native YTM: player page transparan (backdrop blur kita yang tampil)
            set('--ytmusic-player-page-background', 'transparent');
            unset('--ytmusic-nav-bar');

            // Panel info lagu bergaya game (DOM), diperbarui tiap ganti lagu
            renderGameInfoPanel();

            // Pindahkan tombol-tombol guide ke navbar (deretan ikon).
            relocateGuideButtonsToNavbar();

            // Lacak header channel (untuk replay animasi trapesium saat dipakai-ulang).
            replayTrapezoidIfReused();

            // Aktifkan efek busur + klik-ke-tengah di carousel home.
            initGameCarousel();

            // Aktifkan mesin transisi antar-halaman (idempoten).
            initGamePageTransitions();

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

let tsWasPlayerOpen = false;

let tsPlayerAnimTimer = null;

function syncPlayerPageOpenState() {
    const root = document.documentElement;

    // Full player page open: either the player-page has [player-page-open]
    // or the app layout indicates [player-page-open].
    const isOpen = !!(
        document.querySelector('ytmusic-player-page[player-page-open]') ||
        document.querySelector('ytmusic-app-layout[player-page-open]')
    );

    // Observer pemanggilnya sengaja longgar (ikut memantau 'style'/'hidden'),
    // jadi fungsi ini terpanggil sangat sering. Kalau state-nya TIDAK berubah,
    // jangan sentuh apa pun: dulu justru di sinilah animasi masuk sempat dipicu
    // berkali-kali lalu saling memotong sehingga sering tak sempat terlihat.
    if (isOpen === tsWasPlayerOpen) {
        root.classList.toggle('ts-player-page-open', isOpen);
        return;
    }
    tsWasPlayerOpen = isOpen;
    root.classList.toggle('ts-player-page-open', isOpen);

    if (!isGameLobbyMode()) return;

    clearTimeout(tsPlayerAnimTimer);

    if (isOpen) {
        // MASUK player page. 'ts-player-exiting' menahan #content tetap ter-render
        // selama animasi keluar (base style menyembunyikannya begitu player
        // terbuka, padahal animasi tak pernah mulai dari display:none). Setelah
        // animasinya selesai, konten ditahan transparan — jadi saat player ditutup
        // nanti ia sudah siap masuk, tanpa berkedip muncul penuh dulu.
        root.classList.add('ts-player-exiting');
        tsPageOut();
        tsPlayerAnimTimer = setTimeout(() => {
            root.classList.remove('ts-player-exiting');
            tsPageHold();
            tsApplyPageType('player');
        }, TS_PAGE_OUT_MS + 60);
    } else {
        // KELUAR player page: #content terlihat lagi (masih ditahan transparan),
        // tinggal mainkan animasi masuk halaman yang aktif sekarang.
        root.classList.remove('ts-player-exiting');
        // Jeda kecil supaya urutannya terbaca: player page menyelesaikan gerak
        // turunnya dulu, BARU daftar halaman kembali masuk — bukan dua gerakan
        // yang saling menimpa di frame yang sama.
        tsSchedulePageIn(140);
    }

    // Panel info berpindah posisi antara mode home & mode player; tanpa replay
    // animasinya, dia cuma melompat.
    replayGamePanelIn();
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
    if (newMode !== 'game-lobby-uimod' && newMode?.endsWith('-lobby-uimod')) newMode = 'game-lobby-uimod';
    const sanitizedMode = newMode === 'unified'
        ? 'overlay'
        : (newMode === 'default' ? 'default-optimized' : newMode);
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
    const styleIds = ['ts-overlay-mode-styles', 'ts-unified-mode-styles', 'ts-harmony-mode-styles', 'ts-default-optimized-styles', 'ts-seamless-mode-styles', 'ts-aurora-uimod-styles', 'ts-game-lobby-uimod-styles', 'ts-base-styles'];
    document.documentElement.classList.remove('ts-aurora-uimod');
    document.documentElement.classList.remove('ts-game-lobby-uimod');
    const gameInfoPanel = document.getElementById('ts-game-info-panel');
    if (gameInfoPanel) gameInfoPanel.remove();
    const gameBgEl = document.getElementById('ts-game-bg');
    if (gameBgEl) gameBgEl.remove();
    // Kembalikan tombol guide yang sempat dipindah ke navbar.
    restoreGuideButtons();
    teardownGameCarousel();
    teardownGamePageTransitions();
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

        // Aurora (ui mod) mode variables
        '--ts-aurora-primary',
        '--ts-aurora-secondary',
        '--ts-aurora-accent',
        '--ts-aurora-glow',
        '--ts-aurora-deep',
        '--ts-aurora-artwork',

        // Game Lobby (ui mod) mode variables
        '--ts-game-primary',
        '--ts-game-secondary',
        '--ts-game-accent',
        '--ts-game-glow',
        '--ts-game-deep',
        '--ts-game-artwork',

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
window.enableDynamicTheme = function (mode = 'default-optimized') {
    // Pengaturan pengguna sengaja TIDAK diubah. Host tetap boleh memanggil ini
    // kapan saja; begitu webview kembali ke YouTube Music, panggilan berikutnya
    // akan lolos dan tema menyala lagi seperti semula.
    if (!isHostDidukung()) {
        console.log('[DynamicTheme] Host tidak didukung (' + location.hostname + '), tema dilewati.');
        try { window.disableDynamicTheme(); } catch (_) { }
        return;
    }
    if (mode !== 'game-lobby-uimod' && mode?.endsWith('-lobby-uimod')) mode = 'game-lobby-uimod';
    const sanitizedMode = mode === 'unified'
        ? 'overlay'
        : (mode === 'default' ? 'default-optimized' : mode);
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
    // Halaman login Google dan halaman non-YTM lain tidak boleh disentuh sama
    // sekali. Keluar sebelum menyuntik style, memasang observer, atau menempel
    // panel kecepatan ke <body>.
    if (!isHostDidukung()) {
        console.log('[DynamicTheme] Bukan YouTube Music (' + location.hostname + '), skrip tidak diaktifkan.');
        try {
            window.__gapDynamicThemeLoaded = true;
            window.__gapDynamicThemeVersion = '2.1';
            window.__gapDynamicThemeHostSkipped = true;
        } catch (_) { }
        return;
    }

    injectBaseStyles();
    initPlayerUiObserver();
    // --- GAME MODS: SPEED CONTROLLER (HT, DT) ---
    function initSpeedMods() {
        // Tanam CSS ke document.head
        if (!document.getElementById('ts-speed-mods-style')) {
            const style = document.createElement('style');
            style.id = 'ts-speed-mods-style';
            style.textContent = `
                #ts-speed-mods-container {
                    position: fixed;
                    right: 32px;
                    bottom: 100px; /* Melayang pas di atas player-bar */
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    z-index: 999999;
                    background: rgba(0, 0, 0, 0.4);
                    padding: 6px;
                    border-radius: 12px;
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .ts-mod-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 11px;
                    font-weight: bold;
                    padding: 6px 12px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    outline: none;
                }
                .ts-mod-btn:hover { background: rgba(255, 255, 255, 0.25); color: #fff; }
                .ts-mod-btn.active {
                    background: var(--ts-game-accent, #ff70ab);
                    border-color: transparent;
                    color: #000;
                    box-shadow: 0 0 16px color-mix(in srgb, var(--ts-game-accent, #ff70ab) 60%, transparent);
                    transform: scale(1.05) translateY(-2px);
                }
            `;
            document.head.appendChild(style);
        }

        setInterval(() => {
            if (document.getElementById('ts-speed-mods-container')) return;

            const container = document.createElement('div');
            container.id = 'ts-speed-mods-container';
            container.innerHTML = `
                <button class="ts-mod-btn" data-speed="0.75" title="Half Time">HT</button>
                <button class="ts-mod-btn active" data-speed="1.0" title="Normal Speed">1X</button>
                <button class="ts-mod-btn" data-speed="1.25" title="Double Time (Light)">DT-</button>
                <button class="ts-mod-btn" data-speed="1.5" title="Double Time (Nightcore)">DT</button>
            `;

            // Pasang ke body secara langsung, bebas hambatan Polymer!
            document.body.appendChild(container);

            const btns = container.querySelectorAll('.ts-mod-btn');
            let currentSpeed = 1.0;
            const existingVideo = document.querySelector('video');
            if (existingVideo) currentSpeed = existingVideo.playbackRate;

            btns.forEach(b => {
                b.classList.remove('active');
                if (parseFloat(b.getAttribute('data-speed')) === currentSpeed) {
                    b.classList.add('active');
                }
            });

            function applySpeed() {
                const video = document.querySelector('video');
                if (video) video.playbackRate = currentSpeed;
            }

            btns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    btns.forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    currentSpeed = parseFloat(e.target.getAttribute('data-speed'));
                    applySpeed();
                });
            });

        }, 2000);

        setInterval(() => {
            const video = document.querySelector('video');
            const modContainer = document.getElementById('ts-speed-mods-container');
            if (!video || !modContainer) return;
            
            const activeBtn = modContainer.querySelector('.ts-mod-btn.active');
            if (activeBtn) {
                const intendedSpeed = parseFloat(activeBtn.getAttribute('data-speed'));
                if (video.playbackRate !== intendedSpeed) {
                    video.playbackRate = intendedSpeed;
                }
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initObserver();
            initSpeedMods();
        });
    } else {
        initObserver();
        initSpeedMods();
    }

    // ── Parallax backdrop kursor (khusus mode Game Lobby) ─────────────────────
    // Backdrop digerakkan dengan menulis `transform` LANGSUNG ke #ts-game-bg
    // (satu elemen daun), bukan lewat CSS var di <body>. Menulis transform ke satu
    // elemen daun + translate3d/will-change => murni di kompositor, NOL invalidasi
    // style ke ribuan node app => benar-benar mulus tanpa stutter.
    //
    // Smoothing-nya exponential + framerate-independent (konsisten di 60/120/144Hz)
    // dan dibuat RESPONSIF supaya backdrop langsung "menempel" ke kursor — sigap,
    // tanpa rasa delay.
    let pxTargetX = 0, pxTargetY = 0;   // target dari posisi kursor
    let pxCurX = 0, pxCurY = 0;         // posisi teranimasi saat ini
    let pxRunning = false;
    let pxLastTs = 0;
    let pxLastEl = null;

    const PX_INTENSITY = 34;     // amplitudo geser maksimum (px)
    const PX_RESPONSE = 0.024;   // laju catch-up per ms (makin besar = makin sigap)

    function pxFrame(ts) {
        const el = document.getElementById('ts-game-bg');
        if (dynamicThemeDisabled || !el) { pxRunning = false; pxLastEl = null; return; }

        // Elemen baru (mode baru diaktifkan) => mulai dari netral, tanpa lompatan.
        if (el !== pxLastEl) { pxCurX = pxCurY = 0; pxLastEl = el; }

        // dt di-clamp agar tidak melompat jauh saat tab kembali fokus / frame drop.
        const dt = pxLastTs ? Math.min(ts - pxLastTs, 50) : 16.7;
        pxLastTs = ts;

        // Exponential smoothing yang stabil di refresh-rate berapa pun.
        const a = 1 - Math.exp(-dt * PX_RESPONSE);
        pxCurX += (pxTargetX - pxCurX) * a;
        pxCurY += (pxTargetY - pxCurY) * a;

        el.style.transform =
            `scale(1.08) translate3d(${pxCurX.toFixed(2)}px, ${pxCurY.toFixed(2)}px, 0)`;

        // Hentikan loop saat sudah praktis menempel di target (hemat CPU).
        if (Math.abs(pxTargetX - pxCurX) < 0.06 && Math.abs(pxTargetY - pxCurY) < 0.06) {
            pxRunning = false;
        } else {
            requestAnimationFrame(pxFrame);
        }
    }

    document.addEventListener('mousemove', (e) => {
        if (dynamicThemeDisabled) return;
        // Parallax hanya relevan untuk backdrop mode Game Lobby.
        if (!document.documentElement.classList.contains('ts-game-lobby-uimod')) return;

        const xPos = (e.clientX / window.innerWidth) - 0.5;
        const yPos = (e.clientY / window.innerHeight) - 0.5;

        pxTargetX = -xPos * PX_INTENSITY;
        pxTargetY = -yPos * PX_INTENSITY;

        if (!pxRunning) {
            pxRunning = true;
            pxLastTs = 0; // reset timer agar dt frame pertama wajar
            requestAnimationFrame(pxFrame);
        }
    }, { passive: true });

    // Marker for host-side injection guards
    try {
        window.__gapDynamicThemeLoaded = true;
        window.__gapDynamicThemeVersion = '2.1';
    } catch (_) { }
})();
