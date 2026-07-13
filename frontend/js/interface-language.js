(function () {
    'use strict';

    var STORAGE_KEY = 'bibliotech_language';
    var SUPPORTED = ['ru', 'en', 'uk', 'de', 'kk', 'es', 'zh'];
    var META = {
        ru: { code: 'RU', label: 'Русский', flag: '🇷🇺' },
        en: { code: 'EN', label: 'English', flag: '🇬🇧' },
        uk: { code: 'UK', label: 'Українська', flag: '🇺🇦' },
        de: { code: 'DE', label: 'Deutsch', flag: '🇩🇪' },
        kk: { code: 'KK', label: 'Қазақша', flag: '🇰🇿' },
        es: { code: 'ES', label: 'Español', flag: '🇪🇸' },
        zh: { code: 'ZH', label: '中文', flag: '🇨🇳' }
    };

    var BASE = {
        chooseLanguage: 'Выбрать язык', mainNavigation: 'Основная навигация', openMenu: 'Открыть меню', closeMenu: 'Закрыть меню',
        navHome: 'Главная', navMap: 'Карта', navStats: 'Статистика', navAbout: 'О нас', navAdmin: 'Админ', profile: 'Профиль', logout: 'Выйти',
        loading: 'Загрузка...', refresh: 'Обновить', open: 'Открыть', close: 'Закрыть', cancel: 'Отмена', template: 'Шаблон',
        footer: '© 2026 BIBLIOTECH. Все права защищены.',

        authTitle: 'Вход | BIBLIOTECH', signIn: 'Вход', registration: 'Регистрация', username: 'Имя пользователя', password: 'Пароль',
        signInButton: 'Войти', guestLogin: 'Войти как гость', forgotPassword: 'Забыли пароль?', email: 'Электронная почта', registerButton: 'Зарегистрироваться',

        adminTitle: 'Админ | BIBLIOTECH', adminEyebrow: 'Панель администратора', adminHeading: 'Управление BIBLIOTECH',
        adminLead: 'Пользователи, места хранения, аренда и безопасное пополнение каталога находятся в одном рабочем пространстве.',
        adminSections: 'Разделы администрирования', overview: 'Обзор', users: 'Пользователи', storage: 'Хранение', rentals: 'Аренда',
        quickAccess: 'Быстрый доступ', workTools: 'Рабочие инструменты', workToolsLead: 'Выберите задачу — сложные формы откроются отдельно и не будут перегружать страницу.',
        catalog: 'Каталог', importBooks: 'Импорт книг', importLead: 'Проверка CSV и Excel перед добавлением в каталог.',
        fundControl: 'Контроль фонда', inventory: 'Инвентаризация', inventoryLead: 'Сканирование QR, пропуски и книги не на своём месте.', startWork: 'Начать работу',
        printAccounting: 'Печать и учёт', pdfDocuments: 'PDF-документы', pdfLead: 'QR-этикетки со ссылкой и проекты учётных актов.', generate: 'Сформировать',
        access: 'Доступ', usersLead: 'Роли, статусы, входы и активность читателей.', goSection: 'Перейти к разделу', fund: 'Фонд',
        storagePlaces: 'Места хранения', storageLead: 'Полки, зоны и точные места размещения книг.', lending: 'Выдача', rentalsLead: 'Текущие выдачи, возвраты и PDF-акты.',
        usersTable: 'Таблица пользователей', usersCaption: 'Пользователи BIBLIOTECH', login: 'Логин', mail: 'Почта', role: 'Роль', status: 'Статус',
        lastLogin: 'Последний вход', device: 'IP / устройство', created: 'Создан', shelfZone: 'Полка / зона', place: 'Место', note: 'Заметка', addPlace: 'Добавить место',
        bookRentals: 'Аренда книг', rentalsJournal: 'Журнал аренды книг', book: 'Книга', user: 'Пользователь', taken: 'Взята', action: 'Действие',
        checkFund: 'Проверка фонда', checkFundLead: 'Сканируйте существующие QR без их изменения. Система найдёт пропуски, повторы и книги не на своём месте.',
        noActiveCheck: 'Нет активной проверки', checkName: 'Название проверки', zone: 'Зона', wholeFund: 'Весь фонд', start: 'Начать', pdfReport: 'PDF-отчёт', finish: 'Завершить',
        scanLabel: 'QR, ISBN или ID книги', camera: 'Камера', check: 'Проверить', notFound: 'Не найдено', misplaced: 'Не на месте', recentScans: 'Последние сканы', recentChecks: 'Последние проверки',
        createDocument: 'Создание документа', createDocumentLead: 'QR на новых этикетках открывается обычной камерой телефона. Текстовый код книги и данные каталога не изменяются.',
        documentType: 'Тип документа', qrLabels: 'QR-этикетки на корешки', writeoffAct: 'Проект акта списания', storageLocation: 'Место хранения', allLocations: 'Все места',
        selectedCodes: 'Коды выбранных книг', generatePdf: 'Сформировать PDF', rentalActs: 'Акты выдачи',

        liveAnalytics: 'Живая аналитика', statsHeading: '📊 Статистика библиотеки', statsLead: 'Живая сводка по каталогу: количество книг, экземпляров, комментариев и авторов обновляется автоматически.',
        totalBooks: 'Всего книг', inCatalog: 'в каталоге', available: 'В наличии', availableNow: 'можно взять сейчас', copies: 'Экземпляров', total: 'суммарно', comments: 'Комментариев', fromReaders: 'от читателей',
        catalogStats: '📈 Статистика каталога', availableShare: 'доля книг в наличии', authors: '✍️ Авторы', noData: 'Пока нет данных', catalogState: '📌 Состояние каталога', waitingData: 'Ожидает данных',
        activity: '💬 Активность', quiet: 'Пока спокойно', recommendation: '📚 Рекомендация', recommendationText: 'Добавляйте авторов и описания — поиск станет точнее',

        aboutHeading: 'Электронная библиотека для удобной работы с книгами',
        aboutLead: 'BIBLIOTECH помогает хранить каталог, быстро находить книги по названию, автору и описанию, отслеживать доступность экземпляров и собирать комментарии читателей.',
        openCatalog: 'Открыть каталог', viewStats: 'Посмотреть статистику', capabilities: 'Возможности', systemCapabilities: 'Что умеет система',
        systemLead: 'Проект сделан так, чтобы им было удобно пользоваться без сложной настройки.', smartSearch: 'Умный поиск',
        smartSearchLead: 'Поиск работает по названию, автору, описанию и комментариям, а также лучше переносит неточные запросы.', bookCatalog: 'Каталог книг',
        bookCatalogLead: 'Можно добавлять книги, указывать автора, описание, обложку, наличие и количество экземпляров.', commentsTitle: 'Комментарии',
        commentsLead: 'К каждой книге можно оставлять заметки и отзывы, чтобы каталог был живым и полезным.', connection: 'Связь', projectContacts: 'Контакты проекта',
        contactLead: 'По всем вопросам, предложениям, замечаниям и идеям по развитию BIBLIOTECH обращайтесь в Telegram.', responsible: 'Ответственный за проект:',

        mapEyebrow: 'Тушинский комплекс · 1 этаж', mapHeading: 'Карта первого этажа',
        mapLead: 'План реконструирован по предоставленным изображениям как нативная SVG-карта. Помещения, корпуса и дороги подстраиваются под выбранную тему BIBLIOTECH.',
        backCatalog: '← Вернуться в каталог', interactiveMap: 'Интерактивная SVG-карта BIBLIOTECH', firstFloor: 'Первый этаж Тушинского комплекса',
        showAll: 'Показать весь этаж', toRoom: 'К кабинету 125', overviewMap: 'Общий вид', northWing: 'Северное крыло', southWing: 'Южное крыло', room125: 'Кабинет 125',
        markedRoom: 'Отмеченный кабинет', roomLead: 'В этом кабинете находится физический фонд BIBLIOTECH.', storageScheme: 'Открыть схему мест хранения →'
    };

    var EN = {
        chooseLanguage: 'Choose language', mainNavigation: 'Main navigation', openMenu: 'Open menu', closeMenu: 'Close menu', navHome: 'Home', navMap: 'Map', navStats: 'Statistics', navAbout: 'About', navAdmin: 'Admin', profile: 'Profile', logout: 'Log out', loading: 'Loading...', refresh: 'Refresh', open: 'Open', close: 'Close', cancel: 'Cancel', template: 'Template', footer: '© 2026 BIBLIOTECH. All rights reserved.',
        authTitle: 'Sign in | BIBLIOTECH', signIn: 'Sign in', registration: 'Registration', username: 'Username', password: 'Password', signInButton: 'Sign in', guestLogin: 'Continue as guest', forgotPassword: 'Forgot password?', email: 'Email', registerButton: 'Create account',
        adminTitle: 'Admin | BIBLIOTECH', adminEyebrow: 'Administrator panel', adminHeading: 'Manage BIBLIOTECH', adminLead: 'Users, storage locations, lending and safe catalog imports are organized in one workspace.', adminSections: 'Administration sections', overview: 'Overview', users: 'Users', storage: 'Storage', rentals: 'Lending', quickAccess: 'Quick access', workTools: 'Workspace tools', workToolsLead: 'Choose a task — complex forms open separately and keep the page uncluttered.', catalog: 'Catalog', importBooks: 'Import books', importLead: 'Validate CSV and Excel files before adding them to the catalog.', fundControl: 'Collection control', inventory: 'Inventory audit', inventoryLead: 'Scan QR codes and find missing or misplaced books.', startWork: 'Start', printAccounting: 'Print and records', pdfDocuments: 'PDF documents', pdfLead: 'Linked QR labels and accounting document drafts.', generate: 'Create', access: 'Access', usersLead: 'Reader roles, statuses, sign-ins and activity.', goSection: 'Open section', fund: 'Collection', storagePlaces: 'Storage locations', storageLead: 'Shelves, zones and exact book locations.', lending: 'Lending', rentalsLead: 'Current loans, returns and PDF acts.',
        usersTable: 'User table', usersCaption: 'BIBLIOTECH users', login: 'Login', mail: 'Email', role: 'Role', status: 'Status', lastLogin: 'Last sign-in', device: 'IP / device', created: 'Created', shelfZone: 'Shelf / zone', place: 'Place', note: 'Note', addPlace: 'Add location', bookRentals: 'Book lending', rentalsJournal: 'Book lending log', book: 'Book', user: 'User', taken: 'Borrowed', action: 'Action',
        checkFund: 'Collection audit', checkFundLead: 'Scan existing QR codes without changing them. The system will find missing, duplicate and misplaced books.', noActiveCheck: 'No active audit', checkName: 'Audit name', zone: 'Zone', wholeFund: 'Entire collection', start: 'Start', pdfReport: 'PDF report', finish: 'Complete', scanLabel: 'QR, ISBN or book ID', camera: 'Camera', check: 'Check', notFound: 'Missing', misplaced: 'Misplaced', recentScans: 'Recent scans', recentChecks: 'Recent audits', createDocument: 'Create document', createDocumentLead: 'QR codes on new labels open with a phone camera. Stored book codes and catalog data are not changed.', documentType: 'Document type', qrLabels: 'QR spine labels', writeoffAct: 'Write-off act draft', storageLocation: 'Storage location', allLocations: 'All locations', selectedCodes: 'Selected book codes', generatePdf: 'Create PDF', rentalActs: 'Lending acts',
        liveAnalytics: 'Live analytics', statsHeading: '📊 Library statistics', statsLead: 'A live catalog summary: books, copies, comments and authors update automatically.', totalBooks: 'Total books', inCatalog: 'in the catalog', available: 'Available', availableNow: 'ready to borrow', copies: 'Copies', total: 'in total', comments: 'Comments', fromReaders: 'from readers', catalogStats: '📈 Catalog statistics', availableShare: 'share of available books', authors: '✍️ Authors', noData: 'No data yet', catalogState: '📌 Catalog health', waitingData: 'Waiting for data', activity: '💬 Activity', quiet: 'Quiet for now', recommendation: '📚 Recommendation', recommendationText: 'Add authors and descriptions to improve search accuracy',
        aboutHeading: 'A digital library built for convenient book management', aboutLead: 'BIBLIOTECH stores the catalog, quickly finds books by title, author and description, tracks copy availability and collects reader comments.', openCatalog: 'Open catalog', viewStats: 'View statistics', capabilities: 'Capabilities', systemCapabilities: 'What the system can do', systemLead: 'The project is designed to work without complicated setup.', smartSearch: 'Smart search', smartSearchLead: 'Search covers titles, authors, descriptions and comments and handles imperfect queries.', bookCatalog: 'Book catalog', bookCatalogLead: 'Add books with authors, descriptions, covers, availability and copy counts.', commentsTitle: 'Comments', commentsLead: 'Readers can leave notes and reviews for every book.', connection: 'Contact', projectContacts: 'Project contacts', contactLead: 'Send questions, suggestions and development ideas for BIBLIOTECH via Telegram.', responsible: 'Project contact:',
        mapEyebrow: 'Tushino complex · floor 1', mapHeading: 'First-floor map', mapLead: 'The plan was reconstructed as a native SVG map. Rooms, buildings and roads adapt to the selected BIBLIOTECH theme.', backCatalog: '← Back to catalog', interactiveMap: 'Interactive BIBLIOTECH SVG map', firstFloor: 'First floor of the Tushino complex', showAll: 'Show entire floor', toRoom: 'Go to room 125', overviewMap: 'Overview', northWing: 'North wing', southWing: 'South wing', room125: 'Room 125', markedRoom: 'Highlighted room', roomLead: 'The physical BIBLIOTECH collection is stored in this room.', storageScheme: 'Open storage map →'
    };

    var PACKS = {
        ru: {}, en: EN,
        uk: {
            chooseLanguage: 'Вибрати мову', mainNavigation: 'Основна навігація', openMenu: 'Відкрити меню', closeMenu: 'Закрити меню', navHome: 'Головна', navMap: 'Карта', navStats: 'Статистика', navAbout: 'Про нас', navAdmin: 'Адмін', profile: 'Профіль', logout: 'Вийти', overview: 'Огляд', users: 'Користувачі', storage: 'Зберігання', rentals: 'Видача', quickAccess: 'Швидкий доступ', workTools: 'Робочі інструменти', catalog: 'Каталог', importBooks: 'Імпорт книг', template: 'Шаблон', open: 'Відкрити', fundControl: 'Контроль фонду', inventory: 'Інвентаризація', startWork: 'Почати роботу', printAccounting: 'Друк та облік', pdfDocuments: 'PDF-документи', generate: 'Сформувати', access: 'Доступ', goSection: 'Перейти до розділу', fund: 'Фонд', storagePlaces: 'Місця зберігання', lending: 'Видача', refresh: 'Оновити', loading: 'Завантаження...', liveAnalytics: 'Жива аналітика', statsHeading: '📊 Статистика бібліотеки', totalBooks: 'Усього книг', available: 'У наявності', copies: 'Примірників', comments: 'Коментарів', aboutHeading: 'Електронна бібліотека для зручної роботи з книгами', openCatalog: 'Відкрити каталог', viewStats: 'Переглянути статистику', capabilities: 'Можливості', systemCapabilities: 'Що вміє система', smartSearch: 'Розумний пошук', bookCatalog: 'Каталог книг', commentsTitle: 'Коментарі', connection: 'Зв’язок', projectContacts: 'Контакти проєкту', responsible: 'Відповідальний за проєкт:', mapHeading: 'Карта першого поверху', backCatalog: '← Повернутися до каталогу', showAll: 'Показати весь поверх', toRoom: 'До кабінету 125', overviewMap: 'Загальний вигляд', northWing: 'Північне крило', southWing: 'Південне крило', room125: 'Кабінет 125', signIn: 'Вхід', registration: 'Реєстрація', username: 'Ім’я користувача', password: 'Пароль', signInButton: 'Увійти', guestLogin: 'Увійти як гість', forgotPassword: 'Забули пароль?'
        },
        de: {
            chooseLanguage: 'Sprache wählen', mainNavigation: 'Hauptnavigation', openMenu: 'Menü öffnen', closeMenu: 'Menü schließen', navHome: 'Startseite', navMap: 'Karte', navStats: 'Statistik', navAbout: 'Über uns', navAdmin: 'Admin', profile: 'Profil', logout: 'Abmelden', overview: 'Übersicht', users: 'Benutzer', storage: 'Lagerung', rentals: 'Ausleihe', quickAccess: 'Schnellzugriff', workTools: 'Arbeitswerkzeuge', catalog: 'Katalog', importBooks: 'Bücher importieren', template: 'Vorlage', open: 'Öffnen', fundControl: 'Bestandskontrolle', inventory: 'Inventur', startWork: 'Starten', printAccounting: 'Druck und Verwaltung', pdfDocuments: 'PDF-Dokumente', generate: 'Erstellen', access: 'Zugriff', goSection: 'Bereich öffnen', fund: 'Bestand', storagePlaces: 'Lagerorte', lending: 'Ausleihe', refresh: 'Aktualisieren', loading: 'Laden...', liveAnalytics: 'Live-Analyse', statsHeading: '📊 Bibliotheksstatistik', totalBooks: 'Bücher insgesamt', available: 'Verfügbar', copies: 'Exemplare', comments: 'Kommentare', aboutHeading: 'Digitale Bibliothek für eine bequeme Buchverwaltung', openCatalog: 'Katalog öffnen', viewStats: 'Statistik ansehen', capabilities: 'Funktionen', systemCapabilities: 'Was das System kann', smartSearch: 'Intelligente Suche', bookCatalog: 'Buchkatalog', commentsTitle: 'Kommentare', connection: 'Kontakt', projectContacts: 'Projektkontakte', responsible: 'Projektkontakt:', mapHeading: 'Karte des ersten Stocks', backCatalog: '← Zurück zum Katalog', showAll: 'Ganze Etage zeigen', toRoom: 'Zu Raum 125', overviewMap: 'Übersicht', northWing: 'Nordflügel', southWing: 'Südflügel', room125: 'Raum 125', signIn: 'Anmelden', registration: 'Registrierung', username: 'Benutzername', password: 'Passwort', signInButton: 'Anmelden', guestLogin: 'Als Gast fortfahren', forgotPassword: 'Passwort vergessen?'
        },
        kk: {
            chooseLanguage: 'Тілді таңдау', mainNavigation: 'Негізгі навигация', openMenu: 'Мәзірді ашу', closeMenu: 'Мәзірді жабу', navHome: 'Басты бет', navMap: 'Карта', navStats: 'Статистика', navAbout: 'Біз туралы', navAdmin: 'Әкімші', profile: 'Профиль', logout: 'Шығу', overview: 'Шолу', users: 'Пайдаланушылар', storage: 'Сақтау', rentals: 'Жалға беру', quickAccess: 'Жылдам қолжетімділік', workTools: 'Жұмыс құралдары', catalog: 'Каталог', importBooks: 'Кітаптарды импорттау', template: 'Үлгі', open: 'Ашу', fundControl: 'Қорды бақылау', inventory: 'Түгендеу', startWork: 'Жұмысты бастау', printAccounting: 'Баспа және есеп', pdfDocuments: 'PDF-құжаттар', generate: 'Құру', access: 'Қолжетімділік', goSection: 'Бөлімге өту', fund: 'Қор', storagePlaces: 'Сақтау орындары', lending: 'Кітап беру', refresh: 'Жаңарту', loading: 'Жүктелуде...', liveAnalytics: 'Нақты уақыттағы талдау', statsHeading: '📊 Кітапхана статистикасы', totalBooks: 'Барлық кітап', available: 'Қолжетімді', copies: 'Дана', comments: 'Пікірлер', aboutHeading: 'Кітаптармен ыңғайлы жұмыс істеуге арналған электрондық кітапхана', openCatalog: 'Каталогты ашу', viewStats: 'Статистиканы көру', capabilities: 'Мүмкіндіктер', systemCapabilities: 'Жүйе не істей алады', smartSearch: 'Ақылды іздеу', bookCatalog: 'Кітаптар каталогы', commentsTitle: 'Пікірлер', connection: 'Байланыс', projectContacts: 'Жоба байланыстары', responsible: 'Жобаға жауапты:', mapHeading: 'Бірінші қабат картасы', backCatalog: '← Каталогқа оралу', showAll: 'Бүкіл қабатты көрсету', toRoom: '125 кабинетке', overviewMap: 'Жалпы көрініс', northWing: 'Солтүстік қанат', southWing: 'Оңтүстік қанат', room125: '125 кабинет', signIn: 'Кіру', registration: 'Тіркелу', username: 'Пайдаланушы аты', password: 'Құпиясөз', signInButton: 'Кіру', guestLogin: 'Қонақ ретінде кіру', forgotPassword: 'Құпиясөзді ұмыттыңыз ба?'
        },
        es: {
            chooseLanguage: 'Elegir idioma', mainNavigation: 'Navegación principal', openMenu: 'Abrir menú', closeMenu: 'Cerrar menú', navHome: 'Inicio', navMap: 'Mapa', navStats: 'Estadística', navAbout: 'Sobre nosotros', navAdmin: 'Admin', profile: 'Perfil', logout: 'Salir', overview: 'Resumen', users: 'Usuarios', storage: 'Almacenamiento', rentals: 'Préstamos', quickAccess: 'Acceso rápido', workTools: 'Herramientas de trabajo', catalog: 'Catálogo', importBooks: 'Importar libros', template: 'Plantilla', open: 'Abrir', fundControl: 'Control del fondo', inventory: 'Inventario', startWork: 'Comenzar', printAccounting: 'Impresión y registro', pdfDocuments: 'Documentos PDF', generate: 'Generar', access: 'Acceso', goSection: 'Ir a la sección', fund: 'Fondo', storagePlaces: 'Ubicaciones', lending: 'Préstamos', refresh: 'Actualizar', loading: 'Cargando...', liveAnalytics: 'Analítica en vivo', statsHeading: '📊 Estadísticas de la biblioteca', totalBooks: 'Total de libros', available: 'Disponibles', copies: 'Ejemplares', comments: 'Comentarios', aboutHeading: 'Biblioteca digital para gestionar libros cómodamente', openCatalog: 'Abrir catálogo', viewStats: 'Ver estadísticas', capabilities: 'Funciones', systemCapabilities: 'Qué puede hacer el sistema', smartSearch: 'Búsqueda inteligente', bookCatalog: 'Catálogo de libros', commentsTitle: 'Comentarios', connection: 'Contacto', projectContacts: 'Contactos del proyecto', responsible: 'Contacto del proyecto:', mapHeading: 'Mapa de la primera planta', backCatalog: '← Volver al catálogo', showAll: 'Mostrar toda la planta', toRoom: 'Ir al aula 125', overviewMap: 'Vista general', northWing: 'Ala norte', southWing: 'Ala sur', room125: 'Aula 125', signIn: 'Iniciar sesión', registration: 'Registro', username: 'Usuario', password: 'Contraseña', signInButton: 'Entrar', guestLogin: 'Entrar como invitado', forgotPassword: '¿Olvidaste la contraseña?'
        },
        zh: {
            chooseLanguage: '选择语言', mainNavigation: '主导航', openMenu: '打开菜单', closeMenu: '关闭菜单', navHome: '首页', navMap: '地图', navStats: '统计', navAbout: '关于我们', navAdmin: '管理', profile: '个人资料', logout: '退出', overview: '概览', users: '用户', storage: '存储', rentals: '借阅', quickAccess: '快速访问', workTools: '工作工具', catalog: '目录', importBooks: '导入图书', template: '模板', open: '打开', fundControl: '馆藏管理', inventory: '盘点', startWork: '开始', printAccounting: '打印与记录', pdfDocuments: 'PDF 文档', generate: '生成', access: '权限', goSection: '进入版块', fund: '馆藏', storagePlaces: '存放位置', lending: '借阅', refresh: '刷新', loading: '加载中...', liveAnalytics: '实时分析', statsHeading: '📊 图书馆统计', totalBooks: '图书总数', available: '可借', copies: '册数', comments: '评论', aboutHeading: '便捷管理图书的数字图书馆', openCatalog: '打开目录', viewStats: '查看统计', capabilities: '功能', systemCapabilities: '系统功能', smartSearch: '智能搜索', bookCatalog: '图书目录', commentsTitle: '评论', connection: '联系', projectContacts: '项目联系方式', responsible: '项目联系人：', mapHeading: '一层地图', backCatalog: '← 返回目录', showAll: '显示整层', toRoom: '前往 125 室', overviewMap: '总览', northWing: '北翼', southWing: '南翼', room125: '125 室', signIn: '登录', registration: '注册', username: '用户名', password: '密码', signInButton: '登录', guestLogin: '访客登录', forgotPassword: '忘记密码？'
        }
    };

    Object.assign(BASE, {
        homePageTitle: 'Книжный каталог | Комментарии',
        statsPageTitle: 'Статистика | BIBLIOTECH',
        aboutPageTitle: 'О нас | BIBLIOTECH',
        mapPageTitle: 'Карта первого этажа — BIBLIOTECH',
        mapLitePageTitle: 'Карта фонда — BIBLIOTECH',
        productFooter: '· цифровой каталог библиотеки · 2026',
        statsBooksInline: 'книг сейчас добавлено в каталог.',
        statsCopiesInline: 'экземпляров доступно для учёта и выдачи.',
        statsCommentsInline: 'комментариев оставили читатели.',
        catalogDense: 'Каталог выглядит насыщенно',
        catalogGrowing: 'Хорошая основа, можно расширять',
        catalogEmpty: 'Добавьте ещё несколько книг',
        commentsActive: 'Есть активное обсуждение',
        commentsStarted: 'Появились первые отзывы',
        commentsWaiting: 'Комментарии пока ждут читателей',
        guestMode: 'Гостевой режим',
        readerProfile: 'Профиль читателя',
        readerAccess: 'Читательский доступ',
        account: 'Аккаунт',
        themes: 'Темы',
        siteAppearance: 'Оформление сайта',
        safeCatalogImport: 'Безопасное пополнение каталога',
        importLimits: 'Поддерживаются CSV и XLSX до 5 МБ и 500 строк. Сначала файл будет только проверен.',
        closeImport: 'Закрыть импорт', dropFile: 'Перетащите файл сюда', chooseImportFile: 'или нажмите, чтобы выбрать CSV / XLSX',
        requiredImportColumns: 'Обязательные столбцы: «Название» и «Автор»', uploadFile: 'Загрузите файл', importBatchLimit: 'До 500 книг за один импорт',
        checkRows: 'Проверьте строки', importPreviewHint: 'Ошибки и дубликаты видны заранее', confirmImport: 'Подтвердите',
        importTransactionHint: 'Запись выполняется одной транзакцией', addBooks: 'Добавить книги'
    });

    Object.assign(PACKS.en, {
        homePageTitle: 'Book catalog | Comments',
        statsPageTitle: 'Statistics | BIBLIOTECH',
        aboutPageTitle: 'About | BIBLIOTECH',
        mapPageTitle: 'First-floor map — BIBLIOTECH',
        mapLitePageTitle: 'Collection map — BIBLIOTECH',
        productFooter: '· digital library catalog · 2026',
        statsBooksInline: 'books are currently in the catalog.',
        statsCopiesInline: 'copies are available for tracking and lending.',
        statsCommentsInline: 'comments were left by readers.',
        catalogDense: 'The catalog is well stocked', catalogGrowing: 'A good foundation with room to grow', catalogEmpty: 'Add a few more books',
        commentsActive: 'Readers are actively discussing books', commentsStarted: 'The first reviews are in', commentsWaiting: 'Comments are waiting for readers',
        guestMode: 'Guest mode', readerProfile: 'Reader profile', readerAccess: 'Reader access', account: 'Account', themes: 'Themes', siteAppearance: 'Site appearance',
        safeCatalogImport: 'Safe catalog import', importLimits: 'CSV and XLSX files up to 5 MB and 500 rows are supported. The file is validated before anything is saved.',
        closeImport: 'Close import', dropFile: 'Drop a file here', chooseImportFile: 'or click to choose CSV / XLSX', requiredImportColumns: 'Required columns: “Title” and “Author”',
        uploadFile: 'Upload a file', importBatchLimit: 'Up to 500 books per import', checkRows: 'Review the rows', importPreviewHint: 'Errors and duplicates are shown in advance',
        confirmImport: 'Confirm', importTransactionHint: 'All rows are saved in one transaction', addBooks: 'Add books'
    });

    Object.assign(PACKS.uk, {
        adminEyebrow: 'Панель адміністратора', adminHeading: 'Керування BIBLIOTECH',
        adminLead: 'Користувачі, місця зберігання, видача та безпечне поповнення каталогу зібрані в одному робочому просторі.',
        workToolsLead: 'Виберіть завдання — складні форми відкриються окремо й не перевантажуватимуть сторінку.',
        importLead: 'Перевірка CSV та Excel перед додаванням до каталогу.', inventoryLead: 'Сканування QR, пропуски та книги не на своєму місці.',
        pdfLead: 'QR-етикетки з посиланням і проєкти облікових актів.', usersLead: 'Ролі, статуси, входи й активність читачів.',
        storageLead: 'Полиці, зони та точні місця розташування книг.', rentalsLead: 'Поточні видачі, повернення та PDF-акти.', adminSections: 'Розділи адміністрування', bookRentals: 'Видача книг',
        productFooter: '· цифровий каталог бібліотеки · 2026', statsBooksInline: 'книг зараз у каталозі.', statsCopiesInline: 'примірників доступно для обліку й видачі.', statsCommentsInline: 'коментарів залишили читачі.',
        mapEyebrow: 'Тушинський комплекс · 1 поверх', mapLead: 'План реконструйовано за наданими зображеннями як нативну SVG-карту. Приміщення, корпуси й дороги адаптуються до вибраної теми BIBLIOTECH.', interactiveMap: 'Інтерактивна SVG-карта BIBLIOTECH', firstFloor: 'Перший поверх Тушинського комплексу', markedRoom: 'Позначений кабінет', roomLead: 'У цьому кабінеті розміщено фізичний фонд BIBLIOTECH.', storageScheme: 'Відкрити схему місць зберігання →',
        safeCatalogImport: 'Безпечне поповнення каталогу', importLimits: 'Підтримуються CSV та XLSX до 5 МБ і 500 рядків. Спочатку файл буде лише перевірено.',
        closeImport: 'Закрити імпорт', dropFile: 'Перетягніть файл сюди', chooseImportFile: 'або натисніть, щоб вибрати CSV / XLSX', requiredImportColumns: 'Обов’язкові стовпці: «Назва» та «Автор»',
        uploadFile: 'Завантажте файл', importBatchLimit: 'До 500 книг за один імпорт', checkRows: 'Перевірте рядки', importPreviewHint: 'Помилки й дублікати видно заздалегідь', confirmImport: 'Підтвердьте', importTransactionHint: 'Запис виконується однією транзакцією', addBooks: 'Додати книги'
    });
    Object.assign(PACKS.de, {
        adminEyebrow: 'Administratorbereich', adminHeading: 'BIBLIOTECH verwalten',
        adminLead: 'Benutzer, Lagerorte, Ausleihe und sichere Katalogimporte befinden sich in einem Arbeitsbereich.',
        workToolsLead: 'Wählen Sie eine Aufgabe – komplexe Formulare öffnen sich separat und halten die Seite übersichtlich.',
        importLead: 'CSV- und Excel-Dateien vor dem Import prüfen.', inventoryLead: 'QR-Codes scannen und fehlende oder falsch platzierte Bücher finden.',
        pdfLead: 'Verknüpfte QR-Etiketten und Entwürfe für Verwaltungsdokumente.', usersLead: 'Rollen, Status, Anmeldungen und Leseraktivität.',
        storageLead: 'Regale, Zonen und genaue Buchstandorte.', rentalsLead: 'Aktuelle Ausleihen, Rückgaben und PDF-Belege.', adminSections: 'Verwaltungsbereiche', bookRentals: 'Buchausleihe',
        productFooter: '· digitaler Bibliothekskatalog · 2026', statsBooksInline: 'Bücher befinden sich derzeit im Katalog.', statsCopiesInline: 'Exemplare sind für Verwaltung und Ausleihe verfügbar.', statsCommentsInline: 'Kommentare wurden von Lesern hinterlassen.',
        mapEyebrow: 'Tuschino-Komplex · 1. Etage', mapLead: 'Der Plan wurde anhand der bereitgestellten Bilder als native SVG-Karte rekonstruiert. Räume, Gebäude und Straßen passen sich dem gewählten BIBLIOTECH-Design an.', interactiveMap: 'Interaktive BIBLIOTECH-SVG-Karte', firstFloor: 'Erste Etage des Tuschino-Komplexes', markedRoom: 'Markierter Raum', roomLead: 'In diesem Raum befindet sich der physische BIBLIOTECH-Bestand.', storageScheme: 'Lagerplan öffnen →',
        safeCatalogImport: 'Sicherer Katalogimport', importLimits: 'CSV- und XLSX-Dateien bis 5 MB und 500 Zeilen werden unterstützt. Die Datei wird zuerst nur geprüft.',
        closeImport: 'Import schließen', dropFile: 'Datei hier ablegen', chooseImportFile: 'oder klicken, um CSV / XLSX auszuwählen', requiredImportColumns: 'Pflichtspalten: „Titel“ und „Autor“',
        uploadFile: 'Datei hochladen', importBatchLimit: 'Bis zu 500 Bücher pro Import', checkRows: 'Zeilen prüfen', importPreviewHint: 'Fehler und Duplikate werden vorher angezeigt', confirmImport: 'Bestätigen', importTransactionHint: 'Alle Zeilen werden in einer Transaktion gespeichert', addBooks: 'Bücher hinzufügen'
    });
    Object.assign(PACKS.kk, {
        adminEyebrow: 'Әкімші панелі', adminHeading: 'BIBLIOTECH басқару',
        adminLead: 'Пайдаланушылар, сақтау орындары, кітап беру және каталогты қауіпсіз толықтыру бір жұмыс кеңістігінде.',
        workToolsLead: 'Тапсырманы таңдаңыз — күрделі пішіндер бөлек ашылып, бетті ауырлатпайды.',
        importLead: 'Каталогқа қоспас бұрын CSV және Excel файлдарын тексеру.', inventoryLead: 'QR сканерлеу, жетіспейтін және орнында жоқ кітаптарды табу.',
        pdfLead: 'Сілтемесі бар QR жапсырмалары және есеп құжаттарының жобалары.', usersLead: 'Оқырман рөлдері, күйлері, кірулері және белсенділігі.',
        storageLead: 'Сөрелер, аймақтар және кітаптардың нақты орындары.', rentalsLead: 'Ағымдағы берілімдер, қайтарулар және PDF актілері.', adminSections: 'Әкімшілік бөлімдері', bookRentals: 'Кітап беру',
        productFooter: '· кітапхананың цифрлық каталогы · 2026', statsBooksInline: 'кітап қазір каталогта бар.', statsCopiesInline: 'дана есепке алу және беру үшін қолжетімді.', statsCommentsInline: 'пікірді оқырмандар қалдырды.',
        mapEyebrow: 'Тушино кешені · 1-қабат', mapLead: 'Жоспар берілген суреттер негізінде жергілікті SVG карта ретінде қайта жасалды. Бөлмелер, ғимараттар мен жолдар таңдалған BIBLIOTECH тақырыбына бейімделеді.', interactiveMap: 'BIBLIOTECH интерактивті SVG картасы', firstFloor: 'Тушино кешенінің бірінші қабаты', markedRoom: 'Белгіленген кабинет', roomLead: 'Бұл кабинетте BIBLIOTECH-тің физикалық қоры орналасқан.', storageScheme: 'Сақтау орындарының сызбасын ашу →',
        safeCatalogImport: 'Каталогты қауіпсіз толықтыру', importLimits: '5 МБ және 500 жолға дейінгі CSV және XLSX файлдары қолданылады. Алдымен файл тексеріледі.',
        closeImport: 'Импортты жабу', dropFile: 'Файлды осы жерге сүйреңіз', chooseImportFile: 'немесе CSV / XLSX таңдау үшін басыңыз', requiredImportColumns: 'Міндетті бағандар: «Атауы» және «Автор»',
        uploadFile: 'Файлды жүктеңіз', importBatchLimit: 'Бір импортта 500 кітапқа дейін', checkRows: 'Жолдарды тексеріңіз', importPreviewHint: 'Қателер мен көшірмелер алдын ала көрсетіледі', confirmImport: 'Растау', importTransactionHint: 'Барлық жол бір транзакцияда сақталады', addBooks: 'Кітаптарды қосу'
    });
    Object.assign(PACKS.es, {
        adminEyebrow: 'Panel de administración', adminHeading: 'Gestionar BIBLIOTECH',
        adminLead: 'Usuarios, ubicaciones, préstamos e importaciones seguras se organizan en un solo espacio de trabajo.',
        workToolsLead: 'Elige una tarea: los formularios complejos se abren por separado y mantienen la página ordenada.',
        importLead: 'Validación de CSV y Excel antes de añadirlos al catálogo.', inventoryLead: 'Escaneo de QR y detección de libros ausentes o fuera de lugar.',
        pdfLead: 'Etiquetas QR con enlace y borradores de documentos contables.', usersLead: 'Roles, estados, accesos y actividad de los lectores.',
        storageLead: 'Estantes, zonas y ubicaciones exactas de los libros.', rentalsLead: 'Préstamos actuales, devoluciones y actas PDF.', adminSections: 'Secciones de administración', bookRentals: 'Préstamo de libros',
        productFooter: '· catálogo digital de la biblioteca · 2026', statsBooksInline: 'libros están ahora en el catálogo.', statsCopiesInline: 'ejemplares están disponibles para control y préstamo.', statsCommentsInline: 'comentarios fueron dejados por lectores.',
        mapEyebrow: 'Complejo Tushino · planta 1', mapLead: 'El plano se reconstruyó a partir de las imágenes proporcionadas como un mapa SVG nativo. Las salas, edificios y carreteras se adaptan al tema BIBLIOTECH elegido.', interactiveMap: 'Mapa SVG interactivo de BIBLIOTECH', firstFloor: 'Primera planta del complejo Tushino', markedRoom: 'Aula destacada', roomLead: 'La colección física de BIBLIOTECH se encuentra en esta aula.', storageScheme: 'Abrir el plano de almacenamiento →',
        safeCatalogImport: 'Importación segura al catálogo', importLimits: 'Se admiten archivos CSV y XLSX de hasta 5 MB y 500 filas. Primero se valida el archivo.',
        closeImport: 'Cerrar importación', dropFile: 'Arrastra un archivo aquí', chooseImportFile: 'o haz clic para elegir CSV / XLSX', requiredImportColumns: 'Columnas obligatorias: «Título» y «Autor»',
        uploadFile: 'Sube un archivo', importBatchLimit: 'Hasta 500 libros por importación', checkRows: 'Revisa las filas', importPreviewHint: 'Los errores y duplicados se muestran antes', confirmImport: 'Confirmar', importTransactionHint: 'Todas las filas se guardan en una transacción', addBooks: 'Añadir libros'
    });
    Object.assign(PACKS.zh, {
        adminEyebrow: '管理员面板', adminHeading: '管理 BIBLIOTECH', adminLead: '用户、存放位置、借阅和安全目录导入集中在一个工作区中。',
        workToolsLead: '选择任务；复杂表单会单独打开，保持页面简洁。', importLead: '添加到目录前验证 CSV 和 Excel 文件。',
        inventoryLead: '扫描二维码并查找缺失或放错位置的图书。', pdfLead: '带链接的二维码标签和管理文档草稿。',
        usersLead: '读者角色、状态、登录和活动。', storageLead: '书架、区域和图书的准确位置。', rentalsLead: '当前借阅、归还和 PDF 单据。', adminSections: '管理分区', bookRentals: '图书借阅',
        productFooter: '· 数字图书馆目录 · 2026', statsBooksInline: '本书当前已加入目录。', statsCopiesInline: '册图书可用于登记和借阅。', statsCommentsInline: '条评论由读者留下。',
        mapEyebrow: '图西诺综合体 · 1 层', mapLead: '该平面图依据提供的图像重建为原生 SVG 地图。房间、楼体和道路会适配所选的 BIBLIOTECH 主题。', interactiveMap: 'BIBLIOTECH 交互式 SVG 地图', firstFloor: '图西诺综合体一层', markedRoom: '已标记房间', roomLead: 'BIBLIOTECH 的实体馆藏位于该房间。', storageScheme: '打开存放位置图 →',
        safeCatalogImport: '安全导入目录', importLimits: '支持不超过 5 MB、500 行的 CSV 和 XLSX 文件。文件会先经过验证。',
        closeImport: '关闭导入', dropFile: '将文件拖到此处', chooseImportFile: '或点击选择 CSV / XLSX', requiredImportColumns: '必填列：“书名”和“作者”',
        uploadFile: '上传文件', importBatchLimit: '每次最多导入 500 本书', checkRows: '检查各行', importPreviewHint: '提前显示错误和重复项', confirmImport: '确认', importTransactionHint: '所有行在一个事务中保存', addBooks: '添加图书'
    });

    var sourceToKey = new Map();
    Object.keys(BASE).forEach(function (key) {
        if (!sourceToKey.has(BASE[key])) sourceToKey.set(BASE[key], key);
    });
    var originalText = new WeakMap();
    var originalAttributes = new WeakMap();
    var dynamicText = new WeakMap();
    var translating = false;
    var observer = null;

    var DYNAMIC_LABELS = {
        ru: { admin: 'Админ:', user: 'Пользователь:', guest: 'Гостевой режим', lighter: 'Сделать тему «{theme}» светлее', darker: 'Сделать тему «{theme}» темнее' },
        en: { admin: 'Admin:', user: 'User:', guest: 'Guest mode', lighter: 'Make the “{theme}” theme lighter', darker: 'Make the “{theme}” theme darker' },
        uk: { admin: 'Адмін:', user: 'Користувач:', guest: 'Гостьовий режим', lighter: 'Зробити тему «{theme}» світлішою', darker: 'Зробити тему «{theme}» темнішою' },
        de: { admin: 'Admin:', user: 'Benutzer:', guest: 'Gastmodus', lighter: 'Das Design „{theme}“ heller machen', darker: 'Das Design „{theme}“ dunkler machen' },
        kk: { admin: 'Әкімші:', user: 'Пайдаланушы:', guest: 'Қонақ режимі', lighter: '«{theme}» тақырыбын ашық ету', darker: '«{theme}» тақырыбын күңгірт ету' },
        es: { admin: 'Admin:', user: 'Usuario:', guest: 'Modo invitado', lighter: 'Aclarar el tema «{theme}»', darker: 'Oscurecer el tema «{theme}»' },
        zh: { admin: '管理员：', user: '用户：', guest: '访客模式', lighter: '将“{theme}”主题调亮', darker: '将“{theme}”主题调暗' }
    };
    var THEME_NAMES = {
        en: { 'Системная': 'System', 'Графит': 'Graphite', 'Лесная': 'Forest', 'Океан': 'Ocean', 'Закат': 'Sunset', 'Фиолетовая': 'Violet', 'Кофейная': 'Coffee', 'Монохром': 'Monochrome' },
        uk: { 'Системная': 'Системна', 'Графит': 'Графіт', 'Лесная': 'Лісова', 'Океан': 'Океан', 'Закат': 'Захід сонця', 'Фиолетовая': 'Фіолетова', 'Кофейная': 'Кавова', 'Монохром': 'Монохром' },
        de: { 'Системная': 'System', 'Графит': 'Graphit', 'Лесная': 'Wald', 'Океан': 'Ozean', 'Закат': 'Sonnenuntergang', 'Фиолетовая': 'Violett', 'Кофейная': 'Kaffee', 'Монохром': 'Monochrom' },
        kk: { 'Системная': 'Жүйелік', 'Графит': 'Графит', 'Лесная': 'Орман', 'Океан': 'Мұхит', 'Закат': 'Күн батуы', 'Фиолетовая': 'Күлгін', 'Кофейная': 'Кофе', 'Монохром': 'Монохром' },
        es: { 'Системная': 'Sistema', 'Графит': 'Grafito', 'Лесная': 'Bosque', 'Океан': 'Océano', 'Закат': 'Atardecer', 'Фиолетовая': 'Violeta', 'Кофейная': 'Café', 'Монохром': 'Monocromo' },
        zh: { 'Системная': '系统', 'Графит': '石墨', 'Лесная': '森林', 'Океан': '海洋', 'Закат': '日落', 'Фиолетовая': '紫罗兰', 'Кофейная': '咖啡', 'Монохром': '单色' }
    };

    function readLanguage() {
        var language = 'ru';
        try { language = localStorage.getItem(STORAGE_KEY) || document.documentElement.lang || 'ru'; } catch (error) {}
        return SUPPORTED.includes(language) ? language : 'ru';
    }

    function translated(key, language) {
        return (PACKS[language] && PACKS[language][key]) || BASE[key] || '';
    }

    function detectDynamicText(value) {
        var match = value.match(/^(🛡️\s*)?Админ:\s*(.+)$/);
        if (match) return { type: 'admin', icon: match[1] || '', value: match[2] };
        match = value.match(/^(👤\s*)?Пользователь:\s*(.+)$/);
        if (match) return { type: 'user', icon: match[1] || '', value: match[2] };
        match = value.match(/^(👀\s*)?Гостевой режим$/);
        if (match) return { type: 'guest', icon: match[1] || '' };
        match = value.match(/^Сделать тему «(.+)» (светлее|темнее)$/);
        if (match) return { type: match[2] === 'светлее' ? 'lighter' : 'darker', theme: match[1] };
        return null;
    }

    function renderDynamicText(descriptor, language) {
        var labels = DYNAMIC_LABELS[language] || DYNAMIC_LABELS.ru;
        if (descriptor.type === 'admin' || descriptor.type === 'user') return descriptor.icon + labels[descriptor.type] + ' ' + descriptor.value;
        if (descriptor.type === 'guest') return descriptor.icon + labels.guest;
        var theme = THEME_NAMES[language]?.[descriptor.theme] || descriptor.theme;
        return labels[descriptor.type].replace('{theme}', theme);
    }

    function translateTextNode(node, language) {
        if (!node || !node.nodeValue || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.parentElement?.tagName)) return;
        var raw = node.nodeValue;
        var trimmed = raw.trim();
        if (!trimmed) return;
        var dynamic = dynamicText.get(node) || detectDynamicText(trimmed);
        if (dynamic) {
            if (!dynamicText.has(node)) dynamicText.set(node, dynamic);
            var dynamicValue = renderDynamicText(dynamic, language);
            var dynamicStart = raw.indexOf(trimmed);
            var dynamicNext = raw.slice(0, dynamicStart) + dynamicValue + raw.slice(dynamicStart + trimmed.length);
            if (raw !== dynamicNext) node.nodeValue = dynamicNext;
            return;
        }
        var key = originalText.get(node) || sourceToKey.get(trimmed);
        if (!key) return;
        if (!originalText.has(node)) originalText.set(node, key);
        var value = translated(key, language);
        var start = raw.indexOf(trimmed);
        var next = raw.slice(0, start) + value + raw.slice(start + trimmed.length);
        if (raw !== next) node.nodeValue = next;
    }

    function translateAttributes(element, language) {
        if (!(element instanceof Element)) return;
        var saved = originalAttributes.get(element) || {};
        ['placeholder', 'aria-label', 'title'].forEach(function (attribute) {
            var current = element.getAttribute(attribute);
            var savedValue = saved[attribute];
            var dynamic = savedValue && typeof savedValue === 'object' ? savedValue : detectDynamicText(String(current || '').trim());
            if (dynamic) {
                saved[attribute] = dynamic;
                var dynamicValue = renderDynamicText(dynamic, language);
                if (current !== dynamicValue) element.setAttribute(attribute, dynamicValue);
                return;
            }
            var key = savedValue || sourceToKey.get(String(current || '').trim());
            if (!key) return;
            saved[attribute] = key;
            var value = translated(key, language);
            if (current !== value) element.setAttribute(attribute, value);
        });
        if (Object.keys(saved).length) originalAttributes.set(element, saved);
    }

    function translateTree(root, language) {
        if (!root) return;
        if (root.nodeType === Node.TEXT_NODE) translateTextNode(root, language);
        if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root, language);
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
            else translateAttributes(node, language);
        }
    }

    function languageMarkup() {
        return '<div class="language-switcher" id="languageSwitcher">' +
            '<button class="language-current" id="langToggleBtn" type="button" aria-label="Выбрать язык" aria-expanded="false">' +
            '<span class="lang-globe">🌐</span><span class="lang-current-code" id="langCurrentCode">RU</span><span class="lang-arrow">⌄</span></button>' +
            '<div id="langMenu" class="lang-menu">' + SUPPORTED.map(function (language) {
                var meta = META[language];
                return '<button class="lang-option" type="button" data-lang="' + language + '"><span>' + meta.flag + '</span><b>' + meta.label + '</b><small>' + meta.code + '</small></button>';
            }).join('') + '</div></div>';
    }

    function ensureLanguageControl() {
        if (document.getElementById('languageSwitcher')) return;
        var list = document.querySelector('#navMenu > ul, #mapNav > ul, #mapLiteNav > ul');
        if (!list) return;
        var item = document.createElement('li');
        item.className = 'nav-language-item';
        item.innerHTML = languageMarkup();
        var profileItem = Array.from(list.children).find(function (candidate) {
            return candidate.querySelector('#currentUserPill, #mapCurrentUser, #logoutBtn');
        });
        list.insertBefore(item, profileItem || null);
    }

    function syncControl(language) {
        var code = document.getElementById('langCurrentCode');
        if (code) code.textContent = META[language]?.code || 'RU';
        document.querySelectorAll('.lang-option').forEach(function (button) {
            button.classList.toggle('active', button.dataset.lang === language);
        });
        var toggle = document.getElementById('langToggleBtn');
        var toggleLabel = translated('chooseLanguage', language);
        if (toggle && toggle.getAttribute('aria-label') !== toggleLabel) toggle.setAttribute('aria-label', toggleLabel);
    }

    function applyLanguage(language, options) {
        options = options || {};
        language = SUPPORTED.includes(language) ? language : 'ru';
        if (options.persist !== false) {
            try { localStorage.setItem(STORAGE_KEY, language); } catch (error) {}
        }
        document.documentElement.lang = language;
        translating = true;
        translateTree(document.body, language);
        var titleKey = sourceToKey.get(document.title) || document.documentElement.dataset.i18nTitleKey;
        if (titleKey) {
            document.documentElement.dataset.i18nTitleKey = titleKey;
            document.title = translated(titleKey, language);
        }
        syncControl(language);
        translating = false;
        if (options.emit !== false) window.dispatchEvent(new CustomEvent('bibliotech:languagechange', { detail: { language: language } }));
        return language;
    }

    function closeMenu() {
        document.getElementById('languageSwitcher')?.classList.remove('open');
        document.getElementById('langMenu')?.classList.remove('active');
        document.getElementById('langToggleBtn')?.setAttribute('aria-expanded', 'false');
    }

    function bindControl() {
        var wrap = document.getElementById('languageSwitcher');
        var toggle = document.getElementById('langToggleBtn');
        var menu = document.getElementById('langMenu');
        if (!wrap || !toggle || !menu || wrap.dataset.sharedLanguageReady === 'true') return;
        wrap.dataset.sharedLanguageReady = 'true';
        toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            var open = !menu.classList.contains('active');
            wrap.classList.toggle('open', open);
            menu.classList.toggle('active', open);
            toggle.setAttribute('aria-expanded', String(open));
        });
        wrap.querySelectorAll('.lang-option').forEach(function (button) {
            button.addEventListener('click', function (event) {
                event.stopPropagation();
                applyLanguage(button.dataset.lang || 'ru');
                closeMenu();
            });
        });
        document.addEventListener('click', function (event) { if (!wrap.contains(event.target)) closeMenu(); });
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(); });
    }

    function observeDynamicContent() {
        if (!document.body || observer) return;
        var scheduled = false;
        observer = new MutationObserver(function () {
            if (translating || scheduled) return;
            scheduled = true;
            window.setTimeout(function () {
                scheduled = false;
                if (!translating) applyLanguage(readLanguage(), { persist: false, emit: false });
            }, 0);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
    }

    function init() {
        ensureLanguageControl();
        bindControl();
        applyLanguage(readLanguage(), { persist: false, emit: false });
        observeDynamicContent();
        window.addEventListener('storage', function (event) {
            if (event.key === STORAGE_KEY) applyLanguage(event.newValue || 'ru', { persist: false });
        });
    }

    window.BibliotechI18n = { apply: applyLanguage, current: readLanguage, translate: translated, languages: SUPPORTED.slice() };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
