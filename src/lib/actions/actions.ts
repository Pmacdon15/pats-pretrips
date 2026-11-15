'use server'

import { after } from 'next/server'
import type { z } from 'zod'
import { getDriverEmail } from '@/lib/auth'
import { revalidateDriverTrips } from '@/lib/cache/revalidate'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { GEOCODE } from '@/lib/rate-limit/limits'
import type { AddressLookup, GeocodingResponse } from '@/lib/types/types'
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

/** How long Google gets to answer before the driver types the address. */
const GEOCODE_TIMEOUT_MS = 5000

export async function getAddress(
	lat: number,
	lng: number,
): Promise<{ data: AddressLookup | undefined; errorMessage?: string }> {
	const driverEmail = await getDriverEmail()

	if (!driverEmail) {
		throw new Error('Must be logged in')
	}

	// Each lookup is a paid Google API call. Nothing is cached on the server:
	// Google's terms don't allow a shared cache of geocoded addresses (see
	// docs/geocoding.md), so every call that gets past here reaches Google.
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
	// The same ~10 m rounding the browser does, so a caller can't send more
	// precision than the form needs.
	lat = roundCoordinate(coords.data.lat)
	lng = roundCoordinate(coords.data.lng)

	// Nothing here logs the driver's position or the address it resolves to.
	const apiKey = process.env.REVERSE_GEOCODING_API_KEY
	if (!apiKey) {
		console.error('getAddress: REVERSE_GEOCODING_API_KEY is not set')
		return { data: undefined }
	}

	try {
		// The classic Geocoding API only reads the key from the `key` query
		// parameter (it ignores the X-Goog-Api-Key header), so the URL holds
		// the key: it is never logged, thrown or returned.
		const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ latlng: `${lat},${lng}`, key: apiKey })}`
		const response = await fetch(url, {
			cache: 'no-cache',
			signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
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
			return { data: forClient(data) }
		}

		if (!data.results?.length) {
			console.warn('getAddress: Google returned OK with no results')
		}

		return { data: forClient(data) }
	} catch (error) {
		if (error instanceof Error && error.name === 'TimeoutError') {
			console.error(
				`getAddress: Google did not answer within ${GEOCODE_TIMEOUT_MS} ms`,
			)
			return { data: undefined }
		}
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

/** Rounds to 4 decimals (about 10 m), as `useGetLocation` does. */
function roundCoordinate(value: number) {
	// `+ 0` turns -0 into 0.
	return Number(value.toFixed(4)) + 0
}

/**
 * Only what the form uses: Google's status and the best address. Google's
 * `error_message` and everything else in its answer stay on the server.
 */
function forClient(data: GeocodingResponse): AddressLookup {
	const status =
		typeof data.status === 'string' && /^[A-Z_]{1,40}$/.test(data.status)
			? data.status
			: 'UNKNOWN_ERROR'
	const address = data.results?.[0]?.formatted_address
	return {
		status,
		results:
			status === 'OK' && typeof address === 'string'
				? [{ formatted_address: address }]
				: [],
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
