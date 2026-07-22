# Pad Local implementation report

## Result

The project is now structured as a Windows-first, browser-based local application. The public
entry point remains `http://localhost:8000`; PowerShell controls a Docker Desktop Linux-container
stack and does not replace the website with a terminal or native desktop UI.

The GitHub repository is an actual public fork at `WBattist/pad-local`. Locally, `origin` points
to that fork and `upstream` points to `coderamp-labs/pad.ws`.

## Relevant final tree

```text
pad.ws/
├── .github/workflows/powershell-tests.yml
├── bootstrap/postgres/init-databases.sh
├── coder-template/
│   ├── main.tf
│   └── README.md
├── config/
│   ├── defaults.env
│   ├── keycloak/realm-template.json
│   └── nginx.conf
├── scripts/
│   ├── lib/Common.ps1
│   ├── doctor.ps1
│   ├── pad.cmd
│   ├── pad.ps1
│   ├── session-watch.ps1
│   ├── smoke-test.ps1
│   └── startup.sh
├── src/
│   ├── backend/...
│   └── frontend/...
├── tests/
│   ├── integration/README.md
│   └── PadLocal.Tests.ps1
├── .env.template
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── IMPLEMENTATION_PLAN.md
├── IMPLEMENTATION_REPORT.md
├── install.ps1
├── install.sh
└── README.md
```

Generated `config/runtime.env`, `config/runtime/`, `state/`, and `logs/` are ignored and preserved
across reinstall/update.

## Significant architecture changes

- Removed host networking and all Docker group-ID configuration. Services use Compose DNS names.
- Bound Pad, Coder, and Keycloak to Windows loopback; PostgreSQL/Redis are internal only.
- Added separate Pad `app` and `frontend` health-checked services. Nginx is a localhost entry proxy
  while FastAPI continues serving the existing built React/Excalidraw application.
- Split public/internal OIDC and Coder URLs in the backend so browser redirects use `localhost`
  while token, JWKS, database, Redis, and Coder API traffic stays on Compose networking.
- Added generated Keycloak realm import with the exact Pad callback, Coder callback, origins,
  scopes, audience mapper, roles, logout redirects, and initial user.
- Added staged, resume-safe Coder CLI bootstrap for the administrator, automation token, default
  organization, template upload, and ID discovery. No hard-coded UUIDs are used.
- Added a Coder Docker template with terminal, code-server, desktop IDE support, a persistent
  labeled home volume, and host-gateway agent connectivity compatible with Docker Desktop.
- Put Coder's Docker API access behind an unexposed socket proxy rather than requiring a Windows
  user to discover a Linux socket group ID.
- Added attached/detached ownership, stale-lock cleanup, `try/finally` cleanup, an engine-exit
  handler, and an independent watchdog for terminal/process exit.

## Windows-specific decisions

- Installation, configuration, state, logs, and launcher use per-user `%LOCALAPPDATA%` paths.
- The launcher prefers `pwsh.exe`, falls back to `powershell.exe`, and uses execution-policy bypass
  only for the known installed script.
- Docker Desktop is detected at standard locations, started when stopped, and checked for its
  Linux engine and Compose v2.
- Secure values use `RandomNumberGenerator`, are never committed, and receive a current-user-only
  ACL where feasible.
- Published ports are checked with `Get-NetTCPConnection`; Pad identifies conflicts but never
  terminates unrelated processes.
- Normal shutdown uses `docker compose --project-name pad-local stop`, never volume deletion.

## Validation performed

Commands run:

```powershell
Invoke-Pester -Path tests -Output Detailed
Invoke-ScriptAnalyzer -Path install.ps1 -Recurse
Invoke-ScriptAnalyzer -Path scripts -Recurse
python -m compileall -q src/backend
git diff --check
pwsh -File scripts/pad.ps1 status
pwsh -File scripts/pad.ps1 config set app.port 8001
pwsh -File scripts/pad.ps1 config set app.port 8000
pwsh -File scripts/doctor.ps1
```

Results:

- Pester: 8 passed, 0 failed.
- PSScriptAnalyzer: 0 errors; style warnings remain for intentional console output and lifecycle
  function names.
- Python backend compilation: passed.
- PowerShell 7 parsing: passed for every `.ps1` file.
- Windows PowerShell 5.1 parser/configuration check: passed.
- YAML parse for Compose and GitHub Actions: passed.
- Generated-secret/realm idempotency: passed.
- CLI four-argument port configuration and persistence: passed.
- `git diff --check`: passed.
- GitHub Actions PowerShell unit and Compose-model jobs: passed.
- GitHub Actions Docker Buildx build for Linux amd64/ARM64: passed, including the frontend
  production build and final Pad application image.
- `pad doctor`: correctly reported the unavailable Docker Desktop/CLI and returned failure.

## Unresolved validation limitations

This development machine has no Docker CLI or Docker Desktop installation. Therefore the image
build, container health checks, real Keycloak browser authentication, Coder template upload,
workspace creation, embedded terminal/code-server, Ctrl+C container cleanup, and cross-restart
volume persistence could not be executed here. They are explicitly covered by
`tests/integration/README.md` for a dedicated Windows Docker Desktop host.

The local Yarn dependency installation stalled without output and was terminated. No frontend
source was changed, and the production frontend build subsequently passed inside GitHub's Docker
Buildx workflow. Windows ARM64 runtime support remains contingent on all pinned/upstream service
images and the selected workspace image publishing compatible manifests.

## Security considerations

- All browser services use plain HTTP and are safe only while bound to `127.0.0.1` for a trusted
  single-user machine.
- The socket proxy reduces the exposed Docker API surface and is not host-published, but template
  administrators can still obtain effective control of Docker Desktop's Linux VM.
- Coder uses its documented dangerous issuer-check bypass only to bridge the local browser's
  `localhost` issuer and Keycloak's dynamic Docker backchannel. This configuration must not be
  copied to a network-accessible deployment.
- Generated runtime configuration contains database, identity, session, bootstrap, and Coder
  credentials. It must stay private and be backed up with the matching Docker volumes.
- Reset/purge delete only the fixed Compose project and resources labeled `pad.local=true`.

## Installation command

```powershell
irm https://raw.githubusercontent.com/WBattist/pad-local/main/install.ps1 | iex
pad
```
