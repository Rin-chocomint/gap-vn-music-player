// =============================================
// Path Utils — validasi path bersama untuk semua handler IPC.
// SATU-SATUNYA implementasi guard traversal; jangan tulis varian
// baru di modul lain (audit K1/K2/K5: dua strategi berbeda dalam
// satu proyek, salah satunya punya bug prefix "Chapter1" vs "Chapter10").
// =============================================

const path = require('path');

const WINDOWS_RESERVED_COMPONENT = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const INVALID_COMPONENT_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;

function comparablePath(value) {
    const resolved = path.resolve(value);
    // Windows paths are case-insensitive in the application targets. Keeping
    // the comparison case-sensitive there would reject the same directory
    // merely because a caller used different drive/name casing.
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// Path target harus tetap berada di dalam allowedBase (atau sama persis).
// Perbandingan memakai path.sep supaya folder bertetangga yang berbagi
// prefix nama tidak lolos.
function isPathSafe(targetPath, allowedBase) {
    const resolved = comparablePath(targetPath);
    const resolvedBase = comparablePath(allowedBase);
    const basePrefix = resolvedBase.endsWith(path.sep)
        ? resolvedBase
        : resolvedBase + path.sep;
    return resolved.startsWith(basePrefix) || resolved === resolvedBase;
}

/**
 * Memastikan nilai adalah SATU nama file/folder, bukan path bebas.
 *
 * Nilai sengaja tidak di-trim atau dinormalisasi agar nama yang divalidasi
 * sama persis dengan nama yang akhirnya dipakai di filesystem.
 */
function validatePathComponent(value, label = 'Komponen path') {
    const invalid = typeof value !== 'string'
        || value.length === 0
        || value.trim().length === 0
        || value === '.'
        || value === '..'
        || INVALID_COMPONENT_CHARS.test(value)
        || /[. ]$/.test(value)
        || WINDOWS_RESERVED_COMPONENT.test(value);

    if (invalid) {
        const error = new Error(`${label} tidak valid.`);
        error.code = 'INVALID_PATH_COMPONENT';
        throw error;
    }
    return value;
}

/**
 * Resolve child components terhadap satu root yang dipercaya.
 * Semua child harus lolos validatePathComponent sehingga title/chapter tidak
 * pernah diperlakukan sebagai relative/absolute path dari renderer.
 */
function resolvePathWithinRoot(allowedBase, ...components) {
    const safeComponents = components.map((component) => validatePathComponent(component));
    const target = path.resolve(allowedBase, ...safeComponents);
    if (!isPathSafe(target, allowedBase)) {
        const error = new Error('Path target berada di luar root yang diizinkan.');
        error.code = 'PATH_OUTSIDE_ALLOWED_ROOT';
        throw error;
    }
    return target;
}

/**
 * Resolve identitas target player yang dipakai UI.
 *
 * Chapter normal wajib tepat satu komponen. Satu-satunya identitas bertingkat
 * yang sah adalah `SideStories/<nama>` karena itu memang bentuk canonical di UI
 * dan manifest. Menaruh aturan ini di path-utils mencegah resolver CSS, editor
 * kode, dan generator template mengubah slash menjadi underscore secara berbeda.
 */
function resolveNovelChapterPath(visualNovelsRoot, storyTitle, chapter) {
    const novelDir = resolvePathWithinRoot(
        visualNovelsRoot,
        validatePathComponent(storyTitle, 'Nama novel')
    );
    if (!chapter) return { novelDir, chapterDir: null };

    const normalized = String(chapter).replace(/\\/g, '/');
    const parts = normalized.split('/');
    if (parts.length === 2 && parts[0].toLowerCase() === 'sidestories') {
        return {
            novelDir,
            chapterDir: resolvePathWithinRoot(
                novelDir,
                validatePathComponent(parts[0], 'Folder side story'),
                validatePathComponent(parts[1], 'Nama side story')
            )
        };
    }
    if (parts.length !== 1) {
        const error = new Error('Nama chapter tidak valid.');
        error.code = 'INVALID_PATH_COMPONENT';
        throw error;
    }
    return {
        novelDir,
        chapterDir: resolvePathWithinRoot(
            novelDir,
            validatePathComponent(parts[0], 'Nama chapter')
        )
    };
}

module.exports = {
    isPathSafe,
    validatePathComponent,
    resolvePathWithinRoot,
    resolveNovelChapterPath
};
