/**
 * VN Player — Typewriter
 * Efek ketik per-karakter, auto-continue logic, dan TEXT TAG inline (2026-07-10,
 * findings §5 — sintaks milik Rin.js sendiri, TIDAK meniru {w} Ren'Py karena
 * kurung kurawal sudah dipakai interpolasi {namaVariabel}).
 *
 * Sintaks tag (kurung siku):
 *   [w]           jeda menunggu klik di tengah baris
 *   [w=0.5]       jeda otomatis N detik
 *   [nw]          no-wait: baris selesai → otomatis lanjut ke entri berikutnya
 *   [cps=30]      ubah kecepatan ketik (karakter per detik) mulai titik ini
 *   [/cps]        kembali ke kecepatan pengaturan pemain
 *   [i]..[/i] [b]..[/b] [s]..[/s] [u]..[/u]      gaya teks
 *   [color=#f00]..[/color]                        warna teks
 *   [size=28] / [size=+6] / [size=-4] ..[/size]   ukuran teks
 *   [[            kurung siku literal '['
 *
 * Keamanan: rendering membangun DOM via createElement/createTextNode — nilai
 * variabel hasil interpolasi {var} tetap teks polos, tag tak dikenal ditampilkan
 * apa adanya (supaya typo tag langsung kelihatan, konsisten dengan filosofi
 * interpolateVars di core).
 */

