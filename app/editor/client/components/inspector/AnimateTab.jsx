// Animate: entrance, text, loop, hover and parallax effects (design.json elements.<id>.animation),
// played by runtime/sb-animate.js (GSAP + ScrollTrigger) on the published site.
import { Play, RotateCcw } from 'lucide-react';
import { useStore } from '../../store.js';
import { preview } from '../../lib/bridge.js';
import { updateDesign } from '../../actions.js';
import { EASES, ENTRANCE_PRESETS, HOVER_PRESETS, LOOP_PRESETS, TEXT_PRESETS } from '../../../../processing/template-runtime/lib/design.mjs';
import { Group, Range, Row, Segmented, Select, Toggle } from '../ui.jsx';

const options = (presets) => Object.entries(presets).map(([value, p]) => ({ value, label: p.label }));
const TRIGGERS = [
  { value: 'scroll', label: 'On scroll' },
  { value: 'load', label: 'On load' },
  { value: 'scrub', label: 'Scrub' },
];

export function AnimateTab({ info }) {
  const id = info.id;
  const anim = useStore((s) => s.data.design.elements?.[id]?.animation) || {};
  const set = (kind, value, { play = true } = {}) => {
    updateDesign({ id, patch: { animation: { [kind]: value } } }, 'Animation');
    if (play && value && kind !== 'hover') setTimeout(() => preview.play(id), 30);
  };
  const setPreset = (kind, preset) => set(kind, preset ? { ...(anim[kind] || {}), preset } : null);
  // `null` (not undefined, which JSON drops) removes a setting.
  const field = (kind, key, value) => set(kind, { ...anim[kind], [key]: value ?? null });
  const hasText = !!info.snippet && !info.isSection;

  return (
    <>
      <div className="flex gap-2 border-b border-zinc-100 px-3 py-2">
        <button type="button" className="sb-btn flex-1" onClick={() => preview.play(id)} disabled={!anim.entrance && !anim.text && !anim.loop && !anim.parallax}>
          <Play size={13} /> Preview
        </button>
        <button type="button" className="sb-btn flex-1" onClick={() => preview.play(null)}>
          <Play size={13} /> Play page
        </button>
        <button type="button" className="sb-btn" title="Stop and reset" onClick={() => preview.win?.__sbAnimate?.reset()}>
          <RotateCcw size={13} />
        </button>
      </div>

      <Group title="Entrance">
        <Row label="Effect" set={!!anim.entrance}>
          <Select value={anim.entrance?.preset} onChange={(v) => setPreset('entrance', v)} options={options(ENTRANCE_PRESETS)} placeholder="None" />
        </Row>
        {anim.entrance && (
          <>
            <Timing a={anim.entrance} onChange={(k, v) => field('entrance', k, v)} />
            {/^(fade-|rotate)/.test(anim.entrance.preset) && (
              <Row label="Distance">
                <Range value={anim.entrance.distance ?? 40} min={0} max={200} step={5} suffix="px" onChange={(v) => field('entrance', 'distance', v)} />
              </Row>
            )}
            <Toggle label="One after another (children)" checked={!!anim.entrance.stagger} onChange={(v) => field('entrance', 'stagger', v || undefined)} />
            {anim.entrance.stagger && (
              <Row label="Stagger">
                <Range value={anim.entrance.staggerAmount ?? 0.12} min={0.02} max={0.6} step={0.02} suffix="s" onChange={(v) => field('entrance', 'staggerAmount', v)} />
              </Row>
            )}
          </>
        )}
      </Group>

      {hasText && (
        <Group title="Text effect" defaultOpen={!!anim.text}>
          <Row label="Effect" set={!!anim.text}>
            <Select value={anim.text?.preset} onChange={(v) => setPreset('text', v)} options={options(TEXT_PRESETS)} placeholder="None" />
          </Row>
          {anim.text && (
            <>
              <Timing a={anim.text} onChange={(k, v) => field('text', k, v)} />
              <Row label="Stagger">
                <Range value={anim.text.staggerAmount ?? (TEXT_PRESETS[anim.text.preset]?.split === 'chars' ? 0.025 : 0.06)} min={0.01} max={0.3} step={0.005} suffix="s" onChange={(v) => field('text', 'staggerAmount', v)} />
              </Row>
              {anim.entrance && <p className="text-[11px] text-amber-700">The text effect replaces the entrance effect on this element.</p>}
            </>
          )}
        </Group>
      )}

      <Group title="Loop" defaultOpen={!!anim.loop}>
        <Row label="Effect" set={!!anim.loop}>
          <Select value={anim.loop?.preset} onChange={(v) => setPreset('loop', v)} options={options(LOOP_PRESETS)} placeholder="None" />
        </Row>
        {anim.loop && (
          <>
            <Row label="Duration">
              <Range value={anim.loop.duration ?? 2.4} min={0.4} max={10} step={0.1} suffix="s" onChange={(v) => field('loop', 'duration', v)} />
            </Row>
            <Row label="Delay">
              <Range value={anim.loop.delay ?? 0} min={0} max={5} step={0.1} suffix="s" onChange={(v) => field('loop', 'delay', v)} />
            </Row>
          </>
        )}
      </Group>

      <Group title="Hover" defaultOpen={!!anim.hover}>
        <Row label="Effect" set={!!anim.hover}>
          <Select value={anim.hover} onChange={(v) => set('hover', v || null)} options={options(HOVER_PRESETS)} placeholder="None" />
        </Row>
        {anim.hover && <p className="text-[11px] text-zinc-400">Hover over the element in the preview to try it.</p>}
      </Group>

      <Group title="Parallax" defaultOpen={!!anim.parallax}>
        <Row label="Speed" set={!!anim.parallax}>
          <Range value={anim.parallax?.speed ?? 0} min={-1} max={1} step={0.05} onChange={(v) => set('parallax', v ? { ...anim.parallax, speed: v } : null, { play: false })} />
        </Row>
        {anim.parallax && (
          <Row label="Moves">
            <Segmented
              value={anim.parallax.mode || 'element'}
              onChange={(v) => set('parallax', { ...anim.parallax, mode: v }, { play: false })}
              options={[
                { value: 'element', label: 'Element' },
                { value: 'background', label: 'Background' },
              ]}
            />
          </Row>
        )}
        <p className="text-[11px] text-zinc-400">Parallax follows scrolling; scroll the preview after pressing Preview.</p>
      </Group>
    </>
  );
}

function Timing({ a, onChange }) {
  return (
    <>
      <Row label="Starts">
        <Segmented value={a.trigger || 'scroll'} onChange={(v) => onChange('trigger', v === 'scroll' ? undefined : v)} options={TRIGGERS} />
      </Row>
      <Row label="Duration">
        <Range value={a.duration ?? 0.9} min={0.1} max={4} step={0.1} suffix="s" onChange={(v) => onChange('duration', v)} />
      </Row>
      <Row label="Delay">
        <Range value={a.delay ?? 0} min={0} max={4} step={0.1} suffix="s" onChange={(v) => onChange('delay', v)} />
      </Row>
      <Row label="Easing">
        <Select value={a.ease || ''} onChange={(v) => onChange('ease', v || undefined)} options={EASES} placeholder="Default" />
      </Row>
      {(a.trigger || 'scroll') === 'scroll' && <Toggle label="Replay when scrolling back" checked={!!a.replay} onChange={(v) => onChange('replay', v || undefined)} />}
    </>
  );
}
