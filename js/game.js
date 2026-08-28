// ==========================================
// SETUP THREE.JS ENGINE & GAME CONTROLLER
// ==========================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

function getViewportSize() {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round(vv ? vv.width : (document.documentElement.clientWidth || window.innerWidth)));
    const height = Math.max(1, Math.round(vv ? vv.height : (document.documentElement.clientHeight || window.innerHeight)));
    return { width, height };
}

const initialViewport = getViewportSize();
const camera = new THREE.PerspectiveCamera(75, initialViewport.width / initialViewport.height, 0.1, 1000);

let renderer = null;

// Pasang listener WebGL context-lost. Dipanggil ulang setiap kali renderer
// dibuat ulang (pergantian Graphics Quality tanpa reload) karena listener
// menempel pada DOM canvas lama yang diganti.
function attachRendererContextListeners(rend) {
    rend.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        if (gameActive && !isPaused) pauseGame();
        if (typeof showNotification === 'function') {
            showNotification('Grafis dijeda sementara. Kembali ke game untuk melanjutkan.');
        }
    });
}

// Renderer dibangun lewat fungsi khusus karena antialias & precision hanya
// dapat ditentukan pada konstruktor. Saat Graphics Quality diganti tanpa
// reload, renderer dibuat ulang oleh recreateRenderer().
function createRenderer() {
    let rend;
    try {
        rend = new THREE.WebGLRenderer({
            antialias: GRAPHICS_CONFIG.antialias,
            precision: GRAPHICS_CONFIG.precision,
            powerPreference: 'high-performance'
        });
    } catch (err) {
        const msg = document.createElement('div');
        msg.className = 'webgl-error';
        msg.innerHTML = '<strong>Game 3D tidak dapat dimulai.</strong><br>Browser/perangkat ini tidak menyediakan WebGL. Coba Chrome/Safari terbaru dan pastikan akselerasi grafis aktif.';
        document.body.appendChild(msg);
        throw err;
    }

    const vp = getViewportSize();
    rend.setSize(vp.width, vp.height, false);
    rend.setPixelRatio(Math.min(window.devicePixelRatio || 1, GRAPHICS_CONFIG.maxPixelRatio));
    rend.shadowMap.enabled = GRAPHICS_CONFIG.shadows;
    if (rend.shadowMap.enabled) rend.shadowMap.type = THREE.PCFSoftShadowMap;
    rend.domElement.style.touchAction = 'none';
    attachRendererContextListeners(rend);
    container.appendChild(rend.domElement);
    return rend;
}

renderer = createRenderer();

const controls = new THREE.PointerLockControls(camera, document.body);

// Minimap Setup. Internal resolution/glow follow Graphics Quality, but refresh
// rate is controlled independently from Arrangements (15/30/40/60 FPS).
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = GRAPHICS_CONFIG.minimapSize;
minimapCanvas.height = GRAPHICS_CONFIG.minimapSize;
let currentMinimapFps = (typeof readStoredMinimapFps === 'function') ? readStoredMinimapFps() : 60;
let minimapInterval = currentMinimapFps >= 60 ? 0 : (1 / currentMinimapFps);
// var aktif: di-update saat Graphics Quality diganti tanpa reload
let VISUAL_INTERVAL = GRAPHICS_CONFIG.visualFps >= 60 ? 0 : (1 / GRAPHICS_CONFIG.visualFps);
let _minimapAccumulator = 0;
let _visualAccumulator = 0;

function setMinimapFps(value) {
    const fps = (typeof normalizeMinimapFps === 'function')
        ? normalizeMinimapFps(value)
        : ([15, 30, 40, 60].includes(parseInt(value, 10)) ? parseInt(value, 10) : 60);
    currentMinimapFps = fps;
    minimapInterval = fps >= 60 ? 0 : (1 / fps);
    _minimapAccumulator = 0;
    return currentMinimapFps;
}

function getMinimapFps() {
    return currentMinimapFps;
}

// ==========================================
// APPLY GRAPHICS QUALITY LIVE (tanpa reload halaman)
// Dipanggil oleh menu Arrangements (menu.js) setiap kali preset grafis diubah.
// 1) renderer dibuat ulang           → antialias/precision/pixel ratio/shadow.
// 2) resolusi internal minimap & interval kosmetik mengikuti preset baru.
// 3) cache material kristal dibuang  → dibangun ulang dgn material(shader) baru.
// 4) level yang sedang aktif dibangun ulang memakai preset baru.
// ==========================================
function recreateRenderer() {
    if (renderer && renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = createRenderer();
}

function applyGraphicsQualityLive(quality) {
    if (!quality || (typeof GRAPHICS_PRESETS !== 'undefined' && !GRAPHICS_PRESETS[quality])) return false;
    if (typeof setGraphicsQuality === 'function') {
        if (!setGraphicsQuality(quality)) return false;
    }

    // 1) Renderer baru (antialias, precision, DPR, shadow).
    recreateRenderer();

    // 2) Resolusi internal minimap & interval visual dari preset baru.
    minimapCanvas.width = GRAPHICS_CONFIG.minimapSize;
    minimapCanvas.height = GRAPHICS_CONFIG.minimapSize;
    VISUAL_INTERVAL = GRAPHICS_CONFIG.visualFps >= 60 ? 0 : (1 / GRAPHICS_CONFIG.visualFps);
    _visualAccumulator = 0;
    _minimapAccumulator = 0;

    // 3) Cache material kristal dibuang → dibuat ulang saat level dimuat.
    if (typeof resetCachedCrystalMaterials === 'function') resetCachedCrystalMaterials();

    // 4) Bangun ulang level yang sedang aktif (dinding, monster, kristal, lampu).
    if (sceneReady && typeof currentLevel === 'number') {
        loadLevel(currentLevel);
        resizeRendererToViewport();
    }

    return true;
}

// Game Entities State
let maze = [];
let wallMeshes = [];
let pellets = [];
let monsters = [];
let packHuntTimer = 0;
let _monsterWakeNotified = false; // Notifikasi "monster bangun" hanya muncul sekali per level

// Crystal Pickup Particle & FX Entities
let pickupParticles = [];
let pickupRings = [];
let pickupLights = [];

// BGM state: true bila trek ambient2 (hint pellet aktif) sedang diputar
let _hintMusicActive = false;

// Movement Flags & View Bobbing State
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();
let playerX = CELL_SIZE;
let playerZ = CELL_SIZE;
let bobTimer = 0;
let bobIntensity = 0;
let idleTimer = 0;
let lastStepIndex = 0;

// Creator Proximity Dialog State
const CREATOR_DIALOG_LINES = [
    "Run!",
    "They're close!",
    "Focus!",
    "You wanna die?!",
    "Watch out!"
];
let creatorDialogVisible = false;
let creatorDialogHideTimer = null;
let creatorDialogCooldown = 0; // seconds cooldown between dialog pops
let lastCreatorDialogLine = -1;
let creatorTypewriterTimer = null; // interval untuk efek mengetik teks dialog (muncul bertahap)

// State untuk dialog The Creator yang terpicu oleh hint lokasi pellet
// (muncul saat pellet tersisa < 30%). Dialog ini punya prioritas tertinggi:
// tidak boleh ditimpa oleh dialog dekat-monster.
let hintActive = false;              // true saat hint lokasi pellet sedang aktif (di-update tiap frame)
let creatorHintDialogShown = false;  // true setelah dialog hint sudah tampil pada level ini (hanya sekali)
let creatorHintDialogActive = false; // true saat dialog hint sedang tampil → dialog dekat-monster dilarang menimpanya

// ==========================================
// LOAD LEVEL & ENVIRONMENT
// ==========================================
function loadLevel(lvl) {
    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }
    // Buang lampu player (dan child lain) yang menempel di kamera dari level
    // sebelumnya. Tanpa ini lampu akan menumpuk tiap kali level dibangun ulang
    // (termasuk saat Graphics Quality diganti tanpa reload halaman).
    while (camera.children.length > 0) {
        camera.remove(camera.children[0]);
    }
    wallMeshes = [];
    pellets = [];
    monsters = [];

    // Clean up active pickup FX
    pickupParticles.forEach(p => { if (p.mat) p.mat.dispose(); });
    pickupParticles = [];
    pickupRings.forEach(r => { if (r.mat) r.mat.dispose(); });
    pickupRings = [];
    pickupLights = [];

    const flashEl = document.getElementById('pickup-lens-flash');
    if (flashEl) flashEl.className = '';

    // Reset powerup effects on level load
    isStunned = false;
    stunTimeRemaining = 0;
    isDetectorActive = false;
    detectorTimeRemaining = 0;

    // Reset dormansi monster & masa aman pasca-respawn untuk level baru
    clearRespawnGrace();
    _monsterWakeNotified = false;
    // Reset state dialog hint The Creator untuk level baru (tampil lagi sekali
    // saat hint lokasi pellet aktif kembali).
    hintActive = false;
    creatorHintDialogShown = false;
    creatorHintDialogActive = false;
    hideCreatorDialog();
    const tintStunEl = document.getElementById('tint-stun');
    const tintRadarEl = document.getElementById('tint-radar');
    if (tintStunEl) tintStunEl.classList.remove('active');
    if (tintRadarEl) tintRadarEl.classList.remove('active');
    updatePowerupHUD();

    const theme = THEMES[lvl] || THEMES[1];
    scene.background = new THREE.Color(theme.fogColor);
    scene.fog = new THREE.FogExp2(theme.fogColor, 0.048);

    // Ambient & Dynamic Player Light (Lantern/Flashlight effect highlighting 3D Normal Maps)
    const ambientLight = new THREE.AmbientLight(theme.lightColor, theme.ambientIntensity);
    scene.add(ambientLight);

    if (GRAPHICS_CONFIG.playerLight) {
        const playerLight = new THREE.PointLight(
            0xfffaed,
            GRAPHICS_CONFIG.playerLightIntensity,
            GRAPHICS_CONFIG.playerLightDistance,
            1.2
        );
        playerLight.position.set(0, 0, 0.2);
        camera.add(playerLight);
    }
    scene.add(camera);

    // Generate Interconnected Hotel Hallways
    maze = generateHotelMaze(GRID_SIZE);

    // 3D PBR Materials with Procedural Normal, Bump, Roughness & Metalness Maps
    const { wallMat, floorMat, ceilingMat } = createLevelMaterials(lvl);

    const wallGeo = new THREE.BoxGeometry(CELL_SIZE, CELL_SIZE * 1.15, CELL_SIZE);
    const planeGeo = new THREE.PlaneGeometry(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE);

    // Floor
    const floor = new THREE.Mesh(planeGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((GRID_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, 0, (GRID_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
    scene.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(planeGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((GRID_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2, CELL_SIZE * 1.15, (GRID_SIZE * CELL_SIZE) / 2 - CELL_SIZE / 2);
    scene.add(ceiling);

    // Build Walls and Collect Empty Cells. Highest keeps the creator's original
    // per-wall path; every lower preset batches identical walls into one draw call.
    let emptyCells = [];
    if (GRAPHICS_CONFIG.instancedWalls && THREE.InstancedMesh) {
        let wallCount = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) if (maze[r][c] === 1) wallCount++;
        }
        const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
        const matrix = new THREE.Matrix4();
        let wi = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (maze[r][c] === 1) {
                    matrix.makeTranslation(c * CELL_SIZE, (CELL_SIZE * 1.15) / 2, r * CELL_SIZE);
                    walls.setMatrixAt(wi++, matrix);
                } else if (!isInsideSafeZone(c, r)) {
                    emptyCells.push({ x: c, z: r });
                }
            }
        }
        walls.instanceMatrix.needsUpdate = true;
        scene.add(walls);
        wallMeshes.push(walls);
    } else {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (maze[r][c] === 1) {
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(c * CELL_SIZE, (CELL_SIZE * 1.15) / 2, r * CELL_SIZE);
                    scene.add(wall);
                    wallMeshes.push(wall);
                } else if (!isInsideSafeZone(c, r)) {
                    emptyCells.push({ x: c, z: r });
                }
            }
        }
    }

    // SafeZone Visual Marker (Expansive Emerald Sanctuary Carpet, Borders, and Sacred Light)
    const szWidth = (SAFE_ZONE_MAX_X - SAFE_ZONE_MIN_X + 1) * CELL_SIZE;
    const szHeight = (SAFE_ZONE_MAX_Z - SAFE_ZONE_MIN_Z + 1) * CELL_SIZE;

    // 1. Base Emerald Carpet
    const szGeo = new THREE.PlaneGeometry(szWidth - 0.15, szHeight - 0.15);
    const szMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });
    const szMesh = new THREE.Mesh(szGeo, szMat);
    szMesh.rotation.x = Math.PI / 2;
    szMesh.position.set(SAFE_ZONE_CENTER_X, 0.05, SAFE_ZONE_CENTER_Z);
    scene.add(szMesh);

    // 2. Glowing Boundary Frame
    const szBorderGeo = new THREE.RingGeometry((szWidth / 2) * 0.95, (szWidth / 2), 4, 1, Math.PI / 4);
    const szBorderMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const szBorderMesh = new THREE.Mesh(szBorderGeo, szBorderMat);
    szBorderMesh.rotation.x = Math.PI / 2;
    szBorderMesh.position.set(SAFE_ZONE_CENTER_X, 0.055, SAFE_ZONE_CENTER_Z);
    scene.add(szBorderMesh);

    // 3. Central Sanctuary Seal
    const szCoreGeo = new THREE.RingGeometry(0.35, 0.75, 32);
    const szCoreMat = new THREE.MeshBasicMaterial({ color: 0x55ffbb, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
    const szCoreMesh = new THREE.Mesh(szCoreGeo, szCoreMat);
    szCoreMesh.rotation.x = Math.PI / 2;
    szCoreMesh.position.set(SAFE_ZONE_CENTER_X, 0.06, SAFE_ZONE_CENTER_Z);
    scene.add(szCoreMesh);

    // 4. Soft Ambient Sanctuary Green Light
    if (GRAPHICS_CONFIG.safeZoneLight) {
        const szLight = new THREE.PointLight(0x00ff88, 1.4, 12, 1.2);
        szLight.position.set(SAFE_ZONE_CENTER_X, 1.9, SAFE_ZONE_CENTER_Z);
        scene.add(szLight);
    }

    // Spawn Player at Center of Safezone
    playerX = SAFE_ZONE_CENTER_X;
    playerZ = SAFE_ZONE_CENTER_Z;
    bobTimer = 0;
    bobIntensity = 0;
    idleTimer = 0;
    lastStepIndex = 0;
    mustReturnToSafeZone = false;
    camera.position.set(playerX, PLAYER_BASE_Y, playerZ);
    // Pastikan awal level bebas dari tilt sisa sesi/sebelumnya.
    resetCameraRoll();

    // Spawn Monsters spread far from player
    // Player spawn berada di pojok kiri-atas (safe zone, sekitar grid 2,2),
    // jadi spawn monster HANYA dipilih dari ujung peta yang paling jauh dari
    // sana, dengan jarak antar-spawn minimum yang dijamin tidak berdekatan.
    const monsterColors = [0xff0055, 0x00ffcc, 0xff00ff, 0xffaa00, 0x4488ff];
    const monsterCount = typeof getMonsterCount === 'function' ? getMonsterCount() : 4;
    packHuntTimer = 0;

    const safeGridX = SAFE_ZONE_CENTER_X / CELL_SIZE;
    const safeGridZ = SAFE_ZONE_CENTER_Z / CELL_SIZE;
    const distFromPlayerSpawn = c => Math.hypot(c.x - safeGridX, c.z - safeGridZ);

    // Urutkan sel kosong dari yang TERJAUH sampai terdekat dari spawn player
    const rankedFarCells = emptyCells.slice().sort((a, b) => distFromPlayerSpawn(b) - distFromPlayerSpawn(a));
    const farthestDist = rankedFarCells.length ? distFromPlayerSpawn(rankedFarCells[0]) : 0;

    // Ambil hanya "outer band" peta: sel minimal pada proporsi jarak tertentu
    // dibanding titik terjauh. Threshold direlaksasi bertahap bila jumlah
    // koridor di ujung peta tidak cukup untuk semua monster.
    const POOL_RATIO_STEPS = [0.68, 0.58, 0.46, 0.34, 0];
    let candidatePool = rankedFarCells;
    for (const ratio of POOL_RATIO_STEPS) {
        candidatePool = rankedFarCells.filter(c => distFromPlayerSpawn(c) >= farthestDist * ratio);
        if (candidatePool.length >= monsterCount) break;
    }

    let chosenSpawns = [];
    const minDistToChosen = c => chosenSpawns.length === 0
        ? Infinity
        : Math.min(...chosenSpawns.map(u => Math.hypot(u.x - c.x, u.z - c.z)));

    // Pilih spawn dengan separasi minimum ANTAR MONSTER (dalam satuan grid).
    // Threshold dilonggarkan otomatis bila geometri labirin memungkinkan.
    const MIN_SEPARATION_STEPS = [14, 12, 10, 8, 6, 4, 2];
    for (const targetSep of MIN_SEPARATION_STEPS) {
        chosenSpawns = [];

        // Monster pertama: acak di antara beberapa sel terjauh agar tiap sesi bervariasi
        const headLen = Math.min(6, candidatePool.length);
        chosenSpawns.push(candidatePool[Math.floor(Math.random() * headLen)]);

        while (chosenSpawns.length < monsterCount) {
            // Kandidat harus cukup terpisah dari semua spawn yang sudah dipilih
            const cands = candidatePool.filter(c => !chosenSpawns.includes(c) && minDistToChosen(c) >= targetSep);
            if (cands.length === 0) break; // longgarkan threshold & ulangi dari awal

            // Greedy: ambil sel yang paling menjauh dari spawn terpilih lain
            // (jitter acak kecil sebagai tie-breaker supaya penempatan bervariasi)
            let bestCell = null, bestScore = -Infinity;
            for (const c of cands) {
                const score = minDistToChosen(c) + Math.random() * 0.5;
                if (score > bestScore) { bestScore = score; bestCell = c; }
            }
            chosenSpawns.push(bestCell);
        }

        if (chosenSpawns.length >= monsterCount) break;
    }

    // Fallback kasus ekstrem: isi sisa slot dari pool apa adanya
    for (const c of candidatePool) {
        if (chosenSpawns.length >= monsterCount) break;
        if (!chosenSpawns.includes(c)) chosenSpawns.push(c);
    }

    for (let i = 0; i < monsterCount; i++) {
        const chosen = chosenSpawns[i];

        const mMesh = createVoidMonsterMesh(monsterColors[i % monsterColors.length], i);
        mMesh.position.set(chosen.x * CELL_SIZE, 1.2, chosen.z * CELL_SIZE);

        let monsterObj = {
            mesh: mMesh,
            spawnPos: mMesh.position.clone(),
            path: [],
            pathIndex: 1,
            assignedGate: null,
            visual: mMesh.userData.voidVisual || null,
            dormant: true // Monster "tidur" di spawn sampai player mendekat (lihat updateMonsterDormancy)
        };
        scene.add(mMesh);
        monsters.push(monsterObj);
    }

    // Spawn Crystalline Pellets in all empty corridor cells
    TOTAL_PELLETS = emptyCells.length;
    let specialCount = Math.min(6, TOTAL_PELLETS);
    let specialTypesPool = ['stun', 'stun', 'stun', 'detector', 'detector', 'detector'].slice(0, specialCount);
    let specialIndices = new Set();
    while (specialIndices.size < specialCount) {
        specialIndices.add(Math.floor(Math.random() * TOTAL_PELLETS));
    }
    let specialArr = Array.from(specialIndices);
    let typeMap = {};
    for (let i = 0; i < specialArr.length; i++) {
        typeMap[specialArr[i]] = specialTypesPool[i];
    }

    const crystalMats = getCrystalMaterials();

    for (let i = 0; i < TOTAL_PELLETS; i++) {
        let cell = emptyCells[i];
        let type = typeMap[i] || 'normal';

        const pGroup = new THREE.Group();
        let crystalMesh = null;
        let innerCore = null;
        let ring1 = null;
        let ring2 = null;
        let pLight = null;

        if (type === 'normal') {
            // Golden Sunstone Crystal: Slender double-pointed diamond crystal with inner glowing nucleus
            const shardGeo = new THREE.OctahedronGeometry(0.24, 0);
            shardGeo.scale(0.72, 1.55, 0.72);
            crystalMesh = new THREE.Mesh(shardGeo, crystalMats.gold.main);
            pGroup.add(crystalMesh);

            if (GRAPHICS_CONFIG.normalCrystalCore) {
                const coreGeo = new THREE.OctahedronGeometry(0.085, 0);
                innerCore = new THREE.Mesh(coreGeo, crystalMats.gold.core);
                pGroup.add(innerCore);
            }
        } else if (type === 'stun') {
            // Frozen Sapphire Cryo Prism: 20-faceted Icosahedron with orbiting frosted ring
            const icoGeo = new THREE.IcosahedronGeometry(0.33, 0);
            crystalMesh = new THREE.Mesh(icoGeo, crystalMats.stun.main);
            pGroup.add(crystalMesh);

            const ringGeo = new THREE.TorusGeometry(0.48, 0.024, 8, 28);
            ring1 = new THREE.Mesh(ringGeo, crystalMats.stun.ring);
            ring1.rotation.x = Math.PI / 3.5;
            pGroup.add(ring1);

            const coreGeo = new THREE.OctahedronGeometry(0.13, 0);
            innerCore = new THREE.Mesh(coreGeo, crystalMats.stun.core);
            pGroup.add(innerCore);

            if (GRAPHICS_CONFIG.powerCrystalLights) {
                pLight = new THREE.PointLight(0x00d2d3, 0.85, 4.5, 1.5);
                pGroup.add(pLight);
            }
        } else if (type === 'detector') {
            // Arcane Void Amethyst Crystal: 12-faceted Dodecahedron with dual gyroscopic rings
            const dodecaGeo = new THREE.DodecahedronGeometry(0.33, 0);
            crystalMesh = new THREE.Mesh(dodecaGeo, crystalMats.detector.main);
            pGroup.add(crystalMesh);

            const ringGeo1 = new THREE.TorusGeometry(0.48, 0.022, 8, 28);
            ring1 = new THREE.Mesh(ringGeo1, crystalMats.detector.ring);
            ring1.rotation.x = Math.PI / 3;
            pGroup.add(ring1);

            const ringGeo2 = new THREE.TorusGeometry(0.42, 0.022, 8, 28);
            ring2 = new THREE.Mesh(ringGeo2, crystalMats.detector.ring);
            ring2.rotation.y = Math.PI / 3;
            pGroup.add(ring2);

            const coreGeo = new THREE.IcosahedronGeometry(0.13, 0);
            innerCore = new THREE.Mesh(coreGeo, crystalMats.detector.core);
            pGroup.add(innerCore);

            if (GRAPHICS_CONFIG.powerCrystalLights) {
                pLight = new THREE.PointLight(0xa55eea, 0.85, 4.5, 1.5);
                pGroup.add(pLight);
            }
        }

        pGroup.position.set(cell.x * CELL_SIZE, 0.75, cell.z * CELL_SIZE);
        scene.add(pGroup);

        pellets.push({
            mesh: pGroup,
            crystalMesh: crystalMesh,
            innerCore: innerCore,
            ring1: ring1,
            ring2: ring2,
            light: pLight,
            type: type,
            baseY: 0.75,
            rotSpeed: 0.026 + (i % 5) * 0.003,
            bobPhase: (i * 0.73) % (Math.PI * 2)
        });
    }


    // Update UI Elements
    document.getElementById('lbl-level').innerText = `${lvl} (${theme.name})`;
    document.getElementById('lbl-pellets').innerText = pelletsEaten;
    document.getElementById('lbl-total-pellets').innerText = TOTAL_PELLETS;
    document.getElementById('lbl-remaining').innerText = TOTAL_PELLETS - pelletsEaten;
    updateLivesUI();
}

function updateLivesUI() {
    let heartsStr = '❤'.repeat(Math.max(0, lives));
    document.getElementById('lbl-lives').innerText = heartsStr || 'DEAD';
}

// ==========================================
// PLAYER CONTROLS & LISTENERS
// ==========================================
const onKeyDown = (e) => {
    // Debug Mode Toggle (Shift+F12) — hanya saat permainan aktif
    if (e.code === 'F12' && e.shiftKey && gameActive && !isDying) {
        e.preventDefault();
        toggleDebugPanel();
        return;
    }
    // Saat dialog konfirmasi pause terbuka ("Yakin ingin ...?"), tangkap tombol:
    // Enter = YA, Escape / Backquote = BATAL. Tombol lain (P, Space, dsb.)
    // diblokir agar game tidak ikut resume / tidak menyisakan input gerakan
    // selagi dialog tampil di atas menu pause.
    if (_pauseConfirmOpen) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            confirmPauseAction();
        } else if (e.code === 'Escape' || e.code === 'Backquote') {
            e.preventDefault();
            closePauseConfirm();
        }
        return;
    }



    // Tombol Pause Toggle (P)
    if (e.code === 'KeyP') {
        if (gameActive && !isDying) {
            if (isPaused || !controls.isLocked) {
                resumeGame();
            } else {
                pauseGame();
            }
        }
        return;
    }

    // Tombol Pause Toggle (`) — jeda/sambung serta membuka/menutup kursor.
    // Menggantikan fungsi lama pada tombol ESC.
    if (e.code === 'Backquote') {
        if (gameActive && !isDying) {
            if (isPaused || !controls.isLocked) {
                resumeGame();
            } else {
                pauseGame();
            }
        }
        return;
    }

    // ESC kini hanya menutup panel debugging (jika sedang terbuka).
    if (e.code === 'Escape') {
        if (debugPanelOpen) {
            setDebugPanelOpen(false);
            return;
        }
        return;
    }

    // Resume shortcut when paused (Space / Enter / Backquote)
    if (isPaused && gameActive && !isDying && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Backquote')) {
        resumeGame();
        return;
    }

    // Jangan terima input gerak jika game tidak aktif atau sedang pause atau sedang mati
    if (!gameActive || isPaused || isDying || !controls.isLocked) return;

    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = true; break;
        case 'KeyS': case 'ArrowDown': moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': moveRight = true; break;
    }
};

