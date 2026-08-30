@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
set "LOG=logs\install_nircmd_last.log"
echo ===== install nircmd ===== > "%LOG%"
echo date=%date% time=%time%>> "%LOG%"
echo dir=%CD%>> "%LOG%"
echo.>> "%LOG%"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools\install_nircmd.ps1" -ToolsDir "%CD%\tools" >> "%LOG%" 2>&1
set "CODE=%ERRORLEVEL%"
type "%LOG%"

echo.
if "%CODE%"=="0" (
  echo NirCmd setup completed.
) else (
  echo NirCmd setup failed. Check logs\install_nircmd_last.log
)
echo.
pause
exit /b %CODE%
