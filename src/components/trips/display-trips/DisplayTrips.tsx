'use client'

import { Activity, use, useOptimistic, useState } from 'react'
import type { Trip } from '@/lib/types/types'
import AddTripContainer from '../add-trip/addTripContainer'
import TripsTable from './trips-table'

export interface TripsResponse {
	trips: Trip[]
	hasMore: boolean
}

export default function DisplayTrips({
	currentTripsPromise,
	pastTripsPromise,
}: {
	currentTripsPromise: Promise<TripsResponse>
	pastTripsPromise: Promise<TripsResponse>
}) {
	const [selectedTripsName, setSelectedTripsName] = useState<
		'Current' | 'Past'
	>('Current')

	const currentTripsResult = use(currentTripsPromise)
	const pastTripsResult = use(pastTripsPromise)

	const [optimisticCurrentTrips, setOptimisticCurrentTrips] = useOptimistic<
		TripsResponse,
		{ type: 'ADD' | 'REMOVE' | 'UPDATE'; payload: any }
	>(currentTripsResult, (state, action) => {
		switch (action.type) {
			case 'ADD':
				return {
					...state,
					trips: [action.payload as Trip, ...state.trips],
				}
			case 'REMOVE':
				return {
					...state,
					trips: state.trips.filter(
						(t) => t.tripid !== action.payload,
					),
				}
			case 'UPDATE':
				return {
					...state,
					trips: state.trips.map((t) =>
						t.tripid === action.payload.tripid
							? { ...t, ...action.payload }
							: t,
					),
				}
			default:
				return state
		}
	})

	// This is now the object { trips: Trip[]; hasMore: boolean }
	const currentTrips: TripsResponse = optimisticCurrentTrips

	// Mapping past trips to match the same object structure
	const pastTrips: TripsResponse = pastTripsResult

	return (
		<div className="flex w-full flex-col gap-4 rounded-sm bg-[var(--color-primary)] p-4 shadow-sm md:w-4/6">
			<AddTripContainer
				setOptimisticCurrentTrips={setOptimisticCurrentTrips}
			/>
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
				{/* Ensure TripsTable is updated to accept the object or just the array */}
				<TripsTable trips={currentTrips} />
			</Activity>
			<Activity
				mode={selectedTripsName !== 'Current' ? 'visible' : 'hidden'}
			>
				<TripsTable trips={pastTrips} />
			</Activity>
		</div>
	)
}

interface TripSwitcherProps {
	selectedTripsName: 'Current' | 'Past'
	setSelectedTripsName: React.Dispatch<
		React.SetStateAction<'Current' | 'Past'>
	>
}

function TripSwitcher({
	selectedTripsName,
	setSelectedTripsName,
}: TripSwitcherProps) {
	return (
		<div className="flex justify-end gap-2 rounded-sm bg-[var(--color-background)] p-2">
			<button
				className="cursor-pointer"
				onClick={() => {
					const nextMode =
						selectedTripsName === 'Current' ? 'Past' : 'Current'
					setSelectedTripsName(nextMode)
				}}
				type="button"
			>
				View {selectedTripsName === 'Current' ? 'Past' : 'Current'}{' '}
				Trips
			</button>
		</div>
	)
}
