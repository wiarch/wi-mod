@echo off
cd /d "%~dp0.."

REM Cierra copias viejas de dist\wi-mod.exe (libreria vacia)
taskkill /F /IM wi-mod.exe >nul 2>&1

REM Datos del repo: data\ + mods\ + instances\
py -3 app.py
if errorlevel 1 pause
