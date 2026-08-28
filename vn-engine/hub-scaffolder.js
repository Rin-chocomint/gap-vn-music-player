// =============================================
// Hub Scaffolder — Code-first Hub generator
// =============================================
// Menghasilkan `hub.html` + `hub.css` berbasis SECTION, di mana setiap
// Hub Scene = satu blok <section data-scene-id="..."> yang nyata dan bisa
// diedit. `scenes[]` di hub-config.json memegang index/metadata; file HTML
// memegang kodenya; keduanya dikait lewat scene.id.
//
// Filosofi (lihat memory: hub-direction-code-first-scenes):
//   - Profil Novel (judul, genre, dst.) tetap DINAMIS via VNHub (bind dari
//     novel-meta.json) → tidak ditanam permanen ke HTML.
//   - Layout/presentasi tiap scene = KODE yang dimiliki kreator → bebas diedit.
//
// Modul ini murni string-builder + penulis file; tidak menyentuh Electron.
// =============================================

const path = require('path');
const fs = require('fs');
const hubTemplates = require('./hub-templates');
const { atomicWriteFileSync } = require('./atomic-writer');
const { validatePathComponent, resolvePathWithinRoot } = require('./path-utils');

// Penanda level config: hub.html ini terorganisir sebagai scenes code-first.
// Dipakai editor untuk memutuskan merender daftar scene (bukan placeholder
// "Custom Hub Runtime"). Runtime/resolver tidak peduli — tetap memuat hub.html.
const CODE_SCENES_FLAG = 'codeScenes';

// Urutan band default per tipe (selaras hubSceneModel.ORDER_BY_TYPE).
const ORDER_BY_TYPE = {
    splash: 10, warning: 20, main_menu: 30, info: 40, credits: 50, custom_code: 60, blank: 70
};

// Nama default per tipe (selaras hubSceneModel.DEFAULT_NAME_BY_TYPE).
const DEFAULT_NAME_BY_TYPE = {
    splash: 'Splash Opening', warning: 'Content Warning', main_menu: 'Main Menu',
    info: 'Info Novel', credits: 'Credits', custom_code: 'Custom Code', blank: 'Scene Baru'
};

function defaultNameForType(type) { return DEFAULT_NAME_BY_TYPE[type] || 'Scene Baru'; }

// ID acak untuk scene buatan user/template (selaras pola hubSceneModel.genId).
function createSceneId(type) {
    return 'hub_scene_' + (type || 'blank') + '_' + Date.now().toString(36) +
        Math.floor(Math.random() * 1296).toString(36);
}

// Factory objek scene code-first (id/name/type/order + render:'code').
function sceneFromType(type, opts) {
    opts = opts || {};
    type = type || 'blank';
    return {
        id: opts.id || createSceneId(type),
        name: opts.name || defaultNameForType(type),
        type: type,
        enabled: opts.enabled !== false,
        order: typeof opts.order === 'number' ? opts.order : (ORDER_BY_TYPE[type] || 90),
        render: 'code'
    };
}

function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------
// Markup per tipe scene — body bagian dalam <section>.
// Sengaja sederhana, terbaca, dan siap di-tweak kreator.
//
// `scene` boleh membawa opsi build (tidak dipersist ke scenes[] config):
//   - warningText   (warning)   : teks peringatan
//   - menuActions   (main_menu) : [{ label, action, targetType? }]
//       action: 'start' | 'chapter-select' | 'exit' | 'goto'
//       'goto' diresolve ke scene pertama bertipe `targetType` via ctx.scenes.
//   - creditsLines  (credits)   : array string baris kredit
//   - duration      (splash)    : ms auto-lanjut (jadi data-duration di section)
// `ctx.scenes` = daftar semua scene dokumen (untuk resolve target goto).
// ---------------------------------------------
function _resolveGotoTarget(ctx, targetType) {
    const list = (ctx && Array.isArray(ctx.scenes)) ? ctx.scenes : [];
    const found = list.find(s => s && s.type === targetType);
    return found ? found.id : null;
}

function _menuActionButtons(scene, ctx) {
    const fallback = [
        { label: 'Mulai', action: 'start' },
        { label: 'Pilih Chapter', action: 'chapter-select' },
        { label: 'Keluar', action: 'exit' }
    ];
    const actions = (Array.isArray(scene.menuActions) && scene.menuActions.length) ? scene.menuActions : fallback;
    const lines = [];
    let primaryUsed = false;
    actions.forEach(function (item) {
        if (!item || !item.action) return;
        let actionAttr = item.action;
        let targetAttr = '';
        if (item.action === 'goto') {
            const targetId = _resolveGotoTarget(ctx, item.targetType);
            if (!targetId) return; // scene tujuan tidak ada di set → tombol dilewati
            targetAttr = ' data-target="' + escAttr(targetId) + '"';
        } else if (item.action === 'link' && item.href) {
            targetAttr = ' data-href="' + escAttr(item.href) + '"';
        }
        const isPrimary = !primaryUsed && item.action === 'start';
        if (isPrimary) primaryUsed = true;
        const nodeName = (item.action === 'goto' ? ('goto-' + (item.targetType || 'scene')) : item.action) + '-btn';
        lines.push('          <button type="button" class="hub-btn' + (isPrimary ? ' hub-btn-primary' : '') +
            '" data-node="' + escAttr(nodeName) + '" data-action="' + escAttr(actionAttr) + '"' + targetAttr + '>' +
            escHtml(item.label || item.action) + '</button>');
    });
    return lines;
}

