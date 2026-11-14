import { describe, expect, it } from 'vitest'
import {
	DEFECTS_TEXT_MAX,
	formatLimit,
	REMARKS_MAX,
	STORED_DEFECTS_MAX,
	STORED_REMARKS_MAX,
} from '@/lib/trip-limits'
import { defects as DEFECT_CATEGORIES } from '@/lib/utils-defects'
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

describe('the limits', () => {
	it('writes limits with thousands separators', () => {
		expect(formatLimit(10_000)).toBe('10,000')
		expect(formatLimit(255)).toBe('255')
	})

	it('lets one full write fit in a new trip', () => {
		// 30 names of 60 characters, joined by ", ".
		expect(DEFECTS_TEXT_MAX).toBe(1858)
		expect(STORED_DEFECTS_MAX).toBeGreaterThanOrEqual(DEFECTS_TEXT_MAX)
		expect(
			STORED_DEFECTS_MAX - DEFECT_CATEGORIES.join(', ').length,
		).toBeGreaterThan(1000)
		// Full first remarks and three full additions, joined by ", ".
		expect(STORED_REMARKS_MAX).toBeGreaterThanOrEqual(
			REMARKS_MAX * 4 + 3 * 2,
		)
	})
})

describe('web trip schema limits', () => {
	const long = (max: number) => 'x'.repeat(max + 1)

	it.each([
		['carrier', 255, 'Carrier name is too long (255 characters at most)'],
		[
			'carrierAddress',
			255,
			'Carrier address is too long (255 characters at most)',
		],
		[
			'inspectionAddress',
			255,
			'Inspection address is too long (255 characters at most)',
		],
		['make', 100, 'Vehicle make is too long (100 characters at most)'],
		['model', 100, 'Vehicle model is too long (100 characters at most)'],
		['truckPlate', 20, 'Truck plate is too long (20 characters at most)'],
		[
			'trailerPlateA',
			20,
			'Trailer plate is too long (20 characters at most)',
		],
		[
			'trailerPlateB',
			20,
			'Trailer B plate is too long (20 characters at most)',
		],
		['remarks', 2000, 'Remarks are too long (2,000 characters at most)'],
	])('caps %s at %i characters, like the database and the AI connector', (field, max, message) => {
		expect(
			schemaAddTripForm.safeParse({ ...trip, [field]: 'x'.repeat(max) })
				.success,
		).toBe(true)
		const result = schemaAddTripForm.safeParse({
			...trip,
			[field]: long(max),
		})
		expect(result.error?.issues).toEqual([
			expect.objectContaining({ path: [field], message }),
		])
	})

	it('trims the text fields, so spaces alone are not a value', () => {
		const result = schemaAddTripForm.safeParse({
			...trip,
			carrier: '  Acme  ',
			truckPlate: ' ABC 123 ',
			remarks: '  All good  ',
		})
		expect(result.data).toMatchObject({
			carrier: 'Acme',
			truckPlate: 'ABC 123',
			remarks: 'All good',
		})
		expect(
			schemaAddTripForm.safeParse({ ...trip, carrier: '   ' }).error
				?.issues[0].message,
		).toBe('Carrier name is required')
		// Spaces around a value don't count toward the limit.
		expect(
			schemaAddTripForm.safeParse({
				...trip,
				truckPlate: `${'x'.repeat(20)}   `,
			}).success,
		).toBe(true)
	})

	it.each([
		[10_000_000, undefined],
		[10_000_001, 'Odometer reading is too high (10,000,000 km at most)'],
		[1000.5, 'Odometer reading must be whole kilometres'],
	])('takes whole kilometres up to 10,000,000 (%d)', (odometer, message) => {
		const result = schemaAddTripForm.safeParse({ ...trip, odometer })
		expect(result.success).toBe(!message)
		expect(result.error?.issues).toEqual(
			message
				? [expect.objectContaining({ path: ['odometer'], message })]
				: undefined,
		)
	})

	it('accepts every defect the picker can produce', () => {
		const all = DEFECT_CATEGORIES.join(', ')
		expect(
			schemaAddTripForm.safeParse({ ...trip, defects: all }).success,
		).toBe(true)
		expect(
			schemaAddDefects.safeParse({
				defects: all,
				remarks: 'Found',
				trip_id: 1,
			}).success,
		).toBe(true)
	})

	it('takes 30 defects of 60 characters, as the AI connector does', () => {
		const most = Array.from({ length: 30 }, (_, i) =>
			String(i).padEnd(60, 'x'),
		).join(', ')
		expect(most).toHaveLength(1858)
		expect(
			schemaAddTripForm.safeParse({ ...trip, defects: most }).success,
		).toBe(true)
	})

	it.each([
		[
			'31 defects',
			Array.from({ length: 31 }, (_, i) => `D${i}`).join(', '),
		],
		['a defect over 60 characters', 'x'.repeat(61)],
		['a list over 1,858 characters', ','.repeat(1859)],
	])('refuses %s', (_label, value) => {
		for (const schema of [schemaAddTripForm, schemaAddDefects]) {
			const result = schema.safeParse({
				...trip,
				trip_id: 1,
				defects: value,
			})
			expect(result.error?.issues).toEqual([
				expect.objectContaining({
					path: ['defects'],
					message:
						'Too many defects listed (30 at most, each up to 60 characters)',
				}),
			])
		}
	})

	it('caps an on-route remark at 2,000 characters, trimmed', () => {
		const base = { defects: 'Cab', trip_id: 4 }
		expect(
			schemaAddDefects.safeParse({ ...base, remarks: 'x'.repeat(2000) })
				.success,
		).toBe(true)
		expect(
			schemaAddDefects.safeParse({ ...base, remarks: long(2000) }).error
				?.issues,
		).toEqual([
			expect.objectContaining({
				path: ['remarks'],
				message: 'Remarks are too long (2,000 characters at most)',
			}),
		])
		expect(
			schemaAddDefects.safeParse({ ...base, remarks: '  ok  ' }).error
				?.issues[0].message,
		).toBe('Must Add Remark')
	})

	it.each([1.5, -1])('needs a whole, positive trip id (%d)', (trip_id) => {
		expect(
			schemaAddDefects.safeParse({
				defects: 'Cab',
				remarks: 'Cracked',
				trip_id,
			}).error?.issues,
		).toEqual([
			expect.objectContaining({
				path: ['trip_id'],
				message: 'Must have trip id',
			}),
		])
	})
})
