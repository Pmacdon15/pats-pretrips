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

/** From a server action: the driver sees their saved vehicles change now. */
export function revalidateDriverVehicles(email: string) {
	updateTag(CACHE_TAGS.driverVehicles(email))
}

/** From a route handler (the MCP server): the vehicle list expires now. */
export function expireDriverVehicles(email: string) {
	revalidateTag(CACHE_TAGS.driverVehicles(email), { expire: 0 })
}

/** From a server action: the driver sees their saved carriers change now. */
export function revalidateDriverCarriers(email: string) {
	updateTag(CACHE_TAGS.driverCarriers(email))
}

/** From a server action: an organization's members see its vehicles change now. */
export function revalidateOrgVehicles(orgId: string) {
	updateTag(CACHE_TAGS.orgVehicles(orgId))
}

/** From a server action: an organization's members see its carriers change now. */
export function revalidateOrgCarriers(orgId: string) {
	updateTag(CACHE_TAGS.orgCarriers(orgId))
}

/** From a server action: the driver sees their saved trailers change now. */
export function revalidateDriverTrailers(email: string) {
	updateTag(CACHE_TAGS.driverTrailers(email))
}

/** From a server action: an organization's members see its trailers change now. */
export function revalidateOrgTrailers(orgId: string) {
	updateTag(CACHE_TAGS.orgTrailers(orgId))
}

/** From a route handler (the MCP server): the trailer list expires now. */
export function expireDriverTrailers(email: string) {
	revalidateTag(CACHE_TAGS.driverTrailers(email), { expire: 0 })
}

/** From a route handler (the MCP server): an organization's vehicles expire now. */
export function expireOrgVehicles(orgId: string) {
	revalidateTag(CACHE_TAGS.orgVehicles(orgId), { expire: 0 })
}

/** From a route handler (the MCP server): an organization's trailers expire now. */
export function expireOrgTrailers(orgId: string) {
	revalidateTag(CACHE_TAGS.orgTrailers(orgId), { expire: 0 })
}
