// Layers: the current page's sections and their elements, read from the preview DOM. Click to
// select, drag to reorder (sections across the page, elements within their section).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Eye, EyeOff, Layers, Trash2 } from 'lucide-react';
import { useStore, currentPage } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { elementLabel } from '../../lib/labels.js';
import { sectionMoveIndex } from '../../lib/drop.js';
import { moveSection, runOps, selectById, updateDesign } from '../../actions.js';
import { PanelHeader } from '../Editor.jsx';
import { Badge, Empty, IconButton, cn } from '../ui.jsx';

const keyOf = (n) => `${n.id}#${n.index}`;

export function LayersPanel() {
  const version = useStore((s) => s.previewVersion);
  const selectedId = useStore((s) => s.selectedId);
  const selectedIndex = useStore((s) => s.selectedIndex);
  const pageId = useStore((s) => s.pageId);
  const tree = useMemo(() => preview.tree(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(() => new Set());
  const [drag, setDrag] = useState(null); // { node }
  const [over, setOver] = useState(null); // { key, before }
  const listRef = useRef(null);

  // Expand the path to the selection and bring its row into view.
  useEffect(() => {
    const sel = preview.selectedNode;
    if (!sel) return;
    const path = [];
    const walk = (nodes) => nodes.some((n) => (n.el === sel ? true : n.el.contains(sel) && walk(n.children) ? (path.push(keyOf(n)), true) : false));
    walk(tree);
    if (path.some((k) => !open.has(k))) setOpen((o) => new Set([...o, ...path]));
    requestAnimationFrame(() => listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }, [selectedId, selectedIndex, tree]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k) => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])));

  const onDrop = (target, before) => {
    const moving = drag?.node;
    setDrag(null);
    setOver(null);
    if (!moving || moving === target) return;
    if (moving.isSection !== target.isSection) return;
    if (moving.isSection) {
      const order = currentPage().sections.map((s) => s.id);
      return runOps([{ op: 'moveSection', page: pageId, sectionId: moving.sectionId, toIndex: sectionMoveIndex(order, moving.sectionId, target.sectionId, before) }], 'Move section');
    }
    return runOps([{ op: 'moveElement', page: pageId, id: moving.id, target: target.id, position: before ? 'before' : 'after' }], 'Move element');
  };

  return (
    <>
      <PanelHeader title="Layers">
        <Badge>{tree.length} sections</Badge>
      </PanelHeader>
      <div ref={listRef} className="sb-scroll min-h-0 flex-1 overflow-auto py-1" role="tree" aria-label="Page layers">
        {!tree.length ? (
          <Empty icon={Layers} title="No sections yet">
            Drag a section from the Add panel onto the page.
          </Empty>
        ) : (
          tree.map((n) => <LayerRow key={keyOf(n)} node={n} depth={0} open={open} toggle={toggle} drag={drag} setDrag={setDrag} over={over} setOver={setOver} onDrop={onDrop} />)
        )}
      </div>
      <p className="border-t border-zinc-100 px-3 py-2 text-[11px] leading-snug text-zinc-400">Drag rows to reorder. Elements move within their own section.</p>
    </>
  );
}

function LayerRow({ node, depth, open, toggle, drag, setDrag, over, setOver, onDrop }) {
  const k = keyOf(node);
  const selected = useStore((s) => s.selectedId === node.id && s.selectedIndex === node.index);
  const hovered = useStore((s) => s.hoverId === node.id);
  const device = useStore((s) => s.device);
  const hidden = useStore((s) => !!s.data.design.elements?.[node.id]?.hide?.[device]);
  const isOpen = open.has(k);
  const sectionMeta = node.isSection ? currentPage()?.sections.find((s) => s.id === node.sectionId) : null;
  const label = elementLabel({ tag: node.tag, classes: node.classes, text: node.text, isSection: node.isSection, sectionType: node.sectionType });
  const canDropHere = drag && drag.node !== node && drag.node.isSection === node.isSection && (node.isSection || node.el.closest('[data-sar-section]') === drag.node.el.closest('[data-sar-section]'));
  const sections = currentPage()?.sections || [];
  const si = sections.findIndex((s) => s.id === node.sectionId);

  return (
    <div role="treeitem" aria-selected={selected} aria-expanded={node.children.length ? isOpen : undefined}>
      <div
        data-selected={selected}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', node.id);
          e.dataTransfer.effectAllowed = 'move';
          setDrag({ node });
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        onDragOver={(e) => {
          if (!canDropHere) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          if (over?.key !== k || over.before !== before) setOver({ key: k, before });
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (canDropHere) onDrop(node, over?.before ?? true);
        }}
        onClick={() => selectById(node.id, node.index)}
        onMouseEnter={() => preview.setHover(node.el)}
        onMouseLeave={() => preview.setHover(null)}
        className={cn(
          'group relative flex h-7 cursor-default items-center gap-1 pr-1 text-[12px] text-zinc-700',
          hovered && !selected && 'bg-zinc-50',
          selected && 'bg-accent-soft text-accent',
          node.isSection && 'font-medium',
          hidden && 'opacity-50',
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {over?.key === k && <span className={cn('pointer-events-none absolute right-1 left-2 h-0.5 rounded bg-accent', over.before ? 'top-0' : 'bottom-0')} />}
        <button
          type="button"
          className={cn('flex h-5 w-4 shrink-0 items-center justify-center text-zinc-400', !node.children.length && 'invisible')}
          onClick={(e) => {
            e.stopPropagation();
            toggle(k);
          }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {sectionMeta?.shared && (
          <Badge tone="amber" title="Shared: the same content appears on other pages">
            shared
          </Badge>
        )}
        <span className="hidden items-center group-hover:flex">
          {node.isSection && (
            <>
              <IconButton icon={ArrowUp} title="Move up" size={12} className="h-5 w-5" disabled={si <= 0} onClick={(e) => (e.stopPropagation(), moveSection(node.sectionId, -1))} />
              <IconButton icon={ArrowDown} title="Move down" size={12} className="h-5 w-5" disabled={si < 0 || si >= sections.length - 1} onClick={(e) => (e.stopPropagation(), moveSection(node.sectionId, 1))} />
              <IconButton
                icon={Copy}
                title="Duplicate"
                size={12}
                className="h-5 w-5"
                onClick={(e) => (e.stopPropagation(), runOps([{ op: 'duplicateSection', page: currentPage().id, sectionId: node.sectionId }], 'Duplicate section'))}
              />
              <IconButton
                icon={Trash2}
                title="Delete"
                size={12}
                className="h-5 w-5 hover:text-red-600"
                onClick={(e) => (e.stopPropagation(), runOps([{ op: 'deleteSection', page: currentPage().id, sectionId: node.sectionId }], 'Delete section'))}
              />
            </>
          )}
        </span>
        <IconButton
          icon={hidden ? EyeOff : Eye}
          title={`${hidden ? 'Show' : 'Hide'} on ${device}`}
          size={12}
          className={cn('h-5 w-5', !hidden && 'hidden group-hover:inline-flex')}
          onClick={(e) => {
            e.stopPropagation();
            updateDesign({ id: node.id, patch: { hide: { [device]: hidden ? null : true } } }, 'Visibility', { delay: 0 });
          }}
        />
      </div>
      {isOpen && node.children.map((c) => <LayerRow key={keyOf(c)} node={c} depth={depth + 1} open={open} toggle={toggle} drag={drag} setDrag={setDrag} over={over} setOver={setOver} onDrop={onDrop} />)}
    </div>
  );
}
