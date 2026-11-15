import { auth, currentUser } from '@clerk/nextjs/server'
import { EMAIL_FEATURE } from '@/lib/email/config'
import { ORG_ADMIN_ROLE } from '@/lib/space-roles'

export { ORG_ADMIN_ROLE }

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

/*
 * Spaces (docs/organizations.md). A driver works either in their personal
 * space (no active Clerk organization) or in an organization's space (the
 * organization picked in the header's switcher). The space decides whose
 * saved vehicles, carriers and email settings the app uses, and which plan
 * unlocks emailing pre-trips. Trips, repairs and signatures always stay the
 * driver's own.
 *
 * Admin checks: in their personal space a driver is a solo user and is the
 * admin of it; in an organization only its admins (Clerk role org:admin) are.
 */

export type Space =
	| { kind: 'personal'; isAdmin: true }
	| { kind: 'org'; orgId: string; isAdmin: boolean }

/** The signed-in driver's active space; null when signed out. */
export async function getSpace(): Promise<Space | null> {
	const { userId, orgId, has } = await auth()
	if (!userId) return null
	if (!orgId) return { kind: 'personal', isAdmin: true }
	return { kind: 'org', orgId, isAdmin: has({ role: ORG_ADMIN_ROLE }) }
}

/**
 * Whether the driver may manage their active space: always in their
 * personal space (a solo user), and as an admin in an organization's.
 */
export async function isSpaceAdmin() {
	return (await getSpace())?.isAdmin ?? false
}

/**
 * Whether the active space's Clerk plan includes emailing pre-trips: the
 * driver's own plan in their personal space, the organization's plan in an
 * organization's space. Scoped (`u:` / `o:`) so one space's plan never
 * unlocks email in the other.
 */
export async function canEmailPretrips() {
	const { has, userId, orgId } = await auth()
	if (!userId) return false
	return has({ feature: `${orgId ? 'o' : 'u'}:${EMAIL_FEATURE}` })
}
