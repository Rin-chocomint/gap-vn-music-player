/**
 * VN Player — Extension Loader
 * Menangani pemuatan CSS theme cascade dan JS extensions secara dinamis.
 * 
 * ============================================================
 * URUTAN CASCADE KANONIK (audit B1/B2) — SATU-SATUNYA acuan.
 * Specificity semuanya setara (:root / selector elemen), jadi
 * yang MENANG = yang dimuat PALING BELAKANG.
 *
 *   1. css/variables.css               baseline engine
 *   2. css/*.css + dialogue-variants   modul engine
 *   3. themes/default/theme.css        <link> statis di player.html
 *   4. <novel>/novel-font.css          font global novel  ← loadCSSCascade()
 *   5. <novel>/theme.css               milik kreator      ← loadCSSCascade()
 *   6. <chapter>/theme.css             milik kreator      ← loadCSSCascade()  ★MENANG
 *
 *   Lapisan 4 (2026-08-23) dibuat editor dari Profil Novel > Tampilan; ia
 *   menyetel `--vn-novel-font` lalu meng-alias `--vn-font-family` ke sana.
 *   Letaknya SENGAJA di depan theme.css kreator: font yang ditulis tangan di
 *   theme.css harus menang atas pilihan dropdown. Berkas yang sama juga
 *   ditautkan `hub.html`, jadi Hub dan Player memakai satu sumber font.
 *   `replace-novel` TIDAK melewatinya — itu aturan tentang theme, bukan font.
 *
 *   Pengecualian eksplisit: theme.css chapter bertanda
 *   `@vn-theme-cascade: replace-novel` melewati lapisan 5. Baseline engine tetap
 *   dimuat. Ini membuat template Default per-chapter benar-benar bisa mengganti
 *   template struktural di novel, bukan menjadi stylesheet kosong di atasnya.
 *
 * ★ N5 (2026-07-31): DUA lapisan dicabut dari daftar ini — `themes/<tema>` yang
 *   dipilih lewat `playerProfile.playerTheme`, dan `profile.customCSS` yang dulu
 *   menang atas segalanya. Keduanya bernilai di JSON, tak terlihat di pohon
 *   berkas, dan sejak D3/D4 TAK PUNYA PINTU UI mana pun — kreator tak bisa
 *   mengubahnya, tapi runtime tetap menurutinya. Isinya dimaterialisasi ke
 *   lapisan 4/5 (`tools/materialisasi-tema-n5.js`).
 *
 *   Akibatnya yang MENANG sekarang selalu berupa BERKAS yang bisa dibuka kreator.
 *   Tak ada lagi "lapisan yang tak kutulis dan tak bisa kulihat".
 * ============================================================
 *
 * JS Extension Loading:
 *   - Novel-level: ../../extensions/*.js (relatif dari chapter/index.html)
 *   - Chapter-level: extensions/*.js (relatif dari chapter/)
 * 
 * Struktur folder novel:
 *   aset/game/visual_novels/{novelTitle}/
 *   ├── theme.css          ← Novel-level theme
 *   ├── extensions/        ← Novel-level JS extensions
 *   │   └── custom-transition.js
 *   └── {chapterName}/
 *       ├── index.html      ← Player (copy dari template)
 *       ├── script.json
 *       ├── theme.css        ← Chapter-level theme override
 *       └── extensions/      ← Chapter-level JS extensions
 *           └── chapter-effect.js
 */

