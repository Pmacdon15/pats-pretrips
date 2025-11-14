import { Suspense } from 'react'
import DisplayTripsFallback from '@/lib/components/ui/fallbacks/display-trips-fallback'
import AddTrip from '@/lib/components/ui/trips/add-trip/addTrip'
import DisplayTrips from '@/lib/components/ui/trips/display-trips/DisplayTrips'
import TripsTable from '@/lib/components/ui/trips/display-trips/trips-table'
import { fetchCurrentTrips, fetchPastTrips } from '@/lib/DAL/trips'

export default function Page() {
	const currentTripsPromise = fetchCurrentTrips()
	const pastTripsPromise = fetchPastTrips()
	return (
		<div className="flex flex-col items-center justify-items-center gap-4 p-4">
			<AddTrip />
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
