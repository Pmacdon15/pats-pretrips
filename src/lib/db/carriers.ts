import { neon } from '@neondatabase/serverless'
import { cacheLife, cacheTag } from 'next/cache'
import { CACHE_TAGS } from '../cache/tags'
import { errorForLog } from '../log'
import { CARRIERS_MAX } from '../trip-limits'
import { isMissingColumnOrTable, type Owner } from './owner-stamps'

/*
 * A driver's saved carriers (pt_carriers, src/lib/sql/2026-11-21-carriers.sql):
 * the companies they haul for and their addresses, so a new pre-trip can be
 * filled from one. A trip copies the carrier's name and address when it's
 * started, so changing or deleting a carrier never touches a saved trip.
 */

export const CARRIERS_MIGRATION = 'src/lib/sql/2026-11-21-carriers.sql'

/** A saved carrier, as rows return it. */
export type Carrier = {
	id: number
	name: string
	address: string
	created_at: Date | string
	updated_at: Date | string
}

/** A carrier's own fields, as saved. */
export type CarrierFields = {
	name: string
	address: string
}

const sql = () => neon(`${process.env.DATABASE_URL}`)

/**
 * The driver's saved carriers, oldest first (the order they were added).
 * Cached per driver until one of their carriers changes.
 */
export async function listCarriersDb(driverEmail: string): Promise<Carrier[]> {
	'use cache'
	cacheTag(CACHE_TAGS.driverCarriers(driverEmail))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, address, created_at, updated_at
        FROM pt_carriers
        WHERE driver_email = ${driverEmail}
        ORDER BY created_at, id
        LIMIT ${CARRIERS_MAX}
    `
	return rows as Carrier[]
}

let warnedMissing = false

/**
 * The driver's carriers, or none when they can't be read: before the
 * migration is run (logged once per server instance) or on any other error
 * (logged). Never throws, so a trip can always be started without them.
 */
export async function listCarriersOrNone(
	driverEmail: string,
): Promise<Carrier[]> {
	try {
		return await listCarriersDb(driverEmail)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error('Carriers: could not list them:', errorForLog(error))
		} else if (!warnedMissing) {
			warnedMissing = true
			console.error(
				`Carriers: the pt_carriers table is missing, so no saved carriers are shown. Run ${CARRIERS_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing table was already logged. */
export function resetCarrierWarnings() {
	warnedMissing = false
}

/**
 * Saves a new carrier for the driver. Answers 'too_many' (saving nothing)
 * when they already have CARRIERS_MAX: the count is checked in the INSERT
 * itself.
 */
export async function createCarrierDb(
	owner: Owner,
	fields: CarrierFields,
): Promise<Carrier | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_carriers (driver_email, clerk_user_id, name, address)
        SELECT ${owner.email}, ${owner.userId || null}, ${fields.name.trim()},
            ${fields.address.trim()}
        WHERE (
            SELECT COUNT(*) FROM pt_carriers WHERE driver_email = ${owner.email}
        ) < ${CARRIERS_MAX}
        RETURNING id, name, address, created_at, updated_at
    `
	return (row as Carrier | undefined) ?? 'too_many'
}

/** A carrier's own fields, by their column names. */
export const CARRIER_COLUMNS = ['name', 'address'] as const

export type CarrierColumn = (typeof CARRIER_COLUMNS)[number]

/** A saved update: the carrier now, and its fields as the update found them. */
export type UpdatedCarrier = {
	carrier: Carrier
	before: Pick<Carrier, CarrierColumn>
}

/**
 * Changes one of the driver's carriers. Undefined when it isn't theirs. The
 * row is locked while it's read, so `before` is exactly what was overwritten.
 */
export async function updateCarrierDb(
	carrierId: number,
	driverEmail: string,
	fields: CarrierFields,
): Promise<UpdatedCarrier | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name,
                address AS before_address
            FROM pt_carriers
            WHERE id = ${carrierId} AND driver_email = ${driverEmail}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_carriers
            SET name = ${fields.name.trim()},
                address = ${fields.address.trim()},
                updated_at = NOW()
            FROM target
            WHERE pt_carriers.id = target.target_id
            AND driver_email = ${driverEmail}
            RETURNING pt_carriers.id, pt_carriers.name, pt_carriers.address,
                pt_carriers.created_at, pt_carriers.updated_at
        )
        SELECT updated.*, target.before_name, target.before_address
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** An update's row: the carrier's columns, and its `before_` columns. */
function splitUpdated(
	row: Record<string, unknown> | undefined,
): UpdatedCarrier | undefined {
	if (!row) return undefined
	const { before_name, before_address, ...carrier } = row
	return {
		carrier: carrier as Carrier,
		before: {
			name: before_name as string,
			address: before_address as string,
		},
	}
}

/** The fields an update really changed, by column name. */
export function carrierChangedFields({ carrier, before }: UpdatedCarrier) {
	return CARRIER_COLUMNS.filter((c) => before[c] !== carrier[c])
}

/** Deletes one of the driver's carriers; the deleted row, or undefined. */
export async function deleteCarrierDb(
	carrierId: number,
	driverEmail: string,
): Promise<Carrier | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_carriers
        WHERE id = ${carrierId} AND driver_email = ${driverEmail}
        RETURNING id, name, address, created_at, updated_at
    `
	return row as Carrier | undefined
}

/*
 * An organization's shared carriers (pt_org_carriers,
 * src/lib/sql/2026-11-22-organizations.sql; docs/organizations.md): the same
 * as a driver's own, keyed by the Clerk organization ID. Every member reads
 * them; the DAL lets only the organization's admins change them.
 */

export const ORG_MIGRATION = 'src/lib/sql/2026-11-22-organizations.sql'

/** The organization's carriers, oldest first. Cached until one changes. */
export async function listOrgCarriersDb(orgId: string): Promise<Carrier[]> {
	'use cache'
	cacheTag(CACHE_TAGS.orgCarriers(orgId))
	cacheLife('hours')

	const rows = await sql()`
        SELECT id, name, address, created_at, updated_at
        FROM pt_org_carriers
        WHERE clerk_org_id = ${orgId}
        ORDER BY created_at, id
        LIMIT ${CARRIERS_MAX}
    `
	return rows as Carrier[]
}

let warnedOrgMissing = false

/**
 * The organization's carriers, or none when they can't be read (before the
 * migration is run, logged once per server instance, or on any other error,
 * logged). Never throws.
 */
export async function listOrgCarriersOrNone(orgId: string): Promise<Carrier[]> {
	try {
		return await listOrgCarriersDb(orgId)
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error(
				'Org carriers: could not list them:',
				errorForLog(error),
			)
		} else if (!warnedOrgMissing) {
			warnedOrgMissing = true
			console.error(
				`Org carriers: the pt_org_carriers table is missing, so organizations show no saved carriers. Run ${ORG_MIGRATION}.`,
			)
		}
		return []
	}
}

