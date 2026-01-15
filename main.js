
//-------------------------------------
// Discord RPC
//-------------------------------------
const RPC = require('discord-rpc');
const clientId = '1394882882220068924';

let rpc;
let rpcStartTime; // Waktu kapan RPC berhasil terhubung
let isRpcEnabled = false; // Status RPC saat ini
let rpcRetryInterval = null;
let currentAppMode = 'game'; // 'game' | 'native' | 'gif-overlay'

// Fungsi utama yang dipanggil untuk memulai koneksi
function initRPC() {
    if (!isRpcEnabled || rpc) { // Jangan mulai jika dinonaktifkan atau sudah berjalan
        console.log(`[RPC] Inisialisasi dibatalkan. Enabled: ${isRpcEnabled}, Instance Exists: ${!!rpc}`);
        return;
    }
    console.log('[RPC] Mencoba memulai koneksi RPC...');
    connectRPC();
}

function connectRPC() {
    // Hapus instance lama atau interval coba ulang jika ada
    if (rpc) rpc.destroy().catch(console.error);
    if (rpcRetryInterval) clearInterval(rpcRetryInterval);
    rpc = null;
    rpcRetryInterval = null;

    rpc = new RPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
        console.log('[RPC] Berhasil terhubung ke Discord.');
        if (rpcRetryInterval) {
            clearInterval(rpcRetryInterval);
            rpcRetryInterval = null;
        }
        rpcStartTime = new Date();

        // Tentukan state awal berdasarkan mode
        let detailsText = 'Di Menu Utama';
        let stateText = 'Memilih-milih menu...';

        if (currentAppMode === 'native') {
            detailsText = 'GAP Music Player';
            stateText = 'Menikmati Musik';
        } else if (currentAppMode === 'gif-overlay') {
            detailsText = 'GAP Free GIF overlay!';
            stateText = 'Mengatur Overlay';
        } else {
            // mode game
            detailsText = 'GAP VN & Music Player'; // Sesuai prompt user: "judulnya ... akan seperti biasa GAP VN & Music Player"
            stateText = 'Di Menu Utama';
        }

        updateRpcActivity({ details: detailsText, state: stateText });
    });

    rpc.on('disconnected', () => {
        console.error('[RPC] Terputus dari Discord. Mencoba menyambung ulang...');
        setupRpcRetry();
    });

    rpc.login({ clientId }).catch(err => {
        console.error('[RPC] Gagal login, akan mencoba lagi.', err.message);
        setupRpcRetry();
    });
}

// Fungsi untuk menangani jadwal koneksi ulang
function setupRpcRetry() {
    destroyRPC(false); // Hancurkan instance saat ini tanpa menonaktifkan fitur

    if (!rpcRetryInterval) {
        console.log('[RPC] Menjadwalkan koneksi ulang dalam 15 detik.');
        rpcRetryInterval = setInterval(() => {
            if (isRpcEnabled) { // Hanya coba lagi jika fitur masih aktif
                console.log('[RPC] Mencoba menyambung ulang...');
                connectRPC();
            } else {
                console.log('[RPC] Fitur dinonaktifkan, membatalkan coba ulang.');
                clearInterval(rpcRetryInterval);
                rpcRetryInterval = null;
            }
        }, 15000);
    }
}

// Fungsi untuk menghentikan dan membersihkan RPC
function destroyRPC(isDisablingFeature = true) {
    if (rpcRetryInterval) {
        clearInterval(rpcRetryInterval);
        rpcRetryInterval = null;
    }
    if (!rpc) return;

    rpc.destroy().catch(console.error);
    rpc = null;
    console.log('[RPC] Koneksi RPC dihentikan.');

    // isRpcEnabled hanya diubah menjadi false jika fitur secara eksplisit dinonaktifkan
    if (isDisablingFeature) {
        isRpcEnabled = false;
    }
}

function updateRpcActivity(data) {
    if (!rpc || !isRpcEnabled) {
        return;
    }

    const { details, state, largeImageKey, smallImageKey, smallImageText, songTitle, songArtist } = data;

    const payload = {
        details: details || 'Idle',
        state: state,
        startTimestamp: rpcStartTime,
        largeImageKey: largeImageKey || 'main_icon',
        largeImageText: 'Eksperimental Aplikasi visual novel & pemutar musik | Tahap Alpha v0.0.0.8 | cobain sekarang Aplikasinya download di github ',
        instance: false,
        buttons: [
            {
                label: '>//',
                url: 'https://github.com/Rin-chocomint'
            }
        ]
    };

    if (smallImageKey) {
        payload.smallImageKey = smallImageKey;
        payload.smallImageText = smallImageText || '';
    }

    // Jika sedang memutar musik, buat format yang lebih bagus
    if (songTitle) {
        payload.details = `🎵 Mendengarkan: ${songTitle}`;
        payload.state = `🎤 oleh ${songArtist || 'Tidak diketahui'}`;
    }

    rpc.setActivity(payload).catch(err => {
        console.error("[RPC] Gagal mengatur aktivitas: ", err);
        if (err.message.includes('Could not connect')) {
            setupRpcRetry();
        }
    });
}

//-------------------------------------
// main.js (Aplikasi Utama)
//-------------------------------------
const { app, BrowserWindow, BrowserView, ipcMain, session, screen, dialog, globalShortcut } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// IPC handler global untuk update activity dari renderer (dipakai di semua mode)
ipcMain.on('update-rpc-activity', (event, data) => {
    updateRpcActivity(data);
});

ipcMain.on('open-main-devtools', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
});

// Back-compat (buat dev aja ntar dihapus) : beberapa renderer lama masih pakai channel 'update-rpc'
ipcMain.on('update-rpc', (event, data) => {
    updateRpcActivity(data);
});

// mencoba mengurangi video wallpaper yang throttling saat salju, miniplayer, atau overlay aktif
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('disable-vsync');
// app.commandLine.appendSwitch('disable-best-effort-tasks');

// Mendefinisikan path ke direktori aset
const musicDirectory = path.join(__dirname, 'aset', 'music');
const wallpaperDirectory = path.join(__dirname, 'aset', 'wallpaper');
const visualNovelsDirectory = path.join(__dirname, 'aset', 'game', 'visual_novels');

// ======================== Integrity Check & Novel Security Module ======================== //
const crypto = require('crypto');

// Load versions manifest
let versionsManifest = null;
try {
    const versionsPath = path.join(__dirname, 'versions.json');
    if (fs.existsSync(versionsPath)) {
        versionsManifest = JSON.parse(fs.readFileSync(versionsPath, 'utf-8'));
        console.log('[Integrity] Loaded versions.json successfully.');
    }
} catch (e) {
    console.error('[Integrity] Failed to load versions.json:', e.message);
}

// Menghitung hash SHA-256 dari file
function calculateFileHash(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const content = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(content).digest('hex');
    } catch (e) {
        console.error(`[Integrity] Error calculating hash for ${filePath}:`, e.message);
        return null;
    }
}

// Memeriksa integritas file core aplikasi
function checkCoreIntegrity() {
    if (!versionsManifest || !versionsManifest.components) {
        console.log('[Integrity] No manifest available, skipping integrity check.');
        return { checked: false, results: {} };
    }

    const results = {};
    const components = versionsManifest.components;

    for (const [name, info] of Object.entries(components)) {
        const filePath = path.join(__dirname, info.file);
        const currentHash = calculateFileHash(filePath);

        // Jika manifest memiliki hash expected, bandingkan
        if (info.hash) {
            results[name] = {
                file: info.file,
                version: info.version,
                expected: info.hash,
                actual: currentHash,
                status: currentHash === info.hash ? 'original' : 'modified'
            };
        } else {
            // Jika belum ada hash di manifest, laporkan file exists saja
            results[name] = {
                file: info.file,
                version: info.version,
                actual: currentHash,
                status: currentHash ? 'unverified' : 'missing'
            };
        }
    }

    console.log('[Integrity] Core integrity check results:', results);
    return { checked: true, results };
}

// ======================== Novel Content Security Scanner ======================== //

// Pattern untuk mendeteksi kode berbahaya/mencurigakan
const DANGEROUS_PATTERNS = {
    // JavaScript execution
    evalUsage: /\beval\s*\(/gi,
    functionConstructor: /new\s+Function\s*\(/gi,

    // Inline script tags dalam HTML strings
    scriptTags: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,

    // Event handlers yang mungkin berbahaya
    onEventHandlers: /\bon(click|load|error|mouseover|focus)\s*=/gi,

    // External resource loading
    externalUrls: /https?:\/\/[^\s"'<>]+/gi,

    // Node.js/Electron specific
    requireUsage: /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/gi,
    ipcUsage: /ipcRenderer|ipcMain/gi,

    // File system access
    fsAccess: /\bfs\.(read|write|unlink|rmdir)/gi,

    // Shell execution
    shellExec: /child_process|exec\(|spawn\(/gi
};

// Scan konten script.json untuk mendeteksi kode mencurigakan dan external URLs
function scanNovelScript(scriptPath) {
    const warnings = {
        hasCustomJs: false,
        hasDangerousCode: false,
        hasExternalUrls: false,
        externalUrls: [],
        dangerousPatterns: [],
        details: []
    };

    try {
        if (!fs.existsSync(scriptPath)) {
            return { error: 'Script not found', warnings };
        }

        const content = fs.readFileSync(scriptPath, 'utf-8');
        const script = JSON.parse(content);

        // Scan setiap entry di script
        script.forEach((entry, index) => {
            const entryStr = JSON.stringify(entry);

            // Cek eval dan Function constructor
            if (DANGEROUS_PATTERNS.evalUsage.test(entryStr)) {
                warnings.hasDangerousCode = true;
                warnings.dangerousPatterns.push({ type: 'eval', index });
            }
            DANGEROUS_PATTERNS.evalUsage.lastIndex = 0;

            if (DANGEROUS_PATTERNS.functionConstructor.test(entryStr)) {
                warnings.hasDangerousCode = true;
                warnings.dangerousPatterns.push({
                    type: 'Function constructor',
                    index,
                    entryType: entry.type || 'unknown'
                });
            }
            DANGEROUS_PATTERNS.functionConstructor.lastIndex = 0;

            // Cek script tags
            if (DANGEROUS_PATTERNS.scriptTags.test(entryStr)) {
                warnings.hasCustomJs = true;
                const scriptMatch = entryStr.match(DANGEROUS_PATTERNS.scriptTags);
                warnings.details.push({
                    type: 'script_tag',
                    index,
                    entryType: entry.type || 'unknown',
                    property: entry.customHtml ? 'customHtml' : (entry.htmlContent ? 'htmlContent' : 'unknown'),
                    preview: scriptMatch ? scriptMatch[0].substring(0, 50) + '...' : null
                });
            }
            DANGEROUS_PATTERNS.scriptTags.lastIndex = 0;

            // Cek require usage
            if (DANGEROUS_PATTERNS.requireUsage.test(entryStr)) {
                warnings.hasDangerousCode = true;
                warnings.dangerousPatterns.push({
                    type: 'require()',
                    index,
                    entryType: entry.type || 'unknown'
                });
            }
            DANGEROUS_PATTERNS.requireUsage.lastIndex = 0;

            // Cek shell execution
            if (DANGEROUS_PATTERNS.shellExec.test(entryStr)) {
                warnings.hasDangerousCode = true;
                warnings.dangerousPatterns.push({
                    type: 'shell execution',
                    index,
                    entryType: entry.type || 'unknown'
                });
            }
            DANGEROUS_PATTERNS.shellExec.lastIndex = 0;

            // Cek external URLs
            const urlMatches = entryStr.match(DANGEROUS_PATTERNS.externalUrls);
            if (urlMatches) {
                // Filter trusted domains
                const trustedDomains = versionsManifest?.security?.trustedDomains || [];
                urlMatches.forEach(url => {
                    const isTrusted = trustedDomains.some(domain => url.includes(domain));
                    if (!isTrusted) {
                        warnings.hasExternalUrls = true;
                        if (!warnings.externalUrls.includes(url)) {
                            warnings.externalUrls.push(url);
                        }
                    }
                });
            }

            // Cek apakah entry memiliki specialEvent dengan JS custom
            if (entry.specialEvent) {
                const seStr = JSON.stringify(entry.specialEvent);
                if (seStr.includes('eval') || seStr.includes('Function(') ||
                    seStr.includes('<script') || seStr.includes('javascript:')) {
                    warnings.hasCustomJs = true;
                    warnings.details.push({
                        type: 'special_event_js',
                        index,
                        entryType: entry.type || 'unknown',
                        property: 'specialEvent',
                        eventType: entry.specialEvent.type || 'unknown'
                    });
                }
            }

            // Cek properti customHtml
            if (entry.customHtml) {
                warnings.hasCustomJs = true;
                warnings.details.push({
                    type: 'custom_html',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'customHtml',
                    preview: entry.customHtml.substring(0, 50) + (entry.customHtml.length > 50 ? '...' : '')
                });
            }

            // Cek properti htmlContent
            if (entry.htmlContent) {
                warnings.hasCustomJs = true;
                warnings.details.push({
                    type: 'html_content',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'htmlContent',
                    preview: entry.htmlContent.substring(0, 50) + (entry.htmlContent.length > 50 ? '...' : '')
                });
            }

            // Cek properti externalResource
            if (entry.externalResource) {
                warnings.hasExternalUrls = true;
                if (!warnings.externalUrls.includes(entry.externalResource)) {
                    warnings.externalUrls.push(entry.externalResource);
                }
                warnings.details.push({
                    type: 'external_resource',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'externalResource',
                    url: entry.externalResource
                });
            }
        });
    } catch (e) {
        console.error(`[Security] Error scanning script ${scriptPath}:`, e.message);
        warnings.error = e.message;
    }

    return warnings;
}

// Scan seluruh folder novel untuk index.html yang mungkin dimodifikasi
function scanNovelFolder(novelPath) {
    const warnings = {
        modifiedIndexHtml: false,
        externalResources: [],
        customScripts: []
    };

    try {
        // Cek file index.html di dalam folder chapter
        const chapters = fs.readdirSync(novelPath);
        chapters.forEach(chapter => {
            const chapterPath = path.join(novelPath, chapter);
            if (fs.statSync(chapterPath).isDirectory()) {
                const indexPath = path.join(chapterPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    const content = fs.readFileSync(indexPath, 'utf-8');

                    // Periksa skrip atau sumber daya eksternal
                    const srcMatches = content.match(/src\s*=\s*["']https?:\/\/[^"']+["']/gi);
                    if (srcMatches) {
                        const trustedDomains = versionsManifest?.security?.trustedDomains || [];
                        srcMatches.forEach(match => {
                            const url = match.replace(/src\s*=\s*["']/i, '').replace(/["']$/, '');
                            const isTrusted = trustedDomains.some(domain => url.includes(domain));
                            if (!isTrusted && !warnings.externalResources.includes(url)) {
                                warnings.externalResources.push(url);
                            }
                        });
                    }

                    // Periksa skrip inline
                    const scriptMatches = content.match(/<script[\s\S]*?>[\s\S]*?<\/script>/gi);
                    if (scriptMatches) {
                        scriptMatches.forEach(script => {
                            // Abaikan skrip kosong atau pola yang udah dianggap aman
                            if (script.includes('ipcRenderer') && !script.includes('eval')) {
                                // Kayaknya ini skrip boilerplate bawaan player VN
                            } else if (script.length > 100) {
                                warnings.customScripts.push({
                                    chapter,
                                    preview: script.substring(0, 200) + '...'
                                });
                            }
                        });
                    }
                }
            }
        });

    } catch (e) {
        console.error(`[Security] Error scanning novel folder ${novelPath}:`, e.message);
    }

    return warnings;
}

// IPC untuk scan novel sebelum dimainkan
ipcMain.handle('security:scan-novel', async (event, { storyTitle, chapter }) => {
    const novelPath = path.join(visualNovelsDirectory, storyTitle);
    const scriptPath = path.join(novelPath, chapter, 'script.json');

    console.log(`[Security] Scanning novel: ${storyTitle} / ${chapter}`);

    const scriptWarnings = scanNovelScript(scriptPath);
    const folderWarnings = scanNovelFolder(novelPath);

    const result = {
        storyTitle,
        chapter,
        hasSecurityConcerns: scriptWarnings.hasCustomJs ||
            scriptWarnings.hasDangerousCode ||
            scriptWarnings.hasExternalUrls ||
            folderWarnings.externalResources.length > 0,
        script: scriptWarnings,
        folder: folderWarnings,
        timestamp: new Date().toISOString()
    };

    console.log('[Security] Scan result:', JSON.stringify(result, null, 2));
    return result;
});

// Handler IPC untuk mengecek integritas core files
ipcMain.handle('integrity:check-core', async () => {
    return checkCoreIntegrity();
});

// Handler IPC untuk mendapatkan info versi
ipcMain.handle('integrity:get-versions', async () => {
    return versionsManifest;
});

// ======================== Akhir Integrity Check & Novel Security Module ======================== //

let logOverlayWindow = null;
let isLogOverlayEnabled = false;

let overlayWindow = null;
const overlayPanelWidth = 380;
let notificationWindow = null;
let notificationTimer = null;
let isOverlayEnabled = false;

let adSkipperWindow = null;
let lastKnownSkipCoords = null;
let lastAdCount = null; // Track ad count untuk detect multiple ads

let mainWindow, popupWindow;
let versionOverlay = null; // BrowserView overlay untuk version label
let isFullscreen = false;
let snowWindow = null;
let isSnowFeatureEnabled = false;

let miniPlayerWindow = null;
let miniPlayerCursorInterval = null; // Interval untuk tracking cursor di sekitar mini player
let isMiniPlayerFeatureEnabled = false;
let lastLoggedTitleForUpdateMiniPlayerData = null; // Untuk logging update mini player

let currentStoryTitle = null;
let currentChapter = null;

// Pengaturan pengguna default
const defaultUserSettings = {
    volume: 0.5,
    globalVolume: 0.8,
    windowWidth: 1600,
    windowHeight: 900,
    isFullscreen: false,
    wallpaper: "",
    darkness: 30,
    wallpaperBlur: 0,
    wallpaperGrayscale: 0,
    wallpaperZoom: 1,
    autoChangeWallpaper: false,
    autoChangeInterval: 5,
    randomWallpaperOrder: false,
    followMusic: false,
    snowFeatureEnabled: false,
    webgpuEnabled: false,
    webgpuVisualizerStyle: '1',
    miniPlayerFeatureEnabled: false,
    videoWallpaperEnabled: true,
    overlayEnabled: false,
    adSkipperEnabled: false,
    autoMuteAds: false,
    autoSkipAds: false,
    idleReturn: false,
    enableHiddenWallpaperSettings: false,
    rpcEnabled: false,
    showLogOverlay: false,
    overlayModeEnabled: false,
    dynamicThemeEnabled: false,
    dynamicThemeMode: 'default',
    miniPlayerHideOnCursor: false,
    // === GIF Overlay Settings ===
    gifOverlayEnabled: false,
    gifOverlayLocked: false,
    gifOverlays: [],              // Array: [{id, path, settings, bounds}]
    gifOverlayPresets: [],        // Array: [{presetId, name, createdAt, overlays}]
    activePresetId: null          // ID preset yang sedang aktif
};

let userSettings = { ...defaultUserSettings };

// =================== Persistensi Pengaturan (Remember Settings) ================== //
// NOTE: Remember Settings is an explicit "Save" action (snapshot), not a toggle.
const USER_SETTINGS_FILE_NAME = 'user-settings.json';
const USER_DATA_FILE_NAME = 'user-data.json';

function getUserSettingsFilePath() {
    try {
        return path.join(app.getPath('userData'), USER_SETTINGS_FILE_NAME);
    } catch (e) {
        console.warn('[Main] Gagal mendapatkan userData path untuk settings:', e);
        return null;
    }
}

function getUserDataFilePath() {
    try {
        return path.join(app.getPath('userData'), USER_DATA_FILE_NAME);
    } catch (e) {
        console.warn('[Main] Gagal mendapatkan userData path untuk data:', e);
        return null;
    }
}

function normalizeUserSettings() {
    userSettings = { ...defaultUserSettings, ...(userSettings || {}) };

    const toBool = (value, fallback = false) => {
        if (value === true) return true;
        if (value === false) return false;
        if (typeof value === 'string') {
            const v = value.trim().toLowerCase();
            if (v === 'true') return true;
            if (v === 'false') return false;
        }
        return fallback;
    };

    const toNumber = (value, fallback) => {
        const n = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(n) ? n : fallback;
    };

    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

    // Back-compat (buat dev aja ntar dihapus) : older versions stored rememberSettings boolean.
    if ('rememberSettings' in userSettings) {
        delete userSettings.rememberSettings;
    }

    userSettings.isFullscreen = toBool(userSettings.isFullscreen, defaultUserSettings.isFullscreen);

    // Numeric fields (sliders / inputs)
    userSettings.volume = clamp(toNumber(userSettings.volume, defaultUserSettings.volume), 0, 1);
    userSettings.globalVolume = clamp(toNumber(userSettings.globalVolume, defaultUserSettings.globalVolume), 0, 1);
    userSettings.darkness = clamp(toNumber(userSettings.darkness, defaultUserSettings.darkness), 0, 100);
    userSettings.wallpaperBlur = clamp(toNumber(userSettings.wallpaperBlur, defaultUserSettings.wallpaperBlur), 0, 100);
    userSettings.wallpaperGrayscale = clamp(toNumber(userSettings.wallpaperGrayscale, defaultUserSettings.wallpaperGrayscale), 0, 100);
    userSettings.wallpaperZoom = clamp(toNumber(userSettings.wallpaperZoom, defaultUserSettings.wallpaperZoom), 0.1, 5);
    userSettings.autoChangeInterval = clamp(toNumber(userSettings.autoChangeInterval, defaultUserSettings.autoChangeInterval), 1, 999);

    if (typeof userSettings.windowWidth === 'string') userSettings.windowWidth = Number(userSettings.windowWidth);
    if (typeof userSettings.windowHeight === 'string') userSettings.windowHeight = Number(userSettings.windowHeight);
    if (!Number.isFinite(userSettings.windowWidth) || userSettings.windowWidth <= 0) userSettings.windowWidth = defaultUserSettings.windowWidth;
    if (!Number.isFinite(userSettings.windowHeight) || userSettings.windowHeight <= 0) userSettings.windowHeight = defaultUserSettings.windowHeight;

    // Common booleans
    userSettings.snowFeatureEnabled = toBool(userSettings.snowFeatureEnabled, defaultUserSettings.snowFeatureEnabled);
    userSettings.webgpuEnabled = toBool(userSettings.webgpuEnabled, defaultUserSettings.webgpuEnabled);
    userSettings.miniPlayerFeatureEnabled = toBool(userSettings.miniPlayerFeatureEnabled, defaultUserSettings.miniPlayerFeatureEnabled);
    userSettings.videoWallpaperEnabled = toBool(userSettings.videoWallpaperEnabled, defaultUserSettings.videoWallpaperEnabled);
    userSettings.overlayEnabled = toBool(userSettings.overlayEnabled, defaultUserSettings.overlayEnabled);
    userSettings.adSkipperEnabled = toBool(userSettings.adSkipperEnabled, defaultUserSettings.adSkipperEnabled);
    userSettings.autoMuteAds = toBool(userSettings.autoMuteAds, defaultUserSettings.autoMuteAds);
    userSettings.autoSkipAds = toBool(userSettings.autoSkipAds, defaultUserSettings.autoSkipAds);
    userSettings.idleReturn = toBool(userSettings.idleReturn, defaultUserSettings.idleReturn);
    userSettings.enableHiddenWallpaperSettings = toBool(userSettings.enableHiddenWallpaperSettings, defaultUserSettings.enableHiddenWallpaperSettings);
    userSettings.rpcEnabled = toBool(userSettings.rpcEnabled, defaultUserSettings.rpcEnabled);
    userSettings.showLogOverlay = toBool(userSettings.showLogOverlay, defaultUserSettings.showLogOverlay);
    userSettings.overlayModeEnabled = toBool(userSettings.overlayModeEnabled, defaultUserSettings.overlayModeEnabled);
    userSettings.dynamicThemeEnabled = toBool(userSettings.dynamicThemeEnabled, defaultUserSettings.dynamicThemeEnabled);
    userSettings.miniPlayerHideOnCursor = toBool(userSettings.miniPlayerHideOnCursor, defaultUserSettings.miniPlayerHideOnCursor);

    if (typeof userSettings.dynamicThemeMode !== 'string') userSettings.dynamicThemeMode = defaultUserSettings.dynamicThemeMode;
    if (typeof userSettings.webgpuVisualizerStyle !== 'string') userSettings.webgpuVisualizerStyle = String(userSettings.webgpuVisualizerStyle ?? defaultUserSettings.webgpuVisualizerStyle);
}

function saveUserDataToDisk(dataPayload) {
    const filePath = getUserDataFilePath();
    if (!filePath) return;
    try {
        const payload = JSON.stringify(dataPayload, null, 2);
        fs.writeFileSync(filePath, payload, 'utf8');
        return true;
    } catch (e) {
        console.error('[Main] Gagal menyimpan user data ke disk:', e);
        return false;
    }
}

function splitSettingsAndData(fullSettings) {
    // Kunci-kunci yang dianggap sebagai "Data" dan tidak boleh dihapus saat "Clear Settings"
    const dataKeys = ['gifOverlays', 'gifOverlayPresets', 'activePresetId'];
    const dataPayload = {};
    const settingsPayload = { ...fullSettings };

    dataKeys.forEach(key => {
        if (key in settingsPayload) {
            dataPayload[key] = settingsPayload[key];
            delete settingsPayload[key];
        }
    });

    return { settingsPayload, dataPayload };
}

function saveUserSettingsToDisk() {
    const filePath = getUserSettingsFilePath();
    if (!filePath) return;

    try {
        normalizeUserSettings();

        // Pisahkan data (GIF) dan settings (Preferensi)
        const { settingsPayload, dataPayload } = splitSettingsAndData(userSettings);

        // Simpan Data (Selalu simpan data agar tidak hilang)
        saveUserDataToDisk(dataPayload);

        // Simpan Settings
        const tmpPath = `${filePath}.tmp`;
        const payload = JSON.stringify({
            ...settingsPayload,
            _meta: {
                savedAt: new Date().toISOString()
            }
        }, null, 2);
        fs.writeFileSync(tmpPath, payload, 'utf8');
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        fs.renameSync(tmpPath, filePath);
        return true;
    } catch (e) {
        console.error('[Main] Gagal menyimpan user settings ke disk:', e);
        return false;
    }
}

let saveUserSettingsTimer = null;

function scheduleSaveUserSettings() {
    // Debounce: tunggu 500ms sebelum benar-benar menyimpan untuk menghindari penulisan berlebihan
    if (saveUserSettingsTimer) {
        clearTimeout(saveUserSettingsTimer);
    }
    saveUserSettingsTimer = setTimeout(() => {
        saveUserSettingsToDisk();
        saveUserSettingsTimer = null;
        console.log('[Main] User settings otomatis disimpan ke disk (debounced).');
    }, 500);
}

function clearUserSettingsOnDisk() {
    const filePath = getUserSettingsFilePath();
    if (!filePath) return;
    try {
        // HANYA hapus file settings, JANGAN hapus file data (user-data.json)
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Reset userSettings di memori, kembalikan ke default TAPI pertahankan data yang ada
        const { dataPayload } = splitSettingsAndData(userSettings);
        userSettings = { ...defaultUserSettings, ...dataPayload };
        normalizeUserSettings();

        return true;
    } catch (e) {
        console.error('[Main] Gagal menghapus file user settings:', e);
        return false;
    }
}

function loadUserDataFromDisk() {
    const filePath = getUserDataFilePath();
    if (!filePath || !fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
    } catch (e) {
        console.error('[Main] Gagal memuat user data:', e);
        return {};
    }
}

function loadUserSettingsFromDisk() {
    const settingsFilePath = getUserSettingsFilePath();
    let settingsObj = {};
    let dataObj = loadUserDataFromDisk();

    // Load Settings
    if (settingsFilePath && fs.existsSync(settingsFilePath)) {
        try {
            const raw = fs.readFileSync(settingsFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const { _meta, ...rest } = parsed;
                settingsObj = rest;
            }
        } catch (e) {
            console.error('[Main] Gagal memuat user settings dari disk:', e);
        }
    }

    // MIGRATION LOGIC:
    // Jika settingsObj punya data (format lama) dan dataObj kosong/kurang, pindahkan/migrasi
    const dataKeys = ['gifOverlays', 'gifOverlayPresets', 'activePresetId'];
    let migrationNeeded = false;

    // Cek migration dari settingsObj ke dataObj
    dataKeys.forEach(key => {
        if (settingsObj[key] && (!dataObj[key] || (Array.isArray(dataObj[key]) && dataObj[key].length === 0))) {
            dataObj[key] = settingsObj[key];
            migrationNeeded = true;
        }
    });

    // Gabungkan semuanya ke userSettings global
    userSettings = { ...defaultUserSettings, ...settingsObj, ...dataObj };
    normalizeUserSettings();

    if (migrationNeeded) {
        console.log('[Main] Migrasi data (GIF Profiles) dari settings ke user-data.json dilakukan.');
        saveUserDataToDisk(dataObj);
    }

    console.log('[Main] Berhasil memuat user settings dan data dari disk.');
}

function getRememberedSettingsSavedStatus() {
    const filePath = getUserSettingsFilePath();
    if (!filePath) return false;
    try {
        return fs.existsSync(filePath);
    } catch (_) {
        return false;
    }
}

function broadcastRememberSettingsStatus(saved) {
    BrowserWindow.getAllWindows().forEach(win => {
        try {
            if (!win.isDestroyed()) win.webContents.send('remember-settings-status-changed', saved === true);
        } catch (_) { }
    });
}
// =================== Akhir Persistensi Pengaturan ================== //

// =================== Menyimpan dan Memuat Pengaturan Pengguna ================== //
// nyimpan pengaturan dari renderer process
ipcMain.on("save-settings", (event, data) => {
    console.log('[Main] Menyimpan pengaturan:', data);
    userSettings = { ...userSettings, ...data };
    normalizeUserSettings();

    // Jika miniPlayerHideOnCursor berubah, langsung terapkan ke mini-player
    if (data.miniPlayerHideOnCursor !== undefined) {
        // Kirim update ke mini-player window
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            console.log('[Main] Sending hideOnCursor update to miniPlayerWindow:', data.miniPlayerHideOnCursor);
            miniPlayerWindow.webContents.send('update-mini-player-settings', {
                hideOnCursor: data.miniPlayerHideOnCursor
            });
        }

        // Start tracking jika diaktifkan
        if (data.miniPlayerHideOnCursor && isMiniPlayerFeatureEnabled) {
            startMiniPlayerCursorTracking();
        }
    }
});

// Back-compat (buat dev aja ntar dihapus): treat old boolean toggle as save(true) / clear(false)
ipcMain.on('set-remember-settings', (event, enabled) => {
    if (enabled === true) {
        saveUserSettingsToDisk();
        broadcastRememberSettingsStatus(true);
    } else {
        clearUserSettingsOnDisk();
        broadcastRememberSettingsStatus(false);
    }
});

ipcMain.handle('remember-settings-save', (event, partial) => {
    if (partial && typeof partial === 'object') {
        userSettings = { ...userSettings, ...partial };
        normalizeUserSettings();
    }
    const ok = saveUserSettingsToDisk() === true;
    const saved = getRememberedSettingsSavedStatus();
    broadcastRememberSettingsStatus(saved);
    return { ok, saved };
});

ipcMain.handle('remember-settings-clear', () => {
    const ok = clearUserSettingsOnDisk() === true;
    const saved = getRememberedSettingsSavedStatus();
    broadcastRememberSettingsStatus(saved);
    return { ok, saved };
});

// pengaturan ke renderer process
ipcMain.handle("load-settings", () => {
    console.log('[Main] Memuat pengaturan:', userSettings);

    normalizeUserSettings();
    return {
        ...userSettings,
        rememberedSettingsSaved: getRememberedSettingsSavedStatus()
    };
});
// =================== Akhir Menyimpan dan Memuat Pengaturan Pengguna ================== //

// =================== Logika Volume Global  ================== //
function broadcastGlobalVolumeChange(volume) {
    BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('global-volume-changed', volume);
    });
}

ipcMain.on('set-global-volume', (event, newVolume) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));

    if (userSettings.globalVolume !== clampedVolume) {
        userSettings.globalVolume = clampedVolume;
        console.log(`[Main] Volume global diubah menjadi: ${userSettings.globalVolume}`);

        broadcastGlobalVolumeChange(userSettings.globalVolume);
        scheduleSaveUserSettings();
    }
});

function createSnowWindow() {
    if (snowWindow) {
        return;
    }
    snowWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,

        hasShadow: false,

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        },
        show: false, // Jangan tampilkan saat dibuat
    });
    const snowFile = userSettings.webgpuEnabled ? 'wgsl/snow-webgpu.html' : 'snow.html';
    snowWindow.loadFile(path.join(__dirname, snowFile));
    snowWindow.setIgnoreMouseEvents(true);
    snowWindow.setFocusable(false);

    snowWindow.setAlwaysOnTop(true, 'screen-saver');

    snowWindow.maximize();
    snowWindow.setIgnoreMouseEvents(true);
    snowWindow.on('closed', () => { snowWindow = null; });
    console.log('[Main] Jendela salju dibuat dengan properti tambahan.');
}

