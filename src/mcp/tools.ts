import { z } from 'zod'
import { getSavedSignatureDb, signTripDb } from '@/lib/db/signatures'
import {
	createTripDb,
	getLatestTripDb,
	getLatestTripForPlateDb,
	getTripDb,
	listTripsDb,
	updateTripDb,
} from '@/lib/db/trips'
import { appUrl } from '@/lib/email/config'
import type { Trip } from '@/lib/types/types'
import { defects as DEFECT_CATEGORIES, parseDefects } from '@/lib/utils-defects'
import { tripDefectStatus } from './repair-tools'

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
		signed: Boolean(trip.signed_at),
		signed_at: trip.signed_at
			? new Date(trip.signed_at).toISOString()
			: null,
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
	const [latest, truck, signature] = await Promise.all([
		getLatestTripDb(caller.email),
		input.truck_plate
			? getLatestTripForPlateDb(caller.email, input.truck_plate)
			: undefined,
		getSavedSignatureDb(caller.email),
	])
	const savedSignature = Boolean(signature)
	const signatureNote = savedSignature
		? "The trip will be signed with the driver's saved signature."
		: `The driver has no saved signature, so the trip will be unsigned until they save one at ${signaturePage()} and sign it.`

	if (!latest) {
		return {
			summary: `This driver has no trips yet. Ask them for the carrier, carrier address and where they are inspecting. ${signatureNote}`,
			data: {
				last_trip: null,
				truck: null,
				saved_signature: savedSignature,
			},
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
		signatureNote,
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
			saved_signature: savedSignature,
		},
	}
}

/** Where the driver saves their signature in the web app. */
const signaturePage = () => `${appUrl()}/signature`

/** Who signed, for the stored signature: the AI app's name when it sent one. */
const signatureSource = (caller: McpCaller) =>
	(caller.client || 'ai').slice(0, 60)

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
	sign: z
		.boolean()
		.default(true)
		.describe(
			"Sign the trip with the driver's saved signature (the default). The driver confirming the trip is their sign-off; pass false only if they ask not to sign it.",
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
	args: z.input<typeof startTripInputSchema>,
): Promise<ToolResult> {
	const input = startTripInputSchema.parse(args)
	const warning = await odometerWarning(
		caller.email,
		input.truck_plate,
		input.odometer,
	)
	const defects = normalizeDefects(input.defects ?? [])
	const signature = input.sign
		? await getSavedSignatureDb(caller.email)
		: undefined
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
		signature
			? {
					bytes: signature.bytes,
					type: signature.type,
					source: signatureSource(caller),
				}
			: null,
	)
	const signed = signature
		? "Signed with the driver's saved signature."
		: input.sign
			? `Not signed: the driver has no saved signature. They can save one at ${signaturePage()}, then sign this trip in the app or ask you to (update_trip with sign: true).`
			: 'Not signed, as the driver asked.'
	return {
		summary: `Started trip ${trip.tripid}: ${input.make} ${input.model}${input.truck_plate ? ` (${input.truck_plate})` : ''} at ${input.odometer} km, ${defects.length ? `defects: ${defects.join(', ')}` : 'no defects'}. ${signed}${warning ? ` ${warning}` : ''}`,
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
	sign: z
		.boolean()
		.optional()
		.describe(
			"true signs an unsigned trip with the driver's saved signature, e.g. one started before they saved it. Only when the driver asks or agrees.",
		),
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
	const hasChanges = Object.values(changes).some((v) => v !== undefined)
	const sign = Boolean(input.sign) && !current.signed_at
	if (!hasChanges && !sign) {
		return {
			summary: input.sign
				? `Trip ${input.trip_id} is already signed. Nothing else to change.`
				: 'Nothing to change: pass at least one field.',
			data: { status: 'no_changes', trip: tripView(current) },
			isError: true,
		}
	}
	// Checked before anything changes, so a failed signing changes nothing.
	const signature = sign ? await getSavedSignatureDb(caller.email) : undefined
	if (sign && !signature) {
		return {
			summary: `The driver has no saved signature. They can save one at ${signaturePage()}; then sign the trip again.`,
			data: { status: 'no_saved_signature', trip: tripView(current) },
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
	let trip = hasChanges
		? await updateTripDb(input.trip_id, caller.email, changes)
		: current
	if (trip && signature) {
		trip = await signTripDb(
			input.trip_id,
			caller.email,
			signature,
			signatureSource(caller),
		)
	}
	if (!trip) {
		return {
			summary: `Trip ${input.trip_id} can no longer be changed (it just passed 24 hours).`,
			data: { status: 'too_old' },
			isError: true,
		}
	}
	return {
		summary: `${hasChanges ? `Updated trip ${input.trip_id}.` : ''}${signature ? `${hasChanges ? ' ' : ''}Signed trip ${input.trip_id} with the driver's saved signature.` : ''}${warning ? ` ${warning}` : ''}`,
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
	// Each trip with its defects open or repaired, so the card can show the
	// repairs. Trips without defects need no lookup.
	const views = await Promise.all(
		trips.map(async (trip) => ({
			...tripView(trip),
			defect_status: parseDefects(trip.defects).length
				? await tripDefectStatus(caller, trip)
				: [],
		})),
	)
	const label = input.when === 'current' ? 'in the last 24 hours' : 'older'
	return {
		summary: trips.length
			? `${trips.length} trip${trips.length === 1 ? '' : 's'} ${label}${hasMore ? `; more on page ${input.page + 1}` : ''}.`
			: `No trips ${label}${input.page > 1 ? ` on page ${input.page}` : ''}.`,
		data: {
			trips: views,
			has_more: hasMore,
			page: input.page,
			when: input.when,
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
	const defectStatus = await tripDefectStatus(caller, trip)
	const open = defectStatus.filter((d) => d.status === 'open').length
	return {
		summary: `Trip ${trip.tripid}: ${trip.make} ${trip.model} at ${trip.odometer} km on ${new Date(trip.date).toISOString().slice(0, 10)}.${defectStatus.length ? ` ${open} of ${defectStatus.length} defects open.` : ''}`,
		data: { trip: tripView(trip), defect_status: defectStatus },
	}
}
