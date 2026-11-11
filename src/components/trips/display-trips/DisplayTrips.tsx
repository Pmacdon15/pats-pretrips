'use client'

import { useSearchParams } from 'next/navigation'
import { Activity, use, useOptimistic, useState } from 'react'
import { Card } from '@/components/ui/card'
import type { Trip, TripsAction, TripsResponse } from '@/lib/types/types'
import { cn } from '@/lib/utils'
import AddTripContainer from '../add-trip/addTripContainer'
import TripsTable from './trips-table'

export type { TripsResponse }

type View = 'current' | 'past'

export default function DisplayTrips({
	currentTripsPromise,
	pastTripsPromise,
}: {
	currentTripsPromise: Promise<TripsResponse>
	pastTripsPromise: Promise<TripsResponse>
}) {
	const searchParams = useSearchParams()
	const [view, setView] = useState<View>(
		searchParams.has('pastPage') ? 'past' : 'current',
	)

	const currentTripsResult = use(currentTripsPromise)
	const pastTrips = use(pastTripsPromise)

	const [currentTrips, setOptimisticCurrentTrips] = useOptimistic<
		TripsResponse,
		TripsAction
	>(currentTripsResult, (state, action) => {
		switch (action.type) {
			case 'ADD':
				return { ...state, trips: [action.payload, ...state.trips] }
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
					trips: state.trips.map((t: Trip) =>
						t.tripid === action.payload.tripid
							? { ...t, ...action.payload }
							: t,
					),
				}
			default:
				return state
		}
	})

	return (
		<div className="flex flex-col gap-6">
			<PageTitle />
			<AddTripContainer
				setOptimisticCurrentTrips={setOptimisticCurrentTrips}
			/>
			<Card className="overflow-hidden">
				<div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
					<div>
						<h2 className="font-semibold text-lg">
							{view === 'current'
								? "Today's trips"
								: 'Past trips'}
						</h2>
						<p className="text-muted-foreground text-sm">
							{view === 'current'
								? 'Inspections from the last 24 hours. You can still add on-route defects.'
								: 'Inspections older than 24 hours.'}
						</p>
					</div>
					<TripSwitcher onChange={setView} value={view} />
				</div>
				<Activity mode={view === 'current' ? 'visible' : 'hidden'}>
					<TripsTable
						emptyMessage="No pre-trips in the last 24 hours. Start one above."
						pageParam="page"
						trips={currentTrips}
					/>
				</Activity>
				<Activity mode={view === 'past' ? 'visible' : 'hidden'}>
					<TripsTable
						emptyMessage="No past trips yet."
						pageParam="pastPage"
						trips={pastTrips}
					/>
				</Activity>
			</Card>
		</div>
	)
}

export function PageTitle() {
	return (
		<div>
			<h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
				Your pre-trips
			</h1>
			<p className="mt-1 text-muted-foreground">
				Record a new inspection or look back at previous ones.
			</p>
		</div>
	)
}

export function TripSwitcher({
	value,
	onChange,
}: {
	value: View
	onChange?: (view: View) => void
}) {
	const options: { id: View; label: string }[] = [
		{ id: 'current', label: 'Today' },
		{ id: 'past', label: 'Past' },
	]
	return (
		<div
			aria-label="Choose which trips to show"
			className="inline-flex self-start rounded-lg bg-muted p-1"
			role="tablist"
		>
			{options.map((option) => (
				<button
					aria-selected={value === option.id}
					className={cn(
						'rounded-md px-4 py-1.5 font-medium text-sm transition-colors',
						value === option.id
							? 'bg-card text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground',
					)}
					key={option.id}
					onClick={() => onChange?.(option.id)}
					role="tab"
					type="button"
				>
					{option.label}
				</button>
			))}
		</div>
	)
}
