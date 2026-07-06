// Import review — messy rows from the old spreadsheet that need a human check.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listNeedsReview } from '../lib/db'
import type { Movement, Return } from '../lib/types'
import { formatDate, movementStatusLabel, movementStatusTone } from '../lib/utils'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  LoadingScreen,
  PageTitle,
  SegmentedControl,
} from '../components/ui'

type Tab = 'movements' | 'returns'

/** First clause of a (possibly long) import review reason, kept badge-sized. */
function shortReason(reason: string): string {
  const first = (reason || '').split(';')[0].trim()
  if (!first) return 'Needs review'
  return first.length > 40 ? first.slice(0, 40).trimEnd() + '…' : first
}

function MovementRow({ movement }: { movement: Movement }) {
  const navigate = useNavigate()
  const regos = [
    movement.cars_in_rego && `In: ${movement.cars_in_rego}`,
    movement.cars_out_rego && `Out: ${movement.cars_out_rego}`,
  ]
    .filter(Boolean)
    .join('  ·  ')
  return (
    <Card onClick={() => navigate(`/record/movement/${movement.id}`)} className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold text-ios-label">
            {regos || movement.rego_raw || 'Movement'}
          </div>
          <div className="mt-0.5 truncate text-[15px] text-ios-label2">
            {movement.driver_name || movement.client_details_raw || 'No driver recorded'}
            {' · '}
            {formatDate(movement.movement_date)}
          </div>
          {movement.status === 'active' && (
            <div className="mt-1 text-[13px] font-semibold text-ios-red">
              Possibly still out — confirm
            </div>
          )}
        </div>
        <IconChevronRight size={18} className="mt-1 shrink-0 text-ios-gray2" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Badge tone={movementStatusTone[movement.status]}>{movementStatusLabel[movement.status]}</Badge>
        <Badge tone="orange">{shortReason(movement.review_reason)}</Badge>
      </div>
    </Card>
  )
}

function ReturnRow({ ret }: { ret: Return }) {
  const navigate = useNavigate()
  return (
    <Card onClick={() => navigate(`/record/return/${ret.id}`)} className="p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-semibold text-ios-label">
            {ret.returned_rego || ret.returned_rego_raw || 'Return'}
          </div>
          <div className="mt-0.5 truncate text-[15px] text-ios-label2">
            {ret.driver_name || ret.driver_name_raw || 'No driver recorded'}
            {' · '}
            {formatDate(ret.return_date)}
          </div>
        </div>
        <IconChevronRight size={18} className="mt-1 shrink-0 text-ios-gray2" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Badge tone="orange">{shortReason(ret.review_reason)}</Badge>
      </div>
    </Card>
  )
}

export default function ImportReview() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('movements')
  const [data, setData] = useState<{ movements: Movement[]; returns: Return[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await listNeedsReview())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 'active' imported movements are possibly still out — surface them first.
  const movements = useMemo(() => {
    const ms = data?.movements ?? []
    return [...ms].sort(
      (a, b) => Number(b.status === 'active') - Number(a.status === 'active'),
    )
  }, [data])
  const returns = data?.returns ?? []

  const tabOptions: { value: Tab; label: string }[] = [
    { value: 'movements', label: `Movements ${movements.length}` },
    { value: 'returns', label: `Returns ${returns.length}` },
  ]

  const list =
    tab === 'movements'
      ? movements.map((m) => <MovementRow key={m.id} movement={m} />)
      : returns.map((r) => <ReturnRow key={r.id} ret={r} />)
  const empty = tab === 'movements' ? movements.length === 0 : returns.length === 0

  return (
    <div>
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate(-1)}
        className="-ml-3 mt-2 flex h-11 w-11 items-center justify-center text-ios-blue"
      >
        <IconChevronLeft size={28} />
      </button>
      <PageTitle>Import review</PageTitle>

      <p className="mb-4 text-[15px] text-ios-label2">
        These records came from the old spreadsheet and need a quick human check. Open one, fix
        anything wrong, then mark it reviewed.
      </p>

      <ErrorBanner message={error} />

      <div className="mb-4 flex items-center justify-between gap-2">
        <SegmentedControl options={tabOptions} value={tab} onChange={setTab} />
        <Button variant="plain" disabled={loading} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <LoadingScreen />
      ) : empty ? (
        <EmptyState icon={<IconCheck size={40} />} title="All clear — nothing needs review." />
      ) : (
        <div className="flex flex-col gap-2.5">{list}</div>
      )}
    </div>
  )
}
