import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import type z from 'zod'
import { CACHE_TAGS } from '../cache/tags'
import { STORED_DEFECTS_MAX, STORED_REMARKS_MAX } from '../trip-limits'
import type { Trip } from '../types/types'
import type { schemaTripFields } from '../ZOD/schemas'
import type { StoredFile } from './repairs'

/** The driver's signature for a new trip, and who's saving it ("web" or the AI app). */
export type TripSignature = StoredFile & { source: string }

/**
 * Saves a new trip for the driver, signed when `signature` is given: the trip
 * and its signature are written together, so a trip is never half signed.
 * `orgId` is the organization whose space the trip is started in, or null in
 * the driver's personal space (docs/organizations.md): the lists show a trip
 * in that space only.
 */
export async function createTripDb(
	data: z.infer<typeof schemaTripFields>,
	driverEmail: string,
	signature?: TripSignature | null,
	orgId: string | null = null,
): Promise<Trip> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const now = new Date().toISOString()
	const [result] = await sql`
                WITH t AS (
                INSERT INTO PTTrips (
                driverEmail,
                carrier,
                carrierAddress,
                inspectionAddress,
                make,
                model,
                odometer,
                truckPlate,
                trailerPlateA,
                trailerPlateB,
                date,
                defects,
                remarks,
                signed_at,
                clerk_org_id
                ) VALUES (
                ${driverEmail},
                ${data.carrier},
                ${data.carrierAddress},
                ${data.inspectionAddress},
                ${data.make},
                ${data.model},
                ${data.odometer},
                ${data.truckPlate},
                ${data.trailerPlateA},
                ${data.trailerPlateB},
                ${now},
                ${data.defects},
                ${data.remarks},
                ${signature ? now : null}::timestamptz,
                ${orgId}::text
                )
                RETURNING *
                ), s AS (
                INSERT INTO pt_trip_signatures (trip_id, driver_email, signature, signature_type, source)
                SELECT tripId, driverEmail, decode(${signature ? signature.bytes.toString('hex') : null}::text, 'hex'),
                    ${signature?.type ?? null}, ${signature?.source ?? null}
                FROM t
                WHERE ${signature ? 1 : 0}::int = 1
                )
                SELECT * FROM t;
            `
	return result as Trip
}

// Fetch current defects for a specific trip
export async function getTripDefectsDb(
	tripId: number,
	driverEmail: string,
): Promise<string> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`
        SELECT defects 
        FROM PTTrips
        WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'            
    `
	return result?.defects || ''
}

/** The driver's most recent trip, if they have one. */
export async function getLatestTripDb(
	driverEmail: string,
): Promise<Trip | undefined> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`
        SELECT * FROM PTTrips
        WHERE driverEmail = ${driverEmail}
        ORDER BY date DESC
        LIMIT 1
    `
	return result as Trip | undefined
}

/**
 * The driver's most recent trip in the truck with this plate. Plates are
 * compared without spaces or dashes and ignoring case, so "ABC 123" and
 * "abc-123" are the same truck.
 */
export async function getLatestTripForPlateDb(
	driverEmail: string,
	plate: string,
): Promise<Trip | undefined> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`
        SELECT * FROM PTTrips
        WHERE driverEmail = ${driverEmail}
        AND UPPER(REGEXP_REPLACE(COALESCE(truckPlate, ''), '[^A-Za-z0-9]', '', 'g')) = ${normalizePlate(plate)}
        ORDER BY date DESC
        LIMIT 1
    `
	return result as Trip | undefined
}

/** A plate as compared: letters and digits only, upper case. */
export function normalizePlate(plate: string) {
	return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/**
 * One page of the driver's trips in one space: `current` ones (the last 24
 * hours, which can still be changed) or `past` ones, newest first. `orgId` is
 * the organization's space, or null for the driver's personal space; only
 * trips started in that space are listed (issue #89). Cached per driver until
 * one of their trips changes (see src/lib/cache/revalidate.ts); the space is
 * part of the cache key.
 */
export async function listTripsDb(
	driverEmail: string,
	when: 'current' | 'past',
	page: number,
	limit: number,
	orgId: string | null = null,
): Promise<{ trips: Trip[]; hasMore: boolean }> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrips(driverEmail))
	cacheLife('hours')

	const sql = neon(`${process.env.DATABASE_URL}`)
	const offset = (page - 1) * limit
	// One extra row says whether there's another page.
	const rows =
		when === 'current'
			? await sql`
        SELECT * FROM PTTrips
        WHERE driverEmail = ${driverEmail}
        AND clerk_org_id IS NOT DISTINCT FROM ${orgId}::text
        AND date >= NOW() - INTERVAL '24 hours'
        ORDER BY date DESC
        LIMIT ${limit + 1} OFFSET ${offset}
    `
			: await sql`
        SELECT * FROM PTTrips
        WHERE driverEmail = ${driverEmail}
        AND clerk_org_id IS NOT DISTINCT FROM ${orgId}::text
        AND date < NOW() - INTERVAL '24 hours'
        ORDER BY date DESC
        LIMIT ${limit + 1} OFFSET ${offset}
    `
	return {
		trips: rows.slice(0, limit) as Trip[],
		hasMore: rows.length > limit,
	}
}

