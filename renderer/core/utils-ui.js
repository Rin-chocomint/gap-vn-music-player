// ================================ ( Utilitas UI ) ================================ //
//------------------- ( warm-up UI biar modal nggak "kaget" pas dibuka ) -------------------------//
function warmUpUI() {
    console.log('[Optimization] Warming up UI elements...');
    const elementsToWarmUp = document.querySelectorAll('.modal, #game-mode-modal, #custom-quit-popup');

    elementsToWarmUp.forEach(element => {
        element.classList.remove('hidden');
        void element.offsetHeight;
        element.classList.add('hidden');
    });
    console.log('[Optimization] UI warm-up complete.');
}
//------------------- ( end warm-up UI biar modal nggak "kaget" pas dibuka ) -------------------------//

//------------------- ( About Panel ) -------------------------//
function initAboutPanel() {
    console.log('Initializing panel...');

    const openBtn = document.getElementById('open-about-panel');
    const closeBtn = document.getElementById('close-about-panel');
    const panel = document.getElementById('about-panel');
    const overlay = document.getElementById('about-panel-overlay');

    console.log('[About]Elements:', {
        openBtn: !!openBtn,
        closeBtn: !!closeBtn,
        panel: !!panel,
        overlay: !!overlay
    });

    // Isi panel tinggal di berkas terpisah supaya repositori publik berisi mesin
    // murni tanpa konten personal, sementara index.html tetap ikut dikelola
    // updater Tier-1. Berkas itu hanya ada di paket rilis; ketiadaannya BUKAN
    // error — klon repo yang bersih tetap mendapat panel yang berfungsi.
    let kontenAboutDimuat = false;
    function loadAboutContent() {
        if (kontenAboutDimuat) return;
        const wadah = document.getElementById('about-panel-content');
        if (!wadah) return;
        kontenAboutDimuat = true;

        try {
            const berkas = path.join(__dirname, 'aset', 'konten', 'about-chocomint.html');
            if (fs.existsSync(berkas)) {
                wadah.innerHTML = fs.readFileSync(berkas, 'utf8');
                return;
            }
            console.log('[About] Konten personal tidak disertakan di build ini.');
        } catch (err) {
            console.warn('[About] Gagal memuat konten:', err.message);
        }

        // Tanpa fragmen, sisakan wadah versi/integritas supaya panel tetap berguna.
        wadah.innerHTML = '<div id="version-integrity-content" style="font-size: 0.85rem;"></div>';
    }

    async function openAboutPanel() {
        if (panel && overlay) {
            panel.classList.add('open');
            overlay.classList.add('open');

            // Wajib sebelum loadVersionAndIntegrityInfo: #version-integrity-content
            // baru ada setelah fragmen disuntikkan.
            loadAboutContent();

            // Load version and integrity info
            await loadVersionAndIntegrityInfo();
        }
    }

    async function loadVersionAndIntegrityInfo() {
        const contentEl = document.getElementById('version-integrity-content');
        if (!contentEl) return;

        try {
            // ambil versi dan integritas sekaligus
            const [versions, integrity] = await Promise.all([
                ipcRenderer.invoke('integrity:get-versions'),
                ipcRenderer.invoke('integrity:check-core')
            ]);

            // tabel versi
            let versionRows = '';
            if (versions && versions.app) {
                versionRows = `
                    <tr><td>Aplikasi</td><td>v${versions.app.version} <span style="color:#00ccff;font-size:0.75rem;">${versions.app.stage}</span></td></tr>
                    <tr><td>VN Player</td><td>v${versions.components?.vnPlayer?.version || 'N/A'}</td></tr>
                    <tr><td>VN Hub</td><td>v${versions.components?.vnHub?.version || 'N/A'}</td></tr>
                    <tr><td>VN Manager</td><td>v${versions.components?.vnManager?.version || 'N/A'}</td></tr>
                    <tr><td>Script Schema</td><td>v${versions.scriptSchema?.version || 'N/A'}</td></tr>
                `;
            } else {
                versionRows = '<tr><td colspan="2" style="color:#ff6b6b;">Gagal memuat</td></tr>';
            }

            // Build integrity table rows
            let integrityRows = '';
            if (integrity && integrity.checked) {
                for (const [name, info] of Object.entries(integrity.results)) {
                    let icon, color;
                    switch (info.status) {
                        case 'original': icon = '✓'; color = '#4ade80'; break;
                        case 'modified': icon = '⚠'; color = '#fbbf24'; break;
                        case 'unverified': icon = '○'; color = '#60a5fa'; break;
                        case 'missing': icon = '✕'; color = '#f87171'; break;
                        default: icon = '?'; color = '#9ca3af';
                    }
                    integrityRows += `<tr><td>${name}</td><td style="color:${color};">${icon} ${info.status}</td></tr>`;
                }
            } else {
                integrityRows = '<tr><td colspan="2" style="color:#888;">Tidak tersedia</td></tr>';
            }

            // Render complete layout with inline styles in a scoped way
            contentEl.innerHTML = `
                <div style="display:flex;gap:20px;">
                    <div style="flex:1;">
                        <div style="font-size:0.75rem;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;">Versi Komponen</div>
                        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                            <colgroup><col style="width:auto;"><col style="width:auto;text-align:right;"></colgroup>
                            <tbody style="color:#ccc;">${versionRows}</tbody>
                        </table>
                    </div>
                    <div style="width:1px;background:rgba(255,255,255,0.1);"></div>
                    <div style="flex:1;">
                        <div style="font-size:0.75rem;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:6px;">Status Integritas</div>
                        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                            <colgroup><col style="width:auto;"><col style="width:auto;text-align:right;"></colgroup>
                            <tbody style="color:#ccc;">${integrityRows}</tbody>
                        </table>
                    </div>
                </div>
                <style>
                    #version-integrity-content table td { padding:3px 0; }
                    #version-integrity-content table td:first-child { color:#888; }
                    #version-integrity-content table td:last-child { text-align:right; color:#ddd; }
                </style>
            `;

        } catch (err) {
            contentEl.innerHTML = '<div style="color:#ff6b6b;text-align:center;">Error memuat informasi</div>';
        }
    }

    function closeAboutPanel() {
        if (panel && overlay) {
            panel.classList.remove('open');
            overlay.classList.remove('open');
        }
    }

    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openAboutPanel();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeAboutPanel);
    }

    //"tampilkan lebih banyak"
    // Didelegasikan ke panel: tombolnya ikut fragmen yang baru disuntikkan saat
    // panel pertama dibuka, jadi belum ada saat init dan tak bisa diikat langsung.
    if (panel) {
        panel.addEventListener('click', (e) => {
            const moreBtn = e.target.closest('#about-more-btn');
            if (!moreBtn) return;

            const moreContainer = document.getElementById('about-more-container');
            if (!moreContainer) return;

            const isHidden = moreContainer.style.display === 'none';
            moreContainer.style.display = isHidden ? 'block' : 'none';
            moreBtn.textContent = isHidden ? 'tampilkan lebih sedikit' : 'tampilkan lebih banyak';
        });
    }

    if (overlay) {
        overlay.addEventListener('click', closeAboutPanel);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel && panel.classList.contains('open')) {
            closeAboutPanel();
        }
    });
}
// langsung panggil 
initAboutPanel();
//------------------- ( end About Panel ) -------------------------//

