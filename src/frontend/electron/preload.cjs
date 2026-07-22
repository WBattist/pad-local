const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('padDesktop', {
  info: () => ipcRenderer.invoke('app:info'),
  backup: {
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
  },
  pads: {
    list: () => ipcRenderer.invoke('pads:list'),
    load: (id) => ipcRenderer.invoke('pads:load', id),
    create: (title) => ipcRenderer.invoke('pads:create', title),
    save: (id, scene) => ipcRenderer.invoke('pads:save', id, scene),
    rename: (id, title) => ipcRenderer.invoke('pads:rename', id, title),
    delete: (id) => ipcRenderer.invoke('pads:delete', id),
    activate: (id) => ipcRenderer.invoke('pads:activate', id),
  },
  workspace: {
    get: () => ipcRenderer.invoke('workspace:get'),
    choose: () => ipcRenderer.invoke('workspace:choose'),
    refresh: () => ipcRenderer.invoke('workspace:refresh'),
    createFile: () => ipcRenderer.invoke('workspace:createFile'),
    read: (filePath) => ipcRenderer.invoke('workspace:read', filePath),
    write: (filePath, contents) => ipcRenderer.invoke('workspace:write', filePath, contents),
    reveal: (filePath) => ipcRenderer.invoke('workspace:reveal', filePath),
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('workspace:changed', listener);
      return () => ipcRenderer.removeListener('workspace:changed', listener);
    },
  },
  terminal: {
    start: (cwd) => ipcRenderer.invoke('terminal:start', cwd),
    write: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
    kill: (id) => ipcRenderer.invoke('terminal:kill', id),
    onData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('terminal:data', listener);
      return () => ipcRenderer.removeListener('terminal:data', listener);
    },
  },
});
