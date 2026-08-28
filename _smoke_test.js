// Smoke test harness — simulates a browser env in Node to verify the live
// applyGraphicsQualityLive() flow (no page reload) doesn't throw.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

function newVec3() {
    return {
        x: 0, y: 0, z: 0,
        set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
        setScalar(v) { this.x = this.y = this.z = v; return this; },
        copy(v) { if (v) { this.x = v.x; this.y = v.y; this.z = v.z; } return this; },
        clone() { return newVec3().set(this.x, this.y, this.z); },
        add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
        sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; },
        multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; },
        length() { return Math.hypot(this.x, this.y, this.z); },
        lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; },
        normalize() { const l = this.length() || 1; this.x /= l; this.y /= l; this.z /= l; return this; },
        dot() { return 0; }, crossVectors() { return this; },
        distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); },
        distanceToSquared(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; },
        applyAxisAngle() { return this; }, lerp() { return this; },
        setFromMatrixPosition() { return this; }
    };
}
function classList() { return { add() {}, remove() {}, toggle() {}, contains() { return false; } }; }
function ctx2d() {
    const grad = { addColorStop() {} };
    return {
        fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
        font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0, lineCap: '', lineJoin: '',
        fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, closePath() {}, moveTo() {},
        lineTo() {}, arc() {}, arcTo() {}, ellipse() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {},
        fill() {}, stroke() {}, clip() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        transform() {}, setTransform() {}, setLineDash() {}, drawImage() {},
        createLinearGradient() { return grad; }, createRadialGradient() { return grad; }, createPattern() { return {}; },
                measureText(t) { return { width: (t ? String(t).length : 0) * 7 }; },
        fillText() {},
        strokeText() {},
        getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {}
    };
}
function makeStyle() {
    return { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
}
function makeCanvas() {
    const el = {
        tagName: 'CANVAS', width: 300, height: 150,
        style: makeStyle(), className: '', classList: classList(),
        innerText: '', textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
        addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
        querySelector() { return makeEl(); }, querySelectorAll() { return []; },
        appendChild() {}, removeChild() {}, remove() {}, focus() {}, blur() {},
        contains() { return false; }, offsetWidth: 0, offsetHeight: 0,
        getContext() { if (!el.__ctx) el.__ctx = ctx2d(); return el.__ctx; },
        toDataURL() { return 'data:image/png;base64,'; }
    };
    return el;
}
function makeEl() {
    return {
        tagName: 'DIV', style: makeStyle(), className: '', classList: classList(),
        innerText: '', textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
        addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
        querySelector() { return makeEl(); }, querySelectorAll() { return []; },
        appendChild() {}, removeChild() {}, insertBefore() {}, remove() {}, focus() {}, blur() {},
        contains() { return false; }, offsetWidth: 0, offsetHeight: 0,
        // Audio element methods/properties (needed by audio.js startMenuMusic etc.)
        volume: 1, currentTime: 0, loop: false, muted: false, src: '', preload: '',
        play() { return Promise.resolve(); },
        pause() {},
        load() {}
    };
}
function base3D() {
    const o = {
        children: [], userData: {}, visible: true, name: '', parent: null,
        position: newVec3(), rotation: newVec3(), scale: newVec3(),
        quaternion: { setFromEuler() {}, slerp() {}, identity() {}, set() {}, x: 0, y: 0, z: 0, w: 1 },
        matrix: { makeTranslation() { return this; }, compose() {}, decompose() {}, identity() {}, setPosition() {}, multiply() {}, invert() {}, getInverse() {} },
        add(...c) { for (const x of c) { if (x) { o.children.push(x); x.parent = o; } } return o; },
        remove(c) { const i = o.children.indexOf(c); if (i >= 0) { o.children.splice(i, 1); if (c) c.parent = null; } return o; },
        clear() { o.children = []; }, updateMatrix() {}, traverse() {},
        getWorldPosition() { return newVec3(); },
        getWorldDirection(v) { if (v) v.set(0, 0, -1); return v; }
    };
    o.scale.setScalar(1);
    return o;
}
function makeTHREEObject(prop, args) {
    switch (prop) {
        case 'Scene': { const s = base3D(); s.background = null; s.fog = null; return s; }
        case 'WebGLRenderer':
            return {
                shadowMap: { enabled: false, type: 0 },
                domElement: makeCanvas(),
                setSize() {}, setPixelRatio() {}, setClearColor() {}, clear() {}, render() {},
                setAnimationLoop() {}, dispose() {}, renderLists: { dispose() {} }
            };
        case 'PointerLockControls':
            return { isLocked: false, lock() { this.isLocked = true; }, unlock() { this.isLocked = false; }, addEventListener() {}, removeEventListener() {}, getObject() { return args[0]; } };
        case 'CanvasTexture': {
            const t = { wrapS: 0, wrapT: 0, repeat: newVec3(), needsUpdate: false, dispose() {}, clone() { return t; } };
            return t;
        }
        case 'InstancedMesh': {
            const m = base3D();
            m.count = args[2] || 0;
            m.instanceMatrix = { needsUpdate: false };
            m.geometry = args[0]; m.material = args[1];
            m.setMatrixAt = function () {};
            m.setColorAt = function () {};
            return m;
        }
                case 'Matrix4':
            return { makeTranslation() { return this; }, compose() {}, decompose() {}, identity() { return this; }, setPosition() { return this; }, multiply() { return this; }, invert() { return this; }, getInverse() {} };
        case 'Euler':
            return { x: args[0] || 0, y: args[1] || 0, z: args[2] || 0, order: args[3] || 'XYZ',
                setFromQuaternion() { return this; }, set() { return this; }, copy() { return this; }, clone() { return this; } };
        case 'Vector2': case 'Vector3': {
            const v = newVec3();
            if (prop === 'Vector2') v.z = undefined;
            return v;
        }
        case 'Mesh': case 'Line': case 'LineSegments': case 'Points': {
            const m = base3D();
            m.geometry = args[0]; m.material = args[1];
            m.castShadow = false; m.receiveShadow = false;
            return m;
        }
                case 'Group': return base3D();
        case 'PerspectiveCamera':
            return { ...base3D(), fov: args[0] || 75, aspect: args[1] || 1, near: args[2] || 0.1, far: args[3] || 1000,
                updateProjectionMatrix() {} };
        case 'Color': return { r: 0, g: 0, b: 0, set() { return this; }, copy() { return this; }, setHex() { return this; }, getHex() { return 0; }, clone() { return this; } };
        case 'FogExp2': return { color: args[0] || 0, density: args[1] || 0 };
        case 'AmbientLight': case 'PointLight': case 'DirectionalLight': case 'SpotLight':
            return { color: args[0] || 0, intensity: args[1] || 1, distance: args[2] || 0, decay: args[3] || 1, ...base3D(), shadow: {} };
        case 'BoxGeometry': case 'PlaneGeometry': case 'SphereGeometry': case 'IcosahedronGeometry':
        case 'DodecahedronGeometry': case 'OctahedronGeometry': case 'TetrahedronGeometry':
        case 'TorusGeometry': case 'RingGeometry': case 'ConeGeometry': case 'CylinderGeometry':
                case 'BufferGeometry':
            return { ...base3D(), parameters: args[0] || {}, scale() { return this; }, setAttribute() {}, setIndex() {}, computeVertexNormals() {}, computeBoundingSphere() {}, dispose() {}, translate() { return this; }, rotateX() { return this; }, rotateY() { return this; }, rotateZ() { return this; } };
        case 'MeshBasicMaterial': case 'MeshLambertMaterial': case 'MeshStandardMaterial':
        case 'MeshPhongMaterial': case 'MeshNormalMaterial': case 'MeshDepthMaterial':
        case 'SpriteMaterial': case 'ShadowMaterial':
            return { dispose() {}, transparent: false, opacity: 1, depthWrite: true, side: 0, ...(args[0] || {}) };
        case 'Raycaster':
            return { set() {}, intersectObjects() { return []; }, intersectObject() { return []; } };
        case 'CatmullRomCurve3': case 'TorusKnotGeometry':
            return { points: [], getPoint() { return newVec3(); }, getPoints() { return []; } };
        default: return base3D();
    }
}

function makeTHREE() {
    const t = {};
    return new Proxy(t, {
        get(target, prop) {
            if (typeof prop !== 'string') return target[prop];
            if (target[prop]) return target[prop];
            const consts = {
                RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, MirroredRepeatWrapping: 1002,
                FrontSide: 0, BackSide: 1, DoubleSide: 2, NormalBlending: 2, AdditiveBlending: 3,
                PCFSoftShadowMap: 1, PCFShadowMap: 2, BasicShadowMap: 0,
                LinearFilter: 1006, NearestFilter: 1003, LinearMipMapLinearFilter: 1008,
                SRGBColorSpace: 'srgb', NoColorSpace: ''
            };
            if (prop in consts) { target[prop] = consts[prop]; return consts[prop]; }
            if (/^[A-Z]/.test(prop)) {
                const factory = function () { return makeTHREEObject(prop, Array.prototype.slice.call(arguments)); };
                target[prop] = factory;
                return factory;
            }
            return undefined;
        }
    });
}
function buildSandbox() {
    const stored = {};
    const containerEl = makeEl();
    const minimapEl = makeCanvas();
    const documentStub = {
        __els: {},
        getElementById(id) {
            if (id === 'canvas-container') return containerEl;
            if (id === 'minimap') return minimapEl;
            if (!documentStub.__els[id]) documentStub.__els[id] = makeEl();
            return documentStub.__els[id];
        },
        createElement(tag) { return tag === 'canvas' ? makeCanvas() : makeEl(); },
        createElementNS() { return makeCanvas(); },
        body: makeEl(), documentElement: makeEl(), head: makeEl(),
        addEventListener() {}, removeEventListener() {}, activeElement: makeEl(),
        querySelector() { return makeEl(); }, querySelectorAll() { return []; },
        hidden: false, visibilityState: 'visible', fullscreenElement: null,
        webkitFullscreenElement: null, mozFullScreenElement: null, msFullscreenElement: null,
    };
    const sandbox = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        performance: { now: () => Date.now() },
        localStorage: {
            getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; },
            setItem(k, v) { stored[k] = String(v); },
            removeItem(k) { delete stored[k]; }
        },
        navigator: { userAgent: 'smoke-test', maxTouchPoints: 0 },
        screen: { width: 1280, height: 800 },
        document: documentStub,
        requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
        Audio: function () { const a = makeEl(); a.loop = false; a.src = ''; a.preload = ''; a.volume = 1; a.muted = false; a.currentTime = 0; a.play = () => Promise.resolve(); a.pause = () => {}; a.load = () => {}; return a; },
        alert() {}, confirm() { return true; },
    };
    const ac = {
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; },
        createBufferSource() { return { connect() {}, start() {}, stop() {}, buffer: null, loop: false }; },
        createAnalyser() { return { connect() {}, getByteFrequencyData() {}, frequencyBinCount: 64 }; },
        createOscillator() { return { connect() {}, start() {}, stop() {}, type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} } }; },
        createScriptProcessor() { return { connect() {} }; },
        sampleRate: 44100, destination: {}, state: 'running', resume: () => Promise.resolve()
    };
    sandbox.window = {
        devicePixelRatio: 2, innerWidth: 1280, innerHeight: 720,
        visualViewport: { width: 1280, height: 720, addEventListener() {}, removeEventListener() {} },
        matchMedia() { return { matches: false }; },
        addEventListener() {}, removeEventListener() {},
        AudioContext: function () { return ac; }, webkitAudioContext: undefined,
        location: { reload() { sandbox.__reloaded = true; }, href: 'http://localhost/' },
    };
    sandbox.THREE = makeTHREE();
    sandbox.__reloaded = false;
    return sandbox;
}
// ---------- run ----------
const sandbox = buildSandbox();
const ctx = vm.createContext(sandbox);
function loadFile(f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
function run(code) {
    return vm.runInContext(code, ctx, { filename: 'test.js' });
}
['js/config.js', 'js/audio.js', 'js/textures.js', 'js/maze.js', 'js/game.js', 'js/menu.js'].forEach(loadFile);

let failures = 0;
function assert(cond, label) {
    if (cond) { console.log('PASS:', label); }
    else { failures++; console.log('FAIL:', label); }
}

// --- Scenario A: live apply while a level is loaded ---
assert(run('wallMeshes.length') === 0, 'no walls yet (no level loaded)');
run('sceneReady = true; currentLevel = 1; loadLevel(1);');
const wallCount = run('wallMeshes.length');
assert(wallCount > 0, 'loadLevel(1) built walls (count=' + wallCount + ')');
assert(run('pellets.length') > 0, 'loadLevel(1) spawned pellets');
assert(run('monsters.length') === run('getMonsterCount()'), 'loadLevel(1) spawned monsters');

let ok;
try { ok = run('applyGraphicsQualityLive("potato") === true'); }
catch (e) { ok = false; console.log('THREW on apply potato:', e.message); }
assert(ok, 'applyGraphicsQualityLive("potato") returns true');
assert(run('getGraphicsQuality() === "potato"'), 'GRAPHICS_QUALITY now potato');
assert(run('GRAPHICS_CONFIG.materialMode === "basic"'), 'potato materialMode basic');
assert(run('minimapCanvas.width === 192'), 'minimap resolution updated to 192 (potato)');
assert(Math.abs(run('VISUAL_INTERVAL') - 1 / 15) < 1e-9, 'VISUAL_INTERVAL updated to 1/15 (potato)');
assert(run('wallMeshes.length') > 0, 'level rebuilt after live apply (walls=' + run('wallMeshes.length') + ')');
assert(run('camera.children.length') <= 1, 'camera children not accumulating (count=' + run('camera.children.length') + ')');
assert(run('__reloaded === true') === false, 'no page reload triggered');

// --- Scenario B: apply highest back ---
try { ok = run('applyGraphicsQualityLive("highest") === true'); }
catch (e) { ok = false; console.log('THREW on apply highest:', e.message); }
assert(ok, 'applyGraphicsQualityLive("highest") returns true');
assert(run('getGraphicsQuality() === "highest"'), 'GRAPHICS_QUALITY back to highest');
assert(run('minimapCanvas.width === 480'), 'minimap resolution back to 480 (highest)');
assert(run('VISUAL_INTERVAL') === 0, 'VISUAL_INTERVAL back to 0 (highest 60fps)');
assert(run('wallMeshes.length') > 0, 'level rebuilt under highest');

// --- Scenario C: invalid preset returns false (menu falls back to reload) ---
assert(run('applyGraphicsQualityLive("nonsense") === false'), 'invalid preset returns false');

// --- Scenario D: renderer exists after all the churn ---
assert(run('renderer !== null'), 'renderer exists');
assert(run('typeof renderer.render === "function"'), 'renderer is usable');

console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : '\n' + failures + ' SMOKE TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);