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
	/** The trip's whole defects list, comma separated (callers merge it). */
	defects?: string
	/** Appended to the trip's remarks. */
	addRemarks?: string
}

/**
 * Changes a trip from the last 24 hours, the same window the web app allows
 * for on-route defects. Fields left out keep their value; remarks are
 * only ever added to. Undefined when the trip isn't the
 * driver's or is older than 24 hours.
 */
export async function updateTripDb(
	tripId: number,
	driverEmail: string,
	changes: TripChanges,
): Promise<Trip | undefined> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const c = (value: string | undefined) => value ?? null
	const [result] = await sql`
        UPDATE PTTrips
        SET carrier = COALESCE(${c(changes.carrier)}::text, carrier),
            carrierAddress = COALESCE(${c(changes.carrierAddress)}::text, carrierAddress),
            inspectionAddress = COALESCE(${c(changes.inspectionAddress)}::text, inspectionAddress),
            make = COALESCE(${c(changes.make)}::text, make),
            model = COALESCE(${c(changes.model)}::text, model),
            odometer = COALESCE(${changes.odometer ?? null}::int, odometer),
            truckPlate = COALESCE(${c(changes.truckPlate)}::text, truckPlate),
            trailerPlateA = COALESCE(${c(changes.trailerPlateA)}::text, trailerPlateA),
            trailerPlateB = COALESCE(${c(changes.trailerPlateB)}::text, trailerPlateB),
            defects = COALESCE(${c(changes.defects)}::text, defects),
            remarks = CASE
                        WHEN ${c(changes.addRemarks)}::text IS NULL THEN remarks
                        WHEN COALESCE(remarks, '') = '' THEN ${c(changes.addRemarks)}::text
                        ELSE remarks || ', ' || ${c(changes.addRemarks)}::text
                      END
        WHERE tripId = ${tripId}
        AND driverEmail = ${driverEmail}
        AND date >= NOW() - INTERVAL '24 hours'
        RETURNING *
    `
	return result as Trip | undefined
}
