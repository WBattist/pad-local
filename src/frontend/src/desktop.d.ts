export {};

declare global {
  interface Window {
    padDesktop?: {
      info(): Promise<{ version: string; dataPath: string; platform: string }>;
      openData(): Promise<string>;
      backup: {
        export(): Promise<string | null>;
        import(): Promise<{ pads: LocalPad[]; activePadId: string } | null>;
      };
      pads: {
        list(): Promise<{ pads: LocalPad[]; activePadId: string }>;
        load(id: string): Promise<LocalScene>;
        create(title?: string): Promise<LocalPad>;
        save(id: string, scene: LocalScene): Promise<boolean>;
        rename(id: string, title: string): Promise<LocalPad>;
        delete(id: string): Promise<string>;
        activate(id: string): Promise<boolean>;
      };
      workspace: {
        get(): Promise<WorkspaceSnapshot>;
        choose(): Promise<WorkspaceSnapshot | null>;
        refresh(): Promise<WorkspaceSnapshot>;
        createFile(): Promise<{ filePath: string; workspace: WorkspaceSnapshot } | null>;
        read(path: string): Promise<string>;
        write(path: string, contents: string): Promise<boolean>;
        reveal(path: string): Promise<void>;
        onChanged(callback: (workspace: WorkspaceSnapshot) => void): () => void;
      };
      terminal: {
        start(cwd?: string): Promise<{ id: string; cwd: string }>;
        write(id: string, data: string): Promise<boolean>;
        kill(id: string): Promise<boolean>;
        onData(callback: (payload: { id: string; data: string }) => void): () => void;
      };
    };
  }

  interface LocalPad {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
  }

  interface LocalScene {
    elements: readonly unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
  }

  interface WorkspaceEntry {
    name: string;
    path: string;
    relativePath: string;
    type: 'file' | 'directory';
    depth: number;
  }

  interface WorkspaceSnapshot {
    path: string;
    files: WorkspaceEntry[];
  }
}
