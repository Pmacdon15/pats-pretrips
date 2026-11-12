import { z } from 'zod'
import {
	createTripDb,
	getLatestTripDb,
	getLatestTripForPlateDb,
	getTripDb,
	listTripsDb,
	updateTripDb,
} from '@/lib/db/trips'
import type { Trip } from '@/lib/types/types'
import { defects as DEFECT_CATEGORIES, parseDefects } from '@/lib/utils-defects'

/*
 * What each MCP tool does, apart from MCP itself (src/mcp/server.ts). Every
 * function takes the verified caller first; the driver is never taken from
 * tool arguments.
 */

export type McpCaller = { email: string; client: string | null }

export type ToolResult = {
	/** One sentence for the assistant to read first. */
	summary: string
	data: Record<string, unknown>
	isError?: boolean
}

const text = (max: number) => z.string().trim().min(1).max(max)
const plate = z
	.string()
	.trim()
	.min(1)
	.max(20)
	.describe('As written on the plate, e.g. "ABC 1234"')
const odometer = z
	.number()
	.int()
	.positive()
	.max(10_000_000)
	.describe(
		'Whole kilometres as shown on the odometer, without the tenths digit',
	)

const defectList = z
	.array(text(60))
	.max(30)
	.describe(
		'Defect categories from list_defect_categories, e.g. ["Tires", "Lights"]. Empty or left out for no defects.',
	)

/** The trip as the assistant sees it: plain names, ISO date, defects as a list. */
export function tripView(trip: Trip) {
	return {
		trip_id: trip.tripid,
		date: new Date(trip.date).toISOString(),
		carrier: trip.carrier,
		carrier_address: trip.carrieraddress,
		inspection_address: trip.inspectionaddress,
		make: trip.make,
		model: trip.model,
		odometer: trip.odometer,
		truck_plate: trip.truckplate || null,
		trailer_plate_a: trip.trailerplatea || null,
		trailer_plate_b: trip.trailerplateb || null,
		defects: parseDefects(trip.defects),
		remarks: trip.remarks,
		/** Trips can only be changed for 24 hours, like in the web app. */
		can_update:
			Date.now() - new Date(trip.date).getTime() < 24 * 60 * 60 * 1000,
	}
}

/**
 * Defect names in the app's own spelling when they match a category
 * ("tires" becomes "Tires"), anything else as written, without repeats.
 */
export function normalizeDefects(list: string[]) {
	const out: string[] = []
	for (const raw of list) {
		const name = raw.trim()
		if (!name || name.toLowerCase() === 'none') continue
		const known = DEFECT_CATEGORIES.find(
			(d) => d.toLowerCase() === name.toLowerCase(),
		)
		const value = known ?? name
		if (!out.some((d) => d.toLowerCase() === value.toLowerCase())) {
			out.push(value)
		}
	}
	return out
}

export const listDefectCategoriesInputSchema = z.object({})

export function listDefectCategories(): ToolResult {
	return {
		summary: `${DEFECT_CATEGORIES.length} defect categories. Use these names for defects.`,
		data: { categories: DEFECT_CATEGORIES },
	}
}

export const getTripDefaultsInputSchema = z.object({
	truck_plate: plate
		.optional()
		.describe(
			'The truck plate read from a photo, to look up that truck’s make, model and last odometer',
		),
})

/**
 * What to suggest for a new trip: the carrier and addresses from the
 * driver's last trip, and, for a plate, that truck's make, model, trailers
 * and last odometer reading.
 */
