// ================================ ( Online Music Webview ) ================================ //
//------------------- ( elemen utama webview + overlay ) -------------------------//
const overlay = document.getElementById('external-browser-container');
const win = document.getElementById('webview-window');
const titleBar = win.querySelector('.title-bar');
const closeBtn = document.getElementById('close-webview');
const webview = document.getElementById('external-webview');
const loader = document.getElementById('webview-loader');
const onlineIcons = document.querySelectorAll('.online-icon');

const webviewForScroll = document.getElementById('external-webview');
//------------------- ( end elemen utama webview + overlay ) -------------------------//

//------------------- ( elemen UI player yang ikut dipakai mode online ) -------------------------//
const nowPlayingText = document.getElementById('now-playing-text');
const musicDisk = document.getElementById('music-disk');
const progressBarExpanded = document.getElementById('progress-bar-expanded');

let trackDuration = 0; // durasi track terakhir dari event track-changed
//------------------- ( end elemen UI player yang ikut dipakai mode online ) -------------------------//

//------------------- ( state internal webview: status & kontrol scroll ) -------------------------//
let webviewActive = false;
let onlineCurrentIndex = -1;
let isScrolling = false;
let skipAutoScroll = false;
let shouldSkipScroll = false;
let recheckTimeout = null;
//------------------- ( end state internal webview: status & kontrol scroll ) -------------------------//

//------------------- ( util kecil: delay buat loop scroll otomatis ) -------------------------//
const sleep = ms => new Promise(res => setTimeout(res, ms));
//------------------- ( end util kecil: delay buat loop scroll otomatis ) -------------------------//

function showLoader() { loader.classList.remove('hidden'); }
function hideLoader() { loader.classList.add('hidden'); }


//------------------- ( indikator loading webview ) -------------------------//
webview.addEventListener('did-start-loading', () => showLoader());
webview.addEventListener('did-stop-loading', () => hideLoader());
webview.addEventListener('did-fail-load', () => {
    hideLoader();
    showNotification('Gagal memuat halaman!', 'notification-error');
});

//------------------- ( scroll otomatis: biar playlist online ke-scan semua ) -------------------------//
async function startWebviewScrollLoop() {
    if (isScrolling) return;
    isScrolling = true;

    const webview = document.getElementById('external-webview');
    // Selector menargetkan area scroll di kedua kemungkinan layout di yt music
    const selector = 'ytmusic-player-queue#queue, ytmusic-tab-renderer#tab-renderer.scroller';

    const scrollAmount = 450;
    const scrollDelay = 165;

    try {
        console.log('[Renderer] Memulai scroll ke BAWAH (versi lebih cepat)...');
        while (true) {
            const scrollState = await webview.executeJavaScript(`
            (() => {
                const el = document.querySelector('${selector}');
                return el ? { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
            })();
        `);
            if (!scrollState || (scrollState.scrollTop >= (scrollState.scrollHeight - scrollState.clientHeight - 1))) {
                break;
            }
            await webview.executeJavaScript(`document.querySelector('${selector}').scrollBy(0, ${scrollAmount});`);
            await sleep(scrollDelay);
        }
        console.log('[Renderer] Scroll ke bawah SELESAI.');
        await sleep(500);

        console.log('[Renderer] Memulai scroll ke ATAS...');
        while (true) {
            const scrollState = await webview.executeJavaScript(`
            (() => {
                const el = document.querySelector('${selector}');
                return el ? { scrollTop: el.scrollTop } : null;
            })();
        `);
            if (!scrollState || scrollState.scrollTop === 0) {
                break;
            }
            await webview.executeJavaScript(`document.querySelector('${selector}').scrollBy(0, -${scrollAmount});`);
            await sleep(scrollDelay);
        }
        console.log('[Renderer] Scroll ke atas SELESAI.');

    } catch (error) {
        console.error('[Renderer] Error saat scroll satu kali:', error);
    } finally {
        isScrolling = false;
        console.log('[Renderer] Prosedur scroll selesai, flag direset.');
    }
}

//------------------- ( end scroll otomatis: biar playlist online ke-scan semua ) -------------------------//

closeBtn.addEventListener('click', () => {
    if (isScrolling) {
        console.log('[Renderer] Webview ditutup, menghentikan loop scroll.');
        isScrolling = false;
    }
    lastKnownOnlinePlaylistId = null;
    overlay.classList.add('hidden');
    updateMusicUI();
});

//------------------- ( cek ulang cover yang masih "setengah matang" ) -------------------------//

function scheduleCoverRecheck() {
    clearTimeout(recheckTimeout);

    recheckTimeout = setTimeout(() => {
        const incompleteItems = document.querySelectorAll('#playlist li .incomplete-cover');
        if (incompleteItems.length > 0) {
            // Kumpulkan judul lagu yang kovernya belum lengkap
            const titlesToRescan = Array.from(incompleteItems).map(item => {
                return item.getAttribute('data-title');
            }).filter(Boolean); // Filter null/undefined titles

            console.log(`[Cover Check] Meminta scan ulang untuk ${titlesToRescan.length} kover:`, titlesToRescan);

            if (webviewActive && webview && titlesToRescan.length > 0) {
                // Panggil API lagi di webview dengan daftar judul
                webview.executeJavaScript(`window.playerAPI.rescanSpecificCovers(${JSON.stringify(titlesToRescan)})`).catch(err => {
                    console.error("Gagal meminta scan kover spesifik:", err);
                });
            }
        }
    }, 3000);
}

