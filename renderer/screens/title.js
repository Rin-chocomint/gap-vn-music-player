// ================================ ( Title Screen: Animasi & Alur Screen ) ================================ //
//------------------- ( animasi judul + teks muter ) -------------------------//
function startTitleScreenAnimation() {
    const titleH1 = document.querySelectorAll("#title-screen h1 span");
    titleH1.forEach((letter, index) => {
        letter.style.animationDelay = `${index * 0.2}s`;
    });
    const titleH3 = document.querySelector("#title-screen h3");
    setTimeout(() => {
        titleH3.style.animationPlayState = "running";
    }, titleH1.length * 200 + 2000);
    startRotatingText();
}

//------------------- ( end animasi judul + teks muter ) -------------------------//

let currentScreen = 0;
let skipScene = false;
let timeoutId;

ipcRenderer.on('configure-scene', (event, config) => {
    skipScene = config.skipScene;
    console.log("Skip Scene:", skipScene);

    if (skipScene && timeoutId) {
        clearTimeout(timeoutId);
        console.log("Timeout dibatalkan karena opsi skip scene diaktifkan.");
    }
    const savedSettings = config.settings;
    if (savedSettings && enableVideoWallpaperCheckbox && enableOverlayCheckbox) {
        const videoEnabled = savedSettings.videoWallpaperEnabled ?? true;

        enableVideoWallpaperCheckbox.checked = videoEnabled;
        applyVideoWallpaperState(videoEnabled);

        const overlayEnabled = savedSettings.overlayEnabled ?? false;
        enableOverlayCheckbox.checked = overlayEnabled;
        ipcRenderer.send('set-overlay-feature', overlayEnabled);

        const dynamicThemeEnabled = savedSettings.dynamicThemeEnabled ?? false;
        if (enableDynamicThemeCheckbox) {
            enableDynamicThemeCheckbox.checked = dynamicThemeEnabled;
        }
    }
});

ipcRenderer.on('window-minimized', () => {
    console.log('Renderer received: window-minimized');
    if (!isWallpaperPaused) {
        wallpaperVideo.pause();
        pauseWallpaperButton.textContent = "▶";
    }
});

ipcRenderer.on('window-restored', () => {
    console.log('Renderer received: window-restored');
    // Hanya resume jika tidak dipause manual DAN fitur wallpaper aktif
    if (!isManuallyPaused && enableVideoWallpaperCheckbox.checked) {
        wallpaperVideo.play();
        pauseWallpaperButton.textContent = "▐▐";
    }
});

const audio = document.getElementById("background-audio");
timeoutId = null; // Diatur ulang nanti setelah klik warning screen

function showNextScreen() {
    if (currentScreen < screens.length) {
        screens[currentScreen].style.animation = "fadeOut 1s forwards";
        setTimeout(() => {
            screens[currentScreen].style.display = "none";
            if (currentScreen === 3) hideBackgroundVideo();
            currentScreen++;
            if (currentScreen < screens.length) {
                screens[currentScreen].style.display = "flex";
                screens[currentScreen].style.animation = "fadeIn 1s forwards";
                if (currentScreen === 3) {
                    startTitleScreenAnimation();
                    setTimeout(showBackgroundVideo, 4000);
                }
            }
        }, 1000);
    }
}

//------------------- ( rotating text di title-screen ) -------------------------//
let rotatingTexts = [
    "sentence 1",
    "sentence 2",
    "sentence 3",
    "sentence 4",
    "sentence 5"
];

let currentTextIndex = 0;
function startRotatingText() {
    const rotatingTextElement = document.getElementById("rotating-text");

    setTimeout(() => {
        if (rotatingTexts.length === 0) {
            rotatingTextElement.textContent = "";
            return;
        }
        rotatingTextElement.textContent = rotatingTexts[currentTextIndex];

        rotatingTextElement.classList.add("cycling");

        rotatingTextElement.addEventListener('animationiteration', () => {
            if (rotatingTexts.length === 0) return;
            currentTextIndex = (currentTextIndex + 1) % rotatingTexts.length;
            rotatingTextElement.textContent = rotatingTexts[currentTextIndex];
            console.log("Teks diganti pada animationiteration menjadi:", rotatingTexts[currentTextIndex]);
        });

    }, 8000);
}

//------------------- ( end rotating text di title-screen ) -------------------------//

function showBackgroundVideo() {
    const video = document.getElementById("background-video");

    // Restore source video jika sebelumnya di-unload
    if (titleVideoSource && !video.src) {
        const sourceEl = video.querySelector('source');
        if (sourceEl) {
            sourceEl.src = titleVideoSource.src;
            sourceEl.type = titleVideoSource.type;
        } else {
            video.src = titleVideoSource.src;
        }
        video.load();
    }

    video.play();
    video.style.opacity = "1";
}

function hideBackgroundVideo() {
    const video = document.getElementById("background-video");
    video.style.opacity = "0";

    // Optimalisasi: hentikan video dan lepas GPU decoder
    video.pause();
    video.removeAttribute('src');
    const sourceEl = video.querySelector('source');
    if (sourceEl) {
        sourceEl.removeAttribute('src');
    }
    video.load(); // Ini akan melepas video decoder dari GPU
    console.log('[Title Screen] Video source dihapus untuk membebaskan GPU decoder');
}

//------------------- ( debu bintang ala-ala di title screen ) -------------------------//
function createFallingStarsLeftToRight(numStars) {
    const titleScreen = document.getElementById("title-screen");
    for (let i = 0; i < numStars; i++) {
        const starContainer = document.createElement("div");
        starContainer.classList.add("star-container");
        const star = document.createElement("div");
        star.classList.add("star");

        const startX = Math.random() * -20 + "vw";
        const startY = Math.random() * 100 + "vh";
        const endX = Math.random() * 100 + 120 + "vw";
        const endY = Math.random() * 100 - 50 + "vh";
        const duration = Math.random() * 3 + 4 + "s";

        starContainer.style.setProperty("--start-x", startX);
        starContainer.style.setProperty("--start-y", startY);
        starContainer.style.setProperty("--end-x", endX);
        starContainer.style.setProperty("--end-y", endY);
        starContainer.style.animationDuration = duration;

        starContainer.appendChild(star);
        titleScreen.appendChild(starContainer);
    }
}
createFallingStarsLeftToRight(15);

//------------------- ( end debu bintang ala-ala di title screen ) -------------------------//

// ================================ ( End Title Screen: Animasi & Alur Screen ) ================================ //
