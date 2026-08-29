
//-------------------------------------
// Discord RPC
//-------------------------------------
const RPC = require('discord-rpc');
const clientId = '1394882882220068924';

let rpc = null;
// Waktu kapan RPC berhasil terhubung, sebagai ANGKA epoch-ms.
// Dulu sebuah `Date`, dan itu selamat hanya karena `rpc.setActivity()` diam-diam
// mengubahnya (`timestamps.start instanceof Date → getTime()`). Begitu payload
// dirakit sendiri lewat `request('SET_ACTIVITY')`, konversi itu ikut hilang dan
// Discord menolak SELURUH activity: `child "timestamps" ... must be a number`
// (code 4000) — bukan cuma gambarnya yang hilang, seluruh status berhenti
// diperbarui. Disimpan sebagai angka sejak awal supaya jebakan itu tak bisa
// kembali lewat pemanggil mana pun.
let rpcStartTime = null;
let isRpcEnabled = false;          // Status fitur RPC (diaktifkan/dinonaktifkan oleh user)
let isRpcReady = false;            // Status koneksi RPC (true hanya saat ready dan terhubung)
let isRpcConnecting = false;       // Flag untuk mencegah koneksi ganda saat proses koneksi
let rpcRetryInterval = null;
let currentAppMode = 'game';       // 'game' | 'native' | 'gif-overlay'

// Fungsi utama yang dipanggil untuk memulai koneksi
function initRPC() {
    if (!isRpcEnabled) {
        console.log('[RPC] Inisialisasi dibatalkan karena fitur dinonaktifkan.');
        return;
    }
    if (rpc || isRpcConnecting) {
        console.log('[RPC] Instance RPC sudah ada atau sedang connecting, skip inisialisasi.');
        return;
    }
    console.log('[RPC] Mencoba memulai koneksi RPC...');
    connectRPC();
}

function connectRPC() {
    // Cek ulang apakah fitur masih enabled (bisa berubah antara panggilan)
    if (!isRpcEnabled) {
        console.log('[RPC] Koneksi dibatalkan karena fitur sudah dinonaktifkan.');
        return;
    }
    
    // Cegah koneksi ganda
    if (isRpcConnecting) {
        console.log('[RPC] Sudah dalam proses koneksi, skip.');
        return;
    }
    
    // Hapus instance lama jika ada (tanpa async, langsung cleanup)
    if (rpc) {
        try {
            rpc.removeAllListeners(); // Hapus semua listener untuk mencegah event lama
            rpc.destroy().catch(() => {}); // Ignore error
        } catch (e) { /* ignore */ }
        rpc = null;
    }
    
    // Reset status
    isRpcReady = false;
    isRpcConnecting = true;
    
    // Bersihkan retry interval jika ada
    if (rpcRetryInterval) {
        clearInterval(rpcRetryInterval);
        rpcRetryInterval = null;
    }

    rpc = new RPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
        // Pastikan masih enabled saat ready (bisa saja user toggle OFF saat connecting)
        if (!isRpcEnabled) {
            console.log('[RPC] Ready tapi fitur sudah dinonaktifkan, cleanup...');
            cleanupRpcInstance();
            return;
        }
        
        console.log('[RPC] Berhasil terhubung ke Discord.');
        isRpcConnecting = false;
        isRpcReady = true;
        
        if (rpcRetryInterval) {
            clearInterval(rpcRetryInterval);
            rpcRetryInterval = null;
        }
        rpcStartTime = Date.now();

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
            detailsText = 'GAP VN & Music Player';
            stateText = 'Di Menu Utama';
        }

        updateRpcActivity({ details: detailsText, state: stateText });
    });

    rpc.on('disconnected', () => {
        // Hanya handle disconnect jika fitur masih enabled
        if (!isRpcEnabled) {
            console.log('[RPC] Terputus, tapi fitur sudah dinonaktifkan. Skip retry.');
            return;
        }
        console.log('[RPC] Terputus dari Discord. Mencoba menyambung ulang...');
        isRpcReady = false;
        isRpcConnecting = false;
        setupRpcRetry();
    });

    rpc.login({ clientId }).catch(err => {
        isRpcConnecting = false;
        isRpcReady = false;
        
        // Hanya retry jika fitur masih enabled
        if (!isRpcEnabled) {
            console.log('[RPC] Login gagal tapi fitur sudah dinonaktifkan. Skip retry.');
            cleanupRpcInstance();
            return;
        }
        
        console.error('[RPC] Gagal login, akan mencoba lagi.', err.message);
        setupRpcRetry();
    });
}

// Fungsi helper untuk cleanup instance RPC tanpa trigger event
function cleanupRpcInstance() {
    if (rpc) {
        try {
            rpc.removeAllListeners();
            rpc.destroy().catch(() => {});
        } catch (e) { /* ignore */ }
        rpc = null;
    }
    isRpcReady = false;
    isRpcConnecting = false;
}

// Fungsi untuk menangani jadwal koneksi ulang
function setupRpcRetry() {
    // Cek apakah fitur masih enabled sebelum setup retry
    if (!isRpcEnabled) {
        console.log('[RPC] Retry tidak dijadwalkan karena fitur dinonaktifkan.');
        cleanupRpcInstance();
        return;
    }
    
    // Bersihkan instance lama
    cleanupRpcInstance();

    if (!rpcRetryInterval) {
        console.log('[RPC] Menjadwalkan koneksi ulang dalam 15 detik.');
        rpcRetryInterval = setInterval(() => {
            // Cek ulang status sebelum retry
            if (!isRpcEnabled) {
                console.log('[RPC] Fitur dinonaktifkan, membatalkan coba ulang.');
                clearInterval(rpcRetryInterval);
                rpcRetryInterval = null;
                return;
            }
            
            if (!rpc && !isRpcConnecting) {
                console.log('[RPC] Mencoba menyambung ulang...');
                connectRPC();
            }
        }, 15000);
    }
}

// Fungsi untuk menghentikan dan membersihkan RPC
function destroyRPC(isDisablingFeature = true) {
    console.log(`[RPC] destroyRPC dipanggil. isDisablingFeature: ${isDisablingFeature}`);
    
    // Bersihkan retry interval terlebih dahulu
    if (rpcRetryInterval) {
        clearInterval(rpcRetryInterval);
        rpcRetryInterval = null;
        console.log('[RPC] Retry interval dibersihkan.');
    }

    // Bersihkan throttle SET_ACTIVITY (cegah pending send lama menyala setelah re-enable)
    if (pendingRpcTimer) {
        clearTimeout(pendingRpcTimer);
        pendingRpcTimer = null;
    }
    pendingRpcSend = null;
    lastMusicRpcSig = null;
    
    // isRpcEnabled diubah segera jika fitur dinonaktifkan (mencegah retry baru)
    if (isDisablingFeature) {
        isRpcEnabled = false;
    }
    
    // Reset flag koneksi
    isRpcConnecting = false;
    
    if (!rpc) {
        console.log('[RPC] Tidak ada instance RPC untuk dihentikan.');
        isRpcReady = false;
        return;
    }

    // Simpan referensi ke variabel lokal dan segera null-kan global
    const rpcInstance = rpc;
    const wasReady = isRpcReady;
    
    rpc = null;
    isRpcReady = false;

    // Hapus semua listener untuk mencegah event callback setelah destroy
    try {
        rpcInstance.removeAllListeners();
    } catch (e) { /* ignore */ }

    // Bersihkan activity hanya jika sebelumnya ready
    if (wasReady) {
        rpcInstance.clearActivity()
            .then(() => {
                console.log('[RPC] Activity berhasil dihapus dari Discord.');
                return rpcInstance.destroy();
            })
            .then(() => {
                console.log('[RPC] Koneksi RPC berhasil dihentikan.');
            })
            .catch((err) => {
                // Error saat cleanup adalah normal, cukup log tanpa stack trace
                console.log('[RPC] Cleanup selesai (dengan error minor, diabaikan).');
            });
    } else {
        // Langsung destroy jika tidak pernah ready
        rpcInstance.destroy().catch(() => {});
        console.log('[RPC] Instance RPC di-destroy (tidak pernah ready).');
    }
}

