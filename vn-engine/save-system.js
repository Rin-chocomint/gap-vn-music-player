// =============================================
// Rin.js — Save/Load System
// Manajemen save slot dan load game
// =============================================

const path = require('path');
const fs = require('fs');
const engineCore = require('./core');
const { normalizeScript } = require('./schema-validator');
const previewManager = require('./preview-manager');
const { resolvePlayerSource } = require('./player-source-resolver');
const storyCarry = require('./story-carry');

/**
 * Save lama sering hanya membawa sebagian state. Lengkapi carry-state melalui
 * factory canonical tanpa membuang field runtime lain (variables, callStack,
 * pendingJump, dan field extension) yang sudah ada di save.
 */
function normalizeLoadedState(seed) {
    const original = seed && typeof seed === 'object' && !Array.isArray(seed) ? seed : {};
    // Save versi awal memakai `bgmState`; carry canonical sekarang memakai
    // `lastBgmState`. Jembatani sekali saat load agar musik tidak hilang, tetapi
    // pertahankan bgmState asli untuk kompatibilitas pembaca lama.
    const carrySeed = (!original.lastBgmState && original.bgmState)
        ? { ...original, lastBgmState: original.bgmState }
        : original;
    return {
        ...original,
        ...storyCarry.stateAwal(carrySeed),
        variables: original.variables && typeof original.variables === 'object' && !Array.isArray(original.variables)
            ? { ...original.variables }
            : {},
        callStack: Array.isArray(original.callStack) ? [...original.callStack] : []
    };
}

/**
 * Resolver tunggal resource saat load. Urutannya harus identik dengan new game:
 * chapter player -> novel player -> engine global, dan script mengikuti bahasa
 * aplikasi aktif dengan fallback ke script.json.
 */
function resolveSavedChapterResources(state, options = {}) {
    const root = options.root || path.dirname(__dirname);
    const novelPath = path.join(root, 'aset', 'game', 'visual_novels', state.currentStoryTitle);
    const chapterPath = path.join(novelPath, state.currentChapter);
    const globalPlayerPath = path.join(root, 'vn-player', 'player.html');
    const language = options.language === undefined ? engineCore.getLanguage() : options.language;
    return {
        root,
        novelPath,
        chapterPath,
        globalPlayerPath,
        source: resolvePlayerSource(chapterPath, globalPlayerPath, novelPath),
        scriptPath: engineCore.resolveLocalizedScriptPath(chapterPath, language)
    };
}

/**
 * Muat player yang sesuai untuk chapter dari sebuah save, lalu kirim context.
 * Player-source-aware: jika chapter punya player.html custom → muat itu + bridge
 * VNPlayer + `set-player-context` (termasuk savedState dari save). Selain itu →
 * player global + `set-chapter-context` (engine server-side menggerakkan tampilan).
 */
function loadPlayerForChapter(mainWindow, state, saveData, options = {}) {
    if (!mainWindow) return;
    const resources = options.resources || resolveSavedChapterResources(state, options);
    const { root, chapterPath, novelPath, globalPlayerPath, source, scriptPath } = resources;
    engineCore.setPlayerAuthorityMode(source.useBridge ? 'legacy-custom' : 'engine');
    const basePathNorm = chapterPath.replace(/\\/g, '/');
    const novelPathNorm = novelPath.replace(/\\/g, '/');
    const savedState = (saveData && saveData.playerPreferences) || null;

    if (source.useBridge) {
        mainWindow.loadFile(source.filePath);
        mainWindow.webContents.once('did-finish-load', () => {
            try {
                const bridgeCode = fs.readFileSync(path.join(root, 'vn-player', 'js', 'vn-player-api.js'), 'utf-8');
                mainWindow.webContents.executeJavaScript(bridgeCode).then(() => {
                    let script = [];
                    try { script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8')); } catch (e) { /* biarkan kosong */ }
                    mainWindow.webContents.send('vn-engine:set-player-context', {
                        storyTitle: state.currentStoryTitle,
                        chapter: state.currentChapter,
                        basePath: basePathNorm,
                        novelPath: novelPathNorm,
                        script: script,
                        savedState: savedState
                    });
                }).catch(() => {});
            } catch (e) {
                console.error('[Save System] Gagal inject VNPlayer bridge saat load:', e);
            }
        });
        return;
    }

    const isShim = source.kind === 'engine-shim';
    mainWindow.loadFile(isShim ? source.filePath : globalPlayerPath);
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('vn-engine:set-chapter-context', {
            storyTitle: state.currentStoryTitle,
            chapter: state.currentChapter,
            basePath: basePathNorm,
            novelPath: novelPathNorm,
            enginePath: path.join(root, 'vn-player'),
            playerPreferences: savedState
        });
    });
}

