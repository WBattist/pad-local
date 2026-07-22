import { FilePlus2, Trash2 } from 'lucide-react';

interface CanvasTabsProps {
  pads: LocalPad[];
  activePadId: string;
  saving: boolean;
  onSelect(id: string): void;
  onCreate(): void;
  onRename(pad: LocalPad): void;
  onDelete(pad: LocalPad): void;
}

export function CanvasTabs({ pads, activePadId, saving, onSelect, onCreate, onRename, onDelete }: CanvasTabsProps) {
  return (
    <div className="canvas-tabs">
      <button className="new-pad" onClick={onCreate} title="New pad"><FilePlus2 size={18} /></button>
      <div className="canvas-tabs-scroll">
        {pads.map((pad, index) => (
          <div className={`canvas-tab ${pad.id === activePadId ? 'active' : ''}`} key={pad.id}>
            <button className="canvas-tab-title" onClick={() => onSelect(pad.id)} onDoubleClick={() => onRename(pad)} title={`${pad.title} · double-click to rename`}>
              <span>{pad.title}</span><small>{index + 1}</small>
            </button>
            {pads.length > 1 && <button className="canvas-tab-delete" onClick={() => onDelete(pad)} title={`Delete ${pad.title}`}><Trash2 size={12} /></button>}
          </div>
        ))}
      </div>
      <span className={`local-save-state ${saving ? 'saving' : ''}`}>{saving ? 'Saving…' : 'Local'}</span>
    </div>
  );
}
