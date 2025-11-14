'use client'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import type { Trip } from '@/lib/types/types'

export default function TripsTable({
	tripsPromise,
}: {
	tripsPromise: Promise<{ trips: Trip[]; hasMore: boolean }>
}) {
	const trips = use(tripsPromise)

	return (
		<table className="w-full overflow-hidden rounded-sm border shadow-sm">
			<TableHead />
			<TableBody selectedTrips={trips.trips} />
		</table>
	)
}

function TableHead() {
	return (
		<thead>
			<tr className="rounded-sm border-b bg-[var(--color-background)]">
				<th className="p-2 text-left">Date</th>
				<th className="p-2 text-left">Truck</th>
				<th className="p-2 text-left">Trailer</th>
				<th className="p-2 text-left">Defects</th>
			</tr>
		</thead>
	)
}

function TableBody({ selectedTrips }: { selectedTrips: Trip[] }) {
	const router = useRouter()

	const handleRowClick = (tripId: string) => {
		router.push(`/pretrip/${tripId}`)
	}

	return (
		<tbody className="rounded-sm">
			{selectedTrips?.map((trip: Trip, index: number) => (
				<tr
					className="cursor-pointer border hover:bg-gray-100"
					key={index}
					onClick={() => handleRowClick(String(trip.tripid))}
				>
					<td className="w-2/6 p-2">
						{new Date(trip.date).toLocaleString('en-CA', {
							dateStyle: 'short',
							timeStyle: 'short',
						})}
					</td>
					<td className="p-2">{trip.truckplate}</td>
					<td className="p-2">{trip.trailerplatea}</td>
					<td className="p-2">
						{trip.defects ? trip.defects : 'No defects'}
					</td>
				</tr>
			))}
		</tbody>
	)
}
