BeforeAll {
    $script:RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
    $script:CommonPath = Join-Path $script:RepositoryRoot "scripts\lib\Common.ps1"
}

Describe "PowerShell source" {
    It "parses every shipped PowerShell file" {
        $files = Get-ChildItem -Path $script:RepositoryRoot -Filter *.ps1 -Recurse -File
        foreach ($file in $files) {
            $tokens = $null
            $errors = $null
            [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
            $errors | Should -BeNullOrEmpty -Because $file.FullName
        }
    }
}

Describe "Generated configuration" {
    BeforeEach {
        $script:TempRoot = Join-Path ([IO.Path]::GetTempPath()) ("pad-local-test-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path (Join-Path $script:TempRoot "config\keycloak") -Force | Out-Null
        Copy-Item (Join-Path $script:RepositoryRoot "config\defaults.env") (Join-Path $script:TempRoot "config\defaults.env")
        Copy-Item (Join-Path $script:RepositoryRoot "config\keycloak\realm-template.json") (Join-Path $script:TempRoot "config\keycloak\realm-template.json")
        $env:PAD_INSTALL_ROOT = $script:TempRoot
        . $script:CommonPath
    }
    AfterEach {
        Remove-Item Env:PAD_INSTALL_ROOT -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $script:TempRoot -Recurse -Force
    }

    It "generates required secrets and a resolved realm" {
        $values = Initialize-PadConfiguration
        foreach ($name in @("POSTGRES_PASSWORD", "REDIS_PASSWORD", "OIDC_CLIENT_SECRET", "PAD_SESSION_SECRET", "CODER_BOOTSTRAP_PASSWORD")) {
            $values[$name].Length | Should -BeGreaterThan 30
        }
        $realm = Get-Content -Raw (Join-Path $script:TempRoot "config\runtime\keycloak-realm.json")
        $realm | Should -Not -Match "__[A-Z_]+__"
        { $realm | ConvertFrom-Json } | Should -Not -Throw
    }

    It "is idempotent and preserves generated credentials" {
        $first = Initialize-PadConfiguration
        $firstPassword = $first.POSTGRES_PASSWORD
        $second = Initialize-PadConfiguration
        $second.POSTGRES_PASSWORD | Should -Be $firstPassword
    }
}

Describe "Compose architecture" {
    BeforeAll { $script:Compose = Get-Content -Raw (Join-Path $script:RepositoryRoot "docker-compose.yml") }
    It "does not use host networking or a Docker group ID" {
        $script:Compose | Should -Not -Match "network_mode:\s*host"
        $script:Compose | Should -Not -Match "DOCKER_GROUP_ID|group_add"
    }
    It "binds browser-facing ports to loopback" {
        $script:Compose | Should -Match '127\.0\.0\.1:\$\{APP_PORT\}:8000'
        $script:Compose | Should -Match '127\.0\.0\.1:\$\{CODER_PORT\}:7080'
        $script:Compose | Should -Match '127\.0\.0\.1:\$\{KEYCLOAK_PORT\}:8080'
    }
    It "never removes volumes during normal CLI shutdown" {
        $cli = Get-Content -Raw (Join-Path $script:RepositoryRoot "scripts\pad.ps1")
        $common = Get-Content -Raw $script:CommonPath
        $common | Should -Match "Invoke-PadCompose stop"
        $cli | Should -Not -Match 'finally[\s\S]{0,500}down\s+--volumes'
    }

    It "repairs database initialization after an interrupted first run" {
        $script:Compose | Should -Match 'postgres-init:'
        $script:Compose | Should -Match 'condition: service_completed_successfully'
        $script:Compose | Should -Not -Match 'docker-entrypoint-initdb\.d/10-pad-local-databases\.sh'
    }

    It "passes Compose detach flags through PowerShell parameter binding" {
        $common = Get-Content -Raw $script:CommonPath
        $doctor = Get-Content -Raw (Join-Path $script:RepositoryRoot "scripts\doctor.ps1")
        $common | Should -Match 'Invoke-PadCompose up --detach'
        $common | Should -Not -Match 'Invoke-PadCompose up -d'
        $doctor | Should -Not -Match 'Invoke-PadCompose.* -d '
    }
}

Describe "Installer contract" {
    BeforeAll { $script:Installer = Get-Content -Raw (Join-Path $script:RepositoryRoot "install.ps1") }
    It "uses strict error handling and supports archive download without Git" {
        $script:Installer | Should -Match 'Set-StrictMode -Version Latest'
        $script:Installer | Should -Match '\$ErrorActionPreference = "Stop"'
        $script:Installer | Should -Match 'Invoke-WebRequest'
        $script:Installer | Should -Match 'Expand-Archive'
    }
    It "defaults to the requested fork" {
        $script:Installer | Should -Match 'WBattist/pad-local'
    }

    It "does not require RuntimeInformation OSArchitecture on Windows PowerShell 5.1" {
        $script:Installer | Should -Not -Match 'RuntimeInformation\]::OSArchitecture'
        $script:Installer | Should -Match 'PROCESSOR_ARCHITECTURE'
    }
}

Describe "Docker prerequisite probes" {
    BeforeAll { $script:Common = Get-Content -Raw $script:CommonPath }

    It "suppresses Windows PowerShell native stderr while checking Docker" {
        $script:Common | Should -Match 'function Invoke-DockerProbe'
        $script:Common | Should -Match '\$ErrorActionPreference = "SilentlyContinue"'
        $script:Common | Should -Not -Match '& docker info --format "\{\{\.OSType\}\}" \*> \$null'
    }

    It "detects Docker Desktop's per-user installation" {
        $script:Common | Should -Match 'Programs\\DockerDesktop\\Docker Desktop\.exe'
        $script:Common | Should -Match 'Programs\\DockerDesktop\\resources\\bin'
    }
}

Describe "Cross-platform line endings" {
    It "forces shell scripts to remain LF when cloned on Windows" {
        $attributes = Get-Content -Raw (Join-Path $script:RepositoryRoot ".gitattributes")
        $attributes | Should -Match '\*\.sh text eol=lf'

        foreach ($file in Get-ChildItem -Path $script:RepositoryRoot -Filter *.sh -Recurse -File) {
            if ($file.FullName -match '[\\/]node_modules[\\/]') { continue }
            [IO.File]::ReadAllText($file.FullName) | Should -Not -Match "`r`n" -Because $file.FullName
        }
    }
}
