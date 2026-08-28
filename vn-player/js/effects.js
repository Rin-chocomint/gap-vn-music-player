/**
 * VN Player — Effects
 * Special visual effects: shake, glitch, BSOD, CRT, flash, dll.
 * Semua effect terdaftar di VNRegistry namespace 'effect' — eat your own cooking.
 * Extension bisa register effect baru via VNRegistry.register('effect', name, handler).
 *
 * Effect handler contract:
 *   handler(ctx) where ctx = { eventData, duration, intensity, gc, dom, state, ipcRenderer }
 */

const VNEffects = (() => {
    const { ipcRenderer } = require('electron');
    const { dom, state } = VNState;

    // ========================================================================
    // BUILT-IN EFFECT HANDLERS
    // Setiap handler menerima ctx = { eventData, duration, intensity, gc, dom, state, ipcRenderer }
    // ========================================================================

    function effectShakeWindow(ctx) {
        const { duration, intensity, gc } = ctx;
        const startTime = Date.now();
        const shakeInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            if (elapsed >= duration) {
                clearInterval(shakeInterval);
                gc.style.transform = 'none';
                return;
            }
            const dx = (Math.random() - 0.5) * 20 * intensity;
            const dy = (Math.random() - 0.5) * 20 * intensity;
            gc.style.transform = `translate(${dx}px, ${dy}px)`;
        }, 50);
    }

    function effectGlitchScreen(ctx) {
        const { duration, intensity, gc } = ctx;
        gc.style.filter = `hue-rotate(90deg) invert(1) blur(${2 * intensity}px)`;
        const glitchInterval = setInterval(() => {
            if (Math.random() > 0.5) {
                gc.style.filter = `hue-rotate(${Math.random() * 360}deg) invert(${Math.random()}) blur(${2 * intensity}px)`;
            }
        }, 100);
        setTimeout(() => { clearInterval(glitchInterval); gc.style.filter = 'none'; }, duration);
    }

    function effectFakeBsod(ctx) {
        createFakeBSOD(ctx.duration, ctx.intensity);
    }

    function effectCrtShutdown(ctx) {
        const { duration } = ctx;
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:black;z-index:10000;transform:scale(1,0.01);opacity:0;transition:transform 0.2s ease-in,opacity 0.3s ease-out;`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.transform = 'scale(1, 0.005)';
            setTimeout(() => { overlay.style.transform = 'scale(1, 1)'; }, 100);
        });
        setTimeout(() => overlay.remove(), duration);
    }

    function effectInvertColors(ctx) {
        const { duration, gc } = ctx;
        gc.style.filter = 'invert(1)';
        setTimeout(() => { gc.style.filter = 'none'; }, duration);
    }

    function effectHeartbeatZoom(ctx) {
        const { duration, intensity, gc } = ctx;
        gc.style.transition = 'transform 0.1s ease-in-out';
        const beatInterval = setInterval(() => {
            gc.style.transform = `scale(${1 + (0.05 * intensity)})`;
            setTimeout(() => { gc.style.transform = 'scale(1)'; }, 100);
        }, 800);
        setTimeout(() => {
            clearInterval(beatInterval);
            gc.style.transform = 'none';
            gc.style.transition = 'none';
        }, duration);
    }

    function effectRedOverlay(ctx) {
        const { duration, intensity } = ctx;
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:red;z-index:9000;opacity:0;pointer-events:none;mix-blend-mode:multiply;transition:opacity 0.5s ease-in-out;`;
        document.body.appendChild(overlay);
        let fadeIn = true;
        const pulse = setInterval(() => {
            overlay.style.opacity = fadeIn ? (0.3 * intensity) : '0';
            fadeIn = !fadeIn;
        }, 500);
        setTimeout(() => { clearInterval(pulse); overlay.remove(); }, duration);
    }

    function effectFlashWhite(ctx) {
        const { duration } = ctx;
        const overlay = document.createElement('div');
        overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:white;z-index:20000;opacity:1;pointer-events:none;transition:opacity ${duration}ms ease-out;`;
        document.body.appendChild(overlay);
        overlay.offsetHeight;
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), duration);
    }

    function effectCinematicBars(ctx) {
        const { duration, intensity } = ctx;
        // z-index di bawah dialogue box (--vn-dialogue-z: 5) — bar letterbox
        // menutupi latar & sprite, tapi TIDAK menutupi teks dialog/choice.
        // (Dulu 15000: bar bawah menimpa kotak dialog → teks tak terbaca.)
        const barCSS = `position:fixed;left:0;width:100%;height:0;background:black;z-index:4;transition:height 0.5s ease;pointer-events:none;`;
        const topBar = document.createElement('div');
        topBar.style.cssText = barCSS + 'top:0;';
        const bottomBar = document.createElement('div');
        bottomBar.style.cssText = barCSS + 'bottom:0;';
        document.body.appendChild(topBar);
        document.body.appendChild(bottomBar);
        requestAnimationFrame(() => {
            const h = (10 * intensity) + '%';
            topBar.style.height = h;
            bottomBar.style.height = h;
        });
        setTimeout(() => {
            topBar.style.height = '0';
            bottomBar.style.height = '0';
            setTimeout(() => { topBar.remove(); bottomBar.remove(); }, 500);
        }, duration);
    }

    function effectSepiaTone(ctx) {
        const { duration, intensity, gc } = ctx;
        gc.style.filter = `sepia(${0.5 + (0.1 * intensity)}) contrast(1.2)`;
        setTimeout(() => { gc.style.filter = 'none'; }, duration);
    }

    function effectBlurVision(ctx) {
        const { duration, intensity, gc } = ctx;
        gc.style.filter = `blur(${2 * intensity}px)`;
        setTimeout(() => { gc.style.filter = 'none'; }, duration);
    }

    // ========================================================================
    // REGISTER BUILT-IN EFFECTS — eat your own cooking
    // ========================================================================

    VNRegistry.register('effect', 'shake_window', effectShakeWindow, { description: 'Random shake transform', category: 'screen' });
    VNRegistry.register('effect', 'glitch_screen', effectGlitchScreen, { description: 'Hue-rotate + invert + blur glitch', category: 'screen' });
    VNRegistry.register('effect', 'fake_bsod', effectFakeBsod, { description: 'Fake Windows BSOD overlay', category: 'overlay' });
    VNRegistry.register('effect', 'crt_shutdown', effectCrtShutdown, { description: 'CRT TV shutdown effect', category: 'overlay' });
    VNRegistry.register('effect', 'invert_colors', effectInvertColors, { description: 'CSS invert filter', category: 'filter' });
    VNRegistry.register('effect', 'heartbeat_zoom', effectHeartbeatZoom, { description: 'Pulsing scale transform', category: 'screen' });
    VNRegistry.register('effect', 'red_overlay', effectRedOverlay, { description: 'Red pulse overlay', category: 'overlay' });
    VNRegistry.register('effect', 'flash_white', effectFlashWhite, { description: 'White flash overlay', category: 'overlay' });
    VNRegistry.register('effect', 'cinematic_bars', effectCinematicBars, { description: 'Letterbox bars', category: 'overlay' });
    VNRegistry.register('effect', 'sepia_tone', effectSepiaTone, { description: 'Sepia filter', category: 'filter' });
    VNRegistry.register('effect', 'blur_vision', effectBlurVision, { description: 'Blur filter', category: 'filter' });

    // ========================================================================
    // DISPATCHER — Lookup VNRegistry, lalu fallback warn
    // ========================================================================

    /**
     * Handler utama Special Events (dispatcher pattern)
     * Pre-processing (delay, intensity, HUD, SFX, blocking) dilakukan di sini.
     * Lalu handler spesifik dipanggil dari registry.
     */
    function executeSpecialEvent(eventData) {
        if (!eventData) return;
        // Bentuk string ("glitch_screen") didukung sebagai shorthand — diperlakukan
        // sama seperti { type: "glitch_screen" }. Lihat docs/panduan-membuat-novel.md §5.7.
        if (typeof eventData === 'string') eventData = { type: eventData };
        const { eventType: legacyType, type: newType, delay } = eventData;
        const eventType = newType || legacyType;

        // Delay logic
        if (delay && delay > 0) {
            console.log(`[Special Event] Ditunda ${delay}ms`);
            updateHUDPending(eventData, delay);
            setTimeout(() => executeSpecialEvent({ ...eventData, delay: 0 }), delay);
            return;
        }

        const { duration, autoContinue, sfx, intensity: rawIntensity, wait } = eventData;
        const shouldBlock = (wait === true) || (typeof autoContinue !== 'undefined' && autoContinue !== false);

        if (shouldBlock) {
            state.isEventBlocking = true;
        }

        let intensity = parseFloat(rawIntensity);
        if (isNaN(intensity)) intensity = 1.0;

        updateHUDActive(eventData, shouldBlock, intensity, duration);

        if (sfx) VNAudio.playSFX(sfx);

        const gc = dom.gameContainer;
        gc.style.transition = 'none';

        // Lookup handler dari registry
        const handler = VNRegistry.get('effect', eventType);
        if (handler) {
            const ctx = { eventData, duration, intensity, gc, dom, state, ipcRenderer };
            handler(ctx);
        } else {
            console.warn(`[VNEffects] Effect '${eventType}' tidak terdaftar di VNRegistry! Skip.`);
        }

        // Cleanup & Auto Continue
        setTimeout(() => {
            gc.style.filter = 'none';
            gc.style.transform = 'none';
            if (shouldBlock) state.isEventBlocking = false;
            if (autoContinue !== false && typeof autoContinue === 'boolean') {
                ipcRenderer.send('vn-engine:request-next-line');
            }
        }, duration);
    }

    // === BSOD (tetap utuh dari template) ===
    function createFakeBSOD(duration, intensity) {
        const bsod = document.createElement('div');
        bsod.id = 'fake-bsod-screen';
        bsod.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;background-color:#0078d7;color:white;z-index:99999;padding-top:10vh;padding-left:12vw;padding-right:12vw;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;cursor:none;user-select:none;`;

        const qr = generateFakeQR(110);
        bsod.innerHTML = `
            <style>#fake-bsod-screen,#fake-bsod-screen *{font-family:'Segoe UI','Verdana',sans-serif!important;line-height:normal;}</style>
            <div style="font-size:140px;margin-bottom:10px;font-weight:300;line-height:1;">:(</div>
            <div style="font-size:26px;margin-bottom:25px;max-width:900px;font-weight:300;">Your PC ran into a problem and needs to restart. We're just collecting some error info, and then we'll restart for you.</div>
            <div style="font-size:26px;margin-bottom:40px;font-weight:300;"><span id="bsod-progress">0%</span> complete</div>
            <div style="display:flex;flex-direction:row;align-items:flex-start;margin-top:10px;">
                <img src="${qr}" style="width:110px;height:110px;margin-right:20px;image-rendering:pixelated;background:white;padding:4px;">
                <div style="font-size:16px;line-height:1.5;font-weight:300;display:flex;flex-direction:column;justify-content:space-between;height:110px;">
                    <div style="margin-bottom:10px;">For more information about this issue and possible fixes, visit https://www.windows.com/stopcode</div>
                    <div><div style="margin-bottom:5px;">If you call a support person, give them this info:</div><div>Stop code: <span style="font-weight:500;">CRITICAL_PROCESS_DIED</span></div></div>
                </div>
            </div>`;

        document.body.appendChild(bsod);
        animateBSODProgress(duration);
        setTimeout(() => bsod.remove(), duration);
    }

    function generateFakeQR(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, size, size);
        const mod = Math.floor(size / 25);
        const margin = Math.floor((size - mod * 25) / 2);
        ctx.fillStyle = 'black';

        const drawFinder = (x, y) => {
            for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++)
                if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4))
                    ctx.fillRect(margin + (x + j) * mod, margin + (y + i) * mod, mod, mod);
        };
        drawFinder(0, 0); drawFinder(18, 0); drawFinder(0, 18);

        for (let i = 8; i < 17; i++) if (i % 2 === 0) {
            ctx.fillRect(margin + i * mod, margin + 6 * mod, mod, mod);
            ctx.fillRect(margin + 6 * mod, margin + i * mod, mod, mod);
        }

        const seed = Date.now() % 10000;
        for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
            if ((x < 9 && y < 9) || (x > 15 && y < 9) || (x < 9 && y > 15)) continue;
            if (x === 6 || y === 6) continue;
            if (((x * 31 + y * 17 + seed) * 13) % 100 < 45)
                ctx.fillRect(margin + x * mod, margin + y * mod, mod, mod);
        }
        return canvas.toDataURL('image/png');
    }

    function animateBSODProgress(duration) {
        let progress = 0;
        const el = document.getElementById('bsod-progress');
        const stuckPoints = [12, 23, 37, 48, 67, 78, 89, 94];
        let stuckIdx = 0, isStuck = false, stuckTimer = null;
        const baseInterval = duration / 150;

        function update() {
            if (progress >= 100) { if (el) el.textContent = '100%'; return; }
            if (!isStuck && stuckIdx < stuckPoints.length && progress >= stuckPoints[stuckIdx]) {
                isStuck = true;
                const maxStuck = Math.min(duration * 0.08, 2000);
                stuckTimer = setTimeout(() => { isStuck = false; stuckIdx++; schedule(); }, Math.random() * maxStuck + 300);
                return;
            }
            progress += Math.random() < 0.7 ? 1 : (Math.random() < 0.5 ? 2 : 0);
            if (progress > 100) progress = 100;
            if (el) el.textContent = progress + '%';
            schedule();
        }

        function schedule() {
            if (progress >= 100 || isStuck) return;
            setTimeout(update, baseInterval * (0.5 + Math.random() * 1.5));
        }
        schedule();
    }

    // === DEBUG HUD HELPERS ===
    function updateHUDPending(eventData, delay) {
        const hud = document.getElementById('debug-hud');
        const section = document.getElementById('dbg-special-event-section');
        if (!hud || !state.isPreviewMode || !section) return;

        hud.style.display = 'block';
        section.classList.remove('hidden');
        const badge = document.getElementById('dbg-event-badge');
        if (badge) { badge.classList.add('has-event'); badge.textContent = 'PENDING'; }

        const eventType = eventData.type || eventData.eventType;
        document.getElementById('dbg-type').textContent = eventType.toUpperCase().replace(/_/g, ' ');
        document.getElementById('dbg-duration').textContent = (eventData.duration || 1000) + ' ms';
        document.getElementById('dbg-intensity').textContent = parseFloat(eventData.intensity || 1.0).toFixed(1);

        const waitTag = document.getElementById('dbg-wait');
        if (waitTag) {
            waitTag.className = 'debug-tag';
            waitTag.style.background = '#e67e22';
            waitTag.style.color = '#fff';
            let remaining = delay;
            const tick = () => { waitTag.textContent = `⏳ ${(remaining / 1000).toFixed(1)}s`; };
            tick();
            const interval = setInterval(() => {
                remaining -= 100;
                if (remaining <= 0) remaining = 0;
                tick();
            }, 100);
            setTimeout(() => clearInterval(interval), delay);
        }
    }

    function updateHUDActive(eventData, shouldBlock, intensity, duration) {
        const hud = document.getElementById('debug-hud');
        const section = document.getElementById('dbg-special-event-section');
        if (!hud || !state.isPreviewMode || !section) return;

        hud.style.display = 'block';
        section.classList.remove('hidden');

        const eventType = eventData.type || eventData.eventType;
        const badge = document.getElementById('dbg-event-badge');
        if (badge) badge.classList.add('has-event');

        document.getElementById('dbg-type').textContent = eventType.toUpperCase().replace(/_/g, ' ');
        document.getElementById('dbg-duration').textContent = duration + ' ms';
        document.getElementById('dbg-intensity').textContent = intensity.toFixed(1);
        document.getElementById('dbg-sfx').textContent = eventData.sfx ? eventData.sfx.split('/').pop() : 'None';

        const waitTag = document.getElementById('dbg-wait');
        if (waitTag) {
            waitTag.style.background = '';
            waitTag.style.color = '';
            waitTag.className = shouldBlock ? 'debug-tag tag-active' : 'debug-tag tag-inactive';
            waitTag.textContent = shouldBlock ? 'ON' : 'OFF';
        }

        // Progress bar
        const durationBar = document.getElementById('dbg-duration-bar');
        const durationText = document.getElementById('dbg-duration');
        if (durationBar && duration > 0) {
            durationBar.style.transition = 'none';
            durationBar.style.width = '0%';
            void durationBar.offsetWidth;
            durationBar.style.transition = `width ${duration}ms linear`;
            durationBar.style.width = '100%';

            let elapsed = 0;
            if (hud.durationCountdownInterval) clearInterval(hud.durationCountdownInterval);
            const countdown = setInterval(() => {
                elapsed += 100;
                const remaining = Math.max(0, duration - elapsed);
                durationText.textContent = `${remaining} ms`;
                if (elapsed >= duration) {
                    clearInterval(countdown);
                    durationText.textContent = '0 ms ✓';
                    if (badge) badge.textContent = 'DONE';
                }
            }, 100);
            hud.durationCountdownInterval = countdown;
        }
    }

    return { executeSpecialEvent };
})();
