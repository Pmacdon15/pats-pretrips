import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip } from '@/lib/types/types'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	createTripDb: vi.fn(),
	getLatestTripDb: vi.fn(),
	getLatestTripForPlateDb: vi.fn(),
	getTripDb: vi.fn(),
	listTripsDb: vi.fn(),
	updateTripDb: vi.fn(),
}))
vi.mock('@/lib/db/trips', async (original) => ({
	...mocks,
	CORE_TRIP_FIELDS: (await original<typeof import('@/lib/db/trips')>())
		.CORE_TRIP_FIELDS,
}))
const repairMocks = vi.hoisted(() => ({
	listTripRepairsDb: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/db/repairs', () => repairMocks)
const signatureMocks = vi.hoisted(() => ({
	getAiSigningAllowedDb: vi.fn(),
	getSavedSignatureDb: vi.fn(),
	saveSignatureDb: vi.fn(),
	signTripDb: vi.fn(),
}))
vi.mock('@/lib/db/signatures', () => signatureMocks)
const vehicleMocks = vi.hoisted(() => ({
	listVehiclesOrNone: vi.fn(async () => [] as unknown[]),
	getVehicleDb: vi.fn(),
	listOrgVehiclesOrNone: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/db/vehicles', async (original) => ({
	...(await original<typeof import('@/lib/db/vehicles')>()),
	...vehicleMocks,
}))
const trailerMocks = vi.hoisted(() => ({
	listTrailersOrNone: vi.fn(async () => [] as unknown[]),
	listOrgTrailersOrNone: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/db/trailers', () => trailerMocks)
const carrierMocks = vi.hoisted(() => ({
	listCarriersOrNone: vi.fn(async () => [] as unknown[]),
	listOrgCarriersOrNone: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/db/carriers', () => carrierMocks)
const clerkMocks = vi.hoisted(() => ({
	getOrganizationMembershipList: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({
	clerkClient: async () => ({
		users: {
			getOrganizationMembershipList:
				clerkMocks.getOrganizationMembershipList,
		},
	}),
}))
const ownerMocks = vi.hoisted(() => ({
	recordOwner: vi.fn(),
	// Runs the task now, as it does outside a request.
	afterResponse: vi.fn(async (task: () => Promise<void>) => task()),
}))
vi.mock('@/lib/db/owner-stamps', () => ownerMocks)
const emailMocks = vi.hoisted(() => ({
	prepareCallerAutoEmailDAL: vi.fn(
		async (..._args: unknown[]): Promise<unknown> => null,
	),
}))
vi.mock('@/lib/DAL/email', () => emailMocks)
// The real event builder, with the insert itself mocked.
const auditMocks = vi.hoisted(() => ({ recordEvents: vi.fn() }))
vi.mock('@/lib/db/audit-events', async (original) => ({
	...(await original<typeof import('@/lib/db/audit-events')>()),
	recordEvents: auditMocks.recordEvents,
}))

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
/** What updateTripDb answers: the trip saved, and its core details before. */
const saved = (after: Trip, before: Trip = recent()) => ({
	trip: after,
	before,
})
const old = (over = {}) =>
	trip({ date: new Date('2026-11-10T08:00:00Z'), ...over })

const LOCKED = [
	'carrier',
	'carrier_address',
	'inspection_address',
	'make',
	'model',
	'odometer',
	'truck_plate',
	'trailer_plate_a',
	'trailer_plate_b',
]

const SAVED = {
	bytes: Buffer.from('png'),
	type: 'image/png',
	updatedAt: '2026-11-01T00:00:00.000Z',
}
const PNG = { bytes: SAVED.bytes, type: 'image/png' }
const missingColumn = () =>
	Object.assign(new Error('column "allow_ai_signing" does not exist'), {
		code: '42703',
	})

beforeEach(() => {
	vi.useFakeTimers({ now: NOW })
	signatureMocks.getSavedSignatureDb.mockResolvedValue(SAVED)
	// Most tests are for a driver who allows AI apps to sign for them.
	signatureMocks.getAiSigningAllowedDb.mockResolvedValue(true)
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
			can_edit_details: true,
			locked_fields: [],
		})
		expect(
			tripView(recent({ signed_at: new Date('2026-11-12T08:01:00Z') })),
		).toMatchObject({
			signed: true,
			signed_at: '2026-11-12T08:01:00.000Z',
			can_update: true,
			can_edit_details: false,
			locked_fields: LOCKED,
		})
		expect(
			tripView(old({ truckplate: undefined, trailerplatea: undefined })),
		).toMatchObject({
			truck_plate: null,
			trailer_plate_a: null,
			can_update: false,
			can_edit_details: false,
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
			space: 'personal',
			trailers: [],
			carriers: [],
			last_trip: null,
			truck: null,
			vehicles: [],
			saved_signature: false,
			ai_signing_allowed: false,
		})
		expect(result.summary).toContain('no trips yet')
		expect(result.summary).toContain(
			'no saved signature, so the trip will be saved unsigned. They can sign it in the app; to let you sign, they save a signature and turn on "Allow AI apps to sign for me" at https://patspretrips.ca/signature',
		)
		expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()
	})

	it("lists the driver's saved vehicles", async () => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		vehicleMocks.listVehiclesOrNone.mockResolvedValue([VEHICLE])
		const result = await getTripDefaults(caller, {})
		expect(result.data.vehicles).toEqual([
			{
				vehicle_id: 3,
				name: 'Unit 42',
				make: 'Volvo',
				model: 'VNL',
				truck_plate: 'TRK 9',
				trailer_plate_a: 'TRL 9',
				trailer_plate_b: null,
			},
		])
		expect(result.summary).toContain(
			'The driver has 1 saved vehicle (vehicles)',
		)
		vehicleMocks.listVehiclesOrNone.mockResolvedValue([VEHICLE, VEHICLE])
		mocks.getLatestTripDb.mockResolvedValue(recent())
		const again = await getTripDefaults(caller, {})
		expect(again.summary).toContain('2 saved vehicles')
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
		expect(result.data.ai_signing_allowed).toBe(true)
		expect(result.summary).toContain(
			"signed with the driver's saved signature (they allow AI apps to sign for them)",
		)
	})

	it.each([
		['off', () => Promise.resolve(false)],
		['not migrated yet', () => Promise.reject(missingColumn())],
	])('says the trip will be unsigned when AI signing is %s', async (_name, allowed) => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		signatureMocks.getAiSigningAllowedDb.mockImplementation(allowed)
		const result = await getTripDefaults(caller, {})
		expect(result.data).toMatchObject({
			saved_signature: true,
			ai_signing_allowed: false,
		})
		expect(result.summary).toContain(
			'The driver hasn\'t turned on "Allow AI apps to sign for me", so the trip will be saved unsigned. They can sign it in the app, or turn that on at https://patspretrips.ca/signature to let you sign.',
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

const VEHICLE = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK 9',
	trailer_plate_a: 'TRL 9',
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe('startTrip with a saved vehicle', () => {
	const { make: _m, model: _o, truck_plate: _t, ...noVehicle } = start

	it("fills the make, model and plates from the driver's vehicle", async () => {
		vehicleMocks.getVehicleDb.mockResolvedValue(VEHICLE)
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(caller, { ...noVehicle, vehicle_id: 3 })
		expect(vehicleMocks.getVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(mocks.createTripDb.mock.calls[0][0]).toMatchObject({
			make: 'Volvo',
			model: 'VNL',
			truckPlate: 'TRK 9',
			trailerPlateA: 'TRL 9',
			trailerPlateB: undefined,
		})
		expect(result.summary).toContain('Started trip 5: Volvo VNL (TRK 9)')
		expect(auditMocks.recordEvents.mock.calls[0][1].details).toMatchObject({
			vehicle_id: 3,
		})
	})

	it('lets what the driver passed win over the vehicle', async () => {
		vehicleMocks.getVehicleDb.mockResolvedValue({
			...VEHICLE,
			truck_plate: null,
			trailer_plate_a: null,
			trailer_plate_b: 'B 1',
		})
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(caller, {
			...noVehicle,
			vehicle_id: 3,
			model: 'VNR',
			trailer_plate_a: 'A 2',
		})
		expect(mocks.createTripDb.mock.calls[0][0]).toMatchObject({
			make: 'Volvo',
			model: 'VNR',
			truckPlate: undefined,
			trailerPlateA: 'A 2',
			trailerPlateB: 'B 1',
		})
	})

	it("refuses a vehicle that isn't the driver's", async () => {
		vehicleMocks.getVehicleDb.mockResolvedValue(undefined)
		const result = await startTrip(caller, { ...noVehicle, vehicle_id: 9 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'vehicle_not_found' },
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it('needs a make and model without a vehicle', async () => {
		const result = await startTrip(caller, { ...noVehicle, make: 'Volvo' })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'vehicle_required' },
		})
		expect(vehicleMocks.getVehicleDb).not.toHaveBeenCalled()
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})
})

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
			null,
		)
		expect(result.summary).toBe(
			"Started trip 5: Freightliner Cascadia (ABC 1234) at 482317 km, defects: Tires, Lights. Signed with the driver's saved signature.",
		)
		expect(result.data.signing).toBe('signed')
		expect(result.data.trip_url).toBeUndefined()
		expect(result.data.warning).toBeUndefined()
	})

	it("saves the trip unsigned when the driver hasn't allowed AI signing", async () => {
		signatureMocks.getAiSigningAllowedDb.mockResolvedValue(false)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(caller, {
			...start,
			truck_plate: undefined,
		})
		expect(signatureMocks.getAiSigningAllowedDb).toHaveBeenCalledWith(
			'pat@x.com',
		)
		expect(mocks.createTripDb.mock.calls[0][2]).toBeNull()
		expect(result.isError).toBeUndefined()
		expect(result.data).toMatchObject({
			signing: 'ai_signing_off',
			trip_url: 'https://patspretrips.ca/pretrip/5',
			trip: { signed: false },
		})
		expect(result.summary).toContain(
			'Not signed: the driver hasn\'t allowed AI apps to sign for them. They can sign it themselves in the app at https://patspretrips.ca/pretrip/5, or turn on "Allow AI apps to sign for me" on the Signature page (https://patspretrips.ca/signature) and then ask you to sign it (update_trip with sign: true).',
		)
	})

	it('saves the trip unsigned before the AI signing migration has run', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		signatureMocks.getAiSigningAllowedDb.mockRejectedValue(missingColumn())
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(caller, {
			...start,
			truck_plate: undefined,
		})
		expect(mocks.createTripDb.mock.calls[0][2]).toBeNull()
		expect(result.data.signing).toBe('ai_signing_off')
		expect(error.mock.calls.length).toBeLessThanOrEqual(1)
	})

	it('fails rather than guessing when the setting cannot be read', async () => {
		signatureMocks.getAiSigningAllowedDb.mockRejectedValue(
			new Error('down'),
		)
		await expect(
			startTrip(caller, { ...start, truck_plate: undefined }),
		).rejects.toThrow('down')
		expect(mocks.createTripDb).not.toHaveBeenCalled()
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
			'Not signed: the driver has no saved signature. They can sign this trip in the app at https://patspretrips.ca/pretrip/5, or save a signature and turn on "Allow AI apps to sign for me" at https://patspretrips.ca/signature, then ask you to sign it (update_trip with sign: true).',
		)
		expect(result.data).toMatchObject({
			signing: 'no_saved_signature',
			trip_url: 'https://patspretrips.ca/pretrip/5',
		})
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
		expect(signatureMocks.getAiSigningAllowedDb).not.toHaveBeenCalled()
		expect(mocks.createTripDb.mock.calls[0][2]).toBeNull()
		expect(result.summary).toContain('Not signed, as the driver asked.')
		expect(result.data.signing).toBe('not_requested')
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
			PNG,
			'Claude',
		)
		expect(result.summary).toBe(
			"Signed trip 1 with the driver's saved signature.",
		)
		expect(result.data.trip).toMatchObject({ signed: true })
	})

	it('changes and signs a trip together', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(saved(recent({ make: 'Mack' })))
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
			data: {
				status: 'no_saved_signature',
				trip_url: 'https://patspretrips.ca/pretrip/1',
			},
		})
		expect(result.summary).toContain(
			"The driver has no saved signature, so trip 1 wasn't signed and nothing was changed.",
		)
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
		expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
	})

	it.each([
		['off', () => Promise.resolve(false)],
		['not migrated yet', () => Promise.reject(missingColumn())],
	])('refuses to sign, changing nothing, when AI signing is %s', async (_name, allowed) => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.getTripDb.mockResolvedValue(recent())
		signatureMocks.getAiSigningAllowedDb.mockImplementation(allowed)
		const result = await updateTrip(caller, {
			trip_id: 1,
			make: 'Mack',
			sign: true,
		})
		expect(result).toMatchObject({
			isError: true,
			data: {
				status: 'ai_signing_off',
				trip: { signed: false },
				trip_url: 'https://patspretrips.ca/pretrip/1',
			},
		})
		expect(result.summary).toBe(
			'The driver hasn\'t allowed AI apps to sign for them, so trip 1 wasn\'t signed and nothing was changed. They can sign it themselves in the app at https://patspretrips.ca/pretrip/1, or turn on "Allow AI apps to sign for me" on the Signature page (https://patspretrips.ca/signature) and then ask you to sign it (update_trip with sign: true).',
		)
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
		expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
	})

	it("doesn't check the AI setting when not signing", async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(saved(recent({ make: 'Mack' })))
		signatureMocks.getAiSigningAllowedDb.mockResolvedValue(false)
		const result = await updateTrip(caller, { trip_id: 1, make: 'Mack' })
		expect(result.isError).toBeUndefined()
		expect(signatureMocks.getAiSigningAllowedDb).not.toHaveBeenCalled()
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
		mocks.updateTripDb.mockResolvedValue(
			saved(
				recent({ defects: 'Cab, Tires', make: 'Mack' }),
				recent({ defects: 'Cab' }),
			),
		)
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
			addDefects: 'Tires',
			addRemarks: 'Flat on route',
		})
		expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()
		expect(result.summary).toBe('Updated trip 1.')
	})

	describe('on a signed trip', () => {
		const signedTrip = (over = {}) =>
			recent({ signed_at: new Date('2026-11-12T08:01:00Z'), ...over })

		it('refuses to change a core field, changing nothing', async () => {
			mocks.getTripDb.mockResolvedValue(signedTrip())
			const result = await updateTrip(caller, {
				trip_id: 1,
				odometer: 1200,
				truck_plate: 'NEW',
				make: 'Volvo',
				add_defects: ['Lights'],
			})
			expect(result).toMatchObject({
				isError: true,
				data: {
					status: 'signed_locked',
					locked_fields: LOCKED,
					attempted_fields: ['odometer', 'truck_plate'],
					trip: { signed: true, can_edit_details: false },
				},
			})
			expect(result.summary).toBe(
				`Trip 1 is signed, so odometer, truck_plate can't be changed and nothing was saved. On a signed trip ${LOCKED.join(', ')} are locked; only defects (add_defects) and remarks (add_remarks) can still be added, within 24 hours of the trip. If the signed details are wrong, the driver should start a new trip with the right ones (start_trip).`,
			)
			expect(mocks.updateTripDb).not.toHaveBeenCalled()
			expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
		})

		it.each([
			['carrier', 'Other', 'carrier'],
			['carrier_address', '2 Main St', 'carrier_address'],
			['inspection_address', '9 South St', 'inspection_address'],
			['model', 'VNR', 'model'],
			['trailer_plate_a', 'TRL9', 'trailer_plate_a'],
			['trailer_plate_b', 'TRL8', 'trailer_plate_b'],
		])('locks %s', async (field, value, name) => {
			mocks.getTripDb.mockResolvedValue(signedTrip())
			const result = await updateTrip(caller, {
				trip_id: 1,
				[field]: value,
			})
			expect(result.data).toMatchObject({
				status: 'signed_locked',
				attempted_fields: [name],
			})
			expect(mocks.updateTripDb).not.toHaveBeenCalled()
		})

		it('refuses a core change even when asked to sign too', async () => {
			mocks.getTripDb.mockResolvedValue(signedTrip())
			const result = await updateTrip(caller, {
				trip_id: 1,
				make: 'Mack',
				sign: true,
			})
			expect(result.data.status).toBe('signed_locked')
			expect(mocks.updateTripDb).not.toHaveBeenCalled()
			expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
		})

		it('still adds defects and remarks', async () => {
			mocks.getTripDb.mockResolvedValue(signedTrip({ defects: 'Cab' }))
			mocks.updateTripDb.mockResolvedValue(
				saved(signedTrip({ defects: 'Cab, Lights' }), signedTrip()),
			)
			const result = await updateTrip(caller, {
				trip_id: 1,
				add_defects: ['lights'],
				add_remarks: 'Light out on route',
			})
			expect(mocks.updateTripDb).toHaveBeenCalledWith(
				1,
				'pat@x.com',
				expect.objectContaining({
					addDefects: 'Lights',
					addRemarks: 'Light out on route',
					odometer: undefined,
					make: undefined,
				}),
			)
			expect(result.isError).toBeUndefined()
			expect(result.summary).toBe('Updated trip 1.')
			expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
		})

		it('ignores core fields resent with their signed values', async () => {
			mocks.getTripDb.mockResolvedValue(signedTrip())
			mocks.updateTripDb.mockResolvedValue(
				saved(signedTrip(), signedTrip()),
			)
			const same = {
				trip_id: 1,
				carrier: 'Acme',
				carrier_address: '1 Main St',
				inspection_address: '123 North St',
				make: 'Volvo',
				model: 'VNL',
				odometer: 1000,
				truck_plate: 'TRK1',
				trailer_plate_a: 'TRL1',
			}
			const result = await updateTrip(caller, {
				...same,
				add_remarks: 'Checked again',
			})
			expect(result.isError).toBeUndefined()
			const [, , changes] = mocks.updateTripDb.mock.calls[0]
			expect(changes).toEqual({
				carrier: undefined,
				carrierAddress: undefined,
				inspectionAddress: undefined,
				make: undefined,
				model: undefined,
				odometer: undefined,
				truckPlate: undefined,
				trailerPlateA: undefined,
				trailerPlateB: undefined,
				addDefects: undefined,
				addRemarks: 'Checked again',
			})
			// No new odometer, so no check against the truck's other trips.
			expect(mocks.getLatestTripForPlateDb).not.toHaveBeenCalled()

			mocks.updateTripDb.mockClear()
			const nothing = await updateTrip(caller, same)
			expect(nothing.data.status).toBe('no_changes')
			expect(mocks.updateTripDb).not.toHaveBeenCalled()
		})

		it('refuses when the database finds the trip was signed meanwhile', async () => {
			// Read as unsigned, signed before the update reached the database.
			mocks.getTripDb.mockResolvedValue(recent())
			mocks.updateTripDb.mockResolvedValue('signed_locked')
			const result = await updateTrip(caller, {
				trip_id: 1,
				make: 'Mack',
				sign: true,
			})
			expect(result).toMatchObject({
				isError: true,
				data: { status: 'signed_locked', locked_fields: LOCKED },
			})
			expect(result.data).not.toHaveProperty('trip')
			expect(result.data).not.toHaveProperty('attempted_fields')
			expect(result.summary).toContain(
				'Trip 1 is signed, so its details can no longer be changed and nothing was saved.',
			)
			expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
		})
	})

	it("checks a new odometer against the truck's other trips", async () => {
		mocks.getTripDb.mockResolvedValue(recent({ tripid: 1 }))
		mocks.getLatestTripForPlateDb.mockResolvedValue(
			old({ tripid: 2, odometer: 9000 }),
		)
		mocks.updateTripDb.mockResolvedValue(saved(recent()))
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
		mocks.updateTripDb.mockResolvedValue(saved(recent()))
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

	it.each([
		[
			'defects_too_long',
			{ add_defects: ['Tires'] },
			2000,
			"Trip 1's defect list can hold at most 2,000 characters in all, and adding this would pass that, so nothing was saved. Send a shorter add_defects, or start a new trip (start_trip) to record more.",
		],
		[
			'remarks_too_long',
			{ add_remarks: 'Flat on route' },
			10_000,
			"Trip 1's remarks can hold at most 10,000 characters in all, and adding this would pass that, so nothing was saved. Send a shorter add_remarks, or start a new trip (start_trip) to record more.",
		],
	])('refuses, changing nothing, when the database finds %s', async (status, add, max, summary) => {
		mocks.getTripDb.mockResolvedValue(recent({ signed_at: null }))
		mocks.updateTripDb.mockResolvedValue(status)
		const result = await updateTrip(caller, {
			trip_id: 1,
			...add,
			sign: true,
		})
		expect(result).toEqual({
			summary,
			data: {
				status,
				max_characters: max,
				trip: tripView(recent({ signed_at: null })),
			},
			isError: true,
		})
		// Refused before signing: the trip isn't signed either.
		expect(signatureMocks.signTripDb).not.toHaveBeenCalled()
		expect(ownerMocks.recordOwner).not.toHaveBeenCalled()
	})

	it('keeps the connector limits, now shared with the web form', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		await expect(
			updateTrip(caller, { trip_id: 1, add_remarks: 'x'.repeat(2001) }),
		).rejects.toThrow()
		await expect(
			updateTrip(caller, {
				trip_id: 1,
				add_defects: Array.from({ length: 31 }, (_, i) => `D${i}`),
			}),
		).rejects.toThrow()
		await expect(
			updateTrip(caller, { trip_id: 1, odometer: 10_000_001 }),
		).rejects.toThrow()
		await expect(
			updateTrip(caller, { trip_id: 1, truck_plate: 'x'.repeat(21) }),
		).rejects.toThrow()
		await expect(
			updateTrip(caller, { trip_id: 1, make: 'x'.repeat(101) }),
		).rejects.toThrow()
		await expect(
			updateTrip(caller, { trip_id: 1, carrier: 'x'.repeat(256) }),
		).rejects.toThrow()
		expect(mocks.updateTripDb).not.toHaveBeenCalled()
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
			null,
		)
		expect(result.summary).toBe(
			'1 trip in the last 24 hours; more on page 2.',
		)
		expect(result.data).toMatchObject({ has_more: true, page: 1 })
	})

	it('gives each listed trip its defects open or repaired', async () => {
		mocks.listTripsDb.mockResolvedValue({
			trips: [recent(), recent({ tripid: 2, defects: '' })],
			hasMore: false,
		})
		repairMocks.listTripRepairsDb.mockClear()
		const result = await listTrips(caller, {})
		const trips = result.data.trips as Array<Record<string, unknown>>
		expect(trips[0].defect_status).toEqual([
			{ defect: 'Cab', status: 'open', repair: null },
		])
		expect(trips[1].defect_status).toEqual([])
		expect(repairMocks.listTripRepairsDb).toHaveBeenCalledTimes(1)
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
		mocks.listTripsDb.mockClear()
		mocks.listTripsDb.mockResolvedValue({ trips: [], hasMore: false })
		const result = await listTrips(caller, { when: 'past', page: 3 })
		expect(result.summary).toBe(
			'No trips older in the personal space on page 3.',
		)
		// Only an empty first page looks in the driver's other spaces.
		expect(mocks.listTripsDb).toHaveBeenCalledTimes(1)
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

describe('recording the Clerk user on writes', () => {
	const pat = { ...caller, userId: 'user_1' }

	it('stamps a started trip and its signature', async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(pat, start)
		expect(ownerMocks.recordOwner).toHaveBeenCalledWith(
			pat,
			{ table: 'trip', tripId: 5 },
			{ table: 'trip_signature', tripId: 5 },
		)
	})

	it('stamps only the trip when it was not signed', async () => {
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(pat, start)
		expect(ownerMocks.recordOwner).toHaveBeenCalledWith(pat, {
			table: 'trip',
			tripId: 5,
		})
	})

	it('stamps an updated trip, and its signature when it was signed', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(saved(recent({ make: 'Mack' })))
		await updateTrip(pat, { trip_id: 1, make: 'Mack' })
		expect(ownerMocks.recordOwner).toHaveBeenLastCalledWith(pat, {
			table: 'trip',
			tripId: 1,
		})
		signatureMocks.signTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		await updateTrip(pat, { trip_id: 1, sign: true })
		expect(ownerMocks.recordOwner).toHaveBeenLastCalledWith(
			pat,
			{ table: 'trip', tripId: 1 },
			{ table: 'trip_signature', tripId: 1 },
		)
	})

	it('stamps nothing when the update changed nothing', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(undefined)
		await updateTrip(pat, { trip_id: 1, odometer: 2 })
		mocks.getTripDb.mockResolvedValue(undefined)
		await updateTrip(pat, { trip_id: 1, odometer: 2 })
		expect(ownerMocks.recordOwner).not.toHaveBeenCalled()
	})
})

