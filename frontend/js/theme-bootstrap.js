(function () {
  'use strict';

  var THEME_KEY = 'theme';
  var MODE_KEY = 'bibliotech_theme_mode';
  var THEMES = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
  var MODES = ['light', 'dark'];
  var LEGACY_DARK_THEMES = ['dark', 'forest', 'ocean', 'violet', 'mono'];
  var VARIABLE_KEYS = [
    '--bg', '--bg-soft', '--surface', '--surface-strong', '--surface-muted',
    '--text', '--muted', '--border', '--accent', '--accent-strong',
    '--accent-soft', '--on-accent', '--gold', '--blue', '--danger',
    '--danger-soft', '--ok', '--ok-soft'
  ];

  var THEME_META = {
    light: { name: 'Классика', description: 'зелёная библиотека', icon: 'appicon-light.png' },
    dark: { name: 'Графит', description: 'мята и антрацит', icon: 'appicon-dark.png' },
    forest: { name: 'Лесная', description: 'мох и зелёные листья', icon: 'appicon-forest.png' },
    ocean: { name: 'Океан', description: 'сине-бирюзовая', icon: 'appicon-ocean.png' },
    sunset: { name: 'Закат', description: 'оранжево-розовая', icon: 'appicon-sunset.png' },
    violet: { name: 'Фиолетовая', description: 'лаванда и неон', icon: 'appicon-violet.png' },
    coffee: { name: 'Кофейная', description: 'уют и бумага', icon: 'appicon-coffee.png' },
    mono: { name: 'Монохром', description: 'чёрно-белый минимализм', icon: 'appicon-mono.png' }
  };

  var PALETTE_VALUES = {
    light: {
      light: ['#f5f2ec','#fbfaf6','#ffffff','#ffffff','#eef4ef','#1e2521','#68736c','rgba(31, 43, 36, 0.13)','#2f7d5a','#216245','#dfeee5','#ffffff','#c2953e','#2f6fb3','#b74c43','#fae7e4','#267d56','#e0f2e8'],
      dark: ['#071711','#0d241a','#132d22','#173629','#1b3c2e','#f0fbf5','#aac6b6','rgba(216, 255, 232, 0.15)','#79d99e','#b9ef7d','rgba(121, 217, 158, 0.15)','#06130d','#e4bd61','#82baff','#ff9188','rgba(255, 145, 136, 0.13)','#8be1a7','rgba(139, 225, 167, 0.13)']
    },
    dark: {
      light: ['#edf1ef','#f7f9f8','#ffffff','#ffffff','#e4ebe7','#1c2420','#5f6b65','rgba(28, 42, 35, 0.14)','#496b5d','#2c4e40','#dce8e2','#ffffff','#a88947','#4a7398','#ac4c49','#f7e5e4','#3c765d','#dfede6'],
      dark: ['#0b0f0d','#121815','#19211d','#1d2822','#232f29','#f0f5f2','#aab7b0','rgba(239, 247, 243, 0.14)','#96cab3','#c7ed9a','rgba(150, 202, 179, 0.14)','#08110d','#d7b764','#8db8ef','#f58d89','rgba(245, 141, 137, 0.13)','#8fd4ad','rgba(143, 212, 173, 0.13)']
    },
    forest: {
      light: ['#edf8f0','#f7fcf8','#ffffff','#ffffff','#e0f1e5','#183021','#5e7867','rgba(30, 93, 54, 0.16)','#247343','#195a33','#d7efdf','#ffffff','#b58d35','#3977a8','#b84d48','#f9e6e3','#26784b','#dbefe3'],
      dark: ['#071b13','#0e2a1f','#142f24','#18382a','#1d3c2f','#f1fff6','#b5cfbf','rgba(202, 255, 217, 0.15)','#83df93','#c0f275','rgba(131, 223, 147, 0.14)','#07130d','#e6c15d','#7db9ff','#ff9188','rgba(255, 145, 136, 0.13)','#94e5aa','rgba(148, 229, 170, 0.13)']
    },
    ocean: {
      light: ['#eaf7fc','#f7fcfe','#ffffff','#ffffff','#dceff6','#17313d','#5d7682','rgba(23, 93, 121, 0.16)','#086f93','#075a78','#d5eff8','#ffffff','#c39638','#2f70b7','#b74e4b','#fae7e5','#247b68','#dcefe9'],
      dark: ['#071724','#0d2434','#122f43','#16384f','#173a52','#effaff','#adcad7','rgba(199, 239, 255, 0.16)','#50c8e8','#92efd8','rgba(80, 200, 232, 0.15)','#051821','#f1c56d','#8ab7ff','#ff938f','rgba(255, 147, 143, 0.13)','#86dcc7','rgba(134, 220, 199, 0.13)']
    },
    sunset: {
      light: ['#fff3e3','#fffaf3','#ffffff','#ffffff','#f8ece1','#38261d','#7a6254','rgba(113, 73, 49, 0.16)','#a84731','#873421','#fae4d9','#ffffff','#d5a33e','#3b75a8','#b84f49','#fae7e4','#3c7d57','#e2f0e7'],
      dark: ['#24100d','#351712','#472019','#55261d','#5a2b22','#fff5ee','#d8b2a2','rgba(255, 224, 209, 0.16)','#ff8a61','#ffb06d','rgba(255, 138, 97, 0.15)','#2a0d08','#efc268','#88b9ec','#ff9690','rgba(255, 150, 144, 0.13)','#91d5a4','rgba(145, 213, 164, 0.13)']
    },
    violet: {
      light: ['#f5eefb','#fbf8fe','#ffffff','#ffffff','#ece2f5','#33213e','#725f7e','rgba(98, 60, 124, 0.16)','#8553bd','#67399c','#eadcf6','#ffffff','#bb913a','#5571b1','#b44d63','#f8e5ea','#39795d','#dfede6'],
      dark: ['#15091f','#21102f','#28183a','#301d45','#342149','#fbf4ff','#cfbddf','rgba(232, 206, 255, 0.17)','#b98cff','#f0a8ff','rgba(185, 140, 255, 0.16)','#16091f','#f4c76a','#9bb8ff','#ff8d9c','rgba(255, 141, 156, 0.13)','#9fe7c0','rgba(159, 231, 192, 0.13)']
    },
    coffee: {
      light: ['#f3e9dc','#fff8ee','#fffdf8','#fffdf8','#efe1d2','#30231b','#705c4d','rgba(90, 58, 36, 0.18)','#8e6749','#67462f','#ead9c8','#ffffff','#c09552','#3e6f94','#ae514a','#f7e5e1','#58775b','#e3ece3'],
      dark: ['#1c120d','#281a13','#332219','#3c281e','#432e23','#f8eadf','#c8ae9c','rgba(255, 231, 211, 0.15)','#d09a6d','#f1bd86','rgba(208, 154, 109, 0.15)','#21110a','#e2bc6a','#89b0d6','#f09187','rgba(240, 145, 135, 0.13)','#9bd0a1','rgba(155, 208, 161, 0.13)']
    },
    mono: {
      light: ['#f2f2f2','#fafafa','#ffffff','#ffffff','#e8e8e8','#171717','#666666','rgba(0, 0, 0, 0.14)','#3a3a3a','#111111','#dedede','#ffffff','#777777','#555555','#9a3f3f','#f1dddd','#416a4b','#e0ebe2'],
      dark: ['#111111','#181818','#202020','#242424','#2a2a2a','#f3f3f3','#b9b9b9','rgba(255, 255, 255, 0.14)','#f0f0f0','#ffffff','rgba(255, 255, 255, 0.12)','#111111','#cfcfcf','#d8d8d8','#ff9292','rgba(255, 146, 146, 0.13)','#b9dfbf','rgba(185, 223, 191, 0.13)']
    }
  };

  var currentState = null;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (error) {}
  }

  function normalizeTheme(theme) {
    return THEMES.indexOf(theme) !== -1 ? theme : 'forest';
  }

  function normalizeMode(mode, theme) {
    if (MODES.indexOf(mode) !== -1) return mode;
    return LEGACY_DARK_THEMES.indexOf(theme) !== -1 ? 'dark' : 'light';
  }

  function readQuery(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; }
    catch (error) { return ''; }
  }

  function getStoredState() {
    var savedTheme = safeGet(THEME_KEY);
    var queryTheme = readQuery('theme');
    var theme = normalizeTheme(savedTheme || queryTheme || 'forest');
    var savedMode = safeGet(MODE_KEY);
    var queryMode = readQuery('mode');
    var mode = normalizeMode(savedMode || queryMode, theme);

    if (!savedTheme && queryTheme && THEMES.indexOf(queryTheme) !== -1) safeSet(THEME_KEY, theme);
    if (!savedMode) safeSet(MODE_KEY, mode);
    return { theme: theme, mode: mode };
  }

  function buildVariables(theme, mode) {
    var values = PALETTE_VALUES[theme][mode];
    var variables = {};
    VARIABLE_KEYS.forEach(function (key, index) { variables[key] = values[index]; });
    variables['--bg-lift'] = variables['--bg-soft'];
    variables['--shadow'] = mode === 'dark'
      ? '0 24px 68px rgba(0, 0, 0, 0.36)'
      : '0 20px 58px rgba(20, 42, 31, 0.13)';
    variables['--shadow-soft'] = mode === 'dark'
      ? '0 12px 34px rgba(0, 0, 0, 0.27)'
      : '0 10px 30px rgba(20, 42, 31, 0.09)';
    variables['--focus'] = '0 0 0 3px color-mix(in srgb, var(--accent) 28%, transparent)';
    variables['--ui-line'] = 'color-mix(in srgb, var(--border) 86%, transparent)';
    variables['--ui-glass'] = 'color-mix(in srgb, var(--surface) 88%, transparent)';
    variables['--ui-accent-glow'] = 'color-mix(in srgb, var(--accent) 19%, transparent)';
    return variables;
  }

  function removeThemeClasses(element) {
    if (!element || !element.classList) return;
    THEMES.forEach(function (theme) { element.classList.remove('theme-' + theme); });
    MODES.forEach(function (mode) { element.classList.remove('theme-mode-' + mode); });
    element.classList.remove('dark-theme');
  }

  function applyToElement(element, theme, mode, variables) {
    if (!element) return;
    removeThemeClasses(element);
    element.classList.add('theme-' + theme, 'theme-mode-' + mode);
    if (mode === 'dark') element.classList.add('dark-theme');
    element.dataset.theme = theme;
    element.dataset.themeMode = mode;
    element.style.colorScheme = mode;
    Object.keys(variables).forEach(function (name) {
      if (element.style.getPropertyValue(name) !== variables[name]) {
        element.style.setProperty(name, variables[name]);
      }
    });
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function setAttribute(element, name, value) {
    if (element && element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value));
  }

  function setLink(rel, attrs) {
    var link = document.querySelector('link[rel="' + rel + '"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    Object.keys(attrs || {}).forEach(function (key) {
      setAttribute(link, key, attrs[key]);
    });
    return link;
  }

  function updateBrandAssets(theme, mode) {
    var meta = THEME_META[theme] || THEME_META.light;
    var iconPath = 'img/' + meta.icon;
    setLink('icon', { type: 'image/png', href: iconPath });
    setLink('apple-touch-icon', { href: iconPath });
    setLink('manifest', { href: '/manifest.webmanifest?theme=' + encodeURIComponent(theme) + '&mode=' + encodeURIComponent(mode) });

    document.querySelectorAll('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img').forEach(function (img) {
      var absolute = new URL(iconPath, document.baseURI).href;
      if (img.src !== absolute) img.src = iconPath;
      if (img.hasAttribute('srcset')) img.removeAttribute('srcset');
    });
  }

  function updateMetaThemeColor(variables) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    setAttribute(meta, 'content', variables['--bg'] || '#f5f2ec');
  }

  function updatePresetLabels() {
    document.querySelectorAll('.theme-preset[data-theme]').forEach(function (button) {
      var theme = normalizeTheme(button.dataset.theme);
      var meta = THEME_META[theme];
      setText(button.querySelector('b'), meta.name);
      setText(button.querySelector('small'), meta.description);
    });
  }

  function updateControls(theme, mode) {
    var meta = THEME_META[theme] || THEME_META.light;
    var dark = mode === 'dark';
    var title = 'Сделать тему «' + meta.name + '» ' + (dark ? 'светлее' : 'темнее');

    ['floatingThemeToggle', 'authThemeToggle'].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      setText(button, dark ? '☀️' : '🌙');
      button.title = title;
      setAttribute(button, 'aria-label', title);
      setAttribute(button, 'aria-pressed', String(dark));
      button.dataset.themeMode = mode;
      button.dataset.themeName = meta.name;
    });

    updatePresetLabels();
    document.querySelectorAll('.theme-preset[data-theme]').forEach(function (button) {
      var active = button.dataset.theme === theme;
      button.classList.toggle('active', active);
      setAttribute(button, 'aria-pressed', String(active));
      if (active) button.dataset.activeMode = mode;
      else delete button.dataset.activeMode;
    });

    document.querySelectorAll('.theme-settings-badge').forEach(function (badge) {
      setText(badge, '8 тем · ' + (dark ? 'тёмный' : 'светлый') + ' режим');
      badge.dataset.themeMode = mode;
      badge.title = 'Цвет: ' + meta.name + '. Яркость: ' + (dark ? 'тёмная' : 'светлая') + '.';
    });
  }

  function emitThemeChange(theme, mode) {
    try {
      window.dispatchEvent(new CustomEvent('bibliotech:themechange', { detail: { theme: theme, mode: mode } }));
    } catch (error) {}
  }

  function apply(theme, mode, options) {
    options = options || {};
    var normalizedTheme = normalizeTheme(theme);
    var normalizedMode = normalizeMode(mode, normalizedTheme);
    var variables = buildVariables(normalizedTheme, normalizedMode);

    currentState = { theme: normalizedTheme, mode: normalizedMode };
    if (options.persist !== false) {
      safeSet(THEME_KEY, normalizedTheme);
      safeSet(MODE_KEY, normalizedMode);
    }

    applyToElement(document.documentElement, normalizedTheme, normalizedMode, variables);
    if (document.body) applyToElement(document.body, normalizedTheme, normalizedMode, variables);
    updateMetaThemeColor(variables);
    updateBrandAssets(normalizedTheme, normalizedMode);
    updateControls(normalizedTheme, normalizedMode);
    if (options.emit !== false) emitThemeChange(normalizedTheme, normalizedMode);
    return { theme: normalizedTheme, mode: normalizedMode };
  }

  function getState() {
    return currentState || getStoredState();
  }

  function selectTheme(theme, options) {
    var state = getState();
    return apply(theme, state.mode, options);
  }

  function setMode(mode, options) {
    var state = getState();
    return apply(state.theme, mode, options);
  }

  function toggleMode(options) {
    var state = getState();
    return apply(state.theme, state.mode === 'dark' ? 'light' : 'dark', options);
  }

  function announce(message, type) {
    if (typeof window.notify === 'function') window.notify(message, type || 'info');
  }

  function bindModeButton(button) {
    if (!button || button.dataset.pairedThemeReady === 'true') return;
    button.dataset.pairedThemeReady = 'true';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      var next = toggleMode();
      var meta = THEME_META[next.theme];
      announce('Тема «' + meta.name + '»: ' + (next.mode === 'dark' ? 'тёмная версия' : 'светлая версия'), 'info');
    });
  }

  function bindThemeGrid(grid) {
    if (!grid || grid.dataset.pairedThemeReady === 'true') return;
    grid.dataset.pairedThemeReady = 'true';
    grid.addEventListener('click', function (event) {
      var button = event.target.closest('.theme-preset[data-theme]');
      if (!button || !grid.contains(button)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      var next = selectTheme(button.dataset.theme);
      announce('Палитра изменена: ' + THEME_META[next.theme].name + '. Режим яркости сохранён.', 'success');
    });
  }

  function bindControls() {
    bindModeButton(document.getElementById('floatingThemeToggle'));
    bindModeButton(document.getElementById('authThemeToggle'));
    bindThemeGrid(document.getElementById('themePresetGrid'));
    var state = getState();
    updateControls(state.theme, state.mode);
  }

  window.BibliotechTheme = {
    themes: THEMES.slice(),
    modes: MODES.slice(),
    meta: THEME_META,
    apply: apply,
    getState: getState,
    selectTheme: selectTheme,
    setMode: setMode,
    toggleMode: toggleMode,
    bindControls: bindControls
  };

  var initial = getStoredState();
  apply(initial.theme, initial.mode, { persist: true, emit: false });

  document.addEventListener('DOMContentLoaded', function () {
    var state = getState();
    apply(state.theme, state.mode, { persist: false, emit: false });
    bindControls();
  });

  window.addEventListener('storage', function (event) {
    if (event.key !== THEME_KEY && event.key !== MODE_KEY) return;
    var state = getStoredState();
    apply(state.theme, state.mode, { persist: false });
  });
})();
