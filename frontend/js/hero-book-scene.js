(function () {
    function initHeroBookScene() {
        const visual = document.querySelector('.hero-wow .hero-visual');
        if (!visual || visual.querySelector('.hero-logo-scene')) return;

        const scene = document.createElement('div');
        scene.className = 'hero-logo-scene';
        scene.setAttribute('aria-hidden', 'true');
        scene.innerHTML = `
            <div class="hero-logo-frame">
                <div class="hero-logo-depth"></div>
                <div class="hero-logo-card">
                    <div class="hero-logo-mark">
                        <span class="hero-logo-book-lines"></span>
                        <strong>B</strong>
                    </div>
                </div>
            </div>
        `;
        visual.appendChild(scene);
        visual.classList.add('hero-book-ready', 'hero-logo-ready');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeroBookScene);
    else initHeroBookScene();
})();
