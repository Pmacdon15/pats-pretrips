import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	updateTag: vi.fn(),
	addTripDAL: vi.fn(),
	addOnRouteDefectsDAL: vi.fn(),
	prepareAutoEmailDAL: vi.fn(),
	after: vi.fn(),
}))

// Stands in for Clerk's current user: `getUser` gives the user or null.
vi.mock('@/lib/auth', () => ({
	getDriverEmail: async () =>
		((await mocks.getUser()) as { email?: string } | null)?.email ?? null,
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('next/server', () => ({ after: mocks.after }))
vi.mock('@/lib/DAL/email', () => ({
	prepareAutoEmailDAL: mocks.prepareAutoEmailDAL,
}))
vi.mock('@/lib/DAL/inserts', () => ({
	addTripDAL: mocks.addTripDAL,
	addOnRouteDefectsDAL: mocks.addOnRouteDefectsDAL,
}))

import { addOnRouteDefects, addTrip, getAddress } from '@/lib/actions/actions'

const fetchMock = vi.fn()

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	mocks.prepareAutoEmailDAL.mockResolvedValue(null)
	vi.stubGlobal('fetch', fetchMock)
	vi.stubEnv('REVERSE_GEOCODING_API_KEY', 'key123')
	for (const level of ['log', 'warn', 'error'] as const) {
		vi.spyOn(console, level).mockImplementation(() => {})
	}
})

const defects = { defects: 'Horn', remarks: 'Loud', trip_id: 3 }
const form = {
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

describe('addOnRouteDefects', () => {
	it('returns the trip and refreshes its cache tags', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(
			okAsync({ tripid: 3, driveremail: 'pat@x.com' }),
		)

		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			value: { tripid: 3, driveremail: 'pat@x.com' },
		})
		expect(mocks.updateTag.mock.calls).toEqual([['trips:pat@x.com']])
	})

	it('returns the error reason', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(
			errAsync({ reason: 'Not authorized' }),
		)
		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			errorMessage: 'Not authorized',
		})
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})

	it('falls back to a generic message', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(errAsync({ reason: '' }))
		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			errorMessage: 'An unexpected error occurred',
		})
	})
})

describe('addTrip', () => {
	it("returns the trip and refreshes the driver's trips", async () => {
		const saved = { tripid: 1, driveremail: 'Pat@X.com' }
		mocks.addTripDAL.mockResolvedValue(okAsync(saved))

		await expect(addTrip(form)).resolves.toEqual({ value: saved })
		expect(mocks.updateTag.mock.calls).toEqual([['trips:pat@x.com']])
	})

	it('emails the new pre-trip after the response when auto-send is on', async () => {
		const send = vi.fn()
		mocks.prepareAutoEmailDAL.mockResolvedValue(send)
		mocks.addTripDAL.mockResolvedValue(
			okAsync({ tripid: 1, driveremail: 'pat@x.com' }),
		)

		await addTrip(form)
		expect(send).not.toHaveBeenCalled()
		mocks.after.mock.calls[0][0]()
		expect(send).toHaveBeenCalledWith({
			tripid: 1,
			driveremail: 'pat@x.com',
		})
	})

	it("doesn't email when auto-send is off or can't be checked", async () => {
		mocks.addTripDAL.mockResolvedValue(
			okAsync({ tripid: 1, driveremail: 'pat@x.com' }),
		)
		await addTrip(form)
		mocks.prepareAutoEmailDAL.mockRejectedValue(new Error('db down'))
		await expect(addTrip(form)).resolves.toEqual({
			value: { tripid: 1, driveremail: 'pat@x.com' },
		})
		expect(mocks.after).not.toHaveBeenCalled()
		expect(console.error).toHaveBeenCalled()
	})

	it('returns the error reason', async () => {
		mocks.addTripDAL.mockResolvedValue(errAsync({ reason: 'Db error' }))
		await expect(addTrip(form)).resolves.toEqual({
			errorMessage: 'Db error',
		})
		expect(mocks.prepareAutoEmailDAL).not.toHaveBeenCalled()
	})

	it('falls back to a generic message', async () => {
		mocks.addTripDAL.mockResolvedValue(errAsync({ reason: '' }))
		await expect(addTrip(form)).resolves.toEqual({
			errorMessage: 'An unexpected error occurred',
		})
	})
})

describe('getAddress', () => {
	const ok = (body: unknown) =>
		fetchMock.mockResolvedValue({ ok: true, json: async () => body })
	const place = { formatted_address: '1 Main St, Calgary' }

	it('reverse-geocodes the coordinates with Google Maps', async () => {
		const body = { status: 'OK', results: [place] }
		ok(body)

		await expect(getAddress(51, -114)).resolves.toEqual({ data: body })
		expect(fetchMock).toHaveBeenCalledWith(
			'https://maps.googleapis.com/maps/api/geocode/json?latlng=51,-114&key=key123',
			{ cache: 'no-cache' },
		)
	})

	it.each([
		[91, 0],
		[0, -181],
		[Number.NaN, 0],
		['51&foo=bar' as unknown as number, 0],
	])('does not look up invalid coordinates (%s, %s)', async (lat, lng) => {
		await expect(getAddress(lat, lng)).resolves.toEqual({ data: undefined })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('returns an OK response with no results as is', async () => {
		ok({ status: 'OK', results: [] })
		await expect(getAddress(1, 2)).resolves.toEqual({
			data: { status: 'OK', results: [] },
		})
		expect(console.warn).toHaveBeenCalled()
	})

	it('returns an OK response with no results field as is', async () => {
		ok({ status: 'OK' })
		await expect(getAddress(1, 2)).resolves.toEqual({
			data: { status: 'OK' },
		})
	})

	it.each([
		{ status: 'REQUEST_DENIED', error_message: 'Bad key', results: [] },
		{ status: 'ZERO_RESULTS', results: [] },
	])('returns a non-OK status ($status) without results', async (body) => {
		ok(body)
		await expect(getAddress(1, 2)).resolves.toEqual({ data: body })
		expect(console.error).toHaveBeenCalled()
	})

	it('returns no data when the request fails', async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 500,
			statusText: 'Server Error',
			text: async () => 'oops',
		})
		await expect(getAddress(1, 2)).resolves.toEqual({ data: undefined })
	})

	it.each([
		new Error('offline'),
		'offline',
	])('returns no data when fetch throws %s', async (error) => {
		fetchMock.mockRejectedValue(error)
		await expect(getAddress(1, 2)).resolves.toEqual({ data: undefined })
	})

	it('returns no data without an API key', async () => {
		vi.stubEnv('REVERSE_GEOCODING_API_KEY', '')
		await expect(getAddress(1, 2)).resolves.toEqual({ data: undefined })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		await expect(getAddress(1, 2)).rejects.toThrow('Must be logged in')
	})
})
