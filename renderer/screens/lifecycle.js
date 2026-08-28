// ================================ ( Lifecycle Halaman ) ================================ //
//------------------- ( beforeunload: efek fade-out biar halus ) -------------------------//
window.addEventListener('beforeunload', () => {
    document.body.classList.add('fade-out');
});

//------------------- ( end beforeunload: efek fade-out biar halus ) -------------------------//

const visualNovelBtn = document.getElementById('visual-novel');
if (visualNovelBtn) {
    visualNovelBtn.addEventListener('click', () => {
        ipcRenderer.send('load-visual-novel');
    });
} else {
    console.warn('[Index] visual-novel button not found');
}


// ================================ ( End Lifecycle Halaman ) ================================ //
