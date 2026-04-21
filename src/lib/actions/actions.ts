'use server'

import { updateTag } from 'next/cache'
import type { z } from 'zod'
import type { AddressResponse, GeocodingResponse } from '@/lib/types/types'
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
): Promise<{ data: GeocodingResponse | undefined }> {
	console.log(`getAddress called with lat: ${lat}, lng: ${lng}`)

	const apiKey = process.env.GOOGLE_MAPS_API_KEY
	if (!apiKey) {
		console.error(
			'GOOGLE_MAPS_API_KEY is not defined in environment variables',
		)
		return { data: undefined }
	}

	try {
		const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
		console.log(`Fetching from Google Maps API (key hidden)`)

		const response = await fetch(url, {
			cache: 'no-cache',
		})

		if (!response.ok) {
			const errorText = await response.text()
			console.error(
				`Google Maps API fetch error: ${response.status} ${response.statusText}`,
				errorText,
			)
			return { data: undefined }
		}

		const data: GeocodingResponse = await response.json()
		console.log(`Google Maps API Status: ${data.status}`)

		if (data.status !== 'OK') {
			console.error(
				`Google Maps API returned non-OK status: ${data.status}`,
				data.error_message || '',
			)
			return { data }
		}

		if (data.results && data.results.length > 0) {
			console.log(
				`Successfully found address: ${data.results[0].formatted_address}`,
			)
		} else {
			console.warn('Google Maps API returned OK but no results found.')
		}

		return { data }
	} catch (error) {
		console.error(
			'Exception in getAddress during Google Maps API call:',
			error instanceof Error ? error.message : error,
		)
		return { data: undefined }
	}
}
