param(
  [switch]$Preparar,
  [switch]$Detener,
  [switch]$NoAbrirNavegador
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ConfigPath = Join-Path $ProjectRoot '.env'
$NodeModulesPath = Join-Path $ProjectRoot 'node_modules'
$DistPath = Join-Path $ProjectRoot 'dist'

function Get-ConfigValue([string]$Name) {
  $line = Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1].Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Convert-SecureStringToPlainText([System.Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function New-RandomHex([int]$ByteCount) {
  $bytes = New-Object byte[] $ByteCount
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return ([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant())
}

function Protect-ConfigFile {
  $icacls = Get-Command icacls.exe -ErrorAction SilentlyContinue
  $permissionsRestricted = $null -ne $icacls
  $account = "${env:USERDOMAIN}\${env:USERNAME}"

  if ($icacls) {
    try {
      $null = & $icacls.Source "$ConfigPath" /inheritance:r 2>&1
      if ($LASTEXITCODE -ne 0) { $permissionsRestricted = $false }
    }
    catch {
      $permissionsRestricted = $false
    }

    try {
      $null = & $icacls.Source "$ConfigPath" /grant:r "${account}:(R,W)" 2>&1
      if ($LASTEXITCODE -ne 0) { $permissionsRestricted = $false }
    }
    catch {
      $permissionsRestricted = $false
    }
  }

  if (-not $permissionsRestricted) {
    Write-Warning 'no se pudieron restringir los permisos del .env. Revise manualmente sus permisos con icacls.'
  }
}

function Initialize-Configuration {
  if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Write-Host 'Primera ejecución: configure la conexión a PostgreSQL.' -ForegroundColor Cyan
    Write-Host 'La cadena se solicita sin mostrarla y se guarda en .env, con permisos del usuario actual.'
    $secureUrl = Read-Host 'DATABASE_URL (postgresql://usuario:clave@servidor:5432/base)' -AsSecureString
    $databaseUrl = Convert-SecureStringToPlainText $secureUrl
    if ($databaseUrl -notmatch '^postgres(ql)?://' -or $databaseUrl -match '[\s#\r\n]') {
      throw 'La cadena DATABASE_URL no tiene un formato aceptado. Codifique caracteres especiales de usuario y contraseña como URL.'
    }

    $config = @(
      'NODE_ENV=production'
      'PORT=3000'
      'DATABASE_URL=' + $databaseUrl
      'JWT_SECRET=' + (New-RandomHex 48)
      'JWT_REFRESH_SECRET=' + (New-RandomHex 48)
      'SUNAT_ENCRYPTION_KEY=' + (New-RandomHex 32)
      'MFA_SEED_SECRET=' + (New-RandomHex 32)
      'BACKUP_ENCRYPTION_KEY=' + (New-RandomHex 32)
    ) -join [Environment]::NewLine
    [System.IO.File]::WriteAllText($ConfigPath, $config + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    $databaseUrl = $null
    Write-Host 'Configuración local creada.' -ForegroundColor Green
  }

  Protect-ConfigFile
  $databaseUrl = Get-ConfigValue 'DATABASE_URL'
  $jwtSecret = Get-ConfigValue 'JWT_SECRET'
  $refreshSecret = Get-ConfigValue 'JWT_REFRESH_SECRET'
  $encryptionKey = Get-ConfigValue 'SUNAT_ENCRYPTION_KEY'
  $mfaSeedSecret = Get-ConfigValue 'MFA_SEED_SECRET'
  $backupEncryptionKey = Get-ConfigValue 'BACKUP_ENCRYPTION_KEY'
  $configuredPort = Get-ConfigValue 'PORT'

  if (-not $databaseUrl -or $databaseUrl -notmatch '^postgres(ql)?://' -or $databaseUrl -match '[\s#\r\n]') {
    throw 'DATABASE_URL falta o no es válida en .env. No se iniciará el modo en memoria.'
  }
  if (-not $jwtSecret -or $jwtSecret.Length -lt 32 -or $jwtSecret.StartsWith('development-only-')) {
    throw 'JWT_SECRET debe contener al menos 32 caracteres propios de esta instalación.'
  }
  if (-not $refreshSecret -or $refreshSecret.Length -lt 32 -or $refreshSecret.StartsWith('development-only-') -or $refreshSecret -eq $jwtSecret) {
    throw 'JWT_REFRESH_SECRET debe ser distinto de JWT_SECRET y contener al menos 32 caracteres.'
  }
  if (-not $encryptionKey -or $encryptionKey -notmatch '^[a-fA-F0-9]{64}$' -or $encryptionKey -eq '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef') {
    throw 'SUNAT_ENCRYPTION_KEY debe ser una clave propia de 32 bytes expresada en hexadecimal.'
  }
  if (-not $mfaSeedSecret -or $mfaSeedSecret -notmatch '^[a-fA-F0-9]{64}$' -or $mfaSeedSecret -eq '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef') {
    throw 'MFA_SEED_SECRET debe ser una clave propia de 32 bytes expresada en hexadecimal.'
  }
  if (-not $backupEncryptionKey -or $backupEncryptionKey -notmatch '^[a-fA-F0-9]{64}$' -or $backupEncryptionKey -eq '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef') {
    throw 'BACKUP_ENCRYPTION_KEY debe ser una clave propia de 32 bytes expresada en hexadecimal.'
  }

  $port = 3000
  if ($configuredPort) {
    $parsedPort = 0
    if (-not [int]::TryParse($configuredPort, [ref]$parsedPort) -or $parsedPort -lt 1024 -or $parsedPort -gt 65535) {
      throw 'PORT en .env debe ser un número entre 1024 y 65535.'
    }
    $port = $parsedPort
  }

  $env:NODE_ENV = 'production'
  $env:HOST = '127.0.0.1'
  $env:PORT = [string]$port
  $env:DATABASE_URL = $databaseUrl
  $env:JWT_SECRET = $jwtSecret
  $env:JWT_REFRESH_SECRET = $refreshSecret
  $env:SUNAT_ENCRYPTION_KEY = $encryptionKey
  $env:MFA_SEED_SECRET = $mfaSeedSecret
  $env:BACKUP_ENCRYPTION_KEY = $backupEncryptionKey
  return $port
}

function Get-InstanceDirectory([int]$Port) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($ProjectRoot))).Replace('-', '').Substring(0, 12).ToLowerInvariant() }
  finally { $sha.Dispose() }
  $path = Join-Path $env:LOCALAPPDATA "SistemaContable\instances\$hash-$Port"
  New-Item -ItemType Directory -Path $path -Force | Out-Null
  return $path
}

