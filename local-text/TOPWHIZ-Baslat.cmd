@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22 is required. & pause & exit /b 1)
echo Open http://127.0.0.1:8788/ in your browser. Press Ctrl+C to stop.
node server.mjs
pause
