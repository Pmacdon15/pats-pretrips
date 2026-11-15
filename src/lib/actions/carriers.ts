'use server'

import { revalidateDriverCarriers } from '@/lib/cache/revalidate'
import {
	addCarrierDAL,
	deleteCarrierDAL,
	fetchCarriersDAL,
	updateCarrierDAL,
} from '../DAL/carriers'
import type { Carrier } from '../db/carriers'

/* The driver's saved carriers, from the web app. */

type CarrierAnswer = { value: Carrier } | { errorMessage: string }

export async function getCarriers() {
	return fetchCarriersDAL()
}

/** The saved carrier, clearing the driver's cached list; or why not. */
function answer(
	result: Awaited<ReturnType<typeof addCarrierDAL>>,
): CarrierAnswer {
	return result.match(
		({ carrier, email }) => {
			revalidateDriverCarriers(email)
			return { value: carrier }
		},
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function addCarrier(data: unknown) {
	return answer(await addCarrierDAL(data))
}

export async function updateCarrier(carrierId: number, data: unknown) {
	return answer(await updateCarrierDAL(carrierId, data))
}

export async function deleteCarrier(carrierId: number) {
	return answer(await deleteCarrierDAL(carrierId))
}
