import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { initialize } from '@codingame/monaco-vscode-api';
import getConfigurationServiceOverride, { initUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override';
import getKeybindingsServiceOverride, { initUserKeybindings } from '@codingame/monaco-vscode-keybindings-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import getFilesServiceOverride, {
  registerFileSystemOverlay,
} from '@codingame/monaco-vscode-files-service-override';
import getExtensionsServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getExtensionGalleryServiceOverride from '@codingame/monaco-vscode-extension-gallery-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';
import getBaseServiceOverride from '@codingame/monaco-vscode-base-service-override';
import getEnvironmentServiceOverride from '@codingame/monaco-vscode-environment-service-override';
import getStorageServiceOverride from '@codingame/monaco-vscode-storage-service-override';
import getModelServiceOverride from '@codingame/monaco-vscode-model-service-override';
import getNotificationsServiceOverride from '@codingame/monaco-vscode-notifications-service-override';
import getDialogsServiceOverride from '@codingame/monaco-vscode-dialogs-service-override';
import getTextmateServiceOverride from '@codingame/monaco-vscode-textmate-service-override';
import getTreesitterServiceOverride from '@codingame/monaco-vscode-treesitter-service-override';
import getLanguagesServiceOverride from '@codingame/monaco-vscode-languages-service-override';
import getPreferencesServiceOverride from '@codingame/monaco-vscode-preferences-service-override';
import getOutputServiceOverride from '@codingame/monaco-vscode-output-service-override';
import getMarkersServiceOverride from '@codingame/monaco-vscode-markers-service-override';
import getExplorerServiceOverride from '@codingame/monaco-vscode-explorer-service-override';
import getSearchServiceOverride from '@codingame/monaco-vscode-search-service-override';
import getAccessibilityServiceOverride from '@codingame/monaco-vscode-accessibility-service-override';
import getLifecycleServiceOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLogServiceOverride from '@codingame/monaco-vscode-log-service-override';
import getWorkingCopyServiceOverride from '@codingame/monaco-vscode-working-copy-service-override';
import getWorkbenchServiceOverride from '@codingame/monaco-vscode-workbench-service-override';
import getViewsServiceOverride from '@codingame/monaco-vscode-views-service-override';
import getWelcomeServiceOverride from '@codingame/monaco-vscode-welcome-service-override';
import getWalkthroughServiceOverride from '@codingame/monaco-vscode-walkthrough-service-override';

// Default VS Code extensions (grammars, themes). Side-effect imports — they
// register themselves with the extension services on load. Must come BEFORE
// initialize() so the bundled manifest is visible to the extension scanner.
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import '@codingame/monaco-vscode-markdown-basics-default-extension';
import '@codingame/monaco-vscode-javascript-default-extension';
import '@codingame/monaco-vscode-typescript-basics-default-extension';
import '@codingame/monaco-vscode-json-default-extension';
import '@codingame/monaco-vscode-css-default-extension';
import '@codingame/monaco-vscode-html-default-extension';
import '@codingame/monaco-vscode-python-default-extension';
import '@codingame/monaco-vscode-shellscript-default-extension';

import 'vscode/localExtensionHost';

loader.config({ monaco });

const editorWorkerUrl = new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url);
const extensionHostWorkerUrl = new URL('@codingame/monaco-vscode-api/workers/extensionHost.worker', import.meta.url);
const textMateWorkerUrl = new URL('@codingame/monaco-vscode-textmate-service-override/worker', import.meta.url);
const outputLinkWorkerUrl = new URL('@codingame/monaco-vscode-output-service-override/worker', import.meta.url);
const languageDetectionWorkerUrl = new URL('@codingame/monaco-vscode-language-detection-worker-service-override/worker', import.meta.url);

const workers: Record<string, Worker> = {
  editorWorkerService: undefined as unknown as Worker,
  extensionHostWorkerMain: undefined as unknown as Worker,
  TextMateWorker: undefined as unknown as Worker,
  OutputLinkDetectionWorker: undefined as unknown as Worker,
  LanguageDetectionWorker: undefined as unknown as Worker,
};

const workerUrls: Record<string, string> = {
  editorWorkerService: editorWorkerUrl.toString(),
  extensionHostWorkerMain: extensionHostWorkerUrl.toString(),
  TextMateWorker: textMateWorkerUrl.toString(),
  OutputLinkDetectionWorker: outputLinkWorkerUrl.toString(),
  LanguageDetectionWorker: languageDetectionWorkerUrl.toString(),
};

window.MonacoEnvironment = {
  getWorker(_, label) {
    if (!workers[label]) {
      workers[label] = new Worker(workerUrls[label], { type: 'module' });
    }
    return workers[label];
  },
};

const defaultConfiguration = JSON.stringify({
  'workbench.colorTheme': 'Default Dark Modern',
  'workbench.tree.expandMode': 'singleClick',
  'editor.fontSize': 13,
  'editor.tabSize': 2,
  'editor.minimap.enabled': false,
  'editor.scrollBeyondLastLine': false,
  'files.autoSave': 'afterDelay',
  'files.autoSaveDelay': 700,
  'search.useIgnoreFiles': false,
  'terminal.integrated.defaultProfile.windows': 'Command Prompt',
}, null, 2);

const defaultKeybindings = JSON.stringify([
  { key: 'ctrl+s', command: 'workbench.action.files.save' },
  { key: 'ctrl+shift+p', command: 'workbench.action.showCommands' },
  { key: 'ctrl+p', command: 'workbench.action.quickOpen' },
], null, 2);

let ready: Promise<void> | undefined;

function uriFromPath(p: string) {
  // Normalize Windows drive letters: monaco.Uri.file expects leading slash on win32.
  return monaco.Uri.file(p);
}

