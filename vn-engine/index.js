// =============================================
// Rin.js — VN Engine Entry Point
// Inisialisasi dan registrasi semua modul engine
// =============================================

const engineCore = require('./core');
const ipcHandlers = require('./ipc-handlers');
const saveSystem = require('./save-system');
const previewManager = require('./preview-manager');
const novelCrud = require('./novel-crud');
const hubConfigManager = require('./hub-config-manager');
const assetManager = require('./asset-manager');
const achievementManager = require('./achievement-manager');
const novelFont = require('./novel-font');
const diagnostics = require('./diagnostics');

/**
 * Inisialisasi VN engine
 * @param {object} deps - Dependencies dari main.js
 * @param {function} deps.getMainWindow - Fungsi getter mainWindow
 * @param {object} deps.ipcMain - Modul ipcMain electron  
 * @param {string} deps.visualNovelsDirectory - Path ke folder visual_novels
 * @param {string} deps.appDir - __dirname dari main.js (root app)
 * @param {function} deps.updateRpcActivity - Update Discord RPC (opsional)
 * @param {object} deps.presence - Pemilik judul jendela & status Discord (opsional)
 * @param {object} deps.versionsManifest - Manifest versi (opsional)
 */
function initVNEngine(deps) {
    const { getMainWindow, ipcMain, visualNovelsDirectory, appDir, updateRpcActivity, presence, versionsManifest } = deps;

    // Init engine core dengan getter mainWindow dan directory
    engineCore.init(getMainWindow, visualNovelsDirectory);

    // Progres dalam chapter → status Discord. Disambungkan di sini, bukan di
    // dalam core, supaya core tetap tidak tahu apa-apa soal Discord dan tetap
    // bisa dimuat unit test tanpa rantai kehadiran.
    if (presence) {
        engineCore.setProgressReporter(({ index, total }) => {
            if (!Number.isFinite(total) || total <= 0) return;
            presence.set({ persen: Math.round((index / total) * 100) });
        });
    }

    // Registrasi IPC handlers (engine runtime: play, choice, jump, dll)
    ipcHandlers.registerHandlers({
        getMainWindow,
        visualNovelsDirectory,
        updateRpcActivity: updateRpcActivity || (() => {}),
        presence: presence || null,
        versionsManifest: versionsManifest || {}
    });

    // Registrasi save system handlers (getMainWindow untuk load game)
    saveSystem.registerHandlers(ipcMain, getMainWindow);

    // Registrasi preview manager handlers.
    // `identitas` disuntik supaya jendela pratinjau memakai perakit judul yang
    // sama dengan jendela utama, bukan `document.title` milik player.
    previewManager.registerHandlers({ identitas: deps.identitas || (() => ({})) });

    // Registrasi novel CRUD handlers (create, read, update, delete novel/chapter/script)
    novelCrud.registerHandlers({
        ipcMain,
        visualNovelsDirectory,
        appDir: appDir || require('path').dirname(__dirname),
        getMainWindow
    });

    // Registrasi hub config manager handlers (hub config read/write, custom files, gallery)
    hubConfigManager.registerHandlers({
        ipcMain,
        visualNovelsDirectory,
        getMainWindow
    });

    // Registrasi asset manager handlers (file dialog, asset CRUD)
    assetManager.registerHandlers({
        ipcMain,
        visualNovelsDirectory,
        getMainWindow
    });

    // Registrasi achievement manager (achievements.json + state, unlock/list/sweep)
    achievementManager.registerHandlers({
        ipcMain,
        visualNovelsDirectory
    });

    // Registrasi font global novel (novel-font.css: dipakai Hub DAN Player).
    // `dialog` disuntik, bukan di-require modulnya sendiri, supaya modul ini
    // tetap bisa dimuat unit test tanpa Electron.
    novelFont.registerHandlers({
        ipcMain,
        visualNovelsDirectory,
        getMainWindow,
        dialog: deps.dialog || require('electron').dialog
    });

    // UX-B07 — kejadian tingkat-proses (crash/unresponsive/preload). Hidup di MAIN
    // karena renderer yang mati tak bisa melaporkan kematiannya sendiri.
    // `app` opsional supaya pemanggil lama (test) tetap bisa init tanpanya.
    if (deps.app) diagnostics.registerHandlers({ ipcMain, app: deps.app });

    console.log('[VN Engine] Rin.js engine berhasil diinisialisasi.');
}

module.exports = {
    initVNEngine,
    // Re-export sub-modul untuk akses langsung jika dibutuhkan
    core: engineCore,
    preview: previewManager,
    novelFont,
    diagnostics,
    security: require('./security-scanner'),
    extensionValidator: require('./extension-validator')
};
