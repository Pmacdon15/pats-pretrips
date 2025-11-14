'use client'
import { Activity, useState } from 'react'
import { Pagination } from '../../pagination/pagination-buttons'

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

	const hasMorePastTrips = true

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

			<Pagination hasMorePastTrips={hasMorePastTrips} />
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
	return (
		<div className="flex justify-end gap-2 rounded-sm bg-[var(--color-background)] p-2">
			{selectedTripsName === 'Past' && (
				<button
					className="cursor-pointer"
					onClick={() => {
						setSelectedTripsName('Current')						
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
					}}
					type="button"
				>
					View Past Trips
				</button>
			)}
		</div>
	)
}
