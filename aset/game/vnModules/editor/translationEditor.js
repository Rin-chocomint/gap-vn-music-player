// === translationEditor.js ===
// Terjemahan konten — view side-by-side untuk script.<code>.json per-chapter.
// Dibuka dari tombol "🌐 Terjemahan" di HEADER chapter (vnManager.html): scope-nya
// chapter yang sedang dibuka, jadi pintunya berada di konteks itu, bukan di sidebar.
// Backend: IPC i18n:list-languages / get-translation / save-translation /
// delete-translation (vn-engine/novel-crud.js).
//
// Prinsip: struktur script.<code>.json WAJIB identik dengan script.json (engine
// memuat per-index). Editor menjamin ini by-construction — teks dasar di-clone,
// hanya text/speaker/choices[].text yang di-override. Field lain (tipe, jump,
// kondisi, aset) read-only dari dasar.
//
// Catatan UI: penambahan bahasa memakai baris inline, BUKAN window.prompt —
// prompt sistem tidak bisa ditema, memblokir renderer, dan persis "pop window"
// yang ingin dihilangkan dari alur ini.

(function () {
    'use strict';

    const esc = s => String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const FIELD_LABEL = { speaker: '👤 Pembicara', text: '💬 Teks', choice: '🔀 Opsi' };

    // Field yang bisa diterjemahkan per entri dasar → daftar {index, field, optIndex?, base}.
    function extractTranslatable(base) {
        const rows = [];
        base.forEach((entry, i) => {
            if (!entry || typeof entry !== 'object') return;
            if (typeof entry.speaker === 'string' && entry.speaker.trim()) {
                rows.push({ index: i, field: 'speaker', base: entry.speaker, type: entry.type });
            }
            if (typeof entry.text === 'string' && entry.text.trim()) {
                rows.push({ index: i, field: 'text', base: entry.text, type: entry.type });
            }
            if (Array.isArray(entry.choices)) {
                entry.choices.forEach((opt, j) => {
                    if (opt && typeof opt.text === 'string' && opt.text.trim()) {
                        rows.push({ index: i, field: 'choice', optIndex: j, base: opt.text, type: 'choice-opt' });
                    }
                });
            }
        });
        return rows;
    }

    function getTransValue(translation, row) {
        if (!translation) return '';
        const e = translation[row.index];
        if (!e) return '';
        if (row.field === 'speaker') return typeof e.speaker === 'string' ? e.speaker : '';
        if (row.field === 'text') return typeof e.text === 'string' ? e.text : '';
        if (row.field === 'choice') {
            const opt = Array.isArray(e.choices) ? e.choices[row.optIndex] : null;
            return opt && typeof opt.text === 'string' ? opt.text : '';
        }
        return '';
    }

    // Bangun array terjemahan LENGKAP: clone dasar, override dari input; input
    // kosong → pakai teks dasar (fallback bahasa sumber, bukan string kosong).
    function buildTranslation(base, rows, inputs) {
        const clone = JSON.parse(JSON.stringify(base));
        rows.forEach((row, idx) => {
            const v = inputs[idx].value;
            const finalV = v.trim() ? v : row.base;
            if (row.field === 'speaker') clone[row.index].speaker = finalV;
            else if (row.field === 'text') clone[row.index].text = finalV;
            else if (row.field === 'choice') clone[row.index].choices[row.optIndex].text = finalV;
        });
        return clone;
    }

    // ---- State view -------------------------------------------------------
    let _known = [];
    let _languages = [];
    let _activeLang = null;
    let _loadedChapter = null;   // latch: view benar-benar termuat untuk chapter ini
    let _inputs = [];
    let _rows = [];
    let _base = [];
    let _inputBaseline = null;

    const el = (id) => document.getElementById(id);

    function inputSnapshot() {
        return JSON.stringify(_inputs.map(input => input.value));
    }

    function translationIsDirty() {
        return !!(_activeLang && _loadedChapter && _inputBaseline !== null &&
            inputSnapshot() !== _inputBaseline);
    }

    async function resolveTranslationDraft(nextLabel) {
        return VN.Utils.resolveDirtyDecision({
            dirty: translationIsDirty(),
            message: `Terjemahan "${_activeLang}" untuk "${_loadedChapter}" belum disimpan. Simpan sebelum ${nextLabel}?`,
            saveAction: simpan
        });
    }

    function langLabel(code) {
        const k = _known.find(x => x.code === code);
        return k ? `${k.label} (${code})` : code;
    }

    // ---- Render -----------------------------------------------------------

    async function renderView() {
        const body = el('translation-body');
        const title = el('translation-title');
        if (!body) return;

        const novel = currentlyEditing.novel;
        const chapter = currentlyEditing.chapter;

        if (!novel || !chapter) {
            _loadedChapter = null;
            _inputBaseline = null;
            if (title) title.textContent = 'Terjemahan';
            body.innerHTML = '<p class="trans-empty">Buka sebuah chapter dulu — terjemahan selalu terikat pada satu chapter.</p>';
            return;
        }

        // Workspace me-mount ulang view ini setiap dibuka. Bila dokumen chapter
        // yang sama masih dirty, DOM sekarang adalah draft authoritative; jangan
        // menggantinya dengan file disk hanya karena user sempat melihat tab lain.
        if (_loadedChapter === chapter && translationIsDirty()) {
            if (title) title.textContent = 'Terjemahan: ' + chapter;
            return;
        }

        if (title) title.textContent = 'Terjemahan: ' + chapter;
        body.innerHTML = '<p class="trans-empty">Memuat…</p>';

        const listRes = await ipcRenderer.invoke('i18n:list-languages', { storyTitle: novel, chapterName: chapter });
        if (!listRes || !listRes.success) {
            _loadedChapter = null;
            body.innerHTML = '<p class="trans-empty trans-error">Gagal membaca bahasa: ' +
                esc((listRes && listRes.message) || 'unknown') + '</p>';
            return;
        }

        _known = listRes.known || [];
        _languages = listRes.languages || [];
        if (!_languages.includes(_activeLang)) _activeLang = _languages[0] || null;
        _loadedChapter = chapter;

        body.innerHTML =
            '<div class="trans-langbar">' +
                '<span class="trans-langbar-label">Bahasa dasar: <b>script.json</b> (sumber) →</span>' +
                '<div id="trans-lang-tabs" class="trans-lang-tabs"></div>' +
                '<button type="button" id="trans-add-lang" class="trans-add-btn">＋ Tambah bahasa</button>' +
                '<div id="trans-add-row" class="trans-add-row" hidden>' +
                    '<input type="text" id="trans-new-lang" class="script-input trans-new-lang" list="trans-known-langs" ' +
                        'placeholder="kode ISO: en, ja, ko…" maxlength="5">' +
                    '<datalist id="trans-known-langs"></datalist>' +
                    '<button type="button" id="trans-add-confirm" class="trans-confirm-btn">Tambah</button>' +
                    '<button type="button" id="trans-add-cancel" class="trans-cancel-btn">Batal</button>' +
                '</div>' +
            '</div>' +
            '<div id="trans-table"></div>';

        renderTabs();
        bindAddLang();
        await renderTable();
    }

    function renderTabs() {
        const tabsEl = el('trans-lang-tabs');
        if (!tabsEl) return;
        tabsEl.innerHTML = _languages.map(code =>
            `<button type="button" class="trans-lang-tab${code === _activeLang ? ' is-active' : ''}" data-lang="${esc(code)}">${esc(langLabel(code))}</button>`
        ).join('') || '<span class="trans-langbar-hint">Belum ada terjemahan. Klik "＋ Tambah bahasa".</span>';

        tabsEl.querySelectorAll('.trans-lang-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.dataset.lang === _activeLang) return;
                const allowed = await resolveTranslationDraft('mengganti bahasa');
                if (!allowed) return;
                _activeLang = btn.dataset.lang;
                renderTabs();
                await renderTable();
            });
        });
    }

    function bindAddLang() {
        const addBtn = el('trans-add-lang');
        const row = el('trans-add-row');
        const input = el('trans-new-lang');
        const datalist = el('trans-known-langs');
        const confirmBtn = el('trans-add-confirm');
        const cancelBtn = el('trans-add-cancel');
        if (!addBtn || !row || !input) return;

        const avail = _known.filter(k => !_languages.includes(k.code));
        if (datalist) datalist.innerHTML = avail.map(a => `<option value="${esc(a.code)}">${esc(a.label)}</option>`).join('');

        const tutup = () => { row.hidden = true; addBtn.hidden = false; input.value = ''; };

        addBtn.addEventListener('click', () => {
            row.hidden = false;
            addBtn.hidden = true;
            input.value = avail[0] ? avail[0].code : '';
            input.focus();
            input.select();
        });
        if (cancelBtn) cancelBtn.addEventListener('click', tutup);

        const tambah = async () => {
            const code = (input.value || '').trim().toLowerCase();
            if (!code) return;
            if (!/^[a-z]{2,5}$/.test(code)) {
                showNotification('Kode bahasa harus 2–5 huruf (mis. en, ja, ko).', 'error');
                return;
            }
            if (code !== _activeLang) {
                const allowed = await resolveTranslationDraft('menambah bahasa "' + code + '"');
                if (!allowed) return;
            }
            tutup();
            if (!_languages.includes(code)) _languages.push(code);
            _activeLang = code;
            renderTabs();
            await renderTable();   // berkas belum ada → tabel kosong (placeholder = teks sumber)
        };
        if (confirmBtn) confirmBtn.addEventListener('click', tambah);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); tambah(); }
            if (e.key === 'Escape') { e.preventDefault(); tutup(); }
        });
    }

    async function renderTable() {
        const tableEl = el('trans-table');
        if (!tableEl) return;
        _inputBaseline = null;

        if (!_activeLang) {
            tableEl.innerHTML = '<p class="trans-empty">Pilih atau tambah bahasa untuk mulai menerjemahkan.</p>';
            return;
        }

        tableEl.innerHTML = '<p class="trans-empty">Memuat…</p>';
        const res = await ipcRenderer.invoke('i18n:get-translation', {
            storyTitle: currentlyEditing.novel, chapterName: currentlyEditing.chapter, lang: _activeLang
        });
        if (!res || !res.success) {
            _inputBaseline = null;
            tableEl.innerHTML = '<p class="trans-empty trans-error">Gagal memuat: ' + esc(res && res.message) + '</p>';
            return;
        }

        _base = res.base;
        _rows = extractTranslatable(_base);
        const translation = res.translation;

        const parityWarn = (res.parityErrors && res.parityErrors.length)
            ? '<div class="trans-parity-warn">⚠️ File terjemahan ini TIDAK sejajar dengan dasar (di-edit tangan?):<br>• ' +
              res.parityErrors.map(esc).join('<br>• ') +
              '<br><b>Menyimpan dari editor ini akan memperbaikinya</b> (struktur diambil ulang dari dasar).</div>'
            : '';

        const doneCount = _rows.filter(r => { const v = getTransValue(translation, r); return v && v !== r.base; }).length;

        tableEl.innerHTML = parityWarn +
            `<p class="trans-note">${_rows.length} string dapat diterjemahkan · ${doneCount} sudah diisi. ` +
            'Kotak kosong = pakai teks sumber (fallback). Struktur (tipe/jump/kondisi/aset) tetap dari dasar.</p>' +
            '<table class="trans-table"><thead><tr>' +
            '<th class="trans-col-idx">#</th>' +
            '<th>Sumber (script.json)</th>' +
            '<th>Terjemahan</th></tr></thead><tbody id="trans-tbody"></tbody></table>' +
            '<div class="trans-actions">' +
                `<button type="button" id="trans-save-btn" class="trans-save-btn">💾 Simpan Terjemahan (${esc(_activeLang)})</button>` +
                '<button type="button" id="trans-delete-btn" class="trans-danger-btn">🗑 Hapus Bahasa Ini</button>' +
            '</div>';

        const tbody = el('trans-tbody');
        _inputs = [];
        _rows.forEach((row) => {
            const tr = document.createElement('tr');
            const existing = getTransValue(translation, row);
            const val = (existing && existing !== row.base) ? existing : '';
            const inputHTML = row.field === 'text'
                ? `<textarea class="script-input" rows="2" placeholder="${esc(row.base)}">${esc(val)}</textarea>`
                : `<input type="text" class="script-input" placeholder="${esc(row.base)}" value="${esc(val)}">`;
            tr.innerHTML =
                `<td class="trans-col-idx">${row.index}<br><span class="trans-field-label">${esc(FIELD_LABEL[row.field] || row.field)}</span></td>` +
                `<td class="trans-col-src">${esc(row.base)}</td>` +
                '<td class="trans-col-dst"></td>';
            const cell = tr.children[2];
            cell.innerHTML = inputHTML;
            _inputs.push(cell.firstElementChild);
            tbody.appendChild(tr);
        });

        _inputBaseline = inputSnapshot();

        el('trans-save-btn').addEventListener('click', simpan);
        el('trans-delete-btn').addEventListener('click', hapusBahasa);
    }

    // ---- Aksi -------------------------------------------------------------

    async function simpan() {
        // Guard pelajaran FB18: jangan menulis berkas terjemahan kalau view belum
        // benar-benar memuat chapter ini — "belum termuat" ≠ "memang kosong".
        if (!_activeLang || _loadedChapter !== currentlyEditing.chapter) {
            showNotification('Terjemahan belum termuat untuk chapter ini — buka ulang.', 'error');
            return;
        }
        try {
            const built = buildTranslation(_base, _rows, _inputs);
            const r = await VN.Utils.invokeChecked(ipcRenderer, 'i18n:save-translation', {
                storyTitle: currentlyEditing.novel, chapterName: currentlyEditing.chapter,
                lang: _activeLang, scriptContent: built
            });
            showNotification(r.message, 'success');
            _inputBaseline = inputSnapshot();
            if (!_languages.includes(_activeLang)) {
                _languages.push(_activeLang);
                renderTabs();
            }
            return true;
        } catch (error) {
            showNotification('Gagal menyimpan terjemahan: ' + error.message, 'error');
            return false;
        }
    }

    async function hapusBahasa() {
        if (!_activeLang) return;
        const ok = await showConfirmation(`Hapus terjemahan "${_activeLang}" untuk chapter ini? script.${_activeLang}.json akan dihapus.`);
        if (!ok) return;
        const r = await ipcRenderer.invoke('i18n:delete-translation', {
            storyTitle: currentlyEditing.novel, chapterName: currentlyEditing.chapter, lang: _activeLang
        });
        showNotification(r.message, r.success ? 'success' : 'error');
        if (r.success) {
            _languages = _languages.filter(l => l !== _activeLang);
            _activeLang = _languages[0] || null;
            renderTabs();
            await renderTable();
        }
    }

    // ---- Integrasi workspace ---------------------------------------------

    window.renderTranslationView = renderView;
    window._translationIsDirty = translationIsDirty;
    window.saveTranslationChanges = simpan;
    window.resolveTranslationDraft = resolveTranslationDraft;

    const openBtn = el('open-translation-editor-btn');
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            if (!currentlyEditing.chapter) {
                showNotification('Buka sebuah chapter dulu untuk mengelola terjemahannya.', 'error');
                return;
            }
            switchWorkspaceView('translation');
        });
    }

    const backBtn = el('trans-back-btn');
    if (backBtn) backBtn.addEventListener('click', () => switchWorkspaceView('script'));

    // Tombol hanya bermakna saat ada chapter terbuka — statusnya dibaca dari
    // kenyataan (currentlyEditing.chapter), lewat event yang sudah dipancarkan
    // state.js saat properti itu berubah.
    function syncOpenBtn() {
        if (!openBtn) return;
        openBtn.disabled = !currentlyEditing.chapter;
    }
    if (typeof VN !== 'undefined' && VN.Events) {
        VN.Events.on('editing:chapter', () => {
            syncOpenBtn();
            // Chapter berganti saat view terjemahan terbuka → muat ulang isinya,
            // jangan biarkan menampilkan (dan menyimpan ke) chapter yang salah.
            if (VN.Workspace && VN.Workspace.current === 'translation') renderView();
        });
    }
    syncOpenBtn();

    console.log('[VN TranslationEditor] Module dimuat.');
})();
