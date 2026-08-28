// ============================================================
// HUB CODE EDITOR â€” Lightweight syntax-highlighted code editor
// for editing hub.html & hub.css inline within the VN Manager.
// Uses overlay technique: transparent textarea + highlighted <pre>.
// ============================================================
(function () {
    'use strict';

    // ---------- Mesin editor: DIPAKAI BERSAMA ----------
    // Highlighter, factory instance, dan logika ketikan PINDAH ke
    // vnModules/editor/codeEditorCore.js supaya tab Code panel VN Player memakai
    // mesin yang SAMA. File ini tinggal urusan khas jendela hub code editor:
    // tab berkas, pelacakan dirty, simpan, dan jembatan IPC-nya.
    var Core = window.VNCodeEditorCore;
    if (!Core) {
        console.error('[HubCodeEditor] codeEditorCore.js belum dimuat — editor tidak akan aktif.');
        return;
    }
    var createEditorInstance = Core.createEditorInstance;
    var attach = Core.attach;
    var enhance = Core.enhance;

    // ---------- Main Code Editor Controller ----------

    var htmlEditorInstance = null;
    var cssEditorInstance = null;
    var jsEditorInstance = null;
    var fullEditorInstance = null;
    var activeTab = 'html';
    var _dirty = { html: false, css: false, js: false };

    // B2: mode partial per-scene. Saat novel berbasis partial (hubPartials),
    // editor "html" mengedit hub/scenes/<id>.html, bukan monolith hub.html.
    //   _partialsNovel=false        â†’ mode file (hub.html), perilaku lama.
    //   _partialsNovel=true,_partial=null  â†’ belum pilih scene (editor html = hint).
    //   _partialsNovel=true,_partial={novelTitle,sceneId,label} â†’ edit partial scene itu.
    var _partialsNovel = false;
    var _partial = null;

    var PARTIAL_HINT = '<!-- Pilih sebuah Hub Scene di sidebar kiri untuk mengedit kodenya di sini. -->';

    // Set teks label tab "html" (default "hub.html") tanpa merusak ikon/dot/status.
    function setHtmlTabLabel(text) {
        var container = document.getElementById('hub-code-editor-root');
        var tab = container && container.querySelector('.ce-file-tab[data-file="html"]');
        if (!tab) return;
        for (var i = 0; i < tab.childNodes.length; i++) {
            var n = tab.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue.trim()) { n.nodeValue = ' ' + text + ' '; return; }
        }
    }

    var _initialized = false;


    function init() {
        if (_initialized) return; // Guard: cegah listener duplikat saat dipanggil ulang
        var container = document.getElementById('hub-code-editor-root');
        if (!container) return;
        _initialized = true;

        // Tab switching
        var tabs = container.querySelectorAll('.ce-file-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                switchTab(tab.dataset.file);
            });
        });

        // Create editor instances
        var htmlContainer = container.querySelector('#ce-pane-html');
        var cssContainer = container.querySelector('#ce-pane-css');
        var jsContainer = container.querySelector('#ce-pane-js');
        var fullContainer = container.querySelector('#ce-pane-full');

        if (htmlContainer) htmlEditorInstance = createEditorInstance(htmlContainer, 'html');
        if (cssContainer) cssEditorInstance = createEditorInstance(cssContainer, 'css');
        if (jsContainer) jsEditorInstance = createEditorInstance(jsContainer, 'js');
        if (fullContainer) fullEditorInstance = createEditorInstance(fullContainer, 'html', true);

        // Dirty tracking
        var htmlTextarea = htmlContainer.querySelector('.ce-textarea');
        var cssTextarea = cssContainer.querySelector('.ce-textarea');
        if (htmlTextarea) htmlTextarea.addEventListener('input', function () {
            _dirty.html = true;
            updateTabDirty('html', true);
            debouncePreview();
        });
        if (cssTextarea) cssTextarea.addEventListener('input', function () {
            _dirty.css = true;
            updateTabDirty('css', true);
            debouncePreview();
        });
        var jsTextarea = jsContainer && jsContainer.querySelector('.ce-textarea');
        if (jsTextarea) jsTextarea.addEventListener('input', function () {
            _dirty.js = true;
            updateTabDirty('js', true);
            debouncePreview();
        });

        // Toolbar buttons
        container.querySelector('#ce-save-btn')?.addEventListener('click', saveFiles);
        container.querySelector('#ce-reload-btn')?.addEventListener('click', reloadFiles);

        // Tombol Salin di tab "Full" (komposit read-only) â†’ ke clipboard.
        container.querySelector('#ce-full-copy')?.addEventListener('click', function () {
            var txt = fullEditorInstance ? fullEditorInstance.getValue() : '';
            if (!txt) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(function () {
                    if (typeof showNotification === 'function') showNotification('Kode komposit hub.html disalin.', 'success');
                }).catch(function () {
                    if (typeof showNotification === 'function') showNotification('Gagal menyalin ke clipboard.', 'error');
                });
            }
        });

        // Activate default tab
        switchTab('html');
    }

    function switchTab(tabName) {
        activeTab = tabName;
        var container = document.getElementById('hub-code-editor-root');
        if (!container) return;

        // Tab buttons
        container.querySelectorAll('.ce-file-tab').forEach(function (t) {
            t.classList.toggle('active', t.dataset.file === tabName);
        });

        // Panes: tampilkan hanya #ce-pane-<tabName> (html/css/js/full).
        container.querySelectorAll('.ce-pane').forEach(function (p) {
            p.style.display = (p.id === 'ce-pane-' + tabName) ? 'flex' : 'none';
        });

        // Tab "Full" = pratinjau komposit hub.html (read-only) â†’ muat saat dibuka.
        if (tabName === 'full') loadFullView();
    }

    // Muat hub.html utuh (komposit) ke editor read-only "Full".
    async function loadFullView() {
        var novelTitle = window.currentlyEditingNovel;
        if (!novelTitle || !fullEditorInstance) return;
        var r = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.html' });
        if (r && r.success) fullEditorInstance.setValue(r.content || '');
    }

    function updateTabDirty(file, isDirty) {
        var container = document.getElementById('hub-code-editor-root');
        if (!container) return;
        var tab = container.querySelector('.ce-file-tab[data-file="' + file + '"]');
        if (tab) {
            var dot = tab.querySelector('.ce-dirty-dot');
            if (dot) dot.style.opacity = isDirty ? '1' : '0';
        }
        // Window editor terpisah tidak berbagi heap dengan manager. Kirim state
        // dirty segera (tanpa debounce preview) agar Save All/beforeunload utama
        // tidak punya jendela 600 ms yang menganggap draft masih bersih.
        ipcRenderer.send('hub-code-editor:dirty-state', {
            novelTitle: window.currentlyEditingNovel || '',
            dirty: !!(_dirty.html || _dirty.css || _dirty.js)
        });
    }

    // ---------- Preview ----------

    // Kirim draft HTML+CSS ke window utama (di-debounce) agar #hub-preview-frame
    // menampilkan "Static Draft" dari perubahan yang belum disimpan.
    var _previewTimer = null;
    function debouncePreview() {
        clearTimeout(_previewTimer);
        _previewTimer = setTimeout(function () {
            ipcRenderer.send('hub-code-editor:draft-update', {
                html: htmlEditorInstance ? htmlEditorInstance.getValue() : '',
                css: cssEditorInstance ? cssEditorInstance.getValue() : ''
            });
        }, 600);
    }

    // ---------- File I/O ----------

    async function saveFiles() {
        var novelTitle = window.currentlyEditingNovel;
        if (!novelTitle) return;

        var container = document.getElementById('hub-code-editor-root');
        var statusEl = container?.querySelector('#ce-status');
        if (statusEl) statusEl.textContent = 'Menyimpan...';

        var htmlOk = true;
        var cssOk = true;
        var jsOk = true;
        var savedAny = false;
        // UX-A04: hasil rename yang datang DARI kode, dibawa ke editor utama.
        var sceneRenamed = null;

        // ANTI-CLOBBER editan eksternal (VS Code): HANYA tulis file yang benar-benar
        // diubah di editor in-app (dirty). File yang tak kamu sentuh tidak ditimpa,
        // sehingga editan eksternal pada file itu tetap aman.

        // Layer "html": partial scene aktif atau hub.html monolith (mode lama).
        if (_dirty.html) {
            if (_partialsNovel) {
                if (_partial && _partial.sceneId) {
                    var htmlContent = htmlEditorInstance ? htmlEditorInstance.getValue() : '';
                    var rp = await ipcRenderer.invoke('hub:save-scene-partial', {
                        novelTitle: novelTitle, sceneId: _partial.sceneId, content: htmlContent
                    });
                    if (!rp || !rp.success) {
                        htmlOk = false;
                        // UX-A04: penolakan ID/type membawa penjelasan cara resmi
                        // memperbaikinya. Menelannya jadi "sebagian gagal" saja
                        // membuat kreator menebak-nebak apa yang salah.
                        if (rp && rp.message && typeof showNotification === 'function') {
                            showNotification(rp.message, 'error');
                        }
                    } else {
                        savedAny = true;
                        if (typeof window.refreshSceneNodes === 'function') window.refreshSceneNodes(_partial.sceneId, htmlContent);
                        // Nama scene boleh datang dari kode. Bawa nilai canonical-nya
                        // supaya sidebar/Inspector editor utama ikut menyusul.
                        if (rp.renamed) sceneRenamed = { sceneId: rp.sceneId, name: rp.name };
                    }
                } else if (typeof showNotification === 'function') {
                    showNotification('Pilih sebuah scene di sidebar dulu untuk menyimpan kodenya.', 'info');
                }
            } else {
                var r = await ipcRenderer.invoke('save-hub-custom-file', {
                    novelTitle: novelTitle, filename: 'hub.html', content: htmlEditorInstance ? htmlEditorInstance.getValue() : ''
                });
                if (!r.success) htmlOk = false; else savedAny = true;
            }
        }

        if (_dirty.css) {
            var r2 = await ipcRenderer.invoke('save-hub-custom-file', {
                novelTitle: novelTitle, filename: 'hub.css', content: cssEditorInstance ? cssEditorInstance.getValue() : ''
            });
            if (!r2.success) cssOk = false; else savedAny = true;
        }

        if (_dirty.js) {
            var r3 = await ipcRenderer.invoke('save-hub-custom-file', {
                novelTitle: novelTitle, filename: 'hub.js', content: jsEditorInstance ? jsEditorInstance.getValue() : ''
            });
            if (!r3 || !r3.success) jsOk = false; else savedAny = true;
        }

        if (htmlOk) { _dirty.html = false; updateTabDirty('html', false); }
        if (cssOk)  { _dirty.css = false;  updateTabDirty('css', false);  }
        if (jsOk)   { _dirty.js = false;   updateTabDirty('js', false);   }
        var ok = htmlOk && cssOk && jsOk;

        if (statusEl) {
            statusEl.textContent = !savedAny ? 'â—‹ Tak ada perubahan' : (ok ? 'âœ… Tersimpan!' : 'âŒ Sebagian gagal disimpan');
            setTimeout(function () { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
        if (savedAny && ok && typeof showNotification === 'function') {
            showNotification('Perubahan hub disimpan.', 'success');
        }
        if (savedAny && ok) {
            ipcRenderer.send('hub-code-editor:saved', {
                novelTitle: novelTitle,
                sceneRenamed: sceneRenamed
            });
        }
        return ok;
    }

    // ANTI-CLOBBER: muat ulang dari disk HANYA file yang tidak sedang diedit (clean),
    // agar editan eksternal (VS Code) tercermin tanpa menimpa kerja in-app yang dirty.
    // Mengembalikan true bila ada konten yang berubah.
    async function reloadIfClean() {
        var novelTitle = window.currentlyEditingNovel;
        if (!novelTitle) return false;
        var changed = false;
        if (!_dirty.css && cssEditorInstance) {
            var c = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.css' });
            if (c.success && c.content !== cssEditorInstance.getValue()) { cssEditorInstance.setValue(c.content); changed = true; }
        }
        if (!_dirty.js && jsEditorInstance) {
            var j = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.js' });
            if (j.success && j.content !== jsEditorInstance.getValue()) { jsEditorInstance.setValue(j.content); changed = true; }
        }
        if (!_dirty.html && htmlEditorInstance) {
            if (_partialsNovel && _partial && _partial.sceneId) {
                var rh = await ipcRenderer.invoke('hub:read-scene-partial', { novelTitle: novelTitle, sceneId: _partial.sceneId });
                if (rh && rh.success && (rh.content || '') !== htmlEditorInstance.getValue()) { htmlEditorInstance.setValue(rh.content || ''); changed = true; }
            } else if (!_partialsNovel) {
                var hh = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.html' });
                if (hh.success && hh.content !== htmlEditorInstance.getValue()) { htmlEditorInstance.setValue(hh.content); changed = true; }
            }
        }
        return changed;
    }

    async function reloadFiles() {
        var novelTitle = window.currentlyEditingNovel;
        if (!novelTitle) return;

        var cssResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.css' });
        if (cssEditorInstance && cssResult.success) cssEditorInstance.setValue(cssResult.content);

        var jsResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.js' });
        if (jsEditorInstance && jsResult.success) jsEditorInstance.setValue(jsResult.content);

        var container = document.getElementById('hub-code-editor-root');
        var htmlStat = container?.querySelector('#ce-html-status');
        var cssStat = container?.querySelector('#ce-css-status');

        if (_partialsNovel) {
            // Mode partial: muat ulang partial scene aktif (biarkan hint bila belum pilih).
            if (_partial && _partial.sceneId) {
                var rp = await ipcRenderer.invoke('hub:read-scene-partial', { novelTitle: novelTitle, sceneId: _partial.sceneId });
                if (htmlEditorInstance && rp && rp.success) htmlEditorInstance.setValue(rp.content || '');
                if (htmlStat) htmlStat.textContent = 'âœï¸ ' + (_partial.label || _partial.sceneId);
            }
        } else {
            var htmlResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.html' });
            if (htmlEditorInstance && htmlResult.success) htmlEditorInstance.setValue(htmlResult.content);
            if (htmlStat) htmlStat.textContent = htmlResult.exists ? 'âœ… File ada' : 'âšª Belum dibuat';
        }

        _dirty.html = false;
        _dirty.css = false;
        _dirty.js = false;
        updateTabDirty('html', false);
        updateTabDirty('css', false);
        updateTabDirty('js', false);
        if (cssStat) cssStat.textContent = cssResult.exists ? 'âœ… File ada' : 'âšª Belum dibuat';

        if (typeof showNotification === 'function') {
            showNotification('File hub dimuat ulang dari disk.', 'info');
        }
    }

    // ---------- Mode partial per-scene ----------

    // Novel berbasis partial, belum ada scene dipilih â†’ tampilkan hint di editor html.
    function enterPartialsMode() {
        _partialsNovel = true;
        _partial = null;
        if (htmlEditorInstance) htmlEditorInstance.setValue(PARTIAL_HINT);
        _dirty.html = false; updateTabDirty('html', false);
        setHtmlTabLabel('Scene');
        var container = document.getElementById('hub-code-editor-root');
        var st = container && container.querySelector('#ce-html-status');
        if (st) st.textContent = 'âšª pilih scene';
        switchTab('html');
    }

    // Kembali ke mode file (hub.html) untuk novel non-partial.
    function exitPartialsMode() {
        _partialsNovel = false;
        _partial = null;
        setHtmlTabLabel('hub.html');
    }

    // Muat partial sebuah scene ke editor html (dipanggil saat klik scene di sidebar).
    async function loadScenePartial(novelTitle, sceneId, label) {
        _partialsNovel = true;
        var res = await ipcRenderer.invoke('hub:read-scene-partial', { novelTitle: novelTitle, sceneId: sceneId });
        if (!res || !res.success) {
            if (typeof showNotification === 'function') showNotification('Gagal memuat partial scene.', 'error');
            return false;
        }
        _partial = { novelTitle: novelTitle, sceneId: sceneId, label: label || sceneId };
        if (htmlEditorInstance) htmlEditorInstance.setValue(res.content || '');
        if (typeof window.refreshSceneNodes === 'function') window.refreshSceneNodes(sceneId, res.content || '');
        _dirty.html = false; updateTabDirty('html', false);
        setHtmlTabLabel(label || sceneId);
        var container = document.getElementById('hub-code-editor-root');
        var st = container && container.querySelector('#ce-html-status');
        if (st) st.textContent = res.exists ? 'âœï¸ ' + (label || sceneId) : 'âšª baru';
        switchTab('html');
        return true;
    }

    // ---------- Public API ----------

    window.VNCodeEditor = {
        init: init,
        // Mesin editor yang sama dipakai permukaan lain (tab Code VN Player).
        // Satu highlighter, satu logika ketikan, satu tempat memperbaikinya.
        attach: attach,
        enhance: enhance,
        setContent: function (type, content) {
            if (type === 'html' && htmlEditorInstance) htmlEditorInstance.setValue(content);
            if (type === 'css' && cssEditorInstance) cssEditorInstance.setValue(content);
            if (type === 'js' && jsEditorInstance) jsEditorInstance.setValue(content);
            if (type === 'full' && fullEditorInstance) fullEditorInstance.setValue(content);
        },
        getContent: function (type) {
            if (type === 'html' && htmlEditorInstance) return htmlEditorInstance.getValue();
            if (type === 'css' && cssEditorInstance) return cssEditorInstance.getValue();
            if (type === 'js' && jsEditorInstance) return jsEditorInstance.getValue();
            return '';
        },
        setStatus: function (type, msg) {
            var container = document.getElementById('hub-code-editor-root');
            if (!container) return;
            var el = container.querySelector('#ce-' + type + '-status');
            if (el) el.textContent = msg;
        },
        switchTab: switchTab,
        // Code-first pindah ke tab hub.html lalu lompat ke <section data-scene-id="...">.
        revealSceneSection: function (sceneId) {
            if (!sceneId || !htmlEditorInstance) return false;
            switchTab('html');
            return htmlEditorInstance.revealMatch('data-scene-id="' + sceneId + '"');
        },
        // mode partial per-scene.
        enterPartialsMode: enterPartialsMode,
        exitPartialsMode: exitPartialsMode,
        loadScenePartial: loadScenePartial,
        // Parent/child: load partial scene (bila belum aktif) lalu lompat ke data-node.
        revealNode: async function (novelTitle, sceneId, nodeName, label) {
            if (!_partial || _partial.sceneId !== sceneId) {
                await loadScenePartial(novelTitle, sceneId, label);
            } else {
                switchTab('html');
            }
            if (htmlEditorInstance) return htmlEditorInstance.revealMatch('data-node="' + nodeName + '"');
            return false;
        },
        save: saveFiles,
        reload: reloadFiles,
        reloadIfClean: reloadIfClean,
        isDirty: function () { return _dirty.html || _dirty.css || _dirty.js; },
        destroy: function () {
            _initialized = false;
        }
    };
})();