const onKeyUp = (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': moveForward = false; break;
        case 'KeyS': case 'ArrowDown': moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': moveRight = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// ==========================================
// MOBILE / TOUCH CONTROLS — Joystick + Drag Look + Pause
// ==========================================
// Mode kontrol dipilih dari toggle "PC / Mobile" di main menu
// (disimpan menu.js ke localStorage, lalu dipanggil setControlMode).
//
// Saat mode MOBILE aktif:
//   • Pointer lock TIDAK dipakai (tidak tersedia di layar sentuh) —
//     lihat lockPointer() yang menggantikan semua controls.lock().
//   • Joystick kanan-bawah menggerakkan pemain secara analog.
//   • Drag di area layar lainnya (#mobile-look-zone) memutar kamera.
//   • Tombol ⏸ kanan-atas untuk pause (pengganti tombol P keyboard).
let isMobileControl = (typeof getDefaultControlMode === 'function' && getDefaultControlMode() === 'mobile');
let joyX = 0, joyY = 0;             // vektor joystick analog (-1..1); Y positif = ke bawah (mundur)
const JOY_DEADZONE = 0.14;          // area mati kecil agar tidak "creep" saat jari dilepas
const TOUCH_LOOK_SENS = 0.0042;     // radian per piksel drag kamera
const MAX_LOOK_PITCH = Math.PI / 2 - 0.01; // batas pitch ala PointerLockControls
const mobileInputResetters = [];

// Dipanggil menu.js saat toggle diganti / settings dimuat.
function setControlMode(mode) {
    isMobileControl = (mode === 'mobile');
    // Class ini yang memunculkan joystick + look zone via CSS
    // (body.in-game.mobile-mode). in-game dipasang startGame().
    document.body.classList.toggle('mobile-mode', isMobileControl);
    if (!isMobileControl) resetMobileInput();
}

// Bersihkan semua input mobile & movement flags (dipanggil saat pause,
// resume, game over, dan ganti mode) supaya tidak ada gerakan "sisa".
function resetMobileInput() {
    joyX = 0;
    joyY = 0;
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    const knob = document.getElementById('joystick-knob');
    if (knob) {
        knob.style.transform = '';
        knob.classList.remove('dragging');
    }
    mobileInputResetters.forEach(fn => {
        try { fn(); } catch (e) { /* ignore */ }
    });
}

// Pengganti controls.lock(): di mode mobile pointer lock tidak
// tersedia/diperlukan, jadi cukup diabaikan.
function lockPointer() {
    if (isMobileControl) return;
    try { controls.lock(); } catch (e) { /* pointer lock could be rejected */ }
}

// Putar kamera untuk drag-look mobile, memakai konvensi yang sama dengan
// PointerLockControls (Euler YXZ; drag kanan = putar kanan, drag atas =
// lihat atas). Roll (Z) tidak disentuh — di-set ulang tiap frame oleh
// setCameraRollZ() pada head-bob.
function rotateCameraByLook(dxRad, dyRad) {
    _cameraEulerTmp.setFromQuaternion(camera.quaternion);
    _cameraEulerTmp.y -= dxRad;
    _cameraEulerTmp.x -= dyRad;
    _cameraEulerTmp.x = Math.max(-MAX_LOOK_PITCH, Math.min(MAX_LOOK_PITCH, _cameraEulerTmp.x));
    camera.quaternion.setFromEuler(_cameraEulerTmp);
}

// Faktor sensitivitas dari settings (slider Mouse Sensitivity di menu).
function touchLookSensitivity() {
    return (typeof _mouseSensitivity === 'number' && _mouseSensitivity > 0) ? _mouseSensitivity : 1.0;
}

// ---- Joystick virtual (kanan-bawah) ----
(function initJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    if (!zone || !base || !knob) return;

    let activePointerId = null;
    let centerX = 0, centerY = 0, maxRadius = 44;

    // Geometri dibaca ulang setiap sentuhan dimulai (tahan terhadap resize).
    function refreshGeometry() {
        const baseRect = base.getBoundingClientRect();
        const knobRect = knob.getBoundingClientRect();
        centerX = baseRect.left + baseRect.width / 2;
        centerY = baseRect.top + baseRect.height / 2;
        maxRadius = Math.max(10, (baseRect.width - knobRect.width) / 2);
    }

    function applyVector(dx, dy) {
        const dist = Math.hypot(dx, dy);
        const clamped = Math.min(dist, maxRadius);
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : 0;
        const kx = nx * clamped;
        const ky = ny * clamped;
        knob.style.transform = 'translate(' + kx + 'px, ' + ky + 'px)';
        joyX = clamped > 0 ? kx / maxRadius : 0;  // positif = kanan
        joyY = clamped > 0 ? ky / maxRadius : 0;  // positif = bawah (mundur)
    }

    zone.addEventListener('pointerdown', (e) => {
        if (!isMobileControl || activePointerId !== null) return;
        activePointerId = e.pointerId;
        try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
        refreshGeometry();
        knob.classList.add('dragging');
        applyVector(e.clientX - centerX, e.clientY - centerY);
    });

    zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        applyVector(e.clientX - centerX, e.clientY - centerY);
    });

    const release = (e) => {
        if (e.pointerId !== activePointerId) return;
        activePointerId = null;
        knob.classList.remove('dragging');
        knob.style.transform = '';
        joyX = 0;
        joyY = 0;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('lostpointercapture', release);
    mobileInputResetters.push(() => {
        activePointerId = null;
        knob.classList.remove('dragging');
        knob.style.transform = '';
    });
})();

// ---- Drag-look kamera (area selain joystick & UI) ----
(function initLookZone() {
    const zone = document.getElementById('mobile-look-zone');
    if (!zone) return;

    let lookPointerId = null;
    let lastX = 0, lastY = 0;

    zone.addEventListener('pointerdown', (e) => {
        if (!isMobileControl || !gameActive || isPaused || isDying) return;
        if (lookPointerId !== null) return;
        lookPointerId = e.pointerId;
        lastX = e.clientX;
        lastY = e.clientY;
        try { zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
    });

    zone.addEventListener('pointermove', (e) => {
        if (e.pointerId !== lookPointerId) return;
        e.preventDefault();
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        const sens = TOUCH_LOOK_SENS * touchLookSensitivity();
        rotateCameraByLook(dx * sens, dy * sens);
    });

    const release = (e) => {
        if (e.pointerId === lookPointerId) lookPointerId = null;
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('lostpointercapture', release);
    mobileInputResetters.push(() => { lookPointerId = null; });
})();

// ---- Tombol pause mobile (kanan-atas) ----
(function initMobilePause() {
    const btn = document.getElementById('mobile-pause-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (!gameActive || isPaused || isDying) return;
        resetMobileInput();
        pauseGame();
    });
})();

// Desktop: pause saat pointer-lock/tab kehilangan fokus. Pada mobile,
// event blur dapat muncul hanya karena UI browser; visibilitychange di bawah
// lebih akurat untuk app-switch/lock-screen.
window.addEventListener('blur', () => {
    if (!isMobileControl && gameActive && !isPaused) {
        pauseGame();
    }
});

// ==========================================
// GAMEPLAY LOGIC & NOTIFICATIONS
// ==========================================
function triggerFlashbang() {
    const flash = document.getElementById('flashbang');
    flash.style.opacity = '0.85';
    setTimeout(() => { flash.style.opacity = '0'; }, 350);
}

let notifTimer = null;
function showNotification(text, type = '') {
    const el = document.getElementById('notification');
    if (!el) return;
    el.innerText = text;
    el.className = '';
    if (type) el.classList.add(type);
    void el.offsetWidth; // Reflow for animation restart
    el.classList.add('active');
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => {
        el.classList.remove('active');
    }, 2600);
}

// ==========================================
// CREATOR PROXIMITY DIALOG
// ==========================================
function showCreatorDialog(text, isHint = false, duration = 2200) {
    const dialog = document.getElementById('creator-dialog');
    const textEl = document.getElementById('creator-dialog-text');
    if (!dialog || !textEl) return;

    // Bersihkan timer mengetik dari dialog sebelumnya (bila masih berjalan)
    if (creatorTypewriterTimer) {
        clearInterval(creatorTypewriterTimer);
        creatorTypewriterTimer = null;
    }

    dialog.classList.add('visible');
    creatorDialogVisible = true;
    creatorHintDialogActive = isHint;

    // Tampilkan teks secara bertahap (efek mengetik). Mengetik diselesaikan
    // ± pada 70% dari durasi dialog; sisanya teks utuh dibiarkan terbaca.
    textEl.innerText = '';
    const chars = Array.from(text);
    const stepMs = duration > 0 ? Math.max(20, Math.floor((duration * 0.7) / Math.max(1, chars.length))) : 20;
    let ci = 0;
    creatorTypewriterTimer = setInterval(() => {
        ci++;
        textEl.innerText = chars.slice(0, ci).join('');
        if (ci >= chars.length) {
            clearInterval(creatorTypewriterTimer);
            creatorTypewriterTimer = null;
        }
    }, stepMs);

    // Auto-hide setelah `duration` ms
    if (creatorDialogHideTimer) clearTimeout(creatorDialogHideTimer);
    creatorDialogHideTimer = setTimeout(() => {
        dialog.classList.remove('visible');
        creatorDialogVisible = false;
        creatorHintDialogActive = false;
    }, duration);
}

function hideCreatorDialog() {
    const dialog = document.getElementById('creator-dialog');
    if (!dialog) return;
    if (creatorDialogHideTimer) clearTimeout(creatorDialogHideTimer);
    if (creatorTypewriterTimer) {
        clearInterval(creatorTypewriterTimer);
        creatorTypewriterTimer = null;
    }
    dialog.classList.remove('visible');
    creatorDialogVisible = false;
    creatorHintDialogActive = false;
}

// Menghitung apakah hint lokasi pellet sedang aktif (< 30% pellet tersisa,
// belum masuk fase kembali ke safe zone, dan hint diaktifkan).
function computeHintActive() {
    return DEBUG.hints &&
        !mustReturnToSafeZone &&
        TOTAL_PELLETS > 0 &&
        pellets.length > 0 &&
        (pellets.length / TOTAL_PELLETS) < 0.3;
}

// Memperbarui status hint lokasi pellet dan memunculkan dialog The Creator
// tepat saat hint pertama kali aktif (sekali per level). Dialog ini tidak
// boleh ditimpa oleh dialog dekat-monster (creatorHintDialogActive mengunci).
function updateHintState() {
    hintActive = computeHintActive();

    // Transisi hint: NONAKTIF → AKTIF — tampilkan dialog The Creator sekali per level.
    if (hintActive && !creatorHintDialogShown) {
        creatorHintDialogShown = true;
        showCreatorDialog(
            "Great! You've reduced the void energy, now I can help you locate the remaining crystal through your minimap",
            true,
            12000
        );
        // Jeda ekstra agar dialog monster tidak langsung muncul setelahnya.
        creatorDialogCooldown = 4.5;
    }
}

function checkMonsterProximityDialog(delta) {
    // Dialog hint lokasi pellet sedang tampil → jangan timpa dengan dialog dekat-monster.
    if (creatorHintDialogActive) return;

    if (!gameActive || isPaused || isDying) {
        if (creatorDialogVisible) hideCreatorDialog();
        return;
    }

    // Decrease cooldown
    if (creatorDialogCooldown > 0) {
        creatorDialogCooldown -= delta;
        return;
    }

    // Check if any monster is within 1 unit (meter) of player
    let anyClose = false;
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        const dist = Math.hypot(
            camera.position.x - m.mesh.position.x,
            camera.position.z - m.mesh.position.z
        );
        if (dist < CELL_SIZE * 1.5) { // ~1 cell-meter: triggers before monster catches player (at 1.1 units)
            anyClose = true;
            break;
        }
    }

    if (anyClose) {
        // Pick a random line, avoid repeating the last one
        let idx;
        do {
            idx = Math.floor(Math.random() * CREATOR_DIALOG_LINES.length);
        } while (idx === lastCreatorDialogLine && CREATOR_DIALOG_LINES.length > 1);
        lastCreatorDialogLine = idx;

        showCreatorDialog(CREATOR_DIALOG_LINES[idx]);
        creatorDialogCooldown = 2.8 + Math.random() * 1.2; // 2.8–4.0s cooldown
    }
}

function resetMonsterToSpawn(m) {
    m.mesh.position.copy(m.spawnPos);
    m.path = [];
    m.pathIndex = 1;
    m.assignedGate = null;
    packHuntTimer = 0;
    // Monster yang DI-TELEPORT kembali ke spawn point langsung aktif bergerak —
    // aturan "menunggu player dekat" hanya berlaku saat awal level.
    m.dormant = false;
}

// Bangunkan monster dormant ketika player benar-benar berada di dekatnya.
// Selama masih dormant, monster menetap di spawn point tanpa bergerak sama sekali.
function updateMonsterDormancy() {
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!m.dormant) continue;

        const dx = camera.position.x - m.mesh.position.x;
        const dz = camera.position.z - m.mesh.position.z;
        if (dx * dx + dz * dz <= MONSTER_WAKE_RADIUS * MONSTER_WAKE_RADIUS) {
            m.dormant = false;
            m.path = [];
            m.pathIndex = 1;
            m.assignedGate = null;
            if (!_monsterWakeNotified) {
                _monsterWakeNotified = true;
                showNotification("Something has awakened...", "");
                playSound('powerup');
            }
        }
    }
}

// ==========================================
// FASE KABUR: TELEPORT KE TENGAH PETA & PENJAGA SAFE ZONE
// ==========================================
// Saat semua kristal terkumpul, pemain diteleport ke tengah peta, sementara
// monster diteleport ke posisi penjaga di sekitar pintu keluar Safe Zone dan
// kembali dormant — mereka baru bergerak saat pemain mendekati radius bangun.
function deploySafeZoneGuards() {
    for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        const guard = SAFE_ZONE_GUARD_CELLS[i % SAFE_ZONE_GUARD_CELLS.length];
        m.mesh.position.set(guard.x * CELL_SIZE, m.spawnPos.y, guard.z * CELL_SIZE);
        m.path = [];
        m.pathIndex = 1;
        m.assignedGate = null;
        // Berjaga diam di posisi penjaga sampai pemain mendekat (dormant).
        m.dormant = true;
    }
    packHuntTimer = 0;
    // Notifikasi "monster bangun" boleh muncul lagi untuk fase penjaga ini.
    _monsterWakeNotified = false;
}

// Pindahkan pemain ke tengah peta tanpa mengubah arah hadap (yaw/pitch),
// sekaligus membuang sisa head-bob/tilt agar kamera tidak miring.
function teleportPlayerToMapCenter() {
    playerX = MAP_CENTER_X;
    playerZ = MAP_CENTER_Z;
    camera.position.set(playerX, PLAYER_BASE_Y, playerZ);
    resetCameraRoll();
    bobTimer = 0;
    bobIntensity = 0;
    idleTimer = 0;
}

