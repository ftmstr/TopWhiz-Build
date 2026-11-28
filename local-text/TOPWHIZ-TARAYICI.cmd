@echo off
setlocal
where node >nul 2>&1 || (echo Node.js 22 required. & pause & exit /b 1)
node "%~dp0TOPWHIZ-TARAYICI.mjs"
if errorlevel 1 (
  echo Browser launcher failed. Run TOPWHIZ-KUR-VE-BASLAT.cmd first or use its console URL.
  pause
  exit /b 1
)
exit /b 0
