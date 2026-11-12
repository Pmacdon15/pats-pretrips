// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { mcpRoute } from '@/mcp/http'

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
