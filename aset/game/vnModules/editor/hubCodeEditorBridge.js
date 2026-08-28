// ============================================================
// HUB CODE EDITOR BRIDGE — berjalan di window utama (vnManager.html).
// Menjembatani window Hub Code Editor (terpisah) dengan preview utama
// (#hub-preview-frame): render "Static Draft" dari draft yang diketik,
// dan refresh preview runtime setelah file disimpan.
// ============================================================
(function () {
    'use strict';

    var draftFrame = null;

    // Kanvas acuan mengikuti target viewport novel (disiarkan
    // `novelViewportEditor.js`). Novel yang tak menyebutnya tetap 1920×1080.
    function kanvasAcuan() {
        var tv = window.VN_TARGET_VIEWPORT;
        var w = tv && Number(tv.width);
        var h = tv && Number(tv.height);
        if (!w || !h || w <= 0 || h <= 0) return { w: 1920, h: 1080 };
        return { w: w, h: h };
    }

    function rescaleDraft() {
        if (!draftFrame || !draftFrame.parentElement) return;
        var viewport = draftFrame.parentElement;
        var acuan = kanvasAcuan();
        var scale = Math.min(viewport.clientWidth / acuan.w, viewport.clientHeight / acuan.h);
        draftFrame.style.transform = 'scale(' + scale + ')';
    }

    function renderDraftPreview(html, css) {
        var viewport = document.querySelector('#hub-preview-frame .pf-viewport');
        if (!viewport) return;
        var infoBar = '<div style="position:fixed;bottom:0;left:0;right:0;padding:8px 12px;background:rgba(0,0,0,.9);color:#ddd;font:12px sans-serif;z-index:9999;border-top:1px solid #555;">Static Draft - tampilan kode belum disimpan, tanpa integrasi runtime VNHub.</div>';
        var doc = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#131827;color:#fff;font-family:sans-serif;padding-bottom:34px;}' +
            (css || '') + '</style></head><body>' + (html || '') + infoBar + '</body></html>';
        if (!draftFrame) {
            draftFrame = document.createElement('iframe');
            draftFrame.className = 'pf-preview-element ce-shared-draft-preview';
            draftFrame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
            draftFrame.title = 'Static Draft Hub Preview';
            viewport.querySelectorAll('.pf-preview-element').forEach(function (el) { el.style.display = 'none'; });
            viewport.appendChild(draftFrame);
        }
        draftFrame.srcdoc = doc;
        draftFrame.onload = rescaleDraft;
        var badge = document.querySelector('#hub-preview-frame .pf-mode-badge');
        if (badge) badge.textContent = 'Static Draft';
        rescaleDraft();
    }

    function closeDraftPreview() {
        if (draftFrame) {
            draftFrame.remove();
            draftFrame = null;
        }
        var viewport = document.querySelector('#hub-preview-frame .pf-viewport');
        if (viewport) viewport.querySelectorAll('.pf-preview-element').forEach(function (el) { el.style.display = ''; });
        var badge = document.querySelector('#hub-preview-frame .pf-mode-badge');
        if (badge) badge.textContent = 'Live';
    }

    function setAdvancedNavActive(active) {
        document.querySelectorAll('.hub-nav-btn[data-hub-target="advanced"]').forEach(function (b) {
            b.classList.toggle('active', !!active);
        });
    }

    function setHubCodeDirty(dirty) {
        if (window.VN && VN.Documents && typeof VN.Documents.setDirty === 'function') {
            VN.Documents.setDirty('hub-code', !!dirty);
        }
    }

    ipcRenderer.on('hub-code-editor:draft-update', function (e, data) {
        renderDraftPreview(data && data.html, data && data.css);
    });

    ipcRenderer.on('hub-code-editor:dirty-state', function (e, data) {
        setHubCodeDirty(data && data.dirty);
    });

    ipcRenderer.on('hub-code-editor:saved', function (e, data) {
        setHubCodeDirty(false);
        closeDraftPreview();

        // UX-A04 — nama scene dua arah. Kreator yang mengubah `data-scene-name`
        // di kode dulu tidak melihat apa pun berubah di editor, dan namanya justru
        // ditimpa balik pada Save Hub berikutnya. Sekarang backend mengirim nilai
        // canonical hasil commit, dan sidebar/Inspector menyusul di sini.
        var rename = data && data.sceneRenamed;
        if (rename && rename.sceneId && window.hubConfig && Array.isArray(window.hubConfig.scenes)) {
            // Penjaga target: jawaban untuk novel lain tak boleh menyentuh yang aktif.
            var novelCocok = !data.novelTitle || data.novelTitle === window.currentlyEditingNovel;
            if (novelCocok) {
                var scene = window.hubConfig.scenes.filter(function (s) {
                    return s && s.id === rename.sceneId;
                })[0];
                if (scene && scene.name !== rename.name) {
                    scene.name = rename.name;
                    if (typeof window.renderHubSceneList === 'function') window.renderHubSceneList();
                    if (window.activeHubSceneId === rename.sceneId &&
                        window.VNInspector && typeof VNInspector.showHubScene === 'function') {
                        VNInspector.showHubScene(rename.sceneId);
                    }
                    if (window.VN && VN.Toast) {
                        VN.Toast.info('Nama scene dari kode diterapkan: "' + rename.name + '".');
                    }
                }
            }
        }

        if (typeof window.destroyHubPreview === 'function') window.destroyHubPreview();
        if (typeof window.initHubPreview === 'function') window.initHubPreview();
    });

    ipcRenderer.on('hub-code-editor:opened', function () {
        window.__hubCodeEditorOpen = true;
        setHubCodeDirty(false);
        setAdvancedNavActive(true);
    });

    ipcRenderer.on('hub-code-editor:closed', function () {
        window.__hubCodeEditorOpen = false;
        setHubCodeDirty(false);
        closeDraftPreview();
        setAdvancedNavActive(false);
    });
})();
