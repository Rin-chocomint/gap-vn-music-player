/**
 * vnhub.d.ts — Tipe untuk objek global `VNHub` (Hub Code-First API).
 *
 * `VNHub` otomatis ter-inject ke setiap hub.html kustom/code-first oleh engine
 * (lihat vn-player/js/vn-hub-api.js). File deklarasi ini hanya untuk autocomplete
 * & type-checking di editor (VS Code) — TIDAK perlu di-import saat runtime.
 *
 * Cara mengaktifkan autocomplete di hub.js novelmu, tambahkan baris di paling atas:
 *   /// <reference path="vnhub.d.ts" />
 * (salin file ini ke folder novel, atau arahkan path-nya ke lokasi engine.)
 */

declare namespace VNHubAPI {
  interface ChapterList {
    mainChapters: string[];
    sideStories: string[];
  }

  interface NovelMeta {
    title?: string;
    storyDesc?: string;
    description?: string;
    genre?: string;
    author?: string;
    illustrator?: string;
    vnMapper?: string;
    cover?: string;
    images?: string[];
    promotionalVideo?: string;
    [key: string]: unknown;
  }

  interface PlayAudioOptions {
    /** Default true. */
    loop?: boolean;
    /** 0..1, default 1.0. */
    volume?: number;
    /** Durasi fade-in & crossfade keluar BGM lama, dalam ms. Default 0. */
    fade?: number;
  }

  interface PlaySFXOptions {
    /** 0..1, default 1.0. */
    volume?: number;
    /** Default false. */
    loop?: boolean;
  }

  interface PlayVideoOptions {
    loop?: boolean;
    /** Klik untuk skip; default true. */
    autoSkip?: boolean;
    onEnd?: () => void;
  }

  interface DiscordActivity {
    details?: string;
    state?: string;
    largeImageKey?: string;
    smallImageKey?: string;
    smallImageText?: string;
  }

  /**
   * Penyimpanan persisten ber-scope per-novel (di balik localStorage, dengan
   * namespace otomatis berdasar judul novel). Untuk flag cerita, unlock CG,
   * achievement, preferensi hub, dll. Nilai harus JSON-serializable.
   */
  interface Storage {
    get<T = unknown>(key: string, fallback?: T): T;
    set<T = unknown>(key: string, value: T): T;
    /** Shallow-merge object ke nilai object yang ada. */
    merge<T extends object = Record<string, unknown>>(key: string, partial: Partial<T>): T;
    has(key: string): boolean;
    remove(key: string): void;
    keys(): string[];
    all(): Record<string, unknown>;
    clear(): void;
  }

  type HubEvent = 'ready' | 'chapter-return' | 'meta-changed' | 'navigate' | 'resume' | 'pause'
    | 'scene-will-change' | 'scene-change' | (string & {});

  /** Mode transisi Scene Manager (vn-hub-runtime.js). */
  type SceneTransition = 'sequential' | 'crossfade' | 'cut';

  /**
   * Scene Manager — perpindahan `.hub-scene` terkelola (runtime v1.1+).
   * Default 'sequential': scene lama fade-out TUNTAS dulu, baru scene baru
   * fade-in (memperbaiki bug crossfade "scene tujuan tampak sebelum waktunya").
   * Override per-scene via atribut `data-transition` pada <section>, per-hub via
   * `data-scene-transition` pada #hub-root/body, atau per-panggilan via opts.
   */
  interface SceneManager {
    version: string;
    list(): HTMLElement[];
    ids(): (string | null)[];
    get(id: string): HTMLElement | null;
    current(): HTMLElement | null;
    currentId(): string | null;
    isTransitioning(): boolean;
    /** Pindah scene. Resolve setelah scene target aktif. */
    show(target: string | HTMLElement, opts?: { transition?: SceneTransition }): Promise<HTMLElement | null>;
    /** Scene terminal (main_menu > info > terakhir). */
    terminal(): HTMLElement | null;
    /** Lewati sisa boot flow, langsung ke terminal scene. */
    skipBoot(opts?: { transition?: SceneTransition }): Promise<HTMLElement | null>;
  }

