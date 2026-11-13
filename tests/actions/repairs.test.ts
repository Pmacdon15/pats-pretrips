import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repair } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	updateTag: vi.fn(),
	recordRepair: vi.fn(),
	undoRepair: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getDriverEmail: mocks.email }))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/repairs/repairs', () => ({
	recordRepair: mocks.recordRepair,
	undoRepair: mocks.undoRepair,
}))

import { markDefectRepaired, undoDefectRepair } from '@/lib/actions/repairs'

const SIGNATURE = 'data:image/png;base64,aGk='

const form = (over: Record<string, string | File> = {}) => {
	const f = new FormData()
	const values: Record<string, string | File> = {
		tripId: '1',
		defect: 'Cab',
		mechanicName: 'Sam',
		shopName: 'Shop',
		invoiceNumber: 'INV-1',
		repairedOn: '2026-01-05',
		notes: '',
		signature: SIGNATURE,
		...over,
	}
	for (const [k, v] of Object.entries(values)) f.set(k, v)
	return f
}

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.recordRepair.mockResolvedValue({ ok: true, repair: repair() })
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('markDefectRepaired', () => {
	it('records the repair with the invoice and signature', async () => {
		const invoice = new File([new Uint8Array([1, 2])], 'bill.pdf')
		expect(await markDefectRepaired(form({ invoice }))).toEqual({
			value: repair(),
		})
		expect(mocks.recordRepair).toHaveBeenCalledWith(
			'pat@x.com',
			{
				tripId: 1,
				defect: 'Cab',
				repairedOn: '2026-01-05',
				mechanicName: 'Sam',
				shopName: 'Shop',
				invoiceNumber: 'INV-1',
				notes: '',
			},
			{
				invoice: { bytes: new Uint8Array([1, 2]), name: 'bill.pdf' },
				signature: new Uint8Array([104, 105]),
			},
			'web',
		)
		expect(mocks.updateTag).toHaveBeenCalledWith('trips:pat@x.com')
	})

	it('leaves out an empty invoice and missing fields', async () => {
		const f = form({ invoice: new File([], 'none'), repairedOn: '' })
		f.delete('defect')
		f.delete('mechanicName')
		await markDefectRepaired(f)
		const [, details, files] = mocks.recordRepair.mock.calls[0]
		expect(details).toMatchObject({
			defect: '',
			mechanicName: undefined,
			repairedOn: undefined,
		})
		expect(files.invoice).toBeNull()
	})

	it('needs a signed-in driver and a signature', async () => {
		mocks.email.mockResolvedValueOnce(null)
		expect(await markDefectRepaired(form())).toEqual({
			errorMessage: 'Must be logged in',
		})
		expect(await markDefectRepaired(form({ signature: 'nope' }))).toEqual({
			errorMessage: 'Sign in the box to confirm the repair.',
		})
		const f = form()
		f.delete('signature')
		expect(await markDefectRepaired(f)).toMatchObject({
			errorMessage: expect.stringContaining('Sign in'),
		})
		expect(mocks.recordRepair).not.toHaveBeenCalled()
	})

	it('passes on what was wrong, and hides errors', async () => {
		mocks.recordRepair.mockResolvedValueOnce({
			ok: false,
			status: 'already_repaired',
			message: 'Already repaired',
		})
		expect(await markDefectRepaired(form())).toEqual({
			errorMessage: 'Already repaired',
		})
		mocks.recordRepair.mockRejectedValueOnce(new Error('db down'))
		expect(await markDefectRepaired(form())).toEqual({
			errorMessage: 'Could not save the repair. Please try again.',
		})
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})
})

describe('undoDefectRepair', () => {
	it('removes the repair and refreshes the driver’s trips', async () => {
		mocks.undoRepair.mockResolvedValue({ id: 7, trip_id: 1, defect: 'Cab' })
		expect(await undoDefectRepair(7)).toEqual({ value: { id: 7 } })
		expect(mocks.undoRepair).toHaveBeenCalledWith('pat@x.com', 7)
		expect(mocks.updateTag).toHaveBeenCalledWith('trips:pat@x.com')
	})

	it('says when it can’t', async () => {
		mocks.email.mockResolvedValueOnce(null)
		expect(await undoDefectRepair(7)).toEqual({
			errorMessage: 'Must be logged in',
		})
		mocks.undoRepair.mockResolvedValueOnce(undefined)
		expect(await undoDefectRepair(7)).toEqual({
			errorMessage: 'That repair was not found.',
		})
		mocks.undoRepair.mockRejectedValueOnce(new Error('down'))
		expect(await undoDefectRepair(7)).toEqual({
			errorMessage: 'Could not undo the repair. Please try again.',
		})
	})
})
