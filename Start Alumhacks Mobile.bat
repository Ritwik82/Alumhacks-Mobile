@echo off
cd /d "%~dp0"
start "Alumhacks local backend" /D "%~dp0" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "Alumhacks Expo mobile app" /D "%~dp0" cmd /k npx expo start --lan
