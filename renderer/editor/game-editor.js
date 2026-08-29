// ================================ ( Logika Game Editor ) ================================ //
//------------------- inisialisasi elemen editor -------------------------//
const gameEditorScreen = document.getElementById('game-editor-screen');
const gameEditorButton = document.getElementById('game-editor'); // Tombol di main menu
const backToMainMenuEditorBtn = document.getElementById('back-to-main-menu-editor');
const saveEditorChangesBtn = document.getElementById('save-editor-changes');

let isEditorDirty = false; // Flag untuk melacak perubahan yang belum disimpan

// Daftar semua ID elemen yang bisa diedit dan ID input kontainernya
const editableSections = [
    { elementId: 'warning-screen', previewId: 'preview-warning-screen', livePreviewContentId: 'warning-screen-preview-content' },
    { elementId: 'developer-screen', previewId: 'preview-developer-screen', livePreviewContentId: 'developer-screen-preview-content' },
    { elementId: 'concept-screen', previewId: 'preview-concept-screen', livePreviewContentId: 'concept-screen-preview-content' },
    { elementId: 'title-screen', previewId: 'preview-title-screen', livePreviewContentId: 'title-screen-preview-content' },
    { elementId: 'profile-section', previewId: 'preview-profile-section', livePreviewContentId: 'profile-section-preview-content' },
    { elementId: 'character-menu', previewId: 'preview-character-menu-box' }

];

const GAME_EDITOR_CONTENT_KEY = 'gameEditableContent';
const CHARACTER_DATA_KEY = 'gameCharacterEditorData';
const ROTATING_TEXTS_KEY = 'gameRotatingTexts';
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
let defaultCharacterDataPromise = null;
let gameEditorBootstrapPromise = null;
let pendingMediaDeletes = [];

function getGameEditorStore() {
    return window.gameEditorStore || null;
}

function hasPersistedEditorValue(key) {
    const store = getGameEditorStore();
    return Boolean(store && store.has(key));
}

function getPersistedEditorState() {
    const store = getGameEditorStore();
    return store ? store.getState() : { schemaVersion: 1 };
}

function syncLegacyEditorStorage(content) {
    // Menyimpan salinan kompatibilitas adalah best-effort saja. Sumber utama
    // tetap userData sehingga kuota localStorage tidak dapat menggagalkan Save.
    try {
        localStorage.setItem(GAME_EDITOR_CONTENT_KEY, JSON.stringify(content));
        localStorage.setItem(CHARACTER_DATA_KEY, JSON.stringify(gameCharacters));
        localStorage.setItem(ROTATING_TEXTS_KEY, JSON.stringify(rotatingTexts));
    } catch (error) {
        console.warn('[GameEditor] Cadangan localStorage tidak dapat diperbarui:', error);
    }
}

// Deteksi perubahan pada input di dalam editor
if (gameEditorScreen) {
    gameEditorScreen.addEventListener('input', (e) => {
        // target adalah elemen input yang relevan
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            isEditorDirty = true;
        }
    });
    // Tangkap event change juga untuk input file atau checkbox yang mungkin tidak memicu input terus menerus
    gameEditorScreen.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            isEditorDirty = true;
        }
    });
}
//------------------- end inisialisasi elemen editor -------------------------//

// Utility kecil untuk menyusun ulang teks judul utama (membuat <span> per karakter)
function setTitleHeadingText(targetHeading, textValue) {
    if (!targetHeading) return;
    // Judul di index.html ditulis multi-baris, jadi textContent-nya membawa newline
    // dan indentasi. Tiap karakter jadi <span> display:inline-block, jadi spasi yang
    // ikut terbawa menambah span kosong dan memperpanjang animasi masuk judul.
    const safeText = (textValue || '').trim();
    targetHeading.innerHTML = '';
    safeText.split('').forEach(char => {
        const span = document.createElement('span');
        span.textContent = char;
        targetHeading.appendChild(span);
    });
}

//------------------- fungsi update preview -------------------------//
// update semua preview
function updateAllPreviews(fromInput = false) {
    editableSections.forEach(section => {
        updateSpecificPreview(section.elementId, fromInput);
    });
}

