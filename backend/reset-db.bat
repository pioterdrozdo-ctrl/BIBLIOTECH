@echo off
chcp 65001 > nul
echo ========================================
echo    RESET BIBLIOTECH DATABASE
echo ========================================
echo.

set PGPASSWORD=postgres

echo [1/3] Dropping old database...
psql -U postgres -c "DROP DATABASE IF EXISTS bibliotech;"
echo [OK]

echo [2/3] Creating fresh database...
psql -U postgres -c "CREATE DATABASE bibliotech;"
echo [OK]

echo [3/3] Initializing with correct schema and data...
psql -U postgres -d bibliotech -f "sql/init.sql"
echo [OK]

echo ========================================û
echo    RESET COMPLETE
echo ========================================
pause