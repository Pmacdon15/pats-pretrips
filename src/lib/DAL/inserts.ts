import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { errAsync, okAsync } from 'neverthrow'
import z from 'zod'
import {
	createTripDb,
	getTripDefectsDb,
	updateTripDefectsDb,
} from '../db/trips'
import { schemaAddDefects, schemaAddTripForm } from '../ZOD/schemas'

export async function addTripDAL(data: z.infer<typeof schemaAddTripForm>) {
	const { getUser } = getKindeServerSession()
	const user = await getUser()

	const driverEmail = user?.email

	if (!driverEmail) {
		return errAsync({ reason: 'Must be logged in' })
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
		const trip = await createTripDb(data, driverEmail)
		return okAsync(trip)
	} catch (e) {
		console.error('Db error adding trip: ', e)
		return errAsync({ reason: 'Db error' })
	}
}

export async function addOnRouteDefectsDAL(
	data: z.infer<typeof schemaAddDefects>,
) {
	const { getUser } = getKindeServerSession()
	const user = await getUser()
	const driverEmail = user?.email

	if (!driverEmail) {
		return errAsync({ reason: 'Not authorized' } as const)
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

		for (const defect of defectsArray) {
			if (currentDefects.toLowerCase().includes(defect.toLowerCase())) {
				throw new Error(`Defect "${defect}" already listed`)
			}
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
		return errAsync({ reason: 'Failed update trip' } as const)
	}
}
