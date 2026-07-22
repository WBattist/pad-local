import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FolderOpen, Save, X } from 'lucide-react';

const languageFor = (filePath: string) => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml', ps1: 'powershell', sh: 'shell' } as Record<string, string>)[extension || ''] || 'plaintext';
};

export function FileEditor({ filePath, onClose }: { filePath: string; onClose(): void }) {
  const [contents, setContents] = useState('');
  const [savedContents, setSavedContents] = useState('');
  const [status, setStatus] = useState('Loading…');
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const latestContents = useRef('');
  const latestSavedContents = useRef('');
  const dirty = contents !== savedContents;
  const filename = useMemo(() => filePath.split(/[\\/]/).pop() || filePath, [filePath]);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    loadedRef.current = false;
    setStatus('Loading…');
    window.padDesktop?.workspace.read(filePath).then((value) => {
      if (!active) return;
      setContents(value);
      setSavedContents(value);
      latestContents.current = value;
      latestSavedContents.current = value;
      setLoaded(true);
      loadedRef.current = true;
      setStatus('');
    }).catch((error) => setStatus(error.message));
    return () => { active = false; };
  }, [filePath]);

  const save = async () => {
    if (!loadedRef.current) return;
    try {
      setStatus('Saving…');
      const value = latestContents.current;
      await window.padDesktop?.workspace.write(filePath, value);
      latestSavedContents.current = value;
      setSavedContents(value);
      setStatus('Saved');
      window.setTimeout(() => setStatus(''), 1200);
    } catch (error: any) { setStatus(error.message); }
  };

  useEffect(() => {
    latestContents.current = contents;
    latestSavedContents.current = savedContents;
    if (!loaded || contents === savedContents) return;
    setStatus('Autosaving…');
    const timer = window.setTimeout(() => { void save(); }, 800);
    return () => window.clearTimeout(timer);
  }, [contents, savedContents, loaded]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      if (latestContents.current !== latestSavedContents.current) {
        void window.padDesktop?.workspace.write(filePath, latestContents.current);
      }
    };
  }, [filePath]);

  return (
    <section className="file-editor">
      <header>
        <span className="file-editor-name">{filename}{dirty ? ' •' : ''}</span>
        <span className="file-editor-status">{status}</span>
        <button onClick={() => window.padDesktop?.workspace.reveal(filePath)} title="Show in folder"><FolderOpen size={15} /></button>
        <button onClick={save} disabled={!dirty} title="Save"><Save size={15} /></button>
        <button onClick={onClose} title="Close"><X size={16} /></button>
      </header>
      <Editor
        theme="vs-dark"
        language={languageFor(filePath)}
        value={contents}
        onChange={(value) => setContents(value || '')}
        options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true, scrollBeyondLastLine: false }}
      />
    </section>
  );
}
