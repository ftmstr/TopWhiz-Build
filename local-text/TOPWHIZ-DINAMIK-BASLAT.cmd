@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
where node >nul 2>&1 || exit /b 1
node services\tpw-orchestrator\scripts\unified-demo-integrity.mjs
if errorlevel 1 exit /b 1
node services\tpw-orchestrator\scripts\unified-demo.mjs
exit /b %errorlevel%
