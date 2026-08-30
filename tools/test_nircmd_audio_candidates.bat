@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "NIRCMD=%~dp0nircmdc.exe"
if not exist "%NIRCMD%" (
  echo nircmdc.exe not found: %NIRCMD%
  echo Put nircmdc.exe in this tools folder first.
  pause
  exit /b 1
)
echo ===== NirCmd audio switch test =====
echo Example 1: スピーカー
echo Example 2: Speakers
echo Example 3: スピーカー (High Definition Audio Device)
echo.
set /p DEVICE=Device name: 
if "%DEVICE%"=="" (
  echo Device name is empty.
  pause
  exit /b 1
)
echo.
echo [1] no role
"%NIRCMD%" setdefaultsounddevice "%DEVICE%"
echo exit=%ERRORLEVEL%
echo.
for %%R in (0 1 2) do (
  echo [role %%R]
  "%NIRCMD%" setdefaultsounddevice "%DEVICE%" %%R
  echo exit=!ERRORLEVEL!
  echo.
)
echo Done.
pause
