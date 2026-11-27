@echo off
setlocal
cd /d "%~dp0.." || exit /b 1
where node >nul 2>&1 || exit /b 1
where pnpm >nul 2>&1 || exit /b 1
pnpm --filter @topwhiz/web licenses list --json > "%TEMP%\topwhiz-demo-licenses.json"
if errorlevel 1 exit /b 1
node scripts\tur011-license-gate.mjs "%TEMP%\topwhiz-demo-licenses.json" > "%TEMP%\topwhiz-demo-license-report.txt"
if errorlevel 1 exit /b 1
node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8').split(/\r?\n/)[0]);fs.writeFileSync('services/tpw-orchestrator/unified-demo-licenses.json',JSON.stringify(r))" "%TEMP%\topwhiz-demo-license-report.txt"
if errorlevel 1 exit /b 1
node services\tpw-orchestrator\scripts\unified-demo-integrity.mjs --seal
exit /b %errorlevel%
