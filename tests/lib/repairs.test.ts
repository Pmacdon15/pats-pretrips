import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repair, trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	getTripDb: vi.fn(),
	listTripRepairsDb: vi.fn(),
	createRepairDb: vi.fn(),
	deleteRepairDb: vi.fn(),
	compressInvoice: vi.fn(),
	compressSignature: vi.fn(),
}))
vi.mock('@/lib/db/trips', () => ({ getTripDb: mocks.getTripDb }))
vi.mock('@/lib/db/repairs', () => ({
	listTripRepairsDb: mocks.listTripRepairsDb,
	createRepairDb: mocks.createRepairDb,
	deleteRepairDb: mocks.deleteRepairDb,
}))
vi.mock('@/lib/repairs/compress', async (original) => ({
	...(await original<typeof import('@/lib/repairs/compress')>()),
	compressInvoice: mocks.compressInvoice,
	compressSignature: mocks.compressSignature,
}))

import { FileError } from '@/lib/repairs/compress'
import { recordRepair, today, undoRepair } from '@/lib/repairs/repairs'
import { buildDefectRecord, defectStatuses } from '@/lib/repairs/status'

const details = {
	tripId: 1,
	defect: 'tires',
	mechanicName: 'Sam Wrench',
	shopName: ' ',
	invoiceNumber: 'INV-1',
	repairedOn: '2026-01-05',
}

beforeEach(() => {
	vi.useFakeTimers({ now: new Date('2026-01-06T12:00:00Z') })
	mocks.getTripDb.mockResolvedValue(trip({ defects: 'Cab, Tires' }))
	mocks.listTripRepairsDb.mockResolvedValue([])
	mocks.createRepairDb.mockImplementation(async (_e, r) =>
		repair({ defect: r.defect }),
	)
	mocks.compressInvoice.mockResolvedValue({
		bytes: Buffer.from('jpg'),
		type: 'image/jpeg',
		name: 'a.jpg',
		originalSize: 9,
	})
	mocks.compressSignature.mockResolvedValue({
		bytes: Buffer.from('png'),
		type: 'image/png',
	})
})

describe('recordRepair', () => {
	it('saves the repair under the trip’s spelling, with compressed files', async () => {
		const result = await recordRepair(
			'pat@x.com',
			details,
			{
				invoice: { bytes: new Uint8Array([1]), name: 'a.png' },
				signature: new Uint8Array([2]),
			},
			'web',
		)
		expect(result).toMatchObject({ ok: true, repair: { defect: 'Tires' } })
		expect(mocks.getTripDb).toHaveBeenCalledWith(1, 'pat@x.com')
		expect(mocks.compressInvoice).toHaveBeenCalledWith(
			new Uint8Array([1]),
			'a.png',
		)
		expect(mocks.createRepairDb).toHaveBeenCalledWith('pat@x.com', {
			tripId: 1,
			defect: 'Tires',
			repairedOn: '2026-01-05',
			mechanicName: 'Sam Wrench',
			shopName: undefined,
			invoiceNumber: 'INV-1',
			notes: undefined,
			signature: { bytes: Buffer.from('png'), type: 'image/png' },
			invoice: expect.objectContaining({ name: 'a.jpg' }),
			source: 'web',
		})
	})

	it('defaults the date to today and saves without files', async () => {
		await recordRepair(
			'pat@x.com',
			{ ...details, repairedOn: undefined },
			{},
			'AI',
		)
		expect(mocks.createRepairDb).toHaveBeenCalledWith(
			'pat@x.com',
			expect.objectContaining({
				repairedOn: '2026-01-06',
				invoice: null,
				signature: null,
			}),
		)
		expect(today()).toBe('2026-01-06')
	})

	it('checks the details', async () => {
		const bad = await recordRepair(
			'pat@x.com',
			{ ...details, mechanicName: 'x', repairedOn: '2027-01-01' },
			{},
			'web',
		)
		expect(bad).toMatchObject({ ok: false, status: 'invalid' })
		expect(bad.ok || bad.message).toMatch(/mechanic’s name/)
		expect(bad.ok || bad.message).toMatch(/future/)
		const notDate = await recordRepair(
			'pat@x.com',
			{ ...details, repairedOn: '2026-02-31x' },
			{},
			'web',
		)
		expect(notDate).toMatchObject({ status: 'invalid' })
		const notReal = await recordRepair(
			'pat@x.com',
			{ ...details, repairedOn: '2026-13-45' },
			{},
			'web',
		)
		expect(notReal.ok || notReal.message).toMatch('Not a real date')
		expect(mocks.getTripDb).not.toHaveBeenCalled()
	})

	it('needs the driver’s trip and one of its defects', async () => {
		mocks.getTripDb.mockResolvedValueOnce(undefined)
		expect(await recordRepair('pat@x.com', details, {}, 'web')).toEqual({
			ok: false,
			status: 'not_found',
			message: "Trip 1 wasn't found.",
		})

		expect(
			await recordRepair(
				'pat@x.com',
				{ ...details, defect: 'Horn' },
				{},
				'web',
			),
		).toEqual({
			ok: false,
			status: 'not_a_defect',
			message:
				'"Horn" isn\'t a defect on trip 1. Its defects are: Cab, Tires.',
			defects: ['Cab', 'Tires'],
		})

		mocks.getTripDb.mockResolvedValueOnce(trip({ defects: '' }))
		expect(
			await recordRepair('pat@x.com', details, {}, 'web'),
		).toMatchObject({
			status: 'not_a_defect',
			message: 'Trip 1 has no defects to repair.',
		})
	})

	it('repairs a defect once', async () => {
		mocks.listTripRepairsDb.mockResolvedValueOnce([
			repair({ defect: 'Tires' }),
		])
		expect(
			await recordRepair('pat@x.com', details, {}, 'web'),
		).toMatchObject({ ok: false, status: 'already_repaired' })

		// Another request got there between the check and the insert.
		mocks.createRepairDb.mockResolvedValueOnce(undefined)
		expect(
			await recordRepair('pat@x.com', details, {}, 'web'),
		).toMatchObject({ ok: false, status: 'already_repaired' })
	})

	it('says what is wrong with a file, and rethrows anything else', async () => {
		mocks.compressSignature.mockRejectedValueOnce(
			new FileError('The signature is empty.'),
		)
		expect(
			await recordRepair(
				'pat@x.com',
				details,
				{ signature: new Uint8Array() },
				'web',
			),
		).toEqual({
			ok: false,
			status: 'invalid_file',
			message: 'The signature is empty.',
		})
		mocks.compressInvoice.mockRejectedValueOnce(new Error('boom'))
		await expect(
			recordRepair(
				'pat@x.com',
				details,
				{ invoice: { bytes: new Uint8Array([1]) } },
				'web',
			),
		).rejects.toThrow('boom')
	})
})

