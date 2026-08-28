// ================================ ( Overlay Musik Player ) ================================ //
if (enableOverlayCheckbox) {
    enableOverlayCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        ipcRenderer.send('set-overlay-feature', isEnabled);
        ipcRenderer.send('save-settings', { overlayEnabled: isEnabled });
    });
}

if (enableDynamicThemeCheckbox) {
    enableDynamicThemeCheckbox.addEventListener('change', (event) => {
        console.log('[DynamicTheme] Checkbox changed:', event.target.checked);
        applyDynamicThemeState();
    });
}

if (dynamicThemeModeSelect) {
    dynamicThemeModeSelect.addEventListener('change', () => {
        applyDynamicThemeState();
    });
}

toggleDynamicThemeSubOptions();

function broadcastPlayerState() {
    // state default
    let state = {
        title: "No Music",
        artist: "",
        coverSrc: './aset/musik.png',
        currentTime: 0,
        duration: 0,
        progressPercent: 0,
        isPlaying: false,
        playlist: songs,
        onlinePlaylist: latestOnlinePlaylistData,
        playlistMode: activePlaylistSource,
        currentSongIndex: currentSongIndex,
        volume: audioElement.volume,
        visualizerData: currentVisualizerData || []
    };

    if (controlMode === 'webview') {
        state.title = document.getElementById('now-playing-song')?.textContent || "Online Music";
        state.artist = typeof webviewArtist !== 'undefined' ? webviewArtist : "";
        state.coverSrc = document.getElementById('music-disk')?.src || './aset/musik.png';
        state.currentTime = webviewCurrentTime || 0;
        state.duration = webviewDuration || 0;
        state.progressPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
        state.isPlaying = webviewIsPlaying || false;

    } else { // 'local'
        if (songs.length > 0 && songs[currentSongIndex]) {
            const currentSong = songs[currentSongIndex];
            state.title = currentSong.title;
            state.artist = currentSong.artist;
            state.coverSrc = currentSong.cover || './aset/musik.png';
            state.currentTime = audioElement.currentTime;
            state.duration = audioElement.duration || 0;
            state.progressPercent = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
            state.isPlaying = !audioElement.paused;
        }
    }

    // Kirim state yang sudah benar ke main process
    ipcRenderer.send('update-shared-player-state', state);
}

ipcRenderer.on('request-player-state-for-overlay', () => {
    console.log("Main window received request for initial state from overlay.");
    broadcastPlayerState(); // Kirim status terkini saat diminta
});

ipcRenderer.on('execute-internal-webview-click', async (event, coords) => {
    const webview = document.getElementById('external-webview');
    if (webview && coords) {

        //------------------- ( penting: biar klik overlay gak meleset pas webview lagi zoom ) -------------------------//
        //------------------- ( mulai penyesuaian koordinat dengan zoomFactor ) -------------------------//
        // 1. Dapatkan zoom factor yang sedang aktif (misal: 0.85)
        const zoomFactor = webview.getZoomFactor();

        // 2. Terapkan zoom factor ke koordinat yang diterima (koordinat 100%)
        const scaledX = Math.round(coords.x * zoomFactor);
        const scaledY = Math.round(coords.y * zoomFactor);

        console.log(`[Renderer] Menerima perintah klik. Coords Asli: (${coords.x}, ${coords.y}), Zoom: ${zoomFactor}, Coords Discalakan: (${scaledX}, ${scaledY})`);

        // 3. Buat event mouse 'down' dengan koordinat yang sudah discalakan
        const mouseDownEvent = {
            type: 'mouseDown',
            button: 'left',
            x: scaledX, // <-- Gunakan scaledX
            y: scaledY, // <-- Gunakan scaledY
            clickCount: 1
        };

        // 4. Buat event mouse 'up' dengan koordinat yang sudah discalakan
        const mouseUpEvent = {
            type: 'mouseUp',
            button: 'left',
            x: scaledX, // <-- Gunakan scaledX
            y: scaledY, // <-- Gunakan scaledY
            clickCount: 1
        };
        //------------------- ( end penyesuaian koordinat dengan zoomFactor ) -------------------------//
        //------------------- ( end penting: biar klik overlay gak meleset pas webview lagi zoom ) -------------------------//

        try {
            // Kirim simulasi klik (down lalu up) LANGSUNG ke webview
            webview.sendInputEvent(mouseDownEvent);

            // Beri jeda sangat singkat agar OS bisa memprosesnya
            await new Promise(resolve => setTimeout(resolve, 50));

            webview.sendInputEvent(mouseUpEvent);

            console.log('[Renderer] Klik virtual (down/up) berhasil dikirim ke webview.');

        } catch (err) {
            console.error('[Renderer] Error saat execute sendInputEvent di webview:', err);
        }
    }
});

ipcRenderer.on('forwarded-player-control-action', (event, action) => {
    // Cek apakah action adalah string
    if (typeof action === 'string') {
        switch (action) {
            case 'toggle-playlist-mode':
                document.getElementById('playlist-toggle-btn').click();
                break;
            case 'play-pause':
                // Cukup klik salah satu tombol saja (Expanded atau Collapsed sama saja logikanya)
                // Kita gunakan play-pause-expanded karena itu yang utama
                const playBtn = document.getElementById('play-pause-expanded') || document.getElementById('play-pause');
                if (playBtn) playBtn.click();
                break;
            case 'next':
                const nextBtn = document.getElementById('next-music-expanded') || document.getElementById('next-music');
                if (nextBtn) nextBtn.click();
                break;
            case 'prev':
                const prevBtn = document.getElementById('prev-music-expanded') || document.getElementById('prev-music');
                if (prevBtn) prevBtn.click();
                break;
        }
    } else if (typeof action === 'object' && action.type) {
        // Cek jika action adalah object (untuk volume / seek / playlist)
        switch (action.type) {
            case 'set-volume':
                // Langsung set ke main process, slider akan update via listener global-volume-changed
                ipcRenderer.send('set-global-volume', action.value);
                break;
            case 'seek':
                if (controlMode === 'local') {
                    if (!isNaN(audioElement.duration)) {
                        const newTime = action.percentage * audioElement.duration;
                        audioElement.currentTime = newTime;
                    }
                } else if (controlMode === 'webview') {
                    if (webviewDuration > 0) {
                        const seekTime = action.percentage * webviewDuration;
                        webview.executeJavaScript(`window.playerAPI.seek(${seekTime})`);
                    }
                }
                break;
            case 'play-from-playlist':
                if (webviewActive && webviewIsPlaying) {
                    webview.executeJavaScript('window.playerAPI.playPause()');
                }
                controlMode = 'local';
                currentSongIndex = action.index;
                loadSong(currentSongIndex);
                audioElement.play();
                updatePlaylistHighlight();
                updateMusicUI();
                break;
            case 'play-online-from-playlist':
                if (latestOnlinePlaylistData && latestOnlinePlaylistData[action.index]) {
                    const songToPlay = latestOnlinePlaylistData[action.index];
                    playOnlineSongByTitle(songToPlay.title);
                }
                break;
        }
    }
});

// ================================ ( End Overlay Musik Player ) ================================ //
