import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	createTripDb: vi.fn(),
	getLatestTripDb: vi.fn(),
	getLatestTripForPlateDb: vi.fn(),
	getTripDb: vi.fn(),
	listTripsDb: vi.fn(),
	updateTripDb: vi.fn(),
}))
vi.mock('@/lib/db/trips', () => mocks)

import {
	getTrip,
	getTripDefaults,
	listDefectCategories,
	listTrips,
	normalizeDefects,
	startTrip,
	tripView,
	updateTrip,
} from '@/mcp/tools'

const caller = { email: 'pat@x.com', client: 'Claude' }
const NOW = new Date('2026-11-12T12:00:00Z')
const recent = (over = {}) =>
	trip({ date: new Date('2026-11-12T08:00:00Z'), ...over })
const old = (over = {}) =>
	trip({ date: new Date('2026-11-10T08:00:00Z'), ...over })

beforeEach(() => {
	vi.useFakeTimers({ now: NOW })
})

describe('tripView', () => {
	it('shows a trip with plain names and its defects as a list', () => {
		expect(
			tripView(
				recent({ defects: 'Cab, None, Tires', trailerplateb: '' }),
			),
		).toEqual({
			trip_id: 1,
			date: '2026-11-12T08:00:00.000Z',
			carrier: 'Acme',
			carrier_address: '1 Main St',
			inspection_address: '123 North St',
			make: 'Volvo',
			model: 'VNL',
			odometer: 1000,
			truck_plate: 'TRK1',
			trailer_plate_a: 'TRL1',
			trailer_plate_b: null,
			defects: ['Cab', 'Tires'],
			remarks: 'Cracked',
			can_update: true,
		})
		expect(
			tripView(old({ truckplate: undefined, trailerplatea: undefined })),
		).toMatchObject({
			truck_plate: null,
			trailer_plate_a: null,
			can_update: false,
		})
	})
})

describe('normalizeDefects', () => {
	it("uses the app's spelling, keeps others and drops repeats and 'none'", () => {
		expect(
			normalizeDefects(['tires', ' Tires ', 'none', '', 'Cracked bunk']),
		).toEqual(['Tires', 'Cracked bunk'])
	})
})

describe('listDefectCategories', () => {
	it('lists the categories', () => {
		const result = listDefectCategories()
		expect(result.data.categories).toContain('Air Brake System')
	})
})

describe('getTripDefaults', () => {
	it('says when the driver has no trips yet', async () => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		const result = await getTripDefaults(caller, {})
		expect(result.data).toEqual({ last_trip: null, truck: null })
		expect(result.summary).toContain('no trips yet')
		expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()
	})

	it("suggests the last trip's carrier and that truck's details", async () => {
		mocks.getLatestTripDb.mockResolvedValue(recent())
		mocks.getLatestTripForPlateDb.mockResolvedValue(
			old({
				make: 'Mack',
				model: 'Anthem',
				odometer: 400,
				trailerplateb: '',
			}),
		)
		const result = await getTripDefaults(caller, { truck_plate: 'abc 1' })
		expect(mocks.getLatestTripForPlateDb).toHaveBeenCalledWith(
			'pat@x.com',
			'abc 1',
		)
		expect(result.data.truck).toEqual({
			make: 'Mack',
			model: 'Anthem',
			truck_plate: 'TRK1',
			trailer_plate_a: 'TRL1',
			trailer_plate_b: null,
			last_odometer: 400,
			last_inspected: '2026-11-10T08:00:00.000Z',
		})
		expect(result.data.last_trip).toMatchObject({
			carrier: 'Acme',
			inspection_address: '123 North St',
		})
		expect(result.summary).toContain('Plate abc 1 is the Mack Anthem')
	})

	it('says when a plate has no earlier trip', async () => {
		mocks.getLatestTripDb.mockResolvedValue(
			recent({ truckplate: '', trailerplatea: '', trailerplateb: '' }),
		)
		mocks.getLatestTripForPlateDb.mockResolvedValueOnce(
			old({ truckplate: '', trailerplatea: '' }),
		)
		expect(
			(await getTripDefaults(caller, { truck_plate: 'X' })).data.truck,
		).toMatchObject({ truck_plate: null, trailer_plate_a: null })
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		const result = await getTripDefaults(caller, { truck_plate: 'NEW1' })
		expect(result.data.truck).toBeNull()
		expect(result.data.last_trip).toMatchObject({
			truck_plate: null,
			trailer_plate_a: null,
			trailer_plate_b: null,
		})
		expect(result.summary).toContain('No earlier trip in plate NEW1')
	})

	it('leaves the truck out without a plate', async () => {
		mocks.getLatestTripDb.mockResolvedValue(recent())
		const result = await getTripDefaults(caller, {})
		expect(result.summary).not.toContain('Plate')
	})
})

const start = {
	odometer: 482317,
	truck_plate: 'ABC 1234',
	make: 'Freightliner',
	model: 'Cascadia',
	carrier: 'Acme',
	carrier_address: '1 Main St',
	inspection_address: '455 Yard Ave',
	remarks: 'No defects found',
}

