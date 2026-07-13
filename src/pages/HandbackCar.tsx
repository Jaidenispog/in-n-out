// Give the customer their repaired car back. The customer's car is recorded via
// cars_in_rego (NOT cars_out) so it is never flagged as a company/fleet car and is
// never marked "out". Purpose HANDBACK. Two photo groups: handover condition + the
// tow card (the tow card is linked to the vehicle so it's findable later by rego).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createMovement, findOpenCarInByRego, getVehicleByRego, updateMovement } from '../lib/db'
import { normRego, nowLocalInputValue } from '../lib/utils'
import { PhotoStager, uploadStaged } from '../components/PhotoPicker'
import {
  Button, ErrorBanner, Field, IconChevronLeft, Input, PageTitle, TextArea,
} from '../components/ui'

export default function HandbackCar() {
  const navigate = useNavigate()
  const { staffId } = useAuth()

  const [staffName, setStaffName] = useState('')
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [rego, setRego] = useState('')
  const [at, setAt] = useState(nowLocalInputValue())
  const [notes, setNotes] = useState('')
  const [handoverFiles, setHandoverFiles] = useState<File[]>([])
  const [towFiles, setTowFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [matchNote, setMatchNote] = useState('')

  // On rego blur, look up the customer's open record (their car came in) to prefill.
  async function checkRego() {
    const clean = normRego(rego)
    setMatchNote('')
    if (clean.length < 4) return
    try {
      const open = await findOpenCarInByRego(clean)
      if (open) {
        if (!name.trim() && open.driver_name) setName(open.driver_name)
        if (!mobile.trim() && open.driver_phone) setMobile(open.driver_phone)
        setMatchNote(`Matches an open record${open.driver_name ? ` for ${open.driver_name}` : ''} — their car is currently with you.`)
      }
    } catch {
      // prefill is best-effort
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!normRego(rego) && !name.trim()) {
      setError('Enter at least the customer name or the car rego.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const iso = at ? new Date(at).toISOString() : new Date().toISOString()
      // Find the open intake BEFORE creating the handback (so we don't match the new one).
      const open = await findOpenCarInByRego(rego).catch(() => null)
      const mv = await createMovement({
        driver_name: name,
        driver_phone: mobile,
        cars_in_rego: rego, // THEIR car — stays a customer car, never flagged fleet / "out"
        cars_out_rego: '',
        purpose: 'HANDBACK',
        moved_at: iso,
        notes,
        staffName,
        staffId,
      })
      try {
        if (handoverFiles.length) await uploadStaged(handoverFiles, 'other', { movement_id: mv.id }, staffId)
        if (towFiles.length) {
          const v = await getVehicleByRego(rego)
          if (v) await uploadStaged(towFiles, 'tow_card', { vehicle_id: v.id }, staffId)
        }
      } catch {
        // The handback is saved — photos can be added from the record page.
      }
      // Best-effort: close a pure intake (repair loop done). Only for INTAKE — a normal
      // movement with a courtesy car still out is closed by its own "Record return".
      if (open && open.purpose === 'INTAKE') {
        await updateMovement(open.id, { status: 'closed' }, staffId).catch(() => {})
      }
      navigate('/record/movement/' + mv.id, { replace: true })
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
      <PageTitle>Give car back</PageTitle>
      <p className="-mt-2 mb-4 px-1 text-[15px] text-ios-label2">
        Handing the customer's repaired car back to them — record the handover + tow card.
      </p>

      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Staff name">
          <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Your name — defaults to Staff" autoCapitalize="words" />
        </Field>
        <Field label="Customer name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="off" />
        </Field>
        <Field label="Mobile number">
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" inputMode="tel" placeholder="04xx xxx xxx" autoComplete="off" />
        </Field>
        <Field label="Car rego">
          <Input
            value={rego}
            onChange={(e) => { setRego(e.target.value.toUpperCase()); setMatchNote('') }}
            onBlur={checkRego}
            placeholder="e.g. 1PI3XZ"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        {matchNote && <p className="-mt-2 px-1 text-[13px] text-ios-blue">{matchNote}</p>}
        <Field label="Date & time">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condition at handover, work done, anything worth noting"
          />
        </Field>

        <PhotoStager label="Handover photos" files={handoverFiles} onChange={setHandoverFiles} />
        <PhotoStager label="Tow card" files={towFiles} onChange={setTowFiles} />

        <Button type="submit" full loading={saving} className="mt-2">
          Save handback
        </Button>
      </form>
    </div>
  )
}
