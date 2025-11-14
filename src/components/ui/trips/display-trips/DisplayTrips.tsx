'use client'
import { Activity, useState } from 'react'

export default function DisplayTrips({
	currentTripsComponent,
	pastTripsComponent,
}: {
	currentTripsComponent: React.ReactNode
	pastTripsComponent: React.ReactNode
}) {
	// const { user } = useKindeBrowserClient()
	const [page, setPage] = useState(1)
	const [selectedTripsName, setSelectedTripsName] = useState<
		'Current' | 'Past'
	>('Current')

	// const { data: pastTripsData, isPending: isPendingPast, isError: isErrorLoadingPastTrips } = useGetPastTrips(user?.email|| "", page);

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
				setPage={setPage}
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
			{selectedTripsName === 'Past' && (
				<Pagination
					hasMorePastTrips={hasMorePastTrips}
					page={page}
					setPage={setPage}
				/>
			)}
		</div>
	)
}

interface TripSwitcherProps {
	selectedTripsName: 'Current' | 'Past'
	setSelectedTripsName: React.Dispatch<
		React.SetStateAction<'Current' | 'Past'>
	> // Corrected type for setSelectedTripsName
	setPage: React.Dispatch<React.SetStateAction<number>> // A function to set the page number
}

function TripSwitcher({
	selectedTripsName,
	setSelectedTripsName,
	setPage,
}: TripSwitcherProps) {
	return (
		<div className="flex justify-end gap-2 rounded-sm bg-[var(--color-background)] p-2">
			{selectedTripsName === 'Past' && (
				<button
					className="cursor-pointer"
					onClick={() => {
						setSelectedTripsName('Current')
						setPage(1) // Reset page when switching
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
						setPage(1) // Reset page when switching
					}}
					type="button"
				>
					View Past Trips
				</button>
			)}
		</div>
	)
}

interface PaginationProps {
	page: number
	setPage: React.Dispatch<React.SetStateAction<number>>
	hasMorePastTrips: boolean | undefined
}

function Pagination({ page, setPage, hasMorePastTrips }: PaginationProps) {
	return (
		<div className="mt-4 flex items-center justify-between">
			<button
				disabled={page === 1}
				onClick={() => {
					setPage((old) => Math.max(old - 1, 1))
				}}
				type="button"
			>
				Previous Page
			</button>
			<span>Page {page}</span>
			<button
				disabled={!hasMorePastTrips}
				onClick={() => {
					if (hasMorePastTrips) {
						setPage((old) => old + 1)
					}
				}}
				type="button"
			>
				Next Page
			</button>
		</div>
	)
}

// function TableHead() {
//     return (
//         <thead>
//             <tr className="bg-[var(--color-background)] border-b rounded-sm">
//                 <th className="text-left p-2">Date</th>
//                 <th className="text-left p-2">Truck</th>
//                 <th className="text-left p-2">Trailer</th>
//                 <th className="text-left p-2">Defects</th>
//             </tr>
//         </thead>
//     );
// }

// function TableBody({ selectedTrips, driverEmail }: { selectedTrips: Trip[], driverEmail: string }) {
//     return (
//         <tbody className='rounded-sm'>
//             {selectedTrips?.map((trip: Trip, index: number) => (
//                 <tr key={index} className="border">
//                     <td className="p-2 w-2/6">
//                         <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
//                             {new Date(trip.date).toLocaleString('en-CA', { dateStyle: 'short', timeStyle: 'short' })}
//                         </Link>
//                     </td>
//                     <td className="p-2">
//                         <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
//                             {trip.truckplate}
//                         </Link>
//                     </td>
//                     <td className="p-2">
//                         <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
//                             {trip.trailerplatea}
//                         </Link>
//                     </td>
//                     <td className="p-2">
//                         <Link href={`/pretrip/${trip.tripid}/${driverEmail}`}>
//                             {trip.defects ? trip.defects : 'No defects'}
//                         </Link>
//                     </td>
//                 </tr>
//             ))}
//         </tbody>
//     );
// }

// function useSelectedTrips(
//     currentTrips: Trip[] | undefined,
//     pastTrips: Trip[] | undefined,
//     selectedTripsName: 'Current' | 'Past'
// ) {
//     const [selectedTrips, setSelectedTrips] = useState<Trip[]>([]);

//     useEffect(() => {
//         if (selectedTripsName === 'Current' && currentTrips) {
//             setSelectedTrips(currentTrips);
//         } else if (selectedTripsName === 'Past' && pastTrips) {
//             setSelectedTrips(pastTrips);
//         }
//     }, [selectedTripsName, currentTrips, pastTrips]);

//     return { selectedTrips, setSelectedTrips };
// }
