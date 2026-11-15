import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getSpace } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import {
	type Carrier,
	type CarrierFields,
	carrierChangedFields,
	createCarrierDb,
	createOrgCarrierDb,
	deleteCarrierDb,
	deleteOrgCarrierDb,
	listCarriersOrNone,
	listOrgCarriersOrNone,
	updateCarrierDb,
	updateOrgCarrierDb,
} from '@/lib/db/carriers'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { CARRIER_WRITES } from '@/lib/rate-limit/limits'
import { CARRIERS_MAX, formatLimit } from '@/lib/trip-limits'
import { schemaCarrier, schemaCarrierId } from '@/lib/ZOD/schemas'

/*
 * The saved carriers of the signed-in driver's active space, from the web
 * app: their own in their personal space, the organization's in an
 * organization's (docs/organizations.md). Anyone in the space reads them;
 * only the space's admin changes them (the driver themselves in their
 * personal space, an org:admin in an organization).
 */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const
export const NOT_ORG_ADMIN = {
	reason: 'Only an admin of your organization can change its carriers.',
} as const
const NOT_FOUND = { reason: 'That carrier was not found.' } as const
const FAILED = {
	reason: 'Could not save your carrier. Please try again.',
} as const
export const TOO_MANY_CARRIERS = `You can save up to ${formatLimit(CARRIERS_MAX)} carriers. Delete one you no longer haul for first.`

/** The space's carriers; none when signed out or when they can't be read. */
export async function fetchCarriersDAL(): Promise<Carrier[]> {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return []
	return space.kind === 'org'
		? listOrgCarriersOrNone(space.orgId)
		: listCarriersOrNone(driver.email)
}

/**
 * The driver and their space, once signed in, an admin of the space and
 * under their carrier write limit. `orgId` is null in the personal space.
 */
async function writer() {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return { error: NOT_SIGNED_IN }
	if (!space.isAdmin) return { error: NOT_ORG_ADMIN }
	const limited = await rateLimit(CARRIER_WRITES, driver.email)
	if (!limited.ok) {
		return { error: { reason: rateLimitMessage(limited.retryAfter) } }
	}
	return { driver, orgId: space.kind === 'org' ? space.orgId : null }
}

/** Audit details: the organization, when the change was in one. */
const inOrg = (orgId: string | null) => (orgId ? { org_id: orgId } : {})

/** The form's fields, checked; or why they can't be saved. */
function parseFields(data: unknown) {
	const parsed = schemaCarrier.safeParse(data)
	if (!parsed.success) {
		return {
			error: {
				reason:
					parsed.error.issues[0]?.message ??
					'Check the carrier details.',
			},
		}
	}
	return { fields: parsed.data as CarrierFields }
}

export async function addCarrierDAL(data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	try {
		const saved = await (w.orgId
			? createOrgCarrierDb(w.orgId, w.driver, fields)
			: createCarrierDb(w.driver, fields))
		if (saved === 'too_many') return errAsync({ reason: TOO_MANY_CARRIERS })
		await recordEvents(w.driver, {
			action: 'carrier.created',
			source: 'web',
			details: { carrier_id: saved.id, ...inOrg(w.orgId) },
		})
		return okAsync({
			carrier: saved,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error adding carrier:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function updateCarrierDAL(carrierId: number, data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaCarrierId.safeParse(carrierId).success) {
		return errAsync(NOT_FOUND)
	}
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	try {
		const updated = await (w.orgId
			? updateOrgCarrierDb(carrierId, w.orgId, fields)
			: updateCarrierDb(carrierId, w.driver.email, fields))
		if (!updated) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'carrier.updated',
			source: 'web',
			details: {
				carrier_id: carrierId,
				changed: carrierChangedFields(updated),
				...inOrg(w.orgId),
			},
		})
		return okAsync({
			carrier: updated.carrier,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error updating carrier:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function deleteCarrierDAL(carrierId: number) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaCarrierId.safeParse(carrierId).success) {
		return errAsync(NOT_FOUND)
	}
	try {
		const deleted = await (w.orgId
			? deleteOrgCarrierDb(carrierId, w.orgId)
			: deleteCarrierDb(carrierId, w.driver.email))
		if (!deleted) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'carrier.deleted',
			source: 'web',
			details: { carrier_id: carrierId, ...inOrg(w.orgId) },
		})
		return okAsync({
			carrier: deleted,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error deleting carrier:', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your carrier. Please try again.',
		})
	}
}
