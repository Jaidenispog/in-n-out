// Returns history — every recorded return, sortable. (Reached from Today / Settings.)

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listReturns } from '../lib/db'
import type { Return } from '../lib/types'
import {
  Card, EmptyState, ErrorBanner, IconArrowUp, IconChevronLeft, LoadingScreen, PageTitle, SegmentedControl, SortControl,
} from '../components/ui'
import { ReturnCard } from '../components/cards'

type SortKey = 'newest' | 'oldest' | 'rego' | 'driver'
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rego', label: 'Rego (A–Z)' },
  { value: 'driver', label: 'Driver name (A–Z)' },
]

type Filter = 'all' | 'loaner' | 'handback'
const FILTER_OPTS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'loaner', label: 'Loaner returns' },
  { value: 'handback', label: 'Hand-backs' },
]

export default function Returns() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paramFilter = searchParams.get('filter') as Filter | null
  const [returns, setReturns] = useState<Return[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [filter, setFilter] = useState<Filter>(paramFilter === 'handback' || paramFilter === 'loaner' ? paramFilter : 'all')

  useEffect(() => {
    let cancelled = false
    listReturns(300)
      .then((rs) => { if (!cancelled) setReturns(rs) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load returns') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(() => {
    let arr = [...returns]
    if (filter === 'handback') arr = arr.filter((r) => r.source_sheet === 'handback')
    else if (filter === 'loaner') arr = arr.filter((r) => r.source_sheet !== 'handback')
    if (sort === 'oldest') return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (sort === 'rego') return arr.sort((a, b) => (a.returned_rego || '').localeCompare(b.returned_rego || ''))
    if (sort === 'driver') return arr.sort((a, b) => {
      const ad = (a.driver_name || '').trim(), bd = (b.driver_name || '').trim()
      return (!ad !== !bd) ? (ad ? -1 : 1) : ad.localeCompare(bd)
    })
    return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [returns, sort, filter])

  return (
    <div className="pt-2">
      <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-2 mb-1 flex h-11 items-center pr-3 text-[17px] font-medium text-ios-blue">
        <IconChevronLeft size={26} /> Back
      </button>
      <PageTitle>Returns history</PageTitle>
      <ErrorBanner message={error} />
      <SegmentedControl<Filter> options={FILTER_OPTS} value={filter} onChange={setFilter} />
      <div className="mt-2 mb-2 flex items-center justify-between">
        <span className="px-1 text-[14px] text-ios-label2">
          {sorted.length} {filter === 'handback' ? 'hand-back' : 'return'}{sorted.length === 1 ? '' : 's'}{returns.length >= 300 ? '+' : ''}
        </span>
        <SortControl<SortKey> value={sort} onChange={setSort} options={SORT_OPTS} />
      </div>
      {loading ? (
        <LoadingScreen />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<IconArrowUp size={40} />}
          title={filter === 'handback' ? 'No hand-backs yet' : 'No returns yet'}
          hint={filter === 'handback' ? 'Repaired cars handed back to customers will appear here.' : 'Recorded returns will appear here.'}
        />
      ) : (
        <Card>{sorted.map((r) => <ReturnCard key={r.id} ret={r} />)}</Card>
      )}
    </div>
  )
}
