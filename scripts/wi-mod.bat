@echo off
cd /d "%~dp0.."
if exist "%CD%\dist\wi-mod.exe" (
  start "" "%CD%\dist\wi-mod.exe"
  exit /b 0
)
py -3 app.py
if errorlevel 1 pause
