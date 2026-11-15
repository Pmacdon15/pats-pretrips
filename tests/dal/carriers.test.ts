import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	rateLimit: vi.fn(),
	recordEvents: vi.fn(),
	listCarriersOrNone: vi.fn(),
	createCarrierDb: vi.fn(),
	updateCarrierDb: vi.fn(),
	deleteCarrierDb: vi.fn(),
}))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimit: mocks.rateLimit,
}))
// `email` stands in for the signed-in driver's email (null when signed out).
vi.mock('@/lib/auth', () => ({
	getDriverEmail: mocks.email,
	getDriver: async () => {
		const email = await mocks.email()
		return email
			? { userId: 'user_1', email, givenName: null, familyName: null }
			: null
	},
}))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))
vi.mock('@/lib/db/carriers', async (original) => ({
	...(await original<typeof import('@/lib/db/carriers')>()),
	listCarriersOrNone: mocks.listCarriersOrNone,
	createCarrierDb: mocks.createCarrierDb,
	updateCarrierDb: mocks.updateCarrierDb,
	deleteCarrierDb: mocks.deleteCarrierDb,
}))

import {
	addCarrierDAL,
	deleteCarrierDAL,
	fetchCarriersDAL,
	TOO_MANY_CARRIERS,
	updateCarrierDAL,
} from '@/lib/DAL/carriers'

const driver = {
	userId: 'user_1',
	email: 'pat@x.com',
	givenName: null,
	familyName: null,
}
const row = {
	id: 5,
	name: 'Acme Freight',
	address: '12 Depot Rd',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const form = { name: 'Acme Freight', address: '12 Depot Rd' }

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.rateLimit.mockResolvedValue({ ok: true })
})

describe('fetchCarriersDAL', () => {
	it("lists the driver's carriers", async () => {
		mocks.listCarriersOrNone.mockResolvedValue([row])
		await expect(fetchCarriersDAL()).resolves.toEqual([row])
		expect(mocks.listCarriersOrNone).toHaveBeenCalledWith('pat@x.com')
	})

	it('lists none when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		await expect(fetchCarriersDAL()).resolves.toEqual([])
		expect(mocks.listCarriersOrNone).not.toHaveBeenCalled()
	})
})

describe('writes', () => {
	it.each([
		['add', () => addCarrierDAL(form)],
		['update', () => updateCarrierDAL(5, form)],
		['delete', () => deleteCarrierDAL(5)],
	])('%s needs a signed-in driver under the limit', async (_name, call) => {
		mocks.email.mockResolvedValue(null)
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
		mocks.email.mockResolvedValue('pat@x.com')
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 60 })
		expect((await call())._unsafeUnwrapErr().reason).toContain(
			'Too many requests',
		)
		expect(mocks.rateLimit.mock.calls[0][0].name).toBe('carrier-writes')
	})

	it.each([
		['update', () => updateCarrierDAL(0, form)],
		['delete', () => deleteCarrierDAL(1.5)],
	])("%s refuses an id that can't be a carrier", async (_name, call) => {
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'That carrier was not found.',
		})
	})
})

describe('addCarrierDAL', () => {
	it('saves the carrier and records it', async () => {
		mocks.createCarrierDb.mockResolvedValue(row)
		const result = await addCarrierDAL(form)
		expect(result._unsafeUnwrap()).toEqual({
			carrier: row,
			email: 'pat@x.com',
		})
		expect(mocks.createCarrierDb).toHaveBeenCalledWith(driver, form)
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'carrier.created',
			source: 'web',
			details: { carrier_id: 5 },
		})
	})

	it('explains bad input', async () => {
		const noName = await addCarrierDAL({ ...form, name: ' ' })
		expect(noName._unsafeUnwrapErr()).toEqual({
			reason: 'Carrier name is required',
		})
		const noAddress = await addCarrierDAL({ ...form, address: '' })
		expect(noAddress._unsafeUnwrapErr()).toEqual({
			reason: 'Carrier address is required',
		})
		const odd = await addCarrierDAL(null)
		expect(odd._unsafeUnwrapErr().reason).toBeTruthy()
		expect(mocks.createCarrierDb).not.toHaveBeenCalled()
	})

	it('falls back to a general message when no issue explains it', async () => {
		const { schemaCarrier } = await import('@/lib/ZOD/schemas')
		vi.spyOn(schemaCarrier, 'safeParse').mockReturnValueOnce({
			success: false,
			error: { issues: [] },
		} as never)
		const result = await addCarrierDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Check the carrier details.',
		})
	})

	it('refuses past the most carriers', async () => {
		mocks.createCarrierDb.mockResolvedValue('too_many')
		const result = await addCarrierDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({ reason: TOO_MANY_CARRIERS })
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.createCarrierDb.mockRejectedValue(new Error('down'))
		const result = await addCarrierDAL(form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('updateCarrierDAL', () => {
	it('saves the carrier and records what changed', async () => {
		mocks.updateCarrierDb.mockResolvedValue({
			carrier: row,
			before: { ...row, address: '9 Yard Ave' },
		})
		const result = await updateCarrierDAL(5, form)
		expect(result._unsafeUnwrap()).toEqual({
			carrier: row,
			email: 'pat@x.com',
		})
		expect(mocks.updateCarrierDb).toHaveBeenCalledWith(5, 'pat@x.com', form)
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'carrier.updated',
			source: 'web',
			details: { carrier_id: 5, changed: ['address'] },
		})
	})

	it("refuses a carrier that isn't the driver's, or bad input", async () => {
		mocks.updateCarrierDb.mockResolvedValue(undefined)
		expect((await updateCarrierDAL(5, form))._unsafeUnwrapErr()).toEqual({
			reason: 'That carrier was not found.',
		})
		expect(
			(
				await updateCarrierDAL(5, { ...form, address: '' })
			)._unsafeUnwrapErr(),
		).toEqual({ reason: 'Carrier address is required' })
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.updateCarrierDb.mockRejectedValue(new Error('down'))
		const result = await updateCarrierDAL(5, form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('deleteCarrierDAL', () => {
	it('deletes the carrier and records it', async () => {
		mocks.deleteCarrierDb.mockResolvedValue(row)
		const result = await deleteCarrierDAL(5)
		expect(result._unsafeUnwrap()).toEqual({
			carrier: row,
			email: 'pat@x.com',
		})
		expect(mocks.deleteCarrierDb).toHaveBeenCalledWith(5, 'pat@x.com')
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'carrier.deleted',
			source: 'web',
			details: { carrier_id: 5 },
		})
	})

	it("refuses a carrier that isn't the driver's", async () => {
		mocks.deleteCarrierDb.mockResolvedValue(undefined)
		expect((await deleteCarrierDAL(5))._unsafeUnwrapErr()).toEqual({
			reason: 'That carrier was not found.',
		})
	})

	it('says it could not delete on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.deleteCarrierDb.mockRejectedValue(new Error('down'))
		const result = await deleteCarrierDAL(5)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not delete')
	})
})