//------------------- ( end cek ulang cover yang masih "setengah matang" ) -------------------------//

//------------------- ( inject Dynamic Theme ke YT Music ) -------------------------//
function injectDynamicTheme(webview, themeMode = 'default-optimized') {
    console.log('[DynamicTheme] Attempting to inject...');
    try {
        if (themeMode === 'unified') themeMode = 'overlay';
        const vibrantPath = path.join(__dirname, 'aset/js/vibrant.min.js');
        const stylingPath = path.join(__dirname, 'aset/js/dynamic-ytm-styling.js');

        console.log('[DynamicTheme] Vibrant Path:', vibrantPath);
        console.log('[DynamicTheme] Styling Path:', stylingPath);

        if (fs.existsSync(vibrantPath) && fs.existsSync(stylingPath)) {
            const vibrantCode = fs.readFileSync(vibrantPath, 'utf-8');
            const stylingCode = fs.readFileSync(stylingPath, 'utf-8');

            // Wrap styling code to catch errors
            const wrappedStylingCode = `
        window.DYNAMIC_THEME_MODE = '${themeMode}';
        try {
            ${stylingCode}
        } catch (e) {
            console.error("[DynamicTheme Internal Error]", e);
            throw e;
        }
    `;

            // If already injected, don't inject again (this breaks flexible toggling).
            // Just switch mode / enable on demand.
            webview.executeJavaScript(`
        (function(){
            try {
                const already = (window.__gapDynamicThemeLoaded === true) ||
                    (typeof window.enableDynamicTheme === 'function') ||
                    (typeof window.updateThemeMode === 'function') ||
                    (document.getElementById('ts-base-styles') != null);
                return already;
            } catch (e) {
                return false;
            }
        })();
    `).then((alreadyInjected) => {
                if (alreadyInjected) {
                    console.log('[DynamicTheme] Already injected; skipping script injection.');
                    // Ensure desired mode is applied.
                    return webview.executeJavaScript(`
                try {
                    if (typeof window.enableDynamicTheme === 'function') {
                        window.enableDynamicTheme('${themeMode}');
                    } else if (typeof window.updateThemeMode === 'function') {
                        window.updateThemeMode('${themeMode}');
                    }
                    true;
                } catch (e) {
                    console.error('[DynamicTheme] Failed to apply mode after skip:', e);
                    false;
                }
            `);
                }

                return webview.executeJavaScript(vibrantCode)
                    .then(() => {
                        console.log('[DynamicTheme] Vibrant.js injected successfully.');
                        // Ensure Vibrant is available globally
                        return webview.executeJavaScript(`
                    if (typeof Vibrant === 'undefined') {
                        console.error('[DynamicTheme] Vibrant is undefined after injection!');
                        // Try to recover if it was assigned to module.exports (unlikely but possible)
                        if (typeof module !== 'undefined' && module.exports && module.exports.Vibrant) {
                            window.Vibrant = module.exports.Vibrant;
                            console.log('[DynamicTheme] Recovered Vibrant from module.exports');
                        }
                    }
                `);
                    })
                    .then(() => webview.executeJavaScript(wrappedStylingCode))
                    .then(() => console.log('[DynamicTheme] Dynamic Theme Injected'));
            }).catch(err => console.error('[DynamicTheme] Failed to inject Dynamic Theme:', err));
        } else {
            console.warn("[DynamicTheme] Dynamic Theme files not found");
        }
    } catch (e) {
        console.error("[DynamicTheme] Error reading Dynamic Theme files:", e);
    }
}

//------------------- ( end inject Dynamic Theme ke YT Music ) -------------------------//

//------------------- ( lifecycle webview: dom-ready ) -------------------------//
webview.addEventListener('dom-ready', async () => {
    webview.setZoomFactor(0.85);
    applyWebviewScrollbarMode();

    webviewActive = true;
    controlMode = 'webview';

    // --- Ambil setting yang paling valid (prioritas: main process / remembered settings) ---
    let loadedSettings = null;
    try {
        loadedSettings = await ipcRenderer.invoke('load-settings');
    } catch (e) {
        loadedSettings = null;
    }

    const adSkipperSetting = (loadedSettings && loadedSettings.adSkipperEnabled !== undefined)
        ? loadedSettings.adSkipperEnabled === true
        : (enableAdSkipperCheckbox ? enableAdSkipperCheckbox.checked : false);

    const autoMuteSetting = (loadedSettings && loadedSettings.autoMuteAds !== undefined)
        ? loadedSettings.autoMuteAds === true
        : (document.getElementById('auto-mute-ads-checkbox') ? document.getElementById('auto-mute-ads-checkbox').checked : false);

    const autoSkipSetting = (loadedSettings && loadedSettings.autoSkipAds !== undefined)
        ? loadedSettings.autoSkipAds === true
        : (document.getElementById('auto-skip-ads-checkbox') ? document.getElementById('auto-skip-ads-checkbox').checked : false);
    const dynamicThemeSetting = enableDynamicThemeCheckbox ? enableDynamicThemeCheckbox.checked : false;

    console.log('[Webview DOM-Ready] Fired.');
    console.log('[Webview DOM-Ready] Dynamic Theme Setting:', dynamicThemeSetting);

    // Kirim paket lengkap
    webview.send('setting-update', {
        adSkipperEnabled: adSkipperSetting,
        autoMuteAds: autoMuteSetting,
        autoSkipAds: autoSkipSetting
    });

    // terapkan Dynamic styling/theme ke webview
    if (dynamicThemeSetting) {
        applyDynamicThemeState();
    } else {
        console.log('[Webview DOM-Ready] Dynamic Theme is disabled, skipping injection.');
        applyDynamicThemeState();
    }

    audioElement.pause();
    skipAutoScroll = false;

    webview.executeJavaScript('window.playerAPI.requestMetadata()');
    webview.executeJavaScript('window.playerAPI.scanPlaylist()');
});