function sceneBodyMarkup(scene, ctx) {
    const type = scene.type || 'blank';
    switch (type) {
        case 'splash': {
            // `scene.src` (relatif ke folder novel) dipakai langsung bila ada (mis. hasil
            // materialisasi dari bootSequence); jika kosong, biarkan data-bind-asset.
            const splashSrc = scene.src ? (' src="' + escAttr(scene.src) + '"') : '';
            return [
                '      <!-- Gambar/teks pembuka. Ganti src lewat data-bind-asset atau langsung di img. -->',
                '      <img class="hub-splash-img" data-node="image" data-bind-asset="' + escAttr(scene.id) + '"' + splashSrc + ' alt="">',
                '      <p class="hub-splash-skip" data-node="skip-hint">Klik untuk lanjut</p>'
            ].join('\n');
        }

        case 'warning':
            return [
                '      <div class="hub-warning-box">',
                '        <p class="hub-warning-text" data-node="text">' +
                    escHtml(scene.warningText || 'Novel ini mengandung konten sensitif. Disarankan untuk pembaca dewasa.') + '</p>',
                '        <button type="button" class="hub-btn" data-node="continue-btn" data-action="continue">Saya Mengerti</button>',
                '      </div>'
            ].join('\n');

        case 'main_menu':
            return [
                '      <div class="hub-menu">',
                '        <h1 class="hub-menu-title" data-node="title" data-bind="title">Visual Novel</h1>',
                '        <p class="hub-menu-tagline" data-node="tagline" data-bind="storyDesc"></p>',
                '        <div class="hub-menu-actions" data-node="actions">'
            ].concat(_menuActionButtons(scene, ctx)).concat([
                '        </div>',
                '      </div>'
            ]).join('\n');

        case 'info':
            return [
                '      <div class="hub-info">',
                '        <h2 data-node="title" data-bind="title">Tentang Novel</h2>',
                '        <p class="hub-info-desc" data-node="desc" data-bind="description"></p>',
                '        <dl class="hub-info-meta" data-node="meta">',
                '          <dt>Genre</dt><dd data-bind="genre"></dd>',
                '          <dt>Penulis</dt><dd data-bind="author"></dd>',
                '          <dt>Ilustrator</dt><dd data-bind="illustrator"></dd>',
                '          <dt>VN Mapper</dt><dd data-bind="vnMapper"></dd>',
                '        </dl>',
                '        <button type="button" class="hub-btn" data-node="back-btn" data-action="back">Kembali</button>',
                '      </div>'
            ].join('\n');

        case 'credits': {
            const creditLines = (Array.isArray(scene.creditsLines) && scene.creditsLines.length)
                ? scene.creditsLines
                : ['Dibuat dengan GAP VN Player'];
            return [
                '      <div class="hub-credits">',
                '        <h2 data-node="title">Credits</h2>',
                '        <div class="hub-credits-lines" data-node="lines">'
            ].concat(creditLines.map(function (line) {
                return '          <p>' + escHtml(line) + '</p>';
            })).concat([
                '        </div>',
                '        <button type="button" class="hub-btn" data-node="back-btn" data-action="back">Kembali</button>',
                '      </div>'
            ]).join('\n');
        }

        case 'custom_code':
        case 'blank':
        default:
            return [
                '      <!-- Kanvas Hub kosong. Aturan struktur lengkap ada di komentar atas hub.html.',
                '           Singkatnya: rancang isi di dalam <section> ini, tandai elemen dengan',
                '           data-node, pakai data-action untuk tombol & data-bind untuk metadata. -->',
                '      <div class="hub-blank" data-node="content">',
                '        <h1 data-node="title" data-bind="title">Visual Novel</h1>',
                '        <p>Hub kosong — mulai desain di sini, atau pilih template di sidebar.</p>',
                '        <!-- Aktifkan tombol Mulai: keluarkan baris ini dari komentar.',
                '        <button type="button" class="hub-btn" data-node="start-btn" data-action="start">Mulai</button> -->',
                '      </div>'
            ].join('\n');
    }
}

// Satu blok <section> lengkap untuk sebuah scene.
// `ctx` opsional ({ scenes }) — dipakai sceneBodyMarkup untuk resolve goto target.
function buildSceneSection(scene, ctx) {
    const id = scene.id;
    const type = scene.type || 'blank';
    const name = scene.name || type;
    const enabled = scene.enabled !== false;
    const isBoot = type === 'splash' || type === 'warning';
    const attrs = [
        'class="hub-scene' + (isBoot ? ' hub-scene-boot' : '') + '"',
        'data-scene-id="' + escAttr(id) + '"',
        'data-scene-type="' + escAttr(type) + '"',
        'data-scene-name="' + escAttr(name) + '"'
    ];
    if (type === 'splash' && scene.duration) attrs.push('data-duration="' + escAttr(scene.duration) + '"');
    if (!enabled) attrs.push('data-disabled="true"');
    return [
        '    <!-- ===== Scene: ' + escHtml(name) + ' (' + type + ') =====',
        '         Berkas/section ini = SATU scene. Engine mengenali & mengelompokkan scene',
        '         lewat data-scene-id (unik) + data-scene-type. Tandai elemen dengan',
        '         data-node="nama" agar muncul sebagai child di editor. -->',
        '    <section ' + attrs.join(' ') + '>',
        sceneBodyMarkup(scene, ctx),
        '    </section>'
    ].join('\n');
}

// CATATAN: runtime konvensi hub (alur scene, data-bind, data-action) DIPINDAH ke
// berkas bersama `vn-player/js/vn-hub-runtime.js`, di-inject engine saat runtime
// berdampingan dengan vn-hub-api.js. hub.html baru hanya menandai dirinya memakai
// runtime eksternal (window.__VN_HUB_EXTERNAL_RUNTIME__) — lihat buildHubDocument.
// Tujuannya: perbaikan runtime menyebar tanpa perlu recompose tiap hub.

