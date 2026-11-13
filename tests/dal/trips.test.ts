import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	listTripsDb: vi.fn(),
	getTripDb: vi.fn(),
	getUser: vi.fn(),
}))

vi.mock('@/lib/db/trips', () => ({
	listTripsDb: mocks.listTripsDb,
	getTripDb: mocks.getTripDb,
}))
// Stands in for Clerk's current user: `getUser` gives the user or null.
vi.mock('@/lib/auth', () => ({
	getDriverEmail: async () =>
		((await mocks.getUser()) as { email?: string } | null)?.email ?? null,
}))

import { fetchCurrentTrips, fetchPastTrips, fetchTrip } from '@/lib/DAL/trips'

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'log').mockImplementation(() => {})
})

const trip = { tripid: 1, carrier: 'Acme' }
const page = { trips: [trip], hasMore: true }

describe.each([
	['fetchCurrentTrips', fetchCurrentTrips, 'current'],
	['fetchPastTrips', fetchPastTrips, 'past'],
] as const)('%s', (_name, fetch, when) => {
	it("reads a page of the signed-in driver's trips", async () => {
		mocks.listTripsDb.mockResolvedValue(page)
		await expect(fetch(2, 5)).resolves.toBe(page)
		expect(mocks.listTripsDb).toHaveBeenCalledWith('pat@x.com', when, 2, 5)
	})

	it('defaults to the first page of seven', async () => {
		mocks.listTripsDb.mockResolvedValue(page)
		await fetch()
		expect(mocks.listTripsDb).toHaveBeenCalledWith('pat@x.com', when, 1, 7)
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		await expect(fetch()).rejects.toThrow('Email is required')
		expect(mocks.listTripsDb).not.toHaveBeenCalled()
	})
})

describe('database errors', () => {
	it('fetchCurrentTrips rethrows', async () => {
		const error = new Error('down')
		mocks.listTripsDb.mockRejectedValue(error)
		await expect(fetchCurrentTrips()).rejects.toBe(error)
	})

	it('fetchPastTrips returns an empty page', async () => {
		mocks.listTripsDb.mockRejectedValue(new Error('down'))
		await expect(fetchPastTrips()).resolves.toEqual({
			trips: [],
			hasMore: false,
		})
	})
})

describe('fetchTrip', () => {
	it("returns the signed-in driver's trip", async () => {
		mocks.getTripDb.mockResolvedValue(trip)
		await expect(fetchTrip(1)).resolves.toBe(trip)
		expect(mocks.getTripDb).toHaveBeenCalledWith(1, 'pat@x.com')
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue({})
		await expect(fetchTrip(1)).rejects.toThrow('Email is required')
	})

	it('returns undefined when the query fails', async () => {
		mocks.getTripDb.mockRejectedValue(new Error('down'))
		await expect(fetchTrip(1)).resolves.toBeUndefined()
	})
})
