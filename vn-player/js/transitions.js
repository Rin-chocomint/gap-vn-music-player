/**
 * VN Player — Transitions
 * Built-in transition handlers yang didaftarkan ke VNRegistry.
 * Semua transisi menggunakan VNState.dynamicStyles untuk @keyframes dynamic.
 */

(() => {
    const { dom, state, dynamicStyles } = VNState;

    // === CUT ===
    VNRegistry.register('transition', 'cut', (renderCallback, sfx, volume, delay, pan, data, completionCallback) => {
        VNAudio.playSFX(sfx, volume, delay, pan);
        renderCallback(false);
        if (completionCallback) completionCallback();
    });

    // === INTERNAL FADE ===
    function _fade(renderCallback, sfx, volume, delay, pan, color, data, completionCallback) {
        VNAudio.playSFX(sfx, volume, delay, pan);

        const isActive = dom.transitionOverlay.style.animation !== '' || parseFloat(window.getComputedStyle(dom.transitionOverlay).opacity) > 0;
        if (data && data.isChainedTransition && isActive) {
            renderCallback(true);
            if (completionCallback) completionCallback();
            return;
        }

        const animName = `standardFade_${color}`;
        const totalDuration = state.transitionDuration * 2;

        if (!dynamicStyles.innerHTML.includes(`@keyframes ${animName}`)) {
            dynamicStyles.innerHTML += `
                @keyframes ${animName} {
                    0%   { opacity: 0; background-color: ${color}; }
                    50%  { opacity: 1; background-color: ${color}; }
                    100% { opacity: 0; background-color: ${color}; }
                }`;
        }

        const midpoint = totalDuration / 2;
        setTimeout(() => renderCallback(true), midpoint);
        setTimeout(() => {
            dom.transitionOverlay.style.animation = '';
            dom.transitionOverlay.style.opacity = '0';
            dom.transitionOverlay.style.backgroundColor = '';
            if (completionCallback) completionCallback();
        }, totalDuration);

        dom.transitionOverlay.style.opacity = '1';
        dom.transitionOverlay.style.backgroundColor = color;
        dom.transitionOverlay.style.animation = `${animName} ${totalDuration}ms ease-in-out forwards`;
    }

    // === FADE BLACK / FADE WHITE ===
    VNRegistry.register('transition', 'fade_black', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _fade(renderCb, sfx, vol, delay, pan, 'black', data, doneCb);
    });

    VNRegistry.register('transition', 'fade_white', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _fade(renderCb, sfx, vol, delay, pan, 'white', data, doneCb);
    });

    // === SWIPE BLACK LEFT ===
    VNRegistry.register('transition', 'swipe_black_left', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        VNAudio.playSFX(sfx, vol, delay, pan);
        const duration = state.transitionDuration;
        dom.transitionOverlay.style.backgroundColor = 'black';

        if (!dynamicStyles.innerHTML.includes('@keyframes slideInFromRight')) {
            dynamicStyles.innerHTML += `
                @keyframes slideInFromRight { from { transform: translateX(100%); opacity: 1; } to { transform: translateX(0); opacity: 1; } }
                @keyframes slideOutToLeft { from { transform: translateX(0); opacity: 1; } to { transform: translateX(-100%); opacity: 1; } }`;
        }

        dom.transitionOverlay.style.opacity = '1';
        dom.transitionOverlay.style.animation = `slideInFromRight ${duration}ms ease-out forwards`;

        setTimeout(() => {
            renderCb(true);
            dom.transitionOverlay.style.animation = `slideOutToLeft ${duration}ms ease-in forwards`;
            setTimeout(() => {
                dom.transitionOverlay.style.animation = '';
                dom.transitionOverlay.style.transform = '';
                dom.transitionOverlay.style.opacity = '0';
                dom.transitionOverlay.style.backgroundColor = '';
                if (doneCb) doneCb();
            }, duration);
        }, duration);
    });

    // === SWIPE BLACK RIGHT ===
    VNRegistry.register('transition', 'swipe_black_right', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        VNAudio.playSFX(sfx, vol, delay, pan);
        const duration = state.transitionDuration;
        dom.transitionOverlay.style.backgroundColor = 'black';

        if (!dynamicStyles.innerHTML.includes('@keyframes slideInFromLeft')) {
            dynamicStyles.innerHTML += `
                @keyframes slideInFromLeft { from { transform: translateX(-100%); opacity: 1; } to { transform: translateX(0); opacity: 1; } }
                @keyframes slideOutToRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 1; } }`;
        }

        dom.transitionOverlay.style.opacity = '1';
        dom.transitionOverlay.style.animation = `slideInFromLeft ${duration}ms ease-out forwards`;

        setTimeout(() => {
            renderCb(true);
            dom.transitionOverlay.style.animation = `slideOutToRight ${duration}ms ease-in forwards`;
            setTimeout(() => {
                dom.transitionOverlay.style.animation = '';
                dom.transitionOverlay.style.transform = '';
                dom.transitionOverlay.style.opacity = '0';
                dom.transitionOverlay.style.backgroundColor = '';
                if (doneCb) doneCb();
            }, duration);
        }, duration);
    });

    // === ALIASES (backward compat) ===
    VNRegistry.register('transition', 'slide_left', (...args) => {
        VNRegistry.get('transition', 'swipe_black_left')(...args);
    });
    VNRegistry.register('transition', 'slide_right', (...args) => {
        VNRegistry.get('transition', 'swipe_black_right')(...args);
    });

    // === PUNCH / FLASH (2026-07-10, findings §3 — pustaka efek per-entry) ===
    // Goncangan layar & kilatan: render konten SEGERA lalu mainkan efek di atasnya.
    // Kompatibel dengan `transitionDuration` per-entry (via state.transitionDuration).
    function _shake(axis, renderCb, sfx, vol, delay, pan, doneCb) {
        VNAudio.playSFX(sfx, vol, delay, pan);
        renderCb(false);
        const dur = Math.min(600, Math.max(150, state.transitionDuration * 0.6));
        const animName = axis === 'x' ? 'vnPunchX' : 'vnPunchY';
        if (!dynamicStyles.innerHTML.includes(`@keyframes ${animName}`)) {
            const t = axis === 'x' ? 'translateX' : 'translateY';
            dynamicStyles.innerHTML += `
                @keyframes ${animName} {
                    0%,100% { transform: ${t}(0); }
                    20% { transform: ${t}(-14px); }
                    40% { transform: ${t}(12px); }
                    60% { transform: ${t}(-8px); }
                    80% { transform: ${t}(5px); }
                }`;
        }
        const target = document.body;
        target.style.animation = '';
        void target.offsetWidth; // restart animasi
        target.style.animation = `${animName} ${dur}ms linear`;
        setTimeout(() => {
            target.style.animation = '';
            if (doneCb) doneCb();
        }, dur + 20);
    }
    VNRegistry.register('transition', 'hpunch', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _shake('x', renderCb, sfx, vol, delay, pan, doneCb);
    });
    VNRegistry.register('transition', 'vpunch', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _shake('y', renderCb, sfx, vol, delay, pan, doneCb);
    });

    function _flash(color, renderCb, sfx, vol, delay, pan, doneCb) {
        VNAudio.playSFX(sfx, vol, delay, pan);
        renderCb(false);
        const dur = Math.min(800, Math.max(120, state.transitionDuration * 0.5));
        dom.transitionOverlay.style.backgroundColor = color;
        dom.transitionOverlay.style.opacity = '1';
        dom.transitionOverlay.style.transition = `opacity ${dur}ms ease-out`;
        requestAnimationFrame(() => { dom.transitionOverlay.style.opacity = '0'; });
        setTimeout(() => {
            dom.transitionOverlay.style.transition = '';
            dom.transitionOverlay.style.backgroundColor = '';
            if (doneCb) doneCb();
        }, dur + 30);
    }
    VNRegistry.register('transition', 'flash_white', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _flash('white', renderCb, sfx, vol, delay, pan, doneCb);
    });
    VNRegistry.register('transition', 'flash_black', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        _flash('black', renderCb, sfx, vol, delay, pan, doneCb);
    });

    // === COMBINED FADE WHITE TO SLIDE RIGHT ===
    // Urutan parameter mengikuti kontrak standar handler transisi
    // (renderCb, sfx, vol, delay, pan, data, doneCb) — dulu doneCb ada di posisi
    // ke-6 sehingga menerima `data` dari init.js dan melempar TypeError saat
    // dipakai sebagai transisi masuk (ditemukan saat membuka dropdown F7).
    VNRegistry.register('transition', 'combined_fade_white_to_slide_right', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        VNAudio.playSFX(sfx, vol, delay, pan);
        const duration = state.transitionDuration * 1.5;

        if (!dynamicStyles.innerHTML.includes('@keyframes whiteToSlideRight')) {
            dynamicStyles.innerHTML += `
                @keyframes whiteToSlideRight {
                    0%   { opacity: 0; background-color: white; transform: translateX(0%); }
                    33%  { opacity: 1; background-color: white; transform: translateX(0%); }
                    66%  { opacity: 1; background-color: white; transform: translateX(-100%); }
                    100% { opacity: 1; background-color: transparent; transform: translateX(-100%); }
                }`;
        }

        setTimeout(() => renderCb(true), duration * 0.4);
        setTimeout(() => {
            dom.transitionOverlay.style.animation = '';
            dom.transitionOverlay.style.opacity = '0';
            dom.transitionOverlay.style.transform = '';
            if (doneCb) doneCb();
        }, duration);

        dom.transitionOverlay.style.animation = `whiteToSlideRight ${duration}ms ease-in-out forwards`;
        dom.transitionOverlay.style.opacity = '1';
    });

    // === COMBINED FADE WHITE TO FADE BLACK ===
    function createCombinedFadeAnimation(name, outColor, inColor) {
        if (!dynamicStyles.innerHTML.includes(`@keyframes ${name}`)) {
            dynamicStyles.innerHTML += `
                @keyframes ${name} {
                    0%   { opacity: 0; background-color: ${outColor}; }
                    33%  { opacity: 1; background-color: ${outColor}; }
                    66%  { opacity: 1; background-color: ${inColor}; }
                    100% { opacity: 0; background-color: ${inColor}; }
                }`;
        }
    }

    // Runner parametrik untuk fade berantai (audit G1): warna out/in diturunkan
    // dari NAMA efek yang dipilih kreator (fade_black → 'black'), tidak lagi
    // hardcode putih→hitam. Dipakai input-controller saat exit `fade_*` disusul
    // entri ber-transisi `fade_*`.
    function runCombinedFade(outColorRaw, inColorRaw, renderCb, sfx, vol, doneCb) {
        // Warna berasal dari nama efek di script kreator — validasi longgar agar
        // kata warna CSS/hex tetap lolos, sisanya jatuh ke hitam.
        const safe = (c) => /^[a-zA-Z0-9#(),.%\s-]+$/.test(String(c || '')) ? String(c) : 'black';
        const outColor = safe(outColorRaw);
        const inColor = safe(inColorRaw);

        VNAudio.playSFX(sfx, vol);
        const animName = `combinedFade_${outColor.replace(/[^a-zA-Z0-9]/g, '')}_to_${inColor.replace(/[^a-zA-Z0-9]/g, '')}`;
        const totalDuration = state.transitionDuration * 3;

        createCombinedFadeAnimation(animName, outColor, inColor);

        setTimeout(() => renderCb(true), totalDuration * 0.40);
        setTimeout(() => {
            dom.transitionOverlay.style.animation = '';
            dom.transitionOverlay.style.opacity = '0';
            if (doneCb) doneCb();
        }, totalDuration);

        dom.transitionOverlay.style.opacity = '1';
        dom.transitionOverlay.style.animation = `${animName} ${totalDuration}ms linear forwards`;
    }

    // Handler terdaftar lama dipertahankan (kompat: extension/script yang
    // merujuk namanya) — kini delegasi ke runner parametrik; nama keyframe
    // tetap 'combinedFade_white_to_black'. Signature mengikuti KONTRAK STANDAR
    // handler transisi (renderCb, sfx, vol, delay, pan, data, doneCb) — dulu
    // (renderCb, sfx, vol, doneCb), sehingga skrip tulis-tangan yang memakainya
    // sebagai transisi entry mengirim `delay` ke posisi doneCb → TypeError
    // (kelas bug arity yang sama dengan combined_fade_white_to_slide_right,
    // koreksi audit #5). delay/pan tak dipakai runner (SFX diputar langsung).
    VNRegistry.register('transition', 'combined_fade_white_to_fade_black', (renderCb, sfx, vol, delay, pan, data, doneCb) => {
        runCombinedFade('white', 'black', renderCb, sfx, vol, doneCb);
    });

    // Ekspos untuk input-controller (fade berantai) & custom player.
    window.VNTransitions = { runCombinedFade };
})();
