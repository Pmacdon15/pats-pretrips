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
	createVehicleDb,
	deleteVehicleDb,
	getVehicleDb,
	listVehiclesDb,
	listVehiclesOrNone,
	resetVehicleWarnings,
	updateVehicleDb,
	VEHICLES_MIGRATION,
	vehicleChangedFields,
	vehicleLabel,
} from '@/lib/db/vehicles'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	resetVehicleWarnings()
})

const row = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: null,
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe('listVehiclesDb', () => {
	it("lists the driver's vehicles, cached per driver", async () => {
		sql.respond(() => [row])
		await expect(listVehiclesDb('Pat@x.com')).resolves.toEqual([row])
		expect(mocks.neon).toHaveBeenCalledWith('postgres://test')
		expect(mocks.cacheTag).toHaveBeenCalledWith('vehicles:pat@x.com')
		const [query] = sql.queries()
		expect(query.text).toContain('FROM pt_vehicles')
		expect(query.text).toContain('WHERE driver_email = ?')
		expect(query.values).toEqual(['Pat@x.com', 50])
	})
})

describe('listVehiclesOrNone', () => {
	it('answers the vehicles', async () => {
		sql.respond(() => [row])
		await expect(listVehiclesOrNone('pat@x.com')).resolves.toEqual([row])
	})

	it('answers none before the migration, logging it once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() =>
			Object.assign(new Error('missing'), { code: '42P01' }),
		)
		await expect(listVehiclesOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listVehiclesOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(1)
		expect(error.mock.calls[0][0]).toContain(VEHICLES_MIGRATION)
	})

	it('answers none on any other error, logging each', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => new Error('down'))
		await expect(listVehiclesOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listVehiclesOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(2)
		expect(error.mock.calls[0][0]).toBe('Vehicles: could not list them:')
	})
})

describe('getVehicleDb', () => {
	it("reads one of the driver's vehicles", async () => {
		sql.respond(() => [row])
		await expect(getVehicleDb(3, 'pat@x.com')).resolves.toEqual(row)
		expect(sql.queries()[0].values).toEqual([3, 'pat@x.com'])
	})

	it("answers undefined when it isn't theirs", async () => {
		await expect(getVehicleDb(3, 'pat@x.com')).resolves.toBeUndefined()
	})
})

describe('createVehicleDb', () => {
	it('saves the vehicle, trimmed, with empty fields as NULL', async () => {
		sql.respond(() => [row])
		await expect(
			createVehicleDb(
				{ email: 'pat@x.com', userId: 'user_1' },
				{
					name: '  ',
					make: ' Volvo ',
					model: 'VNL',
					truckPlate: ' TRK1 ',
					trailerPlateA: '',
				},
			),
		).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_vehicles')
		expect(query.values).toEqual([
			'pat@x.com',
			'user_1',
			null,
			'Volvo',
			'VNL',
			'TRK1',
			null,
			null,
			'pat@x.com',
			50,
		])
	})

	it('answers too_many once the driver has the most allowed', async () => {
		await expect(
			createVehicleDb({ email: 'pat@x.com' }, { make: 'A', model: 'B' }),
		).resolves.toBe('too_many')
		expect(sql.queries()[0].values[1]).toBeNull()
	})
})

describe('updateVehicleDb', () => {
	it('changes only the fields given, and answers what it overwrote', async () => {
		sql.respond(() => [
			{
				...row,
				name: null,
				before_name: 'Unit 42',
				before_make: 'Volvo',
				before_model: 'VNL',
				before_truck_plate: 'TRK1',
				before_trailer_plate_a: null,
				before_trailer_plate_b: null,
			},
		])
		const updated = await updateVehicleDb(3, 'pat@x.com', {
			name: '',
			model: 'VNR',
		})
		expect(updated).toEqual({
			vehicle: { ...row, name: null },
			before: {
				name: 'Unit 42',
				make: 'Volvo',
				model: 'VNL',
				truck_plate: 'TRK1',
				trailer_plate_a: null,
				trailer_plate_b: null,
			},
		})
		const [query] = sql.queries()
		expect(query.text).toContain('FOR UPDATE')
		expect(query.values).toEqual([
			3,
			'pat@x.com',
			true,
			null,
			null,
			'VNR',
			false,
			null,
			false,
			null,
			false,
			null,
			'pat@x.com',
		])
		expect(vehicleChangedFields(updated as never)).toEqual(['name'])
	})

	it("answers undefined when it isn't theirs", async () => {
		await expect(
			updateVehicleDb(3, 'pat@x.com', { make: 'X' }),
		).resolves.toBeUndefined()
	})
})

describe('vehicleChangedFields', () => {
	it('names the fields whose value changed', () => {
		expect(
			vehicleChangedFields({
				vehicle: { ...row, make: 'Mack', trailer_plate_b: 'B' },
				before: { ...row, trailer_plate_b: undefined as never },
			}),
		).toEqual(['make', 'trailer_plate_b'])
	})
})

describe('deleteVehicleDb', () => {
	it("deletes one of the driver's vehicles", async () => {
		sql.respond(() => [row])
		await expect(deleteVehicleDb(3, 'pat@x.com')).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('DELETE FROM pt_vehicles')
		expect(query.values).toEqual([3, 'pat@x.com'])
	})
})

describe('vehicleLabel', () => {
	it('reads as the driver names it', () => {
		expect(vehicleLabel(row)).toBe('Unit 42 (Volvo VNL) · TRK1')
		expect(vehicleLabel({ ...row, name: null, truck_plate: null })).toBe(
			'Volvo VNL',
		)
	})
})