/** Baca dan validasi resource terlebih dahulu; state hidup baru diganti setelah sukses. */
function restoreEngineStateFromSave(saveData, options = {}) {
    const pendingState = {
        currentStoryTitle: saveData.storyTitle,
        currentChapter: saveData.chapter
    };
    const resources = resolveSavedChapterResources(pendingState, options);
    const parsedScript = JSON.parse(fs.readFileSync(resources.scriptPath, 'utf-8'));
    const currentVNScript = normalizeScript(parsedScript);

    engineCore.setState({
        currentStoryTitle: saveData.storyTitle,
        currentChapter: saveData.chapter,
        currentVNIndex: saveData.index,
        vnDialogueHistory: Array.isArray(saveData.history) ? saveData.history : [],
        currentVNState: normalizeLoadedState(saveData.state),
        currentVNScript
    });

    return { state: engineCore.getState(), resources };
}

// getMainWindow akan diterima via parameter, hindari circular dependency
let _getMainWindow = () => null;

// Save queue untuk mencegah concurrent writes
let _saveQueue = Promise.resolve();
const MAX_SAVE_SLOT = 99;
const ENGINE_VERSION = '0.0.9';

function queueSaveOperation(fn) {
    _saveQueue = _saveQueue.then(fn).catch(err => {
        console.error('[Save System] Queued operation failed:', err);
    });
    return _saveQueue;
}

