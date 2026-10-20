// Advanced: visibility per device, free positioning, classes, attributes, custom CSS, section HTML.
import { useEffect, useState } from 'react';
import { Code, Loader2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api.js';
import { useStore, getState, setState, toast } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { canFreeDrag } from '../../lib/drop.js';
import { deleteSelected, runOps, updateDesign } from '../../actions.js';
import { Badge, CommitInput, Group, Modal, Row, Toggle } from '../ui.jsx';

const HIDDEN_ATTRS = /^(class|style|data-sar-|data-sb)/;

export function AdvancedTab({ info, node }) {
  const id = info.id;
  const el = useStore((s) => s.data.design.elements?.[id]) || {};
  const page = getState().pageId;
  const [cls, setCls] = useState('');
  const [attr, setAttr] = useState({ name: '', value: '' });
  const attrs = Object.entries(info.literalAttrs).filter(([k]) => !HIDDEN_ATTRS.test(k));
  const free = el.free;
  const setFree = (patch) => updateDesign({ id, patch: { free: patch } }, 'Position', { delay: 0 });

  return (
    <>
      <Group title="Visibility">
        {['desktop', 'tablet', 'mobile'].map((d) => (
          <Toggle key={d} label={`Show on ${d}`} checked={!el.hide?.[d]} onChange={(v) => updateDesign({ id, patch: { hide: { [d]: v ? null : true } } }, 'Visibility', { delay: 0 })} />
        ))}
        <p className="text-[11px] text-zinc-400">Hidden elements are dimmed in the editor and removed on the published site.</p>
      </Group>

      <Group title="Position" defaultOpen={!!free}>
        {!canFreeDrag(info) ? (
          <p className="text-[11.5px] text-zinc-500">{info.repeated ? 'Repeated list elements cannot be positioned freely.' : 'Sections and page structure stay in the page flow.'}</p>
        ) : (
          <>
            <Toggle label="Free position" checked={!!free} onChange={(v) => setFree(v ? preview.freeFromCurrent(node) : null)} />
            {free ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ['x', 'Left %'],
                    ['y', 'Top %'],
                    ['w', 'Width %'],
                  ].map(([k, label]) => (
                    <div key={k}>
                      <CommitInput numeric value={free[k] != null ? String(free[k]) : ''} onCommit={(v) => setFree({ [k]: v === '' ? null : Number(v) || 0 })} aria-label={label} />
                      <span className="block text-center text-[10px] text-zinc-400">{label}</span>
                    </div>
                  ))}
                </div>
                <Row label="Layer (z-index)">
                  <CommitInput numeric value={free.z != null ? String(free.z) : ''} placeholder="2" onCommit={(v) => setFree({ z: v === '' ? null : Math.round(Number(v)) || 0 })} />
                </Row>
                <Toggle label="Back in the flow on mobile" checked={free.mobileFlow !== false} onChange={(v) => setFree({ mobileFlow: v ? null : false })} />
              </>
            ) : (
              <p className="text-[11.5px] text-zinc-500">Tip: drag the selected element in the preview to place it anywhere in its section.</p>
            )}
          </>
        )}
      </Group>

      <Group title="Classes" defaultOpen={false}>
        <div className="flex flex-wrap gap-1">
          {info.classes.map((c) => (
            <span key={c} className="inline-flex items-center gap-0.5 rounded bg-zinc-100 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px]">
              {c}
              <button type="button" title={`Remove ${c}`} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700" onClick={() => runOps([{ op: 'setClasses', page, id, remove: [c] }], 'Remove class')}>
                <X size={11} />
              </button>
            </span>
          ))}
          {!info.classes.length && <span className="text-[11.5px] text-zinc-400">No classes</span>}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const add = cls.split(/\s+/).filter(Boolean);
            if (add.length) runOps([{ op: 'setClasses', page, id, add }], 'Add class');
            setCls('');
          }}
        >
          <input className="sb-input font-mono" placeholder="class-name" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Add class" />
          <button className="sb-btn shrink-0" disabled={!cls.trim()}>
            <Plus size={13} />
          </button>
        </form>
      </Group>

      <Group title="Attributes" defaultOpen={false}>
        {attrs.map(([name, value]) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className="w-20 shrink-0 truncate font-mono text-[11px] text-zinc-500" title={name}>
              {name}
            </span>
            <CommitInput value={value} onCommit={(v) => runOps([{ op: 'setAttr', page, id, name, value: v }], `Edit ${name}`)} />
            <button type="button" title={`Remove ${name}`} className="sb-icon-btn h-6 w-6 shrink-0" onClick={() => runOps([{ op: 'setAttr', page, id, name, value: null }], `Remove ${name}`)}>
              <X size={12} />
            </button>
          </div>
        ))}
        {info.tag === 'a' && <Toggle label="Open in a new tab" checked={info.literalAttrs.target === '_blank'} onChange={(v) => runOps([{ op: 'setAttr', page, id, name: 'target', value: v ? '_blank' : null }, { op: 'setAttr', page, id, name: 'rel', value: v ? 'noopener' : null }], 'Link target')} />}
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (attr.name.trim()) runOps([{ op: 'setAttr', page, id, name: attr.name.trim(), value: attr.value }], `Set ${attr.name.trim()}`);
            setAttr({ name: '', value: '' });
          }}
        >
          <input className="sb-input w-24 font-mono" placeholder="name" value={attr.name} onChange={(e) => setAttr({ ...attr, name: e.target.value })} aria-label="Attribute name" />
          <input className="sb-input" placeholder="value" value={attr.value} onChange={(e) => setAttr({ ...attr, value: e.target.value })} aria-label="Attribute value" />
          <button className="sb-btn shrink-0" disabled={!attr.name.trim()}>
            <Plus size={13} />
          </button>
        </form>
        <p className="text-[11px] text-zinc-400">Event handlers (on…) are not allowed.</p>
      </Group>

      <Group title="Custom CSS" defaultOpen={!!el.css}>
        <CommitInput multiline rows={4} className="font-mono text-[11px]" value={el.css || ''} placeholder={'transform: rotate(-2deg);\nmix-blend-mode: multiply;'} onCommit={(v) => updateDesign({ id, patch: { css: v.trim() || null } }, 'Custom CSS', { delay: 0 })} />
        <p className="text-[11px] text-zinc-400">
          Declarations for <code className="rounded bg-zinc-100 px-1">[data-sb=&quot;{id}&quot;]</code>, all screen sizes.
        </p>
      </Group>

      <div className="space-y-2 p-3">
        {info.sectionId && (
          <button type="button" className="sb-btn w-full" onClick={() => setState({ modal: { type: 'source', pageId: page, sectionId: info.sectionId } })}>
            <Code size={13} /> Edit section HTML
          </button>
        )}
        <button type="button" className="sb-btn sb-btn-danger w-full" onClick={deleteSelected}>
          <Trash2 size={13} /> Delete {info.isSection ? 'section' : info.item?.isRoot ? 'item' : 'element'}
        </button>
      </div>
    </>
  );
}

