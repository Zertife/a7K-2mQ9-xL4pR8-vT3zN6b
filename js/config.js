// ==========================================
// KONFIGURASI GAME & TEMA
// ==========================================
// Deteksi perangkat sentuh utama (ponsel/tablet), dipakai untuk
// memilih kontrol dan profil render yang lebih aman untuk GPU mobile.
function isProbablyMobileDevice() {
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    const coarsePointer = !!(window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    const touchCapable = (navigator.maxTouchPoints || 0) > 0;
    // Touch laptop biasanya punya hover/mouse; jangan paksa ke mode mobile.
    return uaMobile || coarsePointer || (touchCapable && Math.min(screen.width || 9999, screen.height || 9999) <= 1024);
}

const IS_MOBILE_DEVICE = isProbablyMobileDevice();

// ==========================================
// GRAPHICS QUALITY PRESETS
// Highest intentionally mirrors the original rendering path.
// Lower presets trade visual effects for substantially lower GPU/CPU cost.
// The active preset is read before Three.js initializes. Changing it in
// Arrangements applies immediately WITHOUT reloading the page — game.js
// rebuilds the renderer, minimap, materials and the active level live.
// ==========================================
const GRAPHICS_PRESETS = Object.freeze({
    highest: Object.freeze({
        id: 'highest',
        label: 'Highest (Original)',
        description: 'Original visuals: Full PBR, maximum effects and detail.',
        antialias: !IS_MOBILE_DEVICE,
        precision: 'highp',
        maxPixelRatio: IS_MOBILE_DEVICE ? 1.35 : 2.0,
        shadows: !IS_MOBILE_DEVICE,
        materialMode: 'pbr',
        crystalMaterialMode: 'pbr',
        normalCrystalCore: true,
        monsterMaterialMode: 'pbr',
        instancedWalls: false,
        playerLight: true,
        playerLightIntensity: 1.25,
        playerLightDistance: 22,
        safeZoneLight: true,
        powerCrystalLights: true,
        monsterLights: true,
        pickupLights: true,
        monsterCoreWidth: 18,
        monsterCoreHeight: 18,
        monsterShellWidth: 40,
        monsterShellHeight: 40,
        monsterRingRadial: 8,
        monsterRingTubular: 32,
        monsterRingCount: 3,
        monsterOrbCount: 7,
        monsterOrbWidth: 8,
        monsterOrbHeight: 8,
        monsterTendrilCount: 6,
        minimapSize: 480,
        minimapGlow: true,
        visualFps: 60,
        crystalAnimDistanceCells: Infinity,
        crystalDrawDistanceCells: Infinity,
        aiIntervalMultiplier: 1.0,
        pickupParticleScale: 1.0,
        pickupRing: true
    }),
    high: Object.freeze({
        id: 'high',
        label: 'High',
        description: 'PBR remains active, but expensive draw calls and effects are gradually reduced.',
        antialias: !IS_MOBILE_DEVICE,
        precision: 'highp',
        maxPixelRatio: IS_MOBILE_DEVICE ? 1.2 : 1.6,
        shadows: false,
        materialMode: 'pbr',
        crystalMaterialMode: 'pbr',
        normalCrystalCore: true,
        monsterMaterialMode: 'pbr',
        instancedWalls: true,
        playerLight: true,
        playerLightIntensity: 1.05,
        playerLightDistance: 18,
        safeZoneLight: true,
        powerCrystalLights: true,
        monsterLights: false,
        pickupLights: true,
        monsterCoreWidth: 16,
        monsterCoreHeight: 16,
        monsterShellWidth: 28,
        monsterShellHeight: 24,
        monsterRingRadial: 6,
        monsterRingTubular: 24,
        monsterRingCount: 3,
        monsterOrbCount: 5,
        monsterOrbWidth: 7,
        monsterOrbHeight: 6,
        monsterTendrilCount: 4,
        minimapSize: 400,
        minimapGlow: true,
        visualFps: 60,
        crystalAnimDistanceCells: 10,
        crystalDrawDistanceCells: Infinity,
        aiIntervalMultiplier: 1.15,
        pickupParticleScale: 0.8,
        pickupRing: true
    }),
    medium: Object.freeze({
        id: 'medium',
        label: 'Medium',
        description: 'Mobile-optimized profile: lightweight shaders and limited dynamic lighting.',
        antialias: false,
        precision: 'highp',
        maxPixelRatio: 1.35,
        shadows: false,
        materialMode: 'lambert',
        crystalMaterialMode: 'lambert',
        normalCrystalCore: true,
        monsterMaterialMode: 'lambert',
        instancedWalls: true,
        playerLight: true,
        playerLightIntensity: 0.9,
        playerLightDistance: 13,
        safeZoneLight: false,
        powerCrystalLights: false,
        monsterLights: false,
        pickupLights: false,
        monsterCoreWidth: 10,
        monsterCoreHeight: 8,
        monsterShellWidth: 16,
        monsterShellHeight: 12,
        monsterRingRadial: 6,
        monsterRingTubular: 16,
        monsterRingCount: 3,
        monsterOrbCount: 3,
        monsterOrbWidth: 5,
        monsterOrbHeight: 4,
        monsterTendrilCount: 2,
        minimapSize: 320,
        minimapGlow: true,
        visualFps: 30,
        crystalAnimDistanceCells: 6.5,
        crystalDrawDistanceCells: Infinity,
        aiIntervalMultiplier: 1.45,
        pickupParticleScale: 0.65,
        pickupRing: true
    }),
    low: Object.freeze({
        id: 'low',
        label: 'Low',
        description: 'The most resource-efficient shader: low draw calls, minimal effects.',
        antialias: false,
        precision: 'mediump',
        maxPixelRatio: 1.0,
        shadows: false,
        materialMode: 'lambert',
        crystalMaterialMode: 'basic',
        normalCrystalCore: false,
        monsterMaterialMode: 'lambert',
        instancedWalls: true,
        playerLight: false,
        playerLightIntensity: 0,
        playerLightDistance: 0,
        safeZoneLight: false,
        powerCrystalLights: false,
        monsterLights: false,
        pickupLights: false,
        monsterCoreWidth: 8,
        monsterCoreHeight: 6,
        monsterShellWidth: 12,
        monsterShellHeight: 8,
        monsterRingRadial: 5,
        monsterRingTubular: 12,
        monsterRingCount: 2,
        monsterOrbCount: 2,
        monsterOrbWidth: 4,
        monsterOrbHeight: 3,
        monsterTendrilCount: 1,
        minimapSize: 256,
        minimapGlow: false,
        visualFps: 24,
        crystalAnimDistanceCells: 4.5,
        crystalDrawDistanceCells: 8,
        aiIntervalMultiplier: 1.75,
        pickupParticleScale: 0.4,
        pickupRing: true
    }),
    potato: Object.freeze({
        id: 'potato',
        label: 'Potato',
        description: 'Cheapest shader, low draw calls, minimal effects.',
        antialias: false,
        precision: 'mediump',
        maxPixelRatio: 0.7,
        shadows: false,
        materialMode: 'basic',
        crystalMaterialMode: 'basic',
        normalCrystalCore: false,
        monsterMaterialMode: 'lambert',
        instancedWalls: true,
        playerLight: false,
        playerLightIntensity: 0,
        playerLightDistance: 0,
        safeZoneLight: false,
        powerCrystalLights: false,
        monsterLights: false,
        pickupLights: false,
        monsterCoreWidth: 6,
        monsterCoreHeight: 5,
        monsterShellWidth: 8,
        monsterShellHeight: 6,
        monsterRingRadial: 4,
        monsterRingTubular: 8,
        monsterRingCount: 1,
        monsterOrbCount: 0,
        monsterOrbWidth: 3,
        monsterOrbHeight: 3,
        monsterTendrilCount: 0,
        minimapSize: 192,
        minimapGlow: false,
        visualFps: 15,
        crystalAnimDistanceCells: 2.75,
        crystalDrawDistanceCells: 5,
        aiIntervalMultiplier: 2.2,
        pickupParticleScale: 0.25,
        pickupRing: false
    })
});

function getDefaultGraphicsQuality() {
    // Medium matches the previous mobile optimization pass. Desktop keeps the
    // creator's original appearance by default.
    return IS_MOBILE_DEVICE ? 'medium' : 'highest';
}

function readStoredGraphicsQuality() {
    try {
        const raw = localStorage.getItem('pac3d_settings');
        if (!raw) return getDefaultGraphicsQuality();
        const saved = JSON.parse(raw);
        const id = saved && saved.graphicsQuality;
        return GRAPHICS_PRESETS[id] ? id : getDefaultGraphicsQuality();
    } catch (e) {
        return getDefaultGraphicsQuality();
    }
}

// Variabel aktif ini DIUBAH secara live oleh setGraphicsQuality() ketika user
// mengganti Graphics Quality di menu Arrangements — tanpa reload halaman.
let GRAPHICS_QUALITY = readStoredGraphicsQuality();
let GRAPHICS_CONFIG = GRAPHICS_PRESETS[GRAPHICS_QUALITY] || GRAPHICS_PRESETS.highest;

function getGraphicsQuality() { return GRAPHICS_QUALITY; }
function getGraphicsConfig() { return GRAPHICS_CONFIG; }

// Terapkan preset grafis baru tanpa me-reload halaman. Mengembalikan false bila
// id tidak dikenal (pemanggil boleh jatuh ke reload sebagai fallback).
// Antialias & precision renderer hanya bisa diubah lewat pembuatan ulang
// renderer — penanganannya ada di game.js (applyGraphicsQualityLive).
function setGraphicsQuality(id) {
    if (!GRAPHICS_PRESETS[id]) return false;
    GRAPHICS_QUALITY = id;
    GRAPHICS_CONFIG = GRAPHICS_PRESETS[id];
    // Persist the choice so it survives reloads / browser restarts.
    try {
        let saved = {};
        const raw = localStorage.getItem('pac3d_settings');
        if (raw) saved = JSON.parse(raw) || {};
        saved.graphicsQuality = id;
        localStorage.setItem('pac3d_settings', JSON.stringify(saved));
    } catch (e) { /* ignore storage errors */ }
    return true;
}

// ==========================================
// MINIMAP FPS SETTING (independent from Graphics Quality)
// The quality preset still controls minimap internal resolution/glow, while
// refresh rate is a separate user preference shared by PC and Mobile.
// ==========================================
const MINIMAP_FPS_OPTIONS = Object.freeze([15, 30, 40, 60]);

function getDefaultMinimapFps() {
    return IS_MOBILE_DEVICE ? 15 : 60;
}

function normalizeMinimapFps(value) {
    const fps = parseInt(value, 10);
    return MINIMAP_FPS_OPTIONS.includes(fps) ? fps : getDefaultMinimapFps();
}

function readStoredMinimapFps() {
    try {
        const raw = localStorage.getItem('pac3d_settings');
        if (!raw) return getDefaultMinimapFps();
        const saved = JSON.parse(raw);
        return normalizeMinimapFps(saved && saved.minimapFps);
    } catch (e) {
        return getDefaultMinimapFps();
    }
}

function getDefaultControlMode() {
    return IS_MOBILE_DEVICE ? 'mobile' : 'pc';
}

const GRID_SIZE = 27; // Harus ganjil agar grid konsisten
const CELL_SIZE = 2.4; // Lebar standar lorong hotel
let TOTAL_PELLETS = 0;

const GAME_SPEED = 5.4;
const MONSTER_SPEED = 5.3;


const DIFFICULTIES = {
    easy: {
        id: 'easy',
        label: 'Easy',
        monsterCount: 3,
        huntInterval: 0.48,
        occupancyPenalty: 10,
        desc: '3 monster. Jalur pelarian masih longgar.'
    },
    normal: {
        id: 'normal',
        label: 'Normal',
        monsterCount: 4,
        huntInterval: 0.36,
        occupancyPenalty: 14,
        desc: '4 monster. Mereka mulai membagi koridor.'
    },
    hard: {
        id: 'hard',
        label: 'Hard',
        monsterCount: 5,
        huntInterval: 0.26,
        occupancyPenalty: 18,
        desc: '5 monster. Pengepungan dari beberapa jalur sekaligus.'
    }
};
let currentDifficulty = 'normal';
function getDifficultyConfig() {
    return DIFFICULTIES[currentDifficulty] || DIFFICULTIES.normal;
}
function getMonsterCount() {
    return getDifficultyConfig().monsterCount;
}
function setCurrentDifficulty(id) {
    currentDifficulty = DIFFICULTIES[id] ? id : 'normal';
    return currentDifficulty;
}

const PLAYER_RADIUS = 0.45;
const PELLET_PICKUP_RADIUS = 1.05; // 2D radius untuk pengambilan pellet responsif
const PLAYER_BASE_Y = 1.5;

// ==========================================
// DEBUG MODE (Panel cheat / debug — tekan TAB saat bermain)
// ==========================================
const DEBUG = {
    fullMap: false,     // Minimap: tampilkan seluruh peta (north-up), bukan hanya sebagian kecil
    hints: true,        // Aktifkan / matikan hint penunjuk arah (pellet & zona aman)
    monsters: true,     // Aktifkan / matikan pergerakan monster
};

// Konfigurasi View Bobbing (Head Bobbing)
const BOB_FREQUENCY = 7.5;      // Kecepatan langkah kaki
const BOB_AMPLITUDE_Y = 0.041;  // Ketinggian pantulan vertikal langkah
const BOB_AMPLITUDE_X = 0.028;  // Ayunan horizontal bahu/kepala
const BOB_ROLL_AMPLITUDE = 0.008; // Kemiringan rotasi kepala (tilt) puncak saat berjalan, dalam radian (~0.45°) — frame-rate independent
const IDLE_BREATH_SPEED = 1.6;  // Kecepatan bernapas saat diam
const IDLE_BREATH_AMPLITUDE = 0.012; // Ayunan lembut saat diam

let currentLevel = 1;
let lives = 5;
let pelletsEaten = 0;
// Statistik sesi bermain — direset oleh startGame() (sesi baru) dan ditampilkan
// pada overlay "YOU'VE ESCAPED" saat pemain berhasil mencapai Safe Zone.
let sessionPlayTime = 0; // total waktu bermain sesi ini (detik; hanya dihitung selagi gameplay aktif)
let sessionCrystals = 0; // total kristal yang terkumpul sepanjang sesi (tetap menumpuk lintas level)
let sessionDeaths = 0;   // total kali pemain tertangkap monster sepanjang sesi

// ==========================================
// DORMANSI MONSTER DI SPAWN POINT
// ==========================================
// Saat level dimulai, monster "tidur" di spawn point masing-masing dan baru
// bergerak ketika pemain mendekati radius ini. Jika monster dikembalikan ke
// spawn point lewat teleportasi (safe zone ejection), ia LANGSUNG aktif
// tanpa menunggu pemain mendekat lagi. Pada FASE KABUR (semua kristal
// terkumpul) monster justru diteleport ke posisi penjaga di sekitar Safe
// Zone dan kembali dormant — lihat deploySafeZoneGuards() di game.js.
const MONSTER_WAKE_RADIUS_CELLS = 6;
const MONSTER_WAKE_RADIUS = MONSTER_WAKE_RADIUS_CELLS * CELL_SIZE;

// ==========================================
// TENGAH PETA & FASE KABUR (SEMUA KRISTAL TERKUMPUL)
// ==========================================
// GRID_SIZE selalu ganjil, sehingga sel tengah selalu ada dan dijamin terbuka
// (baris & kolom "central avenue" dibuka paksa oleh generator maze).
const MAP_CENTER_GX = (GRID_SIZE - 1) / 2;
const MAP_CENTER_GZ = (GRID_SIZE - 1) / 2;
const MAP_CENTER_X = MAP_CENTER_GX * CELL_SIZE;
const MAP_CENTER_Z = MAP_CENTER_GZ * CELL_SIZE;

// Sel penjaga monster saat fase kabur: pintu keluar Safe Zone yang dijamin
// terbuka oleh generator maze (grid[4][1..3] & grid[1..3][4]). Monster
// diteleport ke sini lalu dormant, berjaga mengawal pintu masuk Safe Zone
// dan baru bergerak ketika pemain mendekat (radius bangun di atas).
const SAFE_ZONE_GUARD_CELLS = [
    { x: 4, z: 1 }, { x: 4, z: 2 }, { x: 4, z: 3 },
    { x: 1, z: 4 }, { x: 2, z: 4 }, { x: 3, z: 4 }
];

// ==========================================
// GRACE PERIOD SETELAH PEMAIN MATI
// ==========================================
// Setelah respawn dari kematian, pemain di-spawn ulang (fase normal: di Safe
// Zone; fase kabur/sisa kristal 0: di tengah peta) sementara monster TIDAK
// diubah kecuali fase kabur (penjaga di-reset ke posisi jaga). Selama durasi
// ini monster dibekukan dan tidak bisa menangkap pemain agar ada waktu kabur.
const RESPAWN_GRACE_DURATION = 3.0;

// Lama "victory lap" setelah pemain mencapai Safe Zone (kondisi menang):
// pemain MASIH BISA BERGERAK selama durasi ini sebelum overlay
// "YOU'VE ESCAPED" muncul dan sesi permainan diakhiri.
const ESCAPE_VICTORY_LAP_DURATION = 2.0;

const STUN_DURATION = 12.0;
const DETECTOR_DURATION = 20.0;
let isStunned = false;
let stunTimeRemaining = 0;
let isDetectorActive = false;
let detectorTimeRemaining = 0;
let gameActive = false;
let isPaused = false;
let isDying = false;
let isRespawnGrace = false;      // true saat pemain dalam masa aman pasca-respawn
let respawnGraceTimeRemaining = 0;
let mustReturnToSafeZone = false; // Flag: semua pellet habis, harus kembali ke safe zone untuk menang
let escapeEnding = false; // Flag: pemain baru saja mencapai Safe Zone (menang) — "victory lap" singkat berjalan sebelum overlay YOU'VE ESCAPED tampil
let sceneReady = false; // Flag: true bila ada level yang sedang dimuat di scene. Kalau false (di menu), loop animasi membersihkan canvas menjadi hitam polos alih-alih me-render gambar sisa permainan terakhir.

// Konfigurasi Area Safe Zone (3x3 grid luas di pojok labirin)
const SAFE_ZONE_MIN_X = 1;
const SAFE_ZONE_MAX_X = 3;
const SAFE_ZONE_MIN_Z = 1;
const SAFE_ZONE_MAX_Z = 3;
const SAFE_ZONE_CENTER_X = 2 * CELL_SIZE;
const SAFE_ZONE_CENTER_Z = 2 * CELL_SIZE;

function isInsideSafeZone(gx, gz) {
    return gx >= SAFE_ZONE_MIN_X && gx <= SAFE_ZONE_MAX_X && gz >= SAFE_ZONE_MIN_Z && gz <= SAFE_ZONE_MAX_Z;
}

function isInsideSafeZoneWorld(wx, wz, margin = 0) {
    const minW = (SAFE_ZONE_MIN_X - 0.5) * CELL_SIZE - margin;
    const maxW = (SAFE_ZONE_MAX_X + 0.5) * CELL_SIZE + margin;
    const minZ = (SAFE_ZONE_MIN_Z - 0.5) * CELL_SIZE - margin;
    const maxZ = (SAFE_ZONE_MAX_Z + 0.5) * CELL_SIZE + margin;
    return wx >= minW && wx <= maxW && wz >= minZ && wz <= maxZ;
}

const THEMES = {
    1: {
        name: "Floor 1 (Grand Luxury Hotel)",
        wallColor: 0x5a2d18,
        floorColor: 0x4a121a,
        ceilingColor: 0x1f1815,
        lightColor: 0xffd27d,
        fogColor: 0x140e0b,
        ambientIntensity: 0.5,
        style: 'hotel'
    },
    2: {
        name: "Basement (Maintenance Corridors)",
        wallColor: 0x2c3e50,
        floorColor: 0x1a252f,
        ceilingColor: 0x11161b,
        lightColor: 0x48dbfb,
        fogColor: 0x090f14,
        ambientIntensity: 0.45,
        style: 'basement'
    },
    3: {
        name: "Penthouse (Classic Suite Labyrinth)",
        wallColor: 0x3d271d,
        floorColor: 0x1e272e,
        ceilingColor: 0x18120e,
        lightColor: 0xfeca57,
        fogColor: 0x150f08,
        ambientIntensity: 0.55,
        style: 'penthouse'
    }
};