// Vehicle availability — /cars tab.
// Single fetch (vehicles + recent returns), everything else filtered client-side.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listReturns, listVehicles } from '../lib/db'
import { isActiveFleet } from '../data/activeFleet'
import { normRego, startOfTodayISO, vehicleStatusLabel, vehicleStatusTone } from '../lib/utils'
import type { Return, Vehicle } from '../lib/types'
import {
  Badge, Card, EmptyState, ErrorBanner, IconCar, Input, ListRow,
  LoadingScreen, PageTitle, SegmentedControl, SortControl,
} from '../components/ui'

type FilterKey = 'all' | 'available' | 'out' | 'returned'
type ScopeKey = 'fleet' | 'all'
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
      subtitle={
        <>
          {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Make unknown'}
          {returnedToday && <span className="text-ios-blue"> · Returned today</span>}
        </>
      }
      right={<Badge tone={vehicleStatusTone[vehicle.status]}>{vehicleStatusLabel[vehicle.status]}</Badge>}
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
    const valid: FilterKey[] = ['all', 'available', 'out', 'returned']
    return f && (valid as string[]).includes(f) ? (f as FilterKey) : 'all'
  })
  const [sort, setSort] = useState<VSortKey>('rego')
  const [scope, setScope] = useState<ScopeKey>('fleet')

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

  // Scope tallies: our current fleet vs every vehicle on file.
  const scopeCounts = useMemo(() => {
    let fleet = 0
    for (const v of vehicles) if (v.is_company_car && isActiveFleet(v.rego)) fleet++
    return { fleet, all: vehicles.length }
  }, [vehicles])

  const scopeOptions = useMemo(
    (): { value: ScopeKey; label: string }[] => [
      { value: 'fleet', label: `Active fleet ${scopeCounts.fleet}` },
      { value: 'all', label: `All ${scopeCounts.all}` },
    ],
    [scopeCounts],
  )

  // 1. Scope (our fleet vs all), 2. search, 3. chip filter.
  const scoped = useMemo(() => {
    if (scope === 'all') return vehicles
    return vehicles.filter((v) => v.is_company_car && isActiveFleet(v.rego))
  }, [vehicles, scope])

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
    const c = { all: searched.length, available: 0, out: 0, returned: 0 }
    for (const v of searched) {
      if (v.status === 'available') c.available++
      else if (v.status === 'out') c.out++
      if (returnedToday.has(v.rego)) c.returned++
    }
    return c
  }, [searched, returnedToday])

  const filterOptions = useMemo(
    (): { value: FilterKey; label: string }[] => [
      { value: 'all', label: `All ${counts.all}` },
      { value: 'available', label: `Available ${counts.available}` },
      { value: 'out', label: `Out ${counts.out}` },
      { value: 'returned', label: `Returned today ${counts.returned}` },
    ],
    [counts],
  )

  const filtered = useMemo(() => {
    switch (filter) {
      case 'available':
        return searched.filter((v) => v.status === 'available')
      case 'out':
        return searched.filter((v) => v.status === 'out')
      case 'returned':
        return searched.filter((v) => returnedToday.has(v.rego))
      default:
        return searched
    }
  }, [searched, filter, returnedToday])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    switch (sort) {
      case 'make':
        return arr.sort((a, b) => {
          const am = (a.make || '').trim(), bm = (b.make || '').trim()
          if (!am !== !bm) return am ? -1 : 1 // cars with a make first, "unknown" last
          return am.localeCompare(bm) || a.rego.localeCompare(b.rego)
        })
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
        <SegmentedControl<ScopeKey> options={scopeOptions} value={scope} onChange={setScope} />
      </div>

      <div className="mt-2">
        <SegmentedControl<FilterKey> options={filterOptions} value={filter} onChange={setFilter} />
      </div>

      <div className="mt-2 flex justify-end">
        <SortControl<VSortKey> value={sort} onChange={setSort} options={VSORT_OPTS} />
      </div>

      <Card className="mt-3">
        {sorted.length === 0 ? (
          <EmptyState
            icon={<IconCar size={40} />}
            title="No cars found"
            hint={
              vehicles.length === 0
                ? 'No vehicles in the system yet.'
                : scope === 'fleet'
                  ? 'Try a different filter, or switch to All.'
                  : 'Try a different filter or search.'
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
