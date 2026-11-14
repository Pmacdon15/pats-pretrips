import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import type z from 'zod'
import { CACHE_TAGS } from '../cache/tags'
import type { Trip } from '../types/types'
import type { schemaTripFields } from '../ZOD/schemas'
import type { StoredFile } from './repairs'

/** The driver's signature for a new trip, and who's saving it ("web" or the AI app). */
export type TripSignature = StoredFile & { source: string }

/**
 * Saves a new trip for the driver, signed when `signature` is given: the trip
 * and its signature are written together, so a trip is never half signed.
 */
export async function createTripDb(
	data: z.infer<typeof schemaTripFields>,
	driverEmail: string,
	signature?: TripSignature | null,
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
                signed_at
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
                ${signature ? now : null}::timestamptz
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

// Update the trip with new defects and remarks
export async function updateTripDefectsDb(
	tripId: number,
	driverEmail: string,
	newDefects: string,
	newRemarks: string,
): Promise<Trip> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`         
        UPDATE PTTrips
        SET defects = CASE 
                        WHEN COALESCE(defects, '') = '' THEN ${newDefects}
                        ELSE COALESCE(defects || ', ' || ${newDefects}, ${newDefects})
                      END,
            remarks = CASE 
                        WHEN COALESCE(remarks, '') = '' THEN ${newRemarks}::text
                        ELSE COALESCE(remarks || ', ' || ${newRemarks}::text, ${newRemarks}::text)
                      END
        WHERE tripId = ${tripId} 
        AND driverEmail = ${driverEmail}
        AND date >= NOW() - INTERVAL '24 hour'
        RETURNING *;
    `

	if (!result) throw new Error('Failed to update trip or trip not found')
	return result as Trip
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
 * One page of the driver's trips: `current` ones (the last 24 hours, which
 * can still be changed) or `past` ones, newest first. Cached per driver until
 * one of their trips changes (see src/lib/cache/revalidate.ts).
 */
export async function listTripsDb(
	driverEmail: string,
	when: 'current' | 'past',
	page: number,
	limit: number,
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
        AND date >= NOW() - INTERVAL '24 hours'
        ORDER BY date DESC
        LIMIT ${limit + 1} OFFSET ${offset}
    `
			: await sql`
        SELECT * FROM PTTrips
        WHERE driverEmail = ${driverEmail}
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
 * Changes a trip from the last 24 hours, the same window the web app allows
 * for on-route defects. Fields left out keep their value; defects and remarks
 * are only ever added to.
 *
 * Once the trip is signed its core details (CORE_TRIP_FIELDS) are locked: an
 * update that would change one of them is refused, changing nothing, and
 * answers 'signed_locked' (passing a field's current value is not a change).
 * The check is in the UPDATE's own WHERE clause, so it holds even when the
 * trip is signed at the same moment. Undefined when the trip isn't the
 * driver's or is older than 24 hours.
 */
export async function updateTripDb(
	tripId: number,
	driverEmail: string,
	changes: TripChanges,
): Promise<Trip | 'signed_locked' | undefined> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const c = (value: string | undefined) => value ?? null
	const odometer = changes.odometer ?? null
	const [row] = await sql`
        WITH target AS (
            SELECT tripId FROM PTTrips
            WHERE tripId = ${tripId}
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hours'
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
                            WHEN ${c(changes.addDefects)}::text IS NULL THEN defects
                            WHEN COALESCE(defects, '') = '' THEN ${c(changes.addDefects)}::text
                            ELSE defects || ', ' || ${c(changes.addDefects)}::text
                          END,
                remarks = CASE
                            WHEN ${c(changes.addRemarks)}::text IS NULL THEN remarks
                            WHEN COALESCE(remarks, '') = '' THEN ${c(changes.addRemarks)}::text
                            ELSE remarks || ', ' || ${c(changes.addRemarks)}::text
                          END
            WHERE tripId = ${tripId}
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
            RETURNING *
        )
        SELECT updated.*, target.tripId AS target_trip_id
        FROM target LEFT JOIN updated ON true
    `
	// No row: not the driver's trip, or older than 24 hours. The trip but not
	// the update: it's signed and a core field would have changed.
	if (!row) return undefined
	if (row.tripid == null) return 'signed_locked'
	const { target_trip_id: _, ...trip } = row
	return trip as Trip
}
