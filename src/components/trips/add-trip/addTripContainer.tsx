'use client'
import { Activity, useState } from 'react'
import { ButtonToggle } from '@/components/buttons/toggle-button'
import AddTripForm from '../../forms/add-a-trip-form'

export default function AddTripContainer({
	setOptimisticCurrentTrips,
}: {
	setOptimisticCurrentTrips: (action: {
		type: 'ADD' | 'REMOVE' | 'UPDATE'
		payload: any
	}) => void
}) {
	const [showForm, setShowForm] = useState(false)

	return (
		<div className="flex w-full flex-col justify-between gap-4 rounded-sm bg-[var(--color-primary)] p-4 md:w-4/6 md:flex-row ml-auto">
			<div className="flex w-full flex-col">
				<Activity mode={showForm ? 'visible' : 'hidden'}>
					<AddTripForm
						setOptimisticCurrentTrips={setOptimisticCurrentTrips}
						setShowForm={setShowForm}
					/>
				</Activity>
			</div>
			<div className="flex w-full flex-col justify-end md:w-1/6">
				<ButtonToggle
					onClick={() => setShowForm(!showForm)}
					text="Add Trip"
					toggle={showForm}
					toggleText="Cancel"
				></ButtonToggle>
			</div>
		</div>
	)
}
