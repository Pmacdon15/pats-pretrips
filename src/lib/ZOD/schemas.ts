import { z } from 'zod'

/** A trip's own fields, as saved. */
export const schemaTripFields = z.object({
	carrier: z.string().min(1, 'Carrier name is required'),
	carrierAddress: z.string().min(1, 'Carrier address is required'),
	inspectionAddress: z.string().min(4, 'Inspection address is required'),
	make: z.string().min(1, 'Vehicle make is required'),
	model: z.string().min(1, 'Vehicle model is required'),
	odometer: z.number().positive('Odometer reading must be a positive number'),
	truckPlate: z.string().optional(),
	trailerPlateA: z.string().optional(),
	trailerPlateB: z.string().optional(),
	defects: z.string(),
	remarks: z.string().min(4, 'Remarks are required'),
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

export const schemaAddDefects = z.object({
	defects: z.string().min(3, 'Must Add Defect'),
	remarks: z.string().min(3, 'Must Add Remark'),
	trip_id: z.number().min(1, 'Must have trip id'),
})

export const schemaCoordinates = z.object({
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
})
