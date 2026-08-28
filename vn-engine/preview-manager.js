// =============================================
// Rin.js — Preview Manager
// Mengelola preview special event dan label preview
// =============================================

const path = require('path');
const fs = require('fs');
const { BrowserWindow, ipcMain } = require('electron');
const engineCore = require('./core');
const { normalizeScript } = require('./schema-validator');
const { resolveHubSource } = require('./hub-source-resolver');
const { resolvePlayerSource } = require('./player-source-resolver');
const { resolveEffectiveThemeFiles, toVersionedFileUrl } = require('./player-theme-resolver');
const { buildPreviewPayload, kumpulkanLangkah } = require('./preview-payload');

let previewWindow = null;
let currentPreviewBasePath = null;

// --- Single-Entry Custom Player Preview State ---
// Kalau chapter yang sedang diedit punya player.html sendiri (Custom Player),
// tombol "Preview" per-entri mesti dirender lewat engine ASLI milik chapter itu,
// bukan lewat vn-player/player.html generik — supaya hasil preview benar-benar
// merepresentasikan apa yang akan dilihat pemain.
let customEntryPreviewWindow = null;
let customEntryPreviewSourcePath = null;

function _appRoot() {
    return path.dirname(__dirname);
}

function _chapterDirFor(storyTitle, chapter) {
    return path.join(_appRoot(), 'aset', 'game', 'visual_novels', storyTitle, chapter);
}

// --- Label Preview State ---
let isLabelPreviewMode = false;
let labelPreviewScriptBackup = null;
let labelPreviewStateBackup = null;
let labelPreviewIndexBackup = 0;
let labelPreviewHistoryBackup = [];
let labelPreviewLabelName = '';

// --- Chapter Preview State ---
let isChapterPreviewMode = false;
let chapterPreviewScriptBackup = null;
let chapterPreviewStateBackup = null;
let chapterPreviewIndexBackup = 0;
let chapterPreviewHistoryBackup = [];
let chapterPreviewTitleBackup = '';
let chapterPreviewChapterBackup = '';

function createPreviewWindow(basePath) {
    if (previewWindow && !previewWindow.isDestroyed()) {
        previewWindow.show();
        previewWindow.focus();
        return;
    }

    // Payload dari tombol Preview per-entri & Preview Label selalu berisi path aset
    // relatif-dari-root ("aset/game/visual_novels/<novel>/<chapter>/..."), bukan
    // bare filename — jadi basePath default-nya adalah root aplikasi, BUKAN folder
    // chapter (beda dari alur gameplay asli di core.js yang pakai bare filename).
    // Tanpa ini, state.basePath tetap kosong dan semua aset gagal resolve (layar hitam).
    currentPreviewBasePath = (basePath || _appRoot()).replace(/\\/g, '/');

    previewWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: "Preview - Special Event",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    previewWindow.loadFile(path.join(path.dirname(__dirname), 'vn-player', 'player.html'));

    // Inject basePath once DOM is ready so asset paths resolve.
    // BUG (sudah ada sebelumnya): `state` bukan global — ia cuma binding lokal
    // hasil destructuring `const { state } = VNState` di dalam closure init.js.
    // `typeof state !== "undefined"` di sini SELALU false, jadi basePath tidak
    // pernah benar-benar ter-set. VNState sendiri yang global (window.VNState).
    //
    // BUG LEBIH PARAH (juga sudah ada sebelumnya): dom.charSprite1/2/Center
    // (referensi elemen sprite) hanya diisi oleh VNSprites.setupSpriteSlots(),
    // dan itu CUMA dipanggil dari handler 'vn-engine:set-chapter-context' /
    // 'preview:apply-player-config' — keduanya TIDAK PERNAH terkirim ke jendela
    // preview single-entry ini. Akibatnya dom.charSprite1 dkk. tetap null, dan
    // VNSprites.processCharSprites() (dipanggil TANPA SYARAT di awal
    // renderContent() untuk SETIAP tipe entri) melempar TypeError saat
    // mengakses .dataset pada null — meng-abort SISA renderContent(), termasuk
    // kotak dialog. Ini AKAR MASALAH kenapa preview dialogue/scene bisa tampak
    // "tidak menampilkan apa-apa" sama sekali walau background sudah benar.
    previewWindow.webContents.once('did-finish-load', () => {
        const initScript = `
            (function () {
                if (typeof VNState !== 'undefined' && ${JSON.stringify(!!currentPreviewBasePath)}) {
                    VNState.state.basePath = ${JSON.stringify(currentPreviewBasePath || '')};
                }
                if (typeof VNSprites !== 'undefined' && VNSprites.setupSpriteSlots) {
                    VNSprites.setupSpriteSlots(5);
                }
            })();
        `;
        previewWindow.webContents.executeJavaScript(initScript).catch(() => {});
    });

    previewWindow.on('closed', () => {
        previewWindow = null;
        currentPreviewBasePath = null;
    });
}

// Fungsi khusus untuk memproses update di mode preview label.
//
// Logikanya (label/jump/phase + pewarisan background/bgm/speaker) DIPINDAH ke
// `preview-payload.js` sebagai fungsi murni, karena preview player tersemat di
// editor kini memakai aturan yang sama (§9.2). Fungsi ini tinggal menerjemahkan
// hasilnya ke state engine + IPC — itulah bagian yang memang milik preview popup.
function processPreviewLabelUpdate() {
    if (!previewWindow || previewWindow.isDestroyed()) return;
    if (!isLabelPreviewMode) return;

    engineCore.invalidateChoiceIntent();

    const state = engineCore.getState();
    const hasil = buildPreviewPayload(state.currentVNScript, state.currentVNIndex, state.currentVNState);

    // Keadaan bawaan (background/bgm/speaker) dikembalikan ke state engine supaya
    // langkah berikutnya melanjutkan dari titik yang sama — persis seperti saat
    // logika ini masih inline di sini.
    state.currentVNState.backgroundStack = hasil.carry.backgroundStack;
    state.currentVNState.lastBgmState = hasil.carry.lastBgmState;
    state.currentVNState.lastSpeaker = hasil.carry.lastSpeaker;

    if (hasil.done) {
        const info = { labelName: labelPreviewLabelName };
        if (hasil.reason === 'jump') { info.finishedBy = 'jump'; info.jumpTarget = hasil.detail.jumpTarget; }
        else if (hasil.reason === 'jump-external') { info.finishedBy = 'jump-external'; info.jumpTarget = hasil.detail.jumpTarget; }
        else if (hasil.reason === 'phase') { info.finishedBy = 'phase'; info.phaseName = hasil.detail.phaseName; }
        else if (hasil.reason === 'loop-guard') { info.finishedBy = 'loop-guard'; }
        console.log('[Preview] Potongan selesai:', hasil.reason);
        previewWindow.webContents.send('vn-engine:preview-label-finished', info);
        return;
    }

    // Entri struktural mungkin dilewati di dalam builder → sinkronkan indeks.
    if (hasil.index !== state.currentVNIndex) {
        engineCore.setState({ currentVNIndex: hasil.index });
    }

    const payload = hasil.payload;
    if (payload.type === 'choice') {
        const preparedChoice = engineCore.prepareChoiceIntentPayload(payload);
        if (!preparedChoice.ok) {
            // Samakan perilaku dengan runtime: choice tanpa opsi yang lolos tidak
            // boleh membuat preview macet pada panel kosong.
            engineCore.incrementIndex();
            processPreviewLabelUpdate();
            return;
        }
    }
    payload.isPreview = true;
    payload.isLabelPreview = true;
    payload.labelPreviewInfo = {
        labelName: labelPreviewLabelName,
        currentIndex: hasil.index,
        totalEntries: state.currentVNScript.length
    };

    console.log(`[Preview] Mengirim entri [${hasil.index}/${state.currentVNScript.length}]:`, payload.type);
    previewWindow.webContents.send('vn-engine:update-display', payload);

    if (hasil.historyEntry) state.vnDialogueHistory.push(hasil.historyEntry);
}

