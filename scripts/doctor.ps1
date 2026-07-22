[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\Common.ps1")

$failures = 0
function Write-Check {
    param([string]$Name, [ValidateSet("PASS", "WARN", "FAIL")][string]$State, [string]$Detail)
    if ($State -eq "FAIL") { $script:failures++ }
    Write-Host ("[{0,-4}] {1}: {2}" -f $State, $Name, $Detail)
}

$paths = Get-PadPaths
try {
    $environment = Initialize-PadConfiguration
    Write-Check "Configuration" "PASS" $paths.RuntimeEnv
} catch {
    Write-Check "Configuration" "FAIL" $_.Exception.Message
    $environment = Get-PadEnvironment
}

if ($env:OS -eq "Windows_NT") {
    $version = [Environment]::OSVersion.Version
    Write-Check "Windows" $(if ($version.Major -ge 10) { "PASS" } else { "FAIL" }) "$version"
    $desktop = Find-DockerDesktop
    Write-Check "Docker Desktop" $(if ($desktop) { "PASS" } else { "FAIL" }) $(if ($desktop) { $desktop } else { "Install Docker Desktop with WSL2 support." })
    if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
        try {
            $wslStatus = (& wsl.exe --status 2>&1) -join " "
            Write-Check "WSL2" "PASS" $wslStatus.Trim()
        } catch { Write-Check "WSL2" "WARN" "Run 'wsl --install' from an elevated terminal if Docker Desktop reports a WSL error." }
    } else { Write-Check "WSL2" "WARN" "wsl.exe was not found; install WSL2 for the recommended Docker Desktop backend." }
} else {
    Write-Check "Platform" "WARN" "Linux is supported secondarily; Windows 10/11 is the primary platform."
}

Write-Check "PowerShell" $(if ($PSVersionTable.PSVersion.Major -ge 5) { "PASS" } else { "FAIL" }) $PSVersionTable.PSVersion.ToString()
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($paths.Root).TrimEnd(':', '\')) -ErrorAction SilentlyContinue
if ($drive) {
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    Write-Check "Disk space" $(if ($freeGb -ge 10) { "PASS" } elseif ($freeGb -ge 4) { "WARN" } else { "FAIL" }) "$freeGb GB free; at least 10 GB is recommended."
}

$dockerAvailable = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Check "Docker CLI" "PASS" (Get-Command docker).Source
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) {
        $dockerAvailable = $true
        $osType = (& docker info --format "{{.OSType}}").Trim()
        Write-Check "Docker daemon" "PASS" "reachable"
        Write-Check "Linux containers" $(if ($osType -eq "linux") { "PASS" } else { "FAIL" }) $osType
        & docker compose version *> $null
        Write-Check "Docker Compose" $(if ($LASTEXITCODE -eq 0) { "PASS" } else { "FAIL" }) $(if ($LASTEXITCODE -eq 0) { (& docker compose version --short) } else { "Update Docker Desktop." })
    } else {
        Write-Check "Docker daemon" "FAIL" "Start Docker Desktop and wait for the engine to become ready."
    }
} else {
    Write-Check "Docker CLI" "FAIL" "Install Docker Desktop or add its resources\bin directory to PATH."
}

if (-not (Test-Path -LiteralPath $paths.Root)) { Write-Check "File access" "FAIL" "Installation directory is missing." }
else {
    try {
        $probe = Join-Path $paths.State ("write-test-" + [guid]::NewGuid().ToString("N"))
        [IO.File]::WriteAllText($probe, "ok")
        Remove-Item -LiteralPath $probe -Force
        Write-Check "File access" "PASS" $paths.Root
    } catch { Write-Check "File access" "FAIL" $_.Exception.Message }
}

if (-not (Test-PadStackRunning)) {
    foreach ($name in @("APP_PORT", "CODER_PORT", "KEYCLOAK_PORT")) {
        $portResult = Test-PadPortAvailable -Port ([int]$environment[$name])
        Write-Check "Port $($environment[$name])" $(if ($portResult.Available) { "PASS" } else { "FAIL" }) $(if ($portResult.Available) { "available" } else { "occupied by $($portResult.Owner)" })
    }
}

if ($dockerAvailable -and (Test-PadStackRunning)) {
    try { Invoke-PadCompose ps; Write-Check "Containers" "PASS" "Compose project pad-local is running." } catch { Write-Check "Containers" "FAIL" $_.Exception.Message }
    try { Invoke-PadCompose exec -T postgres pg_isready -U ([string]$environment.POSTGRES_USER) --dbname ([string]$environment.POSTGRES_DB) | Out-Null; Write-Check "PostgreSQL" "PASS" "accepting connections" } catch { Write-Check "PostgreSQL" "FAIL" $_.Exception.Message }
    try { Invoke-PadCompose exec -T redis redis-cli -a ([string]$environment.REDIS_PASSWORD) ping | Out-Null; Write-Check "Redis" "PASS" "PONG" } catch { Write-Check "Redis" "FAIL" $_.Exception.Message }
    foreach ($endpoint in @(
        @{ Name = "Keycloak OIDC"; Url = "http://localhost:$($environment.KEYCLOAK_PORT)/realms/$($environment.OIDC_REALM)/.well-known/openid-configuration" },
        @{ Name = "Coder API"; Url = "http://localhost:$($environment.CODER_PORT)/api/v2/buildinfo" },
        @{ Name = "Pad backend"; Url = "http://localhost:$($environment.APP_PORT)/api/app/health" },
        @{ Name = "Pad website"; Url = "http://localhost:$($environment.APP_PORT)/" }
    )) {
        try { Invoke-WebRequest -Uri $endpoint.Url -UseBasicParsing -TimeoutSec 8 | Out-Null; Write-Check $endpoint.Name "PASS" $endpoint.Url }
        catch { Write-Check $endpoint.Name "FAIL" "$($endpoint.Url) - $($_.Exception.Message)" }
    }
} elseif ($dockerAvailable) {
    Write-Check "Service health" "WARN" "Pad is stopped. Run 'pad start', then 'pad doctor' for live dependency checks."
}

if ($failures -gt 0) {
    Write-Host ""
    Write-Host "$failures required check(s) failed. Correct the FAIL items above and retry."
    exit 1
}
Write-Host ""
Write-Host "Pad Local doctor found no blocking problems."
