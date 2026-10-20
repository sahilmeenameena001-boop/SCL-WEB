import { useMemo } from 'react';
import { MousePointer2 } from 'lucide-react';
import { useStore, setState, currentPage } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { elementLabel } from '../../lib/labels.js';
import { selectNode } from '../../actions.js';
import { PageSettings } from '../panels/PagesPanel.jsx';
import { Badge, Tabs } from '../ui.jsx';
import { ContentTab } from './ContentTab.jsx';
import { StyleTab } from './StyleTab.jsx';
import { AnimateTab } from './AnimateTab.jsx';
import { AdvancedTab } from './AdvancedTab.jsx';

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'style', label: 'Style' },
  { id: 'animate', label: 'Animate' },
  { id: 'advanced', label: 'Advanced' },
];

export function Inspector() {
  const selectedId = useStore((s) => s.selectedId);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const version = useStore((s) => s.previewVersion);
  const tab = useStore((s) => s.rightTab);
  const node = preview.selectedNode;
  const info = useMemo(() => preview.describe(node), [selectedId, selectedIndex, version, node]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-zinc-200 bg-white" aria-label="Inspector">
      {!info ? (
        <NoSelection />
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-zinc-100 px-3 pt-2.5 pb-2">
            <Breadcrumbs node={node} />
            <div className="flex items-center gap-1.5">
              <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{elementLabel({ tag: info.tag, classes: info.classes, isSection: info.isSection, sectionType: info.sectionType })}</h2>
              {info.repeated && (
                <Badge tone="indigo" title="This element is repeated (list items share markup and styles)">
                  repeated
                </Badge>
              )}
              <Badge title="Element id (data-sb)">{info.id}</Badge>
            </div>
            <Tabs tabs={TABS} value={tab} onChange={(t) => setState({ rightTab: t })} />
          </div>
          <div className="sb-scroll min-h-0 flex-1 overflow-auto" key={`${info.id}#${info.index}`}>
            {tab === 'content' && <ContentTab info={info} node={node} />}
            {tab === 'style' && <StyleTab info={info} node={node} />}
            {tab === 'animate' && <AnimateTab info={info} />}
            {tab === 'advanced' && <AdvancedTab info={info} node={node} />}
          </div>
        </>
      )}
    </aside>
  );
}

function Breadcrumbs({ node }) {
  const chain = [];
  for (let p = node?.parentElement?.closest('[data-sb]'); p && p.tagName !== 'BODY' && chain.length < 4; p = p.parentElement?.closest('[data-sb]')) {
    chain.unshift(p);
    if (p.hasAttribute('data-sar-section')) break;
  }
  if (!chain.length) return null;
  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-zinc-400" aria-label="Parents">
      {chain.map((p, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <span>/</span>}
          <button type="button" className="truncate hover:text-accent" onClick={() => selectNode(p)} onMouseEnter={() => preview.setHover(p)} onMouseLeave={() => preview.setHover(null)}>
            {elementLabel({ tag: p.tagName.toLowerCase(), classes: [...p.classList], isSection: p.hasAttribute('data-sar-section'), sectionType: p.getAttribute('data-sar-type') })}
          </button>
        </span>
      ))}
    </nav>
  );
}

function NoSelection() {
  useStore((s) => s.data.pages);
  const page = currentPage();
  return (
    <>
      <div className="flex h-11 shrink-0 items-center border-b border-zinc-100 px-3">
        <h2 className="text-[13px] font-semibold">Page</h2>
      </div>
      <div className="sb-scroll min-h-0 flex-1 space-y-4 overflow-auto p-3">
        {page && <PageSettings page={page} />}
        <div className="rounded-lg bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-500">
          <div className="mb-1.5 flex items-center gap-1.5 font-medium text-zinc-700">
            <MousePointer2 size={14} /> Editing tips
          </div>
          <ul className="list-disc space-y-1 pl-4">
            <li>Click an element to select it; Esc selects its parent.</li>
            <li>Double-click text to edit it in place.</li>
            <li>Drag sections, elements and images from the left panels onto the page.</li>
            <li>Drag a selected element to place it freely.</li>
            <li>Ctrl+Z / Ctrl+Shift+Z undo and redo; Del deletes; Ctrl+D duplicates.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
