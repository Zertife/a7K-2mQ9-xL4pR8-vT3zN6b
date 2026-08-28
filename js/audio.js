// ==========================================
// AUDIO SYNTHESIZER (Web Audio API) + AMBIENT MP3
// ==========================================
let audioCtx = null;
let _masterVolume = 0.7;
let _sfxEnabled = true;
let _musicVolume = 0.5;
let _musicEnabled = true;
let _ambientEl = null;
let _ambientUnlocked = false;
let _ambientCandidateIndex = 0;
let _ambientPaused = false;    // true saat game dijeda → musik difade turun, bukan berhenti
let _ambientFadeRAF = null;    // id requestAnimationFrame untuk animasi fade

// Tingkat volume minimum saat game dijeda. Musik TETAP berputar, hanya nyaris tak terdengar.
const PAUSE_AMBIENT_LEVEL = 0.20;

// Tingkat volume dasar BGM sesuai pengaturan user.
function _ambientBaseLevel() {
    return _musicEnabled ? (_masterVolume * _musicVolume) : 0;
}

const AMBIENT_SOURCES = [
    'audio/ambient.mp3',
    'audio/ambient3.mp3',
    'audio/ambient4.mp3'
];

function initAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
        if (!audioCtx) audioCtx = new AudioContextClass();
        if (audioCtx.state === 'suspended') {
            const p = audioCtx.resume();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        // Pastikan SFX MP3 powerup sudah di-fetch sejak awal agar pickup tidak telat berbunyi.
        if (typeof _preloadPowerupSfx === 'function') _preloadPowerupSfx();
        return audioCtx;
    } catch (e) {
        // Audio tidak boleh menggagalkan gameplay. HTMLAudio masih dapat dipakai
        // untuk BGM/SFX MP3 meskipun Web Audio tidak tersedia.
        audioCtx = null;
        return null;
    }
}

function getAmbientEl() {
    if (_ambientEl) return _ambientEl;

    _ambientEl = document.getElementById('ambient-music');
    if (!_ambientEl) {
        _ambientEl = new Audio();
        _ambientEl.id = 'ambient-music';
        _ambientEl.preload = 'auto';
        document.body.appendChild(_ambientEl);
    }

    _ambientEl.loop = true;
    _ambientEl.setAttribute('playsinline', '');
    applyAmbientVolume();

    _ambientEl.addEventListener('error', () => {
        if (_ambientCandidateIndex < AMBIENT_SOURCES.length - 1) {
            _ambientCandidateIndex += 1;
            _ambientEl.src = AMBIENT_SOURCES[_ambientCandidateIndex];
            _ambientEl.load();
            if (_ambientUnlocked && _musicEnabled) {
                _ambientEl.play().catch(() => {});
            }
        }
    });

    if (!_ambientEl.getAttribute('src')) {
        _ambientEl.src = AMBIENT_SOURCES[_ambientCandidateIndex];
    }

    return _ambientEl;
}

function applyAmbientVolume() {
    const el = _ambientEl || document.getElementById('ambient-music');
    if (!el) return;
    const level = _ambientPaused ? PAUSE_AMBIENT_LEVEL : _ambientBaseLevel();
    el.volume = Math.max(0, Math.min(1, level));
}

function startAmbientMusic(reset) {
    stopMenuMusic();             // jangan biarkan musik menu & BGM game bunyi bersamaan
    _ambientUnlocked = true;
    _ambientPaused = false;      // mulai baru → volume kembali penuh
    _cancelAmbientFade();
    const el = getAmbientEl();
    if (reset) {
        try { el.currentTime = 0; } catch (e) { /* ignore */ }
    }
    const target = _ambientBaseLevel();
    if (!_musicEnabled || target <= 0) {
        el.volume = 0;
        el.pause();
        return;
    }
    // BGM game di-fade-IN halus (mis. menyusul transisi hitam pemilihan level),
    // alih-alih volume melompat langsung ke level penuh.
    el.volume = 0;
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
    }
    _fadeAmbientTo(target, 1500);
}

function _cancelAmbientFade() {
    if (_ambientFadeRAF) {
        cancelAnimationFrame(_ambientFadeRAF);
        _ambientFadeRAF = null;
    }
}

