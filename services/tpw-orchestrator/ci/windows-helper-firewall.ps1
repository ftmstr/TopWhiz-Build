$ErrorActionPreference = 'Stop'
$test = 'services/tpw-orchestrator/ci/windows-helper-e2e.mjs'
$sha = '65a79089bd1226cd31c495a89f191cba2f08c8ad'
$dest = Join-Path $env:LOCALAPPDATA "TopWhizLocal\$sha"
if (-not (Test-Path -LiteralPath $dest -PathType Container)) { throw 'HELPER_INSTALL_MISSING' }
$nodeExe = (& node -p process.execPath).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $nodeExe -PathType Leaf)) { throw 'NODE_PATH' }
$native = @(Get-ChildItem -LiteralPath (Join-Path $dest 'node_modules\.pnpm') -Recurse -File -Filter workerd.exe | Select-Object -ExpandProperty FullName -Unique)
if ($native.Count -lt 1) { throw 'WORKERD_EXE_NOT_FOUND' }
if (@(Get-NetFirewallProfile -PolicyStore ActiveStore | Where-Object { $_.Enabled -ne 'True' }).Count -ne 0) { throw 'FIREWALL_PROFILE_DISABLED' }
$ip = (Resolve-DnsName github.com -Type A | Where-Object IPAddress | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $ip) { throw 'OUTBOUND_CONTROL_IP_MISSING' }
& $nodeExe $test probe-open $ip
if ($LASTEXITCODE -ne 0) { throw 'OUTBOUND_BASELINE_FAILED' }
$rules = [System.Collections.Generic.List[string]]::new()
try {
 foreach ($program in @($nodeExe) + $native) {
  $name = "TOPWHIZ-LOCAL-CI-$([guid]::NewGuid())"
  $rules.Add($name)
  New-NetFirewallRule -Name $name -DisplayName $name -Direction Outbound -Action Block -Program $program -RemoteAddress @('0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::/0') -Profile Any -Enabled True | Out-Null
  $active = Get-NetFirewallRule -PolicyStore ActiveStore -Name $name
  if ($active.Enabled -ne 'True' -or $active.Action -ne 'Block' -or $active.Direction -ne 'Outbound') { throw 'FIREWALL_RULE_NOT_ACTIVE' }
  $filter = $active | Get-NetFirewallApplicationFilter
  if ($filter.Program -ine $program) { throw 'FIREWALL_PROGRAM_MISMATCH' }
  Write-Host "ACTIVE program-scoped outbound rule: $program"
 }
 & $nodeExe $test probe-blocked $ip
 if ($LASTEXITCODE -ne 0) { throw 'OUTBOUND_BLOCK_CONTROL_FAILED' }
 & $nodeExe $test reuse
 if ($LASTEXITCODE -ne 0) { throw 'HELPER_REUSE_FAILED' }
 Write-Host 'PASS hosted Windows process-scoped firewall local demo reuse; NOT full OS offline, NOT physical Windows'
} finally {
 foreach ($name in $rules) { Remove-NetFirewallRule -Name $name -ErrorAction SilentlyContinue }
}
foreach ($name in $rules) { if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { throw 'FIREWALL_CLEANUP_FAILED' } }
& $nodeExe $test probe-open $ip
if ($LASTEXITCODE -ne 0) { throw 'OUTBOUND_RESTORE_FAILED' }
Write-Host 'PASS program-scoped firewall cleanup and outbound control restored'
