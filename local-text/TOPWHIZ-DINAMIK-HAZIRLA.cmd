@echo off
setlocal
cd /d "%~dp0.." || (echo DEMO_PREPARE_FAIL: checkout directory 1>&2 & exit /b 1)
where node >nul 2>&1 || (echo DEMO_PREPARE_FAIL: node not found 1>&2 & exit /b 1)
where pnpm >nul 2>&1 || (echo DEMO_PREPARE_FAIL: pnpm not found 1>&2 & exit /b 1)
echo DEMO_PREPARE_PHASE: pnpm license inventory
call pnpm --filter @topwhiz/web licenses list --json > "%TEMP%\topwhiz-demo-licenses.json"
if errorlevel 1 (
  echo DEMO_PREPARE_FAIL: pnpm license inventory 1>&2
  exit /b 1
)
echo DEMO_PREPARE_PHASE: license gate
node scripts\tur011-license-gate.mjs "%TEMP%\topwhiz-demo-licenses.json" --local-demo-review-only > "%TEMP%\topwhiz-demo-license-report.txt"
if errorlevel 1 (
  echo DEMO_PREPARE_FAIL: license gate 1>&2
  if exist "%TEMP%\topwhiz-demo-license-report.txt" type "%TEMP%\topwhiz-demo-license-report.txt"
  exit /b 1
)
echo DEMO_PREPARE_PHASE: parse license report
node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8').split(/\r?\n/)[0]);fs.writeFileSync('services/tpw-orchestrator/unified-demo-licenses.json',JSON.stringify(r))" "%TEMP%\topwhiz-demo-license-report.txt"
if errorlevel 1 (
  echo DEMO_PREPARE_FAIL: parse license report 1>&2
  exit /b 1
)
echo DEMO_PREPARE_PHASE: seal source manifest
node services\tpw-orchestrator\scripts\unified-demo-integrity.mjs --seal
exit /b %errorlevel%
