@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title osu Setup Launcher - clear builder cache

echo This clears electron-builder caches that often break Setup.exe builds.
echo.
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
  echo Removing winCodeSign cache...
  rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
) else (
  echo winCodeSign cache was not found.
)
echo.
echo Done. Run build-installer.bat again.
echo Press any key to close.
pause >nul
endlocal
