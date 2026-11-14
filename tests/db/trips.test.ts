import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({
	neon: vi.fn(),
	cacheTag: vi.fn(),
	cacheLife: vi.fn(),
}))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))
vi.mock('next/cache', () => ({
	cacheTag: mocks.cacheTag,
	cacheLife: mocks.cacheLife,
}))

import {
	createTripDb,
	getTripDefectsDb,
	updateTripDefectsDb,
} from '@/lib/db/trips'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

const form = {
	carrier: 'Acme',
	carrierAddress: '1 Main St',
	inspectionAddress: '123 North St',
	make: 'Volvo',
	model: 'VNL',
	odometer: 1000,
	truckPlate: 'ABC',
	trailerPlateA: 'T1',
	trailerPlateB: undefined,
	defects: 'Cab',
	remarks: 'All good',
}

describe('createTripDb', () => {
	it('inserts the trip for the driver and returns the new row', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-02T03:04:05Z') })
		const row = { tripid: 7, carrier: 'Acme' }
		sql.respond(() => [row])

		await expect(createTripDb(form, 'pat@x.com')).resolves.toEqual(row)

		expect(mocks.neon).toHaveBeenCalledWith('postgres://test')
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO PTTrips')
		expect(query.text).toContain('RETURNING *')
		expect(query.text).toContain('INSERT INTO pt_trip_signatures')
		expect(query.values).toEqual([
			'pat@x.com',
			'Acme',
			'1 Main St',
			'123 North St',
			'Volvo',
			'VNL',
			1000,
			'ABC',
			'T1',
			undefined,
			'2026-01-02T03:04:05.000Z',
			'Cab',
			'All good',
			// Unsigned: no signed_at and no signature row.
			null,
			null,
			null,
			null,
			0,
		])
	})

	it('saves the signature with the trip', async () => {
		vi.useFakeTimers({ now: new Date('2026-01-02T03:04:05Z') })
		sql.respond(() => [{ tripid: 7 }])
		await createTripDb(form, 'pat@x.com', {
			bytes: Buffer.from('hi'),
			type: 'image/png',
			source: 'web',
		})
		// signed_at, then the signature as hex, its type, who saved it and "sign".
		expect(sql.queries()[0].values.slice(-5)).toEqual([
			'2026-01-02T03:04:05.000Z',
			'6869',
			'image/png',
			'web',
			1,
		])
	})
})

describe('getTripDefectsDb', () => {
	it("returns the trip's defects", async () => {
		sql.respond(() => [{ defects: 'Cab, Horn' }])

		await expect(getTripDefectsDb(3, 'pat@x.com')).resolves.toBe(
			'Cab, Horn',
		)
		const [query] = sql.queries()
		expect(query.text).toContain("INTERVAL '24 hour'")
		expect(query.values).toEqual([3, 'pat@x.com'])
	})

	it('returns an empty string when the trip has none', async () => {
		sql.respond(() => [{ defects: null }])
		await expect(getTripDefectsDb(3, 'pat@x.com')).resolves.toBe('')
	})

	it('returns an empty string when no recent trip matches', async () => {
		await expect(getTripDefectsDb(3, 'pat@x.com')).resolves.toBe('')
	})
})

describe('updateTripDefectsDb', () => {
	it('appends the defects and remarks and returns the updated row', async () => {
		const row = { tripid: 3, defects: 'Cab, Horn' }
		sql.respond(() => [row])

		await expect(
			updateTripDefectsDb(3, 'pat@x.com', 'Horn', 'Loud'),
		).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('UPDATE PTTrips')
		expect(query.values).toEqual([
			'Horn',
			'Horn',
			'Horn',
			'Loud',
			'Loud',
			'Loud',
			3,
			'pat@x.com',
		])
	})

	it('throws when no recent trip matches', async () => {
		await expect(
			updateTripDefectsDb(3, 'pat@x.com', 'Horn', 'Loud'),
		).rejects.toThrow('Failed to update trip or trip not found')
	})
})

