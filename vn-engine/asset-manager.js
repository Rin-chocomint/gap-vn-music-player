// =============================================
// Asset Manager — File operations untuk novel assets
// Dipindahkan dari main.js untuk modularisasi
// =============================================

const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');
const { validatePathComponent, resolvePathWithinRoot } = require('./path-utils');
const { atomicWriteFileSync } = require('./atomic-writer');

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
const AUDIO_EXTS = ['.mp3', '.ogg', '.wav', '.m4a'];
// Selaras dengan renderer sprite video dan Media Overlay. Dukungan codec tetap
// mengikuti Chromium, tetapi ekstensi kontainer ini boleh diimpor/disalin lewat
// editor Story tanpa harus mengetik nama berkas secara manual.
const VIDEO_EXTS = ['.mp4', '.webm', '.ogv', '.mov', '.m4v'];

/**
 * Registrasi IPC handlers untuk asset management
 * @param {object} deps
 * @param {object} deps.ipcMain - Electron ipcMain
 * @param {string} deps.visualNovelsDirectory - Path ke visual_novels
 * @param {function} deps.getMainWindow - Getter mainWindow
 */
function registerHandlers(deps) {
    const { ipcMain, visualNovelsDirectory, getMainWindow } = deps;

    function resolveNovelPath(novelTitle) {
        return resolvePathWithinRoot(
            visualNovelsDirectory,
            validatePathComponent(novelTitle, 'Nama novel')
        );
    }

    function chapterPathComponents(chapterName) {
        if (typeof chapterName !== 'string' || !chapterName) return [];
        const parts = chapterName.replace(/\\/g, '/').split('/');
        const isMainChapter = parts.length === 1;
        const isSideStory = parts.length === 2 && parts[0].toLowerCase() === 'sidestories';
        if (!isMainChapter && !isSideStory) {
            const error = new Error('Nama chapter tidak valid.');
            error.code = 'INVALID_CHAPTER_PATH';
            throw error;
        }
        return parts.map((part) => validatePathComponent(part, 'Nama chapter'));
    }

    function resolveAssetDirectory(novelTitle, chapterName) {
        const novelPath = resolveNovelPath(novelTitle);
        if (chapterName === undefined || chapterName === null || chapterName === '') return novelPath;
        return resolvePathWithinRoot(novelPath, ...chapterPathComponents(chapterName));
    }

    function validateAssetFilename(fileName) {
        const safeName = validatePathComponent(fileName, 'Nama file aset');
        const supported = IMAGE_EXTS.concat(AUDIO_EXTS, VIDEO_EXTS);
        if (!supported.includes(path.extname(safeName).toLowerCase())) {
            const error = new Error('Format aset tidak didukung.');
            error.code = 'UNSUPPORTED_ASSET_TYPE';
            throw error;
        }
        return safeName;
    }

    // Path aset boleh bersarang (mis. SideStories/Bonus/audio.ogg), tetapi tiap
    // segmen harus satu komponen canonical dan ujungnya wajib format media.
    function resolveAssetPath(novelTitle, relativePath) {
        if (typeof relativePath !== 'string') throw new Error('Path aset tidak valid.');
        const normalized = relativePath.replace(/\\/g, '/');
        const parts = normalized.split('/');
        if (parts.length < 1 || parts.length > 16 || parts.some(part => !part)) {
            const error = new Error('Path aset tidak valid.');
            error.code = 'INVALID_ASSET_PATH';
            throw error;
        }
        const safeParts = parts.map((part, index) => index === parts.length - 1
            ? validateAssetFilename(part)
            : validatePathComponent(part, 'Folder aset'));
        return resolvePathWithinRoot(resolveNovelPath(novelTitle), ...safeParts);
    }

    // ---- Aset global novel (root folder) ----
    ipcMain.handle('get-global-novel-assets', async (event, novelTitle) => {
        const assets = { images: [], audios: [], videos: [] };

        try {
            const novelPath = resolveNovelPath(novelTitle);
            if (!fs.existsSync(novelPath)) return assets;

            const files = fs.readdirSync(novelPath, { withFileTypes: true });
            for (const file of files) {
                if (file.isDirectory()) continue;

                const ext = path.extname(file.name).toLowerCase();
                const fullPath = `file://${path.join(novelPath, file.name).replace(/\\/g, '/')}`;

                if (IMAGE_EXTS.includes(ext)) {
                    assets.images.push({ fileName: file.name, relativePath: file.name, fullPath });
                } else if (AUDIO_EXTS.includes(ext)) {
                    assets.audios.push({ fileName: file.name, relativePath: file.name, fullPath });
                } else if (VIDEO_EXTS.includes(ext)) {
                    assets.videos.push({ fileName: file.name, relativePath: file.name, fullPath });
                }
            }
        } catch (error) {
            console.error(`[AssetManager] Gagal memindai aset global untuk ${novelTitle}:`, error);
        }
        return assets;
    });

    // ---- Aset per-chapter ----
    ipcMain.handle('get-chapter-assets', async (event, { novelTitle, chapterName }) => {
        console.log(`[AssetManager] get-chapter-assets: Novel: ${novelTitle}, Chapter: ${chapterName}`);
        if (!novelTitle || !chapterName) {
            console.log(`[AssetManager] Aborted get-chapter-assets: novelTitle atau chapterName kosong.`);
            return { images: [], audios: [], videos: [] };
        }
        const assets = { images: [], audios: [], videos: [] };

        try {
            const chapterPath = resolveAssetDirectory(novelTitle, chapterName);
            console.log(`[AssetManager] Membaca direktori chapter dari path: ${chapterPath}`);
            if (!fs.existsSync(chapterPath)) {
                console.log(`[AssetManager] Direktori chapter tidak ditemukan!`);
                return assets;
            }

            const files = fs.readdirSync(chapterPath);
            console.log(`[AssetManager] Ditemukan ${files.length} file(s) di direktori chapter.`);
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const relativePath = `${chapterName}/${file}`;
                const fullPath = `file://${path.join(chapterPath, file).replace(/\\/g, '/')}`;

                if (IMAGE_EXTS.includes(ext)) {
                    assets.images.push({ fileName: file, relativePath, fullPath });
                } else if (AUDIO_EXTS.includes(ext)) {
                    assets.audios.push({ fileName: file, relativePath, fullPath });
                } else if (VIDEO_EXTS.includes(ext)) {
                    assets.videos.push({ fileName: file, relativePath, fullPath });
                }
            }
        } catch (error) {
            console.error(`[AssetManager] Gagal memindai aset untuk chapter ${chapterName}:`, error);
        }
        console.log(`[AssetManager] Selesai! ${assets.images.length} gambar, ${assets.audios.length} audio, ${assets.videos.length} video.`);
        return assets;
    });

    // ---- Semua aset novel (global + semua chapter) ----
    ipcMain.handle('get-all-novel-assets', async (event, novelTitle) => {
        const results = [];

        try {
            const novelPath = resolveNovelPath(novelTitle);
            if (!fs.existsSync(novelPath)) return results;

            const scanDir = (dirPath, chapterName) => {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) continue;
                    const ext = path.extname(entry.name).toLowerCase();
                    const relPath = chapterName ? `${chapterName}/${entry.name}` : entry.name;
                    const full = `file://${path.join(dirPath, entry.name).replace(/\\/g, '/')}`;
                    let type = null;
                    if (IMAGE_EXTS.includes(ext)) type = 'image';
                    else if (AUDIO_EXTS.includes(ext)) type = 'audio';
                    else if (VIDEO_EXTS.includes(ext)) type = 'video';
                    if (type) {
                        const stat = fs.statSync(path.join(dirPath, entry.name));
                        results.push({
                            fileName: entry.name,
                            relativePath: relPath,
                            fullPath: full,
                            type,
                            chapter: chapterName || null,
                            size: stat.size
                        });
                    }
                }
            };

            scanDir(novelPath, null);

            const rootEntries = fs.readdirSync(novelPath, { withFileTypes: true });
            for (const entry of rootEntries) {
                if (entry.isDirectory() && entry.name !== 'node_modules') {
                    scanDir(path.join(novelPath, entry.name), entry.name);
                }
            }
        } catch (error) {
            console.error(`[AssetManager] Gagal memindai semua aset untuk ${novelTitle}:`, error);
        }
        return results;
    });

    // ---- Dialog pilih file + salin ke chapter ----
    ipcMain.handle('open-file-dialog', async (event, { fileType, storyTitle, chapterName }) => {
        let filters = [];
        if (fileType === 'image') {
            filters = [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }];
        } else if (fileType === 'audio') {
            filters = [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a'] }];
        } else if (fileType === 'video') {
            filters = [{ name: 'Video', extensions: ['mp4', 'webm', 'ogv', 'mov', 'm4v'] }];
        } else if (fileType === 'all-media') {
            filters = [{ name: 'Media (Gambar & Video)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'ogv', 'mov', 'm4v'] }];
        }

        try {
            const { canceled, filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: filters
            });

            if (canceled || filePaths.length === 0) {
                return null;
            }

            const sourcePath = filePaths[0];
            const filename = validateAssetFilename(path.basename(sourcePath));
            const destDir = resolveAssetDirectory(storyTitle, chapterName);
            const destPath = resolvePathWithinRoot(destDir, filename);

            fs.mkdirSync(destDir, { recursive: true });
            atomicWriteFileSync(destPath, fs.readFileSync(sourcePath));
            console.log(`[AssetManager] Aset disalin: ${filename} -> ${destDir}`);

            return filename;
        } catch (error) {
            console.error('[AssetManager] Gagal menyalin aset:', error);
            dialog.showErrorBox('Error Menyalin Aset', `Terjadi kesalahan saat mencoba menyalin file. Pastikan Anda memiliki izin yang cukup.\n\nError: ${error.message}`);
            return null;
        }
    });

    // ---- Buka dan baca file (generic) ----
    ipcMain.handle('open-and-read-file', async (event, { filters }) => {
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: filters
            });
            if (canceled || filePaths.length === 0) return null;

            const filePath = filePaths[0];
            const buffer = fs.readFileSync(filePath);
            return { name: path.basename(filePath), buffer: buffer };
        } catch (error) {
            console.error('[AssetManager] Gagal membuka atau membaca file:', error);
            return null;
        }
    });

    // ---- Ganti file aset (replace) ----
    ipcMain.handle('replace-asset-file', async (event, { novelTitle, relativePath, buffer }) => {
        try {
            const assetPath = resolveAssetPath(novelTitle, relativePath);

            if (!fs.existsSync(path.dirname(assetPath))) {
                return { success: false, message: 'Direktori aset tidak ditemukan.' };
            }

            atomicWriteFileSync(assetPath, Buffer.from(buffer));
            console.log(`[AssetManager] Aset berhasil diganti: ${assetPath}`);
            return { success: true, message: `Aset ${path.basename(assetPath)} berhasil diperbarui!` };
        } catch (error) {
            console.error(`[AssetManager] Gagal mengganti aset: ${error}`);
            return { success: false, message: `Gagal memperbarui aset: ${error.message}` };
        }
    });

    // ---- Tambah file aset baru ----
    ipcMain.handle('add-asset-file', async (event, { novelTitle, chapterName, file }) => {
        try {
            const destDir = resolveAssetDirectory(novelTitle, chapterName);
            if (!fs.existsSync(destDir)) {
                return { success: false, message: 'Direktori target aset tidak ditemukan.' };
            }

            let newFileName;
            const extension = path.extname(validateAssetFilename(file.name));
            const allAssetExts = IMAGE_EXTS.concat(AUDIO_EXTS, VIDEO_EXTS);
            if (!allAssetExts.includes(extension.toLowerCase())) {
                return { success: false, message: 'Format aset tidak didukung.' };
            }

            if (chapterName === '' && ['.mp4', '.webm', '.ogv'].includes(extension.toLowerCase())) {
                // Video promosi di root novel punya nama canonical `video.<ext>`.
                // Ekstensinya IKUT berkas asli — menulis semuanya sebagai .mp4 (perilaku
                // lama) membuat WebM/OGV berbohong soal isinya dan gagal diputar.
                newFileName = 'video' + extension.toLowerCase();
            } else {
                newFileName = `asset_${Date.now()}${extension}`;
            }

            const destPath = resolvePathWithinRoot(destDir, newFileName);
            atomicWriteFileSync(destPath, Buffer.from(file.buffer));

            // Gambar root novel TIDAK lagi dicatat ke novel-meta.json: field
            // `images` (Media Showcase) dibuang 2026-07-21. Aset tetap terbaca
            // lewat pemindaian folder (scanAssets), jadi tidak ada yang hilang —
            // yang hilang cuma pencemaran meta oleh tiap upload.
            if (chapterName === '' && IMAGE_EXTS.includes(extension.toLowerCase())) {
                const mainWindow = getMainWindow();
                if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle });
            }
            console.log(`[AssetManager] Aset berhasil ditambahkan/diperbarui: ${newFileName}`);
            return { success: true, message: 'Aset berhasil ditambahkan!' };
        } catch (error) {
            console.error('[AssetManager] Gagal menambah aset:', error);
            return { success: false, message: `Gagal menambah aset: ${error.message}` };
        }
    });

    // ---- Hapus file aset ----
    ipcMain.handle('delete-asset-file', async (event, { novelTitle, relativePath }) => {
        try {
            const assetPath = resolveAssetPath(novelTitle, relativePath);

            if (fs.existsSync(assetPath)) {
                const deletedFileExt = path.extname(relativePath).toLowerCase();
                const isGlobalAsset = path.dirname(relativePath) === '.';

                fs.unlinkSync(assetPath);

                // novel-meta.json tak lagi menyimpan daftar gambar (field `images`
                // dibuang 2026-07-21), jadi penghapusan cukup menyegarkan preview hub.
                if (isGlobalAsset && IMAGE_EXTS.includes(deletedFileExt)) {
                    const mainWindow = getMainWindow();
                    if (mainWindow) mainWindow.webContents.send('hub-html-updated', { novelTitle });
                }

                console.log(`[AssetManager] Aset berhasil dihapus: ${assetPath}`);
                return { success: true, message: 'Aset berhasil dihapus.' };
            }
            return { success: false, message: 'File tidak ditemukan.' };
        } catch (error) {
            console.error('[AssetManager] Gagal menghapus aset:', error);
            return { success: false, message: `Gagal menghapus aset: ${error.message}` };
        }
    });
}

module.exports = { registerHandlers };
