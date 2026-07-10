// Hand back — a customer collects their own (repaired) car.
// Matches the rego against an open Customer car intake; the db layer links + closes it
// and records the collection as a return tagged 'handback' (kept separate from loaner returns).

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Movement } from '../lib/types'
import { formatDateTime, normRego, nowLocalInputValue } from '../lib/utils'
import { createHandback, findOpenIntakeByRego, getMovement } from '../lib/db'
import { PhotoStager, uploadStaged } from '../components/PhotoPicker'
import {
  Button, Card, ErrorBanner, Field, IconChevronLeft, IconChevronRight, Input, PageTitle, TextArea,
} from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export default function HandBack() {
  const navigate = useNavigate()
  const { staffId } = useAuth()
  const [searchParams] = useSearchParams()

  const [rego, setRego] = useState(() => (searchParams.get('rego') || '').toUpperCase())
  const [fixedId, setFixedId] = useState(() => searchParams.get('intake') || '')
  const [driverName, setDriverName] = useState('')
  const [mobile, setMobile] = useState('')
  const [collectedAt, setCollectedAt] = useState(nowLocalInputValue())
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])

  const [match, setMatch] = useState<Movement | null>(null)
  const [matchChecked, setMatchChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function checkRego() {
    const clean = normRego(rego)
    if (clean.length < 4) {
      setMatch(null)
      setMatchChecked(false)
      return
    }
    setChecking(true)
    try {
      const m = await findOpenIntakeByRego(clean)
      setMatch(m)
      setMatchChecked(true)
      if (m) {
        if (!driverName.trim() && m.driver_name) setDriverName(m.driver_name)
        if (!mobile.trim() && m.driver_phone) setMobile(m.driver_phone)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  // Opened from a specific intake's record: close THAT intake, not just the newest by rego.
  async function loadFixedIntake() {
    setChecking(true)
    try {
      const m = await getMovement(fixedId)
      setMatch(m)
      setMatchChecked(true)
      if (!rego) setRego(m.cars_in_rego)
      if (!driverName.trim() && m.driver_name) setDriverName(m.driver_name)
      if (!mobile.trim() && m.driver_phone) setMobile(m.driver_phone)
    } catch {
      setFixedId('') // fall back to rego matching if the intake can't be loaded
      if (normRego(rego).length >= 4) await checkRego()
    } finally {
      setChecking(false)
    }
  }

  // Auto-resolve once on open: by explicit intake id if provided, else by rego.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fixedId) void loadFixedIntake()
    else if (normRego(rego).length >= 4) void checkRego()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!normRego(rego)) {
      setError("The customer's car rego is required.")
      return
    }
    setSaving(true)
    setError('')
    try {
      const iso = collectedAt ? new Date(collectedAt).toISOString() : new Date().toISOString()
      const { ret } = await createHandback({
        driver_name: driverName,
        mobile_number: mobile,
        returned_rego: rego,
        returned_at: iso,
        notes,
        staffId,
        movementId: fixedId || match?.id,
      })
      try {
        if (files.length) await uploadStaged(files, 'after_return', { return_id: ret.id }, staffId)
      } catch {
        // Hand-back is saved — photos can be added from the record page.
      }
      navigate('/record/return/' + ret.id, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="pt-4">
      <button
        type="button"
        aria-label="Back"
        onClick={() => navigate(-1)}
        className="-ml-2 mb-1 flex h-11 w-11 items-center justify-center rounded-full text-ios-blue active:opacity-60"
      >
        <IconChevronLeft size={28} />
      </button>
      <PageTitle>Hand back to customer</PageTitle>
      <p className="-mt-2 mb-4 px-1 text-[15px] text-ios-label2">
        Customer collecting their own (repaired) car — closes the intake.
      </p>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Field label="Customer's car rego">
            <Input
              value={rego}
              onChange={(e) => {
                setRego(e.target.value.toUpperCase())
                setMatch(null)
                setMatchChecked(false)
                setFixedId('') // typing a new rego retargets — drop the pre-seeded intake
              }}
              onBlur={checkRego}
              placeholder="e.g. 1PI3XZ"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </Field>

          {checking && (
            <div className="mt-2 px-1 text-[13px] text-ios-gray">Checking for an open intake…</div>
          )}

          {!checking && match && (
            <Card onClick={() => navigate(`/record/movement/${match.id}`)} className="mt-2">
              <div className="flex items-center gap-3 rounded-card bg-ios-blue/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ios-blue">Matches car intake</div>
                  <div className="mt-0.5 text-[15px] text-ios-label">
                    Dropped in by {match.driver_name || 'unknown customer'}
                    {match.driver_phone ? ` (${match.driver_phone})` : ''} on{' '}
                    {formatDateTime(match.moved_at)}
                  </div>
                </div>
                <IconChevronRight size={18} className="shrink-0 text-ios-blue" />
              </div>
            </Card>
          )}

          {!checking && matchChecked && !match && (
            <div className="mt-2 px-1 text-[13px] text-ios-gray">
              No open intake found for this rego — the hand-back will still be recorded.
            </div>
          )}
        </div>

        <Field label="Customer name">
          <Input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Who collected the car"
            autoComplete="off"
          />
        </Field>

        <Field label="Mobile number">
          <Input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="04xx xxx xxx"
            autoComplete="off"
          />
        </Field>

        <Field label="Collected date & time">
          <Input
            type="datetime-local"
            value={collectedAt}
            onChange={(e) => setCollectedAt(e.target.value)}
          />
        </Field>

        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Work done, condition, anything worth noting"
          />
        </Field>

        <PhotoStager label="After-repair photos" files={files} onChange={setFiles} />

        <Button type="submit" full loading={saving} className="mt-2">
          Save hand-back
        </Button>
      </form>
    </div>
  )
}