/**
 * Register a filesystem overlay that delegates `file://` URIs to the host
 * Electron preload bridge (window.padDesktop.workspace.read/write). Entries
 * the host returns become visible to every VS Code service (explorer,
 * editor model references, search, etc.).
 */
function attachWorkspaceOverlay(workspacePath: string) {
  const imageExtensions = new Set(['avif','bmp','gif','ico','jpeg','jpg','png','svg','webp']);

  // We translate between monaco file:// URIs and the user-facing absolute paths
  // by stripping the leading slash on Windows (where file:///C:/x -> C:\x).
  const decode = (uri: monaco.Uri): string => {
    if (uri.scheme !== 'file') throw new Error(`Unsupported scheme: ${uri.scheme}`);
    let p = decodeURIComponent(uri.fsPath);
    return p;
  };

  // Event<T> shape Code OSS expects: a callable that registers a listener
  // and returns a Disposable. We never emit (host owns files), so no-op.
  const noopEvent = (_listener: any, _thisArgs?: any, _disposables?: any) => ({ dispose() {} }) as any;

  const provider = {
    capabilities: 0b10 /* Readonly */ | 0b100 /* FileReadWrite */,
    onDidChangeCapabilities: noopEvent,
    onDidChangeFile: noopEvent,
    async stat(_uri: monaco.Uri) {
      return {
        type: 1 /* FileType.File */,
        ctime: Date.now(),
        mtime: Date.now(),
        size: 0,
        permissions: 0,
      };
    },
    async readFile(uri: monaco.Uri) {
      const fsPath = decode(uri);
      const bridge = window.padDesktop?.workspace;
      if (!bridge) throw new Error('Workspace bridge unavailable');
      if (imageExtensions.has(fsPath.split('.').pop()?.toLowerCase() || '')) {
        const { dataUrl } = await bridge.readAsset(fsPath);
        const base64 = dataUrl.split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }
      const text = await bridge.read(fsPath);
      return new TextEncoder().encode(text);
    },
    async writeFile(uri: monaco.Uri, content: Uint8Array) {
      const fsPath = decode(uri);
      const bridge = window.padDesktop?.workspace;
      if (!bridge) throw new Error('Workspace bridge unavailable');
      const text = new TextDecoder().decode(content);
      await bridge.write(fsPath, text);
    },
    watch() { return { dispose() {} }; },
    async readdir() { return []; },
    async mkdir() { /* no-op: directories owned by the host machine */ },
    async delete() { /* unsupported */ },
    async rename() { /* unsupported */ },
  };

  registerFileSystemOverlay(1, provider as any);
}

export function initializeVSCodeServices(workspacePath?: string) {
  const container = document.createElement('div');
  container.style.height = '100%';
  container.style.width = '100%';
  // Code OSS renders the full workbench directly into this container. Caller
  // (EmbeddedEditor) transfers it into its layout; create here so initialize
  // can mount immediately even before React paints.

  ready ??= (async () => {
    if (workspacePath) attachWorkspaceOverlay(workspacePath);
    await Promise.all([
      initUserConfiguration(defaultConfiguration),
      initUserKeybindings(defaultKeybindings),
    ]);

    const constructionOptions = {
      productConfiguration: {
        nameShort: 'Pad Local',
        nameLong: 'Pad Local',
        extensionsGallery: {
          serviceUrl: 'https://open-vsx.org/vscode/gallery',
          resourceUrlTemplate: 'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}',
          extensionUrlTemplate: 'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',
          controlUrl: '',
          nlsBaseUrl: '',
        },
      },
      enableWorkspaceTrust: true,
      workspaceProvider: {
        trusted: true,
        async open() {
          window.open(window.location.href);
          return true;
        },
        workspace: workspacePath
          ? { folderUri: uriFromPath(workspacePath) }
          : { workspaceUri: monaco.Uri.from({ scheme: 'empty', path: '/' }) },
      },
      developmentOptions: {
        logLevel: 2 /* LogLevel.Info */,
      },
    } as const;

    await initialize(
      {
        ...getBaseServiceOverride(),
        ...getLogServiceOverride(),
        ...getLifecycleServiceOverride(),
        ...getEnvironmentServiceOverride(),
        ...getConfigurationServiceOverride(),
        ...getKeybindingsServiceOverride(),
        ...getThemeServiceOverride(),
        ...getLanguagesServiceOverride(),
        ...getTextmateServiceOverride(),
        ...getTreesitterServiceOverride(),
        ...getFilesServiceOverride(),
        ...getWorkingCopyServiceOverride(),
        ...getModelServiceOverride(),
        ...getNotificationsServiceOverride(),
        ...getDialogsServiceOverride(),
        ...getPreferencesServiceOverride(),
        ...getOutputServiceOverride(),
        ...getMarkersServiceOverride(),
        ...getAccessibilityServiceOverride(),
        ...getViewsServiceOverride(),
        ...getExplorerServiceOverride(),
        ...getSearchServiceOverride(),
        ...getWelcomeServiceOverride(),
        ...getWalkthroughServiceOverride(),
        ...getQuickAccessServiceOverride({ isKeybindingConfigurationVisible: () => true, shouldUseGlobalPicker: () => true }),
        ...getExtensionsServiceOverride({ enableWorkerExtensionHost: true }),
        ...getExtensionGalleryServiceOverride({ webOnly: true }),
        ...getWorkbenchServiceOverride(),
        ...getStorageServiceOverride(),
      } as any,
      container,
      constructionOptions as any,
    ).then(() => undefined, (error) => {
      console.error('[monaco-vscode] initialize failed:', error);
      throw error;
    });

    // Expose the container so EmbeddedEditor can mount it into the React tree.
    (window as any).__vscodeWorkbenchContainer = container;
  })();
  return ready;
}
