# Pad Local implementation plan

## Existing architecture

- A FastAPI process serves both the API and the built React/Excalidraw frontend.
- PostgreSQL stores users and canvases; Redis stores sessions and collaboration data.
- Keycloak provides OIDC. The callback is `/api/auth/callback`, the requested scopes are
  `openid profile email`, tokens are validated for the configured client audience, and logout
  returns to the frontend URL.
- Pad calls Coder's v2 API to create OIDC users and one workspace per user from a configured
  template. The browser embeds Coder's terminal and IDE routes.
- The original Compose file uses host networking and `localhost` for every service, mounts the
  Docker socket directly into Coder, and requires a Linux Docker group ID.

## Windows-first design

1. Replace host networking with the `pad-local` Compose network and service DNS names.
2. Publish only Pad, Coder, and Keycloak ports, bound to `127.0.0.1`.
3. Split public browser URLs from container-internal URLs in Pad's OIDC and Coder clients.
4. Generate all credentials with .NET cryptographic APIs and keep them in
   `%LOCALAPPDATA%\PadLocal\config\runtime.env` with user-only ACLs where Windows permits.
5. Import an idempotent Keycloak realm containing the Pad/Coder client, audience mapper,
   redirects, origins, roles, and initial local user.
6. Bootstrap Coder with its CLI: create the first administrator, create a long-lived automation
   token, discover the default organization, push the bundled template, discover its ID, and
   write those generated values back to `runtime.env`.
7. Put Docker API access behind a local-network-only socket proxy. The Coder provisioner uses
   that endpoint and no host Docker group ID is needed.
8. Provide `install.ps1`, an execution-policy-safe `pad.cmd`, and a PowerShell CLI with attached
   ownership locks, a watchdog, health waits, detached mode, diagnostics, updates, reset, and
   uninstall.
9. Preserve Compose volumes and Coder workspace volumes on normal stop and attached-session
   cleanup. Delete them only after explicit reset/purge confirmation.
10. Validate PowerShell syntax/unit behavior on Windows and keep Docker integration tests
    separate because hosted Windows runners and this development environment may not expose a
    Docker Linux daemon.

## Delivery order

- Compose, application URL separation, realm/template assets.
- Shared PowerShell library, bootstrap, lifecycle CLI, installer.
- Pester tests, CI, smoke tests, Linux fallback, documentation.
- Static/unit tests followed by Docker integration and browser checks when Docker Desktop is
  available.
