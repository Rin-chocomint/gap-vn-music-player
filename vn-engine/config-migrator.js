// =============================================
// Config Migrator — Migration layer eksplisit
// Deteksi versi config dan migrate field lama
// ke field baru secara eksplisit.
// =============================================

const {
    HUB_CONFIG_DEFAULTS,
    NOVEL_META_DEFAULTS,
    PLAYER_PROFILE_DEFAULTS,
    CURRENT_CONFIG_VERSION
} = require('./config-defaults');

/**
 * Deteksi versi config berdasarkan field _configVersion atau shape
 * @param {object} config - Config object (hub-config atau novel-meta)
 * @returns {number} Versi config yang terdeteksi
 */
function detectConfigVersion(config) {
    if (!config || typeof config !== 'object') return 0;
    if (config._configVersion) return config._configVersion;

    // Heuristik: config tanpa _configVersion = versi 1 (legacy)
    // Config baru (v2) selalu punya _configVersion
    return 1;
}

/**
 * Migrate hub-config.json dari versi lama ke versi terbaru
 * @param {object} rawConfig - Config mentah dari file
 * @returns {{ config: object, migrated: boolean, changes: string[] }}
 */
function migrateHubConfig(rawConfig) {
    if (!rawConfig || typeof rawConfig !== 'object') {
        return {
            config: JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS)),
            migrated: true,
            changes: ['Config kosong, menggunakan defaults']
        };
    }

    const version = detectConfigVersion(rawConfig);
    const changes = [];
    // Deep clone agar tidak mutate input
    const config = JSON.parse(JSON.stringify(rawConfig));

    // ---- Migrasi v1 → v2 ----
    if (version < 2) {
        // Pastikan warningScreen object lengkap
        if (!config.warningScreen || typeof config.warningScreen !== 'object') {
            config.warningScreen = { ...HUB_CONFIG_DEFAULTS.warningScreen };
            changes.push('warningScreen: dibuat dari default');
        } else {
            if (config.warningScreen.style === undefined) {
                config.warningScreen.style = 'default';
                changes.push('warningScreen.style: ditambahkan default "default"');
            }
        }

        // Pastikan menu.background ada
        if (!config.menu) {
            config.menu = JSON.parse(JSON.stringify(HUB_CONFIG_DEFAULTS.menu));
            changes.push('menu: dibuat dari default');
        } else {
            if (!config.menu.background || typeof config.menu.background !== 'object') {
                config.menu.background = { type: '', src: '' };
                changes.push('menu.background: ditambahkan object kosong');
            }
            if (!Array.isArray(config.menu.items)) {
                config.menu.items = [];
                changes.push('menu.items: diinisialisasi sebagai array kosong');
            }
        }

        // Pastikan chapterConfig ada
        if (!config.chapterConfig || typeof config.chapterConfig !== 'object') {
            config.chapterConfig = {};
            changes.push('chapterConfig: diinisialisasi sebagai object kosong');
        }

        // Pastikan credits ada
        if (!config.credits || typeof config.credits !== 'object') {
            config.credits = { lines: [] };
            changes.push('credits: ditambahkan dengan lines kosong');
        } else if (!Array.isArray(config.credits.lines)) {
            config.credits.lines = [];
            changes.push('credits.lines: diinisialisasi sebagai array kosong');
        }

        // Pastikan playerProfile ada dan lengkap
        if (!config.playerProfile || typeof config.playerProfile !== 'object') {
            config.playerProfile = { ...PLAYER_PROFILE_DEFAULTS };
            changes.push('playerProfile: dibuat dari default');
        } else {
            const pp = config.playerProfile;
            // N5: `playerTheme`/`dialogueStyle`/`customCSS` TIDAK lagi disemai.
            // Menyemainya adalah separuh dari kenapa nilai yatim itu ada — migrator
            // MENAMBAHKAN kunci yang tak punya pintu UI, lalu runtime menurutinya.
            // Nilai lama SENGAJA tidak dihapus di sini: menghapus tanpa
            // memindahkannya = kehilangan data senyap (kelas FB18). Yang memindahkan
            // adalah `tools/materialisasi-tema-n5.js`; sampai ia dijalankan, kunci
            // lama hanya menganggur (nol pembaca) dan tetap bisa dimigrasi kapan pun.
            if (pp.spriteSlots === undefined) { pp.spriteSlots = PLAYER_PROFILE_DEFAULTS.spriteSlots; changes.push('playerProfile.spriteSlots: set default'); }
            if (!pp.restrictions || typeof pp.restrictions !== 'object') {
                pp.restrictions = { ...PLAYER_PROFILE_DEFAULTS.restrictions };
                changes.push('playerProfile.restrictions: dibuat dari default');
            }
        }

        // Pastikan bootSequence adalah array
        if (!Array.isArray(config.bootSequence)) {
            config.bootSequence = [];
            changes.push('bootSequence: diinisialisasi sebagai array kosong');
        }

        // Pastikan hubType ada
        if (!config.hubType) {
            config.hubType = 'default';
            changes.push('hubType: set default "default"');
        }
    }

    // ---- Migrasi v2 -> v3 ----
    // Keputusan mode harus dibuat oleh user/auto-detector berdasarkan file
    // lokal; legacy config sengaja belum dikonfirmasi di migrator umum.
    if (version < 3 && typeof config.hubModeConfirmed !== 'boolean') {
        config.hubModeConfirmed = false;
        changes.push('hubModeConfirmed: menunggu keputusan migrasi Hub');
    }

    // Tandai versi terbaru
    config._configVersion = CURRENT_CONFIG_VERSION;

    if (changes.length > 0) {
        console.log(`[ConfigMigrator] Hub config dimigrasikan (v${version} → v${CURRENT_CONFIG_VERSION}):`, changes);
    }

    return {
        config,
        migrated: changes.length > 0,
        changes
    };
}

