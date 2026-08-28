// =============================================
// Hub Config Manager — Read/Write/Migrate hub config
// Dipindahkan dari main.js untuk modularisasi
// =============================================

const path = require('path');
const fs = require('fs');
const { HUB_CONFIG_DEFAULTS, PLAYER_PROFILE_DEFAULTS, PLAYER_OVERRIDE_KEYS } = require('./config-defaults');
const { migrateHubConfig } = require('./config-migrator');
const hubScaffolder = require('./hub-scaffolder');
const hubTemplates = require('./hub-templates');
const { validatePathComponent, resolvePathWithinRoot } = require('./path-utils');
const { atomicWriteFileSync } = require('./atomic-writer');

function writeTextAtomic(filePath, content) {
    atomicWriteFileSync(filePath, content, { encoding: 'utf8' });
}

function writeJsonAtomic(filePath, value) {
    writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

function createDefaultHubConfig() {
    return {
        ...JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS)),
        playerProfile: { ...PLAYER_PROFILE_DEFAULTS }
    };
}

function ensureCustomHubFiles(novelPath) {
    const htmlPath = path.join(novelPath, 'hub.html');
    const cssPath = path.join(novelPath, 'hub.css');
    let created = false;

    if (!fs.existsSync(htmlPath)) {
        const starterHtml = `<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Custom Hub</title>
    <link rel="stylesheet" href="hub.css">
    <style>
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111522; color: #f4f5fa; font-family: Arial, sans-serif; }
        main { text-align: center; padding: 32px; }
        h1 { margin: 0 0 28px; font-size: clamp(2rem, 5vw, 4rem); }
        .actions { display: flex; justify-content: center; gap: 12px; }
        button { min-width: 132px; padding: 12px 18px; border: 1px solid #8995ff; background: #26315e; color: inherit; cursor: pointer; }
        button:hover { background: #374584; }
    </style>
</head>
<body>
    <main>
        <h1 id="novel-title">Visual Novel</h1>
        <div class="actions">
            <button id="start-button" type="button">Mulai</button>
            <button id="exit-button" type="button">Keluar</button>
        </div>
    </main>
    <script>
        function initializeHub() {
            if (typeof VNHub === 'undefined' || !VNHub.isReady()) return;
            var meta = VNHub.getNovelMeta();
            document.getElementById('novel-title').textContent = meta.title || VNHub.getStoryTitle() || 'Visual Novel';
            document.getElementById('exit-button').onclick = function () { VNHub.exitToManager(); };
            VNHub.getChapterList().then(function (chapters) {
                var firstChapter = chapters.mainChapters && chapters.mainChapters[0];
                var start = document.getElementById('start-button');
                start.disabled = !firstChapter;
                start.onclick = function () { if (firstChapter) VNHub.playChapter(firstChapter); };
            });
        }
        window.addEventListener('vnhub:api-ready', function () { VNHub.onReady(initializeHub); });
        window.addEventListener('vnhub:ready', initializeHub);
    </script>
</body>
</html>`;
        writeTextAtomic(htmlPath, starterHtml);
        created = true;
    }
    if (!fs.existsSync(cssPath)) {
        writeTextAtomic(cssPath, '');
    }
    return created;
}

/**
 * Registrasi IPC handlers untuk hub config management
 * @param {object} deps
 * @param {object} deps.ipcMain - Electron ipcMain
 * @param {string} deps.visualNovelsDirectory - Path ke visual_novels
 * @param {function} deps.getMainWindow - Getter mainWindow
 */
