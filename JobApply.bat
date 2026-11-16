@echo off
rem Double-click to start JobApply and open it in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing JobApply for the first time. This takes a minute...
  call npm install
  if errorlevel 1 (
    echo Install failed. See the messages above.
    pause
    exit /b 1
  )
)
echo Starting JobApply at http://localhost:3000  (close this window to stop it)
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm run dev
pause
