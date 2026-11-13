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
} as const
