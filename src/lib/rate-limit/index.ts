import { countHitDb } from '@/lib/db/rate-limits'
import type { Limit } from './limits'

/*
 * A fixed-window rate limiter in two layers:
 *
 * - Memory, per server instance: cheap, and once a bucket is over its limit
 *   the instance refuses it without touching the database until the window
 *   ends. On Vercel an instance is short-lived and there are many, so this
 *   alone isn't the limit.
 * - Postgres (pt_rate_limits), shared by every instance: the real count, one
 *   atomic upsert per check.
 *
 * It fails open: if the database can't count (the migration hasn't run, or
 * the database errors), the request is allowed and only the memory layer
 * applies. That's logged once per instance. The limiter never takes the app
 * down.
 */

export type RateLimitResult =
	| { ok: true }
	| { ok: false /** Seconds until the window ends. */; retryAfter: number }

type Window = { count: number; resetAt: number }

/** Buckets the memory layer keeps before it sweeps out ended windows. */
const MAX_MEMORY_BUCKETS = 10_000

const memory = new Map<string, Window>()
let loggedFailure = false

/** Forgets every in-memory count and the logged failure. For tests. */
export function resetRateLimiter() {
	memory.clear()
	loggedFailure = false
}

function remember(bucket: string, window: Window, now: number) {
	if (memory.size >= MAX_MEMORY_BUCKETS) {
		for (const [key, value] of memory) {
			if (value.resetAt <= now) memory.delete(key)
		}
		if (memory.size >= MAX_MEMORY_BUCKETS) memory.clear()
	}
	memory.set(bucket, window)
}

const refused = (window: Window, now: number): RateLimitResult => ({
	ok: false,
	retryAfter: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
})

function logFailure(error: unknown) {
	if (loggedFailure) return
	loggedFailure = true
	const missingTable = (error as { code?: unknown } | null)?.code === '42P01'
	console.error(
		missingTable
			? 'Rate limits: the pt_rate_limits table is missing; run src/lib/sql/2026-11-16-rate-limits.sql. Requests are allowed until then.'
			: 'Rate limits: could not count in the database; requests are allowed.',
		missingTable ? '' : error,
	)
}

/**
 * Whether the bucket is already over its limit by this instance's memory,
 * without counting a hit or touching the database. For refusing early,
 * before doing anything expensive.
 */
export function peekRateLimit(limit: Limit, who: string): RateLimitResult {
	const now = Date.now()
	const window = memory.get(`${limit.name}:${who}`)
	if (window && window.resetAt > now && window.count >= limit.max) {
		return refused(window, now)
	}
	return { ok: true }
}

/** Counts one hit against the limit for `who` and says whether it's allowed. */
export async function rateLimit(
	limit: Limit,
	who: string,
): Promise<RateLimitResult> {
	const bucket = `${limit.name}:${who}`
	const now = Date.now()
	let window = memory.get(bucket)
	if (!window || window.resetAt <= now) {
		window = { count: 0, resetAt: now + limit.windowSeconds * 1000 }
		remember(bucket, window, now)
	}
	if (window.count >= limit.max) return refused(window, now)
	window.count += 1

	try {
		const shared = await countHitDb(bucket, limit.windowSeconds)
		// The database is the real count; the memory layer follows it.
		window.count = shared.hits
		window.resetAt = now + shared.retryAfter * 1000
		if (shared.hits > limit.max) {
			return { ok: false, retryAfter: shared.retryAfter }
		}
	} catch (error) {
		logFailure(error)
	}
	return { ok: true }
}

/** Checks several limits in order, stopping at the first that refuses. */
export async function rateLimitAll(
	who: string,
	limits: Limit[],
): Promise<RateLimitResult> {
	for (const limit of limits) {
		const result = await rateLimit(limit, who)
		if (!result.ok) return result
	}
	return { ok: true }
}

/** A friendly "slow down" sentence for a refused request. */
export function rateLimitMessage(retryAfter: number) {
	const minutes = Math.ceil(retryAfter / 60)
	const wait =
		retryAfter < 60
			? 'a minute'
			: `about ${minutes} minute${minutes === 1 ? '' : 's'}`
	return `Too many requests in a short time. Please wait ${wait} and try again.`
}
