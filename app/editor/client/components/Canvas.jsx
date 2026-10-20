// Live preview: the page rendered by the server in an iframe at the chosen device width (scaled down
// when it does not fit), with selection outlines, a selection toolbar and drop indicators on top.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CornerLeftUp, Copy, Move, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useStore, setState, currentPage } from '../store.js';
import { preview } from '../lib/bridge.js';
import { elementLabel } from '../lib/labels.js';
import { canFreeDrag } from '../lib/drop.js';
import { DEVICES } from '../lib/style.js';
import { deleteSelected, duplicateSelected, moveSection, selectParent } from '../actions.js';
import { cn } from './ui.jsx';

const DESKTOP_MIN = 1280;
const PAD = 24;

export function Canvas() {
  const projectId = useStore((s) => s.projectId);
  useStore((s) => s.pageId);
  const device = useStore((s) => s.device);
  const page = currentPage();
  const box = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const fixed = DEVICES[device].width;
  const availW = size.w - (fixed ? PAD * 2 : 0);
  const availH = size.h - (fixed ? PAD * 2 : 0);
  const frameW = fixed || Math.max(availW, DESKTOP_MIN);
  const scale = Math.min(1, availW / frameW);
  const frameH = Math.max(200, availH / scale);
  const src = page ? api.previewUrl(projectId, page.route) : 'about:blank';

  return (
    <div
      ref={box}
      className={cn('relative min-w-0 flex-1 overflow-hidden bg-zinc-200/70', fixed && 'flex items-start justify-center')}
      style={fixed ? { padding: PAD } : undefined}
      onDragLeave={() => preview.clearHint()}
    >
      <div className={cn('relative shrink-0 origin-top-left bg-white', fixed && 'overflow-hidden rounded-xl shadow-xl ring-1 ring-black/5')} style={{ width: frameW * scale, height: frameH * scale }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: frameW, height: frameH, transform: scale < 1 ? `scale(${scale})` : undefined }}>
          <iframe ref={(el) => el && preview.attach(el)} src={src} title="Page preview" className="block h-full w-full border-0 bg-white" onLoad={() => preview.handleLoad()} />
          <Overlay scale={scale} />
        </div>
      </div>
    </div>
  );
}

const EMPTY = { hover: null, selected: null, hint: null, editing: false, dragging: false };

function Overlay({ scale }) {
  const [st, setSt] = useState(EMPTY);
  const last = useRef('');
  useStore((s) => s.selectedId + s.previewVersion); // re-render the label after selection changes
  useEffect(() => {
    let raf;
    const tick = () => {
      const next = preview.overlayState();
      const key = JSON.stringify(next, (k, v) => (k === 'info' || k === 'node' ? undefined : v));
      if (key !== last.current) {
        last.current = key;
        setSt(next);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {st.hover && <div className="absolute rounded-[2px] border border-dashed border-indigo-400" style={box(st.hover)} />}
      {st.selected && <Selection rect={st.selected} editing={st.editing} dragging={st.dragging} scale={scale} />}
      {st.hint &&
        st.hint.rect &&
        (st.hint.mode === 'box' ? (
          <div className="absolute rounded border-2 border-indigo-500 bg-indigo-500/10" style={box(st.hint.rect)}>
            <HintLabel scale={scale}>{st.hint.label}</HintLabel>
          </div>
        ) : (
          <div className="absolute h-[3px] -translate-y-1/2 rounded-full bg-indigo-500 shadow-[0_0_0_2px_white]" style={{ top: st.hint.rect.top, left: st.hint.rect.left, width: st.hint.rect.width }}>
            <HintLabel scale={scale}>{st.hint.label}</HintLabel>
          </div>
        ))}
    </div>
  );
}

const box = (r) => ({ top: r.top, left: r.left, width: r.width, height: r.height });

function HintLabel({ children, scale }) {
  return (
    <span className="absolute -top-6 left-1/2 origin-bottom rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-white" style={{ transform: `translateX(-50%) scale(${1 / scale})` }}>
      {children}
    </span>
  );
}

function Selection({ rect, editing, dragging, scale }) {
  const node = preview.selectedNode;
  const info = preview.describe(node);
  if (!info) return null;
  const label = elementLabel({ tag: info.tag, classes: info.classes, isSection: info.isSection, sectionType: info.sectionType });
  const inside = rect.top < 30;
  const sec = currentPage()?.sections || [];
  const si = sec.findIndex((s) => s.id === info.sectionId);
  const inv = 1 / scale;
  return (
    <div className={cn('absolute rounded-[2px] border-2', editing ? 'border-emerald-500' : 'border-indigo-600')} style={box(rect)}>
      {!dragging && (
        <div className={cn('absolute left-[-2px] flex items-center', inside ? 'top-0 origin-top-left' : 'bottom-full origin-bottom-left')} style={{ transform: `scale(${inv})` }}>
          <span className={cn('rounded-t px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white', editing ? 'bg-emerald-500' : 'bg-indigo-600', inside && 'rounded-t-none rounded-b')}>
            {editing ? 'Editing text — Enter to save, Esc to cancel' : label}
            {!editing && info.repeated && <span className="ml-1 opacity-70">(repeated)</span>}
            {!editing && canFreeDrag(info) && (
              <span className="ml-1 opacity-70" title="Drag to position freely">
                <Move size={10} className="inline" />
              </span>
            )}
          </span>
        </div>
      )}
      {!editing && !dragging && (
        <div
          className={cn('pointer-events-auto absolute right-[-2px] flex items-center gap-0.5 rounded-md bg-indigo-600 p-0.5 text-white shadow-lg', inside ? 'top-0 origin-top-right' : 'bottom-full mb-0.5 origin-bottom-right')}
          style={{ transform: `scale(${inv})` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!info.isSection && <ToolButton icon={CornerLeftUp} title="Select parent (Esc)" onClick={selectParent} />}
          {info.isSection && (
            <>
              <ToolButton icon={ArrowUp} title="Move section up" disabled={si <= 0} onClick={() => moveSection(info.sectionId, -1)} />
              <ToolButton icon={ArrowDown} title="Move section down" disabled={si < 0 || si >= sec.length - 1} onClick={() => moveSection(info.sectionId, 1)} />
            </>
          )}
          <ToolButton icon={Copy} title="Duplicate (Ctrl+D)" onClick={duplicateSelected} />
          <ToolButton icon={Trash2} title="Delete (Del)" onClick={deleteSelected} />
        </div>
      )}
    </div>
  );
}

function ToolButton({ icon: Icon, title, ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} className="flex h-6 w-6 items-center justify-center rounded hover:bg-white/20 disabled:opacity-40" {...rest}>
      <Icon size={13} />
    </button>
  );
}

/** Start dragging something from a panel onto the preview. */
export function dragProps(payload, text) {
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', text);
      e.dataTransfer.effectAllowed = 'copyMove';
      setState({ dragging: payload });
    },
    onDragEnd: () => {
      preview.clearHint();
      setState({ dragging: null });
    },
  };
}
