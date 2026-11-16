'use client'

import { Building2, MapPin } from 'lucide-react'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSpace } from '@/lib/hooks/space'

/**
 * The Carriers page's heading. In an organization's space the organization
 * is the carrier, so what it saves here are its sites: the shops, yards and
 * depots its drivers start from.
 */
export function CarriersHeader() {
	const { inOrg, orgName } = useSpace()
	return (
		<CardHeader>
			<CardTitle className="flex items-center gap-2">
				{inOrg ? (
					<>
						<MapPin className="size-5" /> Your sites
					</>
				) : (
					<>
						<Building2 className="size-5" /> Your carriers
					</>
				)}
			</CardTitle>
			<CardDescription>
				{inOrg
					? `${orgName ?? 'Your organization'} is the carrier on every pre-trip started here. Save its shops, yards and depots (like North Shop or South Base) with their addresses, then pick one on a new pre-trip to fill in the address.`
					: 'Save the companies you haul for and their addresses, then pick one on a new pre-trip to fill them in.'}
			</CardDescription>
		</CardHeader>
	)
}
