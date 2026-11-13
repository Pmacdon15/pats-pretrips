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
	createRepairDb,
	deleteRepairDb,
	getRepairFileDb,
	listDriverRepairsDb,
	listTripRepairsDb,
	listTripsWithDefectsDb,
} from '@/lib/db/repairs'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

const row = (over: Record<string, unknown> = {}) => ({
	id: 7,
	trip_id: 1,
	defect: 'Cab',
	repaired_on: new Date('2026-01-05T00:00:00Z'),
	mechanic_name: 'Sam',
	shop_name: null,
	invoice_number: 'INV-1',
	notes: null,
	has_signature: true,
	has_invoice: false,
	invoice_type: null,
	invoice_name: null,
	invoice_size: null,
	invoice_original_size: null,
	source: 'web',
	created_at: '2026-01-05T10:00:00Z',
	...over,
})

describe('createRepairDb', () => {
	it('saves files as hex for one of the driver’s own trips', async () => {
		sql.respond(() => [row()])
		const result = await createRepairDb('pat@x.com', {
			tripId: 1,
			defect: 'Cab',
			repairedOn: '2026-01-05',
			mechanicName: 'Sam',
			invoiceNumber: 'INV-1',
			signature: { bytes: Buffer.from([0xab, 0xcd]), type: 'image/png' },
			invoice: {
				bytes: Buffer.from([1, 2, 3]),
				type: 'image/jpeg',
				name: 'a.jpg',
				originalSize: 10,
			},
			source: 'web',
		})
		const [call] = sql.queries()
		expect(call.text).toContain('INSERT INTO pt_defect_repairs')
		expect(call.text).toContain('ON CONFLICT DO NOTHING')
		expect(call.text).toContain('t.driverEmail = ?')
		expect(call.values).toContain('abcd')
		expect(call.values).toContain('010203')
		expect(call.values).toContain('pat@x.com')
		expect(result).toEqual({
			id: 7,
			trip_id: 1,
			defect: 'Cab',
			repaired_on: '2026-01-05',
			mechanic_name: 'Sam',
			shop_name: null,
			invoice_number: 'INV-1',
			notes: null,
			has_signature: true,
			has_invoice: false,
			invoice_type: null,
			invoice_name: null,
			invoice_size: null,
			invoice_original_size: null,
			source: 'web',
			created_at: '2026-01-05T10:00:00.000Z',
		})
	})

	it('saves nulls without files and is undefined when nothing was saved', async () => {
		const result = await createRepairDb('pat@x.com', {
			tripId: 1,
			defect: 'Cab',
			repairedOn: '2026-01-05',
			shopName: 'Highway Truck',
			source: 'AI',
		})
		expect(result).toBeUndefined()
		expect(sql.queries()[0].values.filter((v) => v === null)).toHaveLength(
			10,
		)
	})
})

describe('listTripRepairsDb', () => {
	it('lists a trip’s repairs, tagged with the driver’s trips', async () => {
		sql.respond(() => [
			row({
				repaired_on: '2026-01-05',
				invoice_size: '20',
				invoice_original_size: '40',
				source: undefined,
				shop_name: undefined,
				invoice_number: undefined,
				notes: undefined,
				invoice_type: undefined,
				invoice_name: undefined,
				mechanic_name: null,
			}),
		])
		const [r] = await listTripRepairsDb(1, 'Pat@x.com')
		expect(r).toMatchObject({
			repaired_on: '2026-01-05',
			invoice_size: 20,
			invoice_original_size: 40,
			source: 'web',
			shop_name: null,
			invoice_number: null,
			notes: null,
			invoice_type: null,
			invoice_name: null,
			mechanic_name: null,
		})
		expect(mocks.cacheTag).toHaveBeenCalledWith('trips:pat@x.com')
		expect(sql.queries()[0].values).toEqual([1, 'Pat@x.com'])
	})
})

describe('listDriverRepairsDb', () => {
	it('lists the driver’s repairs with their trips', async () => {
		sql.respond(() => [
			row({
				trip_date: '2026-01-02T03:04:00Z',
				truck_plate: '',
				make: 'Volvo',
				model: 'VNL',
			}),
		])
		const [r] = await listDriverRepairsDb('pat@x.com')
		expect(r).toMatchObject({
			trip_date: '2026-01-02T03:04:00.000Z',
			truck_plate: null,
			make: 'Volvo',
			model: 'VNL',
		})
		expect(sql.queries()[0].values).toEqual(['pat@x.com', 500])
		await listDriverRepairsDb('pat@x.com', 5)
		expect(sql.queries()[1].values).toEqual(['pat@x.com', 5])
	})
})

describe('listTripsWithDefectsDb', () => {
	it('lists the driver’s trips that have defects', async () => {
		sql.respond(() => [
			{
				tripid: '3',
				date: '2026-01-02T03:04:00Z',
				truckplate: null,
				make: 'Volvo',
				model: 'VNL',
				defects: null,
			},
		])
		expect(await listTripsWithDefectsDb('pat@x.com')).toEqual([
			{
				tripid: 3,
				date: '2026-01-02T03:04:00.000Z',
				truckplate: null,
				make: 'Volvo',
				model: 'VNL',
				defects: '',
			},
		])
		expect(sql.queries()[0].text).toContain("COALESCE(defects, '') <> ''")
		await listTripsWithDefectsDb('pat@x.com', 5)
		expect(sql.queries()[1].values).toEqual(['pat@x.com', 5])
	})
})

describe('getRepairFileDb', () => {
	it('reads the invoice or the signature', async () => {
		sql.respond(() => [
			{ data: 'aGk=\n', type: 'image/jpeg', name: 'a.jpg' },
		])
		expect(await getRepairFileDb(7, 'pat@x.com', 'invoice')).toEqual({
			bytes: Buffer.from('hi'),
			type: 'image/jpeg',
			name: 'a.jpg',
		})
		expect(sql.queries()[0].text).toContain('encode(invoice')

		sql.respond(() => [{ data: 'aGk=', type: null, name: undefined }])
		expect(await getRepairFileDb(7, 'pat@x.com', 'signature')).toEqual({
			bytes: Buffer.from('hi'),
			type: 'application/octet-stream',
			name: null,
		})
		expect(sql.queries()[1].text).toContain('encode(signature')
	})

	it('is undefined without a file', async () => {
		expect(await getRepairFileDb(7, 'pat@x.com', 'invoice')).toBeUndefined()
		sql.respond(() => [{ data: null }])
		expect(
			await getRepairFileDb(7, 'pat@x.com', 'signature'),
		).toBeUndefined()
	})
})

describe('deleteRepairDb', () => {
	it('deletes only the driver’s repair', async () => {
		sql.respond(() => [{ id: '7', trip_id: '1', defect: 'Cab' }])
		expect(await deleteRepairDb(7, 'pat@x.com')).toEqual({
			id: 7,
			trip_id: 1,
			defect: 'Cab',
		})
		expect(sql.queries()[0].values).toEqual([7, 'pat@x.com'])
		sql.respond(() => [])
		expect(await deleteRepairDb(7, 'pat@x.com')).toBeUndefined()
	})
})
