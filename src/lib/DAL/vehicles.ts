import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getSpace } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createOrgVehicleDb,
	createVehicleDb,
	deleteOrgVehicleDb,
	deleteVehicleDb,
	listOrgVehiclesOrNone,
	listVehiclesOrNone,
	updateOrgVehicleDb,
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

/*
 * The saved vehicles of the signed-in driver's active space, from the web
 * app: their own in their personal space, the organization's fleet in an
 * organization's (docs/organizations.md). Anyone in the space reads them;
 * only the space's admin changes them (the driver themselves in their
 * personal space, an org:admin in an organization).
 */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const
export const NOT_ORG_ADMIN = {
	reason: 'Only an admin of your organization can change its vehicles.',
} as const
const NOT_FOUND = { reason: 'That vehicle was not found.' } as const
const FAILED = {
	reason: 'Could not save your vehicle. Please try again.',
} as const
export const TOO_MANY_VEHICLES = `You can save up to ${formatLimit(VEHICLES_MAX)} vehicles. Delete one you no longer drive first.`

/** The space's vehicles; none when signed out or when they can't be read. */
export async function fetchVehiclesDAL(): Promise<Vehicle[]> {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return []
	return space.kind === 'org'
		? listOrgVehiclesOrNone(space.orgId)
		: listVehiclesOrNone(driver.email)
}

/**
 * The driver and their space, once signed in, an admin of the space and
 * under their vehicle write limit. `orgId` is null in the personal space.
 */
async function writer() {
	const [driver, space] = await Promise.all([getDriver(), getSpace()])
	if (!driver || !space) return { error: NOT_SIGNED_IN }
	if (!space.isAdmin) return { error: NOT_ORG_ADMIN }
	const limited = await rateLimit(VEHICLE_WRITES, driver.email)
	if (!limited.ok) {
		return { error: { reason: rateLimitMessage(limited.retryAfter) } }
	}
	return { driver, orgId: space.kind === 'org' ? space.orgId : null }
}

/** Audit details: the organization, when the change was in one. */
const inOrg = (orgId: string | null) => (orgId ? { org_id: orgId } : {})

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
		const saved = await (w.orgId
			? createOrgVehicleDb(w.orgId, w.driver, fields)
			: createVehicleDb(w.driver, fields))
		if (saved === 'too_many') return errAsync({ reason: TOO_MANY_VEHICLES })
		await recordEvents(w.driver, {
			action: 'vehicle.created',
			source: 'web',
			details: { vehicle_id: saved.id, ...inOrg(w.orgId) },
		})
		return okAsync({
			vehicle: saved,
			email: w.driver.email,
			orgId: w.orgId,
		})
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
	// The form sends every field: an empty name or plate clears it. Trailer
	// plates are saved as trailers now (src/lib/db/trailers.ts), so the form
	// no longer sends them; any a vehicle still has are changed only when given.
	const changes = {
		name: fields.name ?? '',
		make: fields.make,
		model: fields.model,
		truckPlate: fields.truckPlate ?? '',
		trailerPlateA: fields.trailerPlateA,
		trailerPlateB: fields.trailerPlateB,
	}
	try {
		const updated = await (w.orgId
			? updateOrgVehicleDb(vehicleId, w.orgId, changes)
			: updateVehicleDb(vehicleId, w.driver.email, changes))
		if (!updated) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'vehicle.updated',
			source: 'web',
			details: {
				vehicle_id: vehicleId,
				changed: vehicleChangedFields(updated),
				...inOrg(w.orgId),
			},
		})
		return okAsync({
			vehicle: updated.vehicle,
			email: w.driver.email,
			orgId: w.orgId,
		})
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
		const deleted = await (w.orgId
			? deleteOrgVehicleDb(vehicleId, w.orgId)
			: deleteVehicleDb(vehicleId, w.driver.email))
		if (!deleted) return errAsync(NOT_FOUND)
		await recordEvents(w.driver, {
			action: 'vehicle.deleted',
			source: 'web',
			details: { vehicle_id: vehicleId, ...inOrg(w.orgId) },
		})
		return okAsync({
			vehicle: deleted,
			email: w.driver.email,
			orgId: w.orgId,
		})
	} catch (e) {
		console.error('Db error deleting vehicle:', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your vehicle. Please try again.',
		})
	}
}
