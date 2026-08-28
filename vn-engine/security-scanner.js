// =============================================
// Rin.js — Security Scanner
// Scan konten novel untuk mendeteksi kode berbahaya
// =============================================

const path = require('path');
const fs = require('fs');

// Pattern untuk mendeteksi kode berbahaya/mencurigakan
const DANGEROUS_PATTERNS = {
    evalUsage: /\beval\s*\(/gi,
    functionConstructor: /new\s+Function\s*\(/gi,
    scriptTags: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
    onEventHandlers: /\bon(click|load|error|mouseover|focus)\s*=/gi,
    externalUrls: /https?:\/\/[^\s"'<>]+/gi,
    requireUsage: /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/gi,
    // `vnapi.ipcRenderer` adalah alias resmi yang disuntikkan engine sendiri
    // (lihat display-controller.js) — dikecualikan agar tak jadi false positive.
    // ipcMain tetap selalu diflag (tak ada alasan sah kode hub/extension menyentuhnya).
    ipcUsage: /(?<!vnapi\.)\bipcRenderer\b|\bipcMain\b/gi,
    fsAccess: /\bfs\.(read|write|unlink|rmdir)/gi,
    shellExec: /child_process|exec\(|spawn\(/gi
};

/**
 * Scan konten script.json untuk mendeteksi kode mencurigakan dan external URLs
 * @param {string} scriptPath - Path ke file script.json
 * @param {string[]} trustedDomains - Daftar domain terpercaya
 */
function scanNovelScript(scriptPath, trustedDomains = []) {
    const warnings = {
        hasCustomJs: false,
        hasDangerousCode: false,
        hasExternalUrls: false,
        externalUrls: [],
        dangerousPatterns: [],
        details: []
    };

    try {
        if (!fs.existsSync(scriptPath)) {
            return { error: 'Script not found', warnings };
        }

        const content = fs.readFileSync(scriptPath, 'utf-8');
        const script = JSON.parse(content);

        script.forEach((entry, index) => {
            const entryStr = JSON.stringify(entry);

            // ===== Presisi scan (2026-07-10) =====
            // Pola kode berbahaya HANYA discan pada field yang benar-benar
            // dieksekusi/di-inject engine: customHtml & htmlContent (di-inject ke DOM)
            // dan specialEvent (konfigurasi efek). Teks cerita/data (dialogue.text,
            // params command custom yang diparse sebagai JSON data, dsb.) BUKAN kode —
            // substring seperti "eval(" di dalam narasi tidak boleh memblokir novel
            // (false positive fatal: modal keamanan muncul di tiap ganti chapter).
            // Scan URL tetap menyeluruh di bawah — itu keputusan izin JARINGAN,
            // bukan deteksi eksekusi kode.
            const executedFields = [];
            if (typeof entry.customHtml === 'string') executedFields.push(entry.customHtml);
            if (typeof entry.htmlContent === 'string') executedFields.push(entry.htmlContent);
            if (entry.specialEvent !== undefined) executedFields.push(JSON.stringify(entry.specialEvent));
            const executedStr = executedFields.join('\n');

            if (executedStr) {
                if (DANGEROUS_PATTERNS.evalUsage.test(executedStr)) {
                    warnings.hasDangerousCode = true;
                    warnings.dangerousPatterns.push({ type: 'eval', index });
                }
                DANGEROUS_PATTERNS.evalUsage.lastIndex = 0;

                if (DANGEROUS_PATTERNS.functionConstructor.test(executedStr)) {
                    warnings.hasDangerousCode = true;
                    warnings.dangerousPatterns.push({
                        type: 'Function constructor',
                        index,
                        entryType: entry.type || 'unknown'
                    });
                }
                DANGEROUS_PATTERNS.functionConstructor.lastIndex = 0;

                if (DANGEROUS_PATTERNS.scriptTags.test(executedStr)) {
                    warnings.hasCustomJs = true;
                    const scriptMatch = executedStr.match(DANGEROUS_PATTERNS.scriptTags);
                    warnings.details.push({
                        type: 'script_tag',
                        index,
                        entryType: entry.type || 'unknown',
                        property: entry.customHtml ? 'customHtml' : (entry.htmlContent ? 'htmlContent' : 'specialEvent'),
                        preview: scriptMatch ? scriptMatch[0].substring(0, 50) + '...' : null
                    });
                }
                DANGEROUS_PATTERNS.scriptTags.lastIndex = 0;

                if (DANGEROUS_PATTERNS.requireUsage.test(executedStr)) {
                    warnings.hasDangerousCode = true;
                    warnings.dangerousPatterns.push({
                        type: 'require()',
                        index,
                        entryType: entry.type || 'unknown'
                    });
                }
                DANGEROUS_PATTERNS.requireUsage.lastIndex = 0;

                if (DANGEROUS_PATTERNS.shellExec.test(executedStr)) {
                    warnings.hasDangerousCode = true;
                    warnings.dangerousPatterns.push({
                        type: 'shell execution',
                        index,
                        entryType: entry.type || 'unknown'
                    });
                }
                DANGEROUS_PATTERNS.shellExec.lastIndex = 0;
            }

            // Cek external URLs
            const urlMatches = entryStr.match(DANGEROUS_PATTERNS.externalUrls);
            if (urlMatches) {
                urlMatches.forEach(url => {
                    const isTrusted = trustedDomains.some(domain => url.includes(domain));
                    if (!isTrusted) {
                        warnings.hasExternalUrls = true;
                        if (!warnings.externalUrls.includes(url)) {
                            warnings.externalUrls.push(url);
                        }
                    }
                });
            }

            if (entry.specialEvent) {
                const seStr = JSON.stringify(entry.specialEvent);
                if (seStr.includes('eval') || seStr.includes('Function(') ||
                    seStr.includes('<script') || seStr.includes('javascript:')) {
                    warnings.hasCustomJs = true;
                    warnings.details.push({
                        type: 'special_event_js',
                        index,
                        entryType: entry.type || 'unknown',
                        property: 'specialEvent',
                        eventType: entry.specialEvent.type || 'unknown'
                    });
                }
            }

            if (entry.customHtml) {
                warnings.hasCustomJs = true;
                warnings.details.push({
                    type: 'custom_html',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'customHtml',
                    preview: entry.customHtml.substring(0, 50) + (entry.customHtml.length > 50 ? '...' : '')
                });
            }

            if (entry.htmlContent) {
                warnings.hasCustomJs = true;
                warnings.details.push({
                    type: 'html_content',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'htmlContent',
                    preview: entry.htmlContent.substring(0, 50) + (entry.htmlContent.length > 50 ? '...' : '')
                });
            }

            if (entry.externalResource) {
                warnings.hasExternalUrls = true;
                if (!warnings.externalUrls.includes(entry.externalResource)) {
                    warnings.externalUrls.push(entry.externalResource);
                }
                warnings.details.push({
                    type: 'external_resource',
                    index,
                    entryType: entry.type || 'unknown',
                    property: 'externalResource',
                    url: entry.externalResource
                });
            }
        });
    } catch (e) {
        console.error(`[Security] Error scanning script ${scriptPath}:`, e.message);
        warnings.error = e.message;
    }

    return warnings;
}

/**
 * Scan seluruh folder novel untuk index.html yang mungkin dimodifikasi
 * @param {string} novelPath - Path ke folder novel
 * @param {string[]} trustedDomains - Daftar domain terpercaya
 */
function scanNovelFolder(novelPath, trustedDomains = []) {
    const warnings = {
        modifiedIndexHtml: false,
        externalResources: [],
        customScripts: []
    };

    try {
        const chapters = fs.readdirSync(novelPath);
        chapters.forEach(chapter => {
            const chapterPath = path.join(novelPath, chapter);
            if (fs.statSync(chapterPath).isDirectory()) {
                // Pindai index.html legacy DAN player.html (Custom Player per-story).
                ['index.html', 'player.html'].forEach(fileName => {
                    const filePath = path.join(chapterPath, fileName);
                    if (!fs.existsSync(filePath)) return;
                    const content = fs.readFileSync(filePath, 'utf-8');

                    const srcMatches = content.match(/src\s*=\s*["']https?:\/\/[^"']+["']/gi);
                    if (srcMatches) {
                        srcMatches.forEach(match => {
                            const url = match.replace(/src\s*=\s*["']/i, '').replace(/["']$/, '');
                            const isTrusted = trustedDomains.some(domain => url.includes(domain));
                            if (!isTrusted && !warnings.externalResources.includes(url)) {
                                warnings.externalResources.push(url);
                            }
                        });
                    }

                    const scriptMatches = content.match(/<script[\s\S]*?>[\s\S]*?<\/script>/gi);
                    if (scriptMatches) {
                        scriptMatches.forEach(script => {
                            if (script.includes('ipcRenderer') && !script.includes('eval')) {
                                // Script boilerplate bawaan player VN, aman
                            } else if (script.length > 100) {
                                warnings.customScripts.push({
                                    chapter,
                                    preview: script.substring(0, 200) + '...'
                                });
                            }
                        });
                    }
                });
            }
        });
    } catch (e) {
        console.error(`[Security] Error scanning novel folder ${novelPath}:`, e.message);
    }

    return warnings;
}

/**
 * Baca metadata kreator dari novel hub index.html
 */
function readNovelMetadata(storyTitle, visualNovelsDirectory) {
    const novelInfo = { author: null, illustrator: null, genre: null, vnMapper: null };
    try {
        const hubPath = path.join(visualNovelsDirectory, storyTitle, 'index.html');
        if (fs.existsSync(hubPath)) {
            const content = fs.readFileSync(hubPath, 'utf-8');

            const authorMatch = content.match(/class="author"[^>]*>([^<]+)</i);
            if (authorMatch) novelInfo.author = authorMatch[1].trim();

            const illustratorMatch = content.match(/class="illustrator"[^>]*>([^<]+)</i);
            if (illustratorMatch) novelInfo.illustrator = illustratorMatch[1].trim();

            const genreMatch = content.match(/class="genre"[^>]*>([^<]+)</i);
            if (genreMatch) novelInfo.genre = genreMatch[1].trim();

            const vnMapperMatch = content.match(/class="vn-mapper"[^>]*>([^<]+)</i);
            if (vnMapperMatch) novelInfo.vnMapper = vnMapperMatch[1].trim();
        }
    } catch (e) {
        console.error('[Security] Error membaca metadata novel:', e.message);
    }
    return novelInfo;
}

/**
 * Build pesan warning dialog dari hasil scan
 */
function buildWarningMessage(scanResult, novelInfo = {}) {
    const { storyTitle, chapter, script, folder } = scanResult;
    let message = `Novel "${storyTitle}" (${chapter}) mengandung konten yang perlu perhatian:\n\n`;
    const concerns = [];

    if (script.hasDangerousCode) {
        let dangerSection = '⚠️ KODE BERBAHAYA TERDETEKSI:\n';
        script.dangerousPatterns.forEach(p => {
            dangerSection += `   • ${p.type} (entry #${p.index + 1}, tipe: ${p.entryType})\n`;
        });
        concerns.push(dangerSection.trim());
    }

    if (script.hasCustomJs) {
        let jsSection = 'Script/HTML Kustom:\n';
        script.details.forEach(d => {
            let detailLine = '';
            switch (d.type) {
                case 'script_tag':
                    detailLine = `   • <script> tag di property "${d.property}" (entry #${d.index + 1})`;
                    break;
                case 'custom_html':
                    detailLine = `   • HTML kustom di "${d.property}" (entry #${d.index + 1})`;
                    if (d.preview) detailLine += `\n     Preview: ${d.preview}`;
                    break;
                case 'html_content':
                    detailLine = `   • HTML content di "${d.property}" (entry #${d.index + 1})`;
                    break;
                case 'special_event_js':
                    detailLine = `   • JS di specialEvent "${d.eventType}" (entry #${d.index + 1})`;
                    break;
                case 'external_resource':
                    detailLine = `   • External resource "${d.url}" (entry #${d.index + 1})`;
                    break;
                default:
                    detailLine = `   • ${d.type} (entry #${d.index + 1})`;
            }
            jsSection += detailLine + '\n';
        });
        concerns.push(jsSection.trim());
    }

    if (script.hasExternalUrls || folder.externalResources.length > 0) {
        let urlSection = 'Akses Internet Eksternal:\n';
        if (script.externalUrls && script.externalUrls.length > 0) {
            urlSection += `   [Dari script.json]\n`;
            script.externalUrls.slice(0, 3).forEach(url => {
                urlSection += `   • ${url}\n`;
            });
            if (script.externalUrls.length > 3) {
                urlSection += `   ... +${script.externalUrls.length - 3} URL lainnya\n`;
            }
        }
        if (folder.externalResources && folder.externalResources.length > 0) {
            urlSection += `   [Dari VN Player HTML]\n`;
            folder.externalResources.slice(0, 3).forEach(url => {
                urlSection += `   • ${url}\n`;
            });
            if (folder.externalResources.length > 3) {
                urlSection += `   ... +${folder.externalResources.length - 3} URL lainnya\n`;
            }
        }
        concerns.push(urlSection.trim());
    }

    if (folder.customScripts.length > 0) {
        concerns.push(`Script kustom di VN Player (${folder.customScripts.length} file)`);
    }

    message += concerns.join('\n\n');
    message += '\n\n─────────────────────────────────\n';

    if (novelInfo.vnMapper) {
        message += `Pastikan kamu mempercayai "${novelInfo.vnMapper}" sebagai mapper visual novel ini sebelum melanjutkan.`;
    } else {
        message += 'Pastikan kamu mempercayai pembuat novel ini sebelum melanjutkan.';
    }

    return message;
}

/**
 * Scan file JS extension individual untuk pola berbahaya.
 * Berbeda dengan scanNovelScript yang scan script.json,
 * ini scan kode JavaScript mentah.
 * @param {string} filePath - Path absolut ke file .js
 * @param {string[]} trustedDomains - Daftar domain terpercaya
 * @returns {{ hasDangerousCode: boolean, hasExternalUrls: boolean, patterns: Object[], urls: string[] }}
 */
function scanExtensionFile(filePath, trustedDomains = []) {
    const result = {
        hasDangerousCode: false,
        hasExternalUrls: false,
        patterns: [],
        urls: []
    };

    try {
        if (!fs.existsSync(filePath)) return result;

        const code = fs.readFileSync(filePath, 'utf-8');

        // Cek setiap pattern berbahaya
        const patternChecks = [
            { name: 'eval', regex: DANGEROUS_PATTERNS.evalUsage },
            { name: 'Function constructor', regex: DANGEROUS_PATTERNS.functionConstructor },
            { name: 'require()', regex: DANGEROUS_PATTERNS.requireUsage },
            { name: 'IPC usage', regex: DANGEROUS_PATTERNS.ipcUsage },
            { name: 'Filesystem access', regex: DANGEROUS_PATTERNS.fsAccess },
            { name: 'Shell execution', regex: DANGEROUS_PATTERNS.shellExec }
        ];

        for (const { name, regex } of patternChecks) {
            regex.lastIndex = 0;
            const matches = code.match(regex);
            if (matches && matches.length > 0) {
                result.hasDangerousCode = true;
                result.patterns.push({
                    type: name,
                    count: matches.length,
                    samples: matches.slice(0, 3)
                });
            }
            regex.lastIndex = 0;
        }

        // Cek external URLs
        DANGEROUS_PATTERNS.externalUrls.lastIndex = 0;
        const urlMatches = code.match(DANGEROUS_PATTERNS.externalUrls);
        if (urlMatches) {
            for (const url of urlMatches) {
                const isTrusted = trustedDomains.some(domain => url.includes(domain));
                if (!isTrusted && !result.urls.includes(url)) {
                    result.hasExternalUrls = true;
                    result.urls.push(url);
                }
            }
        }
        DANGEROUS_PATTERNS.externalUrls.lastIndex = 0;

    } catch (e) {
        console.error(`[Security] Error scanning extension file ${filePath}:`, e.message);
    }

    return result;
}

/**
 * Scan seluruh folder extensions/ untuk file JS berbahaya
 * @param {string} extensionsDir - Path ke folder extensions/
 * @param {string[]} trustedDomains - Daftar domain terpercaya
 * @returns {{ files: Object[], hasAnyDangerousCode: boolean, hasAnyExternalUrls: boolean }}
 */
function scanExtensionsFolder(extensionsDir, trustedDomains = []) {
    const result = { files: [], hasAnyDangerousCode: false, hasAnyExternalUrls: false };

    try {
        if (!fs.existsSync(extensionsDir)) return result;

        const jsFiles = fs.readdirSync(extensionsDir).filter(f => f.endsWith('.js'));

        for (const file of jsFiles) {
            const filePath = path.join(extensionsDir, file);
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;

            const scanResult = scanExtensionFile(filePath, trustedDomains);
            result.files.push({ file, ...scanResult });

            if (scanResult.hasDangerousCode) result.hasAnyDangerousCode = true;
            if (scanResult.hasExternalUrls) result.hasAnyExternalUrls = true;
        }
    } catch (e) {
        console.error(`[Security] Error scanning extensions folder ${extensionsDir}:`, e.message);
    }

    return result;
}

// =============================================
// Lint aset — cek keberadaan file yang dirujuk script.json
// (sprite/background/bgm/sfx/voice). Lint lama (jump/label, di editor)
// tidak menyentuh ini sama sekali — referensi aset yang hilang gagal diam-diam
// saat dimainkan. Lihat docs/elaina-vn-build-findings.md §7 & ddlc-stress-test-findings.md.
// =============================================
const ASSET_FIELDS = ['background', 'video', 'sprite', 'sprite2', 'spriteCenter', 'voice', 'bgm', 'sfx', 'sfxIn', 'sfxOut'];

function _isRemoteOrSentinelAsset(value) {
    if (!value || typeof value !== 'string') return true;
    if (value === 'none') return true; // sentinel bgmStop
    return /^(https?:|data:|blob:)/i.test(value);
}

/**
 * Cek keberadaan file aset (sprite/background/bgm/sfx/voice) yang dirujuk
 * entry-entry script.json satu chapter. Path diresolve relatif ke folder
 * chapter (sama seperti runtime resolveAssetPath) — path berawalan '../'
 * otomatis lolos ke folder novel via path.resolve normal.
 * @param {string} chapterPath - Path absolut folder chapter.
 * @param {Array} scriptData - Array entri script.json.
 * @returns {{ index: number, entryType: string, field: string, value: string }[]} daftar aset hilang
 */
function lintScriptAssets(chapterPath, scriptData) {
    const missing = [];
    if (!Array.isArray(scriptData)) return missing;

    scriptData.forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') return;

        ASSET_FIELDS.forEach((field) => {
            const value = entry[field];
            if (_isRemoteOrSentinelAsset(value)) return;
            const resolved = path.resolve(chapterPath, value);
            if (!fs.existsSync(resolved)) {
                missing.push({ index, entryType: entry.type || 'unknown', field, value });
            }
        });

        if (Array.isArray(entry.charSprites)) {
            entry.charSprites.forEach((cs, csIdx) => {
                if (!cs || _isRemoteOrSentinelAsset(cs.src)) return;
                const resolved = path.resolve(chapterPath, cs.src);
                if (!fs.existsSync(resolved)) {
                    missing.push({ index, entryType: entry.type || 'unknown', field: `charSprites[${csIdx}].src`, value: cs.src });
                }
            });
        }
    });

    return missing;
}

module.exports = {
    DANGEROUS_PATTERNS,
    scanNovelScript,
    scanNovelFolder,
    scanExtensionFile,
    lintScriptAssets,
    scanExtensionsFolder,
    readNovelMetadata,
    buildWarningMessage
};
