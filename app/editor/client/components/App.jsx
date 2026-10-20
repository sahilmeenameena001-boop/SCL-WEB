import { useEffect, useState } from 'react';
import { ExternalLink, KeyRound, Loader2 } from 'lucide-react';
import { useStore, setState, toast } from '../store.js';
import { boot, handleKey, login } from '../actions.js';
import { Editor } from './Editor.jsx';
import { ProjectList } from './ProjectList.jsx';
import { AssetPicker } from './panels/AssetsPanel.jsx';
import { SectionSourceEditor } from './inspector/AdvancedTab.jsx';
import { cn } from './ui.jsx';

export function App() {
  const auth = useStore((s) => s.auth);
  const projectId = useStore((s) => s.projectId);
  useEffect(() => {
    boot().catch((e) => {
      setState({ auth: 'out' });
      toast(e.message, { kind: 'error' });
    });
    addEventListener('keydown', handleKey);
    return () => removeEventListener('keydown', handleKey);
  }, []);
  return (
    <>
      {auth === 'unknown' ? (
        <div className="flex h-full items-center justify-center text-zinc-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : auth === 'out' ? (
        <Login />
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

function Login() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(token.trim());
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl shadow-zinc-300/40">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
          <KeyRound size={20} />
        </div>
        <h1 className="mb-1 text-lg font-semibold">Sign in to the site editor</h1>
        <p className="mb-5 text-[12.5px] leading-relaxed text-zinc-500">
          Open the login link printed by <code className="rounded bg-zinc-100 px-1">npm run editor</code>, or paste the application API token.
        </p>
        <label className="sb-label" htmlFor="sb-token">
          API token
        </label>
        <input id="sb-token" type="password" autoComplete="off" className="sb-input mb-4 py-2" value={token} onChange={(e) => setToken(e.target.value)} />
        <button className="sb-btn sb-btn-primary w-full py-2" disabled={!token.trim() || busy}>
          {busy && <Loader2 size={14} className="animate-spin" />} Sign in
        </button>
      </form>
    </div>
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
