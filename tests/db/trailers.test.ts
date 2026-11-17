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
	createTrailerDb,
	deleteTrailerDb,
	listTrailersDb,
	listTrailersOrNone,
	resetTrailerWarnings,
	TRAILERS_MIGRATION,
	trailerChangedFields,
	updateTrailerDb,
} from '@/lib/db/trailers'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
	resetTrailerWarnings()
})

const row = {
	id: 5,
	name: 'Dry van',
	plate: 'TR 123',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}

describe('listTrailersDb', () => {
	it("lists the driver's trailers, cached per driver", async () => {
		sql.respond(() => [row])
		await expect(listTrailersDb('Pat@x.com')).resolves.toEqual([row])
		expect(mocks.neon).toHaveBeenCalledWith('postgres://test')
		expect(mocks.cacheTag).toHaveBeenCalledWith('trailers:pat@x.com')
		const [query] = sql.queries()
		expect(query.text).toContain('FROM pt_trailers')
		expect(query.text).toContain('WHERE driver_email = ?')
		expect(query.values).toEqual(['Pat@x.com', 50])
	})
})

describe('listTrailersOrNone', () => {
	it('answers the trailers', async () => {
		sql.respond(() => [row])
		await expect(listTrailersOrNone('pat@x.com')).resolves.toEqual([row])
	})

	it('answers none before the migration, logging it once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() =>
			Object.assign(new Error('missing'), { code: '42P01' }),
		)
		await expect(listTrailersOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listTrailersOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(1)
		expect(error.mock.calls[0][0]).toContain(TRAILERS_MIGRATION)
	})

	it('answers none on any other error, logging each', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		sql.respond(() => new Error('down'))
		await expect(listTrailersOrNone('pat@x.com')).resolves.toEqual([])
		await expect(listTrailersOrNone('pat@x.com')).resolves.toEqual([])
		expect(error).toHaveBeenCalledTimes(2)
		expect(error.mock.calls[0][0]).toBe('Trailers: could not list them:')
	})
})

describe('createTrailerDb', () => {
	it('saves the trailer, trimmed', async () => {
		sql.respond(() => [row])
		await expect(
			createTrailerDb(
				{ email: 'pat@x.com', userId: 'user_1' },
				{ name: ' Dry van ', plate: 'TR 123  ' },
			),
		).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_trailers')
		expect(query.values).toEqual([
			'pat@x.com',
			'user_1',
			'Dry van',
			'TR 123',
			'pat@x.com',
			50,
		])
	})

	it('saves a trailer without a name as NULL', async () => {
		sql.respond(() => [{ ...row, name: null }])
		await createTrailerDb(
			{ email: 'pat@x.com' },
			{ name: '  ', plate: 'P1' },
		)
		expect(sql.queries()[0].values.slice(2, 4)).toEqual([null, 'P1'])
	})

	it('answers too_many once the driver has the most allowed', async () => {
		await expect(
			createTrailerDb({ email: 'pat@x.com' }, { name: 'A', plate: 'B' }),
		).resolves.toBe('too_many')
		expect(sql.queries()[0].values[1]).toBeNull()
	})
})

describe('updateTrailerDb', () => {
	it('changes the trailer, and answers what it overwrote', async () => {
		sql.respond(() => [
			{
				...row,
				plate: 'TR 456',
				before_name: 'Dry van',
				before_plate: 'TR 123',
			},
		])
		const updated = await updateTrailerDb(5, 'pat@x.com', {
			name: 'Dry van',
			plate: ' TR 456 ',
		})
		expect(updated).toEqual({
			trailer: { ...row, plate: 'TR 456' },
			before: { name: 'Dry van', plate: 'TR 123' },
		})
		const [query] = sql.queries()
		expect(query.text).toContain('FOR UPDATE')
		expect(query.values).toEqual([
			5,
			'pat@x.com',
			'Dry van',
			'TR 456',
			'pat@x.com',
		])
		expect(trailerChangedFields(updated as never)).toEqual(['plate'])
	})

	it("answers undefined when it isn't theirs", async () => {
		await expect(
			updateTrailerDb(5, 'pat@x.com', { name: 'X', plate: 'Y' }),
		).resolves.toBeUndefined()
	})
})

describe('deleteTrailerDb', () => {
	it("deletes one of the driver's trailers", async () => {
		sql.respond(() => [row])
		await expect(deleteTrailerDb(5, 'pat@x.com')).resolves.toEqual(row)
		const [query] = sql.queries()
		expect(query.text).toContain('DELETE FROM pt_trailers')
		expect(query.values).toEqual([5, 'pat@x.com'])
	})
})
