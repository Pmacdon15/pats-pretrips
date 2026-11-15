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
	CARRIERS_MIGRATION,
	carrierChangedFields,
	createCarrierDb,
	deleteCarrierDb,
	listCarriersDb,
	listCarriersOrNone,
	resetCarrierWarnings,
	updateCarrierDb,
} from '@/lib/db/carriers'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	resetCarrierWarnings()
})

const row = {
	id: 5,
	name: 'Acme Freight',
	address: '12 Depot Rd',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe('listCarriersDb', () => {
	it("lists the driver's carriers, cached per driver", async () => {
		sql.respond(() => [row])
		await expect(listCarriersDb('Pat@x.com')).resolves.toEqual([row])
		expect(mocks.neon).toHaveBeenCalledWith('postgres://test')
		expect(mocks.cacheTag).toHaveBeenCalledWith('carriers:pat@x.com')
		const [query] = sql.queries()
		expect(query.text).toContain('FROM pt_carriers')
		expect(query.text).toContain('WHERE driver_email = ?')
		expect(query.values).toEqual(['Pat@x.com', 50])
	})
})

describe('listCarriersOrNone', () => {
	it('answers the carriers', async () => {
		sql.respond(() => [row])
		await expect(listCarriersOrNone('pat@x.com')).resolves.toEqual([row])
	})

	it('answers none before the migration, logging it once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() =>
			Object.assign(new Error('missing'), { code: '42P01' }),
		)
		await expect(listCarriersOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listCarriersOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(1)
		expect(error.mock.calls[0][0]).toContain(CARRIERS_MIGRATION)
	})

	it('answers none on any other error, logging each', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => new Error('down'))
		await expect(listCarriersOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listCarriersOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(2)
		expect(error.mock.calls[0][0]).toBe('Carriers: could not list them:')
	})
})

describe('createCarrierDb', () => {
	it('saves the carrier, trimmed', async () => {
		sql.respond(() => [row])
		await expect(
			createCarrierDb(
				{ email: 'pat@x.com', userId: 'user_1' },
				{ name: ' Acme Freight ', address: '12 Depot Rd  ' },
			),
		).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_carriers')
		expect(query.values).toEqual([
			'pat@x.com',
			'user_1',
			'Acme Freight',
			'12 Depot Rd',
			'pat@x.com',
			50,
		])
	})

	it('answers too_many once the driver has the most allowed', async () => {
		await expect(
			createCarrierDb(
				{ email: 'pat@x.com' },
				{ name: 'A', address: 'B' },
			),
		).resolves.toBe('too_many')
		expect(sql.queries()[0].values[1]).toBeNull()
	})
})

describe('updateCarrierDb', () => {
	it('changes the carrier, and answers what it overwrote', async () => {
		sql.respond(() => [
			{
				...row,
				address: '9 Yard Ave',
				before_name: 'Acme Freight',
				before_address: '12 Depot Rd',
			},
		])
		const updated = await updateCarrierDb(5, 'pat@x.com', {
			name: 'Acme Freight',
			address: ' 9 Yard Ave ',
		})
		expect(updated).toEqual({
			carrier: { ...row, address: '9 Yard Ave' },
			before: { name: 'Acme Freight', address: '12 Depot Rd' },
		})
		const [query] = sql.queries()
		expect(query.text).toContain('FOR UPDATE')
		expect(query.values).toEqual([
			5,
			'pat@x.com',
			'Acme Freight',
			'9 Yard Ave',
			'pat@x.com',
		])
		expect(carrierChangedFields(updated as never)).toEqual(['address'])
	})

	it("answers undefined when it isn't theirs", async () => {
		await expect(
			updateCarrierDb(5, 'pat@x.com', { name: 'X', address: 'Y' }),
		).resolves.toBeUndefined()
	})
})

describe('deleteCarrierDb', () => {
	it("deletes one of the driver's carriers", async () => {
		sql.respond(() => [row])
		await expect(deleteCarrierDb(5, 'pat@x.com')).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('DELETE FROM pt_carriers')
		expect(query.values).toEqual([5, 'pat@x.com'])
	})
})