// Awal fase kabur: dipanggil tepat saat kristal terakhir diambil.
// Pemain diteleport ke tengah peta & monster menjadi penjaga Safe Zone.
function beginEscapePhase() {
    mustReturnToSafeZone = true;
    playSound('powerup');
    showNotification('All Clear! Sneak back to the Safe Zone to escape!');

    // The Creator menyapa saat semua kristal sudah terkumpul (sisa kristal = 0)
    // dan fase kabur dimulai. Dipanggil sebagai dialog hint agar tidak ditimpa
    // oleh dialog dekat-monster, dan berlangsung cukup lama agar terbaca penuh.
    showCreatorDialog(
        "You've collected all the crystals. Go back to the Safe Zone, but be careful. The Void is already guarding the way. Try to lure it away first, then sneak back to the Safe Zone",
        true,
        10000
    );
    // Jeda ekstra agar dialog monster tidak langsung muncul setelahnya.
    creatorDialogCooldown = 5.0;

    deploySafeZoneGuards();
    teleportPlayerToMapCenter();
}

// Masa aman singkat setelah pemain respawn dari kematian:
// lokasi respawn tergantung fase (Safe Zone saat normal, tengah peta saat
// fase kabur), dan monster dibekukan sesaat supaya pemain sempat kabur.
function startRespawnGrace() {
    isRespawnGrace = true;
    respawnGraceTimeRemaining = RESPAWN_GRACE_DURATION;
}

function clearRespawnGrace() {
    isRespawnGrace = false;
    respawnGraceTimeRemaining = 0;
}

// ==========================================
// VOID MONSTER — eerie cosmic abyss entity
// ==========================================
function createVoidMonsterMesh(accentHex, index) {
    const R = CELL_SIZE / 3.4;
    const group = new THREE.Group();

    const accent = new THREE.Color(accentHex);
    const voidBlack = new THREE.Color(0x04040a);

    // --- Accent-tinted emissive materials ---
    // Medium and below use Lambert here; this preserves emissive character while
    // avoiding the heavier Standard/PBR shader on weak mobile GPUs.
    const monsterLambert = GRAPHICS_CONFIG.monsterMaterialMode === 'lambert';
    const coreMat = monsterLambert
        ? new THREE.MeshLambertMaterial({ color: voidBlack, emissive: accent, emissiveIntensity: 0.18 })
        : new THREE.MeshStandardMaterial({ color: voidBlack, emissive: accent, emissiveIntensity: 0.18, roughness: 0.12, metalness: 0.6 });
    const shellMat = monsterLambert
        ? new THREE.MeshLambertMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 0.5, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 0.5, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide });
    const vortexMat = monsterLambert
        ? new THREE.MeshLambertMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 0.7, transparent: true, opacity: 0.5, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 0.7, transparent: true, opacity: 0.5, roughness: 0.3, metalness: 0.1, depthWrite: false });
    const ringMat = monsterLambert
        ? new THREE.MeshLambertMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 1.25, transparent: true, opacity: 0.55 })
        : new THREE.MeshStandardMaterial({ color: 0x000000, emissive: accent, emissiveIntensity: 1.25, transparent: true, opacity: 0.55, roughness: 0.2 });
    const particleMat = new THREE.MeshBasicMaterial({ color: accent });
    const tendrilMat = monsterLambert
        ? new THREE.MeshLambertMaterial({ color: voidBlack, emissive: accent, emissiveIntensity: 0.8, transparent: true, opacity: 0.65 })
        : new THREE.MeshStandardMaterial({ color: voidBlack, emissive: accent, emissiveIntensity: 0.8, transparent: true, opacity: 0.65, roughness: 0.4 });

    // --- Void core (near-black heart) ---
    const core = new THREE.Mesh(new THREE.SphereGeometry(R * 0.5, GRAPHICS_CONFIG.monsterCoreWidth, GRAPHICS_CONFIG.monsterCoreHeight), coreMat);
    core.castShadow = true;
    group.add(core);

    // --- Imploding vortex (inner chaotic geometry) ---
    const vortex = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.9, 0), vortexMat);
    group.add(vortex);

    // --- Cosmic shell (translucent veil with shimmering edge) ---
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0, GRAPHICS_CONFIG.monsterShellWidth, GRAPHICS_CONFIG.monsterShellHeight), shellMat);
    shell.scale.set(1, 0.9, 1);
    group.add(shell);

    // --- Gyroscopic void rings ---
    const rings = [];
    const ringSpecs = [
        [R * 1.18, R * 0.05, Math.PI / 2.6 + index * 0.3, 0, 0],
        [R * 1.32, R * 0.04, Math.PI / 4.2, 0, 0],
        [R * 0.95, R * 0.03, 0, Math.PI / 3, 0]
    ];
    for (let ri = 0; ri < GRAPHICS_CONFIG.monsterRingCount; ri++) {
        const spec = ringSpecs[ri];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(
            spec[0], spec[1], GRAPHICS_CONFIG.monsterRingRadial, GRAPHICS_CONFIG.monsterRingTubular
        ), ringMat);
        ring.rotation.set(spec[2], spec[3], spec[4]);
        group.add(ring);
        rings.push(ring);
    }

    // --- Orbiting void-fragment particles (accretion disk) ---
    const orbitals = [];
    const orbCount = GRAPHICS_CONFIG.monsterOrbCount;
    for (let o = 0; o < orbCount; o++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(R * (0.05 + (o % 3) * 0.012), GRAPHICS_CONFIG.monsterOrbWidth, GRAPHICS_CONFIG.monsterOrbHeight), particleMat);
        orb.castShadow = true;
        group.add(orb);
        orbitals.push({
            g: orb,
            spinDir: (o % 2 === 0) ? 1 : -1,
            radius: R * (1.25 + (o % 3) * 0.16),
            elev: (o / orbCount) * Math.PI * 2,
            speed: 0.6 + (o % 4) * 0.15,
            phase: (o * 0.83) % (Math.PI * 2)
        });
    }

    // --- Void tendrils (radiating out of the core) ---
    const tendrils = [];
    const tCount = GRAPHICS_CONFIG.monsterTendrilCount;
    const tendGeo = new THREE.ConeGeometry(R * 0.05, R * 0.95, 5);
    tendGeo.translate(0, R * 0.42, 0); // stalk rises out of the core
    for (let k = 0; k < tCount; k++) {
        const tGroup = new THREE.Group();
        tGroup.add(new THREE.Mesh(tendGeo, tendrilMat));
        tGroup.rotation.y = (k / tCount) * Math.PI * 2 + index * 0.4;
        tGroup.rotation.x = 0.35 + (k % 3) * 0.15;
        group.add(tGroup);
        tendrils.push({
            g: tGroup,
            spd: 0.9 + (k % 4) * 0.22,
            baseX: 0.35 + (k % 3) * 0.15,
            baseZ: 0
        });
    }

    // --- Aura light ---
    const light = GRAPHICS_CONFIG.monsterLights ? new THREE.PointLight(accentHex, 1.15, 8) : null;
    if (light) group.add(light);
    const innerLight = GRAPHICS_CONFIG.monsterLights ? new THREE.PointLight(0xffffff, 0.35, 3.5) : null;
    if (innerLight) group.add(innerLight);

    // Store animation references & expose handled meshes
    group.userData.voidVisual = {
        group: group,
        core: core,
        shell: shell,
        vortex: vortex,
        rings: rings,
        orbitals: orbitals,
        tendrils: tendrils,
        light: light,
        innerLight: innerLight,
        seed: index * 1.7,
        spinDir: (index % 2 === 0) ? 1 : -1
    };

    return group;
}

// Animate every void monster's parts each frame
function updateMonsterVisuals(timeMs) {
    const s = timeMs * 0.001;
    for (let i = 0; i < monsters.length; i++) {
        const v = monsters[i].visual;
        if (!v) continue;

        const pulse = 1 + Math.sin(s * 2.1 + v.seed) * 0.02;
        v.shell.scale.setScalar(pulse);

        // Imploding vortex spin
        v.vortex.rotation.y += 0.014 * v.spinDir;
        v.vortex.rotation.x += 0.005 * v.spinDir;
        v.vortex.rotation.z += 0.004;

        // Core counter-spin
        v.core.rotation.y += 0.006 * v.spinDir;
        v.core.rotation.x += 0.004;

        // Shell shimmer
        v.shell.material.opacity = 0.15 + Math.sin(s * 3.0 + v.seed) * 0.05;

        // Gyroscopic ring rotation + breathing
        for (let r = 0; r < v.rings.length; r++) {
            const rg = v.rings[r];
            rg.rotation.y += 0.02;
            const ringPulse = 1 + Math.sin(s * 2.6 + v.seed + r) * 0.03;
            rg.scale.set(ringPulse, ringPulse, ringPulse);
        }

        // Orbiting void-fragment swarm
        for (let k = 0; k < v.orbitals.length; k++) {
            const o = v.orbitals[k];
            const ang = s * o.speed * o.spinDir + o.elev + v.seed;
            o.g.position.set(
                Math.cos(ang) * o.radius,
                Math.sin(ang * 0.7 + o.phase) * (o.radius * 0.35),
                Math.sin(ang) * o.radius
            );
            o.g.scale.setScalar(1 + Math.sin(s * 3.4 + o.phase) * 0.35);
        }

        // Tendril swaying
        for (let k = 0; k < v.tendrils.length; k++) {
            const tn = v.tendrils[k];
            tn.g.rotation.x = tn.baseX + Math.sin(s * tn.spd + v.seed + k * 1.7) * 0.4;
            tn.g.rotation.z = tn.baseZ + Math.cos(s * tn.spd * 0.8 + v.seed + k * 2.1) * 0.4;
        }
    }
}

function activateStun() {
    isStunned = true;
    stunTimeRemaining += STUN_DURATION;
    const statusStun = document.getElementById('status-stun');
    if (statusStun) statusStun.style.display = 'flex';
    // Blue screen tint
    const tintStun = document.getElementById('tint-stun');
    if (tintStun) tintStun.classList.add('active');
    showNotification("Enemies Stunned", "type-stun");
    updatePowerupHUD();
    playStunPowerupSfx();
}

function activateDetector() {
    isDetectorActive = true;
    detectorTimeRemaining += DETECTOR_DURATION;
    const statusDetector = document.getElementById('status-detector');
    if (statusDetector) statusDetector.style.display = 'flex';
    // Purple screen tint
    const tintRadar = document.getElementById('tint-radar');
    if (tintRadar) tintRadar.classList.add('active');
    showNotification("Enemies Revealed", "type-radar");
    updatePowerupHUD();
    playRevealPowerupSfx();
}

// ==========================================
// DEBUG MODE — HAPUS EFEK POWERUP SECARA INSTAN
// ==========================================
function removeStunEffect() {
    isStunned = false;
    stunTimeRemaining = 0;
    const statusStun = document.getElementById('status-stun');
    if (statusStun) statusStun.style.display = 'none';
    const tintStun = document.getElementById('tint-stun');
    if (tintStun) tintStun.classList.remove('active');
    showNotification("Stun effect removed", "type-stun");
    updatePowerupHUD();
}

function removeDetectorEffect() {
    isDetectorActive = false;
    detectorTimeRemaining = 0;
    const statusDetector = document.getElementById('status-detector');
    if (statusDetector) statusDetector.style.display = 'none';
    const tintRadar = document.getElementById('tint-radar');
    if (tintRadar) tintRadar.classList.remove('active');
    showNotification("Radar effect removed", "type-radar");
    updatePowerupHUD();
}

// ==========================================
// DEBUG PANEL (Tekan TAB saat bermain)
// ==========================================
let debugPanelOpen = false;

function setDebugPanelOpen(open) {
    debugPanelOpen = open;
    const panel = document.getElementById('debug-panel');
    if (panel) panel.classList.toggle('open', open);

    if (open) {
        // Jeda permainan tanpa overlay pause standar, dan lepaskan pointer agar panel bisa diklik.
        const overlay = document.getElementById('overlay-screen');
        if (overlay) overlay.style.display = 'none';
        if (gameActive && !isDying && !isPaused) {
            isPaused = true;
            moveForward = false; moveBackward = false; moveLeft = false; moveRight = false;
            if (controls.isLocked) controls.unlock();
        }
    } else {
        // Tutup panel dan lanjutkan permainan.
        if (gameActive && !isDying && isPaused) {
            isPaused = false;
            prevTime = performance.now();
            document.getElementById('overlay-screen').style.display = 'none';
            if (!controls.isLocked) lockPointer();
        }
    }
}

function toggleDebugPanel() {
    if (!gameActive || isDying) return;
    setDebugPanelOpen(!debugPanelOpen);
}

function initDebugPanel() {
    const fullMap = document.getElementById('setting-debug-fullmap');
    const hints = document.getElementById('setting-debug-hints');
    const monsters = document.getElementById('setting-debug-monster');

    // Sinkronkan nilai awal dari objek DEBUG ke UI.
    if (fullMap) fullMap.checked = !!DEBUG.fullMap;
    if (hints) hints.checked = !!DEBUG.hints;
    if (monsters) monsters.checked = !!DEBUG.monsters;

    // Ikuti perubahan UI.
    if (fullMap) fullMap.addEventListener('change', (e) => { DEBUG.fullMap = e.target.checked; });
    if (hints) hints.addEventListener('change', (e) => { DEBUG.hints = e.target.checked; });
    if (monsters) monsters.addEventListener('change', (e) => { DEBUG.monsters = e.target.checked; });

    // Powerup: pasang efek secara instan.
    const btnStun = document.getElementById('debug-powerup-stun');
    if (btnStun) btnStun.addEventListener('click', activateStun);
    const btnRadar = document.getElementById('debug-powerup-radar');
    if (btnRadar) btnRadar.addEventListener('click', activateDetector);

    // Powerup: hapus efek secara instan.
    const btnClearStun = document.getElementById('debug-powerup-clear-stun');
    if (btnClearStun) btnClearStun.addEventListener('click', removeStunEffect);
    const btnClearRadar = document.getElementById('debug-powerup-clear-radar');
    if (btnClearRadar) btnClearRadar.addEventListener('click', removeDetectorEffect);

    // Tombol tutup panel.
    const btnClose = document.getElementById('debug-panel-close');
    if (btnClose) btnClose.addEventListener('click', () => setDebugPanelOpen(false));

    // Ambil kristal secara instan: 100% atau 70%.
    const btnAll = document.getElementById('debug-crystal-all');
    if (btnAll) btnAll.addEventListener('click', () => debugCollectCrystals(1));
    const btn70 = document.getElementById('debug-crystal-70');
    if (btn70) btn70.addEventListener('click', () => debugCollectCrystals(0.7));

    // Instant Death: matikan pemain seketika, seolah-olah tertangkap monster.
    // Panel debug ditutup DULU supaya pause dilepas (setDebugPanelOpen(false)
    // hanya melepas pause jika !isDying); setelah itu death sequence berjalan
    // normal — respawn di Safe Zone, atau Game Over bila nyawa habis.
    const btnDeath = document.getElementById('debug-instant-death');
    if (btnDeath) btnDeath.addEventListener('click', () => {
        setDebugPanelOpen(false);
        triggerDeathSequence();
    });

    // Lose 5 Lives: potong nyawa langsung habis (0) lalu paksa death sequence.
    // lives di-clamp ke 0 sehingga game berakhir "IT'S OVER" alias Game Over.
    const btnLoseLives = document.getElementById('debug-lose-5-lives');
    if (btnLoseLives) btnLoseLives.addEventListener('click', () => {
        setDebugPanelOpen(false);
        lives = Math.max(0, lives - 5);
        updateLivesUI();
        triggerDeathSequence();
    });
}

// Ambil kristal secara instan dalam jumlah tertentu (fraction 0..1).
// fraction = 1 -> seluruh kristal; fraction = 0.7 -> 70% dari sisa kristal.
function debugCollectCrystals(fraction) {
    if (!gameActive || pellets.length === 0) {
        if (typeof playSound === 'function') playSound('pellet');
        return;
    }

    const toCollect = Math.max(1, Math.floor((pellets.length) * fraction));

    for (let n = 0; n < toCollect && pellets.length > 0; n++) {
        const idx = Math.floor(Math.random() * pellets.length);
        const p = pellets[idx];
        if (p && p.mesh) scene.remove(p.mesh);
        pellets.splice(idx, 1);
        pelletsEaten++;
        sessionCrystals++;
    }

    // Update UI counter
    document.getElementById('lbl-pellets').innerText = pelletsEaten;
    document.getElementById('lbl-remaining').innerText = Math.max(0, TOTAL_PELLETS - pelletsEaten);

    // Semua habis -> fase kabur: teleport ke tengah peta, monster berjaga.
    if (pelletsEaten >= TOTAL_PELLETS && !mustReturnToSafeZone) {
        beginEscapePhase();
    } else {
        playSound('pellet');
    }

    const msg = fraction >= 1 ? 'All crystals collected!' : `${Math.round(fraction * 100)}% crystals collected!`;
    showNotification(msg, 'type-stun');
}

initDebugPanel();

function updatePowerupHUD() {
    const stunCard = document.getElementById('hud-powerup-stun');
    const stunTimer = document.getElementById('hud-stun-timer');

    if (stunCard && stunTimer) {
        if (isStunned && stunTimeRemaining > 0) {
            stunCard.classList.add('active');
            stunTimer.innerText = `${Math.max(0, stunTimeRemaining).toFixed(1)}s`;
            if (stunTimeRemaining <= 3.0) {
                stunCard.classList.add('warning');
            } else {
                stunCard.classList.remove('warning');
            }
        } else {
            stunCard.classList.remove('active');
            stunCard.classList.remove('warning');
        }
    }

    const radarCard = document.getElementById('hud-powerup-radar');
    const radarTimer = document.getElementById('hud-radar-timer');

    if (radarCard && radarTimer) {
        if (isDetectorActive && detectorTimeRemaining > 0) {
            radarCard.classList.add('active');
            radarTimer.innerText = `${Math.max(0, detectorTimeRemaining).toFixed(1)}s`;
            if (detectorTimeRemaining <= 3.0) {
                radarCard.classList.add('warning');
            } else {
                radarCard.classList.remove('warning');
            }
        } else {
            radarCard.classList.remove('active');
            radarCard.classList.remove('warning');
        }
    }

    reorderPowerupHUD();
}

/**
 * Atur urutan kartu HUD powerup di dalam container.
 * Kartu dengan durasi efek (sisa waktu) paling lama ditempatkan paling atas,
 * sedangkan kartu yang tidak aktif ditaruh paling bawah.
 */
function reorderPowerupHUD() {
    const container = document.getElementById('powerup-hud');
    if (!container) return;

    const cards = [
        { el: document.getElementById('hud-powerup-stun'), time: (isStunned && stunTimeRemaining > 0) ? stunTimeRemaining : -1 },
        { el: document.getElementById('hud-powerup-radar'), time: (isDetectorActive && detectorTimeRemaining > 0) ? detectorTimeRemaining : -1 }
    ];

    // Urutkan menurun (paling lama di atas); kartu tidak aktif (-1) di paling bawah
    cards.sort((a, b) => b.time - a.time);

    for (const card of cards) {
        if (card.el) container.appendChild(card.el);
    }
}


// ==========================================
// CRYSTAL PICKUP VISUAL EFFECTS ENGINE
// ==========================================
const shardGeoSmall = new THREE.OctahedronGeometry(0.065, 0);
const shardGeoTiny = new THREE.TetrahedronGeometry(0.045, 0);
const shockwaveRingGeo = new THREE.RingGeometry(0.06, 0.16, 24);

const CRYSTAL_FX_PALETTES = {
    normal: {
        colors: [0xffd32a, 0xffa801, 0xfff200, 0xffffff, 0xf6b93b],
        light: 0xffd32a,
        cssFlash: 'flash-gold'
    },
    stun: {
        colors: [0x00d2d3, 0x54a0ff, 0x48dbfb, 0xffffff, 0x0abde3],
        light: 0x00d2d3,
        cssFlash: 'flash-stun'
    },
    detector: {
        colors: [0xa55eea, 0x8854d0, 0x9b59b6, 0xffffff, 0xd980fa],
        light: 0xa55eea,
        cssFlash: 'flash-detector'
    }
};

let pickupFlashTimer = null;
function triggerScreenPickupFlash(flashClass) {
    const el = document.getElementById('pickup-lens-flash');
    if (!el) return;
    el.className = '';
    void el.offsetWidth;
    el.classList.add(flashClass, 'show-flash');
    if (pickupFlashTimer) clearTimeout(pickupFlashTimer);
    pickupFlashTimer = setTimeout(() => {
        el.classList.remove('show-flash');
    }, 180);
}

function pulseMinimapBadge() {
    const badge = document.getElementById('minimap-badge');
    if (!badge) return;
    badge.classList.remove('collected-pulse');
    void badge.offsetWidth;
    badge.classList.add('collected-pulse');
}

