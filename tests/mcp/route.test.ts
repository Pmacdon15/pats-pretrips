// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'

/*
 * The MCP endpoint over HTTP, the way an AI app calls it: JSON-RPC posted to
 * /api/mcp with a bearer token, answered as a server-sent event (or as plain
 * JSON for a client that only accepts JSON). The database is mocked; the
 * MCP handler, auth edge and tools are real.
 */

const mocks = vi.hoisted(() => ({
	touchApiKeyDb: vi.fn(),
	createTripDb: vi.fn(),
	getLatestTripDb: vi.fn(),
	getLatestTripForPlateDb: vi.fn(),
	getTripDb: vi.fn(),
	listTripsDb: vi.fn(),
	updateTripDb: vi.fn(),
	revalidateTag: vi.fn(),
}))
vi.mock('@/lib/db/api-keys', () => ({ touchApiKeyDb: mocks.touchApiKeyDb }))
vi.mock('@/lib/db/trips', () => ({
	createTripDb: mocks.createTripDb,
	getLatestTripDb: mocks.getLatestTripDb,
	getLatestTripForPlateDb: mocks.getLatestTripForPlateDb,
	getTripDb: mocks.getTripDb,
	listTripsDb: mocks.listTripsDb,
	updateTripDb: mocks.updateTripDb,
}))
vi.mock('@/lib/db/repairs', () => ({
	listTripRepairsDb: vi.fn(async () => []),
	listDriverRepairsDb: vi.fn(async () => []),
	listTripsWithDefectsDb: vi.fn(async () => []),
	createRepairDb: vi.fn(),
	deleteRepairDb: vi.fn(async () => undefined),
}))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))

import { DELETE, GET, OPTIONS, POST } from '@/app/api/mcp/route'
import { generateApiKey } from '@/lib/api-keys'
import { messagesFromEventStream } from '@/mcp/http'

const URL_ = 'https://patspretrips.ca/api/mcp'
const METADATA_URL =
	'https://patspretrips.ca/.well-known/oauth-protected-resource/api/mcp'
const SCOPES = 'profile email offline_access'
const KEY = generateApiKey()

beforeEach(() => {
	mocks.touchApiKeyDb.mockResolvedValue({
		id: 3,
		driverEmail: 'pat@x.com',
		name: 'Muse',
	})
	vi.spyOn(console, 'info').mockImplementation(() => {})
	vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function post(
	headers: Record<string, string>,
	body: unknown,
	accept = 'application/json, text/event-stream',
) {
	return POST(
		new Request(URL_, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept,
				'mcp-protocol-version': '2025-06-18',
				...headers,
			},
			body: JSON.stringify(body),
		}),
	)
}

async function rpc(
	token: string | null,
	method: string,
	params: unknown = {},
	{ scheme = 'Bearer', accept }: { scheme?: string; accept?: string } = {},
) {
	const res = await post(
		token ? { authorization: `${scheme} ${token}` } : {},
		{ jsonrpc: '2.0', id: 1, method, params },
		accept,
	)
	const text = await res.text()
	const isStream = res.headers
		.get('content-type')
		?.startsWith('text/event-stream')
	const body = text
		? isStream
			? (messagesFromEventStream(text)[0] as Record<string, unknown>)
			: JSON.parse(text)
		: null
	return {
		status: res.status,
		headers: res.headers,
		challenge: res.headers.get('www-authenticate'),
		body,
	}
}

const initialize = (token: string | null, scheme?: string) =>
	rpc(
		token,
		'initialize',
		{
			protocolVersion: '2025-06-18',
			capabilities: {},
			clientInfo: { name: 'test-client', version: '1.0.0' },
		},
		{ scheme },
	)

const callTool = (name: string, args: unknown) =>
	rpc(KEY, 'tools/call', { name, arguments: args })

