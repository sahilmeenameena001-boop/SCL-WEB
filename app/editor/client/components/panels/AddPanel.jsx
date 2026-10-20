// Add: section blocks and elements. Drag onto the page, or click to insert next to the selection.
import { useState } from 'react';
import {
  CircleHelp, Code, Columns2, CreditCard, GalleryHorizontal, Heading1, Heading2, Image, LayoutTemplate, Mail, Megaphone, Minus, MousePointerClick,
  MoveVertical, Pilcrow, Quote, Search, Square, Star, Text, Type, Video,
} from 'lucide-react';
import { useStore } from '../../store.js';
import { addBlock, addElement } from '../../actions.js';
import { PanelHeader } from '../Editor.jsx';
import { dragProps } from '../Canvas.jsx';

const CATEGORY_ICONS = { Hero: LayoutTemplate, Features: Columns2, Content: Text, Media: GalleryHorizontal, Social: Star, Conversion: Megaphone, Pricing: CreditCard, Layout: Square, FAQ: CircleHelp };
const ELEMENT_ICONS = { heading: Heading1, subheading: Heading2, paragraph: Pilcrow, richtext: Type, button: MousePointerClick, image: Image, video: Video, embed: Code, quote: Quote, spacer: MoveVertical, divider: Minus };

export function AddPanel() {
  const blocks = useStore((s) => s.data.blocks);
  const elements = useStore((s) => s.data.elements);
  const [q, setQ] = useState('');
  const match = (label) => label.toLowerCase().includes(q.trim().toLowerCase());
  const categories = [...new Set(blocks.map((b) => b.category))];

  return (
    <>
      <PanelHeader title="Add" />
      <div className="border-b border-zinc-100 p-2">
        <div className="relative">
          <Search size={13} className="absolute top-2 left-2 text-zinc-400" />
          <input className="sb-input pl-7" placeholder="Search blocks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search blocks" />
        </div>
      </div>
      <div className="sb-scroll min-h-0 flex-1 space-y-4 overflow-auto p-3">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">Elements</h3>
          <div className="grid grid-cols-3 gap-1.5">
            {elements
              .filter((e) => match(e.label))
              .map((e) => {
                const Icon = ELEMENT_ICONS[e.id] || Square;
                return (
                  <button
                    key={e.id}
                    type="button"
                    title={`${e.label}: drag onto the page or click to insert after the selection`}
                    onClick={() => addElement(e.id)}
                    {...dragProps({ type: 'element', kind: e.id }, e.label)}
                    className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-zinc-200 bg-white px-1 py-2.5 text-[11px] text-zinc-600 transition hover:border-accent/50 hover:text-accent active:cursor-grabbing"
                  >
                    <Icon size={17} strokeWidth={1.6} />
                    <span className="w-full truncate text-center">{e.label}</span>
                  </button>
                );
              })}
          </div>
        </section>
        {categories.map((cat) => {
          const list = blocks.filter((b) => b.category === cat && match(`${b.label} ${cat}`));
          if (!list.length) return null;
          const Icon = CATEGORY_ICONS[cat] || Mail;
          return (
            <section key={cat}>
              <h3 className="mb-2 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">{cat}</h3>
              <div className="space-y-1.5">
                {list.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    title="Drag onto the page or click to add after the selected section"
                    onClick={() => addBlock(b.id)}
                    {...dragProps({ type: 'block', id: b.id }, b.label)}
                    className="flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left transition hover:border-accent/50 active:cursor-grabbing"
                  >
                    <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-50 to-zinc-100 text-indigo-500">
                      <Icon size={16} strokeWidth={1.6} />
                    </span>
                    <span className="text-[12px] leading-tight">{b.label}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
