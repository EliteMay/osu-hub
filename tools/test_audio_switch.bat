@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set /p DEVICE_NAME=Target device name part: 
echo ===== Audio Switch Test =====
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0switch_audio_device.ps1" -DeviceName "%DEVICE_NAME%"
echo.
echo If this fails, send this screen or copy the error.
pause
