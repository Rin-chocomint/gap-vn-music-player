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