//------------------- ( Dynamic Music Player Styling ) -------------------------//
let dynamicMusicPlayerEnabled = false;
let lastMusicDiskSrc = '';

function applyDynamicMusicPlayerStyling() {
    if (!dynamicMusicPlayerEnabled) return;

    const musicDisk = document.getElementById('music-disk');
    const musicControl = document.getElementById('music-control');

    if (!musicDisk || !musicControl) return;

    // Perbarui hanya jika sumber gambar berubah
    if (musicDisk.src === lastMusicDiskSrc) return;
    lastMusicDiskSrc = musicDisk.src;

    console.log('[Dynamic Music Player] Extracting colors using Vibrant.js from:', musicDisk.src);

    // Pastikan library Vibrant sudah tersedia
    if (typeof Vibrant === 'undefined') {
        console.error('[Dynamic Music Player] Vibrant.js not loaded!');
        return;
    }

    // Pakai Vibrant.js biar ekstraksi warnanya lebih mantap dan profesional
    Vibrant.from(musicDisk.src)
        .getPalette()
        .then(palette => {
            console.log('[Dynamic Music Player] Palette extracted:', palette);

            // Ambil warna terbaik dari palet yang dihasilkan
            const vibrant = palette.Vibrant;
            const darkVibrant = palette.DarkVibrant;
            const muted = palette.Muted;
            const darkMuted = palette.DarkMuted;
            const lightVibrant = palette.LightVibrant;

            // Tentukan warna utama dan warna pendamping
            let primaryColor = vibrant || lightVibrant || muted;
            let secondaryColor = darkVibrant || darkMuted || muted;

            if (!primaryColor && !secondaryColor) {
                console.warn('[Dynamic Music Player] No colors extracted, using defaults');
                musicControl.style.background = 'linear-gradient(135deg, rgba(60, 60, 80, 0.7) 0%, rgba(20, 20, 30, 0.95) 100%)';
                return;
            }

            // Ambil nilai RGB dari sampel warna
            const primary = primaryColor ? primaryColor.getRgb() : [100, 100, 120];
            const secondary = secondaryColor ? secondaryColor.getRgb() : primary;
            const dark = darkMuted ? darkMuted.getRgb() : [20, 20, 30];

            // Racik gradient-nya pake warna dari Vibrant biar cakep
            const gradient = `linear-gradient(145deg, 
                rgba(${Math.round(primary[0])}, ${Math.round(primary[1])}, ${Math.round(primary[2])}, 0.65) 0%, 
                rgba(${Math.round(secondary[0])}, ${Math.round(secondary[1])}, ${Math.round(secondary[2])}, 0.45) 40%,
                rgba(${Math.round(dark[0])}, ${Math.round(dark[1])}, ${Math.round(dark[2])}, 0.95) 100%)`;


            musicControl.style.background = gradient;

            // Kasih efek glow tipis berdasarkan warna vibran
            if (vibrant) {
                const vRgb = vibrant.getRgb();
                musicControl.style.boxShadow = `0 0 25px rgba(${Math.round(vRgb[0])}, ${Math.round(vRgb[1])}, ${Math.round(vRgb[2])}, 0.25)`;
            }

            console.log('[Dynamic Music Player] Applied Vibrant.js gradient');
        })
        .catch(err => {
            console.warn('[Dynamic Music Player] Vibrant.js extraction failed:', err);
            musicControl.style.background = 'linear-gradient(135deg, rgba(60, 60, 80, 0.7) 0%, rgba(20, 20, 30, 0.95) 100%)';
        });
}

