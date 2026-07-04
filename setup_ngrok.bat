@echo off
title NIKLogger - Ngrok Permanent URL Setup
cls
echo ==================================================================
echo         NIK LOGGER - NGROK PERMANENT URL SETUP
echo ==================================================================
echo.
echo Is setup se aapka Mobile URL 100%% permanently fixed ho jayega
echo aur mobile par koi bhi passcode/IP enter nahi karna padega.
echo.
echo Prequisites (Sirf ek baar karna hai):
echo 1. Website par jayein: https://ngrok.com and register a free account.
echo 2. Login karke "Your Authtoken" section se apna token copy karein.
echo 3. Dashboard ke "Cloud Edge" -> "Domains" me jayein aur ek Free Domain claim karein.
echo    (Wo domain kuch aisa hoga: xxxx-xxxx.ngrok-free.app)
echo.
echo ==================================================================
echo.

set /p authtoken="👉 Apna Ngrok Authtoken enter karein: "
if "%authtoken%"=="" goto error

set /p domain="👉 Apna Ngrok Static Domain enter karein (e.g. xxxx-xxxx.ngrok-free.app): "
if "%domain%"=="" goto error

echo.
echo 🔄 Setting up authtoken...
cmd /c npx -y ngrok config add-authtoken %authtoken%

echo.
echo 🔄 Saving configuration...
if not exist "data" mkdir data
echo { "domain": "%domain%" } > data\ngrok_config.json

echo.
echo ==================================================================
echo ✅ SUCCESS: Ngrok setup complete!
echo Ab aapka URL permanently set ho chuka hai.
echo Kripya start_server.bat ko double-click karke server ko chalu karein.
echo ==================================================================
echo.
pause
exit

:error
echo.
echo ❌ Error: Authtoken aur Domain dono zaroori hain. Phirse run karein.
pause
exit
