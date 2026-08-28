// =============================================
// Novel CRUD — Create, Read, Update, Delete novel
// Dipindahkan dari main.js untuk modularisasi
// =============================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { normalizeScript, validateNovelMeta } = require('./schema-validator');
const { HUB_CONFIG_DEFAULTS } = require('./config-defaults');
const hubScaffolder = require('./hub-scaffolder');
const hubTemplates = require('./hub-templates');
const { isPathSafe, validatePathComponent, resolvePathWithinRoot } = require('./path-utils');
const { atomicWriteFileSync } = require('./atomic-writer');
const targetViewport = require('./target-viewport');
const novelRpc = require('./novel-rpc');
const { isEngineShim, resolvePlayerSource } = require('./player-source-resolver');
const { materializeChapterThemeCss, resolveEffectiveThemeFiles } = require('./player-theme-resolver');

// Root project (folder yang berisi main.js, vn-player/, aset/)
const APP_ROOT = path.dirname(__dirname);
// Pustaka template Hub berbasis folder (aset/game/hub-templates/<id>/).
const HUB_TEMPLATES_DIR = path.join(APP_ROOT, 'aset', 'game', 'hub-templates');

function createNovelInstanceId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function readNovelMeta(metaPath) {
    if (!fs.existsSync(metaPath)) return {};
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

function writeNovelMeta(metaPath, metaData) {
    atomicWriteFileSync(metaPath, JSON.stringify(metaData, null, 2), { encoding: 'utf8' });
}

function ensureEditorState(metaData) {
    if (!metaData.editorState || typeof metaData.editorState !== 'object') {
        metaData.editorState = {};
    }
    if (!metaData.editorState.newNovelOnboarding || typeof metaData.editorState.newNovelOnboarding !== 'object') {
        metaData.editorState.newNovelOnboarding = {
            createdForId: metaData.id || null,
            shownAt: null
        };
    }
    return metaData.editorState.newNovelOnboarding;
}

const COVER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const TEXT_SCAN_EXTS = ['.json', '.html', '.htm', '.css', '.js', '.md'];
const SCAN_SKIP_DIRS = new Set(['saves', 'node_modules', '.git']);

// Apakah nama berkas disebut di salah satu berkas teks milik novel?
// Dipakai sebagai REM sebelum menghapus: kreator bisa saja memakai cover lama
// sebagai aset biasa di script/hub. False positive aman (berkas dipertahankan).
function isNameReferencedInNovel(dir, needle, depth) {
    depth = depth === undefined ? 4 : depth;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return false; }

    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (depth <= 0 || SCAN_SKIP_DIRS.has(entry.name.toLowerCase())) continue;
            if (isNameReferencedInNovel(full, needle, depth - 1)) return true;
            continue;
        }
        if (!TEXT_SCAN_EXTS.includes(path.extname(entry.name).toLowerCase())) continue;
        try {
            if (fs.statSync(full).size > 5 * 1024 * 1024) continue;
            if (fs.readFileSync(full, 'utf-8').includes(needle)) return true;
        } catch (e) { /* berkas tak terbaca — anggap tidak merujuk */ }
    }
    return false;
}

// Cover selalu ditulis sebagai `cover.<ext>`, jadi mengganti FORMAT meninggalkan
// berkas lama (cover.jpg tertinggal saat cover baru cover.png). Sapu yang yatim —
// tapi hanya yang benar-benar tidak dirujuk berkas lain.
function cleanStaleCovers(novelPath, keepName) {
    const hasil = { dihapus: [], dipertahankan: [] };
    let files;
    try { files = fs.readdirSync(novelPath); } catch (e) { return hasil; }

    files.filter(f =>
        f !== keepName &&
        /^cover\./i.test(f) &&
        COVER_EXTS.includes(path.extname(f).toLowerCase())
    ).forEach(f => {
        if (isNameReferencedInNovel(novelPath, f)) {
            hasil.dipertahankan.push(f);
            console.log(`[NovelCRUD] Cover lama '${f}' dipertahankan — masih dirujuk berkas lain.`);
            return;
        }
        try {
            fs.unlinkSync(path.join(novelPath, f));
            hasil.dihapus.push(f);
            console.log(`[NovelCRUD] Cover lama '${f}' dihapus (digantikan '${keepName}').`);
        } catch (e) {
            console.error(`[NovelCRUD] Gagal menghapus cover lama '${f}':`, e);
        }
    });
    return hasil;
}

function findLegacyCover(novelPath) {
    if (!fs.existsSync(novelPath)) return '';
    const cover = fs.readdirSync(novelPath).find(file =>
        file.toLowerCase().startsWith('cover.') &&
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file).toLowerCase())
    );
    return cover || '';
}

// Format video promosi yang boleh masuk — sama dengan yang ditawarkan UI Profil.
const PROMO_VIDEO_EXTS = ['.mp4', '.webm'];

/**
 * Nama canonical video promosi, mengikuti EKSTENSI berkas aslinya.
 *
 * UX-A07b: dulu setiap unggahan ditulis sebagai `video.mp4` apa pun isinya,
 * padahal UI menerima WebM juga. Akibatnya berkas WebM berkeliaran dengan
 * ekstensi bohong dan pemutar HTML5 menolaknya. '' = format tak didukung;
 * pemanggil wajib menggagalkan penyimpanan, bukan menebak.
 */
function promoVideoName(originalName) {
    const ext = path.extname(String(originalName || '')).toLowerCase();
    if (!PROMO_VIDEO_EXTS.includes(ext)) return '';
    return 'video' + ext;
}

// Video promosi lama yang belum tercatat di novel-meta.json. Menggantikan tebakan
// `video.mp4` yang membuat novel ber-WebM tampak tidak punya video sama sekali.
function findLegacyPromoVideo(novelPath) {
    if (!fs.existsSync(novelPath)) return '';
    let files;
    try { files = fs.readdirSync(novelPath); } catch (e) { return ''; }
    const found = files.find(file =>
        file.toLowerCase().startsWith('video.') &&
        PROMO_VIDEO_EXTS.includes(path.extname(file).toLowerCase())
    );
    return found || '';
}

