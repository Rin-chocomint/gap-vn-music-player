// ================================ ( Logo Warning: animasi SVG ) ================================ //
// CSS animation pada <g> SVG bisa melompati frame awal ketika renderer Electron
// sedang sibuk saat boot. Atribut transform SVG diperbarui langsung per frame
// agar gerak pickaxe selalu terlihat setelah layar warning sempat tergambar.
(() => {
    const PICKAXE_DURATION_MS = 800;
    const CURVE_DURATION_MS = 580;
    const PICKAXE_FULL_TURN = 360;
    const GRAVITY_EXPONENT = 2.4;
    const PICKAXE_PIVOT = { x: 18, y: 60 };
    const CURVE_PIVOT = { x: 52.5, y: 60 };
    const curveFrames = [
        { progress: 0, y: 0, scaleY: 1 },
        { progress: 0.18, y: 2, scaleY: 0.8 },
        { progress: 0.52, y: -3, scaleY: 1.08 },
        { progress: 0.74, y: 1, scaleY: 0.96 },
        { progress: 1, y: 0, scaleY: 1 }
    ];

    const clamp01 = (value) => Math.max(0, Math.min(1, value));
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

    // Awalnya seperti tertahan, lalu dilepas: sudut tumbuh makin cepat
    // menyerupai beban yang jatuh pada porosnya. Nilai 1 di akhir tetap 360°.
    const getGravityProgress = (progress) => Math.pow(progress, GRAVITY_EXPONENT);

    function interpolateCurveFrame(progress) {
        const target = clamp01(progress);
        const nextIndex = curveFrames.findIndex((frame) => frame.progress >= target);
        const end = curveFrames[nextIndex === -1 ? curveFrames.length - 1 : nextIndex];
        const start = curveFrames[Math.max(0, (nextIndex === -1 ? curveFrames.length - 1 : nextIndex) - 1)];
        const span = end.progress - start.progress || 1;
        const localProgress = easeOutCubic((target - start.progress) / span);

        return {
            y: start.y + ((end.y - start.y) * localProgress),
            scaleY: start.scaleY + ((end.scaleY - start.scaleY) * localProgress)
        };
    }

    function animateCurve(curve) {
        const startedAt = performance.now();

        function frame(now) {
            const progress = clamp01((now - startedAt) / CURVE_DURATION_MS);
            const values = interpolateCurveFrame(progress);
            curve.setAttribute(
                'transform',
                `translate(0 ${values.y}) translate(${CURVE_PIVOT.x} ${CURVE_PIVOT.y}) scale(1 ${values.scaleY}) translate(${-CURVE_PIVOT.x} ${-CURVE_PIVOT.y})`
            );

            if (progress < 1) requestAnimationFrame(frame);
        }

        requestAnimationFrame(frame);
    }

    function animateWarningLogo() {
        const warningScreen = document.querySelector('body > #warning-screen');
        const pickaxe = warningScreen?.querySelector('.warning-logo-pickaxe');
        const curve = warningScreen?.querySelector('.logo-curve');
        if (!pickaxe || !curve) return;

        const startedAt = performance.now();

        function frame(now) {
            const progress = clamp01((now - startedAt) / PICKAXE_DURATION_MS);
            // Satu putaran penuh dengan percepatan gravitasi kembali ke posisi awal.
            const angle = PICKAXE_FULL_TURN * getGravityProgress(progress);
            pickaxe.setAttribute('transform', `rotate(${angle} ${PICKAXE_PIVOT.x} ${PICKAXE_PIVOT.y})`);

            if (progress < 1) {
                requestAnimationFrame(frame);
            } else {
                animateCurve(curve);
            }
        }

        requestAnimationFrame(frame);
    }

    // Dua frame kosong memastikan posisi awal terlihat sebelum rotasi dimulai.
    function startAfterInitialPaint() {
        requestAnimationFrame(() => requestAnimationFrame(animateWarningLogo));
    }

    if (document.readyState === 'complete') {
        startAfterInitialPaint();
    } else {
        window.addEventListener('load', startAfterInitialPaint, { once: true });
    }
})();
