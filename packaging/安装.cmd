@echo off
chcp 65001 >nul
echo.
echo   DSH startup animation - installer
echo   ---------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause
