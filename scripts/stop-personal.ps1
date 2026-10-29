$ErrorActionPreference='Stop'
$state=Join-Path (Split-Path $PSScriptRoot -Parent) 'embed-lab.local/personal'
foreach ($name in @('viewer','core')) {
 $record=Join-Path $state ($name+'-process.json')
 if (!(Test-Path $record)) { continue }
 $info=Get-Content $record -Raw -Encoding UTF8 | ConvertFrom-Json
 $process=Get-Process -Id $info.pid -ErrorAction SilentlyContinue
 if (!$process) { continue }
 if ($process.Path -ne $info.executable -or $process.StartTime.ToUniversalTime().Ticks -ne ([datetime]$info.started).ToUniversalTime().Ticks) { throw "Process record no longer matches $name; refusing to stop it." }
 Stop-Process -Id $info.pid
 Write-Output "Stopped $name"
}
