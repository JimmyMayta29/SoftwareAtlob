param(
  [int]$RetencionDias = 30,
  [ValidateSet('DATABASE_URL', 'TEST_DATABASE_URL')]
  [string]$DbEnv = 'DATABASE_URL',
  [string]$EmpresaId = '',
  [string]$RutaCopiaExterna = "$env:USERPROFILE\Documents\Respaldos_ATLOB_ERP",
  [switch]$OmitirCopiaExterna,
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

if (-not $OmitirCopiaExterna -and -not [string]::IsNullOrWhiteSpace($RutaCopiaExterna)) {
  $ultimoBak = Get-ChildItem -Path $RespaldosRoot -Filter '*.atlob.bak' -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not $ultimoBak) {
    throw "No se encontró el archivo .atlob.bak generado en $RespaldosRoot para copia externa."
  }

  $relDir = $ultimoBak.DirectoryName.Substring($RespaldosRoot.Length).TrimStart('\', '/')
  $destDir = if ($relDir) { Join-Path $RutaCopiaExterna $relDir } else { $RutaCopiaExterna }
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null

  $archivosACopiar = @($ultimoBak)
  $siblingSha = Get-ChildItem -Path $ultimoBak.DirectoryName -Filter "$($ultimoBak.BaseName)*" -File |
    Where-Object { $_.Extension -eq '.sha256' -or $_.Name -eq ($ultimoBak.Name + '.sha256') }
  if ($siblingSha) {
    $archivosACopiar += $siblingSha
  }
  $bitacora = Join-Path $RespaldosRoot 'bitacora-respaldos.json'
  if (Test-Path $bitacora) {
    Copy-Item -Path $bitacora -Destination (Join-Path $RutaCopiaExterna 'bitacora-respaldos.json') -Force
  }

  foreach ($archivo in $archivosACopiar) {
    Copy-Item -Path $archivo.FullName -Destination (Join-Path $destDir $archivo.Name) -Force
  }

  $destBak = Join-Path $destDir $ultimoBak.Name
  $hashOrigen = (Get-FileHash -Path $ultimoBak.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $hashDestino = (Get-FileHash -Path $destBak -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hashOrigen -ne $hashDestino) {
    throw "Error de integridad en copia externa: SHA-256 origen ($hashOrigen) != destino ($hashDestino)."
  }
  Write-Output "Copia externa verificada (SHA-256 $hashDestino): $destBak"
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