const VNExtensionLoader = (() => {
    const path = require('path');
    const fs = require('fs');
    const { ipcRenderer } = require('electron');

    // Deteksi path folder saat ini (chapter folder) dan novel folder
    let chapterDir = '';
    let novelDir = '';
    let isPlayerContext = false;

    // Tracking extension yang berhasil dimuat
    const loadedExtensions = [];
    // Extension yang diblokir
    const blockedExtensions = [];

    /**
     * Inisialisasi path berdasarkan chapter context dari IPC (Opsi B).
     * Dipanggil setelah VNState.state.basePath diisi oleh init.js.
     */
    function init() {
        try {
            const { state } = VNState;

            // Opsi B: path diambil dari IPC context, bukan window.location
            if (state.basePath) {
                chapterDir = state.basePath;
                novelDir = state.novelPath || path.dirname(chapterDir);
                
                // Validasi: cek novel-meta.json
                const metaPath = path.join(novelDir, 'novel-meta.json');
                isPlayerContext = fs.existsSync(metaPath);
                
                if (isPlayerContext) {
                    console.log(`[ExtLoader] Konteks terdeteksi — Novel: ${path.basename(novelDir)}, Chapter: ${path.basename(chapterDir)}`);
                } else {
                    console.log('[ExtLoader] novel-meta.json tidak ditemukan. Extension loading dilewati.');
                }
            } else {
                // Preview mode: tidak ada chapter context
                console.log('[ExtLoader] Tidak ada chapter context (preview mode). Extension loading dilewati.');
                isPlayerContext = false;
            }
        } catch (e) {
            console.warn('[ExtLoader] Gagal mendeteksi path:', e.message);
            isPlayerContext = false;
        }
    }

    /**
     * Load CSS cascade efektif dari resolver main: novel → chapter, atau hanya
     * chapter ketika marker replacement aktif.
     * File CSS di-inject sebagai <link> di <head>, setelah default theme.
     *
     * B3 (audit): file yang TIDAK ada dilewati — itu normal (theme.css opsional).
     * Yang dulu hilang adalah VISIBILITAS-nya: kreator tak pernah tahu file-nya
     * terbaca atau tidak. Sekarang seluruh hasil resolusi dilaporkan sekali.
     */
    async function loadCSSCascade() {
        if (!isPlayerContext) return;

        let cssFiles;
        let cascadeMode = 'inherit';
        try {
            // Satu resolver untuk runtime, preview editor, dan custom player.
            // Ini membuat marker replacement punya arti yang sama di semua jalur.
            const css = await ipcRenderer.invoke('vn-engine:resolve-effective-css', {
                storyTitle: path.basename(novelDir),
                // `path.basename(chapterDir)` merusak identitas SideStories/<nama>.
                // Relatif ke novel mempertahankan bentuk canonical dua komponen.
                chapter: path.relative(novelDir, chapterDir).replace(/\\/g, '/')
            });
            cascadeMode = (css && css.cascadeMode) || 'inherit';
            cssFiles = [
                { label: 'Novel Theme', href: css && css.novelUrl },
                { label: 'Chapter Theme', href: css && css.chapterUrl }
            ];
        } catch (e) {
            // Host lama/tanpa handler tetap dapat bermain lewat perilaku historis.
            // Jangan menebak replace saat resolver gagal: itu berisiko menghilangkan
            // gaya novel secara senyap.
            console.warn('[ExtLoader] Resolver cascade tidak tersedia; memakai inherit:', e.message);
            cssFiles = [
                { label: 'Novel Theme', path: path.join(novelDir, 'theme.css') },
                { label: 'Chapter Theme', path: path.join(chapterDir, 'theme.css') }
            ];
        }

        // Font global novel — SELALU di depan cascade theme, dan sengaja TIDAK
        // lewat resolver: `replace-novel` berarti "theme chapter menggantikan
        // theme novel", bukan "novel ini berganti font". Kreator yang memang
        // ingin font lain di satu chapter menulisnya di theme.css chapter, yang
        // dimuat SESUDAH ini dan karena itu menang.
        cssFiles.unshift({ label: 'Font Novel', path: path.join(novelDir, 'novel-font.css') });

        const resolved = [];
        cssFiles.forEach(({ label, path: cssPath, href }) => {
            const available = href || (cssPath && fs.existsSync(cssPath));
            if (available) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = href || `file:///${cssPath.replace(/\\/g, '/')}`;
                document.head.appendChild(link);
                resolved.push(`✓ ${label}`);
                VNBus.emit('extension:css-loaded', { label, path: cssPath || href });
            } else {
                const reason = label === 'Novel Theme' && cascadeMode === 'replace-novel'
                    ? 'diganti oleh theme chapter'
                    : 'tidak ada';
                resolved.push(`· ${label} — ${reason}`);
            }
        });
        console.log(`[ExtLoader] Cascade theme.css (${cascadeMode}):\n  ` + resolved.join('\n  '));
    }

    // (applyCustomCSS DICABUT — N5. Satu-satunya sumbernya adalah
    //  `playerProfile.customCSS` di hub-config.json, dan lapisan itu sudah tak ada:
    //  isinya dimaterialisasi ke `theme.css` milik kreator. Membiarkan fungsinya
    //  hidup tanpa penyuap berarti menyimpan pipa mati yang tampak seperti titik
    //  konfigurasi — kelas kebersihan yang sama dengan `--sprite-x`.)

    /**
     * Load JS extensions dari folder novel dan chapter.
     * Flow: manifest check → code scan → permission check → load
     * 
     * Extension yang valid:
     * - Jika ada extension.json: validasi manifest, scan code, cek permission
     * - Jika tidak ada manifest (legacy): scan code, load jika bersih
     * - Extension dengan kode berbahaya (eval, shell) SELALU diblokir
     * - Extension dengan permission berbahaya (ipc, fs, network) butuh approval user
     * 
     * @returns {Promise<void>}
     */
    async function loadJSExtensions() {
        if (!isPlayerContext) return;

        const extensionSources = [
            { label: 'Novel Extension', dir: path.join(novelDir, 'extensions') },
            { label: 'Chapter Extension', dir: path.join(chapterDir, 'extensions') },
        ];

        let totalLoaded = 0;

        for (const { label, dir } of extensionSources) {
            if (!fs.existsSync(dir)) continue;

            const manifestPath = path.join(dir, 'extension.json');
            const hasManifest = fs.existsSync(manifestPath);

            if (hasManifest) {
                // ---- Manifest-based loading ----
                totalLoaded += await loadWithManifest(label, dir, manifestPath);
            } else {
                // ---- Legacy loading (no manifest) ----
                totalLoaded += await loadLegacyExtensions(label, dir);
            }
        }

        if (totalLoaded > 0) {
            console.log(`[ExtLoader] Total ${totalLoaded} JS extension(s) dimuat.`);
        }
        if (blockedExtensions.length > 0) {
            console.warn(`[ExtLoader] ${blockedExtensions.length} extension(s) DIBLOKIR.`);
        }

        VNBus.emit('extension:all-loaded', {
            count: totalLoaded,
            loaded: loadedExtensions,
            blocked: blockedExtensions
        });
    }

    /**
     * Load extension berdasarkan manifest (extension.json)
     * @returns {Promise<number>} Jumlah extension yang berhasil dimuat
     */
    async function loadWithManifest(label, dir, manifestPath) {
        let loaded = 0;

        try {
            // 1. Validasi manifest via IPC (main process)
            const validation = await ipcRenderer.invoke('security:validate-extension-manifest', {
                manifestPath
            });

            if (!validation.valid) {
                console.error(`[ExtLoader] Manifest tidak valid (${label}):`, validation.errors);
                blockedExtensions.push({
                    label,
                    file: 'extension.json',
                    reason: 'invalid_manifest',
                    errors: validation.errors
                });
                VNBus.emit('extension:manifest-invalid', { label, errors: validation.errors });
                return 0;
            }

            const manifest = validation.manifest;
            console.log(`[ExtLoader] Manifest valid: ${manifest.name} v${manifest.version} (${label})`);

            // 2. Scan code via IPC (main process)
            const allFiles = [manifest.main, ...(manifest.files || [])].filter(Boolean);
            let allClean = true;
            let hasDangerousPerms = false;
            const scanReports = [];

            for (const file of allFiles) {
                const filePath = path.join(dir, file);
                const scanResult = await ipcRenderer.invoke('security:scan-extension-file', {
                    filePath,
                    permissions: manifest.permissions || []
                });

                scanReports.push({ file, ...scanResult });

                if (scanResult.risk === 'blocked') {
                    allClean = false;
                    blockedExtensions.push({
                        label,
                        file,
                        reason: 'dangerous_code',
                        details: scanResult.reasons
                    });
                    console.error(`[ExtLoader] ⛔ DIBLOKIR: ${file} (${label}) — kode berbahaya`);
                } else if (scanResult.risk === 'dangerous') {
                    allClean = false;
                    blockedExtensions.push({
                        label,
                        file,
                        reason: 'undeclared_usage',
                        details: scanResult.reasons
                    });
                    console.error(`[ExtLoader] ⚠️ DIBLOKIR: ${file} (${label}) — fitur tidak dideklarasi`);
                }

                if (scanResult.risk === 'warning') {
                    hasDangerousPerms = true;
                }
            }

            if (!allClean) {
                VNBus.emit('extension:blocked', { label, manifest: manifest.name, reports: scanReports });
                return 0;
            }

            // 3. Jika ada permission berbahaya, minta approval user
            if (hasDangerousPerms) {
                const dangerousPerms = (manifest.permissions || []).filter(p =>
                    ['ipc', 'fs', 'network'].includes(p)
                );

                const approved = await ipcRenderer.invoke('security:approve-extension', {
                    name: manifest.name,
                    version: manifest.version,
                    author: manifest.author || 'Unknown',
                    description: manifest.description || '',
                    dangerousPermissions: dangerousPerms
                });

                if (!approved) {
                    console.log(`[ExtLoader] User menolak extension: ${manifest.name}`);
                    blockedExtensions.push({
                        label,
                        file: manifest.main,
                        reason: 'user_rejected',
                        details: [`User menolak permission: ${dangerousPerms.join(', ')}`]
                    });
                    VNBus.emit('extension:rejected', { label, manifest: manifest.name });
                    return 0;
                }
            }

            // 4. Load semua file
            for (const file of allFiles) {
                if (!file.endsWith('.js')) continue;
                const fullPath = path.join(dir, file);

                try {
                    await loadScript(fullPath, `${label}: ${file} [${manifest.name}]`);
                    loaded++;
                    loadedExtensions.push({
                        name: manifest.name,
                        version: manifest.version,
                        file,
                        label,
                        permissions: manifest.permissions || []
                    });
                    VNBus.emit('extension:js-loaded', { label, file, path: fullPath, manifest: manifest.name });
                } catch (e) {
                    console.error(`[ExtLoader] Gagal load '${file}':`, e);
                    VNBus.emit('extension:js-error', { label, file, error: e.message });
                }
            }

        } catch (e) {
            console.error(`[ExtLoader] Error saat memproses manifest (${label}):`, e);
        }

        return loaded;
    }

    /**
     * Load extension legacy (tanpa manifest) — scan code dulu sebelum load
     * @returns {Promise<number>} Jumlah extension yang berhasil dimuat
     */
    async function loadLegacyExtensions(label, dir) {
        let loaded = 0;

        const files = fs.readdirSync(dir)
            .filter(f => f.endsWith('.js'))
            .sort();

        for (const file of files) {
            const fullPath = path.join(dir, file);

            try {
                const stat = fs.statSync(fullPath);
                if (!stat.isFile()) {
                    console.warn(`[ExtLoader] Skip (bukan file): ${file}`);
                    continue;
                }

                // Scan code via IPC — tanpa permission, semua penggunaan berbahaya = violation
                const scanResult = await ipcRenderer.invoke('security:scan-extension-file', {
                    filePath: fullPath,
                    permissions: []
                });

                if (scanResult.risk === 'blocked') {
                    blockedExtensions.push({
                        label,
                        file,
                        reason: 'dangerous_code_legacy',
                        details: scanResult.reasons
                    });
                    console.error(`[ExtLoader] ⛔ Legacy DIBLOKIR: ${file} (${label})`);
                    VNBus.emit('extension:blocked', { label, file, legacy: true });
                    continue;
                }

                if (scanResult.risk === 'dangerous' || scanResult.risk === 'warning') {
                    // Legacy extension tanpa manifest yang menggunakan fitur berbahaya
                    console.warn(`[ExtLoader] ⚡ Legacy warning: ${file} (${label}) — risiko: ${scanResult.risk}`);
                    VNBus.emit('extension:legacy-warning', { label, file, risk: scanResult.risk });
                }

                // Load
                await loadScript(fullPath, `${label}: ${file} [legacy]`);
                loaded++;
                loadedExtensions.push({
                    name: file,
                    version: '?',
                    file,
                    label,
                    permissions: [],
                    legacy: true
                });
                VNBus.emit('extension:js-loaded', { label, file, path: fullPath, legacy: true });

            } catch (e) {
                console.error(`[ExtLoader] Gagal load extension '${file}':`, e);
                VNBus.emit('extension:js-error', { label, file, error: e.message });
            }
        }

        return loaded;
    }

    /**
     * Helper: load satu file JS sebagai script tag
     * @returns {Promise<void>}
     */
    function loadScript(filePath, label) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `file:///${filePath.replace(/\\/g, '/')}`;
            script.onload = () => {
                console.log(`[ExtLoader] ✓ ${label}`);
                resolve();
            };
            script.onerror = (e) => {
                console.error(`[ExtLoader] ✗ ${label}`);
                reject(new Error(`Gagal memuat script: ${filePath}`));
            };
            document.body.appendChild(script);
        });
    }

    /**
     * Jalankan seluruh proses loading extension.
     * Dipanggil dari init.js setelah semua built-in module siap.
     */
    /**
     * Jalankan seluruh cascade CSS + extension dalam SATU tempat.
     *
     * ⚠ Ini satu-satunya pemilik URUTAN cascade di jalur engine (audit B1).
     * Sesudah N5 urutannya jauh lebih pendek: nol lapisan yang nilainya hidup di
     * JSON, jadi tak ada lagi yang bisa mengalahkan berkas kreator tanpa terlihat
     * di pohon berkas.
     */
    async function loadAll() {
        init();
        await loadCSSCascade();
        await loadJSExtensions();
    }

    /**
     * Cek apakah context novel terdeteksi
     */
    function isNovelContext() {
        return isPlayerContext;
    }

    /**
     * Dapatkan info path untuk debugging
     */
    function getPathInfo() {
        return {
            chapterDir,
            novelDir,
            isPlayerContext,
            novelName: isPlayerContext ? path.basename(novelDir) : null,
            chapterName: isPlayerContext ? path.basename(chapterDir) : null,
        };
    }

    return {
        loadAll,
        isNovelContext,
        getPathInfo,
        getLoadedExtensions: () => [...loadedExtensions],
        getBlockedExtensions: () => [...blockedExtensions],
    };
})();
