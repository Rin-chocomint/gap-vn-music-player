// ================================ ( Pengaturan User ) ================================ //

// Fungsi ini perlu diakses dari DOMContentLoaded dan juga dari ipcRenderer.invoke().then()
function applyWallpaperStyles() {
    const darkness = sessionStorage.getItem("savedDarkness") || 30;
    const blur = sessionStorage.getItem("savedBlur") || 0;
    const grayscale = sessionStorage.getItem("savedGrayscale") || 0;
    const zoom = sessionStorage.getItem("savedZoom") || 1;

    const filterValue = `brightness(${100 - darkness}%) blur(${blur}px) grayscale(${grayscale}%)`;
    const transformValue = `scale(${zoom})`;

    const wallpaperVideo = document.getElementById("character-background");
    const wallpaperImage = document.getElementById("character-background-image");

    if (wallpaperVideo) {
        wallpaperVideo.style.filter = filterValue;
        wallpaperVideo.style.transform = transformValue;
    }
    if (wallpaperImage) {
        wallpaperImage.style.filter = filterValue;
        wallpaperImage.style.transform = transformValue;
    }
}

// Menerapkan tema/skin GUI ke #main-menu secara live.
// 'default' (atau kosong) = tanpa kelas tema; id lain -> kelas .theme-<id>.
// CSS tema di renderer/screens/themes/<id>.css. Dipanggil saat boot (load-settings)
// dan saat dropdown #gui-theme-select berubah.
function applyGuiTheme(id) {
    const mainMenu = document.getElementById('main-menu');
    if (!mainMenu) return;
    // Buang kelas theme-* yang ada, lalu pasang yang baru (kecuali 'default').
    mainMenu.className = mainMenu.className
        .split(/\s+/)
        .filter(cls => cls && !cls.startsWith('theme-'))
        .join(' ');
    if (id && id !== 'default') {
        mainMenu.classList.add('theme-' + id);
    }
}

// Fungsi menerapkan volume global ke semua elemen audio/video
function applyGlobalVolume(volume) {
    document.querySelectorAll('audio').forEach(audioEl => {
        audioEl.volume = volume;
    });
    document.querySelectorAll('video').forEach(videoEl => {
        videoEl.volume = volume;
    });
    const volumeSlider = document.getElementById("volume-slider");
    if (volumeSlider) {
        volumeSlider.value = volume;
    }
    const webview = document.getElementById('external-webview');
    if (webview && typeof webview.getWebContentsId === 'function') {
        try {
            webview.send('set-webview-volume', volume);
        } catch (e) {
            console.warn('[Volume] Webview belum siap untuk menerima volume:', e.message);
        }
    }
    console.log(`Renderer menerapkan volume global: ${volume}`);
}

