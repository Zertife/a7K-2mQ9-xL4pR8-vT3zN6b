// ==========================================
// HOTEL MAZE GENERATOR & PATHFINDING
// ==========================================

// 4 arah langkah lorong (jarak 2 sel) untuk node genap/ganjil.
// Diangkat jadi konstanta modul agar tidak dialokasikan ulang per-sel
// dan dipakai bersama DFS + dead-end removal (hemat alokasi & jelas).
const MAZE_STEP_DIRS = [[0, -2], [0, 2], [-2, 0], [2, 0]];

// Fisher-Yates shuffle in-place. Lebih cepat, seragam (tak bias) daripada
// Array.prototype.sort(() => Math.random() - 0.5), dan menerima RNG yang
// bisa disuntikkan (Math.random atau PRNG sekuensial) untuk hasil déterministic.
function shuffleArray(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}

// ==========================================
// SIMETRI KIRI-KANAN
// ==========================================
// Menyalin grid[y][x] -> grid[y][mx] (mx = cermin dari x) untuk membuat
// labirin simetris kiri-kanan. Kolom-kolom di sekitar tengah (centerBand)
// punya PELUANG untuk dilewati (tidak di-mirror), sehingga area tengah
// terasa "setengah random - setengah simetris", bukan simetri kaku 100%.
//
// PENTING: dipanggil SETELAH semua langkah yang mengandung RNG (DFS carve,
// cross-connect, dead-end removal), supaya hasil akhirnya benar-benar
// simetris dan tidak dirusak lagi oleh RNG berikutnya.
//
// centerBandWidth     : lebar (dalam sel) area tengah yang "semi-random".
//                        0 = simetri sempurna di seluruh grid.
// centerSymmetryChance: peluang (0..1) sel di center band TETAP di-mirror.
//                        1 = center band ikut simetris sepenuhnya.
//                        0 = center band sepenuhnya independen/acak.
function applyLeftRightSymmetry(grid, size, rng, centerBandWidth = 4, centerSymmetryChance = 0.5) {
    const centerX = (size - 1) / 2;

    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            const mx = size - 1 - x;
            if (mx <= x) continue; // hanya proses separuh kiri; kolom pusat (mx===x) dibiarkan apa adanya

            const distFromCenter = Math.abs(x - centerX);
            const inCenterBand = distFromCenter <= centerBandWidth / 2;

            if (inCenterBand && rng() >= centerSymmetryChance) {
                continue; // sengaja dilewati -> sisi kanan tetap hasil generate aslinya di area tengah
            }

            grid[y][mx] = grid[y][x];
        }
    }
}

