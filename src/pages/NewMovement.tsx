// New Movement (/new) — customer car comes IN, our car goes OUT.
// Optimised for speed: short form, big controls, availability check on the way.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createMovement, getRegoConflicts } from '../lib/db'
import { PURPOSE_OPTIONS } from '../lib/types'
import type { Purpose, RegoConflict } from '../lib/types'
import { formatDateTime, normRego, nowLocalInputValue, vehicleStatusLabel } from '../lib/utils'
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorBanner,
  Field,
  IconCheck,
  IconChevronLeft,
  IconWarning,
  Input,
  PageTitle,
  SegmentedControl,
  Spinner,
  TextArea,
} from '../components/ui'
import { PhotoStager, uploadStaged } from '../components/PhotoPicker'

// Bookings starting within this window count as "overlapping soon".
const SOON_MS = 72 * 60 * 60 * 1000

function conflictLines(c: RegoConflict): string[] {
  const lines: string[] = []
  if (c.vehicle && (c.vehicle.status === 'out' || c.vehicle.status === 'booked' || c.vehicle.status === 'repair')) {
    lines.push(`Vehicle is marked "${vehicleStatusLabel[c.vehicle.status]}".`)
  }
  if (c.activeMovement) {
    lines.push(
      `Already out to ${c.activeMovement.driver_name || 'an unknown driver'} since ${formatDateTime(
        c.activeMovement.moved_at ?? c.activeMovement.created_at,
      )}.`,
    )
  }
  for (const b of c.bookings) {
    const alreadyBack = b.expected_return_at ? new Date(b.expected_return_at).getTime() < Date.now() : false
    if (!alreadyBack && new Date(b.start_at).getTime() < Date.now() + SOON_MS) {
      lines.push(`Booked by ${b.booking_name || 'unknown'} from ${formatDateTime(b.start_at)}.`)
    }
  }
  return lines
}

