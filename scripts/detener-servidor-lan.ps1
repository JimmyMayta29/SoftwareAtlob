$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PidPath = Join-Path $ProjectRoot 'storage\instancia\atlob-lan.pid'

if (-not (Test-Path -LiteralPath $PidPath)) {
  Write-Host 'No hay ningún proceso LAN de ATLOB ERP registrado en storage\instancia\atlob-lan.pid.' -ForegroundColor Yellow
  exit 0
}

$rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
$serverPid = 0
if (-not [int]::TryParse($rawPid, [ref]$serverPid)) {
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  throw 'El archivo atlob-lan.pid contenía un PID inválido y fue limpiado.'
}

$procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
if (-not $procInfo) {
  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  Write-Host "El proceso PID $serverPid ya había terminado." -ForegroundColor Yellow
  exit 0
}

if ($procInfo.Name -ne 'node.exe' -or $procInfo.CommandLine -notlike '*server.ts*' -or $procInfo.CommandLine -notlike "*$ProjectRoot*") {
  throw "SEGURIDAD: El PID $serverPid no corresponde al proceso server.ts de esta carpeta. No se detendrá por seguridad."
}

Stop-Process -Id $serverPid
$espera = 0
while ($espera -lt 20) {
  $vivo = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
  if (-not $vivo) { break }
  Start-Sleep -Milliseconds 500
  $espera++
}
if (Get-Process -Id $serverPid -ErrorAction SilentlyContinue) {
  Stop-Process -Id $serverPid -Force
}

Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
Write-Host "✅ Servidor LAN de ATLOB ERP detenido con seguridad (únicamente PID $serverPid)." -ForegroundColor Green
