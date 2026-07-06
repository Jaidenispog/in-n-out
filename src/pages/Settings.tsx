// Settings: profile, team list, CSV exports, app info, sign out.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { fetchAllRows, listStaff, rowsToCsv, updateMyName } from '../lib/db'
import type { StaffUser } from '../lib/types'
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  IconChevronLeft,
  IconDoc,
  IconPerson,
  Input,
  ListRow,
  PageTitle,
  SectionHeader,
  Spinner,
} from '../components/ui'

type ExportTable = 'vehicle_movements' | 'vehicle_returns' | 'vehicles' | 'bookings' | 'customers'

const EXPORT_TABLES: { table: ExportTable; label: string }[] = [
  { table: 'vehicle_movements', label: 'Movements' },
  { table: 'vehicle_returns', label: 'Returns' },
  { table: 'vehicles', label: 'Vehicles' },
  { table: 'bookings', label: 'Bookings' },
  { table: 'customers', label: 'Customers' },
]

function localYmd(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export default function Settings() {
  const navigate = useNavigate()
  const { staffId, profile, refreshProfile, signOut } = useAuth()

  const [error, setError] = useState('')

  // Profile name editing
  const [name, setName] = useState(profile?.full_name ?? '')
  const [savingName, setSavingName] = useState(false)
  useEffect(() => {
    setName(profile?.full_name ?? '')
  }, [profile?.full_name])
  const nameChanged = name.trim() !== (profile?.full_name ?? '')

  // Team
  const [staff, setStaff] = useState<StaffUser[]>([])
  const [staffLoading, setStaffLoading] = useState(true)

  // Export
  const [exporting, setExporting] = useState<ExportTable | null>(null)

  // App section
  const [installOpen, setInstallOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    listStaff()
      .then((rows) => {
        if (!cancelled) setStaff(rows)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveName() {
    if (!staffId || savingName) return
    setSavingName(true)
    setError('')
    try {
      await updateMyName(staffId, name.trim())
      await refreshProfile()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingName(false)
    }
  }

  async function exportTable(table: ExportTable) {
    if (exporting) return
    setExporting(table)
    setError('')
    try {
      const rows = await fetchAllRows(table)
      const csv = rowsToCsv(rows)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `in-n-out-${table}-${localYmd()}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(null)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    setError('')
    try {
      await signOut() // Gate redirects to Login automatically
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSigningOut(false)
    }
  }

  return (
    <div>
      <div className="pt-2">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate(-1)}
          className="-ml-2 flex h-11 w-11 items-center justify-center text-ios-blue active:opacity-60"
        >
          <IconChevronLeft size={26} />
        </button>
      </div>
      <PageTitle>Settings</PageTitle>

      <ErrorBanner message={error} />

      {/* ------------------------------------------------------- profile */}
      <Card className="p-4">
        <Field label="Your name">
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
            {nameChanged && (
              <Button onClick={saveName} loading={savingName} className="shrink-0">
                Save
              </Button>
            )}
          </div>
        </Field>
        <div className="mt-4 border-t border-ios-sep">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-ios-sep py-3">
            <span className="text-[15px] text-ios-label2">Email</span>
            <span className="truncate text-[15px] text-ios-label">{profile?.email || '—'}</span>
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3 py-3">
            <span className="text-[15px] text-ios-label2">Role</span>
            <span className="text-[15px] text-ios-label">{profile?.role || '—'}</span>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------- team */}
      <SectionHeader>Team</SectionHeader>
      <Card>
        {staffLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : staff.length === 0 ? (
          <div className="px-4 py-6 text-center text-[15px] text-ios-gray">No staff found</div>
        ) : (
          staff.map((s) => (
            <ListRow
              key={s.id}
              left={
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-gray5 text-ios-gray">
                  <IconPerson size={20} />
                </span>
              }
              title={s.full_name || s.email}
              right={<span className="text-[15px] text-ios-gray">{s.role}</span>}
              chevron={false}
            />
          ))
        )}
      </Card>

      {/* -------------------------------------------------------- export */}
      <SectionHeader>Export data</SectionHeader>
      <Card>
        {EXPORT_TABLES.map((t) => (
          <ListRow
            key={t.table}
            onClick={() => exportTable(t.table)}
            left={
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/12 text-ios-blue">
                <IconDoc size={20} />
              </span>
            }
            title={t.label}
            subtitle="Download CSV"
            right={exporting === t.table ? <Spinner /> : undefined}
            chevron={false}
          />
        ))}
      </Card>

      {/* ----------------------------------------------------------- app */}
      <SectionHeader>App</SectionHeader>
      <Card>
        <ListRow title="Version" right={<span className="text-[15px] text-ios-gray">1.0.0</span>} chevron={false} />
        <ListRow
          onClick={() => setInstallOpen((v) => !v)}
          title="Install on iPhone"
          chevron={false}
        />
        {installOpen && (
          <div className="border-b border-ios-sep px-4 pt-1 pb-3 text-[15px] text-ios-label2 last:border-b-0">
            Open in Safari → Share → Add to Home Screen
          </div>
        )}
        <ListRow onClick={() => navigate('/review')} title="Import review" />
      </Card>

      {/* ------------------------------------------------------ sign out */}
      <div className="mt-8">
        <Button variant="danger" full loading={signingOut} onClick={handleSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}
