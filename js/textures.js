// ==========================================
// PROCEDURAL 3D PBR TEXTURE ENGINE
// Generates Diffuse, Normal, Roughness, Metalness, and Bump Maps
// ==========================================

// Helper: Sobel Filter to generate high-quality Tangent-Space Normal Maps from Height Canvas
function createNormalMapFromHeightCanvas(heightCanvas, strength = 2.5) {
    const w = heightCanvas.width;
    const h = heightCanvas.height;
    const hCtx = heightCanvas.getContext('2d');
    const hData = hCtx.getImageData(0, 0, w, h).data;

    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = w;
    normalCanvas.height = h;
    const nCtx = normalCanvas.getContext('2d');
    const nImgData = nCtx.createImageData(w, h);
    const nData = nImgData.data;

    const getHeight = (x, y) => {
        x = (x + w) % w;
        y = (y + h) % h;
        const idx = (y * w + x) * 4;
        // Grayscale height value [0.0 - 1.0]
        return (hData[idx] * 0.299 + hData[idx + 1] * 0.587 + hData[idx + 2] * 0.114) / 255.0;
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // 3x3 Sobel Convolution
            const tl = getHeight(x - 1, y - 1);
            const t  = getHeight(x,     y - 1);
            const tr = getHeight(x + 1, y - 1);
            const l  = getHeight(x - 1, y);
            const r  = getHeight(x + 1, y);
            const bl = getHeight(x - 1, y + 1);
            const b  = getHeight(x,     y + 1);
            const br = getHeight(x + 1, y + 1);

            const dx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
            const dy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
            const dz = 1.0 / strength;

            // Normalize vector
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const nx = -dx / len;
            const ny = -dy / len;
            const nz = dz / len;

            const idx = (y * w + x) * 4;
            // Map tangent normal [-1, 1] to RGB [0, 255]
            nData[idx]     = Math.floor(((nx + 1.0) * 0.5) * 255);
            nData[idx + 1] = Math.floor(((ny + 1.0) * 0.5) * 255);
            nData[idx + 2] = Math.floor(((nz + 1.0) * 0.5) * 255);
            nData[idx + 3] = 255;
        }
    }

    nCtx.putImageData(nImgData, 0, 0);
    return normalCanvas;
}

// Helper to convert Canvas to THREE.CanvasTexture with wrapping & repeating
function makeTexture(canvas, repX = 1, repY = 1) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    return tex;
}

// ==========================================
// LEVEL 1: GRAND LUXURY HOTEL (3D PBR)
// ==========================================

