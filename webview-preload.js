// webview-preload.js
const { contextBridge, ipcRenderer } = require('electron');

// --- DUAL BOOT SUPPORT ---
// Deteksi apakah kita berjalan di mode Native (Jendela Utama) atau Webview
// const isNativeMode = process.argv.includes('--native-mode');

function sendToApp(channel, data) {
    // Selalu kirim ke Host (<webview>)
    // Host (baik index.html maupun native-player.html) akan menangani pesan ini
    ipcRenderer.sendToHost(channel, data);
}
// -------------------------

let lastSentTitle = null;
let lastSentUrl = null;
let lastSentFavicon = null;
let lastSentPlaybackTitle = null; // Khusus untuk judul dari sendPlaybackState
let lastSentPlaybackThumbnail = null; // Khusus untuk thumbnail dari sendPlaybackState
let lastSentPlaybackArtist = null; // Khusus untuk artis dari sendPlaybackState

let audioCtx = null;
let analyser = null;
let muffledLowpassFilter = null; // Filter untuk efek muffled saat quit popup
let muffledGainNode = null;       // Gain untuk efek muffled saat quit popup
let audioChainConnected = false;  // Flag untuk cek apakah chain sudah terhubung
let canvasThumbnailAttempted = false; // Flag untuk mencegah percobaan canvas berulang kali jika gagal

let lastKnownVolume = 1.0;
let isNativeMode = false; // Flag untuk mode native
let adSkipperEnabled = false;
let autoMuteEnabled = false;
let autoSkipEnabled = false;
let isMutedByAd = false;
let lastAdState = 'none';

const SCROLLBAR_STYLE_ID = 'gap-custom-scrollbar-style';
const HIDE_SCROLLBAR_CSS = `
  /* Sembunyikan scrollbar utama */
  html::-webkit-scrollbar, 
  body::-webkit-scrollbar,
  /* Coba targetkan container umum di YT Music (opsional tapi membantu) */
  ytmusic-app::-webkit-scrollbar,
  #contents::-webkit-scrollbar,
  #content::-webkit-scrollbar,
  ytmusic-browse-response::-webkit-scrollbar,
  ytmusic-tab-renderer::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    background: transparent !important;
  }
  
  /* Properti standar & Firefox */
  html, body, ytmusic-app, #contents, #content, ytmusic-browse-response, ytmusic-tab-renderer {
    scrollbar-width: none !important; /* Firefox */
    -ms-overflow-style: none !important; /* IE/Edge */
  }
`;

// Fungsi untuk mendapatkan atau membuat elemen style
function getOrCreateScrollbarStyleElement() {
    let styleElement = document.getElementById(SCROLLBAR_STYLE_ID);
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = SCROLLBAR_STYLE_ID;
        (document.head || document.documentElement).appendChild(styleElement);
        console.log('[Preload] Elemen style scrollbar dibuat.');
    }
    return styleElement;
}

// Listener untuk pesan dari index.html
ipcRenderer.on('set-scrollbar-mode', (event, args) => {
    const mode = args.mode;
    console.log(`[Preload] Menerima mode scrollbar: ${mode}`);
    const styleElement = getOrCreateScrollbarStyleElement();

    if (mode === 'vertical') {
        // Mode Vertikal: Isi style element dengan CSS penyembunyi
        if (styleElement.textContent !== HIDE_SCROLLBAR_CSS) {
            styleElement.textContent = HIDE_SCROLLBAR_CSS;
            console.log('[Preload] CSS Sembunyikan Scrollbar Diterapkan.');
        }
    } else {
        // Mode Normal: Kosongkan style element
        if (styleElement.textContent !== '') {
            styleElement.textContent = '';
            console.log('[Preload] CSS Sembunyikan Scrollbar Dihapus.');
        }
    }
});

// Listener untuk mengaktifkan Native Mode
ipcRenderer.on('set-native-mode', (event, enabled) => {
    isNativeMode = enabled;
    console.log(`[Preload] Native Mode set to: ${isNativeMode}`);
});

console.log('[Preload] Script untuk scrollbar mode siap.');

try {
    const originalVolumeDescriptor = Object.getOwnPropertyDescriptor(
        HTMLMediaElement.prototype,
        'volume'
    );

    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
        get: function () {
            return originalVolumeDescriptor.get.call(this);
        },
        set: function (value) {
            console.log(`[Preload] Volume set attempt. Value: ${value}, NativeMode: ${isNativeMode}, LastKnown: ${lastKnownVolume}`);
            if (isNativeMode) {
                // Di Native Mode, izinkan perubahan volume dari UI YT Music
                // dan update lastKnownVolume agar sinkron
                lastKnownVolume = value;
                originalVolumeDescriptor.set.call(this, value);
            } else {
                // Di Game Mode, paksa volume sesuai kontrol global
                console.log(`[Preload] Blocking volume change in Game Mode. Resetting to ${lastKnownVolume}`);
                originalVolumeDescriptor.set.call(this, lastKnownVolume);
            }
        }
    });
    console.log('[Preload] Volume property has been successfully intercepted.');
} catch (error) {
    console.error('[Preload] Failed to intercept volume property:', error);
}

// --- Fungsi Helper ---
const applyVolumeToMedia = () => {
    // Hanya terapkan jika BUKAN Native Mode
    if (isNativeMode) return;

    const mediaElements = document.querySelectorAll('video, audio');
    if (mediaElements.length > 0) {
        mediaElements.forEach(el => {
            if (el.volume !== lastKnownVolume) {
                el.volume = lastKnownVolume;
            }
        });
    }
};

function parseTimeToSeconds(timeString) {
    if (!timeString || typeof timeString !== 'string') return 0;
    const parts = timeString.split(':');
    if (parts.length === 2) {
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    if (parts.length === 3) {
        return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
    }
    return 0;
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}

// --- Fungsi untuk mendapatkan informasi halaman umum ---
function sendPageInfo() {
    // Kirim URL jika berubah
    if (window.location.href !== lastSentUrl) {
        lastSentUrl = window.location.href;
        sendToApp('webview-url-changed', lastSentUrl);
    }

    // Kirim judul halaman jika berubah
    if (document.title !== lastSentTitle) {
        lastSentTitle = document.title;
        sendToApp('webview-title-changed', lastSentTitle);
    }

    // Kirim Favicon jika berubah
    let favicon = null;
    const faviconLink = document.querySelector("link[rel~='icon']");
    if (faviconLink && faviconLink.href) {
        favicon = faviconLink.href;
    }
    if (favicon !== lastSentFavicon) {
        lastSentFavicon = favicon;
        sendToApp('webview-favicon-updated', lastSentFavicon);
    }
}

// --- Fungsi Canvas untuk Thumbnail Fallback ---
async function getCanvasThumbnailFallback() {
    if (canvasThumbnailAttempted) return null; // Jangan coba lagi jika sudah gagal sekali per halaman
    canvasThumbnailAttempted = true;

    const videoElement = document.querySelector('video'); // Prioritaskan video
    if (videoElement && videoElement.readyState >= 2 && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) { // Pastikan video bisa digambar
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Kualitas 0.7 untuk ukuran file lebih kecil
            console.log('Preload: Canvas thumbnail from video success.');
            return dataUrl;
        } catch (e) {
            console.error('Preload: Error capturing video frame with canvas:', e);
            return null;
        }
    }
    return null;
}

// --- Fungsi Inti untuk Mengirim Status Pemutaran (dari YouTube Music) ---
function getSongImageSrc() {
    const container = document.getElementById('song-image');
    if (!container) return null;
    const shadow = container.querySelector('yt-img-shadow#thumbnail');
    let img = shadow?.querySelector('img#img');
    if (!img) img = container.querySelector('img');
    if (
        img?.src &&
        !img.src.includes('gstatic.com/profile_pic') &&
        img.src !== window.location.href &&
        !img.src.startsWith('data:')
    ) {
        return img.src;
    }
    return null;
}

