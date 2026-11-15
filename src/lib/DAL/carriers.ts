import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getDriverEmail } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import {
	type Carrier,
	type CarrierFields,
	carrierChangedFields,
	createCarrierDb,
	deleteCarrierDb,
	listCarriersOrNone,
	updateCarrierDb,
} from '@/lib/db/carriers'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { CARRIER_WRITES } from '@/lib/rate-limit/limits'
import { CARRIERS_MAX, formatLimit } from '@/lib/trip-limits'
import { schemaCarrier, schemaCarrierId } from '@/lib/ZOD/schemas'

/* The signed-in driver's saved carriers, from the web app. */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const
const NOT_FOUND = { reason: 'That carrier was not found.' } as const
const FAILED = {
	reason: 'Could not save your carrier. Please try again.',
} as const
export const TOO_MANY_CARRIERS = `You can save up to ${formatLimit(CARRIERS_MAX)} carriers. Delete one you no longer haul for first.`

/** The driver's carriers; none when signed out or when they can't be read. */
export async function fetchCarriersDAL(): Promise<Carrier[]> {
	const email = await getDriverEmail()
	if (!email) return []
	return listCarriersOrNone(email)
}

/** The driver, once signed in and under their carrier write limit. */
async function writer() {
	const driver = await getDriver()
	if (!driver) return { error: NOT_SIGNED_IN }
	const limited = await rateLimit(CARRIER_WRITES, driver.email)
	if (!limited.ok) {
		return { error: { reason: rateLimitMessage(limited.retryAfter) } }
	}
	return { driver }
}

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
		const saved = await createCarrierDb(w.driver, fields)
		if (saved === 'too_many') return errAsync({ reason: TOO_MANY_CARRIERS })
		await recordEvents(w.driver, {
			action: 'carrier.created',
			source: 'web',
			details: { carrier_id: saved.id },
		})
		return okAsync({ carrier: saved, email: w.driver.email })
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
		const updated = await updateCarrierDb(carrierId, w.driver.email, fields)
		if (!updated) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'carrier.updated',
			source: 'web',
			details: {
				carrier_id: carrierId,
				changed: carrierChangedFields(updated),
			},
		})
		return okAsync({ carrier: updated.carrier, email: w.driver.email })
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
		const deleted = await deleteCarrierDb(carrierId, w.driver.email)
		if (!deleted) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'carrier.deleted',
			source: 'web',
			details: { carrier_id: carrierId },
		})
		return okAsync({ carrier: deleted, email: w.driver.email })
	} catch (e) {
		console.error('Db error deleting carrier:', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your carrier. Please try again.',
		})
	}
}
