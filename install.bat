@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title osu Setup Launcher - install

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\install_last.log"

> "%LOG_FILE%" echo [install] osu Setup Launcher
>> "%LOG_FILE%" echo [time] %date% %time%
>> "%LOG_FILE%" echo [dir] %cd%
>> "%LOG_FILE%" echo.

echo ==============================
echo osu Setup Launcher install
echo ==============================
echo.
echo Log: %LOG_FILE%
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Extract the zip first, then run this bat from the extracted folder.
  >> "%LOG_FILE%" echo [error] package.json not found
  goto END
)

where node >nul 2>nul
set "NODE_CHECK=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [check] node exit code !NODE_CHECK!
if not "!NODE_CHECK!"=="0" (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS, then run install.bat again.
  echo https://nodejs.org/
  >> "%LOG_FILE%" echo [error] node not found
  goto END
)

where npm >nul 2>nul
set "NPM_CHECK=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [check] npm exit code !NPM_CHECK!
if not "!NPM_CHECK!"=="0" (
  echo [ERROR] npm was not found.
  echo Reinstall Node.js LTS and enable npm.
  >> "%LOG_FILE%" echo [error] npm not found
  goto END
)

echo Installing dependencies...
>> "%LOG_FILE%" echo [npm install] start
call npm.cmd install >> "%LOG_FILE%" 2>&1
set "INSTALL_CODE=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [npm install] exit code !INSTALL_CODE!
echo npm install exit code: !INSTALL_CODE!

if not "!INSTALL_CODE!"=="0" (
  echo [ERROR] npm install failed. Exit code: !INSTALL_CODE!
  echo Check logs\install_last.log for details.
  goto END
)

echo Done.

:END
echo.
echo Log: %LOG_FILE%
echo.
echo Press any key to close this window.
pause >nul
endlocal
