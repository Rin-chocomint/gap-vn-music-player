// =============================================
// Hub Templates — Loader pustaka template Hub berbasis folder
// =============================================
//
// Setiap template = SATU subfolder di `aset/game/hub-templates/<id>/` berisi:
//   - template.json   : manifus (id, icon, label, description, daftar scene, css, js)
//   - hub.css         : tema lengkap (disalin & MENIMPA hub.css novel saat diterapkan)
//   - hub.js          : (opsional) logika kustom; bila tak ada, engine pakai starter
//   - scenes/*.html   : markup penuh tiap scene (<section ...>), satu berkas = satu scene
//
// Tujuan struktur ini: tiap template berdiri sendiri sehingga perbedaan gaya
// mudah dilihat/diedit. Template diterapkan sebagai hub CODE-FIRST (partial per
// scene + hub.css tema), lalu bebas dikustomisasi kreator lewat Advanced/VS Code.
//
// Token yang disubstitusi saat menulis partial dari berkas scene template:
//   {{SCENE_ID}}      → id unik scene hasil generate (untuk data-scene-id, dll.)
//   {{SCENE_NAME}}    → nama tampilan scene (dari manifest / default tipe)
//   {{TARGET:<type>}} → id scene PERTAMA bertipe <type> di set ini (untuk tombol
//                       data-action="goto" data-target="..."); kosong bila tak ada.
//
// Modul ES-friendly tanpa state global: semua fungsi menerima `templatesDir`.

const path = require('path');
const fs = require('fs');

// Resolusi aman: pastikan path target berada DI DALAM templatesDir (anti traversal).
function _safeJoin(templatesDir, id) {
    const base = path.resolve(templatesDir);
    const target = path.resolve(base, String(id || ''));
    if (target !== base && !target.startsWith(base + path.sep)) return null;
    return target;
}

function _readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

/**
 * Daftar ringkas semua template di folder (untuk picker editor).
 *
 * TAKSONOMI (UX-C01). Tiga field baru menemani metadata lama:
 *   - `kind`         : 'layout' | 'advanced'. Memisahkan "pilihan susunan"
 *                      dari "blueprint kaya-fitur" (showcase).
 *   - `layoutFamily` : nama keluarga susunan ('left-rail', 'center-stack', …).
 *                      Inilah yang dipakai picker untuk MENGELOMPOKKAN.
 *   - `hasThumbnail` : berkas foto template BENAR-BENAR ada di disk.
 *
 * Ketiganya OPSIONAL. Template lama & buatan pihak ketiga yang tak menyebutnya
 * tetap terdaftar dan tetap bisa dipilih — picker menaruhnya di grup "Belum
 * dikategorikan". Menebak kategori template yang belum pernah dilihat editor
 * justru melahirkan label yang salah, dan label salah lebih buruk daripada
 * label kosong.
 *
 * `hasThumbnail` dijawab DI SINI, bukan di renderer: main yang memegang
 * filesystem. Renderer cuma perlu tahu boleh/tidaknya menggambar <img>.
 *
 * @param {string} templatesDir
 * @returns {Array<{id,folder,icon,label,description,sceneCount,order,kind,layoutFamily,thumbnail,hasThumbnail}>}
 */
