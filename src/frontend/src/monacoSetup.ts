import { loader } from '@monaco-editor/react';

loader.config({
  paths: {
    vs: new URL('./assets/monaco/vs', window.location.href).href,
  },
});
