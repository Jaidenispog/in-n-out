// Vehicle availability — /cars tab.
// Single fetch (vehicles + recent returns), everything else filtered client-side.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listReturns, listVehicles } from '../lib/db'
import { normRego, startOfTodayISO, vehicleStatusLabel, vehicleStatusTone } from '../lib/utils'
import type { Return, Vehicle } from '../lib/types'
import {
  Badge, Button, Card, EmptyState, ErrorBanner, IconCar, Input, ListRow,
  LoadingScreen, PageTitle, SegmentedControl, SortControl,
} from '../components/ui'

type FilterKey = 'all' | 'available' | 'out' | 'booked' | 'returned' | 'repair' | 'review'
type VSortKey = 'rego' | 'make' | 'status' | 'added'
const VSORT_OPTS: { value: VSortKey; label: string }[] = [
  { value: 'rego', label: 'Rego (A–Z)' },
  { value: 'make', label: 'Make (A–Z)' },
  { value: 'status', label: 'Status' },
  { value: 'added', label: 'Recently added' },
]

function todayLocalYMD(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Regos with a return recorded today (created today, or return_date is today). */
function buildReturnedTodaySet(returns: Return[]): Set<string> {
  const startMs = new Date(startOfTodayISO()).getTime()
  const today = todayLocalYMD()
  const set = new Set<string>()
  for (const r of returns) {
    if (!r.returned_rego) continue
    const createdToday = new Date(r.created_at).getTime() >= startMs
    if (createdToday || r.return_date === today) set.add(r.returned_rego)
  }
  return set
}

function VehicleRow({ vehicle, returnedToday }: { vehicle: Vehicle; returnedToday: boolean }) {
  const navigate = useNavigate()
  return (
    <ListRow
      onClick={() => navigate(`/record/vehicle/${vehicle.id}`)}
      left={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-gray text-white">
          <IconCar size={20} />
        </span>
      }
      title={vehicle.rego}
      subtitle={[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Make unknown'}
      right={
        <span className="flex flex-col items-end gap-1">
          {returnedToday && <Badge tone="blue">Returned today</Badge>}
          <Badge tone={vehicleStatusTone[vehicle.status]}>{vehicleStatusLabel[vehicle.status]}</Badge>
        </span>
      }
    />
  )
}

export default function Availability() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [returnedToday, setReturnedToday] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>(() => {
    const f = searchParams.get('filter')
    const valid: FilterKey[] = ['all', 'available', 'out', 'booked', 'returned', 'repair', 'review']
    return f && (valid as string[]).includes(f) ? (f as FilterKey) : 'all'
  })
  const [sort, setSort] = useState<VSortKey>('rego')
  const [showCustomer, setShowCustomer] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [vs, rs] = await Promise.all([listVehicles(), listReturns(200)])
        if (cancelled) return
        setVehicles(vs)
        setReturnedToday(buildReturnedTodaySet(rs))
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load cars')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const customerCount = useMemo(
    () => vehicles.reduce((n, v) => n + (v.is_company_car ? 0 : 1), 0),
    [vehicles],
  )

  // 1. Company-cars-first scope, 2. search, 3. chip filter.
  const scoped = useMemo(
    () => (showCustomer ? vehicles : vehicles.filter((v) => v.is_company_car)),
    [vehicles, showCustomer],
  )

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scoped
    const qRego = normRego(search)
    return scoped.filter(
      (v) =>
        (qRego !== '' && v.rego.includes(qRego)) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q),
    )
  }, [scoped, search])

  const counts = useMemo(() => {
    const c = { all: searched.length, available: 0, out: 0, booked: 0, returned: 0, repair: 0, review: 0 }
    for (const v of searched) {
      if (v.status === 'available') c.available++
      else if (v.status === 'out') c.out++
      else if (v.status === 'booked') c.booked++
      else if (v.status === 'repair') c.repair++
      else if (v.status === 'unknown') c.review++
      if (returnedToday.has(v.rego)) c.returned++
    }
    return c
  }, [searched, returnedToday])

  const filterOptions = useMemo(
    (): { value: FilterKey; label: string }[] => [
      { value: 'all', label: `All ${counts.all}` },
      { value: 'available', label: `Available ${counts.available}` },
      { value: 'out', label: `Out ${counts.out}` },
      { value: 'booked', label: `Booked ${counts.booked}` },
      { value: 'returned', label: `Returned today ${counts.returned}` },
      { value: 'repair', label: `Repair ${counts.repair}` },
      { value: 'review', label: `Review ${counts.review}` },
    ],
    [counts],
  )

  const filtered = useMemo(() => {
    switch (filter) {
      case 'available':
        return searched.filter((v) => v.status === 'available')
      case 'out':
        return searched.filter((v) => v.status === 'out')
      case 'booked':
        return searched.filter((v) => v.status === 'booked')
      case 'returned':
        return searched.filter((v) => returnedToday.has(v.rego))
      case 'repair':
        return searched.filter((v) => v.status === 'repair')
      case 'review':
        return searched.filter((v) => v.status === 'unknown')
      default:
        return searched
    }
  }, [searched, filter, returnedToday])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    switch (sort) {
      case 'make':
        return arr.sort((a, b) => (a.make || '~').localeCompare(b.make || '~') || a.rego.localeCompare(b.rego))
      case 'status':
        return arr.sort((a, b) => a.status.localeCompare(b.status) || a.rego.localeCompare(b.rego))
      case 'added':
        return arr.sort((a, b) => b.created_at.localeCompare(a.created_at))
      default:
        return arr.sort((a, b) => a.rego.localeCompare(b.rego))
    }
  }, [filtered, sort])

  if (loading) {
    return (
      <>
        <PageTitle>Cars</PageTitle>
        <LoadingScreen />
      </>
    )
  }

  return (
    <>
      <PageTitle>Cars</PageTitle>
      <ErrorBanner message={error} />

      <Input
        type="search"
        placeholder="Search rego or make"
        value={search}
        autoCapitalize="characters"
        autoCorrect="off"
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="mt-3">
        <SegmentedControl<FilterKey> options={filterOptions} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-2 flex justify-end">
        <SortControl<VSortKey> value={sort} onChange={setSort} options={VSORT_OPTS} />
      </div>

      {customerCount > 0 && (
        <Button variant="plain" full onClick={() => setShowCustomer((s) => !s)}>
          {showCustomer ? 'Hide customer cars' : `Show customer cars too (${customerCount})`}
        </Button>
      )}

      <Card className={customerCount > 0 ? '' : 'mt-3'}>
        {sorted.length === 0 ? (
          <EmptyState
            icon={<IconCar size={40} />}
            title="No cars found"
            hint={
              vehicles.length === 0
                ? 'No vehicles in the system yet.'
                : 'Try a different filter or search, or show customer cars too.'
            }
          />
        ) : (
          sorted.map((v) => (
            <VehicleRow key={v.id} vehicle={v} returnedToday={returnedToday.has(v.rego)} />
          ))
        )}
      </Card>
    </>
  )
}
