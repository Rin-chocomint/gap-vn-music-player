/**
 * player-capabilities.js — Kosakata PLAYER dibaca dari kenyataan (audit D8).
 *
 * Editor berhenti memiliki daftar opsi. Modul ini memindai kode player yang
 * BENAR-BENAR akan berjalan dan melaporkan apa yang sungguh terdaftar:
 *
 *   - Bawaan engine   : vn-player/js/transitions.js
 *   - Extension novel : <novel>/extensions/*.js
 *   - Extension chapter: <novel>/<chapter>/extensions/*.js
 *
 * KENAPA memindai `VNRegistry.register(...)` dan BUKAN membaca extension.json:
 * manifest bisa berbohong. Bukti nyata dari Gelombang 2 —
 * `combined_fade_white_to_slide_right` terdaftar rapi tapi ARITY-nya salah;
 * manifest apa pun akan tetap mendeklarasikannya "tersedia". Yang dipindai di
 * sini adalah panggilan registrasi itu sendiri = kenyataan, bukan catatan
 * tentang kenyataan. (Pola yang sama dipakai Gelombang 3 untuk variables.css.)
 *
 * B1/D10 (2026-07-30): modul ini juga melaporkan `getPlayerKind()` — JENIS player
 * yang ter-resolve untuk chapter aktif. Sebabnya, pemindaian di atas memodelkan
 * *cascade extension*, bukan *resolusi player*: untuk engine `custom` kosakata ini
 * belum tentu dibaca siapa pun. Editor memakainya untuk MENANDAI (bukan
 * menyembunyikan) opsi tersebut. Lihat `_scanKind`.
 *
 * Label opsi: transisi BAWAAN memakai anotasi VN.NodeRegistry.C.TRANSITION_UI;
 * transisi dari extension memakai metadata `description` pada argumen ke-4
 * `VNRegistry.register(type, name, handler, { description, author })` —
 * mekanisme yang memang SUDAH ada (lihat vn-player/extensions-example/fade-red.js).
 */
