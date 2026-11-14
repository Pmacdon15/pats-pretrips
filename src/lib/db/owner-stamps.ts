import { neon } from '@neondatabase/serverless'
import { after } from 'next/server'
import { errorForLog } from '@/lib/log'

/*
 * Recording the Clerk user ID beside the email on driver-owned rows (stage
 * one of moving from emails to user IDs; see docs/clerk-user-id.md and
 * src/lib/sql/2026-11-18-clerk-user-id.sql).
 *
 * Every table keys a driver's rows by their email. An email can change, or be
 * released and later verified on another Clerk account, so the rows will move
 * to the Clerk user ID, which never changes. For now reads still use the
 * email: these stamps only fill the new clerk_user_id column on each write.
 *
 * The writes themselves don't name the column, so saving keeps working when
 * this code is deployed before the migration is run. After a write succeeds,
 * a separate small UPDATE stamps the row. A stamp:
 *
 * - only fills an empty (NULL) clerk_user_id. A row that already holds a
 *   different user ID is left as it is and a warning is logged: that is the
 *   reused-email case this change is about, and only a person should decide
 *   whose row it is.
 * - never throws. A missing column or table (the migration hasn't been run)
 *   is logged once per server instance; any other error is logged each time.
 * - runs after the response where Next.js allows it (`after()`), so it adds
 *   no time to the driver's action; elsewhere it's awaited.
 *
 * Remove this module once reads and writes use clerk_user_id directly.
 */

export const OWNER_MIGRATION = 'src/lib/sql/2026-11-18-clerk-user-id.sql'

/** Whose row it is: the email the row is keyed by, and their Clerk user ID. */
export type Owner = { email: string; userId?: string | null }

/** A row just written, to stamp with its owner's user ID. */
export type OwnerStamp =
	| { table: 'trip'; tripId: number }
	| { table: 'trip_signature'; tripId: number }
	| { table: 'driver_signature' }
	| { table: 'email_settings' }
	| { table: 'repair'; repairId: number }
	| { table: 'email_send'; sendId: string }

type StampCounts = { stamped: number; conflicts: number }

const sql = () => neon(`${process.env.DATABASE_URL}`)

/*
 * One statement per table, written out in full. Each reads the row as it was
 * (`target`), fills clerk_user_id only where it's NULL (`stamped`), and
 * answers how many rows it stamped and how many hold a different user ID.
 * The row's key always includes the email, so a stamp can only ever touch the
 * caller's own rows.
 */
async function runStamp(
	stamp: OwnerStamp,
	email: string,
	userId: string,
): Promise<StampCounts> {
	const db = sql()
	let rows: Record<string, unknown>[]
	switch (stamp.table) {
		case 'trip':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM PTTrips
                    WHERE tripId = ${stamp.tripId} AND driverEmail = ${email}
                ), stamped AS (
                    UPDATE PTTrips SET clerk_user_id = ${userId}
                    WHERE tripId = ${stamp.tripId} AND driverEmail = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
		case 'trip_signature':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM pt_trip_signatures
                    WHERE trip_id = ${stamp.tripId} AND driver_email = ${email}
                ), stamped AS (
                    UPDATE pt_trip_signatures SET clerk_user_id = ${userId}
                    WHERE trip_id = ${stamp.tripId} AND driver_email = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
		case 'driver_signature':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM pt_driver_signatures
                    WHERE driver_email = ${email}
                ), stamped AS (
                    UPDATE pt_driver_signatures SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
		case 'email_settings':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM pt_email_settings
                    WHERE driver_email = ${email}
                ), stamped AS (
                    UPDATE pt_email_settings SET clerk_user_id = ${userId}
                    WHERE driver_email = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
		case 'repair':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM pt_defect_repairs
                    WHERE id = ${stamp.repairId} AND driver_email = ${email}
                ), stamped AS (
                    UPDATE pt_defect_repairs SET clerk_user_id = ${userId}
                    WHERE id = ${stamp.repairId} AND driver_email = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
		case 'email_send':
			rows = await db`
                WITH target AS (
                    SELECT clerk_user_id FROM pt_email_sends
                    WHERE id = ${stamp.sendId} AND driver_email = ${email}
                ), stamped AS (
                    UPDATE pt_email_sends SET clerk_user_id = ${userId}
                    WHERE id = ${stamp.sendId} AND driver_email = ${email}
                    AND clerk_user_id IS NULL
                    RETURNING 1
                )
                SELECT (SELECT COUNT(*) FROM stamped)::int AS stamped,
                    (SELECT COUNT(*) FROM target
                     WHERE clerk_user_id IS DISTINCT FROM ${userId}
                     AND clerk_user_id IS NOT NULL)::int AS conflicts
            `
			break
	}
	const [row] = rows
	return {
		stamped: Number(row?.stamped ?? 0),
		conflicts: Number(row?.conflicts ?? 0),
	}
}

/** The table a stamp writes, and which row, for log lines (never the email). */
function describe(stamp: OwnerStamp) {
	switch (stamp.table) {
		case 'trip':
			return `PTTrips trip ${stamp.tripId}`
		case 'trip_signature':
			return `pt_trip_signatures trip ${stamp.tripId}`
		case 'driver_signature':
			return 'pt_driver_signatures'
		case 'email_settings':
			return 'pt_email_settings'
		case 'repair':
			return `pt_defect_repairs repair ${stamp.repairId}`
		case 'email_send':
			return `pt_email_sends send ${stamp.sendId}`
	}
}

/** Undefined column (42703) or table (42P01): the migration hasn't run. */
export function isMissingColumnOrTable(error: unknown) {
	const code =
		typeof error === 'object' && error !== null
			? (error as { code?: unknown }).code
			: undefined
	return code === '42703' || code === '42P01'
}

let warnedMissing = false

/** Stamps one row. Never throws. */
async function stampOne(stamp: OwnerStamp, email: string, userId: string) {
	try {
		const { conflicts } = await runStamp(stamp, email, userId)
		if (conflicts > 0) {
			console.warn(
				`Owner stamp: ${describe(stamp)} already belongs to a different Clerk user than ${userId}; left as it is. The driver's email may have moved to a new account (see docs/clerk-user-id.md).`,
			)
		}
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error(
				`Owner stamp: could not record the Clerk user on ${describe(stamp)}:`,
				errorForLog(error),
			)
		} else if (!warnedMissing) {
			// Once per server instance, so the logs aren't flooded.
			warnedMissing = true
			console.error(
				`Owner stamp: the clerk_user_id column is missing, so rows are saved without the driver's Clerk user ID. Run ${OWNER_MIGRATION}.`,
			)
		}
	}
}

/**
 * Records `owner.userId` on the rows just written, without ever failing or
 * slowing the write: after the response when called in a server action or
 * route handler, otherwise awaited. Skipped when there's no user ID.
 */
export async function recordOwner(
	owner: Owner,
	...stamps: OwnerStamp[]
): Promise<void> {
	const { email, userId } = owner
	if (!userId || stamps.length === 0) return
	const task = async () => {
		await Promise.all(stamps.map((stamp) => stampOne(stamp, email, userId)))
	}
	try {
		// Vercel keeps the function alive until `after` callbacks finish.
		after(task)
	} catch {
		// Outside a request (or where `after` isn't allowed): stamp now.
		await task()
	}
}

/** For tests: forget that the missing column was already logged. */
export function resetOwnerStampWarnings() {
	warnedMissing = false
}
