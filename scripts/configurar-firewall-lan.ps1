param(
  [switch]$ConfirmarFirewall,
  [switch]$RemoverReglas,
  [int]$HttpsPort = 3443,
  [int]$HttpPort = 3000
)

$ErrorActionPreference = 'Stop'
$RuleHttps = 'ATLOB ERP HTTPS LAN'
$RuleHttp = 'ATLOB ERP HTTP LAN'

if (-not $ConfirmarFirewall -and -not $RemoverReglas) {
  Write-Host 'Modo solo inspección (no se modificó Windows Firewall).' -ForegroundColor Yellow
  Write-Host 'Comandos que se ejecutarán al confirmar con -ConfirmarFirewall en PowerShell como Administrador:' -ForegroundColor Cyan
  Write-Host "  New-NetFirewallRule -DisplayName `"$RuleHttps`" -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Profile Private -Action Allow"
  Write-Host "  New-NetFirewallRule -DisplayName `"$RuleHttp`" -Direction Inbound -Protocol TCP -LocalPort $HttpPort -Profile Private -Action Allow"
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
New-NetFirewallRule -DisplayName $RuleHttps -Direction Inbound -Protocol TCP -LocalPort $HttpsPort -Profile Private -Action Allow | Out-Null
New-NetFirewallRule -DisplayName $RuleHttp -Direction Inbound -Protocol TCP -LocalPort $HttpPort -Profile Private -Action Allow | Out-Null

Write-Host "✅ Reglas creadas en perfil Private para puertos TCP $HttpsPort (HTTPS) y $HttpPort (HTTP)." -ForegroundColor Green
Get-NetFirewallRule -DisplayName $RuleHttps, $RuleHttp | Format-Table DisplayName, Enabled, Profile, Action
