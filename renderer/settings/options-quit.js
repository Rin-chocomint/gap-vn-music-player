// ================================ ( Menu Options & Quit ) ================================ //
//------------------- ( inisialisasi elemen opsi & quit ) -------------------------//
// Elemen modal dan tombol kontrol
const optionsMenu = document.getElementById('options');
const quitMenu = document.getElementById('quit');
//------------------- elemen modal & navbar -------------------------//
const optionsModal = document.getElementById('options-modal');
const closeOptionsBtn = document.getElementById('close-options');
const applyOptionsBtn = document.getElementById('apply-options');
const rememberSettingsToggleBtn = document.getElementById('remember-settings-toggle');
const clearRememberedSettingsBtn = document.getElementById('clear-remembered-settings');
const resolutionSelect = document.getElementById('resolution-select');
const fullscreenCheckbox = document.getElementById('fullscreen-checkbox');
const idleReturnCheckbox = document.getElementById('idle-return-checkbox');
const snowEffectCheckboxOriginal = document.getElementById('snow-effect-checkbox');
const webgpuCheckbox = document.getElementById('webgpu-acceleration-checkbox');
const miniPlayerCheckboxInOptions = document.getElementById('mini-player-effect-checkbox');
const enableAdSkipperCheckbox = document.getElementById('enable-ad-skipper-checkbox');
const webgpuVisualizerStyleRow = document.getElementById('webgpu-visualizer-style-row');
const webgpuVisualizerStyleSelect = document.getElementById('webgpu-visualizer-style');

// Function to toggle WebGPU Visualizer Style option based on WebGPU Acceleration
function updateWebGPUVisualizerStyleAvailability(isWebGPUEnabled) {
    if (webgpuVisualizerStyleRow && webgpuVisualizerStyleSelect) {
        if (isWebGPUEnabled) {
            webgpuVisualizerStyleRow.classList.remove('disabled-option');
            webgpuVisualizerStyleSelect.disabled = false;
        } else {
            webgpuVisualizerStyleRow.classList.add('disabled-option');
            webgpuVisualizerStyleSelect.disabled = true;
        }
    }
}

// Listen to WebGPU Acceleration checkbox changes
if (webgpuCheckbox) {
    webgpuCheckbox.addEventListener('change', (e) => {
        updateWebGPUVisualizerStyleAvailability(e.target.checked);
    });
}





let rememberedSettingsSaved = false;
function updateRememberSettingsButton(saved) {
    rememberedSettingsSaved = saved === true;
    if (!rememberSettingsToggleBtn) return;
    rememberSettingsToggleBtn.classList.toggle('is-enabled', rememberedSettingsSaved);
    rememberSettingsToggleBtn.setAttribute('aria-pressed', rememberedSettingsSaved ? 'true' : 'false');
    rememberSettingsToggleBtn.title = rememberedSettingsSaved ? 'Saved' : 'Not saved';
}

let optionsUiBaselineSnapshot = null;

function getOptionsUIPartialSnapshot() {
    const resValue = resolutionSelect ? resolutionSelect.value : '';
    const [width, height] = (resValue || '').split('x').map(Number);

    const isFullscreenVal = fullscreenCheckbox ? fullscreenCheckbox.checked : false;
    const idleReturnVal = idleReturnCheckbox ? idleReturnCheckbox.checked : false;
    const snowEnabledVal = snowEffectCheckboxOriginal ? snowEffectCheckboxOriginal.checked : false;
    const webgpuEnabledVal = webgpuCheckbox ? webgpuCheckbox.checked : false;
    const webgpuVisualizerStyleVal = document.getElementById('webgpu-visualizer-style')
        ? document.getElementById('webgpu-visualizer-style').value
        : (sessionStorage.getItem('savedWebGPUVisualizerStyle') || '1');
    const miniPlayerEnabledVal = miniPlayerCheckboxInOptions ? miniPlayerCheckboxInOptions.checked : false;

    const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
    const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
    const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings');

    const darknessValue = optionsPaneDarknessSlider ? optionsPaneDarknessSlider.value : 30;
    const followMusicValue = optionsPaneFollowMusicCheckbox ? optionsPaneFollowMusicCheckbox.checked : false;
    const enableHiddenSettingsValue = enableHiddenSettingsCheckbox ? enableHiddenSettingsCheckbox.checked : false;

    const adSkipperVal = document.getElementById('enable-ad-skipper-checkbox')?.checked === true;
    const autoMuteVal = document.getElementById('auto-mute-ads-checkbox')?.checked === true;
    const autoSkipVal = document.getElementById('auto-skip-ads-checkbox')?.checked === true;

    const rpcEnabledVal = (typeof enableRpcCheckbox !== 'undefined' && enableRpcCheckbox) ? enableRpcCheckbox.checked : false;
    const showLogOverlayVal = document.getElementById('toggle-log-overlay-checkbox')?.checked === true;

    const dynamicMusicPlayerCheckbox = document.getElementById('enable-dynamic-music-player-checkbox');
    const dynamicMusicPlayerVal = dynamicMusicPlayerCheckbox ? dynamicMusicPlayerCheckbox.checked : false;

    // Sub-options yang sering terlewat
    const miniPlayerHideCheckbox = document.getElementById('mini-player-hide-on-cursor');
    const miniPlayerHideVal = miniPlayerHideCheckbox ? miniPlayerHideCheckbox.checked : false;

    const overlayCheckbox = document.getElementById('enable-overlay-checkbox');
    const overlayVal = overlayCheckbox ? overlayCheckbox.checked : false;

    const dynamicThemeCheckbox = document.getElementById('enable-dynamic-theme-checkbox');
    const dynamicThemeVal = dynamicThemeCheckbox ? dynamicThemeCheckbox.checked : false;

    const dynamicThemeModeSelect = document.getElementById('dynamic-theme-mode-select');
    const dynamicThemeModeVal = dynamicThemeModeSelect ? dynamicThemeModeSelect.value : 'default-optimized';
    const playbackSpeedSelect = document.getElementById('playback-speed-select');
    const playbackSpeedVal = playbackSpeedSelect ? playbackSpeedSelect.value : '1.0';

    const rhythmOverlayCheckbox = document.getElementById('enable-rhythm-overlay-checkbox');
    const rhythmHideNowPlayingCheckbox = document.getElementById('rhythm-hide-nowplaying-checkbox');

    return {
        windowWidth: Number.isFinite(width) ? width : undefined,
        windowHeight: Number.isFinite(height) ? height : undefined,
        isFullscreen: isFullscreenVal,
        idleReturn: idleReturnVal,
        snowFeatureEnabled: snowEnabledVal,
        webgpuEnabled: webgpuEnabledVal,
        webgpuVisualizerStyle: webgpuVisualizerStyleVal,
        miniPlayerFeatureEnabled: miniPlayerEnabledVal,
        miniPlayerHideOnCursor: miniPlayerHideVal,
        darkness: darknessValue,
        followMusic: followMusicValue,
        enableHiddenWallpaperSettings: enableHiddenSettingsValue,
        rpcEnabled: rpcEnabledVal,
        showLogOverlay: showLogOverlayVal,
        adSkipperEnabled: adSkipperVal,
        autoMuteAds: autoMuteVal,
        autoSkipAds: autoSkipVal,
        dynamicMusicPlayerStylingEnabled: dynamicMusicPlayerVal,
        enableVideoWallpaper: document.getElementById('enable-video-wallpaper')?.checked,
        enableGifOverlay: document.getElementById('enable-gif-overlay-checkbox')?.checked,
        gameGifInteractionLock: document.getElementById('game-gif-interaction-lock')?.checked,
        overlayEnabled: overlayVal,
        dynamicThemeEnabled: dynamicThemeVal,
        dynamicThemeMode: dynamicThemeModeVal,
        playbackSpeed: playbackSpeedVal,
        rhythmOverlayEnabled: rhythmOverlayCheckbox ? rhythmOverlayCheckbox.checked : false,
        rhythmHideNowPlaying: rhythmHideNowPlayingCheckbox ? rhythmHideNowPlayingCheckbox.checked : false
    };
}

async function rememberSettingsSaveSnapshotFromOptionsUI() {
    const partial = getOptionsUIPartialSnapshot();

    ipcRenderer.send('save-settings', partial);
    const result = await ipcRenderer.invoke('remember-settings-save', partial);
    updateRememberSettingsButton(result && result.saved === true);

    return partial;
}

if (rememberSettingsToggleBtn) {
    rememberSettingsToggleBtn.addEventListener('click', async () => {
        try {
            const beforeSettings = optionsUiBaselineSnapshot || await ipcRenderer.invoke('load-settings');
            const partial = await rememberSettingsSaveSnapshotFromOptionsUI();
            const diffLines = buildSettingsDiffLines(beforeSettings, partial);
            optionsUiBaselineSnapshot = partial;
            showNotification('Settings saved!', 'notification-success', diffLines.length > 0 ? diffLines : ['No changes detected.']);
        } catch (e) {
            console.warn('[Remember Settings] Save failed:', e);
            showNotification('Failed to save settings', 'notification-error');
        }
    });
}

if (clearRememberedSettingsBtn) {
    clearRememberedSettingsBtn.addEventListener('click', async () => {
        try {
            const result = await ipcRenderer.invoke('remember-settings-clear');
            updateRememberSettingsButton(result && result.saved === true);
            showNotification('Saved settings cleared!', 'notification-success', ['Remembered settings: cleared']);
        } catch (e) {
            console.warn('[Remember Settings] Clear failed:', e);
            showNotification('Failed to clear saved settings', 'notification-error');
        }
    });
}

ipcRenderer.on('remember-settings-status-changed', (_event, saved) => {
    updateRememberSettingsButton(saved);
});

const quitModal = document.getElementById('quit-modal');
const confirmQuitBtn = document.getElementById('confirm-quit');
const cancelQuitBtn = document.getElementById('cancel-quit');

const customQuitPopup = document.getElementById('custom-quit-popup');
const customConfirmQuitBtn = document.getElementById('custom-confirm-quit-btn');
const customCancelQuitBtn = document.getElementById('custom-cancel-quit-btn');
//------------------- end elemen modal & navbar -------------------------//

//------------------- navigasi navbar opsi -------------------------//
// Navbar di dalam Options Menu
const optionsNavbarItems = document.querySelectorAll('.options-navbar-item');
const optionsContentPanes = document.querySelectorAll('.options-content-pane');

// Tambahkan event listener untuk klik di seluruh dokumen body
// Tambahkan event listener untuk klik di seluruh dokumen body
document.body.addEventListener('click', (event) => {
    // Jangan tutup jika klik di dalam options modal
    if (event.target.closest('#options-modal')) return;

    // Jangan tutup jika klik di dalam game gif settings modal
    if (event.target.closest('#game-gif-settings-modal')) return;

    // Jangan tutup jika klik tombol settings (karena ini membuka modal lain)
    if (event.target.closest('.game-gif-settings-btn')) return;

    // Jangan tutup jika klik di dalam about panel atau tombol bukanya
    if (event.target.closest('#about-panel')) return;
    if (event.target.closest('#open-about-panel')) return;

    if (optionsModal.classList.contains('open')) {
        closeOptionsBtn.click();
    }
});


// Tutup Options Menu
closeOptionsBtn.addEventListener('click', () => {
    optionsModal.classList.remove('open');
    setTimeout(() => {
        if (!optionsModal.classList.contains('open')) {
            optionsModal.classList.add('hidden');
        }
    }, 200);
});
//------------------- end navigasi navbar opsi -------------------------//

//------------------- kontrol fullscreen & resolution -------------------------//
//------------------- ( sinkron status fullscreen dari main process ) -------------------------//
ipcRenderer.on("fullscreen-status-changed", (newIsFullscreen) => {
    if (fullscreenCheckbox) {
        fullscreenCheckbox.checked = newIsFullscreen;
    }
});

//------------------- ( end sinkron status fullscreen dari main process ) -------------------------//

