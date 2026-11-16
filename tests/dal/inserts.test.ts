import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	createTripDb: vi.fn(),
	getTripDefectsDb: vi.fn(),
	updateTripDb: vi.fn(),
	resolveSignature: vi.fn(),
	rateLimit: vi.fn(),
	recordOwner: vi.fn(),
	recordEvents: vi.fn(),
	getSpace: vi.fn(),
	getOrgName: vi.fn(),
}))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimit: mocks.rateLimit,
}))

// Stands in for Clerk's current user: `getUser` gives the user or null.
vi.mock('@/lib/auth', () => ({
	getDriver: async () => {
		const user = (await mocks.getUser()) as { email?: string } | null
		return user?.email
			? {
					userId: 'user_1',
					email: user.email,
					givenName: null,
					familyName: null,
				}
			: null
	},
	getSpace: mocks.getSpace,
	getOrgName: mocks.getOrgName,
}))
vi.mock('@/lib/db/owner-stamps', () => ({ recordOwner: mocks.recordOwner }))
// The real event builder, with the insert itself mocked.
vi.mock('@/lib/db/audit-events', async (original) => ({
	...(await original<typeof import('@/lib/db/audit-events')>()),
	recordEvents: mocks.recordEvents,
}))
vi.mock('@/lib/db/trips', async (original) => ({
	CORE_TRIP_FIELDS: (await original<typeof import('@/lib/db/trips')>())
		.CORE_TRIP_FIELDS,
	createTripDb: mocks.createTripDb,
	getTripDefectsDb: mocks.getTripDefectsDb,
	updateTripDb: mocks.updateTripDb,
}))

vi.mock('@/lib/signatures/signatures', () => ({
	resolveSignature: mocks.resolveSignature,
}))

import { addOnRouteDefectsDAL, addTripDAL } from '@/lib/DAL/inserts'

const PNG = { bytes: Buffer.from('png'), type: 'image/png' }
const SIGNED = { ...PNG, source: 'web' }

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	mocks.resolveSignature.mockResolvedValue({ ok: true, file: PNG })
	mocks.rateLimit.mockResolvedValue({ ok: true })
	mocks.getSpace.mockResolvedValue({ kind: 'personal', isAdmin: true })
	mocks.getOrgName.mockResolvedValue(null)
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('rate limits', () => {
	it("counts trip writes against the driver's limit", async () => {
		mocks.createTripDb.mockResolvedValue({ tripid: 1 })
		await addTripDAL(signedForm)
		expect(mocks.rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'trip-writes' }),
			'pat@x.com',
		)
	})

	it('refuses a new trip over the limit, without saving', async () => {
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 120 })
		const result = await addTripDAL(signedForm)
		expect(result._unsafeUnwrapErr().reason).toContain('Too many requests')
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it('refuses on-route defects over the limit, without saving', async () => {
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 120 })
		const result = await addOnRouteDefectsDAL({
			trip_id: 3,
			defects: 'Horn',
			remarks: '',
		})
		expect(result._unsafeUnwrapErr().reason).toContain('Too many requests')
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
	})
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
const signedForm = { ...form, signature: 'saved' }

describe('addTripDAL', () => {
	it("makes the organization the carrier in an organization's space", async () => {
		mocks.createTripDb.mockResolvedValue({ tripid: 1 })
		mocks.getSpace.mockResolvedValue({
			kind: 'org',
			orgId: 'org_1',
			isAdmin: false,
		})
		mocks.getOrgName.mockResolvedValue('Acme Freight')
		await addTripDAL({ ...signedForm, carrier: 'Something else' })
		expect(mocks.getOrgName).toHaveBeenCalledWith('org_1')
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			{ ...form, carrier: 'Acme Freight' },
			'pat@x.com',
			SIGNED,
		)
	})

	it("keeps the typed carrier when the organization's name can't be read", async () => {
		mocks.createTripDb.mockResolvedValue({ tripid: 1 })
		mocks.getSpace.mockResolvedValue({
			kind: 'org',
			orgId: 'org_1',
			isAdmin: false,
		})
		await addTripDAL(signedForm)
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			form,
			'pat@x.com',
			SIGNED,
		)
	})

	it('saves the trip for the signed-in driver', async () => {
		const trip = { tripid: 1 }
		mocks.createTripDb.mockResolvedValue(trip)

		const result = await addTripDAL(signedForm)

		expect(result._unsafeUnwrap()).toBe(trip)
		expect(mocks.resolveSignature).toHaveBeenCalledWith(
			'pat@x.com',
			'saved',
			undefined,
			'user_1',
		)
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			form,
			'pat@x.com',
			SIGNED,
		)
		// The new trip and its signature are stamped with the Clerk user.
		expect(mocks.recordOwner).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{ table: 'trip', tripId: 1 },
			{ table: 'trip_signature', tripId: 1 },
		)
		// The audit trail: the new trip, and its signing, from the web app.
		expect(mocks.recordEvents).toHaveBeenCalledTimes(1)
		expect(mocks.recordEvents).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{
				action: 'trip.created',
				source: 'web',
				tripId: 1,
				details: { signed: true, defects: [], remarks_length: 8 },
			},
			{
				action: 'trip.signed',
				source: 'web',
				tripId: 1,
				details: { signature: 'saved' },
			},
		)
	})

	it('records the defects found and a drawn signature', async () => {
		mocks.createTripDb.mockResolvedValue({ tripid: 2 })
		await addTripDAL({
			...form,
			defects: 'Tires, Lights',
			signature: 'data:image/png;base64,aGk=',
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				action: 'trip.created',
				details: {
					signed: true,
					defects: ['Tires', 'Lights'],
					remarks_length: 8,
				},
			}),
			expect.objectContaining({
				action: 'trip.signed',
				details: { signature: 'drawn' },
			}),
		)
	})

	it('saves only the validated fields', async () => {
		await addTripDAL({ ...signedForm, extra: 'x' } as typeof signedForm)
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			form,
			'pat@x.com',
			SIGNED,
		)
	})

	it('keeps a drawn signature as the saved one when asked', async () => {
		const drawn = 'data:image/png;base64,aGk='
		await addTripDAL({ ...form, signature: drawn, saveSignature: true })
		expect(mocks.resolveSignature).toHaveBeenCalledWith(
			'pat@x.com',
			drawn,
			true,
			'user_1',
		)
	})

	it("doesn't save a trip it can't sign", async () => {
		mocks.resolveSignature.mockResolvedValue({
			ok: false,
			message: 'No saved signature',
		})
		const result = await addTripDAL(signedForm)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'No saved signature',
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
		expect(mocks.recordOwner).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		const result = await addTripDAL(signedForm)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it('returns the validation errors for a bad form', async () => {
		const result = await addTripDAL({ ...signedForm, carrier: '' })
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
		const result = await addTripDAL(signedForm)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Could not save your trip. Please try again.',
		})
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})
})

