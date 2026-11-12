import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag }))

import type { McpServer } from '@modelcontextprotocol/server'
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
	vi.spyOn(console, 'error').mockImplementation(() => {})
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
		expect(mocks.revalidateTag.mock.calls.map(([tag]) => tag)).toEqual([
			'current-trips',
			'past-trips',
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
