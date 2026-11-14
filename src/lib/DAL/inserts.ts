import { errAsync, okAsync } from 'neverthrow'
import z from 'zod'
import { getDriverEmail } from '@/lib/auth'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { TRIP_WRITES } from '@/lib/rate-limit/limits'
import {
	createTripDb,
	getTripDefectsDb,
	updateTripDefectsDb,
} from '../db/trips'
import { resolveSignature } from '../signatures/signatures'
import { schemaAddDefects, schemaAddTripForm } from '../ZOD/schemas'

export async function addTripDAL(data: z.infer<typeof schemaAddTripForm>) {
	const driverEmail = await getDriverEmail()

	if (!driverEmail) {
		return errAsync({ reason: 'Must be logged in' })
	}
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
		)
		if (!signed.ok) return errAsync({ reason: signed.message })
		const trip = await createTripDb(fields, driverEmail, {
			...signed.file,
			source: 'web',
		})
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
	const driverEmail = await getDriverEmail()

	if (!driverEmail) {
		return errAsync({ reason: 'Not authorized' } as const)
	}
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

	try {
		const currentDefects = await getTripDefectsDb(data.trip_id, driverEmail)

		const defectsArray = data.defects
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

		const trip = await updateTripDefectsDb(
			data.trip_id,
			driverEmail,
			cleanDefectsToAdd,
			data.remarks,
		)
		return okAsync(trip)
	} catch (e) {
		console.error('Error updating trip:', e)
		return errAsync({
			reason: 'Could not update this trip. It may be older than 24 hours.',
		} as const)
	}
}
