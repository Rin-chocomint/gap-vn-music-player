console.log('[Index] Script execution reached Profile CSS Editor section');
// ================================ ( Editor CSS Profil ) ================================ //
function initProfileCSSEditor() {
    console.log('[Profile CSS Editor] Initializing...');

    const toggleBtn = document.getElementById('toggle-profile-css-editor');
    const editorPanel = document.getElementById('profile-css-editor-panel');
    const cssCodeTextarea = document.getElementById('profile-css-code');
    const applyBtn = document.getElementById('apply-profile-css');
    const resetBtn = document.getElementById('reset-profile-css');

    console.log('[Profile CSS Editor] Elements found:', {
        toggleBtn: !!toggleBtn,
        editorPanel: !!editorPanel,
        cssCodeTextarea: !!cssCodeTextarea,
        applyBtn: !!applyBtn,
        resetBtn: !!resetBtn
    });

    const STORAGE_KEY = 'profile-section-custom-css';
    let customStyleElement = null;

    // Fungsi untuk mengambil CSS saat ini dari profile-section
    function extractCurrentCSS() {
        const profileSection = document.getElementById('profile-section');
        if (!profileSection) {
            console.warn('[Profile CSS Editor] profile-section element not found');
            return '';
        }

        const computedStyle = window.getComputedStyle(profileSection);

        // Ambil properti CSS yang penting-penting saja
        const cssProperties = [
            'background',
            'background-color',
            'background-image',
            'border',
            'border-radius',
            'padding',
            'margin',
            'width',
            'height',
            'display',
            'flex-direction',
            'align-items',
            'justify-content',
            'gap',
            'box-shadow',
            'opacity',
            'transform',
            'transition'
        ];

        let cssText = '#profile-section {\n';
        cssProperties.forEach(prop => {
            const value = computedStyle.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'normal' && value !== 'rgba(0, 0, 0, 0)') {
                cssText += `    ${prop}: ${value};\n`;
            }
        });
        cssText += '}';

        return cssText;
    }

    // Atur visibilitas panel (buka/tutup)
    if (toggleBtn && editorPanel) {
        toggleBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const isHidden = editorPanel.style.display === 'none';

            if (isHidden) {
                editorPanel.style.display = 'block';
                toggleBtn.classList.add('active');

                // Automatis isi pake CSS yang ada kalau textarea-nya masih kosong
                if (cssCodeTextarea && !cssCodeTextarea.value.trim()) {
                    // Cek dulu apakah ada CSS yang tersimpan
                    const savedCSS = localStorage.getItem(STORAGE_KEY);
                    if (savedCSS) {
                        cssCodeTextarea.value = savedCSS;
                        console.log('[Profile CSS Editor] Loaded saved CSS');
                    } else {
                        // Kalau gak ada, kita ambil aja CSS computed yang sekarang lagi dipake
                        const currentCSS = extractCurrentCSS();
                        cssCodeTextarea.value = currentCSS;
                        console.log('[Profile CSS Editor] Extracted current CSS from profile-section');
                    }
                }
            } else {
                editorPanel.style.display = 'none';
                toggleBtn.classList.remove('active');
            }
        });
    }

    // Terapkan CSS kustom hasil editan
    if (applyBtn && cssCodeTextarea) {
        applyBtn.addEventListener('click', function () {
            const customCSS = cssCodeTextarea.value.trim();

            // Hapus style kustom yang lama kalau emang ada
            if (customStyleElement) {
                customStyleElement.remove();
            }

            // Buat elemen style baru
            if (customCSS) {
                customStyleElement = document.createElement('style');
                customStyleElement.id = 'profile-section-custom-style';
                customStyleElement.textContent = customCSS;
                document.head.appendChild(customStyleElement);

                // Simpan setting-nya ke localStorage biar gak ilang
                try {
                    localStorage.setItem(STORAGE_KEY, customCSS);
                    console.log('[Profile CSS Editor] CSS diterapkan dan disimpan');

                    // Kasih umpan balik visual
                    const originalText = applyBtn.textContent;
                    applyBtn.textContent = '✓ Applied!';
                    applyBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
                    setTimeout(() => {
                        applyBtn.textContent = originalText;
                        applyBtn.style.background = '';
                    }, 2000);
                } catch (error) {
                    console.error('[Profile CSS Editor] Error saving CSS:', error);
                    alert('Error saving CSS: ' + error.message);
                }
            }
        });
    }

    // Tombol untuk memuat CSS yang sedang aktif
    const loadCurrentBtn = document.getElementById('load-current-css');
    if (loadCurrentBtn && cssCodeTextarea) {
        loadCurrentBtn.addEventListener('click', function () {
            const currentCSS = extractCurrentCSS();
            cssCodeTextarea.value = currentCSS;
            console.log('[Profile CSS Editor] Loaded current CSS from profile-section');

            // Tampilkan umpan balik
            const originalText = loadCurrentBtn.textContent;
            loadCurrentBtn.textContent = '✓ Loaded!';
            setTimeout(() => {
                loadCurrentBtn.textContent = originalText;
            }, 2000);
        });
    }

    // Reset kembali ke pengaturan awal
    if (resetBtn && cssCodeTextarea) {
        resetBtn.addEventListener('click', function () {
            if (confirm('Are you sure you want to reset the profile section CSS to default?')) {
                // Kosongkan textarea
                cssCodeTextarea.value = '';

                // Hapus elemen style kustom
                if (customStyleElement) {
                    customStyleElement.remove();
                    customStyleElement = null;
                }

                // Hapus data dari localStorage
                try {
                    localStorage.removeItem(STORAGE_KEY);
                    console.log('[Profile CSS Editor] CSS reset to default');

                    // Tampilkan umpan balik
                    const originalText = resetBtn.textContent;
                    resetBtn.textContent = ' di-Reset!';
                    setTimeout(() => {
                        resetBtn.textContent = originalText;
                    }, 2000);
                } catch (error) {
                    console.error('[Profile CSS Editor] Error removing CSS:', error);
                }
            }
        });
    }

    // Muat CSS yang tersimpan saat halaman dibuka
    function loadSavedCSS() {
        try {
            const savedCSS = localStorage.getItem(STORAGE_KEY);
            if (savedCSS && cssCodeTextarea) {
                cssCodeTextarea.value = savedCSS;

                // Terapkan CSS yang sudah disimpan
                customStyleElement = document.createElement('style');
                customStyleElement.id = 'profile-section-custom-style';
                customStyleElement.textContent = savedCSS;
                document.head.appendChild(customStyleElement);

                console.log('[Profile CSS Editor] Loaded and applied saved CSS');
            }
        } catch (error) {
            console.error('[Profile CSS Editor] Error loading saved CSS:', error);
        }
    }

    // Jalankan fungsi muat CSS saat DOM sudah siap
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSavedCSS);
    } else {
        loadSavedCSS();
    }
}