export async function getTripDefaults(
	caller: McpCaller,
	args: z.infer<typeof getTripDefaultsInputSchema>,
): Promise<ToolResult> {
	const input = getTripDefaultsInputSchema.parse(args)
	const latest = await getLatestTripDb(caller.email)
	const truck = input.truck_plate
		? await getLatestTripForPlateDb(caller.email, input.truck_plate)
		: undefined

	if (!latest) {
		return {
			summary:
				'This driver has no trips yet. Ask them for the carrier, carrier address and where they are inspecting.',
			data: { last_trip: null, truck: null },
		}
	}

	const truckInfo = truck
		? {
				make: truck.make,
				model: truck.model,
				truck_plate: truck.truckplate || null,
				trailer_plate_a: truck.trailerplatea || null,
				trailer_plate_b: truck.trailerplateb || null,
				last_odometer: truck.odometer,
				last_inspected: new Date(truck.date).toISOString(),
			}
		: null

	const summary = [
		`Last trip: ${latest.carrier}, ${latest.make} ${latest.model}, inspected at ${latest.inspectionaddress}.`,
		input.truck_plate
			? truck
				? `Plate ${input.truck_plate} is the ${truck.make} ${truck.model}, last at ${truck.odometer} km.`
				: `No earlier trip in plate ${input.truck_plate}: ask the driver for its make and model.`
			: '',
		'Suggest these to the driver; confirm before starting the trip.',
	]
		.filter(Boolean)
		.join(' ')

	return {
		summary,
		data: {
			last_trip: {
				carrier: latest.carrier,
				carrier_address: latest.carrieraddress,
				inspection_address: latest.inspectionaddress,
				make: latest.make,
				model: latest.model,
				truck_plate: latest.truckplate || null,
				trailer_plate_a: latest.trailerplatea || null,
				trailer_plate_b: latest.trailerplateb || null,
				odometer: latest.odometer,
				date: new Date(latest.date).toISOString(),
			},
			truck: truckInfo,
		},
	}
}

export const startTripInputSchema = z.object({
	odometer,
	truck_plate: plate.optional(),
	trailer_plate_a: plate.optional(),
	trailer_plate_b: plate.optional(),
	make: text(100).describe('Vehicle make, e.g. "Freightliner"'),
	model: text(100).describe('Vehicle model, e.g. "Cascadia"'),
	carrier: text(255),
	carrier_address: text(255),
	inspection_address: z
		.string()
		.trim()
		.min(4)
		.max(255)
		.describe('Where the driver is doing the inspection'),
	defects: defectList.optional(),
	remarks: z
		.string()
		.trim()
		.min(4)
		.max(2000)
		.describe(
			'The driver’s remarks, e.g. "No defects found" or what is wrong',
		),
})

/** Odometer readings lower than the truck's last one are worth a second look. */
async function odometerWarning(
	email: string,
	truckPlate: string | undefined,
	reading: number,
	excludeTripId?: number,
) {
	if (!truckPlate) return null
	const last = await getLatestTripForPlateDb(email, truckPlate)
	if (!last || last.tripid === excludeTripId || reading >= last.odometer) {
		return null
	}
	return `The odometer (${reading} km) is lower than this truck's last reading (${last.odometer} km on ${new Date(last.date).toISOString().slice(0, 10)}). Check the photo with the driver.`
}

/** Starts a pre-trip inspection with what the driver confirmed. */
export async function startTrip(
	caller: McpCaller,
	args: z.infer<typeof startTripInputSchema>,
): Promise<ToolResult> {
	const input = startTripInputSchema.parse(args)
	const warning = await odometerWarning(
		caller.email,
		input.truck_plate,
		input.odometer,
	)
	const defects = normalizeDefects(input.defects ?? [])
	const trip = await createTripDb(
		{
			carrier: input.carrier,
			carrierAddress: input.carrier_address,
			inspectionAddress: input.inspection_address,
			make: input.make,
			model: input.model,
			odometer: input.odometer,
			truckPlate: input.truck_plate,
			trailerPlateA: input.trailer_plate_a,
			trailerPlateB: input.trailer_plate_b,
			defects: defects.join(', '),
			remarks: input.remarks,
		},
		caller.email,
	)
	return {
		summary: `Started trip ${trip.tripid}: ${input.make} ${input.model}${input.truck_plate ? ` (${input.truck_plate})` : ''} at ${input.odometer} km, ${defects.length ? `defects: ${defects.join(', ')}` : 'no defects'}.${warning ? ` ${warning}` : ''}`,
		data: { trip: tripView(trip), ...(warning ? { warning } : {}) },
	}
}

export const updateTripInputSchema = z.object({
	trip_id: z.number().int().positive(),
	odometer: odometer.optional(),
	truck_plate: plate.optional(),
	trailer_plate_a: plate.optional(),
	trailer_plate_b: plate.optional(),
	make: text(100).optional(),
	model: text(100).optional(),
	carrier: text(255).optional(),
	carrier_address: text(255).optional(),
	inspection_address: z.string().trim().min(4).max(255).optional(),
	add_defects: defectList
		.optional()
		.describe(
			'Defects found since, added to the trip’s list (e.g. on route)',
		),
	add_remarks: z
		.string()
		.trim()
		.min(3)
		.max(2000)
		.optional()
		.describe('Added after the trip’s remarks'),
})

