import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	listVehiclesOrNone: vi.fn(),
	createVehicleDb: vi.fn(),
	updateVehicleDb: vi.fn(),
	deleteVehicleDb: vi.fn(),
	recordEvents: vi.fn(),
}))
vi.mock('@/lib/db/vehicles', async (original) => ({
	...(await original<typeof import('@/lib/db/vehicles')>()),
	listVehiclesOrNone: mocks.listVehiclesOrNone,
	createVehicleDb: mocks.createVehicleDb,
	updateVehicleDb: mocks.updateVehicleDb,
	deleteVehicleDb: mocks.deleteVehicleDb,
}))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))

import {
	addVehicle,
	deleteVehicle,
	listVehicles,
	updateVehicle,
	vehicleView,
} from '@/mcp/vehicle-tools'

const caller = { email: 'pat@x.com', client: 'Claude', userId: 'user_1' }
const row = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: '',
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const view = {
	vehicle_id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: null,
	trailer_plate_b: null,
}

beforeEach(() => {
	mocks.listVehiclesOrNone.mockResolvedValue([row])
})

describe('vehicleView', () => {
	it('uses plain names and null for empty fields', () => {
		expect(vehicleView(row)).toEqual(view)
		expect(
			vehicleView({
				...row,
				name: '',
				truck_plate: null,
				trailer_plate_b: 'B',
			}),
		).toMatchObject({ name: null, truck_plate: null, trailer_plate_b: 'B' })
	})
})

describe('listVehicles', () => {
	it("lists the driver's vehicles", async () => {
		const result = await listVehicles(caller)
		expect(mocks.listVehiclesOrNone).toHaveBeenCalledWith('pat@x.com')
		expect(result.data).toEqual({ vehicles: [view] })
		expect(result.summary).toBe(
			'1 saved vehicle: Unit 42 (Volvo VNL) · TRK1. Pass a vehicle_id to start_trip to use one.',
		)
		mocks.listVehiclesOrNone.mockResolvedValue([row, row])
		expect((await listVehicles(caller)).summary).toMatch(
			/^2 saved vehicles/,
		)
	})

	it('says when there are none', async () => {
		mocks.listVehiclesOrNone.mockResolvedValue([])
		const result = await listVehicles(caller)
		expect(result.summary).toContain('no saved vehicles')
		expect(result.data).toEqual({ vehicles: [] })
	})
})

describe('addVehicle', () => {
	it('saves the vehicle for the caller and records it', async () => {
		mocks.createVehicleDb.mockResolvedValue(row)
		const result = await addVehicle(caller, {
			make: 'Volvo',
			model: 'VNL',
			name: 'Unit 42',
			truck_plate: 'TRK1',
		})
		expect(mocks.createVehicleDb).toHaveBeenCalledWith(caller, {
			name: 'Unit 42',
			make: 'Volvo',
			model: 'VNL',
			truckPlate: 'TRK1',
			trailerPlateA: undefined,
			trailerPlateB: undefined,
		})
		expect(result).toEqual({
			summary: 'Saved vehicle 3: Unit 42 (Volvo VNL) · TRK1.',
			data: { vehicle: view },
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'vehicle.created',
			source: 'Claude',
			details: { vehicle_id: 3 },
		})
	})

	it('refuses past the most vehicles', async () => {
		mocks.createVehicleDb.mockResolvedValue('too_many')
		const result = await addVehicle(
			{ ...caller, client: null },
			{ make: 'Volvo', model: 'VNL' },
		)
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'too_many', max_vehicles: 50 },
		})
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('needs a make and model', async () => {
		await expect(
			addVehicle(caller, { make: 'Volvo' } as never),
		).rejects.toThrow()
	})
})

describe('updateVehicle', () => {
	it('changes only the fields given and records what changed', async () => {
		mocks.updateVehicleDb.mockResolvedValue({
			vehicle: row,
			before: { ...row, name: null },
		})
		const result = await updateVehicle(
			{ ...caller, client: null },
			{ vehicle_id: 3, name: 'Unit 42', trailer_plate_b: '' },
		)
		expect(mocks.updateVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com', {
			name: 'Unit 42',
			make: undefined,
			model: undefined,
			truckPlate: undefined,
			trailerPlateA: undefined,
			trailerPlateB: '',
		})
		expect(result.data).toEqual({ vehicle: view })
		expect(result.summary).toContain('Updated vehicle 3')
		expect(mocks.recordEvents).toHaveBeenCalledWith(expect.anything(), {
			action: 'vehicle.updated',
			source: 'ai',
			details: { vehicle_id: 3, changed: ['name'] },
		})
	})

	it('needs at least one field', async () => {
		const result = await updateVehicle(caller, { vehicle_id: 3 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'no_changes' },
		})
		expect(mocks.updateVehicleDb).not.toHaveBeenCalled()
	})

	it("says when the vehicle isn't the driver's", async () => {
		mocks.updateVehicleDb.mockResolvedValue(undefined)
		const result = await updateVehicle(caller, { vehicle_id: 9, make: 'X' })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_found' },
		})
		expect(result.summary).toContain('Vehicle 9')
	})
})

describe('deleteVehicle', () => {
	it('deletes the vehicle and records it', async () => {
		mocks.deleteVehicleDb.mockResolvedValue(row)
		const result = await deleteVehicle(caller, { vehicle_id: 3 })
		expect(mocks.deleteVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(result.data).toEqual({ status: 'deleted', vehicle: view })
		expect(result.summary).toContain('Deleted vehicle 3')
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'vehicle.deleted',
			source: 'Claude',
			details: { vehicle_id: 3 },
		})
	})

	it("says when the vehicle isn't the driver's", async () => {
		mocks.deleteVehicleDb.mockResolvedValue(undefined)
		const result = await deleteVehicle(caller, { vehicle_id: 3 })
		expect(result.isError).toBe(true)
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})
})