function createHotelWallPBR() {
    const w = 512, h = 512;

    // 1. Diffuse (Color) Canvas
    const dCan = document.createElement('canvas');
    dCan.width = w; dCan.height = h;
    const dCtx = dCan.getContext('2d');

    // 2. Height Canvas (for Normal & Bump Maps)
    const hCan = document.createElement('canvas');
    hCan.width = w; hCan.height = h;
    const hCtx = hCan.getContext('2d');

    // 3. Roughness Canvas
    const rCan = document.createElement('canvas');
    rCan.width = w; rCan.height = h;
    const rCtx = rCan.getContext('2d');

    // 4. Metalness Canvas
    const mCan = document.createElement('canvas');
    mCan.width = w; mCan.height = h;
    const mCtx = mCan.getContext('2d');

    // --- Base Wallpaper Area (0 to 330) ---
    // Diffuse
    const wallGrad = dCtx.createLinearGradient(0, 0, 512, 0);
    wallGrad.addColorStop(0, '#3a130c');
    wallGrad.addColorStop(0.5, '#63271a');
    wallGrad.addColorStop(1, '#3a130c');
    dCtx.fillStyle = wallGrad;
    dCtx.fillRect(0, 0, 512, 330);

    // Height & Roughness & Metalness defaults
    hCtx.fillStyle = '#808080'; // neutral base height (0.5)
    hCtx.fillRect(0, 0, 512, 512);

    rCtx.fillStyle = '#d0d0d0'; // matte wallpaper
    rCtx.fillRect(0, 0, 512, 330);

    mCtx.fillStyle = '#000000'; // non-metal
    mCtx.fillRect(0, 0, 512, 512);

    // Fabric Micro-Noise Grain
    for (let i = 0; i < 7000; i++) {
        const px = Math.random() * 512, py = Math.random() * 330;
        dCtx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        dCtx.fillRect(px, py, 2, 2);

        // Tactile micro-bump for wallpaper
        hCtx.fillStyle = Math.random() > 0.5 ? '#8a8a8a' : '#767676';
        hCtx.fillRect(px, py, 1.5, 1.5);
    }

    // 3D Damask Vertical Stripes & Embossed Gold Flourishes
    for (let x = 0; x < 512; x += 32) {
        // Soft Gold Diffuse Stripe
        const sGrad = dCtx.createLinearGradient(x, 0, x + 16, 0);
        sGrad.addColorStop(0, 'rgba(212, 175, 55, 0.02)');
        sGrad.addColorStop(0.5, 'rgba(212, 175, 55, 0.18)');
        sGrad.addColorStop(1, 'rgba(212, 175, 55, 0.02)');
        dCtx.fillStyle = sGrad;
        dCtx.fillRect(x, 0, 16, 330);

        // Embossed Height on Stripes
        hCtx.fillStyle = '#8c8c8c';
        hCtx.fillRect(x + 2, 0, 12, 330);

        // Micro Raised Diamonds
        dCtx.fillStyle = 'rgba(212, 175, 55, 0.28)';
        for (let y = 30; y < 330; y += 48) {
            dCtx.beginPath();
            dCtx.moveTo(x + 8, y - 7);
            dCtx.lineTo(x + 14, y);
            dCtx.lineTo(x + 8, y + 7);
            dCtx.lineTo(x + 2, y);
            dCtx.closePath();
            dCtx.fill();

            // Height Map: Raised Diamond
            hCtx.fillStyle = '#b8b8b8';
            hCtx.beginPath();
            hCtx.moveTo(x + 8, y - 7);
            hCtx.lineTo(x + 14, y);
            hCtx.lineTo(x + 8, y + 7);
            hCtx.lineTo(x + 2, y);
            hCtx.closePath();
            hCtx.fill();

            // Silk Sheen on Roughness
            rCtx.fillStyle = '#777777';
            rCtx.fill();
        }
    }

    // --- Crown Molding Top Architecture (0 to 22) ---
    // Diffuse
    const crownGrad = dCtx.createLinearGradient(0, 0, 0, 22);
    crownGrad.addColorStop(0, '#190804');
    crownGrad.addColorStop(0.3, '#3f1c0f');
    crownGrad.addColorStop(0.7, '#6b321e');
    crownGrad.addColorStop(1, '#200a05');
    dCtx.fillStyle = crownGrad;
    dCtx.fillRect(0, 0, 512, 18);

    // Crown Molding Metallic Gold Bead
    const goldGrad = dCtx.createLinearGradient(0, 18, 0, 22);
    goldGrad.addColorStop(0, '#fff4a8');
    goldGrad.addColorStop(0.4, '#d4af37');
    goldGrad.addColorStop(1, '#836515');
    dCtx.fillStyle = goldGrad;
    dCtx.fillRect(0, 18, 512, 4);

    // Height Profile: Stepped Extruded Crown Molding
    hCtx.fillStyle = '#f0f0f0'; // Highest ridge
    hCtx.fillRect(0, 0, 512, 6);
    hCtx.fillStyle = '#d5d5d5';
    hCtx.fillRect(0, 6, 512, 8);
    hCtx.fillStyle = '#aaaaaa';
    hCtx.fillRect(0, 14, 512, 4);
    hCtx.fillStyle = '#ffffff'; // Sharp gold bead
    hCtx.fillRect(0, 18, 512, 4);

    // Crown Roughness & Metalness
    rCtx.fillStyle = '#555555';
    rCtx.fillRect(0, 0, 512, 18);
    rCtx.fillStyle = '#222222'; // Shiny gold trim
    rCtx.fillRect(0, 18, 512, 4);
    mCtx.fillStyle = '#e8e8e8';
    mCtx.fillRect(0, 18, 512, 4);

    // --- Wood Wainscoting Lower Wall (330 to 512) ---
    // Diffuse
    const woodGrad = dCtx.createLinearGradient(0, 330, 0, 512);
    woodGrad.addColorStop(0, '#472215');
    woodGrad.addColorStop(0.4, '#31150b');
    woodGrad.addColorStop(1, '#180a04');
    dCtx.fillStyle = woodGrad;
    dCtx.fillRect(0, 330, 512, 182);

    // Wood Grain lines
    dCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    dCtx.lineWidth = 1.2;
    for (let i = 0; i < 50; i++) {
        dCtx.beginPath();
        const yStart = 330 + Math.random() * 182;
        dCtx.moveTo(0, yStart);
        dCtx.bezierCurveTo(170, yStart + (Math.random() * 8 - 4), 340, yStart + (Math.random() * 8 - 4), 512, yStart);
        dCtx.stroke();
    }

    // Chair Rail Molding at y = 325 to 335
    dCtx.fillStyle = goldGrad;
    dCtx.fillRect(0, 325, 512, 6);
    dCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    dCtx.fillRect(0, 331, 512, 6); // Deep drop shadow

    // Height: Extruded Chair Rail + Inset Shadow
    hCtx.fillStyle = '#ffffff'; // High protrusion
    hCtx.fillRect(0, 325, 512, 6);
    hCtx.fillStyle = '#303030'; // Sunken groove
    hCtx.fillRect(0, 331, 512, 6);

    rCtx.fillStyle = '#404040'; // Satin polished wood
    rCtx.fillRect(0, 330, 512, 182);
    rCtx.fillStyle = '#202020'; // Shiny gold chair rail
    rCtx.fillRect(0, 325, 512, 6);
    mCtx.fillStyle = '#dddddd';
    mCtx.fillRect(0, 325, 512, 6);

    // Helper: 3D Beveled Picture Frame Panel
    const draw3DPanel = (x, y, w, h) => {
        // Diffuse Frame
        dCtx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        dCtx.lineWidth = 4;
        dCtx.strokeRect(x, y, w, h);
        dCtx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
        dCtx.lineWidth = 2.5;
        dCtx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        dCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        dCtx.fillRect(x + 4, y + 4, w - 8, h - 8);

        // Height Map: Raised outer molding, beveled slope, sunken center
        hCtx.fillStyle = '#bbbbbb'; // Raised outer frame
        hCtx.fillRect(x, y, w, h);
        hCtx.fillStyle = '#666666'; // Bevel step
        hCtx.fillRect(x + 3, y + 3, w - 6, h - 6);
        hCtx.fillStyle = '#404040'; // Deep recessed panel
        hCtx.fillRect(x + 6, y + 6, w - 12, h - 12);

        // Roughness: Glossy frame highlight
        rCtx.fillStyle = '#222222';
        rCtx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    };

    draw3DPanel(30, 352, 100, 130);
    draw3DPanel(382, 352, 100, 130);

    // --- 3D Hotel Room Door & Frame (Center) ---
    // Diffuse Door Frame & Drop Shadow
    dCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    dCtx.fillRect(152, 52, 208, 280);

    dCtx.fillStyle = '#230e06';
    dCtx.fillRect(160, 60, 192, 270);
    dCtx.strokeStyle = goldGrad;
    dCtx.lineWidth = 4;
    dCtx.strokeRect(160, 60, 192, 270);

    // Height: Protruding Frame Architrave & Inset Door
    hCtx.fillStyle = '#202020'; // Outer seam shadow
    hCtx.fillRect(152, 52, 208, 280);
    hCtx.fillStyle = '#d0d0d0'; // Raised architrave trim
    hCtx.fillRect(156, 56, 200, 276);
    hCtx.fillStyle = '#707070'; // Door slab surface
    hCtx.fillRect(162, 62, 188, 268);

    // Door Recessed Panels
    draw3DPanel(176, 76, 160, 100);
    draw3DPanel(176, 188, 160, 122);

    // 3D Polished Brass "ROOM 101" Plaque
    const brassGrad = dCtx.createLinearGradient(224, 104, 288, 128);
    brassGrad.addColorStop(0, '#fff4a8');
    brassGrad.addColorStop(0.4, '#d4af37');
    brassGrad.addColorStop(1, '#7a5c12');

    dCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // Drop shadow
    dCtx.fillRect(224, 106, 64, 26);
    dCtx.fillStyle = brassGrad;
    dCtx.fillRect(226, 104, 60, 24);
    dCtx.strokeStyle = '#fff099';
    dCtx.lineWidth = 1.5;
    dCtx.strokeRect(226, 104, 60, 24);

    dCtx.fillStyle = '#170b00';
    dCtx.font = 'bold 10.5px "Outfit", "Times New Roman", serif';
    dCtx.textAlign = 'center';
    dCtx.fillText('ROOM 101', 256, 120);

    // Plaque Height & PBR
    hCtx.fillStyle = '#252525';
    hCtx.fillRect(224, 106, 64, 26);
    hCtx.fillStyle = '#e8e8e8'; // Protruding brass plaque
    hCtx.fillRect(226, 104, 60, 24);
    hCtx.fillStyle = '#ffffff'; // Raised lettering
    hCtx.font = 'bold 10.5px "Outfit", "Times New Roman", serif';
    hCtx.textAlign = 'center';
    hCtx.fillText('ROOM 101', 256, 120);

    rCtx.fillStyle = '#181818'; // High metallic polish
    rCtx.fillRect(226, 104, 60, 24);
    mCtx.fillStyle = '#ffffff'; // 100% metal
    mCtx.fillRect(226, 104, 60, 24);

    // 3D Brass Lever Handle & Escutcheon
    dCtx.fillStyle = 'rgba(0,0,0,0.5)';
    dCtx.fillRect(334, 207, 10, 32);
    dCtx.fillStyle = brassGrad;
    dCtx.fillRect(332, 204, 10, 32);
    dCtx.beginPath();
    dCtx.arc(337, 215, 6, 0, Math.PI * 2);
    dCtx.fill();
    dCtx.fillRect(312, 212, 25, 6); // Lever arm

    // Lever Height & PBR
    hCtx.fillStyle = '#e0e0e0';
    hCtx.fillRect(332, 204, 10, 32);
    hCtx.fillStyle = '#ffffff'; // Max protrusion
    hCtx.beginPath();
    hCtx.arc(337, 215, 6, 0, Math.PI * 2);
    hCtx.fill();
    hCtx.fillRect(312, 212, 25, 6);

    rCtx.fillStyle = '#151515';
    rCtx.fillRect(312, 204, 32, 34);
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(312, 204, 32, 34);

    // 3D Wall Sconce Lamp Fixture (Top Center)
    const sconceGlow = dCtx.createRadialGradient(256, 26, 2, 256, 26, 75);
    sconceGlow.addColorStop(0, 'rgba(255, 240, 180, 0.9)');
    sconceGlow.addColorStop(0.35, 'rgba(255, 195, 90, 0.35)');
    sconceGlow.addColorStop(1, 'rgba(255, 195, 90, 0)');
    dCtx.fillStyle = sconceGlow;
    dCtx.beginPath();
    dCtx.arc(256, 26, 75, 0, Math.PI * 2);
    dCtx.fill();

    // Sconce Brass Bracket
    dCtx.fillStyle = brassGrad;
    dCtx.fillRect(250, 30, 12, 16);
    // Sconce Glass Globe
    dCtx.beginPath();
    dCtx.arc(256, 24, 13, 0, Math.PI * 2);
    dCtx.fillStyle = '#ffffff';
    dCtx.fill();

    // Sconce Height
    hCtx.fillStyle = '#d8d8d8';
    hCtx.fillRect(250, 30, 12, 16);
    hCtx.fillStyle = '#ffffff'; // Bulging 3D glass hemisphere
    hCtx.beginPath();
    hCtx.arc(256, 24, 13, 0, Math.PI * 2);
    hCtx.fill();

    rCtx.fillStyle = '#101010';
    rCtx.beginPath();
    rCtx.arc(256, 24, 13, 0, Math.PI * 2);
    rCtx.fill();
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(250, 30, 12, 16);

    const normalCan = createNormalMapFromHeightCanvas(hCan, 3.2);

    return {
        map: makeTexture(dCan),
        normalMap: makeTexture(normalCan),
        bumpMap: makeTexture(hCan),
        roughnessMap: makeTexture(rCan),
        metalnessMap: makeTexture(mCan)
    };
}