function _fadeAmbientTo(target, duration) {
    const el = _ambientEl || document.getElementById('ambient-music');
    if (!el) return;
    _cancelAmbientFade();
    const start = el.volume;
    target = Math.max(0, Math.min(1, target));
    if (Math.abs(start - target) < 0.001) {
        el.volume = target;
        return;
    }
    const t0 = performance.now();
    const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        el.volume = start + (target - start) * eased;
        if (p < 1) {
            _ambientFadeRAF = requestAnimationFrame(step);
        } else {
            _ambientFadeRAF = null;
        }
    };
    _ambientFadeRAF = requestAnimationFrame(step);
}

// Saat game dijeda, musik TIDAK dihentikan — divolume turun (fade) pelan,
// tetap berputar di latar, lalu fade naik lagi saat diresume.
function pauseAmbientMusic() {
    if (!_ambientEl) return;
    _ambientPaused = true;
    _fadeAmbientTo(PAUSE_AMBIENT_LEVEL, 800);
}

function stopAmbientMusic() {
    _ambientUnlocked = false;
    _ambientPaused = false;
    _cancelAmbientFade();
    if (_ambientEl) {
        _ambientEl.pause();
        try { _ambientEl.currentTime = 0; } catch (e) { /* ignore */ }
    }
}

function resumeAmbientMusic() {
    _ambientPaused = false;
    _cancelAmbientFade();
    if (!_ambientUnlocked) return;
    const el = getAmbientEl();
    if (!el) return;
    if (_musicEnabled) {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
        _fadeAmbientTo(_ambientBaseLevel(), 650);
    } else {
        el.volume = 0;
    }
}

// Ganti sumber BGM (mis. beralih ke ambient2.mp3 saat hint pellet aktif).
// Hanya benar-benar mengganti bila source-nya berbeda dari yang sedang diputar,
// lalu reload & lanjutkan memutar bila musik sedang aktif.
function switchAmbientTrack(src) {
    if (!src) return;
    const el = getAmbientEl();
    try {
        if (el.getAttribute('src') === src) return; // sudah di trek ini, jangan restart
        el.src = src;
        el.load();
        if (_ambientUnlocked && _musicEnabled) {
            el.play().catch(() => {});
        }
    } catch (e) { /* ignore */ }
}

// Fade-out total BGM game (mis. trek ambient2 yang sedang diputar saat overlay
// "YOU'VE ESCAPED" terbuka) secara halus. Dipakai pada transisi sinematik ketika
// pemain memilih aksi di overlay escape — layar menghitam lebih dulu, lalu trek
// yang sedang berbunyi mengecil sampai senyap sebelum aksi dijalankan. Setelah
// selesai trek dipause & direset, dan _ambientUnlocked dimatikan agar
// switchAmbientTrack tidak memutar otomatis sebelum sesi berikutnya dimulai.
function fadeOutAmbientMusic(duration = 1000, onDone) {
    const el = _ambientEl || document.getElementById('ambient-music');
    if (!el) {
        if (typeof onDone === 'function') onDone();
        return;
    }
    _cancelAmbientFade();

    const finish = () => {
        _ambientUnlocked = false;
        _ambientPaused = false;
        if (_ambientEl) {
            _ambientEl.pause();
            try { _ambientEl.currentTime = 0; } catch (e) { /* ignore */ }
        }
        if (typeof onDone === 'function') onDone();
    };

    // Sudah senyap / tidak berputar? Langsung bereskan tanpa animasi.
    if (!_musicEnabled || el.paused || el.volume <= 0.001) {
        el.volume = 0;
        finish();
        return;
    }

    const start = el.volume;
    const t0 = performance.now();
    const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic, konsisten dgn fade lainnya
        el.volume = start * (1 - eased);
        if (p < 1) {
            _ambientFadeRAF = requestAnimationFrame(step);
        } else {
            _ambientFadeRAF = null;
            el.volume = 0;
            finish();
        }
    };
    _ambientFadeRAF = requestAnimationFrame(step);
}

// ==========================================
// MENU MUSIC — main-menu.mp3 diputar saat menu utama terbuka
// ==========================================
let _menuMusicEl = null;
let _menuMusicWanted = false;    // true selagi sistem menu (main/sub menu) terbuka
let _menuMusicUnlockBound = false;
let _menuMusicFadeRAF = null;    // id requestAnimationFrame untuk fade-out musik menu

