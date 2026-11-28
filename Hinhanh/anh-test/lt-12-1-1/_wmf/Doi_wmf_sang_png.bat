@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wmf_sang_png.ps1" -InDir "%~dp0."
echo.
pause
