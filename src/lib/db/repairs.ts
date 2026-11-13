import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '../cache/tags'

/*
 * Defect repairs (pt_defect_repairs, see src/lib/sql/2026-11-13-defect-repairs.sql).
 * Every query takes the driver's email, so a driver only ever sees and
 * changes their own. Lists leave out the files; they're read one at a time.
 */

export type Repair = {
	id: number
	trip_id: number
	defect: string
	/** YYYY-MM-DD */
	repaired_on: string
	mechanic_name: string
	shop_name: string | null
	invoice_number: string | null
	notes: string | null
	has_signature: boolean
	has_invoice: boolean
	invoice_type: string | null
	invoice_name: string | null
	invoice_size: number | null
	invoice_original_size: number | null
	source: string
	created_at: string
}

/** A repair with the trip it was found on. */
export type RepairWithTrip = Repair & {
	trip_date: string
	truck_plate: string | null
	make: string
	model: string
}

export type StoredFile = { bytes: Buffer; type: string }

export type NewRepair = {
	tripId: number
	defect: string
	repairedOn: string
	mechanicName: string
	shopName?: string | null
	invoiceNumber?: string | null
	notes?: string | null
	signature?: StoredFile | null
	invoice?: (StoredFile & { name: string; originalSize: number }) | null
	source: string
}

const sql = () => neon(`${process.env.DATABASE_URL}`)
const hex = (file: StoredFile | null | undefined) =>
	file ? file.bytes.toString('hex') : null

const date = (value: unknown) =>
	value instanceof Date
		? value.toISOString().slice(0, 10)
		: String(value).slice(0, 10)

function toRepair(row: Record<string, unknown>): Repair {
	return {
		id: Number(row.id),
		trip_id: Number(row.trip_id),
		defect: String(row.defect),
		repaired_on: date(row.repaired_on),
		mechanic_name: String(row.mechanic_name),
		shop_name: (row.shop_name as string | null) ?? null,
		invoice_number: (row.invoice_number as string | null) ?? null,
		notes: (row.notes as string | null) ?? null,
		has_signature: Boolean(row.has_signature),
		has_invoice: Boolean(row.has_invoice),
		invoice_type: (row.invoice_type as string | null) ?? null,
		invoice_name: (row.invoice_name as string | null) ?? null,
		invoice_size:
			row.invoice_size == null ? null : Number(row.invoice_size),
		invoice_original_size:
			row.invoice_original_size == null
				? null
				: Number(row.invoice_original_size),
		source: String(row.source ?? 'web'),
		created_at: new Date(row.created_at as string).toISOString(),
	}
}

/**
 * Saves a repair for one of the driver's trips. Undefined when the trip
 * isn't theirs, or the defect on it was already marked repaired.
 */
export async function createRepairDb(
	driverEmail: string,
	repair: NewRepair,
): Promise<Repair | undefined> {
	const [row] = await sql()`
        INSERT INTO pt_defect_repairs (
            trip_id, driver_email, defect, repaired_on, mechanic_name,
            shop_name, invoice_number, notes,
            signature, signature_type,
            invoice, invoice_type, invoice_name, invoice_size, invoice_original_size,
            source
        )
        SELECT
            t.tripId, ${driverEmail}, ${repair.defect}, ${repair.repairedOn}::date,
            ${repair.mechanicName}, ${repair.shopName ?? null}, ${repair.invoiceNumber ?? null},
            ${repair.notes ?? null},
            decode(${hex(repair.signature)}::text, 'hex'), ${repair.signature?.type ?? null},
            decode(${hex(repair.invoice)}::text, 'hex'), ${repair.invoice?.type ?? null},
            ${repair.invoice?.name ?? null}, ${repair.invoice?.bytes.length ?? null}::int,
            ${repair.invoice?.originalSize ?? null}::int,
            ${repair.source}
        FROM PTTrips t
        WHERE t.tripId = ${repair.tripId} AND t.driverEmail = ${driverEmail}
        ON CONFLICT DO NOTHING
        RETURNING *, signature IS NOT NULL AS has_signature, invoice IS NOT NULL AS has_invoice
    `
	return row ? toRepair(row) : undefined
}

