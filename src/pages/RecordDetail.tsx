// Record detail + edit + history for movements, returns, bookings and vehicles.
// Route: /record/:type/:id

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PURPOSE_OPTIONS } from '../lib/types'
import type { Activity, Booking, Movement, MovementStatus, Return, Vehicle, VehicleStatus } from '../lib/types'
import { bookingStatusLabel, bookingStatusTone, formatDateTime, localDateOf, localTimeOf, movementStatusLabel, movementStatusTone, normRego, purposeLabel, purposeTone, timeAgo, vehicleStatusLabel, vehicleStatusTone } from '../lib/utils'
import { cancelBooking, createMovement, getBooking, getHandbackForMovement, getMovement, getRawImportRow, getReturn, historyForRecord, listReturnsByRego, listVehicles, setVehicleStatusByRego, updateBooking, updateMovement, updateReturn, updateVehicle } from '../lib/db'
import { Badge, Button, Card, ErrorBanner, Field, IconChevronLeft, Input, ListRow, LoadingScreen, PageTitle, SectionHeader, SegmentedControl, Spinner, TextArea } from '../components/ui'
import { PhotoSection } from '../components/PhotoPicker'
import { ReturnCard } from '../components/cards'

type Rec = { kind: 'movement'; row: Movement } | { kind: 'return'; row: Return } | { kind: 'booking'; row: Booking } | { kind: 'vehicle'; row: Vehicle }

const TITLES: Record<string, string> = { movement: 'Movement', return: 'Return', booking: 'Booking' }
const TABLES: Record<string, string> = { movement: 'vehicle_movements', return: 'vehicle_returns', booking: 'bookings', vehicle: 'vehicles' }
const MOVE_STATUS = (['active', 'returned', 'closed'] as MovementStatus[]).map((s) => ({ value: s, label: movementStatusLabel[s] }))
const VEHICLE_STATUS = (['available', 'out', 'booked', 'repair', 'unknown'] as VehicleStatus[]).map((s) => ({ value: s, label: vehicleStatusLabel[s] }))
const FLEET_OPTIONS: { value: 'fleet' | 'customer'; label: string }[] = [{ value: 'fleet', label: 'Fleet car' }, { value: 'customer', label: 'Customer car' }]

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ISO ↔ <input type="datetime-local"> value (which parses/formats as local time).
function isoToInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
const inputToISO = (v: string): string | null => {
  const d = new Date(v)
  return v && !isNaN(d.getTime()) ? d.toISOString() : null
}

// ------------------------------------------------------------ tiny helpers

function Row({ label, value }: { label: string; value?: ReactNode }) {
  if (value === undefined || value === null || value === '') return null
  return (
    <div className="border-b border-ios-sep px-4 py-3 last:border-b-0">
      <div className="text-[13px] font-semibold tracking-wide text-ios-gray uppercase">{label}</div>
      <div className="mt-0.5 text-[17px] break-words text-ios-label">{value}</div>
    </div>
  )
}

const tel = (p: string): ReactNode =>
  p ? <a href={`tel:${p}`} className="font-medium text-ios-blue">{p}</a> : null

function FI({ label, value, onChange, upper = false }: { label: string; value: string; onChange: (v: string) => void; upper?: boolean }) {
  return (
    <Field label={label}>
      <Input value={value} autoCapitalize={upper ? 'characters' : undefined} onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)} />
    </Field>
  )
}

const Notes = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Field label="Notes"><TextArea value={value} onChange={(e) => onChange(e.target.value)} /></Field>
)

