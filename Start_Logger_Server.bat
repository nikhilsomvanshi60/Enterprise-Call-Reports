@echo off
title NIK Call Logger Server
echo =================================================================
echo 🚀 Starting NIK Call Logger Server & Global Tunnel...
echo =================================================================
echo.

:: Change directory to project root
cd /d C:\Users\Administrator\.gemini\antigravity-ide\scratch\call-logger

:: Wait 2 seconds, then open the Dashboard in default browser
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/dashboard.html"

:: Start Node.js application
npm start

pause
