@echo off
title NomCherry Cafe - Web System
echo ========================================================
echo   NOMCHERRY CAFE - SISTEM PEMESANAN DAN KASIR WEB
echo   Source Utama (Git): ProjekCafePBO\nomcherry-web
echo ========================================================
echo.
if /I "%~1"=="--demo" (
  set SEED_DEMO_DATA=true
  echo [MODE DEMO EKSPLISIT] SEED_DEMO_DATA=true diaktifkan.
)
echo Membuka aplikasi di browser (http://localhost:3000)...
cd /d "%~dp0nomcherry-web"
start http://localhost:3000
npm start
pause
