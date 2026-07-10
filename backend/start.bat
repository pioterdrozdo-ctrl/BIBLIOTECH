@echo off
chcp 65001 > nul
setlocal
title BIBLIOTECH - Server
cd /d "%~dp0"

where node > nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js не найден. Установите Node.js 18 или новее.
    pause
    exit /b 1
)

echo ========================================
echo      BIBLIOTECH - SERVER START
echo ========================================
echo.
echo Сервер использует PostgreSQL при наличии DATABASE_URL.
echo Без DATABASE_URL автоматически включается локальное JSON-хранилище.
echo.
echo Адрес: http://localhost:3001
echo Для остановки нажмите Ctrl+C.
echo.

start "" http://localhost:3001
node server.js

endlocal