//------------------- ( end lifecycle webview: dom-ready ) -------------------------//

//------------------- ( penting: anti race condition buat Dynamic Theme ) -------------------------//
// Kadang dom-ready/did-finish-load suka beda timing pas reload, jadi kita sediain beberapa "titik cadangan".
webview.addEventListener('did-start-loading', () => {
    console.log('[Webview] did-start-loading fired.');
});

webview.addEventListener('did-stop-loading', () => {
    console.log('[Webview] did-stop-loading fired.');
    // Titik injeksi cadangan kalau-kalau yang utama kelewat
    const dynamicThemeSetting = enableDynamicThemeCheckbox ? enableDynamicThemeCheckbox.checked : false;
    if (dynamicThemeSetting) {
        console.log('[Webview did-stop-loading] Checking/Injecting Dynamic Theme...');
        applyDynamicThemeState();
    }
});

webview.addEventListener('did-fail-load', (e) => {
    console.error('[Webview] did-fail-load fired.', e);
});

webview.addEventListener('console-message', (e) => {
    // Saring log kalau perlu, atau cetak semuanya saja
    // console.log('[Webview Console]', e.message);
    // Cuma log error atau pesan tertentu aja biar gak berantakan
    if (e.level === 2 || e.message.includes('Error')) {
        console.error('[Webview Console Error]', e.message, 'Line:', e.line, 'Source:', e.sourceId);
    }
});

webview.addEventListener('did-finish-load', () => {
    console.log('Webview did-finish-load, menerapkan ulang mode scrollbar.');
    sendScrollbarModeToWebview(webviewResizeMode);

    // Injeksi cadangan kalau dom-ready kelewat (misalnya pas di-reload)
    const dynamicThemeSetting = enableDynamicThemeCheckbox ? enableDynamicThemeCheckbox.checked : false;
    if (dynamicThemeSetting) {
        console.log('[Webview did-finish-load] Checking/Injecting Dynamic Theme...');
        // Kita panggil injeksi lagi aja, executeJavaScript biasanya aman kok dipanggil berkali-kali, 
        // tapi idealnya script-nya harus bisa nanganin re-injeksi sendiri sih.
        // Buat sekarang, kita andalin dom-ready dulu, ini cuma buat jaga-jaga aja.
        applyDynamicThemeState();
    }
});

// Panggil lagi jika pengguna bernavigasi ke halaman LAIN di dalam webview
webview.addEventListener('did-navigate', () => {
    console.log('Webview did-navigate, menerapkan ulang mode scrollbar.');
    sendScrollbarModeToWebview(webviewResizeMode);
});

//------------------- ( end penting: anti race condition buat Dynamic Theme ) -------------------------//