function getMenuMusicEl() {
    if (_menuMusicEl) return _menuMusicEl;

    _menuMusicEl = document.getElementById('menu-music');
    if (!_menuMusicEl) {
        _menuMusicEl = new Audio('audio/main-menu.mp3');
        _menuMusicEl.id = 'menu-music';
        document.body.appendChild(_menuMusicEl);
    }

    _menuMusicEl.loop = true;
    _menuMusicEl.setAttribute('playsinline', '');
    applyMenuMusicVolume();
    return _menuMusicEl;
}

function applyMenuMusicVolume() {
    const el = _menuMusicEl || document.getElementById('menu-music');
    if (!el) return;
    const level = _musicEnabled ? (_masterVolume * _musicVolume) : 0;
    el.volume = Math.max(0, Math.min(1, level));
}

// Browser memblokir autoplay sebelum ada interaksi user (menu tampil saat
// halaman baru dimuat). Coba mainkan sekarang; bila ditolak, tunggu gesture
// pertama (klik / keyboard) lalu mulai otomatis.
function _ensureMenuMusicUnlockListener() {
    if (_menuMusicUnlockBound) return;
    _menuMusicUnlockBound = true;
    const unlock = () => {
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
        _menuMusicUnlockBound = false;
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (_menuMusicWanted && _musicEnabled) startMenuMusic();
    };
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
}

function startMenuMusic() {
    _menuMusicWanted = true;
    _cancelMenuMusicFade();      // batalkan fade-out yang mungkin masih berjalan
    stopAmbientMusic();          // dua BGM tidak boleh bunyi bersamaan
    const el = getMenuMusicEl();
    applyMenuMusicVolume();
    if (!_musicEnabled || el.volume <= 0) {
        el.pause();
        return;
    }
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            // Autoplay diblokir → coba lagi pada gesture pertama user.
            _ensureMenuMusicUnlockListener();
        });
    }
}

function stopMenuMusic() {
    _menuMusicWanted = false;
    _cancelMenuMusicFade();
    if (_menuMusicEl) {
        _menuMusicEl.pause();
        try { _menuMusicEl.currentTime = 0; } catch (e) { /* ignore */ }
    }
}

function _cancelMenuMusicFade() {
    if (_menuMusicFadeRAF) {
        cancelAnimationFrame(_menuMusicFadeRAF);
        _menuMusicFadeRAF = null;
    }
}

// Fade-out musik menu secara halus (dipakai saat pemain memilih level:
// layar menghitam sementara musik mengecil, alih-alih berhenti mendadak
// yang terdengar kasar). Setelah selesai, trek dipause & direset sehingga
// memulai menu lagi berikutnya tetap dari awal.
function fadeOutMenuMusic(duration = 1100, onDone) {
    const el = getMenuMusicEl();
    _menuMusicWanted = false;    // jangan di-restart oleh unlock listener
    _cancelMenuMusicFade();

    const finish = () => {
        if (_menuMusicEl) {
            _menuMusicEl.pause();
            try { _menuMusicEl.currentTime = 0; } catch (e) { /* ignore */ }
        }
        if (typeof onDone === 'function') onDone();
    };

    // Sudah senyap / tidak berputar? Langsung bereskan tanpa animasi.
    if (!_musicEnabled || el.paused || el.volume <= 0.001) {
        el.volume = 0;
        finish();
        return;
    }

    const start = el.volume;
    const t0 = performance.now();
    const step = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic, konsisten dgn fade ambient
        el.volume = start * (1 - eased);
        if (p < 1) {
            _menuMusicFadeRAF = requestAnimationFrame(step);
        } else {
            _menuMusicFadeRAF = null;
            el.volume = 0;
            finish();
        }
    };
    _menuMusicFadeRAF = requestAnimationFrame(step);
}