//------------------- ( buka menu options + sync value saat dibuka ) -------------------------//
optionsMenu.addEventListener('click', async () => {
    optionsModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        optionsModal.classList.add('open');
    });

    // Set status fullscreen saat menu dibuka
    const isFullscreen = await ipcRenderer.invoke('get-fullscreen-status');
    fullscreenCheckbox.checked = isFullscreen;

    // Set resolusi saat menu dibuka
    if (!isFullscreen) {
        const currentSize = await ipcRenderer.invoke('get-window-size');
        if (currentSize && resolutionSelect) {
            const currentResValue = `${currentSize.width}x${currentSize.height}`;
            // Cek apakah opsi ini ada di dropdown
            let optionExists = false;
            for (let i = 0; i < resolutionSelect.options.length; i++) {
                if (resolutionSelect.options[i].value === currentResValue) {
                    optionExists = true;
                    break;
                }
            }
            if (optionExists) {
                resolutionSelect.value = currentResValue;
            } else {
                // Tambahkan sebagai opsi baru jika tidak ada dan tandai sebagai terpilih
                // Atau biarkan default jika tidak ingin menambahkannya secara dinamis
                console.warn(`Current resolution ${currentResValue} not in dropdown. Consider adding it or handling it.`);
            }
        }
    }

    // Set status idle return & snow effect saat menu dibuka
    const currentSettings = await ipcRenderer.invoke('load-settings');
    if (currentSettings) {
        updateRememberSettingsButton(currentSettings.rememberedSettingsSaved);
        if (currentSettings.idleReturn !== undefined) {
            idleReturnCheckbox.checked = currentSettings.idleReturn;
        } else {
            idleReturnCheckbox.checked = sessionStorage.getItem('savedIdleReturn') === 'true';
        }
        if (currentSettings.snowFeatureEnabled !== undefined) {
            snowEffectCheckboxOriginal.checked = currentSettings.snowFeatureEnabled;
        } else {
            snowEffectCheckboxOriginal.checked = sessionStorage.getItem('savedSnowEffect') === 'true';
        }

        if (currentSettings.webgpuEnabled !== undefined) {
            webgpuCheckbox.checked = currentSettings.webgpuEnabled;
        } else {
            webgpuCheckbox.checked = sessionStorage.getItem('savedWebGPU') === 'true';
        }
        // Update WebGPU Visualizer Style availability based on loaded settings
        updateWebGPUVisualizerStyleAvailability(webgpuCheckbox.checked);

        const webgpuVisualizerStyleSelect = document.getElementById('webgpu-visualizer-style');
        if (webgpuVisualizerStyleSelect) {
            const preferredStyle = (currentSettings.webgpuVisualizerStyle !== undefined)
                ? String(currentSettings.webgpuVisualizerStyle)
                : (sessionStorage.getItem('savedWebGPUVisualizerStyle') || "1");
            webgpuVisualizerStyleSelect.value = preferredStyle;
            sessionStorage.setItem('savedWebGPUVisualizerStyle', preferredStyle);
        }

        miniPlayerCheckboxInOptions.checked = currentSettings.miniPlayerFeatureEnabled ?? (sessionStorage.getItem('savedMiniPlayerEffect') === 'true');

        // Sync Ad Skipper settings saat menu Options dibuka (biar gak ke-save default false)
        if (enableAdSkipperCheckbox) {
            enableAdSkipperCheckbox.checked = currentSettings.adSkipperEnabled === true;
        }
        const autoMuteCheckbox = document.getElementById('auto-mute-ads-checkbox');
        const autoSkipCheckbox = document.getElementById('auto-skip-ads-checkbox');
        if (autoMuteCheckbox) autoMuteCheckbox.checked = currentSettings.autoMuteAds === true;
        if (autoSkipCheckbox) autoSkipCheckbox.checked = currentSettings.autoSkipAds === true;

        const adSkipperSubBox = document.getElementById('ad-skipper-sub-options');
        if (adSkipperSubBox) {
            if (enableAdSkipperCheckbox && enableAdSkipperCheckbox.checked) {
                adSkipperSubBox.classList.add('visible');
            } else {
                adSkipperSubBox.classList.remove('visible');
            }
        }
    }


    // Load wallpaper settings into the options pane when it's opened
    const savedDarkness = sessionStorage.getItem("savedDarkness") || 30; // Default to 30 if not saved
    const savedFollowMusic = sessionStorage.getItem("savedFollowMusic") === "true";
    const savedEnableHiddenSettings = sessionStorage.getItem("savedEnableHiddenSettings") === "true";


    const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
    const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
    const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings'); // New checkbox


    if (optionsPaneDarknessSlider) optionsPaneDarknessSlider.value = savedDarkness;
    if (optionsPaneFollowMusicCheckbox) optionsPaneFollowMusicCheckbox.checked = savedFollowMusic;
    if (enableHiddenSettingsCheckbox) enableHiddenSettingsCheckbox.checked = savedEnableHiddenSettings;


    // Default ke pane pertama (Game) saat membuka
    optionsNavbarItems.forEach(item => item.classList.remove('active'));
    optionsContentPanes.forEach(pane => pane.classList.remove('active'));
    document.querySelector('.options-navbar-item[data-pane="game-options"]').classList.add('active');
    document.getElementById('game-options-pane').classList.add('active');

    // Baseline snapshot untuk diff (pakai state UI pada saat menu dibuka)
    optionsUiBaselineSnapshot = getOptionsUIPartialSnapshot();

});

//------------------- ( end buka menu options + sync value saat dibuka ) -------------------------//

closeOptionsBtn.addEventListener('click', () => {
    optionsModal.classList.remove('open');
    // Tambahkan penundaan untuk animasi sebelum menyembunyikan total jika diperlukan
    setTimeout(() => {
        if (!optionsModal.classList.contains('open')) { // Hanya sembunyikan jika benar-benar tertutup
            optionsModal.classList.add('hidden');
        }
    }, 500); // Sesuaikan dengan durasi transisi CSS
});
//------------------- end kontrol fullscreen & resolution -------------------------//

//------------------- switch pane navbar -------------------------//
// Navigasi antar pane di Options Menu
optionsNavbarItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetPaneId = item.getAttribute('data-pane') + '-pane';

        optionsNavbarItems.forEach(navItem => navItem.classList.remove('active'));
        item.classList.add('active');

        optionsContentPanes.forEach(pane => {
            if (pane.id === targetPaneId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    });
});
//------------------- end switch pane navbar -------------------------//

//------------------- apply pengaturan opsi -------------------------//
// Terapkan semua pengaturan yang dipilih
applyOptionsBtn.addEventListener('click', async () => {
    const beforeSettings = optionsUiBaselineSnapshot || await ipcRenderer.invoke('load-settings');
    const resValue = resolutionSelect.value;
    const [width, height] = resValue.split('x').map(Number);
    const isFullscreenVal = fullscreenCheckbox.checked;
    const idleReturn = idleReturnCheckbox.checked;
    const snowEnabledVal = snowEffectCheckboxOriginal.checked;
    const webgpuEnabledVal = webgpuCheckbox.checked;
    const webgpuVisualizerStyleVal = document.getElementById('webgpu-visualizer-style').value;
    const miniPlayerEnabledVal = miniPlayerCheckboxInOptions.checked;
    const rpcEnabledVal = enableRpcCheckbox.checked;

    const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
    const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
    const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings');

    const darknessValue = optionsPaneDarknessSlider ? optionsPaneDarknessSlider.value : 30;
    const followMusicValue = optionsPaneFollowMusicCheckbox ? optionsPaneFollowMusicCheckbox.checked : false;
    const enableHiddenSettingsValue = enableHiddenSettingsCheckbox ? enableHiddenSettingsCheckbox.checked : false;

    const adSkipperVal = document.getElementById('enable-ad-skipper-checkbox').checked;
    const autoMuteVal = document.getElementById('auto-mute-ads-checkbox').checked;
    const autoSkipVal = document.getElementById('auto-skip-ads-checkbox').checked;

    const dynamicMusicPlayerCheckbox = document.getElementById('enable-dynamic-music-player-checkbox');
    const dynamicMusicPlayerVal = dynamicMusicPlayerCheckbox ? dynamicMusicPlayerCheckbox.checked : false;

    const miniPlayerHideCheckbox = document.getElementById('mini-player-hide-on-cursor');
    const miniPlayerHideVal = miniPlayerHideCheckbox ? miniPlayerHideCheckbox.checked : false;

    const overlayCheckbox = document.getElementById('enable-overlay-checkbox');
    const overlayVal = overlayCheckbox ? overlayCheckbox.checked : false;

    const dynamicThemeCheckbox = document.getElementById('enable-dynamic-theme-checkbox');
    const dynamicThemeVal = dynamicThemeCheckbox ? dynamicThemeCheckbox.checked : false;

    const dynamicThemeModeSelect = document.getElementById('dynamic-theme-mode-select');
    const dynamicThemeModeVal = dynamicThemeModeSelect ? dynamicThemeModeSelect.value : 'default-optimized';
    const playbackSpeedSelect = document.getElementById('playback-speed-select');
    const playbackSpeedVal = playbackSpeedSelect ? playbackSpeedSelect.value : '1.0';

    const rhythmOverlayCheckbox = document.getElementById('enable-rhythm-overlay-checkbox');
    const rhythmHideNowPlayingCheckbox = document.getElementById('rhythm-hide-nowplaying-checkbox');

    const partial = {
        windowWidth: width,
        windowHeight: height,
        isFullscreen: isFullscreenVal,
        idleReturn,
        snowFeatureEnabled: snowEnabledVal,
        webgpuEnabled: webgpuEnabledVal,
        webgpuVisualizerStyle: webgpuVisualizerStyleVal,
        miniPlayerFeatureEnabled: miniPlayerEnabledVal,
        miniPlayerHideOnCursor: miniPlayerHideVal,
        darkness: darknessValue,
        followMusic: followMusicValue,
        enableHiddenWallpaperSettings: enableHiddenSettingsValue,
        rpcEnabled: rpcEnabledVal,
        showLogOverlay: document.getElementById('toggle-log-overlay-checkbox')?.checked === true,
        adSkipperEnabled: adSkipperVal,
        autoMuteAds: autoMuteVal,
        autoSkipAds: autoSkipVal,
        dynamicMusicPlayerStylingEnabled: dynamicMusicPlayerVal,
        enableVideoWallpaper: document.getElementById('enable-video-wallpaper')?.checked,
        enableGifOverlay: document.getElementById('enable-gif-overlay-checkbox')?.checked,
        gameGifInteractionLock: document.getElementById('game-gif-interaction-lock')?.checked,
        overlayEnabled: overlayVal,
        dynamicThemeEnabled: dynamicThemeVal,
        dynamicThemeMode: dynamicThemeModeVal,
        playbackSpeed: playbackSpeedVal,
        rhythmOverlayEnabled: rhythmOverlayCheckbox ? rhythmOverlayCheckbox.checked : false,
        rhythmHideNowPlaying: rhythmHideNowPlayingCheckbox ? rhythmHideNowPlayingCheckbox.checked : false
    };

    ipcRenderer.send('save-settings', partial);

    // CUKUP KIRIM 'apply-settings'. Main process akan menangani sisanya.
    ipcRenderer.send('apply-settings', {
        width,
        height,
        isFullscreen: isFullscreenVal,
        idleReturn,
        snowFeatureEnabled: snowEnabledVal,
        webgpuEnabled: webgpuEnabledVal,
        miniPlayerFeatureEnabled: miniPlayerEnabledVal,
        miniPlayerHideOnCursor: miniPlayerHideVal,
        darkness: darknessValue,
        followMusic: followMusicValue,
        enableHiddenWallpaperSettings: enableHiddenSettingsValue,
        rpcEnabled: rpcEnabledVal,
        adSkipperEnabled: adSkipperVal,
        autoMuteAds: autoMuteVal,
        autoSkipAds: autoSkipVal
    });

    // Simpan ke sessionStorage (ini oke untuk state renderer sementara)
    sessionStorage.setItem('savedIdleReturn', idleReturn);
    sessionStorage.setItem('savedSnowEffect', snowEnabledVal);
    sessionStorage.setItem('savedWebGPU', webgpuEnabledVal);
    sessionStorage.setItem('savedWebGPUVisualizerStyle', webgpuVisualizerStyleVal);
    sessionStorage.setItem('savedMiniPlayerEffect', miniPlayerEnabledVal);
    sessionStorage.setItem('savedDarkness', darknessValue);
    sessionStorage.setItem('savedFollowMusic', followMusicValue);
    sessionStorage.setItem('savedEnableHiddenSettings', enableHiddenSettingsValue);

    // Apply wallpaper brightness ke video dan gambar
    const filterValueApply = `brightness(${100 - darknessValue}%)`;
    const characterBackgroundEl = document.getElementById("character-background");
    const characterBackgroundImageEl = document.getElementById("character-background-image");
    if (characterBackgroundEl) characterBackgroundEl.style.filter = filterValueApply;
    if (characterBackgroundImageEl) characterBackgroundImageEl.style.filter = filterValueApply;

    const darknessSliderHidden = document.getElementById("wallpaper-darkness");
    const followMusicCheckboxHidden = document.getElementById("follow-music-title");
    const wallpaperSettingsPanel = document.getElementById('wallpaper-settings');

    if (darknessSliderHidden) darknessSliderHidden.value = darknessValue;
    if (followMusicCheckboxHidden) followMusicCheckboxHidden.checked = followMusicValue;

    // Apply enable/disable hidden settings
    if (wallpaperSettingsPanel) {
        if (enableHiddenSettingsValue) {
            wallpaperSettingsPanel.classList.remove('disabled');
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

    // Terapkan efek salju
    ipcRenderer.send('set-snow-feature-enabled', snowEnabledVal);
    if (snowEnabledVal) {
        ipcRenderer.send('show-snow-effect');
    } else {
        ipcRenderer.send('hide-snow-effect');
    }

    ipcRenderer.send('set-mini-player-feature-enabled', miniPlayerEnabledVal);

    // Debug overlay
    ipcRenderer.send('save-settings', { showLogOverlay: toggleLogOverlayCheckbox.checked });

    if (idleReturn) {
        resetIdleTimer(); // Fungsi ini harus sudah ada dari kodemu
    } else {
        clearTimeout(idleTimer); // Fungsi ini harus sudah ada dari kodemu
    }
    const diffLines = buildSettingsDiffLines(beforeSettings, partial);
    showNotification('Settings applied!', 'notification-success', diffLines.length > 0 ? diffLines : ['No changes detected.']); // Beri feedback
    optionsUiBaselineSnapshot = partial;
});
//------------------- end apply pengaturan opsi -------------------------//

//------------------- discord rpc integration -------------------------//
// Integrasi Discord Rich Presence
const enableRpcCheckbox = document.getElementById('enable-rpc-checkbox');
if (enableRpcCheckbox) {
    enableRpcCheckbox.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        ipcRenderer.send('set-rpc-enabled', isEnabled);

        // Simpan juga pengaturannya agar tetap ada saat aplikasi dibuka kembali
        ipcRenderer.send("save-settings", { rpcEnabled: isEnabled });
    });
}

