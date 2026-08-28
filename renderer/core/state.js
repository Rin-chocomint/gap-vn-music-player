// ================================ ( Modul & State Global ) ================================ //
//------------------- ( dependensi electron/node ) -------------------------//
const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
//------------------- ( end dependensi electron/node ) -------------------------//

//------------------- ( debug awal - biar jelas lagi jalan di mana ) -------------------------//
console.log('Path HTML saat ini:', window.location.href);
console.log('Mencoba memuat font dari path relatif ./aset/fonts/lexend/');
//------------------- ( end debug awal - biar jelas lagi jalan di mana ) -------------------------//

//------------------- ( state global lintas fitur ) -------------------------//
let screens = [
    document.getElementById("warning-screen"),
    document.getElementById("developer-screen"),
    document.getElementById("concept-screen"),
    document.getElementById("title-screen"),
    document.getElementById("main-menu"),
];

let songs = [
    { title: "", src: "" }
];

let wallpapers = [
    { name: "", src: "" }
];

let currentGlobalVolume = 0.8;
//------------------- ( end state global lintas fitur ) -------------------------//
// ================================ ( End Modul & State Global ) ================================ //
