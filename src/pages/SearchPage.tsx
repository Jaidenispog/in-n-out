// Universal search across vehicles, movements, returns and bookings.
import { useEffect, useRef, useState } from 'react'
import type { SearchResults } from '../lib/types'
import { universalSearch } from '../lib/db'
import {
  Card, EmptyState, ErrorBanner, IconSearch, Input, PageTitle, SectionHeader, Spinner,
} from '../components/ui'
import { BookingCard, MovementCard, ReturnCard, VehicleCard } from '../components/cards'

const MIN_CHARS = 2
const DEBOUNCE_MS = 300

export default function SearchPage() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searchedTerm, setSearchedTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const reqId = useRef(0)

  useEffect(() => {
    const t = term.trim()
    if (t.length < MIN_CHARS) {
      reqId.current++ // invalidate any in-flight search
      setResults(null)
      setSearching(false)
      setError('')
      return
    }
    const id = ++reqId.current
    setSearching(true)
    setError('')
    const timer = setTimeout(async () => {
      try {
        const res = await universalSearch(t)
        if (reqId.current !== id) return // a newer search superseded this one
        setResults(res)
        setSearchedTerm(t)
      } catch (err) {
        if (reqId.current !== id) return
        setError(err instanceof Error ? err.message : 'Search failed')
      } finally {
        if (reqId.current === id) setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [term])

  const total = results
    ? results.vehicles.length + results.movements.length + results.returns.length + results.bookings.length
    : 0

  return (
    <div className="pt-4">
      <PageTitle>Search</PageTitle>

      <div className="relative">
        <IconSearch
          size={20}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ios-gray"
        />
        <Input
          autoFocus
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Rego, name, mobile, purpose…"
          className="pl-12"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
        />
      </div>

      {results !== null && total > 0 && !searching && (
        <div className="mt-2 px-1 text-[14px] text-ios-label2">
          {total} result{total === 1 ? '' : 's'} for “{searchedTerm}”
        </div>
      )}

      <div className="mt-3">
        <ErrorBanner message={error} />
      </div>

      {searching ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : results === null ? (
        <EmptyState
          icon={<IconSearch size={40} />}
          title="Search everything"
          hint="Find any record by rego, driver name, mobile number or purpose."
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<IconSearch size={40} />}
          title={`No matches for “${searchedTerm}”`}
          hint="Check the spelling or try a partial rego or name."
        />
      ) : (
        <>
          {results.vehicles.length > 0 && (
            <>
              <SectionHeader>Vehicles ({results.vehicles.length})</SectionHeader>
              <Card>
                {results.vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </Card>
            </>
          )}

          {results.movements.length > 0 && (
            <>
              <SectionHeader>Movements ({results.movements.length})</SectionHeader>
              <Card>
                {results.movements.map((m) => (
                  <MovementCard key={m.id} movement={m} />
                ))}
              </Card>
            </>
          )}

          {results.returns.length > 0 && (
            <>
              <SectionHeader>Returns ({results.returns.length})</SectionHeader>
              <Card>
                {results.returns.map((r) => (
                  <ReturnCard key={r.id} ret={r} />
                ))}
              </Card>
            </>
          )}

          {results.bookings.length > 0 && (
            <>
              <SectionHeader>Bookings ({results.bookings.length})</SectionHeader>
              <Card>
                {results.bookings.map((b) => (
                  <BookingCard key={b.id} booking={b} />
                ))}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
