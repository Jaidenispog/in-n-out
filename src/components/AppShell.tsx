import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  IconArrowDown, IconArrowUp, IconCalendar, IconCar, IconHome, IconPlus, IconSearch, Sheet,
} from './ui'

const tabs = [
  { to: '/', label: 'Home', icon: IconHome },
  { to: '/cars', label: 'Cars', icon: IconCar },
  { to: '/bookings', label: 'Bookings', icon: IconCalendar },
  { to: '/search', label: 'Search', icon: IconSearch },
]

export default function AppShell() {
  const [actionOpen, setActionOpen] = useState(false)
  const navigate = useNavigate()

  const go = (path: string) => {
    setActionOpen(false)
    navigate(path)
  }

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      <main className="pt-safe px-4 pb-32">
        <Outlet />
      </main>

      {/* Bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-ios-sep bg-ios-card/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.slice(0, 2).map((t) => (
            <Tab key={t.to} {...t} />
          ))}
          <button
            type="button"
            aria-label="Quick add"
            onClick={() => setActionOpen(true)}
            className="-mt-4 flex flex-col items-center px-3"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ios-blue text-white shadow-lg">
              <IconPlus size={28} />
            </span>
          </button>
          {tabs.slice(2).map((t) => (
            <Tab key={t.to} {...t} />
          ))}
        </div>
      </nav>

      {/* Quick actions */}
      <Sheet open={actionOpen} onClose={() => setActionOpen(false)} title="Quick add">
        <div className="flex flex-col gap-2">
          <ActionRow
            icon={<IconCar size={22} />}
            iconBg="bg-ios-blue"
            title="Rent a car out"
            subtitle="Our car out on rent — driver, rego, photos"
            onClick={() => go('/rent')}
          />
          <ActionRow
            icon={<IconArrowDown size={22} />}
            iconBg="bg-ios-gray"
            title="New movement"
            subtitle="Customer car in · our car out"
            onClick={() => go('/new')}
          />
          <ActionRow
            icon={<IconArrowUp size={22} />}
            iconBg="bg-ios-green"
            title="Record return"
            subtitle="Customer brings our car back"
            onClick={() => go('/return')}
          />
          <ActionRow
            icon={<IconCar size={22} />}
            iconBg="bg-ios-red"
            title="Customer car intake"
            subtitle="Damaged car dropped in — no rental out"
            onClick={() => go('/intake')}
          />
          <ActionRow
            icon={<IconCar size={22} />}
            iconBg="bg-ios-green"
            title="Give car back"
            subtitle="Repaired car returned to customer + tow card"
            onClick={() => go('/handback')}
          />
          <ActionRow
            icon={<IconCalendar size={22} />}
            iconBg="bg-ios-orange"
            title="New booking"
            subtitle="Reserve a car for later"
            onClick={() => go('/bookings?new=1')}
          />
        </div>
      </Sheet>
    </div>
  )
}

function Tab({ to, label, icon: Icon }: { to: string; label: string; icon: (p: { size?: number; className?: string }) => React.JSX.Element }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-w-16 flex-col items-center gap-0.5 px-2 pt-2 pb-1.5 text-[11px] font-medium ${
          isActive ? 'text-ios-blue' : 'text-ios-gray'
        }`
      }
    >
      <Icon size={24} />
      {label}
    </NavLink>
  )
}

function ActionRow({
  icon, iconBg, title, subtitle, onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-ios-card px-4 py-3.5 text-left shadow-card"
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-full text-white ${iconBg}`}>{icon}</span>
      <span>
        <span className="block text-[17px] font-semibold">{title}</span>
        <span className="block text-[14px] text-ios-label2">{subtitle}</span>
      </span>
    </button>
  )
}
