@echo off
chcp 65001 > nul
title BIBLIOTECH - Drop Database

echo.
echo ========================================
echo     DELETE BIBLIOTECH DATABASE
echo ========================================
echo.

cd /d "C:\Users\titan\Desktop\BIBLIOTECH_UI_SITE\backend"

set PGPASSWORD=postgres

echo [WARNING] This will delete ALL data!
echo   - Users
echo   - Books  
echo   - Comments
echo.

choice /C YN /M "Are you sure you want to delete database?"

if errorlevel 2 goto :cancel
if errorlevel 1 goto :delete

:delete
echo.
echo [1/2] Dropping database...
psql -U postgres -c "DROP DATABASE IF EXISTS bibliotech;"

if %errorlevel% equ 0 (
    echo [OK] Database deleted successfully
) else (
    echo [ERROR] Failed to delete database
    pause
    exit /b 1
)

echo.
echo [2/2] Dropping old connections...
psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'bibliotech';" > nul 2>&1

echo.
echo ========================================
echo [OK] Database bibliotech has been deleted
echo ========================================
echo.

echo Next steps:
echo   1. Run reset-db.bat to create fresh database
echo   2. Or run start.bat to create and start
echo.
pause
exit /b 0

:cancel
echo.
echo [CANCEL] Database deletion aborted
echo.
pause