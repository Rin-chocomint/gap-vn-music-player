// =============================================
// Atomic Writer — commit file tunggal tanpa menimpa target secara parsial.
// Temp file selalu dibuat di direktori target agar rename tetap satu volume.
// =============================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createTempPath(targetPath) {
    const token = crypto.randomBytes(8).toString('hex');
    return path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${token}.tmp`
    );
}

/**
 * Menulis data ke temp, flush, lalu rename ke target.
 *
 * Bila write/fsync/rename gagal, target lama tidak disentuh dan temp dibuang.
 * `fsImpl` tersedia agar fault-injection dapat menguji recovery tanpa IO palsu
 * tersebar ke handler bisnis.
 */
function atomicWriteFileSync(targetPath, data, options = {}) {
    const fsImpl = options.fsImpl || fs;
    const encoding = options.encoding || 'utf8';
    const mode = options.mode === undefined ? 0o666 : options.mode;
    const tempPath = createTempPath(targetPath);
    let descriptor = null;

    try {
        descriptor = fsImpl.openSync(tempPath, 'wx', mode);
        fsImpl.writeFileSync(descriptor, data, { encoding });

        if (typeof fsImpl.fsyncSync === 'function') {
            fsImpl.fsyncSync(descriptor);
        }

        fsImpl.closeSync(descriptor);
        descriptor = null;
        fsImpl.renameSync(tempPath, targetPath);
    } catch (error) {
        if (descriptor !== null) {
            try { fsImpl.closeSync(descriptor); } catch (_) { /* best-effort cleanup */ }
        }
        try {
            if (fsImpl.existsSync(tempPath)) fsImpl.unlinkSync(tempPath);
        } catch (_) { /* jangan menutupi error commit yang asli */ }
        throw error;
    }
}

module.exports = { atomicWriteFileSync };
