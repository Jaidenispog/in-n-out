// Small Apple-style UI kit. Everything is plain Tailwind; big touch targets.
import { useEffect, useState, type ReactNode } from 'react'
import type { Tone } from '../lib/utils'

// ------------------------------------------------------------------ icons

type IconProps = { size?: number; className?: string }
const svg = (path: ReactNode, filled = false) =>
  function Icon({ size = 24, className = '' }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? 'currentColor' : 'none'}
        stroke={filled ? 'none' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        {path}
      </svg>
    )
  }

export const IconHome = svg(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />)
export const IconCar = svg(
  <>
    <path d="M5 11 6.5 6.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
    <path d="M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1M4 11a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1m0 0v2m14-2v2" />
    <circle cx="7.5" cy="14.5" r="0.5" fill="currentColor" />
    <circle cx="16.5" cy="14.5" r="0.5" fill="currentColor" />
  </>,
)
export const IconPlus = svg(<path d="M12 5v14M5 12h14" />)
export const IconCalendar = svg(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </>,
)
export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
)
export const IconGear = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </>,
)
export const IconChevronRight = svg(<path d="m9 6 6 6-6 6" />)
export const IconChevronLeft = svg(<path d="m15 6-6 6 6 6" />)
export const IconCamera = svg(
  <>
    <path d="M4 8h2.6a1 1 0 0 0 .9-.55L8.6 5.4A1 1 0 0 1 9.5 5h5a1 1 0 0 1 .9.4l1.1 2.05a1 1 0 0 0 .9.55H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </>,
)
export const IconImage = svg(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m21 15-4.5-4.5L7 19" />
  </>,
)
export const IconX = svg(<path d="M6 6l12 12M18 6 6 18" />)
export const IconCheck = svg(<path d="m4.5 12.5 5 5L19.5 7" />)
export const IconWarning = svg(
  <>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4M12 17.2v.05" />
  </>,
)
export const IconArrowDown = svg(<path d="M12 4v16m0 0-6-6m6 6 6-6" />)
export const IconArrowUp = svg(<path d="M12 20V4m0 0-6 6m6-6 6 6" />)
export const IconClock = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </>,
)
export const IconPerson = svg(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
  </>,
)
export const IconPhone = svg(
  <path d="M5 4h4l1.5 4.5-2.2 1.6a13 13 0 0 0 5.6 5.6l1.6-2.2L20 15v4a1.5 1.5 0 0 1-1.6 1.5C10.4 20 4 13.6 3.5 5.6A1.5 1.5 0 0 1 5 4Z" />,
)
export const IconDoc = svg(
  <>
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v5h5M9 12h6M9 16h6" />
  </>,
)
export const IconSort = svg(
  <>
    <path d="M3 6h11M3 12h8M3 18h5" />
    <path d="M17 5v14m0 0 4-4m-4 4-4-4" />
  </>,
)

// ----------------------------------------------------------------- badges

const toneClasses: Record<Tone, string> = {
  green: 'bg-ios-green/15 text-[#1d7a35]',
  red: 'bg-ios-red/12 text-ios-red',
  orange: 'bg-ios-orange/15 text-[#b06a00]',
  blue: 'bg-ios-blue/12 text-ios-blue',
  gray: 'bg-ios-gray/15 text-ios-label2',
  purple: 'bg-ios-purple/12 text-ios-purple',
}

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- buttons

const buttonVariants = {
  primary: 'bg-ios-blue text-white',
  secondary: 'bg-ios-gray5 text-ios-label',
  danger: 'bg-ios-red text-white',
  plain: 'bg-transparent text-ios-blue',
} as const

export function Button({
  variant = 'primary',
  full = false,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: {
  variant?: keyof typeof buttonVariants
  full?: boolean
  loading?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-[17px] font-semibold disabled:opacity-50 ${buttonVariants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner light={variant === 'primary' || variant === 'danger'} />}
      {children}
    </button>
  )
}

export function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-transparent ${light ? 'border-t-white border-r-white' : 'border-t-ios-blue border-r-ios-blue'}`}
    />
  )
}

// ------------------------------------------------------------------ cards

export function Card({ className = '', children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-card bg-ios-card shadow-card ${onClick ? 'cursor-pointer active:opacity-70' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-end justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-ios-label2 uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function ListRow({
  onClick,
  left,
  title,
  subtitle,
  right,
  chevron = true,
}: {
  onClick?: () => void
  left?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  chevron?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-ios-sep px-4 py-3 text-left last:border-b-0"
    >
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[17px] font-medium text-ios-label">{title}</div>
        {subtitle && <div className="truncate text-[14px] text-ios-label2">{subtitle}</div>}
      </div>
      {right}
      {chevron && onClick && <IconChevronRight size={18} className="shrink-0 text-ios-gray2" />}
    </button>
  )
}

// ------------------------------------------------------------------ forms

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 px-1 text-[13px] font-semibold tracking-wide text-ios-label2 uppercase">{label}</div>
      {children}
      {hint && <div className="mt-1 px-1 text-[13px] text-ios-gray">{hint}</div>}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-ios-sep bg-ios-card px-4 py-3 text-[17px] text-ios-label outline-none focus:border-ios-blue'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-2 text-[15px] font-semibold ${
            value === o.value ? 'bg-ios-blue text-white' : 'bg-ios-gray5 text-ios-label'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// A compact "Sort by" control: a pill button that opens a Sheet of options.
export function SortControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full bg-ios-gray5 px-3.5 py-1.5 text-[14px] font-semibold text-ios-label2 active:opacity-70"
      >
        <IconSort size={16} />
        {current ? current.label : 'Sort'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sort by">
        <div className="flex flex-col">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className="flex items-center justify-between border-b border-ios-sep px-2 py-3.5 text-left last:border-b-0"
            >
              <span className={`text-[17px] ${o.value === value ? 'font-semibold text-ios-blue' : 'text-ios-label'}`}>{o.label}</span>
              {o.value === value && <IconCheck size={20} className="text-ios-blue" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  )
}

// ----------------------------------------------------------------- sheets

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="pb-safe relative w-full max-w-lg rounded-t-3xl bg-ios-bg p-4 pb-8 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ios-gray2" />
        {title && <h3 className="mb-3 text-center text-[17px] font-semibold">{title}</h3>}
        {children}
      </div>
    </div>
  )
}

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = 'Continue anyway',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="mb-4 rounded-xl bg-ios-orange/10 px-4 py-3 text-[15px] text-ios-label">
        <span className="mr-1 inline-block align-middle text-ios-orange">
          <IconWarning size={18} />
        </span>
        {message}
      </div>
      <div className="flex flex-col gap-2">
        <Button variant={destructive ? 'danger' : 'primary'} full onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" full onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------------ misc

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      {icon && <div className="text-ios-gray2">{icon}</div>}
      <div className="text-[17px] font-semibold text-ios-label2">{title}</div>
      {hint && <div className="max-w-60 text-[14px] text-ios-gray">{hint}</div>}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="mb-3 rounded-xl bg-ios-red/10 px-4 py-3 text-[15px] font-medium text-ios-red">
      {message}
    </div>
  )
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h1 className="text-[28px] font-bold tracking-tight">{children}</h1>
      {right}
    </div>
  )
}

export function LoadingScreen() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}
