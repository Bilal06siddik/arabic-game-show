param(
  [int]$Port = 4000,
  [string]$LocalHost = 'localhost',
  [switch]$SkipHealthCheck,
  [switch]$NoAutoStartServer,
  [switch]$ShowProcessWindows
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Output "[tunnel] $Message"
}

function Resolve-CloudflaredPath {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe')
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Test-ServerHealth {
  param(
    [string]$Url,
    [int]$TimeoutSec = 4
  )

  try {
    $null = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec
    return $true
  }
  catch {
    return $false
  }
}

function Resolve-HostStartCommand {
  param([string]$RepoRoot)

  $serverDist = Join-Path $RepoRoot 'apps/server/dist/index.js'
  $webDist = Join-Path $RepoRoot 'apps/web/dist/index.html'
  $sharedDist = Join-Path $RepoRoot 'packages/shared/dist/index.js'

  if ((Test-Path $serverDist) -and (Test-Path $webDist) -and (Test-Path $sharedDist)) {
    return 'npm run host'
  }

  return 'npm run host:prod'
}

function Get-LogTail {
  param([string]$Path)

  if (Test-Path $Path) {
    return (Get-Content $Path -Tail 40 -ErrorAction SilentlyContinue) -join "`n"
  }

  return ''
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runDir = Join-Path $repoRoot '.run'
$cloudflaredOutLog = Join-Path $runDir 'cloudflared.out.log'
$cloudflaredErrLog = Join-Path $runDir 'cloudflared.err.log'
$cloudflaredPidFile = Join-Path $runDir 'cloudflared.pid'
$urlFile = Join-Path $runDir 'cloudflared.url'
$hostOutLog = Join-Path $runDir 'host.out.log'
$hostErrLog = Join-Path $runDir 'host.err.log'
$hostPidFile = Join-Path $runDir 'host.pid'
$hostManagedFile = Join-Path $runDir 'host.managed'
$healthUrl = "http://$LocalHost`:$Port/health"
$hostStartedByThisRun = $false
$hostProcessId = ''
$windowStyle = if ($ShowProcessWindows) { 'Normal' } else { 'Hidden' }

New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$cloudflaredPath = Resolve-CloudflaredPath
if (-not $cloudflaredPath) {
  Write-Step 'cloudflared not found. Installing via winget...'
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'winget is not available. Install cloudflared manually from Cloudflare then rerun this script.'
  }

  & winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements | Out-Host
  $cloudflaredPath = Resolve-CloudflaredPath
  if (-not $cloudflaredPath) {
    throw 'cloudflared installation finished but executable was not found.'
  }
}

Write-Step "Using cloudflared at: $cloudflaredPath"

if (-not $SkipHealthCheck) {
  if (Test-ServerHealth -Url $healthUrl) {
    Write-Step "Local game server is reachable at http://$LocalHost`:$Port"
  }
  else {
    if ($NoAutoStartServer) {
      throw "Local server is not reachable at $healthUrl and auto-start is disabled."
    }

    $hostStartCommand = Resolve-HostStartCommand -RepoRoot $repoRoot
    Write-Step "Local server not detected. Starting it automatically with '$hostStartCommand'..."

    if (Test-Path $hostPidFile) {
      $oldHostPid = (Get-Content $hostPidFile -Raw).Trim()
      if ($oldHostPid) {
        $oldHostProcess = Get-Process -Id $oldHostPid -ErrorAction SilentlyContinue
        if ($oldHostProcess) {
          Write-Step "Stopping previous managed host process PID $oldHostPid"
          Stop-Process -Id $oldHostPid -Force -ErrorAction SilentlyContinue
          Start-Sleep -Milliseconds 700
        }
      }
    }

    Remove-Item $hostOutLog, $hostErrLog -ErrorAction SilentlyContinue

    $hostProcess = Start-Process `
      -FilePath 'cmd.exe' `
      -ArgumentList @('/c', $hostStartCommand) `
      -RedirectStandardOutput $hostOutLog `
      -RedirectStandardError $hostErrLog `
      -WorkingDirectory $repoRoot `
      -WindowStyle $windowStyle `
      -PassThru

    $hostProcessId = "$($hostProcess.Id)"
    $hostStartedByThisRun = $true
    Set-Content -Path $hostPidFile -Value $hostProcessId
    Set-Content -Path $hostManagedFile -Value '1'
    Write-Step "Started host process (PID $hostProcessId). Waiting for readiness..."

    $hostDeadline = (Get-Date).AddSeconds(150)
    $serverReady = $false

    while ((Get-Date) -lt $hostDeadline) {
      if (Test-ServerHealth -Url $healthUrl -TimeoutSec 3) {
        $serverReady = $true
        break
      }

      if ($hostProcess.HasExited) {
        break
      }

      Start-Sleep -Milliseconds 800
    }

    if (-not $serverReady) {
      $hostOutTail = Get-LogTail -Path $hostOutLog
      $hostErrTail = Get-LogTail -Path $hostErrLog
      throw "Failed to auto-start local server at $healthUrl.`nCommand: $hostStartCommand`nLogs:`n$hostOutLog`n$hostErrLog`n--- HOST OUT ---`n$hostOutTail`n--- HOST ERR ---`n$hostErrTail"
    }

    Write-Step "Local game server is reachable at http://$LocalHost`:$Port"
  }
}

if (Test-Path $cloudflaredPidFile) {
  $oldPid = (Get-Content $cloudflaredPidFile -Raw).Trim()
  if ($oldPid) {
    $oldProcess = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($oldProcess) {
      Write-Step "Stopping previous tunnel process PID $oldPid"
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds 600
    }
  }
}

Remove-Item $cloudflaredOutLog, $cloudflaredErrLog, $urlFile -ErrorAction SilentlyContinue

$process = Start-Process `
  -FilePath $cloudflaredPath `
  -ArgumentList @('tunnel', '--url', "http://$LocalHost`:$Port", '--no-autoupdate') `
  -RedirectStandardOutput $cloudflaredOutLog `
  -RedirectStandardError $cloudflaredErrLog `
  -WorkingDirectory $repoRoot `
  -WindowStyle $windowStyle `
  -PassThru

Set-Content -Path $cloudflaredPidFile -Value $process.Id
Write-Step "Started cloudflared (PID $($process.Id)). Waiting for public URL..."

$regex = 'https://[-a-z0-9]+\.trycloudflare\.com'
$deadline = (Get-Date).AddSeconds(50)
$url = $null

while ((Get-Date) -lt $deadline -and -not $url) {
  foreach ($file in @($cloudflaredOutLog, $cloudflaredErrLog)) {
    if (-not (Test-Path $file)) {
      continue
    }

    $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) {
      continue
    }

    $match = [regex]::Match($content, $regex)
    if ($match.Success) {
      $url = $match.Value
      break
    }
  }

  if ($url) {
    break
  }

  if ($process.HasExited) {
    break
  }

  Start-Sleep -Milliseconds 500
}

if (-not $url) {
  $tailOut = Get-LogTail -Path $cloudflaredOutLog
  $tailErr = Get-LogTail -Path $cloudflaredErrLog
  throw "Failed to detect a tunnel URL. Check logs:`n$cloudflaredOutLog`n$cloudflaredErrLog`n--- OUT ---`n$tailOut`n--- ERR ---`n$tailErr"
}

Set-Content -Path $urlFile -Value $url

Write-Output ''
Write-Output 'Share this URL with your friends:'
Write-Output $url
Write-Output ''
if ($hostStartedByThisRun) {
  Write-Output "Host process PID: $hostProcessId"
}
Write-Output "Tunnel process PID: $($process.Id)"
Write-Output 'To stop tunnel: npm run tunnel:stop'