function registerHandlers(ipcMain, getMainWindow) {
    _getMainWindow = getMainWindow;
    // Simpan game ke slot
    ipcMain.on('vn-engine:save-game', (event, { slotId, previewType, previewImage, playerPreferences }) => {
        // Blokir save saat dalam mode preview chapter
        if (previewManager.isInChapterPreviewMode()) {
            console.warn('[Save System] Save diblokir: sedang dalam chapter preview mode.');
            event.sender.send('vn-engine:save-error', { slotId, error: 'Tidak bisa menyimpan saat preview.' });
            return;
        }

        // Validasi slotId
        const numSlot = parseInt(slotId);
        if (isNaN(numSlot) || numSlot < 0 || numSlot > MAX_SAVE_SLOT) {
            console.error(`[Save System] SlotId tidak valid: ${slotId}`);
            event.sender.send('vn-engine:save-error', { slotId, error: 'Slot ID tidak valid (0-99).' });
            return;
        }

        const { currentStoryTitle, currentChapter, currentVNIndex, vnDialogueHistory, currentVNState } = engineCore.getState();
        if (!currentStoryTitle || !currentChapter) return;

        queueSaveOperation(() => {
            const saveDir = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', currentStoryTitle, 'saves');
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }

            const savePath = path.join(saveDir, `save_slot_${numSlot}.json`);
            const saveData = {
                engineVersion: ENGINE_VERSION,
                storyTitle: currentStoryTitle,
                chapter: currentChapter,
                index: currentVNIndex,
                history: vnDialogueHistory,
                state: currentVNState,
                timestamp: new Date().toISOString(),
                previewType: previewType || 'image',
                previewImage: previewImage || '',
                playerPreferences: playerPreferences || null
            };

            try {
                // Write ke temp file dulu, lalu rename (atomic write)
                const tmpPath = savePath + '.tmp';
                fs.writeFileSync(tmpPath, JSON.stringify(saveData, null, 2));
                fs.renameSync(tmpPath, savePath);
                console.log(`[Save System] Game disimpan ke ${savePath}`);
                event.sender.send('vn-engine:save-success', numSlot);
            } catch (err) {
                console.error('[Save System] Gagal menyimpan game:', err);
                event.sender.send('vn-engine:save-error', { slotId: numSlot, error: err.message });
            }
        });
    });

    // Load game dari slot (in-game)
    ipcMain.on('vn-engine:load-game', (event, { slotId }) => {
        const { currentStoryTitle } = engineCore.getState();
        if (!currentStoryTitle) {
            event.sender.send('vn-engine:load-error', { slotId, error: 'Tidak ada novel yang aktif.' });
            return;
        }

        const savePath = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', currentStoryTitle, 'saves', `save_slot_${slotId}.json`);

        if (!fs.existsSync(savePath)) {
            console.log('[Save System] File save tidak ditemukan.');
            event.sender.send('vn-engine:load-error', { slotId, error: 'File save tidak ditemukan.' });
            return;
        }

        try {
            const rawContent = fs.readFileSync(savePath, 'utf-8');
            let saveData;
            try {
                saveData = JSON.parse(rawContent);
            } catch (parseErr) {
                console.error('[Save System] File save corrupt (JSON invalid):', parseErr);
                event.sender.send('vn-engine:load-error', { slotId, error: 'File save rusak. Data tidak bisa dibaca.' });
                return;
            }

            // Validasi minimal struktur save data
            if (!saveData.storyTitle || !saveData.chapter || saveData.index == null) {
                event.sender.send('vn-engine:load-error', { slotId, error: 'File save tidak lengkap — data kritis hilang.' });
                return;
            }

            const restored = restoreEngineStateFromSave(saveData);
            const state = restored.state;
            console.log(`[Save System] Load game: ${state.currentStoryTitle} - ${state.currentChapter} at index ${state.currentVNIndex}`);

            // Player-source-aware: custom player (player.html) atau global.
            loadPlayerForChapter(_getMainWindow(), state, saveData, { resources: restored.resources });

        } catch (err) {
            console.error('[Save System] Gagal load game:', err);
            event.sender.send('vn-engine:load-error', { slotId, error: 'Gagal memuat save: ' + err.message });
        }
    });

    // Load game dari novel hub
    ipcMain.on('vn-engine:load-game-from-hub', (event, { storyTitle, slotId }) => {
        const savePath = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', storyTitle, 'saves', `save_slot_${slotId}.json`);
        if (!fs.existsSync(savePath)) {
            event.sender.send('vn-engine:load-error', { slotId, error: 'File save tidak ditemukan.' });
            return;
        }

        try {
            const rawContent = fs.readFileSync(savePath, 'utf-8');
            let saveData;
            try {
                saveData = JSON.parse(rawContent);
            } catch (parseErr) {
                event.sender.send('vn-engine:load-error', { slotId, error: 'File save rusak.' });
                return;
            }

            if (!saveData.storyTitle || !saveData.chapter || saveData.index == null) {
                event.sender.send('vn-engine:load-error', { slotId, error: 'File save tidak lengkap.' });
                return;
            }

            const restored = restoreEngineStateFromSave(saveData);
            const state = restored.state;
            console.log(`[Save System] Load dari hub: ${state.currentStoryTitle} - ${state.currentChapter}`);

            // Player-source-aware: custom player (player.html) atau global.
            loadPlayerForChapter(_getMainWindow(), state, saveData, { resources: restored.resources });
        } catch (err) {
            console.error('[Save System] Gagal load dari hub:', err);
            event.sender.send('vn-engine:load-error', { slotId, error: 'Gagal memuat save: ' + err.message });
        }
    });

    // Ambil daftar save slots
    ipcMain.handle('vn-engine:get-save-slots', (event, storyTitle) => {
        const state = engineCore.getState();
        const targetTitle = storyTitle || state.currentStoryTitle;
        if (!targetTitle) return [];

        const saveDir = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', targetTitle, 'saves');
        if (!fs.existsSync(saveDir)) return [];

        const slots = [];
        const files = fs.readdirSync(saveDir).filter(f => f.startsWith('save_slot_') && f.endsWith('.json'));

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(saveDir, file), 'utf-8');
                const data = JSON.parse(content);
                const slotId = parseInt(file.replace('save_slot_', '').replace('.json', ''));

                let previewImage = null;
                let previewType = 'image';

                if (data.state && data.state.backgroundStack && data.state.backgroundStack.length > 0) {
                    const lastBg = data.state.backgroundStack[data.state.backgroundStack.length - 1];
                    if (lastBg && lastBg.src) {
                        previewImage = lastBg.src;
                        if (lastBg.type) {
                            previewType = lastBg.type;
                        } else {
                            const lowerSrc = lastBg.src.toLowerCase();
                            if (lowerSrc.endsWith('.mp4') || lowerSrc.endsWith('.webm')) {
                                previewType = 'video';
                            }
                        }
                    }
                }

                slots.push({
                    slotId: slotId,
                    timestamp: data.timestamp,
                    chapter: data.chapter,
                    previewImage: previewImage,
                    previewType: previewType,
                    storyTitle: data.storyTitle
                });
            } catch (e) {
                console.error('Error membaca save slot', file, e);
            }
        }
        return slots.sort((a, b) => a.slotId - b.slotId);
    });

    // Hapus satu save slot (2026-07-10, findings §9/§11 — dulu tak ada API-nya:
    // pola "hapus save" ala meta-mechanic maupun tombol hapus slot di hub custom
    // tidak mungkin tanpa menyentuh file langsung).
    ipcMain.handle('vn-engine:delete-save-slot', (event, { storyTitle, slotId }) => {
        try {
            const state = engineCore.getState();
            const targetTitle = storyTitle || state.currentStoryTitle;
            const numSlot = parseInt(slotId);
            if (!targetTitle || Number.isNaN(numSlot)) return { success: false, error: 'storyTitle/slotId tidak valid' };
            const baseDir = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels');
            const savePath = path.join(baseDir, targetTitle, 'saves', `save_slot_${numSlot}.json`);
            // anti path-traversal: hasil join harus tetap di dalam folder visual_novels
            if (!path.resolve(savePath).startsWith(path.resolve(baseDir))) {
                return { success: false, error: 'path tidak valid' };
            }
            if (!fs.existsSync(savePath)) return { success: false, error: 'slot tidak ada' };
            fs.unlinkSync(savePath);
            console.log(`[Save System] Slot ${numSlot} (${targetTitle}) dihapus.`);
            return { success: true };
        } catch (err) {
            console.error('[Save System] Gagal hapus slot:', err);
            return { success: false, error: err.message };
        }
    });
}

module.exports = {
    registerHandlers,
    loadPlayerForChapter,
    normalizeLoadedState,
    resolveSavedChapterResources,
    restoreEngineStateFromSave
};