function createHotelCarpetPBR() {
    const w = 512, h = 512;

    const dCan = document.createElement('canvas');
    dCan.width = w; dCan.height = h;
    const dCtx = dCan.getContext('2d');

    const hCan = document.createElement('canvas');
    hCan.width = w; hCan.height = h;
    const hCtx = hCan.getContext('2d');

    const rCan = document.createElement('canvas');
    rCan.width = w; rCan.height = h;
    const rCtx = rCan.getContext('2d');

    const mCan = document.createElement('canvas');
    mCan.width = w; mCan.height = h;
    const mCtx = mCan.getContext('2d');

    // Rich Crimson Velvet Base
    dCtx.fillStyle = '#3a0a11';
    dCtx.fillRect(0, 0, 512, 512);

    hCtx.fillStyle = '#707070';
    hCtx.fillRect(0, 0, 512, 512);

    rCtx.fillStyle = '#e8e8e8'; // Plush matte carpet
    rCtx.fillRect(0, 0, 512, 512);

    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, 512, 512);

    // Micro Loop-Pile Carpet Weave (High Density Normal Grain)
    for (let i = 0; i < 16000; i++) {
        const px = Math.random() * 512, py = Math.random() * 512;
        const op = Math.random() * 0.12;
        dCtx.fillStyle = Math.random() > 0.4 ? `rgba(255, 210, 170, ${op})` : `rgba(0, 0, 0, ${op * 1.6})`;
        dCtx.fillRect(px, py, 2, 2);

        // Tactile carpet pile height
        const hVal = Math.floor(95 + (Math.random() - 0.5) * 45);
        hCtx.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
        hCtx.fillRect(px, py, 2, 2);
    }

    // Outer Raised Gold Braided Borders
    const goldGrad = dCtx.createLinearGradient(0, 0, 512, 512);
    goldGrad.addColorStop(0, '#d4af37');
    goldGrad.addColorStop(0.5, '#f5e8b5');
    goldGrad.addColorStop(1, '#93741c');

    dCtx.strokeStyle = goldGrad;
    dCtx.lineWidth = 8;
    dCtx.strokeRect(30, 30, 452, 452);

    dCtx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
    dCtx.lineWidth = 2.5;
    dCtx.strokeRect(44, 44, 424, 424);
    dCtx.strokeRect(52, 52, 408, 408);

    // Height for Raised Gold Borders
    hCtx.fillStyle = '#202020'; // Carved shadow groove
    hCtx.lineWidth = 14;
    hCtx.strokeRect(30, 30, 452, 452);

    hCtx.fillStyle = '#ffffff'; // Raised gold braid
    hCtx.lineWidth = 8;
    hCtx.strokeStyle = '#e0e0e0';
    hCtx.strokeRect(30, 30, 452, 452);
    hCtx.strokeStyle = '#b0b0b0';
    hCtx.lineWidth = 2.5;
    hCtx.strokeRect(44, 44, 424, 424);
    hCtx.strokeRect(52, 52, 408, 408);

    rCtx.strokeStyle = '#606060'; // Silk sheen on borders
    rCtx.lineWidth = 8;
    rCtx.strokeRect(30, 30, 452, 452);
    mCtx.strokeStyle = '#aaaaaa';
    mCtx.lineWidth = 8;
    mCtx.strokeRect(30, 30, 452, 452);

    // Corner Ornaments
    const drawCornerFleur = (x, y) => {
        dCtx.fillStyle = 'rgba(212, 175, 55, 0.8)';
        dCtx.beginPath();
        dCtx.arc(x, y, 9, 0, Math.PI * 2);
        dCtx.fill();

        hCtx.fillStyle = '#e8e8e8';
        hCtx.beginPath();
        hCtx.arc(x, y, 9, 0, Math.PI * 2);
        hCtx.fill();
    };
    drawCornerFleur(52, 52);
    drawCornerFleur(460, 52);
    drawCornerFleur(52, 460);
    drawCornerFleur(460, 460);

    // 3D Center Medallion & Embossed Starburst
    dCtx.save();
    dCtx.translate(256, 256);
    dCtx.rotate(Math.PI / 4);

    dCtx.strokeStyle = 'rgba(212, 175, 55, 0.7)';
    dCtx.lineWidth = 5;
    dCtx.strokeRect(-90, -90, 180, 180);

    dCtx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    dCtx.lineWidth = 2.5;
    dCtx.strokeRect(-65, -65, 130, 130);

    dCtx.fillStyle = 'rgba(212, 175, 55, 0.55)';
    for (let i = 0; i < 8; i++) {
        dCtx.rotate(Math.PI / 4);
        dCtx.fillRect(-6, -46, 12, 22);
    }
    dCtx.restore();

    // Center Height
    hCtx.save();
    hCtx.translate(256, 256);
    hCtx.rotate(Math.PI / 4);
    hCtx.strokeStyle = '#e0e0e0';
    hCtx.lineWidth = 5;
    hCtx.strokeRect(-90, -90, 180, 180);
    hCtx.fillStyle = '#d0d0d0';
    for (let i = 0; i < 8; i++) {
        hCtx.rotate(Math.PI / 4);
        hCtx.fillRect(-6, -46, 12, 22);
    }
    hCtx.restore();

    // Vignette for room depth
    const vig = dCtx.createRadialGradient(256, 256, 180, 256, 256, 360);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    dCtx.fillStyle = vig;
    dCtx.fillRect(0, 0, 512, 512);

    const normalCan = createNormalMapFromHeightCanvas(hCan, 2.8);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

