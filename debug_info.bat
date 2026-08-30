@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title osu Setup Launcher - debug info

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\debug_info.txt"

> "%LOG_FILE%" echo ===== osu Setup Launcher debug =====
>> "%LOG_FILE%" echo date=%date% time=%time%
>> "%LOG_FILE%" echo dir=%cd%
>> "%LOG_FILE%" echo.

echo デバッグ情報を作成しています...

echo [files] >> "%LOG_FILE%"
dir /b >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

echo [node] >> "%LOG_FILE%"
where node >> "%LOG_FILE%" 2>&1
node -v >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

echo [npm] >> "%LOG_FILE%"
where npm >> "%LOG_FILE%" 2>&1
npm -v >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

echo [electron] >> "%LOG_FILE%"
if exist "node_modules\.bin\electron.cmd" (
  echo electron.cmd exists >> "%LOG_FILE%"
) else (
  echo electron.cmd missing >> "%LOG_FILE%"
)
echo. >> "%LOG_FILE%"

echo [package.json] >> "%LOG_FILE%"
type package.json >> "%LOG_FILE%" 2>&1
echo. >> "%LOG_FILE%"

echo 完了: %LOG_FILE%
echo 起動できない場合、この debug_info.txt と start_last.log の内容を見れば原因を追えます。
echo.
pause
endlocal