function resetMusicPlayerStyling() {
    const musicControl = document.getElementById('music-control');
    if (musicControl) {
        musicControl.style.background = '';
        musicControl.style.boxShadow = '';
        lastMusicDiskSrc = '';
    }
}

// Inisialisasi pendengar perubahan pada checkbox
function initDynamicMusicPlayerStyling() {
    const checkbox = document.getElementById('enable-dynamic-music-player-checkbox');
    if (!checkbox) {
        console.warn('[Dynamic Music Player] Checkbox not found');
        return;
    }

    checkbox.addEventListener('change', (e) => {
        dynamicMusicPlayerEnabled = e.target.checked;
        console.log('[Dynamic Music Player] Enabled:', dynamicMusicPlayerEnabled);

        if (dynamicMusicPlayerEnabled) {
            applyDynamicMusicPlayerStyling();
        } else {
            resetMusicPlayerStyling();
        }
    });

    // Pantau perubahan sumber gambar pada music-disk pakai MutationObserver biar gak lolos
    const musicDisk = document.getElementById('music-disk');
    if (musicDisk) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    if (dynamicMusicPlayerEnabled) {
                        // delay kecil buat mastiin gambar udah di load
                        setTimeout(applyDynamicMusicPlayerStyling, 100);
                    }
                }
            });
        });

        observer.observe(musicDisk, { attributes: true });
        console.log('[Dynamic Music Player] Observer attached to music-disk');
    }

    // juga untuk memastikan gambar sudah di load
    if (musicDisk) {
        musicDisk.addEventListener('load', () => {
            if (dynamicMusicPlayerEnabled) {
                applyDynamicMusicPlayerStyling();
            }
        });
    }

    console.log('[Dynamic Music Player] Initialized with Vibrant.js');
}

