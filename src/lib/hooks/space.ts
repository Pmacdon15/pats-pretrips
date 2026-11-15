'use client'
import { useAuth } from '@clerk/nextjs'
import { ORG_ADMIN_ROLE } from '@/lib/space-roles'

/*
 * The signed-in driver's active space, from Clerk's client session
 * (docs/organizations.md): their personal space, or the organization picked
 * in the header's switcher. Only for showing or hiding controls: the server
 * checks the same thing again on every change (src/lib/auth.ts).
 */
export function useSpace() {
	const { orgId, has } = useAuth()
	const inOrg = Boolean(orgId)
	return {
		/** The active organization's ID; null in the personal space. */
		orgId: orgId ?? null,
		inOrg,
		/** A solo user always manages their own space; in an org, its admins do. */
		canManage: !inOrg || Boolean(has?.({ role: ORG_ADMIN_ROLE })),
	}
}
