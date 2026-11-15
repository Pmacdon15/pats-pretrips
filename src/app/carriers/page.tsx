import { Building2 } from 'lucide-react'
import { CarrierList } from '@/components/carriers/carrier-list'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'

export const metadata = { title: "Carriers · Pat's PreTrips" }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Building2 className="size-5" /> Your carriers
					</CardTitle>
					<CardDescription>
						Save the companies you haul for and their addresses,
						then pick one on a new pre-trip to fill them in.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<CarrierList />
				</CardContent>
			</Card>
		</div>
	)
}