/** The repairs on one of the driver's trips, cached with their trips. */
export async function listTripRepairsDb(
	tripId: number,
	driverEmail: string,
): Promise<Repair[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrips(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, trip_id, defect, repaired_on, mechanic_name, shop_name,
            invoice_number, notes, invoice_type, invoice_name, invoice_size,
            invoice_original_size, source, created_at,
            signature IS NOT NULL AS has_signature,
            invoice IS NOT NULL AS has_invoice
        FROM pt_defect_repairs
        WHERE trip_id = ${tripId} AND driver_email = ${driverEmail}
        ORDER BY repaired_on, id
    `
	return rows.map(toRepair)
}

/** The driver's repairs, newest first, with the trip each was found on. */
export async function listDriverRepairsDb(
	driverEmail: string,
	limit = 500,
): Promise<RepairWithTrip[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrips(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT r.id, r.trip_id, r.defect, r.repaired_on, r.mechanic_name,
            r.shop_name, r.invoice_number, r.notes, r.invoice_type,
            r.invoice_name, r.invoice_size, r.invoice_original_size,
            r.source, r.created_at,
            r.signature IS NOT NULL AS has_signature,
            r.invoice IS NOT NULL AS has_invoice,
            t.date AS trip_date, t.truckPlate AS truck_plate, t.make, t.model
        FROM pt_defect_repairs r
        JOIN PTTrips t ON t.tripId = r.trip_id
        WHERE r.driver_email = ${driverEmail}
        ORDER BY r.repaired_on DESC, r.id DESC
        LIMIT ${limit}
    `
	return rows.map((row) => ({
		...toRepair(row),
		trip_date: new Date(row.trip_date as string).toISOString(),
		truck_plate: (row.truck_plate as string | null) || null,
		make: String(row.make),
		model: String(row.model),
	}))
}

export type DefectTrip = {
	tripid: number
	date: string
	truckplate: string | null
	make: string
	model: string
	defects: string
}

/** The driver's trips that listed defects, newest first. */
export async function listTripsWithDefectsDb(
	driverEmail: string,
	limit = 300,
): Promise<DefectTrip[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrips(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT tripId, date, truckPlate, make, model, defects
        FROM PTTrips
        WHERE driverEmail = ${driverEmail}
        AND COALESCE(defects, '') <> ''
        AND LOWER(TRIM(defects)) <> 'none'
        ORDER BY date DESC
        LIMIT ${limit}
    `
	return rows.map((row) => ({
		tripid: Number(row.tripid),
		date: new Date(row.date as string).toISOString(),
		truckplate: (row.truckplate as string | null) || null,
		make: String(row.make),
		model: String(row.model),
		defects: String(row.defects ?? ''),
	}))
}

/** A repair's invoice or signature, when it's the driver's and has one. */
export async function getRepairFileDb(
	repairId: number,
	driverEmail: string,
	kind: 'invoice' | 'signature',
): Promise<(StoredFile & { name: string | null }) | undefined> {
	const [row] =
		kind === 'invoice'
			? await sql()`
        SELECT encode(invoice, 'base64') AS data, invoice_type AS type, invoice_name AS name
        FROM pt_defect_repairs
        WHERE id = ${repairId} AND driver_email = ${driverEmail} AND invoice IS NOT NULL
    `
			: await sql()`
        SELECT encode(signature, 'base64') AS data, signature_type AS type, NULL AS name
        FROM pt_defect_repairs
        WHERE id = ${repairId} AND driver_email = ${driverEmail} AND signature IS NOT NULL
    `
	return row?.data
		? {
				bytes: Buffer.from(
					String(row.data).replace(/\s+/g, ''),
					'base64',
				),
				type: String(row.type || 'application/octet-stream'),
				name: (row.name as string | null) ?? null,
			}
		: undefined
}

/** Removes a repair, so the defect shows as open again. */
export async function deleteRepairDb(
	repairId: number,
	driverEmail: string,
): Promise<{ id: number; trip_id: number; defect: string } | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_defect_repairs
        WHERE id = ${repairId} AND driver_email = ${driverEmail}
        RETURNING id, trip_id, defect
    `
	return row
		? {
				id: Number(row.id),
				trip_id: Number(row.trip_id),
				defect: String(row.defect),
			}
		: undefined
}
