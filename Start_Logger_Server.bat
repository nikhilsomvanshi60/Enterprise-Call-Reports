@echo off
setlocal
title NIK Call Logger Server

cd /d "%~dp0"

set "HOST_IP="
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined HOST_IP set "HOST_IP=%%A"
)
if not defined HOST_IP (
  for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
    if not defined HOST_IP set "HOST_IP=%%A"
  )
)
set "HOST_IP=%HOST_IP: =%"
if not defined HOST_IP set "HOST_IP=127.0.0.1"

echo =================================================================
echo Starting NIK Call Logger Server
echo =================================================================
echo.
echo Project folder: %CD%
echo Mobile app:      http://%HOST_IP%:3000
echo Admin login:     http://%HOST_IP%:3001/login.html
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not available in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

start "" cmd /c "timeout /t 4 /nobreak >nul & start "" http://%HOST_IP%:3001/login.html"

echo Starting server...
echo Press Ctrl+C to stop.
echo.
call npm.cmd start

echo.
echo Server stopped.
pause
