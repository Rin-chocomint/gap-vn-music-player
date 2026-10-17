// ============================================================================
// Session Spotify
// Spotify di webview butuh dua hal yang tidak dibutuhkan YouTube Music: modul
// Widevine (cuma ada di Electron castLabs, komponennya diunduh saat pertama
// dipakai) dan User-Agent tanpa token aplikasi/Electron. Keduanya dikurung di
// partition sendiri supaya webview YouTube Music tetap memakai UA bawaan.
// ============================================================================
const { app, components, ipcMain, session } = require('electron');

const SPOTIFY_PARTITION = 'persist:spotify';

// Unduhan pertama CDM di mesin ini selesai kurang dari 2 dtk. Batas longgar ini
// untuk jaringan lambat; lewat dari itu lebih jujur bilang gagal daripada
// membiarkan webview memuat Spotify yang pasti menolak memutar.
const WIDEVINE_TIMEOUT_MS = 90000;

// Teks untuk pengguna, dipakai jendela webview mode game dan mode native.
const WIDEVINE_MESSAGES = {
    unsupported: 'Versi aplikasi ini belum mendukung pemutaran Spotify.',
    timeout: 'Modul pemutaran Spotify belum selesai diunduh. Periksa koneksi internet, lalu coba lagi.',
    'install-failed': 'Modul pemutaran Spotify gagal dipasang. Periksa koneksi internet, lalu coba lagi.'
};

let widevinePromise = null;

// Dengan token `Electron/x` atau `<nama-aplikasi>/<versi>` di UA, Spotify
// menyajikan halaman web seluler ("Buka Aplikasi") tanpa pemutar. Jangan
// pindahkan ini ke session default: UA yang dimodifikasi di jalur login Google
// pernah ditolak "browser tidak aman" (lihat blok LOGIN-FIX di main.js).
function cleanUserAgent(ua) {
    const appToken = ` ${app.getName()}/${app.getVersion()}`;
    return ua.split(appToken).join('').replace(/ Electron\/\S+/, '');
}

function widevineVersion() {
    try {
        const status = components.status()[components.WIDEVINE_CDM_ID];
        return status && status.version ? status.version : null;
    } catch (e) {
        return null;
    }
}

function prepareWidevine() {
    // Electron stock tidak punya modul `components` sama sekali.
    if (!components || typeof components.whenReady !== 'function') {
        return Promise.resolve({ ok: false, reason: 'unsupported' });
    }
    if (!widevinePromise) {
        const timeout = new Promise((resolve) => {
            setTimeout(() => resolve({ ok: false, reason: 'timeout' }), WIDEVINE_TIMEOUT_MS);
        });
        const install = components.whenReady([components.WIDEVINE_CDM_ID])
            .then(() => ({ ok: true, version: widevineVersion() }))
            .catch((err) => ({ ok: false, reason: 'install-failed', detail: err && err.message }));
        widevinePromise = Promise.race([install, timeout]).then((result) => {
            // Gagal jangan disimpan: jaringan bisa pulih, percobaan berikutnya harus mengulang.
            if (!result.ok) widevinePromise = null;
            return result;
        });
    }
    return widevinePromise;
}

// isInternetAllowed disuplai main.js. Penyaring internet mode game cuma dipasang
// di session default, jadi tanpa ini partition Spotify lolos dari tombol
// "Disconnect" di Options.
function registerSpotifySupport({ isInternetAllowed }) {
    app.whenReady().then(() => {
        const ses = session.fromPartition(SPOTIFY_PARTITION);
        ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));
        ses.webRequest.onBeforeRequest((details, callback) => {
            const isHttp = /^https?:/i.test(details.url);
            callback({ cancel: isHttp && !isInternetAllowed() });
        });
    });

    ipcMain.handle('spotify:prepare', async () => {
        const result = await prepareWidevine();
        if (result.ok) {
            console.log('[Spotify] Widevine siap, versi', result.version);
            return result;
        }
        console.warn('[Spotify] Widevine belum siap:', result.reason, result.detail || '');
        return Object.assign({ message: WIDEVINE_MESSAGES[result.reason] || WIDEVINE_MESSAGES['install-failed'] }, result);
    });
}

module.exports = {
    SPOTIFY_PARTITION,
    cleanUserAgent,
    registerSpotifySupport
};