/** For tests: forget that the missing org table was already logged. */
export function resetOrgCarrierWarnings() {
	warnedOrgMissing = false
}

/**
 * Saves a new carrier for the organization, added by `owner` (an admin).
 * Answers 'too_many' (saving nothing) at CARRIERS_MAX.
 */
export async function createOrgCarrierDb(
	orgId: string,
	owner: Owner,
	fields: CarrierFields,
): Promise<Carrier | 'too_many'> {
	const [row] = await sql()`
        INSERT INTO pt_org_carriers (
            clerk_org_id, driver_email, clerk_user_id, name, address
        )
        SELECT ${orgId}, ${owner.email}, ${owner.userId || null},
            ${fields.name.trim()}, ${fields.address.trim()}
        WHERE (
            SELECT COUNT(*) FROM pt_org_carriers WHERE clerk_org_id = ${orgId}
        ) < ${CARRIERS_MAX}
        RETURNING id, name, address, created_at, updated_at
    `
	return (row as Carrier | undefined) ?? 'too_many'
}

/** Changes one of the organization's carriers; undefined when it isn't theirs. */
export async function updateOrgCarrierDb(
	carrierId: number,
	orgId: string,
	fields: CarrierFields,
): Promise<UpdatedCarrier | undefined> {
	const [row] = await sql()`
        WITH target AS MATERIALIZED (
            SELECT id AS target_id, name AS before_name,
                address AS before_address
            FROM pt_org_carriers
            WHERE id = ${carrierId} AND clerk_org_id = ${orgId}
            FOR UPDATE
        ), updated AS (
            UPDATE pt_org_carriers
            SET name = ${fields.name.trim()},
                address = ${fields.address.trim()},
                updated_at = NOW()
            FROM target
            WHERE pt_org_carriers.id = target.target_id
            AND clerk_org_id = ${orgId}
            RETURNING pt_org_carriers.id, pt_org_carriers.name,
                pt_org_carriers.address, pt_org_carriers.created_at,
                pt_org_carriers.updated_at
        )
        SELECT updated.*, target.before_name, target.before_address
        FROM target JOIN updated ON true
    `
	return splitUpdated(row)
}

/** Deletes one of the organization's carriers; the deleted row, or undefined. */
export async function deleteOrgCarrierDb(
	carrierId: number,
	orgId: string,
): Promise<Carrier | undefined> {
	const [row] = await sql()`
        DELETE FROM pt_org_carriers
        WHERE id = ${carrierId} AND clerk_org_id = ${orgId}
        RETURNING id, name, address, created_at, updated_at
    `
	return row as Carrier | undefined
}
