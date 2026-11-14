import { z } from 'zod'
import { getSavedSignatureDb, signTripDb } from '@/lib/db/signatures'
import {
	type CoreTripField,
	createTripDb,
	getLatestTripDb,
	getLatestTripForPlateDb,
	getTripDb,
	listTripsDb,
	type TripChanges,
	updateTripDb,
} from '@/lib/db/trips'
import { appUrl, tripUrl } from '@/lib/email/config'
import { aiSigningAllowed } from '@/lib/signatures/signatures'
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

/** Each core trip field by the name the assistant uses for it. */
const CORE_FIELD_NAMES: Record<CoreTripField, string> = {
	carrier: 'carrier',
	carrierAddress: 'carrier_address',
	inspectionAddress: 'inspection_address',
	make: 'make',
	model: 'model',
	odometer: 'odometer',
	truckPlate: 'truck_plate',
	trailerPlateA: 'trailer_plate_a',
	trailerPlateB: 'trailer_plate_b',
}

/**
 * The core fields (every one of CORE_TRIP_FIELDS in src/lib/db/trips.ts: the
 * Record type above makes sure none is missing).
 */
const CORE_FIELDS = Object.keys(CORE_FIELD_NAMES) as CoreTripField[]

/** The core details the driver signed; locked once the trip is signed. */
const LOCKED_FIELDS = CORE_FIELDS.map((f) => CORE_FIELD_NAMES[f])

/** A core field's stored value, to tell a real change from a resent value. */
const storedValue = (trip: Trip, field: CoreTripField) =>
	({
		carrier: trip.carrier,
		carrierAddress: trip.carrieraddress,
		inspectionAddress: trip.inspectionaddress,
		make: trip.make,
		model: trip.model,
		odometer: trip.odometer,
		truckPlate: trip.truckplate,
		trailerPlateA: trip.trailerplatea,
		trailerPlateB: trip.trailerplateb,
	})[field]

/** The trip as the assistant sees it: plain names, ISO date, defects as a list. */
export function tripView(trip: Trip) {
	const canUpdate =
		Date.now() - new Date(trip.date).getTime() < 24 * 60 * 60 * 1000
	const signed = Boolean(trip.signed_at)
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
		signed,
		signed_at: trip.signed_at
			? new Date(trip.signed_at).toISOString()
			: null,
		/** Trips can only be changed for 24 hours, like in the web app. */
		can_update: canUpdate,
		/**
		 * Whether the core details can still be changed: not once the trip is
		 * signed, when only defects and remarks can still be added.
		 */
		can_edit_details: canUpdate && !signed,
		/** The fields that can't change because the trip is signed. */
		locked_fields: signed ? LOCKED_FIELDS : [],
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
	const [latest, truck, signing] = await Promise.all([
		getLatestTripDb(caller.email),
		input.truck_plate
			? getLatestTripForPlateDb(caller.email, input.truck_plate)
			: undefined,
		signatureForAi(caller.email),
	])
	const savedSignature = signing.status !== 'no_saved_signature'
	const aiSigningAllowedNow = signing.status === 'allowed'
	const signatureNote = aiSigningAllowedNow
		? "The trip will be signed with the driver's saved signature (they allow AI apps to sign for them): confirming the trip with you is their sign-off."
		: savedSignature
			? `The driver hasn't turned on "${AI_SIGNING_SETTING}", so the trip will be saved unsigned. They can sign it in the app, or turn that on at ${signaturePage()} to let you sign.`
			: `The driver has no saved signature, so the trip will be saved unsigned. They can sign it in the app; to let you sign, they save a signature and turn on "${AI_SIGNING_SETTING}" at ${signaturePage()}.`

	if (!latest) {
		return {
			summary: `This driver has no trips yet. Ask them for the carrier, carrier address and where they are inspecting. ${signatureNote}`,
			data: {
				last_trip: null,
				truck: null,
				saved_signature: savedSignature,
				ai_signing_allowed: aiSigningAllowedNow,
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
			ai_signing_allowed: aiSigningAllowedNow,
		},
	}
}

/** Where the driver saves their signature in the web app. */
const signaturePage = () => `${appUrl()}/signature`

/** The Signature page's switch that lets AI apps sign, as the driver sees it. */
const AI_SIGNING_SETTING = 'Allow AI apps to sign for me'

type AiSigning =
	| { status: 'allowed'; file: { bytes: Buffer; type: string } }
	| { status: 'no_saved_signature' | 'ai_signing_off' }

/**
 * The signature an AI app may sign with: the driver's saved one, only when
 * they turned on "Allow AI apps to sign for me". This is what stops a
 * connector token alone from signing inspection reports.
 */
async function signatureForAi(email: string): Promise<AiSigning> {
	const [saved, allowed] = await Promise.all([
		getSavedSignatureDb(email),
		aiSigningAllowed(email),
	])
	if (!saved) return { status: 'no_saved_signature' }
	if (!allowed) return { status: 'ai_signing_off' }
	return { status: 'allowed', file: { bytes: saved.bytes, type: saved.type } }
}

/** What the driver can do when AI apps aren't allowed to sign for them. */
const aiSigningOffHelp = (tripId: number | undefined) =>
	`They can sign it themselves in the app at ${tripUrl(tripId)}, or turn on "${AI_SIGNING_SETTING}" on the Signature page (${signaturePage()}) and then ask you to sign it (update_trip with sign: true).`

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
			'Sign the trip with the driver\'s saved signature (the default). That only happens if they turned on "Allow AI apps to sign for me" in the app; otherwise the trip is saved unsigned and the answer says why. The driver confirming the trip is their sign-off; pass false only if they ask not to sign it.',
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
	const signing = input.sign ? await signatureForAi(caller.email) : undefined
	const signature = signing?.status === 'allowed' ? signing.file : undefined
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
	const status = signing ? signing.status : 'not_requested'
	const signed =
		status === 'allowed'
			? "Signed with the driver's saved signature."
			: status === 'ai_signing_off'
				? `Not signed: the driver hasn't allowed AI apps to sign for them. ${aiSigningOffHelp(trip.tripid)}`
				: status === 'no_saved_signature'
					? `Not signed: the driver has no saved signature. They can sign this trip in the app at ${tripUrl(trip.tripid)}, or save a signature and turn on "${AI_SIGNING_SETTING}" at ${signaturePage()}, then ask you to sign it (update_trip with sign: true).`
					: 'Not signed, as the driver asked.'
	return {
		summary: `Started trip ${trip.tripid}: ${input.make} ${input.model}${input.truck_plate ? ` (${input.truck_plate})` : ''} at ${input.odometer} km, ${defects.length ? `defects: ${defects.join(', ')}` : 'no defects'}. ${signed}${warning ? ` ${warning}` : ''}`,
		data: {
			trip: tripView(trip),
			signing: status === 'allowed' ? 'signed' : status,
			...(status === 'allowed' ? {} : { trip_url: tripUrl(trip.tripid) }),
			...(warning ? { warning } : {}),
		},
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
			'true signs an unsigned trip with the driver\'s saved signature, e.g. one started before they saved it. Only when the driver asks or agrees. Refused (status "ai_signing_off", nothing changed) unless the driver turned on "Allow AI apps to sign for me" in the app.',
		),
})

