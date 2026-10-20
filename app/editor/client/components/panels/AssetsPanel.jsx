// Assets: images, videos and fonts of the site. Upload (button or drop files here), drag onto the
// page (image -> replace, section -> background) or click to apply to the selection.
import { useRef, useState } from 'react';
import { Film, ImageIcon, Search, Type, Upload } from 'lucide-react';
import { api } from '../../api.js';
import { useStore, getState, toast } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { assetDropAction } from '../../lib/drop.js';
import { runOps, updateDesign, uploadFiles } from '../../actions.js';
import { PanelHeader } from '../Editor.jsx';
import { dragProps } from '../Canvas.jsx';
import { Badge, Empty, Modal, Tabs, cn } from '../ui.jsx';

const KIND_TABS = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'font', label: 'Fonts' },
];
const ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.ico,.mp4,.webm,.woff,.woff2,.ttf,.otf';

/** Apply an asset to the current selection (same rules as dropping it there). */
export function applyAsset(asset) {
  const info = preview.describe(preview.selectedNode);
  const action = assetDropAction(getState().pageId, asset, info);
  if (!action) return toast(info ? 'Select an image or a section to use this asset' : 'Drag the asset onto the page, or select an image first', { ms: 3000 });
  if (action.kind === 'background') return updateDesign({ id: action.ops[0].id, patch: action.ops[0].patch }, action.label, { delay: 0 });
  return runOps(action.ops, action.label);
}

function AssetGrid({ assets, projectId, onPick, draggable }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {assets.map((a) => (
        <button
          key={a.path}
          type="button"
          title={`${a.path}\n${Math.round(a.size / 1024)} KB`}
          onClick={() => onPick(a)}
          {...(draggable ? dragProps({ type: 'asset', asset: a }, a.path) : {})}
          className={cn('group overflow-hidden rounded-lg border border-zinc-200 bg-white text-left transition hover:border-accent/60', draggable && 'cursor-grab active:cursor-grabbing')}
        >
          <div className="sb-checker flex aspect-[4/3] items-center justify-center overflow-hidden">
            {a.kind === 'image' ? (
              <img src={api.assetUrl(projectId, a.path)} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" />
            ) : a.kind === 'video' ? (
              <Film size={22} className="text-zinc-400" />
            ) : (
              <Type size={22} className="text-zinc-400" />
            )}
          </div>
          <div className="flex items-center gap-1 px-1.5 py-1">
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-600">{a.name}</span>
            {a.uploaded && <Badge tone="indigo">new</Badge>}
          </div>
        </button>
      ))}
    </div>
  );
}

function useAssetFilter(kind) {
  const assets = useStore((s) => s.data.assets);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(kind || 'all');
  const list = assets.filter((a) => (tab === 'all' || a.kind === tab) && a.path.toLowerCase().includes(q.trim().toLowerCase()));
  return { list, q, setQ, tab, setTab };
}

function UploadButton({ className }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className={cn('sb-btn', className)} onClick={() => ref.current?.click()}>
        <Upload size={13} /> Upload
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files || [])];
          e.target.value = '';
          if (files.length) uploadFiles(files);
        }}
      />
    </>
  );
}

export function AssetsPanel() {
  const projectId = useStore((s) => s.projectId);
  const { list, q, setQ, tab, setTab } = useAssetFilter();
  const [dropping, setDropping] = useState(false);
  return (
    <>
      <PanelHeader title="Assets">
        <UploadButton className="py-1" />
      </PanelHeader>
      <div className="space-y-2 border-b border-zinc-100 p-2">
        <Tabs tabs={KIND_TABS} value={tab} onChange={setTab} />
        <div className="relative">
          <Search size={13} className="absolute top-2 left-2 text-zinc-400" />
          <input className="sb-input pl-7" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" />
        </div>
      </div>
      <div
        className={cn('sb-scroll relative min-h-0 flex-1 overflow-auto p-2', dropping && 'bg-accent-soft')}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDropping(false);
          uploadFiles([...e.dataTransfer.files]);
        }}
      >
        {list.length ? (
          <AssetGrid assets={list} projectId={projectId} onPick={applyAsset} draggable />
        ) : (
          <Empty icon={ImageIcon} title="No files">
            Upload images, videos or fonts, or drop files here.
          </Empty>
        )}
      </div>
      <p className="border-t border-zinc-100 px-3 py-2 text-[11px] leading-snug text-zinc-400">Drop an image on an image to replace it, or on a section to make it the background.</p>
    </>
  );
}

/** Modal asset chooser (theme logo, image fields, backgrounds). */
export function AssetPicker({ kind = 'image', onPick, onClose, title = 'Choose a file' }) {
  const projectId = useStore((s) => s.projectId);
  const { list, q, setQ } = useAssetFilter(kind);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute top-2 left-2 text-zinc-400" />
          <input autoFocus className="sb-input pl-7" placeholder="Search files" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <UploadButton />
      </div>
      {list.length ? (
        <div className="[&>div]:grid-cols-4 sm:[&>div]:grid-cols-5">
          <AssetGrid
            assets={list}
            projectId={projectId}
            onPick={(a) => {
              onClose();
              onPick(a);
            }}
          />
        </div>
      ) : (
        <Empty icon={ImageIcon} title="No matching files">
          Upload a file to use it here.
        </Empty>
      )}
    </Modal>
  );
}
