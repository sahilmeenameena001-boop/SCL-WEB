import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, ExternalLink, House, Loader2, LogOut, Monitor, Redo2, Rocket, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { useStore, setState, currentPage } from '../store.js';
import { closeProject, exportZip, logout, publish, redo, renameProject, setPage, undo } from '../actions.js';
import { DEVICES } from '../lib/style.js';
import { CommitInput, IconButton, Segmented, cn } from './ui.jsx';

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone };

export function TopBar() {
  const data = useStore((s) => s.data);
  const pageId = useStore((s) => s.pageId);
  const device = useStore((s) => s.device);
  const busy = useStore((s) => s.busy);
  const page = currentPage();
  const h = data.history;
  const [publishing, setPublishing] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-2">
      <IconButton icon={House} title="All sites" onClick={closeProject} />
      <div className="w-44">
        <CommitInput value={data.project.name} onCommit={(v) => v.trim() && renameProject(v.trim())} className="border-transparent bg-transparent font-semibold hover:border-zinc-200" aria-label="Site name" />
      </div>
      <div className="h-5 w-px bg-zinc-200" />
      <label className="flex items-center gap-1.5 text-[12px] text-zinc-500">
        Page
        <select value={pageId || ''} onChange={(e) => setPage(e.target.value)} className="sb-input w-44 py-1" aria-label="Page">
          {data.pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title || p.id} — /{p.route.replace(/index\.html$/, '')}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-1 justify-center">
        <Segmented
          className="w-[132px]"
          value={device}
          onChange={(d) => d && setState({ device: d })}
          options={Object.entries(DEVICES).map(([value, d]) => ({ value, icon: DEVICE_ICONS[value], title: `${d.label}${d.width ? ` (${d.width}px)` : ''}` }))}
        />
      </div>

      <div className="flex w-5 justify-center text-zinc-400">{busy > 0 && <Loader2 size={15} className="animate-spin" aria-label="Saving" />}</div>
      <IconButton icon={Undo2} title={h.canUndo ? `Undo: ${h.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} disabled={!h.canUndo} onClick={undo} />
      <IconButton icon={Redo2} title={h.canRedo ? `Redo: ${h.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'} disabled={!h.canRedo} onClick={redo} />
      <div className="h-5 w-px bg-zinc-200" />
      {data.built && (
        <a className="sb-btn" href={`/sites/${data.project.id}/${page?.route === 'index.html' ? '' : page?.route || ''}`} target="_blank" rel="noopener" title="Open the last published version">
          <ExternalLink size={14} /> View
        </a>
      )}
      <ExportMenu />
      <button
        type="button"
        className="sb-btn sb-btn-primary"
        disabled={publishing}
        onClick={async () => {
          setPublishing(true);
          await publish();
          setPublishing(false);
        }}
      >
        {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} Publish
      </button>
      <IconButton icon={LogOut} title="Sign out" onClick={logout} />
    </header>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  const item = (kind, title, text) => (
    <button
      type="button"
      role="menuitem"
      className="block w-full rounded-md px-3 py-2 text-left hover:bg-zinc-50"
      onClick={() => {
        setOpen(false);
        exportZip(kind);
      }}
    >
      <div className="font-medium">{title}</div>
      <div className="text-[11.5px] text-zinc-500">{text}</div>
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={cn('sb-btn', open && 'bg-zinc-50')} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Download size={14} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl">
          {item('template', 'Template ZIP', 'Editable source: config, content, components, build script.')}
          {item('site', 'Static site ZIP', 'Built HTML/CSS/assets, ready to upload to any host.')}
        </div>
      )}
    </div>
  );
}