function createHotelCeilingPBR() {
    const w = 512, h = 512;

    const dCan = document.createElement('canvas');
    dCan.width = w; dCan.height = h;
    const dCtx = dCan.getContext('2d');

    const hCan = document.createElement('canvas');
    hCan.width = w; hCan.height = h;
    const hCtx = hCan.getContext('2d');

    const rCan = document.createElement('canvas');
    rCan.width = w; rCan.height = h;
    const rCtx = rCan.getContext('2d');

    const mCan = document.createElement('canvas');
    mCan.width = w; mCan.height = h;
    const mCtx = mCan.getContext('2d');

    // Heavy Dark Walnut Coffered Frame Beams
    dCtx.fillStyle = '#1a1310';
    dCtx.fillRect(0, 0, 512, 512);

    const frameGrad = dCtx.createLinearGradient(0, 0, 512, 512);
    frameGrad.addColorStop(0, '#423129');
    frameGrad.addColorStop(1, '#110c0a');
    dCtx.strokeStyle = frameGrad;
    dCtx.lineWidth = 20;
    dCtx.strokeRect(10, 10, 492, 492);

    // Deep Sunken Coffer Center
    dCtx.fillStyle = '#0e0b08';
    dCtx.fillRect(38, 38, 436, 436);

    // Inset ambient shadow
    dCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    dCtx.lineWidth = 8;
    dCtx.strokeRect(38, 38, 436, 436);

    // Gold Reveal Inlay
    dCtx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
    dCtx.lineWidth = 2.5;
    dCtx.strokeRect(54, 54, 404, 404);

    // --- Height: 3D Coffered Depth Profile ---
    // Outer Beam = highest elevation (240)
    hCtx.fillStyle = '#f0f0f0';
    hCtx.fillRect(0, 0, 512, 512);

    // Chamfer Bevel Drop (150)
    hCtx.fillStyle = '#909090';
    hCtx.fillRect(24, 24, 464, 464);

    // Sunken Coffer Floor (40)
    hCtx.fillStyle = '#282828';
    hCtx.fillRect(38, 38, 436, 436);

    // Raised Gold Inlay Line (120)
    hCtx.strokeStyle = '#757575';
    hCtx.lineWidth = 3;
    hCtx.strokeRect(54, 54, 404, 404);

    rCtx.fillStyle = '#808080';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, 512, 512);

    // 3D Recessed Downlight Fixture
    // Polished Brass Bezel
    const brassRing = dCtx.createLinearGradient(206, 206, 306, 306);
    brassRing.addColorStop(0, '#fff0a0');
    brassRing.addColorStop(0.5, '#b8942b');
    brassRing.addColorStop(1, '#503c0b');
    dCtx.beginPath();
    dCtx.arc(256, 256, 46, 0, Math.PI * 2);
    dCtx.fillStyle = brassRing;
    dCtx.fill();

    // Recessed Dark Reflector Bowl
    dCtx.beginPath();
    dCtx.arc(256, 256, 35, 0, Math.PI * 2);
    dCtx.fillStyle = '#1c1610';
    dCtx.fill();

    // Glowing Bulb Core
    const bulbGlow = dCtx.createRadialGradient(256, 256, 2, 256, 256, 32);
    bulbGlow.addColorStop(0, '#ffffff');
    bulbGlow.addColorStop(0.25, '#fff6bf');
    bulbGlow.addColorStop(0.65, '#ffcc44');
    bulbGlow.addColorStop(1, 'rgba(255, 170, 0, 0)');
    dCtx.beginPath();
    dCtx.arc(256, 256, 32, 0, Math.PI * 2);
    dCtx.fillStyle = bulbGlow;
    dCtx.fill();

    // Downlight Height & PBR
    hCtx.fillStyle = '#c0c0c0'; // Protruding brass rim
    hCtx.beginPath();
    hCtx.arc(256, 256, 46, 0, Math.PI * 2);
    hCtx.fill();

    hCtx.fillStyle = '#050505'; // Deep recessed socket
    hCtx.beginPath();
    hCtx.arc(256, 256, 35, 0, Math.PI * 2);
    hCtx.fill();

    hCtx.fillStyle = '#707070'; // Convex bulb dome
    hCtx.beginPath();
    hCtx.arc(256, 256, 24, 0, Math.PI * 2);
    hCtx.fill();

    rCtx.fillStyle = '#1c1c1c'; // Shiny brass & reflector
    rCtx.beginPath();
    rCtx.arc(256, 256, 46, 0, Math.PI * 2);
    rCtx.fill();
    mCtx.fillStyle = '#e0e0e0';
    mCtx.beginPath();
    mCtx.arc(256, 256, 46, 0, Math.PI * 2);
    mCtx.fill();

    const normalCan = createNormalMapFromHeightCanvas(hCan, 3.0);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

// ==========================================
// LEVEL 2: INDUSTRIAL MAINTENANCE BASEMENT (3D PBR)
// ==========================================

function createBasementWallPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Slate Blue Steel Bulkhead Plates
    dCtx.fillStyle = '#222f3e';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#555555';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#bbbbbb';
    mCtx.fillRect(0, 0, 512, 512);

    // Plate Seams (Horizontal & Vertical)
    dCtx.strokeStyle = 'rgba(0,0,0,0.75)';
    dCtx.lineWidth = 4;
    dCtx.strokeRect(8, 8, 496, 496);
    dCtx.beginPath();
    dCtx.moveTo(0, 256); dCtx.lineTo(512, 256);
    dCtx.stroke();

    hCtx.strokeStyle = '#202020'; // Deep recessed weld seams
    hCtx.lineWidth = 6;
    hCtx.strokeRect(8, 8, 496, 496);
    hCtx.beginPath();
    hCtx.moveTo(0, 256); hCtx.lineTo(512, 256);
    hCtx.stroke();

    // 3D Heavy Steel Rivets along edges
    const draw3DRivet = (rx, ry) => {
        // Diffuse
        dCtx.fillStyle = 'rgba(0,0,0,0.5)';
        dCtx.beginPath(); dCtx.arc(rx + 2, ry + 2, 6, 0, Math.PI * 2); dCtx.fill();
        dCtx.fillStyle = '#576574';
        dCtx.beginPath(); dCtx.arc(rx, ry, 6, 0, Math.PI * 2); dCtx.fill();
        dCtx.fillStyle = '#8395a7';
        dCtx.beginPath(); dCtx.arc(rx - 1, ry - 1, 3, 0, Math.PI * 2); dCtx.fill();

        // Height: Dome protrusion
        hCtx.fillStyle = '#ffffff';
        hCtx.beginPath(); hCtx.arc(rx, ry, 6, 0, Math.PI * 2); hCtx.fill();

        rCtx.fillStyle = '#222222';
        rCtx.beginPath(); rCtx.arc(rx, ry, 6, 0, Math.PI * 2); rCtx.fill();
        mCtx.fillStyle = '#ffffff';
        mCtx.beginPath(); mCtx.arc(rx, ry, 6, 0, Math.PI * 2); mCtx.fill();
    };

    for (let x = 24; x < 500; x += 40) {
        draw3DRivet(x, 20);
        draw3DRivet(x, 246);
        draw3DRivet(x, 266);
        draw3DRivet(x, 492);
    }

    // Overhead High-Voltage Pipe Conduit (y = 60 to 90)
    const pipeGrad = dCtx.createLinearGradient(0, 60, 0, 90);
    pipeGrad.addColorStop(0, '#10ac84');
    pipeGrad.addColorStop(0.35, '#1dd1a1');
    pipeGrad.addColorStop(0.7, '#10ac84');
    pipeGrad.addColorStop(1, '#0b664f');
    dCtx.fillStyle = pipeGrad;
    dCtx.fillRect(0, 62, 512, 26);

    // 3D Pipe Height (Cylindrical Normal)
    hCtx.fillStyle = '#e8e8e8';
    hCtx.fillRect(0, 62, 512, 26);
    hCtx.fillStyle = '#ffffff';
    hCtx.fillRect(0, 68, 512, 14);

    // Hazard Caution Stripes (Mid wall)
    for (let x = -50; x < 550; x += 30) {
        dCtx.fillStyle = '#ff9f43';
        dCtx.beginPath();
        dCtx.moveTo(x, 340); dCtx.lineTo(x + 15, 340);
        dCtx.lineTo(x - 5, 370); dCtx.lineTo(x - 20, 370);
        dCtx.closePath();
        dCtx.fill();
    }

    // Reinforced Steel Blast Door with Round Wheel
    dCtx.fillStyle = '#1b242f';
    dCtx.fillRect(160, 110, 192, 270);
    dCtx.strokeStyle = '#ff9f43';
    dCtx.lineWidth = 3;
    dCtx.strokeRect(160, 110, 192, 270);

    hCtx.fillStyle = '#404040'; // Inset door
    hCtx.fillRect(160, 110, 192, 270);

    // 3D Valve Wheel on Door
    dCtx.fillStyle = '#ee5253';
    dCtx.beginPath(); dCtx.arc(256, 245, 32, 0, Math.PI * 2); dCtx.fill();
    dCtx.fillStyle = '#222f3e';
    dCtx.beginPath(); dCtx.arc(256, 245, 22, 0, Math.PI * 2); dCtx.fill();

    hCtx.fillStyle = '#ffffff'; // Max protrusion wheel
    hCtx.beginPath(); hCtx.arc(256, 245, 32, 0, Math.PI * 2); hCtx.fill();
    hCtx.fillStyle = '#404040';
    hCtx.beginPath(); hCtx.arc(256, 245, 22, 0, Math.PI * 2); hCtx.fill();

    const normalCan = createNormalMapFromHeightCanvas(hCan, 3.2);

    return {
        map: makeTexture(dCan),
        normalMap: makeTexture(normalCan),
        bumpMap: makeTexture(hCan),
        roughnessMap: makeTexture(rCan),
        metalnessMap: makeTexture(mCan)
    };
}

function createBasementFloorPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Steel Diamond-Plate Tread
    dCtx.fillStyle = '#1e272e';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#404040';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#404040';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#dddddd';
    mCtx.fillRect(0, 0, 512, 512);

    // Criss-Cross Raised Diamond Lugs
    for (let y = 16; y < 512; y += 32) {
        for (let x = 16; x < 512; x += 32) {
            const shift = (Math.floor(y / 32) % 2) * 16;
            const cx = (x + shift) % 512, cy = y;

            // Diffuse diamond
            dCtx.fillStyle = '#485460';
            dCtx.beginPath();
            dCtx.moveTo(cx, cy - 10); dCtx.lineTo(cx + 6, cy);
            dCtx.lineTo(cx, cy + 10); dCtx.lineTo(cx - 6, cy);
            dCtx.closePath();
            dCtx.fill();

            // Height Map: Protruding diamond lug
            hCtx.fillStyle = '#f5f5f5';
            hCtx.beginPath();
            hCtx.moveTo(cx, cy - 10); hCtx.lineTo(cx + 6, cy);
            hCtx.lineTo(cx, cy + 10); hCtx.lineTo(cx - 6, cy);
            hCtx.closePath();
            hCtx.fill();

            // Roughness: Polished tip
            rCtx.fillStyle = '#1a1a1a';
            rCtx.fill();
        }
    }

    const normalCan = createNormalMapFromHeightCanvas(hCan, 2.5);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

function createBasementCeilingPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Concrete Slab & Fluorescent Light Fixture
    dCtx.fillStyle = '#151b22';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#505050';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#858585';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#101010';
    mCtx.fillRect(0, 0, 512, 512);

    // Fluorescent Light Housing (Center)
    dCtx.fillStyle = '#2f3542';
    dCtx.fillRect(100, 216, 312, 80);
    hCtx.fillStyle = '#c0c0c0'; // Protruding fixture
    hCtx.fillRect(100, 216, 312, 80);

    // Glowing Neon/Fluorescent Tube
    const tubeGlow = dCtx.createRadialGradient(256, 256, 10, 256, 256, 180);
    tubeGlow.addColorStop(0, 'rgba(72, 219, 251, 0.9)');
    tubeGlow.addColorStop(0.4, 'rgba(10, 189, 227, 0.3)');
    tubeGlow.addColorStop(1, 'rgba(0,0,0,0)');
    dCtx.fillStyle = tubeGlow;
    dCtx.fillRect(0, 0, 512, 512);

    dCtx.fillStyle = '#ffffff';
    dCtx.fillRect(120, 246, 272, 20);

    hCtx.fillStyle = '#ffffff';
    hCtx.fillRect(120, 246, 272, 20);

    const normalCan = createNormalMapFromHeightCanvas(hCan, 2.5);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

// ==========================================
// LEVEL 3: PENTHOUSE ART-DECO NOIR (3D PBR)
// ==========================================

function createPenthouseWallPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Obsidian / Emerald Polished Marble Wall
    dCtx.fillStyle = '#0f1712';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#808080';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#1a1a1a'; // High gloss marble
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, 512, 512);

    // Marble Veins
    dCtx.strokeStyle = 'rgba(46, 204, 113, 0.08)';
    dCtx.lineWidth = 2;
    for (let i = 0; i < 15; i++) {
        dCtx.beginPath();
        dCtx.moveTo(Math.random() * 512, 0);
        dCtx.bezierCurveTo(Math.random() * 512, 200, Math.random() * 512, 350, Math.random() * 512, 512);
        dCtx.stroke();
    }

    // 3D Geometric Gold Art-Deco Chevron Ribbons
    const goldGrad = dCtx.createLinearGradient(0, 0, 512, 512);
    goldGrad.addColorStop(0, '#feca57');
    goldGrad.addColorStop(0.5, '#ff9f43');
    goldGrad.addColorStop(1, '#ee5253');

    dCtx.strokeStyle = goldGrad;
    dCtx.lineWidth = 4;
    hCtx.strokeStyle = '#ffffff'; // Raised gold ribbon
    hCtx.lineWidth = 4;
    rCtx.strokeStyle = '#101010';
    rCtx.lineWidth = 4;
    mCtx.strokeStyle = '#ffffff';
    mCtx.lineWidth = 4;

    for (let x = 0; x <= 512; x += 128) {
        dCtx.beginPath(); dCtx.moveTo(x, 0); dCtx.lineTo(x + 64, 120); dCtx.lineTo(x + 128, 0); dCtx.stroke();
        hCtx.beginPath(); hCtx.moveTo(x, 0); hCtx.lineTo(x + 64, 120); hCtx.lineTo(x + 128, 0); hCtx.stroke();
        rCtx.stroke();
        mCtx.stroke();
    }

    // Penthouse Ebony Door with Gold Accents
    dCtx.fillStyle = '#070b08';
    dCtx.fillRect(160, 80, 192, 380);
    dCtx.strokeStyle = goldGrad;
    dCtx.lineWidth = 5;
    dCtx.strokeRect(160, 80, 192, 380);

    hCtx.fillStyle = '#303030';
    hCtx.fillRect(160, 80, 192, 380);
    hCtx.strokeStyle = '#ffffff';
    hCtx.lineWidth = 5;
    hCtx.strokeRect(160, 80, 192, 380);

    // Sleek Vertical Gold Bar Handle
    dCtx.fillStyle = goldGrad;
    dCtx.fillRect(328, 220, 8, 80);
    hCtx.fillStyle = '#ffffff';
    hCtx.fillRect(328, 220, 8, 80);
    rCtx.fillStyle = '#101010';
    rCtx.fillRect(328, 220, 8, 80);
    mCtx.fillStyle = '#ffffff';
    mCtx.fillRect(328, 220, 8, 80);

    const normalCan = createNormalMapFromHeightCanvas(hCan, 3.2);

    return {
        map: makeTexture(dCan),
        normalMap: makeTexture(normalCan),
        bumpMap: makeTexture(hCan),
        roughnessMap: makeTexture(rCan),
        metalnessMap: makeTexture(mCan)
    };
}

function createPenthouseFloorPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Black Velvet & Gold Geometric Carpet
    dCtx.fillStyle = '#0a0d0b';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#505050';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#d0d0d0';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#000000';
    mCtx.fillRect(0, 0, 512, 512);

    // 3D Interlocking Art-Deco Gold Diamond Grid
    const goldGrad = dCtx.createLinearGradient(0, 0, 512, 512);
    goldGrad.addColorStop(0, '#feca57');
    goldGrad.addColorStop(1, '#ff9f43');

    dCtx.strokeStyle = goldGrad;
    dCtx.lineWidth = 5;
    hCtx.strokeStyle = '#ffffff'; // Raised weave
    hCtx.lineWidth = 5;
    rCtx.strokeStyle = '#404040';
    rCtx.lineWidth = 5;
    mCtx.strokeStyle = '#aaaaaa';
    mCtx.lineWidth = 5;

    for (let i = -256; i < 768; i += 128) {
        dCtx.beginPath(); dCtx.moveTo(i, 0); dCtx.lineTo(i + 512, 512); dCtx.stroke();
        dCtx.beginPath(); dCtx.moveTo(i + 512, 0); dCtx.lineTo(i, 512); dCtx.stroke();

        hCtx.beginPath(); hCtx.moveTo(i, 0); hCtx.lineTo(i + 512, 512); hCtx.stroke();
        hCtx.beginPath(); hCtx.moveTo(i + 512, 0); hCtx.lineTo(i, 512); hCtx.stroke();

        rCtx.stroke();
        mCtx.stroke();
    }

    const normalCan = createNormalMapFromHeightCanvas(hCan, 2.8);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

function createPenthouseCeilingPBR() {
    const w = 512, h = 512;
    const dCan = document.createElement('canvas'); dCan.width = w; dCan.height = h; const dCtx = dCan.getContext('2d');
    const hCan = document.createElement('canvas'); hCan.width = w; hCan.height = h; const hCtx = hCan.getContext('2d');
    const rCan = document.createElement('canvas'); rCan.width = w; rCan.height = h; const rCtx = rCan.getContext('2d');
    const mCan = document.createElement('canvas'); mCan.width = w; mCan.height = h; const mCtx = mCan.getContext('2d');

    // Tiered Ziggurat Stepped Ceiling
    dCtx.fillStyle = '#0f1411';
    dCtx.fillRect(0, 0, 512, 512);
    hCtx.fillStyle = '#f0f0f0';
    hCtx.fillRect(0, 0, 512, 512);
    rCtx.fillStyle = '#606060';
    rCtx.fillRect(0, 0, 512, 512);
    mCtx.fillStyle = '#333333';
    mCtx.fillRect(0, 0, 512, 512);

    const goldGrad = dCtx.createLinearGradient(0, 0, 512, 512);
    goldGrad.addColorStop(0, '#feca57');
    goldGrad.addColorStop(1, '#ff9f43');

    // Stepped Tiers
    const steps = [
        { inset: 40, hColor: '#b0b0b0', dColor: '#171f1a' },
        { inset: 80, hColor: '#707070', dColor: '#0a0e0c' },
        { inset: 120, hColor: '#303030', dColor: '#050706' }
    ];

    for (let s of steps) {
        dCtx.fillStyle = s.dColor;
        dCtx.fillRect(s.inset, s.inset, 512 - s.inset * 2, 512 - s.inset * 2);
        dCtx.strokeStyle = goldGrad;
        dCtx.lineWidth = 3;
        dCtx.strokeRect(s.inset, s.inset, 512 - s.inset * 2, 512 - s.inset * 2);

        hCtx.fillStyle = s.hColor;
        hCtx.fillRect(s.inset, s.inset, 512 - s.inset * 2, 512 - s.inset * 2);
    }

    // Center Chandelier Core
    const chGlow = dCtx.createRadialGradient(256, 256, 5, 256, 256, 60);
    chGlow.addColorStop(0, '#ffffff');
    chGlow.addColorStop(0.3, '#feca57');
    chGlow.addColorStop(1, 'rgba(254, 202, 87, 0)');
    dCtx.fillStyle = chGlow;
    dCtx.beginPath();
    dCtx.arc(256, 256, 60, 0, Math.PI * 2);
    dCtx.fill();

    hCtx.fillStyle = '#ffffff';
    hCtx.beginPath();
    hCtx.arc(256, 256, 30, 0, Math.PI * 2);
    hCtx.fill();

    const normalCan = createNormalMapFromHeightCanvas(hCan, 3.0);
    const rep = GRID_SIZE / 2;

    return {
        map: makeTexture(dCan, rep, rep),
        normalMap: makeTexture(normalCan, rep, rep),
        bumpMap: makeTexture(hCan, rep, rep),
        roughnessMap: makeTexture(rCan, rep, rep),
        metalnessMap: makeTexture(mCan, rep, rep)
    };
}

// ==========================================
// MASTER FACTORY: LEVEL MATERIALS
// ==========================================

function createLevelMaterials(lvl) {
    let wallPBR, floorPBR, ceilingPBR;

    if (lvl === 2) {
        wallPBR = createBasementWallPBR();
        floorPBR = createBasementFloorPBR();
        ceilingPBR = createBasementCeilingPBR();
    } else if (lvl === 3) {
        wallPBR = createPenthouseWallPBR();
        floorPBR = createPenthouseFloorPBR();
        ceilingPBR = createPenthouseCeilingPBR();
    } else {
        wallPBR = createHotelWallPBR();
        floorPBR = createHotelCarpetPBR();
        ceilingPBR = createHotelCeilingPBR();
    }

    // Graphics Quality material ladder. Highest/High keep the creator's PBR
    // path. Medium/Low use Lambert; Potato uses texture-only Basic materials.
    if (typeof GRAPHICS_CONFIG !== 'undefined' && GRAPHICS_CONFIG.materialMode === 'basic') {
        const wallMat = new THREE.MeshBasicMaterial({ map: wallPBR.map });
        const floorMat = new THREE.MeshBasicMaterial({ map: floorPBR.map });
        const ceilingMat = new THREE.MeshBasicMaterial({ map: ceilingPBR.map });
        return { wallMat, floorMat, ceilingMat };
    }
    if (typeof GRAPHICS_CONFIG !== 'undefined' && GRAPHICS_CONFIG.materialMode === 'lambert') {
        const wallMat = new THREE.MeshLambertMaterial({ map: wallPBR.map });
        const floorMat = new THREE.MeshLambertMaterial({ map: floorPBR.map });
        const ceilingMat = new THREE.MeshLambertMaterial({ map: ceilingPBR.map });
        return { wallMat, floorMat, ceilingMat };
    }

    const wallMat = new THREE.MeshStandardMaterial({
        map: wallPBR.map,
        normalMap: wallPBR.normalMap,
        normalScale: new THREE.Vector2(1.7, 1.7),
        bumpMap: wallPBR.bumpMap,
        bumpScale: 0.05,
        roughnessMap: wallPBR.roughnessMap,
        metalnessMap: wallPBR.metalnessMap,
        roughness: 1.0,
        metalness: 1.0
    });

    const floorMat = new THREE.MeshStandardMaterial({
        map: floorPBR.map,
        normalMap: floorPBR.normalMap,
        normalScale: new THREE.Vector2(1.9, 1.9),
        bumpMap: floorPBR.bumpMap,
        bumpScale: 0.04,
        roughnessMap: floorPBR.roughnessMap,
        metalnessMap: floorPBR.metalnessMap,
        roughness: 1.0,
        metalness: 1.0
    });

    const ceilingMat = new THREE.MeshStandardMaterial({
        map: ceilingPBR.map,
        normalMap: ceilingPBR.normalMap,
        normalScale: new THREE.Vector2(1.6, 1.6),
        bumpMap: ceilingPBR.bumpMap,
        bumpScale: 0.04,
        roughnessMap: ceilingPBR.roughnessMap,
        metalnessMap: ceilingPBR.metalnessMap,
        roughness: 1.0,
        metalness: 1.0
    });

    return { wallMat, floorMat, ceilingMat };
}

