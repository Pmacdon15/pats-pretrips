import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repair, trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	listTripRepairsDb: vi.fn(),
	listDriverRepairsDb: vi.fn(),
	listTripsWithDefectsDb: vi.fn(),
	recordRepair: vi.fn(),
	undoRepair: vi.fn(),
}))
vi.mock('@/lib/db/repairs', () => ({
	listTripRepairsDb: mocks.listTripRepairsDb,
	listDriverRepairsDb: mocks.listDriverRepairsDb,
	listTripsWithDefectsDb: mocks.listTripsWithDefectsDb,
}))
vi.mock('@/lib/repairs/repairs', () => ({
	recordRepair: mocks.recordRepair,
	undoRepair: mocks.undoRepair,
}))

import {
	listDefects,
	markDefectRepaired,
	repairView,
	tripDefectStatus,
	undoDefectRepair,
} from '@/mcp/repair-tools'

const caller = { email: 'pat@x.com', client: 'Claude' }
const withTrip = (over = {}) => ({
	...repair(over),
	trip_date: '2026-01-02T03:04:00.000Z',
	truck_plate: 'TRK 1',
	make: 'Volvo',
	model: 'VNL',
})

beforeEach(() => {
	vi.stubEnv('APP_URL', 'https://app.test/')
	mocks.listTripsWithDefectsDb.mockResolvedValue([
		{
			tripid: 1,
			date: '2026-01-02T03:04:00.000Z',
			truckplate: 'trk-1',
			make: 'Volvo',
			model: 'VNL',
			defects: 'Cab, Horn',
		},
		{
			tripid: 2,
			date: '2026-01-01T03:04:00.000Z',
			truckplate: null,
			make: 'Mack',
			model: 'Anthem',
			defects: 'Tires',
		},
	])
	mocks.listDriverRepairsDb.mockResolvedValue([withTrip()])
})

describe('repairView', () => {
	it('links to the files in the app', () => {
		expect(repairView(repair())).toMatchObject({
			repair_id: 7,
			signed: true,
			signature_url: 'https://app.test/api/repairs/7/signature',
			invoice_url: 'https://app.test/api/repairs/7/invoice',
			recorded_by: 'web',
		})
		expect(
			repairView(repair({ has_invoice: false, has_signature: false })),
		).toMatchObject({ signature_url: null, invoice_url: null })
	})
})

describe('tripDefectStatus', () => {
	it('shows each defect open or repaired', async () => {
		mocks.listTripRepairsDb.mockResolvedValue([repair()])
		const status = await tripDefectStatus(
			caller,
			trip({ defects: 'Cab, Horn' }),
		)
		expect(status.map((s) => [s.defect, s.status])).toEqual([
			['Cab', 'repaired'],
			['Horn', 'open'],
		])
		expect(status[0].repair?.repair_id).toBe(7)
		expect(
			await tripDefectStatus(caller, trip({ tripid: undefined })),
		).toEqual([])
	})
})

describe('listDefects', () => {
	it('lists open and repaired defects', async () => {
		const result = await listDefects(caller, {})
		expect(result.summary).toBe(
			'2 open defects and 1 repaired defect. Use mark_defect_repaired once one is fixed.',
		)
		expect(result.data.open_count).toBe(2)
		expect(
			(result.data.open as { defect: string }[]).map((d) => d.defect),
		).toEqual(['Horn', 'Tires'])
		expect(result.data.repaired_count).toBe(1)
	})

	it('filters by status and truck', async () => {
		const open = await listDefects(caller, {
			status: 'open',
			truck_plate: 'TRK1',
		})
		expect(open.summary).toBe(
			'1 open defect in TRK1. Use mark_defect_repaired once one is fixed.',
		)
		expect(open.data.repaired).toBeUndefined()

		const repaired = await listDefects(caller, { status: 'repaired' })
		expect(repaired.summary).toBe('1 repaired defect.')
		expect(repaired.data.open).toBeUndefined()

		mocks.listDriverRepairsDb.mockResolvedValue([])
		mocks.listTripsWithDefectsDb.mockResolvedValue([])
		expect((await listDefects(caller, {})).summary).toBe(
			'0 open defects and 0 repaired defects.',
		)
	})
})

