import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '../cache/tags'
import { errorForLog } from '../log'
import { TRAILERS_MAX } from '../trip-limits'
import { isMissingColumnOrTable, type Owner } from './owner-stamps'

/*
 * A driver's saved trailers (pt_trailers, src/lib/sql/2026-11-23-trailers.sql):
 * the trailers they pull, each a name and a plate, so a new pre-trip's
 * trailer plates can be picked from them. A trip copies the plate when it's
 * started, so changing or deleting a trailer never touches a saved trip.
 */

export const TRAILERS_MIGRATION = 'src/lib/sql/2026-11-23-trailers.sql'

/** A saved trailer, as rows return it. */
export type Trailer = {
	id: number
	name: string | null
	plate: string
	created_at: Date | string
	updated_at: Date | string
}

/** A trailer's own fields, as saved. An empty name is stored as NULL. */
export type TrailerFields = {
	name?: string | null
	plate: string
}

const sql = () => neon(`${process.env.DATABASE_URL}`)

/** An optional text field as stored: NULL when empty. */
const orNull = (value: string | null | undefined) =>
	value?.trim() ? value.trim() : null

/**
 * The driver's saved trailers, oldest first (the order they were added).
 * Cached per driver until one of their trailers changes.
 */
export async function listTrailersDb(driverEmail: string): Promise<Trailer[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverTrailers(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, plate, created_at, updated_at
        FROM pt_trailers
        WHERE driver_email = ${driverEmail}
        ORDER BY created_at, id
        LIMIT ${TRAILERS_MAX}
    `
	return rows as Trailer[]
}

let warnedMissing = false

/**
 * The driver's trailers, or none when they can't be read: before the
 * migration is run (logged once per server instance) or on any other error
 * (logged). Never throws, so a trip can always be started without them.
 */
export async function listTrailersOrNone(
	driverEmail: string,
): Promise<Trailer[]> {
	try {
		return await listTrailersDb(driverEmail)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error('Trailers: could not list them:', errorForLog(error))
		} else if (!warnedMissing) {
			warnedMissing = true
			console.error(
				`Trailers: the pt_trailers table is missing, so no saved trailers are shown. Run ${TRAILERS_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing table was already logged. */
export function resetTrailerWarnings() {
	warnedMissing = false
}

/**
 * Saves a new trailer for the driver. Answers 'too_many' (saving nothing)
 * when they already have TRAILERS_MAX: the count is checked in the INSERT
 * itself.
 */
export async function createTrailerDb(
	owner: Owner,
	fields: TrailerFields,
): Promise<Trailer | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_trailers (driver_email, clerk_user_id, name, plate)
        SELECT ${owner.email}, ${owner.userId || null}, ${orNull(fields.name)},
            ${fields.plate.trim()}
        WHERE (
            SELECT COUNT(*) FROM pt_trailers WHERE driver_email = ${owner.email}
        ) < ${TRAILERS_MAX}
        RETURNING id, name, plate, created_at, updated_at
    `
	return (row as Trailer | undefined) ?? 'too_many'
}

/** A trailer's own fields, by their column names. */
export const TRAILER_COLUMNS = ['name', 'plate'] as const

export type TrailerColumn = (typeof TRAILER_COLUMNS)[number]

/** A saved update: the trailer now, and its fields as the update found them. */
export type UpdatedTrailer = {
	trailer: Trailer
	before: Pick<Trailer, TrailerColumn>
}

/**
 * Changes one of the driver's trailers; an empty name clears it. Undefined
 * when it isn't theirs. The row is locked while it's read, so `before` is
 * exactly what was overwritten.
 */
export async function updateTrailerDb(
	trailerId: number,
	driverEmail: string,
	fields: TrailerFields,
): Promise<UpdatedTrailer | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name,
                plate AS before_plate
            FROM pt_trailers
            WHERE id = ${trailerId} AND driver_email = ${driverEmail}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_trailers
            SET name = ${orNull(fields.name)},
                plate = ${fields.plate.trim()},
                updated_at = NOW()
            FROM target
            WHERE pt_trailers.id = target.target_id
            AND driver_email = ${driverEmail}
            RETURNING pt_trailers.id, pt_trailers.name, pt_trailers.plate,
                pt_trailers.created_at, pt_trailers.updated_at
        )
        SELECT updated.*, target.before_name, target.before_plate
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** An update's row: the trailer's columns, and its `before_` columns. */
function splitUpdated(
	row: Record<string, unknown> | undefined,
): UpdatedTrailer | undefined {
	if (!row) return undefined
	const { before_name, before_plate, ...trailer } = row
	return {
		trailer: trailer as Trailer,
		before: {
			name: (before_name as string | null) ?? null,
			plate: before_plate as string,
		},
	}
}

/** The fields an update really changed, by column name. */
export function trailerChangedFields({ trailer, before }: UpdatedTrailer) {
	return TRAILER_COLUMNS.filter(
		(c) => (before[c] ?? null) !== (trailer[c] ?? null),
	)
}

/** Deletes one of the driver's trailers; the deleted row, or undefined. */
export async function deleteTrailerDb(
	trailerId: number,
	driverEmail: string,
): Promise<Trailer | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_trailers
        WHERE id = ${trailerId} AND driver_email = ${driverEmail}
        RETURNING id, name, plate, created_at, updated_at
    `
	return row as Trailer | undefined
}

/*
 * An organization's shared trailers (pt_org_trailers, in the same
 * migration; docs/organizations.md): the same as a driver's own, keyed by
 * the Clerk organization ID. Every member reads them; the DAL lets only the
 * organization's admins change them.
 */

/** The organization's trailers, oldest first. Cached until one changes. */
export async function listOrgTrailersDb(orgId: string): Promise<Trailer[]> {
	'use cache'
	cacheTag(CACHE_TAGS.orgTrailers(orgId))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, plate, created_at, updated_at
        FROM pt_org_trailers
        WHERE clerk_org_id = ${orgId}
        ORDER BY created_at, id
        LIMIT ${TRAILERS_MAX}
    `
	return rows as Trailer[]
}

let warnedOrgMissing = false

/**
 * The organization's trailers, or none when they can't be read (before the
 * migration is run, logged once per server instance, or on any other error,
 * logged). Never throws.
 */
export async function listOrgTrailersOrNone(orgId: string): Promise<Trailer[]> {
	try {
		return await listOrgTrailersDb(orgId)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error(
				'Org trailers: could not list them:',
				errorForLog(error),
			)
		} else if (!warnedOrgMissing) {
			warnedOrgMissing = true
			console.error(
				`Org trailers: the pt_org_trailers table is missing, so organizations show no saved trailers. Run ${TRAILERS_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing org table was already logged. */
export function resetOrgTrailerWarnings() {
	warnedOrgMissing = false
}

/**
 * Saves a new trailer for the organization, added by `owner` (an admin).
 * Answers 'too_many' (saving nothing) at TRAILERS_MAX.
 */
export async function createOrgTrailerDb(
	orgId: string,
	owner: Owner,
	fields: TrailerFields,
): Promise<Trailer | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_org_trailers (
            clerk_org_id, driver_email, clerk_user_id, name, plate
        )
        SELECT ${orgId}, ${owner.email}, ${owner.userId || null},
            ${orNull(fields.name)}, ${fields.plate.trim()}
        WHERE (
            SELECT COUNT(*) FROM pt_org_trailers WHERE clerk_org_id = ${orgId}
        ) < ${TRAILERS_MAX}
        RETURNING id, name, plate, created_at, updated_at
    `
	return (row as Trailer | undefined) ?? 'too_many'
}

/** Changes one of the organization's trailers; undefined when it isn't theirs. */
export async function updateOrgTrailerDb(
	trailerId: number,
	orgId: string,
	fields: TrailerFields,
): Promise<UpdatedTrailer | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name,
                plate AS before_plate
            FROM pt_org_trailers
            WHERE id = ${trailerId} AND clerk_org_id = ${orgId}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_org_trailers
            SET name = ${orNull(fields.name)},
                plate = ${fields.plate.trim()},
                updated_at = NOW()
            FROM target
            WHERE pt_org_trailers.id = target.target_id
            AND clerk_org_id = ${orgId}
            RETURNING pt_org_trailers.id, pt_org_trailers.name,
                pt_org_trailers.plate, pt_org_trailers.created_at,
                pt_org_trailers.updated_at
        )
        SELECT updated.*, target.before_name, target.before_plate
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** Deletes one of the organization's trailers; the deleted row, or undefined. */
export async function deleteOrgTrailerDb(
	trailerId: number,
	orgId: string,
): Promise<Trailer | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_org_trailers
        WHERE id = ${trailerId} AND clerk_org_id = ${orgId}
        RETURNING id, name, plate, created_at, updated_at
    `
	return row as Trailer | undefined
}
