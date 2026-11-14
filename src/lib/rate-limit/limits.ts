/*
 * Every rate limit in the app, in one place. Each one counts per bucket (a
 * driver's email, or a client IP for sign-in failures) in fixed windows; the
 * request after `max` in a window is refused until the window ends.
 *
 * They're set well above what a driver, or an AI app working for one, does
 * in normal use: a driver files a handful of pre-trips a day, and an AI app
 * makes a few tool calls per message. They exist to stop runaway loops,
 * scripts and abuse from running up the database, Clerk and Google bills.
 * See docs/rate-limits.md.
 */

export type Limit = {
	/** The bucket prefix, e.g. "geocode", stored as "geocode:<who>". */
	name: string
	/** Requests allowed in one window. */
	max: number
	/** The window's length, in seconds. */
	windowSeconds: number
}

const MINUTE = 60
const HOUR = 60 * MINUTE

/**
 * Failed sign-ins on /api/mcp per client IP (bad, revoked or expired API
 * keys and access tokens). A real app fails a few times at most, while it
 * refreshes a token. Once over, every request from the IP, even with a good
 * token, gets a 429 until the window ends, so guessed tokens stop reaching
 * the database and Clerk.
 */
export const MCP_AUTH_FAILURES: Limit = {
	name: 'mcp-auth-failures',
	max: 30,
	windowSeconds: 10 * MINUTE,
}

/** MCP tool calls per driver, across every AI app they've connected. */
export const MCP_TOOL_CALLS: Limit = {
	name: 'mcp-tools',
	max: 300,
	windowSeconds: 5 * MINUTE,
}

/**
 * Defect repairs recorded per driver, from the web app and AI apps together.
 * Each one uploads and compresses an invoice and a signature image.
 */
export const REPAIR_UPLOADS: Limit = {
	name: 'repair-uploads',
	max: 30,
	windowSeconds: HOUR,
}

/** Address lookups (the paid Google Geocoding API) per driver. */
export const GEOCODE: Limit = {
	name: 'geocode',
	max: 60,
	windowSeconds: HOUR,
}

/** Saving a signature or signing a pre-trip, per driver. Each one processes an image. */
export const SIGNATURES: Limit = {
	name: 'signatures',
	max: 30,
	windowSeconds: HOUR,
}

/** New pre-trips and on-route defects added from the web app, per driver. */
export const TRIP_WRITES: Limit = {
	name: 'trip-writes',
	max: 60,
	windowSeconds: HOUR,
}
