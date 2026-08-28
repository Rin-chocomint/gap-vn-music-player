// =============================================
// Config Defaults — Single Source of Truth
// Semua default shape untuk novel-meta, hub-config,
// dan playerProfile didefinisikan di sini.
// =============================================

const NOVEL_META_DEFAULTS = {
    title: '',
    storyDesc: '',
    description: '',
    genre: '-',
    author: '-',
    illustrator: '-',
    vnMapper: '-',
    cover: '',
    promotionalVideo: '',
    // Versi NOVEL — punya kreator, bukan punya engine. Sengaja string bebas dan
    // sengaja KOSONG secara default: memberi '-' seperti genre/author akan membuat
    // tiap novel memamerkan versi palsu di Hub, sementara `bindMeta` justru melewati
    // nilai kosong sehingga template menampilkan teks bawaannya sendiri.
    // Engine TIDAK pernah menaikkannya.
    version: '',
    createdAt: null,
    editorState: {
        newNovelOnboarding: {
            createdForId: null,
            shownAt: null
        }
    }
};

// N5 (2026-07-31): `playerTheme`, `dialogueStyle`, `customCSS` DICABUT dari sini.
// Ketiganya kosmetik, dan kosmetik hidup di berkas kreator (`theme.css`), bukan
// di JSON. Menyemainya di default berarti tiap novel baru lahir membawa kunci
// yang tak ada pintunya di editor dan tak dibaca runtime — yatim sejak menit
// pertama. Yang tersisa murni PERILAKU.
const PLAYER_PROFILE_DEFAULTS = {
    spriteSlots: 5,
    restrictions: { autoMode: true, skipMode: true }
};

// Kunci yang boleh ditimpa override chapter (audit I3) — ACUAN KANONIK.
// `restrictions` ditangani terpisah (di-merge, bukan diganti).
// `hidden`/`badge` SENGAJA tidak ada: itu metadata Chapter Select milik tab
// Story, bukan profil player, dan tak boleh bocor ke config efektif.
//
// ⚠ Daftar yang sama diduplikasi di 3 tempat lain yang TAK BISA require file
// ini (proses/dokumen berbeda): vn-player/js/init.js, vn-player/js/vn-player-api.js,
// aset/game/vnModules/editor/playerProfileEditor.js. Sinkronisasinya dijaga
// tests/unit/player-override-keys.test.js — kalau kamu mengubah daftar ini,
// test itu akan gagal sampai ketiganya ikut diperbarui.
//
// Sesudah N5 daftarnya tinggal SATU: override chapter kini hanya soal perilaku.
// Kosmetik per-chapter tetap bisa — lewat `<chapter>/theme.css`, yang justru
// lebih kuat karena bukan pilihan dari daftar tertutup.
const PLAYER_OVERRIDE_KEYS = ['spriteSlots'];

const HUB_CONFIG_DEFAULTS = {
    hubType: 'default',
    hubModeConfirmed: false,
    bootSequence: [],
    warningScreen: {
        enabled: false,
        text: '',
        style: 'default'
    },
    menu: {
        bgm: '',
        layout: '',
        items: [],
        background: { type: '', src: '' }
    },
    chapterConfig: {},
    credits: { lines: [] },
    playerProfile: { ...PLAYER_PROFILE_DEFAULTS }
};

// Operator yang valid untuk set_var
// (mod/min/max/random ditambahkan bersama dukungan var-vs-var; value boleh
// "$namaVar" atau {var:'nama'} untuk merujuk variabel lain)
const VALID_SET_VAR_OPS = ['=', 'set', '+=', 'add', '-=', 'sub', '*=', 'mul', '/=', 'div', '%=', 'mod', 'min', 'max', 'random'];

// Operator yang valid untuk condition
// ('between' inklusif [min,max]; operand boleh "$namaVar" / {var:'nama'})
const VALID_CONDITION_OPS = ['==', '=', '!=', '>', '>=', '<', '<=', 'in', '!in', 'between'];

// Tipe entry yang valid dalam script.json
const VALID_ENTRY_TYPES = ['dialogue', 'scene', 'choice', 'label', 'phase', 'jump', 'set_var', 'custom', 'load_hub_flags'];

// Versi config saat ini (untuk migration detection)
const CURRENT_CONFIG_VERSION = 3;

module.exports = {
    NOVEL_META_DEFAULTS,
    PLAYER_PROFILE_DEFAULTS,
    PLAYER_OVERRIDE_KEYS,
    HUB_CONFIG_DEFAULTS,
    VALID_SET_VAR_OPS,
    VALID_CONDITION_OPS,
    VALID_ENTRY_TYPES,
    CURRENT_CONFIG_VERSION
};
