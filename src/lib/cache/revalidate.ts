import { revalidateTag, updateTag } from 'next/cache'
import { CACHE_TAGS } from './tags'

/*
 * Every cache invalidation lives here; mutations call these rather than
 * updateTag or revalidateTag themselves.
 *
 * Not a 'use server' file on purpose: that would let any browser call these
 * as server actions and clear any driver's cache.
 */

/** From a server action: the driver sees their change on this same request. */
export function revalidateDriverTrips(email: string) {
	updateTag(CACHE_TAGS.driverTrips(email))
}

/**
 * From a route handler (the MCP server), where updateTag isn't allowed: the
 * entries expire now, so the web app's next load reads fresh.
 */
export function expireDriverTrips(email: string) {
	revalidateTag(CACHE_TAGS.driverTrips(email), { expire: 0 })
}
