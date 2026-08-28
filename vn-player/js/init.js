/**
 * VN Player — Init
 * Bootstrap file — menginisialisasi semua modul dan mendaftarkan IPC listeners.
 * File ini harus di-load terakhir setelah semua modul lain sudah tersedia.
 */

(() => {
    const { ipcRenderer } = require('electron');
    const path = require('path');
    const fs = require('fs');
    const { dom, state } = VNState;

    // Track semua IPC listeners
    const _ipcListeners = new Map();

    function registerIPCListener(channel, handler) {
        // Remove old listener jika ada
        if (_ipcListeners.has(channel)) {
            ipcRenderer.removeListener(channel, _ipcListeners.get(channel));
        }
        
        // Register new listener
        ipcRenderer.on(channel, handler);
        _ipcListeners.set(channel, handler);
    }

    // Cleanup function
    function cleanupIPCListeners() {
        _ipcListeners.forEach((handler, channel) => {
            ipcRenderer.removeListener(channel, handler);
        });
        _ipcListeners.clear();
    }

    // Register cleanup
    window.addEventListener('beforeunload', cleanupIPCListeners);

    // Built-in transitions dan extensions sudah self-register via VNRegistry

    // Root engine (folder vn-player/). Untuk player global `__dirname` sudah benar,
    // TAPI untuk engine-shim (audit E1) dokumen hidup di folder CHAPTER sehingga
    // `__dirname` menunjuk ke sana — path themes/<x>/theme.css akan meleset.
    // Main mengirim `enginePath` di set-chapter-context; nilai itu dipakai bila ada.
    let ENGINE_DIR = __dirname;

    // === HELPER: RESOLVE PATH ASET ===
    // Karena player.html sekarang di vn-player/, path aset relatif dari chapter
    // tidak bisa langsung dipakai. Fungsi ini prepend basePath ke path relatif.
    window.resolveAssetPath = function(relativePath) {
        if (!relativePath) return '';
        // Skip kalau sudah absolute URL atau data URI
        if (relativePath.startsWith('file://') || 
            relativePath.startsWith('http://') || 
            relativePath.startsWith('https://') ||
            relativePath.startsWith('data:') ||
            relativePath.startsWith('blob:')) {
            return relativePath;
        }
        // Prepend base path dari chapter folder
        if (state.basePath) {
            return `file:///${state.basePath}/${relativePath}`;
        }
        return relativePath;
    };

    // === IPC: TERIMA CHAPTER CONTEXT ===
    registerIPCListener('vn-engine:set-chapter-context', async (event, context) => {
        console.log('[Player] Chapter context diterima:', context);
        state.basePath = context.basePath;
        state.novelPath = context.novelPath;
        state.storyTitle = context.storyTitle;
        state.chapterName = context.chapter;
        if (context.enginePath) ENGINE_DIR = context.enginePath;   // E1: shim-aware
        document.title = `${context.storyTitle} | ${context.chapter}`;

        // Hub Config & Chapter Config Integration (Fase 3)
        try {
            const result = await ipcRenderer.invoke('get-hub-config', context.storyTitle);
            if (result && result.success && result.config) {
                // Merge: playerProfile (novel default) → chapterConfig (chapter override).
                // Hanya kunci PLAYER yang menimpa (audit I3) — `hidden`/`badge` adalah
                // metadata Chapter Select milik tab Story dan TIDAK boleh bocor ke
                // config efektif. Acuan kanonik: buildEffectivePlayerConfig()
                // di vn-engine/hub-config-manager.js.
                const profile = result.config.playerProfile || {};
                const chapterOverride = (result.config.chapterConfig || {})[context.chapter];
                let chapterCfg = null;
                if (chapterOverride) {
                    chapterCfg = { ...profile };
                    ['spriteSlots'].forEach((k) => {
                        if (chapterOverride[k] !== undefined) chapterCfg[k] = chapterOverride[k];
                    });
                    chapterCfg.restrictions = { ...profile.restrictions, ...(chapterOverride.restrictions || {}) };
                } else if (Object.keys(profile).length > 0) {
                    chapterCfg = { ...profile };
                }
                state.chapterConfig = chapterCfg;
                
                if (chapterCfg) {
                    // N5: `playerTheme`, `dialogueStyle`, dan `customCSS` TIDAK lagi
                    // dibaca dari config. Ketiganya kini hidup sebagai CSS di berkas
                    // milik kreator (`<novel|chapter>/theme.css`, cascade lapis 4-5)
                    // — satu rumah yang terlihat di pohon berkas dan bisa disunting.
                    // Novel lama dimigrasi `tools/materialisasi-tema-n5.js`.
                    // Yang tersisa di sini murni PERILAKU, bukan kosmetik.

                    // Apply custom sprite slots if defined, otherwise 5
                    const slotsCount = parseInt(chapterCfg.spriteSlots) || 5;
                    VNSprites.setupSpriteSlots(slotsCount, true);


                    // Apply restrictions
                    if (chapterCfg.restrictions) {
                        state.isAutoModeAllowed = chapterCfg.restrictions.autoMode !== false;
                        state.isSkipModeAllowed = chapterCfg.restrictions.skipMode !== false;
                        
                        if (!state.isAutoModeAllowed && dom.autoModeButton) {
                            dom.autoModeButton.style.display = 'none';
                        }
                    } else {
                        state.isAutoModeAllowed = true;
                        state.isSkipModeAllowed = true;
                    }
                } else {
                    state.chapterConfig = null;
                    VNSprites.setupSpriteSlots(5, true);
                }
            } else {
                VNSprites.setupSpriteSlots(5, true);
            }
        } catch (error) {
            console.error('[Player] Gagal mengambil konfigurasi chapter:', error);
            VNSprites.setupSpriteSlots(5, true); // Fallback slots
        }

        // Restore player preferences dari save data (jika load game)
        if (context.playerPreferences) {
            const prefs = context.playerPreferences;
            if (prefs.bgm != null) state.bgmVolumeMultiplier = prefs.bgm;
            if (prefs.voice != null) state.voiceVolumeMultiplier = prefs.voice;
            if (prefs.sfx != null) state.sfxVolumeMultiplier = prefs.sfx;
            if (prefs.textSpeed != null) state.TYPE_SPEED = prefs.textSpeed;
            if (prefs.autoDelay != null) state.AUTO_MODE_DELAY = prefs.autoDelay;
            VNAudio.applyVolumeSettings();
            console.log('[Player] Player preferences di-restore dari save data.');
        }

        // Sekarang update extension loader path (novel context terdeteksi).
        // (N5: lapisan `customCSS` dari JSON sudah tak ada — kosmetik paling lokal
        // kini `<chapter>/theme.css`, yang dimuat loadCSSCascade() di awal loadAll.)
        //
        // DITUNGGU sebelum 'ready' (perbaikan balapan): loadJSExtensions() async,
        // jadi HOOK & COMMAND dari extension wajib terdaftar SEBELUM engine mulai
        // menggambar. Tanpa await, entri PERTAMA yang bergantung pada extension
        // — command boot/minigame, atau `player:before-dialogue` di baris pertama —
        // sempat terlewati karena handler-nya belum ada saat entri diproses.
        // Dijaga timeout agar extension yang menggantung tak pernah membekukan cerita.
        try {
            await Promise.race([
                VNExtensionLoader.loadAll(),
                new Promise((resolve) => setTimeout(resolve, 4000))
            ]);
        } catch (e) {
            console.error('[Player] loadAll gagal (lanjut tanpa memblokir):', e);
        }

        // Kirim ready signal setelah context di-set & extension siap
        ipcRenderer.send('vn-engine:ready');

        // Discord RPC
        if (context.storyTitle && context.storyTitle !== 'VN Player') {
            ipcRenderer.send('update-rpc-activity', {
                details: `Membaca: ${context.storyTitle}`,
                state: context.chapter,
                largeImageKey: 'vn_icon',
                smallImageKey: 'main_icon',
                smallImageText: 'Sedang Membaca'
            });
        }

        dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
    });

    // === INISIALISASI ===

    // Responsive scaling
    VNSprites.updateResponsiveScaling();
    let resizeTimeout;
    window.addEventListener('resize', () => {
        VNSprites.updateResponsiveScaling();
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => VNSprites.refreshSpriteScales(), 100);
    });

    // Muat volume settings dari localStorage
    VNAudio.loadVolumeSettings();

    // Lokalkan string UI player ke bahasa aktif (async, aman diabaikan hasilnya).
    if (typeof VNI18n !== 'undefined') VNI18n.init();

    // Setup semua UI event listeners
    VNPanels.setupUIListeners();

    // === IPC LISTENERS ===

    // Listener utama: update display dari engine
    registerIPCListener('vn-engine:update-display', (event, data) => {
        console.log('%c[Player] Data payload baru:', 'color: lightblue; font-weight: bold;', data);

        // Preview mode detection
        if (data.isPreview) {
            state.isPreviewMode = true;
            // Tandai DOM sedang di PREVIEW. Preview merender satu entri, bukan
            // memutar cerita dari awal — jadi hook/command boot (mis. yang
            // menutup kartu judul lalu membukanya) tak pernah jalan. CSS "cover
            // frame pertama" milik kreator harus mengecualikan penanda ini
            // (`body:not([data-vn-preview])`) supaya tak nyangkut menutupi preview.
            if (document.body) document.body.setAttribute('data-vn-preview', '1');

            if (data.isLabelPreview && data.labelPreviewInfo) {
                state.isLabelPreviewMode = true;
                state.labelPreviewInfo = data.labelPreviewInfo;
                document.title = `Preview Label: ${state.labelPreviewInfo.labelName} [${state.labelPreviewInfo.currentIndex + 1}/${state.labelPreviewInfo.totalEntries}]`;
            }

            // Context visual dari editor
            if (data._contextBackground && !data.background) {
                data.background = data._contextBackground;
                data.backgroundMode = data._contextBackgroundMode || 'cover';
            }
            if (data._contextVideo && !data.video) data.video = data._contextVideo;
            if (data._contextBgm && !data.bgm) {
                data.bgm = data._contextBgm;
                if (data.bgmVolume === undefined) data.bgmVolume = data._contextBgmVolume;
                if (data.bgmPan === undefined) data.bgmPan = data._contextBgmPan;
                if (data.bgmDelay === undefined) data.bgmDelay = data._contextBgmDelay;
                if (data.bgmLoop === undefined) data.bgmLoop = data._contextBgmLoop;
                if (data.bgmFade === undefined) data.bgmFade = data._contextBgmFade;
            }
            if (data._contextSpeaker && !data.speaker) data.speaker = data._contextSpeaker;

            VNDebugHUD.updateDebugHUD(data);
        }

        // Restore BGM mute
        if (state.isPhaseBgmCurrentlyMuted) {
            dom.bgmAudio.volume = state.originalPhaseBgmVolume;
            state.isPhaseBgmCurrentlyMuted = false;
        }

        state.pendingExitTransition = null;
        if (dom.voiceAudio && !dom.voiceAudio.paused) {
            dom.voiceAudio.pause();
            dom.voiceAudio.currentTime = 0;
        }

        hideEngineScene();
        dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
        state.currentData = data;

        // Rollback: sinkronkan tombol ◀ dengan ketersediaan riwayat di engine.
        // Payload tanpa field ini (mis. autoDialogue sintetis) = nonaktif.
        if (dom.rollbackButton) {
            dom.rollbackButton.classList.toggle('disabled', data.canRollback !== true);
        }
        clearTimeout(state.autoModeTimeout);
        dom.makeChoiceContainer.classList.remove('visible');

        // Wrapper untuk renderContent
        const renderCallback = (isHard = false) => VNDisplay.renderContent(data, isHard);

        // Jalankan transisi + render
        const transitionType = data.transition || 'cut';

        // Hook: player:before-transition — extensions bisa modify transisi atau cancel
        const hookResult = VNRegistry.runHooks('player:before-transition', {
            transition: transitionType, data
        });
        if (hookResult === false) return;
        const finalTransition = hookResult?.transition ?? transitionType;

        const handler = VNRegistry.get('transition', finalTransition) || VNRegistry.get('transition', 'cut');

        if (handler) {
            // Durasi per-entry (findings §3): field `transitionDuration` (ms) pada
            // entri meng-override durasi default HANYA untuk transisi ini. Aman karena
            // semua handler membaca state.transitionDuration secara sinkron saat invokasi.
            const prevDuration = state.transitionDuration;
            const perEntry = Number(data.transitionDuration);
            if (perEntry > 0) state.transitionDuration = perEntry;
            try {
                handler(renderCallback, data.sfxIn, data.sfxInVolume, data.sfxInDelay, data.sfxInPan, data);
            } finally {
                state.transitionDuration = prevDuration;
            }
        } else {
            // Fallback: langsung render tanpa transisi
            renderCallback(false);
        }
    });

    // Transisi independen
    registerIPCListener('vn-engine:execute-transition', (event, data) => {
        const { effect, payload } = data;
        const handler = VNRegistry.get('transition', effect) || VNRegistry.get('transition', 'cut');

        dom.dialogueBox.classList.remove('visible');
        dom.makeChoiceContainer.classList.remove('visible');
        dom.makeChoiceContainer.innerHTML = '';

        const allSpriteImgs = dom.charSpritesLayer.querySelectorAll('.char-sprite-img');
        allSpriteImgs.forEach(img => { img.style.opacity = '0'; });
        VNSprites.clearDynamicCharSprites();

        const renderAssets = () => {
            if (payload.background) VNDisplay.playBackgroundImage(payload.background, false, payload.backgroundMode);
            else if (payload.video) VNDisplay.playBackgroundVideo(payload.video);
            VNAudio.playBGM(payload.bgm);
        };

        if (effect === 'cut') {
            renderAssets();
            ipcRenderer.send('vn-engine:request-next-line');
        } else if (handler) {
            handler(() => {
                renderAssets();
                setTimeout(() => ipcRenderer.send('vn-engine:request-next-line'), state.transitionDuration * 2);
            }, payload);
        }
    });

    // Volume global
    registerIPCListener('global-volume-changed', (event, newVol) => {
        state.globalVolume = newVol;
        if (!dom.bgmAudio.paused && !state.isPhaseBgmCurrentlyMuted) {
            dom.bgmAudio.volume = state.originalPhaseBgmVolume * state.globalVolume;
        }
    });

    // =============================================
    // Layar akhir = SCENE, bukan simpul DOM milik engine
    // =============================================
    // Dulu engine memegang `#chapter-end-screen` beserta tiga tombolnya lewat id
    // tetap. Akibatnya layar akhir tak pernah benar-benar bisa diganti: player yang
    // menulis versinya sendiri tetap harus membiarkan markup engine ada di dokumen.
    // Sekarang engine cuma tahu SATU hal — cari scene bernama "end" dan nyalakan.
    // Siapa pemilik markupnya (player bawaan, template, atau tulisan kreator) bukan
    // urusannya lagi.
    //
    // `data-scene-action` adalah kontrak terbuka: tombol ber-atribut ini dikaitkan
    // engine di scene MANA PUN, jadi ending buatan kreator dapat perilaku standar
    // tanpa menulis IPC sendiri.
    const SCENE_ACTIONS = {
        // Intent saja: main process yang menentukan chapter berikutnya dari
        // chapters.json/fallback order, memeriksa lock, lalu memasukkannya ke
        // pipeline play-chapter canonical (security + source resolver). Memajukan
        // baris di EOF hanya akan menampilkan end screen yang sama berulang kali.
        next: () => ipcRenderer.send('vn-engine:play-next-chapter'),
        replay: () => ipcRenderer.send('vn-engine:replay-chapter'),
        hub: () => {
            // Serahkan ke main process untuk menentukan hub mana yang dimuat
            // (kustom vs default vs legacy — routing terpusat di ipc-handlers.js)
            if (state.storyTitle) {
                ipcRenderer.send('vn-engine:return-to-hub', { storyTitle: state.storyTitle });
            } else {
                // Fallback: kembali ke VN Manager (daftar novel)
                ipcRenderer.send('vn-engine:exit-to-manager');
            }
        }
    };

    // …dan sampai sekarang kalimat di atas TIDAK benar. Satu-satunya pemanggil
    // `wireSceneActions` adalah `showEngineScene`, dan itu hanya pernah dipanggil
    // untuk scene 'end'. Jadi tombol `data-scene-action` di scene yang dinyalakan
    // KREATOR sendiri (lewat VNPlayer.scene.show) tak pernah dikaitkan siapa pun —
    // ia diam. Kontrak yang dijanjikan komentar cuma berlaku untuk satu scene.
    //
    // Delegasi di document menutupnya: tombol di scene MANA PUN ikut, termasuk
    // scene yang markup-nya baru masuk belakangan (template, shim, extension) —
    // tanpa perlu ada yang mengaitkan ulang saat markup bertambah.
    // `btn.onclick` yang sudah terpasang MENANG: itu jalur `opts.actions`
    // (mis. preview label mengganti arti 'replay'), dan menjalankan keduanya
    // berarti aksi berjalan dua kali.
    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-scene-action]');
        if (!btn || btn.onclick) return;
        const handler = SCENE_ACTIONS[btn.getAttribute('data-scene-action')];
        if (handler) handler();
    });

    function wireSceneActions(sceneEl, opts) {
        if (!sceneEl) return;
        const o = opts || {};
        sceneEl.querySelectorAll('[data-scene-action]').forEach((btn) => {
            const act = btn.getAttribute('data-scene-action');
            // 'next' disembunyikan bila memang tak ada chapter berikutnya — kreator
            // tak perlu mengurus ini sendiri di tiap ending yang ia tulis.
            if (act === 'next' && o.hasNextChapter === false) { btn.style.display = 'none'; return; }
            if (act === 'next') btn.style.display = '';
            const handler = (o.actions && o.actions[act]) || SCENE_ACTIONS[act];
            if (handler) btn.onclick = handler;
        });
    }

    // Scene terakhir yang dinyalakan ENGINE. Dilacak supaya baris cerita berikutnya
    // hanya menutup layar milik engine — scene yang kreator nyalakan sendiri tidak
    // ikut dimatikan secara diam-diam.
    let _engineScene = '';
    function showEngineScene(id, opts) {
        const el = document.querySelector('[data-player-scene="' + id + '"]');
        if (!el) return false;            // player ini memang tak punya layar itu
        wireSceneActions(el, opts);
        _engineScene = id;
        return VNPlayer.scene.show(id);
    }
    function hideEngineScene() {
        if (!_engineScene) return;
        const el = document.querySelector('[data-player-scene="' + _engineScene + '"]');
        if (el) el.classList.remove('vn-scene-active');
        if (document.body && document.body.getAttribute('data-vn-scene') === _engineScene) {
            document.body.removeAttribute('data-vn-scene');
        }
        _engineScene = '';
    }

    // End of chapter
    registerIPCListener('vn-engine:end-of-chapter', (event, data) => {
        dom.gameContainer.removeEventListener('click', VNInput.handleGameContainerClick);
        VNSprites.clearAllSprites();
        dom.dialogueBox.classList.add('visible');
        dom.characterName.textContent = "";
        dom.dialogueText.textContent = "Chapter telah berakhir.";
        // Hook player:end-screen — beri extension/player kesempatan MENGGANTI layar
        // akhir dengan scene ending pilihannya sendiri (mis. ending bercabang).
        // return false → engine tidak menyalakan apa pun; pemanggil hook yang urus.
        // Tanpa hook terdaftar, runHooks mengembalikan context (≠ false) → perilaku baku.
        const endScreenCtx = VNRegistry.runHooks('player:end-screen', {
            hasNextChapter: !!data.hasNextChapter,
            storyTitle: state.storyTitle
        });
        if (endScreenCtx !== false) {
            showEngineScene('end', { hasNextChapter: !!data.hasNextChapter });
        }
    });

    // Preview label finished
    registerIPCListener('vn-engine:preview-label-finished', (event, data) => {
        let msg = `Label "${data.labelName}" telah selesai di-preview.`;
        if (data.finishedBy === 'jump') {
            if (data.jumpTarget === '##FINISH_PARENT##') msg = `Label "${data.labelName}" selesai. (Jump ke parent)`;
            else if (data.jumpTarget === '##SKIP_ALL_LABEL##') msg = `Label "${data.labelName}" selesai. (Skip semua)`;
            else if (data.jumpTarget.startsWith('fase:') || data.jumpTarget.startsWith('phase:')) {
                msg = `Label "${data.labelName}" selesai. (Fase: ${data.jumpTarget.replace(/^(fase:|phase:)/, '')})`;
            } else msg = `Label "${data.labelName}" selesai. (Jump: ${data.jumpTarget})`;
        } else if (data.finishedBy === 'jump-external') msg = `Label "${data.labelName}" selesai. (Eksternal: ${data.jumpTarget})`;
        else if (data.finishedBy === 'phase') msg = `Label "${data.labelName}" selesai. (Fase: ${data.phaseName})`;

        dom.gameContainer.removeEventListener('click', VNInput.handleGameContainerClick);
        dom.dialogueBox.classList.add('visible');
        dom.characterName.textContent = "Preview Selesai";
        dom.dialogueText.textContent = msg;
        // Layar "Preview Selesai" menumpang scene 'end' yang sama (dulu ia menumpang
        // simpul DOM #chapter-end-screen). Aksinya DIGANTI di sini — itulah gunanya
        // `opts.actions`: perilaku standar bisa ditimpa tanpa menyentuh markup.
        const previewShown = showEngineScene('end', {
            hasNextChapter: false,
            actions: {
                replay: () => {
                    hideEngineScene();
                    ipcRenderer.send('vn-engine:preview-label-reset');
                    dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
                },
                hub: () => ipcRenderer.send('vn-engine:close-preview-window')
            }
        });
        if (previewShown) {
            const sceneEl = document.querySelector('[data-player-scene="end"]');
            const replayBtn = sceneEl && sceneEl.querySelector('[data-scene-action="replay"]');
            const hubBtn = sceneEl && sceneEl.querySelector('[data-scene-action="hub"]');
            if (replayBtn) replayBtn.textContent = "Ulang Preview";
            if (hubBtn) hubBtn.textContent = "Tutup Preview";
        }
    });

    // Save success notification
    registerIPCListener('vn-engine:save-success', (event, slotId) => {
        VNState.showToast(`Game tersimpan di Slot ${slotId}!`, 'success');
    });

    // Save error notification
    registerIPCListener('vn-engine:save-error', (event, data) => {
        VNState.showToast(data && data.message ? data.message : 'Gagal menyimpan game.', 'error', 5000);
    });

    // Load error notification
    registerIPCListener('vn-engine:load-error', (event, data) => {
        VNState.showToast(data && data.message ? data.message : 'Gagal memuat save.', 'error', 5000);
    });

    // Direct special event trigger dari editor
    registerIPCListener('vn-engine:special-event', (event, data) => {
        VNEffects.executeSpecialEvent(data);
    });

    // === HOT-RELOAD: preview config push from editor ===
    registerIPCListener('preview:apply-player-config', async (event, payload) => {
        // Editor dapat mengirim envelope config-only untuk perubahan perilaku
        // (spriteSlots/restrictions). Payload lama tetap didukung dan dianggap perlu
        // refresh CSS, sehingga preview eksternal/custom yang belum bermigrasi aman.
        const isEnvelope = !!(payload && payload.__vnPlayerConfigEnvelope === true);
        const profile = isEnvelope ? payload.profile : payload;
        const refreshCss = !isEnvelope || payload.refreshCss !== false;
        if (!profile) return;
        console.log('[Player] Hot-reload: playerProfile diperbarui dari editor.');

        // N5: tak ada lagi lapisan tema dari JSON yang perlu dipasang/dicabut
        // di sini. Yang di-refresh tinggal berkas milik kreator.

        // J1 (audit): hot-reload dulu TIDAK menyentuh cascade theme.css novel/chapter
        // (itu hanya dimuat sekali saat boot lewat loadAll), sehingga kreator yang
        // membuat/mengubah theme.css harus boot ulang. Sekarang link cascade
        // di-refresh di sini juga — memakai resolver yang sama dengan custom player.
        if (refreshCss) {
            try {
                const css = await ipcRenderer.invoke('vn-engine:resolve-effective-css', {
                    storyTitle: state.storyTitle,
                    chapter: state.chapterName
                });
                ['hot-novel-theme', 'hot-chapter-theme'].forEach((id) => {
                    const old = document.getElementById(id);
                    if (old) old.remove();
                });
                [['hot-novel-theme', css && css.novelUrl], ['hot-chapter-theme', css && css.chapterUrl]]
                    .forEach(([id, href]) => {
                        if (!href) return;
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.id = id;
                        // cache-bust agar perubahan isi file ikut terbaca
                        link.href = href + (href.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
                        document.head.appendChild(link);
                    });
            } catch (e) { /* resolver tak tersedia — lanjutkan tanpa cascade file */ }

            // NORMALISASI URUTAN (koreksi audit #2/#3): appendChild memindahkan node
            // yang sudah ada, jadi re-append berurutan = penegakan cascade kanonik
            // yang murah & idempoten. Menjamin urutan akhir <head> benar TERLEPAS
            // dari cabang mana yang barusan menyentuhnya (refresh cascade, atau
            // injeksi preview-* dari editor yang datang balapan).
            // (N5: `dynamic-theme-css` & `*-custom-css` dicabut bersama lapisan JSON-nya.)
            ['preview-novel-theme', 'hot-novel-theme',
             'preview-chapter-theme', 'hot-chapter-theme'
            ].forEach((id) => {
                const el = document.getElementById(id);
                if (el) document.head.appendChild(el);
            });
        }

        // N5: gaya dialog TIDAK lagi disapu-lalu-dipasang dari config di sini.
        // Menyapu `dialogue-style-*` di jalur hot-reload dulu bahkan MENGHAPUS gaya
        // yang baru saja dipasang shim dari atribut `data-dialogue-style` (FB5) —
        // editor sampai perlu menurunkan nilainya dari FILE hanya untuk menambal itu.
        // Dengan lapisan JSON dicabut, tambalannya tak lagi punya alasan.

        // Update sprite slots
        if (typeof VNSprites !== 'undefined' && VNSprites.setupSpriteSlots) {
            const slotsCount = parseInt(profile.spriteSlots) || 5;
            VNSprites.setupSpriteSlots(slotsCount);
        }

        // Update restrictions
        if (profile.restrictions) {
            state.isAutoModeAllowed = profile.restrictions.autoMode !== false;
            state.isSkipModeAllowed = profile.restrictions.skipMode !== false;
            if (!state.isAutoModeAllowed && dom.autoModeButton) {
                dom.autoModeButton.style.display = 'none';
            } else if (state.isAutoModeAllowed && dom.autoModeButton) {
                dom.autoModeButton.style.display = '';
            }
        }
    });

    // === DOM READY: Fallback untuk preview mode (tanpa chapter context) ===
    document.addEventListener('DOMContentLoaded', () => {
        // Preview mode: tidak menerima set-chapter-context, langsung ready
        // Timeout kecil untuk memberi waktu IPC context sampai duluan
        setTimeout(() => {
            // `__vnSuppressPreviewFallback`: editor menyetelnya saat mode PLAYTHROUGH
            // tersemat — di sana `set-chapter-context` (jalur gameplay asli) yang datang,
            // jadi fallback preview-mode ini justru salah (menyalakan data-vn-preview →
            // mematikan kartu judul & memaksa mode single-entry). Untuk player global,
            // init.js sudah termuat sebelum DOMContentLoaded sehingga fallback ini bisa
            // menyala; flag mencegahnya. (Shim: init.js termuat SETELAH DOMContentLoaded,
            // listener tak pernah terpasang → fallback tak menyala; flag jadi cadangan.)
            if (!state.basePath && !window.__vnSuppressPreviewFallback) {
                console.log('[Player] Preview mode terdeteksi: tidak ada chapter context.');
                state.isPreviewMode = true;
                if (document.body) document.body.setAttribute('data-vn-preview', '1');
                ipcRenderer.send('vn-engine:ready');
                dom.gameContainer.addEventListener('click', VNInput.handleGameContainerClick);
            }
        }, 300);
    });
})();
