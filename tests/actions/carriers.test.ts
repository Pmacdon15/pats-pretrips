import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	updateTag: vi.fn(),
	fetchCarriersDAL: vi.fn(),
	addCarrierDAL: vi.fn(),
	updateCarrierDAL: vi.fn(),
	deleteCarrierDAL: vi.fn(),
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/DAL/carriers', () => ({
	fetchCarriersDAL: mocks.fetchCarriersDAL,
	addCarrierDAL: mocks.addCarrierDAL,
	updateCarrierDAL: mocks.updateCarrierDAL,
	deleteCarrierDAL: mocks.deleteCarrierDAL,
}))

import {
	addCarrier,
	deleteCarrier,
	getCarriers,
	updateCarrier,
} from '@/lib/actions/carriers'

const row = { id: 5, name: 'Acme', address: '12 Depot Rd' }
const saved = okAsync({ carrier: row, email: 'Pat@x.com', orgId: null })

beforeEach(() => {
	mocks.fetchCarriersDAL.mockResolvedValue([row])
})

describe('carrier actions', () => {
	it('lists the carriers', async () => {
		await expect(getCarriers()).resolves.toEqual([row])
	})

	it.each([
		['addCarrier', mocks.addCarrierDAL, () => addCarrier({ name: 'Acme' })],
		['updateCarrier', mocks.updateCarrierDAL, () => updateCarrier(3, {})],
		['deleteCarrier', mocks.deleteCarrierDAL, () => deleteCarrier(3)],
	])('%s answers the carrier and clears the cached list', async (_n, dal, call) => {
		dal.mockReturnValue(saved)
		await expect(call()).resolves.toEqual({ value: row })
		expect(mocks.updateTag).toHaveBeenCalledWith('carriers:pat@x.com')
	})

	it("clears an organization's list, not the driver's, for a change in it", async () => {
		mocks.addCarrierDAL.mockReturnValue(
			okAsync({ carrier: row, email: 'Pat@x.com', orgId: 'org_1' }),
		)
		await expect(addCarrier({})).resolves.toEqual({ value: row })
		expect(mocks.updateTag.mock.calls).toEqual([['org-carriers:org_1']])
	})

	it('answers why not, clearing nothing', async () => {
		mocks.addCarrierDAL.mockReturnValue(errAsync({ reason: 'Nope' }))
		await expect(addCarrier({})).resolves.toEqual({ errorMessage: 'Nope' })
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})

	it('passes the id and fields on', async () => {
		mocks.updateCarrierDAL.mockReturnValue(saved)
		mocks.deleteCarrierDAL.mockReturnValue(saved)
		await updateCarrier(3, { name: 'X' })
		await deleteCarrier(4)
		expect(mocks.updateCarrierDAL).toHaveBeenCalledWith(3, { name: 'X' })
		expect(mocks.deleteCarrierDAL).toHaveBeenCalledWith(4)
	})
})
