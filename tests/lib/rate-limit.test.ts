import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ countHitDb: vi.fn() }))
vi.mock('@/lib/db/rate-limits', () => ({ countHitDb: mocks.countHitDb }))

import {
	peekRateLimit,
	rateLimit,
	rateLimitAll,
	rateLimitMessage,
	resetRateLimiter,
} from '@/lib/rate-limit'
import type { Limit } from '@/lib/rate-limit/limits'
import * as limits from '@/lib/rate-limit/limits'

const LIMIT: Limit = { name: 'test', max: 3, windowSeconds: 60 }
const OTHER: Limit = { name: 'other', max: 1, windowSeconds: 60 }

/** The database counting like Postgres would: per bucket, never resetting. */
function countLikeTheDatabase(retryAfter = 30) {
	const counts = new Map<string, number>()
	mocks.countHitDb.mockImplementation(async (bucket: string) => {
		const hits = (counts.get(bucket) ?? 0) + 1
		counts.set(bucket, hits)
		return { hits, retryAfter }
	})
	return counts
}

beforeEach(() => {
	resetRateLimiter()
	mocks.countHitDb.mockReset()
})

describe('the limits', () => {
	it('are named, positive and generous enough for real use', () => {
		const all = Object.values(limits) as Limit[]
		expect(all.length).toBeGreaterThan(0)
		const names = new Set(all.map((limit) => limit.name))
		expect(names.size).toBe(all.length)
		for (const limit of all) {
			expect(limit.max).toBeGreaterThanOrEqual(30)
			expect(limit.windowSeconds).toBeGreaterThan(0)
		}
	})
})

