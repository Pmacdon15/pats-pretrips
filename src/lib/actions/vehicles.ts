'use server'

import {
	revalidateDriverVehicles,
	revalidateOrgVehicles,
} from '@/lib/cache/revalidate'
import {
	addVehicleDAL,
	deleteVehicleDAL,
	fetchVehiclesDAL,
	updateVehicleDAL,
} from '../DAL/vehicles'
import type { Vehicle } from '../db/vehicles'

/* The driver's saved vehicles, from the web app. */

type VehicleAnswer = { value: Vehicle } | { errorMessage: string }

export async function getVehicles() {
	return fetchVehiclesDAL()
}

/** The saved vehicle, clearing the space's cached list; or why not. */
function answer(
	result: Awaited<ReturnType<typeof addVehicleDAL>>,
): VehicleAnswer {
	return result.match(
		({ vehicle, email, orgId }) => {
			if (orgId) revalidateOrgVehicles(orgId)
			else revalidateDriverVehicles(email)
			return { value: vehicle }
		},
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function addVehicle(data: unknown) {
	return answer(await addVehicleDAL(data))
}

export async function updateVehicle(vehicleId: number, data: unknown) {
	return answer(await updateVehicleDAL(vehicleId, data))
}

export async function deleteVehicle(vehicleId: number) {
	return answer(await deleteVehicleDAL(vehicleId))
}