function restoreLabelPreviewState() {
    if (!isLabelPreviewMode) return;
    console.log('[Preview] Restoring engine state setelah preview label.');

    if (labelPreviewScriptBackup) {
        engineCore.setState({ currentVNScript: labelPreviewScriptBackup });
    }
    if (labelPreviewStateBackup) {
        engineCore.setState({ currentVNState: labelPreviewStateBackup });
    }
    engineCore.setState({
        currentVNIndex: labelPreviewIndexBackup,
        vnDialogueHistory: labelPreviewHistoryBackup
    });

    isLabelPreviewMode = false;
    labelPreviewScriptBackup = null;
    labelPreviewStateBackup = null;
    labelPreviewIndexBackup = 0;
    labelPreviewHistoryBackup = [];
    labelPreviewLabelName = '';
}

// VNPlayer.returnToHub/playChapter/exitToManager/loadGame mengirim IPC yang
// ditangani dengan getMainWindow() TANPA peduli siapa pengirimnya (dipakai apa
// adanya untuk gameplay asli, di mana "pemain" memang selalu mainWindow) — kalau
// dibiarkan apa adanya di popup preview ini, klik tombol "kembali ke hub" bawaan
// Custom Player bisa membajak window utama EDITOR yang sedang terbuka dan
// menggantinya dengan hub/gameplay novel yang di-preview. Timpa method-method
// navigasi itu di sisi popup supaya cuma menutup popup, bukan mempengaruhi
// window lain. save/load juga dimatikan agar tidak menulis ke slot save asli.
const CUSTOM_PREVIEW_SAFETY_SCRIPT = `
(function () {
    if (!window.VNPlayer) return;
    function closePreview() { try { window.close(); } catch (e) {} }
    function blockSaveLoad() { try { if (typeof toast === 'function') toast('Simpan/Muat dinonaktifkan pada preview entri.'); } catch (e) {} }
    VNPlayer.returnToHub = closePreview;
    VNPlayer.exitToManager = closePreview;
    VNPlayer.playChapter = closePreview;
    VNPlayer.replayChapter = closePreview;
    VNPlayer.saveGame = blockSaveLoad;
    VNPlayer.loadGame = blockSaveLoad;
})();
`;

// Bangun array `script` sintetis yang dikirim ke Custom Player.
//
// PENTING: field `_contextBackground`/`_contextVideo`/`_contextBgm*`/`_contextSpeaker`
// (dibaca entryEditorCard.js dari simulasi fase) adalah konvensi yang HANYA
// dimengerti vn-player/js/init.js (engine global). Custom Player adalah kode
// bebas milik kreator — ia cuma tahu field standar skrip (background/bgm/
// speaker/dst di level entri), sama sekali tidak tahu soal `_context*`. Kalau
// dikirim apa adanya, custom player akan mengabaikannya begitu saja (persis
// gejala yang dilaporkan: preview di DDLC "tidak bekerja" untuk BG/BGM/speaker
// yang seharusnya diwariskan).
//
// Perbaikannya BUKAN membuat Custom Player mengerti konvensi privat kita,
// melainkan menerjemahkan konteks itu ke bentuk yang SUDAH standar & wajib
// dipahami custom player mana pun agar bisa jalan normal saat gameplay asli:
//   - background/video/bgm konteks → entri `phase` sintetis di depan (tipe
//     'phase' diproses "lewat" tanpa jeda oleh loop mana pun yang benar,
//     persis seperti core.js memprosesnya).
//   - speaker konteks → ditulis langsung ke field `speaker` milik entri utama
//     (bukan lewat inheritance apa pun — custom player tak wajib melacak
//     lastSpeaker sendiri).
// Sprite-priming (`_spritePrimer`) SENGAJA tidak diterjemahkan ke sini: itu
// bergantung pada mekanisme animasi internal vn-player/js/sprite-manager.js
// (dataset.currentSrc sebagai posisi "sebelum") yang tidak punya padanan
// generik di kode custom — itu murni tanggung jawab custom player itu sendiri
// bila mau meniru transisi halus.
function _buildCustomPreviewScript(payload) {
    const contextPhase = { type: 'phase' };
    let hasContext = false;
    if (payload._contextBackground) { contextPhase.background = payload._contextBackground; contextPhase.backgroundMode = payload._contextBackgroundMode || 'cover'; hasContext = true; }
    else if (payload._contextVideo) { contextPhase.video = payload._contextVideo; hasContext = true; }
    if (payload._contextBgm) {
        contextPhase.bgm = payload._contextBgm;
        contextPhase.bgmVolume = payload._contextBgmVolume;
        contextPhase.bgmPan = payload._contextBgmPan;
        contextPhase.bgmDelay = payload._contextBgmDelay;
        contextPhase.bgmLoop = payload._contextBgmLoop;
        contextPhase.bgmFade = payload._contextBgmFade;
        hasContext = true;
    }

    const mainEntry = { ...payload, isPreview: true };
    if (!mainEntry.speaker && mainEntry._contextSpeaker) mainEntry.speaker = mainEntry._contextSpeaker;
    // Bersihkan metadata privat — custom player tak perlu (dan tak mengerti) ini.
    delete mainEntry._contextBackground; delete mainEntry._contextBackgroundMode; delete mainEntry._contextVideo;
    delete mainEntry._contextBgm; delete mainEntry._contextBgmVolume; delete mainEntry._contextBgmPan;
    delete mainEntry._contextBgmDelay; delete mainEntry._contextBgmLoop; delete mainEntry._contextBgmFade;
    delete mainEntry._contextSpeaker; delete mainEntry._spritePrimer;

    return hasContext ? [contextPhase, mainEntry] : [mainEntry];
}

