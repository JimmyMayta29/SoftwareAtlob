param(
  [int]$RetencionDias = 30,
  [ValidateSet('DATABASE_URL', 'TEST_DATABASE_URL')]
  [string]$DbEnv = 'DATABASE_URL',
  [string]$EmpresaId = '',
  [switch]$RegistrarTareaProgramada,
  [switch]$DesregistrarTareaProgramada,
  [string]$HoraDiaria = '22:00'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$RespaldosRoot = Join-Path $ProjectRoot 'storage\respaldos'
$TaskName = 'ATLOB_ERP_Respaldo_Diario'

if ($DesregistrarTareaProgramada) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Tarea programada '$TaskName' eliminada." -ForegroundColor Yellow
  exit 0
}

if ($RegistrarTareaProgramada) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -WorkingDirectory $ProjectRoot
  $trigger = New-ScheduledTaskTrigger -Daily -At $HoraDiaria
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Respaldo diario cifrado y verificado con SHA-256 de ATLOB ERP' -Force | Out-Null
  Write-Host "✅ Tarea diaria '$TaskName' registrada a las $HoraDiaria." -ForegroundColor Green
  exit 0
}

New-Item -ItemType Directory -Path $RespaldosRoot -Force | Out-Null

$cliArgs = @('tsx', 'scripts/ejecutar-respaldo-cli.ts', '--db-env', $DbEnv)
if ($EmpresaId) {
  $cliArgs += @('--empresa-id', $EmpresaId)
}

Push-Location $ProjectRoot
try {
  & npx.cmd @cliArgs
  if ($LASTEXITCODE -ne 0) {
    throw 'El proceso de respaldo y verificación criptográfica falló.'
  }
} finally {
  Pop-Location
}

# Retención por antigüedad conservando siempre la carpeta más reciente
$limite = (Get-Date).AddDays(-$RetencionDias)
$carpetas = @(Get-ChildItem -Path $RespaldosRoot -Directory | Sort-Object Name -Descending)
if ($carpetas.Count -gt 1) {
  foreach ($carpeta in $carpetas | Select-Object -Skip 1) {
    if ($carpeta.LastWriteTime -lt $limite) {
      Remove-Item -LiteralPath $carpeta.FullName -Recurse -Force
      Write-Host "🧹 Respaldo antiguo eliminado por retención (>$RetencionDias días): $($carpeta.Name)" -ForegroundColor Gray
    }
  }
}
