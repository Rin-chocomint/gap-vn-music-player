/**
 * Contoh Extension — Custom Transition "fade_red"
 * 
 * Cara pakai:
 * 1. Taruh file ini di folder extensions/ novel atau chapter:
 *    aset/game/visual_novels/{novelTitle}/extensions/fade-red.js
 *    
 * 2. Di script.json, gunakan `"transition": "fade_red"` pada entry yang diinginkan.
 * 
 * Extension otomatis di-load oleh VNExtensionLoader dan mendaftarkan diri
 * ke VNRegistry — tidak perlu ubah file engine apapun.
 */

// Self-register transition ke VNRegistry
VNRegistry.register('transition', 'fade_red', (renderCallback, sfx, volume, delay, pan, data, completionCallback) => {
    const { dom, state, dynamicStyles } = VNState;

    VNAudio.playSFX(sfx, volume, delay, pan);

    const animName = 'customFade_red';
    const totalDuration = state.transitionDuration * 2;

    if (!dynamicStyles.innerHTML.includes(`@keyframes ${animName}`)) {
        dynamicStyles.innerHTML += `
            @keyframes ${animName} {
                0%   { opacity: 0; background-color: #8B0000; }
                50%  { opacity: 1; background-color: #8B0000; }
                100% { opacity: 0; background-color: #8B0000; }
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
    dom.transitionOverlay.style.backgroundColor = '#8B0000';
    dom.transitionOverlay.style.animation = `${animName} ${totalDuration}ms ease-in-out forwards`;
}, { description: 'Transisi fade warna merah gelap', author: 'Extension Example' });

console.log('[Extension] Custom transition "fade_red" berhasil didaftarkan!');