(function () {
    'use strict';

    window.VN = window.VN || {};

    var _cache = { key: null, transitions: [], effects: [], commands: [], anims: [], positions: [], hooks: [], kind: null, vocabUi: {} };

    function _fsMod() { try { return require('fs'); } catch (e) { return null; } }

    // __dirname di renderer editor = aset/game (dokumen vnManager.html).
    function _enginePlayerDir() { return path.join(__dirname, '..', '..', 'vn-player'); }
    function _novelsDir() { return path.join(__dirname, 'visual_novels'); }
    function _vnEngineDir() { return path.join(__dirname, '..', '..', 'vn-engine'); }

    // Resolver player KANONIK — yang SAMA dengan yang dipakai runtime (core.js) dan
    // generator template. Sengaja di-require, BUKAN disalin regexnya: aturan §20 —
    // dua salinan aturan penanda bisa menyimpang dan membuat penandaan berbohong.
    var _resolver;   // undefined = belum dicoba; null = tak tersedia
    function _resolverMod() {
        if (_resolver !== undefined) return _resolver;
        try {
            _resolver = require(path.join(_vnEngineDir(), 'player-source-resolver.js'));
        } catch (e) { _resolver = null; }
        return _resolver;
    }

    function _read(p) {
        var fs = _fsMod();
        try { if (fs && fs.existsSync(p)) return fs.readFileSync(p, 'utf-8'); } catch (e) { /* abaikan */ }
        return '';
    }

    function _listJs(dir) {
        var fs = _fsMod();
        try {
            if (!fs || !fs.existsSync(dir)) return [];
            return fs.readdirSync(dir).filter(function (f) { return /\.js$/i.test(f); })
                .map(function (f) { return path.join(dir, f); });
        } catch (e) { return []; }
    }

    /**
     * Ekstrak transisi terdaftar dari SATU sumber JS.
     * Dibuat public (dipakai test) supaya logikanya bisa diuji tanpa fs.
     * @returns {Array<{name:string, description:string}>}
     */
    /**
     * Ekstrak registrasi bertipe `type` dari SATU sumber JS.
     * Generik untuk seluruh kosakata berbentuk registry: transition/effect/command.
     */
    /**
     * Buang komentar dari sumber KODE (JS maupun HTML) sebelum dipindai.
     *
     * Wajib sejak B2: `player.html` kreator lazim memuat CONTOH registrasi yang
     * sengaja dinonaktifkan — `Real World Nime/player.html` misalnya menyimpan
     * `// VNRegistry.register('transition', 'my_fade', …)` sebagai panduan. Tanpa
     * pembuangan ini, nama contoh itu masuk dropdown sebagai transisi yang TAK ADA
     * — §A persis yang D8 berantas. Kembaran pelajaran §9.2c (parser animasi) dan
     * `tanpaKomentar()` di kontrak smoke.
     *
     * `[^:]` sebelum `//` menjaga URL (`https://…`) tak ikut terpotong.
     */
    function _tanpaKomentarKode(src) {
        return String(src || '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    }

    function parseRegistrations(src, type, source) {
        var out = [];
        if (!src) return out;
        src = _tanpaKomentarKode(src);
        var re = new RegExp("VNRegistry\\.register\\(\\s*['\"]" + type + "['\"]\\s*,\\s*['\"]([\\w-]+)['\"]", 'g');
        var m;
        while ((m = re.exec(src)) !== null) {
            var name = m[1];
            // Cari metadata description milik registrasi INI saja: dibatasi sampai
            // registrasi berikutnya supaya tak "mencuri" deskripsi tetangga.
            var rest = src.slice(re.lastIndex);
            var nextReg = rest.search(/VNRegistry\.register\(/);
            var scope = nextReg >= 0 ? rest.slice(0, nextReg) : rest;
            var d = scope.match(/description\s*:\s*['"]([^'"]+)['"]/);
            // `source` menentukan perlakuan UI: transisi ENGINE tanpa anotasi =
            // handler internal (mis. fade berantai) → sengaja tak ditawarkan ke
            // kreator; transisi EXTENSION selalu ditawarkan. Tanpa penanda ini,
            // keduanya tak bisa dibedakan dan handler internal ikut bocor.
            out.push({ name: name, description: d ? d[1] : '', source: source || 'engine' });
        }
        return out;
    }

    /** Kompat: pemanggil lama & test sumbu transisi. */
    function parseTransitions(src, source) { return parseRegistrations(src, 'transition', source); }

    /**
     * Ekstrak kelas animasi sprite (`.anim-*`) dari SATU sumber CSS (sumbu A, D10).
     *
     * Sumbu ini berbentuk KELAS CSS, bukan `VNRegistry.register` — jadi ia butuh
     * parser, bukan pemindai registrasi. Itu sebabnya ia tertinggal saat sumbu
     * registry digandakan (§10).
     *
     * Komentar CSS di-strip lebih dulu: pelajaran §9.2c (contoh di dalam komentar
     * melahirkan "scene hantu") berlaku sama di sini — kelas hantu adalah kembarannya.
     * Titik di depan `anim-` yang mengikat: ia membatasi cocokan ke SELEKTOR kelas,
     * jadi nama `@keyframes` dan nilai properti `animation:` tak ikut terbaca.
     */
    function parseAnimClasses(src, source) {
        var out = [], seen = {};
        if (!src) return out;
        var clean = String(src).replace(/\/\*[\s\S]*?\*\//g, '');
        var re = /\.(anim-[\w-]+)/g, m;
        while ((m = re.exec(clean)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = true;
            out.push({ name: m[1], source: source || 'engine' });
        }
        return out;
    }

    /**
     * Posisi panggung BERNAMA yang benar-benar ada di CSS (G2 irisan a, sumbu D8 ke-6).
     *
     * Kontraknya sama dengan animasi: nama hidup di CSS sebagai custom property
     * `--vn-pos-<nama>`, runtime menulis `left: var(--vn-pos-<nama>, 50%)` sehingga
     * BROWSER yang me-resolve, dan editor hanya MEMBACA nama yang sama. Satu kebenaran,
     * tiga konsumen — bukan tabel lookup di JS yang harus dijaga sinkron di tiga tempat.
     *
     * Hanya deklarasi (`--vn-pos-x: …`) yang dihitung, bukan pemakaian (`var(--vn-pos-x)`) —
     * kalau pemakaian ikut terbaca, tulisan runtime sendiri akan muncul sebagai "posisi
     * tersedia" dan editor menawarkan nama yang tak pernah dideklarasikan siapa pun.
     */
    function parsePositionVars(src, source) {
        var out = [], seen = {};
        if (!src) return out;
        var clean = String(src).replace(/\/\*[\s\S]*?\*\//g, '');
        var re = /--vn-pos-([\w-]+)\s*:\s*([^;}]+)/g, m;
        while ((m = re.exec(clean)) !== null) {
            var nama = m[1];
            if (seen[nama]) continue;
            seen[nama] = true;
            out.push({ name: nama, value: String(m[2]).trim(), source: source || 'engine' });
        }
        return out;
    }

    /**
     * Titik hook yang BENAR-BENAR dipanggil engine (F5).
     *
     * Sumbernya panggilan `VNRegistry.runHooks('nama', …)` — yaitu tempat engine
     * sungguh-sungguh memberi kesempatan pada extension. Bukan daftar tulisan tangan:
     * scaffold extension pernah menyebut empat hook sementara engine sudah punya lima
     * (`player:end-screen` menyusul bersama Scene API dan daftar itu tak ikut diperbarui).
     * Definisi `runHooks(point, context)` di `registry.js` tak ikut terbaca karena pola
     * ini menuntut nama ber-KUTIP.
     */
    function parseHookPoints(src) {
        var out = [], seen = {};
        if (!src) return out;
        var clean = _tanpaKomentarKode(src);
        var re = /runHooks\(\s*['"]([\w:-]+)['"]/g, m;
        while ((m = re.exec(clean)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = true;
            out.push(m[1]);
        }
        return out;
    }

    function _scanHooks() {
        var out = [], seen = {};
        _listJsIn(path.join(_enginePlayerDir(), 'js')).forEach(function (p) {
            parseHookPoints(_read(p)).forEach(function (h) {
                if (seen[h]) return;
                seen[h] = true;
                out.push(h);
            });
        });
        return out.sort();
    }

    function _listJsIn(dir) { return _listJs(dir); }

    function _listCss(dir) {
        var fs = _fsMod();
        try {
            if (!fs || !fs.existsSync(dir)) return [];
            return fs.readdirSync(dir).filter(function (f) { return /\.css$/i.test(f); })
                .map(function (f) { return path.join(dir, f); });
        } catch (e) { return []; }
    }

    /**
     * Daftar CSS yang BENAR-BENAR dimuat player, urut sesuai cascade.
     * Engine: seluruh modul `vn-player/css/*.css` (bukan cuma sprites.css — supaya
     * kosakata baru di berkas lain ikut terbaca tanpa menyentuh modul ini).
     * Kreator: `theme.css` novel + chapter, dipindai TERAKHIR karena begitulah ia
     * dimuat (dan karena itu ia yang menang saat menimpa nilai engine).
     *
     * SATU sumber untuk kedua pemindai CSS (animasi & posisi bernama) — kalau
     * daftarnya digandakan, satu sumbu bisa membaca berkas yang sumbu lain lewatkan.
     */
    function _cssSources(novelTitle, chapterName) {
        var sources = _listCss(path.join(_enginePlayerDir(), 'css')).map(function (p) {
            return { path: p, source: 'engine' };
        });
        if (novelTitle) {
            var novelDir = path.join(_novelsDir(), novelTitle);
            sources.push({ path: path.join(novelDir, 'theme.css'), source: 'creator' });
            if (chapterName) {
                sources.push({ path: path.join(novelDir, chapterName, 'theme.css'), source: 'creator' });
            }
        }
        return sources;
    }

    /**
     * Kelas animasi yang benar-benar ADA di CSS yang dimuat player.
     * Kreator: animasi buatan sendiri di `theme.css` AKHIRNYA muncul di dropdown,
     * hal yang sebelumnya mustahil.
     */
    function _scanAnims(novelTitle, chapterName) {
        var seen = {}, list = [];
        _cssSources(novelTitle, chapterName).forEach(function (s) {
            parseAnimClasses(_read(s.path), s.source).forEach(function (a) {
                if (seen[a.name]) return;      // engine dipindai lebih dulu → sumbernya menang
                seen[a.name] = true;
                list.push(a);
            });
        });
        return list;
    }

    /**
     * Posisi panggung bernama yang tersedia (G2 irisan a).
     *
     * Beda sengaja dari `_scanAnims`: untuk nama yang SAMA, deklarasi KREATOR menang
     * atas engine — bukan sebaliknya. Alasannya kenyataan cascade: `theme.css` dimuat
     * sesudah CSS engine, jadi kreator yang menulis ulang `--vn-pos-right` memang
     * menggeser panggung. Kalau nilai engine yang ditampilkan, editor akan memberi
     * petunjuk yang bertentangan dengan apa yang dilihat pemain.
     */
    function _scanPositions(novelTitle, chapterName) {
        var idx = {}, list = [];
        _cssSources(novelTitle, chapterName).forEach(function (s) {
            parsePositionVars(_read(s.path), s.source).forEach(function (p) {
                if (idx[p.name] === undefined) {
                    idx[p.name] = list.length;
                    list.push(p);
                } else if (p.source === 'creator') {
                    list[idx[p.name]] = p;     // penimpaan kreator = nilai efektif
                }
            });
        });
        return list;
    }

    /**
     * Player yang BENAR-BENAR akan menjalankan chapter ini, lewat resolver KANONIK
     * (bukan salinan aturannya — §20).
     * @returns {{kind:string, filePath:string}|null}
     */
    function _resolvedPlayer(novelTitle, chapterName) {
        var mod = _resolverMod();
        if (!mod || !novelTitle) return null;
        try {
            var novelDir = path.join(_novelsDir(), novelTitle);
            return mod.resolvePlayerSource(
                path.join(novelDir, chapterName || ''),
                path.join(_enginePlayerDir(), 'player.html'),
                novelDir
            );
        } catch (e) { return null; }
    }

    /**
     * B2 — kosakata yang didaftarkan DI DALAM `player.html` kreator.
     *
     * Lubang terakhir D8: `_scan()` memodelkan cascade extension (`extensions/*.js`),
     * jadi kreator yang menulis `VNRegistry.register(...)` langsung di player-nya
     * sendiri TAK TERLIHAT sama sekali oleh editor — persis "tebing N4" yang D8 ingin
     * balik: fork mestinya MEMPERKAYA editor, bukan membuatnya buta.
     *
     * Dua bentuk sama-sama dipakai novel nyata, jadi keduanya dibaca:
     *   - `<script>` inline           (Elainakyu, Real World Nime)
     *   - `<script src="…">` lokal    (DDLC: bundle.js + ddlc-player.js)
     *
     * `kind === 'global'` dilewati: itu player engine, registrasinya sudah dipindai
     * lewat ENGINE_SOURCES — dan memindainya lagi hanya menduplikasi hasil.
     *
     * Berkas rujukan WAJIB berada di dalam folder novel (atau folder player engine).
     * Tanpa batas itu, `<script src="../../../…">` bisa menyuruh editor membaca
     * berkas sembarang di disk saat kreator sekadar membuka novelnya.
     */
    function _playerSources(novelTitle, chapterName) {
        var res = _resolvedPlayer(novelTitle, chapterName);
        if (!res || !res.filePath || res.kind === 'global') return [];

        var html = _read(res.filePath);
        if (!html) return [];

        var dirPlayer = path.dirname(res.filePath);
        var batas = [path.join(_novelsDir(), novelTitle), _enginePlayerDir()];
        var out = [{ text: html, source: 'player' }];

        var reSrc = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi, m;
        var seenFile = {};
        while ((m = reSrc.exec(html)) !== null) {
            var ref = m[1];
            if (/^[a-z]+:\/\//i.test(ref) || ref.indexOf('//') === 0) continue; // remote → tak dibaca
            var abs;
            try { abs = path.resolve(dirPlayer, ref); } catch (e) { continue; }
            var didalam = batas.some(function (b) { return abs.indexOf(b) === 0; });
            if (!didalam || seenFile[abs]) continue;
            seenFile[abs] = true;
            var isi = _read(abs);
            if (isi) out.push({ text: isi, source: 'player' });
        }
        return out;
    }

    // ============================================================
    // LAPISAN MERGE ANOTASI (§27) — kreator MENAMAI kosakata miliknya
    // ============================================================
    // Editor tetap memegang anotasi BAWAAN sebagai baseline; kreator boleh
    // menimpakan label/grup/`dirs`/`slots` di atasnya. Sengaja MERGE, bukan
    // memindahkan anotasi ke player: fork tanpa peta ini tetap dapat label
    // bawaan, jadi tebing N4 tak lahir kembali dalam bentuk baru.
    //
    // Peta ini HANYA presentasi — daftar apa yang tersedia tetap dari pemindai.
    // Karena itu ia tak bisa berbohong: entri untuk nama yang tak ada bersifat
    // inert (dilaporkan sekali sebagai kemungkinan salah ketik, lihat _warnVocabAsing).
    var VOCAB_UI_FILE = 'vocab-ui.json';
    // Pulau JSON di dalam player.html: menyatu dengan player (co-located) TAPI
    // dibaca JSON.parse — tanpa regex atas literal JS, tanpa menjalankan player.
    var VOCAB_UI_ISLAND = /<script[^>]*\bid\s*=\s*["']vn-vocab-ui["'][^>]*>([\s\S]*?)<\/script>/i;
    var VOCAB_AXES = { transition: 'transitions', effect: 'effects', anim: 'anims', position: 'positions' };

    function _parseVocabUi(teks, asal) {
        if (!teks || !String(teks).trim()) return null;
        try {
            var obj = JSON.parse(teks);
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : null;
        } catch (e) {
            // JSON rusak TIDAK boleh mematikan editor — kosakata tetap tampil
            // dengan label bawaan. §5(c): telan efeknya, jangan telan informasinya.
            console.warn('[VN Capabilities] vocab-ui (' + asal + ') diabaikan, JSON tak valid: ' + e.message);
            return null;
        }
    }

    /** Gabung satu lapis peta ke akumulator. Per-entri DANGKAL (lihat _uiFor). */
    function _gabungVocabUi(akum, tambahan) {
        if (!tambahan) return akum;
        Object.keys(tambahan).forEach(function (sumbu) {
            var peta = tambahan[sumbu];
            if (!peta || typeof peta !== 'object') return;
            if (!akum[sumbu]) akum[sumbu] = {};
            Object.keys(peta).forEach(function (nama) {
                var e = peta[nama];
                if (e === null) { akum[sumbu][nama] = { hidden: true }; return; }  // bentuk singkat
                if (!e || typeof e !== 'object') return;
                akum[sumbu][nama] = Object.assign({}, akum[sumbu][nama], e);
            });
        });
        return akum;
    }

    /**
     * Cascade anotasi kreator, dari yang paling umum ke paling spesifik:
     * `<novel>/vocab-ui.json` → `<chapter>/vocab-ui.json` → pulau JSON di
     * `player.html` yang BERLAKU. Player.html menang karena ia berkas yang
     * benar-benar menjalankan kosakata itu.
     */
    function _scanVocabUi(novelTitle, chapterName) {
        var hasil = {};
        if (!novelTitle) return hasil;
        var novelDir = path.join(_novelsDir(), novelTitle);
        _gabungVocabUi(hasil, _parseVocabUi(_read(path.join(novelDir, VOCAB_UI_FILE)), 'novel'));
        if (chapterName) {
            _gabungVocabUi(hasil, _parseVocabUi(
                _read(path.join(novelDir, chapterName, VOCAB_UI_FILE)), 'chapter'));
        }
        var res = _resolvedPlayer(novelTitle, chapterName);
        if (res && res.filePath && res.kind !== 'global') {
            var m = _read(res.filePath).match(VOCAB_UI_ISLAND);
            if (m) _gabungVocabUi(hasil, _parseVocabUi(m[1], 'player.html'));
        }
        return hasil;
    }

    var _vocabAsingDilapor = {};

    /**
     * Entri yang tak cocok kosakata mana pun = kemungkinan SALAH KETIK. Ia tak
     * berbahaya (inert), tapi diam-diam tak berefek — jadi dilaporkan sekali.
     * Ini menangkap salah ketik, BUKAN salah label: label menyesatkan adalah hak
     * kreator atas berkasnya sendiri, dan memvalidasinya berarti editor kembali
     * berpendapat tentang isi kosakata (justru yang D8 buang).
     */
    function _warnVocabAsing() {
        Object.keys(VOCAB_AXES).forEach(function (sumbu) {
            var peta = _cache.vocabUi[sumbu];
            if (!peta) return;
            var ada = {};
            (_cache[VOCAB_AXES[sumbu]] || []).forEach(function (x) { ada[x.name || x] = true; });
            Object.keys(peta).forEach(function (nama) {
                if (ada[nama]) return;
                var kunci = sumbu + '/' + nama;
                if (_vocabAsingDilapor[kunci]) return;
                _vocabAsingDilapor[kunci] = true;
                console.warn('[VN Capabilities] vocab-ui: "' + nama + '" (' + sumbu +
                    ') tak cocok kosakata mana pun — salah ketik? Entri ini diabaikan.');
            });
        });
    }

    // File engine yang mendaftarkan kosakata bawaan, per tipe.
    var ENGINE_SOURCES = {
        transition: ['js/transitions.js'],
        effect: ['js/effects.js'],
        command: ['js/hub-bridge-commands.js']
    };

    /**
     * Pindai ulang SATU tipe kosakata untuk novel/chapter tertentu.
     * @param {Array} playerSrc hasil _playerSources() — dihitung SEKALI per refresh
     *        lalu dipakai ketiga tipe, supaya `player.html` (dan bundle DDLC yang
     *        ratusan KB) tidak dibaca ulang tiga kali tiap pemindaian.
     */
    function _scan(type, novelTitle, chapterName, playerSrc) {
        var sources = (ENGINE_SOURCES[type] || []).map(function (rel) {
            return { path: path.join(_enginePlayerDir(), rel), source: 'engine' };
        });
        if (novelTitle) {
            var novelDir = path.join(_novelsDir(), novelTitle);
            _listJs(path.join(novelDir, 'extensions')).forEach(function (p) {
                sources.push({ path: p, source: 'extension' });
            });
            if (chapterName) {
                _listJs(path.join(novelDir, chapterName, 'extensions')).forEach(function (p) {
                    sources.push({ path: p, source: 'extension' });
                });
            }
        }
        // B2: player.html kreator dipindai TERAKHIR — engine & extension yang
        // mendaftarkan nama sama tetap menang (aturan "registrasi pertama menang"),
        // jadi player custom tak bisa membajak label kosakata bawaan.
        (playerSrc || []).forEach(function (s) { sources.push(s); });

        var seen = {};
        var list = [];
        sources.forEach(function (s) {
            var teks = (s.text !== undefined) ? s.text : _read(s.path);
            parseRegistrations(teks, type, s.source).forEach(function (t) {
                if (seen[t.name]) return;          // registrasi pertama menang
                seen[t.name] = true;
                list.push(t);
            });
        });
        return list;
    }

    /**
     * Jenis player yang BENAR-BENAR akan menjalankan chapter ini (B1/D10).
     *
     * Kenapa perlu: `_scan()` di atas memodelkan **cascade extension**, bukan
     * **resolusi player** — keduanya berimpit untuk `global`/`engine-shim`, dan
     * MENYIMPANG untuk `custom`. Player custom menggerakkan dirinya sendiri
     * (`set-player-context`), jadi tak ada jaminan ia memakai kosakata engine
     * maupun memuat extension. Tanpa pembeda ini editor menawarkan opsi yang
     * bisa jadi tak berefek — kelas §A.
     *
     * @returns {{kind:string, scope:string}|null} null = TAK DIKETAHUI (mis. tak
     *          ada novel terbuka, atau resolver tak tersedia) → pemanggil WAJIB
     *          memperlakukannya sebagai "jangan tandai" (gagal ke arah aman).
     */
    function _scanKind(novelTitle, chapterName) {
        var res = _resolvedPlayer(novelTitle, chapterName);
        return res ? { kind: res.kind, scope: res.scope } : null;
    }

    /** Pindai ulang SELURUH kosakata (dipanggil otomatis saat novel/chapter ganti). */
    function refresh(novelTitle, chapterName) {
        _cache.key = (novelTitle || '') + '||' + (chapterName || '');
        _cache.at = Date.now();
        var playerSrc = _playerSources(novelTitle, chapterName);   // B2 — dibaca sekali
        _cache.transitions = _scan('transition', novelTitle, chapterName, playerSrc);
        _cache.effects = _scan('effect', novelTitle, chapterName, playerSrc);
        _cache.commands = _scan('command', novelTitle, chapterName, playerSrc);
        _cache.anims = _scanAnims(novelTitle, chapterName);
        _cache.positions = _scanPositions(novelTitle, chapterName);
        _cache.hooks = _scanHooks();
        _cache.kind = _scanKind(novelTitle, chapterName);
        // Anotasi kreator TERAKHIR: seluruh daftar kosakata sudah terisi, jadi
        // entri yang tak cocok nama apa pun bisa langsung dideteksi & dilaporkan.
        _cache.vocabUi = _scanVocabUi(novelTitle, chapterName);
        _warnVocabAsing();
        return _cache;
    }

    // Umur maksimum cache (koreksi audit #6): dulu cache hanya kedaluwarsa saat
    // GANTI novel/chapter, jadi kreator yang menulis registrasi baru di extension
    // novel yang SAMA tak melihatnya di dropdown sampai restart. Pemindaian murah
    // (beberapa readFileSync + regex); TTL pendek menjaga burst render tetap
    // memakai cache tapi hasil edit eksternal muncul dalam hitungan detik.
    var STALE_MS = 4000;

    /** Kedaluwarsakan cache eksplisit (dipanggil editor setelah scaffold/hapus). */
    function invalidate() {
        _cache.key = null;
    }

    /**
     * Lazy + cache ber-key novel/chapter: tak butuh wiring di pemanggil,
     * otomatis segar saat kreator pindah novel/chapter (atau TTL lewat).
     */
    function _get(field) {
        var novel = (window.currentlyEditing && window.currentlyEditing.novel) ||
                    window.currentlyEditingNovel || '';
        var chapter = (window.currentlyEditing && window.currentlyEditing.chapter) || '';
        var key = novel + '||' + chapter;
        // Daftar KOSONG memicu pemindaian ulang (pemanggil pertama bisa datang
        // sebelum fs siap). `kind` sengaja dikecualikan dari aturan itu: null =
        // jawaban sah ("tak diketahui"), bukan cache yang belum terisi — kalau
        // ikut memicu refresh, ia akan memindai ulang di SETIAP akses.
        var val = _cache[field];
        var emptyList = Array.isArray(val) ? !val.length : false;
        if (_cache.key !== key || emptyList ||
            (Date.now() - (_cache.at || 0)) > STALE_MS) refresh(novel, chapter);
        return _cache[field];
    }

    VN.PlayerCapabilities = {
        refresh: refresh,
        invalidate: invalidate,
        getTransitions: function () { return _get('transitions') || []; },
        getEffects: function () { return _get('effects') || []; },
        getCommands: function () { return _get('commands') || []; },
        getSpriteAnims: function () { return _get('anims') || []; },
        getSpritePositions: function () { return _get('positions') || []; },
        getHooks: function () { return _get('hooks') || []; },
        /** Anotasi kosakata milik kreator (§27) — presentasi saja, bukan ketersediaan. */
        getVocabUi: function () { return _get('vocabUi') || {}; },
        /** {kind,scope} player yang menjalankan chapter aktif, atau null bila tak diketahui. */
        getPlayerKind: function () { return _get('kind') || null; },
        // Diekspos untuk test (logika murni, tanpa fs)
        parseRegistrations: parseRegistrations,
        parseTransitions: parseTransitions,
        parseAnimClasses: parseAnimClasses,
        parsePositionVars: parsePositionVars,
        parseHookPoints: parseHookPoints,
        _cache: _cache
    };
})();
