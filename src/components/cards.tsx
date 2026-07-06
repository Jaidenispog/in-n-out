// Shared list cards for movements, returns, bookings and vehicles.
// Used by Dashboard, Search, Availability, Bookings and Import Review.

import { useNavigate } from 'react-router-dom'
import type { Booking, Movement, Return, Vehicle } from '../lib/types'
import {
  bookingStatusLabel, bookingStatusTone, formatDateTime, movementStatusLabel, movementStatusTone,
  purposeLabel, purposeTone, vehicleStatusLabel, vehicleStatusTone,
} from '../lib/utils'
import { Badge, IconArrowDown, IconArrowUp, IconCalendar, IconCar, ListRow } from './ui'

const iconWrap = (bg: string, icon: React.ReactNode) => (
  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${bg}`}>{icon}</span>
)

export function MovementCard({ movement }: { movement: Movement }) {
  const navigate = useNavigate()
  const regos = [
    movement.cars_in_rego && `In: ${movement.cars_in_rego}`,
    movement.cars_out_rego && `Out: ${movement.cars_out_rego}`,
  ]
    .filter(Boolean)
    .join('  ·  ')
  return (
    <ListRow
      onClick={() => navigate(`/record/movement/${movement.id}`)}
      left={iconWrap('bg-ios-blue', <IconArrowDown size={20} />)}
      title={regos || movement.rego_raw || 'Movement'}
      subtitle={
        <>
          {movement.driver_name || movement.client_details_raw || 'No driver recorded'}
          {' · '}
          {formatDateTime(movement.moved_at ?? movement.created_at)}
        </>
      }
      right={
        <span className="flex flex-col items-end gap-1">
          {movement.purpose && <Badge tone={purposeTone[movement.purpose] ?? 'gray'}>{purposeLabel(movement.purpose)}</Badge>}
          <Badge tone={movementStatusTone[movement.status]}>{movementStatusLabel[movement.status]}</Badge>
        </span>
      }
    />
  )
}

export function ReturnCard({ ret }: { ret: Return }) {
  const navigate = useNavigate()
  return (
    <ListRow
      onClick={() => navigate(`/record/return/${ret.id}`)}
      left={iconWrap('bg-ios-green', <IconArrowUp size={20} />)}
      title={ret.returned_rego || ret.returned_rego_raw || 'Return'}
      subtitle={
        <>
          {ret.driver_name || ret.driver_name_raw || 'No driver recorded'}
          {' · '}
          {formatDateTime(ret.returned_at ?? ret.created_at)}
        </>
      }
      right={<Badge tone="green">Returned</Badge>}
    />
  )
}

export function BookingCard({ booking }: { booking: Booking }) {
  const navigate = useNavigate()
  return (
    <ListRow
      onClick={() => navigate(`/record/booking/${booking.id}`)}
      left={iconWrap('bg-ios-orange', <IconCalendar size={20} />)}
      title={`${booking.vehicle_rego || 'No rego'} — ${booking.booking_name || 'Unnamed'}`}
      subtitle={`From ${formatDateTime(booking.start_at)}${booking.expected_return_at ? ` · back ${formatDateTime(booking.expected_return_at)}` : ''}`}
      right={<Badge tone={bookingStatusTone[booking.status]}>{bookingStatusLabel[booking.status]}</Badge>}
    />
  )
}

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate()
  return (
    <ListRow
      onClick={() => navigate(`/record/vehicle/${vehicle.id}`)}
      left={iconWrap('bg-ios-gray', <IconCar size={20} />)}
      title={vehicle.rego}
      subtitle={[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Make unknown'}
      right={<Badge tone={vehicleStatusTone[vehicle.status]}>{vehicleStatusLabel[vehicle.status]}</Badge>}
    />
  )
}