describe('the audit trail', () => {
	const pat = { ...caller, userId: 'user_1' }

	it('records a started trip and its signing, as the AI app', async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(pat, { ...start, defects: ['tires'] })
		expect(auditMocks.recordEvents).toHaveBeenCalledTimes(1)
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(
			pat,
			{
				action: 'trip.created',
				source: 'Claude',
				tripId: 5,
				details: {
					signed: true,
					signing: 'allowed',
					defects: ['Tires'],
					remarks_length: start.remarks.length,
				},
			},
			{
				action: 'trip.signed',
				source: 'Claude',
				tripId: 5,
				details: { signature: 'saved' },
			},
		)
	})

	it('records an unsigned start without a signing, and why', async () => {
		signatureMocks.getAiSigningAllowedDb.mockResolvedValue(false)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(
			{ ...pat, client: null },
			{ ...start, truck_plate: undefined },
		)
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user_1' }),
			expect.objectContaining({
				action: 'trip.created',
				// The same name the trip's signature would have recorded.
				source: 'ai',
				details: expect.objectContaining({
					signed: false,
					signing: 'ai_signing_off',
					defects: [],
				}),
			}),
			null,
		)
	})

	it('records nothing for a start that failed', async () => {
		mocks.createTripDb.mockRejectedValue(new Error('down'))
		await expect(startTrip(pat, start)).rejects.toThrow('down')
		expect(auditMocks.recordEvents).not.toHaveBeenCalled()
	})

	it('records what an update changed, from the row the database overwrote', async () => {
		// The cached trip says 1000 km; the database had 1100 when it saved.
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(
			saved(
				recent({
					odometer: 1200,
					truckplate: 'NEW',
					defects: 'Cab, Tires',
				}),
				recent({ odometer: 1100 }),
			),
		)
		await updateTrip(pat, {
			trip_id: 1,
			odometer: 1200,
			truck_plate: 'NEW',
			add_defects: ['tires'],
			add_remarks: 'Flat on route',
		})
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(
			pat,
			{
				action: 'trip.updated',
				source: 'Claude',
				tripId: 1,
				details: {
					changed: ['odometer', 'truckPlate'],
					from: { odometer: 1100, truckPlate: 'TRK1' },
					to: { odometer: 1200, truckPlate: 'NEW' },
					defects_added: ['Tires'],
					remarks_added_length: 13,
				},
			},
			null,
		)
	})

	it('records defects added to a signed trip, and nothing for resent values', async () => {
		const signed = recent({ signed_at: NOW })
		mocks.getTripDb.mockResolvedValue(signed)
		mocks.updateTripDb.mockResolvedValue(
			saved(recent({ signed_at: NOW, defects: 'Cab, Lights' }), signed),
		)
		await updateTrip(pat, { trip_id: 1, add_defects: ['lights'] })
		expect(auditMocks.recordEvents).toHaveBeenLastCalledWith(
			pat,
			expect.objectContaining({
				action: 'trip.defects_added',
				details: { defects_added: ['Lights'] },
			}),
			null,
		)

		// Unsigned, every field resent as it was: saved, but nothing changed.
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(saved(recent()))
		await updateTrip(pat, { trip_id: 1, make: 'Volvo' })
		expect(auditMocks.recordEvents).toHaveBeenLastCalledWith(
			pat,
			null,
			null,
		)
	})

	it('records signing an existing trip with the saved signature', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		signatureMocks.signTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		await updateTrip(pat, { trip_id: 1, sign: true })
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(pat, null, {
			action: 'trip.signed',
			source: 'Claude',
			tripId: 1,
			details: { signature: 'saved' },
		})
	})

	it('records an update that was saved although signing then found the trip too old', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(saved(recent({ make: 'Mack' })))
		signatureMocks.signTripDb.mockResolvedValue(undefined)
		const result = await updateTrip(pat, {
			trip_id: 1,
			make: 'Mack',
			sign: true,
		})
		expect(result.data.status).toBe('too_old')
		expect(auditMocks.recordEvents).toHaveBeenCalledTimes(1)
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(
			pat,
			expect.objectContaining({
				action: 'trip.updated',
				details: {
					changed: ['make'],
					from: { make: 'Volvo' },
					to: { make: 'Mack' },
				},
			}),
		)
	})

	it.each([
		['signed_locked'],
		['defects_too_long'],
		['remarks_too_long'],
	])('records nothing when the database refuses (%s)', async (status) => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(status)
		await updateTrip(pat, { trip_id: 1, make: 'Mack' })
		expect(auditMocks.recordEvents).not.toHaveBeenCalled()
	})

	it('records nothing when an update is refused before the database', async () => {
		mocks.getTripDb.mockResolvedValue(recent({ signed_at: NOW }))
		await updateTrip(pat, { trip_id: 1, odometer: 5 })
		signatureMocks.getAiSigningAllowedDb.mockResolvedValue(false)
		mocks.getTripDb.mockResolvedValue(recent())
		await updateTrip(pat, { trip_id: 1, make: 'Mack', sign: true })
		mocks.getTripDb.mockResolvedValue(undefined)
		await updateTrip(pat, { trip_id: 1, make: 'Mack' })
		expect(auditMocks.recordEvents).not.toHaveBeenCalled()
	})

	it('records nothing when the trip passed 24 hours before the update', async () => {
		mocks.getTripDb.mockResolvedValue(recent())
		mocks.updateTripDb.mockResolvedValue(undefined)
		await updateTrip(pat, { trip_id: 1, odometer: 2 })
		// Nothing was saved, so the (null) event is skipped.
		expect(auditMocks.recordEvents).toHaveBeenCalledWith(pat, null)
	})
})

