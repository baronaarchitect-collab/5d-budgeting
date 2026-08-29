@echo off
chcp 65001 >nul
title 5D BUDGETING - Presupuestacion (LifeCity)
cd /d "%~dp0"

echo ============================================================
echo   5D BUDGETING - Modulo de presupuestacion (standalone)
echo ============================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [!] No se encontro Python en el PATH.
  echo     Instala Python 3 desde https://www.python.org/downloads/
  echo     y marca "Add Python to PATH" durante la instalacion.
  echo.
  pause
  exit /b 1
)

start "" http://localhost:8151/index.html
echo Abriendo http://localhost:8151/index.html ...
echo (deja esta ventana abierta mientras usas la app; Ctrl+C para cerrar)
echo.
python serve.py
pause