// Preview satu entri lewat Custom Player (player.html) ASLI milik chapter —
// dipakai saat chapter yang diedit sudah opt-in ke Custom Player. Meniru bridge
// yang sama dipakai proceedToPlayChapter()/openPlayerPreview() di core.js, tapi
// script yang dikirim cuma array satu entri (sintetis), bukan seluruh chapter.
function openSingleEntryCustomPreview(novelTitle, chapterName, customPlayerPath, payload) {
    const rootBasePath = _appRoot().replace(/\\/g, '/');

    const sendEntry = (win) => {
        win.loadFile(customPlayerPath);
        win.webContents.once('did-finish-load', () => {
            try {
                const bridgePath = path.join(_appRoot(), 'vn-player', 'js', 'vn-player-api.js');
                const bridgeCode = fs.readFileSync(bridgePath, 'utf-8');
                win.webContents.executeJavaScript(bridgeCode)
                    .then(() => win.webContents.executeJavaScript(CUSTOM_PREVIEW_SAFETY_SCRIPT))
                    .then(() => {
                        win.webContents.send('vn-engine:set-player-context', {
                            storyTitle: novelTitle,
                            chapter: chapterName,
                            // Payload preview pakai path relatif-dari-root (lihat createPreviewWindow),
                            // jadi basePath/novelPath di sini disamakan ke root agar VNPlayer.resolveAsset
                            // (yang prepend basePath) menghasilkan file:// URL yang benar.
                            basePath: rootBasePath,
                            novelPath: rootBasePath,
                            script: _buildCustomPreviewScript(payload)
                        });
                    }).catch(err => console.error('[Preview] Gagal inject VNPlayer bridge (custom preview):', err));
            } catch (err) {
                console.error('[Preview] Gagal memuat Custom Player untuk preview entri:', err);
            }
        });
    };

    if (customEntryPreviewWindow && !customEntryPreviewWindow.isDestroyed()) {
        if (customEntryPreviewSourcePath === customPlayerPath) {
            customEntryPreviewWindow.show();
            customEntryPreviewWindow.focus();
            sendEntry(customEntryPreviewWindow);
            return;
        }
        customEntryPreviewWindow.close();
    }

    customEntryPreviewSourcePath = customPlayerPath;
    customEntryPreviewWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: `Preview (Custom Player) — ${novelTitle} / ${chapterName}`,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });
    customEntryPreviewWindow.on('closed', () => {
        customEntryPreviewWindow = null;
        customEntryPreviewSourcePath = null;
    });
    sendEntry(customEntryPreviewWindow);
}

// Kirim entri ke jendela preview. Kalau payload bawa `_spritePrimer` (dikirim
// entryEditorCard.js saat entri ini punya slot sprite dengan "Transisi Halus"
// aktif), tampilkan dulu frame diam berisi state sprite SEBELUM entri ini,
// baru susul entri aslinya sesaat kemudian — supaya animasi geser sprite di
// popup preview benar2 teranimasi dari posisi asal, bukan langsung "lompat"
// (jendela preview baru tidak punya histori render utk dianimasikan dari).
function _sendPreviewEntry(win, payload) {
    if (payload && payload._spritePrimer) {
        const { _spritePrimer, ...rest } = payload;
        win.webContents.send('vn-engine:update-display', { ..._spritePrimer, isPreview: true });
        setTimeout(() => {
            if (!win.isDestroyed()) win.webContents.send('vn-engine:update-display', { ...rest, isPreview: true });
        }, 120);
    } else {
        win.webContents.send('vn-engine:update-display', { ...payload, isPreview: true });
    }
}

