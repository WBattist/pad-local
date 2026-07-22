[CmdletBinding()]
param([switch]$KeepRunning)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\Common.ps1")

$startedHere = -not (Test-PadStackRunning)
try {
    Start-PadServices -Build
    $environment = Get-PadEnvironment
    $checks = @(
        "http://localhost:$($environment.APP_PORT)/api/app/health",
        "http://localhost:$($environment.APP_PORT)/",
        "http://localhost:$($environment.CODER_PORT)/api/v2/buildinfo",
        "http://localhost:$($environment.KEYCLOAK_PORT)/realms/$($environment.OIDC_REALM)/.well-known/openid-configuration"
    )
    foreach ($url in $checks) {
        Wait-PadUrl -Url $url -TimeoutSeconds 60 | Out-Null
        Write-PadMessage "PASS $url"
    }
    if (-not (Test-CoderApiToken -Token ([string](Get-PadEnvironment).CODER_API_KEY))) {
        throw "The generated Coder API token is not valid."
    }
    Write-PadMessage "Smoke test passed. Browser authentication and workspace interaction require the browser test checklist in tests/integration/README.md."
} finally {
    if ($startedHere -and -not $KeepRunning) {
        Stop-PadServices
        Write-PadMessage "Smoke-test services stopped without removing volumes."
    }
}
