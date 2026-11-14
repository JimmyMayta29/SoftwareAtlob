param(
  [switch]$Rollback,
  [switch]$OmitirPull,
  [switch]$OmitirReinicio,
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$InstanceDir = Join-Path $ProjectRoot 'storage\instancia'
$CommitFile = Join-Path $InstanceDir 'ultimo-commit-estable.txt'
$EnvPath = Join-Path $ProjectRoot '.env'

function Get-DotEnvValue([string]$Key) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return $null }
  $line = Get-Content -LiteralPath $EnvPath | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

New-Item -ItemType Directory -Path $InstanceDir -Force | Out-Null

Push-Location $ProjectRoot
try {
  # 1. Respaldo obligatorio antes de actualizar o revertir código
  Write-Host '1/5 Generando respaldo previo obligatorio (AES-256-GCM + SHA-256)...' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'respaldo-diario.ps1')
  if ($LASTEXITCODE -ne 0) {
    throw 'Se aborta la operación porque falló el respaldo previo obligatorio.'
  }

  if ($Rollback) {
    if (-not (Test-Path -LiteralPath $CommitFile)) {
      throw 'No existe un commit previo registrado en storage\instancia\ultimo-commit-estable.txt.'
    }
    $targetCommit = (Get-Content -LiteralPath $CommitFile -Raw).Trim()
    $statusDirty = (& git status --porcelain)
    if ($statusDirty) {
      throw 'Existen cambios locales sin confirmar. Confirme o limpie antes de ejecutar rollback.'
    }

    # Verificar compatibilidad de esquema PostgreSQL antes de revertir código
    $migrationSource = (& git show "${targetCommit}:server/db/migration-files.ts" 2>$null) -join "`n"
    if (-not $migrationSource) {
      $migrationSource = (& git show "${targetCommit}:server/db/migrate.ts" 2>$null) -join "`n"
    }
    $targetMigrations = @([regex]::Matches($migrationSource, "['""]([^'""]+\.sql)['""]") | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    if ($targetMigrations.Count -eq 0) {
      throw "No se pudo verificar la lista de migraciones del commit destino $targetCommit."
    }

    $dbUrlRollback = Get-DotEnvValue 'DATABASE_URL'
    if (-not $dbUrlRollback) { throw 'DATABASE_URL ausente en .env.' }
    $env:DATABASE_URL = $dbUrlRollback
    $appliedJson = & npx.cmd tsx --input-type=module -e "import { Pool } from 'pg'; const p = new Pool({ connectionString: process.env.DATABASE_URL }); try { const r = await p.query('SELECT nombre FROM schema_migrations ORDER BY nombre'); console.log(JSON.stringify(r.rows.map(x => x.nombre))); } finally { await p.end(); }"
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar schema_migrations en PostgreSQL para validar compatibilidad de rollback.' }
    $appliedMigrations = @($appliedJson | ConvertFrom-Json)
    $incompatibles = @($appliedMigrations | Where-Object { $targetMigrations -notcontains $_ })
    if ($incompatibles.Count -gt 0) {
      throw "ROLLBACK_BLOQUEADO_ESQUEMA_INCOMPATIBLE: PostgreSQL tiene migraciones posteriores ausentes en $targetCommit ($($incompatibles -join ', ')). Restaure primero el respaldo .atlob.bak correspondiente si necesita retroceder el esquema."
    }

    Write-Host "2/5 Deteniendo servidor LAN de ATLOB ERP..." -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'detener-servidor-lan.ps1')

    Write-Host "3/5 Restaurando versión de código $targetCommit (sin alterar operaciones en PostgreSQL)..." -ForegroundColor Cyan
    & git checkout $targetCommit -- .
    if ($LASTEXITCODE -ne 0) { throw "Falló restauración de código hacia $targetCommit." }

    Write-Host '4/5 Recompilando interfaz...' -ForegroundColor Cyan
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Falló compilación tras rollback.' }

    if (-not $OmitirReinicio) {
      Write-Host '5/5 Reiniciando servidor LAN...' -ForegroundColor Cyan
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar-servidor-lan.ps1') -NoAbrirNavegador
      if ($LASTEXITCODE -ne 0) { throw 'Falló el reinicio del servidor tras rollback.' }
    }
    Write-Host "✅ Rollback de código completado a $targetCommit preservando 100% de datos en PostgreSQL." -ForegroundColor Green
    exit 0
  }

  $currentCommit = (& git rev-parse HEAD).Trim()
  Set-Content -LiteralPath $CommitFile -Value $currentCommit -NoNewline
  Write-Host "2/5 Commit estable previo registrado: $currentCommit" -ForegroundColor Gray

  if (-not $OmitirPull) {
    $dirty = (& git status --porcelain)
    if ($dirty) {
      throw 'El repositorio tiene cambios locales pendientes. Use -OmitirPull si desea validar sobre el estado actual o guarde los cambios primero.'
    }
    $lockAntes = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Algorithm SHA256).Hash
    & git pull --ff-only origin $Branch
    if ($LASTEXITCODE -ne 0) { throw 'Falló git pull --ff-only.' }
    $lockDespues = (Get-FileHash -LiteralPath (Join-Path $ProjectRoot 'package-lock.json') -Algorithm SHA256).Hash
    if ($lockAntes -ne $lockDespues) {
      Write-Host 'Actualizando dependencias (npm ci)...' -ForegroundColor Cyan
      & npm.cmd ci
      if ($LASTEXITCODE -ne 0) { throw 'Falló npm ci.' }
    }
  }

  Write-Host '3/5 Deteniendo servidor LAN para aplicar migraciones y compilación...' -ForegroundColor Cyan
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'detener-servidor-lan.ps1')

  $dbUrl = Get-DotEnvValue 'DATABASE_URL'
  if (-not $dbUrl) { throw 'DATABASE_URL ausente en .env.' }
  $env:DATABASE_URL = $dbUrl

  Write-Host '4/5 Ejecutando migraciones idempotentes, verificación TypeScript y compilación...' -ForegroundColor Cyan
  $migrateCode = "import { initializeDatabase, closeDatabase } from './server/config/database'; import { runMigrations } from './server/db/migrate'; await initializeDatabase(); await runMigrations(); await closeDatabase();"
  & npx.cmd tsx --input-type=module -e $migrateCode
  if ($LASTEXITCODE -ne 0) { throw 'Falló la aplicación de migraciones.' }

  & npm.cmd run lint
  if ($LASTEXITCODE -ne 0) { throw 'Falló npm run lint.' }

  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Falló npm run build.' }

  if (-not $OmitirReinicio) {
    Write-Host '5/5 Reiniciando servidor LAN y validando /api/health...' -ForegroundColor Cyan
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'iniciar-servidor-lan.ps1') -NoAbrirNavegador
    if ($LASTEXITCODE -ne 0) { throw 'Falló el reinicio del servidor tras la actualización.' }
  }

  Write-Host '✅ Actualización completada sin pérdida de datos.' -ForegroundColor Green
} finally {
  Pop-Location
}