/**
 * One of the driver's trips, or undefined when it isn't theirs or doesn't
 * exist. Cached per driver until one of their trips changes.
 */
export async function getTripDb(
	tripId: number,
	driverEmail: string,
): Promise<Trip | undefined> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrips(driverEmail))
	cacheLife('hours')

	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`
        SELECT * FROM PTTrips
        WHERE tripId = ${tripId} AND driverEmail = ${driverEmail}
    `
	return result as Trip | undefined
}

/**
 * The trip's core details: what the driver signs. Once a trip is signed they
 * are locked; only defects and remarks can still be added.
 */
export const CORE_TRIP_FIELDS = [
	'carrier',
	'carrierAddress',
	'inspectionAddress',
	'make',
	'model',
	'odometer',
	'truckPlate',
	'trailerPlateA',
	'trailerPlateB',
] as const

export type CoreTripField = (typeof CORE_TRIP_FIELDS)[number]

export type TripChanges = {
	carrier?: string
	carrierAddress?: string
	inspectionAddress?: string
	make?: string
	model?: string
	odometer?: number
	truckPlate?: string
	trailerPlateA?: string
	trailerPlateB?: string
	/**
	 * Defects to add, comma separated. The database appends them to the
	 * trip's list (callers leave out ones already listed), so defects are
	 * never removed or rewritten.
	 */
	addDefects?: string
	/** Appended to the trip's remarks. */
	addRemarks?: string
}

/**
 * Why updateTripDb changed nothing although the trip was found:
 * - 'signed_locked': the trip is signed and a core field would have changed.
 * - 'defects_too_long' / 'remarks_too_long': appending would take the trip's
 *   defects past STORED_DEFECTS_MAX or its remarks past STORED_REMARKS_MAX
 *   characters (src/lib/trip-limits.ts).
 */
export type TripUpdateRefusal =
	| 'signed_locked'
	| 'defects_too_long'
	| 'remarks_too_long'

/** A trip's core details, by their column names as rows return them. */
export type TripBefore = Pick<Trip, Lowercase<CoreTripField>>

/**
 * A saved update: the trip as it is now, and its core details as the update
 * found them (read from the locked row in the same statement, so exactly
 * what was overwritten; for the audit trail, src/lib/db/audit-events.ts).
 */
export type UpdatedTrip = { trip: Trip; before: TripBefore }

/**
 * Changes a trip from the last 24 hours, the same window the web app allows
 * for on-route defects. Fields left out keep their value; defects and remarks
 * are only ever added to.
 *
 * Once the trip is signed its core details (CORE_TRIP_FIELDS) are locked: an
 * update that would change one of them is refused, changing nothing, and
 * answers 'signed_locked' (passing a field's current value is not a change).
 *
 * Added defects and remarks may not take the trip's whole defects or remarks
 * past STORED_DEFECTS_MAX / STORED_REMARKS_MAX characters: such an update is
 * refused, changing nothing, and answers 'defects_too_long' or
 * 'remarks_too_long' (defects first when both are). A trip already past a
 * limit (saved before it existed) keeps its text; only adding to it is
 * refused.
 *
 * Both checks are in the UPDATE's own WHERE clause, so they hold even when
 * the trip is signed or added to at the same moment. The trip's row is locked
 * (FOR UPDATE) before the update, so the reason given is read from the row as
 * the update saw it. Undefined when the trip isn't the driver's or is older
 * than 24 hours. A saved update answers the trip and, in `before`, its core
 * details as they were (see UpdatedTrip).
 */