/**
 * The answer when a change would touch a signed trip's core details: nothing
 * changed. `attempted` names the fields asked for (null when the database
 * refused because the trip was signed meanwhile).
 */
function signedLocked(
	tripId: number,
	attempted: string[] | null,
	trip: Trip | null,
): ToolResult {
	const what = attempted?.length
		? `${attempted.join(', ')} can't be changed`
		: 'its details can no longer be changed'
	return {
		summary: `Trip ${tripId} is signed, so ${what} and nothing was saved. On a signed trip ${LOCKED_FIELDS.join(', ')} are locked; only defects (add_defects) and remarks (add_remarks) can still be added, within 24 hours of the trip. If the signed details are wrong, the driver should start a new trip with the right ones (start_trip).`,
		data: {
			status: 'signed_locked',
			locked_fields: LOCKED_FIELDS,
			...(attempted ? { attempted_fields: attempted } : {}),
			...(trip ? { trip: tripView(trip) } : {}),
		},
		isError: true,
	}
}

/**
 * Changes a trip from the last 24 hours. Fields left out stay as they are;
 * defects and remarks are only added to, never removed. Once the trip is
 * signed its core details are locked (the database enforces it too); only
 * defects and remarks can still be added.
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
	const changes: TripChanges = {
		carrier: input.carrier,
		carrierAddress: input.carrier_address,
		inspectionAddress: input.inspection_address,
		make: input.make,
		model: input.model,
		odometer: input.odometer,
		truckPlate: input.truck_plate,
		trailerPlateA: input.trailer_plate_a,
		trailerPlateB: input.trailer_plate_b,
		addDefects: added.length ? added.join(', ') : undefined,
		addRemarks: input.add_remarks,
	}
	if (current.signed_at) {
		// Signed: the details the driver signed are locked. A field resent
		// with its current value isn't a change, so it's simply left out.
		const changed = CORE_FIELDS.filter(
			(f) =>
				changes[f] !== undefined &&
				changes[f] !== storedValue(current, f),
		)
		if (changed.length) {
			return signedLocked(
				input.trip_id,
				changed.map((f) => CORE_FIELD_NAMES[f]),
				current,
			)
		}
		for (const f of CORE_FIELDS) changes[f] = undefined
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
	// Checked before anything changes, so a refused signing changes nothing.
	const signing = sign ? await signatureForAi(caller.email) : undefined
	if (signing?.status === 'no_saved_signature') {
		return {
			summary: `The driver has no saved signature, so trip ${input.trip_id} wasn't signed and nothing was changed. They can sign it in the app at ${tripUrl(input.trip_id)}, or save a signature and turn on "${AI_SIGNING_SETTING}" at ${signaturePage()}, then ask you again.`,
			data: {
				status: 'no_saved_signature',
				trip: tripView(current),
				trip_url: tripUrl(input.trip_id),
			},
			isError: true,
		}
	}
	if (signing?.status === 'ai_signing_off') {
		return {
			summary: `The driver hasn't allowed AI apps to sign for them, so trip ${input.trip_id} wasn't signed and nothing was changed. ${aiSigningOffHelp(input.trip_id)}`,
			data: {
				status: 'ai_signing_off',
				trip: tripView(current),
				trip_url: tripUrl(input.trip_id),
			},
			isError: true,
		}
	}
	const signature = signing?.status === 'allowed' ? signing.file : undefined

	const warning =
		changes.odometer === undefined
			? null
			: await odometerWarning(
					caller.email,
					input.truck_plate ?? current.truckplate,
					changes.odometer,
					current.tripid,
				)
	const updated = hasChanges
		? await updateTripDb(input.trip_id, caller.email, changes)
		: current
	// The database refused: the trip was signed after it was read.
	if (updated === 'signed_locked') {
		return signedLocked(input.trip_id, null, null)
	}
	let trip = updated
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
