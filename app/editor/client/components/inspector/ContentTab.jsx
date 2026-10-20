// Content: the fields rendered in the selected element (texts, rich text, links, images), its
// literal text/attributes, and list item controls.
import { ArrowDown, ArrowUp, Copy, ImageIcon, Link2, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useStore, setState, getState } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { fieldLabel } from '../../lib/labels.js';
import { literalUrl } from '../../lib/drop.js';
import { duplicateSelected, moveListItem, runOps, setField } from '../../actions.js';
import { Badge, CommitInput, Empty, Group, IconButton } from '../ui.jsx';

const pickImage = (onPick) => setState({ modal: { type: 'assets', kind: 'image', title: 'Choose an image', onPick } });

export function ContentTab({ info, node }) {
  const fields = preview.fieldsWithin(node);
  const page = getState().pageId;
  const own = fields.filter((f) => f.own);
  const inner = fields.filter((f) => !f.own);
  const literal = Object.entries(info.literalAttrs).filter(([k]) => ['href', 'src', 'alt', 'title'].includes(k) && !(info.tag === 'img' && k === 'title'));
  const nothing = !fields.length && info.plainText == null && !literal.length && !info.item;

  return (
    <>
      {info.item && <ItemControls info={info} />}
      {info.isSection && <SectionNote info={info} />}
      {own.length > 0 && (
        <Group title="This element">
          {own.map((f) => (
            <FieldEditor key={`${f.n}-${f.attr || f.role}`} entry={f} />
          ))}
        </Group>
      )}
      {info.plainText != null && (
        <Group title="Text">
          <CommitInput multiline rows={3} value={info.plainText} onCommit={(text) => runOps([{ op: 'setText', page, id: info.id, text }], 'Edit text')} />
        </Group>
      )}
      {literal.length > 0 && (
        <Group title="Attributes">
          {literal.map(([name, value]) => (
            <div key={name}>
              <label className="sb-label">{name === 'href' ? 'Link' : name === 'src' ? 'Source' : name === 'alt' ? 'Alt text' : 'Title'}</label>
              <div className="flex gap-1.5">
                <CommitInput value={value} onCommit={(v) => runOps([{ op: 'setAttr', page, id: info.id, name, value: v }], `Edit ${name}`)} />
                {name === 'src' && <IconButton icon={ImageIcon} title="Choose image" onClick={() => pickImage((a) => runOps([{ op: 'setAttr', page, id: info.id, name: 'src', value: literalUrl(a.path) }], 'Replace image'))} />}
              </div>
            </div>
          ))}
        </Group>
      )}
      {inner.length > 0 && (
        <Group title={own.length ? 'Inside this element' : 'Content'}>
          {inner.map((f) => (
            <FieldEditor key={`${f.n}-${f.attr || f.role}`} entry={f} />
          ))}
        </Group>
      )}
      {nothing && (
        <Empty title="No content to edit">
          This element has no text or media of its own. Use <b>Style</b> to change its look, or select one of its children.
        </Empty>
      )}
    </>
  );
}

function SectionNote({ info }) {
  const shared = useStore((s) => s.data.pages.find((p) => p.id === s.pageId)?.sections.find((x) => x.id === info.sectionId)?.shared);
  if (!shared) return null;
  return <div className="m-3 rounded-lg bg-amber-50 p-2.5 text-[12px] leading-snug text-amber-800">This section is shared: content changes appear on every page that uses it.</div>;
}

function ItemControls({ info }) {
  const { item } = info;
  return (
    <div className="m-3 flex items-center gap-2 rounded-lg bg-indigo-50/60 p-2">
      <div className="min-w-0 flex-1 text-[12px] text-indigo-900">
        <div className="font-medium">List item {item.index + 1}</div>
        <div className="truncate text-[11px] text-indigo-700/70">{fieldLabel(item.listPath)}</div>
      </div>
      <IconButton icon={ArrowUp} title="Move item up" disabled={item.index === 0} onClick={() => moveListItem(item, -1)} />
      <IconButton icon={ArrowDown} title="Move item down" onClick={() => moveListItem(item, 1)} />
      <IconButton
        icon={Copy}
        title="Duplicate item"
        onClick={() => (item.isRoot ? duplicateSelected() : runOps([{ op: 'listItem', page: getState().pageId, sectionId: item.sectionId, listPath: item.listPath, index: item.index, action: 'duplicate' }], 'Duplicate item'))}
      />
      <IconButton
        icon={Trash2}
        title="Delete item"
        className="hover:text-red-600"
        onClick={() => runOps([{ op: 'listItem', page: getState().pageId, sectionId: item.sectionId, listPath: item.listPath, index: item.index, action: 'delete' }], 'Delete item')}
      />
    </div>
  );
}

function FieldEditor({ entry }) {
  const { field, attr, role } = entry;
  const pages = useStore((s) => s.data.pages);
  const projectId = useStore((s) => s.projectId);
  if (!field) return null;
  const isImage = attr === 'src' || attr === 'poster' || (attr === 'href' && /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(field.raw));
  const isLink = attr === 'href' || attr === 'action';
  const label = `${fieldLabel(field.path)}${attr && !['src', 'href'].includes(attr) ? ` (${attr})` : ''}`;
  const commit = (v) => setField(field, v);
  return (
    <div onMouseEnter={() => preview.setHover(entry.el)} onMouseLeave={() => preview.setHover(null)}>
      <div className="mb-1 flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-500" title={field.path}>
          {isLink ? <Link2 size={11} className="mr-1 inline" /> : null}
          {label}
        </span>
        {field.kind === 'brand' && (
          <Badge tone="indigo" title="From the site settings (Theme panel)">
            site
          </Badge>
        )}
        {field.shared && field.kind !== 'brand' && (
          <Badge tone="amber" title="Shared section: changes appear on every page using it">
            shared
          </Badge>
        )}
        {role === 'html' && <Badge>rich text</Badge>}
      </div>
      {isImage ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => pickImage((a) => commit(a.path))} className="sb-checker flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200" title="Choose image">
            {field.raw ? <img src={field.raw.startsWith('/') ? api.assetUrl(projectId, field.raw) : field.raw} alt="" className="max-h-full max-w-full object-contain" /> : <ImageIcon size={16} className="text-zinc-400" />}
          </button>
          <CommitInput value={field.raw} onCommit={commit} />
        </div>
      ) : isLink ? (
        <div className="space-y-1">
          <CommitInput value={field.raw} onCommit={commit} placeholder="https://… or /page.html" />
          <select className="sb-input text-zinc-500" value="" onChange={(e) => e.target.value && commit(e.target.value)} aria-label="Link to a page">
            <option value="">Link to a page…</option>
            {pages.map((p) => (
              <option key={p.id} value={`/${p.route}`}>
                {p.title || p.id}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <CommitInput multiline={role === 'html' || field.raw.length > 40 || role === 'text' || role === 'part'} rows={role === 'html' ? 6 : 2} className={role === 'html' ? 'font-mono text-[11px]' : ''} value={field.raw} onCommit={commit} />
      )}
    </div>
  );
}
