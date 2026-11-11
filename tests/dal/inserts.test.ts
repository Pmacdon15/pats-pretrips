import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	createTripDb: vi.fn(),
	getTripDefectsDb: vi.fn(),
	updateTripDefectsDb: vi.fn(),
}))

vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	getKindeServerSession: () => ({ getUser: mocks.getUser }),
}))
vi.mock('@/lib/db/trips', () => ({
	createTripDb: mocks.createTripDb,
	getTripDefectsDb: mocks.getTripDefectsDb,
	updateTripDefectsDb: mocks.updateTripDefectsDb,
}))

import { addOnRouteDefectsDAL, addTripDAL } from '@/lib/DAL/inserts'

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

const form = {
	carrier: 'Acme',
	carrierAddress: '1 Main St',
	inspectionAddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	defects: '',
	remarks: 'All good',
}

describe('addTripDAL', () => {
	it('saves the trip for the signed-in driver', async () => {
		const trip = { tripid: 1 }
		mocks.createTripDb.mockResolvedValue(trip)

		const result = await addTripDAL(form)

		expect(result._unsafeUnwrap()).toBe(trip)
		expect(mocks.createTripDb).toHaveBeenCalledWith(form, 'pat@x.com')
	})

	it('saves only the validated fields', async () => {
		await addTripDAL({ ...form, extra: 'x' } as typeof form)
		expect(mocks.createTripDb).toHaveBeenCalledWith(form, 'pat@x.com')
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		const result = await addTripDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it('returns the validation errors for a bad form', async () => {
		const result = await addTripDAL({ ...form, carrier: '' })
		const err = result._unsafeUnwrapErr() as {
			reason: string
			errors: { properties: Record<string, { errors: string[] }> }
		}
		expect(err.reason).toBe('Validation failed')
		expect(err.errors.properties.carrier.errors).toEqual([
			'Carrier name is required',
		])
	})

	it('reports a database error', async () => {
		mocks.createTripDb.mockRejectedValue(new Error('down'))
		const result = await addTripDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Could not save your trip. Please try again.',
		})
	})
})

describe('addOnRouteDefectsDAL', () => {
	const defects = { defects: 'Horn, , Wipers ', remarks: 'Loud', trip_id: 3 }

	it('adds the cleaned-up defects to the trip', async () => {
		const trip = { tripid: 3 }
		mocks.getTripDefectsDb.mockResolvedValue('Cab')
		mocks.updateTripDefectsDb.mockResolvedValue(trip)

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrap()).toBe(trip)
		expect(mocks.getTripDefectsDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(mocks.updateTripDefectsDb).toHaveBeenCalledWith(
			3,
			'pat@x.com',
			'Horn, Wipers',
			'Loud',
		)
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue({})
		const result = await addOnRouteDefectsDAL(defects)
		expect(result._unsafeUnwrapErr()).toEqual({ reason: 'Not authorized' })
	})

	it('returns the validation errors for a bad request', async () => {
		const result = await addOnRouteDefectsDAL({ ...defects, trip_id: 0 })
		expect(result._unsafeUnwrapErr()).toMatchObject({
			reason: 'Validation failed',
		})
		expect(mocks.getTripDefectsDb).not.toHaveBeenCalled()
	})

	it('refuses a defect the trip already lists, ignoring case', async () => {
		mocks.getTripDefectsDb.mockResolvedValue('Cab, HORN')

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrapErr()).toEqual({
			reason: '"Horn" is already listed on this trip',
		})
		expect(mocks.updateTripDefectsDb).not.toHaveBeenCalled()
	})

	it('matches whole defects, not substrings', async () => {
		mocks.getTripDefectsDb.mockResolvedValue('Air Horn')
		mocks.updateTripDefectsDb.mockResolvedValue({ tripid: 3 })

		const result = await addOnRouteDefectsDAL(defects)

		expect(result.isOk()).toBe(true)
	})

	it('reports a database error', async () => {
		mocks.getTripDefectsDb.mockRejectedValue(new Error('down'))

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Could not update this trip. It may be older than 24 hours.',
		})
	})
})
