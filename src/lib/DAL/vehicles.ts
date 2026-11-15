import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getDriverEmail } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createVehicleDb,
	deleteVehicleDb,
	listVehiclesOrNone,
	updateVehicleDb,
	type Vehicle,
	type VehicleFields,
	vehicleChangedFields,
} from '@/lib/db/vehicles'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { VEHICLE_WRITES } from '@/lib/rate-limit/limits'
import { formatLimit, VEHICLES_MAX } from '@/lib/trip-limits'
import { schemaVehicle, schemaVehicleId } from '@/lib/ZOD/schemas'

/* The signed-in driver's saved vehicles, from the web app. */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const
const NOT_FOUND = { reason: 'That vehicle was not found.' } as const
const FAILED = {
	reason: 'Could not save your vehicle. Please try again.',
} as const
export const TOO_MANY_VEHICLES = `You can save up to ${formatLimit(VEHICLES_MAX)} vehicles. Delete one you no longer drive first.`

/** The driver's vehicles; none when signed out or when they can't be read. */
export async function fetchVehiclesDAL(): Promise<Vehicle[]> {
	const email = await getDriverEmail()
	if (!email) return []
	return listVehiclesOrNone(email)
}

/** The driver, once signed in and under their vehicle write limit. */
async function writer() {
	const driver = await getDriver()
	if (!driver) return { error: NOT_SIGNED_IN }
	const limited = await rateLimit(VEHICLE_WRITES, driver.email)
	if (!limited.ok) {
		return { error: { reason: rateLimitMessage(limited.retryAfter) } }
	}
	return { driver }
}

/** The form's fields, checked; or why they can't be saved. */
function parseFields(data: unknown) {
	const parsed = schemaVehicle.safeParse(data)
	if (!parsed.success) {
		return {
			error: {
				reason:
					parsed.error.issues[0]?.message ??
					'Check the vehicle details.',
			},
		}
	}
	return { fields: parsed.data as VehicleFields }
}

export async function addVehicleDAL(data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	try {
		const saved = await createVehicleDb(w.driver, fields)
		if (saved === 'too_many') return errAsync({ reason: TOO_MANY_VEHICLES })
		await recordEvents(w.driver, {
			action: 'vehicle.created',
			source: 'web',
			details: { vehicle_id: saved.id },
		})
		return okAsync({ vehicle: saved, email: w.driver.email })
	} catch (e) {
		console.error('Db error adding vehicle:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function updateVehicleDAL(vehicleId: number, data: unknown) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaVehicleId.safeParse(vehicleId).success) {
		return errAsync(NOT_FOUND)
	}
	const { fields, error } = parseFields(data)
	if (error) return errAsync(error)
	// The form sends every field: an empty name or plate clears it.
	const changes = {
		name: fields.name ?? '',
		make: fields.make,
		model: fields.model,
		truckPlate: fields.truckPlate ?? '',
		trailerPlateA: fields.trailerPlateA ?? '',
		trailerPlateB: fields.trailerPlateB ?? '',
	}
	try {
		const updated = await updateVehicleDb(
			vehicleId,
			w.driver.email,
			changes,
		)
		if (!updated) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'vehicle.updated',
			source: 'web',
			details: {
				vehicle_id: vehicleId,
				changed: vehicleChangedFields(updated),
			},
		})
		return okAsync({ vehicle: updated.vehicle, email: w.driver.email })
	} catch (e) {
		console.error('Db error updating vehicle:', errorForLog(e))
		return errAsync(FAILED)
	}
}

export async function deleteVehicleDAL(vehicleId: number) {
	const w = await writer()
	if (w.error) return errAsync(w.error)
	if (!schemaVehicleId.safeParse(vehicleId).success) {
		return errAsync(NOT_FOUND)
	}
	try {
		const deleted = await deleteVehicleDb(vehicleId, w.driver.email)
		if (!deleted) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'vehicle.deleted',
			source: 'web',
			details: { vehicle_id: vehicleId },
		})
		return okAsync({ vehicle: deleted, email: w.driver.email })
	} catch (e) {
		console.error('Db error deleting vehicle:', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your vehicle. Please try again.',
		})
	}
}