// Bungkus markup section (string yang sudah jadi) dengan shell + runtime script.
// Dipakai baik oleh buildHubHtml (dari scene) maupun composeHub (dari partial files).
function buildHubDocument(sectionsHtml, opts) {
    opts = opts || {};
    return [
        '<!doctype html>',
        '<!-- ==================================================================',
        '     STRUKTUR HUB — cara engine membaca berkas ini',
        '',
        '     Berkas ini DIRAKIT otomatis dari potongan per-scene. Jangan disunting',
        '     langsung (akan ditimpa saat dirakit ulang). Tempat menyunting:',
        '       - hub/scenes/<id>.html : markup tiap scene (satu berkas = satu scene)',
        '       - hub.css              : gaya tampilan (berlaku global)',
        '       - hub.js               : logika kustom (global; lihat komentar di sana)',
        '',
        '     PEMETAAN SCENE (inti & wajib):',
        '     Tiap scene Hub adalah SATU <section> dengan dua atribut penanda:',
        '       - data-scene-id="..."   ID unik. Inilah yang dipakai engine untuk',
        '                               MENGELOMPOKKAN & membedakan satu scene dari',
        '                               lainnya (dan memetakannya ke berkas partial).',
        '       - data-scene-type="..." Peran scene + perilaku runtime:',
        '           splash    layar pembuka; auto-lanjut (atau klik) ke berikutnya',
        '           warning   peringatan konten; menunggu tombol data-action="continue"',
        '           main_menu menu utama (layar terminal)',
        '           info      info/sinopsis novel (layar terminal)',
        '           credits   daftar kredit',
        '           blank     kanvas bebas',
        '     Runtime menampilkan SATU scene aktif: scene boot (splash/warning) tampil',
        '     berurutan dulu, lalu berhenti di scene terminal (main_menu - info - terakhir).',
        '     Tanpa pembungkus <section data-scene-id/type> yang benar, engine tidak bisa',
        '     mengenali, mengurutkan, atau menampilkan scene; karena itu pemetaan ini wajib.',
        '',
        '     PENANDA DI DALAM SCENE:',
        '       - data-node="nama"  menandai elemen sebagai node anak scene; tampil',
        '                           terstruktur di editor (tree) untuk navigasi.',
        '       - data-action="..." tombol terhubung engine: start | chapter-select |',
        '                           exit | continue | back.',
        '       - data-bind="..."   isi teks otomatis dari metadata novel: title |',
        '                           storyDesc | description | genre | author |',
        '                           illustrator | vnMapper | version.',
        '     ================================================================== -->',
        '<html lang="id">',
        '<head>',
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        '  <title>' + escHtml(opts.title || 'Visual Novel') + '</title>',
        // Font global novel. Berkas TERPISAH dan sengaja di DEPAN hub.css:
        // penerapan template menimpa hub.css seutuhnya, jadi font yang tinggal
        // di sana akan mati tiap kali kreator ganti template. Novel yang belum
        // memilih font tidak punya berkas ini — link-nya gagal diam-diam dan
        // tiap template jatuh ke `var(--vn-novel-font, <bawaannya sendiri>)`.
        '  <link rel="stylesheet" href="novel-font.css">',
        '  <link rel="stylesheet" href="hub.css">',
        '</head>',
        '<body>',
        '  <div id="hub-root">',
        sectionsHtml,
        '  </div>',
        '',
        '  <!-- Runtime konvensi hub (alur scene, data-bind, data-action) disuntik engine',
        '       dari berkas bersama vn-hub-runtime.js — tidak ditanam di sini agar perbaikan',
        '       engine menyebar tanpa perlu menulis ulang hub.html. Penanda di bawah memberi',
        '       tahu engine bahwa hub ini memakai runtime eksternal tsb.',
        '       Blok kedua = bootstrap ANTI-FLASH: mengaktifkan scene boot pertama (atau',
        '       terminal) SEBELUM first paint, supaya latar #hub-root / scene lain tidak',
        '       sempat terlihat selama jeda injeksi runtime. Runtime lalu mengadopsi scene',
        '       yang sudah aktif ini (tidak dobel). -->',
        '  <script>',
        '    window.__VN_HUB_EXTERNAL_RUNTIME__ = 1;',
        '    (function () {',
        '      if (document.querySelector(".hub-scene.active")) return;',
        '      var s = document.querySelector(".hub-scene.hub-scene-boot:not([data-disabled=\\"true\\"])");',
        '      if (!s) {',
        '        var all = document.querySelectorAll(".hub-scene:not([data-disabled=\\"true\\"])");',
        '        for (var i = 0; i < all.length && !s; i++) if (all[i].getAttribute("data-scene-type") === "main_menu") s = all[i];',
        '        for (var j = 0; j < all.length && !s; j++) if (all[j].getAttribute("data-scene-type") === "info") s = all[j];',
        '        if (!s && all.length) s = all[all.length - 1];',
        '      }',
        '      if (s) s.classList.add("active");',
        '    })();',
        '  </' + 'script>',
        '  <script src="hub.js"></' + 'script>',
        '</body>',
        '</html>',
        ''
    ].join('\n');
}

// Dokumen hub.html lengkap dari daftar scene (membangun section dari nol).
function buildHubHtml(scenes, opts) {
    const ordered = (scenes || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    const ctx = { scenes: ordered };
    const sections = ordered.map(function (s) { return buildSceneSection(s, ctx); }).join('\n\n');
    return buildHubDocument(sections, opts);
}

// Rentang [start,end) sebuah <section> scene di dalam html (termasuk komentar
// judul tepat sebelumnya bila dekat). Null bila tidak ditemukan.
//
// Menghitung KEDALAMAN <section>/</section> mulai dari tag pembuka scene,
// bukan mengambil </section> pertama yang ditemukan — beberapa scene (mis.
// blok judul Panorama, kolom menu Minimal) menaruh <section> BERSARANG di
// body-nya. Pencarian naif berhenti di penutup anak itu, memotong sisa scene
// (tombol menu, footer, bahkan penutup section-nya sendiri) setiap kali
// extractSection/decomposeHubIntoPartials berjalan (dipanggil ensurePartials
// tiap Hub editor dibuka — lihat findSectionRange nested-section regression).
function findSectionRange(html, sceneId) {
    if (typeof html !== 'string' || !sceneId) return null;
    const idIdx = html.indexOf('data-scene-id="' + sceneId + '"');
    if (idIdx < 0) return null;
    let start = html.lastIndexOf('<section', idIdx);
    if (start < 0) return null;

    // Komentar HTML dilewati UTUH (bukan cuma diabaikan) — komentar penjelas di
    // markup generik ("...di dalam <section> ini...") memuat teks "<section>"
    // yang kalau ikut dihitung bikin depth tak pernah kembali ke 0.
    const tagRe = /<!--[\s\S]*?-->|<\/section>|<section\b[^>]*>/gi;
    tagRe.lastIndex = start;
    let depth = 0;
    let end = -1;
    let m;
    while ((m = tagRe.exec(html))) {
        if (m[0].charAt(0) === '<' && m[0].charAt(1) === '!') {
            continue; // komentar — tak memengaruhi kedalaman
        } else if (m[0].charAt(1) === '/') {
            depth--;
            if (depth === 0) { end = m.index + m[0].length; break; }
        } else {
            depth++;
        }
    }
    if (end < 0) return null;

    const commentIdx = html.lastIndexOf('<!-- ===== Scene', start);
    if (commentIdx >= 0 && (start - commentIdx) < 300) start = commentIdx;
    return { start: start, end: end };
}

// Ambil markup <section> sebuah scene dari html monolith (untuk migrasi ke partial).
function extractSection(html, sceneId) {
    const r = findSectionRange(html, sceneId);
    return r ? html.slice(r.start, r.end).replace(/^\s+/, '') : null;
}

/**
 * Sinkronkan NAMA scene ke dalam markup tanpa menyentuh isi (body) buatan kreator.
 * Hanya memperbarui dua metadata turunan pada <section> scene:
 *   - atribut data-scene-name="..."
 *   - komentar judul "<!-- ===== Scene: NAMA (type) ===== -->"
 *
 * Dipakai agar rename scene di editor (Inspector) tercermin di kode (partial &
 * hub.html), sehingga nama di kode SELALU relevan dengan scene — termasuk scene
 * Blank yang markup-nya generik. Aman dipanggil pada partial maupun hub.html
 * monolith; mengembalikan string apa adanya bila scene tidak ditemukan.
 *
 * @param {string} html
 * @param {{id:string, name?:string, type?:string}} scene
 * @returns {string}
 */
function syncSceneNameInMarkup(html, scene) {
    if (typeof html !== 'string' || !scene || !scene.id) return html;
    const r = findSectionRange(html, scene.id);
    if (!r) return html;
    const name = scene.name || scene.type || 'Scene';
    let block = html.slice(r.start, r.end);

    // 1) atribut data-scene-name pada tag <section> pembuka.
    if (/data-scene-name="[^"]*"/.test(block)) {
        block = block.replace(/data-scene-name="[^"]*"/, 'data-scene-name="' + escAttr(name) + '"');
    } else {
        // Belum ada → sisipkan tepat setelah data-scene-type (atau data-scene-id).
        block = block.replace(/(data-scene-type="[^"]*"|data-scene-id="[^"]*")/,
            '$1 data-scene-name="' + escAttr(name) + '"');
    }

    // 2) komentar judul "<!-- ===== Scene: <nama> (<type>) ===== ...". Pertahankan
    //    bagian "(type) =====" dan teks setelahnya; ganti hanya <nama>.
    block = block.replace(
        /(<!--\s*=====\s*Scene:\s*)[\s\S]*?(\s*\([^)]*\)\s*=====)/,
        function (m, pre, tail) { return pre + escHtml(name) + tail; }
    );

    return html.slice(0, r.start) + block + html.slice(r.end);
}