// Saat aplikasi masuk ke menu utama (misalnya, setelah intro selesai)
function onMainMenuLoad() {
    ipcRenderer.send('update-rpc-activity', {
        details: 'Di Menu Utama',
        state: 'Mencari novel atau musik'
    });
}

// Saat lagu mulai diputar (di dalam fungsi loadSong atau event play)
function onSongPlay(song) {
    ipcRenderer.send('update-rpc-activity', {
        songTitle: song.title,
        songArtist: song.artist,
        smallImageKey: 'play_icon',
        smallImageText: 'Sedang Memutar'
    });
}

// Saat pengguna masuk ke menu pemilihan Visual Novel
function onVnMenuLoad() {
    ipcRenderer.send('update-rpc-activity', {
        details: 'Memilih Visual Novel',
        state: 'Mencari cerita menarik'
    });
}

// Saat pengguna mulai memainkan chapter sebuah novel
function onChapterPlay(novelTitle, chapterTitle) {
    ipcRenderer.send('update-rpc-activity', {
        details: `Bermain: ${novelTitle}`,
        state: `Chapter: ${chapterTitle}`
    });
}
function onReturnToMainMenu() {
    ipcRenderer.send('update-rpc-activity', {
        details: 'Di Menu Utama',
        state: 'Memilih-milih menu...',
        smallImageKey: null // Hapus ikon kecil
    });
}
//---------------------------- End Discord RPC --------------------------//
//------------------- end discord rpc integration -------------------------//

//------------------- internet connection handler -------------------------//
// Pengendali koneksi internet dengan ping monitoring
//---------------------------- Tombol "Connect to Internet" --------------------------//
let pingInterval = null;
const connectButton = document.getElementById('connect-button');
const connectionDetails = document.getElementById('connection-details');
const disconnectButton = document.getElementById('disconnect-button');
const buttonText = connectButton.querySelector('.button-text');
const spinner = connectButton.querySelector('.loading-spinner');

// Elemen di dalam modal & di header utama
const pingValueElModal = document.querySelector('#ping-indicator-options .ping-value');
const pingDotElModal = document.querySelector('#ping-indicator-options .ping-dot');
const pingValueElGlobal = document.querySelector('#connection-status #ping-indicator .ping-value');
const pingDotElGlobal = document.querySelector('#connection-status #ping-indicator .ping-dot');

window.internetConnectionAllowed = false;

// 2. Fungsi Terpusat untuk Mengelola Tampilan (State Machine UI)
function updateConnectionUI(state, data = {}) {
    // Reset semua state visual
    spinner.style.display = 'none';
    connectionDetails.classList.add('hidden');
    connectButton.classList.remove('connecting', 'connected', 'disabled');
    connectButton.disabled = false;

    switch (state) {
        case 'DISCONNECTED':
            buttonText.textContent = 'Connect to Internet';
            if (pingValueElGlobal) pingValueElGlobal.textContent = '';
            if (pingDotElGlobal) pingDotElGlobal.className = 'ping-dot';
            if (pingInterval) clearInterval(pingInterval);
            pingInterval = null;
            break;

        case 'CONNECTING':
            buttonText.textContent = 'Connecting...';
            spinner.style.display = 'inline-block';
            connectButton.classList.add('connecting');
            connectButton.disabled = true;
            break;

        case 'CONNECTED':
            buttonText.textContent = `Connected (${data.latency}ms)`;
            connectButton.classList.add('connected');
            connectButton.disabled = true;
            connectionDetails.classList.remove('hidden');

            // Update kedua indikator ping
            [pingValueElModal, pingValueElGlobal].forEach(el => { if (el) el.textContent = `${data.latency}ms`; });
            [pingDotElModal, pingDotElGlobal].forEach(el => { if (el) el.className = `ping-dot ${data.dotClass}`; });
            break;

        case 'OFFLINE':
            buttonText.textContent = 'Connection Lost';
            connectButton.classList.add('disabled');
            connectButton.disabled = true;

            // Update kedua indikator ping
            [pingValueElModal, pingValueElGlobal].forEach(el => { if (el) el.textContent = 'Offline'; });
            [pingDotElModal, pingDotElGlobal].forEach(el => { if (el) el.className = 'ping-dot poor'; });

            if (pingInterval) clearInterval(pingInterval);
            pingInterval = null;
            break;
    }
}

// 3. Fungsi Inti yang Sudah Dirapikan
function connectToInternet() {
    if (!navigator.onLine) {
        showNotification('Tidak ada koneksi jaringan.', 'notification-error');
        updateConnectionUI('OFFLINE');
        return;
    }
    updateConnectionUI('CONNECTING');

    fetch('https://www.google.com', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) })
        .then(() => {
            const latency = Date.now() - (start || 0); // Ambil waktu start dari scope luar
            let dotClass = 'poor';
            if (latency < 150) dotClass = 'good';
            else if (latency < 400) dotClass = 'moderate';

            updateConnectionUI('CONNECTED', { latency, dotClass });

            if (!pingInterval) {
                pingInterval = setInterval(updatePingStatus, 2500);
            }
        })
        .catch(() => {
            showNotification('Gagal terhubung ke internet.', 'notification-error');
            updateConnectionUI('DISCONNECTED');
        });
    const start = Date.now();
}

function updatePingStatus() {
    if (!window.internetConnectionAllowed || !navigator.onLine) {
        updateConnectionUI('OFFLINE');
        return;
    }
    const start = Date.now();
    fetch('https://www.google.com', { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(4000) })
        .then(() => {
            const latency = Date.now() - start;
            let dotClass = 'poor';
            if (latency < 150) dotClass = 'good';
            else if (latency < 400) dotClass = 'moderate';

            // Cukup update teks, tidak perlu mengubah state 'CONNECTED' lagi
            buttonText.textContent = `Connected (${latency}ms)`;
            [pingValueElModal, pingValueElGlobal].forEach(el => { if (el) el.textContent = `${latency}ms`; });
            [pingDotElModal, pingDotElGlobal].forEach(el => { if (el) el.className = `ping-dot ${dotClass}`; });
        })
        .catch(() => updateConnectionUI('OFFLINE'));
}

// 4. Event Listeners yang Sudah Dirapikan dan Ditambah
connectButton.addEventListener('click', () => {
    ipcRenderer.send('connect-to-internet');
    window.internetConnectionAllowed = true;
    connectToInternet();
});

disconnectButton.addEventListener('click', () => {
    window.internetConnectionAllowed = false;
    ipcRenderer.send('disconnect-from-internet'); // Kirim sinyal jika perlu
    updateConnectionUI('DISCONNECTED');
    showNotification('Koneksi internet diputus oleh aplikasi.');
});

window.addEventListener('offline', () => {
    showNotification('Koneksi internet terputus!', 'notification-error');
    updateConnectionUI('OFFLINE');
});

window.addEventListener('online', () => {
    if (window.internetConnectionAllowed) {
        showNotification('Koneksi kembali, mencoba menyambungkan ulang...', 'notification-warning');
        connectToInternet();
    }
});

// Inisialisasi tampilan koneksi awal
updateConnectionUI(navigator.onLine ? 'DISCONNECTED' : 'OFFLINE');

//----------------------------- End Tombol "Connect to Internet" -----------------------------//
//------------------- end internet connection handler -------------------------//

//------------------- debug overlay window -------------------------//
// Debug logging window untuk memantau aplikasi
//--------------------------------------- Debug ---------------------------------------------//
document.addEventListener('DOMContentLoaded', () => {
    const logWindow = document.getElementById('log-window-container');
    if (!logWindow) {
        console.warn('[Debug] log-window-container tidak ditemukan di DOM');
        return;
    }
    const titleBar = logWindow.querySelector('.log-title-bar');
    const logContent = document.getElementById('log-content');
    const toggleLogCheckbox = document.getElementById('toggle-log-overlay-checkbox');
    let isDragging = false, isResizing = false;
    let offsetX, offsetY, startWidth, startHeight, startX, startY;

    let logBuffer = [];
    const MAX_BUFFER_SIZE = 500;

    // --- Logika Dragging dan Resizing tetap sama ---
    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - logWindow.offsetLeft;
        offsetY = e.clientY - logWindow.offsetTop;
        document.addEventListener('mousemove', onMouseMoveDrag);
        document.addEventListener('mouseup', onMouseUpDrag);
    });

    function onMouseMoveDrag(e) {
        if (!isDragging) return;
        // Hitung posisi baru jendela
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        logWindow.style.left = `${newX}px`;
        logWindow.style.top = `${newY}px`;
    }

    function onMouseUpDrag() {
        isDragging = false;
        // Hapus listener dari document setelah drag selesai
        document.removeEventListener('mousemove', onMouseMoveDrag);
        document.removeEventListener('mouseup', onMouseUpDrag);
    }

    // --- LOGIKA RESIZING JENDELA ---
    const resizer = logWindow.querySelector('.resizer-se');
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Mencegah event lain seperti text selection
        isResizing = true;
        // Simpan ukuran dan posisi awal
        startWidth = logWindow.offsetWidth;
        startHeight = logWindow.offsetHeight;
        startX = e.clientX;
        startY = e.clientY;

        document.addEventListener('mousemove', onMouseMoveResize);
        document.addEventListener('mouseup', onMouseUpResize);
    });

    function onMouseMoveResize(e) {
        if (!isResizing) return;
        // Hitung perubahan lebar dan tinggi
        const newWidth = startWidth + (e.clientX - startX);
        const newHeight = startHeight + (e.clientY - startY);
        logWindow.style.width = `${newWidth}px`;
        logWindow.style.height = `${newHeight}px`;
    }

    function onMouseUpResize() {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMoveResize);
        document.removeEventListener('mouseup', onMouseUpResize);
    }

    // MERENDER SATU BARIS LOG KE DOM ---
    function renderLogLine(logItem) {
        if (!logContent) return;
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = `[${logItem.timestamp.toLocaleTimeString()}] ${logItem.message}`;

        if (logItem.type === 'warn') line.style.color = '#ffee77';
        if (logItem.type === 'error') line.style.color = '#ff7777';

        logContent.appendChild(line);
        logContent.scrollTop = logContent.scrollHeight; // Otomatis scroll ke bawah
    }

    // --- append log dengan buffer ---
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;

    function appendLogToBufferAndUI(type, args) {
        // Format pesan dan selalu simpan ke buffer
        const message = args.map(a => {
            if (typeof a === 'object' && a !== null) {
                try {
                    return JSON.stringify(a, null, 2);
                } catch (e) {
                    try {
                        return String(a);
                    } catch (e2) {
                        return '[Object]';
                    }
                }
            }
            return a;
        }).join(' ');

        const logItem = { type, message, timestamp: new Date() };
        logBuffer.push(logItem);

        // Batasi ukuran buffer
        if (logBuffer.length > MAX_BUFFER_SIZE) {
            logBuffer.shift();
        }

        // Hanya tampilkan di UI jika jendela sedang aktif
        if (toggleLogCheckbox.checked) {
            renderLogLine(logItem);
        }
    }

    // Ganti fungsi console global untuk menggunakan buffer
    if (!console.isPatched) {
        console.log = (...args) => { origLog.apply(console, args); appendLogToBufferAndUI('log', args); };
        console.warn = (...args) => { origWarn.apply(console, args); appendLogToBufferAndUI('warn', args); };
        console.error = (...args) => { origError.apply(console, args); appendLogToBufferAndUI('error', args); };
        console.isPatched = true;
    }

    if (toggleLogCheckbox) {
        toggleLogCheckbox.addEventListener('change', e => {
            const isEnabled = e.target.checked;
            logWindow.classList.toggle('hidden', !isEnabled);

            if (isEnabled) {
                // Saat jendela dibuka, "flush" semua log dari buffer ke UI
                console.log(`[Debug] Jendela Log diaktifkan. Memuat ${logBuffer.length} log dari buffer...`);
                logContent.innerHTML = ''; // bersih sebelum memuat
                logBuffer.forEach(logItem => renderLogLine(logItem)); // Render semua log yang sudah ada
            } else {
                // Saat jendela ditutup, cukup kosongkan UI. Buffer tetap menyimpan data.
                console.log(`[Debug] Jendela Log dinonaktifkan.`);
                if (logContent) {
                    logContent.innerHTML = '';
                }
            }
        });
    }
});
//------------------------------------------ End debug ----------------------------------------------//
//------------------- end debug overlay window -------------------------//

