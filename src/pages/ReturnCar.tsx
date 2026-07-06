// Record Return — customer brings one of our cars back.
// Matches the rego against active movements; the db layer links + closes the movement.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Movement } from '../lib/types'
import { formatDateTime, normRego, nowLocalInputValue, purposeLabel } from '../lib/utils'
import { createReturn, findActiveMovementByRego } from '../lib/db'
import { PhotoStager, uploadStaged } from '../components/PhotoPicker'
import {
  Button, Card, ErrorBanner, Field, IconChevronLeft, IconChevronRight, Input, PageTitle, TextArea,
} from '../components/ui'
import { useAuth } from '../auth/AuthContext'

export default function ReturnCar() {
  const navigate = useNavigate()
  const { staffId } = useAuth()

  const [rego, setRego] = useState('')
  const [driverName, setDriverName] = useState('')
  const [mobile, setMobile] = useState('')
  const [returnedAt, setReturnedAt] = useState(nowLocalInputValue())
  const [bondStatus, setBondStatus] = useState('')
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
      const m = await findActiveMovementByRego(clean)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!normRego(rego)) {
      setError('Returned car rego is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const iso = returnedAt ? new Date(returnedAt).toISOString() : new Date().toISOString()
      const { ret } = await createReturn({
        driver_name: driverName,
        mobile_number: mobile,
        returned_rego: rego,
        returned_at: iso,
        bond_status: bondStatus,
        notes,
        staffId,
      })
      try {
        if (files.length) await uploadStaged(files, 'after_return', { return_id: ret.id }, staffId)
      } catch {
        // Return is saved — photos can be added from the record page.
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
      <PageTitle>Record return</PageTitle>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Field label="Returned car rego">
            <Input
              value={rego}
              onChange={(e) => {
                setRego(e.target.value.toUpperCase())
                setMatch(null)
                setMatchChecked(false)
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
            <div className="mt-2 px-1 text-[13px] text-ios-gray">Checking for an active movement…</div>
          )}

          {!checking && match && (
            <Card onClick={() => navigate(`/record/movement/${match.id}`)} className="mt-2">
              <div className="flex items-center gap-3 rounded-card bg-ios-blue/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ios-blue">Matches active movement</div>
                  <div className="mt-0.5 text-[15px] text-ios-label">
                    Out to {match.driver_name || 'unknown driver'}
                    {match.driver_phone ? ` (${match.driver_phone})` : ''} since{' '}
                    {formatDateTime(match.moved_at)}
                    {match.purpose ? ` · ${purposeLabel(match.purpose)}` : ''}
                  </div>
                </div>
                <IconChevronRight size={18} className="shrink-0 text-ios-blue" />
              </div>
            </Card>
          )}

          {!checking && matchChecked && !match && (
            <div className="mt-2 px-1 text-[13px] text-ios-gray">
              No active movement found for this rego — the return will still be recorded.
            </div>
          )}
        </div>

        <Field label="Driver name">
          <Input
            value={driverName}
            onChange={(e) => setDriverName(e.target.value)}
            placeholder="Who returned the car"
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

        <Field label="Return date & time">
          <Input
            type="datetime-local"
            value={returnedAt}
            onChange={(e) => setReturnedAt(e.target.value)}
          />
        </Field>

        <Field label="Bond status">
          <Input
            value={bondStatus}
            onChange={(e) => setBondStatus(e.target.value)}
            placeholder="e.g. Bond refunded / pending — optional"
          />
        </Field>

        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condition, fuel, damage, anything worth noting"
          />
        </Field>

        <PhotoStager label="After photos" files={files} onChange={setFiles} />

        <Button type="submit" full loading={saving} className="mt-2">
          Save return
        </Button>
      </form>
    </div>
  )
}
