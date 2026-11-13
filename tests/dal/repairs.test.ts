import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repair } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	listTripRepairsDb: vi.fn(),
	listDriverRepairsDb: vi.fn(),
	listTripsWithDefectsDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getDriverEmail: mocks.email }))
vi.mock('@/lib/db/repairs', () => ({
	listTripRepairsDb: mocks.listTripRepairsDb,
	listDriverRepairsDb: mocks.listDriverRepairsDb,
	listTripsWithDefectsDb: mocks.listTripsWithDefectsDb,
}))

import { fetchDefectRecord, fetchTripRepairs } from '@/lib/DAL/repairs'

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('fetchTripRepairs', () => {
	it('lists the signed-in driver’s repairs on a trip', async () => {
		mocks.listTripRepairsDb.mockResolvedValue([repair()])
		expect(await fetchTripRepairs(1)).toEqual([repair()])
		expect(mocks.listTripRepairsDb).toHaveBeenCalledWith(1, 'pat@x.com')
	})

	it('is empty when signed out, for a bad id, or when the query fails', async () => {
		expect(await fetchTripRepairs(Number.NaN)).toEqual([])
		mocks.email.mockResolvedValueOnce(null)
		expect(await fetchTripRepairs(1)).toEqual([])
		mocks.listTripRepairsDb.mockRejectedValueOnce(new Error('down'))
		expect(await fetchTripRepairs(1)).toEqual([])
	})
})

describe('fetchDefectRecord', () => {
	it('builds the record from the driver’s trips and repairs', async () => {
		mocks.listTripsWithDefectsDb.mockResolvedValue([
			{
				tripid: 1,
				date: '2026-01-02T00:00:00.000Z',
				truckplate: null,
				make: 'Volvo',
				model: 'VNL',
				defects: 'Cab, Horn',
			},
		])
		mocks.listDriverRepairsDb.mockResolvedValue([
			{
				...repair(),
				trip_date: '2026-01-02T00:00:00.000Z',
				truck_plate: null,
				make: 'Volvo',
				model: 'VNL',
			},
		])
		const record = await fetchDefectRecord()
		expect(record.open.map((d) => d.defect)).toEqual(['Horn'])
		expect(record.repaired).toHaveLength(1)
	})

	it('needs a signed-in driver', async () => {
		mocks.email.mockResolvedValueOnce(null)
		await expect(fetchDefectRecord()).rejects.toThrow('Email is required')
	})
})
