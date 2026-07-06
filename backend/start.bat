@echo off
chcp 65001 > nul
title BIBLIOTECH - Server
taskkill /F /IM node.exe > nul 2>&1
cd /d "C:\Users\titan\Desktop\BIBLIOTECH_UI_SITE\backend"

echo ========================================
echo      BIBLIOTECH - SERVER START
echo ========================================
echo.

set PGPASSWORD=postgres

echo [1/4] Проверка базы данных...
psql -U postgres -lqt | find /i "bibliotech" > nul
if %errorlevel% equ 0 (
    echo   База данных существует
) else (
    echo   Создание базы данных...
    psql -U postgres -c "CREATE DATABASE bibliotech;"
    echo   База создана, инициализация таблиц...
    psql -U postgres -d bibliotech -f sql\init.sql
    echo   Таблицы готовы
    goto :run
)

echo [2/4] Проверка таблицы books...
psql -U postgres -d bibliotech -c "\dt books" 2>nul | find "books" > nul
if %errorlevel% equ 0 (
    echo   Таблица books существует
) else (
    echo   Таблицы отсутствуют, инициализация...
    psql -U postgres -d bibliotech -f sql\init.sql
    echo   Таблицы созданы
)

:run
echo.
echo [3/4] Запуск сервера в режиме отладки...
echo   Ошибки будут выводиться здесь
echo   Нажмите Ctrl+C для остановки
echo.

echo [4/4] Открытие браузера...
start http://localhost:3001

echo.
echo ========================================
echo   Сервер запущен
echo   Адрес: http://localhost:3001
echo   Для остановки закройте окно
echo ========================================
echo.

call npm run dev

pause