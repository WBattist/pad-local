[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Command = "attached",
    [Parameter(Position = 1)][string]$Argument1,
    [Parameter(Position = 2)][string]$Argument2,
    [Parameter(Position = 3)][string]$Argument3,
    [switch]$Yes,
    [switch]$Purge
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib\Common.ps1")

function Get-LiveAttachedSession {
    $paths = Get-PadPaths
    if (-not (Test-Path -LiteralPath $paths.Session)) { return $null }
    try {
        $session = [IO.File]::ReadAllText($paths.Session) | ConvertFrom-Json
        if (Get-Process -Id ([int]$session.processId) -ErrorAction SilentlyContinue) { return $session }
    } catch { }
    Remove-Item -LiteralPath $paths.Session -Force -ErrorAction SilentlyContinue
    return $null
}

function Remove-OwnSessionLock {
    param([string]$SessionId)
    $paths = Get-PadPaths
    if (-not (Test-Path -LiteralPath $paths.Session)) { return }
    try {
        $current = [IO.File]::ReadAllText($paths.Session) | ConvertFrom-Json
        if ($current.sessionId -eq $SessionId) { Remove-Item -LiteralPath $paths.Session -Force }
    } catch { }
}

function Start-AttachedPad {
    Assert-PadDocker -StartIfNeeded
    Initialize-PadConfiguration | Out-Null
    $existing = Get-LiveAttachedSession
    if ($existing) { throw "Another attached Pad session is active in PID $($existing.processId)." }

    $wasRunning = Test-PadStackRunning
    $sessionId = [guid]::NewGuid().ToString()
    $paths = Get-PadPaths
    $session = [ordered]@{
        processId = $PID
        sessionId = $sessionId
        startedAt = [DateTime]::UtcNow.ToString("o")
        mode = "attached"
        composeProject = "pad-local"
        installationPath = $paths.Root
        ownsStack = -not $wasRunning
    }
    [IO.File]::WriteAllText($paths.Session, ($session | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

    $watcher = $null
    $cancelHandler = $null
    $exitEvent = $null
    $script:PadCancellationRequested = $false
    try {
        if (-not $wasRunning) {
            $shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { (Get-Command pwsh).Source } else { (Get-Command powershell.exe).Source }
            $watchArguments = @(
                "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
                (Join-Path $PSScriptRoot "session-watch.ps1"),
                "-ParentProcessId", [string]$PID, "-SessionId", $sessionId, "-InstallRoot", $paths.Root
            )
            $startParameters = @{ FilePath = $shell; ArgumentList = $watchArguments; PassThru = $true }
            if ($env:OS -eq "Windows_NT") { $startParameters.WindowStyle = "Hidden" }
            $watcher = Start-Process @startParameters
        }

        if (-not $wasRunning) { Start-PadServices }
        else { Write-PadMessage "Pad is already running in detached mode; this session will not stop it." }

        $url = Open-PadBrowser
        Write-Host ""
        Write-PadMessage "Pad is ready at $url"
        Write-PadMessage "Keep this terminal open. Press Ctrl+C to stop this attached session."

        $cancelHandler = [ConsoleCancelEventHandler]{
            param($sender, $eventArgs)
            $eventArgs.Cancel = $true
            $script:PadCancellationRequested = $true
        }
        [Console]::add_CancelKeyPress($cancelHandler)
        $exitEvent = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
            $script:PadCancellationRequested = $true
        }

        while (-not $script:PadCancellationRequested) {
            Start-Sleep -Seconds 2
            if (-not (Test-PadStackRunning)) {
                Write-Warning "The Pad stack stopped unexpectedly. Run 'pad logs' to inspect it."
                break
            }
        }
    } finally {
        if ($cancelHandler) { [Console]::remove_CancelKeyPress($cancelHandler) }
        if ($exitEvent) { Unregister-Event -SourceIdentifier PowerShell.Exiting -ErrorAction SilentlyContinue }
        Write-Host ""
        Write-PadMessage "Stopping this Pad session..."
        if (-not $wasRunning) {
            try { Stop-PadServices } catch { Write-Warning $_.Exception.Message }
        }
        Remove-OwnSessionLock -SessionId $sessionId
        if ($watcher -and -not $watcher.HasExited) { Stop-Process -Id $watcher.Id -Force -ErrorAction SilentlyContinue }
        Write-PadMessage "Data and workspaces have been preserved."
    }
}

function Show-PadStatus {
    $paths = Get-PadPaths
    $environment = Get-PadEnvironment
    $dockerState = "unavailable"
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        & docker info *> $null
        $dockerState = if ($LASTEXITCODE -eq 0) { "running (Linux containers)" } else { "installed, daemon unavailable" }
    }
    $session = Get-LiveAttachedSession
    Write-Host "Docker Desktop : $dockerState"
    Write-Host "Installation   : $($paths.Root)"
    Write-Host "Mode           : $(if ($session) { 'attached (PID ' + $session.processId + ')' } elseif (Test-PadStackRunning) { 'detached' } else { 'stopped' })"
    Write-Host "Pad            : http://localhost:$($environment.APP_PORT)"
    Write-Host "Coder          : http://localhost:$($environment.CODER_PORT)"
    Write-Host "Keycloak       : http://localhost:$($environment.KEYCLOAK_PORT)"
    Write-Host "Bootstrap      : $(if (Test-Path -LiteralPath $paths.Bootstrap) { 'complete' } else { 'not complete' })"
    if ($dockerState -like "running*") {
        Invoke-PadCompose ps
    }
}

function Reset-PadData {
    param([bool]$Confirmed, [bool]$Reinitialize = $true)
    if (-not $Confirmed) {
        $answer = Read-Host "This deletes ALL Pad databases, users, canvases, workspaces, and Docker volumes. Type DELETE to continue"
        if ($answer -cne "DELETE") { Write-PadMessage "Reset cancelled."; return }
    }
    Assert-PadDocker -StartIfNeeded
    Write-PadMessage "Deleting Pad Local containers and persistent volumes..."
    $workspaceContainers = @(& docker ps -aq --filter "label=pad.local=true")
    if ($workspaceContainers.Count -gt 0 -and $workspaceContainers[0]) { & docker rm -f @workspaceContainers | Out-Null }
    $workspaceVolumes = @(& docker volume ls -q --filter "label=pad.local=true")
    if ($workspaceVolumes.Count -gt 0 -and $workspaceVolumes[0]) { & docker volume rm @workspaceVolumes | Out-Null }
    Invoke-PadCompose down --volumes --remove-orphans | Out-Null
    $paths = Get-PadPaths
    Remove-Item -LiteralPath $paths.RuntimeEnv, $paths.Bootstrap, $paths.Session -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $paths.Runtime -Recurse -Force -ErrorAction SilentlyContinue
    if ($Reinitialize) {
        Initialize-PadConfiguration | Out-Null
        Write-PadMessage "All local Pad data was deleted. New credentials will be used on next start."
    }
}

function Uninstall-Pad {
    param([bool]$PurgeData)
    $paths = Get-PadPaths
    if ($PurgeData) { Reset-PadData -Confirmed $true -Reinitialize $false }
    elseif (Test-PadStackRunning) { Stop-PadServices }
    $bin = Join-Path $env:LOCALAPPDATA "Programs\PadLocal\bin"
    Remove-Item -LiteralPath (Join-Path $bin "pad.cmd"), (Join-Path $bin "pad.ps1") -Force -ErrorAction SilentlyContinue
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath) {
        $newPath = (($userPath -split ";" | Where-Object { $_ -and ([IO.Path]::GetFullPath($_).TrimEnd('\') -ne [IO.Path]::GetFullPath($bin).TrimEnd('\')) }) -join ";")
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    }
    $expectedRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA "PadLocal")).TrimEnd('\')
    $actualRoot = [IO.Path]::GetFullPath($paths.Root).TrimEnd('\')
    if ($actualRoot -eq $expectedRoot) {
        if ($PurgeData) {
            Remove-Item -LiteralPath $actualRoot -Recurse -Force -ErrorAction SilentlyContinue
        } else {
            foreach ($item in Get-ChildItem -LiteralPath $actualRoot -Force) {
                if ($item.Name -notin @("config", "state", "logs")) {
                    Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
                }
            }
        }
    } else {
        Write-Warning "Application files were not removed because this is a development checkout, not $expectedRoot."
    }
    if ($PurgeData) {
        Write-PadMessage "Pad Local was uninstalled and its local data was purged."
    } else {
        Write-PadMessage "Pad Local application launchers were removed. Docker volumes and $($paths.Config) were preserved."
    }
}

try {
    switch ($Command.ToLowerInvariant()) {
        { $_ -in @("attached", "run") } { Start-AttachedPad; break }
        "start" {
            Start-PadServices
            Open-PadBrowser | Out-Null
            Write-PadMessage "Pad is running in detached mode. Use 'pad stop' when finished."
            break
        }
        "stop" { Stop-PadServices; Write-PadMessage "Pad stopped. Data and workspaces were preserved."; break }
        "restart" { Stop-PadServices; Start-PadServices; Open-PadBrowser | Out-Null; break }
        "status" { Initialize-PadConfiguration | Out-Null; Show-PadStatus; break }
        "open" { Initialize-PadConfiguration | Out-Null; $url = Open-PadBrowser; Write-PadMessage "Opened $url"; break }
        "logs" {
            Assert-PadDocker
            $validServices = @("app", "frontend", "coder", "keycloak", "postgres", "redis", "docker-proxy")
            if ($Argument1 -and $Argument1 -notin $validServices) { throw "Unknown service '$Argument1'. Valid services: $($validServices -join ', ')." }
            if ($Argument1) { Invoke-PadCompose logs --follow $Argument1 } else { Invoke-PadCompose logs --follow }
            break
        }
        "doctor" { & (Join-Path $PSScriptRoot "doctor.ps1"); break }
        "update" {
            $wasRunning = Test-PadStackRunning
            if ($wasRunning) { Stop-PadServices }
            & (Join-Path (Get-PadInstallRoot) "install.ps1") -InstallOnly
            if ($wasRunning) { Start-PadServices -Build }
            break
        }
        "reset" { Reset-PadData -Confirmed ($Yes -or $Argument1 -eq "--yes"); break }
        "uninstall" { Uninstall-Pad -PurgeData ($Purge -or $Argument1 -eq "--purge"); break }
        "config" {
            if ($Argument1 -ne "set" -or -not $Argument2) { throw "Usage: pad config set <app.port|coder.port|keycloak.port> <port>" }
            if (-not $Argument3) { throw "A port value is required." }
            $mapping = @{ "app.port" = "APP_PORT"; "coder.port" = "CODER_PORT"; "keycloak.port" = "KEYCLOAK_PORT" }
            if (-not $mapping.ContainsKey($Argument2)) { throw "Unknown setting '$Argument2'." }
            $port = 0
            if (-not [int]::TryParse($Argument3, [ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw "Port must be between 1 and 65535." }
            Initialize-PadConfiguration | Out-Null
            Set-PadEnvValue -Path (Get-PadPaths).RuntimeEnv -Name $mapping[$Argument2] -Value ([string]$port)
            Initialize-PadConfiguration | Out-Null
            Write-PadMessage "Set $Argument2 to $port. Restart Pad to apply it."
            break
        }
        "credentials" {
            $environment = Initialize-PadConfiguration
            Write-Host "Username: $($environment.PAD_BOOTSTRAP_USER)"
            Write-Host "Password: $($environment.PAD_BOOTSTRAP_PASSWORD)"
            break
        }
        default { throw "Unknown command '$Command'. Try: pad, start, stop, restart, status, logs, doctor, update, reset, uninstall, open, config, credentials." }
    }
} catch {
    Write-Error "[pad] $($_.Exception.Message)"
    exit 1
}