/**
 * Migrate novel-meta.json dari versi lama ke versi terbaru
 * @param {object} rawMeta - Metadata mentah dari file
 * @returns {{ meta: object, migrated: boolean, changes: string[] }}
 */
function migrateNovelMeta(rawMeta) {
    if (!rawMeta || typeof rawMeta !== 'object') {
        return {
            meta: { ...JSON.parse(JSON.stringify(NOVEL_META_DEFAULTS)), createdAt: new Date().toISOString() },
            migrated: true,
            changes: ['Meta kosong, menggunakan defaults']
        };
    }

    const changes = [];
    const meta = { ...rawMeta };

    // Pastikan semua required fields ada
    if (!meta.title && meta.title !== '') { meta.title = NOVEL_META_DEFAULTS.title; changes.push('title: set empty string'); }
    if (meta.description === undefined) { meta.description = NOVEL_META_DEFAULTS.description; changes.push('description: set default'); }
    if (!meta.genre) { meta.genre = NOVEL_META_DEFAULTS.genre; changes.push('genre: set default "-"'); }
    if (!meta.author) { meta.author = NOVEL_META_DEFAULTS.author; changes.push('author: set default "-"'); }
    if (!meta.illustrator) { meta.illustrator = NOVEL_META_DEFAULTS.illustrator; changes.push('illustrator: set default "-"'); }
    if (!meta.vnMapper) { meta.vnMapper = NOVEL_META_DEFAULTS.vnMapper; changes.push('vnMapper: set default "-"'); }
    if (meta.cover === undefined) { meta.cover = NOVEL_META_DEFAULTS.cover; changes.push('cover: ditambahkan default'); }
    // Media Showcase dibuang 2026-07-21 — sapu sisa field lama saat migrasi.
    if (meta.images !== undefined) { delete meta.images; changes.push('images: field lama dihapus (Media Showcase dibuang)'); }
    if (meta.promotionalVideo === undefined) { meta.promotionalVideo = NOVEL_META_DEFAULTS.promotionalVideo; changes.push('promotionalVideo: ditambahkan default'); }
    // Dicek dengan `=== undefined`, BUKAN falsy: '' adalah nilai sah di sini
    // (novel tanpa versi), jadi cek falsy akan menulis ulang tiap kali migrasi jalan.
    if (meta.version === undefined) { meta.version = NOVEL_META_DEFAULTS.version; changes.push('version: ditambahkan default'); }
    if (!meta.createdAt) { meta.createdAt = new Date().toISOString(); changes.push('createdAt: ditambahkan timestamp'); }
    if (!meta.editorState || typeof meta.editorState !== 'object') {
        meta.editorState = JSON.parse(JSON.stringify(NOVEL_META_DEFAULTS.editorState));
        changes.push('editorState: ditambahkan default');
    } else if (!meta.editorState.newNovelOnboarding || typeof meta.editorState.newNovelOnboarding !== 'object') {
        meta.editorState.newNovelOnboarding = JSON.parse(JSON.stringify(NOVEL_META_DEFAULTS.editorState.newNovelOnboarding));
        changes.push('editorState.newNovelOnboarding: ditambahkan default');
    }

    if (changes.length > 0) {
        console.log(`[ConfigMigrator] Novel meta dimigrasikan:`, changes);
    }

    return {
        meta,
        migrated: changes.length > 0,
        changes
    };
}

module.exports = {
    detectConfigVersion,
    migrateHubConfig,
    migrateNovelMeta,
    CURRENT_CONFIG_VERSION
};