const VNTypewriter = (() => {
    const { ipcRenderer } = require('electron');
    const { dom, state } = VNState;

    const STYLE_TAGS = { i: 'i', b: 'b', s: 's', u: 'u' };

    /**
     * Tokenisasi teks bertag → array token:
     *   { ch }                       — satu karakter teks
     *   { tag: 'w', arg }            — kontrol (w/nw/cps)
     *   { open: 'i'|'b'|..., arg }   — buka gaya
     *   { close: 'i'|'b'|... }       — tutup gaya
     * Tag tak dikenal TIDAK dianggap tag — karakternya dikembalikan sebagai teks.
     */
    function tokenize(text) {
        const tokens = [];
        const src = String(text || '');
        let i = 0;
        while (i < src.length) {
            const c = src[i];
            if (c === '[') {
                if (src[i + 1] === '[') { tokens.push({ ch: '[' }); i += 2; continue; }
                const end = src.indexOf(']', i);
                if (end > i) {
                    const body = src.slice(i + 1, end);
                    const m = body.match(/^(\/?)([a-z]+)(?:=([^\]]*))?$/);
                    if (m) {
                        const closing = m[1] === '/', name = m[2], arg = m[3];
                        if (!closing && (name === 'w' || name === 'nw')) {
                            tokens.push({ tag: name, arg }); i = end + 1; continue;
                        }
                        if (name === 'cps') {
                            tokens.push({ tag: closing ? '/cps' : 'cps', arg }); i = end + 1; continue;
                        }
                        if (STYLE_TAGS[name] || name === 'color' || name === 'size') {
                            tokens.push(closing ? { close: name } : { open: name, arg });
                            i = end + 1; continue;
                        }
                    }
                }
                // bukan tag valid → tampilkan literal
                tokens.push({ ch: '[' }); i++; continue;
            }
            tokens.push({ ch: c }); i++;
        }
        return tokens;
    }

    /** Teks polos tanpa tag (untuk pengecekan kosong, aksesibilitas, dsb.). */
    function stripTags(text) {
        return tokenize(text).filter(t => t.ch !== undefined).map(t => t.ch).join('');
    }

    // Bangun elemen gaya untuk token {open}
    function makeStyleNode(tok) {
        if (STYLE_TAGS[tok.open]) return document.createElement(STYLE_TAGS[tok.open]);
        const span = document.createElement('span');
        if (tok.open === 'color' && tok.arg) span.style.color = tok.arg;
        if (tok.open === 'size' && tok.arg) {
            const a = String(tok.arg);
            span.style.fontSize = (a[0] === '+' || a[0] === '-')
                ? `calc(1em + ${parseFloat(a)}px)` : `${parseFloat(a)}px`;
        }
        return span;
    }

    // ---- state internal sesi ketik ----
    let _tokens = [];
    let _pos = 0;               // posisi token berikutnya
    let _element = null;
    let _parent = null;         // node target append saat ini (nesting gaya)
    let _stack = [];            // stack node gaya
    let _cpsOverride = null;    // dari [cps=]; null = pakai TYPE_SPEED pengaturan
    let _noWait = false;        // dari [nw]
    let _waitingClick = false;  // sedang berhenti di [w]

    function _delayMs() {
        if (_cpsOverride && _cpsOverride > 0) return Math.max(4, 1000 / _cpsOverride);
        return Math.max(10, state.TYPE_SPEED);
    }

    function _renderToken(tok) {
        if (tok.ch !== undefined) {
            _parent.appendChild(document.createTextNode(tok.ch));
            return;
        }
        if (tok.open) {
            const node = makeStyleNode(tok);
            _parent.appendChild(node);
            _stack.push(_parent);
            _parent = node;
            return;
        }
        if (tok.close) {
            _parent = _stack.pop() || _element;
            return;
        }
        if (tok.tag === 'cps') { _cpsOverride = parseFloat(tok.arg) || null; return; }
        if (tok.tag === '/cps') { _cpsOverride = null; return; }
        if (tok.tag === 'nw') { _noWait = true; return; }
        // [w] / [w=n] ditangani loop type()
    }

    /**
     * Tampilkan teks dengan efek ketik + dukungan tag.
     */
    function typeWriter(text, element) {
        clearTimeout(state.typewriterTimeout);
        state.isTyping = true;
        state.currentFullText = stripTags(text);
        _tokens = tokenize(text);
        _pos = 0;
        _element = element;
        _parent = element;
        _stack = [];
        _cpsOverride = null;
        _noWait = false;
        _waitingClick = false;
        element.textContent = '';
        element.classList.add('typing');

        const type = () => {
            if (!state.isTyping) return;
            if (_pos >= _tokens.length) { finishTyping(); return; }
            const tok = _tokens[_pos];
            // tag jeda: berhenti SEBELUM konsumsi supaya resume mulus
            if (tok.tag === 'w') {
                _pos++;
                if (tok.arg !== undefined && tok.arg !== '') {
                    const sec = parseFloat(tok.arg) || 0;
                    state.typewriterTimeout = setTimeout(type, sec * 1000);
                    return;
                }
                // [w] tanpa argumen: tunggu klik (input-controller → finishTyping → resume)
                _waitingClick = true;
                if (state.isAutoMode) {
                    state.typewriterTimeout = setTimeout(() => {
                        if (_waitingClick) { _waitingClick = false; type(); }
                    }, Math.max(100, state.AUTO_MODE_DELAY));
                }
                return;
            }
            _renderToken(tok);
            _pos++;
            state.typewriterTimeout = setTimeout(type, tok.ch !== undefined ? _delayMs() : 0);
        };
        type();
    }

    // Render sisa token sekaligus (tanpa jeda) — dipakai finishTyping.
    function _renderRemaining() {
        while (_pos < _tokens.length) {
            const tok = _tokens[_pos];
            if (tok.tag !== 'w') _renderToken(tok);
            _pos++;
        }
    }

    /**
     * Klik saat mengetik:
     *  - sedang berhenti di [w]  → lanjutkan ketikan (resume), BUKAN skip semua
     *  - sedang mengetik biasa   → selesaikan seluruh baris seketika
     * Saat selesai penuh: jadwalkan auto-continue (auto mode) / langsung lanjut ([nw]).
     */
    function finishTyping() {
        clearTimeout(state.typewriterTimeout);

        if (_waitingClick && state.isTyping) {
            // resume dari [w]
            _waitingClick = false;
            const resume = () => {
                if (!state.isTyping) return;
                if (_pos >= _tokens.length) { finishTyping(); return; }
                const tok = _tokens[_pos];
                if (tok.tag === 'w') {
                    _pos++;
                    if (tok.arg !== undefined && tok.arg !== '') {
                        state.typewriterTimeout = setTimeout(resume, (parseFloat(tok.arg) || 0) * 1000);
                        return;
                    }
                    _waitingClick = true;
                    if (state.isAutoMode) {
                        state.typewriterTimeout = setTimeout(() => {
                            if (_waitingClick) { _waitingClick = false; resume(); }
                        }, Math.max(100, state.AUTO_MODE_DELAY));
                    }
                    return;
                }
                _renderToken(tok);
                _pos++;
                state.typewriterTimeout = setTimeout(resume, tok.ch !== undefined ? _delayMs() : 0);
            };
            resume();
            return;
        }

        state.isTyping = false;
        _waitingClick = false;
        if (_element && _tokens.length) {
            _renderRemaining();
        } else if (dom.dialogueText && state.currentFullText !== undefined && !_tokens.length) {
            // fallback jalur lama (typeWriter belum pernah dipanggil sesi ini)
            dom.dialogueText.textContent = state.currentFullText;
        }
        dom.dialogueText.classList.remove('typing');

        const choicesVisible = dom.makeChoiceContainer.classList.contains('visible');
        if (_noWait && !choicesVisible) {
            // [nw]: langsung lanjut tanpa menunggu klik/auto
            _noWait = false;
            setTimeout(() => {
                if (state.isLabelPreviewMode) {
                    ipcRenderer.send('vn-engine:preview-label-next');
                } else {
                    ipcRenderer.send('vn-engine:request-next-line');
                }
            }, 60);
            return;
        }

        if (state.isAutoMode) {
            if (!choicesVisible) {
                state.autoModeTimeout = setTimeout(() => {
                    if (state.isLabelPreviewMode) {
                        ipcRenderer.send('vn-engine:preview-label-next');
                    } else {
                        ipcRenderer.send('vn-engine:request-next-line');
                    }
                }, Math.max(100, state.AUTO_MODE_DELAY));
            }
        }
    }

    return { typeWriter, finishTyping, stripTags, tokenize };
})();
