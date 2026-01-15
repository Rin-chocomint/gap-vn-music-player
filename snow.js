// snow.js - Logika untuk animasi salju
const canvas = document.getElementById('snow-canvas');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

// Variabel untuk posisi mouse (jika masih ingin digunakan dari improvisasi sebelumnya)
let mouseX = W / 2;
let mouseY = H / 2;
const mouseRadius = 100; 

// Mengurangi jumlah maksimal partikel salju agar tidak terlalu deras
const mp = 75; // Dari 150 menjadi 75, atau sesuai selera Anda

const particles = [];
for (let i = 0; i < mp; i++) {
    particles.push({
        x: Math.random() * W, // Posisi x acak
        y: Math.random() * H, // Posisi y acak
        // Mengurangi ukuran radius partikel salju
        r: Math.random() * 2 + 0.5, // Dari Math.random() * 4 + 1 menjadi Math.random() * 2 + 0.5 (ukuran 0.5 s/d 2.5)
        d: Math.random() * mp // Kepadatan acak
    });
}

// Event listener untuk gerakan mouse (jika masih ingin digunakan)
canvas.addEventListener('mousemove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
});

canvas.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
        mouseX = event.touches[0].clientX;
        mouseY = event.touches[0].clientY;
    }
});
canvas.addEventListener('touchend', () => {
    // mouseX = W / 2; // Opsional: reset posisi jika sentuhan berakhir
    // mouseY = H / 2;
});


function drawSnow() {
    ctx.clearRect(0, 0, W, H); // Bersihkan canvas

    // MODIFIKASI: Membuat salju lebih bening (mengurangi alpha)
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; // Dari 0.8 menjadi 0.4, atau sesuai selera
    ctx.beginPath();
    for (let i = 0; i < mp; i++) {
        const p = particles[i];
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, true);
    }
    ctx.fill();
    updateSnow();
}

let angle = 0;
function updateSnow() {
    angle += 0.01;
    for (let i = 0; i < mp; i++) {
        const p = particles[i];

        // Interaksi dengan mouse (jika masih ingin digunakan)
        const dxMouse = p.x - mouseX;
        const dyMouse = p.y - mouseY;
        const distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

        if (distanceMouse < mouseRadius) {
            const forceDirectionX = dxMouse / distanceMouse;
            const forceDirectionY = dyMouse / distanceMouse;
            const force = (mouseRadius - distanceMouse) / mouseRadius * 3; // Mengurangi sedikit kekuatan dorongan mouse
            p.x += forceDirectionX * force;
            p.y += forceDirectionY * force;
        }

        p.y += Math.cos(angle + p.d) + 0.5 + p.r / 4; // Dari + 1 + p.r / 2
        p.x += Math.sin(angle) * 1.5; // Mengurangi sedikit gerakan horizontal angin

        // Mengirim partikel kembali ke atas jika sudah melewati batas bawah
        if (p.x > W + 5 || p.x < -5 || p.y > H) {
            if (i % 3 > 0) { 
                particles[i] = { x: Math.random() * W, y: -10, r: p.r, d: p.d };
            } else {
                if (Math.sin(angle) > 0) {
                    particles[i] = { x: -5, y: Math.random() * H, r: p.r, d: p.d };
                } else {
                    particles[i] = { x: W + 5, y: Math.random() * H, r: p.r, d: p.d };
                }
            }
        }
        if (p.x > W + p.r) p.x = W + p.r;
        if (p.x < -p.r) p.x = -p.r;
        if (p.y > H + p.r) p.y = H + p.r;
    }
}

// Loop animasi
function animate() {
    drawSnow();
    requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// Menyesuaikan ukuran canvas jika jendela diubah ukurannya
window.addEventListener('resize', () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
});