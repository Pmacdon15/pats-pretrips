/*
 * Every cache tag the app uses. Nothing else writes a tag string: reads tag
 * with these and src/lib/cache/revalidate.ts clears them.
 *
 * Trips are per driver, so the tag is too: a driver saving a trip only clears
 * their own lists and trip pages, not every driver's.
 */

export const CACHE_TAGS = {
	/** Every trip read for one driver: today's list, past list and trip pages. */
	driverTrips: (email: string) => `trips:${email.toLowerCase()}`,
	/** One driver's saved vehicles. */
	driverVehicles: (email: string) => `vehicles:${email.toLowerCase()}`,
	/** One driver's saved carriers. */
	driverCarriers: (email: string) => `carriers:${email.toLowerCase()}`,
	/** One organization's shared vehicles (docs/organizations.md). */
	orgVehicles: (orgId: string) => `org-vehicles:${orgId}`,
	/** One driver's saved trailers. */
	driverTrailers: (email: string) => `trailers:${email.toLowerCase()}`,
	/** One organization's shared trailers. */
	orgTrailers: (orgId: string) => `org-trailers:${orgId}`,
	/** One organization's shared carriers. */
	orgCarriers: (orgId: string) => `org-carriers:${orgId}`,
} as const
