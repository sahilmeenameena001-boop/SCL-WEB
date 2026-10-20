// Pages: switch, add (sharing the navigation/footer of the current page), rename, describe, delete.
import { useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../store.js';
import { runOps, setPage } from '../../actions.js';
import { PanelHeader } from '../Editor.jsx';
import { CommitInput, IconButton, cn } from '../ui.jsx';

export function PagesPanel() {
  const pages = useStore((s) => s.data.pages);
  const pageId = useStore((s) => s.pageId);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const page = pages.find((p) => p.id === pageId);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    const r = await runOps([{ op: 'addPage', title: title.trim(), basedOn: pageId }], 'Add page', { reload: false });
    const newId = r?.results?.[0]?.pageId;
    if (newId) {
      setTitle('');
      setAdding(false);
      setPage(newId);
    }
  };

  return (
    <>
      <PanelHeader title="Pages">
        <IconButton icon={Plus} title="Add page" onClick={() => setAdding(!adding)} active={adding} />
      </PanelHeader>
      {adding && (
        <form onSubmit={add} className="space-y-2 border-b border-zinc-100 bg-zinc-50 p-3">
          <label className="sb-label" htmlFor="sb-new-page">
            New page title
          </label>
          <input id="sb-new-page" autoFocus className="sb-input" placeholder="About us" value={title} onChange={(e) => setTitle(e.target.value)} />
          <p className="text-[11px] text-zinc-500">Uses this page's navigation and footer, and is added to the navigation.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="sb-btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="sb-btn sb-btn-primary" disabled={!title.trim()}>
              Add page
            </button>
          </div>
        </form>
      )}
      <ul className="sb-scroll min-h-0 flex-1 overflow-auto py-1">
        {pages.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setPage(p.id)}
              className={cn('group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50', p.id === pageId && 'bg-accent-soft hover:bg-accent-soft')}
            >
              <FileText size={14} className={p.id === pageId ? 'text-accent' : 'text-zinc-400'} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', p.id === pageId && 'font-medium text-accent')}>{p.title || p.id}</span>
                <span className="block truncate text-[11px] text-zinc-400">/{p.route}</span>
              </span>
              {pages.length > 1 && (
                <IconButton
                  icon={Trash2}
                  title="Delete page"
                  size={13}
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete the page "${p.title || p.id}"?`)) runOps([{ op: 'deletePage', pageId: p.id }], 'Delete page', { reload: p.id !== pageId });
                  }}
                />
              )}
            </button>
          </li>
        ))}
      </ul>
      {page && (
        <div className="space-y-2.5 border-t border-zinc-100 p-3">
          <h3 className="text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Page settings</h3>
          <PageSettings page={page} />
        </div>
      )}
    </>
  );
}

export function PageSettings({ page }) {
  return (
    <>
      <div>
        <label className="sb-label">Title (browser tab and search results)</label>
        <CommitInput value={page.rawTitle} placeholder={page.title} onCommit={(v) => runOps([{ op: 'updatePage', page: page.id, title: v }], 'Page title', { reload: false })} />
      </div>
      <div>
        <label className="sb-label">Description</label>
        <CommitInput multiline rows={3} value={page.description} onCommit={(v) => runOps([{ op: 'updatePage', page: page.id, description: v }], 'Page description', { reload: false })} />
      </div>
    </>
  );
}
