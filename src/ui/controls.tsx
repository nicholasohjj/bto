import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { GLOSSARY, type Term } from './glossary'

/** Small "i" button that shows a plain-English explanation. Tap or hover. */
export function InfoTip({ term, text }: { term?: Term; text?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const id = useId()
  const body = text ?? (term ? GLOSSARY[term] : '')
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const hide = () => setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="What does this mean?"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault()
          // Position in the viewport (fixed), clamped so it never runs off-screen on phones.
          const r = e.currentTarget.getBoundingClientRect()
          const width = Math.min(256, window.innerWidth - 16)
          const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8))
          const below = r.bottom + 8
          setPos({ left, top: below, width })
          setOpen((o) => !o)
        }}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        i
      </button>
      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
          className="fixed z-50 block max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal leading-relaxed whitespace-normal text-ink-2 shadow-lg"
        >
          {body}
        </span>
      )}
    </span>
  )
}

/** Inline term with a dotted underline + tooltip. */
export function T({ term, children }: { term: Term; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap">
      <span className="underline decoration-dotted decoration-muted underline-offset-2">{children}</span>
      <InfoTip term={term} />
    </span>
  )
}

export function Field({ label, tip, tipText, hint, children }: { label: ReactNode; tip?: Term; tipText?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center text-xs font-medium text-ink-2">
        {label}
        {(tip || tipText) && <InfoTip term={tip} text={tipText} />}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm tnum outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

/** Number input that lets you type freely and commits parseable values. */
export function NumberInput({
  value, onChange, prefix, suffix, step, min, max, ariaLabel,
}: { value: number; onChange: (n: number) => void; prefix?: string; suffix?: string; step?: number; min?: number; max?: number; ariaLabel?: string }) {
  // While focused, show what the user typed; otherwise show the formatted value.
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="relative flex items-center">
      {prefix && <span className="pointer-events-none absolute left-3 text-sm text-muted">{prefix}</span>}
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        className={`${inputCls} ${prefix ? 'pl-7' : ''} ${suffix ? 'pr-12' : ''}`}
        value={draft ?? fmtNum(value)}
        step={step}
        onFocus={() => setDraft(String(round(value)))}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value.replace(/[,\s$%]/g, ''))
          if (e.target.value.trim() !== '' && Number.isFinite(n)) {
            onChange(clamp(n, min, max))
          }
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 text-sm text-muted">{suffix}</span>}
    </div>
  )
}

export function MoneyInput(props: { value: number; onChange: (n: number) => void; ariaLabel?: string; min?: number }) {
  return <NumberInput prefix="$" min={props.min ?? 0} {...props} />
}

/** Edits a fraction (0.026) as a percent (2.6). */
export function PercentInput({ value, onChange, max = 100, ariaLabel }: { value: number; onChange: (n: number) => void; max?: number; ariaLabel?: string }) {
  return <NumberInput suffix="%" min={0} max={max} value={round(value * 100, 4)} onChange={(n) => onChange(n / 100)} ariaLabel={ariaLabel} />
}

export function MonthInput({ value, onChange, ariaLabel }: { value: string; onChange: (ym: string) => void; ariaLabel?: string }) {
  return (
    <input
      type="month"
      min="1900-01"
      max="2199-12"
      aria-label={ariaLabel}
      className={inputCls}
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
    />
  )
}

export function TextInput({ value, onChange, ariaLabel, placeholder }: { value: string; onChange: (s: string) => void; ariaLabel?: string; placeholder?: string }) {
  return <input className={inputCls} value={value} aria-label={ariaLabel} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Select<V extends string>({ value, onChange, options, ariaLabel }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; ariaLabel?: string }) {
  return (
    <select className={inputCls} value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value as V)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Segmented<V extends string>({ value, onChange, options, ariaLabel }: { value: V; onChange: (v: V) => void; options: { value: V; label: string }[]; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-full rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-sm leading-tight transition-colors sm:px-3 ${value === o.value ? 'bg-surface font-medium text-ink shadow-sm ring-1 ring-accent/60' : 'text-ink-2 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, tip }: { checked: boolean; onChange: (b: boolean) => void; label: ReactNode; tip?: Term }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="flex min-w-0 flex-wrap items-center text-sm text-ink">{label}{tip && <InfoTip term={tip} />}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface-2 border border-line'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, ariaLabel }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; ariaLabel?: string }) {
  return (
    <input
      type="range"
      aria-label={ariaLabel}
      className="w-full accent-[var(--accent)]"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface p-4 ${className}`}>{children}</div>
}

export function Button({ children, onClick, variant = 'secondary', type = 'button', disabled, className = '', ariaLabel }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string; ariaLabel?: string
}) {
  const styles = {
    primary: 'bg-accent text-white hover:opacity-90',
    secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    danger: 'border border-line bg-surface text-critical hover:bg-surface-2',
  }[variant]
  return (
    <button type={type} disabled={disabled} onClick={onClick} aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${styles} ${className}`}>
      {children}
    </button>
  )
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return ''
  return round(n, 2).toLocaleString('en-SG', { maximumFractionDigits: 2 })
}
function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}
function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}
