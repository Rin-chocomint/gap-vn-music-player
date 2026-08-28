// =============================================
// Rin.js — IPC Handlers
// Registrasi semua IPC handler untuk VN engine
// =============================================

const path = require('path');
const fs = require('fs');
const { ipcMain, dialog, shell } = require('electron');
const engineCore = require('./core');
const securityScanner = require('./security-scanner');
const extensionValidator = require('./extension-validator');
const previewManager = require('./preview-manager');
const { resolveHubSource } = require('./hub-source-resolver');
const hubScaffolder = require('./hub-scaffolder');
const targetViewport = require('./target-viewport');
const hostViewport = require('./host-viewport');
const novelRpc = require('./novel-rpc');
const { resolveEffectiveThemeFiles, toVersionedFileUrl } = require('./player-theme-resolver');

// State tracking untuk permission internet per-novel
let novelSecurityPermissions = {};

// Chapter terakhir yang dimainkan — dipakai untuk memberi tahu hub bahwa pemain
// BARU SAJA kembali dari chapter (lifecycle onChapterReturn di VNHub). Diset saat
// chapter mulai, dikonsumsi & dibersihkan saat kembali ke hub.
let _lastPlayed = null;

// Disimpan saat registerHandlers supaya `returnToNovelHub` — yang hidup di luar
// closure itu — bisa ikut memperbarui Discord RPC. Tanpa ini, RPC hanya berubah
// saat chapter DIMULAI: pemain yang sedang berada di Hub novel akan melihat
// status chapter terakhir yang sudah ia tinggalkan, dan gambar novel tak pernah
// tampil bagi pemain yang belum menekan Mulai.
let _updateRpc = null;
let _visualNovelsDir = null;

/** Gambar RPC milik sebuah novel, atau undefined bila tidak diatur. */
function _gambarRpcNovel(storyTitle) {
    try {
        if (!_visualNovelsDir) return undefined;
        const safe = String(storyTitle || '').replace(/[\\/]/g, '');
        if (!safe) return undefined;
        return novelRpc.dariNovel(path.join(_visualNovelsDir, safe)).largeImage || undefined;
    } catch (e) {
        // Gambar RPC tak boleh jadi alasan novel gagal dibuka.
        return undefined;
    }
}

// Helper: validasi path tetap di dalam direktori yang diizinkan.
// Implementasi tunggal di path-utils.js — dipakai juga novel-crud.js &
// hub-config-manager.js (audit K1/K2/K5).
const { isPathSafe, resolveNovelChapterPath } = require('./path-utils');

// Helper: sanitize nama yang akan digunakan sebagai komponen path
function sanitizePathComponent(name) {
    if (!name || typeof name !== 'string') return '';
    return name.replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/^\.\.?$/, '_').replace(/\.\./g, '_');
}

/**
 * Registrasi semua IPC handler VN engine
 * @param {object} deps - Dependencies dari main.js
 * @param {function} deps.getMainWindow - Fungsi untuk ambil mainWindow
 * @param {string} deps.visualNovelsDirectory - Path ke folder visual_novels
 * @param {function} deps.updateRpcActivity - Fungsi update Discord RPC
 * @param {object} deps.versionsManifest - Manifest versi & security
 */
