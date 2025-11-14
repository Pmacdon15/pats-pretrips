import { Suspense } from 'react'
import DisplayTripsFallback from '@/components/fallbacks/display-trips-fallback'
import AddTripContainer from '@/components/trips/add-trip/addTripContainer'
import DisplayTrips from '@/components/trips/display-trips/DisplayTrips'
import TripsTable from '@/components/trips/display-trips/trips-table'
import { fetchCurrentTrips, fetchPastTrips } from '@/lib/DAL/trips'

export default function Page(props: PageProps<'/pretrips'>) {
	const currentTripsPromise = props.searchParams.then((search) =>
		fetchCurrentTrips(Number(search.page) || 1),
	)
	const pastTripsPromise = props.searchParams.then((search) =>
		fetchPastTrips(Number(search.page) || 1),
	)

	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<AddTripContainer />
			<Suspense fallback={<DisplayTripsFallback />}>
				<DisplayTrips
					currentTripsComponent={
						<TripsTable tripsPromise={currentTripsPromise} />
					}
					pastTripsComponent={
						<TripsTable tripsPromise={pastTripsPromise} />
					}
				/>
			</Suspense>
		</div>
	)
}
