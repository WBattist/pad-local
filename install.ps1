[CmdletBinding()]
param([switch]$InstallOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Repository = if ($env:PAD_REPOSITORY) {
    $env:PAD_REPOSITORY
} else {
    "WBattist/pad-local"
}

$Branch = if ($env:PAD_BRANCH) {
    $env:PAD_BRANCH
} else {
    "main"
}

if ($env:OS -ne "Windows_NT") {
    throw "install.ps1 is the Windows installer. On Linux, run install.sh instead."
}

$windows = [Environment]::OSVersion.Version
$architecture = [Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITEW6432", "Process")
if (-not $architecture) {
    $architecture = [Environment]::GetEnvironmentVariable("PROCESSOR_ARCHITECTURE", "Process")
}
if (-not $architecture) {
    try {
        $architecture = (Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop).OSArchitecture
    } catch {
        $architecture = "unknown"
    }
}
$powerShellVersion = $PSVersionTable.PSVersion.ToString()
$localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$installRoot = Join-Path $localAppData "PadLocal"
$binDirectory = Join-Path $localAppData "Programs\PadLocal\bin"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("pad-local-install-" + [guid]::NewGuid().ToString("N"))
$sourceRoot = $null

function Copy-PadItem {
    param(
        [Parameter(Mandatory)][string]$Source,
        [Parameter(Mandatory)][string]$Destination
    )
    $sourceItem = Get-Item -LiteralPath $Source -Force
    if ($sourceItem.PSIsContainer) {
        [IO.Directory]::CreateDirectory($Destination) | Out-Null
        foreach ($child in Get-ChildItem -LiteralPath $Source -Force) {
            Copy-PadItem -Source $child.FullName -Destination (Join-Path $Destination $child.Name)
        }
    } else {
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
    }
}

Write-Host "[pad] Windows $windows ($architecture), PowerShell $powerShellVersion"
if ($windows.Major -lt 10) { throw "Pad Local requires Windows 10 or Windows 11." }
if ($PSVersionTable.PSVersion.Major -lt 5) { throw "PowerShell 5.1 or PowerShell 7 is required." }

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
[IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null

try {
    $localSource = [Environment]::GetEnvironmentVariable("PAD_SOURCE_PATH", "Process")
    if ($localSource) {
        $sourceRoot = [IO.Path]::GetFullPath($localSource)
        Write-Host "[pad] Installing from local source $sourceRoot"
    } elseif (Get-Command git.exe -ErrorAction SilentlyContinue) {
        $sourceRoot = Join-Path $temporaryRoot "repository"
        Write-Host "[pad] Downloading $Repository ($Branch) with Git..."
        & git.exe clone --depth 1 --branch $Branch "https://github.com/$Repository.git" $sourceRoot
        if ($LASTEXITCODE -ne 0) { throw "Git could not download $Repository branch $Branch." }
    } else {
        $archive = Join-Path $temporaryRoot "repository.zip"
        $expanded = Join-Path $temporaryRoot "expanded"
        $archiveUrl = "https://github.com/$Repository/archive/refs/heads/$Branch.zip"
        Write-Host "[pad] Git is not installed; downloading $archiveUrl ..."
        Invoke-WebRequest -Uri $archiveUrl -OutFile $archive -UseBasicParsing
        Expand-Archive -LiteralPath $archive -DestinationPath $expanded -Force
        $sourceRoot = (Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1).FullName
    }

    foreach ($required in @("docker-compose.yml", "scripts\pad.ps1", "scripts\lib\Common.ps1", "config\defaults.env")) {
        if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $required))) {
            throw "Downloaded repository is incomplete; missing $required."
        }
    }

    $configBackup = Join-Path $temporaryRoot "configuration-backup"
    $existingConfig = Join-Path $installRoot "config"
    if (Test-Path -LiteralPath $existingConfig) {
        [IO.Directory]::CreateDirectory($configBackup) | Out-Null
        foreach ($generatedName in @("runtime.env", "runtime")) {
            $generatedPath = Join-Path $existingConfig $generatedName
            if (Test-Path -LiteralPath $generatedPath) {
                Copy-Item -LiteralPath $generatedPath -Destination (Join-Path $configBackup $generatedName) -Recurse -Force
            }
        }
    }

    [IO.Directory]::CreateDirectory($installRoot) | Out-Null
    Write-Host "[pad] Installing application files into $installRoot ..."
    foreach ($item in Get-ChildItem -LiteralPath $sourceRoot -Force) {
        if ($item.Name -eq ".git") { continue }
        Copy-PadItem -Source $item.FullName -Destination (Join-Path $installRoot $item.Name)
    }
    if (Test-Path -LiteralPath $configBackup) {
        foreach ($generated in Get-ChildItem -LiteralPath $configBackup -Force) {
            Copy-PadItem -Source $generated.FullName -Destination (Join-Path $existingConfig $generated.Name)
        }
    }

    $env:PAD_INSTALL_ROOT = $installRoot
    . (Join-Path $installRoot "scripts\lib\Common.ps1")
    Assert-PadDocker -StartIfNeeded
    $configuration = Initialize-PadConfiguration

    [IO.Directory]::CreateDirectory($binDirectory) | Out-Null
    $padScript = Join-Path $installRoot "scripts\pad.ps1"
    $wrapper = @"
@echo off
setlocal
where pwsh.exe >nul 2>nul
if %errorlevel% equ 0 (
  pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$padScript" %*
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "$padScript" %*
)
exit /b %errorlevel%
"@
    [IO.File]::WriteAllText((Join-Path $binDirectory "pad.cmd"), $wrapper, [Text.ASCIIEncoding]::new())
    Remove-Item -LiteralPath (Join-Path $binDirectory "pad.ps1") -Force -ErrorAction SilentlyContinue

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathEntries = @($userPath -split ";" | Where-Object { $_ })
    $normalizedBin = [IO.Path]::GetFullPath($binDirectory).TrimEnd('\')
    $hasBin = $false
    foreach ($entry in $pathEntries) {
        try { if ([IO.Path]::GetFullPath($entry).TrimEnd('\') -eq $normalizedBin) { $hasBin = $true } } catch { }
    }
    if (-not $hasBin) {
        $newUserPath = (@($pathEntries) + $binDirectory) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
    }
    if (($env:Path -split ";") -notcontains $binDirectory) { $env:Path = "$binDirectory;$($env:Path)" }

    if (-not $InstallOnly) {
        Write-Host "[pad] Running bootstrap and health validation. The first build can take several minutes..."
        try {
            Start-PadServices -Build
            Write-Host "[pad] All required services passed their health checks."
        } finally {
            if (Test-PadStackRunning) { Stop-PadServices }
        }
    }

    Write-Host ""
    Write-Host "Pad Local is installed."
    Write-Host "Initial Pad sign-in username: $($configuration.PAD_BOOTSTRAP_USER)"
    Write-Host "Run 'pad credentials' to display the generated local password."
    Write-Host ""
    Write-Host "Next command:"
    Write-Host "  pad"
    Write-Host ""
    Write-Host "If this terminal cannot find 'pad', open a new PowerShell or Windows Terminal tab."
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolvedTemporary = [IO.Path]::GetFullPath($temporaryRoot)
        $systemTemporary = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if ($resolvedTemporary.StartsWith($systemTemporary, [StringComparison]::OrdinalIgnoreCase) -and $resolvedTemporary -ne $systemTemporary) {
            Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
