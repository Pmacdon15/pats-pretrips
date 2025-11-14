import { z } from 'zod'

// export const schemaAddTrip = z.object({
// 	carrier: z.string({
// 		invalid_type_error: 'Carrier name is required',
// 		required_error: 'Carrier name is required',
// 	}),
// 	carrieraddress: z.string({
// 		invalid_type_error: 'Carrier address is required',
// 		required_error: 'Carrier address is required',
// 	}),
// 	inspectionaddress: z.string({
// 		invalid_type_error: 'Inspection address is required',
// 		required_error: 'Inspection address is required',
// 	}),
// 	make: z.string({
// 		invalid_type_error: 'Vehicle make is required',
// 		required_error: 'Vehicle make is required',
// 	}),
// 	model: z.string({
// 		invalid_type_error: 'Vehicle model is required',
// 		required_error: 'Vehicle model is required',
// 	}),
// 	odometer: z.number({
// 		invalid_type_error: 'Odometer reading must be positive',
// 		required_error: 'Odometer reading is required',
// 	}),
// 	truckplate: z.string().nullable().optional(),
// 	trailerplatea: z.string().nullable().optional(),
// 	trailerplateb: z.string().nullable().optional(),
// 	defects: z.string({
// 		invalid_type_error: 'Defects',
// 	}),
// 	remarks: z.string({
// 		invalid_type_error: 'Remarks',
// 	}),
// })

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