// Listener untuk mengaktifkan/menonaktifkan fitur salju
ipcMain.on('set-snow-feature-enabled', (event, enabled) => {
    isSnowFeatureEnabled = enabled;
    userSettings.snowFeatureEnabled = enabled;
    console.log(`[Main] Fitur salju ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`);

    if (enabled) {
        if (!snowWindow) {
            createSnowWindow();
        }
        if (snowWindow) {
            snowWindow.show();
        }
    } else {
        if (snowWindow) {
            snowWindow.hide();
        }
    }

    // Update Main Window
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('snow-feature-status-changed', isSnowFeatureEnabled);
    }

    // [BARU] Update Overlay Window secara Real-time
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('snow-feature-status-changed', isSnowFeatureEnabled);
    }

    scheduleSaveUserSettings();
});
// ======================================= Akhir Logika Efek Salju =================================== //

// ======================================= Logika GIF Overlay =================================== //
let gifOverlayWindows = new Map(); // Map<number, BrowserWindow> untuk ID unik
let nextOverlayId = 1;

// Helper: Sync Memory - menyimpan state overlay ke userSettings
function updateGifOverlaysInMemory() {
    const overlays = [];
    gifOverlayWindows.forEach((win, id) => {
        if (!win.isDestroyed() && win.currentPath) {
            const bounds = win.getBounds();
            overlays.push({
                id: id,
                path: win.currentPath,
                settings: win.gifSettings || { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false },
                bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
            });
        }
    });
    userSettings.gifOverlays = overlays;

    // 1. Update global overlays (untuk restore boot)
    userSettings.gifOverlays = overlays;

    // 2. CRITICAL: Update juga definisi Preset yang sedang Aktif
    // Agar saat user pindah preset lalu kembali, perubahan posisi/setting tersimpan
    if (userSettings.activePresetId && userSettings.gifOverlayPresets) {
        const activeIdx = userSettings.gifOverlayPresets.findIndex(p => p.presetId === userSettings.activePresetId);
        if (activeIdx !== -1) {
            // Clone overlays untuk menghindari referensi silang
            // Kita simpan state TERBARU ke dalam preset
            userSettings.gifOverlayPresets[activeIdx].overlays = JSON.parse(JSON.stringify(overlays));
            userSettings.gifOverlayPresets[activeIdx].updatedAt = Date.now();
            if (DEBUG_GIF) console.log(`[GIF] Active preset synced: ${userSettings.activePresetId} (${overlays.length} items)`);
        }
    }
}

let isGifOverlayEnabled = false;
let isGifOverlayLocked = false;

// State musik terakhir untuk kondisional GIF
let lastMusicState = {
    isPlaying: false,
    title: '',
    artist: ''
};

// State iklan terakhir untuk kondisional GIF (none, waiting, skippable)
let lastAdState = 'none';

// === DEBUG FLAG ===
// Set to true untuk enable verbose logging saat development/debugging
const DEBUG_GIF = false;

// === SISTEM ANIMASI GIF  ===
// === GIF ANIMATION SYSTEM ===

/**
 * State tracking untuk animasi setiap GIF
 * Map<id, { vx, vy, paused, resumeTimer, type }>
 */
const gifAnimations = new Map();
let animationLoopInterval = null;

/**
 * Initialize animation state untuk GIF
 */
function initAnimationState(id, settings) {
    const animSettings = settings?.animation || {};
    const type = animSettings.type || 'none';
    const speed = animSettings.speed || 2;

    if (type === 'none') return null;

    const state = {
        type: type,
        vx: speed,  // Velocity X (pixels per frame)
        vy: speed,  // Velocity Y
        paused: false,
        resumeTimer: null
    };

    // Type-specific initialization
    if (type === 'dvd' || type === 'random') {
        // Random initial direction untuk bouncing animations
        state.vx *= Math.random() > 0.5 ? 1 : -1;
        state.vy *= Math.random() > 0.5 ? 1 : -1;
    } else if (type === 'linear') {
        // Random direction tapi konsisten
        const angle = Math.random() * Math.PI * 2;
        state.vx = Math.cos(angle) * speed;
        state.vy = Math.sin(angle) * speed;
    } else if (type === 'circular') {
        // Circular tidak perlu vy, vx jadi angular speed
        state.vy = 0;
        state.angle = 0;
        state.radius = 80; // Match dengan radius di updateGifPosition
    } else if (type === 'patrol' || type === 'patrol-wave') {
        // Patroli: Gerak kiri-kanan dengan flip
        // Mulai gerak ke KIRI sesuai permintaan user
        state.vx = -Math.abs(speed);
        state.vy = 0;
        state.facingRight = false; // Mulai menghadap kiri

        // Untuk Patroli Bergelombang
        state.waveAngle = 0;
        state.baseY = null; // Akan diset di loop update
    } else if (type === 'patrol-vertical' || type === 'patrol-wave-vertical') {
        // Patroli Vertikal: Gerak atas-bawah dengan flip vertikal
        state.vx = 0;
        state.vy = Math.abs(speed); // Mulai gerak ke BAWAH
        state.facingDown = true; // Mulai menghadap bawah

        // Untuk Patroli Bergelombang Vertikal
        state.waveAngle = 0;
        state.baseX = null; // Akan diset di loop update
    }

    gifAnimations.set(id, state);
    console.log(`[GIF Animation] Initialized ${type} animation for GIF #${id}, speed=${speed}`);
    return state;
}

/**
 * Update position GIF berdasarkan animation type
 */
function updateGifPosition(id, win, settings, animState) {
    if (!win || win.isDestroyed() || animState.paused) return;

    try {
        const bounds = win.getBounds();
        // Require screen inside function to avoid init issues
        const { screen } = require('electron');
        const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
        const workArea = display.workArea;

        let newX = bounds.x;
        let newY = bounds.y;

        if (animState.type === 'dvd') {
            // DVD Bouncing - classic screen saver style
            newX += animState.vx;
            newY += animState.vy;

            // Bounce off edges dengan margin kecil untuk avoid stuck
            const margin = 2;
            if (newX <= workArea.x + margin) {
                newX = workArea.x + margin;
                animState.vx = Math.abs(animState.vx); // Bounce right
            } else if (newX + bounds.width >= workArea.x + workArea.width - margin) {
                newX = workArea.x + workArea.width - bounds.width - margin;
                animState.vx = -Math.abs(animState.vx); // Bounce left
            }

            if (newY <= workArea.y + margin) {
                newY = workArea.y + margin;
                animState.vy = Math.abs(animState.vy); // Bounce down
            } else if (newY + bounds.height >= workArea.y + workArea.height - margin) {
                newY = workArea.y + workArea.height - bounds.height - margin;
                animState.vy = -Math.abs(animState.vy); // Bounce up
            }

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });

        } else if (animState.type === 'linear') {
            // Linear - bergerak lurus, wrap around ke sisi lain saat keluar
            newX += animState.vx;
            newY += animState.vy;

            // Wrap around screen edges (seperti asteroid game)
            if (newX < workArea.x - bounds.width) {
                newX = workArea.x + workArea.width;
            } else if (newX > workArea.x + workArea.width) {
                newX = workArea.x - bounds.width;
            }

            if (newY < workArea.y - bounds.height) {
                newY = workArea.y + workArea.height;
            } else if (newY > workArea.y + workArea.height) {
                newY = workArea.y - bounds.height;
            }

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });

        } else if (animState.type === 'circular') {
            // Circular - bergerak melingkar (orbit) di tempat
            // Initialize center point ONCE berdasarkan posisi awal
            if (!animState.centerX) {
                // Gunakan posisi window saat ini + offset ke center sebagai pivot point
                animState.centerX = bounds.x + bounds.width / 2;
                animState.centerY = bounds.y + bounds.height / 2;
                animState.angle = 0;
                animState.radius = 80; // Radius orbit (lebih kecil agar tidak keluar layar)
                console.log(`[GIF Animation] Circular orbit center set at (${Math.round(animState.centerX)}, ${Math.round(animState.centerY)})`);
            }

            // Update angle (speed controls rotation speed)
            animState.angle += animState.vx * 0.02; // Convert speed to radians

            // Calculate position on circle RELATIVE to saved center
            // Orbit mengitari center point yang tersimpan (bukan screen center!)
            newX = animState.centerX + Math.cos(animState.angle) * animState.radius - bounds.width / 2;
            newY = animState.centerY + Math.sin(animState.angle) * animState.radius - bounds.height / 2;

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });

        } else if (animState.type === 'random') {
            // Random Walk - ubah arah secara random
            newX += animState.vx;
            newY += animState.vy;

            // Bounce off edges
            const margin = 2;
            if (newX <= workArea.x + margin || newX + bounds.width >= workArea.x + workArea.width - margin) {
                animState.vx = -animState.vx;
                // Add random variation saat bounce
                animState.vx += (Math.random() - 0.5) * 2;
            }

            if (newY <= workArea.y + margin || newY + bounds.height >= workArea.y + workArea.height - margin) {
                animState.vy = -animState.vy;
                // Add random variation saat bounce
                animState.vy += (Math.random() - 0.5) * 2;
            }

            // Random direction changes (10% chance per frame)
            if (Math.random() < 0.1) {
                animState.vx += (Math.random() - 0.5) * 1;
                animState.vy += (Math.random() - 0.5) * 1;
            }

            // Clamp velocity agar tidak terlalu cepat/lambat
            const maxSpeed = 10;
            const minSpeed = 1;
            const currentSpeed = Math.sqrt(animState.vx ** 2 + animState.vy ** 2);
            if (currentSpeed > maxSpeed) {
                animState.vx = (animState.vx / currentSpeed) * maxSpeed;
                animState.vy = (animState.vy / currentSpeed) * maxSpeed;
            } else if (currentSpeed < minSpeed) {
                animState.vx = (animState.vx / currentSpeed) * minSpeed;
                animState.vy = (animState.vy / currentSpeed) * minSpeed;
            }

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });

        } else if (animState.type === 'patrol' || animState.type === 'patrol-wave') {
            // Patroli: Gerak kiri-kanan sampai mentok, lalu flip
            newX += animState.vx;

            let hitWall = false;
            // Mentok Kiri -> Balik Kanan
            if (newX <= workArea.x) {
                newX = workArea.x;
                animState.vx = Math.abs(animState.vx); // Paksa gerak KANAN
                if (!animState.facingRight) {
                    animState.facingRight = true;
                    hitWall = true;
                }
            }
            // Mentok Kanan -> Balik Kiri
            else if (newX + bounds.width >= workArea.x + workArea.width) {
                newX = workArea.x + workArea.width - bounds.width;
                animState.vx = -Math.abs(animState.vx); // Paksa gerak KIRI
                if (animState.facingRight) {
                    animState.facingRight = false;
                    hitWall = true;
                }
            }

            // Sinkronkan flip hanya jika berubah (untuk performa)
            if (hitWall) {
                win.webContents.send('set-flip', animState.facingRight);
            }
            // Kirim flip awal jika belum pernah disinkronkan (flagging awal)
            if (animState.flipSynced === undefined) {
                win.webContents.send('set-flip', animState.facingRight);
                animState.flipSynced = true;
            }

            // Logika Gelombang (Wave)
            if (animState.type === 'patrol-wave') {
                if (animState.baseY === null || animState.baseY === undefined) {
                    animState.baseY = bounds.y;
                }

                // Parameter gelombang (Ubah angka ini untuk mengatur intensitas)
                const amplitude = 7.5;   // Tinggi gelombang (jarak naik/turun dari tengah dalam pixel)
                const frequency = 0.05; // Kerapatan gelombang (semakin besar angka, semakin rapat gelombangnya)

                // Kalkulasi sudut gelombang berdasarkan kecepatan horizontal
                animState.waveAngle += Math.abs(animState.vx) * frequency;

                // Hitung posisi Y baru menggunakan fungsi sinus
                newY = animState.baseY + Math.sin(animState.waveAngle) * amplitude;
            }

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });

        } else if (animState.type === 'patrol-vertical' || animState.type === 'patrol-wave-vertical') {
            // Patroli Vertikal: Gerak atas-bawah sampai mentok, lalu flip vertikal
            newY += animState.vy;

            let hitWall = false;
            // Mentok Atas -> Balik Bawah
            if (newY <= workArea.y) {
                newY = workArea.y;
                animState.vy = Math.abs(animState.vy); // Paksa gerak BAWAH
                if (!animState.facingDown) {
                    animState.facingDown = true;
                    hitWall = true;
                }
            }
            // Mentok Bawah -> Balik Atas
            else if (newY + bounds.height >= workArea.y + workArea.height) {
                newY = workArea.y + workArea.height - bounds.height;
                animState.vy = -Math.abs(animState.vy); // Paksa gerak ATAS
                if (animState.facingDown) {
                    animState.facingDown = false;
                    hitWall = true;
                }
            }

            // Sinkronkan flip vertikal hanya jika berubah
            if (hitWall) {
                win.webContents.send('set-flip-vertical', animState.facingDown);
            }
            // Kirim flip awal jika belum pernah disinkronkan
            if (animState.flipVerticalSynced === undefined) {
                win.webContents.send('set-flip-vertical', animState.facingDown);
                animState.flipVerticalSynced = true;
            }

            // Logika Gelombang Vertikal
            if (animState.type === 'patrol-wave-vertical') {
                if (animState.baseX === null || animState.baseX === undefined) {
                    animState.baseX = bounds.x;
                }

                // Parameter gelombang vertikal
                const amplitude = 7;
                const frequency = 0.05;

                // Kalkulasi sudut gelombang
                animState.waveAngle += Math.abs(animState.vy) * frequency;

                // Hitung posisi X baru (gelombang horizontal saat gerak vertikal)
                newX = animState.baseX + Math.sin(animState.waveAngle) * amplitude;
            }

            win.setBounds({ x: Math.round(newX), y: Math.round(newY) });
        }
        // Future: Tambahkan type lain (follow-mouse, figure-8, dll)

    } catch (e) {
        if (DEBUG_GIF) console.error(`[GIF Animation] Error updating position for #${id}:`, e);
    }
}

/**
 * Start animation loop untuk semua animated GIFs
 */
function startGifAnimationLoop() {
    if (animationLoopInterval) return;

    console.log('[GIF Animation] Starting animation loop (60 FPS)');
    animationLoopInterval = setInterval(() => {
        gifOverlayWindows.forEach((win, id) => {
            if (win.isDestroyed()) {
                gifAnimations.delete(id);
                return;
            }

            // Get settings dari userSettings
            const overlay = (userSettings.gifOverlays || []).find(o => o.id === id);
            if (!overlay || !overlay.settings) return;

            const animSettings = overlay.settings.animation;
            if (!animSettings || animSettings.type === 'none' || !animSettings.enabled) return;

            // Get or init animation state
            let animState = gifAnimations.get(id);
            if (!animState) {
                animState = initAnimationState(id, overlay.settings);
                if (!animState) return;
            }

            // Update position
            updateGifPosition(id, win, overlay.settings, animState);
        });
    }, 16); // ~60 FPS (16ms per frame)
}

/**
 * Stop animation loop
 */
function stopGifAnimationLoop() {
    if (animationLoopInterval) {
        clearInterval(animationLoopInterval);
        animationLoopInterval = null;
        console.log('[GIF Animation] Animation loop stopped');
    }
}

/**
 * Pause animation untuk specific GIF (triggered by user interaction)
 */
function pauseGifAnimation(id, duration = 2000) {
    const animState = gifAnimations.get(id);
    if (!animState) return;

    animState.paused = true;
    if (DEBUG_GIF) console.log(`[GIF Animation] Paused animation for GIF #${id}`);

    // Auto-resume setelah duration
    clearTimeout(animState.resumeTimer);
    animState.resumeTimer = setTimeout(() => {
        animState.paused = false;
        if (DEBUG_GIF) console.log(`[GIF Animation] Resumed animation for GIF #${id}`);
    }, duration);
}

/**
 * Remove animation state saat GIF closed
 */
function removeGifAnimation(id) {
    const animState = gifAnimations.get(id);
    if (animState) {
        clearTimeout(animState.resumeTimer);
        gifAnimations.delete(id);
        if (DEBUG_GIF) console.log(`[GIF Animation] Removed animation state for GIF #${id}`);
    }
}

let gifAnimations_OLD = new Map(); // Map storing animation state per overlay ID
let gifAnimationInterval_OLD = null;
const ANIMATION_FPS_OLD = 60;

function initAnimationState_OLD(id, settings, bounds) {
    if (!settings || !settings.animation || !settings.animation.enabled || settings.animation.type === 'none') {
        gifAnimations.delete(id);
        // Cek apakah masih ada animasi lain, jika tidak stop loop
        if (gifAnimations.size === 0) stopGifAnimationLoop();
        return;
    }

    const type = settings.animation.type;
    const speed = settings.animation.speed || 2;

    // Reset state jika tipe berubah atau inisialisasi awal
    let state = {
        type: type,
        speed: speed,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        dx: (Math.random() > 0.5 ? 1 : -1) * speed, // Random initial direction for bounce
        dy: (Math.random() > 0.5 ? 1 : -1) * speed,
        paused: false,
        pauseTimeout: null,
        // Properti khusus circular
        centerX: bounds.x + bounds.width / 2,
        centerY: bounds.y + bounds.height / 2,
        radius: 80, // Default radius lebih kecil
        angle: 0,
        // Properti khusus patrol/wave
        facingRight: true, // true = scaleX(1), false = scaleX(-1)
        facingDown: true,  // true = scaleY(1), false = scaleY(-1)
        baseY: bounds.y, // Untuk wave horizontal
        baseX: bounds.x, // Untuk wave vertical
        waveAngle: 0,
        amplitude: 50,
        frequency: 0.05
    };

    // Override velocity/direction based on type
    if (type === 'patrol' || type === 'patrol-wave') {
        state.dx = speed; // Mulai bergerak horizontal
        state.dy = 0;
    } else if (type === 'patrol-vertical' || type === 'patrol-wave-vertical') {
        state.dx = 0;
        state.dy = speed; // Mulai bergerak vertikal
    }

    gifAnimations.set(id, state);
    console.log(`[GIF Animation] Initialized ${type} animation for GIF #${id}, speed=${speed}`);

    // Pastikan loop jalan jika ada animasi aktif
    startGifAnimationLoop();
}

function pauseGifAnimation_OLD(id, duration = 3000) {
    const state = gifAnimations.get(id);
    if (state) {
        state.paused = true;
        if (state.pauseTimeout) clearTimeout(state.pauseTimeout);
        state.pauseTimeout = setTimeout(() => {
            state.paused = false;
        }, duration);
    }
}

function startGifAnimationLoop_OLD() {
    if (gifAnimationInterval) return; // Sudah berjalan

    console.log(`[GIF Animation] Starting animation loop (${ANIMATION_FPS} FPS)`);
    const intervalMs = 1000 / ANIMATION_FPS;

    gifAnimationInterval = setInterval(() => {
        if (gifAnimations.size === 0) {
            stopGifAnimationLoop();
            return;
        }

        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        const screenW = workArea.width;
        const screenH = workArea.height;

        gifAnimations.forEach((state, id) => {
            const win = gifOverlayWindows.get(id);
            // Validasi window
            if (!win || win.isDestroyed() || state.paused || !win.isVisible()) return;

            // Calculate new position based on type
            let flipXChanged = false; // Flag untuk kirim IPC flip
            let flipYChanged = false;

            switch (state.type) {
                case 'dvd':
                case 'random': // Random walk juga bouncing
                    state.x += state.dx;
                    state.y += state.dy;

                    // Bounce logic
                    if (state.x <= 0 || state.x + state.width >= screenW) {
                        state.dx *= -1;
                        state.x = Math.max(0, Math.min(state.x, screenW - state.width));
                    }
                    if (state.y <= 0 || state.y + state.height >= screenH) {
                        state.dy *= -1;
                        state.y = Math.max(0, Math.min(state.y, screenH - state.height));
                    }

                    // Random turn chance
                    if (state.type === 'random' && Math.random() < 0.02) {
                        state.dx = (Math.random() > 0.5 ? 1 : -1) * state.speed;
                        state.dy = (Math.random() > 0.5 ? 1 : -1) * state.speed;
                    }
                    break;

                case 'linear': // Tembus wrap around
                    state.x += state.dx;
                    // If out of bounds right -> muncul di kiri
                    if (state.x > screenW) state.x = -state.width;
                    else if (state.x + state.width < 0) state.x = screenW;
                    break;

                case 'circular':
                    // Orbit di sekitar center
                    state.angle += state.speed * 0.02;
                    state.x = state.centerX + Math.cos(state.angle) * state.radius - (state.width / 2);
                    state.y = state.centerY + Math.sin(state.angle) * state.radius - (state.height / 2);
                    break;

                case 'patrol':
                case 'patrol-wave':
                    state.x += state.dx;
                    // Wave motion Y
                    if (state.type === 'patrol-wave') {
                        state.waveAngle += state.frequency * state.speed;
                        state.y = state.baseY + Math.sin(state.waveAngle) * state.amplitude;
                    }

                    // Bounce Horizontal Only & FLIP
                    if (state.x <= 0) {
                        state.dx = Math.abs(state.dx); // Gerak ke Kanan
                        state.facingRight = true;
                        flipXChanged = true;
                    } else if (state.x + state.width >= screenW) {
                        state.dx = -Math.abs(state.dx); // Gerak ke Kiri
                        state.facingRight = false;
                        flipXChanged = true;
                    }
                    break;

                case 'patrol-vertical':
                case 'patrol-wave-vertical':
                    state.y += state.dy;
                    // Wave motion X
                    if (state.type === 'patrol-wave-vertical') {
                        state.waveAngle += state.frequency * state.speed;
                        state.x = state.baseX + Math.sin(state.waveAngle) * state.amplitude;
                    }

                    // Bounce Vertical Only & FLIP Y
                    if (state.y <= 0) {
                        state.dy = Math.abs(state.dy); // Gerak ke Bawah
                        state.facingDown = true;
                        flipYChanged = true;
                    } else if (state.y + state.height >= screenH) {
                        state.dy = -Math.abs(state.dy); // Gerak ke Atas
                        state.facingDown = false;
                        flipYChanged = true;
                    }
                    break;
            }

            // Apply position
            try {
                // Gunakan Math.round untuk pixel perfect
                const finalX = Math.round(state.x);
                const finalY = Math.round(state.y);

                win.setBounds({ x: finalX, y: finalY, width: state.width, height: state.height });

                // Kirim event Flip jika berubah (dan belum pernah dikirim atau berubah state)
                // Note: ipc 'set-flip' dan 'set-flip-vertical' harus dilisten di gif-overlay.html
                if (flipXChanged) {
                    win.webContents.send('set-flip', state.facingRight ? 1 : -1);
                }
                if (flipYChanged) {
                    win.webContents.send('set-flip-vertical', state.facingDown ? 1 : -1);
                }
            } catch (e) {
                // Ignore error if window destroyed mid-loop
            }

        });

    }, intervalMs);
}

function stopGifAnimationLoop_OLD() {
    if (gifAnimationInterval) {
        clearInterval(gifAnimationInterval);
        gifAnimationInterval = null;
        console.log('[GIF Animation] Animation loop stopped');
    }
}

function createGifOverlayWindow(initialPath = null, forcedId = null, initialSettings = null, initialBounds = null) {
    const id = forcedId || nextOverlayId++;
    if (forcedId && forcedId >= nextOverlayId) nextOverlayId = forcedId + 1;

    // Default bounds jika tidak ada
    const defaultWidth = 200;
    const defaultHeight = 200;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;

    const bounds = initialBounds || {
        x: Math.floor(workArea.width / 2 - defaultWidth / 2),
        y: Math.floor(workArea.height / 2 - defaultHeight / 2),
        width: defaultWidth,
        height: defaultHeight
    };

    const win = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: true, // Harus focusable agar drag berfungsi
        hasShadow: false,
        resizable: false, // Resize manual via IPC
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        },
        show: false,
    });

    win.loadFile(path.join(__dirname, 'gif-overlay.html'));
    win.setAlwaysOnTop(true, 'screen-saver');

    // Simpan data di object window
    win.overlayId = id;
    win.currentPath = initialPath;

    // Ensure animation property exists (backward compatibility)
    const defaultSettings = {
        condition: 'always',
        value: '',
        opacity: 1,
        rotation: 0,
        hideOnCursor: false,
        animation: { type: 'none', speed: 2, enabled: true }
    };
    win.gifSettings = initialSettings ? { ...defaultSettings, ...initialSettings } : defaultSettings;
    win.resizeStartBounds = null; // Untuk tracking resize
    win.isHiddenByCursor = false; // Flag untuk hide on cursor approach

    // Set mouse ignore berdasarkan status lock
    // HARUS explicit untuk kedua kondisi karena transparent window behavior
    win.setIgnoreMouseEvents(isGifOverlayLocked);

    win.webContents.once('did-finish-load', () => {
        win.webContents.send('init-overlay', {
            id: id,
            path: initialPath,
            locked: isGifOverlayLocked,
            bounds: bounds
        });

        // Terapkan opacity jika ada
        if (initialSettings && initialSettings.opacity !== undefined) {
            win.webContents.send('set-opacity', initialSettings.opacity);
        }

        // Terapkan rotation jika ada
        if (initialSettings && initialSettings.rotation !== undefined) {
            win.webContents.send('set-rotation', initialSettings.rotation);
        }
    });

    // Simpan posisi saat window dipindahkan
    win.on('moved', () => {
        // Pause animation saat user drag window
        pauseGifAnimation(id, 2000); // Auto-resume after 2s idle

        // Reset circular orbit center jika animation type adalah circular
        const animState = gifAnimations.get(id);
        if (animState) {
            const currentBounds = win.getBounds();

            if (animState.type === 'circular') {
                animState.centerX = currentBounds.x + currentBounds.width / 2;
                animState.centerY = currentBounds.y + currentBounds.height / 2;
                animState.angle = 0; // Reset angle agar smooth dari posisi baru
                console.log(`[GIF Animation] Circular orbit re-centered to (${Math.round(animState.centerX)}, ${Math.round(animState.centerY)})`);
            } else if (animState.type === 'patrol-wave') {
                animState.baseY = currentBounds.y;
                animState.waveAngle = 0;
                console.log(`[GIF Animation] Patrol Wave base Y reset to ${animState.baseY}`);
            } else if (animState.type === 'patrol-wave-vertical') {
                animState.baseX = currentBounds.x;
                animState.waveAngle = 0;
                console.log(`[GIF Animation] Patrol Wave Vertical base X reset to ${animState.baseX}`);
            }
        }

        updateGifOverlaysInMemory();
    });

    win.on('closed', () => {
        // CRITICAL: Check apakah window ini masih ter-track di map
        // Karena saat switch preset, ID bisa reused, dan event 'closed' dari window lama
        // bisa ter-trigger SETELAH window baru dengan ID sama sudah dibuat!
        const trackedWin = gifOverlayWindows.get(id);
        if (trackedWin === win) {
            // Window ini masih ter-track, aman untuk delete
            gifOverlayWindows.delete(id);
            console.log(`[Main] GIF Overlay #${id} ditutup.`);

            // Cleanup animation state
            removeGifAnimation(id);

            updateGifOverlaysInMemory();
        } else {
            // Window ini sudah digantikan dengan window baru, skip delete
            console.log(`[Main] GIF Overlay #${id} ditutup (old window, skipped tracking cleanup).`);
        }
    });

    gifOverlayWindows.set(id, win);

    // Jika enabled secara global, tampilkan
    if (isGifOverlayEnabled) {
        win.show();
    }

    console.log(`[Main] GIF Overlay #${id} dibuat. Bounds: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`);

    // Ensure animation loop is running if needed
    startGifAnimationLoop();

    return id;
}

function createGifOverlayWindow_OLD(initialPath = null, forcedId = null, initialSettings = null, initialBounds = null) {
    const id = forcedId || nextOverlayId++;
    if (forcedId && forcedId >= nextOverlayId) nextOverlayId = forcedId + 1;

    // Default bounds jika tidak ada
    const defaultWidth = 200;
    const defaultHeight = 200;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;

    const bounds = initialBounds || {
        x: Math.floor(workArea.width / 2 - defaultWidth / 2),
        y: Math.floor(workArea.height / 2 - defaultHeight / 2),
        width: defaultWidth,
        height: defaultHeight
    };

    const win = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: true, // Harus focusable agar drag berfungsi
        hasShadow: false,
        resizable: false, // Resize manual via IPC
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        },
        show: false,
    });

    win.loadFile(path.join(__dirname, 'gif-overlay.html'));
    win.setAlwaysOnTop(true, 'screen-saver');

    // Simpan data di object window
    win.overlayId = id;
    win.currentPath = initialPath;
    const defaultSettings = { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false, animation: { type: 'none', speed: 2, enabled: true } };
    win.gifSettings = initialSettings ? { ...defaultSettings, ...initialSettings } : defaultSettings;
    win.resizeStartBounds = null; // Untuk tracking resize
    win.isHiddenByCursor = false; // Flag untuk hide on cursor approach

    // Inisialisasi state animasi
    initAnimationState(id, win.gifSettings, bounds);

    // Set mouse ignore berdasarkan status lock
    // HARUS explicit untuk kedua kondisi karena transparent window behavior
    win.setIgnoreMouseEvents(isGifOverlayLocked);

    win.webContents.once('did-finish-load', () => {
        win.webContents.send('init-overlay', {
            id: id,
            path: initialPath,
            locked: isGifOverlayLocked,
            bounds: bounds
        });

        // Terapkan opacity jika ada
        if (initialSettings && initialSettings.opacity !== undefined) {
            win.webContents.send('set-opacity', initialSettings.opacity);
        }

        // Terapkan rotation jika ada
        if (initialSettings && initialSettings.rotation !== undefined) {
            win.webContents.send('set-rotation', initialSettings.rotation);
        }
    });

    // Simpan posisi saat window dipindahkan
    win.on('moved', () => {
        // Pause animation saat user drag window
        pauseGifAnimation(id, 2000); // Auto-resume after 2s idle

        // Update animasi state agar tidak reset ke posisi lama secara tiba-tiba
        const currentState = gifAnimations.get(id);
        const currentBounds = win.getBounds();
        if (currentState) {
            currentState.x = currentBounds.x;
            currentState.y = currentBounds.y;

            // Reset parameter spesifik
            if (currentState.type === 'circular') {
                currentState.centerX = currentBounds.x + currentBounds.width / 2;
                currentState.centerY = currentBounds.y + currentBounds.height / 2;
            } else if (currentState.type === 'patrol-wave') {
                currentState.baseY = currentBounds.y;
            } else if (currentState.type === 'patrol-wave-vertical') {
                currentState.baseX = currentBounds.x;
            }
        }

        updateGifOverlaysInMemory();
    });

    win.on('closed', () => {
        gifOverlayWindows.delete(id);
        console.log(`[Main] GIF Overlay #${id} ditutup.`);
        updateGifOverlaysInMemory();
    });

    gifOverlayWindows.set(id, win);

    // Jika enabled secara global, tampilkan
    if (isGifOverlayEnabled) {
        win.show();
    }

    console.log(`[Main] GIF Overlay #${id} dibuat. Bounds: ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`);
    return id;
}