function RawImportCard({ sheet, row }: { sheet: string; row: number }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function toggle() {
    const next = !open
    setOpen(next)
    if (!next || loaded || busy) return
    setBusy(true)
    setErr('')
    try { setData(await getRawImportRow(sheet, row)); setLoaded(true) }
    catch (e) { setErr(errMsg(e)) }
    finally { setBusy(false) }
  }

  return (
    <Card className="mb-3">
      <button type="button" onClick={toggle} className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left">
        <span className="text-[17px] font-medium text-ios-label">Original spreadsheet row</span>
        <span className="text-[15px] text-ios-blue">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="border-t border-ios-sep px-4 py-3">
          {busy && <div className="flex justify-center py-2"><Spinner /></div>}
          {err && <ErrorBanner message={err} />}
          {!busy && !err && loaded && !data && <div className="text-[15px] text-ios-gray">No raw row found for this record.</div>}
          {data && Object.entries(data).map(([k, v]) => (
            <div key={k} className="py-0.5 text-[15px]">
              <span className="font-semibold text-ios-label2">{k}: </span>
              <span className="break-words text-ios-label">{String(v ?? '')}</span>
            </div>
          ))}
          <div className="mt-2 text-[13px] text-ios-gray">{sheet} · row {row}</div>
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------- view cards

function MovementView({ m }: { m: Movement }) {
  const when = m.moved_at ? formatDateTime(m.moved_at) : [m.movement_date, m.movement_time].filter(Boolean).join(' ')
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap gap-2 border-b border-ios-sep px-4 py-3">
        <Badge tone={movementStatusTone[m.status]}>{movementStatusLabel[m.status]}</Badge>
        {m.purpose && <Badge tone={purposeTone[m.purpose] ?? 'gray'}>{purposeLabel(m.purpose)}</Badge>}
      </div>
      <Row label="Driver" value={m.driver_name} />
      <Row label="Phone" value={tel(m.driver_phone)} />
      <Row label="Car in (customer)" value={m.cars_in_rego} />
      <Row label="Car out (loan)" value={m.cars_out_rego} />
      <Row label="When" value={when} />
      <Row label="Notes" value={m.notes} />
      <Row label="Client details (import)" value={m.client_details_raw} />
      <Row label="Driver collecting (import)" value={m.driver_collecting_raw} />
      <Row label="Signed off" value={m.signed_off} />
      <Row label="Purpose (import)" value={m.purpose_raw !== m.purpose ? m.purpose_raw : ''} />
      <Row label="Make (import)" value={m.make_raw} />
    </Card>
  )
}

function IntakeView({ m }: { m: Movement }) {
  const when = m.moved_at ? formatDateTime(m.moved_at) : [m.movement_date, m.movement_time].filter(Boolean).join(' ')
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap gap-2 border-b border-ios-sep px-4 py-3">
        {m.status === 'closed'
          ? <Badge tone="green">Collected</Badge>
          : <Badge tone="orange">Customer car in</Badge>}
      </div>
      <Row label="Customer" value={m.driver_name} />
      <Row label="Phone" value={tel(m.driver_phone)} />
      <Row label="Car rego" value={m.cars_in_rego} />
      <Row label="When" value={when} />
      <Row label="Notes" value={m.notes} />
      <Row label="Client details (import)" value={m.client_details_raw} />
    </Card>
  )
}

function ReturnView({ r, onOpenMovement }: { r: Return; onOpenMovement: (id: string) => void }) {
  const mid = r.movement_id
  const when = r.returned_at ? formatDateTime(r.returned_at) : [r.return_date, r.return_time].filter(Boolean).join(' ')
  return (
    <>
      <Card className="mb-3">
        <Row label="Rego returned" value={r.returned_rego || r.returned_rego_raw} />
        <Row label="Driver" value={r.driver_name} />
        <Row label="Mobile" value={tel(r.mobile_number)} />
        <Row label="Returned" value={when} />
        <Row label="Bond" value={r.bond_status} />
        <Row label="Notes" value={r.notes} />
        <Row label="Driver (import)" value={r.driver_name_raw !== r.driver_name ? r.driver_name_raw : ''} />
        <Row label="Mobile (import)" value={r.mobile_number_raw !== r.mobile_number ? r.mobile_number_raw : ''} />
        <Row label="Rego (import)" value={r.returned_rego_raw !== r.returned_rego ? r.returned_rego_raw : ''} />
      </Card>
      {mid && (
        <Card className="mb-3">
          <ListRow title="View linked movement" subtitle="The movement that gave this car out" onClick={() => onOpenMovement(mid)} />
        </Card>
      )}
    </>
  )
}

