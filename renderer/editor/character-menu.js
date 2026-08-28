// -------- Character Menu Init (dari inline script) --------
document.addEventListener('DOMContentLoaded', () => {
    const CHARACTER_MENU_DATA_KEY = 'gameCharacterEditorData';
    
    // Cek localStorage terlebih dahulu untuk data karakter yang sudah dikustomisasi
    const savedCharactersString = localStorage.getItem(CHARACTER_MENU_DATA_KEY);
    
    if (savedCharactersString) {
        try {
            const savedCharacters = JSON.parse(savedCharactersString);
            if (Array.isArray(savedCharacters) && savedCharacters.length > 0) {
                console.log('[CharacterMenu] Loading customized characters from localStorage');
                renderCharactersFromEditor(savedCharacters);
                return; // Jangan load dari JSON file jika sudah ada data kustom
            }
        } catch (e) {
            console.error('[CharacterMenu] Error parsing localStorage data:', e);
        }
    }
    
    // Fallback: load dari character_data.json jika tidak ada data kustom di localStorage
    console.log('[CharacterMenu] No custom data found, loading from character_data.json');
    fetch('./aset/konten/character_data.json')
        .then(response => {
            if (!response.ok) {
                throw new Error("HTTP error " + response.status);
            }
            return response.json();
        })
        .then(data => {
            if (data.profile) {
                const profileName = document.getElementById('profile-name');
                if (profileName && data.profile.name) {
                    profileName.textContent = data.profile.name;
                }
                const profileDesc = document.getElementById('profile-description');
                if (profileDesc && data.profile.description) {
                    profileDesc.textContent = data.profile.description;
                }
                const profileLevel = document.getElementById('profile-level');
                if (profileLevel && data.profile.level) {
                    profileLevel.textContent = data.profile.level;
                }
                const previewProfileName = document.querySelector('#preview-profile-section #profile-name');
                if (previewProfileName && data.profile.name) {
                    previewProfileName.textContent = data.profile.name;
                }
                const previewProfileDesc = document.querySelector('#preview-profile-section #profile-description');
                if (previewProfileDesc && data.profile.description) {
                    previewProfileDesc.textContent = data.profile.description;
                }
                const previewProfileLevel = document.querySelector('#preview-profile-section #profile-level');
                if (previewProfileLevel && data.profile.level) {
                    previewProfileLevel.textContent = data.profile.level;
                }
            }

            const container = document.getElementById('character-main-container');
            if (!container) return;

            container.innerHTML = '';

            if (data.characters && Array.isArray(data.characters)) {
                data.characters.forEach(char => {
                    const previewDiv = document.createElement('div');
                    previewDiv.className = 'image-preview';

                    let mediaHtml = '';
                    if (char.type === 'image') {
                        mediaHtml = `<img class="video character-image" src="${char.source}" alt="${char.alt || ''}">`;
                    } else {
                        mediaHtml = `<video muted loop preload="none" class="video" src="${char.source}"></video>`;
                    }

                    let descContent = '';
                    if (char.name.includes('Academy') || char.name === '??? Academy') {
                        descContent += `<div class="name-and-role"><h1>${char.name}</h1></div>`;
                    } else {
                        descContent += `<div class="name-and-role"><h1>${char.name}</h1></div>`;
                    }

                    if (char.descValues) {
                        const mainText = char.descValues.description || char.descValues.summary;
                        if (mainText) {
                            const pClass = char.descValues.summary ? 'class="summary"' : '';
                            descContent += `<p ${pClass}>${mainText}</p>`;
                        }
                        if (char.descValues.extended) {
                            descContent += `
                                <div class="extended-content">
                                    <p>${char.descValues.extended}</p>
                                </div>
                                <button class="more-button">More</button>
                            `;
                        }
                    }

                    previewDiv.innerHTML = `
                        ${mediaHtml}
                        <div class="overlay">
                            <div class="desc">
                                ${descContent}
                            </div>
                        </div>
                    `;
                    previewDiv.style.opacity = '0';
                    console.log('[CharacterMenu] Created preview for:', char.name, 'with opacity 0');
                    container.appendChild(previewDiv);
                });
                attachCharacterMenuListeners();
            }
        })
        .catch(error => {
            console.error("Failed to load character data:", error);
        });

    // Fungsi untuk merender karakter dari data editor (localStorage)
    function renderCharactersFromEditor(characters) {
        const container = document.getElementById('character-main-container');
        if (!container) return;

        container.innerHTML = '';

        characters.forEach(charData => {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'image-preview';

            let mediaHtml = '';
            const isVideo = charData.mediaType === 'video' || 
                            (charData.mediaSrc && charData.mediaSrc.match(/\.(mp4|webm|ogg)$/i));
            
            if (isVideo) {
                mediaHtml = `<video muted loop preload="none" class="video" src="${charData.mediaSrc}"></video>`;
            } else {
                mediaHtml = `<img class="video character-image" src="${charData.mediaSrc || './aset/placeholder.png'}" alt="Character ${charData.name}">`;
            }

            let descContent = `<div class="name-and-role"><h1>${charData.name || 'Unknown'}</h1></div>`;
            
            if (charData.description) {
                descContent += `<p class="summary">${charData.description}</p>`;
            }
            
            if (charData.extendedDescription) {
                descContent += `
                    <div class="extended-content">
                        <p>${charData.extendedDescription}</p>
                    </div>
                    <button class="more-button">More</button>
                `;
            }

            previewDiv.innerHTML = `
                ${mediaHtml}
                <div class="overlay">
                    <div class="desc">
                        ${descContent}
                    </div>
                </div>
            `;
            previewDiv.style.opacity = '0';
            console.log('[CharacterMenu] Created preview from localStorage for:', charData.name, 'with opacity 0');
            container.appendChild(previewDiv);
        });
        
        attachCharacterMenuListeners();
    }

    function attachCharacterMenuListeners() {
        const container = document.getElementById('character-main-container');
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('more-button')) {
                e.stopPropagation();

                const extendedContent = e.target.previousElementSibling;
                if (extendedContent && extendedContent.classList.contains('extended-content')) {
                    extendedContent.classList.toggle('show');
                    e.target.textContent = extendedContent.classList.contains('show') ? 'Less' : 'More';
                }
            }
        });
        const videos = container.querySelectorAll('video');
        videos.forEach(video => {
            video.parentElement.addEventListener('mouseenter', () => video.play());
            video.parentElement.addEventListener('mouseleave', () => {
                video.pause();
                video.currentTime = 0;
            });
        });
    }
});