// Panggil fungsi inisialisasi
initDynamicMusicPlayerStyling();
//------------------- ( end Dynamic Music Player Styling ) -------------------------//

//------------------- ( notifikasi global ) -------------------------//
function showNotification(message, type = 'notification-success') {
    let resolvedMessage = message;
    let resolvedType = type;
    let resolvedDetails;

    if (resolvedMessage && typeof resolvedMessage === 'object' && !Array.isArray(resolvedMessage)) {
        resolvedType = resolvedMessage.type || resolvedType;
        resolvedDetails = resolvedMessage.details;
        resolvedMessage = resolvedMessage.message ?? '';
    } else {
        resolvedDetails = arguments.length >= 3 ? arguments[2] : undefined;
    }

    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }

    const iconText = (resolvedType || '').includes('notification-error')
        ? '⛔'
        : (resolvedType || '').includes('notification-warning')
            ? '⚠️'
            : 'ℹ️';

    const notification = document.createElement('div');
    notification.className = `notification ${resolvedType || 'notification-success'}`;

    const iconEl = document.createElement('span');
    iconEl.className = 'notification-icon';
    iconEl.textContent = iconText;

    const contentEl = document.createElement('div');
    contentEl.className = 'notification-content';

    const messageEl = document.createElement('div');
    messageEl.className = 'notification-message';
    messageEl.textContent = String(resolvedMessage ?? '');
    contentEl.appendChild(messageEl);

    if (Array.isArray(resolvedDetails) && resolvedDetails.length > 0) {
        const detailsEl = document.createElement('ul');
        detailsEl.className = 'notification-details';
        resolvedDetails
            .filter((v) => v !== null && v !== undefined && String(v).trim().length > 0)
            .forEach((detail) => {
                const li = document.createElement('li');
                li.textContent = String(detail);
                detailsEl.appendChild(li);
            });
        if (detailsEl.childNodes.length > 0) contentEl.appendChild(detailsEl);
    }

    notification.appendChild(iconEl);
    notification.appendChild(contentEl);
    container.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 5500);
}

function buildSettingsSummaryLines(partial) {
    if (!partial || typeof partial !== 'object') return [];

    const lines = [];
    const pushBool = (label, value) => {
        if (value === undefined) return;
        lines.push(`${label}: ${value ? 'ON' : 'OFF'}`);
    };

    if (Number.isFinite(partial.windowWidth) && Number.isFinite(partial.windowHeight)) {
        lines.push(`Resolution: ${partial.windowWidth}x${partial.windowHeight}`);
    }

    pushBool('Fullscreen', partial.isFullscreen);
    pushBool('Idle Return', partial.idleReturn);
    pushBool('Snow Effect', partial.snowFeatureEnabled);
    pushBool('WebGPU Acceleration', partial.webgpuEnabled);
    if (partial.webgpuVisualizerStyle !== undefined && partial.webgpuVisualizerStyle !== null && String(partial.webgpuVisualizerStyle).trim() !== '') {
        lines.push(`WebGPU Visualizer Style: ${partial.webgpuVisualizerStyle}`);
    }
    pushBool('Mini Player', partial.miniPlayerFeatureEnabled);
    pushBool('Discord RPC', partial.rpcEnabled);
    pushBool('Log Overlay', partial.showLogOverlay);

    if (partial.darkness !== undefined && partial.darkness !== null && String(partial.darkness).trim() !== '') {
        lines.push(`Wallpaper Darkness: ${partial.darkness}%`);
    }
    pushBool('Follow Music Title', partial.followMusic);
    pushBool('Hidden Wallpaper Settings', partial.enableHiddenWallpaperSettings);

    pushBool('Ad Skipper', partial.adSkipperEnabled);
    pushBool('Auto Mute Ads', partial.autoMuteAds);
    pushBool('Auto Skip Ads', partial.autoSkipAds);
    pushBool('Dynamic Music Player Styling', partial.dynamicMusicPlayerStylingEnabled);

    return lines;
}

