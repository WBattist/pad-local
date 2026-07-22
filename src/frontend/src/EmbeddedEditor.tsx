import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { ExcalidrawImperativeAPI } from '@atyrode/excalidraw/types';
import './monacoSetup';

const languages = ['plaintext', 'typescript', 'javascript', 'python', 'html', 'css', 'json', 'markdown', 'powershell', 'shell'];

export function EmbeddedEditor({ element, excalidrawAPI }: { element: any; excalidrawAPI: ExcalidrawImperativeAPI | null }) {
  const [value, setValue] = useState(() => element.customData?.editorContent || '');
  const [language, setLanguage] = useState(() => element.customData?.editorLanguage || 'typescript');
  const current = useRef({ value, language });
  current.current = { value, language };

  const save = useCallback(() => {
    if (!excalidrawAPI) return;
    const { value: editorContent, language: editorLanguage } = current.current;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted().map((item: any) => item.id === element.id ? {
      ...item,
      customData: { ...item.customData, editorContent, editorLanguage, title: 'VS Code' },
    } : item);
    excalidrawAPI.updateScene({ elements });
  }, [element.id, excalidrawAPI]);

  useEffect(() => {
    const timer = window.setTimeout(save, 700);
    return () => window.clearTimeout(timer);
  }, [value, language, save]);

  useEffect(() => () => save(), [save]);

  return (
    <section className="embedded-editor">
      <header>
        <strong>VS Code</strong>
        <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Editor language">
          {languages.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </header>
      <Editor
        theme="vs-dark"
        language={language}
        value={value}
        onChange={(next) => setValue(next || '')}
        loading={<div className="editor-loading">Loading editor…</div>}
        options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 10 } }}
      />
    </section>
  );
}
