(function () {
  'use strict';

  var THEME_KEY = 'theme';
  var MODE_KEY = 'bibliotech_theme_mode';
  var THEMES = ['light', 'dark', 'forest', 'ocean', 'sunset', 'violet', 'coffee', 'mono'];
  var MODES = ['light', 'dark'];
  var LEGACY_DARK_THEMES = ['dark', 'forest', 'ocean', 'violet', 'mono'];

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

  var PALETTES = {
    light: {
      light: {
        '--bg': '#f5f2ec', '--bg-soft': '#fbfaf6', '--bg-lift': '#fbfaf6',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#eef4ef',
        '--text': '#1e2521', '--muted': '#68736c', '--border': 'rgba(31, 43, 36, 0.13)',
        '--accent': '#2f7d5a', '--accent-strong': '#216245', '--accent-soft': '#dfeee5', '--on-accent': '#ffffff',
        '--gold': '#c2953e', '--blue': '#2f6fb3', '--danger': '#b74c43', '--danger-soft': '#fae7e4',
        '--ok': '#267d56', '--ok-soft': '#e0f2e8'
      },
      dark: {
        '--bg': '#071711', '--bg-soft': '#0d241a', '--bg-lift': '#0d241a',
        '--surface': '#132d22', '--surface-strong': '#173629', '--surface-muted': '#1b3c2e',
        '--text': '#f0fbf5', '--muted': '#aac6b6', '--border': 'rgba(216, 255, 232, 0.15)',
        '--accent': '#79d99e', '--accent-strong': '#b9ef7d', '--accent-soft': 'rgba(121, 217, 158, 0.15)', '--on-accent': '#06130d',
        '--gold': '#e4bd61', '--blue': '#82baff', '--danger': '#ff9188', '--danger-soft': 'rgba(255, 145, 136, 0.13)',
        '--ok': '#8be1a7', '--ok-soft': 'rgba(139, 225, 167, 0.13)'
      }
    },
    dark: {
      light: {
        '--bg': '#edf1ef', '--bg-soft': '#f7f9f8', '--bg-lift': '#f7f9f8',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#e4ebe7',
        '--text': '#1c2420', '--muted': '#5f6b65', '--border': 'rgba(28, 42, 35, 0.14)',
        '--accent': '#496b5d', '--accent-strong': '#2c4e40', '--accent-soft': '#dce8e2', '--on-accent': '#ffffff',
        '--gold': '#a88947', '--blue': '#4a7398', '--danger': '#ac4c49', '--danger-soft': '#f7e5e4',
        '--ok': '#3c765d', '--ok-soft': '#dfede6'
      },
      dark: {
        '--bg': '#0b0f0d', '--bg-soft': '#121815', '--bg-lift': '#121815',
        '--surface': '#19211d', '--surface-strong': '#1d2822', '--surface-muted': '#232f29',
        '--text': '#f0f5f2', '--muted': '#aab7b0', '--border': 'rgba(239, 247, 243, 0.14)',
        '--accent': '#96cab3', '--accent-strong': '#c7ed9a', '--accent-soft': 'rgba(150, 202, 179, 0.14)', '--on-accent': '#08110d',
        '--gold': '#d7b764', '--blue': '#8db8ef', '--danger': '#f58d89', '--danger-soft': 'rgba(245, 141, 137, 0.13)',
        '--ok': '#8fd4ad', '--ok-soft': 'rgba(143, 212, 173, 0.13)'
      }
    },
    forest: {
      light: {
        '--bg': '#edf8f0', '--bg-soft': '#f7fcf8', '--bg-lift': '#f7fcf8',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#e0f1e5',
        '--text': '#183021', '--muted': '#5e7867', '--border': 'rgba(30, 93, 54, 0.16)',
        '--accent': '#2f8a50', '--accent-strong': '#1e6a3a', '--accent-soft': '#d7efdf', '--on-accent': '#ffffff',
        '--gold': '#b58d35', '--blue': '#3977a8', '--danger': '#b84d48', '--danger-soft': '#f9e6e3',
        '--ok': '#26784b', '--ok-soft': '#dbefe3'
      },
      dark: {
        '--bg': '#071b13', '--bg-soft': '#0e2a1f', '--bg-lift': '#0e2a1f',
        '--surface': '#142f24', '--surface-strong': '#18382a', '--surface-muted': '#1d3c2f',
        '--text': '#f1fff6', '--muted': '#b5cfbf', '--border': 'rgba(202, 255, 217, 0.15)',
        '--accent': '#83df93', '--accent-strong': '#c0f275', '--accent-soft': 'rgba(131, 223, 147, 0.14)', '--on-accent': '#07130d',
        '--gold': '#e6c15d', '--blue': '#7db9ff', '--danger': '#ff9188', '--danger-soft': 'rgba(255, 145, 136, 0.13)',
        '--ok': '#94e5aa', '--ok-soft': 'rgba(148, 229, 170, 0.13)'
      }
    },
    ocean: {
      light: {
        '--bg': '#eaf7fc', '--bg-soft': '#f7fcfe', '--bg-lift': '#f7fcfe',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#dceff6',
        '--text': '#17313d', '--muted': '#5d7682', '--border': 'rgba(23, 93, 121, 0.16)',
        '--accent': '#178bb3', '--accent-strong': '#0a688b', '--accent-soft': '#d5eff8', '--on-accent': '#ffffff',
        '--gold': '#c39638', '--blue': '#2f70b7', '--danger': '#b74e4b', '--danger-soft': '#fae7e5',
        '--ok': '#247b68', '--ok-soft': '#dcefe9'
      },
      dark: {
        '--bg': '#071724', '--bg-soft': '#0d2434', '--bg-lift': '#0d2434',
        '--surface': '#122f43', '--surface-strong': '#16384f', '--surface-muted': '#173a52',
        '--text': '#effaff', '--muted': '#adcad7', '--border': 'rgba(199, 239, 255, 0.16)',
        '--accent': '#50c8e8', '--accent-strong': '#92efd8', '--accent-soft': 'rgba(80, 200, 232, 0.15)', '--on-accent': '#051821',
        '--gold': '#f1c56d', '--blue': '#8ab7ff', '--danger': '#ff938f', '--danger-soft': 'rgba(255, 147, 143, 0.13)',
        '--ok': '#86dcc7', '--ok-soft': 'rgba(134, 220, 199, 0.13)'
      }
    },
    sunset: {
      light: {
        '--bg': '#fff3e3', '--bg-soft': '#fffaf3', '--bg-lift': '#fffaf3',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#f8ece1',
        '--text': '#38261d', '--muted': '#7a6254', '--border': 'rgba(113, 73, 49, 0.16)',
        '--accent': '#d96d4a', '--accent-strong': '#aa4b34', '--accent-soft': '#fae4d9', '--on-accent': '#ffffff',
        '--gold': '#d5a33e', '--blue': '#3b75a8', '--danger': '#b84f49', '--danger-soft': '#fae7e4',
        '--ok': '#3c7d57', '--ok-soft': '#e2f0e7'
      },
      dark: {
        '--bg': '#24100d', '--bg-soft': '#351712', '--bg-lift': '#351712',
        '--surface': '#472019', '--surface-strong': '#55261d', '--surface-muted': '#5a2b22',
        '--text': '#fff5ee', '--muted': '#d8b2a2', '--border': 'rgba(255, 224, 209, 0.16)',
        '--accent': '#ff8a61', '--accent-strong': '#ffb06d', '--accent-soft': 'rgba(255, 138, 97, 0.15)', '--on-accent': '#2a0d08',
        '--gold': '#efc268', '--blue': '#88b9ec', '--danger': '#ff9690', '--danger-soft': 'rgba(255, 150, 144, 0.13)',
        '--ok': '#91d5a4', '--ok-soft': 'rgba(145, 213, 164, 0.13)'
      }
    },
    violet: {
      light: {
        '--bg': '#f5eefb', '--bg-soft': '#fbf8fe', '--bg-lift': '#fbf8fe',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#ece2f5',
        '--text': '#33213e', '--muted': '#725f7e', '--border': 'rgba(98, 60, 124, 0.16)',
        '--accent': '#8553bd', '--accent-strong': '#67399c', '--accent-soft': '#eadcf6', '--on-accent': '#ffffff',
        '--gold': '#bb913a', '--blue': '#5571b1', '--danger': '#b44d63', '--danger-soft': '#f8e5ea',
        '--ok': '#39795d', '--ok-soft': '#dfede6'
      },
      dark: {
        '--bg': '#15091f', '--bg-soft': '#21102f', '--bg-lift': '#21102f',
        '--surface': '#28183a', '--surface-strong': '#301d45', '--surface-muted': '#342149',
        '--text': '#fbf4ff', '--muted': '#cfbddf', '--border': 'rgba(232, 206, 255, 0.17)',
        '--accent': '#b98cff', '--accent-strong': '#f0a8ff', '--accent-soft': 'rgba(185, 140, 255, 0.16)', '--on-accent': '#16091f',
        '--gold': '#f4c76a', '--blue': '#9bb8ff', '--danger': '#ff8d9c', '--danger-soft': 'rgba(255, 141, 156, 0.13)',
        '--ok': '#9fe7c0', '--ok-soft': 'rgba(159, 231, 192, 0.13)'
      }
    },
    coffee: {
      light: {
        '--bg': '#f3e9dc', '--bg-soft': '#fff8ee', '--bg-lift': '#fff8ee',
        '--surface': '#fffdf8', '--surface-strong': '#fffdf8', '--surface-muted': '#efe1d2',
        '--text': '#30231b', '--muted': '#705c4d', '--border': 'rgba(90, 58, 36, 0.18)',
        '--accent': '#8e6749', '--accent-strong': '#67462f', '--accent-soft': '#ead9c8', '--on-accent': '#ffffff',
        '--gold': '#c09552', '--blue': '#3e6f94', '--danger': '#ae514a', '--danger-soft': '#f7e5e1',
        '--ok': '#58775b', '--ok-soft': '#e3ece3'
      },
      dark: {
        '--bg': '#1c120d', '--bg-soft': '#281a13', '--bg-lift': '#281a13',
        '--surface': '#332219', '--surface-strong': '#3c281e', '--surface-muted': '#432e23',
        '--text': '#f8eadf', '--muted': '#c8ae9c', '--border': 'rgba(255, 231, 211, 0.15)',
        '--accent': '#d09a6d', '--accent-strong': '#f1bd86', '--accent-soft': 'rgba(208, 154, 109, 0.15)', '--on-accent': '#21110a',
        '--gold': '#e2bc6a', '--blue': '#89b0d6', '--danger': '#f09187', '--danger-soft': 'rgba(240, 145, 135, 0.13)',
        '--ok': '#9bd0a1', '--ok-soft': 'rgba(155, 208, 161, 0.13)'
      }
    },
    mono: {
      light: {
        '--bg': '#f2f2f2', '--bg-soft': '#fafafa', '--bg-lift': '#fafafa',
        '--surface': '#ffffff', '--surface-strong': '#ffffff', '--surface-muted': '#e8e8e8',
        '--text': '#171717', '--muted': '#666666', '--border': 'rgba(0, 0, 0, 0.14)',
        '--accent': '#3a3a3a', '--accent-strong': '#111111', '--accent-soft': '#dedede', '--on-accent': '#ffffff',
        '--gold': '#777777', '--blue': '#555555', '--danger': '#9a3f3f', '--danger-soft': '#f1dddd',
        '--ok': '#416a4b', '--ok-soft': '#e0ebe2'
      },
      dark: {
        '--bg': '#111111', '--bg-soft': '#181818', '--bg-lift': '#181818',
        '--surface': '#202020', '--surface-strong': '#242424', '--surface-muted': '#2a2a2a',
        '--text': '#f3f3f3', '--muted': '#b9b9b9', '--border': 'rgba(255, 255, 255, 0.14)',
        '--accent': '#f0f0f0', '--accent-strong': '#ffffff', '--accent-soft': 'rgba(255, 255, 255, 0.12)', '--on-accent': '#111111',
        '--gold': '#cfcfcf', '--blue': '#d8d8d8', '--danger': '#ff9292', '--danger-soft': 'rgba(255, 146, 146, 0.13)',
        '--ok': '#b9dfbf', '--ok-soft': 'rgba(185, 223, 191, 0.13)'
      }
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

  function completeVariables(theme, mode) {
    var variables = Object.assign({}, PALETTES[theme][mode]);
    var dark = mode === 'dark';
    variables['--shadow'] = dark ? '0 24px 68px rgba(0, 0, 0, 0.36)' : '0 20px 58px rgba(20, 42, 31, 0.13)';
    variables['--shadow-soft'] = dark ? '0 12px 34px rgba(0, 0, 0, 0.27)' : '0 10px 30px rgba(20, 42, 31, 0.09)';
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
      element.style.setProperty(name, variables[name]);
    });
  }

  function setLink(rel, attrs) {
    var link = document.querySelector('link[rel="' + rel + '"]') || document.createElement('link');
    link.rel = rel;
    Object.keys(attrs || {}).forEach(function (key) { link.setAttribute(key, attrs[key]); });
    if (!link.parentNode) document.head.appendChild(link);
    return link;
  }

  function updateBrandAssets(theme, mode) {
    var meta = THEME_META[theme] || THEME_META.light;
    var iconPath = 'img/' + meta.icon;
    setLink('icon', { type: 'image/png', href: iconPath });
    setLink('apple-touch-icon', { href: iconPath });
    setLink('manifest', { href: '/manifest.webmanifest?theme=' + encodeURIComponent(theme) + '&mode=' + encodeURIComponent(mode) });

    document.querySelectorAll('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img').forEach(function (img) {
      img.src = iconPath;
      img.removeAttribute('srcset');
    });
  }

  function updateMetaThemeColor(variables) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = variables['--bg'] || '#f5f2ec';
  }

  function updatePresetLabels() {
    document.querySelectorAll('.theme-preset[data-theme]').forEach(function (button) {
      var theme = normalizeTheme(button.dataset.theme);
      var meta = THEME_META[theme];
      var name = button.querySelector('b');
      var description = button.querySelector('small');
      if (name) name.textContent = meta.name;
      if (description) description.textContent = meta.description;
    });
  }

  function updateControls(theme, mode) {
    var meta = THEME_META[theme] || THEME_META.light;
    var dark = mode === 'dark';
    var nextModeLabel = dark ? 'светлее' : 'темнее';
    var title = 'Сделать тему «' + meta.name + '» ' + nextModeLabel;

    ['floatingThemeToggle', 'authThemeToggle'].forEach(function (id) {
      var button = document.getElementById(id);
      if (!button) return;
      button.textContent = dark ? '☀️' : '🌙';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.setAttribute('aria-pressed', String(dark));
      button.dataset.themeMode = mode;
      button.dataset.themeName = meta.name;
    });

    updatePresetLabels();
    document.querySelectorAll('.theme-preset[data-theme]').forEach(function (button) {
      var active = button.dataset.theme === theme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
      if (active) button.dataset.activeMode = mode;
      else delete button.dataset.activeMode;
    });

    document.querySelectorAll('.theme-settings-badge').forEach(function (badge) {
      badge.textContent = '8 тем · ' + (dark ? 'тёмный' : 'светлый') + ' режим';
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
    var variables = completeVariables(normalizedTheme, normalizedMode);

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

  if ('MutationObserver' in window) {
    var observer = new MutationObserver(function (mutations) {
      var shouldRefresh = false;
      mutations.forEach(function (mutation) {
        if (mutation.addedNodes && mutation.addedNodes.length) shouldRefresh = true;
      });
      if (!shouldRefresh) return;
      var state = getState();
      updateBrandAssets(state.theme, state.mode);
      bindControls();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', function () { setTimeout(function () { observer.disconnect(); }, 1400); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var state = getState();
    apply(state.theme, state.mode, { persist: false, emit: false });
    bindControls();
    setTimeout(function () {
      var fresh = getState();
      apply(fresh.theme, fresh.mode, { persist: false, emit: false });
      bindControls();
    }, 0);
  });

  window.addEventListener('storage', function (event) {
    if (event.key !== THEME_KEY && event.key !== MODE_KEY) return;
    var state = getStoredState();
    apply(state.theme, state.mode, { persist: false });
  });
})();
