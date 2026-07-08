// Returns history — every recorded return, sortable. (Reached from Today / Settings.)

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listReturns } from '../lib/db'
import type { Return } from '../lib/types'
import {
  Card, EmptyState, ErrorBanner, IconArrowUp, IconChevronLeft, LoadingScreen, PageTitle, SortControl,
} from '../components/ui'
import { ReturnCard } from '../components/cards'

type SortKey = 'newest' | 'oldest' | 'rego' | 'driver'
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rego', label: 'Rego (A–Z)' },
  { value: 'driver', label: 'Driver name (A–Z)' },
]

export default function Returns() {
  const navigate = useNavigate()
  const [returns, setReturns] = useState<Return[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')

  useEffect(() => {
    let cancelled = false
    listReturns(300)
      .then((rs) => { if (!cancelled) setReturns(rs) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load returns') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const sorted = useMemo(() => {
    const arr = [...returns]
    if (sort === 'oldest') return arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (sort === 'rego') return arr.sort((a, b) => (a.returned_rego || '').localeCompare(b.returned_rego || ''))
    if (sort === 'driver') return arr.sort((a, b) => {
      const ad = (a.driver_name || '').trim(), bd = (b.driver_name || '').trim()
      return (!ad !== !bd) ? (ad ? -1 : 1) : ad.localeCompare(bd)
    })
    return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [returns, sort])

  return (
    <div className="pt-2">
      <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-2 mb-1 flex h-11 items-center pr-3 text-[17px] font-medium text-ios-blue">
        <IconChevronLeft size={26} /> Back
      </button>
      <PageTitle>Returns history</PageTitle>
      <ErrorBanner message={error} />
      <div className="mb-2 flex items-center justify-between">
        <span className="px-1 text-[14px] text-ios-label2">{returns.length} return{returns.length === 1 ? '' : 's'}{returns.length >= 300 ? '+' : ''}</span>
        <SortControl<SortKey> value={sort} onChange={setSort} options={SORT_OPTS} />
      </div>
      {loading ? (
        <LoadingScreen />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<IconArrowUp size={40} />} title="No returns yet" hint="Recorded returns will appear here." />
      ) : (
        <Card>{sorted.map((r) => <ReturnCard key={r.id} ret={r} />)}</Card>
      )}
    </div>
  )
}
