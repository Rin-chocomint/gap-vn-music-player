Sebuah proyek untuk mempelajari pemerograman.

Aplikasi berbasis Electron Chromium, dibuat dengan HTML, CSS, dan JS. Jadi maklumi segala kekurangan dan kelebihannya.

---

Kamu dapat memodifikasi teks-teks yang ada di aplikasi dengan mengedit file **"index.html"** yang ada di folder **"resources"** didalam folder **"app"**. 

Edit **"index.html"** menggunakan teks editor seperti Notepad.

-> klick kanan aja **`index.html`** terus open with notepad, nah kamu skrol ke bawah terus sampai nemu teks-teks yang ada di aplkasi, disitu kamu bisa edit sekuka hati.

---

Lebih tepatnya kamu bisa edit-edit bagian ini :

```html
<!--======================================= HTML ========================================-->
<body>
    <div id="version-info">versi 0.0.0.6 | Jangan terlalu berharap, ini hanya coba-coba...</div>
    <div class="screen" id="warning-screen">
        <p>⚠️ Health and Safety Warning ⚠️</p>
        <p>Take breaks regularly and play responsibly.</p>
    </div>
  
    <div class="screen" id="developer-screen">
        <h2>Gamer & Anime Pub</h2>
        <h4>The successor of Real World Nime</h4>
    </div>

    <div class="screen" id="concept-screen">
        <h2 style="margin-bottom: 20px;">Disclaimer!!</h2>
        <p>ID:</p>
        <p>Project ini dibuat hanya untuk mempelajari pemerograman, Software ini dibuat</p>
        <p>menggunakan Electron berbasis web seperti HTML, CSS, dan JavaScript.</p>
        <p>jadi maklumi kelebihan dan kekurangannya</p>
        <br>
        <p>EN:</p>
        <p>This project was created solely for the purpose of learning programming. This software was developed</p>
        <p>using Electron, leveraging web-based such as HTML, CSS, and JavaScript</p>
        <p>Please understand and bear with its strengths and limitations.</p>    
    </div>

    <div class="screen" id="title-screen">
        <h1 id="title-screen">
            <!-- Animasi judul pendek game di title screen -->
            <span>調</span><span>和</span><span>凛</span>
        </h1>
            <!-- Animasi judul panjang game di title screen -->
        <h3>Rin with the secret of her pure Javanese</h3>
        <div id="rotating-text"></div>
        <p>Press Start</p>  
        <video id="background-video" autoplay muted loop>
            <!-- buat video default ini tampil di title-screen, arahkan ke video yang kamu punya-->
            <source src="./aset" type="video/mp4">
        </video>     
    </div>

    <div class="screen" id="main-menu">
        <div id="profile-section">
            <!--Sesuaikan foto profil di profil main menu-->
            <img src="./aset/ikon.jpg" alt="Profile Picture" id="profile-picture">
            <div id="profile-info">
                <h2 id="profile-name">凛・アメリア・ラディサ</h2>
                <p id="profile-level">Level: 30</p>
                <div id="level-bar">
                    <div id="level-fill"></div>
                    <span id="level-max-text">Max</span>
                </div>                
                <p id="profile-description">"a pure Javanese girl who is thought to be a mulatto"</p>
            </div>
        </div>
    
        <div id="menu-options">
            <ul>
                <li id="start-game">Start Game</li>
                <li id="character-menu-button">Character</li>
                <li id="options">Options</li>
                <li id="quit">Quit</li>
            </ul>
        </div>

        <div id="menu-popup">
            <h2>Select Game Mode</h2>
            <ul>
                <li id="visual-novel">Visual Novel</li>
                <li>Coming Soon</li>
            </ul>
            <button id="close-popup">Close</button>
        </div>

        <div id="background-section">
            <video id="character-background" autoplay muted loop>
                <!-- buat video default ini tampil di main menu !-->
                <source src="./aset/wallpaper" type="video/mp4">
            </video>

            <div id="wallpaper-control">
                <button id="next-wallpaper">Next Wallpaper</button>
                <p id="wallpaper-name">Current: Wallpaper 1</p>
            </div>

            <div id="music-control" class="collapsed">
                <div id="music-info">
                    <p id="music-title">Now Playing: None</p>
                    <div id="progress-container">
                        <div id="progress-bar"></div>
                    </div>
                </div>
                <div id="music-buttons">
                    <button id="prev-music">⏮️</button>
                    <button id="play-pause">▐▐</button>
                    <button id="next-music">⏭️</button>
                    <button id="shuffle-music">🔀</button>
                </div>
                <div id="music-time">
                    <span id="current-time">0:00</span> / <span id="duration">0:00</span>
                </div>    
                <div id="volume-control">
                    <label for="volume-slider">Volume:</label>
                    <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="0.5">
                </div>
                <ul id="playlist"></ul>
                <button id="expand-collapse">↑</button>
            </div>
        </div>
    </div>

    <audio id="background-audio" preload="auto"></audio>
<!--======================================= end HTML ========================================-->
```
dan ini :

```javascript
const audio = document.getElementById("background-audio");
        setTimeout(() => {
            audio.play();
        }, 16000);

        // Kalimat yang muncul di title screen
        const rotatingTexts = [
            "Through the cherry blossoms, her roots call out—will the truth bloom?",
            "Rin’s smile hides more than words can tell, will her true heritage remain a secret?",
            "Behind her foreign name and serene exterior lies a heritage she guards fiercely.",
            "Beneath the falling petals of sakura, Rin hides her true feelings from her sibling.",
            "a pure Javanese girl who is thought to be a mulatto"
        ];
```

### PETUNJUK:
Untuk buat playlist musik, kamu perlu membuat folder baru di dalam folder **"resources\app\aset\music"**.  
Pokoknya, buka aja folder **"resources"**, terus buka lagi **"app"**, sampai ke folder **"music"**.  
Di situ, kamu buat folder baru yang isinya audio musik playlist-mu. Kalau mau buat playlist baru, tinggal buat folder baru lagi aja.  

-> **Untuk menyeting audio musik default** yang diputar pertama kali, cukup berikan tanda **`!`** di nama file audio-nya.  
Contoh nama file musik default:  
**`!musik.mp3`**


Untuk wallpaper juga sama. Buat folder baru di dalam folder **"resources\app\aset\wallpaper"**.  
Di folder yang baru kamu buat itu, isinya video yang formatnya **.mp4**.  

-> **Berikan juga tanda `!` di nama video wallpaper** yang ingin kamu jadikan default.  
Video ini juga akan muncul di **title screen**.  
Contoh:  
**`!wallpaper.mp4`**

Jadi kalau mau bikin playlist musik atau wallpaper baru ya bikin folder baru lagi yak.

Kamu dapat mengkostumisasi teks yang ada di aplikasi dengan mengedit isi file **"index.html"** yang lokasinya ada di **"resources\app"**.  
Di situ, kamu dapat mengedit berbagai macam teks yang ada di aplikasi, seperti yang ada di **developer screen, title screen, dan main menu**.  
Gunakan teks editor seperti Notepad untuk membuka file **"index.html"**, **jangan hanya diklik dua kali!**

Untuk mengganti foto profil yang ada di **main menu**, cukup ganti file **"ikon.jpg"** yang lokasinya ada di **"resources\app\aset"**.  
Pastikan ukurannya **kotak (1:1)** ya!