//------------------- ( IPC dari preload webview ) -------------------------//
webview.addEventListener('ipc-message', async (e) => {
    // console.log("Pesan dari webview:", e.channel, e.args);

    if (e.channel === 'analyser-data') {
        const { isPlaying, data } = e.args[0];
        // console.log('[Main App] MENERIMA data analyser:', data.slice(0, 5));
        if (data && data.length > 0) {
            webviewAnalyserData = new Uint8Array(data);
        }
    }

    // --- Log & anomali alur login YT Music / Google (dari webview-preload) ---
    if (e.channel === 'login-flow-log') {
        const a = e.args[0] || {};
        console.log('[Webview Login]', a.msg, a);
    }
    if (e.channel === 'login-flow-start') {
        const a = e.args[0] || {};
        console.log('[Webview Login] Alur login dimulai:', a);
        // Teruskan ke main process agar log navigasi + deadline login dimulai.
        try { ipcRenderer.send('webview-login-clicked', a); } catch (err) {
            console.warn('[Webview Login] Gagal meneruskan klik login ke main:', err);
        }
    }
    if (e.channel === 'login-flow-anomaly') {
        const info = e.args[0] || {};
        console.warn('[Webview Login] ANOMALI:', info);
        if (typeof showNotification === 'function') {
            let pesan;
            if (info.kind === 'google-blocked-useragent') {
                pesan = 'Google menolak login di webview. Coba muat ulang webview.';
            } else if (info.kind === 'stuck-login-page' || info.suspect === 'network-provider') {
                // Catatan: login bisa macet karena provider memblokir jalur ke
                // accounts.google.com walau browsing/streaming lancar (lihat
                // [DEV-NOTE] di webview-preload.js). Sarankan ganti jaringan.
                pesan = 'Login YT Music macet — kemungkinan jaringan/provider memblokir jalur login Google. Coba ganti jaringan/data seluler sebentar atau muat ulang.';
            } else {
                pesan = 'Halaman login YT Music lama merespon. Coba muat ulang webview.';
            }
            showNotification(pesan, 'notification-warning');
        }
    }

    if (e.channel === 'online-playlist-update') {
        const { playlistId, songs, currentIndex } = e.args[0];

        latestOnlinePlaylistData = songs;
        onlineCurrentIndex = currentIndex;
        if (activePlaylistSource === 'online') {
            renderOnlinePlaylist(songs);
        }

        // Ini Flag Utama buat nyari tau apakah playlist di yt Musc masih sama atau engga.
        if (playlistId && playlistId !== lastKnownOnlinePlaylistId && !isManuallySwitchingSong) {
            console.log(`[Playlist Refresh & Scroll] Playlist baru terdeteksi. ID: "${playlistId}". Menjalankan scroll otomatis.`);
            lastKnownOnlinePlaylistId = playlistId;

            if (!isScrolling) {
                await startWebviewScrollLoop();
            }

            setTimeout(() => {
                console.log("[Playlist Refresh] Memulai refresh: Beralih ke Lokal -> Online.");
                switchToLocalView();
                setTimeout(() => {
                    switchToOnlineView();
                    console.log("[Playlist Refresh] Proses refresh selesai.");
                }, 65);
            }, 3800);
        }

        latestOnlinePlaylistData = songs;
        onlineCurrentIndex = currentIndex;

        if (activePlaylistSource === 'online') {
            renderOnlinePlaylist(songs);
        }
    }

    if (e.channel === 'specific-covers-updated') {
        const updatedCovers = e.args[0];
        console.log('[Cover Update] Menerima update kover spesifik:', updatedCovers);

        Object.keys(updatedCovers).forEach(title => {
            const newCoverUrl = updatedCovers[title];
            // Cari elemen <li> yang sesuai berdasarkan data-title
            const itemElement = document.querySelector(`.online-playlist-item[data-title="${CSS.escape(title)}"]`);

            if (itemElement) {
                const imgElement = itemElement.querySelector('img');
                if (imgElement && newCoverUrl) {
                    imgElement.src = newCoverUrl; // Langsung perbarui src gambar
                    itemElement.classList.remove('incomplete-cover'); // Hapus class penanda
                }
            }
        });

        // Setelah update, cek lagi apakah masih ada yang belum lengkap untuk dijadwalkan ulang
        const remainingIncomplete = document.querySelectorAll('#playlist li .incomplete-cover').length;
        if (remainingIncomplete > 0) {
            console.log(`[Cover Check] Masih ada ${remainingIncomplete} kover yang belum termuat. Menjadwalkan pengecekan ulang.`);
            scheduleCoverRecheck();
        } else {
            console.log('[Cover Check] Semua kover berhasil diperbarui.');
            clearTimeout(recheckTimeout); // Hentikan timer jika semua sudah lengkap
        }
    }

    if (e.channel === 'track-changed') {
        const { title, thumbnail, duration, artist, album } = e.args[0];
        webviewArtist = artist || '';
        lastWebviewState = e.args[0];
        latestWebviewTitle = title;

        // Discord rpc
        ipcRenderer.send('update-rpc-activity', {
            songTitle: title,
            songArtist: artist,
            largeImageKey: thumbnail,            // URL thumbnail YTM publik → large image dinamis
            smallImageKey: 'play_icon',
            smallImageText: 'Sedang Memutar (Online)',
            album: album,                        // untuk teks hover gambar
            currentTime: 0,                      // lagu baru mulai dari awal
            duration: duration,                  // untuk hitung progress bar
            isPlaying: true
        });

        // --- Update judul collapsed ---
        const musicTitleElement = document.getElementById('music-title');
        if (musicTitleElement) {
            musicTitleElement.textContent = `Now Playing: ${title}`;
        }

        // --- Update judul expanded ---
        const nowPlayingSongTextElement = document.getElementById('now-playing-song');
        if (nowPlayingSongTextElement) {
            nowPlayingSongTextElement.textContent = truncateMusicTitle(title);
        }

        // --- Update cover disk ---
        const musicDiskElement = document.getElementById('music-disk');
        if (musicDiskElement) {
            musicDiskElement.src = thumbnail;
        }

        // Simpan durasi untuk nanti (misal digunakan di seek)
        trackDuration = duration;
        webview.executeJavaScript('window.playerAPI.requestMetadata()');

        // Refresh UI (tombol play/pause, animasi disk, dsb.)
        updateMusicUI();
    }

    if (e.channel === 'playback-update') {
        if (controlMode !== 'webview') return; // Jika bukan mode webview, abaikan pesan ini

        const { isPlaying, currentTime, duration, progressPercent, timeText, title, thumbnail, artist, album } = e.args[0];
        latestWebviewTitle = title;
        webviewArtist = artist || '';

        // Discord rpc
        ipcRenderer.send('update-rpc-activity', {
            songTitle: title,
            songArtist: artist,
            largeImageKey: thumbnail,            // URL thumbnail YTM publik → large image dinamis
            smallImageKey: isPlaying ? 'play_icon' : 'pause_icon',
            smallImageText: isPlaying ? 'Memutar (Online)' : 'Dijeda (Online)',
            album: album,                        // untuk teks hover gambar
            currentTime: currentTime,            // detik; untuk progress bar
            duration: duration,                  // detik
            isPlaying: isPlaying
        });

        // simpan state
        webviewIsPlaying = isPlaying;
        webviewCurrentTime = currentTime;
        webviewDuration = duration;
        webviewProgressPercent = progressPercent;

        // console.log(`Playback update - playing:${isPlaying}, time:${currentTime}/${duration}, progress:${progressPercent}%, text:${timeText}`);
        broadcastFullPlayerState();

        // --- Collapsed UI updates ---
        const currentTimeCollapsed = document.getElementById('current-time');
        const durationCollapsed = document.getElementById('duration');
        const progressBarCollapsed = document.getElementById('progress-bar');

        if (currentTimeCollapsed) currentTimeCollapsed.textContent = timeText.split(' / ')[0];
        if (durationCollapsed) durationCollapsed.textContent = timeText.split(' / ')[1];
        if (progressBarCollapsed) progressBarCollapsed.style.width = `${progressPercent}%`;

        // --- Expanded UI updates ---
        const currentTimeExpanded = document.getElementById('current-time-expanded');
        const durationExpanded = document.getElementById('duration-expanded');
        const progressBarExpanded = document.getElementById('progress-bar-expanded');

        if (currentTimeExpanded) currentTimeExpanded.textContent = timeText.split(' / ')[0];
        if (durationExpanded) durationExpanded.textContent = timeText.split(' / ')[1];
        if (progressBarExpanded) progressBarExpanded.style.width = `${progressPercent}%`;

        if (webviewIsPlaying && controlMode === 'webview' && !audioElement.paused) {
            console.log('Webview is playing, pausing local audio.');
            audioElement.pause();
        }

        // Update icon/tombol dan animasi disk sesuai state play/pause
        updateMusicUI();
        broadcastPlayerState();
    }

    if (e.channel === 'playback-update') {
        const { isPlaying, currentTime, duration, progressPercent, timeText, title, thumbnail, artist } = e.args[0];
        webviewArtist = artist || '';

        // simpan state
        webviewIsPlaying = isPlaying;
        webviewCurrentTime = currentTime;
        webviewDuration = duration;
        webviewProgressPercent = progressPercent;

        // console.log(`Playback update - playing:${isPlaying}, time:${currentTime}/${duration}, progress:${progressPercent}%, text:${timeText}`);
        broadcastFullPlayerState();

        // --- Collapsed UI updates ---
        const currentTimeCollapsed = document.getElementById('current-time');
        const durationCollapsed = document.getElementById('duration');
        const progressBarCollapsed = document.getElementById('progress-bar');

        if (currentTimeCollapsed) currentTimeCollapsed.textContent = timeText.split(' / ')[0];
        if (durationCollapsed) durationCollapsed.textContent = timeText.split(' / ')[1];
        if (progressBarCollapsed) progressBarCollapsed.style.width = `${progressPercent}%`;

        // --- Expanded UI updates ---
        const currentTimeExpanded = document.getElementById('current-time-expanded');
        const durationExpanded = document.getElementById('duration-expanded');
        const progressBarExpanded = document.getElementById('progress-bar-expanded');

        if (currentTimeExpanded) currentTimeExpanded.textContent = timeText.split(' / ')[0];
        if (durationExpanded) durationExpanded.textContent = timeText.split(' / ')[1];
        if (progressBarExpanded) progressBarExpanded.style.width = `${progressPercent}%`;

        if (webviewIsPlaying && controlMode === 'webview' && !audioElement.paused) {
            console.log('Webview is playing, pausing local audio.');
            audioElement.pause();
        }

        // Update icon/tombol dan animasi disk sesuai state play/pause
        updateMusicUI();
        broadcastPlayerState();
    }

    if (e.channel === 'play-state') {
        const { playing } = e.args[0];
        webviewIsPlaying = playing;
        updateMusicUI();
    }

    if (webviewIsPlaying && controlMode === 'webview' && !audioElement.paused) {
        console.log('Webview play-state is true, pausing local audio.');
        audioElement.pause();
    }
});