// Hanya URL http(s) publik yang valid untuk Discord large_image (di-proxy jadi mp:external/...).
// Tolak data:, blob:, file:, path lokal, dan placeholder gstatic → biar fallback ke 'main_icon'.
function sanitizeRpcLargeImage(value) {
    if (typeof value !== 'string' || !value) return null;
    if (!/^https?:\/\//i.test(value)) return null;          // buang data:/lokal/relatif
    if (value.includes('gstatic.com')) return null;          // placeholder YTM
    // Perbesar thumbnail googleusercontent (mis. =w60-h60-...) jadi kotak besar
    return value.replace(/=w\d+-h\d+[^/]*$/i, '=w512-h512');
}

// Dedup untuk mode musik: hindari spam SET_ACTIVITY (Discord membatasi ~5 update / 20 detik).
// Saat memutar normal, progress bar berjalan sendiri di sisi client; kita hanya perlu update
// ketika lagu/artis/play-pause/gambar berubah atau saat user seek (lompatan waktu).
let lastMusicRpcSig = null;
let lastMusicRpcStart = 0;

// ===== Throttle global SET_ACTIVITY =====
// Discord menolak update yang terlalu sering dengan "code 1000 Unknown Error".
// Sumber utama spam: saat lagu masih loading, webview mengirim judul 'Unknown Title'
// setiap 1 dtk → jalur idle di bawah ikut terkirim tiap detik → kena rate-limit, lalu
// update lagu yang sebenarnya pun ditolak → judul nyangkut di "Idle".
// Solusi: batasi minimal 1 kirim / RPC_MIN_INTERVAL_MS dengan "trailing edge" — payload
// TERBARU selalu dikirim setelah cooldown, jadi begitu judul asli tiba ia tetap ikut terkirim.
const RPC_MIN_INTERVAL_MS = 4000;
let lastRpcSentAt = 0;
let pendingRpcSend = null;     // fungsi kirim TERBARU yang menunggu cooldown
let pendingRpcTimer = null;

function scheduleRpcSend(sendFn) {
    const elapsed = Date.now() - lastRpcSentAt;
    if (elapsed >= RPC_MIN_INTERVAL_MS) {
        lastRpcSentAt = Date.now();
        sendFn();
        return;
    }
    // Masih dalam cooldown → simpan HANYA yang terbaru, kirim di akhir cooldown.
    pendingRpcSend = sendFn;
    if (!pendingRpcTimer) {
        pendingRpcTimer = setTimeout(() => {
            pendingRpcTimer = null;
            const fn = pendingRpcSend;
            pendingRpcSend = null;
            if (fn && rpc && isRpcEnabled && isRpcReady) {
                lastRpcSentAt = Date.now();
                fn();
            }
        }, RPC_MIN_INTERVAL_MS - elapsed);
    }
}

function updateRpcActivity(data) {
    // Cek semua kondisi sebelum update
    if (!rpc || !isRpcEnabled || !isRpcReady) {
        return;
    }

    const {
        details, state, largeImageKey, smallImageKey, smallImageText,
        songTitle, songArtist, album, currentTime, duration, isPlaying
    } = data;

    const cleanLargeImage = sanitizeRpcLargeImage(largeImageKey);

    // Anggap "lagu nyata" hanya jika judul valid (hindari placeholder tampil sebagai lagu)
    const isRealSong = songTitle && songTitle !== 'Loading...' && songTitle !== 'Unknown Title';

    // Update yang berasal dari mode musik SELALU membawa `songTitle` (string), sedangkan
    // idle/menu/VN membawa `details` tanpa `songTitle`. Saat lagu sedang loading/berganti,
    // webview sempat mengirim judul placeholder ('Unknown Title'/'Loading...') tiap detik.
    // Dulu ini memaksa RPC balik ke "Idle" lalu nyangkut di sana. Sekarang: ABAIKAN glitch
    // sesaat itu dan tahan state lagu terakhir. (Perpindahan ke menu/VN tetap mengirim
    // `details` tanpa `songTitle`, jadi pembersihan ke idle yang sah tetap jalan.)
    const isSongUpdate = typeof songTitle === 'string';
    if (isSongUpdate && !isRealSong) {
        return;
    }

    // ===== Mode musik: tampil sebagai "Listening to ..." (type 2) + progress bar, ala =====
    if (isRealSong) {
        // Hitung timestamp progress bar (hanya saat memutar & durasi valid)
        let startMs = 0;
        let hasBar = false;
        if (isPlaying && Number(duration) > 0) {
            startMs = Date.now() - Math.round(Number(currentTime || 0) * 1000);
            hasBar = true;
        }

        // Baris artis + penanda jeda yang jelas
        const artistLine = songArtist ? `oleh ${songArtist}` : 'Artis tidak diketahui';
        const stateLine = isPlaying ? artistLine : `⏸ Dijeda · ${songArtist || 'Artis tidak diketahui'}`;

        // Lewati update berulang yang tidak penting (anti rate-limit).
        const sig = `${songTitle}||${songArtist || ''}||${album || ''}||${isPlaying ? 1 : 0}||${cleanLargeImage || ''}`;
        const startClose = Math.abs(startMs - lastMusicRpcStart) < 2500; // <2.5s = progres normal, bukan seek
        if (sig === lastMusicRpcSig && (!hasBar || startClose)) {
            return;
        }

        const activity = {
            type: 2, // ActivityType.LISTENING → header jadi "Listening to <nama app>"
            details: songTitle,
            state: stateLine,
            assets: {
                large_image: cleanLargeImage || 'main_icon',
                large_text: album || songTitle,  // hover tampilkan album (fallback ke judul)
                small_image: smallImageKey || (isPlaying ? 'play_icon' : 'pause_icon'),
                small_text: smallImageText || (isPlaying ? 'Memutar' : 'Dijeda')
            },
            buttons: [
                { label: 'Cobain aplikasinya?', url: 'https://github.com/Rin-chocomint' }
            ],
            instance: false
        };

        if (hasBar) {
            activity.timestamps = { start: startMs, end: startMs + Math.round(Number(duration) * 1000) };
        }

        // discord-rpc v4 setActivity() tidak mengirim field `type`, jadi pakai request() mentah.
        // PENTING: signature dedup baru di-"commit" SETELAH kirim sukses. Kalau gagal
        // (mis. rate-limit "code 1000"), sig dibiarkan apa adanya supaya update berikutnya
        // dengan lagu yang sama TIDAK ter-dedup → judul tidak nyangkut di "Idle".
        scheduleRpcSend(() => {
            rpc.request('SET_ACTIVITY', { pid: process.pid, activity })
                .then(() => {
                    lastMusicRpcSig = sig;
                    lastMusicRpcStart = startMs;
                })
                .catch(err => {
                    console.error('[RPC] Gagal mengatur aktivitas musik: ', err);
                    if (err.message && err.message.includes('Could not connect')) {
                        setupRpcRetry();
                    }
                });
        });
        return;
    }

    // ===== Mode non-musik (menu utama / VN): tetap "Playing" seperti semula =====
    lastMusicRpcSig = null; // reset agar musik berikutnya pasti dikirim ulang

    // BENTUKNYA DISAMAKAN DENGAN JALUR MUSIK, dan itu bukan kerapian.
    //
    // Gejala yang melahirkan perubahan ini: cover musik (URL http) TAMPIL di
    // Discord, sementara gambar novel dengan URL sejenis tampil sebagai ikon
    // kosong. Keduanya melewati `sanitizeRpcLargeImage()` yang sama dan sama-sama
    // berakhir di `assets.large_image`, jadi bedanya hanya bisa ada di BENTUK
    // activity-nya. Yang berbeda tinggal tiga: `type`, ada/tidaknya `small_image`,
    // dan `timestamps` yang di sini selalu ada.
    //
    // `rpc.setActivity()` sendiri bukan tersangka — di discord-rpc v4 ia hanya
    // memetakan largeImageKey → assets.large_image lalu memanggil request()
    // SET_ACTIVITY yang sama persis. Yang dilakukan di sini adalah menghapus
    // ketiga perbedaan sisanya supaya jalur yang TERBUKTI jalan dan jalur ini
    // benar-benar sebangun, dan `type` ditulis eksplisit (0 = Playing) alih-alih
    // dibiarkan kosong.
    const largeText = `Aplikasi visual novel & pemutar musik — ${stageAplikasi() || 'Alpha'} v${versiAplikasi()}`;
    const activity = {
        type: 0, // Playing
        details: details || 'Idle',
        state: state,
        // Dipaksa jadi angka DI SINI juga, bukan hanya di sumbernya. Kegagalannya
        // total (Discord menolak seluruh activity, status berhenti diperbarui) dan
        // senyap dari sisi pengguna, jadi satu baris penjaga jauh lebih murah
        // daripada mengandalkan setiap pemanggil menaruh tipe yang benar.
        timestamps: { start: Number(rpcStartTime) || Date.now() },
        assets: {
            large_image: cleanLargeImage || 'main_icon',
            large_text: largeText,
            // Discord menolak small_text KOSONG saat small_image ada
            // (menyumbang "code 1000"), jadi keduanya selalu berpasangan.
            small_image: smallImageKey || 'main_icon',
            small_text: smallImageText || 'GAP VN Player'
        },
        buttons: [
            { label: 'Cobain aplikasinya?', url: 'https://github.com/Rin-chocomint' }
        ],
        instance: false
    };

    scheduleRpcSend(() => {
        rpc.request('SET_ACTIVITY', { pid: process.pid, activity })
            .then(() => {
                // Dicatat supaya kegagalan "gambar tidak muncul" bisa dibedakan dari
                // "payload tidak pernah terkirim" tanpa menebak-nebak.
                console.log('[RPC] Aktivitas terkirim. large_image =', activity.assets.large_image);
            })
            .catch(err => {
                console.error('[RPC] Gagal mengatur aktivitas: ', err);
                console.error('[RPC] Payload yang ditolak:', JSON.stringify(activity));
                if (err.message && err.message.includes('Could not connect')) {
                    setupRpcRetry();
                }
            });
    });
}

//-------------------------------------
// main.js (Aplikasi Utama)
//-------------------------------------
const { app, BrowserWindow, BrowserView, ipcMain, session, screen, dialog, globalShortcut } = require('electron');
const {
    createGeometry: createGifOverlayGeometry,
    moveGeometry: moveGifOverlayGeometry,
    resizeGeometry: resizeGifOverlayGeometry,
    hasSizeDrift: hasGifOverlaySizeDrift,
    geometryCenter: getGifOverlayGeometryCenter
} = require('./gif-overlay-geometry');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

// =====================================================================
// [LOGIN-FIX] Dukungan popup login YouTube Music / Google di dalam <webview>
// ---------------------------------------------------------------------
// PELAJARAN PENTING (jangan diulang): JANGAN menyamarkan User-Agent webview.
//   Memanggil contents.setUserAgent('...Chrome...') HANYA mengubah string UA,
//   TANPA mengubah Client Hints (Sec-CH-UA) milik Electron. Akibatnya UA dan
//   Client-Hints jadi TIDAK COCOK, dan justru itu yang membuat Google menolak
//   login: "Browser atau aplikasi ini mungkin tidak aman"
//   (accounts.google.com/v3/signin/rejected).
//   UA DEFAULT Electron bersifat konsisten dan SUDAH diterima Google, jadi
//   biarkan apa adanya. (Percobaan spoof UA pada 2026-06 menyebabkan regresi.)
//
// Yang AMAN & tetap berguna (tidak mengubah alur login satu-halaman yang
// selama ini sudah berhasil):
//   - allowpopups (index.html) + setWindowOpenHandler di bawah: agar alur
//     login yang memakai window.open (popup) tidak diblokir diam-diam.
//   - Event lama webContents.on('new-window') (main.js:5130) sudah DIHAPUS
//     sejak Electron 22 (project ini Electron 33); penggantinya di sini.
// =====================================================================
function gapIsAuthPopupUrl(url) {
    if (!url) return false;
    return /accounts\.google\.com|accounts\.youtube\.com|\/signin|ServiceLogin|gsi\/|o\/oauth2|consent/i.test(url);
}
function gapIsYtMusicUrl(url) {
    return /(^|\/\/)music\.youtube\.com/i.test(url || '');
}

// =====================================================================
// [LOGIN-DEADLINE] Lacak satu percobaan login: klik tombol -> navigasi ->
// halaman login selesai dimuat. Bila ada yang macet, peringatkan user.
// Alur:
//   (renderer) preload mendeteksi klik a.sign-in-link -> kirim ke main via
//   ipc 'webview-login-clicked'. Main lalu memasang dua deadline:
//     1. NAV  : apakah webview MULAI menuju alamat login? (klik tak bereaksi)
//     2. LOAD : setelah mulai, apakah halaman login SELESAI dimuat?
//   Navigasi/popup dipantau dari listener webContents <webview> di bawah.
// =====================================================================
const gapLogin = {
    phase: 'idle',     // idle | clicked | navigating | loaded | failed
    clickAt: 0,
    target: '',
    embedder: null,    // webContents pengirim klik (untuk balas notifikasi)
    navTimer: null,
    loadTimer: null
};
const GAP_NAV_DEADLINE_MS = 6000;    // klik -> webview MULAI menuju login
const GAP_LOAD_DEADLINE_MS = 15000;  // mulai login -> halaman login selesai dimuat

function gapLoginNotify(kind, extra) {
    const payload = Object.assign({ kind }, extra || {});
    console.warn('[Login Deadline] ANOMALI:', JSON.stringify(payload));
    try {
        if (gapLogin.embedder && !gapLogin.embedder.isDestroyed()) {
            gapLogin.embedder.send('login-network-anomaly', payload);
        }
    } catch (e) { /* abaikan */ }
}

function gapLoginClearTimers() {
    clearTimeout(gapLogin.navTimer);
    clearTimeout(gapLogin.loadTimer);
}

// Log ke console main DAN diteruskan ke host (panel di native-player.html /
// index.html) lewat channel 'login-debug-log', supaya user tanpa DevTools
// tetap bisa membaca log diagnosa login.
function gapSendDebug(level, line, contents) {
    if (level === 'warn') console.warn(line); else console.log(line);
    try {
        const host = (contents && contents.hostWebContents) || gapLogin.embedder;
        if (host && !host.isDestroyed()) host.send('login-debug-log', { level, line, time: Date.now() });
    } catch (e) { /* abaikan */ }
}

// Dipanggil saat navigasi/popup menuju halaman auth benar-benar DIMULAI.
function gapLoginOnAuthNavStarted(via) {
    // Hanya relevan bila ada klik login baru-baru ini (<= 12 dtk).
    if (gapLogin.phase !== 'clicked' || (Date.now() - gapLogin.clickAt) > 12000) return;
    gapLogin.phase = 'navigating';
    clearTimeout(gapLogin.navTimer);
    gapSendDebug('info', `[Login Deadline] Webview MULAI menuju halaman login (${via}). Memantau durasi pemuatan...`);
    gapLogin.loadTimer = setTimeout(() => {
        if (gapLogin.phase === 'navigating') {
            gapSendDebug('warn', '[Login Deadline] Halaman login dimulai tapi BELUM selesai dimuat dalam 15 dtk.');
            gapLoginNotify('slow-auth-load', { target: gapLogin.target, suspect: 'network-provider' });
        }
    }, GAP_LOAD_DEADLINE_MS);
}

// Dipanggil saat halaman auth SELESAI dimuat.
function gapLoginOnAuthLoaded(url) {
    if (gapLogin.phase !== 'navigating') return;
    gapLogin.phase = 'loaded';
    clearTimeout(gapLogin.loadTimer);
    gapSendDebug('info', `[Login Deadline] Halaman login SELESAI dimuat: ${url}`);
}

ipcMain.on('webview-login-clicked', (event, data) => {
    gapLoginClearTimers();
    gapLogin.phase = 'clicked';
    gapLogin.clickAt = Date.now();
    gapLogin.target = (data && data.target) || '';
    gapLogin.embedder = event.sender;
    gapSendDebug('info', `[Login Deadline] Tombol Login DITEKAN. Target: ${gapLogin.target || '(tak diketahui)'}`);

    // Deadline 1: apakah webview benar-benar MULAI menuju alamat login?
    gapLogin.navTimer = setTimeout(() => {
        if (gapLogin.phase === 'clicked') {
            gapSendDebug('warn', '[Login Deadline] Klik login TIDAK memicu navigasi/popup apa pun dalam 6 dtk.');
            gapLoginNotify('no-navigation-after-click', { target: gapLogin.target });
            gapLogin.phase = 'idle';
        }
    }, GAP_NAV_DEADLINE_MS);
});

app.on('web-contents-created', (event, contents) => {
    // Hanya tangani konten dari <webview> (guest YT Music), bukan window utama.
    if (contents.getType() !== 'webview') return;

    // CATATAN: SENGAJA tidak memanggil contents.setUserAgent(...) di sini.
    // Biarkan UA default Electron (konsisten dengan Client Hints) agar Google
    // tidak menolak login. Lihat blok pelajaran di atas.

    // --- LOG: ke mana pun webview bernavigasi (sorot saat KELUAR dari YTM) ---
    contents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return;
        const tag = gapIsAuthPopupUrl(url) ? '  [-> LOGIN GOOGLE]'
            : (!gapIsYtMusicUrl(url) && !/^about:/.test(url)) ? '  [KELUAR dari YT Music]' : '';
        gapSendDebug('info', `[Webview Nav] start    -> ${url}${tag}`, contents);
        if (gapIsAuthPopupUrl(url)) gapLoginOnAuthNavStarted('navigasi-halaman');
    });
    contents.on('did-navigate', (e, url) => {
        gapSendDebug('info', `[Webview Nav] navigated-> ${url}`, contents);
    });
    contents.on('did-navigate-in-page', (e, url, isMainFrame) => {
        if (isMainFrame) gapSendDebug('info', `[Webview Nav] in-page  -> ${url}`, contents);
    });
    contents.on('did-stop-loading', () => {
        const u = contents.getURL();
        gapSendDebug('info', `[Webview Nav] stop     @ ${u}`, contents);
        if (gapIsAuthPopupUrl(u)) gapLoginOnAuthLoaded(u);
    });
    contents.on('did-fail-load', (e, code, desc, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        gapSendDebug('warn', `[Webview Nav] FAIL (${code} ${desc}) @ ${validatedURL}`, contents);
        if (gapIsAuthPopupUrl(validatedURL)) {
            gapLoginClearTimers();
            gapLogin.phase = 'failed';
            gapLoginNotify('auth-load-failed', { errorCode: code, errorDesc: desc, url: validatedURL, suspect: 'network-provider' });
        }
    });

    // --- Popup (window.open) dari halaman login agar tidak diblokir senyap ---
    contents.setWindowOpenHandler(({ url }) => {
        if (gapIsAuthPopupUrl(url)) {
            gapSendDebug('info', `[LOGIN-FIX] Mengizinkan popup login Google: ${url}`, contents);
            gapLoginOnAuthNavStarted('popup'); // klik -> popup = aksi navigasi terjadi
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 500,
                    height: 650,
                    autoHideMenuBar: true,
                    webPreferences: { nodeIntegration: false, contextIsolation: true }
                }
            };
        }
        // URL non-login (mis. link "Privacy"/"Terms") -> buka di browser sistem.
        gapSendDebug('info', `[LOGIN-FIX] Membuka URL eksternal dari webview: ${url}`, contents);
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
    });

    // --- Pantau pemuatan jendela POPUP login (load-nya di webContents popup) ---
    contents.on('did-create-window', (win, details) => {
        const startUrl = (details && details.url) || (win.webContents && win.webContents.getURL()) || '';
        gapSendDebug('info', `[Webview Nav] popup window dibuat -> ${startUrl}`, contents);
        const wc = win.webContents;
        wc.on('did-stop-loading', () => {
            const u = wc.getURL();
            gapSendDebug('info', `[Webview Nav] (popup) stop @ ${u}`, contents);
            if (gapIsAuthPopupUrl(u)) gapLoginOnAuthLoaded(u);
        });
        wc.on('did-fail-load', (e, code, desc, validatedURL, isMainFrame) => {
            if (!isMainFrame) return;
            gapSendDebug('warn', `[Webview Nav] (popup) FAIL (${code} ${desc}) @ ${validatedURL}`, contents);
            if (gapIsAuthPopupUrl(validatedURL)) {
                gapLoginClearTimers();
                gapLogin.phase = 'failed';
                gapLoginNotify('auth-load-failed', { errorCode: code, errorDesc: desc, url: validatedURL, suspect: 'network-provider' });
            }
        });
    });
});

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

// Inisialisasi VN Engine modular (Rin.js)
const vnEngine = require('./vn-engine');
const updater = require('./vn-engine/updater');
const { normalizeScript, validateNovelMeta } = require('./vn-engine/schema-validator');
// Init dilakukan setelah versionsManifest dimuat (baris bawah)
// Lihat: vnEngine.initVNEngine() call di bawah

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

// ======================== Teks berversi — SATU sumber ========================
// Judul jendela, footer, dan status Discord dulu menuliskan nomornya sendiri
// secara hardcode, sehingga tidak pernah ikut berubah: build baru hasil
// pembaruan masih memperkenalkan diri dengan nomor rilis lama — termasuk di
// status Discord yang dilihat orang lain. Ketiganya kini membaca versions.json
// lewat sini, jadi cukup satu tempat yang perlu benar.
// Aman dipanggil dari mana pun di bawah baris ini: manifest sudah dimuat di atas.
function versiAplikasi() {
    const a = (versionsManifest && versionsManifest.app) || {};
    const versi = String(a.version || '?');
    const build = Number(a.build);
    // Versi yang sudah membawa penanda (mis. -nightly.11) memuat penghitungnya
    // sendiri; menempelkan build lagi hanya menggandakan angka yang sama.
    return versi + (build > 0 && !versi.includes('-') ? '-' + build : '');
}

