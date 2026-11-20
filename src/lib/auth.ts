import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { EMAIL_FEATURE } from '@/lib/email/config'
import { errorForLog } from '@/lib/log'
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
 * The organization's name, from Clerk: the carrier on every pre-trip started
 * in its space. Null when it can't be read (logged), so the caller can fall
 * back to the carrier the driver typed.
 */
export async function getOrgName(orgId: string): Promise<string | null> {
	try {
		const client = await clerkClient()
		const org = await client.organizations.getOrganization({
			organizationId: orgId,
		})
		return org.name?.trim() || null
	} catch (error) {
		console.error(
			'Organizations: could not read the name of',
			orgId,
			errorForLog(error),
		)
		return null
	}
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

/** Who pays for a space's plan: a driver (personal space) or an organization. */
export type PlanPayer = { userId: string } | { orgId: string }

/**
 * Whether a driver's or an organization's own Clerk plan includes emailing
 * pre-trips, read from Clerk Billing. For callers with no Clerk session to
 * call `has()` on, such as AI apps over MCP (an OAuth access token carries
 * no plan features). Same scoping as canEmailPretrips: a driver's plan
 * covers their personal space, an organization's plan its own. False, and
 * logged, when Clerk can't be read: a plan check never fails a trip save.
 */
export async function planIncludesEmail(payer: PlanPayer): Promise<boolean> {
	try {
		const client = await clerkClient()
		const subscription =
			'orgId' in payer
				? await client.billing.getOrganizationBillingSubscription(
						payer.orgId,
					)
				: await client.billing.getUserBillingSubscription(payer.userId)
		return subscription.subscriptionItems.some(
			(item) =>
				item.status === 'active' &&
				(item.plan?.features ?? []).some(
					(feature) => feature.slug === EMAIL_FEATURE,
				),
		)
	} catch (error) {
		console.error(
			'Billing: could not read the plan of',
			'orgId' in payer ? payer.orgId : payer.userId,
			errorForLog(error),
		)
		return false
	}
}

/**
 * A driver from their Clerk user ID, for callers without a session (AI
 * apps). Trips belong to `email` (the verified caller's), so that is kept;
 * the name is read from Clerk, and left out when Clerk can't be read.
 */
export async function getDriverById(
	userId: string,
	email: string,
): Promise<Driver> {
	try {
		const client = await clerkClient()
		const user = await client.users.getUser(userId)
		return {
			userId,
			email,
			givenName: user.firstName,
			familyName: user.lastName,
		}
	} catch (error) {
		console.error(
			'Clerk: could not read the name of',
			userId,
			errorForLog(error),
		)
		return { userId, email, givenName: null, familyName: null }
	}
}