// ================================ ( Character Menu: Toggle & Hover ) ================================ //
//------------------- ( elemen & state UI character menu ) -------------------------//
const characterMenuButton = document.getElementById('character-menu-button');
const characterMenu = document.getElementById('character-menu');
const mainMenu = document.getElementById('main-menu');
const backToMainMenuBtn = document.getElementById('back-to-main-menu');

const imagePreviews = document.querySelectorAll('#character-menu .image-preview');
const videos = document.querySelectorAll('#character-menu .image-preview .video');

//------------------- ( end elemen & state UI character menu ) -------------------------//

//------------------- ( convert media: kalau source gambar, ganti jadi <img> ) -------------------------//
document.addEventListener("DOMContentLoaded", () => {
    const imagePreviews = document.querySelectorAll("#character-menu .image-preview");

    imagePreviews.forEach(preview => {
        let mediaElement = preview.querySelector(".video");

        if (mediaElement) {
            let src = mediaElement.getAttribute("src");

            // Cek ekstensi file
            if (src.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                let imgElement = document.createElement("img");
                imgElement.src = src;
                imgElement.classList.add("character-image");
                imgElement.style.width = "100%";
                imgElement.style.height = "100%";
                imgElement.style.objectFit = "cover";

                mediaElement.replaceWith(imgElement);
            }
        }
    });

    // Set flexGrow default untuk tiap kartu
    imagePreviews.forEach(preview => {
        preview.style.flexGrow = "1";
    });

    // Event hover pada tiap kartu
    imagePreviews.forEach((preview) => {
        preview.addEventListener("mouseenter", () => {
            // Jangan aktifkan hover jika animasi masih berlangsung
            if (characterMenu.classList.contains("animating")) return;

            preview.style.flexGrow = "1.5";

            let media = preview.querySelector("video, img");
            if (media.tagName.toLowerCase() === "video") {
                media.play();
            } else {
                media.classList.add("hover-effect");
            }

            // Kartu lain mengecil dan redup
            imagePreviews.forEach(other => {
                if (other !== preview) {
                    other.style.flexGrow = "0.8";
                    other.classList.add("dim");
                    let otherMedia = other.querySelector("video");
                    if (otherMedia) {
                        otherMedia.pause();
                    }
                }
            });
        });

        preview.addEventListener("mouseleave", () => {
            imagePreviews.forEach(other => {
                other.style.flexGrow = "1";
                other.classList.remove("dim");
                let otherMedia = other.querySelector("video");
                if (otherMedia) {
                    otherMedia.pause();
                }
            });

            let media = preview.querySelector("video, img");
            if (media.tagName.toLowerCase() === "img") {
                media.classList.remove("hover-effect");
            }
        });
    });


});