/**
 * Terapkan status AKTIF/NONAKTIF scene ke markup lewat `data-disabled` pada tag
 * <section> pembuka. Idempoten: atribut ditambah saat scene dimatikan dan dibuang
 * saat dihidupkan lagi.
 *
 * Kenapa perlu (UX-A03): `data-disabled` selama ini hanya ditulis saat section
 * DIBANGUN. Toggle "Aktif" di Inspector karena itu mengubah hub-config.json tapi
 * tidak pernah menyentuh markup yang sudah ada, sementara runtime code-first
 * (`vn-hub-runtime.js`) menyaring scene murni dari atribut ini. Hasilnya kontrol
 * yang kelihatan hidup tapi tak berefek — persis kelas masalah yang sedang dicabut.
 *
 * @param {string} html
 * @param {{id:string, enabled?:boolean}} scene
 * @returns {string}
 */
function syncSceneEnabledInMarkup(html, scene) {
    if (typeof html !== 'string' || !scene || !scene.id) return html;
    const r = findSectionRange(html, scene.id);
    if (!r) return html;
    let block = html.slice(r.start, r.end);
    const tagMatch = block.match(/<section\b[^>]*>/);
    if (!tagMatch) return html;
    const tag = tagMatch[0];

    const disabled = scene.enabled === false;
    const punyaAtribut = /\sdata-disabled="[^"]*"/.test(tag);
    let newTag = tag;
    if (disabled && punyaAtribut) {
        newTag = tag.replace(/\sdata-disabled="[^"]*"/, ' data-disabled="true"');
    } else if (disabled) {
        newTag = tag.replace(/>$/, ' data-disabled="true">');
    } else if (punyaAtribut) {
        newTag = tag.replace(/\sdata-disabled="[^"]*"/, '');
    }

    if (newTag === tag) return html;
    block = block.replace(tag, newTag);
    return html.slice(0, r.start) + block + html.slice(r.end);
}

/**
 * Kebalikan `escAttr` — untuk MEMBACA nilai atribut kembali dari markup.
 */
function unescAttr(s) {
    return String(s == null ? '' : s)
        .replace(/&lt;/g, '<')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&');
}

/**
 * Baca metadata scene dari markup partial yang DITULIS KREATOR (arah kode → editor).
 *
 * Pasangan arah baliknya adalah `syncSceneNameInMarkup` (editor → kode). Sebelum
 * UX-A04 hanya arah itu yang ada, sehingga menyunting `data-scene-name` di kode
 * bukan cuma diabaikan editor — nilainya DITIMPA balik oleh nama lama dari config
 * pada Save Hub berikutnya.
 *
 * Komentar dibuang lebih dulu supaya contoh markup yang sengaja dikomentari tidak
 * terbaca sebagai scene kedua. (Kelas kesalahan "komentar bukan kode" sudah
 * berulang di proyek ini.)
 *
 * @param {string} html isi partial
 * @returns {{rootCount:number, id:string|null, type:string|null, name:string|null}|null}
 *          null bila tak ada <section> ber-data-scene-id sama sekali.
 */
function readSceneMetaFromMarkup(html) {
    if (typeof html !== 'string' || !html.trim()) return null;
    const tanpaKomentar = html.replace(/<!--[\s\S]*?-->/g, '');
    const tags = tanpaKomentar.match(/<section\b[^>]*>/gi) || [];
    const roots = tags.filter(function (t) { return /data-scene-id\s*=/i.test(t); });
    if (roots.length === 0) return null;

    // Seluruh atribut tag pembuka dibaca sekali jadi map. Sengaja tanpa RegExp
    // dinamis: satu pola statis lebih mudah dibaca dan tak bisa salah dirakit.
    const attrs = {};
    const re = /\s([a-zA-Z-]+)="([^"]*)"/g;
    let m;
    while ((m = re.exec(roots[0])) !== null) attrs[m[1].toLowerCase()] = unescAttr(m[2]);

    return {
        rootCount: roots.length,
        id: attrs['data-scene-id'] || null,
        type: attrs['data-scene-type'] || null,
        name: attrs['data-scene-name'] || null
    };
}

// Gabungkan deklarasi background ke dalam string atribut `style` yang sudah ada,
// MENGHAPUS deklarasi background-* lama yang kita kelola, lalu menambahkan yang baru.
// Style manual milik kreator (selain background-*) dipertahankan.
function _mergeSectionStyleBg(styleStr, declarations) {
    const kept = String(styleStr || '').split(';')
        .map(function (s) { return s.trim(); })
        .filter(Boolean)
        .filter(function (decl) {
            const prop = decl.split(':')[0].trim().toLowerCase();
            return ['background-image', 'background-size', 'background-position', 'background-repeat'].indexOf(prop) === -1;
        });
    const out = kept.concat(declarations || []);
    return out.length ? (out.join('; ') + ';') : '';
}

/**
 * Terapkan BACKGROUND scene (gambar + overlay gelap) ke markup, hanya lewat atribut
 * `style` pada tag <section> pembuka — body buatan kreator tidak disentuh. Idempoten:
 * deklarasi background lama diganti, dan bila scene tak punya background, deklarasi
 * itu dihapus. Overlay diwujudkan sebagai layer linear-gradient di atas gambar (tanpa
 * perlu pseudo-element / perubahan hub.css / runtime). URL aset relatif terhadap root
 * novel (sama seperti hub.css), jadi resolusinya benar di preview maupun runtime.
 *
 * Menangani background bertipe 'image' (kasus utama). Tipe 'video' untuk scene
 * code-first diatur lewat kode oleh kreator.
 *
 * @param {string} html
 * @param {{id:string, background?:{type?:string, src?:string, overlay?:number}}} scene
 * @returns {string}
 */