export async function updateTripDb(
	tripId: number,
	driverEmail: string,
	changes: TripChanges,
): Promise<UpdatedTrip | TripUpdateRefusal | undefined> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const c = (value: string | undefined) => value ?? null
	const odometer = changes.odometer ?? null
	const addDefects = c(changes.addDefects)
	const addRemarks = c(changes.addRemarks)
	// Appending makes "old, added", or just "added" when there was nothing:
	// the old length plus 2 (or 0 when empty), plus the added length.
	const [row] = await sql`
        WITH target AS MATERIALIZED (
            SELECT tripId,
                carrier AS before_carrier, carrierAddress AS before_carrieraddress,
                inspectionAddress AS before_inspectionaddress, make AS before_make,
                model AS before_model, odometer AS before_odometer,
                truckPlate AS before_truckplate, trailerPlateA AS before_trailerplatea,
                trailerPlateB AS before_trailerplateb,
                (${addDefects}::text IS NOT NULL
                    AND COALESCE(char_length(NULLIF(defects, '')) + 2, 0) + char_length(${addDefects}::text) > ${STORED_DEFECTS_MAX}::int
                ) AS defects_too_long,
                (${addRemarks}::text IS NOT NULL
                    AND COALESCE(char_length(NULLIF(remarks, '')) + 2, 0) + char_length(${addRemarks}::text) > ${STORED_REMARKS_MAX}::int
                ) AS remarks_too_long
            FROM PTTrips
            WHERE tripId = ${tripId}
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hours'
            FOR UPDATE
        ), updated AS (
            UPDATE PTTrips
            SET carrier = COALESCE(${c(changes.carrier)}::text, carrier),
                carrierAddress = COALESCE(${c(changes.carrierAddress)}::text, carrierAddress),
                inspectionAddress = COALESCE(${c(changes.inspectionAddress)}::text, inspectionAddress),
                make = COALESCE(${c(changes.make)}::text, make),
                model = COALESCE(${c(changes.model)}::text, model),
                odometer = COALESCE(${odometer}::int, odometer),
                truckPlate = COALESCE(${c(changes.truckPlate)}::text, truckPlate),
                trailerPlateA = COALESCE(${c(changes.trailerPlateA)}::text, trailerPlateA),
                trailerPlateB = COALESCE(${c(changes.trailerPlateB)}::text, trailerPlateB),
                defects = CASE
                            WHEN ${addDefects}::text IS NULL THEN defects
                            WHEN COALESCE(defects, '') = '' THEN ${addDefects}::text
                            ELSE defects || ', ' || ${addDefects}::text
                          END,
                remarks = CASE
                            WHEN ${addRemarks}::text IS NULL THEN remarks
                            WHEN COALESCE(remarks, '') = '' THEN ${addRemarks}::text
                            ELSE remarks || ', ' || ${addRemarks}::text
                          END
            FROM target
            WHERE PTTrips.tripId = target.tripId
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hours'
            AND (
                signed_at IS NULL
                OR (
                    (${c(changes.carrier)}::text IS NULL OR ${c(changes.carrier)}::text IS NOT DISTINCT FROM carrier)
                    AND (${c(changes.carrierAddress)}::text IS NULL OR ${c(changes.carrierAddress)}::text IS NOT DISTINCT FROM carrierAddress)
                    AND (${c(changes.inspectionAddress)}::text IS NULL OR ${c(changes.inspectionAddress)}::text IS NOT DISTINCT FROM inspectionAddress)
                    AND (${c(changes.make)}::text IS NULL OR ${c(changes.make)}::text IS NOT DISTINCT FROM make)
                    AND (${c(changes.model)}::text IS NULL OR ${c(changes.model)}::text IS NOT DISTINCT FROM model)
                    AND (${odometer}::int IS NULL OR ${odometer}::int IS NOT DISTINCT FROM odometer)
                    AND (${c(changes.truckPlate)}::text IS NULL OR ${c(changes.truckPlate)}::text IS NOT DISTINCT FROM truckPlate)
                    AND (${c(changes.trailerPlateA)}::text IS NULL OR ${c(changes.trailerPlateA)}::text IS NOT DISTINCT FROM trailerPlateA)
                    AND (${c(changes.trailerPlateB)}::text IS NULL OR ${c(changes.trailerPlateB)}::text IS NOT DISTINCT FROM trailerPlateB)
                )
            )
            AND (${addDefects}::text IS NULL
                OR COALESCE(char_length(NULLIF(defects, '')) + 2, 0) + char_length(${addDefects}::text) <= ${STORED_DEFECTS_MAX}::int)
            AND (${addRemarks}::text IS NULL
                OR COALESCE(char_length(NULLIF(remarks, '')) + 2, 0) + char_length(${addRemarks}::text) <= ${STORED_REMARKS_MAX}::int)
            RETURNING PTTrips.*
        )
        SELECT updated.*, target.tripId AS target_trip_id,
            target.defects_too_long, target.remarks_too_long,
            target.before_carrier, target.before_carrieraddress,
            target.before_inspectionaddress, target.before_make,
            target.before_model, target.before_odometer,
            target.before_truckplate, target.before_trailerplatea,
            target.before_trailerplateb
        FROM target LEFT JOIN updated ON true
    `
	// No row: not the driver's trip, or older than 24 hours. The trip but not
	// the update: added text would be too long, or it's signed and a core
	// field would have changed.
	if (!row) return undefined
	if (row.tripid == null) {
		if (row.defects_too_long) return 'defects_too_long'
		if (row.remarks_too_long) return 'remarks_too_long'
		return 'signed_locked'
	}
	const {
		target_trip_id: _,
		defects_too_long: _defects,
		remarks_too_long: _remarks,
		...rest
	} = row
	const before: Record<string, unknown> = {}
	const trip: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(rest)) {
		if (key.startsWith(BEFORE)) before[key.slice(BEFORE.length)] = value
		else trip[key] = value
	}
	return { trip: trip as unknown as Trip, before: before as TripBefore }
}

/** The prefix of the core fields as they were, in updateTripDb's answer. */
const BEFORE = 'before_'
