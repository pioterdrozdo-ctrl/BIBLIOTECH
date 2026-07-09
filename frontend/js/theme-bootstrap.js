(function () {
  var allowed = ['light','dark','forest','ocean','sunset','violet','coffee','mono'];
  var iconFiles = {
    light: 'appicon-light.png',
    dark: 'appicon-dark.png',
    forest: 'appicon-forest.png',
    ocean: 'appicon-ocean.png',
    sunset: 'appicon-sunset.png',
    violet: 'appicon-violet.png',
    coffee: 'appicon-coffee.png',
    mono: 'appicon-mono.png'
  };
  var queryTheme = '';
  try { queryTheme = new URLSearchParams(window.location.search).get('theme') || ''; } catch (e) {}
  var savedTheme = localStorage.getItem('theme');
  var theme = savedTheme || queryTheme || 'forest';
  if (allowed.indexOf(theme) === -1) theme = 'forest';
  if (!savedTheme && queryTheme && allowed.indexOf(queryTheme) !== -1) localStorage.setItem('theme', theme);
  document.documentElement.classList.add('theme-' + theme);
  document.documentElement.dataset.theme = theme;
  var iconPath = 'img/' + (iconFiles[theme] || iconFiles.light);
  var dark = ['dark','forest','ocean','violet','mono'].indexOf(theme) !== -1;

  function setLink(rel, attrs) {
    var link = document.querySelector('link[rel="' + rel + '"]') || document.createElement('link');
    link.rel = rel;
    Object.keys(attrs || {}).forEach(function (key) { link.setAttribute(key, attrs[key]); });
    if (!link.parentNode) document.head.appendChild(link);
    return link;
  }

  setLink('icon', { type: 'image/png', href: iconPath });
  setLink('apple-touch-icon', { href: iconPath });
  setLink('manifest', { href: '/manifest.webmanifest?theme=' + encodeURIComponent(theme) });

  if (dark) document.documentElement.classList.add('dark-theme');

  function applyLogoIcon(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (root && root.matches && root.matches('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img')) {
      root.src = iconPath;
      root.removeAttribute('srcset');
    }
    scope.querySelectorAll?.('.brand-logo img, .auth-brand img, .logo-orb img, .about-logo-showcase img').forEach(function (img) {
      if (img.src.indexOf(iconFiles[theme] || '') === -1) img.src = iconPath;
      img.removeAttribute('srcset');
    });
  }

  if ('MutationObserver' in window) {
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes && mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) applyLogoIcon(node);
        });
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('load', function () { setTimeout(function () { observer.disconnect(); }, 800); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('theme-' + theme);
    document.body.dataset.theme = theme;
    if (dark) document.body.classList.add('dark-theme');
    applyLogoIcon(document);
  });
})();