function registerHandlers(deps) {
    const { ipcMain, visualNovelsDirectory, getMainWindow } = deps;

    // Pustaka template Hub berbasis folder. Diletakkan bersebelahan dengan
    // visual_novels: aset/game/hub-templates/<id>/. Bisa di-override lewat deps.
    const hubTemplatesDirectory = deps.hubTemplatesDirectory ||
        path.join(visualNovelsDirectory, '..', 'hub-templates');

    function _resolveNovelPath(novelTitle) {
        const safeTitle = validatePathComponent(novelTitle, 'Nama novel');
        return resolvePathWithinRoot(visualNovelsDirectory, safeTitle);
    }

    function _resolveNovelFile(novelTitle, filename) {
        return resolvePathWithinRoot(_resolveNovelPath(novelTitle), filename);
    }

    function _validateSceneId(sceneId) {
        return validatePathComponent(sceneId, 'ID scene');
    }

    function _validateConfigSceneIds(config) {
        const scenes = config && Array.isArray(config.scenes) ? config.scenes : [];
        scenes.forEach(function (scene) {
            if (scene && scene.id != null) _validateSceneId(scene.id);
        });
        return config;
    }

    function _resolveRelativeDirectory(rootPath, relativePath) {
        if (typeof relativePath !== 'string' || relativePath.length === 0) {
            validatePathComponent(relativePath, 'Subfolder aset');
        }
        const components = relativePath.split(/[\\/]/).map(function (component) {
            return validatePathComponent(component, 'Subfolder aset');
        });
        return resolvePathWithinRoot(rootPath, ...components);
    }

    // ---- Ambil hub config ----
    // ============================================================
    // STORY → HUB BRIDGE: flag persisten per-novel (hub-flags.json)
    // Ditulis dari script lewat custom command `set_hub_flag`, dibaca hub via
    // VNHub.getStoryFlags(). Memungkinkan hub "sadar" hasil cerita (mis. jalur
    // yang dipilih, babak selesai) — bukan sekadar "chapter selesai".
    // ============================================================
    function _hubFlagsPath(novelTitle) {
        return _resolveNovelFile(novelTitle, 'hub-flags.json');
    }
    function _readHubFlags(novelTitle) {
        const p = _hubFlagsPath(novelTitle);
        if (!p || !fs.existsSync(p)) return { flags: {} };
        try {
            const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return { flags: (d && typeof d.flags === 'object' && d.flags) || {} };
        } catch (e) { return { flags: {} }; }
    }
    function _writeHubFlags(novelTitle, data) {
        const p = _hubFlagsPath(novelTitle);
        writeJsonAtomic(p, { flags: data.flags || {}, updatedAt: new Date().toISOString() });
        return true;
    }

    ipcMain.handle('vn-hub:set-story-flag', async (event, { novelTitle, key, value }) => {
        try {
            if (!novelTitle || !key) return { success: false, message: 'novelTitle & key wajib.' };
            const data = _readHubFlags(novelTitle);
            data.flags[String(key)] = value;
            if (!_writeHubFlags(novelTitle, data)) return { success: false, message: 'Path tidak valid.' };
            return { success: true, flags: data.flags };
        } catch (error) {
            console.error(`[HubConfigManager] set-story-flag gagal untuk '${novelTitle}':`, error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('vn-hub:get-story-flags', async (event, novelTitle) => {
        try {
            return { success: true, flags: _readHubFlags(novelTitle).flags };
        } catch (error) {
            return { success: false, flags: {}, message: error.message };
        }
    });

    ipcMain.handle('vn-hub:clear-story-flags', async (event, novelTitle) => {
        try {
            if (!_writeHubFlags(novelTitle, { flags: {} })) return { success: false, message: 'Path tidak valid.' };
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // ============================================================
    // VFS — "folder virtual" per-novel (2026-07-10, findings §9).
    // file karakter yang bisa "dihapus" pemain, file
    // misterius yang "muncul" di folder game) TIDAK boleh menyentuh filesystem
    // nyata dari renderer. VFS ini penggantinya yang tervalidasi: key-value
    // JSON tersimpan di <novel>/vfs.json (path-checked, per-novel, bisa di-diff),
    // dibaca-tulis dari hub (VNHub.vfs) maupun custom player (VNPlayer.vfs).
    // Key bebas berbentuk path-like (mis. "characters/monika.chr").
    // ============================================================
    function _vfsPath(novelTitle) {
        return _resolveNovelFile(novelTitle, 'vfs.json');
    }
    function _readVfs(novelTitle) {
        const p = _vfsPath(novelTitle);
        if (!p || !fs.existsSync(p)) return { files: {} };
        try {
            const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return { files: (d && typeof d.files === 'object' && d.files) || {} };
        } catch (e) { return { files: {} }; }
    }
    function _writeVfs(novelTitle, data) {
        const p = _vfsPath(novelTitle);
        writeJsonAtomic(p, { files: data.files || {}, updatedAt: new Date().toISOString() });
        return true;
    }

    ipcMain.handle('vn-novel:vfs-set', async (event, { novelTitle, key, value }) => {
        try {
            if (!novelTitle || !key) return { success: false, message: 'novelTitle & key wajib.' };
            const data = _readVfs(novelTitle);
            data.files[String(key)] = value;
            if (!_writeVfs(novelTitle, data)) return { success: false, message: 'Path tidak valid.' };
            return { success: true };
        } catch (error) { return { success: false, message: error.message }; }
    });

    ipcMain.handle('vn-novel:vfs-remove', async (event, { novelTitle, key }) => {
        try {
            if (!novelTitle || !key) return { success: false, message: 'novelTitle & key wajib.' };
            const data = _readVfs(novelTitle);
            const existed = Object.prototype.hasOwnProperty.call(data.files, String(key));
            delete data.files[String(key)];
            if (!_writeVfs(novelTitle, data)) return { success: false, message: 'Path tidak valid.' };
            return { success: true, existed };
        } catch (error) { return { success: false, message: error.message }; }
    });

    ipcMain.handle('vn-novel:vfs-list', async (event, novelTitle) => {
        try {
            return { success: true, files: _readVfs(novelTitle).files };
        } catch (error) { return { success: false, files: {}, message: error.message }; }
    });

    // ============================================================
    // STORY VARS → HUB: snapshot SELURUH variabel sesi bermain terakhir
    // (story-vars.json, ditulis engine di akhir chapter / return-to-hub).
    // Berbeda dari hub-flags (opt-in per key via set_hub_flag), ini memberi
    // hub akses penuh ke state cerita: afeksi, counter, route, dst.
    // ============================================================
    function _storyVarsPath(novelTitle) {
        return _resolveNovelFile(novelTitle, 'story-vars.json');
    }

    ipcMain.handle('vn-hub:get-story-vars', async (event, novelTitle) => {
        try {
            const p = _storyVarsPath(novelTitle);
            if (!p || !fs.existsSync(p)) return { success: true, vars: {}, chapter: null, updatedAt: null };
            const d = JSON.parse(fs.readFileSync(p, 'utf-8'));
            return {
                success: true,
                vars: (d && typeof d.vars === 'object' && d.vars) || {},
                chapter: (d && d.chapter) || null,
                updatedAt: (d && d.updatedAt) || null
            };
        } catch (error) {
            return { success: false, vars: {}, chapter: null, message: error.message };
        }
    });

    ipcMain.handle('vn-hub:clear-story-vars', async (event, novelTitle) => {
        try {
            const p = _storyVarsPath(novelTitle);
            if (!p) return { success: false, message: 'Path tidak valid.' };
            if (fs.existsSync(p)) fs.unlinkSync(p);
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Custom Player (player.html per-chapter) mengelola variabelnya sendiri di
    // renderer — engine tak melihatnya. Handler ini membiarkan custom player
    // ikut menulis snapshot story-vars.json agar hub tetap sadar-route.
    ipcMain.handle('vn-player:persist-story-vars', async (event, { novelTitle, chapter, vars }) => {
        try {
            const p = _storyVarsPath(novelTitle);
            if (!p) return { success: false, message: 'Path tidak valid.' };
            writeJsonAtomic(p, {
                vars: (vars && typeof vars === 'object') ? vars : {},
                chapter: chapter || null,
                reason: 'custom-player',
                updatedAt: new Date().toISOString()
            });
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('get-hub-config', async (event, novelTitle) => {
        try {
            const configPath = _resolveNovelFile(novelTitle, 'hub-config.json');

            const defaultConfig = createDefaultHubConfig();

            if (fs.existsSync(configPath)) {
                const fileData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                const { config: migrated } = migrateHubConfig(fileData);
                return { success: true, config: { ...defaultConfig, ...migrated } };
            }

            return { success: true, config: defaultConfig };
        } catch (error) {
            console.error(`[HubConfigManager] Gagal membaca hub-config.json untuk '${novelTitle}':`, error);
            return { success: false, message: error.message };
        }
    });

    // ---- Simpan hub config ----
    ipcMain.handle('save-hub-config', async (event, { novelTitle, config }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const configPath = resolvePathWithinRoot(novelPath, 'hub-config.json');

            _validateConfigSceneIds(config);
            writeJsonAtomic(configPath, config);
            console.log(`[HubConfigManager] hub-config.json untuk '${novelTitle}' diperbarui.`);

            // Sinkronkan metadata scene ke kode (partial per-scene + hub.html komposit),
            // tanpa menyentuh body buatan kreator:
            //   - NAMA scene → data-scene-name + komentar judul (membuat rename
            //     tercermin di kode, termasuk scene Blank yang markup-nya generik).
            //   - BACKGROUND scene (gambar + overlay) → atribut style pada <section>
            //     (membuat dropdown "Background Scene" benar-benar berdampak).
            //   - STATUS AKTIF scene → data-disabled pada <section> (UX-A03). Dulu
            //     atribut ini hanya ditulis saat section dibangun, sehingga toggle
            //     "Aktif" di Inspector tak pernah sampai ke runtime code-first.
            try {
                const scenes = Array.isArray(config.scenes) ? config.scenes : [];
                const applyScene = function (markup, scene) {
                    let out = hubScaffolder.syncSceneNameInMarkup(markup, scene);
                    out = hubScaffolder.syncSceneBackgroundInMarkup(out, scene);
                    out = hubScaffolder.syncSceneEnabledInMarkup(out, scene);
                    return out;
                };
                if (scenes.length) {
                    // a) partial per-scene
                    if (hubScaffolder.partialsDirExists(novelPath)) {
                        scenes.forEach(function (scene) {
                            if (!scene || !scene.id) return;
                            const pPath = hubScaffolder.scenePartialPath(novelPath, scene.id);
                            if (!fs.existsSync(pPath)) return;
                            const before = fs.readFileSync(pPath, 'utf-8');
                            const after = applyScene(before, scene);
                            if (after !== before) writeTextAtomic(pPath, after);
                        });
                    }
                    // b) hub.html komposit (in-place, hanya atribut/komentar — bukan body)
                    const hubHtmlPath = path.join(novelPath, 'hub.html');
                    if (fs.existsSync(hubHtmlPath)) {
                        let html = fs.readFileSync(hubHtmlPath, 'utf-8');
                        const original = html;
                        scenes.forEach(function (scene) {
                            if (scene && scene.id) html = applyScene(html, scene);
                        });
                        if (html !== original) writeTextAtomic(hubHtmlPath, html);
                    }
                }
            } catch (syncErr) {
                console.warn(`[HubConfigManager] Gagal sinkronisasi metadata scene ke kode:`, syncErr);
            }

            return { success: true, message: 'Konfigurasi hub berhasil disimpan!' };
        } catch (error) {
            console.error(`[HubConfigManager] Gagal menyimpan hub-config.json untuk '${novelTitle}':`, error);
            return { success: false, message: `Gagal menyimpan konfigurasi: ${error.message}` };
        }
    });

    // ---- Resolusi dan migrasi mode sumber Hub ----
    ipcMain.handle('get-hub-mode-status', async (event, novelTitle) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const configPath = resolvePathWithinRoot(novelPath, 'hub-config.json');
            const localHubPath = resolvePathWithinRoot(novelPath, 'hub.html');
            const globalHubPath = path.join(path.dirname(__dirname), 'aset', 'game', 'hub-templates', '_global', 'novel-hub.html');
            let config = createDefaultHubConfig();

            if (fs.existsSync(configPath)) {
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                config = { ...config, ...migrateHubConfig(raw).config };
            }
            if (config.hubModeConfirmed === true) {
                return { success: true, needsConfirmation: false, config };
            }

            const hasLocalHub = fs.existsSync(localHubPath);
            let matchesGeneratedTemplate = false;
            if (hasLocalHub && fs.existsSync(globalHubPath)) {
                const normalize = content => content.replace(/\r\n/g, '\n').trim();
                matchesGeneratedTemplate = normalize(fs.readFileSync(localHubPath, 'utf-8')) ===
                    normalize(fs.readFileSync(globalHubPath, 'utf-8'));
            }

            if (!hasLocalHub || matchesGeneratedTemplate) {
                config.hubType = 'default';
                config.hubModeConfirmed = true;
                writeJsonAtomic(configPath, config);
                return { success: true, needsConfirmation: false, migrated: true, config };
            }

            return {
                success: true,
                needsConfirmation: true,
                config,
                message: 'Novel ini memiliki hub.html lama yang dapat berisi desain kustom.'
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('confirm-hub-mode', async (event, { novelTitle, hubType, draftConfig }) => {
        try {
            if (!['default', 'custom'].includes(hubType)) {
                return { success: false, message: 'Mode Hub tidak valid.' };
            }
            const novelPath = _resolveNovelPath(novelTitle);
            const configPath = resolvePathWithinRoot(novelPath, 'hub-config.json');
            let config = createDefaultHubConfig();
            if (fs.existsSync(configPath)) {
                config = { ...config, ...migrateHubConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).config };
            }
            if (draftConfig && typeof draftConfig === 'object') {
                config = { ...config, ...draftConfig };
            }
            config.hubType = hubType;
            config.hubModeConfirmed = true;
            _validateConfigSceneIds(config);
            const starterCreated = hubType === 'custom' ? ensureCustomHubFiles(novelPath) : false;
            writeJsonAtomic(configPath, config);
            return { success: true, config, starterCreated };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // ---- Daftar chapter untuk config ----
    ipcMain.handle('get-chapter-list-for-config', async (event, novelTitle) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            if (!fs.existsSync(novelPath)) {
                return { success: false, chapters: [], message: 'Folder novel tidak ditemukan.' };
            }

            const entries = fs.readdirSync(novelPath, { withFileTypes: true });

            // Folder yang bukan chapter valid
            const EXCLUDED_FOLDERS = ['audio', 'saves', 'gallery', 'extensions', 'sidestories'];

            const chapters = [];
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name.startsWith('.')) continue;

                const lowerName = entry.name.toLowerCase();

                // Recurse ke dalam sidestories/ — setiap subfolder dengan script.json adalah side story
                if (lowerName === 'sidestories') {
                    const sideStoriesPath = path.join(novelPath, entry.name);
                    try {
                        const subEntries = fs.readdirSync(sideStoriesPath, { withFileTypes: true });
                        for (const sub of subEntries) {
                            if (!sub.isDirectory()) continue;
                            const scriptPath = path.join(sideStoriesPath, sub.name, 'script.json');
                            if (fs.existsSync(scriptPath)) {
                                chapters.push('SideStories/' + sub.name);
                            }
                        }
                    } catch (e) {
                        console.error(`[HubConfigManager] Gagal membaca sidestories/:`, e);
                    }
                    continue;
                }

                // Skip folder yang diketahui bukan chapter
                if (EXCLUDED_FOLDERS.includes(lowerName)) continue;

                // Hanya masukkan folder yang punya script.json
                const scriptPath = path.join(novelPath, entry.name, 'script.json');
                if (fs.existsSync(scriptPath)) {
                    chapters.push(entry.name);
                }
            }

            console.log(`[HubConfigManager] Daftar chapter untuk config '${novelTitle}':`, chapters);
            return { success: true, chapters };
        } catch (error) {
            console.error(`[HubConfigManager] Gagal membaca daftar chapter untuk '${novelTitle}':`, error);
            return { success: false, chapters: [], message: error.message };
        }
    });

    // ---- Baca file hub kustom (hub.html / hub.css) ----
    ipcMain.handle('read-hub-custom-file', async (event, { novelTitle, filename }) => {
        try {
            const allowedFiles = ['hub.html', 'hub.css', 'hub.js'];
            if (!allowedFiles.includes(filename)) {
                return { success: false, content: '', message: 'File tidak diizinkan.' };
            }

            const filePath = _resolveNovelFile(novelTitle, filename);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                return { success: true, content, exists: true };
            }
            return { success: true, content: '', exists: false };
        } catch (error) {
            console.error(`[HubConfigManager] Gagal membaca ${filename}:`, error);
            return { success: false, content: '', message: error.message };
        }
    });

    // ---- Simpan file hub kustom (hub.html / hub.css) ----
    ipcMain.handle('save-hub-custom-file', async (event, { novelTitle, filename, content }) => {
        try {
            const allowedFiles = ['hub.html', 'hub.css', 'hub.js'];
            if (!allowedFiles.includes(filename)) {
                return { success: false, message: 'File tidak diizinkan.' };
            }

            const novelPath = _resolveNovelPath(novelTitle);
            const filePath = resolvePathWithinRoot(novelPath, filename);
            writeTextAtomic(filePath, content);

            // Code-first partials (B): bila hub.html monolith disimpan dari editor pada
            // novel berbasis partial, pecah kembali tiap <section> ke partial-nya agar
            // partial tetap sumber kebenaran (composeHub menulis ulang hub.html kanonik).
            if (filename === 'hub.html' && hubScaffolder.partialsDirExists(novelPath)) {
                const configPath = path.join(novelPath, 'hub-config.json');
                let cfg = createDefaultHubConfig();
                if (fs.existsSync(configPath)) {
                    cfg = { ...cfg, ...migrateHubConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).config };
                }
                _validateConfigSceneIds(cfg);
                hubScaffolder.decomposeHubIntoPartials(novelPath, content, cfg.scenes || [], { title: cfg.title || novelTitle });
            }
            console.log(`[HubConfigManager] File kustom '${filename}' untuk '${novelTitle}' berhasil disimpan.`);
            return { success: true };
        } catch (error) {
            console.error(`[HubConfigManager] Gagal menyimpan ${filename}:`, error);
            return { success: false, message: error.message };
        }
    });

    // Loader config kecil (default + migrasi) dipakai handler code-first di bawah.
    function _loadHubConfig(novelPath) {
        const configPath = resolvePathWithinRoot(novelPath, 'hub-config.json');
        let config = createDefaultHubConfig();
        if (fs.existsSync(configPath)) {
            config = { ...config, ...migrateHubConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).config };
        }
        if (!Array.isArray(config.scenes)) config.scenes = [];
        _validateConfigSceneIds(config);
        return { config, configPath };
    }

    // ---- Code-first (B): pastikan partial per-scene ada (migrasi monolith bila perlu) ----
    ipcMain.handle('hub:ensure-partials', async (event, { novelTitle }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const { config, configPath } = _loadHubConfig(novelPath);
            if (config[hubScaffolder.CODE_SCENES_FLAG] !== true) {
                return { success: true, config, migrated: false };
            }
            const migrated = hubScaffolder.ensurePartials(novelPath, config.scenes, { title: novelTitle });
            config[hubScaffolder.PARTIALS_FLAG] = true;
            writeJsonAtomic(configPath, config);
            return { success: true, config, migrated };
        } catch (error) {
            console.error('[HubConfigManager] hub:ensure-partials gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Code-first (A3a/B): tambah Hub Scene = tulis partial baru + komposit ----
    ipcMain.handle('hub:add-code-scene', async (event, { novelTitle, type, name }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const { config, configPath } = _loadHubConfig(novelPath);

            hubScaffolder.ensurePartials(novelPath, config.scenes, { title: novelTitle });
            const snapshot = hubScaffolder.captureSnapshot(novelPath, config);

            const scene = hubScaffolder.sceneFromType(type, { name });
            config.scenes.push(scene);
            hubScaffolder.writeScenePartial(novelPath, scene);
            hubScaffolder.composeHub(novelPath, config.scenes, { title: novelTitle });

            config[hubScaffolder.CODE_SCENES_FLAG] = true;
            config[hubScaffolder.PARTIALS_FLAG] = true;
            writeJsonAtomic(configPath, config);
            console.log(`[HubConfigManager] Code scene '${scene.id}' (${scene.type}) ditambahkan ke '${novelTitle}'`);
            return { success: true, scene, config, snapshot };
        } catch (error) {
            console.error('[HubConfigManager] hub:add-code-scene gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Code-first (A3/B): hapus Hub Scene = hapus partial + komposit ----
    ipcMain.handle('hub:remove-code-scene', async (event, { novelTitle, sceneId }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const safeSceneId = _validateSceneId(sceneId);
            const { config, configPath } = _loadHubConfig(novelPath);

            hubScaffolder.ensurePartials(novelPath, config.scenes, { title: novelTitle });
            const snapshot = hubScaffolder.captureSnapshot(novelPath, config);

            hubScaffolder.removeScenePartialFile(novelPath, safeSceneId);
            config.scenes = config.scenes.filter(s => s && s.id !== safeSceneId);
            hubScaffolder.composeHub(novelPath, config.scenes, { title: novelTitle });

            config[hubScaffolder.PARTIALS_FLAG] = true;
            writeJsonAtomic(configPath, config);
            console.log(`[HubConfigManager] Code scene '${sceneId}' dihapus dari '${novelTitle}'`);
            return { success: true, config, snapshot };
        } catch (error) {
            console.error('[HubConfigManager] hub:remove-code-scene gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- `hub:apply-code-template` DICABUT (UX-C01, Tahap 5) ----
    // Handler ini merakit hub dari `sceneSet` milik konstanta HUB_TEMPLATES di
    // node-registry.js. Konstanta itu dicabut karena keempat anggotanya
    // menghasilkan markup generik + hub.css gaya dasar yang sama - pilihan yang
    // tak pernah terlihat bedanya. Begitu ia hilang, handler ini kehilangan
    // SATU-SATUNYA pemanggilnya (`applyCodeTemplate()` di hubEditor.js, yang
    // ikut dicabut), jadi ia dibuang juga alih-alih ditinggal sebagai jalur mati.
    //
    // Kemampuannya TIDAK hilang: `hub:apply-code-template-folder` di bawah
    // menempuh jalur yang sama lewat `hubScaffolder.applyFolderTemplate()`, dan
    // untuk scene yang markupnya tak disediakan template ia tetap memanggil
    // `buildSceneSection()` - generator markup generik yang sama persis.

    // ---- Pustaka template Hub berbasis folder: daftar ringkas untuk picker ----
    ipcMain.handle('hub:list-code-templates', async () => {
        try {
            return { success: true, templates: hubTemplates.list(hubTemplatesDirectory) };
        } catch (error) {
            console.error('[HubConfigManager] hub:list-code-templates gagal:', error);
            return { success: false, templates: [], message: error.message };
        }
    });

    // ---- Terapkan template FOLDER (blueprint code-first lengkap: scene HTML + tema CSS) ----
    // Berbeda dari hub:apply-code-template (sceneSet dari registry yang hanya
    // memvariasikan komposisi & memakai markup generik), handler ini menyalin
    // markup scene + hub.css + hub.js dari folder template → menghasilkan tampilan
    // yang benar-benar bervariasi. hub.css/hub.js DITIMPA; snapshot mencakup keduanya
    // sehingga Undo memulihkan tema lama sepenuhnya.
    ipcMain.handle('hub:apply-code-template-folder', async (event, { novelTitle, templateId, title }) => {
        try {
            const tpl = hubTemplates.load(hubTemplatesDirectory, templateId);
            if (!tpl) return { success: false, message: 'Template "' + templateId + '" tidak ditemukan di folder hub-templates.' };
            if (!Array.isArray(tpl.scenes) || tpl.scenes.length === 0) {
                return { success: false, message: 'Template "' + templateId + '" tidak memiliki scene.' };
            }
            const novelPath = _resolveNovelPath(novelTitle);
            const { config, configPath } = _loadHubConfig(novelPath);

            // Materialisasi state sekarang ke partial agar snapshot Undo lengkap.
            hubScaffolder.ensurePartials(novelPath, config.scenes, { title: novelTitle });
            const snapshot = hubScaffolder.captureSnapshot(novelPath, config);

            // Materialisasi scene + tema (hub.css/hub.js) + komposit hub.html.
            // Logika dibagikan dengan create-new-novel via applyFolderTemplate.
            const scenes = hubScaffolder.applyFolderTemplate(novelPath, tpl, { title: title || novelTitle });

            config.scenes = scenes;
            config.sceneFlow = { startSceneId: scenes[0].id, transitions: [] };
            config.hubType = 'custom';
            config.hubModeConfirmed = true;
            config._templateId = tpl.id;
            config[hubScaffolder.CODE_SCENES_FLAG] = true;
            config[hubScaffolder.PARTIALS_FLAG] = true;
            writeJsonAtomic(configPath, config);
            console.log(`[HubConfigManager] Template folder '${tpl.id}' (${scenes.length} scene) diterapkan ke '${novelTitle}'`);
            return { success: true, scenes, config, snapshot, label: tpl.label };
        } catch (error) {
            console.error('[HubConfigManager] hub:apply-code-template-folder gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Code-first (B): pulihkan state dari snapshot (Undo seragam add/remove/template) ----
    ipcMain.handle('hub:restore-code-state', async (event, { novelTitle, snapshot }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const snapshotPartials = snapshot && snapshot.partials && typeof snapshot.partials === 'object'
                ? Object.keys(snapshot.partials)
                : [];
            snapshotPartials.forEach(_validateSceneId);
            if (snapshot && snapshot.config) _validateConfigSceneIds(snapshot.config);
            hubScaffolder.restoreSnapshot(novelPath, snapshot, { title: novelTitle });
            if (snapshot && snapshot.config) {
                writeJsonAtomic(resolvePathWithinRoot(novelPath, 'hub-config.json'), snapshot.config);
            }
            return { success: true, config: snapshot && snapshot.config };
        } catch (error) {
            console.error('[HubConfigManager] hub:restore-code-state gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Code-first (B2): baca partial sebuah scene ----
    ipcMain.handle('hub:read-scene-partial', async (event, { novelTitle, sceneId }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const safeSceneId = _validateSceneId(sceneId);
            const content = hubScaffolder.readScenePartial(novelPath, safeSceneId);
            return { success: true, content: content || '', exists: content != null };
        } catch (error) {
            console.error('[HubConfigManager] hub:read-scene-partial gagal:', error);
            return { success: false, content: '', message: error.message };
        }
    });

    // ---- Code-first (B2): simpan partial scene + komposit ulang hub.html ----
    //
    // UX-A04 — nama scene jadi DUA ARAH. Sebelumnya hanya editor→kode yang ada
    // (`syncSceneNameInMarkup` saat save-hub-config), sehingga menyunting
    // `data-scene-name` langsung di kode bukan cuma diabaikan editor: nilainya
    // DITIMPA balik oleh nama lama dari config pada Save Hub berikutnya.
    //
    // Batas kontraknya sengaja sempit (lihat §6.4 dokumen UI/UX):
    //   - `data-scene-name` → dua arah;
    //   - `data-scene-id`   → immutable, perubahan manual DITOLAK;
    //   - `data-scene-type` → read-only dari kode, ubah lewat aksi Konversi Scene.
    // Penolakan lebih baik daripada diam-diam memilih salah satu sisi.
    ipcMain.handle('hub:save-scene-partial', async (event, { novelTitle, sceneId, content }) => {
        try {
            const novelPath = _resolveNovelPath(novelTitle);
            const safeSceneId = _validateSceneId(sceneId);
            const { config } = _loadHubConfig(novelPath);
            const sceneCfg = (Array.isArray(config.scenes) ? config.scenes : [])
                .filter((s) => s && s.id === safeSceneId)[0] || null;

            const meta = hubScaffolder.readSceneMetaFromMarkup(content);
            if (meta) {
                if (meta.rootCount > 1) {
                    return {
                        success: false,
                        message: 'Partial ini memuat lebih dari satu <section> ber-data-scene-id. '
                            + 'Satu berkas partial = satu scene; pecah sisanya lewat "Tambah Scene".'
                    };
                }
                if (meta.id && meta.id !== safeSceneId) {
                    return {
                        success: false,
                        message: `ID scene tidak boleh diubah dari kode (dari "${safeSceneId}" jadi "${meta.id}"). `
                            + 'ID dipakai config, nama berkas partial, highlight preview, dan navigasi. '
                            + 'Kembalikan nilainya, lalu hapus/buat scene bila memang ingin ID lain.'
                    };
                }
                if (sceneCfg && meta.type && meta.type !== sceneCfg.type) {
                    return {
                        success: false,
                        message: `Tipe scene tidak boleh diubah dari kode (dari "${sceneCfg.type}" jadi "${meta.type}"). `
                            + 'Tipe memengaruhi alur runtime, field Inspector, dan validasi — ubah lewat aksi Konversi Scene.'
                    };
                }
            }

            // Nama diperbarui SEBELUM partial ditulis. Arah kegagalan yang dipilih:
            // kalau penulisan partial gagal, config sudah memegang nama yang diminta
            // dan Save Hub berikutnya akan mendorongnya ke markup — menyatu ke arah
            // yang diinginkan kreator. Urutan sebaliknya justru mengembalikan rename
            // secara diam-diam, yaitu bug yang sedang ditutup ini.
            let renamed = false;
            const namaBaru = (meta && typeof meta.name === 'string') ? meta.name.trim() : '';
            if (sceneCfg && namaBaru && namaBaru !== sceneCfg.name) {
                const configPath = resolvePathWithinRoot(novelPath, 'hub-config.json');
                if (fs.existsSync(configPath)) {
                    // Berkas MENTAH yang di-patch, bukan hasil migrasi/default —
                    // menyimpan nama scene bukan izin menuliskan kunci baru.
                    const rawCfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    const target = (Array.isArray(rawCfg.scenes) ? rawCfg.scenes : [])
                        .filter((s) => s && s.id === safeSceneId)[0];
                    if (target) {
                        target.name = namaBaru;
                        writeJsonAtomic(configPath, rawCfg);
                        renamed = true;
                    }
                }
                sceneCfg.name = namaBaru;   // dipakai composeHub di bawah
            }

            hubScaffolder.writeScenePartial(novelPath, { id: safeSceneId }, content);
            hubScaffolder.composeHub(novelPath, config.scenes, { title: config.title || novelTitle });
            return {
                success: true,
                novelTitle: novelTitle,
                sceneId: safeSceneId,
                name: sceneCfg ? sceneCfg.name : null,
                renamed: renamed
            };
        } catch (error) {
            console.error('[HubConfigManager] hub:save-scene-partial gagal:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Dialog pilih + salin aset ke folder novel (untuk boot, bgm, bg, dll.) ----
    ipcMain.handle('hub:pick-asset', async (event, { novelTitle, filters, subdir, prefix }) => {
        try {
            const safePrefix = validatePathComponent(prefix || 'asset', 'Prefix aset');
            const novelPath = _resolveNovelPath(novelTitle);
            const destDir = subdir
                ? _resolveRelativeDirectory(novelPath, subdir)
                : novelPath;
            const { dialog } = require('electron');
            const { canceled, filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: filters || []
            });
            if (canceled || filePaths.length === 0) return null;

            const sourcePath = filePaths[0];
            const ext = path.extname(sourcePath);
            const newFilename = validatePathComponent(safePrefix + '_' + Date.now() + ext, 'Nama aset');

            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(sourcePath, resolvePathWithinRoot(destDir, newFilename));

            const relativePath = subdir ? subdir + '/' + newFilename : newFilename;
            console.log(`[HubConfigManager] Aset hub disalin: ${relativePath} untuk '${novelTitle}'`);
            return { success: true, relativePath };
        } catch (error) {
            console.error('[HubConfigManager] Gagal menyalin aset hub:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Galeri images dari VN Hub API ----
    ipcMain.handle('vn-hub:get-gallery-images', async (event, novelTitle) => {
        try {
            const galleryPath = resolvePathWithinRoot(_resolveNovelPath(novelTitle), 'gallery');
            if (!fs.existsSync(galleryPath)) return [];

            const files = fs.readdirSync(galleryPath);
            return files.filter(f => f.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        } catch (err) {
            console.error(`[HubConfigManager] Error membaca galeri untuk ${novelTitle}:`, err);
            return [];
        }
    });

    // ---- Show settings dari hub ----
    ipcMain.on('vn-engine:show-settings', (event) => {
        console.log('[HubConfigManager] Membuka window settings dari VN Hub');
        const { BrowserWindow } = require('electron');
        const win = BrowserWindow.getFocusedWindow() || getMainWindow();
        if (win) {
            win.webContents.send('show-global-settings');
        }
    });

    // ---- Get config defaults (untuk renderer) ----
    ipcMain.handle('vn-engine:get-config-defaults', async () => {
        return {
            hubConfig: JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS)),
            playerProfile: { ...PLAYER_PROFILE_DEFAULTS }
        };
    });
}

/**
 * Bangun effective player config = global playerProfile + chapter override + deep-merge restrictions.
 * Logika sama persis dengan yang dipakai runtime di vn-player/js/init.js.
 * @param {object} hubConfig - hub-config.json yang sudah di-load
 * @param {string} [chapterName] - Nama chapter (opsional, untuk chapter override)
 * @returns {object} Effective player config
 */
function buildEffectivePlayerConfig(hubConfig, chapterName) {
    const profile = (hubConfig && hubConfig.playerProfile) || { ...PLAYER_PROFILE_DEFAULTS };
    const base = { ...PLAYER_PROFILE_DEFAULTS, ...profile };
    if (!chapterName || !hubConfig || !hubConfig.chapterConfig) return base;
    const chapterOverride = hubConfig.chapterConfig[chapterName];
    if (!chapterOverride) return base;
    // Hanya kunci PLAYER yang di-override; hidden/badge = metadata Chapter Select, abaikan
    // (jangan bocor ke config efektif). Chapter "ikut global" tetap mendapat profil global.
    const out = { ...base };
    PLAYER_OVERRIDE_KEYS.forEach((k) => {
        if (chapterOverride[k] !== undefined) out[k] = chapterOverride[k];
    });
    out.restrictions = {
        ...(PLAYER_PROFILE_DEFAULTS.restrictions || {}),
        ...(profile.restrictions || {}),
        ...(chapterOverride.restrictions || {})
    };
    return out;
}

module.exports = { registerHandlers, buildEffectivePlayerConfig };