describe('undoRepair', () => {
	it('deletes the driver’s repair', async () => {
		mocks.deleteRepairDb.mockResolvedValue({ id: 7 })
		expect(await undoRepair('pat@x.com', 7)).toEqual({ id: 7 })
		expect(mocks.deleteRepairDb).toHaveBeenCalledWith(7, 'pat@x.com')
	})

	it('ignores ids that cannot exist', async () => {
		expect(await undoRepair('pat@x.com', 0)).toBeUndefined()
		expect(await undoRepair('pat@x.com', 1.5)).toBeUndefined()
		expect(mocks.deleteRepairDb).not.toHaveBeenCalled()
	})
})

describe('defectStatuses', () => {
	it('pairs each defect with its repair', () => {
		const fixed = repair({ defect: 'tires' })
		expect(defectStatuses('Cab, Tires, None', [fixed])).toEqual([
			{ defect: 'Cab', repair: null },
			{ defect: 'Tires', repair: fixed },
		])
		expect(defectStatuses(null, [])).toEqual([])
	})
})

describe('buildDefectRecord', () => {
	it('lists open defects across trips and the repaired ones', () => {
		const trips = [
			{
				tripid: 2,
				date: '2026-01-03T00:00:00.000Z',
				truckplate: 'TRK1',
				make: 'Volvo',
				model: 'VNL',
				defects: 'Horn, Tires',
			},
			{
				tripid: 1,
				date: '2026-01-02T00:00:00.000Z',
				truckplate: null,
				make: 'Volvo',
				model: 'VNL',
				defects: 'Cab',
			},
		]
		const repaired = [
			{
				...repair({ trip_id: 2, defect: 'TIRES' }),
				trip_date: '2026-01-03T00:00:00.000Z',
				truck_plate: 'TRK1',
				make: 'Volvo',
				model: 'VNL',
			},
		]
		const record = buildDefectRecord(trips, repaired)
		expect(record.repaired).toBe(repaired)
		expect(record.open.map((d) => [d.trip_id, d.defect])).toEqual([
			[2, 'Horn'],
			[1, 'Cab'],
		])
		expect(record.open[1]).toEqual({
			trip_id: 1,
			trip_date: '2026-01-02T00:00:00.000Z',
			truck_plate: null,
			make: 'Volvo',
			model: 'VNL',
			defect: 'Cab',
		})
	})
})
