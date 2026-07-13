(function () {
    'use strict';

    const root = document.documentElement;
    const currentTarget = window.location.pathname + window.location.search;

    function redirect(destination, reason) {
        try {
            sessionStorage.setItem('bibliotech_access_notice', reason);
        } catch (error) {}
        window.location.replace(destination);
        return false;
    }

    let session = null;
    try {
        const rawSession = localStorage.getItem('bibliotech_current_user');
        if (!rawSession) {
            localStorage.setItem('bibliotech_post_login_url', currentTarget);
            window.BibliotechAdminMapAccess = Promise.resolve(redirect('index.html', 'Для доступа к карте войдите как администратор.'));
            return;
        }
        session = JSON.parse(rawSession);
    } catch (error) {
        window.BibliotechAdminMapAccess = Promise.resolve(redirect('index.html', 'Не удалось проверить сеанс администратора.'));
        return;
    }

    if (session?.guest || session?.role !== 'admin') {
        window.BibliotechAdminMapAccess = Promise.resolve(redirect('home.html', 'Карта временно доступна только администраторам.'));
        return;
    }

    const token = localStorage.getItem('token') || '';
    if (!token) {
        window.BibliotechAdminMapAccess = Promise.resolve(redirect('index.html', 'Сеанс администратора завершён. Войдите снова.'));
        return;
    }

    window.BibliotechAdminMapAccess = fetch('/api/library-map/access', {
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`
        },
        cache: 'no-store'
    }).then(response => {
        if (!response.ok) {
            const destination = response.status === 401 ? 'index.html' : 'home.html';
            return redirect(destination, 'Карта временно доступна только администраторам.');
        }
        root.dataset.adminMapAccess = 'granted';
        window.dispatchEvent(new CustomEvent('bibliotech:admin-map-access-granted'));
        return true;
    }).catch(() => redirect('home.html', 'Не удалось подтвердить административный доступ к карте.'));
})();