function registerHandlers() {
    // =============================================
    // §9.2 — entri NYATA dari script.json untuk preview player tersemat
    // =============================================
    // Editor TIDAK membangun payload sendiri. Kalau ia melakukannya, aturan main
    // (pewarisan background/bgm/speaker, label/jump) punya implementasi KETIGA dan
    // akan menyimpang diam-diam. Handler ini memakai `preview-payload.js` yang sama
    // dengan popup "Preview Label".
    //
    // Path aset SENGAJA dibuat relatif-ROOT APLIKASI, bukan relatif folder chapter:
    // itulah bentuk yang dipakai jalur preview (lihat catatan di createPreviewWindow)
    // dan yang dimengerti `state.basePath` yang disuntik editor ke webview.
    ipcMain.handle('preview:script-steps', async (event, { storyTitle, chapter, limit } = {}) => {
        try {
            if (!storyTitle) return { success: false, message: 'storyTitle kosong.' };
            const novelDir = path.join(_appRoot(), 'aset', 'game', 'visual_novels', storyTitle);
            if (!fs.existsSync(novelDir)) return { success: false, message: 'Novel tidak ditemukan.' };

            // Target Global tidak terikat satu chapter → pakai chapter PERTAMA yang
            // punya script, dan katakan chapter mana (preview harus jujur soal
            // dari mana contohnya diambil).
            let chapterDipakai = chapter || '';
            if (!chapterDipakai) {
                const kandidat = fs.readdirSync(novelDir, { withFileTypes: true })
                    .filter((d) => d.isDirectory())
                    .map((d) => d.name)
                    .filter((n) => fs.existsSync(path.join(novelDir, n, 'script.json')));
                chapterDipakai = kandidat[0] || '';
            }
            if (!chapterDipakai) return { success: false, message: 'Novel belum punya chapter ber-script.' };

            const scriptPath = path.join(novelDir, chapterDipakai, 'script.json');
            if (!fs.existsSync(scriptPath)) return { success: false, message: 'script.json tidak ada.' };

            let script;
            try {
                script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
            } catch (e) {
                return { success: false, message: 'script.json tidak bisa dibaca: ' + e.message };
            }

            // berhentiDiPhase:false — di sini kita memutar SATU CHAPTER penuh, dan
            // `phase` cuma penanda bagian. (Script starter bawaan diawali phase.)
            const langkah = kumpulkanLangkah(script, limit || 200, { berhentiDiPhase: false });

            const prefix = ['aset', 'game', 'visual_novels', storyTitle, chapterDipakai].join('/') + '/';
            const steps = langkah.map((l) => {
                const p = Object.assign({}, l.payload, { isPreview: true, hideDebugHud: true });
                // Aset bare-filename (bentuk gameplay asli) dijadikan relatif-root.
                ['background', 'video', 'bgm'].forEach((k) => {
                    if (p[k] && typeof p[k] === 'string' && !/^([a-z]+:|\/|aset\/)/i.test(p[k])) {
                        p[k] = prefix + p[k];
                    }
                });
                return { index: l.index, payload: p };
            });

            return {
                success: true,
                chapter: chapterDipakai,
                usedFallbackChapter: !chapter,
                total: steps.length,
                steps
            };
        } catch (e) {
            return { success: false, message: e.message };
        }
    });

    // Playthrough tersemat (editor VN Player, mode Live): mulai / hentikan.
    // `webContentsId` = id webview preview di editor (webview.getWebContentsId()).
    //
    // `themeScopeChapter` = TARGET yang sedang disunting kreator di panel, bukan
    // chapter yang diputar. Lihat setPreviewThemeScope() untuk alasannya.
    ipcMain.handle('preview:play-chapter', (event, { storyTitle, chapter, webContentsId, themeScopeChapter } = {}) => {
        try {
            const { webContents } = require('electron');
            const wc = (webContentsId != null) ? webContents.fromId(webContentsId) : event.sender;
            if (wc && themeScopeChapter !== undefined) {
                setPreviewThemeScope(wc.id, { storyTitle, chapter: themeScopeChapter || '' });
            }
            return startEmbeddedPlaythrough(wc, storyTitle, chapter);
        } catch (e) { return { success: false, message: e.message }; }
    });
    ipcMain.handle('preview:stop-chapter', () => {
        try { return stopEmbeddedPlaythrough(); } catch (e) { return { success: false, message: e.message }; }
    });

    // Preview Special Event
    ipcMain.on('vn-engine:preview-special-event', (event, payload) => {
        console.log('[Preview] Membuka Preview Special Event:', payload);

        // Chapter ini punya player.html sendiri (Custom Player)? Kalau ya, preview
        // WAJIB lewat file itu — vn-player/player.html generik tidak merepresentasikan
        // tampilan/mekanisme yang sebenarnya dipakai chapter ini.
        if (payload.novel && payload.chapter) {
            const chapterDir = _chapterDirFor(payload.novel, payload.chapter);
            const globalPlayerPath = path.join(_appRoot(), 'vn-player', 'player.html');
            // D2: level novel ikut dipertimbangkan (chapter → novel → global).
            const novelDir = path.join(_appRoot(), 'aset', 'game', 'visual_novels', payload.novel);
            const source = resolvePlayerSource(chapterDir, globalPlayerPath, novelDir);
            if (source.useBridge) {
                openSingleEntryCustomPreview(payload.novel, payload.chapter, source.filePath, payload);
                return;
            }
        }

        if (!previewWindow || previewWindow.isDestroyed()) {
            createPreviewWindow(payload.basePath);
            previewWindow.webContents.once('did-finish-load', () => {
                setTimeout(() => {
                    // Terapkan profil efektif dulu (tema/dialog/sprite/customCSS/theme.css),
                    // baru render entri — supaya preview = tampilan runtime, bukan gaya default.
                    _applyEffectiveProfileToPreview(previewWindow, payload.novel, payload.chapter);
                    _sendPreviewEntry(previewWindow, payload);
                }, 500);
            });
        } else {
            previewWindow.show();
            _applyEffectiveProfileToPreview(previewWindow, payload.novel, payload.chapter);
            _sendPreviewEntry(previewWindow, payload);
        }
    });

    // Tutup preview window
    ipcMain.on('vn-engine:close-preview-window', () => {
        console.log('[Preview] Menerima perintah tutup preview window.');
        if (isLabelPreviewMode) {
            restoreLabelPreviewState();
        }
        if (previewWindow && !previewWindow.isDestroyed()) {
            previewWindow.close();
        }
    });

    // Preview Label
    ipcMain.on('vn-engine:preview-label', (event, payload) => {
        console.log('[Preview] Membuka Preview Label:', payload.labelName);
        labelPreviewLabelName = payload.labelName;

        const tempScript = [];
        const labelHeader = {
            type: 'label',
            name: payload.labelName,
            ...payload.context
        };
        tempScript.push(labelHeader);
        if (payload.entries && payload.entries.length > 0) {
            tempScript.push(...payload.entries);
        }

        console.log('[Preview] Skrip sementara dibuat dengan', tempScript.length, 'baris');

        // Backup state engine saat ini
        const currentState = engineCore.getState();
        labelPreviewScriptBackup = currentState.currentVNScript;
        labelPreviewStateBackup = JSON.parse(JSON.stringify(currentState.currentVNState));
        labelPreviewIndexBackup = currentState.currentVNIndex;
        labelPreviewHistoryBackup = JSON.parse(JSON.stringify(currentState.vnDialogueHistory));

        isLabelPreviewMode = true;

        engineCore.setState({
            currentVNScript: tempScript,
            currentVNIndex: 0,
            currentVNState: {
                backgroundStack: [{ type: null, src: null }],
                bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
                lastSpeaker: null,
                variables: {},
                isLabelPreviewMode: true
            },
            vnDialogueHistory: []
        });

        if (!previewWindow || previewWindow.isDestroyed()) {
            createPreviewWindow(payload.basePath);
        } else {
            previewWindow.show();
            previewWindow.focus();
            processPreviewLabelUpdate();
        }
    });

    // Request entri berikutnya dari preview label
    ipcMain.on('vn-engine:preview-label-next', () => {
        if (!isLabelPreviewMode) return;
        const state = engineCore.getState();

        if (state.currentVNState.pendingJump) {
            const target = state.currentVNState.pendingJump;
            delete state.currentVNState.pendingJump;
            engineCore.commitChoiceTarget(target);
        } else {
            engineCore.incrementIndex();
        }
        processPreviewLabelUpdate();
    });

    // Preview label choice
    ipcMain.on('vn-engine:preview-label-choice-made', (event, intent) => {
        if (!isLabelPreviewMode) return;
        const state = engineCore.getState();
        const resolved = engineCore.resolveChoiceIntent(intent);
        if (!resolved.ok) {
            console.warn(`[Preview] Intent choice ditolak: ${resolved.reason}`);
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

            previewWindow.webContents.send('vn-engine:update-display', autoDialoguePayload);
            state.currentVNState.pendingJump = choice.jump;
            return;
        }

        engineCore.commitChoiceTarget(choice.jump);
        processPreviewLabelUpdate();
    });

    // Reset preview label
    ipcMain.on('vn-engine:preview-label-reset', () => {
        if (!isLabelPreviewMode) return;
        engineCore.setState({
            currentVNIndex: 0,
            currentVNState: {
                backgroundStack: [{ type: null, src: null }],
                bgmState: { src: null, volume: undefined, pan: undefined, delay: undefined },
                lastSpeaker: null,
                variables: {},
                isLabelPreviewMode: true
            },
            vnDialogueHistory: []
        });
        processPreviewLabelUpdate();
    });

    // Tutup preview label dan restore state
    ipcMain.on('vn-engine:preview-label-close', () => {
        console.log('[Preview] Menutup dan restore state.');
        restoreLabelPreviewState();
    });
}

