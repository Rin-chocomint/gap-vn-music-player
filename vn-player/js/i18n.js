/**
 * VN Player — i18n UI strings (Fase 5b).
 *
 * Melokalkan string ANTARMUKA player (History/Save/Load/Settings/…), TERPISAH
 * dari konten cerita (yang dilokalkan per-file script.<lang>.json oleh engine).
 * Bahasa aktif = setting global engine (VNHub.settings.setLanguage / menu Settings);
 * 'default' dipetakan ke 'id' (Bahasa Indonesia, bahasa dasar aplikasi).
 *
 * Pemakaian di markup: `data-i18n="key"` (isi textContent) dan
 * `data-i18n-title="key"` (isi atribut title). Dipanggil sekali saat init.
 * Kamus 'id' dibake sebagai fallback; en/ja/… dimuat dari vn-player/locales/.
 */
const VNI18n = (() => {
    // Fallback bahasa dasar (id). Selalu tersedia walau file locale gagal dibaca.
    const BASE_ID = {
        backToHubTitle: 'Kembali ke Menu Novel',
        rollbackTitle: 'Mundur satu baris (atau scroll ke atas)',
        auto: 'AUTO',
        selectSlot: 'Pilih Slot',
        saveGame: 'Simpan Permainan',
        loadGame: 'Muat Permainan',
        save: 'Simpan', load: 'Muat', close: 'Tutup', setting: 'Pengaturan', cancel: 'Batal',
        settingsTitle: '⚙️ Pengaturan',
        sectionAudio: ' Audio', volumeBgm: 'Volume BGM', volumeVoice: 'Volume Voice', volumeSfx: 'Volume SFX',
        sectionDisplay: ' Tampilan', fullscreen: 'Mode Fullscreen',
        sectionText: 'Teks', textSpeed: 'Kecepatan Teks', autoDelay: 'Jeda Auto Mode',
        saveBtn: 'Simpan',
        chapterDone: 'Chapter Selesai', nextChapter: 'Chapter Selanjutnya',
        replayChapter: 'Ulangi Chapter', backToMenu: 'Kembali ke Menu',
        emptySlot: 'Slot Kosong', overwriteSlot: 'Timpa slot ini?', noSaveInSlot: 'Tidak ada save di slot ini.',
    };

    let _dict = Object.assign({}, BASE_ID);
    let _lang = 'id';

    function _localesDir() {
        try {
            const path = require('path');
            // player.html dimuat via file:// — turunkan folder dari URL halaman,
            // lalu ../locales relatif ke vn-player/.
            let pathname = decodeURIComponent(new URL(window.location.href).pathname);
            if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1); // Windows: buang '/' depan
            const htmlDir = path.dirname(pathname); // .../vn-player
            return path.join(htmlDir, 'locales');
        } catch (e) { return null; }
    }

    function _loadDict(lang) {
        if (!lang || lang === 'default' || lang === 'id') return Object.assign({}, BASE_ID);
        try {
            const fs = require('fs');
            const path = require('path');
            const dir = _localesDir();
            if (!dir) return Object.assign({}, BASE_ID);
            const p = path.join(dir, lang + '.json');
            if (!fs.existsSync(p)) return Object.assign({}, BASE_ID);
            const loaded = JSON.parse(fs.readFileSync(p, 'utf-8'));
            // Merge di atas BASE_ID → key yang belum diterjemahkan fallback ke id.
            return Object.assign({}, BASE_ID, loaded);
        } catch (e) {
            console.warn('[VNI18n] Gagal memuat locale "' + lang + '":', e.message);
            return Object.assign({}, BASE_ID);
        }
    }

    return {
        /** Set bahasa aktif & muat kamusnya. */
        setLang(lang) {
            _lang = (!lang || lang === 'default') ? 'id' : String(lang);
            _dict = _loadDict(_lang);
            return _lang;
        },
        /** Terjemahkan satu key (fallback: key itu sendiri). */
        t(key) { return Object.prototype.hasOwnProperty.call(_dict, key) ? _dict[key] : key; },
        getLang() { return _lang; },
        /** Terapkan ke semua elemen ber-data-i18n / data-i18n-title di root. */
        applyToDOM(root) {
            root = root || document;
            root.querySelectorAll('[data-i18n]').forEach((el) => {
                el.textContent = this.t(el.getAttribute('data-i18n'));
            });
            root.querySelectorAll('[data-i18n-title]').forEach((el) => {
                el.setAttribute('title', this.t(el.getAttribute('data-i18n-title')));
            });
        },
        /**
         * Muat bahasa aktif dari engine lalu terapkan ke DOM. Dipanggil saat init
         * player. Async (baca setting via IPC), aman diabaikan hasilnya.
         */
        async init() {
            try {
                const { ipcRenderer } = require('electron');
                const lang = await ipcRenderer.invoke('vn-engine:get-language');
                this.setLang(lang);
            } catch (e) {
                this.setLang('id');
            }
            this.applyToDOM(document);
            return _lang;
        },
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = VNI18n;
