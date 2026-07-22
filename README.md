# Pad Local

Pad Local is a private, local-first whiteboard and development workspace packaged as a normal
desktop app. It combines an Excalidraw canvas, a Monaco code editor, a workspace file browser,
and a terminal in one window.

There is no login, Docker stack, database, browser server, or cloud account. Install the app and
open it.

## Install on Windows

Download `Pad-Local-Setup-...-x64.exe` from
[GitHub Releases](https://github.com/WBattist/pad-local/releases), or run:

```powershell
irm https://raw.githubusercontent.com/WBattist/pad-local/main/install.ps1 | iex
```

The installer creates Start menu and desktop shortcuts. It installs for the current user and does
not require Docker, WSL, Git, Node.js, PowerShell 7, or administrator access. Windows 10 or 11 on
x64 is currently supported.

> Run the command exactly as shown. `iex pad` is not valid PowerShell syntax for a piped script.

## What is local

- Pads are JSON documents stored under the app's Electron user-data directory.
- The canvas is saved automatically as it changes.
- A workspace is a folder you explicitly choose. The editor reads and writes only inside it.
- Terminal processes run directly on your machine, starting in the selected workspace.
- Nothing is uploaded by the desktop runtime.

The Data location shown in the app's status bar is the exact directory used on your machine.
Removing the app does not remove that data automatically.

## Development

The desktop client lives in `src/frontend`.

```powershell
cd src/frontend
pnpm install
pnpm dev
```

Build the Windows installer with:

```powershell
pnpm dist:win
```

Production renderer files and the Electron main process are staged into a minimal package before
Electron Builder runs. Runtime dependencies are bundled, so the installed application does not
need a package manager or a system runtime.

## Current direction

Windows is the primary target. Linux packaging follows the same local desktop architecture and is
tracked in this repository. The former Docker/Keycloak/Coder implementation remains in history but
is not part of the packaged desktop runtime.
