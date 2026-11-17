import { Container, Truck } from 'lucide-react'
import { TrailerList } from '@/components/trailers/trailer-list'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { VehicleList } from '@/components/vehicles/vehicle-list'

export const metadata = { title: 'Vehicles' }

export default function Page() {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Truck className="size-5" /> Your vehicles
					</CardTitle>
					<CardDescription>
						Save the trucks you drive, then pick one on a new
						pre-trip to fill in its make, model and truck plate.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<VehicleList />
				</CardContent>
			</Card>
			<Card id="trailers">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Container className="size-5" /> Your trailers
					</CardTitle>
					<CardDescription>
						Save the trailers you pull with their plates, then pick
						them on a new pre-trip to fill in the trailer plates.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TrailerList />
				</CardContent>
			</Card>
		</div>
	)
}