function playSound(type) {
    if (!audioCtx || !_sfxEnabled) return;
    try {
        const now = audioCtx.currentTime;
        const vol = _masterVolume;
        if (type === 'step') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const filter = audioCtx.createBiquadFilter();
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(220, now);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(70 + Math.random() * 15, now);
            osc.frequency.exponentialRampToValueAtTime(28, now + 0.065);

            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.065);
        } else if (type === 'pellet') {
            // Crystal Chime — bell-like glass resonance with inharmonic partials
            // (rasio non-harmonik memberi karakter "kristal/kaca" yang khas)
            const fundamental = 1180;          // C6 sebagai nada dasar terang
            const partials = [1.0, 2.0, 2.99, 4.21, 5.92]; // rasio inharmonik (bell/crystal)
            const pGains   = [0.085, 0.06, 0.045, 0.032, 0.02];
            const pDecay   = [0.55, 0.46, 0.32, 0.24, 0.16];

            partials.forEach((ratio, i) => {
                const osc = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                // campuran triangle (hangat) dan sine (bersih & berkilau)
                osc.type = (i < 2) ? 'triangle' : 'sine';
                const freq = fundamental * ratio;
                const end = now + pDecay[i];
                osc.frequency.setValueAtTime(freq, now);
                // seduikit intentional detune/shimmer (drift naik) agar terdengar hidup
                osc.frequency.linearRampToValueAtTime(freq * 1.004, end);
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(pGains[i] * vol, now + 0.008);
                g.gain.exponentialRampToValueAtTime(0.0001, end);
                osc.connect(g);
                g.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(end + 0.02);
            });

            // Treble sparkle acak — kilau "ding" khas kristal di ujung atas
            const sparkOsc = audioCtx.createOscillator();
            const sparkGain = audioCtx.createGain();
            sparkOsc.type = 'sine';
            sparkOsc.frequency.setValueAtTime(2200 + Math.random() * 600, now);
            sparkGain.gain.setValueAtTime(0.0001, now);
            sparkGain.gain.exponentialRampToValueAtTime(0.04 * vol, now + 0.008);
            sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
            sparkOsc.connect(sparkGain);
            sparkGain.connect(audioCtx.destination);
            sparkOsc.start(now);
            sparkOsc.stop(now + 0.2);
        } else if (type === 'powerup') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.setValueAtTime(440, now + 0.1);
            osc.frequency.setValueAtTime(660, now + 0.2);
            osc.frequency.setValueAtTime(880, now + 0.3);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.45);
        } else if (type === 'hit') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } else if (type === 'heartbeat') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.28);
        } else if (type === 'heartbreak') {
            // Fracture Crack Sound (Dual oscillator snap + rumble)
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(840, now);
            osc1.frequency.exponentialRampToValueAtTime(80, now + 0.4);

            osc2.type = 'square';
            osc2.frequency.setValueAtTime(240, now);
            osc2.frequency.exponentialRampToValueAtTime(30, now + 0.5);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.5);
            osc2.stop(now + 0.5);
        } else if (type === 'win') {
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.12);
                gain.gain.setValueAtTime(0.15 * vol, now + idx * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + idx * 0.12);
                osc.stop(now + idx * 0.12 + 0.3);
            });
        }
    } catch (e) {
        // Audio fallback
    }
}

// ==========================================
// SFX MP3 — POWERUP PICKUP (Reveal & Stun)
// ==========================================
// SFX pengambilan powerup memakai file MP3 asli (bukan sintetis Web Audio).
// File di-preload di awal supaya langsung berbunyi saat kristal diambil.
const POWERUP_SFX_SOURCES = {
    stun:   'audio/Stun Powerup.mp3',
    reveal: 'audio/Reveal Powerup.mp3'
};

const _powerupSfxPool = {};        // { key: [Audio, ...] }
const POWERUP_SFX_POOL_SIZE = 3;   // jumlah elemen per SFX agar pickup beruntun tidak saling memotong
const POWERUP_SFX_VOLUME = 0.9;    // skala volume relatif terhadap master volume

function _getPowerupSfxPool(key) {
    if (!POWERUP_SFX_SOURCES[key]) return null;
    if (!_powerupSfxPool[key]) {
        _powerupSfxPool[key] = [];
        for (let i = 0; i < POWERUP_SFX_POOL_SIZE; i++) {
            const el = new Audio(encodeURI(POWERUP_SFX_SOURCES[key]));
            el.preload = 'auto';
            _powerupSfxPool[key].push(el);
        }
    }
    return _powerupSfxPool[key];
}

