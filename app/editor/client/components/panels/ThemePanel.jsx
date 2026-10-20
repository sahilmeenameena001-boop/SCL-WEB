// Theme: brand (name, logo, contact), colour and font tokens from site.config.json, and site-wide
// design settings (smooth scrolling, custom CSS) from design.json.
import { useState } from 'react';
import { ImageIcon, Plus, X } from 'lucide-react';
import { api } from '../../api.js';
import { useStore, setState } from '../../store.js';
import { setColorLive, setConfig, updateDesign } from '../../actions.js';
import { GOOGLE_FONTS, fontName, toHex } from '../../lib/style.js';
import { PanelHeader } from '../Editor.jsx';
import { CommitInput, Group, IconButton, Toggle } from '../ui.jsx';

const pickAsset = (title, onPick) => setState({ modal: { type: 'assets', kind: 'image', title, onPick } });

function ImageSetting({ label, path, value }) {
  const projectId = useStore((s) => s.projectId);
  return (
    <div>
      <span className="sb-label">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => pickAsset(label, (a) => setConfig(path, a.path))} className="sb-checker flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200" title={`Choose ${label.toLowerCase()}`}>
          {value ? <img src={api.assetUrl(projectId, value)} alt="" className="max-h-full max-w-full object-contain" /> : <ImageIcon size={16} className="text-zinc-400" />}
        </button>
        <CommitInput value={value} onCommit={(v) => setConfig(path, v)} />
      </div>
    </div>
  );
}

export function ThemePanel() {
  const config = useStore((s) => s.data.config);
  const site = useStore((s) => s.data.design.site);
  const brand = config.brand || {};
  const [newColor, setNewColor] = useState('');

  return (
    <>
      <PanelHeader title="Theme" />
      <div className="sb-scroll min-h-0 flex-1 overflow-auto">
        <Group title="Brand">
          <div>
            <label className="sb-label">Site name</label>
            <CommitInput value={brand.name} onCommit={(v) => setConfig('brand.name', v)} />
          </div>
          <ImageSetting label="Logo" path="brand.logo.src" value={brand.logo?.src} />
          <ImageSetting label="Favicon" path="brand.favicon" value={brand.favicon} />
          {brand.contact &&
            Object.entries(brand.contact)
              .filter(([, v]) => typeof v === 'string')
              .map(([k, v]) => (
                <div key={k}>
                  <label className="sb-label">{k === 'phoneDisplay' ? 'Phone (as shown)' : k[0].toUpperCase() + k.slice(1)}</label>
                  <CommitInput value={v} onCommit={(nv) => setConfig(`brand.contact.${k}`, nv)} />
                </div>
              ))}
        </Group>

        <Group title="Colours">
          {Object.entries(config.colors || {}).map(([key, c]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-zinc-200" style={{ background: c.value }}>
                <input type="color" aria-label={`${key} colour`} value={toHex(c.value)} onChange={(e) => setColorLive(key, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
              </span>
              <span className="w-[76px] shrink-0 truncate text-[12px] text-zinc-600" title={`var(--sar-color-${key})`}>
                {key}
              </span>
              <CommitInput value={c.value} onCommit={(v) => setConfig(`colors.${key}.value`, v, { reload: false, label: 'Theme colour' })} />
              <IconButton icon={X} title={`Remove ${key}`} size={12} className="h-6 w-6 shrink-0" onClick={() => confirm(`Remove the colour "${key}"? Elements using it fall back to defaults.`) && setConfig(`colors.${key}`, null)} />
            </div>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const key = newColor.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
              if (!key) return;
              setConfig(`colors.${key}`, { value: '#888888' }, { reload: false, label: 'Add colour' });
              setNewColor('');
            }}
          >
            <input className="sb-input" placeholder="New colour name" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="New colour name" />
            <button className="sb-btn shrink-0" disabled={!newColor.trim()}>
              <Plus size={13} /> Add
            </button>
          </form>
        </Group>

        <Group title="Fonts">
          {Object.entries(config.fonts || {}).map(([key, f]) => (
            <FontSetting key={key} name={key} font={f} />
          ))}
        </Group>

        {Object.keys(config.typography || {}).length > 0 && (
          <Group title="Type scale" defaultOpen={false}>
            {Object.entries(config.typography).map(([key, t]) => (
              <div key={key}>
                <label className="sb-label">{key}</label>
                <CommitInput value={t.value} onCommit={(v) => setConfig(`typography.${key}.value`, v, { reload: false })} />
              </div>
            ))}
          </Group>
        )}

        <Group title="Site">
          <Toggle label="Smooth scrolling" checked={!!site?.smoothScroll} onChange={(v) => updateDesign({ site: { smoothScroll: v } }, 'Smooth scrolling', { delay: 0 })} />
          <div>
            <label className="sb-label">Custom CSS (whole site)</label>
            <CommitInput multiline rows={6} className="font-mono text-[11px]" value={site?.customCss || ''} placeholder=".sb-btn { border-radius: 6px; }" onCommit={(v) => updateDesign({ site: { customCss: v } }, 'Custom CSS', { delay: 0 })} />
          </div>
        </Group>
      </div>
    </>
  );
}

function FontSetting({ name, font }) {
  const preset = GOOGLE_FONTS.find((g) => g.google === font.google);
  const [custom, setCustom] = useState(!preset);
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-100 p-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium capitalize">{name}</span>
        <span className="truncate text-[12px] text-zinc-500" style={{ fontFamily: font.family }}>
          {fontName(font.family)} Aa
        </span>
      </div>
      <select
        className="sb-input"
        aria-label={`${name} font`}
        value={custom ? '__custom' : font.google}
        onChange={(e) => {
          if (e.target.value === '__custom') return setCustom(true);
          setCustom(false);
          const g = GOOGLE_FONTS.find((x) => x.google === e.target.value);
          setConfig(`fonts.${name}`, { ...font, family: g.family, google: g.google }, { label: 'Font' });
        }}
      >
        {GOOGLE_FONTS.map((g) => (
          <option key={g.google} value={g.google}>
            {fontName(g.family)}
          </option>
        ))}
        <option value="__custom">Custom…</option>
      </select>
      {custom && (
        <>
          <CommitInput value={font.family} placeholder='"My Font", sans-serif' onCommit={(v) => setConfig(`fonts.${name}.family`, v, { label: 'Font' })} title="CSS font-family" />
          <CommitInput value={font.google || ''} placeholder="Google Fonts spec, e.g. Inter:wght@400;700" onCommit={(v) => setConfig(`fonts.${name}.google`, v || null, { label: 'Font' })} title="Google Fonts family spec (optional)" />
        </>
      )}
    </div>
  );
}