console.log('[Profile CSS Editor] Script loaded, preparing to initialize...');

// Kasih jeda dikit baru inisialisasi biar yakin DOM-nya udah beneran siap
// Dipanggil lagi juga pas game editor dibuka biar aman
console.log('[Profile CSS Editor] Setting up delayed initialization (500ms)');
setTimeout(function () {
    console.log('[Profile CSS Editor] Delayed init triggered');
    initProfileCSSEditor();
}, 500);

// Inisialisasi ulang pas tombol game editor diklik
console.log('[Profile CSS Editor] Looking for game-editor button...');
const gameEditorBtn = document.getElementById('game-editor');
console.log('[Profile CSS Editor] Game editor button found:', !!gameEditorBtn);

if (gameEditorBtn) {
    console.log('[Profile CSS Editor] Attaching click listener to game-editor button');
    gameEditorBtn.addEventListener('click', function () {
        console.log('[Profile CSS Editor] Game editor button clicked! Re-initializing in 300ms...');
        setTimeout(function () {
            console.log('[Profile CSS Editor] Re-init triggered from game editor click');
            initProfileCSSEditor();
        }, 300);
    });
} else {
    console.warn('[Profile CSS Editor] Game editor button not found!');
}

// Coba inisialisasi pas dokumen bener-bener udah kelar dimuat
console.log('[Profile CSS Editor] Document readyState:', document.readyState);
if (document.readyState === 'loading') {
    console.log('[Profile CSS Editor] Document still loading, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', function () {
        console.log('[Profile CSS Editor] DOMContentLoaded fired, initializing...');
        initProfileCSSEditor();
    });
} else {
    console.log('[Profile CSS Editor] Document already loaded');
}

// ================================ ( Akhir Editor CSS Profil ) ================================ //