function buildSettingsDiffLines(before, after) {
    if (!after || typeof after !== 'object') return [];

    const toFiniteNumber = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };

    const normalizeBool = (v) => {
        if (v === true || v === false) return v;
        if (v === 'true') return true;
        if (v === 'false') return false;
        return undefined;
    };

    const isDifferent = (a, b) => {
        // jika kita tidak memiliki baseline, mari kita lihat apakah baseline itu ada atau tidak.
        if (a === undefined) return b !== undefined;
        return a !== b;
    };

    const beforeObj = (before && typeof before === 'object') ? before : {};
    const afterObj = after;
    const lines = [];

    const beforeW = toFiniteNumber(beforeObj.windowWidth);
    const beforeH = toFiniteNumber(beforeObj.windowHeight);
    const afterW = toFiniteNumber(afterObj.windowWidth);
    const afterH = toFiniteNumber(afterObj.windowHeight);

    if (afterW !== undefined && afterH !== undefined) {
        const beforeRes = (beforeW !== undefined && beforeH !== undefined) ? `${beforeW}x${beforeH}` : undefined;
        const afterRes = `${afterW}x${afterH}`;
        if (isDifferent(beforeRes, afterRes)) lines.push(`Resolution: ${afterRes}`);
    }

    const diffBool = (key, label) => {
        const b = normalizeBool(beforeObj[key]);
        const a = normalizeBool(afterObj[key]);
        if (a === undefined) return;
        if (isDifferent(b, a)) lines.push(`${label}: ${a ? 'ON' : 'OFF'}`);
    };

    const diffText = (key, label) => {
        const b = (beforeObj[key] === undefined || beforeObj[key] === null) ? undefined : String(beforeObj[key]);
        const a = (afterObj[key] === undefined || afterObj[key] === null) ? undefined : String(afterObj[key]);
        if (a === undefined || a.trim() === '') return;
        if (isDifferent(b, a)) lines.push(`${label}: ${a}`);
    };

    const diffPercent = (key, label) => {
        const b = toFiniteNumber(beforeObj[key]);
        const a = toFiniteNumber(afterObj[key]);
        if (a === undefined) return;
        if (isDifferent(b, a)) lines.push(`${label}: ${a}%`);
    };

    diffBool('isFullscreen', 'Fullscreen');
    diffBool('idleReturn', 'Idle Return');
    diffBool('snowFeatureEnabled', 'Snow Effect');
    diffBool('webgpuEnabled', 'WebGPU Acceleration');
    diffText('webgpuVisualizerStyle', 'WebGPU Visualizer Style');
    diffBool('miniPlayerFeatureEnabled', 'Mini Player');
    diffBool('rpcEnabled', 'Discord RPC');
    diffBool('showLogOverlay', 'Log Overlay');

    diffPercent('darkness', 'Wallpaper Darkness');
    diffBool('followMusic', 'Follow Music Title');
    diffBool('enableHiddenWallpaperSettings', 'Hidden Wallpaper Settings');

    diffBool('adSkipperEnabled', 'Ad Skipper');
    diffBool('autoMuteAds', 'Auto Mute Ads');
    diffBool('autoSkipAds', 'Auto Skip Ads');
    diffBool('dynamicMusicPlayerStylingEnabled', 'Dynamic Music Player Styling');

    diffBool('enableVideoWallpaper', 'Video Wallpaper');
    diffBool('enableGifOverlay', 'Free GIF Overlay');
    diffBool('gameGifInteractionLock', 'GIF Interaction Lock');

    diffBool('miniPlayerHideOnCursor', 'Mini Player Hide on Cursor');
    diffBool('overlayEnabled', 'In-Game Overlay');
    diffBool('dynamicThemeEnabled', 'Dynamic ytMusic Styling');
    diffText('dynamicThemeMode', 'Dynamic Theme Mode');

    return lines;
}
//------------------- ( end notifikasi global ) -------------------------//
// ================================ ( End Utilitas UI ) ================================ //
