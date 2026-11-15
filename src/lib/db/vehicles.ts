import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '../cache/tags'
import { errorForLog } from '../log'
import { VEHICLES_MAX } from '../trip-limits'
import { isMissingColumnOrTable, type Owner } from './owner-stamps'

/*
 * A driver's saved vehicles (pt_vehicles, src/lib/sql/2026-11-20-vehicles.sql):
 * the trucks they inspect, so a new pre-trip can be filled from one. A trip
 * copies the vehicle's details when it's started, so changing or deleting a
 * vehicle never touches a saved trip.
 */

export const VEHICLES_MIGRATION = 'src/lib/sql/2026-11-20-vehicles.sql'

/** A saved vehicle, as rows return it. */
export type Vehicle = {
	id: number
	name: string | null
	make: string
	model: string
	truck_plate: string | null
	trailer_plate_a: string | null
	trailer_plate_b: string | null
	created_at: Date | string
	updated_at: Date | string
}

/** A vehicle's own fields, as saved. Empty plates and names are stored as NULL. */
export type VehicleFields = {
	name?: string | null
	make: string
	model: string
	truckPlate?: string | null
	trailerPlateA?: string | null
	trailerPlateB?: string | null
}

/** Fields to change; left out (undefined) keeps the value, '' or null clears it. */
export type VehicleChanges = Partial<VehicleFields>

const sql = () => neon(`${process.env.DATABASE_URL}`)

/** An optional text field as stored: NULL when empty. */
const orNull = (value: string | null | undefined) =>
	value?.trim() ? value.trim() : null

/**
 * The driver's saved vehicles, oldest first (the order they were added).
 * Cached per driver until one of their vehicles changes.
 */
