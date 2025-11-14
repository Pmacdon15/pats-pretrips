import { z } from 'zod'

export const schemaAddTripForm = z.object({
	carrier: z.string().min(1, 'Carrier name is required'),
	carrierAddress: z.string().min(1, 'Carrier address is required'),
	inspectionAddress: z.string().min(4, 'Inspection address is required'),
	make: z.string().min(1, 'Vehicle make is required'),
	model: z.string().min(1, 'Vehicle model is required'),
	odometer: z.number().positive('Odometer reading must be a positive number'),
	truckPlate: z.string().nullable().optional(),
	trailerPlateA: z.string().nullable().optional(),
	trailerPlateB: z.string().nullable().optional(),
	defects: z.string().nullable().optional(),
	remarks: z.string().min(4, 'Remarks are required'),
})

export const schemaAddDefects = z.object({
	defects: z.string(),
	remarks: z.string(),
})
