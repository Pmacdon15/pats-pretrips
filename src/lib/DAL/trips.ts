import { getDriverEmail } from '@/lib/auth'
import { getTripDb, listTripsDb } from '@/lib/db/trips'
import type { Trip } from '@/lib/types/types'

/*
 * The web app's trip reads. This layer checks who's signed in; the cached
 * queries live in src/lib/db/trips.ts and take the driver's email, so each
 * driver gets their own cache entries. A failed query isn't cached, so an
 * empty fallback here never sticks around.
 */

async function requireDriverEmail() {
	const email = await getDriverEmail()
	if (!email) throw new Error('Email is required')
	return email
}

export async function fetchCurrentTrips(page: number = 1, limit: number = 7) {
	const email = await requireDriverEmail()
	try {
		return await listTripsDb(email, 'current', page, limit)
	} catch (error) {
		console.error('Error fetching trips:', error)
		throw error
	}
}

export async function fetchPastTrips(page: number = 1, limit: number = 7) {
	const email = await requireDriverEmail()
	try {
		return await listTripsDb(email, 'past', page, limit)
	} catch (error) {
		console.error('error:', error)
		return { trips: [] as Trip[], hasMore: false }
	}
}

export async function fetchTrip(tripId: number) {
	const email = await requireDriverEmail()
	try {
		return await getTripDb(tripId, email)
	} catch (error: unknown) {
		console.log('Error', error)
	}
}