// update preview spesifik
function updateSpecificPreview(elementId, fromInput = false) {
    const sectionConfig = editableSections.find(s => s.elementId === elementId);
    if (!sectionConfig) return;

    const previewBox = document.getElementById(sectionConfig.previewId);
    if (!previewBox) {
        console.warn(`Preview box with ID ${sectionConfig.previewId} not found.`);
        return;
    }

    // Dapatkan pembungkus konten pratinjau. Untuk sebagian besar layar, ini adalah .live-preview-content
    const livePreviewWrapper = previewBox.querySelector('.live-preview-content');

    if (elementId === 'warning-screen') {
        // Target elemen <p> di dalam .screen yang ada di dalam .live-preview-content di dalam previewBox
        const screenInPreview = livePreviewWrapper ? livePreviewWrapper.querySelector('.screen') : null;
        if (screenInPreview) {
            const pElements = screenInPreview.querySelectorAll('p');
            if (pElements.length >= 2) {
                if (fromInput) {
                    pElements[0].textContent = document.getElementById('edit-warning-text-1').value;
                    pElements[1].textContent = document.getElementById('edit-warning-text-2').value;
                } else {
                    const originalEl = screens.find(s => s.id === 'warning-screen');
                    if (originalEl) {
                        pElements[0].textContent = originalEl.querySelectorAll('p')[0]?.textContent;
                        pElements[1].textContent = originalEl.querySelectorAll('p')[1]?.textContent;
                    }
                }
            }
        }
    } else if (elementId === 'developer-screen') {
        const screenInPreview = livePreviewWrapper ? livePreviewWrapper.querySelector('.screen') : null;
        if (screenInPreview) {
            const h2Element = screenInPreview.querySelector('h2');
            const h4Element = screenInPreview.querySelector('h4');
            if (h2Element && h4Element) {
                if (fromInput) {
                    h2Element.textContent = document.getElementById('edit-developer-title').value;
                    h4Element.textContent = document.getElementById('edit-developer-subtitle').value;
                } else {
                    const originalEl = screens.find(s => s.id === 'developer-screen');
                    if (originalEl) {
                        h2Element.textContent = originalEl.querySelector('h2')?.textContent;
                        h4Element.textContent = originalEl.querySelector('h4')?.textContent;
                    }
                }
            }
        }
    } else if (elementId === 'concept-screen') {
        const screenInPreview = livePreviewWrapper ? livePreviewWrapper.querySelector('.screen') : null;
        if (screenInPreview) {
            const h2Element = screenInPreview.querySelector('h2');
            const pElement = screenInPreview.querySelector('p');
            if (h2Element && pElement) {
                if (fromInput) {
                    h2Element.textContent = document.getElementById('edit-disclaimer-title').value;
                    pElement.textContent = document.getElementById('edit-disclaimer-text').value;
                } else {
                    const originalEl = screens.find(s => s.id === 'concept-screen');
                    if (originalEl) {
                        h2Element.textContent = originalEl.querySelector('h2')?.textContent;
                        pElement.textContent = originalEl.querySelector('p')?.textContent;
                    }
                }
            }
        }
    } else if (elementId === 'title-screen') {
        const screenInPreview = livePreviewWrapper ? livePreviewWrapper.querySelector('.screen') : null;
        if (screenInPreview) {
            const h1InPreview = screenInPreview.querySelector('h1');
            const h3InPreview = screenInPreview.querySelector('h3');
            const pInPreview = screenInPreview.querySelector('p');

            if (h1InPreview && h3InPreview && pInPreview) {
                if (fromInput) {
                    const mainTitle = document.getElementById('edit-title-main').value;
                    setTitleHeadingText(h1InPreview, mainTitle);
                    h3InPreview.textContent = document.getElementById('edit-title-subtitle').value;
                    pInPreview.textContent = document.getElementById('edit-title-press-start').value;
                } else {
                    const originalEl = screens.find(s => s.id === 'title-screen');
                    if (originalEl) {
                        const originalH1 = originalEl.querySelector('h1');
                        const originalMainTitle = originalH1 ? originalH1.textContent : '';
                        setTitleHeadingText(h1InPreview, originalMainTitle);
                        h3InPreview.textContent = originalEl.querySelector('h3')?.textContent;
                        const originalPressStartP = Array.from(originalEl.querySelectorAll('p')).pop();
                        if (originalPressStartP) {
                            pInPreview.textContent = originalPressStartP.textContent;
                        }
                    }
                }
            }
        }
    } else if (elementId === 'profile-section') {
        const previewBox = document.getElementById('preview-profile-section'); // ID dari .preview-box
        if (!previewBox) {
            console.warn(`Preview box with ID preview-profile-section not found.`);
            return;
        }

        // Target elemen #profile-section di dalam previewBox
        const profileSectionInPreview = previewBox.querySelector('#profile-section');
        if (profileSectionInPreview) {
            const nameElPreview = profileSectionInPreview.querySelector('#profile-name');
            const levelElPreview = profileSectionInPreview.querySelector('#profile-level');
            const descriptionElPreview = profileSectionInPreview.querySelector('#profile-description');
            const imageElPreview = profileSectionInPreview.querySelector('img');

            if (nameElPreview && levelElPreview && descriptionElPreview && imageElPreview) {
                if (fromInput) {
                    // Ambil nilai dari field input editor
                    nameElPreview.textContent = document.getElementById('edit-profile-name').value;
                    levelElPreview.textContent = document.getElementById('edit-profile-level').value;
                    descriptionElPreview.textContent = document.getElementById('edit-profile-description').value;
                    // Ambil src gambar dari pratinjau kecil di area input
                    imageElPreview.src = document.getElementById('edit-profile-image-preview').src;
                } else {
                    // Ambil nilai dari elemen game asli (saat load awal atau setelah save)
                    nameElPreview.textContent = document.getElementById('profile-name').textContent; // ID elemen game asli
                    levelElPreview.textContent = document.getElementById('profile-level').textContent; // ID elemen game asli
                    descriptionElPreview.textContent = document.getElementById('profile-description').textContent; // ID elemen game asli
                    imageElPreview.src = document.getElementById('profile-picture').src; // ID elemen game asli
                }
            }
        }
    } else if (elementId === 'character-menu') {
        const previewArea = document.getElementById('live-preview-character-menu-content');
        if (!previewArea) return;

        if (!fromInput) {
            setupCharacterMenuPreview();
            return;
        }

        const formItems = document.querySelectorAll('#characterEditorListContainer .character-edit-item');
        const tempCharacters = [];

        formItems.forEach(item => {
            const id = item.dataset.characterId;
            const name = item.querySelector('.char-name-input')?.value || '';
            const description = item.querySelector('.char-desc-input')?.value || '';
            const extendedDescription = item.querySelector('.char-ext-desc-input')?.value || '';
            const mediaThumb = item.querySelector('.media-thumbnail-preview');

            let mediaSrc = mediaThumb ? mediaThumb.src : '';
            let mediaType = mediaThumb ? (mediaThumb.dataset.newMediaType || mediaThumb.tagName.toLowerCase()) : 'image';

            if (mediaThumb && mediaThumb.dataset.newMediaDataUrl) {
                mediaSrc = mediaThumb.dataset.newMediaDataUrl;
            }

            if (!mediaSrc && gameCharacters.length > 0) {
                const fallback = gameCharacters.find(char => char.id === id);
                if (fallback) {
                    mediaSrc = fallback.mediaSrc;
                    mediaType = fallback.mediaType;
                }
            }

            tempCharacters.push({ id, name, description, extendedDescription, mediaSrc, mediaType });
        });

        // Jika belum ada form (misal baru membuka), gunakan data karakter yang sudah ada
        const charactersToRender = tempCharacters.length > 0 ? tempCharacters : gameCharacters;

        previewArea.innerHTML = '';
        const container = document.createElement('div');
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.display = 'flex';
        container.style.flexDirection = 'row';
        container.style.overflow = 'hidden';
        container.style.backgroundColor = '#000';

        charactersToRender.forEach(charData => {
            const card = document.createElement('div');
            card.className = 'image-preview';
            card.style.flex = '1';
            card.style.borderRight = '1px solid #222';

            const mediaType = (charData.mediaType || '').toLowerCase();
            const isVideo = mediaType === 'video' || (charData.mediaSrc && charData.mediaSrc.match(/\.(mp4|webm|ogg)$/i));

            if (isVideo) {
                const video = document.createElement('video');
                video.className = 'video';
                video.src = charData.mediaSrc || '';
                video.muted = true;
                video.loop = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                card.appendChild(video);
            } else {
                const img = document.createElement('img');
                img.className = 'video character-image';
                img.src = charData.mediaSrc || './aset/placeholder.png';
                img.alt = `Deskripsi Gambar ${charData.name || ''}`;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'cover';
                card.appendChild(img);
            }

            const overlay = document.createElement('div');
            overlay.className = 'overlay';
            overlay.style.height = '35%';
            overlay.style.padding = '10px';

            const desc = document.createElement('div');
            desc.className = 'desc';

            const nameHeading = document.createElement('h1');
            nameHeading.textContent = charData.name || 'New Character';
            nameHeading.style.fontSize = '0.7rem';
            nameHeading.style.marginBottom = '3px';
            desc.appendChild(nameHeading);

            if (charData.description) {
                const summaryP = document.createElement('p');
                summaryP.className = 'summary';
                summaryP.textContent = charData.description;
                summaryP.style.fontSize = '0.6rem';
                summaryP.style.lineHeight = '1.2';
                desc.appendChild(summaryP);
            }

            if (charData.extendedDescription) {
                const extendedDiv = document.createElement('div');
                extendedDiv.className = 'extended-content';
                const extendedP = document.createElement('p');
                extendedP.textContent = charData.extendedDescription;
                extendedDiv.appendChild(extendedP);
                desc.appendChild(extendedDiv);

                const moreBtn = document.createElement('button');
                moreBtn.className = 'more-button';
                moreBtn.textContent = 'More';
                moreBtn.style.fontSize = '0.6rem';
                moreBtn.style.padding = '2px 4px';
                moreBtn.style.marginTop = '4px';
                desc.appendChild(moreBtn);
            }

            overlay.appendChild(desc);
            card.appendChild(overlay);
            container.appendChild(card);
        });

        if (container.lastElementChild) {
            container.lastElementChild.style.borderRight = 'none';
        }

        previewArea.appendChild(container);
        initializeCharacterMenuLogic(container);
    }
}
//------------------- end fungsi update preview -------------------------//

//------------------- fungsi load data ke input editor -------------------------//
// Fungsi untuk memuat semua data ke input editor
function loadAllDataToEditorInputs() {
    editableSections.forEach(section => {
        const elementId = section.elementId;
        if (elementId === 'warning-screen') {
            const el = screens.find(s => s.id === 'warning-screen');
            if (el) {
                document.getElementById('edit-warning-text-1').value = el.querySelectorAll('p')[0]?.textContent || '';
                document.getElementById('edit-warning-text-2').value = el.querySelectorAll('p')[1]?.textContent || '';
            }
        } else if (elementId === 'developer-screen') {
            const el = screens.find(s => s.id === 'developer-screen');
            if (el) {
                document.getElementById('edit-developer-title').value = el.querySelector('h2')?.textContent || '';
                document.getElementById('edit-developer-subtitle').value = el.querySelector('h4')?.textContent || '';
            }
        } else if (elementId === 'concept-screen') {
            const el = screens.find(s => s.id === 'concept-screen');
            if (el) {
                document.getElementById('edit-disclaimer-title').value = el.querySelector('h2')?.textContent || '';
                document.getElementById('edit-disclaimer-text').value = el.querySelector('p')?.textContent || '';
            }
        } else if (elementId === 'title-screen') {
            const el = screens.find(s => s.id === 'title-screen');
            if (el) {
                const h1 = el.querySelector('h1');
                document.getElementById('edit-title-main').value = (h1?.textContent || '').trim();
                document.getElementById('edit-title-subtitle').value = el.querySelector('h3')?.textContent || '';
                document.getElementById('edit-title-press-start').value = el.querySelector('p')?.textContent || '';
            }
        } else if (elementId === 'profile-section') {
            document.getElementById('edit-profile-name').value = document.getElementById('profile-name')?.textContent || '';
            document.getElementById('edit-profile-level').value = document.getElementById('profile-level')?.textContent || '';
            document.getElementById('edit-profile-description').value = document.getElementById('profile-description')?.textContent || '';
        }
    });
    const profileSectionConfig = editableSections.find(s => s.elementId === 'profile-section');
    if (profileSectionConfig) { // section 'profile-section' ada di config
        document.getElementById('edit-profile-name').value = document.getElementById('profile-name')?.textContent || '';
        document.getElementById('edit-profile-level').value = document.getElementById('profile-level')?.textContent || '';
        document.getElementById('edit-profile-description').value = document.getElementById('profile-description')?.textContent || '';

        // Muat gambar profil ke pratinjau kecil di area input
        const actualProfilePic = document.getElementById('profile-picture');
        const actualProfilePicSrc = actualProfilePic?.getAttribute('src') || actualProfilePic?.src;
        const editorImagePreview = document.getElementById('edit-profile-image-preview');
        if (editorImagePreview) {
            editorImagePreview.src = actualProfilePicSrc || './aset/ikon.jpg'; // Fallback ke default jika tidak ada
        }
    }
    
    // Render rotating texts editor
    if (typeof renderRotatingTextsEditor === 'function') {
        renderRotatingTextsEditor();
    }
    
    updateAllPreviews(false); // Update semua preview berdasarkan data game asli yang baru dimuat ke input
}
//------------------- end fungsi load data ke input editor -------------------------//

//------------------- logika character menu editor -------------------------//
// Data struktur untuk menyimpan karakter game
let gameCharacters = []; // Array global untuk menyimpan data karakter

