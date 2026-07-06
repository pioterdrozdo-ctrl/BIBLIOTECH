(function () {
  var allowed = ['light','dark','forest','ocean','sunset','violet','coffee','mono'];
  var theme = localStorage.getItem('theme') || 'light';
  if (allowed.indexOf(theme) === -1) theme = 'light';
  document.documentElement.classList.add('theme-' + theme);
  document.documentElement.dataset.theme = theme;
  var iconPath = 'img/appicon-' + theme + '.png';
  var icon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  icon.rel = 'icon'; icon.type = 'image/png'; icon.href = iconPath;
  if (!icon.parentNode) document.head.appendChild(icon);
  var apple = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement('link');
  apple.rel = 'apple-touch-icon'; apple.href = iconPath;
  if (!apple.parentNode) document.head.appendChild(apple);
  var dark = ['dark','forest','ocean','violet','mono'].indexOf(theme) !== -1;
  if (dark) document.documentElement.classList.add('dark-theme');
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('theme-' + theme);
    document.body.dataset.theme = theme;
    if (dark) document.body.classList.add('dark-theme');
  });
})();
