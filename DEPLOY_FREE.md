# Бесплатный запуск BIBLIOTECH в интернете

## Быстрый временный способ

Cloudflare Quick Tunnel дает публичную HTTPS-ссылку на локальный сайт без аккаунта.

```powershell
npm install
npm start
cloudflared tunnel --url http://localhost:3001
```

Минус: ссылка работает только пока включены компьютер, сервер Node.js и `cloudflared`.

## Постоянный бесплатный способ

Самый простой вариант для этого проекта: Render Web Service + Render Postgres через `render.yaml`.

1. Загрузите проект в GitHub.
2. Откройте Render и выберите New -> Blueprint.
3. Подключите репозиторий с этим проектом.
4. Render прочитает `render.yaml`, создаст Node.js web service и PostgreSQL.
5. После деплоя сайт будет доступен по HTTPS-ссылке Render.

Важно: бесплатные тарифы подходят для учебного проекта и демо. У web service возможен холодный старт после простоя, а условия бесплатных баз у хостингов могут меняться.

## Переменные окружения

`render.yaml` уже задает:

- `NODE_ENV=production`
- `JWT_SECRET` автоматически
- `DATABASE_URL` из PostgreSQL

При старте сервер сам применит `backend/sql/init.sql`, создаст таблицы и демо-админа.

Демо-вход:

- логин: `admin`
- пароль: `GreenScreen`
