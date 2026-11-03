@echo off
setlocal
set "SCRIPT=%~dp0scripts\inicializar-escritorio.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
if errorlevel 1 pause
endlocal