async function sendPlaybackState() {
    const playerBar = document.querySelector('ytmusic-player-bar');
    if (!playerBar) {
        // Kirim status kosong jika player bar belum siap
        sendToApp('playback-update', {
            currentTime: 0, duration: 0, progressPercent: 0,
            timeText: '0:00 / 0:00', isPlaying: false,
            title: 'Loading...', thumbnail: './aset/musik.png', artist: ''
        });
        return;
    }

    // --- Scraping Data UI (Judul, Waktu, Progress) ---
    const timeInfo = playerBar.querySelector('.time-info');
    const sliderPrimary = playerBar.querySelector('tp-yt-paper-slider.progress-bar #primaryProgress');
    const media = document.querySelector('audio#movie_player,video#movie_player,audio,video');
    const titleEl = playerBar.querySelector('.title.style-scope.ytmusic-player-bar') ||
        playerBar.querySelector('.middle-controls .title');

    // --- Logika Pencarian Artis (Multi-Fallback) ---
    // Prioritas 1: Link artis di player bar bawah
    let artistLink = playerBar.querySelector('yt-formatted-string.byline a');

    // Prioritas 2: Teks langsung di byline (tanpa link) - untuk player bar bawah
    if (!artistLink || !artistLink.textContent.trim()) {
        artistLink = playerBar.querySelector('yt-formatted-string.byline');
    }

    // Prioritas 3: Byline di dalam player controls (untuk mode fullscreen/player page)
    if (!artistLink || !artistLink.textContent.trim()) {
        artistLink = document.querySelector('.byline-wrapper.style-scope.ytmusic-player-controls yt-formatted-string.byline');
    }

    // Prioritas 4: Cari di middle-controls sebagai fallback terakhir
    if (!artistLink || !artistLink.textContent.trim()) {
        artistLink = playerBar.querySelector('.middle-controls yt-formatted-string.byline');
    }

    let currentTime = 0, duration = 0, progressPercent = 0;
    let timeText = '0:00 / 0:00', isPlaying = false;
    let title = 'Unknown Title', artist = '';

    // Default thumbnail
    let thumbnail = './aset/musik.png';

    // Logika Waktu
    if (timeInfo?.textContent) {
        timeText = timeInfo.textContent.trim();
        const [cur, dur] = timeText.split(/\s*\/\s*/);
        currentTime = parseTimeToSeconds(cur);
        duration = parseTimeToSeconds(dur);
    } else if (media?.duration) {
        currentTime = media.currentTime || 0;
        duration = media.duration || 0;
        timeText = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }

    // Logika Progress Bar
    if (sliderPrimary?.style.transform) {
        const m = sliderPrimary.style.transform.match(/scaleX\(([^)]+)\)/);
        if (m) progressPercent = parseFloat(m[1]) * 100;
    } else if (duration > 0) {
        progressPercent = (currentTime / duration) * 100;
    }
    progressPercent = Math.max(0, Math.min(100, progressPercent));

    // Logika Status Play/Pause
    isPlaying = media ? !media.paused : false;

    // Logika Metadata Teks
    if (titleEl?.textContent) title = titleEl.textContent.trim();
    if (artistLink) artist = artistLink.textContent.trim();

    // Logika Thumbnail (Priority Check) ---
    const mainContentThumbSrc = getSongImageSrc();
    const newPlayerBarThumbEl = playerBar?.querySelector('.thumbnail-image-wrapper .image.ytmusic-player-bar');

    // Cek apakah mode video aktif
    const isVideoMode = !!document.querySelector('ytmusic-player[video-mode]');

    if (isVideoMode) {
        if (newPlayerBarThumbEl?.src) thumbnail = newPlayerBarThumbEl.src;
        else if (mainContentThumbSrc) thumbnail = mainContentThumbSrc;
    } else {
        if (mainContentThumbSrc) thumbnail = mainContentThumbSrc;
        else if (newPlayerBarThumbEl?.src) thumbnail = newPlayerBarThumbEl.src;
    }

    // Fallback: Cek queue item yang sedang aktif
    if (!thumbnail || thumbnail === './aset/musik.png') {
        const queueImg = document.querySelector('ytmusic-player-queue-item[play-button-state="playing"] .thumbnail img');
        if (queueImg?.src) thumbnail = queueImg.src;
    }

    // Fallback Terakhir: Canvas (jika video ada tapi gambar tidak ketemu)
    if ((!thumbnail || thumbnail.includes('musik.png')) && media && title !== 'Loading...') {
        const canvasThumb = await getCanvasThumbnailFallback();
        if (canvasThumb) thumbnail = canvasThumb;
    }

    // --- 3. Pengiriman Data ke Index.html ---

    // A. Kirim 'track-changed' HANYA jika Metadata Utama berubah (Untuk Update Judul Window/RPC)
    // Catatan: Kita SUDAH MENGHAPUS 'sendOnlinePlaylist()' dari sini. Bersih!
    if (
        lastAdState === 'none' &&
        title !== 'Loading...' &&
        (title !== lastSentPlaybackTitle || thumbnail !== lastSentPlaybackThumbnail || artist !== lastSentPlaybackArtist)
    ) {
        sendToApp('track-changed', { title, thumbnail, duration: duration > 0 ? duration : 0, artist });

        // Update cache
        lastSentPlaybackTitle = title;
        lastSentPlaybackThumbnail = thumbnail;
        lastSentPlaybackArtist = artist;
    }

    // B. Kirim 'playback-update' terus menerus (Untuk Progress Bar & Waktu)
    sendToApp('playback-update', {
        currentTime, duration: duration > 0 ? duration : 0, progressPercent,
        timeText, isPlaying, title, thumbnail, artist
    });

    // C. Kirim status play simpel
    sendToApp('play-state', { playing: isPlaying });
}

// --- Fungsi untuk Analyser ---
function startOrUpdateAnalyser() {
    const media = document.querySelector('audio#movie_player,video#movie_player,audio,video');
    if (!media) {
        console.log('[Preload] Menunggu elemen media...');
        setTimeout(startOrUpdateAnalyser, 2000);
        return;
    }

    if (!audioCtx || audioCtx.state === 'closed') {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;

            // Buat lowpass filter dan gain node untuk efek muffled
            // Ini akan selalu terhubung, tapi parameter hanya berubah saat popup muncul
            muffledLowpassFilter = audioCtx.createBiquadFilter();
            muffledLowpassFilter.type = 'lowpass';
            muffledLowpassFilter.frequency.value = 22050; // Full range (tidak memfilter)
            muffledLowpassFilter.Q.value = 0.7;

            muffledGainNode = audioCtx.createGain();
            muffledGainNode.gain.value = 1.0;

            const source = audioCtx.createMediaElementSource(media);

            // Chain: source -> lowpassFilter -> gainNode -> analyser -> destination
            source.connect(muffledLowpassFilter);
            muffledLowpassFilter.connect(muffledGainNode);
            muffledGainNode.connect(analyser);
            analyser.connect(audioCtx.destination);

            audioChainConnected = true;
            console.log('[Preload] Audio chain dengan support muffled effect berhasil di-setup');
        } catch (e) {
            console.error('Preload Analyser: Gagal menginisialisasi Web Audio API:', e);
            audioCtx = null; analyser = null; muffledLowpassFilter = null; muffledGainNode = null;
            audioChainConnected = false;
            return;
        }
    }

    if (audioCtx && audioCtx.state === 'suspended' && !media.paused) {
        audioCtx.resume().catch(err => console.warn('Preload Analyser: Error resuming AudioContext:', err));
    }

    if (analyser && audioCtx && audioCtx.state === 'running' && !media.paused) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Akselerasi visualizer
        const relevantDataSlice = Array.from(dataArray.slice(0, Math.min(64, dataArray.length)));
        sendToApp('analyser-data', { data: relevantDataSlice, isPlaying: !media.paused });

        // console.log('[Preload] MENGIRIM data analyser:', dataArray.slice(0, 5)); // Tampilkan 5 data pertama

        sendToApp('analyser-data', { data: Array.from(dataArray), isPlaying: !media.paused });
    } else {
        sendToApp('analyser-data', {
            data: new Array(analyser?.frequencyBinCount || 32).fill(0),
            isPlaying: !media?.paused
        });
    }
}

ipcRenderer.on('set-webview-volume', (event, volume) => {
    console.log(`[Preload] Received set-webview-volume: ${volume}`);
    lastKnownVolume = volume;
    applyVolumeToMedia();
});

ipcRenderer.on('setting-update', (event, settings) => {
    if (settings.adSkipperEnabled !== undefined) {
        adSkipperEnabled = settings.adSkipperEnabled;
        autoMuteEnabled = settings.autoMuteAds;
        autoSkipEnabled = settings.autoSkipAds;

        console.log(`[Preload] Settings Updated -> Skipper: ${adSkipperEnabled}, Mute: ${autoMuteEnabled}, AutoSkip: ${autoSkipEnabled}`);
    }
});

ipcRenderer.on('remote-control-action', (event, action) => {
    if (window.playerAPI && typeof window.playerAPI[action] === 'function') {
        console.log(`[Preload] Executing remote action: ${action}`);
        window.playerAPI[action](); // Panggil fungsi yang sesuai di playerAPI
    }
});

// --- Listener untuk Efek Audio Muffled (Quit Popup) ---
ipcRenderer.on('apply-muffled-effect', () => {
    if (!audioChainConnected || !muffledLowpassFilter || !muffledGainNode || !audioCtx) {
        console.warn('[Preload] Audio chain belum ready, skip efek muffled di webview');
        return;
    }

    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const currentTime = audioCtx.currentTime;
        const transitionDuration = 0.3;

        // Turunkan cutoff frequency untuk efek terpendam
        muffledLowpassFilter.frequency.cancelScheduledValues(currentTime);
        muffledLowpassFilter.frequency.setValueAtTime(muffledLowpassFilter.frequency.value, currentTime);
        muffledLowpassFilter.frequency.linearRampToValueAtTime(500, currentTime + transitionDuration);

        // Bass boost
        muffledLowpassFilter.Q.cancelScheduledValues(currentTime);
        muffledLowpassFilter.Q.setValueAtTime(muffledLowpassFilter.Q.value, currentTime);
        muffledLowpassFilter.Q.linearRampToValueAtTime(2.5, currentTime + transitionDuration);

        // Volume reduction
        muffledGainNode.gain.cancelScheduledValues(currentTime);
        muffledGainNode.gain.setValueAtTime(muffledGainNode.gain.value, currentTime);
        muffledGainNode.gain.linearRampToValueAtTime(0.7, currentTime + transitionDuration);

        console.log('[Preload] Efek muffled diaktifkan di webview');
    } catch (error) {
        console.error('[Preload] Gagal menerapkan efek muffled:', error);
    }
});