describe('startTrip emails the new trip', () => {
	const orgCaller = { ...caller, userId: 'user_1' }

	it("sends it like the web app does, to the space's recipients", async () => {
		const send = vi.fn(async () => {})
		emailMocks.prepareCallerAutoEmailDAL.mockResolvedValueOnce({
			recipients: 2,
			send,
		})
		const saved = recent({ tripid: 5 })
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(saved)
		const result = await startTrip(orgCaller, start)
		expect(emailMocks.prepareCallerAutoEmailDAL).toHaveBeenCalledWith(
			orgCaller,
			{ kind: 'personal' },
			'Claude',
		)
		expect(ownerMocks.afterResponse).toHaveBeenCalled()
		expect(send).toHaveBeenCalledWith(saved)
		expect(result.data.emailed_to).toBe(2)
		expect(result.summary).toContain(
			'A copy is being emailed to the 2 addresses on the Email page.',
		)
	})

	it('says one address in the singular', async () => {
		emailMocks.prepareCallerAutoEmailDAL.mockResolvedValueOnce({
			recipients: 1,
			send: vi.fn(async () => {}),
		})
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(orgCaller, start)
		expect(result.summary).toContain(
			'A copy is being emailed to the address on the Email page.',
		)
	})

	it("uses the organization's email settings in its space", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue({
			data: [
				{
					role: 'org:member',
					organization: {
						id: 'org_1',
						name: 'Acme Fleet',
						slug: null,
					},
				},
			],
		})
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		await startTrip(orgCaller, { ...start, organization_id: 'org_1' })
		expect(
			emailMocks.prepareCallerAutoEmailDAL.mock.calls[0][1],
		).toMatchObject({ kind: 'org', orgId: 'org_1' })
	})

	it('saves the trip, says nothing of email, when none goes out', async () => {
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(orgCaller, start)
		expect(result.data.emailed_to).toBe(0)
		expect(result.summary).not.toContain('email')
		expect(ownerMocks.afterResponse).not.toHaveBeenCalled()
	})

	it('still saves the trip when the email check fails', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		emailMocks.prepareCallerAutoEmailDAL.mockRejectedValueOnce(
			new Error('db down'),
		)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(orgCaller, start)
		expect(result.isError).toBeUndefined()
		expect(result.data.emailed_to).toBe(0)
		expect(error).toHaveBeenCalled()
	})
})

