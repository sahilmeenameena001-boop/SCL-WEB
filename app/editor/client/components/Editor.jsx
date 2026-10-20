import { FileText, ImageIcon, Layers, Palette, Plus } from 'lucide-react';
import { useStore, setState } from '../store.js';
import { TopBar } from './TopBar.jsx';
import { Canvas } from './Canvas.jsx';
import { Inspector } from './inspector/Inspector.jsx';
import { LayersPanel } from './panels/LayersPanel.jsx';
import { AddPanel } from './panels/AddPanel.jsx';
import { AssetsPanel } from './panels/AssetsPanel.jsx';
import { PagesPanel } from './panels/PagesPanel.jsx';
import { ThemePanel } from './panels/ThemePanel.jsx';
import { cn } from './ui.jsx';

const PANELS = [
  { id: 'layers', label: 'Layers', icon: Layers, Component: LayersPanel },
  { id: 'add', label: 'Add', icon: Plus, Component: AddPanel },
  { id: 'assets', label: 'Assets', icon: ImageIcon, Component: AssetsPanel },
  { id: 'pages', label: 'Pages', icon: FileText, Component: PagesPanel },
  { id: 'theme', label: 'Theme', icon: Palette, Component: ThemePanel },
];

export function Editor() {
  const leftTab = useStore((s) => s.leftTab);
  const hasData = useStore((s) => !!s.data);
  if (!hasData) return null;
  const Panel = PANELS.find((p) => p.id === leftTab)?.Component || LayersPanel;
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-zinc-200 bg-white py-2" aria-label="Panels">
          {PANELS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setState({ leftTab: id })}
              aria-pressed={leftTab === id}
              className={cn('flex w-12 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900', leftTab === id && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-zinc-200 bg-white" aria-label={leftTab}>
          <Panel />
        </aside>
        <Canvas />
        <Inspector />
      </div>
    </div>
  );
}

export function PanelHeader({ title, children }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-zinc-100 px-3">
      <h2 className="flex-1 text-[13px] font-semibold">{title}</h2>
      {children}
    </div>
  );
}
