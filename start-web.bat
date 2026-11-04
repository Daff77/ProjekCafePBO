@echo off
title NomCherry Cafe - Web System (Parley Design)
echo ========================================================
echo   NOMCHERRY CAFE - SISTEM PEMESANAN & KASIR WEB
echo   Desain Referensi: Parley Messaging Dashboard
echo ========================================================
echo.
echo Membuka aplikasi di browser (http://localhost:3000)...
cd /d "%~dp0nomcherry-web"
start http://localhost:3000
npm start
pause