describe('connector queries', () => {
	it('reads the latest trip', async () => {
		const { getLatestTripDb } = await import('@/lib/db/trips')
		sql.respond(() => [{ tripid: 3 }])
		await expect(getLatestTripDb('pat@x.com')).resolves.toEqual({
			tripid: 3,
		})
		expect(sql.queries()[0].text).toContain('ORDER BY date DESC LIMIT 1')
	})

	it('finds the latest trip for a plate, ignoring spaces, dashes and case', async () => {
		const { getLatestTripForPlateDb, normalizePlate } = await import(
			'@/lib/db/trips'
		)
		expect(normalizePlate('abc-12 3')).toBe('ABC123')
		await expect(
			getLatestTripForPlateDb('pat@x.com', 'abc 123'),
		).resolves.toBeUndefined()
		expect(sql.queries()[0].values).toEqual(['pat@x.com', 'ABC123'])
	})

	it.each([
		['current', '>='],
		['past', '<'],
	] as const)('lists %s trips a page at a time', async (when, op) => {
		const { listTripsDb } = await import('@/lib/db/trips')
		sql.respond(() => [{ tripid: 1 }, { tripid: 2 }, { tripid: 3 }])
		await expect(listTripsDb('pat@x.com', when, 2, 2)).resolves.toEqual({
			trips: [{ tripid: 1 }, { tripid: 2 }],
			hasMore: true,
		})
		const [query] = sql.queries()
		expect(query.text).toContain(`date ${op} NOW() - INTERVAL '24 hours'`)
		expect(query.values).toEqual(['pat@x.com', 3, 2])
		expect(mocks.cacheTag).toHaveBeenCalledWith('trips:pat@x.com')
		expect(mocks.cacheLife).toHaveBeenCalledWith('hours')
	})

	it("reads one of the driver's trips", async () => {
		const { getTripDb } = await import('@/lib/db/trips')
		await expect(getTripDb(4, 'pat@x.com')).resolves.toBeUndefined()
		expect(sql.queries()[0].values).toEqual([4, 'pat@x.com'])
		expect(mocks.cacheTag).toHaveBeenCalledWith('trips:pat@x.com')
	})

	it('updates only the fields passed, for trips in the last 24 hours', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		sql.respond(() => [{ tripid: 4, make: 'Mack', target_trip_id: 4 }])
		await expect(
			updateTripDb(4, 'pat@x.com', {
				odometer: 5,
				make: 'Mack',
				addDefects: 'Cab',
				addRemarks: 'Late',
			}),
		).resolves.toEqual({ tripid: 4, make: 'Mack' })
		const [query] = sql.queries()
		expect(query.text).toContain("date >= NOW() - INTERVAL '24 hours'")
		const core = [null, null, null, 'Mack', null, 5, null, null, null]
		expect(query.values).toEqual([
			// The trip being changed, found whether or not it's locked.
			4,
			'pat@x.com',
			// SET: the core fields, then defects and remarks, both appended.
			...core,
			'Cab',
			'Cab',
			'Cab',
			'Late',
			'Late',
			'Late',
			4,
			'pat@x.com',
			// The lock: each core field twice, for "left out or unchanged".
			...core.flatMap((v) => [v, v]),
		])
		await updateTripDb(4, 'pat@x.com', {})
		expect(sql.queries()[1].values.slice(2, 17)).toEqual(
			Array(15).fill(null),
		)
	})

	it('appends defects and never replaces the list', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		await updateTripDb(4, 'pat@x.com', { addDefects: 'Tires' })
		const { text } = sql.queries()[0]
		expect(text).toContain(
			"defects = CASE WHEN ?::text IS NULL THEN defects WHEN COALESCE(defects, '') = '' THEN ?::text ELSE defects || ', ' || ?::text END",
		)
		expect(text).toContain(
			"remarks = CASE WHEN ?::text IS NULL THEN remarks WHEN COALESCE(remarks, '') = '' THEN ?::text ELSE remarks || ', ' || ?::text END",
		)
	})

	it("locks a signed trip's core fields in the UPDATE itself", async () => {
		const { CORE_TRIP_FIELDS, updateTripDb } = await import(
			'@/lib/db/trips'
		)
		await updateTripDb(4, 'pat@x.com', { odometer: 5 })
		const { text } = sql.queries()[0]
		// Unsigned, or every core field left out or unchanged.
		expect(text).toContain('AND ( signed_at IS NULL OR ( (')
		for (const field of CORE_TRIP_FIELDS) {
			const type = field === 'odometer' ? 'int' : 'text'
			expect(text).toContain(
				`(?::${type} IS NULL OR ?::${type} IS NOT DISTINCT FROM ${field})`,
			)
		}
		expect(text).toContain(
			'SELECT updated.*, target.tripId AS target_trip_id FROM target LEFT JOIN updated ON true',
		)
	})

	it('says when a signed trip refused a core change', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		// The trip was found, but the update matched nothing.
		sql.respond(() => [{ tripid: null, target_trip_id: 4 }])
		await expect(
			updateTripDb(4, 'pat@x.com', { odometer: 5 }),
		).resolves.toBe('signed_locked')
	})

	it("is undefined when the trip isn't the driver's or is too old", async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		await expect(
			updateTripDb(4, 'pat@x.com', { odometer: 5 }),
		).resolves.toBeUndefined()
	})
})