function syncSceneBackgroundInMarkup(html, scene) {
    if (typeof html !== 'string' || !scene || !scene.id) return html;
    const r = findSectionRange(html, scene.id);
    if (!r) return html;
    let block = html.slice(r.start, r.end);
    const tagMatch = block.match(/<section\b[^>]*>/);
    if (!tagMatch) return html;
    const tag = tagMatch[0];

    const bg = scene.background;
    let decls = [];
    if (bg && bg.type === 'image' && bg.src) {
        const ov = (typeof bg.overlay === 'number') ? bg.overlay : 0.45;
        const imgs = [];
        if (ov > 0) {
            const a = ov.toFixed(2);
            imgs.push('linear-gradient(rgba(0,0,0,' + a + '), rgba(0,0,0,' + a + '))');
        }
        imgs.push("url('" + String(bg.src).replace(/'/g, '%27') + "')");
        decls = ['background-image: ' + imgs.join(', '), 'background-size: cover', 'background-position: center', 'background-repeat: no-repeat'];
    }

    const styleAttrMatch = tag.match(/\sstyle="([^"]*)"/);
    const newStyle = _mergeSectionStyleBg(styleAttrMatch ? styleAttrMatch[1] : '', decls);
    let newTag;
    if (styleAttrMatch) {
        newTag = newStyle
            ? tag.replace(/\sstyle="[^"]*"/, ' style="' + newStyle + '"')
            : tag.replace(/\sstyle="[^"]*"/, '');
    } else if (newStyle) {
        newTag = tag.replace(/>$/, ' style="' + newStyle + '">');
    } else {
        newTag = tag;
    }
    if (newTag === tag) return html;
    block = block.replace(tag, newTag);
    return html.slice(0, r.start) + block + html.slice(r.end);
}

/**
 * Sisipkan satu <section> scene ke hub.html yang SUDAH ADA, tepat sebelum
 * penutup #hub-root (</div> terakhir sebelum <script runtime). Tidak menyentuh
 * section lain → edit kreator pada scene yang sudah ada tetap aman.
 * @returns {string} HTML baru
 */
function insertSceneSection(html, scene) {
    const section = '\n' + buildSceneSection(scene) + '\n';
    if (typeof html !== 'string' || !html.trim()) {
        return buildHubHtml([scene]); // belum ada dokumen → bangun dari nol
    }
    const scriptIdx = html.search(/<script[\s>]/i);
    const searchUpTo = scriptIdx >= 0 ? scriptIdx : html.length;
    const closeIdx = html.lastIndexOf('</div>', searchUpTo);
    if (closeIdx < 0) {
        const bodyIdx = html.lastIndexOf('</body>');
        const at = bodyIdx >= 0 ? bodyIdx : html.length;
        return html.slice(0, at) + section + html.slice(at);
    }
    return html.slice(0, closeIdx) + section + '  ' + html.slice(closeIdx);
}

/**
 * Hapus satu <section> scene (beserta komentar judulnya) dari hub.html.
 * Aman bila id tidak ditemukan (mengembalikan html apa adanya).
 * @returns {string} HTML baru
 */
function removeSceneSection(html, sceneId) {
    const r = findSectionRange(html, sceneId);
    if (!r) return html;
    let start = r.start;
    // Rapikan: makan whitespace/baris kosong di awal blok.
    while (start > 0 && /\s/.test(html[start - 1])) start--;
    const out = html.slice(0, start) + html.slice(r.end);
    // Kompres 3+ newline beruntun jadi 2.
    return out.replace(/\n{3,}/g, '\n\n');
}

// hub.js dasar (global) — terdokumentasi. Dijalankan setelah runtime bawaan.
const STARTER_HUB_JS = [
    '// ====================================================================',
    '// hub.js — JavaScript kustom Hub (global). Di-link otomatis oleh engine',
    '// di AKHIR hub.html, jadi berjalan setelah runtime & semua scene siap.',
    '// ====================================================================',
    '//',
    '// Struktur scene & atribut markup (data-scene-id/type, data-node,',
    '// data-action, data-bind) dijelaskan di komentar atas hub.html.',
    '//',
    '// Sudah ditangani runtime bawaan (tak perlu kamu tulis ulang):',
    '//   - Alur scene: splash/warning tampil dulu, lalu scene terminal.',
    '//   - Tombol data-action: "start" (mainkan chapter pertama), "chapter-select",',
    '//     "exit", "continue" (lanjut dari splash/warning), "back" (kembali ke menu).',
    '//   - data-bind: mengisi teks dari metadata novel (title, storyDesc, description,',
    '//     genre, author, illustrator, vnMapper, version).',
    '//',
    '// API jembatan lewat objek global VNHub, mis.:',
    '//   VNHub.getNovelMeta() · VNHub.getChapterList() · VNHub.playChapter(nama)',
    '//   VNHub.showChapterSelect() · VNHub.exitToManager() · VNHub.resolveAsset(path)',
    '//   VNHub.playAudio(src,{volume}) · VNHub.getProgress() · VNHub.showSettings()',
    '//',
    '// Tulis logika tambahanmu di dalam blok ready() di bawah (context novel siap).',
    '(function () {',
    '  function ready(cb) {',
    '    if (window.VNHub && VNHub.isReady && VNHub.isReady()) { cb(); return; }',
    '    if (window.VNHub) { VNHub.onReady(cb); return; }',
    "    window.addEventListener('vnhub:api-ready', function () { VNHub.onReady(cb); }, { once: true });",
    '  }',
    '',
    '  ready(function () {',
    '    // === Logika kustom Hub-mu di sini ===',
    '    // var meta = VNHub.getNovelMeta();',
    '    // VNHub.playAudio("audio/bgm.mp3", { volume: 0.6 });',
    '  });',
    '})();',
    ''
].join('\n');