//------------------- ( end IPC dari preload webview ) -------------------------//

//------------------- ( peringatan anomali login dari main process ) -------------------------//
// main.js mengirim ini saat deadline/log navigasi mendeteksi masalah:
//  - no-navigation-after-click : klik login tapi webview tak bereaksi
//  - slow-auth-load            : mulai ke login tapi lama dimuat (curiga provider)
//  - auth-load-failed          : gagal memuat halaman login (jaringan/provider)
ipcRenderer.on('login-network-anomaly', (event, info) => {
    info = info || {};
    console.warn('[Webview Login] Anomali login (dari main):', info);
    if (typeof showNotification !== 'function') return;

    let pesan;
    switch (info && info.kind) {
        case 'no-navigation-after-click':
            pesan = 'Tombol login ditekan tapi webview tidak merespons. Coba klik lagi atau muat ulang webview.';
            break;
        case 'slow-auth-load':
            pesan = 'Halaman login lama dimuat — kemungkinan jaringan/provider memblokir jalur login Google. Coba ganti jaringan/data seluler sebentar, lalu muat ulang.';
            break;
        case 'auth-load-failed':
            pesan = 'Gagal memuat halaman login Google (kemungkinan masalah jaringan/provider). Coba ganti jaringan atau muat ulang.';
            break;
        default:
            pesan = 'Terdeteksi kendala saat menuju halaman login. Coba muat ulang webview.';
    }
    showNotification(pesan, 'notification-warning');
});
//------------------- ( end peringatan anomali login dari main process ) -------------------------//