// Handler: Buat Overlay Baru (mengembalikan ID)
ipcMain.handle('create-new-gif-overlay', async (event, path) => {
    const id = createGifOverlayWindow(path);
    return id;
});

// Handler: Set Gambar pada Overlay Spesifik
ipcMain.on('set-gif-overlay-image-by-id', (event, { id, path }) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.currentPath = path; // Update path in window obj
        win.webContents.send('init-overlay', { id: id, path: path }); // Re-init image logic (or repurpose init)
        updateGifOverlaysInMemory();
    }
});

// === Helper: Hapus file GIF dari disk ===
function deleteGifFileFromDisk(filePath) {
    if (!filePath) return { success: false, reason: 'No path provided' };

    try {
        // Hanya hapus file jika berada di folder gif-storage
        if (!filePath.includes('gif-storage')) {
            console.log(`[GIF Storage] File bukan dari gif-storage, skip hapus: ${filePath}`);
            return { success: false, reason: 'File not in gif-storage folder' };
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[GIF Storage] File berhasil dihapus: ${filePath}`);
            return { success: true };
        } else {
            console.log(`[GIF Storage] File tidak ditemukan, mungkin sudah dihapus: ${filePath}`);
            return { success: false, reason: 'File not found' };
        }
    } catch (e) {
        console.error(`[GIF Storage] Gagal menghapus file: ${filePath}`, e);
        return { success: false, reason: e.message };
    }
}

// === Helper: Log sinkronisasi GIF ===
function logGifSyncStatus(context) {
    const windowCount = gifOverlayWindows.size;
    const settingsCount = (userSettings.gifOverlays || []).length;
    const activePreset = userSettings.activePresetId;
    let presetCount = 0;

    if (activePreset && userSettings.gifOverlayPresets) {
        const preset = userSettings.gifOverlayPresets.find(p => p.presetId === activePreset);
        presetCount = preset ? preset.overlays.length : 0;
    }

    console.log(`[GIF Sync][${context}] Windows: ${windowCount}, Settings: ${settingsCount}, ActivePreset: ${activePreset || 'null'}, PresetOverlays: ${presetCount}`);

    // Warn jika tidak sinkron
    if (windowCount !== settingsCount) {
        console.warn(`[GIF Sync][${context}] ⚠️ DESYNC: Windows (${windowCount}) != Settings (${settingsCount})`);
    }

    return { windowCount, settingsCount, presetCount, activePreset };
}

// Handler: Hapus Overlay Spesifik (dengan opsi hapus file dari disk)
ipcMain.on('close-gif-overlay-by-id', (event, idOrOptions) => {
    let id, deleteFile = false;

    // Support both old format (just id) and new format ({ id, deleteFile })
    if (typeof idOrOptions === 'object') {
        id = idOrOptions.id;
        deleteFile = idOrOptions.deleteFile === true;
    } else {
        id = idOrOptions;
    }

    const win = gifOverlayWindows.get(id);
    let filePath = null;

    if (win && !win.isDestroyed()) {
        // Ambil path file sebelum close
        filePath = win.gifPath;
        win.close();
        console.log(`[Main][GIF] Overlay #${id} closed, deleteFile: ${deleteFile}`);
    }

    gifOverlayWindows.delete(id);

    // Hapus dari userSettings.gifOverlays
    if (userSettings.gifOverlays && Array.isArray(userSettings.gifOverlays)) {
        const index = userSettings.gifOverlays.findIndex(o => o.id === id);
        if (index !== -1) {
            if (!filePath) filePath = userSettings.gifOverlays[index].path;
            userSettings.gifOverlays.splice(index, 1);
            console.log(`[Main][GIF] Removed overlay #${id} from settings`);
        }
    }

    // Hapus file dari disk jika diminta
    if (deleteFile && filePath) {
        deleteGifFileFromDisk(filePath);
    }

    logGifSyncStatus('close-gif-overlay-by-id');
    scheduleSaveUserSettings();
});

// Handler: Tutup SEMUA overlay window dan bersihkan state
// Options: { deleteFiles: boolean } - jika true, hapus juga file GIF dari disk
ipcMain.handle('gif-overlay-close-all', async (event, options = {}) => {
    const deleteFiles = options?.deleteFiles === true;
    const beforeCount = gifOverlayWindows.size;

    console.log(`[Main][GIF] === CLEANUP ALL START ===`);
    console.log(`[Main][GIF] Menutup ${beforeCount} overlay windows, deleteFiles: ${deleteFiles}`);
    logGifSyncStatus('close-all-before');

    // Kumpulkan path file sebelum close jika perlu hapus
    const filePaths = [];
    if (deleteFiles) {
        gifOverlayWindows.forEach((win, id) => {
            if (win.gifPath) filePaths.push(win.gifPath);
        });
        // Juga dari settings
        (userSettings.gifOverlays || []).forEach(o => {
            if (o.path && !filePaths.includes(o.path)) filePaths.push(o.path);
        });
    }

    // Tutup semua window overlay
    gifOverlayWindows.forEach((win, id) => {
        if (!win.isDestroyed()) {
            win.close();
        }
    });

    // Bersihkan map
    gifOverlayWindows.clear();

    // Reset counter
    nextOverlayId = 1;

    // Bersihkan data di userSettings
    userSettings.gifOverlays = [];
    scheduleSaveUserSettings();

    // Hapus file dari disk jika diminta
    if (deleteFiles && filePaths.length > 0) {
        console.log(`[Main][GIF] Menghapus ${filePaths.length} file dari disk...`);
        for (const fp of filePaths) {
            deleteGifFileFromDisk(fp);
        }
    }

    logGifSyncStatus('close-all-after');
    console.log(`[Main][GIF] === CLEANUP ALL COMPLETE: ${beforeCount} windows closed ===`);

    return { success: true, closedCount: beforeCount };
});

// Handler: Restore GIF Overlay Window saat boot
// Dipanggil dari gif-overlay-standalone.html saat loadSettings()
ipcMain.on('restore-gif-overlay-window', (event, { id, path, settings, bounds }) => {
    console.log(`[Main][GIF] Restore window overlay #${id} dengan path: ${path}`);

    // Cek apakah window dengan ID ini sudah ada
    const existingWin = gifOverlayWindows.get(id);
    if (existingWin && !existingWin.isDestroyed()) {
        console.log(`[Main][GIF] Window #${id} sudah ada, skip restore.`);
        return;
    }

    // Buat window overlay dengan konfigurasi yang tersimpan
    createGifOverlayWindow(path, id, settings, bounds);

    logGifSyncStatus(`restore-window-#${id}`);
    console.log(`[Main][GIF] Berhasil restore overlay #${id}`);
});

// Handler: Get bounds dari overlay window
ipcMain.handle('get-gif-overlay-bounds', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        const bounds = win.getBounds();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }
    return null;
});

// Handler: Update Per-GIF Settings
ipcMain.on('update-gif-overlay-settings', (event, { id, settings }) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.gifSettings = settings;

        // Terapkan opacity (nilai sudah dalam format decimal 0.1 - 1.0)
        if (settings.opacity !== undefined) {
            win.webContents.send('set-opacity', settings.opacity);
        }

        // Terapkan rotation
        if (settings.rotation !== undefined) {
            win.webContents.send('set-rotation', settings.rotation);
        }

        const animInfo = settings.animation ? `animation=${settings.animation.type}(speed=${settings.animation.speed})` : 'animation=none';
        console.log(`[Main][GIF] Settings diperbarui untuk Overlay #${id}: kondisi=${settings.condition}, value="${settings.value || ''}", opacity=${settings.opacity}, rotation=${settings.rotation || 0}°, hideOnCursor=${settings.hideOnCursor || false}, ${animInfo}`);

        // Update animasi logic
        initAnimationState(id, settings, win.getBounds());

        updateGifOverlaysInMemory();

        // Evaluasi ulang visibilitas berdasarkan kondisi baru
        evaluateGifOverlayVisibility();
    } else {
        console.warn(`[Main][GIF Debug] Overlay #${id} tidak ditemukan atau sudah dihancurkan`);
    }
});

// Handler: Rotate dari UI overlay (tombol +/-)
ipcMain.on('gif-overlay-rotate', (event, { id, rotation }) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        // Update rotation di settings
        if (!win.gifSettings) {
            win.gifSettings = { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false };
        }
        win.gifSettings.rotation = rotation;

        updateGifOverlaysInMemory();
        console.log(`[Main][GIF] Overlay #${id} dirotasi ke ${rotation}°`);
    }
});

// Fungsi: Evaluasi visibilitas setiap GIF overlay berdasarkan kondisi dan state musik
function evaluateGifOverlayVisibility() {
    if (!isGifOverlayEnabled) return;

    gifOverlayWindows.forEach((win, id) => {
        if (win.isDestroyed()) return;

        const settings = win.gifSettings || { condition: 'always' };
        let shouldShow = true;

        switch (settings.condition) {
            case 'always':
                shouldShow = true;
                break;
            case 'music-playing':
                shouldShow = lastMusicState.isPlaying === true;
                break;
            case 'music-paused':
                shouldShow = lastMusicState.isPlaying === false;
                break;
            case 'ad-playing':
                // Tampilkan saat ada iklan (waiting atau skippable)
                shouldShow = lastAdState === 'waiting' || lastAdState === 'skippable';
                break;
            case 'music-title':
                if (settings.value && lastMusicState.title) {
                    const settingsValueLower = settings.value.toLowerCase();
                    const musicTitleLower = lastMusicState.title.toLowerCase();
                    shouldShow = musicTitleLower.includes(settingsValueLower);
                } else {
                    shouldShow = false;
                }
                break;
            case 'music-artist':
                if (settings.value && lastMusicState.artist) {
                    const settingsValueLower = settings.value.toLowerCase();
                    const musicArtistLower = lastMusicState.artist.toLowerCase();
                    shouldShow = musicArtistLower.includes(settingsValueLower);
                } else {
                    shouldShow = false;
                }
                break;
            default:
                shouldShow = true;
        }

        // Jangan tampilkan jika sedang disembunyikan oleh cursor approach
        if (win.isHiddenByCursor) {
            shouldShow = false;
        }

        // Tampilkan atau sembunyikan berdasarkan evaluasi
        if (shouldShow) {
            if (!win.isVisible()) {
                win.show();
                console.log(`[Main][GIF] Overlay #${id} ditampilkan (kondisi: ${settings.condition}, value: "${settings.value || ''}")`);
            }
        } else {
            if (win.isVisible()) {
                win.hide();
                console.log(`[Main][GIF] Overlay #${id} disembunyikan (kondisi: ${settings.condition}, value: "${settings.value || ''}")`);
            }
        }
    });
}

// Handler: Toggle Semua Overlay + Restore
ipcMain.on('set-gif-overlay-enabled', (event, enabled) => {
    isGifOverlayEnabled = enabled;
    userSettings.gifOverlayEnabled = enabled;

    if (enabled) {
        // Jika list kosong, coba restore dari settings
        if (gifOverlayWindows.size === 0) {
            if (userSettings.gifOverlays && Array.isArray(userSettings.gifOverlays) && userSettings.gifOverlays.length > 0) {
                console.log(`[Main] Merestore ${userSettings.gifOverlays.length} GIF overlay...`);
                let maxId = 0;
                userSettings.gifOverlays.forEach(item => {
                    // Restore dengan settings dan bounds per-GIF
                    createGifOverlayWindow(item.path, item.id, item.settings, item.bounds);
                    if (item.id > maxId) maxId = item.id;
                });
                // Pastikan next ID aman
                if (maxId >= nextOverlayId) nextOverlayId = maxId + 1;

                // Evaluasi visibilitas setelah restore
                evaluateGifOverlayVisibility();
            } else {
                console.log('[Main] Tidak ada GIF tersimpan untuk direstore.');
            }
        } else {
            // Evaluasi visibilitas untuk overlay yang sudah ada
            evaluateGifOverlayVisibility();
        }

        // Mulai cursor tracking jika lock aktif
        if (isGifOverlayLocked) {
            startCursorTracking();
        }
    } else {
        gifOverlayWindows.forEach(win => win.hide());
        stopCursorTracking();
    }
});

// --- GIF Overlay Handlers ---
ipcMain.handle('gif-overlay-browse-file', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Pilih File GIF',
        filters: [
            { name: 'GIF Images', extensions: ['gif'] },
            { name: 'All Images', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }
        ],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { filePath: result.filePaths[0] };
});

// ======================== GIF Storage & Preset System ======================== //
// Direktori penyimpanan GIF internal aplikasi
const gifStorageDirectory = path.join(__dirname, 'aset', 'gif-storage');

// Pastikan folder gif-storage ada
function ensureGifStorageDirectory() {
    if (!fs.existsSync(gifStorageDirectory)) {
        fs.mkdirSync(gifStorageDirectory, { recursive: true });
        console.log('[GIF Storage] Folder penyimpanan GIF dibuat:', gifStorageDirectory);
    }
}

// Inisialisasi folder saat aplikasi dimulai
try {
    ensureGifStorageDirectory();
} catch (e) {
    console.error('[GIF Storage] Gagal membuat folder penyimpanan:', e);
}

// Handler: Import file GIF - copy ke folder internal dengan nama unik
ipcMain.handle('gif-overlay-import-file', async (event, externalPath) => {
    try {
        ensureGifStorageDirectory();

        // Cek apakah file sudah ada di folder internal
        if (externalPath.startsWith(gifStorageDirectory)) {
            console.log('[GIF Storage] File sudah ada di folder internal, tidak perlu copy');
            return {
                success: true,
                internalPath: externalPath,
                warning: null
            };
        }

        // Cek ukuran file
        const stats = fs.statSync(externalPath);
        const fileSizeMB = stats.size / (1024 * 1024);
        let warning = null;

        if (fileSizeMB > 10) {
            warning = `Ukuran file cukup besar (${fileSizeMB.toFixed(2)} MB). File berukuran besar dapat mempengaruhi performa aplikasi.`;
            console.warn(`[GIF Storage] Peringatan: ${warning}`);
        }

        // Generate nama file unik dengan timestamp
        const ext = path.extname(externalPath);
        const baseName = path.basename(externalPath, ext);
        const timestamp = Date.now();
        const uniqueName = `${baseName}_${timestamp}${ext}`;
        const internalPath = path.join(gifStorageDirectory, uniqueName);

        // Copy file ke folder internal
        fs.copyFileSync(externalPath, internalPath);
        console.log(`[GIF Storage] File berhasil dicopy: ${externalPath} -> ${internalPath}`);

        return {
            success: true,
            internalPath: internalPath,
            warning: warning
        };
    } catch (e) {
        console.error('[GIF Storage] Gagal mengimport file:', e);
        return {
            success: false,
            error: e.message
        };
    }
});

// Handler: Cek apakah file GIF masih ada
ipcMain.handle('gif-overlay-check-file-exists', async (event, filePath) => {
    try {
        return fs.existsSync(filePath);
    } catch (e) {
        return false;
    }
});

// ======================== Sistem Preset GIF Overlay ======================== //