/**
 * Changes a trip from the last 24 hours. Fields left out stay as they are;
 * defects and remarks are only added to, never removed.
 */
export async function updateTrip(
	caller: McpCaller,
	args: z.infer<typeof updateTripInputSchema>,
): Promise<ToolResult> {
	const input = updateTripInputSchema.parse(args)
	const current = await getTripDb(input.trip_id, caller.email)
	if (!current) {
		return {
			summary: `Trip ${input.trip_id} wasn't found. Use list_trips to find the trip's id.`,
			data: { status: 'not_found' },
			isError: true,
		}
	}
	if (!tripView(current).can_update) {
		return {
			summary: `Trip ${input.trip_id} is older than 24 hours and can't be changed. Start a new trip instead.`,
			data: { status: 'too_old', trip: tripView(current) },
			isError: true,
		}
	}

	const existing = parseDefects(current.defects)
	const added = normalizeDefects(input.add_defects ?? []).filter(
		(d) => !existing.some((e) => e.toLowerCase() === d.toLowerCase()),
	)
	const changes = {
		carrier: input.carrier,
		carrierAddress: input.carrier_address,
		inspectionAddress: input.inspection_address,
		make: input.make,
		model: input.model,
		odometer: input.odometer,
		truckPlate: input.truck_plate,
		trailerPlateA: input.trailer_plate_a,
		trailerPlateB: input.trailer_plate_b,
		defects: added.length ? [...existing, ...added].join(', ') : undefined,
		addRemarks: input.add_remarks,
	}
	if (Object.values(changes).every((value) => value === undefined)) {
		return {
			summary: 'Nothing to change: pass at least one field.',
			data: { status: 'no_changes', trip: tripView(current) },
			isError: true,
		}
	}

	const warning =
		input.odometer === undefined
			? null
			: await odometerWarning(
					caller.email,
					input.truck_plate ?? current.truckplate,
					input.odometer,
					current.tripid,
				)
	const trip = await updateTripDb(input.trip_id, caller.email, changes)
	if (!trip) {
		return {
			summary: `Trip ${input.trip_id} can no longer be changed (it just passed 24 hours).`,
			data: { status: 'too_old' },
			isError: true,
		}
	}
	return {
		summary: `Updated trip ${input.trip_id}.${warning ? ` ${warning}` : ''}`,
		data: { trip: tripView(trip), ...(warning ? { warning } : {}) },
	}
}

export const listTripsInputSchema = z.object({
	when: z
		.enum(['current', 'past'])
		.default('current')
		.describe(
			'"current": the last 24 hours (can still be updated). "past": older trips.',
		),
	page: z.number().int().min(1).max(1000).default(1),
})

const PAGE_SIZE = 10

export async function listTrips(
	caller: McpCaller,
	args: z.input<typeof listTripsInputSchema>,
): Promise<ToolResult> {
	const input = listTripsInputSchema.parse(args)
	const { trips, hasMore } = await listTripsDb(
		caller.email,
		input.when,
		input.page,
		PAGE_SIZE,
	)
	const label = input.when === 'current' ? 'in the last 24 hours' : 'older'
	return {
		summary: trips.length
			? `${trips.length} trip${trips.length === 1 ? '' : 's'} ${label}${hasMore ? `; more on page ${input.page + 1}` : ''}.`
			: `No trips ${label}${input.page > 1 ? ` on page ${input.page}` : ''}.`,
		data: {
			trips: trips.map(tripView),
			has_more: hasMore,
			page: input.page,
		},
	}
}

export const getTripInputSchema = z.object({
	trip_id: z.number().int().positive(),
})

export async function getTrip(
	caller: McpCaller,
	args: z.infer<typeof getTripInputSchema>,
): Promise<ToolResult> {
	const input = getTripInputSchema.parse(args)
	const trip = await getTripDb(input.trip_id, caller.email)
	if (!trip) {
		return {
			summary: `Trip ${input.trip_id} wasn't found.`,
			data: { status: 'not_found' },
			isError: true,
		}
	}
	return {
		summary: `Trip ${trip.tripid}: ${trip.make} ${trip.model} at ${trip.odometer} km on ${new Date(trip.date).toISOString().slice(0, 10)}.`,
		data: { trip: tripView(trip) },
	}
}