//------------------- audio muffled effect system -------------------------//
// Sistem efek suara "muffled/terpendam" untuk quit popup
// Filter dan gain node dibuat di chain audio utama (saat audioCtx init)
// Variabel ini akan diisi saat audio context pertama kali diinisialisasi
let quitPopupAudioContext = null;
let quitPopupLowpassFilter = null;
let quitPopupGainNode = null;
let quitPopupAudioConnected = false;

// Fungsi untuk mengaktifkan efek muffled (dipanggil saat quit popup muncul)
// Filter sudah terhubung di chain audio utama, fungsi ini hanya mengubah parameter
function applyQuitPopupMuffledEffect() {
    // Kirim pesan ke webview untuk menerapkan efek muffled di sana juga
    // Ini untuk musik online dari YouTube Music dll
    const webview = document.getElementById('external-webview');
    if (webview) {
        try {
            webview.send('apply-muffled-effect');
            console.log('[QuitPopup Audio] Mengirim apply-muffled-effect ke webview');
        } catch (e) {
            console.warn('[QuitPopup Audio] Gagal mengirim ke webview:', e);
        }
    }

    // Cek apakah audio chain lokal sudah di-setup
    if (!quitPopupAudioConnected || !quitPopupLowpassFilter || !quitPopupGainNode || !quitPopupAudioContext) {
        console.warn('[QuitPopup Audio] Audio chain lokal belum ready, skip efek muffled untuk musik lokal.');
        return;
    }

    try {
        // Resume context kalau suspended
        if (quitPopupAudioContext.state === 'suspended') {
            quitPopupAudioContext.resume();
        }

        // Terapkan efek muffled dengan transisi smooth
        const currentTime = quitPopupAudioContext.currentTime;
        const transitionDuration = 0.3; // 300ms transisi

        // Turunkan cutoff frequency untuk efek "terpendam" (potong frekuensi tinggi)
        // 400-600Hz memberikan kesan seperti suara dari balik dinding/air
        quitPopupLowpassFilter.frequency.cancelScheduledValues(currentTime);
        quitPopupLowpassFilter.frequency.setValueAtTime(
            quitPopupLowpassFilter.frequency.value,
            currentTime
        );
        quitPopupLowpassFilter.frequency.linearRampToValueAtTime(500, currentTime + transitionDuration);

        // Naikkan Q sedikit untuk bass boost (bikin bass lebih "berasa")
        quitPopupLowpassFilter.Q.cancelScheduledValues(currentTime);
        quitPopupLowpassFilter.Q.setValueAtTime(quitPopupLowpassFilter.Q.value, currentTime);
        quitPopupLowpassFilter.Q.linearRampToValueAtTime(2.5, currentTime + transitionDuration);

        // Kurangi volume sedikit untuk efek "jauh/terpendam"
        quitPopupGainNode.gain.cancelScheduledValues(currentTime);
        quitPopupGainNode.gain.setValueAtTime(quitPopupGainNode.gain.value, currentTime);
        quitPopupGainNode.gain.linearRampToValueAtTime(0.7, currentTime + transitionDuration);

        console.log('[QuitPopup Audio] Efek muffled diaktifkan - suara akan terdengar terpendam dengan bass boost');
    } catch (error) {
        console.error('[QuitPopup Audio] Gagal menerapkan efek muffled:', error);
    }
}

// Fungsi untuk menghilangkan efek muffled dan mengembalikan audio normal
function removeQuitPopupMuffledEffect() {
    // Kirim pesan ke webview untuk menghapus efek muffled di sana juga
    const webview = document.getElementById('external-webview');
    if (webview) {
        try {
            webview.send('remove-muffled-effect');
            console.log('[QuitPopup Audio] Mengirim remove-muffled-effect ke webview');
        } catch (e) {
            console.warn('[QuitPopup Audio] Gagal mengirim ke webview:', e);
        }
    }

    // Proses audio lokal
    if (!quitPopupAudioContext || !quitPopupAudioConnected) {
        return;
    }

    try {
        const currentTime = quitPopupAudioContext.currentTime;
        const transitionDuration = 0.25; // 250ms transisi balik

        // Kembalikan cutoff frequency ke full range
        quitPopupLowpassFilter.frequency.cancelScheduledValues(currentTime);
        quitPopupLowpassFilter.frequency.setValueAtTime(
            quitPopupLowpassFilter.frequency.value,
            currentTime
        );
        quitPopupLowpassFilter.frequency.linearRampToValueAtTime(22050, currentTime + transitionDuration);

        // Kembalikan Q ke normal
        quitPopupLowpassFilter.Q.cancelScheduledValues(currentTime);
        quitPopupLowpassFilter.Q.setValueAtTime(quitPopupLowpassFilter.Q.value, currentTime);
        quitPopupLowpassFilter.Q.linearRampToValueAtTime(0.7, currentTime + transitionDuration);

        // Kembalikan volume ke 100%
        quitPopupGainNode.gain.cancelScheduledValues(currentTime);
        quitPopupGainNode.gain.setValueAtTime(quitPopupGainNode.gain.value, currentTime);
        quitPopupGainNode.gain.linearRampToValueAtTime(1.0, currentTime + transitionDuration);

        console.log('[QuitPopup Audio] Efek muffled dinonaktifkan - audio kembali normal');
    } catch (error) {
        console.error('[QuitPopup Audio] Gagal menghapus efek muffled:', error);
    }
}
//------------------- end audio muffled effect system -------------------------//

//------------------- quit button handler -------------------------//
// Penanganan tombol Quit
//------------- Tombol Quit ------------//
// Event listener untuk tombol "Quit" di MAIN MENU
quitMenu.addEventListener('click', () => {
    if (optionsModal && optionsModal.classList.contains('open')) {
        if (closeOptionsBtn) {
            closeOptionsBtn.click();
        } else {
            optionsModal.classList.remove('open');
            setTimeout(() => {
                if (!optionsModal.classList.contains('open')) {
                    optionsModal.classList.add('hidden');
                }
            }, 200);
        }
    }

    // Tampilkan custom quit popup yang baru + aktifkan efek audio muffled
    if (customQuitPopup) {
        customQuitPopup.classList.remove('hidden');
        requestAnimationFrame(() => {
            customQuitPopup.classList.add('visible');
        });
        // Aktifkan efek suara "terpendam" untuk drama effect
        applyQuitPopupMuffledEffect();
    }
});

// Event listener untuk tombol "Batal" di custom quit popup
if (customCancelQuitBtn) {
    customCancelQuitBtn.addEventListener('click', () => {
        // Kembalikan audio ke normal dulu
        removeQuitPopupMuffledEffect();

        if (customQuitPopup) {
            customQuitPopup.classList.remove('visible', 'quitting');
            setTimeout(() => {
                customQuitPopup.classList.add('hidden');
            }, 250);
        }
    });
}

if (customConfirmQuitBtn) {
    customConfirmQuitBtn.addEventListener('click', () => {
        // Kembalikan audio ke normal sebelum keluar (opsional, tapi biar konsisten)
        removeQuitPopupMuffledEffect();

        // Tambahkan class quitting untuk memicu animasi lucu
        if (customQuitPopup) {
            customQuitPopup.classList.add('quitting');

            // Tunggu animasi selesai (1.8s untuk animasi kaomoji) sebelum quit
            setTimeout(() => {
                ipcRenderer.send('quit-application');
                customQuitPopup.classList.remove('visible', 'quitting');
                customQuitPopup.classList.add('hidden');
            }, 2500); // sinkron dengan durasi animasi CSS (2.4s)
        } else {
            // Fallback kalau popup gak ketemu
            ipcRenderer.send('quit-application');
        }
    });
}
//---------- End Tombol Quit ----------//


/* -------------------------------------------------- */
/* Fungsi2 pendukung: update UI musik, next wallpaper */
/* -------------------------------------------------- */
// Membatasi jumlah karakter agar tampilan tetap rapi di berbagai ukuran layar
const truncateMusicTitle = (text, maxLength = 120) => {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};
const audioElement = document.getElementById('background-audio');
const titleElement = document.getElementById('music-title');
const titleElementExpand = document.getElementById('now-playing-song');
const progressBar = document.getElementById('progress-bar');
const musicControl = document.getElementById('music-control');
const expandCollapseButton = document.getElementById('expand-collapse');
const playlistElement = document.getElementById('playlist');

// Get elements from the hidden wallpaper settings panel
const followMusicCheckboxHidden = document.getElementById('follow-music-title');
const darknessSliderHidden = document.getElementById('wallpaper-darkness');

const enableVideoWallpaperCheckbox = document.getElementById('enable-video-wallpaper');
const wallpaperVideo = document.getElementById("character-background");
const wallpaperImage = document.getElementById("character-background-image");
const wallpaperControl = document.getElementById('wallpaper-control');
const pauseWallpaperButton = document.getElementById("pause-wallpaper");
const triggerZone = document.querySelector('#wallpaper-control .trigger-zone');
const wallpaperSettings = document.getElementById('wallpaper-settings');

// Get elements from the options modal wallpaper pane
const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings'); // New checkbox

const enableOverlayCheckbox = document.getElementById('enable-overlay-checkbox');
const enableDynamicThemeCheckbox = document.getElementById('enable-dynamic-theme-checkbox');
const dynamicThemeSubOptions = document.getElementById('dynamic-theme-sub-options');
const dynamicThemeModeSelect = document.getElementById('dynamic-theme-mode-select');
const playbackSpeedSelect = document.getElementById('playback-speed-select');
const enableRhythmOverlayCheckbox = document.getElementById('enable-rhythm-overlay-checkbox');
const rhythmOverlaySubOptions = document.getElementById('rhythm-overlay-sub-options');
const rhythmHideNowPlayingCheckbox = document.getElementById('rhythm-hide-nowplaying-checkbox');

function sanitizeDynamicThemeMode(mode) {
    if (!mode || mode === 'default') return 'default-optimized';
    return mode === 'unified' ? 'overlay' : mode;
}

function toggleDynamicThemeSubOptions() {
    if (!dynamicThemeSubOptions || !enableDynamicThemeCheckbox) return;
    dynamicThemeSubOptions.style.display = enableDynamicThemeCheckbox.checked ? 'block' : 'none';
}

function applyDynamicThemeState(runtimeSettings = null) {
    const webview = document.getElementById('external-webview');
    const isProfileOverride = runtimeSettings && typeof runtimeSettings === 'object';
    const isEnabled = isProfileOverride
        ? runtimeSettings.dynamicThemeEnabled === true
        : (enableDynamicThemeCheckbox ? enableDynamicThemeCheckbox.checked : false);
    const selectedMode = isProfileOverride
        ? sanitizeDynamicThemeMode(runtimeSettings.dynamicThemeMode)
        : (dynamicThemeModeSelect ? sanitizeDynamicThemeMode(dynamicThemeModeSelect.value) : 'default-optimized');

    if (!isProfileOverride) toggleDynamicThemeSubOptions();

    if (!isProfileOverride) {
        ipcRenderer.send('save-settings', {
            dynamicThemeEnabled: isEnabled,
            dynamicThemeMode: selectedMode
        });
    }

    const isWebviewActive = (typeof webviewActive !== 'undefined') ? webviewActive : false;
    if (!isWebviewActive || !webview) return;

    const runWhenReady = (fn) => {
        try {
            if (webview.isLoading && webview.isLoading()) {
                webview.addEventListener('did-finish-load', () => fn(), { once: true });
                return;
            }
        } catch (_) { }
        fn();
    };

    if (!isEnabled) {
        runWhenReady(() => {
            webview.executeJavaScript(`
        try {
            if (typeof window.disableDynamicTheme === 'function') {
                window.disableDynamicTheme();
                true;
            } else {
                false;
            }
        } catch (e) {
            console.error('[DynamicTheme] disableDynamicTheme() failed:', e);
            false;
        }
    `).catch(() => { });
        });
        return;
    }

    runWhenReady(() => {
        webview.executeJavaScript(`
    try {
        // IMPORTANT: enabling must call enableDynamicTheme() (it clears internal disabled state).
        // updateThemeMode() only switches mode and won't re-enable after disableDynamicTheme().
        if (typeof window.enableDynamicTheme === 'function') {
            window.enableDynamicTheme('${selectedMode}');
            true;
        } else if (typeof window.updateThemeMode === 'function') {
            window.updateThemeMode('${selectedMode}');
            true;
        } else {
            false;
        }
    } catch (e) {
        console.error('[DynamicTheme] apply failed:', e);
        false;
    }
`).then((handled) => {
            if (!handled) {
                if (typeof injectDynamicTheme === 'function') {
                    injectDynamicTheme(webview, selectedMode);
                }
            }
        }).catch(() => {
            if (typeof injectDynamicTheme === 'function') {
                injectDynamicTheme(webview, selectedMode);
            }
        });
    });
}

