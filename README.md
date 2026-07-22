# Pad Local

Pad Local is a private, local-first whiteboard and development workspace packaged as a normal
desktop app. The Excalidraw canvas fills the window, pad tabs live in the canvas footer, and
Terminal or VS Code windows can be placed, moved, and resized directly on the board.

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
- Embedded VS Code windows open and autosave real files inside a folder you choose.
- File language support is selected automatically from its extension.
- Common image formats open in a fitted preview instead of being decoded as text.
- A workspace is an optional folder you explicitly choose for editor and terminal sessions.
- Terminal processes run in a real local PTY, starting in that selected workspace.
- Nothing is uploaded by the desktop runtime.

Use **Local data → Export backup** in the canvas menu to save every pad to a portable JSON backup.
**Import backup** adds copies without replacing pads already on the machine. Workspace source files
remain in their original folder and are not duplicated into pad backups.

Use **Local data → Open data folder** to see the exact directory used on your machine. Removing the
app does not remove that data automatically.

Use the canvas menu's **Tools** section to add a Terminal or VS Code window, or to select a workspace
folder. Click inside a window to interact with it, use its red window control to close it, and
double-click a footer tab to rename its pad. Drag a window by its title bar and resize it from the
lower-right corner. The editor's external-arrow action opens the current file in an installed
Visual Studio Code instance, where the user's normal VS Code extensions remain available.

You can also open a workspace folder from a terminal, similar to other local development tools:

```powershell
& "$env:LOCALAPPDATA\Programs\Pad Local\Pad Local.exe" C:\path\to\project
```

On Linux, run `pad-local /path/to/project`.

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

## Install on Linux

Download the AppImage from
[GitHub Releases](https://github.com/WBattist/pad-local/releases), or install the unpacked desktop
app for your user account:

```bash
curl -fsSL https://raw.githubusercontent.com/WBattist/pad-local/main/install.sh | bash
```

The script downloads the x64 tarball into `~/.local/share/pad-local`, creates a launcher in
`~/.local/bin`, and adds a desktop-menu entry. It does not install Docker or a language runtime.
Build Linux packages with `pnpm dist:linux` from `src/frontend`.

The former Docker/Keycloak/Coder implementation remains in Git history but is not part of the
packaged desktop runtime.