function spawnCrystalPickupFX(position, type = 'normal') {
    const palette = CRYSTAL_FX_PALETTES[type] || CRYSTAL_FX_PALETTES.normal;

    // 1. 3D Crystal Shard Particle Burst
    const shardCount = Math.max(1, Math.round((type === 'normal' ? 14 : 22) * GRAPHICS_CONFIG.pickupParticleScale));
    for (let i = 0; i < shardCount; i++) {
        const color = palette.colors[Math.floor(Math.random() * palette.colors.length)];
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        const geo = (i % 2 === 0) ? shardGeoSmall : shardGeoTiny;
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.copy(position);
        mesh.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );

        const angle = Math.random() * Math.PI * 2;
        const speedH = 1.2 + Math.random() * 2.8;
        const speedY = 1.8 + Math.random() * 3.4;

        const vx = Math.cos(angle) * speedH;
        const vy = speedY;
        const vz = Math.sin(angle) * speedH;

        scene.add(mesh);

        pickupParticles.push({
            mesh: mesh,
            mat: mat,
            vx: vx,
            vy: vy,
            vz: vz,
            rotSpeedX: (Math.random() - 0.5) * 16,
            rotSpeedY: (Math.random() - 0.5) * 16,
            rotSpeedZ: (Math.random() - 0.5) * 16,
            life: 1.0,
            maxLife: 0.55 + Math.random() * 0.25,
            initialScale: 0.8 + Math.random() * 0.6
        });
    }

    // 2. Expanding 3D Shockwave Energy Ring
    if (GRAPHICS_CONFIG.pickupRing) {
        const ringMat = new THREE.MeshBasicMaterial({
            color: palette.light,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const ringMesh = new THREE.Mesh(shockwaveRingGeo, ringMat);
        ringMesh.position.set(position.x, position.y + 0.05, position.z);
        ringMesh.rotation.x = -Math.PI / 2;
        scene.add(ringMesh);

        pickupRings.push({
            mesh: ringMesh,
            mat: ringMat,
            scale: 0.2,
            maxScale: type === 'normal' ? 1.8 : 2.5,
            life: 1.0,
            maxLife: 0.35
        });
    }

    // 3. Dynamic Point Light Flash
    if (GRAPHICS_CONFIG.pickupLights) {
        const flashLight = new THREE.PointLight(palette.light, type === 'normal' ? 1.8 : 3.0, 5.5, 2.0);
        flashLight.position.copy(position);
        scene.add(flashLight);

        pickupLights.push({
            light: flashLight,
            initialIntensity: flashLight.intensity,
            life: 1.0,
            maxLife: 0.24
        });
    }

    // 4. First-Person Screen Lens Flare & Vignette Flash
    triggerScreenPickupFlash(palette.cssFlash);

    // 5. Pulse Minimap Counter
    pulseMinimapBadge();
}

function updatePickupFX(delta) {
    // 1. Shards update
    for (let i = pickupParticles.length - 1; i >= 0; i--) {
        const p = pickupParticles[i];
        p.life -= delta / p.maxLife;

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mat.dispose();
            pickupParticles.splice(i, 1);
            continue;
        }

        p.vy -= 9.8 * delta;
        p.mesh.position.x += p.vx * delta;
        p.mesh.position.y += p.vy * delta;
        p.mesh.position.z += p.vz * delta;

        p.mesh.rotation.x += p.rotSpeedX * delta;
        p.mesh.rotation.y += p.rotSpeedY * delta;
        p.mesh.rotation.z += p.rotSpeedZ * delta;

        const progress = Math.max(0, p.life);
        const curScale = p.initialScale * Math.pow(progress, 0.75);
        p.mesh.scale.set(curScale, curScale, curScale);
        p.mat.opacity = progress;
    }

    // 2. Shockwave Rings update
    for (let i = pickupRings.length - 1; i >= 0; i--) {
        const r = pickupRings[i];
        r.life -= delta / r.maxLife;

        if (r.life <= 0) {
            scene.remove(r.mesh);
            r.mat.dispose();
            pickupRings.splice(i, 1);
            continue;
        }

        const progress = 1.0 - r.life;
        const curScale = 0.2 + (r.maxScale - 0.2) * Math.sin(progress * Math.PI * 0.5);
        r.mesh.scale.set(curScale, curScale, curScale);
        r.mat.opacity = Math.max(0, r.life * 0.95);
    }

    // 3. Dynamic Flash Lights update
    for (let i = pickupLights.length - 1; i >= 0; i--) {
        const l = pickupLights[i];
        l.life -= delta / l.maxLife;

        if (l.life <= 0) {
            scene.remove(l.light);
            pickupLights.splice(i, 1);
            continue;
        }

        l.light.intensity = l.initialIntensity * Math.max(0, l.life);
    }
}


// ==========================================
// PELLET COLLISION (Fixed 2D XZ Distance)
// ==========================================
function checkPelletCollisions() {
    const px = camera.position.x;
    const pz = camera.position.z;

    for (let i = pellets.length - 1; i >= 0; i--) {
        let p = pellets[i];
        let dx = px - p.mesh.position.x;
        let dz = pz - p.mesh.position.z;
        let dist2D = Math.hypot(dx, dz);

        // Menggunakan jarak 2D (XZ) sehingga tidak terhambat oleh ketinggian Y kamera
        if (dist2D < PELLET_PICKUP_RADIUS) {
            const pelletPos = p.mesh.position.clone();
            const pelletType = p.type;

            scene.remove(p.mesh);

            // Spawn dynamic 3D crystal shatter, rings, light burst & screen visual effects
            spawnCrystalPickupFX(pelletPos, pelletType);

            if (p.type === 'stun') {
                activateStun();
            } else if (p.type === 'detector') {
                activateDetector();
            } else {
                playSound('pellet');
            }

            pellets.splice(i, 1);
            pelletsEaten++;
            sessionCrystals++;
            document.getElementById('lbl-pellets').innerText = pelletsEaten;
            document.getElementById('lbl-remaining').innerText = TOTAL_PELLETS - pelletsEaten;

            // Cek Kondisi Menang Level — semua pellet habis: masuk fase kabur
            // (pemain diteleport ke tengah peta, monster berjaga di safe zone)
            if (pelletsEaten >= TOTAL_PELLETS && !mustReturnToSafeZone) {
                beginEscapePhase();
            }
        }
    }
}

// ==========================================
// SAFE ZONE RETURN CHECK & OVERLAY "YOU'VE ESCAPED"
// ==========================================
function checkSafeZoneReturn() {
    if (!mustReturnToSafeZone) return;

    const px = camera.position.x;
    const pz = camera.position.z;
    const gx = Math.round(px / CELL_SIZE);
    const gz = Math.round(pz / CELL_SIZE);

    if (isInsideSafeZone(gx, gz) || isInsideSafeZoneWorld(px, pz, 0.2)) {
        mustReturnToSafeZone = false;
        beginEscapeVictory();
    }
}

// Pemain BARU SAJA mencapai Safe Zone (kondisi menang level). JANGAN langsung
// pindah level / kembali ke menu: jalankan "victory lap" singkat di mana
// pemain masih bisa bergerak melihat sekitar, lalu tampilkan overlay
// "YOU'VE ESCAPED" yang mengakhiri sesi. BGM sengaja TIDAK dihentikan pada
// alur ini — musik terus berbunyi sampai pemain memilih aksi di overlay.
let _escapeFlowToken = 0; // token anti-race: membatalkan timer victory lap bila sesi baru dimulai

function beginEscapeVictory() {
    if (escapeEnding) return;
    escapeEnding = true;

    // Token guard: bila sesi baru dimulai sebelum timer ini jalan (mis. restart),
    // callback di bawah otomatis tidak dieksekusi.
    const token = ++_escapeFlowToken;

    // Kunci progres SEKARANG juga (sebelum overlay tampil) supaya tetap
    // tersimpan walau pemain menutup tab lebih awal.
    if (currentLevel < 3) {
        if (typeof MenuManager !== 'undefined') {
            MenuManager.unlockNextLevel(currentLevel);
        }
    } else {
        // Semua level selesai — tandai completed
        if (typeof MenuManager !== 'undefined') {
            MenuManager.saveProgress({ unlockedLevels: 3, allCompleted: true });
        }
    }

    playSound('win');
    showNotification("YOU'VE ESCAPED!", 'type-safe');

    // Victory lap: pemain masih bisa bergerak sebentar (monster tidak bisa
    // menangkap — lihat guard !escapeEnding pada deteksi tangkapan) sebelum
    // overlay masuk dan permainan diakhiri.
    setTimeout(() => {
        if (token !== _escapeFlowToken || !escapeEnding || !gameActive) return;
        showEscapeOverlay();
    }, ESCAPE_VICTORY_LAP_DURATION * 1000);
}

