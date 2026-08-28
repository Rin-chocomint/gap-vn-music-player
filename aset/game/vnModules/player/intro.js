        // ------------------- Intro & Main Menu ------------------- //

        document.addEventListener("DOMContentLoaded", () => {
            const blackScene = document.getElementById('black-scene');
            const introScene = document.getElementById('intro-scene');

            loadStories();
            updateCarouselCenter();

            // Notify Main Process to update Discord RPC
            if (typeof ipcRenderer !== 'undefined') {
                ipcRenderer.send('update-rpc-activity', {
                    details: 'Memilih Visual Novel',
                    state: 'Mencari cerita menarik',
                    largeImageKey: 'vn_icon',
                    smallImageKey: 'main_icon',
                    smallImageText: 'VN Manager'
                });
            }

            // Black screen ke intro scene
            function startIntroScene() {
                blackScene.classList.add('swipe-out');
                blackScene.addEventListener('animationend', () => {
                    blackScene.remove();
                    introScene.style.display = 'block';
                });
            }
            startIntroScene();
        });

        document.addEventListener("DOMContentLoaded", () => {

            document.addEventListener('mousemove', (e) => {
                if (document.body.classList.contains('invalid-drag-state')) {
                    dragTooltip.style.left = `${e.clientX}px`;
                    dragTooltip.style.top = `${e.clientY}px`;
                }
            });

            dragTooltip = document.getElementById('drag-tooltip');

            const characterImage = document.querySelector('.character-image-small');

            function jumpHigh() {
                if (!characterImage) return;
                characterImage.style.animation = 'jump-high 0.4s ease-in-out';
                setTimeout(() => { characterImage.style.animation = ''; }, 400);
            }

            function jumpLow() {
                if (!characterImage) return;
                characterImage.style.animation = 'jump-low 0.3s ease-in-out';
                setTimeout(() => { characterImage.style.animation = ''; }, 300);
            }

            function startJumpCycle() {
                jumpHigh();
                setTimeout(() => jumpHigh(), 500);
                setTimeout(() => jumpLow(), 1200);
                setTimeout(startJumpCycle, 2000);
            }
            startJumpCycle();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                exitIntroScene();
            }
        });

        // Intro ke konten utama
        function exitIntroScene() {
            const introScene = document.getElementById('intro-scene');
            introScene.style.animation = 'swipeOut 0.3s ease forwards';
            setTimeout(() => {
                introScene.remove();
                showMainMenu();
            }, 500);
        }

        // Tampilkan konten utama
        function showMainMenu() {
            const menuContainer = document.querySelector('.menu-container');
            menuContainer.style.display = 'block';
        }

        // Animasi swipe ke kiri
        const swipeOutAnimation = document.createElement('style');
        swipeOutAnimation.innerHTML = `
      @keyframes swipeOut {
        0% { transform: translateX(0); }
        100% { transform: translateX(-100%); }
      }
      .intro-scene {
        animation: none;
      }
    `;
        document.head.appendChild(swipeOutAnimation);
        // ------------------- Rotasi pesan intro ------------------- //
        // Pesan berganti sendiri setiap beberapa detik, dan bisa dipercepat
        // dengan klik. Timer BERHENTI selama kursor berada di atas kotaknya —
        // pesan panjang tidak boleh berpindah justru ketika orang sedang
        // membacanya. Enter tetap milik exitIntroScene(), tidak diganggu.
        document.addEventListener('DOMContentLoaded', () => {
            const wadah = document.getElementById('tips-content');
            const nav = document.getElementById('tips-nav');
            const petunjuk = document.getElementById('tips-hint');
            if (!wadah) return;

            const slides = Array.from(wadah.querySelectorAll('.tips-slide'));
            if (slides.length < 2) {
                // Satu pesan: tak ada yang perlu diputar, dan navigasinya cuma
                // akan membingungkan.
                if (nav) nav.style.display = 'none';
                if (petunjuk) petunjuk.style.display = 'none';
                return;
            }

            const JEDA_MS = 14000;
            let aktif = 0;
            let timer = null;
            let tertahan = false;

            const titik = slides.map((_, i) => {
                const d = document.createElement('button');
                d.type = 'button';
                d.className = 'tips-dot';
                d.setAttribute('aria-label', 'Pesan ' + (i + 1) + ' dari ' + slides.length);
                d.addEventListener('click', (e) => {
                    e.stopPropagation();   // jangan ikut memicu klik-maju di kotak
                    tampilkan(i);
                });
                if (nav) nav.appendChild(d);
                return d;
            });

            function tampilkan(i) {
                // Intro dihapus dari DOM saat Enter ditekan; timer yang terlanjur
                // dijadwalkan tidak boleh menyentuh node yatim.
                if (!document.body.contains(wadah)) {
                    clearTimeout(timer);
                    return;
                }
                aktif = ((i % slides.length) + slides.length) % slides.length;
                slides.forEach((s, n) => s.classList.toggle('is-active', n === aktif));
                titik.forEach((d, n) => d.classList.toggle('is-active', n === aktif));
                jadwalkan();
            }

            function jadwalkan() {
                clearTimeout(timer);
                if (tertahan) return;
                timer = setTimeout(() => tampilkan(aktif + 1), JEDA_MS);
            }

            const kotak = wadah.closest('.tips-container') || wadah;
            kotak.addEventListener('click', () => tampilkan(aktif + 1));
            kotak.addEventListener('mouseenter', () => { tertahan = true; clearTimeout(timer); });
            kotak.addEventListener('mouseleave', () => { tertahan = false; jadwalkan(); });

            tampilkan(0);
        });
