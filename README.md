# Pad Local — a whiteboard IDE on your Windows PC

Pad Local keeps [Pad](https://pad.ws) as a browser-based website while running its complete
stack locally through Docker Desktop. It combines an Excalidraw canvas with persistent browser
terminals, code-server/VS Code access, and Coder-managed development workspaces.

## Install on Windows

```powershell
irm https://raw.githubusercontent.com/WBattist/pad-local/main/install.ps1 | iex
pad
```

The `pad` command starts the local services and opens Pad as a website at
http://localhost:8000. Keep the terminal open while using Pad. Press Ctrl+C
to stop the local session. Your projects and data will remain saved.

The equivalent long-form installation command is:

```powershell
Invoke-RestMethod https://raw.githubusercontent.com/WBattist/pad-local/main/install.ps1 | Invoke-Expression
```

The installer downloads the repository itself, so Git is optional. It generates credentials,
imports Keycloak configuration, creates the Coder administrator and API token, discovers the
organization, uploads the workspace template, builds Pad, verifies every service, and stops the
test stack without deleting volumes. Re-running the installer repairs or updates application
files without replacing generated configuration or persistent data.

## Requirements

- Windows 11 or Windows 10, x64 or ARM64 where every selected container image supports it.
- Docker Desktop using its WSL2-backed Linux container engine.
- PowerShell 7 or Windows PowerShell 5.1.
- At least 4 GB free memory and 10 GB free disk space; active workspaces may need more.
- Permission for Docker Desktop to use the drive containing `%LOCALAPPDATA%`.

Administrator privileges are not required for normal installation or use. If Docker Desktop is
installed but stopped, Pad starts it and waits for the daemon. If it is missing, Pad asks you to
install Docker Desktop with WSL2 rather than installing large system software silently.

## Normal use

Run `pad` with no arguments for the default attached session. It starts and bootstraps the stack,
opens the browser, and remains attached to the terminal. Ctrl+C or normal terminal exit stops the
Compose services owned by that session. A watchdog performs the same cleanup if the terminal
process exits unexpectedly. Named volumes and Coder workspace volumes are never removed during
normal shutdown.

The initial Keycloak username is `pad`. Display its generated local password with:

```powershell
pad credentials
```

Use `PAD_NO_BROWSER=1` when the browser should not open automatically:

```powershell
$env:PAD_NO_BROWSER = "1"
pad
```

### Attached and detached modes

```powershell
pad             # attached; stop owned services when this terminal exits
pad start       # detached; keep services running after the terminal closes
pad stop        # stop the Pad Compose project, preserve every volume
pad restart     # stop and start, preserving data
pad open        # open the website without changing service state
pad status      # show mode, ownership, URLs, containers, and health
```

An attached command never claims or stops a stack that was already running in detached mode. A
session file containing the PID and a random session ID prevents two attached processes from
managing the same stack; stale locks are removed automatically.

### Logs and diagnostics

```powershell
pad logs
pad logs app
pad logs coder
pad logs keycloak
pad logs postgres
pad logs redis
pad doctor
```

`pad doctor` checks Windows, PowerShell, Docker Desktop, its Linux engine, Compose, WSL2, free
space, ports, generated files, container state, PostgreSQL, Redis, Keycloak discovery, Coder, the
Pad backend, and the website. Its failures include Windows-specific corrective guidance.

### Updates

```powershell
pad update
```

Update downloads `WBattist/pad-local` (or the configured repository/branch), retains generated
configuration and Docker volumes, rebuilds changed images, and restores the previous running
mode. The installer and update workflow are repeat-safe after interruptions.

### Reset and uninstall

```powershell
pad reset             # requires typing DELETE
pad reset --yes       # deletes Pad Local databases and labeled workspace volumes
pad uninstall         # removes launchers; preserves Docker volumes and configuration
pad uninstall --purge # deletes local data before uninstalling
```

Reset and purge are the only normal commands that remove persistent volumes. Plain stop,
attached-session cleanup, update, reinstall, and plain uninstall never use `down --volumes`.

## Data and installation locations

| Purpose | Windows path |
| --- | --- |
| Application | `%LOCALAPPDATA%\PadLocal` |
| Generated configuration | `%LOCALAPPDATA%\PadLocal\config` |
| CLI/session state | `%LOCALAPPDATA%\PadLocal\state` |
| Logs | `%LOCALAPPDATA%\PadLocal\logs` |
| `pad` launcher | `%LOCALAPPDATA%\Programs\PadLocal\bin` |

Canvas/user data, Keycloak data, and Coder state live in named Docker volumes. Each development
workspace has a labeled Docker volume for `/home/coder`, so files remain after its container and
the Pad stack stop. Generated secrets are stored in `config\runtime.env`; the installer restricts
its Windows ACL to the current user when feasible. Do not publish or commit that file.

## Ports

Only browser-facing ports are published, and all bind to `127.0.0.1`:

| Service | Default URL |
| --- | --- |
| Pad website | http://localhost:8000 |
| Coder | http://localhost:7080 |
| Keycloak | http://localhost:8080 |

PostgreSQL and Redis are not exposed to Windows. Change a conflicting port persistently with:

```powershell
pad config set app.port 8001
pad config set coder.port 7081
pad config set keycloak.port 8081
```

For one process, use `PAD_APP_PORT`, `PAD_CODER_PORT`, or `PAD_KEYCLOAK_PORT`. Pad reports the
owning process when a required port is occupied and never kills unrelated processes.

## How local authentication and workspaces work

The browser uses `localhost` URLs, while containers use Compose DNS names such as `postgres`,
`redis`, `keycloak`, `coder`, and `app`. Pad has separate public and internal OIDC endpoints, so
authorization redirects remain browser-reachable while token and JWKS requests stay on the Docker
network. Keycloak imports a generated realm with exact Pad and Coder callbacks, origins, scopes,
roles, an audience mapper, and the initial local user.

Coder runs against its own PostgreSQL database. Bootstrap uses Coder's CLI to create the first
administrator and automation token, find the default organization, push `coder-template`, and
store discovered IDs. The template creates a Linux workspace with persistent home storage,
browser terminal, code-server, and desktop VS Code/Cursor connection support.

## Security notes

Pad Local is intended for one trusted user on one Windows machine. HTTP is acceptable only because
all published services bind to loopback. Do not change them to `0.0.0.0` without adding TLS,
hardening identity configuration, and reviewing Coder's deployment guidance.

Coder must create and manage workspace containers. Pad routes that access through a Docker socket
proxy instead of giving the Coder container a host Docker group ID. The proxy is not published to
Windows, but its allowed Docker API can still create privileged resources; anyone who controls
Coder templates or the Pad Docker network may effectively control Docker Desktop's Linux VM. Only
install trusted templates and repository updates. Keycloak/Coder use a local-development issuer
workaround because the browser sees `localhost` while containers use an internal backchannel; it
must not be reused for a network-accessible deployment.

## Troubleshooting

- **`pad` is not recognized:** open a new terminal. The installer updates the current process and
  the user `PATH`, but already-open sibling terminals do not inherit the new value.
- **Docker daemon unavailable:** open Docker Desktop, wait for “Engine running,” confirm Linux
  containers are selected, then run `pad doctor`.
- **WSL error:** run `wsl --status`; install/update WSL from an elevated terminal, restart Windows,
  and re-enable Docker Desktop's WSL2 engine.
- **Port occupied:** use `pad doctor`, stop the reported program yourself, or configure another
  port. Pad never terminates it.
- **A service is unhealthy:** run `pad status`, then `pad logs <service>`. Re-running `pad` resumes
  incomplete Keycloak/Coder bootstrap.
- **Browser did not open:** run `pad open` or visit http://localhost:8000.

## Linux (secondary)

PowerShell and Docker Engine are required for the same management CLI:

```bash
curl -fsSL https://raw.githubusercontent.com/WBattist/pad-local/main/install.sh | bash
pad
```

Windows PowerShell remains the primary installation and management experience.

## Development and testing

```powershell
Invoke-Pester -Path tests -Output Detailed
pwsh -File scripts/smoke-test.ps1
```

CI validates PowerShell parsing/unit behavior, analyzes PowerShell errors, and renders the Compose
model. A real Docker Desktop integration and browser checklist is in
`tests/integration/README.md` because hosted Windows runners cannot provide a supported nested
Docker Desktop Linux engine.