//------------------- ( render playlist online ke UI app ) -------------------------//
function renderOnlinePlaylist(songsData = []) {
    const existingItems = playlistElement.querySelectorAll('.online-playlist-item');
    const oldThumbnails = new Map();
    existingItems.forEach(item => {
        const titleEl = item.querySelector('.title');
        const thumbEl = item.querySelector('img');
        if (titleEl && thumbEl && thumbEl.src && !thumbEl.src.includes('base64') && !thumbEl.src.includes('gstatic')) {
            oldThumbnails.set(titleEl.title, thumbEl.src);
        }
    });

    playlistElement.innerHTML = '';

    if (!songsData || songsData.length === 0) {
        playlistElement.innerHTML = `
        <li style="text-align: center; color: #888; cursor: default; padding: 20px 0;">
            Memuat playlist online...<br>Buka webview untuk memuat playlist online.
        </li>
    `;
        return;
    }

    // Hitung item yang tidak lengkap
    let incompleteCount = 0;

    songsData.forEach((song, index) => {
        const li = document.createElement('li');
        li.style.padding = '5px 0';
        li.style.cursor = 'pointer';

        const preservedThumbnailSrc = oldThumbnails.get(song.title) || song.thumbnail;

        // Periksa apakah kover tidak lengkap
        const isCoverIncomplete = !preservedThumbnailSrc || preservedThumbnailSrc.includes('gstatic') || preservedThumbnailSrc.endsWith('/aset/musik.png');
        if (isCoverIncomplete) {
            incompleteCount++;
        }

        li.innerHTML = `
        <div class="online-playlist-item ${isCoverIncomplete ? 'incomplete-cover' : ''}" style="display: flex; align-items: center; gap: 15px;" data-title="${song.title}">
            <img src="${preservedThumbnailSrc}" onerror="this.onerror=null;this.src='./aset/musik.png';" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;">
            <div class="song-info" style="flex-grow: 1; display: flex; flex-direction: column; text-align: left; overflow: hidden;">
                <span class="title" style="color: white; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${song.title}">${song.title}</span>
                <span class="artist" style="color: #aaa; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${song.artist}</span>
            </div>
            <span class="duration" style="color: #aaa; font-size: 0.9rem; padding-left: 10px;">${song.duration}</span>
        </div>
    `;

        li.addEventListener('mouseenter', () => li.style.backgroundColor = 'rgba(0, 255, 255, 0.1)');
        li.addEventListener('mouseleave', () => li.style.backgroundColor = 'transparent');

        li.addEventListener('click', () => {
            playOnlineSongByTitle(song.title);
        });

        playlistElement.appendChild(li);
    });

    // Catat jumlah item tidak lengkap dan jadwalkan pengecekan ulang jika perlu
    if (incompleteCount > 0) {
        console.log(`[Cover Check] Ditemukan ${incompleteCount} lagu dengan informasi kover tidak lengkap.`);
        scheduleCoverRecheck();
    } else {
        console.log('[Cover Check] Semua kover musik berhasil dimuat dengan lengkap.');
        clearTimeout(recheckTimeout); // Hentikan timer jika semua sudah lengkap
    }
}

//------------------- ( end render playlist online ke UI app ) -------------------------//

if (webviewForScroll) {
    webviewForScroll.addEventListener('ipc-message', async (event) => {
        if (event.channel === 'online-playlist-update'
            && activePlaylistSource === 'online'
            && !isScrolling
            && !shouldSkipScroll
        ) {
            console.log('[Renderer] Playlist updated → scroll.');
            await startWebviewScrollLoop();
        }
        if (event.channel === 'special-element-found') {
            console.log('[Renderer] Elemen pemicu scroll ditemukan. Menunggu update playlist untuk memulai scroll.');
        }

        if (event.channel === 'online-playlist-update') {
            const { songs, currentIndex } = event.args[0];
            const payload = event.args[0];
            if (payload && payload.songs) {
                onlinePlaylistData = payload.songs; // Simpan data terbaru

                if (activePlaylistSource === 'online') {
                    renderOnlinePlaylist(onlinePlaylistData);
                }
            }
            latestOnlinePlaylistData = songs;
            onlineCurrentIndex = currentIndex;

            if (activePlaylistSource === 'online' && !isScrolling && !skipAutoScroll) {
                console.log('[Renderer] Playlist diperbarui. Menampilkan overlay...');
                webviewForScroll.send('show-loading-overlay');

                console.log('[Renderer] Memulai dan menunggu proses scroll...');
                await startWebviewScrollLoop();

                console.log('[Renderer] Proses scroll telah selesai. Menyembunyikan overlay.');
                webviewForScroll.send('hide-loading-overlay');
            }
        }
    });
}

//------------------- ( buka webview + pastiin mode online ke-sync ) -------------------------//
async function openExternalWebview(url) {
    if (!window.internetConnectionAllowed) {
        showNotification("Connect to Internet dulu dimenu Option -> Network!", 'notification-warning');
        return;
    }

    // Cek apakah webview sudah aktif dan memuat URL yang sama
    const isAlreadyLoaded = webviewActive && webview.src && webview.src.startsWith(url);

    // Tetap atur mode dan UI utama karena kita akan menampilkan webview
    controlMode = 'webview';
    webviewActive = true;
    loadSong(); // Memperbarui UI utama ke mode 'Online'
    updateMusicUI(); // Memastikan tombol play/pause sesuai

    // Selalu tampilkan container webview
    overlay.classList.remove('hidden');
    webview.focus();

    // Jika sudah dimuat, tidak perlu melakukan apa-apa lagi.
    if (isAlreadyLoaded) {
        console.log('[Webview] Konten sudah dimuat. Hanya menampilkan kembali tanpa reload.');
        // Beralih ke tampilan playlist online jika belum
        if (activePlaylistSource !== 'online') {
            switchToOnlineView(true);
        }
        return;
    }

    console.log('[Webview] Memuat URL baru atau pertama kali:', url);
    webview.src = url;

    // Panggil switchToOnlineView untuk memastikan UI playlist konsisten
    switchToOnlineView(false); // Lakukan burst refresh karena ini pemuatan baru
}