// Format waktu sesi untuk overlay: "3m 05s" (menit dimainkan).
function formatSessionTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${String(r).padStart(2, '0')}s`;
}

// Tampilkan overlay "YOU'VE ESCAPED" berisi statistik sesi & tombol lanjutan,
// lalu akhiri sesi permainan. BGM TIDAK dihentikan di sini (musik terus bunyi
// sampai pemain memilih: lanjut level / main lagi / kembali ke menu utama).
function showEscapeOverlay() {
    // Akhiri gameplay: pemain tidak bisa bergerak lagi, monster berhenti.
    gameActive = false;
    isPaused = false;
    isDying = false;
    clearRespawnGrace();
    resetMobileInput();
    isStunned = false;
    stunTimeRemaining = 0;
    isDetectorActive = false;
    detectorTimeRemaining = 0;
    updatePowerupHUD();

    // gameActive sudah false sebelum unlock, sehingga event 'unlock' tidak
    // memicu pauseGame(). (Urutan ini penting.)
    if (controls.isLocked) controls.unlock();
    if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(true);

    // Sembunyikan seluruh HUD gameplay (termasuk minimap). sceneReady sengaja
    // dibiarkan true: frame terakhir tetap ter-render samar di balik overlay.
    document.body.classList.remove('in-game');
    clearGameplayUIState();

    // Tutup menu pause bila pemain sempat pause di saat victory lap, dan
    // kembalikan volume BGM yang diturunkan saat pause (musik TIDAK di-stop).
    const screenEl = document.getElementById('overlay-screen');
    if (screenEl) {
        screenEl.style.display = 'none';
        screenEl.classList.remove('pause-mode');
    }
    const pauseHint = document.getElementById('pause-hint');
    if (pauseHint) pauseHint.style.display = 'none';
    if (typeof resumeAmbientMusic === 'function') resumeAmbientMusic();

    // Isi statistik sesi permainan
    const timeEl = document.getElementById('escape-stat-time');
    const crystalEl = document.getElementById('escape-stat-crystals');
    const deathEl = document.getElementById('escape-stat-deaths');
    if (timeEl) timeEl.innerText = formatSessionTime(sessionPlayTime);
    if (crystalEl) crystalEl.innerText = String(sessionCrystals);
    if (deathEl) deathEl.innerText = String(sessionDeaths);

    // Subjudul: lantai yang diselesaikan (atau seluruh hotel)
    const subEl = document.getElementById('escape-sub');
    if (subEl) {
        subEl.innerText = currentLevel < 3
            ? `Floor ${currentLevel} cleared`
            : 'All floors cleared';
    }

    // Tombol: CONTINUE hanya untuk level non-akhir, PLAY AGAIN hanya level akhir,
    // BACK TO MAIN MENU selalu ada.
    const continueBtn = document.getElementById('escape-continue-btn');
    const retryBtn = document.getElementById('escape-retry-btn');
    if (continueBtn) continueBtn.style.display = currentLevel < 3 ? '' : 'none';
    if (retryBtn) retryBtn.style.display = currentLevel >= 3 ? '' : 'none';

    const overlay = document.getElementById('escape-overlay');
    if (!overlay) return;

    // Munculkan overlay: kartu slide dari bawah ke atas (animasi di CSS).
    overlay.classList.remove('closing');
    void overlay.offsetWidth; // paksa reflow agar animasi masuk berjalan ulang
    overlay.classList.add('open');
}

// Tutup overlay "YOU'VE ESCAPED": kartu meluncur kembali ke bawah + backdrop memudar.
function hideEscapeOverlay() {
    const overlay = document.getElementById('escape-overlay');
    if (!overlay) return;
    if (!overlay.classList.contains('open') && !overlay.classList.contains('closing')) return;

    overlay.classList.remove('open');
    overlay.classList.add('closing');

    // Lepaskan fokus keyboard dari tombol agar Enter/Space tidak memicunya lagi
    // setelah overlay ditutup.
    ['escape-continue-btn', 'escape-retry-btn', 'escape-menu-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });

    // Bersihkan state 'closing' setelah animasi selesai supaya state bersih.
    setTimeout(() => {
        overlay.classList.remove('closing');
    }, 550);
}

// Aksi tombol CONTINUE (level non-akhir): lanjut ke level berikutnya.
// Urutan sinematik: layar menghitam dulu → trek ambient2 di-fade turun →
// baru lantai berikutnya dimuat (map intro tampil di atas hitam).
// Statistik sesi (waktu, kristal, kematian) TIDAK di-reset karena masih satu
// sesi permainan.
function continueToNextLevel() {
    escapeActionWithBlackout(() => {
        currentLevel++;
        pelletsEaten = 0;
        mustReturnToSafeZone = false;
        isDying = false;
        clearRespawnGrace();
        resetMobileInput();
        isStunned = false;
        stunTimeRemaining = 0;
        isDetectorActive = false;
        detectorTimeRemaining = 0;
        updatePowerupHUD();

        // BGM sesi lama (ambient2) sudah di-fade oleh transisi; kembalikan state
        // switcher & trek ke ambient1 agar lantai baru dimulai dari trek dasar.
        _hintMusicActive = false;
        if (typeof switchAmbientTrack === 'function') {
            switchAmbientTrack('audio/ambient.mp3');
        }

        loadLevel(currentLevel);
        sceneReady = true;
        ++_endFlowToken;

        const nextTheme = THEMES[currentLevel] || THEMES[1];
        showMapIntro(nextTheme.name, `Floor ${currentLevel}`, () => {
            gameActive = true;
            isPaused = false;
            prevTime = performance.now();
            // Tampilkan kembali HUD gameplay tepat saat permainan berjalan lagi
            document.body.classList.add('in-game');
            lockPointer();
            // Bangunkan kembali audio monster untuk lantai yang baru
            if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(false);
            // BGM lantai baru di-fade-in halus setelah intro nama level selesai
            // (trek sudah kembali ke ambient1).
            if (typeof startAmbientMusic === 'function') startAmbientMusic(true);
        });

        // Map intro tampil di atas layer hitam → angkat hitam perlahan.
        fadeOutEscapeBlackout();
    });
}

// Aksi tombol BACK TO MAIN MENU pada overlay escape: kembali ke menu utama.
// Urutan sinematik: layar menghitam dulu → trek ambient2 di-fade turun →
// baru menu utama dibuka di atas layer hitam.
function backToMainMenuFromEscape() {
    escapeActionWithBlackout(() => {
        gameActive = false;

        // Kanvas dibersihkan ke hitam polos agar tidak ada gambar labirin terakhir
        // di belakang menu (pola yang sama dengan alur endGame).
        sceneReady = false;
        document.body.classList.remove('in-game');

        if (typeof MenuManager !== 'undefined') {
            MenuManager.openMainMenu();
        }

        // Menu tampil di atas latar hitam → angkat layer hitam perlahan.
        fadeOutEscapeBlackout();
    });
}

// ==========================================
// TRANSISI SINEMATIK KELUAR OVERLAY ESCAPE
// ==========================================
// Saat pemain memilih CONTINUE / PLAY AGAIN / BACK TO MAIN MENU pada overlay
// "YOU'VE ESCAPED": layar MENGHITAM DULU (layer #level-transition), LALU trek
// ambient2 yang sedang diputar di-fade turun sampai senyap. Aksi sebenarnya
// baru dijalankan setelah hitam penuh & musik hampir selesai fade, sehingga
// perpindahan lantai / menu terasa sinematik dan tidak terlihat kasar.
let _escapeBlackoutActive = false; // anti double-trigger untuk transisi ini

const ESCAPE_BLACKOUT_MS = 650;      // durasi layar menghitam (fade layer hitam)
const ESCAPE_MUSIC_FADE_MS = 1000;   // durasi fade-out ambient2
const ESCAPE_MUSIC_FADE_DELAY_MS = 200; // ambient2 mulai fade SETELAH layar mulai menghitam
// Aksi dijalankan setelah hitam penuh (650ms) DAN fade ambient2 selesai
// (200ms + 1000ms = 1200ms) → 1250ms memberi jeda tipis agar audio bersih.
const ESCAPE_ACTION_DELAY_MS = 1250;

function escapeActionWithBlackout(action) {
    if (_escapeBlackoutActive) return;
    _escapeBlackoutActive = true;
    gameActive = false;
    isPaused = false;

    // Tutup overlay & kunci token agar tidak ada timer victory/escape tersisa.
    hideEscapeOverlay();
    escapeEnding = false;
    ++_escapeFlowToken;
    ['escape-continue-btn', 'escape-retry-btn', 'escape-menu-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });

    // 1) LAYAR MENGHITAM DULU — pakai layer #level-transition (hitam penuh,
    //    z-index 120: di atas overlay escape & menu, di bawah map intro).
    const transitionEl = document.getElementById('level-transition');
    if (transitionEl) {
        transitionEl.style.transition = `opacity ${ESCAPE_BLACKOUT_MS}ms ease`;
        transitionEl.style.opacity = '';
        transitionEl.classList.remove('active');
        void transitionEl.offsetWidth; // restart animasi bila layer baru saja dipakai
        transitionEl.classList.add('active');
    }

    // 2) LALU AMBIENT2 DI-FADE — mulai setelah layar mulai menghitam.
    setTimeout(() => {
        if (typeof fadeOutAmbientMusic === 'function') {
            fadeOutAmbientMusic(ESCAPE_MUSIC_FADE_MS);
        }
    }, ESCAPE_MUSIC_FADE_DELAY_MS);

    // 3) Hitam penuh & musik nyaris senyap → jalankan aksi yang dipilih.
    setTimeout(() => {
        _escapeBlackoutActive = false;
        if (typeof action === 'function') action();
    }, ESCAPE_ACTION_DELAY_MS);
}

// Angkat layer hitam transisi escape (dipanggil oleh aksi setelah perpindahan
// mulai berjalan — mis. map intro level baru sudah tampil di atas hitam, atau
// menu utama sudah terbuka di atas latar hitam).
function fadeOutEscapeBlackout() {
    const transitionEl = document.getElementById('level-transition');
    if (!transitionEl) return;
    transitionEl.style.transition = 'opacity 0.7s ease';
    transitionEl.style.opacity = '0';
    transitionEl.classList.remove('active');
    setTimeout(() => {
        transitionEl.style.transition = '';
        transitionEl.style.opacity = '';
    }, 750);
}

// ==========================================
// MONSTER AI LOGIC — cooperative surround
// ==========================================
function monsterGridPos(m) {
    return {
        x: Math.round(m.mesh.position.x / CELL_SIZE),
        z: Math.round(m.mesh.position.z / CELL_SIZE)
    };
}

// FIX: sekarang mengembalikan { path, detoured } alih-alih path polos, agar
// caller tahu apakah rute benar-benar berhasil menghindari kerumunan
// (avoidFn) atau cuma jatuh ke fallback biasa karena semua rute terblokir.
// Sebelumnya info ini hilang total, sehingga rute fallback yang TIDAK
// menghindar diperlakukan sama persis dengan rute yang berhasil menghindar.
function pathToTargetPreferringDetour(sx, sz, tx, tz, avoidFn) {
    const avoided = bfsPathAvoiding(sx, sz, tx, tz, avoidFn);
    if (avoided && avoided.length > 0) return { path: avoided, detoured: true };

    const direct = bfsPath(sx, sz, tx, tz);
    if (direct && direct.length > 0) return { path: direct, detoured: false };

    return null;
}

function replanMonsterPack(playerGridX, playerGridZ) {
    const cfg = getDifficultyConfig();
    const field = buildApproachField(playerGridX, playerGridZ, 18);
    const intercepts = field.intercepts || [];
    const assignedGate = new Map();

    function occupancyOf(gateId, exceptMonster) {
        let n = 0;
        for (let i = 0; i < monsters.length; i++) {
            const other = monsters[i];
            if (other === exceptMonster) continue;
            if (assignedGate.has(other)) {
                if (assignedGate.get(other) === gateId) n++;
            } else {
                const og = monsterGridPos(other);
                if (getGateIdAt(field, og.x, og.z) === gateId) n++;
            }
        }
        return n;
    }

    const ordered = monsters.slice().sort((a, b) => {
        const da = Math.hypot(a.mesh.position.x - camera.position.x, a.mesh.position.z - camera.position.z);
        const db = Math.hypot(b.mesh.position.x - camera.position.x, b.mesh.position.z - camera.position.z);
        return da - db;
    });

    ordered.forEach(m => {
        // Monster yang masih dormant belum ikut perencanaan gerakan/kawanan.
        if (m.dormant) return;

        const mg = monsterGridPos(m);
        const distToPlayer = field.distOf[mg.z] && field.distOf[mg.z][mg.x] >= 0
            ? field.distOf[mg.z][mg.x]
            : 99;
        const myGate = getGateIdAt(field, mg.x, mg.z);

        if (intercepts.length === 0 || distToPlayer <= 3) {
            const chase = bfsPath(mg.x, mg.z, playerGridX, playerGridZ);
            if (chase && chase.length > 1) {
                m.path = chase;
                m.pathIndex = 1;
            }
            // FIX: monster ini sedang mengejar langsung, bukan menuju/menahan
            // sebuah gate. Sebelumnya assignedGate tetap diisi berdasarkan
            // posisi fisiknya, sehingga occupancyOf() menganggap gate itu
            // "ramai" padahal sebenarnya tidak ada monster yang benar-benar
            // menjaganya — ini bikin monster lain menghindar tanpa alasan.
            m.assignedGate = null;
            return;
        }

        let best = null;
        const occMap = {};
        intercepts.forEach(ap => { occMap[ap.id] = occupancyOf(ap.id, m); });

        intercepts.forEach(ap => {
            const occ = occMap[ap.id] || 0;
            const crowdedHere = myGate === ap.id && occ > 0;
            const targetPlayer = occ === 0 && !crowdedHere;
            const tx = targetPlayer ? playerGridX : ap.interceptX;
            const tz = targetPlayer ? playerGridZ : ap.interceptZ;

            const avoidFn = (nx, nz) => {
                const g = getGateIdAt(field, nx, nz);
                if (!g || g === ap.id) return false;
                const d = field.distOf[nz][nx];
                if (d < 0 || d > 10) return false;
                return (occMap[g] || 0) > 0;
            };

            const result = pathToTargetPreferringDetour(mg.x, mg.z, tx, tz, avoidFn);
            if (!result) return;
            const { path, detoured } = result;

            let score = path.length + occ * cfg.occupancyPenalty;
            if (crowdedHere) score += cfg.occupancyPenalty * 2;
            if (occ === 0) score -= 5;
            if (myGate && myGate !== ap.id && occ === 0) score -= 3;
            // FIX: kalau rute ini GAGAL menghindari gate yang ramai (fallback
            // ke bfsPath polos) padahal gate tujuannya sendiri masih ramai,
            // jangan perlakukan sebagai pilihan bagus — beri penalti besar
            // supaya kandidat gate lain yang benar-benar berhasil menghindar
            // lebih diprioritaskan.
            if (!detoured && occ > 0) score += cfg.occupancyPenalty * 3;

            if (!best || score < best.score) {
                best = { score, path, gate: ap.id };
            }
        });

        if (best && best.path.length > 1) {
            m.path = best.path;
            m.pathIndex = 1;
            m.assignedGate = best.gate;
            assignedGate.set(m, best.gate);
        } else {
            const chase = bfsPath(mg.x, mg.z, playerGridX, playerGridZ);
            if (chase && chase.length > 1) {
                m.path = chase;
                m.pathIndex = 1;
            }
            m.assignedGate = myGate;
            if (myGate) assignedGate.set(m, myGate);
        }
    });
}

function updateMonsters(delta) {
    // Bangunkan monster dormant yang spawn-nya mulai didekati player
    updateMonsterDormancy();

    // Debug: monster movement off (freeze)
    if (!DEBUG.monsters) return;
    if (isStunned) return;

    // Masa aman pasca-kematian: monster total beku SESAAT di posisi terakhirnya
    // (bukan dikembalikan ke spawn), memberi waktu pemain kabur dari titik mati.
    if (isRespawnGrace) return;

    const monsterRadius = CELL_SIZE / 3.4;
    const minSeparation = monsterRadius * 1.95;
    const playerGridX = Math.round(camera.position.x / CELL_SIZE);
    const playerGridZ = Math.round(camera.position.z / CELL_SIZE);

    packHuntTimer -= delta;
    if (packHuntTimer <= 0) {
        const cfg = getDifficultyConfig();
        packHuntTimer = cfg.huntInterval * GRAPHICS_CONFIG.aiIntervalMultiplier + Math.random() * 0.08;
        replanMonsterPack(playerGridX, playerGridZ);
    }

    // 1. Update intended movement per monster (with soft avoidance steering)
    monsters.forEach(m => {
        // Monster masih "tidur" di spawn pointnya — tidak bergerak & tidak berburu
        if (m.dormant) return;

        let mGridX = Math.round(m.mesh.position.x / CELL_SIZE);
        let mGridZ = Math.round(m.mesh.position.z / CELL_SIZE);

        let moveDistance = MONSTER_SPEED * delta;
        let moveDirX = 0;
        let moveDirZ = 0;
        let hasTarget = false;

        if (m.path && m.pathIndex < m.path.length) {
            let [tx, tz] = m.path[m.pathIndex];
            let worldTX = tx * CELL_SIZE;
            let worldTZ = tz * CELL_SIZE;

            let dx = worldTX - m.mesh.position.x;
            let dz = worldTZ - m.mesh.position.z;
            let distToTarget = Math.hypot(dx, dz);

            if (distToTarget < 0.15) {
                m.pathIndex++;
                if (m.pathIndex >= m.path.length) packHuntTimer = Math.min(packHuntTimer, 0.05);
            } else {
                let invLen = 1 / distToTarget;
                moveDirX = dx * invLen;
                moveDirZ = dz * invLen;
                hasTarget = true;
            }
        }

        if (!hasTarget) {
            let dir = new THREE.Vector3().subVectors(camera.position, m.mesh.position);
            dir.y = 0;
            if (dir.lengthSq() > 0.0001) {
                dir.normalize();
                moveDirX = dir.x;
                moveDirZ = dir.z;
            }
        }

        // Soft avoidance steering away from nearby monsters
        let avoidRadius = monsterRadius * 2.4;
        monsters.forEach(other => {
            if (other === m) return;
            let odx = m.mesh.position.x - other.mesh.position.x;
            let odz = m.mesh.position.z - other.mesh.position.z;
            let odist = Math.hypot(odx, odz);
            if (odist < avoidRadius && odist > 0.001) {
                let force = (1 - odist / avoidRadius) * 0.9;
                moveDirX += (odx / odist) * force;
                moveDirZ += (odz / odist) * force;
            }
        });

        let moveLen = Math.hypot(moveDirX, moveDirZ);
        if (moveLen > 0.0001) {
            moveDirX /= moveLen;
            moveDirZ /= moveLen;
        }

        let targetX = m.mesh.position.x + moveDirX * moveDistance;
        let targetZ = m.mesh.position.z + moveDirZ * moveDistance;

        // Wall Collision Handling for Monster
        if (!isWallAt(targetX, targetZ, monsterRadius)) {
            m.mesh.position.x = targetX;
            m.mesh.position.z = targetZ;
        } else if (!isWallAt(targetX, m.mesh.position.z, monsterRadius)) {
            m.mesh.position.x = targetX;
        } else if (!isWallAt(m.mesh.position.x, targetZ, monsterRadius)) {
            m.mesh.position.z = targetZ;
        } else {
            packHuntTimer = 0;
        }

        // SafeZone Ejection (Monsters cannot enter enlarged safe zone)
        let checkGridX = Math.round(m.mesh.position.x / CELL_SIZE);
        let checkGridZ = Math.round(m.mesh.position.z / CELL_SIZE);
        if (isInsideSafeZone(checkGridX, checkGridZ) || isInsideSafeZoneWorld(m.mesh.position.x, m.mesh.position.z, 0.1)) {
            triggerFlashbang();
            resetMonsterToSpawn(m);
            return;
        }
    });

    // 2. Physical Non-Overlap Separation Solver (prevents overlapping/tumpang tindih)
    for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < monsters.length; i++) {
            for (let j = i + 1; j < monsters.length; j++) {
                let m1 = monsters[i];
                let m2 = monsters[j];

                // Monster dormant tidak diseret solver pemisahan fisik
                if (m1.dormant || m2.dormant) continue;

                let dx = m1.mesh.position.x - m2.mesh.position.x;
                let dz = m1.mesh.position.z - m2.mesh.position.z;
                let dist = Math.hypot(dx, dz);

                if (dist < minSeparation) {
                    if (dist < 0.001) {
                        dx = (Math.random() - 0.5) * 0.02;
                        dz = (Math.random() - 0.5) * 0.02;
                        dist = Math.hypot(dx, dz);
                    }

                    let overlap = minSeparation - dist;
                    let nx = dx / dist;
                    let nz = dz / dist;
                    let pushHalf = overlap * 0.5;

                    // Push m1
                    let p1x = nx * pushHalf;
                    let p1z = nz * pushHalf;
                    let m1MovedX = 0;
                    let m1MovedZ = 0;

                    if (!isWallAt(m1.mesh.position.x + p1x, m1.mesh.position.z + p1z, monsterRadius)) {
                        m1.mesh.position.x += p1x;
                        m1.mesh.position.z += p1z;
                        m1MovedX = p1x;
                        m1MovedZ = p1z;
                    } else {
                        if (!isWallAt(m1.mesh.position.x + p1x, m1.mesh.position.z, monsterRadius)) {
                            m1.mesh.position.x += p1x;
                            m1MovedX = p1x;
                        }
                        if (!isWallAt(m1.mesh.position.x, m1.mesh.position.z + p1z, monsterRadius)) {
                            m1.mesh.position.z += p1z;
                            m1MovedZ = p1z;
                        }
                    }

                    // Push m2
                    let p2x = -(nx * overlap - m1MovedX);
                    let p2z = -(nz * overlap - m1MovedZ);

                    if (!isWallAt(m2.mesh.position.x + p2x, m2.mesh.position.z + p2z, monsterRadius)) {
                        m2.mesh.position.x += p2x;
                        m2.mesh.position.z += p2z;
                    } else {
                        if (!isWallAt(m2.mesh.position.x + p2x, m2.mesh.position.z, monsterRadius)) {
                            m2.mesh.position.x += p2x;
                        }
                        if (!isWallAt(m2.mesh.position.x, m2.mesh.position.z + p2z, monsterRadius)) {
                            m2.mesh.position.z += p2z;
                        }
                    }
                }
            }
        }
    }

    // 3. Monster Catching Player Detection
    monsters.forEach(m => {
        let distToPlayer = Math.hypot(camera.position.x - m.mesh.position.x, camera.position.z - m.mesh.position.z);
        if (distToPlayer < 1.1 && !isDying && gameActive && !isPaused && !escapeEnding) {
            triggerDeathSequence(m);
        }
    });
}

// ==========================================
// 3D SPATIAL MONSTER AUDIO (positional growl)
// ==========================================
function updateMonsterSpatialAudio() {
    if (typeof updateMonsterAudioWorld !== 'function') return;

    const positions = [];
    for (let i = 0; i < monsters.length; i++) {
        positions.push({
            x: monsters[i].mesh.position.x,
            y: monsters[i].mesh.position.y,
            z: monsters[i].mesh.position.z
        });
    }

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);

    updateMonsterAudioWorld({
        listenerX: camera.position.x,
        listenerY: camera.position.y,
        listenerZ: camera.position.z,
        fwdX: fwd.x, fwdY: fwd.y, fwdZ: fwd.z,
        upX: camera.up.x, upY: camera.up.y, upZ: camera.up.z,
        positions: positions,
        silent: isStunned
    });
}

// ==========================================
// CINEMATIC DEATH SEQUENCE & BROKEN HEART
// ==========================================
function triggerDeathSequence(caughtMonster) {
    if (isDying) return;
    isDying = true;

    const prevLives = lives;
    lives--;
    updateLivesUI();
    sessionDeaths++; // statistik sesi: jumlah kematian (untuk overlay YOU'VE ESCAPED)

    playSound('hit');
    triggerFlashbang();
    if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(true);

    // Release pointer lock
    if (controls.isLocked) {
        controls.unlock();
    }

    const overlay = document.getElementById('death-overlay');
    const container = document.getElementById('death-hearts-container');
    const title = document.getElementById('death-title');
    const subtitle = document.getElementById('death-subtitle');
    const countLabel = document.getElementById('death-status-count');

    if (lives <= 0) {
        title.innerText = "IT'S OVER";
        subtitle.innerText = "You dissappoint me";
        countLabel.innerText = "0";
        countLabel.style.color = "#ff4757";
    } else {
        title.innerText = "YOU'RE PATHETIC";
        subtitle.innerText = "Seems I have to give you a few more chance";
        countLabel.innerText = lives;
        countLabel.style.color = "#f1c40f";
    }

    // Build the 5 Hearts dynamically
    container.innerHTML = '';
    const maxLives = 5;

    for (let i = 1; i <= maxLives; i++) {
        const heartBox = document.createElement('div');
        heartBox.className = 'heart-box';

        if (i < prevLives) {
            // Intact surviving heart
            heartBox.classList.add('intact');
            heartBox.innerHTML = `
                <div class="heart-half full">
                    <svg viewBox="0 0 32 32">
                        <path d="M16 28 C16 28 3 20 3 11 C3 6 7 2 12 2 C14.5 2 16 3.5 16 5.5 C16 3.5 17.5 2 20 2 C25 2 29 6 29 11 C29 20 16 28 16 28 Z" />
                    </svg>
                </div>
            `;
        } else if (i === prevLives) {
            // The dying heart to be animated and shattered into broken heart
            heartBox.classList.add('breaking');
            heartBox.id = 'dying-heart';
            heartBox.innerHTML = `
                <div class="ghost-broken">
                    <svg viewBox="0 0 32 32">
                        <path d="M16 28 C16 28 3 20 3 11 C3 6 7 2 12 2 C14.5 2 16 3.5 16 5.5 C16 3.5 17.5 2 20 2 C25 2 29 6 29 11 C29 20 16 28 16 28 Z" fill="url(#heartDarkGrad)" />
                    </svg>
                </div>
                <div class="heart-half left-half">
                    <svg viewBox="0 0 32 32">
                        <path d="M16 28 C16 28 3 20 3 11 C3 6 7 2 12 2 C14.5 2 16 3.5 16 5.5 L16 11 L14 14 L16 18 L15 22 L16 28 Z" fill="url(#heartRedGrad)" />
                    </svg>
                </div>
                <div class="heart-half right-half">
                    <svg viewBox="0 0 32 32">
                        <path d="M16 5.5 C16 3.5 17.5 2 20 2 C25 2 29 6 29 11 C29 20 16 28 16 28 L15 22 L16 18 L14 14 L16 11 Z" fill="url(#heartRedGrad)" />
                    </svg>
                </div>
            `;
        } else {
            // Already lost empty heart
            heartBox.classList.add('broken');
            heartBox.innerHTML = `
                <div class="heart-half full">
                    <svg viewBox="0 0 32 32">
                        <path d="M16 28 C16 28 3 20 3 11 C3 6 7 2 12 2 C14.5 2 16 3.5 16 5.5 C16 3.5 17.5 2 20 2 C25 2 29 6 29 11 C29 20 16 28 16 28 Z" />
                    </svg>
                </div>
            `;
        }
        container.appendChild(heartBox);
    }

    // Step 1: Fade to black screen overlay
    overlay.classList.add('active');

    // Step 2: Heartbeat sound
    setTimeout(() => {
        playSound('heartbeat');
    }, 280);

    // Step 3: Trigger fracture and split with heartbreak sound and particles
    setTimeout(() => {
        const dyingHeart = document.getElementById('dying-heart');
        if (dyingHeart) {
            dyingHeart.classList.add('split');
            playSound('heartbreak');

            // Particle shards bursting outwards
            for (let s = 0; s < 14; s++) {
                const angle = (Math.PI * 2 * s) / 14 + (Math.random() - 0.5) * 0.4;
                const dist = 28 + Math.random() * 45;
                const tx = Math.cos(angle) * dist + 'px';
                const ty = Math.sin(angle) * dist + 'px';

                const shard = document.createElement('div');
                shard.className = 'shard-particle';
                shard.style.setProperty('--tx', tx);
                shard.style.setProperty('--ty', ty);
                shard.style.left = '50%';
                shard.style.top = '50%';
                dyingHeart.appendChild(shard);
            }
        }
    }, 720);

    // Step 4: Finish sequence and transition back or Game Over
    setTimeout(() => {
        overlay.classList.remove('active');

        if (lives > 0) {
            if (mustReturnToSafeZone) {
                // Fase kabur (sisa kristal 0): respawn di TENGAH PETA, bukan di
                // Safe Zone. Monster juga dikembalikan ke posisi penjaga di
                // sekitar Safe Zone dan dormant lagi sampai pemain mendekat.
                teleportPlayerToMapCenter();
                deploySafeZoneGuards();
            } else {
                // Respawn pemain di tengah Safe Zone setelah tertangkap
                // (monster tetap di posisi terakhirnya & dibekukan oleh grace period).
                playerX = SAFE_ZONE_CENTER_X;
                playerZ = SAFE_ZONE_CENTER_Z;
                camera.position.set(playerX, PLAYER_BASE_Y, playerZ);
                // Buang sisa tilt head-bob yang membeku saat mati agar kamera
                // tidak miring setelah respawn (yaw/pitch pemain dipertahankan).
                resetCameraRoll();
                bobTimer = 0;
                bobIntensity = 0;
                idleTimer = 0;
            }
            startRespawnGrace();
            isDying = false;
            if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(false);
            prevTime = performance.now();

            if (gameActive && !isPaused) {
                lockPointer();
            }
        } else {
            isDying = false;
            endGame(false);
        }
    }, 2350);
}

// ==========================================
// MINIMAP RENDERER (Player-Oriented / Rotating Radar View)
// ==========================================
function drawMinimap() {
    const width = minimapCanvas.width;
    const height = minimapCanvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radarRadius = width / 2 - 6;

    minimapCtx.clearRect(0, 0, width, height);

    // Get camera facing direction in XZ plane
    let dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    let playerAngle = Math.atan2(dir.z, dir.x);

    // Debug full-map mode: tampilkan seluruh peta (north-up) alih-alih radar kecil.
    const fullMapMode = !!DEBUG.fullMap;

    const px = camera.position.x;
    const pz = camera.position.z;

    let scale, viewX, viewZ, worldRotation, VIEW_RADIUS;

    if (fullMapMode) {
        // Seluruh labirin terlihat penuh, utara di atas; tidak ikut rotasi kamera.
        // CATATAN: frame minimap berbentuk LINGKARAN sedangkan peta PERSEGI.
        // Jika sisi peta = diameter lingkaran, pojok-pojok peta (setengah-diagonalnya
        // = sisi/2 x √2) akan terpotong clip lingkaran. Maka skala dihitung dari
        // diagonal: sisi efektif = radius x √2, dengan margin kecil agar ikon
        // (pellet/monster/SAFE) di pojok tetap utuh di dalam lingkaran.
        const worldSize = GRID_SIZE * CELL_SIZE;
        VIEW_RADIUS = worldSize * 1.5;                       // cukup besar agar semua konten ikut terlihat
        const fullMapSide = radarRadius * Math.SQRT2 - 20;   // sisi peta yang diperkecil agar muat penuh dalam lingkaran
        scale = fullMapSide / worldSize;
        viewX = worldSize / 2;
        viewZ = worldSize / 2;
        worldRotation = 0;                                   // north-up
    } else {
        // Radar kecil yang berputar mengikuti arah hadap pemain (~5.2 cell di sekeliling).
        VIEW_RADIUS = 5.2 * CELL_SIZE;
        scale = radarRadius / VIEW_RADIUS;
        viewX = px;
        viewZ = pz;
        // Pemain selalu menghadap utara (-PI/2) agar menunjuk lurus ke atas di minimap.
        worldRotation = -Math.PI / 2 - playerAngle;
    }

    // Arah hadap pemain dalam koordinat layar minimap (dipakai vision cone & needle).
    // - Mode radar  : dunia ikut dirotasi, jadi hasilnya selalu -PI/2 (ke ATAS) — perilaku lama.
    // - Mode full map (north-up, rotasi dunia = 0): mengikuti arah hadap ASLI pemain,
    //   sehingga pointer player tidak lagi selalu menunjuk ke atas.
    const headingScreenAngle = playerAngle + worldRotation;

    const worldToMinimap = (wx, wz) => {
        return {
            x: cx + (wx - viewX) * scale,
            y: cy + (wz - viewZ) * scale
        };
    };

    // Posisi pemain pada koordinat layar minimap (tengah pada mode radar, posisi asli pada full map).
    const pScreen = worldToMinimap(px, pz);
    const pScreenX = pScreen.x;
    const pScreenY = pScreen.y;

    // Status hint lokasi pellet di-update tiap frame oleh updateHintState()
    // (aktif saat pellet tersisa < 30% dan belum fase kembali ke safe zone).
    const isHintActive = hintActive;

    // BGM: ganti trek saat hint lokasi pellet aktif ATAU saat fase kembali ke safe zone
    // (pellet tinggal 0). Trek ambient2 dipakai pada keduanya, dan hanya kembali ke
    // ambient1 saat game/level baru dimulai (direset di startGame).
    //
    // PENGECUALIAN: saat pemain BARU SAJA mencapai Safe Zone (escapeEnding —
    // victory lap & overlay "YOU'VE ESCAPED"), JANGAN mengganti trek. Tanpa ini
    // mustReturnToSafeZone menjadi false dan BGM langsung turun kembali ke
    // ambient1 sebelum overlay tampil. Trek ambient2 dari fase kabur
    // DIPERTAHANKAN terus sampai pemain memilih aksi di overlay; switcher
    // berjalan normal lagi setelahnya (CONTINUE ganti lantai / PLAY AGAIN /
    // kembali ke menu utama).
    if (escapeEnding) {
        // Trek ambient2 tetap dianggap "aktif" selama kemenangan, sehingga
        // setelah CONTINUE ke lantai berikutnya transisi ke ambient1 tetap
        // terjadi secara normal (hintState false ≠ _hintMusicActive true).
        _hintMusicActive = true;
    } else {
        const hintState = isHintActive || mustReturnToSafeZone;
        if (hintState !== _hintMusicActive) {
            _hintMusicActive = hintState;
            if (typeof switchAmbientTrack === 'function') {
                switchAmbientTrack(hintState ? 'audio/ambient2.mp3' : 'audio/ambient.mp3');
            }
        }
    }

    let nearestPellet = null;
    let minPelletDistSq = Infinity;

    if (isHintActive) {
        for (let i = 0; i < pellets.length; i++) {
            let p = pellets[i];
            let dx = p.mesh.position.x - px;
            let dz = p.mesh.position.z - pz;
            let dSq = dx * dx + dz * dz;
            if (dSq < minPelletDistSq) {
                minPelletDistSq = dSq;
                nearestPellet = p;
            }
        }
    }

    // Hitung arah ke safe zone saat mustReturnToSafeZone aktif
    const safeWorldX = SAFE_ZONE_CENTER_X;
    const safeWorldZ = SAFE_ZONE_CENTER_Z;
    const safeDistToPlayer = Math.hypot(safeWorldX - px, safeWorldZ - pz);

    // Update minimap badge styling
    const minimapBadge = document.getElementById('minimap-badge');
    if (minimapBadge) {
        if (mustReturnToSafeZone && DEBUG.hints) {
            minimapBadge.classList.add('radar-hint');
            minimapBadge.classList.add('safezone-hint');
        } else if (isHintActive) {
            minimapBadge.classList.add('radar-hint');
            minimapBadge.classList.remove('safezone-hint');
        } else {
            minimapBadge.classList.remove('radar-hint');
            minimapBadge.classList.remove('safezone-hint');
        }
    }

    minimapCtx.save();

    // 1. Circular Radar Clip
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, radarRadius, 0, Math.PI * 2);
    minimapCtx.clip();

    // 2. Radar Background (Dark Luxury Slate)
    minimapCtx.fillStyle = '#14101c';
    minimapCtx.fillRect(0, 0, width, height);

    // 3. (Clean minimap — no rings/grid lines)

    // ==========================================
    // ROTATED WORLD CONTENT (Walls, Safezone, Pellets, Monsters)
    // ==========================================
    minimapCtx.save();
    // Rotate canvas around center (cx, cy)
    minimapCtx.translate(cx, cy);
    minimapCtx.rotate(worldRotation);
    minimapCtx.translate(-cx, -cy);

    // Sudut tampilan relatif ke pusat view (bukan pemain) agar full-map bisa menggambar seluruh grid.
    const edgeRadius = VIEW_RADIUS + CELL_SIZE * 1.5;
    const minCol = Math.max(0, Math.floor((viewX - edgeRadius) / CELL_SIZE));
    const maxCol = Math.min(GRID_SIZE - 1, Math.ceil((viewX + edgeRadius) / CELL_SIZE));
    const minRow = Math.max(0, Math.floor((viewZ - edgeRadius) / CELL_SIZE));
    const maxRow = Math.min(GRID_SIZE - 1, Math.ceil((viewZ + edgeRadius) / CELL_SIZE));

    const cellW = CELL_SIZE * scale;

    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            if (maze[r][c] === 1) {
                let minPt = worldToMinimap(c * CELL_SIZE - CELL_SIZE * 0.5, r * CELL_SIZE - CELL_SIZE * 0.5);

                // Dinding
                minimapCtx.fillStyle = '#533c32';
                minimapCtx.fillRect(minPt.x, minPt.y, cellW + 0.6, cellW + 0.6);

                // Highlight border dinding
                minimapCtx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
                minimapCtx.lineWidth = 1;
                minimapCtx.strokeRect(minPt.x, minPt.y, cellW + 0.6, cellW + 0.6);
            }
        }
    }

    // 5. Gambar SafeZone jika berada dalam jangkauan radar
    if (minCol <= SAFE_ZONE_MAX_X && maxCol >= SAFE_ZONE_MIN_X && minRow <= SAFE_ZONE_MAX_Z && maxRow >= SAFE_ZONE_MIN_Z) {
        let szPt = worldToMinimap((SAFE_ZONE_MIN_X - 0.5) * CELL_SIZE, (SAFE_ZONE_MIN_Z - 0.5) * CELL_SIZE);
        let szW = (SAFE_ZONE_MAX_X - SAFE_ZONE_MIN_X + 1) * cellW;
        let szH = (SAFE_ZONE_MAX_Z - SAFE_ZONE_MIN_Z + 1) * cellW;

        // Soft emerald translucent area
        minimapCtx.fillStyle = 'rgba(46, 204, 113, 0.45)';
        minimapCtx.fillRect(szPt.x, szPt.y, szW, szH);

        // Bright border with glow
        minimapCtx.strokeStyle = '#2ecc71';
        minimapCtx.lineWidth = 1.8;
        minimapCtx.shadowColor = '#2ecc71';
        minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 6 : 0;
        minimapCtx.strokeRect(szPt.x, szPt.y, szW, szH);
        minimapCtx.shadowBlur = 0;

        // Safezone text label
        minimapCtx.fillStyle = '#2ecc71';
        minimapCtx.font = 'bold 9px "Outfit", sans-serif';
        minimapCtx.textAlign = 'center';
        minimapCtx.textBaseline = 'middle';
        let szCenterPt = worldToMinimap(SAFE_ZONE_CENTER_X, SAFE_ZONE_CENTER_Z);
        minimapCtx.fillText('SAFE', szCenterPt.x, szCenterPt.y);
    }

    // 6. Gambar Kristal Pellets di area terlihat
    pellets.forEach(p => {
        let dist = Math.hypot(p.mesh.position.x - px, p.mesh.position.z - pz);
        if (dist <= VIEW_RADIUS + CELL_SIZE * 1.5) {
            let pt = worldToMinimap(p.mesh.position.x, p.mesh.position.z);
            if (p.type === 'normal') {
                // Faceted Diamond Gem Icon
                const r = 5.2;
                minimapCtx.fillStyle = '#ffd32a';
                minimapCtx.shadowColor = '#ffd32a';
                minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 8 : 0;
                minimapCtx.beginPath();
                minimapCtx.moveTo(pt.x, pt.y - r * 1.35);
                minimapCtx.lineTo(pt.x + r, pt.y);
                minimapCtx.lineTo(pt.x, pt.y + r * 1.35);
                minimapCtx.lineTo(pt.x - r, pt.y);
                minimapCtx.closePath();
                minimapCtx.fill();

                // Bright crystalline core dot
                minimapCtx.fillStyle = '#ffffff';
                minimapCtx.beginPath();
                minimapCtx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
                minimapCtx.fill();
                minimapCtx.shadowBlur = 0;
            } else {
                // 8-Pointed Astral Power Crystal Icon
                const col = p.type === 'stun' ? '#54a0ff' : '#d29bfe';
                minimapCtx.fillStyle = col;
                minimapCtx.shadowColor = col;
                minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 14 : 0;
                minimapCtx.beginPath();
                const starR = 8.5;
                for (let s = 0; s < 8; s++) {
                    const angle = (s / 8) * Math.PI * 2;
                    const rad = s % 2 === 0 ? starR : starR * 0.45;
                    const sx = pt.x + Math.cos(angle) * rad;
                    const sy = pt.y + Math.sin(angle) * rad;
                    if (s === 0) minimapCtx.moveTo(sx, sy);
                    else minimapCtx.lineTo(sx, sy);
                }
                minimapCtx.closePath();
                minimapCtx.fill();

                // Luminous Core
                minimapCtx.fillStyle = '#ffffff';
                minimapCtx.beginPath();
                minimapCtx.arc(pt.x, pt.y, 2.6, 0, Math.PI * 2);
                minimapCtx.fill();
                minimapCtx.shadowBlur = 0;
            }

            // Highlight khusus untuk target pellet terdekat saat hint aktif
            if (isHintActive && p === nearestPellet) {
                let now = performance.now();
                let pulse = (Math.sin(now * 0.008) + 1) * 0.5;
                minimapCtx.strokeStyle = '#ffd32a';
                minimapCtx.shadowColor = '#ffd32a';
                minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 14 : 0;
                minimapCtx.lineWidth = 2.2;
                minimapCtx.beginPath();
                minimapCtx.arc(pt.x, pt.y, 10 + pulse * 6, 0, Math.PI * 2);
                minimapCtx.stroke();
                minimapCtx.shadowBlur = 0;
            }
        }
    });

    // 7. Gambar Monster (Jika Radar Aktif, atau selalu terlihat pada mode debug full-map)
    if (isDetectorActive || fullMapMode) {
        monsters.forEach(m => {
            let dx = m.mesh.position.x - px;
            let dz = m.mesh.position.z - pz;
            let dist = Math.hypot(dx, dz);

            if (dist <= VIEW_RADIUS) {
                // Di dalam jangkauan radar
                let pt = worldToMinimap(m.mesh.position.x, m.mesh.position.z);
                minimapCtx.fillStyle = '#ff3838';
                minimapCtx.shadowColor = '#ff3838';
                minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 12 : 0;
                minimapCtx.beginPath();
                minimapCtx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
                minimapCtx.fill();
                minimapCtx.shadowBlur = 0;
            } else {
                // Indikator panah/titik di pinggir radar (arah relatif monster)
                let angle = Math.atan2(dz, dx);
                let edgeX = cx + Math.cos(angle) * (radarRadius - 14);
                let edgeY = cy + Math.sin(angle) * (radarRadius - 14);

                minimapCtx.fillStyle = '#ff4757';
                minimapCtx.beginPath();
                minimapCtx.arc(edgeX, edgeY, 6.5, 0, Math.PI * 2);
                minimapCtx.fill();
            }
        });
    }

    // End rotated world context
    minimapCtx.restore();

    // ==========================================
    // STATIONARY PLAYER MARKER (Always facing UP)
    // ==========================================
    // 8. PLAYER Vision Cone (selalu ke ATAS pada radar; mengikuti arah hadap pemain pada full-map)
    minimapCtx.fillStyle = 'rgba(72, 219, 251, 0.28)';
    minimapCtx.beginPath();
    minimapCtx.moveTo(pScreenX, pScreenY);
    minimapCtx.arc(pScreenX, pScreenY, 45, headingScreenAngle - 0.55, headingScreenAngle + 0.55);
    minimapCtx.closePath();
    minimapCtx.fill();

    // 8.5. Pellet Proximity Hint (< 30% pellets remaining)
    if (isHintActive && nearestPellet) {
        const now = performance.now();
        let npDx = nearestPellet.mesh.position.x - px;
        let npDz = nearestPellet.mesh.position.z - pz;
        let npDist = Math.hypot(npDx, npDz);
        let worldAngleToPellet = Math.atan2(npDz, npDx);
        let minimapAngle = worldAngleToPellet + worldRotation;

        // Sonar / beacon pulse ring around player dot
        let sonarRadius = 10 + ((now * 0.022) % 20);
        let sonarAlpha = Math.max(0, 1 - (sonarRadius - 10) / 20);
        minimapCtx.strokeStyle = `rgba(255, 211, 42, ${sonarAlpha * 0.85})`;
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(pScreenX, pScreenY, sonarRadius, 0, Math.PI * 2);
        minimapCtx.stroke();

        // Glowing Directional Arrow & Chevrons emanating from Player dot
        minimapCtx.save();
        minimapCtx.translate(pScreenX, pScreenY);
        minimapCtx.rotate(minimapAngle);

        let pulse = (Math.sin(now * 0.008) + 1) * 0.5;
        let flowOffset = (now * 0.035) % 14;

        // Dotted glowing trajectory ray
        minimapCtx.strokeStyle = `rgba(255, 215, 0, ${0.45 + pulse * 0.45})`;
        minimapCtx.shadowColor = '#ffd32a';
        minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 12 : 0;
        minimapCtx.lineWidth = 2.5;
        minimapCtx.lineCap = 'round';
        minimapCtx.setLineDash([4, 4]);
        minimapCtx.lineDashOffset = -flowOffset;
        minimapCtx.beginPath();
        minimapCtx.moveTo(13, 0);
        minimapCtx.lineTo(34, 0);
        minimapCtx.stroke();
        minimapCtx.setLineDash([]);

        // Glowing Arrowhead / Chevron pointing to nearest pellet
        let tipX = 38 + Math.sin(now * 0.008) * 3;
        minimapCtx.fillStyle = '#ffd32a';
        minimapCtx.shadowColor = '#ffb142';
        minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 14 : 0;
        minimapCtx.beginPath();
        minimapCtx.moveTo(tipX + 8, 0);
        minimapCtx.lineTo(tipX - 6, -5.5);
        minimapCtx.lineTo(tipX - 2.5, 0);
        minimapCtx.lineTo(tipX - 6, 5.5);
        minimapCtx.closePath();
        minimapCtx.fill();

        minimapCtx.restore();

        // If nearest pellet is outside radar viewport, draw edge beacon dot
        if (npDist > VIEW_RADIUS) {
            let edgeX = pScreenX + Math.cos(minimapAngle) * (radarRadius - 12);
            let edgeY = pScreenY + Math.sin(minimapAngle) * (radarRadius - 12);

            minimapCtx.fillStyle = '#ffd32a';
            minimapCtx.shadowColor = '#ffd32a';
            minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 10 : 0;
            minimapCtx.beginPath();
            minimapCtx.arc(edgeX, edgeY, 4.5 + pulse * 2, 0, Math.PI * 2);
            minimapCtx.fill();
            minimapCtx.shadowBlur = 0;
        }
    }

    // 8.6. Safe Zone Return Hint (setelah semua pellet dikumpulkan)
    if (mustReturnToSafeZone && DEBUG.hints) {
        const now = performance.now();
        let szDx = safeWorldX - px;
        let szDz = safeWorldZ - pz;
        let worldAngleToSafe = Math.atan2(szDz, szDx);
        let minimapAngleToSafe = worldAngleToSafe + worldRotation;

        // Sonar / beacon pulse ring — hijau untuk safe zone
        let sonarRadius = 10 + ((now * 0.022) % 20);
        let sonarAlpha = Math.max(0, 1 - (sonarRadius - 10) / 20);
        minimapCtx.strokeStyle = `rgba(0, 255, 136, ${sonarAlpha * 0.9})`;
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.arc(pScreenX, pScreenY, sonarRadius, 0, Math.PI * 2);
        minimapCtx.stroke();

        // Glowing Green Directional Arrow menuju Safe Zone
        minimapCtx.save();
        minimapCtx.translate(pScreenX, pScreenY);
        minimapCtx.rotate(minimapAngleToSafe);

        let pulse = (Math.sin(now * 0.008) + 1) * 0.5;
        let flowOffset = (now * 0.035) % 14;

        // Dotted glowing trajectory ray — hijau
        minimapCtx.strokeStyle = `rgba(0, 255, 136, ${0.5 + pulse * 0.45})`;
        minimapCtx.shadowColor = '#00ff88';
        minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 14 : 0;
        minimapCtx.lineWidth = 2.5;
        minimapCtx.lineCap = 'round';
        minimapCtx.setLineDash([4, 4]);
        minimapCtx.lineDashOffset = -flowOffset;
        minimapCtx.beginPath();
        minimapCtx.moveTo(13, 0);
        minimapCtx.lineTo(34, 0);
        minimapCtx.stroke();
        minimapCtx.setLineDash([]);

        // Glowing Green Arrowhead pointing to safe zone
        let tipX = 38 + Math.sin(now * 0.008) * 3;
        minimapCtx.fillStyle = '#00ff88';
        minimapCtx.shadowColor = '#00cc66';
        minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 16 : 0;
        minimapCtx.beginPath();
        minimapCtx.moveTo(tipX + 8, 0);
        minimapCtx.lineTo(tipX - 6, -5.5);
        minimapCtx.lineTo(tipX - 2.5, 0);
        minimapCtx.lineTo(tipX - 6, 5.5);
        minimapCtx.closePath();
        minimapCtx.fill();

        minimapCtx.restore();

        // If safe zone is outside radar viewport, draw edge beacon dot — hijau
        if (safeDistToPlayer > VIEW_RADIUS) {
            let edgeX = pScreenX + Math.cos(minimapAngleToSafe) * (radarRadius - 12);
            let edgeY = pScreenY + Math.sin(minimapAngleToSafe) * (radarRadius - 12);

            minimapCtx.fillStyle = '#00ff88';
            minimapCtx.shadowColor = '#00ff88';
            minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 12 : 0;
            minimapCtx.beginPath();
            minimapCtx.arc(edgeX, edgeY, 4.5 + pulse * 2, 0, Math.PI * 2);
            minimapCtx.fill();
            minimapCtx.shadowBlur = 0;
        }
    }

    // 9. Player Dot (Center / posisi pemain)
    minimapCtx.fillStyle = '#00d2d3';
    minimapCtx.shadowColor = '#00d2d3';
    minimapCtx.shadowBlur = GRAPHICS_CONFIG.minimapGlow ? 12 : 0;
    minimapCtx.beginPath();
    minimapCtx.arc(pScreenX, pScreenY, 9, 0, Math.PI * 2);
    minimapCtx.fill();
    minimapCtx.shadowBlur = 0;

    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 2.5;
    minimapCtx.stroke();

    // Needle arah hadap player (Selalu ke ATAS pada radar; mengikuti arah hadap asli pemain pada full-map)
    minimapCtx.strokeStyle = '#ffffff';
    minimapCtx.lineWidth = 3;
    minimapCtx.beginPath();
    minimapCtx.moveTo(pScreenX, pScreenY);
    minimapCtx.lineTo(
        pScreenX + Math.cos(headingScreenAngle) * 18,
        pScreenY + Math.sin(headingScreenAngle) * 18
    );
    minimapCtx.stroke();

    // End main circular clip
    minimapCtx.restore();
}

// ==========================================
// KAMERA — ROLL (TILT) STATELESS VIA EULER YXZ
// ==========================================
// Orientasi kamera dikelola PointerLockControls sebagai Euler YXZ
// (yaw Y → pitch X → roll Z; komponen Z = roll/tilt lokal kamera).
// Dengan mendekomposisi camera.quaternion ke Euler YXZ lalu MEN-SET
// komponen Z (bukan mengalikan kumulatif), roll frame sebelumnya selalu
// tergantikan penuh sehingga tidak mungkin menumpuk. Ini mencegah bug
// "kamera miring" ketika siklus head-bob terputus (mati di tengah jalan,
// pause, dll.) — sisa roll tidak pernah lagi tertinggal di quaternion,
// sementara yaw/pitch milik PointerLockControls tetap utuh.
const _cameraEulerTmp = new THREE.Euler(0, 0, 0, 'YXZ');

function setCameraRollZ(roll) {
    _cameraEulerTmp.setFromQuaternion(camera.quaternion);
    _cameraEulerTmp.z = roll;
    camera.quaternion.setFromEuler(_cameraEulerTmp);
}

// Buang sisa tilt/roll tanpa mengubah yaw (arah hadap) & pitch pemain.
// Dipanggil saat respawn kematian / load level agar kamera tidak miring permanen.
function resetCameraRoll() {
    setCameraRollZ(0);
}

// ==========================================
// PLAYER MOVEMENT & VIEW BOBBING PHYSICS
// ==========================================
function updatePlayer(delta) {
    let moveDir = new THREE.Vector3();
    let forward = new THREE.Vector3();
    let side = new THREE.Vector3();

    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    side.crossVectors(camera.up, forward).normalize();

    // Skala kecepatan (1 = penuh). Joystick analog memperkecil skala ini
    // sehingga mendorong joystick sedikit = berjalan pelan.
    let speedScale = 1;

    if (moveForward) moveDir.add(forward);
    if (moveBackward) moveDir.sub(forward);
    if (moveRight) moveDir.sub(side);
    if (moveLeft) moveDir.add(side);

    // Joystick mobile (analog): sumbangkan arah & besaran gerak.
    // Kanan = -side, bawah (joyY positif) = mundur (-forward) —
    // konvensi yang sama dengan flag moveLeft/moveRight di atas.
    if (isMobileControl && (joyX !== 0 || joyY !== 0)) {
        const joyMag = Math.hypot(joyX, joyY);
        if (joyMag > JOY_DEADZONE) {
            moveDir.addScaledVector(forward, -joyY);
            moveDir.addScaledVector(side, -joyX);
            speedScale = Math.min(1, (joyMag - JOY_DEADZONE) / (1 - JOY_DEADZONE));
        }
    }

    let isMoving = false;
    let actualMoveDistance = 0;

    if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
        let moveDistance = GAME_SPEED * delta * speedScale;

        let prevX = playerX;
        let prevZ = playerZ;
        let targetX = playerX + moveDir.x * moveDistance;
        let targetZ = playerZ + moveDir.z * moveDistance;

        // Sliding Collision Against Corridor Walls
        if (!isWallAt(targetX, targetZ, PLAYER_RADIUS)) {
            playerX = targetX;
            playerZ = targetZ;
        } else if (!isWallAt(targetX, playerZ, PLAYER_RADIUS)) {
            playerX = targetX;
        } else if (!isWallAt(playerX, targetZ, PLAYER_RADIUS)) {
            playerZ = targetZ;
        }

        actualMoveDistance = Math.hypot(playerX - prevX, playerZ - prevZ);
        if (actualMoveDistance > 0.0001) {
            isMoving = true;
        }
    }

    // ==========================================
    // VIEW BOBBING (HEAD BOBBING & BREATHING)
    // ==========================================
    const speedRatio = isMoving ? Math.min(1.2, actualMoveDistance / (GAME_SPEED * delta || 0.001)) : 0;

    if (isMoving) {
        // Smoothly ramp up bob intensity
        bobIntensity += (1.0 - bobIntensity) * Math.min(1.0, delta * 12.0);
        bobTimer += delta * BOB_FREQUENCY * speedRatio;

        // Footstep sound trigger at the bottom point of stride
        let stepIndex = Math.floor((bobTimer * 2) / Math.PI);
        if (stepIndex !== lastStepIndex) {
            lastStepIndex = stepIndex;
            if (bobIntensity > 0.35) {
                playSound('step');
            }
        }
    } else {
        // Smoothly decay bob intensity to zero
        bobIntensity += (0.0 - bobIntensity) * Math.min(1.0, delta * 8.0);
        if (bobIntensity < 0.001) bobIntensity = 0;
    }

    // Idle breathing cycle
    idleTimer += delta * IDLE_BREATH_SPEED;

    // Calculate motion offsets
    const walkY = Math.sin(bobTimer * 2) * BOB_AMPLITUDE_Y;
    const walkX = Math.cos(bobTimer) * BOB_AMPLITUDE_X;
    // sin() = integral dari ayunan lateral (cos) — tilt memuncak saat badan
    // bergoyang ke satu sisi. Amplitudo langsung dalam radian sehingga
    // konsisten di semua FPS (cara lama mengakumulasi cos per frame yang
    // amplitudonya bergantung FPS).
    const walkRoll = Math.sin(bobTimer) * BOB_ROLL_AMPLITUDE;

    const idleY = Math.sin(idleTimer) * IDLE_BREATH_AMPLITUDE;
    const idleX = Math.cos(idleTimer * 0.5) * (IDLE_BREATH_AMPLITUDE * 0.25);

    // Blended final offsets
    const finalOffsetY = (walkY * bobIntensity) + (idleY * (1.0 - bobIntensity));
    const finalOffsetX = (walkX * bobIntensity) + (idleX * (1.0 - bobIntensity));
    const finalRoll = walkRoll * bobIntensity;

    // Apply 3D position with head bobbing & sway relative to facing direction
    camera.position.x = playerX + side.x * finalOffsetX;
    camera.position.z = playerZ + side.z * finalOffsetX;
    camera.position.y = PLAYER_BASE_Y + finalOffsetY;

    // Subtle head tilt roll — applied via quaternion composition to avoid
    // corrupting the Euler pitch/yaw state managed by PointerLockControls.
    // PointerLockControls uses camera.quaternion internally (YXZ Euler),
    // so directly setting camera.rotation.z breaks vertical look.
    //
    // Roll di-SET ulang tiap frame (stateless), BUKAN dikalikan kumulatif.
    // Cara lama (multiply tiap frame) membuat roll menumpuk dan hanya
    // "kebetulan" saling menghapus dalam satu siklus langkah — jika siklus
    // terputus (mis. mati saat sedang berjalan/menggeser kamera), sisa roll
    // membeku di camera.quaternion, tidak di-reset saat respawn, dan tidak
    // pernah dibersihkan oleh PointerLockControls (Euler YXZ mempertahankan
    // komponen Z) sehingga kamera tampak miring permanen.
    setCameraRollZ(finalRoll);
}

// ==========================================
// MAIN ANIMATION LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);

    // Selalu update timestamp agar delta tidak melonjak setelah pause.
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);
    prevTime = time;

    if (gameActive && !isPaused && !isDying && (controls.isLocked || isMobileControl)) {
        // Update durasi Stun powerup dengan frame delta
        if (isStunned) {
            stunTimeRemaining -= delta;
            if (stunTimeRemaining <= 0) {
                isStunned = false;
                stunTimeRemaining = 0;
                document.getElementById('status-stun').style.display = 'none';
                // Remove blue tint
                const tintStun = document.getElementById('tint-stun');
                if (tintStun) tintStun.classList.remove('active');
            }
        }

        // Hitung mundur masa aman pasca-respawn (monster beku sementara)
        if (isRespawnGrace) {
            respawnGraceTimeRemaining -= delta;
            if (respawnGraceTimeRemaining <= 0) {
                clearRespawnGrace();
            }
        }

        // Update durasi Detector Radar powerup dengan frame delta
        if (isDetectorActive) {
            if (!isStunned) {
                detectorTimeRemaining -= delta;
            }
            if (detectorTimeRemaining <= 0) {
                isDetectorActive = false;
                detectorTimeRemaining = 0;
                document.getElementById('status-detector').style.display = 'none';
                // Remove purple tint
                const tintRadar = document.getElementById('tint-radar');
                if (tintRadar) tintRadar.classList.remove('active');
            }
        }

        updatePowerupHUD();

        // Akumulasi durasi bermain sesi ini (dipakai statistik overlay
        // "YOU'VE ESCAPED"). Hanya berjalan selagi gameplay benar-benar aktif,
        // sehingga waktu di menu pause / layar kematian tidak ikut dihitung.
        sessionPlayTime += delta;

        updatePlayer(delta);
        updateMonsters(delta);

        _visualAccumulator += delta;
        const updateCosmetics = VISUAL_INTERVAL === 0 || _visualAccumulator >= VISUAL_INTERVAL;
        if (updateCosmetics) {
            updateMonsterVisuals(time);
            _visualAccumulator = 0;
        }

        updateMonsterSpatialAudio();
        checkPelletCollisions();
        checkSafeZoneReturn();
        updateHintState();
        checkMonsterProximityDialog(delta);
        updatePickupFX(delta);

        _minimapAccumulator += delta;
        if (minimapInterval === 0) {
            drawMinimap();
            _minimapAccumulator = 0;
        } else if (_minimapAccumulator >= minimapInterval) {
            drawMinimap();
            // Preserve fractional timing instead of resetting to zero. This lets
            // 40 FPS average correctly on a 60 Hz requestAnimationFrame loop
            // (roughly draw, draw, skip) rather than collapsing to 30 FPS.
            _minimapAccumulator %= minimapInterval;
        }

        // Crystal cosmetic work follows the selected visual FPS. Low/Potato also
        // stop drawing normal crystals far away; collision/minimap data is unchanged.
        const t = time * 0.003;
        if (updateCosmetics) pellets.forEach((p, idx) => {
            if (p.type === 'normal') {
                const dx = p.mesh.position.x - playerX;
                const dz = p.mesh.position.z - playerZ;
                const distSq = dx * dx + dz * dz;
                const drawCells = GRAPHICS_CONFIG.crystalDrawDistanceCells;
                if (Number.isFinite(drawCells)) {
                    const drawDist = CELL_SIZE * drawCells;
                    p.mesh.visible = distSq <= drawDist * drawDist;
                    if (!p.mesh.visible) return;
                }
                const animCells = GRAPHICS_CONFIG.crystalAnimDistanceCells;
                if (Number.isFinite(animCells)) {
                    const animDist = CELL_SIZE * animCells;
                    if (distSq > animDist * animDist) return;
                }
            }
            // Floating levitation bob
            p.mesh.position.y = p.baseY + Math.sin(t * 3.2 + (p.bobPhase || idx * 0.5)) * 0.09;

            // Multi-axis crystal tumbling for rich light reflections
            if (p.crystalMesh) {
                p.crystalMesh.rotation.y += p.rotSpeed || 0.028;
                p.crystalMesh.rotation.x = Math.sin(t * 2.0 + idx) * 0.12;
                p.crystalMesh.rotation.z = Math.cos(t * 1.6 + idx) * 0.09;
            } else {
                p.mesh.rotation.y += 0.025;
            }

            // Counter-spinning inner luminous core
            if (p.innerCore) {
                p.innerCore.rotation.y -= 0.04;
                p.innerCore.rotation.z += 0.025;
            }

            // Gyroscopic / orbital ring animations
            if (p.ring1) {
                p.ring1.rotation.x += 0.038;
                p.ring1.rotation.y += 0.028;
            }
            if (p.ring2) {
                p.ring2.rotation.y -= 0.032;
                p.ring2.rotation.z += 0.042;
            }

            // Dynamic breathing and light pulsing for power crystals
            if (p.type !== 'normal') {
                const pulse = 1 + Math.sin(t * 5.2 + idx) * 0.15;
                p.mesh.scale.set(pulse, pulse, pulse);
                if (p.light) {
                    p.light.intensity = 0.85 + Math.sin(t * 6.0 + idx) * 0.35;
                }
            }
        });
    }

    if (sceneReady) {
        renderer.render(scene, camera);
    } else {
        // Belum ada level yang aktif (di main menu / setelah keluar dari permainan):
        // JANGAN merender scene sisa — bersihkan canvas menjadi hitam polos agar
        // "gambar permainan terakhir" tidak pernah terlihat di belakang menu.
        renderer.setClearColor(0x000000, 1);
        renderer.clear(true, true, true);
    }
}

// ==========================================
// GAME STATE MANAGEMENT
// ==========================================
// ==========================================
// MAP INTRO ANIMATION (3-second cinematic)
// ==========================================
function showMapIntro(mapName, floorLabel, onDone) {
    const overlay = document.getElementById('map-intro-overlay');
    const nameEl = document.getElementById('map-intro-name');
    const floorEl = document.getElementById('map-intro-floor');
    const contentEl = document.getElementById('map-intro-content');

    if (!overlay) { if (onDone) onDone(); return; }

    nameEl.innerText = mapName;
    floorEl.innerText = floorLabel;

    // Reset animation by forcing reflow
    void overlay.offsetWidth;

    // Putar ulang animasi slide-up teks setiap kali intro ditampilkan
    // (animasi CSS murni hanya berjalan sekali saat halaman dimuat).
    if (contentEl) {
        contentEl.style.animation = 'none';
        void contentEl.offsetWidth;
        contentEl.style.animation = '';
    }

    overlay.classList.add('visible');

    // Fade out at ~2.5s, call onDone at 3s
    setTimeout(() => {
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '0';
    }, 2500);

    setTimeout(() => {
        overlay.classList.remove('visible');
        overlay.style.opacity = '';
        if (onDone) onDone();
    }, 3000);
}

function startGame(startLevel) {
    initAudio();
    // Pastikan audio monster dari sesi sebelumnya benar-benar bersih
    // (node lama + flag mute) sebelum sesi baru dimulai.
    if (typeof stopMonsterAudio === 'function') stopMonsterAudio();
    if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(false);
    // Mulai game baru: reset state hint music & kembalikan trek BGM ke ambient1.
    // BGM TIDAK dinyalakan di sini — intro nama level harus berjalan sunyi;
    // musik baru dimulai tepat setelah animasi intro selesai (callback showMapIntro).
    // Sisa musik sesi sebelumnya (mis. track hint saat "Play Again") dihentikan
    // lebih dulu, sekaligus mencegah switchAmbientTrack memutar otomatis
    // (stopAmbientMusic me-reset _ambientUnlocked sebelum trek diganti).
    _hintMusicActive = false;
    if (typeof stopAmbientMusic === 'function') stopAmbientMusic();
    if (typeof switchAmbientTrack === 'function') switchAmbientTrack('audio/ambient.mp3');

    // Hanya fungsi ini yang membuat game baru / reset game.
    lives = 5;
    currentLevel = (typeof startLevel === 'number' && startLevel >= 1 && startLevel <= 3) ? startLevel : 1;
    pelletsEaten = 0;
    isStunned = false;
    stunTimeRemaining = 0;
    isDetectorActive = false;
    detectorTimeRemaining = 0;
    isPaused = false;
    isDying = false;
    mustReturnToSafeZone = false;
    // Sesi baru dimulai: reset statistik sesi & state overlay "YOU'VE ESCAPED"
    // (mis. tombol PLAY AGAIN pada overlay level akhir memanggil startGame).
    sessionPlayTime = 0;
    sessionCrystals = 0;
    sessionDeaths = 0;
    escapeEnding = false;
    ++_escapeFlowToken;
    hideEscapeOverlay();
    clearRespawnGrace();
    resetMobileInput();
    _monsterWakeNotified = false;

    const deathOverlay = document.getElementById('death-overlay');
    if (deathOverlay) deathOverlay.classList.remove('active');

    document.getElementById('status-stun').style.display = 'none';
    document.getElementById('status-detector').style.display = 'none';
    const tintStunEl = document.getElementById('tint-stun');
    const tintRadarEl = document.getElementById('tint-radar');
    if (tintStunEl) tintStunEl.classList.remove('active');
    if (tintRadarEl) tintRadarEl.classList.remove('active');
    updatePowerupHUD();
    document.getElementById('restart-btn').style.display = 'none';
    const menuMainBtnEl = document.getElementById('menu-main-btn');
    if (menuMainBtnEl) menuMainBtnEl.style.display = 'none';
    const controlsHint = document.getElementById('controls-hint');
    if (controlsHint) {
        controlsHint.style.display = 'block';
        // Hint kontrol menyesuaikan mode kontrol yang sedang aktif.
        controlsHint.innerHTML = isMobileControl
            ? '📱 <b>Controls:</b> [Joystick] Gerak &bull; [Drag Layar] Kamera &bull; [⏸] Pause'
            : '🎮 <b>Controls:</b> [W, A, S, D] Move &bull; [Mouse] Camera direction &bull; <b>[P]</b> or <b>[`]</b> Pause';
    }

    loadLevel(currentLevel);

    // Scene siap dirender lagi; batalkan sisa timer/overlay dari flow akhir
    // permainan sebelumnya (kalau ada) supaya mulai dari kondisi bersih.
    sceneReady = true;
    ++_endFlowToken;
    deactivateEndBlackout();

    const theme = THEMES[currentLevel] || THEMES[1];
    const screenEl2 = document.getElementById('overlay-screen');
    screenEl2.style.display = 'none';
    screenEl2.classList.remove('pause-mode');
    const pauseHint2 = document.getElementById('pause-hint');
    if (pauseHint2) pauseHint2.style.display = 'none';

    // Show 3-second map intro, THEN lock controls and begin
    showMapIntro(theme.name, `Floor ${currentLevel}`, () => {
        gameActive = true;
        prevTime = performance.now();
        // Tampilkan HUD gameplay (minimap dkk.) tepat saat permainan dimulai
        document.body.classList.add('in-game');
        lockPointer();
        // Nyalakan BGM game TEPAT setelah animasi intro nama level selesai
        // (fade-in halus, lihat startAmbientMusic di audio.js).
        if (typeof startAmbientMusic === 'function') startAmbientMusic(true);
    });
}