describe('MCP endpoint auth', () => {
	it("answers 401 with a challenge pointing to the endpoint's metadata when there's no token", async () => {
		const res = await initialize(null)
		expect(res.status).toBe(401)
		expect(res.challenge).toBe(
			`Bearer resource_metadata="${METADATA_URL}", scope="${SCOPES}"`,
		)
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
		expect(res.headers.get('access-control-expose-headers')).toContain(
			'WWW-Authenticate',
		)
	})

	it('challenges GET and DELETE the same way', async () => {
		for (const handler of [GET, DELETE]) {
			const res = await handler(new Request(URL_))
			expect(res.status).toBe(401)
			expect(res.headers.get('www-authenticate')).toContain(METADATA_URL)
		}
	})

	it('marks a rejected token invalid_token, so the client signs in again', async () => {
		mocks.touchApiKeyDb.mockResolvedValue(null)
		const res = await initialize(KEY)
		expect(res.status).toBe(401)
		expect(res.challenge).toContain('error="invalid_token"')
		expect(res.challenge).toContain(`resource_metadata="${METADATA_URL}"`)
		expect(res.body).toEqual({
			error: 'invalid_token',
			error_description: 'The access token is invalid or has expired.',
		})
	})

	it('refuses when verifying the token throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.touchApiKeyDb.mockRejectedValue(new Error('db down'))
		const res = await initialize(KEY)
		expect(res.status).toBe(401)
		expect(res.challenge).toContain('invalid_token')
	})

	it('names the canonical domain in production, even on a deployment host', async () => {
		vi.stubEnv('VERCEL_ENV', 'production')
		vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'https://patspretrips.ca/')
		const res = await POST(
			new Request('https://pretrips-abc.vercel.app/api/mcp', {
				method: 'POST',
				headers: { 'user-agent': 'Google-Gemini/1.0' },
				body: '{}',
			}),
		)
		expect(res.headers.get('www-authenticate')).toContain(METADATA_URL)
	})

	it('answers the CORS preflight, echoing requested headers', async () => {
		const res = await OPTIONS(
			new Request(URL_, {
				method: 'OPTIONS',
				headers: { 'access-control-request-headers': 'x-custom' },
			}),
		)
		expect(res.status).toBe(204)
		expect(res.headers.get('access-control-allow-headers')).toBe('x-custom')
		const plain = await OPTIONS(new Request(URL_, { method: 'OPTIONS' }))
		expect(plain.headers.get('access-control-allow-headers')).toContain(
			'Authorization',
		)
	})

	it('accepts the bearer scheme in any letter case', async () => {
		const res = await initialize(KEY, 'bearer')
		expect(res.status).toBe(200)
		expect(res.body?.result).toMatchObject({
			serverInfo: { name: 'pats-pretrips' },
			instructions: expect.stringContaining('odometer'),
		})
	})

	it('answers plain JSON to clients that only accept JSON', async () => {
		const res = await rpc(
			KEY,
			'tools/list',
			{},
			{ accept: 'application/json' },
		)
		expect(res.headers.get('content-type')).toBe('application/json')
		expect(
			res.body.result.tools.map((t: { name: string }) => t.name),
		).toEqual([
			'list_defect_categories',
			'get_trip_defaults',
			'start_trip',
			'update_trip',
			'list_trips',
			'get_trip',
			'list_defects',
			'mark_defect_repaired',
			'undo_defect_repair',
		])
	})

	it('answers 202 with no body for a notification from a JSON-only client', async () => {
		const res = await post(
			{ authorization: `Bearer ${KEY}` },
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			'application/json',
		)
		expect(res.status).toBe(202)
		expect(await res.text()).toBe('')
	})

	it('refuses an expired token', async () => {
		const { mcpRoute } = await import('@/mcp/http')
		const route = mcpRoute(
			async () => new Response('never'),
			async () => ({
				token: 't',
				clientId: 'c',
				scopes: [],
				expiresAt: 1,
			}),
		)
		const res = await route(
			new Request(URL_, { headers: { authorization: 'Bearer t' } }),
		)
		expect(res.status).toBe(401)
		expect(res.headers.get('www-authenticate')).toContain('has expired')
	})
})

