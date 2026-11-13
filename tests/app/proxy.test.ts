import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	handler: undefined as
		| undefined
		| ((auth: unknown, req: unknown) => Promise<void>),
	protect: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', async (orig) => ({
	...(await orig<typeof import('@clerk/nextjs/server')>()),
	clerkMiddleware: (handler: typeof mocks.handler) => {
		mocks.handler = handler
		return handler
	},
}))

import { NextRequest } from 'next/server'
import { config } from '@/proxy'

const visit = async (path: string) => {
	mocks.protect.mockClear()
	await mocks.handler?.(
		{ protect: mocks.protect },
		new NextRequest(`https://patspretrips.ca${path}`),
	)
	return mocks.protect.mock.calls.length > 0
}

describe('proxy', () => {
	it.each([
		'/',
		'/privacy',
		'/termsOfService',
		'/sign-in',
		'/sign-in/factor-one',
		'/sign-up',
		'/sign-up/verify-email-address',
		'/api/mcp',
		'/.well-known/oauth-protected-resource/api/mcp',
	])('leaves %s public', async (path) => {
		expect(await visit(path)).toBe(false)
	})

	it.each([
		'/pretrips',
		'/pretrip/4',
		'/connect',
	])('requires sign-in for %s', async (path) => {
		expect(await visit(path)).toBe(true)
	})

	const matcher = new RegExp(`^${config.matcher[0]}$`)

	it.each([
		'/',
		'/pretrips',
		'/pretrip/4',
		'/api/mcp',
		'/connect',
		'/.well-known/oauth-protected-resource/api/mcp',
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
