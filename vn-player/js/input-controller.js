/**
 * VN Player — Input Controller
 * Handler click, keyboard, auto mode, dan exit transitions.
 */

const VNInput = (() => {
    const { ipcRenderer } = require('electron');
    const { dom, state } = VNState;

    /** Handler utama untuk klik di game container */
    function handleGameContainerClick() {
        VNAudio.ensureAudioContext();

        // Block saat special event aktif
        if (state.isEventBlocking) return;

        clearTimeout(state.autoModeTimeout);

        // Cek transisi keluar
        if (state.pendingExitTransition) {
            const exitTransition = { ...state.pendingExitTransition };
            state.pendingExitTransition = null;

            const renderNextScene = () => {
                ipcRenderer.send('vn-engine:request-next-line');
            };

            // Transisi gabungan: dua fade beruntun dilebur jadi satu animasi sambung.
            // Warna diambil dari NAMA efek pilihan kreator (fade_black → 'black'),
            // bukan lagi hardcode putih→hitam (audit G1). Kombinasi spesifik yang
            // terdaftar di registry (mis. dari extension) tetap menang lebih dulu.
            if (exitTransition.nextEffect &&
                exitTransition.effect.startsWith('fade_') &&
                exitTransition.nextEffect.startsWith('fade_')) {
                const specific = VNRegistry.get('transition',
                    'combined_' + exitTransition.effect + '_to_' + exitTransition.nextEffect);
                if (specific) {
                    specific(renderNextScene, exitTransition.sfx, exitTransition.volume);
                } else if (typeof VNTransitions !== 'undefined' && VNTransitions.runCombinedFade) {
                    VNTransitions.runCombinedFade(
                        exitTransition.effect.slice('fade_'.length),
                        exitTransition.nextEffect.slice('fade_'.length),
                        renderNextScene, exitTransition.sfx, exitTransition.volume);
                } else {
                    // Fallback defensif (transitions.js belum termuat): jalankan
                    // transisi keluar biasa daripada diam.
                    const handler = VNRegistry.get('transition', exitTransition.effect) || VNRegistry.get('transition', 'cut');
                    if (handler) {
                        handler(renderNextScene, exitTransition.sfx, exitTransition.volume, exitTransition.delay, exitTransition.pan, null);
                    }
                }
            } else {
                // Transisi keluar normal
                const handler = VNRegistry.get('transition', exitTransition.effect) || VNRegistry.get('transition', 'cut');
                if (handler) {
                    handler(renderNextScene, exitTransition.sfx, exitTransition.volume, exitTransition.delay, exitTransition.pan, null);
                }
            }
            return;
        }

        // Text screen overlay
        if (dom.textScreenOverlay.style.display === 'flex') {
            // JANGAN sembunyikan overlay di sini (dulu: display='none' langsung).
            // Itu membuka celah flicker: layar di balik overlay (background/
            // sprite) sempat terlihat POLOS tanpa penutup selama round-trip IPC
            // sampai transisi entri berikutnya mulai menutup. renderContent()
            // sudah menyembunyikan overlay ini sendiri, tepat digerbang oleh
            // transisi entri berikutnya — biarkan itu satu-satunya yang
            // menyembunyikan (overlay tetap menutup layar sampai saat itu).
            if (state.isLabelPreviewMode) {
                ipcRenderer.send('vn-engine:preview-label-next');
            } else {
                ipcRenderer.send('vn-engine:request-next-line');
            }
            return;
        }

        // Skip typing
        if (state.isTyping) {
            VNTypewriter.finishTyping();
            return;
        }

        // Default: minta baris berikutnya
        if (state.isLabelPreviewMode) {
            ipcRenderer.send('vn-engine:preview-label-next');
        } else {
            ipcRenderer.send('vn-engine:request-next-line');
        }
    }

    return { handleGameContainerClick };
})();
