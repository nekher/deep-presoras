@echo off
title Deep presoras — NO CERRAR ESTA VENTANA. Usá "Cerrar sesión" en la web.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [!] Node.js no esta instalado.
  echo       Descargalo de https://nodejs.org ^(LTS^) y volve a intentar.
  echo.
  pause
  exit /b 1
)
node server.js
echo.
echo   Programa cerrado. Cerrando ventana en 5 segundos...
timeout /t 5 >nul