// Fungsi untuk menghasilkan ID unik sederhana
function generateUniqueId() {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper untuk mendapatkan teks konten dengan aman
function getText(element, selector) {
    const el = element.querySelector(selector);
    return el ? el.textContent.trim() : '';
}

// Helper untuk mendapatkan atribut dengan aman
function getAttr(element, selector, attribute) {
    const el = element.querySelector(selector);
    return el ? el.getAttribute(attribute) : null; // Kembalikan null jika tidak ada
}

// Fungsi untuk mengekstrak data karakter dari DOM #character-menu
function extractCharactersFromDOM() {
    console.log("Extracting characters from DOM...");
    const existingCharacters = [];
    const characterMenuMainContainer = document.querySelector('#character-menu .main-container');
    if (!characterMenuMainContainer) {
        console.error("#character-menu .main-container not found for extraction.");
        return existingCharacters; // Kembalikan array kosong jika kontainer tidak ditemukan
    }

    const characterCards = characterMenuMainContainer.querySelectorAll('.image-preview');
    characterCards.forEach((card, index) => {
        const name = getText(card, '.overlay .desc h1');
        // Mencoba mengambil deskripsi dari beberapa kemungkinan struktur
        let description = getText(card, '.overlay .desc p.summary');
        if (!description) { // Jika tidak ada p.summary, coba ambil dari p umum pertama
            description = getText(card, '.overlay .desc p');
        }
        let extendedDescription = '';
        const extendedContentP = card.querySelector('.overlay .desc .extended-content p');
        if (extendedContentP) {
            extendedDescription = extendedContentP.textContent.trim();
        }


        let mediaSrc = getAttr(card, 'img.character-image', 'src') || getAttr(card, 'video.video', 'src');
        let mediaType = 'unknown';
        if (mediaSrc) {
            const mediaElement = card.querySelector('img.character-image, video.video');
            if (mediaElement) {
                mediaType = mediaElement.tagName.toLowerCase() === 'img' ? 'image' : 'video';
                // Jika src adalah path lokal, coba buat path absolut sederhana (ini mungkin perlu penyesuaian)
                if (mediaSrc.startsWith('./')) {
                    // Untuk tujuan demo, kita akan biarkan seperti ini,
                    // tapi idealnya path harus dikelola dengan lebih baik di Electron
                }
            }
        } else {
            mediaSrc = './aset/placeholder.png'; // Fallback jika tidak ada media
            mediaType = 'image';
        }


        existingCharacters.push({
            id: generateUniqueId() + `_${index}`, // ID unik untuk setiap karakter
            name: name || `Character ${index + 1}`,
            description: description,
            extendedDescription: extendedDescription,
            mediaSrc: mediaSrc,
            mediaType: mediaType,
            originalElement: card.cloneNode(true) // Simpan klon elemen asli untuk referensi jika perlu
        });
    });
    console.log("Extracted characters:", existingCharacters);
    return existingCharacters;
}


// Fungsi untuk membuat dan menampilkan formulir edit untuk satu karakter
function renderCharacterEditForm(characterData) {
    const listContainer = document.getElementById('characterEditorListContainer');
    if (!listContainer) return;

    const placeholder = listContainer.querySelector('.character-list-empty-placeholder');
    if (placeholder) placeholder.style.display = 'none'; // Sembunyikan placeholder

    const characterId = characterData.id || generateUniqueId();

    let mediaPreviewHTML;
    if (characterData.mediaType === 'video') {
        mediaPreviewHTML = `
<video class="media-thumbnail-preview" id="mediaThumb_${characterId}" src="${characterData.mediaSrc || ''}" muted autoplay loop playsinline>
</video>`;
    } else {
        mediaPreviewHTML = `
<img src="${characterData.mediaSrc || './aset/placeholder.png'}" alt="Media Preview" class="media-thumbnail-preview" id="mediaThumb_${characterId}">`;
    }

    const mediaInputGroupHTML = `
    <div class="form-group">
        <label>Character Media:</label>
        <div class="media-input-wrapper">
            <div class="media-preview-container" style="display: flex; flex-direction: column; align-items: center; gap: 5px;">
                ${mediaPreviewHTML}
                <span class="current-media-file-display" style="font-size: 0.8rem; color: #aaa; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    Current: ${characterData.mediaSrc ? characterData.mediaSrc.split('/').pop() : 'None'}
                </span>
            </div>
            <div class="media-input-controls">
                <input type="file" id="charMedia_${characterId}" class="char-media-input" accept="image/*,video/*">
                <label for="charMedia_${characterId}" class="custom-file-input-label">
                    Choose File...
                </label>
            </div>
        </div>
    </div>
    `;

    // Gabungkan semua bagian HTML untuk character-edit-item
    const itemHTML = `
        <div class="character-edit-item" data-character-id="${characterId}">
            <div class="character-edit-header">
                <span class="character-edit-name-display">${characterData.name || 'New Character'}</span>
                <button class="button-remove-character" data-id="${characterId}" title="Remove this character">Remove</button>
            </div>
            <div class="character-edit-body">
                <div class="form-group">
                    <label for="charName_${characterId}">Character Name:</label>
                    <input type="text" id="charName_${characterId}" class="char-name-input" value="${characterData.name || ''}" placeholder="Enter character name">
                </div>
                <div class="form-group">
                    <label for="charDesc_${characterId}">Description (Summary):</label>
                    <textarea id="charDesc_${characterId}" class="char-desc-input" placeholder="Enter short description">${characterData.description || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="charExtDesc_${characterId}">Extended Description (Optional):</label>
                    <textarea id="charExtDesc_${characterId}" class="char-ext-desc-input" placeholder="Enter extended description (for 'More' button)">${characterData.extendedDescription || ''}</textarea>
                </div>

                ${mediaInputGroupHTML}

            </div>
        </div>
    `;
    listContainer.insertAdjacentHTML('beforeend', itemHTML);

    // Tambahkan event listener untuk input file pada item yang baru dibuat
    const fileInput = listContainer.querySelector(`#charMedia_${characterId}`);
    const formGroup = fileInput.closest('.form-group'); // Dapatkan parent .form-group

    if (fileInput && formGroup) {
        fileInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const dataURL = e.target.result;
                    let existingPreview = formGroup.querySelector('.media-thumbnail-preview');
                    let newPreviewElement;

                    // Hapus pratinjau lama jika ada
                    if (existingPreview) {
                        existingPreview.remove();
                    }

                    if (file.type.startsWith('video/')) {
                        newPreviewElement = document.createElement('video');
                        newPreviewElement.src = dataURL;
                        newPreviewElement.muted = true;
                        newPreviewElement.autoplay = true;
                        newPreviewElement.loop = true;
                        newPreviewElement.playsInline = true;
                        newPreviewElement.textContent = "Browser Anda tidak mendukung tag video."; // Fallback
                    } else if (file.type.startsWith('image/')) {
                        newPreviewElement = document.createElement('img');
                        newPreviewElement.src = dataURL;
                        newPreviewElement.alt = "Media Preview";
                    } else {
                        // Tipe file tidak didukung, mungkin tampilkan placeholder
                        newPreviewElement = document.createElement('img');
                        newPreviewElement.src = './aset/placeholder.png'; // Placeholder umum
                        newPreviewElement.alt = "Unsupported File Type";
                    }

                    if (newPreviewElement) {
                        newPreviewElement.className = 'media-thumbnail-preview'; // Terapkan kelas CSS yang sama
                        newPreviewElement.id = `mediaThumb_${characterId}`; // Berikan ID yang konsisten
                        // Terapkan style inline yang penting jika tidak semua ada di CSS
                        newPreviewElement.style.width = "80px";
                        newPreviewElement.style.height = "160px";
                        newPreviewElement.style.objectFit = "cover";
                        newPreviewElement.style.backgroundColor = "#2a2c2e";
                        newPreviewElement.style.borderRadius = "4px";
                        newPreviewElement.style.marginTop = "8px";
                        newPreviewElement.style.display = "block";
                        newPreviewElement.style.border = "1px solid #383a3c";

                        // Simpan informasi file baru untuk disimpan nanti
                        newPreviewElement.dataset.newMediaDataUrl = dataURL;
                        newPreviewElement.dataset.newMediaName = file.name;
                        newPreviewElement.dataset.newMediaType = file.type.startsWith('video/') ? 'video' : 'image';


                        // Sisipkan elemen pratinjau baru sebelum span .current-media-file-display
                        const currentMediaDisplaySpan = formGroup.querySelector('.current-media-file-display');
                        const previewContainer = formGroup.querySelector('.media-preview-container');

                        if (previewContainer && currentMediaDisplaySpan) {
                            previewContainer.insertBefore(newPreviewElement, currentMediaDisplaySpan);
                        } else if (currentMediaDisplaySpan) {
                            currentMediaDisplaySpan.insertAdjacentElement('beforebegin', newPreviewElement);
                        } else {
                            // Fallback jika span tidak ada
                            const wrapper = formGroup.querySelector('.media-input-wrapper');
                            if (wrapper) wrapper.prepend(newPreviewElement);
                        }

                        if (newPreviewElement.tagName.toLowerCase() === 'video') {
                            newPreviewElement.play().catch(err => console.log("Autoplay video preview gagal:", err));
                        }

                        updateSpecificPreview('character-menu', true);
                    }
                }
                reader.readAsDataURL(file);

                const currentMediaDisplay = fileInput.closest('.media-input-wrapper').querySelector('.current-media-file-display');
                if (currentMediaDisplay) currentMediaDisplay.textContent = `New: ${file.name}`;
            }
        });
    }
    // Tambahkan event listener untuk tombol remove
    const removeButton = listContainer.querySelector(`.button-remove-character[data-id="${characterId}"]`);
    if (removeButton) {
        removeButton.addEventListener('click', function () {
            const charIdToRemove = this.dataset.id;
            const itemToRemove = document.querySelector(`.character-edit-item[data-character-id="${charIdToRemove}"]`);
            if (itemToRemove) {
                const charToRemove = gameCharacters.find(char => char.id === charIdToRemove);
                // Jangan menghapus berkas sebelum tombol Save ditekan. Jika pengguna
                // membatalkan keluar dari editor, media lama tetap aman.
                if (charToRemove?.mediaSrc?.startsWith('file:')) {
                    pendingMediaDeletes.push(charToRemove.mediaSrc);
                }
                itemToRemove.remove();
                gameCharacters = gameCharacters.filter(char => char.id !== charIdToRemove);
                isEditorDirty = true;
                if (listContainer.children.length === 1 && listContainer.querySelector('.character-list-empty-placeholder')) { // Jika hanya placeholder yg tersisa
                    listContainer.querySelector('.character-list-empty-placeholder').style.display = 'block';
                }
                updateSpecificPreview('character-menu', true);
            }
        });
    }
}

