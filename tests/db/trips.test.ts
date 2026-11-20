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

import { createTripDb, getTripDefectsDb } from '@/lib/db/trips'

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
			// Unsigned: no signed_at; the personal space: no organization;
			// and no signature row.
			null,
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
		// signed_at, the organization, then the signature as hex, its type,
		// who saved it and "sign".
		expect(sql.queries()[0].values.slice(-6)).toEqual([
			'2026-01-02T03:04:05.000Z',
			null,
			'6869',
			'image/png',
			'web',
			1,
		])
	})

	it('records the organization the trip was started in', async () => {
		sql.respond(() => [{ tripid: 7 }])
		await createTripDb(form, 'pat@x.com', null, 'org_1')
		expect(sql.queries()[0].text).toContain('clerk_org_id')
		expect(sql.queries()[0].values).toContain('org_1')
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
		expect(query.text).toContain('clerk_org_id IS NOT DISTINCT FROM')
		expect(query.values).toEqual(['pat@x.com', null, 3, 2])
		expect(mocks.cacheTag).toHaveBeenCalledWith('trips:pat@x.com')
		expect(mocks.cacheLife).toHaveBeenCalledWith('hours')
	})

	it("lists only one organization's trips", async () => {
		const { listTripsDb } = await import('@/lib/db/trips')
		sql.respond(() => [])
		await listTripsDb('pat@x.com', 'current', 1, 7, 'org_1')
		expect(sql.queries()[0].values).toEqual(['pat@x.com', 'org_1', 8, 0])
	})

	it("reads one of the driver's trips", async () => {
		const { getTripDb } = await import('@/lib/db/trips')
		await expect(getTripDb(4, 'pat@x.com')).resolves.toBeUndefined()
		expect(sql.queries()[0].values).toEqual([4, 'pat@x.com'])
		expect(mocks.cacheTag).toHaveBeenCalledWith('trips:pat@x.com')
	})

	it('updates only the fields passed, for trips in the last 24 hours', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		sql.respond(() => [
			{
				tripid: 4,
				make: 'Mack',
				target_trip_id: 4,
				defects_too_long: false,
				remarks_too_long: false,
				before_make: 'Volvo',
				before_odometer: 1000,
			},
		])
		// The trip as saved, and its core details as the update found them
		// (for the audit trail), kept apart.
		await expect(
			updateTripDb(4, 'pat@x.com', {
				odometer: 5,
				make: 'Mack',
				addDefects: 'Cab',
				addRemarks: 'Late',
			}),
		).resolves.toEqual({
			trip: { tripid: 4, make: 'Mack' },
			before: { make: 'Volvo', odometer: 1000 },
		})
		const [query] = sql.queries()
		expect(query.text).toContain("date >= NOW() - INTERVAL '24 hours'")
		const core = [null, null, null, 'Mack', null, 5, null, null, null]
		expect(query.values).toEqual([
			// The trip being changed, found and locked whether or not it can
			// change, with whether the added defects and remarks are too long.
			'Cab',
			'Cab',
			2000,
			'Late',
			'Late',
			10_000,
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
			'pat@x.com',
			// The lock: each core field twice, for "left out or unchanged".
			...core.flatMap((v) => [v, v]),
			// The limits: defects, then remarks.
			'Cab',
			'Cab',
			2000,
			'Late',
			'Late',
			10_000,
		])
		await updateTripDb(4, 'pat@x.com', {})
		expect(sql.queries()[1].values.slice(8, 23)).toEqual(
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
			'SELECT updated.*, target.tripId AS target_trip_id, target.defects_too_long, target.remarks_too_long, target.before_carrier, target.before_carrieraddress, target.before_inspectionaddress, target.before_make, target.before_model, target.before_odometer, target.before_truckplate, target.before_trailerplatea, target.before_trailerplateb FROM target LEFT JOIN updated ON true',
		)
	})

	it('reads every core field as it was from the locked row, in the same statement', async () => {
		const { CORE_TRIP_FIELDS, updateTripDb } = await import(
			'@/lib/db/trips'
		)
		await updateTripDb(4, 'pat@x.com', { odometer: 5 })
		expect(sql.queries()).toHaveLength(1)
		const { text } = sql.queries()[0]
		const target = text.slice(0, text.indexOf('FOR UPDATE'))
		for (const field of CORE_TRIP_FIELDS) {
			expect(target).toContain(
				`${field} AS before_${field.toLowerCase()}`,
			)
		}
	})

	it('caps the whole defects and remarks in the UPDATE itself, on the locked row', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		await updateTripDb(4, 'pat@x.com', { addRemarks: 'Late' })
		const { text } = sql.queries()[0]
		// The row is locked first, so the reason is read from the row the
		// update sees, even when another change was saved meanwhile.
		expect(text).toContain('WITH target AS MATERIALIZED ( SELECT tripId,')
		expect(text).toContain(
			"AND date >= NOW() - INTERVAL '24 hours' FOR UPDATE )",
		)
		// The new length: the old one plus ", " (none when empty), plus the
		// added text.
		for (const field of ['defects', 'remarks']) {
			expect(text).toContain(
				`(?::text IS NOT NULL AND COALESCE(char_length(NULLIF(${field}, '')) + 2, 0) + char_length(?::text) > ?::int ) AS ${field}_too_long`,
			)
			expect(text).toContain(
				`AND (?::text IS NULL OR COALESCE(char_length(NULLIF(${field}, '')) + 2, 0) + char_length(?::text) <= ?::int)`,
			)
		}
		expect(text).toContain(
			'FROM target WHERE PTTrips.tripId = target.tripId',
		)
		expect(text).toContain('RETURNING PTTrips.*')
	})

	it('says when a signed trip refused a core change', async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		// The trip was found, but the update matched nothing.
		sql.respond(() => [
			{
				tripid: null,
				target_trip_id: 4,
				defects_too_long: false,
				remarks_too_long: false,
			},
		])
		await expect(
			updateTripDb(4, 'pat@x.com', { odometer: 5 }),
		).resolves.toBe('signed_locked')
	})

	it.each([
		[true, false, 'defects_too_long'],
		[false, true, 'remarks_too_long'],
		// Both: the defects are named.
		[true, true, 'defects_too_long'],
	])('says when added text would pass a limit (defects %s, remarks %s)', async (defects, remarks, refusal) => {
		const { updateTripDb } = await import('@/lib/db/trips')
		sql.respond(() => [
			{
				tripid: null,
				target_trip_id: 4,
				defects_too_long: defects,
				remarks_too_long: remarks,
			},
		])
		await expect(
			updateTripDb(4, 'pat@x.com', {
				addDefects: 'Tires',
				addRemarks: 'Flat',
			}),
		).resolves.toBe(refusal)
	})

	it("is undefined when the trip isn't the driver's or is too old", async () => {
		const { updateTripDb } = await import('@/lib/db/trips')
		await expect(
			updateTripDb(4, 'pat@x.com', { odometer: 5 }),
		).resolves.toBeUndefined()
	})
})