describe('rateLimit', () => {
	it('allows up to the limit in the database, then refuses with the time left', async () => {
		countLikeTheDatabase(30)
		for (let i = 0; i < 3; i++) {
			await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
		}
		await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({
			ok: false,
			retryAfter: 30,
		})
		expect(mocks.countHitDb).toHaveBeenCalledWith('test:pat', 60)
		expect(mocks.countHitDb).toHaveBeenCalledTimes(3)
	})

	it('refuses from memory once over, without asking the database again', async () => {
		countLikeTheDatabase(30)
		for (let i = 0; i < 4; i++) await rateLimit(LIMIT, 'pat')
		mocks.countHitDb.mockClear()
		const result = await rateLimit(LIMIT, 'pat')
		expect(result.ok).toBe(false)
		expect(mocks.countHitDb).not.toHaveBeenCalled()
		expect(peekRateLimit(LIMIT, 'pat').ok).toBe(false)
	})

	it('refuses when other instances already used up the window', async () => {
		mocks.countHitDb.mockResolvedValue({ hits: 50, retryAfter: 12 })
		await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({
			ok: false,
			retryAfter: 12,
		})
	})

	it('keeps buckets apart', async () => {
		countLikeTheDatabase()
		for (let i = 0; i < 4; i++) await rateLimit(LIMIT, 'pat')
		await expect(rateLimit(LIMIT, 'sam')).resolves.toEqual({ ok: true })
		await expect(rateLimit(OTHER, 'pat')).resolves.toEqual({ ok: true })
	})

	it('starts a new window once the old one ends', async () => {
		vi.useFakeTimers()
		countLikeTheDatabase(60)
		for (let i = 0; i < 4; i++) await rateLimit(LIMIT, 'pat')
		expect(peekRateLimit(LIMIT, 'pat').ok).toBe(false)
		vi.advanceTimersByTime(61_000)
		expect(peekRateLimit(LIMIT, 'pat')).toEqual({ ok: true })
		mocks.countHitDb.mockResolvedValue({ hits: 1, retryAfter: 60 })
		await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
	})

	describe('fails open', () => {
		it('allows requests and logs once when the table is missing', async () => {
			const error = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {})
			mocks.countHitDb.mockRejectedValue(
				Object.assign(new Error('relation does not exist'), {
					code: '42P01',
				}),
			)
			await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
			await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
			expect(error).toHaveBeenCalledTimes(1)
			expect(error.mock.calls[0][0]).toContain(
				'2026-11-16-rate-limits.sql',
			)
		})

		it('allows requests and logs once when the database errors', async () => {
			const error = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {})
			const failure = new Error('connection refused')
			mocks.countHitDb.mockRejectedValue(failure)
			await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
			await expect(rateLimit(LIMIT, 'sam')).resolves.toEqual({ ok: true })
			expect(error).toHaveBeenCalledTimes(1)
			expect(error).toHaveBeenCalledWith(
				expect.stringContaining('could not count'),
				failure,
			)
		})

		it('handles a thrown non-error', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {})
			mocks.countHitDb.mockRejectedValue(null)
			await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({ ok: true })
		})

		it('still limits each instance in memory while the database is down', async () => {
			vi.spyOn(console, 'error').mockImplementation(() => {})
			mocks.countHitDb.mockRejectedValue(new Error('down'))
			for (let i = 0; i < 3; i++) {
				await expect(rateLimit(LIMIT, 'pat')).resolves.toEqual({
					ok: true,
				})
			}
			const refused = await rateLimit(LIMIT, 'pat')
			expect(refused.ok).toBe(false)
		})
	})

	it('keeps memory bounded', async () => {
		vi.useFakeTimers()
		countLikeTheDatabase(1)
		const many: Limit = { name: 'many', max: 5, windowSeconds: 1 }
		// Fill memory with windows that then end, so the sweep drops them.
		for (let i = 0; i < 10_000; i++) await rateLimit(many, `ip${i}`)
		vi.advanceTimersByTime(2_000)
		await rateLimit(OTHER, 'blocked')
		await expect(rateLimit(OTHER, 'blocked')).resolves.toMatchObject({
			ok: false,
		})
		// Fill it with live windows, so the sweep finds nothing and clears.
		for (let i = 0; i < 9_999; i++) await rateLimit(LIMIT, `live${i}`)
		expect(peekRateLimit(OTHER, 'blocked').ok).toBe(false)
		await rateLimit(LIMIT, 'after-clear')
		expect(peekRateLimit(OTHER, 'blocked')).toEqual({ ok: true })
	})
})

describe('peekRateLimit', () => {
	it('allows a bucket it has not seen, without counting', () => {
		expect(peekRateLimit(LIMIT, 'new')).toEqual({ ok: true })
		expect(mocks.countHitDb).not.toHaveBeenCalled()
	})

	it('allows a bucket under its limit', async () => {
		countLikeTheDatabase()
		await rateLimit(LIMIT, 'pat')
		expect(peekRateLimit(LIMIT, 'pat')).toEqual({ ok: true })
	})
})

describe('rateLimitAll', () => {
	it('allows when every limit allows', async () => {
		countLikeTheDatabase()
		await expect(rateLimitAll('pat', [LIMIT, OTHER])).resolves.toEqual({
			ok: true,
		})
	})

	it('stops at the first limit that refuses', async () => {
		mocks.countHitDb.mockResolvedValue({ hits: 2, retryAfter: 9 })
		await expect(rateLimitAll('pat', [OTHER, LIMIT])).resolves.toEqual({
			ok: false,
			retryAfter: 9,
		})
		expect(mocks.countHitDb).toHaveBeenCalledTimes(1)
		expect(mocks.countHitDb).toHaveBeenCalledWith('other:pat', 60)
	})
})

describe('rateLimitMessage', () => {
	it('says how long to wait, in friendly terms', () => {
		expect(rateLimitMessage(5)).toBe(
			'Too many requests in a short time. Please wait a minute and try again.',
		)
		expect(rateLimitMessage(60)).toContain('about 1 minute and')
		expect(rateLimitMessage(601)).toContain('about 11 minutes')
	})
})