function isInPreviewMode() {
    return isLabelPreviewMode;
}

function getProcessPreviewLabelUpdate() {
    return processPreviewLabelUpdate;
}

function getPreviewWindow() {
    return previewWindow;
}

// =============================================
// Hub & Player Preview Windows
// =============================================
let hubPreviewWindow = null;
let hubPreviewSourcePath = null;
let playerPreviewWindow = null;

function openHubPreview(novelTitle, hubConfig, visualNovelsDirectory, draftMetaData = {}) {
    const novelPath = path.join(visualNovelsDirectory, novelTitle);
    const globalHubPath = path.join(path.dirname(__dirname), 'aset', 'game', 'hub-templates', '_global', 'novel-hub.html');
    // Konsisten dengan runtime: materialisasi hub lokal bila novel generated lama
    // belum punya file, agar preview pun mem-boot file milik novel itu sendiri.
    try {
        require('./hub-scaffolder').ensureLocalHub(novelPath, hubConfig, { title: novelTitle });
    } catch (err) {
        console.error('[Preview] ensureLocalHub gagal (lanjut pakai fallback):', err);
    }
    const source = resolveHubSource(novelPath, globalHubPath, hubConfig);

    if (hubPreviewWindow && !hubPreviewWindow.isDestroyed() && hubPreviewSourcePath === source.filePath) {
        // Push new config to existing window
        hubPreviewWindow.webContents.send('preview:apply-hub-config', hubConfig);
        hubPreviewWindow.webContents.send('preview:apply-hub-meta', draftMetaData);
        hubPreviewWindow.show();
        hubPreviewWindow.focus();
        return hubPreviewWindow;
    }
    if (hubPreviewWindow && !hubPreviewWindow.isDestroyed()) {
        hubPreviewWindow.close();
    }

    hubPreviewWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'Hub Preview — ' + novelTitle,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    // Pilih file hub sesuai hubType — sama seperti runtime di ipc-handlers.js
    hubPreviewSourcePath = source.filePath;
    const openedHubPreviewWindow = hubPreviewWindow;
    hubPreviewWindow.loadFile(source.filePath);

    openedHubPreviewWindow.webContents.once('did-finish-load', () => {
        // Inject basePath and fire the existing context handler
        const novelPathNorm = novelPath.replace(/\\/g, '/') + '/';

        // Baca novel-meta.json agar preview mendapat metadata lengkap (sama seperti runtime)
        let metaData = {};
        try {
            const metaPath = path.join(novelPath, 'novel-meta.json');
            if (fs.existsSync(metaPath)) {
                metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                if (!metaData.cover) {
                    metaData.cover = fs.readdirSync(novelPath).find(file =>
                        /^cover\.(jpg|jpeg|png|webp|gif)$/i.test(file)
                    ) || '';
                }
                // UX-A07b: ekstensi nyata dari disk (mp4/webm), bukan tebakan video.mp4.
                if (!metaData.promotionalVideo) {
                    metaData.promotionalVideo = fs.readdirSync(novelPath).find(file =>
                        /^video\.(mp4|webm)$/i.test(file)
                    ) || '';
                }
            }
        } catch (err) {
            console.error('[Preview] Gagal membaca novel-meta.json untuk hub preview:', err);
        }
        metaData = { ...metaData, ...(draftMetaData || {}) };

        const contextPayload = {
            storyTitle: novelTitle,
            novelPath: novelPathNorm,
            metaData: metaData,
            hubConfig: hubConfig
        };
        const injectScript = `
            window.__previewMode = true;
            window.__previewNovelTitle = ${JSON.stringify(novelTitle)};
            window.__previewBasePath = ${JSON.stringify(novelPathNorm)};
            require('electron').ipcRenderer.emit('vn-engine:set-hub-context', null, ${JSON.stringify(contextPayload)});
        `;
        const sendContext = () => openedHubPreviewWindow.webContents.executeJavaScript(injectScript).catch(() => {});
        if (source.useBridge) {
            const jsDir = path.join(path.dirname(__dirname), 'vn-player', 'js');
            const bridgeCode = fs.readFileSync(path.join(jsDir, 'vn-hub-api.js'), 'utf-8');
            const runtimeCode = fs.readFileSync(path.join(jsDir, 'vn-hub-runtime.js'), 'utf-8');
            openedHubPreviewWindow.webContents.executeJavaScript(bridgeCode + '\n;\n' + runtimeCode).then(sendContext).catch(() => {});
        } else {
            sendContext();
        }
    });

    openedHubPreviewWindow.on('closed', () => {
        if (hubPreviewWindow === openedHubPreviewWindow) {
            hubPreviewWindow = null;
            hubPreviewSourcePath = null;
        }
    });
    return hubPreviewWindow;
}