// =============================================
// Chapter Player Scaffolding — player.html per chapter (code-first)
// Template 'engine'  = vn_player_template.html — Custom Player penuh berbasis
//                      VNPlayer API (dialog, scene, sprite, transisi, save/load,
//                      Debug HUD) yang siap diedit kreator.
// Template 'starter' = custom-player-starter.html — minimal, murni VNPlayer API,
//                      untuk kreator yang ingin menulis engine dari nol.
// Keduanya dimuat runtime lewat jalur Custom Player (resolvePlayerSource)
// dengan bridge VNPlayer ter-inject.
// =============================================
function escapeHtmlText(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scaffoldChapterPlayer(chapterDir, { novelTitle, chapterName, template = 'engine', overwrite = false } = {}) {
    const target = path.join(chapterDir, 'player.html');
    if (fs.existsSync(target) && !overwrite) {
        return { created: false, exists: true };
    }

    // E1 (audit): 'engine' kini menghasilkan SHIM — file tipis yang me-link engine
    // bersama, sehingga chapter ikut update engine selamanya. Template inline lama
    // (salinan 2352 baris yang MEMBEKU begitu di-scaffold, biang E1/E2–E6) masih
    // bisa diminta eksplisit lewat 'engine-legacy', tapi jangan dipakai untuk
    // chapter baru — ia memproduksi utang, bukan menyelesaikannya.
    const TEMPLATE_FILES = {
        'starter': 'custom-player-starter.html',
        'engine': 'vn_player_shim.html',
        'engine-legacy': 'vn_player_template.html'
    };
    const templateFile = TEMPLATE_FILES[template] || TEMPLATE_FILES.engine;
    const templatePath = path.join(APP_ROOT, 'vn-player', 'templates', templateFile);
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Hanya ganti placeholder di <title>. Body script template (engine/starter)
    // berbasis VNPlayer API dan tidak memakai placeholder lain.
    const titleText = `${escapeHtmlText(novelTitle)} | ${escapeHtmlText(chapterName)}`;
    html = html
        .replace('<title>{NOVEL_TITLE} | {CHAPTER_NAME}</title>', `<title>${titleText}</title>`)
        .replace('<title>Custom Player</title>', `<title>${titleText}</title>`);

    atomicWriteFileSync(target, html, { encoding: 'utf8' });
    return { created: true, exists: true, template };
}

// Script awal agar chapter baru langsung playable dari Hub tanpa setup tambahan.
function buildStarterScript(chapterName) {
    return [
        { type: 'phase', name: 'Prolog' },
        { type: 'dialogue', speaker: '', text: `Chapter "${chapterName}" dimulai di sini.` },
        { type: 'dialogue', speaker: '', text: 'Entri ini dibuat otomatis sebagai contoh — ubah atau hapus lewat editor script.' }
    ];
}

/**
 * Nama berkas media novel yang BENAR-BENAR ada di disk — atau '' bila tak ada.
 *
 * Satu-satunya penyelesai media (2026-07-30): dulu aturan ini punya EMPAT salinan
 * (helper ini, handler `get-story-list`, dan dua renderer yang menebak `|| 'cover.jpg'`
 * / `|| 'video.mp4'`), dan yang di `get-story-list` bahkan memakai `'cover.jpg'` sebagai
 * DEFAULT — sehingga novel tanpa cover tetap dilaporkan punya cover dan setiap render
 * daftar memicu 404 senyap.
 *
 * Nilai dari `novel-meta.json` pun diverifikasi ke disk: meta bisa menyebut berkas yang
 * sudah dihapus, dan mempercayainya buta berarti memindahkan kebohongan dari kode ke data.
 * '' = "tidak ada" adalah jawaban yang SAH; pemanggil wajib menghormatinya alih-alih
 * menebak nama berkas.
 */
function getProfileMediaWithFallback(novelPath, metaData) {
    const ada = (nama) => !!nama && fs.existsSync(path.join(novelPath, nama));
    const meta = metaData || {};
    return {
        cover: ada(meta.cover) ? meta.cover : findLegacyCover(novelPath),
        promotionalVideo: ada(meta.promotionalVideo) ? meta.promotionalVideo
            : findLegacyPromoVideo(novelPath)
    };
}

/**
 * Registrasi IPC handlers untuk novel CRUD
 * @param {object} deps
 * @param {object} deps.ipcMain - Electron ipcMain
 * @param {string} deps.visualNovelsDirectory - Path ke visual_novels
 * @param {string} deps.appDir - __dirname dari main.js
 * @param {function} deps.getMainWindow - Getter mainWindow
 */
function registerHandlers(deps) {
    const { ipcMain, visualNovelsDirectory, appDir, getMainWindow } = deps;
    const pendingNewNovelOnboardingIds = new Set();

    // Title dari renderer selalu diperlakukan sebagai SATU nama folder. Helper
    // ini menjadi jalur canonical untuk CRUD novel/chapter sehingga path absolut,
    // traversal, separator, dan nama perangkat Windows ditolak sebelum operasi IO.
    function resolveNovelPath(novelTitle) {
        const safeTitle = validatePathComponent(novelTitle, 'Nama novel');
        return resolvePathWithinRoot(visualNovelsDirectory, safeTitle);
    }

    function resolveNovelFile(novelTitle, fileName) {
        const safeTitle = validatePathComponent(novelTitle, 'Nama novel');
        return resolvePathWithinRoot(visualNovelsDirectory, safeTitle, fileName);
    }

    function resolveChapterPath(novelTitle, chapterName) {
        const safeTitle = validatePathComponent(novelTitle, 'Nama novel');
        const safeChapter = validatePathComponent(chapterName, 'Nama chapter');
        return resolvePathWithinRoot(visualNovelsDirectory, safeTitle, safeChapter);
    }

    // ---- Daftar story (visual novels) ----
    ipcMain.handle('get-story-list', async () => {
        const stories = [];
        try {
            const folders = fs.readdirSync(visualNovelsDirectory, { withFileTypes: true });

            for (const folder of folders) {
                if (folder.isDirectory()) {
                    const novelPath = path.join(visualNovelsDirectory, folder.name);
                    const indexPath = path.join(novelPath, 'index.html');
                    const hubHtmlPath = path.join(novelPath, 'hub.html');
                    const metaJsonPath = path.join(novelPath, 'novel-meta.json');

                    const hasIndex = fs.existsSync(indexPath);
                    const hasHubHtml = fs.existsSync(hubHtmlPath);
                    const hasMetaJson = fs.existsSync(metaJsonPath);

                    if (hasMetaJson || hasHubHtml || hasIndex) {
                        // Resolusi media dipusatkan ke getProfileMediaWithFallback — dulu
                        // blok ini menyalin aturannya (salinan ke-2 dari empat) dan memakai
                        // 'cover.jpg' sebagai DEFAULT, sehingga novel tanpa cover dilaporkan
                        // punya cover → 404 senyap tiap daftar dirender.
                        let coverFilename = '';
                        let storyDesc = '';
                        let promotionalVideo = '';

                        try {
                            let metaData = {};
                            if (hasMetaJson) {
                                try {
                                    metaData = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8')) || {};
                                    // Prioritas: storyDesc (tagline kartu) → fallback ke description
                                    storyDesc = metaData.storyDesc || metaData.description || '';
                                } catch (metaErr) {
                                    console.error(`[NovelCRUD] Gagal membaca novel-meta.json untuk ${folder.name}:`, metaErr);
                                }
                            }
                            const media = getProfileMediaWithFallback(novelPath, metaData);
                            coverFilename = media.cover;
                            promotionalVideo = media.promotionalVideo;
                        } catch (e) {
                            console.error(`[NovelCRUD] Gagal mencari media untuk ${folder.name}:`, e);
                        }

                        let playPath;
                        if (hasHubHtml) {
                            playPath = `./visual_novels/${encodeURIComponent(folder.name)}/hub.html`;
                        } else if (hasIndex) {
                            playPath = `./visual_novels/${encodeURIComponent(folder.name)}/index.html`;
                        } else {
                            playPath = `./hub-templates/_global/novel-hub.html`;
                        }

                        // Penanda versi cover = mtime berkasnya. Cover diganti dengan
                        // NAMA yang sama (cover.jpg), jadi tanpa ini kartu library
                        // menampilkan gambar lama dari cache setelah cover diperbarui.
                        // Memakai mtime (bukan Date.now()) agar cache tetap berguna
                        // selama berkasnya memang tidak berubah.
                        let coverVersion = 0;
                        if (coverFilename) {
                            try {
                                coverVersion = Math.round(fs.statSync(path.join(novelPath, coverFilename)).mtimeMs);
                            } catch (e) { /* cover tidak ada — biarkan 0 */ }
                        }

                        stories.push({
                            title: folder.name,
                            playPath: playPath,
                            cover: coverFilename,
                            coverVersion: coverVersion,
                            storyDesc: storyDesc,
                            promotionalVideo: promotionalVideo
                        });
                    }
                }
            }
        } catch (err) {
            console.error('[NovelCRUD] Error reading stories:', err);
        }
        return stories;
    });

    // ---- Buat novel baru ----
    ipcMain.handle('create-new-novel', async (event, novelData) => {
        try {
            const { title, storyDesc, cover } = novelData || {};
            const safeTitle = validatePathComponent(title, 'Nama novel');
            const { name: coverName, buffer: coverArrayBuffer } = cover || {};
            const coverBuffer = Buffer.from(coverArrayBuffer);
            const newNovelPath = resolveNovelPath(safeTitle);
            const novelId = createNovelInstanceId();

            if (fs.existsSync(newNovelPath)) {
                return { success: false, message: 'Novel dengan judul ini sudah ada.' };
            }

            fs.mkdirSync(newNovelPath, { recursive: true });

            const extension = path.extname(coverName);
            const coverFileName = validatePathComponent('cover' + extension, 'Nama file cover');
            atomicWriteFileSync(
                resolvePathWithinRoot(newNovelPath, coverFileName),
                coverBuffer
            );

            const initialDescription = `Ini adalah halaman informasi untuk novel ${safeTitle}. Edit deskripsi ini dan tambahkan lebih banyak gambar dari menu editor.`;

        const metaData = {
            id: novelId,
            title: safeTitle,
            storyDesc: storyDesc || '',
            description: initialDescription,
            genre: '-',
            author: '-',
            illustrator: '-',
            vnMapper: '-',
            cover: coverFileName,
            promotionalVideo: '',
            version: '',
            createdAt: new Date().toISOString(),
            editorState: {
                newNovelOnboarding: {
                    createdForId: novelId,
                    shownAt: null
                }
            }
        };

            writeNovelMeta(resolvePathWithinRoot(newNovelPath, 'novel-meta.json'), metaData);
            pendingNewNovelOnboardingIds.add(novelId);
            console.log(`[NovelCRUD] novel-meta.json dibuat untuk novel '${safeTitle}'`);
        console.info('[Onboarding][Main] Tiket onboarding novel baru dibuat.', {
            novelTitle: safeTitle,
            novelId,
            createdForId: novelId,
            shownAt: null
        });

        // Novel baru = CODE-FIRST (Pendekatan A): scaffold hub.html/hub.css nyata
        // berbasis section + isi scenes[] yang menunjuk ke section tsb. Dipakai-ulang
        // hubType 'custom' agar runtime/resolver memuat hub.html via bridge tanpa
        // perubahan; penanda codeScenes memberi tahu editor untuk merender daftar scene
        // dari scenes[] (bukan placeholder Custom Hub).
        const defaultHubConfig = JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS));
        defaultHubConfig.hubType = 'custom';
        defaultHubConfig.hubModeConfirmed = true;
        defaultHubConfig[hubScaffolder.CODE_SCENES_FLAG] = true;
        defaultHubConfig[hubScaffolder.PARTIALS_FLAG] = true;
        // Novel baru di-apply template Hub default "minimal".
        //
        // Dulu defaultnya "showcase" — hub kaya fitur lengkap dengan galeri, muat
        // permainan, pengaturan, achievements, dan `hub.js` VNHub penuh. Niatnya
        // baik ("langsung berfungsi"), tapi ongkosnya salah tempat: novel yang baru
        // lahir belum punya galeri, belum punya save, dan belum punya achievement,
        // jadi kreator disambut sembilan scene yang sebagian besar kosong plus
        // ~250 baris hub.js yang belum ia minta. Titik awal seharusnya yang paling
        // sedikit dijelaskan, bukan yang paling banyak diperlihatkan.
        //
        // "minimal" = lima scene dasar, nol hub.js. Showcase tetap sejengkal jauh
        // lewat picker bagi yang memang ingin belajar dari contoh lengkap.
        const DEFAULT_HUB_TEMPLATE = 'minimal';
        let starterScenes;
        try {
            const defaultTpl = hubTemplates.load(HUB_TEMPLATES_DIR, DEFAULT_HUB_TEMPLATE);
            if (defaultTpl) {
                starterScenes = hubScaffolder.applyFolderTemplate(newNovelPath, defaultTpl, { title: safeTitle });
                defaultHubConfig._templateId = defaultTpl.id;
            }
        } catch (tplErr) {
            console.error('[NovelCRUD] Gagal apply template default "' + DEFAULT_HUB_TEMPLATE +
                '", fallback ke hub blank:', tplErr);
        }
        if (!starterScenes || !starterScenes.length) {
            starterScenes = hubScaffolder.scaffoldCodeFirstHub(newNovelPath, null, { title: safeTitle }).scenes;
        }
        defaultHubConfig.scenes = starterScenes;
        defaultHubConfig.sceneFlow = { startSceneId: (starterScenes[0] && starterScenes[0].id) || null, transitions: [] };
            atomicWriteFileSync(
                resolvePathWithinRoot(newNovelPath, 'hub-config.json'),
                JSON.stringify(defaultHubConfig, null, 2),
                { encoding: 'utf8' }
            );
            console.log(`[NovelCRUD] Code-first hub (hub.html/hub.css + ${starterScenes.length} scene) dibuat untuk novel '${safeTitle}'`);

        // player.html LEVEL NOVEL — simetris dengan hub.html: novel memiliki
        // renderer-nya sejak hari pertama (D2 + §18). Semua chapter mewarisinya,
        // jadi tak ada lagi N salinan untuk N chapter, dan menerapkan template di
        // scope Global benar-benar berpengaruh (tak dibayangi file per-chapter).
        try {
            scaffoldChapterPlayer(newNovelPath, { novelTitle: safeTitle, chapterName: safeTitle, template: 'engine' });
            console.log(`[NovelCRUD] player.html (shim, level novel) dibuat untuk '${safeTitle}'`);
        } catch (playerErr) {
            // Bukan alasan menggagalkan pembuatan novel — tanpa file ini runtime
            // jatuh ke engine global, yang tetap berfungsi penuh.
            console.error('[NovelCRUD] Gagal scaffold player.html level novel:', playerErr);
        }

            return {
                success: true,
                message: 'Novel baru berhasil dibuat!',
                novelId,
                showNewNovelOnboarding: true
            };
        } catch (error) {
            console.error('[NovelCRUD] Gagal membuat novel baru:', error);
            return { success: false, message: `Gagal membuat novel: ${error.message}` };
        }
    });

    // ---- Update profil novel canonical (metadata + cover + video promosi) ----
    ipcMain.handle('update-novel-details', async (event, data) => {
        try {
            const {
                novelTitle, storyDesc, description, genre, author, illustrator, vnMapper,
                version, cover, coverFile, promotionalVideo, backgroundVideo, viewport,
                rpcLargeImage, rpcPrivate
            } = data || {};
            const novelPath = resolveNovelPath(novelTitle);
            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            let metaData = {};

            if (fs.existsSync(metaPath)) {
                try {
                    metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                } catch (e) {
                    console.error(`[NovelCRUD] Gagal parse novel-meta.json untuk ${novelTitle}:`, e);
                }
            }

            const promotionalVideoFile = promotionalVideo && promotionalVideo.buffer
                ? promotionalVideo
                : backgroundVideo;
            if (promotionalVideoFile) {
                // Ekstensi mengikuti berkas yang dipilih kreator. Kalau formatnya di luar
                // daftar, GAGALKAN di sini — sebelum metadata disentuh — supaya berkas dan
                // meta lama tetap utuh, bukan tertimpa nama yang salah.
                const videoFilename = promoVideoName(promotionalVideoFile.name);
                if (!videoFilename) {
                    return {
                        success: false,
                        message: `Format video promosi tidak didukung (${promotionalVideoFile.name || 'tanpa nama'}). Pakai MP4 atau WebM.`
                    };
                }
                const videoBuffer = Buffer.from(promotionalVideoFile.buffer);
                atomicWriteFileSync(
                    resolvePathWithinRoot(novelPath, validatePathComponent(videoFilename, 'Nama file video promosi')),
                    videoBuffer
                );
                metaData.promotionalVideo = videoFilename;
                console.log(`[NovelCRUD] Video promosi untuk novel '${novelTitle}' disimpan sebagai ${videoFilename}.`);
            } else if (!metaData.promotionalVideo) {
                // Berkas lama dari versi sebelumnya tetap terbaca — termasuk video.webm
                // yang dulu tak pernah dilirik karena fallback-nya hardcode video.mp4.
                const legacyVideo = findLegacyPromoVideo(novelPath);
                if (legacyVideo) metaData.promotionalVideo = legacyVideo;
            }

            if (storyDesc !== undefined) metaData.storyDesc = String(storyDesc).substring(0, 80);
            if (description !== undefined) metaData.description = description;
            if (genre !== undefined) metaData.genre = genre;
            if (author !== undefined) metaData.author = author;
            if (illustrator !== undefined) metaData.illustrator = illustrator;
            if (vnMapper !== undefined) metaData.vnMapper = vnMapper;
            // Versi novel: string bebas, dipangkas saja. Tanpa validasi SemVer —
            // kreator boleh menulis '0.1.0-alpha', 'Rilis Perdana', atau apa pun.
            if (version !== undefined) metaData.version = String(version).trim().substring(0, 40);
            // Target viewport. `null` = kembali ke bawaan, dan kuncinya DIBUANG —
            // bukan ditulis 1920×1080. Menulis nilai bawaan secara eksplisit
            // membuat "belum diatur" tak bisa dibedakan dari "kebetulan sama",
            // dan memaksa tiap novel memamerkan angka yang tak pernah dipilih.
            if (viewport !== undefined) {
                targetViewport.terapkanKeMeta(
                    metaData,
                    viewport ? viewport.width : null,
                    viewport ? viewport.height : null
                );
            }
            // Gambar Discord RPC. Kosong/tak sah MEMBUANG kuncinya — string kosong
            // yang tersimpan membuat "belum diisi" tak bisa dibedakan dari "pernah
            // diisi lalu dikosongkan", padahal keduanya berarti hal yang sama.
            if (rpcLargeImage !== undefined) {
                novelRpc.terapkanKeMeta(metaData, rpcLargeImage);
            }
            // Penanda "jangan sebut judul novel ini di Discord". Disimpan
            // terpisah dari alamat gambar supaya mengosongkan gambar tidak ikut
            // membatalkannya.
            if (rpcPrivate !== undefined) {
                novelRpc.terapkanPrivatKeMeta(metaData, rpcPrivate === true);
            }
            if (coverFile && coverFile.buffer) {
                const extension = path.extname(coverFile.name) || '.jpg';
                const coverFilename = validatePathComponent('cover' + extension, 'Nama file cover');
                atomicWriteFileSync(
                    resolvePathWithinRoot(novelPath, coverFilename),
                    Buffer.from(coverFile.buffer)
                );
                metaData.cover = coverFilename;
            }
            if (cover !== undefined) {
                metaData.cover = cover
                    ? validatePathComponent(cover, 'Nama file cover')
                    : cover;
            }
            if (!metaData.cover) metaData.cover = findLegacyCover(novelPath);

            writeNovelMeta(metaPath, metaData);

            // Sesudah meta ditulis (jadi tidak lagi menyebut cover lama), sapu berkas
            // cover yatim akibat pergantian format. Hanya saat cover memang diunggah.
            let message = 'Detail novel berhasil diperbarui!';
            if (coverFile && coverFile.buffer) {
                const sapu = cleanStaleCovers(novelPath, metaData.cover);
                if (sapu.dihapus.length) {
                    message += ` Cover lama dihapus: ${sapu.dihapus.join(', ')}.`;
                }
                if (sapu.dipertahankan.length) {
                    message += ` ${sapu.dipertahankan.join(', ')} dipertahankan karena masih dirujuk berkas lain.`;
                }
            }

            return { success: true, message };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal memperbarui detail novel: ${error}`);
            return { success: false, message: `Terjadi kesalahan: ${error.message}` };
        }
    });

    // ---- Hapus folder novel ----
    ipcMain.handle('delete-novel-folder', async (event, novelTitle) => {
        try {
            const novelPath = resolveNovelPath(novelTitle);
            if (fs.existsSync(novelPath)) {
                fs.rmSync(novelPath, { recursive: true, force: true });
                console.log(`[NovelCRUD] Folder novel '${novelTitle}' dihapus karena pembatalan.`);
                return { success: true, message: 'Novel yang belum selesai dihapus.' };
            }
            return { success: true, message: 'Folder novel tidak ditemukan, tidak ada yang dihapus.' };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal menghapus folder novel '${novelTitle}':`, error);
            return { success: false, message: `Gagal menghapus folder: ${error.message}` };
        }
    });

    // ---- Ambil deskripsi story ----
    ipcMain.handle('get-story-desc', async (event, novelTitle) => {
        try {
            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            if (fs.existsSync(metaPath)) {
                const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                return { success: true, storyDesc: metaData.storyDesc || '' };
            }
            return { success: true, storyDesc: '' };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal membaca storyDesc untuk '${novelTitle}':`, error);
            return { success: false, message: error.message, storyDesc: '' };
        }
    });

    // ---- Status onboarding novel baru ----
    ipcMain.handle('get-new-novel-onboarding-state', async (event, { novelTitle, expectedNovelId } = {}) => {
        try {
            if (!novelTitle) {
                return { success: false, shouldShow: false, message: 'Judul novel kosong.' };
            }

            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            const metaData = readNovelMeta(metaPath);
            const hadOnboardingState = !!(
                metaData.editorState &&
                typeof metaData.editorState === 'object' &&
                metaData.editorState.newNovelOnboarding &&
                typeof metaData.editorState.newNovelOnboarding === 'object'
            );
            const onboarding = hadOnboardingState ? metaData.editorState.newNovelOnboarding : null;
            const novelId = metaData.id || (onboarding && onboarding.createdForId) || null;
            const hasCreateIdentity = typeof expectedNovelId === 'string' && expectedNovelId.length > 0;
            const idMatches = hasCreateIdentity &&
                (expectedNovelId === novelId || (onboarding && expectedNovelId === onboarding.createdForId));
            const hasPendingOnboarding = !!onboarding && !!onboarding.createdForId && !onboarding.shownAt;
            const createdInCurrentSession = hasCreateIdentity && pendingNewNovelOnboardingIds.has(expectedNovelId);
            console.info('[Onboarding][Main] get-state dipanggil.', {
                novelTitle,
                expectedNovelId: expectedNovelId || null,
                novelId,
                hasCreateIdentity,
                hadOnboardingState,
                createdInCurrentSession,
                createdForId: onboarding ? onboarding.createdForId || null : null,
                shownAt: onboarding ? onboarding.shownAt || null : null,
                shouldShow: createdInCurrentSession && !!idMatches && hasPendingOnboarding
            });

            return {
                success: true,
                shouldShow: createdInCurrentSession && !!idMatches && hasPendingOnboarding,
                novelId,
                shownAt: onboarding ? onboarding.shownAt || null : null
            };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal membaca status onboarding untuk '${novelTitle}':`, error);
            return { success: false, shouldShow: false, message: error.message };
        }
    });

    // Consumes the one-time create flow token before the renderer displays the bar.
    // This prevents onboarding from reappearing if the user closes the editor immediately.
    ipcMain.handle('consume-new-novel-onboarding', async (event, { novelTitle, expectedNovelId } = {}) => {
        try {
            if (!novelTitle) {
                return { success: false, shouldShow: false, message: 'Judul novel kosong.' };
            }

            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            const metaData = readNovelMeta(metaPath);
            const onboarding = metaData.editorState &&
                typeof metaData.editorState === 'object' &&
                metaData.editorState.newNovelOnboarding &&
                typeof metaData.editorState.newNovelOnboarding === 'object'
                ? metaData.editorState.newNovelOnboarding
                : null;
            const novelId = metaData.id || (onboarding && onboarding.createdForId) || null;
            const hasCreateIdentity = typeof expectedNovelId === 'string' && expectedNovelId.length > 0;
            const idMatches = hasCreateIdentity && (expectedNovelId === novelId ||
                (onboarding && expectedNovelId === onboarding.createdForId));
            const createdInCurrentSession = hasCreateIdentity && pendingNewNovelOnboardingIds.has(expectedNovelId);
            const canConsume = createdInCurrentSession && !!onboarding && idMatches &&
                !!onboarding.createdForId && !onboarding.shownAt;
            console.info('[Onboarding][Main] Permintaan consume diterima.', {
                novelTitle,
                expectedNovelId: expectedNovelId || null,
                novelId,
                hasCreateIdentity,
                createdInCurrentSession,
                hasOnboardingState: !!onboarding,
                createdForId: onboarding ? onboarding.createdForId || null : null,
                shownAt: onboarding ? onboarding.shownAt || null : null,
                idMatches,
                canConsume
            });

            if (!canConsume) {
                return {
                    success: true,
                    shouldShow: false,
                    novelId,
                    shownAt: onboarding ? onboarding.shownAt || null : null
                };
            }

            onboarding.shownAt = new Date().toISOString();
            pendingNewNovelOnboardingIds.delete(expectedNovelId);
            writeNovelMeta(metaPath, metaData);
            console.info('[Onboarding][Main] Tiket onboarding dikonsumsi.', {
                novelTitle,
                novelId,
                shownAt: onboarding.shownAt
            });

            return {
                success: true,
                shouldShow: true,
                novelId,
                shownAt: onboarding.shownAt
            };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal mengonsumsi status onboarding untuk '${novelTitle}':`, error);
            return { success: false, shouldShow: false, message: error.message };
        }
    });

    ipcMain.handle('mark-new-novel-onboarding-seen', async (event, { novelTitle, expectedNovelId } = {}) => {
        try {
            if (!novelTitle) {
                return { success: false, message: 'Judul novel kosong.' };
            }

            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            const metaData = readNovelMeta(metaPath);
            const onboarding = ensureEditorState(metaData);
            const novelId = metaData.id || onboarding.createdForId || null;
            const createdInCurrentSession = !!expectedNovelId && pendingNewNovelOnboardingIds.has(expectedNovelId);
            console.warn('[Onboarding][Main] Handler mark-new-novel-onboarding-seen lama dipanggil.', {
                novelTitle,
                expectedNovelId: expectedNovelId || null,
                novelId,
                createdInCurrentSession,
                createdForId: onboarding.createdForId || null,
                shownAt: onboarding.shownAt || null
            });

            if (!expectedNovelId) {
                return { success: false, message: 'Token onboarding dari alur create tidak tersedia.' };
            }

            if (!createdInCurrentSession) {
                return { success: false, message: 'Sesi pembuatan novel baru sudah tidak aktif.' };
            }

            if (expectedNovelId && expectedNovelId !== novelId && expectedNovelId !== onboarding.createdForId) {
                return { success: false, message: 'Token onboarding tidak cocok.' };
            }

            onboarding.createdForId = onboarding.createdForId || novelId;
            onboarding.shownAt = onboarding.shownAt || new Date().toISOString();
            pendingNewNovelOnboardingIds.delete(expectedNovelId);
            writeNovelMeta(metaPath, metaData);

            return { success: true, shownAt: onboarding.shownAt };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal menandai onboarding untuk '${novelTitle}':`, error);
            return { success: false, message: error.message };
        }
    });

    // ---- Update deskripsi story ----
    ipcMain.handle('update-story-desc', async (event, { novelTitle, storyDesc }) => {
        try {
            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');
            let metaData = {};

            if (fs.existsSync(metaPath)) {
                metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            }

            metaData.storyDesc = storyDesc;
            writeNovelMeta(metaPath, metaData);
            console.log(`[NovelCRUD] storyDesc untuk '${novelTitle}' diperbarui: "${storyDesc}"`);

            return { success: true, message: 'Deskripsi novel berhasil diperbarui!' };
        } catch (error) {
            console.error(`[NovelCRUD] Gagal memperbarui storyDesc untuk '${novelTitle}':`, error);
            return { success: false, message: `Gagal memperbarui: ${error.message}` };
        }
    });

    // ---- Ambil detail hub (metadata novel + migrasi legacy) ----
    ipcMain.handle('get-hub-details', async (event, novelTitle) => {
        try {
            const novelPath = resolveNovelPath(novelTitle);
            const metaPath = resolveNovelFile(novelTitle, 'novel-meta.json');

            if (fs.existsSync(metaPath)) {
                const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const profileMedia = getProfileMediaWithFallback(novelPath, metaData);
                return {
                    success: true,
                    isMetaJson: true,
                    title: metaData.title || novelTitle,
                    storyDesc: metaData.storyDesc || '',
                    description: metaData.description || '',
                    genre: metaData.genre || '',
                    author: metaData.author || '',
                    illustrator: metaData.illustrator || '',
                    vnMapper: metaData.vnMapper || '',
                    version: metaData.version || '',
                    targetViewport: targetViewport.dariMeta(metaData),
                    discordRpc: novelRpc.dariMeta(metaData),
                    cover: profileMedia.cover,
                    promotionalVideo: profileMedia.promotionalVideo,
                    id: metaData.id || null,
                    editorState: metaData.editorState || {}
                };
            }

            const hubPath = path.join(novelPath, 'index.html');
            if (!fs.existsSync(hubPath)) {
                return { success: false, message: 'File index.html atau novel-meta.json tidak ditemukan.' };
            }

            const metaData = migrateFromLegacyIndexHtml(hubPath, novelTitle);
            const profileMedia = getProfileMediaWithFallback(novelPath, metaData);
            writeNovelMeta(metaPath, metaData);
            console.log(`[NovelCRUD] Auto-migrasi novel-meta.json dibuat untuk legacy novel '${novelTitle}'`);

            return {
                success: true,
                isMetaJson: true,
                title: metaData.title || novelTitle,
                storyDesc: metaData.storyDesc || '',
                description: metaData.description || '',
                genre: metaData.genre || '',
                author: metaData.author || '',
                illustrator: metaData.illustrator || '',
                vnMapper: metaData.vnMapper || '',
                version: metaData.version || '',
                targetViewport: targetViewport.dariMeta(metaData),
                discordRpc: novelRpc.dariMeta(metaData),
                cover: profileMedia.cover,
                promotionalVideo: profileMedia.promotionalVideo,
                id: metaData.id || null,
                editorState: metaData.editorState || {}
            };
        } catch (error) {
            return { success: false, message: `Gagal membaca detail hub: ${error.message}` };
        }
    });

    // ---- Ganti nama novel (rename folder + migrasi save) ----
    //
    // Judul novel ADALAH primary key: `resolveNovelPath(title)` menjadikan nama
    // folder sebagai identitasnya, dan `storyTitle` muncul ratusan kali di seluruh
    // engine. Mengganti nama berarti mengganti kunci — bukan menyunting label.
    //
    // Kabar baiknya, seluruh state novel tinggal DI DALAM foldernya (`saves/`,
    // `achievements-state.json`, `hub-flags.json`, `story-vars.json`), jadi rename
    // folder membawa semuanya serta. Yang TIDAK ikut cuma satu, dan justru itu yang
    // paling merusak: tiap `save_slot_*.json` menyimpan `storyTitle` DI DALAM
    // dirinya, dan `restoreEngineStateFromSave()` memakai nilai itu untuk menyusun
    // path. Tanpa migrasi, tiap save lama menunjuk folder yang sudah tidak ada dan
    // pemain cuma melihat "Gagal memuat save".
    //
    // Karena itu ini satu TRANSAKSI, dengan pola yang sama seperti
    // `chapter-manifest:save`: simpan keadaan lama, tulis, kembalikan bila langkah
    // berikutnya gagal, dan laporkan `rolledBack` apa adanya.
    ipcMain.handle('novel:rename', async (event, { originalTitle, newTitle } = {}) => {
        let renamed = false;
        let novelPath = null;
        let oldPath = null;
        // Snapshot isi slot SEBELUM disentuh. Tanpa ini, kegagalan di tengah
        // migrasi meninggalkan sebagian slot memakai nama BARU sementara
        // foldernya sudah dikembalikan ke nama LAMA — lebih buruk daripada
        // tidak mencoba sama sekali.
        const snapshotSlot = [];

        try {
            const safeOld = validatePathComponent(originalTitle, 'Nama novel lama');
            const safeNew = validatePathComponent(String(newTitle || '').trim(), 'Nama novel baru');

            oldPath = resolveNovelPath(safeOld);
            if (!fs.existsSync(oldPath)) {
                return { success: false, message: 'Novel yang mau diganti namanya tidak ditemukan.' };
            }
            if (safeOld === safeNew) {
                return { success: true, message: 'Nama novel tidak berubah.', novelTitle: safeOld, renamed: false };
            }

            const newPath = resolveNovelPath(safeNew);
            // Ditolak SEBELUM apa pun disentuh. Di Windows perbandingan nama folder
            // tidak peka huruf besar-kecil, jadi "novelku" vs "Novelku" akan menimpa.
            if (fs.existsSync(newPath)) {
                return { success: false, message: 'Sudah ada novel dengan judul itu. Pilih judul lain.' };
            }

            fs.renameSync(oldPath, newPath);
            renamed = true;
            novelPath = newPath;

            // --- Metadata ---
            const metaPath = resolvePathWithinRoot(novelPath, 'novel-meta.json');
            let metaData = {};
            if (fs.existsSync(metaPath)) {
                try {
                    metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                } catch (e) {
                    console.error('[NovelCRUD] novel-meta.json tidak bisa diparse saat rename:', e);
                    metaData = {};
                }
            } else {
                const legacyPath = path.join(novelPath, 'index.html');
                if (fs.existsSync(legacyPath)) {
                    metaData = migrateFromLegacyIndexHtml(legacyPath, safeOld);
                }
            }
            metaData.title = safeNew;
            writeNovelMeta(metaPath, metaData);

            // --- Migrasi save slot ---
            const saveDir = path.join(novelPath, 'saves');
            let slotDiperbarui = 0;
            const slotRusak = [];
            if (fs.existsSync(saveDir)) {
                const berkas = fs.readdirSync(saveDir)
                    .filter((f) => f.startsWith('save_slot_') && f.endsWith('.json'));
                for (const nama of berkas) {
                    const p = path.join(saveDir, nama);
                    const isi = fs.readFileSync(p, 'utf-8');
                    snapshotSlot.push({ path: p, isi });
                    let data;
                    try {
                        data = JSON.parse(isi);
                    } catch (e) {
                        // Save yang sudah korup sebelum kita datang bukan urusan
                        // rename. Lewati, laporkan, jangan gagalkan seluruh operasi.
                        slotRusak.push(nama);
                        continue;
                    }
                    data.storyTitle = safeNew;
                    atomicWriteFileSync(p, JSON.stringify(data, null, 2), { encoding: 'utf8' });
                    slotDiperbarui++;
                }
            }

            // --- Hub legacy: judulnya tertanam di markup ---
            // TIDAK ditulis ulang. `index.html` legacy itu berkas kreator, dan
            // menyulapnya diam-diam adalah kelas kesalahan yang sama dengan
            // menimpa suntingan tangan. Katakan saja apa adanya.
            const hubLegacy = !fs.existsSync(path.join(novelPath, 'hub.html'))
                && fs.existsSync(path.join(novelPath, 'index.html'));

            let message = 'Novel diganti nama menjadi "' + safeNew + '".';
            if (slotDiperbarui > 0) message += ' ' + slotDiperbarui + ' save slot ikut diperbarui.';
            if (slotRusak.length) message += ' ' + slotRusak.length + ' slot dilewati karena berkasnya rusak: ' + slotRusak.join(', ') + '.';
            if (hubLegacy) message += ' Hub lama novel ini masih memuat judul lama di markup-nya — buka Editor Kode untuk memperbaruinya.';

            const mainWindow = getMainWindow();
            if (mainWindow) {
                mainWindow.webContents.send('hub-html-updated', { novelTitle: safeNew });
            }

            console.log('[NovelCRUD] Novel "' + safeOld + '" -> "' + safeNew + '" (' + slotDiperbarui + ' slot dimigrasi).');
            return {
                success: true,
                message,
                novelTitle: safeNew,
                previousTitle: safeOld,
                renamed: true,
                slotDiperbarui,
                slotRusak,
                hubLegacy
            };
        } catch (error) {
            // Kembalikan ke keadaan semula: isi slot dulu (selagi foldernya masih
            // bernama baru), baru nama foldernya.
            // Tiap slot dipulihkan SENDIRI-SENDIRI. Satu blok try untuk semuanya
            // membuat kegagalan pada satu slot ikut membatalkan pemulihan nama
            // folder — padahal justru nama folder itu yang paling penting kembali.
            //
            // Slot yang isinya masih SAMA PERSIS dengan snapshot dilewati: ia
            // memang belum sempat tersentuh. `atomicWriteFileSync` menulis ke temp
            // lalu rename, jadi kegagalannya tidak pernah meninggalkan tulisan
            // parsial di target. Tanpa lompatan ini, kegagalan disk yang menetap
            // membuat pemulihan mencoba menulis ulang berkas yang sudah benar,
            // gagal lagi, lalu melaporkan rollback tidak terjadi — padahal terjadi.
            const slotGagalPulih = [];
            snapshotSlot.forEach(({ path: p, isi }) => {
                try {
                    if (!fs.existsSync(p)) return;
                    if (fs.readFileSync(p, 'utf-8') === isi) return;
                    atomicWriteFileSync(p, isi, { encoding: 'utf8' });
                } catch (slotError) {
                    // Laporkan hanya bila isinya BENAR-BENAR masih berbeda.
                    try {
                        if (fs.readFileSync(p, 'utf-8') !== isi) slotGagalPulih.push(path.basename(p));
                    } catch (_) {
                        slotGagalPulih.push(path.basename(p));
                    }
                }
            });

            let rolledBack = false;
            try {
                if (renamed && novelPath && oldPath && fs.existsSync(novelPath)) {
                    fs.renameSync(novelPath, oldPath);
                }
                rolledBack = renamed;
            } catch (rbError) {
                console.error('[NovelCRUD] Rollback nama folder GAGAL:', rbError);
            }

            console.error('[NovelCRUD] Gagal mengganti nama novel:', error);
            let pesan = 'Gagal mengganti nama: ' + error.message + '.';
            if (rolledBack && !slotGagalPulih.length) {
                pesan += ' Semua perubahan sudah dikembalikan.';
            } else if (rolledBack) {
                pesan += ' Nama folder sudah dikembalikan, tetapi ' + slotGagalPulih.length
                    + ' save slot tidak bisa dipulihkan: ' + slotGagalPulih.join(', ') + '.';
            } else if (renamed) {
                pesan += ' Nama folder TIDAK bisa dikembalikan — periksa folder novel secara manual.';
            }
            return { success: false, rolledBack, slotGagalPulih, message: pesan };
        }
    });

    // ---- Rename chapter ----
    ipcMain.handle('rename-chapter', async (event, { novelTitle, oldChapterName, newChapterName }) => {
        try {
            const oldPath = resolveChapterPath(novelTitle, oldChapterName);
            const newPath = resolveChapterPath(novelTitle, newChapterName);

            if (fs.existsSync(newPath)) {
                return { success: false, message: 'Nama chapter tersebut sudah ada.' };
            }
            fs.renameSync(oldPath, newPath);
            return { success: true, message: 'Nama chapter berhasil diubah.' };
        } catch (error) {
            return { success: false, message: `Gagal mengubah nama: ${error.message}` };
        }
    });

    // ---- Hapus chapter ----
    ipcMain.handle('delete-chapter', async (event, { novelTitle, chapterName }) => {
        try {
            const chapterPath = resolveChapterPath(novelTitle, chapterName);
            if (fs.existsSync(chapterPath)) {
                fs.rmSync(chapterPath, { recursive: true, force: true });
                return { success: true, message: `Chapter '${chapterName}' berhasil dihapus.` };
            }
            return { success: false, message: 'Chapter tidak ditemukan.' };
        } catch (error) {
            return { success: false, message: `Gagal menghapus chapter: ${error.message}` };
        }
    });

    // ---- Buat chapter baru ----
    ipcMain.handle('create-new-chapter', async (event, { storyTitle, newChapterName }) => {
        try {
            if (!newChapterName || !newChapterName.trim()) {
                return { success: false, message: 'Nama chapter tidak boleh kosong.' };
            }
            const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
            const safeChapterName = validatePathComponent(newChapterName, 'Nama chapter');
            const novelDir = resolveNovelPath(safeStoryTitle);
            const newChapterPath = resolveChapterPath(safeStoryTitle, safeChapterName);

            if (fs.existsSync(newChapterPath)) {
                return { success: false, message: `Chapter '${safeChapterName}' sudah ada.` };
            }

            fs.mkdirSync(newChapterPath, { recursive: true });

            // 1. script.json — naskah milik chapter ini (starter playable)
            const scriptPath = resolvePathWithinRoot(newChapterPath, 'script.json');
            atomicWriteFileSync(
                scriptPath,
                JSON.stringify(buildStarterScript(safeChapterName), null, 2),
                { encoding: 'utf8' }
            );

            // 2. player.html TIDAK lagi dibuat per-chapter (D2 + §18).
            //    Dulu tiap chapter baru mendapat salinannya sendiri — itulah yang
            //    melahirkan "13 file untuk 13 chapter" dan, lebih buruk, MEMBAYANGI
            //    `<novel>/player.html` sehingga menerapkan template di scope Global
            //    tampak berhasil tapi tak pernah dipakai (kegagalan separuh senyap).
            //    Sekarang: satu file di level NOVEL melayani semua chapter; chapter
            //    hanya punya file sendiri bila kreator memang ingin berbeda.
            let novelPlayerEnsured = false;
            try {
                if (!fs.existsSync(path.join(novelDir, 'player.html'))) {
                    const scaffold = scaffoldChapterPlayer(novelDir, {
                        novelTitle: safeStoryTitle,
                        chapterName: safeStoryTitle,
                        template: 'engine'
                    });
                    novelPlayerEnsured = scaffold.created === true;
                }
            } catch (scaffoldErr) {
                console.error('[NovelCRUD] Gagal memastikan player.html level novel (chapter tetap dibuat):', scaffoldErr);
            }

            console.log(`[NovelCRUD] Chapter baru dibuat: ${newChapterPath} (player level novel ${novelPlayerEnsured ? 'DIBUAT' : 'sudah ada / dilewati'})`);
            return {
                success: true,
                // Chapter tak lagi punya player.html sendiri — ia mewarisi milik novel.
                playerScaffolded: false,
                inheritsNovelPlayer: true,
                novelPlayerCreated: novelPlayerEnsured,
                message: `Chapter '${newChapterName}' dibuat — script.json siap, tampilan mengikuti player novel.`
            };
        } catch (error) {
            console.error('[NovelCRUD] Gagal membuat chapter baru:', error);
            return { success: false, message: `Gagal membuat chapter: ${error.message}` };
        }
    });

    // ---- Chapter Manifest (chapters.json) ----
    // UI pengelolanya: "📚 Atur Chapter" di tab Story (editorPanelNav.js).
    // Konsumsi runtime sudah ada sejak 2026-07-04 (core.js _readChapterManifest /
    // getChapterListData / getNextChapterSync) — handler ini murni sisi authoring.

    // Daftar folder chapter utama (berisi script.json, di luar sidestories/) —
    // logika sama dengan getChapterListData di core.js.
    function _listMainChapterFolders(novelPath) {
        const result = [];
        if (!fs.existsSync(novelPath)) return result;
        fs.readdirSync(novelPath).forEach((folder) => {
            const folderPath = path.join(novelPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) return;
            if (folder.toLowerCase() === 'sidestories') return;
            if (fs.existsSync(path.join(folderPath, 'script.json'))) result.push(folder);
        });
        return result;
    }

    // Kumpulkan nama flag yang BENAR-BENAR ada di novel ini, untuk saran dropdown
    // unlockFlag: (1) key set_hub_flag di semua script.json (chapter utama + side
    // story), (2) key hub-flags.json (flag yang pernah ter-set saat playtest).
    function _scanKnownHubFlags(novelPath) {
        const flags = new Set();
        const addFromScript = (scriptPath) => {
            try {
                const data = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
                if (!Array.isArray(data)) return;
                data.forEach((entry) => {
                    if (!entry || entry.type !== 'custom' || entry.command !== 'set_hub_flag' || !entry.params) return;
                    try {
                        const p = typeof entry.params === 'string' ? JSON.parse(entry.params) : entry.params;
                        if (p && typeof p.key === 'string' && p.key) flags.add(p.key);
                    } catch (e) { /* params bukan JSON valid — lewati */ }
                });
            } catch (e) { /* script tak terbaca/tak valid — lewati */ }
        };
        _listMainChapterFolders(novelPath).forEach((folder) => {
            addFromScript(path.join(novelPath, folder, 'script.json'));
        });
        const sideDir = path.join(novelPath, 'sidestories');
        if (fs.existsSync(sideDir)) {
            fs.readdirSync(sideDir).forEach((sub) => {
                const p = path.join(sideDir, sub, 'script.json');
                if (fs.existsSync(p)) addFromScript(p);
            });
        }
        try {
            const hubFlagsPath = path.join(novelPath, 'hub-flags.json');
            if (fs.existsSync(hubFlagsPath)) {
                const hf = JSON.parse(fs.readFileSync(hubFlagsPath, 'utf-8'));
                if (hf && typeof hf === 'object') Object.keys(hf).forEach((k) => flags.add(k));
            }
        } catch (e) { /* hub-flags korup — lewati */ }
        return Array.from(flags).sort();
    }

    ipcMain.handle('chapter-manifest:get', async (event, payload = {}) => {
        try {
            const { novelTitle } = payload || {};
            const safeNovelTitle = validatePathComponent(novelTitle, 'Nama novel');
            const novelPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle);
            const chapters = _listMainChapterFolders(novelPath);
            const manifestPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle, 'chapters.json');
            let manifest = null;
            if (fs.existsSync(manifestPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    manifest = Array.isArray(data) ? data : null;
                } catch (e) {
                    return { success: false, message: `chapters.json ada tapi tidak valid: ${e.message}` };
                }
            }
            // Entri manifest yang foldernya sudah tidak ada (rename/hapus manual).
            const missingFolders = (manifest || [])
                .filter((m) => m && m.folder && !chapters.includes(m.folder))
                .map((m) => m.folder);
            return {
                success: true,
                exists: !!manifest,
                manifest: manifest || [],
                chapters,
                missingFolders,
                knownFlags: _scanKnownHubFlags(novelPath),
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    /**
     * Simpan urutan chapter + metadata Chapter Select dalam SATU transaksi.
     *
     * UX-A09: dulu renderer menulis chapters.json lewat handler ini, lalu mengirim
     * SELURUH `window.hubConfig` ke `save-hub-config`. Objek itu adalah draft
     * hidup yang dimutasi Inspector Hub tanpa Save, jadi menyimpan urutan chapter
     * diam-diam ikut meng-commit rename scene yang belum disetujui — dan sejak
     * UX-A03 ikut memmaterialisasikannya ke hub.html/partial.
     *
     * Sekarang renderer hanya mengirim metadata chapter (`chapterMeta`), dan
     * config canonical dibaca dari DISK di sini. Draft Hub lain tak punya jalan
     * untuk menumpang.
     */
    ipcMain.handle('chapter-manifest:save', async (event, payload = {}) => {
        try {
            const { novelTitle, entries, chapterMeta } = payload || {};
            if (!Array.isArray(entries)) return { success: false, message: 'Format manifest tidak valid (harus array).' };
            const safeNovelTitle = validatePathComponent(novelTitle, 'Nama novel');
            const novelPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle);
            const chapters = _listMainChapterFolders(novelPath);
            const manifestPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle, 'chapters.json');

            // Baseline-preserving: entri lama dengan folder sama di-merge, supaya
            // field yang tak dimodel UI manifest (dari versi mendatang) tak hilang.
            const oldByFolder = {};
            if (fs.existsSync(manifestPath)) {
                try {
                    const old = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    if (Array.isArray(old)) old.forEach((m) => { if (m && m.folder) oldByFolder[m.folder] = m; });
                } catch (e) { /* manifest lama korup — mulai bersih */ }
            }

            const skipped = [];
            const finalEntries = [];
            entries.forEach((entry, idx) => {
                if (!entry || typeof entry.folder !== 'string' || !entry.folder.trim()) return;
                // Nama folder adalah satu komponen path, bukan relative path.
                // Input tidak di-trim agar nilai yang divalidasi sama dengan nama
                // yang dibandingkan ke filesystem.
                const folder = validatePathComponent(entry.folder, 'Nama folder chapter');
                if (!chapters.includes(folder)) { skipped.push(folder); return; }
                const merged = Object.assign({}, oldByFolder[folder] || {});
                merged.folder = folder;
                merged.order = idx;
                // Field opsional: string kosong = hapus dari manifest (fallback runtime
                // ke nama folder / tanpa gembok), bukan menyimpan "".
                ['title', 'desc', 'cover', 'unlockFlag'].forEach((k) => {
                    const v = typeof entry[k] === 'string' ? entry[k].trim() : '';
                    if (v) merged[k] = v; else delete merged[k];
                });
                finalEntries.push(merged);
            });

            if (finalEntries.length === 0) {
                return { success: false, message: 'Manifest kosong — tidak ada chapter valid untuk disimpan.' };
            }

            // --- Siapkan sisi kedua: hub-config.json dari DISK, bukan dari renderer ---
            const configPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle, 'hub-config.json');
            let configLama = null;      // isi mentah untuk rollback
            let configBaru = null;      // null = tak perlu ditulis
            let chapterConfigCanonical = null;

            if (chapterMeta && typeof chapterMeta === 'object') {
                let cfg = {};
                if (fs.existsSync(configPath)) {
                    configLama = fs.readFileSync(configPath, 'utf-8');
                    try {
                        cfg = JSON.parse(configLama);
                    } catch (e) {
                        return { success: false, message: `hub-config.json tidak valid, metadata chapter tidak disimpan: ${e.message}` };
                    }
                }
                if (!cfg.chapterConfig || typeof cfg.chapterConfig !== 'object') cfg.chapterConfig = {};

                // Kunci milik PLAYER hidup di objek yang sama — jangan ikut terhapus
                // saat hidden/badge dikosongkan.
                const PLAYER_KEYS = ['spriteSlots', 'restrictions'];
                Object.keys(chapterMeta).forEach((folder) => {
                    const meta = chapterMeta[folder] || {};
                    const hidden = meta.hidden === true;
                    const badge = typeof meta.badge === 'string' ? meta.badge.trim() : '';
                    let cc = cfg.chapterConfig[folder];
                    if (hidden || badge) {
                        cc = cc || (cfg.chapterConfig[folder] = {});
                        if (hidden) cc.hidden = true; else delete cc.hidden;
                        if (badge) cc.badge = badge; else delete cc.badge;
                    } else if (cc) {
                        delete cc.hidden; delete cc.badge;
                        if (!PLAYER_KEYS.some((k) => cc[k] !== undefined)) delete cfg.chapterConfig[folder];
                    }
                });
                configBaru = JSON.stringify(cfg, null, 2);
                chapterConfigCanonical = cfg.chapterConfig;
            }

            // --- Commit terkoordinasi: kegagalan sisi kedua MEMULIHKAN sisi pertama ---
            const manifestLama = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf-8') : null;
            atomicWriteFileSync(manifestPath, JSON.stringify(finalEntries, null, 2), { encoding: 'utf8' });

            if (configBaru !== null) {
                try {
                    atomicWriteFileSync(configPath, configBaru, { encoding: 'utf8' });
                } catch (err) {
                    // Manifest sudah mendarat. Kembalikan supaya disk tidak berhenti
                    // di keadaan setengah — separuh tersimpan lebih menyesatkan
                    // daripada gagal seluruhnya.
                    let pulih = true;
                    try {
                        if (manifestLama === null) fs.unlinkSync(manifestPath);
                        else atomicWriteFileSync(manifestPath, manifestLama, { encoding: 'utf8' });
                    } catch (e2) {
                        pulih = false;
                        console.error('[NovelCRUD] Rollback chapters.json GAGAL:', e2);
                    }
                    return {
                        success: false,
                        message: pulih
                            ? `Metadata Chapter Select gagal disimpan (${err.message}). Urutan chapter dikembalikan ke keadaan sebelumnya — tidak ada yang tersimpan setengah.`
                            : `Metadata Chapter Select gagal disimpan (${err.message}) DAN pemulihan urutan chapter juga gagal. Periksa chapters.json secara manual.`,
                        rolledBack: pulih,
                    };
                }
            }

            console.log(`[NovelCRUD] chapters.json disimpan untuk '${novelTitle}' (${finalEntries.length} entri).`);
            return {
                success: true,
                message: `Manifest ${finalEntries.length} chapter tersimpan.` + (skipped.length ? ` Dilewati (folder tak ada): ${skipped.join(', ')}.` : ''),
                skipped,
                novelTitle: safeNovelTitle,
                manifest: finalEntries,
                chapterConfig: chapterConfigCanonical,
            };
        } catch (error) {
            return { success: false, message: `Gagal menyimpan manifest: ${error.message}` };
        }
    });

    ipcMain.handle('chapter-manifest:delete', async (event, payload = {}) => {
        try {
            const { novelTitle } = payload || {};
            const safeNovelTitle = validatePathComponent(novelTitle, 'Nama novel');
            const manifestPath = resolvePathWithinRoot(visualNovelsDirectory, safeNovelTitle, 'chapters.json');
            if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
            return { success: true, message: 'Manifest dihapus — urutan chapter kembali otomatis (alfabetis + heuristik prolog/angka).' };
        } catch (error) {
            return { success: false, message: `Gagal menghapus manifest: ${error.message}` };
        }
    });

    // ---- Custom Player per-chapter (player.html) ----
    // Mirror pola custom hub: opt-in via keberadaan file player.html di folder chapter.
    function _chapterDir(storyTitle, chapter) {
        if (!chapter) throw new Error('Nama chapter wajib diisi.');
        const dir = _playerCodeTarget(storyTitle, chapter);
        if (!dir) throw new Error('Path chapter tidak valid.');
        return dir;
    }

    // D2: ketiga handler di bawah kini melayani DUA scope. `chapter` kosong/absen
    // = level NOVEL (`<novel>/player.html`), sejajar dengan theme.css & extensions/
    // yang memang sudah punya level novel. Pola argumennya sama persis dengan
    // `player-code:*` (lihat _playerCodeTarget), jadi tak ada aturan baru dihafal.
    ipcMain.handle('chapter-player:status', async (event, { storyTitle, chapter }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, exists: false, message: 'Path tidak valid.' };
            const exists = fs.existsSync(path.join(dir, 'player.html'));
            // `novelExists` selalu dilaporkan supaya editor bisa membedakan
            // "chapter ini ikut player novel" dari "chapter ini pakai engine global".
            const novelDir = _novelDirGuarded(storyTitle);
            const novelExists = !!novelDir && fs.existsSync(path.join(novelDir, 'player.html'));

            // `kind` = jenis player yang BENAR-BENAR akan menjalankan target ini
            // ('global' | 'engine-shim' | 'custom'), dari resolver yang sama dengan
            // runtime — bukan tebakan editor. Dipakai panel untuk menyembunyikan
            // opsi yang tak akan dihormati player itu (§18).
            const globalPlayerPath = path.join(APP_ROOT, 'vn-player', 'player.html');
            const src = resolvePlayerSource(
                chapter ? dir : path.join(novelDir || dir, '__tak-ada-chapter__'),
                globalPlayerPath,
                novelDir || undefined
            );
            return {
                success: true, exists, novelExists,
                scope: chapter ? 'chapter' : 'novel',
                kind: src.kind, kindScope: src.scope
            };
        } catch (error) {
            return { success: false, exists: false, message: error.message };
        }
    });

    // template: 'engine' (default → SHIM engine bersama) | 'starter' (minimal VNPlayer API)
    //         | 'engine-legacy' (salinan inline lama — memproduksi utang, hindari)
    // overwrite: true = timpa player.html yang ada (reset dari template)
    // chapter kosong = scaffold di level NOVEL (D2)
    ipcMain.handle('chapter-player:scaffold', async (event, { storyTitle, chapter, template, overwrite }) => {
        try {
            const targetDir = _playerCodeTarget(storyTitle, chapter);
            if (!targetDir || !fs.existsSync(targetDir)) {
                return { success: false, message: chapter ? 'Folder chapter tidak ditemukan.' : 'Folder novel tidak ditemukan.' };
            }
            const result = scaffoldChapterPlayer(targetDir, {
                novelTitle: storyTitle,
                chapterName: chapter || storyTitle,
                template,
                overwrite: overwrite === true
            });
            if (result.created) {
                console.log(`[NovelCRUD] player.html (${template || 'engine'}) dibuat untuk ${storyTitle}${chapter ? '/' + chapter : ' [level novel]'}`);
            }
            return { success: true, scope: chapter ? 'chapter' : 'novel', ...result };
        } catch (error) {
            console.error('[NovelCRUD] Gagal scaffold custom player:', error);
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('chapter-player:remove', async (event, { storyTitle, chapter }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, message: 'Path tidak valid.' };
            const p = path.join(dir, 'player.html');
            if (fs.existsSync(p)) fs.unlinkSync(p);
            return { success: true, exists: false, scope: chapter ? 'chapter' : 'novel' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('chapter-player:open-folder', async (event, { storyTitle, chapter, editor }) => {
        try {
            const chapterDir = _chapterDir(storyTitle, chapter);
            if (!fs.existsSync(chapterDir)) return { success: false, message: 'Folder chapter tidak ditemukan.' };
            if (chapterDir.includes('"')) return { success: false, message: 'Path mengandung karakter tidak valid.' };
            if (editor === 'vscode') {
                const { exec } = require('child_process');
                exec(`code "${chapterDir}"`);
            } else {
                const { shell } = require('electron');
                shell.openPath(chapterDir);
            }
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // =============================================
    // CODE-FIRST PLAYER FILES — theme.css & extensions/*.js
    // Runtime player SUDAH memuat cascade ini otomatis (extension-loader.js):
    //   variables.css → tema global → <novel>/theme.css → <chapter>/theme.css
    //   extensions: <novel>/extensions/*.js + <chapter>/extensions/*.js
    // Handler ini mengekspos pengelolaannya ke EDITOR WORKSPACE (tab VN Player)
    // sehingga alur code-first player setara dengan hub (hub.css/hub.js).
    // =============================================
    function _novelDirGuarded(storyTitle) {
        if (!storyTitle) return null;
        const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
        return resolvePathWithinRoot(visualNovelsDirectory, safeStoryTitle);
    }
    function _playerCodeTarget(storyTitle, chapter) {
        const base = _novelDirGuarded(storyTitle);
        if (!base) return null;
        if (!chapter) return base;
        const normalized = String(chapter).replace(/\\/g, '/');
        const parts = normalized.split('/');
        // Side story memang memakai identitas `SideStories/<nama>` di UI. Selain
        // bentuk itu, chapter wajib tepat satu komponen path.
        if (parts.length === 2 && parts[0].toLowerCase() === 'sidestories') {
            return resolvePathWithinRoot(
                base,
                validatePathComponent(parts[0], 'Folder side story'),
                validatePathComponent(parts[1], 'Nama side story')
            );
        }
        if (parts.length !== 1) return null;
        return resolvePathWithinRoot(base, validatePathComponent(parts[0], 'Nama chapter'));
    }
    function _listExtensions(dir) {
        const extDir = path.join(dir, 'extensions');
        if (!fs.existsSync(extDir)) return [];
        try {
            return fs.readdirSync(extDir).filter(f => f.endsWith('.js'));
        } catch (e) { return []; }
    }

    const NOVEL_THEME_CSS_TEMPLATE = [
        '/* =====================================================================',
        ' * theme.css — Tema player LEVEL NOVEL (code-first).',
        ' * Dimuat OTOMATIS oleh player global untuk SEMUA chapter novel ini,',
        ' * SETELAH tema bawaan engine — jadi nilai di sini menang (cascade):',
        ' *   variables.css → tema global (Tema & Gaya) → theme.css INI → <chapter>/theme.css',
        ' *',
        ' * Cara kerja: override CSS variables engine di :root, dan/atau tulis',
        ' * CSS bebas menarget elemen player (#dialogue-box, #character-name,',
        ' * #dialogue-text, .choice-button, dll.).',
        ' * ===================================================================== */',
        '',
        ':root {',
        '    /* --- Kotak dialog --- */',
        '    /* --vn-dialogue-bg: rgba(0, 0, 0, 0.7); */',
        '    /* --vn-dialogue-border: 2px solid #fff; */',
        '    /* --vn-dialogue-radius: 10px; */',
        '',
        '    /* --- Tipografi --- */',
        '    /* --vn-font-family: "Lexend", sans-serif; */',
        '    /* --vn-dialogue-color: #fff; */',
        '    /* --vn-name-color: #FFD700; */',
        '',
        '    /* --- Pilihan (choice) --- */',
        '    /* --vn-choice-bg: rgba(0, 0, 0, 0.8); */',
        '    /* --vn-choice-hover-bg: white; */',
        '',
        '    /* --- Sprite & transisi --- */',
        '    /* --vn-sprite-base-height: 75vh; */',
        '    /* --vn-transition-duration: 500ms; */',
        '}',
        '',
        '/* CSS bebas di bawah ini. Contoh:',
        '#dialogue-box { backdrop-filter: blur(4px); }',
        '*/',
        ''
    ].join('\n');

    const CHAPTER_THEME_CSS_TEMPLATE = NOVEL_THEME_CSS_TEMPLATE
        .replace('LEVEL NOVEL', 'LEVEL CHAPTER')
        .replace('untuk SEMUA chapter novel ini,', 'HANYA untuk chapter ini,')
        .replace('theme.css INI → <chapter>/theme.css', '<novel>/theme.css → theme.css INI (paling menang)');

    function _extensionStarter(name) {
        return [
            '/**',
            ' * ' + name + ' — extension player (code-first).',
            ' * Dimuat otomatis oleh player global dari folder extensions/ (novel/chapter).',
            ' * Daftarkan kemampuan baru lewat VNRegistry — tanpa mengubah file engine:',
            ' *   VNRegistry.register("transition", nama, handler)  → "transition": "nama" di script.json',
            ' *   VNRegistry.register("effect", nama, handler)      → specialEvent { "type": "nama" }',
            ' *   VNRegistry.register("command", nama, handler)     → { "type": "custom", "command": "nama" }',
            ' *   VNRegistry.registerHook(<titik>, handler)  → cegat/ganti perilaku engine',
            ' *',
            ' * Titik hook yang tersedia (dijaga test agar daftar ini tak basi — dulu ia',
            ' * menyebut 4 sementara engine sudah punya 5):',
            ' *   player:before-dialogue   sebelum satu baris dialog dirender (boleh ubah/batalkan)',
            ' *   player:after-dialogue    sesudahnya (notifikasi)',
            ' *   player:before-transition sebelum transisi antar-entri dijalankan',
            ' *   player:settings-render   saat panel Settings dibangun (tempat menyisipkan kontrolmu)',
            ' *   player:end-screen        saat layar akhir mau tampil — kembalikan false untuk',
            ' *                            membatalkannya lalu tampilkan scene endingmu sendiri',
            ' * Lihat contoh lengkap: vn-player/extensions-example/',
            ' */',
            '',
            "VNRegistry.register('command', '" + name.replace(/\.js$/, '').replace(/[^a-z0-9_]/gi, '_') + "', function (data, vnapi) {",
            "    // data.params = string bebas dari script.json (sering JSON).",
            "    console.log('[Extension] command dijalankan:', data.params);",
            '}, {',
            "    description: 'Command kustom — ganti dengan logikamu',",
            "    author: 'Kreator'",
            '});',
            ''
        ].join('\n');
    }

    // Status seluruh file code-first player untuk satu novel (1 panggilan).
    ipcMain.handle('player-code:status', async (event, { storyTitle }) => {
        try {
            const novelDir = _novelDirGuarded(storyTitle);
            if (!novelDir || !fs.existsSync(novelDir)) return { success: false, message: 'Novel tidak ditemukan.' };
            const status = {
                novel: {
                    theme: fs.existsSync(path.join(novelDir, 'theme.css')),
                    extensions: _listExtensions(novelDir)
                },
                chapters: {}
            };
            fs.readdirSync(novelDir, { withFileTypes: true }).forEach(entry => {
                if (!entry.isDirectory()) return;
                const chDir = path.join(novelDir, entry.name);
                if (!fs.existsSync(path.join(chDir, 'script.json'))) return; // hanya chapter
                status.chapters[entry.name] = {
                    theme: fs.existsSync(path.join(chDir, 'theme.css')),
                    extensions: _listExtensions(chDir),
                    player: fs.existsSync(path.join(chDir, 'player.html'))
                };
            });
            return { success: true, ...status };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Buat theme.css (novel-level bila chapter kosong; chapter-level bila diisi).
    ipcMain.handle('player-code:scaffold-theme', async (event, { storyTitle, chapter, overwrite }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir || !fs.existsSync(dir)) return { success: false, message: 'Folder target tidak ditemukan.' };
            const p = path.join(dir, 'theme.css');
            if (fs.existsSync(p) && overwrite !== true) return { success: true, created: false, exists: true };
            atomicWriteFileSync(p, chapter ? CHAPTER_THEME_CSS_TEMPLATE : NOVEL_THEME_CSS_TEMPLATE, { encoding: 'utf8' });
            console.log(`[NovelCRUD] theme.css dibuat: ${p}`);
            return { success: true, created: true, path: p };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // D4: baca/tulis theme.css milik kreator. Picker CSS Variable di editor kini
    // menyunting FILE ini, bukan blob JSON `customCSS` — sehingga tak ada lagi dua
    // penulis untuk variabel yang sama (dan tak ada lagi lapisan tersembunyi yang
    // membuat kreator "ngoding melawan sesuatu yang tak ia tulis", §N5).
    ipcMain.handle('player-code:read-theme', async (event, { storyTitle, chapter }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, content: '', message: 'Path tidak valid.' };
            const p = path.join(dir, 'theme.css');
            return { success: true, exists: fs.existsSync(p), content: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' };
        } catch (error) {
            return { success: false, content: '', message: error.message };
        }
    });

    ipcMain.handle('player-code:write-theme', async (event, { storyTitle, chapter, content }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir || !fs.existsSync(dir)) return { success: false, message: 'Folder target tidak ditemukan.' };
            const p = path.join(dir, 'theme.css');
            const text = String(content == null ? '' : content);
            // File kosong = tak ada override → hapus daripada meninggalkan berkas
            // kosong yang membingungkan di folder kreator.
            if (!text.trim()) {
                if (fs.existsSync(p)) fs.unlinkSync(p);
                return { success: true, removed: true, path: p };
            }
            atomicWriteFileSync(p, text, { encoding: 'utf8' });
            return { success: true, removed: false, path: p };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Baca/tulis isi berkas kode player IN-APP (Lapis A editor kode).
    // `file` dibatasi ke berkas kode milik target (anti path-traversal):
    // 'player.html', 'theme.css', atau 'extensions/<nama>.js'. theme.css punya
    // handler khusus (read-theme/write-theme) yg tetap dipakai picker; ini jalur
    // generik untuk editor kode dua-pane.
    function _resolvePlayerCodeFile(dir, file) {
        if (!dir) return null;
        const f = String(file || '').replace(/\\/g, '/').trim();
        // Hanya nama berkas kode yang diizinkan; tolak absolut & traversal.
        if (!/^(player\.html|theme\.css|extensions\/[a-z0-9_-]+\.js)$/i.test(f)) return null;
        const target = path.join(dir, f);
        if (!isPathSafe(target, dir)) return null;
        return target;
    }

    // =============================================
    // NONAKTIF SEMENTARA (FB15) — berkas ditepikan, bukan dihapus
    // =============================================
    //
    // Masalahnya: berkas player di folder chapter SELALU menang atas milik novel
    // (resolvePlayerSource berhenti di kecocokan pertama). Selama ini satu-satunya
    // cara "mencoba tampilan Global" pada chapter yang punya berkas sendiri adalah
    // MENGHAPUS berkasnya — tak bisa dibatalkan, dan itulah kenapa keputusan FB15
    // ("switch Ikut Global: hapus atau beritahu?") menggantung lama.
    //
    // Jalan ketiga: RENAME. Resolver mencari nama PERSIS (`player.html`, `theme.css`)
    // dan pemindai extension menyaring `endsWith('.js')` — jadi menambahkan akhiran
    // `.off` membuat berkas itu tak terlihat oleh runtime tanpa kehilangan satu byte
    // pun. Nol perubahan di resolver: ia memang sudah berperilaku begitu.
    //
    // Kenapa rename dan bukan flag di JSON: keadaan "nonaktif" jadi TERLIHAT di pohon
    // berkas. Kalau ia hidup di config, kita melahirkan lapisan tersembunyi baru —
    // persis yang baru saja dicabut N5.
    const _OFF = '.off';

    /** Nama berkas yang boleh dinonaktifkan (yang menentukan tampilan/perilaku player). */
    function _fileStatePaths(dir, file) {
        const aktif = _resolvePlayerCodeFile(dir, file);
        if (!aktif) return null;
        return { aktif, nonaktif: aktif + _OFF };
    }

    /** 'aktif' | 'nonaktif' | 'tidak-ada' untuk satu berkas. */
    function _fileState(dir, file) {
        const p = _fileStatePaths(dir, file);
        if (!p) return 'tidak-ada';
        if (fs.existsSync(p.aktif)) return 'aktif';
        if (fs.existsSync(p.nonaktif)) return 'nonaktif';
        return 'tidak-ada';
    }

    ipcMain.handle('player-code:set-file-enabled', async (event, { storyTitle, chapter, file, enabled } = {}) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            const p = _fileStatePaths(dir, file);
            if (!p) return { success: false, message: 'Berkas tidak valid.' };
            const dari = enabled ? p.nonaktif : p.aktif;
            const ke = enabled ? p.aktif : p.nonaktif;
            if (!fs.existsSync(dari)) {
                // Sudah dalam keadaan yang diminta = sukses (idempoten), bukan galat.
                return { success: true, state: _fileState(dir, file), noop: true };
            }
            if (fs.existsSync(ke)) {
                return { success: false, message: 'Sudah ada berkas bernama ' + path.basename(ke) + '.' };
            }
            fs.renameSync(dari, ke);
            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, state: _fileState(dir, file) };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    /**
     * Peta keadaan berkas player untuk SELURUH novel dalam satu panggilan —
     * sidebar target butuh semua chapter sekaligus. Satu IPC, bukan N.
     */
    ipcMain.handle('player-code:scope-map', async (event, { storyTitle } = {}) => {
        try {
            const base = _novelDirGuarded(storyTitle);
            if (!base) return { success: false, message: 'Novel tidak valid.' };
            const baca = (dir) => ({
                player: _fileState(dir, 'player.html'),
                theme: _fileState(dir, 'theme.css'),
            });
            const chapters = {};
            fs.readdirSync(base, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .forEach((e) => {
                    const dir = path.join(base, e.name);
                    // Side story = chapter juga, dan kuncinya WAJIB sama persis dengan
                    // yang dipakai daftar target (`SideStories/<nama>`, lihat
                    // hub-config-manager get-chapter-list-for-config). Kalau kuncinya
                    // menyimpang, sidebar tak menemukan entrinya dan diam-diam
                    // menampilkan "ikut berkas di atasnya" untuk side story yang
                    // sebenarnya punya berkasnya sendiri.
                    if (e.name.toLowerCase() === 'sidestories') {
                        fs.readdirSync(dir, { withFileTypes: true })
                            .filter((s) => s.isDirectory())
                            .forEach((s) => {
                                const sd = path.join(dir, s.name);
                                if (!fs.existsSync(path.join(sd, 'script.json'))) return;
                                chapters['SideStories/' + s.name] = baca(sd);
                            });
                        return;
                    }
                    // Hanya folder yang benar-benar chapter (punya naskah) — sama dengan
                    // aturan _listMainChapterFolders, supaya sidebar tak memunculkan
                    // `hub/`, `saves/`, `extensions/` sebagai target.
                    if (!fs.existsSync(path.join(dir, 'script.json'))) return;
                    chapters[e.name] = baca(dir);
                });
            return { success: true, novel: baca(base), chapters };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    /**
     * VIEW MODEL KANONIK sumber Player (P2) — SATU jawaban untuk pertanyaan
     * "apa yang sebenarnya menjalankan target ini?".
     *
     * KENAPA ADA. Panel VN Player selama ini menjawabnya sendiri di renderer,
     * dengan `require('fs')` dan `existsSync` yang MENIRU aturan resolver. Tiap
     * tiruan adalah salinan aturan yang bisa menyimpang — pola yang sudah tiga
     * kali menghasilkan bug di proyek ini (dedup sprite, aturan carry, penebak
     * nama berkas). Di sini jawabannya datang dari resolver yang SAMA dengan
     * runtime, jadi editor tak bisa lagi berpendapat berbeda dari kenyataan.
     *
     * TIGA SUMBU YANG SENGAJA DIPISAH. Selama ini ketiganya dibaca lewat satu
     * switch "Ikut Global", padahal:
     *
     *   perilaku  — `spriteSlots`/`restrictions` di hub-config.json
     *   struktur  — `player.html` mana yang dimuat (chapter → novel → engine)
     *   tema      — lapisan `theme.css` mana yang benar-benar dimuat
     *
     * Kombinasi campuran itu SAH dan nyata: chapter boleh memakai struktur milik
     * novel sambil membawa `theme.css` sendiri, dan tetap mengikuti perilaku
     * Global. Satu label tunggal tak mungkin jujur tentang itu.
     *
     * `.off` (FB15) dilaporkan sebagai keadaan TERSENDIRI, bukan "tidak ada":
     * berkasnya masih di disk dan bisa dihidupkan lagi. UI yang menyamakan
     * keduanya akan menyuruh kreator membuat berkas yang sudah ia punya.
     */
    ipcMain.handle('player:view-model', async (event, { storyTitle, chapter } = {}) => {
        try {
            const novelDir = _novelDirGuarded(storyTitle);
            if (!novelDir || !fs.existsSync(novelDir)) {
                return { success: false, message: 'Novel tidak valid.' };
            }
            const chapterName = chapter ? String(chapter) : '';
            const chapterDir = chapterName ? _playerCodeTarget(storyTitle, chapterName) : null;
            if (chapterName && (!chapterDir || !fs.existsSync(chapterDir))) {
                return { success: false, message: 'Chapter tidak valid.' };
            }

            // --- Sumbu STRUKTUR: resolver yang sama dengan core.js ---
            const globalPlayerPath = path.join(APP_ROOT, 'vn-player', 'player.html');
            // Target level novel tak punya folder chapter; dinama-i sesuatu yang
            // pasti tidak ada supaya resolver langsung turun ke level novel.
            const src = resolvePlayerSource(
                chapterDir || path.join(novelDir, '__tak-ada-chapter__'),
                globalPlayerPath,
                novelDir
            );
            const markupScope = src.kind === 'global' ? 'engine' : src.scope;

            // --- Sumbu TEMA: lapisan yang BENAR-BENAR dimuat, termasuk marker
            //     replace-novel yang bisa MEMBUANG lapisan novel ---
            const engineThemePath = path.join(APP_ROOT, 'vn-player', 'css', 'variables.css');
            const tema = resolveEffectiveThemeFiles({
                engineThemePath,
                novelDir,
                chapterDir: chapterDir || undefined
            });

            // --- Sumbu PERILAKU: hub-config, dibaca dari DISK ---
            // Kunci presensinya `spriteSlots` + `restrictions`, BUKAN
            // PLAYER_OVERRIDE_KEYS: konstanta itu menjawab "kunci apa yang ikut
            // di-merge", bukan "apakah chapter ini punya perilaku sendiri", dan
            // `restrictions` memang di-merge lewat jalur terpisah.
            let behaviorScope = 'global';
            let behaviorKeys = [];
            if (chapterName) {
                try {
                    const cfgPath = path.join(novelDir, 'hub-config.json');
                    if (fs.existsSync(cfgPath)) {
                        const hc = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
                        const cc = (hc && hc.chapterConfig && hc.chapterConfig[chapterName]) || null;
                        if (cc) {
                            behaviorKeys = ['spriteSlots', 'restrictions']
                                .filter((k) => cc[k] !== undefined);
                        }
                    }
                } catch (e) {
                    // hub-config rusak = perilaku EFEKTIF memang Global (runtime pun
                    // gagal membacanya). Melaporkan "khusus chapter" di sini justru
                    // menutupi masalahnya.
                }
                if (behaviorKeys.length) behaviorScope = 'chapter';
            }

            return {
                success: true,
                novel: storyTitle,
                chapter: chapterName,
                behaviorScope,
                behaviorKeys,
                markupScope,
                playerKind: src.kind,
                markupPath: src.hasCustomFile ? src.filePath : null,
                themeLayers: {
                    engine: !!tema.themePath,
                    novel: !!tema.novelPath,
                    chapter: !!tema.chapterPath
                },
                themeCascadeMode: tema.cascadeMode,
                themeNovelSkipped: !!tema.novelSkipped,
                novelPlayerState: _fileState(novelDir, 'player.html'),
                novelThemeState: _fileState(novelDir, 'theme.css'),
                chapterPlayerState: chapterDir ? _fileState(chapterDir, 'player.html') : 'absent',
                chapterThemeState: chapterDir ? _fileState(chapterDir, 'theme.css') : 'absent'
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    ipcMain.handle('player-code:read-file', async (event, { storyTitle, chapter, file }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            const p = _resolvePlayerCodeFile(dir, file);
            if (!p) return { success: false, content: '', message: 'Berkas tidak valid.' };
            return { success: true, exists: fs.existsSync(p), content: fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '' };
        } catch (error) {
            return { success: false, content: '', message: error.message };
        }
    });

    ipcMain.handle('player-code:write-file', async (event, { storyTitle, chapter, file, content }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            const p = _resolvePlayerCodeFile(dir, file);
            if (!p) return { success: false, message: 'Berkas tidak valid.' };
            if (!fs.existsSync(dir)) return { success: false, message: 'Folder target tidak ditemukan.' };
            // player.html TIDAK dihapus saat kosong (berbeda dari theme.css): ia berkas
            // struktural inti; mengosongkannya = hapus target dari layar Berkas/custom-player.
            fs.mkdirSync(path.dirname(p), { recursive: true });
            atomicWriteFileSync(p, String(content == null ? '' : content), { encoding: 'utf8' });
            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, path: p };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Scene BAWAAN engine (dari vn-player/player.html). Dipakai navigator scene
    // editor: pada player 'global' & 'engine-shim', markup engine DISUNTIK saat
    // runtime — jadi scene-nya nyata ada saat dimainkan meski TIDAK tertulis di
    // file kreator. Tanpa ini navigator tampak "kosong" padahal player punya scene.
    ipcMain.handle('player-code:engine-scenes', async () => {
        try {
            const p = path.join(APP_ROOT, 'vn-player', 'player.html');
            if (!fs.existsSync(p)) return { success: true, scenes: [] };
            // Aturan "apa itu scene" hidup di `_namaSceneDi` — dipakai bersama
            // validasi scene bawaan preset (§4). Dua salinan pasti menyimpang, dan
            // penyimpangannya berujung preset lolos memakai nama yang bentrok.
            return { success: true, scenes: _namaSceneDi(fs.readFileSync(p, 'utf-8')) };
        } catch (error) {
            return { success: false, scenes: [], message: error.message };
        }
    });

    // MELIHAT SEBELUM MEMILIKI (#3) — markup satu scene engine, HANYA BACA.
    //
    // Ini yang tak bisa dilakukan engine yang menyalin screen ke folder proyek:
    // di sana satu-satunya cara membaca markup bawaan adalah men-fork-nya lebih
    // dulu. Handler ini tak menyentuh berkas kreator sama sekali.
    ipcMain.handle('player-code:engine-scene-markup', async (event, { scene } = {}) => {
        try {
            if (!scene || !/^[\w-]+$/.test(String(scene))) {
                return { success: false, message: 'Nama scene tidak valid.' };
            }
            const markup = _ekstrakSceneEngine(String(scene));
            if (!markup) {
                return { success: false, message: 'Scene "' + scene + '" tak ada di markup engine (atau <section>-nya tak seimbang).' };
            }
            return { success: true, nama: String(scene), html: markup };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // AMBIL ALIH satu scene engine (#4) — salin markupnya ke player.html kreator.
    //
    // Dedup per-nama di shim membuat versi kreator MENANG saat runtime, jadi tak
    // ada jalur baru yang perlu ditempuh untuk "mengganti": menulis scene bernama
    // sama SUDAH berarti menggantikan.
    //
    // Penjaga tabrakan nama di `player-template:apply` sengaja TIDAK berlaku di
    // sini. Di sana tabrakan adalah kejutan (template menamai scene-nya sama tanpa
    // menyatakan maksudnya); di sini tabrakan ADALAH permintaannya — kreator
    // menekan tombol yang berbunyi "ambil alih". Yang benar adalah pintu terpisah,
    // bukan validasi apply yang dilonggarkan.
    ipcMain.handle('player-code:take-over-scene', async (event, { storyTitle, chapter, scene } = {}) => {
        try {
            if (!scene || !/^[\w-]+$/.test(String(scene))) {
                return { success: false, message: 'Nama scene tidak valid.' };
            }
            const nama = String(scene);
            const dir = _playerCodeTarget(storyTitle, chapter);
            const playerFile = dir ? path.join(dir, 'player.html') : null;
            if (!playerFile || !fs.existsSync(playerFile)) {
                return { success: false, message: 'player.html target belum ada.' };
            }
            const creatorHtml = fs.readFileSync(playerFile, 'utf-8');
            // `_namaSceneDi` membuang komentar dulu — contoh scene yang masih
            // dikomentari bukan kepemilikan, dan menolaknya sebagai "sudah punya"
            // akan mengunci kreator dari layar yang sebenarnya belum ia miliki.
            if (_namaSceneDi(creatorHtml).some((s) => s.id === nama)) {
                return { success: false, alreadyOwned: true, message: 'Scene "' + nama + '" sudah kamu miliki.' };
            }
            const markup = _ekstrakSceneEngine(nama);
            if (!markup) {
                return { success: false, message: 'Scene "' + nama + '" tak ada di markup engine.' };
            }
            // GARIS DASAR untuk pemberitahuan drift (#9): sidik markup engine PADA
            // SAAT diambil. Tanpa ini perbandingan kelak cuma bisa "salinanmu vs
            // engine terkini" — yang mencampur suntinganmu sendiri dengan perubahan
            // engine, dan deraunya paling parah justru pada kreator yang paling
            // banyak menyunting, yaitu yang paling butuh pemberitahuannya.
            //
            // Dicatat SEKARANG karena hanya sekarang ia gratis: layar yang sudah
            // diambil alih tanpa cap tak akan pernah bisa dibuatkan garis dasarnya
            // surut — versi engine yang ia salin sudah tak bisa diketahui lagi.
            const cap = _capSceneEngine(markup);
            const tanggal = new Date().toISOString().slice(0, 10);
            const out = _sisipScene(creatorHtml, [{
                nama, markup,
                asal: 'diambil alih dari engine.',
                catatan: 'Sejak kamu mengambilnya, layar ini tak lagi ikut perbaikan engine.\n'
                    + '         dasar-engine: ' + cap + ' (' + tanggal + ') — penanda versi yang kamu\n'
                    + '         salin. Editor memakainya untuk memberi tahu saat engine memperbarui\n'
                    + '         layar ini; hapus barisnya kalau tak ingin diberi tahu lagi.'
            }]);
            if (out === null) return { success: false, message: '<body> penutup tak ditemukan di player.html.' };
            atomicWriteFileSync(playerFile, out, { encoding: 'utf8' });

            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, nama };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // DRIFT (#9) — layar yang kamu ambil alih, sementara engine memperbaruinya.
    //
    // Keunggulan struktural yang tak dimiliki engine yang menyalin screen ke folder
    // proyek: di sana salinanmu jadi satu-satunya yang tersisa, jadi tak ada
    // pembanding dan tak ada yang bisa memberitahumu bahwa dunia sudah bergerak.
    // Di sini engine masih menyimpan versinya, jadi perbandingannya nyata.
    //
    // Yang diperiksa hanya scene BERCAP. Scene yang kreator tulis sendiri dari nol
    // tak pernah punya garis dasar dan memang bukan urusan pemberitahuan ini.
    ipcMain.handle('player-code:scene-drift', async (event, { storyTitle, chapter } = {}) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            const playerFile = dir ? path.join(dir, 'player.html') : null;
            if (!playerFile || !fs.existsSync(playerFile)) return { success: true, scenes: [] };
            const cap = _bacaCapAmbilAlih(fs.readFileSync(playerFile, 'utf-8'));
            const scenes = Object.keys(cap).map((nama) => {
                const markup = _ekstrakSceneEngine(nama);
                // Scene yang sudah tak ada di engine tak bisa "drift" — tak ada
                // pembandingnya. Dilaporkan apa adanya, bukan dijadikan peringatan:
                // engine mencabut layar bawaan adalah kejadian sah (peta status §2),
                // dan salinan kreator justru yang membuatnya tetap hidup.
                if (!markup) return { nama, dasar: cap[nama], sekarang: null, drift: false, hilangDiEngine: true };
                const sekarang = _capSceneEngine(markup);
                return { nama, dasar: cap[nama], sekarang, drift: sekarang !== cap[nama] };
            });
            return { success: true, scenes };
        } catch (error) {
            return { success: false, scenes: [], message: error.message };
        }
    });

    // === KONTRAK PERAN (data-player-role) — inspektur di tab Code ===
    // Katalog peran yang dibutuhkan engine + lapis kepentingannya. Sengaja
    // digandakan di sini (node) dari ROLE_META di state.js (browser): dua proses
    // berbeda, tak bisa berbagi modul. Yang penting NILAINYA sama; kalau menambah
    // peran, sinkronkan keduanya (dijaga kontrak smoke).
    const _ROLE_CATALOG = {
        stage: 1, transition: 1, background: 1, 'background-next': 1, 'background-video': 1,
        'text-screen': 1, dialogue: 1, speaker: 1, text: 1, choices: 1, 'sprite-layer': 1,
        'btn-auto': 2, 'btn-history': 2, 'btn-rollback': 2, 'btn-hub': 2, backlog: 2,
        'backlog-content': 2, 'backlog-close': 2, 'btn-save': 2, 'btn-load': 2, 'btn-settings': 2,
        saveload: 2, 'saveload-slots': 2, 'saveload-title': 2, 'saveload-close': 2, settings: 2,
        'set-bgm': 2, 'set-voice': 2, 'set-sfx': 2, 'bgm-display': 2, 'voice-display': 2,
        'sfx-display': 2, 'settings-close': 2, 'settings-save': 2, 'set-fullscreen': 2,
        'set-text-speed': 2, 'text-speed-display': 2, 'set-auto-delay': 2, 'auto-delay-display': 2,
        bgm: 3, sfx: 3, voice: 3, toast: 3
    };

    function _rolesInMarkup(html) {
        // Buang komentar dulu (contoh di dalamnya bukan markup nyata — pelajaran
        // DOMParser yang sama dengan navigator scene).
        const bersih = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
        const owned = [];
        const re = /data-player-role\s*=\s*"([^"]+)"/gi;
        let m;
        while ((m = re.exec(bersih))) {
            const role = m[1];
            if (owned.some(o => o.role === role)) continue;
            const line = bersih.slice(0, m.index).split('\n').length;
            owned.push({ role, line });
        }
        return owned;
    }

    // Peta kontrak: peran apa yang DIMILIKI file kreator vs DIWARISI engine vs HILANG.
    // Editor MEMBACA ini (bukan menebak) untuk menampilkan inspektur kontrak.
    ipcMain.handle('player-code:role-map', async (event, { storyTitle, chapter } = {}) => {
        try {
            const enginePath = path.join(APP_ROOT, 'vn-player', 'player.html');
            const engineRoles = fs.existsSync(enginePath)
                ? _rolesInMarkup(fs.readFileSync(enginePath, 'utf-8')).map(o => o.role) : [];

            const dir = _playerCodeTarget(storyTitle, chapter);
            const playerFile = dir ? path.join(dir, 'player.html') : null;
            let owned = [];
            let ownsStory = false;   // kreator memiliki blok layar cerita sendiri?
            let omitted = [];        // peran yang SENGAJA tak dipakai (data-player-omit)
            if (playerFile && fs.existsSync(playerFile)) {
                const src = fs.readFileSync(playerFile, 'utf-8');
                owned = _rolesInMarkup(src);
                const bersih = src.replace(/<!--[\s\S]*?-->/g, '');
                const mBase = /<section\b[^>]*\bdata-scene-mode\s*=\s*"base"[^>]*>/i.exec(bersih);
                ownsStory = !!(mBase && /data-player-scene\s*=\s*"story"/i.test(mBase[0]));
                if (mBase) {
                    const mOmit = /\bdata-player-omit\s*=\s*"([^"]*)"/i.exec(mBase[0]);
                    if (mOmit) omitted = mOmit[1].trim().split(/\s+/).filter(Boolean);
                }
            }
            const ownedNames = owned.map(o => o.role);

            // catalog: tiap peran engine → status + lapis + baris.
            //   owned     : ada di markup kreator (bisa disunting, lompat ke baris)
            //   omitted   : sengaja tak dipakai (data-player-omit) — diam, tanpa ⚠
            //   missing   : kreator punya story tapi peran tak ada & tak diakui — ⚠
            //   inherited : masih warisan engine (kreator belum ambil alih)
            // Potong 3b: tiap peran membawa DAFTAR UTANG-nya — peran keturunan di
            // markup engine yang ikut jadi tanggung jawab kreator bila peran ini
            // diambil alih. Diturunkan dari pembendungan rentang markup NYATA, jadi
            // menambah komponen di engine tak membuatnya basi.
            const catalog = engineRoles.map((role) => {
                const o = owned.find(x => x.role === role);
                let status;
                if (o) status = 'owned';
                else if (omitted.includes(role)) status = 'omitted';
                else status = ownsStory ? 'missing' : 'inherited';
                const rel = _peranEngine(role);
                return {
                    role, lapis: _ROLE_CATALOG[role] || 2, status, line: o ? o.line : null,
                    keturunan: rel ? rel.keturunan : [],
                    induk: rel ? rel.induk : [],
                };
            });
            // Utang yang BELUM dibayar: peran yang kreator miliki, tapi keturunannya
            // masih menggantung. Dihitung sekali di sini supaya editor tak menyusun
            // ulang aturan yang sama (dan menyimpang darinya).
            const utang = catalog
                .filter((c) => c.status === 'owned' && c.keturunan.length)
                .map((c) => ({
                    role: c.role,
                    belum: c.keturunan.filter((k) => !ownedNames.includes(k) && !omitted.includes(k)),
                }))
                .filter((u) => u.belum.length);
            // Peran hilang = punya story + peran inti tak ada + TAK diakui-buang.
            const missing = ownsStory
                ? engineRoles.filter(r => !ownedNames.includes(r) && !omitted.includes(r) && (_ROLE_CATALOG[r] || 2) === 1)
                : [];
            return { success: true, ownsStory, catalog, missing, omitted, utang };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Ekstrak blok layar cerita engine (section story ber-peran) UTUH & bersih.
    // Dipakai BERSAMA oleh "Ambil Alih" (per novel) dan preset "Lengkap" (saat
    // apply) — satu sumber, bukan dua implementasi yang bakal menyimpang.
    // =============================================
    // POTONG 3b — ambil alih SATU peran
    // =============================================
    //
    // Sampai 2026-07-31 aksi ambil-alih cuma satu: SELURUH layar cerita (43 peran,
    // beku). Dedup per-peran (Potong 3a) membuat kepemilikan campur mungkin di
    // runtime; ini pintunya di editor.
    //
    // Elemen tanpa tag penutup tak bisa dicocokkan berimbang — dan lima peran
    // memang begitu (`set-bgm`/`set-voice`/`set-sfx`/`set-text-speed`/
    // `set-auto-delay` semuanya `<input type="range">`).
    /**
     * Salin subpohon SATU peran dari markup engine ke player.html kreator.
     *
     * `force` melewati peringatan induk: mengambil `text` tanpa memiliki `dialogue`
     * itu SAH (engine mencari peran, bukan posisi) tapi mengejutkan — teksnya
     * mendarat di luar kotak. Diperingatkan sekali, bukan dilarang.
     */
    ipcMain.handle('player-code:take-over-role', async (event, { storyTitle, chapter, role, force } = {}) => {
        try {
            if (!role || !/^[a-z][\w-]*$/i.test(role)) return { success: false, message: 'Peran tidak valid.' };
            const dir = _playerCodeTarget(storyTitle, chapter);
            const playerFile = dir ? path.join(dir, 'player.html') : null;
            if (!playerFile || !fs.existsSync(playerFile)) {
                return { success: false, message: 'player.html target belum ada.' };
            }
            const creatorHtml = fs.readFileSync(playerFile, 'utf-8');
            const bersih = creatorHtml.replace(/<!--[\s\S]*?-->/g, '');
            if (new RegExp('data-player-role\\s*=\\s*"' + role + '"').test(bersih)) {
                return { success: false, alreadyOwned: true, message: 'Peran "' + role + '" sudah kamu miliki.' };
            }
            const eng = _peranEngine(role);
            if (!eng) return { success: false, message: 'Peran "' + role + '" tak ada di markup engine.' };

            const dimiliki = _petaElemenPeran(bersih).map((e) => e.role);
            const indukHilang = eng.induk.filter((r) => dimiliki.indexOf(r) < 0);
            if (indukHilang.length && force !== true) {
                return {
                    success: false, needsConfirm: true, reason: 'induk-tak-dimiliki',
                    role, induk: indukHilang, keturunan: eng.keturunan,
                    message: 'Peran "' + role + '" berada di dalam ' + indukHilang.join(' > ') +
                        ' milik engine. Mengambilnya sendirian tetap BEKERJA (engine mencari peran, ' +
                        'bukan posisi), tapi elemenmu mendarat di luar wadah itu.'
                };
            }

            const komentar = '\n    <!-- ' + role.toUpperCase() + ' — diambil alih dari engine.\n'
                + '         Engine mencari data-player-role, bukan posisi: pindahkan/bungkus sebebasnya.\n'
                + (eng.keturunan.length
                    ? '         Peran di dalamnya kini tanggung jawabmu: ' + eng.keturunan.join(', ') + '.\n'
                      + '         Menghapus salah satunya = fiturnya tak tersedia; tandai lewat data-player-omit\n'
                      + '         bila memang disengaja.\n'
                    : '')
                + '    -->\n    ';
            const out = creatorHtml.replace(/<\/body>/i, komentar + eng.markup + '\n</body>');
            if (out === creatorHtml) return { success: false, message: '<body> penutup tak ditemukan di player.html.' };
            atomicWriteFileSync(playerFile, out, { encoding: 'utf8' });

            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, role, keturunan: eng.keturunan, induk: eng.induk };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    /**
     * Markup SATU scene bawaan engine, dipotong dari `vn-player/player.html`.
     *
     * Scene bersarang selalu DIBUANG: tiap scene adalah target ambil-alih
     * tersendiri, jadi mengambil yang di luar tak boleh menyeret yang di dalam
     * (dulu ini aturan khusus 'story'; sekarang berlaku untuk semuanya, karena
     * hasilnya sama-sama "dua scene bernama sama di satu berkas").
     *
     * @returns {string|null} markup lengkap, atau null bila tak ada/tak seimbang.
     */
    function _ekstrakSceneEngine(nama) {
        const p = path.join(APP_ROOT, 'vn-player', 'player.html');
        if (!fs.existsSync(p)) return null;
        const engineHtml = fs.readFileSync(p, 'utf-8');
        const bukaRe = new RegExp(
            '<section\\b[^>]*\\bdata-player-scene\\s*=\\s*"' +
            String(nama).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>', 'i');
        const mBuka = bukaRe.exec(engineHtml);
        if (!mBuka) return null;
        const openTag = mBuka[0];
        let depth = 1;
        const tagRe = /<(\/?)section\b[^>]*>/gi;
        tagRe.lastIndex = mBuka.index + openTag.length;
        let t, closeStart = -1;
        while ((t = tagRe.exec(engineHtml))) {
            depth += t[1] ? -1 : 1;
            if (depth === 0) { closeStart = t.index; break; }
        }
        if (closeStart < 0) return null;
        const inner = engineHtml.slice(mBuka.index + openTag.length, closeStart)
            .replace(/\n?\s*<section\b[^>]*\bdata-player-scene\s*=\s*"[^"]*"[\s\S]*?<\/section>/gi, '');
        return openTag + inner + '</section>';
    }

    function _extractEngineStory() { return _ekstrakSceneEngine('story'); }

    // Sisipkan markup story ke player.html kreator, sebelum scene 'end' bila ada
    // (urutan wajar: cerita dulu, ending belakangan). Mengembalikan HTML baru, atau
    // null bila story sudah dimiliki (jangan ganda).
    function _insertStoryInto(creatorHtml, storyMarkup) {
        if (/data-player-scene\s*=\s*"story"/i.test(creatorHtml.replace(/<!--[\s\S]*?-->/g, ''))) return null;
        const komentar = '\n    <!-- ============================================================\n'
            + '         LAYAR CERITA — kerangka gameplay lengkap, milikmu untuk disunting.\n'
            + '         Engine mencari data-player-role, bukan id: susun ulang sebebasnya.\n'
            + '         Komponen yang tak kamu pakai boleh DIHAPUS — lalu tandai "tak kupakai"\n'
            + '         di inspektur kontrak (menulis data-player-omit) supaya berhenti\n'
            + '         diperingatkan. Peran yang masih dipakai wajib tetap ada.\n'
            + '         ============================================================ -->\n    ';
        const blok = komentar + storyMarkup.trim() + '\n';
        const mEnd = /<section\b[^>]*data-player-scene\s*=\s*"end"/i.exec(creatorHtml);
        if (mEnd) return creatorHtml.slice(0, mEnd.index) + blok + '\n    ' + creatorHtml.slice(mEnd.index);
        if (/<\/body>/i.test(creatorHtml)) return creatorHtml.replace(/<\/body>/i, blok + '</body>');
        return creatorHtml + blok;
    }

    /**
     * Sisipkan satu/lebih scene ke player.html kreator, tepat sebelum `</body>`.
     *
     * SATU rumah untuk dua pemakai: scene bawaan preset (`player-template:apply`)
     * dan ambil-alih scene engine (`player-code:take-over-scene`). Dua salinan
     * pasti menyimpang, dan penyimpangannya berujung markup yang mendarat berbeda
     * tergantung pintu mana yang dipakai.
     *
     * @param {Array<{nama:string, markup:string, asal:string, catatan?:string}>} daftar
     * @returns {string|null} HTML baru, atau null bila `</body>` tak ditemukan.
     */
    function _sisipScene(html, daftar) {
        const blok = daftar.map((s) =>
            '\n    <!-- SCENE "' + s.nama + '" — ' + s.asal + '\n' +
            (s.catatan ? '         ' + s.catatan + '\n' : '') +
            '         Milikmu sepenuhnya: sunting, pindah, atau hapus. Engine mengenalinya\n' +
            '         lewat data-player-scene, dan ia muncul di navigator scene editor. -->\n    ' +
            s.markup
        ).join('\n');
        const out = html.replace(/<\/body>/i, blok + '\n</body>');
        return out === html ? null : out;
    }

    // "Ambil Alih" — materialkan layar cerita engine ke player.html kreator. Karena
    // story ADALAH scene, dedup shim yang SUDAH ADA (kembar.remove) membuat versi
    // kreator MENANG runtime — tak perlu jalur baru.
    ipcMain.handle('player-code:take-over-story', async (event, { storyTitle, chapter } = {}) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, message: 'Target tidak valid.' };
            const playerFile = path.join(dir, 'player.html');
            if (!fs.existsSync(playerFile)) return { success: false, message: 'player.html target belum ada.' };
            const storyMarkup = _extractEngineStory();
            if (!storyMarkup) return { success: false, message: 'Section story engine tak ditemukan/seimbang.' };
            const out = _insertStoryInto(fs.readFileSync(playerFile, 'utf-8'), storyMarkup);
            if (out === null) return { success: false, alreadyOwned: true, message: 'Layar cerita sudah kamu miliki.' };
            atomicWriteFileSync(playerFile, out, { encoding: 'utf8' });
            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, roles: _rolesInMarkup(storyMarkup).map(o => o.role) };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Tandai/lepas sebuah peran sebagai "sengaja tak dipakai" — menulis/menghapusnya
    // dari `data-player-omit` pada section story kreator. IN-FILE (bukan JSON), dibaca
    // engine (tahan warn) & editor (state 'omitted'). Butuh story sudah dimiliki.
    ipcMain.handle('player-code:set-role-omit', async (event, { storyTitle, chapter, role, omit } = {}) => {
        try {
            if (!role || !/^[a-z][\w-]*$/i.test(role)) return { success: false, message: 'Peran tidak valid.' };
            const dir = _playerCodeTarget(storyTitle, chapter);
            const playerFile = dir ? path.join(dir, 'player.html') : null;
            if (!playerFile || !fs.existsSync(playerFile)) return { success: false, message: 'player.html target belum ada.' };
            let html = fs.readFileSync(playerFile, 'utf-8');

            // Cari tag pembuka section story (base) milik kreator, di html MENTAH
            // (indeks harus valid untuk penulisan ulang). Komentar template tak
            // memuat tag <section data-scene-mode="base"> nyata, jadi aman.
            const bukaRe = /<section\b[^>]*\bdata-scene-mode\s*=\s*"base"[^>]*>/i;
            const mBuka = bukaRe.exec(html);
            if (!mBuka || !/data-player-scene\s*=\s*"story"/i.test(mBuka[0])) {
                return { success: false, message: 'Layar cerita belum kamu miliki — ambil alih dulu.' };
            }
            let tag = html.slice(mBuka.index, mBuka.index + mBuka[0].length);
            const attrRe = /\sdata-player-omit\s*=\s*"([^"]*)"/i;
            const cur = attrRe.exec(tag);
            let list = cur ? cur[1].trim().split(/\s+/).filter(Boolean) : [];
            if (omit) { if (!list.includes(role)) list.push(role); }
            else { list = list.filter(r => r !== role); }

            let newTag;
            if (list.length) {
                const attr = ' data-player-omit="' + list.join(' ') + '"';
                newTag = cur ? tag.replace(attrRe, attr) : tag.replace(/>$/, attr + '>');
            } else {
                newTag = cur ? tag.replace(attrRe, '') : tag;
            }
            html = html.slice(0, mBuka.index) + newTag + html.slice(mBuka.index + tag.length);
            atomicWriteFileSync(playerFile, html, { encoding: 'utf8' });
            const mainWindow = getMainWindow();
            if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle: storyTitle });
            return { success: true, omitted: list };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Daftar berkas extension milik target (untuk pemilih blok JS di editor kode).
    ipcMain.handle('player-code:list-extensions', async (event, { storyTitle, chapter }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, files: [] };
            const extDir = path.join(dir, 'extensions');
            if (!fs.existsSync(extDir)) return { success: true, files: [] };
            const files = fs.readdirSync(extDir).filter(f => /\.js$/i.test(f)).map(f => 'extensions/' + f);
            return { success: true, files };
        } catch (error) {
            return { success: false, files: [], message: error.message };
        }
    });

    // Buat extension starter di extensions/ (novel-level atau chapter-level).
    ipcMain.handle('player-code:scaffold-extension', async (event, { storyTitle, chapter, name }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir || !fs.existsSync(dir)) return { success: false, message: 'Folder target tidak ditemukan.' };
            let fname = String(name || 'my-extension').trim().replace(/[^a-z0-9-_]/gi, '-');
            if (!fname) fname = 'my-extension';
            if (!fname.endsWith('.js')) fname += '.js';
            const extDir = path.join(dir, 'extensions');
            fs.mkdirSync(extDir, { recursive: true });
            const p = path.join(extDir, fname);
            if (fs.existsSync(p)) return { success: false, message: 'Extension "' + fname + '" sudah ada.' };
            atomicWriteFileSync(p, _extensionStarter(fname), { encoding: 'utf8' });
            const manifestNote = _ensureExtensionManifest(extDir, fname);
            console.log(`[NovelCRUD] Extension starter dibuat: ${p}`);
            return { success: true, created: true, file: fname, manifest: manifestNote };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // F6 (audit): scaffold dari editor dulu TIDAK pernah membuat extension.json →
    // extension selalu jatuh ke jalur "legacy" yang lebih ketat, dan kreator harus
    // menulis manifest dari nol. Kini: manifest dibuat/di-merge otomatis.
    // PENTING: mode manifest HANYA memuat file yang terdaftar (main + files[]) —
    // manifest baru wajib mendaftarkan SEMUA .js yang sudah ada di folder supaya
    // extension lama tidak berhenti dimuat diam-diam.
    function _ensureExtensionManifest(extDir, newFile) {
        const manifestPath = path.join(extDir, 'extension.json');
        try {
            if (fs.existsSync(manifestPath)) {
                // Merge: daftarkan file baru bila belum tercantum; jangan sentuh
                // field lain (permissions dsb. milik kreator).
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                const listed = [manifest.main].concat(Array.isArray(manifest.files) ? manifest.files : []);
                if (listed.indexOf(newFile) < 0) {
                    manifest.files = (Array.isArray(manifest.files) ? manifest.files : []).concat([newFile]);
                    atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 4), { encoding: 'utf8' });
                    return 'updated';
                }
                return 'unchanged';
            }
            const allJs = fs.readdirSync(extDir).filter(f => f.endsWith('.js')).sort();
            const main = allJs.indexOf(newFile) >= 0 ? newFile : (allJs[0] || newFile);
            const files = allJs.filter(f => f !== main);
            const manifest = {
                _comment: 'Manifest extension (dibuat otomatis oleh editor). Hanya file yang terdaftar di "main"/"files" yang dimuat. Permission berbahaya (ipc/fs/network) harus dideklarasikan eksplisit & butuh persetujuan pemain — lihat vn-player/extensions-example/extension.json.',
                name: path.basename(path.dirname(extDir)).toLowerCase().replace(/[^a-z0-9-_]+/g, '-') + '-extensions',
                version: '1.0.0',
                description: 'Extension player untuk novel/chapter ini.',
                main: main,
                files: files,
                permissions: ['effect', 'transition', 'hook', 'dom', 'audio', 'storage'],
            };
            atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 4), { encoding: 'utf8' });
            return 'created';
        } catch (e) {
            // Manifest gagal bukan alasan menggagalkan scaffold — jalur legacy tetap jalan.
            console.warn('[NovelCRUD] Gagal menulis extension.json:', e.message);
            return 'failed';
        }
    }

    // Pasangan _ensureExtensionManifest untuk arah HAPUS (koreksi audit #4).
    // Mode manifest hanya memuat file terdaftar, dan validator MEWAJIBKAN `main`
    // ada di disk (extension-validator.js) — tanpa perawatan ini, menghapus file
    // `main` lewat tombol ✕ editor membuat manifest invalid → SELURUH folder
    // extension berhenti dimuat secara senyap (regresi vs jalur legacy pra-F6).
    function _pruneExtensionManifest(extDir, removedBase) {
        const manifestPath = path.join(extDir, 'extension.json');
        try {
            if (!fs.existsSync(manifestPath)) return 'none';
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            const beforeFiles = Array.isArray(manifest.files) ? manifest.files : [];
            let files = beforeFiles.filter(f => f !== removedBase);
            let changed = files.length !== beforeFiles.length;

            if (manifest.main === removedBase) {
                // Promosikan file terdaftar berikutnya yang benar-benar ada di disk.
                const nextMain = files.find(f => fs.existsSync(path.join(extDir, f)));
                if (!nextMain) {
                    // Tak ada .js tersisa → manifest ikut dihapus; folder kembali
                    // bersih (scaffold berikutnya membuat manifest baru yang sehat).
                    fs.unlinkSync(manifestPath);
                    return 'deleted';
                }
                manifest.main = nextMain;
                files = files.filter(f => f !== nextMain);
                changed = true;
            }

            if (!changed) return 'unchanged';
            manifest.files = files;
            atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 4), { encoding: 'utf8' });
            return 'updated';
        } catch (e) {
            // Gagal merawat manifest bukan alasan menggagalkan penghapusan file.
            console.warn('[NovelCRUD] Gagal merawat extension.json saat hapus:', e.message);
            return 'failed';
        }
    }

    // Hapus file code-first player — HANYA theme.css atau extensions/*.js.
    ipcMain.handle('player-code:remove', async (event, { storyTitle, chapter, file }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir) return { success: false, message: 'Folder target tidak valid.' };
            const allowed = file === 'theme.css' ||
                (/^extensions[\\/][\w.-]+\.js$/.test(String(file)) && String(file).indexOf('..') < 0);
            if (!allowed) return { success: false, message: 'File tidak diizinkan.' };
            const p = path.join(dir, file);
            if (!isPathSafe(p, dir)) return { success: false, message: 'Path tidak valid.' };
            if (fs.existsSync(p)) fs.unlinkSync(p);
            // Rawat extension.json bila yang dihapus adalah extension (koreksi
            // audit #4) — lihat _pruneExtensionManifest di atas.
            let manifestNote;
            if (/^extensions[\\/]/.test(String(file))) {
                manifestNote = _pruneExtensionManifest(path.dirname(p), path.basename(p));
            }
            return { success: true, manifest: manifestNote };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // =============================================
    // PUSTAKA TEMPLATE PLAYER — model GENERATOR (audit D3/N5)
    // Template BUKAN mode yang terus berlaku: ia materialisasi jadi file MILIK
    // KREATOR lalu MENYINGKIR. Persis `hub:apply-code-template-folder` yang sudah
    // matang di Hub — termasuk snapshot untuk Undo.
    //
    // Kenapa penting: `playerTheme` gaya lama adalah MODE (JSON yang berlaku ulang
    // tiap boot) sehingga kreator "ngoding melawan lapisan tersembunyi yang tak ia
    // tulis" (§N5). Setelah diterapkan di sini, kosmetik hidup di <target>/theme.css
    // milik kreator dan kunci JSON-nya DIKOSONGKAN — tak ada lagi lapisan bayangan.
    // =============================================
    const PLAYER_TEMPLATE_LIB = path.join(APP_ROOT, 'vn-player', 'templates', 'library');

    function _readPlayerTemplate(id) {
        const safeId = String(id || '').replace(/[^\w-]/g, '');
        if (!safeId) return null;
        const dir = path.join(PLAYER_TEMPLATE_LIB, safeId);
        if (!isPathSafe(dir, PLAYER_TEMPLATE_LIB)) return null;
        const metaPath = path.join(dir, 'template.json');
        if (!fs.existsSync(metaPath)) return null;
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            // Metadata lama/tanpa field tetap overlay (`inherit`). Nilai lain
            // ditolak, bukan ditebak: salah ketik di manifest tak boleh diam-diam
            // membuat template "Default" kembali mewarisi rupa Global.
            const themeCascade = meta.themeCascade === undefined ? 'inherit' : meta.themeCascade;
            if (themeCascade !== 'inherit' && themeCascade !== 'replace-novel') return null;

            // TAKSONOMI (UX-C03). `category` memisahkan pilihan SUSUNAN dari paket
            // KEMAMPUAN; nilai lain / tak ada = biarkan null supaya picker menaruhnya
            // di grup "Belum dikategorikan". Menebak kategori template pihak ketiga
            // menghasilkan label yang salah, dan label salah lebih buruk daripada
            // label kosong.
            const category = meta.category === 'layout' || meta.category === 'starter-kit'
                ? meta.category : null;
            // Nama berkas foto tak boleh keluar dari folder templatenya.
            const thumb = typeof meta.thumbnail === 'string' && meta.thumbnail
                && !/[\\/]|\.\./.test(meta.thumbnail) ? meta.thumbnail : null;
            // Keberadaan berkas dijawab di MAIN — renderer tak memegang filesystem.
            const hasThumbnail = !!thumb && fs.existsSync(path.join(dir, thumb));

            return { ...meta, id: safeId, dir, themeCascade, category, thumbnail: thumb, hasThumbnail };
        } catch (e) { return null; }
    }

    ipcMain.handle('player-template:list', async () => {
        try {
            if (!fs.existsSync(PLAYER_TEMPLATE_LIB)) return { success: true, templates: [] };
            const templates = fs.readdirSync(PLAYER_TEMPLATE_LIB, { withFileTypes: true })
                .filter(e => e.isDirectory())
                .map(e => _readPlayerTemplate(e.name))
                .filter(Boolean)
                .map(({ dir, ...meta }) => meta);      // jangan bocorkan path absolut
            return { success: true, templates };
        } catch (error) {
            return { success: false, templates: [], message: error.message };
        }
    });

    // Terapkan template ke scope target. chapter kosong = level NOVEL (D2).
    // Mengembalikan `snapshot` — SELALU, supaya editor bisa menawarkan Undo utuh
    // (isi file sebelumnya + kunci JSON yang dikosongkan). Tanpa ini, "menerapkan
    // template" jadi aksi merusak yang tak bisa dibatalkan.
    ipcMain.handle('player-template:apply', async (event, { storyTitle, chapter, templateId, force }) => {
        try {
            const tpl = _readPlayerTemplate(templateId);
            if (!tpl) return { success: false, message: 'Template "' + templateId + '" tidak ditemukan.' };

            const targetDir = _playerCodeTarget(storyTitle, chapter);
            if (!targetDir || !fs.existsSync(targetDir)) {
                return { success: false, message: 'Folder target tidak ditemukan.' };
            }

            const playerPath = path.join(targetDir, 'player.html');
            const themePath = path.join(targetDir, 'theme.css');
            const vocabPath = path.join(targetDir, 'vocab-ui.json');
            const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null);

            // --- Snapshot SEBELUM menyentuh apa pun ---
            // `vocabUi` ikut: template yang membawa kosakata sendiri (extensions/ +
            // theme.css) juga membawa LABEL-nya, jadi undo harus bisa mencabutnya
            // kembali — kalau tidak, membatalkan template meninggalkan berkas yatim
            // yang menamai kosakata yang sudah tak ada.
            const snapshot = {
                scope: chapter ? 'chapter' : 'novel',
                storyTitle, chapter: chapter || '',
                playerHtml: readIf(playerPath),
                themeCss: readIf(themePath),
                vocabUi: readIf(vocabPath)
            };

            // ⚠ KESELAMATAN: jangan pernah menimpa ENGINE CUSTOM milik kreator diam-diam.
            // player.html yang BUKAN shim = mesin sendiri — mis. 13 shim DDLC yang
            // menunjuk `ddlc-player.js`. Menimpanya memutus sambungan itu dan merusak
            // novel yang sudah jadi. Undo memang tersedia, tapi peringatan HARUS datang
            // SEBELUM aksi, bukan sesudah. Pemanggil boleh melanjutkan dengan force:true
            // setelah kreator mengonfirmasi.
            if (snapshot.playerHtml && !isEngineShim(snapshot.playerHtml) && force !== true) {
                return {
                    success: false,
                    needsConfirm: true,
                    reason: 'custom-player',
                    scope: snapshot.scope,
                    message: 'Target ini memakai engine custom sendiri (player.html bukan shim). ' +
                        'Menerapkan template akan MENGGANTINYA dan memutus sambungan ke engine itu.'
                };
            }

            // --- 1. player.html: shim tunggal + gaya dialog jadi ATRIBUT terlihat ---
            const shimSrc = fs.readFileSync(
                path.join(APP_ROOT, 'vn-player', 'templates', 'vn_player_shim.html'), 'utf-8');
            const titleText = `${escapeHtmlText(storyTitle)} | ${escapeHtmlText(chapter || storyTitle)}`;
            let shim = shimSrc
                .replace('<title>{NOVEL_TITLE} | {CHAPTER_NAME}</title>', `<title>${titleText}</title>`)
                .replace('{DIALOGUE_STYLE}', String(tpl.dialogueStyle || 'bottom-bar').replace(/[^\w-]/g, ''));

            // Preset "Lengkap" (materializeStory): suntik kerangka gameplay engine
            // UTUH ke shim, jadi kreator dapat SEMUA komponen ber-peran inline
            // (WYSIWYG, tinggal pangkas) — model "apa yang kamu kode apa yang kamu
            // dapat". Memakai helper yang SAMA dengan "Ambil Alih" (satu sumber).
            if (tpl.materializeStory) {
                const storyMarkup = _extractEngineStory();
                const withStory = storyMarkup ? _insertStoryInto(shim, storyMarkup) : null;
                if (withStory) shim = withStory;   // null bila sudah ada (tak akan, shim baru)
            }

            // --- 1b. SCENE BAWAAN PRESET (§4) — layar judul, galeri, dsb. ---
            //
            // Scene bernama BARU murni MENAMBAH: dedup shim membuang kembaran
            // berdasarkan nama, dan nama yang tak dimiliki engine tak punya kembaran.
            // Karena itu preset bisa membawa layar sendiri tanpa membekukan apa pun.
            const sceneTpl = _bacaSceneTemplate(tpl.dir);
            if (sceneTpl.galat.length) {
                // Markup setengah benar lebih berbahaya daripada yang ditolak: ia
                // mendarat di berkas kreator dan baru terasa saat dimainkan.
                return {
                    success: false, reason: 'scene-tak-valid',
                    message: 'Scene bawaan template tidak valid — ' + sceneTpl.galat.join('; ')
                };
            }
            if (sceneTpl.ok.length) {
                // Nama yang SAMA dengan scene engine akan membuang versi engine
                // (dedup per-nama) — itu pembekuan, dan pembekuan harus DIDEKLARASIKAN,
                // bukan terjadi sebagai efek samping penamaan.
                const namaEngine = _namaSceneEngine();
                const bentrok = sceneTpl.ok.filter((s) => namaEngine.indexOf(s.nama) >= 0);
                if (bentrok.length && tpl.materializeStory !== true) {
                    return {
                        success: false, reason: 'scene-bentrok',
                        message: 'Template membawa scene bernama sama dengan scene engine (' +
                            bentrok.map((s) => s.nama).join(', ') + '). Itu MENGGANTI versi engine ' +
                            'dan membekukannya. Kalau memang disengaja, template wajib menyatakan ' +
                            '"materializeStory": true.'
                    };
                }
                // Jalur penyisipan SAMA dengan ambil-alih scene engine (`_sisipScene`).
                const withScenes = _sisipScene(shim, sceneTpl.ok.map((s) => ({
                    nama: s.nama, markup: s.markup,
                    asal: 'dibawa template "' + tpl.id + '" (' + s.berkas + ').'
                })));
                if (withScenes === null) {
                    return { success: false, message: '<body> penutup tak ditemukan di shim.' };
                }
                shim = withScenes;
            }

            atomicWriteFileSync(playerPath, shim, { encoding: 'utf8' });

            // --- 2. theme.css: kosmetik jadi file MILIK KREATOR ---
            //
            // Scope chapter punya dua arti yang berbeda:
            //   inherit       = overlay di atas theme.css novel (perilaku lama)
            //   replace-novel = pilihan template penuh; baseline engine + file
            //                   chapter, tanpa rupa novel di tengahnya.
            //
            // Mode kedua dimaterialisasi sebagai marker DI DALAM theme.css supaya
            // runtime, preview, editor, dan file yang dibuka kreator membaca satu
            // kontrak yang sama. Helper menyapu marker lama dulu; menerapkan
            // template inherit sesudah Default otomatis menghidupkan warisan lagi.
            const tplTheme = path.join(tpl.dir, 'theme.css');
            const hasTemplateTheme = fs.existsSync(tplTheme);
            if (hasTemplateTheme || (chapter && tpl.themeCascade === 'replace-novel')) {
                let themeCss = hasTemplateTheme ? fs.readFileSync(tplTheme, 'utf8') : '';
                if (chapter) themeCss = materializeChapterThemeCss(themeCss, tpl.themeCascade);
                atomicWriteFileSync(themePath, themeCss, { encoding: 'utf8' });
            }

            // --- 2b. vocab-ui.json opsional: LABEL untuk kosakata paket (§27) ---
            // Tanpa ini, extension yang dibawa template muncul di dropdown sebagai
            // nama mentah (`larut_gambar`) — kosakatanya ada tapi tak terbaca manusia.
            const tplVocab = path.join(tpl.dir, 'vocab-ui.json');
            if (fs.existsSync(tplVocab)) {
                atomicWriteFileSync(vocabPath, fs.readFileSync(tplVocab), { encoding: 'utf8' });
            }

            // --- 3. extensions/ opsional: kosakata paket ikut (muncul di dropdown, D8) ---
            const tplExt = path.join(tpl.dir, 'extensions');
            const copiedExtensions = [];
            // Yang BARU dibuat template ini saja yang boleh dicabut undo — berkas
            // yang sudah ada sebelumnya milik kreator dan hanya ditimpa isinya.
            // Tanpa daftar ini, undo meninggalkan extension yatim yang tetap
            // mendaftarkan kosakata padahal player.html-nya sudah dicabut.
            const newExtensions = [];
            if (fs.existsSync(tplExt)) {
                const extDir = path.join(targetDir, 'extensions');
                fs.mkdirSync(extDir, { recursive: true });
                fs.readdirSync(tplExt).filter(f => f.endsWith('.js')).forEach((f) => {
                    const tujuan = path.join(extDir, f);
                    if (!fs.existsSync(tujuan)) newExtensions.push(f);
                    atomicWriteFileSync(tujuan, fs.readFileSync(path.join(tplExt, f)), { encoding: 'utf8' });
                    copiedExtensions.push(f);
                    _ensureExtensionManifest(extDir, f);
                });
            }
            snapshot.newExtensions = newExtensions;

            console.log(`[NovelCRUD] Template player '${tpl.id}' diterapkan ke ${storyTitle}${chapter ? '/' + chapter : ' [novel]'}`);
            return {
                success: true,
                templateId: tpl.id, label: tpl.label,
                scope: snapshot.scope,
                themeCascade: chapter ? tpl.themeCascade : 'inherit',
                copiedExtensions,
                snapshot,
                // `clearProfileKeys` DICABUT (N5, 2026-07-31). Dulu apply-template
                // ikut mengosongkan kunci kosmetik di hub-config supaya lapisan
                // tersembunyi tak menimpa file template. Sesudah N5 lapisan itu
                // sudah tak dibaca siapa pun, jadi mengosongkannya nol gunanya —
                // dan justru BERBAHAYA untuk novel yang belum dimigrasi: ia
                // menghapus satu-satunya salinan nilai yang masih dibutuhkan
                // `tools/materialisasi-tema-n5.js`. Menghapus tanpa memindahkan =
                // kehilangan senyap (kelas FB18), aturan yang sama dengan yang
                // dipakai di config-migrator.
            };
        } catch (error) {
            console.error('[NovelCRUD] Gagal menerapkan template player:', error);
            return { success: false, message: error.message };
        }
    });

    // Undo: pulihkan isi file persis seperti sebelum apply (null = file memang
    // belum ada → dihapus lagi, bukan ditinggal sebagai sisa).
    ipcMain.handle('player-template:restore', async (event, { snapshot }) => {
        try {
            if (!snapshot || !snapshot.storyTitle) return { success: false, message: 'Snapshot tidak valid.' };
            const targetDir = _playerCodeTarget(snapshot.storyTitle, snapshot.chapter);
            if (!targetDir) return { success: false, message: 'Path tidak valid.' };

            const restore = (file, content) => {
                const p = path.join(targetDir, file);
                if (content === null || content === undefined) {
                    if (fs.existsSync(p)) fs.unlinkSync(p);
                } else {
                    atomicWriteFileSync(p, content, { encoding: 'utf8' });
                }
            };
            restore('player.html', snapshot.playerHtml);
            restore('theme.css', snapshot.themeCss);
            // `vocabUi` bisa `undefined` pada snapshot LAMA (dibuat sebelum §27) —
            // itu berbeda dari `null` yang berarti "berkasnya memang belum ada".
            // Snapshot lama tak boleh menghapus berkas yang tak pernah ia rekam.
            if (snapshot.vocabUi !== undefined) restore('vocab-ui.json', snapshot.vocabUi);
            // Extension yang BARU dibawa template ikut dicabut — kalau ditinggal, ia
            // tetap mendaftarkan kosakata ke dropdown padahal template-nya sudah
            // dibatalkan (undo yang tak tuntas = keadaan yang tak pernah ada).
            (snapshot.newExtensions || []).forEach((f) => {
                if (!/^[\w.-]+\.js$/.test(String(f))) return;   // nama berkas polos saja
                const p = path.join(targetDir, 'extensions', f);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            });
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Buka satu file code-first player di VS Code (fallback: folder di Explorer).
    // Whitelist file sama dengan player-code:remove — hanya theme.css / extensions/*.js
    // (atau tanpa file = folder target itu sendiri).
    ipcMain.handle('player-code:open', async (event, { storyTitle, chapter, file }) => {
        try {
            const dir = _playerCodeTarget(storyTitle, chapter);
            if (!dir || !fs.existsSync(dir)) return { success: false, message: 'Folder target tidak ditemukan.' };
            if (file !== undefined && file !== null && file !== '') {
                const allowed = file === 'player.html' || file === 'theme.css' ||
                    (/^extensions[\\/][\w.-]+\.js$/.test(String(file)) && String(file).indexOf('..') < 0);
                if (!allowed) return { success: false, message: 'File tidak diizinkan.' };
            }
            const p = file ? path.join(dir, file) : dir;
            if (!isPathSafe(p, dir)) return { success: false, message: 'Path tidak valid.' };
            if (p.includes('"')) return { success: false, message: 'Path mengandung karakter tidak valid.' };
            const { exec } = require('child_process');
            exec(`code "${p}"`, (err) => {
                if (err) { try { require('electron').shell.showItemInFolder(p); } catch (e) { /* ignore */ } }
            });
            return { success: true };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // ---- Baca script content ----
    ipcMain.handle('get-script-content', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName } = payload || {};
            const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
            const safeChapterName = validatePathComponent(chapterName, 'Nama chapter');
            const scriptPath = resolvePathWithinRoot(
                visualNovelsDirectory,
                safeStoryTitle,
                safeChapterName,
                'script.json'
            );
            if (fs.existsSync(scriptPath)) {
                const content = fs.readFileSync(scriptPath, 'utf-8');
                const data = normalizeScript(JSON.parse(content));
                return { success: true, data };
            } else {
                return { success: true, data: [] };
            }
        } catch (error) {
            console.error('[NovelCRUD] Gagal membaca script.json:', error);
            return { success: false, message: error.message };
        }
    });

    // ---- Simpan script content ----
    ipcMain.handle('save-script-content', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName, scriptContent } = payload || {};
            const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
            const safeChapterName = validatePathComponent(chapterName, 'Nama chapter');
            const scriptPath = resolvePathWithinRoot(
                visualNovelsDirectory,
                safeStoryTitle,
                safeChapterName,
                'script.json'
            );
            const normalizedContent = normalizeScript(scriptContent);
            const content = JSON.stringify(normalizedContent, null, 2);
            atomicWriteFileSync(scriptPath, content, { encoding: 'utf8' });
            return { success: true, message: 'Skrip berhasil disimpan!' };
        } catch (error) {
            console.error('[NovelCRUD] Gagal menyimpan script.json:', error);
            return { success: false, message: error.message };
        }
    });

    // =============================================
    // i18n — Terjemahan konten per-chapter (script.<code>.json)
    // UI-nya: tombol "🌐 Terjemahan" di tab Story (editorPanelNav.js).
    // Runtime memilih file per bahasa aktif (core.resolveLocalizedScriptPath).
    // Kontrak WAJIB: struktur script.<code>.json IDENTIK dengan script.json
    // (engine memuat per-index) — hanya text/speaker/choices[].text yang beda.
    // =============================================

    // Bahasa yang dikenal UI sekaligus allowlist nama berkas terjemahan.
    // Renderer tidak boleh memilih nama file sendiri lewat kode bahasa bebas.
    const _I18N_KNOWN = [
        { code: 'en', label: 'English' },
        { code: 'ja', label: '日本語 (Japanese)' },
        { code: 'id', label: 'Bahasa Indonesia (varian)' },
        { code: 'ko', label: '한국어 (Korean)' },
        { code: 'zh', label: '中文 (Chinese)' },
    ];

    // Daftar di atas hanya saran UI, bukan pembatas bahasa engine. Pertahankan
    // kemampuan author memakai kode lain (fr, es, de, dst.) sambil memastikan
    // nilai tetap satu komponen nama file canonical dan tidak dapat menjadi path.
    const _I18N_LANGUAGE_CODE_PATTERN = /^[a-z]{2,5}$/;

    function _validateI18nLanguage(lang, optional = false) {
        if (optional && (lang === undefined || lang === null || lang === '')) return null;
        if (typeof lang !== 'string' || !_I18N_LANGUAGE_CODE_PATTERN.test(lang)) {
            const error = new Error('Kode bahasa tidak valid. Gunakan 2-5 huruf kecil (contoh: en, ja, fr).');
            error.code = 'INVALID_LANGUAGE_CODE';
            throw error;
        }
        return lang;
    }

    function _chapterScriptPath(storyTitle, chapterName, lang) {
        const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
        const safeChapterName = validatePathComponent(chapterName, 'Nama chapter');
        const safeLanguage = _validateI18nLanguage(lang, true);
        const filename = safeLanguage ? `script.${safeLanguage}.json` : 'script.json';
        return resolvePathWithinRoot(
            visualNovelsDirectory,
            safeStoryTitle,
            safeChapterName,
            filename
        );
    }

    function _chapterTranslationDirectory(storyTitle, chapterName) {
        const safeStoryTitle = validatePathComponent(storyTitle, 'Nama novel');
        const safeChapterName = validatePathComponent(chapterName, 'Nama chapter');
        return resolvePathWithinRoot(visualNovelsDirectory, safeStoryTitle, safeChapterName);
    }

    // lintScriptParity() = module-level (di-export & diuji unit), dipakai di sini.

    // Daftar bahasa terjemahan yang ada untuk sebuah chapter.
    ipcMain.handle('i18n:list-languages', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName } = payload || {};
            const dir = _chapterTranslationDirectory(storyTitle, chapterName);
            if (!fs.existsSync(path.join(dir, 'script.json'))) {
                return { success: false, message: 'Chapter belum punya script.json.' };
            }
            const languages = fs.readdirSync(dir)
                .map((f) => (f.match(/^script\.([a-z]{2,5})\.json$/) || [])[1])
                .filter((code) => _I18N_LANGUAGE_CODE_PATTERN.test(code));
            return { success: true, languages, known: _I18N_KNOWN };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Ambil script dasar + (opsional) terjemahan bahasa tertentu untuk tabel editor.
    ipcMain.handle('i18n:get-translation', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName, lang } = payload || {};
            const basePath = _chapterScriptPath(storyTitle, chapterName, null);
            if (!fs.existsSync(basePath)) return { success: false, message: 'script.json tidak ditemukan.' };
            const base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
            let translation = null;
            let parityErrors = [];
            const safeLanguage = _validateI18nLanguage(lang, true);
            if (safeLanguage) {
                const tp = _chapterScriptPath(storyTitle, chapterName, safeLanguage);
                if (fs.existsSync(tp)) {
                    translation = JSON.parse(fs.readFileSync(tp, 'utf-8'));
                    parityErrors = lintScriptParity(base, translation);
                }
            }
            return { success: true, base, translation, parityErrors };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });

    // Simpan terjemahan. Renderer mengirim array LENGKAP (clone struktur dasar +
    // override teks) → dijamin sejajar; tetap di-lint sbagai jaring pengaman.
    ipcMain.handle('i18n:save-translation', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName, lang, scriptContent } = payload || {};
            const safeLanguage = _validateI18nLanguage(lang);
            const basePath = _chapterScriptPath(storyTitle, chapterName, null);
            if (!fs.existsSync(basePath)) return { success: false, message: 'script.json dasar tidak ditemukan.' };
            const base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));
            const errors = lintScriptParity(base, scriptContent);
            if (errors.length > 0) {
                return { success: false, message: 'Terjemahan tidak sejajar dengan dasar:\n• ' + errors.join('\n• '), parityErrors: errors };
            }
            const tp = _chapterScriptPath(storyTitle, chapterName, safeLanguage);
            atomicWriteFileSync(tp, JSON.stringify(scriptContent, null, 2), { encoding: 'utf8' });
            console.log(`[NovelCRUD] Terjemahan disimpan: ${chapterName}/script.${safeLanguage}.json`);
            return { success: true, message: `Terjemahan "${safeLanguage}" tersimpan (${scriptContent.length} entri).` };
        } catch (error) {
            return { success: false, message: `Gagal menyimpan terjemahan: ${error.message}` };
        }
    });

    ipcMain.handle('i18n:delete-translation', async (event, payload = {}) => {
        try {
            const { storyTitle, chapterName, lang } = payload || {};
            const safeLanguage = _validateI18nLanguage(lang);
            const tp = _chapterScriptPath(storyTitle, chapterName, safeLanguage);
            if (fs.existsSync(tp)) fs.unlinkSync(tp);
            return { success: true, message: `Terjemahan "${safeLanguage}" dihapus.` };
        } catch (error) {
            return { success: false, message: error.message };
        }
    });
}

// =============================================
// Helper: Migrasi Legacy index.html → novel-meta.json
// =============================================
function migrateFromLegacyIndexHtml(htmlPath, fallbackTitle) {
    const metaData = {
        title: fallbackTitle,
        storyDesc: '',
        description: '',
        genre: '-',
        author: '-',
        illustrator: '-',
        vnMapper: '-',
        cover: '',
        promotionalVideo: '',
        createdAt: new Date().toISOString(),
        migratedFromLegacy: true
    };

    try {
        const content = fs.readFileSync(htmlPath, 'utf-8');

        const titleMatch = content.match(/<title>(.*?)<\/title>/);
        if (titleMatch) metaData.title = titleMatch[1];

        const descMatch = content.match(/<div class="description">([\s\S]*?)<\/div>/);
        if (descMatch) metaData.description = descMatch[1].replace(/<br\s*\/?>/gi, '\n').trim();

        const genreMatch = content.match(/<span class="genre">(.*?)<\/span>/);
        if (genreMatch) metaData.genre = genreMatch[1];

        const authorMatch = content.match(/<span class="author">(.*?)<\/span>/);
        if (authorMatch) metaData.author = authorMatch[1];

        const illustratorMatch = content.match(/<span class="illustrator">(.*?)<\/span>/);
        if (illustratorMatch) metaData.illustrator = illustratorMatch[1];

        const vnMapperMatch = content.match(/<span class="vn-mapper">(.*?)<\/span>/);
        if (vnMapperMatch) metaData.vnMapper = vnMapperMatch[1];

        // Buat storyDesc dari 80 karakter pertama description jika belum ada
        if (!metaData.storyDesc && metaData.description) {
            metaData.storyDesc = metaData.description.substring(0, 80).trim();
        }

        console.log(`[NovelCRUD] Berhasil migrasi metadata dari legacy index.html: ${fallbackTitle}`);
    } catch (e) {
        console.error(`[NovelCRUD] Gagal migrasi legacy index.html:`, e);
    }

    return metaData;
}

// Lint kesejajaran struktur terjemahan (dipakai handler + diuji unit).
/**
 * Nama scene yang dideklarasikan sebuah markup.
 *
 * SATU rumah, dua pemakai: handler `player-code:engine-scenes` (navigator editor)
 * dan validasi scene bawaan preset (§4). Aturan "apa itu scene" tak boleh punya dua
 * versi — begitu menyimpang, preset bisa lolos memakai nama yang sebenarnya bentrok.
 */
function _namaSceneDi(html) {
    // Komentar dibuang dulu: contoh di dalam <!-- --> bukan scene nyata.
    const bersih = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
    const out = [];
    const re = /<[a-z][^>]*\bdata-player-scene\s*=\s*"([^"]+)"[^>]*>/gi;
    let m;
    while ((m = re.exec(bersih)) !== null) {
        const id = m[1];
        if (!id || id === '__dynamic__' || out.some((s) => s.id === id)) continue;
        out.push({ id, mode: /\bdata-scene-mode\s*=\s*"base"/i.test(m[0]) ? 'base' : 'overlay' });
    }
    return out;
}

/**
 * Sidik markup satu scene — garis dasar untuk pemberitahuan DRIFT (#9).
 *
 * Spasi dinormalkan lebih dulu: re-indentasi mengubah berkas tapi tidak mengubah
 * apa pun yang kreator warisi, dan pemberitahuan yang menyala untuk itu akan
 * berhenti dibaca sebelum sempat berguna sekali pun.
 */
function _capSceneEngine(markup) {
    const norm = String(markup || '').replace(/\s+/g, ' ').trim();
    return crypto.createHash('sha1').update(norm, 'utf8').digest('hex').slice(0, 8);
}

/**
 * Baca cap ambil-alih dari komentar di `player.html` kreator → { nama: sidik }.
 *
 * Disimpan di KOMENTAR, bukan JSON pendamping. Alasannya pelajaran N5: kunci
 * kosmetik yang hidup di JSON jadi yatim — tak ada pintunya, tak terlihat saat
 * berkasnya dibuka, dan tetap dipatuhi runtime. Cap di komentar ikut tersalin
 * saat berkasnya disalin, terbaca mata, dan bisa dihapus kreator kalau memang
 * ingin berhenti diberi tahu.
 *
 * Komentar dipotong dulu satu per satu (bukan satu regex besar) supaya pola tak
 * bisa "melompat" melewati `-->` ke komentar berikutnya dan memasangkan nama
 * scene dengan sidik milik scene lain.
 */
function _bacaCapAmbilAlih(html) {
    const out = {};
    const re = /<!--([\s\S]*?)-->/g;
    let m;
    while ((m = re.exec(String(html || ''))) !== null) {
        const isi = m[1];
        const nama = /\bSCENE\s+"([^"]+)"/.exec(isi);
        const sidik = /\bdasar-engine:\s*([0-9a-f]{6,40})\b/i.exec(isi);
        if (nama && sidik) out[nama[1]] = sidik[1].toLowerCase();
    }
    return out;
}

/** Nama scene BAWAAN engine — diturunkan dari berkasnya, bukan daftar tertulis. */
function _namaSceneEngine() {
    const p = path.join(APP_ROOT, 'vn-player', 'player.html');
    if (!fs.existsSync(p)) return [];
    return _namaSceneDi(fs.readFileSync(p, 'utf-8')).map((s) => s.id);
}

/**
 * Baca satu berkas scene bawaan preset. Ketat dengan sengaja: markup yang
 * setengah benar lebih berbahaya daripada yang ditolak, karena ia disisipkan ke
 * berkas kreator dan baru terasa saat dimainkan.
 *
 * @returns {{nama:string, markup:string}|{error:string}}
 */
function _bacaBerkasScene(isi) {
    const bersih = String(isi || '').replace(/<!--[\s\S]*?-->/g, '').trim();
    const mBuka = /<section\b[^>]*\bdata-player-scene\s*=\s*"([^"]+)"[^>]*>/i.exec(bersih);
    if (!mBuka) return { error: 'tak ada <section data-player-scene="...">' };
    if (mBuka.index !== 0) return { error: 'ada isi di luar <section> (scene wajib berdiri sendiri)' };

    let depth = 1;
    const tagRe = /<(\/?)section\b[^>]*>/gi;
    tagRe.lastIndex = mBuka.index + mBuka[0].length;
    let t, akhir = -1;
    while ((t = tagRe.exec(bersih)) !== null) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) { akhir = t.index + t[0].length; break; }
    }
    if (akhir < 0) return { error: '<section> tidak seimbang (penutupnya tak ditemukan)' };
    if (bersih.slice(akhir).trim()) return { error: 'lebih dari satu blok — satu berkas satu scene' };
    return { nama: mBuka[1], markup: bersih.slice(0, akhir) };
}

