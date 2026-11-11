'use client'
import { Plus } from 'lucide-react'
import { Activity, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import type { TripsAction } from '@/lib/types/types'
import AddTripForm from '../../forms/add-a-trip-form'

export default function AddTripContainer({
	setOptimisticCurrentTrips,
}: {
	setOptimisticCurrentTrips: (action: TripsAction) => void
}) {
	const [showForm, setShowForm] = useState(false)

	return (
		<>
			<Activity mode={showForm ? 'hidden' : 'visible'}>
				<Button
					className="h-14 w-full text-base shadow-sm"
					onClick={() => setShowForm(true)}
					size="lg"
				>
					<Plus className="size-5" />
					Start a new pre-trip
				</Button>
			</Activity>
			<Activity mode={showForm ? 'visible' : 'hidden'}>
				<Card>
					<CardHeader>
						<CardTitle>New pre-trip inspection</CardTitle>
						<CardDescription>
							Fill in the unit details and flag any defects you
							found on your walk-around.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<AddTripForm
							onDone={() => setShowForm(false)}
							setOptimisticCurrentTrips={
								setOptimisticCurrentTrips
							}
						/>
					</CardContent>
				</Card>
			</Activity>
		</>
	)
}