ipcRenderer.on('remove-muffled-effect', () => {
    if (!audioChainConnected || !muffledLowpassFilter || !muffledGainNode || !audioCtx) {
        return;
    }

    try {
        const currentTime = audioCtx.currentTime;
        const transitionDuration = 0.25;

        // Kembalikan cutoff frequency ke full range
        muffledLowpassFilter.frequency.cancelScheduledValues(currentTime);
        muffledLowpassFilter.frequency.setValueAtTime(muffledLowpassFilter.frequency.value, currentTime);
        muffledLowpassFilter.frequency.linearRampToValueAtTime(22050, currentTime + transitionDuration);

        // Kembalikan Q ke normal
        muffledLowpassFilter.Q.cancelScheduledValues(currentTime);
        muffledLowpassFilter.Q.setValueAtTime(muffledLowpassFilter.Q.value, currentTime);
        muffledLowpassFilter.Q.linearRampToValueAtTime(0.7, currentTime + transitionDuration);

        // Kembalikan volume ke 100%
        muffledGainNode.gain.cancelScheduledValues(currentTime);
        muffledGainNode.gain.setValueAtTime(muffledGainNode.gain.value, currentTime);
        muffledGainNode.gain.linearRampToValueAtTime(1.0, currentTime + transitionDuration);

        console.log('[Preload] Efek muffled dinonaktifkan di webview');
    } catch (error) {
        console.error('[Preload] Gagal menghapus efek muffled:', error);
    }
});

function sendOnlinePlaylist() {
    // --- Bagian Awal Fungsi (Scraping) Tetap Sama ---
    const playlistContainer = document.querySelector('ytmusic-player-queue#queue, ytmusic-tab-renderer');
    if (!playlistContainer) {
        return;
    }
    const songRows = playlistContainer.querySelectorAll('ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer');
    const onlinePlaylist = [];
    let currentlyPlayingIndex = -1;
    const albumCoverSrc = document.querySelector('ytmusic-detail-header-renderer yt-img-shadow img')?.src || null;

    songRows.forEach((row, index) => {
        if (row.hasAttribute('playing') || row.getAttribute('play-button-state') === 'playing') {
            currentlyPlayingIndex = index;
        }
        const titleEl = row.querySelector('.song-title, .title-column .title');
        const artistEl = row.querySelector('.byline, .secondary-flex-columns yt-formatted-string.flex-column');
        const durationEl = row.querySelector('.duration, .fixed-columns .fixed-column');
        const thumbnailEl = row.querySelector('.thumbnail img');
        const title = titleEl ? (titleEl.title || titleEl.textContent).trim() : null;
        if (title && durationEl) {
            onlinePlaylist.push({
                title: title,
                artist: artistEl ? artistEl.textContent.trim() : 'Unknown Artist',
                thumbnail: thumbnailEl && thumbnailEl.src && !thumbnailEl.src.includes('gstatic') ? thumbnailEl.src : albumCoverSrc || './aset/musik.png',
                duration: durationEl.textContent.trim()
            });
        }
    });
    if (onlinePlaylist.length === 0) {
        return;
    }
    const playlistId = onlinePlaylist.slice(0, 5).map(s => s.title).join('|');

    sendToApp('online-playlist-update', {
        playlistId: playlistId,
        songs: onlinePlaylist,
        currentIndex: currentlyPlayingIndex
    });
}

