param(
  [switch]$ConfirmarFirewall,
  [switch]$RemoverReglas,
  [int]$HttpsPort = 3443
)

$ErrorActionPreference = 'Stop'
$RuleHttps = 'ATLOB ERP HTTPS LAN'
$RuleHttp = 'ATLOB ERP HTTP LAN'

if (-not $ConfirmarFirewall -and -not $RemoverReglas) {
  Write-Host 'Modo solo inspección (no se modificó Windows Firewall).' -ForegroundColor Yellow
  Write-Host 'Comandos que se ejecutarán al confirmar con -ConfirmarFirewall en PowerShell como Administrador:' -ForegroundColor Cyan
  Write-Host "  Remove-NetFirewallRule -DisplayName `"$RuleHttp`" -ErrorAction SilentlyContinue"
  Write-Host "  New-NetFirewallRule -DisplayName `"$RuleHttps`" -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Profile Private -RemoteAddress LocalSubnet -Action Allow"
  Get-NetFirewallRule -DisplayName $RuleHttps, $RuleHttp -ErrorAction SilentlyContinue | Format-Table DisplayName, Enabled, Profile, Action
  exit 0
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  throw 'Ejecute PowerShell como Administrador para crear o eliminar reglas de Windows Firewall.'
}

if ($RemoverReglas) {
  Remove-NetFirewallRule -DisplayName $RuleHttps, $RuleHttp -ErrorAction SilentlyContinue
  Write-Host 'Reglas de Windows Firewall eliminadas.' -ForegroundColor Yellow
  exit 0
}

Remove-NetFirewallRule -DisplayName $RuleHttps, $RuleHttp -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $RuleHttps -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Profile Private -RemoteAddress LocalSubnet -Action Allow | Out-Null

Write-Host "✅ Regla creada en perfil Private (RemoteAddress LocalSubnet) únicamente para TCP $HttpsPort (HTTPS)." -ForegroundColor Green
Get-NetFirewallRule -DisplayName $RuleHttps | Format-Table DisplayName, Enabled, Profile, Action