//------------------- ( end buka webview + pastiin mode online ke-sync ) -------------------------//

//------------------- ( tombol close webview ) -------------------------//
closeBtn.addEventListener('click', () => {
    if (overlay.classList.contains('hidden')) {
        console.log("Webview already hidden.");
        return;
    }

    overlay.classList.add('hidden');
    updateMusicUI();
});

//------------------- ( end tombol close webview ) -------------------------//

//------------------- ( toggle DevTools webview ) -------------------------//
const openWebviewDevToolsBtn = document.getElementById('openWebviewDevTools');

if (webview && openWebviewDevToolsBtn) {
    // Event listener saat webview siap (DOM dimuat)
    webview.addEventListener('dom-ready', () => {
        console.log('Webview DOM is ready.');
    });

    // listener tombol "Toggle Webview DevTools"
    openWebviewDevToolsBtn.addEventListener('click', () => {
        if (webview.isDevToolsOpened()) {
            webview.closeDevTools();
            console.log('Webview DevTools closed.');
        } else {
            webview.openDevTools();
            console.log('Webview DevTools opened.');
        }
    });
} else {
    console.warn('Webview element or DevTools button not found!');
}

//------------------- ( end toggle DevTools webview ) -------------------------//

//------------------- ( drag window webview ) -------------------------//
let isDragging = false, offsetX = 0, offsetY = 0;

// Fungsi-fungsi ini didefinisikan di luar agar bisa ditambah/dihapus
function onDragMouseMove(e) {
    if (!isDragging) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;

    // Batasi pergerakan
    x = Math.max(0, Math.min(x, window.innerWidth - win.offsetWidth));
    y = Math.max(0, Math.min(y, window.innerHeight - win.offsetHeight));

    win.style.left = x + 'px';
    win.style.top = y + 'px';
}

function onDragMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onDragMouseMove);
    document.removeEventListener('mouseup', onDragMouseUp);
}

