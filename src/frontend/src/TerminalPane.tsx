import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalPane({ workspacePath, embedded = false, onClose, onDragStart }: { workspacePath: string; embedded?: boolean; onClose?: () => void; onDragStart?: (event: ReactPointerEvent<HTMLElement>) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const processIdRef = useRef('');
  const [status, setStatus] = useState('Starting terminal…');

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
    const focusTerminal = (event: PointerEvent) => {
      event.stopPropagation();
      terminal.focus();
      terminal.textarea?.focus({ preventScroll: true });
    };
    host.addEventListener('pointerdown', focusTerminal);
    let disposed = false;
    const removeDataListener = api.onData(({ id, data }) => {
      if (id === processIdRef.current) terminal.write(data);
    });
    api.start(workspacePath || undefined).then(({ id, cwd }) => {
      if (disposed) return api.kill(id);
      processIdRef.current = id;
      setStatus(cwd);
      fit.fit();
      void api.resize(id, terminal.cols, terminal.rows);
      terminal.focus();
    }).catch((error) => setStatus(error.message));
    const input = terminal.onData((data) => {
      if (processIdRef.current) api.write(processIdRef.current, data);
    });
    const resize = new ResizeObserver(() => {
      fit.fit();
      if (processIdRef.current) void api.resize(processIdRef.current, terminal.cols, terminal.rows);
    });
    resize.observe(host);
    return () => {
      disposed = true;
      input.dispose();
      resize.disconnect();
      removeDataListener();
      host.removeEventListener('pointerdown', focusTerminal);
      if (processIdRef.current) api.kill(processIdRef.current);
      terminal.dispose();
    };
  }, [workspacePath]);

  return (
    <section className={`terminal-pane ${embedded ? 'embedded' : ''}`}>
      <header className="mac-titlebar window-drag-handle" onPointerDown={onDragStart}>
        <div className="traffic-lights" aria-label="Window controls">
          <button className="traffic-light close" onClick={onClose} title="Close Terminal" />
        </div>
        <span className="window-title">Terminal</span>
        <span className="terminal-cwd">{status}</span>
      </header>
      <div ref={hostRef} className="terminal-host" />
    </section>
  );
}
