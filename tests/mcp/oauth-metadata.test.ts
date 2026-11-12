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
import { configuredIssuer } from '@/mcp/oauth-config'

const req = new Request(
	'https://patspretrips.ca/.well-known/oauth-protected-resource/api/mcp',
)

beforeEach(() => {
	vi.stubEnv('KINDE_ISSUER_URL', 'https://pretrips.kinde.com')
	vi.stubEnv('MCP_OAUTH_ISSUER', '')
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('configuredIssuer', () => {
	it('prefers the MCP issuer and trims trailing slashes', () => {
		expect(
			configuredIssuer({
				MCP_OAUTH_ISSUER: ' https://a.kinde.com// ',
				KINDE_ISSUER_URL: 'https://b',
			}),
		).toBe('https://a.kinde.com')
		expect(configuredIssuer({})).toBeNull()
	})
})

describe('protected resource metadata', () => {
	it('names Kinde as the authorization server for /api/mcp', async () => {
		const res = resource(req)
		expect(await res.json()).toEqual({
			resource: 'https://patspretrips.ca/api/mcp',
			authorization_servers: ['https://pretrips.kinde.com'],
			scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
			bearer_methods_supported: ['header'],
			resource_name: "Pat's PreTrips",
			resource_documentation: 'https://patspretrips.ca',
			logo_uri: 'https://patspretrips.ca/icon.svg',
		})
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
	})

	it('answers 503 when sign-in is not configured', async () => {
		vi.stubEnv('KINDE_ISSUER_URL', '')
		expect(resource(req).status).toBe(503)
		expect((await authServer()).status).toBe(503)
		expect((await openId()).status).toBe(503)
	})

	it('answers preflights', () => {
		expect(resourcePreflight().status).toBe(204)
		expect(authServerPreflight().status).toBe(204)
	})
})

describe("Kinde's discovery documents", () => {
	it('mirrors them from Kinde', async () => {
		const fetch = vi.fn(async () => Response.json({ issuer: 'kinde' }))
		vi.stubGlobal('fetch', fetch)
		const res = await authServer()
		expect(await res.json()).toEqual({ issuer: 'kinde' })
		expect(fetch).toHaveBeenCalledWith(
			'https://pretrips.kinde.com/.well-known/oauth-authorization-server',
			expect.anything(),
		)
		await openId()
		expect(fetch).toHaveBeenLastCalledWith(
			'https://pretrips.kinde.com/.well-known/openid-configuration',
			expect.anything(),
		)
		vi.unstubAllGlobals()
	})

	it("answers 502 when Kinde doesn't", async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 500 })),
		)
		expect((await authServer()).status).toBe(502)
		vi.unstubAllGlobals()
	})
})
