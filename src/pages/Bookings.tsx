// Bookings tab: list upcoming / active / past bookings grouped by start day,
// plus a create sheet with rego conflict checking (staff can override).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createBooking, getRegoConflicts, listBookings } from '../lib/db'
import type { Booking, Movement, Purpose } from '../lib/types'
import { PURPOSE_OPTIONS } from '../lib/types'
import { bookingStatusLabel, bookingStatusTone, formatDate, formatDateTime, normRego, nowLocalInputValue } from '../lib/utils'
import {
  Badge, Button, Card, ConfirmSheet, EmptyState, ErrorBanner, Field, IconCalendar, Input,
  ListRow, LoadingScreen, PageTitle, SectionHeader, SegmentedControl, Sheet, TextArea,
} from '../components/ui'
import { BookingCard } from '../components/cards'

const DAY_MS = 24 * 60 * 60 * 1000

type TabKey = 'upcoming' | 'active' | 'past'

const TABS: { value: TabKey; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'active', label: 'Active' },
  { value: 'past', label: 'Past' },
]

const TAB_STATUSES: Record<TabKey, Booking['status'][]> = {
  upcoming: ['booked'],
  active: ['active'],
  past: ['completed', 'cancelled'],
}

const EMPTY_COPY: Record<TabKey, { title: string; hint: string }> = {
  upcoming: { title: 'No upcoming bookings', hint: 'Tap New to book a car for a customer.' },
  active: { title: 'No active bookings', hint: 'Bookings show here once the car is out.' },
  past: { title: 'No past bookings', hint: 'Completed and cancelled bookings show here.' },
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isOverdue = (b: Booking) =>
  b.status === 'active' && !!b.expected_return_at && new Date(b.expected_return_at).getTime() < Date.now()

/** Same layout as BookingCard, but flags an active booking past its expected return. */
function OverdueBookingRow({ booking }: { booking: Booking }) {
  const navigate = useNavigate()
  return (
    <ListRow
      onClick={() => navigate(`/record/booking/${booking.id}`)}
      left={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-red text-white">
          <IconCalendar size={20} />
        </span>
      }
      title={`${booking.vehicle_rego || 'No rego'} — ${booking.booking_name || 'Unnamed'}`}
      subtitle={`From ${formatDateTime(booking.start_at)} · due back ${formatDateTime(booking.expected_return_at)}`}
      right={
        <span className="flex flex-col items-end gap-1">
          <Badge tone="red">Overdue</Badge>
          <Badge tone={bookingStatusTone[booking.status]}>{bookingStatusLabel[booking.status]}</Badge>
        </span>
      }
    />
  )
}

interface ConflictInfo {
  rego: string
  movement: Movement | null
  bookings: Booking[]
}

export default function Bookings() {
  const { staffId } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // list state
  const [tab, setTab] = useState<TabKey>('upcoming')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  // create sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [rego, setRego] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [startAt, setStartAt] = useState(nowLocalInputValue())
  const [expectedAt, setExpectedAt] = useState('')
  const [purpose, setPurpose] = useState<Purpose>('RENT')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)

  const refetch = useCallback(async (t: TabKey) => {
    setLoading(true)
    setListError('')
    try {
      const rows = await listBookings(TAB_STATUSES[t])
      // db orders by start_at ascending; show most recent first for past bookings
      setBookings(t === 'past' ? [...rows].reverse() : rows)
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refetch(tab)
  }, [tab, refetch])

  // Opening the create sheet via the + action (/bookings?new=1) must work even when
  // already on this tab — so react to the param changing, not just to mount.
  useEffect(() => {
    if (searchParams.get('new') === '1') setSheetOpen(true)
  }, [searchParams])

  function closeSheet() {
    setSheetOpen(false)
    setFormError('')
    if (searchParams.get('new') === '1') {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }

  function resetForm() {
    setRego('')
    setName('')
    setMobile('')
    setStartAt(nowLocalInputValue())
    setExpectedAt('')
    setPurpose('RENT')
    setNotes('')
    setFormError('')
  }

  const groups = useMemo(() => {
    const now = new Date()
    const todayKey = localDayKey(now)
    const tomorrowKey = localDayKey(new Date(now.getTime() + DAY_MS))
    const out: { key: string; label: string; items: Booking[] }[] = []
    for (const b of bookings) {
      const d = new Date(b.start_at)
      const key = isNaN(d.getTime()) ? 'unknown' : localDayKey(d)
      const last = out[out.length - 1]
      if (last && last.key === key) {
        last.items.push(b)
      } else {
        const label =
          key === 'unknown' ? 'No date'
          : key === todayKey ? 'Today'
          : key === tomorrowKey ? 'Tomorrow'
          : formatDate(b.start_at)
        out.push({ key, label, items: [b] })
      }
    }
    return out
  }, [bookings])

  async function doCreate() {
    await createBooking({
      vehicle_rego: rego,
      booking_name: name,
      booking_mobile: mobile,
      start_at: new Date(startAt).toISOString(),
      expected_return_at: expectedAt ? new Date(expectedAt).toISOString() : null,
      purpose,
      notes,
      staffId,
    })
    resetForm()
    closeSheet()
    await refetch(tab)
  }

  async function handleSubmit() {
    setFormError('')
    const clean = normRego(rego)
    if (!clean) {
      setFormError('Rego is required.')
      return
    }
    if (!startAt) {
      setFormError('Start date/time is required.')
      return
    }
    if (expectedAt && new Date(expectedAt).getTime() <= new Date(startAt).getTime()) {
      setFormError('Expected return must be after the start.')
      return
    }
    setSaving(true)
    try {
      const res = await getRegoConflicts(clean)
      const newStart = new Date(startAt).getTime()
      const newEnd = expectedAt ? new Date(expectedAt).getTime() : newStart + DAY_MS
      const overlapping = res.bookings.filter((b) => {
        const bStart = new Date(b.start_at).getTime()
        const bEnd = b.expected_return_at ? new Date(b.expected_return_at).getTime() : bStart + DAY_MS
        return newStart < bEnd && bStart < newEnd
      })
      if (res.activeMovement || overlapping.length > 0) {
        setConflict({ rego: clean, movement: res.activeMovement, bookings: overlapping })
        return
      }
      await doCreate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function confirmOverride() {
    setConflict(null)
    setSaving(true)
    try {
      await doCreate()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageTitle
        right={
          <Button className="rounded-full! px-4! py-2! text-[15px]!" onClick={() => setSheetOpen(true)}>
            New
          </Button>
        }
      >
        Bookings
      </PageTitle>

      <SegmentedControl options={TABS} value={tab} onChange={setTab} />

      <div className="mt-4">
        <ErrorBanner message={listError} />
        {loading ? (
          <LoadingScreen />
        ) : groups.length === 0 ? (
          <EmptyState icon={<IconCalendar size={40} />} title={EMPTY_COPY[tab].title} hint={EMPTY_COPY[tab].hint} />
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <SectionHeader>{g.label}</SectionHeader>
              <Card>
                {g.items.map((b) =>
                  isOverdue(b) ? <OverdueBookingRow key={b.id} booking={b} /> : <BookingCard key={b.id} booking={b} />,
                )}
              </Card>
            </div>
          ))
        )}
      </div>

      <Sheet open={sheetOpen} onClose={closeSheet} title="New booking">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
        >
          <ErrorBanner message={formError} />
          <div className="flex max-h-[62vh] flex-col gap-4 overflow-y-auto pb-2">
            <Field label="Rego">
              <Input
                value={rego}
                onChange={(e) => setRego(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Customer name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </Field>
            <Field label="Mobile">
              <Input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                type="tel"
                inputMode="tel"
                placeholder="04xx xxx xxx"
              />
            </Field>
            <Field label="Start">
              <Input value={startAt} onChange={(e) => setStartAt(e.target.value)} type="datetime-local" />
            </Field>
            <Field label="Expected return" hint="Optional — leave blank if unknown.">
              <Input value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} type="datetime-local" />
            </Field>
            <Field label="Purpose">
              <SegmentedControl options={PURPOSE_OPTIONS} value={purpose} onChange={setPurpose} />
            </Field>
            <Field label="Notes">
              <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth noting" />
            </Field>
          </div>
          <div className="mt-4">
            <Button type="submit" full loading={saving}>
              Create booking
            </Button>
          </div>
        </form>
      </Sheet>

      {conflict && (
        <ConfirmSheet
          open
          title="Booking conflict"
          message={
            <span>
              <span className="block font-semibold">{conflict.rego} may not be free:</span>
              {conflict.movement && (
                <span className="mt-1 block">
                  Currently out{conflict.movement.driver_name ? ` with ${conflict.movement.driver_name}` : ''} since{' '}
                  {formatDateTime(conflict.movement.moved_at ?? conflict.movement.created_at)}.
                </span>
              )}
              {conflict.bookings.map((b) => (
                <span key={b.id} className="mt-1 block">
                  {b.status === 'active' ? 'Out on booking' : 'Booked'}
                  {b.booking_name ? ` for ${b.booking_name}` : ''}: {formatDateTime(b.start_at)} →{' '}
                  {b.expected_return_at ? formatDateTime(b.expected_return_at) : 'open return'}
                </span>
              ))}
            </span>
          }
          confirmLabel="Book anyway"
          onConfirm={() => void confirmOverride()}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  )
}