function loadCharacterDataForEditor() {
    console.log("Loading character data for editor...");
    const listContainer = document.getElementById('characterEditorListContainer');
    if (!listContainer) {
        console.error("#characterEditorListContainer not found.");
        return;
    }
    // Kosongkan kontainer sebelum memuat (kecuali placeholder)
    listContainer.innerHTML = `<p class="character-list-empty-placeholder" style="display: none; text-align: center; color: #777; margin: 20px 0;">Belum ada karakter. Klik "Tambah Karakter Baru" untuk memulai.</p>`;


    const savedState = getPersistedEditorState();
    if (hasPersistedEditorValue('characters')) {
        // Array kosong adalah pilihan pengguna yang sah, jadi jangan jatuh ke default.
        gameCharacters = Array.isArray(savedState.characters) ? savedState.characters : [];
    } else if (gameCharacters.length === 0) {
        gameCharacters = extractCharactersFromDOM();
    }


    if (gameCharacters.length === 0) {
        const placeholder = listContainer.querySelector('.character-list-empty-placeholder');
        if (placeholder) placeholder.style.display = 'block';
        console.log("No characters to display in editor.");
    } else {
        gameCharacters.forEach(charData => {
            renderCharacterEditForm(charData);
        });
    }

    updateSpecificPreview('character-menu', true);
}

function moreButtonHandler(e) {
    e.stopPropagation();
    console.log('[Debug Tombol More] Handler dipanggil');
    const btn = e.currentTarget;
    console.log('[Debug Tombol More] Tombol yang diklik:', btn);
    console.log('[Debug Tombol More] Teks tombol saat ini:', btn.textContent);
    const desc = btn.closest('.desc');
    console.log('[Debug Tombol More] Elemen .desc ditemukan:', desc ? 'Ya' : 'Tidak');
    if (!desc) {
        console.error('[Debug Tombol More] MASALAH: Elemen .desc tidak ditemukan sebagai parent dari tombol!');
        console.log('[Debug Tombol More] Parent elements:', btn.parentElement?.tagName, btn.parentElement?.parentElement?.tagName);
        return;
    }
    const extended = desc.querySelector('.extended-content');
    console.log('[Debug Tombol More] Elemen .extended-content ditemukan:', extended ? 'Ya' : 'Tidak');
    if (extended) {
        console.log('[Debug Tombol More] Class sebelum toggle:', extended.className);
        extended.classList.toggle('show');
        const isShowing = extended.classList.contains('show');
        btn.textContent = isShowing ? 'Less' : 'More';
        console.log('[Debug Tombol More] Toggle berhasil!');
        console.log('[Debug Tombol More] - Status show sekarang:', isShowing);
        console.log('[Debug Tombol More] - Class setelah toggle:', extended.className);
        console.log('[Debug Tombol More] - Computed max-height:', window.getComputedStyle(extended).maxHeight);
        console.log('[Debug Tombol More] - Computed opacity:', window.getComputedStyle(extended).opacity);
    } else {
        console.error('[Debug Tombol More] MASALAH: Elemen .extended-content tidak ditemukan di dalam .desc!');
        console.log('[Debug Tombol More] Isi HTML .desc:');
        console.log(desc.innerHTML);
    }
}

function bindMoreButtons(root = document) {
    const buttons = root.querySelectorAll('.more-button');
    console.log('[Debug Tombol More] bindMoreButtons dipanggil pada:', root.id || root.className || root.tagName || 'document');
    console.log('[Debug Tombol More] Jumlah tombol More ditemukan:', buttons.length);
    
    buttons.forEach((button, index) => {
        // Cek apakah sudah ada listener terpasang
        if (button.hasAttribute('data-more-listener-bound')) {
            console.log(`[Debug Tombol More] Tombol #${index + 1} sudah memiliki listener, melewati...`);
            return;
        }
        
        console.log(`[Debug Tombol More] Mengikat listener ke tombol #${index + 1}`);
        button.addEventListener('click', moreButtonHandler);
        button.setAttribute('data-more-listener-bound', 'true');
        
        // Verifikasi struktur DOM
        const parentDesc = button.closest('.desc');
        const extContent = parentDesc?.querySelector('.extended-content');
        console.log(`[Debug Tombol More] Tombol #${index + 1} verifikasi:`, {
            parentDescAda: !!parentDesc,
            extendedContentAda: !!extContent,
            extendedContentClass: extContent?.className || '(tidak ada)'
        });
    });
}

// Kumpulkan karakter dari form dan tulis berkas media baru ke userData. State
// JSON-nya sendiri ditulis bersama seluruh editor oleh tombol Save Changes.
window.saveCharacterMenuData = async function () {
    const updatedCharacters = [];
    const editItems = document.querySelectorAll('#characterEditorListContainer .character-edit-item');

    for (const item of editItems) {
        const id = item.dataset.characterId;
        const nameInput = item.querySelector('.char-name-input');
        const descInput = item.querySelector('.char-desc-input');
        const extDescInput = item.querySelector('.char-ext-desc-input');
        const mediaThumb = item.querySelector('.media-thumbnail-preview');
        const originalCharacter = gameCharacters.find(char => char.id === id) || {};

        let mediaSrc = originalCharacter.mediaSrc || '';
        let mediaType = originalCharacter.mediaType || 'image';

        if (mediaThumb?.dataset.newMediaDataUrl) {
            const oldMediaSrc = mediaSrc;
            mediaType = mediaThumb.dataset.newMediaType || 'image';
            const mediaResult = await ipcRenderer.invoke('game-editor:save-media', {
                fileName: mediaThumb.dataset.newMediaName || `character-${id}`,
                dataUrl: mediaThumb.dataset.newMediaDataUrl
            });
            if (!mediaResult?.success) {
                throw new Error(mediaResult?.error || `Media untuk ${nameInput?.value || 'karakter'} gagal disimpan.`);
            }
            mediaSrc = mediaResult.path;
            if (oldMediaSrc?.startsWith('file:') && oldMediaSrc !== mediaSrc) {
                pendingMediaDeletes.push(oldMediaSrc);
            }
            mediaThumb.setAttribute('src', mediaSrc);
            delete mediaThumb.dataset.newMediaDataUrl;
            delete mediaThumb.dataset.newMediaName;
            delete mediaThumb.dataset.newMediaType;
        } else if (mediaThumb) {
            mediaType = mediaThumb.tagName.toLowerCase() === 'video' ? 'video' : 'image';
            // getAttribute mempertahankan path relatif aset bawaan. .src akan
            // mengubahnya menjadi file:///.../resources/app dan mudah putus
            // saat aplikasi dipindahkan atau diperbarui.
            mediaSrc = mediaThumb.getAttribute('src') || mediaSrc;
        }

        updatedCharacters.push({
            id,
            name: nameInput?.value ?? '',
            description: descInput?.value ?? '',
            extendedDescription: extDescInput?.value ?? '',
            mediaSrc,
            mediaType
        });
    }

    gameCharacters = updatedCharacters;
    updateOriginalCharacterMenuDOM();
    setupCharacterMenuPreview();
    return gameCharacters;
};


