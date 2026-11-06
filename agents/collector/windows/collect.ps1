# Windows ServerMap inventory collector (read only).
# Usage: set SERVERMAP_SERVER_ID and SERVERMAP_AGENT_TOKEN as environment variables,
# then run: powershell -NoProfile -File .\agents\collector\windows\collect.ps1
param([string]$ApiUrl = "http://127.0.0.1:3333")
$ErrorActionPreference = 'Stop'
$serverId = $env:SERVERMAP_SERVER_ID
$token = $env:SERVERMAP_AGENT_TOKEN
if ([string]::IsNullOrWhiteSpace($serverId) -or [string]::IsNullOrWhiteSpace($token)) {
    throw 'Set SERVERMAP_SERVER_ID and SERVERMAP_AGENT_TOKEN before collecting.'
}
$uri = [Uri]$ApiUrl
if ($uri.Scheme -ne 'https' -and -not ($uri.Scheme -eq 'http' -and $uri.Host -in @('127.0.0.1','localhost','::1'))) {
    throw 'Use HTTPS or an SSH tunnel to localhost. Plain HTTP to remote hosts is not permitted.'
}
$processNames = @{}
Get-Process | ForEach-Object { $processNames[[int]$_.Id] = $_.ProcessName }
$ports = New-Object 'System.Collections.Generic.List[object]'
Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $ports.Add(@{
        port = [int]$_.LocalPort
        protocol = 'tcp'
        bindAddress = [string]$_.LocalAddress
        pid = $pidValue
        processName = $(if ($processNames.ContainsKey($pidValue)) { [string]$processNames[$pidValue] } else { $null })
        state = 'LISTEN'
    })
}
Get-NetUDPEndpoint -ErrorAction Stop | ForEach-Object {
    $pidValue = [int]$_.OwningProcess
    $ports.Add(@{
        port = [int]$_.LocalPort
        protocol = 'udp'
        bindAddress = [string]$_.LocalAddress
        pid = $pidValue
        processName = $(if ($processNames.ContainsKey($pidValue)) { [string]$processNames[$pidValue] } else { $null })
        state = 'BOUND'
    })
}
$body = @{ serverId = $serverId; hostname = $env:COMPUTERNAME; ports = @($ports.ToArray()) } | ConvertTo-Json -Depth 6 -Compress
$response = Invoke-RestMethod -Uri ($ApiUrl.TrimEnd('/') + '/api/agents/report') -Method Post -ContentType 'application/json; charset=utf-8' -Headers @{ 'X-Agent-Token' = $token } -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 60
Write-Output ("Scan complete. Reported endpoints: " + $response.received)
