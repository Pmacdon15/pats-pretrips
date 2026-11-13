'use server'

import { revalidateDriverTrips } from '@/lib/cache/revalidate'
import {
	deleteSignatureDAL,
	getSignatureStatusDAL,
	saveSignatureDAL,
	signTripDAL,
} from '../DAL/signatures'

/* The driver's signature, from the web app. */

export async function getSignatureStatus() {
	return getSignatureStatusDAL()
}

export async function saveSignature(dataUrl: string) {
	const result = await saveSignatureDAL(dataUrl)
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function deleteSignature() {
	const result = await deleteSignatureDAL()
	return result.match(
		(value) => ({ value }),
		(err) => ({ errorMessage: err.reason }),
	)
}

export async function signTrip(data: {
	tripId: number
	signature: string
	saveSignature?: boolean
}) {
	const result = await signTripDAL(data)
	return result.match(
		(trip) => {
			revalidateDriverTrips(trip.driveremail)
			return { value: trip }
		},
		(err) => ({ errorMessage: err.reason }),
	)
}
