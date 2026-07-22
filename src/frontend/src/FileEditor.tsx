import { useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Save, X } from 'lucide-react';

const languageFor = (filePath: string) => {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return ({ ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html', yml: 'yaml', yaml: 'yaml', ps1: 'powershell', sh: 'shell' } as Record<string, string>)[extension || ''] || 'plaintext';
};

export function FileEditor({ filePath, onClose }: { filePath: string; onClose(): void }) {
  const [contents, setContents] = useState('');
  const [savedContents, setSavedContents] = useState('');
  const [status, setStatus] = useState('Loading…');
  const dirty = contents !== savedContents;
  const filename = useMemo(() => filePath.split(/[\\/]/).pop() || filePath, [filePath]);

  useEffect(() => {
    let active = true;
    setStatus('Loading…');
    window.padDesktop?.workspace.read(filePath).then((value) => {
      if (!active) return;
      setContents(value);
      setSavedContents(value);
      setStatus('');
    }).catch((error) => setStatus(error.message));
    return () => { active = false; };
  }, [filePath]);

  const save = async () => {
    await window.padDesktop?.workspace.write(filePath, contents);
    setSavedContents(contents);
    setStatus('Saved');
    window.setTimeout(() => setStatus(''), 1200);
  };

  return (
    <section className="file-editor">
      <header>
        <span className="file-editor-name">{filename}{dirty ? ' •' : ''}</span>
        <span className="file-editor-status">{status}</span>
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