// Preload semua SFX powerup (dipanggil dari initAudio saat game dimulai).
function _preloadPowerupSfx() {
    Object.keys(POWERUP_SFX_SOURCES).forEach(k => _getPowerupSfxPool(k));
}

function _playPowerupSfx(key) {
    if (!_sfxEnabled || _masterVolume <= 0) return;
    const pool = _getPowerupSfxPool(key);
    if (!pool) return;
    try {
        // Pakai elemen yang sedang tidak berbunyi; kalau semua sibuk, pakai yang pertama.
        const el = pool.find(a => a.paused || a.ended) || pool[0];
        try { el.currentTime = 0; } catch (e) { /* ignore */ }
        el.volume = Math.max(0, Math.min(1, POWERUP_SFX_VOLUME * _masterVolume));
        const p = el.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* ignore */ }
}

function playStunPowerupSfx() {
    _playPowerupSfx('stun');
}

function playRevealPowerupSfx() {
    _playPowerupSfx('reveal');
}

// ---- Settings Controls ----
function setMasterVolume(v) {
    _masterVolume = Math.max(0, Math.min(1, v));
    applyAmbientVolume();
    applyMenuMusicVolume();
}

function setSFXEnabled(enabled) {
    _sfxEnabled = !!enabled;
}

function setMusicVolume(v) {
    _musicVolume = Math.max(0, Math.min(1, v));
    applyAmbientVolume();
    applyMenuMusicVolume();
}

function setMusicEnabled(enabled) {
    _musicEnabled = !!enabled;
    applyAmbientVolume();
    if (_musicEnabled && _ambientUnlocked) {
        startAmbientMusic();
    } else if (_ambientEl) {
        _ambientEl.pause();
    }
    // Musik menu mengikuti toggle yang sama
    if (_menuMusicWanted) {
        if (_musicEnabled) startMenuMusic();
        else if (_menuMusicEl) _menuMusicEl.pause();
    }
}

// ---- Mouse Sensitivity (applied by PointerLockControls via game.js) ----
let _mouseSensitivity = 1.0;
function setMouseSensitivity(v) {
    _mouseSensitivity = Math.max(0.1, Math.min(5.0, v));
    // PointerLockControls uses pointerSpeed (default 1.0)
    if (typeof controls !== 'undefined' && controls.pointerSpeed !== undefined) {
        controls.pointerSpeed = _mouseSensitivity;
    }
}

// ==========================================
// 3D SPATIAL MONSTER AUDIO (positional growl)
// ==========================================
let _monsterAudio = [];          // satu sumber per monster: {osc1, osc2, lfo, panner, gain}
let _monsterAudioMuted = false;

const MONSTER_GROWL_REF = 6;         // refDistance: jarak referensi panner
const MONSTER_GROWL_MAX = 40;        // maxDistance
const MONSTER_GROWL_ROLLOFF = 2.0;   // rolloffFactor
const MONSTER_GROWL_GAIN = 0.255;    // gain dasar (dikali master volume)

function _buildMonsterSource(i) {
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    const panner = audioCtx.createPanner();
    const gain = audioCtx.createGain();

    // Menacing low drone — tiap monster punya pitch sedikit berbeda
    osc1.type = 'sawtooth';
    osc1.frequency.value = 42 + i * 8;
    osc2.type = 'triangle';
    osc2.frequency.value = 30 + i * 3.2;

    // Wobble lambat agar growl "bernapas"
    lfo.type = 'sine';
    lfo.frequency.value = 2.4 + i * 0.6;
    lfoGain.gain.value = 10;
    lfo.connect(lfoGain);
    lfoGain.connect(osc1.frequency);

    // Low-pass rolling → suara dengung bass yang dalam
    filter.type = 'lowpass';
    filter.frequency.value = 210;

    // Pengaturan posisi (spatial)
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = MONSTER_GROWL_REF;
    panner.maxDistance = MONSTER_GROWL_MAX;
    panner.rolloffFactor = MONSTER_GROWL_ROLLOFF;

    gain.gain.value = 0;

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(panner);
    panner.connect(gain);
    gain.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    lfo.start();

    return { osc1, osc2, lfo, lfoGain, filter, panner, gain };
}

