
        // ------------------- Story Loading & Rendering ------------------- //
        let promotionalVideoByStory = {};

        async function loadStories() {
            // Batalkan timeout auto-pick yang mungkin masih berjalan
            if (defaultCenterTimeout) {
                clearTimeout(defaultCenterTimeout);
                defaultCenterTimeout = null;
            }

            storiesData = await ipcRenderer.invoke('get-story-list');
            if (!storiesData) storiesData = [];
            renderStories(storiesData);

            // Hanya jalankan auto-pick pada load pertama kali
            // dan jika pengguna belum berinteraksi dengan carousel
            if (isInitialLoad && !userHasInteractedWithCarousel) {
                setDefaultCenterIndex();
                isInitialLoad = false;
            } else {
                // Pastikan posisi carousel tetap valid setelah refresh
                updateCarouselCenter();
            }
        }

        function renderStories(stories) {
            storyGrid.innerHTML = '';
            promotionalVideoByStory = {};

            // Kartu "Buat Novel"
            const createCard = document.createElement('div');
            createCard.className = 'story-card create-new-card';
            createCard.innerHTML = `
          <div class="plus-icon">+</div>
          <div class="create-text">Buat Novel</div>
      `;
            createCard.addEventListener('click', showCreateNovelModal);
            storyGrid.appendChild(createCard);

            // "Edit Novel"
            const editCard = document.createElement('div');
            editCard.className = 'story-card create-new-card';
            editCard.innerHTML = `
          <div class="plus-icon" style="font-size: 3rem; font-weight: bold;">✎</div>
          <div class="create-text">Edit Novel</div>
      `;
            editCard.addEventListener('click', showScriptEditor); // Panggil fungsi editor
            storyGrid.appendChild(editCard);

            stories.forEach((story, index) => {
                // Simpan APA ADANYA — '' berarti tak ada video (lihat fadeInVideo).
                promotionalVideoByStory[story.title] = story.promotionalVideo || '';
                const storyCard = document.createElement('div');
                storyCard.className = 'story-card';
                storyCard.dataset.title = story.title;
                // Cover datang dari main process yang SUDAH memindai disk
                // (`getProfileMediaWithFallback` → `findLegacyCover`): '' berarti novel
                // ini memang tak punya cover. Dulu di sini ada `|| 'cover.jpg'` yang
                // membuang kebenaran itu lalu meminta berkas yang tak ada → 404 senyap
                // setiap daftar dirender.
                if (story.cover) {
                    // ?v=<mtime> — cover diganti dengan nama berkas yang sama, jadi tanpa
                    // penanda versi kartu ini menampilkan gambar lama dari cache.
                    const coverVersion = story.coverVersion ? `?v=${story.coverVersion}` : '';
                    // Gunakan encodeURIComponent untuk menangani karakter khusus pada judul folder
                    storyCard.style.backgroundImage = `url('./visual_novels/${encodeURIComponent(story.title)}/${story.cover}${coverVersion}')`;
                } else {
                    storyCard.classList.add('no-cover');
                }

                const overlay = document.createElement('div');
                overlay.className = 'overlay';

                const title = document.createElement('h2');
                title.className = 'story-title';
                title.textContent = story.title;

                const desc = document.createElement('p');
                desc.className = 'story-desc';
                // Gunakan storyDesc dari folder novel jika tersedia, jika tidak gunakan default
                desc.textContent = story.storyDesc || `Explore the story of ${story.title}!`;

                const playButton = document.createElement('button');
                playButton.className = 'play-button';
                playButton.textContent = 'Play';
                playButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    startPlayAnimation(storyCard, story.playPath);
                });

                overlay.appendChild(title);
                overlay.appendChild(desc);
                overlay.appendChild(playButton);
                storyCard.appendChild(overlay);
                storyGrid.appendChild(storyCard);

                setTimeout(() => {
                    storyCard.classList.add('show');
                }, index * 100);

                storyCard.addEventListener('mouseenter', () => {
                    if (storyGridElement.classList.contains('carousel-layout')) return;
                    clearTimeout(hoverTimeout);
                    hoverTimeout = setTimeout(() => {
                        fadeInVideo(story.title);
                    }, 1000);
                });

                storyCard.addEventListener('mouseleave', () => {
                    if (storyGridElement.classList.contains('carousel-layout')) return;
                    clearTimeout(hoverTimeout);
                    fadeOutVideo();
                });

                storyCard.addEventListener('click', (e) => {
                    if (storyGridElement.classList.contains('carousel-layout')) {
                        userHasInteractedWithCarousel = true;
                        // Gunakan navigateCarousel dengan mode absolut untuk validasi yang konsisten
                        // +2 karena ada kartu "Buat Novel" dan "Edit Novel" di awal
                        navigateCarousel(index + 2, true);
                    }
                });
            });

            // Validasi currentCenterIndex setelah render
            // Ini penting saat jumlah kartu berubah (novel baru ditambah/dihapus)
            // Hanya ambil kartu dari storyGrid
            const allCards = storyGrid.querySelectorAll('.story-card');
            const maxIndex = Math.max(0, allCards.length - 1);
            if (currentCenterIndex > maxIndex) {
                currentCenterIndex = maxIndex;
            }
            if (currentCenterIndex < 0) {
                currentCenterIndex = 0;
            }
        }

        // ------------------- Search Logic ------------------- //
        function performSearch() {
            const searchTerm = searchInput.value.toLowerCase();
            const filteredStories = storiesData.filter(story =>
                story.title.toLowerCase().includes(searchTerm)
            );
            renderStories(filteredStories);

            // Reset carousel position if needed
            if (storyGridElement.classList.contains('carousel-layout')) {
                // Gunakan navigateCarousel dengan mode absolut untuk reset ke posisi 0
                navigateCarousel(0, true);
            }
        }

        searchInput.addEventListener('input', performSearch);
        searchBtn.addEventListener('click', performSearch);

        // ------------------- Layout & Carousel Logic ------------------- //

        storyGridElement.classList.add('carousel-layout');
        prevBtn.style.display = 'block';
        nextBtn.style.display = 'block';

        switchLayoutBtn.addEventListener('click', () => {
            const isCarousel = storyGridElement.classList.contains('carousel-layout');
            storyGridElement.classList.toggle('carousel-layout', !isCarousel);
            storyGridElement.classList.toggle('grid-layout', isCarousel);
            prevBtn.style.display = isCarousel ? 'none' : 'block';
            nextBtn.style.display = isCarousel ? 'none' : 'block';

            storyGrid.querySelectorAll('.story-card .play-button').forEach(btn => {
                btn.style.display = isCarousel ? 'inline-block' : 'none';
            });

            if (isCarousel) { // Switched to Grid
                storyGrid.querySelectorAll('.story-card').forEach(card => card.classList.remove('centered'));
                storyGridElement.style.transform = '';
            } else { // Switched to Carousel
                updateCarouselCenter();
            }
        });

        function setDefaultCenterIndex() {
            // Batalkan timeout sebelumnya jika ada
            if (defaultCenterTimeout) {
                clearTimeout(defaultCenterTimeout);
            }

            defaultCenterTimeout = setTimeout(() => {
                // Jangan auto-pick jika pengguna sudah berinteraksi dengan carousel
                if (userHasInteractedWithCarousel) {
                    return;
                }

                // Hanya ambil kartu dari storyGrid
                const cards = storyGrid.querySelectorAll('.story-card');
                if (cards.length > 1) { // Pastikan ada novel selain kartu "Create"
                    const randomIndex = Math.floor(Math.random() * (cards.length - 1)) + 1;
                    defaultCenterIndex = randomIndex;
                    // Gunakan navigateCarousel dengan mode absolut untuk konsistensi
                    navigateCarousel(randomIndex, true);
                }
            }, 1500);
        }

        /**
         * Fungsi terpusat untuk navigasi carousel dengan debounce
         * @param {number} direction - Arah navigasi: -1 untuk prev, 1 untuk next, atau angka absolut untuk set langsung
         * @param {boolean} isAbsolute - Jika true, direction adalah index absolut, bukan relatif
         */
        function navigateCarousel(direction, isAbsolute = false) {
            // Debounce: abaikan klik jika masih dalam proses navigasi
            if (isNavigating) return;

            // Hanya ambil kartu dari storyGrid, bukan dari seluruh dokumen
            // (ada juga story-card di editor-novel-list yang tidak boleh dihitung)
            const cards = storyGrid.querySelectorAll('.story-card');

            // Jika tidak ada kartu, keluar
            if (cards.length === 0) return;

            const maxIndex = cards.length - 1;

            let newIndex;
            if (isAbsolute) {
                newIndex = direction;
            } else {
                newIndex = currentCenterIndex + direction;
            }

            // Clamp index ke batas yang valid
            newIndex = Math.max(0, Math.min(newIndex, maxIndex));

            // Jika sudah di batas, tidak perlu update
            if (newIndex === currentCenterIndex && !isAbsolute) {
                return;
            }

            // Set debounce
            isNavigating = true;
            currentCenterIndex = newIndex;
            updateCarouselCenter();

            // Reset debounce setelah transisi selesai (sesuaikan dengan CSS transition duration)
            setTimeout(() => {
                isNavigating = false;
            }, 100); // 100ms debounce
        }

        function updateCarouselCenter() {
            // Hanya ambil kartu dari storyGrid
            const cards = storyGrid.querySelectorAll('.story-card');
            const maxIndex = Math.max(0, cards.length - 1);

            // Validasi ketat - pastikan index selalu dalam batas
            if (currentCenterIndex < 0) currentCenterIndex = 0;
            if (currentCenterIndex > maxIndex) currentCenterIndex = maxIndex;

            // Jika tidak ada kartu, keluar
            if (cards.length === 0) return;

            cards.forEach((card, index) => {
                const isCentered = index === currentCenterIndex;
                card.classList.toggle('centered', isCentered);
                const playButton = card.querySelector('.play-button');
                if (playButton) {
                    playButton.style.display = isCentered ? 'inline-block' : 'none';
                }
            });

            if (storyGridElement.classList.contains('carousel-layout')) {
                const centerCard = cards[currentCenterIndex];
                if (centerCard && !centerCard.classList.contains('create-new-card')) {
                    const storyTitle = centerCard.querySelector('.story-title');
                    if (storyTitle) {
                        fadeInVideo(storyTitle.textContent);
                    }
                } else {
                    fadeOutVideo();
                }
            }
            updateCarouselPosition();
        }

        function updateCarouselPosition() {
            if (!storyGridElement.classList.contains('carousel-layout')) return;
            // Hanya ambil kartu dari storyGrid
            const cards = storyGrid.querySelectorAll('.story-card');
            const maxIndex = Math.max(0, cards.length - 1);

            // Validasi tambahan untuk keamanan
            if (cards.length === 0) return;
            if (currentCenterIndex < 0) currentCenterIndex = 0;
            if (currentCenterIndex > maxIndex) currentCenterIndex = maxIndex;

            const centerCard = cards[currentCenterIndex];
            if (!centerCard) return;

            const containerRect = storyGridElement.getBoundingClientRect();
            const cardRect = centerCard.getBoundingClientRect();
            const baseOffsetX = (containerRect.width / 2) - (cardRect.left - containerRect.left + cardRect.width / 2);

            storyGridElement.style.transform = `translateX(${baseOffsetX}px) translateY(${extraOffsetY}px)`;
        }

        function updateExtraOffsetY() {
            if (window.innerWidth <= 1280) extraOffsetY = 10;
            else if (window.innerWidth <= 1900) extraOffsetY = 160;
            else extraOffsetY = 385;
        }

        window.addEventListener('resize', () => {
            updateExtraOffsetY();
            updateCarouselPosition();
        });

        document.addEventListener('DOMContentLoaded', () => {
            // 1
            const images = document.querySelectorAll('.image-container img');
            let currentIndex = 0;
            if (images.length > 1) {
                setInterval(() => {
                    images[currentIndex].style.opacity = 0;

                    currentIndex = (currentIndex + 1) % images.length;
                    images[currentIndex].style.opacity = 1;
                }, 3000);
            }
        });

        prevBtn.addEventListener('click', () => {
            userHasInteractedWithCarousel = true;
            navigateCarousel(-1); // Navigasi ke sebelumnya
        });

        nextBtn.addEventListener('click', () => {
            userHasInteractedWithCarousel = true;
            navigateCarousel(1); // Navigasi ke selanjutnya
        });

        document.addEventListener('keydown', (e) => {
            if (!storyGridElement.classList.contains('carousel-layout')) return;

            if (e.key === 'ArrowLeft') {
                userHasInteractedWithCarousel = true;
                navigateCarousel(-1);
            } else if (e.key === 'ArrowRight') {
                userHasInteractedWithCarousel = true;
                navigateCarousel(1);
            }
        });

        // ------------------- Auto-Collapse Sidebar Logic ------------------- //
        const sidebar = document.querySelector('.editor-sidebar');
        const workspaceCanvas = document.getElementById('workspace-canvas');

        if (sidebar && workspaceCanvas) {
            let lastScrollTop = 0;

            // Menggunakan event 'scroll' pad workspace-canvas,
            // karena elemen add-chapter-control-container (yang dulunya diobservasi dng IntersectionObserver) 
            // sebenarnya tertahan di flex-layout sidebar dan tidak pernah scroll keluar dari viewport.
            workspaceCanvas.addEventListener('scroll', () => {
                const chaptersContent = document.getElementById('sidebar-content-story');
                const isChaptersActive = chaptersContent && chaptersContent.classList.contains('active');

                if (!isChaptersActive) return;

                const currentScrollTop = workspaceCanvas.scrollTop;

                // Meminimalisir trigger dengan selisih yang pas
                if (currentScrollTop > 100 && currentScrollTop > lastScrollTop + 5) {
                    sidebar.classList.add('collapsed');
                } else if (currentScrollTop < lastScrollTop - 15 || currentScrollTop < 50) {
                    sidebar.classList.remove('collapsed');
                }

                lastScrollTop = currentScrollTop;
            });
        }

        // ------------------- Video Background Logic ------------------- //

        function fadeInVideo(storyTitle) {
            if (!storyTitle) return;
            clearInterval(fadeOutInterval);
            clearInterval(fadeInInterval);

            // Main process SUDAH menyelesaikan nama video ke disk
            // (`getProfileMediaWithFallback` → `findLegacyPromoVideo`, mp4/webm), jadi
            // nilai kosong berarti novel ini memang TIDAK punya video promosi. Dulu di
            // sini ada `|| 'video.mp4'` yang membuang kebenaran itu lalu menyetel `src` ke
            // berkas yang baru saja dinyatakan tak ada → `NotSupportedError` di konsol
            // tiap kali kartu tanpa video disorot.
            const promotionalVideo = promotionalVideoByStory[storyTitle];
            if (!promotionalVideo) {
                // Padamkan sisa video novel sebelumnya supaya ia tak menggantung di
                // belakang kartu yang memang tak punya video.
                backgroundVideo.style.opacity = 0;
                videoOverlay.style.opacity = 0;
                return;
            }
            backgroundVideo.src = `./visual_novels/${encodeURIComponent(storyTitle)}/${promotionalVideo}`;
            backgroundVideo.currentTime = 0;
            backgroundVideo.muted = false;
            backgroundVideo.play();
            backgroundVideo.style.opacity = 1;
            videoOverlay.style.opacity = 1;

            let volume = 0;
            backgroundVideo.volume = 0;

            fadeInInterval = setInterval(() => {
                if (volume < 1) {
                    volume += 0.1;
                    backgroundVideo.volume = Math.min(1, parseFloat(volume.toFixed(1)));
                } else {
                    clearInterval(fadeInInterval);
                }
            }, 100);
        }

        function fadeOutVideo() {
            clearInterval(fadeInInterval);
            clearInterval(fadeOutInterval);

            let volume = backgroundVideo.volume;
            fadeOutInterval = setInterval(() => {
                if (volume > 0) {
                    volume -= 0.1;
                    backgroundVideo.volume = Math.max(0, parseFloat(volume.toFixed(1)));
                } else {
                    clearInterval(fadeOutInterval);
                    backgroundVideo.pause();
                    backgroundVideo.muted = true;
                    backgroundVideo.style.opacity = 0;
                    videoOverlay.style.opacity = 0;
                    backgroundVideo.src = '';
                }
            }, 100);
        }

        // --------------------- Create Novel Logic dipindah ke vnModules/editor/novelCrud.js ------------------- //

        // --------------------------------------- Script Editor Logic dipindah ke vnModules/editor/scriptEditor.js ------------------------------------- //

        // ------------------- Page Transition ------------------- //    
        function startPlayAnimation(selectedCard, playPath) {
            document.querySelectorAll('.story-card').forEach(card => {
                if (card !== selectedCard) {
                    card.classList.add('fade-out-scatter');
                }
            });
            selectedCard.classList.add('focused');
            setTimeout(() => {
                document.body.classList.add('page-fade-out');
                setTimeout(() => {
                    // Ambil judul novel dari data-title card
                    const storyTitle = selectedCard.dataset.title;
                    if (storyTitle) {
                        // Routing terpusat: serahkan ke main process untuk menentukan
                        // hub mana yang dimuat (kustom vs default vs legacy)
                        ipcRenderer.send('vn-engine:open-novel-hub', { storyTitle });
                    } else {
                        // Fallback ke playPath langsung jika title tidak tersedia
                        window.location.href = playPath;
                    }
                }, 600);
            }, 800);
        }
        // ------------------- Search ------------------- //

        function searchStories() {
            const query = searchInput.value.toLowerCase();
            const filtered = storiesData.filter(story => story.title.toLowerCase().includes(query));
            renderStories(filtered);
        }

        searchBtn.addEventListener('click', searchStories);
        searchInput.addEventListener('keyup', event => {
            if (event.key === 'Enter') {
                searchStories();
            }
        });