function openPlayerPreview(novelTitle, playerProfile, visualNovelsDirectory, chapterName) {
    // Merge effective config (global + chapter override) agar preview = runtime
    const { buildEffectivePlayerConfig } = require('./hub-config-manager');
    let effectiveProfile = playerProfile;
    if (chapterName) {
        try {
            const hubConfigPath = path.join(visualNovelsDirectory, novelTitle, 'hub-config.json');
            if (fs.existsSync(hubConfigPath)) {
                const hubConfig = JSON.parse(fs.readFileSync(hubConfigPath, 'utf-8'));
                effectiveProfile = buildEffectivePlayerConfig(hubConfig, chapterName);
            }
        } catch (err) {
            console.error('[Preview] Gagal merge effective player config:', err);
        }
    }

    if (playerPreviewWindow && !playerPreviewWindow.isDestroyed()) {
        playerPreviewWindow.webContents.send('preview:apply-player-config', effectiveProfile);
        playerPreviewWindow.show();
        playerPreviewWindow.focus();
        return playerPreviewWindow;
    }

    const novelPath = path.join(visualNovelsDirectory, novelTitle);

    // --- Persiapkan chapter preview jika chapterName diberikan ---
    let chapterScript = null;
    let chapterPath = null;
    if (chapterName) {
        chapterPath = path.join(novelPath, chapterName);
        const scriptPath = path.join(chapterPath, 'script.json');
        try {
            const raw = fs.readFileSync(scriptPath, 'utf-8');
            chapterScript = normalizeScript(JSON.parse(raw));
            console.log(`[Preview] Chapter script dimuat: ${chapterName} (${chapterScript.length} entri)`);
        } catch (err) {
            console.error(`[Preview] Gagal memuat script.json untuk chapter "${chapterName}":`, err.message);
            chapterScript = null;
        }
    }

    // Backup engine state dan load chapter script (jika ada)
    if (chapterScript) {
        const currentState = engineCore.getState();
        chapterPreviewScriptBackup = currentState.currentVNScript;
        chapterPreviewStateBackup = JSON.parse(JSON.stringify(currentState.currentVNState));
        chapterPreviewIndexBackup = currentState.currentVNIndex;
        chapterPreviewHistoryBackup = JSON.parse(JSON.stringify(currentState.vnDialogueHistory));
        chapterPreviewTitleBackup = currentState.currentStoryTitle;
        chapterPreviewChapterBackup = currentState.currentChapter;

        isChapterPreviewMode = true;

        engineCore.setState({
            currentVNScript: chapterScript,
            currentVNIndex: 0,
            currentVNState: {
                backgroundStack: [{ type: null, src: null }],
                bgmState: { src: null, volume: undefined },
                lastSpeaker: null,
                variables: {}
            },
            vnDialogueHistory: [],
            currentStoryTitle: novelTitle,
            currentChapter: chapterName
        });
    }

    playerPreviewWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: chapterName
            ? `Player Preview — ${novelTitle} / ${chapterName}`
            : `Player Preview — ${novelTitle}`,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    // Set target window override agar processAndSendVNUpdate mengirim ke sini
    if (isChapterPreviewMode) {
        engineCore.setTargetWindow(playerPreviewWindow);
    }

    playerPreviewWindow.loadFile(path.join(path.dirname(__dirname), 'vn-player', 'player.html'));

    playerPreviewWindow.webContents.once('did-finish-load', () => {
        const playerDir = path.join(path.dirname(__dirname), 'vn-player');

        if (chapterScript && chapterPath) {
            // --- Chapter preview mode: kirim chapter context ---
            const basePathNorm = chapterPath.replace(/\\/g, '/');
            const novelPathNorm = novelPath.replace(/\\/g, '/');

            // Inject preview flag + player profile styling terlebih dahulu
            const profileInjectScript = buildPlayerProfileInjectScript(effectiveProfile, playerDir);
            playerPreviewWindow.webContents.executeJavaScript(profileInjectScript).catch(() => {});

            // Kirim chapter context (same as proceedToPlayChapter di core.js)
            playerPreviewWindow.webContents.send('vn-engine:set-chapter-context', {
                storyTitle: novelTitle,
                chapter: chapterName,
                basePath: basePathNorm,
                novelPath: novelPathNorm
            });
        } else {
            // --- Styling-only preview (tanpa chapter) ---
            const basePath = 'file:///' + novelPath.replace(/\\/g, '/') + '/';
            const injectScript = `
                window.__previewMode = true;
                window.__previewPlayerProfile = ${JSON.stringify(effectiveProfile)};
                if (typeof state !== 'undefined') { state.basePath = ${JSON.stringify(basePath)}; }
            ` + buildPlayerProfileInjectScript(effectiveProfile, playerDir);
            playerPreviewWindow.webContents.executeJavaScript(injectScript).catch(() => {});
        }
    });

    playerPreviewWindow.on('closed', () => {
        restoreChapterPreviewState();
        playerPreviewWindow = null;
    });
    return playerPreviewWindow;
}

// Helper: build inject script untuk player profile styling
function buildPlayerProfileInjectScript(playerProfile, playerDir) {
    return `
        (function() {
            window.__previewMode = true;
            var profile = ${JSON.stringify(playerProfile || {})};

            // 1-2 & 4 DICABUT (N5): tema, gaya dialog, dan customCSS tak lagi
            // datang dari JSON. Preview memuat kosmetik lewat cascade berkas yang
            // sama dengan runtime — kalau ia menyuntikkan lapisannya sendiri di
            // sini, preview kembali berbohong (kelas paritas yang sama dengan
            // salinan aturan carry, lihat paritas-preview-runtime).

            // 3. Sprite slots
            var slotsCount = parseInt(profile.spriteSlots) || 5;
            if (typeof VNSprites !== 'undefined' && VNSprites.setupSpriteSlots) {
                VNSprites.setupSpriteSlots(slotsCount);
            }

            // 5. Restrictions
            if (profile.restrictions && typeof state !== 'undefined') {
                state.isAutoModeAllowed = profile.restrictions.autoMode !== false;
                state.isSkipModeAllowed = profile.restrictions.skipMode !== false;
            }
        })();
    `;
}