function _destroyMonsterAudio() {
    _monsterAudio.forEach(e => {
        try { e.osc1.stop(); } catch (err) { /* ignore */ }
        try { e.osc2.stop(); } catch (err) { /* ignore */ }
        try { e.lfo.stop(); } catch (err) { /* ignore */ }
        try { e.osc1.disconnect(); } catch (err) { /* ignore */ }
        try { e.osc2.disconnect(); } catch (err) { /* ignore */ }
        try { e.lfo.disconnect(); } catch (err) { /* ignore */ }
        try { e.lfoGain.disconnect(); } catch (err) { /* ignore */ }
        try { e.filter.disconnect(); } catch (err) { /* ignore */ }
        try { e.panner.disconnect(); } catch (err) { /* ignore */ }
        try { e.gain.disconnect(); } catch (err) { /* ignore */ }
    });
    _monsterAudio = [];
    // Selalu reset flag mute setiap kali audio monster dibersihkan,
    // supaya sesi game berikutnya tidak mewarisi state "muted" dari sesi lama.
    _monsterAudioMuted = false;
}

function ensureMonsterAudio(count) {
    if (!audioCtx) { initAudio(); return; }
    if (_monsterAudio.length === count && count > 0) return;
    _destroyMonsterAudio();
    if (count <= 0) return;
    for (let i = 0; i < count; i++) {
        _monsterAudio.push(_buildMonsterSource(i));
    }
}

function stopMonsterAudio() {
    _destroyMonsterAudio();
}

function setMonsterAudioMuted(v) {
    _monsterAudioMuted = !!v;
    _applyMonsterGains();
}

function _monsterGainTarget() {
    if (!_monsterAudioMuted && _sfxEnabled && _masterVolume > 0) {
        return MONSTER_GROWL_GAIN * _masterVolume;
    }
    return 0;
}

function _applyMonsterGains() {
    const target = _monsterGainTarget();
    _monsterAudio.forEach(e => {
        try { e.gain.gain.value = target; } catch (err) { /* ignore */ }
    });
}

/**
 * Update audio 3D setiap frame.
 * world: {
 *   listenerX, listenerY, listenerZ,
 *   fwdX, fwdY, fwdZ,
 *   upX, upY, upZ,
 *   positions: [{x,y,z}, ...],
 *   silent: bool  // true bila monster sedang membeku (stun) dsb.
 * }
 */
function updateMonsterAudioWorld(world) {
    if (!audioCtx) return;
    try {
        const positions = (world && world.positions) || [];
        if (positions.length === 0) { _destroyMonsterAudio(); return; }

        ensureMonsterAudio(positions.length);
        if (_monsterAudio.length !== positions.length) return;

        // Listener (kepala player): posisi + orientasi
        const lis = audioCtx.listener;
        if (lis.positionX !== undefined) {
            lis.positionX.value = world.listenerX;
            lis.positionY.value = world.listenerY;
            lis.positionZ.value = world.listenerZ;
            if (lis.forwardX) {
                lis.forwardX.value = world.fwdX;
                lis.forwardY.value = world.fwdY;
                lis.forwardZ.value = world.fwdZ;
                lis.upX.value = world.upX;
                lis.upY.value = world.upY;
                lis.upZ.value = world.upZ;
            }
        } else {
            lis.setPosition(world.listenerX, world.listenerY, world.listenerZ);
            if (lis.setOrientation) {
                lis.setOrientation(world.fwdX, world.fwdY, world.fwdZ, world.upX, world.upY, world.upZ);
            }
        }

        // Place each source at its monster & set gain
        const base = (world.silent) ? 0 : _monsterGainTarget();
        for (let i = 0; i < _monsterAudio.length; i++) {
            const e = _monsterAudio[i];
            const p = positions[i];
            if (e.panner.positionX !== undefined) {
                e.panner.positionX.value = p.x;
                e.panner.positionY.value = p.y;
                e.panner.positionZ.value = p.z;
            } else {
                e.panner.setPosition(p.x, p.y, p.z);
            }
            e.gain.gain.value = base;
        }
    } catch (err) {
        // Jangan ditelan diam-diam — log supaya kalau bug muncul lagi,
        // penyebab aslinya kelihatan di console (bukan cuma "senyap tanpa error").
        console.error('[monster audio] gagal update spatial audio:', err);
    }
}