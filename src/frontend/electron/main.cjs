const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('node:child_process');
const pty = require('node-pty');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const terminals = new Map();
let mainWindow;
let dataRoot;
let padsRoot;
let statePath;

const defaultScene = () => ({
  elements: [],
  appState: { theme: 'dark', gridModeEnabled: true, gridSize: 20, gridStep: 5 },
  files: {},
});

function rebuiltState() {
  const now = new Date().toISOString();
  const recoveredPads = fs.readdirSync(padsRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[a-zA-Z0-9-]{8,64}\.json$/.test(entry.name))
    .map((entry, index) => {
      const id = entry.name.slice(0, -5);
      const stats = fs.statSync(path.join(padsRoot, entry.name));
      return {
        id,
        title: `Recovered Pad ${index + 1}`,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      };
    });
  if (!recoveredPads.length) {
    const id = crypto.randomUUID();
    writeJson(path.join(padsRoot, `${id}.json`), defaultScene());
    recoveredPads.push({ id, title: 'Welcome', createdAt: now, updatedAt: now });
  }
  return { version: 1, activePadId: recoveredPads[0].id, workspacePath: '', pads: recoveredPads };
}

function isValidState(state) {
  return state && state.version === 1 && Array.isArray(state.pads) && state.pads.length > 0
    && state.pads.every((pad) => pad && typeof pad.id === 'string' && typeof pad.title === 'string')
    && state.pads.some((pad) => pad.id === state.activePadId);
}

function ensureStorage() {
  dataRoot = path.join(app.getPath('userData'), 'data');
  padsRoot = path.join(dataRoot, 'pads');
  statePath = path.join(dataRoot, 'state.json');
  fs.mkdirSync(padsRoot, { recursive: true });
  try {
    if (!fs.existsSync(statePath)) throw new Error('State does not exist.');
    const state = readState();
    if (!isValidState(state)) throw new Error('State is invalid.');
    for (const pad of state.pads) {
      safePadId(pad.id);
      const padPath = path.join(padsRoot, `${pad.id}.json`);
      if (!fs.existsSync(padPath)) writeJson(padPath, defaultScene());
    }
  } catch {
    if (fs.existsSync(statePath)) {
      fs.renameSync(statePath, path.join(dataRoot, `state.corrupt-${Date.now()}.json`));
    }
    writeJson(statePath, rebuiltState());
  }
}

function writeJson(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temporary, target);
}

function readState() {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function saveState(state) {
  writeJson(statePath, state);
  return state;
}

function safePadId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new Error('Invalid pad identifier.');
  return id;
}

function currentWorkspace() {
  const workspacePath = readState().workspacePath;
  return workspacePath && fs.existsSync(workspacePath) ? fs.realpathSync(workspacePath) : '';
}

function safeWorkspacePath(candidate) {
  const root = currentWorkspace();
  if (!root) throw new Error('Choose a workspace folder first.');
  const resolved = fs.realpathSync(path.resolve(candidate));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside the selected workspace.');
  return resolved;
}

function safeWorkspaceDestination(candidate) {
  const root = currentWorkspace();
  if (!root) throw new Error('Choose a workspace folder first.');
  const resolved = path.resolve(candidate);
  const parent = fs.realpathSync(path.dirname(resolved));
  const relative = path.relative(root, parent);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Path is outside the selected workspace.');
  return resolved;
}

function listWorkspaceFiles(root, limit = 2500) {
  const ignored = new Set(['.git', 'node_modules', '.venv', 'dist', 'build', '__pycache__']);
  const results = [];
  const visit = (directory, depth) => {
    if (depth > 10 || results.length >= limit) return;
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= limit || ignored.has(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath);
      results.push({ name: entry.name, path: fullPath, relativePath, type: entry.isDirectory() ? 'directory' : 'file', depth });
      if (entry.isDirectory()) visit(fullPath, depth + 1);
    }
  };
  visit(root, 0);
  return results;
}

function setWorkspaceFromArguments(argv) {
  const start = process.defaultApp ? 2 : 1;
  const candidate = argv.slice(start).find((value) => value && !value.startsWith('-'));
  if (!candidate) return null;
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return null;
  const state = readState();
  state.workspacePath = fs.realpathSync(resolved);
  saveState(state);
  const workspace = { path: state.workspacePath, files: listWorkspaceFiles(state.workspacePath) };
  mainWindow?.webContents.send('workspace:changed', workspace);
  return workspace;
}

function registerIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataPath: dataRoot, platform: process.platform }));
  ipcMain.handle('app:openData', () => shell.openPath(dataRoot));
  ipcMain.handle('backup:export', async () => {
    const state = readState();
    const backup = {
      format: 'pad-local-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      pads: state.pads.map((pad) => ({
        ...pad,
        scene: JSON.parse(fs.readFileSync(path.join(padsRoot, `${safePadId(pad.id)}.json`), 'utf8')),
      })),
    };
    const date = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Pad Local backup',
      defaultPath: path.join(app.getPath('documents'), `Pad-Local-Backup-${date}.json`),
      filters: [{ name: 'Pad Local backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    writeJson(result.filePath, backup);
    return result.filePath;
  });
  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Pad Local backup',
      properties: ['openFile'],
      filters: [{ name: 'Pad Local backup', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    if (fs.statSync(source).size > 100 * 1024 * 1024) throw new Error('Backups larger than 100 MB cannot be imported.');
    const backup = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (backup?.format !== 'pad-local-backup' || backup.version !== 1 || !Array.isArray(backup.pads) || !backup.pads.length) {
      throw new Error('This is not a valid Pad Local backup.');
    }
    const state = readState();
    const createdIds = [];
    const importedPads = [];
    try {
      for (const item of backup.pads) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const pad = {
          id,
          title: String(item?.title || 'Imported Pad').trim().slice(0, 80) || 'Imported Pad',
          createdAt: now,
          updatedAt: now,
        };
        const scene = item?.scene && Array.isArray(item.scene.elements) ? item.scene : defaultScene();
        writeJson(path.join(padsRoot, `${id}.json`), scene);
        createdIds.push(id);
        importedPads.push(pad);
      }
      state.pads.push(...importedPads);
      state.activePadId = importedPads[0].id;
      saveState(state);
    } catch (error) {
      for (const id of createdIds) fs.rmSync(path.join(padsRoot, `${id}.json`), { force: true });
      throw error;
    }
    return { pads: state.pads, activePadId: state.activePadId };
  });
  ipcMain.handle('pads:list', () => {
    const state = readState();
    return { pads: state.pads, activePadId: state.activePadId };
  });
  ipcMain.handle('pads:load', (_event, id) => {
    safePadId(id);
    const target = path.join(padsRoot, `${id}.json`);
    if (!fs.existsSync(target)) return defaultScene();
    try {
      return JSON.parse(fs.readFileSync(target, 'utf8'));
    } catch {
      fs.renameSync(target, path.join(padsRoot, `${id}.corrupt-${Date.now()}.json`));
      const scene = defaultScene();
      writeJson(target, scene);
      return scene;
    }
  });
  ipcMain.handle('pads:create', (_event, title = 'Untitled') => {
    const state = readState();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const pad = { id, title: String(title).trim().slice(0, 80) || 'Untitled', createdAt: now, updatedAt: now };
    state.pads.push(pad);
    state.activePadId = id;
    writeJson(path.join(padsRoot, `${id}.json`), defaultScene());
    saveState(state);
    return pad;
  });
  ipcMain.handle('pads:save', (_event, id, scene) => {
    safePadId(id);
    const state = readState();
    const pad = state.pads.find((item) => item.id === id);
    if (!pad) throw new Error('Pad not found.');
    pad.updatedAt = new Date().toISOString();
    state.activePadId = id;
    writeJson(path.join(padsRoot, `${id}.json`), scene || defaultScene());
    saveState(state);
    return true;
  });
  ipcMain.handle('pads:rename', (_event, id, title) => {
    safePadId(id);
    const state = readState();
    const pad = state.pads.find((item) => item.id === id);
    if (!pad) throw new Error('Pad not found.');
    pad.title = String(title).trim().slice(0, 80) || 'Untitled';
    pad.updatedAt = new Date().toISOString();
    saveState(state);
    return pad;
  });
  ipcMain.handle('pads:delete', (_event, id) => {
    safePadId(id);
    const state = readState();
    if (state.pads.length <= 1) throw new Error('Keep at least one pad.');
    state.pads = state.pads.filter((item) => item.id !== id);
    if (state.activePadId === id) state.activePadId = state.pads[0].id;
    saveState(state);
    fs.rmSync(path.join(padsRoot, `${id}.json`), { force: true });
    return state.activePadId;
  });
  ipcMain.handle('pads:activate', (_event, id) => {
    safePadId(id);
    const state = readState();
    if (!state.pads.some((item) => item.id === id)) throw new Error('Pad not found.');
    state.activePadId = id;
    saveState(state);
    return true;
  });

  ipcMain.handle('workspace:get', () => {
    const workspacePath = currentWorkspace();
    return { path: workspacePath, files: workspacePath ? listWorkspaceFiles(workspacePath) : [] };
  });
  ipcMain.handle('workspace:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const state = readState();
    state.workspacePath = path.resolve(result.filePaths[0]);
    saveState(state);
    return { path: state.workspacePath, files: listWorkspaceFiles(state.workspacePath) };
  });
  ipcMain.handle('workspace:refresh', () => {
    const workspacePath = currentWorkspace();
    return { path: workspacePath, files: workspacePath ? listWorkspaceFiles(workspacePath) : [] };
  });
  ipcMain.handle('workspace:createFile', async () => {
    const root = currentWorkspace();
    if (!root) throw new Error('Choose a workspace folder first.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Create a workspace file',
      defaultPath: root,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return null;
    const filePath = safeWorkspaceDestination(result.filePath);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');
    return { filePath, workspace: { path: root, files: listWorkspaceFiles(root) } };
  });
  ipcMain.handle('workspace:read', (_event, filePath) => {
    const resolved = safeWorkspacePath(filePath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile() || stats.size > 5 * 1024 * 1024) throw new Error('Only text files under 5 MB can be opened.');
    return fs.readFileSync(resolved, 'utf8');
  });
  ipcMain.handle('workspace:readAsset', (_event, filePath) => {
    const resolved = safeWorkspacePath(filePath);
    const stats = fs.statSync(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const mime = {
      '.avif': 'image/avif', '.bmp': 'image/bmp', '.gif': 'image/gif', '.ico': 'image/x-icon',
      '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
    }[extension];
    if (!stats.isFile() || !mime) throw new Error('This file does not have an in-app preview.');
    if (stats.size > 30 * 1024 * 1024) throw new Error('Images larger than 30 MB cannot be previewed.');
    return { dataUrl: `data:${mime};base64,${fs.readFileSync(resolved).toString('base64')}`, mime, size: stats.size };
  });
  ipcMain.handle('workspace:write', (_event, filePath, contents) => {
    const resolved = safeWorkspacePath(filePath);
    const value = String(contents);
    if (Buffer.byteLength(value, 'utf8') > 5 * 1024 * 1024) throw new Error('Only text files under 5 MB can be saved.');
    fs.writeFileSync(resolved, value, 'utf8');
    return true;
  });
  ipcMain.handle('workspace:reveal', (_event, targetPath) => shell.showItemInFolder(safeWorkspacePath(targetPath)));
  ipcMain.handle('workspace:openInVSCode', async (_event, targetPath) => {
    const resolved = targetPath ? safeWorkspacePath(targetPath) : currentWorkspace();
    if (!resolved) throw new Error('Choose a workspace folder first.');
    const candidates = process.platform === 'win32'
      ? [
          process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
          process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
          process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe'),
        ].filter(Boolean)
      : process.platform === 'darwin'
        ? ['/Applications/Visual Studio Code.app/Contents/MacOS/Electron']
        : ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code'];
    const executable = candidates.find((candidate) => fs.existsSync(candidate));
    if (!executable) return { opened: false, message: 'Visual Studio Code was not found on this computer.' };
    const child = spawn(executable, ['--reuse-window', resolved], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return { opened: true, message: 'Opened in Visual Studio Code.' };
  });

  ipcMain.handle('terminal:start', (_event, requestedDirectory) => {
    const cwd = requestedDirectory ? safeWorkspacePath(requestedDirectory) : currentWorkspace() || app.getPath('home');
    const id = crypto.randomUUID();
    const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || '/bin/sh');
    const args = process.platform === 'win32' ? [] : ['-i'];
    const terminal = pty.spawn(executable, args, {
      name: 'xterm-256color', cols: 100, rows: 30, cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    terminals.set(id, terminal);
    terminal.onData((data) => mainWindow?.webContents.send('terminal:data', { id, data }));
    terminal.onExit(({ exitCode }) => {
      mainWindow?.webContents.send('terminal:data', { id, data: `\r\n[process exited ${exitCode ?? ''}]\r\n` });
      terminals.delete(id);
    });
    return { id, cwd };
  });
  ipcMain.handle('terminal:write', (_event, id, data) => {
    const terminal = terminals.get(id);
    if (!terminal) return false;
    terminal.write(String(data));
    return true;
  });
  ipcMain.handle('terminal:resize', (_event, id, columns, rows) => {
    const terminal = terminals.get(id);
    if (!terminal) return false;
    terminal.resize(Math.max(2, Number(columns) || 80), Math.max(1, Number(rows) || 24));
    return true;
  });
  ipcMain.handle('terminal:kill', (_event, id) => {
    const terminal = terminals.get(id);
    if (terminal) terminal.kill();
    terminals.delete(id);
    return true;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#111318',
    title: 'Pad Local',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  else mainWindow.loadURL(process.env.PAD_DESKTOP_DEV_URL || 'http://127.0.0.1:3003');
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url);
    } catch { /* Ignore malformed external URLs. */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (url !== currentUrl) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = undefined; });
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    setWorkspaceFromArguments(argv);
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(() => {
    ensureStorage();
    setWorkspaceFromArguments(process.argv);
    registerIpc();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

app.on('before-quit', () => {
  for (const child of terminals.values()) if (!child.killed) child.kill();
  terminals.clear();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