function pauseGame() {
    if (!gameActive || isPaused || isDying) return;
    isPaused = true;

    // Pastikan input gerakan tidak tertinggal saat pause.
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    resetMobileInput();

    const screen = document.getElementById('overlay-screen');
    const title = document.getElementById('screen-title');
    const desc = document.getElementById('screen-subtitle');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const menuMainBtn = document.getElementById('menu-main-btn');
    const controlsHint = document.getElementById('controls-hint');
    const pauseHint = document.getElementById('pause-hint');

    title.innerText = "GAME PAUSED";
    title.style.color = "#f1c40f";

    const remainingPellets = TOTAL_PELLETS - pelletsEaten;
    desc.innerHTML = `
        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; padding: 12px 18px; margin: 0 auto 16px auto; max-width: 440px; display: flex; justify-content: space-around; font-size: 15px; text-align: center;">
            <div> <b>Floor</b><br><span style="color:#f1c40f; font-weight:700;">${currentLevel}</span></div>
            <div> <b>Remaining Crystals</b><br><span style="color:#f1c40f; font-weight:700;">${remainingPellets}</span></div>
            <div> <b>Lives</b><br><span style="color:#ff4757; font-weight:700;">${'❤'.repeat(Math.max(0, lives))}</span></div>
        </div>
        ${isMobileControl
            ? 'Game is paused.<br>Tap <b>RESUME</b> to continue.'
            : 'Game is paused.<br>Click <b>RESUME</b> or press <b>[ P ]</b> / <b>[ ` ]</b> / <b>[ SPACE ]</b> to continue.'}
    `;

    startBtn.innerText = "RESUME";
    if (restartBtn) restartBtn.style.display = 'inline-block';
    if (menuMainBtn) menuMainBtn.style.display = 'inline-block';
    if (controlsHint) controlsHint.style.display = 'none';
    if (pauseHint) {
        pauseHint.style.display = 'block';
        pauseHint.innerHTML = isMobileControl
            ? '<span class="pause-hint-key">▶</span><span>Tap <b>RESUME</b> to continue</span>'
            : '<span class="pause-hint-key">`</span><span>Press <b>RESUME</b> or the <b>`</b> key to continue</span>';
    }

    screen.style.display = 'flex';
    screen.classList.add('pause-mode');

    if (typeof pauseAmbientMusic === 'function') pauseAmbientMusic();
    if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(true);

    if (controls.isLocked) {
        controls.unlock();
    }
}

function resumeGame() {
    // Resume TIDAK boleh memanggil loadLevel(), karena itu akan
    // membuat maze, monster, dan pellet baru serta mereset posisi player.
    if (!gameActive) return;
    isPaused = false;

    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    resetMobileInput();

    prevTime = performance.now();
    const screenEl = document.getElementById('overlay-screen');
    screenEl.style.display = 'none';
    screenEl.classList.remove('pause-mode');
    const pauseHint = document.getElementById('pause-hint');
    if (pauseHint) pauseHint.style.display = 'none';
    initAudio();
    if (typeof resumeAmbientMusic === 'function') resumeAmbientMusic();
    if (typeof setMonsterAudioMuted === 'function') setMonsterAudioMuted(false);

    if (!controls.isLocked) {
        lockPointer();
    }
}

function endGame(isWin) {
    gameActive = false;
    isPaused = false;
    isDying = false;
    clearRespawnGrace();
    resetMobileInput();
    isStunned = false;
    stunTimeRemaining = 0;
    isDetectorActive = false;
    detectorTimeRemaining = 0;
    updatePowerupHUD();
    if (controls.isLocked) {
        controls.unlock();
    }
    if (typeof stopMonsterAudio === 'function') stopMonsterAudio();

    // Sembunyikan seluruh HUD gameplay (termasuk minimap) secara instan, dan
    // tandai scene sebagai kosong agar loop animasi membersihkan canvas ke hitam.
    document.body.classList.remove('in-game');
    sceneReady = false;
    clearGameplayUIState();

    // Token guard: bila sesi baru dimulai sebelum flow ini selesai (misal restart),
    // timer-timer di bawah otomatis tidak dieksekusi.
    const token = ++_endFlowToken;
    const later = (ms, fn) => setTimeout(() => { if (token === _endFlowToken) fn(); }, ms);

    // Step 1 (+200ms): HITAMKAN LAYAR — fade-to-black sinematik sambil menampilkan
    // hasil besar di tengah ("GAME OVER" untuk kalah / "SELAMAT!" untuk menang),
    // menggantikan notifikasi kecil yang dulu mudah terlewat.
    later(200, () => activateEndBlackout(isWin));

    // Step 2: tergantung hasil akhir —
    //   • GAME OVER : TIDAK langsung ke menu. Tampilkan dua pilihan pada layer
    //                 hitam: "PLAY AGAIN" (ulangi level ini) & "BACK TO MENU".
    //   • MENANG    : tetap transisi otomatis ke main menu seperti sebelumnya.
    if (!isWin) {
        // (+1.6s) teks hasil sudah tampil penuh — waktunya memunculkan tombol pilihan.
        later(1600, () => showEndChoices());
    } else {
        // Layar sudah penuh hitam — buka main menu. Menu memiliki z-index lebih
        // tinggi daripada blackout, sehingga ia muncul di atas latar hitam alih-alih
        // di atas frame beku permainan.
        later(2600, () => {
            if (typeof MenuManager !== 'undefined') {
                MenuManager.openMainMenu();
            }
        });

        // Angkat layer hitam perlahan; di baliknya kanvas sudah berganti menjadi
        // hitam polos (sceneReady=false), menu pun tampak bersih.
        later(3200, () => deactivateEndBlackout());
    }
}

// ==========================================
// PEMBERSIH STATE UI GAMEPLAY & BLACKOUT AKHIR PERMAINAN
// ==========================================
let _endFlowToken = 0; // token anti-race untuk timer flow akhir permainan

function clearGameplayUIState() {
    // Tutup overlay death screen yang mungkin masih aktif
    const deathOverlay = document.getElementById('death-overlay');
    if (deathOverlay) deathOverlay.classList.remove('active');

    document.getElementById('status-stun').style.display = 'none';
    document.getElementById('status-detector').style.display = 'none';

    const tintStunEl = document.getElementById('tint-stun');
    if (tintStunEl) tintStunEl.classList.remove('active');
    const tintRadarEl = document.getElementById('tint-radar');
    if (tintRadarEl) tintRadarEl.classList.remove('active');

    // Matikan notifikasi yang sedang/hampir tampil
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = null;
    const notification = document.getElementById('notification');
    if (notification) notification.classList.remove('active');

    hideCreatorDialog();

    // Tutup dialog konfirmasi pause bila masih terbuka (mis. permainan tiba-tiba berakhir)
    closePauseConfirm();

    const flash = document.getElementById('flashbang');
    if (flash) flash.style.opacity = '0';

    // Tutup panel debug bila terbuka saat permainan berakhir
    try {
        if (debugPanelOpen) setDebugPanelOpen(false);
    } catch (e) { /* abaikan bila belum tersedia */ }

    updatePowerupHUD();
}

function activateEndBlackout(isWin) {
    const blackout = document.getElementById('game-blackout');
    const title = document.getElementById('blackout-title');
    const sub = document.getElementById('blackout-sub');
    if (!blackout) return;

    blackout.classList.remove('win', 'lose');
    blackout.classList.add(isWin ? 'win' : 'lose');
    if (title) title.innerText = isWin ? 'CONGRATULATIONS!' : 'GAME OVER';
    if (sub) sub.innerText = isWin ? 'All Levels cleared' : 'You lose all your lives.';

    void blackout.offsetWidth; // paksa reflow agar animasi teks berjalan ulang
    blackout.classList.add('active');
}

function deactivateEndBlackout() {
    const blackout = document.getElementById('game-blackout');
    if (blackout) blackout.classList.remove('active', 'win', 'lose');

    // Sembunyikan juga tombol pilihan supaya animasi kemunculannya bisa
    // berjalan ulang saat Game Over berikutnya.
    hideEndChoices();

    // Lepaskan fokus keyboard dari tombol pilihan agar Enter/Space tidak
    // dapat memicunya lagi setelah layar ini ditutup.
    ['blackout-retry-btn', 'blackout-menu-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });
}

// Tampilkan dua tombol pilihan pada layar Game Over (dipanggil oleh endGame(false)).
// Tombol masuk dengan animasi staggered yang diatur di css (#blackout-actions).
function showEndChoices() {
    const actions = document.getElementById('blackout-actions');
    if (actions) actions.classList.add('visible');
}

// ==========================================
// DIALOG KONFIRMASI MENU PAUSE ("Yakin ingin ...?")
// ==========================================
// Saat pemain menekan tombol berdampak di menu pause (RESTART / MAIN MENU),
// tampilkan dialog konfirmasi terlebih dahulu. Aksi hanya dijalankan bila
// pemain menekan tombol "YA" (atau Enter). Menekan "BATAL" / Escape / klik
// di luar kartu akan menutup dialog dan tetap berada di menu pause.
let _pauseConfirmAction = null; // aksi tertunda yang dijalankan bila dikonfirmasi
let _pauseConfirmOpen = false;  // status dialog (dibaca oleh handler keyboard)

function openPauseConfirm(title, desc, action) {
    const overlay = document.getElementById('pause-confirm-overlay');
    if (!overlay) {
        // Fallback: markup dialog tidak ditemukan — jalankan aksi langsung.
        if (typeof action === 'function') action();
        return;
    }

    _pauseConfirmAction = action;

    const titleEl = document.getElementById('pause-confirm-title');
    const descEl = document.getElementById('pause-confirm-desc');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;

    overlay.classList.remove('open');
    void overlay.offsetWidth; // paksa reflow agar animasi pop-in berjalan ulang
    overlay.classList.add('open');
    _pauseConfirmOpen = true;

    // Fokuskan tombol "YA" agar Enter langsung mengonfirmasi & navigasi Tab bekerja.
    const yesBtn = document.getElementById('pause-confirm-yes');
    if (yesBtn) yesBtn.focus();
}

function closePauseConfirm() {
    const overlay = document.getElementById('pause-confirm-overlay');
    if (overlay) overlay.classList.remove('open');
    _pauseConfirmAction = null;
    _pauseConfirmOpen = false;

    // Lepaskan fokus dari tombol dialog agar Enter/Space tidak memicunya lagi
    // setelah dialog ditutup (mis. saat shortcut resume Space ditekan).
    ['pause-confirm-yes', 'pause-confirm-no'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });
}

function confirmPauseAction() {
    const action = _pauseConfirmAction;
    closePauseConfirm(); // tutup dialog dulu agar aksi mulai dari state bersih
    if (typeof action === 'function') action();
}

// ==========================================
// TRANSISI SINEMATIK KELUAR MENU PAUSE
// ==========================================
// Saat pemain mengkonfirmasi aksi berdampak di menu pause (RESTART / MAIN MENU),
// layar MENGHITAM DULU lewat layer #level-transition (fade-to-black sinematik),
// baru aksi dijalankan setelah hitam penuh. Dengan begitu pindah lantai / kembali
// ke menu tidak terasa kasar dan frame beku permainan yang dijeda tidak terlihat.
let _pauseBlackoutActive = false; // anti double-trigger untuk transisi ini

const PAUSE_BLACKOUT_MS = 650;   // durasi layar menghitam (fade layer hitam)
// Aksi dijalankan setelah layar sudah hitam penuh (650ms) + jeda tipis agar transisi bersih.
const PAUSE_ACTION_DELAY_MS = 800;

function pauseActionWithBlackout(action) {
    if (_pauseBlackoutActive) return;
    _pauseBlackoutActive = true;

    // Keluar dari sesi game: hentikan loop & nonaktifkan input, karena aksi
    // (restart / main menu) selalu meninggalkan gameplay yang sedang dijeda.
    gameActive = false;
    isPaused = false;

    // Lepaskan fokus dari tombol dialog/menu pause agar Enter/Space tidak
    // memicu klik ganda saat layar sedang menghitam.
    ['pause-confirm-yes', 'pause-confirm-no', 'restart-btn', 'menu-main-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });

    // Layar MENGHITAM DULU — pakai layer #level-transition (hitam penuh,
    // z-index 120: di atas menu pause, di bawah map intro nama level).
    const transitionEl = document.getElementById('level-transition');
    if (transitionEl) {
        transitionEl.style.transition = `opacity ${PAUSE_BLACKOUT_MS}ms ease`;
        transitionEl.style.opacity = '';
        transitionEl.classList.remove('active');
        void transitionEl.offsetWidth; // restart animasi bila layer baru saja dipakai
        transitionEl.classList.add('active');
    }

    // Hitam penuh → baru jalankan aksi yang dipilih.
    setTimeout(() => {
        _pauseBlackoutActive = false;
        if (typeof action === 'function') action();
    }, PAUSE_ACTION_DELAY_MS);
}

// Angkat layer hitam transisi pause (dipanggil oleh aksi setelah perpindahan
// mulai berjalan — mis. map intro level baru sudah tampil di atas hitam, atau
// menu utama sudah terbuka di balik layer hitam).
function fadeOutPauseBlackout() {
    const transitionEl = document.getElementById('level-transition');
    if (!transitionEl) return;
    transitionEl.style.transition = 'opacity 0.7s ease';
    transitionEl.style.opacity = '0';
    transitionEl.classList.remove('active');
    setTimeout(() => {
        transitionEl.style.transition = '';
        transitionEl.style.opacity = '';
    }, 750);
}

// Sembunyikan kembali tombol pilihan pada layer hitam akhir permainan.
function hideEndChoices() {
    const actions = document.getElementById('blackout-actions');
    if (actions) actions.classList.remove('visible');
}

// Event Listeners for Buttons and Controls
document.getElementById('start-btn').addEventListener('click', () => {
    const btn = document.getElementById('start-btn');

    // Resume ketika tombol berlabel 'RESUME' (dipasang oleh pauseGame())
    // atau 'LANJUTKAN' (label lama / fallback).
    if (btn.innerText === 'RESUME' || btn.innerText === 'LANJUTKAN') {
        resumeGame();
    } else {
        // Tombol 'MULAI JELAJAH' dari overlay lama tidak lagi digunakan di alur menu baru,
        // tapi tetap dibiarkan sebagai fallback.
        if (typeof MenuManager !== 'undefined') {
            MenuManager.openMainMenu();
        }
    }
});

document.getElementById('restart-btn').addEventListener('click', () => {
    // Minta konfirmasi dulu ("Yakin ingin Restart?") — restart mengulang level
    // dari awal sehingga progres pellet floor ini hilang.
    openPauseConfirm(
        'Are you sure you want to restart?',
        'The level will be restarted from the beginning. Your progress on this floor will be lost.',
        () => {
            // Layar menghitam dulu, lalu restart level dari awal. startGame()
            // mereset sesi & menampilkan map intro di atas layer hitam, jadi
            // layer hitam bisa langsung kita angkat.
            pauseActionWithBlackout(() => {
                startGame(currentLevel);
                fadeOutPauseBlackout();
            });
        }
    );
});

// ==========================================
// TRANSISI SINEMATIK KELUAR LAYAR GAME OVER
// ==========================================
// Saat pemain memilih PLAY AGAIN / BACK TO MENU pada layar GAME OVER, layar
// MENGHITAM DULU (layer #level-transition, z-index 120 — di atas layar game
// over yang z 45) sehingga teks & tombol memudar ke hitam sinematik. Aksi
// baru dijalankan setelah hitam penuh, sehingga perpindahan kembali ke
// main game / menu utama tidak terasa kasar.
let _gameOverBlackoutActive = false; // anti double-trigger untuk transisi ini

const GAME_OVER_BLACKOUT_MS = 650;      // durasi layar menghitam (fade hitam)
const GAME_OVER_MUSIC_FADE_MS = 1000;   // durasi fade-out BGM game (ambient)
const GAME_OVER_MUSIC_FADE_DELAY_MS = 200; // BGM mulai fade SETELAH layar mulai menghitam
// Aksi dijalankan setelah hitam penuh (650ms) DAN fade BGM selesai
// (200ms + 1000ms = 1200ms) → 1250ms memberi jeda tipis agar audio bersih.
const GAME_OVER_ACTION_DELAY_MS = 1250; // aksi berjalan setelah hitam penuh + fade selesai

function gameOverActionWithBlackout(action) {
    if (_gameOverBlackoutActive) return;
    _gameOverBlackoutActive = true;

    // Lepaskan fokus dari tombol agar Enter/Space tidak memicu klik ganda,
    // dan blokir klik menembus ke tombol selama layar sedang menghitam.
    ['blackout-retry-btn', 'blackout-menu-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn && document.activeElement === btn) btn.blur();
    });
    const blackout = document.getElementById('game-blackout');
    if (blackout) blackout.style.pointerEvents = 'none';

    // 1) LAYAR MENGHITAM DULU — pakai layer #level-transition (hitam penuh,
    //    z-index 120: di atas blackout game over, di bawah map intro nama level).
    const transitionEl = document.getElementById('level-transition');
    if (transitionEl) {
        transitionEl.style.transition = `opacity ${GAME_OVER_BLACKOUT_MS}ms ease`;
        transitionEl.style.opacity = '';
        transitionEl.classList.remove('active');
        void transitionEl.offsetWidth; // restart animasi bila layer baru dipakai
        transitionEl.classList.add('active');
    }

    // 2) LALU BGM GAME DI-FADE — mulai setelah layar mulai menghitam, sehingga
    //    musik mengecil bersamaan dengan layar yang menggelap.
    setTimeout(() => {
        if (typeof fadeOutAmbientMusic === 'function') {
            fadeOutAmbientMusic(GAME_OVER_MUSIC_FADE_MS);
        }
    }, GAME_OVER_MUSIC_FADE_DELAY_MS);

    // 3) Setelah hitam penuh → tutup layar GAME OVER (sembunyikan teks/tombol
    //    yang kini sudah tertutup oleh layer hitam di atasnya).
    setTimeout(() => deactivateEndBlackout(), GAME_OVER_BLACKOUT_MS);

    // 4) Hitam penuh & musik nyaris senyap → jalankan aksi yang dipilih.
    setTimeout(() => {
        _gameOverBlackoutActive = false;
        if (blackout) blackout.style.pointerEvents = '';
        if (typeof action === 'function') action();
    }, GAME_OVER_ACTION_DELAY_MS);
}

// Angkat layer hitam setelah aksi game over mulai berjalan (mis. map intro
// level baru sudah tampil di atas hitam, atau menu utama sudah dibuka di
// balik layer hitam).
function fadeOutGameOverBlackout() {
    const transitionEl = document.getElementById('level-transition');
    if (!transitionEl) return;
    transitionEl.style.transition = 'opacity 0.7s ease';
    transitionEl.style.opacity = '0';
    transitionEl.classList.remove('active');
    setTimeout(() => {
        transitionEl.style.transition = '';
        transitionEl.style.opacity = '';
    }, 750);
}

// Pilihan pada layar GAME OVER (dimunculkan oleh showEndChoices()):
const blackoutRetryBtn = document.getElementById('blackout-retry-btn');
if (blackoutRetryBtn) {
    blackoutRetryBtn.addEventListener('click', () => {
        // "Play Again": layar menghitam dulu, lalu mainkan ulang level yang
        // sama dari awal (nyawa kembali 5). startGame() sendiri memanggil
        // deactivateEndBlackout(), mengincrement _endFlowToken (membatalkan
        // timer flow akhir yang tersisa), lalu menampilkan map intro sebelum
        // control dikunci kembali. Map intro (z 200) tampil di atas hitam,
        // jadi layer hitam bisa segera kita angkat.
        gameOverActionWithBlackout(() => {
            startGame(currentLevel);
            fadeOutGameOverBlackout();
        });
    });
}

const blackoutMenuBtn = document.getElementById('blackout-menu-btn');
if (blackoutMenuBtn) {
    blackoutMenuBtn.addEventListener('click', () => {
        // "Back to Menu": layar menghitam dulu, lalu menu utama dibuka di
        // balik layer hitam (z-index 50 > blackout 45, tetapi < level-transition
        // 120), sehingga menu tampil sinematik saat layer hitam diangkat.
        gameOverActionWithBlackout(() => {
            if (typeof MenuManager !== 'undefined') {
                MenuManager.openMainMenu();
            }
            fadeOutGameOverBlackout();
        });
    });
}

// Tombol-tombol pada overlay "YOU'VE ESCAPED" (dimunculkan showEscapeOverlay()):
//   • CONTINUE           -> lanjut ke level berikutnya (hanya tampil level non-akhir)
//   • PLAY AGAIN         -> ulangi level ini dari awal (hanya tampil di level akhir)
//   • BACK TO MAIN MENU  -> kembali ke menu utama (selalu tampil)
const escapeContinueBtn = document.getElementById('escape-continue-btn');
if (escapeContinueBtn) {
    escapeContinueBtn.addEventListener('click', continueToNextLevel);
}

const escapeRetryBtn = document.getElementById('escape-retry-btn');
if (escapeRetryBtn) {
    escapeRetryBtn.addEventListener('click', () => {
        // "Play Again" (level akhir): layar menghitam + ambient2 fade dulu,
        // lalu mainkan ulang level yang sama dari awal (nyawa kembali 5).
        escapeActionWithBlackout(() => {
            // startGame() sendiri mereset statistik sesi, menutup overlay ini,
            // mengincrement _escapeFlowToken (membatalkan timer flow escape yang
            // tersisa), lalu menampilkan map intro sebelum control dikunci kembali.
            startGame(currentLevel);

            // Map intro tampil di atas layer hitam → angkat hitam perlahan.
            fadeOutEscapeBlackout();
        });
    });
}

const escapeMenuBtn = document.getElementById('escape-menu-btn');
if (escapeMenuBtn) {
    escapeMenuBtn.addEventListener('click', backToMainMenuFromEscape);
}

// Tombol Menu Utama (saat pause)
const menuMainBtnEl = document.getElementById('menu-main-btn');
if (menuMainBtnEl) {
    menuMainBtnEl.addEventListener('click', () => {
        // Minta konfirmasi dulu ("Yakin ingin kembali ke Main Menu?") — keluar
        // menghentikan permainan yang sedang berjalan.
        openPauseConfirm(
            'Are you sure you want to go back to the main menu?',
            'The current game will be stopped and your progress will not be saved.',
            () => {
                // Layar menghitam dulu, baru kembali ke menu utama (agar transisi
                // keluar permainan terasa sinematik dan tidak terlihat kasar).
                pauseActionWithBlackout(() => {
                    gameActive = false;
                    isPaused = false;
                    isDying = false;
                    // Batalkan victory lap / overlay escape yang mungkin sedang
                    // menunggu (pemain keluar ke menu dari menu pause).
                    escapeEnding = false;
                    ++_escapeFlowToken;
                    hideEscapeOverlay();
                    if (controls.isLocked) controls.unlock();
                    if (typeof stopMonsterAudio === 'function') stopMonsterAudio();

                    // Bersihkan UI gameplay & render lama agar menu tidak menyisakan
                    // minimap atau gambar labirin terakhir di belakangnya.
                    document.body.classList.remove('in-game');
                    sceneReady = false;
                    clearGameplayUIState();
                    deactivateEndBlackout();

                    document.getElementById('overlay-screen').style.display = 'none';
                    if (typeof MenuManager !== 'undefined') {
                        MenuManager.openMainMenu();
                    }

                    // Menu utama sudah terbuka di balik layer hitam → angkat hitam perlahan.
                    fadeOutPauseBlackout();
                });
            }
        );
    });
}

// Tombol dialog konfirmasi pause ("Yakin ingin ...?")
const pauseConfirmOverlayEl = document.getElementById('pause-confirm-overlay');
if (pauseConfirmOverlayEl) {
    const confirmYesBtn = document.getElementById('pause-confirm-yes');
    const confirmNoBtn = document.getElementById('pause-confirm-no');
    if (confirmYesBtn) confirmYesBtn.addEventListener('click', confirmPauseAction);
    if (confirmNoBtn) confirmNoBtn.addEventListener('click', closePauseConfirm);

    // Klik area gelap di luar kartu dianggap batal.
    pauseConfirmOverlayEl.addEventListener('click', (e) => {
        if (e.target === pauseConfirmOverlayEl) closePauseConfirm();
    });
}

controls.addEventListener('unlock', () => {
    if (gameActive && !isPaused) {
        pauseGame();
    }
});

controls.addEventListener('lock', () => {
    if (gameActive) {
        isPaused = false;
        document.getElementById('overlay-screen').style.display = 'none';
        prevTime = performance.now();
        if (typeof resumeAmbientMusic === 'function') resumeAmbientMusic();
    }
});

function resizeRendererToViewport() {
    const vp = getViewportSize();
    camera.aspect = vp.width / vp.height;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.width, vp.height, false);
}

window.addEventListener('resize', resizeRendererToViewport, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(resizeRendererToViewport, 120), { passive: true });
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resizeRendererToViewport, { passive: true });
}

document.addEventListener('contextmenu', (e) => {
    if (gameActive && isMobileControl) e.preventDefault();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive && !isPaused && !isDying) pauseGame();
});

// Listener WebGL context-lost sudah dipasang di attachRendererContextListeners()
// supaya tetap aktif setelah renderer dibuat ulang (ganti Graphics Quality).

// Start loop
animate();