  interface PlayerSettings {
    /** Semua setting (default + tersimpan). */
    getAll(): { bgm: number; voice: number; sfx: number; textSpeed: number; autoDelay: number; [k: string]: unknown };
    get<T = unknown>(key: string, fallback?: T): T;
    /** Ubah satu setting (bgm|voice|sfx 0..1, textSpeed ms/char, autoDelay ms). */
    set(key: string, value: unknown): unknown;
    /** Merge beberapa setting sekaligus. */
    update(partial: Record<string, unknown>): Record<string, unknown>;
    setFullscreen(on: boolean): void;
    toggleFullscreen(): void;
    /** Ubah ukuran window (resolusi windowed). Diabaikan saat fullscreen. */
    setResolution(width: number, height: number): void;
    /** Set bahasa aktif (kode). Engine memuat script.<code>.json bila ada. */
    setLanguage(code: string): void;
    getLanguage(): Promise<string>;
  }

  interface VNHub {
    // ---- Lifecycle ----
    onReady(callback: () => void): void;
    isReady(): boolean;
    /** Dipanggil saat pemain baru kembali ke hub dari chapter. */
    onChapterReturn(callback: (info: { chapter: string; storyTitle: string }) => void): void;
    /** Window hub kembali terlihat (mis. setelah minimize/alt-tab). */
    onResume(callback: () => void): void;
    /** Window hub disembunyikan. */
    onPause(callback: () => void): void;
    /** Nama chapter yang baru ditinggalkan, atau null bila hub dibuka segar. */
    getReturnedFromChapter(): string | null;

    // ---- Event bus ----
    on(event: HubEvent, callback: (detail: any) => void): (detail: any) => void;
    off(event: HubEvent, callback: (detail: any) => void): void;
    once(event: HubEvent, callback: (detail: any) => void): (detail: any) => void;
    /** Pancarkan event kustom ke bus (juga sebagai window CustomEvent 'vnhub:<event>'). */
    emit(event: HubEvent, detail?: unknown): void;

    // ---- Scene Manager (di-attach runtime; undefined pada hub runtime-inline lama) ----
    scenes?: SceneManager;

    // ---- Navigasi & alur ----
    playChapter(chapterName: string): void;
    getChapterList(): Promise<ChapterList>;
    showChapterSelect(): Promise<void>;
    loadGame(slotId: number): void;
    getSaveSlots(): Promise<unknown[]>;
    showSettings(): void;
    exitToManager(): void;
    /** Dispatch CustomEvent('vnhub:navigate', { detail:{ screen } }). */
    navigateTo(screenId: string): void;

    // ---- Metadata & konteks ----
    getNovelMeta(): NovelMeta;
    getStoryTitle(): string;
    getNovelPath(): string;
    getHubConfig(): Promise<Record<string, unknown> | null>;

    // ---- Progress & playtime ----
    getProgress(): { chapters: Record<string, unknown>; lastPlayed?: string };
    saveProgress(data: object): void;
    getPlayTime(): number;

    // ---- Penyimpanan kustom ----
    storage: Storage;

    // ---- Story -> Hub bridge (flag yang ditulis script via set_hub_flag) ----
    getStoryFlags(): Promise<Record<string, unknown>>;
    getStoryFlag<T = unknown>(key: string, fallback?: T): Promise<T>;
    clearStoryFlags(): Promise<void>;

    // ---- Story vars bridge (snapshot SEMUA variabel sesi bermain terakhir) ----
    /** Ditulis engine otomatis di akhir chapter / return-to-hub (story-vars.json). */
    getStoryVars(): Promise<{ vars: Record<string, unknown>; chapter: string | null; updatedAt: string | null }>;
    getStoryVar<T = unknown>(name: string, fallback?: T): Promise<T>;
    clearStoryVars(): Promise<void>;