/** Modal: the section's template markup (with {{@…}} tokens). */
export function SectionSourceEditor({ pageId, sectionId, onClose }) {
  const projectId = useStore((s) => s.projectId);
  const [src, setSrc] = useState(null);
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api
      .sectionSource(projectId, pageId, sectionId)
      .then((r) => {
        setSrc(r.html);
        setShared(r.shared);
      })
      .catch((e) => {
        toast(e.message, { kind: 'error' });
        onClose();
      });
  }, [projectId, pageId, sectionId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setSaving(true);
    const r = await runOps([{ op: 'setSectionSource', page: pageId, sectionId, html: src }], 'Edit section HTML');
    setSaving(false);
    if (r) onClose();
  };
  return (
    <Modal
      title="Section HTML"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="sb-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="sb-btn sb-btn-primary" disabled={src == null || saving} onClick={save}>
            {saving && <Loader2 size={13} className="animate-spin" />} Save
          </button>
        </>
      }
    >
      {src == null ? (
        <Loader2 className="mx-auto animate-spin text-zinc-400" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-zinc-500">
            {shared && <Badge tone="amber">shared on several pages</Badge>}
            <span>
              Tokens: <code>{'{{@ path}}'}</code> text, <code>{'{{@html path}}'}</code> rich text, <code>{'{{@url path}}'}</code> links, <code>{'{{@each list}}…{{@end}}'}</code> lists.
            </span>
          </div>
          <textarea value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} className="sb-input h-[60vh] font-mono text-[12px] leading-relaxed" aria-label="Section HTML" />
        </>
      )}
    </Modal>
  );
}