// CSS dasar — gelap, rapi, mudah ditimpa.
function buildHubCss() {
    return [
        '/* Hub code-first — gaya dasar. Bebas diubah/diganti total. */',
        '* { margin: 0; padding: 0; box-sizing: border-box; }',
        'body { font-family: "Segoe UI", system-ui, sans-serif; background: #0f0f15; color: #f4f5fa; min-height: 100vh; overflow: hidden; }',
        '#hub-root { position: relative; width: 100vw; height: 100vh; }',
        '',
        '/* Sistem layar: satu scene aktif pada satu waktu.',
        '   Pakai visibility+opacity (BUKAN display none/flex) agar transisi pemudaran',
        '   benar-benar terpicu — mengubah display di frame yang sama membatalkan transisi. */',
        '.hub-scene { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .35s ease, visibility .35s ease; }',
        '.hub-scene.active { opacity: 1; visibility: visible; pointer-events: auto; }',
        '',
        '.hub-btn { min-width: 160px; padding: 12px 20px; margin: 6px; border: 1px solid #4a5aa8; background: #1e2750; color: inherit; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: background .2s, border-color .2s; }',
        '.hub-btn:hover { background: #2c3a78; border-color: #7d8cff; }',
        '.hub-btn-primary { background: #2c3a78; border-color: #7d8cff; }',
        '',
        '/* Main Menu */',
        '.hub-menu { text-align: center; }',
        '.hub-menu-title { font-size: clamp(2rem, 6vw, 4.5rem); margin-bottom: 10px; }',
        '.hub-menu-tagline { opacity: .75; margin-bottom: 28px; }',
        '.hub-menu-actions { display: flex; flex-direction: column; align-items: center; }',
        '',
        '/* Info */',
        '.hub-info { max-width: 640px; padding: 32px; }',
        '.hub-info h2 { margin-bottom: 16px; }',
        '.hub-info-desc { opacity: .85; line-height: 1.6; margin-bottom: 20px; }',
        '.hub-info-meta { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin-bottom: 24px; }',
        '.hub-info-meta dt { opacity: .55; }',
        '',
        '/* Splash */',
        '.hub-splash { background: #000; cursor: pointer; }',
        '.hub-splash-img { max-width: 100%; max-height: 100%; object-fit: contain; }',
        '.hub-splash-skip { position: absolute; bottom: 24px; right: 28px; opacity: .5; font-size: .85rem; }',
        '',
        '/* Warning */',
        '.hub-warning-box { max-width: 520px; padding: 32px; text-align: center; border: 1px solid #5a2a2a; border-radius: 12px; background: rgba(90,42,42,.15); }',
        '.hub-warning-text { line-height: 1.6; margin-bottom: 24px; }',
        '',
        '/* Credits */',
        '.hub-credits { text-align: center; }',
        '.hub-credits-lines { opacity: .8; line-height: 1.8; margin: 16px 0 24px; }',
        '',
        '/* Blank */',
        '.hub-blank { opacity: .6; border: 1px dashed #3a3a44; border-radius: 10px; padding: 28px; }',
        ''
    ].join('\n');
}

// Novel TANPA template = satu Hub Scene kosong (kanvas awal). Struktur lebih kaya
// (main_menu/info/dst.) didapat dengan memilih template di editor.
function defaultStarterScenes() {
    return [
        { id: 'hub_scene_main', name: 'Scene Awal', type: 'blank', enabled: true, order: ORDER_BY_TYPE.blank, render: 'code' }
    ];
}

// =============================================
// Pendekatan B — File partial per-scene (hub/scenes/<id>.html)
// Partial = sumber kebenaran tiap scene; hub.html = artifact komposit.
// =============================================

// Penanda config: hub ini memakai partial per-scene (bukan monolith).
const PARTIALS_FLAG = 'hubPartials';

function partialsDir(novelPath) { return resolvePathWithinRoot(novelPath, 'hub', 'scenes'); }
function scenePartialPath(novelPath, sceneId) {
    const safeSceneId = validatePathComponent(sceneId, 'ID scene Hub');
    return resolvePathWithinRoot(partialsDir(novelPath), safeSceneId + '.html');
}
function hubFilePath(novelPath, fileName) {
    return resolvePathWithinRoot(novelPath, fileName);
}
function partialsDirExists(novelPath) { return fs.existsSync(partialsDir(novelPath)); }

function readScenePartial(novelPath, sceneId) {
    const p = scenePartialPath(novelPath, sceneId);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
}

// Tulis partial sebuah scene. `content` opsional — bila kosong, dibangun dari scene.
function writeScenePartial(novelPath, scene, content) {
    const targetPath = scenePartialPath(novelPath, scene && scene.id);
    fs.mkdirSync(partialsDir(novelPath), { recursive: true });
    const body = (typeof content === 'string' && content.trim()) ? content : buildSceneSection(scene);
    atomicWriteFileSync(
        targetPath,
        body.replace(/\s+$/, '') + '\n',
        { encoding: 'utf8' }
    );
}

