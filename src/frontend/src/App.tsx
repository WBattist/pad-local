import { useCallback, useEffect, useRef, useState } from 'react';
import { Excalidraw, Footer, MainMenu } from '@atyrode/excalidraw';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import type { ExcalidrawElement } from '@atyrode/excalidraw/element/types';
import { Code2, Database, Download, FolderOpen, TerminalSquare, Upload } from 'lucide-react';
import { CanvasTabs } from './CanvasTabs';
import { EmbeddedEditor } from './EmbeddedEditor';
import { TerminalPane } from './TerminalPane';
import { desktopApi } from './desktopApi';
import './App.scss';

const cleanScene = (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles): LocalScene => {
  const serializable = JSON.parse(JSON.stringify({ elements, appState, files }));
  delete serializable.appState.collaborators;
  return serializable;
};

const normalizeSceneWindows = (input: LocalScene): LocalScene => ({
  ...input,
  elements: input.elements.map((element: any) => element?.type === 'embeddable' && String(element.link || '').startsWith('!') ? {
    ...element,
    strokeColor: '#29292f',
    backgroundColor: 'transparent',
    strokeWidth: 1,
    roughness: 0,
  } : element),
});

function embeddedElement(link: '!terminal' | '!editor', api: ExcalidrawImperativeAPI) {
  const state = api.getAppState();
  const width = 800;
  const height = 500;
  const zoom = state.zoom?.value || 1;
  const element = {
    id: crypto.randomUUID().replaceAll('-', '').slice(0, 20),
    type: 'embeddable',
    x: state.width / (2 * zoom) - state.scrollX - width / 2,
    y: state.height / (2 * zoom) - state.scrollY - height / 2,
    width,
    height,
    angle: 0,
    strokeColor: '#29292f',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: { type: 3 },
    seed: Math.floor(Math.random() * 2 ** 30),
    version: 1,
    versionNonce: Math.floor(Math.random() * 2 ** 30),
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link,
    locked: false,
    customData: {
      title: link === '!terminal' ? 'Terminal' : 'VS Code',
      showHyperlinkIcon: false,
      showClickableHint: false,
      borderOffsets: { left: 8, right: 8, top: 34, bottom: 8 },
    },
  } as any;
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), element] });
  api.scrollToContent(element, { fitToContent: true, viewportZoomFactor: 0.9, animate: true });
  api.setActiveTool({ type: 'selection' });
}

