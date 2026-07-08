// Row shapes matching supabase/schema.sql

export type VehicleStatus = 'available' | 'out' | 'booked' | 'repair' | 'unknown'
export type MovementStatus = 'active' | 'returned' | 'closed'
export type BookingStatus = 'booked' | 'active' | 'completed' | 'cancelled'
export type PhotoType = 'before_handover' | 'after_return' | 'damage' | 'odometer' | 'fuel' | 'other'
export type Purpose = 'RENT' | 'COURTESY' | 'REPAIRS' | 'TOWED' | 'SWAP' | 'PICKUP' | 'RETURN' | 'INTAKE' | 'OTHER' | ''

export const PURPOSE_OPTIONS: { value: Purpose; label: string }[] = [
  { value: 'RENT', label: 'Rent' },
  { value: 'COURTESY', label: 'Courtesy' },
  { value: 'REPAIRS', label: 'Repairs' },
  { value: 'TOWED', label: 'Towed' },
  { value: 'SWAP', label: 'Swap' },
  { value: 'OTHER', label: 'Other' },
]

/** One period a fleet car was out to a client — a movement plus its return (if any). */
export interface RentalPeriod {
  id: string
  movementId: string | null
  returnId: string | null
  driverName: string
  driverPhone: string
  purpose: Purpose
  outAt: string | null
  backAt: string | null
  ongoing: boolean
  notes: string // from the movement (Sheet22)
  returnNotes: string // from the return (car return sheet)
}

export interface StaffUser {
  id: string
  email: string
  full_name: string
  role: string
  created_at: string
}

export interface Customer {
  id: string
  driver_name: string
  mobile_number: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  rego: string
  rego_raw: string
  make: string
  model: string
  vehicle_type: string
  status: VehicleStatus
  is_company_car: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface Movement {
  id: string
  customer_id: string | null
  driver_name: string
  driver_phone: string
  owner_name: string
  owner_phone: string
  cars_in_rego: string
  cars_in_rego_raw: string
  cars_out_vehicle_id: string | null
  cars_out_rego: string
  cars_out_rego_raw: string
  rego_raw: string
  make_raw: string
  purpose: Purpose
  purpose_raw: string
  moved_at: string | null
  movement_date: string | null
  movement_time: string
  status: MovementStatus
  needs_review: boolean
  review_reason: string
  client_details_raw: string
  driver_collecting_raw: string
  signed_off: string
  staff_name: string
  notes: string
  source_sheet: string
  source_row: number | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Return {
  id: string
  movement_id: string | null
  customer_id: string | null
  returned_vehicle_id: string | null
  returned_rego: string
  returned_rego_raw: string
  driver_name: string
  driver_name_raw: string
  mobile_number: string
  mobile_number_raw: string
  returned_at: string | null
  return_date: string | null
  return_time: string
  bond_status: string
  staff_name: string
  notes: string
  needs_review: boolean
  review_reason: string
  source_sheet: string
  source_row: number | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  vehicle_id: string | null
  vehicle_rego: string
  customer_id: string | null
  booking_name: string
  booking_mobile: string
  start_at: string
  expected_return_at: string | null
  purpose: Purpose
  status: BookingStatus
  notes: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface Photo {
  id: string
  vehicle_id: string | null
  movement_id: string | null
  return_id: string | null
  booking_id: string | null
  photo_type: PhotoType
  storage_path: string
  notes: string
  uploaded_by: string | null
  uploaded_at: string
}

export interface AuditLog {
  id: number
  staff_user_id: string | null
  action: string
  table_name: string
  record_id: string
  before_json: Record<string, unknown> | null
  after_json: Record<string, unknown> | null
  created_at: string
}

export interface Activity {
  id: number
  staffName: string
  action: string
  table_name: string
  record_id: string
  created_at: string
}

export interface DashboardStats {
  carsOut: number
  returnedToday: number
  goingOutToday: number
  availableCars: number
  bookedCars: number
  overdue: number
  needsAttention: number
}

export interface RegoConflict {
  activeMovement: Movement | null
  bookings: Booking[]
  vehicle: Vehicle | null
}

export interface SearchResults {
  movements: Movement[]
  returns: Return[]
  vehicles: Vehicle[]
  bookings: Booking[]
}
