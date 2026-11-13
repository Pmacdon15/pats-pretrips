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
const repairMocks = vi.hoisted(() => ({
	listTripRepairsDb: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/db/repairs', () => repairMocks)
const signatureMocks = vi.hoisted(() => ({
	getSavedSignatureDb: vi.fn(),
	signTripDb: vi.fn(),
}))
vi.mock('@/lib/db/signatures', () => signatureMocks)

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

const SAVED = {
	bytes: Buffer.from('png'),
	type: 'image/png',
	updatedAt: '2026-11-01T00:00:00.000Z',
}

beforeEach(() => {
	vi.useFakeTimers({ now: NOW })
	signatureMocks.getSavedSignatureDb.mockResolvedValue(SAVED)
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
			signed: false,
			signed_at: null,
			can_update: true,
		})
		expect(
			tripView(recent({ signed_at: new Date('2026-11-12T08:01:00Z') })),
		).toMatchObject({ signed: true, signed_at: '2026-11-12T08:01:00.000Z' })
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
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		const result = await getTripDefaults(caller, {})
		expect(result.data).toEqual({
			last_trip: null,
			truck: null,
			saved_signature: false,
		})
		expect(result.summary).toContain('no trips yet')
		expect(result.summary).toContain(
			'no saved signature, so the trip will be unsigned until they save one at https://patspretrips.ca/signature',
		)
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
		expect(result.data.saved_signature).toBe(true)
		expect(result.summary).toContain(
			"signed with the driver's saved signature",
		)
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
			{ bytes: SAVED.bytes, type: 'image/png', source: 'Claude' },
		)
		expect(result.summary).toBe(
			"Started trip 5: Freightliner Cascadia (ABC 1234) at 482317 km, defects: Tires, Lights. Signed with the driver's saved signature.",
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

	it('leaves the trip unsigned without a saved signature', async () => {
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(
			{ ...caller, client: null },
			{ ...start, truck_plate: undefined },
		)
		expect(mocks.createTripDb.mock.calls[0][2]).toBeNull()
		expect(result.summary).toContain(
			'Not signed: the driver has no saved signature. They can save one at https://patspretrips.ca/signature',
		)
	})

	it('names "ai" as the signer when the app gives no name', async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(
			{ ...caller, client: null },
			{ ...start, truck_plate: undefined },
		)
		expect(mocks.createTripDb.mock.calls[0][2]).toMatchObject({
			source: 'ai',
		})
	})

	it("doesn't sign when the driver asks not to", async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(caller, {
			...start,
			truck_plate: undefined,
			sign: false,
		})
		expect(signatureMocks.getSavedSignatureDb).not.toHaveBeenCalled()
		expect(mocks.createTripDb.mock.calls[0][2]).toBeNull()
		expect(result.summary).toContain('Not signed, as the driver asked.')
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

	it('says a trip is already signed when that is all that was asked', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		const result = await updateTrip(caller, { trip_id: 1, sign: true })
		expect(result).toMatchObject({
			isError: true,
			summary: 'Trip 1 is already signed. Nothing else to change.',
			data: { status: 'no_changes' },
		})
		expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
	})

	it('signs an unsigned trip with the saved signature', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		signatureMocks.signTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		const result = await updateTrip(caller, { trip_id: 1, sign: true })
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
		expect(signatureMocks.signTripDb).toHaveBeenCalledWith(
			1,
			'pat@x.com',
			SAVED,
			'Claude',
		)
		expect(result.summary).toBe(
			"Signed trip 1 with the driver's saved signature.",
		)
		expect(result.data.trip).toMatchObject({ signed: true })
	})

	it('changes and signs a trip together', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(recent({ make: 'Mack' }))
		signatureMocks.signTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		const result = await updateTrip(caller, {
			trip_id: 1,
			make: 'Mack',
			sign: true,
		})
		expect(result.summary).toBe(
			"Updated trip 1. Signed trip 1 with the driver's saved signature.",
		)
	})

	it("changes nothing when there's no saved signature to sign with", async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		const result = await updateTrip(caller, {
			trip_id: 1,
			make: 'Mack',
			sign: true,
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'no_saved_signature' },
		})
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
	})

	it('says when the trip passed 24 hours before it was signed', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		signatureMocks.signTripDb.mockResolvedValue(undefined)
		const result = await updateTrip(caller, { trip_id: 1, sign: true })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'too_old' },
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
			'Trip 1: Volvo VNL at 1000 km on 2026-11-12. 1 of 1 defects open.',
		)
		expect(result.data.defect_status).toEqual([
			{ defect: 'Cab', status: 'open', repair: null },
		])
		expect(mocks.getTripDb).toHaveBeenCalledWith(1, 'pat@x.com')
		expect(repairMocks.listTripRepairsDb).toHaveBeenCalledWith(
			1,
			'pat@x.com',
		)
	})

	it('leaves out defect counts for a trip without defects', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ defects: '' }))
		const result = await getTrip(caller, { trip_id: 1 })
		expect(result.summary).toBe(
			'Trip 1: Volvo VNL at 1000 km on 2026-11-12.',
		)
	})

	it('says when it is not found', async () => {
		mocks.getTripDb.mockResolvedValue(undefined)
		const result = await getTrip(caller, { trip_id: 1 })
		expect(result.isError).toBe(true)
	})
})
