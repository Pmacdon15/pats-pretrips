import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

import { countHitDb } from '@/lib/db/rate-limits'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

describe('rate limit counter', () => {
	it("adds a hit to the bucket's window in one upsert and prunes ended windows", async () => {
		sql.respond(() => [{ hits: 3, retry_after: 42 }])
		await expect(countHitDb('geocode:pat@x.com', 3600)).resolves.toEqual({
			hits: 3,
			retryAfter: 42,
		})
		const queries = sql.queries()
		expect(queries).toHaveLength(1)
		const [query] = queries
		expect(query.text).toContain('DELETE FROM pt_rate_limits')
		expect(query.text).toContain('expires_at < NOW()')
		expect(query.text).toContain('INSERT INTO pt_rate_limits')
		expect(query.text).toContain(
			'ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1',
		)
		// Every value is a parameter, the bucket included.
		expect(query.values).toEqual([
			20,
			3600,
			3600,
			'geocode:pat@x.com',
			3600,
		])
	})

	it('reads counts that come back as strings', async () => {
		sql.respond(() => [{ hits: '7', retry_after: '1' }])
		await expect(countHitDb('b', 60)).resolves.toEqual({
			hits: 7,
			retryAfter: 1,
		})
	})

	it('passes database errors on', async () => {
		sql.respond(() => new Error('relation "pt_rate_limits" does not exist'))
		await expect(countHitDb('b', 60)).rejects.toThrow('does not exist')
	})
})
