# BIBLIOTECH

BIBLIOTECH — электронная библиотека с каталогом книг, поиском, фильтрами, комментариями, профилем, темами оформления, QR-сканером и голосовым поиском.

Проект сделан как один Node.js/Express-сервер: он раздаёт `frontend/` и API с одного адреса. Поэтому его удобно запускать локально, открывать с телефона в одной Wi-Fi сети и деплоить на Render.

## Возможности

- адаптивный красивый интерфейс для телефона и компьютера;
- вход, регистрация и гостевой режим;
- добавление книг с описанием, обложкой, количеством экземпляров;
- поиск по названию, автору, описанию и комментариям;
- фильтры и сортировка;
- комментарии к книгам;
- статистика библиотеки;
- поддержка PostgreSQL в облаке и JSON fallback локально.

## Быстрый запуск

```bash
npm install
npm start
```

После запуска:

- компьютер: `http://localhost:3001`
- телефон: адрес вида `http://192.168.x.x:3001`, который сервер покажет в консоли

Демо-вход:

- логин: `admin`
- пароль: `GreenScreen`

Также можно зайти как гость.

## Деплой на Render

В репозитории уже есть `render.yaml`. Render может создать web service и PostgreSQL автоматически.

1. Откройте Render.
2. Нажмите `New` -> `Blueprint`.
3. Подключите этот GitHub-репозиторий.
4. Render прочитает `render.yaml`.
5. Нажмите `Apply` / `Deploy`.

Render сам задаст:

- `NODE_ENV=production`
- `JWT_SECRET`
- `DATABASE_URL`

При старте сервер применит `backend/sql/init.sql`: создаст таблицы и демо-данные.

## Переменные окружения

Для ручной настройки можно использовать `.env.example`:

```env
NODE_ENV=production
JWT_SECRET=change-me-to-a-long-random-string
DATABASE_URL=postgres://...
```

Если `DATABASE_URL` не задан, проект работает через локальный JSON fallback: `backend/data/store.json`.

## Структура

- `frontend/` — HTML, CSS, JS, изображения и интерфейс.
- `backend/server.js` — запуск Express-сервера.
- `backend/routes/` — API для книг, комментариев, статистики и авторизации.
- `backend/services/localStore.js` — локальное JSON-хранилище.
- `backend/sql/init.sql` — схема PostgreSQL и демо-данные.
- `render.yaml` — готовый Render Blueprint.
- `DEPLOY_FREE.md` — простая инструкция для бесплатного запуска.