function generateHotelMaze(size, rng = Math.random, symmetryOptions = {}) {
    const {
        enabled = true,
        centerBandWidth = 4,
        centerSymmetryChance = 0.5
    } = symmetryOptions;

    let grid = Array(size).fill().map(() => Array(size).fill(1));

    // Langkah 1: DFS Spanning Tree (Nodes ganjil 1, 3, 5, ... size-2).
    // Pencarian ITERATIF dengan stack eksplisit (tak ada risiko stack
    // overflow pada grid besar) + Fisher-Yates di atas array scratch
    // (order) yang dialokasikan sekali saja.
    grid[1][1] = 0;
    const stack = [[1, 1]];
    const order = [0, 1, 2, 3];
    while (stack.length) {
        const top = stack[stack.length - 1];
        const x = top[0];
        const y = top[1];
        shuffleArray(order, rng);

        let moved = false;
        for (let k = 0; k < order.length; k++) {
            const dx = MAZE_STEP_DIRS[order[k]][0];
            const dy = MAZE_STEP_DIRS[order[k]][1];
            const nx = x + dx;
            const ny = y + dy;
            if (nx > 0 && nx < size - 1 && ny > 0 && ny < size - 1 && grid[ny][nx] === 1) {
                grid[y + dy / 2][x + dx / 2] = 0;
                grid[ny][nx] = 0;
                stack.push([nx, ny]);
                moved = true;
                break;
            }
        }
        if (!moved) stack.pop();
    }

    // Langkah 2: Buat lorong hotel utama (Main Corridors / Long Wings).
    // Dibuat simetris by design: avenue tengah tetap di tengah, avenue
    // "samping" dibuat sepasang cermin (leftAvenue <-> rightAvenue)
    // alih-alih dua angka acak yang tidak simetris (5 vs size-7).
    const centerAvenue = Math.floor(size / 2) | 1;
    const leftAvenue = 5;
    const rightAvenue = size - 1 - leftAvenue;
    const mainAvenues = [centerAvenue, leftAvenue, rightAvenue];

    for (let avenue of mainAvenues) {
        if (avenue > 0 && avenue < size - 1) {
            for (let x = 1; x < size - 1; x++) {
                grid[avenue][x] = 0;
            }
            for (let y = 1; y < size - 1; y++) {
                grid[y][avenue] = 0;
            }
        }
    }

    // Langkah 3: Tambahkan BANYAK sambungan silang antar lorong
    // (Interconnected Loops). Masih pakai RNG bebas di seluruh grid —
    // sisi kanan akan diratakan/di-mirror di Langkah 5.
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (grid[y][x] === 1) {
                const isHorizontalWall = (x % 2 === 0 && y % 2 === 1);
                const isVerticalWall = (x % 2 === 1 && y % 2 === 0);

                if (isHorizontalWall && grid[y][x - 1] === 0 && grid[y][x + 1] === 0) {
                    if (rng() < 0.38) {
                        grid[y][x] = 0;
                    }
                } else if (isVerticalWall && grid[y - 1][x] === 0 && grid[y + 1][x] === 0) {
                    if (rng() < 0.38) {
                        grid[y][x] = 0;
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------
    // Langkah 3.5: Bersihkan dinding tunggal yang mengambang
    // Setelah Langkah 3, banyak dinding non-pilar jadi terputus dari
    // dinding lain (dikelilingi ruang terbuka di >=3 sisi). Secara
    // visual ini muncul sebagai "petak dinding" acak yang tidak
    // membentuk penyekat nyata. Kita ratakan jadi lantai saja.
    // ------------------------------------------------------------
    removeFloatingSingleWalls(grid, size);

    // Langkah 4: Hilangkan SEMUA jalan buntu (Dead-Ends removal)
    for (let pass = 0; pass < 3; pass++) {
        for (let y = 1; y < size - 1; y += 2) {
            for (let x = 1; x < size - 1; x += 2) {
                if (grid[y][x] !== 0) continue;

                const neighborDirs = MAZE_STEP_DIRS;
                let openCount = 0;
                let closedWalls = [];

                for (let [dx, dy] of neighborDirs) {
                    let nx = x + dx, ny = y + dy;
                    if (nx <= 0 || nx >= size - 1 || ny <= 0 || ny >= size - 1) continue;
                    let wx = x + dx / 2, wy = y + dy / 2;
                    if (grid[wy][wx] === 0) {
                        openCount++;
                    } else {
                        closedWalls.push([wx, wy]);
                    }
                }

                if (openCount <= 1 && closedWalls.length > 0) {
                    let [wx, wy] = closedWalls[Math.floor(rng() * closedWalls.length)];
                    grid[wy][wx] = 0;
                }
            }
        }
    }

    // ------------------------------------------------------------
    // Langkah 5 (BARU): Ratakan jadi simetris kiri-kanan, dengan center
    // band setengah-random. Ditaruh SETELAH semua langkah berbasis RNG
    // di atas selesai (DFS, cross-connect, dead-end removal), supaya
    // hasil final yang disalin ke sisi kanan sudah "matang" — bukan
    // sisa carve mentah yang belum lolos dead-end removal.
    // ------------------------------------------------------------
    if (enabled) {
        applyLeftRightSymmetry(grid, size, rng, centerBandWidth, centerSymmetryChance);
    }

    // Jalankan sekali lagi setelah dead-end removal & mirror, karena
    // pass-pass di atas bisa membuka/menyalin dinding baru yang
    // lagi-lagi jadi terisolasi (terutama di tepi center band, area
    // yang sengaja tidak ikut di-mirror).
    removeFloatingSingleWalls(grid, size, 1);

    // Pastikan sudut pilar genap-genap (even, even) tetap solid.
    // Ini otomatis tetap simetris karena murni berdasarkan koordinat,
    // tidak terpengaruh RNG maupun proses mirror.
    for (let y = 2; y < size - 1; y += 2) {
        for (let x = 2; x < size - 1; x += 2) {
            grid[y][x] = 1;
        }
    }

    // Pastikan area Safe Zone (3x3: x 1..3, y 1..3) lapang, luas, dan bebas pilar
    for (let sy = SAFE_ZONE_MIN_Z; sy <= SAFE_ZONE_MAX_Z; sy++) {
        for (let sx = SAFE_ZONE_MIN_X; sx <= SAFE_ZONE_MAX_X; sx++) {
            grid[sy][sx] = 0;
        }
    }

    // Buka akses pintu keluar dari safe zone ke lorong penghubung labirin
    for (let i = SAFE_ZONE_MIN_X; i <= SAFE_ZONE_MAX_X; i++) {
        if (SAFE_ZONE_MAX_X + 1 < size - 1) grid[i][SAFE_ZONE_MAX_X + 1] = 0;
        if (SAFE_ZONE_MAX_Z + 1 < size - 1) grid[SAFE_ZONE_MAX_Z + 1][i] = 0;
    }

    return grid;
}

// Menghapus dinding non-pilar yang sudah terputus dari dinding lain
// (dikelilingi ruang terbuka di >=3 dari 4 sisi), karena secara
// fungsional dinding seperti itu bukan lagi penyekat, cuma "sisa" 1 petak
// yang bikin labirin terlihat berantakan.
function removeFloatingSingleWalls(grid, size, passes = 2) {
    for (let pass = 0; pass < passes; pass++) {
        for (let y = 1; y < size - 1; y++) {
            for (let x = 1; x < size - 1; x++) {
                if (grid[y][x] !== 1) continue;
                // Jangan sentuh pilar sudut (x genap & y genap) — itu memang solid & disengaja
                if (x % 2 === 0 && y % 2 === 0) continue;

                let openCount = 0;
                if (grid[y - 1][x] === 0) openCount++;
                if (grid[y + 1][x] === 0) openCount++;
                if (grid[y][x - 1] === 0) openCount++;
                if (grid[y][x + 1] === 0) openCount++;

                if (openCount >= 3) {
                    grid[y][x] = 0;
                }
            }
        }
    }
}



// ==========================================
// COLLISION DETECTION & PATHFINDING
// ==========================================
function isWallAt(x, z, radius = 0.45) {
    const points = [
        { x: x - radius, z: z - radius },
        { x: x + radius, z: z - radius },
        { x: x - radius, z: z + radius },
        { x: x + radius, z: z + radius }
    ];

    for (let p of points) {
        let gx = Math.floor((p.x + CELL_SIZE / 2) / CELL_SIZE);
        let gz = Math.floor((p.z + CELL_SIZE / 2) / CELL_SIZE);

        if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return true;
        if (maze[gz][gx] === 1) return true;
    }
    return false;
}

function isOpenCell(gx, gz) {
    return gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE && maze[gz][gx] === 0;
}

function clampGridCoord(v) {
    return Math.max(0, Math.min(GRID_SIZE - 1, v));
}



function bfsPath(startX, startZ, endX, endZ) {
    startX = clampGridCoord(startX);
    startZ = clampGridCoord(startZ);
    endX = clampGridCoord(endX);
    endZ = clampGridCoord(endZ);

    if (!isOpenCell(startX, startZ) || !isOpenCell(endX, endZ)) return null;
    if (startX === endX && startZ === endZ) return [[startX, startZ]];

    let visited = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false));
    let parent = {};
    let queue = [[startX, startZ]];
    let qHead = 0;
    visited[startZ][startX] = true;
    let found = false;

    while (qHead < queue.length) {
        let [x, z] = queue[qHead++];
        if (x === endX && z === endZ) { found = true; break; }

        const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
        for (let [nx, nz] of neighbors) {
            if (isOpenCell(nx, nz) && !visited[nz][nx]) {
                visited[nz][nx] = true;
                parent[nx + ',' + nz] = [x, z];
                queue.push([nx, nz]);
            }
        }
    }

    if (!found) return null;

    let path = [[endX, endZ]];
    let cur = [endX, endZ];
    while (!(cur[0] === startX && cur[1] === startZ)) {
        cur = parent[cur[0] + ',' + cur[1]];
        if (!cur) return null;
        path.push(cur);
    }
    path.reverse();
    return path;
}

function bfsPathAvoiding(startX, startZ, endX, endZ, avoidFn) {
    startX = clampGridCoord(startX);
    startZ = clampGridCoord(startZ);
    endX = clampGridCoord(endX);
    endZ = clampGridCoord(endZ);

    if (!isOpenCell(startX, startZ) || !isOpenCell(endX, endZ)) return null;
    if (startX === endX && startZ === endZ) return [[startX, startZ]];

    const visited = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(false));
    const parent = {};
    const queue = [[startX, startZ]];
    let qHead = 0;
    visited[startZ][startX] = true;

    while (qHead < queue.length) {
        const [x, z] = queue[qHead++];
        const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];

        for (const [nx, nz] of neighbors) {
            if (!isOpenCell(nx, nz) || visited[nz][nx]) continue;
            if (avoidFn && avoidFn(nx, nz)) continue;

            visited[nz][nx] = true;
            parent[nx + ',' + nz] = [x, z];
            if (nx === endX && nz === endZ) {
                const path = [[endX, endZ]];
                let current = [endX, endZ];
                while (!(current[0] === startX && current[1] === startZ)) {
                    current = parent[current[0] + ',' + current[1]];
                    if (!current) return null;
                    path.push(current);
                }
                path.reverse();
                return path;
            }
            queue.push([nx, nz]);
        }
    }

    return null;
}

