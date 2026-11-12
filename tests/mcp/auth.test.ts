// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	touchApiKeyDb: vi.fn(),
	jwtVerify: vi.fn(),
	createRemoteJWKSet: vi.fn((url: URL) => ({ url: url.href })),
}))
vi.mock('@/lib/db/api-keys', () => ({ touchApiKeyDb: mocks.touchApiKeyDb }))
vi.mock('jose', () => ({
	jwtVerify: mocks.jwtVerify,
	createRemoteJWKSet: mocks.createRemoteJWKSet,
}))

import { generateApiKey, hashApiKey } from '@/lib/api-keys'
import { looksLikeJwt, tokenAudiences, verifyMcpToken } from '@/mcp/auth'

const req = new Request('https://patspretrips.ca/api/mcp')
const JWT = 'aaa.bbb.ccc'
const ISSUER = 'https://pretrips.kinde.com'

beforeEach(() => {
	vi.stubEnv('KINDE_ISSUER_URL', `${ISSUER}/`)
	vi.stubEnv('MCP_OAUTH_ISSUER', '')
	vi.stubEnv('MCP_TOKEN_AUDIENCE', '')
	vi.spyOn(console, 'warn').mockImplementation(() => {})
	vi.spyOn(console, 'error').mockImplementation(() => {})
	vi.unstubAllGlobals()
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

describe('Kinde access tokens', () => {
	it('refuses a missing or junk token without a network call', async () => {
		await expect(verifyMcpToken(req, undefined)).resolves.toBeUndefined()
		await expect(verifyMcpToken(req, 'oat_x')).resolves.toBeUndefined()
		expect(mocks.jwtVerify).not.toHaveBeenCalled()
	})

	it("verifies against Kinde's keys and issuer, with the email from the token", async () => {
		mocks.jwtVerify.mockResolvedValue({
			payload: {
				email: 'pat@x.com',
				azp: 'claude',
				scp: 'openid email',
				exp: 99,
			},
		})
		await expect(verifyMcpToken(req, JWT)).resolves.toEqual({
			token: JWT,
			clientId: 'claude',
			scopes: ['openid', 'email'],
			expiresAt: 99,
			extra: { email: 'pat@x.com', via: 'oauth' },
		})
		expect(mocks.jwtVerify).toHaveBeenCalledWith(
			JWT,
			{ url: `${ISSUER}/.well-known/jwks` },
			{ issuer: ISSUER, audience: undefined },
		)
	})

	it('reuses the key set and checks the configured audience', async () => {
		vi.stubEnv(
			'MCP_TOKEN_AUDIENCE',
			'https://patspretrips.ca/api/mcp, other',
		)
		mocks.jwtVerify.mockResolvedValue({
			payload: { email: 'pat@x.com', client_id: 'gemini' },
		})
		const auth = await verifyMcpToken(req, JWT)
		expect(auth?.clientId).toBe('gemini')
		expect(auth?.scopes).toEqual([])
		expect(mocks.jwtVerify).toHaveBeenLastCalledWith(
			JWT,
			expect.anything(),
			{
				issuer: ISSUER,
				audience: ['https://patspretrips.ca/api/mcp', 'other'],
			},
		)
		// Made by the earlier test for the same issuer, then reused.
		expect(mocks.createRemoteJWKSet).not.toHaveBeenCalled()
	})

	it("asks Kinde's user profile for the email when the token has none", async () => {
		vi.stubEnv('MCP_OAUTH_ISSUER', 'https://auth.patspretrips.ca')
		mocks.jwtVerify.mockResolvedValue({ payload: {} })
		const fetch = vi.fn(async () =>
			Response.json({ preferred_email: 'pat@x.com' }),
		)
		vi.stubGlobal('fetch', fetch)
		const auth = await verifyMcpToken(req, JWT)
		expect(auth).toMatchObject({
			clientId: 'oauth',
			extra: { email: 'pat@x.com' },
		})
		expect(fetch).toHaveBeenCalledWith(
			'https://auth.patspretrips.ca/oauth2/v2/user_profile',
			expect.objectContaining({
				headers: {
					authorization: `Bearer ${JWT}`,
					accept: 'application/json',
				},
			}),
		)
	})

	it('refuses when the user profile has no email or fails', async () => {
		mocks.jwtVerify.mockResolvedValue({
			payload: { email: 'not-an-email' },
		})
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ email: 5 })),
		)
		await expect(verifyMcpToken(req, JWT)).resolves.toBeUndefined()
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('no', { status: 401 })),
		)
		await expect(verifyMcpToken(req, JWT)).resolves.toBeUndefined()
	})

	it('refuses a token that fails verification', async () => {
		mocks.jwtVerify.mockRejectedValueOnce(new Error('expired'))
		await expect(verifyMcpToken(req, JWT)).resolves.toBeUndefined()
		mocks.jwtVerify.mockRejectedValueOnce('odd')
		await expect(verifyMcpToken(req, JWT)).resolves.toBeUndefined()
	})

	it('refuses everything without an issuer configured', async () => {
		vi.stubEnv('KINDE_ISSUER_URL', '')
		await expect(verifyMcpToken(req, JWT)).resolves.toBeUndefined()
		expect(mocks.jwtVerify).not.toHaveBeenCalled()
	})
})

describe('helpers', () => {
	it('recognises JWTs', () => {
		expect(looksLikeJwt('a.b.c')).toBe(true)
		expect(looksLikeJwt('a.b')).toBe(false)
		expect(looksLikeJwt(`${'a'.repeat(9000)}.b.c`)).toBe(false)
	})

	it('reads audiences', () => {
		vi.stubEnv('MCP_TOKEN_AUDIENCE', undefined)
		expect(tokenAudiences()).toBeUndefined()
		expect(tokenAudiences(' a b ')).toEqual(['a', 'b'])
	})
})
