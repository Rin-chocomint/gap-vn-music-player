// ================================ ( Sinkronisasi Scene dari Main Process ) ================================ //
//------------------- ( konfigurasi scene + muat asset awal ) -------------------------//
ipcRenderer.on('configure-scene', (event, config) => {
    const {
        skipScene,
        songs: dynamicSongs,
        wallpapers: dynamicWallpapers,
        defaultSong,
        defaultTitleVideo,
        settings: savedSettings
    } = config;

    if (dynamicSongs) {
        songs = dynamicSongs;
        renderPlaylist();
    }
    if (dynamicWallpapers) {
        wallpapers = dynamicWallpapers;
        if (typeof changeWallpaper === 'function') changeWallpaper();
    }

    console.log("Skip Scene:", skipScene);

    const bgAudio = document.getElementById('background-audio');
    if (defaultSong && defaultSong.src) {
        bgAudio.src = defaultSong.src;
        const defaultIndex = songs.findIndex(song => song.src === defaultSong.src);
        if (defaultIndex !== -1) {
            currentSongIndex = defaultIndex;
            if (typeof loadSong === 'function') loadSong(currentSongIndex);
        }
    } else if (songs.length > 0) {
        bgAudio.src = songs[0].src;
        currentSongIndex = 0;
        if (typeof loadSong === 'function') loadSong(currentSongIndex);
    }

    if (defaultTitleVideo && defaultTitleVideo.src) {
        // Simpan source untuk restore nanti
        titleVideoSource = { src: defaultTitleVideo.src, type: defaultTitleVideo.type };

        const bgVideo = document.getElementById('background-video');
        if (bgVideo) {
            const sourceEl = bgVideo.querySelector('source');
            if (sourceEl) {
                sourceEl.src = defaultTitleVideo.src;
                sourceEl.type = defaultTitleVideo.type;
                bgVideo.load();
            } else {
                bgVideo.src = defaultTitleVideo.src;
                bgVideo.type = defaultTitleVideo.type;
                bgVideo.load();
            }
        }
    }

    // daftar screen
    screens = [
        document.getElementById('warning-screen'),
        document.getElementById('developer-screen'),
        document.getElementById('concept-screen'),
        document.getElementById('title-screen'),
        document.getElementById('main-menu')
    ].filter(screenEl => screenEl !== null);

    // Panggil loadAllEditableContent DI SINI, setelah `screens` diinisialisasi/diperbarui
    loadAllEditableContentFromLocalStorage();

    if (enableAdSkipperCheckbox) {
        enableAdSkipperCheckbox.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;

            // Ambil status sub-opsi juga agar tidak ter-reset jadi undefined di preload
            const autoMuteVal = document.getElementById('auto-mute-ads-checkbox').checked;
            const autoSkipVal = document.getElementById('auto-skip-ads-checkbox').checked;

            sessionStorage.setItem('savedAdSkipper', isEnabled);

            // Kirim ke main process (update userSettings global)
            ipcRenderer.send('save-settings', {
                adSkipperEnabled: isEnabled,
                autoMuteAds: autoMuteVal,
                autoSkipAds: autoSkipVal
            });

            // Kirim paket lengkap ke webview
            const webview = document.getElementById('external-webview');
            if (webview && webview.getWebContentsId()) {
                webview.send('setting-update', {
                    adSkipperEnabled: isEnabled,
                    autoMuteAds: autoMuteVal,
                    autoSkipAds: autoSkipVal
                });
            }
        });
    }

    // Apply loaded settings segera setelah screens diinisialisasi
    if (savedSettings) {
        const followMusicCheckboxHidden = document.getElementById("follow-music-title");
        const darknessSliderHidden = document.getElementById("wallpaper-darkness");
        const optionsPaneFollowMusicCheckbox = document.querySelector('#wallpaper-options-pane .follow-music-title');
        const optionsPaneDarknessSlider = document.querySelector('#wallpaper-options-pane .wallpaper-darkness');
        const enableHiddenSettingsCheckbox = document.getElementById('enable-hidden-wallpaper-settings');
        const wallpaperSettingsPanel = document.getElementById('wallpaper-settings');
        const volumeSliderEl = document.getElementById("volume-slider");
        const characterBackgroundEl = document.getElementById("character-background");
        const idleReturnCheckboxEl = document.getElementById('idle-return-checkbox');
        const snowEffectCheckboxEl = document.getElementById('snow-effect-checkbox');

        const snowEffectCheckbox = document.getElementById('snow-effect-checkbox');
        const miniPlayerCheckbox = document.getElementById('mini-player-effect-checkbox');


        if (volumeSliderEl && savedSettings.volume !== undefined) {
            volumeSliderEl.value = savedSettings.volume;
            if (bgAudio) bgAudio.volume = savedSettings.volume;
        }

        if (document.getElementById("wallpaper-name") && savedSettings.wallpaper !== undefined) {
            document.getElementById("wallpaper-name").textContent = `Current: ${savedSettings.wallpaper}`;
        }

        if (savedSettings.followMusic !== undefined) {
            if (followMusicCheckboxHidden) followMusicCheckboxHidden.checked = savedSettings.followMusic;
            if (optionsPaneFollowMusicCheckbox) optionsPaneFollowMusicCheckbox.checked = savedSettings.followMusic;
        }

        if (savedSettings.darkness !== undefined) {
            if (darknessSliderHidden) darknessSliderHidden.value = savedSettings.darkness;
            if (optionsPaneDarknessSlider) optionsPaneDarknessSlider.value = savedSettings.darkness;
            const brightnessFilter = `brightness(${100 - savedSettings.darkness}%)`;
            if (characterBackgroundEl) characterBackgroundEl.style.filter = brightnessFilter;
            const characterBackgroundImageEl = document.getElementById("character-background-image");
            if (characterBackgroundImageEl) characterBackgroundImageEl.style.filter = brightnessFilter;
        }

        if (wallpaperSettingsPanel && enableHiddenSettingsCheckbox && savedSettings.enableHiddenWallpaperSettings !== undefined) {
            const isEnabled = savedSettings.enableHiddenWallpaperSettings;
            enableHiddenSettingsCheckbox.checked = isEnabled;

            if (isEnabled) {
                wallpaperSettingsPanel.classList.remove('disabled');
                if (typeof showPanel === 'function' && typeof hidePanel === 'function' && typeof triggerZone !== 'undefined' && typeof wallpaperSettings !== 'undefined') {
                    triggerZone.addEventListener('mouseenter', showPanel);
                    triggerZone.addEventListener('mouseleave', hidePanel);
                    wallpaperSettings.addEventListener('mouseenter', showPanel);
                    wallpaperSettings.addEventListener('mouseleave', hidePanel);
                }
            } else {
                wallpaperSettingsPanel.classList.add('disabled');
                wallpaperSettingsPanel.classList.remove('show');
                if (typeof showPanel === 'function' && typeof hidePanel === 'function' && typeof triggerZone !== 'undefined' && typeof wallpaperSettings !== 'undefined') {
                    triggerZone.removeEventListener('mouseenter', showPanel);
                    triggerZone.removeEventListener('mouseleave', hidePanel);
                    wallpaperSettings.removeEventListener('mouseenter', showPanel);
                    wallpaperSettings.removeEventListener('mouseleave', hidePanel);
                }
            }
        }

        if (idleReturnCheckboxEl && savedSettings.idleReturn !== undefined) {
            idleReturnCheckboxEl.checked = savedSettings.idleReturn;
            if (savedSettings.idleReturn && typeof resetIdleTimer === 'function') resetIdleTimer();
        }

        // Terapkan pengaturan salju saat konfigurasi scene
        if (snowEffectCheckboxEl && savedSettings.snowFeatureEnabled !== undefined) {
            snowEffectCheckboxEl.checked = savedSettings.snowFeatureEnabled;
            ipcRenderer.send('set-snow-feature-enabled', savedSettings.snowFeatureEnabled);
            if (savedSettings.snowFeatureEnabled) {
                ipcRenderer.send('show-snow-effect');
            } else {
                ipcRenderer.send('hide-snow-effect');
            }
        } else if (snowEffectCheckboxEl) { // Default jika tidak ada di savedSettings
            snowEffectCheckboxEl.checked = false;
            ipcRenderer.send('set-snow-feature-enabled', false);
            ipcRenderer.send('hide-snow-effect');
        }

        if (miniPlayerCheckbox && savedSettings.miniPlayerFeatureEnabled !== undefined) {
            miniPlayerCheckbox.checked = savedSettings.miniPlayerFeatureEnabled;
        } else if (miniPlayerCheckbox) {
            miniPlayerCheckbox.checked = false;
        }

        // Toggle sub-options visibility saat checkbox utama berubah
        const miniPlayerSubOptions = document.getElementById('mini-player-sub-options');
        if (miniPlayerCheckbox && miniPlayerSubOptions) {
            // Set initial visibility
            miniPlayerSubOptions.style.display = miniPlayerCheckbox.checked ? 'block' : 'none';

            // Add change listener jika belum ada
            if (!miniPlayerCheckbox.dataset.listenerAdded) {
                miniPlayerCheckbox.addEventListener('change', () => {
                    miniPlayerSubOptions.style.display = miniPlayerCheckbox.checked ? 'block' : 'none';
                });
                miniPlayerCheckbox.dataset.listenerAdded = 'true';
            }
        }

        const miniPlayerHideCheckbox = document.getElementById('mini-player-hide-on-cursor');
        if (miniPlayerHideCheckbox) {
            if (savedSettings && savedSettings.miniPlayerHideOnCursor !== undefined) {
                miniPlayerHideCheckbox.checked = savedSettings.miniPlayerHideOnCursor;
            } else {
                miniPlayerHideCheckbox.checked = false;
            }
            // Listener handled globally in DOMContentLoaded
        }

        if (enableRpcCheckbox && savedSettings.rpcEnabled !== undefined) {
            enableRpcCheckbox.checked = savedSettings.rpcEnabled;
        } else if (enableRpcCheckbox) {
            enableRpcCheckbox.checked = false;
        }

        if (dynamicThemeModeSelect) {
            const savedMode = sanitizeDynamicThemeMode(savedSettings.dynamicThemeMode ?? 'default');
            dynamicThemeModeSelect.value = savedMode;
            toggleDynamicThemeSubOptions();
        }

        // Load Dynamic Music Player Styling setting
        const dynamicMusicPlayerCheckbox = document.getElementById('enable-dynamic-music-player-checkbox');
        if (dynamicMusicPlayerCheckbox && savedSettings.dynamicMusicPlayerStylingEnabled !== undefined) {
            dynamicMusicPlayerCheckbox.checked = savedSettings.dynamicMusicPlayerStylingEnabled;
            dynamicMusicPlayerEnabled = savedSettings.dynamicMusicPlayerStylingEnabled;
            console.log('[Dynamic Music Player] Loaded saved setting:', dynamicMusicPlayerEnabled);

            // Apply styling if enabled
            if (dynamicMusicPlayerEnabled) {
                applyDynamicMusicPlayerStyling();
            }
        } else if (dynamicMusicPlayerCheckbox) {
            dynamicMusicPlayerCheckbox.checked = false;
            dynamicMusicPlayerEnabled = false;
        }
    }

    actualMiniPlayerFeatureEnabled = config.settings?.miniPlayerFeatureEnabled || false;
    const miniPlayerCheckbox = document.getElementById('mini-player-effect-checkbox');
    if (miniPlayerCheckbox) {
        miniPlayerCheckbox.checked = actualMiniPlayerFeatureEnabled;
    }

    if (skipScene) {
        screens.forEach(screen => { if (screen) screen.style.display = 'none'; });
        const mainMenuEl = document.getElementById('main-menu');
        if (mainMenuEl) {
            mainMenuEl.style.display = 'flex';
            mainMenuEl.style.animation = "fadeIn 1s forwards";
            mainMenuEl.style.opacity = '1';
        }
        if (bgAudio && bgAudio.paused) {
            bgAudio.currentTime = 0;
            bgAudio.play().catch(err => {
                console.warn("Autoplay diblokir??. Err:", err);
                setTimeout(sendDataToMiniPlayer, 100);
            });
        }
    } else {
        if (typeof startTitleScreenAnimation === 'function') startTitleScreenAnimation();
        if (typeof showNextScreen === 'function') {
            setTimeout(() => {
                const continueText = document.getElementById('warning-continue-text');
                if (continueText) continueText.classList.add('visible');

                const warningScreen = document.getElementById('warning-screen');
                if (warningScreen) {
                    warningScreen.onclick = () => {
                        warningScreen.onclick = null; // Hapus listener agar tidak diklik ganda
                        showNextScreen(); // Pindah ke Dev Screen immediately

                        // Jadwalkan screen berikutnya (Dev -> Concept)
                        // Dev screen duration: 5.5s
                        setTimeout(showNextScreen, 5500);

                        // Jadwalkan musik (11.5s setelah klik)
                        // 5.5s (Dev) + 6s offset
                        setTimeout(() => {
                            if (!skipScene) {
                                audio.play();
                                console.log("musik diputar setelah 11.5 detik (dari klik).");
                            } else {
                                console.log("musik tidak diputar karena skip scene.");
                            }
                        }, 11500);

                        // Jadwalkan Concept -> Title
                        // 5.5s (Dev) + 10s (Concept) = 15.5s
                        setTimeout(showNextScreen, 15500);
                    };
                }
            }, 5000);
        }
    }
});

