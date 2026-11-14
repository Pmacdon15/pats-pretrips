import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
	revalidateTag: vi.fn(),
	rateLimitAll: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimitAll: mocks.rateLimitAll,
}))

import type { McpServer } from '@modelcontextprotocol/server'
import { MCP_TOOL_CALLS, REPAIR_UPLOADS } from '@/lib/rate-limit/limits'
import { callerFrom, run } from '@/mcp/server'

const server = (name?: string) =>
	({
		server: { getClientVersion: () => (name ? { name } : undefined) },
	}) as unknown as McpServer

const auth = (extra: Record<string, unknown>) => ({
	token: 't',
	clientId: 'c',
	scopes: [],
	extra,
})

beforeEach(() => {
	mocks.rateLimitAll.mockResolvedValue({ ok: true })
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('rate limits on tool calls', () => {
	const signedIn = auth({ email: 'pat@x.com' })

	it("counts every call against the driver's limit, plus the tool's own", async () => {
		const tool = vi.fn(() => ({ summary: 'ok', data: {} }))
		await run(server(), signedIn, tool, { readOnly: true })
		expect(mocks.rateLimitAll.mock.calls).toEqual([
			['pat@x.com', [MCP_TOOL_CALLS]],
		])
		mocks.rateLimitAll.mockClear()
		await run(server(), signedIn, tool, { limits: [REPAIR_UPLOADS] })
		expect(mocks.rateLimitAll.mock.calls).toEqual([
			['pat@x.com', [MCP_TOOL_CALLS, REPAIR_UPLOADS]],
		])
		expect(tool).toHaveBeenCalledTimes(2)
	})

	it('answers a readable tool error over the limit, without running the tool', async () => {
		mocks.rateLimitAll.mockResolvedValue({ ok: false, retryAfter: 300 })
		const tool = vi.fn()
		const result = await run(server(), signedIn, tool, {
			limits: [REPAIR_UPLOADS],
		})
		expect(tool).not.toHaveBeenCalled()
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toBe(
			'Too many requests in a short time. Please wait about 5 minutes and try again.',
		)
		expect(result.structuredContent).toEqual({ retry_after_seconds: 300 })
		expect(mocks.revalidateTag).not.toHaveBeenCalled()
	})

	it("doesn't count calls without a signed-in driver", async () => {
		await run(server(), undefined, vi.fn())
		expect(mocks.rateLimitAll).not.toHaveBeenCalled()
	})
})

describe('callerFrom', () => {
	it('takes the driver only from verified auth', () => {
		expect(callerFrom(undefined)).toBeNull()
		expect(callerFrom(auth({ email: '' }))).toBeNull()
		expect(
			callerFrom(auth({ email: 'pat@x.com', client: 'Muse' })),
		).toEqual({
			email: 'pat@x.com',
			client: 'Muse',
		})
		expect(callerFrom(auth({ email: 'pat@x.com' }), 'claude-ai')).toEqual({
			email: 'pat@x.com',
			client: 'claude-ai',
		})
		expect(callerFrom(auth({ email: 'pat@x.com', client: 5 }))).toEqual({
			email: 'pat@x.com',
			client: null,
		})
	})
})

describe('run', () => {
	it('asks the client to sign in again without a caller', async () => {
		const result = await run(server(), undefined, vi.fn())
		expect(result.isError).toBe(true)
		expect(result.content[0].text).toContain('Not signed in')
	})

	it('clears the trip caches after a write, but not after an error', async () => {
		const signedIn = auth({ email: 'pat@x.com' })
		await run(server('x'), signedIn, () => ({
			summary: 'ok',
			data: {},
		}))
		expect(mocks.revalidateTag.mock.calls).toEqual([
			['trips:pat@x.com', { expire: 0 }],
		])
		mocks.revalidateTag.mockClear()
		const failed = await run(server(), signedIn, () => ({
			summary: 'no',
			data: {},
			isError: true,
		}))
		expect(failed.isError).toBe(true)
		expect(mocks.revalidateTag).not.toHaveBeenCalled()
	})

	it('reports invalid input and unexpected errors readably', async () => {
		const signedIn = auth({ email: 'pat@x.com' })
		const invalid = await run(server(), signedIn, () => {
			z.object({ a: z.number(), b: z.object({ c: z.string() }) }).parse({
				b: {},
			})
			throw new Error('unreachable')
		})
		expect(invalid.content[0].text).toBe(
			'Invalid input: a: Invalid input: expected number, received undefined; b.c: Invalid input: expected string, received undefined',
		)
		const rootIssue = await run(server(), signedIn, () => {
			z.number().parse('x')
			throw new Error('unreachable')
		})
		expect(rootIssue.content[0].text).toContain('input: ')
		const crashed = await run(server(), signedIn, () => {
			throw new Error('db down')
		})
		expect(crashed.content[0].text).toContain('Something went wrong')
	})
})
