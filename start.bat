@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title osu Setup Launcher - start

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\start_last.log"

> "%LOG_FILE%" echo [start] osu Setup Launcher
>> "%LOG_FILE%" echo [time] %date% %time%
>> "%LOG_FILE%" echo [dir] %cd%
>> "%LOG_FILE%" echo.

echo ==============================
echo osu Setup Launcher v17
echo ==============================
echo.
echo This window stays open for error checking.
echo Log: %LOG_FILE%
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Extract the zip first, then run start.bat from the extracted folder.
  >> "%LOG_FILE%" echo [error] package.json not found
  goto END
)

where node >nul 2>nul
set "NODE_CHECK=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [check] node exit code !NODE_CHECK!
if not "!NODE_CHECK!"=="0" (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS, then run start.bat again.
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

for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
for /f "delims=" %%v in ('npm -v 2^>nul') do set "NPM_VERSION=%%v"
echo Node: !NODE_VERSION!
echo npm : !NPM_VERSION!
>> "%LOG_FILE%" echo [node] !NODE_VERSION!
>> "%LOG_FILE%" echo [npm] !NPM_VERSION!
>> "%LOG_FILE%" echo.

if not exist "node_modules\electron" (
  echo Installing dependencies for first run...
  >> "%LOG_FILE%" echo [npm install] start
  call npm.cmd install >> "%LOG_FILE%" 2>&1
  set "INSTALL_CODE=!ERRORLEVEL!"
  >> "%LOG_FILE%" echo [npm install] exit code !INSTALL_CODE!
  echo npm install exit code: !INSTALL_CODE!
  if not "!INSTALL_CODE!"=="0" (
    echo [ERROR] npm install failed. Exit code: !INSTALL_CODE!
    echo Check logs\start_last.log for details.
    goto END
  )
)

if not exist "node_modules\.bin\electron.cmd" (
  echo [ERROR] electron.cmd was not found.
  echo Delete node_modules and run start.bat again, or run install.bat.
  >> "%LOG_FILE%" echo [error] electron.cmd not found
  goto END
)

echo Starting app...
>> "%LOG_FILE%" echo [electron] start
call "node_modules\.bin\electron.cmd" . >> "%LOG_FILE%" 2>&1
set "APP_CODE=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [electron] exit code !APP_CODE!

echo electron exit code: !APP_CODE!
if not "!APP_CODE!"=="0" (
  echo [ERROR] App failed to start. Exit code: !APP_CODE!
  echo Check logs\start_last.log for details.
)

:END
echo.
echo Log: %LOG_FILE%
echo.
echo Press any key to close this window.
pause >nul
endlocal
