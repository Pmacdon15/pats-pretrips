import { neon } from '@neondatabase/serverless'
import { errorForLog } from '@/lib/log'
import type { Trip } from '@/lib/types/types'
import {
	afterResponse,
	isMissingColumnOrTable,
	type Owner,
} from './owner-stamps'
import { CORE_TRIP_FIELDS, type CoreTripField, type TripBefore } from './trips'

/*
 * The audit trail (pt_audit_events, see docs/audit-trail.md and
 * src/lib/sql/2026-11-19-audit-events.sql): one row per change a driver, or
 * an AI app acting for them, makes. The app only ever INSERTs here.
 *
 * Best-effort, like the owner stamps (src/lib/db/owner-stamps.ts): an event
 * is written by a separate small INSERT after the change itself succeeded,
 * after the response where Next.js allows it, and never throws. So auditing
 * can't fail or slow down what the driver does, including before the
 * migration is run (the table is missing: logged once per server instance).
 * The price: an event is lost if the function dies between the change and
 * the insert. This is a record of what happened, not a tamper-proof ledger.
 *
 * Details say what changed without copying personal content or files: field
 * names, old and new values of the trip's own (non free text) fields, defect
 * names, lengths of free text, counts of recipients. Never signature or
 * invoice bytes, email addresses, tokens or coordinates.
 */

export const AUDIT_MIGRATION = 'src/lib/sql/2026-11-19-audit-events.sql'

/** What happened. Mirrored in the migration's comments. */
export const AUDIT_ACTIONS = [
	'trip.created',
	'trip.updated',
	'trip.defects_added',
	'trip.remarks_added',
	'trip.signed',
	'repair.recorded',
	'repair.deleted',
	'signature.saved',
	'signature.deleted',
	'signature.ai_signing_changed',
	'email.settings_saved',
	'email.sent',
	'vehicle.created',
	'vehicle.updated',
	'vehicle.deleted',
	'carrier.created',
	'carrier.updated',
	'carrier.deleted',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** Free-form details of an event, as JSON. */
export type AuditDetails = Record<string, unknown>

export type AuditEvent = {
	action: AuditAction
	/**
	 * Who made the change: 'web', or the AI app, spelled as the table the
	 * change is in already records it (a trip signature's or a repair's
	 * `source`), so the two can be matched.
	 */
	source: string
	tripId?: number | null
	repairId?: number | null
	details?: AuditDetails | null
}

/** Longest string kept in details; longer ones are cut. */
export const DETAIL_TEXT_MAX = 300
/** Most entries kept in a list in details. */
export const DETAIL_LIST_MAX = 50
/** Largest details kept, as JSON characters; beyond that only a note. */
export const DETAILS_MAX = 8000

/** Details made safe to store: bounded strings, lists and depth. */
function clip(value: unknown, depth = 0): unknown {
	if (typeof value === 'string') return value.slice(0, DETAIL_TEXT_MAX)
	if (value === null || typeof value !== 'object') return value
	if (depth >= 3) return '[nested]'
	if (Array.isArray(value)) {
		return value.slice(0, DETAIL_LIST_MAX).map((v) => clip(v, depth + 1))
	}
	return Object.fromEntries(
		Object.entries(value)
			.slice(0, DETAIL_LIST_MAX)
			.map(([k, v]) => [k, clip(v, depth + 1)]),
	)
}

/** The details as stored: clipped JSON, or a note when still too large. */
export function detailsJson(details: AuditDetails | null | undefined) {
	if (!details) return null
	const json = JSON.stringify(clip(details))
	return json.length <= DETAILS_MAX
		? json
		: JSON.stringify({ truncated: true, size: json.length })
}

let warnedMissing = false

async function insertEvent(owner: Owner, event: AuditEvent) {
	try {
		const sql = neon(`${process.env.DATABASE_URL}`)
		await sql`
            INSERT INTO pt_audit_events
                (driver_email, clerk_user_id, action, source, trip_id, repair_id, details)
            VALUES (
                ${owner.email}, ${owner.userId || null}, ${event.action},
                ${event.source.slice(0, 60)}, ${event.tripId ?? null}::int,
                ${event.repairId ?? null}::int, ${detailsJson(event.details)}::jsonb
            )
        `
	} catch (error) {
		if (!isMissingColumnOrTable(error)) {
			console.error(
				`Audit: could not record ${event.action}:`,
				errorForLog(error),
			)
		} else if (!warnedMissing) {
			// Once per server instance, so the logs aren't flooded.
			warnedMissing = true
			console.error(
				`Audit: the pt_audit_events table is missing, so changes are not being recorded in the audit trail. Run ${AUDIT_MIGRATION}.`,
			)
		}
	}
}

/**
 * Records events for changes that just succeeded, without ever failing or
 * slowing them: after the response in a server action or route handler,
 * otherwise awaited. Call only once the change is saved. Null events (no
 * real change) are skipped.
 */
export async function recordEvents(
	owner: Owner,
	...events: (AuditEvent | null | undefined)[]
): Promise<void> {
	const list = events.filter((event): event is AuditEvent => Boolean(event))
	if (list.length === 0) return
	await afterResponse(async () => {
		await Promise.all(list.map((event) => insertEvent(owner, event)))
	})
}

/** For tests: forget that the missing table was already logged. */
export function resetAuditWarnings() {
	warnedMissing = false
}

/**
 * The event for a trip update that was saved: which core fields changed,
 * from what to what (`before` is the row as the UPDATE found it, `trip` as
 * it left it), and the defects and remarks added (remarks by length only:
 * the text is on the trip). Null when nothing actually changed.
 */
export function tripUpdateEvent(
	before: TripBefore,
	trip: Trip,
	added: { defects?: string[]; remarks?: string | null },
	source: string,
): AuditEvent | null {
	const changed = CORE_TRIP_FIELDS.filter((field) => {
		const key = field.toLowerCase() as Lowercase<CoreTripField>
		return (before[key] ?? null) !== (trip[key] ?? null)
	})
	const pick = (row: TripBefore) =>
		Object.fromEntries(
			changed.map((f) => [
				f,
				row[f.toLowerCase() as Lowercase<CoreTripField>] ?? null,
			]),
		)
	const defects = added.defects?.length ? added.defects : null
	const remarks = added.remarks ? added.remarks.length : null
	const action: AuditAction | null = changed.length
		? 'trip.updated'
		: defects
			? 'trip.defects_added'
			: remarks
				? 'trip.remarks_added'
				: null
	if (!action) return null
	return {
		action,
		source,
		tripId: trip.tripid ?? null,
		details: {
			...(changed.length
				? { changed, from: pick(before), to: pick(trip) }
				: {}),
			...(defects ? { defects_added: defects } : {}),
			...(remarks ? { remarks_added_length: remarks } : {}),
		},
	}
}
