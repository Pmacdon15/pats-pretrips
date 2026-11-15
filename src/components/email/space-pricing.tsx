'use client'
import { PricingTable } from '@clerk/nextjs'
import { useSpace } from '@/lib/hooks/space'

/**
 * The plans that unlock emailing pre-trips, for the active space: the
 * driver's own plans in their personal space, the organization's in an
 * organization's (docs/organizations.md).
 */
export function SpacePricingTable() {
	const { inOrg } = useSpace()
	return (
		<PricingTable
			for={inOrg ? 'organization' : 'user'}
			newSubscriptionRedirectUrl="/email"
		/>
	)
}
