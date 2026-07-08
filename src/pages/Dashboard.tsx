// Dashboard: stats at a glance, quick actions, recent activity feed.

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getDashboardStats, recentActivity } from '../lib/db'
import type { Activity, DashboardStats } from '../lib/types'
import { timeAgo } from '../lib/utils'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconCar,
  IconClock,
  IconGear,
  IconWarning,
  ListRow,
  LoadingScreen,
  PageTitle,
  SectionHeader,
} from '../components/ui'

// ------------------------------------------------------------- stat cards

type StatTone = 'red' | 'green' | 'blue' | 'orange' | 'gray'

const chipClasses: Record<StatTone, string> = {
  red: 'bg-ios-red/12 text-ios-red',
  green: 'bg-ios-green/15 text-ios-green',
  blue: 'bg-ios-blue/12 text-ios-blue',
  orange: 'bg-ios-orange/15 text-ios-orange',
  gray: 'bg-ios-gray/15 text-ios-gray',
}

function StatCard({
  value,
  label,
  tone,
  icon,
  onClick,
}: {
  value: number
  label: string
  tone: StatTone
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-[28px] leading-tight font-bold ${tone === 'gray' ? 'text-ios-gray' : 'text-ios-label'}`}>
            {value}
          </div>
          <div className="mt-0.5 text-[14px] text-ios-label2">{label}</div>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${chipClasses[tone]}`}>
          {icon}
        </span>
      </div>
    </Card>
  )
}

// -------------------------------------------------------- activity labels

const nounByTable: Record<string, string> = {
  vehicle_movements: 'movement',
  vehicle_returns: 'return',
  bookings: 'booking',
  vehicles: 'vehicle',
  customers: 'customer',
}

const verbByAction: Record<string, string> = {
  create: 'added',
  update: 'updated',
  delete: 'deleted',
  import: 'imported',
}

// ------------------------------------------------------------------ page

export default function Dashboard() {
  const navigate = useNavigate()
  const { staffName } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [s, a] = await Promise.all([getDashboardStats(), recentActivity(12)])
        if (cancelled) return
        setStats(s)
        setActivity(a)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const firstName = staffName.split(' ')[0]

  return (
    <div>
      <PageTitle
        right={
          <button
            type="button"
            aria-label="Settings"
            onClick={() => navigate('/settings')}
            className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full text-ios-blue active:opacity-60"
          >
            <IconGear size={24} />
          </button>
        }
      >
        In N Out
      </PageTitle>
      <p className="-mt-3 mb-4 px-1 text-[15px] text-ios-gray">Hi {firstName}</p>

      <ErrorBanner message={error} />

      {loading ? (
        <LoadingScreen />
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                value={stats.carsOut}
                label="Cars out"
                tone="red"
                icon={<IconArrowUp size={18} />}
                onClick={() => navigate('/cars')}
              />
              <StatCard
                value={stats.availableCars}
                label="Available cars"
                tone="green"
                icon={<IconCar size={18} />}
                onClick={() => navigate('/cars')}
              />
              <StatCard
                value={stats.returnedToday}
                label="Returned today"
                tone="blue"
                icon={<IconArrowDown size={18} />}
                onClick={() => navigate('/cars?filter=returned')}
              />
              <StatCard
                value={stats.goingOutToday}
                label="Going out today"
                tone="orange"
                icon={<IconCalendar size={18} />}
                onClick={() => navigate('/bookings')}
              />
              <StatCard
                value={stats.bookedCars}
                label="Booked"
                tone="orange"
                icon={<IconCalendar size={18} />}
                onClick={() => navigate('/bookings')}
              />
              <StatCard
                value={stats.needsAttention}
                label="Needs attention"
                tone={stats.needsAttention > 0 ? 'red' : 'gray'}
                icon={<IconWarning size={18} />}
                onClick={() => navigate('/review')}
              />
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <Button className="flex-1" onClick={() => navigate('/new')}>
              New movement
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => navigate('/return')}>
              Record return
            </Button>
          </div>

          <SectionHeader>Recent activity</SectionHeader>
          <Card>
            {activity.length === 0 ? (
              <EmptyState
                icon={<IconClock size={32} />}
                title="No activity yet"
                hint="Movements, returns and bookings will show up here."
              />
            ) : (
              activity.map((a) => {
                const noun = nounByTable[a.table_name] ?? 'spreadsheet'
                const verb = verbByAction[a.action] ?? a.action
                const tappable = noun === 'movement' || noun === 'return' || noun === 'booking'
                return (
                  <ListRow
                    key={a.id}
                    onClick={tappable ? () => navigate(`/record/${noun}/${a.record_id}`) : undefined}
                    title={`${a.staffName} ${verb} a ${noun}`}
                    right={
                      <span className="shrink-0 text-[14px] text-ios-gray">{timeAgo(a.created_at)}</span>
                    }
                  />
                )
              })
            )}
          </Card>
        </>
      )}
    </div>
  )
}
