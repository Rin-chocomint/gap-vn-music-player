// ================================ ( Editor CSS Profil ) ================================ //
// CSS profil ikut memakai GameEditorStore supaya tidak bergantung pada
// localStorage renderer yang bisa berbeda antar-instalasi.
(function initProfileCSSEditor() {
    const LEGACY_STORAGE_KEY = 'profile-section-custom-css';

    function getStore() {
        return window.gameEditorStore || null;
    }

    function setAppliedCss(customCss) {
        const oldStyle = document.getElementById('profile-section-custom-style');
        if (oldStyle) oldStyle.remove();

        if (!customCss) return;
        const style = document.createElement('style');
        style.id = 'profile-section-custom-style';
        style.textContent = customCss;
        document.head.appendChild(style);
    }

    function extractCurrentCSS() {
        const profileSection = document.getElementById('profile-section');
        if (!profileSection) return '';

        const computedStyle = window.getComputedStyle(profileSection);
        const cssProperties = [
            'background', 'background-color', 'background-image', 'border',
            'border-radius', 'padding', 'margin', 'width', 'height', 'display',
            'flex-direction', 'align-items', 'justify-content', 'gap',
            'box-shadow', 'opacity', 'transform', 'transition'
        ];

        let cssText = '#profile-section {\n';
        cssProperties.forEach(property => {
            const value = computedStyle.getPropertyValue(property);
            if (value && value !== 'none' && value !== 'normal' && value !== 'rgba(0, 0, 0, 0)') {
                cssText += `    ${property}: ${value};\n`;
            }
        });
        return `${cssText}}`;
    }

    async function getSavedCss() {
        const store = getStore();
        if (store) {
            await store.ready;
            if (store.has('profileCustomCss')) return store.getState().profileCustomCss;
        }

        try {
            return localStorage.getItem(LEGACY_STORAGE_KEY) ?? '';
        } catch (error) {
            console.warn('[Profile CSS Editor] Gagal membaca CSS lama:', error);
            return '';
        }
    }

    async function saveCss(customCss) {
        const store = getStore();
        if (!store) throw new Error('Penyimpanan Game Editor belum siap.');

        store.update({ profileCustomCss: customCss });
        await store.persist();

        // Cadangan kompatibilitas untuk rollback ke versi lama, bukan sumber utama.
        try {
            if (customCss) localStorage.setItem(LEGACY_STORAGE_KEY, customCss);
            else localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (error) {
            console.warn('[Profile CSS Editor] Cadangan localStorage gagal diperbarui:', error);
        }
    }

    function flashButton(button, text, color) {
        const originalText = button.textContent;
        const originalBackground = button.style.background;
        button.textContent = text;
        if (color) button.style.background = color;
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = originalBackground;
        }, 1800);
    }

    function bindEditor() {
        const toggleButton = document.getElementById('toggle-profile-css-editor');
        const editorPanel = document.getElementById('profile-css-editor-panel');
        const cssTextarea = document.getElementById('profile-css-code');
        const applyButton = document.getElementById('apply-profile-css');
        const resetButton = document.getElementById('reset-profile-css');
        const loadCurrentButton = document.getElementById('load-current-css');

        if (!toggleButton || !editorPanel || !cssTextarea || !applyButton || !resetButton || !loadCurrentButton) {
            console.warn('[Profile CSS Editor] Elemen editor CSS tidak lengkap.');
            return;
        }

        getSavedCss().then(savedCss => {
            cssTextarea.value = savedCss;
            setAppliedCss(savedCss);
        }).catch(error => console.error('[Profile CSS Editor] Gagal memuat CSS:', error));

        toggleButton.addEventListener('click', event => {
            event.preventDefault();
            const isHidden = editorPanel.style.display === 'none' || !editorPanel.style.display;
            editorPanel.style.display = isHidden ? 'block' : 'none';
            toggleButton.classList.toggle('active', isHidden);
            if (isHidden && !cssTextarea.value.trim()) cssTextarea.value = extractCurrentCSS();
        });

        applyButton.addEventListener('click', async () => {
            const customCss = cssTextarea.value.trim();
            applyButton.disabled = true;
            try {
                await saveCss(customCss);
                setAppliedCss(customCss);
                flashButton(applyButton, '✓ Applied!', 'linear-gradient(135deg, #059669, #047857)');
            } catch (error) {
                console.error('[Profile CSS Editor] Gagal menyimpan CSS:', error);
                alert(`Error saving CSS: ${error.message}`);
            } finally {
                applyButton.disabled = false;
            }
        });

        loadCurrentButton.addEventListener('click', () => {
            cssTextarea.value = extractCurrentCSS();
            flashButton(loadCurrentButton, '✓ Loaded!');
        });

        resetButton.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to reset the profile section CSS to default?')) return;
            resetButton.disabled = true;
            try {
                await saveCss('');
                cssTextarea.value = '';
                setAppliedCss('');
                flashButton(resetButton, '✓ Reset!');
            } catch (error) {
                console.error('[Profile CSS Editor] Gagal mereset CSS:', error);
                alert(`Error resetting CSS: ${error.message}`);
            } finally {
                resetButton.disabled = false;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEditor, { once: true });
    } else {
        bindEditor();
    }
})();
// ================================ ( Akhir Editor CSS Profil ) ================================ //
