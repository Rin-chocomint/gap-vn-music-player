// ================================ ( Shortcut Keyboard ) ================================ //
//------------------- ( Enter: lompat ke main menu dari title ) -------------------------//
document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const titleScreen = document.getElementById('title-screen');

        if (titleScreen.style.display === 'flex') {
            titleScreen.style.display = 'none';
            const mainMenu = document.getElementById('main-menu');
            mainMenu.style.display = 'flex';
            mainMenu.style.animation = 'fadeIn 1s forwards';
            onMainMenuLoad();
        }
    }
});

//------------------- ( end Enter: lompat ke main menu dari title ) -------------------------//

//------------------- ( Escape: prioritas tutup modal dulu, baru balik title ) -------------------------//
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (optionsModal.classList.contains('open')) {
            closeOptionsBtn.click();
        } else if (customQuitPopup.classList.contains('visible')) { // Cek class .visible untuk popup quit
            customCancelQuitBtn.click();
        } else if (gameModeModal && !gameModeModal.classList.contains('hidden')) { // Cek modal game mode
            closeGameModeModalBtn.click();
        }
        else {
            returnToTitleScreen();
        }
    }
});

//------------------- ( end Escape: prioritas tutup modal dulu, baru balik title ) -------------------------//
// ================================ ( End Shortcut Keyboard ) ================================ //