describe('trips card', () => {
	it('links list_trips and get_trip to the card and serves it', async () => {
		const tools = (await rpc(KEY, 'tools/list')).body.result
			.tools as Array<{
			name: string
			_meta?: { ui?: { resourceUri?: string } }
		}>
		const uri = 'ui://pats-pretrips/trips-card.html'
		for (const name of ['list_trips', 'get_trip']) {
			expect(
				tools.find((t) => t.name === name)?._meta?.ui?.resourceUri,
			).toBe(uri)
		}
		const listed = await rpc(KEY, 'resources/list')
		expect(listed.body.result.resources).toEqual([
			expect.objectContaining({
				uri,
				mimeType: 'text/html;profile=mcp-app',
			}),
		])
		const read = await rpc(KEY, 'resources/read', { uri })
		expect(read.body.result.contents[0]).toMatchObject({
			uri,
			mimeType: 'text/html;profile=mcp-app',
			text: expect.stringContaining('ui/initialize'),
		})
	})
})

describe('tool schemas', () => {
	it('advertises only keywords every client accepts', async () => {
		const res = await rpc(KEY, 'tools/list')
		const json = JSON.stringify(res.body.result.tools)
		for (const keyword of [
			'$schema',
			'additionalProperties',
			'exclusiveMinimum',
			'"const"',
		]) {
			expect(json).not.toContain(keyword)
		}
	})
})

describe('tools over HTTP', () => {
	it('starts a trip for the driver who owns the key', async () => {
		mocks.getLatestTripForPlateDb.mockResolvedValue(undefined)
		mocks.createTripDb.mockResolvedValue(
			trip({ tripid: 9, date: new Date(), defects: '' }),
		)
		const res = await callTool('start_trip', {
			odometer: 482317,
			truck_plate: 'ABC 1234',
			make: 'Freightliner',
			model: 'Cascadia',
			carrier: 'Acme',
			carrier_address: '1 Main St',
			inspection_address: '455 Yard Ave',
			remarks: 'No defects found',
		})
		expect(res.body.result.isError).toBeUndefined()
		expect(res.body.result.content[0].text).toContain('Started trip 9')
		expect(mocks.createTripDb).toHaveBeenCalledWith(
			expect.objectContaining({
				odometer: 482317,
				truckPlate: 'ABC 1234',
			}),
			'pat@x.com',
		)
		expect(mocks.revalidateTag.mock.calls).toEqual([
			['trips:pat@x.com', { expire: 0 }],
		])
	})

	it('reads without clearing caches', async () => {
		mocks.listTripsDb.mockResolvedValue({ trips: [], hasMore: false })
		const res = await callTool('list_trips', {})
		expect(res.body.result.content[0].text).toBe(
			'No trips in the last 24 hours.',
		)
		expect(mocks.revalidateTag).not.toHaveBeenCalled()
	})

	it.each([
		['list_defect_categories', {}],
		['get_trip_defaults', {}],
		['get_trip', { trip_id: 1 }],
		['update_trip', { trip_id: 1, odometer: 5 }],
		['list_defects', {}],
		[
			'mark_defect_repaired',
			{ trip_id: 1, defect: 'Cab', mechanic_name: 'Sam' },
		],
		['undo_defect_repair', { repair_id: 1 }],
	])('serves %s', async (name, args) => {
		mocks.getLatestTripDb.mockResolvedValue(undefined)
		mocks.getTripDb.mockResolvedValue(undefined)
		const res = await callTool(name, args)
		expect(res.body.result.content[0].type).toBe('text')
	})

	it('turns bad input into a readable tool error', async () => {
		const res = await callTool('get_trip', { trip_id: -1 })
		expect(res.body.result.isError).toBe(true)
		expect(JSON.stringify(res.body.result)).toMatch(/trip_id/)
	})
})