// Handler: Simpan konfigurasi saat ini sebagai preset baru
ipcMain.handle('gif-preset-save', async (event, { name }) => {
    try {
        const presetId = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        // Ambil data dari semua overlay yang aktif
        const overlays = [];
        gifOverlayWindows.forEach((win, id) => {
            if (!win.isDestroyed() && win.currentPath) {
                const bounds = win.getBounds();
                overlays.push({
                    id: id,
                    path: win.currentPath,
                    settings: win.gifSettings || { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false },
                    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
                });
            }
        });

        const newPreset = {
            presetId: presetId,
            name: name,
            createdAt: now,
            updatedAt: now,
            overlays: overlays
        };

        // Tambahkan ke array preset di userSettings
        if (!userSettings.gifOverlayPresets) {
            userSettings.gifOverlayPresets = [];
        }
        userSettings.gifOverlayPresets.push(newPreset);

        // Set preset baru sebagai preset aktif
        userSettings.activePresetId = presetId;

        // Simpan ke disk
        scheduleSaveUserSettings();

        console.log(`[GIF Preset] Preset baru disimpan: "${name}" (ID: ${presetId}, ${overlays.length} overlay)`);
        return { success: true, preset: newPreset };
    } catch (e) {
        console.error('[GIF Preset] Gagal menyimpan preset:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Dapatkan daftar semua preset
ipcMain.handle('gif-preset-list', async () => {
    return userSettings.gifOverlayPresets || [];
});

// Handler: Hapus preset berdasarkan ID
// Options (second parameter): { deleteFiles: boolean } - jika true, hapus juga file GIF dari disk
ipcMain.handle('gif-preset-delete', async (event, presetIdOrOptions, optionsParam) => {
    try {
        // Support both: gif-preset-delete(presetId) and gif-preset-delete(presetId, { deleteFiles })
        let presetId, deleteFiles = false;
        if (typeof presetIdOrOptions === 'string') {
            presetId = presetIdOrOptions;
            deleteFiles = optionsParam?.deleteFiles === true;
        } else {
            presetId = presetIdOrOptions?.presetId;
            deleteFiles = presetIdOrOptions?.deleteFiles === true;
        }

        console.log(`[GIF Preset] === DELETE PRESET START ===`);
        console.log(`[GIF Preset] Menghapus preset: ${presetId}, deleteFiles: ${deleteFiles}`);
        logGifSyncStatus('preset-delete-before');

        if (!userSettings.gifOverlayPresets) {
            return { success: false, error: 'Tidak ada preset tersimpan' };
        }

        const index = userSettings.gifOverlayPresets.findIndex(p => p.presetId === presetId);
        if (index === -1) {
            return { success: false, error: 'Preset tidak ditemukan' };
        }

        const deletedPreset = userSettings.gifOverlayPresets.splice(index, 1)[0];
        const wasActivePreset = userSettings.activePresetId === presetId;

        // Kumpulkan path file jika perlu hapus
        const filePaths = [];
        if (deleteFiles && deletedPreset.overlays) {
            deletedPreset.overlays.forEach(o => {
                if (o.path) filePaths.push(o.path);
            });
        }

        // Jika preset yang dihapus adalah preset aktif, tutup semua overlay dan reset state
        if (wasActivePreset) {
            console.log('[GIF Preset] Preset aktif dihapus, menutup semua overlay...');

            // Tutup semua window overlay
            gifOverlayWindows.forEach((win, id) => {
                if (!win.isDestroyed()) {
                    win.close();
                }
            });
            gifOverlayWindows.clear();
            nextOverlayId = 1;

            // Reset state
            userSettings.activePresetId = null;
            userSettings.gifOverlays = [];
        }

        // Hapus file dari disk jika diminta
        if (deleteFiles && filePaths.length > 0) {
            console.log(`[GIF Preset] Menghapus ${filePaths.length} file dari disk...`);
            for (const fp of filePaths) {
                deleteGifFileFromDisk(fp);
            }
        }

        scheduleSaveUserSettings();

        logGifSyncStatus('preset-delete-after');
        console.log(`[GIF Preset] === DELETE PRESET COMPLETE: "${deletedPreset.name}" ===`);

        return { success: true, wasActivePreset: wasActivePreset, deletedFilesCount: filePaths.length };
    } catch (e) {
        console.error('[GIF Preset] Gagal menghapus preset:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Terapkan preset - tutup semua overlay lama dan buat yang baru dari preset
ipcMain.handle('gif-preset-apply', async (event, presetId) => {
    try {
        console.log(`[GIF Preset] === APPLY PRESET START ===`);
        logGifSyncStatus('preset-apply-before');

        if (!userSettings.gifOverlayPresets) {
            return { success: false, error: 'Tidak ada preset tersimpan' };
        }

        const preset = userSettings.gifOverlayPresets.find(p => p.presetId === presetId);
        if (!preset) {
            return { success: false, error: 'Preset tidak ditemukan' };
        }

        console.log(`[GIF Preset] Menerapkan preset: "${preset.name}" (${preset.overlays.length} overlay)`);

        // Tutup semua overlay yang ada
        const closedCount = gifOverlayWindows.size;
        gifOverlayWindows.forEach((win, id) => {
            if (!win.isDestroyed()) {
                win.close();
            }
        });
        gifOverlayWindows.clear();
        nextOverlayId = 1;
        console.log(`[GIF Preset] Closed ${closedCount} existing windows`);

        // Buat overlay baru dari preset
        const missingFiles = [];
        let maxId = 0;

        for (const overlay of preset.overlays) {
            // Cek apakah file masih ada
            if (!fs.existsSync(overlay.path)) {
                missingFiles.push(overlay.path);
                console.warn(`[GIF Preset] File tidak ditemukan: ${overlay.path}`);
                continue;
            }

            createGifOverlayWindow(overlay.path, overlay.id, overlay.settings, overlay.bounds);
            if (overlay.id > maxId) maxId = overlay.id;
        }

        // Update nextOverlayId
        if (maxId >= nextOverlayId) nextOverlayId = maxId + 1;

        // Update gifOverlays di userSettings untuk sinkronisasi
        userSettings.gifOverlays = preset.overlays.filter(o => fs.existsSync(o.path));

        // Set sebagai preset aktif
        userSettings.activePresetId = presetId;
        scheduleSaveUserSettings();

        // Evaluasi visibilitas
        evaluateGifOverlayVisibility();

        // Broadcast perubahan preset ke semua window (kecuali pengirim)
        const senderWebContents = event.sender;
        BrowserWindow.getAllWindows().forEach(win => {
            if (!win.isDestroyed() && win.webContents !== senderWebContents) {
                win.webContents.send('gif-preset-changed', {
                    presetId: presetId,
                    overlays: userSettings.gifOverlays
                });
            }
        });

        console.log(`[GIF Preset] Preset berhasil diterapkan`);
        logGifSyncStatus('preset-apply-after');
        console.log(`[GIF Preset] === APPLY PRESET COMPLETE ===`);

        return {
            success: true,
            missingFiles: missingFiles.length > 0 ? missingFiles : null
        };
    } catch (e) {
        console.error('[GIF Preset] Gagal menerapkan preset:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Dapatkan preset aktif saat ini
ipcMain.handle('gif-preset-get-active', async () => {
    return userSettings.activePresetId || null;
});

// Handler: Set preset aktif (tanpa menerapkan - hanya update state)
ipcMain.on('gif-preset-set-active', (event, presetId) => {
    const previousPreset = userSettings.activePresetId;
    userSettings.activePresetId = presetId;
    scheduleSaveUserSettings();
    console.log(`[GIF Preset] Preset aktif diset: ${previousPreset || 'null'} -> ${presetId || 'null'}`);
    logGifSyncStatus('set-active-preset');
});

// Handler: Load semua settings GIF dari main process (untuk standalone UI)
ipcMain.handle('gif-settings-load', async () => {
    return {
        gifOverlayEnabled: userSettings.gifOverlayEnabled || false,
        gifOverlayLocked: userSettings.gifOverlayLocked || false,
        gifOverlays: userSettings.gifOverlays || [],
        gifOverlayPresets: userSettings.gifOverlayPresets || [],
        activePresetId: userSettings.activePresetId || null
    };
});

// Handler: Simpan semua settings GIF ke main process (dari standalone UI)
ipcMain.handle('gif-settings-save', async (event, settings) => {
    try {
        if (settings.gifOverlayLocked !== undefined) {
            userSettings.gifOverlayLocked = settings.gifOverlayLocked;
        }
        if (settings.gifOverlays !== undefined) {
            userSettings.gifOverlays = settings.gifOverlays;
        }
        if (settings.activePresetId !== undefined) {
            userSettings.activePresetId = settings.activePresetId;
        }

        // --- singkron perubahan ke preset aktif ---
        if (userSettings.activePresetId && userSettings.gifOverlayPresets) {
            const presetIndex = userSettings.gifOverlayPresets.findIndex(p => p.presetId === userSettings.activePresetId);
            if (presetIndex !== -1) {
                userSettings.gifOverlayPresets[presetIndex].overlays = userSettings.gifOverlays || [];
                userSettings.gifOverlayPresets[presetIndex].updatedAt = Date.now();
                console.log(`[GIF Settings] Preset "${userSettings.gifOverlayPresets[presetIndex].name}" updated with ${userSettings.gifOverlays.length} overlays.`);
            }
        }
        // ----------------------------------------------

        scheduleSaveUserSettings();
        console.log('[GIF Settings] Settings berhasil disimpan ke main process');
        return { success: true };
    } catch (e) {
        console.error('[GIF Settings] Gagal menyimpan settings:', e);
        return { success: false, error: e.message };
    }
});

// ======================== Akhir Sistem Preset GIF Overlay ======================== //

// Handler: Request file dari overlay window
ipcMain.on('gif-overlay-request-file', (event, overlayId) => {
    // Trigger browse dialog dan kirim hasilnya ke overlay yang meminta
    dialog.showOpenDialog({
        title: 'Pilih File GIF',
        filters: [
            { name: 'GIF Images', extensions: ['gif'] },
            { name: 'All Images', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp'] }
        ],
        properties: ['openFile']
    }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
            const win = gifOverlayWindows.get(overlayId);
            if (win && !win.isDestroyed()) {
                win.currentPath = result.filePaths[0];
                win.webContents.send('gif-overlay-set-image', result.filePaths[0]);
                updateGifOverlaysInMemory();
            }
        }
    });
});

// Handler: Image loaded - resize window sesuai dimensi GIF
ipcMain.on('gif-overlay-image-loaded', (event, { id, path, naturalWidth, naturalHeight }) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed()) return;

    win.currentPath = path;

    // Hitung ukuran baru dengan mempertahankan aspect ratio
    // Maksimal 400px untuk dimensi terbesar, minimal 100px
    const maxSize = 400;
    const minSize = 100;
    let newWidth = naturalWidth;
    let newHeight = naturalHeight;

    // Scale down jika terlalu besar
    if (newWidth > maxSize || newHeight > maxSize) {
        const scale = Math.min(maxSize / newWidth, maxSize / newHeight);
        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
    }

    // Scale up jika terlalu kecil
    if (newWidth < minSize && newHeight < minSize) {
        const scale = Math.max(minSize / newWidth, minSize / newHeight);
        newWidth = Math.round(newWidth * scale);
        newHeight = Math.round(newHeight * scale);
    }

    // Resize window
    win.setSize(newWidth, newHeight);
    updateGifOverlaysInMemory();

    console.log(`[Main][GIF] Overlay #${id} resized to ${newWidth}x${newHeight} (original: ${naturalWidth}x${naturalHeight})`);
});

// === RESIZE VIA MAIN PROCESS POLLING ===
// Karena mouse events hilang saat window mengecil dan mouse keluar,
// kita tracking posisi cursor secara global saat resize aktif

let activeResizeOverlayId = null;
let resizeStartMousePos = null;
let resizeStartBounds = null;
let resizeInterval = null;
let lastCursorPos = null;
let cursorIdleTime = 0;

// Handler: Resize start - mulai polling
ipcMain.on('gif-overlay-resize-start', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;

    // Jika sudah ada resize aktif, jangan mulai yang baru
    if (activeResizeOverlayId !== null) return;

    const bounds = win.getBounds();
    const cursorPos = screen.getCursorScreenPoint();

    activeResizeOverlayId = id;
    resizeStartMousePos = { x: cursorPos.x, y: cursorPos.y };
    resizeStartBounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };
    lastCursorPos = { x: cursorPos.x, y: cursorPos.y };
    cursorIdleTime = 0;

    // Mulai polling untuk tracking mouse global
    if (resizeInterval) clearInterval(resizeInterval);
    resizeInterval = setInterval(() => {
        if (activeResizeOverlayId === null) {
            clearInterval(resizeInterval);
            resizeInterval = null;
            return;
        }

        const targetWin = gifOverlayWindows.get(activeResizeOverlayId);
        if (!targetWin || targetWin.isDestroyed()) {
            clearInterval(resizeInterval);
            resizeInterval = null;
            activeResizeOverlayId = null;
            return;
        }

        const currentCursor = screen.getCursorScreenPoint();

        // Cek apakah cursor masih bergerak
        if (lastCursorPos && currentCursor.x === lastCursorPos.x && currentCursor.y === lastCursorPos.y) {
            cursorIdleTime += 16;
            // Jika cursor tidak bergerak selama 150ms, anggap resize selesai
            if (cursorIdleTime >= 150) {
                console.log(`[Main][GIF] Resize auto-ended (cursor idle) for overlay #${activeResizeOverlayId}`);
                clearInterval(resizeInterval);
                resizeInterval = null;
                updateGifOverlaysInMemory();
                activeResizeOverlayId = null;
                resizeStartMousePos = null;
                resizeStartBounds = null;
                return;
            }
        } else {
            cursorIdleTime = 0; // Reset idle time jika cursor bergerak
        }
        lastCursorPos = { x: currentCursor.x, y: currentCursor.y };

        const deltaX = currentCursor.x - resizeStartMousePos.x;
        const deltaY = currentCursor.y - resizeStartMousePos.y;

        const newWidth = Math.max(80, resizeStartBounds.width + deltaX);
        const newHeight = Math.max(80, resizeStartBounds.height + deltaY);

        // Gunakan setBounds() karena setSize() bermasalah dengan transparent window
        // Posisi window tetap sama (resizeStartBounds.x, resizeStartBounds.y)
        targetWin.setBounds({
            x: resizeStartBounds.x,
            y: resizeStartBounds.y,
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        });
    }, 16); // ~60fps

    console.log(`[Main][GIF] Resize started for overlay #${id}, start pos: ${cursorPos.x},${cursorPos.y}, bounds: ${bounds.width}x${bounds.height}`);
});

// Handler: Resize move - fallback jika polling tidak aktif
ipcMain.on('gif-overlay-resize-move', (event, { id, deltaX, deltaY }) => {
    // Resize sekarang di-handle oleh polling, skip ini
    if (activeResizeOverlayId !== null) return;

    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;

    const bounds = win.getBounds();
    const newWidth = Math.max(80, bounds.width + deltaX);
    const newHeight = Math.max(80, bounds.height + deltaY);

    win.setSize(newWidth, newHeight);
});

// Handler: Resize end - stop polling (jika masih aktif)
ipcMain.on('gif-overlay-resize-end', (event, id) => {
    // Hanya proses jika ini adalah resize yang aktif
    if (activeResizeOverlayId !== id) return;

    const win = gifOverlayWindows.get(id);

    // Stop polling
    if (resizeInterval) {
        clearInterval(resizeInterval);
        resizeInterval = null;
    }
    activeResizeOverlayId = null;
    resizeStartMousePos = null;
    resizeStartBounds = null;
    lastCursorPos = null;
    cursorIdleTime = 0;

    if (!win || win.isDestroyed()) return;
    updateGifOverlaysInMemory();

    console.log(`[Main][GIF] Resize ended via IPC for overlay #${id}`);
});

// Handler: Drag start
ipcMain.on('gif-overlay-drag-start', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;
    // Tidak perlu menyimpan state khusus untuk drag
});

// Handler: Drag move (delta based)
ipcMain.on('gif-overlay-drag-move', (event, { id, deltaX, deltaY }) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;

    const bounds = win.getBounds();
    win.setPosition(bounds.x + deltaX, bounds.y + deltaY);
});

// Handler: Drag end
ipcMain.on('gif-overlay-drag-end', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed()) return;

    updateGifOverlaysInMemory();
});

// Global Lock - setIgnoreMouseEvents tanpa forward, karena window sudah berukuran pas
ipcMain.on('set-gif-overlay-locked', (event, locked) => {
    isGifOverlayLocked = locked;
    userSettings.gifOverlayLocked = locked;

    gifOverlayWindows.forEach(win => {
        if (!win.isDestroyed()) {
            // Dengan pendekatan window individual, cukup ignore tanpa forward
            win.setIgnoreMouseEvents(locked);
            win.webContents.send('set-locked', locked);
        }
    });

    // Mulai atau hentikan cursor tracking berdasarkan lock state
    if (locked) {
        startCursorTracking();
    } else {
        stopCursorTracking();
        // Tampilkan kembali semua GIF yang disembunyikan oleh cursor
        gifOverlayWindows.forEach(win => {
            if (!win.isDestroyed() && win.isHiddenByCursor) {
                win.isHiddenByCursor = false;
                if (isGifOverlayEnabled) win.show();
            }
        });
    }

    console.log(`[Main][GIF] Lock mode: ${locked ? 'LOCKED' : 'UNLOCKED'}`);
});

// === CURSOR TRACKING UNTUK HIDE ON CURSOR APPROACH ===
let cursorTrackingInterval = null;
const CURSOR_PROXIMITY_THRESHOLD = 50; // Jarak piksel untuk trigger hide

function startCursorTracking() {
    if (cursorTrackingInterval) return; // Sudah berjalan

    cursorTrackingInterval = setInterval(() => {
        if (!isGifOverlayEnabled || !isGifOverlayLocked) {
            stopCursorTracking();
            return;
        }

        const cursorPos = screen.getCursorScreenPoint();

        gifOverlayWindows.forEach((win, id) => {
            if (win.isDestroyed()) return;

            const settings = win.gifSettings || {};
            if (!settings.hideOnCursor) return; // Fitur tidak diaktifkan untuk GIF ini

            const bounds = win.getBounds();
            const centerX = bounds.x + bounds.width / 2;
            const centerY = bounds.y + bounds.height / 2;

            // Hitung jarak kursor ke center window
            const distanceX = Math.abs(cursorPos.x - centerX);
            const distanceY = Math.abs(cursorPos.y - centerY);
            const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

            // Radius untuk fade: mulai fade dari jarak ini
            const fadeStartDistance = Math.max(bounds.width, bounds.height) / 2 + CURSOR_PROXIMITY_THRESHOLD * 2;
            const fadeEndDistance = Math.max(bounds.width, bounds.height) / 2 - 10; // Hampir di tengah

            // Hitung opacity berdasarkan jarak (1.0 = full visible, 0.0 = hidden)
            let targetOpacity;
            if (distance >= fadeStartDistance) {
                targetOpacity = 1.0; // Jauh dari GIF - full visible
            } else if (distance <= fadeEndDistance) {
                targetOpacity = 0.0; // Sangat dekat - fully hidden
            } else {
                // Gradual fade berdasarkan jarak
                targetOpacity = (distance - fadeEndDistance) / (fadeStartDistance - fadeEndDistance);
            }

            // Apply base opacity dari settings
            const baseOpacity = settings.opacity || 1.0;
            const finalOpacity = targetOpacity * baseOpacity;

            // Kirim ke renderer untuk smooth transition
            win.webContents.send('cursor-proximity-opacity', {
                opacity: finalOpacity,
                isNear: distance < fadeStartDistance
            });
        });
    }, 30); // Check setiap 30ms untuk smoothness yang lebih baik

    console.log('[Main][GIF] Cursor tracking started');
}

function stopCursorTracking() {
    if (cursorTrackingInterval) {
        clearInterval(cursorTrackingInterval);
        cursorTrackingInterval = null;
        console.log('[Main][GIF] Cursor tracking stopped');
    }
}

// ======================================= Akhir Logika GIF Overlay =================================== //

// ======================== Logika Version Overlay (BrowserView) =======================//
const VERSION_TEXT = 'versi 0.0.0.8 | Versi Eksperimental, tidak mengindikasikan hasil akhir aplikasi...';
const VERSION_OVERLAY_WIDTH = 548;
const VERSION_OVERLAY_HEIGHT = 30;
const VERSION_OVERLAY_MARGIN = 0;

function createVersionOverlay() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Hapus overlay lama jika ada
    if (versionOverlay) {
        try {
            mainWindow.removeBrowserView(versionOverlay);
            versionOverlay.webContents.destroy();
        } catch (e) {
            console.log('[VersionOverlay] Error removing old overlay:', e.message);
        }
        versionOverlay = null;
    }

    versionOverlay = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.addBrowserView(versionOverlay);
    updateVersionOverlayBounds();

    // Load HTML inline untuk version label dengan data URI
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { 
                    background: transparent; 
                    overflow: hidden;
                    height: 100%;
                }
                .version-label {
                    background-color: rgba(0, 0, 0, 0.5);
                    color: #fff;
                    font-family: 'Lexend', sans-serif;
                    font-size: 14px;
                    padding: 5px 10px;
                    border-radius: 5px;
                    white-space: nowrap;
                    display: inline-block;
                }
            </style>
        </head>
        <body>
            <div class="version-label">${VERSION_TEXT}</div>
        </body>
        </html>
    `;

    versionOverlay.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    // Update posisi saat window di-resize
    mainWindow.on('resize', updateVersionOverlayBounds);
    mainWindow.on('enter-full-screen', () => setTimeout(updateVersionOverlayBounds, 100));
    mainWindow.on('leave-full-screen', () => setTimeout(updateVersionOverlayBounds, 100));

    console.log('[VersionOverlay] BrowserView overlay untuk version label berhasil dibuat.');
}

function updateVersionOverlayBounds() {
    if (!mainWindow || mainWindow.isDestroyed() || !versionOverlay) return;

    const [winWidth, winHeight] = mainWindow.getContentSize();

    versionOverlay.setBounds({
        x: winWidth - VERSION_OVERLAY_WIDTH - VERSION_OVERLAY_MARGIN,
        y: winHeight - VERSION_OVERLAY_HEIGHT - VERSION_OVERLAY_MARGIN,
        width: VERSION_OVERLAY_WIDTH,
        height: VERSION_OVERLAY_HEIGHT
    });
}

function destroyVersionOverlay() {
    if (!versionOverlay) return;

    try {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.removeBrowserView(versionOverlay);
        }
        versionOverlay.webContents.destroy();
    } catch (e) {
        console.log('[VersionOverlay] Error destroying overlay:', e.message);
    }
    versionOverlay = null;
}
// ======================== Akhir Logika Version Overlay =======================//

// ======================== Logika Mini Player =======================//
function startMiniPlayerCursorTracking() {
    if (miniPlayerCursorInterval) clearInterval(miniPlayerCursorInterval);
    miniPlayerCursorInterval = setInterval(() => {
        if (!miniPlayerWindow || miniPlayerWindow.isDestroyed()) {
            stopMiniPlayerCursorTracking();
            return;
        }
        if (!miniPlayerWindow.isVisible()) return;

        // TRACKING LOGIC: Menggunakan polling koordinat global
        // Ini lebih robust dibanding event forwarding untuk window yang click-through (ignoreMouseEvents)

        // Hanya track jika fitur hide-on-cursor aktif
        if (!userSettings.miniPlayerHideOnCursor) return;

        try {
            const cursor = screen.getCursorScreenPoint();
            const bounds = miniPlayerWindow.getBounds();
            const padding = 30; // Jarak toleransi (buffer) agar user punya waktu sebelum hilang

            const isNear = (
                cursor.x >= bounds.x - padding &&
                cursor.x <= bounds.x + bounds.width + padding &&
                cursor.y >= bounds.y - padding &&
                cursor.y <= bounds.y + bounds.height + padding
            );

            miniPlayerWindow.webContents.send('mini-player-cursor-status', isNear);
        } catch (e) {
            console.error('[Main] Error in mini player cursor tracking:', e);
        }
    }, 50); // Use 50ms for responsiveness without over-polling
}

function stopMiniPlayerCursorTracking() {
    if (miniPlayerCursorInterval) {
        clearInterval(miniPlayerCursorInterval);
        miniPlayerCursorInterval = null;
    }
}

function createMiniPlayerWindow() {
    if (miniPlayerWindow) {
        return;
    }
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const miniPlayerWidth = 340;
    const miniPlayerHeight = 125;
    const margin = 15;

    miniPlayerWindow = new BrowserWindow({
        width: miniPlayerWidth,
        height: miniPlayerHeight,
        x: workArea.width - miniPlayerWidth - margin,
        y: workArea.height - miniPlayerHeight - margin,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    miniPlayerWindow.setAlwaysOnTop(true, 'screen-saver');

    miniPlayerWindow.loadFile(path.join(__dirname, 'mini-player.html'));
    miniPlayerWindow.on('closed', () => {
        miniPlayerWindow = null;
        stopMiniPlayerCursorTracking();
    });

    // Mulai tracking setelah window siap
    miniPlayerWindow.once('ready-to-show', () => {
        startMiniPlayerCursorTracking();
    });

    const shape = [{
        x: 0,
        y: 0,
        width: miniPlayerWidth,
        height: miniPlayerHeight
    }];

    miniPlayerWindow.webContents.on('did-finish-load', () => {
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            // Hapus setShape agar area forwarding tidak terbatas
            // miniPlayerWindow.setShape(shape);

            // Aktifkan click-through standar (tanpa forward)
            // Tracking dilakukan oleh main process via startMiniPlayerCursorTracking
            miniPlayerWindow.setIgnoreMouseEvents(true);
        }
    });

    console.log('[Main] Jendela Mini Player dibuat dengan setShape DAN ignoreMouseEvents.');
}

// Logika Mini Player (Sync ke Overlay)
ipcMain.on('set-mini-player-feature-enabled', (event, enabled) => {
    isMiniPlayerFeatureEnabled = enabled;
    userSettings.miniPlayerFeatureEnabled = enabled;
    console.log(`[Main] Fitur Mini Player ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`);

    if (enabled) {
        if (!miniPlayerWindow) {
            createMiniPlayerWindow();
        }
        setTimeout(() => {
            if (miniPlayerWindow) {
                miniPlayerWindow.show();
            }
        }, 200);
    } else {
        if (miniPlayerWindow) {
            miniPlayerWindow.hide();
        }
    }

    // Update Main Window
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mini-player-feature-status-changed', isMiniPlayerFeatureEnabled);
    }

    // Update Overlay Window secara Real-time
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('mini-player-feature-status-changed', isMiniPlayerFeatureEnabled);
    }

    scheduleSaveUserSettings();
    // Update Overlay Window secara Real-time
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('mini-player-feature-status-changed', isMiniPlayerFeatureEnabled);
    }

    scheduleSaveUserSettings();
});

// ======================== Logika Preview Window ======================= //
let previewWindow = null;

function createPreviewWindow() {
    if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.show();
        previewWindow.focus();
        return;
    }

    previewWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: "Preview - Special Event",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Memudahkan komunikasi IPC langsung
            webSecurity: false // Mengizinkan akses file lokal
        }
    });

    // Load template player standar
    previewWindow.loadFile(path.join(__dirname, 'vn_player_template.html'));

    previewWindow.on('closed', () => {
        previewWindow = null;
    });
}

// Handler IPC untuk membuka/memicu preview
ipcMain.on('vn-engine:preview-special-event', (event, payload) => {
    console.log('[Main] Membuka Preview Special Event (Full Context):', payload);

    // Perkaya payload path aset jika relatif (optional, tapi disarankan)
    // Payload dari editor mungkin path relatif seperti 'background.jpg'.
    // Player butuh path yang resolve dengan benar.
    // Namun karena struktur folder player sama, biasanya path relatif 'visual_novels/...' aman.

    if (!previewWindow || previewWindow.isDestroyed()) {
        createPreviewWindow();

        previewWindow.webContents.once('did-finish-load', () => {
            // Kirim Full Update Display
            // Karena payload sekarang berisi semua data entri (bg, sprite, text, dll) + specialEvent
            // Kita cukup kirim ini sebagai update-display.
            // Player akan merender aset DAN memicu special event karena ada properti 'specialEvent'.

            // Sedikit delay biar window tampil smooth
            setTimeout(() => {
                // Tandai payload ini adalah preview mode
                previewWindow.webContents.send('vn-engine:update-display', { ...payload, isPreview: true });
            }, 500);
        });
    } else {
        previewWindow.show();
        // Langsung kirim update dengan flag preview
        previewWindow.webContents.send('vn-engine:update-display', { ...payload, isPreview: true });
    }
});

// Handler untuk menutup preview window dari tombol back
ipcMain.on('vn-engine:close-preview-window', () => {
    console.log('[Main] Menerima perintah tutup preview window.');

    // Jika sedang dalam mode preview label, restore state engine
    if (isLabelPreviewMode) {
        console.log('[Main] Menutup preview label, me-restore state engine...');
        restoreLabelPreviewState();
    }

    if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.close();
    }
});

// ---------------------------- Handler Preview Label ----------------------------  //
// Flag untuk menandai apakah sedang dalam mode preview label
let isLabelPreviewMode = false;
let labelPreviewScriptBackup = null; // Backup skrip asli saat preview
let labelPreviewStateBackup = null; // Backup state engine asli
let labelPreviewIndexBackup = 0; // Backup index asli
let labelPreviewHistoryBackup = []; // Backup history asli
let labelPreviewLabelName = ''; // Nama label yang sedang di-preview

// Handler IPC untuk preview label secara keseluruhan
// Menggunakan engine VN yang sudah ada untuk kompatibilitas penuh
ipcMain.on('vn-engine:preview-label', (event, payload) => {
    console.log('[Main] Membuka Preview Label menggunakan Engine VN:', payload.labelName);

    // Simpan nama label untuk ditampilkan di akhir
    labelPreviewLabelName = payload.labelName;

    // Bangun skrip sementara dari entri label
    // Format: [label header, ...entries]
    const tempScript = [];

    // Tambahkan label header dengan konteks (background, bgm, dll)
    const labelHeader = {
        type: 'label',
        name: payload.labelName,
        ...payload.context // background, bgm, transition, dll
    };
    tempScript.push(labelHeader);

    // Tambahkan semua entri dari label
    if (payload.entries && payload.entries.length > 0) {
        tempScript.push(...payload.entries);
    }

    console.log('[Main] Preview Label: Skrip sementara dibuat dengan', tempScript.length, 'baris');

    // Backup state engine saat ini (jika ada game yang sedang berjalan)
    labelPreviewScriptBackup = currentVNScript;
    labelPreviewStateBackup = { ...currentVNState };
    labelPreviewIndexBackup = currentVNIndex;
    labelPreviewHistoryBackup = [...vnDialogueHistory];

    // Set mode preview label
    isLabelPreviewMode = true;

    // Muat skrip sementara ke engine
    currentVNScript = tempScript;
    currentVNIndex = 0;
    currentVNState = {
        backgroundStack: [{ type: null, src: null }],
        bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
        lastSpeaker: null,
        isLabelPreviewMode: true // Tandai di state juga
    };
    vnDialogueHistory = [];

    // Buka atau fokus preview window
    if (!previewWindow || previewWindow.isDestroyed()) {
        createPreviewWindow();
        // Preview window akan mengirim 'vn-engine:ready' saat siap
        // yang akan memicu processAndSendVNUpdate()
    } else {
        previewWindow.show();
        previewWindow.focus();
        // Langsung mulai preview karena window sudah siap
        processPreviewLabelUpdate();
    }
});

// Fungsi khusus untuk memproses update di mode preview label
// Mirip processAndSendVNUpdate tapi mengirim ke previewWindow
function processPreviewLabelUpdate() {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    if (!isLabelPreviewMode) return;

    // Cek apakah sudah mencapai akhir skrip preview
    if (currentVNIndex >= currentVNScript.length) {
        console.log('[Main] Preview Label: Semua entri telah selesai diputar.');
        previewWindow.webContents.send('vn-engine:preview-label-finished', {
            labelName: labelPreviewLabelName
        });
        return;
    }

    const currentLine = currentVNScript[currentVNIndex];

    // Proses label header (entri pertama)
    if (currentLine.type === 'label') {
        // Update state dengan aset dari label
        if (currentLine.background || currentLine.video) {
            let newBackgroundState = {};
            if (currentLine.background) {
                newBackgroundState = { type: 'image', src: currentLine.background };
                newBackgroundState.mode = currentLine.backgroundMode || 'cover';
            } else if (currentLine.video) {
                newBackgroundState = { type: 'video', src: currentLine.video };
            }
            currentVNState.backgroundStack = [newBackgroundState];
        }

        if (currentLine.bgm) {
            currentVNState.lastBgmState = {
                src: currentLine.bgm,
                volume: currentLine.bgmVolume,
                pan: currentLine.bgmPan,
                delay: currentLine.bgmDelay,
                loop: currentLine.bgmLoop,
                fade: currentLine.bgmFade
            };
        }

        // Lanjut ke entri berikutnya
        currentVNIndex++;
        processPreviewLabelUpdate();
        return;
    }

    // ===== Penanganan entri Jump =====
    // Jump dengan target khusus menandakan akhir dari preview
    if (currentLine.type === 'jump') {
        const target = currentLine.target;
        console.log('[Preview Label] Menemukan entri jump dengan target:', target);

        // Cek target-target khusus yang menandakan akhir preview
        if (target === '##FINISH_PARENT##' ||
            target === '##SKIP_ALL_LABEL##' ||
            target.startsWith('fase:') ||
            target.startsWith('phase:')) {
            // Target ini menunjukkan keluar dari label, akhiri preview
            console.log('[Preview Label] Jump target keluar dari label, mengakhiri preview.');
            previewWindow.webContents.send('vn-engine:preview-label-finished', {
                labelName: labelPreviewLabelName,
                finishedBy: 'jump',
                jumpTarget: target
            });
            return;
        }

        // Cek apakah target adalah label/sub-label yang ada di dalam skrip preview
        const targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === target);
        if (targetIndex !== -1) {
            // Target ada di dalam skrip preview, lompat ke sana
            console.log('[Preview Label] Jump ke label dalam preview:', target);
            currentVNIndex = targetIndex;
            processPreviewLabelUpdate();
            return;
        }

        // Target tidak ditemukan di skrip preview, akhiri preview
        console.log('[Preview Label] Jump target tidak ada di skrip preview, mengakhiri preview.');
        previewWindow.webContents.send('vn-engine:preview-label-finished', {
            labelName: labelPreviewLabelName,
            finishedBy: 'jump-external',
            jumpTarget: target
        });
        return;
    }

    // ===== Penanganan entri Phase =====
    // Phase di dalam preview juga menandakan perpindahan ke bagian lain
    if (currentLine.type === 'phase') {
        console.log('[Preview Label] Menemukan entri phase, mengakhiri preview.');
        previewWindow.webContents.send('vn-engine:preview-label-finished', {
            labelName: labelPreviewLabelName,
            finishedBy: 'phase',
            phaseName: currentLine.name
        });
        return;
    }

    // Untuk tipe lain (dialogue, choice, scene), bangun payload seperti engine asli
    const payload = { ...currentLine };

    // Tambahkan BGM dari state jika tidak ada di entri
    if (!payload.bgm && currentVNState.lastBgmState) {
        payload.bgm = currentVNState.lastBgmState.src;
        if (payload.bgmVolume === undefined) payload.bgmVolume = currentVNState.lastBgmState.volume;
        if (payload.bgmPan === undefined) payload.bgmPan = currentVNState.lastBgmState.pan;
        if (payload.bgmDelay === undefined) payload.bgmDelay = currentVNState.lastBgmState.delay;
        if (payload.bgmLoop === undefined) payload.bgmLoop = currentVNState.lastBgmState.loop;
        if (payload.bgmFade === undefined) payload.bgmFade = currentVNState.lastBgmState.fade;
    }

    // Tambahkan background dari state jika tidak ada di entri
    const currentBackgroundDefault = currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1];
    if (currentBackgroundDefault) {
        if (currentBackgroundDefault.type === 'image' && !payload.background) {
            payload.background = currentBackgroundDefault.src;
            payload.backgroundMode = currentBackgroundDefault.mode;
        } else if (currentBackgroundDefault.type === 'video' && !payload.video) {
            payload.video = currentBackgroundDefault.src;
        }
    }

    // Handle speaker
    if (currentLine.speaker) {
        currentVNState.lastSpeaker = currentLine.speaker;
    } else {
        payload.speaker = currentVNState.lastSpeaker;
    }

    // Update background state untuk entri berikutnya
    const shouldPersist = currentLine.type === 'dialogue' ||
        (currentLine.type === 'scene' && currentLine.persistBackground !== false);
    if (shouldPersist) {
        let newState = {};
        if (currentLine.background) {
            newState = {
                type: 'image',
                src: currentLine.background,
                mode: currentLine.backgroundMode || 'cover'
            };
        } else if (currentLine.video) {
            newState = { type: 'video', src: currentLine.video };
        }
        if (newState.type) {
            currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1] = newState;
        }
    }

    // Tandai sebagai preview mode
    payload.isPreview = true;
    payload.isLabelPreview = true;
    payload.labelPreviewInfo = {
        labelName: labelPreviewLabelName,
        currentIndex: currentVNIndex,
        totalEntries: currentVNScript.length
    };

    console.log(`[Preview Label] Mengirim entri [${currentVNIndex}/${currentVNScript.length}]:`, payload.type);

    // Kirim ke preview window
    previewWindow.webContents.send('vn-engine:update-display', payload);

    // Simpan ke history jika ada teks
    if ((currentLine.type === 'dialogue' || currentLine.type === 'choice') && payload.text) {
        vnDialogueHistory.push({ speaker: payload.speaker || "Narasi", text: payload.text });
    }
}

// Handler untuk request entri berikutnya dari preview label
ipcMain.on('vn-engine:preview-label-next', () => {
    if (!isLabelPreviewMode) return;
    console.log('[Main] Preview Label: Request entri berikutnya.');

    // Cek jika ada pending jump dari autoDialogue choice
    if (currentVNState.pendingJump) {
        const target = currentVNState.pendingJump;
        delete currentVNState.pendingJump;
        // Di mode preview, jump sederhana: cari target di skrip preview
        const targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === target);
        if (targetIndex !== -1) {
            currentVNIndex = targetIndex;
        } else {
            console.log('[Preview Label] pendingJump target tidak ada di skrip preview, lanjut ke entri berikutnya');
            currentVNIndex++;
        }
    } else {
        currentVNIndex++;
    }

    processPreviewLabelUpdate();
});

// Handler untuk choice di mode preview label
ipcMain.on('vn-engine:preview-label-choice-made', (event, choice) => {
    if (!isLabelPreviewMode) return;
    console.log('[Main] Preview Label: Choice made:', choice);

    const originalChoiceLine = currentVNScript[currentVNIndex];
    if (!originalChoiceLine) {
        console.error('[Main] Preview Label: originalChoiceLine tidak ditemukan!');
        currentVNIndex++;
        processPreviewLabelUpdate();
        return;
    }

    // Handle autoDialogue jika ada
    if (originalChoiceLine.autoDialogue && choice.text) {
        const autoDialoguePayload = {
            type: 'dialogue',
            text: choice.text,
            bgm: currentVNState.lastBgmState?.src,
            bgmVolume: currentVNState.lastBgmState?.volume,
            background: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.src,
            backgroundMode: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.mode,
            sprite: originalChoiceLine.sprite,
            sprite2: originalChoiceLine.sprite2,
            spriteCenter: originalChoiceLine.spriteCenter,
            charSprites: originalChoiceLine.charSprites,
            isPreview: true,
            isLabelPreview: true
        };

        if (originalChoiceLine.autoDialogue === 'character' && currentVNState.lastSpeaker) {
            autoDialoguePayload.speaker = currentVNState.lastSpeaker;
        }

        if (autoDialoguePayload.speaker) {
            vnDialogueHistory.push({ speaker: autoDialoguePayload.speaker, text: autoDialoguePayload.text });
        }

        previewWindow.webContents.send('vn-engine:update-display', autoDialoguePayload);

        // Simpan jump target untuk diproses setelah auto dialogue
        currentVNState.pendingJump = choice.jump;
        return;
    }

    // Handle jump dari choice
    if (choice.jump) {
        // Di mode preview, jump ke label lain tidak didukung sepenuhnya
        // Cari target di dalam skrip preview saja
        const targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === choice.jump);
        if (targetIndex !== -1) {
            currentVNIndex = targetIndex;
        } else {
            console.log('[Preview Label] Jump target tidak ada di skrip preview, lanjut ke entri berikutnya');
            currentVNIndex++;
        }
    } else {
        currentVNIndex++;
    }

    processPreviewLabelUpdate();
});

// Handler untuk reset preview label (ulang dari awal)
ipcMain.on('vn-engine:preview-label-reset', () => {
    if (!isLabelPreviewMode) return;
    console.log('[Main] Preview Label: Reset ke awal.');

    // Reset index dan state
    currentVNIndex = 0;
    currentVNState = {
        backgroundStack: [{ type: null, src: null }],
        bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
        lastSpeaker: null,
        isLabelPreviewMode: true
    };
    vnDialogueHistory = [];

    processPreviewLabelUpdate();
});

// Handler untuk menutup preview dan restore state
ipcMain.on('vn-engine:preview-label-close', () => {
    console.log('[Main] Preview Label: Menutup dan restore state.');
    restoreLabelPreviewState();
});

// Fungsi untuk restore state engine setelah preview selesai
function restoreLabelPreviewState() {
    if (!isLabelPreviewMode) return;

    console.log('[Main] Restoring engine state setelah preview label.');

    // Restore state engine asli
    if (labelPreviewScriptBackup) {
        currentVNScript = labelPreviewScriptBackup;
    }
    if (labelPreviewStateBackup) {
        currentVNState = labelPreviewStateBackup;
    }
    currentVNIndex = labelPreviewIndexBackup;
    vnDialogueHistory = labelPreviewHistoryBackup;

    // Reset flag dan backup
    isLabelPreviewMode = false;
    labelPreviewScriptBackup = null;
    labelPreviewStateBackup = null;
    labelPreviewIndexBackup = 0;
    labelPreviewHistoryBackup = [];
    labelPreviewLabelName = '';
}
// ----------------------------  Akhir Handler Preview Label ---------------------------- //

// ======================================= Akhir Logika Preview =================================== //

// menerima update data mini player dari renderer
ipcMain.on('update-mini-player-data', (event, data) => {
    if (data && typeof data.title === 'string' && data.title !== lastLoggedTitleForUpdateMiniPlayerData) {
        console.log('[Main] Menerima "update-mini-player-data" dari index.html (judul berubah):', data.title);
        lastLoggedTitleForUpdateMiniPlayerData = data.title;
    }
    if (isMiniPlayerFeatureEnabled && miniPlayerWindow && miniPlayerWindow.isVisible()) {
        miniPlayerWindow.webContents.send('mini-player-data-update', data);
    }
});
// ======================== Akhir Logika Mini Player ==================//

// =============================================== Logika Overlay =======================================//
let latestPlayerState = {}; // menyimpan state terakhir

function createOverlayWindow() {
    if (overlayWindow) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    overlayWindow = new BrowserWindow({
        width, height, x: 0, y: 0,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
    overlayWindow.on('closed', () => { overlayWindow = null; });
    console.log('[Main] Jendela Overlay dibuat.');
}

function showGlobalNotification(options) {
    const defaultOptions = {
        title: 'Notification',
        message: '',
        type: 'default'
    };
    const finalOptions = { ...defaultOptions, ...options };

    const showAndSendData = () => {
        if (notificationWindow && !notificationWindow.isDestroyed()) {
            notificationWindow.show();
            notificationWindow.webContents.send('set-notification-data', finalOptions);
        }
    };

    if (notificationWindow && !notificationWindow.isDestroyed()) {
        showAndSendData();
    } else {
        const notificationWidth = 260;

        notificationWindow = new BrowserWindow({
            width: notificationWidth,
            height: 110,
            frame: false, transparent: true, alwaysOnTop: true,
            skipTaskbar: true, focusable: false,
            x: screen.getPrimaryDisplay().workAreaSize.width - 230 - 20,
            y: 40,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });
        notificationWindow.setAlwaysOnTop(true, 'pop-up-menu');
        notificationWindow.loadFile(path.join(__dirname, 'global-notification.html'));

        notificationWindow.webContents.once('did-finish-load', () => {
            showAndSendData();
        });

        notificationWindow.on('closed', () => {
            notificationWindow = null;
            if (notificationTimer) clearTimeout(notificationTimer);
        });
    }
}

// menerima permintaan notifikasi dari renderer
ipcMain.on('request-global-notification', (event, options) => {
    showGlobalNotification(options);
});

// untuk tahu kapan notifikasi selesai dan bisa disembunyikan
ipcMain.on('notification-finished', () => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.hide();
    }
});

ipcMain.on('set-overlay-feature', (event, enabled) => {
    const justEnabled = enabled && !isOverlayEnabled;
    isOverlayEnabled = enabled;
    userSettings.overlayEnabled = enabled;
    console.log(`Fitur Overlay diatur ke: ${enabled}`);

    scheduleSaveUserSettings();

    if (enabled) {
        if (!overlayWindow) createOverlayWindow();

        if (!globalShortcut.isRegistered('Alt+S')) {
            globalShortcut.register('Alt+S', () => {
                if (overlayWindow) {
                    if (!overlayWindow.isVisible()) overlayWindow.show();
                    overlayWindow.webContents.send('toggle-overlay-panel');
                }
            });
        }
        if (justEnabled) {
            showGlobalNotification({
                title: 'GAP Overlay ready!',
                message: 'press Alt + S',
                type: 'default'
            });
        }
    } else {
        globalShortcut.unregister('Alt+S');
        if (overlayWindow) overlayWindow.close();
        if (notificationWindow && !notificationWindow.isDestroyed()) notificationWindow.close();
    }
});

ipcMain.on('overlay-toggle-snow', (event, { isEnabled }) => {
    isSnowFeatureEnabled = isEnabled;
    userSettings.snowFeatureEnabled = isEnabled;
    console.log(`[Main] Fitur Salju di-toggle dari overlay menjadi: ${isEnabled}`);

    if (isEnabled) {
        if (!snowWindow) createSnowWindow();
        if (snowWindow) snowWindow.show();
    } else {
        if (snowWindow) snowWindow.hide();
    }
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('snow-feature-status-changed', isEnabled);
        }
    });

    scheduleSaveUserSettings();
});

// menerima perintah toggle mini player dari overlay
ipcMain.on('overlay-toggle-mini-player', (event, { isEnabled }) => {
    isMiniPlayerFeatureEnabled = isEnabled;
    userSettings.miniPlayerFeatureEnabled = isEnabled;
    console.log(`[Main] Fitur Mini Player di-toggle dari overlay menjadi: ${isEnabled}`);

    if (isEnabled) {
        if (!miniPlayerWindow) createMiniPlayerWindow();
        setTimeout(() => { if (miniPlayerWindow) miniPlayerWindow.show(); }, 200);
    } else {
        if (miniPlayerWindow) miniPlayerWindow.hide();
    }
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('mini-player-feature-status-changed', isEnabled);
        }
    });

    scheduleSaveUserSettings();
});

// 1. Terima update state dari pemutar utama atau index.html
ipcMain.on('update-shared-player-state', (event, state) => {
    latestPlayerState = state;

    // Update lastMusicState untuk kondisional GIF Overlay
    if (state) {
        lastMusicState.isPlaying = state.isPlaying === true;
        lastMusicState.title = state.title || '';
        lastMusicState.artist = state.artist || '';

        // Evaluasi ulang visibilitas GIF overlay
        evaluateGifOverlayVisibility();
    }

    // Siarkan ke jendela overlay jika ada dan terlihat
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
        overlayWindow.webContents.send('shared-player-state-updated', latestPlayerState);
    }
});

// 2. Terima permintaan kontrol dari overlay dan index.html
ipcMain.on('player-control-action', (event, action) => {
    if (mainWindow) {
        mainWindow.webContents.send('forwarded-player-control-action', action);
    }
});

// 3. Saat overlay.html memberitahu ia siap, kirimkan state terakhir yang kita punya
ipcMain.on('overlay-is-ready', () => {
    if (overlayWindow && latestPlayerState) {
        overlayWindow.webContents.send('shared-player-state-updated', latestPlayerState);
        // fitur remote
        overlayWindow.webContents.send('initial-settings-sync', {
            snow: isSnowFeatureEnabled,
            miniPlayer: isMiniPlayerFeatureEnabled
        });
    }
});

ipcMain.on('make-overlay-interactive', () => {
    if (overlayWindow) overlayWindow.setIgnoreMouseEvents(false);
});
ipcMain.on('make-overlay-pass-through', () => {
    if (overlayWindow) overlayWindow.setIgnoreMouseEvents(true);
});

// Handler update-shared-player-state yang lengkap sudah ada di atas, ini hanya fallback untuk forward ke overlay
// (Sudah digabung dengan handler utama di atas)

ipcMain.on('visualizer-data-stream', (event, data) => {
    // Langsung teruskan ke jendela overlay jika ada dan terlihat
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
        overlayWindow.webContents.send('visualizer-data-stream', data);
    }
});

ipcMain.on('request-overlay-focus', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        console.log('[Main] Memberikan fokus ke jendela overlay.');
        overlayWindow.focus();
    }
});
ipcMain.on('request-player-state-refresh', (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('[Main] Meneruskan permintaan refresh state dari overlay ke jendela utama.');
        // Kirim pesan yang sudah dikenali oleh index.html
        mainWindow.webContents.send('request-player-state-for-overlay');
    }
});
// ================================================ Akhir Logika Overlay ===================================//
// ======================== Logika Ad Skipper =======================//
function createAdSkipperWindow() {
    if (adSkipperWindow) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;
    const skipperWidth = 440;
    const skipperHeight = 80;
    const margin = 5;

    // Posisi di atas mini-player
    const miniPlayerHeight = 115;
    const miniPlayerMargin = 15;

    adSkipperWindow = new BrowserWindow({
        width: skipperWidth,
        height: skipperHeight,
        x: workArea.width - skipperWidth - margin,
        y: workArea.height - skipperHeight - miniPlayerHeight - margin - miniPlayerMargin, // Di atas mini-player
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    adSkipperWindow.setAlwaysOnTop(true, 'screen-saver');
    adSkipperWindow.loadFile(path.join(__dirname, 'ad-skkiper.html'));
    adSkipperWindow.setIgnoreMouseEvents(true); // Biar tembus klik awalnya

    adSkipperWindow.on('closed', () => { adSkipperWindow = null; });
    console.log('[Main] Jendela Ad Skipper dibuat.');
}

// Terima status iklan dari webview (via index.html)
ipcMain.on('ad-status-update', (event, { state, targetBounds, webviewBounds, details }) => {

    // Update lastAdState untuk kondisional GIF overlay
    const previousAdState = lastAdState;
    lastAdState = state;

    // Evaluasi ulang visibility GIF overlay jika ad state berubah
    if (previousAdState !== state) {
        evaluateGifOverlayVisibility();
    }

    // Hanya proses jika fitur diaktifkan di settings
    if (!userSettings.adSkipperEnabled) {
        if (adSkipperWindow && !adSkipperWindow.isDestroyed()) adSkipperWindow.close();
        lastKnownSkipCoords = null;
        lastAdCount = null;
        return;
    }

    // ===== Deteksi Multiple Ads =====
    // Cek apakah adCount mengandung format angka seperti "1 / 2" atau "2 / 2"
    const hasMultipleAds = details && details.adCount && /\d+\s*\/\s*\d+/.test(details.adCount);

    // Cek apakah ada perubahan ad queue (misal dari "1/2" ke "2/2")
    const adCountChanged = lastAdCount !== (details?.adCount || null);

    if (state === 'none') {
        // Jika ada multiple ads DAN masih ada iklan berikutnya (ad count berubah)
        // Maka jangan tutup window, tunggu sampai iklan berikutnya muncul
        if (hasMultipleAds && adCountChanged) {
            console.log(`[AdSkipper] Multiple ads detected. Ad Count: ${details.adCount}. Keeping window open...`);
            // Update last ad count untuk persiapan iklan berikutnya
            lastAdCount = details.adCount;
            // Window tetap terbuka, tapi jangan kirim state 'none' - cukup tunggu
            lastKnownSkipCoords = null;
            return;
        }

        // Jika single ad atau multiple ads selesai, baru hide window
        if (adSkipperWindow && !adSkipperWindow.isDestroyed()) {
            adSkipperWindow.hide();
        }
        lastKnownSkipCoords = null;
        lastAdCount = null;
    } else {
        // Update last ad count ketika ada iklan baru
        if (adCountChanged) {
            lastAdCount = details?.adCount || null;
            console.log(`[AdSkipper] Ad state changed. Current: ${state}, AdCount: ${lastAdCount}`);
        }

        // Simpan koordinat (kode tetap sama)
        if (state === 'skippable' && targetBounds && webviewBounds) {
            lastKnownSkipCoords = { targetBounds, webviewBounds };
        } else {
            lastKnownSkipCoords = null;
        }

        const showAndSendState = () => {
            if (!adSkipperWindow || adSkipperWindow.isDestroyed()) return;

            if (!adSkipperWindow.isVisible()) {
                adSkipperWindow.show();
            }

            adSkipperWindow.webContents.send('set-state', {
                state,
                details,
                isAutoMute: userSettings.autoMuteAds
            });

            if (state === 'skippable') {
                adSkipperWindow.setIgnoreMouseEvents(false);
            } else {
                adSkipperWindow.setIgnoreMouseEvents(true);
            }
        };

        if (!adSkipperWindow) {
            createAdSkipperWindow();
            adSkipperWindow.webContents.once('did-finish-load', () => {
                showAndSendState();
            });
        } else {
            showAndSendState();
        }
    }
});

// Terima perintah klik dari ad-skipper.html dan LANGSUNG LAKUKAN KLIK
ipcMain.on('ad-skipper-click-skip', (event) => {
    console.log('[Main] Perintah skip diterima. Menghitung koordinat internal...');

    // Beri tahu ad-skipper.html bahwa klik telah dikirim (untuk UX)
    if (adSkipperWindow && !adSkipperWindow.isDestroyed()) {
        adSkipperWindow.webContents.send('click-sent');
    }

    // Gunakan koordinat yang sudah disimpan
    if (!mainWindow || !lastKnownSkipCoords || !lastKnownSkipCoords.targetBounds) {
        console.error('[Main] Gagal klik: Koordinat (targetBounds) tidak tersedia.');

        // Reset tombol di ad-skipper.html jika gagal
        if (adSkipperWindow && !adSkipperWindow.isDestroyed()) {
            adSkipperWindow.webContents.send('set-state', 'skippable');
        }
        return;
    }

    // HANYA ambil 'targetBounds'. Ini adalah koordinat DI DALAM webview.
    const { targetBounds } = lastKnownSkipCoords;

    try {
        // Hitung titik TENGAH tombol skip, RELATIF terhadap webview
        // Ini adalah satu-satunya koordinat yang kita perlukan
        const clickX = Math.round(targetBounds.x + (targetBounds.width / 2));
        const clickY = Math.round(targetBounds.y + (targetBounds.height / 2));

        console.log(`[Main] Mengirim koordinat klik internal ke renderer: [${clickX}, ${clickY}]`);

        // Kirim perintah dan KOORDINAT ke index.html (mainWindow)
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Gunakan nama IPC yang sudah kita buat sebelumnya
            mainWindow.webContents.send('execute-internal-webview-click', { x: clickX, y: clickY });
        }

    } catch (err) {
        console.error('[Main] Gagal memproses koordinat klik internal:', err);
    }
});
// ======================== Akhir Logika Ad Skipper =======================//

// ======================== Loading Tumbail =======================//
ipcMain.on('special-element-found', async () => {
    console.log('[Main] Menerima sinyal special-element-found. Memulai auto-scroll...');
    if (mainWindow) {
        try {
            const bounds = await mainWindow.webContents.executeJavaScript('window.playerAPI.getPlaylistContainerBounds();');

            // Tampilkan overlay SEBELUM scroll dimulai
            console.log('[Main] Menampilkan overlay loading queue...');
            await mainWindow.webContents.executeJavaScript('window.playerAPI.showQueueLoading();');

            await autoScroll(50); // Proses scroll Anda yang sudah ada

            console.log('[Main] Auto-scroll selesai.');

            // Sembunyikan overlay SETELAH scroll selesai
            console.log('[Main] Menyembunyikan overlay loading queue...');
            await mainWindow.webContents.executeJavaScript('window.playerAPI.hideQueueLoading();');

            // Minta preload script untuk scan playlist SETELAH semuanya di-scroll
            mainWindow.webContents.executeJavaScript('window.playerAPI.scanPlaylist();');
            console.log('[Main] Meminta scan playlist setelah scroll.');

        } catch (error) {
            console.error('[Main] Error selama auto-scroll atau scan:', error);
            // Pastikan overlay disembunyikan jika terjadi error
            if (mainWindow && !mainWindow.isDestroyed()) {
                await mainWindow.webContents.executeJavaScript('window.playerAPI.hideQueueLoading();');
            }
        }
    }
});
// ======================== Akhir Loading Tumbail =======================//


// === 1. Fungsi umum untuk ambil subfolder ===
function getSubfolders(directory) {
    try {
        return fs.readdirSync(directory, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
    } catch (err) {
        console.error(`Error reading directory: ${directory}`, err);
        return [];
    }
}

// === 2. Event on ready ===
app.on('ready', () => {
    // Load remembered settings snapshot (if it exists)
    loadUserSettingsFromDisk();

    // === Quick Boot Detection ===
    const quickBootArg = process.argv.find(arg => arg.startsWith('--quick-boot-base64='));
    if (quickBootArg) {
        try {
            const base64Str = quickBootArg.split('=')[1];
            const jsonStr = Buffer.from(base64Str, 'base64').toString('utf-8');
            const settings = JSON.parse(jsonStr);

            console.log("[Main] Quick Boot detected (Base64) with settings:", settings);

            // Reuse open-main-window logic
            const mode = settings.mode || 'game';
            if (mode === 'native') {
                setupNativeYTMusicWindow(settings);
            } else {
                setupGameWindow(settings);
            }
            return; // Skip creating popupWindow
        } catch (e) {
            console.error("[Main] Failed to parse Quick Boot Base64 args:", e);
            console.error("Raw Arg:", quickBootArg);
        }
    }

    // Buat popup window
    popupWindow = new BrowserWindow({
        width: 800,
        height: 530,
        resizable: false,
        icon: path.join(__dirname, 'aset', 'ikon.jpg'),
        modal: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    // Muat popup
    popupWindow.loadFile('popup.html');
    popupWindow.setMenu(null);

    // Kirim data playlist dan wallpaper ke popup
    popupWindow.webContents.on('did-finish-load', () => {
        const playlists = getSubfolders(musicDirectory);
        const wallpapers = getSubfolders(wallpaperDirectory);
        // Kirim juga status fullscreen yang tersimpan agar checkbox di popup sesuai
        const configFullscreen = (userSettings && typeof userSettings.isFullscreen === 'boolean') ? userSettings.isFullscreen : false;
        popupWindow.webContents.send('populate-dropdowns', { playlists, wallpapers, configFullscreen });
    });

    ipcMain.on('set-overlay-feature', (event, enabled) => {
        const justEnabled = enabled && !isOverlayEnabled;

        isOverlayEnabled = enabled;
        userSettings.overlayEnabled = enabled;
        console.log(`Fitur Overlay diatur ke: ${enabled}`);

        if (enabled) {
            if (!overlayWindow) createOverlayWindow();

            if (!globalShortcut.isRegistered('Alt+S')) {
                globalShortcut.register('Alt+S', () => {
                    if (overlayWindow) {
                        // Tampilkan JENDELA overlay jika tersembunyi
                        if (!overlayWindow.isVisible()) {
                            overlayWindow.show();
                        }
                        overlayWindow.webContents.send('toggle-overlay-panel');

                        // Paksa kirim status Salju & Mini Player terbaru ke Overlay setiap kali dibuka
                        // Ini memastikan switch di overlay selalu sinkron dengan status asli
                        overlayWindow.webContents.send('initial-settings-sync', {
                            snow: isSnowFeatureEnabled,
                            miniPlayer: isMiniPlayerFeatureEnabled
                        });
                    }
                });
            }
            if (justEnabled) {
                showReadyNotification();
            }
        } else {
            globalShortcut.unregister('Alt+S');
            if (overlayWindow) {
                overlayWindow.close();
            }

            if (notificationTimer) {
                clearTimeout(notificationTimer);
                notificationTimer = null;
                console.log('[Main] Timer notifikasi dibatalkan karena fitur dinonaktifkan.');
            }

            if (notificationWindow && !notificationWindow.isDestroyed()) {
                notificationWindow.close();
                console.log('[Main] Window notifikasi ditutup karena fitur dinonaktifkan.');
            }
        }
    });

    ipcMain.on('minimize-window', () => {
        if (popupWindow) popupWindow.minimize();
    });

    ipcMain.on('maximize-window', () => {
        if (popupWindow) {
            popupWindow.isMaximized() ? popupWindow.unmaximize() : popupWindow.maximize();
        }
    });

    ipcMain.on('close-window', () => {
        if (popupWindow) popupWindow.close();
    });

    ipcMain.on("toggle-fullscreen", (event) => {
        if (mainWindow) {
            isFullscreen = !mainWindow.isFullScreen();
            mainWindow.setFullScreen(isFullscreen);

            // Kirim status fullscreen ke frontend agar checkbox bisa diperbarui
            mainWindow.webContents.send("fullscreen-status-changed", isFullscreen);
        }
    });
    globalShortcut.unregisterAll();
});

// === 4. Quick Boot Handler ===
ipcMain.on('create-quick-boot', (event, data) => {
    const { name, icon, settings } = data;
    const desktopPath = app.getPath('desktop');
    const safeName = name.replace(/[<>:"/\\|?*]/g, '_'); // Sanitize filename
    const shortcutPath = path.join(desktopPath, `${safeName}.lnk`);

    // Use Base64 encoding to avoid quoting hell in PowerShell
    const settingsJson = JSON.stringify(settings);
    const base64Payload = Buffer.from(settingsJson).toString('base64');

    let targetPath = app.getPath('exe');
    let args = `--quick-boot-base64=${base64Payload}`;

    // Handle Development Mode
    // In dev, targetPath is 'electron.exe'. We must pass the app source path as the first argument.
    if (!app.isPackaged) {
        const appSourcePath = app.getAppPath();
        // Wrap path in quotes to handle spaces
        args = `"${appSourcePath}" ${args}`;
        console.log('[QuickBoot] Detected Development Mode. Adjusting shortcut arguments to include app path.');
    }

    console.log(`[QuickBoot] Creating shortcut: ${shortcutPath}`);

    // PowerShell script to create shortcut
    // We use single quotes for arguments in PS, which is safe for Base64 (alphanumeric + /+=)
    // And safe for our double-quoted app path
    const psScript = `
            $WshShell = New-Object -comObject WScript.Shell;
            $Shortcut = $WshShell.CreateShortcut('${shortcutPath}');
            $Shortcut.TargetPath = '${targetPath}';
            $Shortcut.Arguments = '${args}';
            ${icon ? `$Shortcut.IconLocation = '${icon}';` : ''}
            $Shortcut.Save();
        `;

    const ps = spawn('powershell.exe', ['-Command', psScript]);

    ps.on('close', (code) => {
        // Send notification back to renderer if possible, or just log
        if (code === 0) {
            console.log(`[QuickBoot] Shortcut created successfully.`);
            // Optionally show a dialog or notification
        } else {
            console.log(`[QuickBoot] Shortcut creation failed with code ${code}`);
        }
    });


    ps.stderr.on('data', (data) => {
        console.error(`[QuickBoot] Error: ${data}`);
    });
});

ipcMain.handle('dialog-select-icon', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Icon Files', extensions: ['ico', 'exe', 'dll'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePaths[0] || null;
});

// === 3. Ketika popup di-close dan kita buka main window ===
ipcMain.on('open-main-window', (event, data) => {
    if (popupWindow) popupWindow.close();
    if (!data) data = {};

    const mode = data.mode || 'game';

    if (mode === 'native') {
        setupNativeYTMusicWindow(data);
    } else if (mode === 'gif-overlay') {
        setupGifOverlayStandaloneWindow(data);
    } else {
        setupGameWindow(data);
    }
});

// === Setup GIF Overlay Standalone Window ===
function setupGifOverlayStandaloneWindow(data) {
    console.log('[Main] Memulai mode GIF Overlay Standalone');
    currentAppMode = 'gif-overlay';

    // Buat window utama untuk GIF Overlay Manager
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 920,
        minWidth: 350,
        minHeight: 400,
        icon: path.join(__dirname, 'aset', 'ikon.jpg'),
        frame: false,
        transparent: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile('gif-overlay-standalone.html');

    // Aktifkan GIF overlay feature secara default
    isGifOverlayEnabled = true;

    // Kirim settings yang tersimpan ke window
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('load-settings', {
            gifOverlays: userSettings.gifOverlays || [],
            gifOverlayLocked: userSettings.gifOverlayLocked || false,
        });
    });

    // Handle window controls
    ipcMain.on('gif-standalone-control', (evt, action) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (action === 'minimize') mainWindow.minimize();
        else if (action === 'maximize') {
            if (mainWindow.isMaximized()) mainWindow.unmaximize();
            else mainWindow.maximize();
        }
        else if (action === 'close') mainWindow.close();
    });

    // Handle ready event dari standalone window
    ipcMain.on('gif-standalone-ready', () => {
        console.log('[Main] GIF Standalone siap, mengirim settings');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('load-settings', {
                gifOverlays: userSettings.gifOverlays || [],
                gifOverlayLocked: userSettings.gifOverlayLocked || false,
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        // Tutup semua GIF overlay windows saat standalone window ditutup
        gifOverlayWindows.forEach((win, id) => {
            if (win && !win.isDestroyed()) win.close();
        });
        gifOverlayWindows.clear();
    });

    // Initialize RPC if enabled (sama seperti mode lain)
    if (userSettings.rpcEnabled === true) {
        isRpcEnabled = true;
        initRPC();
    }
}

function setupNativeYTMusicWindow(data) {
    currentAppMode = 'native';
    const nativeAdSkipper = (data && typeof data.nativeAdSkipper === 'boolean')
        ? data.nativeAdSkipper
        : (userSettings && userSettings.adSkipperEnabled === true);

    let isOverlayMode = (data && typeof data.nativeOverlayMode === 'boolean')
        ? data.nativeOverlayMode
        : (userSettings && userSettings.overlayModeEnabled === true);

    userSettings.adSkipperEnabled = nativeAdSkipper;
    userSettings.overlayModeEnabled = isOverlayMode;
    normalizeUserSettings();

    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        callback({ cancel: false });
    });

    const nativeStartWidth = (userSettings && Number.isFinite(userSettings.windowWidth)) ? userSettings.windowWidth : 1280;
    const nativeStartHeight = (userSettings && Number.isFinite(userSettings.windowHeight)) ? userSettings.windowHeight : 720;
    const nativeStartFullscreen = false; // userSettings && userSettings.isFullscreen === true;

    // Store boot dimensions for restoring when exiting overlay mode
    let bootWidth = nativeStartWidth;
    let bootHeight = nativeStartHeight;

    mainWindow = new BrowserWindow({
        width: nativeStartWidth,
        height: nativeStartHeight,
        icon: path.join(__dirname, 'aset', 'ikon.jpg'),
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
        },
        fullscreen: nativeStartFullscreen,
    });

    mainWindow.loadFile('native-player.html');

    if (userSettings.adSkipperEnabled === true) {
        createAdSkipperWindow();
    }

    // Pastikan Discord RPC juga aktif saat boot ke mode native/webview
    if (userSettings.rpcEnabled === true) {
        isRpcEnabled = true;
        initRPC();
    }

    // Apply remembered Mini Player state on boot (Native mode)
    // Sama seperti di Game Mode, mini player perlu di-initialize saat boot
    // karena IPC dari renderer mungkin dikirim sebelum handler siap
    isMiniPlayerFeatureEnabled = userSettings.miniPlayerFeatureEnabled === true;
    if (isMiniPlayerFeatureEnabled) {
        if (!miniPlayerWindow) createMiniPlayerWindow();
        setTimeout(() => {
            if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
                miniPlayerWindow.show();
            }
        }, 200);
    }

    // --- Overlay Mode Logic ---
    let isOverlayVisible = true;
    let userOverlayWidth = 520; // Default width
    let overlayAnimationTimer = null;

    // Track resize to save user preference
    mainWindow.on('resize', () => {
        if (isOverlayMode && isOverlayVisible) {
            const bounds = mainWindow.getBounds();
            // Only update if width is reasonable (e.g. > 200) to avoid glitches
            if (bounds.width > 200) {
                userOverlayWidth = bounds.width;
            }
        }
    });

    // Easing Function: Cubic Ease Out (Matches overlay.html)
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animateOverlay = (targetX, onComplete) => {
        if (overlayAnimationTimer) clearInterval(overlayAnimationTimer);

        // Cek apakah window masih valid sebelum animasi
        if (!mainWindow || mainWindow.isDestroyed()) {
            if (onComplete) onComplete();
            return;
        }

        const startBounds = mainWindow.getBounds();
        const startX = startBounds.x;
        const distance = targetX - startX;
        const duration = 400; // 400ms to match overlay.html
        const intervalTime = 10;
        const steps = duration / intervalTime;
        let currentStep = 0;

        // Capture current dimensions to avoid resizing during slide
        const { width: currentWidth, height: currentHeight } = startBounds;

        overlayAnimationTimer = setInterval(() => {
            // Cek apakah window sudah di-destroy (user close app dari taskbar)
            if (!mainWindow || mainWindow.isDestroyed()) {
                clearInterval(overlayAnimationTimer);
                overlayAnimationTimer = null;
                return;
            }

            currentStep++;
            const progress = Math.min(currentStep / steps, 1);
            const easedProgress = easeOutCubic(progress);
            const newX = Math.round(startX + (distance * easedProgress));

            mainWindow.setBounds({
                x: newX,
                y: 0,
                width: currentWidth,
                height: currentHeight
            });

            if (currentStep >= steps) {
                clearInterval(overlayAnimationTimer);
                overlayAnimationTimer = null;

                // Cek lagi sebelum setBounds final
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setBounds({
                        x: targetX,
                        y: 0,
                        width: currentWidth,
                        height: currentHeight
                    });
                }
                if (onComplete) onComplete();
            }
        }, intervalTime);
    };

    const hideOverlay = () => {
        if (!isOverlayVisible) return;
        const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
        animateOverlay(screenWidth, () => { });
        isOverlayVisible = false;
    };

    const showOverlay = () => {
        if (isOverlayVisible) return;
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const overlayWidth = userOverlayWidth;

        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.setAlwaysOnTop(true, 'screen-saver');

        // Ensure correct size before sliding in
        mainWindow.setSize(overlayWidth, screenHeight);

        animateOverlay(screenWidth - overlayWidth, () => {
            mainWindow.focus();
        });
        isOverlayVisible = true;
    };

    // Auto-hide on blur (focus loss) - but not during animation
    let isAnimatingOverlay = false;

    mainWindow.on('blur', () => {
        // Skip if currently animating to prevent conflicts
        if (isAnimatingOverlay) return;

        if (isOverlayMode && isOverlayVisible) {
            console.log('[Main] Overlay lost focus, auto-hiding...');
            isAnimatingOverlay = true;
            hideOverlay();
            // Reset flag after animation completes
            setTimeout(() => { isAnimatingOverlay = false; }, 500);
        }
    });

    const updateOverlayState = () => {
        if (isOverlayMode) {
            // Register Alt+S
            globalShortcut.register('Alt+S', () => {
                if (isOverlayVisible) hideOverlay();
                else showOverlay();
            });
        } else {
            globalShortcut.unregister('Alt+S');
            mainWindow.setAlwaysOnTop(false);
            // Restore normal size if needed, or let user resize
        }
    };

    // Initial Setup
    updateOverlayState();

    if (isOverlayMode) {
        const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
        const overlayWidth = userOverlayWidth;
        mainWindow.setBounds({
            x: screenWidth - overlayWidth,
            y: 0,
            width: overlayWidth,
            height: screenHeight
        });
        mainWindow.setAlwaysOnTop(true, 'screen-saver');

        // Lock vertical resize - only allow horizontal (left side) resize
        mainWindow.setMinimumSize(250, screenHeight);
        mainWindow.setMaximumSize(screenWidth, screenHeight);

        isOverlayVisible = true;

        showGlobalNotification({
            title: 'GAP Overlay ready!',
            message: 'press Alt + S',
            type: 'default'
        });
    }

    // --- IPC Handlers for Native UI ---
    ipcMain.on('native-window-control', (event, action) => {
        if (!mainWindow) return;
        switch (action) {
            case 'minimize': mainWindow.minimize(); break;
            case 'maximize':
                if (mainWindow.isMaximized()) mainWindow.unmaximize();
                else mainWindow.maximize();
                break;
            case 'close': mainWindow.close(); break;
        }
    });

    ipcMain.on('native-overlay-toggle', (event, enabled) => {
        isOverlayMode = enabled;
        userSettings.overlayModeEnabled = enabled;
        scheduleSaveUserSettings();
        updateOverlayState();

        if (isOverlayMode) {
            // pastiin window tidak dalam keadaan maximize agar setBounds berfungsi normal
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize();
            }

            // Jika diaktifkan, langsung ubah bentuk ke overlay
            const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
            const overlayWidth = userOverlayWidth;
            mainWindow.setBounds({
                x: screenWidth - overlayWidth,
                y: 0,
                width: overlayWidth,
                height: screenHeight
            });
            mainWindow.setAlwaysOnTop(true, 'screen-saver');

            // Lock vertical resize - only allow horizontal (left side) resize
            // Setting minHeight = maxHeight = screenHeight prevents vertical resize
            mainWindow.setMinimumSize(250, screenHeight);
            mainWindow.setMaximumSize(screenWidth, screenHeight);

            isOverlayVisible = true;

            showGlobalNotification({
                title: 'GAP Overlay ready!',
                message: 'press Alt + S',
                type: 'default'
            });
        } else {
            // Jika dimatikan, kembalikan ke ukuran awal saat boot
            console.log(`[Main] Disabling overlay mode, restoring to boot size: ${bootWidth}x${bootHeight}`);

            // PENTING: Reset constraints DULU sebelum mengubah ukuran
            // Karena min/max size dari overlay mode bisa menghalangi resize
            mainWindow.setMinimumSize(400, 300);
            mainWindow.setMaximumSize(0, 0); // 0 = no limit

            mainWindow.setAlwaysOnTop(false);
            mainWindow.setSize(bootWidth, bootHeight);
            mainWindow.center();
            mainWindow.setResizable(true);
            isOverlayVisible = true; // Reset state
        }
    });

    // Handler for hiding overlay from confirmation modal
    ipcMain.on('native-overlay-hide', () => {
        if (isOverlayMode && isOverlayVisible) {
            console.log('[Main] Hiding overlay from confirmation modal...');
            hideOverlay();
        }
    });

    mainWindow.on('minimize', (event) => {
        // Saat mode overlay aktif, blokir minimize dan gunakan sebagai toggle show/hide
        if (isOverlayMode) {
            // preventDefault tidak selalu work di Windows, jadi kita pakai trik:
            // Biarkan minimize terjadi, lalu langsung restore dan toggle overlay
            setImmediate(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.restore();

                    // Toggle visibility overlay
                    if (isOverlayVisible) {
                        hideOverlay();
                    } else {
                        showOverlay();
                    }
                }
            });
            return;
        }
        if (mainWindow) mainWindow.webContents.send('window-minimized');
    });
    mainWindow.on('restore', () => { if (mainWindow) mainWindow.webContents.send('window-restored'); });

    // Handle taskbar icon click when in overlay mode and hidden
    // When user clicks the taskbar icon while overlay is hidden, show it
    mainWindow.on('show', () => {
        if (isAnimatingOverlay) return;

        if (isOverlayMode && !isOverlayVisible) {
            console.log('[Main] Taskbar icon clicked while overlay hidden, showing overlay...');
            isAnimatingOverlay = true;
            showOverlay();
            setTimeout(() => { isAnimatingOverlay = false; }, 500);
        }
    });

    mainWindow.on('focus', () => {
        if (isAnimatingOverlay) return;

        if (isOverlayMode && !isOverlayVisible) {
            console.log('[Main] Window received focus while overlay hidden, showing overlay...');
            isAnimatingOverlay = true;
            showOverlay();
            setTimeout(() => { isAnimatingOverlay = false; }, 500);
        }
    });

    mainWindow.on('close', () => { app.quit(); });

    mainWindow.webContents.on('did-finish-load', () => {
        // Kita tidak perlu insertCSS drag region lagi karena sudah ada di Title Bar custom
        // Tapi kita bisa inject CSS tambahan jika perlu

        // Kirim status awal ke native-player.html
        mainWindow.webContents.send('setting-update', {
            adSkipperEnabled: userSettings.adSkipperEnabled === true,
            autoMuteAds: userSettings.autoMuteAds === true,
            autoSkipAds: userSettings.autoSkipAds === true,
            rpcEnabled: userSettings.rpcEnabled === true,
            overlayModeEnabled: userSettings.overlayModeEnabled === true,

            // Fitur Tambahan & Persistence
            miniPlayerFeatureEnabled: userSettings.miniPlayerFeatureEnabled === true,
            dynamicThemeEnabled: userSettings.dynamicThemeEnabled === true,
            dynamicThemeMode: userSettings.dynamicThemeMode,
            gifOverlayEnabled: userSettings.gifOverlayEnabled === true,
            gifOverlayLocked: userSettings.gifOverlayLocked === true,
            gifOverlays: userSettings.gifOverlays
        });
    });

    ipcMain.on('playback-update', (event, playbackData) => {
        // Update lastMusicState untuk kondisional GIF Overlay (Native Mode)
        if (playbackData) {
            const oldTitle = lastMusicState.title;
            const oldArtist = lastMusicState.artist;

            lastMusicState.isPlaying = playbackData.isPlaying === true;
            lastMusicState.title = playbackData.title || '';
            lastMusicState.artist = playbackData.artist || '';

            // Log perubahan hanya jika judul atau artis berubah
            if (oldTitle !== lastMusicState.title || oldArtist !== lastMusicState.artist) {
                console.log(`[Main][GIF] Musik berubah: "${lastMusicState.title}" by ${lastMusicState.artist}`);
            }

            // Evaluasi ulang visibilitas GIF overlay
            evaluateGifOverlayVisibility();
        }

        if (userSettings.rpcEnabled !== false) {
            updateRpcActivity({
                details: `Mendengarkan: ${playbackData.title}`,
                state: `by ${playbackData.artist}`,
                largeImageKey: 'main_icon',
                smallImageKey: 'play_icon',
                smallImageText: 'Playing'
            });
        }
        if (isMiniPlayerFeatureEnabled && miniPlayerWindow) {
            miniPlayerWindow.webContents.send('mini-player-data-update', {
                title: playbackData.title,
                artist: playbackData.artist,
                coverSrc: playbackData.thumbnail,
                isPlaying: playbackData.isPlaying,
                progressPercent: playbackData.progressPercent,
                currentTime: playbackData.currentTime,
                duration: playbackData.duration
            });
        }
    });

    ipcMain.on('analyser-data', (event, analyserData) => {
        if (isMiniPlayerFeatureEnabled && miniPlayerWindow) {
            miniPlayerWindow.webContents.send('mini-player-data-update', {
                visualizerData: analyserData.data
            });
        }
    });

    // --- Native Mode: Ad Skipper & Mini Player  ---
    ipcMain.on('toggle-mini-player', (event, enabled) => {
        isMiniPlayerFeatureEnabled = enabled;
        userSettings.miniPlayerFeatureEnabled = enabled;
        scheduleSaveUserSettings();
        if (enabled) {
            if (!miniPlayerWindow) createMiniPlayerWindow();
            miniPlayerWindow.show();
            startMiniPlayerCursorTracking();
        } else {
            if (miniPlayerWindow) miniPlayerWindow.hide();
            stopMiniPlayerCursorTracking();
        }
    });

    ipcMain.on('mini-player-settings-update', (event, settings) => {
        // Meneruskan pengaturan ke jendela mini player jika ada
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            miniPlayerWindow.webContents.send('update-mini-player-settings', settings);
        }
        // Simpan state ke user settings agar persisten
        userSettings.miniPlayerHideOnCursor = settings.hideOnCursor;
        scheduleSaveUserSettings();

        // Pastikan tracking berjalan jika setting diaktifkan
        if (settings.hideOnCursor) {
            startMiniPlayerCursorTracking();
        }
    });

    ipcMain.on('set-mini-player-hide-on-cursor', (event, enabled) => {
        console.log('[Main] set-mini-player-hide-on-cursor received:', enabled);
        userSettings.miniPlayerHideOnCursor = enabled;
        scheduleSaveUserSettings();

        // Kirim update ke mini-player window
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            console.log('[Main] Sending update-mini-player-settings to miniPlayerWindow');
            miniPlayerWindow.webContents.send('update-mini-player-settings', {
                hideOnCursor: enabled
            });
        } else {
            console.log('[Main] miniPlayerWindow not available');
        }

        // Start atau pastikan tracking berjalan jika diaktifkan
        if (enabled && isMiniPlayerFeatureEnabled) {
            console.log('[Main] Starting cursor tracking');
            startMiniPlayerCursorTracking();
        }
    });

    ipcMain.on('toggle-ad-skipper-window', (event, enabled) => {
        userSettings.adSkipperEnabled = enabled;
        scheduleSaveUserSettings();
        if (enabled) {
            if (!adSkipperWindow) createAdSkipperWindow();
        } else {
            if (adSkipperWindow) adSkipperWindow.close();
        }
    });

    ipcMain.on('player-control-action', (event, action) => {
        if (mainWindow) {
            mainWindow.webContents.send('remote-control-action', action);
        }
    });

    // Forward Special Event Preview from Editor to Player
    ipcMain.on('vn-engine:special-event', (event, payload) => {
        console.log('[Main] Forwarding Special Event Preview:', payload);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('vn-engine:special-event', payload);
        }
    });
}

function setupGameWindow(data) {
    currentAppMode = 'game';

    let skipScene = data.skipScene || false;
    let selectedPlaylist = data.selectedPlaylist || '';
    let selectedWallpaper = data.selectedWallpaper || '';
    let internetConnectionAllowed = false;

    if (typeof data === 'object' && data !== null) {
        skipScene = data.skipScene || false;
        selectedPlaylist = data.selectedPlaylist || '';
        selectedWallpaper = data.selectedWallpaper || '';
        isFullscreen = data.fullscreenMode || false;
    } else if (typeof data === 'boolean') {
        skipScene = data;
    }

    // Apply remembered snapshot window state (if any)
    // Apply remembered snapshot window state (if any)
    // BLOKIR LOGIKA INI: Kita gunakan data.fullscreenMode yang dikirim dari popup sebagai source of truth.
    // Jika user mengubah checkbox di popup, itu yang harus dipakai. 
    // Jika tidak diubah, popup akan mengirim nilai default yang sudah disinkronkan dengan saved settings (lihat populate-dropdowns).
    // if (userSettings && typeof userSettings.isFullscreen === 'boolean') {
    //    isFullscreen = userSettings.isFullscreen;
    // }

    const gameStartWidth = (userSettings && Number.isFinite(userSettings.windowWidth)) ? userSettings.windowWidth : 1600;
    const gameStartHeight = (userSettings && Number.isFinite(userSettings.windowHeight)) ? userSettings.windowHeight : 900;

    // blok internet
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const isHttp = details.url.startsWith('http://') || details.url.startsWith('https://');
        const isFile = details.url.startsWith('file://');

        // Izinkan semua request file lokal secara eksplisit
        if (isFile) {
            callback({ cancel: false });
            return;
        }

        // Blokir request internet jika tidak diizinkan
        if (!internetConnectionAllowed && isHttp) {
            console.log(`Block internet request: ${details.url}`);
            callback({ cancel: true });
        } else {
            callback({ cancel: false });
        }
    });

    ipcMain.on('connect-to-internet', () => {
        internetConnectionAllowed = true;
        console.log('User mengizinkan koneksi internet.');
    });

    // Buat mainWindow
    mainWindow = new BrowserWindow({
        width: gameStartWidth,
        height: gameStartHeight,
        icon: path.join(__dirname, 'aset', 'ikon.jpg'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            backgroundThrottling: false
        },
        fullscreen: isFullscreen,
    });

    // Jika tombol minimize
    mainWindow.on('minimize', () => {
        console.log('Window was minimized');
        if (mainWindow) {
            mainWindow.webContents.send('window-minimized');
        }
    });

    // di-restore (dibuka kembali dari minimize)
    mainWindow.on('restore', () => {
        console.log('Window was restored');
        if (mainWindow) {
            mainWindow.webContents.send('window-restored');
        }
    });

    // Jika tombol close
    mainWindow.on('close', (e) => {
        console.log('[Main] hentikan semua.');
        app.quit();
    });

    mainWindow.loadFile('index.html');
    mainWindow.setMenu(null);

    // Buat version overlay (BrowserView) setelah mainWindow siap
    mainWindow.once('ready-to-show', () => {
        createVersionOverlay();
    });
    // Fallback jika ready-to-show sudah dipanggil
    mainWindow.webContents.once('did-finish-load', () => {
        if (!versionOverlay) {
            createVersionOverlay();
        }
    });

    // Apply remembered Mini Player state on boot (Game mode)
    isMiniPlayerFeatureEnabled = userSettings.miniPlayerFeatureEnabled === true;
    if (isMiniPlayerFeatureEnabled) {
        if (!miniPlayerWindow) createMiniPlayerWindow();
        setTimeout(() => {
            if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
                miniPlayerWindow.show();
            }
        }, 200);
    } else {
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            miniPlayerWindow.hide();
        }
    }

    if (userSettings.rpcEnabled === true) {
        isRpcEnabled = true;
        initRPC();
    } else {
        isRpcEnabled = false;
    }

    // Handler update-rpc-activity sudah dipasang secara global

    // === 3a. Bangun array lagu dengan gambar cover ===
    let songsArray = [];
    let defaultSong = null;

    if (selectedPlaylist) {
        const playlistPath = path.join(musicDirectory, selectedPlaylist);
        if (fs.existsSync(playlistPath)) {
            const files = fs.readdirSync(playlistPath);

            files.forEach(file => {
                if (file.endsWith('.mp3')) {
                    let baseName = path.parse(file).name;
                    let isDefault = false;

                    if (baseName.startsWith('!')) {
                        isDefault = true;
                        baseName = baseName.substring(1);
                    }

                    // Parsing untuk judul dan artis
                    let parsedTitle = baseName;
                    let parsedArtist = ""; // Default jika tidak ada artis terdeteksi
                    const delimiter = " - ";
                    const lastDelimiterIndex = baseName.lastIndexOf(delimiter);

                    // memastikan delimiter ada dan bukan di awal atau akhir string
                    if (lastDelimiterIndex > 0 && lastDelimiterIndex < baseName.length - delimiter.length) {
                        parsedTitle = baseName.substring(0, lastDelimiterIndex).trim();
                        parsedArtist = baseName.substring(lastDelimiterIndex + delimiter.length).trim();
                    }


                    const coverExtensions = ['.jpg', '.png', '.webp'];
                    let coverPath = null;
                    for (let ext of coverExtensions) {
                        let potentialCover = path.join(playlistPath, `${parsedTitle}${ext}`); // Coba dengan parsedTitle dulu
                        if (!fs.existsSync(potentialCover)) { // Jika tidak ada, coba dengan baseName asli (sebelum parsing delimiter)
                            potentialCover = path.join(playlistPath, `${baseName}${ext}`);
                        }
                        if (fs.existsSync(potentialCover)) {
                            // Gunakan nama file asli (baseName) untuk path cover agar konsisten dengan nama file gambar
                            coverPath = path.join('aset', 'music', selectedPlaylist, `${baseName}${ext}`);
                            break;
                        }
                    }
                    // Jika masih tidak ada cover, coba cari dengan nama file MP3 tanpa ekstensi
                    if (!coverPath) {
                        for (let ext of coverExtensions) {
                            let potentialCover = path.join(playlistPath, `${path.parse(file).name}${ext}`);
                            if (fs.existsSync(potentialCover)) {
                                coverPath = path.join('aset', 'music', selectedPlaylist, `${path.parse(file).name}${ext}`);
                                break;
                            }
                        }
                    }


                    const songData = {
                        title: parsedTitle,
                        artist: parsedArtist, // Menyimpan artis secara terpisah
                        src: path.join('aset', 'music', selectedPlaylist, file),
                        cover: coverPath
                    };

                    songsArray.push(songData);
                    if (isDefault) {
                        defaultSong = songData;
                    }
                }
            });
        }
    }

    // === 3b. Bangun array wallpaper ===
    let wallpapersArray = [];
    let defaultTitleVideo = null;

    if (selectedWallpaper) {
        const wallpaperPath = path.join(wallpaperDirectory, selectedWallpaper);
        if (fs.existsSync(wallpaperPath)) {
            const files = fs.readdirSync(wallpaperPath);

            const supportedVideoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
            const supportedImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

            files.forEach(file => {
                const fileExt = path.parse(file).ext.toLowerCase();
                const isVideo = supportedVideoExtensions.includes(fileExt);
                const isImage = supportedImageExtensions.includes(fileExt);

                if (isVideo || isImage) {
                    let baseName = path.parse(file).name;
                    let isDefaultMedia = false;
                    if (baseName.startsWith('!')) {
                        isDefaultMedia = true;
                        baseName = baseName.substring(1);
                    }

                    const mediaData = {
                        name: baseName,
                        src: path.join('aset', 'wallpaper', selectedWallpaper, file),
                        mediaType: isVideo ? 'video' : 'image',
                        type: isVideo
                            ? `video/${fileExt.substring(1)}`
                            : `image/${fileExt.substring(1) === 'jpg' ? 'jpeg' : fileExt.substring(1)}`
                    };
                    wallpapersArray.push(mediaData);

                    // Default title video hanya bisa jadi video, bukan gambar
                    if (isDefaultMedia && isVideo) {
                        defaultTitleVideo = mediaData;
                    }
                }
            });
        }
    }

    // Setelah index.html kelar load, kirim data scene
    mainWindow.webContents.on('did-finish-load', () => {
        // 1. Dapatkan URL dan nama file saat ini (ini adalah satu-satunya tempat kita mendefinisikannya)
        const currentURLObject = new URL(mainWindow.webContents.getURL());
        const currentFileName = require('path').basename(currentURLObject.pathname);

        console.log('Halaman dimuat:', currentFileName);

        // 2. Logika khusus jika yang dimuat adalah index.html utama
        if (currentFileName === 'index.html') {
            console.log('[Main] Halaman index.html utama terdeteksi, mengirim konfigurasi scene...');

            // Salju & Mini Player
            mainWindow.webContents.send('snow-feature-status-changed', isSnowFeatureEnabled);
            mainWindow.webContents.send('mini-player-feature-status-changed', isMiniPlayerFeatureEnabled);
            if (isSnowFeatureEnabled && snowWindow) snowWindow.show();
            if (isMiniPlayerFeatureEnabled && miniPlayerWindow) miniPlayerWindow.show();

            // Kirim konfigurasi scene ke renderer
            mainWindow.webContents.send('configure-scene', {
                skipScene,
                songs: songsArray,
                wallpapers: wallpapersArray,
                defaultSong: defaultSong,
                defaultTitleVideo: defaultTitleVideo,
                settings: userSettings
            });
        }

        // 3. Logika khusus untuk injeksi tombol kembali yang pintar, hanya untuk vnManager.html
        if (currentFileName === 'vnManager.html') {
            const backButtonCSS = `
                    .back-button {
                        position: fixed; top: 10px; left: -11px;
                        width: 40px; height: 40px; padding: 5px;
                        font-size: 16px; font-weight: bold;
                        background-color: white; color: #ea759b;
                        border-radius: 15px; z-index: 9999999;
                        cursor: pointer;
                        transition: left 0.3s ease, background 0.3s ease, width 0.3s ease;
                        white-space: nowrap; overflow: hidden;
                        text-align: center; display: flex;
                        align-items: center; justify-content: center;
                    }
                    .back-button::before {
                        content: '✿';
                        color: #ea759b;
                    }
                    .back-button:hover {
                        left: 0;
                        background-color: rgba(0, 0, 0, 0.8);
                        width: 100px;
                        color: white;
                    }
                    .back-button:hover::before {
                        content: '← Back';
                    }
                `;
            mainWindow.webContents.insertCSS(backButtonCSS);

            // Injeksi tombol dan logika untuk menampilkannya secara kondisional
            mainWindow.webContents.executeJavaScript(`
                    // Gunakan nama kelas yang sesuai dengan CSS di atas
                    const oldBackButton = document.querySelector('.back-button');
                    if (oldBackButton) oldBackButton.remove();

                    const backButton = document.createElement('div');
                    backButton.classList.add('back-button'); // <-- Menggunakan kelas '.back-button'
                    backButton.title = 'Kembali ke Menu Utama Aplikasi';
                    backButton.onclick = () => {
                        require('electron').ipcRenderer.send('return-to-index');
                    };
                    document.body.appendChild(backButton);

                    // Logika pintar untuk menampilkan/menyembunyikan tombol (tetap sama)
                    function checkMenuVisibility() {
                        const menuContainer = document.querySelector('.menu-container');
                        const createNovelModal = document.getElementById('create-novel-modal');
                        const scriptEditorOverlay = document.getElementById('script-editor-overlay');
                        const hubEditorOverlay = document.getElementById('hub-editor-overlay');
                        
                        if (menuContainer && menuContainer.style.display !== 'none' && 
                            (!createNovelModal || !createNovelModal.classList.contains('visible')) && 
                            (!scriptEditorOverlay || !scriptEditorOverlay.classList.contains('visible')) &&
                            (!hubEditorOverlay || !hubEditorOverlay.classList.contains('visible'))) {
                            backButton.style.display = 'flex';
                        } else {
                            backButton.style.display = 'none';
                        }
                    }

                    const observer = new MutationObserver(checkMenuVisibility);
                    const modal = document.getElementById('create-novel-modal');
                    const editor = document.getElementById('script-editor-overlay');

                    if(modal) observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
                    if(editor) observer.observe(editor, { attributes: true, attributeFilter: ['class'] });
                    
                    checkMenuVisibility();
                `);
        }

        // Version label sekarang menggunakan BrowserView overlay (lihat createVersionOverlay)
        // Label tidak perlu di-inject ulang karena sudah terpisah dari konten halaman

        mainWindow.webContents.on('new-window', (event, url) => {
            event.preventDefault();
            require('electron').shell.openExternal(url);
        });
    });
}


// === 4. tombol option dan quit
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        app.emit('ready');
    }
});

ipcMain.on('apply-settings', (event, config) => {

    console.log('[Main apply-settings] Received config:', JSON.stringify(config));
    if (!mainWindow) {
        console.error('[Main apply-settings] mainWindow is null!');
        return;
    }
    if (mainWindow.isDestroyed()) {
        console.error('[Main apply-settings] mainWindow is destroyed!');
        return;
    }

    let fullscreenActuallyChanged = false;
    let newFullscreenState = isFullscreen;

    if (config && typeof config === 'object') {
        if (typeof config.width === 'number' && Number.isFinite(config.width)) userSettings.windowWidth = config.width;
        if (typeof config.height === 'number' && Number.isFinite(config.height)) userSettings.windowHeight = config.height;
        if (typeof config.isFullscreen === 'boolean') userSettings.isFullscreen = config.isFullscreen;
        normalizeUserSettings();
    }

    if (config.isFullscreen !== undefined && mainWindow) {
        if (mainWindow.isFullScreen() !== config.isFullscreen) {
            isFullscreen = config.isFullscreen;
            mainWindow.setFullScreen(isFullscreen);
            fullscreenActuallyChanged = true;
            newFullscreenState = isFullscreen;
        }
    }

    if (mainWindow) {
        if (!newFullscreenState) {
            // Jika kita baru saja keluar dari fullscreen, beri jeda singkat
            const delay = fullscreenActuallyChanged ? 100 : 0;
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setSize(config.width, config.height);
                    mainWindow.center();
                }
            }, delay);
        }

        if (fullscreenActuallyChanged) {
            mainWindow.webContents.send("fullscreen-status-changed", newFullscreenState);
        }
    }

    // Terapkan pengaturan fitur salju
    if (config.snowFeatureEnabled !== undefined) {
        // Check if WebGPU setting changed
        const webgpuChanged = config.webgpuEnabled !== undefined && config.webgpuEnabled !== userSettings.webgpuEnabled;
        if (config.webgpuEnabled !== undefined) {
            userSettings.webgpuEnabled = config.webgpuEnabled;
        }

        isSnowFeatureEnabled = config.snowFeatureEnabled;
        userSettings.snowFeatureEnabled = isSnowFeatureEnabled; // Simpan ke userSettings

        if (isSnowFeatureEnabled) {
            if (!snowWindow) {
                createSnowWindow();
            } else if (webgpuChanged) {
                // Reload with new file
                const snowFile = userSettings.webgpuEnabled ? 'wgsl/snow-webgpu.html' : 'snow.html';
                snowWindow.loadFile(path.join(__dirname, snowFile));
            }

            if (snowWindow) {
                snowWindow.show();
            }
        } else {
            if (snowWindow) snowWindow.hide();
        }
    }
    // Terapkan pengaturan fitur mini player
    if (config.adSkipperEnabled !== undefined) {
        userSettings.adSkipperEnabled = config.adSkipperEnabled;

        // Simpan Sub-Opsi (Gunakan fallback false jika undefined)
        userSettings.autoMuteAds = config.autoMuteAds || false;
        userSettings.autoSkipAds = config.autoSkipAds || false;

        // Kirim status LENGKAP ke renderer (Webview)
        if (mainWindow) {
            console.log('[Main] Sending AdSkipper Config:', {
                adSkipperEnabled: userSettings.adSkipperEnabled,
                autoMuteAds: userSettings.autoMuteAds,
                autoSkipAds: userSettings.autoSkipAds
            });

            mainWindow.webContents.send('setting-update', {
                adSkipperEnabled: userSettings.adSkipperEnabled,

                autoMuteAds: userSettings.autoMuteAds,
                autoSkipAds: userSettings.autoSkipAds
            });
        }

        // Logic hide/close skipper window
        if (!userSettings.adSkipperEnabled && adSkipperWindow) {
            adSkipperWindow.hide();
        }
    }

    // Terapkan pengaturan fitur mini player
    if (config.miniPlayerFeatureEnabled !== undefined) {
        isMiniPlayerFeatureEnabled = config.miniPlayerFeatureEnabled;
        userSettings.miniPlayerFeatureEnabled = isMiniPlayerFeatureEnabled; // Simpan ke userSettings
        if (isMiniPlayerFeatureEnabled) {
            if (!miniPlayerWindow) createMiniPlayerWindow();
            setTimeout(() => {
                if (miniPlayerWindow) {
                    miniPlayerWindow.show();
                }
            }, 200);
        } else {
            if (miniPlayerWindow) miniPlayerWindow.hide();
        }
    }

    // Terapkan pengaturan Hide on Cursor untuk Mini Player
    if (config.miniPlayerHideOnCursor !== undefined) {
        userSettings.miniPlayerHideOnCursor = config.miniPlayerHideOnCursor;
        scheduleSaveUserSettings();

        // Kirim update ke mini-player window agar hideOnCursorMode di-sync
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            miniPlayerWindow.webContents.send('update-mini-player-settings', {
                hideOnCursor: config.miniPlayerHideOnCursor
            });
        }

        // Restart tracking logic jika diaktifkan (dan mini player aktif)
        if (userSettings.miniPlayerHideOnCursor && isMiniPlayerFeatureEnabled) {
            startMiniPlayerCursorTracking();
        }
        // Jika dinonaktifkan, loop internal tracking akan berhenti sendiri pada tick berikutnya
    }
});

// 5. HANDLER Saat chapter dipilih dari vnManager.html
// State untuk tracking novel permissions
let novelSecurityPermissions = {};

async function showSecurityWarningDialog(scanResult, novelInfo = {}) {
    const { storyTitle, chapter, script, folder } = scanResult;

    // Build warning message
    let message = `Novel "${storyTitle}" (${chapter}) mengandung konten yang perlu perhatian:\n\n`;

    const concerns = [];

    if (script.hasDangerousCode) {
        let dangerSection = '⚠️ KODE BERBAHAYA TERDETEKSI:\n';
        script.dangerousPatterns.forEach(p => {
            dangerSection += `   • ${p.type} (entry #${p.index + 1}, tipe: ${p.entryType})\n`;
        });
        concerns.push(dangerSection.trim());
    }

    if (script.hasCustomJs) {
        let jsSection = 'Script/HTML Kustom:\n';
        script.details.forEach(d => {
            // Format berdasarkan tipe
            let detailLine = '';
            switch (d.type) {
                case 'script_tag':
                    detailLine = `   • <script> tag di property "${d.property}" (entry #${d.index + 1})`;
                    break;
                case 'custom_html':
                    detailLine = `   • HTML kustom di "${d.property}" (entry #${d.index + 1})`;
                    if (d.preview) detailLine += `\n     Preview: ${d.preview}`;
                    break;
                case 'html_content':
                    detailLine = `   • HTML content di "${d.property}" (entry #${d.index + 1})`;
                    break;
                case 'special_event_js':
                    detailLine = `   • JS di specialEvent "${d.eventType}" (entry #${d.index + 1})`;
                    break;
                case 'external_resource':
                    detailLine = `   • External resource "${d.url}" (entry #${d.index + 1})`;
                    break;
                default:
                    detailLine = `   • ${d.type} (entry #${d.index + 1})`;
            }
            jsSection += detailLine + '\n';
        });
        concerns.push(jsSection.trim());
    }

    // Pisahkan URL berdasarkan sumber
    if (script.hasExternalUrls || folder.externalResources.length > 0) {
        let urlSection = 'Akses Internet Eksternal:\n';

        // URL dari script.json
        if (script.externalUrls && script.externalUrls.length > 0) {
            urlSection += `   [Dari script.json]\n`;
            script.externalUrls.slice(0, 3).forEach(url => {
                urlSection += `   • ${url}\n`;
            });
            if (script.externalUrls.length > 3) {
                urlSection += `   ... +${script.externalUrls.length - 3} URL lainnya\n`;
            }
        }

        // URL dari index.html (VN Player)
        if (folder.externalResources && folder.externalResources.length > 0) {
            urlSection += `   [Dari VN Player HTML]\n`;
            folder.externalResources.slice(0, 3).forEach(url => {
                urlSection += `   • ${url}\n`;
            });
            if (folder.externalResources.length > 3) {
                urlSection += `   ... +${folder.externalResources.length - 3} URL lainnya\n`;
            }
        }

        concerns.push(urlSection.trim());
    }

    if (folder.customScripts.length > 0) {
        concerns.push(`Script kustom di VN Player (${folder.customScripts.length} file)`);
    }

    message += concerns.join('\n\n');
    message += '\n\n─────────────────────────────────\n';

    // Buat kalimat peringatan dengan VN Mapper jika ada
    if (novelInfo.vnMapper) {
        message += `Pastikan kamu mempercayai "${novelInfo.vnMapper}" sebagai mapper visual novel ini sebelum melanjutkan.`;
    } else {
        message += 'Pastikan kamu mempercayai pembuat novel ini sebelum melanjutkan.';
    }

    // Determine buttons based on concerns
    let buttons = ['Lanjutkan Tetap', 'Batalkan'];
    let hasExternalUrls = script.hasExternalUrls || folder.externalResources.length > 0;

    if (hasExternalUrls) {
        buttons = ['Izinkan Akses Internet', 'Jalankan Tanpa Internet', 'Batalkan'];
    }

    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '⚠️ Peringatan Keamanan Novel',
        message: `Peringatan Keamanan`,
        detail: message,
        buttons: buttons,
        defaultId: buttons.length - 1, // Cancel as default
        cancelId: buttons.length - 1,
        noLink: true
    });

    return {
        proceed: result.response !== buttons.length - 1,
        allowInternet: hasExternalUrls ? result.response === 0 : true,
        buttonClicked: buttons[result.response],
        cancelled: result.response === buttons.length - 1
    };
}

