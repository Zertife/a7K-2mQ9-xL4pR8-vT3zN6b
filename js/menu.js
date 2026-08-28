// ==========================================
// MENU MANAGER — Main Menu, Level Select, Settings
// ==========================================

const MenuManager = (() => {
    const STORAGE_KEY = 'pac3d_progress';
    const TOTAL_LEVELS = 3;

    // ---- Progress Storage ----
    function loadProgress() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { unlockedLevels: 1 };
            return JSON.parse(raw);
        } catch (e) {
            return { unlockedLevels: 1 };
        }
    }

    function saveProgress(data) {
        try {
            const current = loadProgress();
            const merged = Object.assign({}, current, data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (e) { /* ignore */ }
    }

    function unlockNextLevel(completedLevel) {
        const prog = loadProgress();
        const newUnlocked = Math.max(prog.unlockedLevels || 1, completedLevel + 1);
        saveProgress({ unlockedLevels: Math.min(newUnlocked, TOTAL_LEVELS) });
    }

    function resetProgress() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ---- Screen Management ----
    const screens = {
        main: document.getElementById('main-menu'),
        difficultySelect: document.getElementById('difficulty-select'),
        levelSelect: document.getElementById('level-select'),
        settings: document.getElementById('settings-screen'),
        overlay: document.getElementById('overlay-screen'),
    };

    function hideAll() {
        Object.values(screens).forEach(el => {
            if (el) el.classList.remove('menu-visible');
        });
    }

    function show(key) {
        hideAll();
        if (screens[key]) {
            screens[key].classList.add('menu-visible');
            // Menu utama: pre-select item pertama seperti menu game konsol,
            // supaya bisa langsung dinavigasi pakai keyboard tanpa klik mouse.
            if (key === 'main') {
                const first = screens.main.querySelector('.menu-item');
                if (first) setTimeout(() => first.focus({ preventScroll: true }), 80);
            }
        }
    }

    // ---- Level Select Rendering ----
    const LEVEL_INFO = {
        1: { name: 'Grand Luxury Hotel', floor: 'Floor 1', desc: 'Classic corridor with warm lighting', icon: '', color: '#e67e22' },
        2: { name: 'Maintenance Corridors', floor: 'Basement', desc: 'Maintenance corridors', icon: '', color: '#cd6155' },
        3: { name: 'Classic Suite Labyrinth', floor: 'Penthouse', desc: 'Luxury Penthouse', icon: '', color: '#feca57' },
    };

    function renderLevelCards() {
        const container = document.getElementById('level-cards');
        if (!container) return;
        const prog = loadProgress();
        const unlocked = prog.unlockedLevels || 1;

        container.innerHTML = '';
        for (let i = 1; i <= TOTAL_LEVELS; i++) {
            const info = LEVEL_INFO[i];
            const isUnlocked = i <= unlocked;
            const isCompleted = i < unlocked || (prog.allCompleted && i === TOTAL_LEVELS);

            const card = document.createElement('div');
            card.className = 'level-card' + (isUnlocked ? ' unlocked' : ' locked') + (isCompleted ? ' completed' : '');
            card.setAttribute('data-level', i);

            card.innerHTML = `
                <div class="level-card-lock" aria-hidden="${isUnlocked}">${isUnlocked ? '' : '🔒'}</div>
                <div class="level-card-icon">${isUnlocked ? info.icon : '🔒'}</div>
                <div class="level-card-num">Level ${i}</div>
                <div class="level-card-name">${info.name}</div>
                <div class="level-card-floor">${info.floor}</div>
                <div class="level-card-desc">${isUnlocked ? info.desc : 'Selesaikan level sebelumnya untuk membuka'}</div>
                ${isCompleted ? '<div class="level-card-badge">Selesai</div>' : ''}
                ${isUnlocked && !isCompleted ? `<div class="level-card-badge available" style="background:${info.color}22; color:${info.color}; border-color:${info.color}55;">▶ Mainkan</div>` : ''}
            `;

            if (isUnlocked) {
                card.addEventListener('click', () => {
                    startGameFromMenu(i);
                });
            }

            container.appendChild(card);
        }

        const unlockInfo = document.getElementById('ls-unlock-info');
        if (unlockInfo) {
            const diff = (typeof getDifficultyConfig === 'function') ? getDifficultyConfig() : { label: 'Normal', monsterCount: 4 };
            unlockInfo.textContent = `·  🔒︎ Complete previous levels to unlock`;
        }
    }

    // ---- Settings Logic ----
    const SETTINGS_KEY = 'pac3d_settings';

    function defaultSettings() {
        return {
            masterVolume: 0.7,
            musicVolume: 0.5,
            musicEnabled: true,
            sfxEnabled: true,
            sensitivity: 1.0,
            difficulty: 'normal',
            controlMode: (typeof getDefaultControlMode === 'function') ? getDefaultControlMode() : 'pc',
            controlModeExplicit: false,
            joystickScale: 1.0,
            minimapScale: 1.0
        };
    }

    function loadSettings() {
        const defaults = defaultSettings();
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return defaults;
            const saved = JSON.parse(raw);
            if (!saved || typeof saved !== 'object') return defaults;

            const merged = Object.assign({}, defaults, saved);
            // Versi lama selalu menyimpan/fallback ke PC. Di ponsel, nilai lama
            // itu dimigrasikan otomatis ke Mobile sampai user benar-benar memilih
            // mode secara manual (controlModeExplicit=true).
            if (saved.controlModeExplicit !== true) {
                merged.controlMode = defaults.controlMode;
                merged.controlModeExplicit = false;
            } else {
                merged.controlMode = saved.controlMode === 'mobile' ? 'mobile' : 'pc';
            }
            return merged;
        } catch (e) {
            return defaults;
        }
    }

    function saveSettings(data) {
        try {
            const current = loadSettings();
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.assign({}, current, data)));
        } catch (e) { /* ignore */ }
    }

    function applySettings() {
        const s = loadSettings();
        // Apply volume to audio context if available
        if (typeof setMasterVolume === 'function') setMasterVolume(s.masterVolume);
        if (typeof setMusicVolume === 'function') setMusicVolume(s.musicVolume ?? 0.5);
        if (typeof setMusicEnabled === 'function') setMusicEnabled(s.musicEnabled !== false);
        if (typeof setSFXEnabled === 'function') setSFXEnabled(s.sfxEnabled);
        // Apply sensitivity to game controls
        if (typeof setMouseSensitivity === 'function') setMouseSensitivity(s.sensitivity);
        if (typeof setCurrentDifficulty === 'function') setCurrentDifficulty(s.difficulty || 'normal');

        const volSlider = document.getElementById('setting-volume');
        const musicSlider = document.getElementById('setting-music');
        const sfxToggle = document.getElementById('setting-sfx');
        const musicToggle = document.getElementById('setting-music-enabled');
        const sensSlider = document.getElementById('setting-sensitivity');
        const volVal = document.getElementById('setting-volume-val');
        const musicVal = document.getElementById('setting-music-val');
        const sensVal = document.getElementById('setting-sensitivity-val');

        if (volSlider) { volSlider.value = s.masterVolume; }
        if (musicSlider) { musicSlider.value = s.musicVolume ?? 0.5; }
        if (sfxToggle) { sfxToggle.checked = s.sfxEnabled; }
        if (musicToggle) { musicToggle.checked = s.musicEnabled !== false; }
        if (sensSlider) { sensSlider.value = s.sensitivity; }
        if (volVal) volVal.textContent = Math.round(s.masterVolume * 100) + '%';
        if (musicVal) musicVal.textContent = Math.round((s.musicVolume ?? 0.5) * 100) + '%';
        if (sensVal) sensVal.textContent = parseFloat(s.sensitivity).toFixed(1) + 'x';

        // Terapkan mode kontrol (PC / Mobile): sinkronkan toggle di main menu
        // dan kabari game.js lewat setControlMode().
        const controlMode = (s.controlMode === 'mobile') ? 'mobile' : 'pc';
        applyControlModeUI(controlMode);
        if (typeof setControlMode === 'function') setControlMode(controlMode);

        // Terapkan ukuran joystick (efeknya terlihat di mode Mobile).
        applyJoystickScale(s.joystickScale ?? 1.0);

        // Terapkan ukuran minimap (efeknya terlihat di mode Mobile).
        applyMinimapScale(s.minimapScale ?? 1.0);
    }

    // ---- Control Mode Toggle (PC / Mobile) di main menu ----
    // Update tampilan segmented switch + hint kontrol di footer menu.
    function applyControlModeUI(mode) {
        const switchEl = document.getElementById('control-mode-switch');
        if (switchEl) {
            switchEl.classList.toggle('mode-mobile', mode === 'mobile');
            switchEl.querySelectorAll('.control-mode-option').forEach(btn => {
                const isActive = btn.getAttribute('data-mode') === mode;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
            });
        }

        // Hint kontrol di footer main menu mengikuti mode yang dipilih.
        const footControls = document.querySelector('#main-menu .menu-foot-controls');
        if (footControls) {
            footControls.innerHTML = (mode === 'mobile')
                ? '<span class="menu-foot-key">Joystick</span> Move <span class="menu-foot-dot">&bull;</span> <span class="menu-foot-key">Drag</span> Camera <span class="menu-foot-dot">&bull;</span> <span class="menu-foot-key">⏸</span> Pause'
                : '<span class="menu-foot-key">W A S D</span> Move <span class="menu-foot-dot">&bull;</span> <span class="menu-foot-key">Mouse</span> Camera <span class="menu-foot-dot">&bull;</span> <span class="menu-foot-key">P</span> Pause';
        }

        // Pengaturan ukuran joystick hanya relevan di mode Mobile —
        // redupkan barisnya (slider tak bisa digeser) saat mode PC.
        const joyRow = document.getElementById('setting-joystick-row');
        if (joyRow) joyRow.classList.toggle('mobile-only-disabled', mode !== 'mobile');

        // Pengaturan ukuran minimap juga hanya berlaku di mode Mobile.
        const minimapRow = document.getElementById('setting-minimap-row');
        if (minimapRow) minimapRow.classList.toggle('mobile-only-disabled', mode !== 'mobile');
    }

    // ---- Ukuran Joystick (setting, hanya berlaku di mode Mobile) ----
    // Skala diteruskan ke CSS lewat custom property --joy-scale pada <body>;
    // #joystick-base & #joystick-knob memakai calc(px * var(--joy-scale)).
    function applyJoystickScale(scale) {
        const v = Math.min(1.8, Math.max(0.7, parseFloat(scale) || 1.0));
        document.body.style.setProperty('--joy-scale', v);

        const slider = document.getElementById('setting-joystick-size');
        const val = document.getElementById('setting-joystick-size-val');
        if (slider) slider.value = v;
        if (val) val.textContent = parseFloat(v).toFixed(1) + 'x';
        return v;
    }

    // ---- Ukuran Minimap (setting, hanya berlaku di mode Mobile) ----
    // Skala diteruskan ke CSS lewat custom property --minimap-scale pada <body>;
    // #minimap-frame & #minimap-container memakai calc(px * var(--minimap-scale)).
    function applyMinimapScale(scale) {
        const v = Math.min(1.5, Math.max(0.7, parseFloat(scale) || 1.0));
        document.body.style.setProperty('--minimap-scale', v);

        const slider = document.getElementById('setting-minimap-size');
        const val = document.getElementById('setting-minimap-size-val');
        if (slider) slider.value = v;
        if (val) val.textContent = parseFloat(v).toFixed(1) + 'x';
        return v;
    }

    function initSettingsEvents() {
        const volSlider = document.getElementById('setting-volume');
        const musicSlider = document.getElementById('setting-music');
        const sfxToggle = document.getElementById('setting-sfx');
        const musicToggle = document.getElementById('setting-music-enabled');
        const sensSlider = document.getElementById('setting-sensitivity');
        const volVal = document.getElementById('setting-volume-val');
        const musicVal = document.getElementById('setting-music-val');
        const sensVal = document.getElementById('setting-sensitivity-val');
        const resetBtn = document.getElementById('settings-reset-btn');

        if (volSlider) {
            volSlider.addEventListener('input', () => {
                const v = parseFloat(volSlider.value);
                if (volVal) volVal.textContent = Math.round(v * 100) + '%';
                saveSettings({ masterVolume: v });
                if (typeof setMasterVolume === 'function') setMasterVolume(v);
            });
        }

        if (musicSlider) {
            musicSlider.addEventListener('input', () => {
                const v = parseFloat(musicSlider.value);
                if (musicVal) musicVal.textContent = Math.round(v * 100) + '%';
                saveSettings({ musicVolume: v });
                if (typeof setMusicVolume === 'function') setMusicVolume(v);
            });
        }

        if (sfxToggle) {
            sfxToggle.addEventListener('change', () => {
                saveSettings({ sfxEnabled: sfxToggle.checked });
                if (typeof setSFXEnabled === 'function') setSFXEnabled(sfxToggle.checked);
            });
        }

        if (musicToggle) {
            musicToggle.addEventListener('change', () => {
                saveSettings({ musicEnabled: musicToggle.checked });
                if (typeof setMusicEnabled === 'function') setMusicEnabled(musicToggle.checked);
            });
        }

        if (sensSlider) {
            sensSlider.addEventListener('input', () => {
                const v = parseFloat(sensSlider.value);
                if (sensVal) sensVal.textContent = v.toFixed(1) + 'x';
                saveSettings({ sensitivity: v });
                if (typeof setMouseSensitivity === 'function') setMouseSensitivity(v);
            });
        }

        // Ukuran joystick (mode Mobile) — simpan & terapkan langsung
        // lewat CSS var --joy-scale (dibaca oleh #joystick-base/knob).
        const joySizeSlider = document.getElementById('setting-joystick-size');
        if (joySizeSlider) {
            joySizeSlider.addEventListener('input', () => {
                const v = parseFloat(joySizeSlider.value) || 1.0;
                saveSettings({ joystickScale: v });
                applyJoystickScale(v);
            });
        }

        // Ukuran minimap (mode Mobile) — simpan & terapkan langsung
        // lewat CSS var --minimap-scale (dibaca oleh #minimap-frame/container).
        const minimapSizeSlider = document.getElementById('setting-minimap-size');
        if (minimapSizeSlider) {
            minimapSizeSlider.addEventListener('input', () => {
                const v = parseFloat(minimapSizeSlider.value) || 1.0;
                saveSettings({ minimapScale: v });
                applyMinimapScale(v);
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset semua progress & settings? Data level yang sudah dibuka akan hilang.')) {
                    resetProgress();
                    localStorage.removeItem(SETTINGS_KEY);
                    applySettings();
                    renderLevelCards();
                    showNotificationMenu('Progress & settings direset!');
                }
            });
        }

        // Toggle mode kontrol (PC / Mobile) di main menu.
        // Klik salah satu opsi → simpan ke settings, geser thumb, dan
        // beritahu game.js (setControlMode) untuk memakai joystick/drag-look.
        const controlModeSwitch = document.getElementById('control-mode-switch');
        if (controlModeSwitch) {
            controlModeSwitch.querySelectorAll('.control-mode-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = (btn.getAttribute('data-mode') === 'mobile') ? 'mobile' : 'pc';
                    saveSettings({ controlMode: mode, controlModeExplicit: true });
                    applyControlModeUI(mode);
                    if (typeof setControlMode === 'function') setControlMode(mode);
                });
            });
        }
    }

    function showNotificationMenu(text) {
        const el = document.getElementById('notification');
        if (!el) return;
        el.innerText = text;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 2600);
    }

    // ---- Navigation API ----
    function openMainMenu() {
        show('main');
        if (typeof stopAmbientMusic === 'function') stopAmbientMusic();
        // Mulai / lanjutkan musik menu (main-menu.mp3)
        if (typeof startMenuMusic === 'function') startMenuMusic();
    }

    function highlightDifficultyCards() {
        const selected = (typeof currentDifficulty !== 'undefined' ? currentDifficulty : 'normal');
        document.querySelectorAll('.diff-card').forEach(card => {
            card.classList.toggle('selected', card.getAttribute('data-difficulty') === selected);
        });
    }

    function chooseDifficulty(id) {
        const chosen = (typeof setCurrentDifficulty === 'function') ? setCurrentDifficulty(id) : (id || 'normal');
        saveSettings({ difficulty: chosen });
        highlightDifficultyCards();
        openLevelSelect();
    }

    function openDifficultySelect() {
        if (typeof setCurrentDifficulty === 'function') {
            const s = loadSettings();
            setCurrentDifficulty(s.difficulty || 'normal');
        }
        highlightDifficultyCards();
        show('difficultySelect');
    }

    function openLevelSelect() {
        renderLevelCards();
        show('levelSelect');
    }

    function openSettings() {
        applySettings();
        show('settings');
    }

    function closeMenus() {
        hideAll();
        // Menu ditutup (game dimulai) → hentikan musik menu
        if (typeof stopMenuMusic === 'function') stopMenuMusic();
    }

    // ---- Transisi sinematik pemilihan level ----
    // Alur: klik kartu level → musik menu di-fade-out + layar menghitam
    // secara perlahan → setelah gelap penuh, menu ditutup dan startGame()
    // dijalankan. startGame() menampilkan animasi nama level (showMapIntro)
    // di atas layer hitam, lalu layer hitam di-fade-out bersamaan dengannya.
    let _levelTransitionBusy = false;

    function beginLevelTransition(level) {
        if (_levelTransitionBusy) return;
        _levelTransitionBusy = true;

        // Dipanggil langsung dari gesture klik/tap kartu level. Ini penting di
        // iOS/Android agar Web Audio di-unlock sebelum transisi setTimeout.
        if (typeof initAudio === 'function') {
            try { initAudio(); } catch (e) { /* audio opsional, game tetap lanjut */ }
        }

        const MUSIC_FADE_MS = 1100;                 // durasi fade-out musik menu
        const BLACK_FADE_MS = 1000;                 // durasi fade ke hitam (CSS #level-transition)
        const START_DELAY_MS = BLACK_FADE_MS + 150; // mulai game saat layar sudah hitam penuh

        // Lepas fokus dari kartu agar Enter/Space tidak memicu klik ganda.
        try {
            if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        } catch (e) { /* ignore */ }

        // 1) Musik menu mengecil secara halus (bukan langsung berhenti).
        if (typeof fadeOutMenuMusic === 'function') {
            fadeOutMenuMusic(MUSIC_FADE_MS);
        }

        // 2) Layar menghitam secara sinematik.
        const transitionEl = document.getElementById('level-transition');
        if (transitionEl) {
            transitionEl.style.transition = '';
            transitionEl.style.opacity = '';
            transitionEl.classList.remove('active');
            void transitionEl.offsetWidth;          // restart transisi bila overlay baru saja dipakai
            transitionEl.classList.add('active');
        }

        // 3) Setelah layar hitam penuh → tutup menu & mulai game.
        setTimeout(() => {
            closeMenus();
            startGame(level);

            if (transitionEl) {
                // Fade-out overlay bersamaan dengan fade-in intro nama level
                // (map intro z-index 200 > overlay 120 → nama tampil di atas hitam).
                transitionEl.style.transition = 'opacity 0.7s ease';
                transitionEl.style.opacity = '0';
                transitionEl.classList.remove('active');
                setTimeout(() => {
                    transitionEl.style.transition = '';
                    transitionEl.style.opacity = '';
                    _levelTransitionBusy = false;
                }, 750);
            } else {
                _levelTransitionBusy = false;
            }
        }, START_DELAY_MS);
    }

    // ---- Wire up DOM events ----
    function initEvents() {
        // Main menu buttons
        const playBtn = document.getElementById('menu-play-btn');
        const settingsBtn = document.getElementById('menu-settings-btn');

        if (playBtn) playBtn.addEventListener('click', openDifficultySelect);
        if (settingsBtn) settingsBtn.addEventListener('click', openSettings);

        // Difficulty select
        const diffBackBtn = document.getElementById('difficulty-back-btn');
        if (diffBackBtn) diffBackBtn.addEventListener('click', openMainMenu);
        document.querySelectorAll('.diff-card').forEach(card => {
            card.addEventListener('click', () => {
                chooseDifficulty(card.getAttribute('data-difficulty'));
            });
        });

        // Level select back
        const levelBackBtn = document.getElementById('levelselect-back-btn');
        if (levelBackBtn) levelBackBtn.addEventListener('click', openDifficultySelect);

        // Settings back
        const settingsBackBtn = document.getElementById('settings-back-btn');
        if (settingsBackBtn) settingsBackBtn.addEventListener('click', openMainMenu);

        // Fullscreen toggle at main menu
        const fullscreenBtn = document.getElementById('menu-fullscreen-btn');
        if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

        initSettingsEvents();

        // ---- Navigasi keyboard ala game ----
        document.addEventListener('keydown', (e) => {
            // Jangan ganggu input form (slider, toggle, dll.)
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

            // Abaikan navigasi menu saat transisi pemilihan level berlangsung
            // (layar sedang menghitam — menu sudah tidak boleh diganggu gugat).
            if (_levelTransitionBusy) return;

            // Menu utama: panah atas/bawah (atau W/S) memindahkan pilihan
            if (screens.main && screens.main.classList.contains('menu-visible')) {
                const items = Array.from(screens.main.querySelectorAll('.menu-item'));
                if (!items.length) return;
                const idx = items.indexOf(document.activeElement);
                let next = -1;
                if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') next = (idx + 1) % items.length;
                else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') next = (idx - 1 + items.length) % items.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = items.length - 1;
                if (next >= 0) {
                    e.preventDefault();
                    items[next].focus({ preventScroll: true });
                }
                return;
            }

            // Escape kembali ke layar sebelumnya (ala menu konsol)
            if (e.key === 'Escape') {
                if (screens.levelSelect && screens.levelSelect.classList.contains('menu-visible')) {
                    e.preventDefault();
                    openDifficultySelect();
                } else if (screens.difficultySelect && screens.difficultySelect.classList.contains('menu-visible')) {
                    e.preventDefault();
                    openMainMenu();
                } else if (screens.settings && screens.settings.classList.contains('menu-visible')) {
                    e.preventDefault();
                    openMainMenu();
                }
            }
        });
    }

    // ---- Fullscreen Toggle (main menu) ----
    // Multi-browser (webkit/moz/ms prefix) agar fullscreen bekerja di berbagai
    // browser, termasuk Safari & browser lama.
    function isFullscreen() {
        return !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);
    }

    function updateFullscreenBtn() {
        const active = isFullscreen();
        const label = document.getElementById('menu-fullscreen-label');
        const note = document.getElementById('menu-fullscreen-note');
        if (label) label.textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
        if (note) note.textContent = active ? 'Return to window' : 'Go fullscreen';
    }

    function toggleFullscreen() {
        try { initAudio(); } catch (e) { /* audio opsional */ }

        const fsEl = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;

        if (!fsEl) {
            const el = document.documentElement;
            const req = el.requestFullscreen || el.webkitRequestFullscreen ||
                el.mozRequestFullScreen || el.msRequestFullscreen;
            if (req) {
                const p = req.call(el);
                if (p && p.catch) p.catch(() => { /* ditolak pengguna/browser */ });
            }
        } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen ||
                document.mozCancelFullScreen || document.msExitFullscreen;
            if (exit) {
                const p = exit.call(document);
                if (p && p.catch) p.catch(() => { /* ignore */ });
            }
        }
    }

    // ---- Init ----
    function init() {
        // Pantau perubahan status fullscreen untuk memperbarui teks tombol.
        document.addEventListener('fullscreenchange', updateFullscreenBtn);
        document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
        document.addEventListener('mozfullscreenchange', updateFullscreenBtn);
        document.addEventListener('MSFullscreenChange', updateFullscreenBtn);
        updateFullscreenBtn();

        initEvents();
        applySettings();
        openMainMenu();
    }

    return {
        init,
        openMainMenu,
        openDifficultySelect,
        openLevelSelect,
        openSettings,
        closeMenus,
        beginLevelTransition,
        unlockNextLevel,
        loadProgress,
        saveProgress,
        loadSettings,
        applySettings,
    };
})();

// Helper: called by level cards (menu) to start game from a specific level.
// Tidak langsung masuk game — jalankan transisi sinematik dulu:
// musik menu fade-out + layar menghitam, baru startGame() dengan
// animasi nama level.
function startGameFromMenu(level) {
    MenuManager.beginLevelTransition(level);
}

// ---- Auto-Initialize on Load ----
// menu.js loads last, all DOM and game scripts are ready
MenuManager.init();

// Apply saved settings immediately (volume, sensitivity, etc.)
(function applyInitialSettings() {
    const s = MenuManager.loadSettings();
    if (typeof setMasterVolume === 'function') setMasterVolume(s.masterVolume ?? 0.7);
    if (typeof setMusicVolume === 'function') setMusicVolume(s.musicVolume ?? 0.5);
    if (typeof setMusicEnabled === 'function') setMusicEnabled(s.musicEnabled !== false);
    if (typeof setSFXEnabled === 'function') setSFXEnabled(s.sfxEnabled !== false);
    if (typeof setMouseSensitivity === 'function') setMouseSensitivity(s.sensitivity ?? 1.0);
    if (typeof setCurrentDifficulty === 'function') setCurrentDifficulty(s.difficulty ?? 'normal');
})();