function sanitizePlaybackSpeed(mode) {
    return ['0.75', '1.0', '1.25', '1.5', 'nightcore'].includes(String(mode)) ? String(mode) : '1.0';
}

function applyGamePlaybackSpeed(value) {
    const selectedValue = sanitizePlaybackSpeed(value);
    const speed = selectedValue === 'nightcore' ? 1.5 : parseFloat(selectedValue);
    const preservesPitch = selectedValue !== 'nightcore';

    if (typeof audioElement !== 'undefined' && audioElement &&
        (typeof controlMode === 'undefined' || controlMode === 'local')) {
        audioElement.playbackRate = speed;
        audioElement.preservesPitch = preservesPitch;
        if (audioElement.webkitPreservesPitch !== undefined) audioElement.webkitPreservesPitch = preservesPitch;
        if (audioElement.mozPreservesPitch !== undefined) audioElement.mozPreservesPitch = preservesPitch;
    }

    const webview = document.getElementById('external-webview');
    if (webview && ((typeof controlMode !== 'undefined' && controlMode === 'webview') || (typeof webviewActive !== 'undefined' && webviewActive))) {
        webview.executeJavaScript(`
            (() => {
                const video = document.querySelector('video');
                if (!video) return false;
                video.playbackRate = ${speed};
                video.preservesPitch = ${preservesPitch};
                if (video.webkitPreservesPitch !== undefined) video.webkitPreservesPitch = ${preservesPitch};
                if (video.mozPreservesPitch !== undefined) video.mozPreservesPitch = ${preservesPitch};
                return true;
            })();
        `).catch(() => { });
    }
}

// Dipanggil oleh music-profiles.js; nilai profile hanya diterapkan ke webview
// dan tidak pernah memodifikasi checkbox atau pengaturan global.
window.applyMusicProfileDynamicTheme = (effective) => applyDynamicThemeState(effective);
window.applyMusicProfilePlaybackSpeed = (effective) => applyGamePlaybackSpeed(effective?.playbackSpeed);
window.addEventListener('gap-music-profile-effective-settings', (event) => {
    const effective = event.detail || {};
    window.applyMusicProfileDynamicTheme(effective);
    window.applyMusicProfilePlaybackSpeed(effective);
});

if (playbackSpeedSelect) {
    playbackSpeedSelect.addEventListener('change', () => {
        const selectedValue = sanitizePlaybackSpeed(playbackSpeedSelect.value);
        playbackSpeedSelect.value = selectedValue;
        applyGamePlaybackSpeed(selectedValue);
        ipcRenderer.send('save-settings', { playbackSpeed: selectedValue });
    });
}

function toggleRhythmOverlaySubOptions() {
    if (!rhythmOverlaySubOptions || !enableRhythmOverlayCheckbox) return;
    rhythmOverlaySubOptions.style.display = enableRhythmOverlayCheckbox.checked ? 'block' : 'none';
}

if (enableRhythmOverlayCheckbox) {
    enableRhythmOverlayCheckbox.addEventListener('change', () => {
        toggleRhythmOverlaySubOptions();
        ipcRenderer.send('toggle-rhythm-overlay', enableRhythmOverlayCheckbox.checked);
        ipcRenderer.send('save-settings', { rhythmOverlayEnabled: enableRhythmOverlayCheckbox.checked });
    });
}

if (rhythmHideNowPlayingCheckbox) {
    rhythmHideNowPlayingCheckbox.addEventListener('change', () => {
        ipcRenderer.send('set-rhythm-hide-nowplaying', rhythmHideNowPlayingCheckbox.checked);
        ipcRenderer.send('save-settings', { rhythmHideNowPlaying: rhythmHideNowPlayingCheckbox.checked });
    });
}

toggleRhythmOverlaySubOptions();

ipcRenderer.invoke('load-settings').then((settings) => {
    if (!settings || typeof settings !== 'object') return;
    if (enableRhythmOverlayCheckbox) {
        enableRhythmOverlayCheckbox.checked = settings.rhythmOverlayEnabled === true;
        toggleRhythmOverlaySubOptions();
        ipcRenderer.send('toggle-rhythm-overlay', enableRhythmOverlayCheckbox.checked);
    }
    if (rhythmHideNowPlayingCheckbox) {
        rhythmHideNowPlayingCheckbox.checked = settings.rhythmHideNowPlaying === true;
        ipcRenderer.send('set-rhythm-hide-nowplaying', rhythmHideNowPlayingCheckbox.checked);
    }
    if (enableDynamicThemeCheckbox) enableDynamicThemeCheckbox.checked = settings.dynamicThemeEnabled === true;
    if (dynamicThemeModeSelect) dynamicThemeModeSelect.value = sanitizeDynamicThemeMode(settings.dynamicThemeMode);
    if (playbackSpeedSelect) {
        playbackSpeedSelect.value = sanitizePlaybackSpeed(settings.playbackSpeed);
        applyGamePlaybackSpeed(playbackSpeedSelect.value);
    }
    toggleDynamicThemeSubOptions();
});

let currentWallpaperIndex = 0;
let isWallpaperPaused = false;
let isManuallyPaused = false;
let hideTimeout;
let autoChangeTimer = null;

// Variabel untuk menyimpan source video title screen (untuk restore setelah di-unload)
let titleVideoSource = null;

ipcRenderer.on('fade-music-and-transition', () => {
    const fadeDuration = 4000;
    const fadeStep = 0.001;

    document.body.classList.add('fade-out');

    // Mulai fade-out musik menggunakan sistem volume global
    let fadeInterval = setInterval(() => {
        // Cek variabel global, bukan audioElement.volume
        if (currentGlobalVolume > fadeStep) {
            // Hitung volume baru
            const newVolume = Math.max(currentGlobalVolume - fadeStep, 0);
            // Kirim perintah untuk mengubah volume global
            ipcRenderer.send('set-global-volume', newVolume);
        } else {
            // Proses selesai
            clearInterval(fadeInterval);
            audioElement.pause(); // Tetap pause audio lokal untuk sicurezza
            // Kirim sinyal ke backend untuk pindah halaman
            ipcRenderer.send('navigate-to-vn');
        }
    }, fadeDuration * fadeStep);
});

