// =============================================
// Novel Font — font global satu novel
// =============================================
//
// APA YANG DIPUTUSKAN DI SINI, DAN KENAPA
// ---------------------------------------
// Pilihan font kreator TIDAK disimpan sebagai kunci JSON. Aturan N5 sudah
// menetapkan bahwa kosmetik hidup di BERKAS milik kreator, bukan di
// `hub-config.json` — dan pelajaran N5 justru lahir dari tiga kunci kosmetik
// yang jadi yatim karena pintunya dicabut. Font karena itu dimaterialisasi
// jadi CSS.
//
// TAPI ia TIDAK boleh menumpang di `theme.css` maupun `hub.css`:
//
//   - `hub.css` DITIMPA SEUTUHNYA tiap kali kreator menerapkan template Hub
//     (hub-scaffolder.applyFolderTemplate). Font yang tinggal di sana akan
//     mati diam-diam tiap ganti template, dan kreator akan menyalahkan
//     template — bukan tempat penyimpanannya.
//   - `theme.css` milik kreator dan berisi selektor PLAYER (`[data-player-role]`,
//     `#dialogue-box`, …). Menautkannya ke Hub demi satu variabel berarti
//     seluruh CSS player ikut masuk ke Hub, dan itu bisa mengubah tampilan
//     Hub novel yang sudah ada tanpa satu pun kreator memintanya.
//
// Jadi ia berkas TERSENDIRI: `<novel>/novel-font.css`, dimuat oleh KEDUA
// permukaan, dan tak pernah disentuh penerapan/undo template.
//
// KONTRAK VARIABEL
// ----------------
//   --vn-novel-font   dideklarasikan di sini; dibaca hub.css tiap template
//                     sebagai `var(--vn-novel-font, <bawaan template>)`.
//   --vn-font-family  variabel engine Player yang sudah ada; di-alias ke
//                     --vn-novel-font supaya Player ikut tanpa perubahan CSS.
//
// Novel tanpa berkas ini = tidak memilih font. `var()` di template jatuh ke
// nilai bawaannya sendiri, jadi nol perubahan bagi novel lama.
//
// URUTAN CASCADE (Player): variables.css → css/*.css → themes/default →
//   themes/<tema> → **novel-font.css** → <novel>/theme.css → <chapter>/theme.css
// Font sengaja di DEPAN theme.css kreator: kalau kreator menulis font sendiri
// di theme.css, dialah yang menang. Pilihan dropdown tidak boleh mengalahkan
// tulisan tangan.

const fs = require('fs');
const path = require('path');
const { atomicWriteFileSync } = require('./atomic-writer');
const { validatePathComponent, resolvePathWithinRoot } = require('./path-utils');
const hubScaffolder = require('./hub-scaffolder');

const APP_ROOT = path.dirname(__dirname);
const FONTS_DIR = path.join(APP_ROOT, 'aset', 'fonts');
const FONTS_MANIFEST = path.join(FONTS_DIR, 'fonts.json');

const CSS_FILENAME = 'novel-font.css';
const CUSTOM_DIRNAME = 'fonts';

// Ekstensi font yang boleh masuk. Format lain (.eot/.svg) sengaja tidak ada:
// Chromium modern tidak memerlukannya dan menerimanya cuma memperluas
// permukaan berkas asing yang kita salin ke folder novel.
const FONT_EXTS = ['.woff2', '.woff', '.ttf', '.otf'];

// Baris pertama berkas: pilihan aktif dalam bentuk yang bisa dibaca balik.
// Mem-parse deklarasi CSS untuk menebak "font mana yang dipilih" itu rapuh;
// satu baris JSON menjawabnya persis. Berkasnya tetap satu-satunya sumber
// kebenaran — tidak ada salinan di JSON mana pun.
const PENANDA = '/* vn-novel-font:';

function _bacaManifest() {
    try {
        const raw = JSON.parse(fs.readFileSync(FONTS_MANIFEST, 'utf-8'));
        return {
            bundled: Array.isArray(raw.bundled) ? raw.bundled : [],
            stacks: Array.isArray(raw.stacks) ? raw.stacks : []
        };
    } catch (e) {
        console.warn('[NovelFont] fonts.json tidak terbaca:', e.message);
        return { bundled: [], stacks: [] };
    }
}