// Backward compatibility references
function createHotelWallTexture() { return createHotelWallPBR().map; }
function createHotelCarpetTexture() { return createHotelCarpetPBR().map; }
function createHotelCeilingTexture() { return createHotelCeilingPBR().map; }

// ==========================================
// CRYSTAL / GEMSTONE PROCEDURAL PBR ENGINE
// ==========================================
function createCrystalPBR(type = 'gold') {
    const w = 256, h = 256;

    // 1. Diffuse Canvas
    const dCan = document.createElement('canvas');
    dCan.width = w; dCan.height = h;
    const dCtx = dCan.getContext('2d');

    // 2. Height Canvas (for Normal & Bump Maps)
    const hCan = document.createElement('canvas');
    hCan.width = w; hCan.height = h;
    const hCtx = hCan.getContext('2d');

    // 3. Roughness Canvas
    const rCan = document.createElement('canvas');
    rCan.width = w; rCan.height = h;
    const rCtx = rCan.getContext('2d');

    // 4. Metalness Canvas
    const mCan = document.createElement('canvas');
    mCan.width = w; mCan.height = h;
    const mCtx = mCan.getContext('2d');

    // 5. Emissive Canvas
    const eCan = document.createElement('canvas');
    eCan.width = w; eCan.height = h;
    const eCtx = eCan.getContext('2d');

    // Color palette by crystal archetype
    let baseColor, facetColor1, facetColor2, edgeColor, glowColor;
    if (type === 'stun') {
        // Glacial Cryo Sapphire Crystal
        baseColor = [10, 75, 160];
        facetColor1 = [0, 210, 211];
        facetColor2 = [112, 161, 255];
        edgeColor = [225, 248, 255];
        glowColor = [0, 206, 201];
    } else if (type === 'detector') {
        // Arcane Void Amethyst Crystal
        baseColor = [65, 18, 115];
        facetColor1 = [165, 94, 234];
        facetColor2 = [224, 86, 253];
        edgeColor = [255, 230, 255];
        glowColor = [190, 46, 221];
    } else {
        // Sunstone / Gold Mana Crystal
        baseColor = [185, 115, 15];
        facetColor1 = [255, 185, 0];
        facetColor2 = [255, 225, 110];
        edgeColor = [255, 255, 225];
        glowColor = [255, 175, 0];
    }

    // Generate Voronoi cell seeds for geometric crystal facets
    const numSeeds = 26;
    const seeds = [];
    for (let i = 0; i < numSeeds; i++) {
        const seedAngle = (i / numSeeds) * Math.PI * 2 + (i % 3) * 0.4;
        const seedRadius = (0.2 + 0.75 * ((i * 17) % 10) / 10) * (w / 2);
        seeds.push({
            x: (w / 2 + Math.cos(seedAngle) * seedRadius + w) % w,
            y: (h / 2 + Math.sin(seedAngle) * seedRadius + h) % h,
            val: (i * 37) % 100 / 100,
            facetAngle: ((i * 47) % 360) * Math.PI / 180
        });
    }

    const dImg = dCtx.createImageData(w, h);
    const dData = dImg.data;
    const hImg = hCtx.createImageData(w, h);
    const hData = hImg.data;
    const rImg = rCtx.createImageData(w, h);
    const rData = rImg.data;
    const mImg = mCtx.createImageData(w, h);
    const mData = mImg.data;
    const eImg = eCtx.createImageData(w, h);
    const eData = eImg.data;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let minD1 = 99999, minD2 = 99999;
            let closestSeed = seeds[0];

            for (let i = 0; i < numSeeds; i++) {
                const s = seeds[i];
                let dx = Math.abs(x - s.x);
                if (dx > w / 2) dx = w - dx;
                let dy = Math.abs(y - s.y);
                if (dy > h / 2) dy = h - dy;
                const d = Math.sqrt(dx * dx + dy * dy);

                if (d < minD1) {
                    minD2 = minD1;
                    minD1 = d;
                    closestSeed = s;
                } else if (d < minD2) {
                    minD2 = d;
                }
            }

            const edgeDist = minD2 - minD1;
            const isSharpRidge = edgeDist < 2.0;
            const isEdge = edgeDist < 4.8;

            let angleToSeed = Math.atan2(y - closestSeed.y, x - closestSeed.x);
            let slope = Math.cos(angleToSeed - closestSeed.facetAngle);
            let facetGrad = (slope + 1) * 0.5;

            // Micro-internal crystalline vein patterns
            const vein = Math.sin((x * 0.16 + y * 0.16) * 2 + closestSeed.val * 10);
            const isVein = Math.abs(vein) > 0.95;

            const idx = (y * w + x) * 4;

            // 1. Diffuse Color
            let r, g, b;
            if (isSharpRidge) {
                r = edgeColor[0]; g = edgeColor[1]; b = edgeColor[2];
            } else if (isEdge) {
                r = facetColor2[0]; g = facetColor2[1]; b = facetColor2[2];
            } else {
                const t1 = 0.35 + 0.65 * facetGrad;
                r = Math.floor(baseColor[0] * (1 - t1) + (isVein ? facetColor2[0] : facetColor1[0]) * t1);
                g = Math.floor(baseColor[1] * (1 - t1) + (isVein ? facetColor2[1] : facetColor1[1]) * t1);
                b = Math.floor(baseColor[2] * (1 - t1) + (isVein ? facetColor2[2] : facetColor1[2]) * t1);
            }

            dData[idx]     = r;
            dData[idx + 1] = g;
            dData[idx + 2] = b;
            dData[idx + 3] = 255;

            // 2. Height Map (for bevel normal map)
            let heightVal = Math.min(255, Math.floor((Math.max(0, 1 - (minD1 / 48)) * 180) + (isEdge ? 70 : 0) + facetGrad * 40));
            hData[idx]     = heightVal;
            hData[idx + 1] = heightVal;
            hData[idx + 2] = heightVal;
            hData[idx + 3] = 255;

            // 3. Roughness Map (Glassy polish)
            let roughVal = isSharpRidge ? 25 : (isEdge ? 65 : Math.floor(35 + (1 - facetGrad) * 35));
            rData[idx]     = roughVal;
            rData[idx + 1] = roughVal;
            rData[idx + 2] = roughVal;
            rData[idx + 3] = 255;

            // 4. Metalness Map (Reflective specular luster)
            let metVal = isSharpRidge ? 245 : Math.floor(170 + facetGrad * 70);
            mData[idx]     = metVal;
            mData[idx + 1] = metVal;
            mData[idx + 2] = metVal;
            mData[idx + 3] = 255;

            // 5. Emissive Map (Glowing edges & vein network)
            if (isSharpRidge || isVein) {
                eData[idx]     = glowColor[0];
                eData[idx + 1] = glowColor[1];
                eData[idx + 2] = glowColor[2];
            } else if (isEdge) {
                eData[idx]     = Math.floor(glowColor[0] * 0.65);
                eData[idx + 1] = Math.floor(glowColor[1] * 0.65);
                eData[idx + 2] = Math.floor(glowColor[2] * 0.65);
            } else {
                eData[idx]     = Math.floor(glowColor[0] * 0.2 * facetGrad);
                eData[idx + 1] = Math.floor(glowColor[1] * 0.2 * facetGrad);
                eData[idx + 2] = Math.floor(glowColor[2] * 0.2 * facetGrad);
            }
            eData[idx + 3] = 255;
        }
    }

    dCtx.putImageData(dImg, 0, 0);
    hCtx.putImageData(hImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    mCtx.putImageData(mImg, 0, 0);
    eCtx.putImageData(eImg, 0, 0);

    const normalCanvas = createNormalMapFromHeightCanvas(hCan, 3.2);

    return {
        map: makeTexture(dCan, 1, 1),
        normalMap: makeTexture(normalCanvas, 1, 1),
        bumpMap: makeTexture(hCan, 1, 1),
        roughnessMap: makeTexture(rCan, 1, 1),
        metalnessMap: makeTexture(mCan, 1, 1),
        emissiveMap: makeTexture(eCan, 1, 1)
    };
}

