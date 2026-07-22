param(
    [Parameter(Mandatory)][int]$ParentProcessId,
    [Parameter(Mandatory)][string]$SessionId,
    [Parameter(Mandatory)][string]$InstallRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"
$env:PAD_INSTALL_ROOT = $InstallRoot
. (Join-Path $PSScriptRoot "lib\Common.ps1")

while (Get-Process -Id $ParentProcessId -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 3
}

$paths = Get-PadPaths
if (Test-Path -LiteralPath $paths.Session) {
    try {
        $session = [IO.File]::ReadAllText($paths.Session) | ConvertFrom-Json
        if ($session.sessionId -eq $SessionId -and $session.ownsStack) {
            Assert-PadDocker
            Invoke-PadCompose stop | Out-Null
            Remove-Item -LiteralPath $paths.Session -Force
        }
    } catch { }
}
