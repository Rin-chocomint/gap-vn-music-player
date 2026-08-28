/**
 * hub-bridge-commands.js — Command bawaan STORY → HUB.
 *
 * Mendaftarkan custom command `set_hub_flag` ke VNRegistry sehingga script.json
 * bisa menulis flag persisten per-novel yang nanti dibaca Hub lewat
 * `VNHub.getStoryFlags()`. Ini jembatan resmi agar Hub "sadar" hasil cerita
 * (jalur yang dipilih, babak selesai, dst.) — bukan sekadar "chapter selesai".
 *
 * Pemakaian di script.json:
 *   { "type": "custom", "command": "set_hub_flag",
 *     "params": "{\"key\":\"favored\",\"value\":\"natsuki\"}" }
 *
 * `params` boleh berupa JSON string atau objek { key, value }.
 */
(function () {
    if (typeof VNRegistry === 'undefined' || !VNRegistry.register) return;

    VNRegistry.register('command', 'set_hub_flag', function (data, vnapi) {
        var ipc = vnapi && (vnapi.ipc || vnapi.ipcRenderer);
        var title = vnapi && vnapi.state && vnapi.state.storyTitle;
        var advance = function () { if (ipc) ipc.send('vn-engine:request-next-line'); };

        var key, value;
        try {
            var p = data.params;
            if (typeof p === 'string') p = JSON.parse(p);
            p = p || {};
            key = p.key;
            value = p.value;
        } catch (e) {
            console.warn('[HubBridge] params set_hub_flag tidak valid (harus JSON {key,value}):', data.params);
        }

        if (ipc && ipc.invoke && title && key != null) {
            ipc.invoke('vn-hub:set-story-flag', { novelTitle: title, key: key, value: value })
                .catch(function (e) { console.error('[HubBridge] set-story-flag gagal:', e); })
                .finally(advance);
        } else {
            console.warn('[HubBridge] set_hub_flag dilewati (ipc/title/key tidak lengkap).');
            advance();
        }
    }, { description: 'Tulis flag persisten yang dibaca Hub (VNHub.getStoryFlags()).', category: 'hub-bridge' });

    /**
     * Command bawaan `unlock_achievement` — buka achievement dari script.
     * Pemakaian di script.json:
     *   { "type": "custom", "command": "unlock_achievement",
     *     "params": "{\"id\":\"ending_true\"}" }
     * Definisi achievement dikelola di <novel>/achievements.json (tab
     * Novel → Achievements di editor); unlock baru memunculkan toast.
     */
    VNRegistry.register('command', 'unlock_achievement', function (data, vnapi) {
        var ipc = vnapi && (vnapi.ipc || vnapi.ipcRenderer);
        var title = vnapi && vnapi.state && vnapi.state.storyTitle;
        var advance = function () { if (ipc) ipc.send('vn-engine:request-next-line'); };

        var id;
        try {
            var p = data.params;
            if (typeof p === 'string') p = JSON.parse(p);
            id = p && p.id;
        } catch (e) {
            console.warn('[HubBridge] params unlock_achievement tidak valid (harus JSON {id}):', data.params);
        }

        if (ipc && ipc.invoke && title && id) {
            ipc.invoke('achievements:unlock', { novelTitle: title, id: id })
                .then(function (res) {
                    if (res && res.success && res.newlyUnlocked &&
                        typeof VNState !== 'undefined' && typeof VNState.showToast === 'function') {
                        var label = (res.def && res.def.title) || id;
                        VNState.showToast('🏆 Achievement: ' + label, 'success');
                    }
                })
                .catch(function (e) { console.error('[HubBridge] achievements:unlock gagal:', e); })
                .finally(advance);
        } else {
            console.warn('[HubBridge] unlock_achievement dilewati (ipc/title/id tidak lengkap).');
            advance();
        }
    }, { description: 'Buka achievement (definisi di achievements.json; toast 🏆 saat unlock baru).', category: 'hub-bridge' });
})();