function startAutoChangeWallpaper() {
    if (autoChangeTimer) clearInterval(autoChangeTimer);
    const intervalMinutes = parseInt(sessionStorage.getItem("savedAutoChangeInterval")) || 5;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[Wallpaper] Starting auto change every ${intervalMinutes} minutes.`);
    autoChangeTimer = setInterval(() => {
        changeWallpaper(true);
    }, intervalMs);
}

function stopAutoChangeWallpaper() {
    if (autoChangeTimer) {
        clearInterval(autoChangeTimer);
        autoChangeTimer = null;
        console.log(`[Wallpaper] Auto change stopped.`);
    }
}

function changeWallpaper(isAuto = false) {
    // Skip jika fitur video wallpaper dinonaktifkan
    if (!enableVideoWallpaperCheckbox || !enableVideoWallpaperCheckbox.checked) {
        console.log('[Wallpaper] Skip change, fitur dinonaktifkan');
        return;
    }

    // Fade out elemen yang sedang aktif
    wallpaperVideo.classList.add('fade-out');
    wallpaperImage.classList.add('fade-out');

    setTimeout(() => {
        const isRandom = sessionStorage.getItem("savedRandomWallpaperOrder") === "true";
        let nextIndex;

        if (isRandom) {
            nextIndex = Math.floor(Math.random() * wallpapers.length);
            if (nextIndex === currentWallpaperIndex && wallpapers.length > 1) {
                nextIndex = (nextIndex + 1) % wallpapers.length;
            }
        } else {
            nextIndex = (currentWallpaperIndex + 1) % wallpapers.length;
        }

        currentWallpaperIndex = nextIndex;
        const newWallpaper = wallpapers[currentWallpaperIndex];

        displayWallpaper(newWallpaper);

        document.getElementById('wallpaper-name').textContent = `Current: ${newWallpaper.name}`;

        // Fade in elemen yang baru aktif
        setTimeout(() => {
            wallpaperVideo.classList.remove('fade-out', 'fade-in');
            wallpaperImage.classList.remove('fade-out', 'fade-in');
        }, 250);
    }, 250);
}

// Helper untuk menampilkan wallpaper sesuai tipe media (video atau gambar)
function displayWallpaper(wp) {
    if (!wp) return;

    const isVideo = (wp.mediaType === 'video') || (!wp.mediaType && wp.type && wp.type.startsWith('video'));

    if (isVideo) {
        // Sembunyikan gambar, tampilkan video
        wallpaperImage.style.display = 'none';
        wallpaperVideo.style.display = 'block';
        wallpaperVideo.src = wp.src;
        wallpaperVideo.type = wp.type;
        wallpaperVideo.load();
        if (!isManuallyPaused) {
            wallpaperVideo.play();
        }
        wallpaperVideo.classList.add('fade-in');

        // Tombol pause relevan untuk video
        pauseWallpaperButton.style.display = 'block';
    } else {
        // Sembunyikan video, tampilkan gambar
        wallpaperVideo.pause();
        wallpaperVideo.style.display = 'none';
        wallpaperImage.style.display = 'block';
        wallpaperImage.src = wp.src;
        wallpaperImage.classList.add('fade-in');

        // Tombol pause tidak relevan untuk gambar
        pauseWallpaperButton.style.display = 'none';
    }
}

document.getElementById('next-wallpaper').addEventListener('click', () => changeWallpaper(false));

// -------- yang mengangani Wallpaper setting, dan menu tersembunyi itu ---------- //
pauseWallpaperButton.addEventListener("click", () => {
    if (isWallpaperPaused) {
        wallpaperVideo.play();
        pauseWallpaperButton.textContent = "▐▐";
        isManuallyPaused = false;
    } else {
        wallpaperVideo.pause();
        pauseWallpaperButton.textContent = "▶";
        isManuallyPaused = true;
    }
    isWallpaperPaused = !isWallpaperPaused;
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        updateMusicUI();
    }
});

// Listener for the hidden wallpaper settings checkbox
if (followMusicCheckboxHidden) {
    followMusicCheckboxHidden.addEventListener("change", () => {
        // Skip jika fitur wallpaper dinonaktifkan
        if (!enableVideoWallpaperCheckbox || !enableVideoWallpaperCheckbox.checked) return;

        if (followMusicCheckboxHidden.checked) {
            const currentSongTitle = songs[currentSongIndex]?.title;
            const matchedWallpaper = wallpapers.find(wallpaper => wallpaper.name === currentSongTitle);
            if (matchedWallpaper) {
                displayWallpaper(matchedWallpaper);
                document.getElementById("wallpaper-name").textContent = `Current: ${matchedWallpaper.name}`;
            }
        }
    });
}

// Listener for the options modal wallpaper pane checkbox
if (optionsPaneFollowMusicCheckbox) {
    optionsPaneFollowMusicCheckbox.addEventListener("change", () => {
        // Skip jika fitur wallpaper dinonaktifkan
        if (!enableVideoWallpaperCheckbox || !enableVideoWallpaperCheckbox.checked) return;

        if (optionsPaneFollowMusicCheckbox.checked) {
            const currentSongTitle = songs[currentSongIndex]?.title;
            const matchedWallpaper = wallpapers.find(wallpaper => wallpaper.name === currentSongTitle);
            if (matchedWallpaper) {
                displayWallpaper(matchedWallpaper);
                document.getElementById("wallpaper-name").textContent = `Current: ${matchedWallpaper.name}`;
            }
        }
    });
}


audioElement.addEventListener('play', () => {
    // Check both checkboxes when music starts playing
    // Hanya set wallpaper jika fitur video wallpaper AKTIF
    const isWallpaperFeatureEnabled = enableVideoWallpaperCheckbox && enableVideoWallpaperCheckbox.checked;
    if (isWallpaperFeatureEnabled && ((followMusicCheckboxHidden && followMusicCheckboxHidden.checked) || (optionsPaneFollowMusicCheckbox && optionsPaneFollowMusicCheckbox.checked))) {
        const currentSongTitle = songs[currentSongIndex]?.title;
        const matchedWallpaper = wallpapers.find(wallpaper => wallpaper.name === currentSongTitle);
        if (matchedWallpaper) {
            displayWallpaper(matchedWallpaper);
            document.getElementById("wallpaper-name").textContent = `Current: ${matchedWallpaper.name}`;
        }
    }
    sendDataToMiniPlayer();
    broadcastPlayerState();
});

// Simpan data wallpaper terakhir untuk restore saat diaktifkan kembali
let lastWallpaperData = null;

function applyVideoWallpaperState(isEnabled) {
    // Disable interaction with brightness, etc if disabled
    const sliders = document.querySelectorAll('.wallpaper-darkness, .wallpaper-blur, .wallpaper-grayscale, .wallpaper-zoom');
    sliders.forEach(slider => {
        slider.disabled = !isEnabled;
        const row = slider.closest('.option-row');
        if (row) {
            row.style.opacity = isEnabled ? '1' : '0.5';
            row.style.pointerEvents = isEnabled ? 'auto' : 'none';
        }
    });

    if (isEnabled) {
        wallpaperControl.style.display = 'flex';

        // Restore wallpaper jika ada data tersimpan
        if (lastWallpaperData) {
            displayWallpaper(lastWallpaperData);
        } else if (wallpapers.length > 0) {
            // Atau tampilkan wallpaper pertama
            displayWallpaper(wallpapers[0]);
        }
    } else {
        // Simpan data wallpaper sebelum dinonaktifkan
        if (currentWallpaperIndex >= 0 && currentWallpaperIndex < wallpapers.length) {
            lastWallpaperData = wallpapers[currentWallpaperIndex];
        }

        // Hentikan video dan lepas GPU decoder
        wallpaperVideo.pause();
        wallpaperVideo.removeAttribute('src');
        wallpaperVideo.load();

        // Sembunyikan keduanya
        wallpaperVideo.style.display = 'none';
        wallpaperImage.style.display = 'none';
        wallpaperControl.style.display = 'none';
        console.log('[Wallpaper] Wallpaper dinonaktifkan, resource dibebaskan');
    }
}
if (enableVideoWallpaperCheckbox) {
    enableVideoWallpaperCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        applyVideoWallpaperState(isEnabled);

        ipcRenderer.send('save-settings', { videoWallpaperEnabled: isEnabled });
    });
}

const openMainDevtoolsBtn = document.getElementById('open-main-devtools');
if (openMainDevtoolsBtn) {
    openMainDevtoolsBtn.addEventListener('click', () => {
        ipcRenderer.send('open-main-devtools');
    });
}

// Listener for the hidden wallpaper settings slider
if (darknessSliderHidden) {
    darknessSliderHidden.addEventListener('input', (event) => {
        const brightness = 100 - event.target.value;
        const filterValue = `brightness(${brightness}%)`;
        wallpaperVideo.style.filter = filterValue;
        wallpaperImage.style.filter = filterValue;
    });
}

// Listener for the options modal wallpaper pane slider
if (optionsPaneDarknessSlider) {
    optionsPaneDarknessSlider.addEventListener('input', (event) => {
        const brightness = 100 - event.target.value;
        const filterValue = `brightness(${brightness}%)`;
        wallpaperVideo.style.filter = filterValue;
        wallpaperImage.style.filter = filterValue;
    });
}


function showPanel() {
    // Only show the panel if it's not disabled
    if (wallpaperSettings && !wallpaperSettings.classList.contains('disabled')) {
        clearTimeout(hideTimeout);
        wallpaperSettings.classList.add('show');
    }
}

function hidePanel() {
    hideTimeout = setTimeout(() => {
        wallpaperSettings.classList.remove('show');
    }, 1600);
}

triggerZone.addEventListener('mouseenter', showPanel);
triggerZone.addEventListener('mouseleave', hidePanel);
wallpaperSettings.addEventListener('mouseenter', showPanel);
wallpaperSettings.addEventListener('mouseleave', hidePanel);

/* ------------------------ Bagian Musik Player ---------------------*/
// --- Engine Musik Player --- //
let currentSongIndex = 0;
let isShuffleOn = false;
let controlMode = 'local';
let shufflePlaylist = [];
let playedHistory = [];
let currentVisualizerData = [];
let lastWebviewState = null;
let latestOnlinePlaylistData = [];
let isInitialOnlineLoad = true; // Flag untuk menandai pemuatan pertama
let lastKnownOnlinePlaylistId = null;
let isManuallySwitchingSong = false;

let webviewIsPlaying = false;
let webviewCurrentTime = 0;
let webviewDuration = 0;
let webviewProgressPercent = 0;

let latestWebviewTitle = '';
let isRetryingSkip = false;

const volumeSlider = document.getElementById('volume-slider');
const currentTimeExpanded = document.getElementById('current-time-expanded');
const durationExpanded = document.getElementById('duration-expanded');
const nowPlayingSongText = document.getElementById('now-playing-song');
const musicVisualizer = document.getElementById("music-visualizer");
const playPauseBtnCollapsed = document.getElementById('play-pause');
const playPauseBtnExpanded = document.getElementById('play-pause-expanded');

const playlistToggleButton = document.getElementById('playlist-toggle-btn');

// --- Prosedur Fungsi-Fungsi Musik Player --- //
function updateMusicUI() {
    if (controlMode === 'local') {
        updatePlaylistHighlight();
        if (!audioElement.paused) {
            playPauseBtnCollapsed.textContent = '▐▐';
            playPauseBtnExpanded.textContent = '▐▐';
            musicDisk.style.animationPlayState = 'running';
        } else {
            playPauseBtnCollapsed.textContent = '▶';
            playPauseBtnExpanded.textContent = '▶';
            musicDisk.style.animationPlayState = 'paused';
        }
    } else if (controlMode === 'webview') {
        if (webviewIsPlaying) {
            playPauseBtnCollapsed.textContent = '▐▐';
            playPauseBtnExpanded.textContent = '▐▐';
            musicDisk.style.animationPlayState = 'running';
        } else {
            playPauseBtnCollapsed.textContent = '▶';
            playPauseBtnExpanded.textContent = '▶';
            musicDisk.style.animationPlayState = 'paused';
        }

        progressBarExpanded.style.width = `${webviewProgressPercent}%`;
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
            return `${minutes}:${remainingSeconds}`;
        };
        currentTimeExpanded.textContent = formatTime(webviewCurrentTime);
        durationExpanded.textContent = formatTime(webviewDuration);

        updatePlaylistHighlight();
    }
}

function generateShufflePlaylist() {
    shufflePlaylist = songs.map((_, idx) => idx).filter(idx => idx !== currentSongIndex);

    for (let i = shufflePlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shufflePlaylist[i], shufflePlaylist[j]] = [shufflePlaylist[j], shufflePlaylist[i]];
    }
}

function getNextShuffleSongIndex() {
    if (!shufflePlaylist || shufflePlaylist.length === 0) {
        generateShufflePlaylist();
    }
    return shufflePlaylist.shift();
}

// Render Playlist Lokal
function renderPlaylist() {
    playlistElement.innerHTML = '';
    songs.forEach((song, index) => {
        const li = document.createElement('li');
        li.textContent = song.title;

        li.addEventListener('click', () => {
            controlMode = 'local';

            // Hentikan webview jika sedang berjalan
            if (webviewActive && webviewIsPlaying) {
                webview.executeJavaScript('window.playerAPI.playPause()');
            }

            currentSongIndex = index;
            loadSong(currentSongIndex);
            audioElement.play();
        });
        playlistElement.appendChild(li);
    });
    updatePlaylistHighlight();
}

function renderOnlinePlaylist() {
    const playlistElement = document.getElementById('playlist');
    playlistElement.innerHTML = `
<li style="text-align: center; color: #888; cursor: default; padding: 20px 0;">
    Playlist dikelola di dalam<br>browser online.
    <br><br>
    Buka panel Online Music<br>untuk melihat daftar putar.
</li>
    `;
}

// Listener utama pada tombol toggle
playlistToggleButton.addEventListener('click', () => {
    if (activePlaylistSource === 'local') {
        switchToOnlineView();
        if (webviewActive) {
            webview.executeJavaScript('window.playerAPI.scanPlaylist()').catch(err => console.error("Gagal meminta data playlist:", err));
        }
    } else {
        switchToLocalView(true);
    }
});

function switchToLocalView(isManualSwitch = false) {
    activePlaylistSource = 'local';
    playlistToggleButton.textContent = 'Local Playlist';
    playlistToggleButton.classList.remove('online-mode');
    renderPlaylist();

    if (isManualSwitch) {
        lastKnownOnlinePlaylistId = null;
        console.log('[Manual Switch] Beralih ke Local, `lastKnownOnlinePlaylistId` direset.');
    }
}

function switchToOnlineView() {
    activePlaylistSource = 'online';
    playlistToggleButton.textContent = 'Online Playlist';
    playlistToggleButton.classList.add('online-mode');

    renderOnlinePlaylist(latestOnlinePlaylistData);

    if (webviewActive && webview) {
        console.log('[Updater] Meminta update playlist di latar belakang.');
        // Check if webview is ready before executing JS
        if (webview.getWebContentsId) { // Simple check if it's attached
            webview.executeJavaScript('window.playerAPI.scanPlaylist()').catch(err => {
                // Ignore "WebView must be attached" error if it happens during init
                if (!err.message.includes('WebView must be attached')) {
                    console.error("Gagal meminta data playlist:", err);
                }
            });
        }
    }
}

function playOnlineSongByTitle(targetTitle) {
    if (controlMode !== 'webview' || !audioElement.paused) {
        console.log("Mengalihkan ke mode webview, menghentikan pemutar lokal.");
        controlMode = 'webview';
        audioElement.pause();
        audioElement.src = '';
        updateMusicUI();
    }

    // AKTIFKAN FLAG: Beri tahu sistem bahwa kita sedang ganti lagu manual
    isManuallySwitchingSong = true;
    console.log('[Scroll Control] Mengganti lagu manual, scroll otomatis akan diabaikan untuk update berikutnya.');

    // Reset flag setelah jeda singkat, agar deteksi playlist baru bisa berjalan normal lagi nanti
    setTimeout(() => {
        isManuallySwitchingSong = false;
        console.log('[Scroll Control] Flag `isManuallySwitchingSong` direset.');
    }, 2500); // Jeda 2.5 detik seharusnya cukup untuk semua proses update selesai.

    if (isRetryingSkip) {
        console.log('Proses klik sedang berjalan, klik lain diabaikan.');
        return;
    }

    isRetryingSkip = true;
    console.log(`Memulai percobaan klik langsung ke: "${targetTitle}"`);

    let retryCount = 0;
    const maxRetries = 3;
    const retryIntervalMs = 1000;
    let retryInterval = null;

    const stopRetry = (reason) => {
        console.log(`Menghentikan percobaan. Alasan: ${reason}`);
        clearInterval(retryInterval);
        isRetryingSkip = false;
    };

    const attemptDirectClick = async () => {
        if (latestWebviewTitle.includes(targetTitle)) {
            stopRetry('Sukses, judul lagu telah berubah.');
            return;
        }

        if (retryCount >= maxRetries) {
            stopRetry('Gagal setelah beberapa kali percobaan.');
            showNotification('Gagal memutar lagu, coba putar manual dari webview sekali aja.', 'notification-error');
            ipcRenderer.send('request-global-notification', {
                title: 'Gagal Memutar Lagu',
                message: 'Coba putar manual dari YT Music Webview !!',
                type: 'error'
            });
            return;
        }

        console.log(`Percobaan klik langsung ke-${retryCount + 1}...`);
        retryCount++;

        try {
            await webview.executeJavaScript(`window.playerAPI.clickPlayButtonOnSong(${JSON.stringify(targetTitle)})`);
        } catch (err) {
            console.error('Error saat mencoba klik langsung:', err);
        }
    };

    attemptDirectClick();
    retryInterval = setInterval(attemptDirectClick, retryIntervalMs);
}

function updatePlaylistHighlight() {
    const playlistItems = document.querySelectorAll("#playlist li");
    playlistItems.forEach((item, index) => {
        if (index === currentSongIndex) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });
}

function loadSong(index) {
    if (songs.length === 0) return; // Jangan lakukan apa-apa jika tidak ada lagu
    currentSongIndex = index; // currentSongIndex jadi terupdate

    if (controlMode === 'local') {
        const song = songs[index];
        if (!song) return; // Jika lagu tidak ditemukan

        const fullTitleText = `Now Playing: ${song.title}${song.artist ? ' - ' + song.artist : ''}`;
        audioElement.src = song.src;
        // Update UI Utama
        titleElement.textContent = fullTitleText;
        titleElement.title = fullTitleText; // untuk tooltip
        titleElementExpand.textContent = truncateMusicTitle(`${song.title}${song.artist ? ' - ' + song.artist : ''}`);
        const musicDisk = document.getElementById("music-disk");
        if (musicDisk) {
            musicDisk.src = song.cover || "./aset/musik.png";
        }
        progressBar.style.width = '0%';

        onSongPlay(song);

        updatePlaylistHighlight();
    } else {
        audioElement.pause();
        audioElement.src = '';
        songStartTimestamp = null;
        updatePlaylistHighlight(); // Hapus highlight dari lagu lokal

        if (lastWebviewState && lastWebviewState.title) {
            const fullTitleText = `Now Playing: ${lastWebviewState.title}`;
            // Jika ada, gunakan data dari catatan tersebut
            console.log('Restoring last webview state to UI:', lastWebviewState.title);
            titleElement.textContent = fullTitleText;
            titleElement.title = fullTitleText; //  untuk tooltip
            titleElementExpand.textContent = truncateMusicTitle(`${lastWebviewState.title}${lastWebviewState.artist ? ' - ' + lastWebviewState.artist : ''}`);
            const musicDisk = document.getElementById("music-disk");
            if (musicDisk) {
                musicDisk.src = lastWebviewState.thumbnail || "./aset/musik.png";
            }
        } else {
            titleElement.textContent = `Now Playing: Online`;
            titleElement.title = `Now Playing: Online`;
            titleElementExpand.textContent = 'Online Music';
        }
    }
    broadcastPlayerState();
}

function broadcastFullPlayerState() {
    if (!ipcRenderer) return;

    let fullState = {
        title: "No Music",
        artist: "",
        coverSrc: './aset/musik.png',
        currentTime: 0,
        duration: 0,
        progressPercent: 0,
        isPlaying: false,
        playlist: songs,
        currentSongIndex: currentSongIndex,
        volume: audioElement.volume,
        visualizerData: currentVisualizerData || []
    };

    if (controlMode === 'local' && songs.length > 0 && songs[currentSongIndex]) {
        const currentSong = songs[currentSongIndex];
        fullState.title = currentSong.title;
        fullState.artist = currentSong.artist;
        fullState.coverSrc = currentSong.cover || './aset/musik.png';
        fullState.currentTime = audioElement.currentTime;
        fullState.duration = audioElement.duration;
        fullState.progressPercent = (audioElement.currentTime / audioElement.duration) * 100;
        fullState.isPlaying = !audioElement.paused;

    } else if (controlMode === 'webview') {
        fullState.title = document.getElementById('now-playing-song')?.textContent || "Online Music";
        fullState.artist = webviewArtist;
        fullState.coverSrc = document.getElementById('music-disk')?.src || './aset/musik.png';
        fullState.currentTime = webviewCurrentTime || 0;
        fullState.duration = webviewDuration || 0;
        fullState.progressPercent = webviewProgressPercent || 0;
        fullState.isPlaying = webviewIsPlaying || false;
    }

    ipcRenderer.send('update-mini-player-data', fullState);
    ipcRenderer.send('player-state-update-to-overlay', fullState);
}

let actualMiniPlayerFeatureEnabled = false;

function sendDataToMiniPlayer() {
    if (!actualMiniPlayerFeatureEnabled) return;

    let songData = {
        title: "No Title",
        artist: "",
        coverSrc: './aset/musik.png',
        currentTime: 0,
        duration: 0,
        progressPercent: 0,
        isPlaying: false,
        visualizerData: []
    };

    if (controlMode === 'local' && songs.length > 0 && songs[currentSongIndex]) {
        const currentSong = songs[currentSongIndex];
        songData = {
            title: currentSong.title || "No Title",
            artist: currentSong.artist || "",
            coverSrc: currentSong.cover || './aset/musik.png',
            currentTime: audioElement.currentTime,
            duration: audioElement.duration || 0,
            progressPercent: (audioElement.duration && audioElement.currentTime) ? (audioElement.currentTime / audioElement.duration) * 100 : 0,
            isPlaying: !audioElement.paused,
            visualizerData: currentVisualizerData
        };
    } else if (controlMode === 'webview') {
        songData = {
            title: document.getElementById('now-playing-song')?.textContent || "Online Music",
            artist: webviewArtist,
            coverSrc: document.getElementById('music-disk')?.src || './aset/musik.png',
            currentTime: webviewCurrentTime || 0,
            duration: webviewDuration || 0,
            progressPercent: webviewProgressPercent || 0,
            isPlaying: webviewIsPlaying || false,
            visualizerData: currentVisualizerData
        };
    } else {
        // Jika tidak ada mode atau lagu tidak valid, kirim data default/kosong
        songData.visualizerData = currentVisualizerData; // Tetap kirim data visualizer (yang akan jadi 0)
    }
    ipcRenderer.send('update-mini-player-data', songData);
}

// ---- Listener elemen Musik Player saat tidak ter-Expand ---- //
document.getElementById('prev-music').addEventListener('click', () => {
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(currentSongIndex);
    audioElement.play();
    updateMusicUI();
    document.getElementById('prev-music').addEventListener('click', () => {
        if (controlMode === 'webview') {
            webview.send('remote-prev');
        } else {
            currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
            loadSong(currentSongIndex);
            audioElement.play();
            updateMusicUI();
        }
        broadcastPlayerState();
    });
});

document.getElementById('next-music').addEventListener('click', () => {
    if (isShuffleOn) {
        currentSongIndex = getNextShuffleSongIndex();
        document.getElementById('next-music').addEventListener('click', () => {
            if (controlMode === 'webview') {
                webview.send('remote-next');
            } else {
                if (isShuffleOn) currentSongIndex = getNextShuffleSongIndex();
                else currentSongIndex = (currentSongIndex + 1) % songs.length;
                loadSong(currentSongIndex);
                audioElement.play();
                updateMusicUI();
            }
            broadcastPlayerState();
        });
    } else {
        currentSongIndex = (currentSongIndex + 1) % songs.length;
    }
    loadSong(currentSongIndex);
    audioElement.play();
    updateMusicUI(); // Ini biar tombol play pause nya ke update statusnya
});


document.getElementById('shuffle-music').addEventListener('click', () => {
    if (controlMode === 'webview') {
        console.warn("Shuffle control for webview not fully implemented.");
    } else {
        isShuffleOn = !isShuffleOn;
        const shuffleButton = document.getElementById('shuffle-music');

        if (!shuffleButton.querySelector('.shuffle-text')) {
            shuffleButton.innerHTML = '🔀 <span class="shuffle-text"></span>';
        }

        const shuffleText = shuffleButton.querySelector('.shuffle-text');

        shuffleButton.style.color = isShuffleOn ? 'cyan' : 'white';
        shuffleText.textContent = isShuffleOn ? 'ON' : 'OFF';

        // Tampilkan teks dengan opacity
        shuffleText.style.opacity = '1';
        shuffleText.style.transition = 'opacity 0.5s ease-in';

        // Hilangkan teks setelah beberapa detik
        setTimeout(() => {
            shuffleText.style.transition = 'opacity 0.5s ease-out';
            shuffleText.style.opacity = '0';
            setTimeout(() => {
                shuffleText.textContent = '';
            }, 500);
        }, 1500);

        if (isShuffleOn) {
            playedHistory = [];
        }
    }
});

// --- Listener elemen Musik Player saat ada webview (tidak ter-Expand) --- //
document.getElementById('play-pause').addEventListener('click', () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.playPause()');
    } else {
        const isPlayingAfterClick = audioElement.paused;
        ipcRenderer.send('update-rpc-activity', {
            songTitle: songs[currentSongIndex].title,
            songArtist: songs[currentSongIndex].artist,
            smallImageKey: isPlayingAfterClick ? 'play_icon' : 'pause_icon',
            smallImageText: isPlayingAfterClick ? 'Sedang Memutar' : 'Dijeda'
        });

        if (audioElement.paused) {
            audioElement.play();
        } else {
            audioElement.pause();
        }
        updateMusicUI();
    }
});

document.getElementById('prev-music').addEventListener('click', () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.prev()');
    } else {
        currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
        loadSong(currentSongIndex);
        audioElement.play();
        updateMusicUI();
    }
});

document.getElementById('next-music').addEventListener('click', () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.next()');
    } else {
        if (isShuffleOn) {
            currentSongIndex = getNextShuffleSongIndex();
        } else {
            currentSongIndex = (currentSongIndex + 1) % songs.length;
        }
        loadSong(currentSongIndex);
        audioElement.play();
        updateMusicUI();
    }
});

// ---- Listener elemen Musik Player saat ter-Expand ---- //
let isExpanded = false;
let activePlaylistSource = 'local';
let onlinePlaylistData = [];
let rapidPlaylistUpdater = null;
let rapidUpdateStopper = null;

expandCollapseButton.addEventListener('click', () => {
    isExpanded = !isExpanded;
    if (isExpanded) {
        musicControl.classList.remove('collapsed');
        musicControl.classList.add('expanded');
        expandCollapseButton.textContent = '↓';
    } else {
        musicControl.classList.remove('expanded');
        musicControl.classList.add('collapsed');
        expandCollapseButton.textContent = '↑';
    }
    /* Geser wallpaper control jika perlu */
    const musicControlHeight = isExpanded ? 300 : 100;
    const wallpaperOffset = isExpanded ? 235 : 20;
    wallpaperControl.style.bottom = `${musicControlHeight + wallpaperOffset}px`;
});

/* Expanded button di dalam player */
document.getElementById("play-pause-expanded").addEventListener("click", () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.playPause()');
    } else {
        const isPlayingAfterClick = audioElement.paused;
        ipcRenderer.send('update-rpc-activity', {
            songTitle: songs[currentSongIndex].title,
            songArtist: songs[currentSongIndex].artist,
            smallImageKey: isPlayingAfterClick ? 'play_icon' : 'pause_icon',
            smallImageText: isPlayingAfterClick ? 'Sedang Memutar' : 'Dijeda'
        });

        if (audioElement.paused) {
            audioElement.play();
        } else {
            audioElement.pause();
        }
        updateMusicUI();
    }
});

document.getElementById('prev-music-expanded').addEventListener('click', () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.prev()');
    } else {
        currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
        loadSong(currentSongIndex);
        audioElement.play();
        updatePlaylistHighlight();
    }
});

document.getElementById("next-music-expanded").addEventListener("click", () => {
    if (controlMode === 'webview') {
        webview.executeJavaScript('window.playerAPI.next()');
    } else {
        if (isShuffleOn) currentSongIndex = Math.floor(Math.random() * songs.length);
        else currentSongIndex = (currentSongIndex + 1) % songs.length;
        loadSong(currentSongIndex);
        audioElement.play();
        updatePlaylistHighlight();
    }
});

document.getElementById("shuffle-music-expanded").addEventListener("click", () => {
    if (controlMode === 'webview') {
        console.warn("Shuffle control for webview not fully implemented.");
    } else {
        isShuffleOn = !isShuffleOn;
        const shuffleButton = document.getElementById("shuffle-music-expanded");

        if (!shuffleButton.querySelector(".shuffle-text")) {
            shuffleButton.innerHTML = "🔀 <span class='shuffle-text'></span>";
        }

        const shuffleText = shuffleButton.querySelector(".shuffle-text");

        shuffleButton.style.color = isShuffleOn ? "cyan" : "white";
        shuffleText.textContent = isShuffleOn ? "ON" : "OFF";

        // Tampilkan teks dengan opacity
        shuffleText.style.opacity = "1";
        shuffleText.style.transition = "opacity 0.5s ease-in";

        // Hilangkan teks setelah beberapa detik
        setTimeout(() => {
            shuffleText.style.transition = "opacity 0.5s ease-out";
            shuffleText.style.opacity = "0";
            setTimeout(() => {
                shuffleText.textContent = "";
            }, 500);
        }, 1500);

        if (isShuffleOn) {
            playedHistory = [];
        }
    }
});

// Volume
volumeSlider.addEventListener('input', (e) => {
    audioElement.volume = e.target.value;
});

/* Progress bar */
audioElement.addEventListener('timeupdate', () => {
    if (controlMode === 'local' && !isNaN(audioElement.duration)) {
        const progressPercent = (audioElement.currentTime / audioElement.duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        // Expanded
        const progressBarExp = document.getElementById('progress-bar-expanded');
        if (progressBarExp) {
            progressBarExp.style.width = `${progressPercent}%`;
        }
        const currentMin = Math.floor(audioElement.currentTime / 60);
        const currentSec = Math.floor(audioElement.currentTime % 60).toString().padStart(2, '0');
        const durationMin = Math.floor(audioElement.duration / 60);
        const durationSec = Math.floor(audioElement.duration % 60).toString().padStart(2, '0');

        document.getElementById('current-time').textContent = `${currentMin}:${currentSec}`;
        document.getElementById('duration').textContent = `${durationMin}:${durationSec}`;
        document.getElementById('current-time-expanded').textContent = `${currentMin}:${currentSec}`;
        document.getElementById('duration-expanded').textContent = `${durationMin}:${durationSec}`;

        sendDataToMiniPlayer();
    }
    broadcastPlayerState();
});

document.getElementById('progress-container').addEventListener('click', (e) => {
    if (controlMode === 'webview') {
        console.warn("Seek control for webview not fully implemented.");
        const containerWidth = e.currentTarget.offsetWidth;
        const clickX = e.offsetX;
        const seekTime = (clickX / containerWidth) * webviewDuration; // Use webviewDuration
        webview.executeJavaScript(`window.playerAPI.seek(${seekTime})`);
    } else {
        // Local seek logic
        if (!isNaN(audioElement.duration)) {
            const pct = e.offsetX / e.currentTarget.offsetWidth;
            const newTime = pct * audioElement.duration;
            audioElement.currentTime = newTime;
        }
    }
});

document.getElementById('progress-container-expanded').addEventListener('click', (e) => {
    if (controlMode === 'webview') {
        const containerWidth = e.currentTarget.offsetWidth;
        const clickX = e.offsetX;
        const seekTime = (clickX / containerWidth) * webviewDuration;
        webview.executeJavaScript(`window.playerAPI.seek(${seekTime})`);
    } else {
        if (!isNaN(audioElement.duration)) {
            const containerWidth = e.currentTarget.offsetWidth;
            const clickX = e.offsetX;
            audioElement.currentTime = (clickX / containerWidth) * audioElement.duration;
        }
    }
});

/* On ended -> next track */
audioElement.addEventListener('ended', () => {
    if (controlMode === 'local') {
        if (isShuffleOn) {
            currentSongIndex = Math.floor(Math.random() * songs.length);
        } else {
            currentSongIndex = (currentSongIndex + 1) % songs.length;
        }
        loadSong(currentSongIndex);
        audioElement.play();
    }
});

/* Visualizer */
document.addEventListener("DOMContentLoaded", () => {
    let webviewAnalyserData = new Uint8Array(32).fill(0);
    let audioCtx, analyser;

    const NUM_BARS_LOCAL = 40;
    const NUM_BARS_WEBVIEW = 42;
    const MAX_BARS = Math.max(NUM_BARS_LOCAL, NUM_BARS_WEBVIEW);
    const bars = [];

    // Listener terpusat untuk semua pesan dari webview
    webview.addEventListener('ipc-message', (e) => {
        if (e.channel === 'ad-status-update') {
            // Ambil 'details' dari argumen event
            const { state, bounds: targetBounds, details } = e.args[0];

            let webviewBounds = null;

            // Jika skippable, dapatkan juga bounds webview
            if (state === 'skippable' && targetBounds) {
                webviewBounds = webview.getBoundingClientRect();
                webviewBounds = { x: webviewBounds.x, y: webviewBounds.y };
            }

            // Sertakan 'details' saat mengirim ke main process
            ipcRenderer.send('ad-status-update', { state, targetBounds, webviewBounds, details });

        } else if (e.channel === 'subtitle-update') {
            // Teks hanya ada jika CC YouTube Music diaktifkan secara manual oleh user.
            ipcRenderer.send('subtitle-update', e.args[0] || { text: '' });

        } else if (e.channel === 'analyser-data') {
            const { data } = e.args[0];
            if (data && data.length > 0) {
                webviewAnalyserData = new Uint8Array(data);
            }
        }
        if (e.channel === 'request-auto-skip-instant') {
            const coords = e.args[0]; // Ambil koordinat langsung dari preload

            // --- LOGIKA KLIK LANGSUNG DI SINI ---
            const webview = document.getElementById('external-webview');

            // 1. Hitung Zoom Factor
            const zoomFactor = webview.getZoomFactor();
            const scaledX = Math.round(coords.x * zoomFactor);
            const scaledY = Math.round(coords.y * zoomFactor);

            console.log(`[Instant Skip] Melakukan klik di: ${scaledX}, ${scaledY}`);

            // 2. Eksekusi InputEvent LANGSUNG tanpa ke Main Process
            // Mouse Down
            webview.sendInputEvent({
                type: 'mouseDown',
                button: 'left',
                x: scaledX,
                y: scaledY,
                clickCount: 1
            });

            // Mouse Up (Beri jeda sangat kecil agar terbaca sebagai klik)
            setTimeout(() => {
                webview.sendInputEvent({
                    type: 'mouseUp',
                    button: 'left',
                    x: scaledX,
                    y: scaledY,
                    clickCount: 1
                });
            }, 50);
        }
    });

    // Inisialisasi awal
    renderPlaylist();
    loadSong(currentSongIndex);

    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
    } catch (err) {
        console.error("Web Audio API tidak didukung:", err);
    }

    if (audioCtx && analyser) {
        const source = audioCtx.createMediaElementSource(audioElement);

        // Tambahkan lowpass filter dan gain node untuk efek muffled quit popup
        // Filter ini selalu terhubung, tapi parameter-nya akan diatur saat popup muncul
        quitPopupLowpassFilter = audioCtx.createBiquadFilter();
        quitPopupLowpassFilter.type = 'lowpass';
        quitPopupLowpassFilter.frequency.value = 22050; // Full range default (tidak memfilter apa-apa)
        quitPopupLowpassFilter.Q.value = 0.7; // Q rendah = tidak ada resonance boost

        quitPopupGainNode = audioCtx.createGain();
        quitPopupGainNode.gain.value = 1.0; // Volume 100% default

        // Chain: source -> lowpassFilter -> gainNode -> analyser -> destination
        source.connect(quitPopupLowpassFilter);
        quitPopupLowpassFilter.connect(quitPopupGainNode);
        quitPopupGainNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        // Simpan referensi audioCtx untuk fungsi muffled effect
        quitPopupAudioContext = audioCtx;
        quitPopupAudioConnected = true;

        console.log('[Audio Chain] Audio graph dengan support untuk efek muffled berhasil di-setup');
    }

    const visualizerContainer = document.getElementById("music-visualizer");
    visualizerContainer.innerHTML = '';
    for (let i = 0; i < MAX_BARS; i++) {
        const barEl = document.createElement("div");
        barEl.className = "bar";
        bars.push(barEl);
        visualizerContainer.appendChild(barEl);
    }

    // WebGPU Visualizer Init
    const webgpuVisualizer = new WebGPUVisualizer("music-visualizer", MAX_BARS);
    let isWebGPUInitialized = false;
    let wasWebGPUEnabled = false;
    let currentWebGPUStyle = -1; // Track current style
    const previousVisualizerValues = new Array(MAX_BARS).fill(1);

    let lastVisualizerDataStr = "";
    let visualizerIdleCounter = 0;

    function animateVisualizer() {
        currentVisualizerData = [];

        const activeNumBars = (controlMode === 'local') ? NUM_BARS_LOCAL : NUM_BARS_WEBVIEW;
        let hasActivity = false;

        // Check WebGPU setting
        const webgpuCheckbox = document.getElementById('webgpu-acceleration-checkbox');
        const useWebGPU = webgpuCheckbox && webgpuCheckbox.checked;

        // Check Style setting
        const savedStyle = sessionStorage.getItem('savedWebGPUVisualizerStyle');
        const targetStyle = savedStyle !== null ? parseInt(savedStyle) : 1; // Default Modern (1)

        // Handle switching
        if (useWebGPU !== wasWebGPUEnabled) {
            if (useWebGPU) {
                if (!isWebGPUInitialized) {
                    webgpuVisualizer.init().then(success => {
                        if (success) {
                            isWebGPUInitialized = true;
                            webgpuVisualizer.enable();
                            webgpuVisualizer.setStyle(targetStyle); // Set initial style
                            currentWebGPUStyle = targetStyle;
                            bars.forEach(b => b.style.display = 'none');
                        }
                    });
                } else {
                    webgpuVisualizer.enable();
                    webgpuVisualizer.setStyle(targetStyle);
                    currentWebGPUStyle = targetStyle;
                    bars.forEach(b => b.style.display = 'none');
                }
            } else {
                if (isWebGPUInitialized) {
                    webgpuVisualizer.disable();
                    visualizerContainer.innerHTML = '';
                    bars.forEach(b => visualizerContainer.appendChild(b));
                }
            }
            wasWebGPUEnabled = useWebGPU;
        }

        // Update style if changed while enabled
        if (useWebGPU && isWebGPUInitialized && currentWebGPUStyle !== targetStyle) {
            webgpuVisualizer.setStyle(targetStyle);
            currentWebGPUStyle = targetStyle;
        }

        if (!useWebGPU) {
            bars.forEach((bar, index) => {
                bar.style.display = index < activeNumBars ? 'block' : 'none';
            });
        }

        if (controlMode === 'local' && analyser) {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            const effectiveFrequencyDataLength = analyser.frequencyBinCount;
            const relevantDataSlice = dataArray.slice(0, Math.min(64, effectiveFrequencyDataLength));

            for (let i = 0; i < activeNumBars; i++) {
                const dataIndex = Math.floor((i / activeNumBars) * relevantDataSlice.length);
                const rawValue = relevantDataSlice[dataIndex] || 0;

                const maxScaleMain = 65;
                const baseScaleMain = 1;
                const newCalculatedScaleMain = baseScaleMain + (rawValue / 255) * maxScaleMain;

                let currentAppliedScaleMain = previousVisualizerValues[i] || baseScaleMain;

                let finalDisplayScaleMain;
                if (newCalculatedScaleMain > currentAppliedScaleMain) {
                    finalDisplayScaleMain = newCalculatedScaleMain;
                } else {
                    finalDisplayScaleMain = currentAppliedScaleMain * 0.85;
                }
                finalDisplayScaleMain = Math.max(baseScaleMain, finalDisplayScaleMain);
                previousVisualizerValues[i] = finalDisplayScaleMain;

                if (!useWebGPU) {
                    if (bars[i]) {
                        bars[i].style.transform = `scaleY(${finalDisplayScaleMain})`;
                    }
                }

                if (finalDisplayScaleMain > 1.01) hasActivity = true;

                let normalizedFactor = (finalDisplayScaleMain - baseScaleMain) / maxScaleMain;
                currentVisualizerData.push(Math.max(0, Math.min(1, normalizedFactor)));
            }

        } else if (controlMode === 'webview') {
            const dataArray = webviewAnalyserData;
            const relevantDataSlice = dataArray.slice(0, Math.min(32, dataArray.length));

            for (let i = 0; i < activeNumBars; i++) {
                const dataIndex = Math.floor((i / activeNumBars) * relevantDataSlice.length);
                const rawValue = relevantDataSlice[dataIndex] || 0;

                const maxScaleMain = 55;
                const baseScaleMain = 1;
                const newCalculatedScaleMain = baseScaleMain + (rawValue / 255) * maxScaleMain;

                let currentAppliedScaleMain = previousVisualizerValues[i] || baseScaleMain;

                let finalDisplayScaleMain;
                if (newCalculatedScaleMain > currentAppliedScaleMain) {
                    finalDisplayScaleMain = newCalculatedScaleMain;
                } else {
                    finalDisplayScaleMain = currentAppliedScaleMain * 0.85; // Faktor peluruhan sama
                }
                finalDisplayScaleMain = Math.max(baseScaleMain, finalDisplayScaleMain);
                previousVisualizerValues[i] = finalDisplayScaleMain;

                if (!useWebGPU) {
                    if (bars[i]) {
                        bars[i].style.transform = `scaleY(${finalDisplayScaleMain})`;
                    }
                }

                if (finalDisplayScaleMain > 1.01) hasActivity = true;

                let normalizedFactor = (finalDisplayScaleMain - baseScaleMain) / maxScaleMain;
                currentVisualizerData.push(Math.max(0, Math.min(1, normalizedFactor)));
            }

        } else {
            const baseScaleMain = 1;
            for (let i = 0; i < activeNumBars; i++) {
                let currentAppliedScaleMain = previousVisualizerValues[i] || baseScaleMain;
                let finalDisplayScaleMain = currentAppliedScaleMain * 0.85;
                finalDisplayScaleMain = Math.max(baseScaleMain, finalDisplayScaleMain);
                previousVisualizerValues[i] = finalDisplayScaleMain;

                if (!useWebGPU) {
                    if (bars[i]) {
                        bars[i].style.transform = `scaleY(${finalDisplayScaleMain})`;
                    }
                }
                currentVisualizerData.push(0);
            }
        }

        if (useWebGPU && isWebGPUInitialized && currentVisualizerData.length > 0) {
            const dataForGPU = new Uint8Array(MAX_BARS);
            for (let i = 0; i < currentVisualizerData.length; i++) {
                dataForGPU[i] = Math.floor(currentVisualizerData[i] * 255);
            }
            webgpuVisualizer.render(dataForGPU);
        }

        // Optimization: Reduce IPC calls when idle
        if (!hasActivity) {
            visualizerIdleCounter++;
            if (visualizerIdleCounter > 10) { // Allow a few frames to settle
                // Send one last zero-frame then stop sending
                if (visualizerIdleCounter === 11) {
                    ipcRenderer.send('visualizer-data-stream', currentVisualizerData);
                }
                return;
            }
        } else {
            visualizerIdleCounter = 0;
        }

        ipcRenderer.send('visualizer-data-stream', currentVisualizerData);

        if (actualMiniPlayerFeatureEnabled) {
            sendDataToMiniPlayer();
        }
    }

    // Loop animasi menggunakan requestAnimationFrame, Ini jangan pernah diubah metode nya biar visualizer ga throttling kalau aplikasi utama di minimize
    setInterval(animateVisualizer, 1200 / 100);

    // Event listener untuk audio lokal
    audioElement.addEventListener('play', () => {
        if (controlMode === 'local') {
            updateMusicUI();
            sendDataToMiniPlayer();
            broadcastPlayerState();
            if (audioCtx && audioCtx.state === "suspended") {
                audioCtx.resume();
            }
        }
    });

    audioElement.addEventListener('pause', () => {
        if (controlMode === 'local') {
            updateMusicUI();
            sendDataToMiniPlayer();
            broadcastPlayerState();
        }
    });

    // Event listener untuk tombol play/pause (untuk resume AudioContext)
    document.getElementById("play-pause").addEventListener("click", () => {
        if (controlMode === 'local' && audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    });

    document.getElementById("play-pause-expanded").addEventListener("click", () => {
        if (controlMode === 'local' && audioCtx && audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    });
});

// ================================ ( End Menu Options & Quit ) ================================ //
