@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0nodejs\node.exe" set "PATH=%~dp0nodejs;%PATH%"
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo Starting MLB Parlay Finder with SQLite history...
echo Open http://localhost:3000
npm run usb:dev
pause