// Fungsi untuk membaca metadata kreator dari novel hub index.html
function readNovelMetadata(storyTitle) {
    const novelInfo = { author: null, illustrator: null, genre: null, vnMapper: null };
    try {
        const hubPath = path.join(visualNovelsDirectory, storyTitle, 'index.html');
        if (fs.existsSync(hubPath)) {
            const content = fs.readFileSync(hubPath, 'utf-8');

            // Extract author
            const authorMatch = content.match(/class="author"[^>]*>([^<]+)</i);
            if (authorMatch) novelInfo.author = authorMatch[1].trim();

            // Extract illustrator
            const illustratorMatch = content.match(/class="illustrator"[^>]*>([^<]+)</i);
            if (illustratorMatch) novelInfo.illustrator = illustratorMatch[1].trim();

            // Extract genre
            const genreMatch = content.match(/class="genre"[^>]*>([^<]+)</i);
            if (genreMatch) novelInfo.genre = genreMatch[1].trim();

            // Extract VN Mapper
            const vnMapperMatch = content.match(/class="vn-mapper"[^>]*>([^<]+)</i);
            if (vnMapperMatch) novelInfo.vnMapper = vnMapperMatch[1].trim();
        }
    } catch (e) {
        console.error('[Security] Error reading novel metadata:', e.message);
    }
    return novelInfo;
}

