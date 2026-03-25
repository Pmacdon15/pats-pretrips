'use server'

import { updateTag } from 'next/cache'
import type { z } from 'zod'
import type { AddressResponse } from '@/lib/types/types'
import { addOnRouteDefectsDAL, addTripDAL } from '../DAL/inserts'
import type { schemaAddDefects, schemaAddTripForm } from '../ZOD/schemas'

export async function addOnRouteDefects(
	data: z.infer<typeof schemaAddDefects>,
) {
	const result = await addOnRouteDefectsDAL(data)
	return result.match(
		(data) => {
			//TODO: add id to trip tag
			updateTag(`current-trips`)
			updateTag(`trip-${data.tripid}`)
			return { value: data }
		},

		(err) => {
			const message = err.reason || 'An unexpected error occurred'
			return { errorMessage: message }
		},
	)
}

export async function addTrip(data: z.infer<typeof schemaAddTripForm>) {
	const result = await addTripDAL(data)

	return result.match(
		(data) => {
			updateTag(`current-trips`)
			updateTag(`past-trips`)
			return { value: data }
		},

		(err) => {
			const message = err.reason || 'An unexpected error occurred'
			return { errorMessage: message }
		},
	)
}

export async function getAddress(
	lat: number,
	lng: number,
): Promise<{ data: AddressResponse | undefined }> {
	const apiKey = process.env.REVERSE_GEOCODING_API_KEY
	let data: AddressResponse | undefined
	try {
		const response = await fetch(
			`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`,
			{
				cache: 'no-cache',
			},
		)
		data = await response.json()
		console.log('Data:', data)
	} catch (error) {
		console.error(
			'Error fetching:',
			error instanceof Error ? error.message : error,
		)
	}
	return { data }
}
