//-------------------------------------
// main.js (Aplikasi Utama)
//-------------------------------------
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const musicDirectory = path.join(__dirname, 'aset', 'music');
const wallpaperDirectory = path.join(__dirname, 'aset', 'wallpaper');
// Ganti di sini kalau folder visual_novels-mu ternyata ada di: aset/game/visual_novels
// const visualNovelsDirectory = path.join(__dirname, 'visual_novels');
const visualNovelsDirectory = path.join(__dirname, 'aset', 'game', 'visual_novels');

let mainWindow, popupWindow;

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
    // Buat popup window
    popupWindow = new BrowserWindow({
        width: 800,
        height: 455,
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
        popupWindow.webContents.send('populate-dropdowns', { playlists, wallpapers });
    });

    // Listener untuk minimize, maximize, close
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
    
    // === 3. Ketika popup di-close dan kita buka main window ===
    ipcMain.on('open-main-window', (event, data) => {
        // Tutup popup
        if (popupWindow) popupWindow.close();
    
        let skipScene = false;
        let selectedPlaylist = '';
        let selectedWallpaper = '';
    
        // Data bisa object atau boolean
        if (typeof data === 'object' && data !== null) {
            skipScene = data.skipScene || false;
            selectedPlaylist = data.selectedPlaylist || '';
            selectedWallpaper = data.selectedWallpaper || '';
        } else if (typeof data === 'boolean') {
            skipScene = data;
        }
    
        // Buat mainWindow
        mainWindow = new BrowserWindow({
            width: 1600,
            height: 900,
            icon: path.join(__dirname, 'aset', 'ikon.jpg'),
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });
    
        mainWindow.loadFile('index.html');
        mainWindow.setMenu(null);
    
        // === 3a. Bangun array lagu ===
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
                        const songData = {
                            title: baseName,
                            src: path.join('aset', 'music', selectedPlaylist, file)
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
                files.forEach(file => {
                    if (file.endsWith('.mp4')) {
                        let baseName = path.parse(file).name;
                        let isDefaultVideo = false;
                        if (baseName.startsWith('!')) {
                            isDefaultVideo = true;
                            baseName = baseName.substring(1);
                        }
                        const videoData = {
                            name: baseName,
                            src: path.join('aset', 'wallpaper', selectedWallpaper, file)
                        };
                        wallpapersArray.push(videoData);
                        if (isDefaultVideo) {
                            defaultTitleVideo = videoData;
                        }
                    }
                });
            }
        }
    
        // Setelah index.html kelar load, kirim data scene
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('configure-scene', {
                skipScene,
                songs: songsArray,
                wallpapers: wallpapersArray,
                defaultSong: defaultSong,
                defaultTitleVideo: defaultTitleVideo,
            });
        });
    });
});

// === 4. Kapanpun window all closed (kecuali Mac)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        app.emit('ready');
    }
});

// ---------------------------------------
// Bagian ini “menggantikan” main.js aplikasi kedua
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
        // Pastikan jalur ke vnManager.html sesuai penempatan di folder aset/game
        const vnPath = path.join(__dirname, 'aset', 'game', 'vnManager.html');
        mainWindow.loadFile(vnPath);
    }
});

// 3) Handler untuk mengambil daftar story (visual novels)
ipcMain.handle('get-story-list', async () => {
    const stories = [];
    try {
        const folders = fs.readdirSync(visualNovelsDirectory);
        folders.forEach((folder) => {
            const folderPath = path.join(visualNovelsDirectory, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                const mainIndexPath = path.join(folderPath, 'index.html');
                if (fs.existsSync(mainIndexPath)) {
                    stories.push({
                        title: folder,
                        playPath: `./visual_novels/${encodeURIComponent(folder)}/index.html`,
                    });
                }
            }
        });
    } catch (err) {
        console.error('Error reading stories:', err);
    }
    return stories;
});

// 4) Handler untuk mengambil daftar chapter di satu story
ipcMain.handle('get-chapter-list', async (event, storyTitle) => {
    const decodedTitle = decodeURIComponent(storyTitle);
    const storyPath = path.join(visualNovelsDirectory, decodedTitle);
    const chapters = [];
    try {
        const folders = fs.readdirSync(storyPath);
        folders.forEach((folder) => {
            const folderPath = path.join(storyPath, folder);
            if (fs.statSync(folderPath).isDirectory()) {
                const indexPath = path.join(folderPath, 'index.html');
                if (fs.existsSync(indexPath)) {
                    chapters.push(folder);
                }
            }
        });
    } catch (err) {
        console.error('Error reading chapters:', err);
    }
    return chapters;
});

// Tombol Quit
ipcMain.on('quit-application', () => {
    app.quit();
});