function proceedToPlayChapter(storyTitle, chapter, allowInternet = true) {
    currentStoryTitle = storyTitle;
    currentChapter = chapter;
    console.log(`[Main] Menyimpan info: Story='${storyTitle}', Chapter='${chapter}', Internet=${allowInternet}`);

    // Store permission for this novel session
    const novelKey = `${storyTitle}::${chapter}`;
    novelSecurityPermissions[novelKey] = { allowInternet };

    updateRpcActivity({
        details: `Bermain: ${storyTitle}`,
        state: `Chapter: ${chapter}`,
    });

    const chapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, chapter);
    const scriptPath = path.join(chapterPath, 'script.json');

    try {
        // 1. Muat script ke memori main process
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
        currentVNScript = JSON.parse(scriptContent);
        currentVNIndex = 0;
        currentVNState = {
            backgroundStack: [{ type: null, src: null }],
            bgmState: { src: null, volume: undefined },
            lastSpeaker: null
        };
        vnDialogueHistory = [];
        console.log(`[VN Engine] Skrip untuk ${chapter} berhasil dimuat.`);

        // 2. Muat file HTML-nya
        mainWindow.loadFile(path.join(chapterPath, 'index.html'));

        // 3. Setelah HTML selesai dimuat, engine akan dimulai oleh renderer
        // (lihat handler 'vn-engine:ready' di bawah)

    } catch (error) {
        console.error(`[VN Engine] Gagal memuat skrip atau file chapter:`, error);
        dialog.showErrorBox('Error', `Gagal memuat chapter: ${error.message}`);
    }
}

// kembali ke VN Hub
function returnToNovelHub(storyTitle) {
    if (!mainWindow) return;
    const hubPath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, 'index.html');
    if (fs.existsSync(hubPath)) {
        mainWindow.loadFile(hubPath);
        console.log(`[Security] Returned to hub: ${storyTitle}`);
    } else {
        // Fallback ke VN Manager jika hub tidak ada
        mainWindow.loadFile(path.join(__dirname, 'aset', 'game', 'vnManager.html'));
        console.log('[Security] Hub not found, returned to VN Manager');
    }
}

ipcMain.on('play-chapter', async (event, { storyTitle, chapter }) => {
    if (!mainWindow) return;

    console.log(`[Security] Initiating security scan for: ${storyTitle} / ${chapter}`);

    // Perform security scan
    const novelPath = path.join(visualNovelsDirectory, storyTitle);
    const scriptPath = path.join(novelPath, chapter, 'script.json');

    const scriptWarnings = scanNovelScript(scriptPath);
    const folderWarnings = scanNovelFolder(novelPath);

    const scanResult = {
        storyTitle,
        chapter,
        hasSecurityConcerns: scriptWarnings.hasCustomJs ||
            scriptWarnings.hasDangerousCode ||
            scriptWarnings.hasExternalUrls ||
            folderWarnings.externalResources.length > 0,
        script: scriptWarnings,
        folder: folderWarnings
    };

    console.log('[Security] Scan completed:', scanResult.hasSecurityConcerns ? 'CONCERNS FOUND' : 'CLEAN');

    if (scanResult.hasSecurityConcerns) {
        // Read novel metadata for creator info
        const novelInfo = readNovelMetadata(storyTitle);

        // Show warning dialog
        const userDecision = await showSecurityWarningDialog(scanResult, novelInfo);

        if (userDecision.proceed) {
            console.log(`[Security] User chose to proceed. Internet access: ${userDecision.allowInternet}`);
            proceedToPlayChapter(storyTitle, chapter, userDecision.allowInternet);
        } else {
            console.log('[Security] User cancelled playing the novel. Returning to hub.');
            // Kembali ke VN Hub alih-alih tidak melakukan apa-apa
            returnToNovelHub(storyTitle);
        }
    } else {
        // No concerns, proceed directly
        proceedToPlayChapter(storyTitle, chapter, true);
    }
});

// Handler IPC untuk mengecek permission internet saat ini
ipcMain.handle('security:get-novel-permission', async (event, { storyTitle, chapter }) => {
    const novelKey = `${storyTitle}::${chapter}`;
    return novelSecurityPermissions[novelKey] || { allowInternet: true };
});


// 6. HANDLER Untuk memuat chapter selanjutnya
function getChapterListData(storyTitle) {
    const decodedTitle = decodeURIComponent(storyTitle);
    const storyPath = path.join(visualNovelsDirectory, decodedTitle);
    const mainChapters = [];
    const sideStories = [];
    try {
        const folders = fs.readdirSync(storyPath);
        folders.forEach((folder) => {
            const folderPath = path.join(storyPath, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                if (folder.toLowerCase() === 'sidestories') {
                    const subfolders = fs.readdirSync(folderPath);
                    subfolders.forEach((subfolder) => {
                        const subfolderPath = path.join(folderPath, subfolder);
                        if (fs.statSync(subfolderPath).isDirectory()) {
                            const indexPath = path.join(subfolderPath, 'index.html');
                            if (fs.existsSync(indexPath)) {
                                sideStories.push(subfolder);
                            }
                        }
                    });
                } else {
                    const indexPath = path.join(folderPath, 'index.html');
                    if (fs.existsSync(indexPath)) {
                        mainChapters.push(folder);
                    }
                }
            }
        });
    } catch (err) {
        console.error('Error reading chapters:', err);
    }
    return { mainChapters, sideStories };
}
ipcMain.handle('get-next-chapter', async () => {
    if (!currentStoryTitle || !currentChapter) {
        console.log('[Main] Tidak ada info story/chapter saat ini untuk menemukan chapter selanjutnya.');
        return null;
    }

    try {
        // Panggil fungsi internal, BUKAN ipcMain.handle
        const chaptersResponse = getChapterListData(currentStoryTitle);

        // Logika sorting
        const mainChapters = chaptersResponse.mainChapters.sort((a, b) => {
            const getNumber = (name) => {
                if (name.toLowerCase().includes('prolog') || name.toLowerCase().includes('pengenalan')) return 0;
                const match = name.match(/\d+/);
                return match ? parseInt(match[0], 10) : Infinity;
            };
            return getNumber(a) - getNumber(b);
        });

        console.log('[Main] Mengecek urutan chapter untuk "selanjutnya":', mainChapters);
        const currentIndex = mainChapters.indexOf(currentChapter);

        if (currentIndex > -1 && currentIndex < mainChapters.length - 1) {
            const nextChapter = mainChapters[currentIndex + 1];
            console.log(`[Main] Chapter selanjutnya ditemukan: ${nextChapter}`);
            return nextChapter;
        } else {
            console.log('[Main] Tidak ada chapter selanjutnya (chapter terakhir).');
            return null;
        }
    } catch (err) {
        console.error('Error saat mencari chapter selanjutnya:', err);
        return null;
    }
});

ipcMain.handle('get-window-size', () => {
    if (mainWindow && !mainWindow.isFullScreen() && !mainWindow.isDestroyed()) {
        const [width, height] = mainWindow.getSize();
        return { width, height };
    }
    return { width: userSettings.width || 1600, height: userSettings.height || 900 };
});

