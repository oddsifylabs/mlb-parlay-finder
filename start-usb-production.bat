@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0nodejs\node.exe" set "PATH=%~dp0nodejs;%PATH%"
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
if not exist .next (
  echo Building production app...
  npm run build
)
echo Starting production server...
echo Open http://localhost:3000
npm run usb:start
pause
