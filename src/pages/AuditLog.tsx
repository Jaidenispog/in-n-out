// Activity log — the full who-did-what feed (§9 Staff Activity / Audit Log).

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { recentActivity } from '../lib/db'
import type { Activity } from '../lib/types'
import {
  Card, EmptyState, ErrorBanner, IconChevronLeft, IconClock, ListRow, LoadingScreen, PageTitle,
} from '../components/ui'
import { timeAgo } from '../lib/utils'

// Kept identical to the Dashboard's recent-activity wording for consistency.
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

export default function AuditLog() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    recentActivity(100)
      .then((a) => { if (!cancelled) setItems(a) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load activity') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="pt-2">
      <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-2 mb-1 flex h-11 items-center pr-3 text-[17px] font-medium text-ios-blue">
        <IconChevronLeft size={26} /> Back
      </button>
      <PageTitle>Activity log</PageTitle>
      <ErrorBanner message={error} />
      {loading ? (
        <LoadingScreen />
      ) : items.length === 0 ? (
        <EmptyState icon={<IconClock size={40} />} title="No activity yet" hint="Everything staff create or change shows here." />
      ) : (
        <Card>
          {items.map((a) => {
            const noun = nounByTable[a.table_name] ?? 'spreadsheet'
            const verb = verbByAction[a.action] ?? a.action
            const tappable = noun === 'movement' || noun === 'return' || noun === 'booking'
            return (
              <ListRow
                key={a.id}
                onClick={tappable ? () => navigate(`/record/${noun}/${a.record_id}`) : undefined}
                title={`${a.staffName} ${verb} a ${noun}`}
                right={<span className="shrink-0 text-[14px] text-ios-gray">{timeAgo(a.created_at)}</span>}
              />
            )
          })}
        </Card>
      )}
    </div>
  )
}