//------------------- ( inisialisasi & load saat DOM ready ) -------------------------//
document.addEventListener("DOMContentLoaded", () => {
    const volumeSlider = document.getElementById("volume-slider");
    const wallpaperSelect = document.getElementById("wallpaper-name");

    // Get elements from the hidden wallpaper settings panel
    const followMusicCheckboxHidden = document.getElementById("follow-music-title");
    const darknessSliderHidden = document.getElementById("wallpaper-darkness");
    const blurSliderHidden = document.getElementById("wallpaper-blur");
    const grayscaleSliderHidden = document.getElementById("wallpaper-grayscale");
    const zoomSliderHidden = document.getElementById("wallpaper-zoom");
    const autoChangeCheckboxHidden = document.getElementById("auto-change-wallpaper");
    const autoChangeIntervalInputHidden = document.getElementById("auto-change-interval");
    const randomOrderCheckboxHidden = document.getElementById("random-wallpaper-order");
    const wallpaperSettingsPanel = document.getElementById('wallpaper-settings');

    // Get elements from the options modal wallpaper pane
    const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
    const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
    const optionsPaneBlurSlider = document.querySelector('#wallpaper-options-pane .wallpaper-blur');
    const optionsPaneGrayscaleSlider = document.querySelector('#wallpaper-options-pane .wallpaper-grayscale');
    const optionsPaneZoomSlider = document.querySelector('#wallpaper-options-pane .wallpaper-zoom');
    const optionsPaneAutoChangeCheckbox = document.querySelector('#wallpaper-options-pane .auto-change-wallpaper');
    const optionsPaneAutoChangeIntervalInput = document.querySelector('#wallpaper-options-pane .auto-change-interval');
    const optionsPaneRandomOrderCheckbox = document.querySelector('#wallpaper-options-pane .random-wallpaper-order');
    const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings');

    const snowEffectCheckbox = document.getElementById('snow-effect-checkbox');
    const miniPlayerEffectCheckbox = document.getElementById('mini-player-effect-checkbox');

    const guiThemeSelect = document.getElementById('gui-theme-select');

    const adSkipperMainCheckbox = document.getElementById('enable-ad-skipper-checkbox');
    const adSkipperSubBox = document.getElementById('ad-skipper-sub-options');
    const autoMuteCheckbox = document.getElementById('auto-mute-ads-checkbox');
    const autoSkipCheckbox = document.getElementById('auto-skip-ads-checkbox');

    // GIF Overlay elements
    const enableGifOverlayCheckbox = document.getElementById('enable-gif-overlay-checkbox');
    const gifOverlaySubOptions = document.getElementById('gif-overlay-sub-options');
    const addGameGifBtn = document.getElementById('game-add-gif-btn');
    const gameGifListContainer = document.getElementById('game-gif-list-container');
    const gameGifInteractionLock = document.getElementById('game-gif-interaction-lock');
    const gameGifSettingsModal = document.getElementById('game-gif-settings-modal');

    // Preset GIF elements untuk Game Mode
    const gameGifPresetSelect = document.getElementById('game-gif-preset-select');
    const gameGifPresetApplyBtn = document.getElementById('game-gif-preset-apply-btn');
    let gamePresetsList = []; // Daftar preset untuk game mode

    // State untuk GIF Overlay di Game mode
    let gameGifSettingsMap = new Map(); // Map<overlayId, {condition, value, opacity, rotation, hideOnCursor}>
    let gameCurrentMusicInfo = { title: '', artist: '', isPlaying: false };
    let gameGifUIRestored = false;

    // Ambil pengaturan yang tersimpan jika ada
    if (sessionStorage.getItem("savedVolume")) {
        volumeSlider.value = sessionStorage.getItem("savedVolume");
        document.getElementById("background-audio").volume = parseFloat(sessionStorage.getItem("savedVolume"));
    }

    if (sessionStorage.getItem("savedWallpaper")) {
        wallpaperSelect.textContent = `Current: ${sessionStorage.getItem("savedWallpaper")}`;
    }

    // applyWallpaperStyles dipindah ke file-level scope (atas file) agar bisa diakses dari .then()

    if (sessionStorage.getItem("savedDarkness")) {
        const savedDarknessValue = sessionStorage.getItem("savedDarkness");
        if (darknessSliderHidden) darknessSliderHidden.value = savedDarknessValue;
        if (optionsPaneDarknessSlider) optionsPaneDarknessSlider.value = savedDarknessValue;
    }
    if (sessionStorage.getItem("savedBlur")) {
        const savedBlurValue = sessionStorage.getItem("savedBlur");
        if (blurSliderHidden) blurSliderHidden.value = savedBlurValue;
        if (optionsPaneBlurSlider) optionsPaneBlurSlider.value = savedBlurValue;
    }
    if (sessionStorage.getItem("savedGrayscale")) {
        const savedGrayscaleValue = sessionStorage.getItem("savedGrayscale");
        if (grayscaleSliderHidden) grayscaleSliderHidden.value = savedGrayscaleValue;
        if (optionsPaneGrayscaleSlider) optionsPaneGrayscaleSlider.value = savedGrayscaleValue;
    }
    if (sessionStorage.getItem("savedZoom")) {
        const savedZoomValue = sessionStorage.getItem("savedZoom");
        if (zoomSliderHidden) zoomSliderHidden.value = savedZoomValue;
        if (optionsPaneZoomSlider) optionsPaneZoomSlider.value = savedZoomValue;
    }

    if (sessionStorage.getItem("savedAutoChangeWallpaper") === "true") {
        if (autoChangeCheckboxHidden) autoChangeCheckboxHidden.checked = true;
        if (optionsPaneAutoChangeCheckbox) optionsPaneAutoChangeCheckbox.checked = true;
        startAutoChangeWallpaper();
    }
    if (sessionStorage.getItem("savedAutoChangeInterval")) {
        const savedInterval = sessionStorage.getItem("savedAutoChangeInterval");
        if (autoChangeIntervalInputHidden) autoChangeIntervalInputHidden.value = savedInterval;
        if (optionsPaneAutoChangeIntervalInput) optionsPaneAutoChangeIntervalInput.value = savedInterval;
    }
    if (sessionStorage.getItem("savedRandomWallpaperOrder") === "true") {
        if (randomOrderCheckboxHidden) randomOrderCheckboxHidden.checked = true;
        if (optionsPaneRandomOrderCheckbox) optionsPaneRandomOrderCheckbox.checked = true;
    }

    applyWallpaperStyles();

    if (sessionStorage.getItem("savedFollowMusic") === "true") {
        if (followMusicCheckboxHidden) followMusicCheckboxHidden.checked = true;
        if (optionsPaneFollowMusicCheckbox) optionsPaneFollowMusicCheckbox.checked = true;
    }

    // Memuat dan menerapkan status dari checkbox baru
    const savedEnableHiddenSettings = sessionStorage.getItem("savedEnableHiddenSettings");
    if (savedEnableHiddenSettings !== null) { // Cek dulu apakah ada di sessionStorage
        const isEnabled = savedEnableHiddenSettings === "true";
        if (enableHiddenSettingsCheckbox) enableHiddenSettingsCheckbox.checked = isEnabled;
        // Terapkan pengaturannya segera
        if (wallpaperSettingsPanel) {
            if (isEnabled) {
                wallpaperSettingsPanel.classList.remove('disabled');
            } else {
                wallpaperSettingsPanel.classList.add('disabled');
            }
        }
    } else {
        // Kalau gak ada di sessionStorage, bikin default-nya mati dan simpan
        if (enableHiddenSettingsCheckbox) enableHiddenSettingsCheckbox.checked = false;
        sessionStorage.setItem("savedEnableHiddenSettings", false);
        if (wallpaperSettingsPanel) wallpaperSettingsPanel.classList.add('disabled');
    }

    // Memuat dan menerapkan pengaturan efek salju
    const savedSnowEffect = sessionStorage.getItem('savedSnowEffect');
    if (savedSnowEffect !== null) {
        const isSnowEnabled = savedSnowEffect === 'true';
        if (snowEffectCheckbox) snowEffectCheckbox.checked = isSnowEnabled;
        ipcRenderer.send('set-snow-feature-enabled', isSnowEnabled);
        if (isSnowEnabled) {
            ipcRenderer.send('show-snow-effect');
        } else {
            ipcRenderer.send('hide-snow-effect');
        }
    } else {
        // Bikin default-nya mati kalau gak ada di sessionStorage, terus simpan
        if (snowEffectCheckbox) snowEffectCheckbox.checked = false;
        sessionStorage.setItem('savedSnowEffect', false);
        ipcRenderer.send('set-snow-feature-enabled', false);
        ipcRenderer.send('hide-snow-effect');
    }

    if (adSkipperMainCheckbox) {
        adSkipperMainCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;

            // Toggle tampilan sub-opsi
            if (isEnabled) {
                adSkipperSubBox.classList.add('visible');
            } else {
                adSkipperSubBox.classList.remove('visible');
            }

            // Simpan setting utama
            sessionStorage.setItem('savedAdSkipper', isEnabled);
            // Kita akan kirim ke main process nanti saat tombol Apply ditekan, 
            // atau bisa juga realtime seperti kode sebelumnya.
        });
    }

    function updateAdSkipperRealtime() {
        // Ambil status terbaru dari semua checkbox terkait
        const isSkipperEnabled = document.getElementById('enable-ad-skipper-checkbox').checked;
        const isMuteEnabled = autoMuteCheckbox.checked;
        const isSkipEnabled = autoSkipCheckbox.checked;

        // Kirim ke Main Process Untuk disimpan ke userSettings
        ipcRenderer.send('save-settings', {
            adSkipperEnabled: isSkipperEnabled,
            autoMuteAds: isMuteEnabled,
            autoSkipAds: isSkipEnabled
        });

        // Kirim LANGSUNG ke Webview (Agar efeknya instan tanpa reload)
        const webview = document.getElementById('external-webview');
        if (webview && webview.getWebContentsId()) {
            console.log('[Settings] Mengirim update AdSkipper Realtime ke Webview...');
            webview.send('setting-update', {
                adSkipperEnabled: isSkipperEnabled,
                autoMuteAds: isMuteEnabled,
                autoSkipAds: isSkipEnabled
            });
        }
    }

    // Pasang Listener 'change' agar fungsi di atas jalan setiap kali diklik
    if (autoMuteCheckbox) {
        autoMuteCheckbox.addEventListener('change', updateAdSkipperRealtime);
    }

    if (autoSkipCheckbox) {
        autoSkipCheckbox.addEventListener('change', updateAdSkipperRealtime);
    }

    // yang ini buat return title screen idle
    document.getElementById('idle-return-checkbox').addEventListener('change', (e) => {
        sessionStorage.setItem('savedIdleReturn', e.target.checked);
        ipcRenderer.send('save-settings', { idleReturn: e.target.checked });

        if (e.target.checked) {
            resetIdleTimer();
        } else {
            clearTimeout(idleTimer);
        }
    });

    if (volumeSlider) {
        volumeSlider.addEventListener("input", (e) => {
            const newVolume = parseFloat(e.target.value);
            // Kirim nilai baru ke main process, jangan langsung terapkan di sini
            ipcRenderer.send('set-global-volume', newVolume);
        });
    }

    // --- untuk menerapkan volume global ---
    // applyGlobalVolume dipindah ke file-level scope (atas file) agar bisa diakses dari .then()

    // --- Listener untuk volume siaran dari main.js ---
    ipcRenderer.on('global-volume-changed', (event, volume) => {
        currentGlobalVolume = volume;
        applyGlobalVolume(volume);
    });

    // Wallpaper saat diubah
    wallpaperSelect.addEventListener("change", (e) => {
        sessionStorage.setItem("savedWallpaper", e.target.textContent.replace("Current: ", ""));
    });

    // Pendengar untuk pengaturan wallpaper yang tersembunyi
    if (darknessSliderHidden) {
        darknessSliderHidden.addEventListener("input", (e) => {
            sessionStorage.setItem("savedDarkness", e.target.value);
            ipcRenderer.send("save-settings", { darkness: e.target.value });
            // Biar slider di panel opsi tetap sinkron
            if (optionsPaneDarknessSlider) optionsPaneDarknessSlider.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (blurSliderHidden) {
        blurSliderHidden.addEventListener("input", (e) => {
            sessionStorage.setItem("savedBlur", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperBlur: e.target.value });
            if (optionsPaneBlurSlider) optionsPaneBlurSlider.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (grayscaleSliderHidden) {
        grayscaleSliderHidden.addEventListener("input", (e) => {
            sessionStorage.setItem("savedGrayscale", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperGrayscale: e.target.value });
            if (optionsPaneGrayscaleSlider) optionsPaneGrayscaleSlider.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (zoomSliderHidden) {
        zoomSliderHidden.addEventListener("input", (e) => {
            sessionStorage.setItem("savedZoom", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperZoom: e.target.value });
            if (optionsPaneZoomSlider) optionsPaneZoomSlider.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (autoChangeCheckboxHidden) {
        autoChangeCheckboxHidden.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem("savedAutoChangeWallpaper", isEnabled);
            ipcRenderer.send("save-settings", { autoChangeWallpaper: isEnabled });
            if (optionsPaneAutoChangeCheckbox) optionsPaneAutoChangeCheckbox.checked = isEnabled;

            if (isEnabled) {
                startAutoChangeWallpaper();
            } else {
                stopAutoChangeWallpaper();
            }
        });
    }
    if (autoChangeIntervalInputHidden) {
        autoChangeIntervalInputHidden.addEventListener("change", (e) => {
            const interval = e.target.value;
            sessionStorage.setItem("savedAutoChangeInterval", interval);
            ipcRenderer.send("save-settings", { autoChangeInterval: interval });
            if (optionsPaneAutoChangeIntervalInput) optionsPaneAutoChangeIntervalInput.value = interval;

            if (sessionStorage.getItem("savedAutoChangeWallpaper") === "true") {
                startAutoChangeWallpaper(); // Restart dengan interval baru
            }
        });
    }
    if (randomOrderCheckboxHidden) {
        randomOrderCheckboxHidden.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem("savedRandomWallpaperOrder", isEnabled);
            ipcRenderer.send("save-settings", { randomWallpaperOrder: isEnabled });
            if (optionsPaneRandomOrderCheckbox) optionsPaneRandomOrderCheckbox.checked = isEnabled;
        });
    }

    if (followMusicCheckboxHidden) {
        followMusicCheckboxHidden.addEventListener("change", (e) => {
            sessionStorage.setItem("savedFollowMusic", e.target.checked);
            ipcRenderer.send("save-settings", { followMusic: e.target.checked });
            if (optionsPaneFollowMusicCheckbox) optionsPaneFollowMusicCheckbox.checked = e.target.checked;
        });
    }

    // options modal wallpaper
    if (optionsPaneDarknessSlider) {
        optionsPaneDarknessSlider.addEventListener("input", (e) => {
            sessionStorage.setItem("savedDarkness", e.target.value);
            ipcRenderer.send("save-settings", { darkness: e.target.value });
            if (darknessSliderHidden) darknessSliderHidden.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (optionsPaneBlurSlider) {
        optionsPaneBlurSlider.addEventListener("input", (e) => {
            sessionStorage.setItem("savedBlur", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperBlur: e.target.value });
            if (blurSliderHidden) blurSliderHidden.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (optionsPaneGrayscaleSlider) {
        optionsPaneGrayscaleSlider.addEventListener("input", (e) => {
            sessionStorage.setItem("savedGrayscale", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperGrayscale: e.target.value });
            if (grayscaleSliderHidden) grayscaleSliderHidden.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (optionsPaneZoomSlider) {
        optionsPaneZoomSlider.addEventListener("input", (e) => {
            sessionStorage.setItem("savedZoom", e.target.value);
            ipcRenderer.send("save-settings", { wallpaperZoom: e.target.value });
            if (zoomSliderHidden) zoomSliderHidden.value = e.target.value;
            applyWallpaperStyles();
        });
    }
    if (optionsPaneAutoChangeCheckbox) {
        optionsPaneAutoChangeCheckbox.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem("savedAutoChangeWallpaper", isEnabled);
            ipcRenderer.send("save-settings", { autoChangeWallpaper: isEnabled });
            if (autoChangeCheckboxHidden) autoChangeCheckboxHidden.checked = isEnabled;

            if (isEnabled) {
                startAutoChangeWallpaper();
            } else {
                stopAutoChangeWallpaper();
            }
        });
    }
    if (optionsPaneAutoChangeIntervalInput) {
        optionsPaneAutoChangeIntervalInput.addEventListener("change", (e) => {
            const interval = e.target.value;
            sessionStorage.setItem("savedAutoChangeInterval", interval);
            ipcRenderer.send("save-settings", { autoChangeInterval: interval });
            if (autoChangeIntervalInputHidden) autoChangeIntervalInputHidden.value = interval;

            if (sessionStorage.getItem("savedAutoChangeWallpaper") === "true") {
                startAutoChangeWallpaper(); // Restart 
            }
        });
    }
    if (optionsPaneRandomOrderCheckbox) {
        optionsPaneRandomOrderCheckbox.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem("savedRandomWallpaperOrder", isEnabled);
            ipcRenderer.send("save-settings", { randomWallpaperOrder: isEnabled });
            if (randomOrderCheckboxHidden) randomOrderCheckboxHidden.checked = isEnabled;
        });
    }

    if (optionsPaneFollowMusicCheckbox) {
        optionsPaneFollowMusicCheckbox.addEventListener("change", (e) => {
            sessionStorage.setItem("savedFollowMusic", e.target.checked);
            ipcRenderer.send("save-settings", { followMusic: e.target.checked });
            // Biar checkbox di panel tersembunyi tetap sinkron
            if (followMusicCheckboxHidden) followMusicCheckboxHidden.checked = e.target.checked;
        });
    }

    // Checkbox baru untuk mengaktifkan pengaturan tersembunyi
    if (enableHiddenSettingsCheckbox) {
        enableHiddenSettingsCheckbox.addEventListener("change", (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem("savedEnableHiddenSettings", isEnabled);
            ipcRenderer.send("save-settings", { enableHiddenWallpaperSettings: isEnabled }); // Simpan pengaturan

            if (wallpaperSettingsPanel) {
                if (isEnabled) {
                    wallpaperSettingsPanel.classList.remove('disabled');
                    // Pasang lagi event hover-nya
                    triggerZone.addEventListener('mouseenter', showPanel);
                    triggerZone.addEventListener('mouseleave', hidePanel);
                    wallpaperSettings.addEventListener('mouseenter', showPanel);
                    wallpaperSettings.addEventListener('mouseleave', hidePanel);
                } else {
                    wallpaperSettingsPanel.classList.add('disabled');
                    wallpaperSettingsPanel.classList.remove('show');

                    triggerZone.removeEventListener('mouseenter', showPanel);
                    triggerZone.removeEventListener('mouseleave', hidePanel);
                    wallpaperSettings.removeEventListener('mouseenter', showPanel);
                    wallpaperSettings.removeEventListener('mouseleave', hidePanel);
                }
            }
        });
    }

    if (snowEffectCheckbox) {
        snowEffectCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem('savedSnowEffect', isEnabled);
            ipcRenderer.send('set-snow-feature-enabled', isEnabled);
            ipcRenderer.send('save-settings', { snowFeatureEnabled: isEnabled });
            if (isEnabled) {
                ipcRenderer.send('show-snow-effect');
            } else {
                ipcRenderer.send('hide-snow-effect');
            }
        });
    }

    // GUI Theme dropdown: terapkan live ke #main-menu + simpan pilihan.
    if (guiThemeSelect) {
        guiThemeSelect.addEventListener('change', (e) => {
            const value = e.target.value;
            applyGuiTheme(value);
            sessionStorage.setItem('savedGuiTheme', value);
            ipcRenderer.send('save-settings', { guiTheme: value });
        });
    }

    const savedMiniPlayerEffect = sessionStorage.getItem('savedMiniPlayerEffect');
    if (savedMiniPlayerEffect !== null) {
        const isMiniPlayerEnabled = savedMiniPlayerEffect === 'true';
        if (miniPlayerEffectCheckbox) miniPlayerEffectCheckbox.checked = isMiniPlayerEnabled;
        ipcRenderer.send('set-mini-player-feature-enabled', isMiniPlayerEnabled);
    }

    if (miniPlayerEffectCheckbox) {
        miniPlayerEffectCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem('savedMiniPlayerEffect', isEnabled);
            ipcRenderer.send('set-mini-player-feature-enabled', isEnabled);
            ipcRenderer.send('save-settings', { miniPlayerFeatureEnabled: isEnabled });
        });
    }

    // untuk Hide on Cursor checkbox
    const miniPlayerHideCheckbox = document.getElementById('mini-player-hide-on-cursor');
    console.log('[DEBUG] miniPlayerHideCheckbox element:', miniPlayerHideCheckbox);
    if (miniPlayerHideCheckbox) {
        miniPlayerHideCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            console.log('[DEBUG] Hide on Cursor checkbox changed:', isEnabled);
            ipcRenderer.send('set-mini-player-hide-on-cursor', isEnabled);
            ipcRenderer.send('save-settings', { miniPlayerHideOnCursor: isEnabled });
        });
        console.log('[DEBUG] Hide on Cursor listener attached successfully');
    } else {
        console.warn('[DEBUG] miniPlayerHideCheckbox NOT FOUND!');
    }

    //------------------- ( GIF Overlay Handler untuk Game Mode ) -------------------------//

    // === Fungsi Preset GIF untuk Game Mode ===

    // Muat daftar preset dari main process
    async function loadGamePresetsList() {
        try {
            gamePresetsList = await ipcRenderer.invoke('gif-preset-list');
            console.log(`[Game Mode] Memuat ${gamePresetsList.length} preset GIF`);
            renderGamePresetDropdown();

            // Sync dropdown dengan preset aktif
            try {
                const activeId = await ipcRenderer.invoke('gif-preset-get-active');
                if (gameGifPresetSelect) {
                    gameGifPresetSelect.value = activeId || "";
                    console.log(`[Game Mode] Preset dropdown synced to: ${activeId || 'None'}`);
                }
            } catch (err) {
                console.warn('[Game Mode] Failed to sync active preset:', err);
            }
        } catch (e) {
            console.error('[Game Mode] Gagal memuat daftar preset:', e);
        }
    }

    // Render dropdown preset
    function renderGamePresetDropdown() {
        if (!gameGifPresetSelect) return;
        gameGifPresetSelect.innerHTML = '<option value="">-- Pilih Preset --</option>';

        gamePresetsList.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.presetId;
            option.textContent = `${preset.name} (${preset.overlays.length} GIF)`;
            gameGifPresetSelect.appendChild(option);
        });
    }

    // Terapkan preset yang dipilih
    async function applyGameSelectedPreset() {
        const selectedId = gameGifPresetSelect.value;
        if (!selectedId) {
            alert('Pilih preset terlebih dahulu');
            return;
        }

        const result = await ipcRenderer.invoke('gif-preset-apply', selectedId);
        if (result.success) {
            console.log('[Game Mode] Preset berhasil diterapkan');

            // Reload UI - hapus semua row dan muat ulang dari settings
            gameGifListContainer.innerHTML = '';
            gameGifSettingsMap.clear();

            // Muat settings baru
            const settings = await ipcRenderer.invoke('gif-settings-load');
            if (settings.gifOverlays && Array.isArray(settings.gifOverlays)) {
                settings.gifOverlays.forEach(overlay => {
                    const row = createGameGifInputRow(overlay.id, overlay.path, overlay.settings);
                    gameGifListContainer.appendChild(row);
                });
            }

            if (result.missingFiles && result.missingFiles.length > 0) {
                alert(`Peringatan: ${result.missingFiles.length} file GIF tidak ditemukan dan dilewati.`);
            }
        } else {
            alert(`Gagal menerapkan preset: ${result.error}`);
        }
    }

    // Event listener untuk preset
    if (gameGifPresetApplyBtn) {
        gameGifPresetApplyBtn.addEventListener('click', applyGameSelectedPreset);
    }

    // Muat daftar preset saat startup
    loadGamePresetsList();

    // Fungsi untuk membuat row GIF baru di Game mode
    function createGameGifInputRow(overlayId = null, gifPath = '', settings = null) {
        const row = document.createElement('div');
        row.className = 'game-gif-input-row';
        if (overlayId) row.dataset.overlayId = overlayId.toString();

        const fileName = gifPath ? gifPath.split(/[\\/]/).pop() : '';

        // Cek apakah ada kondisi yang sudah di-set (bukan 'always')
        const hasCondition = settings && settings.condition && settings.condition !== 'always';

        row.innerHTML = `
            <input type="text" class="game-gif-path" value="${fileName}" placeholder="Pilih file media..." readonly />
            <button type="button" class="game-gif-browse-btn" title="Pilih file media">📁</button>
            <button type="button" class="game-gif-settings-btn${hasCondition ? ' has-condition' : ''}" title="Pengaturan Media Overlay">⚙️</button>
            <button type="button" class="game-gif-remove-btn" title="Hapus Media Overlay">✕</button>

        `;

        // Simpan settings ke map jika ada
        const keyId = overlayId ? overlayId.toString() : null;
        if (keyId && settings) {
            gameGifSettingsMap.set(keyId, settings);
            console.log(`[GIF Overlay] Stored settings for overlay #${keyId}:`, settings);
        }

        // Handler tombol browse - dengan copy ke folder internal
        row.querySelector('.game-gif-browse-btn').addEventListener('click', async () => {
            const result = await ipcRenderer.invoke('gif-overlay-browse-file');
            if (result && result.filePath) {
                // Copy file ke folder internal aplikasi
                const importResult = await ipcRenderer.invoke('gif-overlay-import-file', result.filePath);

                if (!importResult.success) {
                    console.error('[GIF Overlay] Gagal mengimport file:', importResult.error);
                    alert(`Gagal mengimport file: ${importResult.error}`);
                    return;
                }

                // Tampilkan peringatan jika file besar (hanya log, tidak memblokir)
                if (importResult.warning) {
                    console.warn(`[GIF Overlay] ${importResult.warning}`);
                }

                const internalPath = importResult.internalPath;
                const mediaType = importResult.mediaType || 'gif';
                const newFileName = internalPath.split(/[\\/]/).pop();
                row.querySelector('.game-gif-path').value = newFileName;

                // Jika belum punya overlayId, buat overlay baru
                if (!row.dataset.overlayId) {
                    // Kirim payload lengkap (bukan sekadar string path) agar mediaType terdeteksi
                    const newOverlayId = await ipcRenderer.invoke('create-new-gif-overlay', {
                        path: internalPath,
                        sourcePath: internalPath,
                        mediaType,
                        settings: { mediaType }
                    });
                    if (newOverlayId) {
                        row.dataset.overlayId = newOverlayId.toString();
                        // Inisialisasi settings default (sertakan mediaType)
                        gameGifSettingsMap.set(newOverlayId.toString(), { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false, mediaType });
                    }
                } else {
                    // Update path overlay yang sudah ada — sertakan sourcePath & mediaType
                    ipcRenderer.send('set-gif-overlay-image-by-id', { id: parseInt(row.dataset.overlayId), path: internalPath, sourcePath: internalPath, mediaType });
                    // Simpan mediaType ke settings map agar tidak hilang saat disimpan
                    const savedForExisting = gameGifSettingsMap.get(row.dataset.overlayId) || gameGifSettingsMap.get(row.dataset.overlayId.toString()) || {};
                    savedForExisting.mediaType = mediaType;
                    gameGifSettingsMap.set(row.dataset.overlayId.toString(), savedForExisting);
                }
            }
        });

        // Handler tombol settings (⚙️)
        row.querySelector('.game-gif-settings-btn').addEventListener('click', (e) => {
            e.stopPropagation();  // Mencegah event bubbling
            console.log('[GIF Settings] Button diklik, membuka modal...');
            openGameGifSettingsModal(row);
        });

        // Handler tombol hapus
        row.querySelector('.game-gif-remove-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Mencegah event bubbling ke modal close listener
            const overlayIdToRemove = row.dataset.overlayId;
            if (overlayIdToRemove) {
                console.log(`[Game Mode] Menghapus GIF overlay ID: ${overlayIdToRemove}`);
                ipcRenderer.send('close-gif-overlay-by-id', {
                    id: parseInt(overlayIdToRemove),
                    deleteFile: true  // Hapus file dari gif-storage
                });
                gameGifSettingsMap.delete(overlayIdToRemove);
            }
            row.remove();
            updateGameGifStatus();
        });

        return row;
    }

    // Fungsi untuk update status bar GIF di Game mode
    function updateGameGifStatus() {
        const statusEl = document.querySelector('.game-gif-status');
        if (!statusEl) return;
        const count = document.querySelectorAll('.game-gif-input-row').length;
        statusEl.textContent = `${count} GIF aktif`;
    }



    // Fungsi untuk sinkronisasi info musik terkini dari player (Webview atau Local)
    function syncGameCurrentMusicInfo() {
        try {
            // Cek variabel global yang mungkin ada
            const _controlMode = typeof controlMode !== 'undefined' ? controlMode : 'local';

            if (_controlMode === 'webview') {
                // Ambil info dari elemen UI atau variabel global webview
                const titleEl = document.getElementById('now-playing-song');
                // Prioritas: elemen UI -> legacy variable -> string kosong
                const title = titleEl ? titleEl.textContent : (typeof latestWebviewTitle !== 'undefined' ? latestWebviewTitle : '');
                const artist = typeof webviewArtist !== 'undefined' ? webviewArtist : '';

                gameCurrentMusicInfo.title = title || '';
                gameCurrentMusicInfo.artist = artist || '';
            } else {
                // Mode Local
                if (typeof songs !== 'undefined' && typeof currentSongIndex !== 'undefined' && songs[currentSongIndex]) {
                    const song = songs[currentSongIndex];
                    gameCurrentMusicInfo.title = song.title || '';
                    gameCurrentMusicInfo.artist = song.artist || '';
                }
            }
            console.log('[GIF Overlay] Synced music info:', gameCurrentMusicInfo);
        } catch (e) {
            console.warn('[GIF Overlay] Error syncing music info:', e);
        }
    }

    // Fungsi untuk update teks opsi dropdown berdasarkan musik yang sedang diputar dan/atau settings tersimpan
    function updateGameDropdownOptionsText(savedSettings = null) {
        // Sinkronisasi data terbaru sebelum update UI
        syncGameCurrentMusicInfo();

        const conditionSelect = document.getElementById('game-gif-condition-type');
        if (!conditionSelect) return;

        const titleOption = conditionSelect.querySelector('option[value="music-title"]');
        const artistOption = conditionSelect.querySelector('option[value="music-artist"]');
        const warningEl = document.getElementById('game-no-music-warning');

        const hasTitle = gameCurrentMusicInfo.title && gameCurrentMusicInfo.title.trim() !== '';
        const hasArtist = gameCurrentMusicInfo.artist && gameCurrentMusicInfo.artist.trim() !== '';

        // Cek apakah ada saved value yang berbeda dari musik saat ini
        const savedCondition = savedSettings?.condition;
        const savedValue = savedSettings?.value;

        // Update teks opsi judul
        if (titleOption) {
            // Jika settings tersimpan adalah music-title dengan value berbeda dari musik saat ini
            if (savedCondition === 'music-title' && savedValue && savedValue !== gameCurrentMusicInfo.title) {
                const truncatedSavedTitle = savedValue.length > 20
                    ? savedValue.substring(0, 20) + '...'
                    : savedValue;
                titleOption.textContent = `✓ Tersimpan: "${truncatedSavedTitle}"`;
                titleOption.disabled = false;
            } else if (hasTitle) {
                const truncatedTitle = gameCurrentMusicInfo.title.length > 25
                    ? gameCurrentMusicInfo.title.substring(0, 25) + '...'
                    : gameCurrentMusicInfo.title;
                titleOption.textContent = `Saat judul musik "${truncatedTitle}"`;
                titleOption.disabled = false;
            } else {
                titleOption.textContent = titleOption.dataset.defaultText || 'Saat judul musik mengandung...';
                titleOption.disabled = savedCondition !== 'music-title'; // Disable hanya jika bukan saved condition
            }
        }

        // Update teks opsi artis
        if (artistOption) {
            // Jika settings tersimpan adalah music-artist dengan value berbeda dari musik saat ini
            if (savedCondition === 'music-artist' && savedValue && savedValue !== gameCurrentMusicInfo.artist) {
                const truncatedSavedArtist = savedValue.length > 20
                    ? savedValue.substring(0, 20) + '...'
                    : savedValue;
                artistOption.textContent = `✓ Tersimpan: "${truncatedSavedArtist}"`;
                artistOption.disabled = false;
            } else if (hasArtist) {
                const truncatedArtist = gameCurrentMusicInfo.artist.length > 25
                    ? gameCurrentMusicInfo.artist.substring(0, 25) + '...'
                    : gameCurrentMusicInfo.artist;
                artistOption.textContent = `Saat artis musik "${truncatedArtist}"`;
                artistOption.disabled = false;
            } else {
                artistOption.textContent = artistOption.dataset.defaultText || 'Saat artis musik mengandung...';
                artistOption.disabled = savedCondition !== 'music-artist'; // Disable hanya jika bukan saved condition
            }
        }

        // Tampilkan/sembunyikan warning
        const hasMusic = hasTitle || hasArtist || (savedCondition && savedValue);
        if (warningEl) {
            warningEl.style.display = hasMusic ? 'none' : 'block';
        }
    }

    // Fungsi untuk buka modal settings per-GIF di Game mode
    let currentGameGifRow = null;
    let isGameGifConditionDirty = false;

    function openGameGifSettingsModal(row) {
        console.log('[GIF Settings] openGameGifSettingsModal() dipanggil');
        console.log('[GIF Settings] Modal element:', gameGifSettingsModal);

        currentGameGifRow = row;
        isGameGifConditionDirty = false;
        const overlayId = row.dataset.overlayId || null;

        // Coba ambil settings dengan string key atau number key
        let existingSettings = gameGifSettingsMap.get(overlayId) || gameGifSettingsMap.get(overlayId?.toString());
        if (!existingSettings && overlayId) {
            existingSettings = gameGifSettingsMap.get(parseInt(overlayId));
        }

        // Fallback ke default jika tidak ada
        existingSettings = existingSettings || {
            condition: 'always',
            value: '',
            opacity: 1,
            rotation: 0,
            hideOnCursor: false
        };

        console.log(`[GIF Overlay] Opening settings for overlay #${overlayId}:`, existingSettings);

        // Update teks dropdown berdasarkan musik saat ini DAN settings tersimpan
        updateGameDropdownOptionsText(existingSettings);

        // Set nilai modal
        document.getElementById('game-gif-condition-type').value = existingSettings.condition || 'always';

        // Opacity (handle both decimal and percentage format)
        const opacityVal = existingSettings.opacity !== undefined ? existingSettings.opacity : 1;
        const opacityDecimal = opacityVal > 1 ? opacityVal / 100 : opacityVal; // Convert if in percentage
        document.getElementById('game-gif-opacity').value = opacityDecimal;
        document.getElementById('game-gif-opacity-value').textContent = `${Math.round(opacityDecimal * 100)}%`;

        // Rotation
        const rotationVal = existingSettings.rotation !== undefined ? existingSettings.rotation : 0;
        document.getElementById('game-gif-rotation').value = rotationVal;
        document.getElementById('game-gif-rotation-value').textContent = `${rotationVal}°`;

        // Hide on cursor
        const hideOnCursorCheckbox = document.getElementById('game-gif-hide-on-cursor');
        if (hideOnCursorCheckbox) {
            hideOnCursorCheckbox.checked = existingSettings.hideOnCursor === true;
        }

        // Balik (flip) horizontal / vertikal
        const flipHCheckbox = document.getElementById('game-gif-flip-horizontal');
        if (flipHCheckbox) flipHCheckbox.checked = existingSettings.flipHorizontal === true;
        const flipVCheckbox = document.getElementById('game-gif-flip-vertical');
        if (flipVCheckbox) flipVCheckbox.checked = existingSettings.flipVertical === true;

        // Animation settings
        const animSettings = existingSettings.animation || { type: 'none', speed: 2, enabled: true };
        const animTypeSelect = document.getElementById('game-gif-animation-type');
        const animSpeedContainer = document.getElementById('game-gif-animation-speed-container');
        const animSpeedSlider = document.getElementById('game-gif-animation-speed');
        const animSpeedValue = document.getElementById('game-gif-animation-speed-value');

        if (animTypeSelect) {
            animTypeSelect.value = animSettings.type || 'none';
            if (animSpeedContainer) {
                animSpeedContainer.style.display = (animSettings.type && animSettings.type !== 'none') ? 'block' : 'none';
            }
        }

        if (animSpeedSlider) {
            const speedVal = animSettings.speed || 2;
            animSpeedSlider.value = speedVal;
            if (animSpeedValue) animSpeedValue.textContent = speedVal;
        }

        console.log('[GIF Settings] Menampilkan modal...');
        gameGifSettingsModal.classList.add('visible');
        console.log('[GIF Settings] Modal classList:', gameGifSettingsModal.classList.toString());
    }

    // Fungsi tutup modal settings per-GIF di Game mode
    function closeGameGifSettingsModal() {
        gameGifSettingsModal.classList.remove('visible');
        currentGameGifRow = null;
    }

    // Fungsi simpan settings per-GIF di Game mode
    function saveGameGifSettings() {
        if (!currentGameGifRow) return;
        const overlayId = currentGameGifRow.dataset.overlayId || null;
        if (!overlayId) {
            console.warn('[GIF Overlay] Tidak bisa menyimpan settings: overlayId tidak ada');
            closeGameGifSettingsModal();
            return;
        }

        const settingsBtn = currentGameGifRow.querySelector('.game-gif-settings-btn');
        const conditionType = document.getElementById('game-gif-condition-type').value;

        // Load saved settings
        let savedSettings = gameGifSettingsMap.get(overlayId) || gameGifSettingsMap.get(overlayId?.toString()) || {};

        // 1. Tentukan Value Kondisi (Prioritaskan yang tersimpan kecuali user mengubahnya)
        let conditionValue = savedSettings.value || '';

        const conditionChanged = (savedSettings.condition !== conditionType);
        const valueNeeded = (conditionType === 'music-title' || conditionType === 'music-artist');

        // Update value ke 'Musik Saat Ini' HANYA jika:
        // - User mengubah dropdown (dirty flag)
        // - Tipe kondisi berubah
        // - Value dibutuhkan tapi kosong
        if (isGameGifConditionDirty || conditionChanged || (valueNeeded && !conditionValue)) {
            if (conditionType === 'music-title') {
                conditionValue = gameCurrentMusicInfo.title || '';
            } else if (conditionType === 'music-artist') {
                conditionValue = gameCurrentMusicInfo.artist || '';
            } else {
                conditionValue = '';
            }
            console.log(`[Game GIF] Updating condition value to current music: "${conditionValue}"`);
        } else {
            console.log(`[Game GIF] Retaining saved condition value: "${conditionValue}"`);
        }

        const opacityDecimal = parseFloat(document.getElementById('game-gif-opacity').value);
        const rotationVal = parseInt(document.getElementById('game-gif-rotation').value) || 0;
        const hideOnCursorCheckbox = document.getElementById('game-gif-hide-on-cursor');
        const hideOnCursor = hideOnCursorCheckbox ? hideOnCursorCheckbox.checked : false;

        const animTypeSelect = document.getElementById('game-gif-animation-type');
        const animSpeedSlider = document.getElementById('game-gif-animation-speed');

        const flipHCheckbox = document.getElementById('game-gif-flip-horizontal');
        const flipVCheckbox = document.getElementById('game-gif-flip-vertical');

        // PENTING (sinkronisasi dengan Studio standalone):
        // Gabungkan (merge) field yang diedit di atas settings tersimpan, JANGAN menimpa total.
        // Tanpa ini, field kaya dari standalone (flipHorizontal/Vertical, hidden, layer,
        // effects chroma/sprite/crop/objectFit, audio volume/trim, mediaType, group) akan
        // hilang begitu user menyimpan dari modal sederhana ini.
        const settings = {
            ...savedSettings,
            condition: conditionType,
            value: conditionValue,
            rules: { condition: conditionType, value: conditionValue },
            opacity: opacityDecimal,
            rotation: rotationVal,
            hideOnCursor: hideOnCursor,
            flipHorizontal: flipHCheckbox ? flipHCheckbox.checked : (savedSettings.flipHorizontal === true),
            flipVertical: flipVCheckbox ? flipVCheckbox.checked : (savedSettings.flipVertical === true),
            animation: {
                ...(savedSettings.animation || {}),
                type: animTypeSelect ? animTypeSelect.value : 'none',
                speed: animSpeedSlider ? parseInt(animSpeedSlider.value) : 2,
                enabled: true
            }
        };

        // Simpan ke map lokal
        gameGifSettingsMap.set(overlayId, settings);

        // Update visual indicator pada button
        if (settings.condition !== 'always') {
            settingsBtn?.classList.add('has-condition');
        } else {
            settingsBtn?.classList.remove('has-condition');
        }

        // Kirim ke main process
        ipcRenderer.send('update-gif-overlay-settings', { id: parseInt(overlayId), settings: settings });

        console.log(`[GIF Overlay] Settings disimpan untuk overlay ${overlayId}:`, settings);
        closeGameGifSettingsModal();
    }

    // Event handlers untuk GIF Overlay checkbox utama
    if (enableGifOverlayCheckbox) {
        // Load saved state
        const savedGifOverlay = sessionStorage.getItem('savedGifOverlayEnabled');
        if (savedGifOverlay !== null) {
            const isEnabled = savedGifOverlay === 'true';
            enableGifOverlayCheckbox.checked = isEnabled;
            if (gifOverlaySubOptions) {
                gifOverlaySubOptions.style.display = isEnabled ? 'block' : 'none';
            }
            ipcRenderer.send('set-gif-overlay-enabled', isEnabled);
        }

        enableGifOverlayCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            sessionStorage.setItem('savedGifOverlayEnabled', isEnabled);
            if (gifOverlaySubOptions) {
                gifOverlaySubOptions.style.display = isEnabled ? 'block' : 'none';
            }
            ipcRenderer.send('set-gif-overlay-enabled', isEnabled);
            ipcRenderer.send('save-settings', { gifOverlayEnabled: isEnabled });
        });
    }

    // Handler tombol tambah GIF
    if (addGameGifBtn) {
        addGameGifBtn.addEventListener('click', () => {
            const row = createGameGifInputRow();
            if (gameGifListContainer) gameGifListContainer.appendChild(row);
            updateGameGifStatus();
        });
    }

    // Handler checkbox lock GIF overlay
    if (gameGifInteractionLock) {
        // Load saved state
        const savedGifLocked = sessionStorage.getItem('savedGifOverlayLocked');
        if (savedGifLocked !== null) {
            gameGifInteractionLock.checked = savedGifLocked === 'true';
            ipcRenderer.send('set-gif-overlay-locked', savedGifLocked === 'true');
        }

        gameGifInteractionLock.addEventListener('change', (e) => {
            const isLocked = e.target.checked;
            sessionStorage.setItem('savedGifOverlayLocked', isLocked);
            ipcRenderer.send('set-gif-overlay-locked', isLocked);
            ipcRenderer.send('save-settings', { gifOverlayLocked: isLocked });
        });
    }

    // Modal event handlers
    if (gameGifSettingsModal) {
        // Handler slider opacity
        document.getElementById('game-gif-opacity')?.addEventListener('input', (e) => {
            document.getElementById('game-gif-opacity-value').textContent = `${Math.round(e.target.value * 100)}%`;
        });

        // Handler slider rotation
        document.getElementById('game-gif-rotation')?.addEventListener('input', (e) => {
            document.getElementById('game-gif-rotation-value').textContent = `${e.target.value}°`;
        });

        // Dirty tracker for condition type
        document.getElementById('game-gif-condition-type')?.addEventListener('change', () => {
            isGameGifConditionDirty = true;
        });

        // Handler tombol simpan
        document.getElementById('game-gif-settings-save')?.addEventListener('click', saveGameGifSettings);

        // Animation UI Controls
        const gameGifAnimType = document.getElementById('game-gif-animation-type');
        const gameGifAnimSpeedContainer = document.getElementById('game-gif-animation-speed-container');
        const gameGifAnimSpeed = document.getElementById('game-gif-animation-speed');
        const gameGifAnimSpeedValue = document.getElementById('game-gif-animation-speed-value');

        if (gameGifAnimType) {
            gameGifAnimType.addEventListener('change', () => {
                if (gameGifAnimSpeedContainer) {
                    gameGifAnimSpeedContainer.style.display = (gameGifAnimType.value !== 'none') ? 'block' : 'none';
                }
            });
        }

        if (gameGifAnimSpeed) {
            gameGifAnimSpeed.addEventListener('input', () => {
                if (gameGifAnimSpeedValue) {
                    gameGifAnimSpeedValue.textContent = gameGifAnimSpeed.value;
                }
            });
        }

        // Handler tombol batal
        document.getElementById('game-gif-settings-cancel')?.addEventListener('click', closeGameGifSettingsModal);

        // Handler klik di luar modal untuk tutup
        gameGifSettingsModal.addEventListener('click', (e) => {
            if (e.target === gameGifSettingsModal) {
                closeGameGifSettingsModal();
            }
        });

        // Handler tombol Escape untuk tutup modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && gameGifSettingsModal.classList.contains('visible')) {
                closeGameGifSettingsModal();
            }
        });
    }

    // Listener untuk update info musik dari player (offline mode)
    // Note: Di game mode, musik biasanya dari audio player lokal, jadi ini mungkin perlu disesuaikan
    ipcRenderer.on('playback-update', (event, data) => {
        if (data) {
            gameCurrentMusicInfo.title = data.title || '';
            gameCurrentMusicInfo.artist = data.artist || '';
            gameCurrentMusicInfo.isPlaying = data.isPlaying || false;
            // Update teks dropdown jika modal sedang terbuka
            if (gameGifSettingsModal && gameGifSettingsModal.classList.contains('visible')) {
                updateGameDropdownOptionsText();
            }
        }
    });

    // === Load saved GIF overlays dari settings ===
    async function loadSavedGifOverlays() {
        try {
            const settings = await ipcRenderer.invoke('load-settings');
            if (!settings || typeof settings !== 'object') return;

            console.log('[GIF Overlay] Loading saved settings:', settings);

            // Restore enabled state
            if (settings.gifOverlayEnabled !== undefined && enableGifOverlayCheckbox) {
                enableGifOverlayCheckbox.checked = settings.gifOverlayEnabled === true;
                if (gifOverlaySubOptions) {
                    gifOverlaySubOptions.style.display = settings.gifOverlayEnabled ? 'block' : 'none';
                }
                ipcRenderer.send('set-gif-overlay-enabled', settings.gifOverlayEnabled);
            }

            // Restore locked state
            if (settings.gifOverlayLocked !== undefined && gameGifInteractionLock) {
                gameGifInteractionLock.checked = settings.gifOverlayLocked === true;
                ipcRenderer.send('set-gif-overlay-locked', settings.gifOverlayLocked);
            }

            // Restore UI List dengan settings per-GIF
            if (!gameGifUIRestored && settings.gifOverlays && Array.isArray(settings.gifOverlays) && settings.gifOverlays.length > 0) {
                if (gameGifListContainer) gameGifListContainer.innerHTML = '';

                settings.gifOverlays.forEach(item => {
                    console.log(`[GIF Overlay] Creating row for #${item.id}:`, item.settings);
                    const row = createGameGifInputRow(item.id, item.path, item.settings);
                    if (gameGifListContainer) gameGifListContainer.appendChild(row);
                });

                console.log(`[GIF Overlay] Restored ${settings.gifOverlays.length} GIF overlay UI items`);
                gameGifUIRestored = true;
            }
        } catch (e) {
            console.warn('[GIF Overlay] Failed to load saved settings:', e);
        }
    }

    // Load saved GIF overlays on startup
    loadSavedGifOverlays();

    // === Sinkronisasi preset dari window lain (Studio standalone / native player) ===
    // Tanpa listener ini, panel GIF di game mode tidak ikut ter-refresh ketika preset
    // diganti/diterapkan dari window lain (selama settingsnya sudah ada di main process).
    ipcRenderer.on('gif-preset-changed', async (event, data) => {
        console.log('[Game Mode] Preset changed from another window:', data);

        // Bangun ulang daftar row dari data preset terbaru
        if (gameGifListContainer) gameGifListContainer.innerHTML = '';
        gameGifSettingsMap.clear();

        if (data && Array.isArray(data.overlays)) {
            data.overlays.forEach(overlay => {
                const row = createGameGifInputRow(overlay.id, overlay.sourcePath || overlay.path, overlay.settings);
                if (gameGifListContainer) gameGifListContainer.appendChild(row);
            });
            console.log(`[Game Mode] Synced ${data.overlays.length} GIF overlay dari preset change`);
        }
        gameGifUIRestored = true;
        updateGameGifStatus();

        // Refresh dropdown preset + sinkron pilihan aktif
        await loadGamePresetsList();
        if (gameGifPresetSelect && data && data.presetId) {
            gameGifPresetSelect.value = data.presetId;
        }
    });
    //------------------- ( end GIF Overlay Handler untuk Game Mode ) -------------------------//

    //------------------- ( bersihin tombol back bawaan (kalau muncul) ) -------------------------//
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.remove();
    }

    if (window.location.pathname.endsWith('index.html')) {
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                mutation.addedNodes.forEach((node) => {
                    if (node.classList && node.classList.contains('back-button')) {
                        node.remove();
                    }
                });
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    setTimeout(warmUpUI, 1000);
    //------------------- ( end bersihin tombol back bawaan (kalau muncul) ) -------------------------//
});
//------------------- ( end inisialisasi & load saat DOM ready ) -------------------------//

