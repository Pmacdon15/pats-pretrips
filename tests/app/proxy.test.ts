import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	withAuthArgs: [] as unknown[],
	withAuth: (...args: unknown[]) => {
		mocks.withAuthArgs = args
		return args[0]
	},
	handleAuth: vi.fn(() => 'auth-handler'),
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/middleware', () => ({
	withAuth: mocks.withAuth,
}))
vi.mock('@kinde-oss/kinde-auth-nextjs/server', () => ({
	handleAuth: mocks.handleAuth,
}))

import { GET } from '@/app/api/auth/[kindeAuth]/route'
import proxy, { config } from '@/proxy'

describe('proxy', () => {
	it('protects every page except the home page', async () => {
		expect(mocks.withAuthArgs).toEqual([
			expect.any(Function),
			{ publicPaths: ['/'] },
		])
		await expect((proxy as unknown as () => Promise<void>)()).resolves.toBeUndefined()
	})

	const matcher = new RegExp(`^${config.matcher[0]}$`)

	it.each([
		'/',
		'/pretrips',
		'/pretrip/4',
		'/api/auth/login',
	])('runs on %s', (path) => {
		expect(matcher.test(path)).toBe(true)
	})

	it.each([
		'/_next/static/chunk.js',
		'/banner.jpg',
		'/favicon.ico',
	])('skips %s', (path) => {
		expect(matcher.test(path)).toBe(false)
	})
})

describe('auth route', () => {
	it("serves Kinde's auth handler", () => {
		expect(GET).toBe('auth-handler')
	})
})
