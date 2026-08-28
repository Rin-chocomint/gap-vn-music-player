/**
 * Contoh Custom Layer — EFEK `sobek_layar` (screen tear)
 *
 * Dipakai di script.json lewat specialEvent:
 *   { "type": "dialogue", "text": "…",
 *     "specialEvent": { "type": "sobek_layar", "duration": 1200, "intensity": 1.4 } }
 *
 * KONTRAK: handler menerima SATU objek `ctx` —
 *   { eventData, duration, intensity, gc, dom, state, ipcRenderer }
 * Dispatcher `VNEffects` sudah mengurus delay, SFX, blocking, dan pembersihan
 * otomatis; handler cukup mengurus efeknya sendiri DAN mengembalikan tampilan ke
 * semula saat selesai — kalau tidak, sisa efek terbawa ke entri berikutnya.
 *
 * `gc` = game container. Sengaja hanya menyentuh style-nya: efek tak boleh
 * menyusun ulang DOM engine, karena itu membuatnya rapuh terhadap perubahan
 * kontrak peran (`data-player-role`).
 */
VNRegistry.register('effect', 'sobek_layar', (ctx) => {
    const { duration, intensity, gc } = ctx;

    const kekuatan = Math.max(0.2, Number(intensity) || 1);
    const asalClip = gc.style.clipPath || '';
    const asalTransform = gc.style.transform || '';

    const tick = setInterval(() => {
        // Satu pita horizontal digeser acak — cukup untuk kesan "sobek" tanpa
        // menyentuh struktur DOM.
        const atas = Math.random() * 80;
        const tinggi = 4 + Math.random() * 10 * kekuatan;
        const geser = (Math.random() - 0.5) * 24 * kekuatan;
        gc.style.clipPath =
            `polygon(0 0, 100% 0, 100% ${atas}%, ${geser}px ${atas}%, ` +
            `${geser}px ${atas + tinggi}%, 100% ${atas + tinggi}%, 100% 100%, 0 100%)`;
        gc.style.transform = `translateX(${geser * 0.25}px)`;
    }, 70);

    setTimeout(() => {
        clearInterval(tick);
        gc.style.clipPath = asalClip;
        gc.style.transform = asalTransform;
    }, duration);
}, {
    description: 'Layar tersobek sesaat',
    author: 'Contoh Custom Layer',
    category: 'glitch'
});