function BookingView({ b }: { b: Booking }) {
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap gap-2 border-b border-ios-sep px-4 py-3">
        <Badge tone={bookingStatusTone[b.status]}>{bookingStatusLabel[b.status]}</Badge>
        {b.purpose && <Badge tone={purposeTone[b.purpose] ?? 'gray'}>{purposeLabel(b.purpose)}</Badge>}
      </div>
      <Row label="Rego" value={b.vehicle_rego} />
      <Row label="Name" value={b.booking_name} />
      <Row label="Mobile" value={tel(b.booking_mobile)} />
      <Row label="Start" value={formatDateTime(b.start_at)} />
      <Row label="Expected return" value={b.expected_return_at ? formatDateTime(b.expected_return_at) : ''} />
      <Row label="Notes" value={b.notes} />
    </Card>
  )
}

function VehicleView({ v }: { v: Vehicle }) {
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ios-sep px-4 py-3">
        <span className="text-[24px] font-bold tracking-wide">{v.rego}</span>
        <Badge tone={vehicleStatusTone[v.status]}>{vehicleStatusLabel[v.status]}</Badge>
      </div>
      <Row label="Make & model" value={[v.make, v.model].filter(Boolean).join(' ')} />
      <Row label="Type" value={v.vehicle_type} />
      <Row label="Ownership" value={v.is_company_car ? 'Fleet car' : 'Customer car'} />
      <Row label="Notes" value={v.notes} />
    </Card>
  )
}