// ---------------------------------------------------------------------
// FIX: buildApproachField sekarang juga menghitung `gateOf`, yaitu peta
// "gate terdekat" untuk setiap sel berdasarkan JARAK KORIDOR ASLI (BFS
// multi-source dari semua gate), bukan jarak garis lurus (Manhattan).
// Jarak garis lurus salah total di labirin penuh tembok — sebuah sel
// bisa "kelihatan" dekat ke sebuah gate padahal sebenarnya harus memutar
// jauh untuk mencapainya lewat koridor.
// ---------------------------------------------------------------------
function buildApproachField(targetX, targetZ, maxDistance = GRID_SIZE * GRID_SIZE) {
    targetX = clampGridCoord(targetX);
    targetZ = clampGridCoord(targetZ);
    const distOf = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(-1));
    const queue = [];

    if (isOpenCell(targetX, targetZ)) {
        distOf[targetZ][targetX] = 0;
        queue.push([targetX, targetZ]);
    }

    for (let head = 0; head < queue.length; head++) {
        const [x, z] = queue[head];
        if (distOf[z][x] >= maxDistance) continue;

        for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
            if (isOpenCell(nx, nz) && distOf[nz][nx] === -1) {
                distOf[nz][nx] = distOf[z][x] + 1;
                queue.push([nx, nz]);
            }
        }
    }

    // A gate is a corridor branch that can serve as a distinct approach route.
    const intercepts = [];
    let nextGateId = 0;
    for (let z = 0; z < GRID_SIZE; z++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (distOf[z][x] < 4 || distOf[z][x] > 10) continue;
            const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]
                .filter(([nx, nz]) => isOpenCell(nx, nz));
            if (neighbors.length >= 3) {
                intercepts.push({ id: 'gate-' + nextGateId++, interceptX: x, interceptZ: z });
            }
        }
    }

    // Multi-source BFS dari SEMUA gate sekaligus: setiap sel yang bisa
    // dijangkau diberi label gate terdekat berdasarkan jarak koridor
    // sebenarnya (bukan garis lurus).
    const gateOf = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(null));
    const gateDist = Array(GRID_SIZE).fill().map(() => Array(GRID_SIZE).fill(-1));
    const gateQueue = [];
    for (const gate of intercepts) {
        gateOf[gate.interceptZ][gate.interceptX] = gate.id;
        gateDist[gate.interceptZ][gate.interceptX] = 0;
        gateQueue.push([gate.interceptX, gate.interceptZ]);
    }
    for (let head = 0; head < gateQueue.length; head++) {
        const [x, z] = gateQueue[head];
        const g = gateOf[z][x];
        for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
            if (isOpenCell(nx, nz) && gateOf[nz][nx] === null) {
                gateOf[nz][nx] = g;
                gateDist[nz][nx] = gateDist[z][x] + 1;
                gateQueue.push([nx, nz]);
            }
        }
    }

    return { distOf, intercepts, gateOf, gateDist };
}

// FIX: sebelumnya fungsi ini memilih gate terdekat berdasarkan jarak
// Manhattan (garis lurus), yang tidak memperhitungkan tembok sama sekali.
// Sekarang cukup baca hasil BFS multi-source `gateOf` yang sudah dihitung
// di buildApproachField — hasilnya konsisten dengan jarak koridor asli.
function getGateIdAt(field, x, z) {
    if (!field || !field.gateOf) return null;
    const row = field.gateOf[z];
    if (!row) return null;
    const g = row[x];
    return g === undefined ? null : g;
}
