#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory=$true)][string]$Binary,
  [Parameter(Mandatory=$true)][string]$Config
)
$ErrorActionPreference='Stop'
$binaryPath=(Resolve-Path -LiteralPath $Binary).Path
$configPath=(Resolve-Path -LiteralPath $Config).Path
$targetDir=Join-Path $env:ProgramFiles 'DevOpsManager'
$configDir=Join-Path $env:ProgramData 'DevOpsManager'
New-Item -ItemType Directory -Force -Path $targetDir,$configDir | Out-Null
$existing=Get-Service -Name 'devops_manager' -ErrorAction SilentlyContinue
if($existing){ Stop-Service -Name 'devops_manager' -ErrorAction Stop }
Copy-Item -LiteralPath $binaryPath -Destination (Join-Path $targetDir 'devops_manager.exe') -Force
Copy-Item -LiteralPath $configPath -Destination (Join-Path $configDir 'config.json') -Force
& icacls.exe $configDir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not restrict configuration directory ACL'}
$exe=Join-Path $targetDir 'devops_manager.exe'
$cfg=Join-Path $configDir 'config.json'
$arguments='"' + $exe + '" --config "' + $cfg + '"'
if(-not $existing){
 & sc.exe create devops_manager binPath= $arguments start= auto DisplayName= 'DevOps Manager (ServerMap)' | Out-Host
 if($LASTEXITCODE -ne 0){throw 'Service creation failed'}
}else{
 & sc.exe config devops_manager binPath= $arguments start= auto | Out-Host
 if($LASTEXITCODE -ne 0){throw 'Service update failed'}
}
& sc.exe description devops_manager 'Lightweight ServerMap TCP/UDP port inventory collector' | Out-Null
& sc.exe failure devops_manager reset= 86400 actions= restart/10000/restart/30000/restart/60000 | Out-Null
Start-Service devops_manager
Get-Service devops_manager
