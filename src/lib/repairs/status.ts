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

/** Who repaired it: the mechanic, the shop, or both. */
export function repairedBy(repair: {
	mechanic_name: string | null
	shop_name: string | null
}) {
	return (
		[repair.mechanic_name, repair.shop_name].filter(Boolean).join(', ') ||
		'Unknown'
	)
}

/** YYYY-MM-DD as "Jan 5, 2026", without shifting it to another day. */
export function formatRepairDate(value: string) {
	return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-CA', {
		dateStyle: 'medium',
		timeZone: 'UTC',
	})
}

/** One line on a repair for emails and PDFs: when, who and the invoice. */
export function repairLine(repair: Repair) {
	const invoice = repair.invoice_number
		? `, invoice ${repair.invoice_number}`
		: ''
	return `Repaired ${formatRepairDate(repair.repaired_on)} by ${repairedBy(repair)}${invoice}`
}
