const STATE_KEY = 'pad-local-desktop-state-v1';

const blankScene = (): LocalScene => ({
  elements: [],
  appState: { theme: 'dark', gridModeEnabled: true, gridSize: 20, gridStep: 5 },
  files: {},
});

type BrowserState = { pads: LocalPad[]; activePadId: string };

function browserState(): BrowserState {
  const stored = localStorage.getItem(STATE_KEY);
  if (stored) return JSON.parse(stored);
  const now = new Date().toISOString();
  const pad = { id: crypto.randomUUID(), title: 'Welcome', createdAt: now, updatedAt: now };
  const state = { pads: [pad], activePadId: pad.id };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  localStorage.setItem(`${STATE_KEY}:scene:${pad.id}`, JSON.stringify(blankScene()));
  return state;
}

function saveBrowserState(state: BrowserState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export const desktopApi = {
  isDesktop: Boolean(window.padDesktop),
  async listPads() {
    return window.padDesktop ? window.padDesktop.pads.list() : browserState();
  },
  async loadPad(id: string): Promise<LocalScene> {
    if (window.padDesktop) return window.padDesktop.pads.load(id);
    const stored = localStorage.getItem(`${STATE_KEY}:scene:${id}`);
    return stored ? JSON.parse(stored) : blankScene();
  },
  async createPad(title = 'Untitled') {
    if (window.padDesktop) return window.padDesktop.pads.create(title);
    const state = browserState();
    const now = new Date().toISOString();
    const pad = { id: crypto.randomUUID(), title, createdAt: now, updatedAt: now };
    state.pads.push(pad);
    state.activePadId = pad.id;
    saveBrowserState(state);
    localStorage.setItem(`${STATE_KEY}:scene:${pad.id}`, JSON.stringify(blankScene()));
    return pad;
  },
  async savePad(id: string, scene: LocalScene) {
    if (window.padDesktop) return window.padDesktop.pads.save(id, scene);
    const state = browserState();
    state.activePadId = id;
    const pad = state.pads.find((item) => item.id === id);
    if (pad) pad.updatedAt = new Date().toISOString();
    saveBrowserState(state);
    localStorage.setItem(`${STATE_KEY}:scene:${id}`, JSON.stringify(scene));
    return true;
  },
  async renamePad(id: string, title: string) {
    if (window.padDesktop) return window.padDesktop.pads.rename(id, title);
    const state = browserState();
    const pad = state.pads.find((item) => item.id === id)!;
    pad.title = title;
    pad.updatedAt = new Date().toISOString();
    saveBrowserState(state);
    return pad;
  },
  async deletePad(id: string) {
    if (window.padDesktop) return window.padDesktop.pads.delete(id);
    const state = browserState();
    if (state.pads.length <= 1) throw new Error('Keep at least one pad.');
    state.pads = state.pads.filter((item) => item.id !== id);
    if (state.activePadId === id) state.activePadId = state.pads[0].id;
    saveBrowserState(state);
    localStorage.removeItem(`${STATE_KEY}:scene:${id}`);
    return state.activePadId;
  },
  async activatePad(id: string) {
    if (window.padDesktop) return window.padDesktop.pads.activate(id);
    const state = browserState();
    state.activePadId = id;
    saveBrowserState(state);
    return true;
  },
  workspace: window.padDesktop?.workspace,
  terminal: window.padDesktop?.terminal,
};
