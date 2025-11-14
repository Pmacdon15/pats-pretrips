'use client'

import { useRouter } from 'next/navigation'
import { Activity, useState } from 'react'

export default function DisplayTrips({
	currentTripsComponent,
	pastTripsComponent,
}: {
	currentTripsComponent: React.ReactNode
	pastTripsComponent: React.ReactNode
}) {
	const [selectedTripsName, setSelectedTripsName] = useState<
		'Current' | 'Past'
	>('Current')

	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<div className="flex items-center justify-between">
				<h1 className="min-w-fit text-2xl">
					{selectedTripsName} Trips
				</h1>
			</div>
			<TripSwitcher
				selectedTripsName={selectedTripsName}
				setSelectedTripsName={setSelectedTripsName}
			/>

			<Activity
				mode={selectedTripsName === 'Current' ? 'visible' : 'hidden'}
			>
				{currentTripsComponent}
			</Activity>
			<Activity
				mode={selectedTripsName !== 'Current' ? 'visible' : 'hidden'}
			>
				{pastTripsComponent}
			</Activity>
		</div>
	)
}

interface TripSwitcherProps {
	selectedTripsName: 'Current' | 'Past'
	setSelectedTripsName: React.Dispatch<
		React.SetStateAction<'Current' | 'Past'>
	> // Corrected type for setSelectedTripsName
}

//TODO: Set page to 0 on page switch

function TripSwitcher({
	selectedTripsName,
	setSelectedTripsName,
}: TripSwitcherProps) {
	const router = useRouter()

	return (
		<div className="flex justify-end gap-2 rounded-sm bg-[var(--color-background)] p-2">
			{selectedTripsName === 'Past' && (
				<button
					className="cursor-pointer"
					onClick={() => {
						setSelectedTripsName('Current')
						router.replace('/pretrips')
					}}
					type="button"
				>
					View Current Trips
				</button>
			)}
			{selectedTripsName === 'Current' && (
				<button
					className="cursor-pointer"
					onClick={() => {
						setSelectedTripsName('Past')
						router.replace('/pretrips')
					}}
					type="button"
				>
					View Past Trips
				</button>
			)}
		</div>
	)
}
