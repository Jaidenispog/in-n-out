# Data Import Plan — `RETURN SHEET DATA.xlsx`

How the legacy workbook is imported into Supabase. Implemented in
[`scripts/import.mjs`](scripts/import.mjs) (CLI + orchestration) and
[`scripts/import-lib.mjs`](scripts/import-lib.mjs) (defensive per-cell parsers).

## What is read (and what is ignored)

The workbook has 9 sheets. **Only two are read; every other sheet is ignored:**

1. **`Sheet22`** → `vehicle_movements` (customer car **in** / company car **out**)
2. **`Car return Sheet`** → `vehicle_returns` (customer brings the company car back)

If either sheet is missing the import aborts with the list of sheets it did find.

## Field mapping

### Sheet22 → `vehicle_movements`
| Spreadsheet column | Target | Notes |
| --- | --- | --- |
| `Column 1` (A) | `movement_date` / `moved_at` | Excel serial date → real date |
| `TIME` (C) | `movement_time` | Excel time fraction → `HH:MM` |
| `REGO` (B) | `rego_raw` | kept as-is |
| `CARS IN ` (D) | `cars_in_rego` (+ `cars_in_rego_raw`) | normalised: trimmed + uppercased |
| `CARS OUT` (E) | `cars_out_rego` (+ `cars_out_rego_raw`) | normalised; also find-or-creates the fleet vehicle |
| `MAKE OF CAR` (F) | `make_raw` | |
| `WHAT PURPOSE…` (G) | `purpose` (+ `purpose_raw`) | canonicalised to RENT/COURTESY/REPAIRS/TOWED/SWAP/PICKUP/RETURN/OTHER; raw text preserved |
| `CLIENT DETAILS` (H) | `driver_name` + `driver_phone` (+ `client_details_raw`) | phone extracted by regex; **full original text always kept** |
| `DRIVER COLLECTING…` (I) | `driver_collecting_raw` | |
| `SIGNED OFF` (J) | `signed_off` | |

### Car return Sheet → `vehicle_returns`
| Spreadsheet column | Target | Notes |
| --- | --- | --- |
| `DRIVERS` | `driver_name` (+ `driver_name_raw`) | |
| `MOBILE NUMBER ` | `mobile_number` (+ `mobile_number_raw`) | normalised phone |
| `REGO` | `returned_rego` (+ `returned_rego_raw`) | normalised |
| `DATE RETURN` | `return_date` / `returned_at` | mixed formats normalised (below) |
| `TIME` | `return_time` | Excel time fraction → `HH:MM` |
| `BOND STATUS` | `bond_status` | |
| blank/unnamed note columns | `notes` | positional; preserved |

Returns are linked to the movement that sent the car out where a confident match exists
(`movement_id`); the movement is marked returned and the vehicle freed.

## Messy-data handling (confirmed against the real file)
- **Headers** have trailing spaces / typos / leading spaces (e.g. `CARS IN `, `DROPPIMG`,
  `         BOND STATUS`) → matched by **trimmed, case-insensitive** comparison.
- **Dates** are mixed within one column — Excel serials (`45756`), `DD-MM-YYYY`, and
  `DD/MM/YYYY` — detected per cell and normalised; unreadable dates are flagged, not dropped.
- **Times** are Excel fractions (0–1) → converted to `HH:MM`; blanks tolerated.
- **`CLIENT DETAILS`** packs name + phone in one cell → phone pulled out by regex, and the
  **complete original string is preserved** in `client_details_raw`.
- **Blank / sparse rows** and trailing dead columns are skipped without crashing.
- **Every original row** is stored verbatim in `raw_import_rows` (keyed by `source_sheet` +
  `source_row`) and is viewable on any imported record via "Original spreadsheet row".

## Date/time conversion strategy
Excel serials are converted from the 1900 epoch; text dates are parsed for both `-` and `/`
separators (with a `mm/dd` tolerance). Times stored as local `HH:MM`. A combined `moved_at` /
`returned_at` timestamp is derived best-effort from date + time for sorting.

## Duplicate prevention & re-runs
- Each source row is tagged with `source_sheet` + `source_row`; every raw row is kept in
  `raw_import_rows`.
- **The importer refuses to run if the database already contains records** — this prevents
  accidental double-imports.
- **`--force` performs a FULL RESET**: it deletes *all* movements, returns, bookings, vehicles,
  customers, photos, and raw rows (including anything staff created in the app) before
  re-importing. **Only use `--force` before go-live.** After staff start entering live data, a
  `--force` re-import would erase their work.

## Review queue
Rows the parser isn't sure about (unreadable date, missing rego, suspicious fields) are saved
with `needs_review = true` and a reason, and surface on the in-app **Import review** screen for a
quick human check. Recent movements that look like the car may still be out are marked active for
confirmation (see `ACTIVE_WINDOW_DAYS` in `import.mjs`).

## How to run

Prereqs: `npm install`, and (for a live import) `.env` with `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`.

```bash
# 1) Dry run — needs no database; writes a preview + report to import-output/ (gitignored)
npm run import:dry -- "/path/to/RETURN SHEET DATA.xlsx"

# 2) Review import-output/ (row counts, flagged rows, active-car confirmations)

# 3) Live import (first time only; before staff use the app)
npm run import -- "/path/to/RETURN SHEET DATA.xlsx"

# Full reset + re-import (DANGER: wipes everything, incl. app-created rows)
npm run import -- "/path/to/RETURN SHEET DATA.xlsx" --force
```

## Privacy
No customer names, phone numbers, or row data are committed to the repo. Real data lives only in
your Supabase project and (for dry runs) in the gitignored `import-output/` folder.
