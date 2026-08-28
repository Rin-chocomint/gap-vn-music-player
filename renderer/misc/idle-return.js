// ================================ ( Idle Return: Balik ke Title Kalau Nganggur ) ================================ //
let idleTimer;
const IDLE_TIMEOUT = 20000;

//------------------- ( reset timer idle ) -------------------------//
function resetIdleTimer() {
    clearTimeout(idleTimer);
    const idleCheckbox = document.getElementById('idle-return-checkbox');
    if (idleCheckbox && idleCheckbox.checked) {
        idleTimer = setTimeout(returnToTitleScreen, IDLE_TIMEOUT);
    }
}

//------------------- ( end reset timer idle ) -------------------------//

//------------------- ( aktivitas user yang dianggap "nggak nganggur" ) -------------------------//
['mousemove', 'keydown', 'click'].forEach(event => {
    document.addEventListener(event, resetIdleTimer);
});

//------------------- ( end aktivitas user yang dianggap "nggak nganggur" ) -------------------------//

function returnToTitleScreen() {
    if (mainMenu.style.display === 'flex' &&
        !optionsModal.classList.contains('open') &&
        !customQuitPopup.classList.contains('visible') &&
        (!gameModeModal || gameModeModal.classList.contains('hidden'))) {

        screens.forEach(screen => screen.style.display = 'none');
        const titleScreen = document.getElementById('title-screen');
        titleScreen.style.display = 'flex';
        titleScreen.style.animation = 'fadeIn 1s forwards';
    }
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('mousemove', (e) => {
        if (e.target.closest('.modal-content')) {
            resetIdleTimer(); // Reset timer jika interaksi dalam modal
        }
    });
});

// ================================ ( End Idle Return: Balik ke Title Kalau Nganggur ) ================================ //
