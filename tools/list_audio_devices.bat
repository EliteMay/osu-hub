@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ===== Audio Device List =====
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch_audio_device.ps1" -List
echo.
echo If this fails, send this screen or copy the error.
pause
