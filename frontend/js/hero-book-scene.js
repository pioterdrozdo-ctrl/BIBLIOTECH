(function () {
    function initHeroBookScene() {
        const visual = document.querySelector('.hero-wow .hero-visual');
        if (!visual || visual.querySelector('.hero-book-scene')) return;

        const logoSource = document.querySelector('.brand-logo img')?.getAttribute('src') || 'img/appicon.png';
        const scene = document.createElement('div');
        scene.className = 'hero-book-scene';
        scene.setAttribute('aria-hidden', 'true');
        scene.innerHTML = `
            <div class="hero-book-aura"></div>
            <div class="hero-book-orbit"><i></i><i></i></div>
            <span class="hero-book-spark one"></span>
            <span class="hero-book-spark two"></span>
            <span class="hero-book-spark three"></span>
            <div class="hero-book-shell">
                <div class="hero-book-table"></div>
                <div class="hero-book-page hero-book-left"></div>
                <div class="hero-book-page hero-book-right"></div>
                <div class="hero-book-spine"></div>
                <div class="hero-book-turn"></div>
                <div class="hero-book-logo logo-orb"><img src="${logoSource}" alt=""></div>
                <div class="hero-book-caption">BIBLIOTECH<small>каталог, который дышит книгами</small></div>
            </div>
        `;
        visual.appendChild(scene);
        visual.classList.add('hero-book-ready');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeroBookScene);
    else initHeroBookScene();
})();
