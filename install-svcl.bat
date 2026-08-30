@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist logs mkdir logs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\install_svcl.ps1" -ToolsDir "%~dp0tools" > "%~dp0logs\install_svcl_last.log" 2>&1
set CODE=%ERRORLEVEL%
type "%~dp0logs\install_svcl_last.log"
echo.
echo exit code: %CODE%
pause
exit /b %CODE%
