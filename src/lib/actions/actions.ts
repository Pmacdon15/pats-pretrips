'use server'

import { after } from 'next/server'
import type { z } from 'zod'
import { getDriverEmail } from '@/lib/auth'
import { revalidateDriverTrips } from '@/lib/cache/revalidate'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { GEOCODE } from '@/lib/rate-limit/limits'
import type { GeocodingResponse } from '@/lib/types/types'
import { prepareAutoEmailDAL } from '../DAL/email'
import { addOnRouteDefectsDAL, addTripDAL } from '../DAL/inserts'
import {
	type schemaAddDefects,
	type schemaAddTripForm,
	schemaCoordinates,
} from '../ZOD/schemas'

export async function addOnRouteDefects(
	data: z.infer<typeof schemaAddDefects>,
) {
	const result = await addOnRouteDefectsDAL(data)
	return result.match(
		(data) => {
			revalidateDriverTrips(data.driveremail)
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

	if (result.isOk()) {
		// A completed pre-trip goes to the driver's recipients when they've
		// turned that on. It's sent after the response, so saving stays fast.
		const trip = result.value
		const send = await prepareAutoEmailDAL().catch((e) => {
			console.error('Could not check auto-email: ', errorForLog(e))
			return null
		})
		if (send) after(() => send(trip))
	}

	return result.match(
		(data) => {
			revalidateDriverTrips(data.driveremail)
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
): Promise<{ data: GeocodingResponse | undefined; errorMessage?: string }> {
	const driverEmail = await getDriverEmail()

	if (!driverEmail) {
		throw new Error('Must be logged in')
	}

	// Each lookup is a paid Google API call.
	const limited = await rateLimit(GEOCODE, driverEmail)
	if (!limited.ok) {
		console.warn('getAddress: rate limited')
		return {
			data: undefined,
			errorMessage: rateLimitMessage(limited.retryAfter),
		}
	}

	// Server actions can be called with anything, so check the coordinates
	// before they go into the Google Maps URL.
	const coords = schemaCoordinates.safeParse({ lat, lng })
	if (!coords.success) {
		console.error('getAddress called with invalid coordinates')
		return { data: undefined }
	}
	lat = coords.data.lat
	lng = coords.data.lng

	// Nothing here logs the driver's position or the address it resolves to.
	const apiKey = process.env.REVERSE_GEOCODING_API_KEY
	if (!apiKey) {
		console.error('getAddress: REVERSE_GEOCODING_API_KEY is not set')
		return { data: undefined }
	}

	try {
		const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
		const response = await fetch(url, {
			cache: 'no-cache',
		})

		if (!response.ok) {
			// Only the status: an error page can repeat the request URL.
			console.error(`getAddress: Google answered HTTP ${response.status}`)
			return { data: undefined }
		}

		const data: GeocodingResponse = await response.json()

		if (data.status !== 'OK') {
			console.error(
				`getAddress: Google returned ${data.status}`,
				withoutRequest(data.error_message ?? '', apiKey),
			)
			return { data }
		}

		if (!data.results?.length) {
			console.warn('getAddress: Google returned OK with no results')
		}

		return { data }
	} catch (error) {
		console.error(
			'getAddress: the Google request failed:',
			withoutRequest(
				error instanceof Error ? error.message : String(error),
				apiKey,
			),
		)
		return { data: undefined }
	}
}

/**
 * Google's text for the logs, without what the request URL held: the API
 * key and the driver's position (a JSON parse error quotes the body).
 */
function withoutRequest(text: string, apiKey: string) {
	return text
		.split(apiKey)
		.join('[key]')
		.replace(/latlng=[^&\s"'<]*/gi, 'latlng=[position]')
		.replace(
			/-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?|-?\d+\.\d{3,}/g,
			'[position]',
		)
		.slice(0, 300)
}
