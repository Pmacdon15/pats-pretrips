import { auth, currentUser } from '@clerk/nextjs/server'
import { EMAIL_FEATURE } from '@/lib/email/config'

/*
 * The signed-in driver, from Clerk. Trips belong to the driver's email, so
 * that's what the app needs; the name is shown on a trip's page. userId is
 * the Clerk user ID, which never changes: every write also records it on the
 * row (src/lib/db/owner-stamps.ts), so reads can later move from the email to
 * it (see docs/clerk-user-id.md).
 */

export type Driver = {
	/** The Clerk user ID (user_...). */
	userId: string
	email: string
	givenName: string | null
	familyName: string | null
}

export async function getDriver(): Promise<Driver | null> {
	const user = await currentUser()
	const email = user?.primaryEmailAddress?.emailAddress
	if (!user || !email) return null
	return {
		userId: user.id,
		email,
		givenName: user.firstName,
		familyName: user.lastName,
	}
}

export async function getDriverEmail() {
	return (await getDriver())?.email ?? null
}

/** The driver's full name, or their email when Clerk has no name. */
export function driverName(driver: Driver) {
	return (
		[driver.givenName, driver.familyName].filter(Boolean).join(' ') ||
		driver.email
	)
}

/** Whether the driver's Clerk plan includes emailing pre-trips. */
export async function canEmailPretrips() {
	const { has, userId } = await auth()
	return Boolean(userId) && has({ feature: EMAIL_FEATURE })
}
