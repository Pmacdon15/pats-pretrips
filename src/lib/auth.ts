import { auth, currentUser } from '@clerk/nextjs/server'
import { EMAIL_FEATURE } from '@/lib/email/config'

/*
 * The signed-in driver, from Clerk. Trips belong to the driver's email, so
 * that's what the app needs; the name is shown on a trip's page.
 */

export type Driver = {
	email: string
	givenName: string | null
	familyName: string | null
}

export async function getDriver(): Promise<Driver | null> {
	const user = await currentUser()
	const email = user?.primaryEmailAddress?.emailAddress
	if (!user || !email) return null
	return { email, givenName: user.firstName, familyName: user.lastName }
}

export async function getDriverEmail() {
	return (await getDriver())?.email ?? null
}

export async function isSignedIn() {
	const { userId } = await auth()
	return Boolean(userId)
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
