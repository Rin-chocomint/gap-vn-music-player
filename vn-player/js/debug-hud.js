/**
 * VN Player — Debug HUD
 * Panel diagnostik untuk preview mode.
 */

const VNDebugHUD = (() => {
    const { state } = VNState;

    /** Update seluruh Debug HUD dengan data entri */
    function updateDebugHUD(data) {
        const hud = document.getElementById('debug-hud');
        if (!hud || !state.isPreviewMode) return;

        // FB8: Debug HUD ini panel diagnostik untuk PREVIEW ENTRI (tab Story) —
        // menampilkan tipe entri & detail special event. Di preview STYLING VN
        // Player (yang cuma memamerkan warna/gaya) ia jadi kebisingan. Payload
        // demo styling mengeset `hideDebugHud` → sembunyikan, bukan tampilkan.
        if (data && data.hideDebugHud) { hud.style.display = 'none'; return; }

        hud.style.display = 'block';

        // Entry Context
        const entryType = data.type || 'dialogue';
        const entryTypeEl = document.getElementById('dbg-entry-type');
        const speakerEl = document.getElementById('dbg-speaker');
        const textPreviewEl = document.getElementById('dbg-text-preview');
        const eventBadge = document.getElementById('dbg-event-badge');

        if (entryTypeEl) {
            entryTypeEl.className = `debug-entry-type type-${entryType}`;
            const icons = { dialogue: '💬', choice: '🔀', scene: '🖼️' };
            const labels = { dialogue: 'DIALOGUE', choice: 'CHOICE', scene: 'SCENE' };
            entryTypeEl.innerHTML = `<span>${icons[entryType] || '💬'}</span> ${labels[entryType] || 'DIALOGUE'}`;
        }

        if (speakerEl) speakerEl.textContent = data.speaker || '(Narrator)';
        if (textPreviewEl) {
            textPreviewEl.textContent = (data.text && data.text.length > 0) ? data.text : 'Tidak ada teks dialog...';
        }

        // Sprite indicators
        const spriteLeft = document.getElementById('dbg-sprite-left');
        const spriteCenter = document.getElementById('dbg-sprite-center');
        const spriteRight = document.getElementById('dbg-sprite-right');
        if (spriteLeft) spriteLeft.classList.toggle('active', !!data.sprite2);
        if (spriteCenter) spriteCenter.classList.toggle('active', !!data.spriteCenter);
        if (spriteRight) spriteRight.classList.toggle('active', !!data.sprite);

        // Special Event Section
        const specialSection = document.getElementById('dbg-special-event-section');
        // specialEvent boleh berbentuk string shorthand ("glitch_screen") — normalisasi
        // sama seperti VNEffects.executeSpecialEvent agar HUD tetap akurat.
        const se = typeof data.specialEvent === 'string' ? { type: data.specialEvent } : data.specialEvent;
        const hasEvent = se && (se.type || se.eventType);

        if (eventBadge) {
            eventBadge.classList.toggle('has-event', hasEvent);
            eventBadge.textContent = hasEvent ? 'HAS EVENT' : 'NO EVENT';
        }

        if (specialSection) {
            if (hasEvent) {
                specialSection.classList.remove('hidden');
                document.getElementById('dbg-type').textContent = (se.type || se.eventType).toUpperCase().replace(/_/g, ' ');
                document.getElementById('dbg-duration').textContent = se.duration + ' ms';
                document.getElementById('dbg-intensity').textContent = parseFloat(se.intensity || 1).toFixed(1);
                document.getElementById('dbg-sfx').textContent = se.sfx ? se.sfx.split('/').pop() : 'None';

                const waitTag = document.getElementById('dbg-wait');
                if (waitTag) {
                    waitTag.className = se.wait ? 'debug-tag tag-active' : 'debug-tag tag-inactive';
                    waitTag.textContent = se.wait ? 'ON' : 'OFF';
                }

                const durationBar = document.getElementById('dbg-duration-bar');
                if (durationBar) {
                    durationBar.style.transition = 'none';
                    durationBar.style.width = '0%';
                }
            } else {
                specialSection.classList.add('hidden');
            }
        }
    }

    return { updateDebugHUD };
})();
