import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import { initializeVSCodeServices } from './monacoSetup';

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

const workspaceName = (path: string) => path.split(/[\\/]/).pop() || 'No folder open';

export function EmbeddedEditor({
  workspace,
  onChooseWorkspace,
  onClose,
  onDragStart,
}: EmbeddedEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string>('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initializeVSCodeServices(workspace.path)
      .then(() => {
        if (cancelled) return;
        const container = (window as any).__vscodeWorkbenchContainer as HTMLElement | undefined;
        if (!container) {
          setError('VS Code workbench container was never created.');
          return;
        }
        if (hostRef.current && container.parentElement !== hostRef.current) {
          hostRef.current.appendChild(container);
        }
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || String(err));
      });
    return () => { cancelled = true; };
  }, [workspace.path]);

  return (
    <section className="embedded-editor embedded-editor--workbench">
      <header className="mac-titlebar window-drag-handle" onPointerDown={onDragStart}>
        <div className="traffic-lights" aria-label="Window controls">
          <button className="traffic-light close" onClick={onClose} title="Close VS Code" aria-label="Close VS Code">×</button>
        </div>
        <span className="window-title">{ready ? workspaceName(workspace.path) : 'Loading VS Code…'}</span>
        <div className="titlebar-actions">
          <button onClick={() => void onChooseWorkspace()} title="Open folder"><FolderOpen size={14} /></button>
          <button
            onClick={() => void window.padDesktop?.workspace.openInVSCode(workspace.path)}
            disabled={!workspace.path}
            title="Open in desktop VS Code with your extensions"
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </header>

      <div className="vscode-body vscode-body--workbench">
        {error ? (
          <div className="vscode-error">
            <strong>VS Code failed to start</strong>
            <pre>{error}</pre>
          </div>
        ) : null}
        <div ref={hostRef} className="vscode-workbench-host" />
      </div>
    </section>
  );
}
