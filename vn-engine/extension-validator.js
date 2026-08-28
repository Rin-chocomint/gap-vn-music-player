// =============================================
// Extension Validator
// Validasi manifest extension.json, scan kode JS,
// dan penilaian risiko sebelum extension dimuat.
// =============================================

const path = require('path');
const fs = require('fs');

// ---- Schema & Konstanta ----

const VALID_PERMISSIONS = [
    // Safe tier — operasi standar yang diizinkan tanpa warning
    'effect',       // Register efek visual via VNRegistry
    'transition',   // Register transisi via VNRegistry
    'command',      // Register custom command via VNRegistry
    'hook',         // Register hook via VNRegistry
    'dom',          // Akses DOM (document.createElement, dll)
    'audio',        // Akses VNAudio (playSFX, playBGM, dll)
    'storage',      // Akses localStorage

    // Dangerous tier — membutuhkan persetujuan eksplisit user
    'ipc',          // Akses ipcRenderer (komunikasi ke main process)
    'fs',           // Akses filesystem via require('fs')
    'network'       // Akses fetch / XMLHttpRequest / external URLs
];

const DANGEROUS_PERMISSIONS = ['ipc', 'fs', 'network'];

const VALID_HOOK_POINTS = [
    'player:before-dialogue',
    'player:after-dialogue',
    'player:settings-render',
    'player:before-transition',
    'hub:screen-enter',
    'hub:screen-leave',
    'hub:menu-render'
];