//------------------- ( end konfigurasi scene + muat asset awal ) -------------------------//

//------------------- ( status fitur salju/mini-player dari main process ) -------------------------//
ipcRenderer.on('snow-feature-status-changed', (event, isEnabled) => {
    const snowEffectCheckbox = document.getElementById('snow-effect-checkbox');
    if (snowEffectCheckbox) {
        snowEffectCheckbox.checked = isEnabled;
    }
});

ipcRenderer.on('mini-player-feature-status-changed', (event, isEnabled) => {
    console.log('Mini Player status changed from main:', isEnabled);
    actualMiniPlayerFeatureEnabled = isEnabled; // Update status global
    const miniPlayerEffectCheckbox = document.getElementById('mini-player-effect-checkbox');
    if (miniPlayerEffectCheckbox) {
        miniPlayerEffectCheckbox.checked = isEnabled;
    }
    if (isEnabled) {
        sendDataToMiniPlayer();
    }
});

//------------------- ( end status fitur salju/mini-player dari main process ) -------------------------//

//------------------- ( setting-update: forward paket AdSkipper ke webview ) -------------------------//
ipcRenderer.on('setting-update', (event, settings) => {
    console.log('[Index] Menerima setting dari Main:', settings);

    if (settings.adSkipperEnabled !== undefined) {
        const webview = document.getElementById('external-webview');

        // memastikan webview siap
        if (webview && webview.getWebContentsId()) {
            console.log('[Index] Meneruskan paket lengkap ke Webview...');

            // Jangan filter properti, kirimkan object settings apa adanya
            // atau definisikan ulang satu per satu dengan lengkap
            webview.send('setting-update', {
                adSkipperEnabled: settings.adSkipperEnabled,
                autoMuteAds: settings.autoMuteAds,
                autoSkipAds: settings.autoSkipAds
            });
        }
    }
});

//------------------- ( end setting-update: forward paket AdSkipper ke webview ) -------------------------//

// ================================ ( End Sinkronisasi Scene dari Main Process ) ================================ //