describe('addOnRouteDefectsDAL', () => {
	const defects = { defects: 'Horn, , Wipers ', remarks: 'Loud', trip_id: 3 }

	it('adds the cleaned-up defects to the trip', async () => {
		const trip = { tripid: 3 }
		mocks.getTripDefectsDb.mockResolvedValue('Cab')
		mocks.updateTripDb.mockResolvedValue({ trip, before: {} })

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrap()).toBe(trip)
		expect(mocks.getTripDefectsDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(mocks.updateTripDb).toHaveBeenCalledWith(3, 'pat@x.com', {
			addDefects: 'Horn, Wipers',
			addRemarks: 'Loud',
		})
		expect(mocks.recordOwner).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{ table: 'trip', tripId: 3 },
		)
		// The defects' names, and the remark only by its length.
		expect(mocks.recordEvents).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{
				action: 'trip.defects_added',
				source: 'web',
				tripId: 3,
				details: {
					defects_added: ['Horn', 'Wipers'],
					remarks_added_length: 4,
				},
			},
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
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
		expect(mocks.recordOwner).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('matches whole defects, not substrings', async () => {
		mocks.getTripDefectsDb.mockResolvedValue('Air Horn')
		mocks.updateTripDb.mockResolvedValue({
			trip: { tripid: 3 },
			before: {},
		})

		const result = await addOnRouteDefectsDAL(defects)

		expect(result.isOk()).toBe(true)
	})

	it('saves the trimmed remark, and no defects when none are left', async () => {
		mocks.getTripDefectsDb.mockResolvedValue('Cab')
		mocks.updateTripDb.mockResolvedValue({
			trip: { tripid: 3 },
			before: {},
		})

		await addOnRouteDefectsDAL({
			defects: ' , , ',
			remarks: '  Loud  ',
			trip_id: 3,
		})

		expect(mocks.updateTripDb).toHaveBeenCalledWith(3, 'pat@x.com', {
			addDefects: undefined,
			addRemarks: 'Loud',
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(expect.anything(), {
			action: 'trip.remarks_added',
			source: 'web',
			tripId: 3,
			details: { remarks_added_length: 4 },
		})
	})

	it('refuses a remark longer than 2,000 characters before the database', async () => {
		const result = await addOnRouteDefectsDAL({
			...defects,
			remarks: 'x'.repeat(2001),
		})
		expect(result._unsafeUnwrapErr()).toMatchObject({
			reason: 'Validation failed',
			errors: {
				properties: {
					remarks: {
						errors: [
							'Remarks are too long (2,000 characters at most)',
						],
					},
				},
			},
		})
		expect(mocks.getTripDefectsDb).not.toHaveBeenCalled()
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
	})

	it.each([
		[
			'defects_too_long',
			"This trip's defect list is full (2,000 characters at most), so nothing was saved. Start a new trip to record more defects.",
		],
		[
			'remarks_too_long',
			"This trip's remarks are full (10,000 characters at most), so nothing was saved. Shorten your remark, or start a new trip to add more.",
		],
		[
			'signed_locked',
			"This trip is signed, so its details can't be changed.",
		],
	])('says why nothing was saved: %s', async (refusal, reason) => {
		mocks.getTripDefectsDb.mockResolvedValue('Cab')
		mocks.updateTripDb.mockResolvedValue(refusal)

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrapErr()).toEqual({ reason })
		expect(mocks.recordOwner).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('says when the trip is gone or too old', async () => {
		mocks.getTripDefectsDb.mockResolvedValue('')
		mocks.updateTripDb.mockResolvedValue(undefined)

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Could not update this trip. It may be older than 24 hours.',
		})
		expect(mocks.recordOwner).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('reports a database error', async () => {
		mocks.getTripDefectsDb.mockRejectedValue(new Error('down'))

		const result = await addOnRouteDefectsDAL(defects)

		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Could not update this trip. It may be older than 24 hours.',
		})
	})
})
