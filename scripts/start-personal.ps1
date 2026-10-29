param([switch]$OpenBrowser)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$state = Join-Path $project 'embed-lab.local/personal'
$upstream = Join-Path $project 'embed-lab.local/oginstagram-selfhost'
$go = Join-Path $project 'embed-lab.local/toolchains/go/bin/go.exe'
$node = (Get-Command node -ErrorAction Stop).Source
if (!(Test-Path $go) -or !(Test-Path (Join-Path $upstream 'server/go.mod'))) { throw 'Missing local Go toolchain/upstream checkout. See LOCAL-HOSTING.md.' }
$revision = & git -C $upstream rev-parse HEAD
if ($revision -ne 'a92f5372880b61da9c2ba72e539a64ae4ef0350c') { throw 'Unexpected upstream revision; refusing to build.' }
New-Item -ItemType Directory -Force $state | Out-Null
function Test-Endpoint([string]$Uri,[string]$Expected) {
 try { $reply = Invoke-WebRequest $Uri -UseBasicParsing -TimeoutSec 3; return $reply.StatusCode -eq 200 -and $reply.Content -eq $Expected } catch { return $false }
}
function Wait-Endpoint([string]$Uri,[string]$Expected) {
 for ($attempt=0;$attempt -lt 25;$attempt++) { if (Test-Endpoint $Uri $Expected) { return }; Start-Sleep -Milliseconds 400 }
 throw "Service failed to start: $Uri. Check logs in $state"
}
if (!(Test-Endpoint 'http://127.0.0.1:18081/health' 'personal-core-v1')) {
 if (Get-NetTCPConnection -LocalPort 18081 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 18081 belongs to another service.' }
 Copy-Item (Join-Path $PSScriptRoot 'personal_core_test.go') (Join-Path $upstream 'server/personal_core_test.go')
 $env:GOCACHE = Join-Path $project 'embed-lab.local/toolchains/go-build'
 $env:GOMODCACHE = Join-Path $project 'embed-lab.local/toolchains/go-mod'
 $binary = Join-Path $state 'personal-core.exe'
 Push-Location (Join-Path $upstream 'server')
 try { & $go test -c -o $binary; if ($LASTEXITCODE -ne 0) { throw 'Local core build failed.' } } finally { Pop-Location }
 $env:PERSONAL_CORE='1'
 $env:DEVELOPMENT='true'
 $env:BASE_URL='http://127.0.0.1:18081'
 $env:DATA_DIR=Join-Path $state 'data'
 $env:ASSETS_DIR=Join-Path $project 'embed-lab.local/oginstagram-assets'
 $env:GOMEMLIMIT='128MiB'
 $process = Start-Process $binary -ArgumentList '-test.run=^TestPersonalCore$','-test.timeout=0' -WorkingDirectory $upstream -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $state 'core.log') -RedirectStandardError (Join-Path $state 'core.err.log')
 @{ pid=$process.Id; started=$process.StartTime.ToUniversalTime().ToString('o'); executable=$binary } | ConvertTo-Json | Set-Content (Join-Path $state 'core-process.json')
 Wait-Endpoint 'http://127.0.0.1:18081/health' 'personal-core-v1'
}
if (!(Test-Endpoint 'http://127.0.0.1:5178/api/personal/health' 'ok')) {
 if (Get-NetTCPConnection -LocalPort 5178 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5178 belongs to another service.' }
 $process = Start-Process $node -ArgumentList 'node_modules/vite/bin/vite.js','--mode','personal','--host','127.0.0.1','--port','5178','--strictPort' -WorkingDirectory $project -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $state 'viewer.log') -RedirectStandardError (Join-Path $state 'viewer.err.log')
 @{ pid=$process.Id; started=$process.StartTime.ToUniversalTime().ToString('o'); executable=$node } | ConvertTo-Json | Set-Content (Join-Path $state 'viewer-process.json')
 Wait-Endpoint 'http://127.0.0.1:5178/api/personal/health' 'ok'
}
Write-Output 'Personal viewer ready: http://127.0.0.1:5178/'
if ($OpenBrowser) { Start-Process 'http://127.0.0.1:5178/' }
