(function () {
    function ensureMapButton() {
        const placementCard = document.querySelector('.book-placement-card');
        if (!placementCard || document.getElementById('showBookOnMapButton')) return;

        const button = document.createElement('button');
        button.id = 'showBookOnMapButton';
        button.type = 'button';
        button.className = 'rent-book-btn show-book-map-button';
        button.textContent = '⌖ Показать кабинет на карте';
        button.addEventListener('click', () => {
            window.location.assign('map.html');
        });
        placementCard.appendChild(button);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMapButton);
    else ensureMapButton();
})();
