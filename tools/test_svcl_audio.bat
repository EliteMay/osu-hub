@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
if not exist "tools\svcl.exe" (
  echo svcl.exe not found. Run install-svcl.bat first.
  pause
  exit /b 1
)
set /p TARGET=Command-Line Friendly ID or Name: 
"tools\svcl.exe" /Stdout /SetDefault "%TARGET%" all
echo.
echo exit code: %ERRORLEVEL%
echo Check Windows sound menu to confirm the selected output.
pause
