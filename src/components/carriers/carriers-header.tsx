'use client'

import { Building2 } from 'lucide-react'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSpace } from '@/lib/hooks/space'

/**
 * The Carriers page's heading: the driver's own carriers, or in an
 * organization's space the carriers it shares with its members.
 */
export function CarriersHeader() {
	const { inOrg, orgName } = useSpace()
	return (
		<CardHeader>
			<CardTitle className="flex items-center gap-2">
				<Building2 className="size-5" />{' '}
				{inOrg
					? `${orgName ?? 'Your organization'}'s carriers`
					: 'Your carriers'}
			</CardTitle>
			<CardDescription>
				{inOrg
					? 'The companies your organization hauls for and their addresses, shared with every member. Pick one on a new pre-trip to fill them in.'
					: 'Save the companies you haul for and their addresses, then pick one on a new pre-trip to fill them in.'}
			</CardDescription>
		</CardHeader>
	)
}
