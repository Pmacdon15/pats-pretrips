import { auth, currentUser } from '@clerk/nextjs/server'

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