export async function listVehiclesDb(driverEmail: string): Promise<Vehicle[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverVehicles(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
        FROM pt_vehicles
        WHERE driver_email = ${driverEmail}
        ORDER BY created_at, id
        LIMIT ${VEHICLES_MAX}
    `
	return rows as Vehicle[]
}

let warnedMissing = false

/**
 * The driver's vehicles, or none when they can't be read: before the
 * migration is run (logged once per server instance) or on any other error
 * (logged). Never throws, so a trip can always be started without them.
 */
export async function listVehiclesOrNone(
	driverEmail: string,
): Promise<Vehicle[]> {
	try {
		return await listVehiclesDb(driverEmail)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error('Vehicles: could not list them:', errorForLog(error))
		} else if (!warnedMissing) {
			warnedMissing = true
			console.error(
				`Vehicles: the pt_vehicles table is missing, so no saved vehicles are shown. Run ${VEHICLES_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing table was already logged. */
export function resetVehicleWarnings() {
	warnedMissing = false
}

/** One of the driver's vehicles, or undefined when it isn't theirs. */
export async function getVehicleDb(
	vehicleId: number,
	driverEmail: string,
): Promise<Vehicle | undefined> {
	const [row] = await sql()`
        SELECT id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
        FROM pt_vehicles
        WHERE id = ${vehicleId} AND driver_email = ${driverEmail}
    `
	return row as Vehicle | undefined
}

/**
 * Saves a new vehicle for the driver. Answers 'too_many' (saving nothing)
 * when they already have VEHICLES_MAX: the count is checked in the INSERT
 * itself.
 */
export async function createVehicleDb(
	owner: Owner,
	fields: VehicleFields,
): Promise<Vehicle | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_vehicles (
            driver_email, clerk_user_id, name, make, model,
            truck_plate, trailer_plate_a, trailer_plate_b
        )
        SELECT ${owner.email}, ${owner.userId || null}, ${orNull(fields.name)},
            ${fields.make.trim()}, ${fields.model.trim()},
            ${orNull(fields.truckPlate)}, ${orNull(fields.trailerPlateA)},
            ${orNull(fields.trailerPlateB)}
        WHERE (
            SELECT COUNT(*) FROM pt_vehicles WHERE driver_email = ${owner.email}
        ) < ${VEHICLES_MAX}
        RETURNING id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
    `
	return (row as Vehicle | undefined) ?? 'too_many'
}

/** Whether a change was given for a field: undefined leaves it alone. */
const given = (value: unknown) => value !== undefined

/** A vehicle's own fields, by their column names. */
export const VEHICLE_COLUMNS = [
	'name',
	'make',
	'model',
	'truck_plate',
	'trailer_plate_a',
	'trailer_plate_b',
] as const

export type VehicleColumn = (typeof VEHICLE_COLUMNS)[number]

/** A saved update: the vehicle now, and its fields as the update found them. */
export type UpdatedVehicle = {
	vehicle: Vehicle
	before: Pick<Vehicle, VehicleColumn>
}

/**
 * Changes one of the driver's vehicles. Fields left out keep their value;
 * an empty name or plate clears it. Undefined when it isn't theirs. The row
 * is locked while it's read, so `before` is exactly what was overwritten.
 */
export async function updateVehicleDb(
	vehicleId: number,
	driverEmail: string,
	changes: VehicleChanges,
): Promise<UpdatedVehicle | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name, make AS before_make,
                model AS before_model, truck_plate AS before_truck_plate,
                trailer_plate_a AS before_trailer_plate_a,
                trailer_plate_b AS before_trailer_plate_b
            FROM pt_vehicles
            WHERE id = ${vehicleId} AND driver_email = ${driverEmail}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_vehicles
            SET name = CASE WHEN ${given(changes.name)}::boolean THEN ${orNull(changes.name)}::text ELSE pt_vehicles.name END,
                make = COALESCE(${orNull(changes.make)}::text, pt_vehicles.make),
                model = COALESCE(${orNull(changes.model)}::text, pt_vehicles.model),
                truck_plate = CASE WHEN ${given(changes.truckPlate)}::boolean THEN ${orNull(changes.truckPlate)}::text ELSE pt_vehicles.truck_plate END,
                trailer_plate_a = CASE WHEN ${given(changes.trailerPlateA)}::boolean THEN ${orNull(changes.trailerPlateA)}::text ELSE pt_vehicles.trailer_plate_a END,
                trailer_plate_b = CASE WHEN ${given(changes.trailerPlateB)}::boolean THEN ${orNull(changes.trailerPlateB)}::text ELSE pt_vehicles.trailer_plate_b END,
                updated_at = NOW()
            FROM target
            WHERE pt_vehicles.id = target.target_id
            AND driver_email = ${driverEmail}
            RETURNING pt_vehicles.id, pt_vehicles.name, pt_vehicles.make,
                pt_vehicles.model, pt_vehicles.truck_plate,
                pt_vehicles.trailer_plate_a, pt_vehicles.trailer_plate_b,
                pt_vehicles.created_at, pt_vehicles.updated_at
        )
        SELECT updated.*, target.before_name, target.before_make,
            target.before_model, target.before_truck_plate,
            target.before_trailer_plate_a, target.before_trailer_plate_b
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** An update's row: the vehicle's columns, and its `before_` columns. */
function splitUpdated(
	row: Record<string, unknown> | undefined,
): UpdatedVehicle | undefined {
	if (!row) return undefined
	const vehicle: Record<string, unknown> = {}
	const before: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(row)) {
		if (key.startsWith('before_')) before[key.slice(7)] = value
		else vehicle[key] = value
	}
	return {
		vehicle: vehicle as Vehicle,
		before: before as UpdatedVehicle['before'],
	}
}

/** The fields an update really changed, by column name. */
export function vehicleChangedFields({ vehicle, before }: UpdatedVehicle) {
	return VEHICLE_COLUMNS.filter(
		(c) => (before[c] ?? null) !== (vehicle[c] ?? null),
	)
}

/** Deletes one of the driver's vehicles; the deleted row, or undefined. */
export async function deleteVehicleDb(
	vehicleId: number,
	driverEmail: string,
): Promise<Vehicle | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_vehicles
        WHERE id = ${vehicleId} AND driver_email = ${driverEmail}
        RETURNING id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
    `
	return row as Vehicle | undefined
}

/*
 * An organization's shared vehicles (pt_org_vehicles,
 * src/lib/sql/2026-11-22-organizations.sql; docs/organizations.md): the same
 * as a driver's own, keyed by the Clerk organization ID instead of the
 * driver's email. Every member reads them; the DAL lets only the
 * organization's admins change them.
 */

export const ORG_MIGRATION = 'src/lib/sql/2026-11-22-organizations.sql'

/** The organization's vehicles, oldest first. Cached until one changes. */
export async function listOrgVehiclesDb(orgId: string): Promise<Vehicle[]> {
	'use cache'
	cacheTag(CACHE_TAGS.orgVehicles(orgId))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
        FROM pt_org_vehicles
        WHERE clerk_org_id = ${orgId}
        ORDER BY created_at, id
        LIMIT ${VEHICLES_MAX}
    `
	return rows as Vehicle[]
}

let warnedOrgMissing = false

/**
 * The organization's vehicles, or none when they can't be read (before
 * the migration is run, logged once per server instance, or on any other
 * error, logged). Never throws.
 */
export async function listOrgVehiclesOrNone(orgId: string): Promise<Vehicle[]> {
	try {
		return await listOrgVehiclesDb(orgId)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error(
				'Org vehicles: could not list them:',
				errorForLog(error),
			)
		} else if (!warnedOrgMissing) {
			warnedOrgMissing = true
			console.error(
				`Org vehicles: the pt_org_vehicles table is missing, so organizations show no saved vehicles. Run ${ORG_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing org table was already logged. */
export function resetOrgVehicleWarnings() {
	warnedOrgMissing = false
}

/**
 * Saves a new vehicle in the organization's fleet, added by `owner` (an
 * admin). Answers 'too_many' (saving nothing) at VEHICLES_MAX.
 */
export async function createOrgVehicleDb(
	orgId: string,
	owner: Owner,
	fields: VehicleFields,
): Promise<Vehicle | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_org_vehicles (
            clerk_org_id, driver_email, clerk_user_id, name, make, model,
            truck_plate, trailer_plate_a, trailer_plate_b
        )
        SELECT ${orgId}, ${owner.email}, ${owner.userId || null},
            ${orNull(fields.name)}, ${fields.make.trim()},
            ${fields.model.trim()}, ${orNull(fields.truckPlate)},
            ${orNull(fields.trailerPlateA)}, ${orNull(fields.trailerPlateB)}
        WHERE (
            SELECT COUNT(*) FROM pt_org_vehicles WHERE clerk_org_id = ${orgId}
        ) < ${VEHICLES_MAX}
        RETURNING id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
    `
	return (row as Vehicle | undefined) ?? 'too_many'
}

/**
 * Changes one of the organization's vehicles, like updateVehicleDb.
 * Undefined when it isn't the organization's.
 */
export async function updateOrgVehicleDb(
	vehicleId: number,
	orgId: string,
	changes: VehicleChanges,
): Promise<UpdatedVehicle | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name, make AS before_make,
                model AS before_model, truck_plate AS before_truck_plate,
                trailer_plate_a AS before_trailer_plate_a,
                trailer_plate_b AS before_trailer_plate_b
            FROM pt_org_vehicles
            WHERE id = ${vehicleId} AND clerk_org_id = ${orgId}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_org_vehicles
            SET name = CASE WHEN ${given(changes.name)}::boolean THEN ${orNull(changes.name)}::text ELSE pt_org_vehicles.name END,
                make = COALESCE(${orNull(changes.make)}::text, pt_org_vehicles.make),
                model = COALESCE(${orNull(changes.model)}::text, pt_org_vehicles.model),
                truck_plate = CASE WHEN ${given(changes.truckPlate)}::boolean THEN ${orNull(changes.truckPlate)}::text ELSE pt_org_vehicles.truck_plate END,
                trailer_plate_a = CASE WHEN ${given(changes.trailerPlateA)}::boolean THEN ${orNull(changes.trailerPlateA)}::text ELSE pt_org_vehicles.trailer_plate_a END,
                trailer_plate_b = CASE WHEN ${given(changes.trailerPlateB)}::boolean THEN ${orNull(changes.trailerPlateB)}::text ELSE pt_org_vehicles.trailer_plate_b END,
                updated_at = NOW()
            FROM target
            WHERE pt_org_vehicles.id = target.target_id
            AND clerk_org_id = ${orgId}
            RETURNING pt_org_vehicles.id, pt_org_vehicles.name,
                pt_org_vehicles.make, pt_org_vehicles.model,
                pt_org_vehicles.truck_plate, pt_org_vehicles.trailer_plate_a,
                pt_org_vehicles.trailer_plate_b, pt_org_vehicles.created_at,
                pt_org_vehicles.updated_at
        )
        SELECT updated.*, target.before_name, target.before_make,
            target.before_model, target.before_truck_plate,
            target.before_trailer_plate_a, target.before_trailer_plate_b
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** Deletes one of the organization's vehicles; the deleted row, or undefined. */
export async function deleteOrgVehicleDb(
	vehicleId: number,
	orgId: string,
): Promise<Vehicle | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_org_vehicles
        WHERE id = ${vehicleId} AND clerk_org_id = ${orgId}
        RETURNING id, name, make, model, truck_plate, trailer_plate_a,
            trailer_plate_b, created_at, updated_at
    `
	return row as Vehicle | undefined
}

/** A vehicle as a person reads it: its name, or its make and model and plate. */
export function vehicleLabel(
	v: Pick<Vehicle, 'name' | 'make' | 'model' | 'truck_plate'>,
) {
	const base = `${v.make} ${v.model}`
	const label = v.name ? `${v.name} (${base})` : base
	return v.truck_plate ? `${label} · ${v.truck_plate}` : label
}