function Test-ApplicationReady([int]$Port) {
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return $health.status -eq 'UP' -and $health.database -eq 'POSTGRESQL_CONNECTED'
  }
  catch { return $false }
}

function Add-DesktopShortcut {
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $shortcutPath = Join-Path $desktop 'Sistema Contable.lnk'
  $launcherPath = Join-Path $ProjectRoot 'Iniciar-Escritorio.bat'
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $launcherPath
  $shortcut.WorkingDirectory = $ProjectRoot
  $shortcut.Description = 'Iniciar el sistema contable en este equipo'
  $shortcut.Save()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
}

try {
  if ($env:OS -ne 'Windows_NT') { throw 'Este inicializador está diseñado para Windows.' }
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package-lock.json'))) {
    throw 'No se encontró package-lock.json. Ejecute el inicializador desde una copia completa del proyecto.'
  }

  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $node -or -not $npm) { throw 'Instale Node.js 22.12 o posterior y vuelva a ejecutar el inicializador.' }
  $nodeVersionText = (& $node.Source --version).Trim()
  if ($nodeVersionText -notmatch '^v(\d+)\.(\d+)\.(\d+)') { throw 'No se pudo determinar la versión de Node.js.' }
  $nodeVersion = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
  if ($nodeVersion -lt [version]'22.12.0') { throw "Node.js 22.12 o posterior es requerido; se detectó $nodeVersionText." }

  $port = Initialize-Configuration
  $instanceDirectory = Get-InstanceDirectory $port
  $pidPath = Join-Path $instanceDirectory 'servidor.pid'

  if ($Detener) {
    if (-not (Test-Path -LiteralPath $pidPath)) { Write-Host 'No hay un proceso registrado para detener.'; exit 0 }
    $serverPid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$serverPid)) { Remove-Item -LiteralPath $pidPath -Force; throw 'El identificador del proceso guardado no es válido.' }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid" -ErrorAction SilentlyContinue
    $expectedEntry = Join-Path $ProjectRoot 'server.ts'
    if ($processInfo -and $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine.Contains($expectedEntry)) {
      Stop-Process -Id $serverPid -Force
      Write-Host 'Servidor detenido.' -ForegroundColor Green
    } else {
      Write-Host 'El proceso ya no existe o no corresponde a esta instalación.'
    }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    exit 0
  }

  if (Test-ApplicationReady $port) {
    $registeredPid = 0
    $registeredProcess = $null
    if ((Test-Path -LiteralPath $pidPath) -and [int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$registeredPid)) {
      $registeredProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $registeredPid" -ErrorAction SilentlyContinue
    }
    $expectedEntry = Join-Path $ProjectRoot 'server.ts'
    if (-not $registeredProcess -or $registeredProcess.Name -ne 'node.exe' -or -not $registeredProcess.CommandLine.Contains($expectedEntry)) {
      throw "El puerto $port ya está ocupado por otro servicio. Cambie PORT en .env o cierre ese servicio."
    }
    if (-not $NoAbrirNavegador) { Start-Process "http://127.0.0.1:$port" }
    Write-Host "El sistema ya estaba disponible en http://127.0.0.1:$port" -ForegroundColor Green
    exit 0
  }

  if (-not (Test-Path -LiteralPath (Join-Path $NodeModulesPath 'tsx\dist\cli.mjs'))) {
    Write-Host 'Instalando dependencias bloqueadas por package-lock.json...' -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try { & $npm.Source ci; if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci.' } }
    finally { Pop-Location }
  }

  Write-Host 'Preparando la versión de escritorio...' -ForegroundColor Cyan
  Push-Location $ProjectRoot
  try { & $npm.Source run build; if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de producción.' } }
  finally { Pop-Location }
  if (-not (Test-Path -LiteralPath (Join-Path $DistPath 'index.html'))) { throw 'La compilación no produjo dist/index.html.' }
  if ($Preparar) { Write-Host 'Preparación terminada. No se inició el servidor.' -ForegroundColor Green; exit 0 }

  $stdoutPath = Join-Path $instanceDirectory 'servidor.stdout.log'
  $stderrPath = Join-Path $instanceDirectory 'servidor.stderr.log'
  $entryPoint = Join-Path $ProjectRoot 'server.ts'
  $serverArguments = '--import tsx "' + $entryPoint + '"'
  $serverProcess = Start-Process -FilePath $node.Source -ArgumentList $serverArguments -WorkingDirectory $ProjectRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  Set-Content -LiteralPath $pidPath -Value $serverProcess.Id -NoNewline

  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ($serverProcess.HasExited) { break }
    if (Test-ApplicationReady $port) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    throw "No fue posible iniciar PostgreSQL y el servidor local. Revise los registros en $instanceDirectory. No se usará almacenamiento en memoria."
  }

  Add-DesktopShortcut
  if (-not $NoAbrirNavegador) { Start-Process "http://127.0.0.1:$port" }
  Write-Host "Sistema iniciado localmente en http://127.0.0.1:$port" -ForegroundColor Green
  Write-Host 'Se creó un acceso directo en el Escritorio. Para cerrar, vuelva a ejecutar Iniciar-Escritorio.bat -Detener.'
  Write-Host "Registros de ejecución: $instanceDirectory"
}
catch {
  $errorRecord = $_
  $errorDetails = "Excepción completa:`r`n$($errorRecord.Exception.ToString())"
  if ($errorRecord.InvocationInfo) {
    $errorDetails += "`r`nLínea $($errorRecord.InvocationInfo.ScriptLineNumber): $($errorRecord.InvocationInfo.Line.Trim())"
  }
  $errorDetails += "`r`nDetalles:`r`n$($errorRecord | Format-List * -Force | Out-String)"
  if ($env:DATABASE_URL) {
    $errorDetails = $errorDetails.Replace($env:DATABASE_URL, '[DATABASE_URL REDACTADA]')
  }
  $errorDetails = [regex]::Replace($errorDetails, '(?i)postgres(?:ql)?://[^\s''"<>]+', '[DATABASE_URL REDACTADA]')
  Write-Host $errorDetails -ForegroundColor Red
  exit 1
}