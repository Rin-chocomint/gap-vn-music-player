// ============================================================
// CODE EDITOR CORE — mesin editor kode yang DIPAKAI BERSAMA.
//
// Diekstrak dari hubCodeEditor.js (2026-07-23) karena permukaan kedua muncul:
// tab Code panel VN Player di vnManager.html. hubCodeEditor.js hidup di JENDELA
// TERPISAH, jadi `window.VNCodeEditor` tidak pernah ada di halaman manager —
// menyalin highlighter & logika ketikan ke sana berarti dua mesin yang akan
// menyimpang (highlight beda, perilaku Tab beda, perbaikan hanya kena separuh).
//
// Isinya: highlighter single-pass (HTML/CSS/JS), factory instance editor
// (textarea transparan + layer <pre> ber-highlight + nomor baris), dan logika
// ketikan (indentasi otomatis, pasangan kurung/kutip, Tab blok, Ctrl+/).
//
// Kontrak DOM `.ce-*` dan CSS-nya sengaja satu pemilik — alignment caret
// terhadap layer highlight sangat peka terhadap perbedaan font/line-height.
// ============================================================
(function () {
    'use strict';
    // ---------- Syntax Highlighters ----------

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // PENTING: highlighter memakai SATU pass .replace dengan fungsi classifier.
    // Pendekatan lama (beberapa .replace berurutan) men-scan ulang markup <span>
    // yang baru disisipkan â†’ atribut span (class="hl-...") bocor jadi teks & merusak
    // alignment textareaâ†”highlight. Single-pass menjamin: strip(span) === escaped(code).
    function highlightTag(tag) {
        return tag.replace(
            /(&lt;\/?|\/?&gt;)|(&quot;(?:(?!&quot;)[\s\S])*&quot;|&#39;(?:(?!&#39;)[\s\S])*&#39;)|([a-zA-Z_:][\w:.-]*)(?=\s*=)|([a-zA-Z_:][\w:.-]*)/g,
            function (m, bracket, str, attr, word) {
                if (bracket) return '<span class="hl-bracket">' + bracket + '</span>';
                if (str) return '<span class="hl-string">' + str + '</span>';
                if (attr) return '<span class="hl-attr">' + attr + '</span>';
                if (word) return '<span class="hl-tag">' + word + '</span>';
                return m;
            }
        );
    }

    function highlightHTML(code) {
        var esc = escapeHtml(code);
        return esc.replace(
            /(&lt;!--[\s\S]*?--&gt;)|(&lt;![\s\S]*?&gt;)|(&lt;\/?[a-zA-Z][\w-]*[\s\S]*?&gt;)/g,
            function (m, comment, doctype, tag) {
                if (comment) return '<span class="hl-comment">' + comment + '</span>';
                if (doctype) return '<span class="hl-doctype">' + doctype + '</span>';
                if (tag) return highlightTag(tag);
                return m;
            }
        );
    }

    function highlightCSS(code) {
        var esc = escapeHtml(code);
        return esc.replace(
            /(\/\*[\s\S]*?\*\/)|(&quot;(?:(?!&quot;)[\s\S])*&quot;|&#39;(?:(?!&#39;)[\s\S])*&#39;)|(@[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(!important)|(-?\d+\.?\d*(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch|ex|vmin|vmax)?\b)|([.#][\w-]+)|(::?[\w-]+)|([\w-]+)(?=\s*:)/g,
            function (m, comment, str, atrule, color, important, num, selector, pseudo, prop) {
                if (comment) return '<span class="hl-comment">' + comment + '</span>';
                if (str) return '<span class="hl-string">' + str + '</span>';
                if (atrule) return '<span class="hl-atrule">' + atrule + '</span>';
                if (color) return '<span class="hl-color">' + color + '</span>';
                if (important) return '<span class="hl-important">' + important + '</span>';
                if (num) return '<span class="hl-number">' + num + '</span>';
                if (selector) return '<span class="hl-selector">' + selector + '</span>';
                if (pseudo) return '<span class="hl-pseudo">' + pseudo + '</span>';
                if (prop) return '<span class="hl-property">' + prop + '</span>';
                return m;
            }
        );
    }

    var JS_KEYWORDS = {
        'var': 1, 'let': 1, 'const': 1, 'function': 1, 'return': 1, 'if': 1, 'else': 1,
        'for': 1, 'while': 1, 'do': 1, 'switch': 1, 'case': 1, 'default': 1, 'break': 1,
        'continue': 1, 'new': 1, 'typeof': 1, 'instanceof': 1, 'this': 1, 'null': 1,
        'true': 1, 'false': 1, 'undefined': 1, 'void': 1, 'in': 1, 'of': 1, 'try': 1,
        'catch': 1, 'finally': 1, 'throw': 1, 'class': 1, 'extends': 1, 'super': 1,
        'async': 1, 'await': 1, 'yield': 1, 'delete': 1
    };

    // Single-pass juga (lihat catatan di highlightHTML). String pakai bentuk sederhana
    // (tanpa escaped-quote) â€” cukup untuk highlight ringan & menjaga invarian.
    function highlightJS(code) {
        var esc = escapeHtml(code);
        return esc.replace(
            /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)/g,
            function (m, line, block, str, num, word) {
                if (line) return '<span class="hl-comment">' + line + '</span>';
                if (block) return '<span class="hl-comment">' + block + '</span>';
                if (str) return '<span class="hl-string">' + str + '</span>';
                if (num) return '<span class="hl-number">' + num + '</span>';
                if (word) return JS_KEYWORDS[word] ? '<span class="hl-keyword">' + word + '</span>' : word;
                return m;
            }
        );
    }

    // ---------- Editor Instance Factory ----------

    function createEditorInstance(container, language, readonly) {
        var wrapper = container.querySelector('.ce-editor-wrapper');
        var textarea = container.querySelector('.ce-textarea');
        var highlight = container.querySelector('.ce-highlight code');
        var lineNumbers = container.querySelector('.ce-line-numbers');
        var highlighter = language === 'css' ? highlightCSS : language === 'js' ? highlightJS : highlightHTML;
        if (readonly && textarea) textarea.readOnly = true;

        var _highlightTimer = null;
        function updateHighlight() {
            var code = textarea.value;
            updateLineNumbers(code);
            clearTimeout(_highlightTimer);
            _highlightTimer = setTimeout(function () {
                highlight.innerHTML = highlighter(code) + '\n';
            }, 150);
        }

        function updateLineNumbers(code) {
            var count = (code.match(/\n/g) || []).length + 1;
            var nums = '';
            for (var i = 1; i <= count; i++) {
                nums += i + '\n';
            }
            lineNumbers.textContent = nums;
        }

        function syncScroll() {
            var pre = highlight.parentElement;
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
            lineNumbers.scrollTop = textarea.scrollTop;
        }

        // Input events
        textarea.addEventListener('input', updateHighlight);
        textarea.addEventListener('scroll', syncScroll);

        // ---------- Logika ketikan ----------
        // Semua penyuntingan lewat `sisip()`, BUKAN `textarea.value = ...`.
        // Menulis .value secara langsung MENGHAPUS riwayat undo native â€” dulu itulah
        // yang membuat Ctrl+Z tak berguna sesudah menekan Tab sekali saja.
        // `execCommand('insertText')` memang usang, tapi ia satu-satunya cara menulis
        // ke <textarea> sambil mempertahankan undo stack browser.
        function sisip(teks) {
            var ok = false;
            try { ok = document.execCommand('insertText', false, teks); } catch (e) { ok = false; }
            if (!ok) {
                var s = textarea.selectionStart, en = textarea.selectionEnd, v = textarea.value;
                textarea.value = v.slice(0, s) + teks + v.slice(en);
                textarea.selectionStart = textarea.selectionEnd = s + teks.length;
            }
            updateHighlight();
        }
        function pilih(a, b) { try { textarea.setSelectionRange(a, b); } catch (e) {} }

        var PASANGAN = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
        var PENUTUP = { ')': '(', ']': '[', '}': '{', '"': '"', "'": "'", '`': '`' };
        var TANDA_KOMENTAR = language === 'css' ? ['/* ', ' */'] : language === 'js' ? ['// ', ''] : ['<!-- ', ' -->'];

        function awalBaris(v, pos) { return v.lastIndexOf('\n', pos - 1) + 1; }
        function indentasiBaris(v, pos) {
            var a = awalBaris(v, pos);
            var m = /^[ \t]*/.exec(v.slice(a));
            return m ? m[0] : '';
        }

        textarea.addEventListener('keydown', function (e) {
            if (textarea.readOnly) return; // editor Full read-only: jangan modifikasi
            var v = textarea.value;
            var s = textarea.selectionStart;
            var en = textarea.selectionEnd;
            var adaPilihan = s !== en;

            // --- Tab / Shift+Tab: indentasi BLOK bila memilih lebih dari satu baris ---
            if (e.key === 'Tab') {
                e.preventDefault();
                var multiBaris = adaPilihan && v.slice(s, en).indexOf('\n') >= 0;
                if (!multiBaris && !e.shiftKey) { sisip('  '); return; }

                var a = awalBaris(v, s);
                var b = v.indexOf('\n', en); if (b < 0) b = v.length;
                var blok = v.slice(a, b);
                var baru = e.shiftKey
                    ? blok.split('\n').map(function (l) { return l.replace(/^ {1,2}|^\t/, ''); }).join('\n')
                    : blok.split('\n').map(function (l) { return '  ' + l; }).join('\n');
                pilih(a, b);
                sisip(baru);
                pilih(a, a + baru.length);
                return;
            }

            // --- Enter: pertahankan indentasi, tambah satu tingkat sesudah pembuka ---
            if (e.key === 'Enter' && !e.shiftKey && !adaPilihan) {
                var ind = indentasiBaris(v, s);
                var sebelum = v.slice(awalBaris(v, s), s).replace(/\s+$/, '');
                var charSebelum = sebelum.slice(-1);
                var charSesudah = v.charAt(s);
                var masuk = (charSebelum === '{' || charSebelum === '(' || charSebelum === '[' || charSebelum === '>');
                e.preventDefault();
                if (masuk && PASANGAN[charSebelum] === charSesudah) {
                    // Kursor tepat di antara pasangan â†’ penutup turun sendiri, kursor
                    // mendarat di baris kosong yang sudah ter-indentasi.
                    sisip('\n' + ind + '  \n' + ind);
                    pilih(s + 1 + ind.length + 2, s + 1 + ind.length + 2);
                } else {
                    sisip('\n' + ind + (masuk ? '  ' : ''));
                }
                return;
            }

            // --- Ctrl+/ : komentari / batalkan komentar baris terpilih ---
            if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                var ca = awalBaris(v, s);
                var cb = v.indexOf('\n', en); if (cb < 0) cb = v.length;
                var baris = v.slice(ca, cb).split('\n');
                var semuaTerkomentari = baris.every(function (l) {
                    return !l.trim() || l.trim().indexOf(TANDA_KOMENTAR[0].trim()) === 0;
                });
                var hasilBaris = baris.map(function (l) {
                    if (!l.trim()) return l;
                    if (semuaTerkomentari) {
                        var lepas = l.replace(TANDA_KOMENTAR[0], '');
                        if (TANDA_KOMENTAR[1]) lepas = lepas.replace(new RegExp(TANDA_KOMENTAR[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '');
                        return lepas;
                    }
                    return l.replace(/^([ \t]*)/, '$1' + TANDA_KOMENTAR[0]) + TANDA_KOMENTAR[1];
                }).join('\n');
                pilih(ca, cb);
                sisip(hasilBaris);
                pilih(ca, ca + hasilBaris.length);
                return;
            }

            // --- Mengetik penutup yang SUDAH ada di depan kursor â†’ lewati saja ---
            if (!adaPilihan && PENUTUP[e.key] && v.charAt(s) === e.key) {
                e.preventDefault();
                pilih(s + 1, s + 1);
                return;
            }

            // --- Pasangan otomatis; dengan pilihan aktif ia MEMBUNGKUS, bukan menimpa ---
            if (PASANGAN[e.key]) {
                var penutup = PASANGAN[e.key];
                if (adaPilihan) {
                    e.preventDefault();
                    var isi = v.slice(s, en);
                    sisip(e.key + isi + penutup);
                    pilih(s + 1, s + 1 + isi.length);
                    return;
                }
                // Kutip di tengah kata biasanya memang kutip tunggal (mis. apostrof) â€”
                // jangan paksa pasangannya.
                var kutip = (e.key === '"' || e.key === "'" || e.key === '`');
                if (kutip && /[\w"'`]/.test(v.charAt(s))) return;
                e.preventDefault();
                sisip(e.key + penutup);
                pilih(s + 1, s + 1);
                return;
            }

            // --- Backspace di antara pasangan kosong â†’ hapus keduanya ---
            if (e.key === 'Backspace' && !adaPilihan && s > 0) {
                var kiri = v.charAt(s - 1);
                var kanan = v.charAt(s);
                if (PASANGAN[kiri] && PASANGAN[kiri] === kanan) {
                    e.preventDefault();
                    pilih(s - 1, s + 1);
                    sisip('');
                    return;
                }
            }
        });

        // Initial
        updateHighlight();

        // Lompat ke kemunculan pertama `searchStr`: pilih barisnya & scroll ke sana.
        // Dipakai fitur code-first (Pendekatan A2): klik Hub Scene â†’ fokus section-nya.
        function revealMatch(searchStr) {
            var val = textarea.value;
            var idx = val.indexOf(searchStr);
            if (idx < 0) return false;
            var lineStart = val.lastIndexOf('\n', idx) + 1;
            var lineEnd = val.indexOf('\n', idx);
            if (lineEnd < 0) lineEnd = val.length;
            var lineIndex = (val.substring(0, idx).match(/\n/g) || []).length;
            var lh = parseFloat(getComputedStyle(textarea).lineHeight);
            if (!lh || isNaN(lh)) lh = (parseFloat(getComputedStyle(textarea).fontSize) || 13) * 1.5;
            textarea.focus();
            try { textarea.setSelectionRange(lineStart, lineEnd); } catch (e) {}
            // Posisikan baris ~2 baris dari atas untuk konteks.
            textarea.scrollTop = Math.max(0, (lineIndex - 2) * lh);
            syncScroll();
            return true;
        }

        return {
            getValue: function () { return textarea.value; },
            setValue: function (content) {
                textarea.value = content;
                updateHighlight();
                textarea.scrollTop = 0;
            },
            focus: function () { textarea.focus(); },
            revealMatch: revealMatch,
            getTextarea: function () { return textarea; },
            // Dipanggil setelah kode pemanggil menulis `textarea.value` langsung â€”
            // highlight & nomor baris tidak tahu-menahu soal penulisan itu.
            refresh: updateHighlight,
            setLanguage: function (lang) {
                highlighter = lang === 'css' ? highlightCSS : lang === 'js' ? highlightJS : highlightHTML;
                language = lang;
                TANDA_KOMENTAR = lang === 'css' ? ['/* ', ' */'] : lang === 'js' ? ['// ', ''] : ['<!-- ', ' -->'];
                updateHighlight();
            }
        };
    }

    // Bangun markup `.ce-*` lalu pasang instance di atasnya. Dipakai permukaan yang
    // TIDAK memakai HTML jendela hub code editor â€” mis. tab Code panel VN Player.
    // Markup dibuat di sini (bukan disalin ke HTML lain) supaya kontrak antara
    // struktur DOM dan CSS `.ce-*` (alignment textareaâ†”highlight yang rewel itu)
    // tetap punya satu pemilik.
    function attach(host, language, opts) {
        if (!host) return null;
        var o = opts || {};
        host.innerHTML =
            '<div class="ce-editor-wrapper">' +
            '<div class="ce-line-numbers"></div>' +
            '<textarea class="ce-textarea" spellcheck="false" autocomplete="off" autocapitalize="off"' +
            (o.placeholder ? ' placeholder="' + String(o.placeholder).replace(/"/g, '&quot;') + '"' : '') +
            '></textarea>' +
            '<pre class="ce-highlight" aria-hidden="true"><code></code></pre>' +
            '</div>';
        return createEditorInstance(host, language, !!o.readonly);
    }

    // Naikkan <textarea> YANG SUDAH ADA jadi editor ber-highlight, tanpa menggantinya.
    // Sengaja begini (bukan membangun ulang markup) supaya kode pemanggil yang sudah
    // membaca/menulis `textarea.value` dan mendengar event `input` tetap bekerja apa
    // adanya â€” penyempurnaan tampilan tidak boleh memaksa penulisan ulang logikanya.
    function enhance(textarea, language, opts) {
        if (!textarea || textarea.dataset.ceEnhanced === '1') return null;
        var induk = textarea.parentNode;
        if (!induk) return null;

        var wrapper = document.createElement('div');
        wrapper.className = 'ce-editor-wrapper';
        induk.insertBefore(wrapper, textarea);

        var nomor = document.createElement('div');
        nomor.className = 'ce-line-numbers';
        var pre = document.createElement('pre');
        pre.className = 'ce-highlight';
        pre.setAttribute('aria-hidden', 'true');
        pre.innerHTML = '<code></code>';

        wrapper.appendChild(nomor);
        wrapper.appendChild(textarea);       // dipindah, BUKAN dibuat ulang
        wrapper.appendChild(pre);
        textarea.classList.add('ce-textarea');
        textarea.setAttribute('spellcheck', 'false');
        textarea.dataset.ceEnhanced = '1';

        // `createEditorInstance` mencari elemen di DALAM container yang diberikan;
        // wrapper sendiri sudah memenuhi syarat itu.
        return createEditorInstance(wrapper, language, !!(opts && opts.readonly));
    }

    window.VNCodeEditorCore = {
        highlightHTML: highlightHTML,
        highlightCSS: highlightCSS,
        highlightJS: highlightJS,
        escapeHtml: escapeHtml,
        createEditorInstance: createEditorInstance,
        attach: attach,
        enhance: enhance
    };
})();

