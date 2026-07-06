# Starr365 — findings & mapping

## Access result
- **Accessible?** Yes — via the logged-in web app at `i.starr365.com` (account *Aaron Rent, 12608*). The live browser/extension inspection was flaky, so data was obtained the reliable way: **native Starr365 exports** (`.xls`).
- **Export?** Yes — Starr365 exports `.xls` (BIFF/Composite Document, code page 1252). Two reports were exported:
  - `Booking-list.xls` — current bookings (537 rows).
  - `UtilityReport.xls` — fleet utilisation (503 cars).
- **API?** Not used/needed — export covers what In N Out needs. (No public API was authenticated; if one exists it wasn't required.)
- **Modules seen in the top nav:** Dashboard · Analytics · **Booking** · Invoice · People · Inventory · Account · My Shop. In N Out only needs the Booking + Inventory (fleet) data.

## Fields found

### Booking-list.xls (the booking workflow) — 537 rows
| Column | Example | Meaning |
| --- | --- | --- |
| Car | `2AX2OP` | vehicle rego |
| Date | `06 Jul 16:19` | when the booking was created |
| Booking | `Checked In (191704)` | **status + Starr365 booking id**. Status seen: *Checked In* (= car currently OUT on rent) |
| Reference | `1` / blank | optional reference |
| Client | *(name)* | customer name |
| Start Date | `06 Jul 2026 16:18` | rental start date/time |
| Finish Date | `Return not set` / a date | expected/actual return (`Return not set` = still out) |
| Rent | `80`, `180` | rent amount (per week) |
| Duration(Weeks) | blank | rental length |

Every row in this export is **"Checked In"** — i.e. these are the cars **out right now**.

### UtilityReport.xls (the fleet) — 503 cars
| Column | Example | Meaning |
| --- | --- | --- |
| CarNum | `2CR7TQ` | rego |
| Type | `Car` / `Van` | vehicle type |
| Make / Model / Year | `Toyota / Hiace / 2025` | vehicle details |
| Current Status | `Active Fleet` | fleet status (all = Active Fleet) |
| Total / Booked / Available Days, Booking % | `5 / 5 / 0 / 100` | utilisation stats |

You also supplied an **active fleet list of 686 regos** (rego + make-model-year-VIN) — a superset of the UtilityReport.

## How it maps into In N Out
| Starr365 | In N Out |
| --- | --- |
| UtilityReport `CarNum` | `vehicles.rego` |
| `Type` (Car/Van) | `vehicles.vehicle_type` |
| `Make` / `Model` / `Year` | `vehicles.make` / `vehicles.model` (+ year in notes) |
| Active Fleet | `vehicles.is_company_car = true` |
| Booking-list `Car` = "Checked In" | that vehicle → `status = 'out'`; others in the fleet → `available` |
| Booking-list row (Checked In) | a `vehicle_movements` row: `cars_out_rego`=Car, `driver_name`=Client, `moved_at`=Start Date, `purpose`=RENT, notes=`Starr365 rent $X/wk · ref NNNNN`, `source_sheet`='Starr365', `source_row`=Starr365 booking id (de-dupe key) |
| `Start Date` | `movement.moved_at` |
| `Finish Date` (`Return not set`) | left open — car is still out |
| `Rent` | captured in movement notes |
| Booking id `191704` | `source_row` for de-duplication (re-import is idempotent) |

## Import
Run by `scripts/import-star365.mjs` (dry-run + live; re-runnable, de-duped on the Starr365 booking id):
```bash
npm run star365:dry -- "/path/to/UtilityReport.xls" "/path/to/Booking-list.xls"
npm run star365     -- "/path/to/UtilityReport.xls" "/path/to/Booking-list.xls"
```
It (1) enriches the fleet vehicles with make/model/year/type + marks them company cars, (2) marks currently-checked-in cars **out** and the rest of the fleet **available**, and (3) creates an active movement per current rental so staff can see who has each car.

## Limits / manual steps
- The booking export carries **no phone number** (Client name only) — phone stays blank on imported movements; staff can fill it in-app.
- Starr365 statuses beyond *Checked In* (e.g. reserved/returned/cancelled) weren't in this export; only current out-on-rent bookings were provided.
- This is a **one-way snapshot import**, not a live sync. Re-export + re-run to refresh. A live API sync would be a future project.
- No Starr365 passwords, cookies, or tokens are stored anywhere in this repo.