    // ---- Achievements (definisi: achievements.json; progres: achievements-state.json) ----
    /**
     * Sistem achievement first-class per-novel. `list()` sekaligus men-sweep
     * unlock otomatis (definisi ber-`unlockFlag` dicek ke hub-flags/story-vars) —
     * panggil di onReady/onChapterReturn. Jangan di-destructure.
     */
    achievements: {
      /** Semua definisi + status unlock. Efek samping: sweep auto-unlock (toast + onUnlock). */
      list(): Promise<Array<{ id: string; title: string; desc?: string; icon?: string; hidden?: boolean; unlockFlag?: string; unlocked: boolean; unlockedAt: string | null }>>;
      /** Daftar id yang sudah terbuka. */
      unlocked(): Promise<string[]>;
      /** Buka achievement; true bila BARU terbuka. */
      unlock(id: string): Promise<boolean>;
      /** Reset progres unlock (mis. New Game penuh). */
      reset(): Promise<void>;
      /** Callback saat achievement BARU terbuka (dari unlock() maupun sweep list()). */
      onUnlock(cb: (def: { id: string; title?: string; icon?: string }) => void): void;
      /** Matikan/nyalakan toast 🏆 bawaan (default nyala). */
      setToastEnabled(on: boolean): void;
    };

    // ---- Settings player (berbagi via localStorage; berlaku saat play berikutnya) ----
    settings: PlayerSettings;

    // ---- Aset ----
    /** Path relatif (dari folder novel) → file:// URL absolut yang sudah di-encode. */
    resolveAsset(relativePath: string): string;
    getGalleryImages(): Promise<string[]>;

    // ---- Audio ----
    /** Putar BGM (1 channel). Memanggil ulang mengganti BGM sebelumnya. */
    playAudio(src: string, options?: PlayAudioOptions): HTMLAudioElement | undefined;
    stopAudio(options?: { fade?: number }): void;
    setBGMVolume(volume: number, options?: { fade?: number }): void;
    /** SFX one-shot, berlapis di atas BGM tanpa menghentikannya. */
    playSFX(src: string, options?: PlaySFXOptions): HTMLAudioElement;
    /** Hentikan BGM + semua SFX. */
    stopAllAudio(options?: { fade?: number }): void;

    // ---- Video ----
    playVideo(src: string, options?: PlayVideoOptions): void;

    // ---- Error reporting ----
    /** Laporkan error manual ke overlay in-app (mis. dari dalam try/catch). */
    reportError(err: Error | string): void;
    /** Aktif/nonaktifkan overlay error in-app (default aktif). Matikan untuk rilis. */
    setErrorOverlay(enabled: boolean): void;

    // ---- Lain-lain ----
    updateRPC(activity: DiscordActivity): void;
  }
}

declare const VNHub: VNHubAPI.VNHub;

interface Window {
  VNHub: VNHubAPI.VNHub;
}

/** Scene Manager juga tersedia sebagai global (identik dengan VNHub.scenes). */
declare const VNHubScenes: VNHubAPI.SceneManager;

/**
 * Event kustom yang dipancarkan engine ke `window`:
 *   - 'vnhub:api-ready'         : objek VNHub sudah ter-inject (belum tentu ada context).
 *   - 'vnhub:ready'             : context novel siap. detail: { storyTitle, metaData }.
 *   - 'vnhub:meta-changed'      : metadata berubah (mis. dari editor). detail: { metaData }.
 *   - 'vnhub:navigate'          : dipancarkan oleh VNHub.navigateTo(). detail: { screen }.
 *   - 'vnhub:scene-will-change' : sebelum pindah scene. detail: { fromId, toId, transition }.
 *   - 'vnhub:scene-change'      : setelah scene target aktif. detail: { fromId, toId, transition }.
 */
