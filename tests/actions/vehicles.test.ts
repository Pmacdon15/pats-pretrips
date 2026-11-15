import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	updateTag: vi.fn(),
	fetchVehiclesDAL: vi.fn(),
	addVehicleDAL: vi.fn(),
	updateVehicleDAL: vi.fn(),
	deleteVehicleDAL: vi.fn(),
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/DAL/vehicles', () => ({
	fetchVehiclesDAL: mocks.fetchVehiclesDAL,
	addVehicleDAL: mocks.addVehicleDAL,
	updateVehicleDAL: mocks.updateVehicleDAL,
	deleteVehicleDAL: mocks.deleteVehicleDAL,
}))

import {
	addVehicle,
	deleteVehicle,
	getVehicles,
	updateVehicle,
} from '@/lib/actions/vehicles'

const row = { id: 3, make: 'Volvo', model: 'VNL' }
const saved = okAsync({ vehicle: row, email: 'Pat@x.com' })

beforeEach(() => {
	mocks.fetchVehiclesDAL.mockResolvedValue([row])
})

describe('vehicle actions', () => {
	it('lists the vehicles', async () => {
		await expect(getVehicles()).resolves.toEqual([row])
	})

	it.each([
		[
			'addVehicle',
			mocks.addVehicleDAL,
			() => addVehicle({ make: 'Volvo' }),
		],
		['updateVehicle', mocks.updateVehicleDAL, () => updateVehicle(3, {})],
		['deleteVehicle', mocks.deleteVehicleDAL, () => deleteVehicle(3)],
	])('%s answers the vehicle and clears the cached list', async (_n, dal, call) => {
		dal.mockReturnValue(saved)
		await expect(call()).resolves.toEqual({ value: row })
		expect(mocks.updateTag).toHaveBeenCalledWith('vehicles:pat@x.com')
	})

	it('answers why not, clearing nothing', async () => {
		mocks.addVehicleDAL.mockReturnValue(errAsync({ reason: 'Nope' }))
		await expect(addVehicle({})).resolves.toEqual({ errorMessage: 'Nope' })
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})

	it('passes the id and fields on', async () => {
		mocks.updateVehicleDAL.mockReturnValue(saved)
		mocks.deleteVehicleDAL.mockReturnValue(saved)
		await updateVehicle(3, { make: 'X' })
		await deleteVehicle(4)
		expect(mocks.updateVehicleDAL).toHaveBeenCalledWith(3, { make: 'X' })
		expect(mocks.deleteVehicleDAL).toHaveBeenCalledWith(4)
	})
})
