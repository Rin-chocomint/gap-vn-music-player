// ================================ ( Start Game: Pilih Mode ) ================================ //
//------------------- ( modal pilih mode game/vn ) -------------------------//
const startGameButton = document.getElementById('start-game');
const gameModeModal = document.getElementById('game-mode-modal');
const closeGameModeModalBtn = document.getElementById('close-game-mode-modal');

if (startGameButton) {
    startGameButton.addEventListener('click', () => {
        if (gameModeModal) {
            gameModeModal.classList.remove('hidden');
        }
    });
}

if (closeGameModeModalBtn) {
    closeGameModeModalBtn.addEventListener('click', () => {
        if (gameModeModal) {
            gameModeModal.classList.add('hidden');
        }
    });
}

// Klik di luar area modal untuk menutup
if (gameModeModal) {
    gameModeModal.addEventListener('click', (event) => {
        if (event.target === gameModeModal) {
            gameModeModal.classList.add('hidden');
        }
    });
}

// Ganti ID 'visual-novel' menjadi 'start-visual-novel'
const startVisualNovelBtn = document.getElementById('start-visual-novel');
if (startVisualNovelBtn) {
    startVisualNovelBtn.addEventListener('click', () => {
        ipcRenderer.send('load-visual-novel');
    });
}

//------------------- ( end modal pilih mode game/vn ) -------------------------//
// ================================ ( End Start Game: Pilih Mode ) ================================ //
