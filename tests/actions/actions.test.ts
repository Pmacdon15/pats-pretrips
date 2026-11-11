import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	updateTag: vi.fn(),
	addTripDAL: vi.fn(),
	addOnRouteDefectsDAL: vi.fn(),
}))

vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	getKindeServerSession: () => ({ getUser: mocks.getUser }),
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/DAL/inserts', () => ({
	addTripDAL: mocks.addTripDAL,
	addOnRouteDefectsDAL: mocks.addOnRouteDefectsDAL,
}))

import { addOnRouteDefects, addTrip, getAddress } from '@/lib/actions/actions'

const fetchMock = vi.fn()

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
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
}

describe('addOnRouteDefects', () => {
	it('returns the trip and refreshes its cache tags', async () => {
		mocks.addOnRouteDefectsDAL.mockResolvedValue(okAsync({ tripid: 3 }))

		await expect(addOnRouteDefects(defects)).resolves.toEqual({
			value: { tripid: 3 },
		})
		expect(mocks.updateTag).toHaveBeenCalledWith('current-trips')
		expect(mocks.updateTag).toHaveBeenCalledWith('trip-3')
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
	it('returns the trip and refreshes the trip lists', async () => {
		mocks.addTripDAL.mockResolvedValue(okAsync({ tripid: 1 }))

		await expect(addTrip(form)).resolves.toEqual({ value: { tripid: 1 } })
		expect(mocks.updateTag).toHaveBeenCalledWith('current-trips')
		expect(mocks.updateTag).toHaveBeenCalledWith('past-trips')
	})

	it('returns the error reason', async () => {
		mocks.addTripDAL.mockResolvedValue(errAsync({ reason: 'Db error' }))
		await expect(addTrip(form)).resolves.toEqual({
			errorMessage: 'Db error',
		})
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
