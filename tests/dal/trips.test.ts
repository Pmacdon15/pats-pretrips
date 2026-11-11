import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from '../db/sql-mock'

const mocks = vi.hoisted(() => ({
	neon: vi.fn(),
	cacheTag: vi.fn(),
	cacheLife: vi.fn(),
	getUser: vi.fn(),
}))

vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))
vi.mock('next/cache', () => ({
	cacheTag: mocks.cacheTag,
	cacheLife: mocks.cacheLife,
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	getKindeServerSession: () => ({ getUser: mocks.getUser }),
}))

import { fetchCurrentTrips, fetchPastTrips, fetchTrip } from '@/lib/DAL/trips'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.spyOn(console, 'log').mockImplementation(() => {})
})

const trip = { tripid: 1, carrier: 'Acme' }
const countIs = (count: number | undefined) =>
	sql.respond(({ text }) =>
		text.includes('COUNT(*)')
			? count === undefined
				? []
				: [{ count }]
			: [trip],
	)

describe.each([
	['fetchCurrentTrips', fetchCurrentTrips, 'current-trips', '>='],
	['fetchPastTrips', fetchPastTrips, 'past-trips', '<'],
] as const)('%s', (_name, fetch, tag, comparison) => {
	it("pages the driver's trips and tags the cache", async () => {
		countIs(20)

		await expect(fetch(2, 7)).resolves.toEqual({
			trips: [trip],
			hasMore: true,
		})
		expect(mocks.cacheTag).toHaveBeenCalledWith(tag)
		expect(mocks.cacheLife).toHaveBeenCalledWith('hours')
		const [page, count] = sql.queries()
		expect(page.text).toContain(
			`date ${comparison} NOW() - INTERVAL '24 hours'`,
		)
		expect(page.values).toEqual(['pat@x.com', 7, 7])
		expect(count.values).toEqual(['pat@x.com'])
	})

	it('defaults to the first page of seven', async () => {
		countIs(7)

		await expect(fetch()).resolves.toEqual({
			trips: [trip],
			hasMore: false,
		})
		expect(sql.queries()[0].values).toEqual(['pat@x.com', 7, 0])
	})

	it('reports no more pages when the count is missing', async () => {
		countIs(undefined)
		await expect(fetch()).resolves.toMatchObject({ hasMore: false })
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		await expect(fetch()).rejects.toThrow('Email is required')
		expect(sql.calls).toHaveLength(0)
	})
})

describe('database errors', () => {
	it('fetchCurrentTrips rethrows', async () => {
		const error = new Error('down')
		sql.respond(() => error)
		await expect(fetchCurrentTrips()).rejects.toBe(error)
	})

	it('fetchPastTrips returns an empty page', async () => {
		sql.respond(() => new Error('down'))
		await expect(fetchPastTrips()).resolves.toEqual({
			trips: [],
			hasMore: false,
		})
	})
})

describe('fetchTrip', () => {
	it("returns the driver's trip and tags it by id", async () => {
		sql.respond(() => [trip])

		await expect(fetchTrip(1)).resolves.toEqual(trip)
		expect(mocks.cacheTag).toHaveBeenCalledWith('trip-1')
		expect(sql.queries()[0].values).toEqual([1, 'pat@x.com'])
	})

	it('requires a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue({})
		await expect(fetchTrip(1)).rejects.toThrow('Email is required')
	})

	it('returns undefined when the query fails', async () => {
		sql.respond(() => new Error('down'))
		await expect(fetchTrip(1)).resolves.toBeUndefined()
	})
})
