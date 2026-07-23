import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { initialize } from '@codingame/monaco-vscode-api';
import getConfigurationServiceOverride from '@codingame/monaco-vscode-configuration-service-override';
import getExtensionsServiceOverride from '@codingame/monaco-vscode-extensions-service-override';
import getExtensionGalleryServiceOverride from '@codingame/monaco-vscode-extension-gallery-service-override';
import getFilesServiceOverride from '@codingame/monaco-vscode-files-service-override';
import getKeybindingsServiceOverride from '@codingame/monaco-vscode-keybindings-service-override';
import getQuickAccessServiceOverride from '@codingame/monaco-vscode-quickaccess-service-override';
import getThemeServiceOverride from '@codingame/monaco-vscode-theme-service-override';
import 'vscode/localExtensionHost';

loader.config({ monaco });

const editorWorkerUrl = new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url);
const extensionHostWorkerUrl = new URL('@codingame/monaco-vscode-api/workers/extensionHost.worker', import.meta.url);
window.MonacoEnvironment = {
  getWorkerUrl(_moduleId, label) {
    return (label === 'extensionHostWorkerMain' ? extensionHostWorkerUrl : editorWorkerUrl).toString();
  },
  getWorkerOptions() {
    return { type: 'module' };
  },
};

let ready: Promise<void> | undefined;

export function initializeVSCodeServices() {
  ready ??= initialize({
    ...getConfigurationServiceOverride(),
    ...getExtensionsServiceOverride({ enableWorkerExtensionHost: true }),
    ...getExtensionGalleryServiceOverride({ webOnly: true }),
    ...getFilesServiceOverride(),
    ...getKeybindingsServiceOverride(),
    ...getQuickAccessServiceOverride(),
    ...getThemeServiceOverride(),
  }, document.body, {
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
  }).then(() => undefined, (error) => {
    console.error('[monaco-vscode] initialize failed:', error);
    throw error;
  });
  return ready;
}
