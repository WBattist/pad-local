import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw } from '@atyrode/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { ExcalidrawElement } from '@atyrode/excalidraw/element/types';
import { ChevronRight, Download, File, FilePlus2, Folder, FolderOpen, Pencil, Plus, RefreshCw, TerminalSquare, Trash2, Upload } from 'lucide-react';
import { desktopApi } from './desktopApi';
import { FileEditor } from './FileEditor';
import { TerminalPane } from './TerminalPane';
import './App.scss';

const cleanScene = (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): LocalScene => {
  const serializable = JSON.parse(JSON.stringify({ elements, appState, files }));
  delete serializable.appState.collaborators;
  return serializable;
};

export default function App() {
  const [pads, setPads] = useState<LocalPad[]>([]);
  const [activePadId, setActivePadId] = useState('');
  const [scene, setScene] = useState<LocalScene | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>({ path: '', files: [] });
  const [selectedFile, setSelectedFile] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saveTimer = useRef<number | undefined>(undefined);
  const latestScene = useRef<LocalScene | null>(null);
  const currentPadId = useRef('');
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);

  const activePad = useMemo(() => pads.find((pad) => pad.id === activePadId), [pads, activePadId]);

  const flushCurrentPad = useCallback(async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    if (currentPadId.current && latestScene.current) {
      await desktopApi.savePad(currentPadId.current, latestScene.current);
    }
    setSaving(false);
  }, []);

  const loadPad = useCallback(async (id: string) => {
    if (!id || id === currentPadId.current) return;
    await flushCurrentPad();
    setScene(null);
    setSelectedFile('');
    await desktopApi.activatePad(id);
    const loaded = await desktopApi.loadPad(id);
    currentPadId.current = id;
    latestScene.current = loaded;
    setActivePadId(id);
    setScene(loaded);
    setSaving(false);
  }, [flushCurrentPad]);

  useEffect(() => {
    Promise.all([
      desktopApi.listPads(),
      desktopApi.workspace?.get() || Promise.resolve({ path: '', files: [] }),
    ]).then(async ([padState, workspaceState]) => {
      setPads(padState.pads);
      setWorkspace(workspaceState);
      await loadPad(padState.activePadId || padState.pads[0]?.id);
    }).catch((cause) => setError(cause.message));
  }, [loadPad]);

  useEffect(() => window.padDesktop?.workspace.onChanged((nextWorkspace) => {
    setWorkspace(nextWorkspace);
    setSelectedFile('');
  }), []);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (currentPadId.current && latestScene.current) {
      void desktopApi.savePad(currentPadId.current, latestScene.current);
    }
  }, []);

  const saveCanvas = useCallback((elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
    const padId = currentPadId.current;
    if (!padId) return;
    const next = cleanScene(elements, appState, files);
    latestScene.current = next;
    setSaving(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await desktopApi.savePad(padId, next);
        if (currentPadId.current === padId) setSaving(false);
      } catch (cause: any) {
        setSaving(false);
        setError(cause.message);
      }
    }, 700);
  }, []);

  const createPad = async () => {
    try {
      const pad = await desktopApi.createPad(`Pad ${pads.length + 1}`);
      setPads((current) => [...current, pad]);
      await loadPad(pad.id);
    } catch (cause: any) { setError(cause.message); }
  };

  const renamePad = async (pad: LocalPad) => {
    const title = window.prompt('Rename pad', pad.title)?.trim();
    if (!title || title === pad.title) return;
    try {
      const updated = await desktopApi.renamePad(pad.id, title);
      setPads((current) => current.map((item) => item.id === pad.id ? updated : item));
    } catch (cause: any) { setError(cause.message); }
  };

  const deletePad = async (pad: LocalPad) => {
    if (!window.confirm(`Delete “${pad.title}”? This cannot be undone.`)) return;
    try {
      if (pad.id === currentPadId.current) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        currentPadId.current = '';
        latestScene.current = null;
      }
      const nextId = await desktopApi.deletePad(pad.id);
      setPads((current) => current.filter((item) => item.id !== pad.id));
      if (pad.id === activePadId) await loadPad(nextId);
    } catch (cause: any) { setError(cause.message); }
  };

  const chooseWorkspace = async () => {
    const result = await desktopApi.workspace?.choose();
    if (result) {
      setWorkspace(result);
      setSelectedFile('');
    }
  };

  const refreshWorkspace = async () => {
    const result = await desktopApi.workspace?.refresh();
    if (result) setWorkspace(result);
  };

  const createFile = async () => {
    try {
      const result = await desktopApi.workspace?.createFile();
      if (!result) return;
      setWorkspace(result.workspace);
      setSelectedFile(result.filePath);
    } catch (cause: any) { setError(cause.message); }
  };

  const exportBackup = async () => {
    if (!desktopApi.backup) return;
    try {
      await flushCurrentPad();
      const destination = await desktopApi.backup.export();
      if (destination) setNotice(`Backup saved to ${destination}`);
    } catch (cause: any) { setError(cause.message); }
  };

  const importBackup = async () => {
    if (!desktopApi.backup) return;
    try {
      await flushCurrentPad();
      const imported = await desktopApi.backup.import();
      if (!imported) return;
      setPads(imported.pads);
      await loadPad(imported.activePadId);
      setNotice('Backup imported. Existing pads were kept.');
    } catch (cause: any) { setError(cause.message); }
  };

  return (
    <main className="desktop-shell">
      <header className="app-header">
        <img className="brand-mark" src="./assets/images/app-icon.png" alt="" />
        <div className="brand-copy"><strong>Pad Local</strong><span>Local workspace</span></div>
        <div className="active-title">{activePad?.title || 'Loading…'}</div>
        <div className={`save-state ${saving ? 'saving' : ''}`}>{saving ? 'Saving…' : 'Saved locally'}</div>
        <button className={terminalOpen ? 'active' : ''} onClick={() => setTerminalOpen((value) => !value)}><TerminalSquare size={16} /> Terminal</button>
      </header>

      <aside className="sidebar">
        <section className="sidebar-section pads-section">
          <header><span>Pads</span><button onClick={createPad} title="New pad"><Plus size={16} /></button></header>
          <div className="pad-list">
            {pads.map((pad) => (
              <div key={pad.id} className={`pad-row ${pad.id === activePadId ? 'active' : ''}`}>
                <button className="pad-select" onClick={() => loadPad(pad.id)}><span className="pad-dot" />{pad.title}</button>
                <button className="row-action" onClick={() => renamePad(pad)} title="Rename"><Pencil size={13} /></button>
                <button className="row-action danger" onClick={() => deletePad(pad)} title="Delete"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </section>

        <section className="sidebar-section workspace-section">
          <header>
            <span>Workspace</span>
            <div>
              <button onClick={refreshWorkspace} disabled={!workspace.path} title="Refresh"><RefreshCw size={14} /></button>
              <button onClick={createFile} disabled={!workspace.path} title="New file"><FilePlus2 size={14} /></button>
              <button onClick={chooseWorkspace} title="Choose folder"><FolderOpen size={15} /></button>
            </div>
          </header>
          <button className="workspace-picker" onClick={chooseWorkspace}>
            <Folder size={16} />
            <span>{workspace.path ? workspace.path.split(/[\\/]/).pop() : 'Choose a folder'}</span>
          </button>
          <div className="file-tree">
            {workspace.files.map((entry) => (
              <button
                key={entry.path}
                className={`file-row ${selectedFile === entry.path ? 'active' : ''}`}
                style={{ paddingLeft: `${10 + entry.depth * 13}px` }}
                disabled={entry.type === 'directory'}
                onClick={() => entry.type === 'file' && setSelectedFile(entry.path)}
                title={entry.relativePath}
              >
                {entry.type === 'directory' ? <ChevronRight size={12} /> : <span className="tree-spacer" />}
                {entry.type === 'directory' ? <Folder size={14} /> : <File size={14} />}
                <span>{entry.name}</span>
              </button>
            ))}
          </div>
        </section>

        <footer>
          <div className="backup-actions">
            <button onClick={importBackup} disabled={!desktopApi.backup} title="Import backup"><Upload size={13} /> Import</button>
            <button onClick={exportBackup} disabled={!desktopApi.backup} title="Export backup"><Download size={13} /> Export</button>
          </div>
          <span>{desktopApi.isDesktop ? 'Offline · no account' : 'Browser preview · desktop APIs disabled'}</span>
        </footer>
      </aside>

      <section className={`main-workspace ${terminalOpen ? 'with-terminal' : ''} ${selectedFile ? 'with-editor' : ''}`}>
        <div className="canvas-pane">
          {scene ? (
            <Excalidraw
              key={activePadId}
              excalidrawAPI={(api) => { excalidrawApi.current = api; }}
              initialData={scene as any}
              onChange={saveCanvas}
              theme="dark"
              UIOptions={{ canvasActions: { saveAsImage: true, export: { saveFileToDisk: true } } }}
            />
          ) : <div className="loading-panel">Opening your local pad…</div>}
        </div>
        {selectedFile && <FileEditor key={selectedFile} filePath={selectedFile} onClose={() => setSelectedFile('')} />}
        {terminalOpen && <TerminalPane workspacePath={workspace.path} />}
      </section>

      {error && <button className="error-toast" onClick={() => setError('')}>{error}</button>}
      {notice && <button className="notice-toast" onClick={() => setNotice('')}>{notice}</button>}
    </main>
  );
}