function removeScenePartialFile(novelPath, sceneId) {
    const p = scenePartialPath(novelPath, sceneId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Komposit hub.html dari partial-partial (urut scenes[]). Partial yang hilang
// dibangun on-the-fly dari scene agar hub.html selalu lengkap.
function composeHub(novelPath, scenes, opts) {
    const ordered = (Array.isArray(scenes) ? scenes.slice() : []).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    const ctx = { scenes: ordered };
    const parts = ordered.map(function (s) {
        const content = readScenePartial(novelPath, s.id);
        return (content != null && content.trim()) ? content.replace(/\s+$/, '') : buildSceneSection(s, ctx);
    });
    atomicWriteFileSync(
        hubFilePath(novelPath, 'hub.html'),
        buildHubDocument(parts.join('\n\n'), opts),
        { encoding: 'utf8' }
    );
    const cssPath = hubFilePath(novelPath, 'hub.css');
    if (!fs.existsSync(cssPath)) atomicWriteFileSync(cssPath, buildHubCss(), { encoding: 'utf8' });
    const jsPath = hubFilePath(novelPath, 'hub.js');
    if (!fs.existsSync(jsPath)) atomicWriteFileSync(jsPath, STARTER_HUB_JS, { encoding: 'utf8' });
}

// Pastikan partial ada. Bila folder hub/scenes belum ada → MIGRASI dari hub.html
// monolith (ekstrak tiap <section> ke partial). Lalu komposit ulang hub.html.
// Idempoten & aman: hub.html hasil komposit identik dengan section semula.
function ensurePartials(novelPath, scenes, opts) {
    const list = Array.isArray(scenes) ? scenes : [];
    let migrated = false;
    let shouldCompose = true;
    const htmlPath = path.join(novelPath, 'hub.html');
    
    if (!partialsDirExists(novelPath)) {
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : '';
        list.forEach(function (s) {
            const extracted = html ? extractSection(html, s.id) : null;
            writeScenePartial(novelPath, s, extracted || buildSceneSection(s));
        });
        migrated = true;
    } else {
        // Cek apakah hub.html dimodifikasi belakangan dibanding partials (misal diedit di VS Code)
        if (fs.existsSync(htmlPath)) {
            const htmlStat = fs.statSync(htmlPath);
            let partialsLatest = 0;
            const dir = partialsDir(novelPath);
            fs.readdirSync(dir).forEach(f => {
                if (f.endsWith('.html')) {
                    const st = fs.statSync(path.join(dir, f));
                    if (st.mtimeMs > partialsLatest) partialsLatest = st.mtimeMs;
                }
            });
            // Jika hub.html lebih baru dari semua partial, sinkronkan ke partial (decompose)
            if (htmlStat.mtimeMs > partialsLatest) {
                const html = fs.readFileSync(htmlPath, 'utf-8');
                list.forEach(function (s) {
                    const sec = extractSection(html, s.id);
                    if (sec) writeScenePartial(novelPath, s, sec);
                });
                console.log('[HubScaffolder] Perubahan eksternal terdeteksi di hub.html. Mengekstrak kembali ke partials.');
                shouldCompose = false; // JANGAN timpa ulang hub.html agar editan custom user (di luar section) tidak hilang!
            }
        }
    }
    
    // Hanya lakukan compose (rebuild) jika bukan karena perubahan eksternal di VS Code
    if (shouldCompose) {
        composeHub(novelPath, list, opts);
    }
    return migrated;
}

// Bridge keamanan (interim B1): saat editor menyimpan hub.html monolith, pecah
// kembali tiap section ke partial-nya. Kita TIDAK komposit ulang hub.html di sini
// karena hub.html sudah berisi versi terbaru dari editor.
function decomposeHubIntoPartials(novelPath, html, scenes, opts) {
    const list = Array.isArray(scenes) ? scenes : [];
    list.forEach(function (s) {
        const sec = extractSection(html, s.id);
        if (sec) writeScenePartial(novelPath, s, sec);
    });
    // Dihapus: composeHub(novelPath, list, opts); 
    // Alasan: menghindari regenerasi struktur default yang menghapus editan custom (mis. <head>)
}

// Snapshot seluruh state code-first (config + semua partial + hub.css/hub.js) untuk
// Undo seragam. hub.css & hub.js disertakan agar penerapan TEMA template (yang
// menimpa keduanya) bisa dibatalkan penuh.
function captureSnapshot(novelPath, config) {
    const partials = {};
    if (partialsDirExists(novelPath)) {
        fs.readdirSync(partialsDir(novelPath)).forEach(function (f) {
            if (/\.html$/.test(f)) partials[f.replace(/\.html$/, '')] = fs.readFileSync(path.join(partialsDir(novelPath), f), 'utf-8');
        });
    }
    const cssPath = hubFilePath(novelPath, 'hub.css');
    const jsPath = hubFilePath(novelPath, 'hub.js');
    return {
        config: JSON.parse(JSON.stringify(config)),
        partials: partials,
        hubCss: fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : null,
        hubJs: fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf-8') : null
    };
}

// Pulihkan dari snapshot: ganti total isi partial dir + config, lalu komposit.
// hub.css/hub.js dipulihkan bila ada di snapshot (mencakup penerapan tema template).
function restoreSnapshot(novelPath, snapshot, opts) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const dir = partialsDir(novelPath);
    const partials = snapshot.partials || {};
    const partialIds = Object.keys(partials);
    const scenes = snapshot.config && Array.isArray(snapshot.config.scenes)
        ? snapshot.config.scenes
        : [];

    // Validasi SELURUH identitas sebelum menghapus state aktif. Tanpa preflight
    // ini satu key snapshot berbahaya memang tidak bisa keluar root, tetapi baru
    // ditolak setelah folder partial lama telanjur dihapus.
    const partialTargets = partialIds.map(function (id) {
        return scenePartialPath(novelPath, id);
    });
    scenes.forEach(function (scene) {
        scenePartialPath(novelPath, scene && scene.id);
    });

    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    partialIds.forEach(function (id, index) {
        atomicWriteFileSync(partialTargets[index], partials[id], { encoding: 'utf8' });
    });
    // Pulihkan tema SEBELUM compose agar composeHub tidak menulis hub.css generik.
    if (typeof snapshot.hubCss === 'string') {
        atomicWriteFileSync(hubFilePath(novelPath, 'hub.css'), snapshot.hubCss, { encoding: 'utf8' });
    }
    if (typeof snapshot.hubJs === 'string') {
        atomicWriteFileSync(hubFilePath(novelPath, 'hub.js'), snapshot.hubJs, { encoding: 'utf8' });
    }
    composeHub(novelPath, scenes, opts);
}

/**
 * Scaffold hub code-first untuk novel BARU: tulis partial per scene lalu komposit
 * hub.html + hub.css. Tidak menimpa bila sudah ada (kecuali opts.overwrite).
 * @returns {{ created: boolean, scenes: Array }}
 */
function scaffoldCodeFirstHub(novelPath, scenes, opts) {
    opts = opts || {};
    const list = (Array.isArray(scenes) && scenes.length) ? scenes : defaultStarterScenes();
    const htmlPath = hubFilePath(novelPath, 'hub.html');
    let created = false;

    if (opts.overwrite || !fs.existsSync(htmlPath)) {
        list.forEach(function (s) { writeScenePartial(novelPath, s); });
        composeHub(novelPath, list, { title: opts.title });
        created = true;
    }
    const cssPath = hubFilePath(novelPath, 'hub.css');
    if (opts.overwrite || !fs.existsSync(cssPath)) {
        atomicWriteFileSync(cssPath, buildHubCss(), { encoding: 'utf8' });
    }
    return { created, scenes: list };
}

// =============================================
// Materialisasi hub "Generated" lama → scaffold code-first
// =============================================
// Peta action menu legacy (node-registry HUB_ACTION_TYPES) → action runtime
// scaffold (vn-hub-runtime.js: start | chapter-select | exit | goto | link | back).
function _mapLegacyMenuItem(item) {
    item = item || {};
    const label = item.label || '';
    switch (item.action) {
        case 'start_game':  return { label: label || 'Mulai', action: 'start' };
        case 'load_chapter': return { label: label || 'Pilih Chapter', action: 'chapter-select' };
        case 'load_save':   return { label: label || 'Muat Permainan', action: 'chapter-select' };
        case 'credits':     return { label: label || 'Kredit', action: 'goto', targetType: 'credits' };
        case 'gallery':     return { label: label || 'Galeri', action: 'gallery' }; // runtime no-op (perluas via kode)
        case 'link':        return { label: label || 'Tautan', action: 'link', href: item.payload || '' };
        case 'exit':        return { label: label || 'Keluar', action: 'exit' };
        default:            return { label: label || (item.action || 'Mulai'), action: 'start' };
    }
}

/**
 * Kompilasi hub-config "Generated" lama (bootSequence/warningScreen/menu/credits)
 * menjadi daftar scene code-first BERISI konten (bukan cuma metadata), siap dibangun
 * jadi <section> oleh buildSceneSection. Ini inti "konversi novel-hub.html → scaffold".
 * @param {object} config
 * @returns {Array<object>}
 */
function compileLegacyConfigToScenes(config) {
    config = config || {};
    const scenes = [];

    const boot = Array.isArray(config.bootSequence) ? config.bootSequence : [];
    boot.forEach(function (b, i) {
        scenes.push({
            id: 'hub_scene_splash_' + (i + 1),
            name: boot.length > 1 ? ('Splash ' + (i + 1)) : DEFAULT_NAME_BY_TYPE.splash,
            type: 'splash', enabled: true, order: ORDER_BY_TYPE.splash + i, render: 'code',
            src: (b && b.src) || '', duration: (b && b.duration) || 3000
        });
    });

    const warn = config.warningScreen;
    if (warn && (warn.enabled === true || (typeof warn.text === 'string' && warn.text.trim() !== ''))) {
        scenes.push({
            id: 'hub_scene_warning', name: DEFAULT_NAME_BY_TYPE.warning, type: 'warning',
            enabled: warn.enabled !== false, order: ORDER_BY_TYPE.warning, render: 'code',
            warningText: warn.text || ''
        });
    }

    const menu = config.menu;
    if (menu && Array.isArray(menu.items) && menu.items.length) {
        scenes.push({
            id: 'hub_scene_main_menu', name: DEFAULT_NAME_BY_TYPE.main_menu, type: 'main_menu',
            enabled: true, order: ORDER_BY_TYPE.main_menu, render: 'code',
            menuActions: menu.items.map(_mapLegacyMenuItem)
        });
    } else {
        // Tidak ada menu → tampilkan layar Info Novel sebagai layar terminal.
        scenes.push({
            id: 'hub_scene_info', name: DEFAULT_NAME_BY_TYPE.info, type: 'info',
            enabled: true, order: ORDER_BY_TYPE.info, render: 'code'
        });
    }

    const credits = config.credits;
    if (credits && Array.isArray(credits.lines) && credits.lines.length) {
        scenes.push({
            id: 'hub_scene_credits', name: DEFAULT_NAME_BY_TYPE.credits, type: 'credits',
            enabled: true, order: ORDER_BY_TYPE.credits, render: 'code',
            creditsLines: credits.lines.map(function (l) {
                return typeof l === 'string' ? l : ((l && l.text) || '');
            }).filter(Boolean)
        });
    }

    return scenes;
}

/**
 * Pastikan novel punya hub LOKAL yang bisa di-boot. Tidak melakukan apa-apa bila
 * `hub.html` atau `index.html` sudah ada. Untuk novel "Generated" lama tanpa file
 * lokal, materialisasi `hub.html` (gaya scaffold code-first) dari hub-config —
 * sehingga engine mem-boot file milik novel itu sendiri, bukan novel-hub.html global.
 * Idempoten & non-destruktif (tidak menimpa file yang sudah ada).
 * @returns {boolean} true bila materialisasi dilakukan.
 */
function ensureLocalHub(novelPath, config, opts) {
    opts = opts || {};
    const htmlPath = path.join(novelPath, 'hub.html');
    const indexPath = path.join(novelPath, 'index.html');
    if (fs.existsSync(htmlPath) || fs.existsSync(indexPath)) return false;

    const scenes = compileLegacyConfigToScenes(config || {});
    scaffoldCodeFirstHub(novelPath, scenes, { title: opts.title, overwrite: false });
    console.log('[HubScaffolder] Materialisasi hub.html (scaffold) untuk novel generated lama di: ' + novelPath);
    return true;
}

// =============================================
// Terapkan FOLDER TEMPLATE (aset/game/hub-templates/<id>/) sebagai hub code-first.
// Membangun scene dari manifest, menulis partial (token tersubstitusi) + hub.css/js
// tema, lalu komposit hub.html. Dipakai bersama oleh editor (hub:apply-code-template-
// folder) DAN create-new-novel (template Hub default). Mengembalikan scene final;
// caller yang menyetel hub-config. `tpl` = hasil hubTemplates.load().
// =============================================
function applyFolderTemplate(novelPath, tpl, opts) {
    opts = opts || {};
    const scenes = (tpl.scenes || []).map(function (s, i) {
        return sceneFromType(s.type, { name: s.name, order: (ORDER_BY_TYPE[s.type] || 90) + i });
    });
    // Peta tipe → id scene pertama bertipe itu (untuk token {{TARGET:type}}).
    const idByType = {};
    scenes.forEach(function (sc) { if (idByType[sc.type] == null) idByType[sc.type] = sc.id; });

    // Ganti total set partial dari berkas template (token disubstitusi).
    const pdir = partialsDir(novelPath);
    if (fs.existsSync(pdir)) fs.rmSync(pdir, { recursive: true, force: true });
    const buildCtx = { scenes };
    scenes.forEach(function (scene, i) {
        const meta = (tpl.scenes && tpl.scenes[i]) || {};
        let markup = hubTemplates.readSceneMarkup(tpl, meta);
        if (markup != null) {
            markup = hubTemplates.substituteTokens(markup, { id: scene.id, name: scene.name, idByType: idByType });
        } else {
            // Berkas scene tak ada → markup generik (tetap konsisten dengan tema CSS).
            const buildScene = Object.assign({}, scene, {
                duration: meta.duration, warningText: meta.text,
                menuActions: meta.actions, creditsLines: meta.lines
            });
            markup = buildSceneSection(buildScene, buildCtx);
        }
        writeScenePartial(novelPath, scene, markup);
    });

    // Salin tema (TIMPA hub.css; hub.js bila template menyediakannya) SEBELUM compose
    // agar composeHub tidak menulis hub.css/hub.js generik.
    const themeCss = hubTemplates.readThemeCss(tpl);
    if (themeCss != null) atomicWriteFileSync(hubFilePath(novelPath, 'hub.css'), themeCss, { encoding: 'utf8' });
    const themeJs = hubTemplates.readThemeJs(tpl);
    if (themeJs != null) atomicWriteFileSync(hubFilePath(novelPath, 'hub.js'), themeJs, { encoding: 'utf8' });

    composeHub(novelPath, scenes, { title: opts.title });
    return scenes;
}

module.exports = {
    CODE_SCENES_FLAG,
    PARTIALS_FLAG,
    ORDER_BY_TYPE,
    DEFAULT_NAME_BY_TYPE,
    defaultNameForType,
    createSceneId,
    sceneFromType,
    buildSceneSection,
    buildHubDocument,
    buildHubHtml,
    buildHubCss,
    insertSceneSection,
    removeSceneSection,
    findSectionRange,
    extractSection,
    syncSceneNameInMarkup,
    readSceneMetaFromMarkup,
    syncSceneBackgroundInMarkup,
    syncSceneEnabledInMarkup,
    partialsDir,
    scenePartialPath,
    partialsDirExists,
    readScenePartial,
    writeScenePartial,
    removeScenePartialFile,
    composeHub,
    ensurePartials,
    decomposeHubIntoPartials,
    captureSnapshot,
    restoreSnapshot,
    defaultStarterScenes,
    scaffoldCodeFirstHub,
    compileLegacyConfigToScenes,
    ensureLocalHub,
    applyFolderTemplate
};