// --- Inisialisasi Setelah DOM Siap ---
window.addEventListener('DOMContentLoaded', () => {
    sendPageInfo(); // Kirim info halaman awal
    sendPlaybackState(); // Kirim status playback awal (jika ada player YTM)
    canvasThumbnailAttempted = false; // Reset flag percobaan canvas setiap DOM baru dimuat

    // --- Logika Deteksi Iklan (Diperbarui) ---
    // Hapus 'let lastAdState = 'none';' dari sini karena sudah dipindah ke global
    let lastAdDetailsJSON = '';

    const adObserver = new MutationObserver(() => {
        if (!adSkipperEnabled) {
            if (lastAdState !== 'none') {
                lastAdState = 'none';
                sendToApp('ad-status-update', { state: 'none' });
            }
            return;
        }

        // --- Selectors dari Informasi Kamu ---
        const skipButtonContainer = document.querySelector('.ytp-ad-skip-button-container');
        const countdownContainer = document.querySelector('.ytp-ad-preview-container');
        const adInfo = document.querySelector('.ytp-ad-player-overlay-instream-info');

        const getSkipButton = () => {
            const possibleSelectors = [
                '.ytp-ad-skip-button',
                '.ytp-ad-skip-button-modern',
                '.videoAdUiSkipButton',
                '.ytp-skip-ad-button',
                'button[id^="skip-button:"]',
                '.ytp-ad-overlay-close-button' // Kadang iklan banner overlay
            ];

            for (const selector of possibleSelectors) {
                const btn = document.querySelector(selector);
                // Pastikan tombol ada dan visible (offsetParent tidak null)
                if (btn && btn.offsetParent !== null) {
                    return btn;
                }
            }
            return null;
        };
        const skipButton = getSkipButton();

        // --- Scraping Data Tambahan (DIPERBARUI LAGI) ---
        let adDetails = {
            nextImage: null,
            textInfo: null,      // Untuk Status Text ("Video akan diputar setelah iklan")
            remainingTime: null, // KHUSUS UNTUK BADGE ("0:28")
            adCount: null,       // Untuk Badge ("1 / 2")
            skipLabel: null      // KHUSUS UNTUK TOMBOL ("Lewati" / "Skip" / "スキップ")
        };

        // 1. Ambil Gambar Preview (Logic Tetap)
        const possibleImgSelectors = [
            '.ytp-ad-preview-image-modern .ytp-ad-image',
            '.ytp-ad-preview-container img',
            '.ytp-ad-preview-container-detached img',
            'img[id^="ad-image:"]',
            '.ytp-ad-image'
        ];

        for (const selector of possibleImgSelectors) {
            const imgEl = document.querySelector(selector);
            if (imgEl && imgEl.src && (imgEl.src.startsWith('http') || imgEl.src.startsWith('https'))) {
                adDetails.nextImage = imgEl.src;
                break;
            }
        }

        // 2. Ambil Teks Status (Countdown / Info)
        const previewTextEl = document.querySelector('.ytp-ad-preview-text-modern');
        if (previewTextEl) {
            // Ambil teks seperti "5 detik lagi" untuk status bar
            adDetails.textInfo = previewTextEl.textContent.trim().replace(/\s+/g, ' ');
        }

        // 3. [BARU] Ambil Waktu Remaining Khusus Badge (0:28)
        const durationEl = document.querySelector('.ytp-ad-duration-remaining .ytp-ad-text');
        if (durationEl) {
            adDetails.remainingTime = durationEl.textContent.trim();
            // Jika textInfo (status) masih kosong, pakai waktu ini sebagai fallback
            if (!adDetails.textInfo) adDetails.textInfo = adDetails.remainingTime;
        }

        // 4. [BARU] Ambil Teks Tombol Skip Asli (スキップ / Skip)
        const skipBtnTextEl = document.querySelector('.ytp-ad-skip-button-text');
        if (skipBtnTextEl) {
            adDetails.skipLabel = skipBtnTextEl.textContent.trim();
        }

        // 5. Ambil Info Badge (Jumlah Iklan atau Teks Sponsor)
        const adBadgeEl = document.querySelector('.ytp-ad-simple-ad-badge .ytp-ad-text');
        if (adBadgeEl) {
            let text = adBadgeEl.textContent.trim();

            // Cek apakah ada pola angka (misal "1 / 2")
            const match = text.match(/(\d+\s*\/\s*\d+)/);

            if (match) {
                // Jika format angka ("1 / 2"), ambil angkanya saja
                adDetails.adCount = match[1];
            } else {
                // Jika format teks ("Sponsor ·" atau "Iklan ·")
                // Hapus karakter '·' dan spasi berlebih
                adDetails.adCount = text.replace(/·/g, '').trim();
            }
        }

        // --- Logika Deteksi Iklan Berdasarkan Metadata ---
        let isMetadataAd = false;
        const playerBar = document.querySelector('ytmusic-player-bar');
        if (playerBar) {
            const titleEl = playerBar.querySelector('.title.style-scope.ytmusic-player-bar') ||
                playerBar.querySelector('.middle-controls .title');
            const titleText = titleEl ? titleEl.textContent.trim() : '';

            const artistEl = playerBar.querySelector('yt-formatted-string.byline a');
            const hasArtist = artistEl && artistEl.textContent.trim().length > 0;

            const thumbEl = playerBar.querySelector('.thumbnail-image-wrapper .image.ytmusic-player-bar');
            // Cek src. Jika kosong atau data:image (placeholder), anggap tidak ada cover valid.
            const hasThumb = thumbEl && thumbEl.src && thumbEl.src !== '' && !thumbEl.src.startsWith('data:');

            // Syarat: Judul ada (bukan loading), tapi Artis & Cover KOSONG
            if (titleText && titleText !== 'Loading...' && !hasArtist && !hasThumb) {
                isMetadataAd = true;
            }
        }

        // --- Logika Deteksi Iklan Berdasarkan Badge Stark (Permintaan User) ---
        let isStarkAd = false;
        const starkBadge = document.querySelector('ytmusic-player-bar .badge-style-type-ad-stark');
        // Logic: Jika ada dan TIDAK hidden -> Iklan Aktif
        if (starkBadge && !starkBadge.hasAttribute('hidden')) {
            isStarkAd = true;
        }

        // --- Penentuan State (Waiting/Skippable/None) & EKSEKUSI OTOMATIS ---
        let currentState = 'none';
        let currentBounds = null;

        // Prioritas 1: Tombol skip ada DAN terlihat
        if (skipButton && skipButton.offsetParent !== null) {
            currentState = 'skippable';
            const rect = skipButton.getBoundingClientRect();
            currentBounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };

            // === [AUTO SKIP] ===
            if (autoSkipEnabled) {
                if (!window.isAutoSkipping) {
                    console.log('[Preload] Auto Skip aktif! Mengirim koordinat ke Host...');

                    // Kunci sebentar
                    window.isAutoSkipping = true;
                    setTimeout(() => { window.isAutoSkipping = false; }, 1000);

                    // 1. Ambil koordinat tombol SAAT INI JUGA
                    const rect = skipButton.getBoundingClientRect();

                    // 2. Hitung titik tengah tombol
                    const clickX = rect.left + (rect.width / 2);
                    const clickY = rect.top + (rect.height / 2);

                    // 3. Kirim paket lengkap ke index.html
                    sendToApp('request-auto-skip-instant', { x: clickX, y: clickY });
                }
            }
        }
        // Prioritas 2: Countdown ada
        else if (countdownContainer && countdownContainer.offsetParent !== null) {
            currentState = 'waiting';
        }
        // Prioritas 3: Info ad umum ada
        else if (adInfo && adInfo.offsetParent !== null) {
            currentState = 'waiting';
        }
        // Prioritas 4: Stark Ad Badge detected
        else if (isStarkAd) {
            currentState = 'waiting';
            console.log('[Preload] Ad detected via Stark Badge (visible .badge-style-type-ad-stark).');
        }
        // Prioritas 5: Metadata hilang (Artis & Cover)
        else if (isMetadataAd) {
            currentState = 'waiting';
            console.log('[Preload] Ad detected via missing metadata (Artist & Cover missing).');
        }

        // === [LOGIKA BARU: AUTO MUTE] ===
        const mediaElements = document.querySelectorAll('video, audio');

        if (autoMuteEnabled) {
            // Jika sedang ada iklan (Waiting atau Skippable)
            if (currentState === 'waiting' || currentState === 'skippable') {
                // Dan belum di-mute oleh sistem kita
                if (!isMutedByAd) {
                    mediaElements.forEach(el => el.muted = true);
                    isMutedByAd = true;
                    console.log('[Preload] Iklan terdeteksi -> Muting audio.');
                }
            }
            // Jika iklan sudah selesai (None)
            else if (currentState === 'none') {
                // Dan sebelumnya di-mute oleh sistem kita, kembalikan suara
                if (isMutedByAd) {
                    mediaElements.forEach(el => el.muted = false);
                    isMutedByAd = false;
                    console.log('[Preload] Iklan selesai -> Unmuting audio.');
                }
            }
        } else {
            // Safety Check dikit, Jika user mematikan fitur Auto Mute TEPAT saat iklan sedang jalan,
            // kita harus memastikan suara dikembalikan (unmute) agar tidak bisu selamanya.
            if (isMutedByAd) {
                mediaElements.forEach(el => el.muted = false);
                isMutedByAd = false;
                console.log('[Preload] Fitur dimatikan user -> Mengembalikan audio.');
            }
        }

        // Cek apakah ada perubahan data (State atau Details)
        const currentDetailsJSON = JSON.stringify(adDetails);

        if (currentState !== lastAdState || (currentState !== 'none' && currentDetailsJSON !== lastAdDetailsJSON)) {
            lastAdState = currentState;
            lastAdDetailsJSON = currentDetailsJSON;

            console.log('[Preload Ad Skipper] Update:', currentState, adDetails);

            // Kirim state, bounds, DAN details
            sendToApp('ad-status-update', {
                state: currentState,
                bounds: currentBounds,
                details: adDetails
            });
        }
    });

    // Mulai mengamati perubahan
    adObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'] // Perubahan style/class/hidden bisa jadi ad muncul/hilang
    });
    console.log('[Preload] Ad Skipper MutationObserver is now active.');

    let specialElementFound = false; // Flag untuk mencegah pengiriman berulang
    let playlistUpdateDebounceTimer;

    const scrollTriggerObserver = new MutationObserver((mutations, observer) => {
        // Cari elemen target
        const targetElement = document.querySelector('ytmusic-tab-renderer#tab-renderer.scroller');

        // Jika elemen ditemukan DAN kita belum mengirim sinyal sebelumnya
        if (targetElement && !specialElementFound) {
            console.log('[Preload] Elemen pemicu scroll DITEMUKAN. Mengirim sinyal ke host.');
            sendToApp('special-element-found');
            specialElementFound = true; // Set flag agar tidak mengirim lagi untuk elemen yang sama
        }
        // Opsional: Reset flag jika elemennya hilang (berguna untuk navigasi di dalam webview)
        else if (!targetElement && specialElementFound) {
            specialElementFound = false;
            console.log('[Preload] Elemen pemicu scroll hilang, flag direset.');
        }
    });

    // Mulai mengamati perubahan pada body dan semua elemen di dalamnya
    scrollTriggerObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    console.log('[Preload] MutationObserver untuk pemicu scroll otomatis aktif.');

    // --- OBSERVER: DATA DRIVEN TRIGGER ---
    // Debouncer agar tidak spamming saat YT merender list satu per satu
    const debouncedSendPlaylist = () => {
        clearTimeout(playlistUpdateDebounceTimer);
        playlistUpdateDebounceTimer = setTimeout(() => {
            console.log('[Preload] Perubahan struktur playlist terdeteksi (DOM). Mengirim update & request scroll.');
            sendOnlinePlaylist();
        }, 500);
    };

    // Observer yang memantau perubahan fisik pada elemen Playlist
    const playlistObserver = new MutationObserver((mutations) => {
        // Apapun jenis perubahannya (anak elemen bertambah, atribut berubah),
        // Kita anggap playlist berubah strukturnya.
        debouncedSendPlaylist();
    });

    // Logic untuk menempelkan observer ke container yang tepat
    const observePlaylistContainer = () => {
        // Target: Kontainer lagu di dalam Queue
        const playlistContainer = document.querySelector('ytmusic-player-queue#queue > #contents');

        if (playlistContainer) {
            console.log('[Preload] Kontainer playlist ditemukan. Observer Aktif.');
            // Kita pantau childList (lagu nambah/kurang)
            playlistObserver.observe(playlistContainer, { childList: true });
        } else {
            // Retry jika elemen belum dirender oleh YT
            setTimeout(observePlaylistContainer, 1000);
        }
    };

    // Jalankan pengamatan
    observePlaylistContainer();

    // === CAROUSEL/SHELF LOADING OBSERVER ===
    // Mendeteksi penambahan elemen ytmusic-carousel-shelf-renderer saat scroll
    // Ini menandakan konten baru sedang di-load dari server
    let lastCarouselCount = 0;
    let carouselLoadingTimeout = null;
    const CAROUSEL_LOADING_DEBOUNCE = 200; // Debounce untuk menghindari spam

    const carouselShelfObserver = new MutationObserver((mutations) => {
        // Hitung jumlah carousel saat ini
        const currentCount = document.querySelectorAll('ytmusic-carousel-shelf-renderer').length;

        // Jika jumlah bertambah, berarti ada konten baru yang di-load
        if (currentCount > lastCarouselCount) {
            const addedCount = currentCount - lastCarouselCount;
            console.log(`[Preload] Carousel shelf bertambah: +${addedCount} (total: ${currentCount})`);

            // Kirim status loading dimulai
            clearTimeout(carouselLoadingTimeout);
            sendToApp('buffer-status-update', {
                buffering: true,
                reason: `carousel-loading (+${addedCount})`,
                category: 'dom-loading'
            });

            // Set timeout untuk menandai loading selesai
            carouselLoadingTimeout = setTimeout(() => {
                sendToApp('buffer-status-update', {
                    buffering: false,
                    reason: 'carousel-loaded',
                    category: 'dom-loading'
                });
            }, CAROUSEL_LOADING_DEBOUNCE);
        }

        lastCarouselCount = currentCount;
    });

    // Observe perubahan pada body untuk mendeteksi penambahan carousel
    carouselShelfObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    console.log('[Preload] Carousel/shelf loading observer aktif.');

    // === SECONDARY PROGRESS BAR OBSERVER ===
    // Mendeteksi perubahan pada progress bar predownload musik (#secondaryProgress)
    // YTM menggunakan transform: scaleX(0.xxx) untuk mengatur progress
    let lastScaleX = 0;
    let secondaryProgressTimeout = null;
    let isSecondaryProgressBuffering = false;
    const SECONDARY_PROGRESS_DEBOUNCE = 300;

    function getScaleX(el) {
        if (!el) return 0;

        // Coba dari inline style dulu (lebih cepat)
        const inlineStyle = el.style.transform;
        if (inlineStyle) {
            const match = inlineStyle.match(/scaleX\(([0-9.]+)\)/);
            if (match) return parseFloat(match[1]);
        }

        // Fallback ke computed style
        const computed = window.getComputedStyle(el);
        if (computed.transform && computed.transform !== 'none') {
            // Matrix format: matrix(scaleX, 0, 0, scaleY, tx, ty)
            const matrixMatch = computed.transform.match(/matrix\(([^,]+)/);
            if (matrixMatch) {
                return parseFloat(matrixMatch[1]);
            }
            // Atau langsung scaleX
            const scaleMatch = computed.transform.match(/scaleX\(([0-9.]+)\)/);
            if (scaleMatch) {
                return parseFloat(scaleMatch[1]);
            }
        }

        return 0;
    }

    function handleScaleXChange(currentScaleX) {
        // Jika scaleX berubah dan bertambah, berarti sedang predownload
        if (currentScaleX !== lastScaleX && currentScaleX > 0) {
            const isGrowing = currentScaleX > lastScaleX;

            // Hanya log jika ada perubahan signifikan (> 0.01)
            if (Math.abs(currentScaleX - lastScaleX) > 0.01) {
                console.log(`[Preload] Predownload progress: ${(lastScaleX * 100).toFixed(1)}% -> ${(currentScaleX * 100).toFixed(1)}% (${isGrowing ? 'growing' : 'shrinking'})`);
            }

            if (isGrowing && !isSecondaryProgressBuffering) {
                // ScaleX bertambah = sedang predownload
                isSecondaryProgressBuffering = true;
                clearTimeout(secondaryProgressTimeout);

                sendToApp('buffer-status-update', {
                    buffering: true,
                    reason: `predownload (${(currentScaleX * 100).toFixed(0)}%)`,
                    category: 'prefetch'
                });
            }

            // Set timeout untuk menandai predownload selesai
            clearTimeout(secondaryProgressTimeout);
            secondaryProgressTimeout = setTimeout(() => {
                if (isSecondaryProgressBuffering) {
                    isSecondaryProgressBuffering = false;
                    sendToApp('buffer-status-update', {
                        buffering: false,
                        reason: 'predownload-complete',
                        category: 'prefetch'
                    });
                }
            }, SECONDARY_PROGRESS_DEBOUNCE);

            lastScaleX = currentScaleX;
        }
    }

    function observeSecondaryProgress() {
        // Cari elemen #secondaryProgress
        const el = document.querySelector('#secondaryProgress');

        if (!el) {
            // Retry jika elemen belum ada
            setTimeout(observeSecondaryProgress, 2000);
            return;
        }

        console.log('[Preload] Secondary progress bar ditemukan, monitoring scaleX...');

        // MutationObserver untuk perubahan style (transform)
        const mutationObserver = new MutationObserver((mutations) => {
            const scaleX = getScaleX(el);
            handleScaleXChange(scaleX);
        });

        mutationObserver.observe(el, {
            attributes: true,
            attributeFilter: ['style']
        });

        // Juga poll secara berkala sebagai fallback
        setInterval(() => {
            const scaleX = getScaleX(el);
            handleScaleXChange(scaleX);
        }, 500);
    }

    // Mulai observe secondary progress
    observeSecondaryProgress();


    const observer = new MutationObserver(() => {
        // applyVolumeToMedia();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
    console.log('Preload: MutationObserver for volume control is now active (but disabled).');

    const playerBar = document.querySelector('ytmusic-player-bar');
    if (playerBar) {
        const observer = new MutationObserver(() => {
            sendPageInfo(); // Perubahan di player bar bisa juga berarti info halaman berubah (misal judul diupdate oleh YTM)
            sendPlaybackState();
        });
        observer.observe(playerBar, { attributes: true, childList: true, subtree: true, characterData: true });

        const ytPlayer = document.querySelector('ytmusic-player');
        if (ytPlayer) {
            const videoModeObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'video-mode') {
                        sendPlaybackState(); break;
                    }
                }
            });
            videoModeObserver.observe(ytPlayer, { attributes: true });
        }
        setInterval(sendPlaybackState, 750);
    } else {
        setInterval(sendPlaybackState, 1000); // Tetap coba kirim playback state jika player bar tidak langsung ada
    }

    // === BUFFERING DETECTION SYSTEM ===
    // Sistem deteksi buffering untuk fitur "Preparing content" hint
    // responsif, lebih banyak event trigger
    let isBuffering = false;
    let bufferingTimeout = null;
    let lastBufferingSentTime = 0; // Track kapan terakhir kirim status buffering

    // Kategori buffering (untuk logging dan debugging)
    const CATEGORY = {
        USER_FACING: 'user-facing',    // Buffering yang terlihat user (loading lagu, seek, stalled)
        PREFETCH: 'prefetch',          // Background preloading (lagu berikutnya dalam queue)
        PRELOAD: 'preload',            // Initial preload saat halaman load
        NETWORK: 'network',            // Network API requests
        DOM_LOADING: 'dom-loading'     // DOM elements loading (carousel, shelf, dll)
    };

    // Statistik untuk debugging
    let bufferingStats = {
        userFacing: 0,
        prefetch: 0,
        network: 0,
        domLoading: 0
    };

    function sendBufferStatus(buffering, reason = '', category = CATEGORY.USER_FACING) {
        // Update statistik
        if (buffering) {
            if (category === CATEGORY.USER_FACING) bufferingStats.userFacing++;
            else if (category === CATEGORY.PREFETCH || category === CATEGORY.PRELOAD) bufferingStats.prefetch++;
            else if (category === CATEGORY.NETWORK) bufferingStats.network++;
            else if (category === CATEGORY.DOM_LOADING) bufferingStats.domLoading++;
        }

        // Log dengan warna berbeda berdasarkan kategori
        const categoryColor = (category === CATEGORY.PREFETCH || category === CATEGORY.PRELOAD)
            ? '\x1b[33m'  // Kuning untuk prefetch/preload
            : (category === CATEGORY.DOM_LOADING)
                ? '\x1b[35m' // Magenta untuk DOM loading
                : '\x1b[32m'; // Hijau untuk user-facing/network
        const resetColor = '\x1b[0m';

        console.log(`[Preload] ${categoryColor}[${category.toUpperCase()}]${resetColor} Buffer: ${buffering ? 'START' : 'END'} - ${reason} | Stats: UF=${bufferingStats.userFacing}, PF=${bufferingStats.prefetch}, NET=${bufferingStats.network}, DOM=${bufferingStats.domLoading}`);

        // Kirim status buffering ke host (native-player.html) - semua kategori dikirim
        sendToApp('buffer-status-update', {
            buffering: buffering,
            reason: reason,
            category: category
        });
        if (buffering) lastBufferingSentTime = Date.now();
    }

    function setupMediaListeners() {
        const media = document.querySelector('audio#movie_player,video#movie_player,audio,video');
        if (media) {
            ['play', 'pause', 'seeking', 'seeked', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'volumechange'].forEach(event => {
                media.addEventListener(event, sendPlaybackState);
            });
            media.addEventListener('play', () => {
                if (audioCtx && audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(e => console.warn('Error resuming audio context on play:', e));
                }
                startOrUpdateAnalyser();
            });

            // === BUFFERING EVENT LISTENERS  ===
            // Debounce dikurangi agar lebih responsif

            // Event 'loadstart' - dipicu saat mulai loading resource baru (lagu baru)
            media.addEventListener('loadstart', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    // Langsung kirim tanpa delay untuk loading lagu baru
                    sendBufferStatus(true, 'loadstart');
                }
            });

            // Event 'waiting' - dipicu saat media berhenti karena buffer kosong
            media.addEventListener('waiting', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    // Debounce dikurangi dari 300ms ke 50ms
                    bufferingTimeout = setTimeout(() => {
                        if (isBuffering) {
                            sendBufferStatus(true, 'waiting');
                        }
                    }, 50);
                }
            });

            // Event 'stalled' - dipicu saat browser mencoba mengambil data tapi tidak mendapatkannya
            media.addEventListener('stalled', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    bufferingTimeout = setTimeout(() => {
                        if (isBuffering) {
                            sendBufferStatus(true, 'stalled');
                        }
                    }, 50);
                }
            });

            // Event 'seeking' - dipicu saat user melakukan seek
            media.addEventListener('seeking', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    // Langsung kirim untuk seeking agar lebih responsif
                    sendBufferStatus(true, 'seeking');
                }
            });

            // Event 'suspend' - dipicu saat loading media ditunda (bisa jadi preload selesai sebagian)
            media.addEventListener('suspend', () => {
                // Hanya trigger jika media sedang tidak pause dan readyState rendah
                if (!isBuffering && !media.paused && media.readyState < 3) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    bufferingTimeout = setTimeout(() => {
                        if (isBuffering) {
                            sendBufferStatus(true, 'suspend');
                        }
                    }, 100);
                }
            });

            // Event 'canplay' - dipicu saat cukup data tersedia untuk mulai/lanjut bermain
            media.addEventListener('canplay', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'canplay');
                }
            });

            // Event 'canplaythrough' - dipicu saat cukup data untuk play sampai habis tanpa buffer lagi
            media.addEventListener('canplaythrough', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'canplaythrough');
                }
            });

            // Event 'playing' - dipicu saat playback benar-benar dimulai setelah pause/buffer
            media.addEventListener('playing', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'playing');
                }
            });

            // Event 'seeked' - dipicu saat operasi seek selesai
            media.addEventListener('seeked', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'seeked');
                }
            });

            // === TAMBAHAN EVENT LISTENERS UNTUK DETEKSI BUFFERING YANG LEBIH LENGKAP ===

            // Event 'emptied' - dipicu saat media element dikosongkan (biasanya sebelum load track baru)
            // Jangan langsung kirim, tunggu konfirmasi ada loadstart setelahnya
            // Karena emptied bisa terpicu saat src dikosongkan tanpa ada download
            media.addEventListener('emptied', () => {
                // Hanya set flag, biarkan loadstart yang mengirim status
                // Ini mencegah false positive saat element hanya dikosongkan
                console.log('[Preload] Media emptied, waiting for loadstart...');
            });

            // Event 'progress' - dipicu saat data sedang di-download
            // Gunakan ini untuk mendeteksi network activity yang lambat
            let lastProgressTime = 0;
            let progressCheckInterval = null;

            media.addEventListener('progress', () => {
                lastProgressTime = Date.now();

                // Jika media sedang play tapi readyState rendah, kemungkinan buffering
                if (!media.paused && media.readyState < 3 && !isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(true, 'progress-slow');
                }
            });

            // Event 'loadeddata' - dipicu saat data pertama sudah tersedia
            media.addEventListener('loadeddata', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'loadeddata');
                }
            });

            // Event 'error' - dipicu saat terjadi error loading media  
            media.addEventListener('error', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'error');
                }
            });

            // Event 'abort' - dipicu saat loading media dibatalkan
            media.addEventListener('abort', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'abort');
                }
            });

            // === NETWORK STATE MONITORING ===
            // Tambahan: monitoring perubahan networkState untuk deteksi yang lebih akurat
            let lastNetworkState = media.networkState;
            setInterval(() => {
                if (media.networkState !== lastNetworkState) {
                    lastNetworkState = media.networkState;

                    // NETWORK_LOADING = 2 -> sedang mengambil data dari server
                    if (media.networkState === 2 && !media.paused && media.readyState < 4 && !isBuffering) {
                        isBuffering = true;
                        clearTimeout(bufferingTimeout);
                        sendBufferStatus(true, 'network-loading');
                    }
                    // NETWORK_IDLE = 1 -> tidak ada aktivitas network (bisa jadi sudah selesai load)
                    else if (media.networkState === 1 && isBuffering && media.readyState >= 3) {
                        isBuffering = false;
                        clearTimeout(bufferingTimeout);
                        sendBufferStatus(false, 'network-idle');
                    }
                }
            }, 250); // Check setiap 250ms

            setInterval(startOrUpdateAnalyser);
        } else {
            setTimeout(setupMediaListeners, 2000);
        }
    }
    setupMediaListeners();

    // === NETWORK ACTIVITY DETECTION SYSTEM ===
    // Sistem untuk mendeteksi SEMUA aktivitas download/penerimaan data dari server
    // Ini akan menjadi pemicu universal untuk process-indicator-hint

    let activeNetworkRequests = 0;
    let networkActivityTimeout = null;
    const NETWORK_DEBOUNCE_MS = 150; // Debounce untuk menghindari flicker

    function onNetworkActivityStart(source) {
        activeNetworkRequests++;
        clearTimeout(networkActivityTimeout);

        // Jika ini permintaan pertama, kirim status buffering
        if (activeNetworkRequests === 1 && !isBuffering) {
            isBuffering = true;
            sendBufferStatus(true, `network-${source}`, CATEGORY.NETWORK);
        }
    }

    function onNetworkActivityEnd(source) {
        activeNetworkRequests = Math.max(0, activeNetworkRequests - 1);

        // Gunakan debounce sebelum mengirim status selesai
        // Ini untuk menghindari flicker saat ada multiple requests berturut-turut
        clearTimeout(networkActivityTimeout);
        networkActivityTimeout = setTimeout(() => {
            if (activeNetworkRequests === 0 && isBuffering) {
                isBuffering = false;
                sendBufferStatus(false, `network-${source}-complete`, CATEGORY.NETWORK);
            }
        }, NETWORK_DEBOUNCE_MS);
    }

    // --- 1. INTERCEPT XMLHttpRequest (XHR) ---
    // Mendeteksi request AJAX tradisional (digunakan oleh YT Music untuk beberapa API)
    try {
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...args) {
            this._gapUrl = url; // Simpan URL untuk debugging
            return originalXHROpen.apply(this, [method, url, ...args]);
        };

        XMLHttpRequest.prototype.send = function (...args) {
            const xhr = this;
            const url = xhr._gapUrl || '';

            // Hanya track request yang relevan (audio/video/API calls)
            // Abaikan request kecil seperti analytics, telemetry, dll
            const isRelevantRequest =
                url.includes('/videoplayback') ||
                url.includes('/youtubei/') ||
                url.includes('googlevideo.com') ||
                url.includes('/api/') ||
                url.includes('.m4a') ||
                url.includes('.mp4') ||
                url.includes('.webm');

            if (isRelevantRequest) {
                onNetworkActivityStart('xhr');

                xhr.addEventListener('loadend', function () {
                    onNetworkActivityEnd('xhr');
                });
            }

            return originalXHRSend.apply(this, args);
        };
        console.log('[Preload] XHR interceptor aktif untuk deteksi network activity.');
    } catch (e) {
        console.warn('[Preload] Gagal setup XHR interceptor:', e);
    }

    // --- 2. INTERCEPT FETCH API ---
    // Mendeteksi modern API calls (digunakan oleh YT Music untuk sebagian besar request)
    try {
        const originalFetch = window.fetch;

        window.fetch = function (input, init) {
            const url = typeof input === 'string' ? input : (input.url || '');

            // Hanya track request yang relevan
            const isRelevantRequest =
                url.includes('/videoplayback') ||
                url.includes('/youtubei/') ||
                url.includes('googlevideo.com') ||
                url.includes('/api/') ||
                url.includes('.m4a') ||
                url.includes('.mp4') ||
                url.includes('.webm') ||
                url.includes('/browse') ||
                url.includes('/player') ||
                url.includes('/next');

            if (isRelevantRequest) {
                onNetworkActivityStart('fetch');

                return originalFetch.apply(this, [input, init])
                    .then(response => {
                        onNetworkActivityEnd('fetch');
                        return response;
                    })
                    .catch(error => {
                        onNetworkActivityEnd('fetch');
                        throw error;
                    });
            }

            return originalFetch.apply(this, [input, init]);
        };
        console.log('[Preload] Fetch interceptor aktif untuk deteksi network activity.');
    } catch (e) {
        console.warn('[Preload] Gagal setup Fetch interceptor:', e);
    }

    // --- 3. PERFORMANCE OBSERVER untuk Resource Loading ---
    // Mendeteksi loading resource (audio/video segments) secara real-time
    try {
        if (typeof PerformanceObserver !== 'undefined') {
            const resourceObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    const url = entry.name || '';

                    // Filter hanya resource media yang relevan
                    const isMediaResource =
                        url.includes('/videoplayback') ||
                        url.includes('googlevideo.com') ||
                        url.includes('.m4a') ||
                        url.includes('.mp4') ||
                        url.includes('.webm') ||
                        url.includes('.ts') || // HLS segments
                        url.includes('range='); // Partial content requests

                    if (isMediaResource) {
                        // Resource sudah selesai load saat masuk ke PerformanceObserver
                        // Jadi kita tidak perlu track start/end, hanya log saja
                        console.log(`[Preload] Media resource loaded: ${entry.duration?.toFixed(0)}ms`);
                    }
                }
            });

            resourceObserver.observe({
                type: 'resource',
                buffered: false
            });
            console.log('[Preload] PerformanceObserver aktif untuk monitoring resource loading.');
        }
    } catch (e) {
        console.warn('[Preload] Gagal setup PerformanceObserver:', e);
    }

    // --- 4. TAMBAHAN: Re-attach listener jika media element berubah ---
    // YT Music kadang mengganti element media saat ganti track
    let lastMediaElement = null;
    setInterval(() => {
        const currentMedia = document.querySelector('audio#movie_player,video#movie_player,audio,video');
        if (currentMedia && currentMedia !== lastMediaElement) {
            console.log('[Preload] Media element berubah, re-attaching buffering listeners...');
            lastMediaElement = currentMedia;

            // Re-attach core buffering events
            currentMedia.addEventListener('loadstart', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(true, 'loadstart-reattach');
                }
            });

            currentMedia.addEventListener('waiting', () => {
                if (!isBuffering) {
                    isBuffering = true;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(true, 'waiting-reattach');
                }
            });

            currentMedia.addEventListener('canplay', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'canplay-reattach');
                }
            });

            currentMedia.addEventListener('playing', () => {
                if (isBuffering) {
                    isBuffering = false;
                    clearTimeout(bufferingTimeout);
                    sendBufferStatus(false, 'playing-reattach');
                }
            });

            // === TAMBAHAN: Deteksi buffered ranges untuk akurasi lebih tinggi ===
            // Ini mendeteksi apakah posisi playback saat ini memiliki data yang cukup
            let lastBufferCheck = 0;
            currentMedia.addEventListener('timeupdate', () => {
                const now = Date.now();
                // Cek setiap 500ms untuk menghindari spam
                if (now - lastBufferCheck < 500) return;
                lastBufferCheck = now;

                const buffered = currentMedia.buffered;
                const currentTime = currentMedia.currentTime;

                // Cek apakah kita punya cukup buffer ahead (minimal 2 detik)
                let hasEnoughBuffer = false;
                for (let i = 0; i < buffered.length; i++) {
                    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime + 2) {
                        hasEnoughBuffer = true;
                        break;
                    }
                }

                // Jika sedang play tapi buffer tidak cukup
                if (!currentMedia.paused && !hasEnoughBuffer && currentMedia.readyState < 4) {
                    if (!isBuffering) {
                        isBuffering = true;
                        sendBufferStatus(true, 'buffer-insufficient');
                    }
                }
            });
        }
    }, 1000);

    // --- 5. INITIAL PAGE LOAD DETECTION ---
    // EKSPERIMEN: Mendeteksi initial page load sebagai PRELOAD
    // Ini akan menampilkan hint saat halaman pertama kali loading
    let initialLoadDetected = false;
    let isPrefetching = false; // Flag terpisah untuk prefetch (tidak mengganggu isBuffering utama)

    // Tandai bahwa initial load dimulai
    if (document.readyState !== 'complete') {
        initialLoadDetected = true;
        isPrefetching = true;
        // EKSPERIMEN: Kirim dengan kategori PRELOAD
        sendBufferStatus(true, 'initial-page-load', CATEGORY.PRELOAD);

        window.addEventListener('load', () => {
            setTimeout(() => {
                initialLoadDetected = false;
                if (isPrefetching) {
                    isPrefetching = false;
                    sendBufferStatus(false, 'initial-page-load-complete', CATEGORY.PRELOAD);
                }
                console.log('[Preload] Initial page load complete');
            }, 500);
        });
    }

    // --- 6. NAVIGATION DETECTION (SPA) ---
    // EKSPERIMEN: Mendeteksi navigasi internal sebagai PREFETCH
    // Ini akan menampilkan hint saat navigasi di YT Music
    let lastNavigationUrl = window.location.href;
    let navigationPending = false;

    const navigationObserver = new MutationObserver(() => {
        if (window.location.href !== lastNavigationUrl) {
            lastNavigationUrl = window.location.href;
            console.log('[Preload] SPA Navigation detected:', lastNavigationUrl);

            // EKSPERIMEN: Kirim dengan kategori PREFETCH
            navigationPending = true;
            sendBufferStatus(true, 'navigation', CATEGORY.PREFETCH);

            // Auto-clear setelah 3 detik jika tidak ada aktivitas lain
            setTimeout(() => {
                if (navigationPending) {
                    navigationPending = false;
                    sendBufferStatus(false, 'navigation-timeout', CATEGORY.PREFETCH);
                }
            }, 3000);
        }
    });

    navigationObserver.observe(document.body, {
        childList: true,
        subtree: true
    });

    // --- 7. PLAYBACK RATE / QUALITY CHANGE DETECTION ---
    // Deteksi perubahan kualitas audio/video yang memicu re-buffering
    setInterval(() => {
        const media = document.querySelector('audio,video');
        if (!media) return;

        // Deteksi dari readyState yang menurun
        // HAVE_NOTHING=0, HAVE_METADATA=1, HAVE_CURRENT_DATA=2, HAVE_FUTURE_DATA=3, HAVE_ENOUGH_DATA=4
        if (!media.paused && media.readyState < 3 && !isBuffering) {
            isBuffering = true;
            sendBufferStatus(true, 'readyState-low');
        } else if (media.readyState >= 3 && isBuffering && activeNetworkRequests === 0) {
            // Hanya clear jika tidak ada network request yang masih berjalan
            isBuffering = false;
            sendBufferStatus(false, 'readyState-sufficient');
        }
    }, 300);

    // --- 8. SMART TIMEOUT FALLBACK ---
    // Safety net: jika buffering terlalu lama tanpa update, auto-clear
    // Ini mencegah hint stuck selamanya jika ada edge case yang terlewat
    setInterval(() => {
        if (isBuffering && lastBufferingSentTime > 0) {
            const bufferingDuration = Date.now() - lastBufferingSentTime;
            // Jika buffering lebih dari 15 detik tanpa update, anggap selesai
            if (bufferingDuration > 15000) {
                console.warn('[Preload] Buffering timeout reached, force clearing...');
                isBuffering = false;
                activeNetworkRequests = 0;
                sendBufferStatus(false, 'timeout-fallback');
            }
        }
    }, 5000);

    // --- 9. VISIBILITY CHANGE HANDLER ---
    // Saat tab menjadi visible kembali, cek apakah perlu buffering
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const media = document.querySelector('audio,video');
            if (media && !media.paused && media.readyState < 3) {
                if (!isBuffering) {
                    isBuffering = true;
                    sendBufferStatus(true, 'visibility-resumed');
                }
            }
        }
    });

    // --- 10. EKSPERIMEN: DETEKSI PREFETCH LAGU BERIKUTNYA ---
    // YouTube Music secara otomatis pre-download lagu berikutnya dalam queue
    // Ini mendeteksi aktivitas tersebut dengan memonitor network requests ke /videoplayback
    // yang terjadi saat lagu sedang diputar (bukan saat transisi)
    let lastPlayingTrackTime = 0;
    let prefetchDetected = false;

    // Monitor untuk mendeteksi prefetch berdasarkan pola network
    // Jika ada request /videoplayback saat:
    // 1. Media sedang playing
    // 2. readyState sudah tinggi (4 = HAVE_ENOUGH_DATA)
    // 3. Sudah beberapa detik sejak track dimulai
    // Maka kemungkinan besar itu adalah prefetch untuk lagu berikutnya
    setInterval(() => {
        const media = document.querySelector('audio,video');
        if (!media) return;

        // Track waktu playing untuk deteksi prefetch
        if (!media.paused && media.currentTime > 0) {
            // Jika media sudah playing lebih dari 10 detik DAN readyState penuh
            // DAN ada network activity, kemungkinan itu prefetch
            if (media.currentTime > 10 &&
                media.readyState === 4 &&
                activeNetworkRequests > 0 &&
                !prefetchDetected) {

                prefetchDetected = true;
                console.log('[Preload] [EKSPERIMEN] Kemungkinan prefetch lagu berikutnya terdeteksi!');
                sendBufferStatus(true, 'next-track-prefetch', CATEGORY.PREFETCH);

                // Auto-clear setelah network selesai atau 5 detik
                setTimeout(() => {
                    if (prefetchDetected) {
                        prefetchDetected = false;
                        sendBufferStatus(false, 'next-track-prefetch-done', CATEGORY.PREFETCH);
                    }
                }, 5000);
            }
        } else {
            // Reset saat pause atau track baru
            if (media.currentTime < 3) {
                prefetchDetected = false;
            }
        }
    }, 1000);

    // --- 11. EKSPERIMEN: DETEKSI SUSPEND EVENT SEBAGAI PRELOAD ---
    // Event 'suspend' dipicu saat browser selesai preload sebagian data
    // Ini bisa menandakan background preloading
    const setupSuspendListener = () => {
        const media = document.querySelector('audio,video');
        if (!media) {
            setTimeout(setupSuspendListener, 2000);
            return;
        }

        media.addEventListener('suspend', () => {
            // Suspend saat media paused = mungkin background preload
            if (media.paused && media.readyState >= 2) {
                console.log('[Preload] [EKSPERIMEN] Suspend event saat paused - kemungkinan background preload');
                sendBufferStatus(true, 'suspend-preload', CATEGORY.PRELOAD);

                // Auto-clear setelah 1 detik (suspend biasanya cepat)
                setTimeout(() => {
                    sendBufferStatus(false, 'suspend-preload-done', CATEGORY.PRELOAD);
                }, 1000);
            }
        });
    };
    setupSuspendListener();

    setTimeout(sendOnlinePlaylist, 1000);


    // Listener untuk perubahan URL (misalnya navigasi internal SPA)
    // dan perubahan judul dokumen
    new MutationObserver(() => {
        sendPageInfo();
    }).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });

    // Lebih baik menggunakan event 'popstate' dan 'hashchange' untuk navigasi SPA
    window.addEventListener('popstate', sendPageInfo);
    window.addEventListener('hashchange', sendPageInfo);
});

