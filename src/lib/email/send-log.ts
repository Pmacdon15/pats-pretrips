import {
	confirmEmailSendDb,
	type EmailSendKind,
	type RecentEmailSend,
	recentEmailSendsDb,
	releaseEmailSendDb,
	reserveEmailSendDb,
} from '@/lib/db/email-sends'
import {
	BURST_SEND_LIMIT,
	BURST_SEND_WINDOW_SECONDS,
	DAILY_SEND_LIMIT,
	DAILY_SEND_WINDOW_SECONDS,
} from './config'

/*
 * The per-driver send limits (see config.ts), kept in the pt_email_sends log.
 *
 * Every email is reserved in the log before it goes to SES, confirmed once SES
 * accepts it, and released if it fails. When the log can't be used (the
 * migration hasn't been run yet, or the database errors) emails still send:
 * this is a paid feature that already works, and blocking it on a missing
 * table would break it for every paying driver.
 */

export type SendSlot =
	/** Go ahead. id is the log row, or null when the log couldn't be used. */
	| { ok: true; id: string | null }
	/** Over a limit; retryInSeconds is null when that couldn't be worked out. */
	| { ok: false; retryInSeconds: number | null }

const WINDOWS = [
	{ seconds: DAILY_SEND_WINDOW_SECONDS, limit: DAILY_SEND_LIMIT },
	{ seconds: BURST_SEND_WINDOW_SECONDS, limit: BURST_SEND_LIMIT },
]

/**
 * How long until the driver can send to `recipients` more people: the time
 * until enough of their oldest sends fall out of each window.
 */
export function secondsUntilAllowed(
	sends: RecentEmailSend[],
	recipients: number,
): number {
	let wait = 0
	for (const window of WINDOWS) {
		const oldestFirst = sends
			.filter((send) => send.ageSeconds < window.seconds)
			.sort((a, b) => b.ageSeconds - a.ageSeconds)
		let used = oldestFirst.reduce((sum, send) => sum + send.recipients, 0)
		for (const send of oldestFirst) {
			if (used + recipients <= window.limit) break
			used -= send.recipients
			wait = Math.max(wait, window.seconds - send.ageSeconds)
		}
	}
	return Math.ceil(wait)
}

/** "1 minute", "25 minutes", "3 hours": rounded up, never "0". */
export function waitText(seconds: number) {
	const minutes = Math.max(1, Math.ceil(seconds / 60))
	if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`
	const hours = Math.ceil(minutes / 60)
	return hours === 1 ? '1 hour' : `${hours} hours`
}

/** What a driver over a limit is told. */
export function sendLimitMessage(retryInSeconds: number | null) {
	const when =
		retryInSeconds === null
			? 'Please try again later.'
			: `You can send this one in about ${waitText(retryInSeconds)}.`
	return `You’ve reached the limit for emailing pre-trips (${DAILY_SEND_LIMIT} addresses a day, ${BURST_SEND_LIMIT} in 10 minutes; each address counts). ${when}`
}

const isMissingTable = (e: unknown) =>
	typeof e === 'object' &&
	e !== null &&
	(e as { code?: unknown }).code === '42P01'

let warnedMissingTable = false

/**
 * Reserves a send in the log if it's within the driver's limits. Never
 * throws: if the log can't be used, the send goes ahead unlogged.
 */
export async function reserveEmailSend(
	driverEmail: string,
	send: { tripId: number | null; recipients: number; kind: EmailSendKind },
): Promise<SendSlot> {
	let id: string | null
	try {
		id = await reserveEmailSendDb(driverEmail, send)
	} catch (e) {
		if (!isMissingTable(e)) {
			console.error(
				'Could not check email send limits, sending anyway: ',
				e,
			)
		} else if (!warnedMissingTable) {
			// Once per server instance, so the logs aren't flooded.
			warnedMissingTable = true
			console.error(
				'The pt_email_sends table is missing, so pre-trip emails are sent without limits. Run src/lib/sql/2026-11-16-email-sends.sql.',
			)
		}
		return { ok: true, id: null }
	}
	if (id !== null) return { ok: true, id }

	try {
		const recent = await recentEmailSendsDb(driverEmail)
		return {
			ok: false,
			retryInSeconds: secondsUntilAllowed(recent, send.recipients),
		}
	} catch (e) {
		console.error('Could not work out when the driver can email again: ', e)
		return { ok: false, retryInSeconds: null }
	}
}

/** Marks a reserved send as sent. Never throws: the email has gone. */
export async function confirmEmailSend(
	id: string | null,
	sesMessageId: string | null,
) {
	if (id === null) return
	try {
		await confirmEmailSendDb(id, sesMessageId)
	} catch (e) {
		// The row stays 'reserved', which still counts towards the limits.
		console.error('Could not mark the email as sent in the log: ', e)
	}
}

/** Frees a reserved send that failed. Never throws. */
export async function releaseEmailSend(id: string | null) {
	if (id === null) return
	try {
		await releaseEmailSendDb(id)
	} catch (e) {
		// The row stays 'reserved' and counts: erring towards the limit.
		console.error('Could not release a failed email in the log: ', e)
	}
}
