import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

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
