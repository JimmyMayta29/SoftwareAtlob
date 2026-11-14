param(
  [int]$Port = 3000,
  [int]$HttpsPort = 3443,
  [switch]$Recompilar,
  [switch]$NoAbrirNavegador
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$EnvPath = Join-Path $ProjectRoot '.env'
$InstanceDir = Join-Path $ProjectRoot 'storage\instancia'
$PidPath = Join-Path $InstanceDir 'atlob-lan.pid'
$CertDir = Join-Path $ProjectRoot 'storage\certs'
$CertPath = Join-Path $CertDir 'atlob-lan.crt'
$KeyPath = Join-Path $CertDir 'atlob-lan.key'
$CaPath = Join-Path $CertDir 'atlob-lan-ca.crt'
$DistIndex = Join-Path $ProjectRoot 'dist\index.html'

function Get-DotEnvValue([string]$Key) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return $null }
  $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $val = ($line -split '=', 2)[1].Trim()
  if ($val.Length -ge 2 -and (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'")))) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  return $val
}

try {
  New-Item -ItemType Directory -Path $InstanceDir -Force | Out-Null

  # 1. Verificar Node.js y PostgreSQL 18
  $node = Get-Command node.exe -ErrorAction Stop
  $npm = Get-Command npm.cmd -ErrorAction Stop
  $pgService = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pgService -and $pgService.Status -ne 'Running') {
    throw "El servicio PostgreSQL ($($pgService.Name)) está detenido ($($pgService.Status)). Inícielo antes de levantar ATLOB ERP."
  }

  # 2. Verificar .env y secretos obligatorios de producción
  if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw 'No se encontró el archivo .env en la raíz del proyecto. Ejecute .\scripts\inicializar-escritorio.ps1 -Preparar primero.'
  }

  $databaseUrl = Get-DotEnvValue 'DATABASE_URL'
  if (-not $databaseUrl -or $databaseUrl -notmatch '^postgres(ql)?://') {
    throw 'DATABASE_URL no está configurada o no tiene formato postgresql:// válido en .env.'
  }

  $secretKeys = @('JWT_SECRET', 'JWT_REFRESH_SECRET', 'SUNAT_ENCRYPTION_KEY', 'MFA_SEED_SECRET', 'BACKUP_ENCRYPTION_KEY')
  foreach ($sk in $secretKeys) {
    $sv = Get-DotEnvValue $sk
    if (-not $sv -or $sv -notmatch '^[a-fA-F0-9]{64}$') {
      throw "$sk en .env debe ser una clave propia de 64 dígitos hexadecimales para NODE_ENV=production."
    }
    Set-Item -Path "Env:$sk" -Value $sv
  }

  # 3. Evitar doble inicio validando únicamente el PID propio de esta instalación
  if (Test-Path -LiteralPath $PidPath) {
    $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
    $existingPid = 0
    if ([int]::TryParse($rawPid, [ref]$existingPid)) {
      $procInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $existingPid" -ErrorAction SilentlyContinue
      if ($procInfo -and $procInfo.Name -eq 'node.exe' -and $procInfo.CommandLine -like '*server.ts*') {
        try {
          $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
          if ($health.status -eq 'UP') {
            Write-Host "ATLOB ERP ya se encuentra en ejecución (PID $existingPid)." -ForegroundColor Green
            exit 0
          }
        } catch {}
      }
    }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
  }

  # 4. Verificar compilación frontend y certificados TLS LAN
  if ($Recompilar -or -not (Test-Path -LiteralPath $DistIndex)) {
    Write-Host 'Compilando interfaz de producción (npm run build)...' -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
      & $npm.Source run build
      if ($LASTEXITCODE -ne 0) { throw 'Error ejecutando npm run build.' }
    } finally {
      Pop-Location
    }
  }

  if (-not (Test-Path -LiteralPath $CertPath) -or -not (Test-Path -LiteralPath $KeyPath)) {
    Write-Host 'Generando certificados TLS locales para la red LAN...' -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
      & $npm.Source run cert:lan
      if ($LASTEXITCODE -ne 0) { throw 'Error generando certificados TLS LAN.' }
    } finally {
      Pop-Location
    }
  }

  # 5. Configurar variables de red LAN y CORS seguro
  $lanIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress)

  $allowedOrigins = @("http://127.0.0.1:$Port", "http://localhost:$Port", "https://127.0.0.1:$HttpsPort", "https://localhost:$HttpsPort")
  foreach ($ip in $lanIps) {
    $allowedOrigins += "https://${ip}:$HttpsPort"
    $allowedOrigins += "http://${ip}:$Port"
  }

  $env:NODE_ENV = 'production'
  $env:HOST = '0.0.0.0'
  $env:PORT = [string]$Port
  $env:HTTPS_ENABLED = '1'
  $env:HTTPS_PORT = [string]$HttpsPort
  $env:SSL_KEY_PATH = $KeyPath
  $env:SSL_CERT_PATH = $CertPath
  $env:DATABASE_URL = $databaseUrl
  if (-not (Get-DotEnvValue 'ALLOWED_ORIGIN')) {
    $env:ALLOWED_ORIGIN = ($allowedOrigins -join ',')
  }

  # 6. Iniciar proceso servidor registrando su PID exacto
  $stdoutPath = Join-Path $InstanceDir 'servidor.stdout.log'
  $stderrPath = Join-Path $InstanceDir 'servidor.stderr.log'
  $entryPoint = Join-Path $ProjectRoot 'server.ts'
  $argList = '--import tsx "' + $entryPoint + '"'
  $proc = Start-Process -FilePath $node.Source -ArgumentList $argList -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  Set-Content -LiteralPath $PidPath -Value $proc.Id -NoNewline

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    if ($proc.HasExited) { break }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($health.status -eq 'UP' -and $health.database -eq 'POSTGRESQL_CONNECTED') {
        $ready = $true
        break
      }
    } catch {}
    Start-Sleep -Milliseconds 500
  }

  if (-not $ready) {
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    throw "No se pudo confirmar disponibilidad de ATLOB ERP. Revise $stderrPath y $stdoutPath."
  }

  $primaryIp = if ($lanIps.Count -gt 0) { $lanIps[0] } else { '127.0.0.1' }
  Write-Host "✅ ATLOB ERP iniciado correctamente (PID $($proc.Id))." -ForegroundColor Green
  Write-Host "   - Acceso local HTTP  : http://127.0.0.1:$Port" -ForegroundColor Cyan
  Write-Host "   - Acceso LAN HTTPS   : https://${primaryIp}:$HttpsPort" -ForegroundColor Cyan
  Write-Host "   - Certificado CA LAN : $CaPath" -ForegroundColor Gray
  if (-not $NoAbrirNavegador) {
    Start-Process "https://127.0.0.1:$HttpsPort"
  }
}
catch {
  Write-Host "❌ Error iniciando servidor LAN: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