// Terapkan profil player EFEKTIF chapter (global + override) ke jendela preview
// generik single-entry: tema/gaya dialog/sprite slots/customCSS + cascade theme.css
// (novel & chapter). Tanpa ini, preview entri chapter engine-default tampil dengan
// gaya DEFAULT, bukan tampilan runtime sebenarnya. (Chapter Custom Player pakai
// jalur openSingleEntryCustomPreview yang render lewat player.html-nya sendiri.)
function _applyEffectiveProfileToPreview(win, novel, chapter) {
    if (!win || win.isDestroyed() || !novel) return;
    const novelsDir = path.join(_appRoot(), 'aset', 'game', 'visual_novels');

    let effectiveProfile = null;
    try {
        const hubConfigPath = path.join(novelsDir, novel, 'hub-config.json');
        if (fs.existsSync(hubConfigPath)) {
            const { buildEffectivePlayerConfig } = require('./hub-config-manager');
            const hubConfig = JSON.parse(fs.readFileSync(hubConfigPath, 'utf-8'));
            effectiveProfile = buildEffectivePlayerConfig(hubConfig, chapter || null);
        }
    } catch (e) {
        console.error('[Preview] Gagal hitung profil efektif single-entry:', e.message);
    }
    if (!effectiveProfile) return;

    // Bersihkan jejak profil sebelumnya (jendela bisa dipakai ulang antar chapter).
    win.webContents.executeJavaScript(`
        (function () {
            var b = document.body;
            if (b) b.className = b.className.replace(/\\btheme-\\S+/g, '').trim();
            var gc = document.getElementById('game-container');
            if (gc) gc.className = gc.className.replace(/\\bdialogue-style-\\S+/g, '').trim();
            // Sejak perbaikan cascade, kelas gaya dialog yang BERLAKU ada di
            // <html> (lihat css/dialogue-variants.css). Membersihkan #game-container
            // saja meninggalkan gaya lama menyala di jendela yang dipakai ulang —
            // dan itu terbaca seperti "preview tak mengikuti setelan".
            document.documentElement.className =
                document.documentElement.className.replace(/\\bdialogue-style-\\S+/g, '').trim();
            ['dynamic-theme-css', 'preview-custom-css', 'preview-novel-theme', 'preview-chapter-theme']
                .forEach(function (id) { var o = document.getElementById(id); if (o) o.remove(); });
        })();
    `).catch(() => {});

    // Terapkan profil (tema/dialog/sprite/customCSS) — pakai helper yang sama dgn Live preview.
    const playerDir = path.join(path.dirname(__dirname), 'vn-player');
    win.webContents.executeJavaScript(buildPlayerProfileInjectScript(effectiveProfile, playerDir)).catch(() => {});

    // Cascade lewat resolver kanonik. Chapter bertanda `replace-novel` sengaja
    // melewati CSS novel, sama seperti runtime dan preview embedded.
    const cssFiles = [];
    const novelDir = path.join(novelsDir, novel);
    const themes = resolveEffectiveThemeFiles({
        novelDir,
        chapterDir: chapter ? path.join(novelDir, chapter) : null
    });
    if (themes.novelPath) cssFiles.push({ id: 'preview-novel-theme', file: themes.novelPath });
    if (themes.chapterPath) cssFiles.push({ id: 'preview-chapter-theme', file: themes.chapterPath });
    if (cssFiles.length) {
        let js = '(function(){';
        cssFiles.forEach(function (f) {
            // Revision query mencegah CSS template lama bertahan ketika path
            // chapter sama tetapi isinya baru ditimpa.
            const href = toVersionedFileUrl(f.file);
            js += 'var l=document.createElement("link"); l.rel="stylesheet"; l.id=' + JSON.stringify(f.id) +
                '; l.href=' + JSON.stringify(href) + '; document.head.appendChild(l);';
        });
        js += '})();';
        win.webContents.executeJavaScript(js).catch(() => {});
    }
}

// Restore engine state setelah chapter preview selesai
function restoreChapterPreviewState() {
    if (!isChapterPreviewMode) return;
    console.log('[Preview] Restoring engine state setelah chapter preview.');

    engineCore.setTargetWindow(null);

    if (chapterPreviewScriptBackup) {
        engineCore.setState({ currentVNScript: chapterPreviewScriptBackup });
    }
    if (chapterPreviewStateBackup) {
        engineCore.setState({ currentVNState: chapterPreviewStateBackup });
    }
    engineCore.setState({
        currentVNIndex: chapterPreviewIndexBackup,
        vnDialogueHistory: chapterPreviewHistoryBackup,
        currentStoryTitle: chapterPreviewTitleBackup,
        currentChapter: chapterPreviewChapterBackup
    });

    isChapterPreviewMode = false;
    chapterPreviewScriptBackup = null;
    chapterPreviewStateBackup = null;
    chapterPreviewIndexBackup = 0;
    chapterPreviewHistoryBackup = [];
    chapterPreviewTitleBackup = '';
    chapterPreviewChapterBackup = '';
}

// =============================================
// PLAYTHROUGH TERSEMAT — engine loop ASLI menggerakkan webview preview DI EDITOR
// (bukan BrowserWindow baru). Menjawab bug: preview Live dulu hanya stepper
// `update-display` satu-payload (isPreview) yang TIDAK menjalankan command scene,
// jadi kartu judul (command `boot`) & scene lain terlewat.
//
// Reuse mesin yang sudah terbukti: setTargetWindow + state chapter-preview + restore.
// Bedanya dari openPlayerPreview(): TIDAK membuat window & TIDAK memuat file — webview
// editor sudah memuat player.html (shim) chapter yang BENAR (jadi scene/CSS-nya ikut).
// Kita cukup mengarahkan loop ke sana lalu mengirim `set-chapter-context` (jalur
// gameplay ASLI, BUKAN isPreview) sehingga command benar-benar jalan.
function startEmbeddedPlaythrough(webContents, novelTitle, chapterName) {
    if (!webContents || webContents.isDestroyed()) return { success: false, message: 'webContents preview tidak valid.' };
    if (!novelTitle || !chapterName) return { success: false, message: 'novel/chapter kosong.' };

    const chapterPath = _chapterDirFor(novelTitle, chapterName);
    const scriptPath = path.join(chapterPath, 'script.json');
    let chapterScript;
    try {
        chapterScript = normalizeScript(JSON.parse(fs.readFileSync(scriptPath, 'utf-8')));
    } catch (err) {
        return { success: false, message: 'Gagal membaca script.json: ' + err.message };
    }

    // Bereskan playthrough sebelumnya bila masih aktif (ganti target/chapter).
    if (isChapterPreviewMode) restoreChapterPreviewState();

    // Backup state engine lalu muat chapter (persis pola openPlayerPreview).
    const cur = engineCore.getState();
    chapterPreviewScriptBackup = cur.currentVNScript;
    chapterPreviewStateBackup = JSON.parse(JSON.stringify(cur.currentVNState || {}));
    chapterPreviewIndexBackup = cur.currentVNIndex;
    chapterPreviewHistoryBackup = JSON.parse(JSON.stringify(cur.vnDialogueHistory || []));
    chapterPreviewTitleBackup = cur.currentStoryTitle;
    chapterPreviewChapterBackup = cur.currentChapter;
    isChapterPreviewMode = true;

    engineCore.setState({
        currentVNScript: chapterScript,
        currentVNIndex: 0,
        currentVNState: { backgroundStack: [{ type: null, src: null }], bgmState: { src: null, volume: undefined }, lastSpeaker: null, variables: {} },
        vnDialogueHistory: [],
        currentStoryTitle: novelTitle,
        currentChapter: chapterName
    });

    // Arahkan output engine loop ke webview tersemat. Bungkus MENIRU kontrak
    // BrowserWindow yang dipakai engine loop: `.webContents.send()` DAN `.isDestroyed()`
    // (processAndSendVNUpdate:627 & requestPrevLine:56 memanggil keduanya — lupa
    // isDestroyed = TypeError "isDestroyed is not a function" saat entri pertama).
    engineCore.setTargetWindow({
        webContents: webContents,
        isDestroyed: function () { try { return webContents.isDestroyed(); } catch (e) { return true; } }
    });

    // Jalur gameplay ASLI: set-chapter-context → engine muat config+extension → kirim
    // sendiri 'vn-engine:ready' → main memanggil processAndSendVNUpdate (bukan label
    // preview) → entri 0 dikirim ke target. Klik di webview → request-next-line → maju.
    const novelPathNorm = path.join(_appRoot(), 'aset', 'game', 'visual_novels', novelTitle).replace(/\\/g, '/');
    webContents.send('vn-engine:set-chapter-context', {
        storyTitle: novelTitle,
        chapter: chapterName,
        basePath: chapterPath.replace(/\\/g, '/'),
        novelPath: novelPathNorm,
        enginePath: path.join(_appRoot(), 'vn-player')
    });
    return { success: true, chapter: chapterName, entries: chapterScript.length };
}

