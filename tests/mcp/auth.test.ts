// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	touchApiKeyDb: vi.fn(),
	verify: vi.fn(),
	getUser: vi.fn(),
}))
vi.mock('@/lib/db/api-keys', () => ({ touchApiKeyDb: mocks.touchApiKeyDb }))
vi.mock('@clerk/nextjs/server', () => ({
	clerkClient: async () => ({
		idPOAuthAccessToken: { verify: mocks.verify },
		users: { getUser: mocks.getUser },
	}),
}))

import { generateApiKey, hashApiKey } from '@/lib/api-keys'
import { looksLikeOAuthToken, tokenAudiences, verifyMcpToken } from '@/mcp/auth'

const req = new Request('https://patspretrips.ca/api/mcp')
const TOKEN = 'oat_abc123'

const accessToken = (overrides: Record<string, unknown> = {}) => ({
	clientId: 'claude',
	subject: 'user_1',
	scopes: ['openid', 'email'],
	revoked: false,
	expired: false,
	expiration: 99,
	...overrides,
})

beforeEach(() => {
	vi.stubEnv('MCP_TOKEN_AUDIENCE', '')
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
	mocks.getUser.mockResolvedValue({
		primaryEmailAddress: { emailAddress: 'pat@x.com' },
	})
})

describe('API keys', () => {
	it("signs in as the key's driver", async () => {
		const key = generateApiKey()
		mocks.touchApiKeyDb.mockResolvedValue({
			id: 3,
			driverEmail: 'pat@x.com',
			name: 'Muse',
		})
		await expect(verifyMcpToken(req, key)).resolves.toEqual({
			token: key,
			clientId: 'api-key:3',
			scopes: [],
			extra: { email: 'pat@x.com', client: 'Muse', via: 'api_key' },
		})
		expect(mocks.touchApiKeyDb).toHaveBeenCalledWith(hashApiKey(key))
	})

	it('refuses revoked or unknown keys', async () => {
		mocks.touchApiKeyDb.mockResolvedValue(null)
		await expect(
			verifyMcpToken(req, generateApiKey()),
		).resolves.toBeUndefined()
	})
})

describe('Clerk OAuth access tokens', () => {
	it('refuses a missing or junk token without a network call', async () => {
		await expect(verifyMcpToken(req, undefined)).resolves.toBeUndefined()
		await expect(verifyMcpToken(req, 'junk token')).resolves.toBeUndefined()
		expect(mocks.verify).not.toHaveBeenCalled()
	})

	it("verifies with Clerk and takes the user's primary email", async () => {
		mocks.verify.mockResolvedValue(accessToken())
		await expect(verifyMcpToken(req, TOKEN)).resolves.toEqual({
			token: TOKEN,
			clientId: 'claude',
			scopes: ['openid', 'email'],
			expiresAt: 99,
			extra: { email: 'pat@x.com', via: 'oauth' },
		})
		expect(mocks.verify).toHaveBeenCalledWith(TOKEN, {
			audience: undefined,
		})
		expect(mocks.getUser).toHaveBeenCalledWith('user_1')
	})

	it('checks the configured audience and accepts JWT tokens', async () => {
		vi.stubEnv(
			'MCP_TOKEN_AUDIENCE',
			'https://patspretrips.ca/api/mcp, other',
		)
		mocks.verify.mockResolvedValue(accessToken({ expiration: null }))
		const auth = await verifyMcpToken(req, 'aaa.bbb.ccc')
		expect(auth?.expiresAt).toBeUndefined()
		expect(mocks.verify).toHaveBeenCalledWith('aaa.bbb.ccc', {
			audience: ['https://patspretrips.ca/api/mcp', 'other'],
		})
	})

	it('refuses revoked or expired tokens', async () => {
		mocks.verify.mockResolvedValue(accessToken({ revoked: true }))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
		mocks.verify.mockResolvedValue(accessToken({ expired: true }))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
	})

	it('refuses a user without an email', async () => {
		mocks.verify.mockResolvedValue(accessToken())
		mocks.getUser.mockResolvedValue({ primaryEmailAddress: null })
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
	})

	it('refuses a token that fails verification', async () => {
		mocks.verify.mockRejectedValueOnce(new Error('invalid'))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
		mocks.verify.mockRejectedValueOnce('odd')
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
	})
})

describe('helpers', () => {
	it('recognises OAuth tokens', () => {
		expect(looksLikeOAuthToken('oat_x')).toBe(true)
		expect(looksLikeOAuthToken('a.b.c')).toBe(true)
		expect(looksLikeOAuthToken('a.b')).toBe(false)
		expect(looksLikeOAuthToken(`oat_${'a'.repeat(9000)}`)).toBe(false)
	})

	it('reads audiences', () => {
		vi.stubEnv('MCP_TOKEN_AUDIENCE', undefined)
		expect(tokenAudiences()).toBeUndefined()
		expect(tokenAudiences(' a b ')).toEqual(['a', 'b'])
	})
})
