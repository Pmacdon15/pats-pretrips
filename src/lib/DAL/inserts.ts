import { errAsync, okAsync } from 'neverthrow'
import z from 'zod'
import { getDriver } from '@/lib/auth'
import { recordOwner } from '@/lib/db/owner-stamps'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { TRIP_WRITES } from '@/lib/rate-limit/limits'
import {
	createTripDb,
	getTripDefectsDb,
	type TripUpdateRefusal,
	updateTripDb,
} from '../db/trips'
import { resolveSignature } from '../signatures/signatures'
import {
	formatLimit as n,
	STORED_DEFECTS_MAX,
	STORED_REMARKS_MAX,
} from '../trip-limits'
import { schemaAddDefects, schemaAddTripForm } from '../ZOD/schemas'

export async function addTripDAL(data: z.infer<typeof schemaAddTripForm>) {
	const driver = await getDriver()

	if (!driver) {
		return errAsync({ reason: 'Must be logged in' })
	}
	const driverEmail = driver.email
	const limited = await rateLimit(TRIP_WRITES, driverEmail)
	if (!limited.ok) {
		return errAsync({ reason: rateLimitMessage(limited.retryAfter) })
	}

	const validatedFields = schemaAddTripForm.safeParse(data)

	if (!validatedFields.success) {
		// If your version of Zod supports it:
		const errorTree = z.treeifyError(validatedFields.error)

		return errAsync({
			reason: 'Validation failed',
			errors: errorTree,
		} as const)
	}
	try {
		const { signature, saveSignature, ...fields } = validatedFields.data
		const signed = await resolveSignature(
			driverEmail,
			signature,
			saveSignature,
			driver.userId,
		)
		if (!signed.ok) return errAsync({ reason: signed.message })
		const trip = await createTripDb(fields, driverEmail, {
			...signed.file,
			source: 'web',
		})
		const tripId = Number(trip.tripid)
		await recordOwner(
			driver,
			{ table: 'trip', tripId },
			{ table: 'trip_signature', tripId },
		)
		return okAsync(trip)
	} catch (e) {
		console.error('Db error adding trip: ', e)
		return errAsync({
			reason: 'Could not save your trip. Please try again.',
		})
	}
}

export async function addOnRouteDefectsDAL(
	data: z.infer<typeof schemaAddDefects>,
) {
	const driver = await getDriver()

	if (!driver) {
		return errAsync({ reason: 'Not authorized' } as const)
	}
	const driverEmail = driver.email
	const limited = await rateLimit(TRIP_WRITES, driverEmail)
	if (!limited.ok) {
		return errAsync({ reason: rateLimitMessage(limited.retryAfter) })
	}

	const validatedFields = schemaAddDefects.safeParse(data)
	if (!validatedFields.success) {
		return errAsync({
			reason: 'Validation failed',
			errors: z.treeifyError(validatedFields.error),
		} as const)
	}

	const { trip_id: tripId, defects, remarks } = validatedFields.data
	try {
		const currentDefects = await getTripDefectsDb(tripId, driverEmail)

		const defectsArray = defects
			.split(',')
			.map((d: string) => d.trim())
			.filter((d) => d !== '')

		const existing = currentDefects
			.split(',')
			.map((d: string) => d.trim().toLowerCase())
		const duplicate = defectsArray.find((d) =>
			existing.includes(d.toLowerCase()),
		)
		if (duplicate) {
			return errAsync({
				reason: `"${duplicate}" is already listed on this trip`,
			} as const)
		}

		const cleanDefectsToAdd = defectsArray.join(', ')

		// Appended to the trip's defects and remarks; refused, changing
		// nothing, if either would pass its limit (src/lib/trip-limits.ts).
		const trip = await updateTripDb(tripId, driverEmail, {
			addDefects: cleanDefectsToAdd || undefined,
			addRemarks: remarks,
		})
		if (trip === undefined) {
			return errAsync({ reason: TOO_OLD } as const)
		}
		if (typeof trip === 'string') {
			return errAsync({ reason: REFUSED[trip] } as const)
		}
		await recordOwner(driver, { table: 'trip', tripId })
		return okAsync(trip)
	} catch (e) {
		console.error('Error updating trip:', e)
		return errAsync({ reason: TOO_OLD } as const)
	}
}

const TOO_OLD = 'Could not update this trip. It may be older than 24 hours.'

/** Why an on-route update changed nothing, as the driver reads it. */
const REFUSED: Record<TripUpdateRefusal, string> = {
	defects_too_long: `This trip's defect list is full (${n(STORED_DEFECTS_MAX)} characters at most), so nothing was saved. Start a new trip to record more defects.`,
	remarks_too_long: `This trip's remarks are full (${n(STORED_REMARKS_MAX)} characters at most), so nothing was saved. Shorten your remark, or start a new trip to add more.`,
	// Not expected here: on-route updates change none of the signed details.
	signed_locked: "This trip is signed, so its details can't be changed.",
}