// ============================================================
// SCOPE TEMA PREVIEW — "target menentukan berkas, chapter cuma penyedia isi"
//
// Preview Live adalah PLAYTHROUGH: ia wajib memutar sebuah chapter sungguhan.
// Waktu kreator menyunting target Global, tak ada chapter yang jadi miliknya,
// jadi satu chapter dipilih sekadar sebagai penyedia naskah.
//
// Masalahnya, engine me-resolve cascade theme.css-nya SENDIRI dari chapter yang
// sedang diputar (extension-loader.loadCSSCascade). Kalau chapter itu kebetulan
// punya theme.css ber-marka `replace-novel` — dan marka itu ditulis tiap kali
// template diterapkan ke sebuah chapter — maka theme.css NOVEL dilewati. Akibatnya
// kreator memilih template di Global, berkasnya benar-benar tertulis, tetapi
// preview di sebelahnya tak berubah sedikit pun. Ia tampak seperti fitur rusak.
//
// Perbaikannya ditaruh DI SINI, bukan di engine, dan itu disengaja: engine yang
// dikirim ke pemain tidak boleh tahu-menahu soal editor. Yang tahu cuma main,
// yang memang sudah memegang identitas webview preview lewat `webContentsId`.
//
// Kenapa bukan mencabut <link> dari sisi editor sesudah engine memasangnya:
//   - link yang disuntik extension-loader TIDAK ber-id, jadi harus dicari lewat
//     href;
//   - jalur hot-reload di init.js me-resolve ULANG tiap config didorong, jadi
//     tema chapter akan kembali sendiri;
//   - keduanya balapan waktu melawan pemuatan chapter.
// Mencegat di resolver membuat SEMUA pemanggil (extension-loader, init.js
// hot-reload, vn-player-api) menerima jawaban yang sama, sekali dan deterministik.
// ============================================================
const _previewThemeScope = new Map();   // webContents.id -> { storyTitle, chapter }

function setPreviewThemeScope(wcId, scope) {
    if (wcId == null) return;
    _previewThemeScope.set(wcId, scope || null);
}

function clearPreviewThemeScope(wcId) {
    if (wcId == null) _previewThemeScope.clear();
    else _previewThemeScope.delete(wcId);
}

/**
 * Scope tema yang berlaku untuk sebuah webContents preview, atau null bila ia
 * bukan preview editor (yaitu runtime sungguhan — yang TIDAK boleh disentuh).
 */
function getPreviewThemeScope(wcId) {
    if (wcId == null) return null;
    return _previewThemeScope.get(wcId) || null;
}

function stopEmbeddedPlaythrough() {
    restoreChapterPreviewState();   // setTargetWindow(null) + restore state + reset flags
    // Scope tema ikut dilepas: webview yang sama bisa dipakai ulang untuk target
    // lain, dan scope basi akan membuatnya merender berkas milik target kemarin.
    clearPreviewThemeScope(null);
    return { success: true };
}

function getHubPreviewWindow() { return hubPreviewWindow; }
function getPlayerPreviewWindow() { return playerPreviewWindow; }

function pushHubConfig(config) {
    if (hubPreviewWindow && !hubPreviewWindow.isDestroyed()) {
        hubPreviewWindow.webContents.send('preview:apply-hub-config', config);
    }
}

function pushHubMeta(metaData) {
    if (hubPreviewWindow && !hubPreviewWindow.isDestroyed()) {
        hubPreviewWindow.webContents.send('preview:apply-hub-meta', metaData);
    }
}

// J3 (audit): dulu selalu no-op senyap bila jendela preview tak ada / sudah
// ditutup, dan handler IPC-nya tetap melaporkan success:true — kegagalan
// hot-reload mustahil dideteksi pemanggil. Sekarang mengembalikan status
// penerima supaya editor bisa membedakan "terkirim" vs "tak ada penerima".
function pushPlayerConfig(config, options = {}) {
    if (playerPreviewWindow && !playerPreviewWindow.isDestroyed()) {
        const payload = options.refreshCss === false
            ? { __vnPlayerConfigEnvelope: true, profile: config, refreshCss: false }
            : config;
        playerPreviewWindow.webContents.send('preview:apply-player-config', payload);
        return { delivered: true };
    }
    return { delivered: false, reason: 'Jendela player preview tidak terbuka.' };
}

module.exports = {
    registerHandlers,
    isInPreviewMode,
    isInChapterPreviewMode() { return isChapterPreviewMode; },
    getProcessPreviewLabelUpdate,
    getPreviewWindow,
    openHubPreview,
    openPlayerPreview,
    getHubPreviewWindow,
    getPlayerPreviewWindow,
    startEmbeddedPlaythrough,
    stopEmbeddedPlaythrough,
    setPreviewThemeScope,
    clearPreviewThemeScope,
    getPreviewThemeScope,
    pushHubConfig,
    pushHubMeta,
    pushPlayerConfig
};