// untuk memperbarui DOM #character-menu berdasarkan array gameCharacters
function updateOriginalCharacterMenuDOM() {
    const mainMenuContainer = document.querySelector('#character-menu .main-container');
    if (!mainMenuContainer) {
        console.error("Cannot update original character menu: .main-container not found.");
        return;
    }
    mainMenuContainer.innerHTML = ''; // Kosongkan kontainer utama

    if (gameCharacters.length === 0) {
        mainMenuContainer.innerHTML = '<p style="color: #555; text-align: center; padding: 20px;">No characters defined.</p>';
        return;
    }

    gameCharacters.forEach(charData => {

        let mediaElementHTML;
        if (charData.mediaType === 'video') {
            mediaElementHTML = `<video muted loop class="video" src="${charData.mediaSrc}"></video>`;
        } else { // default ke image
            mediaElementHTML = `<img class="video character-image" src="${charData.mediaSrc}" alt="Deskripsi Gambar ${charData.name}">`;
        }

        const summaryHTML = charData.description ? `<p class="summary">${charData.description}</p>` : '';
        let extendedContentHTML = '';
        let moreButtonHTML = '';

        console.log(`[Debug Menu Karakter] Memproses karakter: ${charData.name}`);
        console.log(`[Debug Menu Karakter] - extendedDescription ada:`, !!charData.extendedDescription);
        console.log(`[Debug Menu Karakter] - Isi extendedDescription:`, charData.extendedDescription || '(kosong)');
        
        if (charData.extendedDescription) {
            extendedContentHTML = `
        <div class="extended-content">
          <p>${charData.extendedDescription}</p>
        </div>`;
            moreButtonHTML = `<button class="more-button">More</button>`;
            console.log(`[Debug Menu Karakter] - Tombol More AKAN ditambahkan untuk ${charData.name}`);
        } else {
            console.log(`[Debug Menu Karakter] - Tombol More TIDAK ditambahkan (extendedDescription kosong)`);
        }

        const cardHTML = `
    <div class="image-preview">
        ${mediaElementHTML}
        <div class="overlay">
            <div class="desc">
                <div class="name-and-role">
                    <h1>${charData.name}</h1>
                </div>
                ${summaryHTML}
                ${extendedContentHTML}
                ${moreButtonHTML}
            </div>
        </div>
    </div>
`;
        mainMenuContainer.insertAdjacentHTML('beforeend', `
<div class="image-preview">
    ${mediaElementHTML}
    <div class="overlay">
    <div class="desc">
        <h1>${charData.name}</h1>
        ${summaryHTML}
        ${extendedContentHTML}
        ${moreButtonHTML}
    </div>
    </div>
</div>
`);
    });

    console.log('[Debug Menu Karakter] Selesai membuat semua kartu karakter. Jumlah:', gameCharacters.length);
    console.log('[Debug Menu Karakter] Memanggil bindMoreButtons pada mainMenuContainer...');
    bindMoreButtons(mainMenuContainer);
    
    // Verifikasi tombol More setelah binding
    const moreButtonsAfterBind = mainMenuContainer.querySelectorAll('.more-button');
    console.log('[Debug Menu Karakter] Jumlah tombol More setelah render:', moreButtonsAfterBind.length);
    moreButtonsAfterBind.forEach((btn, i) => {
        const parentDesc = btn.closest('.desc');
        const extendedContent = parentDesc?.querySelector('.extended-content');
        console.log(`[Debug Menu Karakter] Tombol More #${i + 1}:`, {
            parentDescAda: !!parentDesc,
            extendedContentAda: !!extendedContent,
            extendedContentHTML: extendedContent?.innerHTML?.substring(0, 100) || '(tidak ada)'
        });
    });

    // Re-inisialisasi logika untuk menu karakter utama (hover, dll.)
    // initializeCharacterMenuLogic dapat menangani elemen yang baru dibuat
    const originalCharMenu = document.getElementById('character-menu');
    if (originalCharMenu) {
        initializeCharacterMenuLogic(originalCharMenu);
    }
    // Juga re-inisialisasi logika untuk gambar yang mungkin video
    const imagePreviewsInMainMenu = document.querySelectorAll("#character-menu .image-preview");
    imagePreviewsInMainMenu.forEach(preview => {
        let mediaElement = preview.querySelector(".video"); // Bisa jadi img atau video dengan class .video
        if (mediaElement) {
            let src = mediaElement.getAttribute("src");
            if (src && (mediaElement.tagName.toLowerCase() === 'video' && src.match(/\.(jpg|jpeg|png|gif|webp)$/i))) {
                // Jika ini tag video tapi src-nya gambar, ganti jadi img
                let imgElement = document.createElement("img");
                imgElement.src = src;
                imgElement.classList.add("character-image", "video");
                imgElement.style.width = "100%";
                imgElement.style.height = "100%";
                imgElement.style.objectFit = "cover";
                mediaElement.replaceWith(imgElement);
            }
        }
    });
    initializeCharacterMenuLogic(mainMenuContainer);
}

// Event listener untuk tombol "Tambah Karakter Baru"
const addNewCharButton = document.getElementById('buttonAddNewCharacter');
if (addNewCharButton) {
    addNewCharButton.addEventListener('click', () => {
        const newCharData = {
            id: generateUniqueId(), // ID unik untuk karakter baru
            name: '',
            description: '',
            extendedDescription: '',
            mediaSrc: './aset/default-character.png', // Path ke gambar placeholder
            mediaType: 'image'
        };
        // Tambahkan ke array global dulu, meskipun masih kosong
        // Ini penting jika pengguna menyimpan tanpa mengubah apa pun
        gameCharacters.push(newCharData);
        renderCharacterEditForm(newCharData); // Tampilkan formulir kosong
        isEditorDirty = true;
        console.log("Added new blank character form.");
        updateSpecificPreview('character-menu', true);
    });
}

function initializeCharacterMenuLogic(rootElement) {
    if (!rootElement) return;

    const imagePreviews = rootElement.querySelectorAll(".image-preview");

    imagePreviews.forEach(previewCard => {
        let mediaElement = previewCard.querySelector("video, img.character-image");

        // Event listener untuk efek hover (memperbesar/memperkecil kartu)
        previewCard.addEventListener("mouseenter", () => {
            if (rootElement.classList.contains("animating")) return;

            imagePreviews.forEach(p => {
                if (p === previewCard) {
                    p.style.flexGrow = "1.5";
                    p.classList.remove("dim");
                } else {
                    p.style.flexGrow = "0.8";
                    p.classList.add("dim");
                    let otherMedia = p.querySelector("video");
                    if (otherMedia) otherMedia.pause();
                }
            });

            if (mediaElement && mediaElement.tagName.toLowerCase() === "video" && mediaElement.paused) {
                mediaElement.play().catch(e => console.warn("Pratinjau: Video play gagal", e));
            }
        });

        // Event listener untuk mengembalikan ukuran saat kursor keluar
        rootElement.addEventListener("mouseleave", () => {
            imagePreviews.forEach(p => {
                p.style.flexGrow = "1";
                p.classList.remove("dim");
                let otherMedia = p.querySelector("video");
                if (otherMedia) otherMedia.pause();
            });
        });

        previewCard.addEventListener("mouseleave", () => {
            imagePreviews.forEach(other => {
                // other.style.flexGrow = "1"; // Kembali ke flex-grow default
                other.classList.remove("dim");
                other.classList.remove('preview-expanded'); // Hapus class expand
                let otherMedia = other.querySelector("video");
                if (otherMedia) otherMedia.pause();
            });
        });

        // CATATAN: Binding tombol More sekarang ditangani oleh bindMoreButtons()
        // Tidak perlu menambahkan listener di sini lagi untuk menghindari duplikasi
    });
    
    // Gunakan bindMoreButtons untuk mengikat event listener pada tombol More
    // Ini memastikan tidak ada duplikasi listener
    console.log('[Debug initializeCharacterMenuLogic] Memanggil bindMoreButtons untuk root:', rootElement.id || rootElement.className || rootElement.tagName);
    bindMoreButtons(rootElement);
    
    // Inisialisasi untuk video yang diganti gambar (jika ada)
    rootElement.querySelectorAll(".image-preview").forEach(preview => {
        let mediaElement = preview.querySelector(".video");
        if (mediaElement) {
            let src = mediaElement.getAttribute("src");
            if (src && src.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                let imgElement = document.createElement("img");
                imgElement.src = src;
                imgElement.classList.add("character-image"); // tambahkan class yang sama seperti di Character Menu asli
                imgElement.classList.add("video"); // Tetap beri class "video" agar selector lain masih bekerja
                imgElement.style.width = "100%";
                imgElement.style.height = "100%";
                imgElement.style.objectFit = "cover";
                mediaElement.replaceWith(imgElement);
            }
        }
    });
}

// Panggil fungsi ini untuk character-menu asli saat DOM siap
document.addEventListener("DOMContentLoaded", () => {
    const originalCharMenu = document.getElementById('character-menu');
    if (originalCharMenu) {
        initializeCharacterMenuLogic(originalCharMenu);
    }
});

//------------------- ( Rotating Texts Editor Logic ) -------------------------//

