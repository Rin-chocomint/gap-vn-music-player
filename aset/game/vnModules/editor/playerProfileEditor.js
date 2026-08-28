/**
 * playerProfileEditor.js — Player Profile Editor Panel
 * 
 * Panel editor untuk konfigurasi tampilan VN Player:
 *   - Tema & gaya dialog (visual picker)
 *   - CSS Variables override (schema-driven dari NodeRegistry)
 *   - Restriksi mode (auto/skip)
 *   - Integrasi dengan hubConfig.playerProfile
 *
 * Diregistrasi sebagai VN.Workspace view 'player'.
 */
(function () {
    'use strict';

    const _C = VN.NodeRegistry.C;
    const playerProfileWrapper = document.getElementById('player-profile-wrapper');

    // === State reference (diambil dari hubEditor.js via window) ===
    function getHubConfig() {
        return window.hubConfig || null;
    }

    function ensurePlayerProfile() {
        const hc = getHubConfig();
        if (!hc) return null;
        if (!hc.playerProfile) {
            hc.playerProfile = {
                playerTheme: 'default',
                dialogueStyle: 'bottom-bar',
                spriteSlots: 5,
                customCSS: '',
                restrictions: { autoMode: true, skipMode: true }
            };
        }
        return hc.playerProfile;
    }

    // ==========================================
    // DIRTY TRACKING: baseline profil global + override player per-chapter.
    // chapterConfig ikut di-snapshot (audit H1) tapi HANYA kunci player
    // (_PLAYER_OVERRIDE_KEYS) — hidden/badge milik Chapter Select (tab Story),
    // perubahannya bukan urusan titik dirty panel VN Player.
    // ==========================================
    var _playerSavedBaseline = '';

    function _playerStateSnapshot() {
        var pp = ensurePlayerProfile();
        var hc = getHubConfig();
        var overrides = {};
        var cc = (hc && hc.chapterConfig) || {};
        Object.keys(cc).forEach(function (ch) {
            var cfg = cc[ch] || {};
            var proj = {};
            _PLAYER_OVERRIDE_KEYS.forEach(function (k) {
                if (cfg[k] !== undefined) proj[k] = cfg[k];
            });
            if (Object.keys(proj).length) overrides[ch] = proj;
        });
        return JSON.stringify({ profile: pp || null, overrides: overrides });
    }
    function playerMarkClean() {
        _playerSavedBaseline = _playerStateSnapshot();
    }
    function playerConfigIsDirty() {
        return !!_playerSavedBaseline && _playerStateSnapshot() !== _playerSavedBaseline;
    }
    function playerIsDirty() {
        var configDirty = playerConfigIsDirty();
        // Berkas Code/theme.css adalah domain Player juga, tetapi tidak hidup di
        // hub-config. Tanpa ikut dihitung di sini, beforeunload dan navigasi global
        // menganggap editor bersih saat textarea kode masih memiliki draft.
        return configDirty || (typeof _playerCodeIsDirty === 'function' && _playerCodeIsDirty());
    }
    window._playerMarkClean = playerMarkClean;
    window._playerConfigIsDirty = playerConfigIsDirty;
    window._playerIsDirty = playerIsDirty;

    // ==========================================
    // REGISTER WORKSPACE VIEW
    // ==========================================
    VN.Workspace.registerView('player', {
        wrapperEl: playerProfileWrapper,
        onMount: function () {
            var saveBtn = document.getElementById('editor-save-btn');
            if (saveBtn) {
                saveBtn.style.display = 'inline-flex';
                saveBtn.textContent = '💾 Simpan';
            }
            renderPlayerProfilePanel();
            // CATATAN: baseline dirty player TIDAK di-reset di sini. Mereset tiap
            // kali view di-mount akan "melupakan" perubahan yang dibuat lalu user
            // pindah menu & kembali (kini navigasi tak lagi men-discard). Baseline
            // diset sekali saat novel dimuat (loadHubEditorData) & setelah save.
        },
        isDirty: function () {
            return playerIsDirty();
        }
        // (saveChanges/discardChanges dihapus — bukan kontrak registerView, tak
        // pernah dipanggil Workspace; alur simpan nyata = saveAllNovelChanges.
        // Sekalian menutup jebakan laten audit H3: discard lama hanya me-restore
        // playerProfile tanpa chapterConfig.)
    });

    // ==========================================
    // TAB BAR CONTEXT-AWARE dibangun per target aktif.
    // Menggantikan nav .player-nav-btn statis lama. Set tab berbeda untuk
    // Global vs Chapter; tiap tab memetakan ke satu-atau-lebih section lama
    // (konsolidasi Gaya/Kode/Efektif). Rebinding KONTEN per-target (mis. Gaya
    // chapter benar-benar menyunting override chapter itu)
    // berikutnya menegakkan strukturnya dulu.
    // ==========================================
    // TAB "GAYA" DIBUBARKAN (D3). Ia dulu mencampur dua jenis benda (N7): kosmetik
    // (tema, gaya dialog, CSS var) berdampingan dengan perilaku (Auto Mode, Sprite
    // Slots) — padahal nasibnya berlawanan. Kosmetik kini **menyingkir** jadi file
    // lewat Template; perilaku **tetap** config karena tak bisa ditulis dalam CSS.
    //   Template  → dispenser (materialisasi player.html + theme.css, lalu pergi)
    //   Perilaku  → config permukaan cerita (kelak: config scene bertipe 'story')
    //   Kode      → file milik kreator + picker CSS var (kini menyunting theme.css)
    // Tab "Kode" DIPECAH (masukan pengembang: terasa abstrak & kurang terorganisir).
    // Sebabnya ia menjawab DUA pertanyaan berbeda dalam satu napas:
    //   "file apa yang kupunya?"   → Berkas   (theme.css, extensions/, player.html)
    //   "seperti apa rupanya?"     → Tampilan (picker warna + isi theme.css)
    // Persis penyakit tab Gaya, hanya sumbunya berbeda.
    // Tab Tampilan DILEBUR ke Code (keputusan 2026-07-22): kolom kiri Code jadi
    // pengalih FOKUS (Scene ↔ Gaya). css-vars (picker warna) kini salah satu fokus
    // di dalam Code, bukan tab sendiri → tab menyusut. Fokus diatur setCodeFocus().
    var PLAYER_TABS = {
        global: [
            { id: 'template', label: 'Template', sections: ['template'] },
            { id: 'perilaku', label: 'Perilaku', sections: ['restrictions'] },
            { id: 'berkas', label: 'Code', sections: ['code-files', 'css-vars'] }
        ],
        chapter: [
            { id: 'template', label: 'Template', sections: ['template'] },
            { id: 'perilaku', label: 'Perilaku', sections: ['chapter-config'] },
            { id: 'berkas', label: 'Code', sections: ['code-files', 'css-vars'] },
            { id: 'efektif', label: 'Efektif', sections: ['effective-config'] }
        ]
    };
    var _codeFocus = 'scene';   // 'scene' (HTML/JS + navigator) | 'gaya' (picker warna + theme.css)
    var _activePlayerTab = 'template';

    // Jenis player yang BENAR-BENAR menjalankan target aktif ('global' |
    // 'engine-shim' | 'custom'), dilaporkan main lewat chapter-player:status.
    // Panel MEMBACA ini alih-alih berasumsi semua player sejenis (§18) — P0
    // diterapkan pada panel itu sendiri.
    var _activePlayerKind = null;

    /**
     * VIEW MODEL sumber Player untuk target aktif (P2) — jawaban KANONIK dari
     * `player:view-model`, disegarkan tiap kali target berganti atau berkasnya
     * berubah.
     *
     * Sebelum ini panel menjawabnya sendiri: tiga fungsi di bawah membuka `fs`
     * dan meniru urutan `resolvePlayerSource` (chapter → novel → engine). Tiruan
     * itu benar hari ini dan belum tentu besok — dan proyek ini sudah tiga kali
     * membayar untuk aturan yang punya dua penulis. Sekarang aturannya tinggal
     * satu; renderer cuma membaca hasilnya.
     *
     * `null` = belum/gagal diambil. Pembacanya sengaja jatuh ke jawaban paling
     * konservatif (engine Global), bukan menebak dari nama target.
     */
    var _pcViewModel = null;
    window._getPlayerViewModel = function () { return _pcViewModel; };

    // ==========================================
    // UX-B05 — KARTU KEADAAN: DICABUT (20 Agustus 2026)
    // ==========================================
    //
    // Kartu tiga sumbu (Perilaku / Struktur / Tema) pernah hidup di sini.
    // Dicabut atas keputusan user, dan angkanya mendukung: dari 48 target
    // chapter di novel yang ada, 26 (54%) mewarisi semuanya — jadi lebih dari
    // separuh waktu kartunya cuma memberitahu bahwa tak ada yang perlu
    // diberitahukan, sambil memakan ruang dan mengecilkan preview.
    //
    // Yang ia tawarkan ternyata sudah ada rumahnya masing-masing:
    //
    //   struktur — badge scope di status bar preview + note tab Code
    //   tema     — note "Keadaan sekarang" di tab Template
    //   perilaku — switch header + _followGlobalNote() di tab Perilaku
    //   aksi     — aksi berkas (aktif/nonaktif/hapus) sudah di tab Code
    //
    // PERBAIKAN SEBENARNYA bukan kartu ini, melainkan UX-A08: dua permukaan
    // tampilan berhenti dikunci sumbu perilaku, dan kalimat yang berbohong
    // ("Warna & tampilan mengikuti Global") dicabut. Itu tetap berlaku.
    //
    // View model kanonik (`player:view-model`, P2) TETAP dipakai — ia yang
    // menyuplai `_pcResolvedScope`, jenis player, dan note tab Template.

    function _tabsForActiveTarget() {
        var tabs = PLAYER_TABS[_activePlayerTarget === 'global' ? 'global' : 'chapter'];
        // Engine custom (mis. DDLC yang memakai ddlc-player.js) TIDAK membaca
        // profil: Template akan menimpanya, Perilaku tak dihormati. Menampilkan
        // keduanya = opsi yang tak berpengaruh — persis keluhan "opsi tidak
        // relevan". Sisakan yang memang berlaku: berkas kode & perbandingan.
        // 'Tampilan' ikut disembunyikan: picker var mengubah `--vn-*`, dan engine
        // custom tak membacanya. Berkas tetap relevan — file itu tetap milik kreator.
        if (_activePlayerKind === 'custom') {
            return tabs.filter(function (t) { return t.id === 'berkas' || t.id === 'efektif'; });
        }
        return tabs;
    }

    // Banner penjelas — kontrol yang hilang WAJIB punya alasan tertulis,
    // kalau tidak panel terasa rusak, bukan jujur.
    function _renderKindBanner() {
        var host = document.getElementById('player-kind-banner');
        if (!host) return;
        if (_activePlayerKind !== 'custom') { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = '';
        // Istilah diperbaiki 2026-07-30: "memakai engine sendiri" mengklaim lebih dari
        // yang diketahui sistem. Yang benar-benar terdeteksi hanyalah `player.html` yang
        // TIDAK menyatakan memakai engine bawaan (nol `<meta name="vn-player">`) — dan
        // itu bisa berarti engine matang sendiri (DDLC) ATAU berkas yang dibuat tanpa
        // sengaja. Kalimat di bawah menyebut sebabnya, bukan menyimpulkan kemampuannya.
        host.innerHTML =
            '<strong>Target ini tidak memakai engine bawaan</strong> — <code>player.html</code>-nya ' +
            'tak menyatakan diri sebagai shim engine bersama, jadi ia menggerakkan cerita sendiri. ' +
            'Opsi <em>Template</em> &amp; <em>Perilaku</em> disembunyikan karena tak ada jaminan ' +
            'player itu membacanya. Kelola kodenya di tab <strong>Code</strong>, atau hapus ' +
            '<code>player.html</code> target ini untuk kembali memakai engine bawaan.';
    }

    // Tab awal DITENTUKAN KEADAAN BERKAS, bukan konstanta (FB6).
    //
    // Keluhan aslinya: membuka panel selalu disambut dispenser Template — rak pilihan —
    // padahal memilih template itu urusan SEKALI, dan preview di sebelahnya sudah
    // menampilkan playernya. Tapi default tetap 'berkas' juga salah: untuk target yang
    // BELUM punya `player.html`, tab Code hanya menampilkan berkas yang bukan tulisan
    // kreator. Jadi jawabannya bukan memilih salah satu sisi, melainkan membaca
    // kenyataan — `kind` sudah dihitung resolver yang sama dengan runtime (§21):
    //   belum ada berkas (global) → Template (memang ada yang perlu dipilih)
    //   sudah ada berkas          → Code (langsung ke pekerjaannya)
    // Ini P0 diterapkan pada pemilihan tab.
    function _tabAwalMenurutBerkas() {
        return _activePlayerKind === 'global' ? 'template' : 'berkas';
    }

    // Pilihan tab MANUAL tak boleh ditimpa default. Di-reset saat target berganti,
    // karena saat itu default memang harus berlaku lagi.
    var _tabDipilihManual = false;

    // Ambil view model dari main, lalu bangun ulang tab bar sesuai kenyataan.
    // Namanya tetap `_refreshPlayerKind` karena itulah kontraknya bagi pemanggil:
    // "segarkan pengetahuan panel tentang target ini". Yang berubah cuma
    // sumbernya — satu IPC yang menjawab ketiga sumbu sekaligus (P2), bukan
    // `chapter-player:status` yang hanya tahu sumbu struktur.
    function _refreshPlayerKind() {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) {
            _activePlayerKind = null; _pcViewModel = null;
            _renderKindBanner();
            return Promise.resolve();
        }
        var requestedTarget = _activePlayerTarget;
        var chapter = requestedTarget === 'global' ? '' : requestedTarget;
        return ipcRenderer.invoke('player:view-model', { storyTitle: novel, chapter: chapter })
            .then(function (st) {
                if (novel !== (window.currentlyEditingNovel || '') || requestedTarget !== _activePlayerTarget) return;
                _pcViewModel = (st && st.success) ? st : null;
                _activePlayerKind = _pcViewModel ? _pcViewModel.playerKind : null;
                _renderKindBanner();
                renderPlayerTabBar();
                // FB6: baru DI SINI keadaan berkas diketahui, jadi di sinilah tab awal
                // ditentukan — kecuali kreator sudah memilih sendiri untuk target ini.
                if (!_tabDipilihManual) _activePlayerTab = _tabAwalMenurutBerkas();
                // Tab aktif bisa jadi tak tersedia untuk kind ini (mis. `custom` tak
                // punya Template) — penyaringan §21 tetap yang terakhir memutuskan.
                var tersedia = _tabsForActiveTarget().map(function (t) { return t.id; });
                if (tersedia.indexOf(_activePlayerTab) === -1) _activePlayerTab = tersedia[0];
                showPlayerTab(_activePlayerTab);
            }).catch(function () { _activePlayerKind = null; _pcViewModel = null; });
    }

    function showPlayerTab(tabId) {
        var tabs = _tabsForActiveTarget();
        var spec = tabs.filter(function (t) { return t.id === tabId; })[0] || tabs[0];
        _activePlayerTab = spec.id;

        document.querySelectorAll('#player-tab-bar .player-nav-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.tabId === spec.id);
        });

        // Hanya section milik tab ini yang tampil (bisa >1 → tersusun vertikal).
        document.querySelectorAll('.player-section').forEach(function (sec) {
            sec.style.display = 'none';
            sec.classList.remove('active');
        });

        // Tab Code = code-files + css-vars digabung; kolom kiri jadi pengalih FOKUS
        // (Scene ↔ Gaya). setCodeFocus mengatur section + kolom kanan + split grid,
        // jadi jangan pakai mekanisme show-section biasa untuk kedua section itu.
        var isCodeTab = spec.sections.indexOf('code-files') !== -1;
        var switcher = document.getElementById('pc-focus-switcher');

        if (isCodeTab) {
            if (switcher) switcher.style.display = '';
            renderCodeFocusSwitcher();          // sesuaikan visibilitas tombol Gaya (kind custom)
            setCodeFocus(_codeFocus);           // menampilkan section + wrap + render sesuai fokus
        } else {
            if (switcher) switcher.style.display = 'none';
            spec.sections.forEach(function (sid) {
                var el = document.getElementById('player-section-' + sid);
                if (el) { el.style.display = 'block'; el.classList.add('active'); }
            });
            var split = document.querySelector('.player-preview-split');
            if (split) { split.classList.remove('has-css-editor'); split.classList.remove('has-code-editor'); }
            var cssWrap = document.getElementById('pp-custom-css-wrap');
            var codeWrap = document.getElementById('pp-code-editor-wrap');
            if (cssWrap) cssWrap.style.display = 'none';
            if (codeWrap) codeWrap.style.display = 'none';
        }

        if (spec.sections.indexOf('template') !== -1) renderTemplateSection();
        if (spec.sections.indexOf('chapter-config') !== -1) renderChapterGaya();
        if (spec.sections.indexOf('effective-config') !== -1) renderEffectiveForActiveTarget();
    }
    window.showPlayerTab = showPlayerTab;

    function renderPlayerTabBar() {
        var bar = document.getElementById('player-tab-bar');
        if (!bar) return;
        var tabs = _tabsForActiveTarget();
        // Select-first: memilih target = mulai dari tab pertama. renderPlayerTabBar hanya
        // dipanggil saat target (re)dipilih, jadi reset itu tepat. Tab awal DIPERBAIKI
        // lagi begitu `kind` diketahui — lihat _tabAwalMenurutBerkas() (FB6).
        _activePlayerTab = tabs[0].id;
        bar.innerHTML = '';
        tabs.forEach(function (t) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'player-nav-btn' + (t.id === _activePlayerTab ? ' active' : '');
            btn.dataset.tabId = t.id;
            btn.textContent = t.label;
            bar.appendChild(btn);
        });
        showPlayerTab(_activePlayerTab);
    }
    window.renderPlayerTabBar = renderPlayerTabBar;

    // Delegasi klik tab (sekali) — kontainer statis, isinya rebuilt per target.
    (function initTabBarDelegation() {
        var bar = document.getElementById('player-tab-bar');
        if (!bar) return;
        bar.addEventListener('click', function (e) {
            var btn = e.target.closest('.player-nav-btn');
            if (!btn || !bar.contains(btn)) return;
            // Klik = pilihan MANUAL → default FB6 berhenti menimpanya untuk target ini.
            _tabDipilihManual = true;
            showPlayerTab(btn.dataset.tabId);
        });
    })();

    // ==========================================
    // TARGET LIST select-first: pilih Global / 📄 chapter
    // dulu, baru konfigurasi. Struktur meniru sidebar Story (pilih dulu,
    // lalu edit). Daftar chapter diturunkan dari cerita yang sudah ditulis.
    //
    // hanya membangun sidebar target + state + auto-select Global.
    // Konten tab BELUM di-rebind per target state
    // `_activePlayerTarget` disimpan
    // ==========================================
    var _activePlayerTarget = 'global'; // 'global' | '<namaChapter>'
    window._getActivePlayerTarget = function () { return _activePlayerTarget; };

    /**
     * Satu baris target di sidebar — DUA SUMBU, tanpa emoji.
     *
     * Sumbu BERKAS (`player.html`/`theme.css` milik target ini) dan sumbu PERILAKU
     * (override `spriteSlots`/`restrictions` di hub-config) bisa berbeda secara SAH:
     * chapter boleh punya markup sendiri sambil mengikuti perilaku Global. Sampai
     * sekarang baris ini hanya menampilkan sumbu perilaku, sehingga 18 chapter yang
     * punya berkasnya sendiri — termasuk seluruh 13 chapter DDLC yang ber-engine
     * kustom — tertulis "Ikut Global". Label yang salah, dan bertentangan dengan
     * badge scope di preview yang menampilkan sumbu berkas.
     *
     * Penandanya CSS (garis tepi + titik lewat `data-berkas`), bukan emoji: baris
     * ini sempit dan glyph memakan ruang yang lebih berguna untuk teks keadaan.
     *
     * @param {'punya'|'nonaktif'|'ikut'} berkas keadaan sumbu berkas
     */
    function _makeTargetItem(id, berkas, label, sub, hasOverride) {
        var item = document.createElement('button');
        item.type = 'button';
        item.className = 'player-target-item' + (id === 'global' ? ' player-target-global' : '');
        if (hasOverride) item.classList.add('has-override');
        item.dataset.target = id;
        if (berkas) item.dataset.berkas = berkas;

        var main = document.createElement('span');
        main.className = 'pt-main';
        var nm = document.createElement('span');
        nm.className = 'pt-name';
        nm.textContent = label;
        var sb = document.createElement('span');
        sb.className = 'pt-sub';
        sb.textContent = sub;
        main.appendChild(nm);
        main.appendChild(sb);

        item.appendChild(main);
        return item;
    }

    // Keadaan berkas per target — diisi `player-code:scope-map` (sumbu BERKAS).
    // Kosong = belum terbaca; baris tetap tampil, hanya tanpa keterangan berkas,
    // supaya sidebar tak pernah menunggu IPC untuk bisa dipakai.
    var _scopeMap = null;

    /** Ringkas keadaan berkas satu target jadi salah satu dari tiga kata. */
    function _berkasState(entry) {
        if (!entry) return 'ikut';
        if (entry.player === 'aktif' || entry.theme === 'aktif') return 'punya';
        if (entry.player === 'nonaktif' || entry.theme === 'nonaktif') return 'nonaktif';
        return 'ikut';
    }

    /** Teks sumbu berkas — apa adanya, tanpa menghakimi kombinasinya. */
    function _berkasLabel(state, entry, isChapter) {
        var punya = [];
        if (entry) {
            if (entry.player === 'aktif') punya.push('player.html');
            if (entry.theme === 'aktif') punya.push('theme.css');
        }
        if (state === 'punya') return 'berkas sendiri (' + punya.join(' + ') + ')';
        if (state === 'nonaktif') return 'berkas sendiri — dinonaktifkan';
        return isChapter ? 'ikut berkas di atasnya' : 'tanpa berkas sendiri';
    }

    function _applyActiveTargetHighlight() {
        document.querySelectorAll('#player-target-list .player-target-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.target === _activePlayerTarget);
        });
    }

    /**
     * Perbarui hanya label perilaku satu target setelah switch override berubah.
     * Daftar target lengkap membaca chapter + scope-map lewat IPC; menjalankannya
     * ulang untuk satu checkbox membuat DOM sidebar dan request file ikut berputar.
     */
    function _refreshTargetBehaviorSummary(chapter) {
        var item = null;
        document.querySelectorAll('#player-target-list .player-target-item').forEach(function (el) {
            if (el.dataset.target === chapter) item = el;
        });
        if (!item) return;

        var hasOverride = _chapterHasOverride(chapter);
        item.classList.toggle('has-override', hasOverride);
        var entry = _scopeMap && _scopeMap.chapters && _scopeMap.chapters[chapter];
        var state = _berkasState(entry);
        var sub = item.querySelector('.pt-sub');
        if (sub) {
            sub.textContent = _berkasLabel(state, entry, true) + ' · perilaku: ' +
                (hasOverride ? 'override' : 'Global');
        }
    }

    /**
     * BERAPA CHAPTER YANG BENAR-BENAR MEMAKAI TAMPILAN GLOBAL.
     *
     * Angka, bukan paragraf. Sebelum ini hubungan Global↔chapter memang bisa
     * disimpulkan — tiap baris chapter sudah menyebut berkasnya — tetapi harus
     * disimpulkan sendiri, satu baris demi satu baris. Kreator yang bertanya
     * "kenapa template Global-ku tak kelihatan?" tak akan menempuh jalan itu.
     *
     * Yang dihitung: chapter yang `theme.css` novel-nya BENAR-BENAR dimuat
     * untuknya — yaitu yang tak membawa marka `replace-novel`. Itu ukuran yang
     * tepat karena itulah yang berubah saat template diterapkan di sini.
     *
     * `null` = tak ada chapter sama sekali, atau novel belum punya berkas Global.
     * Dua-duanya keadaan yang angkanya tak bermakna, jadi jangan dipaksakan.
     */
    function _jangkauanGlobal(chapters, punyaBerkasGlobal) {
        if (!punyaBerkasGlobal) return null;
        var daftar = chapters || [];
        if (!daftar.length) return null;
        var novel = window.currentlyEditingNovel || '';
        var n = 0;
        daftar.forEach(function (ch) {
            var layers;
            try { layers = _resolveActiveThemeLayers({ storyTitle: novel, chapter: ch }); }
            catch (e) { return; }   // tak terbaca = jangan dihitung sebagai terjangkau
            if (layers && !layers.novelSkipped) n++;
        });
        return { pakai: n, total: daftar.length };
    }

    function renderPlayerTargetList() {
        var list = document.getElementById('player-target-list');
        if (!list) return;
        var novel = window.currentlyEditingNovel || '';

        function build(chapters) {
            list.innerHTML = '';
            var peta = (_scopeMap && _scopeMap.chapters) || {};

            // Global — selalu ada, apa pun jumlah chapter. Sumbu berkasnya = level
            // NOVEL (`<novel>/player.html`), karena itulah yang dilayani target ini.
            var gEntry = _scopeMap && _scopeMap.novel;
            var gState = _berkasState(gEntry);
            var jangkauan = _jangkauanGlobal(chapters, gState === 'punya');
            // Kalimat kedua baris ini menyebut JANGKAUAN NYATA bila bisa dihitung.
            // "default semua chapter" itu benar sebagai aturan, tetapi ia janji —
            // dan waktu setiap chapter ternyata menimpanya, janji itu jadi
            // keterangan yang paling menyesatkan di layar.
            var gSub = _berkasLabel(gState, gEntry, false) + ' · ' + (jangkauan
                ? 'dipakai ' + jangkauan.pakai + ' dari ' + jangkauan.total + ' chapter'
                : 'default semua chapter');
            var gItem = _makeTargetItem('global', gState, 'Global Default', gSub, false);
            if (jangkauan) {
                gItem.dataset.jangkauan = jangkauan.pakai === 0 ? 'nol'
                    : (jangkauan.pakai < jangkauan.total ? 'sebagian' : 'penuh');
                gItem.title = jangkauan.pakai === 0
                    ? 'Tak satu pun chapter memakai tampilan ini: semuanya membawa theme.css sendiri yang menggantikannya. Template yang kamu terapkan di sini tetap tersimpan, tetapi belum menyentuh chapter mana pun.'
                    : 'Chapter yang tak punya theme.css sendiri mengambil tampilannya dari sini.';
            }
            list.appendChild(gItem);

            if (chapters.length) {
                var sep = document.createElement('div');
                sep.className = 'player-target-sep';
                sep.textContent = 'Per-Chapter';
                list.appendChild(sep);

                chapters.forEach(function (ch) {
                    // Sumber kebenaran SAMA dengan switch header & tab Gaya (audit H9):
                    // entri chapterConfig yang cuma berisi hidden/badge (metadata
                    // Chapter Select dari tab Story) BUKAN override player.
                    var hasOverride = _chapterHasOverride(ch);
                    var entry = peta[ch];
                    var state = _berkasState(entry);
                    // DUA sumbu dalam satu baris, dipisah titik-tengah. Sengaja apa
                    // adanya: "berkas sendiri + perilaku Global" adalah kombinasi SAH,
                    // bukan keadaan rusak yang perlu diperingatkan.
                    var sub = _berkasLabel(state, entry, true) + ' · perilaku: ' +
                        (hasOverride ? 'override' : 'Global');
                    list.appendChild(_makeTargetItem(ch, state, ch, sub, hasOverride));
                });
            } else {
                var empty = document.createElement('p');
                empty.className = 'player-target-empty';
                empty.textContent = 'Belum ada chapter. Tulis chapter di tab Story untuk mengonfigurasinya per-chapter.';
                list.appendChild(empty);
            }

            _applyActiveTargetHighlight();
        }

        if (!novel) { build([]); return; }

        // Ambil daftar chapter TERBARU tiap render (Risk #2): pengguna bisa
        // menambah/hapus/rename chapter di tab Story lalu kembali ke sini.
        // Sekalian menyegarkan window.availableChapters untuk selector lain.
        //
        // Peta berkas diambil BARENGAN (satu IPC untuk seluruh novel, bukan N).
        // Kegagalannya tak boleh menahan sidebar: `_scopeMap` tetap null dan baris
        // tampil tanpa keterangan berkas — lebih baik kurang lengkap daripada kosong.
        Promise.all([
            ipcRenderer.invoke('get-chapter-list-for-config', novel),
            ipcRenderer.invoke('player-code:scope-map', { storyTitle: novel }).catch(function () { return null; })
        ]).then(function (hasil) {
            var res = hasil[0], peta = hasil[1];
            _scopeMap = (peta && peta.success) ? peta : null;
            var chapters = (res && res.success && Array.isArray(res.chapters))
                ? res.chapters
                : (window.availableChapters || []);
            window.availableChapters = chapters;
            // Fallback: target chapter yang lagi aktif tapi sudah terhapus → Global.
            if (_activePlayerTarget !== 'global' && chapters.indexOf(_activePlayerTarget) === -1) {
                selectPlayerTarget('global');
            }
            build(chapters);
        }).catch(function () { build(window.availableChapters || []); });
    }
    window.renderPlayerTargetList = renderPlayerTargetList;

    async function _applyPlayerTarget(target) {
        _activePlayerTarget = target || 'global';
        // Target baru = konteks baru → default tab FB6 berlaku lagi.
        _tabDipilihManual = false;
        _applyActiveTargetHighlight();

        var badge = document.getElementById('player-target-badge');
        if (badge) {
            var isChapter = _activePlayerTarget !== 'global';
            badge.textContent = isChapter ? '📄 ' + _activePlayerTarget : 'Global Default';
            badge.classList.toggle('is-chapter', isChapter);
        }
        // Switch "Ikut Global" hanya untuk chapter; sinkronkan status.
        _updateOverrideSwitch();
        // Global ↔ Chapter memakai set tab berbeda → bangun ulang tab bar.
        renderPlayerTabBar();
        // Jenis player target bisa berbeda (custom/shim/global) → tab bar disaring
        // ulang setelah kenyataannya diketahui (§18).
        //
        // DITUNGGU sejak P2. Semua yang di bawah — URL engine preview, note scope,
        // badge — menjawab "apa yang menjalankan target ini?", dan dulu jawabannya
        // dibaca ulang dari `fs` secara sinkron di tiap pemakai. Kini jawabannya
        // datang sekali lewat IPC, jadi membangun preview sebelum ia tiba berarti
        // memakai URL target LAMA lalu membongkar-pasang webview begitu yang benar
        // datang — dan bongkar-pasang webview adalah jalur termahal di panel ini.
        await _refreshPlayerKind();
        // Engine preview bisa berganti (global ↔ player.html chapter) → re-init bila perlu
        // (idempotent: hanya bongkar-pasang webview bila URL engine berubah),
        // lalu refresh profil untuk engine global.
        initPlayerPreview();
        schedulePlayerPreviewRefresh();
        return true;
    }

    async function selectPlayerTarget(target) {
        var nextTarget = target || 'global';
        // Render ulang target yang sama tidak boleh membaca disk dan menimpa draft
        // yang masih ada. State di layar sudah merupakan state paling baru.
        if (nextTarget === _activePlayerTarget &&
            typeof _playerCodeIsDirty === 'function' && _playerCodeIsDirty()) {
            return false;
        }
        if (!_playerCodeIsDirty()) return _applyPlayerTarget(nextTarget);
        var allowed = await _resolvePlayerCodeDrafts(
            'berpindah ke target "' + (nextTarget === 'global' ? 'Global' : nextTarget) + '"'
        );
        if (!allowed) return false;
        return _applyPlayerTarget(nextTarget);
    }
    window.selectPlayerTarget = selectPlayerTarget;

    // Delegasi klik (sekali) — kontainer #player-target-list statis, isinya rebuilt.
    (function initTargetListDelegation() {
        var list = document.getElementById('player-target-list');
        if (!list) return;
        list.addEventListener('click', async function (e) {
            var item = e.target.closest('.player-target-item');
            if (!item || !list.contains(item)) return;
            await selectPlayerTarget(item.dataset.target);
        });
    })();

    // ==========================================
    // CHAPTER PLAYER (player.html per-chapter, code-first)
    // Chapter baru otomatis dibuat dengan player.html dari template engine.
    // Section ini mengelola file tersebut: buat (engine/starter), reset, hapus.
    // ==========================================
    function _cpButton(label, action, chapter, extraClass, title) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cp-toggle-btn' + (extraClass ? ' ' + extraClass : '');
        btn.textContent = label;
        btn.dataset.cpAction = action;
        btn.dataset.chapter = chapter;
        if (title) btn.title = title;
        return btn;
    }

    function _applyCustomPlayerRowState(row, exists) {
        if (!row) return;
        var ch = row.dataset.chapter;
        row.classList.toggle('cp-active', exists);

        var status = row.querySelector('.cp-row-status');
        if (status) {
            status.textContent = exists
                ? '🧩 player.html milik chapter ini'
                : 'Player global (tanpa player.html)';
        }

        var actions = row.querySelector('.cp-row-actions');
        if (!actions) return;
        actions.innerHTML = '';
        if (exists) {
            var open = document.createElement('button');
            open.type = 'button'; open.className = 'cp-open-btn';
            open.textContent = '💻 VS Code'; open.title = 'Buka folder chapter di VS Code';
            open.dataset.cpAction = 'open'; open.dataset.chapter = ch;
            actions.appendChild(open);
            actions.appendChild(_cpButton('♻️ Reset Template', 'reset', ch, '', 'Timpa player.html dengan template engine bawaan terbaru'));
            actions.appendChild(_cpButton('Hapus', 'remove', ch, 'cp-danger', 'Hapus player.html — chapter kembali memakai player global'));
        } else {
            actions.appendChild(_cpButton('⚙ Buat (Engine Penuh)', 'scaffold-engine', ch, 'cp-primary', 'player.html dari vn_player_template — engine lengkap siap diedit'));
            actions.appendChild(_cpButton('✨ Buat (Starter Minimal)', 'scaffold-starter', ch, '', 'player.html minimal murni VNPlayer API — tulis engine dari nol'));
        }
    }

    // scope ke chapter aktif. player.html bersifat per-chapter, jadi
    // untuk target Global ditampilkan catatan (bukan daftar semua chapter).
    // (renderCustomPlayerSection DIHAPUS 2026-07-30 — containernya
    //  (#custom-player-chapter-list) dibuang saat "Berkas" disajikan ulang, jadi
    //  fungsi ini cuma early-return. Teksnya pun BASI: ia mengklaim player.html
    //  hanya per-chapter, padahal level novel ada sejak D2. Aksi daur hidup berkas
    //  kini di #pc-file-actions.)

    // Delegation (sekali) untuk semua aksi chapter player.
    (function initCustomPlayerDelegation() {
        var container = document.getElementById('custom-player-chapter-list');
        if (!container) return;

        async function _scaffold(novel, ch, row, template, overwrite) {
            var sc = await ipcRenderer.invoke('chapter-player:scaffold', {
                storyTitle: novel, chapter: ch, template: template, overwrite: overwrite === true
            });
            if (sc && sc.success) {
                _applyCustomPlayerRowState(row, true);
                VN.Toast.success((overwrite ? 'player.html di-reset' : 'player.html dibuat') +
                    ' untuk "' + ch + '" (' + (template === 'starter' ? 'starter minimal' : 'engine penuh') + ') — membuka VS Code…');
                ipcRenderer.invoke('chapter-player:open-folder', { storyTitle: novel, chapter: ch, editor: 'vscode' });
            } else {
                VN.Toast.error('Gagal membuat player.html: ' + (sc && sc.message || 'Unknown'));
            }
        }

        container.addEventListener('click', async function (e) {
            var btn = e.target.closest('[data-cp-action]');
            var novel = window.currentlyEditingNovel || '';
            if (!btn || !novel) return;

            var ch = btn.dataset.chapter;
            var row = btn.closest('.custom-player-row');
            var action = btn.dataset.cpAction;

            if (action === 'open') {
                ipcRenderer.invoke('chapter-player:open-folder', { storyTitle: novel, chapter: ch, editor: 'vscode' });
            } else if (action === 'scaffold-engine' || action === 'scaffold-starter') {
                await _scaffold(novel, ch, row, action === 'scaffold-starter' ? 'starter' : 'engine', false);
            } else if (action === 'reset') {
                var okReset = await showConfirmation('Reset player.html "' + ch + '" dari template engine? Semua perubahan kode di file itu akan DITIMPA.');
                if (!okReset) return;
                await _scaffold(novel, ch, row, 'engine', true);
            } else if (action === 'remove') {
                var ok = await showConfirmation('Hapus player.html untuk "' + ch + '"? Chapter ini akan kembali memakai player global. Aksi ini tidak bisa dibatalkan.');
                if (!ok) return;
                var rem = await ipcRenderer.invoke('chapter-player:remove', { storyTitle: novel, chapter: ch });
                if (rem && rem.success) {
                    _applyCustomPlayerRowState(row, false);
                    VN.Toast.info('player.html dihapus — "' + ch + '" memakai player global.');
                } else {
                    VN.Toast.error('Gagal menghapus: ' + (rem && rem.message || 'Unknown'));
                }
            }
        });
    })();

    // ==========================================
    // RENDER: Theme & Style Section
    // ==========================================
    // Tab "Gaya" dibubarkan (D3): dropdown Tema Player & picker Gaya Dialog DIHAPUS
    // — keduanya kini ditentukan Template, yang menuliskannya jadi file milik kreator
    // (`theme.css` + atribut `data-dialogue-style` di `player.html`) lalu menyingkir.
    // Yang tersisa di sini murni PERILAKU: Sprite Slots (jumlah wadah sprite di
    // permukaan cerita). Ia tak bisa ditulis kreator dalam CSS → tetap config.
    function renderThemeSection() {
        var pp = ensurePlayerProfile();
        if (!pp) return;

        var slotsInput = document.getElementById('pp-sprite-slots');
        if (slotsInput) {
            slotsInput.value = pp.spriteSlots || 5;
            slotsInput.onchange = function () {
                pp.spriteSlots = parseInt(slotsInput.value) || 5;
            };
        }
    }

    // ==========================================
    // RENDER: CSS Variables Section
    // ==========================================
    // Objek yang menyimpan customCSS untuk target aktif: Global → player profile;
    // Chapter → chapterConfig[ch] (null bila chapter belum punya override).
    function _customCSSHolder() {
        var t = _activePlayerTarget;
        if (!t || t === 'global') return ensurePlayerProfile();
        var hc = getHubConfig();
        if (!hc) return null;
        if (!hc.chapterConfig) hc.chapterConfig = {};
        return _hasPlayerOverride(hc.chapterConfig[t]) ? hc.chapterConfig[t] : null;
    }

    // Buat entri override chapter (dipakai switch header & customCSS Kode).
    // Kunci yang menandakan "override PLAYER". hidden/badge BUKAN override player —
    // itu metadata Chapter Select (diedit di tab Story), boleh coexist di entri yang sama.
    // (N5: kunci kosmetik dicabut — kosmetik per-chapter kini `<chapter>/theme.css`.)
    var _PLAYER_OVERRIDE_KEYS = ['spriteSlots', 'restrictions'];

    function _hasPlayerOverride(cfg) {
        if (!cfg) return false;
        return _PLAYER_OVERRIDE_KEYS.some(function (k) { return cfg[k] !== undefined; });
    }

    // Aktifkan override player (tak menyentuh hidden/badge yang mungkin sudah ada).
    function _enableChapterOverride(chapter) {
        var hc = getHubConfig();
        if (!chapter || chapter === 'global' || !hc) return false;
        if (!hc.chapterConfig) hc.chapterConfig = {};
        var cfg = hc.chapterConfig[chapter] || (hc.chapterConfig[chapter] = {});
        if (!_hasPlayerOverride(cfg)) {
            // FB10: kosmetik (tema/gaya/customCSS) BERBASIS FILE sekarang — tak lagi
            // diseed ke JSON di sini (dulu menaburkan `playerTheme`/`dialogueStyle`
            // yang menghidupkan kembali lapisan "mode" N5). Menyalakan override cukup
            // menandai PERILAKU; visual chapter tetap mewarisi novel via cascade
            // sampai kreator menerapkan template / menyunting theme.css chapter.
            var g = ensurePlayerProfile() || {};
            cfg.spriteSlots = g.spriteSlots || 5;
            cfg.restrictions = Object.assign({ autoMode: true, skipMode: true }, g.restrictions || {});
        }
        return true;
    }

    // Punya override PLAYER? (abaikan entri yang cuma metadata Chapter Select).
    function _chapterHasOverride(chapter) {
        var hc = getHubConfig();
        return !!(hc && hc.chapterConfig && _hasPlayerOverride(hc.chapterConfig[chapter]));
    }

    // Pristine = override TAK berbeda efektif dari global (aman dihapus tanpa konfirmasi).
    // Dibandingkan ke GLOBAL (bukan default hardcoded) karena override kini mewarisi global.
    // hidden/badge diabaikan — bukan urusan player.
    //
    // N5 (2026-07-31): perbandingan `playerTheme`/`dialogueStyle`/`customCSS` DICABUT.
    // Ketiganya tak lagi ada di config, jadi keduanya selalu `undefined` — bandingan
    // yang selalu benar, tapi menyesatkan pembaca berikutnya bahwa kunci itu masih
    // hidup di sini. Yang tersisa = kunci yang benar-benar dibandingkan.
    function _chapterOverridePristine(cfg) {
        if (!cfg) return true;
        var hc = getHubConfig();
        var g = (hc && hc.playerProfile) || {};
        var r = cfg.restrictions || {}, gr = g.restrictions || {};
        return (cfg.spriteSlots || 5) === (g.spriteSlots || 5) &&
            (r.autoMode !== false) === (gr.autoMode !== false) &&
            (r.skipMode !== false) === (gr.skipMode !== false);
    }

    // Matikan override player: buang kunci player, TAPI pertahankan hidden/badge.
    function _removeChapterOverride(chapter) {
        var hc = getHubConfig();
        var cfg = hc && hc.chapterConfig && hc.chapterConfig[chapter];
        if (!cfg) return;
        _PLAYER_OVERRIDE_KEYS.forEach(function (k) { delete cfg[k]; });
        if (!cfg.hidden && !cfg.badge) delete hc.chapterConfig[chapter];
    }

    // Sinkronkan switch "Ikut Global" di header dengan target aktif.
    // Checked (ON) = ikut Global (tanpa override); unchecked (OFF) = override aktif.
    function _updateOverrideSwitch() {
        var sw = document.getElementById('player-override-switch');
        var tg = document.getElementById('player-override-toggle');
        if (!sw || !tg) return;
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';
        sw.style.display = isChapter ? 'inline-flex' : 'none';
        if (isChapter) tg.checked = !_chapterHasOverride(_activePlayerTarget);
    }

    // Satu intent toggle dapat menunggu konfirmasi. Revision menjaga hasil dialog/
    // IPC lama agar tidak mengalahkan intent terbaru saat switch diklik cepat.
    var _overrideMutationRevision = 0;
    var _overrideNoticeTimer = null;

    function _renderAfterOverrideToggle(chapter) {
        _updateOverrideSwitch();
        _refreshTargetBehaviorSummary(chapter);

        // Toggle hanya mengubah perilaku. Jangan panggil showPlayerTab(): pada tab
        // Code ia membaca ulang player.html, menjalankan DOMParser, dan membangun
        // navigator; pada Gaya/Template ia membuang ratusan node. Oilpan menanggung
        // churn itu meski satu-satunya perubahan hanyalah spriteSlots/restrictions.
        if (_activePlayerTab === 'perilaku') renderChapterGaya();
        else if (_activePlayerTab === 'efektif') renderEffectiveForActiveTarget();
        else if (_activePlayerTab === 'template') renderTemplateSection();
        else if (_activePlayerTab === 'berkas' && _codeFocus === 'gaya') renderCSSVarsSection();
        // Code/Scene tidak bergantung pada override perilaku: sengaja no-op.
    }

    function _cancelOverrideNotice() {
        clearTimeout(_overrideNoticeTimer);
        _overrideNoticeTimer = null;
    }

    // Wiring switch (sekali).
    (function initOverrideSwitch() {
        var tg = document.getElementById('player-override-toggle');
        if (!tg) return;
        tg.addEventListener('change', async function (event) {
            // Wrapper punya listener change generik yang me-refresh theme.css. Override
            // ini murni perilaku; hentikan bubbling dan kirim refresh config-only nanti.
            event.stopPropagation();
            var revision = ++_overrideMutationRevision;
            _cancelOverrideNotice();
            var ch = _activePlayerTarget;
            if (!ch || ch === 'global') return;
            var followGlobal = !!tg.checked;
            if (followGlobal) {
                // ON = ikut Global → hapus override (konfirmasi bila ada perubahan nyata).
                var hc = getHubConfig();
                var cfg = hc && hc.chapterConfig && hc.chapterConfig[ch];
                if (cfg && !_chapterOverridePristine(cfg)) {
                    var ok = await showConfirmation('Matikan override "' + ch + '"? Pengaturan khusus chapter ini dihapus dan kembali ikut Global.');
                    // Dialog lama tidak boleh menerapkan state sesudah target/intent berubah.
                    if (revision !== _overrideMutationRevision || ch !== _activePlayerTarget || tg.checked !== followGlobal) return;
                    if (!ok) { _updateOverrideSwitch(); return; } // batal → tetap override
                }
                _removeChapterOverride(ch);
                // FB15 — KEPUTUSAN: BERITAHU, jangan hapus.
                //
                // Switch ini hanya menyentuh PERILAKU (config). Kalau chapter masih
                // punya `player.html`/`theme.css` sendiri, runtime TETAP memakainya —
                // dan itu SAH: markup khusus chapter + perilaku Global adalah
                // kombinasi yang masuk akal. Karena itu switch tidak menghapus berkas
                // apa pun; ia melaporkan keadaannya dan menunjukkan jalan keluar yang
                // TIDAK merusak (nonaktifkan sementara di tab Code).
                //
                // Menghapus berkas kreator sebagai efek samping toggle = kelas FB18
                // yang sama yang diberantas 2026-07-30/31 (mengubah data karena UI
                // menyentuhnya). Dan sesudah N5, tiga chapter baru saja MENDAPAT
                // `theme.css` — menghapusnya di sini akan membuang kosmetik yang baru
                // dipindahkan ke sana.
                _pcBeritahuBerkasTersisa(ch, revision);
            } else {
                // OFF = override → buat entri.
                _enableChapterOverride(ch);
            }
            if (revision !== _overrideMutationRevision || ch !== _activePlayerTarget) return;
            _renderAfterOverrideToggle(ch);
            schedulePlayerBehaviorPreviewRefresh();
        });
    })();

    /**
     * FB15 — laporkan berkas chapter yang masih menang meski perilaku ikut Global.
     * Diam bila memang tak ada berkas: pesan yang selalu muncul berhenti dibaca.
     */
    function _pcBeritahuBerkasTersisa(chapter, revision) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel || !chapter) return;
        _cancelOverrideNotice();
        // Burst ON/OFF hanya perlu memeriksa keadaan berkas untuk intent TERAKHIR.
        _overrideNoticeTimer = setTimeout(function () {
            _overrideNoticeTimer = null;
            if (revision !== _overrideMutationRevision || novel !== (window.currentlyEditingNovel || '') ||
                chapter !== _activePlayerTarget || _chapterHasOverride(chapter)) return;

            ipcRenderer.invoke('player-code:scope-map', { storyTitle: novel }).then(function (r) {
                if (revision !== _overrideMutationRevision || novel !== (window.currentlyEditingNovel || '') ||
                    chapter !== _activePlayerTarget || _chapterHasOverride(chapter)) return;
                if (!r || !r.success) return;
                var e = (r.chapters || {})[chapter];
                if (!e) return;
                var aktif = [];
                if (e.player === 'aktif') aktif.push('player.html');
                if (e.theme === 'aktif') aktif.push('theme.css');
                if (!aktif.length) return;
                VN.Toast.info(
                    'Perilaku "' + chapter + '" kini ikut Global. Tampilannya belum — chapter ini masih '
                    + 'punya ' + aktif.join(' & ') + ' sendiri, dan berkas selalu menang. '
                    + 'Buka tab Code untuk menonaktifkannya sementara (berkas tidak dihapus).',
                    { duration: 9000 }
                );
            }).catch(function () { /* peta tak terbaca — diam, jangan menebak */ });
        }, 250);
    }

    // ==========================================
    // DERIVASI SKEMA CSS VAR dari variables.css (audit A1/A5/A6/N8)
    // Editor tak lagi menyimpan daftar var + default hardcoded (sumber "var mati").
    // Nama & default DIBACA dari runtime; anotasi UI (PLAYER_VAR_UI) hanya menempel
    // label/kontrol. Var yang tak ada di variables.css otomatis hilang dari picker.
    // ==========================================
    var _cssVarBaseDefaults = null;          // parsed variables.css (cache 1x)
    var _cssVarThemeCache = {};              // per-theme parsed theme.css :root
    var _touchedCssVars = {};                // varName -> true (dirty-set, audit A7)

    function _vnPlayerPath() {
        // __dirname editor = aset/game → repo root = ../.. → vn-player/…
        return path.join(__dirname, '..', '..', 'vn-player');
    }
    // Delegasi ke parser bersama node-registry (koreksi audit #1): implementasi
    // lama di sini menelan blok :root DI DALAM @media responsif variables.css,
    // sehingga default yang tampil = nilai viewport terkecil (55vh, bukan 75vh).
    // Satu implementasi, teruji jest, dipakai bersama.
    function _parseRootVars(cssText) {
        return _C.parseRootVars(cssText);
    }
    function _readCssFile(p) {
        try {
            var fsNode = require('fs');
            if (fsNode.existsSync(p)) return fsNode.readFileSync(p, 'utf-8');
        } catch (e) { /* fs tak tersedia / gagal baca */ }
        return '';
    }

    // Kontrak cascade hidup di resolver bersama yang juga dipakai runtime,
    // preview manager, dan IPC. Renderer memuatnya secara aman: editor tetap
    // bisa dibuka bila Node integration/require sementara tidak tersedia, dan
    // fallback-nya selalu `inherit` (tidak membuang CSS novel karena tebakan).
    var _themeCascadeResolverCache;
    function _themeCascadeResolver() {
        if (_themeCascadeResolverCache !== undefined) return _themeCascadeResolverCache;
        try {
            _themeCascadeResolverCache = require(path.join(
                __dirname, '..', '..', 'vn-engine', 'player-theme-resolver.js'));
        } catch (e) {
            _themeCascadeResolverCache = null;
        }
        return _themeCascadeResolverCache;
    }

    /**
     * Pandangan fs yang memasukkan draft theme.css yang belum sempat di-flush.
     * Dengan ini menambah/mencabut marker replace-novel di editor mentah langsung
     * mengubah baseline picker, tanpa menunggu debounce menulis ke disk.
     */
    function _themeCascadeFsView() {
        try {
            var fsNode = require('fs');
            if (_pendingThemeCss === null || !_pendingThemePath) return fsNode;
            return {
                existsSync: function (p) {
                    if (path.resolve(p) === path.resolve(_pendingThemePath)) return true;
                    return fsNode.existsSync(p);
                },
                readFileSync: function (p, enc) {
                    if (path.resolve(p) === path.resolve(_pendingThemePath)) return _pendingThemeCss;
                    return fsNode.readFileSync(p, enc);
                }
            };
        } catch (e) { return null; }
    }

    /** File CSS kreator yang benar-benar efektif untuk scope editor saat ini. */
    function _resolveActiveThemeLayers(scope) {
        var s = scope || _themeScope();
        var base = s.storyTitle
            ? path.join(__dirname, 'visual_novels', s.storyTitle)
            : null;
        var resolver = _themeCascadeResolver();
        var fsView = _themeCascadeFsView();
        if (base && resolver && fsView && typeof resolver.resolveEffectiveThemeFiles === 'function') {
            return resolver.resolveEffectiveThemeFiles({
                engineThemePath: null,
                novelDir: base,
                chapterDir: s.chapter ? path.join(base, s.chapter) : null,
                fsImpl: fsView
            });
        }

        // Fail-open ke perilaku kompatibilitas lama: novel tetap diwarisi.
        var novelPath = base ? path.join(base, 'theme.css') : null;
        var chapterPath = base && s.chapter ? path.join(base, s.chapter, 'theme.css') : null;
        return {
            cascadeMode: 'inherit',
            novelPath: fsView && novelPath && fsView.existsSync(novelPath) ? novelPath : null,
            chapterPath: fsView && chapterPath && fsView.existsSync(chapterPath) ? chapterPath : null,
            novelSkipped: false
        };
    }

    // ==========================================
    // PALET — sekumpulan nilai bernama untuk kontrol yang SUDAH ada di picker.
    //
    // Dulu warna dikirim lewat TEMPLATE: mengganti tiga warna berarti membangun
    // ulang shim, menulis `player.html`, dan membongkar-pasang webview preview.
    // Berat, dan tak satu pun dari itu ada hubungannya dengan warna.
    //
    // Palet cuma menggabungkan var ke `theme.css` — jalur yang SAMA dengan yang
    // dipakai swatch di bawahnya. Karena itu ia bisa dibatalkan seperti suntingan
    // biasa, dan var yang tak disebut palet tak ikut terganggu.
    //
    // Daftarnya DITURUNKAN dari isi folder, bukan tabel di sini: kreator yang
    // menyalin satu berkas palet langsung melihatnya muncul (D8 — editor membaca
    // kenyataan). Nama tampilnya pun diambil dari berkas, bukan ditebak dari id.
    // ==========================================
    function _paletDir() { return path.join(_vnPlayerPath(), 'palettes'); }

    function _daftarPalet() {
        var out = [];
        try {
            var fsNode = require('fs');
            var dir = _paletDir();
            if (!fsNode.existsSync(dir)) return out;
            fsNode.readdirSync(dir).filter(function (f) { return /\.css$/i.test(f); })
                .forEach(function (f) {
                    var teks = _readCssFile(path.join(dir, f));
                    var vars = _parseRootVars(teks);
                    if (!Object.keys(vars).length) return;   // berkas tanpa :root = bukan palet
                    // Label diambil dari komentar `PALET "…"` di berkasnya sendiri.
                    var m = teks.match(/PALET\s+"([^"]+)"/);
                    out.push({
                        id: f.replace(/\.css$/i, ''),
                        label: m ? m[1] : f.replace(/\.css$/i, ''),
                        vars: vars
                    });
                });
        } catch (e) { /* fs tak tersedia → picker tetap jalan tanpa baris palet */ }
        return out;
    }

    /**
     * Palet "Netral" — kembali ke bawaan engine, DITURUNKAN bukan disalin.
     *
     * Godaan yang sengaja dihindari: menyalin nilai baseline `variables.css` ke
     * sebuah berkas `netral.css`. Salinan itu akan MEMBEKU — begitu engine
     * memperbaiki warnanya, "Netral" tetap mengembalikan nilai lama, dan kreator
     * tak punya cara menebak kenapa. Itu persis penyakit yang N5, Potong 3, dan
     * cascade gaya dialog masing-masing habiskan waktu untuk sembuhkan.
     *
     * Jadi Netral tidak MENULIS apa pun — ia MENCABUT. Var palet dihapus dari
     * `theme.css`, dan nilai engine muncul kembali dengan sendirinya lewat
     * cascade. Nol salinan, dan otomatis ikut kalau engine berubah.
     *
     * Yang dicabut = gabungan var dari SELURUH berkas palet. Mencabut hanya var
     * milik palet yang sedang aktif akan meninggalkan sisa dari palet sebelumnya —
     * kesalahan yang sama sudah terjadi sekali di gaya kotak dialog.
     */
    function _paletNetral(daftar) {
        var vars = {};
        daftar.forEach(function (p) {
            Object.keys(p.vars).forEach(function (n) { vars[n] = null; });   // null = cabut
        });
        if (!Object.keys(vars).length) return null;
        return { id: 'netral', label: 'Netral', vars: vars, netral: true };
    }

    /** Nilai baseline engine — untuk CHIP saja, tak pernah ditulis ke berkas kreator. */
    function _chipNetral(vars) {
        var dasar = _parseRootVars(_readCssFile(path.join(_vnPlayerPath(), 'css', 'variables.css')));
        return Object.keys(vars)
            .map(function (n) { return dasar[n]; })
            .filter(function (v) { return v && /^#|rgb|hsl/i.test(String(v).trim()); })
            .slice(0, 4);
    }

    /** Warna yang bisa dijadikan contekan visual — dipetik dari NILAI palet, bukan ditulis tangan. */
    function _chipPalet(vars) {
        return Object.keys(vars)
            .filter(function (n) { return /^#|rgb|hsl/i.test(String(vars[n]).trim()); })
            .slice(0, 4)
            .map(function (n) { return vars[n]; });
    }

    /**
     * Sebuah palet DIPAKAI bila SEMUA var-nya sudah bernilai sama di theme.css.
     * Diturunkan dari berkas, bukan dicatat di JSON — tak ada "palet aktif" yang
     * bisa berbohong saat kreator menyunting satu warna dengan tangan.
     */
    function _paletTerpakai(palet, sekarang) {
        var nama = Object.keys(palet.vars);
        if (!nama.length) return false;
        // Netral berlaku justru saat NOL var palet ada di theme.css — kebalikan
        // dari palet biasa. Menyamakan keduanya membuat Netral tak pernah menyala.
        if (palet.netral) {
            return nama.every(function (n) { return sekarang[n] === undefined; });
        }
        return nama.every(function (n) {
            return String(sekarang[n] || '').trim() === String(palet.vars[n]).trim();
        });
    }

    function _terapkanPalet(palet) {
        var isi = _mergeRootVars(_readActiveThemeCss(), palet.vars);
        var textarea = document.getElementById('pp-custom-css');
        if (textarea) { textarea.value = isi; if (_cssEditor) _cssEditor.refresh(); }
        _writeActiveThemeCss(isi);
        // Render ulang supaya swatch di bawah menunjukkan nilai barunya — itulah
        // yang membuat palet terasa sebagai pintasan, bukan kotak hitam.
        renderCSSVarsSection();
        schedulePlayerPreviewRefresh();
        if (VN && VN.Toast) {
            VN.Toast.info(palet.netral
                ? 'Var palet dicabut dari theme.css — warna bawaan engine berlaku lagi. ' +
                  'Nilainya tidak disalin, jadi ia ikut kalau engine berubah.'
                : 'Palet "' + palet.label + '" diterapkan ke theme.css — ' +
                  'geser swatch mana pun kalau ingin menyesuaikan.');
        }
    }

    // ==========================================
    // GAYA KOTAK DIALOG — pintu yang selama ini tak ada.
    //
    // `dialogue-variants.css` menyediakan EMPAT gaya, tapi sejak N5 mencabut
    // lapisan JSON, satu-satunya cara menyetelnya adalah menerapkan template yang
    // KEBETULAN membawanya. Hasilnya terukur: `bottom-bar` dibawa 7 template,
    // `center-box` hanya oleh `retro`, dan `adv-fullscreen` + `bubble` **tak
    // dibawa siapa pun** — dua opsi mati yang CSS-nya ada tapi tak berpintu (§A).
    //
    // Barisnya bekerja seperti palet dan menulis ke tempat yang sama
    // (`theme.css`), dengan SATU perbedaan yang disengaja: ia boleh membawa
    // aturan SELEKTOR variannya, bukan hanya `:root`. Itulah pembedaannya —
    // "palet = warna", "gaya kotak = bentuk kotak dialog".
    //
    // Perataannya TIDAK ditulis ulang di sini: `vn-engine/theme-materializer.js`
    // sudah tahu caranya (N5), lengkap dengan terjemahan selektor id→peran.
    // Menyalin aturannya ke renderer akan melahirkan penulis kedua yang menyimpang.
    // ==========================================
    var GAYA_MULAI = '/* === gaya-kotak (dibuat editor) === */';
    var GAYA_SELESAI = '/* === /gaya-kotak === */';

    function _materializer() {
        try {
            return require(path.join(__dirname, '..', '..', 'vn-engine', 'theme-materializer.js'));
        } catch (e) { return null; }
    }

    function _variantsCss() {
        return _readCssFile(path.join(_vnPlayerPath(), 'css', 'dialogue-variants.css'));
    }

    /** Nama gaya yang BENAR-BENAR punya aturan di CSS — bukan daftar tulisan tangan. */
    function _daftarGayaKotak() {
        var css = _variantsCss();
        var out = [], seen = {};
        var re = /:root:where\(\.dialogue-style-([\w-]+)\)/g, m;
        while ((m = re.exec(css)) !== null) {
            if (seen[m[1]]) continue;
            seen[m[1]] = true;
            out.push(m[1]);
        }
        return out;
    }

    var _LABEL_GAYA = {
        'bottom-bar': 'Bawah Layar',
        'center-box': 'Kotak Tengah',
        'adv-fullscreen': 'ADV Penuh',
        'bubble': 'Balon Komik'
    };

    /** Deklarasi & aturan turunan satu gaya, diambil lewat materializer N5. */
    function _bacaGaya(nama) {
        var M = _materializer();
        var css = _variantsCss();
        if (!M || !css) return null;
        var gate = ':root:where(.dialogue-style-' + nama + ')';
        var isi = M.isiBlok(css, gate + ' {') || M.isiBlok(css, gate + '{');
        var turunan = M.aturanTurunan(css, gate);
        if (!isi && !turunan.length) return null;
        var vars = {};
        String(isi || '').split(';').forEach(function (d) {
            var i = d.indexOf(':');
            if (i < 0) return;
            var p = d.slice(0, i).trim();
            if (p) vars[p] = d.slice(i + 1).trim();
        });
        return { nama: nama, vars: vars, turunan: turunan };
    }

    function _terapkanGayaKotak(nama) {
        var gaya = _bacaGaya(nama);
        if (!gaya) return;

        // Var yang dimiliki gaya LAIN tapi tidak oleh gaya ini wajib DICABUT.
        // Tanpa langkah ini, `--vn-dialogue-border` milik center-box tertinggal
        // saat kreator pindah ke bottom-bar — sisa yang tak bisa ia lacak asalnya.
        var semua = {};
        _daftarGayaKotak().forEach(function (n) {
            var g = _bacaGaya(n);
            if (g) Object.keys(g.vars).forEach(function (v) { semua[v] = true; });
        });
        var tulis = {};
        Object.keys(semua).forEach(function (v) {
            tulis[v] = (gaya.vars[v] !== undefined) ? gaya.vars[v] : null;   // null = cabut
        });

        var isi = _mergeRootVars(_readActiveThemeCss(), tulis);

        // Aturan turunan hidup di blok BERTANDA supaya mengganti gaya
        // MENGGANTIKAN blok lama, bukan menumpuknya.
        var badan = gaya.turunan.map(function (t) {
            // Selektornya dipakai APA ADANYA: sejak perbaikan cascade,
            // `dialogue-variants.css` sudah menulisnya dengan PERAN
            // (`[data-player-role="speaker"]`), bukan id engine. Kontrak menjaga
            // itu tetap begitu — kalau id kembali, ia hanya akan berlaku untuk
            // player yang kebetulan memakai id yang sama.
            var sel = t.sisa;
            return sel + ' {\n' + t.isi.split('\n').map(function (b) {
                return b.trim() ? '  ' + b.trim() : '';
            }).join('\n') + '\n}';
        }).join('\n');
        isi = _gantiBlokGaya(isi, badan ? (GAYA_MULAI + '\n' + badan + '\n' + GAYA_SELESAI) : '');

        var textarea = document.getElementById('pp-custom-css');
        if (textarea) { textarea.value = isi; if (_cssEditor) _cssEditor.refresh(); }
        _writeActiveThemeCss(isi);
        renderCSSVarsSection();
        schedulePlayerPreviewRefresh();
        if (VN && VN.Toast) {
            VN.Toast.info('Gaya kotak "' + (_LABEL_GAYA[nama] || nama) +
                '" ditulis ke theme.css — swatch di bawah ikut menyesuaikan.');
        }
    }

    function _gantiBlokGaya(css, blokBaru) {
        var mulai = css.indexOf(GAYA_MULAI);
        if (mulai >= 0) {
            var akhir = css.indexOf(GAYA_SELESAI, mulai);
            if (akhir >= 0) {
                css = css.slice(0, mulai) + css.slice(akhir + GAYA_SELESAI.length);
            }
        }
        css = css.replace(/\n{3,}/g, '\n\n').trim();
        return blokBaru ? (css + (css ? '\n\n' : '') + blokBaru + '\n') : (css + '\n');
    }

    /** Gaya mana yang sedang berlaku — DITURUNKAN dari nilai, bukan dicatat. */
    function _gayaTerpakai(sekarang) {
        var cocok = null;
        _daftarGayaKotak().forEach(function (n) {
            var g = _bacaGaya(n);
            if (!g) return;
            var nama = Object.keys(g.vars);
            if (!nama.length) return;
            var sama = nama.every(function (v) {
                return String(sekarang[v] || '').trim() === String(g.vars[v]).trim();
            });
            if (sama) cocok = n;
        });
        return cocok;
    }

    function _renderBarisGayaKotak(container, sekarang) {
        var daftar = _daftarGayaKotak();
        if (daftar.length < 2) return;
        var aktif = _gayaTerpakai(sekarang);

        var blok = document.createElement('div');
        blok.className = 'palette-row';

        var label = document.createElement('div');
        label.className = 'palette-row-label';
        label.innerHTML = 'Gaya kotak dialog <span class="field-hint">bentuk & posisi kotak; ' +
            'menulis ke theme.css seperti palet</span>';
        blok.appendChild(label);

        var deret = document.createElement('div');
        deret.className = 'palette-chips';
        daftar.forEach(function (n) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'palette-chip';
            btn.dataset.gayaId = n;
            if (aktif === n) btn.classList.add('active');
            btn.innerHTML = '<span class="palette-chip-name">' +
                escapePlayerHTML(_LABEL_GAYA[n] || n) + '</span>';
            btn.addEventListener('click', function () { _terapkanGayaKotak(n); });
            deret.appendChild(btn);
        });
        blok.appendChild(deret);
        container.appendChild(blok);
    }

    function _renderBarisPalet(container, sekarang) {
        var daftar = _daftarPalet();
        if (!daftar.length) return;      // folder kosong/absen → picker tetap utuh

        // Netral di DEPAN: ia titik nol, dan kreator yang ingin membatalkan
        // pilihannya mencarinya di awal baris, bukan di ujung.
        var netral = _paletNetral(daftar);
        if (netral) daftar = [netral].concat(daftar);

        var blok = document.createElement('div');
        blok.className = 'palette-row';

        var label = document.createElement('div');
        label.className = 'palette-row-label';
        label.innerHTML = 'Palet <span class="field-hint">mengisi swatch di bawah; ' +
            'yang tak disebut palet tak diubah</span>';
        blok.appendChild(label);

        var deret = document.createElement('div');
        deret.className = 'palette-chips';
        daftar.forEach(function (p) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'palette-chip';
            btn.dataset.paletId = p.id;
            if (_paletTerpakai(p, sekarang)) btn.classList.add('active');
            if (p.netral) btn.title = 'Cabut var palet dari theme.css — nilai bawaan engine ' +
                'muncul kembali lewat cascade, bukan disalin.';
            var warna = (p.netral ? _chipNetral(p.vars) : _chipPalet(p.vars)).map(function (w) {
                return '<i style="background:' + escapePlayerHTML(w) + '"></i>';
            }).join('');
            btn.innerHTML = '<span class="palette-chip-swatches">' + warna + '</span>' +
                '<span class="palette-chip-name">' + escapePlayerHTML(p.label) + '</span>';
            btn.addEventListener('click', function () { _terapkanPalet(p); });
            deret.appendChild(btn);
        });
        blok.appendChild(deret);
        container.appendChild(blok);
    }
    // `inheritedCss` (opsional): teks CSS lapisan yang cascade DI BAWAH scope aktif.
    // Untuk chapter = <novel>/theme.css (FB1c). Untuk global = tak ada.
    function _getCssVarDefaults(themeName, inheritedCss) {
        // Cache HANYA bila parse menghasilkan sesuatu — jangan kunci hasil kosong
        // (baca gagal sekali tak boleh membuat picker kosong selamanya).
        if (!_cssVarBaseDefaults || Object.keys(_cssVarBaseDefaults).length === 0) {
            var parsed = _parseRootVars(
                _readCssFile(path.join(_vnPlayerPath(), 'css', 'variables.css')));
            _cssVarBaseDefaults = Object.keys(parsed).length ? parsed : null;
        }
        var base = _cssVarBaseDefaults || {};
        var merged = {};
        Object.keys(base).forEach(function (k) { merged[k] = base[k]; });
        // A8: overlay override tema engine aktif supaya swatch mencerminkan keadaan.
        if (themeName && themeName !== 'default') {
            if (!_cssVarThemeCache[themeName]) {
                _cssVarThemeCache[themeName] = _parseRootVars(
                    _readCssFile(path.join(_vnPlayerPath(), 'themes', themeName, 'theme.css')));
            }
            var ov = _cssVarThemeCache[themeName];
            Object.keys(ov).forEach(function (k) { merged[k] = ov[k]; });
        }
        // FB1c: overlay lapisan warisan (novel theme.css) PALING AKHIR sebelum
        // nilai chapter sendiri — mengikuti urutan cascade runtime.
        if (inheritedCss) {
            var inh = _parseRootVars(inheritedCss);
            Object.keys(inh).forEach(function (k) { merged[k] = inh[k]; });
        }
        return merged;
    }
    // Validasi preset sekali saat modul aktif — peringatkan preset yang menyebut
    // var tak dikenal (D1) memakai daftar var NYATA dari variables.css.
    // (Validator preset DIHAPUS 2026-07-30 bersama presetnya. Drift-guard-nya
    //  pindah ke kontrak smoke: preset hardcode tak boleh kembali.)

    // ==========================================
    // DISPENSER TEMPLATE PLAYER (D3) — pengganti tab "Gaya".
    // Template = GENERATOR: menulis file milik kreator lalu MENYINGKIR. Tak ada
    // nilai yang tertinggal dan terus berlaku diam-diam (itu penyakit "mode", N5).
    // ==========================================
    var _playerTemplates = null;      // cache daftar dari main

    function renderTemplateSection() {
        _hitungRender.template++;
        var grid = document.getElementById('player-template-grid');
        var scopeName = document.getElementById('pt-scope-name');
        var note = document.getElementById('pt-current-note');
        if (!grid) return;

        var s = _themeScope();
        if (scopeName) scopeName.textContent = s.chapter || 'Global (seluruh novel)';

        if (!s.storyTitle) { grid.innerHTML = '<p class="field-hint">Belum ada novel dipilih.</p>'; return; }

        // UX-A08 — GERBANG PERILAKU DICABUT DARI SINI.
        //
        // Dulu chapter yang mengikuti perilaku Global tidak ditawari template sama
        // sekali, dengan alasan "konsisten dengan tab Perilaku". Itu mencampur dua
        // sumbu: template menulis `player.html` + `theme.css` — BERKAS — sedangkan
        // switch Ikut Global hanya menyentuh `spriteSlots`/`restrictions` di
        // hub-config. Menerapkan template tak pernah "mematahkan status ikut-global";
        // ia tak menyentuh config sama sekali.
        //
        // Ongkos gerbang itu bukan cuma salah label: chapter yang ikut perilaku
        // Global jadi TIDAK BISA punya tampilan sendiri, padahal kombinasi itu sah
        // dan sudah dipakai di novel nyata. Yang menjelaskan keadaannya sekarang
        // adalah kartu keadaan tiga sumbu (UX-B05), bukan penolakan.

        /**
         * Daftar template DIKELOMPOKKAN per KATEGORI (UX-C03).
         *
         * Pendahulunya mengelompokkan per `bentuk`, dengan alasan yang benar
         * untuk zamannya: tingkat teratas picker hanya boleh memuat perbedaan
         * yang BISA DITUNJUKKAN, dan delapan template yang tampilannya sama
         * persis dengan Default tak mungkin dipilih dari pratinjau.
         *
         * Sekarang tiap kartu membawa FOTO template, jadi perbedaan RUPA sudah
         * terlihat langsung dan tak perlu lagi disekat. Yang TETAP tak terlihat
         * dari foto adalah perbedaan JENIS: `lengkap` dan `custom-layer` bukan
         * pilihan tampilan sama sekali — keduanya paket kemampuan/kepemilikan
         * kode yang hasilnya memang serupa Polos. Itulah sekat yang tersisa.
         *
         * Template yang TAK menyebut `category` tidak ditebak-tebak: ia masuk
         * grup "Belum dikategorikan" dan tetap bisa dipilih. Menebak kategori
         * template buatan kreator hanya melahirkan label yang salah.
         */
        var KATEGORI = [
            {
                kunci: 'layout',
                judul: 'Layout Player',
                ket: 'Susunan layar cerita. Fotonya memperlihatkan bedanya — pilih dari situ.'
            },
            {
                kunci: 'starter-kit',
                judul: 'Starter Kit Lanjutan',
                ket: 'Bukan pilihan tampilan, melainkan paket kemampuan & kepemilikan kode. ' +
                    'Fotonya memang mirip Polos: itu yang akan kamu lihat setelah menerapkannya.'
            },
            {
                kunci: null,
                judul: 'Belum Dikategorikan',
                ket: 'Template tanpa metadata kategori — tetap bisa dipakai seperti biasa.'
            }
        ];

        function kelompokkan(list) {
            return KATEGORI.map(function (k) {
                return {
                    meta: k,
                    isi: list.filter(function (tpl) {
                        var c = (tpl.category === 'layout' || tpl.category === 'starter-kit')
                            ? tpl.category : null;
                        return c === k.kunci;
                    })
                };
            }).filter(function (g) { return g.isi.length > 0; });
        }

        function kartu(tpl) {
            var card = document.createElement('div');
            card.className = 'preset-card';
            card.dataset.templateId = tpl.id;
            card.title = tpl.description || '';

            // Foto dipotret `tools/render-thumbnails.js` dari player.html engine +
            // theme.css template ini — bukan gambar buatan tangan. `hasThumbnail`
            // dijawab MAIN (yang memegang disk); tanpa foto, kartunya jujur bilang
            // tak ada, bukan menampilkan gambar rusak.
            var muka = tpl.hasThumbnail
                ? '<div class="preset-card-shot"><img src="../../vn-player/templates/library/' +
                  encodeURIComponent(tpl.id) + '/' +
                  encodeURIComponent(tpl.thumbnail || 'preview.png') +
                  '" alt="" loading="lazy"></div>'
                : '<div class="preset-card-shot preset-card-shot-kosong">' +
                  '<span class="preset-card-shot-note">tanpa foto</span></div>';

            card.innerHTML = muka +
                '<div class="preset-card-label">' + escapePlayerHTML(tpl.label) + '</div>' +
                '<div class="field-hint" style="margin-top:4px;">' +
                escapePlayerHTML(tpl.description || '') + '</div>';
            return card;
        }

        function paint() {
            grid.innerHTML = '';
            var grup = kelompokkan(_playerTemplates || []);
            if (!grup.length) {
                // Grid kosong TANPA penjelasan adalah cacat tersendiri: kreator tak
                // bisa membedakan "belum dimuat" dari "memang tak ada".
                grid.innerHTML = '<p class="field-hint">Tidak ada template Player terbaca di ' +
                    'vn-player/templates/library/.</p>';
                _refreshTemplateNote();
                return;
            }
            grup.forEach(function (g) {
                var blok = document.createElement('div');
                blok.className = 'preset-group';
                blok.dataset.kategori = g.meta.kunci || 'lainnya';

                var judul = document.createElement('div');
                judul.className = 'preset-group-head';
                judul.innerHTML = '<span class="preset-group-title">' +
                    escapePlayerHTML(g.meta.judul) + '</span>' +
                    '<span class="field-hint">' + escapePlayerHTML(g.meta.ket) + '</span>';
                blok.appendChild(judul);

                var isi = document.createElement('div');
                isi.className = 'preset-group-body';
                g.isi.forEach(function (tpl) { isi.appendChild(kartu(tpl)); });
                blok.appendChild(isi);
                grid.appendChild(blok);
            });
            _refreshTemplateNote();
        }

        if (_playerTemplates) { paint(); return; }
        ipcRenderer.invoke('player-template:list').then(function (res) {
            _playerTemplates = (res && res.success && res.templates) || [];
            paint();
        }).catch(function () { grid.innerHTML = '<p class="field-hint">Gagal memuat daftar template.</p>'; });
    }

    // Tunjukkan keadaan NYATA (file yang ada), bukan nilai JSON — sejalan P0.
    function _refreshTemplateNote() {
        var note = document.getElementById('pt-current-note');
        if (!note) return;
        var s = _themeScope();
        // P2: note "Keadaan sekarang" wajib memakai sumber yang SAMA dengan badge
        // & tab bar. Dua pembaca berbeda untuk satu keadaan = dua kalimat yang
        // bisa berbeda di layar yang sama.
        ipcRenderer.invoke('player:view-model', { storyTitle: s.storyTitle, chapter: s.chapter })
            .then(function (st) {
                var current = _themeScope();
                if (current.storyTitle !== s.storyTitle || current.chapter !== s.chapter) return;
                if (!st || !st.success) return;
                var punyaPlayer = (s.chapter ? st.chapterPlayerState : st.novelPlayerState) === 'aktif';
                var punyaTheme = !!_readActiveThemeCss().trim();
                var layers = _resolveActiveThemeLayers(s);
                var themeStatus = punyaTheme ? 'ada' : 'belum ada';
                if (s.chapter && layers.cascadeMode === 'replace-novel') {
                    themeStatus += ' (menggantikan tampilan Global)';
                } else if (s.chapter && layers.novelPath) {
                    themeStatus += punyaTheme
                        ? ' (melapisi tampilan Global)'
                        : ' (memakai tampilan Global)';
                }
                var bagian = [];
                bagian.push('<code>player.html</code> ' + (punyaPlayer ? 'ada' : 'belum ada'));
                bagian.push('<code>theme.css</code> ' + themeStatus);
                if (!s.chapter && punyaPlayer) bagian.push('berlaku untuk semua chapter yang tak punya file sendiri');
                note.innerHTML = 'Keadaan sekarang: ' + bagian.join(' · ');
            }).catch(function () {});
    }

    (function initTemplateDispenser() {
        var grid = document.getElementById('player-template-grid');
        if (!grid) return;

        /**
         * PENJAGA AKSI BERJALAN — laporan user 2026-08-01: "aplikasi bisa freeze
         * saat mengklik-klik dengan cepat berbagai pilihan template".
         *
         * Menerapkan template BUKAN aksi ringan: main process membangun ulang
         * shim, menulis `player.html`, menyalin theme.css/vocab/extensions —
         * semuanya fs SINKRON. Sepuluh klik cepat = sepuluh pekerjaan itu
         * antre di main, dan selama antrean itu SELURUH aplikasi berhenti
         * menjawab (bukan cuma panelnya). Ditambah tiap keberhasilan
         * membongkar-pasang webview preview.
         *
         * Klik selama satu aksi berjalan DIABAIKAN, bukan diantrekan: hasil
         * akhir dari sepuluh klik beruntun toh cuma template terakhir, jadi
         * sembilan sisanya adalah pekerjaan yang hasilnya langsung ditimpa.
         *
         * Snapshot Undo ditangkap oleh closure toast masing-masing; toast lama
         * tidak boleh diam-diam memakai snapshot apply yang lebih baru.
         *
         * Penjaganya MEMBERITAHU, bukan menelan: grid ditandai `data-sibuk`
         * supaya kursor & opacity menunjukkan kenapa klik tak bereaksi.
         */
        var _sedangMenerapkan = false;
        function _tandaiSibuk(sibuk) {
            _sedangMenerapkan = sibuk;
            if (sibuk) grid.setAttribute('data-sibuk', '1');
            else grid.removeAttribute('data-sibuk');
        }

        // Nama chapter saja tidak cukup sebagai identitas: response IPC novel
        // lama dapat tiba setelah kreator membuka novel lain yang kebetulan punya
        // chapter bernama sama. Aturannya kini dipegang satu tempat (#7) supaya
        // jalur template dan jalur ambil-alih tak bisa berbeda pendapat.
        function _templateScopeMasihAktif(target) {
            return _pcTargetMasihAktif(target);
        }

        // Penulisan disk tetap sah untuk scope yang ditangkap saat klik, tetapi
        // response lama tidak boleh me-render atau me-reload target yang kini aktif.
        function _refreshTemplateTargetJikaAktif(target) {
            if (!_templateScopeMasihAktif(target)) return false;
            renderCSSVarsSection();
            _refreshTemplateNote();
            renderPlayerTargetList();
            _refreshPlayerKind();
            // Menerapkan template ke sebuah CHAPTER dapat menambahkan marker
            // replace-novel, jadi jawaban "apakah preview mewakili Global"
            // bisa berubah karenanya — lencananya wajib ikut disegarkan.
            _renderPreviewScopeBadge();
            _hardReloadPreview();
            return true;
        }

        grid.addEventListener('click', function (e) {
            var card = e.target.closest('.preset-card');
            if (!card) return;
            if (_sedangMenerapkan) return;      // lihat _tandaiSibuk: sengaja diabaikan
            var id = card.dataset.templateId;
            var s = _themeScope();
            if (!s.storyTitle) return;

            _applyTemplate(id, s, false);
        });

        // force=true hanya dipakai setelah kreator mengonfirmasi menimpa engine custom.
        function _applyTemplate(id, s, force) {
            // Salinan polos ini adalah identitas transaksi. Jangan membawa object
            // state UI yang bisa berubah selama dialog/IPC masih berjalan.
            var target = {
                storyTitle: String((s && s.storyTitle) || ''),
                chapter: String((s && s.chapter) || '')
            };
            _tandaiSibuk(true);
            // Penanda menyebut template MANA — kalau stall-nya cuma pada satu
            // template (mis. `lengkap` yang menyuntik 43 peran), log langsung
            // menunjukkannya tanpa perlu menebak.
            var selesaiTanda = _stall.tandai('template:apply ' + id);
            var transaksiDibatalkan = {};
            // Template menulis ulang player.html/theme.css. Draft kode atau timer
            // theme.css harus diputuskan lebih dulu; tanpa ini callback debounce
            // lama bisa tiba sesudah apply dan menimpa hasil template.
            return _resolvePlayerCodeDrafts('menerapkan template "' + id + '"').then(function (allowed) {
                if (!allowed) {
                    selesaiTanda(); _tandaiSibuk(false);
                    return transaksiDibatalkan;
                }
                // Target berubah saat dialog Save/Discard/Cancel terbuka. Batalkan
                // sebelum mutasi agar kartu tak diterapkan ke scope tak terlihat.
                if (!_templateScopeMasihAktif(target)) {
                    selesaiTanda(); _tandaiSibuk(false);
                    VN.Toast.info('Target Player berubah - penerapan template dibatalkan.');
                    return transaksiDibatalkan;
                }
                return ipcRenderer.invoke('player-template:apply', {
                    storyTitle: target.storyTitle, chapter: target.chapter,
                    templateId: id, force: force
                });
            }).then(function (res) {
                // Guard draft yang batal/berubah sudah membersihkan penjaga dan
                // tidak pernah mengirim IPC.
                if (res === transaksiDibatalkan) return false;
                // Penjaga dilepas SESUDAH seluruh kerja berat selesai, bukan di
                // awal `then`: bagian yang paling mahal justru sesudah IPC balik
                // (`_hardReloadPreview` membongkar-pasang webview). Melepasnya
                // lebih awal membiarkan klik berikutnya masuk tepat di tengah
                // pembongkaran itu.
                // Target memakai engine custom → JANGAN timpa diam-diam. Tanya dulu.
                if (res && res.needsConfirm && res.reason === 'custom-player') {
                    selesaiTanda(); _tandaiSibuk(false);
                    // Konfirmasi milik target lama tak boleh muncul di novel/chapter
                    // yang sudah berbeda; tombol force-nya akan membingungkan.
                    if (!_templateScopeMasihAktif(target)) return false;
                    VN.Toast.show(res.message, {
                        type: 'warning', duration: 20000,
                        actions: [
                            {
                                label: 'Timpa & Terapkan',
                                onClick: function () { _applyTemplate(id, target, true); }
                            },
                            { label: 'Batal', onClick: function () {} }
                        ]
                    });
                    return;
                }
                if (!res || !res.success) {
                    selesaiTanda(); _tandaiSibuk(false);
                    VN.Toast.error('Gagal menerapkan template: ' + ((res && res.message) || 'tak diketahui'));
                    return;
                }
                // Snapshot lokal per-toast. Dengan snapshot global, tombol Undo
                // toast lama memulihkan apply yang lebih baru.
                var undoSnapshot = res.snapshot;

                // (Pengosongan kunci kosmetik DICABUT — N5. Kosmetik sudah tak
                //  punya lapisan JSON sama sekali, jadi tak ada yang perlu
                //  dikosongkan di sini; lihat alasan lengkap di novel-crud.js.)
                // Apply dapat MELAHIRKAN player.html/theme.css chapter. Segarkan
                // dua pembaca keadaan berkas agar sidebar, filter tab, dan banner
                // tak terus menampilkan status sebelum template diterapkan.
                _refreshTemplateTargetJikaAktif(target);
                selesaiTanda(); _tandaiSibuk(false);

                VN.Toast.show('Template "' + res.label + '" diterapkan — file-nya kini milikmu.', {
                    type: 'success', duration: 8000,
                    actions: [{
                        label: 'Undo',
                        onClick: function () {
                            VN.Utils.invokeChecked(ipcRenderer, 'player-template:restore', { snapshot: undoSnapshot })
                                .then(function () {
                                    _refreshTemplateTargetJikaAktif(target);
                                    VN.Toast.info('Template dibatalkan — file dipulihkan.');
                                }).catch(function (err) {
                                    VN.Toast.error('Gagal membatalkan template: ' + (err.message || 'tak diketahui'));
                                });
                        }
                    }]
                });
                return true;
            }).catch(function (err) {
                // Penjaga WAJIB dilepas di jalur gagal juga — kalau tidak, satu
                // kegagalan mengunci seluruh picker sampai panel dimuat ulang,
                // dan itu terasa persis seperti freeze yang sedang diperbaiki.
                selesaiTanda(); _tandaiSibuk(false);
                VN.Toast.error('Gagal: ' + err.message);
            });
        }
    })();

    // ==========================================
    // D4 — picker CSS Variable menyunting theme.css MILIK KREATOR
    // Sebelumnya ia menulis blob JSON `customCSS`: dua penulis untuk variabel yang
    // sama (file + JSON), dan JSON selalu menang karena disuntik terakhir (B1).
    // Setelah D4 tersisa SATU penulis per scope, dan yang disunting adalah file
    // yang memang dimiliki & bisa dibuka kreator di VS Code.
    // ==========================================
    function _themeScope() {
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';
        return {
            storyTitle: window.currentlyEditingNovel || '',
            chapter: isChapter ? _activePlayerTarget : ''
        };
    }

    // ================= PENJAGA TARGET RESPONS IPC (#7) =================
    //
    // Mutasi `player.html` (ambil-alih peran/scene/layar cerita, tandai peran tak
    // dipakai, scaffold player chapter) semuanya async. Antara klik dan balasannya,
    // kreator bebas pindah novel atau chapter. Penulisan disknya tetap sah — ia
    // mengenai target yang ditangkap saat klik — tetapi MENYEGARKAN navigator dan
    // MEMUAT ULANG preview sesudah itu akan mengenai target yang sekarang terlihat,
    // yaitu novel/chapter yang sama sekali tak diminta.
    //
    // Nama chapter saja tidak cukup sebagai identitas: novel lain bisa punya chapter
    // bernama sama. Karena itu identitasnya sepasang (novel, chapter).
    //
    // Pembagian tugasnya mengikuti keputusan yang sudah dipakai jalur template:
    // toast hasil TETAP muncul (operasinya memang berhasil), yang dijaga hanya
    // refresh/reload — lihat `_refreshTemplateTargetJikaAktif`.

    // PC_TARGET_GUARD_START
    /** Identitas target Player saat sebuah aksi DIMULAI. */
    function _pcTargetSnapshot() {
        var s = _themeScope();
        return { storyTitle: s.storyTitle, chapter: s.chapter };
    }

    /** Apakah kreator masih berada di target yang sama seperti saat aksi dimulai? */
    function _pcTargetMasihAktif(target) {
        if (!target) return false;
        var now = _themeScope();
        return now.storyTitle === target.storyTitle &&
            (now.chapter || '') === (target.chapter || '');
    }

    /**
     * Segarkan navigator + preview sesudah `player.html` dimutasi — hanya bila
     * targetnya masih yang sedang dilihat. Mengembalikan false saat dilewati,
     * supaya pemanggil bisa membedakan "tidak disegarkan" dari "gagal".
     */
    function _pcRefreshSetelahMutasi(target) {
        if (!_pcTargetMasihAktif(target)) return false;
        _pcLoadBlock('player.html');   // file berubah → navigator + kontrak segar
        _hardReloadPreview();
        return true;
    }
    // PC_TARGET_GUARD_END
    function _activeThemePath() {
        var s = _themeScope();
        if (!s.storyTitle) return null;
        var base = path.join(__dirname, 'visual_novels', s.storyTitle);
        return s.chapter ? path.join(base, s.chapter, 'theme.css') : path.join(base, 'theme.css');
    }
    /**
     * Isi theme.css scope aktif — DENGAN tulisan yang masih tertunda.
     *
     * Tulisan ke berkas di-debounce 400 ms (menggeser slider memicu perubahan
     * beruntun). Selama jendela itu, DISK belum jadi kebenaran: apa pun yang
     * membaca ulang di sana akan melihat nilai LAMA. Bug itu terlihat begitu
     * palet dipasang — swatch tetap menunjukkan warna engine sesudah palet
     * diterapkan, dan chip-nya tak pernah menyala "terpakai".
     *
     * Yang tertunda hanya sah untuk scope tempat ia dibuat; berpindah target
     * saat tulisan masih antre tak boleh menampilkan isi milik target lain.
     */
    function _readActiveThemeCss() {
        var p = _activeThemePath();
        if (!p) return '';
        if (_pendingThemeCss !== null && _pendingThemePath === p) return _pendingThemeCss;
        return _readCssFile(p);
    }
    // FB1c: lapisan WARISAN — theme.css level novel. Untuk scope chapter, inilah
    // yang cascade DI BAWAH theme.css chapter (dan yang membuat chapter "ikut
    // Global" tampak berwarna Global). Swatch chapter yang belum diubah harus
    // memulai dari nilai ini, bukan default engine — kalau tidak, muncul mismatch
    // "preview pink, swatch kuning" yang dilaporkan user.
    function _readInheritedThemeCss() {
        var s = _themeScope();
        if (!s.storyTitle || !s.chapter) return '';
        var layers = _resolveActiveThemeLayers();
        // `novelPath:null` adalah keputusan resolver (replace-novel), bukan file
        // yang gagal ditemukan. Jangan menghidupkan kembali CSS Global di picker.
        return layers.novelPath ? _readCssFile(layers.novelPath) : '';
    }

    function _readEffectiveThemeLayerCss(layerPath) {
        if (!layerPath) return '';
        var activePath = _activeThemePath();
        if (activePath && path.resolve(layerPath) === path.resolve(activePath)) {
            return _readActiveThemeCss();
        }
        return _readCssFile(layerPath);
    }

    // ==========================================
    // D8 sumbu CSS — var yang DIKONSUMSI, bukan yang sekadar terdefinisi.
    //
    // Gelombang 3 menurunkan skema dari DEFINISI di variables.css, lalu aku
    // mengkurasi 11 var dengan tangan — karena definisi ≠ ada yang membacanya
    // (temuan A4: `--vn-transition-duration` terdefinisi tapi nol `var()`).
    // Kurasi tangan itu tetap "editor berpendapat", hanya lebih kecil.
    //
    // Di sini pendapat itu dicabut: pindai `var(--x)` di CSS yang BENAR-BENAR
    // dimuat player. Var yang tak dikonsumsi siapa pun turun ke lipatan
    // "tidak dipakai" — TIDAK dihapus, karena kontrol yang lenyap tanpa alasan
    // terasa seperti aplikasi rusak, bukan jujur.
    // ==========================================
    var _consumedCache = { key: null, set: null };

    function _collectConsumedVars(cssText, into) {
        var re = /var\(\s*(--[\w-]+)/g, m;
        while ((m = re.exec(cssText || '')) !== null) into[m[1]] = true;
    }

    function _cssRevisionToken(cssText) {
        var text = String(cssText || '');
        var hash = 2166136261;
        for (var i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return text.length + ':' + (hash >>> 0);
    }

    function _getConsumedVars(themeName) {
        var s = _themeScope();
        var layers = _resolveActiveThemeLayers();
        var novelLayerCss = _readEffectiveThemeLayerCss(layers.novelPath);
        var chapterLayerCss = _readEffectiveThemeLayerCss(layers.chapterPath);
        // Mode ikut menjadi bagian identitas cache. Apply Default (replace-novel)
        // pada path yang sama tak boleh memakai hasil pindai lama yang masih
        // memasukkan var dari theme.css novel.
        var key = (themeName || '') + '||' + s.storyTitle + '||' + s.chapter +
            '||' + layers.cascadeMode + '||' + _cssRevisionToken(novelLayerCss) +
            '||' + _cssRevisionToken(chapterLayerCss);
        if (_consumedCache.key === key && _consumedCache.set) return _consumedCache.set;

        var found = {};
        try {
            var fsNode = require('fs');
            // 1. Seluruh CSS modul engine (yang dimuat player.html / shim).
            var cssDir = path.join(_vnPlayerPath(), 'css');
            if (fsNode.existsSync(cssDir)) {
                fsNode.readdirSync(cssDir)
                    .filter(function (f) { return /\.css$/i.test(f); })
                    .forEach(function (f) { _collectConsumedVars(_readCssFile(path.join(cssDir, f)), found); });
            }
            // 2. Tema engine yang aktif.
            [themeName, 'default'].filter(Boolean).forEach(function (t) {
                _collectConsumedVars(
                    _readCssFile(path.join(_vnPlayerPath(), 'themes', t, 'theme.css')), found);
            });
            // 3. theme.css kreator (novel + chapter) — variabel BUATANNYA sendiri
            //    ikut terbaca di sini, itulah yang membuat picker bisa menawarkan
            //    var yang tak pernah dikenal engine.
            if (layers.novelPath) _collectConsumedVars(novelLayerCss, found);
            if (layers.chapterPath) _collectConsumedVars(chapterLayerCss, found);
        } catch (e) { /* fs tak tersedia → anggap semua dipakai (tak menyembunyikan apa pun) */ }

        _consumedCache = { key: key, set: found };
        return found;
    }

    // Variabel milik KREATOR: dikonsumsi & didefinisikan di CSS-nya sendiri,
    // tapi tak dikenal anotasi engine. Inilah yang dulu mustahil muncul di picker.
    function _creatorOwnVars(consumed, engineDefaults) {
        var own = [];
        var mine = _parseRootVars(_readActiveThemeCss());
        Object.keys(mine).forEach(function (name) {
            if (engineDefaults[name] !== undefined) return;   // punya engine, sudah ditangani
            if (!consumed[name]) return;                      // didefinisikan tapi tak dipakai
            own.push({
                var: name, label: name.replace(/^--/, ''),
                type: /^#|rgb|hsl/i.test(String(mine[name]).trim()) ? 'color' : 'text',
                default: mine[name]
            });
        });
        return own;
    }

    // Tulis ditunda: menggeser slider memicu banyak perubahan beruntun, dan tiap
    // perubahan menulis FILE. Debounce menjaga disk & preview tetap tenang.
    var _themeWriteTimer = null;
    var _pendingThemeCss = null;
    // Berkas mana yang isi tertundanya milik — dipakai `_readActiveThemeCss`
    // supaya isi antre tak pernah ditampilkan untuk scope yang salah.
    var _pendingThemePath = null;
    var _pendingThemeScope = null;
    var _themeWriteInFlight = null;
    var _pendingLegacyCssMigration = null;

    function _themeDraftIsDirty() {
        return _pendingThemeCss !== null;
    }

    function _clearPendingThemeDraft(saved) {
        clearTimeout(_themeWriteTimer);
        _themeWriteTimer = null;
        if (!saved && _pendingLegacyCssMigration) {
            // Discard migrasi harus benar-benar lossless: kembalikan blob JSON
            // lama bila theme.css hasil leburan tidak jadi disimpan.
            _pendingLegacyCssMigration.holder.customCSS = _pendingLegacyCssMigration.value;
        }
        _pendingLegacyCssMigration = null;
        _pendingThemeCss = null;
        _pendingThemePath = null;
        _pendingThemeScope = null;
    }

    /** Flush theme.css dari memori; failure envelope wajib mempertahankan draft. */
    async function _flushPendingThemeCss() {
        clearTimeout(_themeWriteTimer);
        _themeWriteTimer = null;

        if (_themeWriteInFlight) {
            await _themeWriteInFlight;
        }
        if (_pendingThemeCss === null || !_pendingThemeScope) return true;

        var isi = _pendingThemeCss;
        var targetPath = _pendingThemePath;
        var scope = {
            storyTitle: _pendingThemeScope.storyTitle,
            chapter: _pendingThemeScope.chapter
        };
        var operation = (async function () {
            try {
                await VN.Utils.invokeChecked(ipcRenderer, 'player-code:write-theme', {
                    storyTitle: scope.storyTitle,
                    chapter: scope.chapter,
                    content: isi
                });
                var currentRevisionSaved = _pendingThemeCss === isi &&
                    _pendingThemePath === targetPath;
                if (currentRevisionSaved) {
                    _clearPendingThemeDraft(true);
                }
                schedulePlayerPreviewRefresh();
                return currentRevisionSaved;
            } catch (e) {
                // Preview disk tidak boleh mengaku memuat draft yang backend tolak.
                VN.Toast.error('Gagal menyimpan theme.css: ' + (e.message || 'unknown'));
                return false;
            }
        })();

        _themeWriteInFlight = operation;
        try {
            return await operation;
        } finally {
            if (_themeWriteInFlight === operation) _themeWriteInFlight = null;
        }
    }

    function _writeActiveThemeCss(content) {
        var s = _themeScope();
        if (!s.storyTitle) return;
        _pendingThemeCss = content;
        _pendingThemePath = _activeThemePath();
        _pendingThemeScope = { storyTitle: s.storyTitle, chapter: s.chapter };
        clearTimeout(_themeWriteTimer);
        _themeWriteTimer = setTimeout(function () {
            _flushPendingThemeCss();
        }, 400);
    }

    // Lebur `customCSS` JSON lama ke theme.css lalu kosongkan kuncinya.
    // Dijalankan saat picker dibuka, bukan otomatis saat novel dimuat: migrasi
    // hanya terjadi pada scope yang benar-benar disentuh kreator.
    function _migrateLegacyCustomCSS() {
        var holder = _customCSSHolder();
        var legacy = holder && holder.customCSS ? String(holder.customCSS).trim() : '';
        if (!legacy) return false;

        var existing = _readActiveThemeCss();
        var merged = existing.trim()
            ? existing.replace(/\s*$/, '') + '\n\n/* — dipindahkan dari customCSS (JSON) — */\n' + legacy + '\n'
            : '/* — dipindahkan dari customCSS (JSON) — */\n' + legacy + '\n';

        _pendingLegacyCssMigration = { holder: holder, value: holder.customCSS };
        holder.customCSS = '';
        var s = _themeScope();
        _writeActiveThemeCss(merged);
        if (VN && VN.Toast) {
            VN.Toast.info('CSS lama dipindahkan ke ' + (s.chapter ? s.chapter + '/theme.css' : 'theme.css') +
                ' — sekarang jadi file milikmu. Jangan lupa Simpan.');
        }
        return true;
    }

    function renderCSSVarsSection() {
        _hitungRender.cssVars++;
        var container = document.getElementById('pp-css-vars-container');
        if (!container) return;
        container.innerHTML = '';
        _touchedCssVars = {}; // reset dirty-set: swatch fresh belum "disentuh" (A7)

        var textarea = document.getElementById('pp-custom-css');
        var note = document.getElementById('css-vars-scope-note');
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';

        // D4: picker menyunting FILE theme.css milik kreator, bukan blob JSON.
        // Konsekuensinya scope tak lagi bergantung pada ada/tidaknya override JSON —
        // tiap chapter boleh punya theme.css sendiri sebagai lapisan cascade,
        // persis seperti novel. Gerbang "chapter tanpa override" karenanya hilang.
        // (Tampil/tidaknya #pp-custom-css-wrap kini diatur showPlayerTab — ia hidup
        // di luar seksi ini demi tata letak dua kolom.)

        // UX-A08 — GERBANG PERILAKU DICABUT DARI SINI JUGA, dan ini yang paling
        // merugikan dari keduanya.
        //
        // Picker ini menyunting `<chapter>/theme.css`: sebuah BERKAS, lapisan
        // cascade tersendiri. Runtime memuatnya kalau ada — tanpa peduli sedikit pun
        // pada override perilaku di hub-config. Tetapi selama chapter mengikuti
        // perilaku Global, panel menyembunyikan picker-nya dan menulis "Warna &
        // tampilan mengikuti Global".
        //
        // Kalimat itu BOHONG untuk chapter yang sudah punya theme.css — dan tiga
        // chapter di novel yang ada persis begitu. Kreator diberi tahu tampilannya
        // diwarisi, sementara berkasnya sendiri yang dipakai, dan pintunya untuk
        // menyunting berkas itu ditutup. Yang menjelaskan keadaannya sekarang adalah
        // kartu keadaan tiga sumbu (UX-B05).
        var wrap = document.getElementById('pp-custom-css-wrap');
        var split = document.querySelector('.player-preview-split');
        // Seksi ini juga dipanggil untuk MENYEGARKAN swatch dari tempat lain — mis.
        // sesudah menerapkan template, saat tab Template yang sedang terbuka.
        // Karena itu ia tidak boleh MEMUTUSKAN visibilitas; dulu ia menampilkan
        // editor theme.css tanpa syarat, jadi editor itu menyembul di tab Template
        // setiap kali template diganti. Yang berwenang tetap showPlayerTab/setCodeFocus.
        var sedangDitampilkan = (_activePlayerTab === 'berkas' && _codeFocus === 'gaya');
        if (wrap) wrap.style.display = sedangDitampilkan ? '' : 'none';
        if (split) split.classList.toggle('has-css-editor', sedangDitampilkan);

        if (note) {
            note.textContent = 'Menyunting file: ' +
                (isChapter ? _activePlayerTarget + '/theme.css' : 'theme.css (level novel)');
        }

        // Legacy: novel lama menyimpan kosmetik di JSON `customCSS`. Selama nilai itu
        // masih ada ia disuntik PALING AKHIR (B1) sehingga MENGALAHKAN theme.css —
        // artinya suntingan picker akan tak terlihat. Jadi ia dilebur lebih dulu.
        _migrateLegacyCustomCSS();

        var currentVars = parseCSSVars(_readActiveThemeCss());

        // --- Baris PALET, di ATAS swatch ---
        // Letaknya sengaja di sini: palet MENGISI swatch di bawahnya, jadi kreator
        // langsung melihat kontrol mana yang berubah dan boleh menggeser satu
        // warna tanpa keluar dari palet. Ia pintasan, bukan mode — nol lapisan
        // tersembunyi yang menang (pelajaran N5).
        _renderBarisGayaKotak(container, currentVars);
        _renderBarisPalet(container, currentVars);

        // Skema DITURUNKAN dari variables.css (+ override tema aktif untuk swatch A8).
        var activeTheme = (ensurePlayerProfile() || {}).playerTheme;
        if (isChapter) {
            var _cc = (getHubConfig().chapterConfig || {})[_activePlayerTarget] || {};
            if (_cc.playerTheme) activeTheme = _cc.playerTheme;
        }
        // FB1c: baseline chapter hanya mengambil CSS novel bila resolver memang
        // memasukkannya. Marker replace-novel sengaja memutus lapisan tersebut.
        var engineDefaults = _getCssVarDefaults(activeTheme, isChapter ? _readInheritedThemeCss() : null);
        var consumed = _getConsumedVars(activeTheme);
        var adaDataKonsumsi = Object.keys(consumed).length > 0;

        var groups = _C.buildPlayerCssVars(engineDefaults);

        // D8 sumbu CSS: pisahkan yang DIKONSUMSI player dari yang tidak.
        var groupsDipakai = {}, groupsNganggur = {};
        Object.keys(groups).forEach(function (g) {
            groups[g].forEach(function (v) {
                var pakai = !adaDataKonsumsi || consumed[v.var];   // gagal pindai → tampilkan semua
                var target = pakai ? groupsDipakai : groupsNganggur;
                (target[g] = target[g] || []).push(v);
            });
        });

        // Variabel buatan kreator sendiri — dulu MUSTAHIL muncul di picker.
        var ownVars = _creatorOwnVars(consumed, engineDefaults);
        if (ownVars.length) groupsDipakai['Variabelmu sendiri'] = ownVars;

        // `host` menentukan ke mana grid dipasang: langsung, atau ke dalam lipatan.
        function renderGroups(src, host) {
        Object.keys(src).forEach(function (groupName) {
            var section = document.createElement('div');
            section.className = 'css-var-group';

            var header = document.createElement('h4');
            header.className = 'css-var-group-header';
            header.textContent = groupName;
            section.appendChild(header);

            var grid = document.createElement('div');
            grid.className = 'css-var-grid';

            src[groupName].forEach(function (varDef) {
                var item = document.createElement('div');
                item.className = 'css-var-item';

                var label = document.createElement('label');
                label.className = 'css-var-label';
                label.textContent = varDef.label;

                var currentVal = currentVars[varDef.var] || '';

                var input;
                if (varDef.type === 'color') {
                    input = document.createElement('input');
                    input.type = 'color';
                    input.className = 'css-var-color';
                    // A8: nilai efektif = override customCSS bila ada, jika tidak
                    // default NYATA dari variables.css/tema (bukan lagi hardcoded).
                    input.value = cssColorToHex(currentVal || varDef.default);
                    input.dataset.cssVar = varDef.var;
                    input.addEventListener('input', onCSSVarChange);
                } else if (varDef.type === 'slider') {
                    var wrapper = document.createElement('div');
                    wrapper.className = 'css-var-slider-wrapper';

                    // parseFloat (bukan parseInt) agar unit pecahan seperti '1em'/'0.9em'
                    // tak terpotong; fallback ke nilai default nyata.
                    var initNum = parseFloat(currentVal);
                    if (isNaN(initNum)) initNum = parseFloat(varDef.default);
                    if (isNaN(initNum)) initNum = varDef.min;

                    input = document.createElement('input');
                    input.type = 'range';
                    input.className = 'css-var-slider';
                    input.min = varDef.min;
                    input.max = varDef.max;
                    input.step = varDef.step;
                    input.value = initNum;
                    input.dataset.cssVar = varDef.var;
                    input.dataset.unit = varDef.unit;
                    input.addEventListener('input', onCSSVarChange);

                    var display = document.createElement('span');
                    display.className = 'css-var-value';
                    display.textContent = input.value + varDef.unit;
                    input.dataset.displayId = 'display-' + varDef.var;
                    display.id = 'display-' + varDef.var;

                    wrapper.appendChild(input);
                    wrapper.appendChild(display);
                    input = wrapper;
                } else {
                    // Cabang KETIGA — tanpa ini, `input` tetap undefined dan
                    // `appendChild(undefined)` MELEMPAR, merobohkan seluruh picker.
                    // Bukan kasus teoretis: `_creatorOwnVars` memberi type 'text'
                    // untuk setiap var kreator yang nilainya bukan warna (`180px`,
                    // `16 / 9`, `6vh 6vw`). Jadi fitur "variabelmu sendiri" bekerja
                    // hanya selama kreator kebetulan menulis warna saja — begitu ia
                    // menulis satu ukuran, panelnya mati.
                    input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'css-var-text';
                    input.dataset.cssVar = varDef.var;
                    // Nilai yang WAJIB berupa string CSS ber-kutip (mis. `content`).
                    // Kreator mengetik simbolnya saja; kutipnya urusan editor —
                    // sejajar dengan slider yang menambahkan unitnya sendiri.
                    if (varDef.quote) input.dataset.quote = '1';
                    input.value = varDef.quote
                        ? _lepasKutip(currentVal || varDef.default)
                        : (currentVal || varDef.default || '');
                    input.addEventListener('input', onCSSVarChange);
                }

                item.appendChild(label);
                item.appendChild(input);
                grid.appendChild(item);
            });

            section.appendChild(grid);
            host.appendChild(section);
        });
        }

        renderGroups(groupsDipakai, container);

        // Var yang TAK dikonsumsi player ini: diturunkan, bukan dihapus.
        // Menghapusnya diam-diam membuat panel terasa rusak; menyimpannya di
        // permukaan membuatnya jadi kebisingan. Lipatan menjawab keduanya —
        // dan judulnya menyebut ALASAN, bukan sekadar "lainnya".
        var jmlNganggur = Object.keys(groupsNganggur)
            .reduce(function (n, g) { return n + groupsNganggur[g].length; }, 0);
        if (jmlNganggur > 0) {
            var fold = document.createElement('details');
            fold.style.marginTop = '18px';
            var sum = document.createElement('summary');
            sum.style.cursor = 'pointer';
            sum.innerHTML = '<span class="field-hint">' + jmlNganggur +
                ' variabel <strong>tidak dipakai player ini</strong> — mengubahnya tak akan terlihat. ' +
                'Klik untuk tetap menampilkannya.</span>';
            fold.appendChild(sum);
            var foldBody = document.createElement('div');
            foldBody.style.marginTop = '10px';
            fold.appendChild(foldBody);
            container.appendChild(fold);
            renderGroups(groupsNganggur, foldBody);
        }

        // CSS mentah textarea → tulis ke FILE theme.css scope aktif (D4).
        if (textarea) {
            _pasangEditorKode();
            textarea.value = _readActiveThemeCss();
            if (_cssEditor) _cssEditor.refresh();
            textarea.removeAttribute('maxlength');   // file, bukan field JSON
            textarea.oninput = function () { _writeActiveThemeCss(textarea.value); };
        }
    }

    // Kutip CSS punya SATU rumah di node-registry (dipakai bersama penulis lain);
    // di sini cuma namanya dipendekkan.
    function _lepasKutip(v) { return _C.lepasKutipCss(v); }
    function _pasangKutip(v) { return _C.pasangKutipCss(v); }

    function onCSSVarChange(e) {
        var input = e.target;

        // Catat var yang benar-benar DISENTUH user (audit A7) — hanya ini yang
        // akan ditulis; swatch yang tak disentuh tak menimpa apa pun.
        if (input.dataset.cssVar) _touchedCssVars[input.dataset.cssVar] = true;

        // Update display value for sliders
        if (input.dataset.displayId) {
            var display = document.getElementById(input.dataset.displayId);
            if (display) display.textContent = input.value + (input.dataset.unit || '');
        }

        // Rebuild customCSS from all current inputs
        rebuildCustomCSS();
    }

    // A7: hanya var yang DISENTUH yang di-overlay ke blok :root customCSS;
    // sisa blok (var tulisan tangan kreator) & CSS non-root dipertahankan utuh.
    function rebuildCustomCSS() {
        var touched = {};
        document.querySelectorAll('#pp-css-vars-container [data-css-var]').forEach(function (input) {
            var cssVar = input.dataset.cssVar;
            if (!cssVar || !_touchedCssVars[cssVar]) return;
            var val;
            if (input.type === 'color') val = input.value;
            else if (input.dataset.quote) val = _pasangKutip(input.value);
            else val = input.value + (input.dataset.unit || '');
            // Cek KOSONG dipisah dari cek kutip: `_pasangKutip('')` menghasilkan
            // `''` — string dua karakter yang TIDAK falsy, dan itu memang nilai
            // yang sah (artinya "matikan indikator ini"). Kalau digabung, satu-
            // satunya cara mematikannya lewat UI justru terbuang di sini.
            if (input.dataset.quote ? input.value !== undefined : val) touched[cssVar] = val;
        });

        // D4: sumber & tujuan = theme.css milik kreator, bukan lagi blob JSON.
        var textarea = document.getElementById('pp-custom-css');
        var existing = textarea ? textarea.value : _readActiveThemeCss();
        var newCSS = _mergeRootVars(existing, touched);

        if (textarea) { textarea.value = newCSS; if (_cssEditor) _cssEditor.refresh(); }
        _writeActiveThemeCss(newCSS);
    }

    // Overlay `overrides` (map var→nilai) ke blok :root PERTAMA dari `css`,
    // mempertahankan urutan & var lain, dan seluruh CSS di luar blok itu.
    // Tanpa :root & tanpa overrides → kembalikan css apa adanya.
    function _mergeRootVars(css, overrides) {
        css = css || '';
        var keys = Object.keys(overrides || {});
        var re = /:root\s*\{([^}]*)\}/;
        var m = css.match(re);
        if (!m && keys.length === 0) return css.trim();

        var decls = [];
        var seen = {};
        (m ? m[1] : '').split(';').forEach(function (d) {
            var i = d.indexOf(':');
            if (i < 0) return;
            var prop = d.slice(0, i).trim();
            if (!prop) return;
            seen[prop] = decls.length;
            decls.push({ prop: prop, val: d.slice(i + 1).trim() });
        });
        keys.forEach(function (k) {
            // Nilai `null` berarti CABUT properti ini, bukan tulis "null".
            // Dipakai gaya kotak dialog: pindah dari center-box ke bottom-bar
            // harus MENGHILANGKAN `--vn-dialogue-border` yang cuma dimiliki
            // center-box — kalau tidak, border emasnya tertinggal selamanya dan
            // kreator tak punya cara menebak dari mana asalnya.
            if (overrides[k] === null) {
                if (seen[k] !== undefined) decls[seen[k]] = null;
                return;
            }
            if (seen[k] !== undefined && decls[seen[k]]) decls[seen[k]].val = overrides[k];
            else { seen[k] = decls.length; decls.push({ prop: k, val: overrides[k] }); }
        });
        decls = decls.filter(Boolean);

        if (decls.length === 0) {
            // Blok :root kosong & tak ada override → buang blok kosong itu.
            return m ? (css.slice(0, m.index) + css.slice(m.index + m[0].length)).trim() : css.trim();
        }
        var block = ':root {\n' + decls.map(function (d) { return '  ' + d.prop + ': ' + d.val + ';'; }).join('\n') + '\n}';
        if (m) return (css.slice(0, m.index) + block + css.slice(m.index + m[0].length)).trim();
        return (block + (css.trim() ? '\n\n' + css.trim() : '')).trim();
    }

    function parseCSSVars(css) {
        var result = {};
        var regex = /(--[\w-]+)\s*:\s*([^;]+)/g;
        var match;
        while ((match = regex.exec(css)) !== null) {
            result[match[1]] = match[2].trim();
        }
        return result;
    }

    function cssColorToHex(color) {
        if (!color) return '#000000';
        if (color.startsWith('#')) return color.length <= 7 ? color : color.substring(0, 7);
        // For rgba/rgb, create temp element
        try {
            var temp = document.createElement('div');
            temp.style.color = color;
            document.body.appendChild(temp);
            var computed = getComputedStyle(temp).color;
            document.body.removeChild(temp);
            var match = computed.match(/\d+/g);
            if (match && match.length >= 3) {
                return '#' + match.slice(0, 3).map(function (c) {
                    return parseInt(c).toString(16).padStart(2, '0');
                }).join('');
            }
        } catch (e) { /* ignore */ }
        return '#000000';
    }

    // ==========================================
    // RENDER: Restrictions Section
    // ==========================================
    function renderRestrictionsSection() {
        var pp = ensurePlayerProfile();
        if (!pp) return;

        var autoCheck = document.getElementById('pp-auto-mode');
        if (autoCheck) {
            autoCheck.checked = pp.restrictions?.autoMode !== false;
            autoCheck.onchange = function () {
                if (!pp.restrictions) pp.restrictions = {};
                pp.restrictions.autoMode = autoCheck.checked;
            };
        }

        // skipMode: tanpa UI — mati di runtime player (state.isSkipModeAllowed
        // tak pernah dibaca). Nilai default tetap true untuk backward compat data.
        if (!pp.restrictions) pp.restrictions = {};
        if (pp.restrictions.skipMode === undefined) pp.restrictions.skipMode = true;
    }

    // ==========================================
    // CODE-FIRST FILES — theme.css & extensions/*.js (novel + per-chapter)
    // Runtime memuat cascade ini otomatis; seksi ini mengelola FILE-nya.
    // ==========================================
    function _pcBtn(label, action, opts) {
        opts = opts || {};
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cp-toggle-btn' + (opts.cls ? ' ' + opts.cls : '');
        b.textContent = label;
        b.dataset.pcAction = action;
        if (opts.chapter) b.dataset.chapter = opts.chapter;
        if (opts.file) b.dataset.file = opts.file;
        if (opts.title) b.title = opts.title;
        return b;
    }

    function _pcRow(labelText, statusText, isActive) {
        var row = document.createElement('div');
        row.className = 'custom-player-row' + (isActive ? ' cp-active' : '');
        var main = document.createElement('div'); main.className = 'cp-row-main';
        var name = document.createElement('span'); name.className = 'cp-row-name'; name.textContent = labelText;
        var status = document.createElement('span'); status.className = 'cp-row-status'; status.textContent = statusText;
        main.appendChild(name); main.appendChild(status);
        var actions = document.createElement('div'); actions.className = 'cp-row-actions';
        row.appendChild(main); row.appendChild(actions);
        return { row: row, actions: actions };
    }

    // Blok theme.css + daftar extensions untuk satu scope (novel atau chapter).
    function _pcScopeBlock(container, scopeLabel, chapter, info) {
        // theme.css
        var theme = _pcRow(
            (chapter ? '📑 ' : '🌐 ') + scopeLabel + ' — theme.css',
            info.theme ? ' theme.css aktif (dimuat runtime)' : 'Belum ada theme.css',
            info.theme
        );
        if (info.theme) {
            theme.actions.appendChild(_pcBtn('💻 VS Code', 'open-theme', { chapter: chapter, title: 'Buka theme.css di VS Code' }));
            theme.actions.appendChild(_pcBtn('Hapus', 'remove-theme', { chapter: chapter, cls: 'cp-danger', title: 'Hapus theme.css scope ini' }));
        } else {
            theme.actions.appendChild(_pcBtn('+ Buat theme.css', 'scaffold-theme', { chapter: chapter, cls: 'cp-primary', title: 'Buat theme.css berisi panduan CSS variables engine' }));
        }
        container.appendChild(theme.row);

        // extensions/*.js
        var exts = info.extensions || [];
        var extRow = _pcRow(
            (chapter ? '📑 ' : '🌐 ') + scopeLabel + ' — extensions/',
            exts.length ? ('🧩 ' + exts.length + ' extension: ' + exts.join(', ')) : 'Belum ada extension',
            exts.length > 0
        );
        exts.forEach(function (f) {
            extRow.actions.appendChild(_pcBtn('💻 ' + f, 'open-ext', { chapter: chapter, file: f, title: 'Buka di VS Code' }));
            extRow.actions.appendChild(_pcBtn('✕', 'remove-ext', { chapter: chapter, file: f, cls: 'cp-danger', title: 'Hapus ' + f }));
        });
        extRow.actions.appendChild(_pcBtn('+ Extension', 'scaffold-ext', { chapter: chapter, title: 'Buat starter extension (VNRegistry) di scope ini' }));
        container.appendChild(extRow.row);
    }

    // scope ke target aktif. Global → hanya blok Novel (semua chapter).
    // Chapter → hanya blok chapter itu (theme.css + extensions-nya sendiri).
    // ==========================================
    // EDITOR KODE IN-APP + NAVIGATOR SCENE (Lapis A)
    // Blok HTML/CSS/JS = player.html / theme.css / extensions/*.js. Navigator kiri
    // MEMBACA data-player-scene dari isi player.html (bukan config) → klik = lompat.
    // ==========================================
    var _pcBlock = 'player.html';         // blok aktif
    var _pcExtFile = null;                 // extension aktif (untuk blok JS)
    var _pcDirty = false;
    var _pcLoadedKey = null;               // latch anti-simpan-sebelum-muat (pelajaran FB18)
    var _pcLoadRequestId = 0;              // response read-file lama tak boleh menang balapan
    var _pcSelectedSceneId = '';           // scene yang disemat preview mode Per-scene

    function _pcChapterArg() {
        return _activePlayerTarget === 'global' ? '' : _activePlayerTarget;
    }
    function _pcKey(file) {
        return (window.currentlyEditingNovel || '') + '||' + _pcChapterArg() + '||' + file;
    }

    function _playerCodeIsDirty() {
        return !!_pcDirty || _themeDraftIsDirty();
    }

    function _discardCodeDraft() {
        if (!_pcDirty) return;
        _pcDirty = false;
        // Isi textarea tidak lagi berhak ditulis. Load berikutnya wajib membaca
        // ulang disk sehingga draft yang dipilih untuk dibuang tak bangkit lagi.
        _pcLoadedKey = null;
        _pcSetStatus('draft dibuang', false);
    }

    function _discardPlayerCodeDrafts() {
        _discardCodeDraft();
        _clearPendingThemeDraft();
    }

    async function _savePlayerCodeChanges() {
        if (_pcDirty) {
            var codeSaved = await _pcSave();
            if (codeSaved !== true) return false;
        }
        if (_themeDraftIsDirty()) {
            var themeSaved = await _flushPendingThemeCss();
            if (themeSaved !== true) return false;
        }
        return true;
    }

    /** Guard draft kode saja sebelum textarea kode diganti dengan file lain. */
    async function _resolveCodeDraft(nextLabel) {
        var allowed = await VN.Utils.resolveDirtyDecision({
            dirty: !!_pcDirty,
            message: 'Kode "' + (_pcBlock || 'Player') + '" belum disimpan. Simpan sebelum ' + nextLabel + '?',
            saveAction: _pcSave
        });
        if (!allowed) return false;
        // resolveDirtyDecision membiarkan dirty tetap hidup hanya pada keputusan
        // Discard. Save yang gagal mengembalikan false dan tak pernah tiba di sini.
        if (_pcDirty) _discardCodeDraft();
        return true;
    }

    /** Guard seluruh draft file Player sebelum target/fokus scope diganti. */
    async function _resolvePlayerCodeDrafts(nextLabel) {
        var allowed = await VN.Utils.resolveDirtyDecision({
            dirty: _playerCodeIsDirty(),
            message: 'Kode atau theme.css Player belum disimpan. Simpan sebelum ' + nextLabel + '?',
            saveAction: _savePlayerCodeChanges
        });
        if (!allowed) return false;
        if (_playerCodeIsDirty()) _discardPlayerCodeDrafts();
        return true;
    }

    // Adapter sementara untuk orkestrator lintas-domain. Satu permukaan ini
    // mencegah Save All menebak state internal textarea/timer milik panel.
    window._playerCodeIsDirty = _playerCodeIsDirty;
    window.savePlayerCodeChanges = _savePlayerCodeChanges;
    window.discardPlayerCodeChanges = _discardPlayerCodeDrafts;

    function _pcSetStatus(txt, dirty) {
        var s = document.getElementById('pc-editor-status');
        if (!s) return;
        s.textContent = txt || '';
        s.classList.toggle('dirty', !!dirty);
    }

    // Pengalih fokus tab Code: Scene (kode + navigator) ↔ Gaya (picker warna theme.css,
    // eks-tab Tampilan yang dilebur). Engine custom tak membaca --vn-* → tombol Gaya
    // disembunyikan (fokus paksa ke Scene).
    function renderCodeFocusSwitcher() {
        var sw = document.getElementById('pc-focus-switcher');
        if (!sw) return;
        var custom = _activePlayerKind === 'custom';
        var gayaBtn = sw.querySelector('.pc-focus-btn[data-focus="gaya"]');
        if (gayaBtn) gayaBtn.style.display = custom ? 'none' : '';
        if (custom && _codeFocus === 'gaya') _codeFocus = 'scene';
        sw.querySelectorAll('.pc-focus-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.focus === _codeFocus);
        });
    }

    function _applyCodeFocus(focus, preserveDraft) {
        _codeFocus = (focus === 'gaya' && _activePlayerKind !== 'custom') ? 'gaya' : 'scene';
        var gaya = _codeFocus === 'gaya';
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';

        var secCode = document.getElementById('player-section-code-files');
        var secCss = document.getElementById('player-section-css-vars');
        var secCustom = document.getElementById('player-section-custom-player');
        var codeWrap = document.getElementById('pp-code-editor-wrap');
        var cssWrap = document.getElementById('pp-custom-css-wrap');
        var split = document.querySelector('.player-preview-split');

        // Kiri: section per fokus (custom-player ikut Scene, chapter saja).
        if (secCode) { secCode.style.display = gaya ? 'none' : 'block'; secCode.classList.toggle('active', !gaya); }
        if (secCss) { secCss.style.display = gaya ? 'block' : 'none'; secCss.classList.toggle('active', gaya); }
        if (secCustom) {
            var showCustom = !gaya && isChapter;
            secCustom.style.display = showCustom ? 'block' : 'none';
            secCustom.classList.toggle('active', showCustom);
        }

        // Kanan: editor per fokus + grid dua-kolom.
        if (split) { split.classList.toggle('has-code-editor', !gaya); split.classList.toggle('has-css-editor', gaya); }
        if (codeWrap) codeWrap.style.display = gaya ? 'none' : '';
        if (cssWrap) cssWrap.style.display = gaya ? '' : 'none';

        var sw = document.getElementById('pc-focus-switcher');
        if (sw) sw.querySelectorAll('.pc-focus-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.focus === _codeFocus);
        });

        // Render isi. (renderCSSVarsSection punya logika follow-global sendiri yang
        // boleh menimpa has-css-editor untuk chapter yang ikut Global — itu benar.)
        if (gaya) {
            if (!preserveDraft) renderCSSVarsSection();
            _pcRenderCssActions();       // aksi daur hidup theme.css (buat/hapus/VS Code)
        } else {
            if (!preserveDraft) renderCodeEditor(); // aksi berkas dirender _pcLoadBlock
        }
        return true;
    }

    function setCodeFocus(focus) {
        var nextFocus = (focus === 'gaya' && _activePlayerKind !== 'custom') ? 'gaya' : 'scene';
        if (nextFocus === _codeFocus && _playerCodeIsDirty()) {
            // Tata layout kembali, tetapi jangan membaca disk/mengganti textarea.
            return Promise.resolve(_applyCodeFocus(nextFocus, true));
        }
        if (!_playerCodeIsDirty()) return Promise.resolve(_applyCodeFocus(nextFocus));
        return _resolvePlayerCodeDrafts('berpindah fokus Code').then(function (allowed) {
            return allowed ? _applyCodeFocus(nextFocus) : false;
        });
    }
    window.setCodeFocus = setCodeFocus;

    function renderCodeEditor() {
        var scopeName = document.getElementById('pc-scope-name');
        if (scopeName) scopeName.textContent = _activePlayerTarget === 'global' ? 'Global' : _activePlayerTarget;

        var nav = document.getElementById('pc-scene-nav');
        var codeWrap = document.getElementById('pp-code-editor-wrap');
        var split = document.querySelector('.player-preview-split');
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';

        // Chapter TANPA player.html sendiri → kode yang jalan = player Global/novel, BUKAN
        // file chapter. Navigator scene + editor file chapter (kosong) tak relevan di sini
        // → sembunyikan, arahkan ke Global (usul user). GERBANG = SCOPE FILE, BUKAN switch
        // Ikut Global: chapter yang ikut-Global-PERILAKU tapi PUNYA player.html sendiri
        // TETAP disunting di sini (P0 — jangan sembunyikan kode yang benar-benar jalan).
        if (isChapter && _pcResolvedScope() !== 'chapter') {
            if (nav) nav.style.display = 'none';
            if (codeWrap) codeWrap.style.display = 'none';
            if (split) split.classList.remove('has-code-editor');
            _renderCodeScopeNote(true);     // mode follow-global + CTA (buka Global / buat file)
            return;
        }

        if (nav) nav.style.display = '';
        if (codeWrap) codeWrap.style.display = '';
        if (split) split.classList.add('has-code-editor');
        _renderCodeScopeNote(false);        // note informasional (chapter punya file sendiri)

        // Sinkronkan tombol blok aktif.
        document.querySelectorAll('#pc-block-picker .pc-block-btn').forEach(function (b) {
            var v = b.dataset.pcBlock;
            b.classList.toggle('active', v === (_pcBlock === _pcExtFile ? '__ext__' : _pcBlock) ||
                (v === '__ext__' && _pcBlock === _pcExtFile && _pcExtFile));
        });
        _pcLoadBlock(_pcBlock === _pcExtFile && _pcExtFile ? _pcExtFile : _pcBlock);
    }

    // Editor ber-highlight untuk tab Code & theme.css mentah. Memakai MESIN yang
    // sama dengan hub code editor (window.VNCodeEditor) — bukan salinan: satu
    // highlighter, satu logika ketikan (auto-indent, pasangan otomatis, Tab blok,
    // Ctrl+/), satu tempat memperbaikinya.
    var _pcEditor = null;
    var _cssEditor = null;

    // MELIHAT SEBELUM MEMILIKI (#3) — nama scene engine yang sedang ditampilkan
    // hanya-baca di editor, atau null. Bukan sekadar hiasan: selama ia terisi,
    // isi textarea BUKAN berkas kreator, jadi menyimpannya akan menulis markup
    // engine ke berkas yang salah.
    var _pcBacaSaja = null;

    /** Pasang/lepas mode hanya-baca. Tombol Simpan diganti jalan keluar. */
    function _pcSetBacaSaja(nama) {
        _pcBacaSaja = nama || null;
        var ta = document.getElementById('pp-code-editor');
        var wrap = document.getElementById('pp-code-editor-wrap');
        var save = document.getElementById('pc-editor-save');
        if (ta) ta.readOnly = !!nama;
        if (wrap) wrap.classList.toggle('pc-baca-saja', !!nama);
        if (save) {
            save.textContent = nama ? 'Kembali ke berkasmu' : '💾 Simpan';
            save.title = nama
                ? 'Tutup markup engine dan kembali ke player.html milikmu'
                : '';
        }
    }

    function _pasangEditorKode() {
        var Core = window.VNCodeEditorCore;
        if (!Core || !Core.enhance) return;
        if (!_pcEditor) {
            var ta = document.getElementById('pp-code-editor');
            if (ta) _pcEditor = Core.enhance(ta, 'html');
        }
        if (!_cssEditor) {
            var tc = document.getElementById('pp-custom-css');
            if (tc) _cssEditor = Core.enhance(tc, 'css');
        }
    }

    // Bahasa highlight mengikuti BERKAS yang sedang dibuka, bukan tab.
    function _bahasaUntuk(file) {
        if (!file) return 'html';
        if (/\.js$/i.test(file)) return 'js';
        if (/\.css$/i.test(file)) return 'css';
        return 'html';
    }

    function _pcHighlightBlock(file) {
        var logical = file === '__ext__' || (file && file.indexOf('extensions/') === 0)
            ? '__ext__' : file;
        document.querySelectorAll('#pc-block-picker .pc-block-btn').forEach(function (button) {
            button.classList.toggle('active', button.dataset.pcBlock === logical);
        });
    }

    function _pcLoadBlock(file) {
        var currentFile = (_pcBlock === '__ext__') ? _pcExtFile : _pcBlock;
        var sameExtensionGroup = file === '__ext__' && currentFile &&
            currentFile.indexOf('extensions/') === 0;
        if (_pcDirty && (sameExtensionGroup || _pcLoadedKey === _pcKey(file))) {
            // Render ulang dokumen yang sama bukan navigasi; pertahankan textarea.
            return Promise.resolve(true);
        }
        if (!_pcDirty) {
            _pcLoadBlockNow(file);
            return Promise.resolve(true);
        }
        return _resolveCodeDraft('membuka "' + file + '"').then(function (allowed) {
            if (!allowed) return false;
            _pcLoadBlockNow(file);
            return true;
        });
    }

    function _pcLoadBlockNow(file) {
        _pasangEditorKode();
        _pcSetBacaSaja(null);       // memuat berkas kreator = keluar dari mode lihat
        var ta = document.getElementById('pp-code-editor');
        var fileLabel = document.getElementById('pc-editor-file');
        var novel = window.currentlyEditingNovel || '';
        if (!ta || !novel) return;
        var requestId = ++_pcLoadRequestId;
        var requestScope = novel + '||' + _pcChapterArg();
        _pcHighlightBlock(file);

        // Keadaan berkas disegarkan tiap blok dibuka: aksi yang ditawarkan bergantung
        // pada BEDA antara "belum ada" dan "ada tapi dinonaktifkan" — dan `read-file`
        // melaporkan keduanya sebagai not-exists.
        //
        // Async & tak memblokir. `_pcLastExists` DIRESET dulu supaya render ulang di
        // bawah tak pernah memakai `exists` milik berkas SEBELUMNYA: kalau peta tiba
        // sebelum read-file, ia diam; kalau sesudah, ia render ulang dengan fakta yang
        // sama. Dua callback balapan, satu hasil.
        _pcLastExists = null;
        _pcRefreshFileStates().then(function () {
            if (requestId !== _pcLoadRequestId || requestScope !== novel + '||' + _pcChapterArg()) return;
            if (_pcBlock === file && _pcLastExists !== null) {
                _pcRenderFileActions(file, _pcLastExists);
            }
        });

        // Blok JS: file = extensions/<x>.js. Bila '__ext__' diminta, resolusi ke daftar.
        if (file === '__ext__') {
            ipcRenderer.invoke('player-code:list-extensions', { storyTitle: novel, chapter: _pcChapterArg() })
                .then(function (r) {
                    if (requestId !== _pcLoadRequestId || requestScope !== novel + '||' + _pcChapterArg()) return;
                    var files = (r && r.files) || [];
                    if (!files.length) {
                        _pcBlock = '__ext__'; _pcExtFile = null;
                        ta.value = ''; ta.disabled = true;
                        if (_pcEditor) _pcEditor.refresh();
                        if (fileLabel) fileLabel.textContent = '(belum ada extension)';
                        _pcSetStatus('klik "+ Extension" untuk membuat', false);
                        _pcLoadedKey = null;
                        _pcRenderNav('js', files);
                        _pcRenderFileActions('__ext__', false);
                        return;
                    }
                    _pcExtFile = (files.indexOf(_pcExtFile) !== -1) ? _pcExtFile : files[0];
                    _pcBlock = _pcExtFile;
                    _pcRenderNav('js', files);
                    _pcLoadBlockNow(_pcExtFile);
                });
            return;
        }

        ta.disabled = false;
        _pcBlock = (file.indexOf('extensions/') === 0) ? file : file;
        if (file.indexOf('extensions/') === 0) _pcExtFile = file;
        if (fileLabel) fileLabel.textContent = file;
        var requestedKey = _pcKey(file);
        ipcRenderer.invoke('player-code:read-file', { storyTitle: novel, chapter: _pcChapterArg(), file: file })
            .then(function (r) {
                if (requestId !== _pcLoadRequestId || requestedKey !== _pcKey(file)) return;
                ta.value = (r && r.content) || '';
                // Highlight & nomor baris tak tahu-menahu soal penulisan .value langsung.
                if (_pcEditor) { _pcEditor.setLanguage(_bahasaUntuk(file)); _pcEditor.refresh(); }
                _pcDirty = false;
                _pcLoadedKey = _pcKey(file);   // latch: baru boleh simpan setelah termuat
                _pcSetStatus((r && r.exists) ? 'tersimpan' : 'belum ada (simpan untuk membuat)', false);
                _pcRenderFileActions(file, !!(r && r.exists));
                if (file === 'player.html') { _pcRenderNav('html', ta.value); _pcRenderExtSelect([]); }
                else if (file.indexOf('extensions/') === 0) {
                    ipcRenderer.invoke('player-code:list-extensions', { storyTitle: novel, chapter: _pcChapterArg() })
                        .then(function (rr) { _pcRenderNav('js', (rr && rr.files) || []); });
                } else { _pcRenderNav('css'); _pcRenderExtSelect([]); }
            });
    }

    // ==========================================
    // POHON NODE (Tahap 3) + desain ulang visual (§9)
    // ==========================================
    // Teks player.html terakhir yang dipakai render nav — dipakai chevron untuk
    // render ulang tanpa memuat ulang berkas.
    var _pcLastHtml = '';
    // Id scene yang PUNYA isi (bisa dilipat) — dipakai Expand-all/Collapse-all (§10.2).
    var _pcCollapsibleIds = [];

    // Lipat/buka node scene, dipersistensi (key SENDIRI, jangan cemari Hub).
    var _pcTreeCollapsed = (function () {
        try { return new Set(JSON.parse(localStorage.getItem('vn_player_tree_collapsed') || '[]')); }
        catch (e) { return new Set(); }
    })();
    function _savePcTreeCollapsed() {
        try { localStorage.setItem('vn_player_tree_collapsed', JSON.stringify(Array.from(_pcTreeCollapsed))); } catch (e) {}
    }

    // Baca anak-node NYATA dari markup satu <section data-player-scene> (P0):
    // elemen ber-data-player-role / data-scene-action / data-node. Tak menciptakan
    // node sintetis — yang tak ada di file tak muncul.
    function _pcParseSceneNodes(sectionEl) {
        var out = [];
        if (!sectionEl) return out;
        (function walk(el, depth) {
            for (var i = 0; i < el.children.length; i++) {
                var c = el.children[i];
                var role = c.getAttribute('data-player-role');
                var act = c.getAttribute('data-scene-action');
                var node = c.getAttribute('data-node');
                if (role || act || node) {
                    out.push({
                        kind: role ? 'role' : (act ? 'action' : 'node'),
                        label: node || role || act,
                        depth: depth,
                        // Needle lompat editor — atribut paling spesifik.
                        needle: role ? ('data-player-role="' + role + '"')
                            : act ? ('data-scene-action="' + act + '"')
                                : ('data-node="' + node + '"')
                    });
                    walk(c, depth + 1);
                } else { walk(c, depth); }
            }
        })(sectionEl, 0);
        return out;
    }

    // Bangun satu item scene (anatomi §9: [chevron] [dot jenis] [nama / meta] ).
    // spec: { id, isBase, isInherited, jumpable, children }
    function _pcSceneItemEl(spec) {
        var item = document.createElement('div');
        item.className = 'pc-scene-item'
            + (spec.isBase ? ' pc-scene-base' : '')
            + (spec.isInherited ? ' pc-scene-inherited' : '');
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.dataset.sceneId = spec.id;
        if (spec.jumpable) item.dataset.jumpable = '1';

        var hasKids = !!(spec.children && spec.children.length);
        var collapsed = _pcTreeCollapsed.has(spec.id);
        var kindWord = spec.isBase ? 'base' : 'overlay';
        var badge = spec.isInherited ? (kindWord + ' · engine') : kindWord;

        item.innerHTML =
            (hasKids
                ? '<button type="button" class="pc-scene-chevron" title="Lipat/buka">' + (collapsed ? '▸' : '▾') + '</button>'
                : '<span class="pc-scene-chevron-spacer"></span>') +
            '<span class="pc-scene-kind-dot"></span>' +
            '<div class="pc-scene-main">' +
                '<span class="pc-scene-name">' + _escapeHtml(spec.id) + '</span>' +
                '<span class="pc-scene-meta">' +
                    '<span class="pc-scene-badge">' + _escapeHtml(badge) + '</span>' +
                    '<span class="pc-scene-tag">data-player-scene</span>' +
                '</span>' +
            '</div>';
        item.title = spec.isBase
            ? (spec.isInherited
                ? 'Blok DASAR bawaan engine — panggung tempat cerita berjalan. Disuntik runtime, tak ada barisnya di file ini: bisa dipratinjau, tak bisa dilompati di kode.'
                : 'Blok DASAR — panggung tempat cerita berjalan. Overlay melayang di atasnya, tidak menggantikannya.')
            : (spec.isInherited
                ? 'Layar overlay bawaan engine — disuntik runtime, bisa dipratinjau (mode Per-scene), tak bisa dilompati di kode.'
                : 'Blok overlay — melayang di atas layar cerita.');
        return item;
    }

    // Bungkus anak-node (pohon) sebuah scene.
    function _pcChildrenWrapEl(sceneId, children) {
        var wrap = document.createElement('div');
        wrap.className = 'pc-scene-children';
        children.forEach(function (ch) {
            var el = document.createElement('div');
            el.className = 'pc-scene-child';
            el.setAttribute('role', 'button');
            el.tabIndex = 0;
            el.dataset.sceneId = sceneId;
            el.dataset.nodeKind = ch.kind;
            el.dataset.needle = ch.needle;
            if (ch.depth) el.style.marginLeft = (ch.depth * 12) + 'px';
            var bullet = ch.kind === 'role' ? '•' : (ch.kind === 'action' ? '▸' : '◦');
            el.innerHTML =
                '<span class="pc-scene-child-bullet">' + bullet + '</span>' +
                '<span class="pc-scene-child-label">' + _escapeHtml(ch.label) + '</span>' +
                '<span class="pc-scene-child-chip">' + _escapeHtml(ch.kind) + '</span>';
            wrap.appendChild(el);
        });
        return wrap;
    }

    // Klik anak: pilih scene induk (sorot + semat preview) + lompat ke barisnya.
    function _pcSelectChild(childEl) {
        var sid = childEl.dataset.sceneId;
        if (sid) _pcSelectScene(sid);
        if (childEl.dataset.needle) _pcRevealInEditor(childEl.dataset.needle);
        var nav = document.getElementById('pc-scene-nav');
        if (nav) nav.querySelectorAll('.pc-scene-child').forEach(function (c) {
            c.classList.toggle('active', c === childEl);
        });
    }

    // Delegasi klik/keyboard (SEKALI) — kontainer statis, isinya rebuilt.
    (function initPcSceneNavDelegation() {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        nav.addEventListener('click', function (e) {
            var allbtn = e.target.closest('.pc-tree-allbtn');
            if (allbtn) {
                e.stopPropagation();
                if (allbtn.dataset.treeAll === 'collapse') {
                    _pcCollapsibleIds.forEach(function (id) { _pcTreeCollapsed.add(id); });
                } else {
                    _pcCollapsibleIds.forEach(function (id) { _pcTreeCollapsed.delete(id); });
                }
                _savePcTreeCollapsed();
                _pcRenderNav('html', _pcLastHtml);
                return;
            }
            // Aksi scene engine (#3/#4) — dicegat SEBELUM klik baris, supaya
            // "Lihat" tidak sekalian menyemat preview scene itu.
            var sact = e.target.closest('.pc-scene-act');
            if (sact) {
                e.stopPropagation();
                var sit = sact.closest('.pc-scene-item');
                var sid = sit && sit.dataset.sceneId;
                if (!sid) return;
                if (sact.dataset.sceneAct === 'lihat') _pcLihatSceneEngine(sid);
                else _pcAmbilScene(sid);
                return;
            }
            var chev = e.target.closest('.pc-scene-chevron');
            if (chev) {
                e.stopPropagation();
                var it = chev.closest('.pc-scene-item');
                var sid = it && it.dataset.sceneId;
                if (sid) {
                    if (_pcTreeCollapsed.has(sid)) _pcTreeCollapsed.delete(sid); else _pcTreeCollapsed.add(sid);
                    _savePcTreeCollapsed();
                    _pcRenderNav('html', _pcLastHtml);
                }
                return;
            }
            var child = e.target.closest('.pc-scene-child');
            if (child) { _pcSelectChild(child); return; }
            var item = e.target.closest('.pc-scene-item');
            if (!item || !item.dataset.sceneId) return;   // item extension (tanpa sceneId) diurus listener sendiri
            if (item.dataset.jumpable === '1') _pcRevealInEditor('data-player-scene="' + item.dataset.sceneId + '"');
            _pcSelectScene(item.dataset.sceneId);
        });
        nav.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var t = e.target;
            if (t && t.classList && (t.classList.contains('pc-scene-item') || t.classList.contains('pc-scene-child'))) {
                e.preventDefault(); t.click();
            }
        });
    })();

    // Navigator kiri: HTML → daftar scene (data-player-scene); JS → daftar extension.
    function _pcRenderNav(kind, data) {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        nav.innerHTML = '';
        // §10.3: kontrak peran DILEBUR ke node story (bukan panel melayang). Panel
        // #pc-role-contract lama selalu dikosongkan (auto-hide via :empty).
        var contract = document.getElementById('pc-role-contract');
        if (contract) contract.innerHTML = '';
        if (kind === 'html') {
            // PARSE sebagai DOM, bukan regex teks: template berisi CONTOH scene di
            // dalam komentar & baris dokumentasi (mis. data-player-scene="..." /
            // "nama"). Regex menangkapnya sebagai scene palsu; DOMParser hanya
            // melihat ELEMEN nyata — sesuai prinsip "editor membaca kenyataan".
            // Jenis blok (dasar vs overlay) ikut DIBACA dari berkas, bukan ditebak —
            // itulah bedanya dengan entri sintetis yang sempat dipakai.
            _pcLastHtml = String(data || '');   // simpan untuk render ulang chevron
            var blok = [];
            try {
                var doc = new DOMParser().parseFromString(_pcLastHtml, 'text/html');
                Array.prototype.forEach.call(
                    doc.querySelectorAll('[data-player-scene]'),
                    function (el) {
                        var id = el.getAttribute('data-player-scene');
                        if (!id || id === '__dynamic__') return;
                        blok.push({
                            id: id,
                            base: el.getAttribute('data-scene-mode') === 'base',
                            children: _pcParseSceneNodes(el)   // anak-node NYATA (Tahap 3)
                        });
                    }
                );
            } catch (e) { blok = []; }
            var ids = blok.map(function (b) { return b.id; });
            // Scene yang punya isi (bisa dilipat) → dasar Expand-all/Collapse-all (§10.2).
            _pcCollapsibleIds = blok.filter(function (b) { return b.children && b.children.length; })
                .map(function (b) { return b.id; });

            // Kepala nav: judul + kontrol lipat-semua/buka-semua (muncul bila ada yang bisa dilipat).
            var head = document.createElement('div');
            head.className = 'pc-scene-nav-head';
            var title = document.createElement('span');
            title.className = 'pc-scene-nav-title'; title.textContent = 'Layar player';
            head.appendChild(title);
            if (_pcCollapsibleIds.length) {
                var tools = document.createElement('span');
                tools.className = 'pc-scene-nav-tools';
                tools.innerHTML =
                    '<button type="button" class="pc-tree-allbtn" data-tree-all="expand" title="Buka semua node">⊞</button>' +
                    '<button type="button" class="pc-tree-allbtn" data-tree-all="collapse" title="Lipat semua node">⊟</button>';
                head.appendChild(tools);
            }
            nav.appendChild(head);

            // Scene BAWAAN engine: nyata saat dimainkan pada player 'global' &
            // 'engine-shim' (markup engine disuntik runtime), meski tak tertulis di
            // file kreator. Ditampilkan bertanda + tak bisa di-klik-lompat, karena
            // memang tidak ada barisnya di file ini. Engine 'custom' berdiri sendiri
            // (markup engine TIDAK disuntik) → tak ditampilkan.
            if (_activePlayerKind === 'engine-shim' || _activePlayerKind === 'global' || !_activePlayerKind) {
                ipcRenderer.invoke('player-code:engine-scenes').then(function (r) {
                    var eng = (r && r.scenes) || [];
                    if (!eng.length) return;
                    var host = document.getElementById('pc-scene-nav');
                    if (!host || host !== nav) return;   // navigator sudah di-render ulang
                    eng.filter(function (s) { return ids.indexOf(s.id) === -1; }).forEach(function (s) {
                        // Tak bisa dilompati di editor (tak ada barisnya di file ini),
                        // TAPI bisa dipratinjau: preview adalah runtime, dan di runtime
                        // markup engine sudah disuntik — jadi scene ini nyata di sana.
                        // Klik ditangani delegasi (jumpable=false → hanya semat preview).
                        var it = _pcSceneItemEl({
                            id: s.id, isBase: s.mode === 'base', isInherited: true,
                            jumpable: false, children: null
                        });
                        // #3/#4 — dua aksi pada baris scene ENGINE. Baris ini satu-
                        // satunya tempat scene bawaan terlihat, jadi di sinilah pintu
                        // "baca dulu" dan "ambil alih" berada.
                        //
                        // Layar cerita (base) DIKECUALIKAN: ia sudah punya pintu
                        // sendiri di kontrak peran, lengkap dengan ambil-alih
                        // per-peran. Dua tombol untuk pekerjaan yang sama, dengan
                        // akibat berbeda, adalah jebakan.
                        if (s.mode !== 'base') {
                            var act = document.createElement('span');
                            act.className = 'pc-scene-acts';
                            act.innerHTML =
                                '<button type="button" class="pc-scene-act" data-scene-act="lihat"' +
                                ' title="Tampilkan markup bawaan engine (hanya baca) — tanpa memilikinya">Lihat</button>' +
                                '<button type="button" class="pc-scene-act" data-scene-act="ambil"' +
                                ' title="Salin markup ini ke player.html-mu. Sesudah itu layar ini tak lagi ikut perbaikan engine.">Ambil alih</button>';
                            it.appendChild(act);
                        }
                        // Blok dasar selalu di puncak daftar — ia tanahnya, bukan salah satu overlay.
                        nav.insertBefore(it, s.mode === 'base' ? (nav.children[1] || null) : null);
                    });
                    _pcSyncAllHighlights();      // item async baru ikut disorot sesuai state
                    _pcAttachStoryContract();    // base WARISAN engine (shim tanpa takeover)
                }).catch(function () {});
            }

            if (!ids.length) {
                // Pesan kosong MEMBACA KENYATAAN, bukan kalimat generik:
                // (a) contoh scene yang masih dikomentari sering disalahpahami sebagai
                //     scene nyata — beri tahu bahwa tinggal dibuka komentarnya;
                // (b) pada engine-shim, markup engine (termasuk scene 'end') DISUNTIK
                //     runtime dan memang tak ada di file ini — jelaskan, jangan biarkan
                //     user mengira navigator melewatkannya.
                var teksMentah = String(data || '');
                var adaContohTerkomentari = /data-player-scene/.test(teksMentah);
                var e = document.createElement('div');
                e.className = 'pc-scene-empty';
                e.textContent = adaContohTerkomentari
                    ? 'Belum ada scene aktif — contoh di file ini masih di dalam komentar. Hapus tanda komentarnya untuk mengaktifkan.'
                    : 'Belum ada scene. Tambahkan <section data-player-scene="…"> di HTML.';
                nav.appendChild(e);
                if (_activePlayerKind === 'engine-shim') {
                    var s = document.createElement('div');
                    s.className = 'pc-scene-empty';
                    s.textContent = 'Catatan: layar bawaan engine (mis. "end") disuntik saat runtime, jadi tidak ada di file ini — hanya scene yang kamu tulis di sini yang terdaftar.';
                    nav.appendChild(s);
                }
                return;
            }
            blok.forEach(function (b) {
                // Base (non-custom) = tuan rumah KONTRAK peran (§10.3) → anaknya diisi
                // _pcAttachStoryContract, BUKAN node markup (owned tumpang-tindih kontrak).
                var contractBase = b.base && _activePlayerKind !== 'custom';
                // Klik & lompat ditangani delegasi (jumpable=true).
                var item = _pcSceneItemEl({
                    id: b.id, isBase: b.base, isInherited: false,
                    jumpable: true, children: contractBase ? null : b.children
                });
                nav.appendChild(item);
                if (!contractBase && b.children && b.children.length && !_pcTreeCollapsed.has(b.id)) {
                    nav.appendChild(_pcChildrenWrapEl(b.id, b.children));
                }
            });
            // Sorotan tiga-state (seleksi / semat Per-scene / sedang tampil Live) +
            // kontrak peran dilebur ke node base (§10.3) — hanya untuk blok HTML.
            _pcSyncAllHighlights();
            _pcAttachStoryContract();   // base milik FILE (bila di-takeover)
            _pcTandaiDrift(nav);        // #9 — layar diambil alih yang engine-nya sudah bergerak
        } else if (kind === 'js') {
            var files = data || [];
            _pcRenderExtSelect(files);
            var t2 = document.createElement('div');
            t2.className = 'pc-scene-nav-title'; t2.textContent = 'Extension (.js)';
            nav.appendChild(t2);
            if (!files.length) {
                var e2 = document.createElement('div'); e2.className = 'pc-scene-empty';
                e2.textContent = 'Belum ada extension.'; nav.appendChild(e2); return;
            }
            files.forEach(function (f) {
                var item = document.createElement('button');
                item.type = 'button'; item.className = 'pc-scene-item';
                item.innerHTML = '📄 <span class="pc-scene-tag">' + _escapeHtml(f.replace('extensions/', '')) + '</span>';
                if (f === _pcExtFile) item.style.borderColor = '#2e7d32';
                item.addEventListener('click', function () { _pcLoadBlock(f); });
                nav.appendChild(item);
            });
        }
        // CSS: nav kosong (disembunyikan via :empty).
    }

    // ==========================================
    // INSPEKTUR KONTRAK PERAN (tahap 3) — kerangka gameplay jadi TERLIHAT
    // ==========================================
    // Menjawab keluhan awal: klik blok gameplay tak menyorot apa pun karena
    // kerangkanya milik engine. Panel ini MEMBACA (bukan menebak) peran mana yang
    // dimiliki file kreator vs diwarisi engine vs hilang — dari player-code:role-map.
    var _RIB_LABEL = {   // ringkasan lapis untuk kepala grup
        1: 'Panggung cerita', 2: 'Kontrol & panel', 3: 'Audio'
    };
    // §10.3: kontrak DILEBUR jadi konten ekspansi node story. `host` = wrap anak di
    // bawah node base (bukan lagi panel melayang #pc-role-contract). `opts.onMissing`
    // dilaporkan SELALU — walau host null (mode "hitung saja" untuk badge saat terlipat).
    function _pcRenderRoleContract(host, opts) {
        opts = opts || {};
        var render = !!host;
        // Engine custom sejati berdiri sendiri → kontrak peran tak berlaku.
        if (_activePlayerKind === 'custom') { if (render) host.innerHTML = ''; if (opts.onMissing) opts.onMissing(0); return; }

        ipcRenderer.invoke('player-code:role-map', {
            storyTitle: window.currentlyEditingNovel || '',
            chapter: _pcChapterArg()
        }).then(function (r) {
            if (opts.onMissing) opts.onMissing((r && r.success && r.missing && r.missing.length) || 0);
            if (!render) return;                       // mode badge-only (node terlipat)
            if (!host.isConnected) return;
            host.innerHTML = '';
            if (!r || !r.success) return;

            var title = document.createElement('div');
            title.className = 'pc-scene-nav-title';
            title.textContent = 'Kontrak peran — layar gameplay';
            host.appendChild(title);

            if (!r.ownsStory) {
                // Potong 3b: daftar peran kini ditampilkan JUGA saat kreator belum
                // memiliki layar cerita — karena sejak dedup per-peran ia bisa
                // memiliki SATU bagian saja tanpa membekukan 43 lainnya. Dulu blok
                // ini `return` di sini, sehingga satu-satunya pilihan yang terlihat
                // adalah ambil-alih menyeluruh.
                var info = document.createElement('div');
                info.className = 'pc-role-note';
                info.innerHTML = 'Kerangka gameplay saat ini <b>milik engine</b> (ikut update). '
                    + 'Ambil alih <b>satu bagian</b> lewat tombol "ambil" di daftar bawah — sisanya '
                    + 'tetap milik engine dan tetap ikut update. Atau ambil alih seluruh layar '
                    + 'cerita bila memang ingin menyusun ulang strukturnya.';
                host.appendChild(info);

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'pc-role-takeover';
                btn.textContent = 'Ambil alih layar cerita (43 komponen, jadi milikmu seutuhnya)';
                btn.title = 'Salin SELURUH kerangka gameplay engine ke player.html-mu. '
                    + 'Sesudah ini perbaikan engine pada bagian-bagian itu tak lagi otomatis sampai.';
                btn.addEventListener('click', _pcTakeOverStory);
                host.appendChild(btn);
            }

            // Daftar cakupan peran per lapis.
            var perLapis = { 1: [], 2: [], 3: [] };
            (r.catalog || []).forEach(function (c) { (perLapis[c.lapis] || perLapis[2]).push(c); });
            var adaHilang = (r.missing || []).length > 0;

            [1, 2, 3].forEach(function (lapis) {
                var daftar = perLapis[lapis];
                if (!daftar.length) return;
                var owned = daftar.filter(function (c) { return c.status === 'owned'; }).length;
                var grpTitle = document.createElement('div');
                grpTitle.className = 'pc-role-group';
                grpTitle.textContent = _RIB_LABEL[lapis] + '   ' + owned + '/' + daftar.length;
                host.appendChild(grpTitle);

                daftar.forEach(function (c) {
                    var row = document.createElement('div');
                    row.className = 'pc-role-row pc-role-' + c.status;
                    // Penanda status lewat CSS (`data-status`), bukan glyph: kolom
                    // ikon dulu mengulang informasi yang sudah ditulis kolom lokasi
                    // di sebelahnya ("HILANG"/"engine"/"baris N") — dua kolom untuk
                    // satu fakta, di daftar yang panjang.
                    row.dataset.status = c.status;
                    var LOC = { owned: 'baris ' + c.line, missing: 'HILANG', omitted: 'tak dipakai', inherited: 'engine' };
                    var name = document.createElement('span');
                    name.className = 'pc-role-name'; name.textContent = c.role;
                    if (c.status === 'owned') {
                        // Seluruh baris owned = target lompat (lebih ramah diklik).
                        name.classList.add('pc-role-jump');
                        row.classList.add('pc-role-clickable');
                        row.title = 'Lompat ke baris ' + c.line;
                        row.addEventListener('click', function () {
                            _pcRevealInEditor('data-player-role="' + c.role + '"');
                        });
                    }
                    row.appendChild(name);
                    var loc = document.createElement('span');
                    loc.className = 'pc-role-loc'; loc.textContent = LOC[c.status];
                    row.appendChild(loc);

                    // Potong 3b — ambil alih SATU peran. Hanya untuk yang masih milik
                    // engine: peran `missing` tak ada di engine untuk disalin, dan
                    // `owned` sudah milikmu.
                    if (c.status === 'inherited') {
                        var amb = document.createElement('button');
                        amb.type = 'button'; amb.className = 'pc-role-ambil';
                        amb.textContent = 'ambil';
                        amb.title = 'Salin komponen ini ke player.html-mu'
                            + (c.keturunan && c.keturunan.length
                                ? ' — beserta ' + c.keturunan.length + ' peran di dalamnya, yang lalu jadi tanggung jawabmu'
                                : '')
                            + '. Sisanya tetap milik engine dan tetap ikut update.';
                        amb.addEventListener('click', function (e) {
                            e.stopPropagation();
                            _pcAmbilPeran(c);
                        });
                        row.appendChild(amb);
                    }

                    // Toggle "tak kupakai" / "pakai lagi" — hanya bermakna saat kreator
                    // MEMILIKI story (bisa menaruh data-player-omit). Peran owned tak
                    // ditawari (kamu memakainya). Peran inherited jadi missing dulu bila
                    // dihapus; tapi kita tawarkan langsung juga untuk kejelasan.
                    if (c.status === 'missing' || c.status === 'omitted') {
                        var tog = document.createElement('button');
                        tog.type = 'button'; tog.className = 'pc-role-toggle';
                        tog.textContent = c.status === 'omitted' ? 'pakai lagi' : 'tak kupakai';
                        tog.title = c.status === 'omitted'
                            ? 'Batalkan pengakuan — peran ini kembali ditandai perlu.'
                            : 'Akui peran ini memang tak dipakai — berhenti diperingatkan.';
                        tog.addEventListener('click', function (e) {
                            e.stopPropagation();
                            _pcToggleOmit(c, c.status !== 'omitted');
                        });
                        row.appendChild(tog);
                    }
                    host.appendChild(row);
                });
            });

            // POTONG 3b — DAFTAR UTANG. Mengambil sebuah peran memindahkan seluruh
            // subpohonnya; peran di dalamnya jadi tanggung jawab kreator. Ditampilkan
            // di sini alih-alih menunggu kreator menemukannya saat sesuatu mati.
            // Nilainya DIHITUNG main process (`utang`), bukan disusun ulang di sini —
            // dua salinan aturan yang sama pasti menyimpang.
            if ((r.utang || []).length) {
                var ut = document.createElement('div');
                ut.className = 'pc-role-utang';
                ut.innerHTML = '<b>Belum kamu sediakan</b> — ikut berpindah saat kamu mengambil '
                    + 'peran induknya:<br>' + r.utang.map(function (u) {
                        return '<code>' + u.role + '</code> &rarr; ' + u.belum.join(', ');
                    }).join('<br>');
                host.appendChild(ut);
            }

            if (adaHilang) {
                var warn = document.createElement('div');
                warn.className = 'pc-role-warn';
                warn.textContent = r.missing.length + ' peran hilang & belum diakui — '
                    + 'engine tetap jalan tapi bagian itu rusak. Tambahkan markup-nya, '
                    + 'atau tandai "tak kupakai" bila memang sengaja.';
                host.appendChild(warn);
            }
        }).catch(function () { if (opts.onMissing) opts.onMissing(0); if (render && host.isConnected) host.innerHTML = ''; });
    }

    // §10.3: LEBUR kontrak peran ke node base/story. Node base jadi tuan rumah kontrak —
    // chevron membuka/menutupnya sebagai ANAK node; badge ⚠ muncul saat terlipat bila ada
    // peran hilang (deteksi-ketiadaan tak hilang). Hanya shim/global (custom tak berkontrak).
    // Idempoten: dipanggil dari jalur sync (base milik file) & async engine (base warisan);
    // panggilan kedua di render pass yang sama jadi no-op (guard state).
    function _pcAttachStoryContract() {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        // Panel melayang lama tak dipakai lagi → kosongkan (auto-hide via :empty).
        var floatHost = document.getElementById('pc-role-contract');
        if (floatHost) floatHost.innerHTML = '';
        if (_activePlayerKind === 'custom') return;

        var baseItem = nav.querySelector('.pc-scene-item.pc-scene-base');
        if (!baseItem || !baseItem.dataset.sceneId) return;
        var sceneId = baseItem.dataset.sceneId;

        // Node base = punya isi (kontrak) → selalu bisa dilipat (dasar Expand/Collapse-all).
        if (_pcCollapsibleIds.indexOf(sceneId) === -1) _pcCollapsibleIds.push(sceneId);
        var collapsed = _pcTreeCollapsed.has(sceneId);
        var existingWrap = nav.querySelector('.pc-scene-contract-wrap');
        var chevron = baseItem.querySelector('.pc-scene-chevron');

        // Sudah terpasang & sesuai state (mis. panggilan async setelah sync) → no-op.
        if (chevron && ((collapsed && !existingWrap) || (!collapsed && existingWrap))) return;

        // Pastikan ada chevron (base warisan dibangun tanpa anak → punya spacer).
        var spacer = baseItem.querySelector('.pc-scene-chevron-spacer');
        if (spacer) {
            var chev = document.createElement('button');
            chev.type = 'button'; chev.className = 'pc-scene-chevron'; chev.title = 'Lipat/buka kontrak peran';
            chev.textContent = collapsed ? '▸' : '▾';
            spacer.parentNode.replaceChild(chev, spacer);
        } else if (chevron) {
            chevron.textContent = collapsed ? '▸' : '▾';
        }

        function setWarnBadge(n) {
            var badge = baseItem.querySelector('.pc-scene-warn-badge');
            if (n > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'pc-scene-warn-badge';
                    baseItem.appendChild(badge);
                }
                badge.textContent = '⚠' + n;
                badge.title = n + ' peran hilang & belum diakui — buka node ini untuk detail.';
            } else if (badge) { badge.remove(); }
        }

        if (existingWrap) existingWrap.remove();

        if (collapsed) {
            // Terlipat → tetap hitung missing untuk badge (host null = tak render isi).
            _pcRenderRoleContract(null, { onMissing: setWarnBadge });
            return;
        }

        // Terbuka → wrap kontrak = anak node story, tepat di bawah item base.
        var wrap = document.createElement('div');
        wrap.className = 'pc-scene-children pc-scene-contract-wrap';
        if (baseItem.nextSibling) nav.insertBefore(wrap, baseItem.nextSibling);
        else nav.appendChild(wrap);
        _pcRenderRoleContract(wrap, { onMissing: setWarnBadge });
    }

    // Peran fondasi: menghapusnya = gameplay dasar rusak. "Izinkan bebas" (keputusan
    // user): tetap boleh di-omit, tapi beri KILAS TEGAS dulu. Engine bukan pengasuh.
    var _PERAN_FONDASI = {
        stage: 'panggung & klik cerita hilang', dialogue: 'kotak dialog tak tampil',
        speaker: 'nama tokoh tak tampil', text: 'teks cerita tak tampil',
        transition: 'transisi antar-adegan mati', background: 'latar tak tampil'
    };

    function _pcToggleOmit(c, omit) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return;
        var lanjut = function () {
            // Ditangkap saat aksi dimulai — bukan dibaca ulang di dalam `then`,
            // karena di sanalah targetnya mungkin sudah berpindah (#7).
            var target = _pcTargetSnapshot();
            ipcRenderer.invoke('player-code:set-role-omit', {
                storyTitle: novel, chapter: _pcChapterArg(), role: c.role, omit: omit
            }).then(function (r) {
                if (r && r.success) {
                    VN.Toast.show(omit
                        ? 'Peran "' + c.role + '" ditandai tak dipakai — berhenti diperingatkan.'
                        : 'Peran "' + c.role + '" kembali ditandai perlu.', { type: 'info', duration: 5000 });
                    _pcRefreshSetelahMutasi(target);
                } else {
                    VN.Toast.error('Gagal: ' + ((r && r.message) || 'tidak diketahui'));
                }
            }).catch(function (e) { VN.Toast.error('Gagal: ' + e.message); });
        };
        // Kilas tegas hanya saat MENGAKUI-buang peran fondasi (bukan saat memakai lagi).
        if (omit && _PERAN_FONDASI[c.role]) {
            VN.Toast.show('Kamu membuang peran fondasi "' + c.role + '" — ' + _PERAN_FONDASI[c.role]
                + '. Yakin?', {
                type: 'warning', duration: 15000,
                actions: [{ label: 'Ya, buang', onClick: lanjut }]
            });
            return;
        }
        lanjut();
    }

    /**
     * POTONG 3b — ambil alih SATU peran (bukan seluruh layar cerita).
     *
     * Dua pengaman, keduanya MEMBERITAHU dan tak melarang:
     *   1. peringatan induk — peran ini berada di dalam wadah yang belum kamu
     *      miliki; mengambilnya sendirian tetap bekerja (engine mencari peran,
     *      bukan posisi) tapi elemennya mendarat di luar wadah itu;
     *   2. daftar utang — peran keturunan yang ikut berpindah jadi tanggung jawabmu.
     */
    function _pcAmbilPeran(c, force) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return;
        var target = _pcTargetSnapshot();
        ipcRenderer.invoke('player-code:take-over-role', {
            storyTitle: novel, chapter: _pcChapterArg(), role: c.role, force: force === true
        }).then(function (r) {
            if (r && r.success) {
                var utang = (r.keturunan || []).length;
                VN.Toast.show('Peran "' + r.role + '" kini milikmu'
                    + (utang ? ' — beserta ' + utang + ' peran di dalamnya' : '')
                    + '. Sisanya tetap milik engine.', { type: 'success', duration: 8000 });
                _pcRefreshSetelahMutasi(target);
                return;
            }
            if (r && r.needsConfirm) {
                // Konfirmasi mengundang aksi LANJUTAN pada target tertentu. Kalau
                // kreator sudah pindah, dialognya menyesatkan — tombol "Lanjutkan"
                // akan mengenai novel/chapter yang sedang dilihat sekarang.
                if (!_pcTargetMasihAktif(target)) return;
                showConfirmation(r.message + '\n\nLanjutkan?').then(function (ok) {
                    if (ok && _pcTargetMasihAktif(target)) _pcAmbilPeran(c, true);
                });
                return;
            }
            if (r && r.alreadyOwned) {
                VN.Toast.info(r.message);
                if (_pcTargetMasihAktif(target)) _pcAttachStoryContract();
                return;
            }
            VN.Toast.error('Gagal: ' + ((r && r.message) || 'tidak diketahui'));
        }).catch(function (e) { VN.Toast.error('Gagal ambil peran: ' + e.message); });
    }

    /**
     * #9 — tandai scene yang KAMU ambil alih, tapi engine-nya sudah bergerak.
     *
     * Sifatnya memberitahu, bukan menuntut: tak ada tombol "perbarui otomatis".
     * Menimpa salinan kreator dengan markup engine akan membuang suntingannya —
     * dan suntingan itulah alasan ia mengambil alih sejak awal. Yang ditawarkan
     * cuma jalan MELIHAT versi engine terkini (#3), lalu ia yang memutuskan.
     */
    function _pcTandaiDrift(nav) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel || !nav) return;
        ipcRenderer.invoke('player-code:scene-drift', {
            storyTitle: novel, chapter: _pcChapterArg()
        }).then(function (r) {
            if (!r || !r.success || !nav.isConnected) return;
            (r.scenes || []).filter(function (s) { return s.drift; }).forEach(function (s) {
                var row = nav.querySelector('.pc-scene-item[data-scene-id="' + s.nama + '"]');
                // Baris WARISAN tak pernah ditandai: capnya ada di berkas kreator,
                // jadi kalau barisnya masih warisan berarti scene-nya sudah dihapus
                // lagi dan yang tampil adalah milik engine — tak ada yang ketinggalan.
                if (!row || row.classList.contains('pc-scene-inherited')) return;
                row.classList.add('pc-scene-drift');
                row.title = 'Layar ini kamu ambil alih (dasar engine ' + s.dasar + '), '
                    + 'dan engine sudah memperbaruinya sejak itu (' + s.sekarang + '). '
                    + 'Salinanmu tetap dipakai — klik "Versi engine" untuk melihat yang terbaru.';
                var meta = row.querySelector('.pc-scene-meta');
                if (meta && !meta.querySelector('.pc-scene-drift-badge')) {
                    var b = document.createElement('span');
                    b.className = 'pc-scene-drift-badge';
                    b.textContent = 'engine berubah';
                    meta.appendChild(b);
                }
                if (!row.querySelector('.pc-scene-acts')) {
                    var act = document.createElement('span');
                    act.className = 'pc-scene-acts';
                    act.innerHTML = '<button type="button" class="pc-scene-act" data-scene-act="lihat"'
                        + ' title="Tampilkan markup engine TERKINI untuk layar ini (hanya baca).'
                        + ' Salinanmu tidak disentuh.">Versi engine</button>';
                    row.appendChild(act);
                }
            });
        }).catch(function () {});
    }

    /**
     * #3 — LIHAT markup scene bawaan engine tanpa memilikinya.
     *
     * Engine yang menyalin screen ke folder proyek tak bisa menawarkan ini: di
     * sana membaca markup bawaan berarti sudah men-fork-nya. Karena markup engine
     * kita disuntik saat runtime, ia bisa dibaca sebagai rujukan dan tetap ikut
     * update selama kreator belum mengambilnya.
     */
    async function _pcLihatSceneEngine(nama) {
        if (!await _resolveCodeDraft('melihat scene engine "' + nama + '"')) return;
        _pasangEditorKode();
        var ta = document.getElementById('pp-code-editor');
        if (!ta) return;
        ipcRenderer.invoke('player-code:engine-scene-markup', { scene: nama }).then(function (r) {
            if (!r || !r.success) {
                VN.Toast.error('Gagal membaca markup engine: ' + ((r && r.message) || 'tidak diketahui'));
                return;
            }
            ta.disabled = false;
            ta.value = r.html;
            // Latch simpan DIPUTUS: isi textarea bukan berkas kreator mana pun.
            _pcLoadedKey = null;
            _pcDirty = false;
            _pcSetBacaSaja(nama);
            if (_pcEditor) { _pcEditor.setLanguage('html'); _pcEditor.refresh(); }
            var fileLabel = document.getElementById('pc-editor-file');
            if (fileLabel) fileLabel.textContent = 'vn-player/player.html › scene "' + nama + '"';
            _pcSetStatus('hanya baca — markup bawaan engine, masih ikut update', false);
        }).catch(function (e) { VN.Toast.error('Gagal membaca markup engine: ' + e.message); });
    }

    /**
     * #4 — AMBIL ALIH satu scene engine.
     *
     * Sengaja tanpa dialog konfirmasi: berbeda dari ambil-alih PERAN, scene
     * adalah satu blok utuh tanpa keturunan milik orang lain — tak ada daftar
     * utang yang perlu dibacakan lebih dulu. Yang wajib sampai cuma SATU
     * kalimat, dan ia disampaikan sesudahnya (memberitahu, bukan menahan) serta
     * ditulis sekalian sebagai komentar di markup yang mendarat.
     */
    function _pcAmbilScene(nama) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return;
        var target = _pcTargetSnapshot();
        ipcRenderer.invoke('player-code:take-over-scene', {
            storyTitle: novel, chapter: _pcChapterArg(), scene: nama
        }).then(function (r) {
            if (r && r.success) {
                VN.Toast.show('Scene "' + r.nama + '" kini milikmu. '
                    + 'Sejak kamu mengambilnya, layar ini tak lagi ikut perbaikan engine.',
                    { type: 'success', duration: 10000 });
                _pcRefreshSetelahMutasi(target);
                return;
            }
            if (r && r.alreadyOwned) {
                VN.Toast.info(r.message);
                if (_pcTargetMasihAktif(target)) _pcLoadBlock('player.html');
                return;
            }
            VN.Toast.error('Gagal: ' + ((r && r.message) || 'tidak diketahui'));
        }).catch(function (e) { VN.Toast.error('Gagal ambil alih scene: ' + e.message); });
    }

    function _pcTakeOverStory() {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return;
        var target = _pcTargetSnapshot();
        ipcRenderer.invoke('player-code:take-over-story', {
            storyTitle: novel, chapter: _pcChapterArg()
        }).then(function (r) {
            if (r && r.success) {
                VN.Toast.show('Layar cerita diambil alih — ' + (r.roles || []).length
                    + ' peran kini di player.html-mu. Susun ulang sesukamu.', { type: 'success', duration: 8000 });
                // Muat ulang blok HTML (file berubah) → navigator, editor, kontrak segar.
                _pcRefreshSetelahMutasi(target);
            } else if (r && r.alreadyOwned) {
                VN.Toast.info('Layar cerita sudah kamu miliki.');
                if (_pcTargetMasihAktif(target)) _pcAttachStoryContract();
            } else {
                VN.Toast.error('Gagal: ' + ((r && r.message) || 'tidak diketahui'));
            }
        }).catch(function (e) { VN.Toast.error('Gagal ambil alih: ' + e.message); });
    }

    // Pemilih extension di kepala editor (blok JS). Disembunyikan untuk blok lain
    // supaya kepala editor tidak memamerkan kontrol yang tak berlaku.
    function _pcRenderExtSelect(files) {
        var sel = document.getElementById('pc-ext-select');
        if (!sel) return;
        var daftar = files || [];
        var relevan = _pcBlock === '__ext__' || (_pcBlock && _pcBlock.indexOf('extensions/') === 0);
        if (!relevan || daftar.length < 1) { sel.style.display = 'none'; return; }
        sel.style.display = '';
        sel.innerHTML = '';
        daftar.forEach(function (f) {
            var opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f.replace('extensions/', '');
            if (f === _pcExtFile) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = function () {
            var requested = sel.value;
            _pcLoadBlock(requested).then(function (allowed) {
                if (!allowed && _pcExtFile) sel.value = _pcExtFile;
            });
        };
    }

    function _pcRevealInEditor(needle) {
        // Editor ber-highlight punya revealMatch sendiri yang IKUT menggeser layer
        // highlight & nomor baris. Menggulir textarea langsung akan membuat teks
        // berwarna di belakangnya tertinggal.
        if (_pcEditor && _pcEditor.revealMatch) { _pcEditor.revealMatch(needle); return; }
        var ta = document.getElementById('pp-code-editor');
        if (!ta) return;
        var idx = ta.value.indexOf(needle);
        if (idx < 0) return;
        ta.focus();
        ta.setSelectionRange(idx, idx + needle.length);
        var line = ta.value.slice(0, idx).split('\n').length - 1;
        var lineH = parseFloat(getComputedStyle(ta).lineHeight) || 19;
        ta.scrollTop = Math.max(0, line * lineH - ta.clientHeight / 2);
    }

    function _escapeHtml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- Aksi DAUR HIDUP berkas, kontekstual pada berkas yang sedang dibuka ----
    // Menggantikan dua section terpisah (Berkas + Player Chapter) yang dulu
    // mendaftar ulang ketiga berkas → tiap berkas muncul 2-3 kali. Kini: aksi
    // menempel pada blok/fokus aktif, jadi tiap berkas tampil sekali.
    function _pcActionBtn(label, action, opts) {
        opts = opts || {};
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pc-file-btn' + (opts.cls ? ' ' + opts.cls : '');
        b.textContent = label;
        b.dataset.pcFile = action;
        if (opts.file) b.dataset.file = opts.file;
        if (opts.title) b.title = opts.title;
        return b;
    }

    // Keadaan berkas TARGET AKTIF ('aktif' | 'nonaktif' | 'tidak-ada' per berkas).
    // Dibutuhkan karena "tidak ada" dan "ada tapi ditepikan" menuntut tawaran aksi
    // yang berbeda — dan `read-file` tak bisa membedakannya (keduanya not-exists).
    var _pcFileStates = null;
    // `exists` terakhir yang dipakai merender aksi — supaya render ulang (saat peta
    // keadaan tiba belakangan) memakai fakta yang sama, bukan menebak ulang.
    var _pcLastExists = null;

    function _pcRefreshFileStates() {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) { _pcFileStates = null; return Promise.resolve(); }
        var ch = _pcChapterArg();
        return ipcRenderer.invoke('player-code:scope-map', { storyTitle: novel })
            .then(function (r) {
                if (!r || !r.success) { _pcFileStates = null; return; }
                _pcFileStates = ch ? ((r.chapters || {})[ch] || null) : (r.novel || null);
            })
            .catch(function () { _pcFileStates = null; });
    }

    function _pcRenderFileActions(file, exists) {
        var host = document.getElementById('pc-file-actions');
        if (!host) return;
        _pcLastExists = !!exists;
        host.innerHTML = '';
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';
        var scopeTxt = isChapter ? 'chapter ini' : 'novel ini';

        if (file === 'player.html') {
            if (exists) {
                host.appendChild(_pcActionBtn('Reset dari Template', 'player-reset', {
                    title: 'Timpa player.html dengan template engine bawaan terbaru'
                }));
                // Nonaktifkan = rename `.off`. Ditaruh SEBELUM Hapus supaya jalan yang
                // bisa dibatalkan lebih dulu terlihat daripada yang tidak.
                host.appendChild(_pcActionBtn('Nonaktifkan', 'file-disable', {
                    file: 'player.html',
                    title: 'Ganti nama jadi player.html.off — runtime memakai player di atasnya, '
                        + 'berkasmu tetap utuh dan bisa diaktifkan lagi kapan saja'
                }));
                host.appendChild(_pcActionBtn('Hapus', 'player-remove', {
                    cls: 'pc-file-danger',
                    title: 'Hapus player.html — ' + scopeTxt + ' kembali memakai player di atasnya'
                }));
                host.appendChild(_pcActionBtn('VS Code', 'open', { file: 'player.html', title: 'Buka di VS Code' }));
            } else if (_pcFileStates && _pcFileStates.player === 'nonaktif') {
                // Berkasnya ADA tapi ditepikan — jangan tawarkan "Buat", tawarkan pulang.
                host.appendChild(_pcActionBtn('Aktifkan kembali', 'file-enable', {
                    cls: 'pc-file-primary', file: 'player.html',
                    title: 'Kembalikan player.html.off jadi player.html'
                }));
            } else {
                host.appendChild(_pcActionBtn('Buat: Engine Penuh', 'player-engine', {
                    cls: 'pc-file-primary', title: 'player.html dari vn_player_template — engine lengkap siap diedit'
                }));
                host.appendChild(_pcActionBtn('Buat: Starter Minimal', 'player-starter', {
                    title: 'player.html minimal murni VNPlayer API — tulis engine dari nol'
                }));
            }
        } else if (file === 'theme.css') {
            // Sesudah N5, INILAH rumah kosmetik — jadi ia butuh jalan coba-coba yang
            // sama dengan player.html: nonaktifkan tanpa kehilangan.
            if (exists) {
                host.appendChild(_pcActionBtn('Nonaktifkan', 'file-disable', {
                    file: 'theme.css',
                    title: 'Ganti nama jadi theme.css.off — cascade melewatinya, berkasmu tetap utuh'
                }));
                host.appendChild(_pcActionBtn('VS Code', 'open', { file: 'theme.css', title: 'Buka di VS Code' }));
            } else if (_pcFileStates && _pcFileStates.theme === 'nonaktif') {
                host.appendChild(_pcActionBtn('Aktifkan kembali', 'file-enable', {
                    cls: 'pc-file-primary', file: 'theme.css',
                    title: 'Kembalikan theme.css.off jadi theme.css'
                }));
            }
        } else if (file && file.indexOf('extensions/') === 0) {
            host.appendChild(_pcActionBtn('+ Extension', 'ext-new', {
                cls: 'pc-file-primary', title: 'Buat starter extension (VNRegistry) di ' + scopeTxt
            }));
            host.appendChild(_pcActionBtn('VS Code', 'open', { file: file, title: 'Buka di VS Code' }));
            host.appendChild(_pcActionBtn('Hapus', 'ext-remove', { cls: 'pc-file-danger', file: file, title: 'Hapus ' + file }));
        } else {
            // Blok JS tanpa extension sama sekali.
            host.appendChild(_pcActionBtn('+ Extension', 'ext-new', {
                cls: 'pc-file-primary', title: 'Buat starter extension (VNRegistry) di ' + scopeTxt
            }));
        }
        _pcRenderHookHint(file);
    }

    /**
     * Daftar titik hook di blok JS (F5).
     *
     * Sebelum ini, satu-satunya cara mengetahui hook itu ada adalah MEMBUAT extension
     * lebih dulu (header scaffold-nya menyebutkannya) atau membaca sumber engine —
     * audit F5 mencatat nol nama hook di seluruh `vnModules/`. Sekarang daftarnya
     * tampil sebelum kreator menulis apa pun.
     *
     * Isinya DITURUNKAN dari panggilan `runHooks()` nyata di engine, bukan ditulis di
     * sini: daftar tulisan tangan sudah pernah basi sekali (scaffold menyebut 4 dari 5).
     */
    function _pcRenderHookHint(file) {
        var host = document.getElementById('pc-hook-hint');
        if (!host) return;
        var blokJS = file === null || file === undefined || /^extensions\//.test(file) ||
            (typeof _pcBlock !== 'undefined' && _pcBlock === '__ext__');
        var hooks = [];
        try {
            if (VN.PlayerCapabilities && typeof VN.PlayerCapabilities.getHooks === 'function') {
                hooks = VN.PlayerCapabilities.getHooks() || [];
            }
        } catch (e) { /* pemindai tak tersedia → sembunyikan, jangan mengarang daftar */ }

        if (!blokJS || !hooks.length) { host.style.display = 'none'; host.innerHTML = ''; return; }
        host.style.display = '';
        host.innerHTML = '<strong>Titik hook engine</strong> — ' +
            '<code>VNRegistry.registerHook(&lt;titik&gt;, fn)</code>: ' +
            hooks.map(function (h) { return '<code>' + escapePlayerHTML(h) + '</code>'; }).join(' · ') +
            ' <span class="pc-hook-note">(dibaca dari panggilan <code>runHooks()</code> di engine — ' +
            'bukan daftar tulisan tangan)</span>';
    }

    // Aksi theme.css untuk fokus Gaya (kolom kanan editor CSS mentah).
    function _pcRenderCssActions() {
        var host = document.getElementById('pc-css-actions');
        if (!host) return;
        host.innerHTML = '';
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return;
        ipcRenderer.invoke('player-code:read-file', {
            storyTitle: novel, chapter: _pcChapterArg(), file: 'theme.css'
        }).then(function (r) {
            host.innerHTML = '';
            if (r && r.exists) {
                host.appendChild(_pcActionBtn('💻 VS Code', 'open', { file: 'theme.css', title: 'Buka theme.css di VS Code' }));
                host.appendChild(_pcActionBtn('🗑 Hapus', 'theme-remove', { cls: 'pc-file-danger', title: 'Hapus theme.css scope ini' }));
            } else {
                host.appendChild(_pcActionBtn('+ Buat theme.css', 'theme-new', {
                    cls: 'pc-file-primary', title: 'Buat theme.css berisi panduan CSS variables engine'
                }));
            }
        }).catch(function () {});
    }

    // Delegasi aksi berkas (dipasang sekali; dua host, satu handler).
    (function initFileActionsDelegation() {
        function handler(e) {
            var b = e.target.closest('[data-pc-file]');
            if (!b) return;
            var novel = window.currentlyEditingNovel || '';
            if (!novel) return;
            var chapter = _pcChapterArg();
            var act = b.dataset.pcFile;

            (async function () {
                if (act === 'open') {
                    var ro = await ipcRenderer.invoke('player-code:open', { storyTitle: novel, chapter: chapter, file: b.dataset.file });
                    if (ro && ro.success) VN.Toast.info('Membuka ' + (b.dataset.file || 'folder') + ' (VS Code, atau Explorer bila VS Code tak terpasang)…');
                    else VN.Toast.error('Gagal membuka: ' + ((ro && ro.message) || 'tak diketahui'));
                    return;
                }
                var draftAllowed = (act === 'theme-new' || act === 'theme-remove')
                    ? await _resolvePlayerCodeDrafts('mengubah theme.css')
                    : await _resolveCodeDraft('mengubah berkas Player');
                if (!draftAllowed) return;
                if (act === 'player-engine' || act === 'player-starter' || act === 'player-reset') {
                    var tpl = act === 'player-starter' ? 'starter' : 'engine';
                    if (act === 'player-reset') {
                        var okR = await showConfirmation('Reset player.html dari template engine? Semua perubahan kode di file itu akan DITIMPA.');
                        if (!okR) return;
                    }
                    var sc = await ipcRenderer.invoke('chapter-player:scaffold', {
                        storyTitle: novel, chapter: chapter, template: tpl, overwrite: act === 'player-reset'
                    });
                    if (sc && sc.success) {
                        VN.Toast.success('player.html ' + (act === 'player-reset' ? 'di-reset' : 'dibuat') + '.');
                        _pcLoadBlock('player.html');
                        refreshPlayerPreview();
                    } else VN.Toast.error('Gagal: ' + ((sc && sc.message) || 'unknown'));
                    return;
                }
                if (act === 'file-disable' || act === 'file-enable') {
                    // Nonaktif = rename `<berkas>.off`. Nol konfirmasi untuk MENONAKTIFKAN:
                    // aksinya bisa dibatalkan sepenuhnya, dan dialog untuk hal yang
                    // reversibel cuma mengajari kreator mengabaikan dialog.
                    var aktifkan = act === 'file-enable';
                    var target = b.dataset.file;
                    var rs = await ipcRenderer.invoke('player-code:set-file-enabled', {
                        storyTitle: novel, chapter: chapter, file: target, enabled: aktifkan
                    });
                    if (rs && rs.success) {
                        VN.Toast.info(aktifkan
                            ? target + ' diaktifkan kembali.'
                            : target + ' dinonaktifkan (berkas disimpan sebagai ' + target + '.off, tidak dihapus).');
                        await _pcRefreshFileStates();
                        _pcLoadBlock(target);
                        if (typeof renderPlayerTargetList === 'function') renderPlayerTargetList();
                        refreshPlayerPreview();
                    } else VN.Toast.error('Gagal: ' + ((rs && rs.message) || 'unknown'));
                    return;
                }
                if (act === 'player-remove') {
                    var okD = await showConfirmation('Hapus player.html? Target ini akan kembali memakai player di atasnya (novel/engine). Tidak bisa dibatalkan.');
                    if (!okD) return;
                    var rm = await ipcRenderer.invoke('chapter-player:remove', { storyTitle: novel, chapter: chapter });
                    if (rm && rm.success) {
                        VN.Toast.info('player.html dihapus.');
                        _pcLoadBlock('player.html');
                        refreshPlayerPreview();
                    } else VN.Toast.error('Gagal menghapus.');
                    return;
                }
                if (act === 'ext-new') {
                    var nm = await showPrompt('Nama extension baru (tanpa .js):', 'my-extension');
                    if (!nm) return;
                    var se = await ipcRenderer.invoke('player-code:scaffold-extension', { storyTitle: novel, chapter: chapter, name: nm });
                    if (se && se.success) {
                        VN.Toast.success('Extension dibuat.');
                        _pcExtFile = se.file || null;
                        _pcLoadBlock('__ext__');
                    } else VN.Toast.error('Gagal: ' + ((se && se.message) || 'unknown'));
                    return;
                }
                if (act === 'ext-remove') {
                    var okE = await showConfirmation('Hapus ' + b.dataset.file + '?');
                    if (!okE) return;
                    var re = await ipcRenderer.invoke('player-code:remove', { storyTitle: novel, chapter: chapter, file: b.dataset.file });
                    if (re && re.success) {
                        VN.Toast.info('Extension dihapus.');
                        _pcExtFile = null;
                        _pcLoadBlock('__ext__');
                    } else VN.Toast.error('Gagal menghapus.');
                    return;
                }
                if (act === 'theme-new') {
                    var st = await ipcRenderer.invoke('player-code:scaffold-theme', { storyTitle: novel, chapter: chapter });
                    if (st && st.success) { VN.Toast.success('theme.css dibuat.'); _pcRenderCssActions(); renderCSSVarsSection(); refreshPlayerPreview(); }
                    else VN.Toast.error('Gagal membuat theme.css.');
                    return;
                }
                if (act === 'theme-remove') {
                    var okT = await showConfirmation('Hapus theme.css? Gaya kustom scope ini hilang dari player.');
                    if (!okT) return;
                    var rt = await ipcRenderer.invoke('player-code:remove', { storyTitle: novel, chapter: chapter, file: 'theme.css' });
                    if (rt && rt.success) { VN.Toast.info('theme.css dihapus.'); _pcRenderCssActions(); renderCSSVarsSection(); refreshPlayerPreview(); }
                    else VN.Toast.error('Gagal menghapus.');
                }
            })();
        }
        var a = document.getElementById('pc-file-actions');
        var c = document.getElementById('pc-css-actions');
        if (a) a.addEventListener('click', handler);
        if (c) c.addEventListener('click', handler);
    })();

    async function _pcSave() {
        // Mode lihat: tombolnya berbunyi "Kembali ke berkasmu", dan itulah yang
        // ia lakukan. Guard di SINI (bukan hanya di latch `_pcLoadedKey`) supaya
        // pintasan keyboard mana pun ikut tertutup.
        if (_pcBacaSaja) { await _pcLoadBlock(_pcBlock || 'player.html'); return false; }
        var ta = document.getElementById('pp-code-editor');
        var novel = window.currentlyEditingNovel || '';
        var file = (_pcBlock === '__ext__') ? _pcExtFile : _pcBlock;
        if (!ta || !novel || !file) return false;
        // Guard FB18: jangan menulis kalau editor belum benar-benar memuat berkas ini.
        if (_pcLoadedKey !== _pcKey(file)) {
            VN.Toast.error('Editor belum memuat berkas ini — buka ulang tab Code.');
            return false;
        }
        var savedKey = _pcLoadedKey;
        var savedContent = ta.value;
        try {
            await VN.Utils.invokeChecked(ipcRenderer, 'player-code:write-file',
                { storyTitle: novel, chapter: _pcChapterArg(), file: file, content: savedContent });
            // Mengetik selama write berlangsung menghasilkan revisi baru. Disk memang
            // menerima snapshot lama, tetapi draft TERKINI belum tersimpan dan guard
            // navigasi tidak boleh menganggap operasi ini complete.
            var currentRevisionSaved = _pcLoadedKey === savedKey && ta.value === savedContent;
            _pcDirty = !currentRevisionSaved;
            _pcSetStatus(currentRevisionSaved ? 'tersimpan' : 'ada perubahan baru', !currentRevisionSaved);
            if (file === 'player.html') _pcRenderNav('html', savedContent); // scene di disk
            if (typeof refreshPlayerPreview === 'function') refreshPlayerPreview();
            return currentRevisionSaved;
        } catch (e) {
            // Dirty dan loaded-key dipertahankan agar retry menulis dokumen yang sama.
            VN.Toast.error('Gagal simpan: ' + (e.message || 'unknown'));
            return false;
        }
    }

    // Delegasi UI editor kode (dipasang sekali).
    (function initCodeEditorDelegation() {
        var focusSw = document.getElementById('pc-focus-switcher');
        if (focusSw) focusSw.addEventListener('click', function (e) {
            var b = e.target.closest('.pc-focus-btn');
            if (b) setCodeFocus(b.dataset.focus);
        });
        var picker = document.getElementById('pc-block-picker');
        if (picker) picker.addEventListener('click', function (e) {
            var b = e.target.closest('.pc-block-btn');
            if (!b) return;
            _pcLoadBlock(b.dataset.pcBlock);
        });
        var ta = document.getElementById('pp-code-editor');
        if (ta) ta.addEventListener('input', function () {
            _pcDirty = true; _pcSetStatus('belum disimpan', true);
        });
        var saveBtn = document.getElementById('pc-editor-save');
        if (saveBtn) saveBtn.addEventListener('click', _pcSave);
    })();

    // (renderCodeFilesSection DIHAPUS 2026-07-30 — containernya
    //  (#player-code-files-content) dibuang saat "Berkas" disajikan ulang; tiap
    //  berkas dulu muncul 2-3 kali. Penggantinya #pc-file-actions + tab Code.)

    // Delegation aksi code-first files (sekali).
    (function initCodeFilesDelegation() {
        var container = document.getElementById('player-code-files-content');
        if (!container) return;
        container.addEventListener('click', async function (e) {
            var btn = e.target.closest('[data-pc-action]');
            var novel = window.currentlyEditingNovel || '';
            if (!btn || !novel) return;
            var action = btn.dataset.pcAction;
            var chapter = btn.dataset.chapter || '';
            var scopeLabel = chapter || 'novel';

            if (action === 'scaffold-theme') {
                var r = await ipcRenderer.invoke('player-code:scaffold-theme', { storyTitle: novel, chapter: chapter });
                if (r && r.success) {
                    VN.Toast.success('theme.css dibuat (' + scopeLabel + ') — membuka VS Code…');
                    ipcRenderer.invoke('player-code:open', { storyTitle: novel, chapter: chapter, file: 'theme.css' });
                    refreshPlayerPreview();
                } else VN.Toast.error('Gagal: ' + ((r && r.message) || 'unknown'));
            } else if (action === 'open-theme') {
                ipcRenderer.invoke('player-code:open', { storyTitle: novel, chapter: chapter, file: 'theme.css' });
            } else if (action === 'remove-theme') {
                var okT = await showConfirmation('Hapus theme.css (' + scopeLabel + ')? Gaya kustom scope ini hilang dari player.');
                if (!okT) return;
                var rT = await ipcRenderer.invoke('player-code:remove', { storyTitle: novel, chapter: chapter, file: 'theme.css' });
                if (rT && rT.success) { VN.Toast.info('theme.css dihapus (' + scopeLabel + ').'); refreshPlayerPreview(); }
                else VN.Toast.error('Gagal: ' + ((rT && rT.message) || 'unknown'));
            } else if (action === 'scaffold-ext') {
                var name = await showPrompt('Nama extension baru (huruf/angka/dash/underscore):', 'my-extension');
                if (name === null || !String(name).trim()) return;
                var rE = await ipcRenderer.invoke('player-code:scaffold-extension', { storyTitle: novel, chapter: chapter, name: name });
                if (rE && rE.success) {
                    VN.Toast.success('Extension "' + rE.file + '" dibuat (' + scopeLabel + ') — membuka VS Code…');
                    ipcRenderer.invoke('player-code:open', { storyTitle: novel, chapter: chapter, file: 'extensions/' + rE.file });
                    if (VN.PlayerCapabilities) VN.PlayerCapabilities.invalidate(); // dropdown D8 ikut segar
                } else VN.Toast.error('Gagal: ' + ((rE && rE.message) || 'unknown'));
            } else if (action === 'open-ext') {
                ipcRenderer.invoke('player-code:open', { storyTitle: novel, chapter: chapter, file: 'extensions/' + btn.dataset.file });
            } else if (action === 'remove-ext') {
                var okE = await showConfirmation('Hapus extension "' + btn.dataset.file + '" (' + scopeLabel + ')?');
                if (!okE) return;
                var rD = await ipcRenderer.invoke('player-code:remove', { storyTitle: novel, chapter: chapter, file: 'extensions/' + btn.dataset.file });
                if (rD && rD.success) {
                    VN.Toast.info('Extension dihapus.');
                    if (VN.PlayerCapabilities) VN.PlayerCapabilities.invalidate(); // dropdown D8 ikut segar
                }
                else VN.Toast.error('Gagal: ' + ((rD && rD.message) || 'unknown'));
            }
        });
    })();

    // ==========================================
    // MASTER RENDER
    // ==========================================
    function renderPlayerProfilePanel() {
        renderPlayerTargetList();               // sidebar target (select-first)
        selectPlayerTarget(_activePlayerTarget); // auto-select Global saat masuk panel
        renderThemeSection();
        renderRestrictionsSection();
        // Catatan: chapter-config, effective-config & css-vars dirender per target aktif
        // oleh showPlayerTab (renderChapterGaya / renderEffectiveForActiveTarget /
        // renderCSSVarsSection), bukan di mount path — agar tidak menimpa view saat panel
        // di-remount dengan target chapter.
        initPlayerPreview();
    }

    // ==========================================
    // PLAYER PREVIEW FRAME — Dialogue mockup
    // ==========================================
    var _playerPreviewFrame = null;
    var _playerPreviewTimer = null;
    var _playerPreviewNeedsTheme = false;

    // (buildPlayerPreviewSrcdoc DIHAPUS bersama mode "Mockup" — audit C1/C2/C3.
    // Preview kini Live-only; tak ada lagi CSS runtime yang diduplikasi tangan.)

    function escapePlayerHTML(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ==========================================
    // §9.2 — isi dialog preview DINAMIS dari script.json
    // ==========================================
    // Payload TIDAK dirakit di sini. Aturan mainnya (pewarisan background/bgm/
    // speaker, label/jump/phase) sudah punya satu rumah di `vn-engine/preview-payload.js`
    // yang juga dipakai popup "Preview Label". Editor cuma meminta hasilnya —
    // kalau ia merakit sendiri, lahir implementasi KETIGA yang akan menyimpang.
    var _langkahScript = {
        steps: [], idx: 0, chapter: '', fallbackChapter: false,
        dimuatUntuk: null, scriptPath: '', mtime: 0
    };

    function _mtimeScript(p) {
        if (!p) return 0;
        try { return require('fs').statSync(p).mtimeMs; } catch (e) { return 0; }
    }

    // Tunggu engine di dalam preview BENAR-BENAR siap menerima payload.
    //
    // Player berlapis memuat engine secara DINAMIS (shim membaca player.html lalu
    // menyuntik ~15 script). Mengirim payload berdasarkan tebakan waktu tetap
    // kebetulan bekerja saat preview pertama dipasang, tapi GAGAL sesudah
    // `webview.reload()`: listener IPC engine belum terdaftar, payload hilang tanpa
    // jejak, dan preview jadi KOSONG — persis gejala "harus keluar vnManager dulu"
    // yang dilaporkan user. Yang ditunggu = penanda kenyataan, bukan durasi.
    function _tungguEnginePreviewSiap(webview) {
        if (!webview) return Promise.resolve(false);
        // Penandanya HARUS sesuatu yang hanya ada SESUDAH init.js selesai — di
        // situlah `registerIPCListener('vn-engine:update-display')` dipasang.
        // Penanda yang tampak masuk akal tapi SALAH: `#dialogue-text` (ada begitu
        // shim menyuntik markup, sebelum satu pun script engine dimuat) dan
        // `VNState` (state.js dimuat lebih awal dari init.js). Keduanya menyala
        // terlalu dini → payload dikirim ke listener yang belum ada.
        // `window.resolveAssetPath` didefinisikan DI DALAM init.js; karena eksekusi
        // script tak bisa disela, terlihatnya ia = init.js sudah tuntas.
        var uji = '(typeof window.resolveAssetPath === "function")';
        var sisa = 60;   // ~9 detik
        function coba() {
            var lanjut = function (siap) {
                if (siap === true) return true;
                if (--sisa <= 0) return false;
                return new Promise(function (res) { setTimeout(res, 150); }).then(coba);
            };
            try {
                return webview.executeJavaScript(uji).then(lanjut, function () { return lanjut(false); });
            } catch (e) { return Promise.resolve(false); }
        }
        return coba();
    }

    function _kunciLangkah() {
        return (window.currentlyEditingNovel || '') + ' ' + (_activePlayerTarget || '');
    }

    /**
     * @param {boolean} paksa  abaikan cache — dipakai saat preview baru siap atau
     *                         pengguna menekan ↻; itu artinya "tunjukkan keadaan
     *                         SEKARANG", bukan "yang terakhir kubaca".
     * @returns {Promise<boolean>} true bila langkah benar-benar dimuat ulang.
     */
    function _muatLangkahScript(paksa) {
        var novel = window.currentlyEditingNovel || '';
        var kunci = _kunciLangkah();
        if (!novel) return Promise.resolve(false);
        if (!paksa && _langkahScript.dimuatUntuk === kunci) {
            // Cache hanya sah SELAMA berkasnya belum berubah. Kunci (novel+target)
            // TIDAK berubah saat ISI script.json berubah, jadi kunci saja tak cukup —
            // yang dibandingkan harus kenyataan di disk. Tanpa ini, naskah yang baru
            // disimpan di tab Story tak pernah terlihat sampai aplikasi dimuat ulang.
            var m = _mtimeScript(_langkahScript.scriptPath);
            if (m && m === _langkahScript.mtime) return Promise.resolve(false);
        }
        return ipcRenderer.invoke('preview:script-steps', {
            storyTitle: novel,
            chapter: _activePlayerTarget === 'global' ? '' : _activePlayerTarget
        }).then(function (r) {
            var chapter = (r && r.chapter) || '';
            var sp = chapter ? path.join(__dirname, 'visual_novels', novel, chapter, 'script.json') : '';
            var langkah = (r && r.success && r.steps) || [];
            _langkahScript = {
                steps: langkah,
                // Mulai dari langkah yang BENAR-BENAR menampilkan naskah — bukan entri
                // command (mis. `boot`/`puisi`) yang jadi langkah tanpa teks. Tanpa ini
                // Per-scene berhenti di entri pertama (sering command) → kotak dialog
                // kosong ("tidak memuat naskah"). Dulu stepper ◀▶ menutupinya; kini ia
                // dibuang jadi titik awal harus benar sendiri.
                idx: _firstVisibleStepIdx(langkah),
                chapter: chapter,
                fallbackChapter: !!(r && r.usedFallbackChapter),
                dimuatUntuk: kunci,
                scriptPath: sp,
                mtime: _mtimeScript(sp)
            };
            _renderStepper();
            return true;
        }).catch(function () {
            _langkahScript = {
                steps: [], idx: 0, chapter: '', fallbackChapter: false,
                dimuatUntuk: kunci, scriptPath: '', mtime: 0
            };
            _renderStepper();
            return true;
        });
    }

    // Entri nyata bila ada; kalau chapter kosong / script tak terbaca, JATUH ke demo.
    // Preview kosong terlihat seperti aplikasi rusak — itu lebih buruk daripada
    // contoh yang jujur ditandai.
    function _payloadPreviewSekarang() {
        var s = _langkahScript.steps;
        if (s.length) {
            var i = Math.min(Math.max(0, _langkahScript.idx), s.length - 1);
            return s[i].payload;
        }
        return _buildDemoDisplayPayload();
    }

    // Langkah pertama yang BENAR-BENAR menampilkan naskah (punya teks / dialog).
    // Entri command (mis. `boot`/`puisi`/`scene`) ikut jadi langkah tapi payload-nya
    // tanpa teks; kalau Per-scene berhenti di situ, kotak dialog kosong.
    function _firstVisibleStepIdx(steps) {
        for (var i = 0; i < (steps || []).length; i++) {
            var p = steps[i] && steps[i].payload;
            if (p && (p.type === 'dialogue' || p.type === 'choice' || (p.text && String(p.text).trim()))) return i;
        }
        return 0;
    }

    // basePath WAJIB disuntik sebelum entri nyata dikirim: payload preview memakai
    // path relatif-ROOT APLIKASI (lihat catatan di preview-manager.js), sementara
    // resolveAssetPath menyusunnya jadi `file:///<basePath>/<path>`. Tanpa ini
    // latar & sprite entri nyata gagal resolve → layar hitam.
    function _suntikBasePathPreview(webview) {
        if (!webview) return;
        var root = path.join(__dirname, '..', '..').replace(/\\/g, '/');
        // MENUNGGU, bukan menebak satu angka delay: `VNState` baru ada setelah modul
        // engine selesai dimuat, dan pada player berlapis (shim) itu bisa jauh lebih
        // lambat. Penjaga `if (window.VNState)` sekali-jalan akan gagal DIAM-DIAM —
        // basePath tetap kosong dan aset entri nyata tak pernah resolve.
        // `VNState` adalah const TOP-LEVEL modul engine — ia TIDAK menempel di
        // `window` (kembar dgn catatan VNRegistry). Memeriksa `window.VNState`
        // SELALU gagal; pakai identifier telanjang lewat `typeof`.
        var js = '(function(){var n=0;(function coba(){' +
            'if(typeof VNState!=="undefined"&&VNState.state){VNState.state.basePath=' + JSON.stringify(root) + ';return;}' +
            'if(++n<40) setTimeout(coba,100);})();})();';
        try {
            var pr = webview.executeJavaScript(js);
            if (pr && pr.catch) pr.catch(function () {});
        } catch (e) { /* webview mungkin sudah dibongkar */ }
    }

    function _kirimLangkahKePreview() {
        if (!_playerPreviewFrame) return;
        // Mode Live = playthrough interaktif (engine loop asli). Mengirim payload
        // single-entry di sini akan MEMATAHKAN permainan (engine loncat ke mode
        // preview satu-entri di atas cerita yang sedang berjalan). Hanya Per-scene
        // yang memakai jalur payload ini.
        if (_playerPreviewFrame.getMode && _playerPreviewFrame.getMode() === 'live') return;
        var wv = _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
        if (!wv) return;
        try { wv.send('vn-engine:update-display', _payloadPreviewSekarang()); } catch (e) { /* idem */ }
        _renderStepper();
    }

    // Kirim config + payload, lalu PERIKSA EFEKNYA dan ulangi bila perlu.
    //
    // Payload yang tiba sebelum listener engine terdaftar hilang tanpa jejak: tak
    // ada error, tak ada peringatan, preview cuma kosong. Menebak kesiapan lewat
    // penanda apa pun tetap menyisakan celah balapan; memeriksa hasil akhirnya
    // tidak. Ini jaring pengaman di atas _tungguEnginePreviewSiap, bukan penggantinya.
    function _kirimKeEnginePreview(webview, pp, sisa) {
        if (!webview) return;
        var n = (sisa === undefined) ? 5 : sisa;
        try {
            if (pp) webview.send('preview:apply-player-config', pp);
            webview.send('vn-engine:update-display', _payloadPreviewSekarang());
        } catch (e) { return; }   // webview sudah dibongkar
        if (n <= 0) return;
        setTimeout(function () {
            try {
                webview.executeJavaScript(
                    '((document.getElementById("dialogue-text")||{}).textContent||"").length'
                ).then(function (panjang) {
                    if (!panjang) _kirimKeEnginePreview(webview, pp, n - 1);
                }, function () { /* webview hilang */ });
            } catch (e) { /* idem */ }
        }, 400);
    }

    // Penunjuk langkah ditaruh di STATUS BAR preview (soal "sedang melihat entri
    // mana"), bukan di bar mode (soal "cara melihat").
    // Stepper ◀▶ DIBUANG (keputusan 2026-07-24, masukan user): preview Live kini
    // playthrough INTERAKTIF (bukan langkah per-entri), jadi navigasi entri tak lagi
    // relevan. Fungsi disisakan sebagai PEMBERSIH — memastikan bar stepper basi dari
    // render sebelumnya tak tertinggal — supaya pemanggil lama tetap aman.
    function _renderStepper() {
        var bar = document.querySelector('#player-preview-frame .pf-status-bar');
        if (!bar) return;
        var lama = bar.querySelector('.pf-step-nav');
        if (lama) lama.remove();
    }

    // Payload demo — dipakai HANYA sebagai jaring pengaman saat script.json chapter
    // kosong/tak terbaca (lihat _payloadPreviewSekarang).
    function _buildDemoDisplayPayload() {
        return {
            isPreview: true,
            // FB8: preview ini memamerkan GAYA, bukan mendiagnosis entri. Debug HUD
            // (panel tipe-entri/special-event) hanya untuk preview entri di tab Story.
            hideDebugHud: true,
            type: 'dialogue',
            speaker: 'Sakura',
            text: 'Selamat datang di pratinjau runtime. Ini player asli — tema, gaya dialog, theme.css, dan custom CSS novelmu diterapkan sungguhan.',
            transition: 'cut'
        };
    }

    // Preview tidak punya chapter context, jadi link dipasang manual. Daftar link
    // tetap WAJIB datang dari resolver backend yang sama dengan runtime/custom
    // player agar marker `@vn-theme-cascade: replace-novel` tidak menyimpang.
    //
    // KOREKSI audit #3: BUKAN redundan terhadap J1 — di preview in-app tak ada
    // chapter context (state.storyTitle kosong) sehingga resolver J1 tak
    // menghasilkan link cascade apa pun; fungsi inilah satu-satunya penyuntiknya.
    // Yang diperbaiki adalah DETERMINISME: (a) mengembalikan Promise supaya
    // pemanggil bisa menunggu sebelum push config (customCSS di-re-append
    // handler SETELAH link ini terpasang → customCSS tetap menang / B1);
    // (b) snippet ikut me-re-append node customCSS di akhir sebagai jaring
    // pengaman bila urutan kedatangan terbalik.
    var _previewThemeRequestSeq = 0;
    function _injectPreviewThemeCss(webview) {
        var novel = window.currentlyEditingNovel || '';
        if (!novel) return Promise.resolve();
        var chapter = (_activePlayerTarget && _activePlayerTarget !== 'global')
            ? _activePlayerTarget : '';
        var requestKey = novel + '\n' + chapter;
        var requestSeq = ++_previewThemeRequestSeq;

        return ipcRenderer.invoke('vn-engine:resolve-effective-css', {
            storyTitle: novel,
            chapter: chapter
        }).then(function (css) {
            var nowChapter = (_activePlayerTarget && _activePlayerTarget !== 'global')
                ? _activePlayerTarget : '';
            // Respons target lama tidak boleh menyentuh webview target baru.
            if (requestSeq !== _previewThemeRequestSeq ||
                requestKey !== (window.currentlyEditingNovel || '') + '\n' + nowChapter) return;

            var files = [];
            if (css && css.novelUrl) files.push({ id: 'preview-novel-theme', href: css.novelUrl });
            if (css && css.chapterUrl) files.push({ id: 'preview-chapter-theme', href: css.chapterUrl });

            // Hapus kedua link lebih dulu: pada mode replace, menghapus link novel
            // adalah bagian penting dari hasil, bukan sekadar housekeeping.
            var js = '(function(){' +
                'var ids=["preview-novel-theme","preview-chapter-theme"];' +
                'ids.forEach(function(id){var o=document.getElementById(id); if(o) o.remove();});';
            files.forEach(function (f) {
                js += 'var l=document.createElement("link"); l.rel="stylesheet"; l.id=' + JSON.stringify(f.id) +
                    '; l.href=' + JSON.stringify(f.href) + '; document.head.appendChild(l);';
            });
            js += 'var cc=document.getElementById("preview-custom-css")||document.getElementById("chapter-custom-css");' +
                'if(cc) document.head.appendChild(cc);';
            js += '})();';
            try {
                var pr = webview.executeJavaScript(js);
                return (pr && pr.catch) ? pr.catch(function () {}) : Promise.resolve();
            } catch (e) { return Promise.resolve(); }
        }).catch(function () { /* preview tetap hidup tanpa CSS kreator */ });
    }

    // Profil yang dipush ke preview: efektif untuk target aktif (Global apa adanya;
    // chapter = merge Global + override chapter itu).
    function _effectiveForPreview() {
        var pp = ensurePlayerProfile();
        var base;
        if (!pp || !_activePlayerTarget || _activePlayerTarget === 'global') base = pp;
        else {
            var hc = getHubConfig();
            var override = hc && hc.chapterConfig && hc.chapterConfig[_activePlayerTarget];
            base = override ? _computeEffectiveProfile(pp, override) : pp;
        }
        // FB5: gaya dialog kini ATRIBUT di file shim, bukan JSON. Handler config
        // preview MENYAPU class dialogue-style lalu memasang ulang dari
        // profile.dialogueStyle — bila kosong (pasca-template) ia menghapus gaya
        // yang baru saja dipasang shim. Jadi turunkan dialogueStyle dari FILE yang
        // dimuat preview supaya config push cocok dengan kenyataan, bukan menimpanya.
        if (base && !base.dialogueStyle) {
            var fileStyle = _resolvedPlayerDialogueStyle();
            if (fileStyle) base = Object.assign({}, base, { dialogueStyle: fileStyle });
        }
        return base;
    }

    // Baca atribut data-dialogue-style dari player.html yang dimuat preview (shim).
    function _resolvedPlayerDialogueStyle() {
        var p = _resolvedPlayerHtml();
        if (!p) return '';
        try {
            var src = require('fs').readFileSync(p, 'utf-8');
            var m = src.match(/data-dialogue-style\s*=\s*["']([\w-]+)["']/i);
            return (m && m[1] && m[1] !== '{DIALOGUE_STYLE}') ? m[1] : '';
        } catch (e) { return ''; }
    }

    var _playerPreviewNovel = null;
    var _playerPreviewEngineURL = null;


    // FB5: player yang BENAR-BENAR dipakai runtime, resolusi sama dgn engine —
    // chapter → novel → engine global. Preview dulu hanya cek level chapter, jadi
    // memuat `vn-player/player.html` mentah untuk Global/chapter-ikut-novel →
    // atribut `data-dialogue-style` milik shim novel TAK PERNAH terbaca preview
    // (gaya dialog tak berubah sampai reload). Sekarang preview memuat shim yg tepat.
    function _resolvedPlayerHtml() {
        // P2: hasil resolver, bukan penelusuran sendiri. `null` = engine global
        // mentah, sama seperti sebelumnya.
        return (_pcViewModel && _pcViewModel.markupPath) || null;
    }

    // Scope player yang RUNTIME pakai untuk target aktif — sumbu BERKAS, BUKAN
    // switch Ikut Global (yang cuma mengatur PERILAKU/config). Dipakai note tab
    // Code & badge preview agar kontekstual: preview memuat file NYATA yang
    // runtime pakai (P0).
    //
    // Kosakata di sini ('global') dan di view model ('engine') sengaja berbeda:
    // yang satu menjawab "target mana yang memilikinya", yang lain "lapisan mana
    // yang dipakai". Penerjemahannya ditaruh di SATU baris ini supaya tak ada
    // pemakai yang menerjemahkan sendiri.
    function _pcResolvedScope() {
        if (!_pcViewModel) return 'global';
        return _pcViewModel.markupScope === 'engine' ? 'global' : _pcViewModel.markupScope;
    }

    // Note tab Code: player MANA yang dipakai runtime (baca kenyataan file), supaya
    // tak rancu dengan switch Ikut Global. `followGlobalMode` = chapter TANPA player.html
    // sendiri → renderCodeEditor menyembunyikan nav+editor & note ini jadi CTA:
    // "kode ada di Player Global Default; buka sana, atau buat player.html chapter".
    function _renderCodeScopeNote(followGlobalMode) {
        var host = document.getElementById('pc-scope-note');
        if (!host) return;
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';
        if (!isChapter) { host.style.display = 'none'; host.innerHTML = ''; return; }
        var scope = _pcResolvedScope();

        if (followGlobalMode) {
            var pakai = (scope === 'novel')
                ? '<code>player.html</code> level NOVEL'
                : 'player <strong>Global</strong> (engine bawaan)';
            host.className = 'pc-scope-note pc-scope-followglobal';
            host.style.display = '';
            host.innerHTML =
                '<div class="pc-scope-note-msg"><strong>Chapter ini memakai ' + pakai + '</strong> — tak ada '
                + 'kode khusus chapter. Untuk <strong>melihat/menyunting kode yang dipakai</strong>, buka '
                + '<strong>Player Global Default</strong>. Atau buat <code>player.html</code> chapter untuk '
                + 'mengkustomisasi khusus chapter ini.</div>'
                + '<div class="pc-scope-note-actions">'
                + '<button type="button" class="pc-scope-btn" data-scope-act="open-global">Buka Player Global Default</button>'
                + '<button type="button" class="pc-scope-btn pc-scope-btn-alt" data-scope-act="create-chapter">Buat player.html chapter</button>'
                + '</div>';
            var ob = host.querySelector('[data-scope-act="open-global"]');
            if (ob) ob.onclick = function () { if (typeof selectPlayerTarget === 'function') selectPlayerTarget('global'); };
            var cb = host.querySelector('[data-scope-act="create-chapter"]');
            if (cb) cb.onclick = _pcCreateChapterPlayer;
            return;
        }

        // Chapter PUNYA player.html sendiri → note informasional (nav+editor tetap tampil).
        host.className = 'pc-scope-note pc-scope-chapter';
        host.style.display = '';
        host.innerHTML = '<strong>Chapter ini punya <code>player.html</code> sendiri</strong> — inilah yang '
            + 'dipakai runtime &amp; preview. Switch <em>Ikut Global</em> di header hanya mengatur PERILAKU '
            + '(sprite/auto), bukan berkas ini. Untuk mencoba tampilan di atasnya tanpa kehilangan apa pun, '
            + 'pakai <strong>Nonaktifkan</strong> di aksi berkas — berkasnya disimpan sebagai '
            + '<code>player.html.off</code> dan bisa diaktifkan lagi kapan saja.';
    }

    // Buat player.html chapter (engine penuh) dari note follow-global, lalu segarkan:
    // scope jadi 'chapter' → nav+editor muncul, preview & badge ikut engine baru.
    function _pcCreateChapterPlayer() {
        var novel = window.currentlyEditingNovel || '';
        var chapter = _activePlayerTarget;
        if (!novel || !chapter || chapter === 'global') return;
        // Identitasnya diambil dari argumen yang benar-benar dikirim ke IPC, bukan
        // dibaca ulang nanti — di sinilah target masih pasti benar (#7).
        var target = { storyTitle: novel, chapter: chapter };
        ipcRenderer.invoke('chapter-player:scaffold', {
            storyTitle: novel, chapter: chapter, template: 'engine', overwrite: false
        }).then(function (sc) {
            if (sc && sc.success) {
                VN.Toast.success('player.html chapter dibuat — kini bisa dikustomisasi di sini.');
                // Berkasnya tetap lahir untuk chapter yang diminta, tapi menyegarkan
                // editor & preview hanya benar bila chapter itu masih yang dibuka.
                if (_pcTargetMasihAktif(target)) {
                    renderCodeEditor();      // scope kini 'chapter' → nav + editor tampil
                    _hardReloadPreview();    // preview & badge segar (engine URL berubah)
                }
            } else {
                VN.Toast.error('Gagal membuat player.html: ' + ((sc && sc.message) || 'Unknown'));
            }
        }).catch(function (e) { VN.Toast.error('Gagal: ' + e.message); });
    }

    // Badge scope di status bar preview: jelaskan player MANA yang termuat, supaya
    // preview kontekstual (menjawab "kenapa preview masih chapter padahal ikut Global?"
    // → karena chapter punya player.html-nya sendiri; runtime memang memakainya).
    var _SCOPE_BADGE = { chapter: '📄 Player: chapter ini', novel: '📁 Player: novel', global: '🌐 Player: Global' };
    function _renderPreviewScopeBadge() {
        var bar = document.querySelector('#player-preview-frame .pf-status-bar');
        if (!bar) return;
        var old = bar.querySelector('.pf-scope-badge');
        if (old) old.remove();
        var scope = _pcResolvedScope();
        var badge = document.createElement('span');
        badge.className = 'pf-scope-badge pf-scope-' + scope;
        badge.textContent = _SCOPE_BADGE[scope] || _SCOPE_BADGE.global;
        badge.title = scope === 'chapter'
            ? 'Preview memuat player.html chapter ini (dipakai runtime). Independen dari switch Ikut Global (yang cuma perilaku).'
            : (scope === 'novel' ? 'Preview memuat player.html level novel.' : 'Preview memuat player Global (engine bawaan).');
        bar.appendChild(badge);

    }

    // URL engine untuk Live preview: player yang RUNTIME pakai (shim novel/chapter
    // bila ada), else engine global. WYSIWYG: preview memuat file yang sama.
    function _desiredLiveURL() {
        var resolved = _resolvedPlayerHtml();
        var p = resolved || path.join(__dirname, '..', '..', 'vn-player', 'player.html');
        return 'file:///' + p.replace(/\\/g, '/');
    }

    // FB4: preview harus MEMBEDAKAN shim dari custom, sama seperti runtime.
    // `_activeChapterPlayerHtml` cuma cek FILE ADA — tapi shim (engine-shim)
    // menjalankan ENGINE BERSAMA dan digerakkan jalur GLOBAL (update-display),
    // sedangkan custom sejati (model bridge, mis. DDLC) digerakkan set-player-context.
    // Menyamaratakan keduanya membuat shim di-drive protokol salah → engine tak
    // pernah terima payload → preview BLANK / end-screen (bug yang dilaporkan user).
    // Penanda kanonik = isEngineShim (player-source-resolver); dicek di sini via
    // marker yang sama (routing preview, bukan safety guard).
    function _activeChapterPlayerIsCustom() {
        var p = _resolvedPlayerHtml();   // FB5: cek player yang RUNTIME pakai (chapter/novel)
        if (!p) return false;
        try {
            var src = require('fs').readFileSync(p, 'utf-8');
            return !/<meta[^>]+name=["']vn-player["'][^>]+content=["']engine-shim["']/i.test(src);
        } catch (e) { return true; } // gagal baca → anggap custom (tak paksa engine bersama)
    }

    // ==========================================
    // MODE PER-SCENE — menyemat satu scene di preview (§9.1)
    // ==========================================
    // Snippet ini hidup di sisi PREVIEW, bukan di vn-player-api.js, dengan alasan
    // yang sama seperti _CUSTOM_PREVIEW_SAFETY di bawah: runtime yang dikirim ke
    // pemain tidak boleh tahu-menahu soal editor.
    //
    // Kenapa perlu menyemat sama sekali: kode KREATOR ikut menggerakkan scene —
    // shim bawaan menampilkan kartu 'judul' lalu menyembunyikannya lewat timer, dan
    // hook `player:end-screen` memanggil show() sendiri. Tanpa sematan, scene yang
    // baru dipilih di navigator akan tercopot sendiri sedetik kemudian dan terlihat
    // seperti preview yang rusak. (Hub tak punya versi seakut ini: scene hub
    // digerakkan navigasi, bukan timer.)
    //
    // sceneId: '<nama>' semat blok itu · '*' semat OVERLAY pertama menurut runtime
    //          · '' lepas sematan.
    // Menyemat blok DASAR (mis. 'story') = kembali ke layar cerita: semua overlay
    // padam dan kode kreator tak bisa menutupinya lagi. Sentinel khusus tak
    // diperlukan — blok dasar punya nama sungguhan di markup.
    function _scenePinScript(sceneId) {
        return '(function(){' +
            'var req=' + JSON.stringify(sceneId || '') + ', tries=0;' +
            // VNPlayer baru ada setelah modul engine selesai dimuat; shim memuatnya
            // secara dinamis, jadi tunggu alih-alih menebak satu angka delay.
            '(function attach(){' +
            '  if(!window.VNPlayer||!VNPlayer.scene){ if(++tries<40) setTimeout(attach,100); return; }' +
            '  if(!window.__vnScenePin){' +
            '    var o={show:VNPlayer.scene.show,hide:VNPlayer.scene.hide};' +
            '    window.__vnScenePin={orig:o,id:""};' +
            // Saat tersemat: show() apa pun dialihkan ke scene sematan, hide() diabaikan.
            '    VNPlayer.scene.show=function(s){var p=window.__vnScenePin.id;return o.show(p||s);};' +
            '    VNPlayer.scene.hide=function(){if(window.__vnScenePin.id)return;return o.hide();};' +
            '  }' +
            '  var want=req;' +
            '  if(want==="*"){' +
            // Diambil dari RUNTIME (DOM preview), bukan dari file: dengan begitu blok
            // bawaan engine yang disuntik saat runtime ikut terjangkau. Blok DASAR
            // dilewati — menyemat ke sana membuat mode Per-scene tampak tak berbuat
            // apa-apa, padahal maksudnya memperlihatkan sebuah layar.
            '    var l=Array.prototype.filter.call(' +
            '      document.querySelectorAll("[data-player-scene]"),' +
            '      function(e){return e.getAttribute("data-scene-mode")!=="base"' +
            '        && e.getAttribute("data-player-scene")!=="__dynamic__";});' +
            '    want=l.length?l[0].getAttribute("data-player-scene"):"";' +
            '    if(!want){ if(++tries<40) setTimeout(attach,100); return; }' +
            '  }' +
            '  window.__vnScenePin.id=want;' +
            '  if(want) window.__vnScenePin.orig.show(want); else window.__vnScenePin.orig.hide();' +
            '})();' +
            '})();';
    }

    // Klik scene di navigator. Sengaja TIDAK memaksa pindah mode: di mode Live
    // preview memang milik alur cerita. Pilihannya disimpan, jadi begitu user
    // beralih ke Per-scene yang tersemat adalah scene yang barusan ia klik.
    // (Perilaku sama dengan navigator scene hub.)
    function _pcSelectScene(id) {
        _pcSelectedSceneId = id || '';
        _applyPlayerSelectionHighlight();                 // Tahap 2: sorotan .active persisten
        _drivePlayerPreviewToScene(id);
        VN.Events.emit('player:activeSceneChanged', { sceneId: _pcSelectedSceneId });
    }

    // Tahap 2 — sorotan SELEKSI (yang kupilih), terpisah dari sorotan preview.
    function _applyPlayerSelectionHighlight() {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        nav.querySelectorAll('.pc-scene-item').forEach(function (el) {
            el.classList.toggle('active', !!_pcSelectedSceneId && el.dataset.sceneId === _pcSelectedSceneId);
        });
    }

    // Mirror _driveHubPreviewToScene: no-op kecuali mode Per-scene sedang aktif.
    function _drivePlayerPreviewToScene(sceneId) {
        if (!_playerPreviewFrame || !_playerPreviewFrame.getMode) return;
        if (_playerPreviewFrame.getMode() !== 'per-scene') return;
        var wv = _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
        if (!wv) return;
        try {
            var pr = wv.executeJavaScript(_scenePinScript(sceneId || _pcSelectedSceneId || '*'));
            if (pr && pr.catch) pr.catch(function () {});
        } catch (e) { /* webview mungkin sudah dibongkar */ }
        _syncPinnedSceneHighlight();
    }

    function _releasePlayerPreviewScene() {
        var wv = _playerPreviewFrame && _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
        if (!wv) return;
        try {
            var pr = wv.executeJavaScript(_scenePinScript(''));
            if (pr && pr.catch) pr.catch(function () {});
        } catch (e) { /* idem */ }
        _syncPinnedSceneHighlight();
    }

    // Sorotan navigator dibaca dari KENYATAAN di dalam preview
    // (<body data-vn-scene>), bukan dari niat editor — kalau sematan gagal
    // (mis. scene sudah dihapus dari file), navigator tidak berbohong.
    function _syncPinnedSceneHighlight() {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        var wv = _playerPreviewFrame && _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
        // `null` = jangan sorot apa pun (mode Live: preview tidak disemat).
        // Blok dasar punya nama sungguhan di markup, jadi tak perlu penanganan
        // khusus: data-vn-scene di preview selalu menunjuk blok yang menyala.
        var clear = function (active) {
            nav.querySelectorAll('.pc-scene-item').forEach(function (el) {
                el.classList.toggle('is-previewing', !!active && el.dataset.sceneId === active);
            });
        };
        if (!wv || !_playerPreviewFrame.getMode || _playerPreviewFrame.getMode() !== 'per-scene') {
            clear(null);
            return;
        }
        setTimeout(function () {
            try {
                wv.executeJavaScript('document.body?document.body.getAttribute("data-vn-scene"):""')
                    .then(function (id) { clear(id || ''); })
                    .catch(function () {});
            } catch (e) { /* idem */ }
        }, 260);   // beri waktu transisi opacity scene (.5s) mulai & atribut terpasang
    }

    // ==========================================
    // TAHAP 1 — Sorotan "sedang tampil" (Live). Umpan-balik dua arah: reporter di
    // dalam preview memantau <body data-vn-scene> NYATA (P0) & melapor lewat
    // 'player:scene-shown'; navigator menyorot scene yang benar-benar menyala.
    // ==========================================
    var _pcPreviewShownSceneId = null;

    function _onPlayerPreviewSceneShown(detail) {
        var id = (detail && detail.sceneId) || null;
        if (id === _pcPreviewShownSceneId) return;
        _pcPreviewShownSceneId = id;
        _applyPlayerPreviewHighlight();
    }

    // Idempoten — aman dipanggil ulang tiap navigator di-render. Hanya Live.
    // Yang disorot:
    //   • ada OVERLAY menyala (data-vn-scene) → sorot node scene itu.
    //   • TAK ada overlay tapi playthrough sedang jalan → sorot blok DASAR (cerita
    //     sedang berlangsung di panggung). Tanpa ini, sepanjang dialog biasa TAK ADA
    //     data-vn-scene → tak ada yang menyala → terasa "highlight belum jalan".
    function _applyPlayerPreviewHighlight() {
        var nav = document.getElementById('pc-scene-nav');
        if (!nav) return;
        var live = !!(_playerPreviewFrame && _playerPreviewFrame.getMode
            && _playerPreviewFrame.getMode() === 'live');
        var overlayId = (live && _pcPreviewShownSceneId) ? _pcPreviewShownSceneId : null;
        var highlightBase = live && !overlayId && _playthroughActive;
        nav.querySelectorAll('.pc-scene-item').forEach(function (el) {
            var match = highlightBase
                ? el.classList.contains('pc-scene-base')
                : (!!overlayId && el.dataset.sceneId === overlayId);
            el.classList.toggle('preview-playing', match);
        });
    }

    // Ketiga sorotan sekaligus (dipakai tiap kali daftar dibangun ulang).
    function _pcSyncAllHighlights() {
        _applyPlayerSelectionHighlight();
        _applyPlayerPreviewHighlight();
        _syncPinnedSceneHighlight();
    }

    // Suntik SEKALI per webview: pantau <body data-vn-scene> & lapor ke host.
    // DOM dibagi antar-world, jadi observer ini melihat scene NYATA meski disuntik
    // dari isolated world (pola sama dengan observer hub custom).
    function _pcInjectSceneReporter(webview) {
        if (!webview) return;
        var code =
            '(function(){' +
            '  var ipc; try { ipc = require("electron").ipcRenderer; } catch(e){ return; }' +
            '  if (window.__vnSceneReporter) return; window.__vnSceneReporter = true;' +
            '  function rep(){ try { ipc.sendToHost("player:scene-shown",' +
            '     { sceneId: document.body ? (document.body.getAttribute("data-vn-scene")||"") : "" }); } catch(e){} }' +
            '  rep();' +
            '  var obs = new MutationObserver(rep);' +
            '  if (document.body) obs.observe(document.body, { attributes:true, attributeFilter:["data-vn-scene"] });' +
            '})();';
        try { var pr = webview.executeJavaScript(code); if (pr && pr.catch) pr.catch(function () {}); } catch (e) { /* webview belum siap */ }
    }

    // Netralkan navigasi/simpan pada custom player saat dipakai preview.
    var _CUSTOM_PREVIEW_SAFETY = "(function(){if(!window.VNPlayer)return;var n=function(){};" +
        "VNPlayer.returnToHub=n;VNPlayer.exitToManager=n;VNPlayer.playChapter=n;" +
        "VNPlayer.replayChapter=n;VNPlayer.saveGame=n;VNPlayer.loadGame=n;})();";

    // Drive Live preview lewat player.html custom chapter: suntik bridge VNPlayer +
    // kirim set-player-context berisi satu entri demo. Chapter render sendiri —
    // profil JSON TIDAK dipaksakan (sesuai realita runtime custom player).
    function _driveCustomPreview(webview) {
        var novel = window.currentlyEditingNovel || '';
        var chapter = _activePlayerTarget;
        var fsNode, bridgeCode;
        try {
            fsNode = require('fs');
            bridgeCode = fsNode.readFileSync(path.join(__dirname, '..', '..', 'vn-player', 'js', 'vn-player-api.js'), 'utf-8');
        } catch (e) { return; }
        var novelDir = path.join(__dirname, 'visual_novels', novel);
        var chapterDir = path.join(novelDir, chapter);
        var demoScript = [{
            type: 'dialogue', speaker: 'Sakura', isPreview: true, hideDebugHud: true, transition: 'cut',
            text: 'Pratinjau lewat player.html chapter ini (engine custom). Profil global tidak dipaksakan di sini.'
        }];
        setTimeout(function () {
            try {
                webview.executeJavaScript(bridgeCode)
                    .then(function () { return webview.executeJavaScript(_CUSTOM_PREVIEW_SAFETY); })
                    .then(function () {
                        webview.send('vn-engine:set-player-context', {
                            storyTitle: novel, chapter: chapter,
                            basePath: 'file:///' + chapterDir.replace(/\\/g, '/') + '/',
                            novelPath: 'file:///' + novelDir.replace(/\\/g, '/') + '/',
                            script: demoScript
                        });
                    }).catch(function () {});
            } catch (e) { /* webview mungkin sudah dibongkar */ }
        }, 350);
    }

    // ==========================================
    // PLAYTHROUGH TERSEMAT (mode Live) — preview memutar chapter INTERAKTIF lewat
    // engine loop asli (main), bukan stepper single-payload. Command scene (boot→
    // judul, puisi, scene) benar-benar jalan → preview = kenyataan gameplay.
    // ==========================================
    // Netralkan navigasi yang mengganggu editor bila tombolnya diklik di preview
    // (kembali hub / keluar / main chapter / replay / save-load). request-next-line
    // TIDAK diblok — itulah yang menggerakkan playthrough.
    var _PLAYTHROUGH_SAFETY =
        '(function(){var ipc;try{ipc=require("electron").ipcRenderer;}catch(e){return;}' +
        'if(ipc.__vnPreviewGuard)return; ipc.__vnPreviewGuard=true;' +
        'var blok={"vn-engine:return-to-hub":1,"vn-engine:exit-to-manager":1,"play-chapter":1,' +
        '"vn-engine:replay-chapter":1,"vn-engine:save-game":1,"vn-engine:load-game":1,"save-game":1,"load-game":1};' +
        'var _send=ipc.send.bind(ipc);' +
        'ipc.send=function(ch){ if(blok[ch]){try{console.log("[Preview] navigasi diblokir:",ch);}catch(e){} return;} return _send.apply(ipc,arguments); };' +
        '})();';

    var _playthroughActive = false;

    /**
     * Chapter yang diputar preview: target chapter langsung; Global → chapter
     * pertama yang tersedia.
     *
     * Untuk Global, chapter mana pun sama saja — ia cuma PENYEDIA ISI. Berkas
     * yang dirender ditentukan target: `player.html` lewat `_desiredLiveURL()`,
     * dan `theme.css` lewat scope preview yang dikirim ke main bersama
     * `preview:play-chapter` (lihat setPreviewThemeScope di preview-manager).
     *
     * Sempat ada `_wakilPreviewGlobal()` di sini yang bersusah payah memilih
     * chapter yang mewarisi tampilan Global, plus `_bayanganPreviewGlobal()`
     * yang menjelaskan panjang lebar ketika tak ada satu pun yang layak.
     * Keduanya DICABUT: setelah target menentukan berkas, tak ada lagi yang
     * perlu dipilih dengan hati-hati maupun diminta maaf. Perbaikan yang benar
     * membuat penjelasannya tak perlu — kalau ia justru menambah tulisan,
     * arahnya salah.
     */
    function _playthroughChapter() {
        var t = _activePlayerTarget;
        if (t && t !== 'global') return t;
        var chs = window.availableChapters || [];
        return chs.length ? chs[0] : '';
    }

    function _startPlaythrough(webview) {
        if (!webview) return;
        // Sedini mungkin (sebelum fallback preview-mode init.js): matikan fallback +
        // pasang safety. Untuk shim init.js termuat belakangan, jadi flag ini cadangan;
        // untuk player global ia yang mencegah data-vn-preview menyala.
        try {
            var pr0 = webview.executeJavaScript('window.__vnSuppressPreviewFallback=true;' + _PLAYTHROUGH_SAFETY);
            if (pr0 && pr0.catch) pr0.catch(function () {});
        } catch (e) { /* webview belum siap */ }

        _tungguEnginePreviewSiap(webview).then(function (siap) {
            if (!siap) return;
            var novel = window.currentlyEditingNovel || '';
            var chapter = _playthroughChapter();
            if (!novel || !chapter) return;   // Global tanpa chapter ber-script → tak ada yang diputar
            var id = (webview.getWebContentsId) ? webview.getWebContentsId() : null;
            // `themeScopeChapter` = TARGET yang sedang disunting, bukan chapter yang
            // diputar. Untuk Global ia string kosong, dan itulah yang membuat preview
            // merender theme.css NOVEL walau naskahnya datang dari chapter yang
            // kebetulan punya tema sendiri. Aturannya: target menentukan berkas,
            // chapter cuma penyedia isi. Lihat setPreviewThemeScope di preview-manager.
            var targetScope = (_activePlayerTarget && _activePlayerTarget !== 'global')
                ? _activePlayerTarget : '';
            ipcRenderer.invoke('preview:play-chapter', {
                storyTitle: novel, chapter: chapter, webContentsId: id,
                themeScopeChapter: targetScope
            }).then(function (r) {
                _playthroughActive = !!(r && r.success);
                // Playthrough jalan → sorot blok DASAR (cerita) segera, tak menunggu
                // scene overlay pertama. Jujur: cerita memang aktif di panggung.
                _applyPlayerPreviewHighlight();
            }).catch(function () {});
        });
    }

    // Hentikan playthrough (pulihkan state engine di main). Idempoten.
    function _stopPlaythrough() {
        if (!_playthroughActive) return;
        _playthroughActive = false;
        _applyPlayerPreviewHighlight();   // berhenti → padamkan sorotan "sedang tampil"
        ipcRenderer.invoke('preview:stop-chapter').catch(function () {});
    }

    // Meninggalkan view VN Player saat playthrough masih aktif → bebaskan state engine
    // (kalau tidak, target override + state chapter tetap "dipinjam" playthrough).
    (function initPlaythroughCleanup() {
        if (window.VN && VN.Events && typeof VN.Events.on === 'function') {
            VN.Events.on('workspace:viewChanged', function (data) {
                if (data && data.to && data.to !== 'player') _stopPlaythrough();
            });
        }
    })();

    function initPlayerPreview() {
        _hitungRender.initPreview++;
        var container = document.getElementById('player-preview-frame');
        if (!container) return;

        var desiredURL = _desiredLiveURL();
        // Bongkar frame lama bila NOVEL atau ENGINE (global ↔ player.html chapter) berganti.
        var novelChanged = _playerPreviewFrame && _playerPreviewNovel !== (window.currentlyEditingNovel || '');
        var engineChanged = _playerPreviewFrame && _playerPreviewEngineURL !== desiredURL;
        if (novelChanged || engineChanged) {
            _stopPlaythrough();   // playthrough lama pegang state engine — bebaskan sebelum bongkar
            try { _playerPreviewFrame.destroy(); } catch (e) { /* ignore */ }
            _playerPreviewFrame = null;
        }
        if (_playerPreviewFrame) {
            _renderPreviewScopeBadge();   // scope bisa berubah walau URL sama (Global ↔ chapter tanpa player.html)
            // Playthrough dihentikan saat MENINGGALKAN view (jaga state engine dari
            // bentrok dgn preview tab Story). Saat panel dibuka lagi di mode Live,
            // muat ulang webview supaya onWebviewReady MEMUTAR ULANG dari awal
            // (engine bersih, tanpa dobel-load extension).
            var wvExisting = _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
            var modeExisting = _playerPreviewFrame.getMode ? _playerPreviewFrame.getMode() : 'live';
            if (modeExisting === 'live' && !_activeChapterPlayerIsCustom() && !_playthroughActive && wvExisting && wvExisting.reload) {
                try { wvExisting.reload(); } catch (e) { /* webview belum siap */ }
                return;
            }
            // Per-scene / custom: naskah bisa berubah di tab Story sejak terakhir
            // dilihat. Periksa berkasnya; kirim ulang HANYA bila memang berubah.
            _muatLangkahScript().then(function (berubah) {
                if (berubah) _kirimLangkahKePreview();
            });
            return;
        }
        _playerPreviewNovel = window.currentlyEditingNovel || '';
        _playerPreviewEngineURL = desiredURL;

        // Shim chapter DIGERAKKAN JALUR GLOBAL (bukan bridge) — lihat FB4.
        var isCustomEngine = _activeChapterPlayerIsCustom();
        var novelTitle = window.currentlyEditingNovel || '';
        var novelPath = novelTitle
            ? 'file:///' + __dirname.replace(/\\/g, '/') + '/visual_novels/' + encodeURIComponent(novelTitle) + '/'
            : '';

        // Mode "Mockup" (iframe srcdoc) DIBUANG (audit C1/C2/C3): ia menduplikasi
        // CSS runtime dengan tangan dan sudah menyimpang di ≥3 titik. "Live"
        // (runtime player asli) kini satu-satunya preview — WYSIWYG sungguhan.
        _playerPreviewFrame = new VN.PreviewFrame('player-preview-frame', {
            title: 'Player Preview',
            diagSource: 'player',
            /**
             * UX-B07 — klik baris log yang menyebut BERKAS langsung membuka berkas
             * itu di tab Code. Hanya berkas yang memang milik target ini; nama lain
             * (aset, URL engine) sengaja tak melompat ke mana-mana, karena baris yang
             * bisa diklik tetapi tak menuju apa pun adalah affordance palsu.
             */
            onDiagJump: function (konteks) {
                var nama = String((konteks && konteks.file) || '').split(/[\/]/).pop();
                if (['player.html', 'theme.css'].indexOf(nama) === -1) return;
                showPlayerTab('berkas');
                setCodeFocus(nama === 'theme.css' ? 'gaya' : 'scene');
                if (nama === 'player.html' && typeof _pcLoadBlock === 'function') _pcLoadBlock(nama);
            },
            // Dua mode, kosakata SAMA dengan preview Hub (§9.1). Keduanya webview
            // runtime asli → PreviewFrame tidak membongkar elemen saat berpindah
            // (cabang sameRenderer), jadi peralihan instan tanpa reload.
            //
            // Per-scene ≠ "hanya scene ini". Scene player adalah OVERLAY di atas loop
            // cerita, jadi mode ini menyalakan scene DI ATAS tampilan yang sedang
            // berjalan — persis seperti saat dimainkan. Apakah kotak dialog ikut
            // terlihat di baliknya ditentukan CSS scene itu sendiri
            // (`body[data-vn-scene="…"]`), bukan oleh preview. Preview yang punya
            // pendapat sendiri soal ini akan berbohong terhadap runtime — dosa yang
            // sama dengan mode "Mockup" yang sudah dibuang (audit C1/C2/C3).
            modes: [
                { id: 'per-scene', label: 'Per-scene', title: 'Semat satu scene (data-player-scene) di atas tampilan', renderer: 'webview' },
                { id: 'live', label: 'Live', title: isCustomEngine ? 'Engine chapter ini (player.html custom) — render sebenarnya' : 'Runtime player asli (webview) — profil & theme.css diterapkan nyata', renderer: 'webview' }
            ],
            defaultMode: 'live',
            onModeChange: function (mode) {
                _pcPreviewShownSceneId = null;
                _applyPlayerPreviewHighlight();
                if (isCustomEngine) {
                    // Custom render sendiri (bukan engine bersama) → perilaku per-scene lama.
                    if (mode === 'per-scene') _drivePlayerPreviewToScene(); else _releasePlayerPreviewScene();
                    return;
                }
                // Live (playthrough interaktif) vs Per-scene (render satu payload) = mode
                // engine yang fundamental berbeda → muat ulang webview untuk state bersih.
                // onWebviewReady akan menata sesuai mode baru (getMode dipertahankan frame).
                _stopPlaythrough();
                var wv = _playerPreviewFrame && _playerPreviewFrame.getWebview && _playerPreviewFrame.getWebview();
                if (wv && wv.reload) { try { wv.reload(); } catch (e) { /* webview belum siap */ } }
            },
            // Tahap 1: reporter di dalam preview melapor scene yang sedang tampil.
            onIpcMessage: function (channel, args) {
                if (channel === 'player:scene-shown') _onPlayerPreviewSceneShown(args && args[0]);
            },
            baseHref: novelPath,
            liveURL: desiredURL,
            preloadSrc: path.join(__dirname, 'vnModules', 'preview', 'preview-preload.js'),
            configChannel: 'preview:apply-player-config',
            onWebviewReady: function (webview) {
                // Reload membuang observer lama → reset & pasang ulang reporter (Tahap 1).
                _pcPreviewShownSceneId = null;
                _applyPlayerPreviewHighlight();
                _pcInjectSceneReporter(webview);
                if (isCustomEngine) {
                    // Chapter pakai player.html sendiri → render lewat engine itu (jujur).
                    _drivePlayerPreviewToScene();
                    _driveCustomPreview(webview);
                    return;
                }
                var mode = (_playerPreviewFrame && _playerPreviewFrame.getMode) ? _playerPreviewFrame.getMode() : 'live';
                if (mode === 'live') {
                    // LIVE = playthrough interaktif: engine loop asli (main) menggerakkan
                    // webview ini lewat set-chapter-context. Kartu judul (command boot) &
                    // scene lain benar-benar tampil, klik memajukan cerita — persis gameplay.
                    _startPlaythrough(webview);
                } else {
                    // PER-SCENE = render satu payload (isPreview) lalu semat scene tertentu.
                    // Cascade theme.css disuntik DULU, baru profil (koreksi audit #3 / B1).
                    _drivePlayerPreviewToScene();
                    _tungguEnginePreviewSiap(webview).then(function (siap) {
                        if (!siap) return;
                        _suntikBasePathPreview(webview);
                        return Promise.all([_injectPreviewThemeCss(webview), _muatLangkahScript(true)])
                            .then(function () { _kirimKeEnginePreview(webview, _effectiveForPreview()); });
                    });
                }
            }
        });
        _playerPreviewFrame.mount();
        _renderPreviewScopeBadge();   // player mana yang termuat (chapter/novel/global)

        // Config awal hanya relevan untuk engine global (custom render sendiri).
        if (!isCustomEngine) {
            var pp = _effectiveForPreview();
            if (pp) _playerPreviewFrame.sendConfig(pp);
        }
    }

    // FB5: perubahan STRUKTURAL (apply/undo template menulis ulang player.html +
    // theme.css, termasuk atribut data-dialogue-style) TAK cukup dengan push config
    // — file itu sendiri berubah, jadi webview harus dimuat ULANG. Bongkar frame
    // agar _resolvedPlayerHtml dievaluasi lagi (shim baru/berubah) & drive dari nol.
    // (Perubahan KOSMETIK dari picker tetap ringan lewat refreshPlayerPreview.)
    // ==========================================
    // DETEKTOR STALL (renderer editor) — lihat vn-engine/stall-detector.js.
    //
    // Freeze klik-template dilaporkan dari pemakaian NYATA tapi tiga harness
    // gagal mereproduksinya, semuanya karena menjalankan UI dalam keadaan yang
    // bukan keadaan pemakaian. Jadi aplikasi yang melapor sendiri.
    // ==========================================
    var _stall = (function () {
        try {
            var mod = require(path.join(__dirname, '..', '..', 'vn-engine', 'stall-detector.js'));
            var d = mod.buatDetektor({
                utas: 'renderer',
                lapor: function (rec) { try { ipcRenderer.send('stall:report', rec); } catch (e) {} }
            });
            d.mulai();
            return d;
        } catch (e) {
            // Detektor tak boleh jadi syarat editor bisa jalan.
            return { tandai: function () { return function () {}; },
                     sekitar: function (n, fn) { return fn(); } };
        }
    })();

    /**
     * Lapor ke main tiap kali preview dimuat ulang / dibangun ulang.
     *
     * Main yang menghitung `webContents` & memori renderer — hanya di sana
     * angkanya terlihat. Kalau jumlahnya MENANJAK di sepanjang sesi, kebocoran
     * webview terbukti di lingkungan pemakaian NYATA; itu yang tak berhasil
     * dibuktikan harness, karena preview tak pernah benar-benar menyala di sana
     * (terukur: `webContents` tetap 1 selama 8 apply).
     */
    /**
     * Penghitung jalur render berat.
     *
     * Bukti terakhir: heap Oilpan editor 457 MB padahal node TERPASANG cuma
     * ~1120, webview 1, JS heap 11 MB. Satu-satunya bacaan yang muat: yang
     * menumpuk adalah **DOM TERLEPAS** — dibangun, dibuang dari dokumen, tapi
     * masih dipegang sesuatu. `getElementsByTagName('*')` tak melihatnya
     * (probe sebelumnya buta karena itu).
     *
     * Yang belum diketahui: jalur mana yang membangun-lalu-membuang sebanyak
     * itu. Penghitung ini menjawabnya tanpa menebak — kalau satu jalur terpanggil
     * puluhan kali per aksi, ia langsung terlihat.
     */
    var _hitungRender = { cssVars: 0, template: 0, initPreview: 0, buatFrame: 0 };

    function _laporPreview(jenis) {
        try {
            // Crash-nya di heap OILPAN — tempat objek DOM Blink tinggal, dan
            // `workingSetSize` tak melihatnya (terukur: metrikku melaporkan
            // 199 MB untuk proses yang GC-nya menyebut 455 MB). Jadi ukurannya
            // bukan megabita melainkan JUMLAH NODE.
            var d = {};
            try {
                d.node = document.getElementsByTagName('*').length;
                d.webview = document.getElementsByTagName('webview').length;
                // Simpul yang lepas dari dokumen tapi masih dipegang JS tak bisa
                // dihitung langsung; selisih node yang naik sementara jumlah
                // webview tetap adalah petunjuk terdekatnya.
                if (window.performance && performance.memory) {
                    d.jsHeapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
                }
            } catch (e) {}
            d.render = _hitungRender;
            ipcRenderer.send('preview:rebuilt', { jenis: jenis, dom: d });
        } catch (e) {}
    }

    /**
     * PENGGABUNG pemuatan ulang preview — dari bukti log, bukan dugaan.
     *
     * `logs/stall.log` sesi user menunjukkan **enam `reload` dalam 2,9 detik**
     * padahal terminal hanya mencatat SATU "Template player diterapkan". Satu
     * aksi memicu enam pemuatan, karena `_hardReloadPreview()` punya tujuh
     * pemanggil yang saling menyusul (apply, ganti target, undo, tulis berkas…).
     *
     * Tiap pemuatan membaca ulang seluruh halaman player beserta aset novelnya —
     * terukur ~16 MB per kali di Elainakyu, sementara `webContents` TETAP 5.
     * Jadi yang menumpuk bukan webview (dugaan itu salah, dicabut), melainkan
     * dokumen yang dibuang lebih cepat daripada Blink sempat memungutnya:
     * `mu = 0.288` berarti 71% waktu habis di GC, lalu OOM.
     *
     * Lima dari enam pemuatan itu hasilnya langsung ditimpa pemuatan berikutnya.
     * Menggabungkannya bukan mengurangi kesegaran preview — hasil akhirnya sama,
     * hanya jalannya sekali.
     */
    var _reloadTimer = null;
    function _hardReloadPreview() {
        clearTimeout(_reloadTimer);
        _reloadTimer = setTimeout(_hardReloadPreviewSekarang, 300);
    }

    /** Jalur langsung — dipakai pemanggil yang memang butuh hasilnya seketika. */
    function _hardReloadPreviewSekarang() {
        // Penanda dipasang DI SINI, bukan di tiap pemanggil: keenam pemanggil
        // lain (`chapter-player:*`, ganti target, undo template, dll.) ikut
        // tercakup sendiri, dan tak ada yang bisa lupa memasangnya.
        return _stall.sekitar('hardReloadPreview', function () {
            _stopPlaythrough();   // bebaskan state engine yang dipegang playthrough sebelum bongkar

            // JALUR HEMAT — muat ulang webview yang ADA, jangan bongkar-pasang.
            //
            // Menerapkan template mengubah ISI BERKAS (`player.html`, `theme.css`),
            // bukan URL engine yang dimuat preview. Untuk itu `reload()` sudah
            // cukup: berkasnya dibaca ulang dari disk.
            //
            // Membongkar-pasang webview di kasus ini bukan cuma mubazir — ia
            // mahal. Crash log user menunjukkan renderer mati dengan
            // `Oilpan: Ran out of reservation` (heap objek Blink) sesudah GC
            // memakan 9,6 detik per siklus. Tiap webview baru memuat player
            // lengkap beserta aset novelnya; yang lama belum tentu segera bebas.
            //
            // `initPlayerPreview()` sudah lama punya cabang `reload()` untuk ini,
            // tapi fungsi ini melewatinya karena meng-`null`-kan frame lebih dulu.
            var wv = _playerPreviewFrame && _playerPreviewFrame.getWebview &&
                     _playerPreviewFrame.getWebview();
            var mode = _playerPreviewFrame && _playerPreviewFrame.getMode
                     ? _playerPreviewFrame.getMode() : 'live';
            if (wv && wv.reload && mode === 'live' &&
                _playerPreviewEngineURL === _desiredLiveURL() &&
                !_activeChapterPlayerIsCustom()) {
                try {
                    _laporPreview('reload');
                    wv.reload();
                    return;
                } catch (e) { /* webview belum siap → jatuh ke bongkar-pasang di bawah */ }
            }

            _laporPreview('rebuild');
            if (_playerPreviewFrame) { try { _playerPreviewFrame.destroy(); } catch (e) { /* ignore */ } _playerPreviewFrame = null; }
            _playerPreviewEngineURL = null;
            _playerPreviewNovel = null;
            initPlayerPreview();
        });
    }

    function refreshPlayerPreview(options) {
        options = options || {};
        var refreshTheme = options.refreshTheme !== false;
        var frame = _playerPreviewFrame;
        if (!frame) return;
        // Custom engine sejati (bridge) render sendiri — profil JSON tak dipaksakan.
        // Shim TIDAK termasuk: ia engine bersama, jalur global, config di-push (FB4).
        if (_activeChapterPlayerIsCustom()) return;
        // Ganti target (Global ↔ chapter) berarti entri contohnya juga berganti.
        // Dijaga oleh kunci di `_langkahScript`, jadi ini no-op selama target sama —
        // penting karena fungsi ini juga dipanggil tiap ketikan (debounced).
        if (_langkahScript.dimuatUntuk !== _kunciLangkah()) {
            _muatLangkahScript().then(_kirimLangkahKePreview);
        }
        var pp = _effectiveForPreview();
        if (pp) {
            // Perubahan theme/file menyuntik cascade DULU. Perubahan perilaku seperti
            // switch override tidak menyentuh CSS: membuang/membuat ulang <link> pada
            // setiap toggle hanyalah churn CSSOM/Oilpan.
            var wv = frame.getWebview && frame.getWebview();
            var injected = (refreshTheme && wv) ? _injectPreviewThemeCss(wv) : Promise.resolve();
            var payload = refreshTheme ? pp : {
                __vnPlayerConfigEnvelope: true,
                profile: pp,
                refreshCss: false
            };
            injected.then(function () {
                // Jangan kirim hasil async milik frame lama ke frame yang baru.
                if (_playerPreviewFrame === frame) frame.sendConfig(payload);
            });
            // Hot-reload: push config to external preview window if open
            ipcRenderer.invoke('vn-engine:push-player-config', {
                config: pp,
                refreshCss: refreshTheme
            }).catch(function() {});
        }
    }

    function _schedulePlayerPreviewRefresh(refreshTheme) {
        _playerPreviewNeedsTheme = _playerPreviewNeedsTheme || refreshTheme === true;
        clearTimeout(_playerPreviewTimer);
        _playerPreviewTimer = setTimeout(function () {
            var needsTheme = _playerPreviewNeedsTheme;
            _playerPreviewNeedsTheme = false;
            _playerPreviewTimer = null;
            refreshPlayerPreview({ refreshTheme: needsTheme });
        }, VN.Config.PREVIEW_DEBOUNCE_MS);
    }

    function schedulePlayerPreviewRefresh() {
        _schedulePlayerPreviewRefresh(true);
    }

    function schedulePlayerBehaviorPreviewRefresh() {
        _schedulePlayerPreviewRefresh(false);
    }

    // Auto-refresh on changes in player profile wrapper
    (function () {
        if (playerProfileWrapper) {
            playerProfileWrapper.addEventListener('input', schedulePlayerPreviewRefresh);
            playerProfileWrapper.addEventListener('change', schedulePlayerPreviewRefresh);
        }
    })();

    /**
     * Bongkar preview Player sepenuhnya — pasangan `destroyHubPreview()`.
     *
     * Preview Live adalah webview yang menjalankan runtime SUNGGUHAN: ia memutar
     * BGM, menjalankan timer, dan memegang state chapter di main lewat
     * playthrough. Menyembunyikan panelnya (display:none) tidak menghentikan satu
     * pun dari itu — webview yang tak terlihat tetap bersuara. Itulah keluhan
     * tester: keluar dari editor lewat tombol kembali, musik preview terus jalan.
     *
     * Urutannya penting. `_stopPlaythrough()` lebih dulu supaya main melepas
     * state chapter yang dipinjam; membongkar webview duluan membuat main tetap
     * memegang pinjaman itu untuk webview yang sudah tak ada.
     */
    function destroyPlayerPreview() {
        _stopPlaythrough();
        clearTimeout(_reloadTimer);
        _reloadTimer = null;
        if (_playerPreviewFrame) {
            try { _playerPreviewFrame.destroy(); } catch (e) { /* sudah dibongkar */ }
            _playerPreviewFrame = null;
        }
        // Dikosongkan supaya kunjungan berikutnya membangun frame baru, bukan
        // menyangka frame lama masih sah (initPlayerPreview membandingkan keduanya).
        _playerPreviewEngineURL = null;
        _playerPreviewNovel = null;
    }

    // Export for use by other modules
    window.renderPlayerProfilePanel = renderPlayerProfilePanel;
    window.refreshPlayerPreview = refreshPlayerPreview;
    window.destroyPlayerPreview = destroyPlayerPreview;

    // ==========================================
    // CHAPTER CONFIG — Per-Chapter Override (dipindah dari hubEditor.js)
    // ==========================================

    function escapeChapterAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Bangun kartu override chapter (vertikal, class sendiri — bukan .builder-item
    // yang flex-drag horizontal). Header/hapus dibuang: on/off = switch di header.
    function _buildChapterConfigCard(chapterName, cfg) {
        var el = document.createElement('div');
        el.className = 'chapter-override-card';
        el.style.cssText = 'background: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 16px 18px;';

        // FB10: dropdown Tema/Gaya Dialog + preset atmosfer DIBUANG dari kartu ini.
        // Keduanya sekarang ditentukan Template (file player.html + theme.css) —
        // menampilkannya lagi di sini = sumbu ganda ("milih 2 kali", keluhan user).
        // Yang tersisa MURNI perilaku permukaan cerita, konsisten dengan tab
        // Perilaku Global: Auto Mode + Sprite Slots. Ini tak bisa ditulis dalam CSS,
        // jadi memang tetap config JSON.
        el.innerHTML =
            '<p class="field-hint" style="margin-top: 0; margin-bottom: 14px;">Warna &amp; gaya dialog chapter ini ' +
                'diatur di tab <strong>Template</strong> &amp; <strong>Tampilan</strong>. Di sini hanya perilaku.</p>' +
            '<div class="cc-group-label cc-group-first">⚙️ Perilaku</div>' +
            '<div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap;">' +
                '<label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">' +
                    '<input type="checkbox" class="chapter-cfg-auto" data-chapter="' + chapterName + '" ' + (cfg.restrictions && cfg.restrictions.autoMode !== false ? 'checked' : '') + '> Izinkan Auto Mode</label>' +
                '<div><label class="editor-field-label">Sprite Slots</label>' +
                    '<input type="number" class="chapter-cfg-spriteSlots" data-chapter="' + chapterName + '" min="1" max="10" value="' + (cfg.spriteSlots || 5) + '" style="width: 90px; padding: 8px; background: #333; color: white; border: 1px solid #555; border-radius: 4px;"></div>' +
            '</div>';

        var warningText = _getChapterConfigWarning(chapterName, cfg);
        if (warningText) {
            var warningEl = document.createElement('div');
            warningEl.className = 'chapter-config-warning';
            warningEl.textContent = '⚠ ' + warningText;
            el.appendChild(warningEl);
        }
        return el;
    }

    // Note tipis saat chapter ikut PERILAKU Global. Kontrolnya = switch header.
    //
    // UX-A08: kalimatnya wajib menyebut SUMBU. Versi lamanya berbunyi "ikut profil
    // Global" tanpa keterangan apa pun, dan dipakai juga oleh dua permukaan
    // TAMPILAN — sehingga chapter yang punya theme.css sendiri diberi tahu
    // tampilannya diwarisi. Kini ia hanya dipakai tab Perilaku, dan mengaku
    // sebagai apa adanya.
    function _followGlobalNote(extra) {
        var note = document.createElement('p');
        note.className = 'chapter-follow-note';
        note.innerHTML = 'Chapter ini <strong>ikut PERILAKU Global</strong> — sprite slot, ' +
            'auto/skip. Matikan switch <strong>Perilaku ikut Global</strong> di header untuk ' +
            'mengatur keduanya khusus chapter ini. <strong>Struktur &amp; tema punya sumbunya ' +
            'sendiri</strong>: berkas <code>player.html</code>/<code>theme.css</code> milik ' +
            'chapter ini tetap dipakai runtime walau switch ini menyala. Kelola keduanya di ' +
            'tab <strong>Code</strong> &amp; <strong>Template</strong>.' + (extra || '');
        return note;
    }

    // render override CHAPTER AKTIF (target-first). Override on/off = switch header.
    function renderChapterGaya() {
        var container = document.getElementById('chapter-config-list');
        if (!container) return;
        var chapter = _activePlayerTarget;

        var nameEl = document.getElementById('chapter-gaya-name');
        if (nameEl) nameEl.textContent = chapter;

        container.innerHTML = '';
        var hc = getHubConfig();
        if (!hc) return;
        if (!hc.chapterConfig) hc.chapterConfig = {};

        if (!_chapterHasOverride(chapter)) { container.appendChild(_followGlobalNote()); return; }
        container.appendChild(_buildChapterConfigCard(chapter, hc.chapterConfig[chapter]));
    }
    window.renderChapterGaya = renderChapterGaya;

    function _getChapterConfigWarning(chapterName, cfg) {
        var warnings = [];
        var hc = getHubConfig();
        var globalProfile = hc ? (hc.playerProfile || {}) : {};

        // Cek "identik dengan global" WAJIB mencakup restrictions (audit H5) —
        // kalau tidak, override yang cuma beda autoMode memicu dua peringatan
        // yang saling membantah ("identik" + "Auto Mode dimatikan").
        // skipMode sengaja diabaikan: mati di runtime, tak pernah berefek.
        var globalAuto = (globalProfile.restrictions || {}).autoMode !== false;
        var cfgAuto = (cfg.restrictions || {}).autoMode !== false;
        if (cfg.playerTheme && cfg.playerTheme === (globalProfile.playerTheme || 'default') &&
            cfg.dialogueStyle && cfg.dialogueStyle === (globalProfile.dialogueStyle || 'bottom-bar') &&
            (cfg.spriteSlots || 5) === (globalProfile.spriteSlots || 5) &&
            !cfg.customCSS &&
            cfgAuto === globalAuto) {
            warnings.push('Override ini identik dengan profil global — tidak ada perubahan efektif.');
        }

        if (cfg.customCSS && cfg.customCSS.trim().length > 0 && cfg.customCSS.trim().length < 10) {
            warnings.push('Custom CSS sangat pendek — periksa apakah input sudah benar.');
        }

        if (globalAuto && !cfgAuto) {
            warnings.push('Auto Mode dinonaktifkan di chapter ini, padahal global mengizinkan.');
        }

        return warnings.length > 0 ? warnings.join(' | ') : '';
    }

    // Event delegation untuk Chapter Config
    (function initChapterConfigDelegation() {
        var container = document.getElementById('chapter-config-list');
        if (!container) return;

        // Hanya perilaku (Auto Mode + Sprite Slots) yang tersisa di kartu — handler
        // Tema/Gaya/atmosfer DIBUANG bersama widget-nya (FB10).
        container.addEventListener('change', function (e) {
            var ch = e.target.dataset.chapter;
            var hc = getHubConfig();
            if (!ch || !hc || !hc.chapterConfig[ch]) return;
            var cfg = hc.chapterConfig[ch];

            if (e.target.classList.contains('chapter-cfg-auto')) {
                if (!cfg.restrictions) cfg.restrictions = {};
                cfg.restrictions.autoMode = e.target.checked;
            } else if (e.target.classList.contains('chapter-cfg-spriteSlots')) {
                cfg.spriteSlots = parseInt(e.target.value) || 5;
            }
        });
        // (hidden/badge diedit di tab Story "Atur Chapter"; Tema/Gaya via Template.)
    })();

    // (Pembanding "Global Default" dihapus — perbandingan ada di tab Efektif.
    // Bekas: go-to-global-theme-btn & renderProfileSummaryCard dibuang di Fase D.)

    // ==========================================
    // EFFECTIVE CONFIG PANEL
    // ==========================================
    // Merge profil Global + override chapter (logika sama dgn runtime init.js).
    // Dipakai panel Effective Config DAN preview target-aware.
    function _computeEffectiveProfile(globalProfile, chapterOverride) {
        var merged = Object.assign({}, globalProfile);
        if (!chapterOverride) return merged;
        // Hanya kunci PLAYER yang menimpa global; hidden/badge = metadata Chapter Select
        // (tab Story), bukan bagian profil player — jangan sampai bocor ke effective config.
        _PLAYER_OVERRIDE_KEYS.forEach(function (k) {
            if (chapterOverride[k] === undefined) return;
            if (k === 'restrictions') {
                merged.restrictions = Object.assign({}, globalProfile.restrictions || {}, chapterOverride.restrictions || {});
            } else {
                merged[k] = chapterOverride[k];
            }
        });
        return merged;
    }

    // render Effective Config untuk CHAPTER AKTIF (tanpa dropdown internal).
    function renderEffectiveForActiveTarget() {
        var nameEl = document.getElementById('ec-active-chapter');
        var isChapter = _activePlayerTarget && _activePlayerTarget !== 'global';
        if (nameEl) nameEl.textContent = isChapter ? _activePlayerTarget : '(Global)';
        renderEffectiveConfig(isChapter ? _activePlayerTarget : '');
    }
    window.renderEffectiveForActiveTarget = renderEffectiveForActiveTarget;

    function renderEffectiveConfig(selectedChapter) {
        var container = document.getElementById('ec-panels-container');
        if (!container) return;

        var hc = getHubConfig();
        var globalProfile = hc ? (hc.playerProfile || {}) : {};
        var chapterOverride = (selectedChapter && hc && hc.chapterConfig && hc.chapterConfig[selectedChapter]) || null;

        var merged = _computeEffectiveProfile(globalProfile, chapterOverride);

        container.innerHTML = '';

        // Build 3 columns (or 2 if no chapter override)
        var grid = document.createElement('div');
        grid.className = 'ec-grid' + (chapterOverride ? ' ec-grid-3' : ' ec-grid-2');

        // Column 1: Global profile
        grid.appendChild(buildECColumn('Profil Global', globalProfile, 'ec-col-global'));

        // Column 2: Chapter override (if selected)
        if (chapterOverride) {
            grid.appendChild(buildECColumn('📝 Override: ' + escapePlayerHTML(selectedChapter), chapterOverride, 'ec-col-override'));
        }

        // Column 3 (or 2): Merged result
        grid.appendChild(buildECColumn('✅ Hasil Merge (Runtime)', merged, 'ec-col-merged'));

        container.appendChild(grid);
    }

    function buildECColumn(title, data, className) {
        var col = document.createElement('div');
        col.className = 'ec-column ' + (className || '');

        var header = document.createElement('div');
        header.className = 'ec-column-header';
        header.textContent = title;
        col.appendChild(header);

        var body = document.createElement('div');
        body.className = 'ec-column-body';

        var fields = [
            { key: 'playerTheme', label: 'Tema' },
            { key: 'dialogueStyle', label: 'Gaya Dialog' },
            { key: 'spriteSlots', label: 'Sprite Slots' },
            { key: 'customCSS', label: 'Custom CSS', isCSS: true },
            { key: 'restrictions', label: 'Restriksi', isObj: true }
        ];

        fields.forEach(function (f) {
            var row = document.createElement('div');
            row.className = 'ec-field';

            var label = document.createElement('span');
            label.className = 'ec-field-label';
            label.textContent = f.label;

            var value = document.createElement('span');
            value.className = 'ec-field-value';

            var val = data[f.key];
            if (val === undefined || val === null || val === '') {
                value.textContent = '—';
                value.classList.add('ec-empty');
            } else if (f.isCSS) {
                var charCount = String(val).length;
                value.textContent = charCount > 0 ? charCount + ' chars' : '—';
                if (charCount > 0) value.title = String(val).substring(0, 200);
            } else if (f.isObj) {
                var parts = [];
                if (typeof val === 'object') {
                    Object.keys(val).forEach(function (k) {
                        parts.push(k + ': ' + (val[k] ? '✓' : '✗'));
                    });
                }
                value.textContent = parts.length > 0 ? parts.join(', ') : '—';
            } else {
                value.textContent = String(val);
            }

            row.appendChild(label);
            row.appendChild(value);
            body.appendChild(row);
        });

        col.appendChild(body);
        return col;
    }

    // ==========================================
    // PLAYER TOOLBAR BUTTONS (Controls Bar)
    // ==========================================
    (function() {
        var previewBtn = document.getElementById('btn-preview-player');
        if (previewBtn) previewBtn.addEventListener('click', function() {
            refreshPlayerPreview();
            VN.Toast.info('Preview Player diperbarui.');
        });

        var runBtn = document.getElementById('btn-run-player');

        // I1: chapter yang dijalankan = target aktif sidebar VN Player (bukan
        // chapter yang kebetulan terbuka di tab Story). 'global' → fallback ke
        // chapter tab Story bila ada.
        function _resolveRunChapter() {
            if (_activePlayerTarget && _activePlayerTarget !== 'global') return _activePlayerTarget;
            return (window.currentlyEditing && window.currentlyEditing.chapter) || '';
        }

        async function _launchPlayer() {
            var chapterName = _resolveRunChapter();
            if (!chapterName) {
                VN.Toast.warning('Pilih chapter terlebih dahulu agar player bisa menampilkan konten.');
            }
            var pp = ensurePlayerProfile();
            try {
                runBtn.disabled = true;
                runBtn.textContent = '⏳ Membuka Player…';
                var result = await ipcRenderer.invoke('vn-engine:preview-player', {
                    novelTitle: window.currentlyEditingNovel,
                    playerProfile: pp,
                    chapterName: chapterName || undefined
                });
                if (result && result.success) {
                    VN.Toast.success(chapterName
                        ? 'Player dibuka dengan chapter: ' + chapterName
                        : 'Player dibuka di jendela preview (tanpa chapter).');
                } else {
                    VN.Toast.error('Gagal membuka Player: ' + (result && result.message || 'Unknown error'));
                }
            } catch (err) {
                VN.Toast.error('Gagal membuka Player: ' + err.message);
            } finally {
                runBtn.disabled = false;
                runBtn.textContent = '▶ Jalankan Player';
            }
        }

        if (runBtn) runBtn.addEventListener('click', function() {
            if (!window.currentlyEditingNovel) {
                VN.Toast.warning('Belum ada novel yang dipilih.');
                return;
            }
            // I2: jendela player membaca dari DISK — perubahan belum tersimpan
            // tidak akan tampak. Tawarkan simpan dulu bila ada yang dirty.
            var dirty = (typeof window._hubIsDirty === 'function' && window._hubIsDirty()) ||
                        (typeof window._playerIsDirty === 'function' && window._playerIsDirty()) ||
                        (typeof window._scriptIsDirty === 'function' && window._scriptIsDirty());
            if (!dirty) { _launchPlayer(); return; }
            VN.Toast.show('Ada perubahan belum disimpan — jendela player membaca data dari disk.', {
                type: 'warning',
                actions: [
                    {
                        label: 'Simpan & Jalankan',
                        primary: true,
                        onClick: async function () {
                            try {
                                if (typeof window.saveAllNovelChanges !== 'function') return;
                                await VN.Utils.continueAfterCheckedSave(
                                    window.saveAllNovelChanges,
                                    _launchPlayer
                                );
                            } catch (e) { console.error('Gagal menyimpan sebelum menjalankan player:', e); }
                        }
                    },
                    { label: 'Jalankan Tanpa Simpan', onClick: function () { _launchPlayer(); } },
                    { label: 'Batal', onClick: function () {} }
                ]
            });
        });
    })();

    // ==========================================
    // PLAYER PROFILE PRESETS
    // ==========================================
    // (IIFE initPlayerPresetPicker DIHAPUS 2026-07-30 — inert sejak D3 karena
    //  #player-preset-grid dibuang bersama tab Gaya, dan PLAYER_PROFILE_PRESETS yang
    //  ia baca kini tak ada. Penggantinya: dispenser pustaka template player.)

})();
