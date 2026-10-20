// Small UI primitives for the editor chrome.
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { toHex } from '../lib/style.js';

export const cn = (...a) => twMerge(clsx(a));

export function IconButton({ icon: Icon, title, active, className, size = 15, ...rest }) {
  return (
    <button type="button" title={title} aria-label={title} className={cn('sb-icon-btn', active && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent', className)} {...rest}>
      <Icon size={size} strokeWidth={1.8} />
    </button>
  );
}

export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('flex gap-0.5 rounded-lg bg-zinc-100 p-0.5', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn('flex-1 rounded-md px-2 py-1 text-[12px] font-medium text-zinc-500 transition hover:text-zinc-800', value === t.id && 'bg-white text-zinc-900 shadow-sm')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('flex rounded-md border border-zinc-200 bg-white p-0.5', className)}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title || o.label}
            onClick={() => onChange(value === o.value && o.toggle ? '' : o.value)}
            className={cn('flex flex-1 items-center justify-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-500 hover:text-zinc-900', value === o.value && 'bg-accent-soft text-accent hover:text-accent')}
          >
            {Icon ? <Icon size={14} /> : o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Collapsible inspector group. */
export function Group({ title, children, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-zinc-100 px-3 py-2.5">
      <div className="flex items-center">
        <button type="button" onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-800">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {title}
        </button>
        {right}
      </div>
      {open && <div className="mt-2.5 space-y-2.5">{children}</div>}
    </section>
  );
}

export function Row({ label, children, set, className }) {
  return (
    <div className={cn('grid grid-cols-[84px_1fr] items-center gap-2', className)} role="group" aria-label={label}>
      <span className={cn('truncate text-[11px] text-zinc-500', set && 'font-medium text-accent')}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Text input that commits on blur / Enter (Escape reverts). `numeric` enables arrow-key steps on
 * the leading number ("16px" -> "17px", Shift = 10).
 */
export function CommitInput({ value, onCommit, multiline = false, numeric = false, rows = 3, className, placeholder, ...rest }) {
  const [v, setV] = useState(value ?? '');
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value ?? '');
  }, [value]);
  const commit = (next = v) => {
    if ((next ?? '') !== (value ?? '')) onCommit(next);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setV(value ?? '');
      e.currentTarget.blur();
    } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit();
    } else if (numeric && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const m = /^(-?\d*\.?\d+)(.*)$/.exec(String(v || placeholder || '0').trim());
      if (!m) return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1) * (m[2] === '' && Number(m[1]) <= 3 && m[1].includes('.') ? 0.1 : 1);
      const next = `${Math.round((Number(m[1]) + step) * 100) / 100}${m[2]}`;
      setV(next);
      commit(next);
    }
    e.stopPropagation();
  };
  const props = {
    value: v,
    placeholder,
    onChange: (e) => setV(e.target.value),
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onKeyDown,
    className: cn('sb-input', multiline && 'resize-y font-[inherit] leading-snug', className),
    ...rest,
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />;
}

export function Select({ value, onChange, options, className, placeholder }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cn('sb-input pr-6', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px] text-zinc-600">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        onClick={() => onChange(!checked)}
        className={cn('relative h-[18px] w-8 rounded-full bg-zinc-300 transition', checked && 'bg-accent')}
      >
        <span className={cn('absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition', checked && 'translate-x-3.5')} />
      </button>
    </label>
  );
}

export function Range({ value, onChange, min = 0, max = 1, step = 0.01, suffix = '' }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value ?? min} onChange={(e) => onChange(Number(e.target.value))} className="h-1 flex-1 accent-[var(--color-accent)]" />
      <span className="w-10 text-right text-[11px] tabular-nums text-zinc-500">
        {value ?? '–'}
        {value != null ? suffix : ''}
      </span>
    </div>
  );
}

/** Colour value with picker, free text (rgba(), var(--…)) and theme swatches. */
export function ColorInput({ value, onChange, placeholder, swatches = [] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="sb-checker relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-zinc-200">
          <span className="absolute inset-0" style={{ background: value || placeholder || 'transparent' }} />
          <input type="color" value={toHex(value || placeholder)} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" title="Pick a colour" />
        </span>
        <CommitInput value={value} onCommit={onChange} placeholder={placeholder} />
        {value && <IconButton icon={X} title="Clear" onClick={() => onChange('')} className="h-6 w-6" size={13} />}
      </div>
      {swatches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {swatches.map((s) => (
            <button key={s.value} type="button" title={s.label} onClick={() => onChange(s.value)} className={cn('h-4 w-4 rounded-full border border-black/10', value === s.value && 'ring-2 ring-accent ring-offset-1')} style={{ background: s.color }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Badge({ children, tone = 'zinc', title }) {
  const tones = { zinc: 'bg-zinc-100 text-zinc-600', indigo: 'bg-indigo-50 text-indigo-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700' };
  return (
    <span title={title} className={cn('inline-flex items-center rounded px-1.5 py-px text-[10px] font-medium', tones[tone])}>
      {children}
    </span>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center text-zinc-500">
      {Icon && <Icon size={28} strokeWidth={1.4} className="mb-3 text-zinc-300" />}
      <div className="mb-1 text-[13px] font-medium text-zinc-700">{title}</div>
      <div className="text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn('flex max-h-full w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl', wide && 'max-w-4xl')} role="dialog" aria-label={title}>
        <div className="flex items-center border-b border-zinc-100 px-4 py-3">
          <h2 className="flex-1 text-[14px] font-semibold">{title}</h2>
          <IconButton icon={X} title="Close" onClick={onClose} />
        </div>
        <div className="sb-scroll min-h-0 flex-1 overflow-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