// Pattern untuk mendeteksi penggunaan fitur berbahaya di kode extension
const CODE_PATTERNS = {
    ipc: /\bipcRenderer\b|\bipcMain\b/g,
    fs: /\brequire\s*\(\s*['"]fs['"]\s*\)|\bfs\.\w+/g,
    network: /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|https?:\/\/[^\s"'<>]+/g,
    eval: /\beval\s*\(|\bnew\s+Function\s*\(/g,
    shell: /\bchild_process\b|\bexec\s*\(|\bspawn\s*\(/g,
    require_dangerous: /\brequire\s*\(\s*['"](?:child_process|os|net|http|https|dgram|cluster|vm|crypto)['"]\s*\)/g
};

// ---- Manifest Validation ----

/**
 * Validasi struktur extension.json
 * @param {string} manifestPath - Path absolut ke extension.json
 * @returns {{ valid: boolean, manifest: Object|null, errors: string[] }}
 */
function validateManifest(manifestPath) {
    const result = { valid: false, manifest: null, errors: [] };

    try {
        if (!fs.existsSync(manifestPath)) {
            result.errors.push('extension.json tidak ditemukan');
            return result;
        }

        const raw = fs.readFileSync(manifestPath, 'utf-8');
        let manifest;

        try {
            manifest = JSON.parse(raw);
        } catch (e) {
            result.errors.push(`JSON parse error: ${e.message}`);
            return result;
        }

        // Required fields
        if (!manifest.name || typeof manifest.name !== 'string') {
            result.errors.push('Field "name" wajib (string)');
        }
        if (!manifest.version || typeof manifest.version !== 'string') {
            result.errors.push('Field "version" wajib (string)');
        }
        if (!manifest.main || typeof manifest.main !== 'string') {
            result.errors.push('Field "main" wajib (string) — entry point JS file');
        }

        // Permissions
        if (manifest.permissions) {
            if (!Array.isArray(manifest.permissions)) {
                result.errors.push('"permissions" harus berupa array');
            } else {
                for (const perm of manifest.permissions) {
                    if (!VALID_PERMISSIONS.includes(perm)) {
                        result.errors.push(`Permission tidak dikenal: "${perm}"`);
                    }
                }
            }
        }

        // Hooks (opsional, hanya deklarasi)
        if (manifest.hooks) {
            if (!Array.isArray(manifest.hooks)) {
                result.errors.push('"hooks" harus berupa array');
            } else {
                for (const hook of manifest.hooks) {
                    if (!VALID_HOOK_POINTS.includes(hook)) {
                        result.errors.push(`Hook point tidak dikenal: "${hook}"`);
                    }
                }
            }
        }

        // Effects / Transitions / Commands (opsional, deklarasi nama)
        for (const listField of ['effects', 'transitions', 'commands']) {
            if (manifest[listField]) {
                if (!Array.isArray(manifest[listField])) {
                    result.errors.push(`"${listField}" harus berupa array of string`);
                } else {
                    for (const item of manifest[listField]) {
                        if (typeof item !== 'string') {
                            result.errors.push(`"${listField}" harus berisi string, ditemukan: ${typeof item}`);
                        }
                    }
                }
            }
        }

        // Main file existence check
        if (manifest.main) {
            const dir = path.dirname(manifestPath);
            const mainPath = path.join(dir, manifest.main);
            if (!fs.existsSync(mainPath)) {
                result.errors.push(`File entry point "${manifest.main}" tidak ditemukan`);
            }
        }

        // Path traversal check pada field main
        if (manifest.main && (manifest.main.includes('..') || path.isAbsolute(manifest.main))) {
            result.errors.push(`Field "main" tidak boleh mengandung path traversal atau path absolut`);
        }

        // Extra files (opsional, file tambahan yang ikut dimuat)
        if (manifest.files) {
            if (!Array.isArray(manifest.files)) {
                result.errors.push('"files" harus berupa array of string');
            } else {
                for (const f of manifest.files) {
                    if (typeof f !== 'string') {
                        result.errors.push('"files" harus berisi string');
                    } else if (f.includes('..') || path.isAbsolute(f)) {
                        result.errors.push(`File "${f}" tidak boleh mengandung path traversal atau path absolut`);
                    }
                }
            }
        }

        result.manifest = manifest;
        result.valid = result.errors.length === 0;

    } catch (e) {
        result.errors.push(`Error membaca manifest: ${e.message}`);
    }

    return result;
}

// ---- Code Scanning ----

/**
 * Scan kode JS extension untuk penggunaan fitur berbahaya
 * @param {string} filePath - Path absolut ke file JS
 * @param {string[]} declaredPermissions - Permission yang dideklarasi di manifest
 * @returns {{ clean: boolean, violations: Object[], warnings: Object[] }}
 */
function scanExtensionCode(filePath, declaredPermissions = []) {
    const result = { clean: true, violations: [], warnings: [] };

    try {
        if (!fs.existsSync(filePath)) {
            result.violations.push({ type: 'file_missing', message: `File tidak ditemukan: ${filePath}` });
            result.clean = false;
            return result;
        }

        const code = fs.readFileSync(filePath, 'utf-8');

        // Selalu diblokir — tidak ada permission yang bisa mengizinkan eval/shell
        checkPattern(code, CODE_PATTERNS.eval, 'eval', null, result);
        checkPattern(code, CODE_PATTERNS.shell, 'shell_exec', null, result);
        checkPattern(code, CODE_PATTERNS.require_dangerous, 'dangerous_require', null, result);

        // Permission-gated — violation jika digunakan tapi tidak dideklarasi
        if (!declaredPermissions.includes('ipc')) {
            checkPattern(code, CODE_PATTERNS.ipc, 'ipc', 'ipc', result);
        }
        if (!declaredPermissions.includes('fs')) {
            checkPattern(code, CODE_PATTERNS.fs, 'fs', 'fs', result);
        }
        if (!declaredPermissions.includes('network')) {
            checkPattern(code, CODE_PATTERNS.network, 'network', 'network', result);
        }

        // Warning untuk permission berbahaya yang dideklarasi tapi tetap dicatat
        for (const perm of declaredPermissions) {
            if (DANGEROUS_PERMISSIONS.includes(perm)) {
                result.warnings.push({
                    type: 'dangerous_permission',
                    permission: perm,
                    message: `Extension mendeklarasi permission berbahaya: "${perm}"`
                });
            }
        }

    } catch (e) {
        result.violations.push({ type: 'scan_error', message: e.message });
        result.clean = false;
    }

    return result;
}

/**
 * Helper — check regex pattern dan tambahkan ke violations/warnings
 */
function checkPattern(code, pattern, type, requiredPermission, result) {
    // Reset lastIndex untuk safety
    pattern.lastIndex = 0;
    const matches = code.match(pattern);

    if (matches && matches.length > 0) {
        if (requiredPermission === null) {
            // Selalu diblokir (eval, shell, dangerous require)
            result.violations.push({
                type,
                count: matches.length,
                message: `Penggunaan "${type}" terdeteksi (${matches.length}x) — DIBLOKIR`,
                samples: matches.slice(0, 3).map(m => m.substring(0, 60))
            });
            result.clean = false;
        } else {
            // Permission-gated — violation karena tidak dideklarasi
            result.violations.push({
                type: 'undeclared_usage',
                permission: requiredPermission,
                count: matches.length,
                message: `Menggunakan fitur "${type}" tanpa deklarasi permission "${requiredPermission}"`,
                samples: matches.slice(0, 3).map(m => m.substring(0, 60))
            });
            result.clean = false;
        }
    }

    pattern.lastIndex = 0;
}

// ---- Risk Assessment ----

/**
 * Penilaian risiko gabungan dari manifest + scan code
 * @param {Object} manifest - Manifest yang sudah divalidasi
 * @param {Object} scanResult - Hasil dari scanExtensionCode
 * @returns {{ level: 'safe'|'warning'|'dangerous'|'blocked', reasons: string[] }}
 */
function assessExtensionRisk(manifest, scanResult) {
    const risk = { level: 'safe', reasons: [] };

    // Blocked — ada violation yang tidak bisa ditoleransi
    if (!scanResult.clean) {
        const hasBlockedViolation = scanResult.violations.some(v =>
            v.type === 'eval' || v.type === 'shell_exec' || v.type === 'dangerous_require'
        );

        if (hasBlockedViolation) {
            risk.level = 'blocked';
            risk.reasons = scanResult.violations
                .filter(v => v.type === 'eval' || v.type === 'shell_exec' || v.type === 'dangerous_require')
                .map(v => v.message);
            return risk;
        }

        // Undeclared usage — dangerous tapi user bisa approve
        const undeclaredViolations = scanResult.violations.filter(v => v.type === 'undeclared_usage');
        if (undeclaredViolations.length > 0) {
            risk.level = 'dangerous';
            risk.reasons = undeclaredViolations.map(v => v.message);
            return risk;
        }
    }

    // Warning — permission berbahaya yang dideklarasi
    const dangerousPerms = (manifest.permissions || []).filter(p => DANGEROUS_PERMISSIONS.includes(p));
    if (dangerousPerms.length > 0) {
        risk.level = 'warning';
        risk.reasons = dangerousPerms.map(p => `Membutuhkan permission: "${p}"`);
        return risk;
    }

    // Warnings dari scan
    if (scanResult.warnings.length > 0) {
        risk.level = 'warning';
        risk.reasons = scanResult.warnings.map(w => w.message);
        return risk;
    }

    return risk;
}

// ---- Report Builder ----

/**
 * Bangun laporan user-facing untuk satu extension
 * @param {Object} manifest - Manifest extension
 * @param {Object} scanResult - Hasil scan kode
 * @param {{ level: string, reasons: string[] }} risk - Penilaian risiko
 * @returns {{ name: string, version: string, description: string, risk: string, permissions: string[], details: string }}
 */
function buildExtensionReport(manifest, scanResult, risk) {
    const report = {
        name: manifest.name || 'Unknown',
        version: manifest.version || '?',
        author: manifest.author || 'Unknown',
        description: manifest.description || '',
        risk: risk.level,
        permissions: manifest.permissions || [],
        dangerousPermissions: (manifest.permissions || []).filter(p => DANGEROUS_PERMISSIONS.includes(p)),
        details: ''
    };

    if (risk.level === 'blocked') {
        report.details = `⛔ DIBLOKIR — Kode berbahaya terdeteksi:\n${risk.reasons.map(r => `  • ${r}`).join('\n')}`;
    } else if (risk.level === 'dangerous') {
        report.details = `⚠️ BERBAHAYA — Fitur tidak dideklarasi:\n${risk.reasons.map(r => `  • ${r}`).join('\n')}`;
    } else if (risk.level === 'warning') {
        report.details = `⚡ PERHATIAN — Permission sensitif:\n${risk.reasons.map(r => `  • ${r}`).join('\n')}`;
    } else {
        report.details = '✅ Aman — Semua permission sesuai deklarasi.';
    }

    return report;
}

// ---- Validate Full Extension Folder ----

/**
 * Validasi seluruh folder extensions/ — cari manifest, scan semua file
 * @param {string} extensionsDir - Path ke folder extensions/
 * @returns {{ hasManifest: boolean, manifestValid: boolean, extensions: Object[], summary: Object }}
 */
function validateExtensionsFolder(extensionsDir) {
    const result = {
        hasManifest: false,
        manifestValid: false,
        extensions: [],
        summary: { total: 0, safe: 0, warning: 0, dangerous: 0, blocked: 0, noManifest: 0 }
    };

    if (!fs.existsSync(extensionsDir)) return result;

    // Cek apakah ada extension.json di root folder extensions
    const manifestPath = path.join(extensionsDir, 'extension.json');

    if (fs.existsSync(manifestPath)) {
        result.hasManifest = true;
        const validation = validateManifest(manifestPath);

        if (validation.valid) {
            result.manifestValid = true;
            const manifest = validation.manifest;

            // Scan main file
            const mainPath = path.join(extensionsDir, manifest.main);
            const scanResult = scanExtensionCode(mainPath, manifest.permissions || []);
            const risk = assessExtensionRisk(manifest, scanResult);
            const report = buildExtensionReport(manifest, scanResult, risk);

            result.extensions.push({
                file: manifest.main,
                manifest,
                scan: scanResult,
                risk,
                report
            });

            result.summary.total++;
            result.summary[risk.level]++;

            // Scan file tambahan jika ada
            if (manifest.files && Array.isArray(manifest.files)) {
                for (const extraFile of manifest.files) {
                    const extraPath = path.join(extensionsDir, extraFile);
                    if (fs.existsSync(extraPath) && extraFile.endsWith('.js')) {
                        const extraScan = scanExtensionCode(extraPath, manifest.permissions || []);
                        const extraRisk = assessExtensionRisk(manifest, extraScan);

                        result.extensions.push({
                            file: extraFile,
                            manifest: null, // Extra file, bukan entry point
                            scan: extraScan,
                            risk: extraRisk,
                            report: buildExtensionReport({ ...manifest, name: `${manifest.name}/${extraFile}` }, extraScan, extraRisk)
                        });

                        result.summary.total++;
                        result.summary[extraRisk.level]++;
                    }
                }
            }
        } else {
            // Manifest ada tapi invalid
            result.extensions.push({
                file: 'extension.json',
                manifest: null,
                scan: null,
                risk: { level: 'blocked', reasons: validation.errors },
                report: {
                    name: 'Invalid Manifest',
                    risk: 'blocked',
                    details: `⛔ Manifest tidak valid:\n${validation.errors.map(e => `  • ${e}`).join('\n')}`
                }
            });
            result.summary.total++;
            result.summary.blocked++;
        }
    } else {
        // Tidak ada manifest — scan semua .js sebagai legacy
        const jsFiles = fs.readdirSync(extensionsDir)
            .filter(f => f.endsWith('.js'))
            .sort();

        for (const file of jsFiles) {
            const filePath = path.join(extensionsDir, file);
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;

            const scanResult = scanExtensionCode(filePath, []);
            const fakeManifest = { name: file, version: '?', permissions: [] };
            const risk = assessExtensionRisk(fakeManifest, scanResult);

            result.extensions.push({
                file,
                manifest: null,
                scan: scanResult,
                risk,
                report: buildExtensionReport(
                    { ...fakeManifest, description: 'Legacy extension — tanpa manifest' },
                    scanResult,
                    risk
                )
            });

            result.summary.total++;
            result.summary.noManifest++;
            if (risk.level !== 'safe') result.summary[risk.level]++;
            else result.summary.safe++;
        }
    }

    return result;
}

/**
 * Validasi semua extension folder untuk satu novel (novel-level + semua chapter)
 * @param {string} novelPath - Path ke folder novel
 * @returns {{ novel: Object, chapters: Object[], overallRisk: string }}
 */
function validateNovelExtensions(novelPath) {
    const report = { novel: null, chapters: [], overallRisk: 'safe' };

    // Novel-level extensions
    const novelExtDir = path.join(novelPath, 'extensions');
    if (fs.existsSync(novelExtDir)) {
        report.novel = validateExtensionsFolder(novelExtDir);
        report.novel.label = 'Novel Extensions';
        report.novel.path = novelExtDir;
    }

    // Chapter-level extensions
    try {
        const entries = fs.readdirSync(novelPath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (entry.name === 'extensions' || entry.name === 'sidestories') continue;

            const chapterExtDir = path.join(novelPath, entry.name, 'extensions');
            if (fs.existsSync(chapterExtDir)) {
                const chapterReport = validateExtensionsFolder(chapterExtDir);
                chapterReport.label = `Chapter: ${entry.name}`;
                chapterReport.path = chapterExtDir;
                report.chapters.push(chapterReport);
            }
        }

        // Sidestories
        const sidestoriesDir = path.join(novelPath, 'sidestories');
        if (fs.existsSync(sidestoriesDir)) {
            const ssEntries = fs.readdirSync(sidestoriesDir, { withFileTypes: true });
            for (const ssEntry of ssEntries) {
                if (!ssEntry.isDirectory()) continue;
                const ssExtDir = path.join(sidestoriesDir, ssEntry.name, 'extensions');
                if (fs.existsSync(ssExtDir)) {
                    const ssReport = validateExtensionsFolder(ssExtDir);
                    ssReport.label = `Side Story: ${ssEntry.name}`;
                    ssReport.path = ssExtDir;
                    report.chapters.push(ssReport);
                }
            }
        }
    } catch (e) {
        console.error('[ExtValidator] Error scanning chapter extensions:', e.message);
    }

    // Compute overall risk
    const allFolders = [report.novel, ...report.chapters].filter(Boolean);
    for (const folder of allFolders) {
        if (folder.summary.blocked > 0) { report.overallRisk = 'blocked'; break; }
        if (folder.summary.dangerous > 0 && report.overallRisk !== 'blocked') report.overallRisk = 'dangerous';
        if (folder.summary.warning > 0 && report.overallRisk === 'safe') report.overallRisk = 'warning';
    }

    return report;
}

/**
 * Build pesan warning dialog untuk extension
 */
function buildExtensionWarningMessage(validationReport) {
    const allFolders = [validationReport.novel, ...validationReport.chapters].filter(Boolean);
    let message = '';
    const blockedExts = [];
    const dangerousExts = [];
    const warningExts = [];

    for (const folder of allFolders) {
        for (const ext of folder.extensions) {
            if (ext.risk.level === 'blocked') blockedExts.push({ ...ext, source: folder.label });
            else if (ext.risk.level === 'dangerous') dangerousExts.push({ ...ext, source: folder.label });
            else if (ext.risk.level === 'warning') warningExts.push({ ...ext, source: folder.label });
        }
    }

    if (blockedExts.length > 0) {
        message += '⛔ EXTENSION DIBLOKIR:\n';
        for (const ext of blockedExts) {
            message += `  [${ext.source}] ${ext.file}\n`;
            message += `  ${ext.report.details}\n\n`;
        }
    }

    if (dangerousExts.length > 0) {
        message += '⚠️ EXTENSION BERBAHAYA (fitur tidak dideklarasi):\n';
        for (const ext of dangerousExts) {
            message += `  [${ext.source}] ${ext.file}\n`;
            message += `  ${ext.report.details}\n\n`;
        }
    }

    if (warningExts.length > 0) {
        message += '⚡ PERHATIAN (permission sensitif):\n';
        for (const ext of warningExts) {
            message += `  [${ext.source}] ${ext.file}\n`;
            message += `  Permissions: ${ext.report.dangerousPermissions?.join(', ') || '-'}\n\n`;
        }
    }

    return message.trim();
}

module.exports = {
    VALID_PERMISSIONS,
    DANGEROUS_PERMISSIONS,
    VALID_HOOK_POINTS,
    validateManifest,
    scanExtensionCode,
    assessExtensionRisk,
    buildExtensionReport,
    validateExtensionsFolder,
    validateNovelExtensions,
    buildExtensionWarningMessage
};