// Render semua rotating text items ke editor
function renderRotatingTextsEditor() {
    const container = document.getElementById('rotating-texts-list-container');
    if (!container) return;

    container.innerHTML = '';

    if (rotatingTexts.length === 0) {
        container.innerHTML = '<p style="color: #777; text-align: center; padding: 10px;">Belum ada rotating text. Klik tombol di bawah untuk menambah.</p>';
        return;
    }

    rotatingTexts.forEach((text, index) => {
        const item = document.createElement('div');
        item.className = 'rotating-text-item';
        item.dataset.index = index;
        item.innerHTML = `
            <span class="drag-handle" title="Drag untuk mengurutkan">⋮⋮</span>
            <input type="text" class="rotating-text-input" value="${escapeHtml(text)}" placeholder="Masukkan teks..." />
            <button type="button" class="remove-rotating-text-btn" title="Hapus">✕</button>
        `;
        container.appendChild(item);
    });

    // Add event listeners
    container.querySelectorAll('.rotating-text-input').forEach((input, index) => {
        input.addEventListener('input', () => {
            rotatingTexts[index] = input.value;
            isEditorDirty = true;
        });
    });

    container.querySelectorAll('.remove-rotating-text-btn').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            rotatingTexts.splice(index, 1);
            renderRotatingTextsEditor();
            isEditorDirty = true;
        });
    });
}

// Helper untuk escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listener untuk tombol tambah rotating text
document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-rotating-text-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            rotatingTexts.push('');
            renderRotatingTextsEditor();
            isEditorDirty = true;
            // Focus ke input terakhir
            setTimeout(() => {
                const inputs = document.querySelectorAll('#rotating-texts-list-container .rotating-text-input');
                if (inputs.length > 0) {
                    inputs[inputs.length - 1].focus();
                }
            }, 50);
        });
    }
});

async function loadDefaultCharacterData() {
    if (!defaultCharacterDataPromise) {
        defaultCharacterDataPromise = fetch('./aset/konten/character_data.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .catch(error => {
                console.error('[GameEditor] Gagal memuat data karakter bawaan:', error);
                return {};
            });
    }
    return defaultCharacterDataPromise;
}

function convertDefaultCharacters(characters) {
    if (!Array.isArray(characters)) return [];
    return characters.map((character, index) => ({
        id: `default-character-${index}`,
        name: character?.name ?? `Character ${index + 1}`,
        description: character?.descValues?.description ?? character?.descValues?.summary ?? '',
        extendedDescription: character?.descValues?.extended ?? '',
        mediaSrc: character?.source ?? './aset/placeholder.png',
        mediaType: character?.type === 'video' ? 'video' : 'image'
    }));
}

function hasPersistedProfileContent() {
    const state = getPersistedEditorState();
    return hasPersistedEditorValue('content') && state.content && hasOwn(state.content, 'profile-section');
}

function applyDefaultProfile(profile) {
    if (!profile || hasPersistedProfileContent()) return;
    const name = document.getElementById('profile-name');
    const level = document.getElementById('profile-level');
    const description = document.getElementById('profile-description');
    if (name && typeof profile.name === 'string') name.textContent = profile.name;
    if (level && typeof profile.level === 'string') level.textContent = profile.level;
    if (description && typeof profile.description === 'string') description.textContent = profile.description;
}

// State tersimpan, termasuk [], selalu menang atas data bawaan.
async function loadRotatingTexts() {
    await getGameEditorStore()?.ready;
    const state = getPersistedEditorState();
    if (hasPersistedEditorValue('rotatingTexts')) {
        rotatingTexts = Array.isArray(state.rotatingTexts) ? state.rotatingTexts : [];
        return;
    }

    const defaults = await loadDefaultCharacterData();
    rotatingTexts = Array.isArray(defaults.rotatingTexts) ? defaults.rotatingTexts.map(text => String(text)) : rotatingTexts;
}

function normalizeRotatingTextsForSave() {
    // Nilai kosong di dalam daftar dibuang seperti perilaku UI sebelumnya, tetapi
    // array kosong hasilnya tetap disimpan sebagai array kosong yang valid.
    rotatingTexts = rotatingTexts.filter(text => String(text).trim() !== '');
    return rotatingTexts;
}

async function hydrateGameEditorState() {
    await getGameEditorStore()?.ready;
    const state = getPersistedEditorState();
    const needsDefaultCharacters = !hasPersistedEditorValue('characters');
    const needsDefaultRotatingTexts = !hasPersistedEditorValue('rotatingTexts');
    const needsDefaultProfile = !hasPersistedProfileContent();
    const defaults = (needsDefaultCharacters || needsDefaultRotatingTexts || needsDefaultProfile)
        ? await loadDefaultCharacterData()
        : null;

    if (hasPersistedEditorValue('characters')) {
        gameCharacters = Array.isArray(state.characters) ? state.characters : [];
    } else if (defaults) {
        gameCharacters = convertDefaultCharacters(defaults.characters);
    }

    if (needsDefaultProfile && defaults) applyDefaultProfile(defaults.profile);
    await loadRotatingTexts();
    updateOriginalCharacterMenuDOM();
    loadAllEditableContentFromLocalStorage();
}

async function initializeGameEditorState() {
    if (!gameEditorBootstrapPromise) {
        gameEditorBootstrapPromise = hydrateGameEditorState();
    }
    return gameEditorBootstrapPromise;
}

async function restoreSavedGameEditorState() {
    pendingMediaDeletes = [];
    await hydrateGameEditorState();
    setupCharacterMenuPreview();
}
//------------------- ( End Rotating Texts Editor Logic ) -------------------------//

function setupCharacterMenuPreview() {
    console.log("Memulai setupCharacterMenuPreview (versi replika konten)...");

    const originalCharMenuMainContainer = document.querySelector('#character-menu .main-container');
    const previewContentArea = document.getElementById('live-preview-character-menu-content');
    const previewBox = document.getElementById('preview-character-menu-box'); // Box luar untuk referensi ukuran jika perlu

    if (!originalCharMenuMainContainer) {
        console.error("Elemen asli '#character-menu .main-container' tidak ditemukan.");
        if (previewContentArea) previewContentArea.innerHTML = '<p style="color:red;">Error: Konten asli tidak ditemukan.</p>';
        return;
    }
    if (!previewContentArea) {
        console.error("Elemen '#live-preview-character-menu-content' untuk pratinjau tidak ditemukan.");
        return;
    }
    if (!previewBox) {
        console.error("Elemen '.preview-box' (#preview-character-menu-box) tidak ditemukan.");
        return;
    }

    // 1. Bersihkan area pratinjau
    previewContentArea.innerHTML = '';

    // 2. Kloning .main-container dari #character-menu asli
    const clonedMainContainer = originalCharMenuMainContainer.cloneNode(true);

    // 3. Modifikasi ID dan style dasar untuk kloningan agar pas di preview box
    clonedMainContainer.id = 'character-menu-preview-instance'; // ID unik untuk instance pratinjau
    clonedMainContainer.style.width = '100%';
    clonedMainContainer.style.height = '100%';
    clonedMainContainer.style.display = 'flex'; // Sudah ada dari CSS asli, tapi untuk memastikan
    clonedMainContainer.style.flexDirection = 'row'; // Sudah ada dari CSS asli
    clonedMainContainer.style.overflow = 'hidden'; // Penting agar konten tidak meluber
    clonedMainContainer.style.backgroundColor = '#000'; // Latar belakang untuk kontainer pratinjau
    clonedMainContainer.style.position = 'relative'; // Memastikan posisi absolut anak-anaknya relatif terhadap ini

    // 4. Sesuaikan kartu-kartu di dalam kloningan
    const previewCards = clonedMainContainer.querySelectorAll('.image-preview');
    previewCards.forEach(card => {
        // Hapus animasi asli dan pastikan kartu terlihat
        card.style.animation = 'none';
        card.style.opacity = '1';

        // Sesuaikan ukuran font untuk teks di overlay agar lebih kecil dan terbaca
        const descElements = card.querySelectorAll('.overlay .desc h1, .overlay .desc p');
        descElements.forEach(textEl => {
            if (textEl.tagName === 'H1') {
                textEl.style.fontSize = '0.7rem'; // Ukuran font nama karakter
                textEl.style.marginBottom = '3px';
            } else if (textEl.tagName === 'P') {
                textEl.style.fontSize = '0.6rem'; // Ukuran font deskripsi
                textEl.style.lineHeight = '1.2';
            }
        });
        const moreButton = card.querySelector('.more-button');
        if (moreButton) {
            moreButton.style.fontSize = '0.6rem';
            moreButton.style.padding = '2px 4px';
            moreButton.style.marginTop = '4px';
        }

        const overlayElement = card.querySelector('.overlay');
        if (overlayElement) {
            // Mungkin perlu mengurangi tinggi overlay agar video/gambar lebih terlihat
            overlayElement.style.height = '35%'; // Misalnya
            overlayElement.style.padding = '10px'; // Kurangi padding
        }

        // video di-mute dan di-loop, serta di-pause awalnya
        const video = card.querySelector('video');
        if (video) {
            video.muted = true;
            video.loop = true;
            video.pause();
            video.style.borderRight = 'none'; // Hapus border jika ada dari style asli
        }
        const image = card.querySelector('img.character-image');
        if (image) {
            image.style.borderRight = 'none';
        }
        card.style.borderRight = '1px solid #222';
    });
    if (previewCards.length > 0) {
        previewCards[previewCards.length - 1].style.borderRight = 'none'; // Hapus border di kartu terakhir
    }


    previewContentArea.appendChild(clonedMainContainer);

    initializeCharacterMenuLogic(clonedMainContainer);

    console.log("setupCharacterMenuPreview (versi replika konten) selesai.");
}

