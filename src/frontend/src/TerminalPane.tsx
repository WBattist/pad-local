import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalPane({ workspacePath }: { workspacePath: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal>();
  const processIdRef = useRef('');
  const [status, setStatus] = useState('Starting PowerShell…');

  useEffect(() => {
    const api = window.padDesktop?.terminal;
    const host = hostRef.current;
    if (!host || !api) {
      setStatus('The terminal is available in the installed desktop app.');
      return;
    }
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 13,
      theme: { background: '#0d0f13', foreground: '#d7dce5', cursor: '#78a9ff' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();
    terminalRef.current = terminal;
    let disposed = false;
    const removeDataListener = api.onData(({ id, data }) => {
      if (id === processIdRef.current) terminal.write(data);
    });
    api.start(workspacePath || undefined).then(({ id, cwd }) => {
      if (disposed) return api.kill(id);
      processIdRef.current = id;
      setStatus(cwd);
      terminal.focus();
    }).catch((error) => setStatus(error.message));
    const input = terminal.onData((data) => {
      if (processIdRef.current) api.write(processIdRef.current, data);
    });
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(host);
    return () => {
      disposed = true;
      input.dispose();
      resize.disconnect();
      removeDataListener();
      if (processIdRef.current) api.kill(processIdRef.current);
      terminal.dispose();
    };
  }, [workspacePath]);

  return (
    <section className="terminal-pane">
      <header><span>Terminal</span><span className="terminal-cwd">{status}</span></header>
      <div ref={hostRef} className="terminal-host" />
    </section>
  );
}