ipcMain.handle('get-fullscreen-status', async () => {
    if (mainWindow) {
        return mainWindow.isFullScreen();
    }
    return isFullscreen;
});

ipcMain.on('open-devtools', (event, target) => {
    if (target === 'main') {
        if (mainWindow) {
            mainWindow.webContents.openDevTools();
        }
    } else if (target === 'webview') {
        if (mainWindow) {
            mainWindow.webContents.send('request-webview-devtools');
        }
    }
});

ipcMain.on('quit-application', () => {
    app.quit();
});

// ---------------------------------------
// Visual Novel
// ---------------------------------------

// 1) Perintah untuk transisi ke vnManager.html
ipcMain.on('load-visual-novel', (event) => {
    if (mainWindow) {
        // Minta frontend fade-out musik lalu setelah selesai, trigger 'navigate-to-vn'
        mainWindow.webContents.send('fade-music-and-transition');
    }
});

// 2) Kalau fade-out sudah selesai, kita load vnManager.html
ipcMain.on('navigate-to-vn', () => {
    if (mainWindow) {
        // Tutup semua jendela persisten sebelum navigasi
        console.log('[Main] Navigasi ke VN, MENUTUP jendela global.');

        if (snowWindow && !snowWindow.isDestroyed()) {
            snowWindow.close();
        }
        if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
            miniPlayerWindow.close();
        }
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close();
        }

        updateRpcActivity({
            details: 'Memilih Visual Novel',
            state: 'Mencari cerita menarik',
            largeImageKey: 'vn_icon'
        });

        const vnPath = path.join(__dirname, 'aset', 'game', 'vnManager.html');
        mainWindow.loadFile(vnPath);
    }
});

// 3) Handler untuk mengambil daftar story (visual novels)
ipcMain.handle('get-story-list', async () => {
    const visualNovelsDirectory = path.join(__dirname, 'aset', 'game', 'visual_novels');
    const stories = [];
    try {
        const folders = fs.readdirSync(visualNovelsDirectory, { withFileTypes: true });

        for (const folder of folders) {
            if (folder.isDirectory()) {
                const novelPath = path.join(visualNovelsDirectory, folder.name);
                const indexPath = path.join(novelPath, 'index.html');

                if (fs.existsSync(indexPath)) {
                    // Cari cover image dengan berbagai ekstensi secara dinamis
                    let coverFilename = 'cover.jpg'; // Default fallback
                    let storyDesc = ''; // Story description yang dikustomisasi

                    try {
                        const files = fs.readdirSync(novelPath);
                        // Cari file yang diawali dengan 'cover.' dan memiliki ekstensi gambar yang didukung
                        const foundCover = files.find(file =>
                            file.toLowerCase().startsWith('cover.') &&
                            ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file).toLowerCase())
                        );

                        if (foundCover) {
                            coverFilename = foundCover;
                        }

                        // Baca storyDesc dari novel-meta.json jika ada
                        const metaPath = path.join(novelPath, 'novel-meta.json');
                        if (fs.existsSync(metaPath)) {
                            try {
                                const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                                storyDesc = metaData.storyDesc || '';
                            } catch (metaErr) {
                                console.error(`[Main] Error reading novel-meta.json for ${folder.name}:`, metaErr);
                            }
                        }
                    } catch (e) {
                        console.error(`[Main] Error finding cover for ${folder.name}:`, e);
                    }

                    stories.push({
                        title: folder.name,
                        playPath: `./visual_novels/${encodeURIComponent(folder.name)}/index.html`,
                        cover: coverFilename,
                        storyDesc: storyDesc  // Tambahkan storyDesc ke data story
                    });
                }
            }
        }
    } catch (err) {
        console.error('Error reading stories:', err);
    }
    return stories;
});

// 4) Handler untuk mengambil daftar chapter di satu story
ipcMain.handle('get-chapter-list', async (event, storyTitle) => {
    return getChapterListData(storyTitle);
});

ipcMain.on('return-to-index', (event) => {
    if (mainWindow) {
        mainWindow.loadFile('index.html');

        mainWindow.webContents.once('did-finish-load', () => {
            mainWindow.webContents.send('configure-scene', { skipScene: true });

            console.log('[Main] Kembali ke index, memulihkan visibilitas jendela global.');
            if (isSnowFeatureEnabled && snowWindow) {
                snowWindow.show();
            }
            if (isMiniPlayerFeatureEnabled && miniPlayerWindow) {
                miniPlayerWindow.show();
            }
            if (isOverlayEnabled && overlayWindow) {
                overlayWindow.show();
                overlayWindow.setIgnoreMouseEvents(true);
            }
        });
    }
});

// ----------------------------------------------- Buat Visual Novel ----------------------------------------- //
ipcMain.handle('create-new-novel', async (event, novelData) => {
    const { title, storyDesc, cover } = novelData;
    const { name: coverName, buffer: coverArrayBuffer } = cover;
    const coverBuffer = Buffer.from(coverArrayBuffer);
    const visualNovelsPath = path.join(__dirname, 'aset', 'game', 'visual_novels');
    const newNovelPath = path.join(visualNovelsPath, title);

    if (fs.existsSync(newNovelPath)) {
        return { success: false, message: 'Novel dengan judul ini sudah ada.' };
    }

    // Buat folder utama novel
    fs.mkdirSync(newNovelPath, { recursive: true });

    // Simpan file gambar cover
    const extension = path.extname(coverName);
    const coverFileName = 'cover' + extension;
    fs.writeFileSync(path.join(newNovelPath, coverFileName), coverBuffer);

    // Simpan storyDesc ke novel-meta.json
    const metaData = {
        storyDesc: storyDesc || '',
        createdAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(newNovelPath, 'novel-meta.json'), JSON.stringify(metaData, null, 2));
    console.log(`[Main] novel-meta.json disimpan untuk novel '${title}' dengan storyDesc: "${storyDesc}"`);

    try {
        // 1. Baca isi file template sebagai string
        const templatePath = path.join(__dirname, 'hub_template.html');
        let templateContent = fs.readFileSync(templatePath, 'utf-8');

        // 2. Siapkan data pengganti
        const initialDescription = `Ini adalah halaman informasi untuk novel ${title}. Edit deskripsi ini dan tambahkan lebih banyak gambar dari menu editor.`;
        const initialImageTags = [`<img src="./${coverFileName}" alt="${title}">`];

        // 3. Ganti semua placeholder di dalam template dengan data asli
        let finalHtmlContent = templateContent
            .replaceAll('{NOVEL_TITLE}', title)
            .replace('{NOVEL_DESCRIPTION}', initialDescription.replace(/\n/g, '<br>')) // Mengganti baris baru dengan <br>
            .replace('{NOVEL_GENRE}', '-')
            .replace('{NOVEL_AUTHOR}', '-')
            .replace('{NOVEL_ILLUSTRATOR}', '-')
            .replace('{NOVEL_VN_MAPPER}', '-')
            .replace('{IMAGE_TAGS}', initialImageTags.join('\n      '));

        // 4. Tulis konten final ke file index.html baru
        fs.writeFileSync(path.join(newNovelPath, 'index.html'), finalHtmlContent);

        console.log(`[Main] Berhasil membuat hub untuk novel '${title}' menggunakan template.`);
        return { success: true, message: 'Novel baru berhasil dibuat!' };

    } catch (error) {
        console.error(`[Main] Gagal membuat hub dari template: ${error}`);
        return { success: false, message: `Gagal membuat file hub dari template: ${error.message}` };
    }
});

ipcMain.handle('update-novel-details', async (event, data) => {
    const { novelTitle, description, genre, author, illustrator, vnMapper, slideshowImages, backgroundVideo } = data;
    const novelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle);

    try {
        const hubHtmlPath = path.join(novelPath, 'index.html');
        let htmlContent = fs.readFileSync(hubHtmlPath, 'utf-8');

        // Ekstrak tag gambar yang sudah ada
        let existingImageTags = [];
        const imageContainerRegex = /<div class="image-container"[^>]*>([\s\S]*?)<\/div>/;
        const match = htmlContent.match(imageContainerRegex);
        if (match && match[1]) {
            const imgTagRegex = /<img[^>]*>/g;
            existingImageTags = match[1].match(imgTagRegex) || [];
        }

        const allImageTags = [...existingImageTags];

        // Simpan gambar slideshow baru
        for (const image of slideshowImages) {
            const extension = path.extname(image.name);
            const imageName = `slide_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${extension}`;
            fs.writeFileSync(path.join(novelPath, imageName), Buffer.from(image.buffer));
            allImageTags.push(`<img src="./${imageName}" alt="Slideshow Image">`);
        }

        if (backgroundVideo) {
            const videoBuffer = Buffer.from(backgroundVideo.buffer);
            // Selalu simpan dengan nama 'video.mp4' agar mudah diakses oleh vnManager
            const videoFilename = 'video.mp4';
            fs.writeFileSync(path.join(novelPath, videoFilename), videoBuffer);
            console.log(`[Main] Video latar belakang untuk novel '${novelTitle}' telah disimpan sebagai ${videoFilename}.`);
        }

        // Ganti deskripsi
        htmlContent = htmlContent.replace(
            /<div class="description">[\s\S]*?<\/div>/,
            `<div class="description">${description.replace(/\n/g, '<br>')}</div>`
        );

        // Ganti Genre
        if (genre) {
            htmlContent = htmlContent.replace(
                /<span class="genre">.*?<\/span>/,
                `<span class="genre">${genre}</span>`
            );
        }
        // Ganti Author
        if (author) {
            htmlContent = htmlContent.replace(
                /<span class="author">.*?<\/span>/,
                `<span class="author">${author}</span>`
            );
        }
        // Ganti Illustrator
        if (illustrator) {
            // Regex diubah: hanya whitespace (spasi, tab, newline) antara span dan class - bukan [\s\S] yang terlalu greedy
            htmlContent = htmlContent.replace(
                /<span\s+class="illustrator">[^<]*<\/span>/,
                `<span class="illustrator">${illustrator}</span>`
            );
        }
        // Ganti VN Mapper
        if (vnMapper) {
            // Cek apakah sudah ada vnMapper di HTML
            if (htmlContent.includes('class="vn-mapper"')) {
                htmlContent = htmlContent.replace(
                    /<span class="vn-mapper">.*?<\/span>/,
                    `<span class="vn-mapper">${vnMapper}</span>`
                );
            } else {
                // Tambahkan vnMapper setelah illustrator jika belum ada
                htmlContent = htmlContent.replace(
                    /(<div><strong>Ilustrator:<\/strong> <span class="illustrator">.*?<\/span><\/div>)/,
                    `$1\n          <div><strong>VN Mapper:</strong> <span class="vn-mapper">${vnMapper}</span></div>`
                );
            }
        }

        // Ganti isi image-container
        if (allImageTags.length > 0) {
            htmlContent = htmlContent.replace(
                imageContainerRegex,
                `<div class="image-container" style="align-self: flex-start;">${allImageTags.join('\n      ')}</div>`
            );
        }

        fs.writeFileSync(hubHtmlPath, htmlContent);

        return { success: true, message: 'Detail novel berhasil diperbarui!' };
    } catch (error) {
        console.error(`[Main] Gagal memperbarui detail novel: ${error}`);
        return { success: false, message: `Terjadi kesalahan: ${error.message}` };
    }
});

// Handler untuk menghapus folder novel (misal saat proses pembuatan dibatalkan)
ipcMain.handle('delete-novel-folder', async (event, novelTitle) => {
    try {
        const novelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle);
        if (fs.existsSync(novelPath)) {
            fs.rmSync(novelPath, { recursive: true, force: true });
            console.log(`[Main] Folder novel '${novelTitle}' dihapus karena pembatalan.`);
            return { success: true, message: 'Novel yang belum selesai dihapus.' };
        }
        return { success: true, message: 'Folder novel tidak ditemukan, tidak ada yang dihapus.' };
    } catch (error) {
        console.error(`Gagal menghapus folder novel '${novelTitle}':`, error);
        return { success: false, message: `Gagal menghapus folder: ${error.message}` };
    }
});

// ----------------------------------------------- End Buat Visual Novel ----------------------------------------- //

// ------------------------------------------- Get & Update Story Description -------------------------------------- //
// Handler untuk mendapatkan storyDesc dari novel-meta.json
ipcMain.handle('get-story-desc', async (event, novelTitle) => {
    try {
        const metaPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, 'novel-meta.json');
        if (fs.existsSync(metaPath)) {
            const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            return { success: true, storyDesc: metaData.storyDesc || '' };
        }
        return { success: true, storyDesc: '' };
    } catch (error) {
        console.error(`[Main] Gagal membaca storyDesc untuk '${novelTitle}':`, error);
        return { success: false, message: error.message, storyDesc: '' };
    }
});

// Handler untuk memperbarui storyDesc di novel-meta.json
ipcMain.handle('update-story-desc', async (event, { novelTitle, storyDesc }) => {
    try {
        const metaPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, 'novel-meta.json');
        let metaData = {};

        // Baca data yang sudah ada jika file ada
        if (fs.existsSync(metaPath)) {
            metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        }

        // Update storyDesc
        metaData.storyDesc = storyDesc;

        // Tulis kembali ke file
        fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
        console.log(`[Main] storyDesc untuk '${novelTitle}' diperbarui: "${storyDesc}"`);

        return { success: true, message: 'Deskripsi novel berhasil diperbarui!' };
    } catch (error) {
        console.error(`[Main] Gagal memperbarui storyDesc untuk '${novelTitle}':`, error);
        return { success: false, message: `Gagal memperbarui: ${error.message}` };
    }
});

// ----------------------------------------------------- Edit Novel -----------------------------------------------//
ipcMain.handle('get-hub-details', async (event, novelTitle) => {
    try {
        const hubPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, 'index.html');
        if (!fs.existsSync(hubPath)) {
            return { success: false, message: 'File index.html tidak ditemukan.' };
        }

        const content = fs.readFileSync(hubPath, 'utf-8');

        // Ekstrak Judul dari tag <title>
        const titleMatch = content.match(/<title>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1] : novelTitle;

        // Ekstrak Deskripsi dari dalam <div class="description">
        const descriptionMatch = content.match(/<div class="description">([\s\S]*?)<\/div>/);
        // Ganti <br> kembali menjadi baris baru untuk textarea, dan trim untuk menghilangkan indentasi HTML
        const description = descriptionMatch ? descriptionMatch[1].replace(/<br\s*\/?>/gi, '\n').trim() : '';

        // Ekstrak Genre
        const genreMatch = content.match(/<span class="genre">(.*?)<\/span>/);
        const genre = genreMatch ? genreMatch[1] : '';

        // Ekstrak Author
        const authorMatch = content.match(/<span class="author">(.*?)<\/span>/);
        const author = authorMatch ? authorMatch[1] : '';

        // Ekstrak Illustrator
        const illustratorMatch = content.match(/<span class="illustrator">(.*?)<\/span>/);
        const illustrator = illustratorMatch ? illustratorMatch[1] : '';

        // Ekstrak VN Mapper
        const vnMapperMatch = content.match(/<span class="vn-mapper">(.*?)<\/span>/);
        const vnMapper = vnMapperMatch ? vnMapperMatch[1] : '';

        return { success: true, title, description, genre, author, illustrator, vnMapper };
    } catch (error) {
        return { success: false, message: `Gagal membaca detail hub: ${error.message}` };
    }
});

ipcMain.handle('update-hub-details', async (event, { originalTitle, newTitle, newDescription, newGenre, newAuthor, newIllustrator, newVnMapper }) => {
    try {
        let currentNovelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', originalTitle);
        const hubPath = path.join(currentNovelPath, 'index.html');

        if (!fs.existsSync(hubPath)) {
            return { success: false, message: 'File index.html tidak ditemukan.' };
        }

        // 1: Ubah nama folder jika judulnya berubah
        if (originalTitle !== newTitle) {
            const newNovelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', newTitle);
            if (fs.existsSync(newNovelPath)) {
                return { success: false, message: 'Novel dengan judul baru tersebut sudah ada.' };
            }
            fs.renameSync(currentNovelPath, newNovelPath);
            currentNovelPath = newNovelPath;
            console.log(`[Main] Folder novel diubah dari '${originalTitle}' menjadi '${newTitle}'`);
        }

        // 2: Baca konten HTML
        const finalHubPath = path.join(currentNovelPath, 'index.html');
        let content = fs.readFileSync(finalHubPath, 'utf-8');

        // 3: Ganti judul di dalam tag <title> (untuk tab jendela)
        content = content.replace(/<title>(.*?)<\/title>/, `<title>${newTitle}</title>`);

        // Ganti judul utama yang terlihat di halaman (tag <h1>)
        const h1Regex = /(<h1[^>]*>)([\s\S]*?)(<\/h1>)/;
        content = content.replace(h1Regex, `$1${newTitle}$3`);

        // 4: Ganti deskripsi di dalam <div class="description">
        const descRegex = /(<div class="description">)([\s\S]*?)(<\/div>)/;
        const finalDescription = newDescription.replace(/\n/g, '<br>');
        content = content.replace(descRegex, `$1${finalDescription}$3`);

        // 5: Ganti Genre, Author, Illustrator, VN Mapper
        if (newGenre) content = content.replace(/<span class="genre">.*?<\/span>/, `<span class="genre">${newGenre}</span>`);
        if (newAuthor) content = content.replace(/<span class="author">.*?<\/span>/, `<span class="author">${newAuthor}</span>`);
        if (newIllustrator) content = content.replace(/<span class="illustrator">.*?<\/span>/, `<span class="illustrator">${newIllustrator}</span>`);
        if (newVnMapper) {
            // Cek apakah sudah ada vnMapper di HTML
            if (content.includes('class="vn-mapper"')) {
                content = content.replace(/<span class="vn-mapper">.*?<\/span>/, `<span class="vn-mapper">${newVnMapper}</span>`);
            } else {
                // Tambahkan vnMapper setelah illustrator jika belum ada
                content = content.replace(
                    /(<div><strong>Ilustrator:<\/strong> <span class="illustrator">.*?<\/span><\/div>)/,
                    `$1\n          <div><strong>VN Mapper:</strong> <span class="vn-mapper">${newVnMapper}</span></div>`
                );
            }
        }

        // 6: Tulis kembali file index.html yang sudah diperbarui
        fs.writeFileSync(finalHubPath, content);

        if (mainWindow) {
            mainWindow.webContents.send('hub-html-updated', { novelTitle: newTitle });
        }

        return { success: true, message: 'Detail novel berhasil disimpan!' };
    } catch (error) {
        return { success: false, message: `Gagal menyimpan detail: ${error.message}` };
    }
});

ipcMain.handle('get-global-novel-assets', async (event, novelTitle) => {
    const novelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle);
    const assets = { images: [], audios: [], videos: [] }; // Tambahkan kategori video
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
    const videoExts = ['.mp4', '.webm', '.ogv']; // Definisikan ekstensi video

    try {
        if (!fs.existsSync(novelPath)) return assets;

        const files = fs.readdirSync(novelPath, { withFileTypes: true });
        for (const file of files) {
            if (file.isDirectory()) continue;

            const ext = path.extname(file.name).toLowerCase();
            const fullPath = `file://${path.join(novelPath, file.name).replace(/\\/g, '/')}`;

            if (imageExts.includes(ext)) {
                assets.images.push({ fileName: file.name, relativePath: file.name, fullPath });
            } else if (audioExts.includes(ext)) {
                assets.audios.push({ fileName: file.name, relativePath: file.name, fullPath });
            } else if (videoExts.includes(ext)) { // Tambahkan kondisi untuk video
                assets.videos.push({ fileName: file.name, relativePath: file.name, fullPath });
            }
        }
    } catch (error) {
        console.error(`Gagal memindai aset global untuk ${novelTitle}:`, error);
    }
    return assets;
});

ipcMain.handle('get-chapter-assets', async (event, { novelTitle, chapterName }) => {
    const chapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, chapterName);
    const assets = { images: [], audios: [], videos: [] }; // Tambahkan kategori video
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const audioExts = ['.mp3', '.ogg', '.wav', '.m4a'];
    const videoExts = ['.mp4', '.webm', '.ogv']; // Definisikan ekstensi video

    try {
        if (!fs.existsSync(chapterPath)) return assets;

        const files = fs.readdirSync(chapterPath);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            const relativePath = `${chapterName}/${file}`;
            const fullPath = `file://${path.join(chapterPath, file).replace(/\\/g, '/')}`;

            if (imageExts.includes(ext)) {
                assets.images.push({ fileName: file, relativePath, fullPath });
            } else if (audioExts.includes(ext)) {
                assets.audios.push({ fileName: file, relativePath, fullPath });
            } else if (videoExts.includes(ext)) { // Tambahkan kondisi untuk video
                assets.videos.push({ fileName: file, relativePath, fullPath });
            }
        }
    } catch (error) {
        console.error(`Gagal memindai aset untuk chapter ${chapterName}:`, error);
    }
    return assets;
});

// Handler untuk mengganti nama chapter
ipcMain.handle('rename-chapter', async (event, { novelTitle, oldChapterName, newChapterName }) => {
    try {
        const novelPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle);
        const oldPath = path.join(novelPath, oldChapterName);
        const newPath = path.join(novelPath, newChapterName);

        if (fs.existsSync(newPath)) {
            return { success: false, message: 'Nama chapter tersebut sudah ada.' };
        }
        fs.renameSync(oldPath, newPath);
        return { success: true, message: 'Nama chapter berhasil diubah.' };
    } catch (error) {
        return { success: false, message: `Gagal mengubah nama: ${error.message}` };
    }
});

// Handler untuk menghapus chapter
ipcMain.handle('delete-chapter', async (event, { novelTitle, chapterName }) => {
    try {
        const chapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, chapterName);
        if (fs.existsSync(chapterPath)) {
            fs.rmSync(chapterPath, { recursive: true, force: true });
            return { success: true, message: `Chapter '${chapterName}' berhasil dihapus.` };
        }
        return { success: false, message: 'Chapter tidak ditemukan.' };
    } catch (error) {
        return { success: false, message: `Gagal menghapus chapter: ${error.message}` };
    }
});

ipcMain.handle('get-script-content', async (event, { storyTitle, chapterName }) => {
    const scriptPath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, chapterName, 'script.json');
    try {
        if (fs.existsSync(scriptPath)) {
            const content = fs.readFileSync(scriptPath, 'utf-8');
            return { success: true, data: JSON.parse(content) };
        } else {
            return { success: true, data: [] };
        }
    } catch (error) {
        console.error(`Gagal membaca script.json untuk ${storyTitle}/${chapterName}:`, error);
        return { success: false, message: error.message };
    }
});

ipcMain.handle('open-file-dialog', async (event, { fileType, storyTitle, chapterName }) => {
    let filters = [];
    if (fileType === 'image') {
        filters = [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }];
    } else if (fileType === 'audio') {
        filters = [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a'] }];
    } else if (fileType === 'video') {
        filters = [{ name: 'Video', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov'] }];
    } else if (fileType === 'all-media') {
        filters = [{ name: 'Media (Gambar & Video)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mkv', 'avi', 'mov'] }];
    }

    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            // biar pengguna bebas memilih dari mana saja
            properties: ['openFile'],
            filters: filters
        });

        if (canceled || filePaths.length === 0) {
            return null; // membatalkan, tidak ada yang perlu dilakukan
        }

        const sourcePath = filePaths[0]; // Path lengkap file yang dipilih
        const filename = path.basename(sourcePath);

        // folder tujuan di dalam direktori novel bagian folder cerita.
        const destDir = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, chapterName);
        const destPath = path.join(destDir, filename);

        // Pastikan folder tujuan ada. Jika tidak, buat folder tersebut secara rekursif.
        fs.mkdirSync(destDir, { recursive: true });

        // Salin file dari sumber ke tujuan
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Aset disalin: ${filename} -> ${destDir}`);

        // Kembalikan HANYA nama filenya ke editor, karena alur kerja editor sudah benar
        return filename;

    } catch (error) {
        console.error('Gagal menyalin aset:', error);
        dialog.showErrorBox('Error Menyalin Aset', `Terjadi kesalahan saat mencoba menyalin file. Pastikan Anda memiliki izin yang cukup.\n\nError: ${error.message}`);
        return null;
    }
});

ipcMain.handle('create-new-chapter', async (event, { storyTitle, newChapterName }) => {
    // Validasi nama chapter agar tidak kosong
    if (!newChapterName || !newChapterName.trim()) {
        return { success: false, message: 'Nama chapter tidak boleh kosong.' };
    }

    const newChapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, newChapterName);

    if (fs.existsSync(newChapterPath)) {
        return { success: false, message: `Chapter '${newChapterName}' sudah ada.` };
    }

    try {
        // 1. Buat folder chapter baru
        fs.mkdirSync(newChapterPath, { recursive: true });

        // 2. Buat file script.json kosong
        const scriptPath = path.join(newChapterPath, 'script.json');
        fs.writeFileSync(scriptPath, JSON.stringify([], null, 2), 'utf-8');

        // 3. Baca konten dari file template
        const templatePath = path.join(__dirname, 'vn_player_template.html');
        let templateContent = fs.readFileSync(templatePath, 'utf-8');

        // 4. GANTI PLACEHOLDER DENGAN DATA YANG RELEVAN
        const finalHtmlContent = templateContent
            .replaceAll('{NOVEL_TITLE}', storyTitle)
            .replaceAll('{CHAPTER_NAME}', newChapterName);

        // 5. Tulis konten final ke file index.html di dalam folder chapter
        const indexPath = path.join(newChapterPath, 'index.html');
        fs.writeFileSync(indexPath, finalHtmlContent, 'utf-8');

        console.log(`[Editor] Chapter baru dibuat dari template: ${newChapterPath}`);
        return { success: true, message: `Chapter '${newChapterName}' berhasil dibuat!` };

    } catch (error) {
        console.error('Gagal membuat chapter baru:', error);
        return { success: false, message: `Gagal membuat chapter: ${error.message}` };
    }
});

ipcMain.handle('replace-asset-file', async (event, { novelTitle, relativePath, buffer }) => {
    try {
        const assetPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, relativePath);

        if (!fs.existsSync(path.dirname(assetPath))) {
            return { success: false, message: 'Direktori aset tidak ditemukan.' };
        }

        fs.writeFileSync(assetPath, Buffer.from(buffer));
        console.log(`[Main] Aset berhasil diganti: ${assetPath}`);
        return { success: true, message: `Aset ${path.basename(assetPath)} berhasil diperbarui!` };

    } catch (error) {
        console.error(`Gagal mengganti aset: ${error}`);
        return { success: false, message: `Gagal memperbarui aset: ${error.message}` };
    }
});

ipcMain.handle('open-and-read-file', async (event, { filters }) => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: filters
        });
        if (canceled || filePaths.length === 0) return null;

        const filePath = filePaths[0];
        const buffer = fs.readFileSync(filePath);
        return { name: path.basename(filePath), buffer: buffer };

    } catch (error) {
        console.error('Gagal membuka atau membaca file:', error);
        return null;
    }
});

// Handler untuk menambah file aset baru
ipcMain.handle('add-asset-file', async (event, { novelTitle, chapterName, file }) => {
    try {
        const destDir = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, chapterName);

        let newFileName;
        const extension = path.extname(file.name);

        if (chapterName === '' && ['.mp4', '.webm', '.ogv'].includes(extension.toLowerCase())) {
            newFileName = 'video.mp4';
        } else {
            // Gunakan nama file yang unik untuk semua aset gambar atau aset di dalam chapter
            newFileName = `asset_${Date.now()}${extension}`;
        }

        const destPath = path.join(destDir, newFileName);
        fs.writeFileSync(destPath, Buffer.from(file.buffer));

        // Cek apakah ini adalah gambar global yang perlu ditambahkan ke slideshow hub
        const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        if (chapterName === '' && imageExts.includes(extension.toLowerCase())) {

            // 1. Dapatkan path ke file index.html
            const hubHtmlPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, 'index.html');

            if (fs.existsSync(hubHtmlPath)) {
                console.log(`[Main] Aset gambar global terdeteksi. Memperbarui ${hubHtmlPath}...`);
                let htmlContent = fs.readFileSync(hubHtmlPath, 'utf-8');

                // 2. Buat tag <img> yang baru
                const newImgTag = `<img src="./${newFileName}" alt="Slideshow Image">`;

                // 3. Cari kontainer gambar dan injeksikan tag baru sebelum penutup </div>
                const imageContainerRegex = /(<div class="image-container"[^>]*>)([\s\S]*?)(<\/div>)/;
                if (htmlContent.match(imageContainerRegex)) {
                    // $1: <div...>, $2: konten lama, $3: </div>
                    // Kita sisipkan konten lama, lalu tag baru, lalu penutup div
                    htmlContent = htmlContent.replace(imageContainerRegex, `$1$2\n        ${newImgTag}\n    $3`);

                    // 4. Tulis kembali file index.html yang sudah diperbarui
                    fs.writeFileSync(hubHtmlPath, htmlContent);
                    console.log(`[Main] Berhasil menambahkan ${newFileName} ke slideshow di index.html.`);
                    if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle });
                } else {
                    console.warn(`[Main] Gagal menemukan .image-container di dalam ${hubHtmlPath}.`);
                }
            }
        }
        console.log(`[Main] Aset berhasil ditambahkan/diperbarui: ${newFileName}`);
        return { success: true, message: 'Aset berhasil ditambahkan!' };

    } catch (error) {
        console.error('Gagal menambah aset:', error);
        return { success: false, message: `Gagal menambah aset: ${error.message}` };
    }
});

// Handler untuk menghapus file aset
ipcMain.handle('delete-asset-file', async (event, { novelTitle, relativePath }) => {
    try {
        const assetPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle, relativePath);

        if (fs.existsSync(assetPath)) {
            // Simpan informasi file sebelum dihapus
            const deletedFileExt = path.extname(relativePath).toLowerCase();
            const isGlobalAsset = path.dirname(relativePath) === '.';

            // Hapus file fisik dari sistem
            fs.unlinkSync(assetPath);

            // Cek apakah yang dihapus adalah gambar global yang perlu dibersihkan dari slideshow hub
            const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
            if (isGlobalAsset && imageExts.includes(deletedFileExt)) {

                const novelFolderPath = path.join(__dirname, 'aset', 'game', 'visual_novels', novelTitle);
                const hubHtmlPath = path.join(novelFolderPath, 'index.html');

                if (fs.existsSync(hubHtmlPath)) {
                    console.log(`[Main] Aset gambar global dihapus. Memperbarui ${hubHtmlPath}...`);
                    let htmlContent = fs.readFileSync(hubHtmlPath, 'utf-8');

                    // 2. Buat Regular Expression untuk menemukan tag <img> yang spesifik berdasarkan src-nya
                    // Ini akan mencari sesuatu seperti <img ... src="./asset_12345.jpg" ...> beserta spasi di sekitarnya
                    const imgTagRegex = new RegExp(`<img[^>]*src\\s*=\\s*["']\\.\\/${relativePath}["'][^>]*>\\s*`, 'i');

                    // 3. Hapus tag <img> yang cocok dari konten HTML
                    htmlContent = htmlContent.replace(imgTagRegex, '');

                    // 4. Tulis kembali file index.html yang sudah bersih
                    fs.writeFileSync(hubHtmlPath, htmlContent);
                    console.log(`[Main] Berhasil menghapus referensi ${relativePath} dari index.html.`);
                    if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle });
                }
            }

            console.log(`[Main] Aset berhasil dihapus: ${assetPath}`);
            return { success: true, message: 'Aset berhasil dihapus.' };
        }
        return { success: false, message: 'File tidak ditemukan.' };
    } catch (error) {
        console.error('Gagal menghapus aset:', error);
        return { success: false, message: `Gagal menghapus aset: ${error.message}` };
    }
});


ipcMain.handle('save-script-content', async (event, { storyTitle, chapterName, scriptContent }) => {
    const scriptPath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, chapterName, 'script.json');
    try {
        const content = JSON.stringify(scriptContent, null, 2);
        fs.writeFileSync(scriptPath, content, 'utf-8');
        return { success: true, message: 'Skrip berhasil disimpan!' };
    } catch (error) {
        console.error(`Gagal menyimpan script.json untuk ${storyTitle}/${chapterName}:`, error);
        return { success: false, message: error.message };
    }
});
// ----------------------------------------------------- End Edit Novel -----------------------------------------------//

