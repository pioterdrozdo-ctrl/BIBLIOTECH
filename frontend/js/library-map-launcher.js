(function () {
    function ensureMapButton() {
        const placementCard = document.querySelector('.book-placement-card');
        if (!placementCard || document.getElementById('showBookOnMapButton')) return;

        const button = document.createElement('button');
        button.id = 'showBookOnMapButton';
        button.type = 'button';
        button.className = 'rent-book-btn show-book-map-button';
        button.textContent = '⌖ Показать на карте';
        button.addEventListener('click', () => {
            const bookId = Number(document.getElementById('viewModal')?.dataset.bookId);
            if (!Number.isSafeInteger(bookId) || bookId <= 0) return;
            window.location.assign(`map-lite.html?book=${encodeURIComponent(bookId)}`);
        });
        placementCard.appendChild(button);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMapButton);
    else ensureMapButton();
})();