//------------------- load settings dari electron main process -------------------------//
ipcRenderer.invoke("load-settings").then((settings) => {
    const followMusicCheckboxHidden = document.getElementById("follow-music-title");
    const darknessSliderHidden = document.getElementById("wallpaper-darkness");
    const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
    const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
    const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings');
    const wallpaperSettingsPanel = document.getElementById('wallpaper-settings');

    const autoChangeCheckboxHidden = document.getElementById("auto-change-wallpaper");
    const autoChangeIntervalInputHidden = document.getElementById("auto-change-interval");
    const randomOrderCheckboxHidden = document.getElementById("random-wallpaper-order");
    const optionsPaneAutoChangeCheckbox = document.querySelector('#wallpaper-options-pane .auto-change-wallpaper');
    const optionsPaneAutoChangeIntervalInput = document.querySelector('#wallpaper-options-pane .auto-change-interval');
    const optionsPaneRandomOrderCheckbox = document.querySelector('#wallpaper-options-pane .random-wallpaper-order');

    const snowEffectCheckbox = document.getElementById('snow-effect-checkbox');
    const miniPlayerEffectCheckbox = document.getElementById('mini-player-effect-checkbox');

    // Deklarasi slider wallpaper (juga ada di DOMContentLoaded, tapi perlu diakses di scope ini)
    const blurSliderHidden = document.getElementById("wallpaper-blur");
    const optionsPaneBlurSlider = document.querySelector('#wallpaper-options-pane .wallpaper-blur');
    const grayscaleSliderHidden = document.getElementById("wallpaper-grayscale");
    const optionsPaneGrayscaleSlider = document.querySelector('#wallpaper-options-pane .wallpaper-grayscale');
    const zoomSliderHidden = document.getElementById("wallpaper-zoom");
    const optionsPaneZoomSlider = document.querySelector('#wallpaper-options-pane .wallpaper-zoom');

    if (settings.webgpuVisualizerStyle !== undefined) {
        sessionStorage.setItem('savedWebGPUVisualizerStyle', String(settings.webgpuVisualizerStyle));
    }

    if (settings.rpcEnabled !== undefined) {
        enableRpcCheckbox.checked = settings.rpcEnabled;
    }

    document.getElementById("wallpaper-name").textContent = `Current: ${settings.wallpaper}`;

    if (settings.followMusic !== undefined) {
        if (followMusicCheckboxHidden) followMusicCheckboxHidden.checked = settings.followMusic;
        if (optionsPaneFollowMusicCheckbox) optionsPaneFollowMusicCheckbox.checked = settings.followMusic;
    }

    if (settings.darkness !== undefined) {
        if (darknessSliderHidden) darknessSliderHidden.value = settings.darkness;
        if (optionsPaneDarknessSlider) optionsPaneDarknessSlider.value = settings.darkness;
    }
    if (settings.wallpaperBlur !== undefined) {
        if (blurSliderHidden) blurSliderHidden.value = settings.wallpaperBlur;
        if (optionsPaneBlurSlider) optionsPaneBlurSlider.value = settings.wallpaperBlur;
    }
    if (settings.wallpaperGrayscale !== undefined) {
        if (grayscaleSliderHidden) grayscaleSliderHidden.value = settings.wallpaperGrayscale;
        if (optionsPaneGrayscaleSlider) optionsPaneGrayscaleSlider.value = settings.wallpaperGrayscale;
    }
    if (settings.wallpaperZoom !== undefined) {
        if (zoomSliderHidden) zoomSliderHidden.value = settings.wallpaperZoom;
        if (optionsPaneZoomSlider) optionsPaneZoomSlider.value = settings.wallpaperZoom;
    }

    if (settings.autoChangeWallpaper !== undefined) {
        if (autoChangeCheckboxHidden) autoChangeCheckboxHidden.checked = settings.autoChangeWallpaper;
        if (optionsPaneAutoChangeCheckbox) optionsPaneAutoChangeCheckbox.checked = settings.autoChangeWallpaper;
        sessionStorage.setItem("savedAutoChangeWallpaper", settings.autoChangeWallpaper);
        if (settings.autoChangeWallpaper) {
            startAutoChangeWallpaper();
        }
    }
    if (settings.autoChangeInterval !== undefined) {
        if (autoChangeIntervalInputHidden) autoChangeIntervalInputHidden.value = settings.autoChangeInterval;
        if (optionsPaneAutoChangeIntervalInput) optionsPaneAutoChangeIntervalInput.value = settings.autoChangeInterval;
        sessionStorage.setItem("savedAutoChangeInterval", settings.autoChangeInterval);
    }
    if (settings.randomWallpaperOrder !== undefined) {
        if (randomOrderCheckboxHidden) randomOrderCheckboxHidden.checked = settings.randomWallpaperOrder;
        if (optionsPaneRandomOrderCheckbox) optionsPaneRandomOrderCheckbox.checked = settings.randomWallpaperOrder;
        sessionStorage.setItem("savedRandomWallpaperOrder", settings.randomWallpaperOrder);
    }

    applyWallpaperStyles();

    // Load and apply
    if (settings.enableHiddenWallpaperSettings !== undefined) {
        const isEnabled = settings.enableHiddenWallpaperSettings;
        // Apply setting langsung ke checkbox dan panel
        if (wallpaperSettingsPanel) {
            if (isEnabled) {
                wallpaperSettingsPanel.classList.remove('disabled');
                // Re-attach hover jika sebelumnya di-enable
                triggerZone.addEventListener('mouseenter', showPanel);
                triggerZone.addEventListener('mouseleave', hidePanel);
                wallpaperSettings.addEventListener('mouseenter', showPanel);
                wallpaperSettings.addEventListener('mouseleave', hidePanel);
            } else {
                wallpaperSettingsPanel.classList.add('disabled');
                // Hide the panel langsung jika sedang terbuka
                wallpaperSettingsPanel.classList.remove('show');
                // Remove hover listeners untuk mencegah interaksi
                triggerZone.removeEventListener('mouseenter', showPanel);
                triggerZone.removeEventListener('mouseleave', hidePanel);
                wallpaperSettings.removeEventListener('mouseenter', showPanel);
                wallpaperSettings.removeEventListener('mouseleave', hidePanel);
            }
        }
    } else {
        // Jika belum ada di setting tersimpan: defaultnya dimatiin aja biar aman
        if (enableHiddenSettingsCheckbox) enableHiddenSettingsCheckbox.checked = false;
        sessionStorage.setItem("savedEnableHiddenSettings", false);
        ipcRenderer.send("save-settings", { enableHiddenWallpaperSettings: false });
        if (wallpaperSettingsPanel) wallpaperSettingsPanel.classList.add('disabled');
    }

    // Load and apply salah satu fitur baru: Snow Effect
    if (settings.snowFeatureEnabled !== undefined) {
        const isSnowEnabled = settings.snowFeatureEnabled;
        if (snowEffectCheckbox) snowEffectCheckbox.checked = isSnowEnabled;
        if (isSnowEnabled) {
            ipcRenderer.send('show-snow-effect');
        } else {
            ipcRenderer.send('hide-snow-effect');
        }
    } else {
        // jika tidak ada di setting tersimpan: default dimatiin aja
        if (snowEffectCheckbox) snowEffectCheckbox.checked = false;
        ipcRenderer.send('set-snow-feature-enabled', false);
        ipcRenderer.send('hide-snow-effect');
    }

    // Muat & terapkan GUI Theme tersimpan (default: 'default')
    const guiThemeSelectOnLoad = document.getElementById('gui-theme-select');
    const savedGuiTheme = (settings.guiTheme !== undefined && settings.guiTheme !== null)
        ? settings.guiTheme
        : 'default';
    if (guiThemeSelectOnLoad) guiThemeSelectOnLoad.value = savedGuiTheme;
    sessionStorage.setItem('savedGuiTheme', savedGuiTheme);
    applyGuiTheme(savedGuiTheme);

    if (settings.miniPlayerFeatureEnabled !== undefined) {
        const isMiniEnabled = settings.miniPlayerFeatureEnabled === true;
        if (miniPlayerCheckboxInOptions) miniPlayerCheckboxInOptions.checked = isMiniEnabled;
        sessionStorage.setItem('savedMiniPlayerEffect', isMiniEnabled);
        ipcRenderer.send('set-mini-player-feature-enabled', isMiniEnabled);
    } else {
        // Default disable jika tidak ada di setting tersimpan
        sessionStorage.setItem('savedMiniPlayerEffect', false);
        ipcRenderer.send('set-mini-player-feature-enabled', false);
    }

    if (enableAdSkipperCheckbox && settings.adSkipperEnabled !== undefined) {
        enableAdSkipperCheckbox.checked = settings.adSkipperEnabled;
    } else if (enableAdSkipperCheckbox) {
        enableAdSkipperCheckbox.checked = false;
    }

    if (settings.globalVolume !== undefined) {
        applyGlobalVolume(settings.globalVolume);
    }

    // Load Ad Skipper Settings
    if (settings.adSkipperEnabled !== undefined) {
        enableAdSkipperCheckbox.checked = settings.adSkipperEnabled;
        if (settings.adSkipperEnabled) {
            document.getElementById('ad-skipper-sub-options').classList.add('visible');
        }
    }

    // Load Sub-Options
    if (settings.autoMuteAds !== undefined) {
        document.getElementById('auto-mute-ads-checkbox').checked = settings.autoMuteAds;
    }
    if (settings.autoSkipAds !== undefined) {
        document.getElementById('auto-skip-ads-checkbox').checked = settings.autoSkipAds;
    }

    // webview menerima config AdSkipper yang sudah di-load (anti race dengan dom-ready)
    const webview = document.getElementById('external-webview');
    if (webview && webview.getWebContentsId()) {
        webview.send('setting-update', {
            adSkipperEnabled: settings.adSkipperEnabled === true,
            autoMuteAds: settings.autoMuteAds === true,
            autoSkipAds: settings.autoSkipAds === true
        });
    }


    document.getElementById('idle-return-checkbox').checked = settings.idleReturn;
    if (settings.idleReturn) resetIdleTimer();
});
//------------------- end load settings dari electron main process -------------------------//

// ================================ ( End Pengaturan User ) ================================ //