// ---------------------------------------------------
// yaaa bisa sebut aja engine ini Rin.js , wkwkwkwkkw
// ---------------------------------------------------
// ----------------------------------------------------- Engine Novel -----------------------------------------------//
let currentVNScript = [];
let currentVNIndex = 0;
let currentVNState = {
    backgroundStack: [{ type: null, src: null }],
    bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
    lastSpeaker: null
};
let vnDialogueHistory = [];

function handleJump(target) {
    console.log(`[VN Engine] JUMP diproses. Target: '${target}'`);
    let newIndex = -1;

    // Helper untuk menemukan akhir dari sebuah blok label INDUK
    const findEndOfParentBlock = (startIndex) => {
        let parentName = null;
        for (let i = startIndex; i >= 0; i--) {
            if (currentVNScript[i].type === 'label' && !currentVNScript[i].name.includes('.')) {
                parentName = currentVNScript[i].name;
                break;
            }
        }
        if (!parentName) return startIndex;

        // akan berhenti jika menemukan baris yang BUKAN bagian dari konten label
        const endOfBlockIndex = currentVNScript.findIndex((line, index) => {
            if (index <= startIndex) return false; // Hanya cari setelah posisi saat ini

            switch (line.type) {
                case 'dialogue':
                case 'choice':
                case 'scene':
                case 'jump': // Jump dianggap sebagai konten, bukan akhir blok
                    return false; // Ini adalah konten, jadi lanjutkan pencarian
                case 'label':
                    // Jika ini adalah sub-label, ini adalah konten. Jika bukan, ini akhir dari blok.
                    return !line.name.startsWith(parentName + '.');
                case 'phase': // Phase baru menandakan akhir blok
                    return true;
                default:
                    // Tipe lain yang tidak dikenali dianggap akhir blok
                    return true;
            }
        });
        return endOfBlockIndex !== -1 ? endOfBlockIndex : currentVNScript.length;
    };

    // Helper untuk menemukan akhir dari sebuah blok SUB-LABEL
    const findEndOfSubLabelBlock = (startIndex) => {
        for (let i = startIndex + 1; i < currentVNScript.length; i++) {
            const line = currentVNScript[i];
            if (line.type === 'jump' || (line.type === 'label' && !line.name.includes('.'))) {
                return i; // Akhir dari blok adalah di baris jump/label ini
            }
        }
        return currentVNScript.length;
    };


    // ================== PENANGANAN PERINTAH SPESIAL ==================
    if (target === '##CONTINUE_PARENT##' || target === '##EXIT_SUB_LABEL##') {
        console.log(`[VN Engine] ${target}: Keluar dari blok sub-label.`);
        let endOfSubBlock = findEndOfSubLabelBlock(currentVNIndex);
        // Lanjutkan dari baris SETELAH jump yang mengakhiri sub-label
        newIndex = currentVNScript[endOfSubBlock]?.type === 'jump' ? endOfSubBlock + 1 : endOfSubBlock;

    } else if (target === '##CONTINUE_PARENT_FLOW##') {
        console.log(`[VN Engine] ##CONTINUE_PARENT_FLOW##: Mencari entri selanjutnya di label induk.`);
        let endOfCurrentSubBlock = findEndOfSubLabelBlock(currentVNIndex);
        let searchStartIndex = currentVNScript[endOfCurrentSubBlock]?.type === 'jump' ? endOfCurrentSubBlock + 1 : endOfCurrentSubBlock;
        let parentBlockEnd = findEndOfParentBlock(currentVNIndex);

        for (let i = searchStartIndex; i < parentBlockEnd; i++) {
            const line = currentVNScript[i];
            if (line.type === 'label' && line.name.includes('.')) {
                let end = findEndOfSubLabelBlock(i);
                i = currentVNScript[end]?.type === 'jump' ? end : end - 1;
                continue;
            }
            if (line.type !== 'label' && line.type !== 'jump') {
                newIndex = i;
                break;
            }
        }
        if (newIndex === -1) newIndex = parentBlockEnd;

    } else if (target === '##FINISH_PARENT##' || target === '##EXIT_LABEL##') {
        const endOfBlock = findEndOfParentBlock(currentVNIndex);

        // Cari mundur dari batas blok untuk menemukan "exit jump" terakhir (jump ke fase atau ##)
        // yang merupakan alur keluar normal dari label induk
        let exitJumpIndex = -1;
        for (let i = endOfBlock - 1; i > currentVNIndex; i--) {
            const line = currentVNScript[i];
            // Jangan mundur melewati sub-label lain
            if (line.type === 'label') break;

            if (line.type === 'jump') {
                // Cek apakah ini exit jump (ke fase lain atau command ##)
                if (line.target && (line.target.startsWith('fase:') || line.target.startsWith('##'))) {
                    exitJumpIndex = i;
                    break;
                }
            }
        }

        if (exitJumpIndex !== -1) {
            // Ditemukan exit jump, eksekusi dari sana
            newIndex = exitJumpIndex;
            console.log(`[VN Engine] ${target}: Keluar dari blok. Ditemukan exit jump di index ${exitJumpIndex}, mengeksekusi...`);
        } else {
            // Tidak ada exit jump, lanjut ke setelah blok
            newIndex = endOfBlock;
            console.log(`[VN Engine] ${target}: Keluar dari blok. Melanjutkan dari index ${newIndex}`);
        }

    } else if (target === '##SKIP_ALL_LABEL##') {
        console.log(`[VN Engine] ##SKIP_ALL_LABEL##: Mencari alur utama setelah SEMUA blok label.`);

        // Cari batas fase berikutnya
        const endOfPhaseIndex = currentVNScript.findIndex((line, index) => index > currentVNIndex && line.type === 'phase');
        const searchLimit = (endOfPhaseIndex !== -1) ? endOfPhaseIndex : currentVNScript.length;

        // Kumpulkan semua index label INDUK yang ada di fase ini (setelah posisi saat ini)
        const allParentLabelIndexes = [];
        for (let i = currentVNIndex + 1; i < searchLimit; i++) {
            const line = currentVNScript[i];
            // Label induk adalah label yang namanya tidak mengandung titik
            if (line.type === 'label' && !line.name.includes('.')) {
                allParentLabelIndexes.push(i);
            }
        }

        console.log(`[VN Engine] Ditemukan ${allParentLabelIndexes.length} label induk di fase ini: indexes ${allParentLabelIndexes.join(', ')}`);

        if (allParentLabelIndexes.length === 0) {
            // Tidak ada label induk, langsung cari entri konten pertama setelah posisi saat ini
            for (let i = currentVNIndex + 1; i < searchLimit; i++) {
                const line = currentVNScript[i];
                if (line.type !== 'jump' && line.type !== 'label') {
                    newIndex = i;
                    break;
                }
            }
        } else {
            // Tentukan batas akhir dari LABEL TERAKHIR
            // Batas akhir adalah index dari label induk berikutnya, atau fase berikutnya
            const lastLabelIndex = allParentLabelIndexes[allParentLabelIndexes.length - 1];

            // Cari di mana konten label terakhir berakhir
            // Konten berakhir saat kita menemukan label INDUK baru atau fase baru
            // Atau jika ada entri setelah jump terakhir dari label tersebut
            let contentAfterLastLabel = -1;
            let lastJumpInLabel = -1;

            for (let i = lastLabelIndex + 1; i < searchLimit; i++) {
                const line = currentVNScript[i];

                // Jika menemukan label induk baru, berarti konten label sebelumnya sudah berakhir
                if (line.type === 'label' && !line.name.includes('.')) {
                    break;
                }

                // Jika menemukan sub-label dari label terakhir, skip (masih bagian dari label)
                if (line.type === 'label' && line.name.startsWith(currentVNScript[lastLabelIndex].name + '.')) {
                    continue;
                }

                // Track exit jump dari label
                if (line.type === 'jump') {
                    // Cek apakah jump ini adalah "exit jump" dari label (##FINISH_PARENT##, ##EXIT_LABEL##, atau fase:)
                    if (line.target && (line.target.startsWith('##') || line.target.startsWith('fase:'))) {
                        lastJumpInLabel = i;
                        console.log(`[VN Engine] Exit jump ditemukan di index ${i}: "${line.target}". STOP pencarian.`);
                        // BREAK setelah menemukan exit jump PERTAMA
                        // Karena konten setelah exit jump ini adalah konten DI LUAR label
                        break;
                    }
                }
            }

            // Setelah melewati konten label terakhir, cari entri yang ada DI LUAR label
            // Mulai dari posisi setelah jump terakhir dari label
            const searchStart = lastJumpInLabel !== -1 ? lastJumpInLabel + 1 : lastLabelIndex + 1;

            for (let i = searchStart; i < searchLimit; i++) {
                const line = currentVNScript[i];

                // Jika ini label induk baru, skip keseluruhan label tersebut
                if (line.type === 'label' && !line.name.includes('.')) {
                    // Cari akhir dari label ini
                    let labelEnd = i + 1;
                    for (let j = i + 1; j < searchLimit; j++) {
                        if (currentVNScript[j].type === 'label' && !currentVNScript[j].name.includes('.')) {
                            labelEnd = j;
                            break;
                        }
                        if (currentVNScript[j].type === 'phase') {
                            labelEnd = j;
                            break;
                        }
                        if (currentVNScript[j].type === 'jump' &&
                            (currentVNScript[j].target?.startsWith('##') || currentVNScript[j].target?.startsWith('fase:'))) {
                            labelEnd = j + 1;
                        }
                    }
                    i = labelEnd - 1; // -1 karena loop akan i++
                    continue;
                }

                // Skip jump entries
                if (line.type === 'jump') {
                    continue;
                }

                // Sub-label juga dilewati
                if (line.type === 'label') {
                    continue;
                }

                // Ditemukan entri konten di luar label!
                newIndex = i;
                console.log(`[VN Engine] Ditemukan entri di luar label pada index ${i}: "${line.text || line.type}"`);
                break;
            }
        }

        if (newIndex === -1) {
            console.log(`[VN Engine] Tidak ada entri di luar label. Lanjut ke fase berikutnya.`);
            newIndex = searchLimit;
        }

    } else if (target && target.startsWith('fase:')) {
        const phaseName = target.replace('fase:', '');
        newIndex = currentVNScript.findIndex(d => d.type === 'phase' && d.name === phaseName);
        console.log(`[VN Engine] Mencari fase '${phaseName}'... Ditemukan di index: ${newIndex}`);

    } else if (target) { // Jump ke label biasa
        newIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === target);
        console.log(`[VN Engine] Mencari label '${target}'... Ditemukan di index: ${newIndex}`);
    }

    if (newIndex !== -1) {
        currentVNIndex = newIndex;
    } else {
        console.log(`[VN Engine] Target jump '${target}' tidak ditemukan. Lanjut ke baris berikutnya.`);
        currentVNIndex++;
    }
}

function processAndSendVNUpdate() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Cek kondisi SEBELUM memproses baris.
    // Jika kita sudah berada dalam fase ending DAN baris berikutnya adalah fase baru (atau akhir dari file),
    // berarti cerita sudah benar-benar berakhir.
    if (currentVNState.isInEndingPhase) {
        const nextLine = currentVNScript[currentVNIndex];
        if (!nextLine || nextLine.type === 'phase') {
            console.log(`[VN Engine] Mencapai akhir dari FASE ENDING. Mengirim sinyal end-of-chapter.`);
            mainWindow.webContents.send('vn-engine:end-of-chapter', {
                hasNextChapter: false // Ending tidak memiliki chapter selanjutnya
            });
            return; // Hentikan semua proses lebih lanjut
        }
    }

    if (currentVNIndex >= currentVNScript.length) {
        console.log(`[VN Engine] Mencapai akhir skrip. Index: ${currentVNIndex}. Mengirim sinyal end-of-chapter.`);
        mainWindow.webContents.send('vn-engine:end-of-chapter', {
            hasNextChapter: getNextChapterSync() !== null
        });
        return;
    }

    const currentLine = currentVNScript[currentVNIndex];



    if (currentLine.type === 'phase' || currentLine.type === 'label') {

        if (currentLine.type === 'phase') {
            if (currentLine.isEnding) {
                currentVNState.isInEndingPhase = true;
                console.log(`[VN Engine] Memasuki FASE ENDING: '${currentLine.name}'`);
            } else {
                currentVNState.isInEndingPhase = false;
            }
        }

        if (currentLine.background || currentLine.video) {
            let newBackgroundState = {};
            if (currentLine.background) {
                newBackgroundState = { type: 'image', src: currentLine.background };
                newBackgroundState.mode = currentLine.backgroundMode || 'cover';
            } else if (currentLine.video) {
                newBackgroundState = { type: 'video', src: currentLine.video };
            }
            if (currentLine.type === 'phase') {
                currentVNState.backgroundStack = [newBackgroundState];
            } else {
                const currentState = currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1];
                currentVNState.backgroundStack.push({ ...currentState, ...newBackgroundState });
            }
        }

        if (currentLine.bgm) {
            currentVNState.lastBgmState = {
                src: currentLine.bgm, volume: currentLine.bgmVolume, pan: currentLine.bgmPan,
                delay: currentLine.bgmDelay, loop: currentLine.bgmLoop, fade: currentLine.bgmFade
            };
        }

        // Jika ini adalah label yang mengubah aset visual (background/video)
        if (currentLine.type === 'label' && (currentLine.background || currentLine.video)) {
            // Tentukan efeknya: gunakan yang ada di script, atau 'cut' (instan) jika tidak ada.
            const effect = currentLine.transition || 'cut';

            const payload = {
                bgm: currentVNState.lastBgmState?.src,
                background: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.src,
                video: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.type === 'video' ? currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1].src : null,
                backgroundMode: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.mode
            };

            console.log(`[VN Engine] Label dengan aset terdeteksi. Mengirim transisi '${effect}'...`);
            mainWindow.webContents.send('vn-engine:execute-transition', {
                effect: effect,
                payload: payload
            });
            // HENTIKAN eksekusi di sini dan tunggu player merespons.
            return;
        }

        currentVNIndex++;
        processAndSendVNUpdate();
        return;
    }

    if (currentLine.type === 'jump') {
        handleJump(currentLine.target);
        processAndSendVNUpdate();
        return;
    }

    const payload = { ...currentLine };

    // Cek apakah ada flag dari baris SEBELUMNYA
    if (currentVNState.skipNextTransitionIn) {
        console.log(`%c[VN Engine] Mendeteksi ini adalah transisi 'in' berantai. Menandai payload...`, 'color: #FFD700');
        // Tandai payload ini agar player tahu
        // untuk MELEWATI bagian "Fade To Color" dari animasinya.
        payload.isChainedTransition = true;

        // Reset flag SETELAH digunakan agar tidak terbawa ke payload berikutnya
        delete currentVNState.skipNextTransitionIn;
    }

    if (!payload.bgm && currentVNState.lastBgmState) {
        payload.bgm = currentVNState.lastBgmState.src;
        if (payload.bgmVolume === undefined) payload.bgmVolume = currentVNState.lastBgmState.volume;
        if (payload.bgmPan === undefined) payload.bgmPan = currentVNState.lastBgmState.pan;
        if (payload.bgmDelay === undefined) payload.bgmDelay = currentVNState.lastBgmState.delay;
        if (payload.bgmLoop === undefined) payload.bgmLoop = currentVNState.lastBgmState.loop;
        if (payload.bgmFade === undefined) payload.bgmFade = currentVNState.lastBgmState.fade;
    }

    const currentBackgroundDefault = currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1];
    if (currentBackgroundDefault) {
        if (currentBackgroundDefault.type === 'image' && !payload.background) {
            payload.background = currentBackgroundDefault.src;
            payload.backgroundMode = currentBackgroundDefault.mode;
        } else if (currentBackgroundDefault.type === 'video' && !payload.video) {
            payload.video = currentBackgroundDefault.src;
        }
    }

    if (currentLine.speaker) currentVNState.lastSpeaker = currentLine.speaker;
    else payload.speaker = currentVNState.lastSpeaker;

    const shouldPersist = currentLine.type === 'dialogue' || (currentLine.type === 'scene' && currentLine.persistBackground !== false);
    if (shouldPersist) {
        let newState = {};
        if (currentLine.background) {
            // kita juga menyimpan 'mode' ke dalam state
            newState = {
                type: 'image',
                src: currentLine.background,
                mode: currentLine.backgroundMode || 'cover' // Ambil mode dari data, atau default ke 'cover'
            };
        } else if (currentLine.video) {
            newState = { type: 'video', src: currentLine.video };
        }

        if (newState.type) {
            currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1] = newState;
        }
    }

    // Cek jika baris SAAT INI adalah 'scene' yang punya transisi 'out'
    if (currentLine.type === 'scene' && currentLine.transitionOut && currentLine.persistBackground === false) {

        // "Intip" baris BERIKUTNYA
        const nextLine = currentVNScript[currentVNIndex + 1];

        // Cek apakah baris berikutnya ada, juga 'scene', dan punya transisi 'in' (bukan 'cut' atau 'none')
        const hasNextTransition = nextLine && nextLine.type === 'scene' &&
            nextLine.transition && nextLine.transition !== 'cut';

        if (hasNextTransition) {
            console.log(`%c[VN Engine] Look-ahead terpicu! ${currentLine.transitionOut} akan disambung ${nextLine.transition}`, 'color: #FFD700');
            // Selalu atur flag dan kirim data, apapun nama transisinya
            currentVNState.skipNextTransitionIn = true;
            payload.nextTransition = nextLine.transition;
        }
    }

    console.log(`\n--- [VN ENGINE TICK] ---`);
    console.log(`> Index Diproses: ${currentVNIndex}`);
    console.log(`> Payload Final Dikirim:`, payload);
    console.log(`------------------------\n`);

    mainWindow.webContents.send('vn-engine:update-display', payload);

    if ((currentLine.type === 'dialogue' || currentLine.type === 'choice') && payload.text) {
        vnDialogueHistory.push({ speaker: payload.speaker || "Narasi", text: payload.text });
    }
}

// Helper sinkron untuk memeriksa chapter selanjutnya (dipakai di akhir chapter)
function getNextChapterSync() {
    if (!currentStoryTitle || !currentChapter) return null;
    const chaptersResponse = getChapterListData(currentStoryTitle);
    const mainChapters = chaptersResponse.mainChapters.sort((a, b) => {
        const getNumber = (name) => {
            if (name.toLowerCase().includes('prolog')) return 0;
            const match = name.match(/\d+/);
            return match ? parseInt(match[0], 10) : Infinity;
        };
        return getNumber(a) - getNumber(b);
    });
    const currentIndex = mainChapters.indexOf(currentChapter);
    if (currentIndex > -1 && currentIndex < mainChapters.length - 1) {
        return mainChapters[currentIndex + 1];
    }
    return null;
}


// 1. Renderer memberi tahu bahwa ia siap menerima data
ipcMain.on('vn-engine:ready', () => {
    console.log('[VN Engine] Renderer is ready. Sending first line.');

    // Cek apakah sedang dalam mode preview label
    if (isLabelPreviewMode) {
        console.log('[VN Engine] Mode Preview Label aktif, menggunakan processPreviewLabelUpdate.');
        processPreviewLabelUpdate();
    } else {
        processAndSendVNUpdate();
    }
});

// --- SAVE & LOAD SYSTEM ---
ipcMain.on('vn-engine:save-game', (event, { slotId, previewType, previewImage }) => {
    if (!currentStoryTitle || !currentChapter) return;

    const saveDir = path.join(__dirname, 'aset', 'game', 'visual_novels', currentStoryTitle, 'saves');
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    const savePath = path.join(saveDir, `save_slot_${slotId}.json`);
    const saveData = {
        storyTitle: currentStoryTitle,
        chapter: currentChapter,
        index: currentVNIndex,
        history: vnDialogueHistory,
        state: currentVNState,
        timestamp: new Date().toISOString(),
        previewType: previewType || 'image',
        previewImage: previewImage || ''
    };

    try {
        fs.writeFileSync(savePath, JSON.stringify(saveData, null, 2));
        console.log(`[Main] Game saved to ${savePath}`);
        // Kirim konfirmasi balik ke renderer jika perlu
        event.sender.send('vn-engine:save-success', slotId);
    } catch (err) {
        console.error('[Main] Failed to save game:', err);
    }
});

ipcMain.on('vn-engine:load-game', (event, { slotId }) => {
    if (!currentStoryTitle) return;

    const savePath = path.join(__dirname, 'aset', 'game', 'visual_novels', currentStoryTitle, 'saves', `save_slot_${slotId}.json`);

    if (fs.existsSync(savePath)) {
        try {
            const saveData = JSON.parse(fs.readFileSync(savePath, 'utf-8'));

            // Restore state
            currentStoryTitle = saveData.storyTitle;
            currentChapter = saveData.chapter;
            currentVNIndex = saveData.index;
            vnDialogueHistory = saveData.history || [];
            currentVNState = saveData.state || {};

            console.log(`[Main] Loading game: ${currentStoryTitle} - ${currentChapter} at index ${currentVNIndex}`);

            // Reload script and HTML
            const chapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', currentStoryTitle, currentChapter);
            const scriptPath = path.join(chapterPath, 'script.json');
            const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            currentVNScript = JSON.parse(scriptContent);

            mainWindow.loadFile(path.join(chapterPath, 'index.html'));

        } catch (err) {
            console.error('[Main] Failed to load game:', err);
        }
    } else {
        console.log('[Main] No save file found.');
    }
});

ipcMain.handle('vn-engine:get-save-slots', (event, storyTitle) => {
    const targetTitle = storyTitle || currentStoryTitle;
    if (!targetTitle) return [];

    const saveDir = path.join(__dirname, 'aset', 'game', 'visual_novels', targetTitle, 'saves');
    if (!fs.existsSync(saveDir)) return [];

    const slots = [];
    const files = fs.readdirSync(saveDir).filter(f => f.startsWith('save_slot_') && f.endsWith('.json'));

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(saveDir, file), 'utf-8');
            const data = JSON.parse(content);
            const slotId = parseInt(file.replace('save_slot_', '').replace('.json', ''));

            let previewImage = null;
            let previewType = 'image'; // Default type

            if (data.state && data.state.backgroundStack && data.state.backgroundStack.length > 0) {
                const lastBg = data.state.backgroundStack[data.state.backgroundStack.length - 1];
                if (lastBg && lastBg.src) {
                    previewImage = lastBg.src;
                    // Deteksi tipe jika tersedia di state, atau tebak dari ekstensi
                    if (lastBg.type) {
                        previewType = lastBg.type;
                    } else {
                        const lowerSrc = lastBg.src.toLowerCase();
                        if (lowerSrc.endsWith('.mp4') || lowerSrc.endsWith('.webm')) {
                            previewType = 'video';
                        }
                    }
                }
            }

            slots.push({
                slotId: slotId,
                timestamp: data.timestamp,
                chapter: data.chapter,
                previewImage: previewImage,
                previewType: previewType,
                storyTitle: data.storyTitle
            });
        } catch (e) {
            console.error('Error reading save slot', file, e);
        }
    }
    return slots.sort((a, b) => a.slotId - b.slotId);
});

ipcMain.on('vn-engine:load-game-from-hub', (event, { storyTitle, slotId }) => {
    const savePath = path.join(__dirname, 'aset', 'game', 'visual_novels', storyTitle, 'saves', `save_slot_${slotId}.json`);
    if (fs.existsSync(savePath)) {
        try {
            const saveData = JSON.parse(fs.readFileSync(savePath, 'utf-8'));

            currentStoryTitle = saveData.storyTitle;
            currentChapter = saveData.chapter;
            currentVNIndex = saveData.index;
            vnDialogueHistory = saveData.history || [];
            currentVNState = saveData.state || {};

            console.log(`[Main] Loading game from hub: ${currentStoryTitle} - ${currentChapter}`);

            const chapterPath = path.join(__dirname, 'aset', 'game', 'visual_novels', currentStoryTitle, currentChapter);
            const scriptPath = path.join(chapterPath, 'script.json');
            const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
            currentVNScript = JSON.parse(scriptContent);

            mainWindow.loadFile(path.join(chapterPath, 'index.html'));

        } catch (err) {
            console.error('[Main] Failed to load game from hub:', err);
        }
    }
});

// 2. Renderer meminta baris/dialog selanjutnya (setelah user klik)
ipcMain.on('vn-engine:request-next-line', () => {
    // Jika dalam mode preview label, gunakan handler khusus
    if (isLabelPreviewMode) {
        if (currentVNState.pendingJump) {
            const target = currentVNState.pendingJump;
            delete currentVNState.pendingJump;
            // Di mode preview, jump sederhana: cari target di skrip preview
            const targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === target);
            if (targetIndex !== -1) {
                currentVNIndex = targetIndex;
            } else {
                currentVNIndex++;
            }
        } else {
            currentVNIndex++;
        }
        processPreviewLabelUpdate();
        return;
    }

    if (currentVNState.pendingJump) {
        const target = currentVNState.pendingJump;
        delete currentVNState.pendingJump;
        // Panggil fungsi terpusat yang baru
        handleJump(target);
    } else {
        currentVNIndex++;
    }
    processAndSendVNUpdate();
});

// 3. Renderer mengirim pilihan yang dibuat user
ipcMain.on('vn-engine:choice-made', (event, choice) => {
    // Jika dalam mode preview label, gunakan handler khusus
    if (isLabelPreviewMode) {
        const originalChoiceLine = currentVNScript[currentVNIndex];

        // Guard: pastikan originalChoiceLine ada
        if (!originalChoiceLine) {
            console.error('[Preview Label] originalChoiceLine tidak ditemukan!');
            currentVNIndex++;
            processPreviewLabelUpdate();
            return;
        }

        if (choice.setVariable) {
            currentVNState[choice.setVariable.name] = choice.setVariable.value;
        }

        // Handle autoDialogue di mode preview
        if (originalChoiceLine.autoDialogue && choice.text) {
            const autoDialoguePayload = {
                type: 'dialogue',
                text: choice.text,
                bgm: currentVNState.lastBgmState?.src,
                bgmVolume: currentVNState.lastBgmState?.volume,
                background: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.src,
                backgroundMode: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.mode,
                sprite: originalChoiceLine.sprite,
                sprite2: originalChoiceLine.sprite2,
                spriteCenter: originalChoiceLine.spriteCenter,
                charSprites: originalChoiceLine.charSprites,
                isPreview: true,
                isLabelPreview: true
            };

            if (originalChoiceLine.autoDialogue === 'character' && currentVNState.lastSpeaker) {
                autoDialoguePayload.speaker = currentVNState.lastSpeaker;
            }

            if (autoDialoguePayload.speaker) {
                vnDialogueHistory.push({ speaker: autoDialoguePayload.speaker, text: autoDialoguePayload.text });
            }

            previewWindow.webContents.send('vn-engine:update-display', autoDialoguePayload);
            currentVNState.pendingJump = choice.jump;
            return;
        }

        // Handle jump dari choice di mode preview
        if (choice.jump) {
            const targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === choice.jump);
            if (targetIndex !== -1) {
                currentVNIndex = targetIndex;
            } else {
                console.log('[Preview Label] Jump target tidak ada di skrip preview, lanjut ke entri berikutnya');
                currentVNIndex++;
            }
        } else {
            currentVNIndex++;
        }

        processPreviewLabelUpdate();
        return;
    }

    // === Handler normal untuk game biasa ===
    const originalChoiceLine = currentVNScript[currentVNIndex];

    if (choice.setVariable) {
        currentVNState[choice.setVariable.name] = choice.setVariable.value;
    }

    if (originalChoiceLine.autoDialogue && choice.text) {
        const autoDialoguePayload = {
            type: 'dialogue',
            text: choice.text,
            bgm: currentVNState.lastBgmState?.src, // Ambil BGM dari state terakhir
            bgmVolume: currentVNState.lastBgmState?.volume, // Ambil Volume dari state terakhir

            background: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.src, // Ambil dari stack
            backgroundMode: currentVNState.backgroundStack[currentVNState.backgroundStack.length - 1]?.mode, // Ambil mode juga

            // kode sementara yang ada buat dev biar tetep bisa (sprite, sprite2, spriteCenter) di build sebelumnya ===
            sprite: originalChoiceLine.sprite, // Sprite dari baris choice asli
            sprite2: originalChoiceLine.sprite2, // Sprite 2 dari baris choice asli
            spriteCenter: originalChoiceLine.spriteCenter, // Sprite Tengah dari baris choice asli
            spriteAnim: originalChoiceLine.spriteAnim,
            sprite2Anim: originalChoiceLine.sprite2Anim,
            spriteCenterAnim: originalChoiceLine.spriteCenterAnim,
            spriteScale: originalChoiceLine.spriteScale,
            sprite2Scale: originalChoiceLine.sprite2Scale,
            spriteCenterScale: originalChoiceLine.spriteCenterScale,

            // === MULTI-SPRITE SYSTEM (charSprites array) ===
            // Jika choice asli memiliki charSprites, teruskan
            charSprites: originalChoiceLine.charSprites
        };

        if (originalChoiceLine.autoDialogue === 'character' && currentVNState.lastSpeaker) {
            autoDialoguePayload.speaker = currentVNState.lastSpeaker;
        }

        if (autoDialoguePayload.speaker) {
            vnDialogueHistory.push({ speaker: autoDialoguePayload.speaker, text: autoDialoguePayload.text });
        }

        mainWindow.webContents.send('vn-engine:update-display', autoDialoguePayload);

        currentVNState.pendingJump = choice.jump;
        return;
    }
    if (choice.jump) {
        // Jika jump adalah perintah khusus, serahkan ke handleJump
        if (choice.jump.startsWith('##')) {
            handleJump(choice.jump);
        } else {
            // Jika bukan, cari sebagai label atau fase biasa
            let targetIndex = currentVNScript.findIndex(d => d.type === 'label' && d.name === choice.jump);
            if (targetIndex === -1) {
                targetIndex = currentVNScript.findIndex(d => d.type === 'phase' && d.name === choice.jump);
            }

            if (targetIndex !== -1) {
                currentVNIndex = targetIndex;
            } else {
                console.error(`[VN Engine] Target jump dari pilihan (label atau fase) '${choice.jump}' tidak ditemukan.`);
                currentVNIndex++;
            }
        }
    } else {
        currentVNIndex++;
    }
    processAndSendVNUpdate();
});

// 4. Renderer meminta riwayat dialog
ipcMain.handle('vn-engine:get-history', async () => {
    return vnDialogueHistory;
});

// 5. Renderer meminta untuk mengulang chapter
ipcMain.on('vn-engine:replay-chapter', () => {
    console.log('[VN Engine] Menerima permintaan untuk mengulang chapter. Mereset state...');
    // Reset semua variabel state ke kondisi awal
    currentVNIndex = 0;
    currentVNState = {
        backgroundStack: [{ type: null, src: null }],
        bgmState: { src: null, volume: undefined },
        lastSpeaker: null
    };
    vnDialogueHistory = [];

    // Mulai lagi dari baris pertama
    processAndSendVNUpdate();
});
// ----------------------------------------------------- End Engine Novel -----------------------------------------------//


// ---------------------------------------
// End Visual Novel
// ---------------------------------------

ipcMain.on('set-rpc-enabled', (event, enabled) => {
    if (isRpcEnabled === enabled) return;

    isRpcEnabled = enabled;
    userSettings.rpcEnabled = enabled;
    console.log(`[RPC] Fitur diatur ke: ${isRpcEnabled}`);

    scheduleSaveUserSettings();

    if (isRpcEnabled) {
        initRPC();
    } else {
        destroyRPC(true);
    }
});

app.on('before-quit', () => {
    if (snowWindow) {
        snowWindow.destroy();
    }
    if (miniPlayerWindow) {
        miniPlayerWindow.destroy();
    }
    if (adSkipperWindow) {
        adSkipperWindow.destroy();
    }

    if (rpc) {
        rpc.destroy();
    }
});