// ============================================================================
// Preload webview Spotify
// Pasangan webview-preload.js untuk Spotify. Mengirim kanal yang sama
// (track-changed, playback-update, play-state) supaya player aplikasi, mini
// player, overlay, dan Discord RPC tidak perlu tahu layanan mana yang berbunyi.
// Kontrol datang lewat kanal 'spotify-command' (webview.send), bukan lewat
// objek yang dipasang ke window halaman: skrip Spotify tidak perlu melihat apa
// pun dari aplikasi ini.
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

const MEDIA_EVENT = 'gap-spotify-media-state';
const TICK_MS = 500;

// Semua selektor bergantung pada atribut data-testid web player Spotify.
// Kalau Spotify mengganti nama atribut ini, judul/kontrol diam tanpa error;
// Media Session tetap jadi sumber judul, artis, album, dan kover.
const SELECTOR = {
    title: '[data-testid="now-playing-widget"] [data-testid="context-item-info-title"]',
    artists: '[data-testid="now-playing-widget"] [data-testid="context-item-info-artist"]',
    cover: '[data-testid="now-playing-widget"] [data-testid="cover-art-image"]',
    playPause: '[data-testid="control-button-playpause"]',
    next: '[data-testid="control-button-skip-forward"]',
    prev: '[data-testid="control-button-skip-back"]',
    generalControls: '[data-testid="general-controls"]',
    // Nilai dan max slider ini dalam milidetik.
    progress: '[data-testid="playback-progressbar"] input[type="range"]'
};

// ============================================================================
// 1. HOOK ELEMEN MEDIA (main world)
// Pemutar Spotify adalah <video> yang tidak pernah ditempel ke DOM, jadi dunia
// preload tidak bisa menemukannya. Fungsi ini diserialkan dan dijalankan di main
// world sebelum skrip Spotify, menangkap elemen saat play() dipanggil, lalu
// melaporkan statusnya lewat CustomEvent. Detail-nya string JSON karena objek
// tidak bisa dibaca lintas world, string bisa.
// ============================================================================
function installMediaHook(eventName) {
    let media = null;
    const report = () => {
        if (!media) return;
        document.dispatchEvent(new CustomEvent(eventName, {
            detail: JSON.stringify({ paused: media.paused, currentTime: media.currentTime, duration: media.duration })
        }));
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
        // <video> yang tertempel di DOM itu Canvas (video latar tanpa suara),
        // bukan pemutar lagu.
        if (this !== media && !this.isConnected) {
            media = this;
            ['play', 'playing', 'pause', 'ended', 'emptied', 'loadedmetadata'].forEach((type) => {
                this.addEventListener(type, report);
            });
        }
        return originalPlay.apply(this, arguments);
    };
    setInterval(report, 1000);
}

try {
    contextBridge.executeInMainWorld({ func: installMediaHook, args: [MEDIA_EVENT] });
} catch (err) {
    console.warn('[Spotify Preload] Hook elemen media gagal dipasang:', err);
}

let mediaState = null;
document.addEventListener(MEDIA_EVENT, (event) => {
    try {
        mediaState = JSON.parse(event.detail);
    } catch (err) {
        mediaState = null;
    }
});

// ============================================================================
// 2. MEMBACA STATUS
// ============================================================================
function textOf(selector) {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : '';
}

function largestArtwork(artwork) {
    let best = null;
    let bestSize = 0;
    (artwork || []).forEach((item) => {
        const size = parseInt(String(item.sizes || '').split('x')[0], 10) || 0;
        if (size >= bestSize) {
            best = item.src;
            bestSize = size;
        }
    });
    return best;
}

function readTrack() {
    const md = navigator.mediaSession ? navigator.mediaSession.metadata : null;
    const artistEls = Array.from(document.querySelectorAll(SELECTOR.artists));
    const cover = document.querySelector(SELECTOR.cover);
    return {
        title: (md && md.title) || textOf(SELECTOR.title),
        artist: (md && md.artist) || artistEls.map((a) => a.textContent.trim()).join(', '),
        album: (md && md.album) || '',
        thumbnail: largestArtwork(md && md.artwork) || (cover && cover.src) || '',
        // Saat iklan, Media Session tetap berisi ("Iklan"/"Advertisement") tapi
        // widget tidak punya tautan artis.
        isAd: !!md && artistEls.length === 0
    };
}

function readProgress() {
    const input = document.querySelector(SELECTOR.progress);
    let currentTime = input ? Number(input.value) / 1000 : 0;
    let duration = input ? Number(input.max) / 1000 : 0;
    if (!(duration > 0) && mediaState && isFinite(mediaState.duration)) {
        currentTime = mediaState.currentTime;
        duration = mediaState.duration;
    }
    return { currentTime: currentTime || 0, duration: duration || 0 };
}

function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

let lastTrackKey = null;

function sendState(force = false) {
    const track = readTrack();
    if (!track.title) return;
    const { currentTime, duration } = readProgress();
    const isPlaying = !!(mediaState && !mediaState.paused);

    const trackKey = [track.title, track.artist, track.thumbnail].join('|');
    if (force || trackKey !== lastTrackKey) {
        lastTrackKey = trackKey;
        ipcRenderer.sendToHost('track-changed', {
            title: track.title, thumbnail: track.thumbnail, duration, artist: track.artist, album: track.album
        });
    }
    ipcRenderer.sendToHost('playback-update', {
        currentTime,
        duration,
        progressPercent: duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0,
        timeText: formatTime(currentTime) + ' / ' + formatTime(duration),
        isPlaying,
        title: track.title,
        thumbnail: track.thumbnail,
        artist: track.artist,
        album: track.album,
        isAd: track.isAd
    });
    ipcRenderer.sendToHost('play-state', { playing: isPlaying });
}

setInterval(sendState, TICK_MS);

// ============================================================================
// 3. KONTROL
// ============================================================================
function clickControl(selector) {
    const el = document.querySelector(selector);
    if (el && !el.disabled) el.click();
}

// Tombol acak tidak punya data-testid dan labelnya ikut bahasa (bisa juga
// "Smart Shuffle"). Yang stabil posisinya: tepat sebelum tombol sebelumnya.
function shuffleButton() {
    const buttons = Array.from(document.querySelectorAll(SELECTOR.generalControls + ' button'));
    const prevIndex = buttons.findIndex((b) => b.matches(SELECTOR.prev));
    return prevIndex > 0 ? buttons[prevIndex - 1] : null;
}

// Spotify tidak mendaftarkan handler `seekto` di Media Session, jadi seek lewat
// slider. Slider dikendalikan React: nilai harus lewat setter bawaan supaya
// React melihat perubahannya, lalu event input/change memicu seek.
function seekTo(seconds) {
    const input = document.querySelector(SELECTOR.progress);
    if (!input || !isFinite(seconds)) return;
    const ms = Math.max(0, Math.min(Number(input.max) || 0, Math.round(seconds * 1000)));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(ms));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

const COMMANDS = {
    playPause: () => clickControl(SELECTOR.playPause),
    next: () => clickControl(SELECTOR.next),
    prev: () => clickControl(SELECTOR.prev),
    shuffle: () => {
        const button = shuffleButton();
        if (button) button.click();
    },
    seek: (seconds) => seekTo(seconds),
    // Dipakai saat Spotify baru mengambil alih kontrol: judul yang sama tidak
    // akan dikirim ulang dengan sendirinya.
    resendState: () => sendState(true)
};

ipcRenderer.on('spotify-command', (event, payload) => {
    const command = payload && COMMANDS[payload.command];
    if (command) command(payload.arg);
});
