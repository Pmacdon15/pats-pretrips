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
import {
	looksLikeOAuthToken,
	missingScopes,
	REQUIRED_OAUTH_SCOPES,
	tokenAudiences,
	verifyMcpToken,
} from '@/mcp/auth'

const req = new Request('https://patspretrips.ca/api/mcp')
const TOKEN = 'oat_abc123'

const accessToken = (overrides: Record<string, unknown> = {}) => ({
	clientId: 'claude',
	subject: 'user_1',
	scopes: ['profile', 'email', 'offline_access'],
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
			scopes: ['profile', 'email', 'offline_access'],
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

	it('refuses a token without the email scope, before looking up the user', async () => {
		mocks.verify.mockResolvedValue(accessToken({ scopes: ['profile'] }))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
		expect(console.warn).toHaveBeenCalledWith(
			'MCP: refused an access token for client claude without the email scope (it has: profile)',
		)
		mocks.verify.mockResolvedValue(accessToken({ scopes: [] }))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
		expect(console.warn).toHaveBeenLastCalledWith(
			'MCP: refused an access token for client claude without the email scope (it has: none)',
		)
		expect(mocks.getUser).not.toHaveBeenCalled()
	})

	it('refuses a token that fails verification', async () => {
		mocks.verify.mockRejectedValueOnce(new Error('invalid'))
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
		mocks.verify.mockRejectedValueOnce('odd')
		await expect(verifyMcpToken(req, TOKEN)).resolves.toBeUndefined()
	})
})

describe('the unchecked-audience warning', () => {
	const fresh = async () => {
		vi.resetModules()
		return (await import('@/mcp/auth')).verifyMcpToken
	}
	const audienceWarnings = () =>
		vi
			.mocked(console.warn)
			.mock.calls.filter(([message]) =>
				String(message).includes('MCP_TOKEN_AUDIENCE is unset'),
			)

	it('warns once per server instance in production, with the token audience', async () => {
		vi.stubEnv('VERCEL_ENV', 'production')
		const verify = await fresh()
		mocks.verify.mockResolvedValue(
			accessToken({ aud: ['https://patspretrips.ca/api/mcp'] }),
		)
		await expect(verify(req, TOKEN)).resolves.toBeDefined()
		await expect(verify(req, TOKEN)).resolves.toBeDefined()
		expect(audienceWarnings()).toEqual([
			[
				'MCP: MCP_TOKEN_AUDIENCE is unset, so the audience of OAuth access tokens is NOT checked and a token Clerk issued to any app is accepted (this token\'s aud: ["https://patspretrips.ca/api/mcp"]). See docs/mcp-ai-guide.md.',
			],
		])
	})

	it('says when the token has no audience', async () => {
		vi.stubEnv('VERCEL_ENV', 'production')
		const verify = await fresh()
		mocks.verify.mockResolvedValueOnce(accessToken({ aud: [] }))
		await verify(req, TOKEN)
		expect(audienceWarnings()[0][0]).toContain("this token's aud: none")
		vi.mocked(console.warn).mockClear()
		const again = await fresh()
		mocks.verify.mockResolvedValueOnce(accessToken())
		await again(req, TOKEN)
		expect(audienceWarnings()[0][0]).toContain("this token's aud: none")
	})

	it("doesn't warn outside production or when the audience is checked", async () => {
		vi.stubEnv('VERCEL_ENV', 'preview')
		let verify = await fresh()
		mocks.verify.mockResolvedValue(accessToken())
		await verify(req, TOKEN)
		vi.stubEnv('VERCEL_ENV', 'production')
		vi.stubEnv('MCP_TOKEN_AUDIENCE', 'https://patspretrips.ca/api/mcp')
		verify = await fresh()
		await verify(req, TOKEN)
		expect(audienceWarnings()).toEqual([])
	})
})

describe('helpers', () => {
	it('lists the required scopes a token is missing', () => {
		expect(REQUIRED_OAUTH_SCOPES).toEqual(['email'])
		expect(missingScopes(['profile', 'email', 'offline_access'])).toEqual(
			[],
		)
		expect(missingScopes(['profile', 'offline_access'])).toEqual(['email'])
	})

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