describe('markDefectRepaired', () => {
	it('records the repair from base64 files', async () => {
		mocks.recordRepair.mockResolvedValue({ ok: true, repair: repair() })
		const result = await markDefectRepaired(caller, {
			trip_id: 1,
			defect: 'Cab',
			mechanic_name: 'Sam Wrench',
			invoice_number: 'INV-1',
			invoice_base64: 'aGVsbG8=',
			invoice_filename: 'bill.jpg',
			signature_base64: 'data:image/png;base64,aGk=',
		})
		expect(result.summary).toBe(
			'Marked Cab on trip 1 repaired on 2026-01-05 by Sam Wrench: invoice INV-1, invoice file saved (2 KB, compressed from 8 KB), signed.',
		)
		expect(mocks.recordRepair).toHaveBeenCalledWith(
			'pat@x.com',
			expect.objectContaining({ tripId: 1, mechanicName: 'Sam Wrench' }),
			{
				invoice: {
					bytes: new Uint8Array(Buffer.from('hello')),
					name: 'bill.jpg',
				},
				signature: new Uint8Array([104, 105]),
			},
			'AI: Claude',
		)
	})

	it('works without files or a client name', async () => {
		mocks.recordRepair.mockResolvedValue({
			ok: true,
			repair: repair({
				invoice_number: null,
				has_invoice: false,
				has_signature: false,
			}),
		})
		const result = await markDefectRepaired(
			{ ...caller, client: null },
			{ trip_id: 1, defect: 'Cab', mechanic_name: 'Sam' },
		)
		expect(result.summary).toBe(
			'Marked Cab on trip 1 repaired on 2026-01-05 by Sam Wrench: no signature.',
		)
		expect(mocks.recordRepair.mock.calls[0][2]).toEqual({
			invoice: null,
			signature: null,
		})
		expect(mocks.recordRepair.mock.calls[0][3]).toBe('AI assistant')

		mocks.recordRepair.mockResolvedValue({
			ok: true,
			repair: repair({ invoice_original_size: 1000 }),
		})
		expect(
			(
				await markDefectRepaired(caller, {
					trip_id: 1,
					defect: 'Cab',
					mechanic_name: 'Sam',
				})
			).summary,
		).toContain('invoice file saved (2 KB)')
	})

	it('answers errors with their status', async () => {
		mocks.recordRepair.mockResolvedValue({
			ok: false,
			status: 'not_a_defect',
			message: 'Not a defect',
			defects: ['Cab'],
		})
		expect(
			await markDefectRepaired(caller, {
				trip_id: 1,
				defect: 'Horn',
				mechanic_name: 'Sam',
			}),
		).toEqual({
			summary: 'Not a defect',
			data: { status: 'not_a_defect', defects: ['Cab'] },
			isError: true,
		})
		mocks.recordRepair.mockResolvedValue({
			ok: false,
			status: 'not_found',
			message: 'Gone',
		})
		expect(
			(
				await markDefectRepaired(caller, {
					trip_id: 1,
					defect: 'Horn',
					mechanic_name: 'Sam',
				})
			).data,
		).toEqual({ status: 'not_found' })
	})

	it('refuses a file that isn’t base64', async () => {
		const result = await markDefectRepaired(caller, {
			trip_id: 1,
			defect: 'Cab',
			mechanic_name: 'Sam',
			signature_base64: 'not base64 at all!',
		})
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'invalid_file' },
		})
		expect(mocks.recordRepair).not.toHaveBeenCalled()
	})

	it('rethrows unexpected errors', async () => {
		vi.resetModules()
		vi.doMock('@/lib/repairs/compress', async (original) => ({
			...(await original<typeof import('@/lib/repairs/compress')>()),
			fromBase64: () => {
				throw new Error('boom')
			},
		}))
		const fresh = await import('@/mcp/repair-tools')
		await expect(
			fresh.markDefectRepaired(caller, {
				trip_id: 1,
				defect: 'Cab',
				mechanic_name: 'Sam',
				invoice_base64: 'aGVsbG8=',
			}),
		).rejects.toThrow('boom')
		vi.doUnmock('@/lib/repairs/compress')
		vi.resetModules()
	})
})

describe('undoDefectRepair', () => {
	it('reopens the defect', async () => {
		mocks.undoRepair.mockResolvedValue({ id: 7, trip_id: 1, defect: 'Cab' })
		expect(await undoDefectRepair(caller, { repair_id: 7 })).toEqual({
			summary:
				'Undid the repair of Cab on trip 1; it shows as open again.',
			data: { status: 'undone', id: 7, trip_id: 1, defect: 'Cab' },
		})
		expect(mocks.undoRepair).toHaveBeenCalledWith('pat@x.com', 7)
	})

	it('says when it isn’t found', async () => {
		mocks.undoRepair.mockResolvedValue(undefined)
		expect(await undoDefectRepair(caller, { repair_id: 7 })).toMatchObject({
			isError: true,
			data: { status: 'not_found' },
		})
	})
})