let cachedCrystalMaterials = null;
function getCrystalMaterials() {
    if (cachedCrystalMaterials) return cachedCrystalMaterials;

    const goldPBR = createCrystalPBR('gold');
    const stunPBR = createCrystalPBR('stun');
    const detectorPBR = createCrystalPBR('detector');

    const crystalMode = (typeof GRAPHICS_CONFIG !== 'undefined') ? GRAPHICS_CONFIG.crystalMaterialMode : 'pbr';
    if (crystalMode === 'basic') {
        cachedCrystalMaterials = {
            gold: {
                main: new THREE.MeshBasicMaterial({ map: goldPBR.map, color: 0xffd85a }),
                core: new THREE.MeshBasicMaterial({ color: 0xfff3a0 })
            },
            stun: {
                main: new THREE.MeshBasicMaterial({ map: stunPBR.map, color: 0x6fe8ff }),
                ring: new THREE.MeshBasicMaterial({ color: 0x70dfff }),
                core: new THREE.MeshBasicMaterial({ color: 0xe0ffff })
            },
            detector: {
                main: new THREE.MeshBasicMaterial({ map: detectorPBR.map, color: 0xdca6ff }),
                ring: new THREE.MeshBasicMaterial({ color: 0xe6a7ff }),
                core: new THREE.MeshBasicMaterial({ color: 0xffe8ff })
            }
        };
        return cachedCrystalMaterials;
    }
    if (crystalMode === 'lambert') {
        cachedCrystalMaterials = {
            gold: {
                main: new THREE.MeshLambertMaterial({ map: goldPBR.map, color: 0xffd85a, emissive: 0x6b3d00, emissiveIntensity: 0.25 }),
                core: new THREE.MeshBasicMaterial({ color: 0xfff3a0 })
            },
            stun: {
                main: new THREE.MeshLambertMaterial({ map: stunPBR.map, color: 0x6fe8ff, emissive: 0x006b73, emissiveIntensity: 0.35 }),
                ring: new THREE.MeshBasicMaterial({ color: 0x70dfff }),
                core: new THREE.MeshBasicMaterial({ color: 0xe0ffff })
            },
            detector: {
                main: new THREE.MeshLambertMaterial({ map: detectorPBR.map, color: 0xdca6ff, emissive: 0x54236f, emissiveIntensity: 0.35 }),
                ring: new THREE.MeshBasicMaterial({ color: 0xe6a7ff }),
                core: new THREE.MeshBasicMaterial({ color: 0xffe8ff })
            }
        };
        return cachedCrystalMaterials;
    }

    const goldMat = new THREE.MeshStandardMaterial({
        map: goldPBR.map,
        normalMap: goldPBR.normalMap,
        normalScale: new THREE.Vector2(1.6, 1.6),
        bumpMap: goldPBR.bumpMap,
        bumpScale: 0.05,
        roughnessMap: goldPBR.roughnessMap,
        metalnessMap: goldPBR.metalnessMap,
        emissiveMap: goldPBR.emissiveMap,
        emissive: new THREE.Color(0xffaa00),
        emissiveIntensity: 0.55,
        roughness: 0.18,
        metalness: 0.85
    });

    const goldCoreMat = new THREE.MeshBasicMaterial({
        color: 0xfff3a0
    });

    const stunMat = new THREE.MeshStandardMaterial({
        map: stunPBR.map,
        normalMap: stunPBR.normalMap,
        normalScale: new THREE.Vector2(1.8, 1.8),
        bumpMap: stunPBR.bumpMap,
        bumpScale: 0.06,
        roughnessMap: stunPBR.roughnessMap,
        metalnessMap: stunPBR.metalnessMap,
        emissiveMap: stunPBR.emissiveMap,
        emissive: new THREE.Color(0x00d2d3),
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.88
    });

    const stunRingMat = new THREE.MeshStandardMaterial({
        color: 0x70a1ff,
        emissive: 0x00d2d3,
        emissiveIntensity: 0.95,
        roughness: 0.1,
        metalness: 0.9
    });

    const stunCoreMat = new THREE.MeshBasicMaterial({
        color: 0xe0ffff
    });

    const detectorMat = new THREE.MeshStandardMaterial({
        map: detectorPBR.map,
        normalMap: detectorPBR.normalMap,
        normalScale: new THREE.Vector2(1.8, 1.8),
        bumpMap: detectorPBR.bumpMap,
        bumpScale: 0.06,
        roughnessMap: detectorPBR.roughnessMap,
        metalnessMap: detectorPBR.metalnessMap,
        emissiveMap: detectorPBR.emissiveMap,
        emissive: new THREE.Color(0xa55eea),
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.88
    });

    const detectorRingMat = new THREE.MeshStandardMaterial({
        color: 0xe056fd,
        emissive: 0xbe2edd,
        emissiveIntensity: 0.95,
        roughness: 0.1,
        metalness: 0.9
    });

    const detectorCoreMat = new THREE.MeshBasicMaterial({
        color: 0xffe8ff
    });

    cachedCrystalMaterials = {
        gold: { main: goldMat, core: goldCoreMat },
        stun: { main: stunMat, ring: stunRingMat, core: stunCoreMat },
        detector: { main: detectorMat, ring: detectorRingMat, core: detectorCoreMat }
    };

    return cachedCrystalMaterials;
}

// Buang cache material kristal agar dibangun ulang dengan material yang sesuai
// preset grafis baru. Dipanggil oleh game.js saat Graphics Quality diganti
// tanpa reload halaman (crystalMaterialMode berubah: pbr / lambert / basic).
function resetCachedCrystalMaterials() {
    cachedCrystalMaterials = null;
}