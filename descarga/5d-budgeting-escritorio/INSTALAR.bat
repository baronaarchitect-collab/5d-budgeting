@echo off
chcp 65001 >nul
title Instalador - 5D BUDGETING
setlocal
set "SRC=%~dp0"
set "DEST=%LOCALAPPDATA%\5D Budgeting"

echo ============================================================
echo    INSTALADOR - 5D BUDGETING (version de escritorio Pro)
echo ============================================================
echo.
echo  Se instalara en:  %DEST%
echo.
pause

if not exist "%DEST%" mkdir "%DEST%"
echo Copiando archivos...
robocopy "%SRC%." "%DEST%" /E /XF INSTALAR.bat /NFL /NDL /NJH /NJS /NP >nul

set "LAUNCH=%DEST%\Iniciar 5D Budgeting.bat"
set "ICON=%SystemRoot%\System32\SHELL32.dll,167"

echo Creando accesos directos...
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([IO.Path]::Combine($w.SpecialFolders('Desktop'),'5D Budgeting.lnk')); $s.TargetPath='%LAUNCH%'; $s.WorkingDirectory='%DEST%'; $s.IconLocation='%ICON%'; $s.Description='5D Budgeting - Presupuestacion'; $s.Save()"
powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([IO.Path]::Combine($w.SpecialFolders('Programs'),'5D Budgeting.lnk')); $s.TargetPath='%LAUNCH%'; $s.WorkingDirectory='%DEST%'; $s.IconLocation='%ICON%'; $s.Save()"

echo.
echo  Listo. Se creo el acceso directo "5D Budgeting" en tu Escritorio
echo  y en el Menu Inicio.
echo.
where python >nul 2>nul || echo  [i] Para el modo servidor instala Python 3 (https://www.python.org/downloads/).
echo.
choice /C SN /M "Abrir 5D Budgeting ahora"
if errorlevel 2 goto fin
start "" "%LAUNCH%"
:fin
endlocal
