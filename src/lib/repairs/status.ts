import type { DefectTrip, Repair, RepairWithTrip } from '@/lib/db/repairs'
import { parseDefects } from '@/lib/utils-defects'

/*
 * Which defects are open and which are repaired. No database or server code
 * here, so the web app's client components can use it too.
 */

export type DefectStatus = { defect: string; repair: Repair | null }

/** Each of a trip's defects, with its repair when it has one. */
export function defectStatuses(
	defects: string | null | undefined,
	repairs: Repair[],
): DefectStatus[] {
	return parseDefects(defects).map((defect) => ({
		defect,
		repair:
			repairs.find(
				(r) => r.defect.toLowerCase() === defect.toLowerCase(),
			) ?? null,
	}))
}

export type OpenDefect = {
	trip_id: number
	trip_date: string
	truck_plate: string | null
	make: string
	model: string
	defect: string
}

export type DefectRecord = {
	open: OpenDefect[]
	repaired: RepairWithTrip[]
}

/** Every defect the driver reported: still open, or repaired. */
export function buildDefectRecord(
	trips: DefectTrip[],
	repairs: RepairWithTrip[],
): DefectRecord {
	const fixed = new Set(
		repairs.map((r) => `${r.trip_id}:${r.defect.toLowerCase()}`),
	)
	const open: OpenDefect[] = []
	for (const trip of trips) {
		for (const defect of parseDefects(trip.defects)) {
			if (fixed.has(`${trip.tripid}:${defect.toLowerCase()}`)) continue
			open.push({
				trip_id: trip.tripid,
				trip_date: trip.date,
				truck_plate: trip.truckplate,
				make: trip.make,
				model: trip.model,
				defect,
			})
		}
	}
	return { open, repaired: repairs }
}
