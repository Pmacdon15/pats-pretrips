// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ countHitDb: vi.fn() }))
vi.mock('@/lib/db/rate-limits', () => ({ countHitDb: mocks.countHitDb }))

import { resetRateLimiter } from '@/lib/rate-limit'
import { MCP_AUTH_FAILURES } from '@/lib/rate-limit/limits'
import { clientIp, mcpRoute } from '@/mcp/http'

const verify = async () => ({ token: 't', clientId: 'c', scopes: [] })
const stream = (body: string) =>
	new Response(body, { headers: { 'content-type': 'text/event-stream' } })
const ask = (route: ReturnType<typeof mcpRoute>, accept?: string) =>
	route(
		new Request('https://patspretrips.ca/api/mcp', {
			method: 'POST',
			headers: {
				authorization: 'Bearer t',
				...(accept ? { accept } : {}),
			},
			body: '{}',
		}),
	)

describe('JSON answers for JSON-only clients', () => {
	it('answers 202 when the stream held no messages', async () => {
		const res = await ask(mcpRoute(async () => stream(''), verify))
		expect(res.status).toBe(202)
	})

	it('answers a batch as an array', async () => {
		const res = await ask(
			mcpRoute(
				async () => stream('data: {"id":1}\n\ndata: {"id":2}\n\n'),
				verify,
			),
			'*/*',
		)
		expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }])
	})

	it('passes plain JSON answers through', async () => {
		const res = await ask(
			mcpRoute(async () => Response.json({ ok: true }), verify),
		)
		expect(await res.json()).toEqual({ ok: true })
	})

	it('passes a GET through as it came', async () => {
		const route = mcpRoute(async (req) => new Response(req.method), verify)
		const res = await route(
			new Request('https://patspretrips.ca/api/mcp', {
				headers: { authorization: 'Bearer t' },
			}),
		)
		expect(await res.text()).toBe('GET')
	})

	it('leaves streams alone for clients that take them', async () => {
		const res = await ask(
			mcpRoute(async () => stream('data: {"id":1}\n\n'), verify),
			'text/event-stream',
		)
		expect(res.headers.get('content-type')).toBe('text/event-stream')
	})
})

describe('the client IP', () => {
	const from = (headers: Record<string, string>) =>
		clientIp(new Request('https://patspretrips.ca/api/mcp', { headers }))

	it('is the first hop of x-forwarded-for', () => {
		expect(from({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' })).toBe(
			'203.0.113.7',
		)
	})

	it('falls back to x-real-ip, then to one shared bucket', () => {
		expect(from({ 'x-real-ip': '198.51.100.2' })).toBe('198.51.100.2')
		expect(from({ 'x-forwarded-for': ' ', 'x-real-ip': ' ' })).toBe(
			'unknown',
		)
		expect(from({})).toBe('unknown')
	})

	it('is cut to a sane length', () => {
		expect(from({ 'x-real-ip': 'x'.repeat(500) })).toHaveLength(64)
	})
})

describe('failed sign-ins', () => {
	const refuse = vi.fn(async () => undefined)
	const handler = vi.fn(async () => Response.json({ ok: true }))
	const route = mcpRoute(handler, refuse)
	const attempt = (ip: string) =>
		route(
			new Request('https://patspretrips.ca/api/mcp', {
				method: 'POST',
				headers: { authorization: 'Bearer t', 'x-forwarded-for': ip },
				body: '{}',
			}),
		)

	beforeEach(() => {
		resetRateLimiter()
		vi.spyOn(console, 'warn').mockImplementation(() => {})
		const counts = new Map<string, number>()
		mocks.countHitDb.mockImplementation(async (bucket: string) => {
			const hits = (counts.get(bucket) ?? 0) + 1
			counts.set(bucket, hits)
			return { hits, retryAfter: 240 }
		})
	})

	it('are counted per IP, and answered 401 under the limit', async () => {
		const res = await attempt('203.0.113.7')
		expect(res.status).toBe(401)
		expect(mocks.countHitDb).toHaveBeenCalledWith(
			'mcp-auth-failures:203.0.113.7',
			MCP_AUTH_FAILURES.windowSeconds,
		)
	})

	it('get a 429 with Retry-After and CORS once over the limit', async () => {
		mocks.countHitDb.mockResolvedValue({
			hits: MCP_AUTH_FAILURES.max + 1,
			retryAfter: 240,
		})
		const res = await attempt('203.0.113.7')
		expect(res.status).toBe(429)
		expect(res.headers.get('retry-after')).toBe('240')
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
		expect(res.headers.get('access-control-expose-headers')).toContain(
			'Retry-After',
		)
		expect(await res.json()).toEqual({
			error: 'rate_limited',
			error_description:
				'Too many failed sign-in attempts. Try again in 240 seconds.',
		})
	})

	it('stop reaching the token check, even with a good token, until the window ends', async () => {
		for (let i = 0; i < MCP_AUTH_FAILURES.max; i++) {
			expect((await attempt('203.0.113.7')).status).toBe(401)
		}
		refuse.mockClear()
		mocks.countHitDb.mockClear()
		const good = vi.fn(verify)
		const res = await mcpRoute(
			handler,
			good,
		)(
			new Request('https://patspretrips.ca/api/mcp', {
				method: 'POST',
				headers: {
					authorization: 'Bearer good',
					'x-forwarded-for': '203.0.113.7',
				},
				body: '{}',
			}),
		)
		expect(res.status).toBe(429)
		expect(res.headers.get('retry-after')).toBe('240')
		expect(res.headers.get('access-control-allow-origin')).toBe('*')
		expect(good).not.toHaveBeenCalled()
		expect(handler).not.toHaveBeenCalled()
		expect(mocks.countHitDb).not.toHaveBeenCalled()
		// Another IP is unaffected.
		expect((await attempt('198.51.100.2')).status).toBe(401)
	})

	it("aren't counted for good tokens", async () => {
		const res = await ask(mcpRoute(async () => Response.json({}), verify))
		expect(res.status).toBe(200)
		expect(mocks.countHitDb).not.toHaveBeenCalled()
	})
})
