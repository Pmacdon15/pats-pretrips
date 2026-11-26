import { getDriverEmail, getSpace } from '@/lib/auth'
import {
	listDriverRepairsDb,
	listTripRepairsDb,
	listTripsWithDefectsDb,
	type Repair,
} from '@/lib/db/repairs'
import { errorForLog } from '@/lib/log'
import { buildDefectRecord, type DefectRecord } from '@/lib/repairs/status'

/* The web app's repair reads, for the signed-in driver. */

export async function fetchTripRepairs(tripId: number): Promise<Repair[]> {
	const email = await getDriverEmail()
	if (!email || !Number.isInteger(tripId)) return []
	try {
		return await listTripRepairsDb(tripId, email)
	} catch (error) {
		console.error('Error fetching repairs:', errorForLog(error))
		return []
	}
}

/**
 * The defect record in the active space: the defects on trips started there
 * and their repairs (docs/organizations.md).
 */
export async function fetchDefectRecord(): Promise<DefectRecord> {
	const email = await getDriverEmail()
	if (!email) throw new Error('Email is required')
	const space = await getSpace()
	const orgId = space?.kind === 'org' ? space.orgId : null
	const [trips, repairs] = await Promise.all([
		listTripsWithDefectsDb(email, orgId),
		listDriverRepairsDb(email, orgId),
	])
	return buildDefectRecord(trips, repairs)
}