/**
 * Kumpulkan scene bawaan sebuah folder template (`scenes/*.html`).
 * @returns {{ok:Array<{nama,markup,berkas}>, galat:string[]}}
 */
function _bacaSceneTemplate(dirTemplate) {
    const dir = path.join(dirTemplate, 'scenes');
    const hasil = { ok: [], galat: [] };
    if (!fs.existsSync(dir)) return hasil;
    fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f)).sort().forEach((f) => {
        const r = _bacaBerkasScene(fs.readFileSync(path.join(dir, f), 'utf-8'));
        if (r.error) { hasil.galat.push(f + ': ' + r.error); return; }
        if (hasil.ok.some((s) => s.nama === r.nama)) {
            hasil.galat.push(f + ': scene "' + r.nama + '" sudah dibawa berkas lain');
            return;
        }
        hasil.ok.push({ nama: r.nama, markup: r.markup, berkas: f });
    });
    return hasil;
}

const _VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img',
    'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Semua elemen ber-peran beserta RENTANG indeksnya — dari situ hubungan
 * induk/keturunan diturunkan lewat pembendungan rentang, bukan ditebak.
 * @param {string} html sudah tanpa komentar
 */
function _petaElemenPeran(html) {
    const out = [];
    const re = /<([a-z][\w-]*)\b([^>]*?\bdata-player-role\s*=\s*"([^"]+)"[^>]*?)>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const start = m.index;
        let end;
        if (_VOID_TAGS.has(tag) || /\/\s*>$/.test(m[0])) {
            end = start + m[0].length;
        } else {
            const tRe = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
            tRe.lastIndex = start + m[0].length;
            let depth = 1, t, closeEnd = -1;
            while ((t = tRe.exec(html)) !== null) {
                if (!t[1] && /\/\s*>$/.test(t[0])) continue;   // self-closing bukan pembuka
                depth += t[1] ? -1 : 1;
                if (depth === 0) { closeEnd = t.index + t[0].length; break; }
            }
            // Markup tak seimbang → LEWATI, jangan menebak batasnya. Menyalin
            // separuh elemen lebih buruk daripada menolak.
            if (closeEnd < 0) continue;
            end = closeEnd;
        }
        out.push({ role: m[3], tag, start, end, markup: html.slice(start, end) });
    }
    return out;
}