titleBar.addEventListener('mousedown', e => {
    isDragging = true;

    const rect = win.getBoundingClientRect();

    win.style.transform = 'none';
    win.style.top = `${rect.top}px`;
    win.style.left = `${rect.left}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', onDragMouseMove);
    document.addEventListener('mouseup', onDragMouseUp);
});

//------------------- ( end drag window webview ) -------------------------//

//------------------- ( preset mode: desktop vs smartphone ) -------------------------//
const webviewWindow = document.getElementById('webview-window');
const presetNormalBtn = document.getElementById('preset-normal');
const presetVerticalBtn = document.getElementById('preset-vertical');
let webviewResizeMode = 'normal';

function sendScrollbarModeToWebview(mode) {
    if (webview && webview.getWebContentsId()) {
        console.log(`[Index] Mengirim mode scrollbar '${mode}' ke webview.`);
        webview.send('set-scrollbar-mode', { mode: mode });
    } else {
        console.log('[Index] Webview belum siap, pesan mode scrollbar ditunda.');
    }
}

// Set batas minimal biar gak kekecilan
webviewWindow.style.minWidth = '800px';
webviewWindow.style.minHeight = '600px';

//------------------- ( manajemen CSS scrollbar di dalam webview ) -------------------------//
const verticalScrollbarCSS = "html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar { display: none !important; }";
let injectedCSSKey = null;

// Fungsi helper untuk menerapkan/menghapus CSS (dipanggil saat dom-ready & saat ganti preset)
async function applyWebviewScrollbarMode() {
    // memastikan webview sudah dimuat dan siap
    if (!webview || !webview.getWebContentsId()) return;

    try {
        if (webviewResizeMode === 'vertical') {
            // Mode Vertikal: Hapus dulu (jika ada) lalu suntikkan yang baru.
            // Ini untuk mencegah duplikasi jika ada error
            if (injectedCSSKey) {
                await webview.removeInsertedCSS(injectedCSSKey);
            }
            injectedCSSKey = await webview.insertCSS(verticalScrollbarCSS);
            console.log('CSS Scrollbar Vertikal Diterapkan.');
        } else {
            // Mode Normal: Hapus jika ada.
            if (injectedCSSKey) {
                await webview.removeInsertedCSS(injectedCSSKey);
                injectedCSSKey = null;
                console.log('CSS Scrollbar Vertikal Dihapus.');
            }
        }
    } catch (err) {
        console.error('Gagal memanipulasi CSS webview:', err);
        // Reset key jika gagal
        injectedCSSKey = null;
    }
}
//------------------- ( end manajemen CSS scrollbar di dalam webview ) -------------------------//

if (presetNormalBtn && presetVerticalBtn && webviewWindow) {
    presetNormalBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Hentikan event agar tidak ter-trigger drag
        webviewResizeMode = 'normal';

        // Kembalikan ke style default (top-right)
        webviewWindow.style.width = '1250px';
        webviewWindow.style.height = '73%';
        webviewWindow.style.top = '10px';
        webviewWindow.style.right = '10px';
        webviewWindow.style.left = 'auto';
        webviewWindow.style.transform = 'none';
        webviewWindow.style.minWidth = '800px';
        webviewWindow.style.minHeight = '600px';

        presetNormalBtn.classList.add('active');
        presetVerticalBtn.classList.remove('active');

        sendScrollbarModeToWebview('normal'); //(kirim pesan)
    });

    presetVerticalBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Hentikan event agar tidak ter-trigger drag
        webviewResizeMode = 'vertical';

        webviewWindow.style.width = '400px';  // Lebar smartphone
        webviewWindow.style.height = '750px'; // Tinggi smartphone
        webviewWindow.style.top = '50%';
        webviewWindow.style.left = '50%';
        webviewWindow.style.right = 'auto';
        webviewWindow.style.transform = 'translate(-50%, -50%)';
        webviewWindow.style.minWidth = '320px';
        webviewWindow.style.minHeight = '500px';

        presetVerticalBtn.classList.add('active');
        presetNormalBtn.classList.remove('active');

        sendScrollbarModeToWebview('vertical'); //(kirim pesan)
    });
}

//------------------- ( end preset mode: desktop vs smartphone ) -------------------------//

//------------------- ( resize window webview ) -------------------------//
const webviewResizer = webviewWindow.querySelector('.resizer-se');
let isResizingWebview = false;
let startWebviewWidth, startWebviewHeight, startWebviewX, startWebviewY;

if (webviewResizer) {
    webviewResizer.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Mencegah event lain seperti text selection
        e.stopPropagation(); // (Hentikan agar tidak memicu drag title bar)

        isResizingWebview = true;

        // Dapatkan ukuran pixel saat ini
        startWebviewWidth = webviewWindow.offsetWidth;
        startWebviewHeight = webviewWindow.offsetHeight;
        startWebviewX = e.clientX;
        startWebviewY = e.clientY;

        // Tambahkan listener global
        document.addEventListener('mousemove', onWebviewResizeMove);
        document.addEventListener('mouseup', onWebviewResizeUp);
    });
}

function onWebviewResizeMove(e) {
    if (!isResizingWebview) return;

    let newWidth;
    let newHeight;

    // (Logika berdasarkan mode)
    if (webviewResizeMode === 'normal') {
        // Mode normal: Resize bebas dengan batasan minimal
        newWidth = startWebviewWidth + (e.clientX - startWebviewX);
        newHeight = startWebviewHeight + (e.clientY - startWebviewY);

        newWidth = Math.max(800, newWidth); // Min width 800px
        newHeight = Math.max(600, newHeight); // Min height 600px

    } else if (webviewResizeMode === 'vertical') {
        // Mode vertikal ( smartphone )
        const deltaX = e.clientX - startWebviewX;
        const deltaY = e.clientY - startWebviewY;

        // Dapatkan aspect ratio saat drag dimulai (misal: 400 / 750 = 0.53)
        const aspectRatio = startWebviewWidth / startWebviewHeight;

        // Tentukan sumbu utama (perubahan X atau Y yang lebih besar)
        // Ini menentukan apakah ukuran baru dihitung berdasarkan pergeseran mouse horizontal atau vertikal
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Perubahan Lebar (X) lebih dominan
            newWidth = startWebviewWidth + deltaX;
            newHeight = newWidth / aspectRatio; // Hitung tinggi berdasarkan lebar
        } else {
            // Perubahan Tinggi (Y) lebih dominan
            newHeight = startWebviewHeight + deltaY;
            newWidth = newHeight * aspectRatio; // Hitung lebar berdasarkan tinggi
        }

        // Terapkan batasan minimal, *setelah* rasio dihitung
        if (newWidth < 320) {
            newWidth = 320;
            newHeight = newWidth / aspectRatio;
        }
        if (newHeight < 500) {
            newHeight = 500;
            newWidth = newHeight * aspectRatio;
        }
    }

    // Terapkan ukuran baru dalam pixel
    webviewWindow.style.width = `${newWidth}px`;
    webviewWindow.style.height = `${newHeight}px`;
    // (Ini otomatis menghapus 'height: 73%' dari mode normal)
}

function onWebviewResizeUp() {
    isResizingWebview = false;
    // Hapus listener global
    document.removeEventListener('mousemove', onWebviewResizeMove);
    document.removeEventListener('mouseup', onWebviewResizeUp);
}

//------------------- ( end resize window webview ) -------------------------//

//------------------- ( klik ikon musik online ) -------------------------//
onlineIcons.forEach(icon => {
    icon.addEventListener('click', () => {
        const url = icon.getAttribute('data-url');
        if (url) openExternalWebview(url);
    });
});

//------------------- ( end klik ikon musik online ) -------------------------//

// ================================ ( End Online Music Webview ) ================================ //

// ================================ ( [LOGIN-LOG] Log diagnosa login -> DevTools host ) ================================ //
// Tanpa panel GUI. Log navigasi webview + deadline login dari main process
// diteruskan ke sini dan dicetak ke console host (index.html), sehingga
// PERSISTEN lintas navigasi webview dan terlihat saat user buka DevTools (Ctrl+Shift+I).
ipcRenderer.on('login-debug-log', (event, d) => {
    if (!d) return;
    if (d.level === 'warn') console.warn(d.line);
    else console.log(d.line);
});
// ================================ ( End [LOGIN-LOG] ) ================================ //
