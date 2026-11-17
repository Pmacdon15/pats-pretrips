import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getSpace } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createOrgTrailerDb,
	createTrailerDb,
	deleteOrgTrailerDb,
	deleteTrailerDb,
	listOrgTrailersOrNone,
	listTrailersOrNone,
	type Trailer,
	type TrailerFields,
	trailerChangedFields,
	updateOrgTrailerDb,
	updateTrailerDb,
} from '@/lib/db/trailers'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { TRAILER_WRITES } from '@/lib/rate-limit/limits'
import { formatLimit, TRAILERS_MAX } from '@/lib/trip-limits'
import { schemaTrailer, schemaTrailerId } from '@/lib/ZOD/schemas'

/*
 * The saved trailers of the signed-in driver's active space, from the web
 * app: their own in their personal space, the organization's in an
 * organization's (docs/organizations.md). Anyone in the space reads them;
 * only the space's admin changes them (the driver themselves in their
 * personal space, an org:admin in an organization).
 */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const
export const NOT_ORG_ADMIN = {
	reason: 'Only an admin of your organization can change its trailers.',
} as const
const NOT_FOUND = { reason: 'That trailer was not found.' } as const
const FAILED = {
	reason: 'Could not save your trailer. Please try again.',
} as const
export const TOO_MANY_TRAILERS = `You can save up to ${formatLimit(TRAILERS_MAX)} trailers. Delete one you no longer pull first.`

/** The space's trailers; none when signed out or when they can't be read. */
export async function fetchTrailersDAL(): Promise<Trailer[]> {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return []
	return space.kind === 'org'
		? listOrgTrailersOrNone(space.orgId)
		: listTrailersOrNone(driver.email)
}

/**
 * The driver and their space, once signed in, an admin of the space and
 * under their trailer write limit. `orgId` is null in the personal space.
 */
async function writer() {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return { error: NOT_SIGNED_IN }
	if (!space.isAdmin) return { error: NOT_ORG_ADMIN }
	const limited = await rateLimit(TRAILER_WRITES, driver.email)
	if (!limited.ok) {
		return { error: { reason: rateLimitMessage(limited.retryAfter) } }
	}
	return { driver, orgId: space.kind === 'org' ? space.orgId : null }
}

/** Audit details: the organization, when the change was in one. */
const inOrg = (orgId: string | null) => (orgId ? { org_id: orgId } : {})

/** The form's fields, checked; or why they can't be saved. */
function parseFields(data: unknown) {
	const parsed = schemaTrailer.safeParse(data)
	if (!parsed.success) {
		return {
			error: {
				reason:
					parsed.error.issues[0]?.message ??
					'Check the trailer details.',
			},
		}
	}
	return { fields: parsed.data as TrailerFields }
}

export async function addTrailerDAL(data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	try {
		const saved = await (w.orgId
			? createOrgTrailerDb(w.orgId, w.driver, fields)
			: createTrailerDb(w.driver, fields))
		if (saved === 'too_many') return errAsync({ reason: TOO_MANY_TRAILERS })
		await recordEvents(w.driver, {
			action: 'trailer.created',
			source: 'web',
			details: { trailer_id: saved.id, ...inOrg(w.orgId) },
		})
		return okAsync({
			trailer: saved,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error adding trailer:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function updateTrailerDAL(trailerId: number, data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaTrailerId.safeParse(trailerId).success) {
		return errAsync(NOT_FOUND)
	}
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	try {
		const updated = await (w.orgId
			? updateOrgTrailerDb(trailerId, w.orgId, fields)
			: updateTrailerDb(trailerId, w.driver.email, fields))
		if (!updated) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'trailer.updated',
			source: 'web',
			details: {
				trailer_id: trailerId,
				changed: trailerChangedFields(updated),
				...inOrg(w.orgId),
			},
		})
		return okAsync({
			trailer: updated.trailer,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error updating trailer:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function deleteTrailerDAL(trailerId: number) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaTrailerId.safeParse(trailerId).success) {
		return errAsync(NOT_FOUND)
	}
	try {
		const deleted = await (w.orgId
			? deleteOrgTrailerDb(trailerId, w.orgId)
			: deleteTrailerDb(trailerId, w.driver.email))
		if (!deleted) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'trailer.deleted',
			source: 'web',
			details: { trailer_id: trailerId, ...inOrg(w.orgId) },
		})
		return okAsync({
			trailer: deleted,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error deleting trailer:', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your trailer. Please try again.',
		})
	}
}