describe('startTrip', () => {
	it('saves the trip for the caller', async () => {
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5, defects: '' }))
		const result = await startTrip(caller, {
			...start,
			defects: ['tires', 'Lights'],
		})
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			{
				carrier: 'Acme',
				carrierAddress: '1 Main St',
				inspectionAddress: '455 Yard Ave',
				make: 'Freightliner',
				model: 'Cascadia',
				odometer: 482317,
				truckPlate: 'ABC 1234',
				trailerPlateA: undefined,
				trailerPlateB: undefined,
				defects: 'Tires, Lights',
				remarks: 'No defects found',
			},
			'pat@x.com',
		)
		expect(result.summary).toBe(
			'Started trip 5: Freightliner Cascadia (ABC 1234) at 482317 km, defects: Tires, Lights.',
		)
		expect(result.data.warning).toBeUndefined()
	})

	it('warns when the odometer is lower than the truck’s last reading', async () => {
		mocks.getLatestTripForPlateDb.mockResolvedValue(
			old({ tripid: 2, odometer: 500000 }),
		)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(caller, start)
		expect(result.data.warning).toContain('lower than this truck')
		expect(result.summary).toContain('no defects')
		expect(result.summary).toContain('Check the photo')
	})

	it('skips the check without a plate', async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const { truck_plate: _, ...noPlate } = start
		const result = await startTrip(caller, noPlate)
		expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()
		expect(result.summary).toContain('Freightliner Cascadia at 482317 km')
	})

	it('rejects a trip without remarks', async () => {
		await expect(
			startTrip(caller, { ...start, remarks: '' }),
		).rejects.toThrow()
	})
})

describe('updateTrip', () => {
	it('says when the trip is not found', async () => {
		mocks.getTripDb.mockResolvedValue(undefined)
		const result = await updateTrip(caller, { trip_id: 4, odometer: 1 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_found' },
		})
	})

	it('refuses trips older than 24 hours', async () => {
		mocks.getTripDb.mockResolvedValue(old())
		const result = await updateTrip(caller, { trip_id: 1, odometer: 1 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'too_old' },
		})
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
	})

	it('refuses when nothing changes', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		const result = await updateTrip(caller, {
			trip_id: 1,
			add_defects: ['cab'],
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'no_changes' },
		})
	})

	it('adds new defects to the list and changes only what was passed', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ defects: 'Cab' }))
		mocks.updateTripDb.mockResolvedValue(recent({ defects: 'Cab, Tires' }))
		const result = await updateTrip(caller, {
			trip_id: 1,
			add_defects: ['Cab', 'tires'],
			add_remarks: 'Flat on route',
			make: 'Mack',
		})
		expect(mocks.updateTripDb).toHaveBeenCalledWith(1, 'pat@x.com', {
			carrier: undefined,
			carrierAddress: undefined,
			inspectionAddress: undefined,
			make: 'Mack',
			model: undefined,
			odometer: undefined,
			truckPlate: undefined,
			trailerPlateA: undefined,
			trailerPlateB: undefined,
			defects: 'Cab, Tires',
			addRemarks: 'Flat on route',
		})
		expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()
		expect(result.summary).toBe('Updated trip 1.')
	})

	it("checks a new odometer against the truck's other trips", async () => {
		mocks.getTripDb.mockResolvedValue(recent({ tripid: 1 }))
		mocks.getLatestTripForPlateDb.mockResolvedValue(
			old({ tripid: 2, odometer: 9000 }),
		)
		mocks.updateTripDb.mockResolvedValue(recent())
		const result = await updateTrip(caller, { trip_id: 1, odometer: 8000 })
		expect(mocks.getLatestTripForPlateDb).toHaveBeenCalledWith(
			'pat@x.com',
			'TRK1',
		)
		expect(result.data.warning).toContain('8000 km')
	})

	it('uses a new plate for the check, and ignores the trip itself', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ tripid: 1 }))
		mocks.getLatestTripForPlateDb.mockResolvedValue(
			recent({ tripid: 1, odometer: 9000 }),
		)
		mocks.updateTripDb.mockResolvedValue(recent())
		const result = await updateTrip(caller, {
			trip_id: 1,
			odometer: 8000,
			truck_plate: 'NEW',
		})
		expect(mocks.getLatestTripForPlateDb).toHaveBeenCalledWith(
			'pat@x.com',
			'NEW',
		)
		expect(result.data.warning).toBeUndefined()
	})

	it('says when the trip passed 24 hours while saving', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ truckplate: undefined }))
		mocks.updateTripDb.mockResolvedValue(undefined)
		const result = await updateTrip(caller, { trip_id: 1, odometer: 2 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'too_old' },
		})
	})
})

describe('listTrips', () => {
	it('lists current trips by default', async () => {
		mocks.listTripsDb.mockResolvedValue({
			trips: [recent()],
			hasMore: true,
		})
		const result = await listTrips(caller, {})
		expect(mocks.listTripsDb).toHaveBeenCalledWith(
			'pat@x.com',
			'current',
			1,
			10,
		)
		expect(result.summary).toBe(
			'1 trip in the last 24 hours; more on page 2.',
		)
		expect(result.data).toMatchObject({ has_more: true, page: 1 })
	})

	it('lists past trips by page', async () => {
		mocks.listTripsDb.mockResolvedValue({
			trips: [old(), old()],
			hasMore: false,
		})
		const result = await listTrips(caller, { when: 'past', page: 2 })
		expect(result.summary).toBe('2 trips older.')
	})

	it('says when a page is empty', async () => {
		mocks.listTripsDb.mockResolvedValue({ trips: [], hasMore: false })
		const result = await listTrips(caller, { when: 'past', page: 3 })
		expect(result.summary).toBe('No trips older on page 3.')
	})
})

describe('getTrip', () => {
	it('shows one trip', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		const result = await getTrip(caller, { trip_id: 1 })
		expect(result.summary).toBe(
			'Trip 1: Volvo VNL at 1000 km on 2026-11-12.',
		)
		expect(mocks.getTripDb).toHaveBeenCalledWith(1, 'pat@x.com')
	})

	it('says when it is not found', async () => {
		mocks.getTripDb.mockResolvedValue(undefined)
		const result = await getTrip(caller, { trip_id: 1 })
		expect(result.isError).toBe(true)
	})
})