// --- Fungsi Helper untuk Overlay Scroll (YANG HILANG) ---
function injectLoadingOverlay() {
    if (document.getElementById('internal-loader-overlay')) return;

    try {
        // Buat elemen div baru
        const overlay = document.createElement('div');

        // Set ID
        overlay.id = 'internal-loader-overlay';

        // Set atribut style (ini aman dan tidak melanggar Trusted Types)
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.background = 'rgba(0,0,0,0.7)';
        overlay.style.display = 'none'; // Mulai dengan tersembunyi
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999999';
        overlay.style.color = 'white';
        overlay.style.fontSize = '1.2rem';
        overlay.style.backdropFilter = 'blur(5px)';

        // Tambahkan teks konten
        overlay.textContent = 'Memuat daftar putar...';

        // Tambahkan elemen ke body
        document.body.appendChild(overlay);

        console.log('[Preload] Internal loading overlay injected (via createElement).');
    } catch (e) {
        console.error('[Preload] Gagal menginjeksi loading overlay:', e);
    }
}

// --- Fungsi Helper untuk Overlay Scroll (YANG BARU, berdasarkan penelitian kita) ---
function injectQueueLoadingStyles() {
    const styleId = 'ytm-queue-loader-style';
    if (document.getElementById(styleId)) return; // Jangan injeksi dua kali

    try {
        const styleElement = document.createElement('style');
        styleElement.id = styleId;

        // Ini adalah CSS final dari penelitian kita
        // (spinner di top: 8% dan teks di bawahnya)
        styleElement.textContent = `
            /* Langkah 1: Siapkan 'kanvas' */
            ytmusic-player-queue {
              position: relative;
            }

            /* LANGKAH 2: SPINNER (::before) */
            ytmusic-player-queue.sedang-memuat::before {
              content: '';
              display: block;
              position: absolute;
              top: 8%;
              left: 50%;
              transform: translateX(-50%); 
              width: 40px;
              height: 40px;
              border-radius: 50%;
              border: 4px solid rgba(255, 255, 255, 0.2);
              border-top-color: #FFFFFF;
              animation: spin 1s linear infinite;
              z-index: 12; 
              pointer-events: none;
            }

            /* LANGKAH 3: OVERLAY + TEKS (::after) */
            ytmusic-player-queue.sedang-memuat::after {
              content: 'Loading...';
              display: flex;
              justify-content: center;
              align-items: flex-start; /* Ratakan ke atas */
              
              /* Kalkulasi padding-top agar di bawah spinner */
              padding-top: calc(8% + 40px + 10px); 
              
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background-color: rgba(0, 0, 0, 0.5); 
              color: #FFFFFF;
              font-size: 14px;
              font-weight: 500;
              z-index: 11; 
              pointer-events: none;
            }

            /* Langkah 4: Animasi 'spin' */
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
        `;

        document.head.appendChild(styleElement);
        console.log('[Preload] CSS untuk Queue Loading Overlay berhasil diinjeksi.');

    } catch (e) {
        console.error('[Preload] Gagal menginjeksi CSS Queue Loading:', e);
    }
}

