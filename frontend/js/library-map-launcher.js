(function () {
    function hasAdminMapAccess() {
        try {
            const session = JSON.parse(localStorage.getItem('bibliotech_current_user') || 'null');
            return Boolean(session && !session.guest && session.role === 'admin' && localStorage.getItem('token'));
        } catch (error) {
            return false;
        }
    }

    function ensureMapButton() {
        if (!hasAdminMapAccess()) {
            document.getElementById('showBookOnMapButton')?.remove();
            return;
        }
        const placementCard = document.querySelector('.book-placement-card');
        if (!placementCard || document.getElementById('showBookOnMapButton')) return;

        const button = document.createElement('button');
        button.id = 'showBookOnMapButton';
        button.type = 'button';
        button.className = 'rent-book-btn show-book-map-button';
        button.textContent = '⌖ Показать кабинет на карте';
        button.addEventListener('click', () => {
            const bookId = document.getElementById('viewModal')?.dataset.bookId || '';
            const target = /^\d+$/.test(bookId) ? `map.html?book=${encodeURIComponent(bookId)}` : 'map.html';
            window.location.assign(target);
        });
        placementCard.appendChild(button);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMapButton);
    else ensureMapButton();
})();
