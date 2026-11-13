import { describe, expect, it } from 'vitest'
import { schemaAddDefects, schemaAddTripForm } from '@/lib/ZOD/schemas'

const trip = {
	carrier: 'Acme',
	carrierAddress: '1 Main St',
	inspectionAddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	defects: '',
	remarks: 'All good',
	signature: 'saved',
}

describe('schemaAddTripForm', () => {
	it.each([
		['the saved signature', 'saved'],
		['a drawn one', 'data:image/png;base64,aGk='],
	])('accepts %s', (_label, signature) => {
		expect(
			schemaAddTripForm.safeParse({ ...trip, signature }).success,
		).toBe(true)
	})

	it.each([
		['', 'Sign the pre-trip'],
		['hello', 'Sign the pre-trip'],
		[
			`data:image/png;base64,${'a'.repeat(1_500_000)}`,
			'The signature is too large. Clear it and sign again.',
		],
	])('rejects a missing or bad signature', (signature, message) => {
		const result = schemaAddTripForm.safeParse({ ...trip, signature })
		expect(result.error?.issues[0]).toMatchObject({
			path: ['signature'],
			message,
		})
	})

	it('accepts a complete trip with the plates left out', () => {
		expect(schemaAddTripForm.safeParse(trip).success).toBe(true)
	})

	it('rejects null plates', () => {
		expect(
			schemaAddTripForm.safeParse({ ...trip, truckPlate: null }).success,
		).toBe(false)
	})

	it('requires defects, even if empty', () => {
		const { defects: _, ...noDefects } = trip
		expect(schemaAddTripForm.safeParse(noDefects).success).toBe(false)
	})

	it.each([
		['carrier', '', 'Carrier name is required'],
		['carrierAddress', '', 'Carrier address is required'],
		['inspectionAddress', 'abc', 'Inspection address is required'],
		['make', '', 'Vehicle make is required'],
		['model', '', 'Vehicle model is required'],
		['odometer', 0, 'Odometer reading must be a positive number'],
		['remarks', 'ok', 'Remarks are required'],
	])('rejects a bad %s', (field, value, message) => {
		const result = schemaAddTripForm.safeParse({ ...trip, [field]: value })
		expect(result.success).toBe(false)
		expect(result.error?.issues[0]).toMatchObject({
			path: [field],
			message,
		})
	})
})

describe('schemaAddDefects', () => {
	const defects = { defects: 'Cab', remarks: 'Cracked', trip_id: 4 }

	it('accepts a defect, remark and trip id', () => {
		expect(schemaAddDefects.safeParse(defects).success).toBe(true)
	})

	it.each([
		['defects', 'ab', 'Must Add Defect'],
		['remarks', 'ab', 'Must Add Remark'],
		['trip_id', 0, 'Must have trip id'],
	])('rejects a bad %s', (field, value, message) => {
		const result = schemaAddDefects.safeParse({
			...defects,
			[field]: value,
		})
		expect(result.error?.issues[0]).toMatchObject({
			path: [field],
			message,
		})
	})
})
