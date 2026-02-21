param(
  [ValidateSet('interactive', 'start', 'stop', 'status')]
  [string]$Action = 'interactive',
  [int]$Port = 4000,
  [string]$LocalHost = 'localhost',
  [switch]$SkipHealthCheck,
  [switch]$NoAutoStartServer,
  [switch]$ShowProcessWindows
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runDir = Join-Path $repoRoot '.run'
$startScript = Join-Path $PSScriptRoot 'start-cloudflare-tunnel.ps1'
$stopScript = Join-Path $PSScriptRoot 'stop-cloudflare-tunnel.ps1'

function Get-ProcessState {
  param([string]$PidFilePath)

  if (-not (Test-Path $PidFilePath)) {
    return @{
      Exists = $false
      Pid = ''
      Running = $false
    }
  }

  $pidValue = (Get-Content $PidFilePath -Raw).Trim()
  if (-not $pidValue) {
    return @{
      Exists = $true
      Pid = ''
      Running = $false
    }
  }

  $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  return @{
    Exists = $true
    Pid = $pidValue
    Running = [bool]$proc
  }
}

function Test-ServerHealth {
  param([string]$Url)

  try {
    $null = Invoke-RestMethod -Uri $Url -TimeoutSec 3
    return $true
  }
  catch {
    return $false
  }
}

function Show-Status {
  $tunnelPidFile = Join-Path $runDir 'cloudflared.pid'
  $hostPidFile = Join-Path $runDir 'host.pid'
  $hostManagedFile = Join-Path $runDir 'host.managed'
  $urlFile = Join-Path $runDir 'cloudflared.url'

  $tunnelState = Get-ProcessState -PidFilePath $tunnelPidFile
  $hostState = Get-ProcessState -PidFilePath $hostPidFile
  $isHostManaged = Test-Path $hostManagedFile
  $shareUrl = if (Test-Path $urlFile) { (Get-Content $urlFile -Raw).Trim() } else { '' }
  $healthUrl = "http://$LocalHost`:$Port/health"
  $localServerReachable = Test-ServerHealth -Url $healthUrl

  Write-Host ''
  Write-Host 'Current tunnel status:' -ForegroundColor Cyan
  Write-Host "Tunnel running: $($tunnelState.Running)"
  if ($tunnelState.Pid) {
    Write-Host "Tunnel PID: $($tunnelState.Pid)"
  }
  if ($shareUrl) {
    Write-Host "Share URL: $shareUrl"
  }
  Write-Host ''
  Write-Host "Host running: $($hostState.Running)"
  if ($hostState.Pid) {
    Write-Host "Host PID: $($hostState.Pid)"
  }
  Write-Host "Host managed by tunnel script: $isHostManaged"
  Write-Host "Local server reachable: $localServerReachable ($healthUrl)"
  Write-Host ''
}

function Start-Tunnel {
  $startParams = @{
    Port = $Port
    LocalHost = $LocalHost
  }

  if ($SkipHealthCheck) {
    $startParams.SkipHealthCheck = $true
  }
  if ($NoAutoStartServer) {
    $startParams.NoAutoStartServer = $true
  }
  if ($ShowProcessWindows) {
    $startParams.ShowProcessWindows = $true
  }

  & $startScript @startParams
}

function Stop-Tunnel {
  & $stopScript
}

function Start-InteractiveMenu {
  while ($true) {
    Write-Host ''
    Write-Host 'Cloudflare Tunnel Menu' -ForegroundColor Cyan
    Write-Host '1) Start'
    Write-Host '2) Stop'
    Write-Host '3) Status'
    Write-Host '4) Exit'
    $selection = Read-Host 'Select option'

    switch ($selection) {
      '1' {
        Start-Tunnel
      }
      '2' {
        Stop-Tunnel
      }
      '3' {
        Show-Status
      }
      '4' {
        break
      }
      default {
        Write-Host 'Invalid option. Use 1, 2, 3, or 4.' -ForegroundColor Yellow
      }
    }
  }
}

switch ($Action) {
  'start' {
    Start-Tunnel
  }
  'stop' {
    Stop-Tunnel
  }
  'status' {
    Show-Status
  }
  default {
    Start-InteractiveMenu
  }
}
