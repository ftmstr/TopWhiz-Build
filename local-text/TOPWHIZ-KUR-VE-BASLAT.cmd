@echo off
setlocal DisableDelayedExpansion
set "SHA=65a79089bd1226cd31c495a89f191cba2f08c8ad"
set "REPO=https://github.com/ftmstr/TopWhiz-Build.git"
set "GIT_TERMINAL_PROMPT=0"
set "GCM_INTERACTIVE=Never"
set "WRANGLER_SEND_METRICS=false"
set "DO_NOT_TRACK=1"
set "CONFIRMED="
if "%~1"=="" goto :args_ok
if not "%~1"=="--yes" exit /b 1
if not "%~2"=="" exit /b 1
set "CONFIRMED=1"
:args_ok
echo TOPWHIZ SYNTHETIC LOCAL ONLY - HARD NO-GO
if not defined LOCALAPPDATA goto :fail
set "DEST=%LOCALAPPDATA%\TopWhizLocal\%SHA%"
where git >nul 2>&1 || goto :fail
where node >nul 2>&1 || goto :fail
where pnpm >nul 2>&1 || goto :fail
node -e "process.exit(process.versions.node.split('.')[0]==='22'?0:1)" || goto :fail
set "PNPMVER="
for /f "delims=" %%V in ('pnpm --version') do set "PNPMVER=%%V"
if not "%PNPMVER%"=="10.18.3" goto :fail
if exist "%DEST%" goto :existing
echo First setup downloads source and frozen dependencies. Redistribution BLOCKED.
if defined CONFIRMED goto :install
choice /c EH /n /m "Continue local installation? [E=Yes, H=No] "
if errorlevel 2 goto :cancel
if not errorlevel 1 goto :cancel
:install
echo TOPWHIZ_HELPER_FRESH_INSTALL
mkdir "%DEST%" || goto :fail
cd /d "%DEST%" || goto :fail
git init || goto :fail
git remote add origin "%REPO%" || goto :fail
git fetch --no-tags --depth=1 origin "%SHA%" || goto :fail
git checkout --detach "%SHA%" || goto :fail
call :verify_checkout || goto :fail
call pnpm install --frozen-lockfile || goto :fail
call :verify_checkout || goto :fail
call local-text\TOPWHIZ-DINAMIK-HAZIRLA.cmd || goto :fail
goto :start
:existing
echo TOPWHIZ_HELPER_REUSE
cd /d "%DEST%" || goto :fail
call :verify_checkout || goto :fail
if not exist "services\tpw-orchestrator\unified-demo.sha256.json" goto :fail
if not exist "services\tpw-orchestrator\unified-demo-licenses.json" goto :fail
:start
call :verify_checkout || goto :fail
call local-text\TOPWHIZ-DINAMIK-BASLAT.cmd || goto :fail
echo Demo stopped. No production release authorized.
if not defined CONFIRMED pause
exit /b 0
:verify_checkout
set "ACTUAL="
for /f "delims=" %%S in ('git rev-parse --verify HEAD 2^>nul') do set "ACTUAL=%%S"
if not "%ACTUAL%"=="%SHA%" exit /b 1
git diff --quiet HEAD -- || exit /b 1
exit /b 0
:cancel
echo Cancelled before installation.
exit /b 0
:fail
echo SETUP OR START FAILED. Existing files retained; no automatic repair or reseal. 1>&2
if not defined CONFIRMED pause
exit /b 1