function showLoadingOverlay() {
    const overlay = document.getElementById('internal-loader-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('internal-loader-overlay');
    if (overlay) overlay.style.display = 'none';
}

window.addEventListener('DOMContentLoaded', () => {
    injectLoadingOverlay();
    injectQueueLoadingStyles();

    // Observer untuk menginjeksi ulang jika DOM berubah drastis (navigasi SPA)
    const bodyObserver = new MutationObserver(() => {
        if (!document.getElementById('internal-loader-overlay')) {
            injectLoadingOverlay(); //
        }
        if (!document.getElementById('ytm-queue-loader-style')) {
            injectQueueLoadingStyles(); // Panggil lagi jika hilang
        }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });
});

const sleep = ms => new Promise(res => setTimeout(res, ms));

// --- API yang Diekspos ke Renderer Utama ---
try {
    contextBridge.exposeInMainWorld('playerAPI', { // API untuk kontrol musik (YTM)
        playPause: () => {
            const btn = document.querySelector('ytmusic-player-bar #play-pause-button button');
            if (btn) btn.click();
        },
        next: () => {
            const btn = document.querySelector('ytmusic-player-bar .next-button button');
            if (btn) btn.click();
        },
        prev: () => {
            const btn = document.querySelector('ytmusic-player-bar .previous-button button');
            if (btn) btn.click();
        },
        shuffle: () => {
            const btn = document.querySelector('ytmusic-player-bar .shuffle-button button');
            if (btn) btn.click();
        },
        seek: (timeInSeconds) => {
            const media = document.querySelector('audio#movie_player,video#movie_player,audio,video');
            if (media && isFinite(timeInSeconds)) {
                media.currentTime = timeInSeconds;
            }
        },

        requestMetadata: () => { // Untuk meminta update manual dari host
            sendPageInfo();
            sendPlaybackState();
        },

        scanPlaylist: () => {
            sendOnlinePlaylist();
        },

        rescanSpecificCovers: (titlesToRescan) => {
            const updatedCovers = {};
            if (!Array.isArray(titlesToRescan) || titlesToRescan.length === 0) {
                return;
            }

            const songRows = document.querySelectorAll('ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer');
            const albumCoverSrc = document.querySelector('ytmusic-detail-header-renderer yt-img-shadow img')?.src || null;

            songRows.forEach(row => {
                const titleEl = row.querySelector('.song-title, .title-column .title');
                const title = titleEl ? (titleEl.title || titleEl.textContent).trim() : null;

                // Hanya proses jika judul lagu ini ada dalam daftar yang perlu discan ulang
                if (title && titlesToRescan.includes(title)) {
                    const thumbnailEl = row.querySelector('.thumbnail img');
                    const thumbSrc = thumbnailEl?.src;

                    // Cek apakah sumber thumbnail valid dan bukan placeholder
                    if (thumbSrc && !thumbSrc.includes('gstatic') && !thumbSrc.startsWith('data:')) {
                        updatedCovers[title] = thumbSrc;
                    } else if (albumCoverSrc) { // Fallback ke kover album jika ada
                        updatedCovers[title] = albumCoverSrc;
                    }
                }
            });

            // Kirim kembali hanya data kover yang berhasil ditemukan
            if (Object.keys(updatedCovers).length > 0) {
                sendToApp('specific-covers-updated', updatedCovers);
            }
        },

        clickPlayButtonOnSong: (title) => {
            const songRows = document.querySelectorAll('ytmusic-player-queue-item, ytmusic-responsive-list-item-renderer');
            for (const row of songRows) {
                const titleEl = row.querySelector('.song-title, .title-column .title');
                if (titleEl?.textContent.trim() == title) {
                    // Setelah baris yang benar ditemukan, cari tombol play di dalamnya
                    const playButton = row.querySelector('#play-button'); // Tombol play memiliki ID yang jelas!

                    if (playButton) {
                        // Langsung panggil .click() pada elemen tombol play
                        playButton.click();
                        console.log(`Perintah .click() berhasil dikirim ke tombol play untuk lagu "${title}".`);
                        return { success: true };
                    } else {
                        console.warn('Tombol play tidak ditemukan di dalam baris lagu.');
                        return { success: false, reason: 'Play button not found' };
                    }
                }
            }
            return { success: false, reason: 'Song title not found' };
        },

        showQueueLoading: () => {
            const queueElement = document.querySelector('ytmusic-player-queue');
            if (queueElement) {
                queueElement.classList.add('sedang-memuat');
                console.log('[Preload] Menampilkan Queue Loading.');
            } else {
                console.warn('[Preload] Gagal menemukan ytmusic-player-queue untuk show loading.');
            }
        },

        hideQueueLoading: () => {
            const queueElement = document.querySelector('ytmusic-player-queue');
            if (queueElement) {
                queueElement.classList.remove('sedang-memuat');
                console.log('[Preload] Menyembunyikan Queue Loading.');
            } else {
                console.warn('[Preload] Gagal menemukan ytmusic-player-queue untuk hide loading.');
            }
        },

        getPlaylistContainerBounds: () => {
            const el = document.querySelector('ytmusic-player-queue#queue, ytmusic-tab-renderer#tab-renderer.scroller');
            if (el) {
                const rect = el.getBoundingClientRect();
                return {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                };
            }
            return null;
        },
        clickSkipButton: () => {
            try {
                // Gunakan selector yang sama persis dengan yang ada di adObserver
                const skipButton = document.querySelector('button.ytp-ad-skip-button-modern.ytp-button');

                // Cek apakah tombol itu ada DAN terlihat (offsetParent !== null)
                if (skipButton && skipButton.offsetParent !== null) {
                    console.log('[Preload] clickSkipButton: Tombol skip ditemukan, mengeksekusi .click()');

                    // --- DEBUGGING VISUAL: Tambahkan penanda visual ---
                    try {
                        const rect = skipButton.getBoundingClientRect();
                        const marker = document.createElement('div');
                        marker.id = 'debug-click-marker';
                        marker.style.position = 'fixed'; // Gunakan fixed agar relatif ke viewport
                        marker.style.left = `${rect.left}px`;
                        marker.style.top = `${rect.top}px`;
                        marker.style.width = `${rect.width}px`;
                        marker.style.height = `${rect.height}px`;
                        marker.style.border = '4px solid #FF0000'; // Border merah tebal
                        marker.style.backgroundColor = 'rgba(255, 0, 0, 0.3)'; // Latar transparan merah
                        marker.style.zIndex = '99999999'; // Pastikan di atas segalanya
                        marker.style.pointerEvents = 'none'; // Agar tidak mengganggu klik lain
                        marker.style.boxSizing = 'border-box'; // Agar border rapi
                        document.body.appendChild(marker);

                        // Hapus penanda setelah 500ms
                        setTimeout(() => {
                            const existingMarker = document.getElementById('debug-click-marker');
                            if (existingMarker) {
                                document.body.removeChild(existingMarker);
                            }
                        }, 500);
                    } catch (e) {
                        console.warn('[Preload] Gagal membuat penanda debug visual:', e);
                    }
                    // --- Akhir Debugging Visual ---

                    // skipButton.click(); // Klik internal langsung pada elemen tombol

                    // Gunakan pendekatan koordinat yang lebih handal (sesuai permintaan user)
                    const rect = skipButton.getBoundingClientRect();
                    const clickX = rect.left + (rect.width / 2);
                    const clickY = rect.top + (rect.height / 2);
                    sendToApp('request-auto-skip-instant', { x: clickX, y: clickY });

                    return { success: true };
                }

                console.warn('[Preload] clickSkipButton: Tombol skip tidak ditemukan atau tidak terlihat.');
                return { success: false, reason: 'Tombol skip tidak ditemukan atau tidak terlihat' };
            } catch (e) {
                console.error('[Preload] error clickSkipButton:', e);
                return { success: false, reason: e.message };
            }
        }

    });

    contextBridge.exposeInMainWorld('navigationAPI', { // API untuk navigasi browser umum
        getCurrentUrl: () => window.location.href,
        getCurrentTitle: () => document.title,
    });

} catch (e) {
    console.error('Preload: Failed to expose APIs:', e);
}
