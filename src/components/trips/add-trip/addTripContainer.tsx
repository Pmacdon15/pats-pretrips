'use client'
import { Activity, useState } from 'react'
import { ButtonToggle } from '@/components/buttons/toggle-button'
import AddTripForm from '../../forms/add-a-trip-form'

export default function AddTripContainer() {
	const [showForm, setShowForm] = useState(false)

	return (
		<div className="flex w-full flex-col justify-between gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6 md:flex-row">
			<div className="flex w-full flex-col">
				<Activity mode={showForm ? 'visible' : 'hidden'}>
					<AddTripForm setShowForm={setShowForm} />
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
