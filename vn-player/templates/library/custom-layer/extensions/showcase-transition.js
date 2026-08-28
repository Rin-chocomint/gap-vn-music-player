/**
 * Contoh Custom Layer — TRANSISI `larut_gambar` (image dissolve)
 *
 * Dipasang otomatis saat template "Custom Layer" diterapkan; muncul di dropdown
 * Transisi editor tanpa menyentuh berkas engine apa pun (D8).
 *
 * KONTRAK ARITY — wajib persis:
 *   (renderCallback, sfx, volume, delay, pan, data, completionCallback)
 *   • `renderCallback(true)` dipanggil di TENGAH → saat itulah layar berganti isi.
 *   • `completionCallback()` dipanggil di AKHIR → tanpa ini cerita menggantung.
 * Manifest tak bisa membetulkan arity yang salah — itu sebabnya editor memindai
 * panggilan `VNRegistry.register(...)` ini, bukan `extension.json`.
 */
VNRegistry.register('transition', 'larut_gambar', (renderCallback, sfx, volume, delay, pan, data, completionCallback) => {
    const { dom, state, dynamicStyles } = VNState;

    VNAudio.playSFX(sfx, volume, delay, pan);

    const animName = 'customLarutGambar';
    const totalDuration = state.transitionDuration * 2;

    // Keyframes ditulis sekali lalu dipakai ulang — `dynamicStyles` disisipkan
    // SEBELUM theme.css kreator, jadi kreator tetap bisa menimpanya.
    if (!dynamicStyles.innerHTML.includes(`@keyframes ${animName}`)) {
        dynamicStyles.innerHTML += `
            @keyframes ${animName} {
                0%   { opacity: 0; filter: blur(0px); }
                50%  { opacity: 1; filter: blur(6px); }
                100% { opacity: 0; filter: blur(0px); }
            }`;
    }

    const midpoint = totalDuration / 2;
    setTimeout(() => renderCallback(true), midpoint);
    setTimeout(() => {
        dom.transitionOverlay.style.animation = '';
        dom.transitionOverlay.style.opacity = '0';
        dom.transitionOverlay.style.backgroundColor = '';
        dom.transitionOverlay.style.filter = '';
        if (completionCallback) completionCallback();
    }, totalDuration);

    dom.transitionOverlay.style.opacity = '1';
    dom.transitionOverlay.style.backgroundColor = '#0b0b12';
    dom.transitionOverlay.style.animation = `${animName} ${totalDuration}ms ease-in-out forwards`;
}, { description: 'Larut lembut lewat blur', author: 'Contoh Custom Layer' });
