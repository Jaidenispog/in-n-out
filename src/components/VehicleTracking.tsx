// "Live location" section for a fleet car's record. Calls our /api/citytag proxy
// (which reads the CityTag tag matching this rego) and plots it on a Leaflet map.
// CityTag location is crowd-sourced/approximate — the raw "last update" time is
// shown prominently so staff are never misled about how fresh it is.

import { useCallback, useEffect, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { Card, ErrorBanner, SectionHeader, Spinner } from './ui'

// Leaflet's default marker icon breaks under bundlers — point it at the bundled images.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

type Device = {
  rego: string
  name: string
  lat: number
  lng: number
  time: string | null
  battery: number | null
  address: string
}

/** Rough "X ago" from CityTag's "YYYY-MM-DD HH:MM:SS" string (best-effort; raw time is shown too). */
function relative(t: string | null): string {
  if (!t) return ''
  const ms = new Date(t.replace(' ', 'T')).getTime()
  if (Number.isNaN(ms)) return ''
  const s = (Date.now() - ms) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export function VehicleTracking({ rego }: { rego: string }) {
  const [loading, setLoading] = useState(true)
  const [device, setDevice] = useState<Device | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setErr('')
    fetch(`/api/citytag?rego=${encodeURIComponent(rego)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) {
          setErr(j.error || 'Could not load tracking')
          setDevice(null)
        } else {
          setDevice(j.device ?? null)
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load tracking'))
      .finally(() => setLoading(false))
  }, [rego])

  useEffect(() => {
    load()
  }, [load])

  const hasLoc = !!device && Number.isFinite(device.lat) && Number.isFinite(device.lng)

  return (
    <>
      <SectionHeader
        action={
          <button type="button" onClick={load} className="text-[15px] font-medium text-ios-blue active:opacity-60">
            Refresh
          </button>
        }
      >
        Live location
      </SectionHeader>
      <Card className="mb-3 overflow-hidden">
        <ErrorBanner message={err} />
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : hasLoc && device ? (
          <>
            <div className="h-60 w-full">
              <MapContainer
                center={[device.lat, device.lng]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[device.lat, device.lng]}>
                  <Popup>
                    {device.name || rego}
                    {device.address ? (
                      <>
                        <br />
                        {device.address}
                      </>
                    ) : null}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
            <div className="px-4 py-3 text-[14px]">
              {device.address ? <div className="text-ios-label">{device.address}</div> : null}
              <div className="mt-0.5 text-ios-gray">
                {device.time ? `Last update: ${device.time}` : 'No timestamp'}
                {relative(device.time) ? ` · ${relative(device.time)}` : ''}
                {device.battery != null ? ` · Battery ${device.battery}%` : ''}
              </div>
              <div className="mt-1 text-[12px] text-ios-gray">
                Via CityTag — approximate; updates only when a phone passes near the car.
              </div>
            </div>
          </>
        ) : (
          <div className="px-4 py-6 text-[15px] text-ios-gray">
            No recent CityTag location for {rego}. It updates only when a phone passes near the car, so it can be delayed.
          </div>
        )}
      </Card>
    </>
  )
}
