@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title osu Setup Launcher - build installer

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\build_installer_last.log"

> "%LOG_FILE%" echo [build] osu Setup Launcher installer
>> "%LOG_FILE%" echo [time] %date% %time%
>> "%LOG_FILE%" echo [dir] %cd%
>> "%LOG_FILE%" echo.

echo ==============================
echo osu Setup Launcher exe build
echo ==============================
echo.
echo This builds the Windows Setup.exe into the dist folder.
echo The detailed log will be saved here:
echo %LOG_FILE%
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found.
  echo Open this bat from the extracted app folder.
  >> "%LOG_FILE%" echo [error] package.json not found
  goto END
)

where node >nul 2>nul
set "NODE_CHECK=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [check] node exit code !NODE_CHECK!
if not "!NODE_CHECK!"=="0" (
  echo [ERROR] Node.js was not found.
  echo Install Node.js LTS, then run this bat again.
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

REM Disable certificate auto-detection/signing. This avoids winCodeSign extraction on PCs
REM where symbolic link creation is blocked.
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="
>> "%LOG_FILE%" echo [env] CSC_IDENTITY_AUTO_DISCOVERY=false
>> "%LOG_FILE%" echo [env] win.signAndEditExecutable=false in package.json

REM Remove only the broken winCodeSign cache from the previous failed build.
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
  echo Clearing broken winCodeSign cache...
  >> "%LOG_FILE%" echo [cache] remove winCodeSign cache
  rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" >> "%LOG_FILE%" 2>&1
)

if not exist "node_modules\electron" (
  echo Installing dependencies...
  echo This may take a while on first run.
  >> "%LOG_FILE%" echo [npm install] start
  call npm.cmd install >> "%LOG_FILE%" 2>&1
  set "INSTALL_CODE=!ERRORLEVEL!"
  >> "%LOG_FILE%" echo [npm install] exit code !INSTALL_CODE!
  echo npm install exit code: !INSTALL_CODE!
  if not "!INSTALL_CODE!"=="0" (
    echo [ERROR] npm install failed. Exit code: !INSTALL_CODE!
    echo Check logs\build_installer_last.log for details.
    goto END
  )
) else (
  echo node_modules found. Skipping npm install.
  >> "%LOG_FILE%" echo [npm install] skipped because node_modules exists
)

if not exist "node_modules\.bin\electron-builder.cmd" (
  echo Installing electron-builder...
  >> "%LOG_FILE%" echo [electron-builder install] start
  call npm.cmd install --save-dev electron-builder@24.13.3 >> "%LOG_FILE%" 2>&1
  set "BUILDER_INSTALL_CODE=!ERRORLEVEL!"
  >> "%LOG_FILE%" echo [electron-builder install] exit code !BUILDER_INSTALL_CODE!
  echo electron-builder install exit code: !BUILDER_INSTALL_CODE!
  if not "!BUILDER_INSTALL_CODE!"=="0" (
    echo [ERROR] electron-builder install failed. Exit code: !BUILDER_INSTALL_CODE!
    echo Check logs\build_installer_last.log for details.
    goto END
  )
)

echo.
echo Building Setup.exe without code signing...
>> "%LOG_FILE%" echo.
>> "%LOG_FILE%" echo [electron-builder nsis no-sign] start
call "node_modules\.bin\electron-builder.cmd" --win nsis --x64 --publish never >> "%LOG_FILE%" 2>&1
set "BUILD_CODE=!ERRORLEVEL!"
>> "%LOG_FILE%" echo [electron-builder nsis no-sign] exit code !BUILD_CODE!
echo electron-builder exit code: !BUILD_CODE!

if not "!BUILD_CODE!"=="0" (
  echo.
  echo [WARN] Setup.exe build failed. Trying unpacked app fallback...
  >> "%LOG_FILE%" echo.
  >> "%LOG_FILE%" echo [fallback dir] start
  call "node_modules\.bin\electron-builder.cmd" --win dir --x64 --publish never >> "%LOG_FILE%" 2>&1
  set "DIR_CODE=!ERRORLEVEL!"
  >> "%LOG_FILE%" echo [fallback dir] exit code !DIR_CODE!
  echo fallback dir exit code: !DIR_CODE!
  if "!DIR_CODE!"=="0" (
    echo.
    echo Setup.exe failed, but unpacked app was created.
    echo Open: dist\win-unpacked\osu Setup Launcher.exe
    echo.
    echo If you need Setup.exe, enable Windows Developer Mode or run this bat as administrator.
    goto END
  )
  echo [ERROR] exe build failed. Exit code: !BUILD_CODE!
  echo Check logs\build_installer_last.log for details.
  echo.
  echo Common fix: Windows Settings - For developers - Developer Mode ON.
  echo Or right click build-installer.bat and run as administrator.
  goto END
)

echo.
echo Done.
echo Check the dist folder for the Setup.exe.

:END
echo.
echo Log: %LOG_FILE%
echo.
echo Press any key to close this window.
pause >nul
endlocal