async function saveProfileImageFromEditor() {
    const preview = document.getElementById('edit-profile-image-preview');
    if (!preview?.dataset.newMediaDataUrl) return;

    const oldMediaSrc = preview.getAttribute('src');

    const mediaResult = await ipcRenderer.invoke('game-editor:save-media', {
        fileName: preview.dataset.newMediaName || 'profile-picture',
        dataUrl: preview.dataset.newMediaDataUrl
    });
    if (!mediaResult?.success) {
        throw new Error(mediaResult?.error || 'Gambar profil gagal disimpan.');
    }

    preview.src = mediaResult.path;
    if (oldMediaSrc?.startsWith('file:') && oldMediaSrc !== mediaResult.path) {
        pendingMediaDeletes.push(oldMediaSrc);
    }
    delete preview.dataset.newMediaDataUrl;
    delete preview.dataset.newMediaName;
}

// --- FUNGSI UNTUK MENYIMPAN SEMUA PERUBAHAN DARI SEMUA INPUT FIELD ---
async function saveAllEditorChanges() {
    await saveProfileImageFromEditor();

    editableSections.forEach(section => {
        const elementId = section.elementId;
        if (elementId === 'warning-screen') {
            const el = screens.find(s => s.id === 'warning-screen');
            if (el) {
                el.querySelectorAll('p')[0].textContent = document.getElementById('edit-warning-text-1').value;
                el.querySelectorAll('p')[1].textContent = document.getElementById('edit-warning-text-2').value;
            }
        } else if (elementId === 'developer-screen') {
            const el = screens.find(s => s.id === 'developer-screen');
            if (el) {
                el.querySelector('h2').textContent = document.getElementById('edit-developer-title').value;
                el.querySelector('h4').textContent = document.getElementById('edit-developer-subtitle').value;
            }
        } else if (elementId === 'concept-screen') {
            const el = screens.find(s => s.id === 'concept-screen');
            if (el) {
                el.querySelector('h2').textContent = document.getElementById('edit-disclaimer-title').value;
                el.querySelector('p').textContent = document.getElementById('edit-disclaimer-text').value;
            }
        } else if (elementId === 'title-screen') {
            const el = screens.find(s => s.id === 'title-screen');
            if (el) {
                const h1El = el.querySelector('h1');
                setTitleHeadingText(h1El, document.getElementById('edit-title-main').value);
                el.querySelector('h3').textContent = document.getElementById('edit-title-subtitle').value;
                el.querySelector('p').textContent = document.getElementById('edit-title-press-start').value;
            }
        } else if (elementId === 'profile-section') {
            // Simpan teks
            const profileNameElement = document.getElementById('profile-name'); // Elemen game asli
            if (profileNameElement) profileNameElement.textContent = document.getElementById('edit-profile-name').value;

            const profileLevelElement = document.getElementById('profile-level'); // Elemen game asli
            if (profileLevelElement) profileLevelElement.textContent = document.getElementById('edit-profile-level').value;

            const profileDescriptionElement = document.getElementById('profile-description'); // Elemen game asli
            if (profileDescriptionElement) profileDescriptionElement.textContent = document.getElementById('edit-profile-description').value;

            // Simpan gambar profil
            const actualProfilePicElement = document.getElementById('profile-picture'); // Elemen game asli
            const editorImagePreview = document.getElementById('edit-profile-image-preview');
            const editorImagePreviewSrc = editorImagePreview?.getAttribute('src') || editorImagePreview?.src;
            if (actualProfilePicElement && editorImagePreviewSrc) {
                actualProfilePicElement.setAttribute('src', editorImagePreviewSrc);
            }
        }
        updateSpecificPreview(elementId, false); // Update preview berdasarkan data game asli yang baru saja diubah
    });

    normalizeRotatingTextsForSave();
    await window.saveCharacterMenuData();

    const content = collectAllEditableContent();
    const store = getGameEditorStore();
    if (!store) throw new Error('Penyimpanan Game Editor belum siap.');
    store.update({
        content,
        characters: gameCharacters,
        rotatingTexts
    });
    await store.persist();

    editableContent = content;
    syncLegacyEditorStorage(content);

    // Hapus media lama hanya setelah state baru sudah aman tersimpan.
    const mediaInUse = new Set(gameCharacters.map(character => character.mediaSrc));
    const profileMediaSrc = document.getElementById('profile-picture')?.getAttribute('src');
    if (profileMediaSrc) mediaInUse.add(profileMediaSrc);
    const mediaToDelete = [...new Set(pendingMediaDeletes)].filter(mediaSrc => !mediaInUse.has(mediaSrc));
    pendingMediaDeletes = [];
    await Promise.all(mediaToDelete.map(async mediaSrc => {
        const result = await ipcRenderer.invoke('game-editor:delete-media', { mediaSrc });
        if (!result?.success) console.warn('[GameEditor] Media lama tidak dapat dihapus:', result?.error);
    }));

    updateAllPreviews(false); // Update pratinjau kiri setelah menyimpan
}

// Event listener untuk tombol "Save Changes"
if (saveEditorChangesBtn) {
    saveEditorChangesBtn.addEventListener('click', async () => {
        saveEditorChangesBtn.disabled = true;
        try {
            await saveAllEditorChanges();
            isEditorDirty = false;
            showNotification('All changes saved successfully!', 'notification-success');
        } catch (error) {
            console.error('[GameEditor] Gagal menyimpan perubahan:', error);
            showNotification(`Error saving changes: ${error.message}`, 'notification-error');
        } finally {
            saveEditorChangesBtn.disabled = false;
        }
    });
}

// Tombol untuk membuka Game Editor dari Main Menu
if (gameEditorButton) {
    gameEditorButton.addEventListener('click', async () => {
        await initializeGameEditorState();
        const mainMenu = document.getElementById('main-menu');
        if (mainMenu) mainMenu.style.display = 'none';

        // Sembunyikan elemen lain jika perlu (characterMenu, optionsModal, dll.)
        const characterMenu = document.getElementById('character-menu');
        if (characterMenu) characterMenu.style.display = 'none';
        const optionsModal = document.getElementById('options-modal');
        if (optionsModal) { optionsModal.classList.add('hidden'); optionsModal.classList.remove('open'); }
        const quitModal = document.getElementById('quit-modal');
        if (quitModal) quitModal.classList.add('hidden');
        const menuPopup = document.getElementById('menu-popup');
        if (menuPopup) menuPopup.style.display = 'none';


        gameEditorScreen.style.display = 'flex';
        gameEditorScreen.style.animation = 'fadeIn 0.5s forwards';

        loadAllEditableContentFromLocalStorage();
        loadAllDataToEditorInputs(); // Kemudian isi semua input & update preview
        if (characterMenu) {
            characterMenu.style.display = 'block'; // Atau 'flex' tergantung main-container
            characterMenu.style.opacity = '1';
            console.log("Explicitly setting originalCharMenu to display:block and opacity:1 before setupCharacterMenuPreview timeout.");
        }
        setTimeout(setupCharacterMenuPreview, 100);
        setTimeout(() => {
            loadCharacterDataForEditor();
        }, 0);

        // Reset dan jalankan animasi 'click-to-continue' di preview warning screen
        const previewContinue = document.querySelector('#preview-warning-screen .click-to-continue');
        if (previewContinue) {
            previewContinue.classList.remove('visible');
            setTimeout(() => {
                // Cek apakah editor masih terbuka agar tidak error/aneh jika sudah ditutup
                if (gameEditorScreen.style.display === 'flex') {
                    previewContinue.classList.add('visible');
                }
            }, 5000);
        }
    });
}