export default function NewMovement() {
  const navigate = useNavigate()
  const { staffId } = useAuth()

  // Form state
  const [driverName, setDriverName] = useState('')
  const [mobile, setMobile] = useState('')
  const [carsIn, setCarsIn] = useState('')
  const [carsOut, setCarsOut] = useState('')
  const [purpose, setPurpose] = useState<Purpose>('RENT')
  const [dt, setDt] = useState(nowLocalInputValue())
  const [notes, setNotes] = useState('')
  const [staffName, setStaffName] = useState('')
  const [files, setFiles] = useState<File[]>([]) // our car (cars out)
  const [theirFiles, setTheirFiles] = useState<File[]>([]) // their car (cars in)

  // Availability check state (for the CARS OUT rego)
  const [conflicts, setConflicts] = useState<RegoConflict | null>(null)
  const [checkedRego, setCheckedRego] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState('')

  // Submit state
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const outRego = normRego(carsOut)
  const fresh = conflicts !== null && outRego.length >= 4 && checkedRego === outRego
  const warnings = fresh && conflicts ? conflictLines(conflicts) : []
  const showAvailable = fresh && warnings.length === 0 && conflicts?.vehicle?.status === 'available'

  async function checkConflicts(rego: string): Promise<RegoConflict | null> {
    setChecking(true)
    setCheckError('')
    try {
      const c = await getRegoConflicts(rego)
      setConflicts(c)
      setCheckedRego(rego)
      return c
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : 'Could not check availability')
      return null
    } finally {
      setChecking(false)
    }
  }

  function handleOutBlur() {
    if (outRego.length >= 4 && outRego !== checkedRego) void checkConflicts(outRego)
  }

  async function handleSubmit() {
    if (saving || checking) return
    setError('')
    if (!normRego(carsIn) && !outRego) {
      setError('Enter at least one rego — the customer car (cars in) or our car (cars out).')
      return
    }
    if (!purpose) {
      setError('Pick a purpose for this movement.')
      return
    }
    if (!dt || Number.isNaN(new Date(dt).getTime())) {
      setError('Enter a valid date and time.')
      return
    }
    // Business rule: warn if the outgoing car may not be free — staff can override.
    if (outRego.length >= 4) {
      const c = fresh && conflicts ? conflicts : await checkConflicts(outRego)
      if (c && conflictLines(c).length > 0) {
        setConfirmOpen(true)
        return
      }
    }
    await save()
  }

  async function save() {
    setConfirmOpen(false)
    setSaving(true)
    setError('')
    try {
      // Don't create a duplicate movement if a previous attempt saved but photos failed.
      let id = createdId
      if (!id) {
        const movement = await createMovement({
          driver_name: driverName,
          driver_phone: mobile,
          cars_in_rego: carsIn,
          cars_out_rego: carsOut,
          purpose,
          moved_at: new Date(dt).toISOString(),
          notes,
          staffName,
          staffId,
        })
        id = movement.id
        setCreatedId(id)
      }
      if (files.length > 0 || theirFiles.length > 0) {
        setUploading(true)
        if (files.length > 0) await uploadStaged(files, 'before_handover', { movement_id: id }, staffId)
        if (theirFiles.length > 0) await uploadStaged(theirFiles, 'damage', { movement_id: id }, staffId)
        setUploading(false)
      }
      navigate('/record/movement/' + id, { replace: true })
    } catch (err) {
      setUploading(false)
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Could not save the movement')
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Go back"
        onClick={() => navigate(-1)}
        className="-ml-3 mt-2 flex h-11 w-11 items-center justify-center text-ios-blue"
      >
        <IconChevronLeft size={28} />
      </button>
      <PageTitle>New movement</PageTitle>

      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <Field label="Staff name">
          <Input
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="Your name — defaults to Staff"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Driver name">
          <Input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="e.g. Sarah Nguyen"
            autoComplete="name"
            autoCapitalize="words"
          />
        </Field>

        <Field label="Mobile number">
          <Input
            type="tel"
            inputMode="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="04xx xxx xxx"
            autoComplete="tel"
          />
        </Field>

        <Field label="Customer car rego (cars in)">
          <Input
            value={carsIn}
            onChange={(e) => setCarsIn(e.target.value.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="font-semibold tracking-wider"
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Field label="Our car rego (cars out)">
            <Input
              value={carsOut}
              onChange={(e) => setCarsOut(e.target.value.toUpperCase())}
              onBlur={handleOutBlur}
              placeholder="XYZ789"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-semibold tracking-wider"
            />
          </Field>

          {checking && (
            <div className="flex items-center gap-2 px-1 text-[14px] text-ios-label2">
              <Spinner />
              Checking availability…
            </div>
          )}
          {!checking && checkError && <ErrorBanner message={`Couldn't check availability: ${checkError}`} />}
          {!checking && warnings.length > 0 && (
            <Card className="border border-ios-orange/30 bg-ios-orange/10! p-4">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 shrink-0 text-ios-orange">
                  <IconWarning size={20} />
                </span>
                <div className="text-[15px] text-ios-label">
                  <div className="mb-0.5 font-semibold">{outRego} may not be free</div>
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              </div>
            </Card>
          )}
          {!checking && showAvailable && (
            <div className="flex items-center gap-1.5 px-1 text-[14px] font-semibold text-[#1d7a35]">
              <IconCheck size={16} />
              <span>
                {outRego} is available
                {conflicts?.vehicle?.make
                  ? ` — ${[conflicts.vehicle.make, conflicts.vehicle.model].filter(Boolean).join(' ')}`
                  : ''}
              </span>
            </div>
          )}
        </div>

        <Field label="Purpose">
          <SegmentedControl options={PURPOSE_OPTIONS} value={purpose} onChange={setPurpose} />
        </Field>

        <Field label="Date & time">
          <Input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} />
        </Field>

        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Fuel level, existing damage, anything worth noting…"
          />
        </Field>

        <PhotoStager label="Before photos — our car" files={files} onChange={setFiles} />
        <PhotoStager label="Before photos — their car" files={theirFiles} onChange={setTheirFiles} />

        <div className="mt-1 flex flex-col gap-2">
          <ErrorBanner message={error} />
          {uploading && (
            <div className="text-center text-[14px] font-medium text-ios-label2">Uploading photos…</div>
          )}
          <Button type="submit" full loading={saving}>
            Save movement
          </Button>
        </div>
      </form>

      <ConfirmSheet
        open={confirmOpen}
        title="This car may not be free"
        message={
          <span className="block">
            <span className="block font-semibold">{outRego}</span>
            {warnings.map((w, i) => (
              <span key={i} className="block">
                {w}
              </span>
            ))}
            <span className="mt-1 block text-ios-label2">You can still save if this is intentional.</span>
          </span>
        }
        confirmLabel="Save anyway"
        onConfirm={() => void save()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
