// ============================================================
// HUB CODE EDITOR WINDOW — Bootstrap untuk window terpisah
// (vnManager-codeEditor.html). Menerima data init/scene lewat IPC
// dari window utama (relay via main process) dan mengisi VNCodeEditor.
// ============================================================
(function () {
    'use strict';

    // Muat hub.css / hub.js / hub.html (atau partial scene aktif) sesuai
    // konfigurasi novel yang dikirim window utama.
    async function loadHubFiles(data) {
        var novelTitle = data.novelTitle;

        var cssResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.css' });
        if (cssResult.success) {
            window.VNCodeEditor.setContent('css', cssResult.content);
            window.VNCodeEditor.setStatus('css', cssResult.exists ? '✅ File ada' : '⚪ Belum dibuat');
        }

        var jsResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.js' });
        if (jsResult.success) {
            window.VNCodeEditor.setContent('js', jsResult.content);
            window.VNCodeEditor.setStatus('js', jsResult.exists ? '✅ File ada' : '⚪ Belum dibuat');
        }

        if (data.hubPartials === true) {
            window.VNCodeEditor.enterPartialsMode();
            if (data.activeSceneId) {
                if (data.nodeName) {
                    await window.VNCodeEditor.revealNode(novelTitle, data.activeSceneId, data.nodeName, data.activeSceneLabel);
                } else {
                    await window.VNCodeEditor.loadScenePartial(novelTitle, data.activeSceneId, data.activeSceneLabel);
                }
            }
        } else {
            window.VNCodeEditor.exitPartialsMode();
            var htmlResult = await ipcRenderer.invoke('read-hub-custom-file', { novelTitle: novelTitle, filename: 'hub.html' });
            if (htmlResult.success) {
                window.VNCodeEditor.setContent('html', htmlResult.content);
                window.VNCodeEditor.setStatus('html', htmlResult.exists ? '✅ File ada' : '⚪ Belum dibuat');
            }
            if (data.activeSceneId) {
                requestAnimationFrame(function () { window.VNCodeEditor.revealSceneSection(data.activeSceneId); });
            }
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        window.VNCodeEditor.init();
    });

    ipcRenderer.on('hub-code-editor:init', function (e, data) {
        window.currentlyEditingNovel = data.novelTitle;
        window.hubConfig = Object.assign({}, window.hubConfig, { hubPartials: !!data.hubPartials });
        loadHubFiles(data);
    });

    // Window utama mengubah hub.html/hub.css di luar editor (tambah/hapus scene,
    // terapkan template, ganti mode hub) — muat ulang file dari disk.
    ipcRenderer.on('hub-code-editor:reload', function () {
        window.VNCodeEditor.reload();
    });

    // Editor sudah terbuka & klik scene baru di sidebar window utama.
    ipcRenderer.on('hub-code-editor:load-scene', function (e, data) {
        window.currentlyEditingNovel = data.novelTitle;
        if (data.nodeName) {
            window.VNCodeEditor.revealNode(data.novelTitle, data.sceneId, data.nodeName, data.label);
        } else if (window.hubConfig && window.hubConfig.hubPartials === true) {
            window.VNCodeEditor.loadScenePartial(data.novelTitle, data.sceneId, data.label);
        } else {
            window.VNCodeEditor.revealSceneSection(data.sceneId);
        }
    });

    // Cegah window tertutup tanpa peringatan bila ada perubahan belum disimpan.
    // Electron menangkap ini lewat 'will-prevent-unload' di main process.
    window.onbeforeunload = function () {
        if (window.VNCodeEditor && window.VNCodeEditor.isDirty()) {
            return false;
        }
    };

    // === Sinkronisasi editan eksternal (VS Code) ===
    // Saat window ini kembali fokus/terlihat, muat ulang file yang CLEAN dari
    // disk agar editan di VS Code tercermin; file yang masih dirty TIDAK ditimpa.
    (function initExternalEditSync() {
        var _lastSync = 0;
        async function syncExternal() {
            if (!window.currentlyEditingNovel) return;
            if (Date.now() - _lastSync < 400) return;
            _lastSync = Date.now();
            var changed = await window.VNCodeEditor.reloadIfClean();
            if (changed && typeof window.showNotification === 'function') {
                window.showNotification('Perubahan dari VS Code dimuat ke editor.', 'info');
            }
        }
        window.addEventListener('focus', syncExternal);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') syncExternal();
        });
    })();
})();
