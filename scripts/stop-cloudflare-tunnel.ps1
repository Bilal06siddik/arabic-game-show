Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runDir = Join-Path $repoRoot '.run'
$cloudflaredPidFile = Join-Path $runDir 'cloudflared.pid'
$urlFile = Join-Path $runDir 'cloudflared.url'
$cloudflaredOutLog = Join-Path $runDir 'cloudflared.out.log'
$cloudflaredErrLog = Join-Path $runDir 'cloudflared.err.log'
$hostPidFile = Join-Path $runDir 'host.pid'
$hostOutLog = Join-Path $runDir 'host.out.log'
$hostErrLog = Join-Path $runDir 'host.err.log'
$hostManagedFile = Join-Path $runDir 'host.managed'
$didStopAnything = $false

if (Test-Path $cloudflaredPidFile) {
  $tunnelPid = (Get-Content $cloudflaredPidFile -Raw).Trim()
  if ($tunnelPid) {
    $proc = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $tunnelPid -Force
      Write-Host "Stopped cloudflared process PID $tunnelPid" -ForegroundColor Green
      $didStopAnything = $true
    } else {
      Write-Host "Process PID $tunnelPid was not running." -ForegroundColor Yellow
    }
  } else {
    Write-Host 'Tunnel PID file was empty. Cleaned up.' -ForegroundColor Yellow
  }

  Remove-Item $cloudflaredPidFile, $urlFile, $cloudflaredOutLog, $cloudflaredErrLog -Force -ErrorAction SilentlyContinue
}

if (Test-Path $hostManagedFile) {
  $managedHostPid = if (Test-Path $hostPidFile) { (Get-Content $hostPidFile -Raw).Trim() } else { '' }
  if ($managedHostPid) {
    $hostProc = Get-Process -Id $managedHostPid -ErrorAction SilentlyContinue
    if ($hostProc) {
      Stop-Process -Id $managedHostPid -Force
      Write-Host "Stopped managed host process PID $managedHostPid" -ForegroundColor Green
      $didStopAnything = $true
    } else {
      Write-Host "Managed host PID $managedHostPid was not running." -ForegroundColor Yellow
    }
  }

  Remove-Item $hostManagedFile, $hostPidFile, $hostOutLog, $hostErrLog -Force -ErrorAction SilentlyContinue
}

if (-not $didStopAnything) {
  Write-Host 'No running managed tunnel/host processes found.' -ForegroundColor Yellow
}
