import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getUser: vi.fn(),
	createApiKeyDb: vi.fn(),
	listApiKeysDb: vi.fn(),
	revokeApiKeyDb: vi.fn(),
}))
// Stands in for Clerk's current user: `getUser` gives the user or null.
vi.mock('@/lib/auth', () => ({
	getDriverEmail: async () =>
		((await mocks.getUser()) as { email?: string } | null)?.email ?? null,
}))
vi.mock('@/lib/db/api-keys', () => ({
	createApiKeyDb: mocks.createApiKeyDb,
	listApiKeysDb: mocks.listApiKeysDb,
	revokeApiKeyDb: mocks.revokeApiKeyDb,
}))

import { hashApiKey } from '@/lib/api-keys'
import {
	createApiKeyDAL,
	listApiKeysDAL,
	revokeApiKeyDAL,
} from '@/lib/DAL/api-keys'

beforeEach(() => {
	mocks.getUser.mockResolvedValue({ email: 'pat@x.com' })
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('listApiKeysDAL', () => {
	it("lists the signed-in driver's keys", async () => {
		mocks.listApiKeysDb.mockResolvedValue([])
		expect((await listApiKeysDAL())._unsafeUnwrap()).toEqual([])
		expect(mocks.listApiKeysDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('needs a signed-in driver', async () => {
		mocks.getUser.mockResolvedValue(null)
		expect((await listApiKeysDAL())._unsafeUnwrapErr().reason).toBe(
			'Must be logged in',
		)
	})

	it('explains a database error', async () => {
		mocks.listApiKeysDb.mockRejectedValue(new Error('no table'))
		expect((await listApiKeysDAL())._unsafeUnwrapErr().reason).toBe(
			'Could not load your keys. Please try again.',
		)
	})
})

describe('createApiKeyDAL', () => {
	it('stores only the hash and returns the key once', async () => {
		mocks.createApiKeyDb.mockResolvedValue({ id: 1 })
		const result = (
			await createApiKeyDAL({ name: ' Muse ' })
		)._unsafeUnwrap()
		expect(result.apiKey).toEqual({ id: 1 })
		expect(mocks.createApiKeyDb).toHaveBeenCalledWith(
			'pat@x.com',
			'Muse',
			hashApiKey(result.key),
			result.key.slice(0, 10),
		)
	})

	it('explains what went wrong', async () => {
		expect(
			(await createApiKeyDAL({ name: '' }))._unsafeUnwrapErr().reason,
		).toBe("Name the key, like the app it's for")
		mocks.createApiKeyDb.mockRejectedValue(new Error('db'))
		expect(
			(await createApiKeyDAL({ name: 'x' }))._unsafeUnwrapErr().reason,
		).toContain('Could not create')
		mocks.getUser.mockResolvedValue({})
		expect(
			(await createApiKeyDAL({ name: 'x' }))._unsafeUnwrapErr().reason,
		).toBe('Must be logged in')
	})
})

describe('revokeApiKeyDAL', () => {
	it('revokes a key', async () => {
		mocks.revokeApiKeyDb.mockResolvedValue(true)
		expect((await revokeApiKeyDAL(2))._unsafeUnwrap()).toEqual({ id: 2 })
		expect(mocks.revokeApiKeyDb).toHaveBeenCalledWith('pat@x.com', 2)
	})

	it('explains what went wrong', async () => {
		mocks.revokeApiKeyDb.mockResolvedValue(false)
		expect((await revokeApiKeyDAL(2))._unsafeUnwrapErr().reason).toBe(
			'That key was not found',
		)
		mocks.revokeApiKeyDb.mockRejectedValue(new Error('db'))
		expect((await revokeApiKeyDAL(2))._unsafeUnwrapErr().reason).toContain(
			'Could not revoke',
		)
		mocks.getUser.mockResolvedValue(null)
		expect((await revokeApiKeyDAL(2))._unsafeUnwrapErr().reason).toBe(
			'Must be logged in',
		)
	})
})