/** Font bawaan aplikasi yang benar-benar ada berkasnya di disk. */
function daftarBundled() {
    return _bacaManifest().bundled
        .map(function (f) {
            const faces = (f.faces || []).filter(function (face) {
                return face && face.file && fs.existsSync(path.join(FONTS_DIR, face.file));
            });
            return Object.assign({}, f, { faces: faces, sumber: 'bundel' });
        })
        // Entri yang berkasnya hilang TIDAK ditampilkan. Menawarkan font yang
        // tak bisa dimuat adalah kontrol palsu — pemain akan melihat fallback
        // dan kreator tak akan pernah tahu kenapa.
        .filter(function (f) { return f.faces.length > 0; });
}

/** Tumpukan font sistem (nol berkas). */
function daftarStacks() {
    return _bacaManifest().stacks
        .filter(function (f) { return f && f.id && f.stack; })
        .map(function (f) { return Object.assign({}, f, { sumber: 'sistem' }); });
}

/** Berkas font milik kreator di `<novel>/fonts/`. */
function daftarKreator(novelPath) {
    const dir = path.join(novelPath, CUSTOM_DIRNAME);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(function (e) {
            return e.isFile() && FONT_EXTS.indexOf(path.extname(e.name).toLowerCase()) >= 0;
        })
        .map(function (e) {
            const nama = path.basename(e.name, path.extname(e.name));
            return {
                id: e.name,
                label: nama,
                catatan: 'Berkas milikmu di folder ' + CUSTOM_DIRNAME + '/',
                stack: "'" + nama.replace(/'/g, '') + "', sans-serif",
                file: e.name,
                sumber: 'kreator'
            };
        })
        .sort(function (a, b) { return a.label.localeCompare(b.label); });
}

function _formatDari(file) {
    switch (path.extname(String(file)).toLowerCase()) {
        case '.woff2': return 'woff2';
        case '.woff': return 'woff';
        case '.ttf': return 'truetype';
        case '.otf': return 'opentype';
        default: return null;
    }
}

// `url()` dirakit lewat JSON.stringify, bukan disambung tangan: nama berkas
// ber-apostrof meruntuhkan seluruh deklarasi TANPA galat apa pun di Chromium.
// Ini bug yang sudah pernah dibayar sekali di jalur background scene.
function _url(rel) {
    return 'url(' + JSON.stringify(rel) + ')';
}

/**
 * Rakit isi `novel-font.css` untuk satu pilihan.
 * @param {{sumber:string,id:string,label:string,stack:string,faces?:Array,file?:string}} pilihan
 * @returns {string}
 */
function buildFontCss(pilihan) {
    const baris = [];
    baris.push(PENANDA + ' ' + JSON.stringify({ sumber: pilihan.sumber, id: pilihan.id }) + ' */');
    baris.push('/* ===================================================================');
    baris.push('   FONT GLOBAL NOVEL — dibuat otomatis dari Profil Novel > Tampilan.');
    baris.push('');
    baris.push('   Berkas ini SENGAJA terpisah dari hub.css dan theme.css:');
    baris.push('     - hub.css ditimpa seutuhnya tiap kali template Hub diterapkan;');
    baris.push('     - theme.css berisi CSS Player milikmu dan tak boleh bocor ke Hub.');
    baris.push('   Menerapkan atau meng-undo template Hub TIDAK menyentuh berkas ini.');
    baris.push('');
    baris.push('   Mau font yang berbeda per-elemen? Jangan sunting di sini (akan');
    baris.push('   ditimpa saat kamu mengganti pilihan). Tulis di theme.css untuk');
    baris.push('   Player, atau hub.css untuk Hub — keduanya dimuat SESUDAH berkas ini,');
    baris.push('   jadi tulisan tanganmu selalu menang.');
    baris.push('   =================================================================== */');
    baris.push('');

    const faces = [];
    if (pilihan.sumber === 'bundel') {
        (pilihan.faces || []).forEach(function (face) {
            const format = _formatDari(face.file);
            if (!format) return;
            // Relatif dari folder novel ke aset/fonts/ — sama untuk Hub (link di
            // hub.html) maupun Player (link ber-href absolut ke berkas ini).
            faces.push({
                family: pilihan.label,
                src: _url('../../../fonts/' + face.file) + " format('" + format + "')",
                weight: face.weight || 400,
                style: face.style || 'normal'
            });
        });
    } else if (pilihan.sumber === 'kreator') {
        const format = _formatDari(pilihan.file);
        if (format) {
            faces.push({
                family: pilihan.label,
                src: _url(CUSTOM_DIRNAME + '/' + pilihan.file) + " format('" + format + "')",
                weight: 400,
                style: 'normal'
            });
        }
    }

    faces.forEach(function (f) {
        baris.push('@font-face {');
        baris.push("    font-family: '" + String(f.family).replace(/'/g, '') + "';");
        baris.push('    font-style: ' + f.style + ';');
        baris.push('    font-weight: ' + f.weight + ';');
        baris.push('    font-display: swap;');
        baris.push('    src: ' + f.src + ';');
        baris.push('}');
        baris.push('');
    });

    baris.push(':root {');
    baris.push('    /* Dibaca hub.css tiap template sebagai var(--vn-novel-font, <bawaan>). */');
    baris.push('    --vn-novel-font: ' + pilihan.stack + ';');
    baris.push('    /* Variabel Player yang sudah ada — di-alias agar Player ikut. */');
    baris.push('    --vn-font-family: var(--vn-novel-font);');
    baris.push('}');
    baris.push('');
    return baris.join('\n');
}

/** Path berkas CSS font sebuah novel. */
function cssPath(novelPath) {
    return path.join(novelPath, CSS_FILENAME);
}

/**
 * Pilihan yang sedang aktif untuk sebuah novel, atau null bila tak ada.
 * @returns {null|{sumber:string,id:string}}
 */
function readSelection(novelPath) {
    const p = cssPath(novelPath);
    if (!fs.existsSync(p)) return null;
    try {
        const baris = fs.readFileSync(p, 'utf-8').split('\n')[0] || '';
        if (baris.indexOf(PENANDA) !== 0) return null;
        const json = baris.slice(PENANDA.length).replace(/\*\/\s*$/, '').trim();
        const parsed = JSON.parse(json);
        if (!parsed || !parsed.sumber || !parsed.id) return null;
        return { sumber: parsed.sumber, id: parsed.id };
    } catch (e) {
        // Berkas disunting tangan sampai penanda hilang: perlakukan sebagai
        // "kreator mengambil alih". Jangan menebak, dan jangan menimpanya.
        return null;
    }
}

/** Gabungan semua pilihan yang tersedia untuk satu novel. */
function listOptions(novelPath) {
    return daftarBundled().concat(daftarStacks(), novelPath ? daftarKreator(novelPath) : []);
}

/** Cari satu opsi berdasarkan sumber+id. */
function findOption(novelPath, sumber, id) {
    return listOptions(novelPath).filter(function (o) {
        return o.sumber === sumber && o.id === id;
    })[0] || null;
}

/**
 * `hub.html` menautkan `novel-font.css`, tapi berkas itu hanya ditulis ulang
 * saat hub dikomposit. Novel yang hub-nya sudah ada di disk sebelum fitur ini
 * karena itu TIDAK punya tautannya, dan fontnya cuma akan tampil di Player —
 * gejala paling membingungkan yang bisa dibuat fitur ini ("kenapa Player ikut
 * tapi Hub tidak?"). Jadi mengganti font ikut mengomposit ulang hub.
 *
 * Hanya untuk hub CODE-FIRST (punya folder partial). Di sana partial memang
 * sumber kebenaran dan `hub.html` memang berkas turunan — sama seperti yang
 * sudah dilakukan Save Hub. Hub legacy (`index.html`) tidak disentuh sama
 * sekali; fontnya tidak berlaku di sana, dan itu dilaporkan apa adanya.
 *
 * @returns {boolean} true bila hub benar-benar dikomposit ulang
 */
function _recomposeHub(novelPath) {
    try {
        if (!hubScaffolder.partialsDirExists(novelPath)) return false;
        const cfgPath = path.join(novelPath, 'hub-config.json');
        if (!fs.existsSync(cfgPath)) return false;
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        if (!Array.isArray(cfg.scenes) || !cfg.scenes.length) return false;
        hubScaffolder.composeHub(novelPath, cfg.scenes, {
            title: cfg.title || path.basename(novelPath)
        });
        return true;
    } catch (e) {
        console.warn('[NovelFont] Hub tidak bisa dikomposit ulang:', e.message);
        return false;
    }
}

/**
 * Terapkan pilihan font ke novel (tulis berkas), atau cabut bila `pilihan` null.
 * @returns {{success:boolean, message:string, active:null|{sumber,id}, hubDiperbarui:boolean}}
 */
function applySelection(novelPath, sumber, id) {
    const p = cssPath(novelPath);

    if (!sumber || !id) {
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
        return {
            success: true,
            message: 'Font global dikembalikan ke bawaan.',
            active: null,
            hubDiperbarui: _recomposeHub(novelPath)
        };
    }

    const opsi = findOption(novelPath, sumber, id);
    if (!opsi) {
        return {
            success: false,
            message: 'Font tersebut tidak ditemukan lagi.',
            active: readSelection(novelPath),
            hubDiperbarui: false
        };
    }

    atomicWriteFileSync(p, buildFontCss(opsi), { encoding: 'utf8' });
    return {
        success: true,
        message: 'Font global novel disimpan.',
        active: { sumber: sumber, id: id },
        hubDiperbarui: _recomposeHub(novelPath)
    };
}

// =============================================
// IPC
// =============================================
function registerHandlers(deps) {
    const { ipcMain, visualNovelsDirectory, getMainWindow, dialog } = deps;

    function novelDir(novelTitle) {
        return resolvePathWithinRoot(
            visualNovelsDirectory,
            validatePathComponent(novelTitle, 'Nama novel')
        );
    }

    ipcMain.handle('novel-font:list', async (event, { novelTitle } = {}) => {
        try {
            const dir = novelDir(novelTitle);
            return { success: true, options: listOptions(dir), active: readSelection(dir) };
        } catch (error) {
            return { success: false, message: error.message, options: [], active: null };
        }
    });

    ipcMain.handle('novel-font:set', async (event, { novelTitle, sumber, id } = {}) => {
        try {
            const dir = novelDir(novelTitle);
            const hasil = applySelection(dir, sumber, id);
            // Hub perlu dirender ulang agar preview memperlihatkan fontnya.
            const win = getMainWindow && getMainWindow();
            if (hasil.success && win) win.webContents.send('hub-html-updated', { novelTitle });
            return hasil;
        } catch (error) {
            return { success: false, message: `Gagal menyimpan font: ${error.message}`, active: null };
        }
    });

    // Salin satu berkas font pilihan kreator ke `<novel>/fonts/`.
    ipcMain.handle('novel-font:add-file', async (event, { novelTitle } = {}) => {
        try {
            const dir = novelDir(novelTitle);
            const { canceled, filePaths } = await dialog.showOpenDialog({
                properties: ['openFile'],
                filters: [{ name: 'Font', extensions: FONT_EXTS.map(function (e) { return e.slice(1); }) }]
            });
            if (canceled || !filePaths.length) return { success: false, canceled: true };

            const sumberPath = filePaths[0];
            const nama = validatePathComponent(path.basename(sumberPath), 'Nama berkas font');
            if (FONT_EXTS.indexOf(path.extname(nama).toLowerCase()) < 0) {
                return { success: false, message: 'Format font tidak didukung.' };
            }

            const tujuanDir = path.join(dir, CUSTOM_DIRNAME);
            fs.mkdirSync(tujuanDir, { recursive: true });
            const tujuan = resolvePathWithinRoot(tujuanDir, nama);
            atomicWriteFileSync(tujuan, fs.readFileSync(sumberPath));

            return { success: true, file: nama, options: listOptions(dir), active: readSelection(dir) };
        } catch (error) {
            return { success: false, message: `Gagal menambah font: ${error.message}` };
        }
    });
}

module.exports = {
    CSS_FILENAME,
    CUSTOM_DIRNAME,
    FONT_EXTS,
    cssPath,
    daftarBundled,
    daftarStacks,
    daftarKreator,
    listOptions,
    findOption,
    buildFontCss,
    readSelection,
    applySelection,
    registerHandlers
};
