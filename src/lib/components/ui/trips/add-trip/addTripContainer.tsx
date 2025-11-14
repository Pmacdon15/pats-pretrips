'use client'
import { Activity, useEffect, useState } from 'react'
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

function ButtonToggle({
	text,
	toggleText,
	onClick,
	toggle,
}: {
	text: string
	toggleText: string
	onClick: () => void
	toggle: boolean
}) {
	return (
		<button
			className={`rounded-lg p-4 ${toggle ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} shadow-lg`}
			onClick={onClick}
			type="button"
		>
			{toggle ? toggleText : text}
		</button>
	)
}

export function useGetLocation() {
	const [location, setLocation] = useState<{
		latitude: number
		longitude: number
	} | null>(null)

	useEffect(() => {
		async function getLocation() {
			if (navigator.geolocation) {
				navigator.geolocation.getCurrentPosition(async (position) => {
					setLocation({
						latitude: position.coords.latitude,
						longitude: position.coords.longitude,
					})
				})
			} else {
				console.log('Geolocation is not supported by this browser.')
			}
		}
		getLocation()
	}, [])

	return { location }
}