function VehicleReturnHistory({ rego }: { rego: string }) {
  const [returns, setReturns] = useState<Return[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    listReturnsByRego(rego)
      .then((r) => { if (!cancelled) { setReturns(r); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [rego])
  if (!loaded || returns.length === 0) return null
  return (
    <>
      <SectionHeader>Return history ({returns.length})</SectionHeader>
      <Card className="mb-3">{returns.map((r) => <ReturnCard key={r.id} ret={r} />)}</Card>
    </>
  )
}

// Shown on a closed intake: confirms the car was handed back and links to that record.
function IntakeHandbackLink({ movementId }: { movementId: string }) {
  const navigate = useNavigate()
  const [ret, setRet] = useState<Return | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    getHandbackForMovement(movementId)
      .then((r) => { if (!cancelled) { setRet(r); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [movementId])
  if (!loaded) return null
  return (
    <div className="mb-3 rounded-card bg-ios-green/12 p-4 shadow-card">
      <div className="text-[13px] font-semibold tracking-wide text-ios-green uppercase">Collected</div>
      <div className="mt-1 text-[17px] text-ios-label">Handed back to the customer.</div>
      {ret && (
        <Card className="mt-3">
          <ListRow
            title="View hand-back record"
            subtitle="Collection details + after-repair photos"
            onClick={() => navigate(`/record/return/${ret.id}`)}
          />
        </Card>
      )}
    </div>
  )
}

// ------------------------------------------------------------- edit forms

function MovementEdit({ m, saving, onSave }: { m: Movement; saving: boolean; onSave: (p: Partial<Movement>) => void }) {
  const [f, setF] = useState({
    driver_name: m.driver_name, driver_phone: m.driver_phone, cars_in_rego: m.cars_in_rego,
    cars_out_rego: m.cars_out_rego, purpose: m.purpose, status: m.status, notes: m.notes, signed_off: m.signed_off,
  })
  return (
    <Card className="mb-3 flex flex-col gap-4 p-4">
      <FI label="Driver name" value={f.driver_name} onChange={(v) => setF({ ...f, driver_name: v })} />
      <FI label="Driver phone" value={f.driver_phone} onChange={(v) => setF({ ...f, driver_phone: v })} />
      <FI label="Car in (customer rego)" upper value={f.cars_in_rego} onChange={(v) => setF({ ...f, cars_in_rego: v })} />
      <FI label="Car out (loan rego)" upper value={f.cars_out_rego} onChange={(v) => setF({ ...f, cars_out_rego: v })} />
      <Field label="Purpose"><SegmentedControl options={PURPOSE_OPTIONS} value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} /></Field>
      <Field label="Status"><SegmentedControl options={MOVE_STATUS} value={f.status} onChange={(v) => setF({ ...f, status: v })} /></Field>
      <FI label="Signed off by" value={f.signed_off} onChange={(v) => setF({ ...f, signed_off: v })} />
      <Notes value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <Button full loading={saving} onClick={() => onSave({
        driver_name: f.driver_name.trim(), driver_phone: f.driver_phone.trim(),
        cars_in_rego: normRego(f.cars_in_rego), cars_out_rego: normRego(f.cars_out_rego),
        purpose: f.purpose, status: f.status, notes: f.notes, signed_off: f.signed_off,
      })}>Save changes</Button>
    </Card>
  )
}

function IntakeEdit({ m, saving, onSave }: { m: Movement; saving: boolean; onSave: (p: Partial<Movement>) => void }) {
  const [f, setF] = useState({
    driver_name: m.driver_name, driver_phone: m.driver_phone, cars_in_rego: m.cars_in_rego,
    moved_at: isoToInput(m.moved_at), notes: m.notes,
  })
  return (
    <Card className="mb-3 flex flex-col gap-4 p-4">
      <FI label="Customer name" value={f.driver_name} onChange={(v) => setF({ ...f, driver_name: v })} />
      <FI label="Mobile" value={f.driver_phone} onChange={(v) => setF({ ...f, driver_phone: v })} />
      <FI label="Car rego" upper value={f.cars_in_rego} onChange={(v) => setF({ ...f, cars_in_rego: v })} />
      <Field label="Date & time"><Input type="datetime-local" value={f.moved_at} onChange={(e) => setF({ ...f, moved_at: e.target.value })} /></Field>
      <Notes value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <Button full loading={saving} onClick={() => {
        const iso = inputToISO(f.moved_at)
        onSave({
          driver_name: f.driver_name.trim(), driver_phone: f.driver_phone.trim(),
          cars_in_rego: normRego(f.cars_in_rego), notes: f.notes,
          ...(iso ? { moved_at: iso, movement_date: localDateOf(iso), movement_time: localTimeOf(iso) } : {}),
        })
      }}>Save changes</Button>
    </Card>
  )
}

function ReturnEdit({ r, saving, onSave }: { r: Return; saving: boolean; onSave: (p: Partial<Return>) => void }) {
  const [f, setF] = useState({
    driver_name: r.driver_name, mobile_number: r.mobile_number,
    returned_rego: r.returned_rego, bond_status: r.bond_status, notes: r.notes,
  })
  return (
    <Card className="mb-3 flex flex-col gap-4 p-4">
      <FI label="Driver name" value={f.driver_name} onChange={(v) => setF({ ...f, driver_name: v })} />
      <FI label="Mobile" value={f.mobile_number} onChange={(v) => setF({ ...f, mobile_number: v })} />
      <FI label="Rego returned" upper value={f.returned_rego} onChange={(v) => setF({ ...f, returned_rego: v })} />
      <FI label="Bond" value={f.bond_status} onChange={(v) => setF({ ...f, bond_status: v })} />
      <Notes value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <Button full loading={saving} onClick={() => onSave({
        driver_name: f.driver_name.trim(), mobile_number: f.mobile_number.trim(),
        returned_rego: normRego(f.returned_rego), bond_status: f.bond_status, notes: f.notes,
      })}>Save changes</Button>
    </Card>
  )
}

function BookingEdit({ b, saving, onSave }: { b: Booking; saving: boolean; onSave: (p: Partial<Booking>) => void }) {
  const [f, setF] = useState({
    booking_name: b.booking_name, booking_mobile: b.booking_mobile, vehicle_rego: b.vehicle_rego,
    purpose: b.purpose, notes: b.notes, start_at: isoToInput(b.start_at), expected_return_at: isoToInput(b.expected_return_at),
  })
  return (
    <Card className="mb-3 flex flex-col gap-4 p-4">
      <FI label="Name" value={f.booking_name} onChange={(v) => setF({ ...f, booking_name: v })} />
      <FI label="Mobile" value={f.booking_mobile} onChange={(v) => setF({ ...f, booking_mobile: v })} />
      <FI label="Rego" upper value={f.vehicle_rego} onChange={(v) => setF({ ...f, vehicle_rego: v })} />
      <Field label="Purpose"><SegmentedControl options={PURPOSE_OPTIONS} value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} /></Field>
      <Field label="Start"><Input type="datetime-local" value={f.start_at} onChange={(e) => setF({ ...f, start_at: e.target.value })} /></Field>
      <Field label="Expected return"><Input type="datetime-local" value={f.expected_return_at} onChange={(e) => setF({ ...f, expected_return_at: e.target.value })} /></Field>
      <Notes value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
      <Button full loading={saving} onClick={() => onSave({
        booking_name: f.booking_name.trim(), booking_mobile: f.booking_mobile.trim(),
        vehicle_rego: normRego(f.vehicle_rego), purpose: f.purpose, notes: f.notes,
        start_at: inputToISO(f.start_at) ?? b.start_at, expected_return_at: inputToISO(f.expected_return_at),
      })}>Save changes</Button>
    </Card>
  )
}

function VehicleEdit({ v, saving, onSave }: { v: Vehicle; saving: boolean; onSave: (p: Partial<Vehicle>) => void }) {
  const [f, setF] = useState({
    make: v.make, model: v.model, vehicle_type: v.vehicle_type,
    status: v.status, notes: v.notes, is_company_car: v.is_company_car,
  })
  return (
    <Card className="mb-3 flex flex-col gap-4 p-4">
      <FI label="Make" value={f.make} onChange={(x) => setF({ ...f, make: x })} />
      <FI label="Model" value={f.model} onChange={(x) => setF({ ...f, model: x })} />
      <FI label="Type" value={f.vehicle_type} onChange={(x) => setF({ ...f, vehicle_type: x })} />
      <Field label="Status"><SegmentedControl options={VEHICLE_STATUS} value={f.status} onChange={(x) => setF({ ...f, status: x })} /></Field>
      <Field label="Ownership">
        <SegmentedControl options={FLEET_OPTIONS} value={f.is_company_car ? 'fleet' : 'customer'} onChange={(x) => setF({ ...f, is_company_car: x === 'fleet' })} />
      </Field>
      <Notes value={f.notes} onChange={(v2) => setF({ ...f, notes: v2 })} />
      <Button full loading={saving} onClick={() => onSave({ ...f, make: f.make.trim(), model: f.model.trim() })}>Save changes</Button>
    </Card>
  )
}

// -------------------------------------------------------------- main page

export default function RecordDetail() {
  const { type, id } = useParams()
  const navigate = useNavigate()
  const { staffId } = useAuth()
  const [rec, setRec] = useState<Rec | null>(null)
  const [history, setHistory] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState('')

  const load = useCallback(async () => {
    if (!id || !type || !(type in TABLES)) throw new Error('Record not found')
    if (type === 'movement') setRec({ kind: 'movement', row: await getMovement(id) })
    else if (type === 'return') setRec({ kind: 'return', row: await getReturn(id) })
    else if (type === 'booking') setRec({ kind: 'booking', row: await getBooking(id) })
    else {
      const v = (await listVehicles()).find((x) => x.id === id)
      if (!v) throw new Error('Vehicle not found')
      setRec({ kind: 'vehicle', row: v })
    }
    // History is non-critical; never block the record view on it.
    try { setHistory(await historyForRecord(TABLES[type] ?? '', id)) } catch { setHistory([]) }
  }, [type, id])

  useEffect(() => {
    setLoading(true); setError(''); setRec(null); setEditing(false)
    load().catch((e) => setError(errMsg(e))).finally(() => setLoading(false))
  }, [load])

  async function doSave(fn: () => Promise<void>) {
    setSaving(true)
    setError('')
    try { await fn(); setEditing(false); await load() }
    catch (e) { setError(errMsg(e)) }
    finally { setSaving(false) }
  }

  async function runAction(key: string, fn: () => Promise<void>) {
    if (busyAction) return // guard: never run two record actions at once (e.g. Start + Cancel)
    setBusyAction(key)
    setError('')
    try { await fn() }
    catch (e) { setError(errMsg(e)) }
    finally { setBusyAction('') }
  }

  // Editing a movement's status/rego must reconcile the loan car's availability,
  // otherwise a car marked returned/closed here stays 'Out' forever (and the 72
  // imported "possibly still out" movements could never free their cars).
  async function saveMovement(old: Movement, patch: Partial<Movement>) {
    await updateMovement(old.id, patch, staffId)
    const newOut = patch.cars_out_rego ?? old.cars_out_rego
    const newStatus = patch.status ?? old.status
    try {
      if (newStatus === 'active') {
        if (newOut) await setVehicleStatusByRego(newOut, 'out')
        if (old.cars_out_rego && old.cars_out_rego !== newOut) await setVehicleStatusByRego(old.cars_out_rego, 'available')
      } else {
        if (newOut) await setVehicleStatusByRego(newOut, 'available')
        if (old.cars_out_rego && old.cars_out_rego !== newOut) await setVehicleStatusByRego(old.cars_out_rego, 'available')
      }
    } catch {
      /* status sync is best-effort; the movement edit itself is saved */
    }
  }

  const markReviewed = () =>
    runAction('review', async () => {
      if (!rec) return
      if (rec.kind === 'movement') await updateMovement(rec.row.id, { needs_review: false, review_reason: '' }, staffId)
      else if (rec.kind === 'return') await updateReturn(rec.row.id, { needs_review: false, review_reason: '' }, staffId)
      await load()
    })

  const startBooking = (b: Booking) =>
    runAction('start', async () => {
      const mv = await createMovement({
        driver_name: b.booking_name, driver_phone: b.booking_mobile,
        cars_in_rego: '', cars_out_rego: b.vehicle_rego, purpose: b.purpose,
        moved_at: new Date().toISOString(), notes: 'From booking', staffId,
      })
      await updateBooking(b.id, { status: 'active' }, staffId)
      navigate(`/record/movement/${mv.id}`)
    })

  const setBookingStatus = (key: string, bid: string, status: Booking['status']) =>
    runAction(key, async () => { await updateBooking(bid, { status }, staffId); await load() })

  const title = !type ? 'Record'
    : type === 'vehicle' ? (rec?.kind === 'vehicle' ? rec.row.rego : 'Vehicle')
    : type === 'movement' && rec?.kind === 'movement' && rec.row.purpose === 'INTAKE' ? 'Car intake'
    : (TITLES[type] ?? 'Record')

  return (
    <div className="pt-2">
      <button type="button" aria-label="Back" onClick={() => navigate(-1)}
        className="-ml-2 mb-1 flex h-11 items-center pr-3 text-[17px] font-medium text-ios-blue">
        <IconChevronLeft size={26} /> Back
      </button>
      <PageTitle right={rec ? <Button variant="plain" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button> : undefined}>
        {title}
      </PageTitle>
      <ErrorBanner message={error} />

      {loading ? (
        <LoadingScreen />
      ) : !rec ? (
        <Button variant="secondary" full onClick={() => navigate(-1)}>Go back</Button>
      ) : (
        <>
          {(rec.kind === 'movement' || rec.kind === 'return') && rec.row.needs_review && (
            <div className="mb-3 rounded-card bg-ios-orange/15 p-4 shadow-card">
              <div className="text-[13px] font-semibold tracking-wide text-ios-orange uppercase">Needs review</div>
              <div className="mt-1 text-[17px] text-ios-label">{rec.row.review_reason || 'Imported row needs checking.'}</div>
              <Button full className="mt-3" loading={busyAction === 'review'} onClick={markReviewed}>Mark as reviewed</Button>
            </div>
          )}

          {editing ? (
            rec.kind === 'movement' ? (
              rec.row.purpose === 'INTAKE' ? (
                <IntakeEdit key={rec.row.id} m={rec.row} saving={saving} onSave={(p) => doSave(() => updateMovement(rec.row.id, p, staffId))} />
              ) : (
                <MovementEdit key={rec.row.id} m={rec.row} saving={saving} onSave={(p) => doSave(() => saveMovement(rec.row as Movement, p))} />
              )
            ) : rec.kind === 'return' ? (
              <ReturnEdit key={rec.row.id} r={rec.row} saving={saving} onSave={(p) => doSave(() => updateReturn(rec.row.id, p, staffId))} />
            ) : rec.kind === 'booking' ? (
              <BookingEdit key={rec.row.id} b={rec.row} saving={saving} onSave={(p) => doSave(() => updateBooking(rec.row.id, p, staffId))} />
            ) : (
              <VehicleEdit key={rec.row.id} v={rec.row} saving={saving} onSave={(p) => doSave(() => updateVehicle(rec.row.id, p, staffId))} />
            )
          ) : (
            <>
              {rec.kind === 'movement' && (rec.row.purpose === 'INTAKE' ? <IntakeView m={rec.row} /> : <MovementView m={rec.row} />)}
              {rec.kind === 'return' && <ReturnView r={rec.row} onOpenMovement={(mid) => navigate(`/record/movement/${mid}`)} />}
              {rec.kind === 'booking' && <BookingView b={rec.row} />}
              {rec.kind === 'vehicle' && <VehicleView v={rec.row} />}
              {rec.kind === 'vehicle' && <VehicleReturnHistory rego={rec.row.rego} />}

              {(rec.kind === 'movement' || rec.kind === 'return') && rec.row.source_sheet !== '' && rec.row.source_row !== null && (
                <RawImportCard key={rec.row.id} sheet={rec.row.source_sheet} row={rec.row.source_row} />
              )}

              {rec.kind === 'movement' && rec.row.status === 'active' && rec.row.purpose !== 'INTAKE' && rec.row.cars_out_rego && (
                <Button full className="mb-3" onClick={() => navigate('/return?rego=' + encodeURIComponent(rec.row.cars_out_rego))}>Record return</Button>
              )}
              {rec.kind === 'movement' && rec.row.purpose === 'INTAKE' && rec.row.status === 'active' && (
                <Button full className="mb-3" onClick={() => navigate('/handback?rego=' + encodeURIComponent(rec.row.cars_in_rego))}>Hand back to customer</Button>
              )}
              {rec.kind === 'movement' && rec.row.purpose === 'INTAKE' && rec.row.status === 'closed' && (
                <IntakeHandbackLink movementId={rec.row.id} />
              )}
              {rec.kind === 'booking' && rec.row.status === 'booked' && (
                <div className="mb-3 flex flex-col gap-2">
                  <Button full loading={busyAction === 'start'} disabled={!!busyAction} onClick={() => startBooking(rec.row)}>Start — give car out</Button>
                  <Button variant="danger" full loading={busyAction === 'cancel'} disabled={!!busyAction}
                    onClick={() => { if (window.confirm('Cancel this booking?')) runAction('cancel', async () => { await cancelBooking(rec.row.id, staffId); await load() }) }}>
                    Cancel booking
                  </Button>
                </div>
              )}
              {rec.kind === 'booking' && rec.row.status === 'active' && (
                <Button full className="mb-3" loading={busyAction === 'complete'} disabled={!!busyAction} onClick={() => setBookingStatus('complete', rec.row.id, 'completed')}>
                  Mark completed
                </Button>
              )}
            </>
          )}

          {rec.kind === 'movement' && rec.row.purpose === 'INTAKE' ? (
            <>
              <PhotoSection links={{ movement_id: rec.row.id }} defaultType="damage" filterType="damage" title="Damage photos" staffId={staffId} />
              <PhotoSection links={{ movement_id: rec.row.id }} defaultType="other" filterType="other" title="Report card photos" staffId={staffId} />
            </>
          ) : (
            <PhotoSection
              links={
                rec.kind === 'movement' ? { movement_id: rec.row.id }
                : rec.kind === 'return' ? { return_id: rec.row.id }
                : rec.kind === 'booking' ? { booking_id: rec.row.id }
                : { vehicle_id: rec.row.id }
              }
              defaultType={rec.kind === 'movement' ? 'before_handover' : rec.kind === 'return' ? 'after_return' : 'other'}
              staffId={staffId}
            />
          )}

          <SectionHeader>History</SectionHeader>
          <Card>
            {history.length === 0 ? (
              <div className="px-4 py-3 text-[15px] text-ios-gray">No history yet</div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="flex items-baseline justify-between gap-3 border-b border-ios-sep px-4 py-3 last:border-b-0">
                  <div className="text-[15px] text-ios-label"><span className="font-semibold">{h.staffName}</span> {h.action}</div>
                  <div className="shrink-0 text-[13px] text-ios-gray">{timeAgo(h.created_at)}</div>
                </div>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  )
}
