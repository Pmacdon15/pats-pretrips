import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqlMock } from './sql-mock'

const mocks = vi.hoisted(() => ({ neon: vi.fn() }))
vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }))

import {
	createApiKeyDb,
	listApiKeysDb,
	revokeApiKeyDb,
	touchApiKeyDb,
} from '@/lib/db/api-keys'

const sql = createSqlMock()

beforeEach(() => {
	sql.reset()
	mocks.neon.mockReturnValue(sql.sql)
	vi.stubEnv('DATABASE_URL', 'postgres://test')
})

const row = {
	id: 1,
	name: 'Muse',
	key_prefix: 'ppt_abcdef',
	created_at: new Date('2026-11-01T00:00:00Z'),
	last_used_at: null,
}

describe('API key queries', () => {
	it('creates a key from its hash', async () => {
		sql.respond(() => [row])
		await expect(
			createApiKeyDb('pat@x.com', 'Muse', 'hash', 'ppt_abcdef'),
		).resolves.toEqual({
			id: 1,
			name: 'Muse',
			prefix: 'ppt_abcdef',
			createdAt: '2026-11-01T00:00:00.000Z',
			lastUsedAt: null,
		})
		const [query] = sql.queries()
		expect(query.text).toContain('INSERT INTO pt_api_keys')
		expect(query.values).toEqual([
			'pat@x.com',
			'Muse',
			'hash',
			'ppt_abcdef',
		])
	})

	it("lists the driver's live keys", async () => {
		sql.respond(() => [{ ...row, last_used_at: '2026-11-02T00:00:00Z' }])
		const [key] = await listApiKeysDb('pat@x.com')
		expect(key.lastUsedAt).toBe('2026-11-02T00:00:00.000Z')
		const [query] = sql.queries()
		expect(query.text).toContain('revoked_at IS NULL')
		expect(query.values).toEqual(['pat@x.com'])
	})

	it("revokes only the driver's own key", async () => {
		sql.respond(() => [{ id: 1 }])
		await expect(revokeApiKeyDb('pat@x.com', 1)).resolves.toBe(true)
		expect(sql.queries()[0].values).toEqual([1, 'pat@x.com'])
		sql.respond(() => [])
		await expect(revokeApiKeyDb('pat@x.com', 2)).resolves.toBe(false)
	})

	it("finds a live key's driver by hash", async () => {
		sql.respond(() => [{ id: 1, driver_email: 'pat@x.com', name: 'Muse' }])
		await expect(touchApiKeyDb('hash')).resolves.toEqual({
			id: 1,
			driverEmail: 'pat@x.com',
			name: 'Muse',
		})
		expect(sql.queries()[0].text).toContain('SET last_used_at = NOW()')
		sql.respond(() => [])
		await expect(touchApiKeyDb('nope')).resolves.toBeNull()
	})
})
