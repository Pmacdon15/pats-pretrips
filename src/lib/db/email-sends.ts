import { neon } from '@neondatabase/serverless'
import {
	BURST_SEND_LIMIT,
	BURST_SEND_WINDOW_SECONDS,
	DAILY_SEND_LIMIT,
	DAILY_SEND_WINDOW_SECONDS,
} from '@/lib/email/config'

/* The pt_email_sends log (src/lib/sql/2026-11-16-email-sends.sql). */

export type EmailSendKind = 'manual' | 'auto'

export type RecentEmailSend = {
	/** How long ago the send was reserved. */
	ageSeconds: number
	recipients: number
}

/**
 * Adds a 'reserved' row for an email about to go out, but only if it keeps
 * the driver within both send limits. Returns the row's id, or null when the
 * driver is over a limit (nothing is added).
 *
 * The count and the insert run in one transaction that first takes a
 * per-driver advisory lock, so two requests from the same driver wait for each
 * other and the second one counts the first one's row: concurrent requests
 * can't get past the limits. Throws on any database error, including the
 * table not existing yet (Postgres code 42P01).
 */
export async function reserveEmailSendDb(
	driverEmail: string,
	send: { tripId: number | null; recipients: number; kind: EmailSendKind },
): Promise<string | null> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [, rows] = await sql.transaction([
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`pt_email_sends:${driverEmail}`}::text, 0))`,
		sql`
			INSERT INTO pt_email_sends (driver_email, trip_id, recipient_count, kind)
			SELECT ${driverEmail}, ${send.tripId}::int, ${send.recipients}::int, ${send.kind}
			FROM (
				SELECT
					COALESCE(SUM(recipient_count), 0) AS day,
					COALESCE(SUM(recipient_count) FILTER (
						WHERE created_at > NOW() - make_interval(secs => ${BURST_SEND_WINDOW_SECONDS}::float8)
					), 0) AS burst
				FROM pt_email_sends
				WHERE driver_email = ${driverEmail}
				AND created_at > NOW() - make_interval(secs => ${DAILY_SEND_WINDOW_SECONDS}::float8)
			) used
			WHERE used.day + ${send.recipients}::int <= ${DAILY_SEND_LIMIT}::int
			AND used.burst + ${send.recipients}::int <= ${BURST_SEND_LIMIT}::int
			RETURNING id
		`,
	])
	const [row] = rows as { id: string | number }[]
	return row ? String(row.id) : null
}

/** The driver's sends that still count towards the daily limit. */
export async function recentEmailSendsDb(
	driverEmail: string,
): Promise<RecentEmailSend[]> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const rows = await sql`
		SELECT EXTRACT(EPOCH FROM NOW() - created_at) AS age_seconds, recipient_count
		FROM pt_email_sends
		WHERE driver_email = ${driverEmail}
		AND created_at > NOW() - make_interval(secs => ${DAILY_SEND_WINDOW_SECONDS}::float8)
	`
	return rows.map((row) => ({
		ageSeconds: Number(row.age_seconds),
		recipients: Number(row.recipient_count),
	}))
}

/** Marks a reserved send as accepted by SES. */
export async function confirmEmailSendDb(
	id: string,
	sesMessageId: string | null,
) {
	const sql = neon(`${process.env.DATABASE_URL}`)
	await sql`
		UPDATE pt_email_sends
		SET status = 'sent', ses_message_id = ${sesMessageId}, sent_at = NOW()
		WHERE id = ${id}
	`
}

/** Removes a reserved send that didn't go out, so it doesn't count. */
export async function releaseEmailSendDb(id: string) {
	const sql = neon(`${process.env.DATABASE_URL}`)
	await sql`
		DELETE FROM pt_email_sends WHERE id = ${id} AND status = 'reserved'
	`
}
