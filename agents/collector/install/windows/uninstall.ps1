#Requires -RunAsAdministrator
$ErrorActionPreference='Stop'
$service=Get-Service 'devops_manager' -ErrorAction SilentlyContinue
if($service){
 if($service.Status -ne 'Stopped'){Stop-Service 'devops_manager'}
 & sc.exe delete devops_manager | Out-Host
}
Write-Host 'Service removed. Configuration and binary remain for manual cleanup.'
