/**
 * Contoh Extension — Custom Effect "rainbow_flash"
 * 
 * Cara pakai:
 * 1. Taruh file ini di folder extensions/ novel atau chapter:
 *    aset/game/visual_novels/{novelTitle}/extensions/custom-effect.js
 *    
 * 2. Di script.json, gunakan specialEvent dengan type "rainbow_flash":
 *    { "type": "dialogue", "speaker": "...", "text": "...", 
 *      "specialEvent": { "type": "rainbow_flash", "duration": 2000, "intensity": 1.5 } }
 * 
 * Handler menerima ctx = { eventData, duration, intensity, gc, dom, state, ipcRenderer }
 * Dispatcher di VNEffects sudah handle delay, SFX, blocking, dan cleanup otomatis.
 */

VNRegistry.register('effect', 'rainbow_flash', (ctx) => {
    const { duration, intensity, gc } = ctx;

    let hue = 0;
    const speed = 10 * intensity;
    const rainbowInterval = setInterval(() => {
        hue = (hue + speed) % 360;
        gc.style.filter = `hue-rotate(${hue}deg) saturate(${1 + intensity})`;
    }, 50);

    setTimeout(() => {
        clearInterval(rainbowInterval);
        gc.style.filter = 'none';
    }, duration);
}, {
    description: 'Efek pelangi yang mengubah hue secara cepat',
    author: 'Extension Example',
    category: 'filter'
});
