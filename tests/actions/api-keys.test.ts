import { errAsync, okAsync } from 'neverthrow'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	createApiKeyDAL: vi.fn(),
	revokeApiKeyDAL: vi.fn(),
}))
vi.mock('@/lib/DAL/api-keys', () => mocks)

import { createApiKey, revokeApiKey } from '@/lib/actions/api-keys'

describe('API key actions', () => {
	it('return the value or the reason', async () => {
		mocks.createApiKeyDAL.mockReturnValue(okAsync({ key: 'k' }))
		await expect(createApiKey({ name: 'x' })).resolves.toEqual({
			value: { key: 'k' },
		})
		mocks.createApiKeyDAL.mockReturnValue(errAsync({ reason: 'no' }))
		await expect(createApiKey({ name: 'x' })).resolves.toEqual({
			errorMessage: 'no',
		})
		mocks.revokeApiKeyDAL.mockReturnValue(okAsync({ id: 1 }))
		await expect(revokeApiKey(1)).resolves.toEqual({ value: { id: 1 } })
		mocks.revokeApiKeyDAL.mockReturnValue(errAsync({ reason: 'gone' }))
		await expect(revokeApiKey(1)).resolves.toEqual({ errorMessage: 'gone' })
	})
})