/** Peran + induk & keturunannya di markup engine. null bila perannya tak ada. */
function _peranEngine(role) {
    const html = fs.readFileSync(path.join(APP_ROOT, 'vn-player', 'player.html'), 'utf-8')
        .replace(/<!--[\s\S]*?-->/g, '');
    const semua = _petaElemenPeran(html);
    const diri = semua.find((e) => e.role === role);
    if (!diri) return null;
    return {
        markup: diri.markup,
        // Induk = rentangnya membendung rentang kita (dan bukan kita sendiri).
        induk: semua.filter((e) => e !== diri && e.start < diri.start && e.end > diri.end)
            .map((e) => e.role),
        // Keturunan = sebaliknya. Inilah "utang" yang berpindah ke kreator.
        keturunan: semua.filter((e) => e !== diri && e.start > diri.start && e.end <= diri.end)
            .map((e) => e.role),
    };
}

function lintScriptParity(base, trans) {
    const errors = [];
    if (!Array.isArray(trans)) { errors.push('File terjemahan bukan array JSON.'); return errors; }
    if (!Array.isArray(base)) { errors.push('Script dasar bukan array JSON.'); return errors; }
    if (base.length !== trans.length) {
        errors.push(`Jumlah entri beda: dasar ${base.length}, terjemahan ${trans.length}.`);
    }
    const n = Math.min(base.length, trans.length);
    for (let i = 0; i < n; i++) {
        const b = base[i] || {}, t = trans[i] || {};
        if (b.type !== t.type) {
            errors.push(`Entri #${i}: tipe beda (dasar "${b.type}", terjemahan "${t.type}").`);
        }
        if (Array.isArray(b.choices)) {
            const bl = b.choices.length;
            const tl = Array.isArray(t.choices) ? t.choices.length : 0;
            if (bl !== tl) errors.push(`Entri #${i}: jumlah opsi choice beda (dasar ${bl}, terjemahan ${tl}).`);
        }
    }
    return errors;
}

module.exports = { registerHandlers, scaffoldChapterPlayer, buildStarterScript, lintScriptParity,
    _petaElemenPeran, _peranEngine, _namaSceneDi, _namaSceneEngine, _bacaBerkasScene, _bacaSceneTemplate,
    _capSceneEngine, _bacaCapAmbilAlih };
