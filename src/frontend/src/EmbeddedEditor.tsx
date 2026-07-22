import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import Editor from '@monaco-editor/react';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import { ChevronRight, ExternalLink, FileCode2, Folder, FolderOpen, Image as ImageIcon, PanelLeft, Plus, RefreshCw, Save } from 'lucide-react';
import './monacoSetup';

const languageFor = (filePath: string) => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return ({
    c: 'c', cpp: 'cpp', cs: 'csharp', css: 'css', go: 'go', html: 'html', java: 'java',
    js: 'javascript', jsx: 'javascript', json: 'json', md: 'markdown', php: 'php', py: 'python',
    rb: 'ruby', rs: 'rust', scss: 'scss', sh: 'shell', sql: 'sql', ts: 'typescript',
    tsx: 'typescript', txt: 'plaintext', xml: 'xml', yaml: 'yaml', yml: 'yaml', ps1: 'powershell',
  } as Record<string, string>)[extension || ''] || 'plaintext';
};

const filenameFor = (filePath: string) => filePath.split(/[\\/]/).pop() || 'Welcome';
const imageExtensions = new Set(['avif', 'bmp', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const isImageFile = (filePath: string) => imageExtensions.has(filePath.split('.').pop()?.toLowerCase() || '');

interface EmbeddedEditorProps {
  element: any;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  workspace: WorkspaceSnapshot;
  onChooseWorkspace(): Promise<WorkspaceSnapshot | null>;
  onCreateFile(): Promise<string | null>;
  onRefreshWorkspace(): Promise<void>;
  onClose(): void;
  onDragStart(event: ReactPointerEvent<HTMLElement>): void;
}

export function EmbeddedEditor({
  element,
  excalidrawAPI,
  workspace,
  onChooseWorkspace,
  onCreateFile,
  onRefreshWorkspace,
  onClose,
  onDragStart,
}: EmbeddedEditorProps) {
  const [filePath, setFilePath] = useState<string>(() => element.customData?.editorFilePath || '');
  const [contents, setContents] = useState('');
  const [savedContents, setSavedContents] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [asset, setAsset] = useState<{ dataUrl: string; mime: string; size: number } | null>(null);
  const [status, setStatus] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const saveRef = useRef<() => void>(() => {});
  const dirty = loaded && !asset && contents !== savedContents;
  const filename = filenameFor(filePath);
  const language = languageFor(filePath);
  const workspaceName = useMemo(() => workspace.path.split(/[\\/]/).pop() || 'No folder open', [workspace.path]);
  const visibleEntries = useMemo(() => workspace.files.filter((entry) => {
    const parts = entry.relativePath.split(/[\\/]/);
    if (parts.length <= 1) return true;
    let parent = '';
    for (const part of parts.slice(0, -1)) {
      parent = parent ? `${parent}/${part}` : part;
      if (!expandedFolders.has(parent)) return false;
    }
    return true;
  }), [expandedFolders, workspace.files]);

  useEffect(() => setExpandedFolders(new Set()), [workspace.path]);

  const toggleFolder = (relativePath: string) => {
    const normalized = relativePath.replaceAll('\\', '/');
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(normalized)) next.delete(normalized);
      else next.add(normalized);
      return next;
    });
  };

  const rememberFile = useCallback((nextFilePath: string) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted().map((item: any) => item.id === element.id ? {
      ...item,
      customData: { ...item.customData, editorFilePath: nextFilePath, title: filenameFor(nextFilePath) || 'VS Code' },
    } : item);
    excalidrawAPI.updateScene({ elements });
  }, [element.id, excalidrawAPI]);

  useEffect(() => {
    if (!filePath) {
      setContents('');
      setSavedContents('');
      setLoaded(false);
      return;
    }
    let active = true;
    setLoaded(false);
    setAsset(null);
    setStatus('Opening…');
    const request: Promise<string | { dataUrl: string; mime: string; size: number }> | undefined = isImageFile(filePath)
      ? window.padDesktop?.workspace.readAsset(filePath)
      : window.padDesktop?.workspace.read(filePath);
    request?.then((value) => {
      if (!active) return;
      if (typeof value === 'string') {
        setContents(value);
        setSavedContents(value);
      } else {
        setContents('');
        setSavedContents('');
        setAsset(value);
      }
      setLoaded(true);
      setStatus('');
      rememberFile(filePath);
    }).catch((error) => {
      if (!active) return;
      setStatus(error.message);
      setFilePath('');
      rememberFile('');
    });
    return () => { active = false; };
  }, [filePath, rememberFile]);

  const save = useCallback(async () => {
    if (!filePath || !loaded || contents === savedContents) return;
    try {
      setStatus('Saving…');
      await window.padDesktop?.workspace.write(filePath, contents);
      setSavedContents(contents);
      setStatus('Saved');
      window.setTimeout(() => setStatus(''), 900);
    } catch (error: any) { setStatus(error.message); }
  }, [contents, filePath, loaded, savedContents]);
  saveRef.current = () => { void save(); };

  useEffect(() => {
    if (!dirty) return;
    setStatus('Autosaving…');
    const timer = window.setTimeout(() => { void save(); }, 700);
    return () => window.clearTimeout(timer);
  }, [dirty, contents, save]);

  const createFile = async () => {
    const created = await onCreateFile();
    if (created) setFilePath(created);
  };

  const chooseWorkspace = async () => {
    const next = await onChooseWorkspace();
    if (next) {
      setFilePath('');
      rememberFile('');
    }
  };

  const openInVSCode = async () => {
    const result = await window.padDesktop?.workspace.openInVSCode(filePath || workspace.path);
    if (!result) return;
    setStatus(result.message);
    window.setTimeout(() => setStatus(''), 1800);
  };

  return (
    <section className="embedded-editor">
      <header className="mac-titlebar window-drag-handle" onPointerDown={onDragStart}>
        <div className="traffic-lights" aria-label="Window controls">
          <button className="traffic-light close" onClick={onClose} title="Close VS Code" />
        </div>
        <span className="window-title">{filePath ? `${filename}${dirty ? ' •' : ''}` : 'VS Code'}</span>
        <div className="titlebar-actions">
          <button onClick={() => setExplorerOpen((value) => !value)} title="Toggle Explorer"><PanelLeft size={14} /></button>
          <button onClick={createFile} title="New file"><Plus size={15} /></button>
          <button onClick={chooseWorkspace} title="Open folder"><FolderOpen size={14} /></button>
          <button onClick={openInVSCode} disabled={!workspace.path} title="Open in desktop VS Code with your extensions"><ExternalLink size={14} /></button>
          <button onClick={() => void save()} disabled={!dirty} title="Save"><Save size={14} /></button>
        </div>
      </header>

      <div className="vscode-body">
        {explorerOpen && (
          <aside className="vscode-explorer">
            <header><span>Explorer</span><button onClick={onRefreshWorkspace} disabled={!workspace.path} title="Refresh"><RefreshCw size={12} /></button></header>
            <button className="workspace-root" onClick={chooseWorkspace} title={workspace.path || 'Open folder'}>
              <ChevronRight size={12} /><strong>{workspaceName}</strong>
            </button>
            <div className="vscode-files">
              {visibleEntries.map((entry) => {
                const folderKey = entry.relativePath.replaceAll('\\', '/');
                const expanded = expandedFolders.has(folderKey);
                return (
                <button
                  key={entry.path}
                  className={`vscode-file ${filePath === entry.path ? 'active' : ''}`}
                  style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                  onClick={() => entry.type === 'directory' ? toggleFolder(entry.relativePath) : setFilePath(entry.path)}
                  title={entry.relativePath}
                >
                  {entry.type === 'directory' && <ChevronRight className={`folder-chevron ${expanded ? 'expanded' : ''}`} size={12} />}
                  {entry.type === 'directory' ? <Folder size={13} /> : isImageFile(entry.path) ? <ImageIcon size={13} /> : <FileCode2 size={13} />}
                  <span>{entry.name}</span>
                </button>
              );})}
            </div>
          </aside>
        )}

        <div className="vscode-editor-area">
          {filePath ? (
            <>
              <div className="vscode-tab">{asset ? <ImageIcon size={13} /> : <FileCode2 size={13} />}<span>{filename}</span>{dirty && <i />}</div>
              {asset ? (
                <div className="vscode-image-preview">
                  <div className="image-stage"><img src={asset.dataUrl} alt={filename} /></div>
                  <div className="image-details"><strong>{filename}</strong><span>{asset.mime.replace('image/', '').toUpperCase()} · {formatBytes(asset.size)}</span></div>
                </div>
              ) : (
                <div className="vscode-monaco">
                  <Editor
                    path={filePath}
                    theme="vs-dark"
                    language={language}
                    value={contents}
                    onChange={(next) => setContents(next || '')}
                    onMount={(editor, monaco) => {
                      editor.focus();
                      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                      editor.onDidChangeCursorPosition(({ position }) => setCursor({ line: position.lineNumber, column: position.column }));
                    }}
                    loading={<div className="editor-loading">Opening {filename}…</div>}
                    options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 12 }, smoothScrolling: true }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="vscode-welcome">
              <div className="vscode-mark"><CodeMark /></div>
              <h2>Start coding</h2>
              <p>Open a folder, then create or select a file. Language support follows the filename automatically.</p>
              <div><button onClick={chooseWorkspace}><FolderOpen size={15} /> Open Folder</button><button onClick={createFile}><Plus size={15} /> New File</button></div>
            </div>
          )}
          <footer className="vscode-statusbar">
            <span>{status || (workspace.path ? workspaceName : 'Open a folder to begin')}</span>
            <span>{filePath && !asset && `Ln ${cursor.line}, Col ${cursor.column}`}</span>
            <span>{filePath && (asset ? 'image preview' : language)}</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CodeMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 2 8.8 10.1 4.2 6.7 2 8.8l4.7 3.2L2 15.2l2.2 2.1 4.6-3.4 8.7 8.1 4.5-2.2V4.2L17.5 2Zm0 5.7v8.6L12 12l5.5-4.3Z" /></svg>;
}
