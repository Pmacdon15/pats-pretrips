import { getDriverEmail } from '@/lib/auth'
import {
	listDriverRepairsDb,
	listTripRepairsDb,
	listTripsWithDefectsDb,
	type Repair,
} from '@/lib/db/repairs'
import { buildDefectRecord, type DefectRecord } from '@/lib/repairs/status'

/* The web app's repair reads, for the signed-in driver. */

export async function fetchTripRepairs(tripId: number): Promise<Repair[]> {
	const email = await getDriverEmail()
	if (!email || !Number.isInteger(tripId)) return []
	try {
		return await listTripRepairsDb(tripId, email)
	} catch (error) {
		console.error('Error fetching repairs:', error)
		return []
	}
}

export async function fetchDefectRecord(): Promise<DefectRecord> {
	const email = await getDriverEmail()
	if (!email) throw new Error('Email is required')
	const [trips, repairs] = await Promise.all([
		listTripsWithDefectsDb(email),
		listDriverRepairsDb(email),
	])
	return buildDefectRecord(trips, repairs)
}
