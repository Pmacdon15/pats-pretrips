import { neon } from '@neondatabase/serverless'

/*
 * The pt_rate_limits table (src/lib/sql/2026-11-16-rate-limits.sql): one
 * counter per bucket per fixed window. See src/lib/rate-limit for how it's
 * used.
 */

export type WindowCount = {
	/** Hits in the current window, this one included. */
	hits: number
	/** Seconds until the current window ends (at least 1). */
	retryAfter: number
}

/** How many expired windows one check deletes on the way. */
const PRUNE_BATCH = 20

/**
 * Adds one hit to the bucket's current window and answers the new count, in
 * a single statement. Windows line up on multiples of `windowSeconds` since
 * the epoch, by the database's clock, so every server instance agrees on
 * them. The same statement deletes a few windows that have already ended.
 */
export async function countHitDb(
	bucket: string,
	windowSeconds: number,
): Promise<WindowCount> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [row] = await sql`
		WITH pruned AS (
			DELETE FROM pt_rate_limits
			WHERE (bucket, window_start) IN (
				SELECT bucket, window_start FROM pt_rate_limits
				WHERE expires_at < NOW()
				LIMIT ${PRUNE_BATCH}
			)
		), w AS (
			SELECT to_timestamp(
				floor(extract(epoch FROM NOW()) / ${windowSeconds}::int) * ${windowSeconds}::int
			) AS start
		)
		INSERT INTO pt_rate_limits AS r (bucket, window_start, hits, expires_at)
		SELECT ${bucket}, w.start, 1, w.start + make_interval(secs => ${windowSeconds}::int)
		FROM w
		ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
		RETURNING r.hits,
			GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r.expires_at - NOW()))))::int AS retry_after
	`
	return { hits: Number(row.hits), retryAfter: Number(row.retry_after) }
}
