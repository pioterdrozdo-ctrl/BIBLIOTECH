# BIBLIOTECH

Финальная версия сайта библиотеки: Express раздаёт фронтенд и API с одного адреса, поэтому проект можно открыть с компьютера, телефона в одной Wi-Fi сети или задеплоить в облако.

## Запуск локально

```bash
npm install
npm start
```

Если запускаете из папки `backend`, команды такие:

```bash
npm install
npm start
```

После запуска откройте:

- компьютер: `http://localhost:3001`
- телефон: адрес вида `http://192.168.x.x:3001`, который сервер печатает в консоли

Компьютер и телефон должны быть в одной Wi-Fi сети. Для QR-сканера на телефоне лучше использовать HTTPS в облаке, потому что камера в мобильных браузерах часто требует защищённый origin.

## Вход

- Логин: `admin`
- Пароль: `GreenScreen`
- Также есть гостевой режим.

## Хранилище данных

Проект работает в двух режимах:

- PostgreSQL, если база настроена через `.env` или `DATABASE_URL`;
- JSON fallback, если PostgreSQL недоступен. Данные сохраняются в `backend/data/store.json`.

Именно поэтому сайт запускается даже без установленной базы данных.

## Облако

Подойдёт любой Node.js-хостинг: Render, Railway, Fly.io, VPS и похожие платформы.

Настройки:

- Build command: `npm install`
- Start command: `npm start`
- Environment: `NODE_ENV=production`, `JWT_SECRET=<длинный секрет>`, опционально `DATABASE_URL=<PostgreSQL URL>`

## Что внутри

- `frontend/` — страницы, стили, темы, каталог, QR, голосовой поиск.
- `backend/server.js` — единая точка запуска сайта и API.
- `backend/services/localStore.js` — локальное JSON-хранилище для запуска без PostgreSQL.
- `backend/sql/init.sql` — схема PostgreSQL и демо-данные.