// Tombol untuk kembali ke Main Menu dari Game Editor
if (backToMainMenuEditorBtn) {
    backToMainMenuEditorBtn.addEventListener('click', async () => {
        let discardedChanges = false;
        if (isEditorDirty) {
            const confirmLeave = confirm("Anda memiliki perubahan yang belum disimpan. Apakah Anda yakin ingin kembali ke Menu Utama tanpa menyimpan?");
            if (!confirmLeave) {
                return; // Batalkan aksi kembali
            }
            isEditorDirty = false;
            discardedChanges = true;
        }

        if (discardedChanges) {
            try {
                await restoreSavedGameEditorState();
            } catch (error) {
                console.error('[GameEditor] Gagal memulihkan perubahan yang dibatalkan:', error);
            }
        }

        console.log("Back from Editor: #character-menu display BEFORE hide:", document.getElementById('character-menu').style.display);
        gameEditorScreen.style.animation = 'fadeOut 0.5s forwards';
        setTimeout(() => {
            gameEditorScreen.style.display = 'none';

            const characterMenu = document.getElementById('character-menu');
            if (characterMenu) {
                // Kembalikan character-menu ke state awalnya (tersembunyi)
                characterMenu.style.display = 'none';
                characterMenu.style.opacity = '0';
                characterMenu.style.animation = ''; // Hapus inline style animasi
                // Reset juga animasi pada kartu-kartunya jika perlu, agar saat dibuka lagi normal
                characterMenu.querySelectorAll('.image-preview').forEach(card => {
                    card.style.opacity = '0'; // Sesuai CSS awal
                    card.style.animation = ''; // Agar animasi swipeUp bisa berjalan lagi nanti
                });
                console.log("Back from Editor: #character-menu display AFTER hide:", characterMenu.style.display);
            } else {
                console.warn("Back from Editor: #character-menu element not found to hide.");
            }

            const mainMenu = document.getElementById('main-menu');
            if (mainMenu) {
                console.log("Back from Editor: #main-menu display BEFORE show:", mainMenu.style.display);
                mainMenu.style.display = 'flex';
                mainMenu.style.animation = 'fadeIn 0.5s forwards';
                mainMenu.style.opacity = '1';
                console.log("Back from Editor: #main-menu display AFTER show:", mainMenu.style.display);
            } else {
                console.warn("Back from Editor: #main-menu element not found to show.");
            }
        }, 500);
    });
}

// --- Persistensi untuk Game Editor Content ---
let editableContent = {};

function loadAllEditableContentFromLocalStorage() {
    const state = getPersistedEditorState();
    let content = hasPersistedEditorValue('content') ? state.content : null;

    // Darurat/backward compatibility bila store belum dapat diload. Jalur normal
    // selalu memakai userData, bukan localStorage.
    if (!content && !getGameEditorStore()) {
        try {
            const legacyContent = localStorage.getItem(GAME_EDITOR_CONTENT_KEY);
            content = legacyContent ? JSON.parse(legacyContent) : null;
        } catch (error) {
            console.error('[GameEditor] Gagal membaca cadangan localStorage:', error);
        }
    }
    if (!content || typeof content !== 'object' || Array.isArray(content)) return;

    editableContent = content;
    editableSections.forEach(section => {
        const data = content[section.elementId];
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;

        const elementId = section.elementId;
        if (elementId === 'warning-screen') {
            const el = screens.find(s => s.id === 'warning-screen');
            if (el) {
                const paragraphs = el.querySelectorAll('p');
                if (paragraphs[0] && hasOwn(data, 'line1')) paragraphs[0].textContent = data.line1 ?? '';
                if (paragraphs[1] && hasOwn(data, 'line2')) paragraphs[1].textContent = data.line2 ?? '';
            }
        } else if (elementId === 'developer-screen') {
            const el = screens.find(s => s.id === 'developer-screen');
            if (el) {
                const title = el.querySelector('h2');
                const subtitle = el.querySelector('h4');
                if (title && hasOwn(data, 'title')) title.textContent = data.title ?? '';
                if (subtitle && hasOwn(data, 'subtitle')) subtitle.textContent = data.subtitle ?? '';
            }
        } else if (elementId === 'concept-screen') {
            const el = screens.find(s => s.id === 'concept-screen');
            if (el) {
                const title = el.querySelector('h2');
                const text = el.querySelector('p');
                if (title && hasOwn(data, 'title')) title.textContent = data.title ?? '';
                if (text && hasOwn(data, 'text')) text.textContent = data.text ?? '';
            }
        } else if (elementId === 'title-screen') {
            const el = screens.find(s => s.id === 'title-screen');
            if (el) {
                if (hasOwn(data, 'mainTitle')) setTitleHeadingText(el.querySelector('h1'), data.mainTitle ?? '');
                const subtitle = el.querySelector('h3');
                const pressStart = el.querySelector('p');
                if (subtitle && hasOwn(data, 'subtitle')) subtitle.textContent = data.subtitle ?? '';
                if (pressStart && hasOwn(data, 'pressStart')) pressStart.textContent = data.pressStart ?? '';
            }
        } else if (elementId === 'profile-section') {
            const profileName = document.getElementById('profile-name');
            const profileLevel = document.getElementById('profile-level');
            const profileDescription = document.getElementById('profile-description');
            const profileImage = document.getElementById('profile-picture');
            if (profileName && hasOwn(data, 'name')) profileName.textContent = data.name ?? '';
            if (profileLevel && hasOwn(data, 'level')) profileLevel.textContent = data.level ?? '';
            if (profileDescription && hasOwn(data, 'description')) profileDescription.textContent = data.description ?? '';
            if (profileImage && hasOwn(data, 'profileImageSrc') && data.profileImageSrc) {
                profileImage.src = data.profileImageSrc;
            }
        }
    });

    if (document.getElementById('game-editor-screen').style.display === 'flex') {
        loadAllDataToEditorInputs();
    }
}

function collectAllEditableContent() {
    const currentContentToSave = {};
    editableSections.forEach(section => {
        const elementId = section.elementId;
        const data = {};
        if (elementId === 'warning-screen') {
            const el = screens.find(s => s.id === 'warning-screen');
            if (el) { data.line1 = el.querySelectorAll('p')[0]?.textContent; data.line2 = el.querySelectorAll('p')[1]?.textContent; }
        } else if (elementId === 'developer-screen') {
            const el = screens.find(s => s.id === 'developer-screen');
            if (el) { data.title = el.querySelector('h2')?.textContent; data.subtitle = el.querySelector('h4')?.textContent; }
        } else if (elementId === 'concept-screen') {
            const el = screens.find(s => s.id === 'concept-screen');
            if (el) {
                data.title = el.querySelector('h2')?.textContent;
                data.text = el.querySelector('p')?.textContent;
            }
        } else if (elementId === 'title-screen') {
            const el = screens.find(s => s.id === 'title-screen');
            if (el) {
                data.mainTitle = el.querySelector('h1')?.textContent?.trim();
                data.subtitle = el.querySelector('h3')?.textContent;
                data.pressStart = el.querySelector('p')?.textContent;
            }
        } else if (elementId === 'profile-section') {
            data.name = document.getElementById('profile-name')?.textContent; // Ambil dari elemen game asli
            data.level = document.getElementById('profile-level')?.textContent;
            data.description = document.getElementById('profile-description')?.textContent;
            data.profileImageSrc = document.getElementById('profile-picture')?.getAttribute('src');
        }
        currentContentToSave[elementId] = data;
    });

    return currentContentToSave;
}

// --- Update Pratinjau secara Real-time saat Mengetik ---
function addRealTimePreviewUpdaterForAllInputs() {
    editableSections.forEach(section => {
        const elementId = section.elementId;
        // Dapatkan semua input dan textarea di dalam kontainer input untuk section ini
        const inputContainer = document.getElementById(`edit-${elementId}-inputs`);
        if (inputContainer) {
            const inputs = inputContainer.querySelectorAll('input[type="text"], textarea');
            inputs.forEach(input => {
                input.addEventListener('input', () => {
                    updateSpecificPreview(elementId, true); // true menandakan update dari input
                });
            });
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    addRealTimePreviewUpdaterForAllInputs();
    initializeGameEditorState().catch(error => {
        console.error('[GameEditor] Gagal menginisialisasi state:', error);
        showNotification('Game Editor data could not be loaded.', 'notification-error');
    });

    const profileImagePreviewInEditor = document.getElementById('edit-profile-image-preview');
    const profileImageInput = document.getElementById('edit-profile-image-input');

    if (profileImagePreviewInEditor && profileImageInput) {
        // Ketika gambar pratinjau di area input diklik, picu input file
        profileImagePreviewInEditor.addEventListener('click', () => {
            profileImageInput.click();
        });

        // Ketika file dipilih di input file
        profileImageInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const newImageSrc = e.target.result; // Ini adalah Base64 Data URL

                    profileImagePreviewInEditor.src = newImageSrc;
                    profileImagePreviewInEditor.dataset.newMediaDataUrl = newImageSrc;
                    profileImagePreviewInEditor.dataset.newMediaName = file.name;
                    updateSpecificPreview('profile-section', true);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const optionRows = document.querySelectorAll('#options-modal .option-row, #options-modal .option-row-checkbox');
    const descriptionTextElement = document.getElementById('option-description-text');
    const defaultDescription = 'Pilih opsi setting...';

    if (descriptionTextElement) {
        optionRows.forEach(row => {
            // Saat kursor masuk ke area baris opsi
            row.addEventListener('mouseenter', () => {
                const description = row.getAttribute('data-description');
                descriptionTextElement.style.opacity = '0';
                setTimeout(() => {
                    descriptionTextElement.textContent = description || defaultDescription;
                    descriptionTextElement.style.opacity = '1';
                }, 200);
            });

            // Saat kursor keluar dari area baris opsi
            row.addEventListener('mouseleave', () => {
                descriptionTextElement.style.opacity = '0';
                setTimeout(() => {
                    descriptionTextElement.textContent = defaultDescription;
                    descriptionTextElement.style.opacity = '1';
                }, 200);
            });
        });
    }
});
//------------------- ( end logika character menu editor ) -------------------------//

// ================================ ( End Logika Game Editor ) ================================ //
