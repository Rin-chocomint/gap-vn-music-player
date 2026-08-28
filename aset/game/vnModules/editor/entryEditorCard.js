        // ====== Utility: HTML/Attr Escape untuk mencegah XSS ======
        //
        // ⚠ Penjaganya `== null`, BUKAN `!str`. Cek falsy di sini adalah sumber
        // kehilangan data terbesar yang terukur di audit round-trip: `set_var`
        // dengan `value: 0` / `value: false` dirender jadi `value=""`, lalu jalur
        // simpan menuliskan string kosong ke script.json — 207 entri di novel
        // shipped (DDLC memakai `false` untuk flag `skip_*`, dan `0` untuk
        // penghitung). Angka nol dan boolean false adalah NILAI, bukan ketiadaan.
        function _escapeAttr(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }
        function _escapeHTML(str) {
            if (str === null || str === undefined) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        // ====== Helper: Condition Builder ======
        // Render + serialisasi kondisi (termasuk kombinator all/any/not bertingkat)
        // kini milik komponen bersama VN.NodeRegistry.ConditionUI (node-registry.js)
        // — satu sumber untuk kondisi entry-level DAN kondisi per-opsi choice.

        // ====== Helper: notice untuk kondisi yang tak terepresentasikan builder ======
        function buildRawConditionNoticeHTML(conditionData, subjek) {
            let rawJSON = '';
            try { rawJSON = JSON.stringify(conditionData, null, 2); } catch (e) { rawJSON = String(conditionData); }
            return `
                <div style="background:#2a2210; border:1px solid #665500; color:#e0c060; border-radius:4px; padding:6px 8px; margin-bottom:6px; font-size:0.8em;">
                    ⚠️ Kondisi ${subjek} memakai bentuk yang belum bisa diedit builder (mis. operand <code>{var:...}</code> atau field tambahan).
                    Kondisi <strong>tetap dipertahankan utuh</strong> saat disimpan — edit lewat <code>script.json</code> bila perlu mengubahnya.
                </div>
                <pre style="background:#1a1a1a; border:1px solid #333; border-radius:4px; padding:6px; font-size:0.7em; max-height:120px; overflow:auto; white-space:pre-wrap;">${_escapeHTML(rawJSON)}</pre>`;
        }

        // ====== Builder HTML satu opsi choice ======
        // Dipakai render card (entryEditorCard) DAN tombol "+ Tambah Opsi"
        // (scriptEditor) — dulu markup-nya diduplikasi di dua tempat.
        // Baris utama: teks ➔ jump ⚙ ×; panel Lanjutan: setVariable per-opsi,
        // kondisi tampil (Condition Builder v2), dan flag timeout QTE.
        function buildChoiceOptionEditorHTML(opt, jumpOptionsHTML, index) {
            opt = opt || {};
            const _C = VN.NodeRegistry.C;
            const CondUI = VN.NodeRegistry.ConditionUI;
            const sv = (opt.setVariable && typeof opt.setVariable === 'object') ? opt.setVariable : null;
            const svOp = sv && sv.op ? sv.op : '=';
            const svIsRandom = svOp === 'random';
            const svValue = (sv && sv.value !== undefined && !Array.isArray(sv.value)) ? sv.value : '';
            const svMin = (sv && Array.isArray(sv.value)) ? sv.value[0] : '';
            const svMax = (sv && Array.isArray(sv.value)) ? sv.value[1] : '';
            const hasCond = opt.condition !== undefined && opt.condition !== null;
            const condRepresentable = CondUI.canRepresent(hasCond ? opt.condition : null);
            const hasAdvanced = !!(sv || hasCond || opt.timeout);
            const condInner = condRepresentable
                ? CondUI.buildHTML(hasCond ? opt.condition : null)
                : buildRawConditionNoticeHTML(opt.condition, 'opsi ini');

            return `<div class="choice-option-editor" data-raw-option="${_escapeAttr(JSON.stringify(opt))}">
                <div class="choice-option-main-row">
                    <input type="text" class="script-input choice-option-text" value="${_escapeAttr(opt.text || '')}" placeholder="Teks untuk pilihan ${index !== undefined ? index + 1 : 'baru'}">
                    <span class="jump-arrow">➔</span>
                    <select class="script-input choice-option-jump">${jumpOptionsHTML}</select>
                    <button type="button" class="choice-option-adv-toggle ${hasAdvanced ? 'has-advanced' : ''}" title="Aksi lanjutan opsi ini: set variabel, kondisi tampil, timeout QTE">⚙${hasAdvanced ? '<span class="adv-dot">●</span>' : ''}</button>
                    <button type="button" class="remove-option-btn">×</button>
                </div>
                <div class="choice-option-advanced" style="display: none;">
                    <div class="opt-adv-block">
                        <label class="opt-adv-label">⌲ Set Variabel saat opsi ini dipilih <span class="opt-adv-hint">(kosongkan nama = tidak ada)</span></label>
                        <div class="opt-sv-row">
                            <input type="text" class="script-input opt-sv-name" value="${_escapeAttr(sv ? sv.name || '' : '')}" placeholder="nama variabel" style="flex: 2;">
                            <select class="script-input opt-sv-op" style="flex: 1.4;">${_C.optionsToHTML(_C.SET_VAR_OPS, svOp)}</select>
                            <input type="text" class="script-input opt-sv-value" value="${_escapeAttr(svValue)}" placeholder="Angka / Teks / $variabelLain" title="Ketik $namaVariabel untuk memakai nilai variabel lain." style="flex: 2; display: ${svIsRandom ? 'none' : ''};">
                            <span class="opt-sv-random-wrap" style="flex: 2; display: ${svIsRandom ? 'flex' : 'none'}; gap: 4px;">
                                <input type="number" class="script-input opt-sv-random-min" value="${svMin}" placeholder="Min" step="1">
                                <input type="number" class="script-input opt-sv-random-max" value="${svMax}" placeholder="Max" step="1">
                            </span>
                        </div>
                    </div>
                    <div class="opt-adv-block">
                        <label class="opt-adv-label" style="cursor: pointer;"><input type="checkbox" class="opt-cond-toggle" ${hasCond ? 'checked' : ''}> 🔒 Kondisi tampil <span class="opt-adv-hint">(opsi disembunyikan bila kondisi gagal)</span></label>
                        <div class="opt-cond-container" data-cond-mode="${condRepresentable ? 'builder' : 'raw'}" style="display: ${hasCond ? 'block' : 'none'}; margin-top: 4px;">
                            ${condInner}
                        </div>
                    </div>
                    <div class="opt-adv-block">
                        <label class="opt-adv-label" style="cursor: pointer;"><input type="checkbox" class="opt-timeout-check" ${opt.timeout ? 'checked' : ''}> ⏱ Pilih otomatis saat waktu QTE habis <span class="opt-adv-hint">(berlaku bila "Batas Waktu QTE" entri ini diisi)</span></label>
                    </div>
                </div>
            </div>`;
        }
        window.buildChoiceOptionEditorHTML = buildChoiceOptionEditorHTML;

        // ====== Konteks Preview Entri: linearisasi fase + simulasi state engine ======
        // Dipakai oleh tombol Preview per-entri agar bg/bgm/speaker/sprite yang
        // ditampilkan benar-benar meniru urutan asli core.js (backgroundStack,
        // lastBgmState, lastSpeaker, visibilitas sprite per slot), bukan cuma
        // menengok fase/label induk + sibling terdekat seperti sebelumnya.
        const _VIDEO_EXT = ['mp4', 'webm', 'mkv', 'avi', 'mov'];
        function _isVideoAsset(value) {
            const ext = String(value).split('.').pop().toLowerCase();
            return _VIDEO_EXT.includes(ext);
        }

        function _extractPhaseContextNode(phaseCard) {
            const node = { type: 'phase' };
            const mediaInput = phaseCard.querySelector('.phase-media-input');
            if (mediaInput && mediaInput.value.trim()) {
                const val = mediaInput.value.trim();
                if (_isVideoAsset(val)) {
                    node.video = val;
                } else {
                    node.background = val;
                    const modeRadio = phaseCard.querySelector('.phase-header input[data-key="backgroundMode"]:checked');
                    node.backgroundMode = modeRadio ? modeRadio.value : 'cover';
                }
            }
            const bgmInput = phaseCard.querySelector('.phase-default-bgm-input');
            if (bgmInput && bgmInput.value.trim()) node.bgm = bgmInput.value.trim();
            return node;
        }

        function _extractLabelContextNode(labelEl) {
            const node = { type: 'label' };
            const mediaInput = labelEl.querySelector('.label-media-input');
            if (mediaInput && mediaInput.value.trim()) {
                const val = mediaInput.value.trim();
                if (_isVideoAsset(val)) {
                    node.video = val;
                } else {
                    node.background = val;
                    const modeRadio = labelEl.querySelector('input[data-key="backgroundMode"]:checked');
                    node.backgroundMode = modeRadio ? modeRadio.value : 'cover';
                }
            }
            const bgmInput = labelEl.querySelector('.label-default-bgm-input');
            if (bgmInput && bgmInput.value.trim()) node.bgm = bgmInput.value.trim();
            return node;
        }

        // Susun seluruh entri di dalam fase (termasuk lintas label/sub-label) secara
        // berurutan sesuai document order, berhenti persis SEBELUM targetCard.
        function _linearizePhaseUpTo(phaseCard, targetCard) {
            const nodes = [];
            let stopped = false;

            nodes.push(_extractPhaseContextNode(phaseCard));

            function walk(container) {
                if (stopped || !container) return;
                const children = Array.from(container.children);
                for (const el of children) {
                    if (stopped) return;
                    if (el === targetCard) { stopped = true; return; }
                    if (!el.classList) continue;
                    if (el.classList.contains('dialogue-entry-card')) {
                        nodes.push(extractDataFromCard(el));
                    } else if (el.classList.contains('label-group-container')) {
                        nodes.push(_extractLabelContextNode(el));
                        walk(el.querySelector('.label-group-content'));
                    } else if (el.classList.contains('sub-label-container')) {
                        nodes.push({ type: 'label' }); // sub-label tidak punya bg/bgm sendiri
                        walk(el.querySelector('.sub-label-content'));
                    }
                }
            }

            walk(phaseCard.querySelector('.phase-content'));
            return nodes;
        }

        // Aturan "apa yang diwarisi sebuah entri" TIDAK disimulasikan ulang di sini.
        //
        // Dulu fungsi ini adalah implementasi KETIGA dari aturan yang sama — runtime
        // (`core.js`), preview statik (`preview-payload.js`), lalu kartu editor —
        // persis yang diperingatkan header preview-payload.js. Dan ia membeku sama
        // seperti yang kedua: nol `ambient`, nol `audioChannels`, `phase` tanpa
        // background malah MERESET latar (runtime membiarkannya), dan sprite-nya
        // "deklarasi terakhir menang" alih-alih merge sticky. Kartu adalah permukaan
        // yang paling sering dilihat kreator, jadi ia yang paling sering berbohong.
        var _sc;   // undefined = belum dicoba; null = tak tersedia
        function _storyCarry() {
            if (_sc !== undefined) return _sc;
            try {
                _sc = require(path.join(__dirname, '..', '..', 'vn-engine', 'story-carry.js'));
            } catch (e) {
                _sc = null;
                console.warn('[VN Editor] story-carry tak tersedia — konteks pratinjau kartu dimatikan:', e.message);
            }
            return _sc;
        }

        function _konteksKosong() {
            return {
                background: null, video: null, backgroundMode: 'cover',
                bgm: null, speaker: null,
                sprites: { sprite: null, sprite2: null, spriteCenter: null }
            };
        }

        function _simulateScriptContext(nodes) {
            const SC = _storyCarry();
            // Tanpa modul aturan, JANGAN mengarang simulasi cadangan — begitulah
            // salinan ini lahir. Lebih baik tanpa konteks daripada konteks yang salah.
            if (!SC) return _konteksKosong();

            const state = SC.stateAwal(null);
            let terakhir = null;   // payload entri visual TERAKHIR sebelum kartu target

            nodes.forEach((node) => {
                if (!node || !node.type) return;
                if (node.type === 'phase' || node.type === 'label') {
                    SC.serapStruktural(state, node);
                    return;
                }
                if (node.type === 'jump' || node.type === 'set_var') return;

                const payload = Object.assign({}, node);
                SC.serapEntri(state, node, payload);
                SC.injeksiEntri(payload, state);
                SC.serapSpriteLengket(state, node, payload);
                SC.persistLatar(state, node);
                terakhir = payload;
            });

            const latar = state.backgroundStack[state.backgroundStack.length - 1] || {};
            const b = state.lastBgmState;
            // Sprite diambil dari PAYLOAD entri terakhir, bukan dari deklarasi mentahnya:
            // dengan begitu mode sticky (payload sudah tergabung) maupun non-sticky
            // (payload = deklarasi sendiri) sama-sama benar tanpa cabang tambahan.
            const p = terakhir || {};
            const slot = (src, x, scale, anim) => (src ? { src: src, x: x, scale: scale, anim: anim } : null);

            return {
                background: latar.type === 'image' ? latar.src : null,
                video: latar.type === 'video' ? latar.src : null,
                backgroundMode: latar.mode || 'cover',
                bgm: b ? {
                    bgm: b.src, bgmVolume: b.volume, bgmPan: b.pan,
                    bgmDelay: b.delay, bgmLoop: b.loop, bgmFade: b.fade
                } : null,
                speaker: state.lastSpeaker || null,
                sprites: {
                    sprite: slot(p.sprite, p.spriteX, p.spriteScale, p.spriteAnim),
                    sprite2: slot(p.sprite2, p.sprite2X, p.sprite2Scale, p.sprite2Anim),
                    spriteCenter: slot(p.spriteCenter, p.spriteCenterX, p.spriteCenterScale, p.spriteCenterAnim)
                }
            };
        }

        // Entry point: konteks lengkap (bg/bgm/speaker/sprite) tepat sebelum `card`
        // dijalankan, ditentukan lewat linearisasi + simulasi fase induknya.
        function computeEntryPreviewContext(card) {
            const phaseCard = card.closest('.phase-card');
            if (!phaseCard) return { background: null, video: null, backgroundMode: 'cover', bgm: null, speaker: null, sprites: { sprite: null, sprite2: null, spriteCenter: null } };
            const nodes = _linearizePhaseUpTo(phaseCard, card);
            return _simulateScriptContext(nodes);
        }

        /**
         * Blok CHANNEL AUDIO BERNAMA (G1) — pintu editor untuk `audioChannels`.
         *
         * Berulang seperti "Sprite Custom": tiap baris satu channel. Kreator hanya perlu
         * menuliskannya saat MULAI/GANTI/BERHENTI — persistensinya dirawat `core.js`
         * (`lastChannelState`), jadi channel terus berbunyi melewati entri dialog tanpa
         * dideklarasikan ulang.
         *
         * `bgm` & `ambient` sengaja TIDAK boleh jadi nama di sini: keduanya punya field
         * & elemen sendiri (runtime menolaknya juga) — satu penulis per elemen.
         */
        function _audioChannelsHTML(data) {
            const daftar = Array.isArray(data.audioChannels) ? data.audioChannels : [];
            const baris = daftar.map((ch, i) => `
                <div class="audio-channel-item" style="display: grid; grid-template-columns: 1fr 2fr auto auto auto; gap: 6px; align-items: center; margin-bottom: 6px;">
                    <input type="text" class="script-input ac-name" value="${_escapeAttr(ch.channel || '')}"
                        placeholder="nama channel" title="Nama channel (mis. musicpoem). 'bgm'/'ambient' punya field sendiri.">
                    <input type="text" class="script-input ac-src audio-input" value="${_escapeAttr(ch.src || '')}"
                        placeholder="file audio… (atau kosongkan + centang Stop)">
                    <input type="number" class="script-input ac-fade" value="${ch.fade !== undefined ? ch.fade : ''}"
                        min="0" step="0.5" style="width: 70px;" placeholder="fade" title="Fade in/out (detik)">
                    <label style="display: flex; align-items: center; gap: 4px; margin: 0; font-size: 0.8em;" title="Ulangi track / daftar">
                        <input type="checkbox" class="script-input ac-loop" ${ch.loop !== false ? 'checked' : ''}> loop
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; margin: 0; font-size: 0.8em;" title="Hentikan channel ini mulai entri ini">
                        <input type="checkbox" class="script-input ac-stop" ${ch.stop ? 'checked' : ''}> ⏹
                    </label>
                    <input type="text" class="script-input ac-queue" value="${_escapeAttr((ch.queue || []).join(', '))}"
                        placeholder="playlist (opsional): a.mp3, b.mp3" style="grid-column: 1 / -1;"
                        title="Beberapa berkas dipisah koma — track berpindah otomatis saat selesai">
                </div>`).join('');
            return `
                <div style="width: 100%; margin-top: 14px; border-top: 1px dashed #444; padding-top: 10px;">
                    <label class="entry-title" style="font-size: 0.9em;">🎚 Channel Audio Bernama <span style="opacity:0.6; font-weight:normal;">(hidup berdampingan dengan BGM)</span></label>
                    <p style="font-size: 0.75em; opacity: 0.6; margin: 2px 0 8px;">Cukup ditulis saat mulai/ganti/berhenti — channel terus berbunyi di entri berikutnya.</p>
                    <div class="audio-channels-container">${baris}</div>
                    <button type="button" class="add-audio-channel-btn" style="font-size: 0.8em; padding: 4px 10px; cursor: pointer;">+ Tambah Channel</button>
                    <p class="audio-channels-empty-msg" style="font-size: 0.75em; opacity: 0.5; font-style: italic; margin: 4px 0 0; display: ${daftar.length ? 'none' : 'block'};">Belum ada channel tambahan.</p>
                </div>`;
        }

        /**
         * Baris POSISI X (G2 irisan a) — dropdown nama + slider angka, SATU kunci JSON.
         *
         * Dipakai ketiga slot preset lewat satu fungsi supaya aturannya tak jadi tiga
         * salinan yang bisa menyimpang. Nama diambil dari pemindai `--vn-pos-*`, jadi
         * posisi buatan kreator di `theme.css` muncul sendiri di sini.
         *
         * Nilai bertipe STRING = nama; ANGKA = persen (entri lama, nol migrasi). Slider
         * dinonaktifkan saat nama dipilih — kalau tidak, ia jadi kontrol yang tak
         * berefek (kelas §A: kreator menggeser sesuatu yang diabaikan kolektor).
         */
        /**
         * SPRITE MULTI-LAYER  — nilai slot sprite boleh STRING (satu gambar,
         * perilaku lama) atau ARRAY `[dasar, ...overlay]` (pose + ekspresi tanpa
         * ledakan berkas; runtime mendukungnya sejak 2026-07-10 dan panduan kreator
         * mencontohkannya).
         *
         * ⚠ Sebelum ini editor tak tahu bentuk array sama sekali: nilai array
         * dirender ke satu `<input>` sebagai "a.png,b.png", lalu disimpan kembali
         * sebagai STRING itu — entri multi-layer HILANG hanya karena dibuka lalu
         * disimpan. Kelas kegagalan yang sama dengan FB17/FB18/FB19.
         */
        const _layerDasar = (v) => (Array.isArray(v) ? (v[0] || '') : (v || ''));
        const _layerTambahan = (v) => (Array.isArray(v) ? v.slice(1).filter(Boolean) : []);

        /**
         * Baris layer tambahan untuk satu slot. Dasar tetap di input file utama —
         * blok ini hanya mengurus overlay-nya, jadi entri satu-gambar tak berubah
         * bentuk sama sekali (nol migrasi).
         */
        /**
         * Satu baris layer. Diekspor karena assetManager membuat baris BARU saat
         * tombol "+ Tambah Layer" diklik — dulu ia menyalin markupnya sendiri, jadi
         * baris yang baru ditambah bergaya beda dari baris yang dimuat dari berkas.
         * Dua rumah untuk satu markup selalu menyimpang; ini menutupnya.
         */
        function _normalLayerSetting(setting) {
            const raw = (setting && typeof setting === 'object') ? setting : {};
            const numberInRange = (value, min, max) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : 0;
            };
            const numberOrDefault = (value, min, max, fallback) => {
                const parsed = Number(value);
                return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
            };
            const animation = String(raw.anim || '').trim();
            return {
                delay: numberInRange(raw.delay, 0, 60000),
                offsetX: numberInRange(raw.offsetX, -100, 100),
                offsetY: numberInRange(raw.offsetY, -100, 100),
                // Transform adalah milik layer sendiri, jadi satuannya memakai
                // persen natural (100 = ukuran/aset asli). Ini tidak bercampur
                // dengan scale slot sprite yang mengatur seluruh karakter.
                scale: numberOrDefault(raw.scale, 0, 300, 100),
                rotation: numberInRange(raw.rotation, -360, 360),
                opacity: numberOrDefault(raw.opacity, 0, 100, 100),
                flipX: raw.flipX === true,
                hideBase: raw.hideBase === true,
                // Hanya nama kelas animasi yang sah. Custom player/theme tetap
                // boleh menambah `anim-*`, tetapi string arbitrer tak boleh sampai
                // menjadi classList runtime.
                anim: /^anim-[A-Za-z0-9_-]+$/.test(animation) ? animation : ''
            };
        }

        function _spriteLayerItemHTML(src, setting) {
            const config = _normalLayerSetting(setting);
            const layerConst = VN.NodeRegistry.C;
            const layerAnimOptions = [{ value: '', label: 'Tanpa animasi layer' }]
                .concat(layerConst.ANIM_OPTIONS_CUSTOM || []);
            return `
                <div class="sprite-layer-item">
                    <div class="sprite-layer-preview" title="Preview aset layer tambahan ini.">
                        <img class="sprite-layer-preview-surface" alt="Preview layer tambahan">
                        <span class="sprite-layer-preview-placeholder">Preview layer</span>
                    </div>
                    <div class="sprite-layer-fields">
                    <div class="sprite-layer-source-row">
                        <input type="text" class="script-input image-input sprite-layer-src" value="${_escapeAttr(src || '')}"
                            placeholder="layer di atasnya… (mis. ekspresi.png)">
                        <button type="button" class="browse-file-btn" data-type="image">📁</button>
                        <button type="button" class="remove-sprite-layer-btn" title="Hapus layer">×</button>
                    </div>
                    <div class="sprite-layer-settings-row">
                        <label title="Menunda kemunculan layer setelah sprite dasar tampil."><span class="sprite-layer-setting-label">Delay</span>
                            <input type="number" class="script-input sprite-layer-delay" value="${config.delay}" min="0" max="60000" step="50"> <span>ms</span>
                        </label>
                        <label title="Geser layer secara relatif terhadap lebar frame sprite dasar."><span class="sprite-layer-setting-label">Offset X</span>
                            <input type="number" class="script-input sprite-layer-offset-x" value="${config.offsetX}" min="-100" max="100" step="0.1"> <span>%</span>
                        </label>
                        <label title="Geser layer secara relatif terhadap tinggi frame sprite dasar."><span class="sprite-layer-setting-label">Offset Y</span>
                            <input type="number" class="script-input sprite-layer-offset-y" value="${config.offsetY}" min="-100" max="100" step="0.1"> <span>%</span>
                        </label>
                    </div>
                    <div class="sprite-layer-animation-row">
                        <label title="Memutar preset animasi hanya pada layer ini; posisi panggung sprite dasar tetap tidak berubah."><span class="sprite-layer-setting-label">Animasi</span>
                            <select class="script-input sprite-layer-anim">${layerConst.optionsToHTML(layerAnimOptions, config.anim)}</select>
                        </label>
                    </div>
                    <div class="sprite-layer-transform-row">
                        <label title="Ukuran relatif layer; 100% = ukuran aset asli."><span class="sprite-layer-setting-label">Ukuran</span>
                            <input type="number" class="script-input sprite-layer-scale" value="${config.scale}" min="0" max="300" step="1"> <span>%</span>
                        </label>
                        <label title="Putar layer terhadap titik bawah-tengahnya."><span class="sprite-layer-setting-label">Rotasi</span>
                            <input type="number" class="script-input sprite-layer-rotation" value="${config.rotation}" min="-360" max="360" step="1"> <span>°</span>
                        </label>
                        <label title="Kepekatan layer."><span class="sprite-layer-setting-label">Opacity</span>
                            <input type="number" class="script-input sprite-layer-opacity" value="${config.opacity}" min="0" max="100" step="1"> <span>%</span>
                        </label>
                        <label class="sprite-layer-flip-label" title="Balik layer secara horizontal tanpa membalik sprite dasar.">
                            <input type="checkbox" class="script-input sprite-layer-flip-x" ${config.flipX ? 'checked' : ''}> Balik horizontal
                        </label>
                        <label class="sprite-layer-hide-base-label" title="Saat layer ini dieksekusi, gambar dasar disembunyikan. Delay layer menentukan kapan pergantiannya terjadi.">
                            <input type="checkbox" class="script-input sprite-layer-hide-base" ${config.hideBase ? 'checked' : ''}> Sembunyikan dasar saat layer muncul
                        </label>
                    </div>
                    </div>
                </div>`;
        }
        window.buildSpriteLayerItemHTML = _spriteLayerItemHTML;

        function _spriteLayersHTML(key, nilai, settings) {
            const layers = _layerTambahan(nilai);
            const settingsList = Array.isArray(settings) ? settings : [];
            const baris = layers.map((src, index) => _spriteLayerItemHTML(src, settingsList[index])).join('');
            return `
                <div class="sprite-layers-block">
                    <label class="animation-label" title="Layer digambar bertumpuk di atas gambar dasar — setiap layer dapat ditunda dan digeser relatif terhadap kanvasnya.">Layer Tambahan</label>
                    <div class="sprite-layers-container" data-slot="${key}">${baris}</div>
                    <button type="button" class="add-sprite-layer-btn" data-slot="${key}">+ Tambah Layer</button>
                    <p class="sprite-layers-empty-msg" style="display:${layers.length ? 'none' : 'block'};">Satu gambar saja — tambahkan layer untuk pose+ekspresi terpisah.</p>
                </div>`;
        }

        // Pisah nilai posisi X jadi {nama, angka}. STRING non-numerik = nama panggung;
        // sisanya persen. `defaultAngka` menjaga slider tetap masuk akal saat nama dilepas.
        function _posXPilah(nilai, defaultAngka) {
            const teks = (nilai === null || nilai === undefined) ? '' : String(nilai).trim();
            const nama = (teks && !isFinite(Number(teks))) ? teks : '';
            const angka = nama ? defaultAngka
                : (teks !== '' && isFinite(Number(teks)) ? Number(teks) : defaultAngka);
            return { nama, angka };
        }

        // Opsi dropdown + aturan D8 "pertahankan + tandai" (rumahnya di node-registry:
        // withUnknownOption). Penandanya khusus karena di sumbu ini daftarnya diturunkan
        // dari `--vn-pos-*` NYATA — jadi sebab "di luar daftar" hanya satu: tak ada di CSS.
        function _posXOpsi(nama) {
            return VN.NodeRegistry.C.withUnknownOption(
                VN.NodeRegistry.C.SPRITE_POS, nama, '⚠ tak ada di CSS');
        }

        const _POS_TITLE = "Posisi panggung bernama — nilainya diatur --vn-pos-* di CSS " +
            "(termasuk theme.css-mu). Pilih '— pakai angka —' untuk memakai slider.";

        function _posXRowHTML(key, nilai, defaultAngka) {
            const { nama, angka } = _posXPilah(nilai, defaultAngka);
            return `
                <div class="transform-row position-x-row">
                    <span class="transform-label">Posisi X</span>
                    <select class="script-input sprite-position-name" data-key="${key}" title="${_POS_TITLE}">
                        ${VN.NodeRegistry.C.optionsToHTML(_posXOpsi(nama), nama)}
                    </select>
                </div>
                <div class="transform-row position-x-row">
                    <span class="transform-label"></span>
                    <input type="range" class="script-input sprite-position-slider transform-slider" data-key="${key}-num" min="0" max="100" step="1" ${nama ? 'disabled' : ''} value="${angka}">
                    <span class="position-value-display transform-value" style="${nama ? 'opacity:.4;' : ''}">${angka}%</span>
                </div>`;
        }

        // Varian untuk baris sprite custom: dikoleksi lewat KELAS (bukan data-key),
        // tapi aturan nama-vs-angka sama persis — satu helper, dua bentuk kolektor.
        function _posXRowCustomHTML(nilai, sembunyi) {
            const { nama, angka } = _posXPilah(nilai, 50);
            const gaya = sembunyi ? 'style="display: none;"' : '';
            return `
                <div class="transform-row position-x-row" ${gaya}>
                    <span class="transform-label">Posisi X</span>
                    <select class="script-input extra-sprite-x-name" title="${_POS_TITLE}">
                        ${VN.NodeRegistry.C.optionsToHTML(_posXOpsi(nama), nama)}
                    </select>
                </div>
                <div class="transform-row position-x-row" ${gaya}>
                    <span class="transform-label"></span>
                    <input type="range" class="script-input extra-sprite-x transform-slider" min="0" max="100" step="1" ${nama ? 'disabled' : ''} value="${angka}">
                    <span class="position-value-display transform-value" style="${nama ? 'opacity:.4;' : ''}">${angka}%</span>
                </div>`;
        }

        // ================================================================
        // PROGRESSIVE DISCLOSURE (UX-B01)
        //
        // Keluhan tester: kartu Dialogue/Choice/Scene terlalu padat. Isinya
        // memang panjang — tiga slot sprite berikut animasi, transformasi,
        // transisi, dan layer — sementara sebagian besar entri cuma memakai
        // speaker dan teks.
        //
        // Dipakai `<details>`, BUKAN menghapus/merender-ulang isi seksi. Alasannya
        // bukan kemudahan: pipeline simpan masih membaca DOM, jadi elemen yang
        // dilepas berarti nilainya hilang saat disimpan. `<details>` menyembunyikan
        // secara visual tanpa melepas apa pun, sekaligus memberi keyboard nav dan
        // semantik aria bawaan. Virtualisasi baru boleh dibicarakan setelah model
        // canonical ada.
        // ================================================================

        /**
         * Seksi mana yang terbuka — PREFERENSI EDITOR, bukan data novel.
         *
         * Disimpan per-ID seksi (bukan per-entri): orang yang sedang menggarap
         * sprite ingin blok Visual terbuka di SEMUA kartu, bukan mengklik ulang di
         * tiap entri. Kegagalan baca/tulis storage sengaja ditelan — preferensi
         * tampilan tak layak menggagalkan pembukaan chapter.
         */
        const _SEKSI_KUNCI_SIMPAN = 'vnEditor.entrySections';
        let _seksiTerbukaMap = null;

        function _seksiPref() {
            if (_seksiTerbukaMap) return _seksiTerbukaMap;
            _seksiTerbukaMap = {};
            try {
                const mentah = window.localStorage.getItem(_SEKSI_KUNCI_SIMPAN);
                if (mentah) {
                    const parsed = JSON.parse(mentah);
                    if (parsed && typeof parsed === 'object') _seksiTerbukaMap = parsed;
                }
            } catch (e) { /* storage tak tersedia/korup — pakai bawaan tertutup */ }
            return _seksiTerbukaMap;
        }

        function _seksiSimpanPref(id, terbuka) {
            const pref = _seksiPref();
            pref[id] = !!terbuka;
            try {
                window.localStorage.setItem(_SEKSI_KUNCI_SIMPAN, JSON.stringify(pref));
            } catch (e) { /* lihat alasan di _seksiPref */ }
        }

        /**
         * Bungkus satu kelompok kontrol jadi seksi yang bisa dilipat.
         *
         * Seksi TIDAK dibuka otomatis walau isinya terpakai. Yang menjaga agar data
         * lama tak tersembunyi diam-diam adalah BADGE-nya: ia terbaca tanpa membuka
         * seksi, dan tidak ikut memanjangkan kartu. Membuka otomatis tiap seksi
         * berisi akan mengembalikan kartu ke keadaan padat yang justru dikeluhkan.
         */
        function _seksiHTML(id, judul, isi) {
            const terbuka = !!_seksiPref()[id];
            return `
                <details class="entry-section" data-section="${id}"${terbuka ? ' open' : ''}>
                    <summary class="entry-section-summary">
                        <span class="entry-section-title">${judul}</span>
                        <span class="entry-section-badge" data-badge-for="${id}"></span>
                    </summary>
                    <div class="entry-section-body">${isi}</div>
                </details>`;
        }

        /** Berapa slot sprite yang benar-benar terisi di entri ini? */
        function _jumlahSprite(data) {
            let n = 0;
            ['sprite', 'sprite2', 'spriteCenter'].forEach(function (k) {
                if (_layerDasar(data[k])) n++;
            });
            (data.charSprites || []).forEach(function (sp) {
                if (sp && sp.src) n++;
            });
            return n;
        }

        /**
         * Ringkasan isi tiap seksi, dihitung dari PAYLOAD ENTRI — bukan dari nilai
         * DOM yang mungkin sedang tersembunyi atau masih berisi bawaan render.
         *
         * Bedanya nyata: kotak sprite yang dirender kosong tetap punya `value` di
         * DOM, dan dropdown animasi selalu menunjuk sesuatu. Menghitung badge dari
         * DOM karena itu akan melaporkan "1 sprite" untuk entri yang tak punya
         * sprite sama sekali.
         *
         * Fungsi ini menerima objek entri, jadi pemanggilnya bebas: saat render
         * dipakai `data` (yang memang isi berkas), saat kreator menyunting dipakai
         * hasil extractDataFromCard kartu itu sendiri. Satu aturan, dua pemakai.
         */
        function hitungBadgeSeksi(type, data) {
            data = data || {};
            const badge = {};

            const nSprite = _jumlahSprite(data);
            const visual = [];
            if (nSprite) visual.push(nSprite + ' sprite');
            if (typeof data.spriteFocus === 'string' && data.spriteFocus && data.spriteFocus !== 'none') visual.push('fokus');
            if (data.spriteSticky) visual.push('lengket');
            if (visual.length) badge.visual = visual.join(' · ');

            if (data.specialEvent && data.specialEvent.type) badge.efek = String(data.specialEvent.type);

            // Choice: konfigurasi per-opsi DIAGREGASI di sini, bukan ditandai satu per
            // satu di tiap opsi. Sepuluh opsi bervariabel berarti sepuluh penanda
            // kecil yang tak satu pun terbaca; satu angka justru terbaca.
            const logika = [];
            if (data.condition) logika.push('Kondisi');
            const opsi = Array.isArray(data.choices) ? data.choices : [];
            const nVar = opsi.filter(function (o) { return o && o.setVariable; }).length;
            const nCond = opsi.filter(function (o) { return o && o.condition; }).length;
            if (nVar) logika.push(nVar + ' set var');
            if (nCond) logika.push(nCond + ' opsi berkondisi');
            if (logika.length) badge.logika = logika.join(' · ');

            // Badge menjawab satu pertanyaan: "ada isi apa di balik seksi yang
            // terlipat ini?". Karena itu ia hanya boleh menyebut yang MEMANG di
            // dalamnya. `autoDialogue` dulu ikut disebut di sini dan kini tidak lagi:
            // kontrolnya sudah pindah keluar, selalu terlihat di bawah tombol
            // "+ Tambah Opsi", jadi menandainya di sini berarti melaporkan sesuatu
            // yang tak tersembunyi — dan melaporkannya di kotak yang tak memuatnya.
            const qte = [];
            if (data.timeLimit) qte.push('QTE ' + (Number(data.timeLimit) / 1000) + ' dtk');
            if (opsi.some(function (o) { return o && o.timeout; })) qte.push('ada fallback');
            if (qte.length) badge.qte = qte.join(' · ');

            const transisi = [];
            if (data.transition && data.transition !== 'cut') transisi.push(data.transition);
            if (data.transitionOut && data.transitionOut !== 'cut') transisi.push('keluar: ' + data.transitionOut);
            if (transisi.length) badge.transisi = transisi.join(' · ');

            const audio = [];
            if (data.bgm) audio.push('BGM');
            if (data.bgmStop) audio.push('stop BGM');
            if (data.ambient) audio.push('ambient');
            if ((data.audioChannels || []).length) audio.push((data.audioChannels || []).length + ' channel');
            if (audio.length) badge.audio = audio.join(' · ');

            const efekLanjut = [];
            if (data.sfxIn) efekLanjut.push('SFX masuk');
            if (data.sfxOut) efekLanjut.push('SFX keluar');
            if (efekLanjut.length) badge.efekLanjut = efekLanjut.join(' · ');

            return badge;
        }

        /** Tuliskan badge ke kartu yang sudah jadi. */
        function terapkanBadgeSeksi(card, type, data) {
            const badge = hitungBadgeSeksi(type, data);
            card.querySelectorAll('[data-badge-for]').forEach(function (el) {
                const teks = badge[el.dataset.badgeFor] || '';
                el.textContent = teks;
                el.style.display = teks ? '' : 'none';
            });
        }

        window.hitungBadgeSeksi = hitungBadgeSeksi;
        window.terapkanBadgeSeksi = terapkanBadgeSeksi;

        // Preferensi buka/tutup diikat sekali secara delegasi. `toggle` tidak
        // menggelembung, jadi listener dipasang di fase CAPTURE — inilah cara
        // menangkapnya tanpa memasang listener di tiap seksi tiap kartu.
        // Badge menyusul perubahan kreator. `change` (bukan `input`) sudah cukup:
        // ia menyala saat nilai benar-benar dikomit, jadi ekstraksi tak dijalankan
        // pada tiap ketukan tombol.
        document.addEventListener('change', function (e) {
            const kartu = e.target && e.target.closest && e.target.closest('.dialogue-entry-card');
            if (!kartu || !kartu.querySelector('[data-badge-for]')) return;
            try {
                terapkanBadgeSeksi(kartu, kartu.dataset.type, window.extractDataFromCard(kartu));
            } catch (err) { /* badge kosmetik */ }
        });

        document.addEventListener('toggle', function (e) {
            const seksi = e.target;
            if (!seksi || !seksi.classList || !seksi.classList.contains('entry-section')) return;
            _seksiSimpanPref(seksi.dataset.section, seksi.open);
        }, true);

        // ==============================================================
        // KARTU RINGKAS UNTUK CHAPTER BESAR
        //
        // Satu kartu dialogue lengkap bisa membentuk ratusan node DOM walaupun
        // hampir seluruh seksi lanjutannya sedang tertutup. `display:none` dan
        // <details> hanya menghemat paint/layout; node-node Oilpan tetap hidup.
        // Mode ringan menyimpan payload canonical di `rawEntry` dan baru membangun
        // editor lengkap ketika kreator benar-benar membukanya.
        // ==============================================================
        const _BATAS_KARTU_PENUH = 6;
        let _kartuPenuhAktif = [];
        let _nomorEntriRingkas = 0;

        function _potongRingkasan(value, max) {
            let text = '';
            if (value !== null && value !== undefined) {
                if (typeof value === 'object') {
                    try { text = JSON.stringify(value); } catch (e) { text = String(value); }
                } else {
                    text = String(value);
                }
            }
            text = text.replace(/\s+/g, ' ').trim();
            if (text.length > max) return text.slice(0, Math.max(0, max - 1)) + '…';
            return text;
        }

        function _namaTipeRingkas(type, data) {
            const nama = {
                dialogue: 'Dialog', choice: 'Pilihan', scene: 'Transisi',
                set_var: 'Variabel', custom: 'Perintah', load_hub_flags: 'Hub flags',
                jump: 'Lompatan'
            };
            if (type === 'scene' && data && data.sceneType) return 'Transisi · ' + data.sceneType;
            return nama[type] || _potongRingkasan(type || 'Entri', 28);
        }

        function _isiRingkas(type, data) {
            data = data || {};
            if (type === 'dialogue' || type === 'choice') {
                return {
                    judul: _potongRingkasan(data.speaker || (type === 'choice' ? 'Pilihan' : 'Narasi'), 72),
                    isi: _potongRingkasan(data.text || '(teks kosong)', 240)
                };
            }
            if (type === 'scene') {
                return {
                    judul: _namaTipeRingkas(type, data),
                    isi: _potongRingkasan(data.background || data.video || data.text || '(tanpa aset)', 240)
                };
            }
            if (type === 'set_var') {
                const value = data.value !== undefined ? _potongRingkasan(data.value, 100) : '';
                return {
                    judul: _potongRingkasan(data.name || data.varName || 'Variabel', 72),
                    isi: _potongRingkasan((data.op || data.varOp || '=') + (value ? ' ' + value : ''), 240)
                };
            }
            if (type === 'custom') {
                return {
                    judul: _potongRingkasan(data.command || 'Custom command', 72),
                    isi: _potongRingkasan(data.params || '', 240) || '(tanpa parameter)'
                };
            }
            if (type === 'jump') {
                return { judul: 'Lompatan', isi: _potongRingkasan(data.target || '(target kosong)', 240) };
            }
            return {
                judul: _namaTipeRingkas(type, data),
                isi: _potongRingkasan(data.text || data.name || data.command || '', 240) || 'Klik untuk melihat detail.'
            };
        }

        function _teksCariEntri(type, data) {
            data = data || {};
            const bagian = [type, data.speaker, data.text, data.name, data.command,
                data.target, data.background, data.video, data.bgm];
            if (Array.isArray(data.choices)) {
                data.choices.forEach(function (opsi) {
                    if (opsi) bagian.push(opsi.text, opsi.jump);
                });
            }
            return bagian.filter(function (v) { return v !== null && v !== undefined; })
                .map(function (v) { return String(v).toLocaleLowerCase('id-ID'); }).join(' ');
        }

        function _metaRingkas(type, data) {
            const meta = [];
            if (type === 'choice' && Array.isArray(data.choices)) meta.push(data.choices.length + ' opsi');
            try {
                const badges = hitungBadgeSeksi(type, data || {});
                Object.keys(badges).forEach(function (key) {
                    if (badges[key]) meta.push(badges[key]);
                });
            } catch (e) { /* metadata hanya kosmetik */ }
            return meta.slice(0, 3).join(' · ');
        }

        function _renumberKartuRingkas(root) {
            root = root || document.getElementById('script-editor-area');
            if (!root || typeof root.querySelectorAll !== 'function') return 0;
            const cards = root.querySelectorAll('.dialogue-entry-card');
            cards.forEach(function (card, index) {
                const ordinal = index + 1;
                card.dataset.compactOrdinal = String(ordinal);
                const label = card.querySelector('.compact-entry-ordinal');
                if (label) label.textContent = '#' + ordinal;
                const deleteButton = card.querySelector('.compact-entry-delete');
                if (deleteButton) deleteButton.setAttribute('aria-label', 'Hapus entri #' + ordinal);
                const expandedStatus = card.querySelector('.expanded-entry-toolbar > span');
                if (expandedStatus) expandedStatus.textContent = 'Editor lengkap · entri #' + ordinal;
            });
            _nomorEntriRingkas = cards.length;
            return cards.length;
        }

        function _buatKartuRingkas(type, data, availableLabels, inLabelContext, opts) {
            opts = opts || {};
            data = data || {};
            const card = document.createElement('div');
            const kelasTipe = String(type || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
            card.className = 'dialogue-entry-card compact-entry-card entry-type-' + kelasTipe;
            card.dataset.type = type || 'unknown';
            card.dataset.inLabelContext = String(!!inLabelContext);
            card.dataset.compactEntry = 'true';
            const ordinal = opts.compactOrdinal || (++_nomorEntriRingkas);
            card.dataset.compactOrdinal = String(ordinal);
            try { card.dataset.rawEntry = JSON.stringify(data); }
            catch (e) { card.dataset.rawEntry = JSON.stringify({ type: type || 'unknown' }); }
            // Properti JS menghindari penyalinan array label yang sama ke ribuan atribut.
            card.__availableLabels = availableLabels || [];
            card.__searchText = _teksCariEntri(type, data);

            const drag = document.createElement('div');
            drag.className = 'drag-handle compact-entry-drag';
            drag.title = 'Seret untuk mengubah urutan';
            drag.textContent = '⠿';

            const buka = document.createElement('button');
            buka.type = 'button';
            buka.className = 'compact-entry-open';
            buka.setAttribute('aria-expanded', 'false');
            buka.title = 'Buka editor lengkap untuk entri ini';

            const atas = document.createElement('span');
            atas.className = 'compact-entry-topline';
            const nomor = document.createElement('span');
            nomor.className = 'compact-entry-ordinal';
            nomor.textContent = '#' + ordinal;
            const tipeEl = document.createElement('span');
            tipeEl.className = 'compact-entry-kind';
            tipeEl.textContent = _namaTipeRingkas(type, data);
            const ringkasan = _isiRingkas(type, data);
            const judul = document.createElement('strong');
            judul.className = 'compact-entry-title';
            judul.textContent = ringkasan.judul;
            atas.appendChild(nomor);
            atas.appendChild(tipeEl);
            atas.appendChild(judul);

            const isi = document.createElement('span');
            isi.className = 'compact-entry-excerpt';
            isi.textContent = ringkasan.isi;
            const metaText = _metaRingkas(type, data);
            if (metaText) {
                const meta = document.createElement('span');
                meta.className = 'compact-entry-meta';
                meta.textContent = metaText;
                atas.appendChild(meta);
            }
            const aksi = document.createElement('span');
            aksi.className = 'compact-entry-action';
            aksi.textContent = 'Buka editor';
            buka.appendChild(atas);
            buka.appendChild(isi);
            buka.appendChild(aksi);

            const hapus = document.createElement('button');
            hapus.type = 'button';
            hapus.className = 'delete-dialogue-btn compact-entry-delete';
            hapus.title = 'Hapus entri ini';
            hapus.setAttribute('aria-label', 'Hapus entri #' + ordinal);
            hapus.textContent = '×';

            card.appendChild(drag);
            card.appendChild(buka);
            card.appendChild(hapus);
            return card;
        }

        function _labelAktual() {
            const area = document.getElementById('script-editor-area');
            if (!area) return [];
            const hasil = [];
            area.querySelectorAll('.label-name-input, .sub-label-name-input').forEach(function (input) {
                let nama = String(input.value || '').trim();
                if (!nama) return;
                if (input.classList.contains('sub-label-name-input')) {
                    const induk = input.closest('.label-group-container');
                    const namaInduk = induk && induk.querySelector('.label-name-input');
                    const prefix = namaInduk ? String(namaInduk.value || '').trim() : '';
                    if (prefix) nama = prefix + '.' + nama;
                }
                hasil.push(nama);
            });
            return Array.from(new Set(hasil));
        }

        function _hapusDariLRU(card) {
            _kartuPenuhAktif = _kartuPenuhAktif.filter(function (item) {
                return item && item !== card && item.isConnected;
            });
        }

        function _sentuhKartuPenuh(card) {
            if (!card || card.dataset.largeHydrated !== 'true') return;
            _hapusDariLRU(card);
            _kartuPenuhAktif.push(card);
        }

        function _ringkasKartuPenuh(card) {
            if (!card || !card.isConnected || card.dataset.largeHydrated !== 'true') return null;
            let data = null;
            try { data = window.extractDataFromCard(card); }
            catch (e) {
                try { data = JSON.parse(card.dataset.rawEntry || '{}'); }
                catch (ignored) { data = { type: card.dataset.type || 'unknown' }; }
            }
            const compact = _buatKartuRingkas(
                card.dataset.type, data, _labelAktual(),
                card.dataset.inLabelContext === 'true',
                { compactOrdinal: card.dataset.compactOrdinal });
            compact.hidden = card.hidden;
            if (window.VNInspector && typeof window.VNInspector.deselectIfCard === 'function') {
                window.VNInspector.deselectIfCard(card);
            }
            if (typeof window.disposeMediaWithin === 'function') window.disposeMediaWithin(card);
            card.replaceWith(compact);
            _hapusDariLRU(card);
            return compact;
        }

        function _pangkasKartuPenuh() {
            _kartuPenuhAktif = _kartuPenuhAktif.filter(function (card) {
                return card && card.isConnected && card.dataset.largeHydrated === 'true';
            });
            while (_kartuPenuhAktif.length >= _BATAS_KARTU_PENUH) {
                let kandidat = _kartuPenuhAktif.find(function (card) {
                    return !card.contains(document.activeElement);
                });
                if (!kandidat) kandidat = _kartuPenuhAktif[0];
                if (!_ringkasKartuPenuh(kandidat)) break;
            }
        }

        function _hidrasiKartuRingkas(card) {
            if (!card || !card.isConnected || card.dataset.compactEntry !== 'true') return null;
            let data;
            try { data = JSON.parse(card.dataset.rawEntry || '{}'); }
            catch (e) { data = { type: card.dataset.type || 'unknown' }; }
            _pangkasKartuPenuh();
            const labels = _labelAktual();
            const full = createEntryEditorCard(
                card.dataset.type, data,
                labels.length ? labels : (card.__availableLabels || []),
                card.dataset.inLabelContext === 'true',
                { forceFull: true });
            full.dataset.largeHydrated = 'true';
            full.dataset.compactOrdinal = card.dataset.compactOrdinal || '';
            full.__searchText = card.__searchText || _teksCariEntri(card.dataset.type, data);

            const bar = document.createElement('div');
            bar.className = 'expanded-entry-toolbar';
            const status = document.createElement('span');
            status.textContent = 'Editor lengkap · entri #' + (full.dataset.compactOrdinal || '?');
            const ringkas = document.createElement('button');
            ringkas.type = 'button';
            ringkas.className = 'compact-entry-collapse';
            ringkas.textContent = 'Ringkas';
            ringkas.title = 'Tutup kontrol lengkap dan kembalikan kartu ke mode ringan';
            bar.appendChild(status);
            bar.appendChild(ringkas);
            const content = full.querySelector('.entry-content');
            if (content) content.insertBefore(bar, content.firstChild);

            full.hidden = card.hidden;
            card.replaceWith(full);
            _sentuhKartuPenuh(full);
            const fokus = full.querySelector('textarea[data-key="text"], input[data-key="speaker"], input, textarea, select');
            if (fokus && typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () {
                    try { fokus.focus({ preventScroll: true }); } catch (e) { fokus.focus(); }
                    if (typeof full.scrollIntoView === 'function') {
                        full.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                });
            }
            return full;
        }

        function _ringkasSemuaKartuPenuh() {
            const daftar = _kartuPenuhAktif.slice();
            let jumlah = 0;
            daftar.forEach(function (card) {
                if (_ringkasKartuPenuh(card)) jumlah++;
            });
            return jumlah;
        }

        function _resetKartuRingkas() {
            _kartuPenuhAktif = [];
            _nomorEntriRingkas = 0;
        }

        window._hydrateCompactEntryCard = _hidrasiKartuRingkas;
        window._collapseAllCompactEntries = _ringkasSemuaKartuPenuh;
        window._resetCompactEntryCache = _resetKartuRingkas;
        window._compactEntrySearchText = _teksCariEntri;
        window._compactEntryLimit = _BATAS_KARTU_PENUH;
        window._renumberCompactEntries = _renumberKartuRingkas;

        // Satu listener delegasi untuk ribuan kartu. Listener per kartu akan
        // menghapus sebagian besar keuntungan memori dari DOM yang diringkas.
        document.addEventListener('click', function (e) {
            const buka = e.target && e.target.closest && e.target.closest('.compact-entry-open');
            if (buka) {
                _hidrasiKartuRingkas(buka.closest('.compact-entry-card'));
                return;
            }
            const tutup = e.target && e.target.closest && e.target.closest('.compact-entry-collapse');
            if (tutup) {
                _ringkasKartuPenuh(tutup.closest('.dialogue-entry-card'));
                return;
            }
            const penuh = e.target && e.target.closest && e.target.closest('.dialogue-entry-card[data-large-hydrated="true"]');
            if (penuh) _sentuhKartuPenuh(penuh);
        });
        document.addEventListener('focusin', function (e) {
            const penuh = e.target && e.target.closest && e.target.closest('.dialogue-entry-card[data-large-hydrated="true"]');
            if (penuh) _sentuhKartuPenuh(penuh);
        });

        /**
         * Blok FOKUS BICARA — pintu editor untuk `spriteFocus`.
         *
         * Satu pemilih per ENTRI (bukan per slot): slot yang dipilih tetap terang,
         * slot lain diredupkan. Diletakkan SESUDAH seluruh area sprite karena ia
         * lintas-slot — termasuk slot custom, yang opsinya diturunkan dari
         * `data.charSprites` entri ini sendiri (bukan daftar hardcode).
         *
         * Kosong = tanpa fokus = perilaku hari ini, jadi entri lama tak berubah.
         */
        function _spriteFocusHTML(data) {
            const _C = VN.NodeRegistry.C;
            const terpilih = data.spriteFocus || '';
            const opsi = _C.buildFocusOptions(data.charSprites, terpilih);
            const adaFokus = !!terpilih;
            return `
                <div class="sprite-focus-block">
                    <label class="entry-title sprite-focus-title">Fokus Bicara <span class="sprite-focus-hint">(slot lain diredupkan)</span></label>
                    <div class="sprite-focus-row">
                        <select class="script-input sprite-focus-selector" data-key="spriteFocus" title="Slot sprite yang sedang bicara — sisanya diredupkan.">
                            ${_C.optionsToHTML(opsi, terpilih)}
                        </select>
                        <label class="sprite-focus-num" title="0 = gelap total, 1 = tanpa redup. Kosong = ikut tema (--vn-sprite-dim).">
                            redup
                            <input type="number" class="script-input" data-key="spriteDim" value="${data.spriteDim ?? ''}"
                                min="0" max="1" step="0.05" placeholder="tema">
                        </label>
                        <label class="sprite-focus-num" title="Perbesar halus slot yang fokus (mis. 1.04). Kosong = tanpa zoom.">
                            zoom
                            <input type="number" class="script-input" data-key="spriteFocusScale" value="${data.spriteFocusScale ?? ''}"
                                min="0.5" max="2" step="0.01" placeholder="—">
                        </label>
                    </div>
                    <p class="sprite-focus-note" style="display: ${adaFokus ? 'none' : 'block'};">Kosong = semua sprite terang (perilaku default).</p>
                </div>`;
        }

        /**
         * Teks yang tampil di kotak Parameter entri custom.
         *
         * `params` boleh string JSON ATAU objek — runtime menerima dua-duanya
         * (lihat `screen-commands.js` dan `hub-bridge-commands.js`). Bentuk objek
         * dulu jatuh langsung ke interpolasi template lalu tertulis
         * "[object Object]", dan ikut tersimpan begitu kartunya dibuka — kelas
         * korupsi yang persis sama dengan operand `{concat}` pada set_var.
         *
         * Serialisasi yang gagal (mis. objek bersiklus) sengaja mengembalikan
         * string kosong: extractFromCard memulihkan nilai aslinya dari baseline,
         * jadi lebih baik kotaknya kosong daripada memuat teks palsu yang tampak
         * seperti tulisan kreator.
         */
        function _paramsKeTeks(params) {
            if (params === null || params === undefined) return '';
            if (typeof params === 'object') {
                try { return JSON.stringify(params, null, 2); } catch (e) { return ''; }
            }
            return String(params);
        }

        function createEntryEditorCard(type, data = {}, availableLabels = [], inLabelContext = false, renderOptions = null) {
            // Pada chapter besar payload tetap canonical di `rawEntry`; editor penuh
            // baru dibuat untuk kartu yang benar-benar dibuka oleh kreator.
            if (window._vnEditorCompactMode && !(renderOptions && renderOptions.forceFull)) {
                return _buatKartuRingkas(type, data, availableLabels, inLabelContext, renderOptions);
            }
            const _C = VN.NodeRegistry.C;
            const card = document.createElement('div');
            card.className = `dialogue-entry-card entry-type-${type}`;
            card.dataset.type = type;
            card.dataset.inLabelContext = inLabelContext;
            // Simpan entry mentah apa adanya — extractFromCard() memakainya sebagai baseline
            // agar field yang tak dimodel UI (mis. condition kombinator all/any/not, choice
            // setVariable) tidak hilang diam-diam saat entry dibuka lalu disimpan ulang.
            try { card.dataset.rawEntry = JSON.stringify(data); } catch (e) { /* data tak bisa diserialisasi, abaikan */ }
            const _typeDef = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.get(type) : null;

            let innerHTML = '';

            const createImgPreview = (value, key) => value ? `<img src="./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}" class="image-preview" data-preview-for="${key}" onload="this.style.display='block'" onerror="this.style.display='none'">` : `<img class="image-preview" data-preview-for="${key}" style="display: none;" onload="this.style.display='block'" onerror="this.style.display='none'">`;

            // Fungsi khusus untuk sprite dengan wrapper animasi. Sprite boleh berupa
            // gambar atau video; keduanya memakai kelas yang sama agar preview dan
            // animasi live tidak perlu memiliki jalur terpisah.
            const isVideoSprite = (value) => /\.(mp4|webm|ogv|mov|m4v)(?:[?#].*)?$/i.test(String(value || ''));
            const createSpriteAnimPreview = (value, key, extraClass = '') => {
                const src = value ? `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${value}` : '';
                const visibleClass = value ? 'visible' : '';
                const classes = `sprite-anim-img ${extraClass}`.trim();
                if (isVideoSprite(value)) {
                    return `<div class="sprite-anim-wrapper ${visibleClass}" data-preview-for="${key}"><video src="${src}" class="${classes}" muted loop autoplay playsinline preload="metadata" onloadeddata="this.parentElement.classList.add('visible')" onerror="this.parentElement.classList.remove('visible')"></video></div>`;
                }
                return `<div class="sprite-anim-wrapper ${visibleClass}" data-preview-for="${key}"><img src="${src}" class="${classes}" onload="this.parentElement.classList.add('visible')" onerror="this.parentElement.classList.remove('visible')"></div>`;
            };

            const createSpriteDelayControlHTML = (slotKey, delay) => `
                <label class="sprite-delay-control" title="Tunda kemunculan dan mulai animasi sprite pada entri ini.">
                    Delay tampil
                    <input type="number" class="script-input" data-key="${slotKey}Delay" value="${delay ?? ''}" min="0" max="60000" step="50" placeholder="0"> <span>ms</span>
                </label>`;

            const createSpriteChromaControlHTML = (slotKey, chroma) => {
                const config = (chroma && typeof chroma === 'object') ? chroma : {};
                const enabled = config.enabled === true;
                const color = /^#[0-9a-f]{6}$/i.test(String(config.color || '')) ? config.color : '#00ff00';
                const tolerance = Number.isFinite(Number(config.tolerance)) ? Math.max(0, Math.min(255, Number(config.tolerance))) : 45;
                return `
                    <div class="sprite-chroma-controls" data-slot="${slotKey}">
                        <label class="sprite-chroma-toggle" title="Hapus warna latar dari gambar atau video sprite saat diputar.">
                            <input type="checkbox" class="script-input" data-key="${slotKey}ChromaEnabled" ${enabled ? 'checked' : ''}>
                            Chroma key
                        </label>
                        <div class="sprite-chroma-fields" style="display: ${enabled ? 'grid' : 'none'};">
                            <label>Warna <input type="color" class="script-input" data-key="${slotKey}ChromaColor" value="${color}"></label>
                            <label>Toleransi <input type="number" class="script-input" data-key="${slotKey}ChromaTolerance" value="${tolerance}" min="0" max="255" step="1"></label>
                        </div>
                    </div>`;
            };


            // Helper untuk konversi scale factor ke persen (0-100)
            const getScalePercent = (val) => {
                if (val === undefined || val === null) return 50; // Default 1.0 -> 50%
                if (val <= 3) return Math.round((val - 0.25) / 0.015);
                return val;
            };
            const spriteScalePercent = getScalePercent(data.spriteScale);
            const sprite2ScalePercent = getScalePercent(data.sprite2Scale);
            const spriteCenterScalePercent = getScalePercent(data.spriteCenterScale);

            // Posisi X per slot: nilai boleh ANGKA (persen) atau STRING (nama posisi
            // panggung, G2 irisan a) — _posXRowHTML yang memilah, termasuk menyediakan
            // angka default supaya slider tetap masuk akal saat nama dilepas kembali.
            const posXRight = _posXRowHTML('spriteX', data.spriteX, 85);
            const posXLeft = _posXRowHTML('sprite2X', data.sprite2X, 15);
            const posXCenter = _posXRowHTML('spriteCenterX', data.spriteCenterX, 50);

            // === SPRITE TRANSITION SYSTEM ===
            // Helper untuk membuat HTML kontrol transisi sprite.
            //
            // URUTAN ATRIBUT PENTING pada slider durasi di bawah: `value` WAJIB
            // ditulis SESUDAH min/max/step. Sebuah <input type="range"> berbawaan
            // min=0 max=100; kalau `value` diproses lebih dulu ia dijepit ke rentang
            // bawaan itu, dan menyetel max=2000 sesudahnya TIDAK mengembalikannya.
            //
            // Chromium 130 kebetulan memaafkan urutan itu; jsdom tidak. Jadi
            // gejalanya bukan editor yang rusak, melainkan yang lebih berbahaya:
            // jaring golden round-trip P1 melaporkan KEHILANGAN DATA HANTU. Terukur —
            // begitu sebuah novel nyata menyimpan `spriteCenterTransitionDuration:
            // 900`, test P1 merah dengan "900 -> 100" padahal editor menyimpan 900
            // dengan benar. Jaring yang melapor palsu mengundang orang "memperbaiki"
            // editor supaya jsdom senang. Aturan urutan ini dikunci smoke-contracts.
            const createTransitionControlHTML = (slotKey, transitionEnabled, transitionDuration) => {
                const checked = transitionEnabled ? 'checked' : '';
                const duration = transitionDuration || 500;
                return `
                    <div class="sprite-transition-controls" data-slot="${slotKey}">
                        <div class="transition-header">
                            <label>Transisi Sprite</label>
                            <span class="transition-hint">(Pergerakan halus dari posisi sebelumnya)</span>
                        </div>
                        <div class="transition-row">
                            <label class="transition-toggle-wrapper">
                                <input type="checkbox" class="script-input sprite-transition-toggle" data-key="${slotKey}Transition" ${checked}>
                                <span>Aktifkan Transisi Halus?</span>
                            </label>
                            <div class="transition-duration-control ${transitionEnabled ? '' : 'disabled'}">
                                <span class="transition-speed-label" style="font-size: 0.7em; color: #6c6;">Cepat</span>
                                <input type="range" class="script-input transition-duration-slider" data-key="${slotKey}TransitionDuration" min="100" max="2000" step="50" ${transitionEnabled ? '' : 'disabled'} value="${duration}">
                                <span class="transition-speed-label" style="font-size: 0.7em; color: #c66;">Lambat</span>
                                <span class="transition-duration-value">${duration}ms</span>
                            </div>
                        </div>
                        <div class="prev-value-hint"></div>
                    </div>
                `;
            };

            // Ambil nilai transisi dari data
            const spriteTransitionHTML = createTransitionControlHTML('sprite', data.spriteTransition, data.spriteTransitionDuration);
            const sprite2TransitionHTML = createTransitionControlHTML('sprite2', data.sprite2Transition, data.sprite2TransitionDuration);
            const spriteCenterTransitionHTML = createTransitionControlHTML('spriteCenter', data.spriteCenterTransition, data.spriteCenterTransitionDuration);

            // --- Special Event UI Generator ---
            const specialEventData = data.specialEvent || {};
            const hasSpecialEvent = !!specialEventData.type;
            const specialEventHTML = `
                <div class="special-event-wrapper" style="margin-top: 15px; border-top: 1px dashed #444; padding-top: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <button type="button" class="toggle-special-event-btn" style="background: transparent; border: 1px solid #777; color: #ccc; cursor: pointer; padding: 5px 10px; border-radius: 4px; font-size: 0.85em; display: flex; align-items: center; gap: 5px; transition: all 0.2s ease;">
                            ${hasSpecialEvent ? '<span style="color: #f3b;"></span>Edit Special Event (Active)' : '<span style="color: #777;"></span> Add Special Event'}
                        </button>
                    </div>
                    <div class="special-event-form" style="display: ${hasSpecialEvent ? 'block' : 'none'}; background: #222; padding: 15px; border-radius: 6px; margin-top: 10px; border: 1px solid #333; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #444; padding-bottom: 5px;">
                            <label style="color: #f3b; font-weight: bold; margin: 0; font-size: 0.95em;">Special Event Extension</label>
                            <button type="button" class="remove-special-event-btn" style="background: transparent; border: 1px solid #555; color: #aaa; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-size: 0.8em; transition: 0.2s;">Hapus Event</button>
                        </div>
                        
                        <label>Jenis Event:</label>

                        <select class="script-input special-event-type" style="background: #333; color: #eee; border-color: #555;">
                            <option value="" ${!specialEventData.type ? 'selected' : ''}>-- Pilih Event --</option>
                            ${_C.optionsToHTML(_C.SPECIAL_EVENT_TYPES, specialEventData.type)}
                        </select>
                        <div style="display: flex; gap: 10px; margin-top: 8px;">
                            <div style="flex: 1;">
                                <label>Durasi (ms):</label>
                                <input type="number" class="script-input special-event-duration" value="${specialEventData.duration || 1000}" min="0" step="100">
                            </div>
                            <div style="flex: 1;">
                                <label>Intensitas:</label>
                                <input type="number" class="script-input special-event-intensity" value="${specialEventData.intensity || 1.0}" min="0.1" max="10" step="0.1">
                            </div>
                        </div>
                        
                        <div style="margin-top: 8px; display: flex; gap: 10px;">
                             <div style="flex: 2;">
                                <label>SFX (Opsional):</label>
                                <input type="text" class="script-input special-event-sfx" value="${specialEventData.sfx || ''}" placeholder="audio.mp3">
                            </div>
                             <div style="flex: 1; padding-top: 24px;">
                                <div class="label-with-tooltip" style="display: flex; align-items: center; gap: 5px;">
                                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 0.9em; color: #ccc; margin: 0;">
                                        <input type="checkbox" class="script-input special-event-wait" ${specialEventData.wait ? 'checked' : ''}>
                                        Block Input
                                    </label>
                                    <div class="tooltip-trigger" style="width: 16px; height: 16px; font-size: 10px; line-height: 16px; background: #666;">?
                                        <span class="tooltip-text" style="width: 200px; right: 0; left: auto;">
                                            Jika dicentang, pemain TIDAK BISA melakukan klik/lanjut sampai efek selesai (sesuai durasi).
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- DELAY EXECUTION UI -->
                         <div style="margin-top: 8px; border-top: 1px dashed #444; padding-top: 8px;">
                            <div class="label-with-tooltip" style="display: flex; align-items: center; gap: 5px; margin-bottom: 5px;">
                                <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 0.9em; color: #ccc; margin: 0;">
                                    <input type="checkbox" class="script-input special-event-delay-enable" ${specialEventData.delay ? 'checked' : ''}>
                                    Delay Execution (Tunda)
                                </label>
                            </div>
                            <div class="delay-input-container" style="display: ${specialEventData.delay ? 'block' : 'none'}; padding-left: 20px;">
                                <label style="font-size: 0.85em; color: #aaa;">Delay Time (ms):</label>
                                <input type="number" class="script-input special-event-delay" value="${specialEventData.delay || 1000}" min="0" step="100" style="width: 100%; margin-top: 2px;">
                            </div>
                        </div>
                    </div>
                </div>
            `;

            switch (type) {
                case 'dialogue':
                case 'choice':
                    const animOptions = _C.optionsToHTML(_C.ANIM_OPTIONS_RIGHT, data.spriteAnim);
                    const animOptions2 = _C.optionsToHTML(_C.ANIM_OPTIONS_LEFT, data.sprite2Anim);
                    const animOptionsCenter = _C.optionsToHTML(_C.ANIM_OPTIONS_CENTER, data.spriteCenterAnim);

                    let choiceHTML = '';
                    if (type === 'choice') {
                        const isTextInputMode = data.inputType === 'text';

                        /**
                         * Choice tanpa opsi LAHIR dengan dua baris kosong.
                         *
                         * Dulu kartunya muncul dengan daftar opsi benar-benar kosong — cuma
                         * label "Opsi Jawaban:" dan tombol "+ Tambah Opsi" — sehingga langkah
                         * pertama membuat percabangan adalah menebak bahwa tombol itu harus
                         * ditekan lebih dulu.
                         *
                         * Editornya sendiri sudah memegang aturan ini, cuma tak pernah
                         * menerapkannya sejak awal: handler hapus-opsi menolak turun di bawah
                         * satu opsi ("Minimal harus ada 1 opsi pilihan.", scriptEditor.js).
                         * Jadi ia menjaga invariannya tanpa pernah membentuknya.
                         *
                         * DUA, bukan satu: dari 71 entri choice di novel yang ada, sebarannya
                         * 1→3 · 2→29 · 3→30 · 4→8 · 10→1. Nol yang punya nol opsi, dan 96%
                         * punya minimal dua. Satu baris berarti hampir semua orang tetap harus
                         * menekan "+ Tambah Opsi" sekali.
                         *
                         * AMAN terhadap polusi save: `_extractChoices` melewati baris yang
                         * teksnya kosong (`if (!text) return;`), jadi choice yang ditinggalkan
                         * tetap tersimpan sebagai `choices: []` persis seperti sebelumnya.
                         * Baris benih ini murni permukaan — ia tak pernah menulis apa pun.
                         */
                        const daftarOpsi = (data.choices || []).length ? data.choices : [{}, {}];

                        let optionsHTML = daftarOpsi.map((opt, index) => {
                            let allOptionsHTML = '<option value="">Pilih Label Tujuan...</option>';
                            let specialCommandsHTML = '';
                            if (inLabelContext) {
                                specialCommandsHTML = `<option value="##CONTINUE_PARENT##" ${opt.jump === '##CONTINUE_PARENT##' ? 'selected' : ''}>Lanjut di Label Induk (lewati sub-label)</option><option value="##FINISH_PARENT##" ${opt.jump === '##FINISH_PARENT##' ? 'selected' : ''}>Selesaikan Label Induk</option><option value="##EXIT_LABEL##" ${opt.jump === '##EXIT_LABEL##' ? 'selected' : ''}>Keluar dari Label (lanjut ke bawah)</option>`;
                            } else {
                                specialCommandsHTML = `<option value="##SKIP_ALL_LABEL##" ${opt.jump === '##SKIP_ALL_LABEL##' ? 'selected' : ''}>Lewati/skip semua label di fase ini</option>`;
                            }
                            allOptionsHTML += `<optgroup label="------ Perintah Khusus ------">${specialCommandsHTML}</optgroup>`;
                            if (availableLabels && availableLabels.length > 0) {
                                const labelOptionsForSelect = availableLabels.map(labelName => {
                                    let displayName = labelName;
                                    let className = 'option-main-label';
                                    if (labelName.includes('.')) {
                                        displayName = `↪ (sub) ${labelName.split('.')[1]}`;
                                        className = 'option-sub-label';
                                    }
                                    const isSelected = opt.jump === labelName ? 'selected' : '';
                                    return `<option value="${_escapeAttr(labelName)}" class="${className}" ${isSelected}>${displayName}</option>`;
                                }).join('');
                                allOptionsHTML += `<optgroup label="------ Lompat ke Label ------">${labelOptionsForSelect}</optgroup>`;
                            }
                            // Aturan "pertahankan + tandai" — dropdown ini dirakit tangan, jadi
                            // ia tak lewat optionsToHTML. Tujuan yang tak ada di daftar (label
                            // dihapus/diganti nama, atau perintah khusus milik konteks lain)
                            // dulu jatuh ke "Pilih Label Tujuan..." = jump TERHAPUS saat simpan,
                            // mengubah percabangan jadi buntu tanpa jejak.
                            const _jumpDikenal = [''].concat(
                                inLabelContext
                                    ? ['##CONTINUE_PARENT##', '##FINISH_PARENT##', '##EXIT_LABEL##']
                                    : ['##SKIP_ALL_LABEL##'],
                                availableLabels || []);
                            if (typeof opt.jump === 'string' && opt.jump &&
                                _jumpDikenal.indexOf(opt.jump) < 0) {
                                allOptionsHTML += `<option value="${_escapeAttr(opt.jump)}" selected title="${_escapeAttr(_C.VOCAB_UNKNOWN_TITLE)}">${_C.VOCAB_UNKNOWN_MARK} · ${_escapeAttr(opt.jump)}</option>`;
                            }
                            // data-raw-option (di dalam builder bersama): baseline per-opsi untuk
                            // field yang tak dimodel widget; setVariable/condition/timeout kini
                            // PUNYA widget di panel "⚙ Lanjutan" (Choice Option Editor v2).
                            return buildChoiceOptionEditorHTML(opt, allOptionsHTML, index);
                        }).join('');
                        const randomId = 'auto-dialogue-check-' + Math.random().toString(36).substr(2, 9);
                        const autoDialogueChecked = data.autoDialogue ? 'checked' : '';
                        const optionsVisible = data.autoDialogue ? 'visible' : '';
                        const characterRadioChecked = data.autoDialogue === 'character' ? 'checked' : '';
                        const narratorRadioChecked = data.autoDialogue === 'narrator' ? 'checked' : '';
                        // QTE adalah pengaturan LANJUTAN — 3 dari 71 entri choice di novel
                        // nyata memakainya — jadi ia tinggal di seksi terlipat.
                        //
                        // "Perilaku setelah memilih" (auto-dialogue) DULU ikut di dalamnya,
                        // dan itu salah rak. Ia bekerja sepenuhnya di luar konteks QTE, tetapi
                        // satu-satunya pintunya adalah kotak berjudul QTE — orang harus masuk
                        // menu timer untuk menyalakan sesuatu yang tak ada hubungannya dengan
                        // timer. Menambahkan "& Perilaku Pilihan" pada judulnya hanya menutupi
                        // salah raknya, tidak membetulkannya. Angkanya pun terbalik: auto-
                        // dialogue dipakai 14 dari 71 choice (19,7%), hampir 5x lebih sering
                        // daripada QTE yang menamai kotaknya.
                        //
                        // Sekarang ia berdiri sendiri di bawah tombol "+ Tambah Opsi".
                        // Selama pilihan perilaku baru ada satu, ia tak cukup banyak untuk
                        // pantas dilipat; kalau kelak bertambah, barulah ia layak jadi seksi
                        // sendiri — dan seksi itu tetap tak boleh bernama QTE.
                        //
                        // KEDUANYA tetap DI DALAM .choice-mode-group supaya ikut lenyap saat
                        // mode input-teks dipilih. Kalau dipindah ke luar, pengaturan pilihan
                        // ganda akan tetap terpampang di mode yang tak punya pilihan sama
                        // sekali.
                        const qteSeksiIsi = `
                            <div class="choice-qte-row" style="display: flex; gap: 10px; align-items: flex-end; padding: 8px 10px; background: #222; border-radius: 4px;">
                                <div style="flex: 1;">
                                    <label class="sub-label" title="Isi untuk membuat pilihan bertimer (QTE): bar hitung mundur tampil di atas tombol. Saat habis, opsi ber-flag timeout:true dipilih otomatis (fallback: opsi terakhir).">⏱ Batas Waktu QTE (ms)</label>
                                    <input type="number" class="script-input" data-key="timeLimit" value="${data.timeLimit || ''}" min="0" step="100" placeholder="kosong = tanpa timer">
                                </div>
                                <div style="flex: 2;">
                                    <label class="sub-label">Label Timer (opsional)</label>
                                    <input type="text" class="script-input" data-key="timeLimitLabel" value="${_escapeAttr(data.timeLimitLabel || '')}" placeholder="mis. Refleks! / Waktu menipis...">
                                </div>
                            </div>
                            `;

                        const autoDialogueHTML = `
                            <div class="auto-dialogue-container"><div class="auto-dialogue-toggle-wrapper"><input type="checkbox" class="auto-dialogue-toggle" id="${randomId}" ${autoDialogueChecked}><label for="${randomId}">Setelah memilih opsi jawaban, Tampilkan dahulu teks dialog yang dipilih user itu?</label></div><div class="auto-dialogue-options ${optionsVisible}"><div style="display: flex; align-items: center; gap: 6px; margin-bottom: 5px;"><input type="radio" name="auto-dialogue-type-${randomId}" class="auto-dialogue-type" value="character" ${characterRadioChecked || !data.autoDialogue ? 'checked' : ''} style="margin: 0;"><label style="margin: 0;">Diucapkan oleh karakter terakhir</label></div><div style="display: flex; align-items: center; gap: 6px;"><input type="radio" name="auto-dialogue-type-${randomId}" class="auto-dialogue-type" value="narrator" ${narratorRadioChecked} style="margin: 0;"><label style="margin: 0;">Ditampilkan sebagai narasi (tanpa speaker)</label></div></div></div>
                            `;

                        const multipleChoiceGroupHTML = `<div class="choice-mode-group" data-choice-mode="multiple" style="display: ${isTextInputMode ? 'none' : 'block'};">
                            <div class="choice-options-container"><label class="sub-label">Opsi Jawaban:</label>${optionsHTML}</div>
                            <button type="button" class="add-choice-option-btn" data-labels='${JSON.stringify(availableLabels)}'>+ Tambah Opsi</button>
                            ${autoDialogueHTML}
                            ${_seksiHTML('qte', 'Timer Pilihan (QTE)', qteSeksiIsi)}
                        </div>`;

                        // Input teks bebas — mis. minta pemain mengetik nama karakter. Hasilnya
                        // ditulis ke variabel cerita, bisa dipanggil di dialog manapun via {namaVar}.
                        const textInputGroupHTML = `<div class="choice-mode-group" data-choice-mode="text" style="display: ${isTextInputMode ? 'block' : 'none'};">
                            <label class="sub-label">Nama Variabel (wajib):</label>
                            <input type="text" class="script-input" data-key="variable" value="${_escapeAttr(data.variable || '')}" placeholder="mis. playerName">
                            <label class="sub-label">Placeholder Input (opsional):</label>
                            <input type="text" class="script-input" data-key="placeholder" value="${_escapeAttr(data.placeholder || '')}" placeholder="mis. Ketik nama di sini...">
                            <div style="display: flex; gap: 10px; margin-top: 6px;">
                                <div style="flex: 1;">
                                    <label class="sub-label">Nilai Default (jika dikosongkan)</label>
                                    <input type="text" class="script-input" data-key="defaultValue" value="${_escapeAttr(data.defaultValue || '')}" placeholder="mis. Pemain">
                                </div>
                                <div style="flex: 1;">
                                    <label class="sub-label">Maks. Karakter</label>
                                    <input type="number" class="script-input" data-key="maxLength" value="${data.maxLength !== undefined ? data.maxLength : 30}" min="1" max="200">
                                </div>
                            </div>
                            <label class="sub-label">Label Tombol Submit (opsional)</label>
                            <input type="text" class="script-input" data-key="submitLabel" value="${_escapeAttr(data.submitLabel || '')}" placeholder="OK">
                            <p class="inspector-hint" style="margin-top: 8px;">Nilai yang diketik pemain tersimpan ke variabel di atas — panggil di teks dialog mana pun (chapter ini maupun berikutnya via <code>load_hub_flags</code>) dengan menulis <code>{namaVariabel}</code>.</p>
                        </div>`;

                        const modeSelectorHTML = `<div class="choice-mode-selector-row">
                            <label class="sub-label">Mode Pilihan:</label>
                            <select class="script-input choice-input-type-selector" data-key="inputType">
                                <option value="" ${!isTextInputMode ? 'selected' : ''}>🔀 Pilihan Ganda (tombol)</option>
                                <option value="text" ${isTextInputMode ? 'selected' : ''}>⌨️ Input Teks Bebas (mis. nama pemain)</option>
                            </select>
                        </div>`;

                        choiceHTML = modeSelectorHTML + multipleChoiceGroupHTML + textInputGroupHTML;
                    }

                    innerHTML = `
                <label class="entry-title">${type === 'choice' ? 'Pilihan (Choice)' : '💬 Speaker'}</label>
                <input type="text" class="script-input" data-key="speaker" value="${_escapeAttr(data.speaker || '')}" placeholder="${type === 'choice' ? 'Speaker (Opsional)' : 'Nama Karakter'}">
                <label>Teks Dialog</label>
                <div class="dialogue-main-row"> 
                    <textarea class="script-input" data-key="text" rows="2" placeholder="${type === 'choice' ? 'Teks pertanyaan atau prompt...' : 'Tulis dialog... (tag: [w=800] jeda, [i]..[/i], [color=#f00]..[/color], [cps=10]..[/cps])'}" style="height: ${type === 'choice' ? '100px' : 'auto'};">${_escapeHTML(data.text || '')}</textarea>
                    <div class="config-row"><div class="config-inputs"><label>Voice Audio</label><div class="file-input-group"><div class="input-with-clear-wrapper ${data.voice ? 'has-text' : ''}"><input type="text" class="script-input audio-input" data-key="voice" value="${data.voice || ''}" placeholder="Pilih file audio..."><button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button></div><button type="button" class="browse-file-btn" data-type="audio">🎵</button></div><div class="volume-control-placeholder" data-key-prefix="voice"></div></div><div class="audio-preview-placeholder" data-src="${data.voice || ''}" data-preview-for="voice"></div></div>
                </div>                  
                ${choiceHTML}
                ${_seksiHTML('visual', 'Visual &amp; Sprite', `
                <label>Sprite Kiri</label>
                <div class="file-input-group"><div class="input-with-clear-wrapper ${_layerDasar(data.sprite2) ? 'has-text' : ''}"><input type="text" class="script-input image-input" data-key="sprite2" value="${_escapeAttr(_layerDasar(data.sprite2))}" placeholder="Pilih gambar atau video..."><button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button></div><button type="button" class="browse-file-btn" data-type="all-media">📁</button></div>
                <div class="sprite-config-container">${createSpriteAnimPreview(_layerDasar(data.sprite2), 'sprite2')}
                    <div class="animation-controls" style="display: ${_layerDasar(data.sprite2) ? 'flex' : 'none'};">
                        <label class="animation-label">⚙️ Konfigurasi Animasi</label>
                        <div class="sprite-anim-selection-row">${createSpriteDelayControlHTML('sprite2', data.sprite2Delay)}<select class="script-input sprite-anim-selector" data-key="sprite2Anim">${animOptions2}</select></div>
                        <label class="animation-label" style="margin-top: 8px;">Transformasi</label>
                        <div class="transform-controls-group">
                            <div class="transform-row">
                                <span class="transform-label">Ukuran</span>
                                <input type="range" class="script-input scale-slider transform-slider" data-key="sprite2Scale" min="0" max="100" step="1" value="${sprite2ScalePercent}">
                                <span class="scale-value-display transform-value">${sprite2ScalePercent}%</span>
                            </div>
                            ${posXLeft}
                            <div class="transform-row">
                                <span class="transform-label">Z-Order</span>
                                <input type="number" class="script-input" data-key="sprite2Z" value="${data.sprite2Z ?? ''}" placeholder="auto" title="Angka lebih besar tampil di depan slot lain; kosong = urutan alami" style="width: 70px; padding: 4px 6px;">
                            </div>
                        </div>
                        ${sprite2TransitionHTML}
                        ${createSpriteChromaControlHTML('sprite2', data.sprite2Chroma)}
                        ${_spriteLayersHTML('sprite2', data.sprite2, data.sprite2LayerSettings)}
                    </div>
                </div>
                <label>Sprite Tengah</label>
                <div class="file-input-group"><div class="input-with-clear-wrapper ${_layerDasar(data.spriteCenter) ? 'has-text' : ''}"><input type="text" class="script-input image-input" data-key="spriteCenter" value="${_escapeAttr(_layerDasar(data.spriteCenter))}" placeholder="Pilih gambar atau video..."><button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button></div><button type="button" class="browse-file-btn" data-type="all-media">📁</button></div>
                <div class="sprite-config-container">${createSpriteAnimPreview(_layerDasar(data.spriteCenter), 'spriteCenter')}
                    <div class="animation-controls" style="display: ${_layerDasar(data.spriteCenter) ? 'flex' : 'none'};">
                        <label class="animation-label">⚙️ Konfigurasi Animasi</label>
                        <div class="sprite-anim-selection-row">${createSpriteDelayControlHTML('spriteCenter', data.spriteCenterDelay)}<select class="script-input sprite-anim-selector" data-key="spriteCenterAnim">${animOptionsCenter}</select></div>
                        <label class="animation-label" style="margin-top: 8px;">Transformasi</label>
                        <div class="transform-controls-group">
                            <div class="transform-row">
                                <span class="transform-label">Ukuran</span>
                                <input type="range" class="script-input scale-slider transform-slider" data-key="spriteCenterScale" min="0" max="100" step="1" value="${spriteCenterScalePercent}">
                                <span class="scale-value-display transform-value">${spriteCenterScalePercent}%</span>
                            </div>
                            ${posXCenter}
                            <div class="transform-row">
                                <span class="transform-label">Z-Order</span>
                                <input type="number" class="script-input" data-key="spriteCenterZ" value="${data.spriteCenterZ ?? ''}" placeholder="auto" title="Angka lebih besar tampil di depan slot lain; kosong = urutan alami" style="width: 70px; padding: 4px 6px;">
                            </div>
                        </div>
                        ${spriteCenterTransitionHTML}
                        ${createSpriteChromaControlHTML('spriteCenter', data.spriteCenterChroma)}
                        ${_spriteLayersHTML('spriteCenter', data.spriteCenter, data.spriteCenterLayerSettings)}
                    </div>
                </div>
                <label>Sprite Kanan</label>
                <div class="file-input-group"><div class="input-with-clear-wrapper ${_layerDasar(data.sprite) ? 'has-text' : ''}"><input type="text" class="script-input image-input" data-key="sprite" value="${_escapeAttr(_layerDasar(data.sprite))}" placeholder="Pilih gambar atau video..."><button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button></div><button type="button" class="browse-file-btn" data-type="all-media">📁</button></div>
                <div class="sprite-config-container">${createSpriteAnimPreview(_layerDasar(data.sprite), 'sprite')}
                    <div class="animation-controls" style="display: ${_layerDasar(data.sprite) ? 'flex' : 'none'};">
                        <label class="animation-label">⚙️ Konfigurasi Animasi</label>
                        <div class="sprite-anim-selection-row">${createSpriteDelayControlHTML('sprite', data.spriteDelay)}<select class="script-input sprite-anim-selector" data-key="spriteAnim">${animOptions}</select></div>
                        <label class="animation-label" style="margin-top: 8px;">Transformasi</label>
                        <div class="transform-controls-group">
                            <div class="transform-row">
                                <span class="transform-label">Ukuran</span>
                                <input type="range" class="script-input scale-slider transform-slider" data-key="spriteScale" min="0" max="100" step="1" value="${spriteScalePercent}">
                                <span class="scale-value-display transform-value">${spriteScalePercent}%</span>
                            </div>
                            ${posXRight}
                            <div class="transform-row">
                                <span class="transform-label">Z-Order</span>
                                <input type="number" class="script-input" data-key="spriteZ" value="${data.spriteZ ?? ''}" placeholder="auto" title="Angka lebih besar tampil di depan slot lain; kosong = urutan alami" style="width: 70px; padding: 4px 6px;">
                            </div>
                        </div>
                        ${spriteTransitionHTML}
                        ${createSpriteChromaControlHTML('sprite', data.spriteChroma)}
                        ${_spriteLayersHTML('sprite', data.sprite, data.spriteLayerSettings)}
                    </div>
                </div>
                
                <!-- === SPRITE CUSTOM (Multi-Sprite System) === -->
                <div class="extra-sprites-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <label style="color: #00CED1;">Sprite Custom</label>
                            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; color: #aaa; cursor: pointer;" title="Aktifkan untuk auto-distribute sprite (flexbox). Nonaktifkan untuk posisi manual.">
                                <input type="checkbox" class="script-input sprite-mode-toggle" data-key="spriteMode" ${data.spriteMode === 'auto' ? 'checked' : ''}>
                                <span style="color: ${data.spriteMode === 'auto' ? '#00FF7F' : '#888'};">Auto Spacing</span>
                            </label>
                        </div>
                        <button type="button" class="add-extra-sprite-btn" style="background: transparent; border: 1px solid #00CED1; color: #00CED1; cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: 0.75em;">+ Tambah</button>
                    </div>
                    <div class="extra-sprites-container">
                        ${(data.charSprites || []).filter(s => s.slot === 'custom').map((sp, idx) => {
                        const customScalePercent = getScalePercent(sp.scale);
                        return `
                        <div class="extra-sprite-item" data-sprite-index="${idx}">
                            <div class="file-input-group">
                                <div class="input-with-clear-wrapper ${sp.src ? 'has-text' : ''}">
                                    <input type="text" class="script-input image-input extra-sprite-src" value="${sp.src || ''}" placeholder="Pilih gambar atau video...">
                                    <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                                </div>
                                <button type="button" class="browse-file-btn" data-type="all-media">📁</button>
                                <button type="button" class="remove-extra-sprite-btn" title="Hapus Sprite Custom" style="background: #f44; color: white; border: none; border-radius: 4px; padding: 6px 10px; cursor: pointer; font-size: 0.9em;">×</button>
                            </div>
                            <div class="sprite-config-container">
                                ${createSpriteAnimPreview(sp.src, `extra-${idx}`, 'extra-sprite-preview')}
                                <div class="animation-controls" style="display: ${sp.src ? 'flex' : 'none'};">
                                    <label class="animation-label">⚙️ Konfigurasi</label>
                                    <div class="sprite-anim-selection-row">
                                        <label class="sprite-delay-control" title="Tunda kemunculan dan mulai animasi sprite pada entri ini.">Delay tampil <input type="number" class="script-input extra-sprite-delay" value="${sp.delay ?? ''}" min="0" max="60000" step="50" placeholder="0"> <span>ms</span></label>
                                        <select class="script-input sprite-anim-selector extra-sprite-anim">${_C.optionsToHTML(_C.ANIM_OPTIONS_CUSTOM, sp.anim)}</select>
                                    </div>
                                    <label class="animation-label" style="margin-top: 8px;">Transformasi</label>
                                    <div class="transform-controls-group">
                                        <div class="transform-row">
                                            <span class="transform-label">Ukuran</span>
                                            <input type="range" class="script-input scale-slider extra-sprite-scale transform-slider" min="0" max="100" step="1" value="${customScalePercent}">
                                            <span class="scale-value-display transform-value">${customScalePercent}%</span>
                                        </div>
                                        ${_posXRowCustomHTML(sp.x, data.spriteMode === 'auto')}
                                        <div class="transform-row">
                                            <span class="transform-label">Z-Order</span>
                                            <input type="number" class="script-input extra-sprite-z" value="${sp.z ?? ''}" placeholder="auto" title="Angka lebih besar tampil di depan; kosong = urutan alami" style="width: 70px; padding: 4px 6px;">
                                        </div>
                                    </div>
                                    <div class="sprite-chroma-controls">
                                        <label class="sprite-chroma-toggle" title="Hapus warna latar dari gambar atau video sprite saat diputar."><input type="checkbox" class="script-input extra-sprite-chroma-enabled" ${(sp.chromaKey && sp.chromaKey.enabled) ? 'checked' : ''}> Chroma key</label>
                                        <div class="sprite-chroma-fields" style="display: ${(sp.chromaKey && sp.chromaKey.enabled) ? 'grid' : 'none'};">
                                            <label>Warna <input type="color" class="script-input extra-sprite-chroma-color" value="${/^#[0-9a-f]{6}$/i.test(String((sp.chromaKey || {}).color || '')) ? sp.chromaKey.color : '#00ff00'}"></label>
                                            <label>Toleransi <input type="number" class="script-input extra-sprite-chroma-tolerance" value="${Number.isFinite(Number((sp.chromaKey || {}).tolerance)) ? Math.max(0, Math.min(255, Number(sp.chromaKey.tolerance))) : 45}" min="0" max="255" step="1"></label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                            `;
                    }).join('')}
                    </div>
                    <p style="font-size: 0.75em; color: #555; margin: 3px 0 0 0; display: ${(data.charSprites || []).filter(s => s.slot === 'custom').length === 0 ? 'block' : 'none'}; font-style: italic;" class="extra-sprites-empty-msg">Klik "+ Tambah" untuk menambah sprite dengan posisi kustom.</p>
                </div>
                ${_spriteFocusHTML(data)}
                `)}

                ${_seksiHTML('efek', 'Efek', specialEventHTML)}
            `;
                    break;
                case 'scene':
                    const uniqueRadioName = `background-mode-scene-${Math.random()}`;
                    const currentSceneType = data.sceneType || 'image';
                    const currentTransition = data.transition || 'cut';
                    const currentTransitionOut = data.transitionOut || 'cut';

                    // Inilah baris yang diubah
                    const bgmLoopChecked = data.bgmLoop === false ? '' : 'checked';

                    innerHTML = `
                <label>Jenis Scene:</label>
                <select class="script-input scene-type-selector" data-key="sceneType">
                    ${_C.optionsToHTML(_C.BACKDROP_TYPES, currentSceneType)}
                </select>

                <div class="scene-input-group" data-scene-type="image" style="display: ${currentSceneType === 'image' ? 'block' : 'none'};">
                    <label>🖼️ Latar Belakang (Background)</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${data.background ? 'has-text' : ''}">
                            <input type="text" class="script-input image-input" data-key="background" value="${data.background || ''}" placeholder="Pilih file gambar...">
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="image">📁</button>
                    </div>
                    <div style="display: flex; gap: 15px; align-items: flex-start; margin-top: 10px;">
                        <div class="image-preview-container-16-9" style="flex: 2; min-width: 0;">
                            <img class="image-preview" data-preview-for="background" style="display: none; object-fit: ${data.backgroundMode || 'cover'};">
                            <span class="preview-placeholder">Pilih gambar...</span>
                        </div>
                        <div class="options-container" style="flex: 1; display: flex; flex-direction: column; gap: 10px; background-color: #222; padding: 10px; border-radius: 5px;">
                            <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" class="script-input persist-background-checkbox" data-key="persistBackground" ${data.persistBackground || data.persistBackground === undefined ? 'checked' : ''}>
                                <span>Pertahankan background ini untuk jadi wallpaper baru?</span>
                            </label>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <label style="font-weight:normal;">Tampilan:</label>
                                <label style="display: flex; align-items: center; gap: 4px;">
                                    <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="cover" ${!data.backgroundMode || data.backgroundMode === 'cover' ? 'checked' : ''}> Crop
                                </label>
                                <label style="display: flex; align-items: center; gap: 4px;">
                                    <input type="radio" name="${uniqueRadioName}" class="script-input" data-key="backgroundMode" value="contain" ${data.backgroundMode === 'contain' ? 'checked' : ''}> Fit
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="scene-input-group" data-scene-type="video" style="display: ${currentSceneType === 'video' ? 'block' : 'none'};">
                    <label>🎬 Video Latar</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${data.video ? 'has-text' : ''}">
                            <input type="text" class="script-input video-input" data-key="video" value="${data.video || ''}" placeholder="Pilih file video...">
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="video">📁</button>
                    </div>

                    <div class="video-preview-container" style="width: 100%; aspect-ratio: 16 / 9; background-color: #000; border-radius: 4px; overflow: hidden; display: none; align-items: center; justify-content: center; margin-top: 10px; border: 1px solid #444;">
                        <video class="video-preview" data-preview-for="video" controls muted style="display: none; width: 100%; height: 100%; object-fit: contain;"></video>
                        <span class="preview-placeholder" style="color: #777;">Pilih video...</span>
                    </div>

                    <div class="video-controls-block" style="display: ${data.video ? 'flex' : 'none'}; gap: 25px; margin-top: 10px; padding: 15px; background: #222; border-radius: 4px; align-items: flex-start; flex-wrap: wrap;">                        
                        <div style="display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; border-right: 1px solid #444; padding-right: 25px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="toggle-switch">
                                    <input type="checkbox" class="script-input video-muted-checkbox" data-key="videoMuted" ${data.videoMuted !== false ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                                <span style="font-size: 0.9em;">Bisukan audio video ini</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="toggle-switch">
                                    <input type="checkbox" class="script-input mute-phase-bgm-checkbox" data-key="mutePhaseBgm" ${data.mutePhaseBgm === true ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                                <span style="font-size: 0.9em;">Bisukan BGM Fase</span>
                            </div>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 12px; flex-shrink: 0;">
                            <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; padding-top: 5px;">
                                <input type="checkbox" class="script-input persist-background-checkbox" data-key="persistBackground" ${data.persistBackground || data.persistBackground === undefined ? 'checked' : ''}>
                                <span>Pertahankan video ini untuk jadi wallpaper baru di entri selanjutnya.</span>
                            </label>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label style="font-size: 0.9em; color: #ccc;">Durasi di entri ini (Jika Auto Mode):</label>
                                <input type="number" class="script-input" data-key="duration" value="${(data.duration || 3000) / 1000}" step="0.1" min="0.1" placeholder="detik" style="width: 70px; padding: 6px 8px;">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="scene-input-group" data-scene-type="text_screen" style="display: ${currentSceneType === 'text_screen' ? 'block' : 'none'};">
                    <label>Teks yang Ditampilkan (Bisa multi-baris)</label>
                    <textarea class="script-input" data-key="text" rows="4" placeholder="Contoh:\nChapter 1\nAwal yang Baru">${_escapeHTML(data.text || '')}</textarea>
                    <label>Durasi (detik) jika Auto Mode</label>
                    <input type="number" class="script-input" data-key="duration" value="${(data.duration || 3000) / 1000}" step="0.1" placeholder="Contoh: 2.5 (untuk 2.5 detik)">
                </div>

                ${_seksiHTML('transisi', 'Transisi', `
                <label style="font-weight: bold; font-size: 1.1em; color: #00f371;">Transisi Scene</label>
                
                <div style="display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap; margin-bottom: 15px;">
                    <div style="flex: 1 1 200px; min-width: 200px;">
                        <label>Animasi Transisi (Masuk):</label>
                            <select class="script-input scene-transition-selector" data-key="transition">
                            ${_C.optionsToHTML(_C.TRANSITION_IN, currentTransition)}
                            </select>
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                            <label style="font-size: 0.85em; margin: 0;" title="Meng-override durasi default (500ms) hanya untuk transisi masuk entri ini.">Durasi (ms):</label>
                            <input type="number" class="script-input" data-key="transitionDuration" value="${data.transitionDuration ?? ''}" min="50" step="50" placeholder="500" style="width: 90px; padding: 6px 8px;">
                        </div>
                    </div>
                    <div style="flex: 1 1 200px; min-width: 200px;">
                        <label>SFX Masuk (Opsional)</label>
                        <div class="file-input-group">
                            <div class="input-with-clear-wrapper ${data.sfxIn ? 'has-text' : ''}">
                                <input type="text" class="script-input audio-input" data-key="sfxIn" value="${data.sfxIn || ''}" placeholder="Pilih file audio...">
                                <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                            </div>
                            <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                        </div>
                    <div class="volume-control-placeholder" data-key-prefix="sfxIn"></div>
                    <div class="audio-preview-placeholder" data-src="${data.sfxIn || ''}" data-preview-for="sfxIn"></div>
                    </div>
                </div>

                <div class="transition-out-container">
                    <div style="display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap; margin-top: 15px;">
                        <div style="flex: 1 1 200px; min-width: 200px;">
                            <label>Animasi Transisi (Keluar):</label>
                                <select class="script-input" data-key="transitionOut">
                                    ${_C.optionsToHTML(_C.TRANSITION_OUT, currentTransitionOut)}
                                </select>
                        </div>
                        <div style="flex: 1 1 200px; min-width: 200px;">
                            <label>SFX Keluar (Opsional)</label>
                            <div class="file-input-group">
                                <div class="input-with-clear-wrapper ${data.sfxOut ? 'has-text' : ''}">
                                    <input type="text" class="script-input audio-input" data-key="sfxOut" value="${data.sfxOut || ''}" placeholder="Pilih file audio...">
                                    <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                                </div>
                                <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                            </div>
                            <div class="volume-control-placeholder" data-key-prefix="sfxOut"></div>
                            <div class="audio-preview-placeholder" data-src="${data.sfxOut || ''}" data-preview-for="sfxOut"></div>
                        </div>
                    </div>
                </div>
                `)}
                ${_seksiHTML('audio', 'Audio', `
                <div class="bgm-special-event-container" style="display: block; width: 100%; margin-top: 15px;">
                    <label>🎵 Musik Latar (BGM — dipakai terus sampai diganti judul lain / dihentikan)</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${data.bgm ? 'has-text' : ''}">
                            <input type="text" class="script-input audio-input" data-key="bgm" value="${data.bgm || ''}" placeholder="Pilih file audio..." ${data.bgmStop ? 'disabled' : ''}>
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                    </div>
                    <div class="volume-control-placeholder" data-key-prefix="bgm"></div>
                    <div class="audio-preview-placeholder" data-src="${data.bgm || ''}" data-preview-for="bgm"></div>
                    <div style="display: flex; gap: 15px; align-items: center; margin-top: 8px;">
                        <div style="flex-grow: 1;">
                            <label>Durasi Fade BGM (detik)</label>
                            <input type="number" class="script-input" data-key="bgmFade" value="${data.bgmFade || 1}" step="0.1" min="0">
                        </div>
                        <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; padding-top: 20px;">
                            <input type="checkbox" class="script-input" data-key="bgmLoop" ${bgmLoopChecked}>
                            <span>Loop</span>
                        </label>
                    </div>
                    <div class="bgm-advanced-controls" style="margin-top: 10px; padding: 10px; background: #222; border-radius: 4px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                            <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; margin: 0;" title="Putar BGM ini sementara, lalu OTOMATIS kembali ke BGM sebelumnya — untuk sting/stinger dramatis singkat.">
                                <input type="checkbox" class="script-input bgm-oneshot-toggle" data-key="bgmOneShot" ${data.bgmOneShot ? 'checked' : ''} ${data.bgmStop ? 'disabled' : ''}>
                                <span>✨ One-shot / sting (kembali otomatis ke BGM sebelumnya)</span>
                            </label>
                            <div class="bgm-oneshot-duration-wrap" style="display: ${data.bgmOneShot ? 'flex' : 'none'}; align-items: center; gap: 6px;">
                                <label style="margin: 0; font-size: 0.85em;">Durasi (ms)</label>
                                <input type="number" class="script-input" data-key="bgmOneShotDuration" value="${data.bgmOneShotDuration || 4000}" min="100" step="100" style="width: 90px;">
                            </div>
                        </div>
                        <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; margin: 0;" title="Menghentikan BGM mulai entri ini — tidak menunggu entri lain men-set BGM baru.">
                            <input type="checkbox" class="script-input bgm-stop-toggle" data-key="bgmStop" ${data.bgmStop ? 'checked' : ''}>
                            <span>⏹ Hentikan BGM mulai entri ini (tanpa memutar musik baru)</span>
                        </label>
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;" title="Loop-point: putaran pertama utuh dari awal; pengulangan berikutnya mulai dari 'Loop Mulai' (intro tak diulang) dan/atau dipotong di 'Loop Akhir'.">
                            <span style="font-size: 0.85em;">🔁 Loop-point (detik):</span>
                            <label style="margin: 0; font-size: 0.85em; display: flex; align-items: center; gap: 5px;">Mulai
                                <input type="number" class="script-input" data-key="bgmLoopStart" value="${data.bgmLoopStart ?? ''}" min="0" step="0.1" placeholder="0" style="width: 75px; padding: 4px 6px;"></label>
                            <label style="margin: 0; font-size: 0.85em; display: flex; align-items: center; gap: 5px;">Akhir
                                <input type="number" class="script-input" data-key="bgmLoopEnd" value="${data.bgmLoopEnd ?? ''}" min="0" step="0.1" placeholder="akhir file" style="width: 75px; padding: 4px 6px;"></label>
                        </div>
                    </div>

                    <label style="margin-top: 15px;">🌧️ Ambient (channel loop kedua — suasana: hujan/keramaian, hidup berdampingan dengan BGM)</label>
                    <div class="file-input-group">
                        <div class="input-with-clear-wrapper ${data.ambient && data.ambient !== 'none' ? 'has-text' : ''}">
                            <input type="text" class="script-input audio-input" data-key="ambient" value="${data.ambient && data.ambient !== 'none' ? data.ambient : ''}" placeholder="Pilih file audio..." ${data.ambientStop ? 'disabled' : ''}>
                            <button type="button" class="clear-input-btn-inside" title="Hapus Input">&times;</button>
                        </div>
                        <button type="button" class="browse-file-btn" data-type="audio">🎵</button>
                    </div>
                    <div class="audio-preview-placeholder" data-src="${data.ambient && data.ambient !== 'none' ? data.ambient : ''}" data-preview-for="ambient"></div>
                    <div style="display: flex; align-items: center; gap: 15px; margin-top: 6px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 180px;">
                            <label style="margin: 0; font-size: 0.85em;">Volume:</label>
                            <input type="range" class="script-input ambient-volume-slider" data-key="ambientVolume" min="0" max="1" step="0.05" value="${data.ambientVolume ?? 0.5}" style="flex-grow: 1; min-width: 80px;">
                            <span class="ambient-volume-display" style="font-size: 0.85em;">${Math.round((data.ambientVolume ?? 0.5) * 100)}%</span>
                        </div>
                        <label style="cursor: pointer; user-select: none; display: flex; align-items: center; gap: 8px; margin: 0;" title="Menghentikan channel ambient mulai entri ini.">
                            <input type="checkbox" class="script-input ambient-stop-toggle" data-key="ambientStop" ${data.ambientStop ? 'checked' : ''}>
                            <span style="font-size: 0.85em;">⏹ Hentikan ambient mulai entri ini</span>
                        </label>
                    </div>

                    ${_audioChannelsHTML(data)}
                </div>
                `)}

                <!-- Efek keluar dari kontainer audio: ia memang bukan audio, dan
                     bersarang di sana membuatnya ikut lenyap saat blok audio dilipat. -->
                ${_seksiHTML('efek', 'Efek', specialEventHTML)}
            `;
                    break;

                case 'set_var':
                    // Backward compatibility: support legacy field names (varName/varOp/varValue)
                    const setVarName = data.name || data.varName || '';
                    const setVarOp = data.op || data.varOp || '=';
                    const setVarValue = data.value !== undefined ? data.value : (data.varValue || '');
                    // Normalize legacy operators untuk tampilan
                    const _opAlias = { '+': '+=', '-': '-=', '*': '*=', 'set': '=', 'add': '+=', 'sub': '-=', 'mul': '*=', 'div': '/=' };
                    const normalizedOp = _opAlias[setVarOp] || setVarOp;
                    const isRandomOp = normalizedOp === 'random';
                    const randomMin = (isRandomOp && Array.isArray(setVarValue)) ? setVarValue[0] : '';
                    const randomMax = (isRandomOp && Array.isArray(setVarValue)) ? setVarValue[1] : '';
                    const setVarValueDisplay = Array.isArray(setVarValue) ? '' : setVarValue;
                    innerHTML = `
                        <label class="entry-title" style="color: #ffaa00;">⌲ Set Variable</label>
                        <div style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;">
                            <div style="flex: 2;">
                                <label>Nama Variabel</label>
                                <input type="text" class="script-input" data-key="name" value="${_escapeAttr(setVarName)}" placeholder="Cth: affection_score">
                            </div>
                            <div style="flex: 1;">
                                <label>Operasi</label>
                                <select class="script-input set-var-op-selector" data-key="op">
                                    ${_C.optionsToHTML(_C.SET_VAR_OPS, normalizedOp)}
                                </select>
                            </div>
                            <div style="flex: 2; ${isRandomOp ? 'display: none;' : ''}" class="set-var-value-wrap">
                                <label>Nilai</label>
                                <input type="text" class="script-input" data-key="value" value="${_escapeAttr(setVarValueDisplay)}" placeholder="Angka / Teks / $variabelLain" title="Ketik $namaVariabel untuk memakai nilai variabel lain (var-vs-var).">
                            </div>
                            <div style="flex: 2; ${isRandomOp ? '' : 'display: none;'}" class="set-var-random-wrap">
                                <label>Rentang Acak (inklusif)</label>
                                <div style="display: flex; gap: 6px;">
                                    <input type="number" class="script-input set-var-random-min" value="${randomMin}" placeholder="Min" step="1">
                                    <input type="number" class="script-input set-var-random-max" value="${randomMax}" placeholder="Max" step="1">
                                </div>
                            </div>
                        </div>
                        <p style="font-size: 0.8em; color: #888; font-style: italic; margin-top: 5px;">Tipe data otomatis dideteksi (Angka, Boolean, atau Teks). Nilai <code>$namaVariabel</code> = pakai nilai variabel lain. Operasi <code>random</code> menghasilkan bilangan bulat acak antara Min–Max.</p>
                    `;
                    break;
                case 'custom':
                    // D8: daftar command yang BENAR-BENAR terdaftar (engine +
                    // extensions novel/chapter) ditawarkan sebagai saran. Tetap
                    // input bebas — command bisa juga didaftarkan dari player.html
                    // custom yang tak terpindai, jadi jangan dikunci jadi <select>.
                    const _cmdListId = `cmd-list-${Math.random().toString(36).slice(2, 9)}`;
                    let _cmdOptions = '';
                    try {
                        // B1: datalist bukan dropdown, jadi tak punya <optgroup> untuk
                        // memikul penanda — penandanya menempel di label tiap saran.
                        const _mk = _C.vocabMarkOpts && _C.vocabMarkOpts()
                            ? _C.VOCAB_UNREAD_MARK + ' · ' : '';
                        _cmdOptions = (VN.PlayerCapabilities.getCommands() || []).map(c =>
                            `<option value="${_escapeAttr(c.name)}">${_escapeAttr(_mk +
                                (c.source === 'extension' ? 'extension' : 'bawaan') +
                                (c.description ? ' — ' + c.description : ''))}</option>`
                        ).join('');
                    } catch (e) { /* modul kapabilitas tak tersedia — input tetap bebas */ }
                    innerHTML = `
                        <label class="entry-title" style="color: #00ffff;">🔧 Custom Command</label>
                        <div style="margin-bottom: 10px;">
                            <label>Nama Perintah</label>
                            <input type="text" class="script-input" data-key="command" list="${_cmdListId}" value="${_escapeAttr(data.command || '')}" placeholder="Cth: unlock_achievement">
                            <datalist id="${_cmdListId}">${_cmdOptions}</datalist>
                        </div>
                        <div>
                            <label>Parameter (Opsional, format JSON)</label>
                            <textarea class="script-input" data-key="params" rows="3" placeholder='{"id": "first_blood"}' style="font-family: monospace;">${_escapeHTML(_paramsKeTeks(data.params))}</textarea>
                        </div>
                    `;
                    break;

                case 'load_hub_flags':
                    // Jembatan hub → cerita: impor hub-flags / story-vars sebagai variabel
                    // cerita ber-prefix. Letakkan di awal chapter; setelah entri ini,
                    // condition/jump/{var} bisa langsung memakai variabel yang terimpor.
                    innerHTML = `
                        <label class="entry-title" style="color: #ff9ff3;">Muat Flag Hub (Hub → Cerita)</label>
                        <div style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px;">
                            <div style="flex: 1;">
                                <label>Prefix Variabel</label>
                                <input type="text" class="script-input" data-key="prefix" value="${_escapeAttr(data.prefix !== undefined ? data.prefix : '')}" placeholder="mis. hf_ (boleh kosong)" title="Semua key diimpor sebagai <prefix><key>, mis. hf_ch1Sikap — agar tak bentrok dengan variabel lokal.">
                            </div>
                            <div style="flex: 2;">
                                <label>Sumber Data</label>
                                <select class="script-input" data-key="source">
                                    ${_C.optionsToHTML(_C.LOAD_HUB_FLAGS_SOURCES, data.source || 'hub-flags')}
                                </select>
                            </div>
                        </div>
                        <p style="font-size: 0.8em; color: #888; font-style: italic; margin-top: 5px;">Letakkan di awal chapter. Variabel yang terimpor (mis. <code>hf_ch1Sikap</code>) langsung bisa dipakai di kondisi, jump, maupun teks <code>{hf_ch1Sikap}</code> — untuk branching lintas-chapter.</p>
                    `;
                    break;

                default:
                    // Extension type — cek NodeRegistry untuk definisi tipe custom
                    const extTypeDef = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.get(type) : null;
                    if (extTypeDef) {
                        const extLabel = extTypeDef.label || type;
                        let fieldsHTML = '';
                        (extTypeDef.fields || []).forEach(function(field) {
                            const val = data[field.key] !== undefined ? data[field.key] : '';
                            if (typeof field.render === 'function') {
                                // Custom render callback — akan dipanggil setelah card dimasukkan ke DOM
                                fieldsHTML += `<div class="ext-field-container" data-field-key="${field.key}"></div>`;
                            } else {
                                fieldsHTML += `<div style="margin-bottom: 8px;">
                                    <label>${field.label || field.key}</label>
                                    <input type="text" class="script-input" data-key="${field.key}" value="${val}" placeholder="${field.placeholder || ''}">
                                </div>`;
                            }
                        });
                        innerHTML = `
                            <label class="entry-title" style="color: #00CED1;">🧩 ${extLabel}</label>
                            ${fieldsHTML}
                        `;
                    } else {
                        // Tipe benar-benar tak dikenal (mis. dari versi engine lebih baru /
                        // extension yang belum termuat). Dulu return null — entri DIBUANG
                        // dari DOM dan ikut HILANG saat save (save menyerialisasi dari DOM).
                        // Kini: card read-only yang mempertahankan entry via rawEntry baseline
                        // (extractFromCard mengembalikan baseline untuk tipe tak dikenal).
                        let rawJSON = '';
                        try { rawJSON = JSON.stringify(data, null, 2); } catch (e) { rawJSON = String(data); }
                        innerHTML = `
                            <label class="entry-title" style="color: #e67e22;">❓ Entri Tak Dikenal: <code>${_escapeHTML(type)}</code></label>
                            <p style="font-size: 0.8em; color: #999; margin: 4px 0 8px 0;">Editor versi ini tidak mengenal tipe entri ini. Isinya <strong>tetap dipertahankan apa adanya</strong> saat disimpan — edit lewat <code>script.json</code> bila perlu mengubahnya.</p>
                            <pre style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 8px; font-size: 0.75em; max-height: 160px; overflow: auto; white-space: pre-wrap;">${_escapeHTML(rawJSON)}</pre>
                        `;
                    }
            }
            // Tombol Preview Entry - tersedia untuk semua tipe entri (dialogue, choice, scene)
            const previewButtonHTML = `<button class="preview-entry-btn" title="Preview seluruh entri ini di jendela terpisah" style="background-color: transparent; color: #9b59b6; border: 1px dashed #9b59b6; padding: 5px 10px; border-radius: 4px; cursor: pointer; transition: 0.2s;">Preview</button>`;

        // Input Kondisi Eksekusi (Opsional) — Condition Builder v2 (ConditionUI)
            // Mendukung bentuk apa pun yang didukung engine: objek tunggal, array (AND),
            // kombinator all/any/not bertingkat, dan string legacy. Bentuk yang tak
            // terepresentasikan → mode "raw": notice + baseline dipertahankan utuh.
            const _CondUI = VN.NodeRegistry.ConditionUI;
            const conditionData = data.condition !== undefined ? data.condition : null;
            const hasCondition = conditionData !== null && conditionData !== undefined;
            const condRepresentable = _CondUI.canRepresent(hasCondition ? conditionData : null);
            const condInnerHTML = condRepresentable
                ? _CondUI.buildHTML(hasCondition ? conditionData : null)
                : buildRawConditionNoticeHTML(conditionData, 'entri ini');
            // Tipe tak dikenal (tanpa typeDef) TIDAK diberi builder kondisi: extractFromCard
            // mengembalikan baseline mentah untuk tipe itu, jadi edit kondisi di UI akan
            // diam-diam diabaikan — lebih jujur tidak menampilkannya sama sekali.
            // Kotak centang di dalam seksi ini BUKAN duplikat dari lipatannya:
            // lipatan mengatur apa yang TERLIHAT, centangnya mengatur apakah entri
            // ini benar-benar punya syarat. Dua pertanyaan berbeda, dua kontrol.
            const conditionHTML = _typeDef && _typeDef.canHaveCondition ? _seksiHTML('logika', 'Logika &amp; Kondisi', `
                <div>
                    <label style="color: #66ccff; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <input type="checkbox" class="script-input toggle-condition" ${hasCondition ? 'checked' : ''}>
                        <span>Persyaratan / Kondisi Eksekusi (Opsional)</span>
                    </label>
                    <div class="condition-input-container entry-condition-container" data-cond-mode="${condRepresentable ? 'builder' : 'raw'}" style="display: ${hasCondition ? 'block' : 'none'}; margin-top: 5px;">
                        ${condInnerHTML}
                        <span style="font-size: 0.75em; color: #888; display: block; margin-top: 4px;">Nilai <code>$namaVariabel</code> = bandingkan dengan variabel lain; untuk <code>in</code>/<code>!in</code>/<code>between</code> pisahkan nilai dengan koma (between = min, max — inklusif). <strong>+ Grup</strong> = kombinasi AND/OR/NOT bertingkat.</span>
                    </div>
                </div>
            `) : '';

            let actionButtonsHTML = `
            <div style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
                <button class="delete-dialogue-btn" style="margin-top: 0;">Hapus</button>
                ${(function() {
                    var td = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.get(type) : null;
                    if (!td) return false; // tipe tak dikenal — tak ada yang bisa di-preview
                    // Entri "silent" (diproses tanpa tampilan): preview tidak bermakna.
                    if (type === 'set_var' || type === 'custom' || type === 'load_hub_flags') {
                        return typeof td.previewHandler === 'function';
                    }
                    return true;
                })() ? previewButtonHTML : ''}
            </div>
        `;

            if (type === 'dialogue') {
                actionButtonsHTML = `
            <div style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
                <button class="delete-dialogue-btn" style="margin-top: 0;">Hapus</button>
                <button class="clone-dialogue-btn" title="Duplikat Entri" style="background-color: transparent; color: #3498db; border: 1px solid #3498db; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Duplikat Entri ini</button>
                ${previewButtonHTML}
            </div>
        `;
            } else if (type === 'choice') {
                actionButtonsHTML = `
            <div style="display: flex; gap: 5px; margin-top: 10px; flex-wrap: wrap;">
                <button class="delete-dialogue-btn" style="margin-top: 0;">Hapus</button>
                ${previewButtonHTML}
            </div>
        `;
            }

            card.innerHTML = `
        <div class="drag-handle" title="Seret untuk mengubah urutan">⠿</div>
        <div class="entry-content">
            ${innerHTML}
            ${conditionHTML}
            ${actionButtonsHTML}
        </div>
    `;
            const sfxInInput = card.querySelector('input[data-key="sfxIn"]');
            const sfxInVolumePlaceholder = card.querySelector('.volume-control-placeholder[data-key-prefix="sfxIn"]');
            if (sfxInInput && sfxInVolumePlaceholder) {
                const sfxInControls = createAudioControls('sfxIn', data); // Buat kontrol untuk sfxIn
                sfxInVolumePlaceholder.replaceWith(sfxInControls);      // Ganti placeholder
                linkAudioInputToVolumeControl(sfxInInput, sfxInControls); // Hubungkan input & kontrol
            }

            // SFX Keluar (sfxOut)
            const sfxOutInput = card.querySelector('input[data-key="sfxOut"]');
            const sfxOutVolumePlaceholder = card.querySelector('.volume-control-placeholder[data-key-prefix="sfxOut"]');
            if (sfxOutInput && sfxOutVolumePlaceholder) {
                const sfxOutControls = createAudioControls('sfxOut', data); // Buat kontrol untuk sfxOut
                sfxOutVolumePlaceholder.replaceWith(sfxOutControls);      // Ganti placeholder
                linkAudioInputToVolumeControl(sfxOutInput, sfxOutControls); // Hubungkan input & kontrol
            }
            card.querySelectorAll('.volume-control-placeholder').forEach(placeholder => {
                const keyPrefix = placeholder.dataset.keyPrefix;
                const volumeControl = createAudioControls(keyPrefix, data);
                const associatedAudioInput = placeholder.previousElementSibling.querySelector('.audio-input');
                placeholder.replaceWith(volumeControl);
                if (associatedAudioInput) {
                    linkAudioInputToVolumeControl(associatedAudioInput, volumeControl);
                }
            });
            if (data.spriteAnim) card.querySelector('select[data-key="spriteAnim"]').value = data.spriteAnim;
            if (data.sprite2Anim) card.querySelector('select[data-key="sprite2Anim"]').value = data.sprite2Anim;
            if (data.spriteCenterAnim) card.querySelector('select[data-key="spriteCenterAnim"]').value = data.spriteCenterAnim;
            if (type === 'choice') {
                card.querySelectorAll('.choice-option-jump').forEach(select => {
                    updateSelectColor(select);
                });
            }

            // Untuk case video : Inisialisasi preview video jika ada data awal
            const videoInput = card.querySelector('input[data-key="video"]');
            const videoPreviewContainer = card.querySelector('.video-preview-container');
            const videoPreview = card.querySelector('.video-preview');
            const videoPlaceholder = videoPreviewContainer ? videoPreviewContainer.querySelector('.preview-placeholder') : null;

            if (videoInput && videoPreviewContainer && videoPreview && videoPlaceholder) {
                const initialVideoFile = data.video; // Ambil nama file dari data awal
                if (initialVideoFile) {
                    const videoSrc = `./visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/${initialVideoFile}?v=${Date.now()}`;
                    videoPreview.src = videoSrc;
                    videoPreviewContainer.style.display = 'flex'; // Tampilkan container
                    videoPreview.style.display = 'block';         // Tampilkan video
                    videoPlaceholder.style.display = 'none';      // Sembunyikan placeholder
                    videoPreview.onerror = () => { // Handle jika file tidak ditemukan
                        videoPreview.style.display = 'none';
                        videoPlaceholder.style.display = 'flex';
                        videoPlaceholder.textContent = `Error: File "${initialVideoFile}" tidak ditemukan.`;
                        videoPreviewContainer.style.display = 'flex'; // Tetap tampilkan container
                    };
                } else {
                    videoPreviewContainer.style.display = 'none'; // Sembunyikan jika tidak ada video awal
                }
            }
            card.querySelectorAll('.audio-preview-placeholder').forEach(placeholder => {
                const audioSrc = placeholder.dataset.src;
                const previewKey = placeholder.dataset.previewFor;
                const previewComponent = createAudioPreview(audioSrc, previewKey);
                placeholder.replaceWith(previewComponent);
            });

            // --- Handler UI Special Event ---
            const toggleSpecialBtn = card.querySelector('.toggle-special-event-btn');
            const specialForm = card.querySelector('.special-event-form');
            const removeSpecialBtn = card.querySelector('.remove-special-event-btn');

            if (toggleSpecialBtn && specialForm && removeSpecialBtn) {
                toggleSpecialBtn.addEventListener('click', () => {
                    const isHidden = specialForm.style.display === 'none';
                    specialForm.style.display = isHidden ? 'block' : 'none';
                    if (isHidden) {
                        toggleSpecialBtn.innerHTML = '<span style="color: #f3b;"></span> Edit Special Event (Active)';
                    }
                });

                removeSpecialBtn.addEventListener('click', () => {
                    specialForm.style.display = 'none';
                    specialForm.querySelector('.special-event-type').value = 'glitch_screen';
                    specialForm.querySelector('.special-event-duration').value = 1000;
                    specialForm.querySelector('.special-event-intensity').value = 1.0;
                    specialForm.querySelector('.special-event-sfx').value = '';
                    specialForm.querySelector('.special-event-wait').checked = false;
                    toggleSpecialBtn.innerHTML = '<span style="color: #777;"></span>Add Special Event';
                });

                const delayEnableCheckbox = specialForm.querySelector('.special-event-delay-enable');
                const delayInputContainer = specialForm.querySelector('.delay-input-container');
                if (delayEnableCheckbox && delayInputContainer) {
                    delayEnableCheckbox.addEventListener('change', () => {
                        delayInputContainer.style.display = delayEnableCheckbox.checked ? 'block' : 'none';
                    });
                }
            }

            // --- Handler Kondisi Eksekusi (Condition Builder v2) ---
            // Isi builder TIDAK direset saat toggle dimatikan — ekstraksi menghapus
            // condition ketika toggle off, dan mencentang ulang memulihkan isian.
            const toggleConditionCheckbox = card.querySelector('.toggle-condition');
            const conditionContainer = card.querySelector('.entry-condition-container');
            if (toggleConditionCheckbox && conditionContainer) {
                toggleConditionCheckbox.addEventListener('change', () => {
                    conditionContainer.style.display = toggleConditionCheckbox.checked ? 'block' : 'none';
                });
            }
            // Delegasi tombol builder kondisi (+ Kondisi / + Grup / hapus) — sekali per
            // card; mencakup builder entry-level, per-opsi choice, dan opsi yang
            // ditambahkan belakangan lewat "+ Tambah Opsi".
            if (typeof VN !== 'undefined' && VN.NodeRegistry && VN.NodeRegistry.ConditionUI) {
                VN.NodeRegistry.ConditionUI.attach(card);
            }

            // --- Handler panel "⚙ Lanjutan" per-opsi choice (delegasi di card) ---
            if (type === 'choice') {
                card.addEventListener('click', (e) => {
                    const advBtn = e.target.closest ? e.target.closest('.choice-option-adv-toggle') : null;
                    if (!advBtn || !card.contains(advBtn)) return;
                    const optEditor = advBtn.closest('.choice-option-editor');
                    const panel = optEditor && optEditor.querySelector('.choice-option-advanced');
                    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                });
                card.addEventListener('change', (e) => {
                    const t = e.target;
                    if (!t || !t.closest) return;
                    // Operator setVariable per-opsi: tukar kotak Nilai ↔ Min-Max saat random
                    if (t.classList.contains('opt-sv-op')) {
                        const row = t.closest('.opt-sv-row');
                        if (row) {
                            const isRandom = t.value === 'random';
                            const valInput = row.querySelector('.opt-sv-value');
                            const randWrap = row.querySelector('.opt-sv-random-wrap');
                            if (valInput) valInput.style.display = isRandom ? 'none' : '';
                            if (randWrap) randWrap.style.display = isRandom ? 'flex' : 'none';
                        }
                    }
                    // Toggle kondisi tampil per-opsi
                    if (t.classList.contains('opt-cond-toggle')) {
                        const block = t.closest('.opt-adv-block');
                        const container = block && block.querySelector('.opt-cond-container');
                        if (container) container.style.display = t.checked ? 'block' : 'none';
                    }
                });
            }

            // --- Handler Set Variable: tukar widget Nilai ↔ Rentang Acak sesuai operator ---
            const setVarOpSelector = card.querySelector('.set-var-op-selector');
            if (setVarOpSelector) {
                const valueWrap = card.querySelector('.set-var-value-wrap');
                const randomWrap = card.querySelector('.set-var-random-wrap');
                setVarOpSelector.addEventListener('change', () => {
                    const isRandom = setVarOpSelector.value === 'random';
                    if (valueWrap) valueWrap.style.display = isRandom ? 'none' : '';
                    if (randomWrap) randomWrap.style.display = isRandom ? '' : 'none';
                });
            }

            // --- Handler BGM lanjutan (scene): one-shot/sting & stop eksplisit ---
            const bgmOneShotToggle = card.querySelector('.bgm-oneshot-toggle');
            if (bgmOneShotToggle) {
                const durationWrap = card.querySelector('.bgm-oneshot-duration-wrap');
                bgmOneShotToggle.addEventListener('change', () => {
                    if (durationWrap) durationWrap.style.display = bgmOneShotToggle.checked ? 'flex' : 'none';
                });
            }
            const bgmStopToggle = card.querySelector('.bgm-stop-toggle');
            if (bgmStopToggle) {
                const bgmInput = card.querySelector('input[data-key="bgm"]');
                bgmStopToggle.addEventListener('change', () => {
                    const stopped = bgmStopToggle.checked;
                    // Stop eksplisit vs memutar BGM baru saling eksklusif — kosongkan &
                    // kunci input bgm supaya JSON yang tersimpan tidak ambigu.
                    if (bgmInput) {
                        if (stopped && bgmInput.value.trim()) {
                            bgmInput.value = '';
                            bgmInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        bgmInput.disabled = stopped;
                    }
                    if (bgmOneShotToggle) {
                        if (stopped) bgmOneShotToggle.checked = false;
                        bgmOneShotToggle.disabled = stopped;
                        const durationWrap = card.querySelector('.bgm-oneshot-duration-wrap');
                        if (durationWrap && stopped) durationWrap.style.display = 'none';
                    }
                });
            }

            // --- Ambient: tampilan persen volume + stop eksklusif thd input ---
            const ambientVolSlider = card.querySelector('.ambient-volume-slider');
            const ambientVolDisplay = card.querySelector('.ambient-volume-display');
            if (ambientVolSlider && ambientVolDisplay) {
                ambientVolSlider.addEventListener('input', () => {
                    ambientVolDisplay.textContent = Math.round(ambientVolSlider.value * 100) + '%';
                });
            }
            const ambientStopToggle = card.querySelector('.ambient-stop-toggle');
            if (ambientStopToggle) {
                const ambientInput = card.querySelector('input[data-key="ambient"]');
                ambientStopToggle.addEventListener('change', () => {
                    const stopped = ambientStopToggle.checked;
                    if (ambientInput) {
                        if (stopped && ambientInput.value.trim()) {
                            ambientInput.value = '';
                            ambientInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        ambientInput.disabled = stopped;
                    }
                });
            }

            // --- Handler Preview Entry (tersedia untuk SEMUA tipe entri: dialogue, choice, scene) ---
            const previewEntryBtn = card.querySelector('.preview-entry-btn');
            if (previewEntryBtn) {
                previewEntryBtn.addEventListener('click', () => {
                    // Ekstrak semua data dari card pakai logika yang sudah ada
                    const cardData = extractDataFromCard(card);

                    // Jika ada special event form yang aktif, ambil datanya juga
                    const specialFormElement = card.querySelector('.special-event-form');
                    if (specialFormElement && specialFormElement.style.display !== 'none') {
                        const eventType = specialFormElement.querySelector('.special-event-type')?.value;
                        if (eventType && eventType.trim() !== '') {
                            const duration = parseInt(specialFormElement.querySelector('.special-event-duration')?.value) || 1000;
                            const intensity = parseFloat(specialFormElement.querySelector('.special-event-intensity')?.value) || 1.0;
                            const sfx = specialFormElement.querySelector('.special-event-sfx')?.value || '';
                            const wait = specialFormElement.querySelector('.special-event-wait')?.checked || false;
                            const delayEnable = specialFormElement.querySelector('.special-event-delay-enable')?.checked || false;
                            const delayTime = parseInt(specialFormElement.querySelector('.special-event-delay')?.value) || 0;

                            cardData.specialEvent = {
                                type: eventType,
                                duration: duration,
                                intensity: intensity,
                                sfx: sfx,
                                wait: wait,
                                delay: delayEnable ? delayTime : 0
                            };
                        }
                    }

                    // === Konteks visual (background/video/BGM/speaker) — simulasi urutan
                    // skrip yang benar (fase → label/sub-label → entri persist sebelumnya),
                    // bukan cuma menengok induk langsung + sibling terdekat.
                    const previewContext = computeEntryPreviewContext(card);

                    if (cardData.type === 'dialogue' || cardData.type === 'choice') {
                        if (!cardData.background && !cardData.video) {
                            if (previewContext.background) {
                                cardData._contextBackground = previewContext.background;
                                cardData._contextBackgroundMode = previewContext.backgroundMode;
                            } else if (previewContext.video) {
                                cardData._contextVideo = previewContext.video;
                            }
                        }
                        if (!cardData.speaker && previewContext.speaker) {
                            cardData._contextSpeaker = previewContext.speaker;
                        }
                    }
                    // BGM diwarisi dari state terakhir apa pun tipe entrinya (paritas core.js)
                    if (!cardData.bgm && previewContext.bgm) {
                        cardData._contextBgm = previewContext.bgm.bgm;
                        if (cardData.bgmVolume === undefined) cardData._contextBgmVolume = previewContext.bgm.bgmVolume;
                        if (cardData.bgmPan === undefined) cardData._contextBgmPan = previewContext.bgm.bgmPan;
                        if (cardData.bgmDelay === undefined) cardData._contextBgmDelay = previewContext.bgm.bgmDelay;
                        if (cardData.bgmLoop === undefined) cardData._contextBgmLoop = previewContext.bgm.bgmLoop;
                        if (cardData.bgmFade === undefined) cardData._contextBgmFade = previewContext.bgm.bgmFade;
                    }

                    // === Priming sprite: kalau entri ini punya slot dengan "Transisi Halus"
                    // aktif, popup preview (window baru, tanpa histori render) tidak tahu
                    // posisi sebelumnya untuk dianimasikan — hasilnya sprite langsung
                    // "lompat" ke posisi akhir tanpa gerakan. Kirim dulu frame diam berisi
                    // state SEBELUM entri ini (dari simulasi di atas), baru susul entri
                    // aslinya, supaya animasi geser benar-benar terlihat dari posisi asal.
                    const _spriteSlots = ['sprite', 'sprite2', 'spriteCenter'];
                    const needsSpritePriming = (cardData.type === 'dialogue' || cardData.type === 'choice') &&
                        _spriteSlots.some(slot => cardData[slot] && cardData[slot + 'Transition'] && previewContext.sprites[slot]);
                    if (needsSpritePriming) {
                        const primer = { type: 'dialogue', text: '', speaker: '', transition: 'cut', spriteMode: cardData.spriteMode || 'custom' };
                        if (previewContext.background) { primer.background = previewContext.background; primer.backgroundMode = previewContext.backgroundMode; }
                        else if (previewContext.video) { primer.video = previewContext.video; }
                        else if (cardData.background) { primer.background = cardData.background; primer.backgroundMode = cardData.backgroundMode; }
                        else if (cardData.video) { primer.video = cardData.video; }
                        if (previewContext.bgm) primer.bgm = previewContext.bgm.bgm;
                        _spriteSlots.forEach(slot => {
                            const prior = previewContext.sprites[slot];
                            if (prior && prior.src) {
                                primer[slot] = prior.src;
                                primer[slot + 'X'] = prior.x;
                                primer[slot + 'Scale'] = prior.scale;
                                primer[slot + 'Anim'] = prior.anim;
                            }
                        });
                        cardData._spritePrimer = primer;
                    }

                    // Patch path aset untuk konteks preview dari root
                    if (currentlyEditing && currentlyEditing.novel && currentlyEditing.chapter) {
                        const assetPrefix = `aset/game/visual_novels/${currentlyEditing.novel}/${currentlyEditing.chapter}/`;
                        const assetKeys = ['background', 'video', 'sprite', 'sprite2', 'spriteCenter', 'bgm', 'sfx', 'sfxIn', 'sfxOut', 'voice', '_contextBackground', '_contextVideo', '_contextBgm'];
                        const patchAssetPath = (value) => {
                            if (typeof value !== 'string' || !value) return value;
                            if (/^(?:https?:|file:|data:|blob:)/i.test(value)) return value;
                            return assetPrefix + value;
                        };
                        const patchAssetKeys = (obj) => {
                            assetKeys.forEach(key => {
                                const value = obj[key];
                                if (Array.isArray(value)) obj[key] = value.map(patchAssetPath);
                                else obj[key] = patchAssetPath(value);
                            });
                        };

                        patchAssetKeys(cardData);
                        if (cardData._spritePrimer) patchAssetKeys(cardData._spritePrimer);

                        // Patch sfx special event jika ada
                        if (cardData.specialEvent && cardData.specialEvent.sfx) {
                            cardData.specialEvent.sfx = patchAssetPath(cardData.specialEvent.sfx);
                        }

                        // Patch array charSprites untuk sprite kustom
                        if (cardData.charSprites && Array.isArray(cardData.charSprites)) {
                            cardData.charSprites = cardData.charSprites.map(sprite => {
                                return { ...sprite, src: patchAssetPath(sprite.src) };
                            });
                        }
                    }

                    // Sertakan identitas novel/chapter agar main process tahu Custom Player
                    // (player.html) mana yang sebenarnya dipakai chapter ini — supaya preview
                    // dirender lewat player yang BENAR, bukan selalu engine global.
                    let isCustomPlayerChapter = false;
                    if (currentlyEditing && currentlyEditing.novel && currentlyEditing.chapter) {
                        cardData.novel = currentlyEditing.novel;
                        cardData.chapter = currentlyEditing.chapter;
                        try {
                            // __dirname di sini = folder vnManager.html (aset/game/), konsisten
                            // dengan pola pengecekan hub.html kustom di scriptEditor.js.
                            const customPlayerPath = path.join(__dirname, 'visual_novels', currentlyEditing.novel, currentlyEditing.chapter, 'player.html');
                            isCustomPlayerChapter = require('fs').existsSync(customPlayerPath);
                        } catch (e) { /* abaikan, fallback ke engine global */ }
                    }

                    // Kirim payload ke main process untuk ditampilkan di popup preview
                    // Extension types bisa punya custom previewHandler
                    const extPreviewDef = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.get(cardData.type) : null;
                    if (extPreviewDef && typeof extPreviewDef.previewHandler === 'function') {
                        extPreviewDef.previewHandler(cardData, { ipcRenderer, card });
                    } else {
                        ipcRenderer.send('vn-engine:preview-special-event', cardData);
                    }

                    // Notifikasi berdasarkan tipe entri
                    const entryType = cardData.type || 'entry';
                    const hasSpecialEvent = cardData.specialEvent && cardData.specialEvent.type;
                    const hasContext = cardData._contextBackground || cardData._contextVideo;
                    let notifText = '';
                    if (hasSpecialEvent) {
                        notifText = `Preview ${entryType} + Special Event: ${cardData.specialEvent.type}`;
                    } else if (hasContext) {
                        notifText = `Preview ${entryType} dengan konteks background`;
                    } else {
                        notifText = `Preview ${entryType}: ${cardData.speaker || cardData.sceneType || 'Entry'}`;
                    }
                    if (isCustomPlayerChapter) notifText += ' (via Custom Player chapter ini)';
                    showNotification(notifText, 'success');
                });
            }

            // === Toggle Jarak Otomatis (Mode Sprite) ===
            const spriteModeToggle = card.querySelector('.sprite-mode-toggle');
            if (spriteModeToggle) {
                // Update status awal berdasarkan data
                const updatePositionXVisibility = (isAuto) => {
                    const positionXRows = card.querySelectorAll('.position-x-row');
                    positionXRows.forEach(row => {
                        row.style.display = isAuto ? 'none' : '';
                    });
                    // Update warna label
                    const labelSpan = spriteModeToggle.parentElement.querySelector('span');
                    if (labelSpan) {
                        labelSpan.style.color = isAuto ? '#00FF7F' : '#888';
                    }
                };

                // Terapkan status awal
                updatePositionXVisibility(spriteModeToggle.checked);

                // Pantau perubahan
                spriteModeToggle.addEventListener('change', (e) => {
                    updatePositionXVisibility(e.target.checked);
                });
            }

            // === HANDLER: Live Sprite Animation Preview ===
            // Mapping dari nilai animasi player ke kelas animasi editor
            // Mapping dari nilai animasi player ke kelas animasi editor
            const animClassMap = {
                // 'anim-in-fade': 'editor-anim-in-fade', // Nonaktifkan animasi untuk Tampil Langsung (agar diam)
                'anim-in-slide-from-bottom': 'editor-anim-in-slide-from-bottom',
                'anim-in-slide-from-left': 'editor-anim-in-slide-from-left',
                'anim-in-slide-from-right': 'editor-anim-in-slide-from-right',
                'anim-out-fade': 'editor-anim-out-fade',
                'anim-out-slide-to-bottom': 'editor-anim-out-slide-to-bottom',
                'anim-out-slide-to-left': 'editor-anim-out-slide-to-left',
                'anim-out-slide-to-right': 'editor-anim-out-slide-to-right',
                'anim-loop-pulse-glow': 'editor-anim-loop-pulse-glow',
                'anim-loop-gentle-float': 'editor-anim-loop-gentle-float',
                'anim-loop-shake': 'editor-anim-loop-shake',
                'anim-oneshot-shake': 'editor-anim-oneshot-shake',
                'anim-oneshot-jump': 'editor-anim-oneshot-jump',
                'anim-loop-pulse': 'editor-anim-loop-pulse',
                'anim-oneshot-flip-right': 'editor-anim-oneshot-flip-right',
                'anim-oneshot-flip-left': 'editor-anim-oneshot-flip-left',
                'anim-oneshot-flip-up': 'editor-anim-oneshot-flip-up',
                'anim-oneshot-flip-down': 'editor-anim-oneshot-flip-down',
                'anim-oneshot-pass-left-to-right': 'editor-anim-oneshot-pass-left-to-right',
                'anim-oneshot-pass-right-to-left': 'editor-anim-oneshot-pass-right-to-left',
                'anim-oneshot-pass-bottom-to-top': 'editor-anim-oneshot-pass-bottom-to-top',
                'anim-oneshot-pass-top-to-bottom': 'editor-anim-oneshot-pass-top-to-bottom',
                'anim-loop-motor-vibration': 'editor-anim-loop-motor-vibration',
                'anim-loop-confused': 'editor-anim-loop-confused',
                'anim-loop-flip-confused': 'editor-anim-loop-flip-confused'
            };

            // Fungsi untuk menerapkan animasi live pada gambar sprite
            const applyLiveAnimation = (imgElement, animValue) => {
                if (!imgElement) return;

                // Hapus semua kelas animasi editor yang mungkin aktif
                Object.values(animClassMap).forEach(cls => imgElement.classList.remove(cls));

                // Terapkan animasi baru - cek parent wrapper untuk visibility
                const editorAnimClass = animClassMap[animValue];
                const wrapper = imgElement.closest('.sprite-anim-wrapper');
                const isVisible = wrapper ? wrapper.classList.contains('visible') : imgElement.parentElement && imgElement.parentElement.style.display !== 'none';

                if (editorAnimClass && isVisible) {
                    void imgElement.offsetWidth; // Trigger reflow untuk restart animasi
                    imgElement.classList.add(editorAnimClass);
                }
            };

            // Bind event untuk semua selector animasi sprite preset (sprite, sprite2, spriteCenter)
            card.querySelectorAll('.sprite-anim-selector:not(.extra-sprite-anim)').forEach(selector => {
                const animControls = selector.closest('.animation-controls');
                const spriteContainer = animControls ? animControls.closest('.sprite-config-container') : null;
                const getPreviewSurface = () => spriteContainer ? spriteContainer.querySelector('.sprite-anim-img') : null;

                if (getPreviewSurface()) {
                    // Terapkan animasi awal saat kartu dibuat
                    const initialAnimValue = selector.value || 'anim-in-fade';
                    applyLiveAnimation(getPreviewSurface(), initialAnimValue);

                    // Pasang listener untuk perubahan selector
                    selector.addEventListener('change', () => {
                        const animValue = selector.value || 'anim-in-fade';
                        applyLiveAnimation(getPreviewSurface(), animValue);
                    });
                }
            });

            // Bind event untuk semua selector animasi sprite custom (extra sprites)
            card.querySelectorAll('.extra-sprite-anim').forEach(selector => {
                const animControls = selector.closest('.animation-controls');
                const spriteContainer = animControls ? animControls.closest('.sprite-config-container') : null;
                const getPreviewSurface = () => spriteContainer ? spriteContainer.querySelector('.sprite-anim-img.extra-sprite-preview') : null;

                if (getPreviewSurface()) {
                    // Terapkan animasi awal saat kartu dibuat
                    const initialAnimValue = selector.value || 'anim-in-fade';
                    applyLiveAnimation(getPreviewSurface(), initialAnimValue);

                    // Pasang listener untuk perubahan selector
                    selector.addEventListener('change', () => {
                        const animValue = selector.value || 'anim-in-fade';
                        applyLiveAnimation(getPreviewSurface(), animValue);
                    });
                }
            });

            // Chroma key adalah konfigurasi opsional. Menyembunyikan parameter
            // saat off menjaga kartu ringkas, tetapi input tetap berada di DOM
            // sehingga extractor bisa menyimpan state saat fitur dinyalakan.
            card.querySelectorAll('.sprite-chroma-controls').forEach(block => {
                const toggle = block.querySelector('.sprite-chroma-toggle input[type="checkbox"]');
                const fields = block.querySelector('.sprite-chroma-fields');
                if (!toggle || !fields) return;
                const refresh = () => { fields.style.display = toggle.checked ? 'grid' : 'none'; };
                toggle.addEventListener('change', refresh);
                refresh();
            });

            // Extension field custom render callbacks
            const extTypeDef2 = (typeof VN !== 'undefined' && VN.NodeRegistry) ? VN.NodeRegistry.get(type) : null;
            if (extTypeDef2 && extTypeDef2.fields) {
                extTypeDef2.fields.forEach(function(field) {
                    if (typeof field.render === 'function') {
                        const container = card.querySelector(`.ext-field-container[data-field-key="${field.key}"]`);
                        if (container) {
                            const currentVal = data[field.key] !== undefined ? data[field.key] : '';
                            field.render(container, currentVal, function(newVal) {
                                // onChange — update underlying data-key input or store in dataset
                                container.dataset.value = JSON.stringify(newVal);
                            });
                        }
                    }
                });
            }

            // === SPRINT 4: Validasi warning visual pada card ===
            _attachEntryWarnings(card, type, data, availableLabels);

            // Badge dihitung dari `data` — isi berkas apa adanya. Dijalankan di sini,
            // bukan lewat extractDataFromCard, karena ekstraksi penuh per kartu saat
            // render akan berlipat jadi ribuan kali di chapter besar. Saat kreator
            // MENYUNTING barulah ekstraksi dipakai (listener change di bawah), dan itu
            // cuma satu kartu per interaksi.
            try { terapkanBadgeSeksi(card, type, data); } catch (e) { /* badge kosmetik, jangan menggagalkan render */ }

            return card;
        }

        // --- Sprint 4: Warning Validator Functions ---

        /**
         * Attach warning badges ke entry card berdasarkan validasi data
         * WARNING bersifat NON-BLOCKING — hanya visual indicator
         */
        function _attachEntryWarnings(card, type, data, availableLabels) {
            const warnings = [];
            const _C = VN.NodeRegistry.C;
            const ASSET_KEYS = _C.ASSET_KEYS || [];

            // 1. Validasi asset references — cek apakah file terlihat kosong atau placeholder-ish
            ASSET_KEYS.forEach(key => {
                // Sprite multi-layer (F4) bernilai ARRAY — tiap layer diperiksa.
                // Sebelumnya penjaga `typeof val === 'string'` membuat SELURUH entri
                // array lolos tanpa diperiksa sama sekali.
                const daftar = Array.isArray(data[key]) ? data[key] : [data[key]];
                daftar.forEach((val, i) => {
                    if (!val || typeof val !== 'string' || !val.trim()) return;
                    // File path yang mencurigakan (extension tidak dikenali atau format aneh)
                    const ext = val.split('.').pop().toLowerCase();
                    const knownExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'webm', 'mkv', 'avi', 'mov', 'mp3', 'ogg', 'wav', 'flac', 'aac'];
                    if (!knownExts.includes(ext)) {
                        const dimana = daftar.length > 1 ? `${key}[${i}]` : key;
                        warnings.push({ type: 'warning', text: `Aset "${dimana}": ekstensi .${ext} tidak dikenali` });
                    }
                });
            });

            // 2. Validasi jump target untuk choice options
            if (type === 'choice' && data.choices && Array.isArray(data.choices)) {
                data.choices.forEach((opt, idx) => {
                    if (opt.jump && opt.jump.trim() && !opt.jump.startsWith('##')) {
                        // Cek apakah target label ada di available labels
                        if (availableLabels && availableLabels.length > 0 && !availableLabels.includes(opt.jump)) {
                            warnings.push({ type: 'error', text: `Pilihan "${opt.text || idx + 1}": target "${opt.jump}" tidak ditemukan` });
                        }
                    }
                });
            }

            // Render warning badges
            if (warnings.length > 0) {
                const warningContainer = document.createElement('div');
                warningContainer.className = 'entry-warning-container';
                warnings.forEach(w => {
                    const badge = document.createElement('span');
                    badge.className = 'vn-warning-badge' + (w.type === 'error' ? ' vn-warning-error' : '');
                    badge.textContent = '⚠ ' + w.text;
                    badge.title = w.text;
                    warningContainer.appendChild(badge);
                });
                const contentEl = card.querySelector('.entry-content');
                if (contentEl) contentEl.appendChild(warningContainer);

                // Highlight card border
                card.classList.add(warnings.some(w => w.type === 'error') ? 'has-error' : 'has-warning');
            }
        }