function list(templatesDir) {
    if (!templatesDir || !fs.existsSync(templatesDir)) return [];
    const out = [];
    fs.readdirSync(templatesDir, { withFileTypes: true }).forEach(function (ent) {
        if (!ent.isDirectory()) return;
        const manifestPath = path.join(templatesDir, ent.name, 'template.json');
        if (!fs.existsSync(manifestPath)) return;
        try {
            const m = _readJson(manifestPath);
            const thumb = typeof m.thumbnail === 'string' && m.thumbnail ? m.thumbnail : null;
            // Nama berkas foto tak boleh keluar dari folder templatenya.
            const thumbSafe = thumb && !/[\\/]|\.\./.test(thumb) ? thumb : null;
            out.push({
                id: m.id || ent.name,
                folder: ent.name,
                icon: m.icon || '🎨',
                label: m.label || ent.name,
                description: m.description || '',
                sceneCount: Array.isArray(m.scenes) ? m.scenes.length : 0,
                order: typeof m.order === 'number' ? m.order : 100,
                kind: m.kind === 'layout' || m.kind === 'advanced' ? m.kind : null,
                layoutFamily: typeof m.layoutFamily === 'string' && m.layoutFamily ? m.layoutFamily : null,
                thumbnail: thumbSafe,
                hasThumbnail: !!thumbSafe && fs.existsSync(path.join(templatesDir, ent.name, thumbSafe))
            });
        } catch (e) {
            console.warn('[HubTemplates] template.json tidak valid di "' + ent.name + '":', e.message);
        }
    });
    out.sort(function (a, b) {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.label).localeCompare(String(b.label));
    });
    return out;
}

/**
 * Muat satu template lengkap (manifest + path file resolusi).
 * Mencari berdasarkan folder ATAU field id pada manifest.
 * @returns {null|{id,icon,label,description,dir,cssFile,jsFile,scenes}}
 */
function load(templatesDir, id) {
    if (!templatesDir || !id) return null;
    // Coba folder berama persis id dulu.
    let dir = _safeJoin(templatesDir, id);
    let manifestPath = dir && path.join(dir, 'template.json');
    if (!dir || !fs.existsSync(manifestPath)) {
        // Fallback: pindai folder, cocokkan field manifest.id.
        dir = null;
        const items = list(templatesDir);
        const hit = items.filter(function (t) { return t.id === id; })[0];
        if (!hit) return null;
        dir = path.join(templatesDir, hit.folder);
        manifestPath = path.join(dir, 'template.json');
        if (!fs.existsSync(manifestPath)) return null;
    }
    let m;
    try { m = _readJson(manifestPath); } catch (e) { return null; }
    return {
        id: m.id || path.basename(dir),
        icon: m.icon || '🎨',
        label: m.label || path.basename(dir),
        description: m.description || '',
        dir: dir,
        cssFile: m.css || 'hub.css',
        jsFile: m.js || null,
        scenes: Array.isArray(m.scenes) ? m.scenes : []
    };
}

// Escape ringan, aman untuk konteks atribut maupun teks HTML.
function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Substitusi token pada markup scene template.
 * @param {string} markup
 * @param {{id:string, name:string, idByType:Object<string,string>}} ctx
 * @returns {string}
 */
function substituteTokens(markup, ctx) {
    ctx = ctx || {};
    const idByType = ctx.idByType || {};
    return String(markup == null ? '' : markup)
        .replace(/\{\{\s*SCENE_ID\s*\}\}/g, ctx.id || '')
        .replace(/\{\{\s*SCENE_NAME\s*\}\}/g, _esc(ctx.name || ''))
        .replace(/\{\{\s*TARGET:([a-zA-Z_]+)\s*\}\}/g, function (_m, type) {
            return idByType[type] || '';
        });
}

/**
 * Baca markup berkas sebuah scene dari template (atau null bila tak ada/diset).
 * @param {{dir:string}} tpl
 * @param {{file?:string}} sceneMeta
 */
function readSceneMarkup(tpl, sceneMeta) {
    if (!tpl || !sceneMeta || !sceneMeta.file) return null;
    // Cegah traversal di luar folder template.
    const target = path.resolve(tpl.dir, sceneMeta.file);
    if (target !== tpl.dir && !target.startsWith(tpl.dir + path.sep)) return null;
    if (!fs.existsSync(target)) return null;
    return fs.readFileSync(target, 'utf-8');
}

function readThemeCss(tpl) {
    if (!tpl || !tpl.cssFile) return null;
    const p = path.join(tpl.dir, tpl.cssFile);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

function readThemeJs(tpl) {
    if (!tpl || !tpl.jsFile) return null;
    const p = path.join(tpl.dir, tpl.jsFile);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

module.exports = {
    list,
    load,
    substituteTokens,
    readSceneMarkup,
    readThemeCss,
    readThemeJs
};
