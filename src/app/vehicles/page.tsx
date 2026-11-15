import { Truck } from 'lucide-react'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { VehicleList } from '@/components/vehicles/vehicle-list'

export const metadata = { title: "Vehicles · Pat's PreTrips" }

export default function Page() {
	return (
		<div className="mx-auto w-full max-w-3xl px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Truck className="size-5" /> Your vehicles
					</CardTitle>
					<CardDescription>
						Save the trucks you drive, then pick one on a new
						pre-trip to fill in its make, model and plates.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<VehicleList />
				</CardContent>
			</Card>
		</div>
	)
}
