// Today's activity — our cars out, customer cars in, and returns recorded today.
// Reached from the Dashboard buttons (?view=out|in|returned).

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listTodaysMovements, listTodaysReturns } from '../lib/db'
import type { Movement, Return } from '../lib/types'
import {
  Card, EmptyState, ErrorBanner, IconArrowDown, IconArrowUp, LoadingScreen,
  PageTitle, SegmentedControl, SortControl,
} from '../components/ui'
import { MovementCard, ReturnCard } from '../components/cards'

type View = 'out' | 'in' | 'returned'
type SortKey = 'newest' | 'oldest' | 'rego' | 'driver'

const VIEWS: View[] = ['out', 'in', 'returned']
const VIEW_LABEL: Record<View, string> = { out: 'Cars out', in: 'Customer cars in', returned: 'Returned' }
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rego', label: 'Rego (A–Z)' },
  { value: 'driver', label: 'Driver name (A–Z)' },
]

export default function Today() {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramView = searchParams.get('view') as View | null
  const [view, setView] = useState<View>(paramView && VIEWS.includes(paramView) ? paramView : 'out')
  const [sort, setSort] = useState<SortKey>('newest')
  const [movements, setMovements] = useState<Movement[]>([])
  const [returns, setReturns] = useState<Return[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [mv, rt] = await Promise.all([listTodaysMovements(), listTodaysReturns()])
        if (cancelled) return
        setMovements(mv)
        setReturns(rt)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load today')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const pickView = (v: View) => {
    setView(v)
    const p = new URLSearchParams(searchParams)
    p.set('view', v)
    setSearchParams(p, { replace: true })
  }

  const outMovements = useMemo(() => movements.filter((m) => m.cars_out_rego), [movements])
  const inMovements = useMemo(() => movements.filter((m) => m.cars_in_rego), [movements])
  const counts: Record<View, number> = { out: outMovements.length, in: inMovements.length, returned: returns.length }
  const viewOptions = VIEWS.map((v) => ({ value: v, label: `${VIEW_LABEL[v]} ${counts[v]}` }))

  const sortedMovements = (list: Movement[], regoField: 'cars_out_rego' | 'cars_in_rego') => {
    const arr = [...list]
    if (sort === 'oldest') return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (sort === 'rego') return arr.sort((a, b) => (a[regoField] || '').localeCompare(b[regoField] || ''))
    if (sort === 'driver') return arr.sort((a, b) => (a.driver_name || '~').localeCompare(b.driver_name || '~'))
    return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  const sortedReturns = () => {
    const arr = [...returns]
    if (sort === 'oldest') return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (sort === 'rego') return arr.sort((a, b) => (a.returned_rego || '').localeCompare(b.returned_rego || ''))
    if (sort === 'driver') return arr.sort((a, b) => (a.driver_name || '~').localeCompare(b.driver_name || '~'))
    return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  return (
    <div className="pt-4">
      <PageTitle>Today</PageTitle>
      <ErrorBanner message={error} />

      <SegmentedControl<View> options={viewOptions} value={view} onChange={pickView} />
      <div className="mt-2 flex justify-end">
        <SortControl<SortKey> value={sort} onChange={setSort} options={SORT_OPTS} />
      </div>

      {loading ? (
        <LoadingScreen />
      ) : view === 'returned' ? (
        sortedReturns().length === 0 ? (
          <EmptyState icon={<IconArrowDown size={40} />} title="No returns today" hint="Cars returned today will appear here." />
        ) : (
          <Card className="mt-3">{sortedReturns().map((r) => <ReturnCard key={r.id} ret={r} />)}</Card>
        )
      ) : (
        (() => {
          const list = view === 'out' ? sortedMovements(outMovements, 'cars_out_rego') : sortedMovements(inMovements, 'cars_in_rego')
          return list.length === 0 ? (
            <EmptyState icon={<IconArrowUp size={40} />} title={view === 'out' ? 'No cars out today' : 'No customer cars in today'} hint="Movements recorded today will appear here." />
          ) : (
            <Card className="mt-3">{list.map((m) => <MovementCard key={m.id} movement={m} />)}</Card>
          )
        })()
      )}
    </div>
  )
}