export default function App() {
  const [pads, setPads] = useState<LocalPad[]>([]);
  const [activePadId, setActivePadId] = useState('');
  const [scene, setScene] = useState<LocalScene | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>({ path: '', files: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canvasApi, setCanvasApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latestScene = useRef<LocalScene | null>(null);
  const currentPadId = useRef('');
  const excalidrawApi = useRef<ExcalidrawImperativeAPI | null>(null);

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
    await desktopApi.activatePad(id);
    const loaded = normalizeSceneWindows(await desktopApi.loadPad(id));
    currentPadId.current = id;
    latestScene.current = loaded;
    setActivePadId(id);
    setScene(loaded);
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

  useEffect(() => window.padDesktop?.workspace.onChanged((nextWorkspace) => setWorkspace(nextWorkspace)), []);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (currentPadId.current && latestScene.current) void desktopApi.savePad(currentPadId.current, latestScene.current);
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

  const exportBackup = async () => {
    try {
      await flushCurrentPad();
      const destination = await desktopApi.backup?.export();
      if (destination) setNotice(`Backup saved to ${destination}`);
    } catch (cause: any) { setError(cause.message); }
  };

  const importBackup = async () => {
    try {
      await flushCurrentPad();
      const imported = await desktopApi.backup?.import();
      if (!imported) return;
      currentPadId.current = '';
      setPads(imported.pads);
      await loadPad(imported.activePadId);
      setNotice('Backup imported.');
    } catch (cause: any) { setError(cause.message); }
  };

  const chooseWorkspace = useCallback(async () => {
    const result = await desktopApi.workspace?.choose() || null;
    if (result) setWorkspace(result);
    return result;
  }, []);

  const createWorkspaceFile = useCallback(async () => {
    if (!workspace.path) {
      const chosen = await desktopApi.workspace?.choose();
      if (!chosen) return null;
      setWorkspace(chosen);
    }
    const result = await desktopApi.workspace?.createFile();
    if (!result) return null;
    setWorkspace(result.workspace);
    return result.filePath;
  }, [workspace.path]);

  const refreshWorkspace = useCallback(async () => {
    const result = await desktopApi.workspace?.refresh();
    if (result) setWorkspace(result);
  }, []);

  const closeEmbedded = useCallback((elementId: string) => {
    if (!canvasApi) return;
    const elements = canvasApi.getSceneElementsIncludingDeleted().map((item: any) => item.id === elementId ? {
      ...item,
      isDeleted: true,
      version: item.version + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 30),
      updated: Date.now(),
    } : item);
    canvasApi.updateScene({ elements });
  }, [canvasApi]);

  const renderEmbedded = useCallback((element: any) => {
    const stopCanvasEvent = (event: any) => event.stopPropagation();
    if (element.link === '!terminal') {
      return <div className="canvas-window" onPointerDown={stopCanvasEvent} onKeyDown={stopCanvasEvent} onKeyUp={stopCanvasEvent} onWheel={stopCanvasEvent}><TerminalPane workspacePath={workspace.path} embedded onClose={() => closeEmbedded(element.id)} /></div>;
    }
    if (element.link === '!editor') {
      return <div className="canvas-window" onPointerDown={stopCanvasEvent} onKeyDown={stopCanvasEvent} onKeyUp={stopCanvasEvent} onWheel={stopCanvasEvent}><EmbeddedEditor element={element} excalidrawAPI={canvasApi} workspace={workspace} onChooseWorkspace={chooseWorkspace} onCreateFile={createWorkspaceFile} onRefreshWorkspace={refreshWorkspace} onClose={() => closeEmbedded(element.id)} /></div>;
    }
    return null;
  }, [canvasApi, chooseWorkspace, closeEmbedded, createWorkspaceFile, refreshWorkspace, workspace]);

  return (
    <main className="canvas-app">
      {scene ? (
        <Excalidraw
          key={activePadId}
          excalidrawAPI={(api) => { excalidrawApi.current = api; setCanvasApi(api); }}
          initialData={scene as any}
          onChange={saveCanvas}
          validateEmbeddable={true}
          renderEmbeddable={renderEmbedded}
          UIOptions={{ hiddenElements: { toolbar: false, zoomControls: false, undoRedo: false, helpButton: false, mainMenu: false, sidebar: true }, canvasActions: { saveAsImage: true, export: { saveFileToDisk: true } } }}
        >
          <MainMenu>
            <MainMenu.Group title="Tools">
              <MainMenu.Item icon={<TerminalSquare />} onClick={() => excalidrawApi.current && embeddedElement('!terminal', excalidrawApi.current)}>Terminal</MainMenu.Item>
              <MainMenu.Item icon={<Code2 />} onClick={() => excalidrawApi.current && embeddedElement('!editor', excalidrawApi.current)}>VS Code</MainMenu.Item>
              <MainMenu.Item icon={<FolderOpen />} onClick={chooseWorkspace}>Open workspace folder</MainMenu.Item>
            </MainMenu.Group>
            <MainMenu.Separator />
            <MainMenu.Group title="Local data">
              <MainMenu.Item icon={<Upload />} onClick={importBackup}>Import backup</MainMenu.Item>
              <MainMenu.Item icon={<Download />} onClick={exportBackup}>Export backup</MainMenu.Item>
              <MainMenu.Item icon={<Database />} onClick={() => desktopApi.openData?.()}>Open data folder</MainMenu.Item>
            </MainMenu.Group>
          </MainMenu>
          <Footer>
            <CanvasTabs pads={pads} activePadId={activePadId} saving={saving} onSelect={loadPad} onCreate={createPad} onRename={renamePad} onDelete={deletePad} />
          </Footer>
        </Excalidraw>
      ) : <div className="loading-panel">Opening your local pad…</div>}
      {error && <button className="error-toast" onClick={() => setError('')}>{error}</button>}
      {notice && <button className="notice-toast" onClick={() => setNotice('')}>{notice}</button>}
    </main>
  );
}
