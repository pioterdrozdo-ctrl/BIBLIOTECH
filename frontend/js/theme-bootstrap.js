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
  var theme = savedTheme || queryTheme || 'light';
  if (allowed.indexOf(theme) === -1) theme = 'light';
  if (!savedTheme && queryTheme && allowed.indexOf(queryTheme) !== -1) localStorage.setItem('theme', theme);
  document.documentElement.classList.add('theme-' + theme);
  document.documentElement.dataset.theme = theme;
  var iconPath = 'img/' + (iconFiles[theme] || iconFiles.light);
  var icon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/png'; icon.href = iconPath;
  if (!icon.parentNode) document.head.appendChild(icon);
  var apple = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement('link');
  apple.rel = 'apple-touch-icon'; apple.href = iconPath;
  if (!apple.parentNode) document.head.appendChild(apple);
  var manifest = document.querySelector('link[rel="manifest"]') || document.createElement('link');
  manifest.rel = 'manifest'; manifest.href = '/manifest.webmanifest?theme=' + encodeURIComponent(theme);
  if (!manifest.parentNode) document.head.appendChild(manifest);
  var dark = ['dark','forest','ocean','violet','mono'].indexOf(theme) !== -1;
  if (dark) document.documentElement.classList.add('dark-theme');
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('theme-' + theme);
    document.body.dataset.theme = theme;
    if (dark) document.body.classList.add('dark-theme');
    document.querySelectorAll('.brand-logo img, .auth-brand img').forEach(function (img) {
      img.src = iconPath;
    });
  });
})();
