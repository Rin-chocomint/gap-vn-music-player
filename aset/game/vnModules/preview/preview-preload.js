// ============================================================
// PREVIEW PRELOAD — Shared preload script for Live Mode webview
// Used by Hub preview and Player preview webviews.
// Peran nyata: ready-signal + forward navigasi hub ke host editor.
// Config TIDAK lewat sini — Player memakai channel langsung
// 'preview:apply-player-config' (init.js), Hub memakai
// 'preview:apply-hub-config' (hubEditor). Bridge generik
// 'preview:apply-config' / 'preview:set-base-path' yang dulu ada di
// sini dihapus karena tak punya pengirim (audit C4).
// ============================================================
(function () {
    'use strict';

    var ipcRenderer;
    try {
        ipcRenderer = require('electron').ipcRenderer;
    } catch (e) {
        console.warn('[PreviewPreload] Electron not available — running in non-electron context.');
        return;
    }

    // ==========================================
    // IPC BRIDGE: webview content ↔ editor host
    // ==========================================

    /**
     * Send message to host editor via sendToHost
     */
    function sendToHost(channel, data) {
        ipcRenderer.sendToHost(channel, data);
    }

    // ==========================================
    // HUB NAVIGATION FORWARD
    // ==========================================
    // Runtime hub (novel-hub.html) memancarkan `vnhub:navigate` tiap pindah layar.
    // Teruskan ke host editor agar bisa menyorot scene yang sedang tampil di
    // hub-scene-list (animasi "scene sedang tampil" saat Live preview).
    // Aman untuk player preview: event ini tak pernah terpancar di sana.
    window.addEventListener('vnhub:navigate', function (e) {
        try { sendToHost('hub:scene-shown', (e && e.detail) || {}); } catch (_) { /* ignore */ }
    });

    // ==========================================
    // READY SIGNAL
    // ==========================================

    document.addEventListener('DOMContentLoaded', function () {
        sendToHost('preview:ready');
    });

    // ==========================================
    // EXPOSE API
    // ==========================================

    window.__previewBridge = {
        sendToHost: sendToHost
    };

})();
