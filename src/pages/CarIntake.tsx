// Customer car intake — a customer drops their (damaged) car in; NO rental car given out.
// Stored as a movement (car in only, purpose INTAKE) so it's fully editable, searchable
// and photo-linked. Two photo groups: damage + report card.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createMovement } from '../lib/db'
import { normRego, nowLocalInputValue } from '../lib/utils'
import { PhotoStager, uploadStaged } from '../components/PhotoPicker'
import {
  Button, ErrorBanner, Field, IconChevronLeft, Input, PageTitle, TextArea,
} from '../components/ui'

export default function CarIntake() {
  const navigate = useNavigate()
  const { staffId } = useAuth()

  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [rego, setRego] = useState('')
  const [at, setAt] = useState(nowLocalInputValue())
  const [notes, setNotes] = useState('')
  const [staffName, setStaffName] = useState('')
  const [damageFiles, setDamageFiles] = useState<File[]>([])
  const [reportFiles, setReportFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
      const mv = await createMovement({
        driver_name: name,
        driver_phone: mobile,
        cars_in_rego: rego,
        cars_out_rego: '', // intake only — no rental car goes out
        purpose: 'INTAKE',
        moved_at: iso,
        notes,
        staffName,
        staffId,
      })
      try {
        if (damageFiles.length) await uploadStaged(damageFiles, 'damage', { movement_id: mv.id }, staffId)
        if (reportFiles.length) await uploadStaged(reportFiles, 'other', { movement_id: mv.id }, staffId)
      } catch {
        // The intake is saved — photos can be added from the record page.
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
      <PageTitle>Customer car intake</PageTitle>
      <p className="-mt-2 mb-4 px-1 text-[15px] text-ios-label2">
        Customer dropping their car in (e.g. for repair) — no rental car given out.
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
            onChange={(e) => setRego(e.target.value.toUpperCase())}
            placeholder="e.g. 1PI3XZ"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Date & time">
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Damage description, condition, what's wrong — anything worth noting"
          />
        </Field>

        <PhotoStager label="Damage photos" files={damageFiles} onChange={setDamageFiles} />
        <PhotoStager label="Report card photos" files={reportFiles} onChange={setReportFiles} />

        <Button type="submit" full loading={saving} className="mt-2">
          Save intake
        </Button>
      </form>
    </div>
  )
}
