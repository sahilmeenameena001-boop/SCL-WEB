import { useRef, useState } from 'react';
import { FileArchive, Globe, LayoutTemplate, LogOut, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../store.js';
import { createProject, deleteProject, importProject, logout, openProject } from '../actions.js';
import { Empty, IconButton } from './ui.jsx';

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

export function ProjectList() {
  const projects = useStore((s) => s.projects);
  const sources = useStore((s) => s.sources);
  const busy = useStore((s) => s.busy);
  const [name, setName] = useState('');
  const fileRef = useRef(null);

  return (
    <div className="sb-scroll h-full overflow-auto">
      <header className="sticky top-0 z-10 flex items-center border-b border-zinc-200 bg-white/90 px-6 py-3 backdrop-blur">
        <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
          <LayoutTemplate size={15} />
        </div>
        <h1 className="flex-1 text-[15px] font-semibold">Sites</h1>
        <IconButton icon={LogOut} title="Sign out" onClick={logout} />
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Start a new site</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <form
              className="rounded-xl border border-zinc-200 bg-white p-4"
              onSubmit={(e) => {
                e.preventDefault();
                createProject({ from: 'blank', name: name.trim() || 'New site' });
              }}
            >
              <div className="mb-2 flex items-center gap-2 font-medium">
                <Sparkles size={16} className="text-accent" /> Blank site
              </div>
              <p className="mb-3 text-[12px] text-zinc-500">Navigation, footer and a few starter sections.</p>
              <div className="flex gap-2">
                <input className="sb-input" placeholder="Site name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Site name" />
                <button className="sb-btn sb-btn-primary shrink-0" disabled={busy > 0}>
                  <Plus size={14} /> Create
                </button>
              </div>
            </form>

            {sources?.demo && (
              <button type="button" onClick={() => createProject({ from: 'demo' })} className="rounded-xl border border-zinc-200 bg-white p-4 text-left hover:border-accent/50">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  <LayoutTemplate size={16} className="text-accent" /> Demo template
                </div>
                <p className="text-[12px] text-zinc-500">An editable copy of the bundled demo capture.</p>
              </button>
            )}

            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-4 text-left hover:border-accent/50">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <FileArchive size={16} className="text-accent" /> Import ZIP
              </div>
              <p className="text-[12px] text-zinc-500">A website-template export or a zipped template folder.</p>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) importProject(f);
                }}
              />
            </button>
          </div>

          {sources?.jobs?.length > 0 && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-2.5 text-[12px] font-medium text-zinc-500">From a captured website</div>
              {sources.jobs.map((j) => (
                <div key={j.jobId} className="flex items-center gap-3 border-b border-zinc-50 px-4 py-2 last:border-0">
                  <Globe size={15} className="text-zinc-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{j.url}</div>
                    <div className="text-[11px] text-zinc-400">
                      {j.jobId} · {j.status}
                    </div>
                  </div>
                  <button className="sb-btn" disabled={busy > 0} onClick={() => createProject({ from: 'job', jobId: j.jobId })}>
                    Open in editor
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">Your sites</h2>
          {!projects ? null : !projects.length ? (
            <div className="rounded-xl border border-zinc-200 bg-white">
              <Empty icon={LayoutTemplate} title="No sites yet">
                Create a blank site or import a template to get started.
              </Empty>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="group relative rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-accent/50 hover:shadow-sm">
                  <button type="button" className="absolute inset-0" aria-label={`Open ${p.name}`} onClick={() => openProject(p.id)} />
                  <div className="mb-1 truncate pr-8 font-medium">{p.name}</div>
                  <div className="text-[11.5px] text-zinc-500">
                    {p.pages} page{p.pages === 1 ? '' : 's'} · edited {ago(p.updatedAt)}
                  </div>
                  <IconButton
                    icon={Trash2}
                    title="Delete site"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 hover:text-red-600"
                    onClick={() => confirm(`Delete "${p.name}"? This cannot be undone.`) && deleteProject(p.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