function stageAplikasi() {
    const s = String((versionsManifest && versionsManifest.app && versionsManifest.app.stage) || '').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Judul jendela dipasang SESUDAH halaman dimuat, karena <title> di HTML akan
// menimpanya kalau disetel lebih awal. Bukan `once`: reload harus dapat judul
// yang sama.
function pasangJudulVersi(win) {
    if (!win || win.isDestroyed()) return;
    const terap = () => {
        if (win.isDestroyed()) return;
        const stage = stageAplikasi();
        win.setTitle(`Gap vn & music Player | v${versiAplikasi()}${stage ? ' ' + stage : ''}`);
    };
    win.webContents.on('did-finish-load', terap);
    terap();
}

// Inisialisasi sistem update (Tier-1 per-file dari GitHub).
// IPC handler didaftarkan sekali; pengecekan dipicu saat boot native/gif
// atau manual dari Settings (game mode).
try {
    updater.initUpdater({
        app,
        ipcMain,
        BrowserWindow,
        dialog,
        shell: require('electron').shell,
        appDir: __dirname,
        getMainWindow: () => mainWindow,
        localManifest: versionsManifest || {}
    });
} catch (e) {
    console.error('[Updater] Gagal inisialisasi modul updater:', e.message);
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

// ============ Novel Content Security Scanner (dipindah ke vn-engine/security-scanner.js) ============ //

// Handler IPC untuk mengecek integritas core files
ipcMain.handle('integrity:check-core', async () => {
    return checkCoreIntegrity();
});

// Handler IPC untuk mendapatkan info versi
ipcMain.handle('integrity:get-versions', async () => {
    return versionsManifest;
});

// ======================== Akhir Integrity Check & Novel Security Module ======================== //

// Inisialisasi VN Engine — registrasi semua IPC handler
// mainWindow diakses via getter saat runtime, jadi aman dipanggil sebelum window dibuat
vnEngine.initVNEngine({
    getMainWindow: () => mainWindow,
    ipcMain,
    visualNovelsDirectory,
    appDir: __dirname,
    updateRpcActivity,
    versionsManifest,
    // UX-B07: diagnostics tingkat-proses butuh `app` — userData untuk laporan
    // lintas sesi, dan web-contents-created supaya webview preview ikut terpantau.
    app
});

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

let rhythmOverlayWindow = null; // Jendela overlay gamifikasi rhythm
let isRhythmOverlayEnabled = false;
let lastRhythmTrackTitle = null; // Untuk deteksi ganti lagu
let runtimeRhythmHideNowPlaying = false;

let hubCodeEditorWindow = null; // Window terpisah untuk Hub Code Editor (Advanced)

// currentStoryTitle & currentChapter sekarang dikelola oleh vn-engine/core.js

const MUSIC_PLAYBACK_SPEED_VALUES = new Set(['0.75', '1.0', '1.25', '1.5', 'nightcore']);

function sanitizeMusicPlaybackSpeed(value) {
    const normalized = String(value ?? '1.0');
    return MUSIC_PLAYBACK_SPEED_VALUES.has(normalized) ? normalized : '1.0';
}

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
    dynamicThemeMode: 'default-optimized',
    playbackSpeed: '1.0',
    guiTheme: 'default',
    miniPlayerHideOnCursor: false,
    rhythmOverlayEnabled: false,  // Overlay gamifikasi rhythm (kombo & score)
    rhythmHideNowPlaying: false,  // Sembunyikan panel Now Playing di overlay rhythm
    // === GIF Overlay Settings ===
    gifOverlayEnabled: false,
    gifOverlayLocked: false,
    gifOverlays: [],              // Array: [{id, path, settings, bounds}]
    gifOverlayPresets: [],        // Array: [{presetId, name, createdAt, overlays}]
    activePresetId: null,         // ID preset yang sedang aktif
    // Override fitur khusus per judul + artis. Berbeda dari pengaturan global.
    musicProfiles: {}
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

function writeJsonFileSafely(filePath, value) {
    const tmpPath = `${filePath}.tmp`;
    const backupPath = `${filePath}.bak`;
    fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');

    try {
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        if (fs.existsSync(filePath)) fs.renameSync(filePath, backupPath);
        fs.renameSync(tmpPath, filePath);
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
    } catch (error) {
        // Pertahankan versi terakhir yang valid jika penggantian file gagal.
        try {
            if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) {
                fs.renameSync(backupPath, filePath);
            }
        } catch (restoreError) {
            console.error('[Main] Gagal memulihkan file settings cadangan:', restoreError);
        }
        try {
            if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch (_) { }
        throw error;
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
    userSettings.rhythmOverlayEnabled = toBool(userSettings.rhythmOverlayEnabled, defaultUserSettings.rhythmOverlayEnabled);
    userSettings.rhythmHideNowPlaying = toBool(userSettings.rhythmHideNowPlaying, defaultUserSettings.rhythmHideNowPlaying);

    if (typeof userSettings.dynamicThemeMode !== 'string') userSettings.dynamicThemeMode = defaultUserSettings.dynamicThemeMode;
    if (userSettings.dynamicThemeMode === 'default' || userSettings.dynamicThemeMode === 'unified') {
        userSettings.dynamicThemeMode = 'default-optimized';
    }
    if (!userSettings.musicProfiles || typeof userSettings.musicProfiles !== 'object' || Array.isArray(userSettings.musicProfiles)) {
        userSettings.musicProfiles = {};
    }
    userSettings.playbackSpeed = sanitizeMusicPlaybackSpeed(userSettings.playbackSpeed);
    if (typeof userSettings.webgpuVisualizerStyle !== 'string') userSettings.webgpuVisualizerStyle = String(userSettings.webgpuVisualizerStyle ?? defaultUserSettings.webgpuVisualizerStyle);
}

function saveUserDataToDisk(dataPayload) {
    const filePath = getUserDataFilePath();
    if (!filePath) return false;
    try {
        writeJsonFileSafely(filePath, dataPayload);
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
    if (!filePath) return false;

    try {
        normalizeUserSettings();

        // Pisahkan data (GIF) dan settings (Preferensi)
        const { settingsPayload, dataPayload } = splitSettingsAndData(userSettings);

        // Simpan Data (Selalu simpan data agar tidak hilang)
        if (!saveUserDataToDisk(dataPayload)) {
            throw new Error('User data GIF tidak berhasil ditulis ke disk.');
        }

        // Simpan Settings
        writeJsonFileSafely(filePath, {
            ...settingsPayload,
            _meta: {
                savedAt: new Date().toISOString()
            }
        });
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

function flushUserSettingsToDisk() {
    if (saveUserSettingsTimer) {
        clearTimeout(saveUserSettingsTimer);
        saveUserSettingsTimer = null;
    }
    return saveUserSettingsToDisk() === true;
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

    if (!Array.isArray(userSettings.gifOverlays)) userSettings.gifOverlays = [];
    if (!Array.isArray(userSettings.gifOverlayPresets)) userSettings.gifOverlayPresets = [];

    // activePresetId menunjuk dokumen yang aktif, tetapi snapshot global bisa
    // tertinggal pada versi lama. Pulihkan dari preset tanpa pernah menghapus
    // workspace hanya karena ID preset null/stale.
    if (userSettings.activePresetId) {
        const activePreset = userSettings.gifOverlayPresets.find(
            preset => preset.presetId === userSettings.activePresetId
        );
        if (!activePreset) {
            console.warn(`[GIF Settings] Preset aktif ${userSettings.activePresetId} tidak ditemukan; workspace tetap dipertahankan.`);
            userSettings.activePresetId = null;
            migrationNeeded = true;
        } else if (userSettings.gifOverlays.length === 0 && Array.isArray(activePreset.overlays) && activePreset.overlays.length > 0) {
            userSettings.gifOverlays = cloneGifOverlayList(activePreset.overlays);
            dataObj.gifOverlays = cloneGifOverlayList(activePreset.overlays);
            migrationNeeded = true;
            console.log(`[GIF Settings] Snapshot workspace dipulihkan dari preset aktif (${activePreset.overlays.length} overlay).`);
        }
    }

    if (migrationNeeded) {
        console.log('[Main] Migrasi data (GIF Profiles) dari settings ke user-data.json dilakukan.');
        const { dataPayload } = splitSettingsAndData(userSettings);
        saveUserDataToDisk(dataPayload);
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

    // Nilai global yang ikut diprofilkan perlu langsung dihitung ulang. Jika lagu
    // aktif punya profil, profil tetap menang tanpa mengubah nilai global ini.
    const profileAwareSettingChanged = [
        'gifOverlayEnabled',
        'rhythmOverlayEnabled',
        'rhythmHideNowPlaying',
        'dynamicThemeEnabled',
        'dynamicThemeMode',
        'playbackSpeed'
    ].some((key) => Object.prototype.hasOwnProperty.call(data || {}, key));
    if (profileAwareSettingChanged) applyMusicProfileForCurrentTrack({ force: true });

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

// =================== Game Editor - Persistensi Data Pengguna ================== //
// Data Game Editor adalah data milik pengguna, bukan aset aplikasi. Menaruhnya di
// __dirname/aset/character membuat data mudah hilang saat folder instalasi diganti
// dan dapat gagal ditulis bila aplikasi dipasang pada lokasi yang terlindungi.
const GAME_EDITOR_STATE_SCHEMA_VERSION = 1;
const GAME_EDITOR_DIRECTORY_NAME = 'game-editor';
const GAME_EDITOR_STATE_FILE_NAME = 'state.json';
const GAME_EDITOR_MEDIA_DIRECTORY_NAME = 'media';
const legacyCharacterDirectory = path.join(__dirname, 'aset', 'character');

function getGameEditorDirectory() {
    return path.join(app.getPath('userData'), GAME_EDITOR_DIRECTORY_NAME);
}

function getGameEditorStateFilePath() {
    return path.join(getGameEditorDirectory(), GAME_EDITOR_STATE_FILE_NAME);
}

function getGameEditorMediaDirectory() {
    return path.join(getGameEditorDirectory(), GAME_EDITOR_MEDIA_DIRECTORY_NAME);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeGameEditorState(value) {
    if (!isPlainObject(value)) {
        throw new Error('Format state Game Editor tidak valid.');
    }

    const state = { schemaVersion: GAME_EDITOR_STATE_SCHEMA_VERSION };

    if (Object.prototype.hasOwnProperty.call(value, 'content')) {
        if (!isPlainObject(value.content)) throw new Error('Konten Game Editor tidak valid.');
        state.content = value.content;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'characters')) {
        if (!Array.isArray(value.characters)) throw new Error('Data karakter tidak valid.');
        state.characters = value.characters;
    }
    if (Object.prototype.hasOwnProperty.call(value, 'rotatingTexts')) {
        if (!Array.isArray(value.rotatingTexts)) throw new Error('Rotating text tidak valid.');
        state.rotatingTexts = value.rotatingTexts.map(text => String(text));
    }
    if (Object.prototype.hasOwnProperty.call(value, 'profileCustomCss')) {
        if (typeof value.profileCustomCss !== 'string') throw new Error('CSS profil tidak valid.');
        state.profileCustomCss = value.profileCustomCss;
    }

    return state;
}

function readGameEditorStateFromDisk() {
    const statePath = getGameEditorStateFilePath();
    if (!fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return normalizeGameEditorState(parsed);
}

function writeGameEditorStateToDisk(state) {
    const normalizedState = normalizeGameEditorState(state);
    fs.mkdirSync(getGameEditorDirectory(), { recursive: true });
    writeJsonFileSafely(getGameEditorStateFilePath(), normalizedState);
    return normalizedState;
}

function readLegacyCharacterData() {
    try {
        const legacyPath = path.join(legacyCharacterDirectory, 'custom_character_data.json');
        if (!fs.existsSync(legacyPath)) return null;
        const parsed = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        console.warn('[GameEditor] Gagal membaca data karakter lama:', error.message);
        return null;
    }
}

function isPathInside(parentDirectory, candidatePath) {
    const relative = path.relative(parentDirectory, candidatePath);
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

function saveGameEditorMedia({ fileName, dataUrl }) {
    if (typeof dataUrl !== 'string') throw new Error('Data media tidak valid.');
    const matches = dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!matches) throw new Error('Format data media tidak valid.');

    const safeOriginalName = path.basename(String(fileName || 'media')).replace(/[^a-zA-Z0-9_\-.]/g, '_');
    const extension = path.extname(safeOriginalName).slice(0, 12);
    const uniqueName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`;
    const mediaDirectory = getGameEditorMediaDirectory();
    const mediaPath = path.join(mediaDirectory, uniqueName);

    fs.mkdirSync(mediaDirectory, { recursive: true });
    fs.writeFileSync(mediaPath, Buffer.from(matches[2], 'base64'));
    return pathToFileURL(mediaPath).href;
}

function deleteGameEditorMedia(mediaSrc) {
    if (typeof mediaSrc !== 'string' || !mediaSrc.startsWith('file:')) {
        return { success: true, skipped: true };
    }

    const mediaPath = fileURLToPath(mediaSrc);
    const mediaDirectory = getGameEditorMediaDirectory();
    if (!isPathInside(mediaDirectory, mediaPath)) {
        return { success: true, skipped: true };
    }
    if (!fs.existsSync(mediaPath)) return { success: true, skipped: true };

    fs.unlinkSync(mediaPath);
    return { success: true, deleted: true };
}

ipcMain.handle('game-editor:load-state', async () => {
    try {
        const state = readGameEditorStateFromDisk();
        if (state) return { success: true, exists: true, state };

        // Hanya data lama yang dibaca di proses utama. localStorage lama dimigrasikan
        // oleh renderer karena Electron main process memang tidak dapat membacanya.
        return {
            success: true,
            exists: false,
            legacyCharacters: readLegacyCharacterData()
        };
    } catch (error) {
        console.error('[GameEditor] Gagal memuat state:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('game-editor:save-state', async (event, state) => {
    try {
        writeGameEditorStateToDisk(state);
        return { success: true };
    } catch (error) {
        console.error('[GameEditor] Gagal menyimpan state:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('game-editor:save-media', async (event, payload) => {
    try {
        return { success: true, path: saveGameEditorMedia(payload || {}) };
    } catch (error) {
        console.error('[GameEditor] Gagal menyimpan media:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('game-editor:delete-media', async (event, { mediaSrc } = {}) => {
    try {
        return deleteGameEditorMedia(mediaSrc);
    } catch (error) {
        console.error('[GameEditor] Gagal menghapus media:', error);
        return { success: false, error: error.message };
    }
});

// Kanal lama dipertahankan agar rilis yang kembali ke versi sebelumnya masih
// dapat membaca/simpan data pengguna, tetapi semua data baru tetap masuk userData.
ipcMain.handle('character-editor:save-media', async (event, payload) => {
    try {
        return { success: true, path: saveGameEditorMedia(payload || {}) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('character-editor:load-data', async () => {
    try {
        const state = readGameEditorStateFromDisk();
        if (state && Array.isArray(state.characters)) return { success: true, data: state.characters };
        const legacyCharacters = readLegacyCharacterData();
        return legacyCharacters ? { success: true, data: legacyCharacters } : { success: false, error: 'File not found' };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('character-editor:delete-media', async (event, { filePath } = {}) => {
    try {
        return deleteGameEditorMedia(filePath);
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('character-editor:save-data', async (event, characterData) => {
    try {
        if (!Array.isArray(characterData)) throw new Error('Data karakter tidak valid.');
        const state = readGameEditorStateFromDisk() || { schemaVersion: GAME_EDITOR_STATE_SCHEMA_VERSION };
        state.characters = characterData;
        writeGameEditorStateToDisk(state);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
// =================== End Game Editor ================== //

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
const gifOverlayGeometry = new Map();

function cloneGifOverlayList(overlays) {
    if (!Array.isArray(overlays)) return [];
    return JSON.parse(JSON.stringify(overlays));
}

function registerGifOverlayGeometry(id, bounds) {
    const geometry = createGifOverlayGeometry(bounds, { x: 0, y: 0, width: 200, height: 200 });
    gifOverlayGeometry.set(id, geometry);
    return geometry;
}

function getGifOverlayGeometry(id, win) {
    const existing = gifOverlayGeometry.get(id);
    if (existing) return existing;

    const nativeBounds = win && !win.isDestroyed()
        ? win.getBounds()
        : { x: 0, y: 0, width: 200, height: 200 };
    return registerGifOverlayGeometry(id, nativeBounds);
}

function getGifOverlayBoundsSnapshot(id, win) {
    return { ...getGifOverlayGeometry(id, win) };
}

function logGifOverlaySizeDrift(id, nativeBounds, geometry, source) {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed()) return;
    const now = Date.now();
    if (now - (win.gifLastSizeDriftLogAt || 0) < 2000) return;
    win.gifLastSizeDriftLogAt = now;
    console.warn(
        `[GIF Geometry] Size drift #${id} saat ${source}: native=${nativeBounds.width}x${nativeBounds.height}, `
        + `canonical=${geometry.width}x${geometry.height}. Ukuran kanonik dipulihkan.`
    );
}

function moveGifOverlayWindow(id, win, x, y, source = 'move') {
    if (!win || win.isDestroyed()) return null;

    const next = moveGifOverlayGeometry(getGifOverlayGeometry(id, win), x, y);
    gifOverlayGeometry.set(id, next);

    // Beberapa kombinasi transparent-window + mixed DPI dapat mengubah ukuran
    // native saat window berpindah monitor. Ukuran native hanya diperiksa sebagai
    // invariant; ia tidak pernah diadopsi sebagai ukuran frame berikutnya.
    const nativeBounds = win.getBounds();
    if (hasGifOverlaySizeDrift(nativeBounds, next)) {
        logGifOverlaySizeDrift(id, nativeBounds, next, source);
        win.setBounds(next);
    } else {
        win.setPosition(next.x, next.y);
    }
    return next;
}

function resizeGifOverlayWindow(id, win, bounds, source = 'resize') {
    if (!win || win.isDestroyed()) return null;
    const next = resizeGifOverlayGeometry(getGifOverlayGeometry(id, win), bounds);
    gifOverlayGeometry.set(id, next);
    win.setBounds(next);
    if (DEBUG_GIF) console.log(`[GIF Geometry] Resize #${id} via ${source}: ${next.width}x${next.height}`);
    return next;
}

function enforceGifOverlayCanonicalSize(id, win, source = 'native-resize') {
    if (!win || win.isDestroyed() || win.gifGeometryCorrectionInProgress) return;
    const geometry = getGifOverlayGeometry(id, win);
    const nativeBounds = win.getBounds();
    if (!hasGifOverlaySizeDrift(nativeBounds, geometry)) return;

    logGifOverlaySizeDrift(id, nativeBounds, geometry, source);
    win.gifGeometryCorrectionInProgress = true;
    try {
        win.setBounds(geometry);
    } finally {
        setTimeout(() => {
            if (!win.isDestroyed()) win.gifGeometryCorrectionInProgress = false;
        }, 0);
    }
}

function captureGifOverlayWindows() {
    const overlays = [];
    gifOverlayWindows.forEach((win, id) => {
        if (!win.isDestroyed() && win.currentPath) {
            const bounds = getGifOverlayBoundsSnapshot(id, win);
            overlays.push({
                id,
                path: win.currentPath,
                sourcePath: win.sourcePath || win.currentPath,
                mediaType: win.mediaType || inferMediaTypeMain(win.currentPath),
                layer: win.gifLayer || 0,
                hidden: win.gifHidden === true,
                settings: win.gifSettings || { condition: 'always', value: '', opacity: 1, rotation: 0, hideOnCursor: false },
                bounds
            });
        }
    });
    return overlays;
}

function syncActiveGifPreset(overlays) {
    if (!userSettings.activePresetId || !Array.isArray(userSettings.gifOverlayPresets)) return;
    const activeIdx = userSettings.gifOverlayPresets.findIndex(p => p.presetId === userSettings.activePresetId);
    if (activeIdx === -1) return;

    userSettings.gifOverlayPresets[activeIdx].overlays = cloneGifOverlayList(overlays);
    userSettings.gifOverlayPresets[activeIdx].updatedAt = Date.now();
    if (DEBUG_GIF) {
        console.log(`[GIF] Active preset synced: ${userSettings.activePresetId} (${overlays.length} items)`);
    }
}

// Helper: Sync Memory - menyimpan state overlay ke userSettings
function updateGifOverlaysInMemory({ preserveWhenNoWindows = false, syncActivePreset = true } = {}) {
    const overlays = captureGifOverlayWindows();
    if (preserveWhenNoWindows && overlays.length === 0) {
        return cloneGifOverlayList(userSettings.gifOverlays);
    }

    // Update global overlays (untuk restore boot)
    userSettings.gifOverlays = overlays;
    if (syncActivePreset) syncActiveGifPreset(overlays);
    return overlays;
}

let isGifOverlayEnabled = false;
let isGifOverlayLocked = false;

// State musik terakhir untuk kondisional GIF
let lastMusicState = {
    isPlaying: false,
    title: '',
    artist: '',
    coverSrc: ''
};

// State iklan terakhir untuk kondisional GIF (none, waiting, skippable)
let lastAdState = 'none';
let lastRhythmBreakState = false;
let lastRhythmSubtitle = '';

let lastAppliedMusicProfileFingerprint = '';

function normalizeMusicProfilePart(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase();
}

function getMusicProfileTrack(track = lastMusicState) {
    const title = String(track?.title || '').trim();
    const artist = String(track?.artist || '').trim();
    const normalizedTitle = normalizeMusicProfilePart(title);
    const ignoredTitles = new Set(['', 'loading...', 'no music', 'online music']);
    const key = ignoredTitles.has(normalizedTitle)
        ? ''
        : `${normalizedTitle}::${normalizeMusicProfilePart(artist)}`;
    const coverSrc = String(track?.coverSrc || track?.thumbnail || '').trim();
    return { key, title, artist, coverSrc, isPlaying: track?.isPlaying === true };
}

function sanitizeMusicProfileOverrides(raw = {}) {
    const mode = raw.dynamicThemeMode === 'unified' || raw.dynamicThemeMode === 'default'
        ? 'default-optimized'
        : raw.dynamicThemeMode;
    return {
        gifOverlayEnabled: raw.gifOverlayEnabled === true,
        rhythmOverlayEnabled: raw.rhythmOverlayEnabled === true,
        rhythmHideNowPlaying: raw.rhythmHideNowPlaying === true,
        dynamicThemeEnabled: raw.dynamicThemeEnabled === true,
        dynamicThemeMode: typeof mode === 'string' && mode ? mode : 'default-optimized',
        playbackSpeed: sanitizeMusicPlaybackSpeed(raw.playbackSpeed)
    };
}

function getMusicProfileState(track = lastMusicState) {
    const normalizedTrack = getMusicProfileTrack(track);
    const profile = normalizedTrack.key ? userSettings.musicProfiles?.[normalizedTrack.key] : null;
    const overrides = profile?.overrides || {};
    const effective = {
        gifOverlayEnabled: overrides.gifOverlayEnabled ?? (userSettings.gifOverlayEnabled === true),
        rhythmOverlayEnabled: overrides.rhythmOverlayEnabled ?? (userSettings.rhythmOverlayEnabled === true),
        rhythmHideNowPlaying: overrides.rhythmHideNowPlaying ?? (userSettings.rhythmHideNowPlaying === true),
        dynamicThemeEnabled: overrides.dynamicThemeEnabled ?? (userSettings.dynamicThemeEnabled === true),
        dynamicThemeMode: overrides.dynamicThemeMode ?? userSettings.dynamicThemeMode ?? 'default-optimized',
        playbackSpeed: overrides.playbackSpeed ?? userSettings.playbackSpeed ?? '1.0'
    };

    return {
        track: normalizedTrack,
        profile: profile ? { ...profile, overrides: { ...profile.overrides } } : null,
        effective
    };
}

function broadcastMusicProfileState(state = getMusicProfileState()) {
    BrowserWindow.getAllWindows().forEach((win) => {
        try {
            if (!win.isDestroyed()) {
                win.webContents.send('music-profile-state', state);
                win.webContents.send('music-profile-effective-settings', state.effective);
            }
        } catch (_) { }
    });
}

function applyMusicProfileForCurrentTrack({ force = false } = {}) {
    const state = getMusicProfileState();
    const fingerprint = JSON.stringify({
        key: state.track.key,
        isPlaying: state.track.isPlaying,
        effective: state.effective
    });
    if (!force && fingerprint === lastAppliedMusicProfileFingerprint) return state;

    lastAppliedMusicProfileFingerprint = fingerprint;
    setGifOverlayRuntime(state.effective.gifOverlayEnabled === true);
    setRhythmOverlayRuntime(state.effective.rhythmOverlayEnabled === true);
    setRhythmHideNowPlayingRuntime(state.effective.rhythmHideNowPlaying === true);
    broadcastMusicProfileState(state);
    return state;
}

ipcMain.handle('music-profile-get-current', () => getMusicProfileState());

ipcMain.handle('music-profile-list', () => Object.values(userSettings.musicProfiles || {})
    .filter((profile) => profile && typeof profile === 'object' && profile.key)
    .map((profile) => ({
        key: profile.key,
        title: String(profile.title || ''),
        artist: String(profile.artist || ''),
        coverSrc: String(profile.coverSrc || ''),
        overrides: { ...(profile.overrides || {}) },
        updatedAt: Number(profile.updatedAt) || 0
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt));

ipcMain.handle('music-profile-save', (_event, payload = {}) => {
    const requestedTrack = getMusicProfileTrack(payload.track);
    const activeTrack = getMusicProfileTrack(lastMusicState);
    if (!activeTrack.key || !activeTrack.isPlaying) {
        return { success: false, error: 'Putar musik yang memiliki judul terlebih dahulu.' };
    }
    if (!requestedTrack.key) return { success: false, error: 'Profil lagu tidak valid.' };
    if (activeTrack.key && requestedTrack.key !== activeTrack.key) {
        return { success: false, error: 'Lagu aktif sudah berubah. Buka lagi profil untuk lagu yang sedang diputar.' };
    }

    userSettings.musicProfiles[requestedTrack.key] = {
        key: requestedTrack.key,
        title: requestedTrack.title,
        artist: requestedTrack.artist,
        // Simpan referensi/alamat cover saja; tidak pernah menyalin data gambar ke settings.
        coverSrc: activeTrack.coverSrc || requestedTrack.coverSrc || '',
        overrides: sanitizeMusicProfileOverrides(payload.overrides),
        updatedAt: Date.now()
    };
    scheduleSaveUserSettings();
    const state = applyMusicProfileForCurrentTrack({ force: true });
    return { success: true, state };
});

ipcMain.handle('music-profile-delete', (_event, payload = {}) => {
    const requestedTrack = getMusicProfileTrack(payload.track);
    if (!requestedTrack.key || !userSettings.musicProfiles?.[requestedTrack.key]) {
        return { success: false, error: 'Profil lagu tidak ditemukan.' };
    }
    delete userSettings.musicProfiles[requestedTrack.key];
    scheduleSaveUserSettings();
    const state = applyMusicProfileForCurrentTrack({ force: true });
    return { success: true, state };
});

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
    // Resize manual dan animasi sama-sama menulis bounds window. Jangan biarkan
    // keduanya berjalan bersamaan, karena hasilnya dapat membuat ukuran/posisi
    // saling menimpa pada perangkat tertentu.
    if (!win || win.isDestroyed() || animState.paused || activeResizeOverlayId === id || activeDragOverlayId === id) return;

    try {
        // Posisi dan ukuran animasi selalu berasal dari geometri kanonik. Native
        // bounds hanya boleh menjadi target output, bukan input untuk frame baru.
        const bounds = getGifOverlayBoundsSnapshot(id, win);
        const display = screen.getDisplayNearestPoint(getGifOverlayGeometryCenter(bounds));
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

            moveGifOverlayWindow(id, win, newX, newY, 'animation:dvd');

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

            moveGifOverlayWindow(id, win, newX, newY, 'animation:linear');

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

            moveGifOverlayWindow(id, win, newX, newY, 'animation:circular');

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

            moveGifOverlayWindow(id, win, newX, newY, 'animation:random');

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

            moveGifOverlayWindow(id, win, newX, newY, `animation:${animState.type}`);

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

            moveGifOverlayWindow(id, win, newX, newY, `animation:${animState.type}`);
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

function resetGifAnimationAnchor(id) {
    const animState = gifAnimations.get(id);
    const win = gifOverlayWindows.get(id);
    if (!animState || !win || win.isDestroyed()) return;
    const bounds = getGifOverlayBoundsSnapshot(id, win);

    if (animState.type === 'circular') {
        animState.centerX = bounds.x + bounds.width / 2;
        animState.centerY = bounds.y + bounds.height / 2;
        animState.angle = 0;
    } else if (animState.type === 'patrol-wave') {
        animState.baseY = bounds.y;
        animState.waveAngle = 0;
    } else if (animState.type === 'patrol-wave-vertical') {
        animState.baseX = bounds.x;
        animState.waveAngle = 0;
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

                moveGifOverlayWindow(id, win, finalX, finalY, 'legacy-animation');

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

// Helper: deteksi tipe media dari ekstensi file (sisi main process)
function inferMediaTypeMain(filePath = '') {
    const ext = (filePath || '').split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'webp', 'apng'].includes(ext)) return 'image';
    return 'gif';
}

function createGifOverlayWindow(initialPath = null, forcedId = null, initialSettings = null, initialBounds = null, initialExtra = {}) {
    const id = forcedId || nextOverlayId++;
    if (forcedId && forcedId >= nextOverlayId) nextOverlayId = forcedId + 1;

    // Default bounds jika tidak ada
    const defaultWidth = 200;
    const defaultHeight = 200;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;

    const requestedBounds = initialBounds || {
        x: Math.floor(workArea.x + (workArea.width - defaultWidth) / 2),
        y: Math.floor(workArea.y + (workArea.height - defaultHeight) / 2),
        width: defaultWidth,
        height: defaultHeight
    };
    const bounds = registerGifOverlayGeometry(id, requestedBounds);

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
    // Metadata media studio (sourcePath/mediaType/layer/hidden)
    win.sourcePath = initialExtra.sourcePath || initialPath;
    win.mediaType = initialExtra.mediaType || initialSettings?.mediaType || inferMediaTypeMain(win.sourcePath);
    win.gifLayer = (initialExtra.layer != null) ? initialExtra.layer : (initialSettings?.layer ?? 0);
    win.gifHidden = initialExtra.hidden === true || initialSettings?.hidden === true;

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
            sourcePath: win.sourcePath,
            mediaType: win.mediaType,
            settings: win.gifSettings,
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

        // Terapkan efek media (crop/chroma/sprite/object-fit/audio)
        win.webContents.send('set-media-effects', win.gifSettings);
    });

    // Event `moved` juga dipancarkan oleh animasi. Hanya adopsi x/y bila posisi
    // native benar-benar berbeda dari target kanonik; width/height tidak pernah
    // diambil dari event ini.
    win.on('moved', () => {
        if (win.isDestroyed() || gifOverlayWindows.get(id) !== win) return;
        const nativeBounds = win.getBounds();
        const geometry = getGifOverlayGeometry(id, win);
        enforceGifOverlayCanonicalSize(id, win, 'moved-event');
        if (nativeBounds.x === geometry.x && nativeBounds.y === geometry.y) return;

        gifOverlayGeometry.set(id, moveGifOverlayGeometry(geometry, nativeBounds.x, nativeBounds.y));
        pauseGifAnimation(id, 2000);
        resetGifAnimationAnchor(id);
        updateGifOverlaysInMemory();
        scheduleSaveUserSettings();
    });

    // Watchdog untuk perangkat yang mengubah ukuran native saat window hanya
    // dipindahkan (umumnya saat melintasi monitor dengan scale factor berbeda).
    win.on('resize', () => {
        if (gifOverlayWindows.get(id) === win) enforceGifOverlayCanonicalSize(id, win, 'resize-event');
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
            gifOverlayGeometry.delete(id);
        } else {
            // Window ini sudah digantikan dengan window baru, skip delete
            console.log(`[Main] GIF Overlay #${id} ditutup (old window, skipped tracking cleanup).`);
        }
    });

    gifOverlayWindows.set(id, win);

    // Jika enabled secara global, tampilkan (kecuali layer disembunyikan manual)
    if (isGifOverlayEnabled && !win.gifHidden) {
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
        gifOverlayGeometry.delete(id);
        console.log(`[Main] GIF Overlay #${id} ditutup.`);
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
// Mendukung 2 format: string path (lama) atau object { path, sourcePath, mediaType, settings } (studio)
ipcMain.handle('create-new-gif-overlay', async (event, payload) => {
    if (typeof payload === 'string' || payload == null) {
        return createGifOverlayWindow(payload);
    }
    const { path: mediaPath, sourcePath, mediaType, settings } = payload;
    const id = createGifOverlayWindow(mediaPath, null, settings || null, null, {
        sourcePath: sourcePath || mediaPath,
        mediaType: mediaType || inferMediaTypeMain(sourcePath || mediaPath),
        layer: settings?.layer,
        hidden: settings?.hidden
    });
    updateGifOverlaysInMemory();
    scheduleSaveUserSettings();
    return id;
});

// Handler: Set Gambar pada Overlay Spesifik
ipcMain.on('set-gif-overlay-image-by-id', (event, { id, path: mediaPath, sourcePath, mediaType }) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.currentPath = mediaPath; // Update path in window obj
        win.sourcePath = sourcePath || mediaPath;
        win.mediaType = mediaType || inferMediaTypeMain(win.sourcePath);
        // Re-init dengan metadata media lengkap agar renderer bisa muat video/audio/gambar
        win.webContents.send('init-overlay', {
            id: id,
            path: mediaPath,
            sourcePath: win.sourcePath,
            mediaType: win.mediaType,
            settings: win.gifSettings
        });
        updateGifOverlaysInMemory();
    }
});

// === Helper: Hapus file GIF dari disk ===
function deleteGifFileFromDisk(filePath) {
    if (!filePath) return { success: false, reason: 'No path provided' };

    try {
        // Hanya hapus media yang benar-benar berada di storage milik aplikasi.
        if (!isPathInsideDirectory(filePath, gifStorageDirectory)
            && !isPathInsideDirectory(filePath, legacyGifStorageDirectory)) {
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
        console.warn(`[GIF Sync][${context}] âš ï¸ DESYNC: Windows (${windowCount}) != Settings (${settingsCount})`);
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
        filePath = win.currentPath;
        win.close();
        console.log(`[Main][GIF] Overlay #${id} closed, deleteFile: ${deleteFile}`);
    }

    gifOverlayWindows.delete(id);
    gifOverlayGeometry.delete(id);

    // Hapus dari userSettings.gifOverlays
    if (userSettings.gifOverlays && Array.isArray(userSettings.gifOverlays)) {
        const index = userSettings.gifOverlays.findIndex(o => o.id === id);
        if (index !== -1) {
            if (!filePath) filePath = userSettings.gifOverlays[index].path;
            userSettings.gifOverlays.splice(index, 1);
            console.log(`[Main][GIF] Removed overlay #${id} from settings`);
        }
    }
    syncActiveGifPreset(userSettings.gifOverlays || []);

    // Hapus file dari disk jika diminta
    if (deleteFile && filePath) {
        deleteGifFileFromDisk(filePath);
    }

    logGifSyncStatus('close-gif-overlay-by-id');
    scheduleSaveUserSettings();
});

// Handler: Tutup semua window runtime. Metadata hanya dikosongkan bila aksi UI
// memang meminta clearDocument; perpindahan profil/shutdown bukan penghapusan.
ipcMain.handle('gif-overlay-close-all', async (event, options = {}) => {
    const deleteFiles = options?.deleteFiles === true;
    const clearDocument = options?.clearDocument === true || deleteFiles;
    const preserveActivePreset = options?.preserveActivePreset === true;
    const beforeCount = gifOverlayWindows.size;

    console.log(`[Main][GIF] === CLEANUP ALL START ===`);
    console.log(`[Main][GIF] Menutup ${beforeCount} overlay windows, deleteFiles: ${deleteFiles}`);
    logGifSyncStatus('close-all-before');

    // Kumpulkan path file sebelum close jika perlu hapus
    const filePaths = [];
    if (deleteFiles) {
        gifOverlayWindows.forEach((win, id) => {
            if (win.currentPath) filePaths.push(win.currentPath);
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
    gifOverlayGeometry.clear();

    // Reset counter
    nextOverlayId = 1;

    if (clearDocument) {
        userSettings.gifOverlays = [];
        if (!preserveActivePreset) syncActiveGifPreset([]);
        scheduleSaveUserSettings();
    }

    // Hapus file dari disk jika diminta
    if (deleteFiles && filePaths.length > 0) {
        console.log(`[Main][GIF] Menghapus ${filePaths.length} file dari disk...`);
        for (const fp of filePaths) {
            deleteGifFileFromDisk(fp);
        }
    }

    logGifSyncStatus('close-all-after');
    console.log(`[Main][GIF] === CLEANUP ALL COMPLETE: ${beforeCount} windows closed ===`);

    return { success: true, closedCount: beforeCount, documentCleared: clearDocument };
});

// Handler: Restore GIF Overlay Window saat boot
// Dipanggil dari gif-overlay-standalone.html saat loadSettings()
ipcMain.on('restore-gif-overlay-window', (event, { id, path: mediaPath, sourcePath, mediaType, settings, bounds, layer, hidden }) => {
    console.log(`[Main][GIF] Restore window overlay #${id} dengan path: ${mediaPath}`);

    // Cek apakah window dengan ID ini sudah ada
    const existingWin = gifOverlayWindows.get(id);
    if (existingWin && !existingWin.isDestroyed()) {
        console.log(`[Main][GIF] Window #${id} sudah ada, skip restore.`);
        return;
    }

    // Buat window overlay dengan konfigurasi yang tersimpan
    createGifOverlayWindow(mediaPath, id, settings, bounds, {
        sourcePath: sourcePath || mediaPath,
        mediaType: mediaType || inferMediaTypeMain(sourcePath || mediaPath),
        layer,
        hidden
    });

    logGifSyncStatus(`restore-window-#${id}`);
    console.log(`[Main][GIF] Berhasil restore overlay #${id}`);
});

// Handler: Get bounds dari overlay window
ipcMain.handle('get-gif-overlay-bounds', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        return getGifOverlayBoundsSnapshot(id, win);
    }
    return null;
});

// Handler: Update Per-GIF Settings
ipcMain.on('update-gif-overlay-settings', (event, { id, settings }) => {
    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        win.gifSettings = settings;

        // Sinkronkan metadata media studio dari settings
        if (settings.mediaType) win.mediaType = settings.mediaType;
        if (settings.layer != null) win.gifLayer = settings.layer;
        win.gifHidden = settings.hidden === true;

        // Terapkan opacity (nilai sudah dalam format decimal 0.1 - 1.0)
        if (settings.opacity !== undefined) {
            win.webContents.send('set-opacity', settings.opacity);
        }

        // Terapkan rotation
        if (settings.rotation !== undefined) {
            win.webContents.send('set-rotation', settings.rotation);
        }

        // Terapkan efek media (objectFit/crop/chromaKey/sprite/audio)
        win.webContents.send('set-media-effects', settings);

        const animInfo = settings.animation ? `animation=${settings.animation.type}(speed=${settings.animation.speed})` : 'animation=none';
        console.log(`[Main][GIF] Settings diperbarui untuk Overlay #${id}: kondisi=${settings.condition}, value="${settings.value || ''}", opacity=${settings.opacity}, rotation=${settings.rotation || 0}°, hideOnCursor=${settings.hideOnCursor || false}, ${animInfo}`);

        // Update animasi logic
        initAnimationState(id, settings);

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
            case 'break-time':
                shouldShow = lastRhythmBreakState === true;
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

        // Jangan tampilkan jika layer disembunyikan manual (toggle "Sembunyikan layer ini")
        if (win.gifHidden === true || settings.hidden === true) {
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

function setGifOverlayRuntime(enabled) {
    isGifOverlayEnabled = enabled === true;

    if (isGifOverlayEnabled) {
        // Jika list kosong, coba restore dari settings
        if (gifOverlayWindows.size === 0) {
            if (userSettings.gifOverlays && Array.isArray(userSettings.gifOverlays) && userSettings.gifOverlays.length > 0) {
                console.log(`[Main] Merestore ${userSettings.gifOverlays.length} GIF overlay...`);
                let maxId = 0;
                userSettings.gifOverlays.forEach(item => {
                    // Restore dengan settings dan bounds per-GIF
                    createGifOverlayWindow(item.path, item.id, item.settings, item.bounds, {
                        sourcePath: item.sourcePath || item.path,
                        mediaType: item.mediaType || inferMediaTypeMain(item.sourcePath || item.path),
                        layer: item.layer,
                        hidden: item.hidden
                    });
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
}

// Handler global. Jika lagu aktif memiliki profil, runtime akan segera dikembalikan
// ke override profil tanpa menimpa nilai global yang baru disimpan.
ipcMain.on('set-gif-overlay-enabled', (_event, enabled) => {
    userSettings.gifOverlayEnabled = enabled === true;
    scheduleSaveUserSettings();
    applyMusicProfileForCurrentTrack({ force: true });
});

// --- GIF Overlay Handlers ---
ipcMain.handle('gif-overlay-browse-file', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Pilih File Media',
        filters: [
            { name: 'Semua Media', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp', 'apng', 'mp4', 'webm', 'mov', 'm4v', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
            { name: 'Gambar/GIF', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp', 'apng'] },
            { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] },
            { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }
        ],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    return { filePath: result.filePaths[0] };
});

// ======================== GIF Storage & Preset System ======================== //
// Media adalah data pengguna, bukan aset instalasi. Menaruhnya di __dirname
// membuatnya rawan read-only atau hilang saat aplikasi di-update/rebuild.
const legacyGifStorageDirectory = path.join(__dirname, 'aset', 'gif-storage');
const gifStorageDirectory = path.join(app.getPath('userData'), 'gif-storage');

function isPathInsideDirectory(filePath, directory) {
    if (!filePath || !directory) return false;
    const relative = path.relative(path.resolve(directory), path.resolve(filePath));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Pastikan folder gif-storage ada
function ensureGifStorageDirectory() {
    if (!fs.existsSync(gifStorageDirectory)) {
        fs.mkdirSync(gifStorageDirectory, { recursive: true });
        console.log('[GIF Storage] Folder penyimpanan GIF dibuat:', gifStorageDirectory);
    }
    return gifStorageDirectory;
}

function migrateLegacyGifStorage() {
    ensureGifStorageDirectory();
    if (!fs.existsSync(legacyGifStorageDirectory)
        || path.resolve(legacyGifStorageDirectory) === path.resolve(gifStorageDirectory)) {
        return false;
    }

    let changed = false;
    const migratedPaths = new Map();
    for (const entry of fs.readdirSync(legacyGifStorageDirectory, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const oldPath = path.join(legacyGifStorageDirectory, entry.name);
        const newPath = path.join(gifStorageDirectory, entry.name);
        if (!fs.existsSync(newPath)) fs.copyFileSync(oldPath, newPath);
        migratedPaths.set(path.resolve(oldPath).toLowerCase(), newPath);
    }

    const migrateOverlay = (overlay) => {
        if (!overlay || typeof overlay !== 'object') return;
        for (const key of ['path', 'sourcePath']) {
            const value = overlay[key];
            if (!value || !isPathInsideDirectory(value, legacyGifStorageDirectory)) continue;
            const migrated = migratedPaths.get(path.resolve(value).toLowerCase());
            if (migrated && fs.existsSync(migrated)) {
                overlay[key] = migrated;
                changed = true;
            }
        }
    };

    (userSettings.gifOverlays || []).forEach(migrateOverlay);
    (userSettings.gifOverlayPresets || []).forEach(preset => {
        (preset.overlays || []).forEach(migrateOverlay);
    });

    if (changed) {
        console.log('[GIF Storage] Referensi media lama dimigrasikan ke userData.');
    }
    return changed;
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
        if (isPathInsideDirectory(externalPath, gifStorageDirectory)) {
            console.log('[GIF Storage] File sudah ada di folder internal, tidak perlu copy');
            return {
                success: true,
                internalPath: externalPath,
                mediaType: inferMediaTypeMain(externalPath),
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
            mediaType: inferMediaTypeMain(internalPath),
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
ipcMain.handle('gif-preset-save', async (event, payload = {}) => {
    try {
        const name = String(payload.name || '').trim();
        if (!name) return { success: false, error: 'Nama profile tidak boleh kosong.' };
        const presetId = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        // Snapshot dari Save Settings adalah dokumen otoritatif. BrowserWindow
        // bisa sedang ditutup/ditransisikan dan tidak boleh menentukan isi preset.
        const sourceOverlays = Array.isArray(payload.overlays)
            ? payload.overlays
            : (userSettings.gifOverlays || []);
        const overlays = cloneGifOverlayList(sourceOverlays);

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
        const previousActivePresetId = userSettings.activePresetId;
        userSettings.activePresetId = presetId;
        userSettings.gifOverlays = cloneGifOverlayList(overlays);

        // Jangan laporkan sukses sebelum user-data.json benar-benar durable.
        if (!flushUserSettingsToDisk()) {
            userSettings.gifOverlayPresets = userSettings.gifOverlayPresets.filter(p => p.presetId !== presetId);
            userSettings.activePresetId = previousActivePresetId;
            return { success: false, error: 'Gagal menulis profile ke penyimpanan aplikasi.' };
        }

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
            gifOverlayGeometry.clear();
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

        // Commit preset lama satu kali sebelum lifecycle window ditutup. Event
        // `closed` sendiri tidak boleh lagi mengubah dokumen tersimpan.
        if (gifOverlayWindows.size > 0 && userSettings.activePresetId && userSettings.activePresetId !== presetId) {
            updateGifOverlaysInMemory();
        }
        const targetOverlays = cloneGifOverlayList(preset.overlays || []);

        console.log(`[GIF Preset] Menerapkan preset: "${preset.name}" (${targetOverlays.length} overlay)`);

        // Tutup semua overlay yang ada
        const closedCount = gifOverlayWindows.size;
        gifOverlayWindows.forEach((win, id) => {
            if (!win.isDestroyed()) {
                win.close();
            }
        });
        gifOverlayWindows.clear();
        gifOverlayGeometry.clear();
        nextOverlayId = 1;
        console.log(`[GIF Preset] Closed ${closedCount} existing windows`);

        // Buat overlay baru dari preset
        const missingFiles = [];
        let maxId = 0;

        for (const overlay of targetOverlays) {
            // Cek apakah file masih ada
            if (!overlay.path || !fs.existsSync(overlay.path)) {
                missingFiles.push(overlay.path);
                console.warn(`[GIF Preset] File tidak ditemukan: ${overlay.path}`);
                continue;
            }

            createGifOverlayWindow(overlay.path, overlay.id, overlay.settings, overlay.bounds, {
                sourcePath: overlay.sourcePath || overlay.path,
                mediaType: overlay.mediaType || inferMediaTypeMain(overlay.sourcePath || overlay.path),
                layer: overlay.layer,
                hidden: overlay.hidden
            });
            if (overlay.id > maxId) maxId = overlay.id;
        }

        // Update nextOverlayId
        if (maxId >= nextOverlayId) nextOverlayId = maxId + 1;

        // Update gifOverlays di userSettings untuk sinkronisasi
        userSettings.gifOverlays = targetOverlays.filter(o => o.path && fs.existsSync(o.path));

        // Set sebagai preset aktif
        userSettings.activePresetId = presetId;
        if (!flushUserSettingsToDisk()) {
            return { success: false, error: 'Preset diterapkan, tetapi state aktif gagal disimpan ke disk.' };
        }

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
    if (previousPreset && previousPreset !== presetId && gifOverlayWindows.size > 0) {
        updateGifOverlaysInMemory();
    }
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
            if (!Array.isArray(settings.gifOverlays)) {
                return { success: false, error: 'Format daftar overlay tidak valid.' };
            }
            userSettings.gifOverlays = cloneGifOverlayList(settings.gifOverlays);
        }
        if (settings.activePresetId !== undefined) {
            userSettings.activePresetId = settings.activePresetId;
        }

        // --- singkron perubahan ke preset aktif ---
        if (userSettings.activePresetId && userSettings.gifOverlayPresets) {
            const presetIndex = userSettings.gifOverlayPresets.findIndex(p => p.presetId === userSettings.activePresetId);
            if (presetIndex !== -1) {
                userSettings.gifOverlayPresets[presetIndex].overlays = cloneGifOverlayList(userSettings.gifOverlays || []);
                userSettings.gifOverlayPresets[presetIndex].updatedAt = Date.now();
                console.log(`[GIF Settings] Preset "${userSettings.gifOverlayPresets[presetIndex].name}" updated with ${userSettings.gifOverlays.length} overlays.`);
            }
        }
        // ----------------------------------------------

        if (!flushUserSettingsToDisk()) {
            return { success: false, error: 'Gagal menulis user-data.json ke penyimpanan aplikasi.' };
        }
        console.log('[GIF Settings] Settings berhasil disimpan ke disk');
        return { success: true };
    } catch (e) {
        console.error('[GIF Settings] Gagal menyimpan settings:', e);
        return { success: false, error: e.message };
    }
});

// ======================== Studio Tools: Duplicate / Layer / Align / Pack ======================== //

// Handler: Gandakan overlay yang ada (mengembalikan { success, overlay })
ipcMain.handle('gif-overlay-duplicate', async (event, id) => {
    try {
        const src = gifOverlayWindows.get(id);
        if (!src || src.isDestroyed()) {
            return { success: false, error: 'Overlay yang akan digandakan tidak ditemukan' };
        }

        const b = getGifOverlayBoundsSnapshot(id, src);
        // Offset sedikit agar duplikat tidak menumpuk persis di atas aslinya
        const newBounds = { x: b.x + 24, y: b.y + 24, width: b.width, height: b.height };
        const settings = JSON.parse(JSON.stringify(src.gifSettings || {}));

        const newId = createGifOverlayWindow(src.currentPath, null, settings, newBounds, {
            sourcePath: src.sourcePath || src.currentPath,
            mediaType: src.mediaType,
            layer: src.gifLayer,
            hidden: src.gifHidden
        });

        updateGifOverlaysInMemory();
        evaluateGifOverlayVisibility();
        scheduleSaveUserSettings();

        return {
            success: true,
            overlay: {
                id: newId,
                path: src.currentPath,
                sourcePath: src.sourcePath || src.currentPath,
                mediaType: src.mediaType || inferMediaTypeMain(src.currentPath),
                settings: settings,
                layer: src.gifLayer || 0,
                hidden: src.gifHidden === true,
                bounds: newBounds
            }
        };
    } catch (e) {
        console.error('[GIF Studio] Gagal menggandakan overlay:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Set urutan layer (z-order) berdasarkan array id terurut (bawah -> atas)
ipcMain.on('gif-overlay-set-layer-order', (event, orderedIds) => {
    if (!Array.isArray(orderedIds)) return;

    orderedIds.forEach((rawId, index) => {
        const id = parseInt(rawId);
        const win = gifOverlayWindows.get(id);
        if (win && !win.isDestroyed()) {
            win.gifLayer = index;
            if (win.gifSettings) win.gifSettings.layer = index;
            // Re-assert always-on-top lalu bawa ke depan secara berurutan
            win.setAlwaysOnTop(true, 'screen-saver');
            win.moveTop();
        }
    });

    updateGifOverlaysInMemory();
    scheduleSaveUserSettings();
    console.log(`[GIF Studio] Urutan layer diperbarui untuk ${orderedIds.length} overlay`);
});

// Handler: Align overlay (center / snap-grid)
ipcMain.handle('gif-overlay-align', async (event, { ids, action, gridSize = 32 } = {}) => {
    try {
        const targetIds = Array.isArray(ids) ? ids : [];
        targetIds.forEach(rawId => {
            const id = parseInt(rawId);
            const win = gifOverlayWindows.get(id);
            if (!win || win.isDestroyed()) return;

            const b = getGifOverlayBoundsSnapshot(id, win);
            if (action === 'center') {
                const wa = screen.getDisplayNearestPoint(getGifOverlayGeometryCenter(b)).workArea;
                moveGifOverlayWindow(
                    id,
                    win,
                    wa.x + (wa.width - b.width) / 2,
                    wa.y + (wa.height - b.height) / 2,
                    'align:center'
                );
            } else if (action === 'snap-grid') {
                const g = Math.max(1, parseInt(gridSize) || 32);
                moveGifOverlayWindow(
                    id,
                    win,
                    Math.round(b.x / g) * g,
                    Math.round(b.y / g) * g,
                    'align:snap-grid'
                );
            }
        });

        updateGifOverlaysInMemory();
        scheduleSaveUserSettings();
        return { success: true };
    } catch (e) {
        console.error('[GIF Studio] Gagal align overlay:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Export Pack - bundel media (base64) + settings ke satu file .gapack (JSON mandiri)
ipcMain.handle('gif-pack-export', async (event, { name, presetId, overlays } = {}) => {
    try {
        const safeName = (name || 'overlay-pack').replace(/[^\w\-]+/g, '_');
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: 'Export Overlay Pack',
            defaultPath: `${safeName}.gapack`,
            filters: [{ name: 'GAP Overlay Pack', extensions: ['gapack', 'json'] }]
        });
        if (canceled || !filePath) return { canceled: true };

        const list = Array.isArray(overlays) && overlays.length > 0
            ? overlays
            : (userSettings.gifOverlays || []);

        const packOverlays = [];
        for (const o of list) {
            const srcPath = o.sourcePath || o.path;
            let media = null, fileName = null;
            if (srcPath && fs.existsSync(srcPath)) {
                media = fs.readFileSync(srcPath).toString('base64');
                fileName = path.basename(srcPath);
            }
            packOverlays.push({
                id: o.id,
                fileName,
                mediaType: o.mediaType || inferMediaTypeMain(srcPath),
                settings: o.settings || {},
                layer: o.layer || 0,
                hidden: o.hidden === true,
                bounds: o.bounds || null,
                media
            });
        }

        const pack = {
            format: 'gap-overlay-pack',
            version: 1,
            name: name || 'Overlay Pack',
            presetId: presetId || null,
            exportedAt: Date.now(),
            overlays: packOverlays
        };

        fs.writeFileSync(filePath, JSON.stringify(pack));
        console.log(`[GIF Pack] Pack diekspor ke ${filePath} (${packOverlays.length} media)`);
        return { success: true, overlayCount: packOverlays.length, filePath };
    } catch (e) {
        console.error('[GIF Pack] Gagal export pack:', e);
        return { success: false, error: e.message };
    }
});

// Handler: Import Pack - baca .gapack, decode media ke gif-storage, buat preset baru
ipcMain.handle('gif-pack-import', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Import Overlay Pack',
            filters: [{ name: 'GAP Overlay Pack', extensions: ['gapack', 'json'] }],
            properties: ['openFile']
        });
        if (canceled || !filePaths || filePaths.length === 0) return { canceled: true };

        const raw = fs.readFileSync(filePaths[0], 'utf-8');
        const pack = JSON.parse(raw);
        if (!pack || !Array.isArray(pack.overlays)) {
            return { success: false, error: 'Format pack tidak valid' };
        }

        ensureGifStorageDirectory();

        const overlays = [];
        let nid = 1;
        for (const o of pack.overlays) {
            let internalPath = null;
            if (o.media && o.fileName) {
                const ext = path.extname(o.fileName) || '';
                const base = path.basename(o.fileName, ext);
                const unique = `${base}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
                internalPath = path.join(gifStorageDirectory, unique);
                fs.writeFileSync(internalPath, Buffer.from(o.media, 'base64'));
            }
            overlays.push({
                id: nid++,
                path: internalPath,
                sourcePath: internalPath,
                mediaType: o.mediaType || inferMediaTypeMain(internalPath),
                settings: o.settings || {},
                layer: o.layer || 0,
                hidden: o.hidden === true,
                bounds: o.bounds || { x: 100, y: 100, width: 200, height: 200 }
            });
        }

        const presetId = `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newPreset = {
            presetId,
            name: pack.name || 'Imported Pack',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            overlays
        };

        if (!userSettings.gifOverlayPresets) userSettings.gifOverlayPresets = [];
        userSettings.gifOverlayPresets.push(newPreset);
        scheduleSaveUserSettings();

        console.log(`[GIF Pack] Pack diimport sebagai preset "${newPreset.name}" (${overlays.length} media)`);
        return { success: true, preset: newPreset };
    } catch (e) {
        console.error('[GIF Pack] Gagal import pack:', e);
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

    // Resize resmi memperbarui ukuran kanonik sebelum menyentuh BrowserWindow.
    resizeGifOverlayWindow(id, win, {
        ...getGifOverlayBoundsSnapshot(id, win),
        width: newWidth,
        height: newHeight
    }, 'media-natural-size');
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
let resizeStartedAt = 0;
const RESIZE_IDLE_TIMEOUT_MS = 250;
const RESIZE_MAX_DURATION_MS = 10000;

let activeDragOverlayId = null;
let dragStartMousePos = null;
let dragStartBounds = null;
let dragInterval = null;
let lastDragCursorPos = null;
let dragCursorIdleTime = 0;
let dragStartedAt = 0;
const DRAG_IDLE_TIMEOUT_MS = 500;
const DRAG_MAX_DURATION_MS = 15000;

function finishGifOverlayResize(id, reason) {
    if (activeResizeOverlayId !== id) return;

    if (resizeInterval) {
        clearInterval(resizeInterval);
        resizeInterval = null;
    }

    activeResizeOverlayId = null;
    resizeStartMousePos = null;
    resizeStartBounds = null;
    lastCursorPos = null;
    cursorIdleTime = 0;
    resizeStartedAt = 0;

    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        resetGifAnimationAnchor(id);
        updateGifOverlaysInMemory();
        // Simpan juga resize yang berakhir melalui fallback, bukan hanya melalui IPC.
        scheduleSaveUserSettings();
    }

    console.log(`[Main][GIF] Resize ended (${reason}) for overlay #${id}`);
}

function finishGifOverlayDrag(id, reason) {
    if (activeDragOverlayId !== id) return;

    if (dragInterval) {
        clearInterval(dragInterval);
        dragInterval = null;
    }

    activeDragOverlayId = null;
    dragStartMousePos = null;
    dragStartBounds = null;
    lastDragCursorPos = null;
    dragCursorIdleTime = 0;
    dragStartedAt = 0;

    const win = gifOverlayWindows.get(id);
    if (win && !win.isDestroyed()) {
        resetGifAnimationAnchor(id);
        pauseGifAnimation(id, 2000);
        updateGifOverlaysInMemory();
        scheduleSaveUserSettings();
    }

    console.log(`[Main][GIF] Drag ended (${reason}) for overlay #${id}`);
}

// Handler: Resize start - mulai polling
ipcMain.on('gif-overlay-resize-start', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;

    // Jika sudah ada resize aktif, jangan mulai yang baru
    if (activeResizeOverlayId !== null) return;

    const bounds = getGifOverlayBoundsSnapshot(id, win);
    const cursorPos = screen.getCursorScreenPoint();

    activeResizeOverlayId = id;
    resizeStartMousePos = { x: cursorPos.x, y: cursorPos.y };
    resizeStartBounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };
    lastCursorPos = { x: cursorPos.x, y: cursorPos.y };
    cursorIdleTime = 0;
    resizeStartedAt = Date.now();

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
            finishGifOverlayResize(activeResizeOverlayId, 'window-destroyed');
            return;
        }

        // Mouseup normal akan menghentikan resize secara eksplisit dari renderer.
        // Ini hanya sabuk pengaman untuk mouseup yang hilang saat pointer keluar
        // dari transparent BrowserWindow. Batas durasi mencegah polling tertinggal
        // aktif karena micro-movement touchpad/mouse.
        if (Date.now() - resizeStartedAt >= RESIZE_MAX_DURATION_MS) {
            finishGifOverlayResize(activeResizeOverlayId, 'safety-timeout');
            return;
        }

        const currentCursor = screen.getCursorScreenPoint();

        // Cek apakah cursor masih bergerak
        if (lastCursorPos && currentCursor.x === lastCursorPos.x && currentCursor.y === lastCursorPos.y) {
            cursorIdleTime += 16;
            // Fallback jika mouseup tidak pernah tiba di renderer.
            if (cursorIdleTime >= RESIZE_IDLE_TIMEOUT_MS) {
                finishGifOverlayResize(activeResizeOverlayId, 'cursor-idle');
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

        // Hanya jalur resize resmi ini yang boleh mengubah ukuran kanonik.
        resizeGifOverlayWindow(activeResizeOverlayId, targetWin, {
            x: resizeStartBounds.x,
            y: resizeStartBounds.y,
            width: Math.round(newWidth),
            height: Math.round(newHeight)
        }, 'manual-resize');
    }, 16); // ~60fps

    console.log(`[Main][GIF] Resize started for overlay #${id}, start pos: ${cursorPos.x},${cursorPos.y}, bounds: ${bounds.width}x${bounds.height}`);
});

// Handler lama untuk kompatibilitas renderer lama. Resize selalu dilakukan oleh
// polling berbasis titik awal agar delta tidak terakumulasi dan membesarkan window.
ipcMain.on('gif-overlay-resize-move', (event, { id, deltaX, deltaY }) => {
    // Intentionally no-op. Handler ini tetap terdaftar supaya versi renderer lama
    // tidak error, tetapi tidak boleh mengubah ukuran di luar sesi resize aktif.
});

// Handler: Resize end - stop polling (jika masih aktif)
ipcMain.on('gif-overlay-resize-end', (event, id) => {
    finishGifOverlayResize(id, 'mouseup');
});

// Handler: Drag start
ipcMain.on('gif-overlay-drag-start', (event, id) => {
    const win = gifOverlayWindows.get(id);
    if (!win || win.isDestroyed() || isGifOverlayLocked) return;

    // Jika sesi resize lama tidak sempat menerima mouseup, jangan biarkan ia
    // meneruskan polling ukuran ketika pengguna mulai menggeser overlay.
    if (activeResizeOverlayId !== null) {
        finishGifOverlayResize(activeResizeOverlayId, 'drag-start');
    }

    if (activeDragOverlayId !== null) return;

    // screen.getCursorScreenPoint() dan BrowserWindow bounds sama-sama memakai
    // DIP. Menghitung drag di sini menghindari delta screenX renderer yang bisa
    // berbeda skala pada perangkat dengan DPI/scaling tertentu.
    const bounds = getGifOverlayBoundsSnapshot(id, win);
    const cursorPos = screen.getCursorScreenPoint();
    pauseGifAnimation(id, DRAG_MAX_DURATION_MS + 2000);
    activeDragOverlayId = id;
    dragStartMousePos = { x: cursorPos.x, y: cursorPos.y };
    dragStartBounds = { ...bounds };
    lastDragCursorPos = { ...cursorPos };
    dragCursorIdleTime = 0;
    dragStartedAt = Date.now();

    if (dragInterval) clearInterval(dragInterval);
    dragInterval = setInterval(() => {
        const activeId = activeDragOverlayId;
        if (activeId === null) {
            clearInterval(dragInterval);
            dragInterval = null;
            return;
        }

        const targetWin = gifOverlayWindows.get(activeId);
        if (!targetWin || targetWin.isDestroyed()) {
            finishGifOverlayDrag(activeId, 'window-destroyed');
            return;
        }

        if (isGifOverlayLocked) {
            finishGifOverlayDrag(activeId, 'locked');
            return;
        }

        if (Date.now() - dragStartedAt >= DRAG_MAX_DURATION_MS) {
            finishGifOverlayDrag(activeId, 'safety-timeout');
            return;
        }

        const currentCursor = screen.getCursorScreenPoint();
        if (lastDragCursorPos && currentCursor.x === lastDragCursorPos.x && currentCursor.y === lastDragCursorPos.y) {
            dragCursorIdleTime += 16;
            // Fallback untuk mouseup yang hilang setelah pointer keluar dari
            // transparent BrowserWindow.
            if (dragCursorIdleTime >= DRAG_IDLE_TIMEOUT_MS) {
                finishGifOverlayDrag(activeId, 'cursor-idle');
                return;
            }
        } else {
            dragCursorIdleTime = 0;
        }
        lastDragCursorPos = { ...currentCursor };

        moveGifOverlayWindow(
            activeId,
            targetWin,
            dragStartBounds.x + currentCursor.x - dragStartMousePos.x,
            dragStartBounds.y + currentCursor.y - dragStartMousePos.y,
            'manual-drag'
        );
    }, 16);
});

// Kompatibilitas untuk renderer versi lama. Drag aktif selalu ditangani oleh
// polling main process agar delta tidak bergantung pada skala renderer.
ipcMain.on('gif-overlay-drag-move', (event, { id, deltaX, deltaY }) => {
    // Intentionally no-op.
});

// Handler: Drag end
ipcMain.on('gif-overlay-drag-end', (event, id) => {
    finishGifOverlayDrag(id, 'mouseup');
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

            const bounds = getGifOverlayBoundsSnapshot(id, win);
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
const VERSION_TEXT = `versi ${versiAplikasi()} | Versi Eksperimental, tidak mengindikasikan hasil akhir aplikasi...`;
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

// ======================== Logika Rhythm Overlay Gamifikasi =======================//
function createRhythmOverlayWindow() {
    if (rhythmOverlayWindow) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workAreaSize;

    // Overlay full-screen transparan, click-through
    rhythmOverlayWindow = new BrowserWindow({
        width: workArea.width,
        height: workArea.height,
        x: 0,
        y: 0,
        frame: false,
        transparent: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        show: false,
    });

    rhythmOverlayWindow.setAlwaysOnTop(true, 'screen-saver');
    rhythmOverlayWindow.setIgnoreMouseEvents(true);

    rhythmOverlayWindow.loadFile(path.join(__dirname, 'rhythm-overlay.html'));

    // Sinkronkan preferensi visibilitas panel Now Playing setelah halaman siap
    rhythmOverlayWindow.webContents.on('did-finish-load', () => {
        if (rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
            rhythmOverlayWindow.webContents.send(
                'rhythm-set-nowplaying-visible',
                runtimeRhythmHideNowPlaying !== true
            );
            rhythmOverlayWindow.webContents.send('rhythm-ad-state', {
                active: lastAdState === 'waiting' || lastAdState === 'skippable'
            });
            rhythmOverlayWindow.webContents.send('rhythm-subtitle', {
                text: lastRhythmSubtitle
            });
        }
    });

    rhythmOverlayWindow.on('closed', () => {
        rhythmOverlayWindow = null;
    });

    console.log('[Main] Jendela Rhythm Overlay Gamifikasi dibuat.');
}

function setRhythmOverlayRuntime(enabled) {
    isRhythmOverlayEnabled = enabled === true;
    if (isRhythmOverlayEnabled) {
        if (!rhythmOverlayWindow) createRhythmOverlayWindow();
        if (rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
            rhythmOverlayWindow.show();
            lastRhythmTrackTitle = lastMusicState.title || null;
        }
    } else if (rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
        rhythmOverlayWindow.hide();
        lastRhythmBreakState = false;
        evaluateGifOverlayVisibility();
    }
}

function setRhythmHideNowPlayingRuntime(hidden) {
    runtimeRhythmHideNowPlaying = hidden === true;
    if (rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
        rhythmOverlayWindow.webContents.send('rhythm-set-nowplaying-visible', !runtimeRhythmHideNowPlaying);
    }
}

ipcMain.on('toggle-rhythm-overlay', (_event, enabled) => {
    userSettings.rhythmOverlayEnabled = enabled === true;
    scheduleSaveUserSettings();
    applyMusicProfileForCurrentTrack({ force: true });
});

ipcMain.on('set-rhythm-hide-nowplaying', (_event, hidden) => {
    userSettings.rhythmHideNowPlaying = hidden === true;
    scheduleSaveUserSettings();
    applyMusicProfileForCurrentTrack({ force: true });
});

ipcMain.on('rhythm-break-state', (_event, active) => {
    const nextState = active === true;
    if (lastRhythmBreakState === nextState) return;
    lastRhythmBreakState = nextState;
    evaluateGifOverlayVisibility();
});

// Caption berasal dari CC YouTube Music yang diaktifkan manual oleh user.
// Simpan nilai terakhir agar overlay yang baru dibuka langsung sinkron.
ipcMain.on('subtitle-update', (_event, payload) => {
    lastRhythmSubtitle = String(payload?.text || '').trim();
    if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
        rhythmOverlayWindow.webContents.send('rhythm-subtitle', {
            text: lastRhythmSubtitle
        });
    }
});

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

// ============ Preview Window (dipindah ke vn-engine/preview-manager.js) ============ //

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
        const previousTitle = lastMusicState.title;
        const previousArtist = lastMusicState.artist;
        lastMusicState.isPlaying = state.isPlaying === true;
        lastMusicState.title = state.title || '';
        lastMusicState.artist = state.artist || '';
        lastMusicState.coverSrc = state.coverSrc || state.thumbnail || '';

        if (previousTitle !== lastMusicState.title || previousArtist !== lastMusicState.artist) {
            lastRhythmBreakState = false;
            lastRhythmSubtitle = '';
            if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
                rhythmOverlayWindow.webContents.send('rhythm-subtitle', { text: '' });
                if (lastRhythmTrackTitle !== null && lastRhythmTrackTitle !== lastMusicState.title) {
                    rhythmOverlayWindow.webContents.send('rhythm-track-changed', {
                        oldTitle: lastRhythmTrackTitle,
                        newTitle: lastMusicState.title
                    });
                }
                lastRhythmTrackTitle = lastMusicState.title;
            }
        }

        // Evaluasi ulang visibilitas GIF overlay
        evaluateGifOverlayVisibility();
        applyMusicProfileForCurrentTrack();
    }

    // Siarkan ke jendela overlay jika ada dan terlihat
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
        overlayWindow.webContents.send('shared-player-state-updated', latestPlayerState);
    }

    if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed() && state) {
        rhythmOverlayWindow.webContents.send('rhythm-track-info', {
            title: lastMusicState.title,
            artist: lastMusicState.artist,
            coverSrc: state.thumbnail || state.coverSrc || ''
        });
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
    // Mode Game memakai stream visualizer ini; teruskan juga agar Rhythm
    // Gamification menerima beat yang sama seperti mode Native.
    if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
        rhythmOverlayWindow.webContents.send('rhythm-analyser-data', { data });
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

    // Rhythm overlay harus tetap tahu status iklan meski UI Ad Skipper dinonaktifkan.
    // Dengan begitu analyser iklan tidak menambah combo, score, maupun subtitle.
    if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
        rhythmOverlayWindow.webContents.send('rhythm-ad-state', {
            active: state === 'waiting' || state === 'skippable'
        });
    }

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
    try {
        if (migrateLegacyGifStorage()) flushUserSettingsToDisk();
    } catch (error) {
        console.error('[GIF Storage] Migrasi media lama gagal; path lama tetap dipertahankan:', error);
    }

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

    // Set fullscreen eksplisit (on/off) — dipakai UI Settings kustom Hub via
    // VNHub.settings.setFullscreen(bool). Berbeda dari toggle yang membalik state.
    ipcMain.on("vn-engine:set-fullscreen", (event, on) => {
        if (mainWindow) {
            isFullscreen = !!on;
            mainWindow.setFullScreen(isFullscreen);
            mainWindow.webContents.send("fullscreen-status-changed", isFullscreen);
        }
    });

    // Set ukuran window (resolusi windowed) — dipakai VNHub.settings.setResolution(w,h).
    // Keluar fullscreen dulu bila aktif (fullscreen mengabaikan ukuran), lalu center.
    ipcMain.on("vn-engine:set-window-size", (event, size) => {
        if (mainWindow && size && size.width && size.height) {
            try {
                if (mainWindow.isFullScreen()) { isFullscreen = false; mainWindow.setFullScreen(false); }
                mainWindow.setContentSize(Math.round(size.width), Math.round(size.height));
                mainWindow.center();
            } catch (e) { console.error("[Main] set-window-size gagal:", e); }
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
    
    let stderrOutput = '';

    ps.stderr.on('data', (data) => {
        stderrOutput += data.toString();
        console.error(`[QuickBoot] Error: ${data}`);
    });

    ps.on('close', (code) => {
        // Kirim notifikasi status kembali ke renderer
        if (code === 0) {
            console.log(`[QuickBoot] Shortcut berhasil dibuat.`);
            event.sender.send('quick-boot-status', {
                success: true,
                message: `Shortcut "${safeName}" berhasil dibuat di Desktop!`
            });
        } else {
            console.log(`[QuickBoot] Gagal membuat shortcut dengan kode: ${code}`);
            event.sender.send('quick-boot-status', {
                success: false,
                message: `Gagal membuat shortcut. Kode error: ${code}${stderrOutput ? '\nDetail: ' + stderrOutput : ''}`
            });
        }
    });

    ps.on('error', (err) => {
        console.error(`[QuickBoot] Gagal menjalankan PowerShell:`, err);
        event.sender.send('quick-boot-status', {
            success: false,
            message: `Gagal menjalankan PowerShell: ${err.message}`
        });
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
        // Pengecekan update otomatis setelah GIF Overlay Studio terbuka.
        setTimeout(() => updater.autoCheckAndPrompt('gif-overlay'), 1200);
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
        // Ambil snapshot satu kali selagi overlay masih hidup. Penutupan window
        // sesudah ini murni teardown runtime dan tidak boleh mengosongkan preset.
        if (gifOverlayWindows.size > 0) updateGifOverlaysInMemory({ preserveWhenNoWindows: true });
        flushUserSettingsToDisk();

        // Tutup semua GIF overlay windows saat standalone window ditutup
        gifOverlayWindows.forEach((win, id) => {
            if (win && !win.isDestroyed()) win.close();
        });
        gifOverlayWindows.clear();
        gifOverlayGeometry.clear();
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

    // Pengecekan update otomatis segera setelah native player terbuka.
    // Diberi jeda singkat agar tidak bersaing dengan proses load webview/login.
    mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => updater.autoCheckAndPrompt('native'), 1200);
    });

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
    // Apply remembered Rhythm Overlay state on boot
    runtimeRhythmHideNowPlaying = userSettings.rhythmHideNowPlaying === true;
    isRhythmOverlayEnabled = userSettings.rhythmOverlayEnabled === true;
    if (isRhythmOverlayEnabled) {
        if (!rhythmOverlayWindow) createRhythmOverlayWindow();
        setTimeout(() => {
            if (rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
                rhythmOverlayWindow.show();
            }
        }, 300);
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

    pasangPenjagaTutup(mainWindow, 'jendela YT Music');

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
            lastMusicState.coverSrc = playbackData.thumbnail || playbackData.coverSrc || '';

            // Log perubahan hanya jika judul atau artis berubah
            if (oldTitle !== lastMusicState.title || oldArtist !== lastMusicState.artist) {
                lastRhythmBreakState = false;
                lastRhythmSubtitle = '';
                console.log(`[Main][GIF] Musik berubah: "${lastMusicState.title}" by ${lastMusicState.artist}`);

                // Kirim sinyal ganti lagu ke rhythm overlay agar reset score/combo
                if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
                    rhythmOverlayWindow.webContents.send('rhythm-subtitle', { text: '' });
                    if (lastRhythmTrackTitle !== null && lastRhythmTrackTitle !== lastMusicState.title) {
                        rhythmOverlayWindow.webContents.send('rhythm-track-changed', {
                            oldTitle: lastRhythmTrackTitle,
                            newTitle: lastMusicState.title
                        });
                        console.log('[Main][Rhythm] Track berubah, sinyal reset dikirim ke overlay');
                    }
                    lastRhythmTrackTitle = lastMusicState.title;
                }
            }

            // Evaluasi ulang visibilitas GIF overlay
            evaluateGifOverlayVisibility();
            applyMusicProfileForCurrentTrack();
        }

        if (userSettings.rpcEnabled !== false) {
            if (playbackData.title && playbackData.title !== 'Loading...') {
                // Mode native: kirim data kaya → "Listening to" + thumbnail + progress bar
                updateRpcActivity({
                    songTitle: playbackData.title,
                    songArtist: playbackData.artist,
                    album: playbackData.album,                             // untuk teks hover gambar
                    largeImageKey: playbackData.thumbnail,                 // URL cover → large image dinamis
                    smallImageKey: playbackData.isPlaying ? 'play_icon' : 'pause_icon',
                    smallImageText: playbackData.isPlaying ? 'Memutar' : 'Dijeda',
                    currentTime: playbackData.currentTime,                 // detik
                    duration: playbackData.duration,                       // detik
                    isPlaying: playbackData.isPlaying
                });
            } else {
                // Idle bersih: belum ada lagu / masih memuat
                updateRpcActivity({
                    details: 'GAP Music Player',
                    state: 'Menjelajah musik 🎧',
                    largeImageKey: 'main_icon'
                });
            }
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

        // Kirim identitas lagu (judul, artis, cover) ke rhythm overlay untuk kartu Now-Playing.
        // Dikirim tiap update agar cover/judul tetap sinkron walau overlay baru dibuka di tengah lagu.
        if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
            rhythmOverlayWindow.webContents.send('rhythm-track-info', {
                title: playbackData.title || '',
                artist: playbackData.artist || '',
                coverSrc: playbackData.thumbnail || ''
            });
        }
    });

    ipcMain.on('analyser-data', (event, analyserData) => {
        if (isMiniPlayerFeatureEnabled && miniPlayerWindow) {
            miniPlayerWindow.webContents.send('mini-player-data-update', {
                visualizerData: analyserData.data
            });
        }

        // Teruskan data analyser ke rhythm overlay untuk deteksi bass beat
        if (isRhythmOverlayEnabled && rhythmOverlayWindow && !rhythmOverlayWindow.isDestroyed()) {
            rhythmOverlayWindow.webContents.send('rhythm-analyser-data', {
                data: analyserData.rawData || analyserData.data
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

// =============================================================================
// PENJAGA TUTUP JENDELA UTAMA
//
// Bug yang ditutup: aplikasi TIDAK BISA DITUTUP sama sekali. Tombol X ditekan
// berkali-kali, log memuntahkan "[Main] hentikan semua." dan "[App] Aplikasi
// akan keluar" berulang-ulang, dan jendelanya tetap berdiri.
//
// Rantainya, urut:
//
//   1. vnManager.html memasang `beforeunload` yang memanggil preventDefault()
//      selama masih ada perubahan editor yang belum disimpan (scriptEditor.js,
//      _anyNovelDirty). Itu memang disengaja.
//   2. Di Electron, event `close` milik BrowserWindow menyala SEBELUM
//      `beforeunload` renderer. Jadi handler close sempat berjalan — itulah
//      "[Main] hentikan semua." yang terlihat di log — lalu barulah renderer
//      mengajukan keberatannya.
//   3. Keberatan itu sampai ke main sebagai `will-prevent-unload` pada
//      webContents. TIDAK ADA yang mendengarkannya (hanya jendela Hub Code
//      Editor yang punya), dan perilaku bawaan Electron saat tak ada pendengar
//      adalah: BATALKAN penutupan, diam-diam. Nol dialog, nol pesan.
//   4. Pembatalan itu memanggil Browser::OnWindowCloseCancelled() di dalam
//      Electron, yang me-reset `is_quitting_` jadi false. Akibatnya app.quit()
//      berikutnya memancarkan `before-quit` lagi dari nol — itulah kenapa
//      "[App] Aplikasi akan keluar" berulang tanpa pernah benar-benar keluar.
//
// Jadi aplikasinya tidak menggantung: ia PATUH pada penolakan yang tak pernah
// diberi tahu kepada siapa pun. Yang diperbaiki adalah memberi penolakan itu
// suara — dan memberi pengguna keputusannya.
// =============================================================================
function pasangPenjagaTutup(win, namaJendela) {
    if (!win || win.isDestroyed()) return;

    // Sekali saja, walau kedua jendela utama sempat hidup bersamaan.
    let sudahMemintaKeluar = false;

    win.webContents.on('will-prevent-unload', (event) => {
        const pilihan = dialog.showMessageBoxSync(win, {
            type: 'question',
            buttons: ['Keluar Tanpa Menyimpan', 'Batal'],
            defaultId: 1,
            cancelId: 1,
            title: 'Perubahan Belum Disimpan',
            message: 'Ada perubahan di editor novel yang belum disimpan.',
            detail: 'Kalau kamu keluar sekarang, perubahan itu hilang. Pilih Batal untuk kembali, lalu simpan lewat tombol Simpan di editor.'
        });
        if (pilihan === 0) {
            // preventDefault() di sini berarti "abaikan keberatan renderer",
            // yaitu LANJUTKAN penutupan — kebalikan dari arti biasanya.
            event.preventDefault();
            return;
        }
        // Pengguna memilih tinggal. Electron membatalkan penutupan; tak ada yang
        // perlu dibereskan di sini justru KARENA app.quit() tidak lagi dipanggil
        // dari `close` (lihat di bawah).
        console.log(`[Main] Penutupan ${namaJendela} dibatalkan: masih ada perubahan belum disimpan.`);
    });

    // `close` HANYA mencatat. Dulu ia memanggil app.quit() langsung, dan itu
    // punya cacat kedua di luar rantai di atas: `close` menyala sebelum
    // beforeunload, jadi `before-quit` — yang MENGHANCURKAN Mini Player, jendela
    // salju, dan Ad Skipper — sudah berjalan sebelum pengguna sempat menjawab
    // dialog. Menekan "Batal" berarti tetap tinggal, tetapi dengan jendela-jendela
    // itu sudah terlanjur lenyap.
    win.on('close', () => {
        console.log('[Main] hentikan semua.');
    });

    // Keluar dipicu SESUDAH jendela benar-benar hancur. Di titik ini negosiasi
    // beforeunload pasti sudah selesai dan pasti berakhir dengan "tutup", jadi
    // tak ada lagi before-quit yang berjalan untuk penutupan yang batal.
    //
    // app.quit() tetap diperlukan (bukan mengandalkan `window-all-closed`) karena
    // jendela pendamping seperti Mini Player dan GIF overlay bisa masih hidup,
    // sehingga `window-all-closed` tak akan pernah menyala sendiri.
    win.on('closed', () => {
        if (sudahMemintaKeluar) return;
        sudahMemintaKeluar = true;
        app.quit();
    });
}

// Izin akses internet mode game. DIANGKAT ke module scope (dulu variabel lokal
// di dalam setupGameWindow) karena tiga hal butuh membacanya dari luar fungsi itu:
// penyaring webRequest, panel Options di index.html, dan kartu Gambar Discord di
// editor novel. Nilai awal & reset per-masuk-mode tetap dilakukan di dalam
// setupGameWindow, jadi perilakunya tidak berubah.
let internetConnectionAllowed = false;

// Satu corong untuk mengubahnya, supaya setiap permukaan yang menampilkan status
// ikut tahu. Tanpa siaran ini, tombol di editor dan tombol di Options bisa
// menampilkan dua keadaan berbeda untuk satu variabel yang sama.
function setInternetAllowed(allowed, sumber) {
    const baru = !!allowed;
    if (internetConnectionAllowed === baru) return internetConnectionAllowed;
    internetConnectionAllowed = baru;
    console.log('[Internet] Akses ' + (baru ? 'DIIZINKAN' : 'diputus') + ' (dari: ' + (sumber || 'tak disebut') + ')');
    BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
            try { w.webContents.send('internet:status-changed', { allowed: internetConnectionAllowed }); }
            catch (e) { /* window sedang ditutup */ }
        }
    });
    return internetConnectionAllowed;
}

// Uji gambar RPC langsung dari editor. Tanpa ini, satu-satunya cara memeriksa
// hasilnya adalah menyimpan → keluar editor → memainkan novel → melihat Discord,
// dan bila gambarnya tidak muncul kreator tak punya cara membedakan "URL-nya
// salah", "Discord tak tersambung", atau "nilainya tak tersimpan".
ipcMain.handle('novel-rpc:test', (event, { novelTitle, largeImage } = {}) => {
    if (!isRpcEnabled) return { ok: false, alasan: 'nonaktif' };
    if (!rpc || !isRpcReady) return { ok: false, alasan: 'belum-tersambung' };

    const bersih = sanitizeRpcLargeImage(largeImage);
    updateRpcActivity({
        details: 'Test Ikon Novel : ' + (novelTitle || 'novel'),
        state: 'Pratinjau dari editor',
        largeImageKey: largeImage || undefined
    });
    // `terkirim` adalah yang BENAR-BENAR masuk payload sesudah penyaring — kalau
    // ia 'main_icon' padahal kreator mengisi URL, penyaringnyalah yang menolak.
    return { ok: true, terkirim: bersih || 'main_icon', ditolakPenyaring: !!largeImage && !bersih };
});

ipcMain.handle('internet:status', () => ({ allowed: internetConnectionAllowed }));
ipcMain.handle('internet:allow', (event) => ({ allowed: setInternetAllowed(true, 'editor') }));

function setupGameWindow(data) {
    currentAppMode = 'game';

    let skipScene = data.skipScene || false;
    let selectedPlaylist = data.selectedPlaylist || '';
    let selectedWallpaper = data.selectedWallpaper || '';
    internetConnectionAllowed = false;

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
        setInternetAllowed(true, 'panel Options');
    });

    // Dulu TIDAK ada handler-nya: tombol "Disconnect" di Options mengirim sinyal
    // ini, main process mengabaikannya, dan penyaring webRequest tetap terbuka.
    // Tombolnya hanya membalik flag di renderer-nya sendiri — kontrol yang
    // berbohong. Sekarang ia benar-benar menutup kembali aksesnya.
    ipcMain.on('disconnect-from-internet', () => {
        setInternetAllowed(false, 'panel Options');
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

    // Jika tombol close — lihat pasangPenjagaTutup() untuk rantai lengkap bug
    // "aplikasi tidak bisa ditutup" yang ditutup di sana.
    pasangPenjagaTutup(mainWindow, 'jendela game');

    mainWindow.loadFile('index.html');
    mainWindow.setMenu(null);
    pasangJudulVersi(mainWindow);

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
                        content: '←';
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

// play-chapter, security dialog, proceedToPlayChapter, returnToNovelHub
// sudah dipindah ke vn-engine/ipc-handlers.js & security-scanner.js


// getChapterListData + get-next-chapter sudah dipindah ke vn-engine/core.js & ipc-handlers.js

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
        if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
            hubCodeEditorWindow.close();
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

// =============================================
// Hub Code Editor (Advanced) — window terpisah
// =============================================
function openHubCodeEditorWindow(initData) {
    if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
        hubCodeEditorWindow.show();
        hubCodeEditorWindow.focus();
        hubCodeEditorWindow.webContents.send('hub-code-editor:init', initData);
        return;
    }

    const workArea = screen.getPrimaryDisplay().workArea;
    const width = Math.round(workArea.width / 2);
    const height = Math.round(workArea.height / 2);
    const x = workArea.x + workArea.width - width;
    const y = workArea.y + workArea.height - height;

    hubCodeEditorWindow = new BrowserWindow({
        width: width,
        height: height,
        x: x,
        y: y,
        minWidth: 480,
        minHeight: 360,
        title: 'Hub Code Editor — Advanced',
        icon: path.join(__dirname, 'aset', 'ikon.jpg'),
        // Selalu di atas window utama agar tidak "tenggelam" saat user mengklik
        // scene di window utama. parent: mainWindow membuatnya ikut minimize/restore
        // bersama editor utama tanpa menutupi aplikasi lain di luar editor.
        alwaysOnTop: true,
        parent: (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : undefined,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });
    hubCodeEditorWindow.setMenu(null);
    hubCodeEditorWindow.loadFile(path.join(__dirname, 'aset', 'game', 'vnManager-codeEditor.html'));

    hubCodeEditorWindow.webContents.once('did-finish-load', () => {
        if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
            hubCodeEditorWindow.webContents.send('hub-code-editor:init', initData);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('hub-code-editor:opened');
        }
    });

    // Tampilkan konfirmasi bila ada perubahan belum disimpan saat window ditutup.
    hubCodeEditorWindow.webContents.on('will-prevent-unload', (event) => {
        const choice = dialog.showMessageBoxSync(hubCodeEditorWindow, {
            type: 'question',
            buttons: ['Tutup Tanpa Menyimpan', 'Batal'],
            defaultId: 1,
            cancelId: 1,
            title: 'Perubahan Belum Disimpan',
            message: 'Ada perubahan kode hub yang belum disimpan. Tutup window ini tanpa menyimpan?'
        });
        if (choice === 0) {
            event.preventDefault();
        }
    });

    hubCodeEditorWindow.on('closed', () => {
        hubCodeEditorWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('hub-code-editor:closed');
        }
    });
}

ipcMain.on('hub-code-editor:open', (event, data) => {
    openHubCodeEditorWindow(data || {});
});

ipcMain.on('hub-code-editor:load-scene', (event, data) => {
    if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
        hubCodeEditorWindow.show();
        hubCodeEditorWindow.focus();
        hubCodeEditorWindow.webContents.send('hub-code-editor:load-scene', data);
    }
});

ipcMain.on('hub-code-editor:reload', () => {
    if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
        hubCodeEditorWindow.webContents.send('hub-code-editor:reload');
    }
});

ipcMain.on('hub-code-editor:draft-update', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hub-code-editor:draft-update', data);
    }
});

ipcMain.on('hub-code-editor:saved', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hub-code-editor:saved', data);
    }
});

ipcMain.on('hub-code-editor:close-all', () => {
    if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
        hubCodeEditorWindow.close();
    }
});

// Sebelum mutasi hub.html sisi main window (tambah/hapus scene), simpan dulu
// editan yang masih dirty di window Hub Code Editor (bila terbuka).
ipcMain.handle('hub-code-editor:flush-if-dirty', async () => {
    try {
        if (hubCodeEditorWindow && !hubCodeEditorWindow.isDestroyed()) {
            const saved = await hubCodeEditorWindow.webContents.executeJavaScript(
                '(window.VNCodeEditor && window.VNCodeEditor.isDirty() ? window.VNCodeEditor.save() : Promise.resolve(true))'
            );
            if (saved !== true) {
                return { success: false, message: 'Draft Hub Code Editor gagal disimpan.' };
            }
        }
        return { success: true, dirty: false };
    } catch (error) {
        console.error('[HubCodeEditor] Gagal flush draft:', error);
        return { success: false, message: error.message };
    }
});

ipcMain.on('hub-code-editor:dirty-state', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hub-code-editor:dirty-state', data);
    }
});

// =============================================
// Novel CRUD, Hub Config, dan Asset handlers
// sudah dipindah ke modul terpisah:
// - vn-engine/novel-crud.js
// - vn-engine/hub-config-manager.js
// - vn-engine/asset-manager.js
// Diregistrasi melalui vn-engine/index.js → initVNEngine()
// =============================================

// 4) Handler untuk mengambil daftar chapter di satu story
ipcMain.handle('get-chapter-list', async (event, storyTitle) => {
    return vnEngine.core.getChapterListData(storyTitle);
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

// ---------------------------------------
// End Visual Novel
// ---------------------------------------

ipcMain.on('set-rpc-enabled', (event, enabled) => {
    // Jika status sama, tidak perlu lakukan apa-apa
    if (isRpcEnabled === enabled) {
        console.log(`[RPC] Status sudah ${enabled ? 'aktif' : 'nonaktif'}, skip toggle.`);
        return;
    }

    console.log(`[RPC] Mengubah fitur dari ${isRpcEnabled} ke ${enabled}`);
    
    userSettings.rpcEnabled = enabled;
    scheduleSaveUserSettings();

    if (enabled) {
        // Aktifkan RPC - set flag dulu baru init
        isRpcEnabled = true;
        initRPC();
    } else {
        // Nonaktifkan RPC - destroyRPC akan set isRpcEnabled = false
        destroyRPC(true);
    }
    
    console.log(`[RPC] Fitur sekarang: ${isRpcEnabled}`);
});

app.on('before-quit', () => {
    console.log('[App] Aplikasi akan keluar, membersihkan resource...');

    // Flush posisi/ukuran overlay terbaru ke disk sebelum window dihancurkan.
    // Tangkap bounds dari window yang masih hidup, lalu tulis sinkron (lewati debounce)
    // agar geser/resize tepat sebelum quit tidak hilang.
    try {
        updateGifOverlaysInMemory({ preserveWhenNoWindows: true });
        flushUserSettingsToDisk();
    } catch (e) {
        console.error('[App] Gagal flush user settings saat before-quit:', e);
    }

    if (snowWindow) {
        snowWindow.destroy();
    }
    if (miniPlayerWindow) {
        miniPlayerWindow.destroy();
    }
    if (adSkipperWindow) {
        adSkipperWindow.destroy();
    }

    // Bersihkan Discord RPC - destroyRPC akan handle semua cleanup
    destroyRPC(true);
});

// Tambahan: Pastikan RPC dibersihkan saat semua window ditutup
app.on('window-all-closed', () => {
    console.log('[App] Semua window ditutup, membersihkan Discord RPC...');
    
    // Bersihkan retry interval jika ada
    if (rpcRetryInterval) {
        clearInterval(rpcRetryInterval);
        rpcRetryInterval = null;
    }
    
    // Reset flag status
    isRpcEnabled = false;
    isRpcReady = false;
    isRpcConnecting = false;
    
    // Bersihkan RPC instance
    if (rpc) {
        try {
            rpc.removeAllListeners();
            rpc.clearActivity().catch(() => {});
            rpc.destroy().catch(() => {});
        } catch (err) {
            // Ignore error saat cleanup
        }
        rpc = null;
        console.log('[RPC] Discord RPC cleanup selesai saat window-all-closed.');
    }
    
    // Pada Windows, aplikasi biasanya keluar saat semua window ditutup
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
