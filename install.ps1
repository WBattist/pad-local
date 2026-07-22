[CmdletBinding()]
param(
    [string]$Version = $env:PAD_VERSION,
    [switch]$Silent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
    throw "install.ps1 installs the Windows desktop app."
}

$repository = if ($env:PAD_REPOSITORY) { $env:PAD_REPOSITORY } else { "WBattist/pad-local" }
$releaseName = if ($Version) { "tags/" + $Version.TrimStart("v") } else { "latest" }
if ($Version) { $releaseName = "tags/v" + $Version.TrimStart("v") }
$releaseUrl = "https://api.github.com/repos/$repository/releases/$releaseName"
$headers = @{
    Accept = "application/vnd.github+json"
    "User-Agent" = "Pad-Local-Installer"
}

[Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ("pad-local-installer-" + [guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($temporaryRoot) | Out-Null

try {
    Write-Host "[pad] Finding the Pad Local Windows release..."
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers -UseBasicParsing
    $asset = @($release.assets | Where-Object { $_.name -match '^Pad-Local-Setup-.*-x64\.exe$' }) | Select-Object -First 1
    if (-not $asset) {
        throw "Release $($release.tag_name) does not contain a Windows x64 installer."
    }

    $installerPath = Join-Path $temporaryRoot $asset.name
    Write-Host "[pad] Downloading $($asset.name)..."
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $installerPath -UseBasicParsing

    $checksumAsset = @($release.assets | Where-Object { $_.name -eq ($asset.name + '.sha256') }) | Select-Object -First 1
    if ($checksumAsset) {
        $checksumPath = $installerPath + ".sha256"
        Invoke-WebRequest -Uri $checksumAsset.browser_download_url -Headers $headers -OutFile $checksumPath -UseBasicParsing
        $expected = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0]
        $actual = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
        if ($expected -ne $actual) { throw "The downloaded installer failed SHA-256 verification." }
        Write-Host "[pad] SHA-256 verified."
    }

    Write-Host "[pad] Starting the installer. No Docker, account, or server is required."
    $process = if ($Silent) {
        Start-Process -FilePath $installerPath -ArgumentList '/S' -Wait -PassThru
    } else {
        Start-Process -FilePath $installerPath -Wait -PassThru
    }
    if ($process.ExitCode -ne 0) { throw "Pad Local setup exited with code $($process.ExitCode)." }
    Write-Host "[pad] Pad Local is installed. Open it from the Start menu."
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) {
        $resolved = [IO.Path]::GetFullPath($temporaryRoot)
        $temporaryBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if ($resolved.StartsWith($temporaryBase, [StringComparison]::OrdinalIgnoreCase) -and $resolved -ne $temporaryBase) {
            Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
