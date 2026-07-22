import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import { ChevronRight, FileCode2, Folder, FolderOpen, PanelLeft, Plus, RefreshCw, Save } from 'lucide-react';
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

interface EmbeddedEditorProps {
  element: any;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  workspace: WorkspaceSnapshot;
  onChooseWorkspace(): Promise<WorkspaceSnapshot | null>;
  onCreateFile(): Promise<string | null>;
  onRefreshWorkspace(): Promise<void>;
  onClose(): void;
}

export function EmbeddedEditor({
  element,
  excalidrawAPI,
  workspace,
  onChooseWorkspace,
  onCreateFile,
  onRefreshWorkspace,
  onClose,
}: EmbeddedEditorProps) {
  const [filePath, setFilePath] = useState<string>(() => element.customData?.editorFilePath || '');
  const [contents, setContents] = useState('');
  const [savedContents, setSavedContents] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const saveRef = useRef<() => void>(() => {});
  const dirty = loaded && contents !== savedContents;
  const filename = filenameFor(filePath);
  const language = languageFor(filePath);
  const workspaceName = useMemo(() => workspace.path.split(/[\\/]/).pop() || 'No folder open', [workspace.path]);

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
    setStatus('Opening…');
    window.padDesktop?.workspace.read(filePath).then((value) => {
      if (!active) return;
      setContents(value);
      setSavedContents(value);
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

  return (
    <section className="embedded-editor">
      <header className="mac-titlebar">
        <div className="traffic-lights" aria-label="Window controls">
          <button className="traffic-light close" onClick={onClose} title="Close VS Code" />
          <span className="traffic-light minimize" />
          <span className="traffic-light maximize" />
        </div>
        <span className="window-title">{filePath ? `${filename}${dirty ? ' •' : ''}` : 'VS Code'}</span>
        <div className="titlebar-actions">
          <button onClick={() => setExplorerOpen((value) => !value)} title="Toggle Explorer"><PanelLeft size={14} /></button>
          <button onClick={createFile} title="New file"><Plus size={15} /></button>
          <button onClick={chooseWorkspace} title="Open folder"><FolderOpen size={14} /></button>
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
              {workspace.files.map((entry) => (
                <button
                  key={entry.path}
                  className={`vscode-file ${filePath === entry.path ? 'active' : ''}`}
                  style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                  disabled={entry.type === 'directory'}
                  onClick={() => entry.type === 'file' && setFilePath(entry.path)}
                  title={entry.relativePath}
                >
                  {entry.type === 'directory' ? <Folder size={13} /> : <FileCode2 size={13} />}
                  <span>{entry.name}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        <div className="vscode-editor-area">
          {filePath ? (
            <>
              <div className="vscode-tab"><FileCode2 size={13} /><span>{filename}</span>{dirty && <i />}</div>
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
            <span>{filePath && `Ln ${cursor.line}, Col ${cursor.column}`}</span>
            <span>{filePath && language}</span>
          </footer>
        </div>
      </div>
    </section>
  );
}

function CodeMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 2 8.8 10.1 4.2 6.7 2 8.8l4.7 3.2L2 15.2l2.2 2.1 4.6-3.4 8.7 8.1 4.5-2.2V4.2L17.5 2Zm0 5.7v8.6L12 12l5.5-4.3Z" /></svg>;
}
