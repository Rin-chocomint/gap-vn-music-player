/**
 * Contoh Extension — Settings Hook "accessibility"
 * 
 * Cara pakai:
 * 1. Taruh file ini di folder extensions/ novel atau chapter.
 * 
 * Hook ini menambahkan opsi aksesibilitas di modal Settings player.
 * Menggunakan VNRegistry.registerHook() — Fase 6 Hook System.
 * 
 * Hook points yang tersedia:
 *   - player:before-dialogue  — modify speaker/text sebelum ditampilkan
 *   - player:after-dialogue   — notifikasi setelah dialog di-render
 *   - player:settings-render  — inject custom UI ke settings modal
 *   - player:before-transition — modify/cancel transisi
 *   - hub:screen-enter        — saat masuk screen di novel hub
 *   - hub:screen-leave        — saat keluar screen di novel hub
 *   - hub:menu-render         — setelah tombol menu di-render
 */

// Inject opsi Dyslexia Font di Settings
VNRegistry.registerHook('player:settings-render', (ctx) => {
    const { modal } = ctx;
    if (!modal) return ctx;

    // Cek jika section sudah ada (modal bisa dibuka berulang kali)
    if (modal.querySelector('#ext-accessibility-section')) return ctx;

    const section = document.createElement('div');
    section.id = 'ext-accessibility-section';
    section.style.cssText = 'margin-top: 15px; padding-top: 10px; border-top: 1px dashed #555;';
    section.innerHTML = `
        <label style="color: #88ccff; font-weight: bold; display: block; margin-bottom: 8px;">
            Aksesibilitas (Extension)
        </label>
        <label style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="ext-dyslexia-font" ${document.body.classList.contains('dyslexia-font') ? 'checked' : ''}>
            <span>Gunakan font ramah disleksia</span>
        </label>
    `;

    // Cari container settings yang sudah ada
    const settingsContent = modal.querySelector('.settings-content') || modal;
    settingsContent.appendChild(section);

    // Event listener
    const checkbox = section.querySelector('#ext-dyslexia-font');
    checkbox.addEventListener('change', () => {
        document.body.classList.toggle('dyslexia-font', checkbox.checked);
        localStorage.setItem('ext-dyslexia-font', checkbox.checked);
    });

    return ctx;
}, 100);

// Hook dialogue untuk mode dyslexia — uppercase speaker name untuk readability
VNRegistry.registerHook('player:before-dialogue', (ctx) => {
    if (document.body.classList.contains('dyslexia-font') && ctx.speaker) {
        ctx.speaker = ctx.speaker.toUpperCase();
    }
    return ctx;
}, 200);

// Restore preference on load
(function() {
    if (localStorage.getItem('ext-dyslexia-font') === 'true') {
        document.body.classList.add('dyslexia-font');
    }
})();
