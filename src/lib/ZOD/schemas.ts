import { z } from 'zod'
import {
	ADDRESS_MAX,
	CARRIER_MAX,
	DEFECT_COUNT_MAX,
	DEFECT_NAME_MAX,
	DEFECTS_TEXT_MAX,
	MAKE_MODEL_MAX,
	formatLimit as n,
	ODOMETER_MAX,
	PLATE_MAX,
	REMARKS_MAX,
	VEHICLE_NAME_MAX,
} from '@/lib/trip-limits'
import { parseDefects } from '@/lib/utils-defects'

const plate = (name: string) =>
	z
		.string()
		.trim()
		.max(
			PLATE_MAX,
			`${name} is too long (${n(PLATE_MAX)} characters at most)`,
		)
		.optional()

const tooManyDefects = `Too many defects listed (${DEFECT_COUNT_MAX} at most, each up to ${DEFECT_NAME_MAX} characters)`

/**
 * Defects as the web form sends them: the picked categories, comma
 * separated. At most as many as the AI connector may add at once.
 */
const defectsText = (base: z.ZodString) =>
	base.max(DEFECTS_TEXT_MAX, tooManyDefects).refine((value) => {
		const list = parseDefects(value)
		return (
			list.length <= DEFECT_COUNT_MAX &&
			list.every((d) => d.length <= DEFECT_NAME_MAX)
		)
	}, tooManyDefects)

const remarksTooLong = `Remarks are too long (${n(REMARKS_MAX)} characters at most)`

/** A trip's own fields, as saved. */
export const schemaTripFields = z.object({
	carrier: z
		.string()
		.trim()
		.min(1, 'Carrier name is required')
		.max(
			CARRIER_MAX,
			`Carrier name is too long (${n(CARRIER_MAX)} characters at most)`,
		),
	carrierAddress: z
		.string()
		.trim()
		.min(1, 'Carrier address is required')
		.max(
			ADDRESS_MAX,
			`Carrier address is too long (${n(ADDRESS_MAX)} characters at most)`,
		),
	inspectionAddress: z
		.string()
		.trim()
		.min(4, 'Inspection address is required')
		.max(
			ADDRESS_MAX,
			`Inspection address is too long (${n(ADDRESS_MAX)} characters at most)`,
		),
	make: z
		.string()
		.trim()
		.min(1, 'Vehicle make is required')
		.max(
			MAKE_MODEL_MAX,
			`Vehicle make is too long (${n(MAKE_MODEL_MAX)} characters at most)`,
		),
	model: z
		.string()
		.trim()
		.min(1, 'Vehicle model is required')
		.max(
			MAKE_MODEL_MAX,
			`Vehicle model is too long (${n(MAKE_MODEL_MAX)} characters at most)`,
		),
	odometer: z
		.number()
		.int('Odometer reading must be whole kilometres')
		.positive('Odometer reading must be a positive number')
		.max(
			ODOMETER_MAX,
			`Odometer reading is too high (${n(ODOMETER_MAX)} km at most)`,
		),
	truckPlate: plate('Truck plate'),
	trailerPlateA: plate('Trailer plate'),
	trailerPlateB: plate('Trailer B plate'),
	defects: defectsText(z.string()),
	remarks: z
		.string()
		.trim()
		.min(4, 'Remarks are required')
		.max(REMARKS_MAX, remarksTooLong),
})

/**
 * The driver's signature on the web form: "saved" for their saved signature,
 * or the one they drew, as a PNG data URL.
 */
export const schemaSignature = z
	.string()
	.min(1, 'Sign the pre-trip')
	.max(1_500_000, 'The signature is too large. Clear it and sign again.')
	.refine(
		(v) => v === 'saved' || v.startsWith('data:image/'),
		'Sign the pre-trip',
	)

/** The new pre-trip form: the trip, signed by the driver. */
export const schemaAddTripForm = schemaTripFields.extend({
	signature: schemaSignature,
	/** Keep a drawn signature as the driver's saved one. */
	saveSignature: z.boolean().optional(),
})

export const schemaSignTrip = z.object({
	tripId: z.number().int().positive(),
	signature: schemaSignature,
	saveSignature: z.boolean().optional(),
})

/** "Allow AI apps to sign for me", on or off. */
export const schemaAllowAiSigning = z.boolean({
	error: 'Choose whether AI apps can sign for you.',
})

/** On-route defects and remarks, added to a trip from the last 24 hours. */
export const schemaAddDefects = z.object({
	defects: defectsText(z.string().min(3, 'Must Add Defect')),
	remarks: z
		.string()
		.trim()
		.min(3, 'Must Add Remark')
		.max(REMARKS_MAX, remarksTooLong),
	trip_id: z.number().int('Must have trip id').min(1, 'Must have trip id'),
})

export const schemaCoordinates = z.object({
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
})

/** A saved vehicle, from the Vehicles page. */
export const schemaVehicle = z.object({
	name: z
		.string()
		.trim()
		.max(
			VEHICLE_NAME_MAX,
			`Name is too long (${n(VEHICLE_NAME_MAX)} characters at most)`,
		)
		.optional(),
	make: schemaTripFields.shape.make,
	model: schemaTripFields.shape.model,
	truckPlate: plate('Truck plate'),
	trailerPlateA: plate('Trailer plate'),
	trailerPlateB: plate('Trailer B plate'),
})

/** A saved carrier, from the Carriers page. */
export const schemaCarrier = z.object({
	name: schemaTripFields.shape.carrier,
	address: schemaTripFields.shape.carrierAddress,
})

export const schemaCarrierId = z
	.number()
	.int('Choose a carrier')
	.positive('Choose a carrier')

export const schemaVehicleId = z
	.number()
	.int('Choose a vehicle')
	.positive('Choose a vehicle')
