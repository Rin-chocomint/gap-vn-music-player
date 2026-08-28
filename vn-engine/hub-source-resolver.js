const path = require('path');
const fs = require('fs');

/**
 * Menentukan renderer Hub yang benar untuk runtime dan preview.
 *
 * PRINSIP (sejak konsolidasi boot): setiap novel SELALU mem-boot file hub-nya
 * SENDIRI di folder novel — `hub.html` (code-first) lalu `index.html` (legacy
 * self-contained). Renderer global `novel-hub.html` TIDAK lagi di-boot langsung;
 * ia hanya jadi fallback defensif terakhir. Untuk novel "generated" lama yang
 * belum punya file lokal, caller memanggil `hubScaffolder.ensureLocalHub()` lebih
 * dulu untuk memmaterialisasi `hub.html` (gaya scaffold code-first), sehingga
 * resolver ini menemukannya di sini.
 *
 * @param {string} novelPath
 * @param {string} globalHubPath  fallback defensif (novel-hub.html global)
 * @param {object} [hubConfig]
 */
function resolveHubSource(novelPath, globalHubPath, hubConfig = {}) {
    const customHubPath = path.join(novelPath, 'hub.html');
    const indexHubPath = path.join(novelPath, 'index.html');
    const confirmed = hubConfig.hubModeConfirmed === true;

    // Prioritas 1: hub.html lokal (code-first) — selalu menang bila ada.
    if (fs.existsSync(customHubPath)) {
        return {
            kind: confirmed ? 'custom' : 'legacy-custom',
            filePath: customHubPath,
            useBridge: true,
            unresolved: !confirmed,
            hasCustomFile: true
        };
    }

    // Prioritas 2: index.html lokal (hub legacy yang membaca folder novelnya sendiri).
    if (fs.existsSync(indexHubPath)) {
        return {
            kind: 'legacy-index',
            filePath: indexHubPath,
            useBridge: false,
            selfContained: true,
            hasCustomFile: false
        };
    }

    // Prioritas 3 (fallback defensif): renderer global. Idealnya tak terpakai karena
    // caller men-materialisasi hub.html lewat ensureLocalHub() lebih dulu.
    return {
        kind: 'generated',
        filePath: globalHubPath,
        useBridge: false,
        needsMaterialize: true,
        hasCustomFile: false
    };
}

module.exports = { resolveHubSource };
