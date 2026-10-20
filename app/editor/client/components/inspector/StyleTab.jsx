// Style: per-breakpoint CSS overrides (design.json elements.<id>.style.<base|tablet|mobile>),
// background, hover state. Placeholders show the inherited or computed value.
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ImageIcon, RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import { useStore, setState } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { updateDesign } from '../../actions.js';
import { DEVICES, FONT_WEIGHTS, SHADOWS, breakpointFor, fontName, gradientString, inheritedStyle, parseGradient, readStyle, shadowPreset, stylePatch } from '../../lib/style.js';
import { ColorInput, CommitInput, Group, IconButton, Row, Segmented, Select, Range, Toggle, cn } from '../ui.jsx';

const kebab = (p) => p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const BP_NOTE = { base: 'all screen sizes', tablet: 'tablet and mobile (≤ 1024px)', mobile: 'mobile (≤ 640px)' };

export function StyleTab({ info, node }) {
  const device = useStore((s) => s.device);
  const design = useStore((s) => s.data.design);
  const config = useStore((s) => s.data.config);
  const bp = breakpointFor(device);
  const id = info.id;
  const el = design.elements?.[id] || {};
  const computed = preview.computedStyle(node);

  const swatches = Object.entries(config.colors || {}).map(([k, c]) => ({ value: `var(--sar-color-${k})`, color: c.value, label: k }));
  const fonts = Object.entries(config.fonts || {}).map(([k, f]) => ({ value: `var(--sar-font-${k})`, label: `${k} · ${fontName(f.family)}` }));

  /** Props for one style property control. */
  const p = (prop) => ({
    value: readStyle(design, id, bp, prop),
    placeholder: inheritedStyle(design, id, bp, prop) || computed?.getPropertyValue(kebab(prop)) || '',
    onChange: (v) => updateDesign({ id, patch: stylePatch(bp, prop, v) }),
    set: !!readStyle(design, id, bp, prop),
  });
  const text = (prop, label, opts = {}) => {
    const c = p(prop);
    return (
      <Row label={label} set={c.set}>
        <CommitInput value={c.value} placeholder={c.placeholder} onCommit={c.onChange} numeric={opts.numeric !== false} />
      </Row>
    );
  };
  const select = (prop, label, options) => {
    const c = p(prop);
    return (
      <Row label={label} set={c.set}>
        <Select value={c.value} onChange={c.onChange} options={options} placeholder={c.placeholder ? `Default (${c.placeholder})` : 'Default'} />
      </Row>
    );
  };
  const color = (prop, label) => {
    const c = p(prop);
    return (
      <Row label={label} set={c.set}>
        <ColorInput value={c.value} placeholder={c.placeholder} onChange={c.onChange} swatches={swatches} />
      </Row>
    );
  };
  const display = readStyle(design, id, bp, 'display') || computed?.display || '';
  const hasStyles = Object.keys(el.style?.[bp] || {}).length > 0;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[11.5px] text-zinc-500">
        <span className="flex-1">
          Editing <b className="text-zinc-700">{DEVICES[device].label.toLowerCase()}</b> styles — applies to {BP_NOTE[bp]}.
        </span>
        <IconButton icon={RotateCcw} title={`Reset ${DEVICES[device].label.toLowerCase()} styles`} disabled={!hasStyles} onClick={() => updateDesign({ id, patch: { style: { [bp]: null } } }, 'Reset styles', { delay: 0 })} />
      </div>

      <Group title="Typography">
        {select('fontFamily', 'Font', [...fonts, { value: 'inherit', label: 'Inherit' }, { value: 'system-ui, sans-serif', label: 'System sans' }, { value: 'Georgia, serif', label: 'Serif' }, { value: 'ui-monospace, monospace', label: 'Monospace' }])}
        {text('fontSize', 'Size')}
        {select('fontWeight', 'Weight', FONT_WEIGHTS)}
        {text('lineHeight', 'Line height')}
        {text('letterSpacing', 'Letter spacing')}
        {color('color', 'Colour')}
        <Row label="Align" set={!!readStyle(design, id, bp, 'textAlign')}>
          <Segmented
            value={readStyle(design, id, bp, 'textAlign')}
            onChange={p('textAlign').onChange}
            options={[
              { value: 'left', icon: AlignLeft, title: 'Left', toggle: true },
              { value: 'center', icon: AlignCenter, title: 'Center', toggle: true },
              { value: 'right', icon: AlignRight, title: 'Right', toggle: true },
              { value: 'justify', icon: AlignJustify, title: 'Justify', toggle: true },
            ]}
          />
        </Row>
        {select('textTransform', 'Case', ['none', 'uppercase', 'lowercase', 'capitalize'])}
      </Group>

      <Group title="Layout" defaultOpen={false}>
        {select('display', 'Display', ['block', 'flex', 'grid', 'inline-block', 'inline-flex', 'inline', 'none'])}
        {/flex|grid/.test(display) && (
          <>
            {display.includes('flex') && select('flexDirection', 'Direction', ['row', 'column', 'row-reverse', 'column-reverse'])}
            {display.includes('grid') && text('gridTemplateColumns', 'Columns', { numeric: false })}
            {select('justifyContent', 'Justify', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'])}
            {select('alignItems', 'Align', ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'])}
            {text('gap', 'Gap')}
            {display.includes('flex') && select('flexWrap', 'Wrap', ['nowrap', 'wrap'])}
          </>
        )}
      </Group>

      <Group title="Size">
        {text('width', 'Width')}
        {text('maxWidth', 'Max width')}
        {text('height', 'Height')}
        {text('minHeight', 'Min height')}
        {select('objectFit', 'Image fit', ['fill', 'contain', 'cover', 'none', 'scale-down'])}
      </Group>

      <Group title="Spacing">
        <BoxSides label="Margin" prefix="margin" p={p} />
        <BoxSides label="Padding" prefix="padding" p={p} />
      </Group>

      <Group title="Background">
        <BackgroundEditor id={id} bg={el.bg} swatches={swatches} />
      </Group>

      <Group title="Border" defaultOpen={false}>
        {text('borderWidth', 'Width')}
        {select('borderStyle', 'Style', ['none', 'solid', 'dashed', 'dotted', 'double'])}
        {color('borderColor', 'Colour')}
        {text('borderRadius', 'Radius')}
      </Group>

      <Group title="Effects" defaultOpen={false}>
        <Row label="Shadow" set={!!readStyle(design, id, bp, 'boxShadow')}>
          <Select
            value={shadowPreset(readStyle(design, id, bp, 'boxShadow'))}
            onChange={(v) => v !== 'custom' && p('boxShadow').onChange(v ? SHADOWS[v] : '')}
            placeholder="Default"
            options={[...Object.keys(SHADOWS).map((k) => ({ value: k, label: k === 'none' ? 'None' : k.toUpperCase() })), { value: 'custom', label: 'Custom' }]}
          />
        </Row>
        <Row label="Opacity" set={!!readStyle(design, id, bp, 'opacity')}>
          <Range value={readStyle(design, id, bp, 'opacity') === '' ? null : Number(readStyle(design, id, bp, 'opacity'))} onChange={(v) => p('opacity').onChange(String(v))} />
        </Row>
        {select('overflow', 'Overflow', ['visible', 'hidden', 'auto'])}
      </Group>

      <Group title="Hover state" defaultOpen={false}>
        <HoverEditor id={id} hover={el.hover} swatches={swatches} />
      </Group>
    </>
  );
}

function BoxSides({ label, prefix, p }) {
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  return (
    <div>
      <span className="mb-1 block text-[11px] text-zinc-500">{label}</span>
      <div className="grid grid-cols-4 gap-1">
        {sides.map((s) => {
          const c = p(`${prefix}${s}`);
          return (
            <div key={s}>
              <CommitInput value={c.value} placeholder={c.placeholder} onCommit={c.onChange} numeric className={cn('px-1.5 text-center', c.set && 'border-accent/50')} aria-label={`${label} ${s.toLowerCase()}`} />
              <span className="block text-center text-[10px] text-zinc-400">{s}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BG_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Colour' },
  { value: 'gradient', label: 'Gradient' },
  { value: 'image', label: 'Image' },
];

function BackgroundEditor({ id, bg = {}, swatches }) {
  const projectId = useStore((s) => s.projectId);
  const type = bg.type || 'none';
  const set = (patch, delay) => updateDesign({ id, patch: { bg: patch } }, 'Background', delay != null ? { delay } : undefined);
  const grad = parseGradient(bg.gradient) || { angle: 135, from: '#0b3d5c', to: '#f2a541' };
  return (
    <>
      <Segmented value={type} onChange={(t) => set(t === 'none' ? null : { type: t }, 0)} options={BG_TYPES} />
      <p className="text-[11px] text-zinc-400">Backgrounds apply to every screen size.</p>
      {type === 'color' && (
        <Row label="Colour">
          <ColorInput value={bg.color} onChange={(v) => set({ color: v || null })} swatches={swatches} />
        </Row>
      )}
      {type === 'gradient' && (
        <>
          <Row label="From">
            <ColorInput value={grad.from} onChange={(v) => v && set({ gradient: gradientString({ ...grad, from: v }) })} swatches={swatches} />
          </Row>
          <Row label="To">
            <ColorInput value={grad.to} onChange={(v) => v && set({ gradient: gradientString({ ...grad, to: v }) })} swatches={swatches} />
          </Row>
          <Row label="Angle">
            <Range value={grad.angle} min={0} max={360} step={5} suffix="°" onChange={(v) => set({ gradient: gradientString({ ...grad, angle: v }) })} />
          </Row>
        </>
      )}
      {type === 'image' && (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="sb-checker flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200"
              onClick={() => setState({ modal: { type: 'assets', kind: 'image', title: 'Background image', onPick: (a) => set({ image: a.path }, 0) } })}
              title="Choose image"
            >
              {bg.image ? <img src={api.assetUrl(projectId, bg.image)} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={18} className="text-zinc-400" />}
            </button>
            <CommitInput value={bg.image} placeholder="/assets/…" onCommit={(v) => set({ image: v || null }, 0)} />
          </div>
          <Row label="Size">
            <Select value={bg.size || 'cover'} onChange={(v) => set({ size: v })} options={['cover', 'contain', 'auto', '100% 100%']} />
          </Row>
          <Row label="Position">
            <Select value={bg.position || 'center'} onChange={(v) => set({ position: v })} options={['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right']} />
          </Row>
          <Row label="Repeat">
            <Select value={bg.repeat || 'no-repeat'} onChange={(v) => set({ repeat: v })} options={['no-repeat', 'repeat', 'repeat-x', 'repeat-y']} />
          </Row>
          <Toggle label="Fixed while scrolling" checked={!!bg.fixed} onChange={(v) => set({ fixed: v || null }, 0)} />
        </>
      )}
      {(type === 'image' || type === 'gradient') && (
        <Row label="Overlay">
          <ColorInput value={bg.overlay} placeholder="rgba(0,0,0,.4)" onChange={(v) => set({ overlay: v || null })} swatches={[{ value: 'rgba(0,0,0,.45)', color: 'rgba(0,0,0,.45)', label: 'Dark' }, { value: 'rgba(255,255,255,.55)', color: 'rgba(255,255,255,.55)', label: 'Light' }]} />
        </Row>
      )}
    </>
  );
}

function HoverEditor({ id, hover = {}, swatches }) {
  const set = (prop, v) => updateDesign({ id, patch: { hover: { [prop]: v ? String(v).trim() : null } } }, 'Hover style');
  return (
    <>
      <Row label="Text colour" set={!!hover.color}>
        <ColorInput value={hover.color} onChange={(v) => set('color', v)} swatches={swatches} />
      </Row>
      <Row label="Background" set={!!hover.backgroundColor}>
        <ColorInput value={hover.backgroundColor} onChange={(v) => set('backgroundColor', v)} swatches={swatches} />
      </Row>
      <Row label="Border" set={!!hover.borderColor}>
        <ColorInput value={hover.borderColor} onChange={(v) => set('borderColor', v)} swatches={swatches} />
      </Row>
      <p className="text-[11px] text-zinc-400">Motion on hover (lift, grow, glow…) is in the Animate tab.</p>
    </>
  );
}