function registerHandlers(deps) {
    const { getMainWindow, visualNovelsDirectory, updateRpcActivity, versionsManifest } = deps;
    _updateRpc = updateRpcActivity || null;
    _visualNovelsDir = visualNovelsDirectory || null;
    const trustedDomains = versionsManifest?.security?.trustedDomains || [];

    // ---- Security scan IPC ----
    ipcMain.handle('security:scan-novel', async (event, { storyTitle, chapter }) => {
        const safeTitle = sanitizePathComponent(storyTitle);
        const safeChapter = sanitizePathComponent(chapter);
        const novelPath = path.join(visualNovelsDirectory, safeTitle);
        const scriptPath = path.join(novelPath, safeChapter, 'script.json');

        if (!isPathSafe(scriptPath, visualNovelsDirectory)) {
            console.warn(`[Security] BLOCKED: Novel scan path traversal attempt`);
            return { storyTitle, chapter, hasSecurityConcerns: true, error: 'invalid-path' };
        }

        console.log(`[Security] Scanning novel: ${safeTitle} / ${safeChapter}`);
        const scriptWarnings = securityScanner.scanNovelScript(scriptPath, trustedDomains);
        const folderWarnings = securityScanner.scanNovelFolder(novelPath, trustedDomains);

        const result = {
            storyTitle,
            chapter,
            hasSecurityConcerns: scriptWarnings.hasCustomJs ||
                scriptWarnings.hasDangerousCode ||
                scriptWarnings.hasExternalUrls ||
                folderWarnings.externalResources.length > 0,
            script: scriptWarnings,
            folder: folderWarnings,
            timestamp: new Date().toISOString()
        };

        console.log('[Security] Scan result:', JSON.stringify(result, null, 2));
        return result;
    });

    ipcMain.handle('security:get-novel-permission', async (event, { storyTitle, chapter }) => {
        const novelKey = `${storyTitle}::${chapter}`;
        return novelSecurityPermissions[novelKey] || { allowInternet: true };
    });

    // ---- Lint aset — cek keberadaan sprite/background/bgm/sfx/voice yang dirujuk script ----
    // Dipanggil editor (editorToolbar.js) setelah save, melengkapi lint jump/label yang
    // sudah ada (yang tidak menyentuh keberadaan file aset sama sekali).
    ipcMain.handle('lint-novel-assets', async (event, { storyTitle, chapter, scriptData }) => {
        try {
            const safeTitle = sanitizePathComponent(storyTitle);
            const safeChapter = sanitizePathComponent(chapter);
            const chapterPath = path.join(visualNovelsDirectory, safeTitle, safeChapter);
            if (!isPathSafe(chapterPath, visualNovelsDirectory)) {
                return { success: false, missing: [], message: 'Path tidak valid.' };
            }
            const missing = securityScanner.lintScriptAssets(chapterPath, scriptData);
            return { success: true, missing };
        } catch (error) {
            console.error('[Lint] Gagal mengecek aset:', error);
            return { success: false, missing: [], message: error.message };
        }
    });

    // ---- Extension Manifest & Safety  ----

    /**
     * Validasi extension.json manifest
     * Dipanggil dari extension-loader.js di renderer
     */
    ipcMain.handle('security:validate-extension-manifest', async (event, { manifestPath }) => {
        // Path traversal protection: validate path stays within visual_novels
        if (!isPathSafe(manifestPath, visualNovelsDirectory)) {
            console.warn(`[Security] BLOCKED: Extension manifest path traversal attempt: ${manifestPath}`);
            return { valid: false, manifest: null, errors: ['Path tidak valid: di luar direktori novel.'] };
        }
        console.log(`[Security] Validating extension manifest: ${manifestPath}`);
        return extensionValidator.validateManifest(manifestPath);
    });

    /**
     * Scan file JS extension untuk kode berbahaya
     * Dipanggil dari extension-loader.js di renderer
     */
    ipcMain.handle('security:scan-extension-file', async (event, { filePath, permissions }) => {
        // Path traversal protection
        if (!isPathSafe(filePath, visualNovelsDirectory)) {
            console.warn(`[Security] BLOCKED: Extension file path traversal attempt: ${filePath}`);
            return { clean: false, risk: 'blocked', reasons: ['Path tidak valid: di luar direktori novel.'], violations: [], warnings: [] };
        }
        console.log(`[Security] Scanning extension file: ${path.basename(filePath)}`);

        const scanResult = extensionValidator.scanExtensionCode(filePath, permissions || []);
        const fakeManifest = { permissions: permissions || [] };
        const risk = extensionValidator.assessExtensionRisk(fakeManifest, scanResult);

        return {
            clean: scanResult.clean,
            risk: risk.level,
            reasons: risk.reasons,
            violations: scanResult.violations,
            warnings: scanResult.warnings
        };
    });

    /**
     * Minta approval user untuk extension dengan permission berbahaya
     * Tampilkan dialog dengan detail permission yang diminta
     */
    ipcMain.handle('security:approve-extension', async (event, { name, version, author, description, dangerousPermissions }) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;

        const permLabels = {
            ipc: 'IPC (komunikasi ke main process)',
            fs: 'Filesystem (baca/tulis file)',
            network: 'Network (akses internet)'
        };

        const permList = dangerousPermissions
            .map(p => `  • ${permLabels[p] || p}`)
            .join('\n');

        const detail = `Extension "${name}" v${version} oleh ${author}\n` +
            (description ? `${description}\n\n` : '\n') +
            `Meminta permission sensitif:\n${permList}\n\n` +
            `Permission ini memberikan akses yang bisa berbahaya.\n` +
            `Pastikan kamu mempercayai pembuat extension ini.`;

        const result = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: '⚡ Extension Permission',
            message: `Extension meminta permission sensitif`,
            detail,
            buttons: ['Izinkan', 'Tolak'],
            defaultId: 1,
            cancelId: 1,
            noLink: true
        });

        const approved = result.response === 0;
        console.log(`[Security] Extension "${name}" ${approved ? 'DIIZINKAN' : 'DITOLAK'} oleh user`);
        return approved;
    });

    /**
     * Validasi semua extension untuk satu novel (novel + semua chapter)
     * Dipanggil dari hub atau sebelum play
     */
    ipcMain.handle('security:validate-novel-extensions', async (event, { storyTitle }) => {
        const novelPath = path.join(visualNovelsDirectory, storyTitle);
        console.log(`[Security] Validating all extensions for novel: ${storyTitle}`);
        return extensionValidator.validateNovelExtensions(novelPath);
    });

    // ---- Play Chapter ----
    // Satu pipeline canonical untuk SEMUA pintu masuk chapter. Hub/custom player
    // mengirim `play-chapter`; tombol ending mengirim intent
    // `vn-engine:play-next-chapter` dan main process me-resolve targetnya sebelum
    // masuk ke fungsi yang sama. Dengan begitu security scan, permission, RPC,
    // lifecycle Hub, serta resolver global/engine-shim/custom tidak bercabang.
    const playChapterCanonical = async (storyTitle, chapter) => {
        const mainWindow = getMainWindow();
        if (!mainWindow) return false;

        if (!storyTitle || !chapter) {
            console.error('[VN Engine] Play chapter ditolak: story/chapter tidak valid.');
            dialog.showErrorBox('Gagal Membuka Chapter', 'Novel atau chapter tujuan tidak valid.');
            return false;
        }

        console.log(`[Security] Memulai security scan: ${storyTitle} / ${chapter}`);

        const novelPath = path.join(visualNovelsDirectory, storyTitle);
        const scriptPath = path.join(novelPath, chapter, 'script.json');

        const scriptWarnings = securityScanner.scanNovelScript(scriptPath, trustedDomains);
        const folderWarnings = securityScanner.scanNovelFolder(novelPath, trustedDomains);

        // Scan extension files juga
        const novelExtDir = path.join(novelPath, 'extensions');
        const chapterExtDir = path.join(novelPath, chapter, 'extensions');
        const novelExtScan = securityScanner.scanExtensionsFolder(novelExtDir, trustedDomains);
        const chapterExtScan = securityScanner.scanExtensionsFolder(chapterExtDir, trustedDomains);
        const hasExtensionConcerns = novelExtScan.hasAnyDangerousCode || chapterExtScan.hasAnyDangerousCode ||
            novelExtScan.hasAnyExternalUrls || chapterExtScan.hasAnyExternalUrls;

        const scanResult = {
            storyTitle,
            chapter,
            hasSecurityConcerns: scriptWarnings.hasCustomJs ||
                scriptWarnings.hasDangerousCode ||
                scriptWarnings.hasExternalUrls ||
                folderWarnings.externalResources.length > 0 ||
                hasExtensionConcerns,
            script: scriptWarnings,
            folder: folderWarnings,
            extensions: { novel: novelExtScan, chapter: chapterExtScan }
        };

        console.log('[Security] Scan selesai:', scanResult.hasSecurityConcerns ? 'ADA MASALAH' : 'BERSIH');

        if (scanResult.hasSecurityConcerns) {
            const novelInfo = securityScanner.readNovelMetadata(storyTitle, visualNovelsDirectory);
            const message = securityScanner.buildWarningMessage(scanResult, novelInfo);

            const hasExternalUrls = scriptWarnings.hasExternalUrls || folderWarnings.externalResources.length > 0;
            let buttons = ['Lanjutkan Tetap', 'Batalkan'];
            if (hasExternalUrls) {
                buttons = ['Izinkan Akses Internet', 'Jalankan Tanpa Internet', 'Batalkan'];
            }

            const result = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                title: '⚠️ Peringatan Keamanan Novel',
                message: `Peringatan Keamanan`,
                detail: message,
                buttons: buttons,
                defaultId: buttons.length - 1,
                cancelId: buttons.length - 1,
                noLink: true
            });

            const userDecision = {
                proceed: result.response !== buttons.length - 1,
                allowInternet: hasExternalUrls ? result.response === 0 : true
            };

            if (userDecision.proceed) {
                console.log(`[Security] User melanjutkan. Akses internet: ${userDecision.allowInternet}`);
                startPlayChapter(storyTitle, chapter, userDecision.allowInternet, deps);
                return true;
            } else {
                console.log('[Security] User membatalkan. Kembali ke hub.');
                returnToNovelHub(storyTitle, mainWindow);
                return false;
            }
        } else {
            startPlayChapter(storyTitle, chapter, true, deps);
            return true;
        }
    };

    ipcMain.on('play-chapter', async (event, { storyTitle, chapter } = {}) => {
        await playChapterCanonical(storyTitle, chapter);
    });

    // Tombol ending hanya menyatakan intent. Target selalu diambil dari state
    // engine + resolver canonical agar payload renderer tidak dapat memilih target
    // lain, urutan manifest dihormati, side story tidak tersisip, dan chapter
    // terakhir/terkunci tidak membuka chapter apa pun.
    ipcMain.on('vn-engine:play-next-chapter', async () => {
        if (previewManager.isInPreviewMode() || previewManager.isInChapterPreviewMode()) {
            console.log('[VN Engine] Play next chapter diabaikan selama preview.');
            return;
        }

        const nextChapter = engineCore.getNextChapterSync();
        if (!nextChapter) {
            console.log('[VN Engine] Tidak ada chapter berikutnya yang dapat dimainkan.');
            return;
        }

        const { currentStoryTitle } = engineCore.getState();
        await playChapterCanonical(currentStoryTitle, nextChapter);
    });

    // ---- Engine Ready ----
    ipcMain.on('vn-engine:ready', () => {
        console.log('[VN Engine] Renderer siap. Mengirim baris pertama.');
        if (previewManager.isInPreviewMode()) {
            previewManager.getProcessPreviewLabelUpdate()();
        } else {
            engineCore.processAndSendVNUpdate();
        }
    });

    // ---- Request Next Line ----
    ipcMain.on('vn-engine:request-next-line', () => {
        if (previewManager.isInPreviewMode()) {
            const state = engineCore.getState();
            if (state.currentVNState.pendingJump) {
                const target = state.currentVNState.pendingJump;
                delete state.currentVNState.pendingJump;
                engineCore.commitChoiceTarget(target);
            } else {
                engineCore.incrementIndex();
            }
            previewManager.getProcessPreviewLabelUpdate()();
            return;
        }

        const state = engineCore.getState();
        if (state.currentVNState.pendingJump) {
            const target = state.currentVNState.pendingJump;
            delete state.currentVNState.pendingJump;
            engineCore.commitChoiceTarget(target);
        } else {
            engineCore.incrementIndex();
        }
        engineCore.processAndSendVNUpdate();
    });

    // ---- Set Variable (dari custom command / minigame) ----
    // Membiarkan command kustom menaruh hasilnya (skor minigame, kata pilihan,
    // teks bebas) langsung ke variabel cerita HIDUP, sehingga dialog berikutnya
    // bisa menginterpolasinya lewat {nama}. Ini jalur yang benar untuk aliran
    // minigame→cerita DALAM chapter yang sama: tanpa round-trip berkas
    // (hub-flags.json + load_hub_flags) yang rawan balapan tulis-vs-baca dan
    // meninggalkan sisa antar-sesi. Command tetap memanggil request-next-line
    // sendiri sesudah invoke ini resolve. Memakai applySetVar yang sama dengan
    // entri `set_var`/`choice.setVariable`, jadi semua operator (=, +=, dst.)
    // konsisten. Return {ok} agar pemanggil bisa await sebelum lanjut.
    ipcMain.handle('vn-engine:set-variable', (event, { name, op, value } = {}) => {
        if (!name) return { ok: false, reason: 'name kosong' };
        const state = engineCore.getState();
        if (!state || !state.currentVNState) return { ok: false, reason: 'tak ada state' };
        if (!state.currentVNState.variables) state.currentVNState.variables = {};
        engineCore.applySetVar(state.currentVNState.variables, name, op || '=', value);
        return { ok: true };
    });

    // ---- Request Prev Line (rollback satu baris) ----
    // Player global: tombol ◀ / scroll-wheel ke atas. Diabaikan diam-diam bila
    // riwayat kosong (baris pertama / terpotong batas choice-custom) atau saat
    // preview label (alur preview punya state juggling sendiri).
    ipcMain.on('vn-engine:request-prev-line', () => {
        if (previewManager.isInPreviewMode()) return;
        engineCore.requestPrevLine();
    });

    // ---- Choice Made ----
    ipcMain.on('vn-engine:choice-made', (event, intent) => {
        if (previewManager.isInPreviewMode()) {
            const state = engineCore.getState();
            const resolved = engineCore.resolveChoiceIntent(intent);
            if (!resolved.ok) {
                console.warn(`[VN Engine] Intent choice preview ditolak: ${resolved.reason}`);
                return;
            }
            const choice = resolved.choice;
            const originalChoiceLine = resolved.entry;
            const choiceText = engineCore.interpolateVars(choice.text, state.currentVNState.variables || {});

            if (choice.setVariable) {
                if (!state.currentVNState.variables) state.currentVNState.variables = {};
                engineCore.applySetVar(state.currentVNState.variables, choice.setVariable.name, choice.setVariable.op, choice.setVariable.value, choice.setVariable.index);
            }

            if (originalChoiceLine.autoDialogue && choiceText) {
                const autoDialoguePayload = {
                    type: 'dialogue',
                    text: choiceText,
                    bgm: state.currentVNState.lastBgmState?.src,
                    bgmVolume: state.currentVNState.lastBgmState?.volume,
                    background: state.currentVNState.backgroundStack[state.currentVNState.backgroundStack.length - 1]?.src,
                    backgroundMode: state.currentVNState.backgroundStack[state.currentVNState.backgroundStack.length - 1]?.mode,
                    sprite: originalChoiceLine.sprite,
                    sprite2: originalChoiceLine.sprite2,
                    spriteCenter: originalChoiceLine.spriteCenter,
                    charSprites: originalChoiceLine.charSprites,
                    isPreview: true,
                    isLabelPreview: true
                };

                if (originalChoiceLine.autoDialogue === 'character' && state.currentVNState.lastSpeaker) {
                    autoDialoguePayload.speaker = state.currentVNState.lastSpeaker;
                }

                if (autoDialoguePayload.speaker) {
                    state.vnDialogueHistory.push({ speaker: autoDialoguePayload.speaker, text: autoDialoguePayload.text });
                }

                const pw = previewManager.getPreviewWindow();
                if (pw) pw.webContents.send('vn-engine:update-display', autoDialoguePayload);
                state.currentVNState.pendingJump = choice.jump;
                return;
            }

            engineCore.commitChoiceTarget(choice.jump);
            previewManager.getProcessPreviewLabelUpdate()();
            return;
        }

        // === Handler normal (bukan preview) ===
        const state = engineCore.getState();
        let choice;
        let originalChoiceLine;

        // Compatibility branch TERBATAS untuk Custom Player lama yang menjalankan
        // interpreter sendiri. Player global dan engine-shim tidak pernah masuk
        // cabang ini, sehingga object forged dari renderer tidak menjadi authority.
        const isLegacyCustomPayload = state.playerAuthorityMode === 'legacy-custom' &&
            intent && typeof intent === 'object' && !Array.isArray(intent) &&
            intent.choiceToken === undefined && intent.optionIndex === undefined;
        if (isLegacyCustomPayload) {
            console.warn('[VN Engine] Custom Player memakai payload choice legacy; migrasikan ke interpreter/API miliknya sendiri.');
            choice = intent;
            originalChoiceLine = state.currentVNScript[state.currentVNIndex];
            if (!originalChoiceLine || originalChoiceLine.type !== 'choice') return;
        } else {
            const resolved = engineCore.resolveChoiceIntent(intent);
            if (!resolved.ok) {
                console.warn(`[VN Engine] Intent choice ditolak: ${resolved.reason}`);
                return;
            }
            choice = resolved.choice;
            originalChoiceLine = resolved.entry;
        }

        // Batas rollback baru dibuat SETELAH intent tervalidasi. Payload forged
        // tidak boleh menghapus kemampuan pemain untuk rollback/memilih ulang.
        engineCore.clearRollbackHistory('choice dijawab');
        const choiceText = engineCore.interpolateVars(choice.text, state.currentVNState.variables || {});

        if (choice.setVariable) {
            if (!state.currentVNState.variables) state.currentVNState.variables = {};
            engineCore.applySetVar(state.currentVNState.variables, choice.setVariable.name, choice.setVariable.op, choice.setVariable.value, choice.setVariable.index);
        }

        if (originalChoiceLine.autoDialogue && choiceText) {
            const autoDialoguePayload = {
                type: 'dialogue',
                text: choiceText,
                bgm: state.currentVNState.lastBgmState?.src,
                bgmVolume: state.currentVNState.lastBgmState?.volume,
                background: state.currentVNState.backgroundStack[state.currentVNState.backgroundStack.length - 1]?.src,
                backgroundMode: state.currentVNState.backgroundStack[state.currentVNState.backgroundStack.length - 1]?.mode,
                sprite: originalChoiceLine.sprite,
                sprite2: originalChoiceLine.sprite2,
                spriteCenter: originalChoiceLine.spriteCenter,
                spriteAnim: originalChoiceLine.spriteAnim,
                sprite2Anim: originalChoiceLine.sprite2Anim,
                spriteCenterAnim: originalChoiceLine.spriteCenterAnim,
                spriteScale: originalChoiceLine.spriteScale,
                sprite2Scale: originalChoiceLine.sprite2Scale,
                spriteCenterScale: originalChoiceLine.spriteCenterScale,
                charSprites: originalChoiceLine.charSprites
            };

            if (originalChoiceLine.autoDialogue === 'character' && state.currentVNState.lastSpeaker) {
                autoDialoguePayload.speaker = state.currentVNState.lastSpeaker;
            }

            if (autoDialoguePayload.speaker) {
                state.vnDialogueHistory.push({ speaker: autoDialoguePayload.speaker, text: autoDialoguePayload.text });
            }

            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('vn-engine:update-display', autoDialoguePayload);

            state.currentVNState.pendingJump = choice.jump;
            return;
        }

        engineCore.commitChoiceTarget(choice.jump);
        engineCore.processAndSendVNUpdate();
    });

    // ---- Text Input Submitted (choice.inputType === 'text') ----
    // Kontrak lebih sederhana dari choice-made: entry ini murni linear (tulis
    // variabel, lanjut) — tidak ada jump/autoDialogue seperti choice biasa.
    function _handleTextInputSubmitted(value) {
        const state = engineCore.getState();
        const originalLine = state.currentVNScript[state.currentVNIndex];
        if (!originalLine || !originalLine.variable) {
            engineCore.incrementIndex();
            return;
        }
        let finalValue = (typeof value === 'string') ? value.trim() : '';
        if (!finalValue && originalLine.defaultValue !== undefined) {
            finalValue = originalLine.defaultValue;
        }
        // Jaring pengaman: hormati maxLength juga di main process (klien seharusnya
        // sudah membatasi, tapi jangan percaya input renderer begitu saja).
        if (typeof finalValue === 'string' && typeof originalLine.maxLength === 'number' && originalLine.maxLength > 0) {
            finalValue = finalValue.slice(0, originalLine.maxLength);
        }
        if (!state.currentVNState.variables) state.currentVNState.variables = {};
        engineCore.applySetVar(state.currentVNState.variables, originalLine.variable, '=', finalValue);
        engineCore.incrementIndex();
    }

    ipcMain.on('vn-engine:text-input-submitted', (event, { value } = {}) => {
        // Batas rollback: submit input teks = keputusan (setara choice dijawab).
        engineCore.clearRollbackHistory('input teks disubmit');
        _handleTextInputSubmitted(value);
        engineCore.processAndSendVNUpdate();
    });

    ipcMain.on('vn-engine:preview-label-text-input-submitted', (event, { value } = {}) => {
        _handleTextInputSubmitted(value);
        previewManager.getProcessPreviewLabelUpdate()();
    });

    // ---- Get History ----
    ipcMain.handle('vn-engine:get-history', async () => {
        return engineCore.getState().vnDialogueHistory;
    });

    // ---- Replay Chapter ----
    ipcMain.on('vn-engine:replay-chapter', () => {
        console.log('[VN Engine] Mengulang chapter...');
        engineCore.resetState();
        engineCore.processAndSendVNUpdate();
    });

    // ---- Get Next Chapter ----
    ipcMain.handle('get-next-chapter', async () => {
        return engineCore.getNextChapterSync();
    });

    // ---- Transition selesai (dari label dengan background) ----
    ipcMain.on('vn-engine:transition-done', () => {
        engineCore.incrementIndex();
        engineCore.processAndSendVNUpdate();
    });

    // ---- Kembali ke Hub (dari player, setelah chapter selesai) ----
    ipcMain.on('vn-engine:return-to-hub', (event, { storyTitle }) => {
        // Blokir return-to-hub saat chapter preview aktif
        if (previewManager.isInChapterPreviewMode()) {
            console.log('[IPC] return-to-hub diblokir: sedang dalam chapter preview mode.');
            return;
        }
        // Snapshot variabel sesi terakhir → story-vars.json (dibaca hub via
        // VNHub.getStoryVars()) sebelum window berpindah ke hub.
        engineCore.persistStoryVars('return-to-hub');
        const mainWindow = getMainWindow();
        if (mainWindow) {
            returnToNovelHub(storyTitle, mainWindow);
        }
    });

    // ---- Buka Hub Novel (dari vnManager, saat play novel) ----
    ipcMain.on('vn-engine:open-novel-hub', (event, { storyTitle }) => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            // Target viewport diterapkan DI SINI, bukan di `returnToNovelHub`.
            // Fungsi itu dipakai bersama oleh `vn-engine:return-to-hub`, jadi
            // menaruhnya di sana berarti menegaskan ulang ukuran window tiap kali
            // pemain kembali dari chapter — melawan pemain yang sudah menarik
            // window sendiri di tengah permainan. Satu penerapan per sesi novel.
            try {
                const safe = String(storyTitle || '').replace(/[\\/]/g, '');
                if (safe) {
                    const target = targetViewport.dariNovel(path.join(visualNovelsDirectory, safe));
                    if (!target.bawaan) hostViewport.terapkan(mainWindow, target);
                }
            } catch (e) {
                // Ukuran window tidak boleh jadi alasan sebuah novel gagal dibuka.
                console.warn('[IPC] Target viewport dilewati:', e.message);
            }
            returnToNovelHub(storyTitle, mainWindow);
        }
    });

    // ---- i18n: set/get bahasa aktif (dipakai UI Settings Hub via VNHub.settings) ----
    // Engine memilih script.<lang>.json saat memuat chapter (lihat core.resolveLocalizedScriptPath).
    ipcMain.on('vn-engine:set-language', (event, code) => {
        engineCore.setLanguage(code);
    });
    ipcMain.handle('vn-engine:get-language', async () => {
        return engineCore.getLanguage();
    });

    // ---- Keluar dari Hub, kembali ke VN Manager (daftar novel) ----
    ipcMain.on('vn-engine:exit-to-manager', (event) => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            // Kembalikan ukuran window ke keadaan sebelum novel memintanya.
            // TANPA ini, panel Options — yang membaca ukuran window yang SEDANG
            // BERLAKU — akan menampilkan ukuran pilihan novel, dan tombol Apply
            // menjadikannya preferensi tersimpan pemain. Itu mencuri setting
            // orang tanpa satu pun dialog.
            hostViewport.pulihkan(mainWindow);
            _lastPlayed = null; // jangan bocorkan sinyal return ke hub novel berikutnya
            const vnManagerPath = path.join(path.dirname(__dirname), 'aset', 'game', 'vnManager.html');
            mainWindow.loadFile(vnManagerPath);
            console.log('[VN Engine] Kembali ke VN Manager dari hub.');
        }
    });

    // ---- Open in external editor / folder ----
    // =============================================
    // DETEKTOR STALL — lihat vn-engine/stall-detector.js untuk alasannya.
    //
    // Log ditaruh di folder aplikasi (bukan userData) supaya user bisa
    // menemukannya dan mengirimkannya tanpa dipandu mencari folder tersembunyi.
    // Renderer melapor lewat IPC; main mendeteksi utasnya sendiri.
    // =============================================
    (function pasangDetektorStall() {
        const { buatDetektor } = require('./stall-detector');
        const dirLog = path.join(path.dirname(__dirname), 'logs');
        const berkas = path.join(dirLog, 'stall.log');

        function tulis(rec) {
            try {
                if (!fs.existsSync(dirLog)) fs.mkdirSync(dirLog, { recursive: true });
                const kerja = (rec.sedangBerjalan || []).map((m) => m.nama).join(' > ') || '(tak ada penanda)';
                fs.appendFileSync(berkas,
                    `${rec.waktu}  ${String(rec.utas).padEnd(9)} ${String(rec.stallMs).padStart(6)}ms  ${kerja}\n`,
                    'utf-8');
            } catch (e) { /* log yang gagal jangan pernah menjatuhkan aplikasi */ }
        }

        const det = buatDetektor({ utas: 'main', lapor: tulis });
        det.mulai();
        // Diekspos supaya jalur main yang berat bisa menandai dirinya.
        module.exports._stall = det;

        ipcMain.on('stall:report', (event, rec) => {
            if (rec && typeof rec === 'object') tulis(rec);
        });

        // Jejak preview: dicatat di berkas yang SAMA supaya urutannya terbaca
        // bersama stall — "webContents naik jadi 7, lalu stall 9600 ms" adalah
        // satu cerita, dan memisahkannya ke dua berkas menyembunyikan itu.
        const { webContents, app: electronApp } = require('electron');
        ipcMain.on('preview:rebuilt', (event, info) => {
            try {
                // TOTAL saja menyesatkan. Log sesi user menunjukkan garis dasar
                // 620–806 MB SEBELUM apply pertama, dan pertambahan tiap reload
                // hanya ~10 MB — artinya yang membunuh bukan preview-nya,
                // melainkan siapa pun yang sudah memegang ratusan MB itu.
                // Aplikasi ini juga menampung webview YouTube Music (`[KELUAR
                // dari YT Music]` di log navigasi), jadi tersangkanya banyak.
                //
                // Memori diambil per-PROSES lalu disambungkan ke webContents
                // lewat `getOSProcessId()` — hanya dengan begitu angkanya bisa
                // menyebut NAMA, bukan sekadar jumlah.
                const metrik = {};
                (electronApp.getAppMetrics() || []).forEach((m) => {
                    metrik[m.pid] = Math.round(((m.memory && m.memory.workingSetSize) || 0) / 1024);
                });

                const baris = [];
                let total = 0;
                webContents.getAllWebContents().forEach((c) => {
                    let pid = 0, url = '';
                    try { pid = c.getOSProcessId(); } catch (e) {}
                    try { url = c.getURL(); } catch (e) {}
                    const mb = metrik[pid] || 0;
                    total += mb;
                    // URL dipendekkan dari BELAKANG: bagian yang membedakan
                    // (nama berkas/host) ada di ujung, bukan di awal.
                    const pendek = url.length > 52 ? '…' + url.slice(-52) : (url || '(kosong)');
                    baris.push(`      pid=${String(pid).padEnd(6)} ${String(mb).padStart(5)} MB  ${pendek}`);
                });

                // Ukuran DOM editor dikirim renderer — `workingSetSize` di sini
                // TIDAK melihat heap Oilpan tempat objek DOM tinggal (terukur:
                // 199 MB vs 455 MB yang dilaporkan GC untuk proses yang sama).
                const d = (info && info.dom) || {};
                // `node` hanya menghitung DOM yang MASIH TERPASANG. Heap Oilpan
                // 457 MB dengan 1120 node terpasang membuktikan yang menumpuk
                // adalah DOM TERLEPAS — jadi hitungan jalur render di bawah yang
                // menunjuk siapa membangun-lalu-membuangnya.
                const r = d.render || {};
                const domBaris = (d.node !== undefined)
                    ? `      editor: node=${d.node} · webview=${d.webview}` +
                      (d.jsHeapMB !== undefined ? ` · jsHeapMB=${d.jsHeapMB}` : '') +
                      `\n      render: cssVars=${r.cssVars || 0} · template=${r.template || 0}` +
                      ` · initPreview=${r.initPreview || 0}`
                    : '      editor: (ukuran DOM tak terbaca)';

                tulis({
                    utas: 'preview',
                    waktu: new Date().toISOString(),
                    stallMs: total,
                    sedangBerjalan: [{ nama:
                        `${(info && info.jenis) || '?'} · webContents=${baris.length} · totalMB=${total}\n` +
                        domBaris + '\n' + baris.join('\n') }],
                });
            } catch (e) { /* diagnostik tak boleh menjatuhkan aplikasi */ }
        });
        ipcMain.handle('stall:log-path', async () => ({ path: berkas, ada: fs.existsSync(berkas) }));
    })();

    ipcMain.handle('open-in-external-editor', async (event, { novelTitle, editor }) => {
        const novelPath = path.join(visualNovelsDirectory, novelTitle);
        if (!fs.existsSync(novelPath)) {
            return { success: false, message: 'Folder novel tidak ditemukan.' };
        }
        // Validate novelPath stays within visualNovelsDirectory
        const resolvedNovel = path.resolve(novelPath);
        if (!isPathSafe(resolvedNovel, visualNovelsDirectory)) {
            return { success: false, message: 'Path tidak valid.' };
        }
        if (resolvedNovel.includes('"')) {
            return { success: false, message: 'Path mengandung karakter tidak valid.' };
        }
        try {
            if (editor === 'vscode') {
                const { exec } = require('child_process');
                exec(`code "${resolvedNovel}"`);
            } else {
                shell.openPath(resolvedNovel);
            }
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });

    // ---- Preview Hub / Player ----
    ipcMain.handle('vn-engine:preview-hub', async (event, { novelTitle, hubConfig, metaData }) => {
        try {
            const safeTitle = sanitizePathComponent(novelTitle);
            previewManager.openHubPreview(safeTitle, hubConfig, visualNovelsDirectory, metaData);
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('vn-engine:preview-player', async (event, { novelTitle, playerProfile, chapterName }) => {
        try {
            const safeTitle = sanitizePathComponent(novelTitle);
            const safeChapter = chapterName ? sanitizePathComponent(chapterName) : null;
            previewManager.openPlayerPreview(safeTitle, playerProfile, visualNovelsDirectory, safeChapter);
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('vn-engine:push-hub-config', async (event, { config }) => {
        previewManager.pushHubConfig(config);
        return { success: true };
    });

    ipcMain.handle('vn-engine:push-hub-meta', async (event, { metaData }) => {
        previewManager.pushHubMeta(metaData);
        return { success: true };
    });

    // J3: teruskan status penerima apa adanya — `success` menyatakan handler
    // berjalan, `delivered` menyatakan ada/tidaknya jendela yang menerima.
    ipcMain.handle('vn-engine:push-player-config', async (event, { config, refreshCss } = {}) => {
        const res = previewManager.pushPlayerConfig(config, { refreshCss }) || {};
        return { success: true, delivered: res.delivered === true, reason: res.reason };
    });

    // Resolver SATU untuk runtime engine, preview editor, dan custom player.
    // Default: baseline engine -> novel -> chapter. Theme chapter hasil menerapkan
    // template dapat membawa `@vn-theme-cascade: replace-novel`; dalam mode itu
    // baseline + chapter tetap dimuat tetapi novel dilewati. Tanpa marker perilaku
    // overlay lama dipertahankan untuk file buatan kreator.
    ipcMain.handle('vn-engine:resolve-effective-css', async (event, { storyTitle, chapter } = {}) => {
        const out = {};
        const root = path.dirname(__dirname);

        // PREVIEW EDITOR: target yang sedang disunting menentukan berkas mana yang
        // dirender, bukan chapter yang kebetulan diputar playthrough.
        //
        // Hanya berlaku untuk webContents yang TERDAFTAR sebagai preview editor
        // (lihat setPreviewThemeScope di preview-manager). Runtime sungguhan tak
        // pernah ada di peta itu, jadi jawabannya tak pernah berubah untuk pemain —
        // dan itu syarat mutlak: preview boleh berbohong soal chapter mana yang
        // dipakai, runtime tidak boleh berbohong sama sekali.
        const scopePreview = previewManager.getPreviewThemeScope(event.sender && event.sender.id);
        if (scopePreview && scopePreview.storyTitle === storyTitle) {
            chapter = scopePreview.chapter || '';
            out.previewScopeApplied = true;
        }

        try {
            // G2 (audit): baseline `themes/default/theme.css` diikutkan supaya custom
            // player mendapat lapisan yang SAMA dengan engine (engine memuatnya lewat
            // <link> statis di player.html).
            //
            // N5: parameter `theme` DICABUT. Tema tak lagi berupa mode yang dipilih
            // dari JSON — kosmetik non-baseline hidup di `theme.css` milik kreator,
            // yang justru dua baris di bawah ini. Yang tersisa cuma baseline.
            const target = storyTitle
                ? resolveNovelChapterPath(visualNovelsDirectory, storyTitle, chapter || '')
                : { novelDir: null, chapterDir: null };
            const resolved = resolveEffectiveThemeFiles({
                engineThemePath: path.join(root, 'vn-player', 'themes', 'default', 'theme.css'),
                novelDir: target.novelDir,
                chapterDir: target.chapterDir
            });
            if (resolved.themePath) out.themeUrl = toVersionedFileUrl(resolved.themePath);
            if (resolved.novelPath) out.novelUrl = toVersionedFileUrl(resolved.novelPath);
            if (resolved.chapterPath) out.chapterUrl = toVersionedFileUrl(resolved.chapterPath);
            out.cascadeMode = resolved.cascadeMode;
            out.novelSkipped = resolved.novelSkipped;
        } catch (e) { /* abaikan */ }
        return out;
    });
}

// Helper — mulai play chapter (setelah security check)
function startPlayChapter(storyTitle, chapter, allowInternet, deps) {
    const { getMainWindow, updateRpcActivity, visualNovelsDirectory } = deps;
    const mainWindow = getMainWindow();

    // Store permission
    const novelKey = `${storyTitle}::${chapter}`;
    novelSecurityPermissions[novelKey] = { allowInternet };

    // Update Discord RPC
    if (updateRpcActivity) {
        // Gambar besar milik novel (opsional). Dikirim apa adanya —
        // `sanitizeRpcLargeImage()` di main.js tetap gerbang terakhirnya, sama
        // seperti untuk cover musik. URL yang ditolak di sana jatuh ke ikon
        // bawaan, jadi kegagalan di sini tidak pernah merusak apa pun.
        updateRpcActivity({
            details: `Bermain: ${storyTitle}`,
            state: `Chapter: ${chapter}`,
            largeImageKey: _gambarRpcNovel(storyTitle)
        });
    }

    // Set state di core
    engineCore.setState({
        currentStoryTitle: storyTitle,
        currentChapter: chapter
    });

    // Catat chapter ini agar saat kembali ke hub, VNHub bisa memancarkan
    // event 'vnhub:chapter-return' (lifecycle onChapterReturn).
    _lastPlayed = { storyTitle, chapter };

    // Masuk ke proses play
    engineCore.proceedToPlayChapter(storyTitle, chapter, allowInternet);
}

// Helper — kembali ke novel hub.
// Prinsip: SELALU boot file hub milik novel sendiri. Urutan:
//   hub.html (code-first, bridge) → index.html (legacy self-contained) → VN Manager.
// Novel "generated" lama tanpa file lokal di-materialisasi dulu (ensureLocalHub →
// scaffold hub.html dari hub-config). novel-hub.html global TIDAK lagi di-boot.
function returnToNovelHub(storyTitle, mainWindow) {
    if (!mainWindow) return;

    // Status Discord untuk layar Hub novel. Dipasang di sini — bukan hanya saat
    // chapter dimulai — karena dua alasan: pemain yang masih memilih chapter pun
    // sedang berada "di dalam" novel itu, dan tanpa ini status akan mandek
    // menyebut chapter yang sudah ditinggalkan setelah pemain kembali ke Hub.
    // Throttle global SET_ACTIVITY di main.js yang menjaga frekuensinya.
    if (_updateRpc) {
        try {
            _updateRpc({
                details: `Menjelajah: ${storyTitle}`,
                state: 'Di menu novel',
                largeImageKey: _gambarRpcNovel(storyTitle)
            });
        } catch (e) { /* RPC tak boleh jadi alasan hub gagal dibuka */ }
    }

    // Clear security permissions saat keluar dari chapter
    for (const key of Object.keys(novelSecurityPermissions)) {
        if (key.startsWith(`${storyTitle}::`)) {
            delete novelSecurityPermissions[key];
        }
    }

    const novelPath = path.join(path.dirname(__dirname), 'aset', 'game', 'visual_novels', storyTitle);
    const metaPath = path.join(novelPath, 'novel-meta.json');
    const newHubPath = path.join(path.dirname(__dirname), 'aset', 'game', 'hub-templates', '_global', 'novel-hub.html');
    const hubConfigData = readHubConfig(novelPath);

    // Materialisasi hub lokal bila novel generated lama belum punya hub.html/index.html.
    try {
        hubScaffolder.ensureLocalHub(novelPath, hubConfigData, { title: storyTitle });
    } catch (err) {
        console.error('[VN Engine] ensureLocalHub gagal (lanjut pakai fallback):', err);
    }

    const source = resolveHubSource(novelPath, newHubPath, hubConfigData);

    // Konsumsi sinyal "baru kembali dari chapter" (hanya bila untuk novel yang sama),
    // lalu bersihkan agar tidak bocor ke pembukaan hub berikutnya.
    const returnedFromChapter = (_lastPlayed && _lastPlayed.storyTitle === storyTitle)
        ? _lastPlayed.chapter : null;
    _lastPlayed = null;

    if (!source.filePath || !fs.existsSync(source.filePath)) {
        mainWindow.loadFile(path.join(path.dirname(__dirname), 'aset', 'game', 'vnManager.html'));
        console.log('[VN Engine] Hub tidak ditemukan, kembali ke VN Manager');
        return;
    }

    const sendContext = () => {
        try {
            const metaData = readNovelMeta(metaPath);
            mainWindow.webContents.send('vn-engine:set-hub-context', {
                storyTitle,
                novelPath: novelPath.replace(/\\/g, '/'),
                metaData,
                hubConfig: hubConfigData,
                returnedFromChapter
            });
        } catch (err) {
            console.error('[VN Engine] Gagal mengirim hub context:', err);
        }
    };

    console.log(`[VN Engine] Memuat ${source.kind} Hub: ${source.filePath}`);
    mainWindow.loadFile(source.filePath);

    mainWindow.webContents.once('did-finish-load', () => {
        if (source.useBridge) {
            // Hub code-first: inject bridge API + shared runtime, lalu kirim context.
            try {
                const jsDir = path.join(path.dirname(__dirname), 'vn-player', 'js');
                const bridgeCode = fs.readFileSync(path.join(jsDir, 'vn-hub-api.js'), 'utf-8');
                const runtimeCode = fs.readFileSync(path.join(jsDir, 'vn-hub-runtime.js'), 'utf-8');
                mainWindow.webContents.executeJavaScript(bridgeCode + '\n;\n' + runtimeCode)
                    .then(sendContext)
                    .catch(err => console.error('[VN Engine] Gagal inject bridge API:', err));
            } catch (err) {
                console.error('[VN Engine] Error saat setup hub kustom:', err);
            }
        } else {
            // Hub legacy index.html (self-contained) / fallback global: context dikirim
            // (diabaikan dengan aman oleh hub legacy yang tidak memakainya).
            sendContext();
        }
    });
}

// Helper — baca novel-meta.json dengan aman
function readNovelMeta(metaPath) {
    try {
        if (fs.existsSync(metaPath)) {
            const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            const novelPath = path.dirname(metaPath);
            if (!metaData.cover && fs.existsSync(novelPath)) {
                metaData.cover = fs.readdirSync(novelPath).find(file =>
                    /^cover\.(jpg|jpeg|png|webp|gif)$/i.test(file)
                ) || '';
            }
            // UX-A07b: pindai ekstensi nyata, bukan menebak video.mp4 — novel yang
            // video promosinya WebM dulu dianggap tak punya video sama sekali.
            if (!metaData.promotionalVideo && fs.existsSync(novelPath)) {
                metaData.promotionalVideo = fs.readdirSync(novelPath).find(file =>
                    /^video\.(mp4|webm)$/i.test(file)
                ) || '';
            }
            return metaData;
        }
    } catch (err) {
        console.error('[VN Engine] Gagal parse novel-meta.json:', err);
    }
    return {};
}

// Helper — baca hub-config.json dengan aman, merge dengan default
function readHubConfig(novelFolderPath) {
    const defaultConfig = {
        hubType: 'default',
        hubModeConfirmed: false,
        bootSequence: [],
        warningScreen: { enabled: false, text: '', style: 'default' },
        menu: { bgm: '', layout: '', items: [], background: { type: '', src: '' } },
        chapterConfig: {}
    };
    try {
        const configPath = path.join(novelFolderPath, 'hub-config.json');
        if (fs.existsSync(configPath)) {
            const fileData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            return { ...defaultConfig, ...fileData };
        }
    } catch (err) {
        console.error('[VN Engine] Gagal parse hub-config.json:', err);
    }
    return defaultConfig;
}

module.exports = { registerHandlers };
