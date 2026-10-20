import { useEffect } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useStore, setState, toast } from '../store.js';
import { boot, handleKey } from '../actions.js';
import { Editor } from './Editor.jsx';
import { ProjectList } from './ProjectList.jsx';
import { AssetPicker } from './panels/AssetsPanel.jsx';
import { SectionSourceEditor } from './inspector/AdvancedTab.jsx';
import { cn } from './ui.jsx';

export function App() {
  const ready = useStore((s) => s.ready);
  const projectId = useStore((s) => s.projectId);
  useEffect(() => {
    boot().catch((e) => {
      setState({ ready: true });
      toast(e.message, { kind: 'error' });
    });
    addEventListener('keydown', handleKey);
    return () => removeEventListener('keydown', handleKey);
  }, []);
  return (
    <>
      {!ready ? (
        <div className="flex h-full items-center justify-center text-zinc-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : projectId ? (
        <Editor />
      ) : (
        <ProjectList />
      )}
      <ModalHost />
      <Toasts />
    </>
  );
}

function ModalHost() {
  const modal = useStore((s) => s.modal);
  if (!modal) return null;
  const close = () => setState({ modal: null });
  if (modal.type === 'assets') return <AssetPicker {...modal} onClose={close} />;
  if (modal.type === 'source') return <SectionSourceEditor {...modal} onClose={close} />;
  return null;
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-3.5 py-2 text-[12.5px] shadow-lg',
            t.kind === 'error' ? 'bg-red-600 text-white' : t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-zinc-900 text-white',
          )}
        >
          <span>{t.message}</span>
          {t.action && (
            <a href={t.action.href} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
              {t.action.label} <ExternalLink size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
