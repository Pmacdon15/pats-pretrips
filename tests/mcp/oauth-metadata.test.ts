// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	GET as authServer,
	OPTIONS as authServerPreflight,
} from '@/app/.well-known/oauth-authorization-server/[[...path]]/route'
import {
	GET as resource,
	OPTIONS as resourcePreflight,
} from '@/app/.well-known/oauth-protected-resource/[[...resource]]/route'
import { GET as openId } from '@/app/.well-known/openid-configuration/[[...path]]/route'
import { ALLOWED_HEADERS } from '@/mcp/http'
import {
	configuredIssuer,
	frontendApiFromPublishableKey,
} from '@/mcp/oauth-config'
import { METADATA_CORS_HEADERS } from '@/mcp/oauth-metadata'

const PK = `pk_live_${Buffer.from('clerk.patspretrips.ca$').toString('base64')}`
const ISSUER = 'https://clerk.patspretrips.ca'

const req = new Request(
	'https://patspretrips.ca/.well-known/oauth-protected-resource/api/mcp',
)

beforeEach(() => {
	// pk_live_ + base64('clerk.patspretrips.ca$')
	vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', PK)
	vi.stubEnv('MCP_OAUTH_ISSUER', '')
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('configuredIssuer', () => {
	it('prefers the MCP issuer and trims trailing slashes', () => {
		expect(
			configuredIssuer({
				MCP_OAUTH_ISSUER: ' https://a.example.com// ',
				NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK,
			}),
		).toBe('https://a.example.com')
		expect(configuredIssuer({})).toBeNull()
	})

	it('otherwise uses the Clerk Frontend API from the publishable key', () => {
		expect(
			configuredIssuer({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PK }),
		).toBe(ISSUER)
	})

	it('rejects keys that are not Clerk publishable keys', () => {
		expect(frontendApiFromPublishableKey(undefined)).toBeNull()
		expect(frontendApiFromPublishableKey('sk_live_abc')).toBeNull()
		expect(
			frontendApiFromPublishableKey(
				`pk_test_${Buffer.from('no-dollar').toString('base64')}`,
			),
		).toBeNull()
		expect(
			frontendApiFromPublishableKey(
				`pk_test_${Buffer.from('$').toString('base64')}`,
			),
		).toBeNull()
	})
})

describe('protected resource metadata', () => {
	it('names Clerk as the authorization server for /api/mcp', async () => {
		const res = resource(req)
		expect(await res.json()).toEqual({
			resource: 'https://patspretrips.ca/api/mcp',
			authorization_servers: [ISSUER],
			scopes_supported: ['profile', 'email', 'offline_access'],
			bearer_methods_supported: ['header'],
			resource_name: "Pat's PreTrips",
			resource_documentation: 'https://patspretrips.ca',
			logo_uri: 'https://patspretrips.ca/icon.svg',
		})
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
	})

	it('answers 503 when sign-in is not configured', async () => {
		vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
		expect(resource(req).status).toBe(503)
		expect((await authServer()).status).toBe(503)
		expect((await openId()).status).toBe(503)
	})

	it('answers preflights with a fixed header list, logging unlisted headers', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
		const preflightReq = new Request(req.url, {
			method: 'OPTIONS',
			headers: {
				origin: 'https://example.org',
				'access-control-request-method': 'GET',
				'access-control-request-headers':
					'mcp-protocol-version, x-metadata-custom',
			},
		})
		const res = resourcePreflight(preflightReq)
		expect(res.status).toBe(204)
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
		expect(res.headers.get('access-control-allow-headers')).toBe(
			ALLOWED_HEADERS,
		)
		expect(res.headers.get('access-control-allow-credentials')).toBeNull()
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining('"x-metadata-custom" header'),
		)
		expect(authServerPreflight(preflightReq).status).toBe(204)
		warn.mockRestore()
	})

	it('never allows credentials, and never a wildcard header list', () => {
		expect(METADATA_CORS_HEADERS['Access-Control-Allow-Origin']).toBe('*')
		expect(METADATA_CORS_HEADERS['Access-Control-Allow-Headers']).toBe(
			ALLOWED_HEADERS,
		)
		expect(
			Object.keys(METADATA_CORS_HEADERS).map((name) =>
				name.toLowerCase(),
			),
		).not.toContain('access-control-allow-credentials')
		expect(
			resource(req).headers.get('access-control-allow-credentials'),
		).toBeNull()
		vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '')
		expect(
			resource(req).headers.get('access-control-allow-credentials'),
		).toBeNull()
	})
})

describe("Clerk's discovery documents", () => {
	it('mirrors them from Clerk', async () => {
		const fetch = vi.fn(async () => Response.json({ issuer: 'clerk' }))
		vi.stubGlobal('fetch', fetch)
		const res = await authServer()
		expect(await res.json()).toEqual({ issuer: 'clerk' })
		expect(fetch).toHaveBeenCalledWith(
			`${ISSUER}/.well-known/oauth-authorization-server`,
			expect.anything(),
		)
		await openId()
		expect(fetch).toHaveBeenLastCalledWith(
			`${ISSUER}/.well-known/openid-configuration`,
			expect.anything(),
		)
		vi.unstubAllGlobals()
	})

	it("answers 502 when Clerk doesn't", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 500 })),
		)
		expect((await authServer()).status).toBe(502)
		vi.unstubAllGlobals()
	})
})
