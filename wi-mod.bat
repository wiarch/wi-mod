@echo off
cd /d "%~dp0"
if exist "%~dp0dist\wi-mod.exe" (
  start "" "%~dp0dist\wi-mod.exe"
  exit /b 0
)
py -3 app.py
if errorlevel 1 pause