//------------------- ( end convert media: kalau source gambar, ganti jadi <img> ) -------------------------//

//------------------- ( masuk ke Character Menu ) -------------------------//
characterMenuButton.addEventListener('click', () => {
    // Jangan langsung sembunyikan main menu, biarkan tetap terlihat
    // Tampilkan character menu di atas main menu dengan background awal transparan
    characterMenu.style.display = 'block';
    characterMenu.style.zIndex = '100'; // Ensure it's on top
    characterMenu.style.backgroundColor = 'transparent';
    characterMenu.style.animation = "fadeInCharacter 0.5s forwards";
    characterMenu.style.opacity = 1;
    characterMenu.classList.add("animating");

    // Animasi munculnya image-preview (swipeUp) akan terjadi secara staggered (diatur dari CSS)
    const previews = document.querySelectorAll("#character-menu .image-preview");
    let animationsCompleted = 0;
    const totalAnimations = previews.length;

    // Jika tidak ada kartu karakter sama sekali
    if (totalAnimations === 0) {
        // Langsung selesaikan transisi menu utama
        characterMenu.style.backgroundColor = "black"; // Atur background
        characterMenu.classList.remove("animating");
        mainMenu.style.display = "none"; // Sembunyikan main menu

        // Aktifkan kembali tombol back
        backToMainMenuBtn.disabled = false;
        backToMainMenuBtn.style.pointerEvents = 'auto';
        backToMainMenuBtn.style.opacity = '1';
        return; // Keluar dari fungsi karena tidak ada animasi kartu
    }

    previews.forEach(preview => {
        preview.style.animation = '';

        preview.addEventListener("animationend", function handler(e) {
            // Hanya tangani event untuk animasi 'swipeUp'
            if (e.animationName === "swipeUp") {
                preview.removeEventListener("animationend", handler); // Hapus listener setelah dipanggil sekali
                preview.style.opacity = '1'; // Ensure opacity stays at 1
                animationsCompleted++;

                if (animationsCompleted === totalAnimations) {
                    // Semua animasi kartu selesai
                    characterMenu.style.backgroundColor = "black"; // Finalisasi background
                    characterMenu.classList.remove("animating");
                    mainMenu.style.display = "none";

                    // Aktifkan kembali tombol back SEKARANG
                    backToMainMenuBtn.disabled = false;
                    backToMainMenuBtn.style.pointerEvents = 'auto';
                    backToMainMenuBtn.style.opacity = '1';
                }
            }
        });
    });
});

//------------------- ( end masuk ke Character Menu ) -------------------------//

//------------------- ( balik ke Main Menu ) -------------------------//
backToMainMenuBtn.addEventListener('click', () => {
    mainMenu.style.display = 'flex'; // Tampilkan main menu dulu agar tidak blank
    mainMenu.style.opacity = '1';
    mainMenu.style.animation = 'fadeIn 0.5s forwards'; // Animasi masuk main menu

    characterMenu.style.animation = "fadeOutCharacter 0.5s forwards";

    setTimeout(() => {
        characterMenu.style.display = 'none';
        characterMenu.style.opacity = '0'; // Reset opacity sesuai CSS awal

        characterMenu.querySelectorAll('.image-preview').forEach(card => {
            card.style.opacity = '0'; // Sesuai CSS awal
            card.style.animation = ''; // Hapus inline style animasi agar CSS bisa berlaku lagi
        });
    }, 500); // Sesuai durasi fadeOutCharacter
});

//------------------- ( end balik ke Main Menu ) -------------------------//

// ================================ ( End Character Menu: Toggle & Hover ) ================================ //
