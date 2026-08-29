// ================================ ( Character Menu: Toggle & Hover ) ================================ //
// Data dan kartu karakter dirender oleh game-editor.js dari GameEditorStore.
// Berkas ini hanya mengurus transisi membuka/menutup menu.
(function initCharacterMenuNavigation() {
    const characterMenuButton = document.getElementById('character-menu-button');
    const characterMenu = document.getElementById('character-menu');
    const mainMenu = document.getElementById('main-menu');
    const backButton = document.getElementById('back-to-main-menu');

    if (!characterMenuButton || !characterMenu || !mainMenu || !backButton) {
        console.warn('[CharacterMenu] Elemen navigasi tidak lengkap.');
        return;
    }

    characterMenuButton.addEventListener('click', () => {
        characterMenu.style.display = 'block';
        characterMenu.style.zIndex = '100';
        characterMenu.style.backgroundColor = 'transparent';
        characterMenu.style.animation = 'fadeInCharacter 0.5s forwards';
        characterMenu.style.opacity = '1';
        characterMenu.classList.add('animating');

        const previews = [...characterMenu.querySelectorAll('.image-preview')];
        if (previews.length === 0) {
            characterMenu.style.backgroundColor = 'black';
            characterMenu.classList.remove('animating');
            mainMenu.style.display = 'none';
            return;
        }

        let animationsCompleted = 0;
        previews.forEach(preview => {
            preview.style.animation = '';
            preview.addEventListener('animationend', function finishAnimation(event) {
                if (event.animationName !== 'swipeUp') return;
                preview.removeEventListener('animationend', finishAnimation);
                preview.style.opacity = '1';
                animationsCompleted += 1;
                if (animationsCompleted === previews.length) {
                    characterMenu.style.backgroundColor = 'black';
                    characterMenu.classList.remove('animating');
                    mainMenu.style.display = 'none';
                }
            });
        });
    });

    backButton.addEventListener('click', () => {
        mainMenu.style.display = 'flex';
        mainMenu.style.opacity = '1';
        mainMenu.style.animation = 'fadeIn 0.5s forwards';
        characterMenu.style.animation = 'fadeOutCharacter 0.5s forwards';

        setTimeout(() => {
            characterMenu.style.display = 'none';
            characterMenu.style.opacity = '0';
            characterMenu.querySelectorAll('.image-preview').forEach(card => {
                card.style.opacity = '0';
                card.style.animation = '';
            });
        }, 500);
    });
})();
// ================================ ( End Character Menu ) ================================ //