describe('startTrip and getTripDefaults in an organization', () => {
	const orgCaller = { ...caller, userId: 'user_1' }
	const { make: _m, model: _o, truck_plate: _t, carrier: _c, ...bare } = start
	const membership = (role: string) => ({
		data: [
			{
				role,
				organization: { id: 'org_1', name: 'Acme Fleet', slug: 'acme' },
			},
		],
	})

	it("uses the organization's vehicle and the carrier the driver confirmed", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		vehicleMocks.listOrgVehiclesOrNone.mockResolvedValue([VEHICLE])
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(recent({ tripid: 5 }))
		const result = await startTrip(orgCaller, {
			...bare,
			carrier: 'Big Haul Ltd',
			vehicle_id: 3,
			organization_id: 'org_1',
		})
		expect(result.isError).toBeUndefined()
		expect(vehicleMocks.listOrgVehiclesOrNone).toHaveBeenCalledWith('org_1')
		expect(vehicleMocks.getVehicleDb).not.toHaveBeenCalled()
		expect(mocks.createTripDb.mock.calls[0][0]).toMatchObject({
			carrier: 'Big Haul Ltd',
			make: 'Volvo',
			truckPlate: 'TRK 9',
		})
		expect(mocks.createTripDb.mock.calls[0][1]).toBe('pat@x.com')
		// The trip belongs to the organization's space (issue #89).
		expect(mocks.createTripDb.mock.calls[0][3]).toBe('org_1')
		expect(auditMocks.recordEvents.mock.calls[0][1].details).toMatchObject({
			vehicle_id: 3,
			org_id: 'org_1',
		})
	})

	it('lists only the trips started in the organization (issue #89)', async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		mocks.listTripsDb.mockResolvedValue({ trips: [], hasMore: false })
		const result = await listTrips(orgCaller, { organization_id: 'org_1' })
		expect(mocks.listTripsDb).toHaveBeenCalledWith(
			'pat@x.com',
			'current',
			1,
			10,
			'org_1',
		)
		expect(result.summary).toBe(
			'No trips in the last 24 hours in Acme Fleet.',
		)
		expect(result.data).toMatchObject({ organization_id: 'org_1' })
	})

	it('says which other spaces have trips when the personal list is empty (issue #92)', async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		mocks.listTripsDb.mockImplementation(
			async (
				_e: string,
				_w: string,
				_p: number,
				_l: number,
				org: unknown,
			) =>
				org === 'org_1'
					? { trips: [recent({ tripid: 8 })], hasMore: false }
					: { trips: [], hasMore: false },
		)
		const result = await listTrips(orgCaller, {})
		expect(result.summary).toBe(
			'No trips in the last 24 hours in the personal space. The driver does have trips in the last 24 hours elsewhere: 1 in Acme Fleet (organization_id org_1). Call list_trips again with that space before telling the driver they have none.',
		)
		expect(result.data).toMatchObject({
			trips: [],
			space: 'personal',
			elsewhere: [
				{
					space: 'organization',
					organization_id: 'org_1',
					organization_name: 'Acme Fleet',
					count: 1,
					has_more: false,
				},
			],
		})
		mocks.listTripsDb.mockReset()
	})

	it('points an empty organization list at the personal space', async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		mocks.listTripsDb.mockImplementation(
			async (
				_e: string,
				_w: string,
				_p: number,
				_l: number,
				org: unknown,
			) =>
				org === null
					? { trips: [recent()], hasMore: true }
					: { trips: [], hasMore: false },
		)
		const result = await listTrips(orgCaller, { organization_id: 'org_1' })
		expect(mocks.listTripsDb).toHaveBeenCalledTimes(2)
		expect(result.summary).toContain(
			'1+ in their personal space (no organization_id)',
		)
		expect(result.data.elsewhere).toEqual([
			{ space: 'personal', count: 1, has_more: true },
		])
		mocks.listTripsDb.mockReset()
	})

	it('still looks in the personal space when Clerk cannot be read', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		clerkMocks.getOrganizationMembershipList
			.mockResolvedValueOnce(membership('org:member'))
			.mockRejectedValueOnce(new Error('clerk down'))
		mocks.listTripsDb.mockResolvedValue({ trips: [], hasMore: false })
		const result = await listTrips(orgCaller, { organization_id: 'org_1' })
		expect(result.summary).toBe(
			'No trips in the last 24 hours in Acme Fleet.',
		)
		expect(mocks.listTripsDb).toHaveBeenLastCalledWith(
			'pat@x.com',
			'current',
			1,
			10,
			null,
		)
		expect(error).toHaveBeenCalled()
		error.mockRestore()
		mocks.listTripsDb.mockReset()
	})

	it("won't list an organization the driver isn't a member of", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		mocks.listTripsDb.mockClear()
		const result = await listTrips(orgCaller, { organization_id: 'org_2' })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_a_member' },
		})
		expect(mocks.listTripsDb).not.toHaveBeenCalled()
	})

	it("refuses an organization the driver isn't a member of", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		const result = await startTrip(orgCaller, {
			...bare,
			make: 'Volvo',
			model: 'VNL',
			organization_id: 'org_2',
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_a_member' },
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it("refuses a vehicle that isn't in the organization's fleet", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		vehicleMocks.listOrgVehiclesOrNone.mockResolvedValue([VEHICLE])
		const result = await startTrip(orgCaller, {
			...bare,
			vehicle_id: 9,
			organization_id: 'org_1',
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'vehicle_not_found' },
		})
		expect(result.summary).toBe(
			"Vehicle 9 wasn't found in Acme Fleet's fleet, so no trip was started. Use list_vehicles with the same organization_id to find the vehicle's id.",
		)
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it("refuses defaults for an organization the driver isn't in", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		const result = await getTripDefaults(orgCaller, {
			organization_id: 'org_2',
		})
		expect(result.data).toEqual({ status: 'not_a_member' })
		expect(mocks.getLatestTripDb).not.toHaveBeenCalled()
	})

	it("counts the driver's own trailers", async () => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		trailerMocks.listTrailersOrNone.mockResolvedValue([
			{ id: 1, name: null, plate: 'A' },
			{ id: 2, name: 'Van', plate: 'B' },
		])
		const result = await getTripDefaults(caller, {})
		expect(result.summary).toContain(
			'The driver has 2 saved trailers (trailers)',
		)
		expect(trailerMocks.listTrailersOrNone).toHaveBeenCalledWith(
			'pat@x.com',
		)
	})

	it("counts the driver's own carriers", async () => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		carrierMocks.listCarriersOrNone.mockResolvedValue([
			{ id: 1, name: 'Acme', address: '1 Main St' },
			{ id: 2, name: 'Bolt', address: '2 Main St' },
		])
		const result = await getTripDefaults(caller, {})
		expect(result.summary).toContain(
			'The driver has 2 saved carriers (carriers)',
		)
		expect(carrierMocks.listCarriersOrNone).toHaveBeenCalledWith(
			'pat@x.com',
		)
		expect(carrierMocks.listOrgCarriersOrNone).not.toHaveBeenCalled()
	})

	it('needs a carrier, in an organization too', async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)
		const result = await startTrip(orgCaller, {
			...bare,
			make: 'Volvo',
			model: 'VNL',
			organization_id: 'org_1',
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'carrier_required' },
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it('needs a carrier without an organization', async () => {
		const result = await startTrip(caller, {
			...bare,
			make: 'Volvo',
			model: 'VNL',
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'carrier_required' },
		})
		expect(mocks.createTripDb).not.toHaveBeenCalled()
	})

	it("suggests the organization's vehicles, trailers and carriers", async () => {
		clerkMocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:admin'),
		)
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		signatureMocks.getSavedSignatureDb.mockResolvedValue(undefined)
		vehicleMocks.listOrgVehiclesOrNone.mockResolvedValue([VEHICLE])
		trailerMocks.listOrgTrailersOrNone.mockResolvedValue([
			{ id: 4, name: null, plate: 'TRL 1' },
		])
		carrierMocks.listOrgCarriersOrNone.mockResolvedValue([
			{ id: 7, name: 'Big Haul Ltd', address: '9 Yard Rd' },
		])
		const result = await getTripDefaults(orgCaller, {
			organization_id: 'org_1',
		})
		expect(result.data).toMatchObject({
			space: 'organization',
			organization_id: 'org_1',
			organization_name: 'Acme Fleet',
			is_admin: true,
			vehicles: [{ vehicle_id: 3 }],
			trailers: [{ trailer_id: 4, name: null, plate: 'TRL 1' }],
			carriers: [
				{ carrier_id: 7, name: 'Big Haul Ltd', address: '9 Yard Rd' },
			],
		})
		expect(result.summary).toContain(
			'Acme Fleet has 1 saved carrier (carriers)',
		)
		expect(carrierMocks.listOrgCarriersOrNone).toHaveBeenCalledWith('org_1')
		expect(carrierMocks.listCarriersOrNone).not.toHaveBeenCalled()
		expect(vehicleMocks.listVehiclesOrNone).not.toHaveBeenCalled()
		// The last trip is the last one started in the organization's space.
		expect(mocks.getLatestTripDb).toHaveBeenCalledWith('pat@x.com', 'org_1')
		expect(result.summary).toContain(
			'This driver has no trips in Acme Fleet yet.',
		)
	})

	it('reads the last trip in the personal space without an organization', async () => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		await getTripDefaults(caller, {})
		expect(mocks.getLatestTripDb).toHaveBeenCalledWith('pat@x.com', null)
	})
})
